// Clerk auth removed — ÍRIS is open access (academic project for I2A2 InsurMinds RAG course)
import { useWorkflowWorker } from '@repo/ai/worker';
import { ChatMode, ChatModeConfig } from '@repo/shared/config';
import { ThreadItem } from '@repo/shared/types';
import { buildCoreMessagesFromThreadItems, plausible } from '@repo/shared/utils';
import { nanoid } from 'nanoid';
import { useParams } from 'next/navigation';
import { createContext, ReactNode, useCallback, useContext, useMemo } from 'react';
import { useApiKeysStore, useChatStore, useMcpToolsStore } from '../store';

export type AgentContextType = {
    runAgent: (body: any) => Promise<void>;
    handleSubmit: (args: {
        formData: FormData;
        newThreadId?: string;
        existingThreadItemId?: string;
        newChatMode?: string;
        messages?: ThreadItem[];
        useWebSearch?: boolean;
        showSuggestions?: boolean;
    }) => Promise<void>;
    updateContext: (threadId: string, data: any) => void;
};

const AgentContext = createContext<AgentContextType | undefined>(undefined);

export const AgentProvider = ({ children }: { children: ReactNode }) => {
    const { threadId: currentThreadId } = useParams();

    const {
        updateThreadItem,
        setIsGenerating,
        setAbortController,
        createThreadItem,
        setCurrentThreadItem,
        setCurrentSources,
        updateThread,
        chatMode,
        fetchRemainingCredits,
        customInstructions,
    } = useChatStore(state => ({
        updateThreadItem: state.updateThreadItem,
        setIsGenerating: state.setIsGenerating,
        setAbortController: state.setAbortController,
        createThreadItem: state.createThreadItem,
        setCurrentThreadItem: state.setCurrentThreadItem,
        setCurrentSources: state.setCurrentSources,
        updateThread: state.updateThread,
        chatMode: state.chatMode,
        fetchRemainingCredits: state.fetchRemainingCredits,
        customInstructions: state.customInstructions,
    }));

    const getSelectedMCP = useMcpToolsStore(state => state.getSelectedMCP);
    const apiKeys = useApiKeysStore(state => state.getAllKeys);
    const hasApiKeyForChatMode = useApiKeysStore(state => state.hasApiKeyForChatMode);

    // In-memory store for thread items
    const threadItemMap = useMemo(() => new Map<string, ThreadItem>(), []);

    // Define common event types to reduce repetition
    const EVENT_TYPES = [
        'steps',
        'sources',
        'answer',
        'error',
        'status',
        'suggestions',
        'toolCalls',
        'toolResults',
        'object',
    ];

    // Helper: Update in-memory and store thread item
    const handleThreadItemUpdate = useCallback(
        (
            threadId: string,
            threadItemId: string,
            eventType: string,
            eventData: any,
            parentThreadItemId?: string,
            shouldPersistToDB: boolean = true
        ) => {
            console.log(
                'handleThreadItemUpdate',
                threadItemId,
                eventType,
                eventData,
                shouldPersistToDB
            );
            const prevItem = threadItemMap.get(threadItemId) || ({} as ThreadItem);
            const updatedItem: ThreadItem = {
                ...prevItem,
                query: eventData?.query || prevItem.query || '',
                mode: eventData?.mode || prevItem.mode,
                threadId,
                parentId: parentThreadItemId || prevItem.parentId,
                id: threadItemId,
                object: eventData?.object || prevItem.object,
                createdAt: prevItem.createdAt || new Date(),
                updatedAt: new Date(),
                ...(eventType === 'answer'
                    ? {
                          answer: {
                              ...eventData.answer,
                              text: (prevItem.answer?.text || '') + eventData.answer.text,
                          },
                      }
                    : { [eventType]: eventData[eventType] }),
            };

            threadItemMap.set(threadItemId, updatedItem);
            updateThreadItem(threadId, { ...updatedItem, persistToDB: true });
        },
        [threadItemMap, updateThreadItem]
    );

    const { startWorkflow, abortWorkflow } = useWorkflowWorker(
        useCallback(
            (data: any) => {
                if (
                    data?.threadId &&
                    data?.threadItemId &&
                    data.event &&
                    EVENT_TYPES.includes(data.event)
                ) {
                    handleThreadItemUpdate(
                        data.threadId,
                        data.threadItemId,
                        data.event,
                        data,
                        data.parentThreadItemId
                    );
                }

                if (data.type === 'done') {
                    setIsGenerating(false);
                    setTimeout(fetchRemainingCredits, 1000);
                    if (data?.threadItemId) {
                        threadItemMap.delete(data.threadItemId);
                    }
                }
            },
            [handleThreadItemUpdate, setIsGenerating, fetchRemainingCredits, threadItemMap]
        )
    );

    const runAgent = useCallback(
        async (body: any) => {
            const abortController = new AbortController();
            setAbortController(abortController);
            setIsGenerating(true);
            const startTime = performance.now();

            abortController.signal.addEventListener('abort', () => {
                console.info('Abort controller triggered');
                setIsGenerating(false);
                updateThreadItem(body.threadId, {
                    id: body.threadItemId,
                    status: 'ABORTED',
                    persistToDB: true,
                });
            });

            // Build history array for /api/chat from coreMessages
            const history: Array<{ role: 'user' | 'assistant'; content: string }> = (
                body.messages || []
            )
                .filter(
                    (m: any) =>
                        (m.role === 'user' || m.role === 'assistant') &&
                        typeof m.content === 'string'
                )
                .map((m: any) => ({ role: m.role as 'user' | 'assistant', content: m.content }))
                .slice(-12);

            try {
                const response = await fetch('/api/chat', {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({
                        message: body.prompt || body.question || '',
                        threadId: body.threadId,
                        threadItemId: body.threadItemId,
                        history,
                    }),
                    signal: abortController.signal,
                });

                if (!response.ok) {
                    let errorText = await response.text();

                    if (response.status === 429) {
                        errorText =
                            'Limite de requisições atingido. Aguarde um momento.';
                    }

                    setIsGenerating(false);
                    updateThreadItem(body.threadId, {
                        id: body.threadItemId,
                        status: 'ERROR',
                        error: errorText,
                        persistToDB: true,
                    });
                    console.error('Error response:', errorText);
                    return;
                }

                if (!response.body) {
                    throw new Error('No response body received');
                }

                const reader = response.body.getReader();
                const dec = new TextDecoder();
                let buf = '';
                let currentEvent = '';
                let lastDbUpdate = Date.now();
                const DB_UPDATE_INTERVAL = 1000;
                const streamStartTime = performance.now();

                while (true) {
                    try {
                        const { done, value } = await reader.read();
                        if (done) break;

                        buf += dec.decode(value, { stream: true });
                        const lines = buf.split('\n');
                        buf = lines.pop() ?? '';

                        for (const line of lines) {
                            if (line.startsWith('event: ')) {
                                currentEvent = line.slice(7).trim();
                                continue;
                            }
                            if (!line.startsWith('data: ')) continue;

                            try {
                                const data = JSON.parse(line.slice(6));

                                if (currentEvent === 'token') {
                                    const shouldPersistToDB =
                                        Date.now() - lastDbUpdate >= DB_UPDATE_INTERVAL;
                                    handleThreadItemUpdate(
                                        body.threadId,
                                        body.threadItemId,
                                        'answer',
                                        {
                                            answer: { text: data.content ?? '' },
                                            mode: body.mode,
                                            query: body.prompt || body.question || '',
                                        },
                                        undefined,
                                        shouldPersistToDB
                                    );
                                    if (shouldPersistToDB) {
                                        lastDbUpdate = Date.now();
                                    }
                                } else if (currentEvent === 'sources') {
                                    const chunks: any[] = data.chunks ?? [];
                                    // Store sources on the thread item
                                    updateThreadItem(body.threadId, {
                                        id: body.threadItemId,
                                        sources: chunks.map((c: any, idx: number) => ({
                                            title: c.source ?? `Fonte ${idx + 1}`,
                                            link: c.source ?? '',
                                            index: idx,
                                            snippet: c.text ?? '',
                                        })),
                                    });
                                    // Also update current sources list
                                    setCurrentSources(
                                        chunks.map((c: any) => c.source ?? '').filter(Boolean)
                                    );
                                } else if (currentEvent === 'done') {
                                    const streamDuration = performance.now() - streamStartTime;
                                    console.info(
                                        `ÍRIS stream done in ${streamDuration.toFixed(2)}ms`
                                    );
                                    // Persist final state
                                    updateThreadItem(body.threadId, {
                                        id: body.threadItemId,
                                        status: 'COMPLETED',
                                        persistToDB: true,
                                    });
                                    setIsGenerating(false);
                                    setTimeout(fetchRemainingCredits, 1000);
                                    threadItemMap.delete(body.threadItemId);
                                } else if (currentEvent === 'error') {
                                    const errMsg =
                                        data.message ?? 'Falha na conexão com ÍRIS';
                                    updateThreadItem(body.threadId, {
                                        id: body.threadItemId,
                                        status: 'ERROR',
                                        error: errMsg,
                                        persistToDB: true,
                                    });
                                    setIsGenerating(false);
                                }

                                currentEvent = '';
                            } catch (jsonError) {
                                console.warn('JSON parse error:', line.slice(6), jsonError);
                            }
                        }
                    } catch (readError) {
                        console.error('Error reading from stream:', readError);
                        break;
                    }
                }
            } catch (streamError: any) {
                const totalTime = performance.now() - startTime;
                console.error(
                    'Fatal stream error:',
                    streamError,
                    `Total time: ${totalTime.toFixed(2)}ms`
                );
                setIsGenerating(false);
                if (streamError.name === 'AbortError') {
                    updateThreadItem(body.threadId, {
                        id: body.threadItemId,
                        status: 'ABORTED',
                        error: 'Generation aborted',
                    });
                } else {
                    updateThreadItem(body.threadId, {
                        id: body.threadItemId,
                        status: 'ERROR',
                        error: 'Falha na conexão com ÍRIS. Tente novamente.',
                    });
                }
            } finally {
                setIsGenerating(false);

                const totalTime = performance.now() - startTime;
                console.info(`Stream completed in ${totalTime.toFixed(2)}ms`);
            }
        },
        [
            setAbortController,
            setIsGenerating,
            updateThreadItem,
            handleThreadItemUpdate,
            setCurrentSources,
            fetchRemainingCredits,
            threadItemMap,
        ]
    );

    const handleSubmit = useCallback(
        async ({
            formData,
            newThreadId,
            existingThreadItemId,
            newChatMode,
            messages,
            useWebSearch,
            showSuggestions,
        }: {
            formData: FormData;
            newThreadId?: string;
            existingThreadItemId?: string;
            newChatMode?: string;
            messages?: ThreadItem[];
            useWebSearch?: boolean;
            showSuggestions?: boolean;
        }) => {
            const mode = (newChatMode || chatMode) as ChatMode;

            const threadId = currentThreadId?.toString() || newThreadId;
            if (!threadId) return;

            // Update thread title
            updateThread({ id: threadId, title: formData.get('query') as string });

            const optimisticAiThreadItemId = existingThreadItemId || nanoid();
            const query = formData.get('query') as string;
            const imageAttachment = formData.get('imageAttachment') as string;

            const aiThreadItem: ThreadItem = {
                id: optimisticAiThreadItemId,
                createdAt: new Date(),
                updatedAt: new Date(),
                status: 'QUEUED',
                threadId,
                query,
                imageAttachment,
                mode,
            };

            createThreadItem(aiThreadItem);
            setCurrentThreadItem(aiThreadItem);
            setIsGenerating(true);
            setCurrentSources([]);

            plausible.trackEvent('send_message', {
                props: {
                    mode,
                },
            });

            // Build core messages array
            const coreMessages = buildCoreMessagesFromThreadItems({
                messages: messages || [],
                query,
                imageAttachment,
            });

            if (hasApiKeyForChatMode(mode)) {
                const abortController = new AbortController();
                setAbortController(abortController);
                setIsGenerating(true);

                abortController.signal.addEventListener('abort', () => {
                    console.info('Abort signal received');
                    setIsGenerating(false);
                    abortWorkflow();
                    updateThreadItem(threadId, { id: optimisticAiThreadItemId, status: 'ABORTED' });
                });

                startWorkflow({
                    mode,
                    question: query,
                    threadId,
                    messages: coreMessages,
                    mcpConfig: getSelectedMCP(),
                    threadItemId: optimisticAiThreadItemId,
                    parentThreadItemId: '',
                    customInstructions,
                    apiKeys: apiKeys(),
                });
            } else {
                runAgent({
                    mode: newChatMode || chatMode,
                    prompt: query,
                    threadId,
                    messages: coreMessages,
                    mcpConfig: getSelectedMCP(),
                    threadItemId: optimisticAiThreadItemId,
                    customInstructions,
                    parentThreadItemId: '',
                    webSearch: useWebSearch,
                    showSuggestions: showSuggestions ?? true,
                });
            }
        },
        [
            currentThreadId,
            chatMode,
            updateThread,
            createThreadItem,
            setCurrentThreadItem,
            setIsGenerating,
            setCurrentSources,
            abortWorkflow,
            startWorkflow,
            customInstructions,
            getSelectedMCP,
            apiKeys,
            hasApiKeyForChatMode,
            updateThreadItem,
            runAgent,
        ]
    );

    const updateContext = useCallback(
        (threadId: string, data: any) => {
            console.info('Updating context', data);
            updateThreadItem(threadId, {
                id: data.threadItemId,
                parentId: data.parentThreadItemId,
                threadId: data.threadId,
                metadata: data.context,
            });
        },
        [updateThreadItem]
    );

    const contextValue = useMemo(
        () => ({
            runAgent,
            handleSubmit,
            updateContext,
        }),
        [runAgent, handleSubmit, updateContext]
    );

    return <AgentContext.Provider value={contextValue}>{children}</AgentContext.Provider>;
};

export const useAgentStream = (): AgentContextType => {
    const context = useContext(AgentContext);
    if (!context) {
        throw new Error('useAgentStream must be used within an AgentProvider');
    }
    return context;
};

'use client';
import { create } from 'zustand';
import { persist } from 'zustand/middleware';

export type Provider = 'ollama' | 'openai' | 'anthropic';

export const OLLAMA_MODELS = [
    { id: 'iris-mistral', label: 'ÍRIS Mistral 7B (fine-tuned)', isDefault: true },
    { id: 'mistral:7b-instruct', label: 'Mistral 7B Instruct (base)', isDefault: false },
] as const;

export const PROVIDER_LABELS: Record<Provider, string> = {
    ollama: 'Ollama Local',
    openai: 'OpenAI',
    anthropic: 'Anthropic',
};

type ProviderState = {
    selectedProvider: Provider;
    selectedModel: string;
    ollamaBaseUrl: string;
    setSelectedProvider: (provider: Provider) => void;
    setSelectedModel: (model: string) => void;
    setOllamaBaseUrl: (url: string) => void;
};

export const useProviderStore = create<ProviderState>()(
    persist(
        set => ({
            selectedProvider: 'ollama',
            selectedModel: 'iris-mistral',
            ollamaBaseUrl: 'http://localhost:11434',
            setSelectedProvider: (provider) => set({ selectedProvider: provider }),
            setSelectedModel: (model) => set({ selectedModel: model }),
            setOllamaBaseUrl: (url) => set({ ollamaBaseUrl: url }),
        }),
        { name: 'iris-provider-storage' }
    )
);

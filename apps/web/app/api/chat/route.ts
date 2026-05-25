import { NextRequest } from 'next/server';
import { z } from 'zod';
import { getCorpus, search, buildPrompt } from '@repo/rag';
import { ollamaEmbed, ollamaStream } from '@repo/ai/ollama-client';
import { checkRateLimit, getClientKey } from './rate-limit';

const OLLAMA_BASE_URL  = process.env.OLLAMA_BASE_URL  ?? 'http://localhost:11434';
const OLLAMA_MODEL     = process.env.OLLAMA_MODEL     ?? 'mistral:7b-instruct';
const EMBED_MODEL      = process.env.OLLAMA_EMBED_MODEL ?? 'bge-m3';

const schema = z.object({
  message:     z.string().min(1).max(2000),
  threadId:    z.string().min(1),
  threadItemId: z.string().min(1),
  model:       z.string().min(1).optional(),
  ollamaBaseUrl: z.string().url().optional(),
  history: z.array(z.object({
    role:    z.enum(['user', 'assistant']),
    content: z.string().max(4000),
  })).max(12).default([]),
});

const SSE_HEADERS = {
  'Content-Type': 'text/event-stream',
  'Cache-Control': 'no-cache, no-transform',
  'Connection': 'keep-alive',
  'X-Accel-Buffering': 'no',
} as const;

function sse(event: string, data: unknown): string {
  return `event: ${event}\ndata: ${JSON.stringify(data)}\n\n`;
}

export async function POST(request: NextRequest): Promise<Response> {
  if (!checkRateLimit(getClientKey(request))) {
    return Response.json({ error: 'Muitas requisições. Aguarde.' }, { status: 429 });
  }

  const parsed = schema.safeParse(await request.json().catch(() => ({})));
  if (!parsed.success) {
    return Response.json({ error: 'Requisição inválida', details: parsed.error.format() }, { status: 400 });
  }

  const { message, threadId, threadItemId, history, model, ollamaBaseUrl: reqBaseUrl } = parsed.data;
  const effectiveModel   = model       ?? OLLAMA_MODEL;
  const effectiveBaseUrl = reqBaseUrl  ?? OLLAMA_BASE_URL;
  const abort = new AbortController();
  request.signal.addEventListener('abort', () => abort.abort());

  const stream = new ReadableStream({
    async start(ctrl) {
      const enc = new TextEncoder();
      const send = (event: string, data: unknown) => ctrl.enqueue(enc.encode(sse(event, data)));

      try {
        const queryEmb = await ollamaEmbed(message, { baseUrl: effectiveBaseUrl, model: EMBED_MODEL });
        const corpus   = await getCorpus();
        const results  = search(queryEmb, corpus, 5);

        send('sources', {
          chunks: results.map(r => ({
            text:      r.chunk.text.slice(0, 300),
            source:    r.chunk.metadata.source,
            page:      r.chunk.metadata.page,
            score:     parseFloat(r.score.toFixed(3)),
            authority: r.chunk.metadata.authority,
          })),
        });

        const { messages } = buildPrompt({ message, history, searchResults: results });

        for await (const token of ollamaStream(
          messages as Array<{ role: 'system'|'user'|'assistant'; content: string }>,
          { baseUrl: effectiveBaseUrl, model: effectiveModel },
          abort.signal
        )) {
          send('token', { content: token });
        }

        send('done', { threadId, threadItemId });
      } catch (err) {
        if (!abort.signal.aborted) {
          send('error', { message: err instanceof Error ? err.message : 'Erro desconhecido' });
        }
      } finally {
        ctrl.close();
      }
    },
    cancel() { abort.abort(); },
  });

  return new Response(stream, { headers: SSE_HEADERS });
}

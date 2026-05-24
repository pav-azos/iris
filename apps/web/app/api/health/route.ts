import { existsSync, readFileSync } from 'fs';
import { join } from 'path';
import type { Corpus } from '@repo/rag';

const OLLAMA_BASE_URL  = process.env.OLLAMA_BASE_URL  ?? 'http://localhost:11434';
const OLLAMA_MODEL     = process.env.OLLAMA_MODEL     ?? 'mistral:7b-instruct';
const EMBED_MODEL      = process.env.OLLAMA_EMBED_MODEL ?? 'bge-m3';
const CORPUS_PATH      = process.env.CORPUS_PATH ?? join(process.cwd(), 'data/corpus.json');

async function probeOllama(): Promise<'ok' | 'offline'> {
  try {
    const res = await fetch(`${OLLAMA_BASE_URL}/api/tags`, { signal: AbortSignal.timeout(3000) });
    return res.ok ? 'ok' : 'offline';
  } catch { return 'offline'; }
}

async function probeEmbedder(): Promise<'ok' | 'failed'> {
  try {
    const res = await fetch(`${OLLAMA_BASE_URL}/api/embeddings`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ model: EMBED_MODEL, prompt: 'healthcheck' }),
      signal: AbortSignal.timeout(5000),
    });
    if (!res.ok) return 'failed';
    const data = (await res.json()) as { embedding: number[] };
    return data.embedding?.length === 1024 ? 'ok' : 'failed';
  } catch { return 'failed'; }
}

function probeCorpus() {
  if (!existsSync(CORPUS_PATH)) return { status: 'missing' as const, chunks: 0, indexedAt: null };
  try {
    const c = JSON.parse(readFileSync(CORPUS_PATH, 'utf-8')) as Corpus;
    if (c.header.embedModel !== EMBED_MODEL || c.header.dim !== 1024) {
      return { status: 'mismatch' as const, chunks: c.chunks.length, indexedAt: c.header.indexedAt };
    }
    return { status: 'indexed' as const, chunks: c.chunks.length, indexedAt: c.header.indexedAt };
  } catch { return { status: 'missing' as const, chunks: 0, indexedAt: null }; }
}

export async function GET() {
  const [ollama, embedder] = await Promise.all([probeOllama(), probeEmbedder()]);
  const { status: corpus, chunks, indexedAt } = probeCorpus();

  return Response.json({ ollama, model: OLLAMA_MODEL, embedModel: EMBED_MODEL, embedder, corpus, chunks, indexedAt });
}

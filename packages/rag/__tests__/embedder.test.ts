import { describe, it, expect, mock, beforeEach } from 'bun:test';
import { embedText, embedTexts } from '../embedder';
import type { EmbedConfig } from '../types';

const config: EmbedConfig = { baseUrl: 'http://localhost:11434', model: 'bge-m3' };

const mockFetch = mock(async (_url: string, init?: RequestInit) => {
  return {
    ok: true,
    json: async () => ({ embedding: new Array(1024).fill(0.1) }),
  } as Response;
});

beforeEach(() => {
  global.fetch = mockFetch as unknown as typeof fetch;
  mockFetch.mockClear();
});

describe('embedText', () => {
  it('calls Ollama /api/embeddings with model and prompt', async () => {
    await embedText('test input', config);
    expect(mockFetch).toHaveBeenCalledWith(
      'http://localhost:11434/api/embeddings',
      expect.objectContaining({ method: 'POST' })
    );
  });

  it('returns 1024-dimension embedding', async () => {
    const emb = await embedText('test', config);
    expect(emb).toHaveLength(1024);
  });

  it('throws on non-ok response', async () => {
    global.fetch = mock(async () => ({ ok: false, status: 500 } as Response)) as unknown as typeof fetch;
    await expect(embedText('test', config)).rejects.toThrow('Ollama embed failed: 500');
  });
});

describe('embedTexts', () => {
  it('returns array matching input length', async () => {
    const results = await embedTexts(['a', 'b', 'c'], config);
    expect(results).toHaveLength(3);
    results.forEach(e => expect(e).toHaveLength(1024));
  });

  it('calls fetch once per text', async () => {
    await embedTexts(['a', 'b'], config);
    expect(mockFetch).toHaveBeenCalledTimes(2);
  });
});

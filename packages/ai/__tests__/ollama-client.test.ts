import { describe, it, expect, mock, beforeEach } from 'bun:test';
import { ollamaEmbed, ollamaStream } from '../ollama-client';

const mockFetch = mock();

beforeEach(() => {
  global.fetch = mockFetch as unknown as typeof fetch;
  mockFetch.mockClear();
});

describe('ollamaEmbed', () => {
  it('returns 1024d embedding', async () => {
    mockFetch.mockResolvedValueOnce({
      ok: true,
      json: async () => ({ embedding: new Array(1024).fill(0.5) }),
    } as Response);

    const result = await ollamaEmbed('test', { baseUrl: 'http://localhost:11434', model: 'bge-m3' });
    expect(result).toHaveLength(1024);
  });

  it('retries once on 503 then succeeds', async () => {
    mockFetch
      .mockResolvedValueOnce({ ok: false, status: 503 } as Response)
      .mockResolvedValueOnce({ ok: true, json: async () => ({ embedding: new Array(1024).fill(0.1) }) } as Response);

    const result = await ollamaEmbed('test', { baseUrl: 'http://localhost:11434', model: 'bge-m3' });
    expect(mockFetch).toHaveBeenCalledTimes(2);
    expect(result).toHaveLength(1024);
  });
});

describe('ollamaStream', () => {
  it('yields tokens from streaming response', async () => {
    const lines = [
      JSON.stringify({ message: { content: 'Hello' }, done: false }),
      JSON.stringify({ message: { content: ' world' }, done: false }),
      JSON.stringify({ done: true }),
    ].join('\n');

    mockFetch.mockResolvedValueOnce({
      ok: true,
      body: new ReadableStream({
        start(c) {
          c.enqueue(new TextEncoder().encode(lines));
          c.close();
        },
      }),
    } as Response);

    const tokens: string[] = [];
    for await (const t of ollamaStream(
      [{ role: 'user', content: 'hi' }],
      { baseUrl: 'http://localhost:11434', model: 'mistral:7b-instruct' }
    )) {
      tokens.push(t);
    }
    expect(tokens).toEqual(['Hello', ' world']);
  });
});

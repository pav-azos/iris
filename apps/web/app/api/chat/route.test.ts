import { describe, it, expect, mock } from 'bun:test';

mock.module('@repo/rag', () => ({
  getCorpus: async () => ({ header: { embedModel: 'bge-m3', dim: 1024, version: 1, indexedAt: '' }, chunks: [] }),
  search: () => [],
  buildPrompt: () => ({ messages: [{ role: 'system', content: 'sys' }, { role: 'user', content: 'hi' }] }),
}));

mock.module('@repo/ai/ollama-client', () => ({
  ollamaEmbed: async () => new Array(1024).fill(0.1),
  ollamaStream: async function* () { yield 'Olá'; yield '!'; },
}));

const body = {
  message: 'O que é aceitação tácita?',
  threadId: '123e4567-e89b-12d3-a456-426614174000',
  threadItemId: '123e4567-e89b-12d3-a456-426614174001',
  history: [],
};

describe('POST /api/chat', () => {
  it('returns 400 for empty message', async () => {
    const { POST } = await import('./route');
    const req = new Request('http://localhost/api/chat', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ ...body, message: '' }),
    });
    expect((await POST(req as any)).status).toBe(400);
  });

  it('returns SSE stream for valid request', async () => {
    const { POST } = await import('./route');
    const req = new Request('http://localhost/api/chat', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'x-real-ip': '10.0.0.1' },
      body: JSON.stringify(body),
    });
    const res = await POST(req as any);
    expect(res.status).toBe(200);
    expect(res.headers.get('content-type')).toContain('text/event-stream');
  });

  it('SSE order: sources -> token -> done', async () => {
    const { POST } = await import('./route');
    const req = new Request('http://localhost/api/chat', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'x-real-ip': '10.0.0.2' },
      body: JSON.stringify(body),
    });
    const text = await (await POST(req as any)).text();
    const si = text.indexOf('event: sources');
    const ti = text.indexOf('event: token');
    const di = text.indexOf('event: done');
    expect(si).toBeGreaterThanOrEqual(0);
    expect(ti).toBeGreaterThan(si);
    expect(di).toBeGreaterThan(ti);
  });
});

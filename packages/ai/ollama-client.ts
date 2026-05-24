const RETRY_DELAY_MS = 800;

export interface OllamaEmbedConfig {
  baseUrl: string;
  model: string;
}

export interface OllamaStreamConfig {
  baseUrl: string;
  model: string;
}

export interface OllamaChatMessage {
  role: 'system' | 'user' | 'assistant';
  content: string;
}

async function fetchWithRetry(
  url: string,
  init: RequestInit,
  retries = 1
): Promise<Response> {
  const res = await fetch(url, init);
  if (!res.ok && res.status === 503 && retries > 0) {
    await new Promise(r => setTimeout(r, RETRY_DELAY_MS));
    return fetchWithRetry(url, init, retries - 1);
  }
  return res;
}

export async function ollamaEmbed(
  text: string,
  config: OllamaEmbedConfig
): Promise<number[]> {
  const res = await fetchWithRetry(`${config.baseUrl}/api/embeddings`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ model: config.model, prompt: text }),
  });
  if (!res.ok) throw new Error(`Ollama embed failed: ${res.status}`);
  const data = (await res.json()) as { embedding: number[] };
  return data.embedding;
}

export async function* ollamaStream(
  messages: OllamaChatMessage[],
  config: OllamaStreamConfig,
  signal?: AbortSignal
): AsyncGenerator<string> {
  const res = await fetchWithRetry(`${config.baseUrl}/api/chat`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ model: config.model, messages, stream: true }),
    signal,
  });
  if (!res.ok) throw new Error(`Ollama stream failed: ${res.status}`);
  if (!res.body) throw new Error('No response body from Ollama');

  const reader = res.body.getReader();
  const dec = new TextDecoder();
  let buffer = '';

  while (true) {
    const { done, value } = await reader.read();
    if (done) break;
    buffer += dec.decode(value, { stream: true });
    const lines = buffer.split('\n');
    buffer = lines.pop() ?? '';

    for (const line of lines) {
      const trimmed = line.trim();
      if (!trimmed) continue;
      try {
        const parsed = JSON.parse(trimmed) as {
          message?: { content: string };
          done: boolean;
        };
        if (parsed.done) return;
        if (parsed.message?.content) yield parsed.message.content;
      } catch {
        /* skip malformed line */
      }
    }
  }
}

import type { EmbedConfig } from './types';

export async function embedText(text: string, config: EmbedConfig): Promise<number[]> {
  const res = await fetch(`${config.baseUrl}/api/embeddings`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ model: config.model, prompt: text }),
  });
  if (!res.ok) throw new Error(`Ollama embed failed: ${res.status}`);
  const data = (await res.json()) as { embedding: number[] };
  return data.embedding;
}

export async function embedTexts(texts: string[], config: EmbedConfig): Promise<number[][]> {
  const results: number[][] = [];
  for (const text of texts) {
    results.push(await embedText(text, config));
  }
  return results;
}

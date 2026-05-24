import type { Corpus, SearchResult } from './types';

const AUTHORITY_BIAS = { law: 1.2, official: 1.1, 'third-party': 1.0 } as const;

export function cosineSimilarity(a: number[], b: number[]): number {
  let dot = 0, normA = 0, normB = 0;
  for (let i = 0; i < a.length; i++) {
    dot   += a[i] * b[i];
    normA += a[i] * a[i];
    normB += b[i] * b[i];
  }
  if (normA === 0 || normB === 0) return 0;
  return dot / (Math.sqrt(normA) * Math.sqrt(normB));
}

export function search(
  queryEmbedding: number[],
  corpus: Corpus,
  topK = 5
): SearchResult[] {
  return corpus.chunks
    .map(chunk => ({
      chunk,
      score: cosineSimilarity(queryEmbedding, chunk.embedding) * AUTHORITY_BIAS[chunk.metadata.authority],
    }))
    .sort((a, b) => b.score - a.score)
    .slice(0, topK);
}

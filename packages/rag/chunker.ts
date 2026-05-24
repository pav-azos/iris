import { randomUUID } from 'crypto';
import type { RawChunk, Authority } from './types';

const MAX_CHARS = 1920;    // ~400 tokens at ~4.8 chars/token with 20% margin
const OVERLAP_CHARS = 256; // ~64 token overlap

export function chunkTextWindow(
  text: string,
  source: string,
  authority: Authority,
  page: number
): RawChunk[] {
  const trimmed = text.trim();
  if (!trimmed) return [];

  if (trimmed.length <= MAX_CHARS) {
    return [{
      id: randomUUID(),
      text: trimmed,
      metadata: { source, page, authority },
    }];
  }

  const chunks: RawChunk[] = [];
  let start = 0;

  while (start < trimmed.length) {
    const end = Math.min(start + MAX_CHARS, trimmed.length);
    const chunkText = trimmed.slice(start, end).trim();
    if (chunkText) {
      chunks.push({
        id: randomUUID(),
        text: chunkText,
        metadata: { source, page, authority },
      });
    }
    if (end === trimmed.length) break;
    start = end - OVERLAP_CHARS;
  }

  return chunks;
}

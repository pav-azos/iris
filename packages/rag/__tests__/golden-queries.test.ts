import { describe, it, expect, beforeAll } from 'bun:test';
import { existsSync, readFileSync } from 'fs';
import { join } from 'path';
import { search } from '../searcher';
import { embedText } from '../embedder';
import type { Corpus } from '../types';
import { GOLDEN_QUERIES } from './fixtures/golden';

const CORPUS_PATH = join(process.cwd(), 'apps/web/data/corpus.json');
const OLLAMA_URL  = process.env.OLLAMA_BASE_URL ?? 'http://localhost:11434';
const EMBED_MODEL = process.env.OLLAMA_EMBED_MODEL ?? 'bge-m3';
const HAS_CORPUS  = existsSync(CORPUS_PATH);

describe.skipIf(!HAS_CORPUS)('Golden query retrieval — Lei 15.040 (integration)', () => {
  let corpus: Corpus;
  beforeAll(() => { corpus = JSON.parse(readFileSync(CORPUS_PATH, 'utf-8')); });

  for (const { query, expectedSourceFile, expectedContains } of GOLDEN_QUERIES) {
    it(`"${query.slice(0, 50)}"`, async () => {
      const emb     = await embedText(query, { baseUrl: OLLAMA_URL, model: EMBED_MODEL });
      const results = search(emb, corpus, 3);
      const hit     = results.some(
        r => r.chunk.metadata.source.includes(expectedSourceFile) ||
             r.chunk.text.toLowerCase().includes(expectedContains.toLowerCase())
      );
      if (!hit) console.warn(`[MISS] "${query}" top: ${results.map(r=>r.chunk.metadata.source).join(', ')}`);
      expect(hit).toBe(true);
    }, 15_000);
  }
});

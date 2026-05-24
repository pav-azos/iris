import { readFileSync } from 'fs';
import { join } from 'path';
import type { Corpus } from './types';

function corpusPath(): string {
  return process.env.CORPUS_PATH ?? join(process.cwd(), 'apps/web/data/corpus.json');
}

// Module-level singleton: one Promise shared across all concurrent requests
let corpusPromise: Promise<Corpus> | null = null;

export function getCorpus(): Promise<Corpus> {
  if (!corpusPromise) {
    corpusPromise = Promise.resolve().then(() => {
      const raw = readFileSync(corpusPath(), 'utf-8');
      return JSON.parse(raw) as Corpus;
    });
  }
  return corpusPromise;
}

/** Reset singleton — use in tests only */
export function resetCorpusCache(): void {
  corpusPromise = null;
}

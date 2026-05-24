import { describe, it, expect, beforeEach, afterEach } from 'bun:test';
import { writeFileSync, mkdirSync, rmSync } from 'fs';
import { join } from 'path';
import type { Corpus } from '../types';

const TEST_DIR = join(process.cwd(), '__test_corpus_tmp__');

const validCorpus: Corpus = {
  header: { embedModel: 'bge-m3', dim: 1024, version: 1, indexedAt: new Date().toISOString() },
  chunks: [
    { id: '1', text: 'hello', embedding: new Array(1024).fill(0.1), metadata: { source: 'test.pdf', page: 1, authority: 'law' } },
  ],
};

beforeEach(() => {
  mkdirSync(TEST_DIR, { recursive: true });
  process.env.CORPUS_PATH = join(TEST_DIR, 'corpus.json');
});

afterEach(async () => {
  rmSync(TEST_DIR, { recursive: true, force: true });
  delete process.env.CORPUS_PATH;
  // Reset module cache so singleton is cleared between tests
  const { resetCorpusCache } = await import('../corpus-loader');
  resetCorpusCache();
});

describe('getCorpus', () => {
  it('loads and parses valid corpus.json', async () => {
    writeFileSync(process.env.CORPUS_PATH!, JSON.stringify(validCorpus));
    const { getCorpus } = await import('../corpus-loader');
    const corpus = await getCorpus();
    expect(corpus.header.embedModel).toBe('bge-m3');
    expect(corpus.chunks).toHaveLength(1);
  });

  it('returns same object on concurrent calls (singleton)', async () => {
    writeFileSync(process.env.CORPUS_PATH!, JSON.stringify(validCorpus));
    const { getCorpus } = await import('../corpus-loader');
    const [a, b] = await Promise.all([getCorpus(), getCorpus()]);
    expect(a).toBe(b);
  });

  it('throws when corpus.json is missing', async () => {
    const { getCorpus } = await import('../corpus-loader');
    await expect(getCorpus()).rejects.toThrow();
  });
});

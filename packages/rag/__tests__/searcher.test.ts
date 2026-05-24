import { describe, it, expect } from 'bun:test';
import { cosineSimilarity, search } from '../searcher';
import type { Corpus } from '../types';

function makeVec(seed: number): number[] {
  const v = new Array(1024).fill(0);
  v[seed % 1024] = 1.0;
  return v;
}

const corpus: Corpus = {
  header: { embedModel: 'bge-m3', dim: 1024, version: 1, indexedAt: '' },
  chunks: [
    { id: '1', text: 'Lei', embedding: makeVec(0), metadata: { source: 'L15040.pdf', page: 1, authority: 'law' } },
    { id: '2', text: 'FAQ', embedding: makeVec(1), metadata: { source: 'FAQ.pdf', page: 1, authority: 'official' } },
    { id: '3', text: 'PWC', embedding: makeVec(2), metadata: { source: 'PWC.pdf', page: 1, authority: 'third-party' } },
    { id: '4', text: 'Lei2', embedding: makeVec(0), metadata: { source: 'L15040.pdf', page: 2, authority: 'law' } },
    { id: '5', text: 'FAQ2', embedding: makeVec(1), metadata: { source: 'FAQ.pdf', page: 2, authority: 'official' } },
    { id: '6', text: 'Lei3', embedding: makeVec(0), metadata: { source: 'L15040.pdf', page: 3, authority: 'law' } },
  ],
};

describe('cosineSimilarity', () => {
  it('returns 1.0 for identical vectors', () => {
    const v = makeVec(5);
    expect(cosineSimilarity(v, v)).toBeCloseTo(1.0, 5);
  });

  it('returns 0 for orthogonal vectors', () => {
    expect(cosineSimilarity(makeVec(0), makeVec(1))).toBeCloseTo(0, 5);
  });
});

describe('search', () => {
  it('returns top-k results', () => {
    expect(search(makeVec(0), corpus, 3)).toHaveLength(3);
  });

  it('sorts by score descending', () => {
    const results = search(makeVec(0), corpus, 5);
    for (let i = 1; i < results.length; i++) {
      expect(results[i - 1].score).toBeGreaterThanOrEqual(results[i].score);
    }
  });

  it('authority bias: law beats third-party at same cosine', () => {
    // makeVec(0) matches id 1,4,6 (all law) with cosine=1
    const results = search(makeVec(0), corpus, 3);
    results.forEach(r => expect(r.chunk.metadata.authority).toBe('law'));
  });

  it('includes numeric score in each result', () => {
    search(makeVec(0), corpus, 3).forEach(r => {
      expect(typeof r.score).toBe('number');
      expect(r.score).toBeGreaterThan(0);
    });
  });
});

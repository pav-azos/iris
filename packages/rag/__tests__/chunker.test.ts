import { describe, it, expect } from 'bun:test';
import { chunkTextWindow } from '../chunker';

describe('chunkTextWindow', () => {
  it('returns single chunk for short text', () => {
    const text = 'Short text under the limit.';
    const chunks = chunkTextWindow(text, 'test.pdf', 'law', 1);
    expect(chunks).toHaveLength(1);
    expect(chunks[0].text).toBe(text);
    expect(chunks[0].metadata.source).toBe('test.pdf');
    expect(chunks[0].metadata.page).toBe(1);
    expect(chunks[0].metadata.authority).toBe('law');
    expect(chunks[0].id).toBeTruthy();
  });

  it('splits long text into overlapping chunks', () => {
    const longText = 'A'.repeat(4000);
    const chunks = chunkTextWindow(longText, 'test.pdf', 'law', 2);
    expect(chunks.length).toBeGreaterThan(1);
    chunks.forEach(c => expect(c.text.length).toBeLessThanOrEqual(1920));
  });

  it('chunks overlap correctly', () => {
    const longText = 'X'.repeat(3000);
    const chunks = chunkTextWindow(longText, 'test.pdf', 'official', 1);
    if (chunks.length >= 2) {
      const endOfFirst = chunks[0].text.slice(-200);
      expect(chunks[1].text.startsWith(endOfFirst.slice(0, 100))).toBe(true);
    }
  });

  it('assigns unique ids', () => {
    const text = 'B'.repeat(5000);
    const chunks = chunkTextWindow(text, 'test.pdf', 'third-party', 1);
    const ids = chunks.map(c => c.id);
    expect(new Set(ids).size).toBe(ids.length);
  });
});

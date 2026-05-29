import { describe, it, expect } from 'bun:test';
import { chunkText, formatQAPairs } from '../extract-web-qa';

describe('chunkText', () => {
  it('splits long text into chunks under maxChars', () => {
    const text = 'A'.repeat(5000);
    const chunks = chunkText(text, 2000);
    expect(chunks.length).toBeGreaterThan(1);
    for (const c of chunks) expect(c.length).toBeLessThanOrEqual(2100);
  });

  it('returns single chunk for short text', () => {
    const text = 'Short paragraph.\n\nAnother short one.';
    const chunks = chunkText(text, 2000);
    expect(chunks.length).toBe(1);
  });

  it('preserves non-empty content', () => {
    const text = 'Para 1.\n\nPara 2.\n\nPara 3.';
    const chunks = chunkText(text, 100);
    expect(chunks.every((c) => c.trim().length > 0)).toBe(true);
  });
});

describe('formatQAPairs', () => {
  it('formats pairs in N. **Q** A markdown format', () => {
    const pairs = [{ q: 'O que é seguro?', a: 'É um contrato.' }];
    const md = formatQAPairs(pairs, 1);
    expect(md).toContain('1. **O que é seguro?**');
    expect(md).toContain('É um contrato.');
  });

  it('uses correct start index', () => {
    const pairs = [{ q: 'Q1?', a: 'A1.' }, { q: 'Q2?', a: 'A2.' }];
    const md = formatQAPairs(pairs, 5);
    expect(md).toContain('5. **Q1?**');
    expect(md).toContain('6. **Q2?**');
  });
});

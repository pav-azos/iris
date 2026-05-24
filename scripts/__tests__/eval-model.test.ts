import { describe, it, expect } from 'bun:test';
import { scoreAnswer, EvalResult } from '../eval-model';

describe('scoreAnswer', () => {
  it('returns 1.0 for identical text', () => {
    const score = scoreAnswer('O prazo é de 5 dias úteis.', 'O prazo é de 5 dias úteis.');
    expect(score).toBeCloseTo(1.0, 1);
  });

  it('returns 0.0 for completely different text', () => {
    const score = scoreAnswer('resposta irrelevante sobre física quântica', 'prazo segurado apólice indenização');
    expect(score).toBeLessThan(0.15);
  });

  it('partial match returns between 0 and 1', () => {
    const score = scoreAnswer(
      'O prazo máximo é de 5 dias úteis para entrega dos documentos.',
      'O prazo para entrega dos documentos é de 5 dias úteis conforme art. 35.'
    );
    expect(score).toBeGreaterThan(0.3);
    expect(score).toBeLessThanOrEqual(1.0);
  });

  it('ignores PT-BR stopwords in scoring', () => {
    // "o", "a", "e", "de" should not count as keyword matches
    const score = scoreAnswer('o e de a', 'prazo corretor segurado');
    expect(score).toBeLessThan(0.1);
  });
});

import { describe, it, expect } from 'bun:test';
import { buildPrompt } from '../prompt-builder';
import type { SearchResult } from '../types';

function makeResult(text: string, source: string, score: number): SearchResult {
  return {
    chunk: { id: '1', text, embedding: [], metadata: { source, page: 1, authority: 'law' } },
    score,
  };
}

const results = [
  makeResult('Art. 5 da Lei 15.040 dispõe sobre aceitação.', 'L15040.pdf', 0.92),
  makeResult('A seguradora tem prazo de 15 dias.', 'FAQ.pdf', 0.85),
];

describe('buildPrompt', () => {
  it('includes system message with ÍRIS identity', () => {
    const { messages } = buildPrompt({ message: 'teste', history: [], searchResults: results });
    const sys = messages.find(m => m.role === 'system');
    expect(sys?.content).toContain('ÍRIS');
    expect(sys?.content).toContain('Lei nº 15.040');
  });

  it('injects retrieved chunks into system message', () => {
    const { messages } = buildPrompt({ message: 'aceitação?', history: [], searchResults: results });
    const sys = messages.find(m => m.role === 'system');
    expect(sys?.content).toContain('Art. 5 da Lei 15.040');
    expect(sys?.content).toContain('15 dias');
  });

  it('user message is the last message', () => {
    const { messages } = buildPrompt({ message: 'minha pergunta', history: [], searchResults: results });
    const last = messages.at(-1)!;
    expect(last.role).toBe('user');
    expect(last.content).toBe('minha pergunta');
  });

  it('caps history at 6 turns (12 messages)', () => {
    const history = Array.from({ length: 20 }, (_, i) => ({
      role: (i % 2 === 0 ? 'user' : 'assistant') as 'user' | 'assistant',
      content: `msg ${i}`,
    }));
    const { messages } = buildPrompt({ message: 'new', history, searchResults: results });
    // system(1) + max 12 history + user(1) = 14
    expect(messages.length).toBeLessThanOrEqual(14);
  });

  it('includes refuse message when no results', () => {
    const { messages } = buildPrompt({ message: 'teste', history: [], searchResults: [] });
    const sys = messages.find(m => m.role === 'system');
    expect(sys?.content).toContain('Não encontrei base legal');
  });
});

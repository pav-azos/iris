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

import { chunkQAPairs } from '../chunker';

describe('chunkQAPairs', () => {
  const sampleFAQ = `**1. Qual é o prazo para o corretor entregar documentos?**
**Resposta:** O prazo máximo é de até 5 dias úteis.
*(Referência: L15040)*

**2. O que acontece se o corretor descumprir o prazo?**
**Resposta:** Gera presunção de responsabilidade por perdas e danos.
*(Referência: FAQ da Lei)*

**3. Pergunta simples?**
**Resposta:** Resposta simples aqui.`;

  it('splits into one chunk per Q&A pair', () => {
    const chunks = chunkQAPairs(sampleFAQ, 'FAQ.txt', 'official');
    expect(chunks).toHaveLength(3);
  });

  it('each chunk contains both question and answer', () => {
    const chunks = chunkQAPairs(sampleFAQ, 'FAQ.txt', 'official');
    expect(chunks[0].text).toContain('Qual é o prazo');
    expect(chunks[0].text).toContain('5 dias úteis');
  });

  it('assigns correct metadata', () => {
    const chunks = chunkQAPairs(sampleFAQ, 'FAQ.txt', 'official');
    chunks.forEach(c => {
      expect(c.metadata.source).toBe('FAQ.txt');
      expect(c.metadata.authority).toBe('official');
      expect(c.metadata.page).toBe(0);
    });
  });

  it('handles empty string gracefully', () => {
    expect(chunkQAPairs('', 'FAQ.txt', 'official')).toHaveLength(0);
  });

  it('assigns unique ids', () => {
    const chunks = chunkQAPairs(sampleFAQ, 'FAQ.txt', 'official');
    const ids = chunks.map(c => c.id);
    expect(new Set(ids).size).toBe(ids.length);
  });
});

import { chunkFile } from '../chunker';
import { join } from 'path';

describe('chunkFile', () => {
  const faqPath = join(process.cwd(), '../../docs/data/FAQ.txt');

  it('chunks a TXT Q&A file into Q&A pairs', async () => {
    const chunks = await chunkFile({ filePath: faqPath, authority: 'official' });
    expect(chunks.length).toBeGreaterThan(0);
    chunks.forEach(c => {
      expect(c.text.length).toBeGreaterThan(0);
      expect(c.metadata.authority).toBe('official');
      expect(c.id).toBeTruthy();
    });
  });

  it('FAQ.txt produces more than 10 Q&A chunks', async () => {
    const chunks = await chunkFile({ filePath: faqPath, authority: 'official' });
    expect(chunks.length).toBeGreaterThan(10);
  });
});

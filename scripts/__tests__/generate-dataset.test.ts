import { describe, it, expect } from 'bun:test';
import { parseQAPairs, parseSimpleQA, formatMLXEntry } from '../generate-dataset';

describe('parseQAPairs', () => {
  const sample = `**1. Qual é o prazo para entrega de documentos?**
**Resposta:** O prazo máximo é de até 5 dias úteis.
*(Referência: L15040)*

**2. O que acontece se houver descumprimento?**
**Resposta:** Presunção de responsabilidade por perdas e danos.`;

  it('extracts 2 Q&A pairs', () => {
    expect(parseQAPairs(sample)).toHaveLength(2);
  });

  it('question contains the question text', () => {
    expect(parseQAPairs(sample)[0].question).toContain('prazo para entrega');
  });

  it('answer contains the answer text', () => {
    expect(parseQAPairs(sample)[0].answer).toContain('5 dias úteis');
  });
});

describe("parseSimpleQA", () => {
  it("parses N. **Q** A format", () => {
    const text = `1. **O que é seguro?** É um contrato de risco.\n\n2. **Qual o prazo?** 30 dias.`;
    const pairs = parseSimpleQA(text);
    expect(pairs).toHaveLength(2);
    expect(pairs[0].question).toBe("O que é seguro?");
    expect(pairs[0].answer).toBe("É um contrato de risco.");
    expect(pairs[1].question).toBe("Qual o prazo?");
  });

  it("returns empty for unmatched text", () => {
    const pairs = parseSimpleQA("Not a Q&A format at all");
    expect(pairs).toHaveLength(0);
  });
});

describe('formatMLXEntry', () => {
  it('produces valid JSON with 3 messages', () => {
    const parsed = JSON.parse(formatMLXEntry('Pergunta?', 'Resposta.'));
    expect(parsed.messages).toHaveLength(3);
  });

  it('has system, user, assistant roles in order', () => {
    const { messages } = JSON.parse(formatMLXEntry('P?', 'R.'));
    expect(messages[0].role).toBe('system');
    expect(messages[1].role).toBe('user');
    expect(messages[2].role).toBe('assistant');
  });

  it('system message contains ÍRIS identity', () => {
    const { messages } = JSON.parse(formatMLXEntry('P?', 'R.'));
    expect(messages[0].content).toContain('ÍRIS');
  });
});

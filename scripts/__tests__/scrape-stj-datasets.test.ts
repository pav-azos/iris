import { describe, it, expect } from 'bun:test';
import { isInsuranceRelated, acordaoToQA } from '../scrape-stj-datasets';

describe('isInsuranceRelated', () => {
  it('detects insurance keywords in Portuguese', () => {
    expect(isInsuranceRelated('Ação de cobrança de seguro de vida')).toBe(true);
    expect(isInsuranceRelated('Recurso sobre contrato de seguro')).toBe(true);
    expect(isInsuranceRelated('Sinistro não comunicado à seguradora')).toBe(true);
    expect(isInsuranceRelated('SUSEP determina nova circular')).toBe(true);
  });

  it('rejects unrelated content', () => {
    expect(isInsuranceRelated('Direito tributário - ICMS')).toBe(false);
    expect(isInsuranceRelated('Contrato de trabalho CLT')).toBe(false);
    expect(isInsuranceRelated('Imposto de renda pessoa física')).toBe(false);
  });
});

describe('acordaoToQA', () => {
  it('generates Q&A pair from acordao metadata', () => {
    const acordao = {
      numero: 'REsp 123456',
      ementa: 'Seguro de vida. Suicídio. Carência. Indenização devida após 2 anos.',
      data: '2024-03-15',
      relator: 'Min. João Silva',
      tribunal: 'STJ',
    };
    const qa = acordaoToQA(acordao);
    expect(qa.q).toBeTruthy();
    expect(qa.a).toContain('STJ');
    expect(qa.a).toContain('REsp 123456');
    expect(qa.a).toContain('Seguro de vida');
  });

  it('truncates long ementas', () => {
    const longEmenta = 'Seguro. ' + 'X'.repeat(400);
    const acordao = {
      numero: 'REsp 999',
      ementa: longEmenta,
      data: '2024-01-01',
      relator: 'Min. Test',
      tribunal: 'STJ',
    };
    const qa = acordaoToQA(acordao);
    expect(qa.a.length).toBeLessThan(600);
  });
});

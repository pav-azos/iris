import { describe, it, expect, mock, beforeAll } from 'bun:test';

const mockFetch = mock(() =>
  Promise.resolve({
    ok: true,
    json: () =>
      Promise.resolve({
        hits: {
          hits: [
            {
              _source: {
                dadosBasicos: {
                  numero: '1234567-89.2024.8.26.0100',
                  dataAjuizamento: '2024-01-15',
                  assunto: [{ descricao: 'Seguro de Vida' }],
                  orgaoJulgador: { nome: 'TJSP - 1ª Vara Cível' },
                },
              },
            },
          ],
          total: { value: 1 },
        },
      }),
  } as unknown as Response)
);

global.fetch = mockFetch as unknown as typeof fetch;

import { buildSearchBody, searchDatajud } from '../datajud';

describe('buildSearchBody', () => {
  it('creates valid Elasticsearch multi_match query', () => {
    const body = buildSearchBody('seguro de vida indenização', 10);
    expect(body.query.multi_match.query).toBe('seguro de vida indenização');
    expect(body.size).toBe(10);
    expect(body._source).toBeDefined();
    expect(Array.isArray(body._source)).toBe(true);
  });

  it('includes relevant source fields', () => {
    const body = buildSearchBody('test', 5);
    const src = body._source as string[];
    expect(src.some((f) => f.includes('numero'))).toBe(true);
    expect(src.some((f) => f.includes('assunto'))).toBe(true);
  });
});

describe('searchDatajud', () => {
  it('returns normalized hits array', async () => {
    const results = await searchDatajud('tjsp', 'seguro de vida', 5);
    expect(results).toHaveLength(1);
    expect(results[0].numero).toBe('1234567-89.2024.8.26.0100');
    expect(results[0].assunto).toContain('Seguro de Vida');
    expect(results[0].tribunal).toBe('tjsp');
  });

  it('handles empty hits gracefully', async () => {
    const emptyFetch = mock(() =>
      Promise.resolve({
        ok: true,
        json: () => Promise.resolve({ hits: { hits: [] } }),
      } as unknown as Response)
    );
    global.fetch = emptyFetch as unknown as typeof fetch;
    const results = await searchDatajud('stj', 'test', 5);
    expect(results).toEqual([]);
  });
});

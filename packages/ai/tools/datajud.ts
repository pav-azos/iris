/**
 * ÍRIS — Ferramenta CNJ DataJud
 *
 * Permite consultar processos judiciais sobre seguros no DataJud (CNJ).
 * API pública: https://datajud-wiki.cnj.jus.br/api-publica/
 *
 * Compatível com Vercel AI SDK tool().
 */
import { tool } from 'ai';
import { z } from 'zod';

const DATAJUD_BASE = 'https://api-publica.datajud.cnj.jus.br';

// Public key from https://datajud-wiki.cnj.jus.br/api-publica/acesso/
// Override with DATAJUD_API_KEY env var if needed
const DEFAULT_API_KEY =
  process.env.DATAJUD_API_KEY ??
  'cDZHYzlZa0JadVREZDJCendFbzVlQTU2UmE6SkJlTzNjLV9TRENyQk1RdnFKZGRQdw==';

export interface ProcessoHit {
  numero: string | null;
  dataAjuizamento: string | null;
  assunto: string | null;
  orgao: string | null;
  tribunal: string;
}

export interface SearchBody {
  query: {
    multi_match: {
      query: string;
      fields: string[];
    };
  };
  size: number;
  _source: string[];
}

export function buildSearchBody(query: string, size: number): SearchBody {
  return {
    query: {
      multi_match: {
        query,
        fields: [
          'dadosBasicos.assunto.descricao',
          'dadosBasicos.classeProcessual.descricao',
          'dadosBasicos.orgaoJulgador.nome',
        ],
      },
    },
    size,
    _source: [
      'dadosBasicos.numero',
      'dadosBasicos.dataAjuizamento',
      'dadosBasicos.assunto',
      'dadosBasicos.orgaoJulgador',
    ],
  };
}

export async function searchDatajud(
  tribunal: string,
  query: string,
  size = 10,
  apiKey = DEFAULT_API_KEY
): Promise<ProcessoHit[]> {
  const url = `${DATAJUD_BASE}/api_publica_${tribunal}/_search`;
  const body = buildSearchBody(query, size);

  const res = await fetch(url, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `APIKey ${apiKey}`,
    },
    body: JSON.stringify(body),
    signal: AbortSignal.timeout(15_000),
  });

  if (!res.ok) {
    const text = await res.text();
    throw new Error(`DataJud ${res.status}: ${text.slice(0, 200)}`);
  }

  const data = await res.json();
  const hits = (data?.hits?.hits ?? []) as Array<{ _source: unknown }>;

  return hits.map((h) => {
    const src = h._source as {
      dadosBasicos?: {
        numero?: string;
        dataAjuizamento?: string;
        assunto?: Array<{ descricao: string }>;
        orgaoJulgador?: { nome: string };
      };
    };
    const db = src?.dadosBasicos;
    return {
      numero: db?.numero ?? null,
      dataAjuizamento: db?.dataAjuizamento ?? null,
      assunto: (db?.assunto ?? []).length > 0
        ? (db?.assunto ?? []).map((a) => a.descricao).join(', ')
        : null,
      orgao: db?.orgaoJulgador?.nome ?? null,
      tribunal,
    };
  });
}

const TRIBUNAIS = [
  'stj', 'stf',
  'tjsp', 'tjrj', 'tjmg', 'tjrs', 'tjpr', 'tjsc',
  'tjba', 'tjpe', 'tjce', 'tjgo', 'tjam',
  'trf1', 'trf2', 'trf3', 'trf4', 'trf5',
] as const;

type Tribunal = (typeof TRIBUNAIS)[number];

export const buscarProcessosSeguroTool = tool({
  description:
    'Busca processos judiciais sobre seguros no CNJ DataJud. ' +
    'Use para encontrar precedentes, litigiosidade e tendências jurídicas do setor de seguros.',
  parameters: z.object({
    tribunal: z
      .enum(TRIBUNAIS)
      .describe('Tribunal a consultar (ex: stj, tjsp, trf3)'),
    termos: z
      .string()
      .describe('Termos de busca sobre seguros (ex: "indenização seguro de vida")'),
    limite: z.number().min(1).max(20).default(10).describe('Número de processos a retornar'),
  }),
  execute: async ({ tribunal, termos, limite }) => {
    try {
      const processos = await searchDatajud(tribunal as Tribunal, termos, limite);
      if (processos.length === 0) {
        return {
          encontrados: 0,
          processos: [],
          mensagem: `Nenhum processo encontrado em ${tribunal.toUpperCase()} para: "${termos}"`,
        };
      }
      return { encontrados: processos.length, tribunal: tribunal.toUpperCase(), termos, processos };
    } catch (err) {
      return { erro: err instanceof Error ? err.message : String(err), tribunal, termos };
    }
  },
});

export const buscarMultiplosTribunaisTool = tool({
  description:
    'Busca processos sobre seguros em múltiplos tribunais simultaneamente. ' +
    'Útil para análise de litigiosidade nacional.',
  parameters: z.object({
    termos: z.string().describe('Termos de busca sobre seguros'),
    tribunais: z
      .array(z.enum(TRIBUNAIS))
      .min(1)
      .max(5)
      .default(['stj', 'tjsp', 'trf3'])
      .describe('Lista de tribunais a consultar'),
    limite_por_tribunal: z.number().min(1).max(10).default(5),
  }),
  execute: async ({ termos, tribunais, limite_por_tribunal }) => {
    try {
      const results = await Promise.allSettled(
        tribunais.map((t) => searchDatajud(t as Tribunal, termos, limite_por_tribunal))
      );
      return tribunais.map((tribunal, i) => {
        const result = results[i];
        if (result.status === 'rejected') {
          return {
            tribunal: tribunal.toUpperCase(),
            erro: result.reason instanceof Error ? result.reason.message : String(result.reason),
          };
        }
        return {
          tribunal: tribunal.toUpperCase(),
          encontrados: result.value.length,
          processos: result.value,
        };
      });
    } catch (err) {
      return { erro: err instanceof Error ? err.message : String(err) };
    }
  },
});

export const datajudTools = {
  buscar_processos_seguro: buscarProcessosSeguroTool,
  buscar_multiplos_tribunais: buscarMultiplosTribunaisTool,
};

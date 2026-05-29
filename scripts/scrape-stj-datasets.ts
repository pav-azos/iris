#!/usr/bin/env bun
/**
 * ÍRIS — Scraper de Dados Abertos do STJ
 *
 * Busca o catálogo CKAN do STJ, filtra datasets de seguros,
 * e inclui precedentes curados (Súmulas + REsps) como fallback.
 *
 * Uso: bun scripts/scrape-stj-datasets.ts
 */
import { writeFileSync, mkdirSync } from 'fs';
import { join } from 'path';

const ROOT = join(import.meta.dir, '..');
const OUT_DIR = join(ROOT, 'data');

const STJ_CATALOG_URL = 'https://dadosabertos.web.stj.jus.br/api/3/action/package_search';

const INSURANCE_KEYWORDS = [
  'seguro', 'seguros', 'seguradora', 'sinistro', 'indenização',
  'apólice', 'cobertura', 'prêmio', 'beneficiário', 'susep',
];

export interface Acordao {
  numero: string;
  ementa: string;
  data: string;
  relator: string;
  tribunal: string;
}

export interface QAPair {
  q: string;
  a: string;
}

export function isInsuranceRelated(text: string): boolean {
  const lower = text.toLowerCase();
  return INSURANCE_KEYWORDS.some((kw) => lower.includes(kw));
}

export function acordaoToQA(acordao: Acordao): QAPair {
  const ementa =
    acordao.ementa.length > 300
      ? acordao.ementa.slice(0, 297) + '...'
      : acordao.ementa;

  const firstClause = ementa.split('.')[0].trim();

  return {
    q: `Como o ${acordao.tribunal} decidiu sobre: ${firstClause}?`,
    a: `No processo ${acordao.numero} (${acordao.data}), o ${acordao.tribunal} decidiu: ${ementa} (Relator: ${acordao.relator}.)`,
  };
}

interface CkanDataset {
  title: string;
  notes: string;
  resources: Array<{ url: string; format: string }>;
}

async function fetchCkanCatalog(): Promise<CkanDataset[]> {
  try {
    const url = `${STJ_CATALOG_URL}?q=seguro&rows=20`;
    const res = await fetch(url, { signal: AbortSignal.timeout(15_000) });
    if (!res.ok) {
      console.warn(`STJ catalog HTTP ${res.status} — usando apenas precedentes curados`);
      return [];
    }
    const data = await res.json();
    return (data?.result?.results ?? []) as CkanDataset[];
  } catch (err) {
    console.warn(`STJ catalog falhou: ${err instanceof Error ? err.message : String(err)} — usando precedentes curados`);
    return [];
  }
}

async function downloadJsonResource(url: string): Promise<unknown[]> {
  try {
    const res = await fetch(url, { signal: AbortSignal.timeout(30_000) });
    if (!res.ok) return [];
    const data = await res.json();
    return Array.isArray(data) ? data : (data?.data ?? []);
  } catch {
    return [];
  }
}

function getCuratedPrecedents(): Acordao[] {
  return [
    {
      numero: 'REsp 1.601.555',
      ementa:
        'Seguro de vida. Suicídio. Carência de dois anos. Após o prazo, indenização é devida independentemente da causa da morte.',
      data: '2016-04-27',
      relator: 'Min. Maria Isabel Gallotti',
      tribunal: 'STJ',
    },
    {
      numero: 'Súmula 616/STJ',
      ementa:
        'A indenização securitária é devida quando ausente a comunicação prévia do segurado acerca do agravamento do risco, salvo se o segurador, por outros meios, o conhecia.',
      data: '2018-03-14',
      relator: 'STJ',
      tribunal: 'STJ',
    },
    {
      numero: 'Súmula 620/STJ',
      ementa:
        'A embriaguez do segurado não exime a seguradora do pagamento da indenização prevista em contrato de seguro de vida.',
      data: '2018-03-14',
      relator: 'STJ',
      tribunal: 'STJ',
    },
    {
      numero: 'REsp 1.660.164',
      ementa:
        'Seguro de automóvel. Perda total. Base de cálculo da indenização deve observar a tabela FIPE na data do sinistro.',
      data: '2017-04-04',
      relator: 'Min. Paulo de Tarso Sanseverino',
      tribunal: 'STJ',
    },
    {
      numero: 'Súmula 229/STJ',
      ementa:
        'O pedido do pagamento de indenização à seguradora suspende o prazo de prescrição até que o segurado tenha ciência da decisão.',
      data: '2000-04-26',
      relator: 'STJ',
      tribunal: 'STJ',
    },
    {
      numero: 'REsp 1.964.543',
      ementa:
        'Seguro saúde. Negativa de cobertura para procedimento médico necessário. Dano moral configurado. Seguradora deve indenizar.',
      data: '2022-06-21',
      relator: 'Min. Luis Felipe Salomão',
      tribunal: 'STJ',
    },
    {
      numero: 'REsp 2.028.544',
      ementa:
        'Seguro de responsabilidade civil. Cláusula de exclusão de cobertura. Interpretação restritiva. Ônus da prova do segurador.',
      data: '2023-08-15',
      relator: 'Min. Marco Aurélio Bellizze',
      tribunal: 'STJ',
    },
    {
      numero: 'Súmula 609/STJ',
      ementa:
        'A recusa ilícita de cobertura pelo plano de saúde ou seguro saúde é causa de dano moral, salvo casos excepcionais.',
      data: '2017-11-08',
      relator: 'STJ',
      tribunal: 'STJ',
    },
  ];
}

async function main() {
  mkdirSync(OUT_DIR, { recursive: true });
  console.log('▶ Buscando dados abertos do STJ...');

  const datasets = await fetchCkanCatalog();
  console.log(`  Catálogo: ${datasets.length} datasets encontrados`);

  const allPairs: QAPair[] = [];

  for (const ds of datasets) {
    if (!isInsuranceRelated(`${ds.title} ${ds.notes ?? ''}`)) continue;

    console.log(`  Processando: ${ds.title}`);
    const jsonResources = (ds.resources ?? []).filter((r) => r.format === 'JSON');

    for (const resource of jsonResources.slice(0, 2)) {
      const records = await downloadJsonResource(resource.url);
      const acordaos = (records as Array<Record<string, string>>)
        .filter((r) => r.ementa && isInsuranceRelated(r.ementa))
        .slice(0, 30);

      allPairs.push(...acordaos.map((r) => acordaoToQA(r as unknown as Acordao)));
    }
  }

  const curated = getCuratedPrecedents();
  allPairs.push(...curated.map(acordaoToQA));
  console.log(`  +${curated.length} precedentes curados`);

  const seen = new Set<string>();
  const unique = allPairs.filter((p) => {
    const key = p.q.toLowerCase().slice(0, 50);
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });

  const header =
    '# Jurisprudência STJ — Seguros\n\nFonte: dadosabertos.web.stj.jus.br + precedentes curados\nUso: FT, RAG\n\n';
  const body = unique.map((p, i) => `${i + 1}. **${p.q}** ${p.a}`).join('\n\n');
  const outPath = join(OUT_DIR, 'web-qa-stj-jurisprudencia.md');

  writeFileSync(outPath, header + body, 'utf-8');
  console.log(`\n✓ ${unique.length} pares → ${outPath.split('/').pop()}`);
  console.log('→ Próximo: bun run generate-dataset');
}

if (import.meta.main) {
  main().catch((e) => {
    console.error('Erro fatal:', e);
    process.exit(1);
  });
}

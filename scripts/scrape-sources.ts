#!/usr/bin/env bun
/**
 * ÍRIS — Scraper de Fontes Regulatórias
 *
 * Busca as 13 fontes autoritativas, extrai texto puro e salva em data/raw/{slug}.md
 *
 * Uso: bun scripts/scrape-sources.ts
 * Flags: --dry-run (lista URLs sem buscar)
 */
import { writeFileSync, mkdirSync } from 'fs';
import { join } from 'path';

const ROOT = join(import.meta.dir, '..');
const RAW_DIR = join(ROOT, 'data', 'raw');
const DRY_RUN = process.argv.includes('--dry-run');

mkdirSync(RAW_DIR, { recursive: true });

export interface Source {
  slug: string;
  url: string;
  name: string;
  use: Array<'FT' | 'RAG'>;
  priority: 'alta' | 'média';
}

export const SOURCES: Source[] = [
  {
    slug: 'lei-15040',
    url: 'https://www.planalto.gov.br/ccivil_03/_ato2023-2026/2024/lei/L15040.htm',
    name: 'Lei nº 15.040/2024',
    use: ['FT', 'RAG'],
    priority: 'alta',
  },
  {
    slug: 'susep-faq-nova-lei',
    url: 'https://www.gov.br/susep/pt-br/central-de-conteudos/noticias/2025/julho/susep-esclarece-pontos-sobre-a-nova-lei-do-contrato-de-seguros-e-a-sua-aplicacao',
    name: 'SUSEP – Esclarecimentos sobre a nova lei',
    use: ['FT', 'RAG'],
    priority: 'alta',
  },
  {
    slug: 'fazenda-lei-publicada',
    url: 'https://www.gov.br/fazenda/pt-br/composicao/orgaos/orgaos-colegiados/crsnsp/acesso-a-informacao/noticias/2024/lei-do-contrato-de-seguro-e-publicada',
    name: 'Fazenda – Lei do Contrato de Seguro é publicada',
    use: ['FT', 'RAG'],
    priority: 'média',
  },
  {
    slug: 'susep-open-insurance',
    url: 'https://www.gov.br/susep/pt-br/assuntos/open-insurance/documentos_de_referencia',
    name: 'SUSEP – Documentos de Referência do Open Insurance',
    use: ['RAG'],
    priority: 'alta',
  },
  {
    slug: 'susep-paineis',
    url: 'https://www.gov.br/susep/pt-br/central-de-conteudos/central-de-paineis',
    name: 'SUSEP – Central de Painéis',
    use: ['RAG'],
    priority: 'alta',
  },
  {
    slug: 'susep-ranking-reclamacoes',
    url: 'https://www.gov.br/susep/pt-br/central-de-conteudos/noticias/2024/maio/susep-lanca-ranking-de-reclamacoes-das-empresas-do-setor-de-seguros',
    name: 'SUSEP – Ranking de Reclamações',
    use: ['FT', 'RAG'],
    priority: 'média',
  },
  {
    slug: 'susep-susepcon',
    url: 'https://www.gov.br/sdos/noticias/2024/maio/saiba-como-foi-o-lancamento-do-susepcon-painel-erankingde-reclamacoes-do-setor-de-seguros',
    name: 'SUSEP – Lançamento do SusepCon',
    use: ['FT', 'RAG'],
    priority: 'média',
  },
  {
    slug: 'stj-dados-abertos',
    url: 'https://dadosabertos.web.stj.jus.br/dataset/',
    name: 'STJ – Catálogo de Dados Abertos',
    use: ['RAG'],
    priority: 'alta',
  },
  {
    slug: 'stj-pesquisa-pronta',
    url: 'https://scon.stj.jus.br/SCON/pesquisa_pronta/listaPP.jsp',
    name: 'STJ – Pesquisa Pronta',
    use: ['FT', 'RAG'],
    priority: 'média',
  },
  {
    slug: 'datajud-api',
    url: 'https://datajud-wiki.cnj.jus.br/api-publica/',
    name: 'CNJ DataJud – API Pública',
    use: ['RAG'],
    priority: 'alta',
  },
  {
    slug: 'datajud-acesso',
    url: 'https://datajud-wiki.cnj.jus.br/api-publica/acesso/',
    name: 'CNJ DataJud – Acesso',
    use: ['RAG'],
    priority: 'média',
  },
  {
    slug: 'datajud-exemplos',
    url: 'https://datajud-wiki.cnj.jus.br/api-publica/exemplos/',
    name: 'CNJ DataJud – Exemplos',
    use: ['RAG'],
    priority: 'média',
  },
];

export function htmlToText(html: string): string {
  return html
    .replace(/<script[\s\S]*?<\/script>/gi, '')
    .replace(/<style[\s\S]*?<\/style>/gi, '')
    .replace(/<nav[\s\S]*?<\/nav>/gi, '')
    .replace(/<footer[\s\S]*?<\/footer>/gi, '')
    .replace(/<header[\s\S]*?<\/header>/gi, '')
    .replace(/<[^>]+>/g, ' ')
    .replace(/&nbsp;/g, ' ')
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&#\d+;/g, '')
    .replace(/&[a-z]+;/gi, '')
    .replace(/[ \t]{2,}/g, ' ')
    .replace(/\n{3,}/g, '\n\n')
    .split('\n')
    .map((l) => l.trim())
    .filter((l) => l.length > 10)
    .join('\n')
    .trim();
}

export function slugify(url: string): string {
  try {
    const u = new URL(url);
    const parts = u.pathname.split('/').filter(Boolean);
    return parts.slice(-2).join('-').replace(/[^a-zA-Z0-9-]/g, '-').replace(/-+/g, '-');
  } catch {
    return 'unknown';
  }
}

async function fetchSource(source: Source): Promise<string | null> {
  try {
    const res = await fetch(source.url, {
      headers: {
        'User-Agent': 'Mozilla/5.0 (compatible; IRIS-Research-Bot/1.0)',
        'Accept': 'text/html,application/xhtml+xml',
        'Accept-Language': 'pt-BR,pt;q=0.9',
      },
      signal: AbortSignal.timeout(30_000),
    });

    if (!res.ok) {
      console.warn(`  ⚠ HTTP ${res.status} — ${source.url}`);
      return null;
    }

    const contentType = res.headers.get('content-type') ?? '';
    if (!contentType.includes('html') && !contentType.includes('text')) {
      console.warn(`  ⚠ Tipo inesperado: ${contentType}`);
      return null;
    }

    const html = await res.text();
    return htmlToText(html);
  } catch (err) {
    console.warn(`  ✗ Erro ao buscar ${source.url}: ${(err as Error).message}`);
    return null;
  }
}

async function main() {
  console.log(`▶ Buscando ${SOURCES.length} fontes...\n`);

  let ok = 0;
  let fail = 0;

  for (const source of SOURCES) {
    const out = join(RAW_DIR, `${source.slug}.md`);

    if (DRY_RUN) {
      console.log(`[dry] ${source.slug} → ${source.url}`);
      continue;
    }

    process.stdout.write(`  ${source.slug}... `);
    const text = await fetchSource(source);

    if (!text || text.length < 200) {
      console.log(`✗ (conteúdo insuficiente: ${text?.length ?? 0} chars)`);
      fail++;
      continue;
    }

    const header = `# ${source.name}\n\nFonte: ${source.url}\nUso: ${source.use.join(', ')}\n\n`;
    writeFileSync(out, header + text, 'utf-8');
    console.log(`✓ (${text.length} chars → ${out.split('/').pop()})`);
    ok++;
  }

  console.log(`\n✓ ${ok} fontes salvas  ✗ ${fail} falhas`);
  console.log(`→ Próximo: bun scripts/extract-web-qa.ts`);
}

if (import.meta.main) {
  main().catch((e) => {
    console.error('Erro fatal:', e);
    process.exit(1);
  });
}

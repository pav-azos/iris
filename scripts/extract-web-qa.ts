#!/usr/bin/env bun
/**
 * ÍRIS — Extrator de Q&A via Claude Haiku
 *
 * Lê data/raw/{slug}.md, gera perguntas e respostas no formato
 * compatível com parse-qa-to-jsonl.ts, salva em data/web-qa-{slug}.md
 *
 * Uso: ANTHROPIC_API_KEY=... bun scripts/extract-web-qa.ts
 * Flags: --slug=lei-15040 (processa apenas um slug)
 *        --dry-run (lista arquivos sem chamar API)
 */
import Anthropic from '@anthropic-ai/sdk';
import { readFileSync, writeFileSync, readdirSync } from 'fs';
import { join } from 'path';

const ROOT = join(import.meta.dir, '..');
const RAW_DIR = join(ROOT, 'data', 'raw');
const OUT_DIR = join(ROOT, 'data');

const DRY_RUN = process.argv.includes('--dry-run');
const SLUG_FILTER = process.argv.find((a) => a.startsWith('--slug='))?.split('=')[1];
const CHUNK_SIZE = 3000;
const PAIRS_PER_CHUNK = 5;
const CONCURRENCY = 4;

export interface QAPair {
  q: string;
  a: string;
}

export function chunkText(text: string, maxChars: number): string[] {
  const paragraphs = text.split(/\n{2,}/);
  const chunks: string[] = [];
  let current = '';

  for (const para of paragraphs) {
    // If a single paragraph exceeds maxChars, split it by character slices
    if (para.length > maxChars) {
      if (current.trim().length > 0) {
        chunks.push(current.trim());
        current = '';
      }
      for (let start = 0; start < para.length; start += maxChars) {
        chunks.push(para.slice(start, start + maxChars));
      }
      continue;
    }

    if (current.length + para.length > maxChars && current.length > 0) {
      chunks.push(current.trim());
      current = '';
    }
    current += para + '\n\n';
  }

  if (current.trim().length > 0) chunks.push(current.trim());
  return chunks;
}

export function formatQAPairs(pairs: QAPair[], startIdx: number): string {
  return pairs
    .map((p, i) => `${startIdx + i}. **${p.q}** ${p.a}`)
    .join('\n\n');
}

const EXTRACT_SYSTEM = `Você é especialista em direito de seguros e criação de datasets de fine-tuning.
Dado um trecho de texto regulatório ou jurídico brasileiro sobre seguros, gere pares de pergunta e resposta.

Regras:
- Perguntas devem ser claras, específicas, em português brasileiro formal
- Respostas devem citar artigo ou fonte quando disponível no texto
- Nunca invente informações além do que está no texto
- Foco em: obrigações, prazos, definições, direitos, procedimentos, penalidades
- Output: JSON array [{"q": "...", "a": "..."}, ...]
- Português brasileiro`;

async function extractPairsFromChunk(
  client: Anthropic,
  chunk: string,
  sourceName: string,
  n: number
): Promise<QAPair[]> {
  const prompt = `Fonte: ${sourceName}

Texto:
${chunk}

Gere exatamente ${n} pares pergunta/resposta sobre este texto.
Retorne JSON array: [{"q": "...", "a": "..."}, ...]`;

  const response = await client.messages.create({
    model: 'claude-haiku-4-5-20251001',
    max_tokens: 2048,
    system: [
      { type: 'text', text: EXTRACT_SYSTEM, cache_control: { type: 'ephemeral' } },
    ],
    messages: [{ role: 'user', content: prompt }],
  });

  const block = response.content[0];
  if (block.type !== 'text') return [];

  try {
    const fence = block.text.match(/```(?:json)?\s*([\s\S]+?)```/);
    const raw = fence ? fence[1] : block.text.trim();
    const parsed = JSON.parse(raw) as Array<{ q: string; a: string }>;
    return parsed.filter((p) => p.q && p.a && p.q.length > 10 && p.a.length > 10);
  } catch {
    return [];
  }
}

async function runConcurrent<T>(tasks: (() => Promise<T>)[], limit: number): Promise<T[]> {
  const results: T[] = new Array(tasks.length);
  let idx = 0;

  async function worker() {
    while (idx < tasks.length) {
      const i = idx++;
      results[i] = await tasks[i]();
    }
  }

  await Promise.all(Array.from({ length: limit }, worker));
  return results;
}

async function processFile(
  client: Anthropic,
  rawPath: string,
  slug: string
): Promise<number> {
  const text = readFileSync(rawPath, 'utf-8');
  const lines = text.split('\n');

  const nameLine = lines.find((l) => l.startsWith('# ')) ?? '# Fonte desconhecida';
  const sourceName = nameLine.replace('# ', '').trim();
  const sourceUrl = lines.find((l) => l.startsWith('Fonte: '))?.replace('Fonte: ', '').trim() ?? '';

  const body = lines.slice(4).join('\n');
  const chunks = chunkText(body, CHUNK_SIZE);

  console.log(`  ${slug}: ${chunks.length} chunks...`);

  const tasks = chunks.map(
    (chunk) => () => extractPairsFromChunk(client, chunk, sourceName, PAIRS_PER_CHUNK)
  );
  const results = await runConcurrent(tasks, CONCURRENCY);
  const allPairs = results.flat();

  if (allPairs.length === 0) {
    console.log(`  ⚠ ${slug}: nenhum par extraído`);
    return 0;
  }

  const seen = new Set<string>();
  const unique = allPairs.filter((p) => {
    const key = p.q.toLowerCase().slice(0, 50);
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });

  const header = `# ${sourceName}\n\nFonte: ${sourceUrl}\nUso: FT, RAG\n\n`;
  const bodyOut = formatQAPairs(unique, 1);
  const outPath = join(OUT_DIR, `web-qa-${slug}.md`);
  writeFileSync(outPath, header + bodyOut, 'utf-8');

  console.log(`  ✓ ${slug}: ${unique.length} pares → ${outPath.split('/').pop()}`);
  return unique.length;
}

async function main() {
  if (!process.env.ANTHROPIC_API_KEY && !DRY_RUN) {
    console.error('✗ ANTHROPIC_API_KEY não definida.');
    process.exit(1);
  }

  const files = readdirSync(RAW_DIR)
    .filter((f) => f.endsWith('.md'))
    .filter((f) => !SLUG_FILTER || f.startsWith(SLUG_FILTER));

  console.log(`▶ Extraindo Q&A de ${files.length} fontes...\n`);

  if (DRY_RUN) {
    files.forEach((f) => console.log(`[dry] ${f}`));
    return;
  }

  const client = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });
  let total = 0;

  for (const file of files) {
    const slug = file.replace('.md', '');
    const rawPath = join(RAW_DIR, file);
    total += await processFile(client, rawPath, slug);
  }

  console.log(`\n╔══════════════════════════════════════════╗`);
  console.log(`║  Extração concluída: ${String(total).padEnd(6)} pares total  ║`);
  console.log(`╚══════════════════════════════════════════╝`);
  console.log(`→ Próximo: bun run generate-dataset`);
}

if (import.meta.main) {
  main().catch((e) => {
    console.error('Erro fatal:', e);
    process.exit(1);
  });
}

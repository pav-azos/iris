#!/usr/bin/env bun
/**
 * Index all docs/ files into apps/web/data/corpus.json
 * Run: bun run index-docs
 * Skips unchanged files via SHA-256 hash cache.
 */
import { createHash, randomUUID } from 'crypto';
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'fs';
import { join, basename } from 'path';
import { chunkFile } from '../packages/rag/chunker';
import { embedTexts } from '../packages/rag/embedder';
import type { Authority, Chunk, Corpus } from '../packages/rag/types';

const ROOT        = join(import.meta.dir, '..');
const DOCS_DIR    = join(ROOT, 'docs');
const OUTPUT_PATH = join(ROOT, 'apps/web/data/corpus.json');
const CACHE_PATH  = join(ROOT, 'apps/web/data/.index-cache.json');

const OLLAMA_BASE_URL = process.env.OLLAMA_BASE_URL ?? 'http://localhost:11434';
const EMBED_MODEL     = process.env.OLLAMA_EMBED_MODEL ?? 'bge-m3';

// Filename pattern -> authority
const AUTHORITY_MAP: Array<{ pattern: RegExp; authority: Authority }> = [
  { pattern: /L15040/i,                       authority: 'law' },
  { pattern: /FAQ da Lei/i,                   authority: 'official' },
  { pattern: /Agente FAQ/i,                   authority: 'official' },
  { pattern: /FAQ\.txt/i,                     authority: 'official' },
  { pattern: /SUSEP|Plano de Regulação/i,     authority: 'official' },
  { pattern: /Divergências|ENS/i,             authority: 'official' },
  { pattern: /./,                             authority: 'third-party' },
];

function getAuthority(filePath: string): Authority {
  const name = basename(filePath);
  for (const { pattern, authority } of AUTHORITY_MAP) {
    if (pattern.test(name)) return authority;
  }
  return 'third-party';
}

function fileHash(filePath: string): string {
  return createHash('sha256').update(readFileSync(filePath)).digest('hex').slice(0, 16);
}

const DOC_FILES = [
  'L15040 - Nova lei de seguros.pdf',
  'FAQ da Lei nº 15.0402024 – Nova Lei do Contrato de Seguro.pdf',
  'Agente FAQ Lei Geral Seguros.txt',
  'data/FAQ.txt',
  'O que mudou (Nova lei de seguros) - MAG SEGUROS.pdf',
  'Conheça Nova Lei de Seguros - MDS Brasil.pdf',
  'Adequação à Lei n 15.040 - oportunidade de reinvenção - PWC.pdf',
  'Divergências entre a Lei 15.040_24 e as normas já existentes que regulam o contrato de seguros - ENS.pdf',
  'Seis pontos sobre mudanças trazidas pelo Marco Legal - Fenacor.pdf',
  'Plano de Regulação SUSEP 2026.pdf',
  '03_Lei_o_que_o_consumidor_precisa_saber_DIGITAL_FINAL_7b0a32864c.pdf',
].map(f => join(DOCS_DIR, f));

async function main() {
  type Cache = Record<string, string>;
  const cache: Cache = existsSync(CACHE_PATH)
    ? JSON.parse(readFileSync(CACHE_PATH, 'utf-8'))
    : {};

  const existingChunks: Chunk[] = existsSync(OUTPUT_PATH)
    ? (JSON.parse(readFileSync(OUTPUT_PATH, 'utf-8')) as Corpus).chunks
    : [];

  const bySource = new Map<string, Chunk[]>();
  for (const chunk of existingChunks) {
    const src = chunk.metadata.source;
    bySource.set(src, [...(bySource.get(src) ?? []), chunk]);
  }

  const newCache: Cache = {};
  const allChunks: Chunk[] = [];
  let indexed = 0, skipped = 0;

  for (const filePath of DOC_FILES) {
    if (!existsSync(filePath)) {
      console.warn(`Skipping missing: ${basename(filePath)}`);
      continue;
    }
    const hash = fileHash(filePath);
    const source = basename(filePath);
    newCache[filePath] = hash;

    if (cache[filePath] === hash && bySource.has(source)) {
      console.log(`✓ Unchanged: ${source} (${bySource.get(source)!.length} chunks)`);
      allChunks.push(...bySource.get(source)!);
      skipped++;
      continue;
    }

    console.log(`⟳ Indexing: ${source}…`);
    const authority = getAuthority(filePath);
    const rawChunks = await chunkFile({ filePath, authority });
    const texts = rawChunks.map(c => c.text);

    process.stdout.write(`  Embedding ${texts.length} chunks…`);
    const embeddings = await embedTexts(texts, { baseUrl: OLLAMA_BASE_URL, model: EMBED_MODEL });
    console.log(' done');

    const chunks: Chunk[] = rawChunks.map((raw, i) => ({
      ...raw,
      id: randomUUID(),
      embedding: embeddings[i],
    }));

    allChunks.push(...chunks);
    console.log(`  → ${chunks.length} chunks (${authority})`);
    indexed++;
  }

  mkdirSync(join(ROOT, 'apps/web/data'), { recursive: true });
  const corpus: Corpus = {
    header: {
      embedModel: EMBED_MODEL,
      dim: allChunks[0]?.embedding.length ?? 1024,
      version: 1,
      indexedAt: new Date().toISOString(),
    },
    chunks: allChunks,
  };

  writeFileSync(OUTPUT_PATH, JSON.stringify(corpus));
  writeFileSync(CACHE_PATH, JSON.stringify(newCache, null, 2));

  console.log(`\n✅ corpus.json: ${allChunks.length} chunks (${indexed} indexed, ${skipped} cached)`);
}

main().catch(err => { console.error(err); process.exit(1); });

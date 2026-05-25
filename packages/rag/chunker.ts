import { randomUUID } from 'crypto';
import { readFileSync } from 'fs';
import { basename, extname } from 'path';
import type { RawChunk, Authority } from './types';

const MAX_CHARS = 1920;    // ~400 tokens at ~4.8 chars/token with 20% margin
const OVERLAP_CHARS = 256; // ~64 token overlap

export function chunkTextWindow(
  text: string,
  source: string,
  authority: Authority,
  page: number
): RawChunk[] {
  const trimmed = text.trim();
  if (!trimmed) return [];

  if (trimmed.length <= MAX_CHARS) {
    return [{
      id: randomUUID(),
      text: trimmed,
      metadata: { source, page, authority },
    }];
  }

  const chunks: RawChunk[] = [];
  let start = 0;

  while (start < trimmed.length) {
    const end = Math.min(start + MAX_CHARS, trimmed.length);
    const chunkText = trimmed.slice(start, end).trim();
    if (chunkText) {
      chunks.push({
        id: randomUUID(),
        text: chunkText,
        metadata: { source, page, authority },
      });
    }
    if (end === trimmed.length) break;
    start = end - OVERLAP_CHARS;
  }

  return chunks;
}

// Splits on numbered bold questions: **N. text**
const QA_SPLIT_PATTERN = /(?=\*\*\d+\.)/g;

export function chunkQAPairs(
  text: string,
  source: string,
  authority: Authority
): RawChunk[] {
  if (!text.trim()) return [];
  const pairs = text.split(QA_SPLIT_PATTERN).filter(s => s.trim());
  return pairs.map(pair => ({
    id: randomUUID(),
    text: pair.trim(),
    metadata: { source, page: 0, authority },
  }));
}

export interface ChunkFileInput {
  filePath: string;
  authority: Authority;
}

const QA_FILE_PATTERNS = [/^FAQ/i, /flashcard/i]; // /agente/i removido — capturava doc de pesquisa

function isQAFile(filePath: string): boolean {
  const name = basename(filePath);
  return QA_FILE_PATTERNS.some(re => re.test(name));
}

async function extractPDFPages(
  filePath: string
): Promise<Array<{ text: string; page: number }>> {
  // Use legacy build for Bun/Node compatibility (no DOM dependency)
  // pdf-parse via caminho interno — evita auto-teste quebrado do index.js (bug v1.1.1)
  const pdfParse = require('pdf-parse/lib/pdf-parse.js');
  const buffer = readFileSync(filePath);
  const data = await pdfParse(buffer);
  // pdf-parse não separa por página — retorna texto completo como página única
  const pages: Array<{ text: string; page: number }> = [];
  if (data.text?.trim()) {
    pages.push({ text: data.text.replace(/\s+/g, ' ').trim(), page: 1 });
  }
  return pages;
}

export async function chunkFile(input: ChunkFileInput): Promise<RawChunk[]> {
  const { filePath, authority } = input;
  const ext = extname(filePath).toLowerCase();
  const source = basename(filePath);

  if (ext === '.txt') {
    const text = readFileSync(filePath, 'utf-8');
    return isQAFile(filePath)
      ? chunkQAPairs(text, source, authority)
      : chunkTextWindow(text, source, authority, 0);
  }

  if (ext === '.pdf') {
    const pages = await extractPDFPages(filePath);
    const chunks: RawChunk[] = [];
    for (const { text, page } of pages) {
      chunks.push(...chunkTextWindow(text, source, authority, page));
    }
    return chunks;
  }

  throw new Error(`Unsupported file type: ${ext} (${filePath})`);
}

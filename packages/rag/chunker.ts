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

const QA_FILE_PATTERNS = [/FAQ/i, /flashcard/i, /agente/i];

function isQAFile(filePath: string): boolean {
  const name = basename(filePath);
  return QA_FILE_PATTERNS.some(re => re.test(name));
}

async function extractPDFPages(
  filePath: string
): Promise<Array<{ text: string; page: number }>> {
  // Use legacy build for Bun/Node compatibility (no DOM dependency)
  const pdfjsLib = await import('pdfjs-dist/legacy/build/pdf.mjs' as string);
  const lib = (pdfjsLib as any).default ?? pdfjsLib;
  lib.GlobalWorkerOptions.workerSrc = '';

  const data = new Uint8Array(readFileSync(filePath));
  const doc = await lib.getDocument({ data }).promise;
  const pages: Array<{ text: string; page: number }> = [];

  for (let i = 1; i <= doc.numPages; i++) {
    const pg = await doc.getPage(i);
    const content = await pg.getTextContent();
    const text = (content.items as Array<{ str?: string }>)
      .map(item => item.str ?? '')
      .join(' ')
      .replace(/\s+/g, ' ')
      .trim();
    if (text) pages.push({ text, page: i });
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

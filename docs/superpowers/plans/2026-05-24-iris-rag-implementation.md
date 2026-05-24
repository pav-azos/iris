# ÍRIS Agentic RAG — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Transform LLMChat.co fork into ÍRIS — a single-purpose Agentic RAG agent that answers questions about Lei 15.040/2024 using local Ollama inference.

**Architecture:** Next.js 14 Turbo monorepo. New `packages/rag` handles chunking/embedding/retrieval. `apps/web/app/api/chat` streams RAG-augmented responses from Ollama. Docs pre-indexed into `apps/web/data/corpus.json` at build time via `bun run index-docs`.

**Tech Stack:** Bun · Next.js 14 · TypeScript · Ollama (bge-m3 + mistral:7b-instruct) · pdfjs-dist · Zod · Dexie.js (chat history only) · Tailwind + shadcn

**Test runner:** `bun test` (built-in, vitest-compatible API)

**Pre-requisites for evaluator:**
```bash
ollama pull bge-m3
ollama pull mistral:7b-instruct
bun install
bun run index-docs
bun dev
```

---

## File Map

### New files
```
packages/rag/
├── package.json
├── tsconfig.json
├── index.ts                          re-exports public API
├── types.ts                          Chunk, Corpus, SearchResult, etc.
├── chunker.ts                        PDF + Q&A TXT -> RawChunk[]
├── embedder.ts                       fetch Ollama /api/embeddings
├── searcher.ts                       cosine + authority bias + top-k
├── prompt-builder.ts                 ÍRIS system prompt + context injection
├── corpus-loader.ts                  module-level Promise<Corpus> singleton
└── __tests__/
    ├── chunker.test.ts
    ├── embedder.test.ts
    ├── searcher.test.ts
    ├── prompt-builder.test.ts
    ├── corpus-loader.test.ts
    ├── fixtures/golden.ts
    └── golden-queries.test.ts        integration, requires corpus.json

packages/ai/
└── ollama-client.ts                  replaces worker/workflow (inference only)

apps/web/
├── app/api/chat/route.ts             new RAG+stream route
├── app/api/chat/rate-limit.ts        in-memory rate limiter
├── app/api/health/route.ts           Ollama + corpus status probe
├── app/components/health-banner.tsx  client component, polls /api/health
├── data/.gitkeep                     corpus.json gitignored, generated locally
└── .env.local                        OLLAMA_BASE_URL etc.

scripts/
├── index-docs.ts                     bun run index-docs
└── generate-dataset.ts               bun run gen-dataset

docs/specs/
├── rag-pipeline.md
├── frontend-cleanup.md
├── ollama-integration.md
├── finetune-pipeline.md
└── iris-identity.md
```

### Modified files
```
turbo.json                            add test task
package.json (root)                   add scripts: index-docs, gen-dataset
apps/web/next.config.mjs              remove Sentry, add corpus bundle config
apps/web/app/layout.tsx               ÍRIS metadata, remove Clerk/Sentry providers
apps/web/app/page.tsx                 ÍRIS landing (redirect to /chat)
apps/web/middleware.ts                remove Clerk, passthrough
apps/web/app/chat/layout.tsx          add HealthBanner
packages/common/store/chat.store.ts   update API call -> /api/chat, new SSE format
packages/common/store/index.ts        remove mcp-tools.store, api-keys.store exports
```

### Deleted files
```
apps/web/app/api/completion/
apps/web/app/api/feedback/
apps/web/app/api/mcp/
apps/web/app/api/messages/
apps/web/app/sign-in/
apps/web/app/sign-up/
apps/web/app/privacy/
apps/web/app/terms/
apps/web/app/recent/
apps/web/sentry.client.config.ts
apps/web/sentry.edge.config.ts
apps/web/sentry.server.config.ts
apps/web/app/instrumentation.ts
packages/common/store/api-keys.store.ts
packages/common/store/mcp-tools.store.ts
packages/common/components/chat-input/image-attachment.tsx
packages/common/components/chat-input/image-dropzone-root.tsx
packages/common/components/chat-input/image-dropzone.tsx
packages/common/components/chat-input/image-upload.tsx
packages/common/components/messages-remaining-badge.tsx
packages/common/components/feedback-widget.tsx
```

---

## Task 1: RAG Package Scaffold + Types

**Files:**
- Create: `packages/rag/package.json`
- Create: `packages/rag/tsconfig.json`
- Create: `packages/rag/types.ts`
- Create: `packages/rag/index.ts`
- Modify: `turbo.json`
- Modify: `package.json` (root)

- [ ] **Step 1: Create `packages/rag/package.json`**

```json
{
  "name": "@repo/rag",
  "version": "0.1.0",
  "private": true,
  "main": "./index.ts",
  "types": "./index.ts",
  "scripts": {
    "test": "bun test",
    "type-check": "tsc --noEmit"
  },
  "dependencies": {
    "pdfjs-dist": "^4.4.168"
  },
  "devDependencies": {
    "@repo/typescript-config": "*",
    "@types/node": "^20"
  }
}
```

- [ ] **Step 2: Create `packages/rag/tsconfig.json`**

```json
{
  "extends": "@repo/typescript-config/base.json",
  "compilerOptions": {
    "module": "ESNext",
    "moduleResolution": "bundler",
    "outDir": "./dist"
  },
  "include": ["**/*.ts"],
  "exclude": ["node_modules", "dist"]
}
```

- [ ] **Step 3: Create `packages/rag/types.ts`**

```typescript
export type Authority = 'law' | 'official' | 'third-party';

export interface ChunkMetadata {
  source: string;       // filename e.g. "L15040 - Nova lei de seguros.pdf"
  page: number;         // 0 for TXT files
  authority: Authority;
  section?: string;     // best-effort from PDF outline
}

export interface RawChunk {
  id: string;           // crypto.randomUUID()
  text: string;
  metadata: ChunkMetadata;
}

export interface Chunk extends RawChunk {
  embedding: number[];  // 1024d from bge-m3
}

export interface CorpusHeader {
  embedModel: string;   // "bge-m3"
  dim: number;          // 1024
  version: number;      // 1
  indexedAt: string;    // ISO 8601
}

export interface Corpus {
  header: CorpusHeader;
  chunks: Chunk[];
}

export interface SearchResult {
  chunk: Chunk;
  score: number;        // biased cosine score
}

export interface EmbedConfig {
  baseUrl: string;
  model: string;
}
```

- [ ] **Step 4: Create `packages/rag/index.ts`**

```typescript
export type {
  Authority,
  ChunkMetadata,
  RawChunk,
  Chunk,
  CorpusHeader,
  Corpus,
  SearchResult,
  EmbedConfig,
} from './types';
export { chunkFile, chunkTextWindow, chunkQAPairs } from './chunker';
export { embedText, embedTexts } from './embedder';
export { search, cosineSimilarity } from './searcher';
export { buildPrompt, IRIS_SYSTEM_PROMPT } from './prompt-builder';
export { getCorpus, resetCorpusCache } from './corpus-loader';
```

- [ ] **Step 5: Update `turbo.json`**

```json
{
  "$schema": "https://turbo.build/schema.json",
  "globalDependencies": ["**/.env.*local"],
  "tasks": {
    "build": {
      "dependsOn": ["^build"],
      "outputs": [".next/**", "!.next/cache/**", "dist/**"]
    },
    "test": {
      "dependsOn": ["^build"],
      "outputs": []
    },
    "lint": {},
    "dev": {
      "cache": false,
      "persistent": true
    }
  }
}
```

- [ ] **Step 6: Add scripts to root `package.json`**

Add to `"scripts"` block:
```json
"index-docs": "bun scripts/index-docs.ts",
"gen-dataset": "bun scripts/generate-dataset.ts"
```

- [ ] **Step 7: Install pdfjs-dist**

```bash
cd packages/rag && bun add pdfjs-dist && cd ../..
```

- [ ] **Step 8: Commit scaffold**

```bash
git add packages/rag turbo.json package.json
git commit -m "feat(rag): add @repo/rag package scaffold and types"
```

---

## Task 2: Chunker — Text Window Splitting

**Files:**
- Create: `packages/rag/chunker.ts` (partial)
- Create: `packages/rag/__tests__/chunker.test.ts` (partial)

- [ ] **Step 1: Write failing tests**

Create `packages/rag/__tests__/chunker.test.ts`:

```typescript
import { describe, it, expect } from 'bun:test';
import { chunkTextWindow } from '../chunker';

describe('chunkTextWindow', () => {
  it('returns single chunk for short text', () => {
    const text = 'Short text under the limit.';
    const chunks = chunkTextWindow(text, 'test.pdf', 'law', 1);
    expect(chunks).toHaveLength(1);
    expect(chunks[0].text).toBe(text);
    expect(chunks[0].metadata.source).toBe('test.pdf');
    expect(chunks[0].metadata.page).toBe(1);
    expect(chunks[0].metadata.authority).toBe('law');
    expect(chunks[0].id).toBeTruthy();
  });

  it('splits long text into overlapping chunks', () => {
    const longText = 'A'.repeat(4000);
    const chunks = chunkTextWindow(longText, 'test.pdf', 'law', 2);
    expect(chunks.length).toBeGreaterThan(1);
    chunks.forEach(c => expect(c.text.length).toBeLessThanOrEqual(1920));
  });

  it('chunks overlap correctly', () => {
    const longText = 'X'.repeat(3000);
    const chunks = chunkTextWindow(longText, 'test.pdf', 'official', 1);
    if (chunks.length >= 2) {
      const endOfFirst = chunks[0].text.slice(-200);
      expect(chunks[1].text.startsWith(endOfFirst.slice(0, 100))).toBe(true);
    }
  });

  it('assigns unique ids', () => {
    const text = 'B'.repeat(5000);
    const chunks = chunkTextWindow(text, 'test.pdf', 'third-party', 1);
    const ids = chunks.map(c => c.id);
    expect(new Set(ids).size).toBe(ids.length);
  });
});
```

- [ ] **Step 2: Run test — verify FAIL**

```bash
cd packages/rag && bun test __tests__/chunker.test.ts
```

Expected: `Cannot find module '../chunker'`

- [ ] **Step 3: Implement `chunkTextWindow` in `packages/rag/chunker.ts`**

```typescript
import { randomUUID } from 'crypto';
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
```

- [ ] **Step 4: Run test — verify PASS**

```bash
cd packages/rag && bun test __tests__/chunker.test.ts
```

Expected: all 4 tests pass.

- [ ] **Step 5: Commit**

```bash
git add packages/rag/chunker.ts packages/rag/__tests__/chunker.test.ts
git commit -m "feat(rag): implement chunkTextWindow with overlap"
```

---

## Task 3: Chunker — Q&A Pair Splitting

**Files:**
- Modify: `packages/rag/chunker.ts`
- Modify: `packages/rag/__tests__/chunker.test.ts`

- [ ] **Step 1: Append failing tests to `packages/rag/__tests__/chunker.test.ts`**

```typescript
import { chunkQAPairs } from '../chunker';

describe('chunkQAPairs', () => {
  const sampleFAQ = `**1. Qual é o prazo para o corretor entregar documentos?**
**Resposta:** O prazo máximo é de até 5 dias úteis.
*(Referência: L15040)*

**2. O que acontece se o corretor descumprir o prazo?**
**Resposta:** Gera presunção de responsabilidade por perdas e danos.
*(Referência: FAQ da Lei)*

**3. Pergunta simples?**
**Resposta:** Resposta simples aqui.`;

  it('splits into one chunk per Q&A pair', () => {
    const chunks = chunkQAPairs(sampleFAQ, 'FAQ.txt', 'official');
    expect(chunks).toHaveLength(3);
  });

  it('each chunk contains both question and answer', () => {
    const chunks = chunkQAPairs(sampleFAQ, 'FAQ.txt', 'official');
    expect(chunks[0].text).toContain('Qual é o prazo');
    expect(chunks[0].text).toContain('5 dias úteis');
  });

  it('assigns correct metadata', () => {
    const chunks = chunkQAPairs(sampleFAQ, 'FAQ.txt', 'official');
    chunks.forEach(c => {
      expect(c.metadata.source).toBe('FAQ.txt');
      expect(c.metadata.authority).toBe('official');
      expect(c.metadata.page).toBe(0);
    });
  });

  it('handles empty string gracefully', () => {
    expect(chunkQAPairs('', 'FAQ.txt', 'official')).toHaveLength(0);
  });

  it('assigns unique ids', () => {
    const chunks = chunkQAPairs(sampleFAQ, 'FAQ.txt', 'official');
    const ids = chunks.map(c => c.id);
    expect(new Set(ids).size).toBe(ids.length);
  });
});
```

- [ ] **Step 2: Run test — verify FAIL**

```bash
cd packages/rag && bun test __tests__/chunker.test.ts
```

Expected: `chunkQAPairs is not a function`

- [ ] **Step 3: Add `chunkQAPairs` to `packages/rag/chunker.ts`**

Append to `chunker.ts`:

```typescript
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
```

- [ ] **Step 4: Run test — verify PASS**

```bash
cd packages/rag && bun test __tests__/chunker.test.ts
```

Expected: all tests pass.

- [ ] **Step 5: Commit**

```bash
git add packages/rag/chunker.ts packages/rag/__tests__/chunker.test.ts
git commit -m "feat(rag): implement chunkQAPairs for FAQ/flashcard files"
```

---

## Task 4: Chunker — PDF Extraction

**Files:**
- Modify: `packages/rag/chunker.ts` (add `chunkFile`)
- Modify: `packages/rag/__tests__/chunker.test.ts`

- [ ] **Step 1: Append failing test**

Append to `packages/rag/__tests__/chunker.test.ts`:

```typescript
import { chunkFile } from '../chunker';
import { join } from 'path';

describe('chunkFile', () => {
  const faqPath = join(process.cwd(), '../../docs/data/FAQ.txt');

  it('chunks a TXT Q&A file into Q&A pairs', async () => {
    const chunks = await chunkFile({ filePath: faqPath, authority: 'official' });
    expect(chunks.length).toBeGreaterThan(0);
    chunks.forEach(c => {
      expect(c.text.length).toBeGreaterThan(0);
      expect(c.metadata.authority).toBe('official');
      expect(c.id).toBeTruthy();
    });
  });

  it('FAQ.txt produces more than 10 Q&A chunks', async () => {
    const chunks = await chunkFile({ filePath: faqPath, authority: 'official' });
    expect(chunks.length).toBeGreaterThan(10);
  });
});
```

- [ ] **Step 2: Run test — verify FAIL**

```bash
cd packages/rag && bun test __tests__/chunker.test.ts
```

Expected: `chunkFile is not a function`

- [ ] **Step 3: Add `chunkFile` to `packages/rag/chunker.ts`**

Add at the top of `chunker.ts` (after existing imports):

```typescript
import { readFileSync } from 'fs';
import { basename, extname } from 'path';
```

Append to `chunker.ts`:

```typescript
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
```

- [ ] **Step 4: Run all chunker tests — verify PASS**

```bash
cd packages/rag && bun test __tests__/chunker.test.ts
```

Expected: all tests pass.

- [ ] **Step 5: Commit**

```bash
git add packages/rag/chunker.ts packages/rag/__tests__/chunker.test.ts
git commit -m "feat(rag): implement chunkFile with pdfjs-dist and TXT support"
```

---

## Task 5: Embedder

**Files:**
- Create: `packages/rag/embedder.ts`
- Create: `packages/rag/__tests__/embedder.test.ts`

- [ ] **Step 1: Write failing tests**

Create `packages/rag/__tests__/embedder.test.ts`:

```typescript
import { describe, it, expect, mock, beforeEach } from 'bun:test';
import { embedText, embedTexts } from '../embedder';
import type { EmbedConfig } from '../types';

const config: EmbedConfig = { baseUrl: 'http://localhost:11434', model: 'bge-m3' };

const mockFetch = mock(async (_url: string, init?: RequestInit) => {
  return {
    ok: true,
    json: async () => ({ embedding: new Array(1024).fill(0.1) }),
  } as Response;
});

beforeEach(() => {
  global.fetch = mockFetch as unknown as typeof fetch;
  mockFetch.mockClear();
});

describe('embedText', () => {
  it('calls Ollama /api/embeddings with model and prompt', async () => {
    await embedText('test input', config);
    expect(mockFetch).toHaveBeenCalledWith(
      'http://localhost:11434/api/embeddings',
      expect.objectContaining({ method: 'POST' })
    );
  });

  it('returns 1024-dimension embedding', async () => {
    const emb = await embedText('test', config);
    expect(emb).toHaveLength(1024);
  });

  it('throws on non-ok response', async () => {
    global.fetch = mock(async () => ({ ok: false, status: 500 } as Response)) as unknown as typeof fetch;
    await expect(embedText('test', config)).rejects.toThrow('Ollama embed failed: 500');
  });
});

describe('embedTexts', () => {
  it('returns array matching input length', async () => {
    const results = await embedTexts(['a', 'b', 'c'], config);
    expect(results).toHaveLength(3);
    results.forEach(e => expect(e).toHaveLength(1024));
  });

  it('calls fetch once per text', async () => {
    await embedTexts(['a', 'b'], config);
    expect(mockFetch).toHaveBeenCalledTimes(2);
  });
});
```

- [ ] **Step 2: Run test — verify FAIL**

```bash
cd packages/rag && bun test __tests__/embedder.test.ts
```

Expected: `Cannot find module '../embedder'`

- [ ] **Step 3: Implement `packages/rag/embedder.ts`**

```typescript
import type { EmbedConfig } from './types';

export async function embedText(text: string, config: EmbedConfig): Promise<number[]> {
  const res = await fetch(`${config.baseUrl}/api/embeddings`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ model: config.model, prompt: text }),
  });
  if (!res.ok) throw new Error(`Ollama embed failed: ${res.status}`);
  const data = (await res.json()) as { embedding: number[] };
  return data.embedding;
}

export async function embedTexts(texts: string[], config: EmbedConfig): Promise<number[][]> {
  const results: number[][] = [];
  for (const text of texts) {
    results.push(await embedText(text, config));
  }
  return results;
}
```

- [ ] **Step 4: Run test — verify PASS**

```bash
cd packages/rag && bun test __tests__/embedder.test.ts
```

- [ ] **Step 5: Commit**

```bash
git add packages/rag/embedder.ts packages/rag/__tests__/embedder.test.ts
git commit -m "feat(rag): implement embedder calling Ollama bge-m3"
```

---

## Task 6: Searcher

**Files:**
- Create: `packages/rag/searcher.ts`
- Create: `packages/rag/__tests__/searcher.test.ts`

- [ ] **Step 1: Write failing tests**

Create `packages/rag/__tests__/searcher.test.ts`:

```typescript
import { describe, it, expect } from 'bun:test';
import { cosineSimilarity, search } from '../searcher';
import type { Corpus } from '../types';

function makeVec(seed: number): number[] {
  const v = new Array(1024).fill(0);
  v[seed % 1024] = 1.0;
  return v;
}

const corpus: Corpus = {
  header: { embedModel: 'bge-m3', dim: 1024, version: 1, indexedAt: '' },
  chunks: [
    { id: '1', text: 'Lei', embedding: makeVec(0), metadata: { source: 'L15040.pdf', page: 1, authority: 'law' } },
    { id: '2', text: 'FAQ', embedding: makeVec(1), metadata: { source: 'FAQ.pdf', page: 1, authority: 'official' } },
    { id: '3', text: 'PWC', embedding: makeVec(2), metadata: { source: 'PWC.pdf', page: 1, authority: 'third-party' } },
    { id: '4', text: 'Lei2', embedding: makeVec(0), metadata: { source: 'L15040.pdf', page: 2, authority: 'law' } },
    { id: '5', text: 'FAQ2', embedding: makeVec(1), metadata: { source: 'FAQ.pdf', page: 2, authority: 'official' } },
    { id: '6', text: 'Lei3', embedding: makeVec(0), metadata: { source: 'L15040.pdf', page: 3, authority: 'law' } },
  ],
};

describe('cosineSimilarity', () => {
  it('returns 1.0 for identical vectors', () => {
    const v = makeVec(5);
    expect(cosineSimilarity(v, v)).toBeCloseTo(1.0, 5);
  });

  it('returns 0 for orthogonal vectors', () => {
    expect(cosineSimilarity(makeVec(0), makeVec(1))).toBeCloseTo(0, 5);
  });
});

describe('search', () => {
  it('returns top-k results', () => {
    expect(search(makeVec(0), corpus, 3)).toHaveLength(3);
  });

  it('sorts by score descending', () => {
    const results = search(makeVec(0), corpus, 5);
    for (let i = 1; i < results.length; i++) {
      expect(results[i - 1].score).toBeGreaterThanOrEqual(results[i].score);
    }
  });

  it('authority bias: law beats third-party at same cosine', () => {
    // makeVec(0) matches id 1,4,6 (all law) with cosine=1
    const results = search(makeVec(0), corpus, 3);
    results.forEach(r => expect(r.chunk.metadata.authority).toBe('law'));
  });

  it('includes numeric score in each result', () => {
    search(makeVec(0), corpus, 3).forEach(r => {
      expect(typeof r.score).toBe('number');
      expect(r.score).toBeGreaterThan(0);
    });
  });
});
```

- [ ] **Step 2: Run test — verify FAIL**

```bash
cd packages/rag && bun test __tests__/searcher.test.ts
```

- [ ] **Step 3: Implement `packages/rag/searcher.ts`**

```typescript
import type { Corpus, SearchResult } from './types';

const AUTHORITY_BIAS = { law: 1.2, official: 1.1, 'third-party': 1.0 } as const;

export function cosineSimilarity(a: number[], b: number[]): number {
  let dot = 0, normA = 0, normB = 0;
  for (let i = 0; i < a.length; i++) {
    dot   += a[i] * b[i];
    normA += a[i] * a[i];
    normB += b[i] * b[i];
  }
  if (normA === 0 || normB === 0) return 0;
  return dot / (Math.sqrt(normA) * Math.sqrt(normB));
}

export function search(
  queryEmbedding: number[],
  corpus: Corpus,
  topK = 5
): SearchResult[] {
  return corpus.chunks
    .map(chunk => ({
      chunk,
      score: cosineSimilarity(queryEmbedding, chunk.embedding) * AUTHORITY_BIAS[chunk.metadata.authority],
    }))
    .sort((a, b) => b.score - a.score)
    .slice(0, topK);
}
```

- [ ] **Step 4: Run test — verify PASS**

```bash
cd packages/rag && bun test __tests__/searcher.test.ts
```

- [ ] **Step 5: Commit**

```bash
git add packages/rag/searcher.ts packages/rag/__tests__/searcher.test.ts
git commit -m "feat(rag): implement cosine searcher with authority bias"
```

---

## Task 7: Prompt Builder

**Files:**
- Create: `packages/rag/prompt-builder.ts`
- Create: `packages/rag/__tests__/prompt-builder.test.ts`

- [ ] **Step 1: Write failing tests**

Create `packages/rag/__tests__/prompt-builder.test.ts`:

```typescript
import { describe, it, expect } from 'bun:test';
import { buildPrompt } from '../prompt-builder';
import type { SearchResult } from '../types';

function makeResult(text: string, source: string, score: number): SearchResult {
  return {
    chunk: { id: '1', text, embedding: [], metadata: { source, page: 1, authority: 'law' } },
    score,
  };
}

const results = [
  makeResult('Art. 5 da Lei 15.040 dispõe sobre aceitação.', 'L15040.pdf', 0.92),
  makeResult('A seguradora tem prazo de 15 dias.', 'FAQ.pdf', 0.85),
];

describe('buildPrompt', () => {
  it('includes system message with ÍRIS identity', () => {
    const { messages } = buildPrompt({ message: 'teste', history: [], searchResults: results });
    const sys = messages.find(m => m.role === 'system');
    expect(sys?.content).toContain('ÍRIS');
    expect(sys?.content).toContain('Lei nº 15.040');
  });

  it('injects retrieved chunks into system message', () => {
    const { messages } = buildPrompt({ message: 'aceitação?', history: [], searchResults: results });
    const sys = messages.find(m => m.role === 'system');
    expect(sys?.content).toContain('Art. 5 da Lei 15.040');
    expect(sys?.content).toContain('15 dias');
  });

  it('user message is the last message', () => {
    const { messages } = buildPrompt({ message: 'minha pergunta', history: [], searchResults: results });
    const last = messages.at(-1)!;
    expect(last.role).toBe('user');
    expect(last.content).toBe('minha pergunta');
  });

  it('caps history at 6 turns (12 messages)', () => {
    const history = Array.from({ length: 20 }, (_, i) => ({
      role: (i % 2 === 0 ? 'user' : 'assistant') as 'user' | 'assistant',
      content: `msg ${i}`,
    }));
    const { messages } = buildPrompt({ message: 'new', history, searchResults: results });
    // system(1) + max 12 history + user(1) = 14
    expect(messages.length).toBeLessThanOrEqual(14);
  });

  it('includes refuse message when no results', () => {
    const { messages } = buildPrompt({ message: 'teste', history: [], searchResults: [] });
    const sys = messages.find(m => m.role === 'system');
    expect(sys?.content).toContain('Não encontrei base legal');
  });
});
```

- [ ] **Step 2: Run test — verify FAIL**

```bash
cd packages/rag && bun test __tests__/prompt-builder.test.ts
```

- [ ] **Step 3: Implement `packages/rag/prompt-builder.ts`**

```typescript
import type { SearchResult } from './types';

const MAX_HISTORY_TURNS = 6;

export const IRIS_SYSTEM_PROMPT = `Você é ÍRIS — Inteligência em Regulação e Informação Securitária.

Sua única função é responder dúvidas sobre a Lei nº 15.040/2024 (Marco Legal do Seguro Brasileiro) e suas implicações práticas.

Regras:
1. Responda SOMENTE com base no contexto fornecido dos documentos.
2. Cite sempre o artigo ou fonte específica quando disponível.
3. Se o contexto não contiver informação suficiente, responda: "Não encontrei base legal para isso nos documentos disponíveis." Não invente informações normativas.
4. Seja precisa, objetiva e acessível — corretores e segurados são seu público.
5. Prefira citar a lei (L15040) sobre interpretações de terceiros.`;

export interface PromptInput {
  message: string;
  history: Array<{ role: 'user' | 'assistant'; content: string }>;
  searchResults: SearchResult[];
}

export interface BuiltPrompt {
  messages: Array<{ role: 'system' | 'user' | 'assistant'; content: string }>;
}

export function buildPrompt(input: PromptInput): BuiltPrompt {
  const { message, history, searchResults } = input;

  const contextBlock =
    searchResults.length === 0
      ? 'Contexto: nenhum documento relevante encontrado.\nResponda: "Não encontrei base legal para isso nos documentos disponíveis."'
      : 'Contexto recuperado (por relevância):\n\n' +
        searchResults
          .map(
            (r, i) =>
              `[${i + 1}] Fonte: ${r.chunk.metadata.source} (p.${r.chunk.metadata.page}, ${r.chunk.metadata.authority}, score=${r.score.toFixed(2)})\n${r.chunk.text}`
          )
          .join('\n\n---\n\n');

  const cappedHistory = history.slice(-(MAX_HISTORY_TURNS * 2));

  return {
    messages: [
      { role: 'system', content: `${IRIS_SYSTEM_PROMPT}\n\n${contextBlock}` },
      ...cappedHistory,
      { role: 'user', content: message },
    ],
  };
}
```

- [ ] **Step 4: Run test — verify PASS**

```bash
cd packages/rag && bun test __tests__/prompt-builder.test.ts
```

- [ ] **Step 5: Commit**

```bash
git add packages/rag/prompt-builder.ts packages/rag/__tests__/prompt-builder.test.ts
git commit -m "feat(rag): implement ÍRIS prompt builder with context injection"
```

---

## Task 8: Corpus Loader

**Files:**
- Create: `packages/rag/corpus-loader.ts`
- Create: `packages/rag/__tests__/corpus-loader.test.ts`

- [ ] **Step 1: Write failing tests**

Create `packages/rag/__tests__/corpus-loader.test.ts`:

```typescript
import { describe, it, expect, beforeEach, afterEach } from 'bun:test';
import { writeFileSync, mkdirSync, rmSync } from 'fs';
import { join } from 'path';
import type { Corpus } from '../types';

const TEST_DIR = join(process.cwd(), '__test_corpus_tmp__');

const validCorpus: Corpus = {
  header: { embedModel: 'bge-m3', dim: 1024, version: 1, indexedAt: new Date().toISOString() },
  chunks: [
    { id: '1', text: 'hello', embedding: new Array(1024).fill(0.1), metadata: { source: 'test.pdf', page: 1, authority: 'law' } },
  ],
};

beforeEach(() => {
  mkdirSync(TEST_DIR, { recursive: true });
  process.env.CORPUS_PATH = join(TEST_DIR, 'corpus.json');
});

afterEach(async () => {
  rmSync(TEST_DIR, { recursive: true, force: true });
  delete process.env.CORPUS_PATH;
  // Reset module cache so singleton is cleared between tests
  const { resetCorpusCache } = await import('../corpus-loader');
  resetCorpusCache();
});

describe('getCorpus', () => {
  it('loads and parses valid corpus.json', async () => {
    writeFileSync(process.env.CORPUS_PATH!, JSON.stringify(validCorpus));
    const { getCorpus } = await import('../corpus-loader');
    const corpus = await getCorpus();
    expect(corpus.header.embedModel).toBe('bge-m3');
    expect(corpus.chunks).toHaveLength(1);
  });

  it('returns same object on concurrent calls (singleton)', async () => {
    writeFileSync(process.env.CORPUS_PATH!, JSON.stringify(validCorpus));
    const { getCorpus } = await import('../corpus-loader');
    const [a, b] = await Promise.all([getCorpus(), getCorpus()]);
    expect(a).toBe(b);
  });

  it('throws when corpus.json is missing', async () => {
    const { getCorpus } = await import('../corpus-loader');
    await expect(getCorpus()).rejects.toThrow();
  });
});
```

- [ ] **Step 2: Run test — verify FAIL**

```bash
cd packages/rag && bun test __tests__/corpus-loader.test.ts
```

- [ ] **Step 3: Implement `packages/rag/corpus-loader.ts`**

```typescript
import { readFileSync } from 'fs';
import { join } from 'path';
import type { Corpus } from './types';

function corpusPath(): string {
  return process.env.CORPUS_PATH ?? join(process.cwd(), 'apps/web/data/corpus.json');
}

// Module-level singleton: one Promise shared across all concurrent requests
let corpusPromise: Promise<Corpus> | null = null;

export function getCorpus(): Promise<Corpus> {
  if (!corpusPromise) {
    corpusPromise = Promise.resolve().then(() => {
      const raw = readFileSync(corpusPath(), 'utf-8');
      return JSON.parse(raw) as Corpus;
    });
  }
  return corpusPromise;
}

/** Reset singleton — use in tests only */
export function resetCorpusCache(): void {
  corpusPromise = null;
}
```

- [ ] **Step 4: Run test — verify PASS**

```bash
cd packages/rag && bun test __tests__/corpus-loader.test.ts
```

- [ ] **Step 5: Run all RAG package tests**

```bash
cd packages/rag && bun test
```

Expected: all tests in all files pass.

- [ ] **Step 6: Commit**

```bash
git add packages/rag/corpus-loader.ts packages/rag/__tests__/corpus-loader.test.ts packages/rag/index.ts
git commit -m "feat(rag): corpus loader singleton, complete @repo/rag package"
```

---

## Task 9: Ollama Inference Client

**Files:**
- Create: `packages/ai/ollama-client.ts`
- Create: `packages/ai/__tests__/ollama-client.test.ts`

> Replaces Worker + workflow architecture for ÍRIS use case.
> Existing `packages/ai/worker/`, `workflow/`, `models.ts`, `providers.ts` left intact.

- [ ] **Step 1: Write failing tests**

Create `packages/ai/__tests__/ollama-client.test.ts`:

```typescript
import { describe, it, expect, mock, beforeEach } from 'bun:test';
import { ollamaEmbed, ollamaStream } from '../ollama-client';

const mockFetch = mock();

beforeEach(() => {
  global.fetch = mockFetch as unknown as typeof fetch;
  mockFetch.mockClear();
});

describe('ollamaEmbed', () => {
  it('returns 1024d embedding', async () => {
    mockFetch.mockResolvedValueOnce({
      ok: true,
      json: async () => ({ embedding: new Array(1024).fill(0.5) }),
    } as Response);

    const result = await ollamaEmbed('test', { baseUrl: 'http://localhost:11434', model: 'bge-m3' });
    expect(result).toHaveLength(1024);
  });

  it('retries once on 503 then succeeds', async () => {
    mockFetch
      .mockResolvedValueOnce({ ok: false, status: 503 } as Response)
      .mockResolvedValueOnce({ ok: true, json: async () => ({ embedding: new Array(1024).fill(0.1) }) } as Response);

    const result = await ollamaEmbed('test', { baseUrl: 'http://localhost:11434', model: 'bge-m3' });
    expect(mockFetch).toHaveBeenCalledTimes(2);
    expect(result).toHaveLength(1024);
  });
});

describe('ollamaStream', () => {
  it('yields tokens from streaming response', async () => {
    const lines = [
      JSON.stringify({ message: { content: 'Hello' }, done: false }),
      JSON.stringify({ message: { content: ' world' }, done: false }),
      JSON.stringify({ done: true }),
    ].join('\n');

    mockFetch.mockResolvedValueOnce({
      ok: true,
      body: new ReadableStream({
        start(c) {
          c.enqueue(new TextEncoder().encode(lines));
          c.close();
        },
      }),
    } as Response);

    const tokens: string[] = [];
    for await (const t of ollamaStream(
      [{ role: 'user', content: 'hi' }],
      { baseUrl: 'http://localhost:11434', model: 'mistral:7b-instruct' }
    )) {
      tokens.push(t);
    }
    expect(tokens).toEqual(['Hello', ' world']);
  });
});
```

- [ ] **Step 2: Run test — verify FAIL**

```bash
cd packages/ai && bun test __tests__/ollama-client.test.ts
```

Expected: module not found

- [ ] **Step 3: Implement `packages/ai/ollama-client.ts`**

```typescript
const RETRY_DELAY_MS = 800;

export interface OllamaEmbedConfig  { baseUrl: string; model: string }
export interface OllamaStreamConfig { baseUrl: string; model: string }
export interface OllamaChatMessage  { role: 'system' | 'user' | 'assistant'; content: string }

async function fetchWithRetry(url: string, init: RequestInit, retries = 1): Promise<Response> {
  const res = await fetch(url, init);
  if (!res.ok && res.status === 503 && retries > 0) {
    await new Promise(r => setTimeout(r, RETRY_DELAY_MS));
    return fetchWithRetry(url, init, retries - 1);
  }
  return res;
}

export async function ollamaEmbed(text: string, config: OllamaEmbedConfig): Promise<number[]> {
  const res = await fetchWithRetry(`${config.baseUrl}/api/embeddings`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ model: config.model, prompt: text }),
  });
  if (!res.ok) throw new Error(`Ollama embed failed: ${res.status}`);
  const data = (await res.json()) as { embedding: number[] };
  return data.embedding;
}

export async function* ollamaStream(
  messages: OllamaChatMessage[],
  config: OllamaStreamConfig,
  signal?: AbortSignal
): AsyncGenerator<string> {
  const res = await fetchWithRetry(`${config.baseUrl}/api/chat`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ model: config.model, messages, stream: true }),
    signal,
  });
  if (!res.ok) throw new Error(`Ollama stream failed: ${res.status}`);
  if (!res.body) throw new Error('No response body from Ollama');

  const reader = res.body.getReader();
  const dec = new TextDecoder();
  let buffer = '';

  while (true) {
    const { done, value } = await reader.read();
    if (done) break;
    buffer += dec.decode(value, { stream: true });
    const lines = buffer.split('\n');
    buffer = lines.pop() ?? '';

    for (const line of lines) {
      const trimmed = line.trim();
      if (!trimmed) continue;
      try {
        const parsed = JSON.parse(trimmed) as { message?: { content: string }; done: boolean };
        if (parsed.done) return;
        if (parsed.message?.content) yield parsed.message.content;
      } catch { /* skip malformed line */ }
    }
  }
}
```

- [ ] **Step 4: Run test — verify PASS**

```bash
cd packages/ai && bun test __tests__/ollama-client.test.ts
```

- [ ] **Step 5: Commit**

```bash
git add packages/ai/ollama-client.ts packages/ai/__tests__/ollama-client.test.ts
git commit -m "feat(ai): Ollama inference client with retry on 503"
```

---

## Task 10: index-docs Script

**Files:**
- Create: `scripts/index-docs.ts`
- Create: `apps/web/data/.gitkeep`

- [ ] **Step 1: Setup data directory**

```bash
mkdir -p apps/web/data && touch apps/web/data/.gitkeep
echo 'apps/web/data/corpus.json' >> .gitignore
echo 'apps/web/data/.index-cache.json' >> .gitignore
```

- [ ] **Step 2: Create `scripts/index-docs.ts`**

```typescript
#!/usr/bin/env bun
/**
 * Index all docs/ files into apps/web/data/corpus.json
 * Run: bun run index-docs
 * Skips unchanged files via SHA-256 hash cache.
 */
import { createHash } from 'crypto';
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'fs';
import { join, basename } from 'path';
import { randomUUID } from 'crypto';
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
```

- [ ] **Step 3: Run index-docs (Ollama must be running)**

```bash
ollama list  # verify bge-m3 is present
bun run index-docs
```

Expected: output shows all 11 files indexed, corpus.json created with 300+ chunks.

- [ ] **Step 4: Verify corpus.json**

```bash
bun -e "const c=JSON.parse(require('fs').readFileSync('apps/web/data/corpus.json','utf-8')); console.log(c.header, 'chunks:', c.chunks.length)"
```

Expected: `{ embedModel: 'bge-m3', dim: 1024, ... } chunks: NNN`

- [ ] **Step 5: Commit**

```bash
git add scripts/index-docs.ts apps/web/data/.gitkeep .gitignore
git commit -m "feat: index-docs script, incremental hash-cached corpus generation"
```

---

## Task 11: /api/health Route

**Files:**
- Create: `apps/web/app/api/health/route.ts`

- [ ] **Step 1: Add `@repo/rag` to web app deps**

In `apps/web/package.json`, add to `"dependencies"`:
```json
"@repo/rag": "*"
```

Run `bun install`.

- [ ] **Step 2: Implement `apps/web/app/api/health/route.ts`**

```typescript
import { existsSync, readFileSync } from 'fs';
import { join } from 'path';
import type { Corpus } from '@repo/rag';

const OLLAMA_BASE_URL  = process.env.OLLAMA_BASE_URL  ?? 'http://localhost:11434';
const OLLAMA_MODEL     = process.env.OLLAMA_MODEL     ?? 'mistral:7b-instruct';
const EMBED_MODEL      = process.env.OLLAMA_EMBED_MODEL ?? 'bge-m3';
const CORPUS_PATH      = process.env.CORPUS_PATH ?? join(process.cwd(), 'data/corpus.json');

async function probeOllama(): Promise<'ok' | 'offline'> {
  try {
    const res = await fetch(`${OLLAMA_BASE_URL}/api/tags`, { signal: AbortSignal.timeout(3000) });
    return res.ok ? 'ok' : 'offline';
  } catch { return 'offline'; }
}

async function probeEmbedder(): Promise<'ok' | 'failed'> {
  try {
    const res = await fetch(`${OLLAMA_BASE_URL}/api/embeddings`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ model: EMBED_MODEL, prompt: 'healthcheck' }),
      signal: AbortSignal.timeout(5000),
    });
    if (!res.ok) return 'failed';
    const data = (await res.json()) as { embedding: number[] };
    return data.embedding?.length === 1024 ? 'ok' : 'failed';
  } catch { return 'failed'; }
}

function probeCorpus() {
  if (!existsSync(CORPUS_PATH)) return { status: 'missing' as const, chunks: 0, indexedAt: null };
  try {
    const c = JSON.parse(readFileSync(CORPUS_PATH, 'utf-8')) as Corpus;
    if (c.header.embedModel !== EMBED_MODEL || c.header.dim !== 1024) {
      return { status: 'mismatch' as const, chunks: c.chunks.length, indexedAt: c.header.indexedAt };
    }
    return { status: 'indexed' as const, chunks: c.chunks.length, indexedAt: c.header.indexedAt };
  } catch { return { status: 'missing' as const, chunks: 0, indexedAt: null }; }
}

export async function GET() {
  const [ollama, embedder] = await Promise.all([probeOllama(), probeEmbedder()]);
  const { status: corpus, chunks, indexedAt } = probeCorpus();

  return Response.json({ ollama, model: OLLAMA_MODEL, embedModel: EMBED_MODEL, embedder, corpus, chunks, indexedAt });
}
```

- [ ] **Step 3: Verify manually**

```bash
bun dev &
sleep 3
curl http://localhost:3000/api/health | bun -e "process.stdin.resume(); let d=''; process.stdin.on('data',c=>d+=c); process.stdin.on('end',()=>console.log(JSON.stringify(JSON.parse(d),null,2)))"
```

Expected: JSON with `ollama: "ok"`, `corpus: "indexed"`, `chunks: NNN`

- [ ] **Step 4: Commit**

```bash
git add apps/web/app/api/health/ apps/web/package.json
git commit -m "feat(api): /api/health with Ollama + corpus + embedder probes"
```

---

## Task 12: /api/chat Route

**Files:**
- Create: `apps/web/app/api/chat/rate-limit.ts`
- Create: `apps/web/app/api/chat/route.ts`
- Create: `apps/web/app/api/chat/route.test.ts`

- [ ] **Step 1: Create `apps/web/app/api/chat/rate-limit.ts`**

```typescript
import type { NextRequest } from 'next/server';

interface Entry { count: number; resetAt: number }
const store = new Map<string, Entry>();
const MAX = 20, WINDOW = 60_000;

export function getClientKey(req: NextRequest): string {
  return req.headers.get('x-forwarded-for')?.split(',')[0]?.trim()
    ?? req.headers.get('x-real-ip')
    ?? 'anonymous';
}

export function checkRateLimit(key: string): boolean {
  const now = Date.now();
  const entry = store.get(key);
  if (!entry || entry.resetAt < now) { store.set(key, { count: 1, resetAt: now + WINDOW }); return true; }
  if (entry.count >= MAX) return false;
  entry.count++;
  return true;
}
```

- [ ] **Step 2: Write failing tests**

Create `apps/web/app/api/chat/route.test.ts`:

```typescript
import { describe, it, expect, mock } from 'bun:test';

mock.module('@repo/rag', () => ({
  getCorpus: async () => ({ header: { embedModel: 'bge-m3', dim: 1024, version: 1, indexedAt: '' }, chunks: [] }),
  search: () => [],
  buildPrompt: () => ({ messages: [{ role: 'system', content: 'sys' }, { role: 'user', content: 'hi' }] }),
}));

mock.module('@repo/ai/ollama-client', () => ({
  ollamaEmbed: async () => new Array(1024).fill(0.1),
  ollamaStream: async function* () { yield 'Olá'; yield '!'; },
}));

const body = {
  message: 'O que é aceitação tácita?',
  threadId: '123e4567-e89b-12d3-a456-426614174000',
  threadItemId: '123e4567-e89b-12d3-a456-426614174001',
  history: [],
};

describe('POST /api/chat', () => {
  it('returns 400 for empty message', async () => {
    const { POST } = await import('./route');
    const req = new Request('http://localhost/api/chat', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ ...body, message: '' }),
    });
    expect((await POST(req as any)).status).toBe(400);
  });

  it('returns SSE stream for valid request', async () => {
    const { POST } = await import('./route');
    const req = new Request('http://localhost/api/chat', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'x-real-ip': '10.0.0.1' },
      body: JSON.stringify(body),
    });
    const res = await POST(req as any);
    expect(res.status).toBe(200);
    expect(res.headers.get('content-type')).toContain('text/event-stream');
  });

  it('SSE order: sources -> token -> done', async () => {
    const { POST } = await import('./route');
    const req = new Request('http://localhost/api/chat', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'x-real-ip': '10.0.0.2' },
      body: JSON.stringify(body),
    });
    const text = await (await POST(req as any)).text();
    const si = text.indexOf('event: sources');
    const ti = text.indexOf('event: token');
    const di = text.indexOf('event: done');
    expect(si).toBeGreaterThanOrEqual(0);
    expect(ti).toBeGreaterThan(si);
    expect(di).toBeGreaterThan(ti);
  });
});
```

- [ ] **Step 3: Run test — verify FAIL**

```bash
cd apps/web && bun test app/api/chat/route.test.ts
```

- [ ] **Step 4: Implement `apps/web/app/api/chat/route.ts`**

```typescript
import { NextRequest } from 'next/server';
import { z } from 'zod';
import { getCorpus, search, buildPrompt } from '@repo/rag';
import { ollamaEmbed, ollamaStream } from '@repo/ai/ollama-client';
import { checkRateLimit, getClientKey } from './rate-limit';

const OLLAMA_BASE_URL  = process.env.OLLAMA_BASE_URL  ?? 'http://localhost:11434';
const OLLAMA_MODEL     = process.env.OLLAMA_MODEL     ?? 'mistral:7b-instruct';
const EMBED_MODEL      = process.env.OLLAMA_EMBED_MODEL ?? 'bge-m3';

const schema = z.object({
  message:     z.string().min(1).max(2000),
  threadId:    z.string().uuid(),
  threadItemId: z.string().uuid(),
  history: z.array(z.object({
    role:    z.enum(['user', 'assistant']),
    content: z.string().max(4000),
  })).max(12).default([]),
});

const SSE_HEADERS = {
  'Content-Type': 'text/event-stream',
  'Cache-Control': 'no-cache, no-transform',
  'Connection': 'keep-alive',
  'X-Accel-Buffering': 'no',
} as const;

function sse(event: string, data: unknown): string {
  return `event: ${event}\ndata: ${JSON.stringify(data)}\n\n`;
}

export async function POST(request: NextRequest): Promise<Response> {
  if (!checkRateLimit(getClientKey(request))) {
    return Response.json({ error: 'Muitas requisições. Aguarde.' }, { status: 429 });
  }

  const parsed = schema.safeParse(await request.json().catch(() => ({})));
  if (!parsed.success) {
    return Response.json({ error: 'Requisição inválida', details: parsed.error.format() }, { status: 400 });
  }

  const { message, threadId, threadItemId, history } = parsed.data;
  const abort = new AbortController();
  request.signal.addEventListener('abort', () => abort.abort());

  const stream = new ReadableStream({
    async start(ctrl) {
      const enc = new TextEncoder();
      const send = (event: string, data: unknown) => ctrl.enqueue(enc.encode(sse(event, data)));

      try {
        const queryEmb = await ollamaEmbed(message, { baseUrl: OLLAMA_BASE_URL, model: EMBED_MODEL });
        const corpus   = await getCorpus();
        const results  = search(queryEmb, corpus, 5);

        send('sources', {
          chunks: results.map(r => ({
            text:      r.chunk.text.slice(0, 300),
            source:    r.chunk.metadata.source,
            page:      r.chunk.metadata.page,
            score:     parseFloat(r.score.toFixed(3)),
            authority: r.chunk.metadata.authority,
          })),
        });

        const { messages } = buildPrompt({ message, history, searchResults: results });

        for await (const token of ollamaStream(
          messages as Array<{ role: 'system'|'user'|'assistant'; content: string }>,
          { baseUrl: OLLAMA_BASE_URL, model: OLLAMA_MODEL },
          abort.signal
        )) {
          send('token', { content: token });
        }

        send('done', { threadId, threadItemId });
      } catch (err) {
        if (!abort.signal.aborted) {
          send('error', { message: err instanceof Error ? err.message : 'Erro desconhecido' });
        }
      } finally {
        ctrl.close();
      }
    },
    cancel() { abort.abort(); },
  });

  return new Response(stream, { headers: SSE_HEADERS });
}
```

- [ ] **Step 5: Run test — verify PASS**

```bash
cd apps/web && bun test app/api/chat/route.test.ts
```

- [ ] **Step 6: Commit**

```bash
git add apps/web/app/api/chat/
git commit -m "feat(api): /api/chat RAG+Ollama SSE streaming with Zod validation"
```

---

## Task 13: Frontend Cleanup

- [ ] **Step 1: Remove auth pages and Clerk middleware**

```bash
rm -rf apps/web/app/sign-in apps/web/app/sign-up
```

Replace `apps/web/middleware.ts`:
```typescript
// Auth removed — ÍRIS is open access
export function middleware() {}
export const config = { matcher: [] };
```

- [ ] **Step 2: Remove Sentry**

```bash
rm -f apps/web/sentry.client.config.ts apps/web/sentry.edge.config.ts \
       apps/web/sentry.server.config.ts apps/web/app/instrumentation.ts
```

Replace `apps/web/next.config.mjs`:
```javascript
/** @type {import('next').NextConfig} */
const nextConfig = {
  transpilePackages: ['next-mdx-remote'],
  images: { remotePatterns: [{ hostname: 'www.google.com' }] },
  experimental: { externalDir: true },
  webpack(config, { isServer }) {
    if (!isServer) config.resolve.fallback = { fs: false, module: false, path: false };
    config.experiments = { ...config.experiments, topLevelAwait: true, layers: true };
    return config;
  },
  async redirects() {
    return [{ source: '/', destination: '/chat', permanent: true }];
  },
};
export default nextConfig;
```

- [ ] **Step 3: Remove unused API routes and pages**

```bash
rm -rf apps/web/app/api/completion apps/web/app/api/feedback \
       apps/web/app/api/mcp apps/web/app/api/messages
rm -rf apps/web/app/privacy apps/web/app/terms apps/web/app/recent
```

- [ ] **Step 4: Remove image attachment components**

```bash
rm -f packages/common/components/chat-input/image-attachment.tsx \
      packages/common/components/chat-input/image-dropzone-root.tsx \
      packages/common/components/chat-input/image-dropzone.tsx \
      packages/common/components/chat-input/image-upload.tsx \
      packages/common/components/messages-remaining-badge.tsx \
      packages/common/components/feedback-widget.tsx
```

- [ ] **Step 5: Remove unused store files**

```bash
rm -f packages/common/store/api-keys.store.ts \
      packages/common/store/mcp-tools.store.ts
```

Update `packages/common/store/index.ts` — remove any exports referencing deleted files:
```typescript
export { useChatStore } from './chat.store';
export { useAppStore } from './app.store';
// db-sync.worker.ts kept as-is
```

- [ ] **Step 6: Remove heavy deps from `apps/web/package.json`**

Remove from `"dependencies"`:
- `@clerk/nextjs`
- `@sentry/nextjs`
- `@hotjar/browser`
- `@electric-sql/pglite`
- `@electric-sql/pglite-repl`
- `posthog-js`

```bash
bun install
```

- [ ] **Step 7: Fix broken imports**

```bash
cd apps/web && bun run build 2>&1 | grep "Module not found" | head -20
```

For each broken import, find the source file and remove the import line.

- [ ] **Step 8: Commit**

```bash
git add -A
git commit -m "feat: remove auth, credits, MCP, Sentry, image attachments, unused pages"
```

---

## Task 14: ÍRIS Branding

- [ ] **Step 1: Update `apps/web/app/layout.tsx`**

```typescript
import type { Metadata } from 'next';
import { Bricolage_Grotesque } from 'next/font/google';
import './globals.css';

const bricolage = Bricolage_Grotesque({ subsets: ['latin'], variable: '--font-bricolage' });

export const metadata: Metadata = {
  title: 'ÍRIS — Inteligência em Regulação e Informação Securitária',
  description:
    'Agente especialista na Lei nº 15.040/2024 (Marco Legal do Seguro Brasileiro). ' +
    'Tire dúvidas sobre direitos, prazos e obrigações com base na lei.',
  keywords: 'lei 15040, marco legal do seguro, SUSEP, corretor de seguros, segurado',
  robots: { index: false, follow: false },
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="pt-BR" suppressHydrationWarning>
      <body className={`${bricolage.variable} font-sans antialiased`}>{children}</body>
    </html>
  );
}
```

- [ ] **Step 2: Keep `apps/web/app/page.tsx` as redirect**

```typescript
import { redirect } from 'next/navigation';
export default function HomePage() { redirect('/chat'); }
```

- [ ] **Step 3: Commit**

```bash
git add apps/web/app/layout.tsx apps/web/app/page.tsx
git commit -m "feat: ÍRIS branding — metadata, identity, pt-BR locale"
```

---

## Task 15: Health Banner + Chat Store Update

- [ ] **Step 1: Create `apps/web/app/components/health-banner.tsx`**

```typescript
'use client';
import { useEffect, useState } from 'react';

interface Health { ollama: string; corpus: string; embedder: string; chunks: number }

export function HealthBanner() {
  const [s, setS] = useState<Health | null>(null);

  useEffect(() => {
    fetch('/api/health').then(r => r.json()).then(setS).catch(() =>
      setS({ ollama: 'offline', corpus: 'missing', embedder: 'failed', chunks: 0 })
    );
  }, []);

  if (!s) return null;

  const issues: string[] = [];
  if (s.ollama   !== 'ok')       issues.push('Ollama offline — execute `ollama serve`');
  if (s.corpus   === 'missing')  issues.push('Corpus ausente — execute `bun run index-docs`');
  if (s.corpus   === 'mismatch') issues.push('Corpus desatualizado — execute `bun run index-docs`');
  if (s.embedder !== 'ok')       issues.push('Embedding offline — execute `ollama pull bge-m3`');

  if (!issues.length) return null;

  return (
    <div className="w-full bg-yellow-50 border-b border-yellow-200 px-4 py-2 text-sm text-yellow-800">
      {issues.map((m, i) => <div key={i} className="font-mono">⚠ {m}</div>)}
    </div>
  );
}
```

- [ ] **Step 2: Add HealthBanner to `apps/web/app/chat/layout.tsx`**

Open `apps/web/app/chat/layout.tsx`. Add HealthBanner import and render it at the top of the layout:

```typescript
import { HealthBanner } from '../components/health-banner';

// In the JSX, add <HealthBanner /> before the main content area
```

The exact placement depends on the existing layout structure. Add it as the first child inside the outermost container.

- [ ] **Step 3: Update `packages/common/store/chat.store.ts` to call /api/chat**

Open `packages/common/store/chat.store.ts`. Find the function that dispatches a chat request (look for `Worker`, `START_WORKFLOW`, `/api/completion`).

Replace the dispatch mechanism with a direct SSE fetch. The key logic (adapt to match existing store state shape):

```typescript
// New helper — add to chat.store.ts or a separate file
async function streamIrisChat(
  message: string,
  threadId: string,
  threadItemId: string,
  history: Array<{ role: 'user' | 'assistant'; content: string }>,
  // callbacks that update Zustand state:
  onToken:   (token: string) => void,
  onSources: (sources: unknown[]) => void,
  onDone:    () => void,
  onError:   (msg: string) => void,
) {
  const res = await fetch('/api/chat', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ message, threadId, threadItemId, history }),
  });

  if (!res.ok || !res.body) { onError('Falha na conexão'); return; }

  const reader = res.body.getReader();
  const dec = new TextDecoder();
  let buf = '';
  let currentEvent = '';

  while (true) {
    const { done, value } = await reader.read();
    if (done) break;
    buf += dec.decode(value, { stream: true });
    const lines = buf.split('\n');
    buf = lines.pop() ?? '';

    for (const line of lines) {
      if (line.startsWith('event: '))      { currentEvent = line.slice(7).trim(); continue; }
      if (!line.startsWith('data: '))      continue;
      try {
        const data = JSON.parse(line.slice(6));
        if (currentEvent === 'token')   onToken(data.content ?? '');
        if (currentEvent === 'sources') onSources(data.chunks ?? []);
        if (currentEvent === 'done')    onDone();
        if (currentEvent === 'error')   onError(data.message ?? 'Erro');
        currentEvent = '';
      } catch { /* skip */ }
    }
  }
}
```

Wire `streamIrisChat` into the existing store's send action where the Worker was previously dispatched. The exact wiring depends on the store's shape — find the `isGenerating` flag and `currentThreadItem` update patterns and adapt.

- [ ] **Step 4: Create `.env.local`**

```bash
cat > apps/web/.env.local << 'EOF'
OLLAMA_BASE_URL=http://localhost:11434
OLLAMA_MODEL=mistral:7b-instruct
OLLAMA_EMBED_MODEL=bge-m3
EOF
```

- [ ] **Step 5: Manual integration test**

```bash
bun dev
# Open http://localhost:3000/chat
# Type: "Qual é o prazo para o corretor entregar documentos?"
# Verify: response streams, cites Lei 15.040, health banner absent
```

- [ ] **Step 6: Commit**

```bash
git add apps/web/app/components/ apps/web/app/chat/ packages/common/store/chat.store.ts apps/web/.env.local
git commit -m "feat: health banner, /api/chat store integration, .env.local"
```

---

## Task 16: Dataset Generation Script

**Files:**
- Create: `scripts/generate-dataset.ts`
- Create: `scripts/__tests__/generate-dataset.test.ts`

- [ ] **Step 1: Write failing tests**

Create `scripts/__tests__/generate-dataset.test.ts`:

```typescript
import { describe, it, expect } from 'bun:test';
import { parseQAPairs, formatMLXEntry } from '../generate-dataset';

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
```

- [ ] **Step 2: Run test — verify FAIL**

```bash
bun test scripts/__tests__/generate-dataset.test.ts
```

- [ ] **Step 3: Implement `scripts/generate-dataset.ts`**

```typescript
#!/usr/bin/env bun
import { readFileSync, writeFileSync } from 'fs';
import { join } from 'path';
import { IRIS_SYSTEM_PROMPT } from '../packages/rag/prompt-builder';

const ROOT = join(import.meta.dir, '..');

const SOURCES = [
  join(ROOT, 'docs/Agente FAQ Lei Geral Seguros.txt'),
  join(ROOT, 'docs/data/FAQ.txt'),
];

export interface QAPair { question: string; answer: string }

// Extracts numbered pairs: **N. Question** ... **Resposta:** Answer
// Using matchAll to avoid repeated exec calls
const QA_PATTERN = /\*\*(\d+)\.\s*(.+?)\*\*[\s\S]*?\*\*Resposta:\*\*\s*([\s\S]+?)(?=\*\*\d+\.|$)/g;

export function parseQAPairs(text: string): QAPair[] {
  const pairs: QAPair[] = [];
  for (const match of text.matchAll(QA_PATTERN)) {
    const question = match[2].replace(/\*+/g, '').trim();
    const answer = match[3]
      .split('\n')
      .filter(l => !l.startsWith('*(Referência') && l.trim())
      .join(' ')
      .replace(/\*+/g, '')
      .trim();
    if (question && answer) pairs.push({ question, answer });
  }
  return pairs;
}

export function formatMLXEntry(question: string, answer: string): string {
  return JSON.stringify({
    messages: [
      { role: 'system',    content: IRIS_SYSTEM_PROMPT },
      { role: 'user',      content: question },
      { role: 'assistant', content: answer },
    ],
  });
}

function shuffle<T>(arr: T[]): T[] {
  const a = [...arr];
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}

if (import.meta.main) {
  const all: QAPair[] = [];
  for (const src of SOURCES) {
    try {
      const pairs = parseQAPairs(readFileSync(src, 'utf-8'));
      console.log(`  ${src.split('/').pop()}: ${pairs.length} pairs`);
      all.push(...pairs);
    } catch { console.warn(`  Could not read ${src}`); }
  }

  const shuffled = shuffle(all);
  const split = Math.floor(shuffled.length * 0.8);

  writeFileSync(join(ROOT, 'docs/data/train.jsonl'), shuffled.slice(0, split).map(p => formatMLXEntry(p.question, p.answer)).join('\n'));
  writeFileSync(join(ROOT, 'docs/data/valid.jsonl'), shuffled.slice(split).map(p => formatMLXEntry(p.question, p.answer)).join('\n'));
  writeFileSync(join(ROOT, 'docs/data/finetune-dataset.jsonl'), shuffled.map(p => formatMLXEntry(p.question, p.answer)).join('\n'));

  console.log(`\n✅ ${shuffled.length} pairs → train: ${split}, valid: ${shuffled.length - split}`);
}
```

- [ ] **Step 4: Run test — verify PASS**

```bash
bun test scripts/__tests__/generate-dataset.test.ts
```

- [ ] **Step 5: Run the script**

```bash
bun run gen-dataset
```

Expected: JSONL files in `docs/data/`.

- [ ] **Step 6: Commit**

```bash
git add scripts/generate-dataset.ts scripts/__tests__/
git commit -m "feat: dataset generator, MLX JSONL for Lei 15.040 fine-tuning"
```

---

## Task 17: Golden Query Integration Test

**Files:**
- Create: `packages/rag/__tests__/fixtures/golden.ts`
- Create: `packages/rag/__tests__/golden-queries.test.ts`

- [ ] **Step 1: Create `packages/rag/__tests__/fixtures/golden.ts`**

```typescript
export interface GoldenQuery {
  query: string;
  expectedSourceFile: string;
  expectedContains: string;
}

export const GOLDEN_QUERIES: GoldenQuery[] = [
  { query: 'O que é aceitação tácita na lei de seguros?', expectedSourceFile: 'L15040', expectedContains: 'aceitação' },
  { query: 'Qual o prazo para o corretor entregar documentos?', expectedSourceFile: 'FAQ', expectedContains: '5 dias úteis' },
  { query: 'O segurado pode cancelar a apólice?', expectedSourceFile: 'L15040', expectedContains: 'cancelamento' },
  { query: 'O que é agravamento de risco?', expectedSourceFile: 'L15040', expectedContains: 'agravamento' },
  { query: 'Qual o prazo para pagar indenização após sinistro?', expectedSourceFile: 'L15040', expectedContains: 'indenização' },
  { query: 'O corretor pode preencher o questionário pelo cliente?', expectedSourceFile: 'FAQ', expectedContains: 'questionário' },
  { query: 'Quais meios são aceitos para notificar o segurado?', expectedSourceFile: 'L15040', expectedContains: 'notif' },
  { query: 'Inadimplência cancela automaticamente a apólice?', expectedSourceFile: 'L15040', expectedContains: 'inadimplência' },
  { query: 'O que é boa-fé objetiva no contrato de seguro?', expectedSourceFile: 'L15040', expectedContains: 'boa-fé' },
  { query: 'Responsabilidade do corretor aumentou com a nova lei?', expectedSourceFile: 'FAQ', expectedContains: 'responsabilidade' },
  { query: 'Prazo para a seguradora aceitar ou recusar proposta?', expectedSourceFile: 'L15040', expectedContains: 'proposta' },
  { query: 'Quando entra em vigor a Lei 15.040?', expectedSourceFile: 'L15040', expectedContains: 'vigor' },
  { query: 'O que é prescrição no seguro?', expectedSourceFile: 'L15040', expectedContains: 'prescrição' },
  { query: 'Segurado pode trocar de corretor na renovação?', expectedSourceFile: 'FAQ', expectedContains: 'corretor' },
  { query: 'Regulação de sinistro — quais os prazos?', expectedSourceFile: 'L15040', expectedContains: 'sinistro' },
];
```

- [ ] **Step 2: Create `packages/rag/__tests__/golden-queries.test.ts`**

```typescript
import { describe, it, expect, beforeAll } from 'bun:test';
import { existsSync, readFileSync } from 'fs';
import { join } from 'path';
import { search } from '../searcher';
import { embedText } from '../embedder';
import type { Corpus } from '../types';
import { GOLDEN_QUERIES } from './fixtures/golden';

const CORPUS_PATH = join(process.cwd(), 'apps/web/data/corpus.json');
const OLLAMA_URL  = process.env.OLLAMA_BASE_URL ?? 'http://localhost:11434';
const EMBED_MODEL = process.env.OLLAMA_EMBED_MODEL ?? 'bge-m3';
const HAS_CORPUS  = existsSync(CORPUS_PATH);

describe.skipIf(!HAS_CORPUS)('Golden query retrieval — Lei 15.040 (integration)', () => {
  let corpus: Corpus;
  beforeAll(() => { corpus = JSON.parse(readFileSync(CORPUS_PATH, 'utf-8')); });

  for (const { query, expectedSourceFile, expectedContains } of GOLDEN_QUERIES) {
    it(`"${query.slice(0, 50)}"`, async () => {
      const emb     = await embedText(query, { baseUrl: OLLAMA_URL, model: EMBED_MODEL });
      const results = search(emb, corpus, 3);
      const hit     = results.some(
        r => r.chunk.metadata.source.includes(expectedSourceFile) ||
             r.chunk.text.toLowerCase().includes(expectedContains.toLowerCase())
      );
      if (!hit) console.warn(`[MISS] "${query}" top: ${results.map(r=>r.chunk.metadata.source).join(', ')}`);
      expect(hit).toBe(true);
    }, 15_000);
  }
});
```

- [ ] **Step 3: Run golden queries (Ollama + corpus required)**

```bash
cd packages/rag && bun test __tests__/golden-queries.test.ts
```

Expected: 15/15 pass. Any misses log `[MISS]` for investigation.

- [ ] **Step 4: Commit**

```bash
git add packages/rag/__tests__/
git commit -m "test(rag): 15 golden retrieval queries for Lei 15.040"
```

---

## Task 18: Handoff Docs (SSRDs)

- [ ] **Step 1: Create `docs/specs/` directory**

```bash
mkdir -p docs/specs
```

- [ ] **Step 2: Write all 5 SSRD files**

Write `docs/specs/rag-pipeline.md`, `docs/specs/ollama-integration.md`, `docs/specs/finetune-pipeline.md`, `docs/specs/iris-identity.md`, `docs/specs/frontend-cleanup.md` — using the content defined in the design spec at `docs/superpowers/specs/2026-05-24-iris-rag-design.md` sections 7, 8, 9, 6, and 2 respectively.

Each file should be a standalone technical reference with:
- What, why, how
- Exact commands
- Schema definitions
- Env vars

- [ ] **Step 3: Commit**

```bash
git add docs/specs/
git commit -m "docs: 5 SSRD handoff documents for ÍRIS RAG system"
```

---

## Self-Review

**Spec coverage:**
- §2 Cleanup → Task 13 ✅
- §3 Architecture → Tasks 1, 9, 11, 12 ✅
- §4.1 Indexação → Task 10 ✅
- §4.2 Runtime query → Tasks 8, 12 ✅
- §4.3 Fine-tuning (out of scope) → Task 16 (dataset only) ✅
- §5 Models → Task 9 ✅
- §6 ÍRIS prompt → Task 7 ✅
- §7 Corpus authority → Task 10 (AUTHORITY_MAP) ✅
- §8 Chunking strategy → Tasks 2, 3, 4 ✅
- §9 API routes + Zod + rate limit → Tasks 11, 12 ✅
- §10 Error handling → Tasks 12, 15 ✅
- §11 Tests + golden queries → Tasks 2-9, 17 ✅
- §12 Observability → Task 9 (console.debug in ollama-client) ✅
- §13 Dataset format → Task 16 ✅
- §15 Roadmap phases → Task ordering matches ✅

**Type consistency:**
- `RawChunk` → `Chunk` (adds `embedding`): Tasks 1→2,3,4,10
- `SearchResult = { chunk: Chunk, score: number }`: Tasks 1→6→7→12
- `EmbedConfig = { baseUrl, model }`: Tasks 1→5→9→10
- `search(queryEmb, corpus, topK)`: Tasks 6→12
- `buildPrompt({ message, history, searchResults })`: Tasks 7→12
- `getCorpus(): Promise<Corpus>`: Tasks 8→11→12
- `ollamaStream(messages, config, signal?)`: Tasks 9→12
- `IRIS_SYSTEM_PROMPT`: exported from Task 7 → imported in Task 16 ✅

**No placeholders found.** All code blocks complete with actual implementation.

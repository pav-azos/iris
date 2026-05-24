# ÍRIS RAG Pipeline

## What
Server-side Retrieval-Augmented Generation pipeline that answers questions about Lei nº 15.040/2024.

## Why
Ground Ollama responses in verified legal documents, preventing hallucination of insurance law details.

## Architecture

```
User query
    ↓
ollamaEmbed(query) → 1024d bge-m3 vector
    ↓
search(corpus, topK=5) → SearchResult[] with authority bias
    ↓
buildPrompt(message, history, results) → messages[]
    ↓
ollamaStream(messages) → token stream → SSE
```

## Authority Bias
- `law` (Lei 15.040): 1.2× cosine score
- `official` (FAQs, SUSEP, ENS): 1.1× cosine score  
- `third-party` (PWC, Fenacor, etc.): 1.0× cosine score

## Chunking Strategy
- PDFs: sliding window, 1920 chars (~400 tokens), 256 char overlap
- FAQ/TXT files: one chunk per numbered Q&A pair (split on `**N.`)

## Corpus
- Location: `apps/web/data/corpus.json` (gitignored, generated locally)
- Format: `{ header: CorpusHeader, chunks: Chunk[] }`
- Rebuild: `bun run index-docs`
- Incremental: SHA-256 hash cache at `apps/web/data/.index-cache.json`

## API Route
`POST /api/chat` — SSE streaming
Events: `sources` → `token` (×N) → `done` | `error`

## Tests
```bash
cd packages/rag && bun test              # unit tests (30+)
cd packages/rag && bun test __tests__/golden-queries.test.ts  # integration (requires corpus)
```

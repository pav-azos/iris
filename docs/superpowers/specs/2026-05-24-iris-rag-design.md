# ÍRIS — Agentic RAG Lei 15.040/2024
## Design Spec · 2026-05-24 (rev 4 — local only, arquiteto aprovado)

---

## 1. Visão Geral

**ÍRIS** (Inteligência em Regulação e Informação Securitária) é um agente de RAG especializado em responder dúvidas sobre a Lei nº 15.040/2024 (Marco Legal do Seguro Brasileiro). Construído sobre o frontend existente do LLMChat.co (Turbo monorepo, Next.js 14), simplificado para escopo único: chat com base documental jurídica.

**Público-alvo:** Corretores de seguro, segurados, profissionais do setor securitário.

**Contexto:** Projeto acadêmico I2A2 (InsurMinds), demonstração de Agentic RAG.

**Deployment:** Local only. Avaliador roda `bun dev` após `ollama pull` + `bun run index-docs`. Sem API keys externas, sem cloud.

---

## 2. O que é Removido do Frontend Existente

| Componente | Arquivo(s) | Ação |
|---|---|---|
| Clerk auth | `middleware.ts`, `app/sign-in/**`, `app/sign-up/**` | Remove |
| Sistema de créditos | `credit-service.ts`, `CHAT_MODE_CREDIT_COSTS`, `/api/messages/remaining` | Remove |
| MCP proxy | `app/api/mcp/**` | Remove |
| Feedback API | `app/api/feedback/route.ts`, `packages/actions/feedback.action.ts` | Remove |
| Web search tasks | `packages/ai/workflow/tasks/pro-search.ts`, `quick-search.ts`, `web-search.ts` | Remove |
| Seletor de modelos | UI components de seleção de provider/modelo | Remove |
| Image attachments | `packages/common/components/chat-input/image-*.tsx` | Remove |
| Pages legais | `app/privacy/page.tsx`, `app/terms/page.tsx` | Remove |
| Sentry | `sentry.*.config.ts`, instrumentation imports | Remove |
| Branding llmchat.co | `app/layout.tsx` metadata, `app/manifest.ts` | Atualiza → ÍRIS |

**O que permanece:**
- Estrutura Turbo monorepo
- Chat UI (thread, streaming, markdown render)
- IndexedDB via Dexie.js — histórico de chat local apenas (não usado para RAG)
- `packages/ui` (shadcn components)
- `packages/common/components/chat-input` (simplificado)
- Tailwind, TypeScript, Bun

---

## 3. Arquitetura

```
iris/
├── apps/web/
│   ├── app/
│   │   ├── api/
│   │   │   ├── chat/route.ts          ← RAG + Ollama stream
│   │   │   └── health/route.ts        ← status Ollama + corpus
│   │   ├── chat/[threadId]/           ← mantém (simplificado, sem auth)
│   │   └── page.tsx                   ← ÍRIS landing
│   └── data/                          ← NÃO em /public — server-side only
│       └── corpus.json                ← chunks + embeddings pré-indexados
│
├── packages/
│   ├── rag/
│   │   ├── chunker.ts                 ← PDF/TXT → chunks com metadados + estratégia por tipo
│   │   ├── embedder.ts                ← Ollama bge-m3 (1024d, multilingual)
│   │   ├── searcher.ts                ← cosine similarity, top-k, authority bias
│   │   ├── prompt-builder.ts          ← injeta contexto + system prompt + token budget
│   │   └── index.ts
│   └── ai/
│       └── ollama-client.ts           ← Ollama only, streaming, 1 retry em 503
│
└── scripts/
    ├── index-docs.ts                  ← bun run index-docs → apps/web/data/corpus.json
    └── generate-dataset.ts            ← bun run gen-dataset → finetune-dataset.jsonl
```

**Nota:** `vector-storage` (Dexie.js) permanece nas deps para histórico de chat em IndexedDB. RAG retrieval é inteiramente server-side — sem overlap.

---

## 4. Fluxo de Dados

### 4.1 Indexação (build-time, roda uma vez)

```
docs/*.pdf + docs/**/*.txt
        ↓
scripts/index-docs.ts
  ├── per-file strategy:
  │   ├── PDFs  → pdfjs-dist/legacy/build/pdf.mjs (extração por página)
  │   │           chunks ~400 tokens (char-approx com 20% margem), overlap 64
  │   └── Q&A TXT (FAQ.txt, Agente FAQ.txt) → split por par Q&A (não por token count)
  ├── metadados: { source, page, authority }
  │   authority: "law" | "official" | "third-party"
  ├── hash-per-file cache → re-indexa só arquivos modificados
  └── embedder.ts → Ollama bge-m3 (1024d, multilingual)
        ↓
apps/web/data/corpus.json
  header: { embedModel: "bge-m3", dim: 1024, indexedAt: ISO8601, version: 1 }
  chunks: [{ id, text, embedding: number[], metadata: {source, page, authority} }]
```

**Tokenizer:** chunk size medido em caracteres com margem de segurança (~400 tokens → ~1600 chars + 20% = 1920 chars max). bge-m3 aceita até 8192 tokens — headroom garantido.

**pdfjs-dist:** usar `pdfjs-dist/legacy/build/pdf.mjs` explicitamente para compatibilidade Bun/Node. Extração por página preserva `metadata.page`.

**Comando:** `bun run index-docs`

### 4.2 Runtime (query) — server-side

```
usuário digita pergunta (browser)
        ↓
POST /api/chat  (Next.js server route)
  ├── validação Zod (schema §9)
  ├── rate limit: in-memory Map, 20 req/min/IP
  │   ⚠ local-only — não usar em deploy multi-processo
  ├── embed query → Ollama bge-m3 (mesmo modelo do índice → zero drift)
  ├── corpus singleton: Promise<Corpus> no module scope
  │   (protege cold-start contention — 2 requests simultâneos = 1 parse)
  ├── searcher.ts:
  │   ├── cosine similarity contra todos os chunks
  │   ├── authority bias: law×1.2, official×1.1, third-party×1.0 → DEPOIS rank top-5
  │   └── score reportado à UI via evento SSE sources
  ├── prompt-builder.ts:
  │   ├── system prompt ÍRIS
  │   ├── top-5 chunks injetados
  │   ├── histórico: últimas 6 trocas (~1500 tokens)
  │   └── overflow: descarta turns mais antigos até caber em 8k ctx
  └── Ollama stream (mistral:7b-instruct ou iris-mistral) → SSE
        ↓
browser renderiza stream
Dexie.js persiste thread no IndexedDB SOMENTE após evento "done"
```

### 4.3 Fine-tuning — FORA DO ESCOPO desta implementação

> Documentado como referência. O projeto entrega apenas o dataset JSONL.

```
scripts/generate-dataset.ts → docs/data/finetune-dataset.jsonl

# Etapas manuais (referência, M4):
mlx_lm.lora --model mistralai/Mistral-7B-Instruct-v0.3 \
  --train --data docs/data/ --iters 1000 --lora-layers 16
mlx_lm.fuse → modelo mesclado
llama.cpp convert → iris-mistral.gguf
ollama create iris-mistral -f Modelfile
# Trocar OLLAMA_MODEL=iris-mistral no .env.local
```

---

## 5. Modelos Ollama

| Função | Modelo | Dimensão | RAM |
|---|---|---|---|
| Embedding (index + query) | `bge-m3` | 1024d | ~570MB |
| Inferência base | `mistral:7b-instruct` | — | ~4.1GB (4-bit) |
| Inferência fine-tuned | `iris-mistral` (GGUF) | — | ~4.1GB |

**Env vars (`.env.local`):**
```bash
OLLAMA_BASE_URL=http://localhost:11434
OLLAMA_MODEL=mistral:7b-instruct
# OLLAMA_MODEL=iris-mistral   # após fine-tune
OLLAMA_EMBED_MODEL=bge-m3
```

**Setup do avaliador:**
```bash
ollama pull bge-m3
ollama pull mistral:7b-instruct
bun install
bun run index-docs
bun dev
```

---

## 6. Identity ÍRIS — System Prompt

```
Você é ÍRIS — Inteligência em Regulação e Informação Securitária.

Sua única função é responder dúvidas sobre a Lei nº 15.040/2024
(Marco Legal do Seguro Brasileiro) e suas implicações práticas.

Regras:
1. Responda SOMENTE com base no contexto fornecido dos documentos.
2. Cite sempre o artigo ou fonte específica quando disponível.
3. Se o contexto não contiver informação suficiente, responda:
   "Não encontrei base legal para isso nos documentos disponíveis."
   Não invente informações normativas.
4. Seja precisa, objetiva e acessível — corretores e segurados são seu público.
5. Prefira citar a lei (L15040) sobre interpretações de terceiros.

Contexto recuperado (ordenado por relevância):
{context}
```

**Comportamento com contexto vazio:** ÍRIS recusa. Não responde sem contexto.

**Dataset:** system message incluído em todos os pares JSONL para reforçar comportamento durante fine-tuning.

---

## 7. Corpus — Documentos Indexados

| Arquivo | Authority | Estratégia chunking |
|---|---|---|
| `L15040 - Nova lei de seguros.pdf` | `law` | ~400 tokens, overlap 64 |
| `FAQ da Lei nº 15.0402024.pdf` | `official` | ~400 tokens, overlap 64 |
| `Agente FAQ Lei Geral Seguros.txt` | `official` | split por par Q&A |
| `data/FAQ.txt` | `official` | split por par Q&A (flashcard) |
| `O que mudou (MAG SEGUROS).pdf` | `third-party` | ~400 tokens, overlap 64 |
| `Conheça Nova Lei (MDS Brasil).pdf` | `third-party` | ~400 tokens, overlap 64 |
| `Adequação à Lei n 15.040 (PWC).pdf` | `third-party` | ~400 tokens, overlap 64 |
| `Divergências entre Lei 15.040_24 (ENS).pdf` | `third-party` | ~400 tokens, overlap 64 |
| `Seis pontos (Fenacor).pdf` | `third-party` | ~400 tokens, overlap 64 |
| `Plano de Regulação SUSEP 2026.pdf` | `official` | ~400 tokens, overlap 64 |
| `03_Lei_consumidor_DIGITAL_FINAL.pdf` | `third-party` | ~400 tokens, overlap 64 |

**Authority bias no scoring:** aplicado antes do rank. Score final = cosine × multiplier → top-5.

---

## 8. Chunking & Retrieval

**PDF chunking:**
- Parser: `pdfjs-dist/legacy/build/pdf.mjs`
- Chunk size: ~1920 chars max (~400 tokens com 20% margem de segurança)
- Overlap: 64 tokens equivalente em chars (~256 chars)
- `page` extraído por página do pdfjs, `section` best-effort via outline

**Q&A chunking:**
- Split por par pergunta/resposta (numeração ou linha em branco dupla)
- Um chunk = um par Q&A completo (atômico, sem overlap)

**Retrieval:**
- Cosine similarity (1024d)
- Authority bias → rank → top-5
- Score incluído no evento SSE `sources`

**Corpus integrity check:**
- Header `{ embedModel, dim, version }` em corpus.json
- `/api/health` verifica `embedModel === process.env.OLLAMA_EMBED_MODEL` e `dim === 1024`
- Health também faz embed de "healthcheck" e asserta `result.length === 1024`

---

## 9. API Routes

### `POST /api/chat`

**Zod schema:**
```typescript
const chatRequestSchema = z.object({
  message: z.string().min(1).max(2000),
  threadId: z.string().uuid(),
  history: z.array(z.object({
    role: z.enum(['user', 'assistant']),
    content: z.string().max(4000),
  })).max(12),  // cap: últimas 6 trocas
});
```

**Rate limit:** in-memory Map, 20 req/min/IP.
> ⚠️ Processo único local apenas. Não usar em deploy multi-processo sem Redis.

**SSE — ordem garantida:**
```
event: sources
data: {"chunks": [{"text":"...", "source":"L15040...", "page":3, "score":0.91, "authority":"law"}]}

event: token
data: {"content": "..."}   ← N vezes

event: error
data: {"message": "..."}   ← se Ollama dropar mid-stream

event: done
data: {"threadId": "...", "threadItemId": "..."}
```

### `GET /api/health`
```typescript
{
  ollama: "ok" | "offline",
  model: string,
  embedModel: string,
  embedder: "ok" | "failed",         // probe: embed "healthcheck" → assert dim===1024
  corpus: "indexed" | "missing" | "mismatch",
  chunks: number,
  indexedAt: string | null
}
```

---

## 10. Error Handling

| Cenário | Comportamento |
|---|---|
| Ollama offline | Banner: "Ollama offline — execute `ollama serve`" |
| Modelo não baixado | Banner: "Modelo não encontrado — `ollama pull mistral:7b-instruct`" |
| corpus.json ausente | Warning + instrução: "`bun run index-docs`" |
| corpus.json corrompido | Parse error → status "missing" no health |
| Mismatch embed model | Banner: "Corpus desatualizado — `bun run index-docs`" |
| 0 chunks top-5 | ÍRIS recusa com mensagem padrão (item 3 do prompt) |
| Stream interrompido | `event: error` + thread **não** persistida |
| Rate limit excedido | HTTP 429: "Muitas requisições. Aguarde." |
| Input inválido (Zod) | HTTP 400 + detalhes |
| Overflow contexto (>8k) | prompt-builder descarta turns antigos |
| IndexedDB quota exceeded | Dexie catch → aviso UI, chat continua |
| Ollama 503 cold load | 1 retry automático no ollama-client.ts |

---

## 11. Testes

```
packages/rag/
├── chunker.test.ts          ← split PDF, split por par Q&A, metadados presentes
├── embedder.test.ts         ← mock Ollama, verifica dim 1024d
├── searcher.test.ts         ← top-k, authority bias antes do rank
└── golden-queries.test.ts   ← 15+ queries PT-BR → chunk esperado em top-3

apps/web/app/api/chat/
├── route.test.ts            ← mock RAG + mock Ollama, SSE order (sources→token→done)
└── validation.test.ts       ← Zod schema, rate limit, max length
```

**Golden query set** (`packages/rag/fixtures/golden.ts`):
- 15+ pares `{ query, expectedSourceFile, expectedContains }`
- Ex: `{ query: "O que é aceitação tácita?", expectedSourceFile: "L15040", expectedContains: "aceitação" }`
- Eval separado do dataset de fine-tuning (evita leakage)

**Cobertura alvo:** 80% em `packages/rag/`.

---

## 12. Observabilidade

Sem Sentry. Retrieval logging em desenvolvimento:
```
[IRIS RAG] query="..." → 5 chunks | top=0.91 | source=L15040 p.12 | latency=43ms
```

Header `X-IRIS-Debug: true` em `NODE_ENV !== 'production'` → inclui retrieval trace no SSE.

---

## 13. Dataset de Fine-tuning

**Formato MLX chat (inclui system message):**
```json
{"messages": [
  {"role": "system", "content": "<system prompt ÍRIS>"},
  {"role": "user", "content": "O que é aceitação tácita na Lei 15.040?"},
  {"role": "assistant", "content": "Pelo Art. X da Lei 15.040/2024..."}
]}
```

**Fontes:** `Agente FAQ Lei Geral Seguros.txt` + `docs/data/FAQ.txt`
**Output:** `docs/data/finetune-dataset.jsonl`
**Split:** 80/20 train/validation (~100-150 pares)

---

## 14. Handoff Docs (SSRDs)

Gerados em `docs/specs/`:

| Arquivo | Responsabilidade |
|---|---|
| `rag-pipeline.md` | Chunking por tipo, bge-m3, scoring com authority bias, corpus.json schema, indexação incremental, pdfjs-dist |
| `frontend-cleanup.md` | Lista arquivo por arquivo do que remover (paths exatos + imports a deletar) |
| `ollama-integration.md` | API routes completas, Zod schemas, rate limit, SSE protocol, corpus singleton, Modelfile de referência |
| `finetune-pipeline.md` | Dataset JSONL format (com system message), split, MLX commands de referência, GGUF export |
| `iris-identity.md` | System prompt completo, exemplos de resposta esperada, comportamento com contexto vazio |

---

## 15. Roadmap de Implementação

| Fase | Entrega | Dependências | Paralelizável? |
|---|---|---|---|
| 1 — Cleanup | Remove auth, créditos, MCP, web search, imagens, Sentry, branding | — | com 2 e 6 |
| 2 — RAG package | `packages/rag/`: chunker, embedder, searcher, prompt-builder | — | com 1 e 6 |
| 3 — Indexação | `scripts/index-docs.ts` → `apps/web/data/corpus.json` | Fase 2 + Ollama rodando | — |
| 4 — API chat | `/api/chat` RAG + Ollama streaming, `/api/health` | Fases 2 + 3 | — |
| 5 — Frontend ÍRIS | Branding, UI simplificado, health banner, Dexie só histórico | Fase 4 | — |
| 6 — Dataset | `scripts/generate-dataset.ts` → `finetune-dataset.jsonl` | — | com 1 e 2 |
| 7 — Handoff docs | SSRDs em `docs/specs/` | Todas | — |

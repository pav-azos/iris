# ÍRIS — Agentic RAG Lei 15.040/2024
## Design Spec · 2026-05-24

---

## 1. Visão Geral

**ÍRIS** (Inteligência em Regulação e Informação Securitária) é um agente de RAG especializado em responder dúvidas sobre a Lei nº 15.040/2024 (Marco Legal do Seguro Brasileiro). O sistema é construído sobre o frontend existente do LLMChat.co (Turbo monorepo, Next.js 14), simplificado para escopo único: chat com base documental jurídica.

**Público-alvo:** Corretores de seguro, segurados, profissionais do setor securitário.

**Contexto:** Projeto acadêmico I2A2 (InsurMinds), demonstração de Agentic RAG.

---

## 2. O que é Removido do Frontend Existente

| Componente | Arquivo(s) | Ação |
|---|---|---|
| Clerk auth | `middleware.ts`, `app/sign-in/**`, `app/sign-up/**`, `app/api/completion/credit-service.ts` | Remove |
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
- IndexedDB via Dexie.js (histórico local)
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
│   │   │   ├── chat/route.ts          ← RAG + Ollama stream (NOVO)
│   │   │   └── health/route.ts        ← status Ollama + corpus (NOVO)
│   │   ├── chat/[threadId]/           ← mantém (simplificado, sem auth)
│   │   └── page.tsx                   ← ÍRIS landing
│   └── public/
│       └── corpus.json                ← chunks + embeddings pré-indexados
│
├── packages/
│   ├── rag/                           ← NOVO pacote
│   │   ├── chunker.ts                 ← PDF/TXT → chunks com metadados
│   │   ├── embedder.ts                ← Ollama nomic-embed-text
│   │   ├── searcher.ts                ← cosine similarity, top-k
│   │   ├── prompt-builder.ts          ← injeta contexto + system prompt ÍRIS
│   │   └── index.ts
│   └── ai/
│       └── ollama-client.ts           ← ADAPTADO: só Ollama, streaming
│
└── scripts/
    ├── index-docs.ts                  ← bun run index-docs → corpus.json
    └── generate-dataset.ts            ← bun run gen-dataset → finetune-dataset.jsonl
```

---

## 4. Fluxo de Dados

### 4.1 Indexação (build-time)

```
docs/*.pdf + docs/**/*.txt
        ↓
scripts/index-docs.ts
  ├── pdf-parse → texto bruto
  ├── chunker.ts → chunks 512 tokens, overlap 64, metadados {source, page}
  └── embedder.ts → Ollama nomic-embed-text (768d)
        ↓
public/corpus.json  ← { chunks: [{text, embedding, metadata}] }
```

**Comando:** `bun run index-docs`

### 4.2 Runtime (query)

```
browser carrega corpus.json → vector-storage (IndexedDB)

usuário digita pergunta
        ↓
POST /api/chat
  ├── embed query → Ollama nomic-embed-text
  ├── searcher.ts → cosine sim → top-5 chunks (threshold 0.75)
  ├── prompt-builder.ts → system prompt ÍRIS + contexto injetado
  └── Ollama mistral:iris (pós fine-tune) → stream SSE
        ↓
UI recebe stream → renderiza markdown
```

### 4.3 Fine-tuning (offline)

```
scripts/generate-dataset.ts
  ├── Agente FAQ Lei Geral Seguros.txt  (50 Q&A completas)
  └── docs/data/FAQ.txt                 (flashcards)
        ↓
docs/data/finetune-dataset.jsonl  ← formato MLX chat
  {"messages": [
    {"role": "user", "content": "..."},
    {"role": "assistant", "content": "..."}
  ]}

mlx_lm.lora \
  --model mistralai/Mistral-7B-Instruct-v0.3 \
  --train --data docs/data/ \
  --iters 1000 --lora-layers 16

mlx_lm.fuse → modelo mesclado
llama.cpp convert → iris-mistral.gguf
ollama create iris-mistral -f Modelfile
```

**Split dataset:** 80% train / 20% validation (~100-150 pares)

---

## 5. Modelos Ollama

| Função | Modelo | RAM |
|---|---|---|
| Embedding | `nomic-embed-text` | ~274MB |
| Inferência (base) | `mistral:7b-instruct` | ~4.1GB (4-bit) |
| Inferência (fine-tuned) | `iris-mistral` (GGUF custom) | ~4.1GB |

**Env vars:**
```bash
OLLAMA_BASE_URL=http://localhost:11434
OLLAMA_MODEL=iris-mistral
OLLAMA_EMBED_MODEL=nomic-embed-text
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
3. Se a pergunta estiver fora do escopo da lei de seguros, diga:
   "Não encontrei base legal para isso nos documentos disponíveis."
4. Seja precisa, objetiva e acessível — corretores e segurados são seu público.
5. Nunca invente informações normativas.

Contexto recuperado:
{context}
```

---

## 7. Corpus — Documentos Indexados

| Arquivo | Tipo | Relevância |
|---|---|---|
| `L15040 - Nova lei de seguros.pdf` | Lei completa | Primária |
| `FAQ da Lei nº 15.0402024.pdf` | FAQ oficial | Alta |
| `Agente FAQ Lei Geral Seguros.txt` | 50 Q&A técnicas | Alta |
| `data/FAQ.txt` | Flashcards corretor | Alta |
| `O que mudou (MAG SEGUROS).pdf` | Resumo prático | Média |
| `Conheça Nova Lei (MDS Brasil).pdf` | Guia setor | Média |
| `Adequação à Lei n 15.040 (PWC).pdf` | Análise consultoria | Média |
| `Divergências entre Lei 15.040_24 (ENS).pdf` | Análise técnica | Média |
| `Seis pontos (Fenacor).pdf` | Perspectiva corretores | Média |
| `Plano de Regulação SUSEP 2026.pdf` | Contexto regulatório | Baixa |
| `03_Lei_consumidor_DIGITAL_FINAL.pdf` | Perspectiva consumidor | Baixa |

---

## 8. Chunking Strategy

- **Chunk size:** 512 tokens
- **Overlap:** 64 tokens
- **Metadados por chunk:** `{ source: string, page: number, section?: string }`
- **Threshold similaridade:** 0.75 (cosine)
- **Top-k retrieval:** 5 chunks por query
- **PDFs:** `pdf-parse` (Node.js)
- **TXT:** split por parágrafo, fallback por token count

---

## 9. API Routes

### `POST /api/chat`
```typescript
// Request
{
  message: string,
  threadId: string,
  history: { role: 'user'|'assistant', content: string }[]
}

// Response: SSE stream
data: {"type": "token", "content": "..."}
data: {"type": "sources", "chunks": [{text, source, page}]}
data: {"type": "done"}
```

### `GET /api/health`
```typescript
// Response
{
  ollama: "ok" | "offline",
  corpus: "indexed" | "missing",
  chunks: number,
  model: string
}
```

---

## 10. Error Handling

| Cenário | Comportamento |
|---|---|
| Ollama offline | Banner: "Ollama offline — execute `ollama serve`" |
| corpus.json ausente | Warning startup + instrução `bun run index-docs` |
| 0 chunks retornados (threshold) | Resposta sem contexto + badge "⚠ baixa confiança" |
| Pergunta fora do escopo | ÍRIS responde com mensagem padrão (item 3 do prompt) |
| Stream interrompido | Abort controller + mensagem parcial preservada no thread |

---

## 11. Testes

```
packages/rag/
├── chunker.test.ts      ← split correto, overlap, metadados presentes
├── embedder.test.ts     ← mock Ollama, verifica dimensão 768d
└── searcher.test.ts     ← top-k, threshold, ordenação por score

apps/web/app/api/chat/
└── route.test.ts        ← mock RAG + mock Ollama, verifica SSE stream
```

Cobertura alvo: 80% em `packages/rag/`.

---

## 12. Handoff Docs (SSRDs)

A serem gerados em `docs/specs/`:

| Arquivo | Responsabilidade |
|---|---|
| `rag-pipeline.md` | Spec detalhada chunking, embedding, retrieval, corpus.json schema |
| `frontend-cleanup.md` | Lista arquivo por arquivo do que remover + diff esperado |
| `ollama-integration.md` | API routes, env vars, Modelfile, health check |
| `finetune-pipeline.md` | Dataset JSONL format, MLX commands, GGUF export, Ollama import |
| `iris-identity.md` | System prompt completo, exemplos de resposta, limites do agente |

---

## 13. Roadmap de Implementação (fases)

| Fase | Entrega |
|---|---|
| 1 — Cleanup | Remove auth, créditos, MCP, web search, imagens do frontend |
| 2 — RAG package | `packages/rag/` com chunker, embedder, searcher |
| 3 — Indexação | `scripts/index-docs.ts` → `public/corpus.json` |
| 4 — API chat | `/api/chat` RAG + Ollama streaming |
| 5 — Frontend ÍRIS | Branding, UI simplificado, health banner |
| 6 — Dataset | `scripts/generate-dataset.ts` → `finetune-dataset.jsonl` |
| 7 — Handoff docs | SSRDs em `docs/specs/` |

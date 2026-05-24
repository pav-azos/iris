# Ollama Integration

## What
Local LLM inference via Ollama. Two models: bge-m3 for embeddings, mistral:7b-instruct for generation.

## Models
| Model | Purpose | Pull command |
|-------|---------|-------------|
| bge-m3 | 1024d multilingual embeddings | `ollama pull bge-m3` |
| mistral:7b-instruct | Chat generation | `ollama pull mistral:7b-instruct` |

## Client: `packages/ai/ollama-client.ts`
- `ollamaEmbed(text, config)` — POST /api/embeddings, 1 retry on 503
- `ollamaStream(messages, config, signal?)` — POST /api/chat, NDJSON stream

## Env Vars
```bash
OLLAMA_BASE_URL=http://localhost:11434
OLLAMA_MODEL=mistral:7b-instruct
OLLAMA_EMBED_MODEL=bge-m3
```

## Health Check
`GET /api/health` — probes Ollama connectivity, embedder (1024d test), corpus status.

## Why bge-m3
Portuguese multilingual support. Other options (nomic-embed-text) are English-only.

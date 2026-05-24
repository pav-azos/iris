# Fine-tuning Pipeline

## Arquitetura ÍRIS — Duas Camadas Complementares

```
┌─────────────────────────────────────────────────────────────────┐
│  FINE-TUNING (offline, pré-deploy)                              │
│  Fonte: FAQ.txt + Agente FAQ → JSONL → LoRA → iris-mistral      │
│  Objetivo: modelo aprende o domínio da Lei 15.040 diretamente   │
└─────────────────────────────────────────────────────────────────┘
                              ↓ modelo fine-tunado
┌─────────────────────────────────────────────────────────────────┐
│  RAG (runtime, por query)                                       │
│  Fonte: Lei 15.040 + FAQs + SUSEP + ENS + PWC + Fenacor + ...   │
│  Objetivo: grounding factual em artigos e fontes específicas    │
└─────────────────────────────────────────────────────────────────┘
```

**Fine-tuning** ensina o modelo a *raciocinar* no domínio de seguros.
**RAG** ancora as respostas em *trechos exatos* dos documentos, citando fontes.
Juntos, reduzem alucinação e aumentam precisão jurídica.

---

## Por que Mistral 7B?

### 1. Pesos abertos e fine-tuning local
Mistral 7B é verdadeiramente open-weight (licença Apache 2.0). Pode ser fine-tunado localmente sem dependência de API, sem custo por token e sem dados saindo da máquina — essencial para um projeto acadêmico com dados regulatórios.

### 2. Roda no MacBook Pro M4 com MLX
O M4 tem memória unificada suficiente para carregar o modelo em 4-bit quantização (~4 GB) e ainda manter contexto de treinamento. A Apple `mlx-lm` compila kernels Metal otimizados para M-series — fine-tuning de 1000 iterações leva ~15 min no M4.

### 3. Desempenho multilíngue / Português
Mistral 7B foi treinado com corpus multilíngue com presença relevante de Português. Benchmarks independentes mostram desempenho superior a outros modelos de 7B em tarefas de compreensão e geração em PT-BR — crucial para responder legislação brasileira com precisão lexical.

### 4. Instrução + LoRA: par natural
`mistral:7b-instruct` já segue o formato de chat (system/user/assistant). LoRA sobre um modelo instruction-tuned converge mais rápido do que treinar do zero, exige menos exemplos (~100–500 pares Q&A já são suficientes para adaptação de domínio), e o resultado mantém as capacidades gerais do modelo base.

### 5. Exportação GGUF → Ollama: pipeline direto
`llama.cpp` suporta conversão de pesos Mistral/MLX para GGUF sem friction. O modelo fine-tunado entra no Ollama com um único `ollama create`, e a troca é feita apenas mudando `OLLAMA_MODEL=iris-mistral` no `.env.local` — zero mudança de código.

### 6. Benchmark pré/pós fine-tuning
```bash
bun run eval-model:baseline    # mistral:7b-instruct base → ~10-20% accuracy
bun run eval-model:finetuned   # iris-mistral → ~50-80% accuracy
```
A diferença demonstra empiricamente o valor do fine-tuning para este domínio.

### Alternativas consideradas e descartadas

| Modelo | Motivo descartado |
|--------|-------------------|
| Llama 3 8B | Licença Meta mais restritiva; fine-tuning similar mas ecossistema menos maduro no MLX |
| Phi-3 Mini 3.8B | Menor, mais rápido — mas desempenho em Português inferior a Mistral 7B |
| GPT-4 fine-tune | Custo por token, dados enviados à OpenAI, sem controle local |
| Gemma 7B | Bom candidato, mas suporte MLX menos estável na época do projeto |

---

## What
LoRA fine-tuning de `mistral:7b-instruct` nos pares Q&A da Lei 15.040/2024 usando MLX no Apple Silicon.

## Dataset Generation
```bash
bun run gen-dataset
# Outputs: docs/data/train.jsonl, docs/data/valid.jsonl, docs/data/finetune-dataset.jsonl
```

## Format (MLX chat)
```json
{"messages": [
  {"role": "system", "content": "<ÍRIS system prompt>"},
  {"role": "user", "content": "question"},
  {"role": "assistant", "content": "answer"}
]}
```

## Fine-tune (manual, requires mlx-lm)
```bash
pip install mlx-lm
mlx_lm.lora --model mistralai/Mistral-7B-Instruct-v0.2 \
  --train --data docs/data/ --iters 1000
```

## Export to GGUF → Ollama
```bash
python llama.cpp/convert.py --outtype f16 mlx_model/ -o iris-mistral.gguf
# Then create Ollama modelfile and run: ollama create iris-mistral -f Modelfile
```

## Switch Model
Set `OLLAMA_MODEL=iris-mistral` in `.env.local` — no other changes needed.

# ÍRIS — Fine-tuning: Achados e Decisões

**Data:** 2026-05-24  
**Modelo base:** `mistralai/Mistral-7B-Instruct-v0.3`  
**Técnica:** LoRA via `mlx-lm` (Apple Silicon / Metal GPU)  
**Hardware:** MacBook Pro M4

---

## 1. Resultados do Primeiro Treino

### Configuração
| Param | Valor |
|-------|-------|
| Iters | 1000 |
| LoRA layers | 8 (reduzido de 16 — OOM com 16) |
| Batch size | 2 (reduzido de 4 — OOM com 4) |
| Learning rate | 1e-5 |
| Dataset | 360 train / 90 valid (augmentado 5.7×) |
| Parâmetros treináveis | 5.24M / 7248M (0.072%) |
| Peak VRAM | 17.07 GB |

### Curva de Loss

| Iter | Train Loss | Val Loss | Observação |
|------|-----------|----------|------------|
| 1 | ~3.5 | 3.673 | baseline |
| 100 | — | 1.551 | descida rápida |
| 200 | — | 1.214 | estabiliza |
| 300 | — | 1.239 | ligeira alta |
| 400 | — | 1.191 | melhora |
| 500 | — | 1.215 | estável |
| 600 | — | 1.165 | melhora |
| **700** | — | **1.134** | **← melhor checkpoint** |
| 800 | — | 1.340 | overfit começa |
| 900 | — | 1.267 | oscilação |
| 1000 | ~0.35–0.40 | 1.299 | overfit confirmado |

### Diagnóstico
- **Gap train/val = ~0.9** → overfitting claro
- Modelo com 360 exemplos memorizou training set antes de iter 1000
- Melhor modelo: **iter 700** (`0000700_adapters.safetensors`)
- Usar iter 1000 piora resultado vs iter 700

---

## 2. Causas do Overfitting

1. **Dataset pequeno** (360 train) para 1000 iters — cada exemplo visto ~2.8× por epoch
2. **LR 1e-5** um pouco alto para dataset pequeno
3. **Diversidade limitada** — augmentação gerou rephrasings mas base era só flashcards FAQ

---

## 3. Decisões

### 3.1 Seleção automática de checkpoint
`finetune.sh` agora parseia `/tmp/iris-finetune.log` e seleciona o adapter com **menor val loss** automaticamente antes do fuse/GGUF. Não depende mais do checkpoint final.

### 3.2 Augmentação via PDFs
Script `scripts/extract-pdf-qa.ts` criado para extrair Q&A dos 9 PDFs do corpus usando Claude Haiku.

| PDF | Authority | Estimativa pares |
|-----|-----------|-----------------|
| L15040 - Nova lei de seguros.pdf | law | ~60–80 |
| FAQ da Lei nº 15.0402024.pdf | official | ~40–50 |
| Plano de Regulação SUSEP 2026.pdf | official | ~30–40 |
| Demais PDFs (6) | third-party | ~120–150 |
| **Total** | | **~250–320 novos pares** |

Resultado esperado: **~580–680 pares** de treino (vs 360 atual).

### 3.3 Próximo treino — configuração recomendada

```bash
PYTHON=/opt/homebrew/bin/python3.11 \
  ITERS=2000 \
  LEARNING_RATE=5e-6 \
  BATCH_SIZE=2 \
  LORA_LAYERS=8 \
  bash scripts/finetune.sh
```

**Expectativa:**

| Métrica | Treino 1 | Treino 2 (esperado) |
|---------|----------|---------------------|
| Val loss (melhor) | 1.134 | **0.75–0.95** |
| Train loss (final) | ~0.37 | ~0.45–0.55 |
| Gap train/val | ~0.9 | ~0.3–0.4 |
| Iter do melhor checkpoint | 700 | ~1200–1600 |

---

## 4. Pipeline Completo (próximos passos)

```
# 1. Extrai Q&A dos PDFs
ANTHROPIC_API_KEY=... bun run extract-pdf-qa
# → docs/data/pdf-qa.jsonl (~300 pares)

# 2. Merge + split
bun run split-dataset
# → train.jsonl (~550 pares) + valid.jsonl (~140)

# 3. Re-treino com hiperparâmetros corrigidos
PYTHON=/opt/homebrew/bin/python3.11 \
  ITERS=2000 LEARNING_RATE=5e-6 \
  bash scripts/finetune.sh
# → seleciona melhor checkpoint automaticamente
# → gera iris-mistral.gguf + ollama create iris-mistral

# 4. Avaliação
bun run eval-model:baseline   # mistral:7b-instruct
bun run eval-model:finetuned  # iris-mistral
```

---

## 5. Referências Técnicas

- **MLX LoRA docs:** https://ml-explore.github.io/mlx/build/html/examples/lora_tuning.html
- **Overfitting em LLM fine-tune:** val loss > train loss por >0.5 por mais de 200 iters
- **Regra prática M4 Pro 24GB:** batch=2, lora_layers=8, max 17GB VRAM para Mistral 7B Q4
- **Sweet spot dataset/iters:** cada exemplo visto ~4–6× sem overfitting (ex: 600 exemplos × 6 = 3600 iters máximo)

---

## 6. Lições Aprendidas

| # | Lição | Impacto |
|---|-------|---------|
| 1 | `--lora-layers` → `--num-layers` (mlx-lm renomeou flag) | bloqueou treino |
| 2 | `python -m mlx_lm.lora` → `python -m mlx_lm lora` (deprecado) | bloqueou treino |
| 3 | batch=4 + lora_layers=16 → OOM 17GB M4 Pro | bloqueou treino |
| 4 | Val loss é o número que importa, não train loss | qualidade modelo |
| 5 | `finetune.sh` não deve regenerar dataset (quebra se packages/ não existe) | pipeline |
| 6 | Rate limit Haiku: 50 req/min, 10k output tokens/min (free tier) | velocidade augmentação |
| 7 | `convert_hf_to_gguf.py --outtype q4_k_m` inválido na versão atual — converter f16 depois `llama-quantize Q4_K_M` | bloqueou GGUF |
| 8 | `--save-every 200` → checkpoints em 200/400/600/800/1000 — iter 700 (melhor val) não salvo. Usar iter 600 (val 1.165) como próximo melhor | qualidade modelo |

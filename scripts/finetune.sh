#!/usr/bin/env bash
# =============================================================================
# ÍRIS — Pipeline de Fine-tuning Completo
#
# Etapas:
#   1. Gera dataset JSONL
#   2. Treina LoRA com mlx-lm (Apple Silicon GPU)
#   3. Funde adapters no modelo base
#   4. Converte para GGUF (llama.cpp)
#   5. Registra no Ollama como iris-mistral
#
# Pré-requisitos: bash scripts/setup-finetune.sh
# Uso: bash scripts/finetune.sh [--iters N] [--lora-layers N] [--dry-run]
# =============================================================================
set -euo pipefail

# ---------------------------------------------------------------------------
# Configurações (override via env vars ou flags)
# ---------------------------------------------------------------------------
ITERS=${ITERS:-1000}           # iterações de treino (500 rápido / 2000 melhor)
LORA_LAYERS=${LORA_LAYERS:-16} # camadas LoRA (8 rápido / 16 bom equilíbrio)
BATCH_SIZE=${BATCH_SIZE:-4}    # batch size (ajustar se OOM)
LEARNING_RATE=${LEARNING_RATE:-1e-5}
BASE_MODEL="mistralai/Mistral-7B-Instruct-v0.3"
MODEL_NAME="iris-mistral"
DRY_RUN=false

# Parse flags
for arg in "$@"; do
  case $arg in
    --iters=*) ITERS="${arg#*=}" ;;
    --lora-layers=*) LORA_LAYERS="${arg#*=}" ;;
    --dry-run) DRY_RUN=true ;;
  esac
done

# ---------------------------------------------------------------------------
# Paths
# ---------------------------------------------------------------------------
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
ROOT="$(cd "$SCRIPT_DIR/.." && pwd)"
DATA_DIR="$ROOT/docs/data"
ADAPTERS_DIR="$ROOT/docs/data/adapters"
FUSED_DIR="$ROOT/docs/data/iris-mistral-fused"
GGUF_FILE="$ROOT/docs/data/iris-mistral.gguf"
MODELFILE="$ROOT/docs/data/Modelfile"
LLAMACPP_DIR="$HOME/llama.cpp"
PYTHON=$(command -v python3.11 2>/dev/null || command -v python3 || echo python)

echo "╔══════════════════════════════════════════════════╗"
echo "║  ÍRIS Fine-tuning Pipeline                       ║"
echo "╚══════════════════════════════════════════════════╝"
echo "Base model:   $BASE_MODEL"
echo "Iters:        $ITERS"
echo "LoRA layers:  $LORA_LAYERS"
echo "Batch size:   $BATCH_SIZE"
echo "Dry run:      $DRY_RUN"
echo ""

# ---------------------------------------------------------------------------
# Passo 1: Verifica dataset JSONL (não regenera — use bun run generate-dataset
#           ou bun run augment-dataset antes)
# ---------------------------------------------------------------------------
echo "▶ Passo 1/5 — Verificando dataset..."

TRAIN_FILE="$DATA_DIR/train.jsonl"
VALID_FILE="$DATA_DIR/valid.jsonl"

if [ ! -f "$TRAIN_FILE" ]; then
  echo "✗ $TRAIN_FILE não encontrado."
  echo "  Execute primeiro: bun run generate-dataset && bun run augment-dataset"
  exit 1
fi

TRAIN_COUNT=$(wc -l < "$TRAIN_FILE")
VALID_COUNT=$(wc -l < "$VALID_FILE")
echo "✓ Dataset: $TRAIN_COUNT train / $VALID_COUNT validation exemplos"

# ---------------------------------------------------------------------------
# Passo 2: Fine-tuning LoRA com mlx-lm
# ---------------------------------------------------------------------------
echo ""
echo "▶ Passo 2/5 — Fine-tuning LoRA (mlx-lm)..."
echo "  Tempo estimado: ~$(( ITERS / 50 )) min no M4 Pro"

mkdir -p "$ADAPTERS_DIR"

if [ "$DRY_RUN" = true ]; then
  echo "  [dry-run] mlx_lm.lora --model $BASE_MODEL --train --data $DATA_DIR \\"
  echo "    --iters $ITERS --lora-layers $LORA_LAYERS \\"
  echo "    --batch-size $BATCH_SIZE --learning-rate $LEARNING_RATE \\"
  echo "    --adapter-path $ADAPTERS_DIR"
else
  $PYTHON -m mlx_lm lora \
    --model "$BASE_MODEL" \
    --train \
    --data "$DATA_DIR" \
    --iters "$ITERS" \
    --num-layers "$LORA_LAYERS" \
    --batch-size "$BATCH_SIZE" \
    --learning-rate "$LEARNING_RATE" \
    --adapter-path "$ADAPTERS_DIR" \
    --val-batches 5 \
    --steps-per-eval 100 \
    --save-every 200
fi

echo "✓ Adapters salvos em: $ADAPTERS_DIR"

# ---------------------------------------------------------------------------
# Passo 3: Funde adapters no modelo base
# ---------------------------------------------------------------------------
echo ""
echo "▶ Passo 3/5 — Fundindo adapters (mlx_lm.fuse)..."

mkdir -p "$FUSED_DIR"

if [ "$DRY_RUN" = true ]; then
  echo "  [dry-run] mlx_lm.fuse --model $BASE_MODEL --adapter-path $ADAPTERS_DIR --save-path $FUSED_DIR"
else
  $PYTHON -m mlx_lm fuse \
    --model "$BASE_MODEL" \
    --adapter-path "$ADAPTERS_DIR" \
    --save-path "$FUSED_DIR"
fi

echo "✓ Modelo fundido em: $FUSED_DIR"

# ---------------------------------------------------------------------------
# Passo 4: Converte para GGUF (Q4_K_M — melhor qualidade/tamanho no M4)
# ---------------------------------------------------------------------------
echo ""
echo "▶ Passo 4/5 — Convertendo para GGUF..."

if [ ! -f "$LLAMACPP_DIR/convert_hf_to_gguf.py" ]; then
  echo "✗ llama.cpp não encontrado em $LLAMACPP_DIR"
  echo "  Execute: bash scripts/setup-finetune.sh"
  exit 1
fi

if [ "$DRY_RUN" = true ]; then
  echo "  [dry-run] python $LLAMACPP_DIR/convert_hf_to_gguf.py $FUSED_DIR --outfile $GGUF_FILE --outtype q4_k_m"
else
  $PYTHON "$LLAMACPP_DIR/convert_hf_to_gguf.py" \
    "$FUSED_DIR" \
    --outfile "$GGUF_FILE" \
    --outtype q4_k_m
fi

echo "✓ GGUF gerado: $GGUF_FILE (Q4_K_M)"

# ---------------------------------------------------------------------------
# Passo 5: Registra no Ollama
# ---------------------------------------------------------------------------
echo ""
echo "▶ Passo 5/5 — Registrando no Ollama como '$MODEL_NAME'..."

# Gera Modelfile
cat > "$MODELFILE" << 'EOF'
FROM ./iris-mistral.gguf

PARAMETER temperature 0.1
PARAMETER top_p 0.9
PARAMETER top_k 40
PARAMETER num_ctx 8192
PARAMETER stop "<|im_end|>"
PARAMETER stop "</s>"

# System prompt embutido no modelo via fine-tuning —
# o Modelfile define apenas como fallback.
SYSTEM """Você é ÍRIS — Inteligência em Regulação e Informação Securitária.
Especialista na Lei 15.040/2024 (Marco Legal do Seguro brasileiro).
Cite sempre o artigo ou fonte. Nunca invente dados."""
EOF

if [ "$DRY_RUN" = true ]; then
  echo "  [dry-run] ollama create $MODEL_NAME -f $MODELFILE"
else
  # Inicia Ollama se não estiver rodando
  if ! ollama list &>/dev/null; then
    echo "  Iniciando Ollama..."
    ollama serve &>/tmp/ollama.log &
    sleep 3
  fi

  # Cria modelo (sobrescreve se existir)
  cd "$DATA_DIR"
  ollama create "$MODEL_NAME" -f "$MODELFILE"
fi

# ---------------------------------------------------------------------------
# Resumo final
# ---------------------------------------------------------------------------
echo ""
echo "╔══════════════════════════════════════════════════╗"
echo "║  Fine-tuning concluído!                          ║"
echo "╚══════════════════════════════════════════════════╝"
echo ""
echo "Modelo registrado: $MODEL_NAME"
echo ""
echo "Para usar:"
echo "  ollama run $MODEL_NAME"
echo ""
echo "Para usar na ÍRIS (Next.js):"
echo "  # Edite .env.local:"
echo "  OLLAMA_MODEL=$MODEL_NAME"
echo ""
echo "Artefatos gerados:"
echo "  Adapters: $ADAPTERS_DIR"
echo "  Fused:    $FUSED_DIR"
echo "  GGUF:     $GGUF_FILE"
echo "  Modelfile: $MODELFILE"

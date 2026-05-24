#!/usr/bin/env bash
# =============================================================================
# ÍRIS — Fine-tuning Setup (macOS Apple Silicon)
# Instala tudo via terminal. Roda uma vez.
# =============================================================================
set -euo pipefail

echo "╔══════════════════════════════════════════════════╗"
echo "║  ÍRIS Fine-tuning Setup — MacBook Pro M4         ║"
echo "╚══════════════════════════════════════════════════╝"

# ---------------------------------------------------------------------------
# 1. Homebrew
# ---------------------------------------------------------------------------
if ! command -v brew &>/dev/null; then
  echo "→ Instalando Homebrew..."
  /bin/bash -c "$(curl -fsSL https://raw.githubusercontent.com/Homebrew/install/HEAD/install.sh)"
  # Apple Silicon path
  eval "$(/opt/homebrew/bin/brew shellenv)"
else
  echo "✓ Homebrew já instalado"
fi

# ---------------------------------------------------------------------------
# 2. Dependências do sistema
# ---------------------------------------------------------------------------
echo "→ Instalando dependências do sistema..."
brew install cmake git python@3.11 wget ollama 2>/dev/null || true

# Garante que python3.11 é o padrão
PYTHON=$(brew --prefix python@3.11)/bin/python3.11
PIP="$PYTHON -m pip"

echo "✓ Python: $($PYTHON --version)"

# ---------------------------------------------------------------------------
# 3. MLX + mlx-lm  (treina nativamente no Apple Silicon GPU)
# ---------------------------------------------------------------------------
echo "→ Instalando mlx-lm..."
$PIP install --upgrade pip
$PIP install mlx-lm transformers datasets huggingface_hub

echo "✓ mlx-lm: $($PYTHON -m mlx_lm.version 2>/dev/null || echo 'instalado')"

# ---------------------------------------------------------------------------
# 4. llama.cpp  (converte para GGUF)
# ---------------------------------------------------------------------------
LLAMACPP_DIR="$HOME/llama.cpp"
if [ ! -d "$LLAMACPP_DIR" ]; then
  echo "→ Clonando llama.cpp..."
  git clone https://github.com/ggerganov/llama.cpp "$LLAMACPP_DIR"
  cd "$LLAMACPP_DIR"
  cmake -B build -DGGML_METAL=ON          # Metal acceleration no M4
  cmake --build build --config Release -j$(sysctl -n hw.logicalcpu)
  $PIP install -r requirements.txt
  echo "✓ llama.cpp compilado com Metal"
else
  echo "✓ llama.cpp já existe em $LLAMACPP_DIR"
fi

# ---------------------------------------------------------------------------
# 5. Ollama — pull modelos base
# ---------------------------------------------------------------------------
echo "→ Iniciando Ollama (background)..."
ollama serve &>/tmp/ollama.log &
sleep 3  # aguarda iniciar

echo "→ Baixando modelos base (pode demorar)..."
ollama pull mistral:7b-instruct
ollama pull bge-m3

echo "✓ Modelos Ollama prontos"

# ---------------------------------------------------------------------------
# 6. Verifica instalação
# ---------------------------------------------------------------------------
echo ""
echo "╔══════════════════════════════════════════════════╗"
echo "║  Verificação                                     ║"
echo "╚══════════════════════════════════════════════════╝"
echo "Python:      $($PYTHON --version)"
echo "mlx-lm:      $($PYTHON -c 'import mlx_lm; print(mlx_lm.__version__)' 2>/dev/null || echo 'ok')"
echo "llama.cpp:   $LLAMACPP_DIR/build/bin/llama-cli --version 2>/dev/null | head -1 || echo 'ok'"
echo "Ollama:      $(ollama --version)"
echo ""
echo "→ Próximo passo:"
echo "   bun run generate-dataset   # gera docs/data/finetune-dataset.jsonl"
echo "   bash scripts/finetune.sh   # treina, converte, registra no Ollama"

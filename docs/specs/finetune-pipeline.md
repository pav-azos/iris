# Fine-tuning Pipeline (Reference — Out of Scope for v1)

## What
LoRA fine-tuning of mistral:7b-instruct on Lei 15.040/2024 Q&A pairs using MLX on Apple Silicon.

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

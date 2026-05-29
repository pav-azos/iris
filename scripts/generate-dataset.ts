#!/usr/bin/env bun
/**
 * ÍRIS — Gerador de Dataset de Fine-tuning
 *
 * Lê os arquivos FAQ e gera docs/data/finetune-dataset.jsonl
 * Formato MLX chat com system message.
 *
 * Uso: bun run generate-dataset
 */

import { readFileSync, writeFileSync, existsSync, mkdirSync, readdirSync } from "fs";
import { join } from "path";
import { IRIS_SYSTEM_PROMPT } from "../packages/rag/prompt-builder";

const ROOT = join(import.meta.dir, "..");
const OUT_DIR = join(ROOT, "docs", "data");
const OUT_FILE = join(OUT_DIR, "finetune-dataset.jsonl");
const TRAIN_FILE = join(OUT_DIR, "train.jsonl");
const VALID_FILE = join(OUT_DIR, "valid.jsonl");

mkdirSync(OUT_DIR, { recursive: true });

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------
export interface QAPair {
  question: string;
  answer: string;
}

interface Message {
  role: "system" | "user" | "assistant";
  content: string;
}

interface TrainingExample {
  messages: Message[];
}

// ---------------------------------------------------------------------------
// Parser: Extract Q&A pairs from FAQ format
// Pattern: **N. Question** ... **Resposta:** Answer
// ---------------------------------------------------------------------------
const QA_PATTERN = /\*\*(\d+)\.\s*(.+?)\*\*[\s\S]*?\*\*Resposta:\*\*\s*([\s\S]+?)(?=\*\*\d+\.|$)/g;

export function parseQAPairs(text: string): QAPair[] {
  const pairs: QAPair[] = [];
  for (const match of text.matchAll(QA_PATTERN)) {
    const question = match[2].replace(/\*+/g, "").trim();
    const answer = match[3]
      .split("\n")
      .filter((l) => !l.startsWith("*(Referência") && l.trim())
      .join(" ")
      .replace(/\*+/g, "")
      .trim();
    if (question && answer) pairs.push({ question, answer });
  }
  return pairs;
}

// ---------------------------------------------------------------------------
// Parser: Extract Q&A pairs from simple format
// Pattern: "N. **Question?** Answer text."
// ---------------------------------------------------------------------------
const SIMPLE_QA_PATTERN = /^\d+\.\s+\*\*(.+?)\*\*\s+(.+)$/;

export function parseSimpleQA(text: string): QAPair[] {
  const pairs: QAPair[] = [];
  for (const line of text.split("\n")) {
    const m = line.trim().match(SIMPLE_QA_PATTERN);
    if (!m) continue;
    const question = m[1].replace(/\*+/g, "").trim();
    const answer = m[2].replace(/\*+/g, "").trim();
    if (question && answer && answer.length > 5) pairs.push({ question, answer });
  }
  return pairs;
}

// ---------------------------------------------------------------------------
// Format: Convert Q&A pair to MLX training entry
// ---------------------------------------------------------------------------
export function formatMLXEntry(question: string, answer: string): string {
  return JSON.stringify({
    messages: [
      { role: "system", content: IRIS_SYSTEM_PROMPT },
      { role: "user", content: question },
      { role: "assistant", content: answer },
    ],
  });
}

// ---------------------------------------------------------------------------
// Shuffle with fixed seed for reproducibility
// ---------------------------------------------------------------------------
function shuffle<T>(arr: T[]): T[] {
  const copy = [...arr];
  let seed = 42;
  const rand = (): number => {
    seed = (seed * 1664525 + 1013904223) & 0xffffffff;
    return (seed >>> 0) / 0xffffffff;
  };
  for (let i = copy.length - 1; i > 0; i--) {
    const j = Math.floor(rand() * (i + 1));
    [copy[i], copy[j]] = [copy[j], copy[i]];
  }
  return copy;
}

// ---------------------------------------------------------------------------
// Main
// ---------------------------------------------------------------------------
function main() {
  const allPairs: QAPair[] = [];

  // Source files
  const DATA_RAW = join(ROOT, "data");

  const staticSources = [
    join(ROOT, "docs", "Agente FAQ Lei Geral Seguros.txt"),
    join(OUT_DIR, "FAQ.txt"),
  ];

  const webQASources = (() => {
    try {
      return readdirSync(DATA_RAW)
        .filter((f) => f.startsWith("web-qa-") && f.endsWith(".md"))
        .map((f) => join(DATA_RAW, f));
    } catch {
      return [];
    }
  })();

  const sources = [...staticSources, ...webQASources];

  for (const src of sources) {
    try {
      const text = readFileSync(src, "utf-8");
      let pairs = parseQAPairs(text);
      if (pairs.length === 0) pairs = parseSimpleQA(text);
      console.log(`✓ ${src.split("/").pop()}: ${pairs.length} pares`);
      allPairs.push(...pairs);
    } catch {
      console.warn(`⚠ Não encontrado: ${src}`);
    }
  }

  if (allPairs.length === 0) {
    console.error("✗ Nenhum par Q&A encontrado.");
    process.exit(1);
  }

  // Remove duplicatas por chave de pergunta
  const seen = new Set<string>();
  const unique = allPairs.filter(({ question }) => {
    const key = question.toLowerCase().slice(0, 60);
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });

  console.log(`✓ Pares únicos: ${unique.length}`);

  // Convert + shuffle + split 80/20
  const examples = unique.map(({ question, answer }) =>
    formatMLXEntry(question, answer)
  );
  const shuffled = shuffle(examples);
  const splitIdx = Math.floor(shuffled.length * 0.8);
  const train = shuffled.slice(0, splitIdx);
  const valid = shuffled.slice(splitIdx);

  // Serialize as JSONL
  const toJsonl = (items: string[]) => items.join("\n");

  writeFileSync(OUT_FILE, toJsonl(shuffled));
  writeFileSync(TRAIN_FILE, toJsonl(train));
  writeFileSync(VALID_FILE, toJsonl(valid));

  console.log("");
  console.log("╔══════════════════════════════════════════════════╗");
  console.log("║  Dataset gerado com sucesso                      ║");
  console.log("╚══════════════════════════════════════════════════╝");
  console.log(`Total:      ${shuffled.length} exemplos`);
  console.log(`Train:      ${train.length}  → ${TRAIN_FILE}`);
  console.log(`Validation: ${valid.length}   → ${VALID_FILE}`);
  console.log(`Full:       ${OUT_FILE}`);
  console.log("");
  console.log("→ Próximo: bash scripts/finetune.sh");
}

if (import.meta.main) {
  main();
}

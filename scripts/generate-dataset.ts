#!/usr/bin/env bun
/**
 * ÍRIS — Gerador de Dataset de Fine-tuning
 *
 * Lê os arquivos FAQ e gera docs/data/finetune-dataset.jsonl
 * Formato MLX chat com system message.
 *
 * Uso: bun run generate-dataset
 */

import { readFileSync, writeFileSync, existsSync, mkdirSync } from "fs";
import { join } from "path";

// ---------------------------------------------------------------------------
// Paths
// ---------------------------------------------------------------------------
const ROOT = join(import.meta.dir, "..");
const DOCS = join(ROOT, "docs");
const OUT_DIR = join(DOCS, "data");
const OUT_FILE = join(OUT_DIR, "finetune-dataset.jsonl");
const TRAIN_FILE = join(OUT_DIR, "train.jsonl");
const VALID_FILE = join(OUT_DIR, "valid.jsonl");

mkdirSync(OUT_DIR, { recursive: true });

// ---------------------------------------------------------------------------
// System prompt ÍRIS
// ---------------------------------------------------------------------------
const SYSTEM_PROMPT = `Você é ÍRIS — Inteligência em Regulação e Informação Securitária.
Especialista na Lei 15.040/2024 (Marco Legal do Seguro brasileiro).

Regras de comportamento:
1. Responda APENAS sobre a Lei 15.040/2024 e seus impactos no mercado de seguros.
2. Cite sempre o artigo ou fonte específica ao responder (ex: "Pelo Art. 45 da Lei 15.040/2024...").
3. Se não souber ou o assunto fugir da lei de seguros, diga: "Não tenho informação sobre isso na minha base de conhecimento."
4. Seja precisa, objetiva e profissional. Sem floreios.
5. Nunca invente dados, prazos, valores ou artigos.`;

// ---------------------------------------------------------------------------
// Tipos
// ---------------------------------------------------------------------------
interface Message {
  role: "system" | "user" | "assistant";
  content: string;
}

interface TrainingExample {
  messages: Message[];
}

// ---------------------------------------------------------------------------
// Parser: FAQ MD (formato **N. Pergunta?** \n **Resposta:** Texto)
// ---------------------------------------------------------------------------
function parseFaqMd(text: string): Array<{ q: string; a: string }> {
  const pairs: Array<{ q: string; a: string }> = [];

  // Captura **N. Pergunta** + **Resposta:** conteúdo
  const questionRegex =
    /\*\*\d+\.\s+([^*]+?)\*\*\s*\n\*\*Resposta:\*\*\s*([\s\S]+?)(?=\n\*\*\d+\.|$)/gm;

  let match;
  while ((match = questionRegex.exec(text)) !== null) {
    const q = match[1].trim().replace(/\?$/, "") + "?";
    // Remove referências entre parênteses e limpa espaços
    const a = match[2]
      .replace(/\*\(Referência:[^)]*\)\*/g, "")
      .replace(/\n+/g, " ")
      .trim();

    if (q.length > 10 && a.length > 20) {
      pairs.push({ q, a });
    }
  }

  return pairs;
}

// ---------------------------------------------------------------------------
// Parser: FAQ.txt (flashcard — "**P:** ... **R:** ...")
// ---------------------------------------------------------------------------
function parseFaqTxt(text: string): Array<{ q: string; a: string }> {
  const pairs: Array<{ q: string; a: string }> = [];
  const lines = text.split("\n");
  let currentQ = "";

  for (const line of lines) {
    const trimmed = line.trim();

    // Pergunta: termina com ? e não é resposta
    if (
      trimmed.endsWith("?") &&
      trimmed.length > 15 &&
      !trimmed.startsWith("**R:")
    ) {
      currentQ = trimmed
        .replace(/^\*\*P:\*\*\s*/, "")
        .replace(/^\d+\.\s*/, "");
    }

    // Resposta
    if (trimmed.startsWith("**R:**") && currentQ) {
      const a = trimmed.replace(/^\*\*R:\*\*\s*/, "").trim();
      if (a.length > 20) {
        pairs.push({ q: currentQ, a });
        currentQ = "";
      }
    }
  }

  return pairs;
}

// ---------------------------------------------------------------------------
// Converte par Q&A em exemplo de treino MLX
// ---------------------------------------------------------------------------
function toTrainingExample(q: string, a: string): TrainingExample {
  return {
    messages: [
      { role: "system", content: SYSTEM_PROMPT },
      { role: "user", content: q },
      { role: "assistant", content: a },
    ],
  };
}

// ---------------------------------------------------------------------------
// Shuffle com seed fixo (reproducibilidade)
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
  const allPairs: Array<{ q: string; a: string }> = [];

  // 1. FAQ principal (arquivo .txt com formato MD)
  const faqMdPath = join(DOCS, "Agente FAQ Lei Geral Seguros.txt");
  if (existsSync(faqMdPath)) {
    const text = readFileSync(faqMdPath, "utf-8");
    const pairs = parseFaqMd(text);
    console.log(`✓ FAQ principal: ${pairs.length} pares`);
    allPairs.push(...pairs);
  } else {
    console.warn(`⚠ Não encontrado: ${faqMdPath}`);
  }

  // 2. FAQ.txt adicional (flashcards)
  const faqTxtPath = join(OUT_DIR, "FAQ.txt");
  if (existsSync(faqTxtPath)) {
    const text = readFileSync(faqTxtPath, "utf-8");
    const pairs = parseFaqTxt(text);
    console.log(`✓ FAQ.txt: ${pairs.length} pares`);
    allPairs.push(...pairs);
  } else {
    console.log(`ℹ  FAQ.txt não encontrado — apenas FAQ principal será usado`);
  }

  if (allPairs.length === 0) {
    console.error("✗ Nenhum par Q&A encontrado.");
    process.exit(1);
  }

  // Remove duplicatas por chave de pergunta (primeiros 60 chars lowercase)
  const seen = new Set<string>();
  const unique = allPairs.filter(({ q }) => {
    const key = q.toLowerCase().slice(0, 60);
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });

  console.log(`✓ Pares únicos: ${unique.length}`);

  // Converte + shuffle + split 80/20
  const examples = unique.map(({ q, a }) => toTrainingExample(q, a));
  const shuffled = shuffle(examples);
  const splitIdx = Math.floor(shuffled.length * 0.8);
  const train = shuffled.slice(0, splitIdx);
  const valid = shuffled.slice(splitIdx);

  // Serializa como JSONL (uma linha por exemplo)
  const toJsonl = (items: TrainingExample[]) =>
    items.map((e) => JSON.stringify(e)).join("\n");

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

main();

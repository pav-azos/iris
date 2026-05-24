#!/usr/bin/env bun
/**
 * ÍRIS — Augmentação de Dataset com Claude API
 *
 * Gera ~10x mais exemplos a partir do dataset base via:
 *   1. Refraseamento de perguntas (4× por par)
 *   2. Perguntas de cenário prático
 *   3. Exemplos negativos (out-of-scope → ÍRIS recusa)
 *   4. Pares multi-turn (pergunta + follow-up)
 *
 * Usa Claude Haiku 3.5 (barato) + prompt caching (90% desconto em tokens repetidos)
 *
 * Uso: ANTHROPIC_API_KEY=... bun run augment-dataset
 * Flags: --rephrase-n=4 --add-negatives --add-multiturn --dry-run
 */

import Anthropic from "@anthropic-ai/sdk";
import { readFileSync, writeFileSync, existsSync, mkdirSync } from "fs";
import { join } from "path";

// ---------------------------------------------------------------------------
// Config
// ---------------------------------------------------------------------------
const ROOT = join(import.meta.dir, "..");
const DATA_DIR = join(ROOT, "docs", "data");
const TRAIN_FILE = join(DATA_DIR, "train.jsonl");
const OUT_FILE = join(DATA_DIR, "train-augmented.jsonl");
const VALID_FILE = join(DATA_DIR, "valid-augmented.jsonl");

const REPHRASE_N = parseInt(
  process.argv.find((a) => a.startsWith("--rephrase-n="))?.split("=")[1] ?? "4"
);
const ADD_NEGATIVES = process.argv.includes("--add-negatives") || true;
const ADD_MULTITURN = process.argv.includes("--add-multiturn") || true;
const DRY_RUN = process.argv.includes("--dry-run");
const CONCURRENCY = 5; // chamadas paralelas simultâneas

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
// System prompt ÍRIS (cacheado — não muda entre chamadas)
// ---------------------------------------------------------------------------
const IRIS_SYSTEM_PROMPT = `Você é ÍRIS — Inteligência em Regulação e Informação Securitária.
Especialista na Lei 15.040/2024 (Marco Legal do Seguro brasileiro).

Regras de comportamento:
1. Responda APENAS sobre a Lei 15.040/2024 e seus impactos no mercado de seguros.
2. Cite sempre o artigo ou fonte específica ao responder (ex: "Pelo Art. 45 da Lei 15.040/2024...").
3. Se não souber ou o assunto fugir da lei de seguros, diga: "Não tenho informação sobre isso na minha base de conhecimento."
4. Seja precisa, objetiva e profissional. Sem floreios.
5. Nunca invente dados, prazos, valores ou artigos.`;

// ---------------------------------------------------------------------------
// Cliente Claude com prompt caching
// ---------------------------------------------------------------------------
const client = new Anthropic({
  apiKey: process.env.ANTHROPIC_API_KEY,
});

const AUGMENT_SYSTEM = `Você é especialista em criação de datasets de fine-tuning para LLMs.
Seu objetivo: gerar variações de alta qualidade de pares pergunta/resposta sobre a Lei 15.040/2024 (Marco Legal do Seguro brasileiro).

Regras:
- Mantenha a precisão técnica e jurídica
- Varie o vocabulário, a estrutura da pergunta e o registro (formal/informal)
- Nunca invente artigos ou fatos não presentes na resposta original
- Output sempre em JSON válido, exatamente no formato solicitado
- Português brasileiro`;

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------
function readJsonl<T>(path: string): T[] {
  if (!existsSync(path)) return [];
  return readFileSync(path, "utf-8")
    .split("\n")
    .filter(Boolean)
    .map((line) => JSON.parse(line) as T);
}

function writeJsonl(path: string, items: unknown[]) {
  writeFileSync(path, items.map((i) => JSON.stringify(i)).join("\n"));
}

function shuffle<T>(arr: T[], seed = 42): T[] {
  const copy = [...arr];
  let s = seed;
  const rand = () => {
    s = (s * 1664525 + 1013904223) & 0xffffffff;
    return (s >>> 0) / 0xffffffff;
  };
  for (let i = copy.length - 1; i > 0; i--) {
    const j = Math.floor(rand() * (i + 1));
    [copy[i], copy[j]] = [copy[j], copy[i]];
  }
  return copy;
}

async function callClaude(userPrompt: string): Promise<string> {
  const response = await client.messages.create({
    model: "claude-haiku-4-5-20251001", // Haiku 4.5 — rápido e barato
    max_tokens: 2048,
    system: [
      {
        type: "text",
        text: AUGMENT_SYSTEM,
        cache_control: { type: "ephemeral" }, // cacheia system prompt
      },
    ],
    messages: [{ role: "user", content: userPrompt }],
  });

  const block = response.content[0];
  if (block.type !== "text") throw new Error("Resposta inesperada do Claude");
  return block.text.trim();
}

// Extrai JSON de resposta que pode ter markdown code fence
function extractJson(text: string): unknown {
  const fence = text.match(/```(?:json)?\s*([\s\S]+?)```/);
  const raw = fence ? fence[1] : text;
  return JSON.parse(raw.trim());
}

// Pool de concorrência simples
async function runConcurrent<T>(
  tasks: (() => Promise<T>)[],
  limit: number
): Promise<T[]> {
  const results: T[] = [];
  let idx = 0;

  async function worker() {
    while (idx < tasks.length) {
      const i = idx++;
      results[i] = await tasks[i]();
    }
  }

  await Promise.all(Array.from({ length: limit }, worker));
  return results;
}

// ---------------------------------------------------------------------------
// 1. Refraseamento de perguntas
// ---------------------------------------------------------------------------
async function rephraseExample(
  example: TrainingExample,
  n: number
): Promise<TrainingExample[]> {
  const userMsg = example.messages.find((m) => m.role === "user");
  const assistantMsg = example.messages.find((m) => m.role === "assistant");
  if (!userMsg || !assistantMsg) return [];

  const prompt = `Gere ${n} variações da pergunta abaixo sobre a Lei 15.040/2024.
A resposta permanece a MESMA — apenas a pergunta deve variar.
Varie: registro (formal/informal), vocabulário, estrutura, perspectiva (corretor/segurado/seguradora).

Pergunta original: "${userMsg.content}"

Resposta (não alterar): "${assistantMsg.content}"

Retorne JSON array com ${n} objetos no formato:
[{"question": "variação 1"}, {"question": "variação 2"}, ...]`;

  try {
    const raw = await callClaude(prompt);
    const parsed = extractJson(raw) as Array<{ question: string }>;

    return parsed
      .filter((p) => p.question && p.question.length > 10)
      .slice(0, n)
      .map((p) => ({
        messages: [
          { role: "system" as const, content: IRIS_SYSTEM_PROMPT },
          { role: "user" as const, content: p.question },
          { role: "assistant" as const, content: assistantMsg.content },
        ],
      }));
  } catch (e) {
    console.warn(`⚠ Rephrase falhou: ${(e as Error).message}`);
    return [];
  }
}

// ---------------------------------------------------------------------------
// 2. Perguntas de cenário prático
// ---------------------------------------------------------------------------
async function generateScenario(
  example: TrainingExample
): Promise<TrainingExample | null> {
  const userMsg = example.messages.find((m) => m.role === "user");
  const assistantMsg = example.messages.find((m) => m.role === "assistant");
  if (!userMsg || !assistantMsg) return null;

  const prompt = `Baseado no par Q&A abaixo sobre a Lei 15.040/2024, crie UMA pergunta de cenário prático.
Estilo: "Um corretor/segurado está na situação X. O que diz a lei?"
A resposta deve adaptar a resposta original para o cenário, mantendo precisão jurídica.

Q original: "${userMsg.content}"
A original: "${assistantMsg.content}"

Retorne JSON:
{"question": "pergunta de cenário...", "answer": "resposta adaptada ao cenário..."}`;

  try {
    const raw = await callClaude(prompt);
    const parsed = extractJson(raw) as { question: string; answer: string };

    if (!parsed.question || !parsed.answer) return null;

    return {
      messages: [
        { role: "system", content: IRIS_SYSTEM_PROMPT },
        { role: "user", content: parsed.question },
        { role: "assistant", content: parsed.answer },
      ],
    };
  } catch (e) {
    console.warn(`⚠ Scenario falhou: ${(e as Error).message}`);
    return null;
  }
}

// ---------------------------------------------------------------------------
// 3. Exemplos negativos (out-of-scope)
// ---------------------------------------------------------------------------
const OUT_OF_SCOPE_TOPICS = [
  "receitas de culinária",
  "política partidária brasileira",
  "cotação do dólar",
  "esportes e futebol",
  "tecnologia e programação",
  "saúde e medicina (fora do contexto de seguro saúde)",
  "imóveis e financiamento imobiliário",
  "investimentos em bolsa de valores",
  "direito trabalhista",
  "legislação de trânsito",
  "imposto de renda pessoa física",
  "relacionamentos pessoais",
  "viagens e turismo",
  "educação escolar",
  "meio ambiente (fora do contexto securitário)",
];

async function generateNegativeExamples(count: number): Promise<TrainingExample[]> {
  const topics = shuffle(OUT_OF_SCOPE_TOPICS).slice(0, Math.min(count, OUT_OF_SCOPE_TOPICS.length));

  const prompt = `Gere ${topics.length} perguntas fora do escopo de uma assistente especialista em Lei 15.040/2024 (seguros).
Tópicos: ${topics.join(", ")}

Para cada pergunta, gere a resposta de recusa educada que ÍRIS daria.
Formato da recusa: "Não tenho informação sobre [tema] na minha base de conhecimento. Posso ajudar com dúvidas sobre a Lei 15.040/2024 e o mercado de seguros brasileiro."

Retorne JSON array:
[
  {"question": "pergunta fora do escopo...", "answer": "resposta de recusa..."},
  ...
]`;

  try {
    const raw = await callClaude(prompt);
    const parsed = extractJson(raw) as Array<{ question: string; answer: string }>;

    return parsed
      .filter((p) => p.question && p.answer)
      .map((p) => ({
        messages: [
          { role: "system" as const, content: IRIS_SYSTEM_PROMPT },
          { role: "user" as const, content: p.question },
          { role: "assistant" as const, content: p.answer },
        ],
      }));
  } catch (e) {
    console.warn(`⚠ Negativos falhou: ${(e as Error).message}`);
    return [];
  }
}

// ---------------------------------------------------------------------------
// 4. Multi-turn (pergunta base + follow-up)
// ---------------------------------------------------------------------------
async function generateMultiTurn(
  example: TrainingExample
): Promise<TrainingExample | null> {
  const userMsg = example.messages.find((m) => m.role === "user");
  const assistantMsg = example.messages.find((m) => m.role === "assistant");
  if (!userMsg || !assistantMsg) return null;

  const prompt = `Dado este par Q&A sobre a Lei 15.040/2024, gere UMA pergunta de follow-up natural e sua resposta.
O follow-up deve aprofundar ou clarificar um aspecto da resposta original.

Q1: "${userMsg.content}"
A1: "${assistantMsg.content}"

Retorne JSON:
{"followup_question": "...", "followup_answer": "..."}`;

  try {
    const raw = await callClaude(prompt);
    const parsed = extractJson(raw) as {
      followup_question: string;
      followup_answer: string;
    };

    if (!parsed.followup_question || !parsed.followup_answer) return null;

    // Conversa multi-turn: system + Q1 + A1 + Q2 + A2
    return {
      messages: [
        { role: "system", content: IRIS_SYSTEM_PROMPT },
        { role: "user", content: userMsg.content },
        { role: "assistant", content: assistantMsg.content },
        { role: "user", content: parsed.followup_question },
        { role: "assistant", content: parsed.followup_answer },
      ],
    };
  } catch (e) {
    console.warn(`⚠ Multi-turn falhou: ${(e as Error).message}`);
    return null;
  }
}

// ---------------------------------------------------------------------------
// Main
// ---------------------------------------------------------------------------
async function main() {
  if (!process.env.ANTHROPIC_API_KEY && !DRY_RUN) {
    console.error("✗ ANTHROPIC_API_KEY não definida.");
    console.error("  Execute: ANTHROPIC_API_KEY=sk-ant-... bun run augment-dataset");
    process.exit(1);
  }

  if (!existsSync(TRAIN_FILE)) {
    console.error(`✗ ${TRAIN_FILE} não encontrado. Execute: bun run generate-dataset`);
    process.exit(1);
  }

  const base = readJsonl<TrainingExample>(TRAIN_FILE);
  console.log(`✓ Base: ${base.length} exemplos de treino`);
  console.log(`  Rephrasings: ${REPHRASE_N}× por par`);
  console.log(`  Cenários: 1× por par (50% amostra)`);
  console.log(`  Negativos: ${OUT_OF_SCOPE_TOPICS.length}`);
  console.log(`  Multi-turn: 1× por par (30% amostra)`);
  console.log("");

  if (DRY_RUN) {
    console.log("[dry-run] Chamadas Claude seriam:");
    console.log(`  Rephrase: ${base.length} × ${REPHRASE_N} = ${base.length * REPHRASE_N} variações`);
    console.log(`  Cenários: ~${Math.floor(base.length * 0.5)}`);
    console.log(`  Negativos: 1 chamada batch`);
    console.log(`  Multi-turn: ~${Math.floor(base.length * 0.3)}`);
    console.log(`  Total estimado: ~${base.length * REPHRASE_N + Math.floor(base.length * 0.8) + 2} chamadas`);
    console.log(`  Custo estimado Haiku 4.5: ~$${((base.length * REPHRASE_N + base.length) * 0.001).toFixed(3)}`);
    return;
  }

  const augmented: TrainingExample[] = [...base]; // começa com os originais

  // --- Rephrasings (paralelo) ---
  console.log(`▶ Gerando ${REPHRASE_N} rephrasings por par...`);
  const rephraseTasks = base.map(
    (ex) => () => rephraseExample(ex, REPHRASE_N)
  );
  const rephraseResults = await runConcurrent(rephraseTasks, CONCURRENCY);
  const rephrased = rephraseResults.flat();
  augmented.push(...rephrased);
  console.log(`  ✓ +${rephrased.length} rephrasings`);

  // --- Cenários práticos (50% do base, paralelo) ---
  console.log("▶ Gerando cenários práticos (50% do base)...");
  const scenarioBase = shuffle(base).slice(0, Math.floor(base.length * 0.5));
  const scenarioTasks = scenarioBase.map((ex) => () => generateScenario(ex));
  const scenarioResults = await runConcurrent(scenarioTasks, CONCURRENCY);
  const scenarios = scenarioResults.filter(Boolean) as TrainingExample[];
  augmented.push(...scenarios);
  console.log(`  ✓ +${scenarios.length} cenários`);

  // --- Negativos (batch único) ---
  if (ADD_NEGATIVES) {
    console.log("▶ Gerando exemplos negativos (out-of-scope)...");
    const negatives = await generateNegativeExamples(OUT_OF_SCOPE_TOPICS.length);
    augmented.push(...negatives);
    console.log(`  ✓ +${negatives.length} negativos`);
  }

  // --- Multi-turn (30% do base, paralelo) ---
  if (ADD_MULTITURN) {
    console.log("▶ Gerando pares multi-turn (30% do base)...");
    const multiBase = shuffle(base).slice(0, Math.floor(base.length * 0.3));
    const multiTasks = multiBase.map((ex) => () => generateMultiTurn(ex));
    const multiResults = await runConcurrent(multiTasks, CONCURRENCY);
    const multiturn = multiResults.filter(Boolean) as TrainingExample[];
    augmented.push(...multiturn);
    console.log(`  ✓ +${multiturn.length} multi-turn`);
  }

  // --- Shuffle final + split 80/20 ---
  const shuffled = shuffle(augmented);
  const splitIdx = Math.floor(shuffled.length * 0.8);
  const train = shuffled.slice(0, splitIdx);
  const valid = shuffled.slice(splitIdx);

  mkdirSync(DATA_DIR, { recursive: true });
  writeJsonl(OUT_FILE, train);
  writeJsonl(VALID_FILE, valid);

  // --- Relatório ---
  const multiplier = (augmented.length / base.length).toFixed(1);
  console.log("");
  console.log("╔══════════════════════════════════════════════════╗");
  console.log("║  Augmentação concluída                           ║");
  console.log("╚══════════════════════════════════════════════════╝");
  console.log(`Base:        ${base.length} exemplos`);
  console.log(`Aumentado:   ${augmented.length} exemplos (${multiplier}×)`);
  console.log(`Train:       ${train.length}  → ${OUT_FILE}`);
  console.log(`Validation:  ${valid.length}   → ${VALID_FILE}`);
  console.log("");
  console.log("→ Para usar no fine-tuning:");
  console.log("  cp docs/data/train-augmented.jsonl docs/data/train.jsonl");
  console.log("  cp docs/data/valid-augmented.jsonl docs/data/valid.jsonl");
  console.log("  bash scripts/finetune.sh");
}

main().catch((e) => {
  console.error("✗ Erro fatal:", e);
  process.exit(1);
});

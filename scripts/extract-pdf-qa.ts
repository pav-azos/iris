#!/usr/bin/env bun
/**
 * ÍRIS — Extrator de Q&A dos PDFs do Corpus
 *
 * Lê cada PDF do corpus, divide em chunks por artigo/seção,
 * usa Claude Haiku pra gerar Q&A pairs, e anexa ao dataset.
 *
 * Uso: ANTHROPIC_API_KEY=sk-ant-... bun run extract-pdf-qa
 * Flags: --dry-run --pdf=<nome> --qa-per-chunk=3
 *
 * Output: docs/data/pdf-qa.jsonl (merge manual em train.jsonl depois)
 */

import Anthropic from "@anthropic-ai/sdk";
import { readFileSync, writeFileSync, existsSync, mkdirSync } from "fs";
import { join, basename } from "path";
// @ts-ignore — importa do caminho interno para evitar auto-teste (bug pdf-parse v1.1.1)
const pdfParse = require("pdf-parse/lib/pdf-parse.js");

// ---------------------------------------------------------------------------
// Config
// ---------------------------------------------------------------------------
const ROOT = join(import.meta.dir, "..");
const DOCS_DIR = join(ROOT, "docs");
const DATA_DIR = join(DOCS_DIR, "data");
const OUT_FILE = join(DATA_DIR, "pdf-qa.jsonl");
const MERGED_TRAIN = join(DATA_DIR, "train.jsonl");

const DRY_RUN = process.argv.includes("--dry-run");
const QA_PER_CHUNK = parseInt(
  process.argv.find((a) => a.startsWith("--qa-per-chunk="))?.split("=")[1] ?? "4"
);
const FILTER_PDF = process.argv.find((a) => a.startsWith("--pdf="))?.split("=")[1];
const CONCURRENCY = 3; // conservador — respeita rate limit 50 req/min

// PDFs em ordem de prioridade (mais autoritativos primeiro)
const PDF_SOURCES: Array<{ file: string; authority: string; priority: number }> = [
  { file: "L15040 - Nova lei de seguros.pdf",                                         authority: "law",      priority: 1 },
  { file: "FAQ da Lei nº 15.0402024 – Nova Lei do Contrato de Seguro.pdf",            authority: "official", priority: 2 },
  { file: "Plano de Regulação SUSEP 2026.pdf",                                        authority: "official", priority: 3 },
  { file: "Divergências entre a Lei 15.040_24 e as normas já existentes que regulam o contrato de seguros - ENS.pdf", authority: "third-party", priority: 4 },
  { file: "Adequação à Lei n 15.040 - oportunidade de reinvenção - PWC.pdf",          authority: "third-party", priority: 5 },
  { file: "O que mudou (Nova lei de seguros) - MAG SEGUROS.pdf",                       authority: "third-party", priority: 6 },
  { file: "Seis pontos sobre mudanças trazidas pelo Marco Legal - Fenacor.pdf",        authority: "third-party", priority: 7 },
  { file: "Conheça Nova Lei de Seguros - MDS Brasil.pdf",                              authority: "third-party", priority: 8 },
  { file: "03_Lei_o_que_o_consumidor_precisa_saber_DIGITAL_FINAL_7b0a32864c.pdf",     authority: "third-party", priority: 9 },
];

// ---------------------------------------------------------------------------
// System prompt ÍRIS (para os exemplos gerados)
// ---------------------------------------------------------------------------
const IRIS_SYSTEM_PROMPT = `Você é ÍRIS — Inteligência em Regulação e Informação Securitária.
Especialista na Lei 15.040/2024 (Marco Legal do Seguro brasileiro).

Regras de comportamento:
1. Responda APENAS sobre a Lei 15.040/2024 e seus impactos no mercado de seguros.
2. Cite sempre o artigo ou fonte específica ao responder (ex: "Pelo Art. 45 da Lei 15.040/2024...").
3. Se não souber ou o assunto fugir da lei de seguros, diga: "Não tenho informação sobre isso na minha base de conhecimento."
4. Seja precisa, objetiva e profissional. Sem floreios.
5. Nunca invente dados, prazos, valores ou artigos.`;

// System prompt do extrator (cacheado)
const EXTRACTOR_SYSTEM = `Você é especialista em Direito de Seguros brasileiro e em criação de datasets de fine-tuning para LLMs.
Analisa trechos de documentos sobre a Lei 15.040/2024 e gera pares de perguntas e respostas de alta qualidade.

Regras para geração:
- Perguntas variadas: corretores, segurados, seguradoras, advogados
- Respostas precisas com referência ao artigo/fonte quando disponível
- Respostas com 2-4 frases, estilo profissional
- Nunca invente informação não presente no trecho
- Perguntas em diferentes registros: formal ("Qual o prazo..."), prático ("O que acontece se..."), hipotético ("Um segurado que...")
- Output SEMPRE como JSON válido, sem texto antes ou depois`;

// ---------------------------------------------------------------------------
// Cliente Claude
// ---------------------------------------------------------------------------
const client = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });

// ---------------------------------------------------------------------------
// Tipos
// ---------------------------------------------------------------------------
interface QAPair { q: string; a: string; source: string }
interface TrainingExample {
  messages: Array<{ role: "system" | "user" | "assistant"; content: string }>;
}

// ---------------------------------------------------------------------------
// Extração de texto do PDF
// ---------------------------------------------------------------------------
async function extractPdfText(filePath: string): Promise<string> {
  const buffer = readFileSync(filePath);
  const data = await pdfParse(buffer);
  return data.text;
}

// ---------------------------------------------------------------------------
// Chunking inteligente
// ---------------------------------------------------------------------------

// Tenta dividir por artigos ("Art. N" ou "Artigo N")
function chunkByArticle(text: string): string[] {
  const articlePattern = /(?=Art(?:igo)?\.?\s+\d+)/gi;
  const chunks = text.split(articlePattern).filter((c) => c.trim().length > 100);

  // Se poucos artigos encontrados, usa chunking por tamanho
  if (chunks.length < 3) return chunkBySize(text, 1500);
  return chunks.map((c) => c.trim()).filter((c) => c.length > 80);
}

// Fallback: divide por tamanho com overlap
function chunkBySize(text: string, maxChars = 1500): string[] {
  const chunks: string[] = [];
  const paragraphs = text.split(/\n{2,}/).filter((p) => p.trim().length > 50);

  let current = "";
  for (const para of paragraphs) {
    if ((current + para).length > maxChars && current.length > 200) {
      chunks.push(current.trim());
      current = para;
    } else {
      current += (current ? "\n\n" : "") + para;
    }
  }
  if (current.trim().length > 80) chunks.push(current.trim());
  return chunks;
}

// ---------------------------------------------------------------------------
// Geração de Q&A via Claude Haiku com prompt caching
// ---------------------------------------------------------------------------
async function generateQAFromChunk(
  chunk: string,
  source: string,
  n: number
): Promise<QAPair[]> {
  const prompt = `Trecho do documento "${source}":

---
${chunk.slice(0, 2000)}
---

Gere exatamente ${n} pares de pergunta/resposta sobre este trecho.
Foque em informações práticas e relevantes para segurados, corretores ou seguradoras.

Retorne APENAS o JSON array, sem texto adicional:
[
  {
    "q": "pergunta clara e específica?",
    "a": "resposta precisa com 2-4 frases, citando artigo/fonte quando disponível"
  }
]`;

  const response = await client.messages.create({
    model: "claude-haiku-4-5-20251001",
    max_tokens: 1024,
    system: [
      {
        type: "text",
        text: EXTRACTOR_SYSTEM,
        cache_control: { type: "ephemeral" },
      },
    ],
    messages: [{ role: "user", content: prompt }],
  });

  const block = response.content[0];
  if (block.type !== "text") return [];

  // Extrai JSON — trata markdown code fence
  const raw = block.text.trim();
  const json = raw.match(/```(?:json)?\s*([\s\S]+?)```/)?.[1] ?? raw;

  const parsed = JSON.parse(json.trim()) as Array<{ q: string; a: string }>;
  return parsed
    .filter((p) => p.q?.length > 10 && p.a?.length > 20)
    .map((p) => ({ q: p.q, a: p.a, source }));
}

// ---------------------------------------------------------------------------
// Deduplicação contra dataset existente
// ---------------------------------------------------------------------------
function loadExistingQuestions(path: string): Set<string> {
  if (!existsSync(path)) return new Set();
  const lines = readFileSync(path, "utf-8").split("\n").filter(Boolean);
  const keys = new Set<string>();
  for (const line of lines) {
    try {
      const ex = JSON.parse(line) as TrainingExample;
      const userMsg = ex.messages.find((m) => m.role === "user");
      if (userMsg) keys.add(userMsg.content.toLowerCase().slice(0, 60));
    } catch { /* skip */ }
  }
  return keys;
}

// ---------------------------------------------------------------------------
// Pool de concorrência com retry em 429
// ---------------------------------------------------------------------------
async function withRetry<T>(fn: () => Promise<T>, maxRetries = 3): Promise<T | null> {
  for (let attempt = 0; attempt < maxRetries; attempt++) {
    try {
      return await fn();
    } catch (e: unknown) {
      const status = (e as { status?: number }).status;
      if (status === 429) {
        const wait = (attempt + 1) * 20000; // 20s, 40s, 60s
        console.log(`    ⏳ Rate limit — aguardando ${wait / 1000}s...`);
        await new Promise((r) => setTimeout(r, wait));
      } else {
        console.warn(`    ⚠ Erro: ${(e as Error).message?.slice(0, 80)}`);
        return null;
      }
    }
  }
  return null;
}

async function runConcurrent<T>(
  tasks: (() => Promise<T | null>)[],
  limit: number
): Promise<(T | null)[]> {
  const results: (T | null)[] = new Array(tasks.length).fill(null);
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
// Converte par para exemplo de treino
// ---------------------------------------------------------------------------
function toExample(pair: QAPair): TrainingExample {
  return {
    messages: [
      { role: "system", content: IRIS_SYSTEM_PROMPT },
      { role: "user", content: pair.q },
      { role: "assistant", content: pair.a },
    ],
  };
}

// ---------------------------------------------------------------------------
// Shuffle seed fixo
// ---------------------------------------------------------------------------
function shuffle<T>(arr: T[]): T[] {
  const copy = [...arr];
  let seed = 123;
  const rand = () => { seed = (seed * 1664525 + 1013904223) & 0xffffffff; return (seed >>> 0) / 0xffffffff; };
  for (let i = copy.length - 1; i > 0; i--) { const j = Math.floor(rand() * (i + 1)); [copy[i], copy[j]] = [copy[j], copy[i]]; }
  return copy;
}

// ---------------------------------------------------------------------------
// Main
// ---------------------------------------------------------------------------
async function main() {
  if (!process.env.ANTHROPIC_API_KEY && !DRY_RUN) {
    console.error("✗ ANTHROPIC_API_KEY não definida.");
    process.exit(1);
  }

  mkdirSync(DATA_DIR, { recursive: true });

  // Filtra PDFs se --pdf= especificado
  const sources = FILTER_PDF
    ? PDF_SOURCES.filter((s) => s.file.toLowerCase().includes(FILTER_PDF.toLowerCase()))
    : PDF_SOURCES;

  console.log(`╔══════════════════════════════════════════════════╗`);
  console.log(`║  ÍRIS PDF Q&A Extractor                          ║`);
  console.log(`╚══════════════════════════════════════════════════╝`);
  console.log(`PDFs: ${sources.length} | Q&A por chunk: ${QA_PER_CHUNK} | Dry: ${DRY_RUN}`);
  console.log("");

  // Carrega perguntas existentes para deduplicação
  const existingQs = loadExistingQuestions(MERGED_TRAIN);
  const existingPdfQs = loadExistingQuestions(OUT_FILE);
  const allExisting = new Set([...existingQs, ...existingPdfQs]);
  console.log(`✓ Perguntas já existentes (dedup): ${allExisting.size}`);
  console.log("");

  const allPairs: QAPair[] = [];

  for (const src of sources) {
    const filePath = join(DOCS_DIR, src.file);
    if (!existsSync(filePath)) {
      console.log(`⚠ Não encontrado: ${src.file}`);
      continue;
    }

    console.log(`▶ ${basename(src.file)} [${src.authority}]`);

    // Extrai texto
    let text: string;
    try {
      text = await extractPdfText(filePath);
    } catch (e) {
      console.log(`  ✗ Erro ao extrair texto: ${(e as Error).message}`);
      continue;
    }

    // Limpa texto (remove artefatos de PDF)
    text = text
      .replace(/\x00/g, "")
      .replace(/[ --]/g, " ")
      .replace(/[ \t]{3,}/g, "  ")
      .trim();

    // Chunking
    const chunks = src.authority === "law"
      ? chunkByArticle(text)
      : chunkBySize(text, 1200);

    console.log(`  Chunks: ${chunks.length}`);

    if (DRY_RUN) {
      console.log(`  [dry-run] ${chunks.length} chunks × ${QA_PER_CHUNK} Q&A = ~${chunks.length * QA_PER_CHUNK} pares`);
      continue;
    }

    // Gera Q&A em paralelo com retry
    const tasks = chunks.map((chunk) => () =>
      withRetry(() => generateQAFromChunk(chunk, basename(src.file), QA_PER_CHUNK))
    );

    const results = await runConcurrent(tasks, CONCURRENCY);
    const pairs = results.flat().filter(Boolean) as QAPair[];

    // Deduplicação
    const unique = pairs.filter(({ q }) => {
      const key = q.toLowerCase().slice(0, 60);
      if (allExisting.has(key)) return false;
      allExisting.add(key);
      return true;
    });

    console.log(`  ✓ +${unique.length} pares únicos (${pairs.length - unique.length} duplicados)`);
    allPairs.push(...unique);
  }

  if (DRY_RUN) {
    const total = sources.reduce((acc, s) => {
      const path = join(DOCS_DIR, s.file);
      return acc + (existsSync(path) ? 1 : 0);
    }, 0);
    const estChunks = total * 15; // ~15 chunks por PDF
    console.log(`\n[dry-run] Estimativa total:`);
    console.log(`  PDFs válidos:  ${total}`);
    console.log(`  Chunks est.:   ~${estChunks}`);
    console.log(`  Q&A est.:      ~${estChunks * QA_PER_CHUNK}`);
    console.log(`  Chamadas API:  ~${estChunks}`);
    console.log(`  Custo Haiku:   ~$${(estChunks * 0.001).toFixed(2)}`);
    return;
  }

  if (allPairs.length === 0) {
    console.log("\n⚠ Nenhum par gerado.");
    return;
  }

  // Serializa como JSONL
  const shuffled = shuffle(allPairs);
  const jsonl = shuffled.map((p) => JSON.stringify(toExample(p))).join("\n");
  writeFileSync(OUT_FILE, jsonl);

  // Relatório
  console.log(`\n╔══════════════════════════════════════════════════╗`);
  console.log(`║  Extração concluída                              ║`);
  console.log(`╚══════════════════════════════════════════════════╝`);
  console.log(`Novos pares: ${allPairs.length}`);
  console.log(`Output:      ${OUT_FILE}`);
  console.log(``);
  console.log(`→ Para adicionar ao treino:`);
  console.log(`  cat ${OUT_FILE} >> ${MERGED_TRAIN}`);
  console.log(`  # Regera valid split:`);
  console.log(`  bun run split-dataset`);
}

main().catch((e) => { console.error("✗", e); process.exit(1); });

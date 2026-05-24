#!/usr/bin/env bun
/**
 * ÍRIS Model Evaluation — Pre/Post Fine-Tuning Benchmark
 *
 * Tests model domain knowledge WITHOUT RAG context.
 * Before fine-tuning: model should fail (doesn't know Lei 15.040)
 * After fine-tuning: model should pass (learned the domain)
 *
 * Usage:
 *   bun run eval-model                          # baseline: mistral:7b-instruct
 *   OLLAMA_MODEL=iris-mistral bun run eval-model # fine-tuned
 *   bun run eval-model --limit 10               # quick test, 10 questions
 *   bun run eval-model --threshold 0.4          # custom pass threshold
 */
import { existsSync, readFileSync, writeFileSync } from 'fs';
import { join } from 'path';

const ROOT         = join(import.meta.dir, '..');
const DATASET_PATH = join(ROOT, 'docs/data/valid.jsonl');
const REPORTS_DIR  = join(ROOT, 'docs/data');

const OLLAMA_BASE_URL = process.env.OLLAMA_BASE_URL ?? 'http://localhost:11434';
const OLLAMA_MODEL    = process.env.OLLAMA_MODEL    ?? 'mistral:7b-instruct';

// Portuguese stopwords to exclude from keyword scoring
const PT_STOPWORDS = new Set([
  'o', 'a', 'e', 'de', 'do', 'da', 'dos', 'das', 'em', 'no', 'na', 'nos', 'nas',
  'por', 'para', 'com', 'que', 'se', 'ao', 'aos', 'um', 'uma', 'uns', 'umas',
  'ou', 'mas', 'não', 'sim', 'já', 'mais', 'como', 'ele', 'ela', 'seu', 'sua',
  'ser', 'ter', 'foi', 'são', 'está', 'este', 'essa', 'isso', 'pode', 'deve',
]);

export interface EvalResult {
  question: string;
  expectedAnswer: string;
  modelAnswer: string;
  score: number;      // 0.0 to 1.0
  pass: boolean;      // score >= threshold
  durationMs: number;
}

export interface EvalReport {
  model: string;
  timestamp: string;
  threshold: number;
  totalQuestions: number;
  passed: number;
  failed: number;
  accuracy: number;   // passed / total
  avgScore: number;
  results: EvalResult[];
}

/** Keyword overlap score between model answer and expected answer */
export function scoreAnswer(modelAnswer: string, expectedAnswer: string): number {
  const tokenize = (s: string): Set<string> => {
    const words = s.toLowerCase()
      .normalize('NFD').replace(/[̀-ͯ]/g, '') // strip accents for matching
      .replace(/[^a-z0-9\s]/g, ' ')
      .split(/\s+/)
      .filter(w => w.length > 2 && !PT_STOPWORDS.has(w));
    return new Set(words);
  };

  const expected = tokenize(expectedAnswer);
  const model    = tokenize(modelAnswer);

  if (expected.size === 0) return 0;

  let hits = 0;
  for (const word of expected) {
    if (model.has(word)) hits++;
  }
  return hits / expected.size;
}

async function askModel(question: string, systemPrompt?: string): Promise<string> {
  const messages = [
    ...(systemPrompt ? [{ role: 'system', content: systemPrompt }] : []),
    { role: 'user', content: question },
  ];

  const res = await fetch(`${OLLAMA_BASE_URL}/api/chat`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ model: OLLAMA_MODEL, messages, stream: false }),
    signal: AbortSignal.timeout(60_000),
  });

  if (!res.ok) throw new Error(`Ollama error: ${res.status}`);
  const data = (await res.json()) as { message: { content: string } };
  return data.message.content.trim();
}

function loadDataset(path: string): Array<{ question: string; answer: string }> {
  if (!existsSync(path)) throw new Error(`Dataset not found: ${path}`);
  return readFileSync(path, 'utf-8')
    .split('\n')
    .filter(l => l.trim())
    .map(l => {
      const entry = JSON.parse(l) as { messages: Array<{ role: string; content: string }> };
      const user = entry.messages.find(m => m.role === 'user');
      const assistant = entry.messages.find(m => m.role === 'assistant');
      return { question: user?.content ?? '', answer: assistant?.content ?? '' };
    })
    .filter(p => p.question && p.answer);
}

function parseArgs() {
  const args = process.argv.slice(2);
  const limitIdx = args.indexOf('--limit');
  const threshIdx = args.indexOf('--threshold');
  return {
    limit:     limitIdx !== -1 ? parseInt(args[limitIdx + 1]) : undefined,
    threshold: threshIdx !== -1 ? parseFloat(args[threshIdx + 1]) : 0.3,
    noRag:     args.includes('--no-rag'),
  };
}

const EVAL_SYSTEM_PROMPT = `Você é um assistente especialista em seguros no Brasil.
Responda a pergunta sobre a Lei nº 15.040/2024 com base no seu conhecimento.
Seja direto e objetivo. Se não souber, diga claramente.`;

if (import.meta.main) {
  const { limit, threshold } = parseArgs();

  console.log(`\n🔍 ÍRIS Model Evaluation`);
  console.log(`   Model:     ${OLLAMA_MODEL}`);
  console.log(`   Threshold: ${threshold} (score ≥ ${threshold} = PASS)`);
  console.log(`   Dataset:   ${DATASET_PATH}\n`);

  const dataset = loadDataset(DATASET_PATH);
  const questions = limit ? dataset.slice(0, limit) : dataset;
  console.log(`   Questions: ${questions.length}\n`);

  const results: EvalResult[] = [];
  let passed = 0;

  for (let i = 0; i < questions.length; i++) {
    const { question, answer } = questions[i];
    process.stdout.write(`[${String(i + 1).padStart(3)}/${questions.length}] ${question.slice(0, 60)}…`);

    const start = Date.now();
    let modelAnswer = '';
    try {
      modelAnswer = await askModel(question, EVAL_SYSTEM_PROMPT);
    } catch (err) {
      modelAnswer = `ERROR: ${err instanceof Error ? err.message : 'unknown'}`;
    }
    const durationMs = Date.now() - start;

    const score = scoreAnswer(modelAnswer, answer);
    const pass  = score >= threshold;
    if (pass) passed++;

    const badge = pass ? '✅' : '❌';
    console.log(` ${badge} score=${score.toFixed(2)} (${durationMs}ms)`);

    results.push({ question, expectedAnswer: answer, modelAnswer, score, pass, durationMs });
  }

  const accuracy = passed / questions.length;
  const avgScore = results.reduce((s, r) => s + r.score, 0) / results.length;

  const report: EvalReport = {
    model: OLLAMA_MODEL,
    timestamp: new Date().toISOString(),
    threshold,
    totalQuestions: questions.length,
    passed,
    failed: questions.length - passed,
    accuracy,
    avgScore,
    results,
  };

  const reportPath = join(REPORTS_DIR, `eval-${OLLAMA_MODEL.replace(/[:/]/g, '-')}-${Date.now()}.json`);
  writeFileSync(reportPath, JSON.stringify(report, null, 2));

  console.log(`\n${'─'.repeat(60)}`);
  console.log(`Model:    ${OLLAMA_MODEL}`);
  console.log(`Accuracy: ${(accuracy * 100).toFixed(1)}% (${passed}/${questions.length} passed)`);
  console.log(`Avg score: ${avgScore.toFixed(3)}`);
  console.log(`Report:   ${reportPath}`);

  if (accuracy < 0.3) {
    console.log(`\n⚠️  Low accuracy — expected BEFORE fine-tuning (baseline).\n`);
  } else if (accuracy >= 0.5) {
    console.log(`\n🎓 Good accuracy — model has learned the domain!\n`);
  }
}

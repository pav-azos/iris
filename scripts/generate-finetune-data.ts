#!/usr/bin/env bun
/**
 * ÍRIS Fine-Tuning Data Generator
 *
 * Generates RAG-aligned training examples:
 *   system = ÍRIS prompt + retrieved corpus context (matches inference)
 *   user   = paraphrase variant of seed question
 *   assistant = gold answer citing article
 *
 * Usage:
 *   ANTHROPIC_API_KEY=sk-... bun scripts/generate-finetune-data.ts
 *   VARIANTS=3 OUT=docs/data/augmented.jsonl bun scripts/generate-finetune-data.ts
 */

import Anthropic from '@anthropic-ai/sdk';
import { readFileSync, writeFileSync } from 'fs';
import { join } from 'path';

// ─── config ───────────────────────────────────────────────────────────────────

const VARIANTS       = Number(process.env.VARIANTS ?? 4);     // paraphrases per seed
const TOP_K          = Number(process.env.TOP_K ?? 4);        // RAG chunks per example
const OUT            = process.env.OUT ?? 'docs/data/train-augmented.jsonl';
const CORPUS_PATH    = process.env.CORPUS_PATH ?? join(import.meta.dir, '../apps/web/data/corpus.json');
const OLLAMA_BASE    = process.env.OLLAMA_BASE_URL ?? 'http://localhost:11434';
const EMBED_MODEL    = process.env.OLLAMA_EMBED_MODEL ?? 'bge-m3';

// ─── types ────────────────────────────────────────────────────────────────────

interface Chunk {
  id: string;
  text: string;
  embedding: number[];
  metadata: { source: string; page: number; authority: string };
}

interface SeedQA {
  category: string;
  question: string;
  answer: string; // gold answer with article citation
}

// ─── seed Q&A dataset ─────────────────────────────────────────────────────────
// Covers 10 main change categories of Lei 15.040/2024.
// Answers verified against law text + FAQ corpus.

const SEEDS: SeedQA[] = [
  // ── 1. PRAZOS DE PAGAMENTO DE SINISTRO ──────────────────────────────────────
  {
    category: 'prazos-pagamento',
    question: 'Qual o prazo máximo para a seguradora pagar a indenização após reconhecer a cobertura?',
    answer: 'Pelo Art. 87, § 1º da Lei 15.040/2024, a seguradora tem 30 dias contados do reconhecimento formal da cobertura para efetuar o pagamento da indenização.',
  },
  {
    category: 'prazos-pagamento',
    question: 'A seguradora pode pagar a indenização em parcelas ou tem de ser de uma vez?',
    answer: 'A lei não permite parcelamento arbitrário. O Art. 87 exige que o pagamento seja realizado integralmente no prazo de 30 dias após o reconhecimento, salvo disposição específica da apólice para casos de pagamento periódico.',
  },
  {
    category: 'prazos-pagamento',
    question: 'O que acontece se a seguradora não pagar a indenização no prazo legal?',
    answer: 'O atraso no pagamento sujeita a seguradora à incidência de juros moratórios e correção monetária, além de possível responsabilização civil por danos decorrentes da mora, conforme os princípios do Art. 87 da Lei 15.040/2024.',
  },

  // ── 2. PRAZOS DE ANÁLISE DE SINISTRO ────────────────────────────────────────
  {
    category: 'prazos-analise',
    question: 'Em quantos dias a seguradora deve comunicar ao segurado o reconhecimento ou recusa do sinistro?',
    answer: 'A seguradora deve se manifestar sobre o sinistro dentro do prazo estabelecido pela SUSEP via regulamentação, conforme delegação do Art. 84 da Lei 15.040/2024. Enquanto a norma regulatória não for publicada, aplica-se prazo razoável baseado na boa-fé.',
  },
  {
    category: 'prazos-analise',
    question: 'O prazo de análise do sinistro pode ser suspenso pela seguradora?',
    answer: 'Sim. Pelo Art. 87, § 5º da Lei 15.040/2024, a suspensão do prazo é permitida apenas 1 (uma) vez: nos sinistros de seguros de veículos automotores e em seguros cuja importância segurada não exceda 500 salários mínimos.',
  },
  {
    category: 'prazos-analise',
    question: 'Quantas vezes a seguradora pode pedir documentos adicionais ao segurado para analisar o sinistro?',
    answer: 'A seguradora só pode solicitar documentação complementar uma única vez. Pedidos sucessivos de documentos como estratégia de protelação violam o dever de boa-fé previsto na Lei 15.040/2024.',
  },

  // ── 3. PRESCRIÇÃO ────────────────────────────────────────────────────────────
  {
    category: 'prescricao',
    question: 'Qual o prazo para o segurado entrar com ação judicial contra a seguradora após recusa expressa?',
    answer: 'Pelo Art. 94, II da Lei 15.040/2024, o prazo prescricional é de 1 (um) ano contado da ciência da recepção da recusa expressa e motivada da seguradora.',
  },
  {
    category: 'prescricao',
    question: 'O prazo de prescrição entre seguradoras é diferente do prazo do segurado?',
    answer: 'Sim. Pelo Art. 94, I da Lei 15.040/2024, as pretensões entre seguradoras, resseguradoras e retrocessionárias prescrevem em prazo próprio, diferente do prazo de 1 ano aplicável ao segurado.',
  },
  {
    category: 'prescricao',
    question: 'A prescrição pode ser interrompida? Como?',
    answer: 'Sim. A prescrição se interrompe pelas causas gerais do Código Civil (notificação, protesto, reconhecimento da dívida), combinadas com as disposições específicas do Art. 94 da Lei 15.040/2024.',
  },

  // ── 4. RESCISÃO E CANCELAMENTO ───────────────────────────────────────────────
  {
    category: 'rescisao',
    question: 'A seguradora pode cancelar a apólice unilateralmente sem aviso prévio?',
    answer: 'Não. A Lei 15.040/2024 exige comunicação prévia ao segurado antes do cancelamento unilateral. O prazo e forma de aviso devem respeitar as condições contratuais e as normas da SUSEP.',
  },
  {
    category: 'rescisao',
    question: 'Se o segurado não pagar o prêmio, a seguradora pode cancelar imediatamente a cobertura?',
    answer: 'Não imediatamente. A lei exige procedimento específico de notificação antes da rescisão por inadimplência, garantindo ao segurado oportunidade de regularização, conforme os princípios de boa-fé da Lei 15.040/2024.',
  },
  {
    category: 'rescisao',
    question: 'O segurado tem direito à devolução do prêmio proporcional se cancelar a apólice antes do vencimento?',
    answer: 'Sim. O Art. 12 da Lei 15.040/2024 prevê que, com o desaparecimento do risco, o segurado tem direito à restituição do prêmio proporcional ao período não decorrido, descontadas as despesas de contratação.',
  },

  // ── 5. DIREITOS DO SEGURADO ──────────────────────────────────────────────────
  {
    category: 'direitos-segurado',
    question: 'O segurado tem direito de receber a apólice completa e as condições gerais do seguro?',
    answer: 'Sim. A Lei 15.040/2024 garante ao segurado o direito de receber todos os documentos contratuais, incluindo condições gerais, particulares e especiais, de forma clara e acessível.',
  },
  {
    category: 'direitos-segurado',
    question: 'Como a lei protege o segurado em caso de cláusulas ambíguas na apólice?',
    answer: 'Pelo Art. 57 da Lei 15.040/2024, qualquer dúvida ou obscuridade em peças publicitárias, impressos, instrumentos contratuais e pré-contratuais deve ser interpretada favoravelmente ao segurado, beneficiário ou terceiro prejudicado.',
  },
  {
    category: 'direitos-segurado',
    question: 'O segurado pode contestar a recusa do sinistro? Qual o caminho?',
    answer: 'Sim. O segurado pode contestar a recusa por escrito à seguradora, registrar reclamação na SUSEP ou acionar o Poder Judiciário dentro do prazo prescricional de 1 ano previsto no Art. 94, II da Lei 15.040/2024.',
  },

  // ── 6. OBRIGAÇÕES DA SEGURADORA ──────────────────────────────────────────────
  {
    category: 'obrigacoes-seguradora',
    question: 'A seguradora é obrigada a fornecer glossário de termos técnicos na apólice?',
    answer: 'Sim. A Lei 15.040/2024 exige que as apólices contenham glossário explicando os termos técnicos de forma simples e acessível, garantindo transparência ao segurado.',
  },
  {
    category: 'obrigacoes-seguradora',
    question: 'A seguradora deve motivar por escrito a recusa do sinistro?',
    answer: 'Sim. A recusa deve ser expressa e motivada, conforme Art. 94, II da Lei 15.040/2024, que usa exatamente os termos "recusa expressa e motivada" como marco do início da prescrição.',
  },
  {
    category: 'obrigacoes-seguradora',
    question: 'A seguradora tem obrigação de boa-fé no processo de análise de sinistro?',
    answer: 'Sim. O dever de boa-fé é princípio central da Lei 15.040/2024. A seguradora deve agir de forma transparente, cooperativa e sem protelação, sob pena de responsabilidade civil.',
  },

  // ── 7. MÁ-FÉ E FRAUDE ────────────────────────────────────────────────────────
  {
    category: 'ma-fe-fraude',
    question: 'O que acontece se o segurado prestar declarações falsas ao contratar o seguro?',
    answer: 'A má-fé do segurado nas declarações pré-contratuais pode levar à nulidade do contrato e à perda do direito à indenização, conforme os princípios da Lei 15.040/2024 sobre dever de informação e boa-fé.',
  },
  {
    category: 'ma-fe-fraude',
    question: 'Se o segurado agravar o risco intencionalmente, a seguradora fica desobrigada a pagar?',
    answer: 'Sim. A agravação intencional do risco pelo segurado rompe o dever de boa-fé e pode desobrigar a seguradora do pagamento da indenização, conforme os princípios da Lei 15.040/2024.',
  },
  {
    category: 'ma-fe-fraude',
    question: 'A seguradora pode investigar suspeita de fraude no sinistro? Por quanto tempo?',
    answer: 'Sim, mas a investigação não pode ser usada como pretexto para protelação do pagamento. A Lei 15.040/2024 permite a suspensão do prazo de análise apenas 1 vez e dentro dos limites do Art. 87, § 5º.',
  },

  // ── 8. SEGURO DE VEÍCULOS AUTOMOTORES ───────────────────────────────────────
  {
    category: 'seguro-veiculos',
    question: 'O prazo de análise de sinistro de veículo pode ser suspenso mais de uma vez?',
    answer: 'Não. Pelo Art. 87, § 5º da Lei 15.040/2024, a suspensão do prazo de análise só pode ocorrer 1 (uma) vez nos sinistros relacionados a seguros de veículos automotores.',
  },
  {
    category: 'seguro-veiculos',
    question: 'Existe regra especial para sinistros de seguros de veículo com valor baixo?',
    answer: 'Sim. O Art. 87, § 5º da Lei 15.040/2024 aplica as regras de suspensão única do prazo também a todos os seguros em que a importância segurada não exceda 500 (quinhentas) vezes o salário mínimo vigente.',
  },

  // ── 9. CORRETOR DE SEGUROS ───────────────────────────────────────────────────
  {
    category: 'corretor',
    question: 'Em quantos dias o corretor deve entregar os documentos do seguro ao segurado?',
    answer: 'Pelo Art. 39 da Lei 15.040/2024, o corretor tem o prazo de 5 (cinco) dias úteis para efetuar a entrega dos documentos ao segurado após a emissão da apólice.',
  },
  {
    category: 'corretor',
    question: 'O corretor pode ser responsabilizado por não entregar a apólice no prazo?',
    answer: 'Sim. O descumprimento da obrigação do Art. 39 da Lei 15.040/2024 sujeita o corretor à responsabilidade civil pelos danos causados ao segurado pela falta ou atraso na entrega da documentação.',
  },
  {
    category: 'corretor',
    question: 'A lei define alguma responsabilidade do corretor na orientação do segurado sobre coberturas?',
    answer: 'Sim. O corretor tem dever de informação e orientação ao segurado sobre as coberturas contratadas, exclusões e condições relevantes, conforme o regime de responsabilidade estabelecido pela Lei 15.040/2024.',
  },

  // ── 10. TRANSPORTE E INÍCIO DE VIGÊNCIA ─────────────────────────────────────
  {
    category: 'vigencia-cobertura',
    question: 'Quando começa e quando termina a cobertura num seguro de transporte de mercadorias?',
    answer: 'Pelo Art. 9º, § 4º da Lei 15.040/2024, a garantia começa quando as mercadorias são efetivamente recebidas pelo transportador e cessa com a entrega real ao destinatário.',
  },
  {
    category: 'vigencia-cobertura',
    question: 'Se a mercadoria for entregue com dano, o seguro cobre mesmo após a entrega?',
    answer: 'Não. Pelo Art. 9º, § 4º da Lei 15.040/2024, a cobertura cessa com a entrega real ao destinatário. Danos identificados após a entrega não estão cobertos pelo seguro de transporte.',
  },
];

// ─── system prompt (matches inference) ────────────────────────────────────────

const IRIS_SYSTEM_PROMPT = `Você é ÍRIS — Inteligência em Regulação e Informação Securitária.

Sua única função é responder dúvidas sobre a Lei nº 15.040/2024 (Marco Legal do Seguro Brasileiro) e suas implicações práticas.

Regras:
1. Responda SOMENTE com base no contexto fornecido dos documentos.
2. Cite sempre o artigo ou fonte específica quando disponível.
3. Se o contexto não contiver informação suficiente, responda: "Não encontrei base legal para isso nos documentos disponíveis." Não invente informações normativas.
4. Seja precisa, objetiva e acessível — corretores e segurados são seu público.
5. Prefira citar a lei (L15040) sobre interpretações de terceiros.`;

// ─── RAG helpers ──────────────────────────────────────────────────────────────

async function embed(text: string): Promise<number[]> {
  const res = await fetch(`${OLLAMA_BASE}/api/embeddings`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ model: EMBED_MODEL, prompt: text }),
  });
  if (!res.ok) throw new Error(`Ollama embed failed: ${res.status}`);
  const { embedding } = await res.json() as { embedding: number[] };
  return embedding;
}

function cosine(a: number[], b: number[]): number {
  let dot = 0, na = 0, nb = 0;
  for (let i = 0; i < a.length; i++) { dot += a[i] * b[i]; na += a[i] ** 2; nb += b[i] ** 2; }
  return dot / (Math.sqrt(na) * Math.sqrt(nb) + 1e-10);
}

function searchCorpus(queryEmb: number[], corpus: Chunk[], k: number): Chunk[] {
  return corpus
    .map(c => ({ chunk: c, score: cosine(queryEmb, c.embedding) }))
    .sort((a, b) => b.score - a.score)
    .slice(0, k)
    .map(r => r.chunk);
}

function buildContextBlock(chunks: Chunk[]): string {
  return 'Contexto recuperado (por relevância):\n\n' +
    chunks.map((c, i) =>
      `[${i + 1}] Fonte: ${c.metadata.source} (p.${c.metadata.page}, ${c.metadata.authority})\n${c.text}`
    ).join('\n\n---\n\n');
}

// ─── Claude API: generate question paraphrases ────────────────────────────────

async function generateVariants(
  client: Anthropic,
  category: string,
  question: string,
  n: number
): Promise<string[]> {
  const msg = await client.messages.create({
    model: 'claude-haiku-4-5-20251001',
    max_tokens: 800,
    messages: [{
      role: 'user',
      content: `Você é um especialista em seguros brasileiro.

Gere ${n} variações semânticas da pergunta abaixo. As variações devem:
- Ter formulação diferente (palavras, ordem, estilo — formal/informal/técnico)
- Manter o mesmo sentido e categoria temática: "${category}"
- Representar como diferentes tipos de usuários fariam a pergunta (corretor, segurado, advogado, leigo)
- Estar em português do Brasil

Pergunta original: "${question}"

Responda APENAS com as ${n} variações, uma por linha, sem numeração, sem explicações.`,
    }],
  });

  const text = msg.content[0].type === 'text' ? msg.content[0].text : '';
  return text
    .split('\n')
    .map(l => l.trim())
    .filter(l => l.length > 10)
    .slice(0, n);
}

// ─── build training example ───────────────────────────────────────────────────

function buildExample(question: string, answer: string, chunks: Chunk[]): object {
  const contextBlock = buildContextBlock(chunks);
  return {
    messages: [
      { role: 'system', content: `${IRIS_SYSTEM_PROMPT}\n\n${contextBlock}` },
      { role: 'user', content: question },
      { role: 'assistant', content: answer },
    ],
  };
}

// ─── main ─────────────────────────────────────────────────────────────────────

async function main() {
  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey) throw new Error('ANTHROPIC_API_KEY not set');

  const client = new Anthropic({ apiKey });

  console.log(`Loading corpus from ${CORPUS_PATH}…`);
  const raw = JSON.parse(readFileSync(CORPUS_PATH, 'utf-8'));
  const corpus: Chunk[] = Array.isArray(raw) ? raw : (raw.chunks ?? []);
  console.log(`  ${corpus.length} chunks loaded`);

  const examples: object[] = [];
  let total = 0;

  for (const seed of SEEDS) {
    process.stdout.write(`\n[${seed.category}] "${seed.question.slice(0, 60)}…"\n`);

    // 1. Embed seed question → retrieve context
    const qEmb = await embed(seed.question);
    const chunks = searchCorpus(qEmb, corpus, TOP_K);
    process.stdout.write(`  ↳ ${chunks.length} chunks retrieved (top: ${chunks[0]?.metadata.source})\n`);

    // 2. Add seed itself as training example
    examples.push(buildExample(seed.question, seed.answer, chunks));
    total++;

    // 3. Generate paraphrase variants
    process.stdout.write(`  ↳ Generating ${VARIANTS} variants…`);
    const variants = await generateVariants(client, seed.category, seed.question, VARIANTS);
    process.stdout.write(` ${variants.length} generated\n`);

    for (const variant of variants) {
      // Re-embed variant for potentially different chunk retrieval
      const vEmb = await embed(variant);
      const vChunks = searchCorpus(vEmb, corpus, TOP_K);
      examples.push(buildExample(variant, seed.answer, vChunks));
      total++;
    }
  }

  // Write output
  const outPath = join(import.meta.dir, '..', OUT);
  const jsonl = examples.map(e => JSON.stringify(e)).join('\n');
  writeFileSync(outPath, jsonl, 'utf-8');

  console.log(`\n✅ ${total} training examples → ${OUT}`);
  console.log(`   Seeds: ${SEEDS.length} | Variants per seed: ${VARIANTS} | TOP_K chunks: ${TOP_K}`);
  console.log(`\nNext: bun scripts/split-dataset.ts to merge + deduplicate + split 80/20`);
}

main().catch(err => { console.error(err); process.exit(1); });

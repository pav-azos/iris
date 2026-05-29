#!/usr/bin/env bun
/**
 * ÍRIS — Pipeline Completo de Dataset
 *
 * Executa em sequência:
 *   1. scrape-sources      (busca as 12 fontes)
 *   2. extract-web-qa      (gera Q&A via LLM das fontes)
 *   3. scrape-stj-datasets (jurisprudência STJ)
 *   4. generate-dataset    (compila train.jsonl)
 *   5. augment-dataset     (expande 4× via Claude)
 *
 * Uso: ANTHROPIC_API_KEY=... bun scripts/build-full-dataset.ts
 * Flags: --skip-scrape  (pula etapas 1–3, usa data/raw existente)
 *        --skip-augment (pula etapa 5)
 *        --dry-run      (passa --dry-run para todos os sub-scripts)
 */
import { spawnSync } from 'child_process';
import { join } from 'path';

const ROOT = join(import.meta.dir, '..');
const SKIP_SCRAPE = process.argv.includes('--skip-scrape');
const SKIP_AUGMENT = process.argv.includes('--skip-augment');
const DRY_RUN = process.argv.includes('--dry-run');

function run(label: string, script: string, extraArgs: string[] = []) {
  const scriptPath = join(ROOT, 'scripts', script);
  const args = [scriptPath, ...(DRY_RUN ? ['--dry-run'] : []), ...extraArgs];
  console.log(`\n▶ [${label}]`);

  const result = spawnSync('bun', args, {
    stdio: 'inherit',
    env: { ...process.env },
    cwd: ROOT,
  });

  if (result.status !== 0) {
    console.error(`✗ Falhou: ${label}`);
    process.exit(result.status ?? 1);
  }
}

function main() {
  const start = Date.now();
  console.log('╔══════════════════════════════════════════════════╗');
  console.log('║  ÍRIS — Build Completo do Dataset                ║');
  console.log('╚══════════════════════════════════════════════════╝');

  if (!SKIP_SCRAPE) {
    run('1/5 Scrape fontes', 'scrape-sources.ts');
    run('2/5 Extrair Q&A', 'extract-web-qa.ts');
    run('3/5 STJ Datasets', 'scrape-stj-datasets.ts');
  } else {
    console.log('\n⏩ Pulando scraping (--skip-scrape)');
  }

  run('4/5 Generate Dataset', 'generate-dataset.ts');

  if (!SKIP_AUGMENT) {
    run('5/5 Augment Dataset', 'augment-dataset.ts');
  } else {
    console.log('\n⏩ Pulando augmentação (--skip-augment)');
  }

  const elapsed = ((Date.now() - start) / 1000).toFixed(1);
  console.log('\n╔══════════════════════════════════════════════════╗');
  console.log(`║  Pipeline concluído em ${elapsed}s`);
  console.log('╚══════════════════════════════════════════════════╝');
  console.log('→ Para fine-tuning: bash scripts/finetune.sh');
}

main();

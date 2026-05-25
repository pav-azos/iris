#!/usr/bin/env bun
/**
 * ÍRIS — Merge e split do dataset
 *
 * Junta train.jsonl + pdf-qa.jsonl, deduplica, shuffla, split 80/20.
 *
 * Uso: bun run split-dataset
 */

import { readFileSync, writeFileSync, existsSync } from "fs";
import { join } from "path";

const DATA_DIR = join(import.meta.dir, "..", "docs", "data");

const SOURCES = [
  join(DATA_DIR, "train-augmented.jsonl"),
  join(DATA_DIR, "pdf-qa.jsonl"),
];
const OUT_TRAIN = join(DATA_DIR, "train.jsonl");
const OUT_VALID = join(DATA_DIR, "valid.jsonl");

function shuffle<T>(arr: T[], seed = 42): T[] {
  const copy = [...arr];
  let s = seed;
  const rand = () => { s = (s * 1664525 + 1013904223) & 0xffffffff; return (s >>> 0) / 0xffffffff; };
  for (let i = copy.length - 1; i > 0; i--) { const j = Math.floor(rand() * (i + 1)); [copy[i], copy[j]] = [copy[j], copy[i]]; }
  return copy;
}

const seen = new Set<string>();
const all: string[] = [];

for (const src of SOURCES) {
  if (!existsSync(src)) { console.log(`⚠ Não encontrado: ${src}`); continue; }
  const lines = readFileSync(src, "utf-8").split("\n").filter(Boolean);
  let added = 0;
  for (const line of lines) {
    try {
      const ex = JSON.parse(line);
      const userMsg = ex.messages?.find((m: { role: string }) => m.role === "user");
      const key = userMsg?.content?.toLowerCase().slice(0, 60) ?? line.slice(0, 60);
      if (seen.has(key)) continue;
      seen.add(key);
      all.push(line);
      added++;
    } catch { /* skip */ }
  }
  console.log(`✓ ${src.split("/").pop()}: +${added} únicos`);
}

const shuffled = shuffle(all);
const splitIdx = Math.floor(shuffled.length * 0.8);
writeFileSync(OUT_TRAIN, shuffled.slice(0, splitIdx).join("\n"));
writeFileSync(OUT_VALID, shuffled.slice(splitIdx).join("\n"));

console.log(`\nTotal: ${shuffled.length} | Train: ${splitIdx} | Valid: ${shuffled.length - splitIdx}`);
console.log(`→ ${OUT_TRAIN}`);
console.log(`→ ${OUT_VALID}`);

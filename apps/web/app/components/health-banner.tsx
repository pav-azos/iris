'use client';
import { useEffect, useState } from 'react';

interface Health { ollama: string; corpus: string; embedder: string; chunks: number }

export function HealthBanner() {
  const [s, setS] = useState<Health | null>(null);

  useEffect(() => {
    fetch('/api/health').then(r => r.json()).then(setS).catch(() =>
      setS({ ollama: 'offline', corpus: 'missing', embedder: 'failed', chunks: 0 })
    );
  }, []);

  if (!s) return null;

  const issues: string[] = [];
  if (s.ollama   !== 'ok')       issues.push('Ollama offline — execute `ollama serve`');
  if (s.corpus   === 'missing')  issues.push('Corpus ausente — execute `bun run index-docs`');
  if (s.corpus   === 'mismatch') issues.push('Corpus desatualizado — execute `bun run index-docs`');
  if (s.embedder !== 'ok')       issues.push('Embedding offline — execute `ollama pull bge-m3`');

  if (!issues.length) return null;

  return (
    <div className="w-full bg-yellow-50 border-b border-yellow-200 px-4 py-2 text-sm text-yellow-800">
      {issues.map((m, i) => <div key={i} className="font-mono">⚠ {m}</div>)}
    </div>
  );
}

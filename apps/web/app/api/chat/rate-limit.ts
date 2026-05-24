import type { NextRequest } from 'next/server';

interface Entry { count: number; resetAt: number }
const store = new Map<string, Entry>();
const MAX = 20, WINDOW = 60_000;

export function getClientKey(req: NextRequest): string {
  return req.headers.get('x-forwarded-for')?.split(',')[0]?.trim()
    ?? req.headers.get('x-real-ip')
    ?? 'anonymous';
}

export function checkRateLimit(key: string): boolean {
  const now = Date.now();
  const entry = store.get(key);
  if (!entry || entry.resetAt < now) { store.set(key, { count: 1, resetAt: now + WINDOW }); return true; }
  if (entry.count >= MAX) return false;
  entry.count++;
  return true;
}

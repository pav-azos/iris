import type { SearchResult } from './types';

const MAX_HISTORY_TURNS = 6;

export const IRIS_SYSTEM_PROMPT = `Você é ÍRIS — Inteligência em Regulação e Informação Securitária.

Sua única função é responder dúvidas sobre a Lei nº 15.040/2024 (Marco Legal do Seguro Brasileiro) e suas implicações práticas.

Regras:
1. Responda SOMENTE com base no contexto fornecido dos documentos.
2. Cite sempre o artigo ou fonte específica quando disponível.
3. Se o contexto não contiver informação suficiente, responda: "Não encontrei base legal para isso nos documentos disponíveis." Não invente informações normativas.
4. Seja precisa, objetiva e acessível — corretores e segurados são seu público.
5. Prefira citar a lei (L15040) sobre interpretações de terceiros.`;

export interface PromptInput {
  message: string;
  history: Array<{ role: 'user' | 'assistant'; content: string }>;
  searchResults: SearchResult[];
}

export interface BuiltPrompt {
  messages: Array<{ role: 'system' | 'user' | 'assistant'; content: string }>;
}

export function buildPrompt(input: PromptInput): BuiltPrompt {
  const { message, history, searchResults } = input;

  const contextBlock =
    searchResults.length === 0
      ? 'Contexto: nenhum documento relevante encontrado.\nResponda: "Não encontrei base legal para isso nos documentos disponíveis."'
      : 'Contexto recuperado (por relevância):\n\n' +
        searchResults
          .map(
            (r, i) =>
              `[${i + 1}] Fonte: ${r.chunk.metadata.source} (p.${r.chunk.metadata.page}, ${r.chunk.metadata.authority}, score=${r.score.toFixed(2)})\n${r.chunk.text}`
          )
          .join('\n\n---\n\n');

  const cappedHistory = history.slice(-(MAX_HISTORY_TURNS * 2));

  return {
    messages: [
      { role: 'system', content: `${IRIS_SYSTEM_PROMPT}\n\n${contextBlock}` },
      ...cappedHistory,
      { role: 'user', content: message },
    ],
  };
}

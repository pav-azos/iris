# Frontend — Features Disabled for ÍRIS v1

## Approach
Features not in scope are **disabled with tooltip** rather than deleted:
"Celso (I2A2): o I2A2 ainda vai ensinar a gente a fazer isso direito 😄"

Component: `packages/common/components/disabled-feature.tsx`

## Disabled Features
| Feature | Status | Reason |
|---------|--------|--------|
| Image upload | Disabled | Vision not in RAG scope |
| Web search | Disabled | Only corpus retrieval in v1 |
| Credits badge | Stubbed (null) | No billing in local demo |
| MCP tools | Disabled | External integrations out of scope |
| Auth (Clerk) | Removed | Open access, academic demo |
| Sentry | Removed | No error tracking needed locally |

## What Still Works
- `/chat` — main RAG chat interface
- `/api/chat` — SSE streaming with RAG + Ollama
- `/api/health` — infrastructure status probe
- Text chat with history
- Source attribution panel

## Re-enabling
To re-enable a disabled feature: remove the `<DisabledFeature>` wrapper around it in the relevant component.

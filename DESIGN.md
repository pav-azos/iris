# Iris Design System

**Inteligência em Regulação e Informação Securitária**

## Brand Identity

Extracted from the official Iris logo (`iris.jpeg`).

### Logo Palette

| Token | Hex | HSL | Usage |
|-------|-----|-----|-------|
| Navy (background) | `#060B24` | `228 72% 8%` | Dark mode bg, foreground text |
| Violet (left petal) | `#7B4FCC` | `263 55% 55%` | Primary brand / CTA |
| Electric Blue (center petal) | `#4B6FE0` | `225 68% 59%` | Accent / links |
| Green-Teal (right leaf) | `#22C55E` | `142 71% 45%` | Success states |
| Wave Lavender | `#C084FC` | `270 90% 75%` | Gradient highlights |
| Wave Blue | `#3B82F6` | `217 91% 60%` | Info states |
| Wave Cyan | `#22D3EE` | `190 95% 54%` | Secondary highlights |

---

## Color Tokens

CSS custom properties via `hsl()`. Applied in `globals.css` and `packages/ui/src/styles.css`.

### Light Mode (`:root`)

| Token | Value | Notes |
|-------|-------|-------|
| `--background` | `220 50% 98%` | Near-white with blue tint |
| `--foreground` | `228 72% 8%` | Deep navy text |
| `--secondary` | `220 40% 95%` | — |
| `--tertiary` | `220 35% 91%` | — |
| `--quaternary` | `220 30% 87%` | — |
| `--card` | `220 50% 99%` | Slightly lifted surface |
| `--popover` | `220 50% 99.5%` | — |
| `--brand` | `263 70% 55%` | Iris violet |
| `--brand-foreground` | `263 70% 97%` | White-ish on violet |
| `--accent` | `217 85% 55%` | Electric blue |
| `--accent-foreground` | `217 85% 97%` | — |
| `--muted` | `220 30% 90%` | — |
| `--muted-foreground` | `228 25% 35%` | — |
| `--border` | `220 25% 84%` | — |
| `--ring` | `263 70% 55%` | Focus ring = brand |

### Dark Mode (`.dark`)

| Token | Value | Notes |
|-------|-------|-------|
| `--background` | `228 72% 8%` | Logo navy |
| `--foreground` | `220 50% 97%` | — |
| `--secondary` | `228 60% 11%` | — |
| `--tertiary` | `228 55% 9%` | — |
| `--quaternary` | `228 50% 6%` | — |
| `--card` | `228 60% 11%` | — |
| `--popover` | `228 65% 7%` | — |
| `--brand` | `263 80% 68%` | Lighter violet for contrast |
| `--brand-foreground` | `263 70% 97%` | — |
| `--accent` | `217 91% 65%` | Lighter blue for contrast |
| `--accent-foreground` | `217 85% 97%` | — |
| `--muted` | `228 45% 16%` | — |
| `--muted-foreground` | `220 25% 65%` | — |
| `--border` | `228 40% 18%` | — |
| `--ring` | `263 80% 68%` | — |

---

## Typography

Font unchanged from project defaults (`font-sans`). Do not modify font stack.

---

## Semantic Colors

| State | Token | Light | Dark |
|-------|-------|-------|------|
| Success | green | `142 71% 45%` | `142 71% 55%` |
| Destructive | `--destructive` | `0 84% 60%` | `0 84% 60%` |
| Info | blue wave | `217 91% 60%` | `217 91% 65%` |
| Brand highlight | `--brand` | violet | lighter violet |

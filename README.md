<div align="center">

  <img src="public/images/iris-icon.jpg" alt="ÍRIS logo" width="140" height="auto" />

  <h1>ÍRIS</h1>

  <p>
    Inteligência em Regulação e Informação Securitária.<br/>
    Assistente de IA especializado na Lei 15.040/2024 com fine-tuning local no Apple Silicon.
  </p>

<p>
  <a href="https://github.com/pav-azos/iris/graphs/contributors">
    <img src="https://img.shields.io/github/contributors/pav-azos/iris" alt="contributors" />
  </a>
  <a href="https://github.com/pav-azos/iris/commits/main">
    <img src="https://img.shields.io/github/last-commit/pav-azos/iris" alt="last commit" />
  </a>
  <a href="https://github.com/pav-azos/iris/network/members">
    <img src="https://img.shields.io/github/forks/pav-azos/iris" alt="forks" />
  </a>
  <a href="https://github.com/pav-azos/iris/stargazers">
    <img src="https://img.shields.io/github/stars/pav-azos/iris" alt="stars" />
  </a>
  <a href="https://github.com/pav-azos/iris/issues/">
    <img src="https://img.shields.io/github/issues/pav-azos/iris" alt="open issues" />
  </a>
  <a href="https://github.com/pav-azos/iris/blob/main/LICENSE">
    <img src="https://img.shields.io/github/license/pav-azos/iris.svg" alt="license" />
  </a>
  <a href="https://github.com/trendy-design/llmchat">
    <img src="https://img.shields.io/badge/forked%20from-llmchat.co-7B4FCC?style=flat" alt="forked from llmchat" />
  </a>
</p>

<h4>
  <a href="https://ollama.com/karudesune/iris-mistral-7b-instruct">Modelo no Ollama</a>
  <span> · </span>
  <a href="https://github.com/pav-azos/iris/issues/">Reportar Bug</a>
  <span> · </span>
  <a href="https://github.com/pav-azos/iris/issues/">Sugerir Feature</a>
</h4>

</div>

<br/>

---

## Índice

- [Sobre o Projeto](#sobre-o-projeto)
  - [Tech Stack](#tech-stack)
  - [Features](#features)
  - [Cores](#cores)
  - [Variáveis de Ambiente](#variáveis-de-ambiente)
- [Começando](#começando)
  - [Pré-requisitos](#pré-requisitos)
  - [Instalação](#instalação)
  - [Executar localmente](#executar-localmente)
- [Uso](#uso)
- [Pipeline de Dataset](#pipeline-de-dataset)
- [Experimento de Fine-Tuning](#experimento-de-fine-tuning)
- [Benchmark e Resultados](#benchmark-e-resultados)
- [Aprendizados](#aprendizados)
- [Roadmap](#roadmap)
- [Licença](#licença)
- [Contato](#contato)
- [Agradecimentos](#agradecimentos)

---

## Sobre o Projeto

<div align="center">
  <img src="public/images/inicio.jpg" alt="Tela inicial" width="48%" />
  &nbsp;
  <img src="public/images/uso.jpg" alt="Uso do assistente" width="48%" />
</div>

<br/>

ÍRIS é um fork do [LLMChat.co](https://llmchat.co) adaptado para o domínio de seguros no Brasil, utilizando o template de chat do [shadcn/ui](https://ui.shadcn.com) como base de interface. O objetivo foi avaliar se fine-tuning local de um modelo 7B (Mistral) melhora respostas sobre a Lei 15.040/2024 em comparação ao modelo base com RAG.

**Fluxo completo do experimento:**

```
PDFs + Sites regulatórios
        ↓
  Scraping + Extração Q&A (Claude Haiku)
        ↓
  Dataset JSONL (~200 pares → augmentado 4× → ~800+)
        ↓
  LoRA fine-tuning (mlx-lm, Apple Silicon M4 Pro)
        ↓
  Conversão GGUF → Ollama (iris-mistral)
        ↓
  Benchmark 2×2 (base vs fine-tuned × sem RAG vs com RAG)
```

### Tech Stack

<details>
  <summary>Frontend</summary>
  <ul>
    <li><a href="https://nextjs.org/">Next.js 14</a></li>
    <li><a href="https://www.typescriptlang.org/">TypeScript</a></li>
    <li><a href="https://tailwindcss.com/">Tailwind CSS</a></li>
    <li><a href="https://ui.shadcn.com/">Shadcn UI</a></li>
    <li><a href="https://www.framer.com/motion/">Framer Motion</a></li>
    <li><a href="https://zustand-demo.pmnd.rs/">Zustand</a></li>
    <li><a href="https://dexie.org/">Dexie.js (IndexedDB)</a></li>
  </ul>
</details>

<details>
  <summary>Backend / AI</summary>
  <ul>
    <li><a href="https://sdk.vercel.ai/">Vercel AI SDK</a></li>
    <li><a href="https://ollama.com/">Ollama</a> — modelo local iris-mistral</li>
    <li><a href="https://www.anthropic.com/">Anthropic Claude</a> — geração de dataset</li>
    <li><a href="https://openai.com/">OpenAI</a> / <a href="https://ai.google.dev/">Google</a> / <a href="https://together.ai/">Together</a> / <a href="https://fireworks.ai/">Fireworks</a></li>
    <li><a href="https://www.prisma.io/">Prisma</a></li>
    <li><a href="https://langfuse.com/">Langfuse</a> — observabilidade</li>
  </ul>
</details>

<details>
  <summary>Fine-tuning</summary>
  <ul>
    <li><a href="https://github.com/ml-explore/mlx-lm">mlx-lm</a> — LoRA no Apple Silicon</li>
    <li><a href="https://github.com/ggml-org/llama.cpp">llama.cpp</a> — conversão GGUF</li>
    <li>Python 3.11</li>
    <li>Modelo base: <code>mistralai/Mistral-7B-Instruct-v0.3</code></li>
  </ul>
</details>

<details>
  <summary>Infraestrutura</summary>
  <ul>
    <li><a href="https://bun.sh/">Bun 1.3</a></li>
    <li><a href="https://turbo.build/">Turborepo</a></li>
    <li><a href="https://www.docker.com/">Docker</a></li>
    <li><a href="https://www.postgresql.org/">PostgreSQL 16</a></li>
  </ul>
</details>

### Features

- **Assistente especializado** na Lei 15.040/2024 com citação de artigos
- **RAG** com embeddings `bge-m3` sobre corpus de documentos regulatórios
- **Fine-tuning local** — modelo treinado e servido inteiramente no Apple Silicon
- **Ferramenta DataJud** — busca de processos de seguro no CNJ em tempo real
- **Múltiplos providers** — Ollama local, Anthropic, OpenAI, Google, Together, Fireworks
- **Privacidade** — histórico armazenado localmente via IndexedDB
- **Pipeline de dataset** — scraping + extração Q&A + augmentação 4× automatizados
- **Benchmark automatizado** — comparação 2×2 com gráfico SVG gerado

### Cores

| Token | Hex | Uso |
|-------|-----|-----|
| Navy | `#060B24` | Background dark mode |
| Violet (brand) | `#7B4FCC` | CTA, botões primários |
| Electric Blue | `#4B6FE0` | Accent, links |
| Green-Teal | `#22C55E` | Success states |
| Wave Lavender | `#C084FC` | Gradient highlights |
| Wave Blue | `#3B82F6` | Info states |
| Wave Cyan | `#22D3EE` | Secondary highlights |

### Variáveis de Ambiente

```env
# Banco de dados
DATABASE_URL=postgresql://iris:iris@localhost:5432/iris

# Ollama
OLLAMA_BASE_URL=http://localhost:11434
OLLAMA_MODEL=iris-mistral
OLLAMA_EMBED_MODEL=bge-m3

# Corpus RAG
CORPUS_PATH=apps/web/data/corpus.json

# APIs (pipeline de dataset)
ANTHROPIC_API_KEY=sk-ant-...
JINA_API_KEY=...
```

---

## Começando

### Pré-requisitos

- [Bun](https://bun.sh) 1.3+
- [Ollama](https://ollama.com)
- PostgreSQL 16+ (ou Docker)

### Instalação

```bash
git clone https://github.com/pav-azos/iris.git
cd iris
bun install
```

### Executar localmente

**1. Banco de dados**

```bash
docker compose up db -d
bun --cwd packages/prisma prisma migrate dev
```

**2. Modelos Ollama**

```bash
# Modelo fine-tuned ÍRIS
ollama pull karudesune/iris-mistral-7b-instruct
ollama cp karudesune/iris-mistral-7b-instruct iris-mistral

# Embeddings RAG
ollama pull bge-m3
```

**3. Variáveis de ambiente**

```bash
cp apps/web/.env.example apps/web/.env.local
# editar apps/web/.env.local com as chaves
```

**4. Indexar documentos**

```bash
bun run index-docs
```

**5. Iniciar**

```bash
bun dev   # http://localhost:3000
```

**Docker (app completo)**

```bash
docker compose up
```

---

## Uso

> **Teste rápido:** _"Qual o prazo máximo para a seguradora pagar a indenização após receber toda a documentação do sinistro, conforme a Lei 15.040/2024?"_

```bash
# Terminal — sem precisar rodar a aplicação
ollama run iris-mistral "Qual o prazo máximo para a seguradora pagar a indenização após receber toda a documentação do sinistro, conforme a Lei 15.040/2024?"
```

Resposta esperada: **30 dias** contados do recebimento da documentação completa (Art. 87, § 1º da Lei 15.040/2024).

---

## Pipeline de Dataset

### Etapa 1 — Scraping de fontes regulatórias

`scripts/scrape-sources.ts` — busca 13 fontes e salva em `data/raw/{slug}.md`.

| Slug | Fonte | Uso |
|------|-------|-----|
| `lei-15040` | [Lei nº 15.040/2024 — Planalto](https://www.planalto.gov.br/ccivil_03/_ato2023-2026/2024/lei/L15040.htm) | FT + RAG |
| `susep-faq-nova-lei` | [SUSEP — Esclarecimentos nova lei](https://www.gov.br/susep/pt-br/central-de-conteudos/noticias/2025/julho/susep-esclarece-pontos-sobre-a-nova-lei-do-contrato-de-seguros-e-a-sua-aplicacao) | FT + RAG |
| `fazenda-lei-publicada` | [Fazenda — Lei publicada](https://www.gov.br/fazenda/pt-br/composicao/orgaos/orgaos-colegiados/crsnsp/acesso-a-informacao/noticias/2024/lei-do-contrato-de-seguro-e-publicada) | FT + RAG |
| `susep-open-insurance` | [SUSEP — Open Insurance](https://www.gov.br/susep/pt-br/assuntos/open-insurance/documentos_de_referencia) | RAG |
| `susep-paineis` | [SUSEP — Central de Painéis](https://www.gov.br/susep/pt-br/central-de-conteudos/central-de-paineis) | RAG |
| `susep-ranking-reclamacoes` | [SUSEP — Ranking Reclamações 2024](https://www.gov.br/susep/pt-br/central-de-conteudos/noticias/2024/maio/susep-lanca-ranking-de-reclamacoes-das-empresas-do-setor-de-seguros) | FT + RAG |
| `susep-susepcon` | [SUSEP — SusepCon](https://www.gov.br/sdos/noticias/2024/maio/saiba-como-foi-o-lancamento-do-susepcon-painel-erankingde-reclamacoes-do-setor-de-seguros) | FT + RAG |
| `stj-dados-abertos` | [STJ — Catálogo CKAN](https://dadosabertos.web.stj.jus.br/dataset/) | RAG |
| `stj-pesquisa-pronta` | [STJ — Pesquisa Pronta](https://scon.stj.jus.br/SCON/pesquisa_pronta/listaPP.jsp) | FT + RAG |
| `datajud-api` | [CNJ DataJud — API Pública](https://datajud-wiki.cnj.jus.br/api-publica/) | RAG |
| `datajud-acesso` | CNJ DataJud — Guia de acesso | RAG |
| `datajud-exemplos` | CNJ DataJud — Exemplos de consulta | RAG |
| PDFs curados | Lei 15.040, FAQ ENS, PwC, Fenacor, MAG, SUSEP 2026 (`docs/`) | FT + RAG |

**Precedentes STJ curados** (fallback quando catálogo CKAN indisponível):

| Processo | Tema |
|----------|------|
| REsp 1.601.555 | Suicídio — carência 2 anos |
| Súmula 616/STJ | Agravamento do risco |
| Súmula 620/STJ | Embriaguez e seguro de vida |
| REsp 1.660.164 | Perda total — FIPE na data do sinistro |
| Súmula 229/STJ | Suspensão de prescrição |
| REsp 1.964.543 | Seguro saúde — dano moral por negativa |
| REsp 2.028.544 | Cláusula de exclusão — interpretação restritiva |
| Súmula 609/STJ | Recusa ilícita de cobertura = dano moral |

---

### Etapa 2 — Extração de Q&A via LLM

`scripts/extract-web-qa.ts` — divide cada fonte em chunks (~3000 chars) e chama **Claude Haiku 4.5** com **prompt caching**:

```
System (cacheado):
  "Você é especialista em direito de seguros...
   Foco em: obrigações, prazos, definições, direitos, procedimentos, penalidades
   Output: JSON array [{"q": "...", "a": "..."}, ...]"

User: "Fonte: {nome} | Texto: {chunk} | Gere {n} pares..."
```

### Etapa 3 — Compilação do dataset

`scripts/generate-dataset.ts` — gera JSONL no **formato MLX chat**:

```jsonl
{"messages": [
  {"role": "system",    "content": "Você é ÍRIS — Inteligência em Regulação..."},
  {"role": "user",      "content": "Qual o prazo para a seguradora pagar?"},
  {"role": "assistant", "content": "Pelo Art. 87, § 1º da Lei 15.040/2024, 30 dias..."}
]}
```

Split: 90% → `train.jsonl` / 10% → `valid.jsonl`.

### Etapa 4 — Augmentação 4×

`scripts/augment-dataset.ts` — 4 tipos de variações via Claude Haiku + prompt caching:

1. **Refraseamento** (4× por par) — vocabulário/registro variados
2. **Cenários práticos** — "Meu sinistro foi negado, o que a lei diz?"
3. **Exemplos negativos** — fora do escopo → ÍRIS recusa com elegância
4. **Multi-turn** — pergunta + follow-up natural

### Comandos

```bash
ANTHROPIC_API_KEY=sk-ant-... bun run build-full-dataset

# Passo a passo
bun run scrape-sources
bun run extract-web-qa
bun run scrape-stj
bun run generate-dataset
bun run augment-dataset

# Flags
bun run build-full-dataset:dry
bun run build-full-dataset:skip-scrape
bun run build-full-dataset:no-augment
```

---

## Experimento de Fine-Tuning

### Ambiente

| | Especificação |
|--|--------------|
| **Hardware** | Apple M4 Pro — 17 GB memória unificada — macOS 15 |
| **Python** | 3.11 |
| **mlx / mlx-lm** | latest (framework ML Apple Silicon) |
| **llama.cpp** | compilado local (conversão HF → GGUF) |
| **Ollama** | latest (serving do modelo quantizado) |
| **Dataset LLM** | Claude Haiku 4.5 (`claude-haiku-4-5-20251001`) |

### Setup

```bash
bash scripts/setup-finetune.sh
# Instala: Python 3.11, mlx-lm, llama.cpp, Ollama + modelos base
```

### Fine-tuning LoRA

```bash
bash scripts/finetune.sh
bash scripts/finetune.sh --iters 500 --lora-layers 4  # rápido
bash scripts/finetune.sh --dry-run                    # simulação
```

**Hiperparâmetros do experimento:**

| Parâmetro | Valor | Nota |
|-----------|-------|------|
| Modelo base | `mistralai/Mistral-7B-Instruct-v0.3` | HuggingFace |
| `--iters` | 2000 | |
| `--num-layers` (LoRA) | 8 | 16 → OOM no M4 Pro 17GB |
| `--batch-size` | 2 | 4 → OOM no M4 Pro 17GB |
| `--learning-rate` | 5e-6 | |
| `--val-batches` | 5 | |
| `--steps-per-eval` | 100 | |
| `--save-every` | 100 | checkpoint a cada 100 iters |

**Pipeline interno do `finetune.sh`:**

| Passo | Ação |
|-------|------|
| 1/5 | Verifica `train.jsonl` + `valid.jsonl` |
| 2/5 | `mlx_lm lora` — treina adapters, seleciona checkpoint de menor val loss |
| 3/5 | `mlx_lm fuse` — merge adapters no modelo base |
| 4/5 | `convert_hf_to_gguf.py` → q8_0 → `llama-quantize` → Q4_K_M |
| 5/5 | `ollama create iris-mistral` com Modelfile |

> No experimento, `llama-quantize` não estava compilado — modelo ficou em **q8_0 (7.7 GB)**. Funciona normalmente, apenas ocupa mais disco que Q4_K_M (~4 GB).

---

## Benchmark e Resultados

5 perguntas curadas sobre a Lei 15.040/2024. Score = fração de critérios obrigatórios presentes na resposta (threshold 0.3 = aprovado).

```bash
bun run benchmark
```

![Benchmark Chart](docs/benchmark-chart.svg)

| Condição | Modelo | RAG | Score Médio | Aprovação |
|----------|--------|-----|-------------|-----------|
| A — base sem RAG | `mistral:7b-instruct` | ❌ | **53.0%** | **60%** |
| B — base com RAG | `mistral:7b-instruct` | ✅ | 27.0% | 40% |
| C — ÍRIS sem RAG | `iris-mistral` | ❌ | 5.0% | 0% |
| D — ÍRIS com RAG | `iris-mistral` | ✅ | 10.0% | 20% |

> Gerado em 2026-05-29 com `bun scripts/benchmark.ts`

<!-- BENCHMARK:START -->
<!-- BENCHMARK:END -->

---

## Aprendizados

**1. Fine-tuning degradou o modelo**
Dataset pequeno (~200 pares iniciais) causou catastrophic forgetting. O modelo "esqueceu" capacidades gerais de linguagem. Métrica de keyword overlap também pode estar penalizando respostas semanticamente corretas com vocabulário diferente do gabarito.

**2. RAG piorou o modelo base**
`mistral:7b-instruct` caiu de 53% → 27% com RAG. O prompt de retrieval longo dilui a pergunta. O modelo base não foi otimizado para seguir instruções com contexto extenso.

**3. Modelo base já conhecia a lei**
53% sem RAG refuta a hipótese inicial de que "o modelo não sabe nada sobre a lei". Fine-tuning partiu de uma base melhor do que esperado.

**4. Pipeline de dataset é o ativo real**
Scraping + Claude Haiku + augmentação 4× com prompt caching é barato e escalável. A ferramenta DataJud para RAG em tempo real funciona bem.

**5. MLX LoRA no Apple Silicon é viável**
Processo técnico de ponta a ponta sem configuração complexa. Gargalo é qualidade/quantidade do dataset, não infraestrutura.

---

## Roadmap

- [ ] Aumentar dataset para 2000+ pares (`build-full-dataset` já prepara isso)
- [ ] Usar `mistral-7b-v0.3` base (não instruct) — mais estável com LoRA
- [ ] Métrica semântica (embedding similarity) em vez de keyword overlap
- [ ] Prompt de RAG mais curto e focado
- [ ] Comparar com Llama 3.2 3B — menor, pode generalizar melhor com dataset pequeno
- [ ] Publicar modelo quantizado Q4_K_M no Ollama Hub

---

## Licença

Distribuído sob licença MIT. Veja [LICENSE](LICENSE) para mais informações.

---

## Contato

| Nome | Contato |
|------|---------|
| Edwillie Cardoso | edwillie@gmail.com |
| Jonathas Campos Cordeiro | jonathascampos@id.uff.br |
| Adriana da Silva de Souza | drisaas07@gmail.com |
| Vinícius Prates Araújo | vinicius.pratesaraujo@gmail.com |
| Nicholas Duque Guimarães | nicholasduque79@gmail.com |

Repositório: [https://github.com/pav-azos/iris](https://github.com/pav-azos/iris)

---

## Agradecimentos

- [LLMChat.co](https://llmchat.co) — projeto base do qual ÍRIS é um fork
- [shadcn/ui](https://ui.shadcn.com) — template de chat da interface
- [mlx-lm](https://github.com/ml-explore/mlx-lm) — LoRA training no Apple Silicon
- [llama.cpp](https://github.com/ggml-org/llama.cpp) — conversão e quantização GGUF
- [Ollama](https://ollama.com) — serving de modelos locais
- [CNJ DataJud](https://datajud-wiki.cnj.jus.br) — API pública de jurisprudência
- [Shields.io](https://shields.io/) — badges
- [Awesome README Template](https://github.com/Louis3797/awesome-readme-template) — estrutura deste README

PRD (Product Requirements Document): IRIS — Inteligência em Regulação e Informação Securitária

1. Visão Geral e Identidade da Solução

O mercado de seguros brasileiro enfrenta sua transformação mais disruptiva com a promulgação do novo Marco Legal dos Seguros (Lei 15.040/24). Neste horizonte de transição, a IRIS surge como a solução definitiva para prover a visão e a nitidez necessárias em um ambiente normativo complexo. O nome IRIS simboliza a capacidade de enxergar através das camadas de subjetividade jurídica, transformando o microssistema de seguros em uma estrutura de dados transparente e acionável. Com a vigência estabelecida para 11 de dezembro de 2025, a conformidade deixa de ser um desafio burocrático para se tornar uma vantagem competitiva orientada por dados.

O propósito central da IRIS é converter vastos repositórios documentais e a nova legislação em uma base de conhecimento dinâmica via Agentic RAG (Retrieval-Augmented Generation). A identidade do produto é sustentada por três pilares inegociáveis:

* Elegância: Uma interface sofisticada que traduz a densidade técnica em insights claros para Product Managers e Jurídico.
* Precisão: Rigor matemático na recuperação de informações, alcançando níveis de acurácia que superam os métodos tradicionais de busca.
* Rastreabilidade: Um compromisso absoluto com a fundamentação, conectando cada output a evidências específicas da fonte original.

Camada "E daí?": Ao mitigar a assimetria de informação, a IRIS não apenas protege a seguradora contra riscos regulatórios, mas também reduz proativamente o volume de litígios. A clareza na interpretação de cláusulas de exclusão e prazos de aceitação fortalece a confiança do segurado, transformando a conformidade legal em eficiência operacional e retenção de clientes.


--------------------------------------------------------------------------------


2. Análise do Problema e Objetivos Estratégicos

Atualmente, as seguradoras operam sob uma ineficiência estrutural, onde equipes técnicas dedicam de 30% a 40% do seu tempo em tarefas documentais repetitivas e na validação manual de conformidade. A IRIS resolve o gargalo financeiro e operacional que impede a escalabilidade do setor.

A solução aborda diretamente os 5 desafios críticos mapeados:

1. Criação Manual de Artefatos: A geração morosa de planos de teste e documentos de regulação que atrasa o time-to-market.
2. Perda de Contexto em RAG Tradicional: A incapacidade de sistemas básicos em capturar dependências de lógica de negócio e hierarquias normativas.
3. Limitação de Escalabilidade em Migrações: O desafio de processar legados massivos, como em migrações SAP S/4HANA, sem comprometer a qualidade.
4. Gaps de Rastreabilidade Regulatória: A dificuldade de provar, em auditoria, o nexo causal entre a regra e a decisão de negócio.
5. Silos de Conhecimento: A dependência excessiva do conhecimento tácito de especialistas seniores, dificultando a sucessão e o crescimento.

Camada "E daí?": A resolução desses gargalos permite uma economia projetada de 35% nos custos operacionais totais. Ao automatizar a criação de artefatos e reduzir o retrabalho técnico, a seguradora converte horas de documentação manual em capacidade de inovação estratégica.


--------------------------------------------------------------------------------


3. Arquitetura Técnica: O Coração da IRIS

A IRIS representa o estado da arte em engenharia de contexto, evoluindo a acurácia de 65.2% (RAG Básico) para 94.8% (Agentic RAG). Como Arquiteta, projetei esta solução para ir além da busca semântica, utilizando raciocínio multi-agente sobre uma base de dados híbrida.

Componentes de Engenharia

* Sistema de Conhecimento Híbrido (Vector-Graph):
  * SingleStore (Vector): Processamento de vetores de alta dimensão (384, 768 e 1024 dimensões) com integração via Sentence Transformer para conversão de linguagem natural em embeddings. Utilizamos um threshold de similaridade de 0.82 para seleção rigorosa de candidatos.
  * TigerGraph Cloud (Graph): Modelagem de relações de negócio complexas através de 15+ tipos de arestas predefinidas (ex: Requires, Validates, Impacts, Depends on, Covers). A instância conta com 16GB de heap allocation e otimização de garbage collection para garantir a integridade de travessias profundas em lógica de seguros.
* Orquestração Multi-Agente: O fluxo é coordenado por modelos de elite, como Gemini Pro (raciocínio complexo) e Mistral 7B (eficiência em tarefas específicas):
  * Agente de Análise de Legado: Decodifica intenções em repositórios históricos.
  * Agente de Mapeamento Funcional: Vincula requisitos à arquitetura técnica.
  * Agente de Pontos de Integração: Monitora interfaces críticas entre módulos.
  * Agente de Validação de Compliance: O guardião da Lei 15.040/24 em cada resposta.
* Engine de Contextualização de Alta Performance:
  * Montagem de contexto em 7 camadas de validação.
  * Processamento paralelo via 8 worker threads para síntese de contexto.
  * Reciprocal Rank Fusion (RRF): Algoritmo utilizado para fundir resultados léxicos e semânticos, utilizando o Parâmetro Alpha (ajustável entre 0.0 e 1.0) para equilibrar a prioridade entre termos técnicos exatos e conceitos abstratos.

Camada "E daí?": Segundo nossos estudos de ablação, a Contextualização Aprimorada é responsável por 18.2% do ganho total de acurácia. A busca híbrida (BM25 + Vetores) é o que permite à IRIS identificar termos sensíveis da Lei 15.040/24 que um RAG simples ignoraria, como "aceitação tácita" e "boa-fé objetiva", garantindo precisão cirúrgica em cenários de alta regulação.


--------------------------------------------------------------------------------


4. Escopo Funcional: Domínio da Lei 15.040/2024 (Marco Legal)

A inteligência da IRIS é alimentada pelo microssistema jurídico da nova lei, focado no equilíbrio contratual e na transparência total.

Domínio Funcional	Artigo de Referência (Lei 15.040/24)	Aplicação Prática da IRIS
Gestão de Riscos	Art. 37	Validação de questionários de risco; alertas sobre omissões que podem reduzir indenizações.
Prazos de Aceitação	Prazo ampliado para 25 dias	Monitoramento proativo para evitar a aceitação tácita indesejada por decurso de prazo.
Fluxo de Sinistros	Pagamento em 30 dias	Automação da regulação; teto de 120 dias para casos complexos com gestão de suspensão de prazos.
Prescrição (Segurado)	Art. 126	Prazo de 1 ano contado a partir da ciência da negativa da seguradora.
Prescrição (Terceiros)	Art. 126	Prazo de 3 anos para beneficiários e terceiros prejudicados, contados do fato gerador.
Seguro de Vida	Regras de Carência	Gestão do prazo de 2 anos para suicídio e doenças preexistentes omitidas após questionamento.
Transparência	Art. 57	Destaque automático de exclusões de cobertura e interpretação favorável ao segurado em ambiguidades.

Camada "E daí?": A funcionalidade de Análise de Impacto de Mudança permite simular como uma alteração em uma cláusula contratual ou em uma circular da SUSEP reverbera em toda a estrutura de conformidade da companhia, antecipando riscos antes que eles se tornem passivos judiciais.


--------------------------------------------------------------------------------


5. Métricas de Sucesso e Resultados Esperados

O desempenho da IRIS foi validado em ambientes de missão crítica, incluindo migrações corporativas SAP S/4HANA com bases de 25.000 casos de teste legados.

* Redução de Cronograma: Economia de 85% de tempo na criação de planos de teste e artefatos de qualidade.
* Eficiência de Testes: Melhoria de 85% na cobertura da suíte de testes regulatórios.
* Taxa de Defeitos: Aumento de 35% na detecção precoce de desconformidades legais.
* Qualidade em Produção: Redução drástica de 92% em defeitos pós-implantação (produção).
* Acurácia Final: Alvo de 94.8% de precisão na geração de documentos de compliance.

Camada "E daí?": A Rastreabilidade Bidirecional atua como uma apólice de seguro contra auditorias. Ao conectar cada decisão de negócio ao seu fundamento legal exato, a IRIS neutraliza riscos reputacionais e fortalece a defesa jurídica da organização em qualquer esfera.


--------------------------------------------------------------------------------


6. Roadmap de Evolução e Próximos Passos

A evolução da IRIS segue uma trajetória de maturidade tecnológica dividida em 4 estágios: RAG Básico (65%) → Vector Search (78%) → Hybrid RAG (87%) → Agentic System (94.8%).

1. Loops de Feedback (Reinforcement Learning): Otimização autônoma dos agentes com base nos resultados de execuções reais e decisões de tribunais superiores.
2. Inteligência Multimodal: Expansão para processamento visual de apólices digitalizadas, análise de UX e leitura de evidências fotográficas em sinistros.
3. Manutenção Automatizada do Conhecimento: Sincronização dinâmica com novas resoluções do CNSP e circulares da SUSEP, garantindo que a base de conhecimento nunca sofra obsolescência.

A IRIS não é apenas um sistema de consulta; é uma entidade de inteligência que evolui em simbiose com o mercado securitário. Estamos definindo o padrão para o futuro da regulação assistida por IA, onde a tecnologia de ponta assegura que a eficiência operacional e a segurança jurídica sejam faces da mesma moeda.

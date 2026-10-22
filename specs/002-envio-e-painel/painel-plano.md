# Plano da frente do painel: Fatias 2, 3 e 4 da 002

**Branch**: `feat/002-painel` | **Data**: 2026-10-21 | **Spec**: [spec.md](./spec.md)

**Entrada**: `specs/002-envio-e-painel/spec.md`, histórias 3, 4 e 5 (FR-024 a FR-035) e
FR-022/FR-033 (privacidade no painel).

> Este arquivo existe porque o `plan.md` e o `tasks.md` da 002 são escritos por outra frente,
> em paralelo. Ele cobre só o painel e deve ser incorporado ao `plan.md` quando as frentes se
> juntarem. O plano aprovado citado no pedido
> (`~/.claude/plans/uv-tool-install-specify-cli-toasty-reddy.md`) **não existe nesta máquina**
> (a pasta `~/.claude/plans/` não existe): os nomes de tabela e de view abaixo são
> **suposições**, isoladas num único arquivo (`painel/src/dados/contrato.ts`) para que alinhar
> com `servidor/*.sql` seja troca de um arquivo só. As colunas de leitura e de resumo diário
> foram tiradas do caso de referência `servidor/golden/resumo-diario.json` da frente do
> servidor (lido, não copiado para esta branch).

## Resumo

Painel das pesquisadoras como **artefato separado e online** (`painel/`), com `package.json`
próprio (não é workspace). Uma tela de entrada e três de dados (Visão geral, Colmeia,
Planilha). Os dados vêm de uma **porta** (`FontePainel`) com duas implementações:
demonstração em memória, determinística, usada quando não há configuração; e Supabase, usada
quando `VITE_SUPABASE_URL` e `VITE_SUPABASE_ANON_KEY` existem.

## Contexto técnico

- **Linguagem**: TypeScript 6.0.3, React 19.2.9.
- **Dependências (versão exata)**: react-dom 19.2.9, react-router 8.4.0, uplot 1.6.32,
  @supabase/supabase-js 2.117.3; desenvolvimento: vite 8.3.4, @vitejs/plugin-react 6.1.2,
  vitest 4.1.11, @types/react 19.2.18, @types/react-dom 19.2.7.
- **Armazenamento**: nenhum. O painel não tem banco local nem motor de envio (FR-032). A única
  coisa que o navegador guarda é a sessão de autenticação do supabase-js (no modo Supabase).
- **Testes**: vitest próprio do painel (`painel/tests/`), ambiente node, sem DOM. O vitest e o
  tsconfig da raiz ignoram `painel/`.
- **Alvo**: navegadores Chromium atuais, no computador.
- **Orçamento** (Princípio II, painel): JS do caminho crítico ≤ 250 kB comprimido; visão do
  conjunto p95 ≤ 1,5 s; gráfico p95 ≤ 1,0 s a partir dos resumos diários; planilha de 50 mil
  linhas começa a baixar em ≤ 3 s.

### Por que cada dependência

| Dependência | Motivo | Alternativa mais simples e por que não |
|---|---|---|
| uPlot | Única biblioteca de gráfico permitida no painel (`.claude/rules/ui.md`); desenha em canvas e respeita `null` como lacuna (`spanGaps: false`) | SVG à mão: refazer eixo, cursor e escala de tempo custaria mais código do que o uPlot pesa |
| react-router | Rotas com endereço próprio por colmeia; estado entre telas por `location.state`, nunca por parâmetro de endereço (FR-033) | `location.hash` à mão: possível, mas sem proteção de rota e com mais código |
| supabase-js | Autenticação e consulta com RLS do lado do servidor; carregado por import dinâmico, fora do caminho crítico | `fetch` contra o PostgREST: teríamos de reimplementar a renovação de sessão |

Nenhuma dependência nova no **app de campo**. O `package.json` da raiz não muda.

## Decisões de domínio

1. **Série por calendário, nunca zip.** O servidor só devolve os dias que têm linha. A série
   percorre o calendário de `deDia` a `ateDia`, um índice por dia, e o dia sem linha vira
   `null` (`dominio/serie.ts`).
2. **Uma série por (nó sensor, época).** Cada época do sensor, e cada nó sensor, vira uma
   série própria no uPlot, com `null` fora dela. Assim nenhuma linha atravessa a troca, nem
   quando a troca acontece no meio de um dia (duas linhas no mesmo dia, uma por época).
3. **O que é cada coluna do resumo.** `temp_med` é a **média** do dia (`AVG`, truncada), não
   mediana; `temp_p5`/`temp_p95` são hoje **MIN e MAX** (nota do caso de referência do
   servidor). A tela diz "média", "menor" e "maior", nunca "mediana" nem "p5/p95".
4. **Agregado do período sem inventar agregado.** O resumo do período mostra só o que se tira
   exato dos resumos diários: menor das mínimas, maior das máximas, faixa das médias diárias,
   soma de leituras válidas e soma de amostras excluídas. Nenhuma "média das médias".
5. **Voláteis só relativos à própria colmeia.** Índice = 100 × média diária ÷ mediana das médias
   diárias **do mesmo nó e da mesma época, dentro do período**. Sem linha de base com menos de
   3 dias. A visão geral não recebe campo de voláteis (o tipo `ColmeiaMacro` não tem).
6. **Correção de temperatura aplicada só na exibição** (offset do nó, Princípio VI). A planilha
   traz o valor bruto e a correção em colunas separadas.
7. **Planilha** (`dominio/planilha.ts`): UTF-8 com BOM, `;`, `\r\n`, vírgula decimal, valor
   ausente como célula vazia (nunca `0`), texto que começa com `= + - @` neutralizado,
   cabeçalho de proveniência (sensor, versões do formato, derivadas, excluídas, qualidade da
   hora, coordenadas não coletadas, voláteis não comparáveis entre colmeias). Valores brutos na
   resolução gravada (centésimos convertidos exatamente), porque é dado para análise e
   arredondar destrói informação; o cabeçalho declara a exatidão do sensor. Sem nome de pessoa
   na planilha: a colmeia é identificada por código, nome, local e município.
8. **Busca por apicultor só no cliente**, em estado do componente. Nada de nome em endereço;
   o filtro da Colmeia para a Planilha vai por `location.state`.
9. **Dias em UTC.** O dia do resumo é `t_utc_ms / 86400000`; o painel rotula datas em UTC e diz
   isso na legenda do gráfico e no cabeçalho da planilha.

## Constitution Check

Preenchido antes do código com o veredito **pretendido**; reavaliado depois da implementação
na seção "Reavaliação do Constitution Check" abaixo, que é a que vale.

| Princípio | Veredito | Evidência |
|---|---|---|
| I. Offline por Padrão | N/A | O painel é declaradamente online (Restrições de Plataforma). O que se aplica está na tabela Comportamento Offline abaixo: sem rede o painel diz o que aconteceu e o que fazer, sem "erro"/"falha"/"offline" como manchete. |
| II. Orçamento de Desempenho | pendente | Medir JS gz do caminho crítico no build. Os tempos p95 só podem ser medidos contra servidor real. |
| III. Leituras Imutáveis e Idempotentes | N/A | O painel só lê; a fonte Supabase usa apenas `select`. |
| IV. O Payload é Externo | N/A | O painel não decodifica payload nem fala com transporte; lê o modelo canônico já gravado. |
| V. Ergonomia de Campo em pt-BR | pendente | Idioma: módulo de textos do painel + teste. Medidas de campo não se aplicam ao painel (escopo do Princípio V). |
| VI. Honestidade do Dado | pendente | Testes da série, dos voláteis e da planilha. |
| VII. Especificação Antes do Código | PASS | `spec.md` (US3-US5) commitada na base; este plano commitado antes do código do painel. |

## Comportamento Offline

| Tela/Ação | Sem rede | Rede intermitente | Fonte do dado |
|---|---|---|---|
| Entrar | "Sem internet agora" com o que fazer; nada é guardado | Botão Tentar de novo | Supabase Auth (ou demonstração, que não usa rede) |
| Visão geral | Mesma mensagem e Tentar de novo; nenhuma lista velha é mostrada como atual | Idem | view macro (ou demonstração) |
| Colmeia | Mesma mensagem | Idem | resumos diários (ou demonstração) |
| Planilha | Mesma mensagem; nenhum arquivo parcial é baixado | Idem; o arquivo só é montado com o recorte completo | leituras (ou demonstração) |

## Estrutura

```text
painel/
├── package.json, tsconfig.json, vite.config.ts, index.html
├── scripts/check-sem-banco.sh    # FR-032 por comando
├── scripts/medir-js.mjs          # JS gz do caminho crítico
├── src/
│   ├── dados/   porta.ts, contrato.ts, demo.ts, supabase.ts, escolher.ts
│   ├── dominio/ calendario.ts, formato.ts, serie.ts, volateis.ts, periodo.ts, planilha.ts, visao.ts
│   ├── textos/  pt-BR.ts, index.ts
│   ├── telas/   Entrar, VisaoGeral, Colmeia, Planilha
│   └── ui/      App, Moldura, Grafico (uPlot), graficoOpcoes.ts, Estados, carregar.ts, rotulos.ts, estilos.css
└── tests/       serie, volateis, planilha, textos, demo, formato, supabase, grafico
```

## Tarefas desta frente

- [x] P001 Porta de dados e tipos do que o painel lê (`dados/porta.ts`)
- [x] P002 Textos pt-BR do painel e teste de vocabulário e de literal em componente
- [x] P003 [US4] Construtor da série por calendário com quebra por nó e época + testes
- [x] P004 [US3/US4] Índice de voláteis relativo à própria colmeia + testes da regra
- [x] P005 [US5] Gerador de planilha (BOM, `;`, vírgula decimal, proveniência) + testes
- [x] P006 Fonte de demonstração determinística (lacunas, dias só com amostras excluídas, troca
  de época no meio do dia, um meliponário e apiários, colmeia sem leitura) + testes
- [x] P007 Fonte Supabase com nomes isolados em `dados/contrato.ts` (escrita; **não** exercitada
  contra servidor real)
- [x] P008 [US3] Tela Entrar e Visão geral (busca só no cliente)
- [x] P009 [US4] Tela Colmeia (uPlot, 7/30/livre, resumo do período com excluídas)
- [x] P010 [US5] Tela Planilha (recorte, limite, download)
- [x] P011 Verificação sem banco local (`check-sem-banco.sh`) e medição de JS gz
- [ ] P012 Ligar no Supabase real (depende de `servidor/*.sql`, outra frente; lista do que falta
  em `painel-notas.md`)
- [ ] P013 Medir p95 de visão, gráfico e planilha contra servidor semeado com 30 colmeias × 12 meses
- [ ] P014 Planilha: incluir leituras sem hora conhecida (spec 003, FR-017) — pede decisão de produto
- [ ] P015 Gráfico: distinguir trecho de hora estimada (spec 003, FR-019) — depende de o resumo
  diário do servidor carregar a qualidade da hora

## Reavaliação do Constitution Check (depois da implementação)

| Princípio | Veredito | Evidência |
|---|---|---|
| I. Offline por Padrão | N/A | O painel é online por definição da constituição (Restrições de Plataforma). Tabela Comportamento Offline acima; sem rede, `ui/Estados.tsx` mostra "Sem internet agora" com o que fazer e Tentar de novo; `tests/textos.test.ts` reprova "erro", "falha" e "offline" nas manchetes de rede. |
| II. Orçamento de Desempenho | PASS só no JS do caminho crítico | `npm run medir` em 2026-10-21: até a tela Entrar, 106,1 KB gz no modo demonstração e 158,9 KB gz no modo Supabase (104,0 KB do pacote inicial + 54,9 KB do SDK, que `App.tsx` espera antes da primeira tela); orçamento 250 KB. Os p95 de visão (1,5 s), gráfico (1,0 s) e planilha (3 s) **não foram medidos** e não declaro PASS neles (P013). |
| III. Leituras Imutáveis e Idempotentes | N/A | O painel só lê: `dados/supabase.ts` usa apenas `select` (nenhum insert, update, upsert, delete nem rpc em `painel/src`). Valor ausente segue nulo até a planilha, onde vira célula vazia (`tests/planilha.test.ts`). |
| IV. O Payload é Externo | N/A | O painel não decodifica payload nem fala com transporte. `scripts/check-sem-banco.sh` reprova import do app de campo dentro de `painel/src`. |
| V. Ergonomia de Campo em pt-BR | PASS (idioma) · N/A (medidas de campo) | Toda string visível em `painel/src/textos/pt-BR.ts`; `tests/textos.test.ts` varre a árvore do TypeScript de todo `.tsx` e reprova texto solto, atributo de texto literal e string literal em JSX, e reprova "dashboard", a sigla do formato, palavras em inglês e CO₂ fora de "eCO₂"/"não é CO₂". Contraste calculado das cores: texto 18,9:1, secundário 10,9:1, destaque 10,0:1, linhas do gráfico ≥ 7,8:1, borda 5,3:1. As medidas de luva e sol não se aplicam ao painel (escopo do Princípio V). |
| VI. Honestidade do Dado | PASS | Lacuna por calendário e quebra por nó e época: `dominio/serie.ts` + `tests/serie.test.ts`. Excluídas ao lado de todo agregado: dia apontado e resumo do período em `telas/Colmeia.tsx`. Voláteis só relativos à própria trilha e ausentes da visão geral: `dominio/volateis.ts` + `tests/volateis.test.ts`. Proveniência, eCO₂ derivado, exatidão e coordenadas na planilha: `dominio/planilha.ts` + `tests/planilha.test.ts`. Temperatura 1 casa, umidade 0: `dominio/formato.ts` + `tests/formato.test.ts`. 11 mutantes nos pontos críticos, todos pegos. |
| VII. Especificação Antes do Código | PASS | `spec.md` (US3-US5, FR-024..FR-035) na base `2890a28`; este plano no commit `28bd0a2`, antes dos commits de código. `/speckit-analyze` **não** foi rodado: este arquivo não é o `plan.md` da feature, e o `plan.md`/`tasks.md` da 002 são de outra frente. |

## Complexity Tracking

Nenhuma violação declarada. As três dependências de execução estão justificadas na tabela
"Por que cada dependência". O supabase-js fica fora do caminho crítico por import dinâmico.

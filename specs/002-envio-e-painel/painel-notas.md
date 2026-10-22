# Notas do painel (Fatias 2, 3 e 4 da 002)

**Data**: 2026-10-21 · **Branch**: `feat/002-painel` · **Plano**: [painel-plano.md](./painel-plano.md)

## O que foi feito

O painel das pesquisadoras existe como artefato separado em `painel/`, com `package.json`
próprio (não é workspace) e roda hoje com **dados de demonstração** gerados no navegador.

| Tela | O que faz | Onde |
|---|---|---|
| Entrar | E-mail e senha, sem cadastro (FR-024). No modo demonstração, entra direto, com aviso "Dados de demonstração" | `src/telas/Entrar.tsx` |
| Visão geral | Uma linha por colmeia: apicultor, colmeia, apiário ou meliponário, município, idade da última leitura em palavras, leituras, amostras excluídas. Nenhuma coluna de gás. Busca por apicultor só no navegador | `src/telas/VisaoGeral.tsx` |
| Colmeia | uPlot com 7 ou 30 dias até a última leitura, ou datas livres. Lacuna e troca de sensor como falha na linha. Dia apontado e resumo do período com amostras excluídas ao lado. Temperatura com 1 casa, umidade sem casa. Voláteis como índice da própria colmeia | `src/telas/Colmeia.tsx` |
| Planilha | Recorte por colmeias e período, até 50 mil leituras (acima disso pede para estreitar). Pré-seleção vinda da colmeia por estado de navegação, nunca por endereço | `src/telas/Planilha.tsx` |

Regras de domínio, todas com teste (`painel/tests/`):

- `dominio/serie.ts` — série percorre o calendário (dia sem linha vira `null`, nunca zip) e
  cada par (nó sensor, época) é uma trilha separada; nenhuma linha atravessa a troca, nem no
  meio de um dia.
- `dominio/volateis.ts` — índice com linha de base (mediana, ≥ 3 dias) da própria trilha.
- `dominio/planilha.ts` — UTF-8 com BOM, `;`, `\r\n`, vírgula decimal, nulo como célula
  vazia, fórmula neutralizada, cabeçalho de proveniência (sensor, versões do formato, eCO₂
  derivado e "não é CO₂", amostras excluídas, qualidade da hora, coordenadas não coletadas,
  voláteis não comparáveis, aviso do aquecimento do sensor de gás, sem nome de pessoa).
- `dados/demo.ts` — demonstração determinística: meliponário e apiários, lacuna de 3 dias,
  dias só com amostras excluídas (há leitura, não há resumo), troca de sensor no meio de um
  dia, correção de temperatura, trecho com hora estimada, colmeia sem leitura. O resumo
  diário usa a regra do celular e do servidor e reproduz o dia 20300 do caso de referência
  `servidor/golden/resumo-diario.json` da frente do servidor.
- `dados/contrato.ts` — o único arquivo que conhece nomes do servidor.

Os pontos críticos foram testados por mutação (quebrar de propósito, conferir que um teste
falha, restaurar): calendário trocado por zip, trilha sem época, linha de base global, sem
BOM, ponto decimal, nulo virando zero, fórmula sem neutralizar, texto solto em componente,
regra de exclusão alterada, dia só com excluídas gerando resumo, temperatura com 2 casas.
Todos os 11 mutantes foram pegos.

## Como rodar

```bash
cd painel
npm install          # só na primeira vez
npm run dev          # painel em http://localhost:5173, modo demonstração
npm test             # vitest do painel
npm run typecheck
npm run build        # tsc + vite build
npm run medir        # JS gz do caminho crítico contra o orçamento (rodar depois do build)
npm run check:sem-banco
```

Da raiz também funcionam `npm run painel:dev` e `npm run painel:build`. O vitest e o
tsconfig da raiz ignoram `painel/`.

## Medição (Princípio II, orçamento do painel)

Build de produção em 2026-10-21, gzip nível 9 (`npm run medir`):

| Modo | Pacote inicial | Antes da primeira tela útil (Entrar) | Orçamento |
|---|---|---|---|
| Demonstração (sem configuração) | 103,9 KB gz | **106,1 KB gz** (+ `demo` 2,2 KB) | ≤ 250 KB gz |
| Supabase (com `VITE_SUPABASE_*`) | 104,0 KB gz | **158,9 KB gz** (+ `supabase` 54,9 KB) | ≤ 250 KB gz |

O pacote inicial (React, react-router, uPlot e as telas) tem cerca de 104 KB. O pedaço da fonte
de dados entra por import dinâmico, mas `App.tsx` espera por ele antes de mostrar a tela
Entrar, então ele **está** no caminho crítico: no modo Supabase são 158,9 KB, 64 % do
orçamento. (Revisão de 2026-10-21: a versão anterior desta nota dava 103,8 KB para os dois
modos, contando o SDK como "sob demanda".)

**Não medido**: p95 da visão do conjunto (≤ 1,5 s), do gráfico (≤ 1,0 s) e da planilha de 50
mil linhas (≤ 3 s). Isso só tem sentido contra o servidor real semeado com 30 colmeias × 12
meses. Na demonstração, montar uma planilha de 23.249 leituras levou 43 ms no navegador
(dado em memória, número que **não** vale para o orçamento).

## Verificação no navegador

Feita com `vite preview` por poucos minutos, encerrado em seguida, no modo demonstração:
entrar, visão geral, busca (o endereço não muda), colmeia com troca de sensor (Jandaíra 2) e
com dias só de amostras excluídas (Caixa 01), dia apontado sobre a lacuna ("Sem leitura
válida neste dia"), datas invertidas (aviso), colmeia sem leitura, planilha com pré-seleção,
recorte grande demais (aviso, nada baixado) e planilha gerada (BOM conferido nos 3 primeiros
bytes). Console sem erro. **Não** foi verificado em tela de celular nem com leitor de tela.

## O que falta para ligar no Supabase real

1. **Configuração.** Criar `painel/.env.local` (já ignorado pelo git) com
   `VITE_SUPABASE_URL=https://<projeto>.supabase.co` e `VITE_SUPABASE_ANON_KEY=<chave anônima>`.
   Só a chave anônima: chave de serviço nunca entra no painel. Endereço sem TLS é recusado
   (exceto `localhost`).
2. **Visões do servidor** — *resolvido na integração de 2026-10-21.* `contrato.ts` lê
   `hive_overview` (no lugar da suposta `vw_macro`), `hive_daily` e `hive_reading`, como
   está em [contracts/servidor.md](./contracts/servidor.md). As três são
   `security_invoker = true`, então a RLS da pesquisadora vale (FR-020).
3. **RLS de leitura para a pesquisadora** — *existe no servidor*: políticas
   `researcher_reads_*` em `node`, `reading_daily`, `reading` e `node_stats`, via
   `researcher_project`, testadas em `servidor/teste/rls.sql`. O painel só faz `select`.
4. **Cadastro de pesquisadoras à mão** no Supabase Auth, com cadastro público desligado
   (FR-024).
5. **Nomes em `contrato.ts`** — conferidos na integração contra `servidor/*.sql` e
   `contracts/servidor.md`. `t_quality` conferido contra a 003 (`src/core/hora/tipos.ts`):
   0 rtc · 1 ancorada · 2 estimada · 3 desconhecida; o painel mostra 1 e 2 como tais e o
   resto como desconhecida.
6. **Medir os p95** do orçamento contra o servidor semeado (tarefa P013 do plano).

## Pendências e limitações conhecidas

- **Leituras sem hora** (feature 003, `t_utc_ms` nulo) não entram na planilha, porque o
  recorte é por período. A spec 003 (FR-017) pede que elas venham na exportação com o motivo.
  Precisa de uma decisão de produto: incluir as sem hora dos nós escolhidos, à parte.
- **Gráfico não distingue hora estimada** (spec 003, FR-019): o resumo diário do servidor não
  carrega a qualidade da hora. A planilha já traz a qualidade por leitura e as contagens.
- **Modelo do sensor**: o servidor não tem coluna para ele; a planilha diz "não informado pelo
  servidor". Na demonstração aparece "AHT21 + ENS160 (informado, não confirmado)", conforme
  `docs/integracao-firmware.md`.
- **Nó que mudou de colmeia**: o servidor guarda só a colmeia atual do nó (`node.hive_id`),
  então o histórico de um nó transferido aparece todo na colmeia nova.
- **Dia só com amostras excluídas** não tem linha de resumo (regra do celular e do servidor),
  então a contagem de excluídas desse dia não aparece no gráfico nem no resumo do período; ela
  está na visão geral (`node_stats`) e na planilha. A explicação do resumo do período diz isso
  na tela, ao lado da contagem.
- **Planilha sem nome de pessoa** (decisão desta frente, por minimização): a colmeia vai por
  código, nome, local e município. Se as pesquisadoras precisarem do nome do apicultor no
  arquivo, é uma linha em `planilha.ts`, mas precisa de decisão de privacidade.
- **Valores brutos na planilha** com 2 casas (resolução gravada), não com a precisão de tela.
  O cabeçalho declara a exatidão. Confirmar com as pesquisadoras.
- **Sessão da demonstração** não sobrevive a recarregar a página (fica só em memória).
- Este plano e estas notas precisam ser incorporados ao `plan.md` e ao `tasks.md` da 002, que
  outra frente escreve.

## Revisão independente (2026-10-21)

Corrigido depois da revisão, com teste que falha no código anterior:

- **Troca de sensor falsa com dois nós na mesma colmeia.** Dois nós ligados ao mesmo tempo
  (posições diferentes na caixa, `node.placement`) faziam a tela dizer "Troca de sensor em…".
  Agora troca é só época nova do mesmo nó, ou nó novo que entra depois que os anteriores
  pararam (`trocasDeSensor`, `tests/serie.test.ts`).
- **Resumos diários cortados em 1.000 linhas pelo servidor.** A fonte Supabase pedia
  `limit(5000)`, que o PostgREST ignora acima do teto; dois nós × 731 dias perdiam o fim da
  série, que viraria lacuna falsa. Agora pagina (`tests/supabase.test.ts`, servidor de
  mentira com o mesmo teto).
- **Verificação de texto solto com furos.** Prop de componente (`titulo="…"`) e texto em ramo
  de condição (`{ok ? 'Texto' : null}`) passavam; um subtítulo literal com "CO2" passava.
  Agora todo atributo não técnico é vigiado e os ramos de `?:`, `&&` e `||` também.
- **`check-sem-banco.sh`** não pegava `import('../../../src/…')` dinâmico do app de campo.
- **Medição do caminho crítico** no modo Supabase (ver acima).
- **Resumo do período** passou a explicar que amostra excluída se refere ao sensor de gás e
  que dia só com excluídas não entra na contagem.

## Segunda revisão independente (2026-10-21)

Corrigido, cada item com teste que falha no código anterior (conferido por mutação):

- **Planilha cortada em 1.000 leituras sem aviso, no modo Supabase.** A paginação de
  `leituras` existia, mas nenhum teste a exercitava: trocar o laço por uma página só
  passava nos 101 testes, e a planilha sairia "pronta" com 1.000 leituras. Agora
  `tests/supabase.test.ts` cobre o recorte acima do corte do servidor e o `limite + 1`.
- **`spanGaps: false` sem teste.** O construtor por calendário era testado, mas trocar
  `spanGaps` para `true` no uPlot (desenhar linha sobre a lacuna, SC-008) passava em tudo.
  As opções das séries foram para `ui/graficoOpcoes.ts` e `tests/grafico.test.ts` trava
  `spanGaps: false`, os pontos visíveis e o `null` chegando intacto ao uPlot.
- **Último dia do recorte da planilha sem teste.** `recortePlanilha` (`dominio/periodo.ts`)
  tira o cálculo da tela; trocar `ate + 1` por `ate` agora reprova.
- **Neutralização de fórmula e quebra de linha sem teste.** Tirar o `-` da neutralização
  ou o `\r\n` das aspas passava; agora reprova.
- **"Ontem" para leitura de hoje.** `frescor` contava dias UTC: às 21h30 em UTC-3 uma
  leitura das 20h do mesmo dia aparecia como "Ontem". Agora usa o calendário de quem lê.
- **Temperatura corrigida sem rótulo no gráfico.** Com correção do nó diferente de zero,
  o gráfico e o dia apontado mostravam o valor corrigido sem dizer (Princípio VI: derivada
  rotulada no próprio rótulo). Agora o subtítulo do gráfico diz a correção de cada nó e o
  dia apontado diz "Temperatura corrigida".

Achados que ficam, com motivo:

- **Nome da view** — *resolvido na integração de 2026-10-21*: `TABELAS` em `contrato.ts`
  aponta para `hive_overview`, `hive_daily` e `hive_reading`.
- **Paginação supõe teto de 1.000 linhas.** Se o projeto Supabase for configurado com
  `max_rows` menor que 1.000, `resumosDiarios` e `leituras` param na primeira página curta.
  O padrão do Supabase é 1.000; manter `max_rows >= 1000` entra na lista de P012.
- **`npm audit`**: hoje aponta 2 avisos moderados no `vitest` 4.1.11 (só desenvolvimento,
  `@vitest/mocker`); a correção é 4.1.12. Não atualizei para não trocar versão de
  ferramenta nesta revisão.

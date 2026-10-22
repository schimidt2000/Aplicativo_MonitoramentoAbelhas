# Fase 0 — Pesquisa e decisões

**Feature**: `specs/003-hora-das-leituras` · **Data**: 2026-10-21

Cada decisão diz o que foi escolhido, por quê, e o que foi rejeitado. As que dependem do nó
sensor estão marcadas como **suposição** e registradas em `docs/integracao-firmware.md`.

---

## D-301 — A qualidade da hora segue o estado da referência

**Decisão.** Uma leitura é **ancorada** (`t_quality = 1`) só quando a referência usada para
calcular a hora está **conferida**: outra coleta da mesma ligada concordou com ela, ou o
apicultor confirmou a data do celular (FR-011). Referência **não conferida** (a primeira de
uma ligada, FR-012) ou **em conflito** (FR-010) dá hora **estimada** (`2`). Ligada sem
referência válida dá hora **desconhecida** (`3`, `t_utc_ms = NULL`, FR-016).

**Por quê.** FR-016 reserva "estimada" para "referência que não pôde ser conferida ou que está
em conflito", e FR-012 diz que a primeira referência fica "não conferida até uma coleta
seguinte concordar com ela". O defeito 2 da spec é justamente a primeira referência virar
"confiável" sem conferência.

**Consequência visível.** A primeira coleta de um nó passa a gerar hora estimada; a segunda,
se concordar, promove as horas da ligada inteira a ancoradas, por correção à parte. Os testes
da 001/002 que esperavam `t_quality = 1` já na primeira coleta foram atualizados com essa
justificativa.

**Rejeitado.** Tratar a primeira referência como ancorada: reproduz o defeito 2.

---

## D-302 — A hora é avaliada depois da transferência, não na gravação do lote

**Decisão.** `ingerirLote` grava cada leitura com `t_utc_ms = NULL`, `t_quality = 3` e
`t_motivo = 'em-avaliacao'`. Ao fim de cada coleta (com ou sem problema), `atualizarHoras`
segmenta as ligadas, atribui as referências, confere, e grava uma **versão de horas**
(append-only) que a VIEW `leitura_hora` aplica.

**Por quê.** O lote 1 de uma coleta pode ser de uma ligada antiga, e só o lote 5 revela a
regressão do contador. Gravar a hora "provável" no lote 1 é exatamente o defeito 1 da spec:
hora errada com selo de certa, e, se o app morrer entre o lote 1 e o fim, ela fica assim. Com
a avaliação no fim, uma queda deixa as leituras **sem hora** até a próxima avaliação — o lado
seguro (FR-004).

**Rejeitado.**
- Hora provisória no lote, corrigida no fim: deixa hora errada efetiva se o app morrer no
  meio.
- Reavaliar a cada lote: desnecessário. A segmentação do que já está gravado é exata; só a
  referência desta coleta precisa da última leitura (`seq_ref`), que chega no último lote.

---

## D-303 — Correção por "versão de horas" em faixas, aplicada por VIEW

**Decisão.** Duas tabelas append-only:

- `hora_versao` (uma linha por avaliação: nó, quando, causa);
- `hora_correcao` (faixas contíguas de `seq` daquela versão, cada uma com a referência usada,
  a qualidade e o motivo).

A VIEW `leitura_hora` pega, para cada leitura, a faixa da **última** versão do nó que a cobre
e calcula `t_utc = ref_t_utc − (ref_t_node − t_node) × 1000`. Leitura fora de qualquer faixa
usa os campos da própria linha (`reading`), que nunca mudam.

**Por quê.** Cada versão cobre o nó inteiro, então "a última versão vale" basta: a busca é
`MAX` por índice, `O(log n)` por leitura, sem varrer correções sobrepostas. A faixa guarda os
parâmetros da referência, não a hora pronta, então uma versão tem poucas linhas (uma por
referência por ligada), não uma por leitura. Nenhuma linha de `reading` é tocada.

**Rejeitado.**
- Correção por leitura: dezenas de milhares de linhas por revogação.
- Log de diferenças sobrepostas: a VIEW teria de varrer todas as correções que cobrem a
  leitura para achar a mais nova — custo que cresce com o tempo.
- Tabela derivada apagada e refeita (como `reading_daily`): perde o histórico de correções
  que FR-013/FR-014 mandam guardar.

---

## D-304 — Ligadas: número do nó, ou regressão do contador

**Decisão.** Leituras em ordem de `seq`. Uma ligada nova começa quando:

1. as duas leituras trazem o número da ligada (`Reading.ligada`, opcional) e ele muda; ou
2. o contador **não cresce** (`t_node ≤ anterior`, FR-002) — com ou sem número; ou
3. o modo de tempo do nó muda (`clock_mode`), o que só acontece com firmware novo.

O id da ligada é o `seq` da primeira leitura dela.

**Por quê.** `≤` e não `<`: duas leituras distintas não podem ter o mesmo contador, então
igualdade também é reinício. Estouro do contador (≈49,7 dias) com o mesmo número de ligada
também vira segmento novo — perde-se a hora daquele trecho em vez de errá-la (FR-004 e edge
case "estouro").

**Suposição (não confirmada).** O número da ligada em cada leitura (pergunta 6). O mock v1 não
manda; a detecção por regressão é o caminho vigente.

---

## D-305 — A que ligada pertence uma referência

**Decisão.** Cada referência guarda `seq_ref` = `NodeInfo.newestSeq` no momento da coleta.
Seja `A` a leitura gravada com esse `seq`:

- `t_node_ref ≥ t_node(A)` e a diferença ≤ 2 × período + 60 s → ligada de `A`. O período é o
  que o nó informou **na sessão** (`clock_anchor.periodo_s`), não o do cadastro: um nó de 1 h
  cadastrado com o padrão de 15 min teria metade das coletas sem ligada;
- `t_node_ref < t_node(A)` → o nó reiniciou depois de `A`: a referência é da ligada que começa
  logo depois de `A`, se a primeira leitura dela tiver contador ≥ `t_node_ref`; ou de uma
  ligada ainda sem leituras;
- qualquer outro caso, ou `A` ausente → **sem ligada** (FR-004).

Com número da ligada nos dois lados, vale o número. Se o mesmo número tem mais de um trecho
(estouro do contador), o trecho é decidido pela leitura `A`, como sem número. Sem `A`
(transferência que caiu) e com um trecho só, a referência só fica nele se o contador dela couber
entre as leituras vizinhas de `seq_ref`.

**FR-003** sai por construção: uma leitura de `seq ≤ seq_ref` com contador maior que o da
referência nunca fica na mesma ligada dela.

---

## D-306 — Conferência entre coletas

**Decisão.** Duas referências válidas da mesma ligada, de **coletas diferentes** (`grupo`
diferente — o acerto do relógio é do mesmo grupo da coleta que o fez), concordam quando

`|Δ celular − Δ nó| ≤ 10 min + 1 % × Δ nó`

A tolerância usa o tempo contado pelo **nó**: com o celular um ano adiantado, 1 % do Δ do
celular daria 3,6 dias de folga e esconderia o erro. Entre ligadas diferentes, a hora do
celular não pode **voltar**: uma referência de ligada posterior com hora anterior à de uma
ligada anterior (menos 10 min) também é discordância.

Estado: discorda de alguma → **em conflito**; concorda com alguma ou foi confirmada pelo
apicultor → **conferida**; sem com quem comparar → **não conferida**.

**Por quê.** A última regra substitui o `voltou-no-tempo` da 002, que comparava com o
`MAX(t_utc_ms)` de âncoras confiáveis e travava o acerto do relógio por meses sem saída
(achado orquestrador:1). Agora vira conflito, que tem saída (D-308).

**Suposição.** Tolerância provisória (spec, Assumptions).

---

## D-307 — Decidir o envio da hora antes de transferir

**Decisão.** O contrato manda `setTime` **antes** de `pullReadings`. Nesse momento a leitura
`seq_ref` ainda não chegou, então a referência nova é atribuída por **hipótese**: se o
contador agora é maior que o da última leitura gravada, é a mesma ligada dela; senão, é uma
ligada nova. Com a hipótese, roda a mesma conferência. Conflito → não envia (FR-010).

Depois da transferência, a avaliação completa decide. Se a hipótese caiu (as leituras
mostraram um reinício e a referência é da ligada nova), não há conflito: o estado do relógio
fica `adiado` — nenhum aviso, e a próxima coleta acerta.

**Rejeitado.** Acertar o relógio depois da transferência: muda a ordem do contrato da 001
(`contracts/transport.md`), que é o que o grupo do firmware espera.

---

## D-308 — "Sim, está certa" religa ao nó

**Decisão.** "Sim" grava a decisão, revoga as referências que discordam da referência da
coleta (mesma ligada, ou hora no futuro dela), reavalia as horas e tenta **acertar o relógio
na hora**: procura o nó (só ele, 5 s), conecta, `setTime`, fecha. Se não alcançar, nada se
perde: a referência confirmada já não está em conflito, e a próxima coleta acerta (SC-002).
"Não" só grava a decisão.

**Por quê.** US2, cenário 2: "o relógio do nó é acertado na mesma hora".

---

## D-309 — Migração por `PRAGMA user_version`

**Decisão.** `src/data/migracoes.ts` com uma lista ordenada. Cada migração roda numa
transação que termina com `PRAGMA user_version = N` (o cabeçalho do banco é transacional:
falhou, volta tudo). A versão 1 é o DDL da 001 (`CREATE IF NOT EXISTS`), então um banco já
instalado (versão 0 com tabelas) passa por ela sem mudança. A versão 2 é a 003:

1. reconstrói `reading` com `t_utc_ms` anulável e três colunas novas (`t_motivo`, `boot_no`,
   `clock_mode`), copiando **todas** as linhas e conferindo, antes de remover a cópia velha,
   que a contagem bate e que `SELECT … EXCEPT SELECT …` sai vazio — senão lança e desfaz;
2. reconstrói `clock_anchor` com `id` próprio e as colunas de referência;
3. cria `referencia_revogada`, `hora_decisao`, `hora_versao`, `hora_correcao` e a VIEW;
4. reavalia as horas de todos os nós (FR-015), **na mesma transação**: se a reavaliação
   falhar, o banco continua na versão 1, e não numa 2 com horas antigas valendo.

Os três drivers chamam a mesma `prepararBanco(db)`.

**Por quê reconstruir.** SQLite não tem `ALTER COLUMN`; tirar o `NOT NULL` de `t_utc_ms` só
recriando a tabela. A justificativa frente ao Princípio III está em `plan.md`, Complexity
Tracking.

---

## D-310 — Mock com linha do tempo fixa

**Decisão.** `ConfigNoSimulado.ligadoEmMs` (opcional): o nó "ligou" naquele instante do
relógio **real**, mede a cada período, guarda os últimos `dias` dias, e o contador no momento
da conexão é o tempo desde que ligou. O relógio do **celular** (`agora`) é outro, e pode estar
errado. As colmeias de demonstração usam isso, e a semente grava o histórico e a referência
pela mesma linha do tempo.

**Por quê.** No modo antigo a última leitura é sempre "agora". Com a conferência, a coleta de
demonstração feita no dia seguinte ao da semente acusaria um conflito falso (o nó "contou"
menos do que o celular). Os testes antigos continuam no modo antigo (sem `ligadoEmMs`).

**Falhas novas:** `perdeuEnergiaEm` (fração da série, modo antigo) e `perdeuEnergiaEmMs`
(instante, modo linha do tempo) fazem o contador recomeçar do zero, com salto de `seq` de 64
(a numeração continua, como a suposição da pergunta 5). `semNocaoDeTempo` manda contador `0`
em toda leitura e `clockMode: 'none'` (FR-016).

---

## D-311 — Os três modos de tempo do nó (FR-008)

| Modo | Hora da leitura | Qualidade |
|---|---|---|
| `uptime` | referência mais próxima da mesma ligada | da referência |
| `rtc` | `t_node × 1000` (o nó carimba a hora que recebeu) | a do acerto anterior da mesma ligada; sem acerto conhecido, desconhecida; acerto revogado, desconhecida (FR-007) |
| `none` | nenhuma | desconhecida, motivo `sem-nocao-de-tempo` |

Leituras anteriores à 003 não têm `clock_mode`; são tratadas como `uptime`, o único modo que o
app conhecia. A referência de uma coleta em modo `none` é guardada e nunca usada.

No modo `rtc` o "contador" é o relógio do nó, que **salta** a cada acerto. Por isso: o acerto
grava como contador a própria hora enviada; uma coleta só é conferida com o **último acerto
antes dela** (o relógio do nó contou o tempo desde ali); dois acertos não se conferem entre si
(seria a hora do celular contra ela mesma); e a coleta com o relógio do nó ainda em 1970 é
rejeitada como referência. O mock não simula `rtc`; a regra é coberta por teste puro.

---

## D-312 — O que a nuvem recebe

**Decisão.** `loteNaoEnviado` passa a ler da VIEW: manda a hora **efetiva** e a qualidade
efetiva. `LeituraParaEnvio.tUtcMs` passa a `number | null`.

**Limite assumido.** A leitura é enviada uma vez. Uma correção feita depois do envio **não
sobe**. Fazer correções atravessarem a fronteira é trabalho da 002 (servidor), registrado como
pendência.

---

## D-313 — Dados anteriores à 003 (FR-015)

- Âncoras antigas viram referências de origem `legado`, cada uma o seu próprio grupo.
- `seq_ref` é inferido: o maior `seq` com o mesmo `t_node` da âncora (a âncora antiga era a
  última leitura da coleta). Sem leitura correspondente, a referência fica sem ligada.
- Âncora antiga com `trusted = 0` (celular implausível, nó sem noção de tempo, e a semente
  antiga de demonstração) é **rejeitada**: não serve de referência. As leituras dela ficam
  sem hora até uma coleta nova trazer referência da mesma ligada.

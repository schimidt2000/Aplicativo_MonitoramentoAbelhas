# Feature Specification: Hora confiável das leituras

**Feature Branch**: `feat/003-hora-das-leituras`

**Created**: 2026-10-14

**Status**: Implementada e integrada em integracao/2026-10-21 (2026-10-21)

**Input**: User description: "Hora confiável das leituras quando o nó sensor não tem relógio
próprio. O grupo do firmware informou (2026-10-14) que a placa não marca a hora sozinha e
recebe a hora do celular a cada coleta. A revisão adversarial da coleta encontrou três
problemas no modelo de hora: (1) leituras de antes de o nó perder energia recebem a hora da
ligada atual e saem marcadas como confiáveis; (2) celular com data adiantada na primeira
coleta vira referência confiável e depois bloqueia o acerto do relógio, sem recuperação;
(3) nó sem noção de tempo recebe o selo 'estimada' sem estimativa nenhuma."

## Clarifications

### Session 2026-10-21

- Q: Quem resolve um conflito entre a hora do celular e o tempo contado pelo nó? → A: O
  apicultor, confirmando no celular a data e a hora mostradas em destaque (FR-011).
- Q: Leitura sem hora calculável recebe hora estimada? → A: Não. Hora em branco, com motivo
  (FR-016). A confirmar com as pesquisadoras, sem bloquear o plano.

### Emenda 2026-10-21 (feature 005, decisão do dono do produto, João)

- Q: A FR-016 proíbe estimar a hora "pela posição na sequência". Vale para a placa do
  firmware de 2026-10-21? → A: **Não; a FR-016 é emendada.** Justificativa: (1) esse firmware
  **não grava hora por medição** — o arquivo tem só a hora de início e as medições numeradas a
  partir de 0 (`teste_de_firmware.ino`, commit `e93f8ad`), então sem a posição não existe hora
  nenhuma; (2) o próprio grupo do firmware **pediu** esse cálculo (áudio 1: "o tempo da medição
  0 é o timestamp; o da medição 1 é o timestamp + 2 horas… se a gente fosse fazer isso dentro
  do ESP32 ia ficar muito pesado"). A emenda não afrouxa a regra de ouro da FR-004: a hora pela
  posição é **sempre "estimada"**, e só existe quando a conferência contra a hora do fim da
  coleta fecha; quando não fecha (medições a mais por botão apertado sem coleta, ou a menos por
  falta de energia), a leitura fica **sem hora**, com motivo. Regras exatas em
  `specs/005-coleta-pelo-cabo/spec.md`, FR-015 a FR-019. O contador por "segundos desde que
  ligou" desta feature continua sem estimativa pela posição.

## Contexto

A hora de uma leitura é o que permite à pesquisadora dizer "a colmeia esquentou às 14h do
dia 3". Uma hora errada que **parece** certa é pior que uma hora ausente: entra na análise
sem levantar suspeita e só é descoberta, se for, meses depois.

O nó sensor não tem relógio próprio. Ele só conta o tempo desde que ligou, e essa contagem
recomeça do zero toda vez que a energia acaba. A única fonte de hora de verdade é o celular
do apicultor, no momento da coleta. Esta feature define **quando** o app pode afirmar a hora
de uma leitura, **com que grau de certeza**, e **o que fazer** quando a hora do celular não
merece confiança.

Ela corrige três defeitos encontrados na revisão de 2026-10-14 (ver `docs/integracao-firmware.md`):

1. **Hora errada com selo de certa.** Hoje todas as leituras de uma coleta recebem a hora
   calculada pela referência da ligada atual, inclusive as medidas antes de a bateria acabar.
2. **Sem recuperação de celular adiantado.** Uma data errada na primeira coleta de um nó vira
   referência confiável e bloqueia o acerto do relógio daquela colmeia por meses.
3. **"Estimada" sem estimativa.** Para um nó sem noção de tempo, o app só troca o selo.

## User Scenarios & Testing *(mandatory)*

### User Story 1 - Nenhuma hora errada com selo de certa (Priority: P1)

A bateria do nó acaba numa terça. O apicultor troca a bateria na sexta e coleta no sábado.
As leituras de antes da terça e as de depois da sexta chegam juntas. A pesquisadora recebe as
de depois da sexta com hora confiável, e as de antes da terça **ou** com hora confiável
(quando o app tem como saber) **ou** marcadas claramente como sem hora conhecida — nunca com
uma hora errada apresentada como certa.

**Why this priority**: É o único dos três defeitos que corrompe a análise em silêncio. O
nó sem relógio e sem bateria de reserva perde a contagem a cada falta de energia, então isso
vai acontecer em campo, não é caso raro.

**Independent Test**: Com a fonte simulada, um nó que "perde energia" entre duas coletas.
Conferir a qualidade da hora de cada leitura antes e depois da falta de energia.

**Acceptance Scenarios**:

1. **Given** um nó que reiniciou depois da última coleta e leituras de antes e depois do
   reinício, **When** o apicultor coleta, **Then** só as leituras da ligada atual recebem
   hora calculada pela referência desta coleta.
2. **Given** leituras de uma ligada anterior que já tinha sido conferida numa coleta
   passada, **When** elas chegam, **Then** recebem hora calculada pela referência daquela
   ligada, com a qualidade dela.
3. **Given** leituras de uma ligada que nenhuma coleta conferiu, **When** elas chegam,
   **Then** são guardadas, contadas e marcadas como sem hora conhecida, e ficam fora de
   gráficos e resumos diários.
4. **Given** o nó ainda não manda o número da ligada em cada leitura, **When** o contador de
   tempo de uma leitura é menor que o da leitura anterior, **Then** o app trata isso como
   reinício e aplica os cenários 1 a 3.

---

### User Story 2 - Celular com a data errada (Priority: P1)

O celular do apicultor está com a data adiantada um ano. Ele coleta. Na visita seguinte, já
com a data certa, o app percebe que as duas datas não batem com o tempo que o próprio nó
contou entre as duas visitas. O app não manda nenhuma das duas horas ao nó até o conflito ser
resolvido, avisa o apicultor em palavras simples e oferece um caminho de saída.

**Why this priority**: Hoje o conflito trava o acerto do relógio daquela colmeia por meses,
com um aviso que manda o apicultor "conferir a data" que ele já conferiu.

**Independent Test**: Duas coletas simuladas do mesmo nó, a primeira com o relógio do celular
adiantado. Conferir o aviso, a recuperação e a qualidade das horas das duas coletas.

**Acceptance Scenarios**:

1. **Given** duas coletas da mesma ligada em que o tempo segundo o celular e o tempo segundo
   o nó divergem além da tolerância, **When** a segunda coleta termina, **Then** o app não
   manda hora ao nó, marca as horas da coleta como estimadas e mostra um aviso com a data e a
   hora que o celular informa.
2. **Given** o conflito do cenário 1, **When** o apicultor confirma que a data e a hora
   mostradas estão certas, **Then** as referências daquela ligada que discordam da atual
   deixam de valer, as horas derivadas delas são recalculadas pela referência confirmada sem
   alterar as leituras originais, e o relógio do nó é acertado na mesma hora.
3. **Given** o conflito do cenário 1, **When** o apicultor diz que a data não está certa,
   **Then** nada é revogado, as horas da coleta continuam estimadas, e o aviso diz para
   acertar a data do celular e coletar de novo.
4. **Given** uma data do celular anterior ao início do projeto, **When** o apicultor coleta,
   **Then** a hora não é enviada ao nó e o aviso diz o que fazer (comportamento já entregue,
   mantido).

---

### User Story 3 - Leituras sem hora calculável (Priority: P2)

Um nó sem nenhuma noção de tempo, ou leituras de uma ligada que nunca foi conferida. A
pesquisadora precisa saber exatamente quantas são, por quê, e o que o app fez com elas.

**Why this priority**: Depende do que o firmware entregar (pergunta 6). Se o nó mandar o
tempo desde que ligou e o número da ligada, este caso fica raro.

**Independent Test**: Fonte simulada no modo "sem noção de tempo". Conferir a exportação e
os gráficos.

**Acceptance Scenarios**:

1. **Given** leituras sem hora calculável, **When** são gravadas, **Then** ficam com a hora
   em branco e o motivo (ligada sem referência, ou nó sem noção de tempo). Nenhuma hora é
   inventada.
2. **Given** leituras sem hora conhecida, **When** a pesquisadora exporta, **Then** elas vêm
   na planilha, com o motivo, e o cabeçalho diz quantas são.

---

### User Story 4 - A pesquisadora vê o grau de certeza da hora (Priority: P2)

Na planilha e no painel, cada leitura diz, em palavra, se a hora é **ancorada** (calculada a
partir do celular na mesma ligada), **estimada** ou **desconhecida**. O cabeçalho da planilha
diz quantas leituras há de cada tipo, e o gráfico diferencia trechos estimados.

**Why this priority**: Sem isso, as correções das histórias 1 a 3 ficam invisíveis para quem
analisa.

**Independent Test**: Exportar uma colmeia com leituras dos três tipos e conferir colunas,
cabeçalho e gráfico.

**Acceptance Scenarios**:

1. **Given** uma colmeia com leituras ancoradas, estimadas e desconhecidas, **When** a
   pesquisadora exporta, **Then** cada linha traz a qualidade em palavra e o cabeçalho traz
   as três contagens, que somam o total.
2. **Given** um período com hora estimada, **When** o gráfico é desenhado, **Then** o trecho
   aparece diferente do ancorado sem depender só da cor.

---

### User Story 5 - Corrigir depois, sem reescrever (Priority: P3)

Quando uma referência de hora se revela errada, ou quando chega a informação que faltava
(por exemplo, o número da ligada), o app recalcula as horas afetadas. A leitura original
continua intacta e a correção fica registrada à parte, com data e motivo.

**Why this priority**: É o que torna as histórias 1 e 2 reversíveis. Sem isso, cada erro de
hora é para sempre.

**Independent Test**: Revogar uma referência e conferir que as leituras originais não mudaram
e que a exibição e a exportação mostram a hora corrigida e o motivo.

**Acceptance Scenarios**:

1. **Given** leituras cuja hora veio de uma referência revogada, **When** a referência é
   revogada, **Then** a exibição e a exportação passam a mostrar a hora recalculada (ou
   "desconhecida"), com o motivo, e nenhuma leitura original é alterada.
2. **Given** leituras gravadas antes desta feature, **When** ela é instalada, **Then** essas
   leituras são reavaliadas pelas mesmas regras, por correção à parte.

---

### Edge Cases

- **Contador do nó volta a zero sem falta de energia**, por estouro: o contador de
  milissegundos de 32 bits do ESP32 estoura em cerca de 49,7 dias. Com o número da ligada,
  é estouro na mesma ligada. Sem ele, é tratado como reinício (o lado seguro).
- **Duas coletas no mesmo dia por celulares diferentes** com relógios diferentes: a
  conferência da história 2 pega a divergência.
- **Coleta sem nenhuma leitura nova**: a referência de hora é registrada mesmo assim, e serve
  para conferir as próximas.
- **Leitura com contador maior que o do nó no momento da coleta**: não pode ser desta ligada.
- **Deriva do relógio interno do nó** ao longo de semanas sem coleta: o erro de hora cresce
  com a distância até a referência. Por isso a hora usa a referência mais próxima da mesma
  ligada.
- **Nó que passa a carimbar a hora sozinho** depois de receber a hora do celular: essa hora
  vale tanto quanto o acerto que a originou, e é corrigida se o acerto for revogado.
- **Apicultor ignora o aviso de conflito**: as coletas seguem com hora estimada até alguém
  resolver. Nada se perde.

## Requirements *(mandatory)*

### Functional Requirements

**Ligadas do nó**

- **FR-001**: O sistema MUST associar cada leitura à ligada do nó em que ela foi medida,
  usando o número da ligada que o nó envia em cada leitura.
- **FR-002**: Enquanto o nó não enviar esse número, o sistema MUST detectar reinício pela
  regressão do contador de tempo: uma leitura com número de sequência maior e contador menor
  que a anterior, inclusive comparando com a última leitura da coleta passada.
- **FR-003**: Uma leitura cujo contador de tempo seja maior que o contador do nó no momento
  da coleta MUST NOT ser considerada da ligada atual.
- **FR-004**: Na dúvida sobre a ligada de uma leitura, o sistema MUST tratá-la como de ligada
  desconhecida. Errar para "sem hora" é aceitável; errar para "hora certa" não é.

**Hora de cada leitura**

- **FR-005**: Uma leitura só MUST receber hora **ancorada** se pertencer a uma ligada com ao
  menos uma referência confiável, e a hora MUST ser calculada pela referência confiável mais
  próxima dentro da mesma ligada.
- **FR-006**: Toda vez que o celular acerta o relógio do nó com sucesso, o sistema MUST
  registrar esse acerto como referência de hora: a hora enviada e o contador do nó naquele
  instante.
- **FR-007**: Quando o nó carimbar leituras com uma hora que recebeu de um celular, a
  qualidade dessa hora MUST ser a do acerto que a originou, e MUST ser corrigida se esse
  acerto for revogado.
- **FR-008**: O sistema MUST funcionar nos três modos de tempo do nó: hora carimbada pelo nó,
  contador desde que ligou, e nenhuma noção de tempo. Nenhum modo pode impedir a coleta.
  *(Acréscimo de 2026-10-21, feature 005: um quarto modo, "contagem" — hora de início do
  arquivo + número da medição —, com as regras da FR-016 emendada.)*

**Conferência da hora do celular**

- **FR-009**: Entre duas coletas da mesma ligada, o sistema MUST comparar o tempo decorrido
  segundo o celular com o tempo decorrido segundo o contador do nó. Uma divergência acima da
  tolerância (ver Assumptions) MUST ser tratada como conflito de hora.
- **FR-010**: Em conflito de hora, o sistema MUST NOT enviar hora ao nó, MUST marcar as
  horas da coleta como estimadas, e MUST mostrar ao apicultor um aviso que diz, em palavras
  simples, a data e a hora que o celular informa e o que fazer.
- **FR-011**: A recuperação de um conflito MUST ser feita pelo apicultor, na tela de
  resultado da coleta: o app mostra a data e a hora do celular em destaque e pergunta se
  estão certas. "Sim" revoga as referências da mesma ligada que discordam da atual e acerta o
  relógio do nó. "Não" não muda nada. A pergunta MUST reaparecer a cada coleta enquanto o
  conflito existir, e a decisão MUST ficar registrada com data e hora.
- **FR-012**: A primeira referência de uma ligada, que não tem com o que ser conferida, MUST
  ser aceita apenas se estiver dentro do período do projeto, e MUST ficar registrada como
  **não conferida** até uma coleta seguinte concordar com ela.

**Correção sem reescrever**

- **FR-013**: Uma referência revogada MUST deixar de valer para calcular horas e para conferir
  coletas. O registro dela MUST continuar guardado, com a marca de revogada, quando e por quê.
- **FR-014**: As horas derivadas de uma referência revogada, ou recalculadas por informação
  nova, MUST ser corrigidas por um registro de correção à parte, aplicado na exibição e na
  exportação. A leitura original MUST NOT ser alterada (Princípio III).
- **FR-015**: Leituras gravadas antes desta feature MUST ser reavaliadas pelas regras
  FR-001 a FR-005, por correção à parte.

**Leituras sem hora conhecida**

- **FR-016** *(emendada em 2026-10-21, ver Clarifications)*: Para uma leitura sem hora
  calculável, o sistema MUST deixar a hora em branco, com o motivo, e MUST NOT estimá-la pela
  posição na sequência — **exceto** no nó que grava só a hora de início do arquivo e numera as
  medições (modo "contagem", firmware de 2026-10-21): ali a hora MUST ser início + número ×
  intervalo, sempre "estimada", e só quando a conferência contra a hora do fim da coleta fecha
  (feature 005, FR-015 a FR-019); quando não fecha, em branco com motivo. "Estimada" fica
  reservada à hora calculada a partir de uma referência que não pôde ser conferida ou que está
  em conflito, e à contagem conferida da feature 005.
- **FR-017**: Leitura sem hora conhecida MUST NOT ser descartada, MUST ficar fora de gráficos
  e de resumos diários, e MUST ser contada ao lado deles.

**Transparência**

- **FR-018**: A exportação MUST trazer a qualidade da hora de cada leitura em palavra
  (ancorada, estimada, desconhecida), e o cabeçalho MUST trazer as contagens de cada uma.
- **FR-019**: Gráficos MUST distinguir trechos de hora estimada dos de hora ancorada por um
  meio que não seja só a cor.
- **FR-020**: Para o apicultor, a qualidade da hora MUST NOT aparecer como problema. Ele só
  vê aviso quando há algo que ele pode fazer, como no conflito de data.

### Key Entities

- **Ligada do nó**: o período entre uma energização do nó e a próxima falta de energia.
  Identificada pelo número que o nó envia ou, na falta dele, inferida pela regressão do
  contador.
- **Leitura**: ganha a ligada a que pertence e a qualidade da hora. O contador bruto e os
  valores medidos continuam imutáveis.
- **Referência de hora (âncora)**: a correspondência entre a hora do celular e o contador do
  nó. Origem: coleta ou acerto do relógio. Estado: não conferida, conferida, revogada (com
  quando e por quê).
- **Correção de hora**: registro à parte que diz que a hora de um conjunto de leituras passa
  a ser outra (ou desconhecida), com o motivo e a data. É aplicado na exibição e na
  exportação.
- **Conflito de hora**: a divergência entre o tempo do celular e o tempo do nó entre duas
  coletas, com o estado de resolução.

## Success Criteria *(mandatory)*

### Measurable Outcomes

- **SC-001**: Num teste com um nó que perde energia entre coletas, zero leituras de uma
  ligada sem referência saem com hora ancorada.
- **SC-002**: Com o celular adiantado um ano na primeira coleta e certo na segunda, a
  terceira coleta volta a acertar o relógio do nó, com no máximo uma ação de alguém.
- **SC-003**: Em 100% das linhas exportadas a qualidade da hora aparece em palavra, e as
  contagens do cabeçalho somam o total de linhas.
- **SC-004**: Nenhum gráfico e nenhum resumo diário inclui leitura sem hora conhecida.
- **SC-005**: Revogar uma referência e recalcular as horas deixa todas as leituras originais
  idênticas, campo a campo, ao que eram antes.
- **SC-006**: Mostrado o aviso de conflito de data, três pessoas sem instrução prévia dizem
  corretamente o que fazer, as três.

## Assumptions

- **O firmware vai mandar, em cada leitura, os segundos desde que a placa ligou e o número da
  ligada** (pergunta 6 do questionário). **Não confirmado.** Sem o número da ligada, vale a
  detecção por regressão do contador (FR-002), que não distingue um estouro de um reinício.
- **Tolerância da conferência:** 10 minutos mais 1% do intervalo entre as coletas.
  Provisória: o oscilador do ESP32 pode derivar mais durante o sono profundo, e o número
  certo sai de uma medição na sessão de teste com o grupo do firmware.
- **O celular é a única fonte de hora.** Não há GPS no nó nem rede em campo. A hora do
  celular costuma vir da operadora, mas nada garante isso.
- **Toda hora é guardada em UTC.** O fuso só entra na exibição. O Brasil não tem horário de
  verão desde 2019.
- **O início do projeto é 01/09/2026**, o mesmo piso já usado pelo app.
- **Fora do escopo:** mudar o firmware; obter hora por GPS ou internet no nó; corrigir a
  hora das leituras dentro do nó.
- **Depende de** `001-coleta-offline` (coleta, referências de hora e envio da hora ao nó,
  já entregues) e conversa com `002-envio-e-painel` (planilha e painel mostram a qualidade).

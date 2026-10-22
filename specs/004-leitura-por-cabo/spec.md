# Feature Specification: Leitura da placa pelo cabo, ao vivo (monitor de bancada)

**Feature Branch**: `feat/004-leitura-por-cabo`

**Created**: 2026-10-21

**Status**: Implementada — falta a verificação com a placa real na bancada (T024)

**Input**: User description: "Ler a placa pelo cabo, ao vivo, no navegador do computador
(bancada). O grupo do firmware tem um código de bancada rodando numa Seeed XIAO ESP32-C6 que
imprime no Serial, a 115200 baud, uma linha por segundo (`T=34.52C RH=61.20% Status=0 AQI=2
TVOC=180ppb eCO2=650ppm`), além de linhas de texto livre. Essas linhas não têm identificador
da placa nem número da leitura, então não podem entrar na tabela de leituras. A tela é um
monitor: mostra ao vivo e não grava leituras."

## Contexto

O grupo do firmware já tem uma placa funcionando na bancada, mas só enxerga o que ela mede
pelo Monitor Serial da IDE do Arduino: texto rolando, sem gráfico, sem como comparar com um
termômetro ao longo de uma hora. As duas perguntas mais importantes da sessão de teste
conjunta (`docs/integracao-firmware.md`) dependem exatamente disso:

1. **O sensor de gás aquece o sensor de temperatura?** Nas placas combinadas, o aquecedor do
   sensor de gás pode empurrar a temperatura +4 a +6 °C para cima. Só se descobre olhando a
   temperatura da placa ao lado de um termômetro, por vários minutos, desde a partida.
2. **Quanto tempo o sensor de gás leva para ficar pronto de verdade?** O código de bancada
   espera um cronômetro de 3 minutos, mas quem diz se ele está pronto é o próprio sensor
   (`Status`). A primeira partida pode levar cerca de 1 hora.

Esta feature dá a esse grupo, e a nós, uma tela que lê a placa pelo cabo USB, no navegador do
computador, e mostra ao vivo o que ela manda. **Ela não grava leitura nenhuma no aplicativo.**

### Por que esta tela não grava

A série de leituras é o produto científico do projeto e tem regra dura (Princípio III): cada
leitura é identificada pelo nó sensor que a mediu e pelo número dela nesse nó. É isso que
torna a coleta repetível sem duplicar nada.

As linhas do código de bancada **não trazem nem uma coisa nem outra**: não dizem qual placa
mediu, nem qual é o número daquela leitura. Gravar essas linhas exigiria inventar os dois — e
uma chave inventada é exatamente o que gera duplicata silenciosa ou perda de leitura, meses
depois. A hora também seria só a hora em que a linha chegou ao computador, porque a placa não
tem relógio.

Por isso a tela é um **monitor**: mostra, desenha, e no máximo deixa a pessoa **baixar uma
planilha do que foi visto**, que é um arquivo dela, fora do banco do aplicativo.

### O caminho para gravar, quando o firmware permitir

Quando a placa passar a mandar, em cada leitura, **um identificador estável da placa**, **o
número da leitura** e **a versão do formato**, a leitura por cabo deixa de ser monitor e vira
um transporte `cable` de verdade, igual ao simulado e ao futuro Bluetooth:

- o formato novo entra como mais uma linha na tabela `versão → decodificador`, ao lado de
  `bancada-0`, sem mexer nas telas;
- o transporte `cable` implementa a mesma interface `Transport` da coleta (com
  `pullReadings` retomável pelo número da leitura) e a coleta passa a gravar pelo mesmo
  caminho de sempre, com a carga bruta guardada;
- esta tela continua existindo como diagnóstico de bancada.

Isso é uma feature futura, com spec própria. Esta não a antecipa.

## User Scenarios & Testing *(mandatory)*

### User Story 1 - Ver a placa ao vivo pelo cabo (Priority: P1)

Uma pessoa do grupo do firmware liga a placa no computador com um cabo USB, abre o app de
campo no navegador (Chrome ou Edge), vai em Ajustes → Diagnóstico de conexão → "Ler a placa
pelo cabo" e toca em **Conectar pelo cabo**. O navegador mostra a lista de portas, ela escolhe
a placa, e a tela passa a mostrar, a cada segundo, a temperatura, a umidade e os voláteis em
números grandes, e se o sensor de gás está pronto ou aquecendo.

**Why this priority**: É o mínimo que substitui o Monitor Serial e permite a primeira
conversa útil na sessão de teste.

**Independent Test**: Com uma placa rodando o código de bancada (ou qualquer fonte que
escreva as linhas de exemplo numa porta serial), conectar e conferir que os números mudam a
cada segundo e batem com o texto que a placa manda.

**Acceptance Scenarios**:

1. **Given** um navegador com acesso à porta serial e a placa ligada, **When** a pessoa toca
   em Conectar pelo cabo e escolhe a placa, **Then** em até 3 segundos aparecem temperatura
   (1 casa decimal), umidade (sem casa decimal) e Voláteis (COVs) da linha mais recente.
2. **Given** uma linha com `Status=1 (WARMUP)`, **When** ela chega, **Then** a tela mostra
   "Sensor de gás aquecendo" com ícone e cor, e não só cor.
3. **Given** uma linha com `eCO2=650ppm`, **When** ela chega, **Then** o valor aparece apenas
   rotulado como "eCO₂ estimado — não é CO₂", em tamanho menor que os voláteis.
4. **Given** a tela conectada, **When** a pessoa toca em Desconectar, **Then** a porta é
   liberada (outro programa pode abri-la) e o que já apareceu continua na tela.
5. **Given** a tela aberta em qualquer estado, **Then** um aviso fixo diz que nada do que
   aparece ali é gravado no aplicativo.
6. **Given** uma linha com o sensor de gás ainda não pronto (`Status` diferente de 0),
   **When** ela chega, **Then** os voláteis não ganham número grande: aparece "—" e uma frase
   dizendo que o sensor ainda não está pronto e qual valor a placa mandou.

---

### User Story 2 - Acompanhar os últimos minutos e o que a placa disse (Priority: P1)

Durante o teste do aquecimento, a pessoa quer ver a curva da temperatura dos últimos minutos,
e quer ver as mensagens que a placa imprime ("AHT20 OK", "Falha ao iniciar ENS160…",
"Aguardando estabilizacao do ENS160 (~3 min)...") sem precisar de outra janela.

**Why this priority**: O teste do aquecimento é uma curva, não um número. E as mensagens de
texto são o único jeito de saber por que a placa parou.

**Independent Test**: Deixar a tela conectada por 5 minutos com o sensor de gás passando de
aquecendo para pronto; conferir a curva e o registro de mensagens.

**Acceptance Scenarios**:

1. **Given** leituras chegando, **When** a pessoa escolhe Temperatura, Umidade ou Voláteis,
   **Then** o gráfico mostra os últimos 5 minutos daquela grandeza.
2. **Given** um trecho em que o sensor de gás não estava pronto (`Status` diferente de 0),
   **When** o gráfico de **voláteis** é desenhado, **Then** aquele trecho aparece como
   **lacuna**, e a legenda diz o porquê. Nos gráficos de temperatura e umidade o mesmo
   trecho aparece como **faixa sombreada** "sensor de gás não pronto", sem interromper a linha
   (ver Assumptions).
3. **Given** um intervalo de mais de 3 segundos sem leitura (linha perdida, placa
   reiniciando), ou uma linha ilegível ou uma mensagem de texto da placa (ex.: "Erro na
   leitura do AHT20 (CRC/timeout)") entre duas leituras, **When** o gráfico é desenhado,
   **Then** a linha também quebra ali. Nunca se liga um ponto ao outro por cima do que não
   chegou.
4. **Given** linhas de texto livre da placa, **When** elas chegam, **Then** aparecem num
   registro com a hora do computador, a mais recente em cima.
5. **Given** uma linha que não é leitura nem texto legível (lixo, linha cortada), **When**
   ela chega, **Then** a tela continua funcionando, conta a linha como ilegível e a mostra no
   registro marcada como tal.

---

### User Story 3 - Levar o que foi visto numa planilha (Priority: P2)

Ao fim do teste com o termômetro, a pessoa toca em **Salvar o que foi visto** e o navegador
baixa uma planilha com todas as leituras da sessão, que abre direto no Excel ou no LibreOffice
em português, com vírgula decimal.

**Why this priority**: É o que transforma uma hora de bancada num resultado que dá para
comparar com o termômetro, guardar e mostrar. Não é necessário para ver ao vivo.

**Independent Test**: Conectar, deixar 1 minuto, salvar, abrir o arquivo numa planilha em
pt-BR e conferir colunas, acentos e números.

**Acceptance Scenarios**:

1. **Given** uma sessão com leituras, **When** a pessoa toca em Salvar o que foi visto,
   **Then** o navegador baixa um arquivo `.csv` separado por ponto e vírgula, com vírgula
   decimal, que abre com acentos corretos.
2. **Given** a planilha baixada, **Then** o cabeçalho diz de onde vieram os dados, que nada
   foi gravado no aplicativo, que o eCO₂ é estimado e não é CO₂, e quantas leituras tinham o
   sensor de gás fora do normal.
3. **Given** a planilha, **Then** cada linha traz a hora do computador em UTC e em hora
   local, os valores como a placa mandou e a linha original sem alteração.
4. **Given** uma sessão sem leitura nenhuma, **Then** o botão Salvar o que foi visto não
   aparece, e uma frase diz que ainda não chegou leitura.

---

### User Story 4 - Onde não dá, dizer o que fazer (Priority: P1)

O apicultor abre a mesma tela no celular Android, ou alguém abre no Safari ou no Firefox. A
tela não mostra botão que não funciona: explica, em português, que a leitura pelo cabo
precisa do Chrome ou do Edge num computador.

**Why this priority**: Princípio IV — botão inerte ou erro genérico não podem aparecer. O app
de campo roda em celular, e é ali que alguém vai tocar no link por curiosidade.

**Independent Test**: Abrir a tela no app Android, no Firefox e no Safari.

**Acceptance Scenarios**:

1. **Given** o app instalado no celular, **When** a tela abre, **Then** ela diz que esta
   leitura é só para o computador, com Chrome ou Edge, e que a coleta no celular é pela tela
   Coletar.
2. **Given** um navegador sem acesso a porta serial, **When** a tela abre, **Then** ela diz
   para abrir o mesmo endereço no Chrome ou no Edge de um computador.
3. **Given** a página aberta por um endereço não seguro (sem `https`, fora do próprio
   computador), **When** a tela abre, **Then** ela explica que o navegador só libera a porta
   em endereço seguro.

---

### User Story 5 - Problemas de conexão dizem o que fazer (Priority: P2)

A porta está ocupada pelo Monitor Serial da IDE do Arduino; ou o cabo sai; ou a placa trava
no `while(1)` depois de não achar um sensor e para de mandar linhas. Em cada caso a tela diz
o que aconteceu e o que fazer, em português, sem código de erro.

**Why this priority**: São exatamente os três problemas que vão acontecer na primeira
sessão de teste.

**Independent Test**: Abrir a porta na IDE do Arduino e tentar conectar; puxar o cabo com a
tela conectada; ligar a placa sem o sensor de gás.

**Acceptance Scenarios**:

1. **Given** a porta aberta por outro programa, **When** a pessoa tenta conectar, **Then** a
   tela diz que a porta está ocupada e pede para fechar o outro programa.
2. **Given** a tela conectada, **When** o cabo sai, **Then** a tela diz que a placa foi
   desconectada, mantém o que já apareceu e oferece Conectar pelo cabo de novo.
3. **Given** a placa parou de mandar linhas por mais de 15 segundos, **When** isso acontece,
   **Then** a tela diz que a placa parou de responder, sugere olhar o registro e reiniciar a
   placa, e libera a porta.
4. **Given** a pessoa fechou a lista de portas sem escolher nenhuma, **Then** a tela diz que
   nenhuma placa foi escolhida e como encontrá-la na lista.

### Edge Cases

- **Uma linha chega partida em dois pedaços** pela porta (comum em USB): o app junta os
  pedaços antes de interpretar. Um caractere acentuado partido ao meio também.
- **Fim de linha `\r\n`** (padrão do `Serial.println`), só `\n` ou só `\r`: todas valem.
- **A porta perde bytes** (o navegador avisa: buffer cheio, ruído no cabo): a linha pela
  metade conta como ilegível e a leitura continua, sem desconectar. O gráfico quebra a linha
  ali, mesmo que a leitura seguinte chegue em menos de 3 segundos.
- **Linha cortada na conexão** (o app entra no meio de uma linha) ou na desconexão: é contada
  como ilegível, nunca vira leitura com campo faltando preenchido por zero.
- **Temperatura negativa** (`T=-3.25C`): é lida corretamente. Não acontece numa colmeia, mas
  acontece num teste de geladeira.
- **Sensor de temperatura sem número** (`T=nanC`, como o Arduino imprime quando a conta dá
  inválida): o valor fica em branco, com motivo; a leitura continua valendo para o gás.
- **Status do sensor de gás fora de 0 a 3**: é mostrado como "situação desconhecida" com o
  número, sem adivinhar.
- **Lixo na porta** (velocidade errada, mensagens de partida da placa): conta como ilegível,
  não trava nada.
- **Linha gigante sem fim de linha**: é cortada num limite e tratada como ilegível, para não
  crescer a memória sem fim.
- **Sessão muito longa**: a tela guarda no máximo as últimas 6 horas para a planilha e diz
  quando começou a descartar as mais antigas.
- **Placa reiniciada no meio**: o registro mostra as mensagens de partida de novo; o gráfico
  quebra a linha no intervalo.
- **Valor fora da faixa plausível de colmeia** (ex.: 60 °C): é mostrado como veio. Esta tela
  é bancada, e a bancada pode estar testando exatamente isso.

## Requirements *(mandatory)*

### Functional Requirements

**Leitura e interpretação**

- **FR-001**: O sistema MUST ler a placa por porta serial USB, a 115200 baud, no app de campo
  rodando no navegador do computador.
- **FR-002**: A interpretação das linhas MUST ser feita por um leitor versionado, escolhido
  por uma tabela `formato → leitor`. O único formato conhecido nesta feature é `bancada-0`.
- **FR-003**: O leitor `bancada-0` MUST devolver, para uma linha de leitura, os valores
  **brutos** em centésimos (temperatura e umidade), o status do sensor de gás, o índice de
  qualidade do ar, os voláteis e o eCO₂ como vieram, e uma marcação de "sensor de gás
  aquecendo" (status 1 ou 2).
- **FR-004**: Linha que não seja leitura completa MUST virar texto da placa ou linha
  ilegível. Nenhuma linha MUST NOT interromper a leitura das seguintes.
- **FR-005**: Valor ausente ou sem número MUST ficar em branco com motivo. Zero ou outro
  número no lugar de ausência MUST NOT acontecer.
- **FR-006**: O acesso à porta serial MUST existir só no pacote de transportes. A verificação
  de fronteira MUST reprovar uso da porta serial fora dele.

**Tela**

- **FR-007**: A tela MUST ser acessível a partir do Diagnóstico de conexão.
- **FR-008**: A tela MUST mostrar, com número grande, temperatura com 1 casa decimal, umidade
  sem casa decimal e "Voláteis (COVs)" em ppb. Enquanto o sensor de gás não está pronto
  (status diferente de 0), os voláteis MUST NOT ganhar número grande: "—" e uma frase com o
  valor que a placa mandou — "ainda não está pronto" para status 1 e 2, "não está em situação
  normal" para 3 ou desconhecido. O eCO₂, calculado a partir dos voláteis, também mostra "—"
  nesse período, com o valor que a placa mandou entre parênteses.
- **FR-009**: O eCO₂ MUST aparecer só rotulado como "eCO₂ estimado — não é CO₂", e em
  tamanho menor que os voláteis. CO₂ sozinho MUST NOT aparecer em tela nem na planilha.
- **FR-010**: O estado do sensor de gás MUST ser mostrado com palavra, ícone e cor: pronto,
  aquecendo, primeira partida, leitura inválida ou desconhecido.
- **FR-011**: A tela MUST avisar, perto da temperatura, que o sensor de gás ligado pode
  aquecer o sensor de temperatura.
- **FR-012**: A tela MUST mostrar um gráfico dos últimos 5 minutos da grandeza escolhida,
  sem biblioteca de gráfico, com **lacuna** onde o valor está em branco e onde passaram mais
  de 3 segundos sem leitura ou chegou uma linha ilegível ou uma mensagem de texto da placa
  entre duas leituras; nos
  **voláteis**, também onde o status do sensor de gás não é 0.
  O período com o sensor de gás não pronto MUST aparecer marcado nas três grandezas, com
  legenda. Interpolar por cima de lacuna MUST NOT acontecer.
- **FR-013**: A tela MUST mostrar um registro das linhas de texto e das linhas ilegíveis,
  com hora, a mais recente em cima, limitado às últimas 50.
- **FR-014**: A tela MUST mostrar, o tempo todo, um aviso de que nada dela é gravado no
  aplicativo.
- **FR-015**: A tela MUST NOT gravar leitura, sessão de coleta, âncora de relógio nem
  qualquer outra linha no banco do aplicativo.
- **FR-016**: Onde a porta serial não existir, a tela MUST explicar em pt-BR o motivo e a
  alternativa, e MUST NOT mostrar o botão Conectar pelo cabo.
- **FR-017**: Todo problema de conexão MUST dizer o que aconteceu e o que fazer em seguida.
- **FR-018**: Conectar e perder a conexão MUST dar retorno por texto e por som.

**Planilha**

- **FR-019**: O botão Salvar o que foi visto MUST baixar um `.csv` em UTF-8 com BOM,
  separado por ponto e vírgula, com vírgula decimal.
- **FR-020**: A planilha MUST ter cabeçalho de proveniência: origem (monitor pelo cabo, nada
  gravado), formato das linhas, sensores informados, eCO₂ declarado como derivado e não CO₂,
  a origem da hora, e as contagens de leituras, leituras com sensor de gás fora do normal e
  linhas ilegíveis.
- **FR-021**: Cada linha da planilha MUST trazer a hora de chegada em UTC e em hora local, os
  valores brutos como a placa mandou, e a linha original.

### Key Entities

- **Linha da placa**: um texto terminado em fim de linha, vindo da porta. Pode ser leitura,
  texto da placa, ilegível ou vazia.
- **Leitura vista**: o que o leitor extraiu de uma linha de leitura, mais a hora do
  computador em que ela chegou. **Não é uma leitura do banco**: não tem nó sensor nem número.
- **Sessão do monitor**: as leituras vistas e as mensagens desde que a tela abriu. Vive só na
  memória da tela e some ao sair dela.

## Success Criteria *(mandatory)*

### Measurable Outcomes

- **SC-001**: Com a placa ligada, a primeira leitura aparece em até 3 segundos depois de
  escolher a porta.
- **SC-002**: As 7 linhas de exemplo fornecidas pelo grupo do firmware são classificadas
  corretamente (2 leituras, 5 textos) por teste automatizado.
- **SC-003**: Nenhuma linha (cortada, lixo, gigante, vazia) derruba a leitura: teste
  automatizado com essas linhas termina sem exceção.
- **SC-004**: Depois de usar a tela por 1 hora, o banco do aplicativo tem exatamente o mesmo
  número de leituras que antes. Garantido por construção e verificado por teste: nenhum
  arquivo alcançável a partir da tela importa o módulo de dados.
- **SC-005**: A planilha de uma sessão de 1 hora (3.600 leituras) abre no LibreOffice e no
  Excel em pt-BR com acentos e vírgula decimal corretos, sem ajuste manual.
- **SC-006**: Em Android, Safari e Firefox, a tela não mostra nenhum botão que não funcione.

## Assumptions

- **O formato das linhas é exatamente o do código de bancada recebido em 2026-10-14**, com a
  ordem `T= RH= Status= [(TEXTO)] AQI= TVOC= eCO2=`, unidades `C`, `%`, `ppb`, `ppm`, e
  números com ponto decimal. **Não confirmado como contrato**: é o código atual, que vai
  mudar. Mudou o formato, é um leitor novo na tabela, não um ajuste no `bancada-0`.
- **As linhas não trazem versão.** A tela assume `bancada-0` para tudo o que chega pelo cabo
  nesta feature. Quando o firmware passar a mandar versão, a escolha do leitor passa a vir
  dela.
- **Significado do `Status` do sensor de gás** (ENS160): 0 normal, 1 aquecendo, 2 primeira
  partida, 3 inválido — conforme o datasheet e o código de bancada. "Aquecendo" na tela vale
  para 1 e 2.
- **O status do sensor de gás interrompe a linha só nos voláteis.** O pedido original dizia
  "lacuna onde o status não é 0" sem dizer em qual grandeza. Decidimos: nos voláteis, lacuna
  (enquanto aquece, o número do sensor de gás não é medição); na temperatura e na umidade,
  **faixa sombreada** com legenda, sem interromper a linha. Três motivos: (1) o `Status` é do
  sensor de gás, não do de temperatura; (2) o aquecedor do sensor de gás esquenta o de
  temperatura **também** com `Status=0` — o status não marca quando a temperatura é ou não
  confiável; (3) o teste que esta tela existe para fazer é justamente ver a temperatura subir
  enquanto o sensor de gás aquece, e com lacuna a curva sumiria exatamente ali (a primeira
  partida pode levar ~1 hora). É a mesma regra dos resumos diários da 001
  (`src/data/ingest.ts`: só as médias de gás excluem por status). Trocar é uma linha
  (`INTERROMPE_POR_STATUS_DO_GAS` em `src/core/bancada/serie.ts`).
- **Os voláteis aparecem como número em ppb nesta tela**, apesar de o glossário dizer
  "tendência, não número cru". O glossário fala da colmeia: lá o número só vale comparado com
  a própria colmeia. Aqui não há colmeia, há uma placa na bancada, e o grupo do firmware
  precisa ver o número que o sensor manda para saber se ele funciona. A tela diz isso embaixo
  do número, e nenhuma comparação entre placas ou colmeias é oferecida.
- **"Placa", não "nó sensor"**, nesta tela: é a placa de teste na mesa, ligada no computador,
  e é a palavra que o grupo do firmware usa. "Nó sensor" continua sendo o aparelho instalado
  na colmeia.
- **A hora é a do computador** no momento em que a linha chega. A placa não tem relógio.
- **A temperatura e a umidade na planilha vão com 2 casas, como a placa mandou.** A tela
  mostra 1 e 0 casas (Princípio VI). A planilha é registro bruto para teste de bancada (o
  mesmo motivo de o banco guardar o valor bruto), e a coluna diz "como veio".
- **A linha original vai na planilha sem alteração**, com uma exceção de segurança: se ela
  começar com `=`, `+`, `-` ou `@`, ganha um apóstrofo na frente, para a planilha não a
  executar como fórmula. Uma linha `bancada-0` começa com `T`, então na prática não muda.
- **Limite de 6 horas por sessão** para a planilha: 21.600 leituras, folgado para um teste de
  aquecimento de 1 hora e pequeno para a memória do computador.
- **15 segundos sem linha nenhuma** é considerado placa parada. A placa manda uma linha por
  segundo.
- **Limite conhecido do gráfico:** uma leitura que a placa simplesmente deixou de mandar,
  sem linha ilegível nem mensagem de texto no lugar, abre um intervalo de ~2 s, abaixo dos
  3 s que quebram a linha, e fica ligada por cima. Os 3 s não foram medidos: o ritmo real da placa (1 s mais o tempo
  de leitura dos sensores) será medido na sessão de teste (T024) e o limite pode descer para
  ~1,5 vez esse ritmo.
- **Navegadores com porta serial**: Chrome e Edge de computador (Windows, macOS, Linux).
  **Navegador de celular é tratado como sem suporte**, mesmo que diga ter porta serial: a
  tela é de bancada, e a leitura por cabo no celular não foi testada por nós. Decisão
  conservadora, fácil de rever.
- **A lista de portas não filtra por fabricante.** Filtrar pelo identificador USB da XIAO
  esconderia a placa se o grupo trocar de placa ou usar um adaptador; nada disso está
  confirmado.
- **Fora do escopo:** gravar leituras do cabo; enviar comandos para a placa (inclusive a
  hora); transporte `cable` completo; leitura por cabo no celular (USB OTG).
- **Depende de** `001-coleta-offline` (interface de transporte, códigos de erro, tabela de
  decodificadores e o componente de ícones) e não conversa com o envio da `002`.

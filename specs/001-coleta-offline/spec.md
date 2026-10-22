# Feature Specification: Coleta e visualização offline de leituras de colmeia

**Feature Branch**: `feat/001-coleta-offline`

**Created**: 2026-09-09

**Status**: Implementada e integrada em integracao/2026-10-21 (2026-10-21)

**Input**: Fatia vertical que vai do transporte até a tela, rodando inteiramente contra um
transporte simulado, sem depender do firmware da outra equipe.

## User Scenarios & Testing *(mandatory)*

### User Story 1 - Coletar os dados de uma colmeia (Priority: P1)

O apicultor chega ao apiário, abre o app, toca em "Coletar" e escolhe a colmeia. O app
encontra o nó sensor, mostra o progresso da transferência em número de leituras e em dias de
dados, e ao terminar confirma quantas leituras foram salvas. Ele guarda o celular e caminha
para a próxima colmeia.

**Why this priority**: É a razão de o app existir. Sem coleta confiável, nenhuma outra tela
tem conteúdo, e a viagem até o apiário — que custa deslocamento real — se perde.

**Independent Test**: Executável de ponta a ponta com o nó simulado, sem hardware nenhum e
sem rede. Entrega valor sozinha: ao fim, existem leituras persistidas no aparelho.

**Acceptance Scenarios**:

1. **Given** uma colmeia com 2.000 leituras acumuladas e o aparelho em modo avião,
   **When** o apicultor toca em Coletar, **Then** o app transfere as 2.000 leituras, mostra
   progresso durante a transferência e confirma o total salvo ao final.
2. **Given** uma transferência que cai em 62%, **When** o apicultor toca em Coletar
   novamente, **Then** o app retoma a partir da última leitura já salva e não regrava
   nenhuma leitura anterior.
3. **Given** uma coleta já realizada, **When** o apicultor coleta a mesma colmeia de novo
   sem que haja leituras novas, **Then** nenhuma linha é duplicada e o app informa que não
   havia dados novos.
4. **Given** um nó que reiniciou desde a última visita, **When** o apicultor coleta,
   **Then** as leituras anteriores e posteriores ao reinício convivem sem duplicação e sem
   perda.

---

### User Story 2 - Entender o que aconteceu na colmeia (Priority: P1)

Ainda ao lado da caixa, o apicultor abre a colmeia no app e vê as quatro grandezas na mesma
ordem de sempre — temperatura, umidade, voláteis e bateria — cada uma com o valor mais
recente e a direção da tendência. Ele toca numa delas e vê o histórico de 7 ou 30 dias.

**Why this priority**: Sem isso a coleta é um ato de fé. É também o que permite às
especialistas confirmar que o dado capturado faz sentido antes de investir numa campanha.

**Independent Test**: Testável com um banco populado, sem executar coleta alguma.

**Acceptance Scenarios**:

1. **Given** uma colmeia com 30 dias de leituras, **When** o apicultor abre o detalhe,
   **Then** vê as quatro grandezas em ordem fixa, com o valor mais recente e a idade dele.
2. **Given** um período em que o sensor reportou leituras inválidas, **When** o apicultor vê
   o gráfico, **Then** esse período aparece como lacuna, sem linha interpolada por cima.
3. **Given** uma colmeia sem leitura há mais de duas semanas, **When** ela aparece na lista,
   **Then** o app mostra a idade do dado com destaque e não apresenta o valor como atual.

---

### User Story 3 - Saber o que já saiu do celular (Priority: P2)

O apicultor vê, por colmeia, dois estados independentes: se o dado está salvo no aparelho e
se já foi enviado para a nuvem. Ele entende que passar dias sem enviar é normal, não é falha.

**Why this priority**: É o que impede o usuário de apagar o app, trocar de celular ou
recoletar por insegurança. A ansiedade de "será que perdi?" é o maior risco de perda real de
dado num app offline.

**Independent Test**: Testável marcando leituras como enviadas ou pendentes diretamente,
sem que exista qualquer sincronização implementada.

**Acceptance Scenarios**:

1. **Given** leituras coletadas e ainda não enviadas, **When** o apicultor vê a lista,
   **Then** a colmeia mostra "salvo no celular" e a contagem de leituras pendentes.
2. **Given** ausência de internet, **When** o app comunica o estado de envio, **Then** a
   mensagem não usa as palavras "erro", "falha" nem "offline" como manchete.

---

### User Story 4 - Levar os dados para análise (Priority: P2)

O apicultor ou o pesquisador exporta as leituras de uma colmeia em um arquivo que abre
corretamente numa planilha em português, e o compartilha.

**Why this priority**: É o caminho pelo qual o dado chega às especialistas antes de a
sincronização com a nuvem existir. Também funciona como rota de recuperação se o celular
falhar.

**Independent Test**: Testável a partir de um banco populado, verificando o arquivo gerado.

**Acceptance Scenarios**:

1. **Given** uma colmeia com leituras, **When** o usuário exporta, **Then** o arquivo abre
   com colunas corretas numa planilha configurada em português, com vírgula decimal.
2. **Given** um período com amostras inválidas, **When** o usuário exporta, **Then** o
   arquivo declara quantas amostras foram excluídas e por quê.

---

### User Story 5 - Descobrir por que a colmeia não aparece (Priority: P3)

Quando o app não encontra a colmeia, o apicultor abre uma tela que verifica, item a item, o
que é preciso estar ligado, explica cada pendência em português e oferece a ação de corrigir.

**Why this priority**: Não é polimento. Em aparelhos Android antigos, a busca por colmeias
retorna vazio silenciosamente quando a Localização do sistema está desligada, mesmo com a
permissão concedida. Sem esta tela o app simplesmente parece quebrado.

**Independent Test**: Testável forçando cada pré-condição a falhar isoladamente.

**Acceptance Scenarios**:

1. **Given** uma pré-condição do sistema desligada, **When** o apicultor abre o diagnóstico,
   **Then** o item aparece como pendente, com explicação em português e ação de correção.
2. **Given** buscas repetidas em sequência rápida, **When** o apicultor insiste no botão,
   **Then** o app não dispara buscas além do limite do sistema operacional e informa a espera.

---

### Edge Cases

- **Transferência interrompida** por afastamento, bateria ou troca de tela: o já recebido
  permanece salvo e a próxima tentativa retoma do ponto, sem duplicar nem reiniciar.
- **Relógio do nó não confiável**: quando o nó não sabe a hora, o horário de cada leitura é
  reconstruído a partir do relógio do celular no momento da coleta. A UI sinaliza que o
  horário é estimado, e o dado bruto permanece intacto para permitir recálculo posterior.
- **Relógio do celular alterado** pelo usuário entre coletas: o app detecta a incoerência e
  marca as âncoras afetadas como não confiáveis em vez de gravar horários impossíveis.
- **O nó não marca a hora sozinho** (informado pelo grupo do firmware em 2026-10-14): a cada
  coleta o celular manda a hora para o nó. Se o nó recusa ou não responde, a coleta segue
  normalmente e o apicultor vê um aviso, não um erro.
- **Relógio do celular claramente errado**: o app não manda essa hora ao nó, para não
  espalhar o erro, e marca as horas daquela coleta como estimadas.
- **Uma colmeia falha no meio de uma coleta de várias**: as outras são coletadas mesmo
  assim, e o resultado diz qual deu problema e o que já ficou salvo dela.
- **Nenhuma colmeia encontrada**: nunca aparece como "já estava tudo salvo".
- **Contador do nó com lacunas**: tratado como normal. Lacuna não é perda de dado.
- **Formato de dados desconhecido**: a carga é rejeitada por inteiro, com mensagem que diz o
  que fazer, e preservada em bruto para reprocessamento. Nada parcial é gravado.
- **Sensor em aquecimento ou fora de faixa**: as leituras são preservadas e marcadas como
  inválidas, ficando fora de médias e gráficos, mas contadas nos totais de exclusão.
- **Duas coletas da mesma colmeia no mesmo dia**: a segunda não duplica nada.
- **Armazenamento do aparelho perto do limite**: o app avisa antes de atingir o teto e nunca
  descarta leitura ainda não enviada.

## Requirements *(mandatory)*

### Functional Requirements

**Coleta**

- **FR-001**: O sistema MUST permitir coletar as leituras acumuladas de uma colmeia sem
  qualquer acesso à internet.
- **FR-002**: O sistema MUST solicitar apenas as leituras ainda não recebidas, usando o
  último ponto conhecido como referência.
- **FR-003**: O sistema MUST persistir as leituras recebidas de forma incremental durante a
  transferência, de modo que uma interrupção preserve tudo que já chegou.
- **FR-004**: O sistema MUST retomar uma transferência interrompida a partir do último ponto
  salvo, sem regravar nem perder leituras.
- **FR-005**: O sistema MUST exibir progresso durante a transferência, em quantidade de
  leituras e em período de tempo coberto.
- **FR-006**: O sistema MUST orientar o usuário a manter a tela ligada durante a
  transferência, e MUST impedir o desligamento automático da tela enquanto ela ocorre.
- **FR-007**: O sistema MUST dar retorno redundante ao concluir uma coleta, combinando texto
  com vibração ou som.

**Integridade dos dados**

- **FR-008**: O sistema MUST identificar cada leitura de forma única e estável, de modo que
  receber a mesma leitura mais de uma vez não crie registro duplicado.
- **FR-009**: O sistema MUST NOT alterar nem remover uma leitura já gravada.
- **FR-010**: O sistema MUST preservar a carga bruta de cada sessão de coleta, permitindo
  reprocessar os dados caso um campo tenha sido interpretado incorretamente.
- **FR-011**: O sistema MUST rejeitar por inteiro uma carga em formato desconhecido, sem
  gravar nada parcial, informando o usuário em português sobre o que fazer.
- **FR-012**: O sistema MUST registrar valor ausente ou inválido como ausência explícita,
  com o motivo, e MUST NOT usar zero ou qualquer número para representar ausência.
- **FR-013**: O sistema MUST preservar o valor original do sensor, mantendo qualquer
  correção ou calibração como informação separada aplicada apenas na exibição.
- **FR-014**: O sistema MUST reconstruir o horário de cada leitura quando o nó não tiver
  relógio confiável, e MUST registrar o grau de confiança desse horário junto da leitura.
- **FR-015**: O sistema MUST tratar lacunas na numeração das leituras como situação normal.

**Visualização**

- **FR-016**: O sistema MUST apresentar, por colmeia, temperatura, umidade, voláteis e
  bateria, sempre na mesma ordem.
- **FR-017**: O sistema MUST identificar o canal de gás como voláteis e MUST NOT apresentá-lo
  como dióxido de carbono em nenhuma tela, gráfico ou arquivo exportado.
- **FR-018**: O sistema MUST exibir histórico em janelas de 7 e de 30 dias.
- **FR-019**: O sistema MUST representar períodos sem dado válido como lacuna, e MUST NOT
  desenhar linha contínua sobre eles.
- **FR-020**: O sistema MUST excluir amostras inválidas de qualquer média ou resumo, e MUST
  informar quantas foram excluídas.
- **FR-021**: O sistema MUST exibir a idade do dado mais recente por colmeia, e MUST NOT
  apresentar como atual um valor de leitura antiga.
- **FR-022**: O sistema MUST expressar a bateria em três estados nomeados, e MUST NOT
  expressá-la em porcentagem.
- **FR-023**: O sistema MUST exibir cada grandeza com precisão não superior à exatidão do
  sensor.
- **FR-024**: O sistema MUST NOT oferecer comparação de valores absolutos de voláteis entre
  colmeias distintas.
- **FR-025**: O sistema MUST oferecer um modo de alta legibilidade sob sol, ativável em um
  toque e mantido entre sessões.

**Estado e transparência**

- **FR-026**: O sistema MUST exibir, por colmeia, o estado de gravação no aparelho e o estado
  de envio para a nuvem como informações distintas e simultaneamente visíveis.
- **FR-027**: O sistema MUST NOT usar as palavras erro, falha ou offline como manchete para
  ausência de rede.
- **FR-028**: O sistema MUST avisar o usuário quando o armazenamento se aproximar do limite,
  e MUST NOT descartar leitura ainda não enviada.

**Diagnóstico**

- **FR-029**: O sistema MUST oferecer uma tela que verifique as pré-condições de conexão,
  explique cada pendência em português e ofereça a ação corretiva.
- **FR-030**: O sistema MUST respeitar os limites do sistema operacional para busca repetida
  de dispositivos, informando o usuário sobre a espera em vez de falhar em silêncio.
- **FR-031**: O sistema MUST solicitar permissões no momento em que o usuário aciona a
  função que as exige, e MUST NOT solicitá-las na abertura do app.

**Exportação**

- **FR-032**: O sistema MUST exportar as leituras de uma colmeia em arquivo que abra
  corretamente em planilha configurada para português do Brasil.
- **FR-033**: O arquivo exportado MUST conter um cabeçalho de proveniência com o modelo do
  sensor, a versão do formato de dados, quais grandezas são derivadas e a contagem de
  amostras excluídas.
- **FR-034**: O sistema MUST permitir compartilhar o arquivo exportado pelos meios já
  presentes no aparelho.

**Operação sem hardware**

- **FR-035**: O sistema MUST oferecer uma fonte de dados simulada capaz de reproduzir os
  seguintes caminhos: transferência interrompida, reinício do nó durante a sessão, salto de
  relógio, lacuna de numeração, amostras inválidas e formato de dados desconhecido.
- **FR-036**: A fonte de dados simulada MUST produzir a mesma experiência de uso que uma
  fonte real: as mesmas telas, os mesmos estados de progresso e os mesmos modos de falha.

**Avisos de coleta e relógio** *(acrescentado em 2026-10-14, a pedido do dono do produto,
depois de o código existir — registrado aqui para o Princípio VII não ficar só na conversa)*

- **FR-037**: Toda coleta que não termina bem MUST avisar o apicultor na tela de resultado,
  dizendo o que aconteceu, o que já ficou salvo e o que fazer em seguida. Uma coleta MUST NOT
  terminar em silêncio nem ficar presa no estado de busca.
- **FR-038**: O resultado MUST distinguir: nenhuma colmeia encontrada; Bluetooth ou cabo
  indisponível; não conectou; conexão caiu no meio; formato desconhecido; dados com defeito;
  não conseguiu gravar no celular; erro inesperado. Cada caso tem texto próprio, do módulo de
  i18n, sem código de erro e sem inglês.
- **FR-039**: A falha de uma colmeia MUST NOT impedir a coleta das outras na mesma sessão.
  O desfecho de cada sessão fica registrado, e o cartão da colmeia mostra "Última coleta
  incompleta" até a próxima coleta completa.
- **FR-040**: A cada coleta, antes de baixar as leituras, o app MUST oferecer ao nó a hora
  do celular em UTC, como melhor esforço: com tempo limite, sem bloquear a coleta, e com um
  aviso (não um problema) quando o nó recusar ou não responder.
- **FR-041**: O app MUST NOT mandar ao nó uma hora do celular implausível (anterior ao início
  do projeto, ou mais de 10 minutos antes da última hora confiável daquela colmeia), e MUST
  marcar como estimadas as horas da coleta feita nessa condição.
- **FR-042**: O que já foi coletado MUST ser decidido pelo número sequencial da leitura,
  nunca pela hora. A hora enviada ao nó não muda o que o app pede nem o que ele grava.

### Key Entities

- **Colmeia**: a caixa com a colônia. Tem nome, local, data de instalação e, opcionalmente,
  um nó sensor associado e a posição em que ele foi instalado.
- **Nó sensor**: o aparelho dentro da colmeia. Tem identificador estável, período de
  amostragem e data de instalação.
- **Leitura**: uma medição, com horário e grau de confiança desse horário, contendo
  temperatura, umidade, voláteis, bateria e uma marcação de validade. Imutável após gravada.
- **Sessão de coleta**: o registro de uma transferência — quando ocorreu, quantas leituras
  trouxe, e a carga bruta recebida.
- **Âncora de relógio**: a correspondência, capturada no momento da coleta, entre o contador
  do nó e o horário do celular. Permite recalcular horários depois.
- **Resumo diário**: agregado por colmeia e por dia, computado no momento da ingestão,
  contendo mínimos, medianas, máximos e a contagem de amostras excluídas.
- **Época de sensor**: o período entre eventos que quebram a continuidade da série, como
  troca de sensor. Nenhum resumo cruza uma fronteira de época.

## Success Criteria *(mandatory)*

### Measurable Outcomes

- **SC-001**: Um apicultor consegue coletar os dados de uma colmeia e ver o resultado sem
  nenhuma conexão de rede, em menos de 30 segundos de interação própria, descontado o tempo
  de transferência.
- **SC-002**: Coletar a mesma colmeia duas vezes seguidas resulta em contagem de leituras
  idêntica à da primeira coleta, sem exceção.
- **SC-003**: Uma transferência interrompida em qualquer ponto preserva 100% das leituras já
  recebidas, e a tentativa seguinte não regrava nenhuma delas.
- **SC-004**: Nenhuma tela do fluxo principal deixa de funcionar com o aparelho em modo
  avião.
- **SC-005**: O app abre e chega à primeira tela utilizável em até 3,5 segundos na metade das
  vezes e até 5 segundos em 95% delas, no aparelho de referência definido pela constituição.
- **SC-006**: Uma lista com 10.000 leituras rola sem travamento perceptível e sem crescimento
  contínuo de memória.
- **SC-007**: Uma pessoa que nunca viu o app consegue, sem instrução, dizer corretamente se
  os dados de uma colmeia já foram enviados ou ainda estão só no celular.
- **SC-008**: Nenhuma tela, gráfico ou arquivo exportado apresenta o canal de gás como
  dióxido de carbono.
- **SC-009**: Nenhum gráfico desenha linha contínua sobre um período sem dado válido.
- **SC-010**: O arquivo exportado abre com colunas corretas em planilha configurada para
  português do Brasil, sem ajuste manual de separador ou codificação.
- **SC-011**: A demonstração completa — encontrar a colmeia, coletar, ver o histórico e
  exportar — roda num navegador de desktop sem nenhum hardware conectado.
- **SC-012**: Em cada um dos modos de falha da fonte simulada, a tela de resultado mostra
  manchete, aviso e próxima ação corretos, e a contagem de leituras salvas bate com o banco.
- **SC-013**: Um nó que recusa a hora, ou não responde em 5 segundos, não muda em nada o
  número de leituras coletadas.

## Assumptions

- **O formato de dados do nó ainda não foi informado pela equipe de hardware.** Esta feature
  define um formato provisório para a fonte simulada. A capacidade de aceitar formatos
  versionados (FR-011) existe justamente para absorver o formato real quando ele chegar, sem
  refazer o que foi construído aqui.
- **Nenhum transporte real é implementado aqui.** BLE e cabo são features seguintes. Esta
  entrega prova a arquitetura de ponta a ponta contra a fonte simulada.
- **A sincronização com a nuvem não existe ainda.** O estado de envio é exibido e persistido,
  mas nada é enviado. A exportação de arquivo é o caminho de saída dos dados nesta fase.
- **Não há autenticação nem contas.** O app funciona inteiramente sem login.
- **Limiares por espécie e alertas estão fora de escopo.** As grandezas são exibidas com seu
  histórico, sem julgamento sobre o que é saudável. Essa avaliação cabe às especialistas
  nesta fase do projeto.
- **iOS está descopado** por decisão de projeto. As escolhas feitas aqui preservam a
  possibilidade de retomá-lo depois sem reescrita.
- **A demonstração de aula ocorre num navegador de desktop**, o que torna o caminho web um
  requisito de entrega, não um extra.

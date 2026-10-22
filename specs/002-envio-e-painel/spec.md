# Feature Specification: Envio para a nuvem e painel das pesquisadoras

**Feature Branch**: `feat/002-envio-e-painel`

**Created**: 2026-09-16

**Status**: Implementada e integrada em integracao/2026-10-21 (2026-10-21)

**Input**: As leituras precisam sair do celular e chegar às pesquisadoras, que hoje
trabalham em planilha. Além de enviar, o lado web vira um painel com login, organizado por
apicultor, com visão macro e detalhe por colmeia.

## User Scenarios & Testing *(mandatory)*

### User Story 1 - Enviar o que está guardado (Priority: P1)

O apicultor volta do apiário, chega em casa ou pega sinal na estrada, abre o app e toca em
"Enviar agora". As leituras sobem. Se o sinal cair no meio, ele guarda o celular e na
próxima vez que houver internet o envio continua de onde parou.

**Why this priority**: É a metade que falta do propósito do projeto. Sem ela, o dado morre
no celular de uma pessoa e a pesquisa não acontece.

**Independent Test**: Testável de ponta a ponta contra uma nuvem simulada, sem servidor
nenhum, incluindo queda no meio e repetição.

**Acceptance Scenarios**:

1. **Given** 1.240 leituras guardadas e internet disponível, **When** o apicultor toca em
   "Enviar agora", **Then** o app envia tudo e passa a mostrar, por colmeia, quantas estão
   salvas no celular e quantas já estão na nuvem.
2. **Given** um envio interrompido em 60%, **When** houver internet de novo, **Then** o
   envio retoma do ponto, sem reenviar o que já foi confirmado e sem perder nada.
3. **Given** um lote já enviado, **When** o mesmo lote for enviado outra vez, **Then** o
   servidor não cria linha nova e a contagem total não muda.
4. **Given** ausência de rede, **When** o apicultor abre qualquer tela do fluxo de campo,
   **Then** tudo funciona normalmente e nenhuma mensagem usa as palavras "erro", "falha"
   ou "offline" como manchete.
5. **Given** uma rede de portal cativo que responde 200 com HTML, **When** o app tenta
   enviar, **Then** ele detecta, não corrompe nada, e explica em português o que fazer.

---

### User Story 2 - Ligar o celular ao projeto (Priority: P1)

Na primeira vez que vai enviar, o apicultor digita um código que a pesquisadora passou.
Uma vez só. Depois disso o envio é automático sempre que houver internet.

**Why this priority**: Sem isso o servidor não sabe de quem é o dado, e a pesquisadora não
consegue separar um apicultor do outro.

**Independent Test**: Testável isoladamente, com dois códigos e dois apicultores.

**Acceptance Scenarios**:

1. **Given** um celular ainda não ligado ao projeto, **When** o apicultor toca em "Enviar
   agora", **Then** o app pede o código, explicando em português de onde ele vem.
2. **Given** um código digitado errado, **When** ele confirma, **Then** o app avisa antes
   de chegar ao servidor, sem contar como tentativa.
3. **Given** um celular já ligado ao projeto, **When** o apicultor envia de novo,
   **Then** nenhum código é pedido.
4. **Given** o celular do apicultor A, **When** ele tenta ler os dados do apicultor B,
   **Then** recebe zero linhas.
5. **Given** o app sem vínculo, **When** o apicultor usa qualquer tela de coleta,
   **Then** nada é bloqueado — coletar nunca exige código.

---

### User Story 3 - Ver o conjunto (Priority: P1)

A pesquisadora entra no painel pelo computador e vê, numa tela, todas as colmeias de todos
os apicultores do projeto: de quem é, em que município, quando foi a última leitura,
quantas leituras existem e quantas amostras foram excluídas por falha de sensor.

**Why this priority**: É a visão que ela não tem hoje. Em planilha, cada apicultor é um
arquivo separado e não há como olhar o conjunto.

**Independent Test**: Testável com dados semeados no servidor, sem nenhum celular.

**Acceptance Scenarios**:

1. **Given** três apicultores com colmeias, **When** a pesquisadora entra, **Then** vê
   todas as colmeias numa lista, com apicultor e município.
2. **Given** uma colmeia sem leitura recente, **When** ela olha a lista, **Then** a idade
   do dado aparece em palavras e não como data crua.
3. **Given** uma pesquisadora de outro projeto, **When** ela entra, **Then** não vê
   nenhuma colmeia deste projeto.
4. **Given** qualquer tela do painel, **When** ela procura comparar voláteis entre
   colmeias diferentes, **Then** essa comparação não é oferecida.

---

### User Story 4 - Investigar uma colmeia (Priority: P2)

Ela clica numa colmeia e vê o histórico de temperatura, umidade e voláteis, escolhendo o
período. Onde o sensor falhou, o gráfico mostra falha na linha, não uma linha inventada.

**Why this priority**: É o trabalho analítico de fato. Depende da visão macro existir.

**Independent Test**: Testável com uma série semeada contendo lacunas e troca de sensor.

**Acceptance Scenarios**:

1. **Given** um período com três dias sem leitura válida, **When** ela vê o gráfico,
   **Then** aparece uma lacuna, sem linha ligando os dois lados.
2. **Given** uma troca de sensor no meio do período, **When** ela vê o gráfico, **Then**
   a série é interrompida na troca e nenhum resumo cruza essa fronteira.
3. **Given** qualquer agregado exibido, **When** ela olha, **Then** a contagem de amostras
   excluídas aparece junto, não em nota de rodapé.
4. **Given** o canal de gás, **When** ele é exibido em qualquer lugar do painel, **Then**
   é rotulado como voláteis e nunca como CO₂.

---

### User Story 5 - Levar para a análise dela (Priority: P2)

Ela escolhe período e colmeias, baixa uma planilha e abre no programa que já usa, sem
precisar arrumar separador nem codificação.

**Why this priority**: É a ponte com o trabalho que ela já faz. Sem isso o painel vira
mais uma ferramenta que ela precisa visitar.

**Independent Test**: Testável verificando o arquivo gerado.

**Acceptance Scenarios**:

1. **Given** um recorte escolhido, **When** ela exporta, **Then** o arquivo abre com
   colunas corretas em planilha configurada para português, sem diálogo de importação.
2. **Given** qualquer exportação, **When** ela abre o arquivo, **Then** o cabeçalho declara
   o sensor, a versão do formato, quais grandezas são derivadas e quantas amostras foram
   excluídas.
3. **Given** um recorte muito grande, **When** ela exporta, **Then** o painel pede em
   português para estreitar o período em vez de travar.

---

### Edge Cases

- **Envio interrompido** a qualquer momento: nada se perde, nada duplica, retoma por cursor.
- **Celular reinstalado**: o apicultor digita o código de novo; o servidor reconhece o
  vínculo e não duplica nada, porque a chave é natural.
- **Dois celulares do mesmo apicultor**: ambos podem enviar; a chave natural absorve.
- **Código digitado errado**: o dígito verificador barra antes do servidor.
- **Código sob tentativa de adivinhação**: trava após um número fixo de falhas.
- **Rede de portal cativo**: detectada antes de qualquer gravação.
- **Relógio do celular alterado** entre envios: não afeta a chave, que não depende de tempo.
- **Contador do nó reiniciado** por firmware: colide de forma idêntica no celular e no
  servidor, de forma visível — nunca produz divergência silenciosa entre os dois.
- **Apicultor revoga consentimento**: existe procedimento de apagamento no servidor, fora
  do app, registrado.

## Requirements *(mandatory)*

### Functional Requirements

**Envio**

- **FR-001**: O sistema MUST oferecer uma ação de envio manual, visível e sempre acessível.
- **FR-002**: O sistema MUST enviar apenas leituras ainda não confirmadas pelo servidor.
- **FR-003**: O sistema MUST confirmar o envio de uma leitura apenas após o servidor
  confirmar a gravação.
- **FR-004**: O sistema MUST retomar um envio interrompido a partir do ponto confirmado.
- **FR-005**: O sistema MUST NOT apagar qualquer leitura do aparelho.
- **FR-006**: Enviar a mesma leitura mais de uma vez MUST NOT criar registro duplicado no
  servidor.
- **FR-007**: O sistema MUST exibir, por colmeia, quantas leituras estão salvas no celular
  e quantas estão na nuvem, como informações distintas e simultaneamente visíveis.
- **FR-008**: O sistema MUST detectar rede que exige autenticação no navegador antes de
  tentar gravar, e MUST explicar em português.
- **FR-009**: O envio MUST ocorrer fora do caminho de renderização.
- **FR-010**: Nenhuma tela do fluxo de coleta MUST NOT ganhar dependência de rede.

**Vínculo**

- **FR-011**: O sistema MUST permitir ligar o aparelho a um apicultor por meio de um código
  fornecido pela pesquisadora, sem senha e sem cadastro.
- **FR-012**: O código MUST ser validado localmente contra erro de digitação antes de ser
  enviado.
- **FR-013**: O sistema MUST limitar tentativas de código.
- **FR-014**: O vínculo MUST ser pedido apenas no fluxo de envio, e MUST NOT bloquear
  nenhuma tela de coleta.
- **FR-015**: A credencial resultante MUST ser guardada em armazenamento protegido do
  aparelho.

**Servidor**

- **FR-016**: O servidor MUST identificar cada leitura pela identidade estável do nó
  somada ao contador, e MUST NOT depender de identificadores locais do aparelho.
- **FR-017**: O servidor MUST recusar, por construção, alteração e remoção de leituras.
- **FR-018**: O servidor MUST negar por padrão qualquer acesso não explicitamente
  autorizado.
- **FR-019**: Um apicultor MUST NOT conseguir ler dados de outro apicultor.
- **FR-020**: Uma pesquisadora MUST ver apenas os apicultores dos projetos dela.
- **FR-021**: O servidor MUST recalcular os resumos diários com a mesma regra do aparelho,
  e isso MUST ser verificado por um caso de referência compartilhado.
- **FR-022**: O servidor MUST NOT conter campo de latitude nem de longitude.
- **FR-023**: Nenhuma credencial administrativa MUST existir no aplicativo.

**Painel**

- **FR-024**: O painel MUST exigir autenticação e MUST NOT permitir cadastro público.
- **FR-025**: O painel MUST apresentar uma visão do conjunto, com uma linha por colmeia,
  identificando apicultor e município.
- **FR-026**: O painel MUST permitir abrir uma colmeia e ver o histórico por período.
- **FR-027**: O painel MUST representar período sem dado válido como lacuna, e MUST NOT
  desenhar linha contínua sobre ele.
- **FR-028**: O painel MUST interromper a série na troca de sensor, e nenhum agregado MUST
  cruzar essa fronteira.
- **FR-029**: O painel MUST exibir a contagem de amostras excluídas junto de cada agregado.
- **FR-030**: O painel MUST rotular o canal de gás como voláteis, e MUST NOT apresentá-lo
  como CO₂.
- **FR-031**: O painel MUST NOT oferecer comparação de valores absolutos de voláteis entre
  colmeias distintas.
- **FR-032**: O painel MUST NOT conter banco local nem motor de envio.
- **FR-033**: O painel MUST NOT transmitir dado pessoal em parâmetro de endereço.

**Exportação**

- **FR-034**: O painel MUST gerar planilha do recorte escolhido, que abra corretamente em
  programa configurado para português do Brasil.
- **FR-035**: Toda planilha MUST conter cabeçalho de proveniência com sensor, versão do
  formato, quais grandezas são derivadas, contagem de amostras excluídas e a declaração de
  que coordenadas não são coletadas.

**Privacidade**

- **FR-036**: O sistema MUST NOT enviar coordenada ao servidor sob nenhuma precisão.
- **FR-037**: O sistema MUST NOT coletar CPF, RG nem endereço.
- **FR-038**: Registro de log MUST NOT conter dado pessoal.
- **FR-039**: MUST existir procedimento documentado de apagamento de dados de um apicultor
  a pedido dele.

### Key Entities

- **Projeto**: o projeto de pesquisa. Agrupa apicultores e pesquisadoras.
- **Apicultor**: pessoa que coleta. Tem nome e município. Não tem coordenada.
- **Código do projeto**: credencial de uso único para ligar um aparelho a um apicultor.
  Guardado de forma irreversível no servidor.
- **Aparelho**: o vínculo entre um celular e um apicultor.
- **Pesquisadora**: quem analisa. Enxerga os apicultores dos projetos dela.
- **Leitura no servidor**: espelho imutável da leitura do celular, identificada pela
  identidade estável do nó mais o contador.
- **Resumo diário no servidor**: agregado recalculado no servidor pela mesma regra do
  aparelho, com a contagem de amostras excluídas.

## Success Criteria *(mandatory)*

- **SC-001**: Enviar o mesmo conjunto duas vezes resulta em contagem idêntica no servidor.
- **SC-002**: Um envio interrompido em qualquer ponto preserva 100% do que foi confirmado e
  não reenvia nada já confirmado.
- **SC-003**: Nenhuma leitura é removida do aparelho em nenhuma circunstância.
- **SC-004**: O apicultor A recebe zero linhas ao pedir dados do apicultor B.
- **SC-005**: Nenhuma tela do fluxo de coleta deixa de funcionar em modo avião.
- **SC-006**: Cem mil leituras sobem até o fim no aparelho de referência, em rede lenta,
  atravessando interrupções, sem perda e sem duplicata.
- **SC-007**: O resumo diário calculado no aparelho e no servidor produz números idênticos
  para o mesmo conjunto de leituras.
- **SC-008**: Nenhum gráfico do painel desenha linha sobre período sem dado válido.
- **SC-009**: Nenhuma tela, gráfico ou planilha apresenta o canal de gás como CO₂.
- **SC-010**: A planilha abre com colunas corretas em programa configurado para português
  do Brasil, sem ajuste manual.
- **SC-011**: A pesquisadora consegue, sem instrução prévia, dizer de qual apicultor é cada
  colmeia na visão do conjunto.
- **SC-012**: Nenhum endereço acessado pelo painel contém nome de pessoa.

## Assumptions

- **O formato do payload do nó continua não confirmado.** Esta feature não depende dele: o
  que sobe é o modelo canônico já produzido pelo decodificador versionado.
- **O transporte real ainda não existe.** A coleta continua rodando contra a fonte
  simulada; o envio funciona igual, porque só lê o banco local.
- **Um apicultor pertence a um projeto.** Apicultor em dois projetos fica fora de escopo.
- **A pesquisadora cria os acessos à mão.** Não há cadastro público nem convite por e-mail.
- **iOS continua descopado.**
- **O painel é artefato separado, online**, e nunca guarda dado localmente.
- **Limiares por espécie e alertas continuam fora de escopo.** O painel mostra a série e a
  dispersão; o julgamento é da pesquisadora.

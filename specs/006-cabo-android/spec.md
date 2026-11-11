# Feature Specification: Coleta pelo cabo no Android

**Feature Branch**: `feat/006-cabo-android`

**Created**: 2026-11-04

**Status**: Draft

**Input**: User description: "Coleta pelo cabo no Android. Hoje a coleta da placa real
(firmware 4cc7ed8, arquivo-1) só funciona no Chrome de computador (feature 005). Queremos que o
apicultor colete a placa ligando-a por cabo USB-C direto na porta do celular ou tablet Android,
no app instalado. A placa some do USB quando dorme e reaparece quando o botão a acorda, e fica
30 s esperando. Reaproveitar tudo da 005; a novidade é só o transporte. Permissão de USB pedida
no toque, aviso quando a placa acorda, sem mexer nos sinais que reiniciam a placa. O Expo Go
não carrega módulo nativo: o app passa a ter uma versão instalada por arquivo. Teste em um
tablet Samsung com a placa real. Fora de escopo: Bluetooth, iOS, Play Store."

## Clarifications

### Session 2026-11-04 (decisões do dono do produto, João)

- Q: Onde a coleta pelo cabo precisa funcionar? → A: No app **instalado** no Android, com a
  placa ligada direto na porta USB-C do aparelho. O tablet de teste tem uma porta só: enquanto
  a placa está nele, ele não está ligado ao computador.
- Q: O que muda na conversa com a placa? → A: Nada. A conversa, a gravação antes da
  confirmação, a hora pela contagem, a colmeia pelo MAC, a placa nova e as mensagens são as da
  005 (`specs/005-coleta-pelo-cabo/spec.md`, FR-001 a FR-033). Esta feature só troca o caminho
  dos bytes.
- Q: E o Expo Go e o navegador do celular? → A: Continuam sem cabo e explicando o caminho. O
  app instalado por arquivo (versão de desenvolvimento) é o único que coleta pelo cabo no
  Android.

## User Scenarios & Testing *(mandatory)*

### User Story 1 - Coletar a placa pelo cabo no tablet (Priority: P1)

O apicultor liga a placa na porta USB-C do tablet com um cabo, aperta o botão da placa e toca
em Coletar. As leituras ficam salvas no tablet e a placa recomeça a contar, como no computador.

**Why this priority**: É o objetivo da feature. Sem isso, a coleta real depende de um
computador, que o apicultor não leva para o apiário.

**Independent Test**: Com a placa real e um tablet Android com o app instalado: ligar, apertar
o botão, coletar. As leituras aparecem na colmeia e o arquivo da placa recomeça (placa
confere: a próxima coleta traz só as medições novas).

**Acceptance Scenarios**:

1. **Given** a placa acordada pelo botão e ligada no tablet, **When** o apicultor toca em
   Coletar e aceita a permissão de USB do Android, **Then** o app conversa com a placa, grava
   as leituras e mostra o mesmo resultado que mostraria no computador.
2. **Given** uma coleta já feita com essa placa, **When** ela é coletada de novo, **Then** só
   as medições novas entram, e nenhuma leitura se repete.
3. **Given** a placa já ligada a outra colmeia pelo MAC, **When** o apicultor escolhe outra
   colmeia por engano, **Then** as leituras vão para a colmeia da placa e a tela avisa.

---

### User Story 2 - Saber quando a placa acordou (Priority: P1)

Quando o botão acorda a placa, ela aparece na porta do tablet. O app percebe e avisa "A placa
acordou. Toque em Coletar." Quando ela volta a dormir, o aviso some.

**Why this priority**: A placa só espera 30 s. Sem o aviso, o apicultor não sabe se a placa
está acordada nem se o cabo está bom.

**Independent Test**: Com a tela de coleta aberta, apertar o botão da placa: o aviso aparece em
até 3 s. Esperar a placa dormir: o aviso some.

**Acceptance Scenarios**:

1. **Given** a tela "Coletar pelo cabo" aberta, **When** a placa aparece na porta, **Then** o
   app mostra que a placa acordou e conta o tempo que falta.
2. **Given** nenhuma placa na porta, **When** o apicultor toca em Coletar, **Then** o app diz
   que não achou a placa e o que fazer (apertar o botão, conferir o cabo).

---

### User Story 3 - Configurar placa nova pelo tablet (Priority: P2)

Uma placa recém-gravada é ligada no tablet e recebe a hora inicial pela tela "Configurar placa
nova", como no computador.

**Why this priority**: No campo, a placa nova pode ser configurada sem computador. Menos
urgente que coletar, porque hoje o grupo do firmware configura as placas.

**Independent Test**: Placa recém-formatada e gravada, ligada no tablet: "Configurar placa
nova" mostra "A placa confirmou e começou a medir".

**Acceptance Scenarios**:

1. **Given** uma placa esperando a hora inicial, **When** o apicultor toca em Acertar o relógio
   e aceita a permissão, **Then** a placa recebe a hora e o app mostra a confirmação.

---

### User Story 4 - Explicar o caminho onde não há cabo (Priority: P3)

No Expo Go, no navegador do celular e em aparelho sem suporte a USB, a tela continua dizendo
onde a coleta pelo cabo funciona.

**Why this priority**: Evita uma tela que não faz nada. Já existe na 005; aqui só se ajusta o
texto para incluir o app instalado no Android.

**Independent Test**: Abrir "Coletar pelo cabo" no Expo Go: a tela explica que o cabo funciona
no app instalado por arquivo ou no computador, sem botão que não funciona.

**Acceptance Scenarios**:

1. **Given** o app aberto no Expo Go, **When** o apicultor abre "Coletar pelo cabo", **Then** a
   tela explica o caminho e não mostra o botão de coletar da placa de verdade.

---

### Edge Cases

- A placa dorme ou o cabo sai no meio do arquivo: mesma regra da 005 — nada confirmado, nada
  parcial na série, o bruto guardado e a placa fica com o arquivo.
- O apicultor recusa a permissão de USB: a tela diz que o Android não deixou usar a placa e
  como permitir.
- A permissão vale só enquanto a placa está na porta: a placa que dorme e reaparece pode pedir
  de novo. Se o Android oferecer "sempre abrir com o Monitor de Colmeias", o app usa isso para não
  perguntar a cada coleta.
- Mais de um aparelho USB ligado (hub, outro acessório): o app só considera a placa
  (fabricante Espressif); outros aparelhos são ignorados.
- Aparelho que não funciona como hospedeiro USB (sem OTG): a placa nunca aparece; a tela diz
  que este aparelho não lê a placa pelo cabo.
- O tablet bloqueado ou o app em segundo plano no meio da coleta: a coleta continua enquanto o
  app estiver aberto; se o sistema fechar a conexão, vale a regra de cabo solto.
- Abrir a porta não pode reiniciar a placa: o app não mexe nos sinais de controle da porta.

## Requirements *(mandatory)*

### Functional Requirements

- **FR-001**: No app instalado no Android, as telas "Coletar pelo cabo" e "Configurar placa
  nova" DEVEM funcionar com a placa ligada na porta USB do aparelho, com a mesma conversa,
  gravação, hora, identificação e mensagens da 005.
- **FR-002**: O app DEVE considerar apenas a placa (fabricante Espressif, interface serial USB)
  e ignorar os demais aparelhos USB.
- **FR-003**: O app DEVE pedir a permissão de USB do Android no toque em Coletar (ou Acertar o
  relógio), nunca ao abrir o app. Recusada a permissão, DEVE dizer o que aconteceu e como
  permitir.
- **FR-004**: O app DEVE avisar quando a placa aparece e quando some da porta, enquanto a tela
  do cabo estiver aberta (US2), e reutilizar a contagem dos 30 s da 005.
- **FR-005**: O app DEVE abrir a porta a 115200 8N1 sem alterar os sinais de controle (DTR/RTS)
  que podem reiniciar a placa.
- **FR-006**: A perda da placa no meio da conversa DEVE ser tratada como cabo solto (mesmo
  desfecho da 005), sem travar a tela e sem gravar nada parcial na série.
- **FR-007**: Os bytes recebidos DEVEM chegar à conversa na ordem, sem perda nem duplicação,
  em pedaços de qualquer tamanho.
- **FR-008**: No Expo Go, no navegador do celular e em aparelho sem a peça de USB, a tela DEVE
  explicar onde o cabo funciona (app instalado no Android ou computador) e não oferecer a placa
  de verdade (US4). A placa simulada continua disponível para demonstração.
- **FR-009**: O código que fala com o USB do Android DEVE ficar isolado no lugar dos
  transportes (Princípio IV); o resto do app não muda de comportamento por causa dele.
- **FR-010**: O projeto DEVE documentar como gerar e instalar a versão de desenvolvimento do
  app num aparelho Android.

### Key Entities *(include if feature involves data)*

Nenhuma entidade nova. As leituras, sessões e o MAC da placa seguem o modelo da 005; cada
sessão registra a origem `cable`, como no computador.

## Success Criteria *(mandatory)*

### Measurable Outcomes

- **SC-001**: Com a placa real e o tablet Samsung, uma coleta completa (do toque em Coletar ao
  resultado) leva menos de 10 s para um arquivo de até 100 medições.
- **SC-002**: O aviso de "placa acordou" aparece em até 3 s depois que a placa surge na porta.
- **SC-003**: Em 5 coletas seguidas da mesma placa, nenhuma leitura se repete e nenhuma se
  perde (contagem do app igual à soma das medições que a placa entregou).
- **SC-004**: Tirar o cabo no meio do arquivo nunca deixa leitura parcial na série nem trava a
  tela; a próxima coleta traz tudo.
- **SC-005**: Os testes automáticos da 005 continuam passando sem mudança, e o caminho novo tem
  testes próprios com a placa simulada.

## Assumptions

- O tablet de teste é um Samsung com Android recente e USB-C com função de hospedeiro (OTG). A
  maioria dos aparelhos Android com USB-C funciona assim.
- A placa XIAO ESP32-C6 se apresenta como porta serial USB padrão (CDC-ACM), VID 0x303A, PID
  0x1001, como confirmado no macOS em 2026-11-04.
- A placa tem bateria e alimenta a si mesma; ligada no tablet, ela pode também puxar energia
  dele, sem efeito na coleta.
- A versão instalada por arquivo é de desenvolvimento, para teste com o grupo e as
  pesquisadoras. Publicar na Play Store fica fora desta feature.
- O app instalado por arquivo usa a mesma nuvem e o mesmo banco do app de campo (SQLite do
  aparelho).

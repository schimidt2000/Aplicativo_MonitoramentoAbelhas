# Feature Specification: Tela simples para o apicultor

**Feature Branch**: `feat/008-tela-simples`

**Created**: 2026-11-10

**Status**: Draft

**Input**: User description: "Deixar o app com cara de utilizável. Interface simples e
intuitiva. Não posso mudar o firmware. Ter muitas telas é ruim. Precisa ser simples para o
apicultor." Proposta aceita em 2026-11-10 ("pode fazer em partes maiores, o prazo está bem
apertado"): uma tela-base sem abas, um botão de coletar que leva à placa de verdade, cartão
de colmeia com uma palavra de situação, detalhe com os números primeiro e envio automático.

## Clarifications

### Session 2026-11-10 (decisões do dono do produto, João)

- Q: Quantas telas o apicultor vê no dia a dia? → A: Três: Início (as colmeias), Coletar e a
  colmeia. Enviar e Ajustes continuam existindo, mas saem da barra de abas: chega-se a elas
  pelo Início. Ferramentas da equipe (diagnóstico, monitor de bancada, placa nova, coleta sem
  fio simulada) ficam dentro de Ajustes.
- Q: O que o botão Coletar faz? → A: Leva à coleta pelo cabo (005/006), que é o único caminho
  da placa real. A coleta sem fio simulada deixa de ser o botão principal.
- Q: Muda alguma coisa na conversa com a placa? → A: Não. O firmware não muda e nenhuma regra
  de coleta, gravação ou hora muda. Esta feature só reorganiza telas e textos.

## User Scenarios & Testing *(mandatory)*

### User Story 1 - Abrir o app e saber o que fazer (Priority: P1)

O apicultor abre o app e vê as colmeias numa tela só, sem abas. Cada colmeia diz, numa
palavra com ícone e cor, se está tudo certo ou o que fazer: ir coletar, trocar a bateria,
coletar de novo. O botão Coletar fica embaixo, ao alcance do polegar.

**Why this priority**: É a primeira impressão e o uso diário. Hoje são quatro abas, um aviso
que repete os cartões e sete informações por cartão.

**Independent Test**: Com as colmeias de demonstração, abrir o app: não há barra de abas; a
colmeia 39 dias sem coleta diz "Ir coletar"; a de bateria fraca diz "Trocar a bateria"; o
botão Coletar abre a coleta pelo cabo.

**Acceptance Scenarios**:

1. **Given** colmeias com situações diferentes, **When** o Início abre, **Then** cada cartão
   mostra UMA linha de situação, escolhida pela ordem de FR-003, com ícone, cor e palavra.
2. **Given** qualquer colmeia com leituras, **Then** o cartão mostra "No celular" e "Na nuvem"
   como números separados (Princípio I).
3. **Given** o Início aberto, **When** o apicultor toca em Coletar, **Then** abre a tela de
   coleta pela placa (cabo, ou placa simulada onde não há cabo).
4. **Given** o Início aberto, **When** o apicultor toca em Ajustes ou em Enviar, **Then** abre
   a tela correspondente, e Voltar retorna ao Início.

---

### User Story 2 - Coletar sem pensar em detalhes (Priority: P1)

Na tela de coleta, o apicultor vê três passos (ligar o cabo, apertar o botão da placa, tocar
em Coletar) e a colmeia escolhida em uma linha. A lista de colmeias só abre se ele quiser
trocar, ou se ainda não houver colmeia lembrada.

**Why this priority**: A coleta é o motivo do app. Hoje a lista de colmeias ocupa a tela
antes dos passos.

**Independent Test**: Na web, com a placa simulada: abrir Coletar, ver a colmeia lembrada
numa linha, tocar em Coletar, ver o resultado e voltar ao Início.

**Acceptance Scenarios**:

1. **Given** uma colmeia lembrada da última coleta pelo cabo, **When** a tela abre, **Then**
   ela aparece numa linha com o botão "Trocar", e a lista fica fechada.
2. **Given** nenhuma colmeia lembrada, **When** a tela abre, **Then** a lista aparece aberta.
3. **Given** a lista aberta, **When** o apicultor escolhe uma colmeia, **Then** a lista fecha
   e a linha mostra a escolhida.

---

### User Story 3 - Ver a colmeia, números primeiro (Priority: P2)

Na colmeia, as quatro grandezas e o gráfico vêm primeiro. A explicação sobre os voláteis
fica atrás de "O que são voláteis?", que abre ali mesmo, sem outra tela.

**Independent Test**: Abrir uma colmeia: o gráfico aparece logo depois dos quatro números;
tocar em "O que são voláteis?" mostra a explicação; tocar de novo esconde.

**Acceptance Scenarios**:

1. **Given** uma colmeia com leituras, **Then** o rótulo "Voláteis (COVs)" e "em relação ao
   normal desta colmeia" continuam no cartão de voláteis (007, Princípio VI).
2. **Given** a explicação fechada, **When** o apicultor toca em "O que são voláteis?", **Then**
   o texto completo da explicação (incluindo "Não é CO₂") aparece.

---

### User Story 4 - As leituras saem sozinhas quando há internet (Priority: P2)

Com o celular já ligado ao projeto, ao abrir o Início com internet as leituras pendentes são
enviadas sem toque. Sem internet, nada acontece e nada aparece como erro.

**Independent Test**: Ligar o celular ao projeto de demonstração, coletar, voltar ao Início:
"Na nuvem" passa a ser igual a "No celular" sem tocar em Enviar.

**Acceptance Scenarios**:

1. **Given** celular ligado ao projeto e leituras pendentes, **When** o Início ganha foco,
   **Then** o envio começa em segundo plano e a linha de envio diz "Enviando…".
2. **Given** celular sem internet, **When** o Início ganha foco, **Then** a linha de envio diz
   quantas leituras esperam internet, sem "erro" nem "falha".
3. **Given** um envio em andamento, **When** o apicultor abre Enviar e toca em "Enviar agora",
   **Then** não começa um segundo envio ao mesmo tempo.
4. **Given** celular não ligado ao projeto, **Then** nada é enviado sozinho.

### Edge Cases

- Nenhuma colmeia cadastrada: o Início diz que não há colmeias e o botão Coletar continua lá
  (a coleta explica o que falta).
- Fonte do sistema em 200%: a linha de situação quebra em vez de cortar.
- Bateria não informada pelo firmware: o cartão não mostra bateria (não há "Não informada").

## Requirements *(mandatory)*

### Functional Requirements

- **FR-001**: O app NÃO DEVE ter barra de abas. A tela-base é o Início (lista de colmeias).
- **FR-002**: O Início DEVE ter, no terço inferior, o botão "Coletar", que abre a coleta pela
  placa (`/coleta-cabo`); e, no cabeçalho, acesso a Ajustes.
- **FR-003**: Cada cartão DEVE mostrar uma única linha de situação, com ícone, cor e palavra,
  escolhida nesta ordem: coleta incompleta; trocar a bateria agora; coleta muito atrasada;
  coleta atrasada; bateria acabando; coletar em breve; ainda sem coleta; tudo certo.
- **FR-004**: O cartão DEVE manter temperatura em destaque, umidade e voláteis relativos
  (007) e os números "No celular" e "Na nuvem" separados (Princípio I).
- **FR-005**: O aviso de coleta atrasada acima da lista DEVE sair; o cabeçalho diz quantas
  colmeias precisam de visita (coleta incompleta ou atrasada, ou bateria para trocar agora).
- **FR-006**: O Início DEVE ter uma linha de envio com o total no celular, o total na nuvem e
  o botão "Enviar", que abre a tela Enviar (FR-001 da 002: envio manual sempre acessível).
- **FR-007**: Com o celular ligado ao projeto e leituras pendentes, o Início DEVE iniciar o
  envio em segundo plano ao ganhar foco, sem bloquear a tela e sem mensagem de falha. Nunca
  dois envios ao mesmo tempo.
- **FR-008**: A tela de coleta DEVE se chamar "Coletar" e mostrar a colmeia escolhida em uma
  linha com "Trocar"; a lista de colmeias só aparece aberta quando não há colmeia lembrada
  ou quando o apicultor toca em "Trocar".
- **FR-009**: No detalhe da colmeia, a explicação dos voláteis DEVE ficar recolhida atrás de
  "O que são voláteis?" e o gráfico DEVE vir logo depois das quatro grandezas.
- **FR-010**: O Modo sol continua a um toque, no topo do Início (`.claude/rules/ui.md`), e
  também em Ajustes.
- **FR-011**: A coleta sem fio simulada DEVE continuar disponível em Ajustes, no bloco de
  demonstração, enquanto o transporte ativo for o simulado.
- **FR-012**: Todo texto novo vem do módulo de i18n, sem "hive", "device", "sync", "sample"
  nem "CO2".

## Success Criteria *(mandatory)*

### Measurable Outcomes

- **SC-001**: Do Início à coleta da placa: 1 toque (antes: 2, pela aba Coletar e por
  "Coletar pelo cabo").
- **SC-002**: Telas alcançáveis sem entrar em Ajustes: 4 (Início, Coletar, Colmeia, Enviar);
  antes, 4 abas + colmeia + coleta pelo cabo.
- **SC-003**: Linhas de informação por cartão: no máximo 5 (nome, situação, temperatura,
  umidade/voláteis, celular/nuvem); antes, até 7.

## Assumptions

- A conversa com a placa, a gravação e as regras de hora são as das features 003, 005 e 006,
  sem mudança. Nada sobre o nó sensor é suposto aqui.
- O envio automático usa o mesmo motor (`enviarPendentes`) e a mesma sonda de internet da 002.

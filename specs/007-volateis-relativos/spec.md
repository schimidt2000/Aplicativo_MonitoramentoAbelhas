# Feature Specification: Voláteis relativos ao normal de cada colmeia

**Feature Branch**: `feat/007-volateis-relativos`

**Created**: 2026-11-05

**Status**: Draft

**Input**: "O app mostra os voláteis como número cru (1.284 ppb). A regra do projeto (CLAUDE.md,
Non-negotiables; `.claude/rules/ui.md`, Honestidade na tela) manda mostrar os voláteis como
tendência e anomalia **relativa à própria colmeia**, nunca como número cru nem comparando
colmeias. Decisão 10 da revisão de português (2026-10-28)."

## Clarifications

### Session 2026-11-05

- Q: O que é "o normal" de uma colmeia? → A: A mediana das médias diárias de voláteis da própria
  colmeia nos 14 dias anteriores ao dia da última leitura, só com leituras boas do sensor de gás
  (as que já entram na média do dia). Precisa de pelo menos 3 dias; antes disso, o app diz que
  ainda está aprendendo. Contar a partir de hoje deixava "aprendendo" toda colmeia que não é
  coletada há duas semanas, mesmo com meses de histórico.
- Q: Quando é "acima" ou "abaixo"? → A: A partir de 50 % de diferença para o normal
  (**provisório**, a calibrar com as pesquisadoras). Dentro disso, "normal".
- Q: E o painel das pesquisadoras? → A: Fica como está nesta feature: ele já não mostra voláteis
  na visão geral e é ferramenta de análise, não de campo.

## User Scenarios & Testing *(mandatory)*

### User Story 1 - Ver se os voláteis estão normais para a colmeia (Priority: P1)

O apicultor olha o cartão da colmeia e vê "Voláteis normal", "Voláteis 65 % acima do normal",
"40 % abaixo do normal" ou "aprendendo o normal", em vez de um número em ppb que ele não sabe
interpretar e que não se compara entre colmeias.

**Why this priority**: É a regra de honestidade do canal de gás. Um número cru convida a
comparar colmeias e a ler "ppb" como medida absoluta, o que o sensor não sustenta.

**Independent Test**: Colmeia com 14 dias de leituras boas e a última leitura 65 % acima da
mediana: o cartão diz "65 % acima do normal". Colmeia com 2 dias: "aprendendo o normal".

**Acceptance Scenarios**:

1. **Given** uma colmeia com pelo menos 3 dias de leituras boas, **When** o apicultor abre a
   lista de colmeias, **Then** cada cartão mostra os voláteis em relação ao normal daquela
   colmeia, sem ppb.
2. **Given** uma colmeia com menos de 3 dias de leituras boas, **Then** o cartão diz que o app
   ainda está aprendendo o normal dela.

---

### User Story 2 - Gráfico dos voláteis relativo ao normal (Priority: P2)

No detalhe da colmeia, a aba Voláteis mostra a média de cada dia como diferença percentual para
o normal da colmeia, com a linha do zero sendo o normal. Dias sem leitura boa continuam como
vãos.

**Independent Test**: A aba Voláteis desenha percentuais, e a legenda explica que o zero é o
normal desta colmeia; sem normal ainda, a aba explica o que falta em vez de desenhar.

**Acceptance Scenarios**:

1. **Given** o normal já calculado, **When** a aba Voláteis é aberta, **Then** o gráfico mostra
   "+" e "−" em % do normal desta colmeia.
2. **Given** o normal ainda não calculado, **Then** a aba diz quantos dias de leitura boa há e
   quantos faltam.

### Edge Cases

- Leituras com o sensor de gás aquecendo ou sem informação de situação não entram na média do
  dia (regra da 001) e, por isso, não entram no normal. A placa do firmware atual não informa a
  situação do sensor: as colmeias dela ficam "aprendendo" até o firmware mandar (D-517).
- Normal zero (sensor só devolveu 0): não há como dividir; fica "aprendendo".
- A última leitura sem valor de voláteis: "sem valor", como hoje.

## Requirements *(mandatory)*

### Functional Requirements

- **FR-001**: O app NÃO DEVE mostrar voláteis em ppb nos cartões das colmeias nem no quadro da
  colmeia.
- **FR-002**: O normal de uma colmeia DEVE ser a mediana das médias diárias de voláteis dos 14
  dias anteriores ao dia da última leitura, só com dias que têm média (leituras boas), exigindo pelo menos 3 dias.
- **FR-003**: A diferença DEVE ser `(valor ÷ normal − 1) × 100`, arredondada a inteiro;
  "normal" quando |diferença| < 50 %, senão "acima" ou "abaixo", com o percentual.
- **FR-004**: O gráfico de voláteis DEVE desenhar a diferença percentual de cada dia para o
  normal, mantendo os vãos.
- **FR-005**: Sem normal, os textos DEVEM dizer que o app está aprendendo o normal e quantos dias
  de leitura boa faltam.
- **FR-006**: Todo texto vem do módulo de i18n; nenhuma menção a CO₂.

## Success Criteria *(mandatory)*

### Measurable Outcomes

- **SC-001**: Nenhuma tela do app de campo mostra "ppb" fora da tela de bancada (004).
- **SC-002**: Os testes da regra (mediana, limiares, mínimo de dias, normal zero) passam.

## Assumptions

- Os limiares são provisórios; a regra fica numa função pura, fácil de ajustar.
- A tela de bancada (004), que é para a equipe técnica, continua mostrando o valor do sensor.

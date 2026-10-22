# Specification Quality Checklist: Coleta real pelo cabo, com o protocolo do firmware

**Purpose**: Validate specification completeness and quality before proceeding to planning
**Created**: 2026-10-21
**Feature**: [spec.md](../spec.md)

## Content Quality

- [x] No implementation details (languages, frameworks, APIs)
- [x] Focused on user value and business needs
- [x] Written for non-technical stakeholders
- [x] All mandatory sections completed

## Requirement Completeness

- [x] No [NEEDS CLARIFICATION] markers remain (decisões do dono do produto em Clarifications)
- [x] Requirements are testable and unambiguous
- [x] Success criteria are measurable
- [x] Success criteria are technology-agnostic (no implementation details)
- [x] All acceptance scenarios are defined
- [x] Edge cases are identified
- [x] Scope is clearly bounded
- [x] Dependencies and assumptions identified

## Feature Readiness

- [x] All functional requirements have clear acceptance criteria
- [x] User scenarios cover primary flows
- [x] Feature meets measurable outcomes defined in Success Criteria
- [x] No implementation details leak into specification

## Notes

- As mensagens do protocolo (`HELLO`, `READY`, `FILE_INFO`, `ERROR:*`…), "115200 baud",
  "CRC-32/ISO-HDLC", "little-endian" e o tamanho dos campos aparecem porque **são o contrato
  de outra equipe** (`COMMUNICATION_PROTOCOL.md`, commit `e93f8ad`). Nenhum requisito escolhe
  biblioteca do nosso lado.
- "Chrome", "Edge", "Safari", "Firefox" e "Android" descrevem onde a pessoa está, para a
  Matriz de Capacidades; não são escolha de implementação.
- A regra de chave (`início × 1.000.000 + número`) está na spec, e não só no plano, porque é
  o que torna a reimportação sem efeito testável por quem não lê código (SC-002).
- A FR-017 fixa números (a última medição até um intervalo antes da coleta, folga de 10 min ou 5 %; revista em 2026-10-22) porque a FR-016 da 003
  proibia estimar pela posição: a emenda precisa dizer exatamente quando pode. A folga de 5 % é
  marcada como provisória em Assumptions.
- O usuário da tela é o apicultor ou a pesquisadora no computador; as medidas do Princípio V
  valem porque a tela faz parte do app de campo.
- Nenhuma pergunta ficou aberta para `/speckit-clarify`: as oito decisões vieram do dono do
  produto (João) no briefing de 2026-10-21 e estão em Clarifications.

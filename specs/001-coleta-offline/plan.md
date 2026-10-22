# Implementation Plan: Coleta e visualização offline de leituras de colmeia

**Branch**: `feat/001-coleta-offline` | **Date**: 2026-09-10 | **Spec**: [spec.md](./spec.md)

**Input**: Feature specification from `specs/001-coleta-offline/spec.md`

## Summary

Fatia vertical do transporte até a tela, rodando contra uma fonte de dados simulada. Entrega
o banco local append-only com ingestão idempotente, o decodificador versionado, a interface
de transporte, e as telas de lista, coleta, detalhe, gráfico e diagnóstico — mais exportação
CSV. Nada depende do firmware da outra equipe.

A abordagem técnica é determinada por uma restrição medida: **`expo-sqlite` não funciona no
navegador** (cinco modos de falha verificados, dois fatais). A solução é uma porta de
repositório única com três drivers síncronos do Drizzle, todos com tipo idêntico. Detalhes e
evidências em [research.md](./research.md).

## Technical Context

**Language/Version**: TypeScript ~6.0.3

**Primary Dependencies**: Expo SDK ~57.0.21 · Expo Router ~57.0.20 · React Native 0.86.3 ·
React 19.2.3 · react-native-web ~0.21.0 · drizzle-orm 0.45.2 · expo-sqlite ~57.0.2 (nativo) ·
sql.js 1.14.2 (web) · react-native-svg 15.15.4 · zod 4.6.1

**Storage**: SQLite. `expo-sqlite` no Android, `sql.js` + IndexedDB no navegador,
`better-sqlite3` nos testes. Um único esquema Drizzle e um único módulo de repositório.

**Testing**: vitest 4.1.11 com better-sqlite3 13.0.3, exercitando o mesmo SQL das outras
plataformas.

**Target Platform**: Android 8.0 (API 26) e navegador Chromium de desktop. iOS descopado.

**Project Type**: Aplicativo móvel universal, artefato único. Sem monorepo (D-002).

**Performance Goals**: Arranque a frio ≤ 3,5 s p50 / ≤ 5,0 s p95; pico ≤ 150 MB PSS; nenhum
bloqueio de thread de UI acima de 100 ms. **Provisórios** até a medição desta feature.

**Constraints**: Offline é o estado normal — nenhuma tela do fluxo principal pode chamar rede.
Teto de 150 MB no banco local. `web.output` deve ser `"single"`.

**Scale/Scope**: 11 telas no MVP do projeto; **6 nesta feature**. Volume de referência:
10.000 leituras por colmeia roláveis sem travamento.

## Constitution Check

*GATE: Must pass before Phase 0 research. Re-check after Phase 1 design.*

| Princípio | Veredito | Evidência |
|---|---|---|
| I. Offline por Padrão | PASS | Tabela Comportamento Offline abaixo. Nenhuma chamada de rede existe nesta feature — não há nem cliente HTTP. |
| II. Orçamento de Desempenho | PASS | Orçamentos declarados em Technical Context como provisórios. `FlatList` escolhida sobre `FlashList` por risco de plataforma (D-006); nenhuma biblioteca de gráficos. Medição é entregável da feature e re-ratifica a tabela por emenda MINOR. |
| III. Leituras Imutáveis e Idempotentes | PASS | PK `(node_id, seq)`, `boot_id` fora da chave, sem `UPDATE`/`DELETE`. Invariantes INV-1 a INV-9 em [data-model.md](./data-model.md), cada uma virando teste no CI. |
| IV. O Payload é Externo | PASS | Interface única em [contracts/transport.md](./contracts/transport.md); decodificador versionado com tabela `versão → parser`; carga bruta preservada em `pull_session`; `mock` completo entregue **antes** de qualquer transporte real; Matriz de Capacidades no contrato. |
| V. Ergonomia de Campo em pt-BR | PASS | Alvos ≥ 56 dp, corpo ≥ 16 sp, leitura ≥ 32 sp, contraste ≥ 7:1, Modo sol (FR-025). Todas as strings em `src/core/i18n`. Regras detalhadas em `.claude/rules/ui.md`. |
| VI. Honestidade do Dado | PASS | Canal de gás rotulado "Voláteis (COVs)" (FR-017); `eco2_ppm` guardado e nunca exibido como CO₂; bruto preservado com `calib_version` e offset separado (FR-013); lacunas em vez de interpolação (FR-019); `excluded_count` em todo resumo (FR-020); resumos não cruzam `sensor_epoch`. |
| VII. Especificação Antes do Código | PASS | `specs/001-coleta-offline/` com spec, checklist validado, research, data-model e contracts. Suposições sobre o nó registradas em `docs/integracao-firmware.md` como não confirmadas. |

Nenhuma violação. `## Complexity Tracking` fica vazio.

### Tabela Comportamento Offline

Exigida pelo Princípio I, uma linha por tela desta feature.

| Tela / Ação | Sem rede | Rede intermitente | Fonte do dado |
|---|---|---|---|
| Colmeias (lista) | Funciona integralmente | Idêntico | SQLite local |
| Coletar | Funciona integralmente | Idêntico | Transporte `mock` |
| Colmeia (detalhe) | Funciona integralmente | Idêntico | SQLite local |
| Gráfico 7/30 dias | Funciona integralmente | Idêntico | `reading_daily` local |
| Diagnóstico de conexão | Funciona integralmente | Idêntico | `Transport.preflight()` |
| Exportar CSV — não entregue no app de campo (a planilha é do painel, 002) | — | — | — |

Nenhuma tela desta feature chama rede em nenhum caminho. O estado de envio é exibido a partir
de `synced_at`, mas nada é enviado — a sincronização é a 002; a 004 é o monitor pelo cabo.

## Project Structure

### Documentation (this feature)

```text
specs/001-coleta-offline/
├── spec.md
├── plan.md                  # este arquivo
├── research.md              # Fase 0
├── data-model.md            # Fase 1
├── quickstart.md            # Fase 1
├── contracts/
│   └── transport.md         # Fase 1
├── checklists/
│   └── requirements.md
└── tasks.md                 # gerado por /speckit-tasks
```

### Source Code (repository root)

```text
app/                         # Expo Router — rotas por arquivo
├── _layout.tsx
├── index.tsx                # Colmeias (lista)
├── coletar.tsx              # Coleta
├── diagnostico.tsx          # Diagnóstico de conexão
└── colmeia/[id].tsx         # Detalhe + gráfico

src/
├── core/                    # domínio puro. ZERO import de plataforma
│   ├── ports/transport.ts   # a interface
│   ├── decode/              # decodificador versionado
│   ├── time/anchor.ts       # ancoragem de relógio
│   ├── format/              # números pt-BR, datas, bateria
│   └── i18n/                # todas as strings visíveis
├── transports/              # ÚNICO lugar que importa SDK de transporte
│   ├── mock/
│   └── file/
├── data/
│   ├── schema.ts            # um esquema Drizzle para os três drivers
│   ├── db.native.ts         # expo-sqlite
│   ├── db.web.ts            # sql.js + IndexedDB
│   ├── repo.ts              # UM módulo de acesso a dados
│   ├── ingest.ts            # ingestão idempotente + resumos
│   └── export.ts            # CSV com cabeçalho de proveniência
└── ui/
    ├── tokens.ts            # ~24 tokens; tema claro; Modo sol
    └── components/

drizzle/                     # migrações geradas
tests/                       # vitest + better-sqlite3
```

**Structure Decision**: artefato único, sem monorepo (D-002). O Princípio IV exige disciplina
de importação, não empacotamento físico — `src/transports/` como único lugar autorizado a
importar SDK satisfaz o princípio, e é verificado por regra de lint. Quando o painel web
(feature 005) existir, extrair `src/core/` para um pacote é movimento mecânico.

**Consequência registrada**: `CLAUDE.md` e `.claude/rules/*.md` foram escritos assumindo
monorepo (`packages/core`, `apps/mobile/...`). Os globs de `paths:` **não casariam com nada**
nesta estrutura. Atualizá-los é tarefa desta feature, não item opcional — regra que não
carrega é regra que não existe.

## Complexity Tracking

Sem violações do Constitution Check. Nada a justificar.

## Constitution Check — reavaliação pós-Fase 1

Reavaliado após `research.md`, `data-model.md` e `contracts/transport.md`.

Os sete vereditos permanecem PASS. Dois pontos ganharam evidência mais forte durante o
projeto detalhado:

- **Princípio II** ficou mais bem servido do que na avaliação inicial: as duas decisões de
  maior impacto em desempenho — `FlatList` em vez de `FlashList` (D-006) e `sql.js` em vez da
  ponte síncrona do `expo-sqlite` (D-001, 53 ms contra 1.812 ms) — foram tomadas com número
  medido, não por preferência.
- **Princípio IV** teve o mecanismo tornado concreto: o `AsyncIterable` de `pullReadings`
  impede por construção que a memória exploda, e o formato v1 é explicitamente **nosso, não
  da equipe de hardware**, existindo apenas para o `mock` até o formato real chegar.

## Dívidas pagas em 2026-10

Branch `fix/001-dividas-de-tela`. Não é feature nova: paga, contra os requisitos que esta
spec já tinha, o que a revisão de 2026-10-14 confirmou nas telas (lente "ui" e itens
"testes:6/7/11"). Os itens já corrigidos em `7e424a0` (detalhe do aviso em 16 sp, 12 dp em
Ajustes, rede de segurança da coleta, "ficaram salvas" com a gravação final falhando) não
estão repetidos aqui.

| Dívida | Requisito | O que mudou | Evidência |
|---|---|---|---|
| Texto literal em componente | Princípio V; portão 2 | Enviar, Ajustes, Diagnóstico, Colmeia, lista, abas, `Grafico`, abertura do banco e preflight do `mock` tiram o texto de `src/core/i18n` (bloco "Frente: dívidas de tela"). Nome do meliponário vem do banco (`nomeDoApiario`). | `tests/telas.test.ts` (parser do TypeScript sobre os `.tsx` de `src/app` e `src/ui`, com teste do próprio verificador; em filho JSX ou atributo visível reprova até palavra solta em minúsculas, como `{ok ? 'pronto' : 'pendente'}`) |
| Vocabulário | `docs/glossario.md` | "nó sensor", relógio do nó sensor, "aplicativo", "leituras". A garantia de Enviar deixou de prometer que o nó sensor guarda cópia (não confirmado). | `tests/mensagens.test.ts`, bloco "todo texto do módulo" |
| Retorno redundante | FR-007 | Vibração (1 pulso no sucesso, 3 no problema) e anúncio ao leitor de tela, cada um em try/catch; na web o padrão perde a espera inicial. | `tests/retorno.test.ts` |
| Acessibilidade | Princípio V | Aviso como um bloco com rótulo composto; barra com `progressbar` e valor; `radiogroup`/`radio` com `checked`; `ActivityIndicator` com rótulo; ícone SVG no lugar de "✓"/"!". | revisão de código; sem leitor de tela real (ver pendências) |
| Borda de controle < 3:1 | Princípio V, 3:1 em bordas | Token `bordaControle` (#8A8578: 3,7:1 / 3,4:1) em botões secundários, opções, modo sol, card tocável, abas e campo de código. Comentários de contraste corrigidos. | `tests/tokens.test.ts` |
| Card da colmeia | FR-021, Princípio V (200%) | "Última coleta incompleta" em linha própria, 14 sp, cor primária, sem truncar; `minHeight` e sem `getItemLayout`. Textos de 12 sp do card, gráfico e Enviar vão a 14 sp. Abas do gráfico a 56 dp com 12 dp. | revisão de código; medição a 200% pendente |
| Coletar | FR-007, Princípio V (terço inferior) | Linha "Simulação ligada: …" com ícone no ocioso; resultado com rodapé fixo de botões e avisos rolando acima. | revisão de código |
| Diagnóstico calado (revisão de 2026-10-21) | Princípio V (mensagem diz o que houve e o que fazer) | Se `preflight()` lançar, a tela deixava de mostrar item nenhum, sem explicar; agora mostra "Não consegui fazer a verificação agora" com cor, ícone e palavra, e o que fazer. Hoje o `mock` não lança: vale para o transporte real. | revisão de código |
| Testes frouxos | testes:6, testes:7, testes:11 | `recebidas`, `dias`, progresso, sessão `nao_conectou`, hora lida no envio, `close()` que lança, flag `semRespostaHorario`, `setTime` "unsupported", mapa de `obterTransporte`; palavras proibidas com flexões e promessas sobre o nó varridas em todas as chaves. | `tests/coleta.test.ts`, `tests/transportes.test.ts`; cada reforço conferido por mutação |

### Constitution Check — dívidas de tela

| Princípio | Veredito | Evidência |
|---|---|---|
| I. Offline por Padrão | PASS | Nenhuma tela ganhou chamada de rede; a tabela Comportamento Offline acima não muda. Teste em modo avião no aparelho: não feito nesta branch. |
| II. Orçamento de Desempenho | N/A | Nenhuma dependência nova. A lista de colmeias perdeu `getItemLayout` (dezenas de itens, virtualização mantida); efeito não medido no aparelho de referência. |
| III. Leituras Imutáveis e Idempotentes | PASS | Nada toca `reading`; `npm run check:fronteira` verde; teste de reimportação segue em `tests/coleta.test.ts`. |
| IV. O Payload é Externo | PASS | Diagnóstico deixou de importar `MockTransport` e usa `obterTransporte()`; `check:fronteira` verde. |
| V. Ergonomia de Campo em pt-BR | VIOLAÇÃO (herdada, reduzida) | O que esta branch tocou passa: `tests/telas.test.ts`, `tests/tokens.test.ts`, `tests/mensagens.test.ts`, `tests/retorno.test.ts`. Continuam violando, sem terem sido introduzidas aqui: palavras visíveis em `src/core/format`, texto branco a 5,9:1 nos botões primários e texto em cor de estado abaixo de 7:1 (ver a linha própria no Complexity Tracking). Ver Complexity Tracking abaixo. |
| VI. Honestidade do Dado | PASS | Enviar não promete mais a cópia do nó sensor; anúncio e cabeçalho não dizem "ficaram salvas" sem a gravação final (`tests/retorno.test.ts`). |
| VII. Especificação Antes do Código | PASS | Requisitos já estavam nesta spec (FR-007, FR-021, Princípio V); esta seção registra o pagamento. |

### Complexity Tracking — dívidas de tela

| Violação | Por que fica | Alternativa mais simples rejeitada |
|---|---|---|
| Palavras visíveis em `src/core/format` (bateria, frescor, nível de coleta) | `src/core/i18n/index.ts` importa `fmtNumero` de `format`; fazer `format` importar o i18n cria import circular, e a correção certa (mover `fmtNumero` ou injetar os rótulos) mexe em arquivo de todas as frentes. | Copiar as palavras para `pt-BR.ts` e manter as de `format` — rejeitada: duas fontes do mesmo texto divergem. |
| Texto branco sobre `acento` a 5,9:1 nos botões primários (< 7:1) | Trocar `acento` muda a identidade de todas as telas e do painel; precisa de decisão de produto e de nova checagem de todos os pares. | Escurecer só o fundo dos botões — rejeitada sem medir sob sol: cria um segundo âmbar fora dos tokens. |
| Texto em cor de estado abaixo de 7:1 (revisão de 2026-10-21): manchete de sucesso de Coletar e "N leituras enviadas" em `ok` (6,5:1 sobre `fundo`); rótulo ativo de aba, opção, abas do gráfico, modo sol e botão "Ligar ao projeto" em `acento` (5,4–5,9:1); "Mantenha a tela ligada" e "Estas leituras são antigas" em `atencao` (4,6:1); estado de envio em `neutro` (6,4:1) | Mesma decisão de produto da linha acima: escurecer `ok`/`acento`/`atencao` muda todas as telas; trocar o texto para `texto` com o ícone na cor (como no marcador de coleta incompleta) é mudança visual em cinco telas e fica para a mesma decisão. `tests/tokens.test.ts` só garante 4,5:1 para essas cores. | Declarar essas frases "secundárias" para caberem em 4,5:1 — rejeitada: são manchete ou estado, o que o apicultor lê primeiro. |

### Ainda pendente (encontrado ao pagar, fora desta branch)

- `src/core/format` ainda escreve palavras ("Boa", "Trocar agora", "Há 3 dias", "Coleta
  atrasada"). Migrar exige quebrar o import circular `i18n → format`.
- Texto branco sobre `acento` nos botões primários dá 5,9:1, abaixo dos 7:1 de texto
  primário. Pede um `acento` mais escuro ou uma regra explícita para rótulo de botão.
- O preflight do `mock` afirma "Espaço disponível no aparelho" sem medir.
- Revisão de 2026-10-21: o verificador de texto literal passou a pegar frase montada em
  template fora do JSX (`` `${n} dias` `` numa variável) e propriedade que chega à tela
  (`options={{ title }}`, `accessibilityValue={{ text }}`). Continua sem pegar palavra solta
  em minúsculas montada fora do JSX (`n === 1 ? 'dia' : 'dias'`), que é indistinguível de
  identificador sem análise de fluxo; `tp()` é o caminho, e a revisão de código, a rede.
- A coleta ainda não tem limite próprio no `connect` nem botão de cancelar (revisão ui:14).
- Não verificado em aparelho: fonte do sistema a 150–200%, TalkBack, vibração no Android
  (a permissão `VIBRATE` vem do template padrão do Expo, sem `android.permissions` em
  `app.json`) e `navigator.vibrate` no Chrome do Android.

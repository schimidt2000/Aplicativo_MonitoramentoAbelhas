# Implementation Plan: Coleta real pelo cabo, com o protocolo do firmware

**Branch**: `feat/005-coleta-pelo-cabo` | **Date**: 2026-10-21 | **Spec**: [spec.md](./spec.md)

**Input**: Feature specification from `/specs/005-coleta-pelo-cabo/spec.md`

## Summary

O app de campo no navegador passa a **coletar de verdade** a placa do grupo do firmware pelo
cabo USB (Web Serial, Chrome/Edge de computador), com o protocolo do commit `e93f8ad`:
`HELLO`/`READY`/`GET_FILE`/`FILE_INFO`/binário/`RECEIVED`/`TRANSFER_OK`/`REQUEST_TIMESTAMP`/
hora/`SESSION_COMPLETE`. O arquivo é lido por um leitor versionado (`arquivo-0`), gravado
**antes** de confirmar à placa, e a hora de cada leitura sai da conta início + número ×
intervalo, conferida contra a hora do fim da coleta, pelo mesmo modelo de horas da 003.

Camadas, cada uma onde a constituição manda:

1. `src/core/` — puro: CRC-32 (`cabo/crc32.ts`), linhas do protocolo (`cabo/linhas.ts`),
   máquina de estados (`cabo/protocolo.ts`, `cabo/placaNova.ts`), executor sobre a porta
   (`cabo/sessao.ts`), textos (`cabo/mensagens.ts`), contagem dos 30 s (`cabo/passos.ts`),
   leitor `arquivo-0` (`decode/arquivo.ts`), hora por contagem (`hora/contagem.ts`), porta
   `CanalSerial` (`ports/canal.ts`).
2. `src/transports/` — o único lugar que toca a porta: leitor de bytes linha/N bytes
   (`cable/entrada.ts`), Web Serial com a porta que some e reaparece (`cable/coleta.ts`), e a
   placa simulada fiel ao `.ino` (`mock/firmware.ts`).
3. `src/data/` — migração 3, gravação durável antes do `RECEIVED` e resultado
   (`coletaCabo.ts`), hora com intervalo e `ms_por_unidade` (`hora.ts`), cadastro do intervalo
   e do MAC (`repo.ts`).
4. `src/app/` — telas "Coletar pelo cabo" e "Configurar placa nova"; resultado reaproveitado
   da coleta (`src/ui/ResultadoDaColeta.tsx`); intervalo da placa na tela da colmeia.

## Technical Context

**Language/Version**: TypeScript ~6.0 (strict), React 19.2, React Native 0.86 /
react-native-web 0.21

**Primary Dependencies**: Expo SDK 57, expo-router, react-native-svg (já instalados).
**Nenhuma dependência nova.** Tipos da Web Serial declarados à mão (como na 004). CRC-32 com
tabela própria (256 entradas), sem biblioteca.

**Storage**: SQLite (expo-sqlite no celular, sql.js no navegador, better-sqlite3 nos testes),
esquema versão 3 por `PRAGMA user_version`. Ver [data-model.md](./data-model.md).

**Testing**: vitest 4 em Node. A placa simulada (`src/transports/mock/firmware.ts`) fala pela
mesma `EntradaDeBytes` do cabo real, em pedaços arbitrários, com prazos de centenas de
milissegundos. Testes de ponta a ponta: placa simulada + máquina de estados + executor +
gravação (better-sqlite3) + hora.

**Target Platform**: app de campo no navegador, Chrome e Edge de computador. App Android/iOS,
Safari, Firefox e navegador de celular: a tela explica o caminho (Matriz abaixo).

**Project Type**: mobile-app (Expo) com alvo web.

**Performance Goals**: um arquivo de 7 dias a 2 h tem 1.368 bytes (≈ 0,1 s no fio). O de 30
dias, 5.768 bytes. Decodificar e gravar 10.000 leituras: medido em Node (seção Verificação).

**Constraints**: nenhuma chamada de rede; `RECEIVED` só depois de `persist()`; arquivo
anunciado acima de 8 MiB recusado; registro da conversa limitado a 16 KB; linha de
protocolo limitada a 512 bytes.

**Scale/Scope**: 2 telas novas, 1 componente extraído, ~10 módulos puros, 2 módulos de
transporte, 1 orquestrador de dados, 1 migração, ~10 arquivos de teste.

## Constitution Check

*GATE: Must pass before Phase 0 research. Re-check after Phase 1 design.* Vereditos do
desenho, com a evidência **a produzir** em cada linha; a reavaliação com o código pronto fica
em "Verificação" (Fase 7 de tasks.md) e substitui esta tabela se algum veredito mudar.

| Princípio | Veredito | Evidência |
|---|---|---|
| I. Offline por Padrão | PASS | Tabela Comportamento Offline abaixo. `tests/cabo-coleta-fronteira.test.ts` segue os imports a partir das duas telas novas e reprova `src/nuvem/`, `fetch`, `XMLHttpRequest` ou `WebSocket`. **Teste em modo avião no navegador: pendente** (T545, precisa de navegador real). |
| II. Orçamento de Desempenho | PASS (estimado em Node; aparelho não medido) | Nenhuma dependência nova (`package.json` sem diff). Custo de ler e gravar arquivos grandes medido em Node em `tests/cabo-desempenho.test.ts` (números na seção Verificação). A coleta pelo cabo não roda no aparelho de referência (só a tela de "sem suporte"). **Não medido:** pacote web (`expo export`) e o navegador real. |
| III. Leituras Imutáveis e Idempotentes | PASS | Chave `(node_id, seq)` com `seq = início × 1.000.000 + número` (D-501), `boot_id` fora. Reimportar o mesmo arquivo e um arquivo maior: `tests/cabo-ponta-a-ponta.test.ts` (INV-501, INV-502) e `tests/arquivo0.test.ts`. Nenhum `UPDATE`/`DELETE` em `reading` (`npm run check:fronteira`). Migração 3 só acrescenta coluna, com banco populado: `tests/migracao.test.ts` (INV-507). Hora por correção à parte (INV-506). |
| IV. O Payload é Externo | VIOLAÇÃO (justificada) | Leitor numa tabela `formato → leitor` (`src/core/decode/arquivo.ts`), arquivo inteiro recusado se não fecha, bruto guardado (`tests/arquivo0.test.ts`). Placa simulada **antes** do transporte real e base dos testes (`tests/firmware-simulado.test.ts`). Porta serial só em `src/transports/` (`check-fronteira.sh`, regra da 004) e `src/core/` sem import de plataforma (regra nova). Matriz de Capacidades abaixo. **Três desvios em Complexity Tracking:** o arquivo não carrega versão; a coleta usa a porta `CanalSerial`, não `Transport`; a transferência não é retomável por cursor. |
| V. Ergonomia de Campo em pt-BR | PASS (com ressalva) | Checklist da tela abaixo. Strings no bloco "Frente 005" de `src/core/i18n/pt-BR.ts`; `tests/telas.test.ts` reprova texto literal nos `.tsx` novos; `tests/cabo-mensagens.test.ts` reprova jargão e código cru em toda mensagem do cabo. **Não verificado:** fonte em 200 % e a tela num navegador real. |
| VI. Honestidade do Dado | PASS | Hora pela contagem sempre "estimada" e só com a conferência fechando; sem hora com motivo quando não fecha (`tests/hora-contagem.test.ts`, INV-505). Valor bruto em ponto flutuante guardado ao lado dos centésimos (D-509). Sem status do sensor de gás, voláteis fora das médias (D-517). eCO₂ nunca como CO₂ (`check-fronteira.sh`). |
| VII. Especificação Antes do Código | PASS (com ressalva de processo) | `specs/005-coleta-pelo-cabo/` com spec, checklist, este plano, research, data-model, contracts, quickstart e tasks (T501–T546), commitados **antes** do código. Emenda da FR-016 da 003 registrada nas Clarifications dela. Suposições sobre a placa em `docs/integracao-firmware.md`, com data e commit. **Ressalva:** a análise de consistência foi feita à mão (seção abaixo); `/speckit-analyze` não foi executado como skill. |

### Tabela Comportamento Offline

| Tela / Ação | Sem rede | Rede intermitente | Fonte do dado |
|---|---|---|---|
| Coletar pelo cabo (tela, passo a passo, contagem) | Funciona integralmente | Idêntico | Porta serial USB local |
| Coletar (conversa, gravação, hora) | Funciona integralmente | Idêntico | Porta serial + SQLite local |
| Resultado da coleta pelo cabo | Funciona integralmente | Idêntico | SQLite local |
| Configurar placa nova | Funciona integralmente | Idêntico | Porta serial + relógio do celular |
| Placa simulada (demonstração) | Funciona integralmente | Idêntico | Memória da página + SQLite local |
| Intervalo da placa (tela da colmeia) | Funciona integralmente | Idêntico | SQLite local |

### Matriz de Capacidades

| Transporte | Android (app) | iOS (app) | Navegador de computador | Navegador de celular |
|---|---|---|---|---|
| `cable` coleta (esta feature) | não suportado — precisa de módulo nativo USB e build próprio (D-515); a tela explica e aponta o computador | não suportado — idem | Chrome/Edge em endereço seguro: **suportado** · `http://` fora de `localhost`: não suportado, explica · Firefox/Safari: não suportado, explica | não suportado (conservador, como na 004) — explica |
| `cable` placa simulada (demonstração) | suportado | suportado | suportado | suportado |
| `cable` monitor de bancada (004) | inalterado | inalterado | inalterado | inalterado |
| `mock` (001) | suportado | suportado | suportado | suportado |
| `ble` | futura | futura | não suportado | não suportado |

### Checklist da tela (Princípio V)

| Item | Como | Onde |
|---|---|---|
| Alvos ≥ 56 dp, 12 dp entre eles | `minHeight: alvo.minimo` em todo botão e opção; `gap: alvo.espacamento`; linha de colmeia ≥ 72 dp | `src/app/coleta-cabo.tsx`, `src/app/placa-nova.tsx`, `src/app/colmeia/[id].tsx` |
| Corpo ≥ 16 sp; número ≥ 32 sp tabular | `tipo.corpo`; contagem dos segundos e progresso em `tipo.leitura` com `tabular-nums` | idem |
| Contraste ≥ 7:1 | texto `cores.texto`/`textoFraco`; botão primário com fundo `cores.texto` (branco sobre âmbar dá 5,9:1) | idem |
| Cor + ícone + palavra | passos (número + ícone + frase), resultado (alerta/check + "Problema"/"Aviso"), placa simulada (alerta + rótulo) | idem, `src/ui/ResultadoDaColeta.tsx` |
| Ação primária no terço inferior | Coletar e Enviar a hora numa barra fixa embaixo | telas novas |
| Sem digitação livre | colmeia e intervalo por opção; nada se digita | idem |
| Retorno redundante | texto + vibração (onde houver) + bipe (Web Audio) no fim | `src/ui/retorno.ts`, `src/ui/bipe.ts` |
| Strings via i18n | bloco "Frente 005"; `tests/telas.test.ts` | `src/core/i18n/pt-BR.ts` |
| Vocabulário | "placa" (acrescentado ao glossário para o cabo), "coleta", "leitura", "colmeia"; nunca "device", "sync", "sample", "CO₂" | `docs/glossario.md` |

## Project Structure

### Documentation (this feature)

```text
specs/005-coleta-pelo-cabo/
├── spec.md
├── checklists/requirements.md
├── plan.md                # este arquivo
├── research.md            # D-501 a D-518
├── data-model.md          # esquema versão 3, VIEW, invariantes INV-501..507
├── contracts/
│   ├── protocolo-cabo.md  # a conversa, passo a passo, e cada ERROR:*
│   └── arquivo-0.md       # o layout do arquivo, validação, chave
├── quickstart.md
└── tasks.md
```

### Source Code (repository root)

```text
src/core/
├── ports/canal.ts          # NOVO — porta CanalSerial
├── decode/arquivo.ts       # NOVO — tabela formato → leitor; arquivo-0; chave
├── cabo/                   # NOVO — domínio puro do cabo
│   ├── crc32.ts            #   CRC-32/ISO-HDLC
│   ├── linhas.ts           #   linhas de protocolo e diagnósticos
│   ├── protocolo.ts        #   máquina de estados da coleta
│   ├── placaNova.ts        #   máquina de estados do primeiro boot
│   ├── sessao.ts           #   executor das ações sobre a porta
│   ├── passos.ts           #   contagem dos 30 s
│   └── mensagens.ts        #   desfecho → avisos e textos
├── hora/contagem.ts        # NOVO — hora por contagem e conferência
├── hora/avaliar.ts, tipos.ts   # partição por modo; Faixa.msPorUnidade
├── coleta/resultado.ts, mensagens.ts   # ResultadoNo.cabo; avisos do cabo
├── ports/transport.ts      # clockMode 'contagem'; Reading.tempBruto/rhBruto
└── i18n/pt-BR.ts           # bloco "Frente 005"
src/transports/
├── cable/entrada.ts        # NOVO — bytes → linha | N bytes
├── cable/coleta.ts         # NOVO — Web Serial: porta autorizada, connect, abrir, canal
├── cable/index.ts          # + exports
└── mock/firmware.ts        # NOVO — placa simulada fiel ao .ino
src/data/
├── migracoes.ts            # + migração 3
├── coletaCabo.ts           # NOVO — orquestra, grava antes de confirmar, resultado
├── hora.ts, ingest.ts, repo.ts
src/ui/ResultadoDaColeta.tsx # extraído de coletar.tsx (sem mudar comportamento)
src/app/
├── coleta-cabo.tsx         # NOVO
├── placa-nova.tsx          # NOVO
├── (tabs)/coletar.tsx      # usa ResultadoDaColeta; link para o cabo
├── colmeia/[id].tsx        # intervalo da placa
├── diagnostico.tsx, _layout.tsx
scripts/check-fronteira.sh  # + core sem import de plataforma
tests/                      # crc32, arquivo0, protocolo, cabo-entrada, firmware-simulado,
                            # hora-contagem, cabo-ponta-a-ponta, cabo-mensagens,
                            # cabo-coleta-fronteira, cabo-desempenho, migracao (+v3)
```

**Structure Decision**: o layout do CLAUDE.md. A tela de coleta pelo cabo importa de
`@/transports/cable` e `@/transports/mock` — permitido para telas de conexão (Princípio IV) —
e de `@/data/coletaCabo`, que só conhece a porta `CanalSerial`. O monitor de bancada da 004
(`src/app/cabo.tsx`) continua sem alcançar `src/data`.

## Complexity Tracking

| Violação ou desvio | Por que é preciso | Alternativa mais simples, e por que foi rejeitada |
|---|---|---|
| **Princípio IV:** "toda carga MUST carregar uma versão de protocolo" — o arquivo não carrega | O formato é do firmware de outra equipe. O leitor é escolhido por nós (`arquivo-0`, `proto_ver = 100`, D-516) numa tabela `formato → leitor` | Esperar a versão: bloquearia a primeira coleta real. Mitigação: validação estrutural em cinco regras, a numeração 0,1,2… pega o formato mudado cujo tamanho fecha por acaso; recusa o arquivo inteiro; bruto guardado; placa sem confirmação, então nada se perde. Dependência do grupo de armazenamento registrada |
| **Princípio IV:** "todos os transportes MUST implementar uma única interface" — a coleta pelo cabo usa `CanalSerial`, não `Transport` | O protocolo exige confirmar só depois da gravação durável e mandar a hora **depois**, e essa hora apaga o arquivo da placa (D-503). `NodeSession` manda a hora antes e puxa por cursor | Encaixar em `pullReadings`, confirmando quando o consumidor pede o próximo lote: contrato invisível, que dependeria de um `persist()` fora do laço. Mitigação: o mesmo tipo `Reading`, a mesma ingestão, a mesma hora, o mesmo resultado e as mesmas mensagens; a porta está em `core/ports/` e só `transports/` a implementa |
| **Princípio IV:** "toda transferência MUST ser retomável por cursor" — o firmware manda o arquivo inteiro | O protocolo não tem cursor; não é nosso | Nenhuma do nosso lado. Mitigação equivalente: a placa só apaga depois de receber a hora, que só vai depois da gravação durável; uma queda em qualquer ponto deixa o arquivo na placa, e a próxima coleta o traz inteiro de novo, sem duplicar (INV-501, INV-502) |
| **Regra (constituição, Princípio III):** o contador do nó é "monotônico" — `seq` é derivado, não contado pela placa | A placa zera a numeração a cada coleta (D-501) | Usar o `id` cru: viola a unicidade da chave entre coletas. O `seq` derivado é único, determinístico e cresce com o tempo; o `id` cru fica imutável em `t_node` |

## Análise cruzada (substitui `/speckit-analyze`, feita à mão)

- Cada FR tem tarefa: FR-001–005 → T510–T514; FR-006–011 → T520–T524; FR-012–014 → T505–T507;
  FR-015–019 → T515–T518; FR-020–023 → T523, T530; FR-024–025 → T513, T531; FR-026–033 →
  T530–T536; FR-034 → T508–T509.
- Cada história tem teste independente: US1 e US3 em `tests/cabo-ponta-a-ponta.test.ts`; US2 em
  `tests/hora-contagem.test.ts`; US4 e US5 em `tests/cabo-ponta-a-ponta.test.ts`; US6 em
  `tests/cabo-mensagens.test.ts` (textos de "sem suporte").
- Conflito com MUST da constituição: os três desvios do Princípio IV estão acima, justificados;
  nenhum CRITICAL aberto.
- Terminologia: "placa" (tela do cabo) e "nó sensor" (resto do app) — o glossário registra.

## Verificação

Preenchida em 2026-10-22, com o código no branch `feat/005-coleta-pelo-cabo`.

### Portões (T543)

`npm run typecheck`, `npx vitest run` (41 arquivos, 520 testes + 1 falha esperada herdada) e
`npm run check:fronteira` verdes no último commit, e conferidos também em cada commit
intermediário das telas (cópia por `git archive`, sem mexer no repositório).

### Teste por mutação nos pontos críticos (T544)

Cada mutação foi aplicada, o teste indicado rodou e **reprovou**, e o código voltou:

| # | Mutação | Pego por |
|---|---|---|
| M1 | `gravou` antes do `persist()` | `cabo-ponta-a-ponta` (INV-503) |
| M2 | `nao-gravou` tratado como gravado (RECEIVED sem gravação) | `protocolo`, `cabo-ponta-a-ponta` |
| M3 | polinômio do CRC `0xEDB88321` | `crc32` |
| M4 | aceitar tamanho que não é 8 + múltiplo de 16 | `arquivo0` |
| M5 | chave só com o número da medição | `arquivo0`, `cabo-ponta-a-ponta` (INV-501/502) |
| M6 | mandar a hora com o relógio implausível | `cabo-ponta-a-ponta` (FR-010) |
| M7 | "apagou" sem a hora ter ido | `protocolo` (INV-504) |
| M8 | janela da conferência de 1 para 3 intervalos | `hora-contagem`, `cabo-ponta-a-ponta` |
| M9 | medições a mais aceitas | `hora-contagem` (SC-003) |
| M10 | colisão de chave calada | `cabo-ponta-a-ponta` (D-519) |
| M11 | o LF da linha come o primeiro byte do binário | `cabo-entrada`, `cabo-ponta-a-ponta` |
| M12 | diagnóstico tratado como protocolo | `protocolo`, `firmware-simulado` |
| M13 | `READY:<MAC>` recusado | `protocolo`, `cabo-ponta-a-ponta` |
| M14 | HELLO mandado a placa nova vista na escuta | `protocolo`, `cabo-ponta-a-ponta` (FR-025) |
| M15 | "a placa recomeçou" sem a hora; hora implausível sem aviso | `cabo-mensagens` |
| M16 | import da nuvem numa tela nova; de transporte na gravação | `cabo-coleta-fronteira` |
| M17 | `react-native` e `../../transports` dentro de `src/core` | `check-fronteira.sh` |

### Desempenho (T542, Node — não é o aparelho nem o navegador)

`tests/cabo-desempenho.test.ts`, 10.000 medições (160.008 bytes, 833 dias a 2 h): CRC +
leitor 3 ms; coleta inteira pela placa simulada, com gravação e hora, 72 ms (better-sqlite3) e
107 ms (sql.js). Um arquivo real de 30 dias tem 361 medições. **Não medido:** o navegador real,
o pacote web e o aparelho de referência (a coleta pelo cabo não roda nele).

### Na tela (T545, parcial)

Exportação web (`expo export --platform web`) servida em `127.0.0.1` e aberta no Chromium do
painel do app, 2026-10-22: Coletar pelo cabo com a placa simulada (37 leituras, "Horas
estimadas pela contagem da placa, de 19/10/2026, 05:19 a 22/10/2026, 05:19"); intervalo da
placa na tela da colmeia (2 h → 1 h deixa as 37 sem hora; de volta a 2 h, voltam);
Configurar placa nova simulada ("A placa confirmou e começou a medir"). Console sem erro;
nenhuma requisição fora de `127.0.0.1`. **Não feito:** modo avião de verdade, Firefox/Safari
(a tela de "sem suporte" só foi verificada por teste), fonte em 200 %, e a placa real (T546).

### Constitution Check reavaliado (substitui a tabela do desenho)

| Princípio | Veredito | Evidência |
|---|---|---|
| I. Offline por Padrão | PASS (estático + navegador local); modo avião **pendente** | Tabela Comportamento Offline; `tests/cabo-coleta-fronteira.test.ts` (telas novas sem `src/nuvem` nem rede, conferido por mutação); no Chromium, nenhuma requisição externa durante coleta, intervalo e placa nova. Teste com a rede desligada: T545, não feito |
| II. Orçamento de Desempenho | PASS (estimado em Node; aparelho não medido) | Nenhuma dependência nova; `tests/cabo-desempenho.test.ts` (números acima). A coleta pelo cabo não roda no aparelho de referência |
| III. Leituras Imutáveis e Idempotentes | PASS | `(node_id, seq)` com `seq = início × 10⁶ + número`; INV-501/502 em `tests/cabo-ponta-a-ponta.test.ts` e `tests/arquivo0.test.ts`, conferidos por mutação (M5); nenhum UPDATE/DELETE em `reading` (`check-fronteira.sh`); migração 3 com banco populado (`tests/migracao.test.ts`); intervalo muda horas por versão, nunca a leitura (INV-506); no navegador, o `persist()` antes do `RECEIVED` pede `durability: 'strict'` (`tests/db-web-duravel.test.ts`, revisão) |
| IV. O Payload é Externo | VIOLAÇÃO (justificada, três desvios em Complexity Tracking) | Tabela `formato → leitor`; recusa inteira (M4); bruto guardado; placa simulada fiel ao `.ino` é a base dos testes; porta serial só em `src/transports/`; `src/core` sem plataforma (regra nova, M17); Matriz de Capacidades |
| V. Ergonomia de Campo em pt-BR | PASS (com ressalva) | Texto só pelo i18n (`tests/telas.test.ts`); `tests/cabo-mensagens.test.ts` (todo fim com o que fazer, sem código cru, sem "firmware"/CRC/MAC nas chaves do app de campo — revisão); alvos `alvo.minimo`/`alvo.linha` nas três telas. **Não verificado:** fonte em 200 % e contraste medido na tela renderizada |
| VI. Honestidade do Dado | PASS | Hora pela contagem sempre "estimada" e só com a conferência fechando (M8, M9; visto na tela ao trocar o intervalo); erro possível de uma hora estimada declarado como até um intervalo mais a folga (D-507, teste de caracterização, revisão); bruto em ponto flutuante ao lado dos centésimos; voláteis fora das médias sem status do sensor; eCO₂ nunca como CO₂ |
| VII. Especificação Antes do Código | PASS (com ressalva de processo) | spec, checklist, plano, research, data-model, contracts, quickstart e tasks commitados antes do código; emenda da FR-016 da 003; `docs/integracao-firmware.md` com data e commit `e93f8ad`. Ressalva: análise cruzada feita à mão, sem `/speckit-analyze` |

### Revisão independente (2026-10-22)

Releitura de `git diff 96c5eef..HEAD` contra o `COMMUNICATION_PROTOCOL.md` e o
`teste_de_firmware.ino` (e93f8ad). Mutações refeitas pelo revisor e pegas: M1, M5, M11. Três
defeitos confirmados e corrigidos, cada um com teste:

1. Quatro textos do app de campo mandavam o apicultor "avisar o grupo do firmware" (jargão e
   caminho de ajuda diferente do resto da coleta): agora "avise a pesquisadora"; teste reprova
   firmware/CRC/MAC/timestamp/handshake nas chaves do app de campo.
2. `persist()` do navegador concluía com a durabilidade padrão do IndexedDB, que pode dar a
   gravação por feita antes do disco; agora pede `strict` (só o `persist()` explícito).
   Mutações "sem await" e `relaxed` reprovam `tests/db-web-duravel.test.ts`.
3. Spec, D-507 e `docs/integracao-firmware.md` subestimavam o erro possível da hora pela
   contagem ("só passa dentro da folga"); o limite real é até um intervalo mais a folga.
   Teste de caracterização em `tests/hora-contagem.test.ts`.

Riscos vistos e **não** corrigidos (não confirmáveis sem a placa): a porta aberta com o
`bufferSize` padrão da Web Serial (255 bytes) pode encher se a aba travar no meio do arquivo —
o CRC impede gravar errado, mas a coleta falharia; um `HELLO` reenviado depois de um `READY`
atrasado dá `ERROR:BAD_COMMAND` (D-506, risco 2).

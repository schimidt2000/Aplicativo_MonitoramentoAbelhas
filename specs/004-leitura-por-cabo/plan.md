# Implementation Plan: Leitura da placa pelo cabo, ao vivo (monitor de bancada)

**Branch**: `feat/004-leitura-por-cabo` | **Date**: 2026-10-21 | **Spec**: [spec.md](./spec.md)

**Input**: Feature specification from `/specs/004-leitura-por-cabo/spec.md`

## Summary

Uma tela nova no app de campo, acessível pelo Diagnóstico de conexão, que abre a porta serial
USB da placa pelo navegador do computador (Web Serial, Chrome/Edge), lê as linhas do código de
bancada do grupo do firmware e mostra ao vivo: números grandes, estado do sensor de gás,
gráfico dos últimos 5 minutos com lacunas honestas, registro das mensagens da placa e uma
planilha opcional da sessão. **Nada vai para o banco**: as linhas não têm identificador da
placa nem número da leitura, que são a chave da tabela de leituras (Princípio III).

Três camadas, cada uma no lugar que a constituição manda:

1. `src/core/decode/` — leitor de linha **puro e versionado** (`bancada-0`), numa tabela
   `formato → leitor`, ao lado da tabela binária `versão → decodificador` da 001.
2. `src/transports/cable/` — o **único** lugar que toca a porta serial do navegador:
   verificação de suporte, escolha e abertura da porta, leitura em fluxo com junção de pedaços
   em linhas, fechamento limpo e erros como `TransportError` com código.
3. `src/core/bancada/` (sessão em memória, série com lacunas, textos, planilha) +
   `src/ui/GraficoAoVivo.tsx` + `src/app/cabo.tsx` (a tela, que só desenha).

## Technical Context

**Language/Version**: TypeScript ~6.0 (strict), React 19.2, React Native 0.86 / react-native-web 0.21

**Primary Dependencies**: Expo SDK 57, expo-router, react-native-svg 15.15.4 (já instalados).
**Nenhuma dependência nova** (`package.json` e `package-lock.json` sem diff contra `2890a28`).
Os tipos da Web Serial não estão no `lib.dom` do TypeScript; declaramos uma interface mínima em
`src/transports/cable/serial.ts` em vez de instalar `@types/w3c-web-serial`. Som pelo Web Audio
do navegador; download por `Blob` + `<a download>`.

**Storage**: N/A — por decisão (FR-015). A sessão vive na memória da tela.

**Testing**: vitest 4 em Node 24. `ReadableStream`, `TextDecoder` e `DOMException` são globais
no Node, então a leitura da porta é testada com uma porta falsa que entrega `Uint8Array` em
pedaços arbitrários (o formato que o Chrome entrega) e reproduz cabo solto, bytes perdidos e
placa em silêncio.

**Target Platform**: app de campo no navegador, Chrome e Edge de computador (Windows, macOS,
Linux). No app Android/iOS e em Safari, Firefox e navegadores de celular, a tela só explica a
alternativa.

**Project Type**: mobile-app (Expo) com alvo web.

**Performance Goals**: 1 linha por segundo. Interpretar uma linha é uma regex sobre ~60
caracteres. O gráfico tem no máximo ~300 pontos (5 min × 1/s), recalculado em `useMemo` a cada
leitura; a janela é achada por busca binária, então o custo não cresce com as 6 h de sessão.

**Constraints**: nenhuma chamada de rede; nenhuma escrita no banco; memória limitada por
construção: 21.600 leituras (6 h), 50 mensagens no registro, linha de no máximo 512 caracteres.

**Scale/Scope**: 1 tela, 1 componente de gráfico, 1 arquivo de ícones, 5 módulos puros, 1
pacote de transporte (5 arquivos), 7 arquivos de teste.

## Constitution Check

*GATE: Must pass before Phase 0 research. Re-check after Phase 1 design.*

| Princípio | Veredito | Evidência |
|---|---|---|
| I. Offline por Padrão | PASS | Tabela Comportamento Offline abaixo. `tests/cabo-fronteira.test.ts` segue o grafo de imports a partir de `src/app/cabo.tsx` e reprova se algum arquivo alcançável estiver em `src/nuvem/` ou usar `fetch`, `XMLHttpRequest` ou `WebSocket`. **Teste em modo avião no navegador: pendente** (T024, precisa da placa). |
| II. Orçamento de Desempenho | PASS (pacote medido; aparelho não medido) | Nenhuma dependência nova. **Medido** com `npx expo export --platform web` (2026-10-21): pacote JS do app de campo no navegador de 1.299.022 → 1.343.795 bytes (+44.773, +3,4 %); gzip −9 de 347.957 → 360.223 bytes (+12.266). Muito abaixo dos 500 KB que exigiriam justificativa. No aparelho de referência a tela só mostra o texto de "sem suporte" e não abre porta. Gráfico ≤ 300 pontos com janela por busca binária; registro ≤ 50 itens; sessão ≤ 21.600 leituras. **Arranque a frio e memória não medidos** no aparelho de referência (T026). |
| III. Leituras Imutáveis e Idempotentes | PASS | A tela não grava nada (FR-015): `tests/cabo-fronteira.test.ts` reprova se qualquer arquivo alcançável a partir de `src/app/cabo.tsx` estiver em `src/data/` (conferido por mutação: um `import '@/data/repo'` em `core/bancada/csv.ts` faz o teste falhar). Chave `(node_id, seq)` e `tests/ingestao.test.ts` (reimportação) intocados e verdes. |
| IV. O Payload é Externo | VIOLAÇÃO (justificada) | Leitor versionado numa tabela `formato → leitor` (`src/core/decode/linhas.ts`), formato desconhecido recusado com `FormatoDeLinhaDesconhecidoError` (`tests/bancada0.test.ts`). Porta serial só em `src/transports/cable/`, verificado por regra nova em `scripts/check-fronteira.sh` (conferida por mutação). Erros como `TransportError` com código. Matriz de Capacidades abaixo; onde não existe, a tela explica (FR-016). **Duas violações, em Complexity Tracking:** as linhas de bancada não carregam versão, e o monitor não implementa a interface `Transport`. |
| V. Ergonomia de Campo em pt-BR | PASS | Checklist da tela abaixo. Todas as strings novas em `src/core/i18n/pt-BR.ts`, bloco "Frente 004" (`cabo.*`); `tests/cabo-fronteira.test.ts` reprova texto solto em JSX nos componentes da 004 (conferido por mutação) e `tests/bancada-mensagens.test.ts` reprova vocabulário proibido. **Não verificado:** layout com fonte do sistema em 200% e o som num navegador real. |
| VI. Honestidade do Dado | PASS | "Voláteis (COVs)" como sinal de gás; eCO₂ só como "eCO₂ estimado — não é CO₂", em letra menor (`tests/bancada-mensagens.test.ts`, `tests/bancada-csv.test.ts`, regra de `check-fronteira.sh` para `.tsx`). Tela com 1 e 0 casas; voláteis sem número grande enquanto o sensor de gás não está pronto. Lacuna em valor em branco, em > 3 s sem leitura, em linha ilegível ou mensagem de texto da placa entre duas leituras e, nos voláteis, em status ≠ 0 (`tests/bancada-sessao.test.ts`); eCO₂ também sem número enquanto o sensor de gás não está pronto (`tests/bancada-mensagens.test.ts`). Limite conhecido: uma leitura omitida sem nenhuma outra linha no lugar (~2 s) não quebra a linha até o ritmo ser medido (T024). Planilha com proveniência e contagem de leituras com o sensor de gás fora do normal e de linhas ilegíveis. Dois desvios de **regra** (não de princípio) em Complexity Tracking. |
| VII. Especificação Antes do Código | PASS (com ressalva de processo) | `specs/004-leitura-por-cabo/` com spec, checklist, plan e tasks (T001–T026). O formato `bancada-0` registrado como **não confirmado** em `docs/integracao-firmware.md`. **Ressalva:** a análise de consistência entre os artefatos foi feita à mão (em tasks.md), e só depois de parte do código existir — o agente anterior começou o leitor junto com a spec. O skill `/speckit-analyze` não foi executado. |

### Tabela Comportamento Offline

| Tela / Ação | Sem rede | Rede intermitente | Fonte do dado |
|---|---|---|---|
| Ler a placa pelo cabo (tela) | Funciona integralmente | Idêntico | Porta serial USB local |
| Conectar pelo cabo | Funciona integralmente | Idêntico | Porta serial USB local |
| Salvar o que foi visto | Funciona integralmente (arquivo gerado no navegador) | Idêntico | Memória da tela |
| Link no Diagnóstico de conexão | Funciona integralmente | Idêntico | — |

### Matriz de Capacidades

| Transporte | Android (app) | iOS (app) | Navegador de computador | Navegador de celular |
|---|---|---|---|---|
| `cable` monitor (esta feature) | não suportado — explica e oferece "Ir para Coletar" | não suportado — idem | Chrome/Edge em endereço seguro: suportado · endereço `http://` fora de `localhost`: não suportado — explica a solução · Firefox/Safari: não suportado — explica | não suportado (decisão conservadora, não testado) — explica |
| `cable` coleta (futura) | — | — | Chrome/Edge, quando o firmware mandar identificador, número e versão | — |
| `mock` (001) | suportado | suportado | suportado | suportado |

### Checklist da tela (Princípio V)

| Item | Como | Onde |
|---|---|---|
| Alvos ≥ 56 dp, 12 dp entre eles | `minHeight: alvo.minimo` em todo botão e aba; `gap: alvo.espacamento` entre as abas | `src/app/cabo.tsx`, `src/app/diagnostico.tsx` |
| Corpo ≥ 16 sp | `tipo.corpo` em todo texto da tela e da legenda | idem; os rótulos dos eixos do gráfico ficam em 11 px, como no `Grafico.tsx` da 001 |
| Leitura ≥ 32 sp, algarismos tabulares | `tipo.leitura` (34) com `fontVariant: ['tabular-nums']` | `Valor` em `cabo.tsx` |
| Contraste ≥ 7:1 no primário | texto `cores.texto` (19,7:1) e `textoFraco` (9:1); **botão primário com fundo `cores.texto`** e texto branco — branco sobre o âmbar `acento` dá ~5,9:1 (calculado), abaixo de 7:1 | `cabo.tsx` |
| Status por cor + ícone + palavra | estado da conexão (tomada / tomada cortada / relógio), estado do gás (✓ / relógio / alerta), problemas (alerta), linhas ilegíveis (alerta + "Linha ilegível") | `cabo.tsx`, `src/ui/IconesCabo.tsx` |
| Ação primária no terço inferior | Conectar/Desconectar numa barra fixa embaixo, fora da rolagem. Desconectar não é destrutivo (o que foi visto continua na tela) | `cabo.tsx` |
| Sem digitação livre | nenhuma entrada de texto | — |
| Retorno redundante | texto + 1 bipe ao conectar; texto + 2 bipes ao perder a conexão (Web Audio) | `src/ui/bipe.ts` |
| Strings via i18n | bloco "Frente 004" em `pt-BR.ts`; teste de JSX sem texto solto | `tests/cabo-fronteira.test.ts` |
| Modo sol | não aplicado: tela de bancada, em ambiente interno, no computador | — |

## Decisões

- **D-1: Monitor, não transporte.** A tela não implementa `Transport`: não há `seq` para
  `pullReadings` nem identificador para `NodeInfo.deviceId`. Implementar a interface obrigaria a
  inventar os dois. `src/transports/cable/` é onde o transporte de verdade vai nascer, e a
  leitura em fluxo, a junção de linhas e o mapeamento de erros serão reaproveitados.
- **D-2: `getReader()` + `TextDecoder` com `stream: true`, em vez de `TextDecoderStream`.** São
  equivalentes para juntar o caractere partido entre pedaços. O `pipeThrough` prende o fluxo da
  porta num pipe, e o fechamento limpo passa a exigir cancelar, esperar o pipe rejeitar e só
  então fechar — o tropeço mais comum de quem usa Web Serial. Aqui `fechar()` é cancelar o
  leitor, soltar e fechar a porta.
- **D-3: Erros não fatais da porta** (`BreakError`, `FramingError`, `ParityError`,
  `BufferOverrunError`) não derrubam a leitura: a linha pela metade sai como `interrompida`, o
  decodificador recomeça e o laço pega o fluxo novo. `NetworkError`, fluxo nulo ou fluxo que
  termina sozinho é cabo solto: `connection-lost`.
- **D-4: 15 s sem nenhum byte → `timeout`**, e a porta é liberada. A regra de transportes manda
  lançar `timeout`. O caso real é o `while(1)` do código de bancada quando um sensor não inicia.
- **D-5: Hora pelo relógio do computador** (`Date.now()` na chegada da linha). Nunca vai ao
  banco, então não há âncora nem qualidade de hora a registrar.
- **D-6: Gráfico próprio (`src/ui/GraficoAoVivo.tsx`)**, não o `Grafico.tsx` da 001: aquele usa
  o dia como eixo, rótulos de data e quebra por dia faltando. A série, as lacunas e a escala
  são puras (`src/core/bancada/serie.ts`) e testadas; o componente só desenha.
- **D-7: Lacuna por status só nos voláteis; faixa sombreada nas três grandezas.** Motivo na
  spec (Assumptions). Uma constante: `INTERROMPE_POR_STATUS_DO_GAS`.
- **D-8: Detecção de suporte pura**, recebendo o ambiente como parâmetro, testada sem
  navegador. Navegador de celular é tratado como sem suporte mesmo que diga ter porta serial.
- **D-9: Mensagens por código + fase.** O mesmo `unavailable` quer dizer "porta ocupada" ao
  abrir e "algo inesperado" ao escolher; `core/bancada/mensagens.ts` decide pelo par, como a
  coleta faz.
- **D-10: Sessão mutável num `useState` preguiçoso**, com um contador de versão para redesenhar.
  Copiar até 21.600 leituras por segundo só para o React notar a mudança seria desperdício.
- **D-11: Os tipos `FaseDoCabo` e `MotivoSemCabo` moram em `core/bancada/mensagens.ts`** e o
  transporte importa de lá: o transporte pode conhecer o domínio, nunca o contrário.

## Project Structure

### Documentation (this feature)

```text
specs/004-leitura-por-cabo/
├── spec.md
├── checklists/requirements.md
├── plan.md        # este arquivo
└── tasks.md
```

Sem `research.md`, `data-model.md` nem `contracts/`: não há modelo de dados persistido nem
contrato novo com a outra equipe. As decisões estão em "Decisões" acima.

### Source Code (repository root)

```text
src/
├── core/
│   ├── decode/
│   │   ├── bancada0.ts        # leitor puro do formato bancada-0
│   │   └── linhas.ts          # tabela formato → leitor, tipos, teto de linha
│   ├── bancada/
│   │   ├── sessao.ts          # sessão do monitor, em memória, com tetos
│   │   ├── serie.ts           # trechos do gráfico com lacunas, faixas, escala
│   │   ├── apresentacao.ts    # leitura → texto da tela (casas, gás, registro)
│   │   ├── mensagens.ts       # código + fase → problema → título + o que fazer
│   │   └── csv.ts             # planilha pt-BR com proveniência
│   └── i18n/pt-BR.ts          # + bloco "Frente 004" no fim (arquivo compartilhado)
├── transports/cable/
│   ├── index.ts               # superfície pública; lê o ambiente do navegador
│   ├── disponibilidade.ts     # dá para ler pelo cabo aqui? (puro)
│   ├── linhas.ts              # junta pedaços em linhas, com teto
│   ├── erros.ts               # erro do navegador → TransportError
│   └── serial.ts              # escolher, abrir, ler, fechar
├── ui/
│   ├── GraficoAoVivo.tsx
│   ├── IconesCabo.tsx
│   ├── bipe.ts                # Web Audio, melhor esforço
│   └── baixarArquivo.ts       # Blob + <a download>, só na web
└── app/
    ├── cabo.tsx               # a tela
    ├── diagnostico.tsx        # + link (arquivo compartilhado)
    └── _layout.tsx            # + título da rota (arquivo compartilhado)

scripts/check-fronteira.sh     # + regra: porta serial só em src/transports/ (compartilhado)

tests/
├── bancada0.test.ts
├── cabo-linhas.test.ts
├── cabo-serial.test.ts
├── bancada-sessao.test.ts
├── bancada-mensagens.test.ts
├── bancada-csv.test.ts
└── cabo-fronteira.test.ts
```

**Structure Decision**: segue o layout do CLAUDE.md. O único código que toca a porta fica em
`src/transports/cable/`; a tela importa de `@/transports/cable` (como o Diagnóstico importa de
`@/transports/mock`), o que a constituição permite para telas de conexão e diagnóstico.
`src/transports/index.ts` não muda: o registro dele é de `Transport`, e o monitor não é um.

## Complexity Tracking

| Violação ou desvio | Por que é preciso | Alternativa mais simples, e por que foi rejeitada |
|---|---|---|
| **Princípio IV:** "toda carga MUST carregar uma versão de protocolo" — as linhas de bancada não carregam | A linha é do código de bancada de outra equipe; não podemos mudá-la. A tela usa `bancada-0` por escolha fixa (`FORMATO_DE_LINHA_ATUAL`), e a tabela `formato → leitor` já existe para quando a versão vier | Esperar o firmware mandar versão: deixaria o grupo do firmware sem ferramenta para os dois testes da sessão conjunta. Mitigação: a linha é casada inteira e exata; formato mudado vira "ilegível", nunca leitura mal lida; e **nada é gravado**. Pedido de versão registrado em `docs/integracao-firmware.md` |
| **Princípio IV:** "todos os transportes MUST implementar uma única interface" — o monitor não implementa `Transport` | Sem número de leitura não há `pullReadings` retomável, e sem identificador não há `deviceId` (D-1) | Implementar `Transport` inventando `seq` e `deviceId`: é exatamente a chave inventada que o Princípio III proíbe. O monitor fica dentro do pacote de transportes, para o `cable` de verdade nascer ali |
| **Regra (glossário/ui.md, não princípio):** voláteis "como tendência, não número cru" | Na bancada não há colmeia nem histórico; o grupo do firmware precisa ver o número do sensor para saber se ele funciona | Mostrar só tendência: inútil para o teste de bancada. Mitigação: frase sob o número dizendo que, numa colmeia, os voláteis só valem comparados com a própria colmeia; nenhuma comparação é oferecida; sem número grande enquanto o sensor não está pronto |
| **Regra (ui.md, não princípio):** "nunca 2 casas em nada" — a planilha leva temperatura e umidade com 2 casas | É o valor bruto da placa, para comparar com o termômetro; arredondar destruiria o dado (mesmo motivo de o banco guardar o bruto) | Planilha com 1 e 0 casas: perde o bruto. A tela mostra 1 e 0 casas; as colunas da planilha dizem "como veio" |

## Verificação

- `npm run typecheck`, `npx vitest run` (todas as suítes) e `npm run check:fronteira`: verdes.
- Teste por mutação nos pontos críticos (quebrado de propósito, conferido que o teste pega,
  restaurado): `nan` virando 0; centésimos por float; aquecimento sem o status 2; sem quebra
  por silêncio; voláteis sem lacuna por status; linha cortada decodificada; sem teto de linha;
  erro não fatal derrubando a leitura; sem decodificador em fluxo; sem timeout; sem checar
  endereço seguro; planilha sem BOM e com `\n`; sem proteção de fórmula; voláteis com número
  durante o aquecimento; import de `src/data` na tela; texto solto em JSX; porta serial fora
  de `transports/`.
- `npx expo export --platform web` gera o pacote, e ele contém a rota e os textos novos. Nota
  para quem repetir numa worktree: o cache do Metro (em `$TMPDIR/metro-cache`) é compartilhado
  entre worktrees que usam o mesmo `node_modules` por link simbólico, e serviu a lista de rotas
  de outra worktree; com `TMPDIR` apontando para uma pasta própria, o pacote sai certo.
- **Não verificado:** a tela num navegador real (o João verifica depois do merge), a placa
  real, o som, o download e a fonte em 200%.

## Constitution Check — reavaliação pós-Fase 1

Os vereditos acima já são os da reavaliação, feita com o código pronto. O Princípio II continua
**estimado**: medir no aparelho de referência só faz sentido para a explicação de "sem
suporte", que é texto. A verificação real desta tela é no Chrome de computador com a placa, na
sessão de teste (T024).

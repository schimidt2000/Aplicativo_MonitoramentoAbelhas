---
paths:
  - "src/transports/**"
  - "src/core/decode/**"
  - "src/core/ports/**"
---

# Transportes e decodificação

Este é o **único** lugar do repositório que pode importar SDK de transporte. Se você está
prestes a importar `react-native-ble-plx`, uma API de serial ou qualquer coisa parecida fora
de `src/transports/`, pare: isso viola o Princípio IV e o lint do CI reprova.

## O payload não é nosso

O formato de dados do nó pertence a outra equipe e **vai mudar**. Estado atual do que foi
confirmado por eles: `docs/integracao-firmware.md`. Se algo não estiver marcado como
confirmado ali, **é suposição** — trate como tal e não fixe no código.

## Regras de decodificação

- A decodificação é uma tabela `versão → decodificador`. Nunca um parser único com `if`.
- **Versão desconhecida é rejeitada**, com mensagem em pt-BR dizendo o que fazer, e **nada
  parcial é gravado**. Decodificar por tentativa e erro nunca acontece.
- A **carga bruta de cada sessão é preservada** antes de qualquer decodificação. É a única
  forma de reprocessar quando descobrirmos que lemos um campo errado.
- Nunca assuma quantos registros cabem num pacote. Derive do tamanho recebido e valide que o
  resto da divisão é zero. Equipes de firmware erram isso com frequência.
- Valor inválido vira `NULL` com motivo codificado. **Nunca `0`, `-1` ou `-999`.**

## Regras de sessão

- `pullReadings` devolve `AsyncIterable<Reading[]>`, nunca `Promise<Reading[]>`. Isso é
  deliberado: impede por construção que alguém materialize centenas de milhares de leituras
  na memória de um aparelho de 2 GB.
- Cada lote decodificado é gravado no banco assim que chega. Se a transferência cair em 62%,
  os 62% já estão salvos e a próxima sessão retoma pelo cursor.
- Toda transferência é retomável. Nunca dependa de uma única conexão contínua bem-sucedida.
- `preflight()` devolve itens estruturados, e a tela de diagnóstico é renderização pura
  disso. Não espalhe lógica de permissão pela UI.
- Falha lança `TransportError` com código (`not-found`, `connection-lost`, `timeout`,
  `permission`, `unavailable`). Nunca uma `Error` genérica com texto do SDK: quem escolhe o
  texto é `core/coleta/mensagens.ts`, via i18n.
- `setTime` é **melhor esforço**: devolve `{ ok: false, reason }` em vez de lançar quando o
  nó recusa, não suporta ou não responde. Nunca use a hora para decidir o que coletar —
  isso é `seq`.

## Armadilhas de Android que já custaram tempo

- Android 8–10: a varredura BLE devolve **zero resultados em silêncio** se o botão de
  Localização do sistema estiver desligado, mesmo com a permissão concedida. Por isso a tela
  de diagnóstico é P0.
- Android limita a **5 varreduras a cada 30 s**. Debounce de 1 a cada 6 s.
- Android 8/9 lança `status=133` no connect GATT o tempo todo. Sequência que funciona:
  `stopScan` → esperar ~200 ms → `autoConnect=false` → limpar cache GATT → retry com backoff.
  Uma fila única de operações GATT, nunca chamadas concorrentes.
- `androidNeverForLocation` **não faz nada** no Android 8/9/10 — só existe na API 31+.
- Permissões são pedidas **no momento do toque**, nunca no lançamento do app.

## Transporte mock

O `mock` não é andaime descartável — é a base dos testes e existe **antes** de qualquer
transporte real. Ele precisa saber reproduzir: queda no meio da transferência, verificação de
integridade inválida, reinício do nó durante a sessão, salto de relógio, MTU mínimo, lacuna de
contador, amostras marcadas como inválidas e versão de protocolo desconhecida.

Se um caminho de falha não estiver no mock, ele não está testado.

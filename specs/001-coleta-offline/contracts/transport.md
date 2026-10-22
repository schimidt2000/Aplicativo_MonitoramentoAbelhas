# Contrato — Interface de transporte

**Feature**: `specs/001-coleta-offline` · **Data**: 2026-09-10

Este é o contrato interno que o Princípio IV torna vinculante. Todo transporte o implementa;
domínio e UI nunca importam SDK de transporte.

Arquivo: `src/core/ports/transport.ts`

---

## Tipos

```ts
export type TransportKind = 'mock' | 'ble' | 'cable' | 'file';

export type UnsupportedReason =
  | 'plataforma-sem-api'      // Web Bluetooth no iOS; Web Serial em WebView
  | 'versao-so-antiga'
  | 'hardware-ausente';

/** Identidade e estado do nó, lidos ao abrir a sessão. */
export interface NodeInfo {
  protoVer: number;
  deviceId: string;          // identificador estável da fonte. NUNCA o MAC BLE
  bootId: string | null;     // campo de payload, nunca chave
  fwVersion: string | null;
  clockMode: 'none' | 'uptime' | 'rtc';
  caps: { setTime: boolean }; // o nó aceita receber a hora do celular?
  oldestSeq: number;
  newestSeq: number;
  recordCount: number;
  samplePeriodS: number;
  battMv: number | null;
}

/** Uma leitura decodificada, AINDA EM TEMPO DO NÓ.
 *  A conversão para tempo de parede acontece uma única vez, na ingestão. */
export interface Reading {
  seq: number;
  tNode: number;
  tempC100: number | null;
  rhX100: number | null;
  tvocPpb: number | null;
  eco2Ppm: number | null;
  aqiUba: number | null;
  gasStatus: number | null;
  battMv: number | null;
  flags: number;
}

export interface ClockAnchor {
  deviceId: string;
  bootId: string | null;
  tNodeAtAnchor: number;
  tUtcAtAnchorMs: number;    // já corrigido por rtt/2
  monoMs: number;            // relógio monotônico, detecta mudança manual de hora
  rttMs: number;
  src: TransportKind;
  trusted: boolean;
}

/** Item da tela de diagnóstico. A tela é renderização pura desta lista. */
export interface PreflightItem {
  id: 'bluetooth-ligado' | 'localizacao-ligada' | 'permissao-concedida'
    | 'cabo-conectado' | 'armazenamento-disponivel';
  ok: boolean;
  label: string;             // já em pt-BR
  hint?: string;             // o que fazer, em pt-BR
  fixAction?: () => Promise<void>;
}

export interface DiscoveredNode {
  transport: TransportKind;
  handle: string;            // identificador local do transporte. NÃO é a identidade
  deviceId?: string;
  rssi?: number;
  hint?: { pendingRecords?: number; battMv?: number; protoVer?: number };
}
```

---

## A interface

```ts
/** Falha de transporte com causa conhecida. A UI decide o texto; o transporte só classifica. */
export type TransportErrorCode =
  'not-found' | 'connection-lost' | 'timeout' | 'permission' | 'unavailable';
export class TransportError extends Error {
  constructor(readonly code: TransportErrorCode, detail?: string);
}

export type SetTimeResult =
  | { ok: true }
  | { ok: false; reason: 'unsupported' | 'rejected' | 'no-reply' };

export interface NodeSession {
  readonly transport: TransportKind;
  readonly info: NodeInfo;
  readonly anchor: ClockAnchor;

  /** Oferece ao nó a hora do celular, em ms Unix UTC. Melhor esforço: nunca lança por
   *  recusa, e nunca decide o que foi coletado. */
  setTime(unixMs: number): Promise<SetTimeResult>;

  /** Streama lotes. MUST ser consumido incrementalmente, com commit por lote. */
  pullReadings(afterSeq: number, opts?: {
    signal?: AbortSignal;
    onProgress?: (p: {
      received: number;
      total?: number;
      lastSeq: number;
    }) => void;
  }): AsyncIterable<Reading[]>;

  close(): Promise<void>;
}

export interface Transport {
  readonly kind: TransportKind;
  isSupported(): Promise<{ ok: true } | { ok: false; reason: UnsupportedReason }>;
  preflight(): Promise<PreflightItem[]>;
  discover(opts?: { timeoutMs?: number; deviceId?: string }): AsyncIterable<DiscoveredNode>;
  connect(node: DiscoveredNode, opts?: { signal?: AbortSignal }): Promise<NodeSession>;
}
```

### Por que estas formas exatas

**`pullReadings` devolve `AsyncIterable<Reading[]>`, nunca `Promise<Reading[]>`.** É a
decisão mais importante da interface para o limite de 2 GB de RAM: ela **impede por
construção** que alguém materialize centenas de milhares de leituras na memória. Um
`Promise<Reading[]>` deixaria. E força o commit incremental, que é o que faz a retomada de
FR-003 e FR-004 acontecer de graça.

**`preflight()` devolve itens estruturados.** Toda a lógica de permissão e pré-condição fica
num lugar só, e a tela de diagnóstico vira renderização pura. Sem isso, essa lógica se
espalha pela UI e diverge por tela.

**`Reading` permanece em tempo do nó.** A ancoragem acontece uma vez, na ingestão. A camada
de transporte fica burra e testável isoladamente.

**Sem `ackUpTo`.** O nó não precisa saber o que já baixamos. O cursor é nosso: o próximo
`pullReadings(afterSeq)` diz tudo. Isso também é o que torna a perda do celular recuperável,
desde que o nó não apague na leitura — pergunta 7 de `docs/questionario-firmware.md`.

**Erros tipados, não mensagens.** O transporte lança `TransportError` com um código, e
`src/core/coleta/classificar.ts` transforma código + fase da coleta (procurando,
conectando, transferindo, gravando) num problema que a tela sabe explicar. Uma mensagem de
SDK em inglês nunca chega ao apicultor. O orquestrador `src/data/coleta.ts` nunca lança:
toda coleta termina num resultado, com cada colmeia isolada das outras (FR-037 a FR-039).

### A hora (adendo de 2026-10-14)

O grupo do firmware informou que o nó **não marca a hora sozinho** e quer receber a hora do
celular a cada coleta. Por isso `setTime`:

- É chamado **depois** de abrir a sessão e **antes** de `pullReadings`, com limite de 5 s.
- É **melhor esforço**. Recusa, falta de suporte (`caps.setTime = false`) ou silêncio viram
  um aviso na tela, nunca um problema, e não mudam nada na coleta (FR-040, SC-013).
- **Não é chamado** quando a hora do celular é implausível (`src/core/relogio.ts`). Nesse
  caso a âncora da coleta é gravada com `trusted = 0` e as leituras saem com `t_quality = 2`
  (FR-041).
- A hora de cada leitura **continua** vindo da âncora mais o contador relativo `tNode`.
  `setTime` acerta o relógio do nó para as próximas leituras; não reescreve nada já gravado.
- `clockMode` diz o que o `tNode` significa: `'rtc'` segundos Unix do próprio nó, `'uptime'`
  segundos desde que ligou, `'none'` sem noção de tempo (horas sempre estimadas).

O formato no fio (segundos ou ms, qual característica BLE) fica para a sessão de teste
conjunta; a porta usa ms Unix e cada transporte converte.

### A hora por ligada (adendo de 2026-10-21, feature 003)

Ver `specs/003-hora-das-leituras/`. O que muda para quem implementa um transporte:

- `Reading.ligada?` e `NodeInfo.ligada?` (opcionais): o número da ligada da placa — quantas
  vezes ela ligou. **Suposição não confirmada** (pergunta 6). Sem ele, o app acha o reinício
  pela volta do contador. Um transporte que não sabe o número deixa o campo de fora.
- `ClockAnchor.tNodeAtAnchor` MUST ser o contador da placa **no instante** da resposta
  (corrigido por `rttMs / 2`), não o da última leitura. Se a placa não informa isso, o
  transporte marca a âncora `trusted = false`.
- A hora das leituras não é mais calculada na gravação do lote: ela é avaliada no fim da
  coleta, ligada a ligada, e corrigida à parte quando chega informação nova.
- `setTime` pode ser chamado também **fora** da coleta: quando o apicultor confirma que a
  data do celular está certa, o app abre uma sessão curta só para acertar o relógio
  (procura só aquele `deviceId`, conecta, `setTime`, fecha). Mesmas regras: melhor esforço,
  5 s.
- Acerto bem-sucedido vira referência de hora (FR-006). Num nó `rtc`, o relógio dele passa a
  ser a hora enviada.

---

## Decodificador versionado

Arquivo: `src/core/decode/index.ts`

```ts
export type Decoder = (buf: Uint8Array) => Reading[];

const DECODERS: Record<number, Decoder> = {
  1: decodeV1,
  // 2: decodeV2 — quando a equipe de firmware definir o formato real
};

export class VersaoDesconhecidaError extends Error {
  constructor(readonly protoVer: number) {
    super(`Formato de dados versão ${protoVer} não reconhecido.`);
  }
}

export function decode(protoVer: number, buf: Uint8Array): Reading[] {
  const d = DECODERS[protoVer];
  if (!d) throw new VersaoDesconhecidaError(protoVer);
  return d(buf);
}
```

Regras que o Princípio IV impõe:

- Versão desconhecida **lança**, e o chamador grava `pull_session` com
  `outcome = 'versao_desconhecida'` **sem nenhuma linha em `reading`**.
- A mensagem ao usuário é em pt-BR e diz o que fazer — nunca o nome da exceção.
- **Nunca** decodificar por tentativa e erro.
- Nunca assumir quantos registros cabem num pacote: derivar do tamanho e afirmar que o resto
  da divisão é zero.

### Formato provisório v1

**Este formato é nosso, não da equipe de hardware.** Existe para o `mock` funcionar enquanto
o formato real não é informado. Quando a resposta chegar, ele vira `decodeV2` e nada mais no
app muda — é exatamente o ponto do decodificador versionado.

Registro de 24 bytes, *little-endian*:

```
off sz  tipo   campo          sentinela de inválido
 0   4  u32    seq            —
 4   4  u32    t_node         —
 8   2  i16    temp_c_x100    0x8000
10   2  u16    rh_x100        0xFFFF
12   2  u16    tvoc_ppb       0xFFFF
14   2  u16    eco2_ppm       0xFFFF
16   1  u8     aqi_uba        0xFF
17   1  u8     gas_status     0xFF
18   2  u16    batt_mv        0xFFFF
20   1  u8     flags          —
21   3  —      reservado      —
```

Quadro: `[0]=tipo 0x10` · `[1]=proto_ver` · `[2..3]=índice do lote u16` · `[4..]=N × 24 bytes`.

**Sentinela, nunca zero.** Um sensor que não aqueceu emite `0xFFFF`. Um `0` chega à análise
parecendo medição real — é o erro que o Princípio III existe para impedir.

`gas_status` segue a codificação do sensor real: `0` normal · `1` aquecendo · `2` partida
inicial · `3` inválido/fora de faixa. Só `0` entra em resumo.

---

## Matriz de capacidades

Exigida pelo Princípio IV em todo plano que toque conectividade.

| Transporte | Android | Web (desktop) | iOS |
|---|---|---|---|
| `mock` | ✅ | ✅ | ✅ |
| `file` (importar/exportar) | ✅ | ✅ | ✅ |
| `ble` | feature 002 | ❌ sem Web Bluetooth no Safari | descopado |
| `cable` | feature 003 (USB-OTG) | feature 003 (Web Serial, só Chromium desktop) | ❌ |

Onde um transporte não existe, a UI **explica a alternativa em pt-BR**. Botão inerte ou erro
genérico não aparece (Princípio IV).

Nesta feature apenas `mock` e `file` são implementados — e é o que torna a demonstração
possível sem hardware nenhum (SC-011).

---

## Modos de falha que o `mock` deve reproduzir

O Princípio IV exige que o `mock` exista **antes** de qualquer transporte real, e que ele
seja a base dos testes. Sem isso, os caminhos de falha — que são o ponto inteiro de um app
offline-first — nunca são exercitados.

| Cenário | Comportamento esperado | Requisito |
|---|---|---|
| Queda em 62% da transferência | 62% permanecem salvos; retoma pelo cursor | FR-003, FR-004 |
| Reinício do nó durante a sessão | `bootId` muda; nenhuma duplicata, nenhuma perda | US1 cenário 4 |
| Salto de relógio do celular | âncora marcada como não confiável | edge case |
| Lacuna no contador (`seq` 1,2,5,6) | quatro linhas, sem alerta | FR-015, INV-3 |
| Amostras com `gas_status` 1, 2 e 3 | gravadas, excluídas dos resumos, contadas | FR-020, INV-5 |
| Versão de protocolo desconhecida | nada em `reading`; `pull_session` gravada | FR-011, INV-4 |
| Nó sem dados novos | zero linhas novas; mensagem clara | US1 cenário 3 |
| Lote com resto de divisão diferente de zero | rejeita o lote inteiro | — |
| Nó não acha / conexão cai / dado corrompido | aviso específico; o resto da sessão segue | FR-037–FR-039 |
| Nó sem suporte a hora, que recusa ou não responde | aviso de relógio; coleta igual | FR-040, SC-013 |
| Celular com hora implausível | hora não enviada; não vira referência (003: sem outra referência, hora em branco) | FR-041; 003 FR-012 |
| A placa perdeu energia e religou (`perdeuEnergiaEm`, `perdeuEnergiaEmMs`) | contador recomeça do zero; leituras de antes do reinício só têm hora se outra coleta viu aquela ligada | 003 FR-001 a FR-004 |
| Placa sem noção de tempo (`semNocaoDeTempo`) | contador 0 em toda leitura; hora em branco, com motivo | 003 FR-008, FR-016 |
| Linha do tempo fixa (`ligadoEmMs`) | o contador é o tempo desde que ligou no relógio real; o relógio do celular é outro e pode estar errado | 003 D-310 |
| Sensor desconhecido por perto | ignorado, com aviso | FR-037 |

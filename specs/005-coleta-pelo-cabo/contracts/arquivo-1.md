# Contrato: formato `arquivo-1` (o `/measurements.bin` com o MAC da placa)

**Fonte**: `firmware.ino` e `teste_de_firmware.ino`, commit `4cc7ed8` (2026-10-28, 13:28
−0300), `COMMUNICATION_PROTOCOL.md` do mesmo commit, e o leitor deles
`leitura_de_arquivo.ino`: `getBoardMacAddress`, `saveInitialTimestamp`,
`replaceMeasurementFileWithTimestamp`, `saveMeasurementToFile`, `getNextMeasurementId`.
Lidos por nós, **não executados**. Gravado cru, da memória do ESP32-C6 (RISC-V,
little-endian). É o `arquivo-0` com o MAC da placa na frente; o `arquivo-0` continua na
tabela de `src/core/decode/arquivo.ts` para reler sessões antigas.

`proto_ver = 101` (D-516). É o formato que a coleta pelo cabo usa
(`FORMATO_DE_ARQUIVO_ATUAL`). O arquivo não traz versão: uma placa ainda com o firmware
`e93f8ad` é recusada (o tamanho não fecha), sem gravar nada, e fica com o arquivo.

## Layout

```
offset  tamanho  tipo        campo
0       17       ASCII       MAC da placa, WiFi STA, "%02X:%02X:%02X:%02X:%02X:%02X"
17      1        0x00        fim do texto (o firmware grava mac.length() + 1)
18      8        uint64 LE   hora de início do arquivo, segundos Unix (o que o celular mandou)
26+16k  4        float32 LE  temperatura (°C), AHT21
30+16k  4        float32 LE  umidade relativa (%), AHT21
34+16k  2        uint16 LE   eCO₂ (ppm) — DERIVADO de voláteis pelo ENS160, não é CO₂
36+16k  2        uint16 LE   TVOC (ppb), ENS160
38+16k  4        uint32 LE   número da medição que a placa grava
```

## A numeração começa em 1 (defeito conhecido do 4cc7ed8)

`getNextMeasurementId` ainda considera "arquivo sem medições" quando o tamanho é
`sizeof(uint64_t)` (8). Com o cabeçalho de 26 bytes, no arquivo recém-criado ele lê 16 bytes
a partir do byte 10: o "número" que sai são os bytes 22 a 25, a metade alta da hora de
início, que é 0 até 2106. A primeira medição recebe **1**, e as seguintes 2, 3… O
`COMMUNICATION_PROTOCOL.md` do mesmo commit registra a limitação (§7.2) e diz que a rotina
"precisa ser corrigida no firmware". Corrigida, a numeração volta a começar em 0.

**O que o app faz (D-520):** a chave e a hora saem da **posição** `k` da medição no arquivo,
não do número gravado. O número só confirma que o arquivo está inteiro e na ordem.

## Validação (o arquivo inteiro é recusado se qualquer uma falhar)

1. tamanho ≥ 26 (`curto-demais`);
2. `(tamanho − 26) % 16 === 0` (`tamanho-nao-multiplo`). Um `arquivo-0` tem tamanho
   8 + 16n, que nunca fecha aqui (26 ≡ 10 e 8 ≡ 8, módulo 16);
3. o byte 17 é `0x00`, e os bytes 0 a 16 são um MAC: seis pares hexadecimais separados por
   `:` (minúsculas aceitas, guardado em maiúsculas) (`cabecalho-invalido`);
4. os 4 bytes altos da hora de início são zero, isto é, início < 2³² (`inicio-fora-de-faixa`);
5. no máximo 999.999 medições (`medicoes-demais`);
6. a numeração começa em **0 ou 1** e cresce de 1 em 1 (`numeracao-fora-de-ordem`). Outro
   começo, um salto ou uma volta recusam o arquivo, como no `arquivo-0` (inclusive o 0 no
   meio quando `getNextMeasurementId` não consegue abrir o arquivo).

Recusado: nada é gravado em `reading`, o bruto fica em `pull_session.raw`, a placa **não**
recebe `RECEIVED` e fica com o arquivo.

## Valores

Iguais aos do `arquivo-0`: `float32` não finito → NULL com o bit de motivo em `flags`;
eCO₂ e TVOC como vieram; hora de início 0 é válida para o formato e fica sem hora pela regra
`inicio-implausivel`.

## Chave e identidade

- `seq = início × 1.000.000 + k`, `t_node = k` (D-501, D-520). Para a mesma placa, o mesmo
  arquivo dá as mesmas chaves com a numeração de hoje (1, 2, 3…) ou a corrigida (0, 1, 2…).
- O MAC do arquivo identifica a placa (`node.mac`). Vale mais que o `READY:<MAC>`, que o app
  continua aceitando. Uma placa já ligada a outra colmeia leva as leituras para a colmeia
  dela, e a tela avisa (US4).

## Exemplo

MAC `F0:F5:BD:12:AB:9C`, início 1793188800 (28/10/2026 12:00 UTC), uma medição numerada 1:

```
46 30 3A 46 35 3A 42 44 3A 31 32 3A 41 42 3A 39 43 00   "F0:F5:BD:12:AB:9C" + 0x00
C0 E3 E1 6A 00 00 00 00                                 início = 0x6AE1E3C0 = 1793188800
00 00 0A 42 00 00 74 42 C2 01 B4 00 01 00 00 00         34,5 °C · 61 % · eCO₂ 450 · TVOC 180 · número 1
```

(`tests/arquivo1.test.ts` monta exemplos assim, byte a byte, sem o codificador do app.)

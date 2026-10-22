# Contrato: formato `arquivo-0` (o `/measurements.bin` da placa)

**Fonte**: `teste_de_firmware.ino`, commit `e93f8ad` (2026-10-21): `struct Measurement`,
`saveInitialTimestamp`, `saveMeasurementToFile`, `getNextMeasurementId`. Gravado cru, da
memória do ESP32-C6 (RISC-V, little-endian). **Vai mudar** quando o grupo de armazenamento
acrescentar a identificação da placa: o leitor novo entra na tabela de
`src/core/decode/arquivo.ts`, e este continua como está.

## Layout

```
offset  tamanho  tipo        campo
0       8        uint64 LE   hora de início do arquivo, segundos Unix (o que o celular mandou)
8+16k   4        float32 LE  temperatura (°C), AHT21
12+16k  4        float32 LE  umidade relativa (%), AHT21
16+16k  2        uint16 LE   eCO₂ (ppm) — DERIVADO de voláteis pelo ENS160, não é CO₂
18+16k  2        uint16 LE   TVOC (ppb), ENS160
20+16k  4        uint32 LE   número da medição (id), 0, 1, 2…
```

`sizeof(Measurement) = 16` na compilação atual (sem enchimento: 4+4+2+2+4). A placa imprime
"Tamanho da struct Measurement: 16" a cada boot.

## Validação (o arquivo inteiro é recusado se qualquer uma falhar)

1. tamanho ≥ 8 (`curto-demais`);
2. `(tamanho − 8) % 16 === 0` (`tamanho-nao-multiplo`);
3. os 4 bytes altos da hora de início são zero, isto é, início < 2³² (`inicio-fora-de-faixa`);
4. no máximo 999.999 medições (`medicoes-demais`);
5. o número da medição `k` é `k` — começa em 0 e cresce de 1 em 1 (`numeracao-fora-de-ordem`).

A regra 5 é o que pega um formato mudado cujo tamanho por acaso ainda fecha (um registro de
20 bytes com 4 medições dá 80 = 5 × 16). No firmware atual, ela também recusa o arquivo se
`getNextMeasurementId` falhar ao abrir o arquivo (devolve 0 no meio) — a placa fica com o
arquivo, o bruto fica guardado no celular, e o grupo do firmware é avisado.

Recusado: nada é gravado em `reading`, o bruto fica em `pull_session.raw`, a placa **não**
recebe `RECEIVED`.

## Valores

- `float32` não finito (`NaN`, `±Inf`) → NULL, com o bit de motivo em `flags`.
- eCO₂ e TVOC: como vieram, inclusive 0 (é o que o sensor informou; o status não vem).
- Hora de início 0 (placa nova que tomou `HELLO` como hora) é válida para o formato e fica
  sem hora pela regra `inicio-implausivel`.

## Chave

`seq = início × 1.000.000 + id` (D-501). `t_node = id`.

## Exemplo

Início 1792152000 (16/10/2026 12:00 UTC), duas medições:

```
C0 11 D2 6A 00 00 00 00                       início = 0x6AD211C0 = 1792152000
33 33 0B 42 00 00 5C 42 90 01 B4 00 00 00 00 00   34,8 °C · 55 % · eCO₂ 400 · TVOC 180 · id 0
CD CC 0B 42 00 00 5E 42 A0 01 B9 00 01 00 00 00   34,95 °C · 55,5 % · 416 · 185 · id 1
```

(`tests/arquivo0.test.ts` confere este exemplo byte a byte.)

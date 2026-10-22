# Contrato: a conversa com a placa pelo cabo

**Fonte**: `COMMUNICATION_PROTOCOL.md` e `teste_de_firmware.ino`, repositório do grupo do
firmware, commit `e93f8ad` (2026-10-21). Este arquivo descreve **o que o app faz** em cada
passo; o protocolo é deles e vai mudar.

Porta: USB serial nativa do ESP32-C6, 115200 baud, 8 bits, sem paridade, 1 bit de parada.
Mensagens de controle terminam em LF. O app não muda os sinais DTR/RTS.

## Linhas que o app reconhece

| Linha (sem o fim de linha, sem espaços nas pontas) | O que é |
|---|---|
| `READY` ou `READY:<MAC>` (`AA:BB:CC:DD:EE:FF`, `:` ou `-`) | resposta ao `HELLO`; MAC opcional (pedido 1) |
| `FILE_INFO:<tamanho>:<crc>` ou `FILE_INFO:<tamanho>:<crc>:<intervalo_s>` | tamanho decimal (1–10 dígitos), CRC hexadecimal (1–8 dígitos), intervalo decimal ≥ 1 (pedido 2) |
| `TRANSFER_OK`, `REQUEST_TIMESTAMP`, `SESSION_COMPLETE` | passos da conversa |
| `ERROR:<CÓDIGO>` | erro da placa (tabela abaixo); código desconhecido também encerra |
| qualquer outra | diagnóstico: ignorado, guardado no registro da sessão |

Uma linha que **começa** como protocolo e não casa a forma (`FILE_INFO:abc`) encerra a
coleta como **protocolo desconhecido**, sem gravar nada.

Diagnósticos que o app usa **só para escolher a mensagem** (não são contrato):
`Aguardando timestamp inicial do dispositivo...`, `Timestamp inicial recebido: <n>`,
`Timestamp inicial salvo com sucesso!`, `Aguardando handshake USB...`,
`Timeout aguardando handshake.`, `Wake-up causado …`.

## Passo a passo do lado do app

| # | App faz | Espera | Prazo do app | Se der errado |
|---|---|---|---|---|
| 1 | abre a porta; manda `HELLO\n` | `READY` | reenvia `HELLO` a cada 4 s; desiste em 30 s | "a placa não respondeu: aperte o botão e toque em Coletar em até 30 s" |
| 2 | manda `GET_FILE\n` | `FILE_INFO` | 10 s | sem resposta: "tente de novo"; `ERROR:*`: tabela |
| 3 | lê **exatamente** `tamanho` bytes | — | 5 s sem nenhum byte | cabo saiu / placa parou: nada gravado, placa com o arquivo |
| 4 | calcula o CRC-32/ISO-HDLC | — | — | diverge: manda `ERROR:CHECKSUM_MISMATCH\n`, nada gravado |
| 5 | lê o arquivo (`arquivo-0`), grava tudo numa transação, torna durável | — | — | formato não reconhecido / gravação falhou: **não manda nada**; a placa desiste sozinha em 30 s |
| 6 | manda `RECEIVED:<tamanho>:<CRC 8 dígitos maiúsculos>\n` | `TRANSFER_OK` | 10 s | as leituras já estão salvas; a placa continua com o arquivo |
| 7 | — | `REQUEST_TIMESTAMP` | 10 s | idem |
| 8 | hora do celular plausível: manda `<segundos Unix>\n`; implausível: **não manda** e fecha | `SESSION_COMPLETE` | 10 s | ver "Erros depois da hora" |

A sessão só é dada como completa com `SESSION_COMPLETE` (ou `ERROR:BACKUP_CLEANUP_FAILED`,
em que o arquivo novo já foi instalado).

## Erros da placa → o que o app conclui

| `ERROR:` | Quando a placa manda | Arquivo da placa | O que a tela pede |
|---|---|---|---|
| `BAD_COMMAND` | linha longa demais ou comando inesperado (ex.: `HELLO` repetido) | continua | aperte o botão de novo e colete |
| `NO_FILE` | sem arquivo de medições | sem arquivo | Configurar placa nova |
| `FILE_OPEN_FAILED`, `FILE_SEEK_FAILED` | a placa não conseguiu ler o próprio arquivo | continua | tente de novo; se repetir, avise a pesquisadora (que leva ao grupo do firmware) |
| `SIZE_MISMATCH`, `BAD_CONFIRMATION` | a confirmação não bateu | continua | leituras salvas; colete de novo |
| `TIMESTAMP_TIMEOUT`, `TIMESTAMP_EMPTY`, `INVALID_TIMESTAMP` | a hora não chegou ou veio errada | continua | leituras salvas; a próxima coleta traz de novo, sem duplicar |
| `REMOVE_TEMP_FAILED`, `TEMP_OPEN_FAILED`, `TEMP_WRITE_FAILED`, `TEMP_VERIFY_OPEN_FAILED`, `TEMP_VERIFY_FAILED`, `REMOVE_BACKUP_FAILED`, `OLD_FILE_RENAME_FAILED`, `NEW_FILE_RENAME_FAILED` | falha ao recomeçar o arquivo | continua | idem |
| `BACKUP_CLEANUP_FAILED` | o arquivo novo foi instalado, sobrou o backup | apagado | nada; a placa limpa na próxima |
| `FILE_RESTORE_FAILED` | o arquivo foi para o backup e não voltou | **perdido** | leituras salvas no celular; Configurar placa nova |
| outro | — | não se sabe (depois da hora) ou continua (antes) | tente de novo; se repetir, avise a pesquisadora |

## Placa nova (primeiro boot)

Sem arquivo, a placa **não conversa**: espera, sem prazo, uma linha com a hora inicial. O app
(tela Configurar placa nova) manda `<segundos Unix>\n` se a hora do celular for plausível e
escuta 5 s: "Timestamp inicial salvo com sucesso!" → confirmou; "ERRO:…" → não salvou;
"Aguardando handshake USB…"/"Wake-up causado…" → já estava configurada; nada → enviado, sem
confirmação.

## Tempos

- 30 s: o que a placa espera por `HELLO` e por cada linha.
- 4 s entre `HELLO`s; 10 s por resposta; 5 s de silêncio no binário.
- Arquivo de 7 dias a 2 h: 1.368 bytes, ≈ 0,1 s a 115200 baud. Um arquivo de 4 MB (o flash
  inteiro) levaria ≈ 6 min; o app recusa anúncio acima de 8 MiB.

# Integração com o nó sensor — registro interno

**Documento interno do grupo do aplicativo.** O que enviamos ao grupo do firmware é o
[`questionario-firmware.md`](./questionario-firmware.md) — curto e sem jargão. Este arquivo
guarda o que eles **confirmaram**, com data e nome, o que ainda é **suposição nossa**, e as
notas técnicas que sustentam as perguntas.

> O Princípio VII da constituição exige que toda suposição sobre o nó esteja registrada aqui
> com data e quem confirmou — ou marcada explicitamente como não confirmada.

## Situação atual

**O protocolo real chegou em 2026-10-21**: repositório do grupo do firmware
(`beehive-monitoring-firmware`, commit **`e93f8ad`**, 2026-10-21 13:26 −0300) e três áudios
(explicação do grupo, resumida neste arquivo; a transcrição não fica no repositório).
A coleta é pelo **cabo USB**, com um arquivo binário (ver "Confirmações recebidas"). Ele
derrubou boa parte das nossas suposições — ver "Refutadas pelo firmware `e93f8ad`" abaixo.
A coleta pelo cabo (feature **005**) segue esse código; ver a seção
[Firmware de 2026-10-21](#firmware-de-2026-10-21-commit-e93f8ad--coleta-pelo-cabo). O
Bluetooth continua sem resposta.

**Atualização de 2026-10-28: commit `4cc7ed8`.** O arquivo da placa passou a começar com o
**MAC** dela (identidade da placa, o pedido 1), e o botão mudou para o GPIO 0 (D0). A
conversa pelo cabo não mudou. O app já lê o formato novo (`arquivo-1`, D-520); o que mudou,
o defeito de numeração que veio junto e os riscos novos estão na seção
[Firmware de 2026-10-28](#firmware-de-2026-10-28-commit-4cc7ed8). Roteiro do primeiro teste
com a placa: [`teste-com-a-placa.md`](./teste-com-a-placa.md).

**Existem três grupos, não dois** (confirmado por João, 2026-10-21): firmware, aplicativo
(nós) e **armazenamento**.

A coleta com esse protocolo é a feature **005** (tela "Coletar pelo cabo", no app de campo
no navegador). O botão **Coletar** das abas continua contra o transporte `mock`, com o
formato provisório nosso, e a tela da 004 só **lê** as linhas de bancada, sem gravar. A
`002` (envio e painel) não depende do firmware.

| Hardware | Estado |
|---|---|
| Seeed XIAO ESP32-C6 (não C3) | ✅ confirmado em 2026-10-21 |
| AHT21 — temperatura e umidade (I²C 0x38) | ✅ confirmado pelo código de bancada em 2026-10-14 |
| ENS160 — gás (I²C 0x52 ou 0x53) | ✅ confirmado pelo código de bancada em 2026-10-14 |
| Bateria | ❌ **ausente** do formato `e93f8ad`: o registro não tem campo de bateria. Antes fora informado verbalmente que haveria medição, sem formato |

### Dependência externa: grupo de armazenamento

Existe um **terceiro grupo, "armazenamento"**, do qual dependem o **layout do arquivo** e o
**ID da placa** (áudio 1: o formato "vai mudar pouco, porque vai ser só o ID da placa").
**Não temos contato direto com esse grupo nem prazo** para a mudança; tudo o que sabemos
dele chega pelo grupo do firmware. Até o ID chegar, o apicultor escolhe a colmeia na tela.

---

## Confirmações recebidas

Uma linha por resposta. Os números seguem a **v1** do `questionario-firmware.md` (P1–P7, no
histórico do git); a v2 renumerou o que falta. Sem data e sem nome,
a informação continua sendo suposição. A coluna "Confirmado por" separa a **fonte** (quem
disse ou escreveu) do **intermediário** (quem repassou ao grupo do aplicativo).

| # | Assunto | Resposta | Confirmado por | Data |
|---|---|---|---|---|
| 3 | Sensores | Código de **bancada** recebido: lê AHT20/21 e ENS160 a cada 1 s e imprime texto no Serial (`T= RH= Status= AQI= TVOC= eCO2=`). Ainda sem identificador, número de leitura, bateria, memória ou Bluetooth. Pinos SDA 22 / SCL 23 (D4/D5) | fonte: código de bancada do grupo do firmware (autor não registrado) · intermediário: João Pedro | 2026-10-14 |
| — | Placa | **Seeed XIAO ESP32-C6**, não C3. Tem Bluetooth LE, então nada muda no plano do app | fonte: grupo do firmware, informação verbal (autor não registrado) · intermediário: João Pedro | 2026-10-21 |
| 6 | Hora | A placa não terá marcação de hora própria. O celular manda, **depois** de `TRANSFER_OK`, a hora em **segundos Unix** (`REQUEST_TIMESTAMP` → `<segundos>\n`). A placa guarda só esse instante inicial; a hora de cada medição é **calculada pelo app**: inicial + id × intervalo (2 h em produção). Detalhes em `COMMUNICATION_PROTOCOL.md` do repositório deles. No áudio 2 apareceu "milissegundos"; documento e código dizem segundos — reconfirmar | fonte: repositório `e93f8ad` / áudios do grupo do firmware (grupo do firmware) · intermediário: João Pedro | 2026-10-21 |
| 1, 5, 7 | Transporte, numeração, apagar | Coleta por **cabo USB** (115200 8N1), protocolo `HELLO/READY/GET_FILE/FILE_INFO/<binário>/RECEIVED/TRANSFER_OK/REQUEST_TIMESTAMP/SESSION_COMPLETE`, CRC-32/ISO-HDLC. O `id` da medição **volta a 0 a cada coleta** e a placa **apaga** o arquivo depois de `SESSION_COMPLETE`. Formato do arquivo: `uint64` inicial + N × 16 bytes `{float temp, float rh, u16 eco2, u16 tvoc, u32 id}`, little-endian, e vai mudar pouco (entra o ID da placa, que depende do grupo de **armazenamento**) | fonte: repositório `e93f8ad` / áudios do grupo do firmware (grupo do firmware) · intermediário: João Pedro | 2026-10-21 |
| — | Grupos | O grupo de **armazenamento** é um terceiro grupo; o formato do arquivo depende dele (vai entrar o ID da placa) | fonte: áudio 1 do grupo do firmware · intermediário: João Pedro | 2026-10-21 |
| 2 | ID da placa | O **MAC** da placa (Wi-Fi STA, `esp_read_mac`) entra no começo do arquivo, como texto `AA:BB:CC:11:22:33` + `0x00` (18 bytes), antes da hora de início. O `READY` continua sem MAC | fonte: repositório `4cc7ed8` (código e `COMMUNICATION_PROTOCOL.md`), grupo do firmware · intermediário: João Pedro | 2026-10-28 |
| — | Botão | Botão no **GPIO 0 (D0)**, com pull-down na placa: solto em LOW, apertado em HIGH; acorda pelo nível alto | fonte: repositório `4cc7ed8` · intermediário: João Pedro | 2026-10-28 |

## Refutadas pelo firmware `e93f8ad` (2026-10-21)

Suposições do modelo da 001/003 que o protocolo real derrubou. O tratamento de cada uma
está na feature 005 (coleta pelo cabo). **A placa real só deve ser ligada pela tela
"Coletar pelo cabo"; o Coletar das abas continua sendo o transporte `mock`.**

| Suposição antiga | Pergunta | O que o firmware faz | Impacto |
|---|---|---|---|
| Existe um contador crescente por leitura, que não volta a 1 ao reiniciar | 5 | O `id` **zera a cada coleta** (0, 1, 2…) | `(node_id, id)` **colide** entre coletas: a segunda coleta seria descartada como repetida. A 005 resolve com `seq = início × 1e6 + id` (D-501) |
| O nó não apaga dados após a leitura | 7 | A placa **apaga o arquivo** depois de `SESSION_COMPLETE` | O celular passa a ser a **única cópia**: o app só pode responder `RECEIVED` depois de gravar, e a coleta bruta precisa ser guardada. Não existe "coletar de novo" se o celular quebrar |
| A carga carrega número de versão | 3 | **Sem versão** no arquivo nem no `FILE_INFO` | O decodificador não tem como saber qual formato chegou; quando o grupo de armazenamento mudar o layout, a mudança não se anuncia. A 005 dá um nome interno ao formato atual e pede versão no `FILE_INFO` |
| O status do ENS160 vem junto | 3 | O registro **não tem status** | Não dá para excluir as medições de aquecimento do ENS160; a 005 deixa os voláteis fora das médias até o status vir |
| Cada leitura traz os segundos desde que a placa ligou | 6 | **Sem uptime** por leitura; hora = inicial + id × intervalo | O modelo da 003 (`t_node` + referência da coleta) não se aplica; a hora é **estimada** pela contagem, e o intervalo não vem no arquivo (o app assume 2 h) |
| Cada leitura traz o número da ligada | 6 | **Sem número de ligada** | `boot_id` não tem origem. Um religamento sem coleta não é detectável pelos dados; se o relógio da placa recomeçar fora do horário, a conta "inicial + id × intervalo" erra |

Também deixaram de valer, porque descreviam um protocolo que não existe: "na conexão a placa
informa o contador daquele instante" (`ClockAnchor.tNodeAtAnchor` fica sem origem), "a placa
não pula o número para trás ao religar" e "a placa não usa a hora para decidir o que já foi
coletado" (quem decide é o apagamento depois de `SESSION_COMPLETE`). "A placa aceita a hora
em segundos Unix e responde" foi **confirmada** (linha 6 acima), com a ressalva dos segundos.

## Ainda em aberto

Enquanto não houver confirmação, o código assume o seguinte. **Cada item aqui é uma dívida.**

> **Para a placa do cabo, esta tabela foi substituída** pela seção do firmware de 2026-10-21
> (abaixo), que diz o que o código deles confirmou e o que contradisse. A tabela continua
> valendo para o Bluetooth e para o formato provisório `v1` do transporte simulado.

| Suposição | Pergunta | Onde impacta | Risco se estiver errada |
|---|---|---|---|
| Virá um ID estável da placa (o MAC de fábrica), nos dados e não do endereço Bluetooth. Depende do grupo de armazenamento | 2 | identidade do nó; hoje o apicultor escolhe a colmeia | leituras de duas colmeias trocadas ou misturadas; iOS não consegue identificar colmeias |
| Valor inválido usa marcador, não zero | 4 | marcação de qualidade | zeros entram na análise como medição |
| Se houver Bluetooth, será BLE GATT, não Bluetooth Clássico | 1 | viabilidade de iOS no futuro | iOS impossível sem certificação MFi |

## A verificar na sessão de teste conjunta

Tiramos do questionário para não sobrecarregar o outro grupo. Resolvemos juntos, com o
celular e a placa na mesa:

- UUIDs de serviço e características BLE.
- O que vai no anúncio e o que vai no *scan response*. O UUID do serviço precisa estar no
  anúncio primário — no *scan response*, o iOS não consegue filtrar e nunca acha a colmeia.
- MTU negociado e quantos registros cabem por pacote. O app deriva isso do tamanho recebido
  e nunca assume um número fixo.
- Tempo real para baixar um acúmulo de 7 dias, para dimensionar a barra de progresso.
- Se o nó anuncia sempre ou precisa de botão para acordar — muda o fluxo da tela de coleta.
- Se existe *bonding*. A tabela de bond do ESP32 costuma ter 3 a 5 entradas; uma colmeia
  visitada por vários celulares esgota isso.
- Byte a byte do registro, endianness e fatores de escala — a partir do exemplo real.
- **Hipóteses sobre o código de bancada, ainda não testadas pelo grupo (2026-10-21):**
  aquecimento do AHT21 pelo ENS160 (comparar com termômetro); aquecimento real do ENS160
  pelo `Status`, não pelo cronômetro de 3 min (primeira partida ~1 h); `millis()` de 32 bits
  zera em ~49,7 dias; `while(1)` trava a placa se um sensor falhar ao ligar.
- **Usar a tela "Ler a placa pelo cabo" (feature 004) para os dois testes acima.** Placa no
  USB do computador, app de campo no Chrome ou no Edge, termômetro de referência ao lado.
  A tela desenha a temperatura dos últimos 5 minutos e mostra o `Status` do ENS160 em
  palavra; "Salvar o que foi visto" baixa a planilha da sessão para comparar com o
  termômetro. A tela **não grava nada** no app: as linhas de bancada não têm identificador
  da placa nem número da leitura. Ela assume o formato `bancada-0` abaixo, **não confirmado
  como contrato** — é o que o código de bancada de 2026-10-14 imprime:
  `T=34.52C RH=61.20% Status=0 AQI=2 TVOC=180ppb eCO2=650ppm`, com `(TEXTO)` opcional depois
  do `Status`, a 115200 baud, uma linha por segundo, terminada em `\r\n`. Também **não
  confirmado**: o significado do `Status` (0 normal, 1 aquecendo, 2 primeira partida, 3
  inválido — tirado do datasheet do ENS160 e do código de bancada) e que temperatura ou
  umidade inválidas saem como `nan`, `inf` ou `ovf` (o que o `Serial.print` do Arduino
  imprime para float inválido). Se o grupo mudar a linha, a tela mostra as linhas como
  "ilegível" (ou como mensagem de texto, se não tiverem
  nenhum `T=`, `TVOC=`…) até acrescentarmos um leitor novo — nunca as lê pela metade. 15 s sem
  nada chegar é tratado como placa parada. Para a leitura pelo cabo **gravar**, cada linha
  precisa ganhar identificador da placa, número da leitura e versão do formato — levar esse
  pedido à sessão.
- O comando de hora: em qual característica BLE ele vai, o formato exato, e o que a placa
  responde. *Modelo da 003, superado pelo protocolo `e93f8ad`:* "o app manda a hora
  **antes** de baixar as leituras, espera no máximo 5 s pela resposta e segue a coleta mesmo
  sem ela". **No protocolo real a hora vai DEPOIS de `TRANSFER_OK`**, em resposta a
  `REQUEST_TIMESTAMP`; ver a feature 005 (coleta pelo cabo).
- Desligar e religar a placa no meio do teste, para ver o que acontece com a hora e com o
  contador de segundos desde que ligou.

### Como o app trata a hora (resumo para a sessão de teste)

> **Modelo da 003, superado pelo protocolo `e93f8ad`:** a hora vai **DEPOIS** de
> `TRANSFER_OK`, a placa não manda contador de segundos nem número de ligada, e a hora de
> cada medição é inicial + id × intervalo. Ver a feature 005 (coleta pelo cabo). O texto
> abaixo descreve o que o transporte `mock` ainda faz e vale como histórico.

Feature 003 (`specs/003-hora-das-leituras/`), em vigor desde 2026-10-21:

- O celular manda a hora em UTC a cada coleta, como **melhor esforço**: se a placa recusa ou
  não responde, a coleta continua e o app mostra um aviso, nunca um erro.
- A hora de cada leitura é calculada pelo app a partir do contador de segundos desde que a
  placa ligou e de uma **referência**: a hora do celular e o contador da placa no momento de
  uma coleta. Só vale referência **da mesma ligada** da leitura. Leitura de uma ligada que
  nenhuma coleta viu fica **sem hora**, contada e fora dos gráficos.
- O app descobre que a placa religou pelo contador que volta (ou pelo número da ligada, se a
  placa mandar). Por isso **desligar e religar no meio do teste** é o caso mais importante a
  conferir juntos.
- Duas coletas da mesma ligada se conferem: o tempo que passou pelo celular e pelo contador
  da placa pode divergir até **10 min + 1 % do intervalo** (provisório: falta medir a deriva
  do oscilador do ESP32 em sono profundo). Divergiu: o app **não** manda a hora e pergunta ao
  apicultor se a data do celular está certa.
- Data do celular antes de setembro de 2026: a hora não é enviada e não vira referência.
- O contador bruto e as referências ficam guardados para sempre; uma correção de hora é
  registrada à parte, e a leitura original nunca muda.

---

## Firmware de 2026-10-21 (commit `e93f8ad`) — coleta pelo cabo

**Fontes, todas de 2026-10-21:** `COMMUNICATION_PROTOCOL.md` e
`teste_de_firmware/teste_de_firmware.ino` do repositório `beehive-monitoring-firmware`, commit
`e93f8ad` (13:26 −0300), lidos por nós e **não executados**; três áudios do grupo do firmware,
repassados por João. Quando o documento e o código divergem, vale o código, e a divergência
está marcada. Uso no app: `specs/005-coleta-pelo-cabo/` (contratos em `contracts/`).

### Confirmado (pelo código e/ou pelos áudios)

| Assunto | O que vale | Fonte |
|---|---|---|
| Placa | Seeed XIAO ESP32-C6, SDA 22, SCL 23, botão no GPIO 2 | `.ino`, `e93f8ad` |
| Porta | USB serial nativa, `Serial.begin(115200)`; mensagens de controle em LF | doc + `.ino` |
| Conversa | `HELLO` → `READY` (+ "Handshake estabelecido!") → `GET_FILE` → `FILE_INFO:<tam>:<CRC %08lX>` → binário exato → `RECEIVED:<tam>:<crc>` → `TRANSFER_OK` → `REQUEST_TIMESTAMP` → `<segundos>` → `SESSION_COMPLETE` | doc + `.ino`; áudio 3 |
| Ordem | primeiro `FILE_INFO` (tamanho + CRC-32), depois o binário; nada de texto entre os dois | áudio 1; doc §7.2 |
| CRC | CRC-32/ISO-HDLC, polinômio refletido `0xEDB88320`, início e XOR final `0xFFFFFFFF`, sobre o arquivo inteiro; `RECEIVED` aceita maiúsculas e minúsculas | doc §3 + `.ino` |
| Arquivo | `uint64` LE de hora de início + N × `struct Measurement { float temperature; float humidity; uint16_t eco2; uint16_t tvoc; uint32_t id; }` = 16 bytes, gravado cru (RISC-V, LE) | `.ino`; áudio 1 |
| Hora de início | a de quando a placa começou a medir (a hora enviada na coleta anterior, ou no primeiro boot) | áudio 1; `.ino` |
| Numeração | `id` = último + 1; volta a 0 quando o arquivo só tem a hora de início, isto é, **a cada coleta** | `.ino` (`getNextMeasurementId`) |
| Hora de cada medição | **o app calcula**: medição *k* = início + *k* × intervalo ("se a gente fosse fazer isso dentro do ESP32 ia ficar muito pesado") | áudio 1 |
| Intervalo | produção 2 h; teste `SLEEP_TIME = 10` s. O período real é sono + tempo acordado | áudio 1; `.ino` |
| Apagar | depois de receber a hora, a placa troca o arquivo por um novo só com a hora (temporário + backup + renomear) e manda `SESSION_COMPLETE` | áudio 2; doc §4 |
| Prazos da placa | 30 s pelo `HELLO` e por cada linha; linha de até 128 caracteres | doc §1 + `.ino` |
| Erros | `BAD_COMMAND`, `NO_FILE`, `FILE_OPEN_FAILED`, `FILE_SEEK_FAILED`, `SIZE_MISMATCH`, `BAD_CONFIRMATION`, `TIMESTAMP_TIMEOUT`, `INVALID_TIMESTAMP`, `REMOVE_TEMP_FAILED`, `TEMP_OPEN_FAILED`, `TEMP_WRITE_FAILED`, `TEMP_VERIFY_OPEN_FAILED`, `TEMP_VERIFY_FAILED`, `REMOVE_BACKUP_FAILED`, `OLD_FILE_RENAME_FAILED`, `NEW_FILE_RENAME_FAILED`, `FILE_RESTORE_FAILED`, `BACKUP_CLEANUP_FAILED`; o app pode mandar `ERROR:CHECKSUM_MISMATCH` | doc §5 |
| Diagnósticos | saem na **mesma** serial ("LittleFS iniciado…", "Wake-up causado pelo GPIO.", "Timestamp recebido: …"); o cliente ignora | doc §5, §7.1 |
| Despertar | pelo botão (GPIO) roda a conversa; pelo temporizador só mede. Com sucesso **ou** falha da conversa, a placa mede uma vez e volta a dormir | `.ino` (`setup`/`loop`) |
| Primeiro boot | sem arquivo, a placa espera, **sem conversa e sem prazo**, uma linha com a hora inicial (`strtoull`, sem validar) | doc §6 + `.ino` |
| Cliente Java | o grupo tem um programa de teste em Java que recebe o arquivo e pode mandar | áudio 3 |

### Divergências entre fontes (registradas, a confirmar)

- **Unidade da hora enviada:** o áudio 2 diz "Unix timestamp em milissegundos"; o documento e o
  código dizem **segundos**. O app manda segundos (pedido 4).
- **`ERROR:TIMESTAMP_EMPTY`** existe no código mas não no documento; o documento diz que
  linha vazia dá `TIMESTAMP_TIMEOUT`, e o código de fato chega lá antes. O app trata os dois.
- **Doc §7.1** diz que "Handshake estabelecido!" pode ser lida pela placa como comando. Pelo
  código, essa linha sai **da placa**; quem precisa ignorá-la é o app (e ignora).

### Contradiz suposições antigas (tabela acima)

| Suposição antiga | O que o firmware faz | O que o app faz (feature 005) |
|---|---|---|
| O nó não apaga dados após a leitura | **apaga** depois de receber a hora | grava de forma durável **antes** de `RECEIVED`; sem gravação, não confirma |
| Existe um contador crescente que não volta ao reiniciar | o `id` volta a 0 a cada coleta (não na falta de energia) | `seq = início × 1.000.000 + id` (D-501); `id` bruto em `t_node` |
| A carga carrega número de versão | não carrega | leitor `arquivo-0` escolhido por nós (`proto_ver = 100`), validação estrutural |
| Cada leitura traz os segundos desde que a placa ligou | não há hora nenhuma por medição | hora estimada pela contagem, conferida no fim da coleta (emenda da FR-016 da 003) |
| O status do ENS160 vem junto | não vem | voláteis fora das médias (pedido 5) |
| O identificador vem nos dados | não vem | o apicultor escolhe a colmeia (pedido 1) |
| Valor inválido usa marcador | `float` pode vir `NaN` | `NaN` → NULL com motivo em `flags` |

### Dependência: grupo de armazenamento

O formato do arquivo depende do terceiro grupo, de armazenamento. Áudio 1: "a organização do
arquivo provavelmente vai mudar … mas vai mudar pouco: só vai entrar o ID da placa". **Mudou
em 2026-10-28 (`4cc7ed8`): entrou o MAC na frente; leitor `arquivo-1`.** O texto abaixo é o
de 21/10. Quando
mudar, o leitor novo entra na tabela de `src/core/decode/arquivo.ts` (o `arquivo-0` fica). O
app hoje recusa um arquivo cujo tamanho não seja 8 + múltiplo de 16 ou cuja numeração não seja
0, 1, 2…: um ID acrescentado no cabeçalho é recusado (nada se perde: a placa não recebe
confirmação e o bruto fica no celular), não lido errado. **Precisamos saber antes de eles
mudarem:** onde o ID entra, quantos bytes, e como o app distingue o formato novo do velho
(versão no `FILE_INFO` ou no `READY`).

### Riscos a verificar com a placa (não confirmados)

1. **Abrir a porta reinicia a placa?** No ESP32-C6 com USB nativa, a combinação dos sinais
   DTR/RTS ao abrir pode reiniciar o chip. Aí a causa do despertar deixa de ser GPIO ("Wake-up
   causado motivo desconhecido."), a conversa não roda e a placa só mede. O app não mexe nos
   sinais. Conferir no Chrome do Windows, macOS e Linux.
2. **A porta some e reaparece.** A USB some quando a placa dorme e volta quando acorda. Medir
   quanto tempo entre o botão e a porta aparecer, e entre a porta aparecer e a placa ouvir o
   `HELLO` (o app reenvia a cada 4 s; um `HELLO` que chegue depois do `READY` dá
   `ERROR:BAD_COMMAND`).
3. **Tempo acordado e deriva.** O período real é sono + acordado (teste ≈ 24–25 s; produção
   2 h + ~3 min se a espera de 3 min entrar). A deriva do oscilador lento em sono profundo não
   foi medida. A folga da conferência (5 % do tempo decorrido) é provisória.
4. **Placa nova recebendo `HELLO`.** No primeiro boot a placa toma qualquer linha como hora
   inicial; `HELLO` vira 0 (1970). O app detecta pelo diagnóstico quando consegue, e as
   leituras desse arquivo ficam sem hora.
5. **`getNextMeasurementId` devolve 0 se não abrir o arquivo**, o que repetiria o `id` 0 no
   meio. O app recusa o arquivo (numeração fora de ordem) e avisa; a placa fica com o arquivo.
6. **Botão apertado sem coleta** gera uma medição fora do ritmo e recomeça o temporizador dali;
   **falta de energia** não fica registrada em lugar nenhum. Os dois deslocam a série em menos
   de um intervalo. A conferência (a última medição tem de cair até um intervalo antes da
   coleta, mais a folga) só vê o deslocamento que passa do tempo entre a última medição e a
   coleta mais a folga; o resto fica "estimado" com erro de **até um intervalo mais a folga**
   (research D-507, revisão de 2026-10-22). Tentar de novo logo depois de uma coleta que
   falhou quase sempre deixa um arquivo curto sem hora — por isso o pedido 3.
7. **`FILE_RESTORE_FAILED`** deixa a placa sem arquivo; ela volta ao primeiro boot e espera a
   hora para sempre. As leituras já estão no celular.

### Pedidos ao grupo do firmware (João manda; texto curto em `mensagem-firmware-2026-10-21.md`)

Por ordem de importância:

1. **MAC da placa no `READY`** (`READY:AA:BB:CC:DD:EE:FF`) ou no começo do arquivo. O app já
   aceita o `READY` com MAC sem quebrar o atual.
2. **Intervalo no `FILE_INFO`** (`FILE_INFO:<tam>:<crc>:<intervalo_s>`), ou fixo e combinado. O
   app já aceita o terceiro campo.
3. **Não medir quando o botão acorda a placa e a coleta não completa** — essa medição fora do
   ritmo quebra a conta da hora.
4. **Confirmar: a hora enviada é em segundos** (o áudio disse milissegundos).
5. Se der: **status do ENS160 por medição**. Opcional: **hora por medição** (`time()` depois de
   `settimeofday` ao receber a hora).

Estado: **não enviados ainda** (2026-10-21). Ao responderem, uma linha na tabela de
confirmações acima, com data e nome.

---

## Firmware de 2026-10-28 (commit `4cc7ed8`)

**Fontes:** `firmware/firmware.ino`, `teste_de_firmware/teste_de_firmware.ino`,
`leitura_de_arquivo/leitura_de_arquivo.ino` e `COMMUNICATION_PROTOCOL.md` do commit `4cc7ed8`
(2026-10-28 13:28 −0300), lidos por nós e **não executados**. Sete commits depois do
`e93f8ad`. Uso no app: D-520 e `contracts/arquivo-1.md` da feature 005.

### O que mudou

| Assunto | `e93f8ad` (21/10) | `4cc7ed8` (28/10) | No app |
|---|---|---|---|
| Arquivo | hora (8) + medições | **MAC em texto + `0x00` (18)** + hora (8) + medições | leitor `arquivo-1`, `proto_ver = 101` |
| Numeração | 0, 1, 2… | **1, 2, 3…** (defeito, ver abaixo) | chave e hora pela posição; os dois começos valem |
| Identidade | nenhuma | o MAC, dentro do arquivo | `node.mac`; a placa reconhece a colmeia sozinha |
| Botão | GPIO 2 | **GPIO 0 (D0)**, pull-down na placa | — |
| Erros novos | — | `MAC_READ_FAILED`, `TEMP_MAC_WRITE_FAILED` (antes de mexer no arquivo) | a placa fica com o arquivo |
| `firmware.ino` | só o teste existia | versão de produção: 2 h, e textos curtos (`HELLO`, `TIMEOUT`, "does not exists.") | os dois conjuntos de textos são reconhecidos |
| Primeiro boot (teste) | "Timestamp inicial salvo com sucesso!" | "MAC e timestamp inicial salvos com sucesso!" | reconhecido: "Configurar placa nova" confirma |
| Conversa | — | **igual** (`HELLO` … `SESSION_COMPLETE`, CRC, prazos de 30 s) | nada a mudar |

### Defeitos e riscos novos

1. **A numeração começa em 1.** `getNextMeasurementId` ainda compara o tamanho com 8 bytes
   ("só a hora"). No arquivo novo de 26 bytes, lê o fim do MAC e a hora como se fossem uma
   medição, e a primeira medição recebe 1. O próprio grupo registrou (§7.2 do protocolo:
   "precisa ser corrigida"). **Impacto se o app usasse o número:** toda hora uma medição
   adiantada, 2 h em produção, sem sinal nenhum. O app usa a posição (D-520), então a
   correção do firmware não muda nada do nosso lado. Correção sugerida: tratar como vazio o
   arquivo de até 26 bytes.
2. **O sensor de gás fica ligado durante o sono (a confirmar).** O código põe o ENS160 em
   modo padrão a cada despertar e nunca o desliga antes do sono profundo. A alimentação de
   3,3 V da XIAO continua ligada no sono, então o aquecedor fica ligado as 2 h inteiras
   (cerca de 29 mA, pelas nossas notas), e o AHT21 ao lado pode ler **+4 a +6 °C** (ver
   "O ENS160 aquece o AHT21"). O AHT21 é lido primeiro a cada despertar, o que só ajuda se o
   ENS160 tiver dormido. Conferir no teste com um termômetro ao lado; pedir
   `setMode(ENS160_OPMODE_DEP_SLEEP)` antes de `esp_deep_sleep_start()`.
3. **`LittleFS.begin(false)` não formata.** Os commits de 08/10 usavam `begin(true)`. Uma placa
   que nunca teve o sistema de arquivos formatado não cria o arquivo, e "Configurar placa
   nova" responde que a placa não conseguiu guardar a hora. As placas do grupo já devem estar
   formatadas; uma placa nova, não.
4. **Primeiro boot sem conseguir ler o MAC deixa um arquivo vazio.** `saveInitialTimestamp`
   abre o arquivo antes de ler o MAC. Com `MAC_READ_FAILED`, sobra um arquivo de 0 bytes, e
   no boot seguinte a placa acha que já está configurada. Raro (o MAC vem de fábrica);
   reproduzido na placa simulada.
5. **Continuam valendo** os riscos 1 a 7 da seção de 2026-10-21 (reset ao abrir a porta,
   porta que some, tempo acordado e deriva, `HELLO` como hora numa placa nova, medição fora do
   ritmo pelo botão).

### Estado dos pedidos de 2026-10-21

| Pedido | Estado em 28/10 |
|---|---|
| 1. MAC da placa | **atendido**, no arquivo (não no `READY`) |
| 2. Intervalo no `FILE_INFO` | não; o app usa o intervalo escolhido na tela da colmeia (2 h padrão; "25 segundos" para a placa de teste) |
| 3. Não medir quando a coleta falha | não |
| 4. Hora em segundos | o documento e o código continuam dizendo segundos |
| 5. Status do ENS160 | não; voláteis seguem fora das médias |

Pedidos novos e o texto para o grupo: [`mensagem-firmware-2026-10-28.md`](./mensagem-firmware-2026-10-28.md).

---

## Notas técnicas

Referência para o nosso grupo. No questionário, estas notas viraram dois parágrafos curtos.

### O ENS160 aquece o AHT21

O ENS160 é um sensor MOX: quatro micro-placas aquecidas a 200–300 °C, consumindo cerca de
29 mA contínuos em modo padrão. Nas placas combinadas AHT21+ENS160 baratas, os dois
componentes ficam a milímetros de distância e o plano de terra distribui o calor.

Relatos de campo são consistentes: **+4 a +6 °C de desvio** no AHT21 com o ENS160 ativo, e
mais de +1 °C mesmo com o ENS160 desabilitado porém alimentado. É cerca de **vinte vezes** a
exatidão de ±0,3 °C do AHT21. Um ninho a 34,5 °C lido como 39,5 °C parece dado biológico
plausível — não parece falha, e é isso que o torna perigoso.

**O que só o firmware pode fazer:** ler o AHT21 primeiro, antes de energizar o ENS160; e
transmitir uma indicação de "ENS160 ligado" em cada amostra. Com ela conseguimos marcar e
corrigir depois; sem ela, nem detectar.

**O que fazemos do nosso lado, independentemente da resposta:** guardar sempre o valor bruto,
com `calib_version` e um offset por colmeia aplicado apenas na renderização (FR-013). Assim a
série inteira pode ser recomputada quando o desvio for caracterizado.

**Vale medirmos nós mesmos**, com uma placa e um termômetro de referência. É um gráfico de
uma hora, decide se a placa serve como está, e é resultado publicável.

### O ENS160 não mede CO₂

Verificado contra o datasheet primário (ENS160 v1.3, SC-001224-DS-9) e o white paper da
ScioSense. O ENS160 é MOX, não NDIR. **CO₂ nem consta da lista de gases caracterizados**
(§6, Tabela 7: etanol, hidrogênio, acetona, monóxido de carbono, tolueno).

O valor **eCO₂** é calculado a partir dos voláteis e do hidrogênio detectados (§16.2.10),
invertendo a lei de Pettenkofer, que correlaciona CO₂ exalado e voláteis **de metabolismo
humano**. A própria ScioSense escreve que leituras de CO₂ equivalente *"should not be
confused with CO₂ measurements."*

Consequências para uma colmeia:

- **A faixa do eCO₂ começa em 400 ppm** — ele *assume* ar de fundo a 400 ppm. Numa colmeia
  o CO₂ real nunca chega perto desse valor.
- **CO₂ real de colmeia fica entre 3.300 e 17.700 ppm** (Seeley, ao longo de uma noite fria).
  O ENS160 não tem canal que responda a essa faixa.
- **Os dois podem andar em sentidos opostos.** Colônia perturbada libera feromônio de alarme
  (acetato de isopentila, a classe a que o MOX responde mais forte), então o eCO₂ sobe. Ao
  mesmo tempo as abelhas ventilam, e o CO₂ real cai.
- **Deriva de baseline:** o algoritmo presume ver ar limpo periodicamente. Uma colmeia
  propolizada nunca vê, e o baseline se re-ancora no fundo crônico da própria colmeia.

**Isto muda o que o sensor é, não o invalida.** O app trata o canal como **"Voláteis da
colmeia (COVs)"**: TVOC é o sinal primário, eCO₂ fica arquivado e nunca é exibido como CO₂, e
toda análise é relativa ao histórico da própria colmeia.

**Pedido futuro, se o firmware permitir:** as resistências brutas das quatro placas e seus
baselines. A razão `R_bruto / R_baseline` é mais portável entre sensores e ao longo do tempo,
e está acima do baselining proprietário — reproduzível e publicável. Não entrou no
questionário para não pesar; vale levantar na sessão de teste.

**Caminho de evolução, se as especialistas precisarem de CO₂ real:** SCD41 (NDIR
fotoacústico), I²C 0x62, sem colisão com AHT21 nem ENS160, 0 a 40.000 ppm, cerca de 0,45 mA
em modo single-shot a cada 5 minutos — aproximadamente 1/30 do consumo contínuo do ENS160.

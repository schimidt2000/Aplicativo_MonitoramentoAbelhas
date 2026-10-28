# Fase 0 — Pesquisa e decisões

**Feature**: `specs/005-coleta-pelo-cabo` · **Data**: 2026-10-21

Fonte primária: repositório do grupo do firmware, commit `e93f8ad` (2026-10-21 13:26 −0300),
lido e **não executado**: `COMMUNICATION_PROTOCOL.md` e `teste_de_firmware/teste_de_firmware.ino`.
Fonte secundária: a explicação do grupo do firmware em 2026-10-21, resumida em `docs/integracao-firmware.md`.
Quando o documento e o código divergem, vale o código, e a divergência vai para
`docs/integracao-firmware.md`.

---

## D-501 — A chave de cada leitura: `seq = início × 1.000.000 + número`

**Problema.** O número da medição (`Measurement.id`) recomeça do zero a cada coleta
(`getNextMeasurementId` devolve 0 quando o arquivo só tem a hora de início). `(nó, id)` não é
único entre coletas; `(hora de início, id)` é. A constituição exige chave `(node_id, seq)`.

**Decisão.** `seq` é derivado, de forma determinística e sem estado, do par que é único:
`seq = inicioS × 1.000.000 + id`. `t_node` guarda o `id` bruto.

- Determinístico: o mesmo arquivo dá os mesmos `seq`; um arquivo maior que contém o anterior
  (placa que não apagou) dá os mesmos `seq` para as medições antigas e `seq` novos só para as
  novas. `INSERT OR IGNORE` faz o resto (SC-002).
- Legível: `1792152000000123` é "arquivo que começou em 1792152000, medição 123".
- Cresce com o tempo: cada coleta completa dá à placa uma hora de início maior.
- Limites, validados pelo leitor: `inicioS < 2³²` (os 4 bytes altos do `uint64` são zero; até
  2106) e `id < 1.000.000`. O maior `seq` possível é ≈ 4,3 × 10¹⁵ < 2⁵³: inteiro exato em
  JavaScript, em `INTEGER` do SQLite e em `bigint` no Postgres.

**Alternativas rejeitadas.**
- *Contador do app* (`seq = último + 1` por arquivo novo, guardado numa tabela): a reimportação
  depende de lembrar a atribuição; e duas placas escolhidas para a mesma colmeia por engano
  fariam um arquivo crescer "por cima" de números já atribuídos ao outro — `INSERT OR IGNORE`
  descartaria leitura nova em silêncio. Perder leitura é defeito crítico.
- *`início × 2²¹ + id`*: mesma garantia, ilegível.
- *Hora de início como `boot_id`*: `boot_id` é proibido em chave (Princípio III).

**Risco aceito.** Duas placas com a mesma hora de início no mesmo segundo, escolhidas para a
mesma colmeia, colidiriam. Só acontece com escolha errada de colmeia e mesmo segundo; some
quando o MAC chegar (D-510).

## D-502 — Gravar e tornar durável ANTES de mandar `RECEIVED`

A placa apaga o arquivo depois de receber a hora, e a hora só vai depois de `TRANSFER_OK`, que
só vem depois de `RECEIVED`. Então `RECEIVED` é o ponto sem volta do nosso lado.

**Decisão.** Uma transação grava: a sessão com o arquivo bruto, o CRC, o formato; as
leituras; a referência de hora da coleta; e a avaliação das horas. Depois, `db.persist()` (no
navegador, o snapshot vai para o IndexedDB; no celular é no-op, o commit já é durável). **Só
com as duas coisas** a máquina de estados recebe `gravou` e emite `RECEIVED`. Falha em
qualquer uma: `nao-gravou`, nada é enviado, e a placa fica com o arquivo (ela desiste sozinha
em 30 s, mede e dorme).

No navegador, "durável" é a transação do IndexedDB com `durability: 'strict'` (só conclui
depois do disco); no padrão, Chrome e Firefox podem concluí-la antes, e uma queda de energia do
computador logo depois do `RECEIVED` perderia a coleta que a placa já apagou. Só o `persist()`
explícito pede `strict`; a gravação de fundo fica no padrão (`tests/db-web-duravel.test.ts`,
revisão de 2026-10-22).

Não mandamos `ERROR:CHECKSUM_MISMATCH` na falha de gravação: seria afirmar à placa uma coisa
falsa. Só o mandamos quando o CRC de fato diverge (é o uso documentado).

## D-503 — Uma porta de canal de bytes, e não a interface `Transport`

`Transport`/`NodeSession` da 001 têm a forma "conectar, mandar a hora antes, puxar por cursor
em lotes". O protocolo do firmware tem outra: arquivo inteiro, confirmação **depois** da
gravação durável, e a hora **depois** — e essa hora apaga o arquivo da placa. Encaixar no
`pullReadings` exigiria que a placa só recebesse `RECEIVED` quando o consumidor do iterador
pedisse o próximo lote **e** depois de um `persist()` que hoje acontece fora do laço: um
contrato invisível, fácil de quebrar sem nenhum teste notar.

**Decisão.** `src/core/ports/canal.ts` declara `CanalSerial` (escrever texto, ler linha, ler N
bytes, fechar). O transporte do cabo (`src/transports/cable/coleta.ts`, Web Serial) e a placa
simulada (`src/transports/mock/firmware.ts`) implementam essa porta. A conversa é uma máquina
de estados pura em `src/core/cabo/`; a gravação fica em `src/data/coletaCabo.ts`, que usa a
**mesma** ingestão (`ingerirLote`), a **mesma** hora (VIEW `leitura_hora`) e o **mesmo**
resultado (`ResultadoColeta`, `montarAvisos`) da coleta existente. Registrado como violação
justificada (Complexity Tracking do plano).

## D-504 — Máquina de estados pura, com o tempo nos eventos

`passo(estado, evento) → { estado, acoes }`, sem `await`, sem relógio próprio. Cada evento
traz `agora`. As ações são uma lista de `enviar` seguida de exatamente uma espera (`linha`,
`bytes`, `gravar`, `decidir-hora`) ou de `terminar`. Os dois pontos de decisão que a
constituição e o briefing exigem são ações explícitas:

- `gravar` — quem executa (o `data/`) responde `gravou` ou `nao-gravou`; só `gravou` leva a
  `RECEIVED`.
- `decidir-hora` — quem executa responde com os segundos ou com `null` (hora do celular
  implausível); `null` encerra sem mandar nada.

Um executor (`src/core/cabo/sessao.ts`) traduz as ações em chamadas à porta. Assim cada
transição é testada sem porta, sem relógio e sem espera.

## D-505 — Um só leitor de bytes, com modo linha e modo "N bytes exatos"

O `FILE_INFO` e o começo do binário chegam, muitas vezes, no mesmo pedaço. Um leitor de
linhas que decodifica o pedaço inteiro em texto (como o `JuntadorDeLinhas` da 004) estragaria
o binário. **Decisão:** `src/transports/cable/entrada.ts` guarda **bytes**; `lerLinha` consome
até o primeiro LF e decodifica só aquela linha; `lerBytes(n)` consome exatamente `n` bytes, os
que sobraram do pedaço da linha primeiro. Fim de linha é **só** LF (`0x0A`), com um CR final
retirado: o `FILE_INFO` sai com `printf("…\n")`, sem CR, e um CR sozinho nunca pode encerrar
uma linha, porque o próximo byte já é binário. Linha acima de 512 bytes é descartada até o
próximo LF. Prazo de linha por relógio de parede; prazo de binário por silêncio.

## D-506 — Reenviar `HELLO` a cada 4 s, até 30 s

A placa espera `HELLO` por 30 s e ignora qualquer outra linha nessa espera. Se o primeiro
`HELLO` sair antes de a serial da placa estar pronta (a porta USB aparece no início do boot),
ele se perde. Reenviar resolve, mas tem um risco real: se a placa já respondeu `READY` e o
nosso segundo `HELLO` chega, ela o lê como o pedido de arquivo e responde
`ERROR:BAD_COMMAND`. Com 4 s entre envios a janela é estreita. O erro pede para apertar o
botão de novo. **A verificar com a placa** (quanto tempo entre a porta aparecer e a serial
ouvir).

## D-507 — Hora por contagem e a conferência

Para cada arquivo (bloco de `seq` com a mesma hora de início `T0`):

- hora da medição `id` = `T0 + id × I`, `I` = intervalo do `FILE_INFO` daquela coleta, se
  veio; senão o do cadastro do nó (padrão 7200 s);
- cada coleta com hora plausível do celular `Tc` que viu `N` medições confere:
  `e = Tc − (T0 + (N−1) × I)`, folga `f = max(600 s, 5 % de (Tc − T0))`;
  fecha se `−f ≤ e ≤ I + f` (revisto em 2026-10-22; a primeira versão era
  `−(I + f) ≤ e ≤ 2I + f`);
- no ritmo, `e` fica em `[0, I)` (o botão acorda a placa antes da próxima medição). É a regra
  do briefing: "a última medição tem de cair até cerca de um intervalo antes". A deriva do
  oscilador e o tempo acordado cabem na folga proporcional. Uma medição a mais ou a menos
  **não** cabe de brinde: aceitar `±1` deixava passar como estimada uma série deslocada em
  até `2I`;
- trechos: as medições `[n_{k−1}, n_k − 1]` valem pelo veredito da coleta `k` (a primeira
  coleta plausível que as viu);
- fecha → `estimada`, motivo `contagem-conferida`; não fecha → `sem hora`, motivo
  `contagem-a-mais` (`e` abaixo da janela) ou `contagem-a-menos` (acima); nenhuma coleta
  plausível → `sem hora`, `contagem-sem-conferencia`; `T0` antes do início do projeto ou
  depois de `Tc + f` → `sem hora`, `inicio-implausivel`.

**Por que "sem conferência" fica sem hora, e não estimada:** a conferência é a única coisa
que pega uma falta de energia, que a placa não registra. Sem ela, a estimativa poderia estar
dias fora. E o caso é passageiro: só acontece quando a hora do celular é implausível, e aí a
placa não apaga o arquivo — a próxima coleta traz as mesmas medições e confere.

**Alternativa rejeitada: reescalar pelo período observado** (`(Tc − T0)/N`). Daria horas
melhores quando a placa só está mais lenta, mas esconde uma falta de energia como "relógio
lento" e contraria o que o grupo do firmware pediu. Fica como possibilidade se a medição na
bancada mostrar deriva maior que 5 %.

**O que a conta não vê (declarado; corrigido na revisão de 2026-10-22).** Uma medição fora
do ritmo (botão sem coleta completa) não soma um intervalo inteiro: a placa mede na hora da
tentativa e recomeça o temporizador dali, então a série depois dela fica deslocada em
`d = I − x`, onde `x` é quanto tempo depois da medição anterior foi a tentativa (`0 < d < I`).
Uma falta de energia desloca do mesmo jeito, para o outro lado. A conta só vê o deslocamento
que passa da **sobra natural** (`r`, o tempo entre a última medição real e a coleta, entre 0 e
`I`) **mais a folga**: medição a mais aparece se `d > r + f`. Logo, uma hora "estimada" pela
contagem pode estar errada em **até um intervalo mais a folga** — até ~2 h num arquivo curto a
2 h; até `I` + ~36 h num arquivo de 30 dias. Tentar de novo logo depois da falha (`r`
pequeno) quase sempre mostra a medição a mais; voltar só na próxima visita, quase nunca. Teste
de caracterização em `tests/hora-contagem.test.ts` ("limitação declarada"). É o preço da regra
do briefing sem hora por medição; o que resolve é o pedido 3 (não medir quando a coleta não
completa) ou a hora por medição (pedido 5). Possível melhora no app, não feita: o app
testemunha as tentativas que falharam e poderia ancorar a medição fora do ritmo nelas. Medidos
o período real e a deriva na bancada, a folga encolhe (e o tempo acordado entra no intervalo,
não na folga).

**Folga provisória.** O período real é sono + tempo acordado (no teste: 10 s de sono + 10 s
de espera do sensor de gás + 3 s + boot ≈ 24–25 s; em produção, 2 h + ~3 min se a espera de 3
min do comentário entrar). 3 min em 2 h são 2,5 %. A deriva do oscilador lento do ESP32-C6 em
sono profundo não foi medida. 5 % cobre os dois até a medição.

## D-508 — O contador bruto é o número; a VIEW multiplica pelo intervalo da faixa

`t_node` = `id` (bruto, imutável). A conta da VIEW `leitura_hora` era
`ref_t_utc_ms − (ref_t_node − t_node) × 1000`. A migração 3 acrescenta
`hora_correcao.ms_por_unidade` (NULL = 1000, o comportamento da 003) e recria a VIEW com
`COALESCE(ms_por_unidade, 1000)`. A faixa de um arquivo tem `ref_t_node = 0`,
`ref_t_utc_ms = T0 × 1000`, `ms_por_unidade = I × 1000`. Corrigir o intervalo do cadastro só
grava uma versão nova de horas (FR-019): nenhuma leitura muda.

**Rejeitado:** gravar `t_node = id × I`. Assaria o intervalo no contador bruto, e corrigir o
intervalo exigiria reescrever leitura.

## D-509 — Valor bruto em ponto flutuante, ao lado dos centésimos

`reading` ganha `temp_bruto` e `rh_bruto` (REAL): o `float32` da placa como veio (um `double`
representa um `float32` exatamente). `temp_c100`/`rh_x100` continuam sendo o que resumos,
gráfico e nuvem usam, derivados por `Math.round(valor × 100)`. A precisão de 0,01 °C está
abaixo da exatidão do AHT21 (±0,3 °C), então nada exibido muda; e o bruto continua lá para
recomputar. `NaN`/`±Inf` vira NULL nos dois, com o motivo em `flags` (bit 0 temperatura, bit 1
umidade — significado válido só para `proto_ver = 100`). eCO₂ e TVOC: `uint16` como vieram.

**Fora do escopo:** a nuvem não recebe o bruto em ponto flutuante (o esquema do servidor não
tem a coluna). Fica no celular e no arquivo bruto da sessão.

## D-510 — Identidade: MAC opcional, escolha antes da coleta

O `READY` aceita `READY:AA:BB:CC:DD:EE:FF` (também com `-`), normalizado em maiúsculas com `:`.
`node` ganha `mac` (único quando não nulo). Resolução no momento da gravação:
1. MAC de um nó conhecido → esse nó (a escolha da tela é ignorada; o resultado diz a colmeia);
2. senão, o nó da colmeia escolhida; sem nó, um nó novo com `device_id = placa-<16 hex>`;
3. MAC novo → gravado no nó da colmeia escolhida.

**Riscos aceitos, registrados na revisão de 2026-10-22** (o firmware ainda não manda MAC):
(a) a placa entra no nó que a colmeia **já tem** — se a colmeia tinha um nó de outro aparelho
(na demonstração, o nó simulado da 001), as duas séries ficam no mesmo nó, sem colidir chave
(o `seq` do cabo começa em início × 10⁶); (b) MAC novo numa colmeia cujo nó já tem **outro**
MAC substitui o MAC do nó (troca de placa), e as séries das duas placas ficam no mesmo nó.
Tratar troca de placa como época de sensor nova (Princípio VI) fica para quando o MAC chegar
(pedido 1), porque a tela da colmeia hoje mostra um nó por colmeia.

A pergunta "De qual colmeia é esta placa?" vem **antes** do toque em Coletar: depois de
`READY` a placa espera no máximo 30 s por cada linha, e uma escolha no meio da conversa
estouraria o prazo. O MAC não vai para a nuvem: o `device_id` continua o identificador.

## D-511 — Placa simulada fiel ao `.ino`

`src/transports/mock/firmware.ts` reproduz, linha por linha, o que o `teste_de_firmware.ino`
faz e imprime: diagnósticos do boot, `waitForHandshake` (ignora linha que não é `HELLO`, 30 s,
"Timeout aguardando handshake."), `readProtocolLine` (CR ignorado, 128 caracteres →
`ERROR:BAD_COMMAND`, linha vazia = falha), `FILE_INFO` com `%08lX`, envio em blocos de 256
bytes, `RECEIVED` com a semântica de `strtoul`, `receiveNextTimestamp` (só dígitos,
`ERROR:TIMESTAMP_TIMEOUT`), a troca do arquivo com cada `ERROR:*` injetável, a medição depois
do protocolo (com sucesso **ou** falha), o primeiro boot sem conversa, a falta de energia (sem
registro do buraco). Os prazos são parâmetros: os testes usam centenas de milissegundos, a
demonstração usa os 30 s reais. A placa simulada fala pela mesma `EntradaDeBytes` do cabo
real, partindo o fluxo em pedaços arbitrários — então o leitor de bytes é exercitado de ponta
a ponta.

## D-512 — A porta que some e reaparece

No ESP32-C6 a USB é nativa: a porta some quando a placa dorme e reaparece quando ela acorda.
O navegador só mostra a lista de portas a partir de um toque, e só lista o que está ligado
naquele instante. **Decisão:**
- primeira vez: o toque em Coletar abre a lista do navegador; a pessoa aperta o botão da placa
  e ela aparece na lista (o Chrome atualiza a lista ao vivo);
- vezes seguintes: `getPorts()` devolve a placa já autorizada se estiver acordada; senão o app
  espera o evento `connect` dela (até 60 s, com o texto "Aperte o botão da placa agora");
- a contagem de 30 s recomeça quando o app vê a porta aparecer (o instante mais próximo do
  botão que dá para saber); sem isso, conta do toque em Coletar.

**Risco a verificar com a placa:** abrir a porta pode reiniciar o chip conforme os sinais
DTR/RTS; aí a causa do despertar deixa de ser GPIO e o protocolo não roda. O app não mexe nos
sinais (mexer poderia justamente provocar o reinício). Se acontecer, a placa imprime
"Wake-up causado motivo desconhecido." — o app guarda isso no registro da sessão.

## D-513 — Placa nova (primeiro boot)

Sem arquivo, a placa espera **para sempre** uma linha (`readStringUntil('\n')`), sem
conversa, e converte com `strtoull` sem validar. A tela "Configurar placa nova" manda
`<segundos>\n` só com a hora do celular plausível. A confirmação vem só por **diagnóstico**
("Timestamp inicial salvo com sucesso!"), que não é contrato: a tela diz "a placa confirmou"
quando vê essa linha, e "enviei, mas não deu para confirmar" quando não vê — nunca afirma
sucesso sem ela. Ver "Aguardando handshake USB…" ou "Wake-up causado…" diz que a placa já
estava configurada.

Na coleta normal, uma placa nova toma o `HELLO` como hora inicial (`strtoull("HELLO") = 0`).
O app para de mandar `HELLO` se vir "Aguardando timestamp inicial…" ou "Timestamp inicial
recebido:" e indica Configurar placa nova (ou, se ela já tomou o `HELLO`, coletar de novo).

## D-514 — Cada `ERROR:*` e o que se sabe do arquivo da placa

A regra que organiza tudo: **a placa só apaga o arquivo depois de receber a hora**. Antes de
mandarmos a hora, qualquer fim deixa o arquivo lá. Depois:

| Fim depois de mandar a hora | Arquivo da placa |
|---|---|
| `SESSION_COMPLETE` | apagado (recomeçou com a nossa hora) |
| `ERROR:BACKUP_CLEANUP_FAILED` | apagado (o novo foi instalado; sobrou o backup) |
| `ERROR:FILE_RESTORE_FAILED` | **perdido** (foi para o backup e não voltou); a placa volta ao primeiro boot |
| `ERROR:INVALID_TIMESTAMP`, `TIMESTAMP_TIMEOUT`, `TIMESTAMP_EMPTY`, `REMOVE_TEMP_FAILED`, `TEMP_OPEN_FAILED`, `TEMP_WRITE_FAILED`, `TEMP_VERIFY_OPEN_FAILED`, `TEMP_VERIFY_FAILED`, `REMOVE_BACKUP_FAILED`, `OLD_FILE_RENAME_FAILED`, `NEW_FILE_RENAME_FAILED` | continua lá |
| prazo, cabo, outro `ERROR:` | não dá para saber |

`ERROR:TIMESTAMP_EMPTY` está no código e não no documento (o documento diz que linha vazia dá
`TIMESTAMP_TIMEOUT`, e o código de fato chega lá antes).

## D-515 — Android fica fora, com o caminho registrado

No app instalado não há Web Serial. Coletar pelo cabo no Android exige um módulo nativo de
USB-serial (USB host, permissão USB do sistema) e um build próprio — não roda no Expo Go.
Fora do código desta feature; a tela explica e a Matriz de Capacidades registra.

## D-516 — `proto_ver = 100` para `arquivo-0`

`reading.proto_ver` é `NOT NULL` e a constituição pede versão de protocolo em toda carga. O
arquivo não traz versão; a escolha do leitor é nossa (como o `bancada-0` da 004). `1` é o
formato provisório nosso; `100` passa a ser "`arquivo-0`, firmware de 2026-10-21". O próximo
formato do firmware será `101`.

## D-517 — Sem status do sensor de gás

O arquivo não traz o status do ENS160. Pela regra da 001, voláteis só entram na média com
status 0; com status NULL, ficam de fora (as leituras contam como válidas para temperatura e
umidade). É o lado honesto: no teste a placa espera só 10 s pelo sensor de gás, que pode levar
até 1 h na primeira partida. Pedido 5 ao firmware.

## D-518 — O código que a migração 2 chama não pode depender da migração 3

`migrarHora003` (versão 2, já publicada) chama `reavaliarTodos`, que é código vivo de
`data/hora.ts`. Num banco da 002 abrindo esta versão, a migração 2 roda **antes** de a 3
criar `ms_por_unidade` e `intervalo_medicao_s`. Então: a coluna `ms_por_unidade` só entra no
`INSERT` quando alguma faixa a usa (só faixas de contagem, que não existem antes da 3); a
leitura das faixas da última versão é `SELECT *`; e o intervalo do nó só é lido quando há
leitura ou referência de contagem. Teste: banco da 002 → versão 3 (`tests/migracao.test.ts`).

## D-519 — Colisão de chave: contada, avisada, guardada no bruto (2026-10-22)

`seq = início × 1.000.000 + número` só é único enquanto dois arquivos do mesmo nó não têm a
mesma hora de início. Isso acontece de verdade num caso: placa nova que tomou o `HELLO` como
data inicial (`strtoull("HELLO") = 0`), duas vezes na mesma colmeia (placa regravada, ou outra
placa escolhida para a mesma colmeia). O `INSERT OR IGNORE` engoliria a segunda calado — perda
silenciosa, o defeito crítico do Princípio III.

Decisão: antes de gravar, a transação compara cada leitura do arquivo com a já gravada de
mesma chave (`t_node`, brutos, voláteis, `flags`). Igual = reimportação, sem efeito. Diferente
= colisão: a gravada **não muda** (append-only), a nova não entra na série, e fica no arquivo
bruto da sessão (gravado na mesma transação), com uma linha no registro; o resultado conta
(`InfoDoCabo.conflitos`) e a tela avisa. A coleta segue e a placa é confirmada: o bruto já está
durável, e recusar a confirmação deixaria a placa presa no arquivo de data 0 para sempre.

Alternativa rejeitada: um `seq` que mude por sessão quando o início é implausível — deixaria de
ser determinístico, e a reimportação do mesmo arquivo duplicaria.

## D-520 — `arquivo-1`: o MAC no arquivo, e a hora pela posição (2026-10-28)

O firmware `4cc7ed8` (2026-10-28) põe na frente do arquivo o MAC da placa, como texto de 17
caracteres mais `0x00`, antes da hora de início: cabeçalho de 26 bytes. Atende o pedido 1
(identidade da placa) por outro caminho: o `READY` continua sem MAC. Contrato em
`contracts/arquivo-1.md`.

O mesmo commit tem um defeito que o próprio grupo do firmware registrou (§7.2 do protocolo):
`getNextMeasurementId` ainda trata 8 bytes como "arquivo sem medições". Num arquivo novo de
26 bytes, o número da primeira medição sai da metade alta da hora de início (0) mais 1. A
numeração fica 1, 2, 3…, quando a conta da hora pede 0, 1, 2…

Decisão:

- leitor novo `arquivo-1` (`proto_ver = 101`) na tabela, e `FORMATO_DE_ARQUIVO_ATUAL` passa a
  ser ele. O `arquivo-0` fica, para reler o bruto de sessões antigas. Sem tentativa: a placa
  com o firmware antigo é recusada inteira pelo tamanho (8 + 16n nunca é 26 + 16n), sem
  gravar e sem confirmar, e o bruto fica guardado;
- a chave e a contagem saem da **posição** `k` no arquivo: `seq = início × 1e6 + k`,
  `t_node = k`. A placa grava uma medição por despertar, em ordem, e é a posição que a conta
  `início + k × intervalo` pede. Com a numeração de hoje (de 1) ou a corrigida (de 0), o mesmo
  arquivo dá as mesmas chaves, e a correção do firmware não muda nada no app;
- a numeração continua conferida: começa em 0 ou 1 e cresce de 1 em 1. É o que pega um
  formato mudado cujo tamanho fecha por acaso, e o 0 no meio quando `getNextMeasurementId`
  não abre o arquivo;
- o MAC do arquivo identifica a placa (`node.mac`) e vale mais que o `READY:<MAC>`;
- quando a numeração começa em 1, o registro da sessão diz isso, para quem auditar o bruto.

Alternativas rejeitadas: usar o número gravado (toda hora ficaria um intervalo adiantada,
duas horas em produção, sem nenhum sinal na tela); recusar a numeração de 1 até o firmware
corrigir (nenhuma coleta com a placa atual, e o teste físico fica impossível); detectar o
formato pelo conteúdo (o Princípio IV pede a escolha explícita do leitor).


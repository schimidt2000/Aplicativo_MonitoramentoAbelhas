# Feature Specification: Coleta real pelo cabo, com o protocolo do firmware

**Feature Branch**: `feat/005-coleta-pelo-cabo`

**Created**: 2026-10-21

**Status**: Draft

**Input**: User description: "Coleta real pelo cabo com o protocolo do firmware. O grupo do
firmware publicou o protocolo (repositório `beehive-monitoring-firmware`, commit `e93f8ad`,
2026-10-21) e mandou três áudios: a placa grava um arquivo com a hora de início e as medições
numeradas; o app pede o arquivo, confere tamanho e CRC, confirma, e manda a hora atual para a
placa recomeçar o arquivo. O app calcula a hora de cada medição."

## Clarifications

### Session 2026-10-22 (revisão da janela da conferência)

- Q: Quanto a conta "início + número × intervalo" pode errar e ainda fechar? → A: Exatamente
  o que o briefing de 2026-10-21 decidiu: a última medição tem de cair **até cerca de um
  intervalo antes** da coleta (FR-017). A primeira versão desta spec aceitava, de brinde, uma
  medição a mais ou a menos (janela de três intervalos); isso deixava passar como "estimada"
  uma série deslocada em até dois intervalos (4 h) sem que nada na conta mostrasse. A janela
  volta a ser a do briefing, com a folga provisória de 10 min ou 5 %. **Consequência
  aceita e registrada:** tentar a coleta, falhar e tentar de novo logo em seguida deixa uma
  medição fora do ritmo na placa; num arquivo curto (folga menor que um intervalo) esse
  arquivo quase sempre fica sem hora. A correção é na placa (pedido 3 ao firmware: não medir quando o
  botão acorda a placa e a coleta não completa), não no app. **Limite da conferência
  (revisão de 2026-10-22):** a medição fora do ritmo desloca a série em menos de um intervalo,
  e a conta só vê o deslocamento que passa do tempo entre a última medição e a coleta mais a
  folga; uma hora "estimada" pela contagem pode estar errada em até um intervalo mais a
  folga (research D-507).

### Session 2026-10-21 (decisões do dono do produto, João, sobre o briefing do firmware)

- Q: Como o app sabe de qual colmeia é a placa? → A: Pelo MAC da placa, único de fábrica,
  quando o firmware mandar (`READY:AA:BB:CC:DD:EE:FF`, aceito desde já sem quebrar o `READY`
  atual). Enquanto não manda, o apicultor escolhe "De qual colmeia é esta placa?", com a última
  escolha já marcada (FR-020 a FR-023).
- Q: A hora de cada medição sai de onde? → A: Como o grupo do firmware pediu: hora de início
  do arquivo + número da medição × intervalo, **sempre com o selo "estimada"**, e conferida
  contra a hora do fim da coleta. Quando a conta não fecha, a hora fica em branco, com motivo
  (FR-012 a FR-018). Isso **emenda** a FR-016 da feature 003 (ver
  `specs/003-hora-das-leituras/spec.md`, Clarifications).
- Q: E o intervalo, se o protocolo não manda? → A: Guardado por nó no cadastro, padrão
  7200 s (2 h), editável. Se o firmware acrescentar um terceiro campo em `FILE_INFO`
  (`FILE_INFO:<tam>:<crc>:<intervalo_s>`), ele vale para aquela coleta (FR-016).
- Q: Quando o app confirma o recebimento? → A: Só depois de gravar no celular de forma
  durável, porque a placa apaga o arquivo depois. O arquivo bruto inteiro fica guardado
  (FR-006, FR-007).
- Q: E se a hora do celular estiver errada? → A: O app não manda a hora. A placa acusa
  `ERROR:TIMESTAMP_TIMEOUT` e **não apaga** o arquivo; a próxima coleta traz tudo de novo, e
  reimportar não duplica nada. A tela explica isso (FR-010, FR-030).
- Q: Segundos ou milissegundos? → A: Segundos Unix. No áudio 2 o firmware disse
  "milissegundos", mas o documento e o código dizem segundos; a divergência fica registrada em
  `docs/integracao-firmware.md` e vai como pedido de confirmação (FR-009).
- Q: E o Android? → A: Coleta pelo cabo no Android exige módulo nativo de USB e um build
  próprio (não roda no Expo Go). Fica **fora** do código desta feature; o primeiro alvo é o app
  de campo no navegador do computador (Chrome ou Edge). Onde não há cabo, a tela explica o
  caminho (FR-032).
- Q: O "armazenamento" é outro grupo? → A: Sim, é um terceiro grupo (confirmado por João em
  2026-10-21). O formato do arquivo depende dele e vai mudar: vai entrar a identificação da
  placa. Fica registrado como dependência.

## Contexto

Até aqui o app coletava de nós sensores simulados (feature 001) e só **mostrava** a placa
real pelo cabo, sem gravar nada (feature 004), porque o que a placa imprimia não tinha
identificador nem número de leitura. O firmware de 2026-10-21 mudou isso: a placa acumula as
medições num arquivo e entrega esse arquivo pelo cabo USB, numa conversa de perguntas e
respostas. Esta feature faz o app **coletar de verdade** desse arquivo.

Três fatos do firmware moldam tudo (conferidos no código, `teste_de_firmware.ino`):

1. **A placa apaga o arquivo** depois de receber a hora do celular. Se o app confirmar o
   recebimento antes de guardar as leituras de forma durável, uma queda de energia do
   computador entre os dois passos perde as leituras para sempre.
2. **A placa não guarda hora por medição.** Guarda só a hora de início do arquivo e numera as
   medições a partir de 0. A numeração **recomeça do zero a cada coleta**, então o número
   sozinho não identifica uma leitura entre coletas.
3. **A placa mede fora do ritmo** quando o botão a acorda e a coleta não se completa, e não
   registra o tempo em que ficou sem energia. A conta "início + número × intervalo" pode não
   fechar — e quando não fecha o app não pode fingir que fecha.

## User Scenarios & Testing *(mandatory)*

### User Story 1 - Coletar a placa pelo cabo sem perder nada (Priority: P1)

O apicultor (ou a pesquisadora, no laboratório) liga a placa no computador com o cabo,
aperta o botão da placa e toca em Coletar. O app conversa com a placa, recebe o arquivo,
confere que chegou inteiro, guarda as leituras no celular e só então confirma para a placa,
que apaga o arquivo e recomeça a medir.

**Why this priority**: É a primeira vez que leitura de placa real entra no banco. Perder a
coleta é perder uma viagem a campo; duplicar é corromper a série.

**Independent Test**: Com a placa simulada (fiel ao `teste_de_firmware.ino`), coletar um
arquivo de 3 dias; coletar de novo o mesmo arquivo; coletar um arquivo maior que contém o
primeiro. Conferir as contagens no banco a cada passo.

**Acceptance Scenarios**:

1. **Given** uma placa com 36 medições, **When** o apicultor coleta, **Then** as 36 leituras
   ficam gravadas no celular, a placa recebe a confirmação **depois** da gravação durável e a
   tela diz "36 leituras salvas".
2. **Given** um arquivo já coletado, **When** a mesma placa manda o mesmo arquivo de novo,
   **Then** nenhuma leitura nova é gravada e nenhuma existente muda.
3. **Given** uma placa que não apagou o arquivo (a hora não foi enviada) e continuou medindo,
   **When** ela manda o arquivo maior, **Then** só as medições novas entram, e as antigas
   continuam idênticas, campo a campo.
4. **Given** a gravação no celular falhou, **When** o app termina, **Then** ele **não**
   confirma para a placa (que continua com o arquivo) e a tela diz que nada foi apagado da
   placa.

---

### User Story 2 - Hora estimada só quando a conta fecha (Priority: P1)

A pesquisadora recebe cada leitura da placa com a hora calculada pelo início do arquivo e
pelo número da medição, marcada como **estimada**. Quando o número de medições não bate com o
tempo que passou entre o início do arquivo e a coleta, as leituras daquele arquivo ficam
**sem hora conhecida**, contadas e com o motivo — nunca com uma hora errada.

**Why this priority**: É a única fonte de hora das leituras da placa. Uma hora errada que
parece certa entra na análise sem levantar suspeita (contexto da feature 003).

**Independent Test**: Arquivos simulados (a) no ritmo, (b) com uma falta de energia de um
dia no meio, (c) com várias medições a mais por botão apertado sem coleta, (d) coletados com
a hora do computador errada. Conferir qualidade e motivo de cada leitura.

**Acceptance Scenarios**:

1. **Given** um arquivo no ritmo do intervalo, **When** é coletado, **Then** cada leitura
   tem hora = início + número × intervalo, com qualidade "estimada".
2. **Given** um arquivo com menos medições do que o tempo permite (falta de energia),
   **When** é coletado, **Then** as leituras desse arquivo ficam sem hora, com o motivo
   "medições a menos que o tempo".
3. **Given** um arquivo com mais medições do que o tempo permite, **When** é coletado,
   **Then** as leituras ficam sem hora, com o motivo "medições a mais que o tempo".
4. **Given** a hora do computador implausível na coleta, **When** a coleta termina, **Then**
   as leituras ficam sem hora ("sem conferência"), a hora não é enviada à placa, e a próxima
   coleta com a hora certa confere e dá a hora estimada às mesmas leituras, sem regravá-las.
5. **Given** o intervalo do cadastro estava errado, **When** o apicultor o corrige, **Then**
   as horas são recalculadas por correção à parte, sem alterar nenhuma leitura gravada.

---

### User Story 3 - Toda falha diz o que aconteceu com a placa e o que fazer (Priority: P1)

O cabo sai no meio, a placa volta a dormir antes do toque em Coletar, o arquivo chega com
defeito, a placa responde um erro. Em todos os casos a tela diz, em palavras simples, o que
ficou salvo no celular, se a placa ainda tem as leituras, e o que fazer em seguida.

**Why this priority**: A placa só fica acordada 30 segundos; o caminho de falha é o caso
comum, não o raro.

**Independent Test**: A placa simulada reproduz cada `ERROR:*` documentado, cada prazo
esgotado, o cabo puxado no meio e o CRC errado. Conferir o texto e o estado da placa em cada
um.

**Acceptance Scenarios**:

1. **Given** o cabo sai no meio do arquivo, **When** a coleta para, **Then** nada é gravado,
   a tela diz que a placa continua com as leituras e pede para apertar o botão e coletar de
   novo.
2. **Given** o arquivo chega com o CRC diferente do anunciado, **When** o app confere,
   **Then** nada é gravado, o app avisa a placa da divergência, e a tela pede para tentar de
   novo.
3. **Given** a placa voltou a dormir antes da conversa, **When** o prazo acaba, **Then** a
   tela diz para apertar o botão da placa e tocar em Coletar em até 30 segundos.
4. **Given** a placa respondeu um erro depois de o celular ter gravado, **When** a coleta
   termina, **Then** a tela diz que as leituras estão salvas no celular e o que aconteceu com o
   arquivo da placa (continua lá, foi apagado, ou não deu para saber).

---

### User Story 4 - De qual colmeia é esta placa? (Priority: P2)

Enquanto a placa não informa a própria identificação, o apicultor escolhe a colmeia numa
lista antes de coletar, com a última escolha já marcada. Quando a placa passar a mandar o
MAC, a colmeia sai sozinha.

**Why this priority**: Sem isso não há como gravar (a leitura precisa de um nó), mas a
escolha é um toque.

**Independent Test**: Coletar com e sem MAC no `READY`; conferir a colmeia das leituras e a
pré-seleção na coleta seguinte.

**Acceptance Scenarios**:

1. **Given** a placa não manda MAC, **When** o apicultor abre a tela, **Then** ela pergunta
   "De qual colmeia é esta placa?" com a última escolha marcada.
2. **Given** a placa manda um MAC já ligado a uma colmeia, **When** a coleta termina,
   **Then** as leituras vão para aquela colmeia, e a tela diz qual, mesmo que outra estivesse
   escolhida.
3. **Given** a placa manda um MAC novo, **When** a coleta termina, **Then** o MAC fica ligado
   à colmeia escolhida.

---

### User Story 5 - Configurar placa nova (Priority: P2)

Uma placa que acabou de receber o programa espera a hora inicial pela serial, sem conversa.
A tela "Configurar placa nova" manda a hora do computador, só se ela for plausível, e diz se
a placa confirmou.

**Why this priority**: Sem a hora inicial a placa não começa a medir; com uma hora errada,
todo o primeiro arquivo fica sem hora.

**Independent Test**: Placa simulada em primeiro boot; conferir o arquivo criado com a hora
enviada.

**Acceptance Scenarios**:

1. **Given** uma placa nova esperando a hora, **When** a pessoa toca em Enviar a hora,
   **Then** o app manda os segundos Unix e diz que a placa confirmou.
2. **Given** a hora do computador implausível, **When** a pessoa abre a tela, **Then** o
   botão não envia nada e a tela diz para acertar a data e a hora primeiro.
3. **Given** uma placa que já estava configurada, **When** a pessoa tenta configurar,
   **Then** a tela diz que esta placa já mede e que a coleta é pela tela de coleta pelo cabo.

---

### User Story 6 - Ver funcionando sem a placa, e saber o caminho onde não há cabo (Priority: P3)

Na demonstração (aula, laboratório sem placa), a tela funciona com a placa simulada, com o
rótulo "placa simulada" sempre visível. No app instalado no Android, no Safari, no Firefox
e no navegador de celular, a tela explica por que não dá e qual é o caminho.

**Why this priority**: A placa é uma só e fica com o grupo do firmware; a demonstração não
pode depender dela. E botão que não faz nada é proibido (Princípio IV).

**Independent Test**: Abrir a tela em cada ambiente da Matriz de Capacidades.

**Acceptance Scenarios**:

1. **Given** o app em modo de demonstração, **When** a pessoa escolhe a placa simulada,
   **Then** a coleta completa funciona, com o rótulo de simulação na tela.
2. **Given** um navegador sem porta serial, **When** a pessoa abre a tela, **Then** ela diz
   qual navegador e qual aparelho usar, sem botão de coletar inerte.

---

### Edge Cases

- **Arquivo só com a hora de início** (8 bytes, nenhuma medição): coleta válida, "nenhuma
  leitura nova", e a placa recomeça normalmente.
- **Linhas de diagnóstico no meio da conversa** ("Handshake estabelecido!", "Timestamp
  recebido: …", "LittleFS iniciado…"): ignoradas. Entre `FILE_INFO` e o fim do arquivo não há
  texto, e qualquer byte é conteúdo do arquivo.
- **`FILE_INFO` e o começo do arquivo no mesmo pedaço** de bytes: o app não pode perder nem
  reinterpretar nenhum byte entre a linha e o binário.
- **Tamanho que não é 8 + múltiplo de 16**, ou numeração que não começa em 0 e não cresce de
  1 em 1: formato não reconhecido. Nada é gravado, o bruto é guardado, a placa não recebe
  confirmação e continua com o arquivo.
- **A porta some quando a placa dorme** e reaparece quando ela acorda. Abrir a porta pode
  reiniciar a placa (a verificar com a placa, `docs/integracao-firmware.md`).
- **Dois `HELLO` seguidos**: se a placa já tinha respondido `READY`, o segundo vira
  `ERROR:BAD_COMMAND` e ela desiste. O app reenvia `HELLO` com espaçamento, e esse erro
  pede para apertar o botão de novo.
- **Placa nova recebendo `HELLO`**: no primeiro boot a placa toma qualquer linha como hora
  inicial, e `HELLO` vira a data 0 (1970). As leituras desse primeiro arquivo ficam sem hora
  (início implausível) até a coleta seguinte mandar a hora certa.
- **Placa com o arquivo perdido** (`ERROR:FILE_RESTORE_FAILED`): as leituras já estão no
  celular; a placa volta ao primeiro boot e precisa de Configurar placa nova.
- **Duas placas escolhidas para a mesma colmeia por engano**: as chaves não colidem (o
  início de cada arquivo é diferente), mas as séries se misturam. Fica registrado como risco
  até o MAC chegar.
- **Duas placas novas que tomaram o `HELLO` como data 0 na mesma colmeia**: os dois arquivos
  têm o mesmo início, e as chaves colidem. A primeira série fica como estava; as leituras da
  segunda que colidem ficam fora da série, guardadas no bruto, contadas e avisadas (FR-014).
- **Hora do início no futuro** em relação à coleta: início implausível, sem hora.
- **Coleta que falha e é tentada de novo logo em seguida**: a placa mediu uma vez fora do
  ritmo na tentativa que falhou. Se a folga do arquivo for menor que um intervalo (arquivo
  de menos de ~40 h a 2 h), a conta quase sempre não fecha e o arquivo fica sem hora,
  "medições a mais" (FR-017, pedido 3 ao firmware). Não fecha quando o deslocamento passa da
  folga mais os minutos entre a tentativa e a nova coleta; se a tentativa foi pouco antes da
  medição seguinte da placa, o deslocamento é pequeno e as horas ficam estimadas com esse
  erro. Se a nova coleta só acontece horas depois, a conta em geral fecha e as horas ficam
  estimadas com erro de até um intervalo (research D-507).

## Requirements *(mandatory)*

### Functional Requirements

**Conversa com a placa** (protocolo de `COMMUNICATION_PROTOCOL.md`, commit `e93f8ad`)

- **FR-001**: O app MUST conduzir a conversa `HELLO` → `READY` → `GET_FILE` → `FILE_INFO` →
  arquivo binário → `RECEIVED:<tamanho>:<crc>` → `TRANSFER_OK` → `REQUEST_TIMESTAMP` →
  segundos Unix → `SESSION_COMPLETE`, com mensagens terminadas em LF, a 115200 baud, 8N1.
- **FR-002**: O app MUST ignorar toda linha que não seja mensagem de protocolo, e MUST NOT
  interpretar como texto nenhum byte entre o fim da linha `FILE_INFO` e o último byte
  anunciado.
- **FR-003**: O app MUST aceitar `READY` com ou sem MAC (`READY:AA:BB:CC:DD:EE:FF`) e
  `FILE_INFO` com ou sem o intervalo (`FILE_INFO:<tam>:<crc>:<intervalo_s>`). Uma linha de
  protocolo fora dessas formas MUST encerrar a coleta sem gravar nada, como protocolo
  desconhecido.
- **FR-004**: O app MUST ler exatamente o número de bytes anunciado e calcular o
  CRC-32/ISO-HDLC sobre eles. CRC diferente do anunciado MUST resultar em nada gravado e no
  envio de `ERROR:CHECKSUM_MISMATCH` à placa.
- **FR-005**: O app MUST tratar cada `ERROR:*` documentado e cada prazo esgotado, dizendo em
  pt-BR o que aconteceu e o que fazer. Prazos: até 30 s pelo `READY` desde o começo
  (reenviando `HELLO` a cada 4 s), 10 s para cada resposta de linha, 5 s sem nenhum byte no
  meio do arquivo.

**Gravar antes de confirmar**

- **FR-006**: O app MUST gravar as leituras, o arquivo bruto e a referência de hora numa
  única transação e torná-los duráveis (no navegador, gravados no armazenamento do
  navegador) **antes** de enviar `RECEIVED`. Sem essa confirmação de durabilidade, MUST NOT
  enviar `RECEIVED`.
- **FR-007**: O arquivo bruto de cada sessão MUST ser guardado inteiro, com tamanho, CRC,
  formato, o registro da conversa e o desfecho — inclusive quando o formato não é reconhecido
  ou a transferência caiu (o que chegou).
- **FR-008**: Se a gravação falhar ou o formato não for reconhecido, o app MUST NOT enviar
  `RECEIVED` nem a hora; a placa fica com o arquivo.
- **FR-009**: Depois de `REQUEST_TIMESTAMP`, o app MUST enviar a hora do celular em
  segundos Unix (UTC), só dígitos, se ela for plausível (`core/relogio.ts`).
- **FR-010**: Se a hora do celular for implausível, o app MUST NOT enviar a hora, e a tela
  MUST explicar que a placa continua com as leituras e que a próxima coleta as traz de novo
  sem duplicar.
- **FR-011**: O app MUST dizer, ao fim de toda coleta, o que sabe do arquivo da placa:
  "continua lá", "foi apagado", "a placa perdeu o arquivo" ou "não deu para saber". A placa
  só pode ter apagado se o app mandou a hora.

**Leitura do arquivo e chave**

- **FR-012**: O arquivo MUST ser lido por um leitor versionado (`arquivo-0`): 8 bytes de
  hora de início (inteiro sem sinal de 64 bits, little-endian, segundos) + N registros de 16
  bytes (temperatura e umidade em ponto flutuante de 32 bits, eCO₂ e TVOC em inteiros de 16
  bits, número da medição em inteiro de 32 bits). O leitor MUST validar que o tamanho menos 8
  é múltiplo de 16 e que a numeração começa em 0 e cresce de 1 em 1, e MUST recusar o arquivo
  inteiro se não for — nunca adivinhar.
- **FR-013**: Os valores MUST ser guardados brutos: o número em ponto flutuante como veio, ao
  lado da forma em centésimos que os resumos usam. Valor que não é número MUST ser NULL com
  motivo.
- **FR-014**: A chave de cada leitura MUST ser `(nó, número da leitura)`, com o número da
  leitura derivado de forma determinística de (hora de início do arquivo, número da medição):
  `início × 1.000.000 + número`. Reimportar o mesmo arquivo, ou um arquivo maior que contém o
  anterior, MUST ser sem efeito para o que já existia.
  Uma leitura com a chave de outra já gravada e **conteúdo diferente** não é reimportação, é
  colisão: MUST NOT ser descartada calada. A gravada não muda; a nova fica no arquivo bruto da
  sessão, é contada e a tela avisa (D-519).

**Hora de cada leitura** (emenda da FR-016 da 003)

- **FR-015**: A hora de cada leitura MUST ser calculada como início do arquivo + número da
  medição × intervalo, e MUST levar sempre a qualidade **estimada** quando calculada.
- **FR-016**: O intervalo MUST ser o que a placa informou em `FILE_INFO` naquela coleta, se
  informou; senão, o do cadastro do nó (padrão 7200 s), editável pelo apicultor.
- **FR-017**: Toda coleta MUST conferir a conta contra a hora do fim da coleta: com N
  medições, a última (início + (N−1) × intervalo) MUST cair **entre a hora da coleta e um
  intervalo antes dela**, com uma folga, para os dois lados, de 10 min ou 5 % do tempo
  decorrido desde o início do arquivo, o que for maior. Fora dessa janela a conta não fecha:
  abaixo dela, medições a mais; acima, medições a menos. A folga cobre o tempo acordado de
  cada ciclo e a deriva do oscilador, e é provisória até a medição na bancada.
- **FR-018**: A leitura MUST ficar **sem hora conhecida**, com motivo, quando: a hora de
  início é anterior ao início do projeto ou posterior à coleta (`inicio-implausivel`);
  nenhuma coleta com hora plausível a conferiu (`contagem-sem-conferencia`); a conta não
  fechou por medições a mais (`contagem-a-mais`) ou a menos (`contagem-a-menos`). Com várias
  coletas do mesmo arquivo, cada trecho de medições vale pela primeira coleta plausível que o
  viu.
- **FR-019**: Mudar o intervalo do cadastro MUST recalcular as horas por correção à parte
  (versão de horas da 003), sem alterar leitura gravada.

**Identidade da placa**

- **FR-020**: Enquanto o firmware não mandar MAC, o app MUST perguntar "De qual colmeia é
  esta placa?" antes da coleta, com a última escolha marcada, sem digitação.
- **FR-021**: Com MAC no `READY` já ligado a um nó, as leituras MUST ir para esse nó,
  prevalecendo sobre a escolha, e a tela MUST dizer de qual colmeia é.
- **FR-022**: Com MAC novo, o app MUST ligá-lo ao nó da colmeia escolhida.
- **FR-023**: O MAC MUST NOT virar o identificador enviado à nuvem (`NodeInfo.deviceId` da
  001 continua sem MAC).

**Placa nova**

- **FR-024**: A tela "Configurar placa nova" MUST mandar a hora do computador em segundos
  Unix, terminada em LF, só se ela for plausível, e MUST dizer se a placa confirmou, se não
  deu para confirmar, ou se a placa já estava configurada.
- **FR-025**: Na coleta normal, se a placa mostrar que está esperando a hora inicial, o app
  MUST parar de mandar `HELLO` e indicar Configurar placa nova.

**Tela de coleta pelo cabo** (app de campo no navegador)

- **FR-026**: A tela MUST mostrar o passo a passo "Ligue o cabo", "Aperte o botão da placa",
  "Toque em Coletar", com a contagem dos 30 s que a placa fica acordada.
- **FR-027**: A tela MUST mostrar o progresso em bytes e em leituras durante o arquivo, e
  "Salvando no celular" durante a gravação.
- **FR-028**: O resultado MUST usar os mesmos avisos e a mesma manchete da coleta existente
  (`core/coleta/mensagens.ts`), acrescidos do que é próprio da placa (FR-011, FR-030).
- **FR-029**: Alvos de toque ≥ 56 dp, corpo ≥ 16 sp, contraste ≥ 7:1 no texto primário,
  status por cor + ícone + palavra, ação primária no terço inferior, todo texto pelo módulo de
  i18n, vocabulário do glossário.
- **FR-030**: Quando a conta da hora não fechar, o resultado MUST dizer quantas leituras
  ficaram sem hora e sugerir conferir o intervalo da placa no cadastro.
- **FR-031**: Toda coleta MUST dar retorno por texto e por som ou vibração.
- **FR-032**: Onde não há porta serial (app instalado no Android ou iOS, Safari, Firefox,
  navegador de celular, endereço não seguro), a tela MUST explicar o caminho e MUST NOT
  mostrar botão de coletar inerte.
- **FR-033**: No modo de demonstração, a tela MUST oferecer a placa simulada, com rótulo de
  simulação sempre visível.

**Simulador**

- **FR-034**: MUST existir uma placa simulada fiel ao `teste_de_firmware.ino` (mensagens de
  diagnóstico, cada `ERROR:*`, prazos de 30 s, primeiro boot, medição ao acordar pelo botão,
  falta de energia, arquivo sem medições, CRC errado, cabo puxado), base dos testes e da
  demonstração.

### Key Entities

- **Arquivo da placa**: hora de início + medições numeradas. Recomeça a cada coleta
  completa. Formato `arquivo-0`.
- **Sessão de coleta pelo cabo**: a conversa com a placa, com o arquivo bruto, o CRC, o
  registro das mensagens, o desfecho e o que se sabe do arquivo da placa.
- **Leitura**: chave `(nó, início × 1.000.000 + número)`; contador bruto = número da medição;
  valores brutos em ponto flutuante e em centésimos.
- **Referência de hora da coleta**: a hora do celular quando o arquivo chegou, com o número
  de medições daquele arquivo. É o que confere a conta.
- **Conferência da contagem**: medições recebidas × medições que o tempo permite, e o
  veredito.
- **Placa (identidade)**: MAC, quando vier; senão, a escolha do apicultor.

## Success Criteria *(mandatory)*

### Measurable Outcomes

- **SC-001**: Em 100 % dos caminhos testados, `RECEIVED` só é enviado depois da gravação
  durável; numa falha de gravação, a placa termina com o arquivo intacto.
- **SC-002**: Reimportar o mesmo arquivo, e um arquivo maior que o contém, deixa a contagem e
  o conteúdo das leituras existentes idênticos, campo a campo.
- **SC-003**: Zero leituras com hora estimada nos arquivos simulados com falta de energia ou
  com medições a mais além da folga.
- **SC-004**: Cada um dos `ERROR:*` documentados, cada prazo e o cabo puxado produzem uma
  mensagem em pt-BR com o que fazer, sem código cru.
- **SC-005**: Do toque em Coletar ao fim, uma coleta de 7 dias a 2 h (85 medições, 1.368
  bytes) cabe folgada nos 30 s de cada espera da placa.
- **SC-006**: Três pessoas sem instrução prévia completam a coleta pela tela, com a placa
  simulada, na primeira tentativa.

## Assumptions

- **Confirmado pelo repositório do firmware** (commit `e93f8ad`, 2026-10-21) e pelos áudios:
  a conversa, o CRC, o formato do arquivo, os erros, os prazos de 30 s, o primeiro boot.
  Tudo registrado em `docs/integracao-firmware.md` com data e fonte.
- **Não confirmado**: que abrir a porta não reinicia a placa (DTR/RTS); que a porta reaparece
  com o mesmo nome ao acordar; o tempo real acordado da placa em produção (o período real é
  sono + tempo acordado); a deriva do oscilador em sono profundo. A folga de 5 % é
  provisória até medir com a placa.
- **O formato vai mudar** quando o grupo de armazenamento acrescentar a identificação da
  placa. O leitor `arquivo-0` fica como está e um leitor novo entra na tabela.
- **Sem status do sensor de gás por medição**: os voláteis dessas leituras ficam fora das
  médias de voláteis (regra da 001: só entra status 0), até o firmware mandar o status
  (pedido 5).
- **Fora do escopo**: coleta pelo cabo no app instalado no Android (módulo nativo USB, build
  próprio); mudar o firmware; enviar o valor bruto em ponto flutuante para a nuvem (a nuvem
  recebe os centésimos, como hoje).
- **Depende de** 001 (coleta, ingestão, resultado), 003 (VIEW `leitura_hora`, versões de
  horas, plausibilidade do relógio) e 004 (verificação de suporte e erros do cabo).

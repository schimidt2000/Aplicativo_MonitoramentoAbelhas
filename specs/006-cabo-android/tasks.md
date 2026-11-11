# Tasks: Coleta pelo cabo no Android

**Input**: [spec.md](./spec.md), [plan.md](./plan.md)

## Phase 1: Transporte

- [x] T601 Módulo nativo `modules/bee-usb-serial` (listar, pedirPermissao, abrir, escrever,
  fechar; eventos onDados e onFim; sem DTR/RTS) — D-601 a D-606
- [x] T602 `CaboDeColeta` com versão navegador (embrulha a 005) e versão Android
- [x] T603 Disponibilidade: Android com o módulo = cabo disponível; Expo Go e navegador de
  celular seguem explicando (FR-008); textos ajustados
- [x] T604 Telas `coleta-cabo` e `placa-nova` usam `CaboDeColeta` (sem mudar o comportamento
  no navegador)
- [x] T605 check-fronteira: o módulo nativo só em `src/transports/`

## Phase 2: Testes

- [x] T606 `tests/cabo-android.test.ts`: versão Android contra um módulo falso que liga na
  placa simulada (bytes em pedaços, cabo solto, permissão negada, placa que some e volta)
- [x] T607 Suíte da 005 passando sem mudança (SC-005)

## Phase 3: Aparelho

- [x] T608 Gerar e instalar no tablet Samsung (`docs/android-instalar.md`, FR-010) — **parcial
  (2026-11-04):** APK release gerado (cópia em pasta sem acento, Java 17) e conferido no
  emulador Android 10: abre sem o computador, o módulo carrega ("Usar a placa de verdade"),
  sem placa diz "A placa não apareceu". **Feito em 2026-11-11:** APK release (já com o nome
  "Monitor de Colmeias") instalado pelo cabo num Samsung Galaxy Tab A 10.5 (SM-T595, Android
  10, 32 bits, cerca de 2,7 GB de memória, tela 1200 × 1920): abre sem o computador, mostra
  "Usar a placa de verdade" e a coleta com a placa simulada salvou 37 leituras. A coleta com a
  placa real é a T609
- [ ] T609 Coleta real no tablet com a placa do grupo do firmware (SC-001 a SC-004) —
  **primeira tentativa (2026-11-11, Samsung Galaxy A32 5G, Android 13; falhou):** três
  tentativas, com as duas placas (`…1B:4C:B0` uma vez, `…16:5E:48` duas). Pelo logcat: o
  Android reconheceu a placa (Espressif 303a:1001, interfaces CDC), pediu a permissão ao tocar
  em Coletar, a permissão foi dada em 1 a 2 s e a porta abriu (`UsbDeviceConnection`). Nas
  três, a conversa não completou e nenhuma leitura entrou; a placa ficou no USB 37 s, 54 s e
  30,6 s e sumiu, o que na terceira bate com o prazo de 30 s da placa esperando o `HELLO`. O
  app instalado não registra a conversa, então não dá para dizer em que linha parou.
  **Segunda rodada, com registro da conversa no módulo (`BeeUsbSerial` no logcat), só com a
  `…16:5E:48`:** o app RECEBEU cerca de 1,1 kB de texto da placa logo ao abrir ("LEITOR DE
  MEDICOES … Data/Hora: 04/11/2026 14:12:42 … MAC da placa: 58:E6:C5:16:5E:48 … Quantidade de
  medicoes: 4 … Leitura finalizada.") e mandou `HELLO\n` a cada 4 s por 30 s, duas vezes, com
  os 6 bytes aceitos; nenhuma resposta. **Causa:** essa placa não está com o firmware de
  coleta: está com o `leitura_de_arquivo/leitura_de_arquivo.ino` do repositório do grupo, que
  só imprime o arquivo e para (não ouve `HELLO`, não dorme). **O que ficou provado no
  Android:** reconhecer a placa, permissão, abrir, configurar 115200 8N1 (`SET_LINE_CODING`
  devolveu 7), receber e enviar. A hipótese dos sinais DTR/RTS (D-602) não se confirmou para o
  recebimento. **Falta:** a conversa completa numa placa com o `firmware.ino` (a `…1B:4C:B0`,
  coletada pelo Chrome nesta manhã), acordada pelo botão; a tentativa dela na primeira rodada
  (37 s, sem registro) continua sem explicação.
  **Terceira rodada (mesmo dia, mesma placa `…16:5E:48`, já regravada com o `firmware.ino` do
  `8a19f0a`; FUNCIONOU):** primeira coleta real num Android. Na 1ª tentativa a placa tinha
  ligado pela energia do cabo, não pelo botão: dois `HELLO` sem resposta e ela dormiu em
  12,5 s. Na 2ª, acordada pelo botão: permissão em 1,1 s, `HELLO` → `READY` em 16 ms →
  `GET_FILE` → `FILE_INFO:122:1C89096C` → 122 bytes → `RECEIVED:122:1C89096C` → `TRANSFER_OK`
  → `REQUEST_TIMESTAMP` → `1794416385` → "Timestamp recebido" → `SESSION_COMPLETE`, tudo em
  0,14 s. 122 bytes = 26 + 6 × 16: seis leituras, arquivo iniciado em 04/11 às 14h12min42
  (as 4 que o leitor mostrava e mais 2). O João confirmou que a tela de resultado mostrou as
  6 leituras salvas. Em seguida o celular foi ligado ao projeto e enviou tudo: o Início passou a
  mostrar "No celular 3.499 · Na nuvem 3.499 · Todas as leituras já estão na nuvem" (3.456 de
  exemplo, 37 da placa simulada e as 6 reais). A contagem no servidor não foi conferida por
  consulta.
  **Continua aberta:** SC-001 pede o tablet Samsung; SC-003 (5 coletas seguidas) e SC-004
  (tirar o cabo no meio) não foram feitos

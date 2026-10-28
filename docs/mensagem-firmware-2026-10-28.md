De: grupo do aplicativo. Para: grupo do firmware. 28/10/2026

Oi, pessoal! Obrigado pela versão nova (commit 4cc7ed8). Lemos o código e o protocolo, e o app já lê o arquivo novo, com o MAC na frente. Com o MAC, o app reconhece sozinho de qual colmeia é cada placa. A conversa pelo cabo continua igual, então nada mudou desse lado. Ainda não testamos com a placa de verdade: queremos marcar esse teste com vocês.

Quatro pontos, do mais importante para o menos:

1. A numeração das medições está começando em 1, não em 0.
É a limitação que vocês já anotaram no protocolo (seção 7, item 2). Em getNextMeasurementId, o arquivo novo tem 26 bytes, não 8, então o "if (fileSize == sizeof(uint64_t))" nunca é verdadeiro. A função lê o fim do MAC e a hora como se fossem uma medição, e a primeira medição recebe o número 1. Sugestão: trocar a condição por "if (fileSize <= 26)" (18 do MAC + 8 da hora). O app já funciona com as duas numerações, então podem corrigir quando der.

2. O sensor de gás parece ficar ligado enquanto a placa dorme.
O código põe o ENS160 em modo padrão a cada despertar e não o desliga antes do sono. Se a alimentação continua ligada no sono, o aquecedor dele fica ligado as 2 horas inteiras. Isso gasta bateria (perto de 30 mA) e pode esquentar o AHT21, que fica do lado, em 4 a 6 °C. Vocês podem confirmar? Se for isso, um ens160.setMode(ENS160_OPMODE_DEP_SLEEP) antes do esp_deep_sleep_start() resolve. No teste vamos colocar um termômetro do lado da placa para comparar.

3. Placa nova precisa do sistema de arquivos formatado.
O LittleFS.begin(false) não formata. Uma placa que nunca foi formatada não consegue criar o arquivo, e o app avisa que "a placa não conseguiu guardar a hora". Sugestão: begin(true), ou formatar uma vez ao gravar o programa.

4. Continuam abertos os pedidos do dia 21, se der:
- mandar o intervalo e, um dia, a versão do formato no FILE_INFO, nesta ordem: FILE_INFO:<tamanho>:<crc>:<intervalo_em_segundos>:<versao>. O app já aceita o intervalo depois do CRC;
- não fazer a medição quando o botão acorda a placa e a coleta não termina;
- mandar o status do ENS160 (aquecendo ou pronto) em cada medição.

Para o teste: vamos usar o teste_de_firmware (sono de 10 s), uma placa já formatada, e o app no Chrome de um computador. Qual dia e horário ficam bons para vocês?

Valeu!

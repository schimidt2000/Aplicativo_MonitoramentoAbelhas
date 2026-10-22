Perguntas para o grupo do firmware — versão 2

Data de envio prevista: ____/____/______

Oi, pessoal! Aqui é de novo o grupo do aplicativo. Obrigado pelo repositório e pelos áudios: eles responderam boa parte da primeira lista. Embaixo está o que entendemos (para vocês corrigirem se estiver errado) e o que ainda falta.

"Ainda não decidimos" continua sendo uma resposta ótima. Cada pergunta traz um exemplo de resposta, só para mostrar que uma linha basta.


JÁ RESPONDIDO PELO REPOSITÓRIO E PELOS ÁUDIOS (21/10/2026)

Se algo aqui estiver errado, avisem.

P1. Por onde os dados saem: pelo cabo USB, a 115200. A conversa é HELLO, READY, GET_FILE, FILE_INFO, o arquivo, RECEIVED, TRANSFER_OK, REQUEST_TIMESTAMP e SESSION_COMPLETE, com CRC-32 para conferir o arquivo. Bluetooth ainda não está decidido (ver a pergunta 10 abaixo).

P3, em parte. Cada medição tem temperatura, umidade, eCO2, TVOC e o número da medição, e a placa mede a cada 2 horas. Ainda não vêm a bateria, o status do ENS160 nem um número de versão do formato (ver as perguntas 5, 7 e 8 abaixo).

P5. O número da medição começa em 0 e volta a 0 a cada coleta. Não dá para pedir "da 350 em diante": a placa manda o arquivo inteiro. Tudo bem, o app já se ajusta a isso.

P6a. O celular manda a hora depois que o arquivo chegou certo, quando a placa pede (REQUEST_TIMESTAMP), como um número: os segundos desde 1/1/1970.

P6b. A placa não manda quantos segundos se passaram desde que ligou, nem quantas vezes ligou. Ela guarda só a hora de início, e o app calcula a hora de cada medição: início + número da medição × 2 horas.

P7. A placa apaga o arquivo depois do SESSION_COMPLETE. Por isso o app só responde RECEIVED depois de guardar tudo no celular.

O botão. O apicultor aperta o botão da placa, ela acorda esperando o celular, e aí ele toca no botão do app. Para nós está ótimo assim.


O QUE AINDA PRECISAMOS

Da mais importante para a menos importante. Se alguma não der, tudo bem: o app funciona sem ela, só fica menos certo.

1. Um número fixo de cada placa, que vá junto na coleta.
Hoje o apicultor tem que escolher na tela de qual colmeia é a placa, e uma escolha errada mistura as colmeias para sempre. O número que vem gravado de fábrica no chip (o MAC) resolve, porque nunca muda. Pode vir no READY ou dentro do arquivo. Sabemos que o arquivo depende do grupo de armazenamento; se for com eles, só nos digam com quem falar.
Exemplo de resposta: "Vai o MAC no READY, assim: READY:AA:BB:CC:DD:EE:FF."

2. O tempo entre uma medição e outra.
O app usa 2 horas. Se a placa for configurada com outro tempo, todas as horas saem erradas. Pode vir no FILE_INFO, ou a gente combina que é sempre 2 horas.
Exemplo de resposta: "Vai no FILE_INFO, em segundos: FILE_INFO:<tamanho>:<crc>:7200." Ou: "É sempre 2 horas."

3. Não medir quando o botão acorda a placa e a coleta não termina.
Se a pessoa aperta o botão e a coleta não vai até o fim, a placa mede uma vez fora do horário e recomeça a contagem dali. Aí a conta "início + número × 2 horas" não fecha, e o app deixa essas medições sem hora para não mostrar hora errada.
Exemplo de resposta: "Combinado, só mede no horário."

4. A hora que o celular manda é em segundos, certo?
No áudio apareceu "milissegundos", mas o documento e o código dizem segundos. O app está mandando segundos.
Exemplo de resposta: "Segundos."

5. O status do ENS160 em cada medição.
Nos primeiros minutos (e na primeira vez, por quase uma hora) o ENS160 ainda está esquentando e o TVOC não vale. Sem saber disso, o app deixa os voláteis de fora das médias.
Exemplo de resposta: "Vai um número a mais em cada medição: 0 pronto, 1 aquecendo."

6. O que sai quando um sensor falha.
Qualquer coisa serve, desde que a gente saiba qual é. Só não mandem 0: na planilha das pesquisadoras, um 0 parece medição de verdade.
Exemplo de resposta: "Sai NaN." Ou: "Sai -999."

7. A bateria, em volts.
Hoje ela não vem. Em volts é melhor que em porcentagem: a gente converte no app.
Exemplo de resposta: "Vai a bateria em volts no FILE_INFO."

8. Um número de versão do formato.
Quando o ID da placa entrar no arquivo, o app precisa saber qual formato chegou para não ler errado. Um número (1, 2, 3...) no FILE_INFO resolve.
Exemplo de resposta: "FILE_INFO:<tamanho>:<crc>:<versão>, começando em 1."

9. O que acontece quando algo dá errado.
Vocês falaram que tem "umas coisas de erro" para ver depois. Queremos saber que mensagens a placa manda e o que ela faz com o arquivo em cada caso, para o app explicar ao apicultor o que fazer.
Exemplo de resposta: "Se o CRC não bater, manda TRANSFER_FAIL e não apaga nada."

10. Vai ter Bluetooth?
Muda o que o app mostra no campo. Se for ter, BLE (Bluetooth de baixo consumo) é o que funciona também no iPhone.
Exemplo de resposta: "Não, só cabo." Ou: "Sim, BLE, mais para frente."


UMA COISA QUE DESCOBRIMOS PESQUISANDO

O ENS160 esquenta o AHT21. Nas placas com os dois sensores juntos há relatos de o AHT21 marcar de 4 a 6 °C a mais. Saída simples: ler o AHT21 antes de ligar o ENS160. Não é pedido, é só informação; temos as fontes, se quiserem ver.

Pode responder numerando, do jeito que for mais fácil. E se puderem mandar o programa de teste em Java que recebe o arquivo, ajuda a gente a comparar. Obrigado!

Grupo do aplicativo

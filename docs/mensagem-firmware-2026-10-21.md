De: grupo do aplicativo. Para: grupo do firmware. 21/10/2026

Oi, pessoal! Obrigado pelo protocolo e pelos áudios. O app já coleta os dados da placa pelo cabo do jeito que vocês descreveram: pede o arquivo, confere o tamanho e o CRC, guarda no celular, responde RECEIVED e manda a hora em segundos. Também calculamos no app a hora de cada medição, como vocês pediram.

Seis pedidos, do mais importante para o menos. Se algum não der, tudo bem: o app já funciona sem eles, só fica menos preciso.

1. Mandar o MAC da placa no READY, assim: READY:AA:BB:CC:DD:EE:FF
Hoje o apicultor tem que escolher na tela de qual colmeia é a placa. Com o MAC, o app reconhece a placa sozinho, e não há risco de misturar os dados de uma colmeia com os de outra. O app já aceita esse READY novo e continua aceitando o READY de hoje.

2. Mandar o intervalo entre medições no FILE_INFO, assim: FILE_INFO:<tamanho>:<crc>:<intervalo_em_segundos>
Ou, se preferirem, combinar um valor fixo com a gente. Sem isso, o app usa 2 horas, e a hora fica errada se a placa estiver configurada com outro intervalo.

3. Não fazer a medição quando o botão acorda a placa e a coleta não termina.
Hoje, se a pessoa aperta o botão e a coleta falha, a placa mede uma vez fora do horário e recomeça a contagem dali. Isso bagunça a conta "hora de início + número da medição × intervalo". Quando a conta não fecha, o app deixa aquelas medições sem hora para não mostrar hora errada.

4. Confirmar: a hora que o app manda depois do REQUEST_TIMESTAMP é em segundos, certo?
No áudio apareceu "milissegundos", mas o documento e o código dizem segundos. O app está mandando segundos.

5. Se der: mandar o status do ENS160 (aquecendo ou pronto) em cada medição.
Sem ele, o app não sabe se o TVOC daquela medição já vale, e deixa o TVOC fora das médias.

6. Opcional, se ficar fácil: guardar a hora de cada medição (com time() depois do settimeofday, quando a placa recebe a hora).

Uma dúvida para quando der: quando o grupo de armazenamento colocar o ID da placa no arquivo, como o app vai saber que o formato mudou? Um número de versão no FILE_INFO resolveria.

E se puderem mandar o programa de teste em Java que recebe o arquivo, ajuda a gente a comparar.

Valeu!

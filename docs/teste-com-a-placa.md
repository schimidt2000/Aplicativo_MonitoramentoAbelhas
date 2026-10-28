# Primeiro teste com a placa de verdade

Roteiro para a primeira coleta de uma placa real, com o firmware de 28/10/2026 (commit
`4cc7ed8`). O objetivo é passar pelo caminho inteiro uma vez: placa, app, nuvem e painel.
Leva cerca de 30 minutos. Faça junto com alguém do grupo do firmware, se der.

## O que levar

- **A placa montada**: XIAO ESP32-C6 com AHT21, ENS160 e o botão no D0. O grupo do firmware
  grava nela o `teste_de_firmware` do commit `4cc7ed8`. Esse programa dorme só 10 segundos
  entre medições, o que deixa o teste rápido.
- **Sistema de arquivos formatado.** O programa atual não formata a memória sozinho. Peça ao
  grupo do firmware para confirmar que a placa já foi formatada antes.
- **Um cabo USB-C que passe dados.** Cabo só de carga não aparece no computador.
- **Um computador com Chrome ou Edge.** Safari e Firefox não leem a porta do cabo. O
  navegador do painel do Claude também não serve.
- **Um termômetro** ao lado da placa, para comparar a temperatura.
- **A IDE do Arduino fechada.** O Monitor Serial dela ocupa a porta.

Antes de sair de casa, atualize e abra o app no computador:

```bash
cd ~/Desktop/Bee-sertão && git pull && npm install && npm run web
```

Depois abra http://localhost:8081 no Chrome.

## Passo 1: configurar a placa nova (uma vez só)

Logo depois de gravado o programa, a placa fica esperando a hora e ainda não mede.

1. Ligue a placa no computador pelo cabo.
2. No app: aba **Coletar**, depois **Coletar pelo cabo**, depois **Configurar placa nova**.
3. Confira a data e a hora do computador e toque em **Acertar o relógio**.
4. O Chrome abre uma lista. Escolha a placa, que aparece como "USB JTAG/serial debug unit".

O que pode aparecer:

| Mensagem | O que quer dizer |
|---|---|
| "A placa confirmou e começou a medir" | Deu certo. Siga para o passo 2. |
| "A placa recebeu a hora, mas não conseguiu guardá-la" | A memória da placa não está formatada. Peça ao grupo do firmware para formatar. |
| "Esta placa já estava configurada" | A placa já mede. Pule para o passo 3. |
| "Tentei acertar o relógio, mas a placa não confirmou" | Tire uma foto da tela e repita. Se continuar, anote para o grupo do firmware. |

## Passo 2: deixar a placa medir

Com o programa de teste, a placa mede mais ou menos a cada 25 segundos. Ela dorme 10
segundos e fica uns 15 acordada. Espere de 3 a 5 minutos, o que dá umas 10 medições.

Enquanto a placa dorme, ela some do computador e volta quando acorda. Isso é normal.

## Passo 3: coletar

1. Em **Coletar pelo cabo**, toque em **Usar a placa de verdade**.
2. Na primeira vez, escolha a colmeia desta placa. Anote qual foi.
3. Aperte o botão da placa e toque em **Coletar** em até 30 segundos. Se o Chrome abrir a
   lista, escolha a placa de novo.

O esperado é "leituras salvas" e o aviso de que a placa recomeçou a contar.

**Se aparecer "a placa não respondeu":** a placa também acorda sozinha a cada 25 segundos,
e a coleta só funciona quando quem acorda a placa é o botão. Segure o botão até a placa
aparecer no computador, solte, e toque em Coletar na hora. Se mesmo assim nunca responder,
anote: pode ser que abrir a porta reinicie a placa (pergunta 1 da lista do fim).

## Passo 4: conferir

1. **A hora das leituras.** Na primeira coleta, o app avisa "Não deu para calcular a hora
   destas leituras". É o esperado: o app supõe uma medição a cada 2 horas, e a placa de
   teste mede a cada 25 segundos. Abra a colmeia, vá em "De quanto em quanto tempo a placa
   mede" e escolha **"A cada 25 segundos (placa de teste)"**. As horas aparecem, sem apagar
   nenhuma leitura. A primeira leitura deve ter a hora em que você acertou o relógio.
2. **Temperatura e umidade.** Compare com o termômetro. Se a placa marcar mais de 3 °C acima,
   anote: pode ser o sensor de gás esquentando o de temperatura (ponto 2 da mensagem ao
   grupo do firmware).
3. **Voláteis.** O programa de teste espera só 10 segundos pelo sensor de gás, que ainda
   está aquecendo. O app mostra os valores, mas não os usa nas médias. Isso é esperado.
4. **Coletar de novo.** Repita o passo 3. As leituras novas entram e as antigas não se
   repetem.
5. **A placa se apresenta sozinha.** Na segunda coleta, escolha de propósito outra colmeia.
   O app deve avisar que a placa é da colmeia da primeira coleta e guardar as leituras lá.

## Passo 5: enviar e ver no painel

1. Com internet, abra a aba **Enviar** e toque em **Enviar agora**. O app precisa estar
   ligado ao projeto pelo código.
2. Abra o painel das pesquisadoras:

```bash
cd ~/Desktop/Bee-sertão/painel && npm run dev
```

3. Entre em http://localhost:5173 com o seu usuário e abra a colmeia. As leituras da placa
   devem aparecer lá.

## O que anotar para o grupo do firmware

1. Abrir a porta reinicia a placa? O sinal é "a placa não respondeu" toda vez, mesmo
   apertando o botão antes de tocar em Coletar.
2. Quanto tempo passa entre apertar o botão e a placa aparecer no Chrome.
3. A temperatura da placa e a do termômetro, lado a lado, depois de uns 10 minutos.
4. Foto de qualquer mensagem de problema que o app mostrar. O app também guarda, em cada
   coleta, tudo o que a placa respondeu.

O que já sabemos e não precisa testar está em
[`integracao-firmware.md`](./integracao-firmware.md), na seção do firmware de 2026-10-28.

# Quickstart — ver a coleta pelo cabo funcionando

**Feature**: `specs/005-coleta-pelo-cabo` · app de campo no navegador (`npm run web`)

## 1. Com a placa simulada (sem placa nenhuma)

1. `npm run web` e abra no Chrome ou no Edge do computador.
2. Aba **Coletar** → **Coletar pelo cabo** (ou Diagnóstico → Coletar pelo cabo).
3. "De qual colmeia é esta placa?" → escolha uma colmeia. A escolha fica marcada para a
   próxima vez.
4. Toque em **Usar a placa simulada**. O rótulo "Placa simulada" fica no topo.
5. Siga os passos: a placa simulada "acorda" quando você toca em Coletar; a contagem dos 30 s
   aparece; o progresso mostra bytes e leituras.
6. Resultado: "N leituras salvas", "A placa apagou o que já estava salvo e recomeçou a contar".
   Na tela da colmeia, o gráfico mostra as leituras com a hora estimada pela contagem.
7. Colete de novo: "Já estava tudo salvo" ou poucas leituras novas — a placa simulada
   recomeçou o arquivo com a hora enviada.

O que dá para ver em cada caso ruim está em `tests/cabo-ponta-a-ponta.test.ts`, um teste por
caso (CRC errado, cabo puxado, placa que volta a dormir, cada `ERROR:*`, falta de energia,
botão apertado sem coleta, hora do computador errada).

## 2. Com a placa real (sessão com o grupo do firmware)

1. Placa com o `teste_de_firmware.ino` do commit `e93f8ad` já configurada (se for nova, use
   **Configurar placa nova** primeiro, com a placa ligada no cabo).
2. Coletar pelo cabo → escolha a colmeia → ligue o cabo → aperte o botão da placa → toque em
   **Coletar** em até 30 s. Na primeira vez o Chrome mostra a lista de portas: escolha a placa.
3. O intervalo da placa só aparece na tela da colmeia **depois** da primeira coleta pelo
   cabo. O firmware de teste dorme 10 s e fica uns 14 s acordado: escolha "A cada 25
   segundos (placa de teste)". Com o padrão de 2 h, essa primeira coleta fica "sem hora"
   (medições a mais); ao trocar o intervalo, as horas são refeitas e nenhuma leitura muda.
4. Confira no resultado o que a placa disse, e em `pull_session.registro` (via exportação do
   banco) as linhas trocadas — é o que levar ao grupo do firmware se algo der errado.

**Riscos a observar na primeira sessão** (`docs/integracao-firmware.md`): se abrir a porta
reinicia a placa (a placa imprime "Wake-up causado motivo desconhecido." e não conversa); se a
porta reaparece rápido depois do botão; o tempo real acordado; a deriva da contagem depois de
algumas horas.

## 3. Onde não há cabo

Abra a mesma tela no Firefox, no Safari, num navegador de celular ou no app instalado: ela
explica onde a coleta pelo cabo funciona e não mostra botão de coletar inerte. Na
demonstração, a placa simulada continua disponível.

---
paths:
  - "src/app/**"
  - "src/ui/**"
  - "src/core/format/**"
  - "src/core/i18n/**"
---

# Interface

O ambiente de uso é sol a pino, luvas, uma mão livre e uma colmeia aberta, num celular Android
de 2 GB que o apicultor não vai trocar por causa do nosso app. Todas as regras abaixo saem
disso.

## ui-ux-pro-max: onde ela manda e onde não manda

A skill **tem autoridade** sobre paleta e sobre as regras de UX (hierarquia, fluxo, redação de
microcopy, acessibilidade).

A skill **não tem autoridade** sobre estilo visual, animação, efeitos, sombras, fontes ou
biblioteca de gráficos. Isso é fixado aqui e não se negocia.

O motivo é concreto e verificável: no corpus dela, glassmorphism — cujo próprio campo CSS diz
`backdrop-filter: blur(15px)` — está classificado como `cost:low | drivers:none`. Neumorphism
também. São exatamente os dois piores estilos possíveis para um Snapdragon 425. Se ela sugerir
um estilo, traduza a sugestão para os tokens abaixo e descarte o resto.

## Proibido

Verificável com um grep no CI:

- `backdrop-filter`, `filter: blur()`, qualquer desfoque em qualquer lugar
- glassmorphism, neumorphism, claymorphism, qualquer painel translúcido
- mais de um token de sombra, ou qualquer sombra dentro de lista rolável
- biblioteca de animação; animar qualquer coisa além de `transform` e `opacity`
- skeleton shimmer, parallax, revelação escalonada, movimento de fundo infinito
- fonte de ícone, emoji como ícone, fonte web customizada
- biblioteca de gráficos
- tema escuro na v1

> Desfoque é desqualificante por um motivo mecânico, não estético: `backdrop-filter` não é uma
> pintura, é um pipeline — capturar o fundo numa textura offscreen, rodar passes de blur,
> recompor. Numa tela que rola, o fundo muda a cada quadro, então **nada pode ser cacheado**.
> E no React Native o blur no Android é `RenderEffect`, que é **API 31+**: no Android 8–10 não
> é lento, é **inexistente**.

## Obrigatório

- Tema **claro, de alto contraste, único**. Cerca de 24 tokens semânticos, nomeados de modo
  que um tema escuro futuro seja troca de valor, não redesenho.
- **Fonte do sistema.** No Android é Roboto: já residente na memória, zero bytes, zero FOUT.
- Ícones SVG inline, subconjunto pequeno.
- Gráficos: um `<Path>` de `react-native-svg` com o `d` pré-computado a partir dos rollups
  diários. Reduza a série a no máximo ~700 pontos **na ingestão**, nunca no render.
  *(No painel web, uPlot. uPlot é biblioteca de DOM/Canvas e não funciona em React Native.)*
- **"Modo sol"**: um toque, persistido, no topo da tela — brilho máximo, um passo a mais de
  tamanho de tipo, texto secundário removido, bordas de 2 px. São umas 15 linhas e resolvem a
  reclamação de campo real que o tema escuro não resolve.

## Medidas

- Alvos de toque **≥ 56 dp**, com **≥ 12 dp** de espaçamento. Linha de card tocável ≥ 72 dp, e
  o card inteiro é o alvo. Luva vence a recomendação de 48 dp do Material.
- Texto de corpo ≥ 16 sp. Número de leitura ≥ 32 sp, com algarismos tabulares.
- Contraste ≥ 7:1 no texto primário e nos números, 4,5:1 no secundário, 3:1 em bordas e linhas
  de gráfico.
- O layout continua utilizável com a fonte do sistema em 200%.
- Ações primárias no terço inferior, alcançáveis com o polegar. Ação destrutiva nunca ali.

## Cor nunca é o único canal

Todo status precisa de **cor + ícone + palavra**. A tela tem que continuar compreensível em
escala de cinza — é assim que ela sobrevive ao sol lavando a tela e ao daltonismo ao mesmo
tempo.

Dois eixos que **nunca** viram um crachá só:

- **Frescor** — `Agora há pouco` / `Hoje, 14h20` / `Há 3 dias` / `Há 2 semanas`. Escala de
  cinza, nunca vermelho.
- **Sincronização** — `Salvo no celular` / `Enviando…` / `Salvo na nuvem` /
  `Vai enviar quando tiver internet`. Neutro, **nunca "falhou"**.

## Texto

- Toda string visível vem do módulo de i18n. **Nenhuma string literal dentro de componente** —
  o lint do CI reprova, e o build falha se faltar chave em pt-BR.
- O vocabulário segue `docs/glossario.md`. Termo técnico de computação não vaza para a tela:
  "coleta", não "download"; "leitura", não "sample"; "nó sensor", não "dispositivo".
- Toda mensagem diz o que aconteceu **e o que fazer em seguida**. Nunca código de erro, stack
  trace ou texto em inglês.
- Falta de rede não é erro. Não use "erro", "falha" nem "offline" como manchete para isso.
- Formato brasileiro: vírgula decimal, `dd/MM/aaaa`, 24 h, métrico.

## Honestidade na tela

- O canal de gás se chama **"Voláteis (COVs)"**. **Nunca "CO₂"**, em nenhuma tela, gráfico ou
  exportação. O eCO₂ é derivado de voláteis, não medido. Detalhes em `docs/glossario.md`.
- Voláteis se exibem como **tendência e anomalia relativa à própria colmeia**, não como número
  cru, e nunca em comparação absoluta entre colmeias.
- Gráfico mostra período inválido ou ausente como **lacuna**. Nunca interpole.
- Precisão exibida nunca excede a exatidão do sensor: temperatura com 1 casa, umidade com 0.
  Nunca 2 casas em nada.
- Bateria é palavra de três estados, nunca porcentagem. A curva de descarga é plana e depois
  despenca; um mapa linear mostra "70 %" por meses e mente exatamente quando importa.
- Se a umidade estiver saturada ou travada em 100 %, **não calcule nem exiba ponto de orvalho
  ou VPD** — eles colapsam para valores plausíveis e sem sentido. Cinza, não número.

## Desempenho no render

- Nada bloqueia a thread de UI por mais de 100 ms. Decodificação, I/O de banco e sync ficam
  fora dela.
- Listas são virtualizadas. Uma lista de 10.000 leituras rola sem ANR e com memória estável.
- Retorno ao toque em até 100 ms, mesmo que o trabalho demore mais.
- No máximo um elemento animado por vez, até 300 ms, só `transform` e `opacity`.
- Sobredesenho da GPU no Android deve ficar em 1× na maior parte da tela, e nunca em 3×.

<!--
SYNC IMPACT REPORT
==================
Version change: (template não preenchido) → 1.0.0
Ratification: 2026-09-09

Princípios definidos (7):
  I.   Offline por Padrão
  II.  Orçamento de Desempenho no Aparelho de Referência
  III. Leituras Imutáveis e Idempotentes
  IV.  O Payload é Externo
  V.   Ergonomia de Campo em pt-BR
  VI.  Honestidade do Dado
  VII. Especificação Antes do Código

Seções adicionadas:
  - Restrições de Plataforma e Dados (Section 2)
  - Fluxo de Desenvolvimento e Portões de Qualidade (Section 3)
  - Governance

Templates dependentes:
  ✅ .specify/templates/plan-template.md — o portão "## Constitution Check" é preenchido
     pelo formato obrigatório definido em Governance (tabela de 7 vereditos).
  ✅ .specify/templates/spec-template.md — nenhuma seção obrigatória adicionada.
  ✅ .specify/templates/tasks-template.md — nenhuma categoria de tarefa removida.

TODOs diferidos:
  - Princípio II: os orçamentos numéricos são PROVISÓRIOS até a medição da feature
    001 no aparelho de referência físico. Re-ratificar como "medido + 20%" por
    emenda MINOR. Ver a cláusula de re-ratificação no próprio princípio.

Nota de idioma: o corpo é pt-BR porque é governança humana que a equipe precisa usar
para reprovar um plano numa reunião. Os cabeçalhos estruturais em inglês
(Core Principles, Governance) e a linha Version, mais os tokens RFC-2119 em caixa
alta (MUST, MUST NOT, SHOULD), permanecem em inglês por serem interface de máquina:
/speckit-analyze extrai literalmente esses tokens para montar o conjunto de regras,
e todo conflito com um MUST é tratado como CRITICAL.
-->

# Bee-sertão Constitution

Aplicativo de coleta e sincronização de dados de microclima de colmeias, para
apicultores e meliponicultores do semiárido brasileiro.

**Fronteira de escopo.** Esta equipe é responsável pelo aplicativo e pela interface
**a partir do momento em que o apicultor conecta o celular à colmeia**: transporte,
decodificação, banco local, sincronização, telas, exportação e painel web. Sensores,
firmware e o protocolo de saída do nó pertencem a outra equipe e são tratados como
contrato externo.

## Core Principles

### I. Offline por Padrão

Ausência de rede é o **estado normal** do aplicativo, não uma condição de erro.

- Toda tela e toda escrita do fluxo principal — cadastrar apiário e colmeia, parear
  com o nó, coletar leituras, ver histórico, registrar evento — MUST completar com o
  aparelho em modo avião, sem qualquer chamada de rede.
- Nenhuma tela MUST NOT bloquear, exibir carregamento indefinido ou esconder conteúdo
  aguardando rede. Estado de rede é informação secundária, nunca um bloqueio.
- Sincronização MUST ser processo de fundo, retomável e cancelável, disparado por
  disponibilidade de rede ou por toque explícito — nunca pré-requisito de navegação.
- A UI MUST exibir, por colmeia, dois estados **distintos e simultaneamente visíveis**:
  "salvo no celular" e "salvo na nuvem". Conflacionar os dois MUST NOT acontecer.
- Nenhum dado coletado MUST NOT ser apagado do aparelho antes de confirmação de
  gravação no servidor.
- Ausência de rede MUST NOT ser comunicada com as palavras "erro" ou "falha".
- Todo `plan.md` MUST conter a tabela **Comportamento Offline**, uma linha por tela ou
  ação nova, com as colunas: `Tela/Ação | Sem rede | Rede intermitente | Fonte do dado`.
  Plano sem essa tabela viola este princípio.

**Rationale:** No sertão o apicultor passa dias sem sinal, e o apiário costuma estar
mais distante da torre do que a casa. Um app que precise de rede para mostrar o que já
está no telefone é inutilizável exatamente no lugar e no momento em que é necessário.
Perder uma coleta significa perder uma viagem a campo — custo de deslocamento real,
não um defeito de conveniência.

### II. Orçamento de Desempenho no Aparelho de Referência

Desempenho é um orçamento numerado, medido no pior aparelho que precisamos atender.

- **Aparelho de referência:** Android 9, 2 GB de RAM, Snapdragon 425/430/450,
  armazenamento de 16 GB **a aproximadamente 90% de ocupação**. Número obtido em
  emulador MUST ser declarado como tal e só vale para pré-triagem.
- Toda medição MUST ser feita a frio, após limpar cache, e reportada como **p50 e p95**,
  nunca apenas como média.
- Métrica de arranque morno MUST NOT ser usada como critério: num aparelho de 2 GB o
  processo é encerrado entre usos, e **todo lançamento é um arranque a frio**.
- Orçamentos vigentes (violação reprova o portão):
  - Arranque a frio até primeira tela interativa: **≤ 3,5 s p50** e **≤ 5,0 s p95**.
  - Pico de memória: **≤ 150 MB TOTAL PSS**, com Private Dirty reportado ao lado.
  - Nenhuma interação MUST NOT bloquear a thread de UI por **mais de 100 ms**.
    Decodificação, I/O de banco e sincronização rodam fora dela.
  - Artefato de release por ABI: **≤ 40 MB** (interino).
  - Banco local: teto rígido de **150 MB**, com aviso na UI a partir de 120 MB.
  - Lista de 10.000 leituras MUST rolar sem ANR, com memória estável e virtualização.
- Toda dependência nova que aumente o artefato de release em **mais de 500 KB** MUST ser
  justificada em `## Complexity Tracking`, com a alternativa mais simples nomeada e o
  motivo da rejeição.
- Animação, sombra, desfoque, fonte customizada e biblioteca de gráficos MUST NOT ser
  introduzidos sem número medido no aparelho de referência.
- **Os números acima são provisórios até a medição da feature 001.** Depois dela, cada
  teto MUST ser re-ratificado como **medido + 20%** por emenda MINOR. Ratificar um número
  que sabemos que vamos violar MUST NOT acontecer.

**Rationale:** O público-alvo não troca de telefone por causa do nosso app. Num aparelho
de 2 GB quase cheio, competindo com WhatsApp e câmera, o custo dominante é paginar código
do armazenamento, não CPU. Orçamento sem número vira opinião na revisão; com número,
qualquer pessoa reprova um plano sem discussão. E um princípio violado impunemente ensina
que todos os outros são opcionais — por isso a cláusula de re-ratificação.

### III. Leituras Imutáveis e Idempotentes

A série temporal é o produto científico do projeto. Ela é append-only.

- A chave primária de uma leitura MUST ser **`(node_id, seq)`**, onde `seq` é o contador
  monotônico do nó. `boot_id` MUST ser gravado como campo do registro e MUST NOT fazer
  parte de chave alguma.
- Reimportar o mesmo payload MUST ser operação sem efeito: a contagem de linhas após a
  segunda importação MUST ser idêntica à da primeira. Isso MUST ter teste automatizado
  rodando no CI.
- O código MUST NOT executar `UPDATE` nem `DELETE` na tabela de leituras. Correção se faz
  por registro novo com marcação de qualidade, ou por tabela separada.
- Lacunas em `seq` MUST ser tratadas como normais e inofensivas — o contador só precisa
  ser monotônico e único, nunca contíguo. Lacuna MUST NOT ser interpretada como perda.
- O contador bruto do nó MUST ser imutável no banco. O timestamp UTC é **derivado** e
  recomputável a partir do contador e das âncoras de relógio, e MUST carregar um campo de
  qualidade em `{rtc, anchored, estimated, unknown}`. Timestamp local ingênuo MUST NOT
  ser persistido.
- Valor ausente, fora de faixa ou com falha de sensor MUST ser gravado como NULL com
  motivo codificado. Sentinelas numéricas (`0`, `-1`, `-999`) MUST NOT representar
  ausência.
- Sincronização MUST ser at-least-once, com deduplicação por chave natural no servidor.
  Perder uma leitura é defeito **crítico**; entregar uma leitura duplicada é comportamento
  esperado e absorvido pela chave.
- Faixas plausíveis MUST ser declaradas em um único módulo e aplicadas na ingestão como
  **marcação**, nunca como descarte silencioso.

**Rationale:** As leituras são coletadas uma única vez, num lugar de difícil acesso, por
enlaces que caem no meio da transferência. Retentativa é o caso normal, então idempotência
é a única forma de retentar sem corromper a série. Append-only garante que um defeito nosso
de hoje não apague o dado de campo de ontem — o dado é insubstituível, o código não. E
`boot_id` fora da chave é o que impede o nó de gerar duplicatas silenciosas a cada
reinício, corrupção que só apareceria meses depois.

### IV. O Payload é Externo

O formato de dados do nó pertence a outra equipe. É contrato de terceiro, versionado e
mutável.

- Todos os transportes — BLE, cabo, arquivo, mock — MUST implementar **uma única
  interface** e produzir o **mesmo tipo canônico** de leitura. Código de domínio e de UI
  MUST NOT importar SDK, biblioteca ou tipo específico de transporte. Isso MUST ser
  verificado por regra de fronteira de importação no lint do CI.
- Toda carga MUST carregar uma versão de protocolo, e a decodificação MUST ser uma tabela
  `versão → decodificador`. Versão desconhecida MUST ser rejeitada com mensagem em pt-BR
  dizendo o que fazer, sem gravar nada parcial. Decodificação por tentativa e erro
  MUST NOT ocorrer.
- A carga bruta de cada sessão de coleta MUST ser preservada, para permitir reprocessamento
  quando descobrirmos que interpretamos um campo incorretamente.
- Um transporte **`mock` completo** — capaz de reproduzir queda no meio da transferência,
  verificação de integridade inválida, reinício do nó durante a sessão, salto de relógio,
  MTU mínimo, lacuna de contador, amostras inválidas e versão de protocolo desconhecida —
  MUST existir e MUST ser a base dos testes automatizados. Ele MUST ser entregue **antes**
  de qualquer transporte real.
- Depois da ingestão, o transporte MUST sobreviver apenas como metadado do registro.
  Nenhuma regra de negócio, cálculo ou tela MUST NOT ramificar por transporte, exceto as
  telas de conexão e diagnóstico.
- Acrescentar um transporte novo MUST NOT exigir alteração fora do pacote de transportes.
- Todo plano que toque conectividade MUST conter a **Matriz de Capacidades**:
  `Transporte × (Android | iOS | Web) → suportado / não suportado / degradado`. Onde um
  transporte não existir, a UI MUST explicar a alternativa em pt-BR — botão inerte ou erro
  genérico MUST NOT aparecer.
- Toda transferência MUST ser retomável por cursor e MUST NOT depender de uma única conexão
  contínua bem-sucedida.

**Rationale:** O nó sensor é de outra equipe; protocolo, formato e até o meio físico vão
mudar durante o projeto. Se o transporte vazar para dentro do domínio, cada mudança de
firmware vira refatoração do app inteiro e esta equipe fica bloqueada esperando a outra.
O transporte `mock` é o que torna essa independência real em vez de teórica — sem ele a
equipe fica ociosa esperando a placa e nunca exercita os caminhos de falha, que são o
ponto inteiro de um app offline-first.

### V. Ergonomia de Campo em pt-BR

O ambiente de uso é sol a pino, luvas, uma mão livre e uma colmeia aberta. O idioma é o
do apicultor.

- Ações primárias MUST estar no terço inferior da tela, alcançáveis com o polegar. Ação
  destrutiva MUST NOT ficar nessa zona.
- Alvos de toque MUST ter **no mínimo 56 dp** com **12 dp** de espaçamento. Linha de card
  tocável MUST ter no mínimo 72 dp, e o card inteiro MUST ser o alvo.
- Texto de corpo MUST ter no mínimo 16 sp; número de leitura MUST ter no mínimo 32 sp com
  algarismos tabulares. O layout MUST permanecer utilizável com a fonte do sistema em 200%.
- Contraste MUST ser **no mínimo 7:1** para texto primário e números, 4,5:1 para
  secundário, 3:1 para bordas e linhas de gráfico.
- Toda tela MUST permanecer compreensível em escala de cinza: status MUST NOT ser
  transmitido apenas por cor — exige **cor e ícone e palavra**.
- O tema é **claro, de alto contraste, único**. Tema escuro MUST NOT ser entregue na v1.
- O fluxo de coleta em campo MUST ser concluível **sem digitação de texto livre**. Gesto
  MUST NOT ser a única forma de executar uma ação.
- Toda operação com o nó MUST dar retorno redundante: texto **e** vibração ou som.
- Toda string visível MUST vir do módulo de i18n, com **pt-BR como idioma fonte**. String
  literal visível dentro de componente MUST NOT existir, e isso MUST ser verificado por
  lint no CI.
- Formatação MUST ser brasileira: vírgula decimal, `dd/MM/aaaa`, 24 h, sistema métrico,
  com UTC preservado no armazenamento.
- O vocabulário MUST seguir `docs/glossario.md`. Termo técnico de computação MUST NOT
  vazar para a UI.
- Mensagem de erro MUST dizer, em pt-BR, o que aconteceu **e o que fazer em seguida**.
  Código de erro cru, stack trace ou texto em inglês MUST NOT ser exibido.

**Rationale:** O app é usado com a outra mão segurando um quadro, sob luz que apaga a tela
e com luvas que engrossam o dedo. Um alvo de 44 dp e um rótulo cinza-claro funcionam no
monitor do laboratório e falham no apiário. Tema escuro é a pior escolha possível sob sol:
o reflexo ambiente vira o próprio fundo, enquanto o texto claro fica limitado pelo brilho
da tela — e a economia de bateria só existe em OLED, que estes aparelhos não têm.

### VI. Honestidade do Dado

O app MUST NOT afirmar mais do que o sensor mede.

- Grandeza derivada MUST ser rotulada como derivada, no próprio rótulo e não em nota de
  rodapé. Especificamente: o valor de **CO₂ equivalente (eCO₂) do sensor de gás MUST NOT
  ser exibido como CO₂**, em nenhuma tela, exportação ou gráfico. Ele é calculado a partir
  de compostos orgânicos voláteis, não medido.
- O valor bruto do sensor MUST ser preservado no banco. Calibração, offset e correção
  MUST ser campos separados, aplicados apenas na renderização, de modo que a série
  histórica inteira possa ser recomputada quando uma correção for caracterizada.
- Amostra marcada como inválida pelo sensor MUST ser excluída de todo agregado, e a
  **contagem de amostras excluídas MUST acompanhar o resultado** do agregado.
- Gráfico MUST representar período excluído ou ausente como **lacuna**. Interpolar sobre
  período inválido MUST NOT acontecer.
- Análise e agregado MUST NOT cruzar fronteira de época de sensor. Troca de sensor,
  tratamento químico e reinício de condicionamento iniciam uma época nova.
- Comparação de valor absoluto de compostos voláteis entre colmeias distintas MUST NOT ser
  oferecida na UI. A leitura é comparável apenas com o histórico da própria colmeia.
- Toda exportação MUST carregar cabeçalho de proveniência: modelo do sensor, versão do
  protocolo, declaração de quais grandezas são derivadas, e contagem de amostras excluídas.
- Precisão exibida MUST NOT exceder a exatidão do sensor.

**Rationale:** Os dados existem para serem analisados por especialistas, e a análise delas
é o produto final do projeto. Um número rotulado "CO₂" vira captura de tela, vira slide, e
perde a ressalva no caminho — momento em que o erro deixa de ser nosso e passa a ser da
dissertação de outra pessoa. Uma reta interpolada sobre três dias de sensor saturado é
indistinguível de dado real e é a forma mais barata de publicar algo falso. Preservar o
bruto é o que permite consertar depois; arredondar na gravação destrói essa possibilidade
para sempre.

### VII. Especificação Antes do Código

Este projeto é conduzido por Spec-Driven Development, e a disciplina é vinculante.

- Nenhuma mudança de comportamento visível ao usuário MUST NOT ser implementada sem
  `specs/<NNN>-<slug>/spec.md` e `plan.md` na branch. Correção de texto, formatação e
  refatoração sem mudança de comportamento estão isentas.
- Todo `plan.md` MUST preencher `## Constitution Check` no formato obrigatório definido em
  Governance: um veredito explícito por princípio I–VII. Constitution Check vazio, genérico
  ou parcial MUST ser tratado como violação.
- `/speckit-analyze` MUST ser executado antes de `/speckit-implement`, e todo achado
  CRITICAL MUST estar resolvido antes de implementar.
- Item marcado como necessitando esclarecimento MUST ser resolvido via `/speckit-clarify`
  ou junto à outra equipe. Adivinhar requisito MUST NOT acontecer — **especialmente** sobre
  formato de payload, protocolo, unidades e comportamento do nó sensor, que não são nossos.
- **Toda suposição sobre o nó sensor MUST estar registrada em
  `docs/integracao-firmware.md`, com data e com o nome de quem confirmou — ou marcada
  explicitamente como não confirmada.**

**Rationale:** São duas equipes com uma interface física e temporal entre elas, e um prazo
acadêmico. A especificação é o contrato com a outra equipe e é também o entregável
avaliado. Um requisito adivinhado sobre um payload que não controlamos é a forma mais
barata de perder uma campanha inteira de coleta, e o custo só aparece depois da viagem.

## Restrições de Plataforma e Dados

- **Um codebase mobile** atende Android e, futuramente, iOS. Fork de codebase por
  plataforma MUST NOT ser criado.
- **O painel web é artefato separado, online.** Ele MUST NOT conter banco local nem motor
  de sincronização. Coleta pela web é possível apenas por cabo, em navegador de desktop.
- **Alvos mínimos:** Android 8.0 (API 26); navegadores Chromium atuais. Elevar um mínimo é
  emenda MINOR desta constituição.
- **Armazenamento local** é banco embarcado transacional com esquema versionado e migrações
  versionadas para frente. Migração MUST NOT destruir leituras; toda migração MUST ter
  teste com banco populado.
- **Permissões** MUST ser pedidas no momento do uso, com justificativa em pt-BR na tela.
  O app MUST NOT pedir permissão que não use.
- **Sigilo do apicultor e LGPD:** coordenadas de apiário são informação sensível ao negócio,
  por risco de furto de colmeias, e MUST NOT ser expostas fora da conta do usuário nem
  enviadas a terceiros. Exportação para pesquisa MUST usar coordenada de precisão reduzida.
  CPF, RG e endereço MUST NOT ser coletados. Telemetria MUST NOT existir sem consentimento
  explícito, desligado por padrão.
- Toda comunicação com o servidor MUST usar TLS. Chave de serviço com privilégio
  administrativo MUST NOT existir no aplicativo. Log MUST NOT conter dado pessoal nem
  coordenada.
- Nenhuma funcionalidade do caminho crítico de coleta MUST NOT depender de serviço pago de
  terceiro.

## Fluxo de Desenvolvimento e Portões de Qualidade

- Fluxo por feature, em forma de hífen — com `--integration claude` os comandos do Spec Kit
  são Agent Skills e a invocação usa hífen, não ponto:
  `/speckit-specify → /speckit-clarify → /speckit-plan → /speckit-checklist →
   /speckit-tasks → /speckit-analyze → /speckit-implement → /speckit-converge`
- Branch: `<tipo>/<NNN>-<slug>`, com `<tipo>` em {feat, fix, docs, chore, spike}. O `NNN`
  casa com o diretório em `specs/`.
- `.specify/feature.json` MUST ser versionado. No Spec Kit 0.12.7 o estado da feature vive
  nesse arquivo, não na branch; sem ele, `/speckit-plan` falha em um clone novo.
- Portões obrigatórios em todo PR:
  1. Lint e verificação de tipos limpos.
  2. Nenhuma string de UI fora do módulo de i18n.
  3. Teste de idempotência de ingestão passando.
  4. Regra de fronteira de importação de transporte passando.
  5. Verificação de contraste e tamanho de alvo nas telas alteradas.
  6. Números de desempenho registrados quando a feature os afeta.
  7. `## Constitution Check` preenchido com sete vereditos, sem violação injustificada.
- **Teste em modo avião** é obrigatório para toda feature que grave ou leia dados de campo,
  e o resultado MUST ser relatado no PR.
- **Verificação em aparelho físico** antes de fechar um marco. Emulador não substitui.
- Toda suposição sobre o nó sensor MUST ser reconfirmada com a outra equipe antes de cada
  campanha de campo.

## Governance

Esta constituição prevalece sobre convenção informal em caso de conflito.

**Autoridade.** Os princípios I–VII são portões vinculantes. `/speckit-analyze` trata
conflito com um MUST como CRITICAL. Violação se resolve alterando a especificação, o plano
ou as tarefas — **nunca** diluindo, reinterpretando ou ignorando um princípio.

**Formato obrigatório do Constitution Check.** Todo `plan.md` MUST conter, na seção
`## Constitution Check`, exatamente esta tabela, com uma linha por princípio:

| Princípio | Veredito | Evidência |
|---|---|---|
| I. Offline por Padrão | PASS / VIOLAÇÃO / N/A | tabela Comportamento Offline, seção X |
| II. Orçamento de Desempenho | PASS / VIOLAÇÃO / N/A | números medidos ou estimados, p50/p95 |
| III. Leituras Imutáveis e Idempotentes | PASS / VIOLAÇÃO / N/A | chave `(node_id, seq)` e teste de reimportação |
| IV. O Payload é Externo | PASS / VIOLAÇÃO / N/A | Matriz de Capacidades e regra de importação |
| V. Ergonomia de Campo em pt-BR | PASS / VIOLAÇÃO / N/A | checklist por tela e chaves de i18n |
| VI. Honestidade do Dado | PASS / VIOLAÇÃO / N/A | rótulos, lacunas, contagem de exclusões |
| VII. Especificação Antes do Código | PASS / VIOLAÇÃO / N/A | caminho da spec e identificadores de tarefa |

`N/A` só é aceito com uma frase de justificativa. Toda `VIOLAÇÃO` MUST ter linha
correspondente em `## Complexity Tracking`, com a alternativa mais simples nomeada e o
motivo da rejeição. O portão é reavaliado após a Fase 1 do plano.

**Emendas.** Exigem PR com justificativa, revisão de outra pessoa da equipe, incremento de
versão conforme a política abaixo, e propagação para os templates dependentes no mesmo PR,
registrada no Sync Impact Report no topo deste arquivo.

**Política de versionamento.** MAJOR: remoção ou redefinição incompatível de princípio ou
regra de governança. MINOR: novo princípio ou seção, orientação materialmente expandida, ou
orçamento numérico endurecido. PATCH: clarificação, redação, correção não semântica.

**Revisão de conformidade.** Toda revisão de PR MUST verificar conformidade. Complexidade
adicional MUST ser justificada no PR e, para planos, em `## Complexity Tracking`. Violação
injustificada bloqueia o merge.

**Revisão periódica.** Esta constituição MUST ser relida ao fim de cada campanha de campo.
Orçamento que nunca reprovou nada está frouxo demais; princípio violado três vezes sem
emenda MUST ser corrigido ou removido.

**Version**: 1.0.0 | **Ratified**: 2026-09-09 | **Last Amended**: 2026-09-09

---
paths:
  - "src/data/**"
---

# Banco local e sincronização

## A tabela de leituras é append-only

- Chave primária `(node_id, seq)`. **`boot_id` nunca entra em chave nenhuma** — é campo de
  payload, usado só para segmentar relógio. Se entrar, cada reinício do nó gera duplicatas
  silenciosas que `INSERT OR IGNORE` aceita como linhas novas, e a corrupção só aparece meses
  depois.
- Nunca `UPDATE` nem `DELETE` em `reading`. Correção se faz por registro novo com marcação de
  qualidade, ou por tabela separada.
- Reimportar o mesmo payload é operação sem efeito. Existe teste no CI para isso; mantenha
  verde.
- Lacuna em `seq` é **normal**. O contador só precisa ser monotônico e único, nunca contíguo.
  Não trate lacuna como perda de dado.

## Tempo

- O contador bruto do nó é imutável no banco. O timestamp UTC é **derivado** e recomputável a
  partir dele mais as âncoras de relógio, e carrega sempre um campo de qualidade.
- Guarde as âncoras para sempre, em tabela própria. São minúsculas e permitem recalcular todos
  os timestamps depois — é exatamente por isso que o contador bruto não pode ser alterado.
- Nunca persista horário local ingênuo.

## Valores brutos

Guarde o valor do sensor como veio. Calibração, offset e correção são **campos separados,
aplicados apenas na renderização**. Arredondar na gravação destrói para sempre a possibilidade
de recomputar a série quando uma correção for caracterizada — e há pelo menos uma correção
provável pendente (o aquecimento cruzado descrito em `docs/integracao-firmware.md`).

## Agregados

- Rollups são computados **na ingestão**, dentro da mesma transação. A UI nunca agrega no
  render.
- Agregado inclui **apenas amostras válidas**, e carrega junto a **contagem de amostras
  excluídas**. Um agregado sem essa contagem mente por omissão.
- Nenhum agregado cruza fronteira de época de sensor.

## Sincronização

- Trilha A, leituras: lê do índice parcial de não sincronizados, envia em lote, e grava a
  confirmação **na mesma transação SQLite**. A retomabilidade sai de graça da idempotência.
- Trilha B, entidades editadas por pessoa: tabela `outbox`, última escrita vence —
  **pendente (T072)**: hoje o envio usa cursor pelo relógio do celular.
- Lote adaptativo: dois timeouts seguidos reduzem pela metade, três sucessos dobram. Sem isso
  o app simplesmente nunca termina um envio no 2G. **Pendente (T061).**
- Backoff exponencial com jitter total — **pendente (T061)**: `atrasoDeRetentativa` existe e
  não é usado. **Nunca desista permanentemente de uma leitura.**
- Só sincronize com `isInternetReachable === true`. Só `isConnected` dá verdadeiro em portal
  cativo rural, e aí o envio falha em silêncio. Sonda de rede **pendente (T031)**:
  `expo-network` ainda não está instalado.
- Uma requisição em voo por vez. Paralelismo piora a vazão no 2G.
- O botão "Enviar agora" é obrigatório e precisa estar visível. Trabalho de fundo é
  cortesia opcional nesses aparelhos, nunca o caminho principal.
- Perder uma leitura é defeito crítico. Entregar uma leitura duplicada é comportamento
  esperado, absorvido pela chave natural no servidor.

## Segurança

Nenhuma chave de serviço com privilégio administrativo existe no aplicativo. O acesso é do
usuário, com RLS negando por padrão. Log nunca contém dado pessoal nem coordenada.

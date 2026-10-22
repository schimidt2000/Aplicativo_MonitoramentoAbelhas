# Research: Envio para a nuvem e painel das pesquisadoras (frente do servidor)

Decisões desta frente, o que veio do plano aceito pelo dono do produto (2026-09-16) e
onde esta frente **se desviou** dele, com o motivo. Fecha com os achados que não são
desta frente mas foram encontrados nela.

## Decisões

### R-001 — Supabase em `sa-east-1`, escrito como Postgres puro *(do plano aceito)*

Único que dá RLS de verdade, residência no Brasil e zero operação, de graça. Os scripts
usam só Postgres (sem extensão) e o esquema `auth` do Supabase (`auth.uid()`,
`auth.users`). Sair é `pg_dump` mais reescrever as políticas. Nada foi implantado; a
hospedagem ainda não foi decidida formalmente. O gatilho de troca por PocketBase
continua o do plano (VM da universidade com hostname público; pausa do projeto custando
uma demonstração).

### R-002 — Nomes do servidor em inglês *(desvio do plano aceito)*

O plano aceito escrevia o esquema em português (`leitura`, `apicultor`, `no_sensor`). O
dono do produto pediu depois os nomes em **inglês, como o banco local**
(`reading`, `node`, `apiary`, `hive`). Mesma língua nos dois lados reduz o erro de
mapeamento no ponto mais perigoso (o envio). O mapeamento está em
[data-model.md](./data-model.md). Texto de tela continua em pt-BR.

### R-003 — Resgate do código por função SQL, sem Edge Function nem hook de token *(desvio)*

O plano recomendava `signInAnonymously` + Edge Function `resgatar-codigo` + Custom Access
Token Hook injetando `apicultor_id` no JWT, com um "escape" pré-escrito se o claim não
funcionasse em dois dias.

Adotado: `signInAnonymously` (mantido) + **`public.redeem_project_code`**, função
`SECURITY DEFINER` chamada por `POST /rest/v1/rpc/...`, que grava `phone_link(user_id,
beekeeper_id)`. As políticas descobrem o apicultor por `private.auth_beekeeper()`, uma
consulta por chave primária avaliada uma vez por comando (`(select …)`, initPlan).

Por quê:
- **Sem claim velho.** Um claim injetado no JWT só aparece no PRÓXIMO token: logo depois
  de resgatar o código, o celular ainda teria um token sem apicultor e receberia zero
  linhas — exatamente a falha silenciosa que o plano apontava como o maior risco.
- **Duas peças a menos** (Edge Function em Deno e hook), cada uma com seu jeito de falhar
  em silêncio.
- **Testável num Postgres puro**: `servidor/teste/rls.sql` exercita a função que o
  celular chama, não uma imitação dela.

Custo: uma consulta indexada a `phone_link` por comando. Para o volume do projeto, ruído.

### R-004 — Um código ativo por apicultor, reutilizável *(interpretação, precisa de clarify)*

A spec diz "credencial de uso único" e, nos casos de borda, que o celular reinstalado e o
segundo celular do mesmo apicultor funcionam digitando o código de novo. As duas coisas
não cabem juntas se "uso único" for "um resgate só". Adotado: o código identifica o
**apicultor**, liga quantos celulares forem preciso, e é **revogado** quando a
pesquisadora gera outro (`issue_project_code`). Celulares já ligados continuam ligados.
O servidor guarda só `sha256(código || ':' || pepper)`; o pepper é gerado dentro do banco
na primeira execução e nunca passa pelo repositório. → T035 (`/speckit-clarify`).

### R-005 — Limite de tentativas (FR-013)

- O dígito verificador barra o erro de digitação **no celular**; o que chega ao servidor
  errado é código bem formado e inexistente.
- Por celular (usuário anônimo): 5 erros na última hora → `throttled`; 10 erros em 24 h →
  `locked` até expirar a janela. Nem o código certo passa enquanto espera — senão o
  limite viraria oráculo.
- No servidor inteiro: 300 erros na última hora → `throttled` para todos.
- **Limite honesto do desenho:** o contador por celular é por usuário anônimo, e criar
  usuário anônimo novo é barato. A defesa contra adivinhação distribuída é o espaço
  (32⁷ ≈ 34 bilhões de corpos válidos para algumas dezenas de códigos ativos), o teto
  global e o limite de criação de usuário anônimo por IP do Supabase Auth, que precisa
  ser configurado ao criar o projeto (quickstart). O teto global permite que alguém
  bloqueie o resgate de todos por uma hora; aceitável para o tamanho do projeto e
  registrado aqui.
- A função nunca lança por código errado: lançar desfaria o registro da tentativa.

### R-006 — Cadastro (Trilha B) por uma função, não por upsert do PostgREST *(desvio)*

`public.upsert_registry(p_apiaries, p_hives, p_nodes)`, `SECURITY INVOKER` (a RLS vale lá
dentro), num pedido só — importa no 2G. Faz o que o upsert do PostgREST não faz bem:
chave composta `(beekeeper_id, id)` sem o celular mandar `beekeeper_id`, e **última
escrita vence por `updated_ms`** (`ON CONFLICT … DO UPDATE … WHERE atual.updated_ms <=
novo.updated_ms`), então um celular atrasado não desfaz o que outro gravou depois.
Tentar gravar o nó de outro apicultor viola a RLS e falha inteiro.

As leituras (Trilha A) continuam como o plano mandava: `POST /rest/v1/reading?on_conflict=
device_id,seq` com `Prefer: resolution=ignore-duplicates` — `ON CONFLICT DO NOTHING`,
sem código de servidor no caminho quente.

### R-007 — `AVG` do SQLite e do Postgres dão o mesmo inteiro

O celular faz `CAST(AVG(x) AS INTEGER)` (ponto flutuante, trunca para zero); o servidor
faz `trunc(avg(x))::integer` (`numeric` exato). A soma de inteiros abaixo de 2⁵³ é exata
em ponto flutuante, e a divisão IEEE é corretamente arredondada: se o quociente exato é
inteiro, o resultado é exatamente esse inteiro; se não é, a parte fracionária é no mínimo
1/n (n = leituras do dia, ≤ ~10³), muito acima do erro de arredondamento (~10⁻¹²) para
valores na casa de 10⁴. Logo o truncamento coincide. O caso de referência inclui média
negativa com ,5 (−149,5 → −149) para prender o sentido do truncamento.

### R-008 — Resumo e contadores mantidos por gatilho

Gatilho `AFTER INSERT … FOR EACH STATEMENT` com tabela de transição: um lote de 500
leituras recalcula só os dias que tocou, uma vez. Com `ON CONFLICT DO NOTHING`, a tabela de
transição contém só as linhas realmente inseridas — reenviar não recalcula nada.
`node_stats` guarda contagem, excluídas e última leitura por nó para a visão do conjunto:
dia só com gás inválido não tem linha em `reading_daily`, então somar o resumo
**esconderia** essas leituras (mentira por omissão).

### R-009 — Sem `@supabase/supabase-js` no app *(do plano aceito)*

`fetch` + `zod` (já dependência). Renovação de sessão, guarda de portal e mapeamento do fio
são nossos (`src/nuvem/supabase/`), testados com `fetch` falso. `check:fronteira` e
`tests/encanamento.test.ts` reprovam `@supabase/*` no `package.json` do app. No painel, o
SDK cabe (outra frente).

### R-010 — Nenhuma dependência instalada nesta frente *(desvio)*

O plano pedia `expo-network` e `expo-secure-store`. Não foram instalados: instalar mexeria
no `node_modules` compartilhado com o repositório principal, e a nuvem real ainda não está
ligada a lugar nenhum. O código já tem os encaixes:
- `sondaDeRede?: () => Promise<boolean | null>` no cliente (camada 1 da guarda) → T031;
- `Cofre` (ler/gravar/apagar) com `cofreEmMemoria()` → T030.
Guardar a sessão no SQLite ou no `localStorage` foi rejeitado: violaria FR-015.

### R-011 — Portal cativo, na prática

Com TLS, a rede de praça raramente consegue devolver um 200 com HTML: o mais comum é o
TLS falhar, e o `fetch` lança. O cliente diz `sem-rede`, e o texto já orienta ("Se o Wi-Fi
pede cadastro no navegador, abra o navegador primeiro"). Quando o portal responde
(HTTP, ou certificado aceito), três camadas pegam: resposta vinda de outro endereço; 200
que não é o JSON do Auth na verificação; e **só 201 confirma um lote**. Este último é o que
importa: confirmar o que não foi gravado marcaria `synced_at` e a leitura nunca mais
subiria — perda silenciosa.

### R-012 — Apagamento por LGPD

`private.erase_beekeeper(id, pedido, data)` é a única porta de DELETE em `reading`: liga
uma marca **local à transação** que o gatilho append-only aceita, e só fora dos papéis da
API. Apaga leituras, resumos, cadastro, vínculos, códigos e os usuários anônimos dos
celulares dele; registra em `private.erasure_log` sem dado pessoal (id pseudônimo, número
do pedido, contagens, quem executou). O procedimento (`servidor/lgpd/apagar-apicultor.sql`)
mostra o que vai apagar e pede confirmação digitada. Backups que ainda contêm o apicultor
expiram no ritmo do backup; o procedimento manda registrar isso.

### R-013 — `t_utc_ms` aceita nulo no servidor

A feature 003 introduz leitura sem hora conhecida (FR-016 da 003). O servidor já aceita
nulo e deixa essas leituras fora do resumo (FR-017 da 003) e as conta em
`node_stats.unknown_time_count`.

**Atualização na integração de 2026-10-21.** Com a 003 integrada, o celular passa a mandar
`LeituraParaEnvio.tUtcMs: number | null` (pendência T046 da 003): leitura sem hora sai com
`t_utc_ms` nulo e `t_quality` 3. Conferido que `public.reading.t_utc_ms` não tem `not null`,
então **o esquema não mudou**; o que faltava era prova. `servidor/teste/rls.sql` agora grava,
como o celular de B, três leituras com `t_utc_ms` nulo e confere que entram, que somam em
`unknown_time_count` e que não criam resumo diário (nem resumo com dia nulo).

Decisão: sobe a hora **efetiva no momento do envio** (`loteNaoEnviado` lê da VIEW
`leitura_hora`). Uma correção de hora feita no celular depois
do envio (nova versão em `hora_versao`) não sobe, porque `reading` no servidor é append-only
e não tem política de UPDATE (Princípio III). Levar correções ao servidor exige uma tabela
própria de correções de hora, como a `hora_correcao` do celular — fica para uma feature
futura, e a outra metade da T046 continua aberta.

Valores de `t_quality` (os mesmos do celular, `src/core/hora/tipos.ts`): 0 rtc · 1 ancorada ·
2 estimada · 3 desconhecida.

### R-014 — Visões para o painel

`hive_overview` (uma linha por colmeia), `hive_daily` (resumos por colmeia e época) e
`hive_reading` (leituras para a planilha), todas `security_invoker`. A frente do painel
escreveu os nomes como suposição em `painel/src/dados/contrato.ts`; alinhar com
[contracts/servidor.md](./contracts/servidor.md) é T041 — feito na integração de 2026-10-21.

## Achados (fora do escopo desta frente, registrados)

- **A-1 — troca de sensor no meio do dia quebra o recálculo do CELULAR.** No celular,
  `reading_daily` tem chave `(node_id, day)`, mas `recalcularResumos` agrupa por
  `(node_id, day, sensor_epoch)`. Duas épocas no mesmo dia geram duas linhas para a mesma
  chave e o `INSERT` lança. `coleta.ts` captura e mostra "Não consegui salvar" — embora as
  leituras estejam salvas — e, como o dia problemático continua no banco, TODA coleta
  seguinte daquele nó repete o aviso e os resumos ficam congelados. **Latente hoje**:
  nenhum caminho do app muda `sensor_epoch` (sempre 1). Vira defeito no dia em que existir
  "troquei o sensor". O servidor já usa `(device_id, day, sensor_epoch)`.
  `tests/resumo-golden.test.ts` documenta com `it.fails`. Corrigir exige migração, e o
  módulo de migrações que o plano previa na Fatia 0 não existe → T012, T060.
- **A-2 — `temp_p5`/`temp_p95` são MIN/MAX**, nos dois lados. O nome promete percentil.
  O servidor espelha para o caso de referência bater. → T070.
- **A-3 — o "dia" é o dia UTC** nos dois lados (vira às 21h em Brasília). Consistente;
  mudar exige os dois lados e o caso de referência juntos.
- **A-4 — motor de envio**: o lote adaptativo recomeça em 100 a cada toque (a função
  retorna na primeira falha), `atrasoDeRetentativa` existe mas não é usado, e um nó
  recusado para sempre bloqueia os outros (`proximoNoComPendentes` ordena por
  `node_id`). → T061, T062.
- **A-5 — cursor do cadastro** sobrevive a desligar e ligar o celular a OUTRO apicultor:
  o cadastro não seria reenviado e as leituras seriam recusadas. → T036. Zerar o cursor
  **não basta**: `cadastroAlteradoDesde` manda TODOS os nós a cada envio, e o nó que já é
  do apicultor anterior no servidor faz `upsert_registry` falhar inteiro (RLS), então o
  celular passado a outra pessoa para em `recusado` para sempre. T036 precisa decidir o
  que acontece com os nós do vínculo anterior (revisão de 2026-10-21).
- **A-6 — Fatia 0 parcial**: i18n das cinco telas e migrações por `user_version` não
  foram entregues; a 001 continua sem `tasks.md`. → T011, T012, T013.
- **A-7 — código de demonstração inválido**: a nuvem simulada usava `BEE7-K3M9`, que não
  passa no dígito verificador. Corrigido para `BEE7-K3M6` (`servidor/golden/codigos.json`).
- **A-8 — cursor do cadastro tirado DEPOIS da resposta** (`src/data/sync.ts`, Fatia 0):
  apiário ou colmeia gravados enquanto o pedido esperava a rede ficavam abaixo do cursor e
  nunca subiam; o nó apontando para a colmeia nova faria `upsert_registry` falhar por chave
  estrangeira em todo envio seguinte. Corrigido na revisão de 2026-10-21: a marca é tirada
  antes de ler o cadastro (`tests/envio.test.ts`). **Continua aberto**: o cursor é relógio
  do celular, e um relógio que volta para trás depois de uma edição ainda pula cadastro. A
  regra de `.claude/rules/sync.md` para a Trilha B é uma tabela `outbox`. → T072.

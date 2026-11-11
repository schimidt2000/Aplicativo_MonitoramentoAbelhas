# Quickstart: servidor e envio real (feature 002, Fatia 1)

## 1. Testar o servidor sem conta de nuvem

Precisa de Postgres 15+ instalado (`initdb`, `pg_ctl`, `psql` no PATH). Nada vai para a
rede: o banco sobe num diretório temporário, escuta só num socket local e é apagado no fim.

```bash
npm run servidor:teste
```

Roda, num banco novo: os quatro scripts, o caso de referência (`servidor/golden/`), o
teste de acesso e negação (`servidor/teste/rls.sql`) e as conferências de esquema e
privilégio. Depois reaplica os scripts num segundo banco e confere de novo. Cada
asserção sai como uma linha `ok: …`; a primeira falha para tudo com `FALHOU: …`.

## 2. Testar o app

```bash
npm run typecheck && npx vitest run && npm run check:fronteira
```

Sem configuração de nuvem, o app usa a **nuvem simulada**. Código de demonstração para
"Ligar o celular ao projeto": `BEE7-K3M6` (aparece na própria tela, só no modo simulado).

## 3. Ligar uma nuvem de verdade (quando a hospedagem for decidida)

**Situação em 2026-11-11:** existe um projeto Supabase com o esquema aplicado e a entrada
anônima ligada, e o `.env.local` do app e do painel apontam para ele. Mas o banco responde
na região `us-east-1` (visto pelo endereço público), não em `sa-east-1`: o passo 1 e a T032
continuam abertos. O cadastro público por e-mail ainda está ligado (passo 2).

O passo 4 foi conferido em 2026-11-11 com uma **conta de teste**: ela entrou no painel
(rodando em `localhost`), viu a Visão geral e baixou a planilha de 29/09 a 28/10/2026
(3.239 leituras de 3 colmeias; o cabeçalho confere com as linhas, nenhuma leitura repetida,
voláteis ausentes como célula vazia). Falta trocar a conta de teste pela da pesquisadora e
apagar a de teste. Os dados desse projeto são quase todos de demonstração: a `003_seed.sql`
mais envios do app com leituras de exemplo. Na planilha conferida todos os nós sensores são
simulados (`DEMO-A1`, `DEMO-A2` e o `A1B2C3D4E5F60002` do transporte simulado).

No mesmo dia, depois da planilha, o app no Chrome foi ligado ao projeto pelo código de
demonstração do apicultor A e enviou as primeiras leituras da placa real: 28 (13 da coleta de 04/11 e 15 de hoje), com
`src = cable`, todas sem hora (ver `docs/integracao-firmware.md`, "Segunda coleta com a
placa real"). Elas contam no painel, mas não entram na planilha.

1. Criar o projeto Supabase na região **São Paulo (`sa-east-1`)**.
2. Authentication → Providers: ligar **Anonymous sign-ins**. Desligar cadastro público
   por e-mail (as pesquisadoras são criadas à mão). Em Rate Limits, limitar criação de
   usuário anônimo por IP (research.md R-005).
3. SQL Editor, nesta ordem: `servidor/001_schema.sql`, `servidor/002_rls.sql`,
   `servidor/004_lgpd.sql`. `003_seed.sql` só num projeto de demonstração.
4. Authentication → Users: criar a conta de cada pesquisadora. Depois, no SQL Editor:
   `select private.add_researcher('<e-mail>', '<id do projeto>');`
5. Gerar o código de cada apicultor (pela pesquisadora, ou no SQL Editor):
   `select private.issue_project_code('<id do apicultor>');` — anote e entregue; o banco
   não guarda o código claro.
6. No app de campo, criar `.env.local` (fora do git) com:
   ```
   EXPO_PUBLIC_SUPABASE_URL=https://<projeto>.supabase.co
   EXPO_PUBLIC_SUPABASE_ANON_KEY=<chave pública: anon ou sb_publishable_…>
   ```
   **Nunca** a `service_role` / `sb_secret_`: o app recusa e volta para a simulada.
7. Demonstração da Fatia 1: digitar o código, enviar, conferir as linhas no editor;
   enviar de novo e ver que `select count(*) from reading` não muda.

## 4. Apagar os dados de um apicultor (LGPD)

Fora do app, por quem administra o banco, a partir de um pedido registrado:

```bash
psql "$BANCO" -v beekeeper_id='<uuid>' -v ticket='LGPD-2026-001' \
     -v requested_at='2026-10-21' -f servidor/lgpd/apagar-apicultor.sql
```

O script mostra o que vai apagar, pede `APAGAR` digitado e registra em
`private.erasure_log`, sem dado pessoal.

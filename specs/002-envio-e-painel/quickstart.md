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

Nada disto foi feito ainda.

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

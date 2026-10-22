-- =============================================================================
-- Apagamento dos dados de um apicultor a pedido dele (LGPD, FR-039).
--
-- FORA DO APLICATIVO. Executado por quem administra o banco, a partir de um
-- pedido registrado (e-mail, ofício, termo assinado). Nunca é função do app.
--
-- Uso, com psql conectado ao banco como dono (no Supabase: a connection
-- string "postgres" do projeto, que NUNCA vai para o app nem para o painel):
--
--   psql "$BANCO" \
--     -v beekeeper_id='<uuid do apicultor>' \
--     -v ticket='LGPD-2026-001' \
--     -v requested_at='2026-10-21' \
--     -f servidor/lgpd/apagar-apicultor.sql
--
-- O script mostra o que vai apagar, pede confirmação digitada e só então
-- apaga. Tudo numa transação: ou apaga tudo, ou nada.
--
-- Depois de apagar:
--   1. Guarde o número do pedido e a saída deste script junto do pedido.
--   2. Os backups (pg_dump semanal no drive da universidade) ainda contêm o
--      apicultor até expirarem. Registre a data em que o último backup com
--      ele expira, e não restaure backup anterior ao apagamento sem repetir
--      este procedimento.
--   3. O celular dele continua com a cópia local: é dado dele, no aparelho
--      dele (constituição, Restrições de Plataforma e Dados).
-- =============================================================================

\set ON_ERROR_STOP on

\if :{?beekeeper_id}
\else
  \echo 'Faltou -v beekeeper_id=<uuid>'
  \quit
\endif
\if :{?ticket}
\else
  \echo 'Faltou -v ticket=<número do pedido>'
  \quit
\endif
\if :{?requested_at}
\else
  \echo 'Faltou -v requested_at=<data do pedido, AAAA-MM-DD>'
  \quit
\endif

\echo
\echo 'Vai apagar, do servidor, tudo deste apicultor:'
select b.name as apicultor, p.name as projeto,
       (select count(*) from public.reading r where r.beekeeper_id = b.id) as leituras,
       (select count(*) from public.node n where n.beekeeper_id = b.id) as nos_sensores,
       (select count(*) from public.hive h where h.beekeeper_id = b.id) as colmeias,
       (select count(*) from public.phone_link l where l.beekeeper_id = b.id) as celulares
  from public.beekeeper b join public.project p on p.id = b.project_id
 where b.id = :'beekeeper_id';

\prompt 'Digite APAGAR para confirmar: ' confirmacao
select (:'confirmacao' = 'APAGAR') as confirmado \gset
\if :confirmado
  begin;
  select private.erase_beekeeper(:'beekeeper_id', :'ticket', :'requested_at'::date) as resultado;
  commit;
  \echo 'Apagado. Registro em private.erasure_log.'
\else
  \echo 'Nada foi apagado.'
\endif

-- =============================================================================
-- O esquema em si: o que tem de valer em QUALQUER banco com os scripts
-- aplicados, inclusive depois de reaplicá-los. rodar.sh roda este arquivo no
-- banco de teste e num segundo banco onde os scripts foram aplicados duas vezes.
-- =============================================================================

select test.eq((select count(*) from information_schema.columns
                 where table_schema in ('public', 'private')
                   and column_name ~* '(^|_)(lat|lon|lng|latitude|longitude|coord|geo)'),
               0::bigint, 'nenhuma coluna de latitude ou longitude (FR-022)');
select test.eq((select count(*) from pg_policies
                 where schemaname = 'public' and tablename = 'reading'
                   and cmd in ('UPDATE', 'DELETE', 'ALL')), 0::bigint,
               'nenhuma política de UPDATE/DELETE em reading');
select test.eq((select count(*) from pg_class c join pg_namespace n on n.oid = c.relnamespace
                 where n.nspname = 'public' and c.relkind = 'r' and not c.relrowsecurity),
               0::bigint, 'RLS ligada em toda tabela de public');
select test.eq((select count(*) from pg_trigger
                 where tgrelid = 'public.reading'::regclass
                   and tgname in ('reading_no_update_delete', 'reading_no_truncate')),
               2::bigint, 'gatilhos append-only presentes em reading');

-- Privilégios: anon não tem NADA; authenticated tem só o que 002_rls.sql lista.
select test.eq((select count(*) from pg_class c join pg_namespace n on n.oid = c.relnamespace
                 where n.nspname in ('public', 'private') and c.relkind in ('r', 'v', 'm')
                   and (has_table_privilege('anon', c.oid, 'SELECT')
                        or has_table_privilege('anon', c.oid, 'INSERT')
                        or has_table_privilege('anon', c.oid, 'UPDATE')
                        or has_table_privilege('anon', c.oid, 'DELETE'))),
               0::bigint, 'anon não tem privilégio em tabela nem visão');
select test.eq((select count(*) from pg_proc p join pg_namespace n on n.oid = p.pronamespace
                 where n.nspname in ('public', 'private')
                   and has_function_privilege('anon', p.oid, 'EXECUTE')),
               0::bigint, 'anon não executa função nenhuma');
select test.eq((select string_agg(n.nspname || '.' || p.proname, ', ' order by n.nspname, p.proname)
                  from pg_proc p join pg_namespace n on n.oid = p.pronamespace
                 where n.nspname in ('public', 'private')
                   and has_function_privilege('authenticated', p.oid, 'EXECUTE')),
               'private.auth_beekeeper, private.auth_projects, private.researcher_beekeepers, '
               || 'public.issue_project_code, public.redeem_project_code, '
               || 'public.upsert_registry, public.utc_day',
               'authenticated executa só as funções listadas');
select test.eq((select count(*) from pg_class c join pg_namespace n on n.oid = c.relnamespace
                 where n.nspname = 'public' and c.relname = 'reading'
                   and (has_table_privilege('authenticated', c.oid, 'UPDATE')
                        or has_table_privilege('authenticated', c.oid, 'DELETE')
                        or has_table_privilege('authenticated', c.oid, 'TRUNCATE'))),
               0::bigint, 'authenticated não tem UPDATE/DELETE em reading');
select test.eq((select count(*) from pg_class c join pg_namespace n on n.oid = c.relnamespace
                 where n.nspname in ('public', 'private')
                   and c.relname in ('project_code', 'phone_link', 'code_attempt', 'secret', 'erasure_log')
                   and has_table_privilege('authenticated', c.oid, 'SELECT')),
               0::bigint, 'código, vínculo, tentativas, pepper e registro LGPD são ilegíveis');

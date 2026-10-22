-- =============================================================================
-- Bee-sertão — acesso (feature 002, Fatia 1)
--
-- Nega por padrão (FR-018). Quem pode o quê:
--
--   papel             | o que vê / faz
--   ------------------+----------------------------------------------------------
--   anon              | nada. Nenhuma tabela, nenhuma função.
--   celular ligado    | (usuário anônimo do Supabase Auth com phone_link)
--                     | escreve o PRÓPRIO cadastro e as PRÓPRIAS leituras;
--                     | lê só o que é dele. Nunca UPDATE/DELETE em leitura.
--   celular não ligado| só resgata código (redeem_project_code).
--   pesquisadora      | lê tudo dos apicultores dos projetos dela; gera código.
--   service_role      | não é usado pelo app nem pelo painel (FR-023).
--
-- O teste de aceitação é a NEGAÇÃO: servidor/teste/rls.sql liga dois
-- apicultores e confere que o celular de A recebe ZERO linhas de B. RLS
-- filtra em silêncio; uma política que "funciona" no caso feliz pode estar
-- vazando, e só o teste de negação mostra.
-- =============================================================================

-- -----------------------------------------------------------------------------
-- Quem é quem. SECURITY DEFINER para ler phone_link/researcher_project sem
-- abrir essas tabelas; search_path vazio contra sequestro de função.
-- -----------------------------------------------------------------------------
create or replace function private.auth_beekeeper()
returns uuid
language sql stable
security definer
set search_path = ''
as $$
  select pl.beekeeper_id from public.phone_link pl where pl.user_id = auth.uid()
$$;

create or replace function private.auth_projects()
returns setof uuid
language sql stable
security definer
set search_path = ''
as $$
  select rp.project_id from public.researcher_project rp where rp.user_id = auth.uid()
$$;

-- Apicultores visíveis à pesquisadora que chama.
create or replace function private.researcher_beekeepers()
returns setof uuid
language sql stable
security definer
set search_path = ''
as $$
  select b.id
    from public.beekeeper b
    join public.researcher_project rp on rp.project_id = b.project_id
   where rp.user_id = auth.uid()
$$;

-- O celular nunca manda beekeeper_id: o servidor decide de quem é.
alter table public.reading   alter column beekeeper_id set default private.auth_beekeeper();
alter table public.apiary    alter column beekeeper_id set default private.auth_beekeeper();
alter table public.hive      alter column beekeeper_id set default private.auth_beekeeper();
alter table public.node      alter column beekeeper_id set default private.auth_beekeeper();

-- -----------------------------------------------------------------------------
-- RLS ligada em TODA tabela de public. Tabela sem política = ninguém vê.
-- -----------------------------------------------------------------------------
alter table public.project            enable row level security;
alter table public.beekeeper          enable row level security;
alter table public.project_code       enable row level security;
alter table public.phone_link         enable row level security;
alter table public.researcher_project enable row level security;
alter table public.apiary             enable row level security;
alter table public.hive               enable row level security;
alter table public.node               enable row level security;
alter table public.reading            enable row level security;
alter table public.reading_daily      enable row level security;
alter table public.node_stats         enable row level security;

-- Políticas recriáveis: derruba as nossas antes de criar.
do $$
declare p record;
begin
  for p in select schemaname, tablename, policyname from pg_policies where schemaname = 'public'
  loop
    execute format('drop policy %I on %I.%I', p.policyname, p.schemaname, p.tablename);
  end loop;
end $$;

-- `(select f())` em vez de `f()`: o Postgres avalia uma vez por consulta
-- (initPlan), não uma vez por linha. Em 100 mil leituras a diferença é real.

-- project / beekeeper / researcher_project ------------------------------------
create policy researcher_reads_project on public.project
  for select to authenticated
  using (id in (select private.auth_projects()));

create policy researcher_reads_beekeeper on public.beekeeper
  for select to authenticated
  using (id in (select private.researcher_beekeepers()));

create policy beekeeper_reads_self on public.beekeeper
  for select to authenticated
  using (id = (select private.auth_beekeeper()));

create policy researcher_reads_own_membership on public.researcher_project
  for select to authenticated
  using (user_id = (select auth.uid()));

-- apiary / hive / node: o celular escreve o próprio cadastro ------------------
create policy beekeeper_reads_apiary on public.apiary
  for select to authenticated using (beekeeper_id = (select private.auth_beekeeper()));
create policy beekeeper_inserts_apiary on public.apiary
  for insert to authenticated with check (beekeeper_id = (select private.auth_beekeeper()));
create policy beekeeper_updates_apiary on public.apiary
  for update to authenticated
  using (beekeeper_id = (select private.auth_beekeeper()))
  with check (beekeeper_id = (select private.auth_beekeeper()));
create policy researcher_reads_apiary on public.apiary
  for select to authenticated using (beekeeper_id in (select private.researcher_beekeepers()));

create policy beekeeper_reads_hive on public.hive
  for select to authenticated using (beekeeper_id = (select private.auth_beekeeper()));
create policy beekeeper_inserts_hive on public.hive
  for insert to authenticated with check (beekeeper_id = (select private.auth_beekeeper()));
create policy beekeeper_updates_hive on public.hive
  for update to authenticated
  using (beekeeper_id = (select private.auth_beekeeper()))
  with check (beekeeper_id = (select private.auth_beekeeper()));
create policy researcher_reads_hive on public.hive
  for select to authenticated using (beekeeper_id in (select private.researcher_beekeepers()));

create policy beekeeper_reads_node on public.node
  for select to authenticated using (beekeeper_id = (select private.auth_beekeeper()));
create policy beekeeper_inserts_node on public.node
  for insert to authenticated with check (beekeeper_id = (select private.auth_beekeeper()));
create policy beekeeper_updates_node on public.node
  for update to authenticated
  using (beekeeper_id = (select private.auth_beekeeper()))
  with check (beekeeper_id = (select private.auth_beekeeper()));
create policy researcher_reads_node on public.node
  for select to authenticated using (beekeeper_id in (select private.researcher_beekeepers()));

-- reading: só INSERT e SELECT. -------------------------------------------------
-- O WITH CHECK exige que o NÓ já exista e seja do mesmo apicultor. É por isso
-- que o celular manda o cadastro ANTES das leituras (src/data/sync.ts): na
-- ordem inversa o servidor recusa, e o sintoma parece problema de
-- autenticação.
create policy beekeeper_inserts_reading on public.reading
  for insert to authenticated
  with check (
    beekeeper_id = (select private.auth_beekeeper())
    and exists (select 1 from public.node n
                 where n.device_id = reading.device_id
                   and n.beekeeper_id = (select private.auth_beekeeper()))
  );

create policy beekeeper_reads_reading on public.reading
  for select to authenticated
  using (beekeeper_id = (select private.auth_beekeeper()));

create policy researcher_reads_reading on public.reading
  for select to authenticated
  using (beekeeper_id in (select private.researcher_beekeepers()));

-- Sem política de UPDATE e sem política de DELETE em `reading`. Isto é a
-- evidência do Princípio III no servidor: append-only é propriedade do banco,
-- não disciplina de quem escreve o cliente. O gatilho de 001_schema.sql é a
-- segunda camada, e vale até para o dono do banco.

-- reading_daily / node_stats: só leitura; quem escreve é o gatilho definer. ---
create policy beekeeper_reads_daily on public.reading_daily
  for select to authenticated using (beekeeper_id = (select private.auth_beekeeper()));
create policy researcher_reads_daily on public.reading_daily
  for select to authenticated using (beekeeper_id in (select private.researcher_beekeepers()));

create policy beekeeper_reads_stats on public.node_stats
  for select to authenticated using (beekeeper_id = (select private.auth_beekeeper()));
create policy researcher_reads_stats on public.node_stats
  for select to authenticated using (beekeeper_id in (select private.researcher_beekeepers()));

-- project_code, phone_link: RLS ligada e NENHUMA política. Só as funções
-- definer abaixo tocam nelas.

-- -----------------------------------------------------------------------------
-- Resgate do código do projeto (ligar o celular ao projeto).
--
-- POST /rest/v1/rpc/redeem_project_code  {"p_code": "DEM0A1B4"}
--
-- Devolve sempre um objeto, nunca lança por código errado: lançar desfaria o
-- registro da tentativa, e o limite deixaria de contar.
--   {"status":"ok","beekeeper_name":...,"project_name":...}
--   {"status":"invalid"}     código não existe ou foi revogado
--   {"status":"throttled"}   5 erros na última hora (deste celular), ou
--                            muitos erros no servidor inteiro na última hora
--   {"status":"locked"}      10 erros nas últimas 24 h (deste celular)
--
-- Erro de digitação nunca chega aqui: o dígito verificador barra no celular
-- (FR-012). O que chega errado é código bem formado e inexistente.
-- -----------------------------------------------------------------------------
create or replace function public.redeem_project_code(p_code text)
returns jsonb
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
  v_uid uuid := auth.uid();
  v_code text := private.normalize_code(p_code);
  v_beekeeper uuid;
  v_fail_hour integer;
  v_fail_day integer;
  v_fail_global integer;
  v_result jsonb;
  c_limit_hour   constant integer := 5;
  c_limit_day    constant integer := 10;
  c_limit_global constant integer := 300;
begin
  if v_uid is null then
    raise exception 'sem usuário' using errcode = '28000';
  end if;

  -- Higiene: tentativas com mais de 7 dias não servem a limite nenhum.
  delete from private.code_attempt where attempted_at < now() - interval '7 days';

  select count(*) filter (where attempted_at > now() - interval '1 hour'),
         count(*)
    into v_fail_hour, v_fail_day
    from private.code_attempt
   where user_id = v_uid and not ok and attempted_at > now() - interval '24 hours';

  if v_fail_day >= c_limit_day then
    return jsonb_build_object('status', 'locked');
  end if;
  if v_fail_hour >= c_limit_hour then
    return jsonb_build_object('status', 'throttled');
  end if;

  select count(*) into v_fail_global
    from private.code_attempt
   where not ok and attempted_at > now() - interval '1 hour';
  if v_fail_global >= c_limit_global then
    return jsonb_build_object('status', 'throttled');
  end if;

  if private.code_is_valid(v_code) then
    select pc.beekeeper_id into v_beekeeper
      from public.project_code pc
     where pc.code_hash = private.hash_code(v_code) and pc.revoked_at is null;
  end if;

  if v_beekeeper is null then
    insert into private.code_attempt (user_id, ok) values (v_uid, false);
    return jsonb_build_object('status', 'invalid');
  end if;

  insert into private.code_attempt (user_id, ok) values (v_uid, true);
  insert into public.phone_link (user_id, beekeeper_id)
  values (v_uid, v_beekeeper)
  on conflict (user_id) do update
     set beekeeper_id = excluded.beekeeper_id, linked_at = now();

  select jsonb_build_object('status', 'ok',
                            'beekeeper_name', b.name,
                            'project_name', p.name)
    into v_result
    from public.beekeeper b join public.project p on p.id = b.project_id
   where b.id = v_beekeeper;
  return v_result;
end
$$;

-- -----------------------------------------------------------------------------
-- Cadastro do celular (Trilha B), num pedido só — importa no 2G.
--
-- POST /rest/v1/rpc/upsert_registry
--   {"p_apiaries":[...], "p_hives":[...], "p_nodes":[...]}
--
-- SECURITY INVOKER: as políticas de cima valem aqui dentro. Última escrita
-- vence por updated_ms; um celular atrasado não desfaz o que outro gravou
-- depois. Tentar gravar nó de outro apicultor viola a RLS e falha inteiro.
-- -----------------------------------------------------------------------------
create or replace function public.upsert_registry(
  p_apiaries jsonb default '[]'::jsonb,
  p_hives    jsonb default '[]'::jsonb,
  p_nodes    jsonb default '[]'::jsonb)
returns jsonb
language plpgsql
volatile
security invoker
set search_path = ''
as $$
declare
  v_bk uuid := private.auth_beekeeper();
  n_ap integer; n_hv integer; n_nd integer;
begin
  if v_bk is null then
    raise exception 'celular não ligado ao projeto' using errcode = '42501';
  end if;

  insert into public.apiary as a (beekeeper_id, id, name, municipality, state, updated_ms, deleted_ms)
  select v_bk, x.id, x.name, x.municipality, x.state, x.updated_ms, x.deleted_ms
    from jsonb_to_recordset(coalesce(p_apiaries, '[]'::jsonb))
      as x(id text, name text, municipality text, state text, updated_ms bigint, deleted_ms bigint)
  on conflict (beekeeper_id, id) do update
     set name = excluded.name, municipality = excluded.municipality,
         state = excluded.state, updated_ms = excluded.updated_ms,
         deleted_ms = excluded.deleted_ms
   where a.updated_ms <= excluded.updated_ms;
  get diagnostics n_ap = row_count;

  insert into public.hive as h
    (beekeeper_id, id, apiary_id, name, species, installed_at_ms, updated_ms, deleted_ms)
  select v_bk, x.id, x.apiary_id, x.name, x.species, x.installed_at_ms, x.updated_ms, x.deleted_ms
    from jsonb_to_recordset(coalesce(p_hives, '[]'::jsonb))
      as x(id text, apiary_id text, name text, species text, installed_at_ms bigint,
           updated_ms bigint, deleted_ms bigint)
  on conflict (beekeeper_id, id) do update
     set apiary_id = excluded.apiary_id, name = excluded.name, species = excluded.species,
         installed_at_ms = excluded.installed_at_ms, updated_ms = excluded.updated_ms,
         deleted_ms = excluded.deleted_ms
   where h.updated_ms <= excluded.updated_ms;
  get diagnostics n_hv = row_count;

  insert into public.node as n
    (device_id, beekeeper_id, hive_id, placement, period_s, sensor_epoch, calib_version,
     temp_offset_c100, updated_ms)
  select x.device_id, v_bk, x.hive_id, x.placement, coalesce(x.period_s, 900),
         coalesce(x.sensor_epoch, 1), coalesce(x.calib_version, 1),
         coalesce(x.temp_offset_c100, 0), coalesce(x.updated_ms, 0)
    from jsonb_to_recordset(coalesce(p_nodes, '[]'::jsonb))
      as x(device_id text, hive_id text, placement text, period_s integer,
           sensor_epoch integer, calib_version integer, temp_offset_c100 integer,
           updated_ms bigint)
  on conflict (device_id) do update
     set hive_id = excluded.hive_id, placement = excluded.placement,
         period_s = excluded.period_s, sensor_epoch = excluded.sensor_epoch,
         calib_version = excluded.calib_version,
         temp_offset_c100 = excluded.temp_offset_c100, updated_ms = excluded.updated_ms
   where n.updated_ms <= excluded.updated_ms;
  get diagnostics n_nd = row_count;

  return jsonb_build_object('apiaries', n_ap, 'hives', n_hv, 'nodes', n_nd);
end
$$;

-- -----------------------------------------------------------------------------
-- A pesquisadora gera o código de um apicultor do projeto dela. Devolve o
-- código claro uma única vez; o banco guarda só o hash.
-- -----------------------------------------------------------------------------
create or replace function public.issue_project_code(p_beekeeper_id uuid)
returns text
language plpgsql
volatile
security definer
set search_path = ''
as $$
begin
  if not exists (select 1 from private.researcher_beekeepers() b where b = p_beekeeper_id) then
    raise exception 'apicultor fora dos projetos desta pesquisadora' using errcode = '42501';
  end if;
  return private.issue_project_code(p_beekeeper_id);
end
$$;

-- -----------------------------------------------------------------------------
-- Visões para o painel. security_invoker: a RLS das tabelas de baixo vale
-- para quem consulta. Nenhuma coluna de voláteis na visão do conjunto
-- (FR-031): comparar COVs entre colmeias não é oferecido, e o jeito mais
-- barato de garantir isso é o dado nem chegar lá.
-- -----------------------------------------------------------------------------
drop view if exists public.hive_overview;
create view public.hive_overview with (security_invoker = true) as
select h.beekeeper_id,
       h.id                 as hive_id,
       h.name               as hive_name,
       h.species,
       a.id                 as apiary_id,
       a.name               as apiary_name,
       b.name               as beekeeper_name,
       coalesce(a.municipality, b.municipality) as municipality,
       coalesce(a.state, b.state)               as state,
       max(s.last_reading_ms)                   as last_reading_ms,
       coalesce(sum(s.reading_count), 0)::bigint      as reading_count,
       coalesce(sum(s.excluded_count), 0)::bigint     as excluded_count,
       coalesce(sum(s.unknown_time_count), 0)::bigint as unknown_time_count
  from public.hive h
  join public.apiary a    on a.beekeeper_id = h.beekeeper_id and a.id = h.apiary_id
  join public.beekeeper b on b.id = h.beekeeper_id
  left join public.node n       on n.beekeeper_id = h.beekeeper_id and n.hive_id = h.id
  left join public.node_stats s on s.device_id = n.device_id
 where h.deleted_ms is null
 group by h.beekeeper_id, h.id, h.name, h.species, a.id, a.name, b.name,
          a.municipality, b.municipality, a.state, b.state;

drop view if exists public.hive_daily;
create view public.hive_daily with (security_invoker = true) as
select n.beekeeper_id, n.hive_id, d.device_id, d.day, d.sensor_epoch,
       d.temp_p5, d.temp_med, d.temp_p95, d.rh_med, d.tvoc_med, d.tvoc_amp,
       d.batt_med, d.sample_count, d.excluded_count, n.temp_offset_c100
  from public.reading_daily d
  join public.node n on n.device_id = d.device_id;

drop view if exists public.hive_reading;
create view public.hive_reading with (security_invoker = true) as
select n.beekeeper_id, n.hive_id, r.device_id, r.seq, r.t_node, r.t_utc_ms, r.t_quality,
       r.sensor_epoch, r.calib_version, r.proto_ver, r.temp_c100, r.rh_x100,
       r.tvoc_ppb, r.eco2_ppm, r.aqi_uba, r.gas_status, r.batt_mv, r.flags,
       (r.gas_status is not null and r.gas_status <> 0) as excluded
  from public.reading r
  join public.node n on n.device_id = r.device_id;


-- -----------------------------------------------------------------------------
-- Dar acesso a uma pesquisadora. A conta é criada À MÃO no painel do Supabase
-- (Authentication > Users), sem cadastro público (FR-024); depois, no editor
-- SQL, como dono do banco:
--   select private.add_researcher('pesquisadora@universidade.br', '<project id>');
-- Não é exposta pela API.
-- -----------------------------------------------------------------------------
create or replace function private.add_researcher(p_email text, p_project_id uuid)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare v_user uuid;
begin
  select u.id into v_user from auth.users u where lower(u.email) = lower(p_email);
  if v_user is null then
    raise exception 'conta não encontrada: crie a conta no Supabase Auth primeiro'
      using errcode = '22023';
  end if;
  insert into public.researcher_project (user_id, project_id)
  values (v_user, p_project_id) on conflict do nothing;
end
$$;

-- =============================================================================
-- Privilégios. POR ÚLTIMO, depois de criado todo objeto: o Supabase concede
-- ALL em tabela, visão e função de public a anon/authenticated por padrão, e
-- o Postgres concede EXECUTE a PUBLIC em toda função nova. Revogar no começo
-- do arquivo deixaria passar o que é criado depois dele. Aqui tira tudo e
-- devolve o mínimo; a RLS vem por cima como segunda camada.
-- =============================================================================
revoke all on all tables    in schema public  from anon, authenticated;
revoke all on all sequences in schema public  from anon, authenticated;
revoke all on all functions in schema public  from public, anon, authenticated;
revoke all on all tables    in schema private from public, anon, authenticated;
revoke all on all functions in schema private from public, anon, authenticated;
revoke all on schema private from public, anon, authenticated;

-- Para que as POLÍTICAS (que rodam com o papel de quem consulta) possam chamar
-- os três "quem é quem" e o utc_day do índice.
grant usage on schema private to authenticated;
grant execute on function private.auth_beekeeper()        to authenticated;
grant execute on function private.auth_projects()         to authenticated;
grant execute on function private.researcher_beekeepers() to authenticated;
grant execute on function public.utc_day(bigint)          to authenticated;

grant usage on schema public to anon, authenticated;

-- Celular: cadastro (insert + update próprio, via upsert_registry) e leituras
-- (insert + select próprio). NENHUM update/delete em reading.
grant select, insert, update on public.apiary, public.hive, public.node to authenticated;
grant select, insert         on public.reading                          to authenticated;
-- Leitura para quem tem política de select, e as visões do painel.
grant select on public.project, public.beekeeper, public.researcher_project,
                public.reading_daily, public.node_stats,
                public.hive_overview, public.hive_daily, public.hive_reading
  to authenticated;
-- As três portas de escrita que não são tabela.
grant execute on function public.redeem_project_code(text)               to authenticated;
grant execute on function public.upsert_registry(jsonb, jsonb, jsonb)    to authenticated;
grant execute on function public.issue_project_code(uuid)                to authenticated;
-- project_code, phone_link, private.*: sem grant nenhum. Só funções definer.
-- anon: só USAGE no schema, para receber "permissão negada" em vez de "não existe".

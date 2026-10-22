-- =============================================================================
-- Bee-sertão — esquema do servidor (feature 002, Fatia 1)
--
-- Postgres puro. Roda igual num Supabase (sa-east-1) e num Postgres local de
-- teste (`servidor/teste/rodar.sh`). A única dependência do Supabase é o
-- esquema `auth` (auth.uid()), usado em 002_rls.sql; o teste local o simula em
-- `servidor/teste/supabase-local.sql`.
--
-- Nomes em INGLÊS, como no banco local do celular (`src/data/ddl.ts`).
--
-- Regras que este arquivo transforma em propriedade do banco:
--   * Princípio III: `reading` é append-only. Chave natural (device_id, seq);
--     boot_id é campo, NUNCA chave. UPDATE e DELETE são barrados por gatilho,
--     inclusive para o dono do banco; a única porta é o apagamento LGPD
--     (004_lgpd.sql), que deixa registro.
--   * Princípio VI: resumo diário só sobre amostras válidas, com a contagem de
--     excluídas ao lado; dia sem amostra válida NÃO gera linha (é a lacuna).
--   * Sigilo (constituição, Restrições): NENHUMA coluna de latitude ou
--     longitude, em nenhuma tabela. `npm run check:fronteira` reprova se
--     aparecer.
--
-- Idempotente o bastante para rodar num banco vazio. Não é migração: alterar
-- um banco já em uso pede arquivo novo (005_..., 006_...).
-- =============================================================================

create schema if not exists private;
comment on schema private is
  'Funções e tabelas que nunca são expostas pela API. O PostgREST só expõe public.';

-- -----------------------------------------------------------------------------
-- Segredos internos. Hoje só o "pepper" do hash do código do projeto. Gerado
-- DENTRO do banco na primeira execução: nunca passa pelo repositório.
-- -----------------------------------------------------------------------------
create table if not exists private.secret (
  name  text primary key,
  value text not null
);
insert into private.secret (name, value)
values ('code_pepper', replace(gen_random_uuid()::text || gen_random_uuid()::text, '-', ''))
on conflict (name) do nothing;

-- -----------------------------------------------------------------------------
-- Pessoas e projeto
-- -----------------------------------------------------------------------------
create table if not exists public.project (
  id         uuid primary key default gen_random_uuid(),
  name       text not null,
  created_at timestamptz not null default now()
);

-- Apicultor ou meliponicultor. Só nome e município: nada de CPF, RG, endereço
-- nem coordenada (FR-022, FR-037).
create table if not exists public.beekeeper (
  id           uuid primary key default gen_random_uuid(),
  project_id   uuid not null references public.project(id),
  name         text not null,
  municipality text,
  state        char(2),
  consent_at   timestamptz not null,
  created_at   timestamptz not null default now()
);
create index if not exists beekeeper_project on public.beekeeper (project_id);

-- Código do projeto. Guarda só o hash (sha256 com pepper), nunca o código
-- claro. Um código ativo por apicultor; gerar outro revoga o anterior.
-- O mesmo código liga quantos celulares forem preciso (reinstalação, segundo
-- aparelho): ver research.md R-004.
create table if not exists public.project_code (
  code_hash    bytea primary key,
  beekeeper_id uuid not null references public.beekeeper(id),
  created_at   timestamptz not null default now(),
  revoked_at   timestamptz
);
create unique index if not exists project_code_one_active
  on public.project_code (beekeeper_id) where revoked_at is null;

-- O vínculo celular ↔ apicultor. `user_id` é o usuário anônimo do Supabase
-- Auth daquele celular. Escrito só por `redeem_project_code`.
create table if not exists public.phone_link (
  user_id      uuid primary key,
  beekeeper_id uuid not null references public.beekeeper(id),
  linked_at    timestamptz not null default now()
);
create index if not exists phone_link_beekeeper on public.phone_link (beekeeper_id);

-- Tentativas de resgate de código, para o limite (FR-013).
create table if not exists private.code_attempt (
  id           bigint generated always as identity primary key,
  user_id      uuid not null,
  ok           boolean not null,
  attempted_at timestamptz not null default now()
);
create index if not exists code_attempt_user on private.code_attempt (user_id, attempted_at);
create index if not exists code_attempt_time on private.code_attempt (attempted_at);

-- Pesquisadora ↔ projeto. `user_id` é a conta da pesquisadora no Supabase
-- Auth, criada à mão (sem cadastro público, FR-024).
create table if not exists public.researcher_project (
  user_id    uuid not null,
  project_id uuid not null references public.project(id),
  primary key (user_id, project_id)
);

-- -----------------------------------------------------------------------------
-- Cadastro espelhado do celular (Trilha B). Chave composta com o apicultor:
-- o id local ('ap-1') não é único entre celulares de pessoas diferentes.
-- Última escrita vence por `updated_ms` (ver upsert_registry em 002_rls.sql).
-- Remoção é lógica (`deleted_ms`), como no celular.
-- -----------------------------------------------------------------------------
create table if not exists public.apiary (
  beekeeper_id uuid not null references public.beekeeper(id),
  id           text not null,
  name         text not null,
  municipality text,
  state        text,
  updated_ms   bigint not null,
  deleted_ms   bigint,
  primary key (beekeeper_id, id)
);

create table if not exists public.hive (
  beekeeper_id    uuid not null,
  id              text not null,
  apiary_id       text not null,
  name            text not null,
  species         text,
  installed_at_ms bigint,
  updated_ms      bigint not null,
  deleted_ms      bigint,
  primary key (beekeeper_id, id),
  foreign key (beekeeper_id, apiary_id) references public.apiary (beekeeper_id, id)
);

-- O nó sensor. `device_id` é a identidade ESTÁVEL do nó (contrato de
-- transporte); o `node_id` do celular é surrogate local e nunca sobe.
create table if not exists public.node (
  device_id        text primary key,
  beekeeper_id     uuid not null references public.beekeeper(id),
  hive_id          text,
  placement        text,
  period_s         integer not null default 900,
  sensor_epoch     integer not null default 1,
  calib_version    integer not null default 1,
  temp_offset_c100 integer not null default 0,
  updated_ms       bigint not null default 0,
  foreign key (beekeeper_id, hive_id) references public.hive (beekeeper_id, id)
);
create index if not exists node_beekeeper on public.node (beekeeper_id);

-- -----------------------------------------------------------------------------
-- A série. APPEND-ONLY.
-- -----------------------------------------------------------------------------

-- Dia UTC de um instante em ms, com a MESMA aritmética do celular: divisão
-- inteira que trunca em direção a zero (`t_utc_ms / 86400000` no SQLite).
create or replace function public.utc_day(t_utc_ms bigint)
returns integer
language sql immutable parallel safe
as $$ select (t_utc_ms / 86400000)::integer $$;

create table if not exists public.reading (
  device_id     text     not null references public.node(device_id),
  seq           bigint   not null,
  -- Desnormalizado para a RLS ser barata. Preenchido pelo servidor a partir
  -- de quem envia; o celular não manda (ver 002_rls.sql).
  beekeeper_id  uuid     not null references public.beekeeper(id),
  t_node        bigint   not null,
  -- Nulo é permitido de propósito: a feature 003 introduz leitura sem hora
  -- conhecida (FR-016 da 003), e o celular manda t_utc_ms nulo com
  -- t_quality 3 (desconhecida). Ver R-013 em specs/002-envio-e-painel/research.md.
  t_utc_ms      bigint,
  t_quality     smallint not null,
  temp_c100     integer,
  rh_x100       integer,
  tvoc_ppb      integer,
  eco2_ppm      integer,
  aqi_uba       smallint,
  gas_status    smallint,
  batt_mv       integer,
  flags         integer  not null default 0,
  boot_id       text,
  sensor_epoch  integer  not null default 1,
  calib_version integer  not null default 1,
  proto_ver     integer  not null,
  src           text     not null,
  received_at   timestamptz not null default now(),
  -- Chave natural, igual à do celular com device_id no lugar de node_id.
  -- É ela que faz reenviar o mesmo lote ser operação sem efeito.
  primary key (device_id, seq)
);
create index if not exists reading_beekeeper on public.reading (beekeeper_id);
create index if not exists reading_device_day
  on public.reading (device_id, public.utc_day(t_utc_ms));

comment on column public.reading.eco2_ppm is
  'eCO2 DERIVADO de voláteis pelo sensor. NÃO é CO2 e nunca deve ser rotulado assim.';
comment on column public.reading.boot_id is
  'Campo do payload. NUNCA faz parte de chave (Princípio III).';

-- Resumo diário, recalculado no servidor com a regra do celular
-- (`recalcularResumos` em src/data/ingest.ts). A chave inclui sensor_epoch:
-- nenhum agregado cruza troca de sensor. temp_p5/temp_p95 são MIN/MAX, como
-- no celular (achado A-2, specs/002-envio-e-painel/research.md).
create table if not exists public.reading_daily (
  device_id      text    not null references public.node(device_id),
  beekeeper_id   uuid    not null references public.beekeeper(id),
  day            integer not null,
  sensor_epoch   integer not null,
  temp_p5        integer,
  temp_med       integer,
  temp_p95       integer,
  rh_med         integer,
  tvoc_med       integer,
  tvoc_amp       integer,
  batt_med       integer,
  sample_count   integer not null,
  excluded_count integer not null,
  primary key (device_id, day, sensor_epoch)
);
create index if not exists reading_daily_beekeeper on public.reading_daily (beekeeper_id);

-- Contadores por nó, mantidos pelo gatilho de inserção. Servem a visão do
-- conjunto do painel sem varrer a série inteira a cada abertura (orçamento
-- do painel: p95 <= 1,5 s com 30 colmeias x 12 meses). Contam TODA leitura,
-- inclusive as de dia sem amostra válida, que não aparecem em reading_daily.
create table if not exists public.node_stats (
  device_id         text   primary key references public.node(device_id),
  beekeeper_id      uuid   not null references public.beekeeper(id),
  reading_count     bigint not null default 0,
  excluded_count    bigint not null default 0,
  unknown_time_count bigint not null default 0,
  last_reading_ms   bigint
);

-- -----------------------------------------------------------------------------
-- Append-only como propriedade do banco
-- -----------------------------------------------------------------------------
create or replace function private.reading_append_only()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  -- A única exceção: o apagamento LGPD fora de banda (004_lgpd.sql), que liga
  -- esta marca só dentro da própria transação e nunca como papel da API.
  if tg_op = 'DELETE'
     and coalesce(current_setting('bee.erasure_ticket', true), '') <> ''
     and current_user not in ('anon', 'authenticated') then
    return old;
  end if;
  raise exception 'reading é append-only: % não é permitido', tg_op
    using errcode = '42501',
          hint = 'Correção se faz por registro novo (Princípio III). Apagamento por LGPD: servidor/lgpd/.';
end
$$;

drop trigger if exists reading_no_update_delete on public.reading;
create trigger reading_no_update_delete
  before update or delete on public.reading
  for each row execute function private.reading_append_only();

drop trigger if exists reading_no_truncate on public.reading;
create trigger reading_no_truncate
  before truncate on public.reading
  for each statement execute function private.reading_append_only();

-- -----------------------------------------------------------------------------
-- Recálculo do resumo diário. PORTE LINHA A LINHA de recalcularResumos
-- (src/data/ingest.ts). Qualquer mudança aqui ou lá MUST passar pelo caso de
-- referência servidor/golden/resumo-diario.json nos dois lados.
--
--   SQLite                          Postgres
--   CAST(AVG(x) AS INTEGER)    ==   trunc(avg(x))::integer   (trunca p/ zero)
--   t_utc_ms / 86400000        ==   public.utc_day(t_utc_ms)
--
-- AVG do SQLite é ponto flutuante e o do Postgres é numeric exato; para
-- inteiros deste tamanho o truncamento coincide (research.md R-007).
-- Leitura sem hora (t_utc_ms nulo) fica fora, como a 003 exige.
-- -----------------------------------------------------------------------------
create or replace function private.recalc_daily(p_device_id text, p_days integer[])
returns void
language sql
security definer
set search_path = ''
as $$
  delete from public.reading_daily d
   where d.device_id = p_device_id and d.day = any (p_days);

  insert into public.reading_daily
    (device_id, beekeeper_id, day, sensor_epoch, temp_p5, temp_med, temp_p95,
     rh_med, tvoc_med, tvoc_amp, batt_med, sample_count, excluded_count)
  select r.device_id,
         r.beekeeper_id,
         public.utc_day(r.t_utc_ms) as day,
         r.sensor_epoch,
         min(r.temp_c100),
         trunc(avg(r.temp_c100))::integer,
         max(r.temp_c100),
         trunc(avg(r.rh_x100))::integer,
         trunc(avg(case when r.gas_status = 0 then r.tvoc_ppb end))::integer,
         max(case when r.gas_status = 0 then r.tvoc_ppb end)
           - min(case when r.gas_status = 0 then r.tvoc_ppb end),
         trunc(avg(r.batt_mv))::integer,
         sum(case when r.gas_status = 0 or r.gas_status is null then 1 else 0 end),
         sum(case when r.gas_status is not null and r.gas_status <> 0 then 1 else 0 end)
    from public.reading r
   where r.device_id = p_device_id
     and r.t_utc_ms is not null
     and public.utc_day(r.t_utc_ms) = any (p_days)
   group by r.device_id, r.beekeeper_id, public.utc_day(r.t_utc_ms), r.sensor_epoch
  having sum(case when r.gas_status = 0 or r.gas_status is null then 1 else 0 end) > 0;
$$;

-- Recalcula tudo de um nó. Para manutenção e para conferir o gatilho.
create or replace function private.recalc_daily_all(p_device_id text)
returns void
language sql
security definer
set search_path = ''
as $$
  select private.recalc_daily(
    p_device_id,
    coalesce((select array_agg(distinct public.utc_day(t_utc_ms))
                from public.reading
               where device_id = p_device_id and t_utc_ms is not null), '{}'));
$$;

-- Gatilho por COMANDO, com tabela de transição: um lote de 500 leituras
-- recalcula só os dias que ele tocou, uma vez. Com ON CONFLICT DO NOTHING a
-- tabela de transição contém só as linhas realmente inseridas, então reenviar
-- um lote não recalcula nada.
create or replace function private.on_reading_inserted()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  t record;
begin
  for t in
    select device_id, array_agg(distinct public.utc_day(t_utc_ms)) as days
      from new_rows
     where t_utc_ms is not null
     group by device_id
  loop
    perform private.recalc_daily(t.device_id, t.days);
  end loop;

  insert into public.node_stats as s
    (device_id, beekeeper_id, reading_count, excluded_count, unknown_time_count, last_reading_ms)
  select device_id,
         min(beekeeper_id::text)::uuid,
         count(*),
         count(*) filter (where gas_status is not null and gas_status <> 0),
         count(*) filter (where t_utc_ms is null),
         max(t_utc_ms)
    from new_rows
   group by device_id
  on conflict (device_id) do update
     set reading_count      = s.reading_count + excluded.reading_count,
         excluded_count     = s.excluded_count + excluded.excluded_count,
         unknown_time_count = s.unknown_time_count + excluded.unknown_time_count,
         last_reading_ms    = greatest(s.last_reading_ms, excluded.last_reading_ms);
  return null;
end
$$;

drop trigger if exists reading_after_insert on public.reading;
create trigger reading_after_insert
  after insert on public.reading
  referencing new table as new_rows
  for each statement execute function private.on_reading_inserted();

-- Reconstrói os contadores de um nó a partir da série. Manutenção.
create or replace function private.rebuild_node_stats(p_device_id text)
returns void
language sql
security definer
set search_path = ''
as $$
  delete from public.node_stats where device_id = p_device_id;
  insert into public.node_stats
    (device_id, beekeeper_id, reading_count, excluded_count, unknown_time_count, last_reading_ms)
  select device_id, min(beekeeper_id::text)::uuid, count(*),
         count(*) filter (where gas_status is not null and gas_status <> 0),
         count(*) filter (where t_utc_ms is null),
         max(t_utc_ms)
    from public.reading
   where device_id = p_device_id
   group by device_id;
$$;

-- -----------------------------------------------------------------------------
-- Código do projeto: 8 símbolos do base32 de Crockford, o 8º é dígito
-- verificador Luhn mod 32. MESMA regra de src/core/codigo-projeto.ts; o caso
-- servidor/golden/codigos.json prende as duas implementações.
-- -----------------------------------------------------------------------------
create or replace function private.code_alphabet()
returns text
language sql immutable parallel safe
as $$ select '0123456789ABCDEFGHJKMNPQRSTVWXYZ'::text $$;

-- Maiúsculas, sem espaço nem hífen, O->0 e I/L->1 (leituras toleradas).
create or replace function private.normalize_code(p_code text)
returns text
language sql immutable parallel safe
set search_path = ''
as $$
  select translate(regexp_replace(upper(coalesce(p_code, '')), '[[:space:]._-]', '', 'g'),
                   'OIL', '011')
$$;

create or replace function private.code_check_char(p_body text)
returns text
language plpgsql immutable parallel safe
set search_path = ''
as $$
declare
  alphabet constant text := private.code_alphabet();
  n constant integer := 32;
  factor integer := 2;
  total integer := 0;
  addend integer;
  v integer;
  i integer;
begin
  for i in reverse length(p_body)..1 loop
    v := strpos(alphabet, substr(p_body, i, 1)) - 1;
    if v < 0 then
      raise exception 'símbolo fora do alfabeto: %', substr(p_body, i, 1)
        using errcode = '22023';
    end if;
    addend := factor * v;
    factor := case when factor = 2 then 1 else 2 end;
    total := total + (addend / n) + (addend % n);
  end loop;
  return substr(alphabet, ((n - (total % n)) % n) + 1, 1);
end
$$;

-- Verdadeiro se o código (já normalizado) tem 8 símbolos válidos e o
-- verificador confere.
create or replace function private.code_is_valid(p_code text)
returns boolean
language sql immutable parallel safe
set search_path = ''
as $$
  select p_code ~ '^[0-9A-HJKMNP-TV-Z]{8}$'
     and private.code_check_char(substr(p_code, 1, 7)) = substr(p_code, 8, 1)
$$;

create or replace function private.hash_code(p_code text)
returns bytea
language sql stable
security definer
set search_path = ''
as $$
  select sha256(convert_to(
    p_code || ':' || (select value from private.secret where name = 'code_pepper'),
    'UTF8'))
$$;

-- Grava um código escolhido (semente de demonstração). Revoga o anterior.
create or replace function private.register_project_code(p_beekeeper_id uuid, p_code text)
returns text
language plpgsql
security definer
set search_path = ''
as $$
declare
  c text := private.normalize_code(p_code);
begin
  if not private.code_is_valid(c) then
    raise exception 'código inválido' using errcode = '22023';
  end if;
  update public.project_code set revoked_at = now()
   where beekeeper_id = p_beekeeper_id and revoked_at is null;
  -- Reativar um código antigo do MESMO apicultor é permitido; tomar o código
  -- de outro apicultor, nunca.
  insert into public.project_code as pc (code_hash, beekeeper_id)
  values (private.hash_code(c), p_beekeeper_id)
  on conflict (code_hash) do update set revoked_at = null, created_at = now()
   where pc.beekeeper_id = excluded.beekeeper_id;
  if not found then
    raise exception 'este código já pertence a outro apicultor' using errcode = '23505';
  end if;
  return substr(c, 1, 4) || '-' || substr(c, 5, 4);
end
$$;

-- Sorteia um código novo para o apicultor e devolve o código claro UMA vez,
-- formatado XXXX-XXXX. 35 bits de corpo vindos de gen_random_uuid (fonte
-- forte do Postgres), sem extensão.
create or replace function private.issue_project_code(p_beekeeper_id uuid)
returns text
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
  alphabet constant text := private.code_alphabet();
  raw bytea;
  bits bigint;
  body text := '';
  i integer;
begin
  loop
    raw := uuid_send(gen_random_uuid());
    -- bytes 0..4 de um UUID v4 são aleatórios (40 bits); usamos 35.
    bits := (get_byte(raw, 0)::bigint << 32) | (get_byte(raw, 1)::bigint << 24)
          | (get_byte(raw, 2)::bigint << 16) | (get_byte(raw, 3)::bigint << 8)
          | get_byte(raw, 4)::bigint;
    body := '';
    for i in 0..6 loop
      body := body || substr(alphabet, ((bits >> (5 * i)) & 31)::integer + 1, 1);
    end loop;
    exit when not exists (
      select 1 from public.project_code
       where code_hash = private.hash_code(body || private.code_check_char(body)));
  end loop;
  return private.register_project_code(p_beekeeper_id, body || private.code_check_char(body));
end
$$;

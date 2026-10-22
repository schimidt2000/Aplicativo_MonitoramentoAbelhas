-- =============================================================================
-- O MÍNIMO do Supabase que os scripts do servidor usam, para testar num
-- Postgres puro e descartável. NÃO roda num projeto Supabase: lá isto já existe.
--
-- Igual ao Supabase no que importa para a RLS:
--   * papéis anon, authenticated e service_role;
--   * auth.uid() lido de request.jwt.claims, que é o que o PostgREST preenche
--     a partir do JWT de cada requisição;
--   * auth.users, com e-mail, para private.add_researcher e o apagamento.
-- =============================================================================

do $$
begin
  if not exists (select 1 from pg_roles where rolname = 'anon') then
    create role anon nologin noinherit;
  end if;
  if not exists (select 1 from pg_roles where rolname = 'authenticated') then
    create role authenticated nologin noinherit;
  end if;
  if not exists (select 1 from pg_roles where rolname = 'service_role') then
    create role service_role nologin noinherit bypassrls;
  end if;
end $$;

create schema if not exists auth;

create table if not exists auth.users (
  id           uuid primary key default gen_random_uuid(),
  email        text unique,
  is_anonymous boolean not null default false,
  created_at   timestamptz not null default now()
);

create or replace function auth.uid()
returns uuid
language sql stable
as $$
  select nullif(nullif(current_setting('request.jwt.claims', true), '')::jsonb ->> 'sub', '')::uuid
$$;

create or replace function auth.role()
returns text
language sql stable
as $$
  select nullif(current_setting('request.jwt.claims', true), '')::jsonb ->> 'role'
$$;

grant usage on schema auth to anon, authenticated, service_role;
grant execute on function auth.uid(), auth.role() to anon, authenticated, service_role;

-- O Supabase concede tudo em public a estes papéis por padrão. Reproduzimos
-- isso de propósito: 002_rls.sql precisa provar que REVOGA, não que nunca
-- recebeu.
grant usage on schema public to anon, authenticated, service_role;
alter default privileges in schema public grant all on tables    to anon, authenticated, service_role;
alter default privileges in schema public grant all on functions to anon, authenticated, service_role;
alter default privileges in schema public grant all on sequences to anon, authenticated, service_role;

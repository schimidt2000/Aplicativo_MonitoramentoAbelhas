-- =============================================================================
-- Bee-sertão — apagamento por LGPD (FR-039; constituição, "Direito ao
-- apagamento").
--
-- O apicultor pode revogar o consentimento e exigir a exclusão dos dados dele
-- no servidor, e esse direito PREVALECE sobre o append-only interno. Por isso
-- existe UMA porta para DELETE em `reading`, e ela:
--   * nunca é exposta pela API (schema private, sem grant a anon/authenticated);
--   * só abre dentro da própria transação (set_config(..., true));
--   * deixa registro em private.erasure_log, SEM dado pessoal: o id do
--     apicultor (pseudônimo, já sem correspondência depois do apagamento), o
--     número do pedido, as contagens e quem executou.
--
-- Procedimento (fora do aplicativo, pela pesquisadora responsável ou por quem
-- administra o banco): servidor/lgpd/apagar-apicultor.sql. A cópia que está no
-- celular dele é dado dele, no aparelho dele, e não é afetada.
-- =============================================================================

create table if not exists private.erasure_log (
  id             bigint generated always as identity primary key,
  ticket         text        not null,
  beekeeper_id   uuid        not null,
  requested_at   date        not null,
  executed_at    timestamptz not null default now(),
  executed_by    text        not null default session_user,
  readings       bigint      not null,
  daily_rows     bigint      not null,
  nodes          integer     not null,
  hives          integer     not null,
  apiaries       integer     not null,
  phone_links    integer     not null,
  codes          integer     not null
);
revoke all on private.erasure_log from public, anon, authenticated;

create or replace function private.erase_beekeeper(
  p_beekeeper_id uuid, p_ticket text, p_requested_at date)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_readings bigint; v_daily bigint; v_nodes integer; v_hives integer;
  v_apiaries integer; v_links integer; v_codes integer;
  v_users uuid[];
begin
  if coalesce(trim(p_ticket), '') = '' then
    raise exception 'informe o número do pedido de apagamento' using errcode = '22023';
  end if;
  if not exists (select 1 from public.beekeeper where id = p_beekeeper_id) then
    raise exception 'apicultor não encontrado' using errcode = '22023';
  end if;

  -- Abre a porta do gatilho append-only SÓ nesta transação.
  perform set_config('bee.erasure_ticket', p_ticket, true);

  select array_agg(user_id) into v_users from public.phone_link where beekeeper_id = p_beekeeper_id;

  delete from public.reading where beekeeper_id = p_beekeeper_id;
  get diagnostics v_readings = row_count;
  delete from public.reading_daily where beekeeper_id = p_beekeeper_id;
  get diagnostics v_daily = row_count;
  delete from public.node_stats where beekeeper_id = p_beekeeper_id;
  delete from public.node where beekeeper_id = p_beekeeper_id;
  get diagnostics v_nodes = row_count;
  delete from public.hive where beekeeper_id = p_beekeeper_id;
  get diagnostics v_hives = row_count;
  delete from public.apiary where beekeeper_id = p_beekeeper_id;
  get diagnostics v_apiaries = row_count;
  delete from public.phone_link where beekeeper_id = p_beekeeper_id;
  get diagnostics v_links = row_count;
  delete from public.project_code where beekeeper_id = p_beekeeper_id;
  get diagnostics v_codes = row_count;
  delete from public.beekeeper where id = p_beekeeper_id;

  -- Os usuários anônimos dos celulares dele não servem a mais nada.
  if v_users is not null then
    delete from auth.users where id = any (v_users);
  end if;

  perform set_config('bee.erasure_ticket', '', true);

  insert into private.erasure_log
    (ticket, beekeeper_id, requested_at, readings, daily_rows, nodes, hives,
     apiaries, phone_links, codes)
  values (p_ticket, p_beekeeper_id, p_requested_at, v_readings, v_daily, v_nodes,
          v_hives, v_apiaries, v_links, v_codes);

  return jsonb_build_object(
    'ticket', p_ticket, 'readings', v_readings, 'daily_rows', v_daily,
    'nodes', v_nodes, 'hives', v_hives, 'apiaries', v_apiaries,
    'phone_links', v_links, 'codes', v_codes);
end
$$;
revoke all on function private.erase_beekeeper(uuid, text, date) from public, anon, authenticated;

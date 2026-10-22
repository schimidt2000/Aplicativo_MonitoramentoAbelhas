-- =============================================================================
-- Caso de referência contra o Postgres. Os MESMOS arquivos que o vitest roda
-- contra o celular:
--   servidor/golden/codigos.json        <-> tests/codigo-projeto.test.ts
--   servidor/golden/resumo-diario.json  <-> tests/resumo-golden.test.ts
-- Se o servidor e o celular divergirem, a pesquisadora vê um número no painel
-- e o apicultor vê outro no celular (FR-021, SC-007).
--
-- Recebe os JSON pelas variáveis :golden_codigos e :golden_resumo (rodar.sh).
-- =============================================================================

-- ---------- Código do projeto ----------
select test.eq(private.code_check_char(c ->> 'corpo'), right(c ->> 'completo', 1),
               'verificador de ' || (c ->> 'corpo'))
  from jsonb_array_elements((:'golden_codigos')::jsonb -> 'codigos') as c;

select test.eq(private.code_is_valid(c ->> 'completo'), true, 'aceita ' || (c ->> 'completo'))
  from jsonb_array_elements((:'golden_codigos')::jsonb -> 'codigos') as c;

select test.eq(private.normalize_code(' dem0-a1b4 '), 'DEM0A1B4', 'normaliza minúscula, espaço e hífen');
select test.eq(private.normalize_code('DEMO-AIB4'), 'DEM0A1B4', 'O vira 0 e I vira 1');
select test.eq(private.normalize_code('l'), '1', 'L vira 1');

-- Toda troca de UM símbolo, em toda posição, de todo código de referência,
-- é recusada. É a mesma garantia que o celular testa.
select test.eq(count(*), 0::bigint, 'nenhuma troca de um símbolo passa')
  from jsonb_array_elements((:'golden_codigos')::jsonb -> 'codigos') as c,
       generate_series(1, 8) as pos,
       regexp_split_to_table(private.code_alphabet(), '') as s
 where s <> substr(c ->> 'completo', pos, 1)
   and private.code_is_valid(overlay(c ->> 'completo' placing s from pos for 1));

select test.eq(private.code_is_valid('DEM0A1B'), false, 'curto demais');
select test.eq(private.code_is_valid('DEM0A1B44'), false, 'longo demais');
select test.eq(private.code_is_valid('DEMUA1B4'), false, 'U não existe no alfabeto');

-- Um código sorteado é sempre válido e sai formatado.
select test.eq(
  (select bool_and(private.code_is_valid(private.normalize_code(c)) and c ~ '^.{4}-.{4}$')
     from (select private.issue_project_code('cccccccc-cccc-4ccc-8ccc-cccccccccccc') as c
             from generate_series(1, 50)) x),
  true, 'código sorteado é válido e formatado');
-- E só o último fica ativo.
select test.eq(count(*), 1::bigint, 'um código ativo por apicultor')
  from public.project_code
 where beekeeper_id = 'cccccccc-cccc-4ccc-8ccc-cccccccccccc' and revoked_at is null;
-- Devolve o código de demonstração de C, que rls.sql usa.
select private.register_project_code('cccccccc-cccc-4ccc-8ccc-cccccccccccc', 'X9Y8-Z7WR') \g /dev/null

-- ---------- Resumo diário ----------
begin;

insert into public.project (id, name)
values ('99999999-9999-4999-8999-999999999999', 'Projeto do caso de referência');
insert into public.beekeeper (id, project_id, name, consent_at)
values ('99999999-0000-4000-8000-000000000001', '99999999-9999-4999-8999-999999999999',
        'Apicultor do caso de referência', now());
insert into public.node (device_id, beekeeper_id) values
  ('GOLD0001', '99999999-0000-4000-8000-000000000001'),
  ('GOLD0002', '99999999-0000-4000-8000-000000000001');

create temp table golden_leitura on commit drop as
select row_number() over () as ordem, x.*
  from jsonb_to_recordset((:'golden_resumo')::jsonb -> 'leituras') as x(
    device_id text, seq bigint, t_node bigint, t_utc_ms bigint, t_quality smallint,
    temp_c100 integer, rh_x100 integer, tvoc_ppb integer, eco2_ppm integer,
    aqi_uba smallint, gas_status smallint, batt_mv integer, flags integer,
    boot_id text, sensor_epoch integer, calib_version integer, proto_ver integer,
    src text);

-- Em DOIS lotes intercalados (pares, depois ímpares): o gatilho recalcula por
-- lote, e o segundo lote cai em dias que o primeiro já resumiu. É o caso de
-- um envio que chega em pedaços.
insert into public.reading
  (device_id, seq, beekeeper_id, t_node, t_utc_ms, t_quality, temp_c100, rh_x100,
   tvoc_ppb, eco2_ppm, aqi_uba, gas_status, batt_mv, flags, boot_id, sensor_epoch,
   calib_version, proto_ver, src)
select device_id, seq, '99999999-0000-4000-8000-000000000001', t_node, t_utc_ms,
       t_quality, temp_c100, rh_x100, tvoc_ppb, eco2_ppm, aqi_uba, gas_status,
       batt_mv, flags, boot_id, sensor_epoch, calib_version, proto_ver, src
  from golden_leitura where ordem % 2 = 0 order by ordem desc
on conflict (device_id, seq) do nothing;

insert into public.reading
  (device_id, seq, beekeeper_id, t_node, t_utc_ms, t_quality, temp_c100, rh_x100,
   tvoc_ppb, eco2_ppm, aqi_uba, gas_status, batt_mv, flags, boot_id, sensor_epoch,
   calib_version, proto_ver, src)
select device_id, seq, '99999999-0000-4000-8000-000000000001', t_node, t_utc_ms,
       t_quality, temp_c100, rh_x100, tvoc_ppb, eco2_ppm, aqi_uba, gas_status,
       batt_mv, flags, boot_id, sensor_epoch, calib_version, proto_ver, src
  from golden_leitura where ordem % 2 = 1
on conflict (device_id, seq) do nothing;

create temp table esperado on commit drop as
select * from jsonb_to_recordset((:'golden_resumo')::jsonb -> 'esperado') as x(
  device_id text, day integer, temp_p5 integer, temp_med integer, temp_p95 integer,
  rh_med integer, tvoc_med integer, tvoc_amp integer, batt_med integer,
  sample_count integer, excluded_count integer, sensor_epoch integer);

create temp view obtido as
select device_id, day, temp_p5, temp_med, temp_p95, rh_med, tvoc_med, tvoc_amp,
       batt_med, sample_count, excluded_count, sensor_epoch
  from public.reading_daily where device_id like 'GOLD%';

select exists (select * from esperado except select * from obtido)
    or exists (select * from obtido except select * from esperado) as diverge \gset
\if :diverge
  \echo 'O resumo do servidor DIVERGE do caso de referência.'
  \echo 'Esperado e não produzido:'
  select * from esperado except select * from obtido;
  \echo 'Produzido e não esperado:'
  select * from obtido except select * from esperado;
  select test.eq(true, false, 'resumo diário igual ao caso de referência');
\else
  select test.eq(true, true, 'resumo diário igual ao caso de referência');
\endif

select test.eq((select count(*) from obtido where device_id = 'GOLD0001' and day = 20301),
               0::bigint, 'dia só com gás inválido não gera linha (lacuna)');

-- Reenviar tudo (o que o celular faz depois de cair entre o 2xx e o commit)
-- não muda nem a série, nem o resumo, nem os contadores.
create temp table antes on commit drop as select * from obtido;
insert into public.reading
  (device_id, seq, beekeeper_id, t_node, t_utc_ms, t_quality, temp_c100, rh_x100,
   tvoc_ppb, eco2_ppm, aqi_uba, gas_status, batt_mv, flags, boot_id, sensor_epoch,
   calib_version, proto_ver, src)
select device_id, seq, '99999999-0000-4000-8000-000000000001', t_node, t_utc_ms,
       t_quality, temp_c100 + 1, rh_x100, tvoc_ppb, eco2_ppm, aqi_uba, gas_status,
       batt_mv, flags, boot_id, sensor_epoch, calib_version, proto_ver, src
  from golden_leitura
on conflict (device_id, seq) do nothing;
select test.eq((select count(*) from public.reading where device_id like 'GOLD%'),
               12::bigint, 'reenviar não cria linha');
select test.eq((select count(*) from (select * from antes except select * from obtido) x),
               0::bigint, 'reenviar (até com valor diferente) não muda o resumo');
select test.eq((select temp_c100 from public.reading where device_id = 'GOLD0001' and seq = 1),
               3400, 'a primeira gravação vence: medição original preservada');

select test.eq((select reading_count from public.node_stats where device_id = 'GOLD0001'),
               10::bigint, 'contador de leituras do nó');
select test.eq((select excluded_count from public.node_stats where device_id = 'GOLD0001'),
               3::bigint, 'contador de excluídas do nó');
select test.eq((select last_reading_ms from public.node_stats where device_id = 'GOLD0001'),
               1754200800000::bigint, 'última leitura do nó');

-- O recálculo completo (manutenção) chega ao mesmo resultado que o
-- incremental do gatilho.
select private.recalc_daily_all('GOLD0001'), private.recalc_daily_all('GOLD0002') \g /dev/null
select test.eq((select count(*) from (select * from antes except select * from obtido) x)
             + (select count(*) from (select * from obtido except select * from antes) x),
               0::bigint, 'recálculo completo igual ao incremental');

rollback;

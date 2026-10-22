-- =============================================================================
-- Acesso e NEGAÇÃO (FR-017 a FR-020, FR-022, SC-001, SC-004).
--
-- Policy que permite é fácil de escrever; RLS que nega filtra em SILÊNCIO —
-- devolve zero linhas, não erro. Por isso cada promessa de 002_rls.sql tem
-- aqui o seu caso de negação, além do caso feliz.
--
-- Atores (a semente cria A e B no projeto piloto e C no outro projeto):
--   celA, celA2  dois celulares da apicultora A
--   celB         celular do meliponicultor B
--   celX         celular que nunca foi ligado
--   pesq1        pesquisadora do projeto piloto
--   pesq2        pesquisadora do outro projeto
-- =============================================================================

\set celA   '0a000000-0000-4000-8000-00000000000a'
\set celA2  '0a000000-0000-4000-8000-0000000000a2'
\set celB   '0b000000-0000-4000-8000-00000000000b'
\set celX   '0f000000-0000-4000-8000-00000000000f'
\set pesq1  '01000000-0000-4000-8000-000000000001'
\set pesq2  '02000000-0000-4000-8000-000000000002'
\set bkA    'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa'
\set bkB    'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb'
\set bkC    'cccccccc-cccc-4ccc-8ccc-cccccccccccc'

-- Os usuários do Supabase Auth (anônimos para os celulares).
insert into auth.users (id, email, is_anonymous) values
  (:'celA', null, true), (:'celA2', null, true), (:'celB', null, true),
  (:'celX', null, true),
  (:'pesq1', 'pesquisadora.piloto@exemplo.org', false),
  (:'pesq2', 'pesquisadora.outra@exemplo.org', false);
select private.add_researcher('pesquisadora.piloto@exemplo.org', '11111111-1111-4111-8111-111111111111');
select private.add_researcher('PESQUISADORA.OUTRA@exemplo.org',  '22222222-2222-4222-8222-222222222222');

-- Um lote de leituras como o celular manda: SEM beekeeper_id, e com
-- ON CONFLICT DO NOTHING, que é o que o PostgREST gera para
-- `Prefer: resolution=ignore-duplicates` + `on_conflict=device_id,seq`.
create or replace function test.lote(dispositivo text, de integer, ate integer)
returns text
language sql immutable
as $$
  select format($f$
    insert into public.reading
      (device_id, seq, t_node, t_utc_ms, t_quality, temp_c100, rh_x100, tvoc_ppb,
       eco2_ppm, aqi_uba, gas_status, batt_mv, flags, boot_id, sensor_epoch,
       calib_version, proto_ver, src)
    select %L, i, i * 900, 1790000000000 + i::bigint * 900000, 1, 3400 + i %% 50, 6000,
           800, 500, 1, case when i %% 10 = 0 then 2 else 0 end, 4000, 0, 'b1', 1, 1, 1, 'teste'
      from generate_series(%s, %s) as i
    on conflict (device_id, seq) do nothing$f$, dispositivo, de, ate)
$$;
grant execute on function test.lote(text, integer, integer) to authenticated;

-- =============================================================================
-- anon: nada.
-- =============================================================================
set role anon;
select test.como(null);
select test.expect_error('select count(*) from public.reading', '42501', 'anon não lê leitura');
select test.expect_error('select count(*) from public.beekeeper', '42501', 'anon não lê apicultor');
select test.expect_error('select count(*) from public.hive_overview', '42501', 'anon não lê a visão do conjunto');
select test.expect_error($$select public.redeem_project_code('DEM0A1B4')$$, '42501',
                         'anon não resgata código');
reset role;

-- =============================================================================
-- Celular de A: liga, manda cadastro, manda leituras.
-- =============================================================================
set role authenticated;
select test.como(:'celA');

select test.eq(public.redeem_project_code('DEM0-A1B5') ->> 'status', 'invalid',
               'verificador errado é recusado (e conta como tentativa)');
select test.eq(public.redeem_project_code('ZZZZ-ZZZ7') ->> 'status', 'invalid',
               'código bem formado e inexistente é recusado');
select test.eq(public.redeem_project_code(' dem0-a1b4 ') ->> 'status', 'ok',
               'código certo, como a pessoa digita');
select test.eq(public.redeem_project_code('DEM0-A1B4') ->> 'beekeeper_name',
               'Apicultora de demonstração A', 'o resgate diz de quem é o código');

-- Ordem importa: leitura de nó que o servidor ainda não conhece é recusada.
select test.expect_error(test.lote('CEL-A', 1, 10), '42501',
                         'leitura antes do cadastro do nó é recusada');

select test.eq(public.upsert_registry(
  '[{"id":"ap-1","name":"Apiário do teste","municipality":"Mossoró","state":"RN","updated_ms":100,"deleted_ms":null}]',
  '[{"id":"h-1","apiary_id":"ap-1","name":"Colmeia 01","species":"Apis mellifera","installed_at_ms":null,"updated_ms":100,"deleted_ms":null}]',
  '[{"device_id":"CEL-A","hive_id":"h-1","placement":"ninho","period_s":900,"sensor_epoch":1,"calib_version":1,"temp_offset_c100":-50,"updated_ms":100}]'),
  '{"hives": 1, "nodes": 1, "apiaries": 1}'::jsonb, 'cadastro de A gravado');

-- Última escrita vence: um celular atrasado não desfaz o nome novo.
select public.upsert_registry(
  '[{"id":"ap-1","name":"Apiário do teste (novo nome)","municipality":"Mossoró","state":"RN","updated_ms":200}]') \g /dev/null
select public.upsert_registry(
  '[{"id":"ap-1","name":"Nome velho","municipality":"Mossoró","state":"RN","updated_ms":150}]') \g /dev/null
select test.eq((select name from public.apiary where id = 'ap-1'), 'Apiário do teste (novo nome)',
               'cadastro: última escrita vence por updated_ms');

select test.eq((select beekeeper_id::text from public.node where device_id = 'CEL-A'), :'bkA',
               'o servidor decide de quem é o nó; o celular não manda isso');

do $$ begin execute test.lote('CEL-A', 1, 100); end $$;
do $$ begin execute test.lote('CEL-A', 1, 100); end $$;
select test.eq((select count(*) from public.reading where device_id = 'CEL-A'), 100::bigint,
               'mandar o mesmo lote duas vezes não cria linha (SC-001)');
select test.eq((select beekeeper_id::text from public.reading where device_id = 'CEL-A' limit 1), :'bkA',
               'leitura fica com o apicultor de quem mandou');
select test.eq((select reading_count from public.node_stats where device_id = 'CEL-A'), 100::bigint,
               'contador do nó não conta reenvio');

-- O que A NÃO pode.
select test.expect_error(
  $$insert into public.reading (device_id, seq, beekeeper_id, t_node, t_utc_ms, t_quality, proto_ver, src)
    values ('CEL-A', 9001, 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb', 1, 1, 1, 1, 'teste')$$,
  '42501', 'A não grava leitura em nome de B');
select test.expect_error(test.lote('DEMO-B1', 90001, 90010), '42501',
                         'A não grava leitura no nó de B');
select test.expect_error($$update public.reading set temp_c100 = 0 where device_id = 'CEL-A'$$,
                         '42501', 'leitura não aceita UPDATE');
select test.expect_error($$delete from public.reading where device_id = 'CEL-A'$$,
                         '42501', 'leitura não aceita DELETE');
select test.expect_error($$update public.reading_daily set temp_med = 0$$,
                         '42501', 'resumo não aceita UPDATE do celular');
select test.expect_error(
  $$select public.upsert_registry('[]', '[]',
      '[{"device_id":"DEMO-B1","hive_id":null,"placement":null,"period_s":900,"sensor_epoch":1,"calib_version":1,"temp_offset_c100":0,"updated_ms":9999999999999}]')$$,
  '42501', 'A não toma para si o nó de B');
select test.expect_error('select * from public.project_code', '42501', 'código do projeto é ilegível');
select test.expect_error('select * from public.phone_link', '42501', 'vínculos são ilegíveis');
select test.expect_error('select * from private.code_attempt', '42501', 'tentativas são ilegíveis');
select test.expect_error('select * from private.secret', '42501', 'pepper é ilegível');
select test.expect_error($$select private.issue_project_code('aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa')$$,
                         '42501', 'celular não sorteia código direto');
select test.expect_error($$select public.issue_project_code('aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa')$$,
                         '42501', 'celular não gera código nem para si');
select test.expect_error($$select private.erase_beekeeper('bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb', 'x', current_date)$$,
                         '42501', 'celular não apaga ninguém');

-- O TESTE DE NEGAÇÃO: A pede os dados de B e recebe ZERO linhas.
select test.eq((select count(*) from public.reading where beekeeper_id = :'bkB'), 0::bigint,
               'NEGAÇÃO: A recebe zero leituras de B (SC-004)');
select test.eq((select count(*) from public.reading where device_id = 'DEMO-B1'), 0::bigint,
               'NEGAÇÃO: A recebe zero leituras do nó de B');
select test.eq((select count(*) from public.reading_daily where beekeeper_id <> :'bkA'), 0::bigint,
               'NEGAÇÃO: A recebe zero resumos de outros');
select test.eq((select count(*) from public.hive_overview where beekeeper_id <> :'bkA'), 0::bigint,
               'NEGAÇÃO: A não vê colmeia de outros na visão do conjunto');
select test.eq((select count(*) from public.beekeeper), 1::bigint, 'A só vê a si mesma');
select test.eq((select count(*) from public.node where beekeeper_id <> :'bkA'), 0::bigint,
               'NEGAÇÃO: A não vê nó de outros');
select test.eq((select count(*) from public.project), 0::bigint, 'celular não lista projetos');
-- E vê o que é dela (senão o zero acima não provaria nada).
select test.eq((select count(*) > 2000 from public.reading), true,
               'A vê as próprias leituras (semente + celular)');
reset role;

-- =============================================================================
-- Celular de B: os MESMOS ids locais de A ('ap-1', 'h-1') não colidem.
-- =============================================================================
set role authenticated;
select test.como(:'celB');
select test.eq(public.redeem_project_code('DEM0-B2CZ') ->> 'status', 'ok', 'B liga o celular');
select test.eq(public.upsert_registry(
  '[{"id":"ap-1","name":"Meliponário do teste","municipality":"Petrolina","state":"PE","updated_ms":100}]',
  '[{"id":"h-1","apiary_id":"ap-1","name":"Jandaíra 01","species":"Melipona subnitida","updated_ms":100}]',
  '[{"device_id":"CEL-B","hive_id":"h-1","updated_ms":100}]') ->> 'apiaries', '1',
  'B grava cadastro com os mesmos ids locais de A');
do $$ begin execute test.lote('CEL-B', 1, 40); end $$;
select test.eq((select count(*) from public.reading where device_id = 'CEL-A'), 0::bigint,
               'NEGAÇÃO: B recebe zero leituras de A');
select test.eq((select count(*) from public.reading where beekeeper_id = :'bkA'), 0::bigint,
               'NEGAÇÃO: B recebe zero leituras de A, por apicultor');
select test.eq((select name from public.apiary where id = 'ap-1'), 'Meliponário do teste',
               'B vê o próprio ap-1, não o de A');
-- Feature 003 (T046 da 003, R-013 da 002): o celular manda leitura SEM hora
-- conhecida, com t_utc_ms nulo e t_quality 3. Ela é gravada, contada em
-- node_stats.unknown_time_count e fica fora do resumo diário.
create temp table if not exists resumo_antes as
  select count(*) as n from public.reading_daily where device_id = 'CEL-B';
insert into public.reading
  (device_id, seq, t_node, t_utc_ms, t_quality, temp_c100, rh_x100, tvoc_ppb, eco2_ppm,
   aqi_uba, gas_status, batt_mv, flags, boot_id, sensor_epoch, calib_version, proto_ver, src)
select 'CEL-B', i, i * 900, null, 3, 3400, 6000, 800, 500, 1, 0, 4000, 0, null, 1, 1, 1, 'teste'
  from generate_series(41, 43) as i
on conflict (device_id, seq) do nothing;
select test.eq((select count(*) from public.reading where device_id = 'CEL-B' and t_utc_ms is null),
               3::bigint, 'sem hora: o celular grava leitura com t_utc_ms nulo');
select test.eq((select unknown_time_count from public.node_stats where device_id = 'CEL-B'),
               3::bigint, 'sem hora: contada em node_stats.unknown_time_count');
select test.eq((select count(*) from public.reading_daily where device_id = 'CEL-B'),
               (select n from resumo_antes), 'sem hora: fica fora do resumo diário');
select test.eq((select count(*) from public.reading_daily where day is null), 0::bigint,
               'sem hora: nenhum resumo com dia nulo');
reset role;

-- =============================================================================
-- Segundo celular de A: o mesmo código liga de novo; a chave natural absorve
-- o que os dois mandarem em comum.
-- =============================================================================
set role authenticated;
select test.como(:'celA2');
select test.eq(public.redeem_project_code('DEM0A1B4') ->> 'status', 'ok', 'segundo celular de A');
do $$ begin execute test.lote('CEL-A', 50, 150); end $$;
select test.eq((select count(*) from public.reading where device_id = 'CEL-A'), 150::bigint,
               'dois celulares, sobreposição absorvida pela chave natural');
reset role;

-- =============================================================================
-- Celular que nunca foi ligado.
-- =============================================================================
set role authenticated;
select test.como(:'celX');
select test.expect_error(test.lote('CEL-A', 900, 901), '42501', 'celular sem vínculo não grava leitura');
select test.expect_error($$select public.upsert_registry('[]','[]','[]')$$, '42501',
                         'celular sem vínculo não grava cadastro');
select test.eq((select count(*) from public.reading), 0::bigint, 'celular sem vínculo não lê nada');
select test.eq((select count(*) from public.hive_overview), 0::bigint, 'nem a visão do conjunto');

-- Limite de tentativas (FR-013): 5 erros na hora, depois espera. Nem o código
-- certo passa enquanto espera: senão o limite viraria um oráculo.
select test.eq(public.redeem_project_code('ZZZZ-ZZZ7') ->> 'status', 'invalid',
               'erro ' || n || ' de 5 na hora: ainda responde')
  from generate_series(1, 5) as n;
select test.eq(public.redeem_project_code('ZZZZ-ZZZ7') ->> 'status', 'throttled', 'sexto erro na hora: espera');
select test.eq(public.redeem_project_code('DEM0-A1B4') ->> 'status', 'throttled',
               'esperando, nem o código certo passa');
reset role;
-- Mais 5 erros "de duas horas atrás": 10 em 24 h trava o dia.
insert into private.code_attempt (user_id, ok, attempted_at)
select :'celX', false, now() - interval '2 hours' from generate_series(1, 5);
set role authenticated;
select test.como(:'celX');
select test.eq(public.redeem_project_code('DEM0-A1B4') ->> 'status', 'locked', '10 erros em 24 h: travado');
reset role;
select test.eq((select count(*) from public.phone_link where user_id = :'celX'), 0::bigint,
               'tentativa barrada não liga o celular');

-- =============================================================================
-- Pesquisadoras.
-- =============================================================================
set role authenticated;
select test.como(:'pesq1');
select test.eq((select count(distinct beekeeper_id) from public.reading), 2::bigint,
               'pesquisadora do piloto vê os dois apicultores do piloto');
select test.eq((select count(*) from public.reading where beekeeper_id = :'bkC'), 0::bigint,
               'NEGAÇÃO: pesquisadora do piloto não vê o outro projeto');
select test.eq((select count(*) from public.beekeeper), 2::bigint, 'ela vê os dois apicultores');
select test.eq((select count(*) from public.hive_overview where beekeeper_id = :'bkC'), 0::bigint,
               'NEGAÇÃO: nenhuma colmeia de outro projeto na visão do conjunto');
select test.eq((select count(*) from public.hive_overview), 5::bigint,
               'visão do conjunto: 3 colmeias semeadas do piloto + 2 dos celulares de teste');
select test.eq((select reading_count from public.hive_overview where hive_id = 'h-demo-a2'),
               2592::bigint, 'leituras da colmeia com três dias sem leitura');
select test.eq((select excluded_count > 0 from public.hive_overview where hive_id = 'h-demo-a1'),
               true, 'amostras excluídas aparecem na visão do conjunto');
select test.eq((select count(*) from information_schema.columns
                 where table_schema = 'public' and table_name = 'hive_overview'
                   and column_name ~ '(tvoc|eco2|aqi|gas)'), 0::bigint,
               'visão do conjunto não oferece voláteis (FR-031)');
select test.eq((select count(*) from public.hive_daily
                 where hive_id = 'h-demo-b1' and day in (20702, 20703)), 0::bigint,
               'dias só com gás inválido não têm resumo (lacuna)');
select test.eq((select count(distinct sensor_epoch) from public.hive_daily where hive_id = 'h-demo-b1'),
               2::bigint, 'troca de sensor: duas épocas, nenhum resumo cruzando');
select test.expect_error(test.lote('CEL-A', 7000, 7001), '42501', 'pesquisadora não grava leitura');
select test.expect_error($$update public.beekeeper set name = 'x'$$, '42501', 'pesquisadora não altera apicultor');

-- Gerar código novo para A revoga o antigo; quem já está ligado continua.
select public.issue_project_code(:'bkA') as codigo_novo \gset
select test.expect_error($$select public.issue_project_code('cccccccc-cccc-4ccc-8ccc-cccccccccccc')$$,
                         '42501', 'NEGAÇÃO: pesquisadora não gera código de outro projeto');
reset role;
select test.eq(private.code_is_valid(private.normalize_code(:'codigo_novo')), true,
               'pesquisadora gera código válido');

set role authenticated;
select test.como(:'pesq2');
select test.eq((select count(*) from public.reading where beekeeper_id in (:'bkA', :'bkB')), 0::bigint,
               'NEGAÇÃO: pesquisadora do outro projeto recebe zero linhas do piloto');
select test.eq((select count(distinct beekeeper_id) from public.reading), 1::bigint,
               'ela vê só o apicultor dela');
reset role;

set role authenticated;
select test.como('0e000000-0000-4000-8000-00000000000e');
select test.eq(public.redeem_project_code('DEM0-A1B4') ->> 'status', 'invalid',
               'código antigo de A foi revogado');
reset role;
set role authenticated;
select test.como(:'celA');
do $$ begin execute test.lote('CEL-A', 151, 160); end $$;
select test.eq((select count(*) from public.reading where device_id = 'CEL-A'), 160::bigint,
               'celular já ligado continua enviando depois do código novo');
reset role;

-- =============================================================================
-- Append-only vale até para o dono do banco.
-- =============================================================================
select test.expect_error($$update public.reading set temp_c100 = 0 where device_id = 'CEL-A'$$,
                         '42501', 'nem o dono do banco altera leitura');
select test.expect_error($$delete from public.reading where device_id = 'CEL-A'$$,
                         '42501', 'nem o dono do banco apaga leitura');
select test.expect_error('truncate public.reading cascade', '42501', 'nem o dono do banco esvazia a tabela');

-- =============================================================================
-- Apagamento por LGPD (FR-039): apaga tudo de B, nada de A, e registra sem
-- dado pessoal.
-- =============================================================================
select private.erase_beekeeper(:'bkB', 'LGPD-TESTE-001', current_date) \g /dev/null
select test.eq((select count(*) from public.reading where beekeeper_id = :'bkB'), 0::bigint,
               'LGPD: leituras de B apagadas');
select test.eq((select count(*) from public.beekeeper where id = :'bkB'), 0::bigint,
               'LGPD: cadastro de B apagado');
select test.eq((select count(*) from auth.users where id = :'celB'), 0::bigint,
               'LGPD: usuário do celular de B apagado');
select test.eq((select count(*) from public.reading where device_id = 'CEL-A'), 160::bigint,
               'LGPD: nada de A foi tocado');
select test.eq((select count(*) from private.erasure_log where ticket = 'LGPD-TESTE-001'), 1::bigint,
               'LGPD: o apagamento ficou registrado');
select test.eq((select count(*) from information_schema.columns
                 where table_schema = 'private' and table_name = 'erasure_log'
                   and column_name ~ '(name|email|municipality)'), 0::bigint,
               'LGPD: o registro não guarda dado pessoal');
select test.expect_error($$select private.erase_beekeeper('aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa', '', current_date)$$,
                         '22023', 'LGPD: sem número de pedido, não apaga');
select test.expect_error($$delete from public.reading where device_id = 'CEL-A'$$,
                         '42501', 'depois do apagamento, a porta fecha de novo');

-- =============================================================================
-- Teto GLOBAL de tentativas (research.md R-005): criar usuário anônimo novo é
-- barato, então o limite por celular sozinho não segura adivinhação
-- distribuída. 300 erros na última hora, vindos de qualquer celular, fazem
-- até um celular novo, com o código certo, esperar. Dentro de transação
-- desfeita, para não contaminar o resto.
-- =============================================================================
begin;
insert into private.code_attempt (user_id, ok, attempted_at)
select gen_random_uuid(), false, now() - interval '10 minutes' from generate_series(1, 300);
set local role authenticated;
select test.como('0d000000-0000-4000-8000-00000000000d');
-- X9Y8-Z7WR é o código ATIVO de C (golden.sql): sem o teto, ligaria.
select test.eq(public.redeem_project_code('X9Y8-Z7WR') ->> 'status', 'throttled',
               'teto global: 300 erros na hora fazem até celular novo esperar');
reset role;
select test.eq((select count(*) from public.phone_link
                 where user_id = '0d000000-0000-4000-8000-00000000000d'), 0::bigint,
               'teto global: nada é ligado enquanto espera');
rollback;
select test.como(null);

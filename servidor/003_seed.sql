-- =============================================================================
-- Bee-sertão — semente de DEMONSTRAÇÃO (feature 002, Fatia 1)
--
-- Nenhuma pessoa real. Os nomes dizem que são de demonstração; os municípios
-- são reais porque município não identifica ninguém. Nenhuma coordenada
-- (não existe coluna para isso).
--
-- O que a semente monta, e o que cada parte demonstra:
--   * Projeto piloto, com dois apicultores (A: Apis; B: meliponíneos), e um
--     OUTRO projeto, com o apicultor C. A pesquisadora do piloto nunca vê C
--     (US3, cenário 3).
--   * Códigos do projeto conhecidos, para a demonstração de "ligar o celular":
--       A  DEM0-A1B4      B  DEM0-B2CZ      C  X9Y8-Z7WR
--     Em produção os códigos são sorteados por public.issue_project_code e
--     ninguém os escreve num arquivo.
--   * 30 dias de leituras a cada 15 min, a partir de 01/09/2026 (UTC):
--       DEMO-A1  série normal, com amostras de gás inválidas espalhadas
--       DEMO-A2  três dias SEM leitura (dias 10 a 12): lacuna no gráfico
--       DEMO-B1  dois dias só com gás inválido (dias 5 e 6): o dia não gera
--                resumo, e troca de sensor no dia 20 (época 2)
--       DEMO-C1  série normal, do outro projeto
--   Os resumos diários e os contadores saem do gatilho, como em produção.
--
-- Pesquisadoras: a conta é criada à mão no Supabase Auth; depois
--   select private.add_researcher('<e-mail>', '11111111-1111-4111-8111-111111111111');
-- =============================================================================

insert into public.project (id, name) values
  ('11111111-1111-4111-8111-111111111111', 'Projeto piloto Bee-sertão (demonstração)'),
  ('22222222-2222-4222-8222-222222222222', 'Outro projeto (demonstração)')
on conflict (id) do nothing;

insert into public.beekeeper (id, project_id, name, municipality, state, consent_at) values
  ('aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa', '11111111-1111-4111-8111-111111111111',
   'Apicultora de demonstração A', 'Mossoró', 'RN', '2026-08-20 12:00:00+00'),
  ('bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb', '11111111-1111-4111-8111-111111111111',
   'Meliponicultor de demonstração B', 'Petrolina', 'PE', '2026-08-21 12:00:00+00'),
  ('cccccccc-cccc-4ccc-8ccc-cccccccccccc', '22222222-2222-4222-8222-222222222222',
   'Apicultor de demonstração C', 'Juazeiro', 'BA', '2026-08-22 12:00:00+00')
on conflict (id) do nothing;

select private.register_project_code('aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa', 'DEM0-A1B4');
select private.register_project_code('bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb', 'DEM0-B2CZ');
select private.register_project_code('cccccccc-cccc-4ccc-8ccc-cccccccccccc', 'X9Y8-Z7WR');

insert into public.apiary (beekeeper_id, id, name, municipality, state, updated_ms) values
  ('aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa', 'ap-demo-a1', 'Apiário do Serrote', 'Mossoró', 'RN', 1788220800000),
  ('bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb', 'mp-demo-b1', 'Meliponário do Quintal', 'Petrolina', 'PE', 1788220800000),
  ('cccccccc-cccc-4ccc-8ccc-cccccccccccc', 'ap-demo-c1', 'Apiário da Baixa', 'Juazeiro', 'BA', 1788220800000)
on conflict do nothing;

insert into public.hive (beekeeper_id, id, apiary_id, name, species, updated_ms) values
  ('aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa', 'h-demo-a1', 'ap-demo-a1', 'Colmeia 01', 'Apis mellifera', 1788220800000),
  ('aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa', 'h-demo-a2', 'ap-demo-a1', 'Colmeia 02', 'Apis mellifera', 1788220800000),
  ('bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb', 'h-demo-b1', 'mp-demo-b1', 'Jandaíra 01', 'Melipona subnitida', 1788220800000),
  ('cccccccc-cccc-4ccc-8ccc-cccccccccccc', 'h-demo-c1', 'ap-demo-c1', 'Colmeia 01', 'Apis mellifera', 1788220800000)
on conflict do nothing;

insert into public.node (device_id, beekeeper_id, hive_id, period_s, sensor_epoch, updated_ms) values
  ('DEMO-A1', 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa', 'h-demo-a1', 900, 1, 1788220800000),
  ('DEMO-A2', 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa', 'h-demo-a2', 900, 1, 1788220800000),
  ('DEMO-B1', 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb', 'h-demo-b1', 900, 2, 1788220800000),
  ('DEMO-C1', 'cccccccc-cccc-4ccc-8ccc-cccccccccccc', 'h-demo-c1', 900, 1, 1788220800000)
on conflict do nothing;

-- 1788220800000 = 2026-09-01T00:00:00Z. 2880 leituras = 30 dias x 96.
insert into public.reading
  (device_id, seq, beekeeper_id, t_node, t_utc_ms, t_quality, temp_c100, rh_x100,
   tvoc_ppb, eco2_ppm, aqi_uba, gas_status, batt_mv, flags, boot_id, sensor_epoch,
   calib_version, proto_ver, src)
select d.device_id,
       i + 1,
       d.beekeeper_id,
       (i + 1) * 900,
       1788220800000 + i::bigint * 900000,
       1,
       (3450 + d.temp_shift + 180 * sin(2 * pi() * (i % 96) / 96.0))::integer,
       (6200 + 450 * cos(2 * pi() * (i % 96) / 96.0))::integer,
       (850 + d.tvoc_shift + 220 * sin(2 * pi() * (i % 96) / 96.0 + 1.0)
            + 15 * (i / 96))::integer,
       (420 + (850 + d.tvoc_shift) / 3)::integer,
       2,
       case
         when d.device_id = 'DEMO-B1' and i / 96 between 5 and 6 then 2
         when i % 47 = 0 then 2
         else 0
       end,
       4150 - (i / 4),
       0,
       'demo',
       case when d.device_id = 'DEMO-B1' and i / 96 >= 20 then 2 else 1 end,
       1,
       1,
       'demo'
  from (values
          ('DEMO-A1', 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa'::uuid,   0,    0),
          ('DEMO-A2', 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa'::uuid,  60,  300),
          ('DEMO-B1', 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb'::uuid, -40, -200),
          ('DEMO-C1', 'cccccccc-cccc-4ccc-8ccc-cccccccccccc'::uuid,  20,  100)
       ) as d(device_id, beekeeper_id, temp_shift, tvoc_shift)
 cross join generate_series(0, 2879) as i
 where not (d.device_id = 'DEMO-A2' and i / 96 between 10 and 12)
on conflict (device_id, seq) do nothing;

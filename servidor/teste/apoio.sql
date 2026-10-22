-- Utilitários de asserção para os testes do servidor. Só existem no banco
-- descartável de servidor/teste/rodar.sh.

create schema if not exists test;
grant usage on schema test to anon, authenticated;

-- Falha com mensagem clara se `obtido` for diferente de `esperado`.
create or replace function test.eq(obtido anyelement, esperado anyelement, rotulo text)
returns void
language plpgsql
as $$
begin
  if obtido is distinct from esperado then
    raise exception 'FALHOU: % (obtido %, esperado %)', rotulo, obtido, esperado;
  end if;
  raise notice 'ok: %', rotulo;
end
$$;

-- Executa `comando` e exige que ele falhe com o SQLSTATE dado. Passar é a
-- falha: uma política que deixa passar o que devia barrar é exatamente o
-- defeito silencioso que este teste existe para pegar.
create or replace function test.expect_error(comando text, estado text, rotulo text)
returns void
language plpgsql
as $$
declare
  obtido text;
  mensagem text;
begin
  begin
    execute comando;
  exception when others then
    get stacked diagnostics obtido = returned_sqlstate, mensagem = message_text;
    if obtido = estado then
      raise notice 'ok: % (barrado: %)', rotulo, mensagem;
      return;
    end if;
    raise exception 'FALHOU: % (erro %, esperado %: %)', rotulo, obtido, estado, mensagem;
  end;
  raise exception 'FALHOU: % (o comando PASSOU, devia ter sido barrado com %)', rotulo, estado;
end
$$;

-- "Este pedido vem do celular / da conta `usuario`": é o que o PostgREST faz
-- com o JWT de cada requisição. Combine com `set role authenticated`.
create or replace function test.como(usuario uuid)
returns void
language sql
as $$
  select set_config('request.jwt.claims',
    case when usuario is null then ''
         else json_build_object('sub', usuario, 'role', 'authenticated')::text end,
    false);
$$;

grant execute on all functions in schema test to anon, authenticated;

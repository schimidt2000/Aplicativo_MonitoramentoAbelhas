/**
 * `npm run check:fronteira` é o portão de CI do servidor enquanto
 * `npm run servidor:teste` não roda no CI (tasks.md, T068). Se ele deixar
 * passar uma política que abre UPDATE/DELETE em `reading` ou uma coluna de
 * coordenada, nada mais no CI pega. Aqui o script roda de verdade, num
 * diretório mínimo, contra SQL com o defeito plantado.
 */
import { spawnSync } from 'node:child_process';
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { afterEach, describe, expect, it } from 'vitest';

const script = path.resolve(
  path.dirname(fileURLToPath(import.meta.url)), '..', 'scripts', 'check-fronteira.sh',
);

const criados: string[] = [];
afterEach(() => { for (const d of criados.splice(0)) rmSync(d, { recursive: true, force: true }); });

function rodarCom(sql: string): { ok: boolean; saida: string } {
  const dir = mkdtempSync(path.join(tmpdir(), 'fronteira-'));
  criados.push(dir);
  mkdirSync(path.join(dir, 'src'));
  mkdirSync(path.join(dir, 'servidor'));
  writeFileSync(path.join(dir, 'package.json'), '{}');
  writeFileSync(path.join(dir, 'servidor', '001_teste.sql'), sql);
  const r = spawnSync('bash', [script], { cwd: dir, encoding: 'utf8' });
  return { ok: r.status === 0, saida: `${r.stdout}${r.stderr}` };
}

const BASE = `
create table public.reading (device_id text, seq bigint, temp_c100 integer);
create table public.reading_daily (device_id text, day integer);
-- comentário com latitude não conta
create policy leitura_insere on public.reading for insert to authenticated with check (true);
create policy leitura_le on public.reading as permissive for select to authenticated using (true);
create policy resumo_atualiza on public.reading_daily for update to authenticated using (true);
select translate('a', 'b', 'c');
`;

describe('check:fronteira no servidor', () => {
  it('o esquema correto passa', () => {
    const r = rodarCom(BASE);
    expect(r.saida).toContain('Fronteiras OK.');
    expect(r.ok).toBe(true);
  });

  it.each([
    ['sem FOR (vale para ALL)', 'create policy p on public.reading to authenticated using (true);'],
    ['FOR ALL', 'create policy p on public.reading for all to authenticated using (true);'],
    ['FOR UPDATE', 'create policy p on public.reading for update to authenticated using (true);'],
    ['AS PERMISSIVE FOR DELETE', 'create policy p on public.reading as permissive for delete using (true);'],
    ['nome entre aspas e quebra de linha', 'create policy "leitura livre"\n  on reading\n  for update using (true);'],
  ])('reprova política que abre UPDATE/DELETE em reading: %s', (_rotulo, politica) => {
    const r = rodarCom(`${BASE}\n${politica}\n`);
    expect(r.ok, r.saida).toBe(false);
    expect(r.saida).toMatch(/política de UPDATE\/DELETE em reading/);
  });

  it.each([
    'alter table public.apiary add column lat_e6 integer;',
    'alter table public.apiary add column apiary_lon numeric;',
    'alter table public.apiary add column latitude_e7 integer;',
    'alter table public.apiary add column lng double precision;',
  ])('reprova coluna de coordenada: %s', (coluna) => {
    const r = rodarCom(`${BASE}\n${coluna}\n`);
    expect(r.ok, r.saida).toBe(false);
    expect(r.saida).toMatch(/coordenada/);
  });
});

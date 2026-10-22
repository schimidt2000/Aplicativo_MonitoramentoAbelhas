// Mede o JavaScript do caminho crítico do painel, comprimido com gzip, contra o
// orçamento da constituição (Princípio II, painel: <= 250 KB comprimido).
//
// Caminho crítico = o que o index.html carrega antes do primeiro desenho: o
// script de entrada e os módulos pré-carregados por ele. Pedaços carregados
// por import dinâmico (a fonte de dados escolhida, o SDK do servidor) são
// listados à parte, com o total de cada modo de uso.
//
// Rodar depois de `npm run build`.
import { readFileSync, readdirSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { gzipSync } from 'node:zlib';

const ORCAMENTO_KB = 250;
const dist = fileURLToPath(new URL('../dist/', import.meta.url));
const html = readFileSync(join(dist, 'index.html'), 'utf8');

const gz = (arquivo) => gzipSync(readFileSync(join(dist, arquivo)), { level: 9 }).length;
const kb = (bytes) => (bytes / 1024).toFixed(1).replace('.', ',');

const criticos = [
  ...html.matchAll(/<script[^>]+src="\/?([^"]+\.js)"/g),
  ...html.matchAll(/<link[^>]+rel="modulepreload"[^>]+href="\/?([^"]+\.js)"/g),
].map((m) => m[1]);
const css = [...html.matchAll(/<link[^>]+rel="stylesheet"[^>]+href="\/?([^"]+\.css)"/g)].map((m) => m[1]);

const todos = readdirSync(join(dist, 'assets')).filter((f) => f.endsWith('.js')).map((f) => `assets/${f}`);
const tardios = todos.filter((f) => !criticos.includes(f));

let totalCritico = 0;
console.log('Caminho crítico (carregado pelo index.html):');
for (const f of criticos) {
  const b = gz(f);
  totalCritico += b;
  console.log(`  ${f}  ${kb(b)} KB gz`);
}
for (const f of css) console.log(`  ${f}  ${kb(gz(f))} KB gz (CSS, fora da conta de JS)`);
console.log('Carregado sob demanda (import dinâmico):');
for (const f of tardios) console.log(`  ${f}  ${kb(gz(f))} KB gz`);

const maiorTardio = tardios.reduce((m, f) => Math.max(m, gz(f)), 0);
console.log('');
console.log(`JS do caminho crítico: ${kb(totalCritico)} KB gz (orçamento ${ORCAMENTO_KB} KB).`);
console.log(`Pior caso até o primeiro dado (crítico + maior pedaço sob demanda): ${kb(totalCritico + maiorTardio)} KB gz.`);
if (totalCritico > ORCAMENTO_KB * 1024) {
  console.log('ACIMA DO ORÇAMENTO.');
  process.exit(1);
}

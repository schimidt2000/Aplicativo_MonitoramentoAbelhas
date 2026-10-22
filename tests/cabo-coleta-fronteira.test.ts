/**
 * Fronteiras da feature 005 (T541), por comando e não por promessa.
 *
 *  - Princípio I: as telas novas (coletar pelo cabo, placa nova) não alcançam
 *    `src/nuvem/` nem chamam a rede, em nenhum arquivo do grafo.
 *  - Princípio IV: a gravação (`src/data/coletaCabo.ts`) só conhece a porta
 *    `CanalSerial`: não alcança `src/transports/`. Quem abre a porta é a tela,
 *    pelo pacote de transportes.
 *  - CLAUDE.md: `src/core/cabo` e `src/core/decode/arquivo.ts` não alcançam
 *    plataforma, transporte, banco nem tela (a máquina de estados é pura).
 */
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { SRC, alcancaveis, comRede } from './apoio/grafo';

const TELAS = ['coleta-cabo.tsx', 'placa-nova.tsx'];

describe('feature 005: telas da coleta pelo cabo sem rede (Princípio I)', () => {
  for (const tela of TELAS) {
    const grafo = alcancaveis(join(SRC, 'app', tela));

    it(`${tela}: o grafo foi seguido de verdade`, () => {
      expect(grafo).toContain('src/core/cabo/sessao.ts');
      expect(grafo).toContain('src/transports/cable/coleta.ts');
      expect(grafo).toContain('src/transports/mock/firmware.ts');
    });

    it(`${tela}: nada alcançável está em src/nuvem nem chama a rede`, () => {
      expect(grafo.filter((p) => p.startsWith('src/nuvem/'))).toEqual([]);
      expect(comRede(grafo)).toEqual([]);
    });
  }

  it('a tela de coleta pelo cabo grava (alcança src/data/coletaCabo.ts)', () => {
    expect(alcancaveis(join(SRC, 'app', 'coleta-cabo.tsx'))).toContain('src/data/coletaCabo.ts');
  });

  it('o detector de rede pega quem chama (sanidade: o cliente da nuvem chama)', () => {
    const nuvem = alcancaveis(join(SRC, 'nuvem', 'supabase', 'cliente.ts'));
    expect(comRede(nuvem)).toContain('src/nuvem/supabase/cliente.ts');
  });
});

describe('feature 005: quem toca a porta e quem grava são separados (Princípio IV)', () => {
  it('src/data/coletaCabo.ts não alcança src/transports', () => {
    const grafo = alcancaveis(join(SRC, 'data', 'coletaCabo.ts'));
    expect(grafo).toContain('src/core/cabo/protocolo.ts');
    expect(grafo.filter((p) => p.startsWith('src/transports/'))).toEqual([]);
  });

  it('o domínio do cabo e o leitor do arquivo não alcançam plataforma, porta, banco nem tela', () => {
    for (const inicio of [
      join(SRC, 'core', 'cabo', 'sessao.ts'), join(SRC, 'core', 'cabo', 'mensagens.ts'),
      join(SRC, 'core', 'cabo', 'passos.ts'), join(SRC, 'core', 'decode', 'arquivo.ts'),
      join(SRC, 'core', 'hora', 'contagem.ts'),
    ]) {
      const fora = alcancaveis(inicio).filter((p) => !p.startsWith('src/core/'));
      expect(fora, inicio).toEqual([]);
    }
  });
});

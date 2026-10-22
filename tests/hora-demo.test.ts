/**
 * A demonstração não pode acusar um conflito de hora que não existe (feature
 * 003, D-310). A semente e as coletas de demonstração seguem a mesma linha do
 * tempo do nó simulado, e a falta de energia, uma vez simulada, vale para as
 * coletas seguintes. Roda com o relógio real, como o app de campo no navegador.
 */
import { describe, expect, it } from 'vitest';
import { executarColeta } from '@/data/coleta';
import { contarPorQualidade, contarSemHora } from '@/data/hora';
import { garantirApiario, garantirColmeia, garantirNode } from '@/data/repo';
import { perdaDeEnergiaDaDemo, semearHistorico } from '@/data/semente';
import type { FalhaDemo } from '@/core/preferencias';
import { obterTransporte, relogioDoCelular } from '@/transports';
import { NOS_DEMO, SEM_ATRASOS } from '@/transports/mock';
import { bancoDeTeste } from './apoio/banco';

/** Os mesmos atrasos de `data/provider.tsx`: em dia, atrasada e muito atrasada. */
const ATRASO_DEMO: Record<string, number> = {
  A1B2C3D4E5F60002: 2, A1B2C3D4E5F60001: 21, A1B2C3D4E5F60003: 38,
};

function bancoDaDemonstracao() {
  const db = bancoDeTeste();
  garantirApiario(db, 'ap-1', 'Meliponário Serra Verde');
  const nodeIds: number[] = [];
  for (const n of NOS_DEMO) {
    const hiveId = `h-${n.deviceId.slice(-4)}`;
    garantirColmeia(db, hiveId, 'ap-1', n.nome);
    const nodeId = garantirNode(db, n.deviceId, hiveId, n.periodoS);
    semearHistorico(db, nodeId, n, { dias: 12, coletadoHaDias: ATRASO_DEMO[n.deviceId] });
    nodeIds.push(nodeId);
  }
  return { db, nodeIds };
}

function coletar(db: ReturnType<typeof bancoDeTeste>, falha: FalhaDemo) {
  const t = obterTransporte(falha, {
    perdaDeEnergiaMs: perdaDeEnergiaDaDemo(db, falha), atrasos: SEM_ATRASOS,
  });
  return executarColeta(db, t, { agora: relogioDoCelular(falha) });
}

describe('demonstração no app de campo', () => {
  it('a semente já dá hora a tudo, e a primeira coleta confere com ela: tudo ancorado', async () => {
    const { db, nodeIds } = bancoDaDemonstracao();
    for (const id of nodeIds) expect(contarSemHora(db, id)).toBe(0);

    const r = await coletar(db, 'nenhuma');

    expect(r.nos.map((n) => n.relogio)).toEqual(['acertado', 'acertado', 'acertado']);
    for (const id of nodeIds) {
      const q = contarPorQualidade(db, id);
      expect(q.ancorada).toBe(q.total);
    }
  });

  it('"sem energia" uma vez, e depois coleta normal: nenhum conflito falso', async () => {
    const { db, nodeIds } = bancoDaDemonstracao();

    const sem = await coletar(db, 'perdeu-energia');
    const depois = await coletar(db, 'nenhuma');

    for (const r of [sem, depois]) {
      expect(r.nos.every((n) => n.conflitoDeHora === undefined)).toBe(true);
      expect(r.nos.every((n) => n.problema === null)).toBe(true);
    }
    // A colmeia que perdeu energia tem duas ligadas, e nenhuma leitura sem hora:
    // as de antes têm a semente e a primeira coleta; as de depois, as duas últimas.
    expect(contarSemHora(db, nodeIds[0])).toBe(0);
    expect(db.all<{ n: number }>(
      'SELECT COUNT(DISTINCT ligada) AS n FROM leitura_hora WHERE node_id = ?', [nodeIds[0]],
    )[0].n).toBe(2);
  });

  it('a falta de energia, uma vez simulada, continua valendo com qualquer outra simulação', async () => {
    const { db } = bancoDaDemonstracao();
    expect(perdaDeEnergiaDaDemo(db, 'nenhuma')).toBeUndefined();

    const instante = perdaDeEnergiaDaDemo(db, 'perdeu-energia', 1_000_000);
    expect(instante).toBe(1_000_000 - 86_400_000);
    expect(perdaDeEnergiaDaDemo(db, 'nenhuma')).toBe(instante);
    expect(perdaDeEnergiaDaDemo(db, 'queda')).toBe(instante);

    // O transporte aplica o reinício à primeira colmeia, seja qual for a simulação.
    const sessao = await obterTransporte('queda', { perdaDeEnergiaMs: Date.now() - 86_400_000, atrasos: SEM_ATRASOS })
      .connect({ transport: 'mock', handle: 'x', deviceId: NOS_DEMO[0].deviceId });
    expect(sessao.anchor.tNodeAtAnchor).toBeLessThan(86_400 + 60);
  });

  it('"celular um ano adiantado" pergunta a data para todas as colmeias', async () => {
    const { db } = bancoDaDemonstracao();

    const r = await coletar(db, 'celular-adiantado');

    expect(r.nos.map((n) => n.relogio)).toEqual(['conflito', 'conflito', 'conflito']);
  });
});

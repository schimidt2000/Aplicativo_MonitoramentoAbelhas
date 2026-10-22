/**
 * O registro de transportes e a simulação de falhas da demonstração.
 *
 * A demonstração de aula depende de `obterTransporte(falha)`: cada opção de
 * Ajustes precisa produzir o aviso que ela promete, e só na primeira colmeia
 * (as outras seguem — é isso que a demonstração mostra).
 */
import { describe, expect, it } from 'vitest';
import { executarColeta } from '@/data/coleta';
import { garantirApiario, garantirColmeia, garantirNode } from '@/data/repo';
import { contarSemHora } from '@/data/hora';
import { perdaDeEnergiaDaDemo } from '@/data/semente';
import type { SqlDb } from '@/data/types';
import type { ResultadoColeta } from '@/core/coleta/resultado';
import { montarAvisos, resumir } from '@/core/coleta/mensagens';
import { OPCOES_DEMO_FALHA, type FalhaDemo } from '@/core/preferencias';
import { obterTransporte, TRANSPORTE_ATIVO } from '@/transports';
import { NOS_DEMO, NO_DESCONHECIDO, SEM_ATRASOS } from '@/transports/mock';
import { bancoDeTeste } from './apoio/banco';

const AGORA = Date.UTC(2026, 9, 7, 12, 0, 0);
const relogio = () => AGORA;
const DIA_MS = 86_400_000;
const [PRIMEIRA, ...OUTRAS] = NOS_DEMO;

/** O banco como o app o semeia: as colmeias de demonstração já cadastradas. */
function bancoDaDemo() {
  const db = bancoDeTeste();
  garantirApiario(db, 'ap-1', 'Meliponário de Teste');
  for (const n of NOS_DEMO) {
    const hiveId = `h-${n.deviceId.slice(-4)}`;
    garantirColmeia(db, hiveId, 'ap-1', n.nome);
    garantirNode(db, n.deviceId, hiveId, n.periodoS);
  }
  return db;
}

/**
 * Coleta como a tela de Coletar faz: a falta de energia sai de
 * `perdaDeEnergiaDaDemo`, e "celular adiantado" adianta o relógio do celular
 * (aqui, o relógio fixo do teste, em vez de `relogioDoCelular`).
 */
async function coletarCom(falha: FalhaDemo): Promise<[ResultadoColeta, SqlDb]> {
  const db = bancoDaDemo();
  const agora = falha === 'celular-adiantado' ? () => AGORA + 365 * DIA_MS : relogio;
  const transporte = obterTransporte(falha, {
    atrasos: SEM_ATRASOS, agora, perdaDeEnergiaMs: perdaDeEnergiaDaDemo(db, falha),
  });
  return [await executarColeta(db, transporte, { agora }), db];
}

/** Leituras sem hora conhecida de uma colmeia de demonstração. */
const semHora = (db: SqlDb, deviceId: string) =>
  contarSemHora(db, garantirNode(db, deviceId, `h-${deviceId.slice(-4)}`));

const da = (r: ResultadoColeta, deviceId: string) => r.nos.find((n) => n.deviceId === deviceId)!;

/** As outras colmeias seguem normais em toda falha que atinge só a primeira. */
function outrasNormais(r: ResultadoColeta) {
  for (const n of OUTRAS) {
    expect(da(r, n.deviceId).problema).toBeNull();
    expect(da(r, n.deviceId).relogio).toBe('acertado');
  }
}

/**
 * Uma expectativa por opção. O tipo `Record<FalhaDemo, …>` faz o typecheck
 * reprovar se alguém criar uma opção nova em Ajustes sem dizer o que ela faz.
 */
const ESPERADO: Record<FalhaDemo, (r: ResultadoColeta, db: SqlDb) => void> = {
  nenhuma: (r) => {
    expect(r.geral).toBeNull();
    expect(r.nos).toHaveLength(NOS_DEMO.length);
    expect(r.nos.every((n) => n.problema === null && n.relogio === 'acertado')).toBe(true);
    expect(resumir(r).desfecho).toBe('sucesso');
  },
  queda: (r) => {
    expect(da(r, PRIMEIRA.deviceId).problema).toBe('conexao-caiu');
    expect(da(r, PRIMEIRA.deviceId).inseridas).toBeGreaterThan(0); // o que chegou fica
    outrasNormais(r);
  },
  corrompido: (r) => {
    expect(da(r, PRIMEIRA.deviceId).problema).toBe('dados-corrompidos');
    outrasNormais(r);
  },
  formato: (r) => {
    expect(da(r, PRIMEIRA.deviceId).problema).toBe('formato-desconhecido');
    expect(da(r, PRIMEIRA.deviceId).inseridas).toBe(0);
    outrasNormais(r);
  },
  'sem-colmeias': (r) => {
    expect(r.geral).toBe('nenhuma-colmeia');
    expect(r.nos).toEqual([]);
    expect(resumir(r).desfecho).toBe('nao-coletou');
  },
  'sensor-novo': (r) => {
    expect(r.desconhecidos).toEqual([NO_DESCONHECIDO.deviceId]);
    expect(r.nos.every((n) => n.problema === null)).toBe(true);
    expect(montarAvisos(r).map((a) => a.id)).toContain('desconhecidos');
  },
  'relogio-recusado': (r) => {
    expect(da(r, PRIMEIRA.deviceId).relogio).toBe('falhou');
    expect(da(r, PRIMEIRA.deviceId).problema).toBeNull();
    outrasNormais(r);
    expect(resumir(r).desfecho).toBe('sucesso');
  },
  // Feature 003. Banco sem histórico: nenhuma coleta viu a ligada de antes da
  // falta de energia, então essas leituras ficam salvas, mas sem hora.
  'perdeu-energia': (r, db) => {
    const primeira = da(r, PRIMEIRA.deviceId);
    expect(primeira.problema).toBeNull();
    expect(semHora(db, PRIMEIRA.deviceId)).toBeGreaterThan(0);
    expect(semHora(db, PRIMEIRA.deviceId)).toBeLessThan(primeira.inseridas);
    for (const n of OUTRAS) expect(semHora(db, n.deviceId)).toBe(0);
    outrasNormais(r);
    expect(resumir(r).desfecho).toBe('sucesso');
  },
  'sem-nocao-de-tempo': (r, db) => {
    const primeira = da(r, PRIMEIRA.deviceId);
    expect(primeira.problema).toBeNull();
    expect(primeira.inseridas).toBeGreaterThan(0);
    expect(semHora(db, PRIMEIRA.deviceId)).toBe(primeira.inseridas); // FR-016
    for (const n of OUTRAS) expect(semHora(db, n.deviceId)).toBe(0);
    outrasNormais(r);
  },
  // Na primeira coleta não há com o que comparar: a hora adiantada é aceita e
  // nada é perguntado. A pergunta, com histórico, está em tests/hora-demo.test.ts.
  'celular-adiantado': (r, db) => {
    expect(r.nos.every((n) => n.problema === null && n.conflitoDeHora === undefined)).toBe(true);
    for (const n of NOS_DEMO) expect(semHora(db, n.deviceId)).toBe(0);
    const [{ maisNova }] = db.all<{ maisNova: number }>(
      'SELECT MAX(t_utc_ms) AS maisNova FROM leitura_hora');
    expect(maisNova).toBeGreaterThan(AGORA + 300 * DIA_MS);
  },
};

describe('obterTransporte: cada opção da demonstração produz o que promete', () => {
  it('hoje o transporte ativo é o simulado', () => {
    expect(TRANSPORTE_ATIVO).toBe('mock');
  });

  it('toda opção de Ajustes tem expectativa aqui', () => {
    expect(Object.keys(ESPERADO).sort()).toEqual([...OPCOES_DEMO_FALHA].sort());
  });

  for (const falha of OPCOES_DEMO_FALHA) {
    it(falha, async () => {
      ESPERADO[falha](...(await coletarCom(falha)));
    });
  }

  it('sem argumento é a coleta normal', async () => {
    const db = bancoDaDemo();
    const r = await executarColeta(
      db, obterTransporte(undefined, { atrasos: SEM_ATRASOS, agora: relogio }),
      { agora: relogio },
    );
    ESPERADO.nenhuma(r, db);
  });
});

describe('preflight do simulado', () => {
  it('os rótulos chegam em pt-BR, vindos do i18n', async () => {
    const itens = await obterTransporte().preflight();
    expect(itens.map((i) => i.label)).toEqual([
      'Nós sensores simulados ativos', 'Espaço disponível no aparelho',
    ]);
  });
});

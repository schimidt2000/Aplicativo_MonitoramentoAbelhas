/**
 * A coleta nunca termina em silêncio. Cada caminho de falha abaixo corresponde a
 * um aviso que o apicultor precisa ver — e o que já foi salvo precisa ser contado.
 */
import { describe, expect, it } from 'vitest';
import type { DiscoveredNode, NodeSession, Transport } from '@/core/ports/transport';
import { TransportError } from '@/core/ports/transport';
import { montarAvisos, resumir } from '@/core/coleta/mensagens';
import { executarColeta } from '@/data/coleta';
import {
  contarLeituras, garantirApiario, garantirColmeia, garantirNode, resumosDiarios,
} from '@/data/repo';
import { contarSemHora } from '@/data/hora';
import type { SqlDb } from '@/data/types';
import {
  MockTransport, PERFIL_SAUDAVEL, SEM_ATRASOS, type ConfigNoSimulado,
  type FalhasSimuladas,
} from '@/transports/mock';
import { bancoDeTeste } from './apoio/banco';

/** 07/10/2026 12:00 UTC: depois do início do projeto, e fixo — nada depende do relógio real. */
const AGORA = Date.UTC(2026, 9, 7, 12, 0, 0);
const relogio = () => AGORA;

function no(id: string, nome: string, falhas?: FalhasSimuladas): ConfigNoSimulado {
  return {
    deviceId: `AAAA00000000000${id}`, nome, perfil: PERFIL_SAUDAVEL,
    // 3 dias a cada 15 min = 288 leituras = 5 lotes de 60
    dias: 3, periodoS: 900, seed: Number(id), falhas,
  };
}
const A = (f?: FalhasSimuladas) => no('1', 'Colmeia A', f);
const B = (f?: FalhasSimuladas) => no('2', 'Colmeia B', f);

/** Banco com as colmeias já cadastradas, como no app. */
function banco(cadastradas: ConfigNoSimulado[]) {
  const db = bancoDeTeste();
  garantirApiario(db, 'ap-1', 'Meliponário de Teste');
  const nodeIds = new Map<string, number>();
  for (const n of cadastradas) {
    const hiveId = `h-${n.deviceId.slice(-4)}`;
    garantirColmeia(db, hiveId, 'ap-1', n.nome);
    nodeIds.set(n.deviceId, garantirNode(db, n.deviceId, hiveId, n.periodoS));
  }
  return { db, nodeIds };
}

const transporte = (nos: ConfigNoSimulado[], agora = relogio) =>
  new MockTransport(nos, { atrasos: SEM_ATRASOS, agora });


/**
 * Embrulha um transporte trocando partes da sessão. Serve para espionar uma
 * chamada ou para simular um nó que trava, sem reescrever o mock inteiro.
 */
function envolver(base: Transport, alterar: (s: NodeSession) => Record<string, unknown>): Transport {
  return {
    kind: base.kind,
    isSupported: () => base.isSupported(),
    preflight: () => base.preflight(),
    discover: (o) => base.discover(o),
    async connect(n, o) {
      const s = await base.connect(n, o);
      const props = Object.fromEntries(
        Object.entries(alterar(s)).map(([k, value]) => [k, { value }]),
      );
      return Object.create(s, props);
    },
  };
}

const porDevice = (r: Awaited<ReturnType<typeof executarColeta>>, id: string) =>
  r.nos.find((n) => n.deviceId === id)!;

function sessoes(db: SqlDb, nodeId: number) {
  return db.all<{ outcome: string; proto_ver: number | null; record_count: number }>(
    'SELECT outcome, proto_ver, record_count FROM pull_session WHERE node_id = ? ORDER BY id',
    [nodeId],
  );
}

describe('coleta sem problema', () => {
  it('coleta tudo, acerta o relógio de cada nó e registra a sessão', async () => {
    const nos = [A(), B()];
    const { db, nodeIds } = banco(nos);
    const t = transporte(nos);

    const r = await executarColeta(db, t, { agora: relogio });

    expect(r.geral).toBeNull();
    expect(r.nos).toHaveLength(2);
    for (const n of r.nos) {
      expect(n.problema).toBeNull();
      expect(n.inseridas).toBe(288);
      expect(n.recebidas).toBe(288);
      expect(n.dias).toBe(3); // 288 × 15 min = 3 dias
      expect(n.relogio).toBe('acertado');
      expect(t.horarioRecebido(n.deviceId)).toBe(AGORA);
      expect(sessoes(db, nodeIds.get(n.deviceId)!)).toEqual([
        { outcome: 'ok', proto_ver: 1, record_count: 288 },
      ]);
    }
    expect(resumir(r).desfecho).toBe('sucesso');
    expect(montarAvisos(r)).toEqual([]);
  });

  it('coletar de novo não duplica e continua sendo sucesso', async () => {
    const nos = [A()];
    const { db } = banco(nos);

    await executarColeta(db, transporte(nos), { agora: relogio });
    const segunda = await executarColeta(db, transporte(nos), { agora: relogio });

    expect(segunda.nos[0].inseridas).toBe(0);
    // O cursor pede só o que veio depois do último seq: nada é retransmitido.
    expect(segunda.nos[0].recebidas).toBe(0);
    expect(contarLeituras(db)).toBe(288);
    expect(resumir(segunda).desfecho).toBe('sucesso');
  });
});

describe('achar nada NUNCA parece sucesso', () => {
  it('nenhuma colmeia por perto', async () => {
    const { db } = banco([A()]);

    const r = await executarColeta(db, transporte([]), { agora: relogio });

    expect(r.geral).toBe('nenhuma-colmeia');
    expect(r.nos).toEqual([]);
    const resumo = resumir(r);
    expect(resumo.desfecho).toBe('nao-coletou');
    expect(resumo.sugereDiagnostico).toBe(true);
    expect(montarAvisos(r)[0].titulo).toBe('Não achei nenhuma colmeia');
  });

  it('só nós sensores que o aplicativo não conhece: avisa, e também não é sucesso', async () => {
    const { db } = banco([A()]);

    const r = await executarColeta(db, transporte([B()]), { agora: relogio });

    expect(r.desconhecidos).toEqual([B().deviceId]);
    expect(r.geral).toBeNull();
    expect(resumir(r).desfecho).toBe('nao-coletou');
    expect(montarAvisos(r).map((a) => a.id)).toContain('desconhecidos');
  });

  it('nó sensor desconhecido junto de colmeias conhecidas: as conhecidas seguem', async () => {
    const { db } = banco([A()]);

    const r = await executarColeta(db, transporte([A(), B()]), { agora: relogio });

    expect(r.nos).toHaveLength(1);
    expect(r.nos[0].inseridas).toBe(288);
    expect(r.desconhecidos).toEqual([B().deviceId]);
    const aviso = montarAvisos(r).find((a) => a.id === 'desconhecidos')!;
    expect(aviso.gravidade).toBe('aviso');
  });
});

describe('queda no meio da transferência', () => {
  it('o que chegou fica salvo e é CONTADO — não "0 leituras"', async () => {
    const nos = [A({ quedaEm: 0.5 }), B()];
    const { db, nodeIds } = banco(nos);

    const r = await executarColeta(db, transporte(nos), { agora: relogio });

    const a = porDevice(r, A().deviceId);
    expect(a.problema).toBe('conexao-caiu');
    // 144 é o limite; os lotes de 60 só deixam passar 3 (180) antes da queda.
    expect(a.inseridas).toBe(180);
    expect(contarLeituras(db, nodeIds.get(A().deviceId))).toBe(180);
    expect(sessoes(db, nodeIds.get(A().deviceId)!)[0].outcome).toBe('parcial');

    // O aviso diz quantas ficaram salvas.
    const aviso = montarAvisos(r).find((i) => i.id.endsWith(':conexao-caiu'))!;
    expect(aviso.titulo).toBe('A conexão com a Colmeia A caiu no meio');
    expect(aviso.detalhe).toContain('180 leituras');
    expect(aviso.detalhe).toContain('Tentar de novo');

    // Feature 003 (D-305): a leitura mais nova anunciada não chegou, então não
    // dá para saber se o nó reiniciou na parte que faltou. As 180 ficam salvas,
    // contadas e SEM hora — fora do resumo — até a coleta terminar. (Antes da
    // 003, toda leitura salva entrava no resumo; a 003 mudou isso de propósito.)
    // SQL direto, para não depender do relógio real que `resumosDiarios` usa.
    expect(contarSemHora(db, nodeIds.get(A().deviceId)!)).toBe(180);
    expect(db.all<{ n: number | null }>(
      'SELECT SUM(sample_count + excluded_count) AS n FROM reading_daily WHERE node_id = ?',
      [nodeIds.get(A().deviceId)],
    )).toEqual([{ n: null }]);
  });

  it('uma colmeia com problema NÃO impede a coleta das outras', async () => {
    const nos = [A({ quedaEm: 0.5 }), B()];
    const { db } = banco(nos);

    const r = await executarColeta(db, transporte(nos), { agora: relogio });

    expect(porDevice(r, B().deviceId).problema).toBeNull();
    expect(porDevice(r, B().deviceId).inseridas).toBe(288);
    expect(resumir(r).desfecho).toBe('com-problemas');
  });

  it('tentar de novo retoma de onde parou, sem duplicar e sem perder', async () => {
    const { db } = banco([A()]);

    await executarColeta(db, transporte([A({ quedaEm: 0.5 })]), { agora: relogio });
    expect(contarLeituras(db)).toBe(180);

    const retomada = await executarColeta(db, transporte([A()]), { agora: relogio });

    expect(retomada.nos[0].problema).toBeNull();
    expect(retomada.nos[0].inseridas).toBe(108); // 288 - 180
    // `inseridas` sozinho não pega um cursor que volta ao zero (o INSERT OR
    // IGNORE absorve a repetição); `recebidas` pega.
    expect(retomada.nos[0].recebidas).toBe(108);
    expect(contarLeituras(db)).toBe(288);
    // Com a coleta completa, todas ganham hora, inclusive as 180 da primeira tentativa.
    const nodeId = garantirNode(db, A().deviceId, 'h-0001');
    expect(contarSemHora(db, nodeId)).toBe(0);
    expect(resumosDiarios(db, nodeId, 3650).length).toBeGreaterThan(0);
  });

  it('queda mesmo sem nada pendente: avisa em vez de dizer que está tudo salvo', async () => {
    const { db } = banco([A()]);
    await executarColeta(db, transporte([A()]), { agora: relogio });

    const r = await executarColeta(db, transporte([A({ quedaEm: 0.5 })]), { agora: relogio });

    expect(r.nos[0].problema).toBe('conexao-caiu');
    expect(r.nos[0].inseridas).toBe(0);
    // Sem nada salvo dessa colmeia, o bloco só diz o que fazer. A garantia de que
    // nada foi apagado fica uma vez só, no cabeçalho da tela.
    expect(montarAvisos(r)[0].detalhe).toBe('Toque em Tentar de novo para continuar de onde parou.');
  });
});

describe('dados com problema', () => {
  it('quadro corrompido: o lote é descartado e nada dele é gravado', async () => {
    const nos = [A({ quadroCorrompido: true }), B()];
    const { db, nodeIds } = banco(nos);

    const r = await executarColeta(db, transporte(nos), { agora: relogio });

    const a = porDevice(r, A().deviceId);
    expect(a.problema).toBe('dados-corrompidos');
    expect(a.inseridas).toBe(0);
    expect(contarLeituras(db, nodeIds.get(A().deviceId))).toBe(0);
    expect(sessoes(db, nodeIds.get(A().deviceId)!)[0].outcome).toBe('dados_corrompidos');
    expect(porDevice(r, B().deviceId).problema).toBeNull();
  });

  it('formato desconhecido: detectado ANTES de transferir, nada parcial no banco', async () => {
    const nos = [A({ versaoDesconhecida: 9 })];
    const { db, nodeIds } = banco(nos);
    let transferencias = 0;
    const espiao = envolver(transporte(nos), (s) => ({
      pullReadings: (...args: Parameters<NodeSession['pullReadings']>) => {
        transferencias += 1;
        return s.pullReadings(...args);
      },
    }));

    const r = await executarColeta(db, espiao, { agora: relogio });

    // Não faz sentido puxar milhares de leituras para só então descobrir que não
    // sabemos lê-las: a transferência nem começa.
    expect(transferencias).toBe(0);
    expect(r.nos[0].problema).toBe('formato-desconhecido');
    expect(r.nos[0].recebidas).toBe(0);
    expect(contarLeituras(db)).toBe(0);
    // A sessão é registrada mesmo assim (FR-010), sem versão, porque não a conhecemos.
    expect(sessoes(db, nodeIds.get(A().deviceId)!)).toEqual([
      { outcome: 'versao_desconhecida', proto_ver: null, record_count: 0 },
    ]);
  });

  it('falha ao gravar no celular vira aviso, não silêncio', async () => {
    const nos = [A()];
    const { db } = banco(nos);
    const comDiscoCheio: SqlDb = {
      ...db,
      run(sql, params) {
        if (sql.includes('INSERT OR IGNORE INTO reading')) throw new Error('database or disk is full');
        db.run(sql, params);
      },
      transaction: (fn) => db.transaction(() => fn()),
    };

    const r = await executarColeta(comDiscoCheio, transporte(nos), { agora: relogio });

    expect(r.nos[0].problema).toBe('nao-salvou');
    expect(r.nos[0].inseridas).toBe(0);
    expect(montarAvisos(r)[0].titulo).toBe('Não consegui salvar as leituras da Colmeia A no celular');
    // A mensagem técnica NUNCA chega ao usuário.
    expect(JSON.stringify(montarAvisos(r))).not.toMatch(/disk|database|SQL/i);
  });

  it('não conseguir gravar a persistência avisa, mesmo com a coleta ok', async () => {
    const nos = [A()];
    const { db } = banco(nos);
    const semPersistir: SqlDb = { ...db, persist: async () => { throw new Error('quota'); } };

    const r = await executarColeta(semPersistir, transporte(nos), { agora: relogio });

    expect(r.geral).toBe('nao-salvou');
    expect(resumir(r).desfecho).toBe('com-problemas');
    // Sem a gravação final, nada pode ser dado como salvo (Princípio VI).
    expect(resumir(r).gravouNoCelular).toBe(false);
  });

  it('a falha de gravação final passa na frente de um problema na busca', async () => {
    const nos = [A()];
    const { db } = banco(nos);
    const semPersistir: SqlDb = { ...db, persist: async () => { throw new Error('quota'); } };

    const r = await executarColeta(
      semPersistir, transporteQueFalha({ naBusca: new Error('x') }), { agora: relogio },
    );

    expect(r.geral).toBe('nao-salvou');
  });
});

/** Um transporte que falha como pedirmos, para os caminhos que o mock não cobre. */
function transporteQueFalha(opts: { naBusca?: unknown; aoConectar?: unknown }): Transport {
  const achado: DiscoveredNode = { transport: 'mock', handle: 'x', deviceId: A().deviceId };
  return {
    kind: 'mock',
    isSupported: async () => ({ ok: true }),
    preflight: async () => [],
    async *discover() {
      if (opts.naBusca) throw opts.naBusca;
      yield achado;
    },
    connect: async () => { throw opts.aoConectar; },
  };
}

describe('erros que o transporte real vai lançar', () => {
  it('Bluetooth desligado ou sem permissão na busca: sugere o diagnóstico', async () => {
    const { db } = banco([A()]);

    const r = await executarColeta(
      db, transporteQueFalha({ naBusca: new TransportError('unavailable') }), { agora: relogio },
    );

    expect(r.geral).toBe('transporte-indisponivel');
    expect(resumir(r).sugereDiagnostico).toBe(true);
  });

  it('não conseguiu conectar na colmeia achada', async () => {
    const { db, nodeIds } = banco([A()]);

    const r = await executarColeta(
      db, transporteQueFalha({ aoConectar: new TransportError('timeout') }), { agora: relogio },
    );

    expect(r.nos[0].problema).toBe('nao-conectou');
    expect(r.nos[0].relogio).toBe('nao-tentado');
    expect(resumir(r).sugereDiagnostico).toBe(true);
    // A sessão é registrada mesmo sem conexão (FR-010), sem versão nem leitura.
    expect(sessoes(db, nodeIds.get(A().deviceId)!)).toEqual([
      { outcome: 'nao_conectou', proto_ver: null, record_count: 0 },
    ]);
  });

  it('erro de programação vira "inesperado", nunca uma tela travada', async () => {
    const { db } = banco([A()]);

    const r = await executarColeta(
      db, transporteQueFalha({ aoConectar: new TypeError('x is undefined') }), { agora: relogio },
    );

    expect(r.nos[0].problema).toBe('inesperado');
    expect(JSON.stringify(montarAvisos(r))).not.toMatch(/undefined|TypeError/);
  });

  it('Bluetooth cai depois de achar a colmeia: também sugere o diagnóstico', async () => {
    const { db } = banco([A()]);

    const r = await executarColeta(
      db, transporteQueFalha({ aoConectar: new TransportError('unavailable') }), { agora: relogio },
    );

    expect(r.nos[0].problema).toBe('transporte-indisponivel');
    expect(resumir(r).sugereDiagnostico).toBe(true);
  });

  it('a busca cai depois de achar uma colmeia: nunca diz "não achei nenhuma"', async () => {
    const nos = [A(), B()];
    const { db } = banco(nos);
    const base = transporte(nos);
    const cai: Transport = {
      ...envolver(base, () => ({})),
      async *discover(o) {
        for await (const d of base.discover(o)) {
          yield d;
          throw new TransportError('connection-lost');
        }
      },
    };

    const r = await executarColeta(db, cai, { agora: relogio });

    expect(r.geral).not.toBe('nenhuma-colmeia');
    expect(r.nos).toHaveLength(1);
    expect(r.nos[0].inseridas).toBe(288); // a colmeia achada foi coletada mesmo assim
  });

  it('o mesmo nó anunciado várias vezes é coletado uma vez só', async () => {
    const nos = [A()];
    const { db, nodeIds } = banco(nos);
    const base = transporte(nos);
    const repetido: Transport = {
      ...envolver(base, () => ({})),
      async *discover(o) {
        for await (const d of base.discover(o)) { yield d; yield d; yield d; }
      },
    };

    const r = await executarColeta(db, repetido, { agora: relogio });

    expect(r.nos).toHaveLength(1);
    expect(sessoes(db, nodeIds.get(A().deviceId)!)).toHaveLength(1);
  });

  it('a busca termina antes da primeira conexão', async () => {
    const nos = [A(), B()];
    const { db } = banco(nos);
    const base = transporte(nos);
    const eventos: string[] = [];
    const espiao: Transport = {
      ...envolver(base, () => ({})),
      async *discover(o) {
        try {
          for await (const d of base.discover(o)) yield d;
        } finally {
          eventos.push('busca-encerrada');
        }
      },
      async connect(n) {
        eventos.push('conectar');
        return base.connect(n);
      },
    };

    await executarColeta(db, espiao, { agora: relogio });

    expect(eventos).toEqual(['busca-encerrada', 'conectar', 'conectar']);
  });

  it('transferência que acaba cedo sem lançar não vira sucesso', async () => {
    const nos = [A()];
    const { db, nodeIds } = banco(nos);
    const curta = envolver(transporte(nos), (s) => ({
      async *pullReadings(desde: number) {
        for await (const lote of s.pullReadings(desde)) { yield lote; return; }
      },
    }));

    const r = await executarColeta(db, curta, { agora: relogio });

    expect(r.nos[0].problema).toBe('conexao-caiu');
    expect(r.nos[0].inseridas).toBe(60); // o primeiro lote ficou salvo
    expect(resumir(r).desfecho).toBe('com-problemas');
    expect(sessoes(db, nodeIds.get(A().deviceId)!)[0].outcome).toBe('parcial');
  });

  it('um nó que trava ao fechar não prende a tela', async () => {
    const nos = [A()];
    const { db } = banco(nos);
    const travaAoFechar = envolver(transporte(nos), () => ({ close: () => new Promise(() => {}) }));

    const r = await executarColeta(db, travaAoFechar, { agora: relogio });

    expect(r.nos[0].inseridas).toBe(288);
  }, 6000);
});

describe('acerto do relógio do nó', () => {
  it('o nó recusa o horário: avisa, mas a coleta completa normalmente', async () => {
    const nos = [A({ horarioRecusado: true })];
    const { db } = banco(nos);
    const t = transporte(nos);

    const r = await executarColeta(db, t, { agora: relogio });

    expect(r.nos[0].relogio).toBe('falhou');
    expect(r.nos[0].inseridas).toBe(288);
    expect(r.nos[0].problema).toBeNull();
    expect(t.horarioRecebido(A().deviceId)).toBeUndefined();
    const aviso = montarAvisos(r).find((i) => i.id.endsWith(':relogio'))!;
    expect(aviso.gravidade).toBe('aviso');
    expect(aviso.titulo).toBe('Não consegui acertar o relógio do nó sensor da Colmeia A');
    expect(resumir(r).desfecho).toBe('sucesso');
  });

  it('o nó não sabe receber hora: não é problema do usuário, então não avisa', async () => {
    const nos = [A({ semSuporteHorario: true })];
    const { db } = banco(nos);

    const r = await executarColeta(db, transporte(nos), { agora: relogio });

    expect(r.nos[0].relogio).toBe('nao-suportado');
    expect(montarAvisos(r)).toEqual([]);
  });

  it('um nó que TRAVA no acerto não trava a coleta (limite de tempo)', async () => {
    const nos = [A()];
    const { db } = banco(nos);
    const travado = envolver(transporte(nos), () => ({ setTime: () => new Promise(() => {}) }));

    const r = await executarColeta(db, travado, { agora: relogio, timeoutRelogioMs: 25 });

    expect(r.nos[0].relogio).toBe('falhou');
    expect(r.nos[0].inseridas).toBe(288);
  });

  it('celular com data errada: NÃO envia a hora ao nó e marca as horas como estimadas', async () => {
    const nos = [A()];
    const { db, nodeIds } = banco(nos);
    const errado = () => Date.UTC(2020, 0, 1);
    const t = transporte(nos, errado);

    const r = await executarColeta(db, t, { agora: errado });

    expect(r.nos[0].relogio).toBe('celular-suspeito');
    expect(t.horarioRecebido(A().deviceId)).toBeUndefined();
    // A coleta segue: o dado bruto é guardado, só a hora fica marcada como estimada.
    expect(r.nos[0].inseridas).toBe(288);
    // Feature 003 (FR-012, FR-016): uma data antes do início do projeto não vira
    // referência. Sem outra referência, a hora fica em branco — não "estimada"
    // a partir de 2020.
    const horas = db.all<{ t_utc_ms: number | null; t_quality: number; t_motivo: string }>(
      'SELECT DISTINCT t_utc_ms, t_quality, t_motivo FROM leitura_hora',
    );
    expect(horas).toEqual([
      { t_utc_ms: null, t_quality: 3, t_motivo: 'ligada-sem-referencia' },
    ]);
    // A referência fica guardada, rejeitada (trusted = 0), para a história.
    expect(db.all<{ trusted: number }>(
      'SELECT trusted FROM clock_anchor WHERE node_id = ?', [nodeIds.get(A().deviceId)],
    )).toEqual([{ trusted: 0 }]);
    expect(montarAvisos(r).map((i) => i.id)).toContain('celular:relogio');
  });

  it('o relógio do celular andou para trás desde a última coleta: não envia e pergunta', async () => {
    const nos = [A()];
    const { db } = banco(nos);
    await executarColeta(db, transporte(nos), { agora: relogio });

    const umaHoraAntes = () => AGORA - 3_600_000;
    const t = transporte(nos, umaHoraAntes);
    const r = await executarColeta(db, t, { agora: umaHoraAntes });

    // Feature 003 (D-306): deixou de ser "suspeito" sem saída. É conflito de
    // hora, e a tela pergunta ao apicultor se a data está certa (FR-011).
    expect(r.nos[0].relogio).toBe('conflito');
    expect(r.nos[0].conflitoDeHora).toBeDefined();
    expect(t.horarioRecebido(A().deviceId)).toBeUndefined();
  });

  it('nó sem noção de tempo nenhuma: hora em branco, com o motivo (FR-016)', async () => {
    const nos = [A({ semNocaoDeTempo: true })];
    const { db } = banco(nos);

    await executarColeta(db, transporte(nos), { agora: relogio });

    // Antes da 003 isto saía "estimada" sem estimativa nenhuma (defeito 3 da spec).
    expect(db.all('SELECT DISTINCT t_utc_ms, t_quality, t_motivo FROM leitura_hora')).toEqual([
      { t_utc_ms: null, t_quality: 3, t_motivo: 'sem-nocao-de-tempo' },
    ]);
  });

  it('caso normal, primeira coleta: hora calculada, mas estimada até outra coleta conferir', async () => {
    const nos = [A()];
    const { db } = banco(nos);

    await executarColeta(db, transporte(nos), { agora: relogio });

    // Feature 003 (FR-012, D-301): a primeira referência não tem com o que ser
    // conferida. A conferência e a promoção a "ancorada" estão em hora-coleta.test.ts.
    expect(db.all('SELECT DISTINCT t_quality, t_motivo FROM leitura_hora')).toEqual([
      { t_quality: 2, t_motivo: 'referencia-nao-conferida' },
    ]);
    expect(db.all<{ n: number }>(
      'SELECT COUNT(*) AS n FROM leitura_hora WHERE t_utc_ms IS NULL',
    )[0].n).toBe(0);
  });
});

describe('desfecho que a tela mostra', () => {
  it('se algo foi salvo, a manchete reconhece isso — não diz "não consegui coletar"', async () => {
    const nos = [A({ quedaEm: 0.5 })];
    const { db } = banco(nos);

    const resumo = resumir(await executarColeta(db, transporte(nos), { agora: relogio }));

    expect(resumo.desfecho).toBe('com-problemas');
    expect(resumo.salvas).toBe(180);
  });

  it('nada salvo e problema: "não coletou"', async () => {
    const nos = [A({ quadroCorrompido: true })];
    const { db } = banco(nos);

    const resumo = resumir(await executarColeta(db, transporte(nos), { agora: relogio }));

    expect(resumo.desfecho).toBe('nao-coletou');
    expect(resumo.salvas).toBe(0);
  });
});

describe('reforço: o que os mutantes da revisão de 2026-10-14 mostraram faltar', () => {
  it('o progresso chega à tela: um evento por lote, terminando em 288 de 288', async () => {
    const nos = [A()];
    const { db } = banco(nos);
    const eventos: { nome: string; recebidas: number; total: number }[] = [];

    await executarColeta(db, transporte(nos), { agora: relogio, aoProgredir: (p) => eventos.push(p) });

    expect(eventos).toHaveLength(5); // 288 em lotes de 60
    expect(eventos.at(-1)).toEqual({ nome: 'Colmeia A', recebidas: 288, total: 288 });
    expect(eventos.map((e) => e.recebidas)).toEqual([60, 120, 180, 240, 288]);
  });

  it('na retomada o total do progresso é o que falta, não o histórico inteiro', async () => {
    const { db } = banco([A()]);
    await executarColeta(db, transporte([A({ quedaEm: 0.5 })]), { agora: relogio });
    const eventos: { recebidas: number; total: number }[] = [];

    await executarColeta(db, transporte([A()]), {
      agora: relogio, aoProgredir: ({ recebidas, total }) => eventos.push({ recebidas, total }),
    });

    expect(eventos.at(-1)).toEqual({ recebidas: 108, total: 108 });
  });

  it('a hora enviada ao nó é lida no instante do envio, não reaproveitada da âncora', async () => {
    const nos = [A()];
    const { db, nodeIds } = banco(nos);
    // Relógio que anda 1 s a cada leitura: distingue "agora" de "hora da âncora".
    let ms = AGORA;
    const andando = () => (ms += 1000);
    const t = transporte(nos, andando);

    await executarColeta(db, t, { agora: andando });

    const enviado = t.horarioRecebido(A().deviceId)!;
    const [{ t_utc_ms: ancora }] = db.all<{ t_utc_ms: number }>(
      'SELECT t_utc_ms FROM clock_anchor WHERE node_id = ?', [nodeIds.get(A().deviceId)],
    );
    const [{ started_ms: inicio }] = db.all<{ started_ms: number }>(
      'SELECT started_ms FROM pull_session WHERE node_id = ?', [nodeIds.get(A().deviceId)],
    );
    expect(enviado).toBeGreaterThan(ancora);
    expect(enviado).toBeGreaterThan(inicio);
  });

  it('fechar a sessão com problema não vira problema do usuário', async () => {
    const nos = [A()];
    const { db } = banco(nos);
    const fechaMal = envolver(transporte(nos), () => ({
      close: async () => { throw new TransportError('connection-lost'); },
    }));

    const r = await executarColeta(db, fechaMal, { agora: relogio });

    expect(r.nos[0].problema).toBeNull();
    expect(r.nos[0].inseridas).toBe(288);
    expect(resumir(r).desfecho).toBe('sucesso');
  });

  it('nó que não responde ao acerto do relógio (flag do mock): avisa e coleta tudo', async () => {
    const nos = [A({ semRespostaHorario: true })];
    const { db } = banco(nos);
    const t = transporte(nos);

    // Sem `timeoutRelogioMs` curto: o "sem resposta" vem do próprio nó, não do limite.
    const r = await executarColeta(db, t, { agora: relogio });

    expect(r.nos[0].relogio).toBe('falhou');
    expect(r.nos[0].problema).toBeNull();
    expect(r.nos[0].inseridas).toBe(288);
    expect(t.horarioRecebido(A().deviceId)).toBeUndefined();
    expect(montarAvisos(r).map((a) => a.id)).toEqual([`${A().deviceId}:relogio`]);
  });

  it('nó que diz "não sei receber hora" na resposta (e não nas capacidades): sem aviso', async () => {
    const nos = [A()];
    const { db } = banco(nos);
    const recusa = envolver(transporte(nos), () => ({
      setTime: async () => ({ ok: false, reason: 'unsupported' }),
    }));

    const r = await executarColeta(db, recusa, { agora: relogio });

    expect(r.nos[0].relogio).toBe('nao-suportado');
    expect(montarAvisos(r)).toEqual([]);
  });
});

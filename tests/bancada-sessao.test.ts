/**
 * Sessão do monitor e série do gráfico ao vivo (feature 004). O que importa
 * aqui é a honestidade: lacuna onde não chegou leitura válida, nunca uma reta
 * por cima do que não foi medido (Princípio VI), e memória com teto.
 */
import { describe, expect, it } from 'vitest';
import { SessaoDoMonitor, type LinhaDaPorta } from '@/core/bancada/sessao';
import {
  INTERROMPE_POR_STATUS_DO_GAS, escalaVertical, serieAoVivo,
} from '@/core/bancada/serie';
import { FormatoDeLinhaDesconhecidoError } from '@/core/decode/linhas';

const T0 = Date.UTC(2026, 9, 21, 13, 0, 0);
const ok = (texto: string): LinhaDaPorta => ({ texto, corte: null });
const linha = (temp: string, status = 0, tvoc = 100, rh = '60.00') =>
  ok(`T=${temp}C RH=${rh}% Status=${status} AQI=1 TVOC=${tvoc}ppb eCO2=450ppm`);

/** Uma leitura por segundo, a partir de T0, com o status de cada uma. */
function sessaoCom(statuses: number[], passoMs = 1000): SessaoDoMonitor {
  const s = new SessaoDoMonitor();
  statuses.forEach((st, i) => s.receber(linha(`${25 + i}.00`, st, 100 + i), T0 + i * passoMs));
  return s;
}

describe('sessão do monitor', () => {
  it('separa leituras, textos e ilegíveis, e ignora linha vazia', () => {
    const s = new SessaoDoMonitor();
    s.receber(ok('=== Inicializando AHT20 ==='), T0);
    s.receber(ok(''), T0 + 1);
    s.receber(linha('34.52', 1), T0 + 1000);
    s.receber(ok('T=34.52C RH=6'), T0 + 2000);
    s.receber(linha('34.60', 0), T0 + 3000);
    expect(s.contagens).toEqual({
      leituras: 2, gasForaDoNormal: 1, textos: 1, ilegiveis: 1, descartadas: 0,
    });
    expect(s.leituras.map((l) => l.leitura.tempC100)).toEqual([3452, 3460]);
    expect(s.inicioMs).toBe(T0);
    expect(s.ultimaChegadaMs).toBe(T0 + 3000);
  });

  it('linha com corte nunca vira leitura, mesmo que pareça completa', () => {
    const s = new SessaoDoMonitor();
    const completa = 'T=34.52C RH=61.20% Status=0 AQI=2 TVOC=180ppb eCO2=650ppm';
    // Sem fim de linha, "eCO2=650" pode ser "eCO2=6500" cortado.
    expect(s.receber({ texto: completa, corte: 'interrompida' }, T0))
      .toEqual({ tipo: 'ilegivel', texto: completa, motivo: 'interrompida' });
    expect(s.receber({ texto: 'x'.repeat(512), corte: 'longa-demais' }, T0).tipo).toBe('ilegivel');
    expect(s.contagens.leituras).toBe(0);
    expect(s.contagens.ilegiveis).toBe(2);
  });

  it('guarda a linha original e a hora do computador em cada leitura', () => {
    const s = new SessaoDoMonitor();
    const l = linha('34.52');
    s.receber(l, T0 + 42);
    expect(s.ultimaLeitura()).toMatchObject({ chegadaMs: T0 + 42, bruta: l.texto });
  });

  it('registro: mais recente primeiro, no máximo o teto', () => {
    const s = new SessaoDoMonitor(undefined, { leituras: 100, mensagens: 3 });
    for (let i = 0; i < 5; i++) s.receber(ok(`msg ${i}`), T0 + i);
    expect(s.mensagensRecentes().map((m) => m.texto)).toEqual(['msg 4', 'msg 3', 'msg 2']);
    expect(s.contagens.textos).toBe(5);
  });

  it('leituras: teto de memória descarta as mais antigas e conta quantas', () => {
    const s = new SessaoDoMonitor(undefined, { leituras: 3, mensagens: 50 });
    for (let i = 0; i < 5; i++) s.receber(linha(`2${i}.00`), T0 + i * 1000);
    expect(s.leituras.map((l) => l.leitura.tempC100)).toEqual([2200, 2300, 2400]);
    expect(s.contagens.descartadas).toBe(2);
    expect(s.contagens.leituras).toBe(5);
  });

  it('formato desconhecido é recusado ao criar a sessão', () => {
    expect(() => new SessaoDoMonitor('bancada-9')).toThrow(FormatoDeLinhaDesconhecidoError);
  });
});

describe('série ao vivo: lacunas', () => {
  const fim = (s: SessaoDoMonitor) => s.ultimaChegadaMs as number;

  it('leituras seguidas e válidas formam um trecho só', () => {
    const s = sessaoCom([0, 0, 0, 0]);
    const serie = serieAoVivo(s.leituras, 'temperatura', { fimMs: fim(s) });
    expect(serie.trechos).toHaveLength(1);
    expect(serie.trechos[0].map((p) => p.valor)).toEqual([2500, 2600, 2700, 2800]);
    expect(serie.gasNaoPronto).toEqual([]);
  });

  it('voláteis: a linha se interrompe onde o status do gás não é 0', () => {
    const s = sessaoCom([0, 0, 1, 1, 0, 0]);
    const serie = serieAoVivo(s.leituras, 'volateis', { fimMs: fim(s) });
    expect(serie.trechos.map((t) => t.map((p) => p.valor))).toEqual([[100, 101], [104, 105]]);
    expect(serie.gasNaoPronto).toEqual([{ inicioMs: T0 + 2000, fimMs: T0 + 3000 }]);
  });

  it('temperatura: o aquecimento do gás vira faixa, não lacuna (é o teste de bancada)', () => {
    expect(INTERROMPE_POR_STATUS_DO_GAS.temperatura).toBe(false);
    const s = sessaoCom([0, 2, 2, 0]);
    const serie = serieAoVivo(s.leituras, 'temperatura', { fimMs: fim(s) });
    expect(serie.trechos).toHaveLength(1);
    expect(serie.gasNaoPronto).toEqual([{ inicioMs: T0 + 1000, fimMs: T0 + 2000 }]);
  });

  it('mais de 3 s sem leitura interrompe a linha, nas três grandezas', () => {
    const s = new SessaoDoMonitor();
    s.receber(linha('25.00'), T0);
    s.receber(linha('25.10'), T0 + 1000);
    s.receber(linha('25.20'), T0 + 5000);  // 4 s depois: placa reiniciou, linha perdida
    s.receber(linha('25.30'), T0 + 6000);
    for (const g of ['temperatura', 'umidade', 'volateis'] as const) {
      const serie = serieAoVivo(s.leituras, g, { fimMs: T0 + 6000 });
      expect(serie.trechos.map((t) => t.length)).toEqual([2, 2]);
    }
  });

  it('linha ilegível entre duas leituras interrompe a linha, mesmo em menos de 3 s', () => {
    // Bytes perdidos no meio: a leitura de T0+2000 chegou cortada. Ligar 25,10
    // a 25,30 seria desenhar por cima de uma leitura que não chegou.
    const s = new SessaoDoMonitor();
    s.receber(linha('25.00'), T0);
    s.receber(linha('25.10'), T0 + 1000);
    s.receber({ texto: 'T=25.20C RH=6', corte: 'interrompida' }, T0 + 2000);
    s.receber(linha('25.30'), T0 + 3000);
    s.receber(linha('25.40'), T0 + 4000);
    for (const g of ['temperatura', 'umidade', 'volateis'] as const) {
      const serie = serieAoVivo(s.leituras, g, { fimMs: T0 + 4000 });
      expect(serie.trechos.map((t) => t.length), g).toEqual([2, 2]);
    }
  });

  it('linha ilegível ou texto antes da primeira leitura não interrompe', () => {
    const s = new SessaoDoMonitor();
    s.receber(ok('2C RH=61.20% Status=0 AQI=2 TVOC=180ppb eCO2=650ppm'), T0 - 600); // entrou no meio
    s.receber(ok('AHT20 OK'), T0 - 300);
    s.receber(linha('25.00'), T0);
    s.receber(linha('25.10'), T0 + 1000);
    expect(serieAoVivo(s.leituras, 'temperatura', { fimMs: T0 + 1000 }).trechos).toHaveLength(1);
  });

  it('texto da placa entre duas leituras interrompe a linha, mesmo em menos de 3 s', () => {
    // A placa avisou que a medição de T0+2000 falhou e não mandou a leitura.
    // Ligar 25,10 a 25,30 seria desenhar por cima de uma medição que falhou.
    const s = new SessaoDoMonitor();
    s.receber(linha('25.00'), T0);
    s.receber(linha('25.10'), T0 + 1000);
    s.receber(ok('Erro na leitura do AHT20 (CRC/timeout)'), T0 + 2000);
    s.receber(linha('25.30'), T0 + 3000);
    s.receber(linha('25.40'), T0 + 4000);
    for (const g of ['temperatura', 'umidade', 'volateis'] as const) {
      const serie = serieAoVivo(s.leituras, g, { fimMs: T0 + 4000 });
      expect(serie.trechos.map((t) => t.length), g).toEqual([2, 2]);
    }
  });

  it('exatamente 3 s ainda é contínuo', () => {
    const s = new SessaoDoMonitor();
    s.receber(linha('25.00'), T0);
    s.receber(linha('25.10'), T0 + 3000);
    expect(serieAoVivo(s.leituras, 'temperatura', { fimMs: T0 + 3000 }).trechos).toHaveLength(1);
  });

  it('valor sem número interrompe só a grandeza dele', () => {
    const s = new SessaoDoMonitor();
    s.receber(linha('25.00'), T0);
    s.receber(linha('nan'), T0 + 1000);
    s.receber(linha('25.20'), T0 + 2000);
    expect(serieAoVivo(s.leituras, 'temperatura', { fimMs: T0 + 2000 }).trechos).toHaveLength(2);
    expect(serieAoVivo(s.leituras, 'umidade', { fimMs: T0 + 2000 }).trechos).toHaveLength(1);
  });

  it('a faixa de aquecimento também se interrompe no silêncio', () => {
    const s = new SessaoDoMonitor();
    s.receber(linha('25.00', 1), T0);
    s.receber(linha('25.00', 1), T0 + 10_000);
    expect(serieAoVivo(s.leituras, 'temperatura', { fimMs: T0 + 10_000 }).gasNaoPronto).toEqual([
      { inicioMs: T0, fimMs: T0 },
      { inicioMs: T0 + 10_000, fimMs: T0 + 10_000 },
    ]);
  });

  it('só os últimos 5 minutos entram', () => {
    const s = sessaoCom(Array(400).fill(0));
    const serie = serieAoVivo(s.leituras, 'temperatura', { fimMs: fim(s) });
    expect(serie.pontos).toBe(301); // de fim-300 s até fim, inclusive
    expect(serie.inicioMs).toBe(fim(s) - 300_000);
    expect(serie.trechos[0][0].tMs).toBe(serie.inicioMs);
  });

  it('sem leitura nenhuma: série vazia, sem escala', () => {
    const serie = serieAoVivo([], 'temperatura', { fimMs: T0 });
    expect(serie.trechos).toEqual([]);
    expect(escalaVertical(serie.trechos, 100)).toBeNull();
  });
});

describe('escala vertical', () => {
  it('piso de escala: placa estável não vira montanha-russa', () => {
    const e = escalaVertical([[{ tMs: 0, valor: 2530 }, { tMs: 1, valor: 2535 }]], 100);
    expect(e).not.toBeNull();
    if (e) {
      expect(e.hi - e.lo).toBeGreaterThanOrEqual(100);
      expect(e.lo).toBeLessThanOrEqual(2530);
      expect(e.hi).toBeGreaterThanOrEqual(2535);
    }
  });

  it('marcas cobrem o intervalo inteiro, de baixo para cima', () => {
    const e = escalaVertical([[{ tMs: 0, valor: -325 }, { tMs: 1, valor: 3452 }]], 100);
    if (!e) throw new Error('sem escala');
    expect(e.marcas[0]).toBe(e.lo);
    expect(e.marcas[e.marcas.length - 1]).toBe(e.hi);
    expect([...e.marcas].sort((a, b) => a - b)).toEqual(e.marcas);
  });
});

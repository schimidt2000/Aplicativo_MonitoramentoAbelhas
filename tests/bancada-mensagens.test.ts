/**
 * O que a tela de cabo diz (feature 004): cada problema diz o que aconteceu e
 * o que fazer; a leitura aparece com a precisão do sensor; o gás nunca é CO₂.
 */
import { describe, expect, it } from 'vitest';
import { t, todasAsChaves, type ChaveTexto } from '@/core/i18n';
import {
  problemaDoCabo, textoDoProblema, textoSemCabo,
  type FaseDoCabo, type MotivoSemCabo, type ProblemaDoCabo,
} from '@/core/bancada/mensagens';
import { leituraNaTela, mensagemNaTela } from '@/core/bancada/apresentacao';
import { lerLinhaBancada0 } from '@/core/decode/bancada0';
import type { LeituraDeLinha } from '@/core/decode/linhas';
import type { TransportErrorCode } from '@/core/ports/transport';

const PROIBIDAS = /\b(erro|falha|offline|exception|undefined|null|NaN|stack|sqlite|transporterror|NetworkError|NotFoundError|serial port)\b/i;
const ACAO = /toque|abra|confira|feche|troque|reinicie|tire e recoloque|recarregue/i;

const PROBLEMAS: ProblemaDoCabo[] = [
  'nenhuma-porta', 'sem-permissao', 'porta-ocupada', 'cabo-solto', 'placa-parou', 'inesperado',
];
const MOTIVOS: MotivoSemCabo[] = [
  'app-no-celular', 'navegador-de-celular', 'endereco-nao-seguro', 'navegador-sem-porta-serial',
];

function leitura(l: string): LeituraDeLinha {
  const r = lerLinhaBancada0(l);
  if (r.tipo !== 'leitura') throw new Error('não é leitura');
  return r;
}

describe('problemas do cabo', () => {
  it('código + fase decidem o problema', () => {
    const casos: [TransportErrorCode, FaseDoCabo, ProblemaDoCabo][] = [
      ['not-found', 'escolher', 'nenhuma-porta'],
      ['permission', 'escolher', 'sem-permissao'],
      ['unavailable', 'escolher', 'inesperado'],
      ['unavailable', 'abrir', 'porta-ocupada'],
      ['permission', 'abrir', 'sem-permissao'],
      ['connection-lost', 'ler', 'cabo-solto'],
      ['timeout', 'ler', 'placa-parou'],
      ['not-found', 'ler', 'inesperado'],
    ];
    for (const [c, f, p] of casos) expect(problemaDoCabo(c, f)).toBe(p);
  });

  it('todo problema tem título e detalhe, diz o que fazer, sem jargão', () => {
    for (const p of PROBLEMAS) {
      const { titulo, detalhe } = textoDoProblema(p);
      expect(titulo.length).toBeGreaterThan(10);
      expect(detalhe).toMatch(ACAO);
      expect(`${titulo} ${detalhe}`).not.toMatch(PROIBIDAS);
      expect(`${titulo} ${detalhe}`).not.toMatch(/[{}]/);
    }
  });

  it('placa parada aponta para as mensagens da placa', () => {
    expect(textoDoProblema('placa-parou').detalhe).toMatch(/mensagens da placa/);
  });

  it('onde não dá, explica a alternativa; só o app do celular oferece a tela Coletar', () => {
    for (const m of MOTIVOS) {
      const s = textoSemCabo(m);
      expect(s.detalhe).toMatch(/Chrome|Edge|https|Coletar/);
      expect(`${s.titulo} ${s.detalhe}`).not.toMatch(PROIBIDAS);
      expect(s.oferecerColeta).toBe(m === 'app-no-celular');
    }
    expect(textoSemCabo('endereco-nao-seguro').detalhe).toMatch(/https/);
  });
});

describe('leitura na tela', () => {
  it('temperatura com 1 casa, umidade com 0, nunca 2 casas', () => {
    const v = leituraNaTela(leitura('T=34.52C RH=61.60% Status=0 AQI=2 TVOC=1180ppb eCO2=650ppm'));
    expect(v.temperatura).toBe('34,5 °C');
    expect(v.umidade).toBe('62 %');
    expect(v.volateis).toBe('1.180 ppb');
    expect(`${v.temperatura} ${v.umidade}`).not.toMatch(/\d,\d\d/);
  });

  it('eCO₂ só como "estimado — não é CO₂"', () => {
    const v = leituraNaTela(leitura('T=34.52C RH=61.20% Status=0 AQI=2 TVOC=180ppb eCO2=650ppm'));
    expect(v.gasEstimado).toBe('eCO₂ estimado — não é CO₂: 650 ppm');
  });

  it('voláteis sem número grande enquanto o sensor de gás aquece, mas com o que a placa mandou', () => {
    const v = leituraNaTela(leitura('T=27.10C RH=55.03% Status=1 (WARMUP) AQI=1 TVOC=0ppb eCO2=400ppm'));
    expect(v.volateis).toBe('—');
    expect(v.volateisNota).toMatch(/não está pronto/);
    expect(v.volateisNota).toMatch(/0 ppb/);
    expect(v.gas).toEqual({ texto: 'Sensor de gás aquecendo', nivel: 'aguardando' });
  });

  it('eCO₂ também perde o número enquanto o sensor de gás não está pronto', () => {
    for (const st of ['1 (WARMUP)', '2', '3', '9']) {
      const v = leituraNaTela(leitura(`T=27.10C RH=55.03% Status=${st} AQI=1 TVOC=0ppb eCO2=400ppm`));
      expect(v.gasEstimado, st).toMatch(/^eCO₂ estimado — não é CO₂: — /);
      expect(v.gasEstimado, st).toMatch(/400 ppm/);
      expect(v.gasEstimado, st).not.toMatch(/CO₂: 400/);
    }
  });

  it('status inválido ou desconhecido não é chamado de "ainda não está pronto"', () => {
    for (const st of ['3', '9']) {
      const v = leituraNaTela(leitura(`T=27.10C RH=55.03% Status=${st} AQI=1 TVOC=7ppb eCO2=400ppm`));
      expect(v.volateis).toBe('—');
      expect(v.volateisNota, st).not.toMatch(/ainda não está pronto/);
      expect(v.volateisNota, st).toMatch(/não vale/);
      expect(v.volateisNota, st).toMatch(/7 ppb/);
    }
  });

  it('estado do gás em palavra para cada status', () => {
    const gas = (s: string) =>
      leituraNaTela(leitura(`T=30.00C RH=50.00% Status=${s} AQI=1 TVOC=10ppb eCO2=400ppm`)).gas;
    expect(gas('0')).toEqual({ texto: 'Sensor de gás pronto', nivel: 'pronto' });
    expect(gas('2').nivel).toBe('aguardando');
    expect(gas('2').texto).toMatch(/primeira partida/);
    expect(gas('3')).toEqual({ texto: 'Sensor de gás com leitura inválida', nivel: 'invalido' });
    expect(gas('9').texto).toMatch(/desconhecida \(código 9\)/);
  });

  it('valor sem número aparece como "—" com explicação, nunca 0', () => {
    const v = leituraNaTela(leitura('T=nanC RH=nan% Status=0 AQI=1 TVOC=5ppb eCO2=400ppm'));
    expect(v.temperatura).toBe('—');
    expect(v.temperaturaNota).toMatch(/sem número/);
    expect(v.umidade).toBe('—');
  });

  it('registro: ilegível diz por quê, e lixo não desenha caractere de controle', () => {
    const m = mensagemNaTela({ chegadaMs: 0, tipo: 'ilegivel', texto: 'a\u0007b', motivo: 'caracteres-estranhos' });
    expect(m.aviso).toMatch(/^Linha ilegível — com caracteres estranhos/);
    expect(m.texto).toBe('a·b');
    expect(mensagemNaTela({ chegadaMs: 0, tipo: 'texto', texto: 'AHT20 OK' }).aviso).toBeNull();
  });
});

describe('textos da frente 004', () => {
  const chaves = todasAsChaves().filter((k) => k.startsWith('cabo.')) as ChaveTexto[];

  it('existem e nenhum chama o canal de gás de CO₂', () => {
    expect(chaves.length).toBeGreaterThan(50);
    for (const k of chaves) {
      const s = t(k).replace(/eCO₂/g, '').replace(/não é CO₂/g, '');
      expect(s, k).not.toMatch(/CO[₂2]/i);
    }
  });

  it('não usam vocabulário proibido pelo glossário', () => {
    for (const k of chaves) {
      expect(t(k), k).not.toMatch(/\b(sample|amostra|device|dispositivo|download|sync|hive|offline)\b/i);
    }
  });
});

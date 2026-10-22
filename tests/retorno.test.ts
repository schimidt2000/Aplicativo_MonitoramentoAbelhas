/**
 * Retorno redundante ao terminar a coleta (FR-007): vibração com padrões
 * distintos para sucesso e problema, e anúncio para o leitor de tela. Nenhum
 * dos dois pode derrubar a tela se a API faltar ou lançar.
 */
import { describe, expect, it } from 'vitest';
import { resumir, type Resumo } from '@/core/coleta/mensagens';
import type { ResultadoColeta, ResultadoNo } from '@/core/coleta/resultado';
import {
  VIBRACAO_PROBLEMA, VIBRACAO_SUCESSO, darRetornoDeColeta, padraoParaPlataforma,
  textoDoAnuncio,
} from '@/ui/retorno';

function no(over: Partial<ResultadoNo> = {}): ResultadoNo {
  return {
    deviceId: 'AAAA000000000001', nome: 'Colmeia 07',
    inseridas: 0, recebidas: 0, dias: 0, problema: null, relogio: 'acertado', ...over,
  };
}
const resumo = (over: Partial<ResultadoColeta> = {}): Resumo =>
  resumir({ nos: [], desconhecidos: [], geral: null, ...over });

const SUCESSO = resumo({ nos: [no({ inseridas: 288, recebidas: 288 })] });
const PROBLEMA = resumo({ nos: [no({ problema: 'conexao-caiu', inseridas: 180, recebidas: 180 })] });

function espiao() {
  const vibrou: number[][] = [];
  const anunciou: string[] = [];
  return {
    vibrou, anunciou,
    canais: {
      vibrar: (p: number[]) => { vibrou.push(p); },
      anunciar: (t: string) => { anunciou.push(t); },
    },
  };
}

describe('vibração', () => {
  it('sucesso e problema vibram com padrões diferentes, e problema dura mais', () => {
    const a = espiao();
    darRetornoDeColeta(SUCESSO, a.canais);
    const b = espiao();
    darRetornoDeColeta(PROBLEMA, b.canais);

    expect(a.vibrou).toEqual([[...VIBRACAO_SUCESSO]]);
    expect(b.vibrou).toEqual([[...VIBRACAO_PROBLEMA]]);
    const pulsos = (p: readonly number[]) => p.filter((_, i) => i % 2 === 1).length;
    expect(pulsos(VIBRACAO_PROBLEMA)).toBeGreaterThan(pulsos(VIBRACAO_SUCESSO));
  });

  it('"não coletou" também é problema para a vibração', () => {
    const a = espiao();
    darRetornoDeColeta(resumo({ geral: 'nenhuma-colmeia' }), a.canais);
    expect(a.vibrou).toEqual([[...VIBRACAO_PROBLEMA]]);
  });

  it('na web tira a espera inicial: navigator.vibrate lê [vibra, espera, …]', () => {
    expect(padraoParaPlataforma([0, 90], 'web')).toEqual([90]);
    expect(padraoParaPlataforma([0, 90], 'android')).toEqual([0, 90]);
    expect(padraoParaPlataforma([0, 90], 'ios')).toEqual([0, 90]);

    const a = espiao();
    darRetornoDeColeta(SUCESSO, { ...a.canais, plataforma: 'web' });
    expect(a.vibrou).toEqual([[90]]);
  });
});

describe('anúncio para o leitor de tela', () => {
  it('diz a manchete da tela', () => {
    expect(textoDoAnuncio(SUCESSO)).toBe('288 leituras salvas');
    expect(textoDoAnuncio(resumo({ nos: [no({ recebidas: 10 })] }))).toBe('Já estava tudo salvo');
    expect(textoDoAnuncio(PROBLEMA))
      .toBe('A coleta terminou com problemas. 180 leituras ficaram salvas no celular.');
    expect(textoDoAnuncio(resumo({ geral: 'nenhuma-colmeia' })))
      .toBe('Não consegui coletar. Nada que já estava no celular foi apagado.');
  });

  it('não afirma que algo ficou salvo quando a gravação final falhou', () => {
    const r = resumo({
      geral: 'nao-salvou', nos: [no({ problema: 'conexao-caiu', inseridas: 180, recebidas: 180 })],
    });
    expect(textoDoAnuncio(r)).not.toMatch(/ficou salva|ficaram salvas/);
    expect(textoDoAnuncio(r)).toMatch(/Tentar de novo/);
  });

  it('o anúncio sai junto com a vibração', () => {
    const a = espiao();
    darRetornoDeColeta(PROBLEMA, a.canais);
    expect(a.anunciou).toEqual([textoDoAnuncio(PROBLEMA)]);
  });
});

describe('nunca derruba a tela', () => {
  it('sem nenhum canal (API ausente), não lança', () => {
    expect(() => darRetornoDeColeta(SUCESSO, {})).not.toThrow();
  });

  it('vibração que lança não impede o anúncio, e vice-versa', () => {
    const anunciou: string[] = [];
    expect(() => darRetornoDeColeta(SUCESSO, {
      vibrar: () => { throw new Error('sem permissão VIBRATE'); },
      anunciar: (t) => { anunciou.push(t); },
    })).not.toThrow();
    expect(anunciou).toHaveLength(1);

    const vibrou: number[][] = [];
    expect(() => darRetornoDeColeta(SUCESSO, {
      vibrar: (p) => { vibrou.push(p); },
      anunciar: () => { throw new Error('sem leitor de tela'); },
    })).not.toThrow();
    expect(vibrou).toHaveLength(1);
  });
});

/**
 * Junção de pedaços em linhas (feature 004). Pela USB, uma linha chega partida
 * em qualquer lugar; o resultado tem de ser o mesmo, onde quer que o corte caia.
 */
import { describe, expect, it } from 'vitest';
import { JuntadorDeLinhas, type LinhaRecebida } from '@/transports/cable/linhas';
import { TAMANHO_MAXIMO_DE_LINHA } from '@/core/decode/linhas';

const L1 = 'T=34.52C RH=61.20% Status=0 AQI=2 TVOC=180ppb eCO2=650ppm';
const L2 = 'Aguardando estabilizacao do ENS160 (~3 min)...';

/** Só o que tem conteúdo: o `\r\n` partido gera uma linha vazia, que o leitor descarta. */
const comConteudo = (ls: LinhaRecebida[]) => ls.filter((l) => l.texto !== '');

function emPedacos(texto: string, cortes: number[]): LinhaRecebida[] {
  const j = new JuntadorDeLinhas();
  const saida: LinhaRecebida[] = [];
  let ini = 0;
  for (const c of [...cortes, texto.length]) {
    saida.push(...j.empurrar(texto.slice(ini, c)));
    ini = c;
  }
  return comConteudo(saida);
}

describe('juntar pedaços em linhas', () => {
  it('qualquer ponto de corte dá as mesmas duas linhas', () => {
    const texto = `${L1}\r\n${L2}\r\n`;
    const esperado = [{ texto: L1, corte: null }, { texto: L2, corte: null }];
    for (let c = 0; c <= texto.length; c++) {
      expect(emPedacos(texto, [c])).toEqual(esperado);
    }
  });

  it('um caractere por pedaço também', () => {
    const texto = `${L1}\r\n${L2}\r\n`;
    const cortes = Array.from({ length: texto.length - 1 }, (_, i) => i + 1);
    expect(emPedacos(texto, cortes).map((l) => l.texto)).toEqual([L1, L2]);
  });

  it('aceita \\r\\n, \\n e \\r sozinho', () => {
    const j = new JuntadorDeLinhas();
    expect(comConteudo(j.empurrar('a\r\nb\nc\rd\n')).map((l) => l.texto)).toEqual(['a', 'b', 'c', 'd']);
  });

  it('linha sem fim fica guardada até o fim chegar', () => {
    const j = new JuntadorDeLinhas();
    expect(j.empurrar('T=34.52C RH=')).toEqual([]);
    expect(j.pendente).toBe(12);
    expect(j.empurrar('61.20%\r\n')).toEqual([{ texto: 'T=34.52C RH=61.20%', corte: null }]);
    expect(j.pendente).toBe(0);
  });

  it('linha gigante sai uma vez como longa-demais, e o resto é descartado até o fim de linha', () => {
    const j = new JuntadorDeLinhas();
    const saida: LinhaRecebida[] = [];
    for (let i = 0; i < 50; i++) saida.push(...j.empurrar('x'.repeat(100)));
    // Memória limitada: nada cresce enquanto descarta.
    expect(j.pendente).toBe(0);
    saida.push(...j.empurrar(`yyy\r\n${L1}\r\n`));
    expect(saida).toHaveLength(2);
    expect(saida[0].corte).toBe('longa-demais');
    expect(saida[0].texto).toHaveLength(TAMANHO_MAXIMO_DE_LINHA);
    expect(saida[1]).toEqual({ texto: L1, corte: null });
  });

  it('linha exatamente no teto ainda é normal', () => {
    const j = new JuntadorDeLinhas();
    const cheia = 'z'.repeat(TAMANHO_MAXIMO_DE_LINHA);
    expect(j.empurrar(cheia)).toEqual([]);
    expect(j.empurrar('\n')).toEqual([{ texto: cheia, corte: null }]);
  });

  it('interromper entrega a metade como interrompida e recomeça limpo', () => {
    const j = new JuntadorDeLinhas();
    j.empurrar('T=34.52C RH=61');
    expect(j.interromper()).toEqual([{ texto: 'T=34.52C RH=61', corte: 'interrompida' }]);
    expect(j.interromper()).toEqual([]);
    expect(j.empurrar(`${L1}\n`)).toEqual([{ texto: L1, corte: null }]);
  });

  it('interromper durante o descarte volta a aceitar linhas', () => {
    const j = new JuntadorDeLinhas(10);
    expect(j.empurrar('x'.repeat(30))[0].corte).toBe('longa-demais');
    expect(j.interromper()).toEqual([]);
    expect(j.empurrar('ok\n')).toEqual([{ texto: 'ok', corte: null }]);
  });
});

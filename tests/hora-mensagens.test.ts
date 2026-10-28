/**
 * O que o apicultor lê sobre a hora (feature 003). Regras: só aparece quando
 * há algo a fazer (FR-020); diz o que aconteceu e o que fazer; nada de jargão
 * ("ligada", "referência", "âncora", "sincronizar"); data e hora brasileiras.
 */
import { describe, expect, it } from 'vitest';
import { todasAsChaves, t } from '@/core/i18n';
import { ptBR } from '@/core/i18n/pt-BR';
import {
  horaDoCelularEmDestaque, montarAvisos, perguntaDeHora, textoDepoisDaResposta,
} from '@/core/coleta/mensagens';
import type { ResultadoColeta, ResultadoNo } from '@/core/coleta/resultado';

function no(over: Partial<ResultadoNo> = {}): ResultadoNo {
  return {
    deviceId: 'AAAA000000000001', nome: 'Colmeia 07',
    inseridas: 10, recebidas: 10, dias: 0, problema: null, relogio: 'acertado', ...over,
  };
}
const resultado = (nos: ResultadoNo[]): ResultadoColeta => ({ nos, desconhecidos: [], geral: null });
const conflito = (refId: number, over: Partial<ResultadoNo> = {}) =>
  no({ relogio: 'conflito', conflitoDeHora: { nodeId: refId, refId }, ...over });

const JARGAO = /\b(ligada|refer[êe]ncia|[âa]ncora|sincroniz|timestamp|UTC|conflito|erro|falha)\b/i;

describe('a pergunta "a data do celular está certa?"', () => {
  it('não aparece sem conflito — nem para "adiado", que o apicultor não tem o que fazer', () => {
    expect(perguntaDeHora(resultado([no(), no({ relogio: 'adiado' })]))).toBeNull();
    expect(montarAvisos(resultado([no({ relogio: 'adiado' }), conflito(1)]))).toEqual([]);
  });

  it('uma colmeia: nomeia, explica e diz por que o relógio não foi acertado', () => {
    const p = perguntaDeHora(resultado([conflito(5)]))!;
    expect(p.alvos).toEqual([{ nodeId: 5, refId: 5, deviceId: 'AAAA000000000001', nome: 'Colmeia 07' }]);
    expect(p.titulo).toBe('A data do celular está certa?');
    expect(p.detalhe).toBe(
      'A hora do celular não combina com o tempo que o nó sensor da Colmeia 07 contou desde a última coleta. '
      + 'Por isso não acertei o relógio dela.',
    );
  });

  it('várias colmeias: uma pergunta só, com os nomes juntos', () => {
    const p = perguntaDeHora(resultado([
      conflito(1), conflito(2, { deviceId: 'B', nome: 'Colmeia 03' }),
      conflito(3, { deviceId: 'C', nome: 'Colmeia 11' }), no({ deviceId: 'D', nome: 'Colmeia 20' }),
    ]))!;
    expect(p.alvos.map((a) => a.refId)).toEqual([1, 2, 3]);
    expect(p.detalhe).toContain('os nós sensores de Colmeia 07, Colmeia 03 e Colmeia 11 contaram');
    expect(p.detalhe).toContain('relógio delas');
  });

  it('se o relógio chegou a ser acertado, não diz que não foi', () => {
    const p = perguntaDeHora(resultado([conflito(1, { relogio: 'acertado' })]))!;
    expect(p.detalhe).not.toMatch(/não acertei/);
  });

  it('data e hora em destaque no formato brasileiro, 24 h', () => {
    const ms = new Date(2026, 9, 21, 14, 5).getTime(); // hora local do celular
    expect(horaDoCelularEmDestaque(ms)).toBe('21/10/2026, 14:05');
  });

  it('depois da resposta: diz o que aconteceu e o que fazer', () => {
    expect(textoDepoisDaResposta('nao', { gravou: true, acertados: 0, naoAlcancadas: 0 }))
      .toBe('Acerte a data e a hora nas Configurações do celular. Depois toque em Coletar de novo.');
    expect(textoDepoisDaResposta('sim', { gravou: true, acertados: 1, naoAlcancadas: 0 }))
      .toBe('Combinado: vale a data deste celular. Relógio do nó sensor acertado.');
    expect(textoDepoisDaResposta('sim', { gravou: true, acertados: 0, naoAlcancadas: 1 }))
      .toContain('Vou tentar de novo na próxima coleta');
    expect(textoDepoisDaResposta('sim', { gravou: false, acertados: 0, naoAlcancadas: 0 }))
      .toContain('Toque de novo');
  });

  it('nenhum texto da frente 003 usa jargão, marcador sobrando ou "CO2"', () => {
    const chaves = todasAsChaves().filter((k) => k.startsWith('hora.') || k.startsWith('ajustes.demo.opcao.'));
    expect(chaves.length).toBeGreaterThan(15);
    for (const k of chaves) {
      const texto = ptBR[k];
      expect(texto, k).not.toMatch(JARGAO);
      expect(texto, k).not.toMatch(/CO2|CO₂/);
    }
    expect(t('hora.qualidade.ancorada')).toBe('ancorada');
  });
});

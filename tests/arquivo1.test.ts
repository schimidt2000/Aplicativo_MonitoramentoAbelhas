/**
 * O leitor `arquivo-1` (firmware 4cc7ed8, 2026-10-28): o MAC da placa em texto
 * na frente do arquivo, e a numeração que começa em 1 por um defeito conhecido.
 * O exemplo é montado byte a byte como o firmware grava, sem usar o nosso
 * codificador: um leitor e um codificador errados do mesmo jeito passariam
 * juntos (contracts/arquivo-1.md, D-520).
 */
import { describe, expect, it } from 'vitest';
import {
  ArquivoInvalidoError, CABECALHO_ARQUIVO_1, FORMATO_DE_ARQUIVO_ATUAL, PROTO_VER_DO_FORMATO,
  codificarArquivo0, codificarArquivo1, lerArquivo, seqDaMedicao, type MotivoArquivoInvalido,
} from '@/core/decode/arquivo';
import { lerLinhaDaPlaca } from '@/core/cabo/linhas';
import { estadoInicialPlacaNova, passoPlacaNova } from '@/core/cabo/placaNova';
import { estadoInicial, passo, type EstadoDoProtocolo, type Evento } from '@/core/cabo/protocolo';

const MAC = 'F0:F5:BD:12:AB:9C';
const T0 = 1793188800; // 2026-10-28 12:00 UTC

/** `/measurements.bin` como o 4cc7ed8 escreve: `WiFi.macAddress()` + '\0', uint64 LE, structs. */
function arquivoDoFirmware(
  mac: string, inicioS: number, ids: number[], valores?: (k: number) => [number, number, number, number],
): Uint8Array {
  const bytes: number[] = [];
  for (const c of mac) bytes.push(c.charCodeAt(0));
  bytes.push(0);
  const b = new Uint8Array(8 + 16);
  const v = new DataView(b.buffer);
  v.setUint32(0, inicioS, true);
  v.setUint32(4, 0, true);
  bytes.push(...b.subarray(0, 8));
  ids.forEach((id, k) => {
    const [t, rh, eco2, tvoc] = valores ? valores(k) : [30 + k, 60 + k, 400 + k, 100 + k];
    v.setFloat32(8, t, true);
    v.setFloat32(12, rh, true);
    v.setUint16(16, eco2, true);
    v.setUint16(18, tvoc, true);
    v.setUint32(20, id, true);
    bytes.push(...b.subarray(8, 24));
  });
  return Uint8Array.from(bytes);
}

function motivo(fn: () => unknown): MotivoArquivoInvalido | null {
  try {
    fn();
    return null;
  } catch (e) {
    if (e instanceof ArquivoInvalidoError) return e.motivo;
    throw e;
  }
}

describe('arquivo-1: o que o firmware 4cc7ed8 grava', () => {
  it('é o formato da coleta pelo cabo, com proto_ver 101', () => {
    expect(FORMATO_DE_ARQUIVO_ATUAL).toBe('arquivo-1');
    expect(PROTO_VER_DO_FORMATO['arquivo-1']).toBe(101);
    expect(CABECALHO_ARQUIVO_1).toBe(26);
  });

  it('lê o MAC, a hora de início e as medições (o exemplo do firmware, numerado de 1)', () => {
    const bytes = arquivoDoFirmware(MAC, T0, [1, 2, 3], (k) => [[34.5, 33.25, 35][k], [61, 62.5, 60][k], 450, 180]);
    expect(bytes.length).toBe(26 + 3 * 16);
    const a = lerArquivo('arquivo-1', bytes);
    expect(a).toMatchObject({ formato: 'arquivo-1', protoVer: 101, mac: MAC, inicioS: T0, numeracaoComecaEm: 1 });
    expect(a.medicoes.map((m) => m.id)).toEqual([1, 2, 3]);
    // A chave e a contagem saem da POSIÇÃO: a primeira medição é a do início.
    expect(a.leituras.map((l) => l.tNode)).toEqual([0, 1, 2]);
    expect(a.leituras.map((l) => l.seq)).toEqual([0, 1, 2].map((k) => seqDaMedicao(T0, k)));
    expect(a.leituras[0]).toMatchObject({ tempC100: 3450, rhX100: 6100, tvocPpb: 180, eco2Ppm: 450, tempBruto: 34.5 });
    expect(a.leituras[1]).toMatchObject({ tempC100: 3325, rhX100: 6250 });
  });

  it('a numeração corrigida (de 0) dá exatamente as mesmas chaves', () => {
    const de1 = lerArquivo('arquivo-1', arquivoDoFirmware(MAC, T0, [1, 2, 3]));
    const de0 = lerArquivo('arquivo-1', arquivoDoFirmware(MAC, T0, [0, 1, 2]));
    expect(de0.numeracaoComecaEm).toBe(0);
    expect(de0.leituras).toEqual(de1.leituras);
  });

  it('só com o cabeçalho (logo depois da coleta): zero medições, o MAC e a hora', () => {
    const a = lerArquivo('arquivo-1', arquivoDoFirmware(MAC, T0, []));
    expect(a).toMatchObject({ mac: MAC, inicioS: T0, numeracaoComecaEm: 0, leituras: [] });
  });

  it('MAC em minúsculas é aceito e guardado em maiúsculas', () => {
    expect(lerArquivo('arquivo-1', arquivoDoFirmware(MAC.toLowerCase(), T0, [1])).mac).toBe(MAC);
  });

  it('o codificador da placa simulada escreve o mesmo que o firmware', () => {
    expect(codificarArquivo1(MAC, T0, [0, 1, 2].map((k) => ({
      temperatura: 30 + k, umidade: 60 + k, eco2: 400 + k, tvoc: 100 + k,
    })))).toEqual(arquivoDoFirmware(MAC, T0, [1, 2, 3]));
  });
});

describe('arquivo-1: recusa inteira quando não fecha', () => {
  const bom = arquivoDoFirmware(MAC, T0, [1, 2, 3]);

  it('menor que o cabeçalho, ou com sobra que não é medição inteira', () => {
    expect(motivo(() => lerArquivo('arquivo-1', bom.subarray(0, 25)))).toBe('curto-demais');
    for (const sobra of [1, 8, 15]) {
      expect(motivo(() => lerArquivo('arquivo-1', bom.subarray(0, 26 + 16 + sobra)))).toBe('tamanho-nao-multiplo');
    }
  });

  it('o arquivo do firmware antigo (sem MAC) nunca é lido como este', () => {
    const antigo = codificarArquivo0(T0, [0, 1, 2].map(() => ({ temperatura: 30, umidade: 60, eco2: 400, tvoc: 100 })));
    expect(motivo(() => lerArquivo('arquivo-1', antigo))).toBe('tamanho-nao-multiplo');
    expect(motivo(() => lerArquivo('arquivo-0', bom))).toBe('tamanho-nao-multiplo');
  });

  it('sem o 0x00 depois do MAC, ou com um MAC que não é MAC', () => {
    const semFim = bom.slice();
    semFim[17] = 0x20;
    expect(motivo(() => lerArquivo('arquivo-1', semFim))).toBe('cabecalho-invalido');
    for (const ruim of ['F0-F5-BD-12-AB-9C', 'F0:F5:BD:12:AB:9G', 'F0:F5:BD:12:AB9C ']) {
      expect(motivo(() => lerArquivo('arquivo-1', arquivoDoFirmware(ruim, T0, [1])))).toBe('cabecalho-invalido');
    }
  });

  it('numeração que não começa em 0 nem em 1, que pula ou que volta', () => {
    expect(motivo(() => lerArquivo('arquivo-1', arquivoDoFirmware(MAC, T0, [2, 3, 4])))).toBe('numeracao-fora-de-ordem');
    expect(motivo(() => lerArquivo('arquivo-1', arquivoDoFirmware(MAC, T0, [1, 2, 4])))).toBe('numeracao-fora-de-ordem');
    expect(motivo(() => lerArquivo('arquivo-1', arquivoDoFirmware(MAC, T0, [1, 2, 0])))).toBe('numeracao-fora-de-ordem');
    expect(motivo(() => lerArquivo('arquivo-1', arquivoDoFirmware(MAC, T0, [0, 2])))).toBe('numeracao-fora-de-ordem');
  });

  it('hora de início acima de 2³²', () => {
    const b = bom.slice();
    new DataView(b.buffer).setUint32(22, 1, true);
    expect(motivo(() => lerArquivo('arquivo-1', b))).toBe('inicio-fora-de-faixa');
  });
});

describe('os textos do 4cc7ed8 na serial', () => {
  it('o firmware.ino escreve "HELLO" e "TIMEOUT" no lugar dos textos do teste', () => {
    expect(lerLinhaDaPlaca('HELLO')).toMatchObject({ tipo: 'diagnostico', pista: 'esperando-handshake' });
    expect(lerLinhaDaPlaca('TIMEOUT')).toMatchObject({ tipo: 'diagnostico', pista: 'desistiu-do-handshake' });
    expect(lerLinhaDaPlaca('Aguardando handshake USB...')).toMatchObject({ pista: 'esperando-handshake' });
  });

  it('primeiro boot: "does not exists." e a confirmação nova', () => {
    expect(lerLinhaDaPlaca('Measurement file does not exists.')).toMatchObject({ pista: 'esperando-hora-inicial' });
    expect(lerLinhaDaPlaca('Measurement file does not exist.')).toMatchObject({ pista: 'esperando-hora-inicial' });
    expect(lerLinhaDaPlaca('MAC e timestamp inicial salvos com sucesso!')).toMatchObject({ pista: 'hora-inicial-salva' });
    expect(lerLinhaDaPlaca('ERRO: nao foi possivel gravar o MAC completo!')).toMatchObject({ pista: 'hora-inicial-falhou' });
  });

  it('os dois erros novos são conhecidos', () => {
    expect(lerLinhaDaPlaca('ERROR:MAC_READ_FAILED')).toMatchObject({ tipo: 'erro', codigo: 'MAC_READ_FAILED' });
    expect(lerLinhaDaPlaca('ERROR:TEMP_MAC_WRITE_FAILED')).toMatchObject({ tipo: 'erro', codigo: 'TEMP_MAC_WRITE_FAILED' });
  });

  it('placa nova que não lê o próprio MAC: "não conseguiu guardar", na hora', () => {
    let e = estadoInicialPlacaNova();
    e = passoPlacaNova(e, { tipo: 'comecar', segundos: T0, agora: 0 }).estado;
    e = passoPlacaNova(e, { tipo: 'linha', texto: `Timestamp inicial recebido: ${T0}`, agora: 10 }).estado;
    const r = passoPlacaNova(e, { tipo: 'linha', texto: 'ERROR:MAC_READ_FAILED', agora: 20 });
    expect(r.acoes).toContainEqual({ tipo: 'terminar', desfecho: { resultado: 'placa-nao-salvou', horaEnviadaS: T0, horaRecebidaS: T0 } });
  });

  it('o MAC falhou DEPOIS da hora: a placa não chegou a mexer no arquivo, que continua lá', () => {
    for (const codigo of ['MAC_READ_FAILED', 'TEMP_MAC_WRITE_FAILED']) {
      let e: EstadoDoProtocolo = estadoInicial({ escutaInicialMs: 0 });
      const ir = (ev: Evento) => { const r = passo(e, ev); e = r.estado; return r; };
      ir({ tipo: 'comecar', agora: 0 });
      ir({ tipo: 'prazo', agora: 1 });
      ir({ tipo: 'linha', texto: 'READY', agora: 2 });
      ir({ tipo: 'linha', texto: 'FILE_INFO:26:00000000', agora: 3 });
      e = { ...e, fase: 'gravando', crc: 0, tamanho: 26 };
      ir({ tipo: 'gravou', agora: 4 });
      ir({ tipo: 'linha', texto: 'TRANSFER_OK', agora: 5 });
      ir({ tipo: 'linha', texto: 'REQUEST_TIMESTAMP', agora: 6 });
      ir({ tipo: 'hora', segundos: T0, agora: 7 });
      const fim = ir({ tipo: 'linha', texto: `ERROR:${codigo}`, agora: 8 });
      expect(fim.acoes.at(-1)).toMatchObject({
        tipo: 'terminar', desfecho: { motivo: 'erro-da-placa', erroDaPlaca: codigo, arquivoNaPlaca: 'continua', gravado: true },
      });
    }
  });
});

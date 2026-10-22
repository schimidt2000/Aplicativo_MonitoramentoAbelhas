/**
 * Os textos da coleta pelo cabo (feature 005, T531): FR-005, FR-010, FR-011,
 * FR-024, FR-028, FR-030, FR-032 e SC-004. As palavras proibidas de todo o
 * módulo de textos já são conferidas em tests/mensagens.test.ts; aqui, o que é
 * próprio do cabo: todo fim da conversa vira mensagem com o que fazer, nunca o
 * código cru da placa, e nada afirma que a placa apagou o que ela não apagou.
 */
import { describe, expect, it } from 'vitest';
import { montarAvisos, resumir } from '@/core/coleta/mensagens';
import type { ItemDeAviso, ResultadoColeta, ResultadoNo } from '@/core/coleta/resultado';
import type { ArquivoNaPlaca, DesfechoDaSessao, MotivoDoFim } from '@/core/cabo/protocolo';
import { ERROS_DA_PLACA, type CodigoErroDaPlaca } from '@/core/cabo/linhas';
import { problemaDoDesfecho, relogioDoDesfecho } from '@/core/cabo/resultado';
import {
  problemaDaPortaPorErro, textoDaPlacaNova, textoDoProblemaDaPorta, textoSemCaboParaColeta,
  type ProblemaDaPorta,
} from '@/core/cabo/mensagens';
import {
  OPCOES_INTERVALO_PLACA_S, PLACA_ACORDADA_MS, TEXTO_DA_FASE, fracaoDoProgresso, leiturasPelosBytes,
  pedeConfigurarPlacaNova, rotuloDoIntervalo, segundosAteDormir,
} from '@/core/cabo/passos';
import type { ResultadoPlacaNova } from '@/core/cabo/placaNova';
import type { MotivoSemCabo } from '@/core/bancada/mensagens';
import { t, todasAsChaves } from '@/core/i18n';

function desfecho(over: Partial<DesfechoDaSessao> = {}): DesfechoDaSessao {
  return {
    motivo: 'concluida', etapa: 'concluida', gravado: true, arquivoNaPlaca: 'apagou',
    erroDaPlaca: null, mac: null, intervaloS: null, tamanho: 600, crc: 1, horaEnviadaS: 1_792_000_000,
    pistas: [], tomouHelloComoHora: false, ...over,
  };
}

function noDoCabo(d: DesfechoDaSessao, over: Partial<ResultadoNo> = {}, cabo: Partial<NonNullable<ResultadoNo['cabo']>> = {}): ResultadoNo {
  return {
    deviceId: 'placa-0000000000000001', nome: 'Colmeia 07',
    inseridas: d.gravado ? 37 : 0, recebidas: d.gravado ? 37 : 0, dias: 3,
    problema: problemaDoDesfecho(d), relogio: relogioDoDesfecho(d),
    cabo: {
      desfecho: d, conferencia: null, semHora: 0, periodo: null, colmeiaPeloMac: false,
      simulada: false, conflitos: 0, ...cabo,
    },
    ...over,
  };
}

const r = (n: ResultadoNo): ResultadoColeta => ({ nos: [n], desconhecidos: [], geral: null });

/** Todo fim que a conversa consegue produzir, com o estado do arquivo que cabe a cada um. */
function todosOsFins(): DesfechoDaSessao[] {
  const fins: DesfechoDaSessao[] = [];
  const antes: MotivoDoFim[] = [
    'placa-nao-respondeu', 'sem-resposta', 'conexao-caiu', 'crc-diferente', 'protocolo-desconhecido',
    'formato-desconhecido', 'nao-gravou', 'inesperado',
  ];
  for (const motivo of antes) {
    fins.push(desfecho({ motivo, etapa: 'arquivo', gravado: false, arquivoNaPlaca: 'continua', horaEnviadaS: null }));
  }
  for (const tomou of [true, false, null]) {
    fins.push(desfecho({ motivo: 'placa-nova', etapa: 'handshake', gravado: false,
      arquivoNaPlaca: tomou ? 'continua' : 'sem-arquivo', horaEnviadaS: null, tomouHelloComoHora: tomou }));
  }
  // Depois de gravar, cada coisa que pode dar errado antes da hora.
  for (const motivo of ['sem-resposta', 'conexao-caiu', 'hora-nao-enviada'] as MotivoDoFim[]) {
    fins.push(desfecho({ motivo, etapa: 'confirmacao', arquivoNaPlaca: 'continua', horaEnviadaS: null }));
  }
  // Cada ERROR:* da placa, antes e depois de gravar, com o que a conversa diria do arquivo.
  for (const codigo of [...ERROS_DA_PLACA, 'desconhecido'] as Array<CodigoErroDaPlaca | 'desconhecido'>) {
    const arquivos: ArquivoNaPlaca[] = codigo === 'NO_FILE' ? ['sem-arquivo'] : ['continua', 'sem-arquivo', 'nao-se-sabe'];
    for (const arquivoNaPlaca of arquivos) {
      for (const gravado of [false, true]) {
        fins.push(desfecho({
          motivo: codigo === 'BACKUP_CLEANUP_FAILED' && gravado ? 'concluida-com-aviso' : 'erro-da-placa',
          etapa: gravado ? 'hora' : 'pedido', gravado, erroDaPlaca: codigo,
          arquivoNaPlaca: gravado ? arquivoNaPlaca : (arquivoNaPlaca === 'sem-arquivo' ? 'sem-arquivo' : 'continua'),
          horaEnviadaS: gravado && arquivoNaPlaca !== 'continua' ? 1_792_000_000 : null,
        }));
      }
    }
  }
  fins.push(desfecho());
  fins.push(desfecho({ motivo: 'sem-resposta', etapa: 'hora', arquivoNaPlaca: 'nao-se-sabe' }));
  return fins;
}

/** O que a placa manda ou o protocolo usa, e não pode chegar à tela. */
const CRU = /ERROR|[A-Z]{2,}_[A-Z]{2,}|READY|FILE_INFO|GET_FILE|RECEIVED|HELLO|CRC|checksum|\{[a-z]+\}|undefined|null|NaN/;

function textos(itens: ItemDeAviso[]): string[] {
  return itens.flatMap((i) => [i.titulo, i.detalhe]);
}

describe('todo fim da conversa vira mensagem em pt-BR (FR-005, SC-004)', () => {
  const fins = todosOsFins();

  it('a lista de fins não é vazia nem trivial', () => {
    expect(fins.length).toBeGreaterThan(100);
  });

  it('cada fim com problema tem título e o que fazer, sem código cru', () => {
    for (const d of fins) {
      const n = noDoCabo(d);
      const avisos = montarAvisos(r(n));
      for (const texto of textos(avisos)) {
        expect(texto, `${d.motivo}/${d.erroDaPlaca}`).not.toMatch(CRU);
        expect(texto.trim().length).toBeGreaterThan(3);
      }
      if (n.problema !== null) {
        const p = avisos.find((a) => a.gravidade === 'problema');
        expect(p, `${d.motivo}/${d.erroDaPlaca}`).toBeDefined();
        // O detalhe é o que fazer: mais do que repetir o título.
        expect(p!.detalhe.length).toBeGreaterThan(p!.titulo.length);
      }
    }
  });

  it('a manchete é a mesma da coleta existente (FR-028)', () => {
    for (const d of fins) {
      const s = resumir(r(noDoCabo(d)));
      expect(['sucesso', 'com-problemas', 'nao-coletou']).toContain(s.desfecho);
      // Leituras gravadas e algo depois com a placa: aviso, nunca "não coletou".
      if (d.gravado && problemaDoDesfecho(d) === null) expect(s.desfecho).toBe('sucesso');
      // Nada gravado: nunca "sucesso".
      if (!d.gravado) expect(s.desfecho).not.toBe('sucesso');
    }
  });

  it('nunca diz que a placa recomeçou sem a hora ter ido (FR-011)', () => {
    const recomecou = t('caboColeta.nota.recomecou');
    for (const d of fins) {
      const s = resumir(r(noDoCabo(d)));
      const disse = s.notas.includes(recomecou);
      if (disse) {
        expect(d.horaEnviadaS).not.toBeNull();
        expect(d.arquivoNaPlaca).toBe('apagou');
      }
    }
  });
});

describe('o que se sabe do arquivo da placa (FR-010, FR-011)', () => {
  it('hora do celular implausível: as leituras estão salvas, a placa continua com elas, a próxima não duplica', () => {
    const d = desfecho({ motivo: 'hora-nao-enviada', etapa: 'hora', arquivoNaPlaca: 'continua', horaEnviadaS: null });
    const avisos = montarAvisos(r(noDoCabo(d)));
    expect(avisos.map((a) => a.id)).toContain('placa-0000000000000001:cabo:hora-errada');
    expect(avisos.find((a) => a.id.endsWith('hora-errada'))!.detalhe).toBe(t('caboColeta.aviso.hora_errada.detalhe'));
    expect(resumir(r(noDoCabo(d))).desfecho).toBe('sucesso');
    // O aviso genérico de relógio do celular da 001 não se repete por cima.
    expect(avisos.map((a) => a.id)).not.toContain('celular:relogio');
  });

  it('gravou e a placa continua com o arquivo; gravou e não se sabe: cada um com o seu aviso', () => {
    const continua = montarAvisos(r(noDoCabo(desfecho({ motivo: 'sem-resposta', etapa: 'confirmacao', arquivoNaPlaca: 'continua', horaEnviadaS: null }))));
    expect(continua.map((a) => a.id)).toContain('placa-0000000000000001:cabo:continua');
    const naoSabe = montarAvisos(r(noDoCabo(desfecho({ motivo: 'sem-resposta', etapa: 'hora', arquivoNaPlaca: 'nao-se-sabe' }))));
    expect(naoSabe.map((a) => a.id)).toContain('placa-0000000000000001:cabo:nao-se-sabe');
  });

  it('a placa perdeu o arquivo depois de gravarmos: é problema, com o que fazer na placa', () => {
    const d = desfecho({ motivo: 'erro-da-placa', etapa: 'hora', erroDaPlaca: 'FILE_RESTORE_FAILED', arquivoNaPlaca: 'sem-arquivo' });
    const p = montarAvisos(r(noDoCabo(d))).find((a) => a.gravidade === 'problema')!;
    expect(p.titulo).toBe(t('caboColeta.problema.perdeu_arquivo.titulo', { nome: 'Colmeia 07' }));
  });

  it('MAC de outra colmeia: o resultado diz para onde as leituras foram (FR-021)', () => {
    const n = noDoCabo(desfecho(), { nome: 'Colmeia 03' }, { colmeiaPeloMac: true });
    const a = montarAvisos(r(n)).find((x) => x.id.endsWith('outra-colmeia'))!;
    expect(a.titulo).toContain('Colmeia 03');
  });

  it('colisão de chave é avisada com a contagem (D-519)', () => {
    const a = montarAvisos(r(noDoCabo(desfecho(), {}, { conflitos: 4 }))).find((x) => x.id.endsWith('conflito'))!;
    expect(a.detalhe).toContain('4');
  });
});

describe('conta da hora que não fecha (FR-030)', () => {
  const conferencia = (veredito: 'a-mais' | 'a-menos' | 'inicio-implausivel') => ({
    refId: 1, veredito, medicoes: 40, esperadas: 37, intervaloS: 7200,
  }) as unknown as NonNullable<ResultadoNo['cabo']>['conferencia'];

  it('diz quantas ficaram sem hora e manda conferir o intervalo da placa', () => {
    for (const v of ['a-mais', 'a-menos'] as const) {
      const a = montarAvisos(r(noDoCabo(desfecho(), {}, { conferencia: conferencia(v), semHora: 40 })))
        .find((x) => x.id.endsWith(':hora'))!;
      expect(a.detalhe).toContain('40');
      expect(a.detalhe).toContain(t('caboColeta.aviso.hora_nao_fechou.intervalo'));
      expect(a.detalhe).not.toMatch(CRU);
    }
  });

  it('início implausível tem aviso próprio; a conta que fecha não tem aviso', () => {
    const ini = montarAvisos(r(noDoCabo(desfecho(), {}, { conferencia: conferencia('inicio-implausivel'), semHora: 37 })));
    expect(ini.map((a) => a.id)).toContain('placa-0000000000000001:cabo:inicio');
    const fecha = montarAvisos(r(noDoCabo(desfecho(), {}, {
      conferencia: { ...conferencia('a-mais')!, veredito: 'fecha' } as never, semHora: 0,
    })));
    expect(fecha.filter((a) => a.id.includes(':cabo:hora') || a.id.endsWith(':inicio'))).toEqual([]);
  });
});

describe('textos da porta, da placa nova e de onde não há cabo', () => {
  it('cada problema da porta diz o que fazer', () => {
    for (const p of ['nenhuma', 'nao-apareceu', 'ocupada', 'sem-permissao'] as ProblemaDaPorta[]) {
      const x = textoDoProblemaDaPorta(p);
      expect(x.titulo.length).toBeGreaterThan(3);
      expect(x.detalhe.length).toBeGreaterThan(x.titulo.length);
      expect(`${x.titulo} ${x.detalhe}`).not.toMatch(CRU);
    }
  });

  it('erro de escolher ou abrir a porta → o problema certo', () => {
    expect(problemaDaPortaPorErro('permission', 'escolher')).toBe('sem-permissao');
    expect(problemaDaPortaPorErro('not-found', 'escolher')).toBe('nenhuma');
    expect(problemaDaPortaPorErro('unavailable', 'abrir')).toBe('ocupada');
    expect(problemaDaPortaPorErro('connection-lost', 'abrir')).toBe('nao-apareceu');
    expect(problemaDaPortaPorErro(null, 'abrir')).toBe('nao-apareceu');
  });

  it('placa nova: só "confirmada" é sucesso; os outros dizem o que fazer (FR-024)', () => {
    const resultados: ResultadoPlacaNova[] = ['confirmada', 'sem-confirmacao', 'ja-configurada', 'placa-nao-salvou', 'conexao-caiu'];
    for (const resultado of resultados) {
      const x = textoDaPlacaNova({ resultado, horaEnviadaS: 1_792_000_000, horaRecebidaS: null } as never);
      expect(x.ok).toBe(resultado === 'confirmada');
      expect(`${x.titulo} ${x.detalhe}`).not.toMatch(CRU);
      expect(x.detalhe.length).toBeGreaterThan(10);
    }
  });

  it('onde não há porta serial, explica o caminho em cada ambiente (FR-032)', () => {
    const motivos: MotivoSemCabo[] = ['app-no-celular', 'navegador-de-celular', 'endereco-nao-seguro', 'navegador-sem-porta-serial'];
    for (const m of motivos) {
      const x = textoSemCaboParaColeta(m);
      expect(x.detalhe.length).toBeGreaterThan(20);
      expect(`${x.titulo} ${x.detalhe}`).not.toMatch(CRU);
    }
  });
});

describe('a conta da tela (passos.ts)', () => {
  it('os 30 s contam do instante em que a placa acordou, e param em zero', () => {
    expect(PLACA_ACORDADA_MS).toBe(30_000);
    expect(segundosAteDormir(null, 5)).toBeNull();
    expect(segundosAteDormir(1_000, 1_000)).toBe(30);
    expect(segundosAteDormir(1_000, 1_001)).toBe(30);
    expect(segundosAteDormir(1_000, 30_999)).toBe(1);
    expect(segundosAteDormir(1_000, 31_000)).toBe(0);
    expect(segundosAteDormir(1_000, 99_000)).toBe(0);
  });

  it('leituras pelos bytes do arquivo-0: só as inteiras', () => {
    expect(leiturasPelosBytes(0)).toBe(0);
    expect(leiturasPelosBytes(8)).toBe(0);
    expect(leiturasPelosBytes(23)).toBe(0);
    expect(leiturasPelosBytes(24)).toBe(1);
    expect(leiturasPelosBytes(1368)).toBe(85);
  });

  it('a barra só existe enquanto o arquivo chega', () => {
    expect(fracaoDoProgresso({ fase: 'conversando' })).toBeNull();
    expect(fracaoDoProgresso({ fase: 'recebendo', recebidos: 0, total: 0 })).toBe(1);
    expect(fracaoDoProgresso({ fase: 'recebendo', recebidos: 342, total: 1368 })).toBe(0.25);
    expect(fracaoDoProgresso({ fase: 'recebendo', recebidos: 2000, total: 1368 })).toBe(1);
    expect(t(TEXTO_DA_FASE.gravando)).toBe(t('caboColeta.estado.gravando'));
  });

  it('o intervalo da placa em palavras, com o padrão marcado', () => {
    expect(OPCOES_INTERVALO_PLACA_S[0]).toBe(7200);
    expect(rotuloDoIntervalo(7200)).toBe(t('colmeia.intervalo.padrao', { opcao: 'A cada 2 horas' }));
    expect(rotuloDoIntervalo(3600)).toBe('A cada 1 hora');
    expect(rotuloDoIntervalo(1800)).toBe('A cada 30 minutos');
    expect(rotuloDoIntervalo(25)).toBe(t('colmeia.intervalo.teste'));
    expect(rotuloDoIntervalo(45)).toBe('A cada 45 segundos');
    const rotulos = OPCOES_INTERVALO_PLACA_S.map(rotuloDoIntervalo);
    expect(new Set(rotulos).size).toBe(rotulos.length);
  });

  it('"Configurar placa nova" só quando a placa está sem arquivo (FR-025)', () => {
    const nova = (tomou: boolean | null) => desfecho({ motivo: 'placa-nova', gravado: false, horaEnviadaS: null, tomouHelloComoHora: tomou, arquivoNaPlaca: tomou ? 'continua' : 'sem-arquivo' });
    expect(pedeConfigurarPlacaNova(nova(false))).toBe(true);
    expect(pedeConfigurarPlacaNova(nova(null))).toBe(true);
    // Tomou o HELLO como data 0: ela já mede; o caminho é coletar de novo.
    expect(pedeConfigurarPlacaNova(nova(true))).toBe(false);
    expect(pedeConfigurarPlacaNova(desfecho({ motivo: 'erro-da-placa', erroDaPlaca: 'FILE_RESTORE_FAILED', arquivoNaPlaca: 'sem-arquivo' }))).toBe(true);
    expect(pedeConfigurarPlacaNova(desfecho({ motivo: 'erro-da-placa', erroDaPlaca: 'NO_FILE', gravado: false, arquivoNaPlaca: 'sem-arquivo', horaEnviadaS: null }))).toBe(true);
    expect(pedeConfigurarPlacaNova(desfecho())).toBe(false);
    expect(pedeConfigurarPlacaNova(desfecho({ motivo: 'hora-nao-enviada', arquivoNaPlaca: 'continua', horaEnviadaS: null }))).toBe(false);
  });
});

describe('textos do app de campo no cabo: sem jargão de quem programa a placa', () => {
  // "grupo do firmware" é público da bancada (004), não de quem coleta na
  // colmeia: no app de campo o caminho para pedir ajuda é a pesquisadora,
  // como em toda a coleta (coleta.problema.*). Princípio V e .claude/rules/ui.md.
  const DO_CAMPO = /^(caboColeta|placaNova|colmeia|coleta|titulo)\./;
  const JARGAO = /\b(firmware|esp32|timestamp|handshake|crc|mac)\b/i;

  it('nenhuma chave do app de campo fala em firmware, CRC, MAC ou timestamp', () => {
    const ruins = (todasAsChaves() as string[])
      .filter((k) => DO_CAMPO.test(k))
      .map((k) => [k, t(k as Parameters<typeof t>[0])] as const)
      .filter(([, v]) => JARGAO.test(v));
    expect(ruins).toEqual([]);
  });

  it('o pedido de ajuda é o mesmo da coleta existente: avise a pesquisadora', () => {
    for (const k of [
      'caboColeta.problema.protocolo.detalhe', 'caboColeta.problema.formato.detalhe',
      'caboColeta.problema.nao_leu.detalhe', 'placaNova.nao_salvou.detalhe',
    ] as const) {
      expect(t(k)).toMatch(/avise a pesquisadora\.$/);
    }
  });
});

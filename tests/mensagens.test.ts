/**
 * As mensagens são o produto desta parte do app. Estes testes guardam as regras
 * de redação: dizer o que aconteceu e o que fazer, sem jargão, e sem prometer o
 * que não sabemos.
 */
import { describe, expect, it } from 'vitest';
import { t, todasAsChaves, tp } from '@/core/i18n';
import { montarAvisos, resumir } from '@/core/coleta/mensagens';
import type {
  CodigoProblema, ResultadoColeta, ResultadoNo,
} from '@/core/coleta/resultado';
import { desfechoDaSessao } from '@/core/coleta/resultado';

function no(over: Partial<ResultadoNo> = {}): ResultadoNo {
  return {
    deviceId: 'AAAA000000000001', nome: 'Colmeia 07',
    inseridas: 0, recebidas: 0, dias: 0, problema: null, relogio: 'acertado', ...over,
  };
}
const resultado = (over: Partial<ResultadoColeta> = {}): ResultadoColeta =>
  ({ nos: [], desconhecidos: [], geral: null, ...over });

const CODIGOS: CodigoProblema[] = [
  'nenhuma-colmeia', 'transporte-indisponivel', 'nao-conectou', 'conexao-caiu',
  'formato-desconhecido', 'dados-corrompidos', 'nao-salvou', 'inesperado',
];

/**
 * Palavras que não podem aparecer na tela, nem por acidente: "erro"/"falha" e
 * suas flexões (manchete de problema não acusa), jargão técnico e as palavras
 * que o glossário troca ("sync", "sample", "device"...).
 */
const PROIBIDAS = new RegExp(
  '\\b(erros?|falh(a|as|ou|aram|ar|ando)|offline|online|exception|undefined|null|NaN|stack'
  + '|sqlite|transporterror|timeout|ble|gatt|hive|device|dispositivo|sync|sincronizad[oa]|'
  + 'sample|amostras?|download|upload|app|co2)\\b'
  // "₂" não é caractere de palavra para o \b do JavaScript: fica fora do grupo.
  + '|co₂',
  'i',
);

/**
 * O que só o grupo do firmware pode garantir, e ainda não confirmou
 * (docs/integracao-firmware.md, pergunta 7): o que o nó sensor guarda.
 */
const PROMESSAS_SOBRE_O_SENSOR =
  /(colmeia|sensor|nó) (ainda )?(guarda|tem tudo|mant[eé]m)|continu(a|am) (guardando|no (nó|sensor))|(leituras|dados) (continuam|ficam) (na colmeia|no (nó|sensor))/i;

/**
 * Na COLETA, "nada se perdeu" é promessa sobre o nó (o celular não sabe o que
 * ficou lá). No ENVIO a mesma frase é verdade do nosso lado — as leituras
 * continuam no celular —, por isso este padrão só vale para coleta.*.
 */
const NADA_PERDIDO = /nada (foi|se) perd/i;

function todasAsMensagens() {
  const textos: string[] = [];
  for (const codigo of CODIGOS) {
    textos.push(...montarAvisos(resultado({ geral: codigo })).flatMap((i) => [i.titulo, i.detalhe]));
    for (const inseridas of [0, 1, 180]) {
      textos.push(...montarAvisos(resultado({
        nos: [no({ problema: codigo, inseridas })],
      })).flatMap((i) => [i.titulo, i.detalhe]));
    }
  }
  textos.push(...montarAvisos(resultado({
    nos: [no({ relogio: 'falhou' }), no({ deviceId: 'B', relogio: 'celular-suspeito' })],
    desconhecidos: ['X'],
  })).flatMap((i) => [i.titulo, i.detalhe]));
  textos.push(...montarAvisos(resultado({ desconhecidos: ['X', 'Y', 'Z'] }))
    .flatMap((i) => [i.titulo, i.detalhe]));
  return textos;
}

describe('redação das mensagens', () => {
  it('toda mensagem tem título e detalhe, sem marcador sobrando', () => {
    const textos = todasAsMensagens();
    expect(textos.length).toBeGreaterThan(30);
    for (const txt of textos) {
      expect(txt.trim().length).toBeGreaterThan(10);
      expect(txt).not.toMatch(/[{}]/);
    }
  });

  it('nenhuma usa "erro", "falha" ou "offline", nem vaza nome técnico', () => {
    for (const txt of todasAsMensagens()) expect(txt).not.toMatch(PROIBIDAS);
  });

  it('nenhuma promete o que o nó sensor guarda (suposição não confirmada)', () => {
    for (const txt of todasAsMensagens()) {
      expect(txt).not.toMatch(PROMESSAS_SOBRE_O_SENSOR);
      expect(txt).not.toMatch(NADA_PERDIDO);
    }
  });

  it('todo problema diz o que fazer em seguida', () => {
    // Ou manda tentar de novo, ou manda chegar perto, ou manda ver o diagnóstico/atualizar.
    const acao = /tente de novo|tentar de novo|chegue mais perto|diagnóstico|atualize|libere|avise a pesquisadora|confira/i;
    for (const codigo of CODIGOS) {
      for (const item of montarAvisos(resultado({ nos: [no({ problema: codigo })] }))) {
        expect(`${item.titulo} ${item.detalhe}`).toMatch(acao);
      }
    }
  });

  it('plural certo: 1 leitura / 180 leituras', () => {
    const um = montarAvisos(resultado({ nos: [no({ problema: 'conexao-caiu', inseridas: 1 })] }))[0];
    const varias = montarAvisos(resultado({ nos: [no({ problema: 'conexao-caiu', inseridas: 180 })] }))[0];
    expect(um.detalhe).toContain('A leitura que já tinha chegado ficou salva');
    expect(varias.detalhe).toContain('As 180 leituras que já tinham chegado ficaram salvas');
  });

  it('o aviso de data errada do celular aparece uma vez só, mesmo com várias colmeias', () => {
    const avisos = montarAvisos(resultado({
      nos: [no({ relogio: 'celular-suspeito' }), no({ deviceId: 'B', relogio: 'celular-suspeito' })],
    }));
    expect(avisos.filter((a) => a.id === 'celular:relogio')).toHaveLength(1);
  });

  it('"sem Bluetooth" vindo de várias colmeias aparece uma vez só', () => {
    const avisos = montarAvisos(resultado({
      nos: [
        no({ problema: 'transporte-indisponivel' }),
        no({ deviceId: 'B', problema: 'transporte-indisponivel' }),
      ],
    }));
    expect(avisos).toHaveLength(1);
  });

  it('problemas vêm antes de avisos', () => {
    const avisos = montarAvisos(resultado({
      nos: [no({ relogio: 'falhou' }), no({ deviceId: 'B', problema: 'conexao-caiu' })],
    }));
    expect(avisos.map((a) => a.gravidade)).toEqual(['problema', 'aviso']);
  });
});

describe('manchete (resumir)', () => {
  it('achar zero colmeias nunca é sucesso', () => {
    expect(resumir(resultado({ geral: 'nenhuma-colmeia' })).desfecho).toBe('nao-coletou');
    expect(resumir(resultado()).desfecho).toBe('nao-coletou');
  });

  it('só sensores desconhecidos não é sucesso', () => {
    expect(resumir(resultado({ desconhecidos: ['X'] })).desfecho).toBe('nao-coletou');
  });

  it('tudo certo é sucesso, mesmo com aviso de relógio', () => {
    expect(resumir(resultado({ nos: [no({ inseridas: 5, relogio: 'falhou' })] })).desfecho)
      .toBe('sucesso');
  });

  it('uma colmeia ok e outra com problema: com problemas', () => {
    const r = resultado({ nos: [no({ inseridas: 5 }), no({ deviceId: 'B', problema: 'conexao-caiu' })] });
    expect(resumir(r).desfecho).toBe('com-problemas');
  });

  it('se a gravação final falhou, nenhum bloco afirma que algo ficou salvo', () => {
    const r = resultado({
      geral: 'nao-salvou',
      nos: [no({ problema: 'conexao-caiu', inseridas: 180, recebidas: 180 })],
    });
    expect(resumir(r).gravouNoCelular).toBe(false);
    const textos = montarAvisos(r).map((i) => `${i.titulo} ${i.detalhe}`).join(' ');
    expect(textos).not.toMatch(/ficou salva|ficaram salvas/);
    // Com a gravação ok, a mesma colmeia diz o que ficou salvo.
    const ok = montarAvisos(resultado({ nos: r.nos })).map((i) => i.detalhe).join(' ');
    expect(ok).toMatch(/180 leituras que já tinham chegado ficaram salvas/);
  });

  it('conta os relógios acertados', () => {
    const r = resultado({ nos: [no(), no({ deviceId: 'B' }), no({ deviceId: 'C', relogio: 'falhou' })] });
    expect(resumir(r).relogiosAcertados).toBe(2);
  });
});

describe('desfecho gravado na sessão', () => {
  it('cada problema tem um nome estável; "ok" é só quando não há problema', () => {
    expect(desfechoDaSessao(null)).toBe('ok');
    const nomes = CODIGOS.map(desfechoDaSessao);
    expect(new Set(nomes).size).toBe(CODIGOS.length);
    expect(nomes).not.toContain('ok');
    // 'parcial' e 'versao_desconhecida' já existiam desde a 001 e não podem mudar.
    expect(desfechoDaSessao('conexao-caiu')).toBe('parcial');
    expect(desfechoDaSessao('formato-desconhecido')).toBe('versao_desconhecida');
  });
});

describe('módulo de textos', () => {
  it('todo ".um" tem o seu ".outros", e vice-versa', () => {
    const chaves = todasAsChaves() as string[];
    for (const k of chaves.filter((c) => c.endsWith('.um'))) {
      expect(chaves).toContain(k.replace(/\.um$/, '.outros'));
    }
    for (const k of chaves.filter((c) => c.endsWith('.outros'))) {
      expect(chaves).toContain(k.replace(/\.outros$/, '.um'));
    }
  });

  it('preenche variáveis e escolhe o singular só para 1', () => {
    expect(t('coleta.transferindo.titulo', { nome: 'Colmeia 07' })).toBe('Coletando de Colmeia 07');
    expect(tp('coleta.sucesso.salvas', 1)).toBe('1 leitura salva');
    expect(tp('coleta.sucesso.salvas', 0)).toBe('0 leituras salvas');
    expect(tp('coleta.sucesso.salvas', 1240)).toBe('1.240 leituras salvas');
  });

  it('variável não informada fica visível em vez de sumir', () => {
    expect(t('coleta.transferindo.titulo')).toBe('Coletando de {nome}');
  });
});

describe('todo texto do módulo, não só os avisos montados', () => {
  // Valor cru (com {marcadores}): o que importa aqui é a palavra, não a variável.
  const todos = todasAsChaves().map((k) => [k, t(k)] as const);

  it('nenhuma chave usa palavra proibida', () => {
    // A única menção permitida a CO₂ é a que diz que o canal NÃO é CO₂ (Princípio VI).
    // A feature 004 (monitor de bancada) mostra o número do sensor rotulado como
    // "eCO₂ estimado … não é CO₂": derivado no próprio rótulo, como o Princípio VI
    // pede. "eCO₂" e "não é CO₂" saem antes do teste; "CO₂" solto continua proibido.
    const ruins = todos
      .filter(([k]) => k !== 'colmeia.volateis.nao_e')
      .filter(([, v]) => PROIBIDAS.test(v.replace(/\beCO₂/g, '').replace(/não é CO₂/gi, '')));
    expect(ruins).toEqual([]);
  });

  it('nenhuma chave promete o que o nó sensor guarda', () => {
    expect(todos.filter(([, v]) => PROMESSAS_SOBRE_O_SENSOR.test(v))).toEqual([]);
    expect(todos.filter(([k, v]) => k.startsWith('coleta.') && NADA_PERDIDO.test(v)))
      .toEqual([]);
  });

  it('vocabulário do glossário: "nó sensor", nunca "sensor" sozinho; leitura, não "dado"', () => {
    for (const [k, v] of todos) {
      // "sensor de gás", "de temperatura", "de umidade" é o componente da placa,
      // como o próprio glossário escreve (feature 004); não é o nó sensor.
      const semNo = v.replace(/\bn[óo]s? sensor(es)?\b/gi, '')
        .replace(/\bsensor(es)? de (gás|temperatura|umidade)\b/gi, '');
      expect([k, semNo]).not.toEqual([k, expect.stringMatching(/\bsensor(es)?\b/i)]);
      expect([k, v]).not.toEqual([k, expect.stringMatching(/\bdados?\b/i)]);
      // Quem tem relógio é o nó sensor, não a colmeia (glossário: "acertar o relógio").
      expect([k, v]).not.toEqual([k, expect.stringMatching(/relógio da colmeia/i)]);
    }
  });

  it('os padrões pegam as paráfrases que já quase passaram (teste dos testes)', () => {
    for (const ruim of [
      'A coleta falhou', 'Ocorreram erros', 'Veja no app', 'Falha ao sincronizar', 'Não é CO₂.',
    ]) {
      expect(ruim).toMatch(PROIBIDAS);
    }
    for (const ruim of [
      'A colmeia ainda tem tudo', 'O nó sensor mantém a própria cópia',
      'As leituras continuam no sensor', 'A colmeia ainda guarda as leituras',
    ]) {
      expect(ruim).toMatch(PROMESSAS_SOBRE_O_SENSOR);
    }
    expect('Nada se perdeu').toMatch(NADA_PERDIDO);
    expect('Nada foi perdido').toMatch(NADA_PERDIDO);
    // Cada colmeia tem o seu nó sensor: no plural, são vários relógios.
    expect(tp('coleta.relogio.acertado', 3))
      .toBe('Relógios dos nós sensores acertados em 3 colmeias.');
    // Frases boas conhecidas não podem cair na rede.
    expect(t('coleta.problema.nada_apagado')).not.toMatch(PROIBIDAS);
    expect(t('envio.garantia.texto')).not.toMatch(PROMESSAS_SOBRE_O_SENSOR);
    expect(tp('coleta.problema.salvas_antes', 3)).not.toMatch(PROMESSAS_SOBRE_O_SENSOR);
  });
});

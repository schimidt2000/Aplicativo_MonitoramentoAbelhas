/**
 * Formatação, calendário, período e contrato com o servidor.
 */
import { describe, expect, it } from 'vitest';
import {
  criacaoDeEspecie, idColmeia, leituraDeLinha, motivoDoProblema, partesColmeia, qualidadeDeCodigo,
} from '../src/dados/contrato';
import { enderecoAceito } from '../src/dados/escolher';
import { MS_DIA, diaDeIso, isoDeDia } from '../src/dominio/calendario';
import { fmtDataHoraUtc, fmtDia, fmtTemp, fmtUmid, frescor } from '../src/dominio/formato';
import { MAX_DIAS_PERIODO, recortePlanilha, resolverPeriodo } from '../src/dominio/periodo';
import { filtrarPorApicultor } from '../src/dominio/visao';
import type { ColmeiaMacro } from '../src/dados/porta';

describe('precisão de tela nunca acima da exatidão do sensor', () => {
  it('temperatura com 1 casa e vírgula, correção aplicada só aqui', () => {
    expect(fmtTemp(3456)).toBe('34,6 °C');
    expect(fmtTemp(3456, -50)).toBe('34,1 °C');
    expect(fmtTemp(-149)).toBe('-1,5 °C');
    expect(fmtTemp(null)).toBe('—');
  });

  it('umidade sem casa decimal', () => {
    expect(fmtUmid(6789)).toBe('68 %');
    expect(fmtUmid(null)).toBe('—');
  });
});

describe('calendário em UTC', () => {
  it('ida e volta entre dia e aaaa-mm-dd', () => {
    const d = diaDeIso('2026-10-21')!;
    expect(isoDeDia(d)).toBe('2026-10-21');
    expect(fmtDia(d)).toBe('21/10/2026');
    expect(fmtDataHoraUtc(d * MS_DIA + 3_600_000 * 23 + 59_000)).toBe('21/10/2026 23:00:59');
  });

  it('data inválida não vira dia', () => {
    expect(diaDeIso('2026-02-30')).toBeNull();
    expect(diaDeIso('21/10/2026')).toBeNull();
    expect(diaDeIso('')).toBeNull();
  });
});

describe('idade do dado em palavras', () => {
  const agora = 20_000 * MS_DIA + 10 * 3_600_000;
  it.each([
    [null, 'Sem leitura ainda'],
    [agora - 1000, 'Hoje'],
    [agora - MS_DIA, 'Ontem'],
    [agora - 3 * MS_DIA, 'Há 3 dias'],
    [agora - 7 * MS_DIA, 'Há 7 dias'],
    [agora - 14 * MS_DIA, 'Há 2 semanas'],
    [agora - 26 * MS_DIA, 'Há 3 semanas'],
    [agora - 70 * MS_DIA, 'Há 2 meses'],
    [agora - 31 * 7 * MS_DIA, 'Há 7 meses'],
  ])('%s -> %s', (ms, esperado) => {
    expect(frescor(ms, agora, 0)).toBe(esperado);
  });

  it('hoje e ontem no calendário de quem lê, não no dia UTC', () => {
    // 21/10 às 21h30 em UTC-3 = 22/10 às 00h30 UTC; leitura às 20h locais (23h UTC).
    const agoraUtc = Date.UTC(2026, 9, 22, 0, 30);
    const leitura = Date.UTC(2026, 9, 21, 23, 0);
    expect(frescor(leitura, agoraUtc, 180)).toBe('Hoje');
    // Leitura das 23h locais de 20/10 (02h UTC de 21/10) é de ontem para quem lê.
    expect(frescor(Date.UTC(2026, 9, 21, 2, 0), agoraUtc, 180)).toBe('Ontem');
  });
});

describe('período da colmeia', () => {
  it('7 e 30 dias terminam na última leitura, inclusive', () => {
    expect(resolverPeriodo({ tipo: '7' }, 100)).toEqual({ ok: true, deDia: 94, ateDia: 100 });
    expect(resolverPeriodo({ tipo: '30' }, 100)).toEqual({ ok: true, deDia: 71, ateDia: 100 });
  });

  it('sem leitura, 7/30 não têm período; datas livres ainda funcionam', () => {
    expect(resolverPeriodo({ tipo: '7' }, null)).toEqual({ ok: false, motivo: 'sem-leitura' });
    expect(resolverPeriodo({ tipo: 'livre', deIso: '2026-10-01', ateIso: '2026-10-01' }, null).ok).toBe(true);
  });

  it('datas invertidas, inválidas ou longas demais são recusadas com motivo', () => {
    expect(resolverPeriodo({ tipo: 'livre', deIso: '2026-10-02', ateIso: '2026-10-01' }, 1))
      .toEqual({ ok: false, motivo: 'invalido' });
    expect(resolverPeriodo({ tipo: 'livre', deIso: '', ateIso: '2026-10-01' }, 1))
      .toEqual({ ok: false, motivo: 'invalido' });
    const de = isoDeDia(diaDeIso('2026-10-01')! - MAX_DIAS_PERIODO);
    expect(resolverPeriodo({ tipo: 'livre', deIso: de, ateIso: '2026-10-01' }, 1))
      .toEqual({ ok: false, motivo: 'longo' });
  });
});

describe('recorte da planilha', () => {
  it('o último dia escolhido entra inteiro, até 23:59:59.999 UTC', () => {
    const r = recortePlanilha('2026-10-01', '2026-10-07');
    if (!r.ok) throw new Error('recorte válido recusado');
    const ultimoDia = diaDeIso('2026-10-07')!;
    expect(r.deMs).toBe(diaDeIso('2026-10-01')! * MS_DIA);
    expect(r.ateMs).toBe((ultimoDia + 1) * MS_DIA);
    const ultimaLeituraDoDia = ultimoDia * MS_DIA + 23 * 3_600_000 + 45 * 60_000;
    expect(ultimaLeituraDoDia >= r.deMs && ultimaLeituraDoDia < r.ateMs).toBe(true);
  });

  it('um dia só também é um recorte de 24 h', () => {
    const r = recortePlanilha('2026-10-01', '2026-10-01');
    expect(r.ok && r.ateMs - r.deMs).toBe(MS_DIA);
  });

  it('datas invertidas ou inválidas são recusadas', () => {
    expect(recortePlanilha('2026-10-02', '2026-10-01').ok).toBe(false);
    expect(recortePlanilha('', '2026-10-01').ok).toBe(false);
  });
});

describe('busca por apicultor, só no navegador', () => {
  const c = (apicultorNome: string) => ({ apicultorNome } as ColmeiaMacro);
  it('ignora acento e caixa', () => {
    const lista = [c('José Erivaldo'), c('Maria da Conceição'), c('Francisca')];
    expect(filtrarPorApicultor(lista, 'jose').map((x) => x.apicultorNome)).toEqual(['José Erivaldo']);
    expect(filtrarPorApicultor(lista, 'CONCEICAO')).toHaveLength(1);
    expect(filtrarPorApicultor(lista, '  ')).toHaveLength(3);
  });
});

describe('contrato com o servidor', () => {
  it('id composto da colmeia: ida e volta, sem nome de pessoa', () => {
    const id = idColmeia('3f1c-uuid', 'h-1');
    expect(partesColmeia(id)).toEqual({ beekeeperId: '3f1c-uuid', hiveId: 'h-1' });
    expect(partesColmeia('sem-separador')).toBeNull();
  });

  it('qualidade da hora: código desconhecido vira "desconhecida", nunca "ancorada"', () => {
    expect(qualidadeDeCodigo(1, 1)).toBe('ancorada');
    expect(qualidadeDeCodigo(2, 1)).toBe('estimada');
    expect(qualidadeDeCodigo(7, 1)).toBe('desconhecida');
    expect(qualidadeDeCodigo(1, null)).toBe('desconhecida');
  });

  it('leitura do servidor mantém o bruto e o nulo', () => {
    const l = leituraDeLinha({
      device_id: 'N1', seq: 9, t_utc_ms: null, t_quality: 1, temp_c100: 3456, rh_x100: null,
      tvoc_ppb: 1, eco2_ppm: null, gas_status: null, sensor_epoch: 2, proto_ver: 1,
    }, 'b~h');
    expect(l).toMatchObject({ tUtcMs: null, qualidadeHora: 'desconhecida', tempC100: 3456, umidX100: null, epocaSensor: 2 });
  });

  it('criação a partir do texto livre de espécie', () => {
    expect(criacaoDeEspecie('Apis mellifera')).toBe('apis');
    expect(criacaoDeEspecie('Jandaíra')).toBe('meliponineo');
    expect(criacaoDeEspecie('Uruçu-nordestina')).toBe('meliponineo');
    expect(criacaoDeEspecie('')).toBeNull();
    expect(criacaoDeEspecie('outra')).toBeNull();
  });

  it('sem rede é diferente de problema no servidor', () => {
    expect(motivoDoProblema(new TypeError('Failed to fetch'), true)).toBe('sem-internet');
    expect(motivoDoProblema({ message: 'permission denied' }, true)).toBe('servidor');
    expect(motivoDoProblema(new Error('x'), false)).toBe('sem-internet');
  });

  it('só aceita servidor com TLS (http só em localhost)', () => {
    expect(enderecoAceito('https://abc.supabase.co')).toBe(true);
    expect(enderecoAceito('http://127.0.0.1:54321')).toBe(true);
    expect(enderecoAceito('http://abc.supabase.co')).toBe(false);
    expect(enderecoAceito('lixo')).toBe(false);
  });
});

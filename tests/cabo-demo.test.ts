/**
 * A placa simulada da demonstração (feature 005, FR-033, US6), do jeito que a
 * tela `src/app/coleta-cabo.tsx` a usa: a mesma placa da página, os prazos de
 * verdade da conversa (`CONFIG_PADRAO`), o problema escolhido em Ajustes →
 * Demonstração, e um ciclo da placa por vez.
 */
import { describe, expect, it } from 'vitest';
import { coletarPeloCabo } from '@/data/coletaCabo';
import { contarLeituras, garantirApiario, garantirColmeia } from '@/data/repo';
import { executarPlacaNova } from '@/core/cabo/sessao';
import { resumir } from '@/core/coleta/mensagens';
import { falhasDaPlacaDemo, placaDeDemonstracao, placaNovaDeDemonstracao } from '@/transports';
import type { FalhaDemo } from '@/core/preferencias';
import { bancoDeTeste } from './apoio/banco';

function banco() {
  const db = bancoDeTeste();
  garantirApiario(db, 'ap', 'Meliponário Serra Verde');
  garantirColmeia(db, 'h1', 'ap', 'Colmeia 07');
  return db;
}

/** O que a tela faz ao tocar em Coletar com a placa simulada. */
let ciclo: Promise<void> = Promise.resolve();
async function coletarNaTela(db: ReturnType<typeof banco>, falha: FalhaDemo = 'nenhuma') {
  const placa = placaDeDemonstracao();
  placa.falhas = falhasDaPlacaDemo(falha);
  await ciclo;
  const { canal, terminou } = placa.acordar('botao');
  ciclo = terminou.catch(() => {});
  const t0 = Date.now();
  const r = await coletarPeloCabo(db, canal, { hiveId: 'h1', src: 'mock' });
  return { r, ms: Date.now() - t0 };
}

describe('placa simulada da demonstração, com os prazos de verdade', () => {
  const db = banco();

  it('a primeira coleta traz os 3 dias da placa, com hora estimada, em menos de 2 s', async () => {
    const { r, ms } = await coletarNaTela(db);
    expect(r.nos[0]).toMatchObject({ inseridas: 37, problema: null, relogio: 'acertado' });
    expect(r.nos[0].cabo?.simulada).toBe(true);
    expect(r.nos[0].cabo?.semHora).toBe(0);
    expect(resumir(r).desfecho).toBe('sucesso');
    // SC-005: a conversa inteira cabe folgada nos 30 s de cada espera da placa.
    expect(ms).toBeLessThan(2_000);
  });

  it('logo em seguida, outra coleta: só a medição nova, sem duplicar', async () => {
    const { r } = await coletarNaTela(db);
    expect(r.nos[0]).toMatchObject({ problema: null });
    expect(contarLeituras(db)).toBe(37 + r.nos[0].inseridas);
  });

  it('cada problema da demonstração vira o fim certo, e a placa fica com o arquivo', async () => {
    const antes = contarLeituras(db);
    const queda = await coletarNaTela(db, 'queda');
    expect(queda.r.nos[0].cabo?.desfecho).toMatchObject({ motivo: 'conexao-caiu', gravado: false, arquivoNaPlaca: 'continua' });
    const crc = await coletarNaTela(db, 'corrompido');
    expect(crc.r.nos[0].cabo?.desfecho).toMatchObject({ motivo: 'crc-diferente', gravado: false });
    const troca = await coletarNaTela(db, 'relogio-recusado');
    expect(troca.r.nos[0].cabo?.desfecho).toMatchObject({ erroDaPlaca: 'TEMP_WRITE_FAILED', gravado: true, arquivoNaPlaca: 'continua' });
    expect(contarLeituras(db)).toBeGreaterThan(antes);
    // E sem problema de novo: completa, e o que já estava não duplica.
    const ok = await coletarNaTela(db);
    expect(ok.r.nos[0].cabo?.desfecho.motivo).toBe('concluida');
  });

  it('configurar placa nova na demonstração: a placa confirma', async () => {
    const placa = placaNovaDeDemonstracao();
    const { canal, terminou } = placa.acordar('desconhecida');
    const agoraS = Math.floor(Date.now() / 1000);
    const { desfecho } = await executarPlacaNova(canal, agoraS);
    await canal.fechar();
    expect(desfecho.resultado).toBe('confirmada');
    expect(placa.inicioS).toBe(agoraS);
    placa.desligarDaTomada();
    await terminou.catch(() => {});
  });
});

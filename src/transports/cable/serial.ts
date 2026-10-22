/**
 * Leitura da placa pela porta serial USB do navegador (Web Serial). Este é o
 * ÚNICO arquivo do app que toca a porta — `scripts/check-fronteira.sh`
 * reprova o acesso fora de `src/transports/`.
 *
 * Os tipos da Web Serial não estão no `lib.dom` do TypeScript; em vez de
 * instalar `@types/w3c-web-serial`, declaramos aqui só o que usamos.
 *
 * Decisões (plan.md, D-2 a D-4):
 *  - `getReader()` direto + `TextDecoder` em fluxo, em vez de
 *    `pipeThrough(new TextDecoderStream())`. Os dois juntam o caractere
 *    acentuado partido entre pedaços; mas o pipe prende o fluxo da porta, e o
 *    fechamento limpo passa a exigir cancelar, esperar o pipe rejeitar e só
 *    então fechar — o tropeço mais comum de quem usa Web Serial. Aqui fechar é
 *    cancelar o leitor, soltar e fechar a porta;
 *  - erros NÃO FATAIS da porta (bytes perdidos ou estragados) não derrubam a
 *    leitura: a linha pela metade sai como `interrompida` e o laço continua;
 *  - 15 s sem nenhum byte é `timeout`: a placa parou (o `while(1)` do código
 *    de bancada quando um sensor não inicia). Todo transporte MUST lançar
 *    `timeout` quando trava (core/ports/transport.ts).
 *
 * Isto NÃO é um `Transport`: as linhas de bancada não têm identificador da
 * placa nem número de leitura, então não há `pullReadings` honesto a oferecer.
 * Quando o firmware mandar os dois, o transporte `cable` de verdade nasce
 * neste pacote e reaproveita a leitura e os erros daqui.
 */
import { TransportError } from '@/core/ports/transport';
import { ehErroNaoFatalDeLeitura, paraTransportError } from './erros';
import { JuntadorDeLinhas, type LinhaRecebida } from './linhas';

/** O que usamos de `SerialPort`. */
export interface PortaSerial {
  open(opcoes: { baudRate: number }): Promise<void>;
  close(): Promise<void>;
  readonly readable: ReadableStream<Uint8Array> | null;
}

/** O que usamos de `navigator.serial`. */
export interface SerialDoNavegador {
  requestPort(opcoes?: { filters?: { usbVendorId?: number; usbProductId?: number }[] }): Promise<PortaSerial>;
}

/** O código de bancada usa `Serial.begin(115200)`. */
export const VELOCIDADE_DA_PLACA = 115200;
export const SILENCIO_MAXIMO_MS = 15_000;

export type FimDaLeitura =
  | { tipo: 'pela-pessoa' }
  | { tipo: 'problema'; erro: TransportError };

export interface LeituraAberta {
  /** Resolve quando a leitura acaba, por qualquer motivo. Nunca rejeita. */
  readonly fim: Promise<FimDaLeitura>;
  /** Para de ler e libera a porta, para outro programa poder abri-la. */
  fechar(): Promise<void>;
}

export interface OpcoesDeLeitura {
  aoReceberLinha(linha: LinhaRecebida): void;
  silencioMaximoMs?: number;
  /** De quanto em quanto tempo confere o silêncio. */
  vigiaMs?: number;
  agora?: () => number;
}

/**
 * Abre a lista de portas do navegador. Tem de ser chamada direto do toque:
 * o navegador só mostra a lista em resposta a um gesto da pessoa.
 * Lança TransportError (`not-found` quando a pessoa não escolhe nenhuma).
 */
export async function escolherPorta(serial: SerialDoNavegador | null): Promise<PortaSerial> {
  if (!serial) throw new TransportError('unavailable', 'escolher: sem porta serial');
  try {
    // Sem filtro de fabricante: a placa e o adaptador USB não estão confirmados.
    return await serial.requestPort();
  } catch (e) {
    throw paraTransportError(e, 'escolher');
  }
}

/**
 * Abre a porta e começa a ler. Lança TransportError se a porta não abrir;
 * depois de aberta, nada mais lança — o fim chega por `fim`.
 */
export async function abrirLeitura(porta: PortaSerial, opcoes: OpcoesDeLeitura): Promise<LeituraAberta> {
  const agora = opcoes.agora ?? Date.now;
  const silencioMaximo = opcoes.silencioMaximoMs ?? SILENCIO_MAXIMO_MS;

  try {
    await porta.open({ baudRate: VELOCIDADE_DA_PLACA });
  } catch (e) {
    throw paraTransportError(e, 'abrir');
  }

  const juntador = new JuntadorDeLinhas();
  let decodificador = new TextDecoder('utf-8');
  let leitorAtual: ReadableStreamDefaultReader<Uint8Array> | null = null;
  let fim: FimDaLeitura | null = null;
  let ultimaChegada = agora();

  const entregar = (linhas: LinhaRecebida[]) => {
    for (const l of linhas) {
      try {
        opcoes.aoReceberLinha(l);
      } catch {
        /* um defeito na tela não pode parar a leitura */
      }
    }
  };

  const encerrar = (motivo: FimDaLeitura) => {
    if (fim) return;
    fim = motivo;
    leitorAtual?.cancel().catch(() => { /* a porta pode já ter sumido */ });
  };

  const vigia = setInterval(() => {
    if (agora() - ultimaChegada > silencioMaximo) {
      encerrar({ tipo: 'problema', erro: new TransportError('timeout', 'ler: placa em silêncio') });
    }
  }, opcoes.vigiaMs ?? 1000);

  const laco = (async (): Promise<FimDaLeitura> => {
    while (!fim) {
      const fluxo = porta.readable;
      if (!fluxo) {
        encerrar({ tipo: 'problema', erro: new TransportError('connection-lost', 'ler: porta sem fluxo') });
        break;
      }
      const leitor = fluxo.getReader();
      leitorAtual = leitor;
      try {
        for (;;) {
          const { value, done } = await leitor.read();
          if (done) break;
          if (value && value.length > 0) {
            ultimaChegada = agora();
            entregar(juntador.empurrar(decodificador.decode(value, { stream: true })));
          }
        }
        // Fluxo terminou sem ninguém pedir: a porta foi fechada por fora.
        if (!fim) encerrar({ tipo: 'problema', erro: new TransportError('connection-lost', 'ler: fluxo terminou') });
      } catch (e) {
        if (!fim) {
          if (ehErroNaoFatalDeLeitura(e)) {
            // Bytes perdidos: a linha pela metade não é confiável, e o
            // caractere partido também não. Recomeça e segue lendo.
            decodificador = new TextDecoder('utf-8');
            entregar(juntador.interromper());
          } else {
            encerrar({ tipo: 'problema', erro: paraTransportError(e, 'ler') });
          }
        }
      } finally {
        leitorAtual = null;
        try { leitor.releaseLock(); } catch { /* já solto */ }
      }
    }

    clearInterval(vigia);
    entregar(juntador.interromper());
    try {
      await porta.close();
    } catch {
      /* cabo já fora: não há o que fechar */
    }
    return fim ?? { tipo: 'pela-pessoa' };
  })();

  return {
    fim: laco,
    async fechar() {
      encerrar({ tipo: 'pela-pessoa' });
      await laco;
    },
  };
}

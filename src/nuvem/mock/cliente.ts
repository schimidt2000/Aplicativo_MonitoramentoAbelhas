/**
 * Nuvem simulada. Entregue ANTES do cliente real, pela mesma razão que o
 * transporte `mock` veio antes do BLE: é ela que permite construir e testar o
 * envio inteiro — inclusive os caminhos de falha — sem servidor nenhum.
 *
 * Guarda as leituras num Map com a MESMA chave natural do servidor real,
 * `(deviceId, seq)`. É isso que faz o teste de idempotência aqui valer alguma
 * coisa: se o mock aceitasse duplicata, o teste passaria e a produção quebraria.
 */
import type {
  CadastroParaEnvio, ClienteNuvem, LeituraParaEnvio, Resultado, Vinculo,
} from '@/core/ports/nuvem';
import { normalizarCodigo, validarCodigo } from '@/core/codigo-projeto';

export interface FalhasSimuladas {
  /** Nenhuma internet. */
  semRede?: boolean;
  /** Rede que responde, mas exige login no navegador. */
  portalCativo?: boolean;
  /** Falha o envio depois de N leituras aceitas, uma única vez. */
  cortarApos?: number;
  /** Devolve 5xx nas N primeiras tentativas, depois funciona. */
  servidorInstavelAte?: number;
  /** Atraso artificial por lote, em ms. */
  atrasoMs?: number;
}

// Código bem formado (o dígito verificador confere: servidor/golden/codigos.json),
// senão a tela de vínculo o recusaria antes de chegar aqui.
const CODIGO_VALIDO = 'BEE7-K3M6';

export class NuvemMock implements ClienteNuvem {
  readonly nome = 'simulada';

  /** Chave natural `deviceId|seq` — a mesma do servidor real. */
  private readonly leituras = new Map<string, LeituraParaEnvio>();
  private readonly cadastro = { apiarios: 0, colmeias: 0, nos: 0 };
  private vinculo: Vinculo | null = null;
  private tentativasServidor = 0;
  private jaCortou = false;
  private errosDeCodigo = 0;

  constructor(private falhas: FalhasSimuladas = {}) {}

  /* ---------- controle do teste / da demonstração ---------- */

  configurar(f: FalhasSimuladas) { this.falhas = { ...this.falhas, ...f }; }
  limparFalhas() {
    this.falhas = {}; this.jaCortou = false; this.tentativasServidor = 0; this.errosDeCodigo = 0;
  }
  total() { return this.leituras.size; }
  contagemCadastro() { return { ...this.cadastro }; }
  /** Para inspeção nos testes. */
  tem(deviceId: string, seq: number) { return this.leituras.has(`${deviceId}|${seq}`); }

  /* ---------- a porta ---------- */

  async verificarConexao(): Promise<Resultado> {
    if (this.falhas.semRede) return { ok: false, motivo: 'sem-rede' };
    if (this.falhas.portalCativo) return { ok: false, motivo: 'portal-cativo' };
    return { ok: true };
  }

  async vinculoAtual() { return this.vinculo; }

  async vincular(codigo: string): Promise<Resultado & { vinculo?: Vinculo }> {
    // Mesma ordem da nuvem real: erro de digitação nunca "chega ao servidor".
    const local = validarCodigo(codigo);
    if (!local.ok) return { ok: false, motivo: 'codigo-invalido', detalhe: local.motivo };

    const conexao = await this.verificarConexao();
    if (!conexao.ok) return conexao;

    // Mesmo limite do servidor (servidor/002_rls.sql): 5 erros e espera.
    if (this.errosDeCodigo >= 5) return { ok: false, motivo: 'muitas-tentativas' };
    if (local.codigo !== normalizarCodigo(CODIGO_VALIDO)) {
      this.errosDeCodigo += 1;
      return { ok: false, motivo: 'codigo-invalido' };
    }

    this.vinculo = {
      apicultorNome: 'Apicultor de demonstração',
      projetoNome: 'Bee-sertão — piloto',
    };
    return { ok: true, vinculo: this.vinculo };
  }

  async desvincular() { this.vinculo = null; }

  async enviarCadastro(c: CadastroParaEnvio): Promise<Resultado> {
    const pronto = await this.prepararEnvio();
    if (!pronto.ok) return pronto;

    this.cadastro.apiarios += c.apiarios.length;
    this.cadastro.colmeias += c.colmeias.length;
    this.cadastro.nos += c.nos.length;
    return { ok: true };
  }

  async enviarLeituras(lote: LeituraParaEnvio[]): Promise<Resultado> {
    const pronto = await this.prepararEnvio();
    if (!pronto.ok) return pronto;

    if (this.falhas.cortarApos !== undefined && !this.jaCortou
        && this.leituras.size + lote.length > this.falhas.cortarApos) {
      this.jaCortou = true;
      // Grava o que couber antes de cair — é exatamente o que uma conexão que
      // morre no meio faz, e é o caso que o motor precisa saber retomar.
      const cabe = Math.max(0, this.falhas.cortarApos - this.leituras.size);
      for (const r of lote.slice(0, cabe)) this.gravar(r);
      return { ok: false, motivo: 'tempo-esgotado', detalhe: 'conexão caiu no meio' };
    }

    for (const r of lote) this.gravar(r);
    return { ok: true };
  }

  /* ---------- interno ---------- */

  /** `INSERT ... ON CONFLICT DO NOTHING` — a primeira gravação vence. */
  private gravar(r: LeituraParaEnvio) {
    const chave = `${r.deviceId}|${r.seq}`;
    if (!this.leituras.has(chave)) this.leituras.set(chave, r);
  }

  private async prepararEnvio(): Promise<Resultado> {
    const conexao = await this.verificarConexao();
    if (!conexao.ok) return conexao;
    if (!this.vinculo) return { ok: false, motivo: 'sem-vinculo' };

    if (this.falhas.servidorInstavelAte !== undefined
        && this.tentativasServidor < this.falhas.servidorInstavelAte) {
      this.tentativasServidor += 1;
      return { ok: false, motivo: 'servidor' };
    }
    if (this.falhas.atrasoMs) {
      await new Promise((r) => setTimeout(r, this.falhas.atrasoMs));
    }
    return { ok: true };
  }
}

/** O código que funciona na demonstração. Exibido na tela de vínculo. */
export const CODIGO_DEMO = CODIGO_VALIDO;

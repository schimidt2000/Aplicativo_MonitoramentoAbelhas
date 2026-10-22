/**
 * Um Supabase falso, em memória, que fala o MESMO fio que o real
 * (servidor/*.sql + PostgREST + GoTrue), para testar o cliente sem rede.
 *
 * Ele imita o que importa para as garantias do app:
 *  - chave natural (device_id, seq) com "a primeira gravação vence";
 *  - a regra da RLS de que o nó precisa estar no cadastro do MESMO apicultor
 *    antes da leitura;
 *  - sessão com prazo, renovação, e 401 quando o token vence;
 *  - os jeitos de a rede falhar: sem rede, portal cativo (200 com HTML),
 *    redirecionamento, e a conexão que cai DEPOIS de o servidor gravar.
 *
 * O que ele NÃO prova: que as políticas SQL reais fazem isso. Isso é
 * servidor/teste/rodar.sh, contra um Postgres de verdade.
 */

export const URL_FALSA = 'https://bee-teste.supabase.co';
export const CHAVE_FALSA = 'sb_publishable_teste';

interface Usuario { id: string; apicultor: string | null }

export interface Falhas {
  semRede?: boolean;
  /** Toda resposta vira a página de login de uma rede de praça. */
  portalCativo?: boolean;
  /** Toda resposta parece vir de outro endereço (redirecionamento). */
  redirecionar?: boolean;
  /** Próximos N pedidos autenticados recebem 401 (token vencido). */
  expirarProximos?: number;
  /** A renovação de sessão é recusada. */
  recusarRenovacao?: boolean;
  /** Grava o lote e DEPOIS derruba a conexão, uma vez, ao passar de N leituras. */
  cairDepoisDeGravarAoPassarDe?: number;
  /** O servidor responde 503 nos próximos N pedidos de leitura. */
  instavelProximos?: number;
  /** Responde 200 (e não 201) ao gravar leituras. */
  responder200AoGravar?: boolean;
}

export interface PedidoVisto {
  metodo: string;
  caminho: string;
  cabecalhos: Record<string, string>;
  corpo: unknown;
}

const json = (status: number, corpo: unknown) =>
  new Response(JSON.stringify(corpo), {
    status, headers: { 'content-type': 'application/json; charset=utf-8' },
  });

export class SupabaseFalso {
  readonly pedidos: PedidoVisto[] = [];
  readonly leituras = new Map<string, Record<string, unknown>>();
  readonly nos = new Map<string, string>(); // device_id -> apicultor
  readonly apiarios = new Map<string, Record<string, unknown>>();
  falhas: Falhas = {};

  /** Códigos válidos -> apicultor. Igual à semente do servidor. */
  codigos = new Map<string, { apicultor: string; nome: string }>([
    ['DEM0A1B4', { apicultor: 'A', nome: 'Apicultora de demonstração A' }],
    ['DEM0B2CZ', { apicultor: 'B', nome: 'Meliponicultor de demonstração B' }],
  ]);
  errosDeCodigo = 0;

  private usuarios = new Map<string, Usuario>();
  private tokens = new Map<string, string>(); // access -> user id
  private renovacoes = new Map<string, string>(); // refresh -> user id
  private seq = 0;
  private jaCaiu = false;
  /** Segundos de vida do token emitido. */
  vidaDoTokenS = 3600;
  /** Relógio do servidor (o certo). O do celular pode ser outro. */
  relogioDoServidorMs: () => number = Date.now;

  /** O `fetch` que o cliente recebe. */
  readonly fetch: typeof fetch = async (entrada, init) => {
    const url = new URL(String(entrada));
    const cabecalhos = Object.fromEntries(
      Object.entries((init?.headers ?? {}) as Record<string, string>)
        .map(([k, v]) => [k.toLowerCase(), v]),
    );
    const corpo = init?.body ? JSON.parse(String(init.body)) : undefined;
    this.pedidos.push({ metodo: init?.method ?? 'GET', caminho: url.pathname + url.search, cabecalhos, corpo });

    if (this.falhas.semRede) throw new TypeError('Network request failed');
    if (this.falhas.portalCativo) {
      return new Response('<html><body>Entre na rede da praça</body></html>', {
        status: 200, headers: { 'content-type': 'text/html' },
      });
    }
    const resposta = await this.rotear(init?.method ?? 'GET', url, cabecalhos, corpo);
    if (this.falhas.redirecionar) {
      Object.defineProperty(resposta, 'url', { value: 'http://portal.wifi-praca.local/login' });
    }
    return resposta;
  };

  ligar(usuarioId: string, apicultor: string) {
    const u = this.usuarios.get(usuarioId);
    if (u) u.apicultor = apicultor;
  }

  totalLeituras() { return this.leituras.size; }

  private emitirSessao(u: Usuario) {
    this.seq += 1;
    const acesso = `acesso-${this.seq}`;
    const renovacao = `renovacao-${this.seq}`;
    this.tokens.set(acesso, u.id);
    this.renovacoes.set(renovacao, u.id);
    // Como o GoTrue real: `expires_at` absoluto, pelo relógio do SERVIDOR.
    const agoraS = Math.floor(this.relogioDoServidorMs() / 1000);
    return {
      access_token: acesso, refresh_token: renovacao, token_type: 'bearer',
      expires_in: this.vidaDoTokenS, expires_at: agoraS + this.vidaDoTokenS,
      user: { id: u.id, is_anonymous: true },
    };
  }

  private usuarioDe(cab: Record<string, string>): Usuario | null {
    const token = (cab.authorization ?? '').replace(/^Bearer /, '');
    const id = this.tokens.get(token);
    return id ? this.usuarios.get(id) ?? null : null;
  }

  private async rotear(
    metodo: string, url: URL, cab: Record<string, string>, corpo: any,
  ): Promise<Response> {
    if (cab.apikey !== CHAVE_FALSA) return json(401, { message: 'Invalid API key' });
    const rota = `${metodo} ${url.pathname}`;

    if (rota === 'GET /auth/v1/health') return json(200, { version: 'v2.170.0', name: 'GoTrue' });

    if (rota === 'POST /auth/v1/signup') {
      this.seq += 1;
      const u: Usuario = { id: `usuario-${this.seq}`, apicultor: null };
      this.usuarios.set(u.id, u);
      return json(200, this.emitirSessao(u));
    }

    if (rota === 'POST /auth/v1/token') {
      const id = this.renovacoes.get(corpo?.refresh_token);
      if (this.falhas.recusarRenovacao || !id) {
        return json(400, { error: 'invalid_grant', error_description: 'Invalid Refresh Token' });
      }
      this.renovacoes.delete(corpo.refresh_token);
      return json(200, this.emitirSessao(this.usuarios.get(id)!));
    }

    // Daqui para baixo, PostgREST: exige sessão.
    if ((this.falhas.expirarProximos ?? 0) > 0) {
      this.falhas.expirarProximos! -= 1;
      return json(401, { code: 'PGRST301', message: 'JWT expired' });
    }
    const u = this.usuarioDe(cab);
    if (!u) return json(401, { code: 'PGRST301', message: 'JWT invalid' });

    if (rota === 'POST /rest/v1/rpc/redeem_project_code') {
      if (this.errosDeCodigo >= 5) return json(200, { status: 'throttled' });
      const achado = this.codigos.get(corpo?.p_code);
      if (!achado) {
        this.errosDeCodigo += 1;
        return json(200, { status: 'invalid' });
      }
      u.apicultor = achado.apicultor;
      return json(200, {
        status: 'ok', beekeeper_name: achado.nome, project_name: 'Projeto piloto (demonstração)',
      });
    }

    if (!u.apicultor) {
      return json(403, { code: '42501', message: 'new row violates row-level security policy' });
    }

    if (rota === 'POST /rest/v1/rpc/upsert_registry') {
      for (const a of corpo.p_apiaries ?? []) this.apiarios.set(`${u.apicultor}|${a.id}`, a);
      for (const n of corpo.p_nodes ?? []) {
        const dono = this.nos.get(n.device_id);
        if (dono && dono !== u.apicultor) {
          return json(403, { code: '42501', message: 'new row violates row-level security policy' });
        }
        this.nos.set(n.device_id, u.apicultor);
      }
      return json(200, {
        apiaries: (corpo.p_apiaries ?? []).length,
        hives: (corpo.p_hives ?? []).length,
        nodes: (corpo.p_nodes ?? []).length,
      });
    }

    if (rota === 'POST /rest/v1/reading') {
      if ((this.falhas.instavelProximos ?? 0) > 0) {
        this.falhas.instavelProximos! -= 1;
        return json(503, { message: 'Service Unavailable' });
      }
      if (url.searchParams.get('on_conflict') !== 'device_id,seq'
          || !(cab.prefer ?? '').includes('resolution=ignore-duplicates')) {
        // Sem isso o PostgREST responderia 409 no reenvio: o teste deve pegar.
        return json(409, { code: '23505', message: 'duplicate key value violates unique constraint' });
      }
      const linhas = corpo as Record<string, unknown>[];
      for (const r of linhas) {
        if ('beekeeper_id' in r || 'node_id' in r) {
          return json(400, { message: 'o celular não manda beekeeper_id nem node_id' });
        }
        if (this.nos.get(String(r.device_id)) !== u.apicultor) {
          return json(403, { code: '42501', message: 'new row violates row-level security policy' });
        }
      }
      for (const r of linhas) {
        const chave = `${r.device_id}|${r.seq}`;
        if (!this.leituras.has(chave)) this.leituras.set(chave, r);
      }
      const limite = this.falhas.cairDepoisDeGravarAoPassarDe;
      if (limite !== undefined && !this.jaCaiu && this.leituras.size > limite) {
        this.jaCaiu = true;
        // Gravou, mas a resposta nunca chega ao celular.
        throw new TypeError('Network request failed');
      }
      if (this.falhas.responder200AoGravar) return new Response(null, { status: 200 });
      return new Response(null, { status: 201 });
    }

    return json(404, { message: `rota desconhecida: ${rota}` });
  }
}

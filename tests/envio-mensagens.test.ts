/**
 * O que o apicultor lê quando o envio para, e quando o código não confere.
 * Regras do glossário e da constituição: dizer o que aconteceu e o que fazer;
 * falta de rede não é erro; e o vocabulário é "código do projeto", nunca
 * "login", "senha" ou "token".
 */
import { describe, expect, it } from 'vitest';
import { t, todasAsChaves } from '@/core/i18n';
import {
  mensagemAoLigar, mensagemDeCodigoLocal, mensagemDeParada, MOTIVOS,
} from '@/core/envio/mensagens';
import { validarCodigo } from '@/core/codigo-projeto';

const PROIBIDAS = /\b(erro|falha|falhou|offline|login|senha|token|sync|sincroniz\w*|upload|subir|subiu|sobe|dashboard|exception|null|undefined)\b/i;

function textosDaFrente(): string[] {
  return todasAsChaves()
    .filter((c) => c.startsWith('envio.') || c.startsWith('vinculo.'))
    .map((c) => t(c));
}

describe('mensagens do envio', () => {
  it('todo motivo de parada tem título e texto próprios', () => {
    expect(MOTIVOS.length).toBe(9);
    for (const m of MOTIVOS) {
      const msg = mensagemDeParada(m);
      // Chave inexistente devolveria `undefined` e quebraria aqui.
      expect(msg.titulo?.length, m).toBeGreaterThan(8);
      expect(msg.texto?.length, m).toBeGreaterThan(15);
      expect(msg.titulo).not.toMatch(/[{}]/);
    }
  });

  it('sem rede é tom neutro; o resto pede atenção', () => {
    expect(mensagemDeParada('sem-rede').tom).toBe('neutro');
    expect(mensagemDeParada('portal-cativo').tom).toBe('atencao');
  });

  it('nenhum texto da frente usa palavra proibida', () => {
    const textos = textosDaFrente();
    expect(textos.length).toBeGreaterThan(30);
    for (const txt of textos) expect(txt, txt).not.toMatch(PROIBIDAS);
  });

  it('nenhum texto traz símbolo no lugar de ícone (a tela já desenha o ícone)', () => {
    for (const txt of textosDaFrente()) expect(txt, txt).not.toMatch(/[✓✔✗✘⚠]/u);
  });

  it('nenhum texto chama o canal de gás de CO2', () => {
    for (const txt of textosDaFrente()) expect(txt).not.toMatch(/CO2|CO₂/i);
  });

  it('nenhum texto promete o que o envio não faz sozinho', () => {
    // Não existe envio automático em segundo plano nesta fatia.
    for (const txt of textosDaFrente()) {
      expect(txt).not.toMatch(/vou (enviar|tentar)|automaticamente|sozinho quando/i);
    }
  });

  it('na tela de ligar o celular, nenhuma mensagem manda tocar em "Enviar agora"', () => {
    // Lá o botão é "Ligar o celular"; "Enviar agora" fica em outra tela.
    for (const m of MOTIVOS) {
      const msg = mensagemAoLigar(m);
      expect(msg.titulo?.length, m).toBeGreaterThan(8);
      expect(msg.texto?.length, m).toBeGreaterThan(15);
      expect(`${msg.titulo} ${msg.texto}`, m).not.toMatch(/Enviar agora|envio/i);
    }
    expect(mensagemAoLigar('sem-rede').tom).toBe('neutro');
    expect(mensagemAoLigar('sem-rede').texto).toMatch(/Ligar o celular/);
  });

  it('cada motivo da validação local tem frase que diz o que fazer', () => {
    for (const digitado of ['', 'DEM0-A1B', 'DEMU-A1B4', 'DEM0-A1B5']) {
      const v = validarCodigo(digitado);
      expect(v.ok).toBe(false);
      if (!v.ok) {
        const frase = mensagemDeCodigoLocal(v.motivo);
        expect(frase.length, v.motivo).toBeGreaterThan(20);
        expect(frase).toMatch(/[Cc]onfira|[Dd]igite/);
      }
    }
  });
});

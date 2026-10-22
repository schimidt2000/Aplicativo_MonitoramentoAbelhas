/**
 * Retorno por som (Princípio V: toda operação com a placa dá retorno por
 * texto E vibração ou som). No computador não há vibração; um bipe curto pelo
 * Web Audio, sem arquivo de som e sem biblioteca.
 *
 * O navegador só deixa tocar som depois de um gesto da pessoa: `prepararBipe`
 * é chamado no toque em Conectar, e o mesmo contexto serve para avisar, mais
 * tarde, que a conexão caiu. Conveniência, nunca pré-requisito: qualquer
 * problema aqui é ignorado.
 */
type ConstrutorDeAudio = new () => AudioContext;

let contexto: AudioContext | null = null;

export function prepararBipe(): void {
  try {
    if (typeof window === 'undefined') return;
    const w = window as unknown as { AudioContext?: ConstrutorDeAudio; webkitAudioContext?: ConstrutorDeAudio };
    const Audio = w.AudioContext ?? w.webkitAudioContext;
    if (!Audio) return;
    contexto ??= new Audio();
    void contexto.resume().catch(() => {});
  } catch {
    contexto = null;
  }
}

/** Um bipe = conectou. Dois = a conexão caiu. */
export function bipar(vezes: 1 | 2): void {
  try {
    if (!contexto) return;
    const agora = contexto.currentTime;
    for (let i = 0; i < vezes; i++) {
      const osc = contexto.createOscillator();
      const volume = contexto.createGain();
      osc.frequency.value = vezes === 1 ? 880 : 440;
      volume.gain.value = 0.15;
      osc.connect(volume).connect(contexto.destination);
      osc.start(agora + i * 0.25);
      osc.stop(agora + i * 0.25 + 0.12);
    }
  } catch {
    /* sem som, segue só com o texto */
  }
}

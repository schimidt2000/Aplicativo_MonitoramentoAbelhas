/**
 * Ícones SVG inline, subconjunto pequeno (`.claude/rules/ui.md`: nada de fonte
 * de ícone nem emoji). Todo ícone é decorativo (`aria-hidden`): a palavra ao
 * lado é que diz o que é — cor e ícone nunca são o único canal.
 *
 * Os traços ficam em constantes, fora do JSX: são dados de desenho, não texto.
 */
const CAIXA = '0 0 24 24';

const TRACO = {
  fill: 'none',
  stroke: 'currentColor',
  strokeWidth: 2,
  strokeLinecap: 'round',
  strokeLinejoin: 'round',
} as const;

const CAMINHOS = {
  grade: 'M4 4h6.5v6.5H4zM13.5 4H20v6.5h-6.5zM4 13.5h6.5V20H4zM13.5 13.5H20V20h-6.5z',
  tabela: 'M4 5h16v14H4zM4 10h16M4 14.5h16M10 10v9',
  sair: 'M9 4H5v16h4M14.5 8l4 4-4 4M18.5 12H9',
  voltar: 'M15 5l-7 7 7 7',
  avancar: 'M9 5l7 7-7 7',
  aviso: 'M12 3.5 2.5 20h19L12 3.5ZM12 10v4.5M12 17.25v.25',
  info: 'M12 3a9 9 0 1 0 0 18 9 9 0 1 0 0-18ZM12 11v5.5M12 7.75V8',
  baixar: 'M12 4v11M7 10.5l5 5 5-5M5 20h14',
  busca: 'M10.5 4a6.5 6.5 0 1 0 0 13 6.5 6.5 0 1 0 0-13ZM20 20l-4.8-4.8',
  calendario: 'M4 6h16v14H4zM4 10.5h16M8.5 3.5V8M15.5 3.5V8',
  relogio: 'M12 3a9 9 0 1 0 0 18 9 9 0 1 0 0-18ZM12 7.5V12l3 2',
  certo: 'M5 12.5l4.5 4.5L19 7.5',
  colmeia: 'M12 2.75 19.5 7v10L12 21.25 4.5 17V7Z',
  pessoa: 'M12 4a4 4 0 1 0 0 8 4 4 0 1 0 0-8ZM4.5 20.5c1.2-3.6 4-5.5 7.5-5.5s6.3 1.9 7.5 5.5',
  local: 'M12 21s-6.5-5.6-6.5-11a6.5 6.5 0 0 1 13 0C18.5 15.4 12 21 12 21ZM12 7.5a2.5 2.5 0 1 0 0 5 2.5 2.5 0 1 0 0-5Z',
  leituras: 'M4 19.5h16M6.5 16V11M10.5 16V6M14.5 16v-7M18.5 16V4.5',
} as const;

export type NomeIcone = keyof typeof CAMINHOS;

export function Icone({ desenho, tamanho = 20 }: { desenho: NomeIcone; tamanho?: number }) {
  return (
    <svg {...TRACO} className="icone" width={tamanho} height={tamanho} viewBox={CAIXA} aria-hidden>
      <path d={CAMINHOS[desenho]} />
    </svg>
  );
}

/** Favo da marca: hexágono cheio com um alvéolo vazado no meio. */
const FAVO_FORA = 'M24 2 43 13v22L24 46 5 35V13Z';
const FAVO_DENTRO = 'M24 15.5 31.5 19.8v8.4L24 32.5l-7.5-4.3v-8.4Z';
const CAIXA_MARCA = '0 0 48 48';

export function Marca({ tamanho = 36 }: { tamanho?: number }) {
  return (
    <svg className="marca-favo" width={tamanho} height={tamanho} viewBox={CAIXA_MARCA} aria-hidden>
      <path className="favo-fora" d={FAVO_FORA} />
      <path className="favo-dentro" d={FAVO_DENTRO} />
    </svg>
  );
}

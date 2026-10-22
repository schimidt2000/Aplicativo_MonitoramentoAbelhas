/**
 * Ícones da tela de cabo (feature 004). Mesmas regras de ./Icones.tsx: SVG à
 * mão, width/height numéricos, decorativos — a palavra ao lado carrega o
 * sentido. Ficam num arquivo próprio para não mexer no compartilhado.
 */
import Svg, { Circle, Path } from 'react-native-svg';

interface Props { cor: string; tamanho?: number }

/** Relógio: "ainda não está pronto, espere". */
export function IconeRelogio({ cor, tamanho = 26 }: Props) {
  return (
    <Svg width={tamanho} height={tamanho} viewBox="0 0 24 24">
      <Circle cx={12} cy={12} r={9} stroke={cor} strokeWidth={2.2} fill="none" />
      <Path d="M12 7v5.5l3.5 2" stroke={cor} strokeWidth={2.2} fill="none"
        strokeLinecap="round" strokeLinejoin="round" />
    </Svg>
  );
}

/** Tomada USB: conectado. */
export function IconeTomada({ cor, tamanho = 26 }: Props) {
  return (
    <Svg width={tamanho} height={tamanho} viewBox="0 0 24 24">
      <Path d="M8 3v5M16 3v5" stroke={cor} strokeWidth={2.4} strokeLinecap="round" />
      <Path d="M5.5 8h13v3.5a6.5 6.5 0 0 1-13 0V8z" stroke={cor} strokeWidth={2.2} fill="none"
        strokeLinejoin="round" />
      <Path d="M12 18v3.5" stroke={cor} strokeWidth={2.4} strokeLinecap="round" />
    </Svg>
  );
}

/** Tomada cortada: desconectado. */
export function IconeTomadaSolta({ cor, tamanho = 26 }: Props) {
  return (
    <Svg width={tamanho} height={tamanho} viewBox="0 0 24 24">
      <Path d="M8 3v5M16 3v5" stroke={cor} strokeWidth={2.4} strokeLinecap="round" />
      <Path d="M5.5 8h13v3.5a6.5 6.5 0 0 1-13 0V8z" stroke={cor} strokeWidth={2.2} fill="none"
        strokeLinejoin="round" />
      <Path d="M3 3l18 18" stroke={cor} strokeWidth={2.4} strokeLinecap="round" />
    </Svg>
  );
}

/** Seta para baixo numa bandeja: "baixar arquivo". */
export function IconeBaixar({ cor, tamanho = 24 }: Props) {
  return (
    <Svg width={tamanho} height={tamanho} viewBox="0 0 24 24">
      <Path d="M12 3.5v11M7 10l5 5 5-5" stroke={cor} strokeWidth={2.4} fill="none"
        strokeLinecap="round" strokeLinejoin="round" />
      <Path d="M4 16.5v3h16v-3" stroke={cor} strokeWidth={2.2} fill="none"
        strokeLinecap="round" strokeLinejoin="round" />
    </Svg>
  );
}

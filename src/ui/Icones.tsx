/**
 * Ícones em SVG, desenhados à mão: fonte de ícone é proibida (peso, e o glifo
 * vira quadradinho em Android antigo — já aconteceu com a bateria).
 * width e height sempre numéricos: na web o SVG não deriva tamanho de viewBox.
 * Decorativos: o texto ao lado carrega o sentido (nenhuma prop de acessibilidade
 * só-iOS aqui — ela vaza para o DOM na web e o React reclama).
 */
import Svg, { Path } from 'react-native-svg';

interface Props { cor: string; tamanho?: number }

export function IconeCheck({ cor, tamanho = 30 }: Props) {
  return (
    <Svg width={tamanho} height={tamanho} viewBox="0 0 24 24">
      <Path d="M4.5 12.8l5 5L19.5 7" stroke={cor} strokeWidth={3} fill="none"
        strokeLinecap="round" strokeLinejoin="round" />
    </Svg>
  );
}

/** Triângulo com exclamação. */
export function IconeAlerta({ cor, tamanho = 26 }: Props) {
  return (
    <Svg width={tamanho} height={tamanho} viewBox="0 0 24 24">
      <Path d="M12 3.6L2.8 19.8h18.4L12 3.6z" stroke={cor} strokeWidth={2} fill="none"
        strokeLinejoin="round" />
      <Path d="M12 9.8v4.6" stroke={cor} strokeWidth={2.4} strokeLinecap="round" />
      <Path d="M12 17.1v.2" stroke={cor} strokeWidth={2.6} strokeLinecap="round" />
    </Svg>
  );
}

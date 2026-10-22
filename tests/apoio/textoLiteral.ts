/**
 * Verificação estática: texto visível escrito à mão dentro de componente.
 *
 * Usa o parser do próprio TypeScript (já é dependência de desenvolvimento), não
 * expressão regular sobre o arquivo: `useState<Estado>(…)` e `a < b` enganam
 * qualquer regex que procure texto entre `>` e `<`.
 *
 * O que reprova:
 *  - texto JSX com alguma letra (`<Text>Colmeias</Text>`) — é sempre visível;
 *  - string literal ou trecho de template que PARECE FRASE: tem letra e
 *    (espaço entre letras, ou começa com maiúscula seguida de minúscula, ou
 *    tem acento). Pega `'Temperatura'`, `"Alternar modo sol"`, `` `${n} dias` ``;
 *  - qualquer literal com letra em posição que vai direto para a tela (filho
 *    JSX ou atributo visível), mesmo uma palavra só em minúsculas:
 *    `{ok ? 'pronto' : 'pendente'}`, `{n + ' dias'}`, `label={'ligar'}`.
 *
 * O que passa:
 *  - a chave passada a `t()`/`tp()` (é o caminho certo);
 *  - identificadores em minúsculas sem espaço: 'center', 'mock', 'sem-colmeias',
 *    '/colmeia/[id]', 'tabular-nums';
 *  - unidades e pontuação sem palavra: ' °C', ' %', ' · ';
 *  - comentários (não são tokens).
 */
import ts from 'typescript';

export interface Achado {
  arquivo: string;
  linha: number;
  texto: string;
}

const LETRA = /\p{L}/u;
const PARECE_FRASE = [
  /\p{L}\s+\p{L}/u, // duas palavras
  /^\s*\p{Lu}\p{Ll}/u, // Palavra Capitalizada
  /[À-ÖØ-öø-ÿ]/u, // acento: identificador não tem
];

/** Atributos que chegam ao usuário (na tela ou no leitor de tela) mesmo sem parecer frase. */
const ATRIBUTOS_VISIVEIS = new Set([
  'placeholder', 'accessibilityLabel', 'accessibilityHint', 'title', 'label',
  'aria-label', 'alt',
]);

/**
 * Propriedades de objeto que chegam à tela: `options={{ title: … }}` das rotas,
 * `accessibilityValue={{ text: … }}` da barra de progresso. O valor delas é
 * tratado como filho JSX.
 */
const PROPRIEDADES_VISIVEIS = new Set([
  'title', 'tabBarLabel', 'headerTitle', 'headerBackTitle', 'text', 'label', 'hint',
  'placeholder', 'accessibilityLabel', 'accessibilityHint',
]);

/**
 * Num template, o texto em volta de `${…}` é prosa quando uma palavra de duas
 * letras ou mais encosta num espaço: `${n} dias`, `${a} de ${b}`. Comando de
 * path SVG (`M${x} L${y}`) tem uma letra só e passa.
 */
const PALAVRA_COM_ESPACO = /\p{L}{2,}\s|\s\p{L}{2,}/u;

function pareceFrase(s: string): boolean {
  return LETRA.test(s) && PARECE_FRASE.some((r) => r.test(s));
}

function ehChamadaDeTexto(n: ts.Node): boolean {
  return ts.isCallExpression(n)
    && ts.isIdentifier(n.expression)
    && (n.expression.text === 't' || n.expression.text === 'tp');
}

export function textosLiterais(arquivo: string, fonte: string): Achado[] {
  const sf = ts.createSourceFile(arquivo, fonte, ts.ScriptTarget.Latest, true, ts.ScriptKind.TSX);
  const achados: Achado[] = [];
  const anotar = (n: ts.Node, texto: string) => {
    const { line } = sf.getLineAndCharacterOfPosition(n.getStart(sf));
    achados.push({ arquivo, linha: line + 1, texto: texto.trim() });
  };

  /**
   * `exibido`: o valor deste nó vai direto para a tela — filho JSX
   * (`<Text>{…}</Text>`) ou atributo visível (`label={…}`). Ali QUALQUER
   * literal com letra é texto de tela, mesmo uma palavra só em minúsculas
   * (`{ok ? 'pronto' : 'pendente'}`, `{n + ' dias'}`). O contexto se desfaz
   * onde o literal deixa de ser o que aparece: argumento de função,
   * comparação, condição de `&&`/`?:`, índice e JSX aninhado.
   */
  const visitar = (n: ts.Node, exibido = false): void => {
    // A chave de t()/tp() é o caminho certo; o resto dos argumentos (variáveis
    // de preenchimento) ainda é visitado.
    if (ehChamadaDeTexto(n)) {
      (n as ts.CallExpression).arguments.slice(1).forEach((a) => visitar(a));
      return;
    }
    // Importações e tipos não são texto de tela.
    if (ts.isImportDeclaration(n) || ts.isExportDeclaration(n) || ts.isTypeNode(n)) return;

    if (ts.isJsxText(n)) {
      if (LETRA.test(n.text)) anotar(n, n.text);
    } else if (ts.isStringLiteral(n) || ts.isNoSubstitutionTemplateLiteral(n)) {
      if (exibido ? LETRA.test(n.text) : pareceFrase(n.text)) anotar(n, n.text);
    } else if (ts.isTemplateExpression(n)) {
      const pedacos = [n.head.text, ...n.templateSpans.map((s) => s.literal.text)];
      if (pedacos.some((p) => (exibido ? LETRA.test(p)
        : pareceFrase(p) || PALAVRA_COM_ESPACO.test(p)))) {
        anotar(n, pedacos.join('…'));
      }
      n.templateSpans.forEach((s) => visitar(s.expression, exibido));
      return;
    } else if (ts.isJsxAttribute(n) && n.initializer) {
      const nome = n.name.getText(sf);
      const visivel = ATRIBUTOS_VISIVEIS.has(nome);
      if (ts.isStringLiteral(n.initializer)) {
        // Atributo com texto direto: placeholder="XXXX-XXXX", accessibilityLabel="…".
        if (visivel && LETRA.test(n.initializer.text)) {
          anotar(n, `${nome}="${n.initializer.text}"`);
          return;
        }
      } else if (ts.isJsxExpression(n.initializer) && n.initializer.expression) {
        visitar(n.initializer.expression, visivel);
        return;
      }
    } else if (ts.isPropertyAssignment(n)
      && PROPRIEDADES_VISIVEIS.has(n.name.getText(sf))) {
      visitar(n.initializer, true);
      return;
    } else if (ts.isJsxExpression(n)) {
      // Filho de elemento: o valor é desenhado.
      const filho = ts.isJsxElement(n.parent) || ts.isJsxFragment(n.parent);
      if (n.expression) visitar(n.expression, filho);
      return;
    } else if (exibido) {
      // Só alguns nós mantêm o literal "na tela"; os demais desfazem o contexto.
      if (ts.isParenthesizedExpression(n)) return visitar(n.expression, true);
      if (ts.isConditionalExpression(n)) {
        visitar(n.condition);
        visitar(n.whenTrue, true);
        visitar(n.whenFalse, true);
        return;
      }
      if (ts.isBinaryExpression(n)) {
        const op = n.operatorToken.kind;
        const K = ts.SyntaxKind;
        if (op === K.PlusToken || op === K.BarBarToken || op === K.QuestionQuestionToken) {
          visitar(n.left, true);
          visitar(n.right, true);
          return;
        }
        if (op === K.AmpersandAmpersandToken) {
          visitar(n.left);
          visitar(n.right, true);
          return;
        }
      }
    }
    ts.forEachChild(n, (c) => visitar(c));
  };

  visitar(sf);
  return achados;
}


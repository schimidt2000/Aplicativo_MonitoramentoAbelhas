const path = require('path');
const { getDefaultConfig } = require('expo/metro-config');

const config = getDefaultConfig(__dirname);

// sql.js carrega o motor SQLite como .wasm (driver web — ver research.md D-001).
config.resolver.assetExts.push('wasm');

// NOTA: a documentação do expo-sqlite manda adicionar COOP/COEP aqui.
// Não fazemos isso de propósito: foi medido que enhanceMiddleware NÃO aplica
// esses cabeçalhos ao documento HTML (expo/expo#38481), e não usamos
// expo-sqlite no navegador. Ver research.md D-001 e D-008.

// O painel é artefato SEPARADO, com package.json e node_modules próprios. Sem este
// bloqueio o Metro varre painel/node_modules e quebra com módulo duplicado (react,
// react-dom). Uma linha aqui evita uma tarde de depuração confusa.
// `metro-config/src/defaults/exclusionList` não é exportado nesta versão; blockList
// aceita RegExp diretamente. As expressões são ANCORADAS na raiz do projeto: um
// `/painel/` solto bloquearia também `src/ui/painel/` ou um pacote em node_modules
// que tivesse uma pasta com esse nome, em silêncio.
const raizDe = (pasta) => new RegExp(
  `^${path.join(__dirname, pasta).replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}[\\/\\\\]`,
);
// SOMA aos bloqueios padrão do Expo (.expo/types, .expo/web/cache, __tests__,
// builds nativos), nunca os substitui: atribuir direto os jogava fora em silêncio.
const padrao = config.resolver.blockList;
config.resolver.blockList = [
  ...(Array.isArray(padrao) ? padrao : padrao ? [padrao] : []),
  raizDe('painel'),
  raizDe('servidor'),
];

module.exports = config;

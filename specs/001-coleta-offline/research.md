# Phase 0 — Pesquisa: Coleta e visualização offline

**Feature**: `specs/001-coleta-offline` · **Data**: 2026-09-09

Todas as decisões abaixo foram verificadas empiricamente: dois aplicativos Expo SDK 57 reais
foram montados, executados com `expo start --web` e dirigidos por navegador. Onde há número
medido, ele está registrado. Não são inferências a partir de documentação — em vários pontos
a documentação oficial afirma algo que o comportamento medido contradiz.

---

## D-001 — Banco de dados no navegador

**Decision**: **Não usar `expo-sqlite` no navegador.** Usar uma porta de repositório única
com três drivers síncronos do Drizzle: `expo-sqlite` no Android, `sql.js` no navegador,
`better-sqlite3` nos testes.

**Rationale**: `expo-sqlite` na web tem cinco modos de falha verificados, e dois deles são
fatais para este projeto:

1. Sem `assetExts.push('wasm')` no Metro, o bundle do worker falha, a promessa de abertura
   **nunca resolve** e o app renderiza tela em branco **sem nada no console do navegador**.
   Só o terminal mostra o erro.
2. O `enhanceMiddleware` documentado pela Expo **não coloca COOP/COEP no documento HTML** —
   só no bundle. Medido: `GET /` sem cabeçalhos, `GET /index.ts.bundle` com eles. Resultado
   no navegador: `crossOriginIsolated = false`, `SharedArrayBuffer = undefined`.
   ([expo/expo#38481](https://github.com/expo/expo/issues/38481), aberta desde 2025-08-01,
   fechada por bot sem correção, ainda reproduzível.)
3. Mesmo com isolamento forçado por proxy, qualquer consulta que retorne **mais de 255 bytes
   corrompe**: a ponte grava um `Uint32Array` dentro de um `Uint8Array`, truncando em
   `& 0xFF`. Medido: `SYNC BIG FAIL: Expected ',' or ']' after array element in JSON at
   position 254`. ([expo/expo#45186](https://github.com/expo/expo/issues/45186), aberta.)
4. Uma **segunda aba** derruba o banco: `NoModificationAllowedError` no OPFS, porque o
   `AccessHandlePoolVFS` é construído na inicialização do worker mesmo para bancos em
   memória. ([expo/expo#36835](https://github.com/expo/expo/issues/36835), aberta.)
5. `expo-sqlite` combinado com `expo-router` em `web.output: "static"` ou `"server"` falha o
   bundle com `Worker chunk not found`. E `"static"` é o padrão do template.

O ponto decisivo: **`drizzle-orm/expo-sqlite` é inteiramente síncrono** (`prepareSync`,
`executeSync`, `getAllSync`). Toda consulta Drizzle na web passa pela ponte de
`SharedArrayBuffer` — ou seja, cai direto em (2) e, se contornada, em (3).

Há ainda um impasse estrutural: a forma documentada de obter COOP/COEP no documento HTML é a
opção `headers` do `expo-router` (SDK 54+), que **funciona** — mas só existe em `static` e
`server`, que são exatamente os modos onde o worker do `expo-sqlite` não compila. Com
`output: "single"` o worker compila e os cabeçalhos somem. **Não existe configuração no SDK
57 em que os dois funcionem.**

**Alternatives considered**:

- **`drizzle-orm/sqlite-proxy` sobre a API assíncrona do `expo-sqlite`** — funciona nas duas
  plataformas com persistência OPFS real, verificado (60 linhas, 3.222 bytes, incluindo
  transação, com `crossOriginIsolated=false`). **Rejeitado** porque força toda a camada de
  repositório a ser assíncrona, contaminando os testes em Node e o código nativo com uma
  restrição que só existe na web — e ainda morre na segunda aba.
- **Porta de repositório em TypeScript puro, sem SQL na web** — rejeitado. Exigiria escrever
  e testar um motor de consulta à mão, o caminho web nunca exercitaria o SQL real, e
  migrações, índices e semântica append-only divergiriam entre plataformas.
- **`@sqlite.org/sqlite-wasm`** — o Drizzle não tem driver para ele. Exigiria um driver
  artesanal via `sqlite-proxy`.

**Medições que sustentam a escolha**: `sql.js` no navegador, sem COOP/COEP, sem OPFS, sem
worker — 200 linhas inseridas e lidas em **53 ms**, contra **1.812 ms** pela ponte síncrona
do `expo-sqlite`. Cerca de **34× mais rápido**, além de imune aos cinco modos de falha e
seguro com múltiplas abas.

**Custo aceito**: a persistência no navegador é manual — `db.export()` para `Uint8Array`,
gravado em IndexedDB com *debounce*, e `new SQL.Database(bytes)` na inicialização. Cerca de
40 linhas, verificadas ponta a ponta, incluindo o retorno após recarregar a página.

**O que torna isso não descartável**: os três drivers constroem o mesmo tipo
`BaseSQLiteDatabase<'sync', any, any>` com o mesmo `SQLiteSyncDialect`. API idêntica, tipos
idênticos — verificado com `tsc --noEmit`, zero erros, **sem nenhum cast**. Existe um único
módulo de acesso a dados, e o mesmo SQL roda nas três plataformas. O caminho Android é o
caminho de produção.

---

## D-002 — Estrutura do projeto: sem monorepo

**Decision**: Um único aplicativo Expo, com fronteiras internas em `src/`.

**Rationale**: O plano de projeto previa um monorepo (`packages/core`, `packages/db`,
`apps/mobile`, `apps/web`). Com um único aplicativo, ele não entrega benefício nenhum e
custa configuração que o time — sem experiência prévia — pagaria em horas que não tem. A
própria documentação da Expo avisa que monorepos não servem a todo projeto e agregam
complexidade de configuração.

O Princípio IV da constituição exige **disciplina de importação**, não empacotamento físico:
uma pasta `src/transports/` que é o único lugar autorizado a importar SDK de transporte
satisfaz o princípio integralmente. Quando o painel web (feature 005) existir de fato,
extrair `src/core/` para um pacote é movimento mecânico.

**Alternatives considered**: pnpm workspaces — a Expo tem suporte de primeira classe desde o
SDK 52, com Metro se autoconfigurando, e o SDK 54+ aceita o `node_modules` isolado do pnpm.
Funciona. **Rejeitado por custo de aprendizado**, não por defeito técnico. Se o time insistir
em pnpm no futuro, a saída documentada é `nodeLinker: hoisted` no `pnpm-workspace.yaml`.

**Consequência**: `CLAUDE.md` e `.claude/rules/*.md` foram escritos referenciando a estrutura
de monorepo e **precisam ser atualizados** para a estrutura real. Está registrado como tarefa.

---

## D-003 — Roteamento e saída web

**Decision**: Expo Router com `"web": { "output": "single" }` no `app.json`.

**Rationale**: Expo Router é a recomendação oficial para app novo, é o que o
`create-expo-app` monta por padrão, é construído sobre React Navigation e entrega roteamento
por URL real na web. O modo `"single"` produz uma SPA de um único HTML, mantendo o
roteamento por URL. O padrão do template é `"static"`, que quebra o bundle quando há worker
(D-001, falha 5) e adiciona renderização no servidor que este projeto não precisa.

**Alternatives considered**: React Navigation puro — mais trabalho manual, sem URL na web, e
o Expo Router já o usa por baixo.

---

## D-004 — Exportação de arquivo

**Decision**: Bifurcar por plataforma desde o início, atrás de uma função única
`salvarECompartilhar(nome, conteudo)`.

**Rationale**: **`expo-file-system` não tem implementação web nenhuma** — as plataformas
declaradas são android, ios e tvos. Descobrir isso ao construir a exportação seria descobrir
no dia 6 de 7. No nativo, `File` mais `expo-sharing`; na web, `Blob` mais um elemento
`<a download>`.

**Nota de escopo**: o requisito FR-034 fala em compartilhar pelos meios do aparelho. Na web
isso é o download do navegador, o que é o comportamento correto para a demonstração.

---

## D-005 — Gráficos

**Decision**: `react-native-svg` 15.15.4, com um único `<Path>` cujo `d` é construído à mão a
partir dos resumos diários.

**Rationale**: Suporte web oficial, verificado renderizando um gráfico de linha sob
`expo start --web`. Mantém o projeto longe de bibliotecas de gráfico, que o Princípio II
proíbe introduzir sem número medido, e das alternativas baseadas em Skia, bem mais arriscadas
na web.

**Restrições obrigatórias, cada uma de uma issue aberta**:

- **Sempre definir `width` e `height` numéricos explícitos** no `<Svg>`. Na web ele não deriva
  largura de `viewBox` ([#2138](https://github.com/software-mansion/react-native-svg/issues/2138)).
  Medir o contêiner com `onLayout` e passar números.
- **Não usar `onPress` em `<Path>`** — o mapeamento para `onClick` é instável na web
  ([#2865](https://github.com/software-mansion/react-native-svg/issues/2865)). Sobrepor um
  `Pressable` transparente.
- **Não usar `toDataURL`** — perde imagens e fontes na web
  ([#2887](https://github.com/software-mansion/react-native-svg/issues/2887)).

---

## D-006 — Listas

**Decision**: `FlatList` comum, com `getItemLayout`, `keyExtractor`,
`removeClippedSubviews`, `initialNumToRender: 15`, `windowSize: 7` e linhas em `React.memo`.

**Rationale**: O plano de projeto previa `@shopify/flash-list`. Ele funciona sob
react-native-web — verificado com 500 itens — mas a Shopify declara que a web não é testada
ativamente, e há bugs abertos relevantes: `inverted` congela a virtualização e deixa a lista
permanentemente em branco ([#2380](https://github.com/Shopify/flash-list/issues/2380)), além
de laços de relayout com a barra de rolagem (#2361).

Para algumas centenas de linhas, uma `FlatList` bem configurada é indistinguível e tem risco
zero de plataforma. O critério SC-006 exige 10.000 leituras rolando sem travamento — se a
medição no aparelho de referência reprovar, `@shopify/flash-list@2.0.2` entra como troca
localizada, com o número medido registrado conforme o Princípio II.

---

## D-007 — Versões

**Decision**: Instalar tudo que é nativo ou universal com `npx expo install`, nunca escolhendo
versão à mão no npm. Fixar exatamente o que não pertence ao SDK.

**Rationale**: A Expo publica `bundledNativeModules.json` por ramo de SDK, e o `expo install`
o consulta. Vários pacotes têm `latest` no npm à frente do que o SDK 57 fixa — por exemplo
`react-native-svg` 15.15.5 no npm contra 15.15.4 no SDK, e `@shopify/flash-list` 2.3.2 contra
2.0.2. Escolher a dedo introduz incompatibilidade silenciosa.

Duas armadilhas de versão registradas:

- **`drizzle-orm` 0.45.2**, não a linha 1.0. A documentação do Drizzle sugere `@rc`, mas a 1.0
  ainda está em *release candidate*. Não é lugar para um prazo com nota.
- **`vitest` 4.1.11**, não a 5. A 5.0.0 saiu há poucos dias e funciona, mas seis dias de idade
  não é base para um prazo avaliado.

---

## D-008 — Configuração de build

**Decision**:

`metro.config.js` precisa de duas linhas, e **não** precisa do bloco COOP/COEP que a
documentação do `expo-sqlite` manda incluir:

```js
config.resolver.assetExts.push('wasm');   // sql.js
config.resolver.sourceExts.push('sql');   // migrações do drizzle
```

`babel.config.js` precisa do plugin `inline-import` para `.sql`, e `drizzle.config.ts` usa
`dialect: 'sqlite'` com `driver: 'expo'`.

**Rationale**: O bloco COOP/COEP existe para viabilizar o `SharedArrayBuffer` do
`expo-sqlite` na web. Como D-001 descarta esse caminho, ele vira configuração inerte que
confunde quem for ler depois — e, pior, sugere que o isolamento está ativo quando medimos que
não está.

---

## Riscos remanescentes

| Risco | Probabilidade | Mitigação |
|---|---|---|
| Persistência via IndexedDB falhar em aba anônima | Média | Verificado que funciona; em falha, degradar para memória e avisar na UI. A demo é de aba normal. |
| `sql.js` pesar no bundle web | Baixa | ~1,5 MB de WASM, carregado sob demanda. Só afeta a web, que na demo é local. |
| Medição de desempenho no Android reprovar os orçamentos | Média | Os orçamentos são explicitamente provisórios (Princípio II) e serão re-ratificados com número medido. |
| Divergência entre `sql.js` e `expo-sqlite` em algum comportamento SQL | Baixa | Mesmo motor SQLite compilado; os testes rodam o mesmo SQL em `better-sqlite3`. |

Nenhum item `NEEDS CLARIFICATION` permanece.

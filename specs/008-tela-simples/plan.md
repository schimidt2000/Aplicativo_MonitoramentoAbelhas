# Implementation Plan: Tela simples para o apicultor

**Branch**: `feat/008-tela-simples` | **Date**: 2026-11-10 | **Spec**: [spec.md](./spec.md)

## Summary

Reorganização de telas, sem tocar em banco, ingestão, transporte ou firmware. A barra de abas
sai: `src/app/(tabs)/` deixa de existir e as rotas viram telas da pilha, com o Início como
raiz. Uma função pura (`src/core/situacao.ts`) escolhe a única linha de situação de cada
cartão. Um guarda de envio (`src/data/envioUnico.ts`) impede dois envios ao mesmo tempo e é
usado pelo envio automático do Início e pelo botão de Enviar.

## Technical Context

Expo Router (pilha), React Native / react-native-web, sql.js na web e expo-sqlite no aparelho
— tudo como hoje. Nenhuma dependência nova.

## Decisions

- **D-801**: Sem abas. Rotas: `index` (Início), `colmeia/[id]`, `coleta-cabo` (título
  "Coletar"), `enviar`, `ajustes`, `coletar` (coleta sem fio simulada), `vincular`,
  `diagnostico`, `cabo`, `placa-nova`. Endereços antigos continuam válidos (`/enviar`,
  `/ajustes`, `/coletar`), então os links existentes não mudam.
- **D-802**: O botão Coletar do Início vai para `/coleta-cabo`, o único caminho da placa real
  (gotcha do CLAUDE.md). Onde não há cabo, essa tela já oferece a placa simulada (005, FR-032).
- **D-803**: Situação por prioridade (FR-003) numa função pura testada; a cor vem com ícone e
  palavra (Princípio V). Bateria desconhecida não gera linha.
- **D-804**: Envio automático no foco do Início, fora do render, só com vínculo e pendentes.
  Um envio por vez via `envioUnico`; sem rede o motor devolve `sem-rede` e nada é mostrado
  como falha.
- **D-805**: Explicação dos voláteis recolhível no próprio detalhe (não é tooltip nem outra
  tela); o rótulo do cartão continua dizendo "Voláteis (COVs)" e "em relação ao normal".

## Comportamento Offline

| Tela/Ação | Sem rede | Rede intermitente | Fonte do dado |
|---|---|---|---|
| Início (lista, situação) | Completa | Completa | SQLite local (`listarColmeias`) |
| Início: envio automático | Não envia; linha diz que espera internet | Para e retoma no próximo foco | `enviarPendentes` + sonda da 002 |
| Coletar (cabo) | Completa | Completa | Placa pelo cabo; SQLite local |
| Colmeia | Completa | Completa | SQLite local |

## Constitution Check

| Princípio | Veredito | Evidência |
|---|---|---|
| I. Offline por Padrão | PASS | Tabela Comportamento Offline; envio no foco, nunca no render; "No celular"/"Na nuvem" separados no cartão (FR-004) |
| II. Orçamento de Desempenho | PASS | Uma consulta a menos por foco (o aviso de atraso some); a situação é cálculo em memória sobre a lista já carregada; envio em segundo plano não bloqueia a UI |
| III. Leituras Imutáveis e Idempotentes | PASS | Nenhuma escrita nova; o envio usa o motor da 002 (só `synced_at`); envio único evita trabalho dobrado, e o servidor já ignora repetição |
| IV. O Payload é Externo | N/A | Nenhuma mudança em transporte, decodificação ou conversa com a placa; telas continuam importando só o registro de transportes |
| V. Ergonomia de Campo em pt-BR | PASS | Ação primária (Coletar) no terço inferior; alvos ≥ 56 dp; situação com cor + ícone + palavra; chaves novas `inicio.*`, `situacao.*` em `pt-BR.ts`; `tests/telas.test.ts` |
| VI. Honestidade do Dado | PASS | Rótulo "Voláteis (COVs)" mantido; explicação inteira, com "Não é CO₂", a um toque; gráfico e lacunas inalterados |
| VII. Especificação Antes do Código | PASS | `specs/008-tela-simples/spec.md`, tarefas T801–T812 |

## Project Structure

```
src/app/_layout.tsx            pilha com Início como raiz
src/app/index.tsx              Início (era (tabs)/index.tsx)
src/app/enviar.tsx, ajustes.tsx, coletar.tsx   (eram (tabs)/…)
src/app/coleta-cabo.tsx        colmeia numa linha, título Coletar
src/app/colmeia/[id].tsx       explicação recolhível
src/core/situacao.ts           escolha da linha de situação
src/data/envioUnico.ts         um envio por vez
tests/situacao.test.ts, tests/envio-unico.test.ts
```

## Complexity Tracking

Nenhuma violação.

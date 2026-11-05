# Implementation Plan: Voláteis relativos ao normal de cada colmeia

**Branch**: `feat/007-volateis-relativos` | **Date**: 2026-11-05 | **Spec**: [spec.md](./spec.md)

## Summary

Uma função pura (`src/core/volateis.ts`) calcula o normal da colmeia a partir dos resumos
diários que já existem (`reading_daily.tvoc_med`) e classifica um valor. O repositório entrega
os dias; as telas formatam. Nada muda no banco nem na ingestão.

## Constitution Check

| Princípio | Como esta feature cumpre |
|---|---|
| I. Offline por Padrão | Tudo local, sobre os resumos diários |
| II. Orçamento de Desempenho | Uma consulta de 14 linhas por colmeia; sem agregação no render |
| III. Leituras Imutáveis | Só leitura; nada é gravado |
| IV. O Payload é Externo | Não toca no formato da placa |
| V. Ergonomia de Campo | Palavra no lugar de número cru; mesmo tamanho de leitura |
| VI. Honestidade do Dado | É o objetivo: voláteis relativos à própria colmeia, sem ppb, limiares marcados como provisórios |
| VII. Spec Antes do Código | Esta spec antes do código |

## Decisions

- **D-701**: mediana das médias diárias, não média: um dia de manejo (fumaça, colmeia aberta)
  não desloca o normal.
- **D-702**: janela de 14 dias anteriores ao dia da última leitura (esse dia fica de fora,
  porque pode estar incompleto); mínimo de 3 dias.
- **D-703**: limiar de 50 % para "acima"/"abaixo", provisório.
- **D-704**: o gráfico usa o mesmo normal para 7 e 30 dias, para os dois falarem da mesma coisa.

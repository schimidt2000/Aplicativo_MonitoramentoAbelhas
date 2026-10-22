# Quickstart — ver a hora das leituras funcionando

**Feature**: `specs/003-hora-das-leituras` · app de campo no navegador (`npm run web`)

As colmeias de demonstração têm uma linha do tempo fixa: ligaram em 01/09/2026, 12:00 UTC, e
medem a cada 15 min. A semente põe no celular o que uma coleta feita há 2, 21 e 38 dias
teria trazido, com a referência de hora daquela coleta.

> **Banco de antes desta feature.** Um navegador que já abriu o app antes guarda leituras e
> âncoras do modelo antigo, em que o nó simulado "reinventava" a própria história a cada
> conexão. Depois da migração, a primeira coleta pode perguntar a data do celular por causa
> desses dados velhos. Para ver a demonstração limpa, apague os dados do site (ou use uma
> janela anônima) antes de abrir.

## 1. Caso normal (FR-005, FR-012)

1. Ajustes → simulação "Nenhum problema". Coletar.
2. Resultado: nenhuma pergunta, "Relógio acertado em 3 colmeias".
3. Detalhe de qualquer colmeia: gráfico contínuo, nenhuma nota de "sem hora conhecida".
   Por baixo: as leituras da semente e as da coleta saem **ancoradas** (a coleta conferiu
   com a referência da semente).

## 2. A placa perdeu energia (US1, SC-001)

1. Ajustes → "O sensor ficou sem energia ontem e religou". Coletar.
2. Nada de aviso para o apicultor (FR-020). Na Colmeia 07, as leituras de antes da falta de
   energia continuam com a hora da ligada antiga; as de depois, com a da coleta.
3. Volte para "Nenhum problema" e colete de novo: **nenhuma** pergunta. A falta de energia
   ficou guardada e continua valendo.

## 3. Celular com a data errada (US2, SC-002)

1. Ajustes → "A data do celular está um ano adiantada". Coletar.
2. Resultado: cartão "A data do celular está certa?" com a data de daqui a um ano em
   destaque, dois botões grandes.
3. Toque **Não**: "Acerte a data e a hora nos ajustes do celular. Depois toque em Coletar de
   novo." Nada é revogado.
4. Ajustes → "Nenhum problema". Coletar: a pergunta **volta** (o conflito continua), agora
   com a data certa. Toque **Sim, está certa**: "Combinado: vale a data deste celular.
   Relógio acertado em 3 colmeias."
5. Colete de novo: sem pergunta, relógios acertados.

## 4. Sensor sem noção de tempo (US3, FR-016)

1. Ajustes → "O sensor não sabe contar o tempo". Coletar.
2. Detalhe da Colmeia 07: a nota "N leituras estão sem hora conhecida e ficaram fora do
   gráfico e das médias". O gráfico não mudou: nenhuma hora foi inventada.

## Testes automáticos

```
npx vitest run tests/hora.test.ts tests/hora-coleta.test.ts tests/hora-demo.test.ts \
  tests/hora-mensagens.test.ts tests/migracao.test.ts tests/hora-desempenho.test.ts
```

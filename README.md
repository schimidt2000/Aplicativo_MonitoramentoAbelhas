# Bee-sertão

Monitoramento do microclima de colmeias para apicultores e meliponicultores do semiárido
brasileiro. Um nó sensor dentro da colmeia mede temperatura, umidade e voláteis (COVs); o
apicultor vai até a colmeia, **coleta** as leituras para o celular — sem internet, porque
no apiário quase nunca tem — e, quando tiver sinal, **envia** para a nuvem. As
pesquisadoras analisam os dados no painel.

Ausência de rede é o estado normal do app, não um erro. Os celulares de referência são
Android simples, de 2 GB de RAM.

## Os três artefatos

| Artefato | O que é | Onde está |
|---|---|---|
| **App de campo** | Expo, no Android. Guarda tudo num banco local (SQLite) e funciona em modo avião | `src/` |
| **App de campo no navegador** | o mesmo app rodando no Chrome ou no Edge, com banco local (sql.js). Serve para demonstração e laboratório; é também onde a placa é lida pelo cabo USB | `src/` |
| **Painel** | o site das pesquisadoras (Vite). Online, sem banco local | `painel/` |

Mais o **servidor** (Postgres com RLS, no Supabase) em `servidor/`, que recebe o envio do
app de campo e serve o painel.

## O nó sensor é de outra equipe

O nó sensor (placa Seeed XIAO ESP32-C6 com AHT21 e ENS160) e o firmware dele pertencem ao
**grupo do firmware**. O formato dos dados é um contrato externo, que vai mudar. O que foi
confirmado por eles, com data e fonte, e o que ainda é suposição nossa está em
[`docs/integracao-firmware.md`](docs/integracao-firmware.md).

O botão **Coletar** das abas ainda coleta de **nós sensores simulados**. A coleta da placa
real é pela tela **Coletar pelo cabo** (feature 005), no app de campo no navegador, com o
protocolo do firmware de 2026-10-21. Ela ainda não foi testada com a placa de verdade.

## Como rodar

Precisa de Node 20 ou mais novo.

App de campo:

```bash
npm install
npm run web        # app de campo no navegador
npm run android    # app de campo no Android (Expo)
```

Painel:

```bash
cd painel && npm install && npm run dev
```

Sem `VITE_SUPABASE_URL` e `VITE_SUPABASE_ANON_KEY` (opcionais, em `painel/.env.local`) o
painel entra em **modo de demonstração**, com dados inventados e sem rede.

### Chaves

O `.env.local` (fora do git) leva **só a chave pública** do projeto (anon ou
`sb_publishable_…`). **Nunca** a `service_role` nem uma `sb_secret_`: o app de campo recusa
e volta para a nuvem simulada. Passo a passo em
[`specs/002-envio-e-painel/quickstart.md`](specs/002-envio-e-painel/quickstart.md).

## Testes

```bash
npm run typecheck          # tsc do app de campo
npm test                   # vitest do app de campo
npm run check:fronteira    # fronteiras da constituição, por comando

cd painel
npm test                   # vitest do painel
npm run check:sem-banco    # o painel não tem banco local nem motor de envio
```

Servidor: `npm run servidor:teste` aplica `servidor/*.sql` num Postgres 15+ local e
descartável (precisa de `initdb`, `pg_ctl` e `psql` no PATH; nada vai para a rede).

## Estrutura

```
src/core/        domínio puro, sem plataforma: decodificação, hora, mensagens, i18n (pt-BR)
src/transports/  único lugar que fala com o meio físico (simulado; cabo da bancada)
src/nuvem/       cliente da nuvem: simulado e Supabase (fetch puro, sem SDK)
src/data/        banco local, migrações, coleta, envio
src/ui/ src/app/ componentes e telas (Expo Router)
painel/          painel das pesquisadoras
servidor/        esquema, RLS, LGPD e testes do Postgres
tests/           testes do app de campo
specs/           uma pasta por feature (Spec Kit)
docs/            firmware, questionário para o grupo do firmware, glossário
```

## Como trabalhamos

Spec antes do código: cada feature passa por especificar, esclarecer, planejar, listar
tarefas, analisar e implementar, com o Spec Kit (`specs/<NNN>-<nome>/`). Os princípios que
reprovam um plano estão na [constituição](.specify/memory/constitution.md); o vocabulário
das telas, no [glossário](docs/glossario.md).

## Licença

A definir.

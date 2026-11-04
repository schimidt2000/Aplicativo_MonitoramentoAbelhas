# Implementation Plan: Coleta pelo cabo no Android

**Branch**: `feat/006-cabo-android` | **Date**: 2026-11-04 | **Spec**: [spec.md](./spec.md)

## Summary

Um segundo transporte de bytes para a coleta pelo cabo: a porta USB do próprio aparelho
Android, por um módulo nativo local do Expo. Tudo acima da porta (`CanalSerial`, conversa,
gravação, hora, mensagens) é o da 005 e não muda. As telas deixam de chamar a Web Serial
direto e passam a falar com uma interface única, `CaboDeColeta`, com duas versões: navegador e
Android.

## Technical Context

**Language/Version**: TypeScript 6 (app), Kotlin (módulo nativo, Android)
**Primary Dependencies**: Expo SDK 57, expo-modules-core (já no projeto), Android USB Host API
**Storage**: o da 005 (SQLite do aparelho)
**Testing**: vitest com a placa simulada; teste manual no tablet Samsung com a placa real
**Target Platform**: Android 8+ com USB host (OTG); o navegador segue como na 005
**Constraints**: sem SDK de terceiros (módulo próprio, ~250 linhas); não tocar DTR/RTS
**Scale/Scope**: um aparelho, uma placa por vez

## Constitution Check

| Princípio | Como esta feature cumpre |
|---|---|
| I. Offline por Padrão | A coleta pelo cabo não usa rede. A versão instalada leva o código dentro (variante release), sem depender do computador |
| II. Orçamento de Desempenho | Leitura numa thread nativa própria; JS recebe pedaços por evento; nada na thread de UI |
| III. Leituras Imutáveis | Nada muda: grava pela mesma `coletarPeloCabo` da 005 |
| IV. O Payload é Externo | Só o transporte muda; `arquivo-1` e a conversa seguem os da 005. Módulo nativo só é importado em `src/transports/` (check-fronteira) |
| V. Ergonomia de Campo | Permissão pedida no toque; aviso de placa acordada; mensagens da 005 |
| VI. Honestidade do Dado | Mesmo desfecho da 005 para cabo solto; sem gravar parcial |
| VII. Spec Antes do Código | Esta spec, plano e tarefas antes do código |

## Decisions (research)

- **D-601 Módulo próprio, não biblioteca**: a placa é CDC-ACM padrão; o Android USB Host API
  basta (`openDevice`, `claimInterface`, `bulkTransfer`, `SET_LINE_CODING`). Um módulo local
  (`modules/bee-usb-serial`) evita dependência de terceiros desatualizada com a nova
  arquitetura do React Native e fica sob o Princípio IV.
- **D-602 Sem SET_CONTROL_LINE_STATE**: o periférico USB Serial/JTAG do ESP32-C6 reinicia o
  chip conforme DTR/RTS. O módulo nunca envia esse pedido; só `SET_LINE_CODING` (115200 8N1),
  que não reinicia.
- **D-603 Placa = fabricante Espressif (VID 0x303A)**: confirmado no macOS em 2026-11-04 (PID
  0x1001). Outros aparelhos são ignorados.
- **D-604 Placa que acorda: vigia por consulta**: a lista de aparelhos USB é consultada a cada
  1 s enquanto a tela está aberta. É mais simples e confiável que os avisos do sistema, que
  variam entre versões do Android.
- **D-605 Permissão no `abrir`**: a placa reaparece como aparelho novo a cada despertar, e a
  permissão do Android vale por aparelho conectado. O app pede a permissão ao abrir, que
  sempre acontece a partir do toque em Coletar ou Acertar o relógio (FR-003).
- **D-606 Bytes por evento em base64**: a thread de leitura entrega cada pedaço como evento;
  o JS empurra na mesma `EntradaDeBytes` da 005, que já trata pedaços de qualquer tamanho.
- **D-607 Instalação por arquivo, variante release**: `npx expo run:android --variant release`
  gera o APK com o código embutido e instala pelo cabo (adb). O tablet funciona depois sem o
  computador, e a porta fica livre para a placa. A pasta `android/` é gerada (CNG) e continua
  fora do git.

## Project Structure

```text
modules/bee-usb-serial/                módulo nativo local (autolinking do Expo)
├── expo-module.config.json
├── index.ts                           tipos + requireOptionalNativeModule
└── android/
    ├── build.gradle
    └── src/main/java/expo/modules/beeusbserial/BeeUsbSerialModule.kt
src/transports/cable/
├── cabo.ts                            interface CaboDeColeta + versão navegador
├── android.ts                         versão Android (usa o módulo)
├── disponibilidade.ts                 + temUsbNativo
└── index.ts                           caboDeColeta()
src/app/coleta-cabo.tsx, placa-nova.tsx   usam CaboDeColeta
tests/cabo-android.test.ts             versão Android contra um módulo falso
docs/android-instalar.md               como gerar e instalar no aparelho
```

# Tasks: Coleta pelo cabo no Android

**Input**: [spec.md](./spec.md), [plan.md](./plan.md)

## Phase 1: Transporte

- [x] T601 Módulo nativo `modules/bee-usb-serial` (listar, pedirPermissao, abrir, escrever,
  fechar; eventos onDados e onFim; sem DTR/RTS) — D-601 a D-606
- [x] T602 `CaboDeColeta` com versão navegador (embrulha a 005) e versão Android
- [x] T603 Disponibilidade: Android com o módulo = cabo disponível; Expo Go e navegador de
  celular seguem explicando (FR-008); textos ajustados
- [x] T604 Telas `coleta-cabo` e `placa-nova` usam `CaboDeColeta` (sem mudar o comportamento
  no navegador)
- [x] T605 check-fronteira: o módulo nativo só em `src/transports/`

## Phase 2: Testes

- [x] T606 `tests/cabo-android.test.ts`: versão Android contra um módulo falso que liga na
  placa simulada (bytes em pedaços, cabo solto, permissão negada, placa que some e volta)
- [x] T607 Suíte da 005 passando sem mudança (SC-005)

## Phase 3: Aparelho

- [ ] T608 Gerar e instalar no tablet Samsung (`docs/android-instalar.md`, FR-010) — **parcial
  (2026-11-04):** APK release gerado (cópia em pasta sem acento, Java 17) e conferido no
  emulador Android 10: abre sem o computador, o módulo carrega ("Usar a placa de verdade"),
  sem placa diz "A placa não apareceu". **Falta:** instalar no tablet (precisa da depuração
  USB autorizada)
- [ ] T609 Coleta real no tablet com a placa do grupo do firmware (SC-001 a SC-004)

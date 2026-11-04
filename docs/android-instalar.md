# Instalar o app no Android pelo cabo (feature 006)

O app instalado por arquivo é o único que coleta a placa pelo cabo USB do próprio celular ou
tablet. O Expo Go continua servindo para ver as telas, mas não lê a placa. Não precisa de
conta na Play Store: o arquivo vai direto do computador para o aparelho pelo cabo.

## Uma vez no aparelho

1. **Configurações > Sobre o tablet > Informações do software**: toque 7 vezes em "Número de
   compilação".
2. **Configurações > Opções do desenvolvedor**: ligue **Depuração USB**.
3. Ligue o aparelho no computador. Quando ele perguntar "Permitir depuração USB?", marque
   "Sempre permitir neste computador" e toque em **Permitir**.

Aparelho com bloqueio de administrador (de escola ou empresa) pode recusar a instalação.

## No computador (macOS)

Precisa do Android Studio (pelo SDK do Android) e do **Java 17**. O Java que vem com o
Android Studio é o 25, e com ele a compilação de partes nativas do React Native falha com
"A restricted method in java.lang.System has been called". Na pasta do projeto:

```bash
export JAVA_HOME="/Library/Java/JavaVirtualMachines/jdk-17.jdk/Contents/Home" ANDROID_HOME="$HOME/Library/Android/sdk"
```

```bash
CI=1 npx expo prebuild -p android --no-install && git checkout package.json
```

```bash
cd android && ./gradlew assembleRelease && cd ..
```

```bash
"$ANDROID_HOME/platform-tools/adb" install -r android/app/build/outputs/apk/release/app-release.apk
```

- O `prebuild` gera a pasta `android/`, que fica fora do git. O `git checkout package.json`
  desfaz a troca que ele faz no `npm run android`, que continua abrindo no Expo Go.
- A variante `release` leva o código dentro: depois de instalado, o app funciona sem o
  computador, e a porta do aparelho fica livre para a placa.
- A primeira compilação leva uns 10 a 20 minutos. As seguintes, poucos minutos.

## Coletar a placa no aparelho

1. Tire o cabo do computador e ligue a placa na porta do aparelho com um cabo USB-C dos dois
   lados (ou um adaptador USB-C para USB-A).
2. Abra o Bee-sertão, aba **Coletar**, **Coletar pelo cabo**, **Usar a placa de verdade**.
3. Aperte o botão da placa. O app avisa "A placa acordou".
4. Toque em **Coletar**. Na primeira vez, o Android pergunta se o Bee-sertão pode usar a placa:
   toque em **OK**. Como a placa volta como aparelho novo a cada vez que acorda, o Android
   pode perguntar de novo.

Placa nova: **Ajustes > Abrir diagnóstico > Configurar placa nova**, como no computador.

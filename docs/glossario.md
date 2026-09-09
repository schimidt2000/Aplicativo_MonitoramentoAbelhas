# Glossário — vocabulário do app

**Fonte única de verdade para toda string visível.** O Princípio V da constituição torna este
documento vinculante: o vocabulário da UI MUST seguir o que está aqui.

A regra por trás de tudo: **o app fala a língua do apicultor, não a do programador.**

## Termos de manejo

| Termo | Significado | Observação |
|---|---|---|
| **colmeia** | a caixa com a colônia | Termo genérico, serve para as duas criações |
| **apiário** | o local com várias colmeias de *Apis* | |
| **meliponário** | o local com várias colmeias de abelhas sem ferrão | **Nunca chamar de "apiário"** |
| **ninho** | câmara de cria | |
| **melgueira** | caixa de mel, acima do ninho | |
| **revisão** / **inspeção** | a visita do apicultor à colmeia | As duas formas são aceitas |
| **enxame** | a colônia de abelhas em si | |
| **enxameação** | a divisão natural da colônia | Só faz sentido para *Apis* |

### Vocabulário que diverge por criação

Esta é a distinção que mais denuncia um app escrito sem pesquisa de campo.

| Só *Apis mellifera* | Só meliponíneos (sem ferrão) |
|---|---|
| quadro | disco de cria |
| favo | pote de alimento |
| cera alveolada | cerume, batume, geoprópolis |

**Nunca perguntar a um meliponicultor quantos "quadros com cria" a colmeia tem.** Não existem
quadros num ninho de jataí ou jandaíra. É o tipo de erro que, na primeira tela, anuncia que
não fizemos a lição de casa.

## Termos do nosso sistema

| Termo na UI | O que é | O que NÃO dizer |
|---|---|---|
| **nó sensor** | o aparelho dentro da colmeia | "device", "dispositivo", "sensor" sozinho |
| **coleta** | baixar os dados acumulados do nó para o celular | "download", "sincronizar", "puxar" |
| **leitura** | um registro de medição, com hora | "amostra", "sample", "dado" |
| **sincronizar** | enviar do celular para a nuvem | "fazer sync", "upload", "subir" |
| **salvo no celular** | o dado está no aparelho, ainda não enviado | "pendente", "offline", "não salvo" |
| **salvo na nuvem** | o servidor confirmou a gravação | "sincronizado", "ok", "enviado" |

**Coleta e sincronização são coisas diferentes e nunca devem se confundir na UI.** Coleta é
colmeia → celular, presencial, por BLE ou cabo. Sincronização é celular → nuvem, depois,
quando houver internet. Um dado pode estar coletado e não sincronizado por semanas — e isso é
normal, não é erro.

## As grandezas medidas

| Rótulo na UI | O que é | Precisão exibida |
|---|---|---|
| **Temperatura** | temperatura dentro da colmeia | 1 casa decimal — `34,7 °C` |
| **Umidade** | umidade relativa dentro da colmeia | 0 casas — `68 %` |
| **Voláteis (COVs)** | assinatura de odor do ninho | tendência, não número cru |
| **Bateria** | carga do nó sensor | palavra, não porcentagem |

### Por que "Voláteis (COVs)" e nunca "CO₂"

O sensor de gás **não mede CO₂**. Ele mede compostos orgânicos voláteis — cera, própolis, mel
em cura, feromônios — e a partir disso *estima* um valor chamado "CO₂ equivalente", usando uma
correlação criada para ambientes com pessoas. Dentro de uma colmeia essa estimativa não
descreve o CO₂ real, e em alguns momentos se move na direção oposta a ele.

O Princípio VI proíbe exibir esse valor como CO₂, em qualquer tela, gráfico ou exportação.

**Texto do cartão na tela da colmeia:**

> ### Voláteis da colmeia (COVs)
> *Assinatura de odor do ninho — cera, própolis, mel e feromônios.*
> **Não é CO₂.** Serve para acompanhar mudanças **nesta** colmeia ao longo do tempo, não para
> comparar colmeias.

Detalhes técnicos em `integracao-firmware.md`.

### Por que a bateria é palavra, não porcentagem

A curva de descarga fica praticamente plana e depois despenca. Um mapa linear de tensão para
porcentagem mostra "70 %" durante meses e depois mente exatamente quando importa. Três estados:

**Boa** · **Trocar em breve** · **Trocar agora**

A tensão bruta existe, mas vive na tela técnica.

## Como escrevemos mensagens

- Toda mensagem diz **o que aconteceu e o que fazer em seguida**.
- Ausência de rede **não é erro**. Não usar "erro", "falha" nem "offline" como manchete para
  falta de sinal. O certo é `Vai enviar quando tiver internet`.
- Nunca exibir código de erro, stack trace ou texto em inglês.
- Números em formato brasileiro: vírgula decimal, `dd/MM/aaaa`, 24 horas, sistema métrico.

| Em vez de | Escrever |
|---|---|
| "Erro de conexão" | "Não achei a colmeia. Chegue mais perto e tente de novo." |
| "Sincronização falhou" | "Vai enviar quando tiver internet." |
| "0 dispositivos encontrados" | "Nenhuma colmeia por perto." |
| "Dados não salvos" | "Salvo no celular. Falta enviar." |
| "Bluetooth desabilitado" | "O Bluetooth está desligado. Toque para ligar." |

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
| **placa** | o nó sensor **visto pelo cabo**, na mão de quem coleta: "Aperte o botão da placa", "De qual colmeia é esta placa?", "Configurar placa nova". Só nas telas do cabo (features 004 e 005) | "ESP32", "microcontrolador", "dispositivo", "porta COM" |
| **coleta** | baixar os dados acumulados do nó para o celular | "download", "sincronizar", "puxar" |
| **leitura** | um registro de medição, com hora | "amostra", "sample", "dado" |
| **enviar** / **enviado** | mandar as leituras do celular para a nuvem / o que já foi mandado e confirmado. Termos de tela. *Sincronizar* é só vocabulário interno de engenharia | "sincronizar", "sincronizado", "fazer sync", "upload", "subir" |
| **salvo no celular** | o dado está no aparelho, ainda não enviado | "pendente", "offline", "não salvo" |
| **salvo na nuvem** | o servidor confirmou a gravação (o mesmo que **enviado**) | "sincronizado", "ok" |
| **acertar o relógio** | o celular manda a hora para o nó sensor durante a coleta | "sincronizar", "sync de hora", "timestamp" |
| **hora estimada** | hora de leitura calculada pelo celular, sem âncora confiável | "hora errada", "hora inválida" |
| **intervalo da placa** | de quanto em quanto tempo a placa mede (2 h em produção). Com ele o app calcula a hora de cada leitura que chega pelo cabo (feature 005). Não confundir com o intervalo **de coleta**, que é de quanto em quanto tempo o apicultor quer coletar (Ajustes) | "período", "taxa de amostragem", "sample rate" |
| **sem hora conhecida** | leitura guardada, mas sem como saber quando foi medida (a placa religou e nenhuma coleta viu essa ligada). Fica fora do gráfico e é contada | "hora desconhecida" na tela do apicultor, "erro de hora", "ligada", "âncora", "referência" |

**Coleta e envio são coisas diferentes e nunca devem se confundir na UI.** Coleta é
colmeia → celular, presencial, por BLE ou cabo. Envio é celular → nuvem, depois, quando
houver internet. Um dado pode estar coletado e não enviado por semanas — e isso é normal,
não é erro. (No código e nos documentos de engenharia o envio também se chama
*sincronização*; na tela, nunca.)

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

## Envio e projeto (feature 002)

| Termo na UI | O que é | O que NÃO dizer |
|---|---|---|
| **enviar** / **envio** | mandar as leituras do celular para a nuvem | "sincronizar", "upload", "subir" |
| **código do projeto** | o código `XXXX-XXXX` que a pesquisadora passa ao apicultor | "senha", "login", "token", "chave" |
| **ligar o celular ao projeto** | digitar o código uma vez, só no fluxo de envio | "fazer login", "entrar", "cadastrar" |
| **projeto** | o projeto de pesquisa que reúne apicultores e pesquisadoras | "conta", "organização" |
| **pesquisadora** | quem analisa os dados no painel | "admin", "usuária" |
| **painel** | o site das pesquisadoras | "dashboard", "web", "admin" |
| **planilha** | o arquivo que a pesquisadora baixa do painel | "CSV", "export" |

*Enviar*, *enviado* e *salvo na nuvem* são as palavras de tela; a aba entregue se chama
**Enviar** e toda tela diz "enviar". *Sincronizar* fica como vocabulário interno de
engenharia (plano aceito da 002). Coletar **nunca** pede o código do projeto.

## Painel (pesquisadoras)

O painel é usado pela pesquisadora no computador, não pelo apicultor no campo. As regras de
idioma valem para ele também (Princípio V), com estas exceções, que só valem **no painel**:

| Termo no painel | Por que é aceito | Onde continua proibido |
|---|---|---|
| **Entrar** | a pesquisadora entra com e-mail e senha; ela não é apicultora e esse é o vocabulário dela | no app de campo ("ligar o celular ao projeto", nunca "entrar") |
| **E-mail** | campo da tela de entrada | no app de campo, que não pede e-mail |
| **Senha** | campo da tela de entrada | no app de campo: o código do projeto **não** é senha |
| **amostra excluída** | termo da constituição (Princípio VI: "contagem de amostras excluídas") para a leitura que ficou fora de um agregado | no app de campo, onde uma medição é sempre **leitura** |

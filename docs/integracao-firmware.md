# Integração com o nó sensor — o que sabemos e o que precisamos saber

**Este documento é a fronteira entre as duas equipes.** O firmware e o protocolo de saída do
nó pertencem à outra equipe. Aqui registramos o que foi **confirmado por eles**, com data e
nome, e o que ainda é **suposição nossa**.

> O Princípio VII da constituição exige que toda suposição sobre o nó esteja registrada aqui
> com data e quem confirmou — ou marcada explicitamente como não confirmada. Adivinhar
> requisito sobre um payload que não controlamos é a forma mais barata de perder uma campanha
> de campo inteira, e o custo só aparece depois da viagem.

## Situação atual

**Nada foi confirmado ainda.** O desenvolvimento roda contra o transporte `mock` com um
formato provisório. Nenhuma decisão de produto depende de resposta a este documento, exceto a
feature `002-coleta-ble`.

## Hardware informado (não confirmado por escrito)

| Item | Valor | Estado |
|---|---|---|
| Microcontrolador | ESP32-C3 | ⚠️ informado verbalmente |
| Temperatura e umidade | AHT21 (I²C 0x38) | ⚠️ informado verbalmente |
| Gás | ENS160 (I²C 0x52 ou 0x53) | ⚠️ informado verbalmente |
| Bateria | medição presente, formato desconhecido | ⚠️ informado verbalmente |

---

## Questionário — o mínimo para escrever o decodificador

Cada resposta vira uma linha na tabela de confirmações no fim deste arquivo.

### Identidade e descoberta

1. Qual o **identificador estável** do nó, e como o lemos?
   *Não podemos usar o endereço MAC BLE: o iOS não o expõe, e queremos manter o caminho iOS
   aberto para depois.*
2. Quais os **UUIDs** de serviço e característica? O que vai no **anúncio** e o que vai no
   **scan response**?

### Formato do dado

3. Qual o **layout exato do registro** — byte a byte, tipos, endianness, fatores de escala?
4. **Como um valor inválido é representado?** Precisa ser uma sentinela distinguível
   (`0xFFFF`, `0x8000`). **Nunca `0`** — um `0` chega na análise das especialistas parecendo
   uma medição real.
5. Existe **versão de protocolo** na carga? *(Precisamos dela para conseguir absorver
   mudanças de formato sem quebrar dados já coletados.)*
6. Quais grandezas do ENS160 são transmitidas: TVOC, eCO₂, AQI, **byte de status de
   validade**, resistências brutas das quatro placas, baselines das placas?
   *Ver "Por que pedimos isso" abaixo — muda o que conseguimos afirmar cientificamente.*
7. O **DEVICE_STATUS do ENS160** vem junto de cada amostra? Sem ele não há como separar dado
   válido de dado colhido durante aquecimento ou saturação.

### Sessão e continuidade

8. Como pedimos **apenas o que ainda não baixamos**? Existe um cursor tipo `after_seq`?
9. **O nó apaga os dados depois de lidos?** *Se não apagar, uma coleta perdida ou um celular
   quebrado deixam de ser perda de dado: basta voltar e baixar de novo. É a proteção mais
   barata do sistema inteiro, e custa zero código do nosso lado.*
10. O contador de registros **reseta ao reiniciar**? Se resetar, precisamos de outro campo
    para não gravar linha duplicada.
11. O nó tem **relógio de tempo real**? Se não, o que ele conta — tempo ligado, contador de
    amostras? *Conseguimos trabalhar sem RTC, ancorando o relógio do celular a cada coleta.*
12. Registros por pacote são fixos ou derivados do **MTU negociado**?

### Operação

13. Qual a **cadência de amostragem**, e ela é configurável pelo app?
14. Quanto tempo leva para baixar um acúmulo de 7 dias? *Dimensiona a barra de progresso e a
    paciência do apicultor parado ao lado da colmeia.*
15. O nó **anuncia continuamente**, ou precisa de botão/ímã para acordar? *Muda o fluxo
    inteiro da tela de coleta.*
16. A bateria vem em **milivolts** ou já convertida em porcentagem? *Preferimos mV: a
    conversão fica no app e continua correta se a química da bateria mudar.*
17. Existe **bonding** BLE? *A tabela de bond do ESP32 costuma ter 3 a 5 entradas; uma colmeia
    visitada por vários celulares esgota isso.*

---

## Por que pedimos isso — dois avisos técnicos

São **informação, não exigência**. As decisões de hardware são da outra equipe. Mas ambos
afetam diretamente o que o app consegue mostrar, e custam caro se descobertos depois da
coleta.

### 1. A placa do ENS160 aquece o AHT21

O ENS160 é um sensor MOX: quatro micro-placas aquecidas a 200–300 °C, consumindo cerca de
29 mA contínuos em modo padrão. Nas placas combinadas AHT21+ENS160 baratas, os dois
componentes ficam a milímetros de distância e o plano de terra distribui o calor.

Relatos de campo são consistentes: **+4 a +6 °C de desvio** na leitura do AHT21 com o ENS160
ativo, e mais de +1 °C mesmo com o ENS160 desabilitado porém alimentado. Isso é cerca de
**vinte vezes** a exatidão de ±0,3 °C do AHT21. Um ninho a 34,5 °C lido como 39,5 °C parece
dado biológico plausível — não parece falha, e é isso que o torna perigoso.

**O que só o firmware pode fazer:**
- Ler o AHT21 **primeiro**, ao acordar, antes de energizar o ENS160.
- Deixar a placa assentar termicamente antes da leitura, se o aquecedor esteve ligado.
- Transmitir uma flag **`ens160_heater_on`** em cada amostra. **Com essa flag conseguimos
  marcar e corrigir depois; sem ela, não conseguimos nem detectar.**

**O que fazemos do nosso lado, independentemente da resposta:** guardar sempre o valor bruto,
com um campo de versão de calibração e um offset por colmeia aplicado apenas na renderização.
Assim a série histórica inteira pode ser recomputada quando o desvio for caracterizado.

**Vale medirmos isso na Semana 1**, com uma placa nossa e um termômetro de referência. É um
gráfico de uma hora, decide se a placa serve como está, e é resultado publicável.

### 2. O ENS160 não mede CO₂

Verificado contra o datasheet primário (ENS160 v1.3, SC-001224-DS-9) e o white paper da
ScioSense. O ENS160 é MOX, não NDIR. **CO₂ nem consta da lista de gases caracterizados**
(§6, Tabela 7: etanol, hidrogênio, acetona, monóxido de carbono, tolueno) — CO₂ é
quimicamente inerte na temperatura da placa, que é precisamente por que sensores NDIR existem.

O valor **eCO₂** é calculado a partir dos voláteis e do hidrogênio detectados (§16.2.10),
invertendo a lei de Pettenkofer, que correlaciona CO₂ exalado e voláteis **de metabolismo
humano**. A própria ScioSense escreve que leituras de CO₂ equivalente *"should not be confused
with CO₂ measurements."*

Três consequências para uma colmeia:

- **A faixa do eCO₂ começa em 400 ppm** — ele não consegue emitir abaixo disso, porque
  *assume* ar de fundo a 400 ppm. Numa colmeia o CO₂ real nunca chega perto desse valor.
- **CO₂ real de colmeia fica entre 3.300 e 17.700 ppm** (Seeley, ao longo de uma noite fria).
  O ENS160 não tem canal que responda a essa faixa.
- **Os dois podem andar em sentidos opostos.** Colônia perturbada libera feromônio de alarme
  (acetato de isopentila — éster de cadeia curta, exatamente a classe a que o MOX responde
  mais forte), então o eCO₂ sobe. Ao mesmo tempo as abelhas começam a ventilar, e o CO₂ real
  **cai**. Não é ruído: é anticorrelação.

Soma-se a **deriva de baseline**: o algoritmo do ENS160 presume ver ar limpo periodicamente e
re-ancora quando não vê. Uma colmeia é um vaso selado que as abelhas propolizam ativamente, e
ao longo de semanas o baseline se re-ancora no fundo crônico da própria colmeia — normalizando
embora exatamente o sinal de longo prazo que o projeto existe para detectar.

**Isto não invalida o sensor — muda o que ele é.** O ENS160 é um péssimo sensor de CO₂ e um
sensor de **odor de colmeia genuinamente interessante**. O app o trata assim: o canal se chama
**"Voláteis da colmeia (COVs)"**, o TVOC é o sinal primário, o eCO₂ fica arquivado sem nunca
ser exibido como CO₂, e toda análise é relativa ao histórico da própria colmeia.

**É por isso que pedimos as resistências brutas e os baselines das placas (pergunta 6).** A
razão `R_bruto / R_baseline` é muito mais portável entre sensores e ao longo do tempo do que
qualquer termo isolado, e está *acima* do baselining proprietário da ScioSense — ou seja, é
reproduzível e publicável. É o dado mais defensável que este hardware consegue entregar.

**Caminho de evolução, se as especialistas precisarem de CO₂ real:** o SCD41 (NDIR
fotoacústico) usa I²C 0x62, sem colisão com AHT21 nem ENS160, mede 0 a 40.000 ppm, e consome
cerca de 0,45 mA em modo single-shot a cada 5 minutos — aproximadamente 1/30 do consumo
contínuo do ENS160. Se energia era o motivo de não ter CO₂ real, essa comparação inverte o
argumento.

---

## Confirmações recebidas

Uma linha por resposta. Sem data e sem nome, a informação continua sendo suposição.

| # | Pergunta | Resposta | Confirmado por | Data |
|---|---|---|---|---|
| — | — | *(aguardando primeira resposta)* | — | — |

## Suposições em vigor

Enquanto não houver confirmação, o código assume o seguinte. **Cada item aqui é uma dívida.**

| Suposição | Onde impacta | Risco se estiver errada |
|---|---|---|
| Existe um contador monotônico por registro | chave primária `(node_id, seq)` | duplicação ou perda de linhas |
| O contador não reseta ao reiniciar | idempotência da ingestão | duplicatas silenciosas após reboot |
| O nó não apaga dados após leitura | estratégia de recuperação | perda real se o celular quebrar |
| A carga carrega versão de protocolo | decodificador versionado | não conseguimos evoluir o formato |
| Valores inválidos usam sentinela, não zero | marcação de qualidade | zeros entram na análise como medição |
| BLE é GATT (não Bluetooth Clássico) | viabilidade de iOS no futuro | iOS se torna impossível sem MFi |

/**
 * Textos do painel das pesquisadoras. pt-BR é o idioma-fonte (Princípio V: as
 * regras de idioma valem para todos os artefatos, inclusive o painel).
 *
 * Espelha a estrutura de `src/core/i18n` do app de campo, mas é um módulo
 * próprio: o painel é artefato separado e não importa nada de `src/`.
 *
 * Vocabulário (docs/glossario.md): "painel", nunca a palavra inglesa; "planilha",
 * nunca a sigla do formato; "pesquisadora"; "leitura" para a medição — e
 * "amostra excluída", termo da constituição e da spec para a leitura que o
 * sensor marcou inválida e que fica fora do agregado. O canal de gás é
 * "Voláteis (COVs)". eCO₂ só aparece dizendo que é estimado e que não é CO₂.
 *
 * Plural: pares `.um` / `.outros`, usados por `tp()`.
 */
export const ptBR = {
  /* ---------- Moldura ---------- */
  'app.nome': 'Painel Bee-sertão',
  'app.subtitulo': 'Painel das pesquisadoras',
  'nav.rotulo': 'Seções do painel',
  'nav.visao_geral': 'Visão geral',
  'nav.planilha': 'Planilha',
  'nav.sair': 'Sair',
  'nav.quem': 'Entrou como {email}',
  'demo.faixa.titulo': 'Dados de demonstração',
  'demo.faixa.texto':
    'Nada aqui veio de uma colmeia real: as colmeias, os apicultores e as leituras são inventados e gerados no próprio navegador.',

  /* ---------- Entrar ---------- */
  'entrar.titulo': 'Entrar no painel',
  'entrar.explicacao':
    'O acesso é criado pela coordenação do projeto. Não há cadastro aberto.',
  'entrar.email': 'E-mail',
  'entrar.senha': 'Senha',
  'entrar.botao': 'Entrar',
  'entrar.entrando': 'Entrando…',
  'entrar.demo.titulo': 'Dados de demonstração',
  'entrar.demo.explicacao':
    'Este painel ainda não está ligado ao servidor do projeto. Você vai ver colmeias, apicultores e leituras inventados, gerados no navegador, só para conhecer as telas. Não use estes números em análise.',
  'entrar.demo.botao': 'Entrar com dados de demonstração',
  'entrar.problema.credenciais':
    'E-mail ou senha não conferem. Confira o que digitou e tente de novo. Se esqueceu a senha, fale com a coordenação do projeto.',
  'entrar.problema.vazio': 'Preencha o e-mail e a senha para entrar.',

  /* ---------- Rede e servidor ---------- */
  'rede.sem_internet.titulo': 'Sem internet agora',
  'rede.sem_internet.texto':
    'O painel precisa de internet para buscar os dados no servidor. Nada foi perdido. Confira a conexão e clique em Tentar de novo.',
  'rede.servidor.titulo': 'O servidor não respondeu como esperado',
  'rede.servidor.texto':
    'Nada foi perdido. Tente de novo em alguns minutos. Se continuar, avise a coordenação do projeto.',
  'rede.tentar_de_novo': 'Tentar de novo',
  'carregando': 'Buscando os dados…',
  'config.insegura.titulo': 'O painel não pode se ligar a este servidor',
  'config.insegura.texto':
    'O endereço do servidor configurado neste painel não usa conexão segura. Nada foi buscado. Avise a coordenação do projeto para corrigir a configuração.',
  'data.utc': '{quando} (UTC)',

  /* ---------- Visão geral ---------- */
  'visao.titulo': 'Visão geral',
  'visao.explicacao':
    'Uma linha por colmeia, de todos os apicultores do projeto. Os voláteis não aparecem aqui de propósito: o valor de uma colmeia só se compara com o histórico dela mesma.',
  'visao.busca.rotulo': 'Procurar por apicultor',
  'visao.busca.dica': 'Digite parte do nome',
  'visao.busca.limpar': 'Limpar busca',
  'visao.contagem.um': '{n} colmeia',
  'visao.contagem.outros': '{n} colmeias',
  'visao.vazio': 'Nenhum apicultor com esse nome. Confira a grafia ou limpe a busca.',
  'visao.sem_colmeias':
    'Ainda não há colmeias neste projeto. Elas aparecem aqui depois que o apicultor liga o celular ao projeto e envia as primeiras leituras.',
  'visao.col.apicultor': 'Apicultor',
  'visao.col.colmeia': 'Colmeia',
  'visao.col.local': 'Apiário ou meliponário',
  'visao.col.municipio': 'Município',
  'visao.col.ultima_leitura': 'Última leitura',
  'visao.col.leituras': 'Leituras',
  'visao.col.excluidas': 'Amostras excluídas',
  'visao.municipio': '{municipio} ({uf})',
  'visao.sem_municipio': 'Município não informado',

  'criacao.apis': 'Apis mellifera',
  'criacao.meliponineo': 'Meliponíneo (sem ferrão)',
  'criacao.desconhecida': 'Criação não informada',

  /* ---------- Frescor (idade do dado em palavras) ---------- */
  'frescor.nunca': 'Sem leitura ainda',
  'frescor.hoje': 'Hoje',
  'frescor.ontem': 'Ontem',
  'frescor.dias': 'Há {n} dias',
  'frescor.semanas.um': 'Há {n} semana',
  'frescor.semanas.outros': 'Há {n} semanas',
  'frescor.meses.um': 'Há {n} mês',
  'frescor.meses.outros': 'Há {n} meses',

  /* ---------- Colmeia ---------- */
  'colmeia.voltar': 'Voltar para a visão geral',
  'colmeia.nao_encontrada':
    'Esta colmeia não está no projeto ou você não tem acesso a ela. Volte para a visão geral e escolha outra.',
  'colmeia.de': '{local} · {apicultor} · {municipio}',
  'colmeia.ultima_leitura': 'Última leitura: {quando}',
  'colmeia.periodo': 'Período',
  'colmeia.periodo.7': '7 dias até a última leitura',
  'colmeia.periodo.30': '30 dias até a última leitura',
  'colmeia.periodo.livre': 'Escolher datas',
  'colmeia.periodo.inicio': 'De',
  'colmeia.periodo.fim': 'Até',
  'colmeia.periodo.mostrando': 'Mostrando de {de} a {ate}. Cada dia vai de 0h a 24h em UTC, ou seja, das 21h da véspera às 21h no horário de Brasília.',
  'colmeia.periodo.invalido':
    'A data inicial precisa ser uma data válida e vir antes da final. Ajuste as datas.',
  'colmeia.periodo.longo':
    'O período passa de {n} dias. Escolha um período menor para o gráfico continuar legível.',
  'colmeia.periodo.sem_leitura':
    'Esta colmeia ainda não tem leitura no servidor. Escolha datas para conferir um período, ou volte depois do próximo envio do apicultor.',
  'colmeia.sem_dados':
    'Nenhuma leitura válida neste período. Escolha um período maior ou outras datas.',
  'colmeia.lacunas.um':
    '{n} dia sem leitura válida neste período. Nos gráficos, ele aparece como um vão na linha: os pontos vizinhos não são ligados.',
  'colmeia.lacunas.outros':
    '{n} dias sem leitura válida neste período. Nos gráficos, eles aparecem como vãos na linha: os pontos vizinhos não são ligados.',
  'colmeia.troca_sensor':
    'Troca de sensor em {data}: as linhas dos gráficos são interrompidas nesse dia, e nenhum resumo junta dados de antes e de depois da troca.',
  'colmeia.baixar_planilha': 'Montar planilha deste período',

  'colmeia.trilha.epoca': 'Época {epoca} do sensor',
  'colmeia.trilha.no_epoca': 'Nó sensor {no}, época {epoca}',

  'colmeia.resumo.titulo': 'Resumo do período',
  'colmeia.resumo.explicacao':
    'Uma linha por época do sensor. Época do sensor é um trecho contínuo da série: uma troca de sensor começa uma época nova. Nenhum número aqui mistura duas épocas. A temperatura já tem a correção do nó sensor aplicada. Amostra excluída é a leitura em que o sensor de gás marcou o próprio valor como inválido: ela fica fora dos voláteis, mas a temperatura e a umidade dela entram. Se todas as amostras de um dia foram excluídas, o dia fica sem resumo: aparece como dia sem leitura válida e não entra nesta contagem. A planilha traz todas as leituras, com as excluídas marcadas.',
  'colmeia.resumo.trilha': 'Época',
  'colmeia.resumo.dias': 'Dias com leitura',
  'colmeia.resumo.temp': 'Temperatura: menor e maior do período',
  'colmeia.resumo.umid': 'Umidade: menor e maior média diária',
  'colmeia.resumo.validas': 'Leituras válidas',
  'colmeia.resumo.excluidas': 'Amostras excluídas',
  'colmeia.resumo.faixa': '{min} a {max}',

  'colmeia.dia.titulo': 'Dia {data} (UTC)',
  'colmeia.dia.dica': 'Passe o cursor sobre um gráfico para ver os números de um dia.',
  'colmeia.dia.sem_dado': 'Sem leitura válida neste dia.',
  'colmeia.dia.temp': 'Temperatura média {media} (menor {min}, maior {max})',
  'colmeia.dia.temp_corrigida':
    'Temperatura corrigida média {media} (menor {min}, maior {max})',
  'colmeia.dia.umid': 'Umidade média {umid}',
  'colmeia.dia.validas.um': '{n} leitura válida',
  'colmeia.dia.validas.outros': '{n} leituras válidas',
  'colmeia.dia.excluidas.um': '{n} amostra excluída',
  'colmeia.dia.excluidas.outros': '{n} amostras excluídas',

  /* ---------- Gráficos ---------- */
  'grafico.dia': 'Dia (UTC)',
  'grafico.temp.titulo': 'Temperatura dentro da colmeia (°C)',
  'grafico.temp.media': 'Média do dia',
  'grafico.temp.menor': 'Menor do dia',
  'grafico.temp.maior': 'Maior do dia',
  'grafico.temp.correcao':
    'Temperatura corrigida: a correção do nó sensor já está somada ({correcoes}). A planilha traz o valor bruto e a correção em colunas separadas.',
  'grafico.temp.correcao_item': '{no}: {valor} °C',
  'grafico.umid.titulo': 'Umidade dentro da colmeia (%)',
  'grafico.umid.media': 'Média do dia',
  'grafico.vol.titulo': 'Voláteis da colmeia (COVs)',
  'grafico.vol.subtitulo':
    'Assinatura de odor do ninho: cera, própolis, mel e feromônios. Não é CO₂. Mostrado como índice desta colmeia: 100 é a mediana dela nesta época do sensor, dentro do período escolhido. Serve para ver mudanças nesta colmeia, não para comparar colmeias.',
  'grafico.vol.indice': 'Índice de voláteis',
  'grafico.vol.sem_base':
    '{trilha}: o índice de voláteis não aparece no gráfico, porque o período tem menos de {n} dias com voláteis válidos para calcular a linha de base. Escolha um período maior.',
  'grafico.legenda.lacuna':
    'Vão na linha = dia sem leitura válida ou troca de sensor. Linha contínua = média; linhas tracejadas = menor e maior do dia.',

  /* ---------- Qualidade da hora (feature 003) ---------- */
  'hora.ancorada': 'ancorada',
  'hora.estimada': 'estimada',
  'hora.desconhecida': 'desconhecida',

  /* ---------- Planilha (tela) ---------- */
  'planilha.titulo': 'Baixar planilha',
  'planilha.explicacao':
    'Escolha as colmeias e o período. A planilha abre direto num programa de planilhas configurado para português do Brasil: as colunas são separadas por ponto e vírgula, e os decimais usam vírgula.',
  'planilha.colmeias': 'Colmeias',
  'planilha.filtro': 'Procurar por apicultor',
  'planilha.marcar_todas': 'Marcar todas as mostradas',
  'planilha.desmarcar_todas': 'Desmarcar todas',
  'planilha.marcadas.um': '{n} colmeia marcada',
  'planilha.marcadas.outros': '{n} colmeias marcadas',
  'planilha.periodo': 'Período (dias em UTC)',
  'planilha.botao': 'Baixar planilha',
  'planilha.montando': 'Montando a planilha…',
  'planilha.nenhuma': 'Marque pelo menos uma colmeia.',
  'planilha.pronta.um': 'Planilha pronta: {n} leitura. O navegador já está baixando o arquivo.',
  'planilha.pronta.outros': 'Planilha pronta: {n} leituras. O navegador já está baixando o arquivo.',
  'planilha.grande':
    'O recorte passa de {limite} leituras e ficaria pesado demais para abrir. Escolha um período menor ou menos colmeias.',
  'planilha.vazia':
    'Não há leituras nas colmeias e no período escolhidos. Escolha outras datas ou outras colmeias.',
  'planilha.sobre':
    'No topo, a planilha diz de onde veio o dado: o nó sensor, a versão do formato de dados, quais grandezas são derivadas, quantas amostras foram excluídas, a qualidade da hora e a declaração de que coordenadas não são coletadas. Ela não traz o nome do apicultor.',
  'planilha.arquivo': 'bee-sertao-leituras-{de}-a-{ate}.csv',
  'planilha.sim': 'sim',
  'planilha.nao': 'não',

  /* ---------- Planilha (arquivo: cabeçalho de proveniência) ---------- */
  'planilha.cab.titulo': 'Bee-sertão: leituras de colmeias, painel das pesquisadoras',
  'planilha.cab.gerada_em': 'Gerada em',
  'planilha.cab.utc': '{quando} (UTC)',
  'planilha.cab.periodo': 'Período',
  'planilha.cab.periodo_valor': '{de} a {ate}, dias em UTC',
  'planilha.cab.colmeias': 'Colmeias',
  'planilha.cab.leituras': 'Leituras',
  'planilha.cab.excluidas': 'Amostras excluídas',
  'planilha.cab.excluidas_explicacao':
    'Leituras em que o sensor de gás marcou o próprio valor como inválido (coluna situacao_sensor_gas diferente de 0). Estão na planilha, com "sim" na coluna amostra_excluida, e ficam fora dos resumos diários de voláteis.',
  'planilha.cab.qualidade_hora': 'Qualidade da hora',
  'planilha.cab.derivadas': 'Grandezas derivadas',
  'planilha.cab.derivadas_eco2':
    'eCO₂ é estimado pelo próprio sensor de gás a partir dos voláteis (COVs). Não é CO₂ medido.',
  'planilha.cab.derivadas_hora':
    'A hora UTC de cada leitura é calculada a partir do contador do nó sensor e de uma hora de referência vinda do celular. Na coluna qualidade_hora: "ancorada" = calculada a partir de uma referência confiável; "estimada" = calculada sem referência confiável, pode ter desvio; "desconhecida" = não há como garantir a qualidade dessa hora. Leituras sem hora conhecida não entram nesta planilha, porque não há como saber em que dia caem.',
  'planilha.cab.volateis': 'Voláteis',
  'planilha.cab.volateis_texto':
    'O valor absoluto de voláteis não é comparável entre colmeias nem entre épocas do sensor. Compare cada colmeia com o histórico dela mesma, na mesma época.',
  'planilha.cab.valores': 'Valores',
  'planilha.cab.valores_texto':
    'Brutos, na resolução gravada, sem arredondar. A exatidão do sensor é menor: temperatura cerca de ±0,3 °C, umidade cerca de ±3 a 4 pontos percentuais. Temperatura corrigida = temperatura_bruta_c + correcao_temperatura_c.',
  'planilha.cab.numero_leitura':
    'A coluna numero_da_leitura identifica cada leitura dentro do nó sensor e serve para pôr as leituras em ordem. Um salto na numeração é normal e, sozinho, não quer dizer que uma leitura se perdeu. Além disso, as leituras sem hora conhecida ficam fora desta planilha e também deixam saltos.',
  'planilha.cab.aquecimento': 'Aquecimento pelo sensor de gás',
  'planilha.cab.aquecimento_texto':
    'Em placas que juntam os dois sensores, o sensor de gás pode aquecer o de temperatura em +4 a +6 °C. O desvio ainda não foi caracterizado neste projeto.',
  'planilha.cab.coordenadas': 'Coordenadas',
  'planilha.cab.coordenadas_texto':
    'Não são coletadas. Nem o celular nem o servidor guardam latitude ou longitude.',
  'planilha.cab.pessoas': 'Pessoas',
  'planilha.cab.pessoas_texto':
    'A planilha não traz o nome do apicultor. Os nomes de colmeia e de apiário ou meliponário vão como o apicultor digitou e podem conter nome de pessoa. Use o código da colmeia para cruzar com o painel.',
  'planilha.cab.sensor': 'Nó sensor',
  'planilha.cab.nao_informado': 'modelo do sensor não informado',
  'planilha.cab.formato': 'versão do formato de dados: {versoes}',
  'planilha.cab.correcao': 'correção de temperatura {valor} °C',

  /* ---------- Planilha (arquivo: nomes das colunas) ---------- */
  'planilha.col.codigo_colmeia': 'codigo_colmeia',
  'planilha.col.colmeia': 'colmeia',
  'planilha.col.local': 'apiario_ou_meliponario',
  'planilha.col.municipio': 'municipio',
  'planilha.col.uf': 'uf',
  'planilha.col.no_sensor': 'no_sensor',
  'planilha.col.seq': 'numero_da_leitura',
  'planilha.col.data_hora_utc': 'data_hora_utc',
  'planilha.col.qualidade_hora': 'qualidade_hora',
  'planilha.col.epoca_sensor': 'epoca_sensor',
  'planilha.col.versao_formato': 'versao_formato',
  'planilha.col.temperatura_bruta': 'temperatura_bruta_c',
  'planilha.col.correcao_temperatura': 'correcao_temperatura_c',
  'planilha.col.umidade_bruta': 'umidade_bruta_pct',
  'planilha.col.volateis': 'volateis_tvoc_ppb',
  'planilha.col.eco2': 'eco2_estimado_ppm_nao_e_co2',
  'planilha.col.situacao_gas': 'situacao_sensor_gas',
  'planilha.col.amostra_excluida': 'amostra_excluida',
} as const;

export type ChaveTexto = keyof typeof ptBR;

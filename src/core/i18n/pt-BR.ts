/**
 * Textos do aplicativo. pt-BR é o idioma-fonte (Princípio V).
 *
 * Regras de redação, herdadas de docs/glossario.md:
 *  - toda mensagem de problema diz o que aconteceu E o que fazer em seguida;
 *  - nunca código de erro, nome de exceção ou texto em inglês;
 *  - só afirmamos o que é verdade DO NOSSO LADO ("nada que já estava no celular
 *    foi apagado"). O que o nó sensor guarda é suposição até o grupo do firmware
 *    confirmar (docs/integracao-firmware.md, pergunta 7), então nenhuma mensagem
 *    promete que "a colmeia ainda tem tudo".
 *
 * Plural: pares `.um` / `.outros`, usados por `tp()`. Um teste garante que todo
 * `.um` tem o seu `.outros`.
 *
 * Todas as telas de src/app e os componentes de src/ui já tiram o texto daqui
 * (tests/telas.test.ts reprova texto literal visível em componente). As
 * palavras de src/core/format (frescor, bateria, nível de coleta) também moram
 * aqui; lá ficam só as unidades (°C, %, ppb).
 */
export const ptBR = {
  /* ---------- Coletar: tela ---------- */
  'coleta.ocioso.titulo': 'Chegue perto da colmeia e toque em Coletar',
  'coleta.manter_tela': 'Mantenha a tela ligada até terminar.',
  'coleta.procurando': 'Procurando colmeias…',
  'coleta.transferindo.titulo': 'Coletando da {nome}',
  'coleta.transferindo.progresso': 'Leituras: {recebidas} de {total}',

  'coleta.botao.coletar': 'Coletar',
  'coleta.botao.coletar_de_novo': 'Coletar de novo',
  'coleta.botao.tentar_de_novo': 'Tentar de novo',
  'coleta.botao.ver_colmeias': 'Ver colmeias',
  'coleta.botao.diagnostico': 'Abrir diagnóstico',

  /* ---------- Coletar: resultado sem problema ---------- */
  'coleta.sucesso.nada_novo.titulo': 'Já estava tudo salvo',
  'coleta.sucesso.nada_novo.conferidas.um':
    'Conferi 1 leitura e ela já estava no celular. Nada ficou repetido.',
  'coleta.sucesso.nada_novo.conferidas.outros':
    'Conferi {n} leituras e todas já estavam no celular. Nada ficou repetido.',
  'coleta.sucesso.nada_novo.vazio': 'Nenhuma leitura nova desde a última coleta.',
  'coleta.sucesso.salvas.um': '{n} leitura salva',
  'coleta.sucesso.salvas.outros': '{n} leituras salvas',
  'coleta.sucesso.repetidas.um': '{n} já estava salva. Nada ficou repetido.',
  'coleta.sucesso.repetidas.outros': '{n} já estavam salvas. Nada ficou repetido.',
  'coleta.sucesso.dias.um': 'São leituras de mais ou menos {n} dia.',
  'coleta.sucesso.dias.outros': 'São leituras de mais ou menos {n} dias.',
  'coleta.sucesso.envio': 'Salvo no celular. Vai enviar quando tiver internet.',

  'coleta.relogio.acertado.um': 'Relógio do nó sensor acertado.',
  'coleta.relogio.acertado.outros': 'Relógios dos nós sensores acertados em {n} colmeias.',

  /* ---------- Coletar: resultado com problema ---------- */
  'coleta.resumo.com_problemas': 'A coleta terminou com problemas',
  'coleta.resumo.nao_coletou': 'Não consegui coletar',
  'coleta.resumo.ficaram_salvas.um': '{n} leitura ficou salva no celular.',
  'coleta.resumo.ficaram_salvas.outros': '{n} leituras ficaram salvas no celular.',
  // Quando a gravação final falhou, não dá para afirmar que algo ficou salvo.
  'coleta.resumo.talvez_nao_gravou':
    'Talvez as leituras desta coleta não tenham ficado salvas no celular. Não feche o aplicativo. Toque em Tentar de novo.',
  'coleta.rotulo.problema': 'Problema',
  'coleta.rotulo.aviso': 'Aviso',

  // Frase que abre o detalhe. Só afirma o que é verdade do nosso lado.
  'coleta.problema.nada_apagado': 'Nada que já estava no celular foi apagado.',
  'coleta.problema.salvas_antes.um':
    'A leitura que já tinha chegado ficou salva no celular.',
  'coleta.problema.salvas_antes.outros':
    'As {n} leituras que já tinham chegado ficaram salvas no celular.',

  'coleta.problema.nenhuma_colmeia.titulo': 'Não achei nenhuma colmeia',
  'coleta.problema.nenhuma_colmeia.detalhe':
    'Nenhum nó sensor respondeu. Chegue mais perto da colmeia e confira se o Bluetooth do celular está ligado.',

  'coleta.problema.transporte.titulo': 'Não consegui falar com os nós sensores',
  'coleta.problema.transporte.detalhe':
    'O Bluetooth ou o cabo não está pronto. Toque em Abrir diagnóstico para ver o que falta ligar.',

  'coleta.problema.nao_conectou.titulo': 'Não consegui falar com a {nome}',
  'coleta.problema.nao_conectou.detalhe':
    'Ela pode estar longe, ou o nó sensor pode estar dormindo. Chegue mais perto e tente de novo.',

  'coleta.problema.conexao_caiu.titulo': 'A conexão com a {nome} caiu no meio',
  'coleta.problema.conexao_caiu.detalhe':
    'Toque em Tentar de novo para continuar de onde parou.',

  'coleta.problema.formato.titulo':
    'A {nome} mandou as leituras de um jeito que o aplicativo ainda não entende',
  'coleta.problema.formato.detalhe':
    'Atualize o aplicativo e colete de novo. Se continuar assim, avise a pesquisadora.',

  'coleta.problema.corrompidos.titulo': 'As leituras da {nome} chegaram com defeito',
  'coleta.problema.corrompidos.detalhe':
    'Deixei de fora o pedaço com defeito, para não misturar leitura errada com as suas. Chegue mais perto e toque em Tentar de novo.',

  'coleta.problema.nao_salvou.titulo': 'Não consegui salvar as leituras da {nome} no celular',
  'coleta.problema.nao_salvou.detalhe':
    'Pode estar faltando espaço no celular. Apague fotos, vídeos ou aplicativos que você não usa e toque em Tentar de novo.',

  'coleta.problema.inesperado.titulo': 'Algo inesperado aconteceu na coleta da {nome}',
  'coleta.problema.inesperado.detalhe':
    'Toque em Tentar de novo. Se acontecer outra vez, avise a pesquisadora.',

  // Problemas que não são de uma colmeia específica.
  'coleta.problema.geral.nao_salvou.titulo': 'Não consegui salvar as leituras no celular',
  'coleta.problema.geral.inesperado.titulo': 'Algo inesperado aconteceu na coleta',

  /* ---------- Avisos: a coleta funcionou, mas há o que saber ---------- */
  'coleta.aviso.relogio_falhou.titulo': 'Não consegui acertar o relógio do nó sensor da {nome}',
  'coleta.aviso.relogio_falhou.detalhe':
    'A coleta funcionou normalmente. A hora das leituras foi calculada pelo celular.',
  'coleta.aviso.relogio_celular.titulo': 'A data ou a hora do celular parece errada',
  'coleta.aviso.relogio_celular.detalhe':
    'Por isso, não acertei o relógio do nó sensor. As horas desta coleta ficaram marcadas como estimadas. Confira a data e a hora nas Configurações do celular.',
  'coleta.aviso.sensor_desconhecido.titulo.um':
    'Achei um nó sensor que o aplicativo ainda não conhece',
  'coleta.aviso.sensor_desconhecido.titulo.outros':
    'Achei {n} nós sensores que o aplicativo ainda não conhece',
  'coleta.aviso.sensor_desconhecido.detalhe.um':
    'Não coletei as leituras dele. Ainda não dá para cadastrar colmeia nova pelo aplicativo. Avise a pesquisadora.',
  'coleta.aviso.sensor_desconhecido.detalhe.outros':
    'Não coletei as leituras deles. Ainda não dá para cadastrar colmeia nova pelo aplicativo. Avise a pesquisadora.',

  /* ---------- Lista de colmeias ---------- */
  'colmeias.cartao.coleta_incompleta': 'Última coleta incompleta',

  /* ---------- Ajustes: demonstração ---------- */
  'ajustes.demo.titulo': 'Demonstração: simular um problema',
  'ajustes.demo.ajuda':
    'Só aparece enquanto o aplicativo usa nós sensores simulados. Escolha um problema e toque em Coletar para ver como o aviso aparece.',
  'ajustes.demo.opcao.nenhuma': 'Nenhum problema (normal)',
  'ajustes.demo.opcao.queda': 'A conexão cai no meio da coleta',
  'ajustes.demo.opcao.corrompido': 'As leituras chegam com defeito',
  'ajustes.demo.opcao.formato': 'O nó sensor manda as leituras de um jeito novo',
  'ajustes.demo.opcao.sem_colmeias': 'Nenhuma colmeia por perto',
  'ajustes.demo.opcao.sensor_novo': 'Um nó sensor que o aplicativo não conhece',
  'ajustes.demo.opcao.relogio_recusado': 'O nó sensor não deixa acertar o relógio',

  /* ==========================================================
   * Frente 003 — hora das leituras (specs/003-hora-das-leituras)
   * ========================================================== */

  /* Pergunta de conflito de data, na tela de resultado da coleta (FR-011). */
  'hora.conflito.rotulo': 'Confira',
  'hora.conflito.titulo': 'A data do celular está certa?',
  'hora.conflito.detalhe.um':
    'A hora do celular não combina com o tempo que o nó sensor da {nomes} contou desde a última coleta.',
  'hora.conflito.detalhe.outros':
    'A hora do celular não combina com o tempo que os nós sensores de {nomes} contaram desde a última coleta.',
  'hora.conflito.nao_acertei.um': 'Por isso não acertei o relógio dela.',
  'hora.conflito.nao_acertei.outros': 'Por isso não acertei o relógio delas.',
  // Junta nomes: "Colmeia 07, Colmeia 03 e Colmeia 11".
  'hora.lista.e': '{inicio} e {ultimo}',
  'hora.conflito.celular_mostra': 'Este celular está marcando:',
  'hora.conflito.pergunta': 'Esta data e esta hora estão certas?',
  'hora.conflito.sim': 'Sim, estão certas',
  'hora.conflito.nao': 'Não, estão erradas',
  'hora.conflito.respondendo': 'Acertando o relógio…',
  'hora.conflito.guardando': 'Guardando a resposta…',
  'hora.conflito.sim.feito': 'Combinado: vale a data deste celular.',
  'hora.conflito.sim.acertado.um': 'Relógio do nó sensor acertado.',
  'hora.conflito.sim.acertado.outros': 'Relógios dos nós sensores acertados em {n} colmeias.',
  'hora.conflito.sim.depois':
    'Faltou acertar o relógio de alguma colmeia. Vou tentar de novo na próxima coleta.',
  'hora.conflito.nao.feito':
    'Acerte a data e a hora nas Configurações do celular. Depois toque em Coletar de novo.',
  'hora.conflito.nao_gravou':
    'Não consegui guardar a resposta no celular. Toque de novo na resposta.',
  // Data e hora em destaque: "21/10/2026, 14:05".
  'hora.data_hora': '{data}, {hora}',

  /* Detalhe da colmeia: leituras sem hora ficam fora do gráfico, contadas (FR-017). */
  'hora.sem_hora.um': '1 leitura está sem hora conhecida e ficou fora do gráfico e das médias.',
  'hora.sem_hora.outros':
    '{n} leituras estão sem hora conhecida e ficaram fora do gráfico e das médias.',

  /* Qualidade da hora em palavra, para planilha e painel (FR-018). */
  'hora.qualidade.ancorada': 'ancorada',
  'hora.qualidade.estimada': 'estimada',
  'hora.qualidade.desconhecida': 'desconhecida',

  /* Ajustes: demonstração. */
  'ajustes.demo.opcao.perdeu_energia': 'O nó sensor ficou sem energia ontem e religou',
  'ajustes.demo.opcao.sem_nocao_de_tempo': 'O nó sensor não sabe contar o tempo',
  'ajustes.demo.opcao.celular_adiantado': 'A data do celular está um ano adiantada',

  /* ==========================================================================
   * Frente: dívidas de tela (fix/001-dividas-de-tela, 2026-10)
   * Textos que viviam dentro dos componentes de src/app e src/ui.
   * ======================================================================== */

  /* ---------- Navegação ---------- */
  'abas.colmeias': 'Colmeias',
  'abas.coletar': 'Coletar',
  'abas.enviar': 'Enviar',
  'abas.ajustes': 'Ajustes',
  'titulo.diagnostico': 'Diagnóstico de conexão',
  'titulo.colmeia': 'Colmeia',

  /* ---------- Abertura do banco ---------- */
  'banco.abrindo': 'Preparando o aplicativo…',
  'banco.nao_abriu.titulo': 'Não consegui abrir as leituras salvas no celular',
  'banco.nao_abriu.detalhe':
    'Feche o aplicativo e abra de novo. Se continuar assim, avise a pesquisadora.',

  /* ---------- Grandezas (mesma ordem e nome em toda tela) ---------- */
  'grandeza.temperatura': 'Temperatura',
  'grandeza.umidade': 'Umidade',
  'grandeza.volateis': 'Voláteis (COVs)',
  'grandeza.volateis_curto': 'Voláteis',
  'grandeza.bateria': 'Bateria',
  // Grandeza sem valor: palavra, não traço, para o leitor de tela dizer algo.
  'grandeza.sem_valor': 'Sem medição',

  /* ---------- Palavras de src/core/format ---------- */
  // Bateria em três estados, nunca porcentagem (FR-022).
  'bateria.boa': 'Boa',
  'bateria.trocar_em_breve': 'Trocar em breve',
  'bateria.trocar_agora': 'Trocar agora',
  'bateria.nao_informada': 'Não informada',
  // Urgência da próxima coleta: a palavra acompanha a cor (Princípio V).
  'coleta.nivel.sem_coleta': 'Sem coleta',
  'coleta.nivel.em_dia': 'Em dia',
  'coleta.nivel.em_breve': 'Coleta em breve',
  'coleta.nivel.atrasada': 'Coleta atrasada',
  'coleta.nivel.muito_atrasada': 'Coleta muito atrasada',
  // Frescor: palavras inteiras, sem abreviar ("min", "h") para o leitor de tela.
  'frescor.sem_leitura': 'Sem leitura ainda',
  'frescor.agora': 'Agora há pouco',
  'frescor.minutos.um': 'Há {n} minuto',
  'frescor.minutos.outros': 'Há {n} minutos',
  'frescor.horas.um': 'Há {n} hora',
  'frescor.horas.outros': 'Há {n} horas',
  'frescor.dias.um': 'Há {n} dia',
  'frescor.dias.outros': 'Há {n} dias',
  'frescor.semanas.um': 'Há {n} semana',
  'frescor.semanas.outros': 'Há {n} semanas',
  'frescor.meses.um': 'Há {n} mês',
  'frescor.meses.outros': 'Há {n} meses',

  /* ---------- Coletar: retorno e acessibilidade ---------- */
  'coleta.demo.ativa': 'Simulação ligada: {rotulo}. Mude em Ajustes.',
  'coleta.progresso.rotulo': 'Progresso da coleta',
  'coleta.bloco.rotulo_acessivel': '{rotulo}. {titulo}. {detalhe}',

  /* ---------- Lista de colmeias ---------- */
  'colmeias.total.um': '{n} colmeia',
  'colmeias.total.outros': '{n} colmeias',
  'colmeias.sem_coleta.um': '{n} ainda sem coleta',
  'colmeias.sem_coleta.outros': '{n} ainda sem coleta',
  'colmeias.para_enviar.um': '{n} leitura para enviar',
  'colmeias.para_enviar.outros': '{n} leituras para enviar',
  'colmeias.sol.alternar': 'Modo sol',
  'colmeias.sol.ligado': 'Modo sol ligado',
  'colmeias.sol.desligado': 'Modo sol',
  'colmeias.atraso.titulo.um': 'Uma colmeia está com a coleta atrasada',
  'colmeias.atraso.titulo.outros': '{n} colmeias estão com a coleta atrasada',
  'colmeias.atraso.intervalo.um': 'Você escolheu coletar a cada {n} dia.',
  'colmeias.atraso.intervalo.outros': 'Você escolheu coletar a cada {n} dias.',
  'colmeias.atraso.pior.um': 'A mais atrasada está há {n} dia sem coleta.',
  'colmeias.atraso.pior.outros': 'A mais atrasada está há {n} dias sem coleta.',
  'colmeias.cartao.sem_leitura': 'Sem leitura ainda — toque em Coletar',
  'colmeias.cartao.no_celular': 'No celular',
  'colmeias.cartao.na_nuvem': 'Na nuvem',
  'colmeias.cartao.bateria': 'Bateria: {estado}',

  /* ---------- Detalhe da colmeia ---------- */
  'colmeia.nao_encontrada': 'Não achei esta colmeia. Volte para a lista de colmeias.',
  'colmeia.leituras_antigas':
    'Estas leituras são antigas. Colete de novo para ver a situação atual.',
  'colmeia.pendentes.um': '{n} leitura salva no celular, ainda não enviada',
  'colmeia.pendentes.outros': '{n} leituras salvas no celular, ainda não enviadas',
  'colmeia.tudo_salvo': 'Tudo enviado e salvo na nuvem',
  'colmeia.sem_leitura': 'Sem leitura ainda. Toque em Coletar, no menu de baixo.',
  'colmeia.volateis.titulo': 'Sobre os voláteis (COVs)',
  'colmeia.volateis.texto':
    'Assinatura de odor do ninho — cera, própolis, mel e feromônios.',
  // Única menção permitida a CO₂: dizer que NÃO é (Princípio VI).
  'colmeia.volateis.nao_e': 'Não é CO₂.',
  'colmeia.volateis.uso':
    'Serve para acompanhar mudanças nesta colmeia ao longo do tempo, não para comparar colmeias.',
  'colmeia.janela.um': '{n} dia',
  'colmeia.janela.outros': '{n} dias',
  'colmeia.grafico.dias.um':
    '{n} dia com leitura. Onde não há leitura boa, a linha fica cortada. O aplicativo não inventa o que não foi medido.',
  'colmeia.grafico.dias.outros':
    '{n} dias com leitura. Onde não há leitura boa, a linha fica cortada. O aplicativo não inventa o que não foi medido.',
  'colmeia.grafico.excluidas.um':
    '{n} leitura ficou fora da média dos voláteis porque o sensor de gás ainda estava se preparando ou deu uma leitura que não serve.',
  'colmeia.grafico.excluidas.outros':
    '{n} leituras ficaram fora da média dos voláteis porque o sensor de gás ainda estava se preparando ou deu uma leitura que não serve.',

  /* ---------- Gráfico ---------- */
  'grafico.sem_leitura': 'Ainda não há leitura suficiente para o gráfico',
  'grafico.legenda.mediana': 'valor típico do dia',
  'grafico.legenda.faixa': 'faixa do dia (quase todas as leituras)',

  /* ---------- Ajustes ---------- */
  'ajustes.intervalo.titulo': 'De quanto em quanto tempo você quer coletar?',
  'ajustes.intervalo.ajuda':
    'O aplicativo avisa na tela de colmeias quando passar desse tempo. Ele não manda notificação: o aviso aparece quando você abrir o aplicativo.',
  'ajustes.intervalo.opcao.um': '{n} dia',
  'ajustes.intervalo.opcao.outros': '{n} dias',
  'ajustes.intervalo.escolhido.um': 'Escolhido: a cada {n} dia.',
  'ajustes.intervalo.escolhido.outros': 'Escolhido: a cada {n} dias.',
  'ajustes.sol.titulo': 'Modo sol',
  'ajustes.sol.ajuda':
    'Aumenta as letras e engrossa as bordas. Assim dá para ler a tela no sol forte, perto das colmeias.',
  'ajustes.sol.ligado': 'Desligar modo sol',
  'ajustes.sol.ligar': 'Ligar modo sol',
  'ajustes.diagnostico.titulo': 'Problema para achar a colmeia?',
  'ajustes.diagnostico.ajuda':
    'A tela de diagnóstico confere, item a item, o que precisa estar ligado no celular para o aplicativo enxergar o nó sensor.',

  /* ---------- Diagnóstico ---------- */
  'diagnostico.intro':
    'Verificação do que precisa estar ligado para o aplicativo encontrar uma colmeia.',
  'diagnostico.item.ok': 'Pronto',
  'diagnostico.item.pendente': 'Precisa de atenção',
  'diagnostico.item.rotulo_acessivel': '{estado}. {rotulo}',
  'diagnostico.item.rotulo_acessivel_dica': '{estado}. {rotulo}. {dica}',
  'diagnostico.nesta_versao.titulo': 'Nesta versão',
  'diagnostico.nesta_versao.texto':
    'O aplicativo usa nós sensores simulados. Não precisa de nó sensor de verdade nem de Bluetooth. No computador, já dá para ver as leituras ao vivo pelo cabo (veja abaixo). A coleta pelo cabo e pelo Bluetooth ainda vai chegar. Quando chegar, esta tela vai mostrar se o Bluetooth e a Localização estão ligados.',
  'diagnostico.nao_verificou.titulo': 'Não consegui fazer a verificação agora',
  'diagnostico.nao_verificou.detalhe':
    'Toque em Verificar de novo. Se continuar assim, feche o aplicativo, abra de novo e avise a pesquisadora.',
  'diagnostico.verificando': 'Verificando…',
  'diagnostico.verificar_de_novo': 'Verificar de novo',
  'diagnostico.preflight.simulado': 'Modo de demonstração ligado',
  'diagnostico.preflight.simulado.dica': 'Nesta versão, a tela Coletar usa nós sensores de exemplo, com leituras inventadas. Não precisa de nó sensor de verdade.',
  'diagnostico.preflight.armazenamento': 'Espaço livre no celular',

  /* ==================================================================== */
  /* Frente: servidor e envio real (feature 002, Fatia 1).                */
  /* Telas Enviar e Ligar o celular ao projeto. Vocabulário do glossário: */
  /* "código do projeto", "ligar o celular ao projeto"; nunca "login",    */
  /* "senha" nem "token".                                                 */
  /* ==================================================================== */

  /* ---------- Enviar ---------- */
  'envio.estado.celular': 'Salvo no celular',
  'envio.estado.nuvem': 'Salvo na nuvem',
  'envio.pendentes.um': '{n} leitura ainda não enviada.',
  'envio.pendentes.outros': '{n} leituras ainda não enviadas.',
  'envio.pendentes.mais_antiga': 'A mais antiga é de {data}.',
  'envio.tudo_enviado': 'Tudo que está no celular já foi enviado.',
  'envio.nada_para_enviar': 'Ainda não há leitura para enviar. Faça uma coleta primeiro.',
  'envio.progresso': 'Enviando… {feitas} de {total} leituras',
  'envio.concluido.um': '{n} leitura enviada',
  'envio.concluido.outros': '{n} leituras enviadas',
  'envio.botao.enviar': 'Enviar agora',
  'envio.botao.enviando': 'Enviando…',
  'envio.garantia.titulo': 'Suas leituras ficam guardadas no celular',
  'envio.garantia.texto':
    'Elas ficam no celular antes e depois do envio. O aplicativo nunca apaga uma leitura. Só não apague o aplicativo antes de enviar, porque as leituras iriam junto.',

  'envio.vinculo.ligado.titulo': 'Celular ligado ao projeto',
  'envio.vinculo.ligado.texto': '{apicultor}, no projeto {projeto}',
  'envio.vinculo.pedir.titulo': 'Ligar o celular ao projeto',
  'envio.vinculo.pedir.texto':
    'Para enviar, digite uma vez o código do projeto que a pesquisadora passou. Coletar nunca precisa de código.',
  'envio.vinculo.pedir.botao': 'Digitar o código',

  /* Por que o envio parou. Título diz o que aconteceu; texto, o que fazer. */
  'envio.parada.sem_rede.titulo': 'Sem internet agora',
  'envio.parada.sem_rede.texto':
    'Nada se perdeu: as leituras continuam salvas no celular. Quando tiver sinal, toque em Enviar agora. Se o Wi-Fi pedir cadastro, abra o navegador primeiro.',
  'envio.parada.portal_cativo.titulo': 'Esta rede pede cadastro no navegador',
  'envio.parada.portal_cativo.texto':
    'Abra o navegador de internet (o Chrome, por exemplo) e faça o cadastro que aparecer. Depois toque em Enviar agora. Nada se perdeu.',
  'envio.parada.sem_vinculo.titulo': 'Este celular ainda não está ligado ao projeto',
  'envio.parada.sem_vinculo.texto': 'Toque em Digitar o código. É uma vez só.',
  'envio.parada.codigo_invalido.titulo': 'Esse código não confere',
  'envio.parada.codigo_invalido.texto':
    'Confira letra por letra com a pesquisadora e digite de novo.',
  'envio.parada.muitas_tentativas.titulo': 'Muitas tentativas seguidas',
  'envio.parada.muitas_tentativas.texto':
    'Confira o código com a pesquisadora. Depois, espere uma hora e tente de novo.',
  'envio.parada.codigo_travado.titulo': 'Tentativas demais neste celular',
  'envio.parada.codigo_travado.texto':
    'Espere até amanhã para tentar de novo, ou peça ajuda à pesquisadora.',
  'envio.parada.servidor.titulo': 'A nuvem do projeto não respondeu',
  'envio.parada.servidor.texto': 'Nada se perdeu: as leituras continuam no celular. Daqui a pouco, toque em Enviar agora de novo.',
  'envio.parada.recusado.titulo': 'A nuvem do projeto não aceitou o envio',
  'envio.parada.recusado.texto': 'As leituras continuam salvas no celular. Avise a pesquisadora.',
  'envio.parada.tempo_esgotado.titulo': 'O envio parou antes de terminar',
  'envio.parada.tempo_esgotado.texto':
    'A internet ficou fraca ou caiu. O que já foi enviado está salvo na nuvem. Toque em Enviar agora para continuar.',

  /* ---------- Ligar o celular ao projeto ---------- */
  'vinculo.titulo': 'Ligar o celular ao projeto',
  'vinculo.explicacao':
    'A pesquisadora do projeto passa um código de 8 letras e números, em dois grupos de 4. O tracinho do meio aparece sozinho. Você digita uma vez só. Depois, o celular envia as leituras sempre que você tocar em Enviar agora.',
  'vinculo.coleta_livre': 'Coletar nunca precisa deste código.',
  'vinculo.privacidade':
    'O projeto recebe suas leituras. Recebe também o nome e o município de cada apiário ou meliponário, e o nome e o tipo de abelha de cada colmeia. O aplicativo não guarda a localização das suas colmeias.',
  'vinculo.campo.rotulo': 'Código do projeto',
  'vinculo.campo.exemplo': 'XXXX-XXXX',
  'vinculo.botao.ligar': 'Ligar ao projeto',
  'vinculo.botao.ligando': 'Ligando ao projeto…',
  'vinculo.botao.voltar': 'Voltar para Enviar',
  'vinculo.local.vazio': 'Digite o código do projeto que a pesquisadora passou.',
  'vinculo.local.tamanho':
    'O código tem 8 letras e números. Confira se faltou ou sobrou algum.',
  'vinculo.local.simbolo':
    'O código tem uma letra ou sinal que não existe nos códigos do projeto. Confira letra por letra com a pesquisadora.',
  'vinculo.local.verificador':
    'Parece que alguma letra ou número foi digitado errado. Confira letra por letra com a pesquisadora.',
  'vinculo.sucesso.titulo': 'Celular ligado ao projeto',
  'vinculo.sucesso.texto': '{apicultor}, no projeto {projeto}. Volte para a tela Enviar e toque em Enviar agora.',
  'vinculo.demo': 'Na demonstração, o código é {codigo}.',

  /* Por que ligar o celular parou. A ação seguinte é "Ligar ao projeto" de
     novo, nunca "Enviar agora": é outro botão, em outra tela. */
  'vinculo.parada.sem_rede.titulo': 'Sem internet agora',
  'vinculo.parada.sem_rede.texto':
    'Sem internet, não dá para conferir o código. Quando tiver sinal, toque em Ligar ao projeto de novo. Coletar continua funcionando sem internet.',
  'vinculo.parada.portal_cativo.titulo': 'Esta rede pede cadastro no navegador',
  'vinculo.parada.portal_cativo.texto':
    'Abra o navegador de internet (o Chrome, por exemplo) e faça o cadastro que aparecer. Depois toque em Ligar ao projeto de novo.',
  'vinculo.parada.servidor.titulo': 'A nuvem do projeto não respondeu',
  'vinculo.parada.servidor.texto':
    'Toque em Ligar ao projeto de novo daqui a pouco. Coletar continua funcionando.',
  'vinculo.parada.tempo_esgotado.titulo': 'A internet ficou fraca ou caiu',
  'vinculo.parada.tempo_esgotado.texto':
    'Toque em Ligar ao projeto de novo quando o sinal estiver melhor.',
  'vinculo.parada.recusado.titulo': 'A nuvem do projeto não aceitou este celular',
  'vinculo.parada.recusado.texto':
    'Confira o código com a pesquisadora e conte a ela o que apareceu aqui. Coletar continua funcionando.',
  'vinculo.parada.sem_vinculo.titulo': 'O celular ainda não está ligado ao projeto',
  'vinculo.parada.sem_vinculo.texto': 'Toque em Ligar ao projeto de novo.',

  /* ==========================================================================
   * Frente 004 — ler a placa pelo cabo (monitor de bancada).
   * Público: o grupo do firmware e a nossa equipe, na bancada. "Placa" aqui é
   * a placa de teste no computador, não um nó sensor instalado numa colmeia.
   * ======================================================================== */
  'cabo.titulo': 'Testar a placa pelo cabo',
  'cabo.aviso_nada_gravado':
    'Nada desta tela fica salvo no aplicativo. Ela só mostra o que a placa está mandando agora.',
  'cabo.intro':
    'Para testar a placa na bancada: ligue-a no computador com o cabo USB e toque em Conectar pelo cabo.',
  'cabo.diagnostico.titulo': 'Testar a placa na bancada',
  'cabo.diagnostico.ajuda':
    'Para a equipe técnica, num computador com Chrome ou Edge: mostra ao vivo o que a placa manda pelo cabo USB. Não salva nada.',

  'cabo.botao.conectar': 'Conectar pelo cabo',
  'cabo.botao.conectar_de_novo': 'Conectar de novo',
  'cabo.botao.desconectar': 'Desconectar',
  'cabo.botao.salvar': 'Baixar planilha',
  'cabo.botao.ir_coletar': 'Ir para Coletar',

  'cabo.estado.desconectado': 'Desconectado',
  'cabo.estado.escolhendo': 'Escolha a placa na lista que o navegador abriu.',
  'cabo.estado.conectando': 'Conectando…',
  'cabo.estado.conectado': 'Conectado à placa',
  'cabo.estado.esperando': 'Conectado. Esperando a primeira linha da placa…',
  'cabo.estado.saiu': 'Desconectado. A porta ficou livre para outro programa.',

  'cabo.grandeza.temperatura': 'Temperatura',
  'cabo.grandeza.umidade': 'Umidade',
  'cabo.grandeza.volateis': 'Voláteis (COVs)',
  'cabo.gas_estimado': 'eCO₂ estimado — não é CO₂: {valor} ppm',
  'cabo.gas_estimado_nao_vale':
    'eCO₂ estimado — não é CO₂: sem valor enquanto o sensor de gás não está pronto (a placa mandou {valor} ppm).',
  'cabo.volateis_aguardando':
    'O sensor de gás ainda não está pronto, então este número não vale. A placa mandou {valor} ppb.',
  'cabo.volateis_fora_do_normal':
    'O sensor de gás não está em situação normal, então este número não vale. A placa mandou {valor} ppb.',
  'cabo.volateis_bancada':
    'Número da placa na bancada. Numa colmeia, os voláteis valem só comparados com a própria colmeia.',
  'cabo.sem_numero': 'A placa não mandou número para este valor.',
  'cabo.aviso_aquecimento_cruzado':
    'O sensor de gás ligado pode esquentar o sensor de temperatura em alguns graus. Compare com um termômetro ao lado da placa.',
  'cabo.ultima_leitura': 'Última leitura às {hora}',
  'cabo.sem_leitura': 'Ainda não chegou nenhuma leitura.',

  'cabo.gas.normal': 'Sensor de gás pronto',
  'cabo.gas.aquecendo': 'Sensor de gás aquecendo',
  'cabo.gas.primeira_partida': 'Sensor de gás na primeira partida (pode levar cerca de 1 hora)',
  'cabo.gas.invalido': 'Sensor de gás com leitura inválida',
  'cabo.gas.desconhecido': 'Situação do sensor de gás desconhecida (código {n})',

  'cabo.grafico.titulo': 'Últimos 5 minutos',
  'cabo.grafico.vazio': 'Ainda sem leitura suficiente para o gráfico.',
  'cabo.grafico.legenda.linha': 'leitura da placa',
  'cabo.grafico.legenda.gas_nao_pronto': 'sensor de gás não pronto',
  'cabo.grafico.lacunas':
    'Onde a linha se interrompe, não chegou leitura com número. Pode ter chegado uma linha ilegível ou uma mensagem da placa no lugar. Nunca ligamos os pontos por cima do que faltou.',
  'cabo.grafico.lacunas_gas':
    'Nos voláteis, a linha também se interrompe enquanto o sensor de gás não está pronto.',

  'cabo.registro.titulo': 'Mensagens da placa',
  'cabo.registro.vazio': 'A placa ainda não mandou nenhuma mensagem de texto.',
  'cabo.registro.ilegivel': 'Linha ilegível',
  'cabo.registro.motivo.fora_do_formato': 'cortada, ou num formato que o aplicativo não conhece',
  'cabo.registro.motivo.caracteres_estranhos':
    'com caracteres estranhos. Confira se a placa usa a velocidade 115200',
  'cabo.registro.motivo.longa_demais': 'longa demais, sem fim de linha',
  'cabo.registro.motivo.interrompida': 'interrompida no meio',
  'cabo.registro.limite': 'Mostrando as {n} mais recentes.',

  'cabo.contagem.leituras.um': '{n} leitura vista nesta sessão',
  'cabo.contagem.leituras.outros': '{n} leituras vistas nesta sessão',
  'cabo.contagem.ilegiveis.um': '{n} linha ilegível',
  'cabo.contagem.ilegiveis.outros': '{n} linhas ilegíveis',
  'cabo.contagem.descartadas.um':
    'A leitura mais antiga saiu da memória desta tela (limite de 6 horas).',
  'cabo.contagem.descartadas.outros':
    'As {n} leituras mais antigas saíram da memória desta tela (limite de 6 horas).',

  'cabo.salvar.ajuda':
    'Baixa uma planilha com as leituras desta sessão, para comparar com um termômetro. É um arquivo seu, fora do aplicativo.',
  'cabo.salvar.sem_leitura':
    'Quando chegar a primeira leitura, dá para baixar a planilha.',
  'cabo.salvar.feito': 'Planilha baixada: {arquivo}',
  'cabo.salvar.nao_baixou':
    'Não consegui baixar a planilha. Confira se o navegador bloqueou arquivos deste endereço e toque em Baixar planilha de novo.',

  'cabo.sem_suporte.titulo.computador': 'O cabo só funciona num computador',
  'cabo.sem_suporte.titulo.endereco': 'O navegador só libera o cabo em endereço seguro',
  'cabo.sem_suporte.titulo.navegador': 'Este navegador não lê a placa pelo cabo',
  'cabo.sem_suporte.app_no_celular':
    'Esta tela é para testar a placa na bancada, ligada num computador com Chrome ou Edge. No celular, a coleta das colmeias é pela tela Coletar.',
  'cabo.sem_suporte.navegador_de_celular':
    'Esta tela precisa do Chrome ou do Edge num computador, com a placa ligada no cabo USB. Abra este mesmo endereço lá.',
  'cabo.sem_suporte.endereco_nao_seguro':
    'Abra o aplicativo por um endereço que comece com https, ou pelo próprio computador (localhost). Por este endereço, o navegador esconde a porta do cabo.',
  'cabo.sem_suporte.navegador_sem_porta':
    'Abra este mesmo endereço no Chrome ou no Edge, num computador. Firefox e Safari não leem a porta do cabo.',

  'cabo.problema.nenhuma_porta.titulo': 'Nenhuma placa foi escolhida',
  'cabo.problema.nenhuma_porta.detalhe':
    'Toque em Conectar pelo cabo e escolha a placa na lista. Se a lista estiver vazia, troque o cabo: alguns só dão carga e não servem para ler a placa.',
  'cabo.problema.sem_permissao.titulo': 'O navegador não deixou usar o cabo',
  'cabo.problema.sem_permissao.detalhe':
    'Confira nas configurações do navegador se este endereço pode usar portas seriais e toque em Conectar pelo cabo de novo.',
  'cabo.problema.porta_ocupada.titulo': 'A porta da placa está ocupada',
  'cabo.problema.porta_ocupada.detalhe':
    'Outro programa pode estar usando a placa, como o Monitor Serial da IDE do Arduino. Feche-o e toque em Conectar de novo. Se continuar, tire e recoloque o cabo.',
  'cabo.problema.cabo_solto.titulo': 'A placa foi desconectada',
  'cabo.problema.cabo_solto.detalhe':
    'O cabo pode ter saído. O que já apareceu continua na tela. Confira o cabo e toque em Conectar de novo.',
  'cabo.problema.placa_parou.titulo': 'A placa parou de mandar leituras',
  'cabo.problema.placa_parou.detalhe':
    'Nada chegou nos últimos 15 segundos. Veja as mensagens da placa abaixo: se o sensor de gás ou o de temperatura não iniciou, ela trava. Reinicie a placa e toque em Conectar de novo.',
  'cabo.problema.inesperado.titulo': 'Algo inesperado aconteceu com o cabo',
  'cabo.problema.inesperado.detalhe':
    'Tire e recoloque o cabo e toque em Conectar de novo. Se continuar, recarregue a página.',

  'cabo.planilha.arquivo': 'bancada-{data}.csv',
  'cabo.planilha.titulo': 'Bee-sertão: leitura da placa pelo cabo (bancada)',
  'cabo.planilha.origem':
    'Origem: monitor de bancada pelo cabo USB. Nada foi gravado no aplicativo.',
  'cabo.planilha.formato':
    'Formato das linhas: {formato} (código de bancada do grupo do firmware, recebido em 14/10/2026; não confirmado como contrato).',
  'cabo.planilha.sensores':
    'Sensor de temperatura e umidade: AHT20/AHT21. Sensor de gás: ENS160. Modelos informados pelo grupo do firmware.',
  'cabo.planilha.derivadas':
    'Grandezas derivadas: o eCO₂ e o índice de qualidade do ar são calculados pelo próprio sensor de gás a partir dos voláteis. eCO₂ estimado não é CO₂.',
  'cabo.planilha.hora':
    'Hora: relógio deste computador quando a linha chegou. A placa não tem relógio.',
  'cabo.planilha.valores':
    'Valores como a placa mandou, sem calibração e sem arredondamento. O sensor de gás ligado pode esquentar o de temperatura.',
  'cabo.planilha.inicio': 'Início da sessão: {hora}',
  'cabo.planilha.contagens':
    'Leituras: {leituras}. Com o sensor de gás fora do normal (código da situação diferente de 0): {fora}. Linhas ilegíveis: {ilegiveis}. Leituras mais antigas que saíram da memória: {descartadas}.',
  'cabo.planilha.col.hora_utc': 'Hora UTC',
  'cabo.planilha.col.hora_local': 'Hora local',
  'cabo.planilha.col.temperatura': 'Temperatura (°C, como veio)',
  'cabo.planilha.col.umidade': 'Umidade (%, como veio)',
  'cabo.planilha.col.vazio': 'Por que o valor está em branco',
  'cabo.planilha.col.status_gas': 'Código da situação do sensor de gás',
  'cabo.planilha.col.situacao_gas': 'Situação do sensor de gás',
  'cabo.planilha.col.volateis': 'Voláteis, TVOC (ppb)',
  'cabo.planilha.col.indice_ar': 'Índice de qualidade do ar (derivado)',
  'cabo.planilha.col.estimado': 'eCO₂ estimado, não é CO₂ (ppm)',
  'cabo.planilha.col.linha': 'Linha original da placa',
  'cabo.planilha.motivo.sem_numero': 'a placa mandou sem número',

  /* ==========================================================================
   * Frente 005 — coleta real pelo cabo (specs/005-coleta-pelo-cabo).
   * "Placa" é o nó sensor visto pelo cabo, na mão de quem coleta (glossário).
   * Toda mensagem diz o que ficou salvo no celular, o que a placa ainda tem e
   * o que fazer. Nenhuma mostra código de erro da placa.
   * ======================================================================== */
  'titulo.coleta_cabo': 'Coletar pelo cabo',
  'titulo.placa_nova': 'Configurar placa nova',

  'caboColeta.intro': 'Coleta das leituras da placa ligada no cabo USB deste computador.',
  'caboColeta.colmeia.titulo': 'De qual colmeia é esta placa?',
  'caboColeta.colmeia.ajuda':
    'Escolha abaixo a colmeia desta placa. Depois da primeira coleta, o aplicativo reconhece a placa sozinho.',
  'caboColeta.colmeia.nenhuma':
    'Ainda não há colmeia no aplicativo. Sem uma colmeia, não dá para guardar as leituras da placa. Avise a pesquisadora.',
  'caboColeta.passo.rotulo': 'Passo {n}',
  'caboColeta.passo.rotulo_acessivel': 'Passo {n}. {texto}',
  'caboColeta.passo.cabo': 'Ligue o cabo na placa e no computador.',
  'caboColeta.passo.botao': 'Aperte o botão da placa. Ela fica acordada esperando por 30 segundos.',
  'caboColeta.passo.coletar': 'Toque em Coletar em até 30 segundos.',
  'caboColeta.contagem.restam.um': 'Falta 1 segundo para a placa voltar a dormir',
  'caboColeta.contagem.restam.outros': 'Faltam {n} segundos para a placa voltar a dormir',
  'caboColeta.contagem.acabou': 'A placa já deve ter voltado a dormir. Aperte o botão dela de novo.',
  'caboColeta.placa_acordou': 'A placa acordou. Toque em Coletar.',
  'caboColeta.placa_ligada':
    'Há uma placa ligada neste computador. Se ela estiver dormindo, aperte o botão dela antes de tocar em Coletar.',
  'caboColeta.simulada.botao_junto':
    'Na placa simulada, o toque em Coletar também aperta o botão dela.',
  'caboColeta.botao.simulada': 'Usar a placa simulada',
  'caboColeta.botao.real': 'Usar a placa de verdade',
  'caboColeta.simulada.rotulo':
    'Placa simulada (demonstração): as leituras são inventadas pelo aplicativo.',
  'caboColeta.demo_disponivel': 'Para ver como funciona sem placa, use a placa simulada.',
  'caboColeta.manter_ligado': 'Não tire o cabo até terminar.',

  'caboColeta.estado.escolhendo':
    'Escolha a placa na lista que o navegador abriu. Se ela não estiver lá, aperte o botão da placa: ela aparece na lista.',
  'caboColeta.estado.conversando': 'Conversando com a placa…',
  'caboColeta.estado.recebendo': 'Recebendo as leituras da placa…',
  'caboColeta.estado.gravando': 'Salvando no celular…',
  'caboColeta.estado.confirmando': 'Confirmando com a placa…',
  'caboColeta.estado.recomecando': 'Acertando o relógio da placa…',
  'caboColeta.progresso.rotulo': 'Progresso da coleta pelo cabo',
  'caboColeta.progresso.bytes': '{recebidos} de {total} bytes',
  'caboColeta.progresso.leituras.um': '{n} leitura',
  'caboColeta.progresso.leituras.outros': '{n} leituras',

  'caboColeta.sem_suporte.app_no_celular':
    'No celular, ainda não dá para coletar pelo cabo. Por enquanto, use um computador: abra o aplicativo no Chrome ou no Edge e ligue a placa no cabo USB.',
  'caboColeta.sem_suporte.navegador_de_celular':
    'A coleta pelo cabo funciona no Chrome ou no Edge de um computador. Abra este mesmo endereço lá, com a placa ligada no cabo USB.',

  /* Antes da conversa: escolher e abrir a porta. */
  'caboColeta.porta.nenhuma.titulo': 'Nenhuma placa foi escolhida',
  'caboColeta.porta.nenhuma.detalhe':
    'Aperte o botão da placa. Depois toque em Tentar de novo e escolha a placa na lista. Se a lista vier vazia, troque o cabo: alguns cabos só servem para carregar.',
  'caboColeta.porta.nao_apareceu.titulo': 'A placa não apareceu',
  'caboColeta.porta.nao_apareceu.detalhe':
    'Confira o cabo, aperte o botão da placa e toque em Tentar de novo.',
  'caboColeta.porta.ocupada.titulo': 'Outro programa pode estar usando a placa',
  'caboColeta.porta.ocupada.detalhe':
    'Pode ser o Monitor Serial do Arduino ou a tela Testar a placa pelo cabo aberta em outra aba. Feche esse programa ou essa aba e toque em Tentar de novo.',
  'caboColeta.porta.sem_permissao.titulo': 'O navegador não deixou usar o cabo',
  'caboColeta.porta.sem_permissao.detalhe':
    'Nas configurações do navegador, procure a permissão "Portas seriais" e libere este endereço. Depois toque em Tentar de novo.',

  /* Resultado: problemas (nada novo ficou salvo, ou há algo a fazer na placa). */
  'caboColeta.problema.nao_respondeu.titulo': 'A placa da {nome} não respondeu',
  'caboColeta.problema.nao_respondeu.detalhe':
    'Ela fica acordada só 30 segundos depois do botão. Toque em Tentar de novo, aperte o botão da placa e toque em Coletar logo em seguida. Nada foi apagado da placa.',
  'caboColeta.problema.placa_nova.titulo': 'Esta placa ainda não foi configurada',
  'caboColeta.problema.placa_nova.detalhe':
    'Ela está esperando a data e a hora iniciais. Use Configurar placa nova, com a placa ligada no cabo.',
  'caboColeta.problema.data_zero.titulo': 'Esta placa começou a contar de uma data errada',
  'caboColeta.problema.data_zero.detalhe':
    'Ela era nova e confundiu o pedido do aplicativo com a data de início. As leituras até a próxima coleta vão ficar sem hora. Aperte o botão da placa e colete de novo para ela receber a hora certa.',
  'caboColeta.problema.placa_nova_talvez.titulo': 'Esta placa era nova',
  'caboColeta.problema.placa_nova_talvez.detalhe':
    'Ela pode ter confundido o pedido do aplicativo com a data de início. Aperte o botão da placa e colete de novo. Se ela responder, só as leituras desta primeira vez ficam sem hora; as próximas já vêm com a hora certa. Se ela não responder, use Configurar placa nova.',
  'caboColeta.problema.caiu.titulo': 'A placa da {nome} desconectou no meio da coleta',
  'caboColeta.problema.caiu.detalhe':
    'O cabo pode ter saído, ou a placa voltou a dormir. Nada foi salvo, e nada foi apagado da placa. Confira o cabo, aperte o botão da placa e colete de novo.',
  'caboColeta.problema.parou.titulo': 'A placa da {nome} parou de responder',
  'caboColeta.problema.parou.detalhe':
    'Nada foi salvo, e nada foi apagado da placa. Aperte o botão da placa e colete de novo.',
  'caboColeta.problema.crc.titulo': 'As leituras da {nome} chegaram com defeito pelo cabo',
  'caboColeta.problema.crc.detalhe':
    'Nada foi salvo, e nada foi apagado da placa. Confira o cabo e colete de novo.',
  'caboColeta.problema.protocolo.titulo': 'A placa respondeu de um jeito que o aplicativo não conhece',
  'caboColeta.problema.protocolo.detalhe':
    'Nada foi salvo, e nada foi apagado da placa. Atualize o aplicativo e colete de novo. Se continuar assim, avise a pesquisadora.',
  'caboColeta.problema.formato.titulo': 'O aplicativo ainda não sabe ler o arquivo desta placa',
  'caboColeta.problema.formato.detalhe':
    'O arquivo ficou salvo no celular para ser lido depois, e nada foi apagado da placa. Atualize o aplicativo e colete de novo. Se continuar assim, avise a pesquisadora.',
  'caboColeta.problema.nao_salvou.titulo': 'Não consegui salvar as leituras da placa no celular',
  'caboColeta.problema.nao_salvou.detalhe':
    'A placa continua com todas as leituras: nada foi apagado dela. Pode estar faltando espaço no computador. Libere espaço e colete de novo.',
  'caboColeta.problema.nao_entendeu.titulo': 'A placa não entendeu o pedido do aplicativo',
  'caboColeta.problema.nao_entendeu.detalhe':
    'Isso acontece quando passa muito tempo entre apertar o botão da placa e tocar em Coletar. Toque em Tentar de novo, aperte o botão da placa uma vez e toque logo em Coletar. Nada foi apagado da placa.',
  'caboColeta.problema.sem_arquivo.titulo': 'A placa não tem leituras guardadas',
  'caboColeta.problema.sem_arquivo.detalhe':
    'Pode ser uma placa nova, ou ela perdeu as leituras que tinha. Use Configurar placa nova antes de colocá-la na colmeia.',
  'caboColeta.problema.nao_leu.titulo': 'A placa não conseguiu ler as próprias leituras',
  'caboColeta.problema.nao_leu.detalhe':
    'Nada foi apagado da placa. Aperte o botão e colete de novo. Se repetir, avise a pesquisadora.',
  'caboColeta.problema.perdeu_arquivo.titulo': 'A placa perdeu o arquivo depois da coleta',
  'caboColeta.problema.perdeu_arquivo.detalhe':
    'As leituras desta coleta estão salvas no celular. A placa voltou a ser placa nova: use Configurar placa nova antes de colocá-la de volta na colmeia.',

  /* Resultado: avisos (as leituras estão salvas; há o que saber). */
  'caboColeta.aviso.hora_errada.titulo': 'A data ou a hora deste aparelho parece errada',
  'caboColeta.aviso.hora_errada.detalhe':
    'Por isso, não acertei o relógio da placa. As leituras desta coleta estão salvas no celular, mas ficam sem hora por enquanto. A placa guarda uma cópia e manda de novo na próxima coleta, sem repetir nenhuma. Antes disso, confira a data e a hora nas configurações do computador.',
  'caboColeta.aviso.continua.titulo': 'A placa ainda guarda as leituras desta coleta',
  'caboColeta.aviso.continua.detalhe':
    'Elas já estão salvas no celular. Na próxima coleta a placa manda de novo, e nada é duplicado.',
  'caboColeta.aviso.nao_se_sabe.titulo': 'Não deu para saber se a placa ainda tem estas leituras',
  'caboColeta.aviso.nao_se_sabe.detalhe':
    'As leituras estão salvas no celular. Se a placa ainda tiver as mesmas, a próxima coleta as traz de novo, sem duplicar.',
  'caboColeta.aviso.outra_colmeia.titulo': 'Esta placa é da {nome}',
  'caboColeta.aviso.outra_colmeia.detalhe':
    'Ela informou a própria identificação, e as leituras foram para a colmeia dela.',
  'caboColeta.aviso.hora_nao_fechou.titulo': 'Não deu para calcular a hora destas leituras',
  'caboColeta.aviso.hora_nao_fechou.a_mais.um':
    'A placa mandou {medicoes} leituras, mas no tempo que passou cabiam só cerca de {esperadas}. Isso acontece quando alguém aperta o botão da placa e não termina a coleta. Por isso, a leitura deste arquivo ficou sem hora. Ela não foi apagada.',
  'caboColeta.aviso.hora_nao_fechou.a_mais.outros':
    'A placa mandou {medicoes} leituras, mas no tempo que passou cabiam só cerca de {esperadas}. Isso acontece quando alguém aperta o botão da placa e não termina a coleta. Por isso, as {n} leituras deste arquivo ficaram sem hora. Nenhuma foi apagada.',
  'caboColeta.aviso.hora_nao_fechou.a_menos.um':
    'A placa mandou só {medicoes} leituras, mas no tempo que passou cabiam cerca de {esperadas}. A placa pode ter ficado sem energia por um tempo. Por isso, a leitura deste arquivo ficou sem hora. Ela não foi apagada.',
  'caboColeta.aviso.hora_nao_fechou.a_menos.outros':
    'A placa mandou só {medicoes} leituras, mas no tempo que passou cabiam cerca de {esperadas}. A placa pode ter ficado sem energia por um tempo. Por isso, as {n} leituras deste arquivo ficaram sem hora. Nenhuma foi apagada.',
  'caboColeta.aviso.hora_nao_fechou.intervalo':
    'Se a placa mede num intervalo diferente, corrija na tela da colmeia: as horas são refeitas sem apagar nada.',
  'caboColeta.aviso.inicio_errado.titulo': 'A placa começou a contar de uma data impossível',
  'caboColeta.aviso.inicio_errado.detalhe':
    'As leituras deste arquivo ficaram sem hora. Na próxima coleta a placa recebe a hora certa e o arquivo seguinte já vem com hora.',

  'caboColeta.aviso.conflito.titulo': 'Algumas leituras ficaram salvas à parte',
  'caboColeta.aviso.conflito.detalhe.um':
    '1 leitura desta placa tem o mesmo número de outra já salva nesta colmeia, com valores diferentes. A que já estava salva não mudou, e esta ficou salva no celular, junto com o arquivo inteiro da coleta. Isso acontece com placa que começou a contar de uma data errada. Avise a pesquisadora.',
  'caboColeta.aviso.conflito.detalhe.outros':
    '{n} leituras desta placa têm o mesmo número de outras já salvas nesta colmeia, com valores diferentes. As que já estavam salvas não mudaram, e estas ficaram salvas no celular, junto com o arquivo inteiro da coleta. Isso acontece com placa que começou a contar de uma data errada. Avise a pesquisadora.',

  /* Resultado: notas do sucesso. */
  'caboColeta.nota.recomecou': 'As leituras já estão salvas no celular. Por isso, a placa apagou a cópia dela e recomeçou a contar.',
  'caboColeta.nota.periodo': 'Horas estimadas pela contagem da placa, de {de} a {ate}.',

  /* Configurar placa nova. */
  'placaNova.link': 'Configurar placa nova',
  'placaNova.intro':
    'Use só com uma placa que acabou de receber o programa e ainda não mediu nada. Ela fica esperando a data e a hora pelo cabo.',
  'placaNova.passo.cabo': 'Ligue a placa nova no cabo, neste computador.',
  'placaNova.passo.enviar': 'Confira a data e a hora abaixo e toque em Acertar o relógio.',
  'placaNova.computador_marca': 'Este computador está marcando:',
  'placaNova.botao.enviar': 'Acertar o relógio',
  'placaNova.botao.de_novo': 'Acertar de novo',
  'placaNova.botao.ir_coleta': 'Ir para Coletar pelo cabo',
  'placaNova.estado.enviando': 'Acertando o relógio da placa…',
  'placaNova.relogio_errado.titulo': 'A data ou a hora deste computador parece errada',
  'placaNova.relogio_errado.detalhe':
    'Com uma data errada, todas as leituras do primeiro arquivo da placa ficariam sem hora. Acerte a data e a hora do computador e volte a esta tela.',
  'placaNova.confirmada.titulo': 'A placa confirmou e começou a medir',
  'placaNova.confirmada.detalhe':
    'Ela começou a medir em {data}. Na primeira coleta, a hora de cada leitura vai ser estimada a partir dessa data.',
  'placaNova.sem_confirmacao.titulo': 'Tentei acertar o relógio, mas a placa não confirmou',
  'placaNova.sem_confirmacao.detalhe':
    'Se ela estava esperando a hora, já começou a medir. Para ter certeza, colete pelo cabo daqui a alguns minutos: o resultado mostra se ela mandou leituras.',
  'placaNova.ja_configurada.titulo': 'Esta placa já estava configurada',
  'placaNova.ja_configurada.detalhe':
    'Ela já mede e não usou a hora enviada. Para coletar as leituras dela, use Coletar pelo cabo.',
  'placaNova.nao_salvou.titulo': 'A placa recebeu a hora, mas não conseguiu guardá-la',
  'placaNova.nao_salvou.detalhe':
    'Tire o cabo da placa e coloque de novo. Depois toque em Acertar de novo. Se acontecer outra vez, avise a pesquisadora.',
  'placaNova.caiu.titulo': 'A placa desconectou',
  'placaNova.caiu.detalhe': 'Confira o cabo e toque em Acertar de novo.',

  /* Tela da colmeia: intervalo da placa (FR-016, FR-019). */
  'colmeia.intervalo.titulo': 'De quanto em quanto tempo a placa mede',
  'colmeia.intervalo.ajuda':
    'Escolha o mesmo intervalo em que a placa mede. Mudar aqui não muda a placa: só refaz as horas das leituras, sem apagar nenhuma.',
  'colmeia.intervalo.horas.um': 'A cada {n} hora',
  'colmeia.intervalo.horas.outros': 'A cada {n} horas',
  'colmeia.intervalo.minutos': 'A cada {n} minutos',
  'colmeia.intervalo.teste': 'A cada 25 segundos (placa de teste)',
  'colmeia.intervalo.segundos.um': 'A cada {n} segundo',
  'colmeia.intervalo.segundos.outros': 'A cada {n} segundos',
  'colmeia.intervalo.padrao': '{opcao} — padrão',
  'colmeia.intervalo.nao_salvou': 'Não consegui mudar o intervalo. Toque de novo na opção.',
  'colmeia.horas_estimadas':
    'As horas das leituras da placa são estimadas: o aplicativo conta a partir de quando a placa começou a medir, uma leitura a cada intervalo.',

  /* Pontos de entrada. */
  'coleta.cabo.link': 'Coletar pelo cabo',
  'coleta.cabo.ajuda': 'Para a placa ligada no cabo USB de um computador.',
  'cabo.diagnostico.coleta_titulo': 'Coletar as leituras pelo cabo',
  'cabo.diagnostico.coleta_ajuda':
    'Salva no aplicativo as leituras da placa ligada no cabo USB, no Chrome ou no Edge de um computador.',
} as const;

export type ChaveTexto = keyof typeof ptBR;

// AS TELAS DESTE MODULO, e a permissao que cada uma exige.
//
// Uma tela fora desta lista NAO EXISTE: o portao (montar.js) so serve arquivo
// por um caminho declarado aqui, e nenhum .html sai do disco por caminho
// direto. E a armadilha #3 do CLAUDE.md aplicada por dentro — no PCP, um
// express.static antes do auth ja entregou tela sem senha, e custou caro.
//
// A coluna `contexto` nao e decoracao: ela decide o TEMA da tela, seguindo a
// secao 1 do docs/DESIGN.md.
//
//   operacao  bancada, iPad no suporte, luz natural forte + lampada branca de
//             inspecao. Fundo CLARO — tela escura ali vira espelho e o operador
//             enxerga o proprio reflexo em vez da medida da peca.
//   admin     escritorio, desktop, luz controlada, muitos numeros juntos.
//             Fundo ESCURO, como o resto do admin do PCP.
//
// Escrever isso aqui, e nao no <body> de cada arquivo, e o que impede a
// proxima tela de nascer com o tema errado por esquecimento.
const TELAS={
  /* A tela inicial pede `modulo.entrar`, e nao `cadastro.ler`: com o papel
     VENDEDOR da fase 2 a segunda deixou de ser "a chave que todo mundo que
     entra tem". Ele abriria o modulo em branco, com 403 no console — e tela
     em branco nao se parece nem de longe com "mexeram na permissao". */
  '/':          {numero:601, nome:'Início', nivel:'operacao', arquivo:'telas/inicio.html',    permissao:'modulo.entrar',     contexto:'operacao', modulo:'administracao', bloco:'comum', liga:[602, 612, 613]},
  '/inicio':    {numero:601, nome:'Início', nivel:'operacao', apelido:true, arquivo:'telas/inicio.html',    permissao:'modulo.entrar',     contexto:'operacao', modulo:'administracao', bloco:'comum', liga:[602, 612, 613]},
  '/corte':     {numero:602, nome:'Corte', nivel:'operacao', arquivo:'telas/corte.html',     permissao:'plano.calcular',    contexto:'operacao', modulo:'producao', bloco:'sob_medida', liga:[604, 603, 605, 612]},
  '/sobras':    {numero:603, nome:'Sobras', nivel:'operacao', arquivo:'telas/sobras.html',    permissao:'sobra.ler',         contexto:'operacao', valor:['custo.ver'], modulo:'almoxarifado', bloco:'sob_medida', liga:[602, 605]},
  '/rolos':     {numero:604, nome:'Rolos', nivel:'operacao', arquivo:'telas/rolos.html',     permissao:'rolo.ler',          contexto:'operacao', valor:['custo.ver'], modulo:'almoxarifado', bloco:'sob_medida', liga:[502, 602]},
  '/etiquetas': {numero:605, nome:'Etiquetas', nivel:'operacao', arquivo:'telas/etiquetas.html', permissao:'etiqueta.imprimir', contexto:'operacao', modulo:'almoxarifado', bloco:'sob_medida', liga:[603, 604]},
  /* Cadastros pede EDITAR, nao LER, e a diferenca nao e detalhe.
     `cadastro.ler` e a chave que o cortador tem para a tela de corte poder
     listar tecido e cor — ela vale para os DADOS. A tela de cadastro e outra
     coisa: e escritorio, tema escuro, e nada nela serve a quem esta em pe na
     bancada. Enquanto pedia LER, ela aparecia no menu do cortador e abria
     inteira em modo leitura: uma tela escura no tablet sob a lampada de
     inspecao, cheia de coisa que ele nao pode mexer. */
  '/cadastros': {numero:606, nome:'Cadastros', nivel:'supervisor', arquivo:'telas/cadastros.html', permissao:'cadastro.editar',   contexto:'admin', valor:['custo.ver'], modulo:'cadastros', bloco:'sob_medida', liga:[608, 602, 'tecido']},
  '/painel':    {numero:607, nome:'Painel', nivel:'supervisor', arquivo:'telas/painel.html',    permissao:'painel.ler',        contexto:'admin', valor:['custo.ver'], modulo:'relatorios', bloco:'sob_medida', liga:[604, 603, 611]},

  /* ── O SOB MEDIDA DE VENDA (spec SOBMEDIDA-PEDIDO-REVENDA, fase 1) ──────
     As duas nascem em contexto ADMIN, e nao por serem novas: sao escritorio.
     O catalogo e cadastro (a mesma razao que moveu /cadastros de `ler` para
     `editar`), e o simulador e desktop — quem simula esta ao telefone com a
     revenda, nao em pe na bancada sob a lampada de inspecao. */
  '/catalogo':  {numero:608, nome:'Catálogo', nivel:'supervisor', arquivo:'telas/catalogo.html',  permissao:'catalogo.editar',   contexto:'admin', valor:['preco.ver'], modulo:'cadastros', bloco:'sob_medida', liga:[606, 609, 611]},
  '/simulador': {numero:609, nome:'Simulador', nivel:'operacao', arquivo:'telas/simulador.html', permissao:'catalogo.ler',      contexto:'admin', valor:['preco.ver'], modulo:'comercial', bloco:'revenda', liga:[608, 611]},

  /* QUEM COMPRA (fase 2). Escritorio, como as duas de cima. Pede `ler`, e
     nao `editar`, porque o vendedor vive nela — a carteira dele e a lista de
     trabalho. Os botoes de mexer aparecem por permissao, dentro. */
  '/revendas':  {numero:610, nome:'Revendas', nivel:'operacao', arquivo:'telas/revendas.html',  permissao:'revenda.ler',       contexto:'admin', valor:['preco.ver'], modulo:'comercial', bloco:'revenda', liga:[611, 616]},

  /* O PEDIDO (fase 3). Pede `pedido.ler` e nao `pedido.lancar`: a fila de
     aprovacao e a lista de trabalho do vendedor, e quem so aprova tem que
     conseguir abrir a tela. Os botoes de lancar, enviar e cancelar aparecem
     por permissao, dentro dela. */
  '/pedidos':   {numero:611, nome:'Pedidos', nivel:'operacao', arquivo:'telas/pedidos.html',   permissao:'pedido.ler',        contexto:'admin', valor:['preco.ver'], modulo:'comercial', bloco:'revenda', liga:[609, 610, 612]},

  /* ⚠️ A PRODUCAO E A PRIMEIRA TELA DE VENDA EM CONTEXTO **OPERACAO**, e nao
     por ser nova: ela e da bancada. Quem a abre esta em pe, perto da Zebra,
     sob a lampada de inspecao — e ali tela escura vira espelho (§19). O
     pedido e o catalogo continuam escuros porque sao escritorio. */
  '/producao':  {numero:612, nome:'Produção', nivel:'operacao', arquivo:'telas/producao.html',  permissao:'etiqueta_producao.ler', contexto:'operacao', modulo:'producao', bloco:'sob_medida', liga:[611, 613, 602]},

  /* ⚠️ A BANCADA PEDE `producao.bipar`, E ESSA CHAVE VEM DO SETOR, nao do
     papel (fase 5-A). Quem nao esta em bancada nenhuma nao a tem — entao a
     tela nem aparece no menu dele, e menu com tela inutil e o que ensina a
     nao clicar. Contexto OPERACAO pela mesma razao da producao: quem abre
     esta em pe na bancada, e ali tela escura vira espelho. */
  '/bancada':   {numero:613, nome:'Bancada', nivel:'operacao', arquivo:'telas/bancada.html',   permissao:'producao.bipar',        contexto:'operacao', modulo:'producao', bloco:'sob_medida', liga:[612, 614]},

  /* ⚠️ O KANBAN E `painel.ler`, E CONTEXTO ADMIN. Ele responde "onde esta o
     pedido X" para a fabrica inteira, com o valor de cada carteira — e isso
     e escritorio, nao bancada. Declarado `pedido.ler` ele daria ao VENDEDOR
     o quadro das revendas dos colegas; a fila dele continua em /pedidos. */
  '/kanban':    {numero:614, nome:'Quadro', nivel:'supervisor', arquivo:'telas/kanban.html',    permissao:'painel.ler',            contexto:'admin', valor:['preco.ver'], modulo:'planejamento', bloco:'sob_medida', liga:[611, 613]},

  /* ⚠️ OS INDICADORES SAO `painel.ler` PELA MESMA RAZAO DO QUADRO (fase
     6-B): a tela diz quanto cada vendedor leva para aprovar e quanto cada
     pessoa da bancada produz. Medir gente e escritorio, e a pergunta e da
     fabrica inteira — nao da carteira de quem abre. */
  '/indicadores':{numero:615, nome:'Indicadores', nivel:'supervisor', arquivo:'telas/indicadores.html', permissao:'painel.ler',           contexto:'admin', valor:['preco.ver'], modulo:'relatorios', bloco:'sob_medida', liga:[611, 613]},

  /* ⚠️ O FINANCEIRO PEDE `boleto.ler`, E NAO `boleto.editar` — e a mesma
     razao de `/pedidos` pedir `pedido.ler`: o VENDEDOR vive nesta tela, pela
     tarefa semanal da §4.13 (rever os boletos em aberto da carteira dele).
     Os botoes de lancar, baixar e cancelar aparecem por permissao, dentro.
     Pedir `editar` daria 403 a quem a tela existe para servir. */
  '/financeiro':{numero:616, nome:'Financeiro', nivel:'operacao', arquivo:'telas/financeiro.html', permissao:'boleto.ler',            contexto:'admin', valor:['preco.ver'], modulo:'financeiro', bloco:'revenda', liga:[610, 611]}
};

/* O NUMERO E O NIVEL de cada tela (spec ACESSO-POR-TELA-E-NIVEL, fase 2,
   04/11/2026): a centena 600 e do sob medida no mapa unico do PCP (`telas.js`
   da raiz), e o numero nunca muda nem se reaproveita. O nivel e o da
   permissao que abre a tela. `/inicio` e apelido de `/`: mesmo numero, uma
   linha so no mapa. O `teste_mapa.js` reprova tela daqui sem numero.

   `valor` (R-VAL, spec ARRUMAR-O-LUGAR, 11/11/2026): a chave da caixinha "Ver
   valores (R$)" da tela. Duas, e nunca misturadas: `preco.ver` e o PRECO DE
   VENDA (o que a revenda paga: catalogo, simulador, pedido, quadro,
   indicadores, revenda e financeiro); `custo.ver` e o CUSTO (o que o rolo
   custou, o dinheiro parado: sobras, rolos, cadastros, painel). A 602 Corte
   NAO tem `valor`: a tela e as rotas do corte nao mostram dinheiro, e a linha
   "os valores nao aparecem" acenderia todo dia para o cortador. A
   poda de cada lado e do `dominio/custo.js` (podarVenda, podarCusto).

   TELA_DA_CHAVE diz em que tela cada permissao do modulo e usada (R-ALC-03):
   a tela de Acessos pendura a acao na tela dela. Chave nova sem tela aqui
   reprova o teste_mapa.js. */
const TELA_DA_CHAVE={
  'modulo.entrar':601,
  'cadastro.ler':606, 'cadastro.editar':606, 'parametro.ler':602, 'parametro.editar':906,   // ARRUMAR-O-LUGAR fase 3: a ler é do Corte e das Sobras; editar mora na 906 Parâmetros
  'endereco.criar':604, 'rolo.ler':604, 'rolo.entrada':604, 'rolo.encerrar':604, 'rolo.ajustar':604, 'rolo.nota':604,
  'sobra.ler':603, 'sobra.criar':603, 'sobra.corrigir':603, 'sobra.propor':603, 'sobra.descartar':603, 'sobra.aprovar_descarte':603,
  'etiqueta.imprimir':605,
  'plano.calcular':602, 'plano.confirmar':602, 'corte.gerir':602, 'corte.pedir_correcao':602, 'corte.aprovar_correcao':602,
  'painel.ler':607, 'custo.ver':607, 'preco.ver':609,
  'catalogo.editar':608, 'catalogo.ler':609,
  'revenda.ler':610, 'revenda.editar':610, 'credito.editar':610,
  'pedido.ler':611, 'pedido.lancar':611, 'pedido.aprovar':611, 'pedido.aprovar_qualquer':611, 'pedido.prazo':611, 'pedido.cancelar':611,
  'etiqueta_producao.ler':612, 'etiqueta_producao.imprimir':612,
  'producao.bipar':613, 'producao.pendencia':613,
  'boleto.ler':616, 'boleto.editar':616, 'boleto.aprovar_baixa':616
};

module.exports={TELAS, TELA_DA_CHAVE};

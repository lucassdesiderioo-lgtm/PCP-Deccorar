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
  '/':          {arquivo:'telas/inicio.html',    permissao:'modulo.entrar',     contexto:'operacao'},
  '/inicio':    {arquivo:'telas/inicio.html',    permissao:'modulo.entrar',     contexto:'operacao'},
  '/corte':     {arquivo:'telas/corte.html',     permissao:'plano.calcular',    contexto:'operacao'},
  '/sobras':    {arquivo:'telas/sobras.html',    permissao:'sobra.ler',         contexto:'operacao'},
  '/rolos':     {arquivo:'telas/rolos.html',     permissao:'rolo.ler',          contexto:'operacao'},
  '/etiquetas': {arquivo:'telas/etiquetas.html', permissao:'etiqueta.imprimir', contexto:'operacao'},
  /* Cadastros pede EDITAR, nao LER, e a diferenca nao e detalhe.
     `cadastro.ler` e a chave que o cortador tem para a tela de corte poder
     listar tecido e cor — ela vale para os DADOS. A tela de cadastro e outra
     coisa: e escritorio, tema escuro, e nada nela serve a quem esta em pe na
     bancada. Enquanto pedia LER, ela aparecia no menu do cortador e abria
     inteira em modo leitura: uma tela escura no tablet sob a lampada de
     inspecao, cheia de coisa que ele nao pode mexer. */
  '/cadastros': {arquivo:'telas/cadastros.html', permissao:'cadastro.editar',   contexto:'admin'},
  '/painel':    {arquivo:'telas/painel.html',    permissao:'painel.ler',        contexto:'admin'},

  /* ── O SOB MEDIDA DE VENDA (spec SOBMEDIDA-PEDIDO-REVENDA, fase 1) ──────
     As duas nascem em contexto ADMIN, e nao por serem novas: sao escritorio.
     O catalogo e cadastro (a mesma razao que moveu /cadastros de `ler` para
     `editar`), e o simulador e desktop — quem simula esta ao telefone com a
     revenda, nao em pe na bancada sob a lampada de inspecao. */
  '/catalogo':  {arquivo:'telas/catalogo.html',  permissao:'catalogo.editar',   contexto:'admin'},
  '/simulador': {arquivo:'telas/simulador.html', permissao:'catalogo.ler',      contexto:'admin'},

  /* QUEM COMPRA (fase 2). Escritorio, como as duas de cima. Pede `ler`, e
     nao `editar`, porque o vendedor vive nela — a carteira dele e a lista de
     trabalho. Os botoes de mexer aparecem por permissao, dentro. */
  '/revendas':  {arquivo:'telas/revendas.html',  permissao:'revenda.ler',       contexto:'admin'},

  /* O PEDIDO (fase 3). Pede `pedido.ler` e nao `pedido.lancar`: a fila de
     aprovacao e a lista de trabalho do vendedor, e quem so aprova tem que
     conseguir abrir a tela. Os botoes de lancar, enviar e cancelar aparecem
     por permissao, dentro dela. */
  '/pedidos':   {arquivo:'telas/pedidos.html',   permissao:'pedido.ler',        contexto:'admin'},

  /* ⚠️ A PRODUCAO E A PRIMEIRA TELA DE VENDA EM CONTEXTO **OPERACAO**, e nao
     por ser nova: ela e da bancada. Quem a abre esta em pe, perto da Zebra,
     sob a lampada de inspecao — e ali tela escura vira espelho (§19). O
     pedido e o catalogo continuam escuros porque sao escritorio. */
  '/producao':  {arquivo:'telas/producao.html',  permissao:'etiqueta_producao.ler', contexto:'operacao'},

  /* ⚠️ A BANCADA PEDE `producao.bipar`, E ESSA CHAVE VEM DO SETOR, nao do
     papel (fase 5-A). Quem nao esta em bancada nenhuma nao a tem — entao a
     tela nem aparece no menu dele, e menu com tela inutil e o que ensina a
     nao clicar. Contexto OPERACAO pela mesma razao da producao: quem abre
     esta em pe na bancada, e ali tela escura vira espelho. */
  '/bancada':   {arquivo:'telas/bancada.html',   permissao:'producao.bipar',        contexto:'operacao'},

  /* ⚠️ O KANBAN E `painel.ler`, E CONTEXTO ADMIN. Ele responde "onde esta o
     pedido X" para a fabrica inteira, com o valor de cada carteira — e isso
     e escritorio, nao bancada. Declarado `pedido.ler` ele daria ao VENDEDOR
     o quadro das revendas dos colegas; a fila dele continua em /pedidos. */
  '/kanban':    {arquivo:'telas/kanban.html',    permissao:'painel.ler',            contexto:'admin'},

  /* ⚠️ OS INDICADORES SAO `painel.ler` PELA MESMA RAZAO DO QUADRO (fase
     6-B): a tela diz quanto cada vendedor leva para aprovar e quanto cada
     pessoa da bancada produz. Medir gente e escritorio, e a pergunta e da
     fabrica inteira — nao da carteira de quem abre. */
  '/indicadores':{arquivo:'telas/indicadores.html', permissao:'painel.ler',           contexto:'admin'},

  /* ⚠️ O FINANCEIRO PEDE `boleto.ler`, E NAO `boleto.editar` — e a mesma
     razao de `/pedidos` pedir `pedido.ler`: o VENDEDOR vive nesta tela, pela
     tarefa semanal da §4.13 (rever os boletos em aberto da carteira dele).
     Os botoes de lancar, baixar e cancelar aparecem por permissao, dentro.
     Pedir `editar` daria 403 a quem a tela existe para servir. */
  '/financeiro':{arquivo:'telas/financeiro.html', permissao:'boleto.ler',            contexto:'admin'}
};

module.exports={TELAS};

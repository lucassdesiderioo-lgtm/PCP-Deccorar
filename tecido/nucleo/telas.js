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
  '/revendas':  {arquivo:'telas/revendas.html',  permissao:'revenda.ler',       contexto:'admin'}
};

module.exports={TELAS};

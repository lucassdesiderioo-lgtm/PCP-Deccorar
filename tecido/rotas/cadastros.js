// Declaracoes das rotas de cadastro. Sem SQL, sem 'if' de negocio: cada
// manipulador so traduz o pedido HTTP numa chamada do dominio.
const tecido=require('../dominio/tecido');
const endereco=require('../dominio/endereco');
const motivo=require('../dominio/motivo');
const largura=require('../dominio/largura');
const exclusao=require('../dominio/exclusao');

// A camada de dados entra aqui SO para o atualizar generico (ordem, ativo,
// renomear) — nao ha regra nenhuma nesses tres campos. Criar, esse sim, passa
// sempre pelo dominio.
const dLinha=require('../dados/linha');
const dAbertura=require('../dados/abertura');
const dCor=require('../dados/cor');
const dHaste=require('../dados/haste');
const dAndar=require('../dados/andar');
const dNivel=require('../dados/nivel');

const conferir=require('../dominio/conferir');
const fornecedor=require('../dominio/fornecedor');

const LER='cadastro.ler', EDITAR='cadastro.editar', CRIAR_END='endereco.criar';

module.exports={rotas:[

  // ── Tecido ─────────────────────────────────────────────────────────────
  {metodo:'GET', caminho:'/api/linhas', permissao:LER,
   manipulador:()=>tecido.listarLinhas()},
  {metodo:'POST', caminho:'/api/linhas', permissao:EDITAR,
   manipulador:({corpo})=>tecido.criarLinha(corpo),
   detalhe:(req)=>'linha '+req.body.nome},
  {metodo:'PUT', caminho:'/api/linhas/:id', permissao:EDITAR,
   manipulador:({params,corpo})=> corpo.nome!==undefined
     ? tecido.renomearLinha(params.id,corpo.nome)
     : dLinha.atualizar(params.id,corpo),
   detalhe:(req)=>req.body.nome!==undefined?('renomeou para '+req.body.nome):null},

  {metodo:'GET', caminho:'/api/aberturas', permissao:LER,
   manipulador:({query})=>tecido.listarAberturas(query.linha_id)},
  {metodo:'POST', caminho:'/api/aberturas', permissao:EDITAR,
   manipulador:({corpo})=>tecido.criarAbertura(corpo),
   detalhe:(req)=>'abertura '+req.body.nome},
  {metodo:'PUT', caminho:'/api/aberturas/:id', permissao:EDITAR,
   manipulador:({params,corpo})=> corpo.nome!==undefined
     ? tecido.renomearAbertura(params.id,corpo.nome)
     : dAbertura.atualizar(params.id,corpo),
   detalhe:(req)=>req.body.nome!==undefined?('renomeou para '+req.body.nome):null},

  {metodo:'GET', caminho:'/api/cores', permissao:LER,
   manipulador:()=>tecido.listarCores()},
  {metodo:'POST', caminho:'/api/cores', permissao:EDITAR,
   manipulador:({corpo})=>tecido.criarCor(corpo),
   detalhe:(req)=>'cor '+req.body.nome},
  {metodo:'PUT', caminho:'/api/cores/:id', permissao:EDITAR,
   manipulador:({params,corpo})=> corpo.nome!==undefined
     ? tecido.renomearCor(params.id,corpo.nome)
     : dCor.atualizar(params.id,corpo),
   detalhe:(req)=>req.body.nome!==undefined?('renomeou para '+req.body.nome):null},

  /* AS LARGURAS DE BOBINA. Leitura com `cadastro.ler` porque a tela de
     entrada de rolo — que e da bancada — precisa montar os botoes; escrita
     com `cadastro.editar`, que e da chefia: largura errada na lista vira
     largura errada em todo rolo lancado depois. */
  {metodo:'GET', caminho:'/api/larguras', permissao:LER,
   manipulador:()=>largura.listar()},
  {metodo:'POST', caminho:'/api/larguras', permissao:EDITAR,
   manipulador:({corpo})=>largura.criar(corpo.valor),
   detalhe:(req)=>'largura de bobina '+req.body.valor+' m'},
  {metodo:'PUT', caminho:'/api/larguras/:id', permissao:EDITAR,
   manipulador:({params,corpo})=>corpo.ativo?largura.reativar(params.id):largura.desativar(params.id),
   detalhe:(req)=>(req.body.ativo?'reativou':'tirou da lista')+' a largura '+req.params.id},

  /* APAGAR CADASTRO. Uma rota so para todos os tipos porque a conta de quem
     aponta para quem tem dono unico (dominio/exclusao.js) — sete rotas
     iguais seriam sete lugares para esquecer de conferir um dependente. */
  {metodo:'DELETE', caminho:'/api/cadastro/:tipo/:id', permissao:EDITAR,
   manipulador:({params})=>exclusao.excluir(params.tipo,params.id),
   detalhe:(req)=>'apagou '+req.params.tipo+' '+req.params.id},

  /* A LISTA DO QUE A BANCADA CRIOU E A CHEFIA AINDA NAO OLHOU.
     Ela e a outra metade de deixar a bancada cadastrar: sem a lista, o que
     mudou nao foi "a chefia confere depois" e sim "ninguem confere". */
  {metodo:'GET', caminho:'/api/cadastro/conferir', permissao:EDITAR,
   manipulador:()=>conferir.listar()},
  {metodo:'POST', caminho:'/api/cadastro/conferir/:tipo/:id', permissao:EDITAR,
   manipulador:({params})=>conferir.marcar(params.tipo,params.id),
   detalhe:(req)=>'conferiu '+req.params.tipo+' '+req.params.id},

  /* ── FORNECEDOR ─────────────────────────────────────────────────────────
     Criar e da BANCADA (`endereco.criar` — a mesma chave de "cadastro que
     nasce com a mercadoria na mao"): o rolo desce do caminhao de um
     fornecedor que ninguem cadastrou, e a alternativa nao e esperar, e
     lancar o rolo sem fornecedor. Renomear e da chefia, que e quem vai
     juntar 'Ecotex' com 'ecotex' depois. */
  {metodo:'GET', caminho:'/api/fornecedores', permissao:LER,
   manipulador:()=>fornecedor.listar()},
  {metodo:'POST', caminho:'/api/fornecedores', permissao:CRIAR_END,
   manipulador:({corpo,usuario})=>fornecedor.criar(corpo,usuario),
   detalhe:(req)=>'fornecedor '+req.body.nome},
  {metodo:'PUT', caminho:'/api/fornecedores/:id', permissao:EDITAR,
   manipulador:({params,corpo})=> corpo.nome!==undefined
     ? fornecedor.renomear(params.id,corpo.nome)
     : fornecedor.atualizar(params.id,corpo),
   detalhe:(req)=>req.body.nome!==undefined?('renomeou para '+req.body.nome):null},

  {metodo:'GET', caminho:'/api/tecidos', permissao:LER,
   manipulador:()=>tecido.listarTecidos()},
  {metodo:'POST', caminho:'/api/tecidos', permissao:EDITAR,
   manipulador:({corpo})=>tecido.criarTecido(corpo),
   detalhe:(req,d)=>'tecido '+(d&&d.codigo)},
  {metodo:'PUT', caminho:'/api/tecidos/:id', permissao:EDITAR,
   manipulador:({params,corpo})=>tecido.atualizarTecido(params.id,corpo)},

  // ── Endereco ───────────────────────────────────────────────────────────
  {metodo:'GET', caminho:'/api/armazens', permissao:LER,
   manipulador:()=>endereco.listarArmazens()},
  {metodo:'GET', caminho:'/api/enderecos/:armazem', permissao:LER,
   manipulador:({params})=>endereco.arvore(params.armazem)},

  /* CRIAR e da bancada (endereco.criar); RENOMEAR e APAGAR continuam da
     chefia. A assimetria e a regra: o buraco novo na prateleira aparece com o
     tubo ja na mao, e endereco que nao da para criar na hora vira rolo sem
     endereco. Arrumar um nome torto, nao — isso espera. */
  {metodo:'POST', caminho:'/api/hastes', permissao:CRIAR_END,
   manipulador:({corpo,usuario})=>endereco.criarHaste(corpo,usuario),
   detalhe:(req)=>req.body.armazem_chave+' haste '+req.body.nome},
  {metodo:'PUT', caminho:'/api/hastes/:id', permissao:EDITAR,
   manipulador:({params,corpo})=>dHaste.atualizar(params.id,corpo),
   detalhe:(req)=>req.body.nome!==undefined?('renomeou para '+req.body.nome):null},

  {metodo:'POST', caminho:'/api/andares', permissao:CRIAR_END,
   manipulador:({corpo,usuario})=>endereco.criarAndar(corpo,usuario),
   detalhe:(req)=>'andar '+req.body.nome},
  {metodo:'PUT', caminho:'/api/andares/:id', permissao:EDITAR,
   manipulador:({params,corpo})=>dAndar.atualizar(params.id,corpo),
   detalhe:(req)=>req.body.nome!==undefined?('renomeou para '+req.body.nome):null},

  {metodo:'POST', caminho:'/api/niveis', permissao:CRIAR_END,
   manipulador:({corpo,usuario})=>endereco.criarNivel(corpo,usuario),
   detalhe:(req)=>'nivel '+req.body.nome},
  {metodo:'PUT', caminho:'/api/niveis/:id', permissao:EDITAR,
   manipulador:({params,corpo})=>dNivel.atualizar(params.id,corpo),
   detalhe:(req)=>req.body.nome!==undefined?('renomeou para '+req.body.nome):null},

  // ── Motivos de recusa e condicoes da sobra ─────────────────────────────
  {metodo:'GET', caminho:'/api/motivos', permissao:LER,
   manipulador:()=>motivo.listarMotivos()},
  {metodo:'POST', caminho:'/api/motivos', permissao:EDITAR,
   manipulador:({corpo})=>motivo.criarMotivo(corpo),
   detalhe:(req)=>'motivo '+req.body.nome},
  {metodo:'PUT', caminho:'/api/motivos/:id', permissao:EDITAR,
   manipulador:({params,corpo})=>motivo.atualizarMotivo(params.id,corpo)},

  {metodo:'GET', caminho:'/api/condicoes', permissao:LER,
   manipulador:()=>motivo.listarCondicoes()},
  {metodo:'PUT', caminho:'/api/condicoes/:chave', permissao:EDITAR,
   manipulador:({params,corpo})=>motivo.atualizarCondicao(params.chave,corpo),
   detalhe:(req)=>'condicao '+req.params.chave}
]};

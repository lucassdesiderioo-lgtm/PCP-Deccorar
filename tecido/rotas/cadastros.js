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
// O tecido carrega o preco do m² (o que da valor as sobras). Dado comercial:
// quem nao tem custo.ver recebe o JSON SEM ele — a poda e do custo.js.
const custo=require('../dominio/custo');

const LER='cadastro.ler', EDITAR='cadastro.editar', CRIAR_END='endereco.criar',
      NOTA='rolo.nota';

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

  /* ── FORNECEDOR — DADO DE ESCRITORIO, e nao de bancada ──────────────────
     ⚠️ A PERMISSAO MUDOU DE `cadastro.ler` PARA `rolo.nota` em 04/09/2026.
     Com `cadastro.ler`, a LISTA INTEIRA de fornecedores chegava ao operador:
     ele tinha a chave para a tela de corte listar tecido e cor, e a lista de
     quem a fabrica compra vinha junto de carona.

     De quem se compra nao e o que o operador precisa para pegar o rolo na
     estante — e e exatamente o tipo de informacao que sai da fabrica junto
     com quem sai. O mesmo vale para a NF e o preco, podados no JSON.

     E o argumento que justificava a bancada criar fornecedor caiu junto: ele
     era "o rolo desce do caminhao de quem ninguem cadastrou, e a alternativa
     nao e esperar". Verdade — mas a alternativa CERTA nunca foi o operador
     cadastrar: e o rolo entrar SEM fornecedor e cair na lista "Sem nota",
     que ja existe e e trabalho de quem fecha compras. */
  {metodo:'GET', caminho:'/api/fornecedores', permissao:NOTA,
   manipulador:()=>fornecedor.listar()},
  {metodo:'POST', caminho:'/api/fornecedores', permissao:NOTA,
   manipulador:({corpo,usuario})=>fornecedor.criar(corpo,usuario),
   detalhe:(req)=>'fornecedor '+req.body.nome},
  {metodo:'PUT', caminho:'/api/fornecedores/:id', permissao:EDITAR,
   manipulador:({params,corpo})=> corpo.nome!==undefined
     ? fornecedor.renomear(params.id,corpo.nome)
     : fornecedor.atualizar(params.id,corpo),
   detalhe:(req)=>req.body.nome!==undefined?('renomeou para '+req.body.nome):null},

  {metodo:'GET', caminho:'/api/tecidos', permissao:LER,
   manipulador:({usuario})=>custo.podar(usuario,tecido.listarTecidos())},
  {metodo:'POST', caminho:'/api/tecidos', permissao:EDITAR,
   manipulador:({corpo,usuario})=>custo.podar(usuario,tecido.criarTecido(corpo)),
   detalhe:(req,d)=>'tecido '+(d&&d.codigo)},
  {metodo:'PUT', caminho:'/api/tecidos/:id', permissao:EDITAR,
   manipulador:({params,corpo,usuario})=>custo.podar(usuario,tecido.atualizarTecido(params.id,corpo))},

  /* O PRECO DO M² DO TECIDO — o numero que responde "quanto temos em reais de
     sobra". Porta propria, com historico: mudar isto muda o valor de todas
     as sobras do tecido de uma vez. A tela so mostra o botao a quem ve custo;
     a chave e a de editar cadastro, porque e cadastro. */
  {metodo:'PUT', caminho:'/api/tecidos/:id/preco', permissao:EDITAR,
   manipulador:({params,corpo,usuario})=>custo.podar(usuario,tecido.definirPreco(params.id,corpo.preco_m2,usuario.nome)),
   detalhe:(req,d)=>d?'preco do m² de '+d.codigo+': '+
     (d.mudou?(d.preco_anterior==null?'sem preco':'R$ '+d.preco_anterior)+' → R$ '+d.preco_m2:'sem mudanca'):null},
  {metodo:'GET', caminho:'/api/tecidos/:id/preco/historico', permissao:'custo.ver',
   manipulador:({params})=>tecido.historicoPreco(params.id)},

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

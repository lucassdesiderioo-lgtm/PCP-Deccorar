// As rotas de quem compra: revendas, carteiras, tabelas A/B/C, limite de
// credito, calendario e prazo. Sem SQL e sem 'if' de negocio — cada
// manipulador so traduz o pedido HTTP numa chamada do dominio.
const revenda=require('../dominio/revenda');
const prazo=require('../dominio/prazo');
const pessoas=require('../nucleo/pessoas');
const config=require('../nucleo/config');
// O limite de credito e dinheiro: quem nao ve custo nao recebe o campo. A
// poda e do custo.js, e vale aqui como vale no rolo — nao adianta esconder
// na tela e mandar pelo fio.
const custo=require('../dominio/custo');

const LER='revenda.ler', EDITAR='revenda.editar', CREDITO='credito.editar',
      PRECO='catalogo.editar', CAL='parametro.editar', VER='catalogo.ler';

module.exports={rotas:[

  /* ⚠️ AS ROTAS DE NOME FIXO VEM ANTES DE /:id. O Express casa na ordem em
     que sao registradas, e /api/revendas/:id engoliria "carteiras" como se
     fosse um id — respondendo revenda_inexistente para a tela que pede a
     carteira. E o tipo de defeito que so aparece depois de a tela estar
     pronta, e que se explica mal. */
  {metodo:'GET', caminho:'/api/revendas/carteiras', permissao:LER,
   manipulador:({usuario})=>custo.podar(usuario,revenda.carteiras())},
  {metodo:'GET', caminho:'/api/revendas/limites-vencidos', permissao:LER,
   manipulador:({usuario})=>custo.podar(usuario,revenda.limitesVencidos())},

  {metodo:'GET', caminho:'/api/revendas', permissao:LER,
   manipulador:({query,usuario})=>custo.podar(usuario,revenda.listar(
     query.ativo===undefined?{}:{ativo:query.ativo==='1'}))},
  {metodo:'GET', caminho:'/api/revendas/:id', permissao:LER,
   manipulador:({params,usuario})=>custo.podar(usuario,revenda.porId(params.id))},

  {metodo:'POST', caminho:'/api/revendas', permissao:EDITAR,
   manipulador:({corpo,usuario})=>custo.podar(usuario,revenda.criar(corpo,usuario)),
   detalhe:(req)=>'revenda '+req.body.nome_fantasia},
  {metodo:'PUT', caminho:'/api/revendas/:id', permissao:EDITAR,
   manipulador:({params,corpo,usuario})=>custo.podar(usuario,revenda.editar(params.id,corpo,usuario)),
   detalhe:(req,d)=>d?'revenda '+d.nome_fantasia:null},

  /* O VENDEDOR TEM PORTA PROPRIA, e nao e capricho: trocar quem cuida de uma
     revenda e decisao, e o nome do anterior fica gravado como historia. */
  {metodo:'PUT', caminho:'/api/revendas/:id/vendedor', permissao:EDITAR,
   manipulador:({params,corpo,usuario})=>custo.podar(usuario,
     revenda.definirVendedor(params.id,corpo.vendedor_usuario_id,usuario)),
   detalhe:(req,d)=>d?('vendedor de '+d.nome_fantasia+': '+(d.vendedor_nome||'— nenhum —')):null},

  /* ── O LIMITE DE CREDITO ────────────────────────────────────────────────
     Chave propria (`credito.editar`), separada de `revenda.editar`: uma diz
     quanto a revenda paga, a outra quanto ela pode dever. E as duas escritas
     gravam historico. */
  {metodo:'PUT', caminho:'/api/revendas/:id/limite', permissao:CREDITO,
   manipulador:({params,corpo,usuario})=>custo.podar(usuario,
     revenda.definirLimite(params.id,corpo.valor_limite_credito_centavos,usuario)),
   detalhe:(req,d)=>d&&d.mudou?('limite de '+d.nome_fantasia+': '+
     (d.limite_anterior==null?'sem limite':d.limite_anterior)+' → '+
     d.valor_limite_credito_centavos+' centavos'):null},
  {metodo:'POST', caminho:'/api/revendas/:id/limite/revisar', permissao:CREDITO,
   manipulador:({params,usuario})=>custo.podar(usuario,revenda.revisarLimite(params.id,usuario)),
   detalhe:(req,d)=>d?('revisou o limite de '+d.nome_fantasia):null},
  {metodo:'GET', caminho:'/api/revendas/:id/limite/historico', permissao:CREDITO,
   manipulador:({params})=>revenda.historicoLimite(params.id)},

  // ── Enderecos de entrega ────────────────────────────────────────────────
  {metodo:'POST', caminho:'/api/revendas/:id/enderecos', permissao:EDITAR,
   manipulador:({params,corpo})=>revenda.criarEndereco(
     Object.assign({},corpo,{revenda_id:params.id})),
   detalhe:(req)=>'endereco '+req.body.apelido},
  {metodo:'PUT', caminho:'/api/revendas/:id/enderecos/:eid', permissao:EDITAR,
   manipulador:({params,corpo})=>revenda.editarEndereco(params.id,params.eid,corpo)},
  {metodo:'DELETE', caminho:'/api/revendas/:id/enderecos/:eid', permissao:EDITAR,
   manipulador:({params})=>revenda.apagarEndereco(params.id,params.eid),
   detalhe:(req)=>'apagou o endereco '+req.params.eid},

  // ── Contatos ────────────────────────────────────────────────────────────
  {metodo:'POST', caminho:'/api/revendas/:id/contatos', permissao:EDITAR,
   manipulador:({params,corpo})=>revenda.criarContato(
     Object.assign({},corpo,{revenda_id:params.id})),
   detalhe:(req)=>'contato '+req.body.nome},
  {metodo:'PUT', caminho:'/api/revendas/:id/contatos/:cid', permissao:EDITAR,
   manipulador:({params,corpo})=>revenda.editarContato(params.id,params.cid,corpo)},
  {metodo:'DELETE', caminho:'/api/revendas/:id/contatos/:cid', permissao:EDITAR,
   manipulador:({params})=>revenda.apagarContato(params.id,params.cid),
   detalhe:(req)=>'apagou o contato '+req.params.cid},

  /* ── AS TABELAS A/B/C ───────────────────────────────────────────────────
     Ler e de quem ve revenda; mudar o percentual e `catalogo.editar` — a
     mesma chave do preco do m² da colecao, porque e a mesma coisa: preco.
     Nao ha chave nova aqui de proposito; chave a mais que ninguem tem e
     403 para todo mundo sem erro e sem log (armadilha #13). */
  {metodo:'GET', caminho:'/api/tabelas', permissao:LER,
   manipulador:()=>revenda.tabelas()},
  {metodo:'PUT', caminho:'/api/tabelas/:id/desconto', permissao:PRECO,
   manipulador:({params,corpo,usuario})=>revenda.definirDescontoTabela(
     params.id,corpo.desconto_centesimos,usuario),
   detalhe:(req,d)=>d&&d.mudou?('tabela '+d.nome+': '+
     (d.desconto_anterior==null?'sem percentual':d.desconto_anterior)+' → '+
     d.desconto_centesimos+' centesimos de %'):null},
  {metodo:'GET', caminho:'/api/tabelas/:id/historico', permissao:'custo.ver',
   manipulador:({params})=>revenda.historicoTabela(params.id)},

  {metodo:'GET', caminho:'/api/formas-pagamento', permissao:LER,
   manipulador:()=>revenda.formasPagamento()},

  /* A LISTA DE GENTE DO PCP, so para escolher o vendedor da carteira. Quem
     pode ver e quem pode trocar o vendedor — a lista de nomes da fabrica nao
     tem o que fazer na tela de quem so le a carteira. */
  {metodo:'GET', caminho:'/api/pessoas', permissao:EDITAR,
   manipulador:()=>pessoas.listar()},

  /* ── O CALENDARIO E O PRAZO ─────────────────────────────────────────────
     Ler e de quem usa o simulador: o vendedor diz o prazo a revenda ao
     telefone, e sem esta rota ele teria que contar no calendario da parede.
     Cadastrar feriado e mexer nos parametros e `parametro.editar`, a chave
     da chefia — feriado errado empurra o prazo de todos os pedidos. */
  {metodo:'GET', caminho:'/api/prazo', permissao:VER,
   manipulador:({query})=>{
     const r=prazo.calcular(query.envio||null);
     /* O parametro de DIA DA SEMANA sai decorado com o nome do dia. A tela
        mostrava "3 0 a 6" — o valor colado na unidade —, e "3" sozinho e um
        numero que quem confere tem que traduzir de cabeca. Quem sabe o nome
        dos dias e o dominio do prazo, nao a tela: uma segunda lista de dias
        no navegador seria a mesma coisa dita em dois lugares. */
     const DIAS=r.dia_da_semana;
     const parametros=config.listar()
       .filter(p=>p.chave.indexOf('prazo')===0)
       .map(p=>Object.assign({},p, /DiaSemana$/.test(p.chave)
         ? {valor_extenso:p.valor+' · '+(DIAS[Number(p.valor)]||'?')} : {}));
     return {prazo:r, parametros};
   }},
  {metodo:'GET', caminho:'/api/feriados', permissao:VER,
   manipulador:({query})=>prazo.listarFeriados(query.ano)},
  {metodo:'POST', caminho:'/api/feriados', permissao:CAL,
   manipulador:({corpo,usuario})=>prazo.criarFeriado(corpo,usuario),
   detalhe:(req)=>'feriado '+req.body.data+' — '+req.body.nome},
  {metodo:'DELETE', caminho:'/api/feriados/:data', permissao:CAL,
   manipulador:({params})=>prazo.apagarFeriado(params.data),
   detalhe:(req)=>'apagou o feriado '+req.params.data}
]};

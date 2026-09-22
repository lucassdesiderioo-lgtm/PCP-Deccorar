// As rotas do pedido. Sem SQL e sem 'if' de negocio — cada manipulador so
// traduz o pedido HTTP numa chamada do dominio.
//
// ⚠️ A CHAVE DE CADA ROTA E O QUE ELA CUSTA SE DER ERRADO, e nao o assunto
// dela. Enviar e lancar (`pedido.lancar`); aprovar e outra coisa, porque e a
// aprovacao que manda a peca para a fabrica; cancelar e a terceira, porque
// desfaz o que a fabrica ja viu.
const pedido=require('../dominio/pedido');
const pdf=require('../dominio/pedido_pdf');
const custo=require('../dominio/custo');

const LER='pedido.ler', LANCAR='pedido.lancar', APROVAR='pedido.aprovar',
      PRAZO='pedido.prazo', CANCELAR='pedido.cancelar';

/* ⚠️ O PEDIDO E DINHEIRO DA PRIMEIRA A ULTIMA LINHA, e por isso TODA leitura
   passa pela poda do custo.js. Ela corta por PADRAO DE NOME
   (preco|valor|custo|...), e e por isso que os campos daqui se chamam
   `valor_total_centavos` e `preco_unitario_centavos` — um `total_centavos`
   viajaria pelo fio para quem nao tem `custo.ver` (CLAUDE.md §19). */
const podar=(usuario,dados)=>custo.podar(usuario,dados);

module.exports={rotas:[

  /* ⚠️ AS ROTAS DE NOME FIXO VEM ANTES DE /:id — /api/pedidos/:id engoliria
     "fila" como se fosse um id, e responderia pedido_inexistente para a tela
     que pede a fila do vendedor. */
  {metodo:'GET', caminho:'/api/pedidos/fila', permissao:LER,
   manipulador:({usuario})=>podar(usuario,pedido.fila(usuario))},
  {metodo:'GET', caminho:'/api/pedidos/proximo-numero', permissao:LANCAR,
   manipulador:()=>({numero:pedido.proximoNumero()})},

  {metodo:'GET', caminho:'/api/pedidos', permissao:LER,
   manipulador:({query,usuario})=>podar(usuario,pedido.listar({
     marco:query.marco, tipo:query.tipo,
     revenda_id:query.revenda_id, vendedor_usuario_id:query.vendedor_usuario_id}))},
  {metodo:'GET', caminho:'/api/pedidos/:id', permissao:LER,
   manipulador:({params,usuario})=>podar(usuario,pedido.porId(Number(params.id)))},

  /* A FOLHA QUE A REVENDA CONFERE. E um GET que vira papel, entao vai
     auditado como a etiqueta de sobra: gasta tinta e vira compromisso. */
  {metodo:'GET', caminho:'/api/pedidos/:id/pdf', permissao:LER, tipo:'pdf',
   manipulador:({params})=>pdf.gerar(pedido.porId(Number(params.id))),
   detalhe:(req)=>'folha do pedido '+req.params.id},

  {metodo:'POST', caminho:'/api/pedidos', permissao:LANCAR,
   manipulador:({corpo,usuario})=>podar(usuario,pedido.criar(corpo,usuario)),
   detalhe:(req,d)=>d?('pedido '+d.id+' para '+d.revenda.nome_fantasia):null},
  {metodo:'PUT', caminho:'/api/pedidos/:id', permissao:LANCAR,
   manipulador:({params,corpo,usuario})=>podar(usuario,pedido.editar(Number(params.id),corpo,usuario))},
  {metodo:'POST', caminho:'/api/pedidos/:id/virar-pedido', permissao:LANCAR,
   manipulador:({params,usuario})=>podar(usuario,pedido.virarPedido(Number(params.id),usuario)),
   detalhe:(req,d)=>d?('orcamento '+d.id+' virou pedido'):null},

  {metodo:'POST', caminho:'/api/pedidos/:id/itens', permissao:LANCAR,
   manipulador:({params,corpo,usuario})=>podar(usuario,
     pedido.acrescentarItem(Number(params.id),corpo,usuario))},
  {metodo:'PUT', caminho:'/api/pedidos/:id/itens/:item', permissao:LANCAR,
   manipulador:({params,corpo,usuario})=>podar(usuario,
     pedido.editarItem(Number(params.id),Number(params.item),corpo,usuario))},
  {metodo:'DELETE', caminho:'/api/pedidos/:id/itens/:item', permissao:LANCAR,
   manipulador:({params,usuario})=>pedido.removerItem(Number(params.id),Number(params.item),usuario)},
  /* Cancelar peca NAO e apagar peca, e por isso a chave e outra: apagar so
     existe no rascunho que nunca foi enviado; cancelar mexe em pedido que a
     revenda ja tem por escrito, e na fabrica que talvez ja o tenha visto. */
  {metodo:'POST', caminho:'/api/pedidos/:id/itens/:item/cancelar', permissao:CANCELAR,
   manipulador:({params,corpo,usuario})=>podar(usuario,
     pedido.cancelarItem(Number(params.id),Number(params.item),corpo.motivo,usuario)),
   detalhe:(req)=>'cancelou a peca '+req.params.item+' do pedido '+req.params.id+
     ': '+(req.body&&req.body.motivo)},

  {metodo:'POST', caminho:'/api/pedidos/:id/enviar', permissao:LANCAR,
   manipulador:({params,usuario})=>podar(usuario,pedido.enviar(Number(params.id),usuario)),
   detalhe:(req,d)=>d?('enviou o pedido '+d.numero+' · '+(d.preco.valor_total||'?')):null},
  {metodo:'POST', caminho:'/api/pedidos/:id/reabrir', permissao:LANCAR,
   manipulador:({params,corpo,usuario})=>podar(usuario,
     pedido.reabrir(Number(params.id),corpo.motivo,usuario)),
   detalhe:(req)=>'reabriu o pedido '+req.params.id+': '+(req.body&&req.body.motivo)},

  {metodo:'POST', caminho:'/api/pedidos/:id/aprovar', permissao:APROVAR,
   manipulador:({params,usuario})=>podar(usuario,pedido.aprovar(Number(params.id),usuario)),
   detalhe:(req,d)=>d?('aprovou o pedido '+d.numero):null},
  {metodo:'POST', caminho:'/api/pedidos/:id/cancelar', permissao:CANCELAR,
   manipulador:({params,corpo,usuario})=>podar(usuario,
     pedido.cancelar(Number(params.id),corpo.motivo,usuario)),
   detalhe:(req)=>'cancelou o pedido '+req.params.id+': '+(req.body&&req.body.motivo)},

  {metodo:'POST', caminho:'/api/pedidos/:id/prazo', permissao:PRAZO,
   manipulador:({params,corpo,usuario})=>podar(usuario,
     pedido.negociarPrazo(Number(params.id),corpo,usuario)),
   detalhe:(req)=>'prazo do pedido '+req.params.id+' para '+(req.body&&req.body.para)+
     ': '+(req.body&&req.body.motivo)}
]};

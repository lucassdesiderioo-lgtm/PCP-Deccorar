// As rotas do boleto e do credito (secao 4.13, fase 6-C1). Sem SQL e sem 'if'
// de negocio — quem decide e o `dominio/boleto.js`.
//
// ⚠️ LER E EDITAR SAO CHAVES DIFERENTES, e e aqui que isso vira efeito. O
// VENDEDOR le: a §4.13 manda uma tarefa semanal dele com o financeiro sobre
// os boletos em aberto da carteira. Lancar e baixar decidem o limite de todo
// mundo, e sao de quem responde pelo dinheiro — hoje o diretor, pelo `*`.
//
// ⚠️ TUDO PASSA PELA PODA DO CUSTO. A resposta e cheia de campo de dinheiro,
// e a poda corta por PADRAO DE NOME (§19): quem nao tem `custo.ver` recebe o
// JSON sem eles. Nao adianta esconder na tela e mandar pelo fio (regra 14 do
// §13 do CLAUDE.md) — e a `estourado` NAO e dinheiro, entao a marca continua
// chegando a quem so ve a cor.
const boleto=require('../dominio/boleto');
const custo=require('../dominio/custo');

const LER='boleto.ler', EDITAR='boleto.editar';
const podar=(usuario,dados)=>custo.podar(usuario,dados);

module.exports={rotas:[

  /* ⚠️ A CARTEIRA VEM ANTES DE `/:id`, e a ordem e a mesma armadilha que o
     `/api/revendas/carteiras` documenta: registrada depois, a rota com
     parametro engoliria "carteira" como se fosse um id. */
  {metodo:'GET', caminho:'/api/boletos/carteira', permissao:LER,
   manipulador:({usuario})=>podar(usuario,boleto.carteira(usuario))},

  {metodo:'GET', caminho:'/api/boletos', permissao:LER,
   manipulador:({query,usuario})=>podar(usuario,boleto.listar({
     revenda_id:query.revenda!==undefined?Number(query.revenda):undefined,
     situacao:query.situacao
   }))},

  {metodo:'GET', caminho:'/api/revendas/:id/credito', permissao:LER,
   manipulador:({params,usuario})=>podar(usuario,boleto.credito(Number(params.id)))},

  {metodo:'POST', caminho:'/api/boletos', permissao:EDITAR,
   manipulador:({corpo,usuario})=>podar(usuario,boleto.lancar(corpo,usuario)),
   detalhe:(req)=>'boleto '+(req.body&&req.body.numero)+
     ' · revenda '+(req.body&&req.body.revenda_id)},

  {metodo:'POST', caminho:'/api/boletos/:id/baixa', permissao:EDITAR,
   manipulador:({params,corpo,usuario})=>podar(usuario,boleto.baixar(Number(params.id),corpo,usuario)),
   detalhe:(req)=>'baixa no boleto '+req.params.id},

  {metodo:'POST', caminho:'/api/boletos/:id/reabrir', permissao:EDITAR,
   manipulador:({params,corpo,usuario})=>podar(usuario,
     boleto.reabrir(Number(params.id),corpo&&corpo.motivo,usuario)),
   detalhe:(req)=>'desfez a baixa do boleto '+req.params.id+
     ' · '+(req.body&&req.body.motivo)},

  {metodo:'POST', caminho:'/api/boletos/:id/cancelar', permissao:EDITAR,
   manipulador:({params,corpo,usuario})=>podar(usuario,
     boleto.cancelar(Number(params.id),corpo&&corpo.motivo,usuario)),
   detalhe:(req)=>'cancelou o boleto '+req.params.id+
     ' · '+(req.body&&req.body.motivo)}

]};

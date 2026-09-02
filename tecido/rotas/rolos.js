// Rolo: entrada, saldo, ajuste e o acerto no fim.
const rolo=require('../dominio/rolo');

module.exports={rotas:[
  {metodo:'GET', caminho:'/api/rolos', permissao:'rolo.ler',
   manipulador:({query})=>rolo.listar(query)},

  {metodo:'GET', caminho:'/api/rolos/saldo', permissao:'rolo.ler',
   manipulador:()=>rolo.saldoPorTecido()},

  {metodo:'GET', caminho:'/api/rolos/:id/movimentos', permissao:'rolo.ler',
   manipulador:({params})=>rolo.movimentos(params.id)},

  {metodo:'POST', caminho:'/api/rolos', permissao:'rolo.entrada',
   manipulador:({corpo,usuario})=>rolo.entrada(corpo,usuario.nome),
   detalhe:(req,d)=>'entrada '+(d&&d.codigo)+' · '+(d&&d.metragem_inicial)+' m · bobina '+(d&&d.largura)},

  {metodo:'POST', caminho:'/api/rolos/:id/encerrar', permissao:'rolo.encerrar',
   manipulador:({params,usuario})=>rolo.encerrar(params.id,usuario.nome),
   detalhe:(req)=>'rolo acabou: '+req.params.id},

  {metodo:'POST', caminho:'/api/rolos/:id/ajustar', permissao:'rolo.ajustar',
   manipulador:({params,corpo,usuario})=>rolo.ajustar(params.id,corpo.saldo,corpo.observacao,usuario.nome),
   detalhe:(req)=>'ajuste do rolo '+req.params.id+' para '+req.body.saldo+' m: '+(req.body.observacao||'')}
]};

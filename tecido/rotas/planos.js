// O plano de corte. Repare que CALCULAR e CONFIRMAR sao permissoes
// diferentes: propor um corte e barato, baixar o estoque nao e.
const plano=require('../dominio/plano');

module.exports={rotas:[
  {metodo:'POST', caminho:'/api/planos/calcular', permissao:'plano.calcular',
   manipulador:({corpo})=>plano.calcular(corpo)},

  {metodo:'POST', caminho:'/api/planos/recusar', permissao:'plano.calcular',
   manipulador:({corpo,usuario})=>plano.recusar(corpo,usuario.nome),
   detalhe:(req)=>'recusou a sobra '+req.body.sobra_id+' (motivo '+req.body.motivo_id+')'},

  {metodo:'POST', caminho:'/api/planos/confirmar', permissao:'plano.confirmar',
   manipulador:({corpo,usuario})=>plano.confirmar(corpo,usuario.nome),
   detalhe:(req,d)=>'plano '+(d&&d.plano_id)+' confirmado · '+(d&&d.consumo_linear)+' m · '+
     (d&&d.sobras_criadas)+' sobra(s) nova(s)'},

  {metodo:'GET', caminho:'/api/planos', permissao:'plano.calcular',
   manipulador:({query})=>plano.historico(query.limite)}
]};

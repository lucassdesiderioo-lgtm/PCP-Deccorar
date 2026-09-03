// Tabela 'fornecedor'. De quem o rolo veio.
//
// Era texto livre no rolo, e por isso nao existia comparacao entre
// fornecedores: 'Ecotex', 'ecotex' e 'Ecotex Ltda' somam separado.
module.exports=require('./_lista')({tabela:'fornecedor',
  // quem criou e se a chefia ja conferiu (a bancada tambem cria)
  extras:['criado_por','criado_em','conferir']});

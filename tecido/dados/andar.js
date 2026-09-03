// Tabela 'andar' — nivel 2 do endereco.
module.exports=require('./_lista')({tabela:'andar', pai:'haste_id',
  // quem criou e se a chefia ja conferiu (a bancada tambem cria)
  extras:['criado_por','criado_em','conferir']});

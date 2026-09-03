// Tabela 'nivel' — nivel 3 do endereco. E ele que rolo e sobra apontam:
// endereco final = nivel_id.
module.exports=require('./_lista')({tabela:'nivel', pai:'andar_id',
  // quem criou e se a chefia ja conferiu (a bancada tambem cria)
  extras:['criado_por','criado_em','conferir']});

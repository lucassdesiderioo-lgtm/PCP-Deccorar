// Tabela 'haste' — nivel 1 do endereco, dentro de um armazem.
module.exports=require('./_lista')({tabela:'haste', pai:'armazem_chave',
  // quem criou e se a chefia ja conferiu (a bancada tambem cria)
  extras:['criado_por','criado_em','conferir']});

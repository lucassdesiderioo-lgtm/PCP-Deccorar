// Os tres numeros que governam o plano de corte. Ler e de todos; editar e
// so do diretor — mexer no peso da sobra muda qual bobina o sistema escolhe
// para a fabrica inteira.
const config=require('../nucleo/config');

module.exports={rotas:[
  {metodo:'GET', caminho:'/api/parametros', permissao:'parametro.ler',
   manipulador:()=>config.listar()},

  {metodo:'PUT', caminho:'/api/parametros/:chave', permissao:'parametro.editar',
   manipulador:({params,corpo,usuario})=>config.gravar(params.chave,corpo.valor,usuario.nome),
   detalhe:(req)=>req.params.chave+' = '+req.body.valor}
]};

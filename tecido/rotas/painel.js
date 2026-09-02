// Painel e relatorios. So leitura.
const painel=require('../dominio/painel');

module.exports={rotas:[
  {metodo:'GET', caminho:'/api/painel/estoque',  permissao:'painel.ler', manipulador:()=>painel.estoque()},
  {metodo:'GET', caminho:'/api/painel/encalhe',  permissao:'painel.ler', manipulador:({query})=>painel.encalhe(query.limite)},
  {metodo:'GET', caminho:'/api/painel/refugo',   permissao:'painel.ler', manipulador:()=>painel.refugo()},
  {metodo:'GET', caminho:'/api/painel/recusas',  permissao:'painel.ler', manipulador:()=>painel.recusas()},
  {metodo:'GET', caminho:'/api/painel/cortes',   permissao:'painel.ler', manipulador:()=>painel.cortes()}
]};

// Painel e relatorios. So leitura.
const painel=require('../dominio/painel');
const giro=require('../dominio/giro');
const custo=require('../dominio/custo');
const {pode}=require('../nucleo/permissoes');

module.exports={rotas:[
  /* O GIRO: o que sai, quanto por dia, e quanto tempo o estoque aguenta.
     A poda do preco vale aqui tambem — a lista "sem saida" carrega o valor
     parado, e valor e preco. Quem nao tem custo.ver recebe o JSON sem ele. */
  {metodo:'GET', caminho:'/api/painel/giro', permissao:'painel.ler',
   manipulador:({query,usuario})=>{
     const d=giro.painel(query.dias);
     return pode(usuario,'custo.ver')?d:custo.semPreco(d);
   }},

  {metodo:'GET', caminho:'/api/painel/estoque',  permissao:'painel.ler', manipulador:()=>painel.estoque()},
  {metodo:'GET', caminho:'/api/painel/encalhe',  permissao:'painel.ler', manipulador:({query})=>painel.encalhe(query.limite)},
  {metodo:'GET', caminho:'/api/painel/refugo',   permissao:'painel.ler', manipulador:()=>painel.refugo()},
  {metodo:'GET', caminho:'/api/painel/recusas',  permissao:'painel.ler', manipulador:()=>painel.recusas()},
  {metodo:'GET', caminho:'/api/painel/cortes',   permissao:'painel.ler', manipulador:()=>painel.cortes()}
]};

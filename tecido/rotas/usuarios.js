// Pessoas e PINs. Tudo sob 'usuario.editar' — que so o diretor tem.
// O PIN nunca sai daqui: o dominio devolve id, nome, papel e ativo, e mais nada.
const usuario=require('../dominio/usuario');
const {CHAVES,PAPEIS,pode}=require('../nucleo/permissoes');

module.exports={rotas:[
  {metodo:'GET', caminho:'/api/usuarios', permissao:'usuario.editar',
   manipulador:()=>usuario.listar()},

  {metodo:'POST', caminho:'/api/usuarios', permissao:'usuario.editar',
   manipulador:({corpo})=>usuario.criar(corpo),
   detalhe:(req)=>'pessoa '+req.body.nome+' ('+(req.body.papel||'cortador')+')'},

  {metodo:'PUT', caminho:'/api/usuarios/:id', permissao:'usuario.editar',
   manipulador:({params,corpo})=>usuario.atualizar(params.id,corpo),
   detalhe:(req)=>'pessoa '+req.params.id+(req.body.pin?' (PIN trocado)':'')},

  // Quem existe no PCP, com a marca de quem ja pode usar este modulo.
  {metodo:'GET', caminho:'/api/usuarios/pcp', permissao:'usuario.editar',
   manipulador:()=>usuario.doPcp()},

  // Liberar (ou trocar o papel de) uma pessoa do PCP. Nao cria senha: a
  // credencial continua sendo a de la.
  {metodo:'POST', caminho:'/api/usuarios/pcp', permissao:'usuario.editar',
   manipulador:({corpo})=>usuario.liberarDoPcp(corpo),
   detalhe:(req)=>'liberou '+req.body.nome+' ('+(req.body.papel||'cortador')+') pelo PCP'},

  {metodo:'GET', caminho:'/api/usuarios/login-unico', permissao:'usuario.editar',
   manipulador:()=>({ligado:usuario.loginUnicoLigado()})},

  // O que cada papel enxerga — a tela de pessoas mostra isso ao lado do papel,
  // para quem escolhe saber o que esta dando.
  {metodo:'GET', caminho:'/api/papeis', permissao:'usuario.editar',
   manipulador:()=>Object.keys(PAPEIS).map(papel=>({
     papel,
     permissoes:CHAVES.filter(c=>pode({papel},c.chave)).map(c=>c.nome)
   }))}
]};

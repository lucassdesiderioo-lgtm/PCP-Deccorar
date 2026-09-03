// QUEM SOU EU AQUI DENTRO.
//
// O PCP ja sabe o nome de quem entrou; o que so este modulo sabe e o PAPEL —
// o resultado de traduzir as areas em bancada ou chefia. A barra de sessao e
// o menu leem daqui para nao oferecer botao que a pessoa nao pode apertar.
//
// Permissao 'cadastro.ler' porque e a chave mais baixa que todo mundo que
// entra tem: quem chegou ate aqui ja passou pelo portao.
const {CHAVES,PAPEIS,pode}=require('../nucleo/permissoes');
const {TELAS}=require('../nucleo/telas');

module.exports={rotas:[
  {metodo:'GET', caminho:'/api/eu', permissao:'cadastro.ler',
   manipulador:({usuario})=>({
     nome:usuario.nome, papel:usuario.papel,
     // As telas que ESTA pessoa alcanca. O menu se monta com isto, entao um
     // botao nunca leva a uma porta fechada — o operador que bate em "sem
     // permissao" tres vezes para de tentar a quarta, mesmo quando podia.
     telas:Object.entries(TELAS)
       .filter(([caminho,t])=>caminho!=='/inicio'&&pode(usuario,t.permissao))
       .map(([caminho])=>caminho),
     permissoes:CHAVES.filter(c=>pode(usuario,c.chave)).map(c=>c.chave)
   })},

  // O QUE CADA PAPEL ALCANCA. Vivia na rota de usuarios, que saiu junto com o
  // cadastro local de pessoas — mas a pergunta continua valendo: a aba "Quem
  // entra" mostra isto ao lado de cada area do PCP, para quem libera saber o
  // que esta dando antes de dar. Liberacao as cegas e como trava sem chave,
  // so pro outro lado.
  {metodo:'GET', caminho:'/api/papeis', permissao:'cadastro.editar',
   manipulador:()=>Object.keys(PAPEIS).map(papel=>({
     papel,
     permissoes:CHAVES.filter(c=>pode({papel},c.chave)).map(c=>c.nome)
   }))}
]};

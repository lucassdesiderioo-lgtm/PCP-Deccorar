// A PORTA UNICA POR ONDE A LISTA DE GENTE DO PCP ENTRA NESTE MODULO.
//
// O vendedor de uma revenda e uma pessoa do PCP (secao 4.12 da spec). O
// `tecido.db` nao enxerga o `dados.db`, e nao deve: banco proprio e o que faz
// este modulo se reconstruir sozinho num banco novo, e o `montar.js` diz que
// a juncao com o PCP e de PORTA, nao de miolo.
//
// ⚠️ POR QUE NAO UM CADASTRO DE VENDEDOR AQUI DENTRO. Seriam dois lugares
// para lembrar de desligar alguem: tirar a pessoa no PCP e esquecer daqui e
// o furo que nenhum log acusa. Foi exatamente por isso que este modulo
// deixou de ter cadastro de pessoas em 02/09/2026 (CLAUDE.md §19) — e o
// terceiro defeito daquele dia, o beco sem saida, nasceu da mesma raiz.
//
// ⚠️ A PORTA ENTREGA id E nome, E SO. O mapeamento abaixo e explicito de
// proposito: mesmo que o PCP passe a linha inteira de `usuarios`, o que
// atravessa continua sendo dois campos. PIN, hash, salt e areas nao tem o
// que fazer deste lado, e "o que nao atravessa nao vaza".
//
// ⚠️ SEM A PORTA, RECUSA — NUNCA LISTA VAZIA. Lista vazia em silencio faria
// a tela dizer "nenhuma pessoa cadastrada" sobre uma fabrica cheia de gente,
// e alguem passaria a tarde procurando no lugar errado. E a licao da
// armadilha #13: a ponta que some em silencio e sempre a ultima.
const {ErroDeRegra}=require('./erros');

let porta=null;

// Chamada uma vez, no montar(). `null` desliga — e os testes usam isso para
// provar justamente o caso de ela nao estar ligada.
const ligar=fn=>{ porta=(typeof fn==='function')?fn:null; };
const ligada=()=>!!porta;

function listar(){
  if(!porta) throw new ErroDeRegra('porta_de_pessoas_nao_ligada',
    'A lista de pessoas do PCP nao esta ligada neste servidor. Quem a liga e o server.js, '+
    'na chamada de montar() do /sobmedida.');
  return (porta()||[]).map(p=>({id:Number(p.id), nome:String(p.nome)}));
}

const porId=id=>listar().find(p=>p.id===Number(id))||null;

module.exports={ligar,ligada,listar,porId};

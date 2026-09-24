// A PORTA UNICA POR ONDE A LISTA DE MATERIAL DE COMPRA DO PCP ENTRA NESTE
// MODULO — fase 4-C da spec SOBMEDIDA-PEDIDO-REVENDA.
//
// O tubo da persiana sob medida e o MESMO tubo da medida padrao (decisao do
// dono, 24/09/2026), comprado do mesmo fornecedor, e Compras e um so. Para o
// degrau apontar para ele, o cadastro precisa ver a lista de la — e o
// `tecido.db` nao enxerga o `dados.db`, nem deve: banco proprio e o que faz
// este modulo se reconstruir sozinho, e o `montar.js` diz que a juncao com o
// PCP e de PORTA, nao de miolo.
//
// Mesmo desenho do `pessoas.js`, e de proposito — um segundo jeito de
// atravessar seria um segundo lugar para consertar.
//
// ⚠️ A PORTA ENTREGA id, nome E unidade, E SO. O mapeamento e explicito:
// preco, estoque, minimo e fornecedor sao assunto do Compras, e nao tem o
// que fazer deste lado. O que nao atravessa nao vaza — e a poda do
// `custo.js` nem chega a ser perguntada.
//
// ⚠️ A UNIDADE ATRAVESSA PORQUE ELA E A REGRA, nao informacao. E ela que diz
// como a peca vira quantidade de compra: `m` le a medida de consumo da ficha
// e `un` conta pecas. Sem ela aqui, o cadastro aceitaria ligar um tubo a um
// item vendido por quilo e o numero sairia inventado.
//
// ⚠️ SEM A PORTA, RECUSA — NUNCA LISTA VAZIA. Lista vazia em silencio faria
// a tela do cadastro dizer que o PCP nao tem material nenhum, e alguem
// passaria a tarde procurando no lugar errado. E a licao da armadilha #13: a
// ponta que some em silencio e sempre a ultima.
const {ErroDeRegra}=require('./erros');

let porta=null;

// Chamada uma vez, no montar(). `null` desliga — e os testes usam isso para
// provar justamente o caso de ela nao estar ligada.
const ligar=fn=>{ porta=(typeof fn==='function')?fn:null; };
const ligada=()=>!!porta;

function listar(){
  if(!porta) throw new ErroDeRegra('porta_de_materiais_nao_ligada',
    'A lista de materiais do PCP nao esta ligada neste servidor. Quem a liga e o server.js, '+
    'na chamada de montar() do /sobmedida.');
  return (porta()||[]).map(m=>({
    id:Number(m.id), nome:String(m.nome||''), unidade:String(m.unidade||'')
  }));
}

const porId=id=>listar().find(m=>m.id===Number(id))||null;

// As unidades que uma persiana sabe virar. Fora destas duas o cadastro
// recusa dizendo qual e — converter por chute e o que faz a lista de compras
// pedir numero que ninguem decidiu.
const UNIDADES=['m','un'];

module.exports={ligar,ligada,listar,porId,UNIDADES};

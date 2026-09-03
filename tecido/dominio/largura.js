// AS LARGURAS DE BOBINA QUE A FABRICA COMPRA.
//
// Cadastro pequeno e com poucas regras — mas as tres que tem existem porque
// largura errada nao da erro em lugar nenhum: ela vira um numero plausivel
// que o encaixe usa para decidir de onde cortar, e o defeito aparece na
// bancada, com o tecido ja cortado.
const dLargura=require('../dados/largura');
const {ErroDeRegra,exigir}=require('../nucleo/erros');

// O mesmo teto das pecas (dominio/plano.js). O campo e em METROS: bobina de
// 250 e alguem que digitou centimetro, e o encaixe passaria a achar que cabe
// qualquer coisa nela.
const MAX_M=10;

const numero=v=>Number(String(v==null?'':v).replace(',','.').trim());

function criar(valor){
  const n=numero(valor);
  exigir(isFinite(n)&&n>0,'largura_invalida','Informe a largura da bobina em metros.');
  exigir(n<=MAX_M,'largura_absurda',
    'Largura fora do razoavel: '+n+' m. O campo e em METROS — 2,50 e nao 250.');

  const v=dLargura.arred(n);
  const ja=dLargura.porValor(v);
  if(ja){
    // Ja existe, so estava desligada: religa em vez de recusar. Recusar
    // mandaria o diretor procurar numa lista onde ela nao aparece.
    if(!ja.ativo) return dLargura.ativar(ja.id,1);
    throw new ErroDeRegra('largura_repetida','A largura '+fmt(v)+' m ja esta cadastrada.');
  }
  return dLargura.criar(v);
}

function desativar(id){
  const l=dLargura.porId(id);
  exigir(l,'largura_inexistente','Largura nao encontrada.');
  // A LISTA DESCREVE A PRATELEIRA. Desativar uma largura que ainda tem rolo
  // em uso faria a entrada do proximo rolo daquela bobina cair no campo
  // livre, com aviso de "nao cadastrada" — para uma bobina que a fabrica tem
  // na mao. O aviso perderia o sentido na primeira vez.
  const n=dLargura.rolosCom(l.valor);
  if(n) throw new ErroDeRegra('largura_em_uso',
    'Ha '+n+' rolo(s) em uso com '+fmt(l.valor)+' m. Encerre-os antes de tirar esta largura da lista.');
  return dLargura.ativar(id,0);
}

const reativar=id=>{
  exigir(dLargura.porId(id),'largura_inexistente','Largura nao encontrada.');
  return dLargura.ativar(id,1);
};

const fmt=v=>(Math.round(v*100)/100).toFixed(2).replace('.',',');

/* A lista para a tela, com quantos rolos em uso cada largura tem. O numero e
   o que separa "largura que a fabrica usa" de "largura que alguem cadastrou e
   nunca comprou" — e sem ele o diretor nao tem como limpar a lista. */
const listar=()=>dLargura.listar().map(l=>({...l, rolos:dLargura.rolosCom(l.valor)}));

const ativos=()=>dLargura.ativos();

// A largura DESTA entrada esta na lista? A tela usa para avisar, nunca para
// bloquear: rolo que chegou fora do padrao existe, e recusar a entrada dele
// so faria a bancada lancar com a largura errada para o sistema aceitar.
const cadastrada=valor=>{
  const l=dLargura.porValor(numero(valor));
  return !!(l&&l.ativo);
};

module.exports={criar,desativar,reativar,listar,ativos,cadastrada};

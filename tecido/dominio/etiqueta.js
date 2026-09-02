// A etiqueta da sobra. Dono unico da sequencia e do estado "impressa mas
// ainda nao bipada".
//
// A especificacao original dizia bloco PRE-IMPRESSO e codigo digitado pelo
// operador. O dono mudou: o SISTEMA imprime, em lote sequencial, e a sobra
// nasce quando alguem bipa a etiqueta colada. A diferenca nao e de conforto —
// e o que torna a pendencia EXATA. Com bloco comprado, "colada e nao
// cadastrada" seria um palpite sobre lacunas na numeracao; aqui e uma
// subtracao: o que foi impresso menos o que voltou da bancada.
const db=require('../nucleo/db');
const dia=require('../nucleo/dia');
const {ErroDeRegra,exigir}=require('../nucleo/erros');
const dEtiqueta=require('../dados/etiqueta');

const MAX_LOTE=500;

// 142 -> 'S-000142'. Um lugar so: o codigo impresso e o codigo bipado.
const formatar=seq=>'S-'+String(seq).padStart(6,'0');

// O leitor manda o codigo com sujeira (Tab, espaco, quebra). Limpa aqui, uma
// vez, para a bancada nunca ver "codigo nao encontrado" por causa de um \r.
const limpar=codigo=>String(codigo||'').replace(/[^A-Za-z0-9-]/g,'').toUpperCase();

function imprimirLote(quantidade,usuarioNome){
  const n=Number(quantidade);
  exigir(Number.isInteger(n)&&n>0,'quantidade_invalida','Diga quantas etiquetas imprimir.');
  exigir(n<=MAX_LOTE,'lote_grande','No maximo '+MAX_LOTE+' etiquetas por lote.');

  return db.transaction(()=>{
    const de=dEtiqueta.ultimoSeq()+1, ate=de+n-1;
    const lote_id=dEtiqueta.criarLote(n,de,ate,usuarioNome);
    const codigos=[];
    for(let s=de;s<=ate;s++){
      const codigo=formatar(s);
      dEtiqueta.criar(codigo,s,lote_id);
      codigos.push(codigo);
    }
    return {lote_id, quantidade:n, de_seq:de, ate_seq:ate, codigos};
  })();
}

// Confere ANTES de qualquer gravacao, e devolve o codigo limpo.
//
// A ordem importa: se a sobra fosse inserida primeiro, quem recusaria a
// etiqueta repetida seria o UNIQUE de sobra.codigo — um erro cru do SQLite,
// que chega na bancada como "deu erro aqui dentro, chame o suporte". A frase
// que o cortador precisa e outra: cole outra etiqueta neste retalho.
function conferir(codigo){
  const c=limpar(codigo);
  exigir(c,'codigo_vazio','Bipe ou digite o codigo da etiqueta.');
  const e=dEtiqueta.porCodigo(c);
  // Codigo que o sistema nunca imprimiu quase sempre e digitacao errada — e
  // aceitar isso encheria o acervo de etiqueta que nao existe na prateleira.
  exigir(e,'etiqueta_desconhecida',
    'A etiqueta '+c+' nao foi impressa pelo sistema. Confira o codigo ou imprima um lote novo em Etiquetas.');
  if(e.sobra_id) throw new ErroDeRegra('etiqueta_ja_usada',
    'A etiqueta '+c+' ja esta numa sobra cadastrada. Cole outra etiqueta neste retalho.');
  return c;
}

// Chamada de DENTRO da transacao de sobra.criar, depois do insert.
function reservar(codigo,sobra_id){
  const c=conferir(codigo);
  dEtiqueta.marcarUsada(c,sobra_id,dia.agora());
  return c;
}

module.exports={
  formatar, limpar, imprimirLote, conferir, reservar,
  soltar:dEtiqueta.soltar,
  pendentes:()=>dEtiqueta.pendentes(),
  lotes:()=>dEtiqueta.lotes(),
  doLote:id=>dEtiqueta.doLote(id),
  porCodigo:codigo=>dEtiqueta.porCodigo(limpar(codigo))
};

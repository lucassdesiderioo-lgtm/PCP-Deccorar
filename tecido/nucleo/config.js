// Os parametros do calculo (secao 6.5). Ficam no banco, nunca como constante
// no codigo: mudar o peso da sobra e um campo na tela, nao um deploy.
//
// O cache existe porque o encaixe le estes tres numeros varias vezes por
// plano; ele e invalidado no proprio gravar().
const db=require('./db');
const {ErroDeRegra}=require('./erros');
const dia=require('./dia');

let cache=null;

function todos(){
  if(cache) return cache;
  const linhas=db.prepare('SELECT * FROM parametro ORDER BY ordem, chave').all();
  cache={};
  for(const p of linhas) cache[p.chave]=p.tipo==='numero'?Number(p.valor):p.valor;
  return cache;
}

const ler=chave=>{
  const v=todos()[chave];
  if(v===undefined) throw new ErroDeRegra('parametro_inexistente','Parametro "'+chave+'" nao existe.');
  return v;
};

// Os tres numeros que o encaixe precisa, num objeto so.
const paramsDeCorte=()=>({
  margem:ler('margem'),
  larguraMinimaSobra:ler('larguraMinimaSobra'),
  alturaMinimaSobra:ler('alturaMinimaSobra'),
  pesoSobra:ler('pesoSobra')
});

function listar(){
  return db.prepare('SELECT chave,valor,tipo,rotulo,ajuda,unidade,alterado_em,alterado_por FROM parametro ORDER BY ordem, chave').all();
}

/* ⚠️ O TETO E POR CHAVE, e ele e parte da regra — nao enfeite.
   Um parametro aceito fora da faixa nao da erro: ele muda a conta em
   silencio. `prazoCorteDiaSemana = 7` nao existe no calendario, e a conta do
   prazo devolveria uma data errada com cara de certa; `prazoCorteHora` por
   extenso faria a comparacao de hora virar texto contra texto e o corte cair
   sempre do mesmo lado. Recusar aqui e barato; descobrir pelo prazo errado
   na boca da revenda, nao.

   Fica num mapa e nao num encadeado de `if` porque o proximo parametro com
   faixa vai ser escrito copiando este — e `if` empilhado e onde um deles
   nasce sem guarda. */
const FAIXA={
  pesoSobra:      n=>n<=1||'O peso da sobra vai de 0 a 1 — 0,50 quer dizer metade.',
  prazoCorteDiaSemana:   n=>(Number.isInteger(n)&&n>=0&&n<=6)||'O dia da semana vai de 0 (domingo) a 6 (sabado).',
  prazoEntregaDiaSemana: n=>(Number.isInteger(n)&&n>=0&&n<=6)||'O dia da semana vai de 0 (domingo) a 6 (sabado).',
  prazoSemanas:   n=>(Number.isInteger(n)&&n>=0&&n<=12)||'Semanas ate a entrega: um inteiro de 0 a 12.'
};
const FORMATO={
  prazoCorteHora: v=>/^([01]\d|2[0-3]):[0-5]\d$/.test(v)||'A hora do corte se escreve hh:mm, de 00:00 a 23:59.'
};

function gravar(chave,valor,usuarioNome){
  const p=db.prepare('SELECT * FROM parametro WHERE chave=?').get(chave);
  if(!p) throw new ErroDeRegra('parametro_inexistente','Parametro "'+chave+'" nao existe.');
  if(p.tipo==='numero'){
    const n=Number(String(valor).replace(',','.'));
    if(!isFinite(n)||n<0) throw new ErroDeRegra('valor_invalido','"'+valor+'" nao e um numero valido.');
    const faixa=FAIXA[chave]&&FAIXA[chave](n);
    if(faixa!==undefined&&faixa!==true) throw new ErroDeRegra('valor_invalido',faixa);
    valor=String(n);
  }else{
    const f=FORMATO[chave]&&FORMATO[chave](String(valor).trim());
    if(f!==undefined&&f!==true) throw new ErroDeRegra('valor_invalido',f);
    valor=String(valor).trim();
  }
  db.prepare('UPDATE parametro SET valor=?, alterado_em=?, alterado_por=? WHERE chave=?')
    .run(String(valor),dia.agora(),usuarioNome||null,chave);
  cache=null;
  return {chave,valor};
}

module.exports={ler,todos,listar,gravar,paramsDeCorte};

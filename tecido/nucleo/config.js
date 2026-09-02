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

function gravar(chave,valor,usuarioNome){
  const p=db.prepare('SELECT * FROM parametro WHERE chave=?').get(chave);
  if(!p) throw new ErroDeRegra('parametro_inexistente','Parametro "'+chave+'" nao existe.');
  if(p.tipo==='numero'){
    const n=Number(String(valor).replace(',','.'));
    if(!isFinite(n)||n<0) throw new ErroDeRegra('valor_invalido','"'+valor+'" nao e um numero valido.');
    if(chave==='pesoSobra'&&n>1)
      throw new ErroDeRegra('valor_invalido','O peso da sobra vai de 0 a 1 — 0,50 quer dizer metade.');
    valor=String(n);
  }
  db.prepare('UPDATE parametro SET valor=?, alterado_em=?, alterado_por=? WHERE chave=?')
    .run(String(valor),dia.agora(),usuarioNome||null,chave);
  cache=null;
  return {chave,valor};
}

module.exports={ler,todos,listar,gravar,paramsDeCorte};

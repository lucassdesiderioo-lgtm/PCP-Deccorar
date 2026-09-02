// Roda UM arquivo de teste, num banco so dele. Chamado por rodar.js.
//
// Cada arquivo em processo separado nao e capricho: com um banco compartilhado
// os testes brigam pela sequencia de etiquetas e pelo estoque uns dos outros,
// e a falha aparece no arquivo errado. Teste que depende da ordem em que roda
// e teste que um dia mente.
const fs=require('fs'), path=require('path');

const arquivo=process.argv[2];
const nome=arquivo.replace('.test.js','');
const banco=path.join(__dirname,'.teste-'+nome+'.db');
for(const sufixo of ['','-wal','-shm']) try{ fs.unlinkSync(banco+sufixo); }catch(e){}
process.env.BANCO_TECIDO=banco;

const db=require('../nucleo/db');
require('../nucleo/schema').aplicar(db);
const {ErroDeRegra}=require('../nucleo/erros');

function igual(obtido,esperado,oque){
  if(obtido!==esperado)
    throw new Error((oque||'valor')+': esperava '+JSON.stringify(esperado)+', veio '+JSON.stringify(obtido));
}
// Medida SEMPRE com tolerancia de 1 mm: em ponto flutuante 7.5-6.75 nao da
// exatamente 0.75, e um teste que exige igualdade exata reprova codigo certo.
function perto(obtido,esperado,oque,tol){
  const t=tol===undefined?0.001:tol;
  if(!(Math.abs(obtido-esperado)<=t))
    throw new Error((oque||'valor')+': esperava ~'+esperado+', veio '+obtido);
}
function recusa(fn,motivo,oque){
  try{ fn(); }
  catch(e){
    if(!(e instanceof ErroDeRegra)) throw e;
    if(motivo&&e.motivo!==motivo)
      throw new Error((oque||'recusa')+': esperava motivo "'+motivo+'", veio "'+e.motivo+'"');
    return e;
  }
  throw new Error((oque||'recusa')+': era para recusar e passou.');
}

(async function(){
  let ok=0, falhas=0;
  console.log('── '+nome+' '+'─'.repeat(Math.max(0,50-nome.length)));
  for(const t of require(path.join(__dirname,arquivo))){
    try{
      await t.executar({igual,perto,recusa,db});
      console.log('  ✓ '+t.nome); ok++;
    }catch(e){
      console.log('  ✗ '+t.nome+'\n      '+e.message); falhas++;
    }
  }
  // A ultima linha e o placar, lido por rodar.js.
  console.log('__PLACAR__ '+ok+' '+falhas);
  process.exit(falhas?1:0);
})();

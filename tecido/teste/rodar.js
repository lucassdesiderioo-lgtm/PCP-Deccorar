// Runner de testes. Sem framework, sem dependencia: `npm test` roda isto.
//
// Cada arquivo *.test.js exporta uma lista de {nome, executar}. O banco e
// SEMPRE um arquivo temporario, criado do zero pelo schema — o teste nunca
// toca no tecido.db de trabalho, e a migracao 1 e exercitada a cada rodada.
const fs=require('fs'), path=require('path');

const banco=path.join(__dirname,'.teste.db');
for(const sufixo of ['','-wal','-shm']) try{ fs.unlinkSync(banco+sufixo); }catch(e){}
process.env.BANCO_TECIDO=banco;

const db=require('../nucleo/db');
require('../nucleo/schema').aplicar(db);

const {ErroDeRegra}=require('../nucleo/erros');

// ── as asserts que os testes usam ────────────────────────────────────────
function igual(obtido,esperado,oque){
  if(obtido!==esperado)
    throw new Error((oque||'valor')+': esperava '+JSON.stringify(esperado)+', veio '+JSON.stringify(obtido));
}
// Comparacao de medida SEMPRE com tolerancia de 1 mm — em ponto flutuante
// 7.5-6.75 nao da exatamente 0.75, e um teste que exige igualdade exata
// reprova o codigo certo.
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
const ferramentas={igual,perto,recusa,db};

// ── rodada ───────────────────────────────────────────────────────────────
(async function(){
  const arquivos=fs.readdirSync(__dirname).filter(f=>f.endsWith('.test.js')).sort();
  let ok=0, falhas=[];

  for(const arq of arquivos){
    console.log('\n── '+arq.replace('.test.js','')+' '+'─'.repeat(Math.max(0,52-arq.length)));
    for(const t of require(path.join(__dirname,arq))){
      try{
        await t.executar(ferramentas);
        console.log('  ✓ '+t.nome);
        ok++;
      }catch(e){
        console.log('  ✗ '+t.nome+'\n      '+e.message);
        falhas.push(arq+' · '+t.nome+': '+e.message);
      }
    }
  }

  console.log('\n'+'─'.repeat(60));
  console.log(ok+' passaram, '+falhas.length+' falharam');
  process.exit(falhas.length?1:0);
})();

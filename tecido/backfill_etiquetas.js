#!/usr/bin/env node
// OS PEDIDOS APROVADOS ANTES DA FASE 4-A NAO TEM CODIGO DE ETIQUETA.
//
// O codigo nasce na aprovacao (secao 4.14), e a aprovacao so passou a
// gera-lo agora. O pedido 5001 — o primeiro da casa, aprovado em 23/09/2026
// — ficaria para sempre sem etiqueta: invisivel para a serralheria, e sem
// nenhum aviso em tela nenhuma dizendo que ele esta assim. E a divida 18 do
// CLAUDE.md pela porta de uma regra que passou a valer depois do dado.
//
//   node backfill_etiquetas.js              so mostra
//   node backfill_etiquetas.js --aplicar    grava
//
// ⚠️ ELE NAO TEM REGUA PROPRIA. Chama o MESMO `atribuirCodigos` da aprovacao,
// e por isso nao ha como o codigo do backfill sair diferente do codigo de um
// pedido aprovado hoje. Ferramenta de conserto com regua propria e pior que
// nenhuma: ela grava com autoridade um numero que o sistema nao usa.
const db=require('./nucleo/db');
require('./nucleo/schema').aplicar(db);
const d=require('./dados/etiqueta_producao');
const etq=require('./dominio/etiqueta_producao');

const aplicar=process.argv.includes('--aplicar');

const pendentes=d.semCodigo();
if(!pendentes.length){
  console.log('Nada a fazer: todo componente de pedido aprovado ja tem codigo.');
  process.exit(0);
}

const porSetor={};
pendentes.forEach(c=>{ porSetor[c.setor]=(porSetor[c.setor]||0)+1; });

console.log('ETIQUETAS SEM CODIGO — '+pendentes.length+' componente(s) de pedido aprovado');
console.log('');
for(const s of Object.keys(porSetor).sort())
  console.log('  '+s.padEnd(14)+porSetor[s]);
console.log('');

if(!aplicar){
  console.log('Simulacao. Rode com --aplicar para gravar.');
  console.log('O codigo sai pela MESMA conta da aprovacao, e continua de onde o');
  console.log('contador de cada setor parou — ele nunca desce.');
  process.exit(0);
}

/* Backup antes de gravar, e com await: `db.backup()` e assincrono e estoura
   DEPOIS do close, com o relatorio de sucesso ja impresso (§15). */
(async()=>{
  const fs=require('fs'), path=require('path');
  const dir=path.join(__dirname,'backups');
  try{ fs.mkdirSync(dir,{recursive:true}); }catch(e){}
  const alvo=path.join(dir,'tecido-antes-backfill-etiquetas.db');
  await db.backup(alvo);
  console.log('backup: '+alvo);

  const feitos=etq.atribuirPendentes();
  console.log('');
  console.log(feitos.length+' codigo(s) gravado(s):');
  feitos.slice(0,10).forEach(f=>console.log('  '+f.codigo+'  ('+f.setor+')'));
  if(feitos.length>10) console.log('  ... e mais '+(feitos.length-10));
  db.close();
})().catch(e=>{ console.error('FALHOU: '+e.message); process.exit(1); });

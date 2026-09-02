#!/usr/bin/env node
/* Reabre volumes carimbados como carregados numa data que ainda nao chegou.
 *
 *   node reabrir_futuros.js               so mostra
 *   node reabrir_futuros.js --aplicar     faz backup e grava
 *
 * POR QUE EXISTE
 * Em 26/08/2026 o regularizar_saida.js fechou 27 volumes de um passivo antigo.
 * Ele tinha acabado de passar a carimbar a saida na data DO VOLUME em vez de
 * hoje — o que estava certo —, mas sem a guarda que o fechar_vencidos.js ja
 * tinha: "venda futura nao foi despachada". Quatro volumes com despacho
 * marcado pra frente (27/08, 31/08, 14/09 e 17/09) foram fechados com data no
 * futuro. Eles nao sairam: estavam na fabrica esperando o prazo, com a
 * etiqueta impressa adiantada.
 *
 * O dano nao e a data feia no relatorio. E que o volume ficou `carregado` e
 * por isso NAO vai aparecer na tela de carregamento no dia em que ele
 * realmente tiver que sair — a peca fica na prateleira e ninguem e cobrado.
 *
 * A guarda foi para o regularizar_saida.js no mesmo commit, entao isto aqui e
 * reparo de uma vez so. Se um dia voltar a achar linha, alguem furou a guarda.
 *
 * O CRITERIO E ESTREITO DE PROPOSITO: so `carregado_em` com data MAIOR QUE
 * HOJE. Nao ha volume que tenha saido amanha; nao existe interpretacao
 * alternativa dessa linha, e por isso ela pode ser corrigida sem perguntar.
 *
 * VOLTA PARA `embalado`, que e de onde esses volumes vieram: a etiqueta de
 * venda ja tinha sido impressa (e por isso o estoque ja baixou). A simulacao
 * mostra volume por volume antes de gravar.
 *
 * NAO MEXE NO ESTOQUE: carregar nunca mexeu, entao descarregar tambem nao.
 */
const Database=require('better-sqlite3');
const path=require('path'), fs=require('fs');

const DB=process.env.PCP_DB||'/opt/expedicao/dados.db';
const APLICAR=process.argv.slice(2).includes('--aplicar');

(async()=>{
const db=new Database(DB);
const hoje=db.prepare("SELECT date('now','localtime') d").get().d;
const alvo=db.prepare(`SELECT id,data,codigo,buyer,nf,estagio,carregado_em,despachar_em
  FROM lote
  WHERE carregado_em IS NOT NULL AND date(carregado_em) > date('now','localtime')
  ORDER BY date(carregado_em), id`).all();

console.log('banco:',DB);
console.log('hoje :',hoje);
console.log('');
if(!alvo.length){
  console.log('Nenhum volume carregado em data futura. Nada a fazer.');
  db.close(); return;
}
alvo.forEach(v=>{
  console.log('#'+v.id+'  '+(v.codigo||'(sem SKU)')+'  NF '+(v.nf||'-')+'  '+(v.buyer||''));
  console.log('    carregado_em '+v.carregado_em+'  ← data que ainda nao chegou');
  console.log('    despacho previsto: '+(v.despachar_em||'(nao lido na etiqueta)'));
  console.log('    '+v.estagio+' -> embalado, carregado_em -> vazio');
});
console.log('');
console.log('resumo: '+alvo.length+' volume(s) a reabrir');

if(!APLICAR){
  console.log('');
  console.log('SIMULACAO — nada foi gravado. Para gravar: acrescente --aplicar');
  db.close(); return;
}

const dest=path.join(path.dirname(DB),'backups');
fs.mkdirSync(dest,{recursive:true});
const arq=path.join(dest,'antes-reabrir-'+new Date().toISOString().replace(/[:.]/g,'-')+'.db');
await db.backup(arq);
console.log(''); console.log('backup ->',arq);

const abrir=db.prepare(`UPDATE lote SET estagio='embalado', carregado_em=NULL WHERE id=?`);
db.transaction(()=>{ alvo.forEach(v=>abrir.run(v.id)); })();
console.log('reabertos:',alvo.length);

const esperando=db.prepare(`SELECT COUNT(*) c FROM lote WHERE estagio='embalado'`).get().c;
console.log('volumes embalados esperando carregamento, agora:',esperando);
db.close();
})().catch(e=>{ console.error('erro:',e.message); process.exit(1); });

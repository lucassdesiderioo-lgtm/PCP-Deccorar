#!/usr/bin/env node
/* Reabre volumes carimbados como carregados numa data que ainda nao chegou.
 *
 *   node reabrir_futuros.js               so mostra
 *   node reabrir_futuros.js --aplicar     faz backup e grava
 *   ... --aplicar --motivo "texto"         o motivo que vai para o historico da Mesa
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
 * VOLTA PARA `embalado` quando a etiqueta de venda ja tinha sido impressa (o
 * estoque ja baixou), e para `pendente` quando nunca foi (desde 02/10/2026 —
 * antes voltava tudo a embalado). A simulacao mostra volume por volume.
 *
 * NAO MEXE NO ESTOQUE: carregar nunca mexeu, entao descarregar tambem nao.
 */
const Database=require('better-sqlite3');
const path=require('path'), fs=require('fs');

const DB=require('./caminhos').BANCO;
const APLICAR=process.argv.slice(2).includes('--aplicar');

(async()=>{
const db=new Database(DB);
const hoje=db.prepare("SELECT date('now','localtime') d").get().d;
const alvo=db.prepare(`SELECT id,data,codigo,buyer,nf,estagio,carregado_em,despachar_em,embalado_em
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
  console.log('    '+v.estagio+' -> '+(v.embalado_em?'embalado':'pendente (a etiqueta nunca saiu)')+', carregado_em -> vazio');
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

/* Quem reabre e a acao "Reabrir venda futura" da Mesa de correcoes (fase 3,
   02/10/2026), com uma linha em `correcao` por volume. Ela volta a EMBALADO so
   o volume cuja etiqueta saiu; o que foi fechado direto de pendente volta a
   pendente — embalado sem o −1 da etiqueta e a armadilha #27. */
const COR=require('./correcoes');
COR.garantirSchema(db);
const T=COR.terminal('reabrir_futuros.js', process.argv);
const recusados=[]; let n=0;
db.transaction(()=>{ alvo.forEach(v=>{
  try{ COR.executar(db,{acao:'reabrir',tipo:'lote',id:v.id,motivo:T.motivo,quem:T.quem}); n++; }
  catch(e){ recusados.push('#'+v.id+' — '+e.message); }
}); })();
console.log('reabertos:',n);
if(recusados.length){ console.log('NAO reabertos:'); recusados.forEach(r=>console.log('  '+r)); }

const esperando=db.prepare(`SELECT COUNT(*) c FROM lote WHERE estagio='embalado'`).get().c;
console.log('volumes embalados esperando carregamento, agora:',esperando);
db.close();
})().catch(e=>{ console.error('erro:',e.message); process.exit(1); });

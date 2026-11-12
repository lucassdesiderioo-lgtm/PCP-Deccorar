#!/usr/bin/env node
/* Fecha os pedidos de baixa de boleto que ficaram pendentes depois de o boleto
 * ser cancelado (CONSERTO de 12/11/2026, cartao R-SMF-12).
 *
 *   node tecido/limpar_baixas_orfas.js              simula: lista e nao grava nada
 *   node tecido/limpar_baixas_orfas.js --aplicar    faz backup do tecido.db e fecha
 *
 * POR QUE: ate o conserto, `boleto.cancelar` nao tocava na `sm_aprovacao`. O
 * pedido de baixa do boleto cancelado ficava `pendente` para sempre — o
 * `boleto.baixar` recusa cancelado, entao aprovar falha — e a 616 e a central
 * 204 do PCP contavam um numero que nunca zerava. Desde o conserto o cancelar
 * fecha o pedido na mesma transacao; isto fecha os que ficaram de antes.
 *
 * O QUE ELE FAZ: cada pedido `baixa_boleto` pendente cujo boleto tem
 * `cancelado_em` vira status `cancelado`, pela MESMA funcao do conserto
 * (`aprovacao.fecharPorCancelamento`), com quem cancelou o boleto (so o nome:
 * o boleto nao guarda o id), a DATA do cancelamento e o motivo dele. A linha
 * NAO e apagada. Nao mexe em boleto, credito nem saldo. Rodar de novo nao acha
 * nada.
 */
const fs=require('fs');
const path=require('path');
const db=require('./nucleo/db');
const aprovacao=require('./dominio/aprovacao');

function levantar(){
  return db.prepare(`SELECT a.id, a.alvo_id AS boleto_id, a.pedido_por, a.pedido_em,
      b.numero, b.cancelado_em, b.cancelado_por, b.cancelado_motivo
    FROM sm_aprovacao a JOIN sm_boleto b ON b.id=a.alvo_id
    WHERE a.tipo='baixa_boleto' AND a.status='pendente' AND b.cancelado_em IS NOT NULL
    ORDER BY a.id`).all();
}

/* db.backup() e ASSINCRONO: sem o await o backup nao existe (§15). */
async function fazerBackup(){
  const dest=path.join(path.dirname(db.arquivo),'backups');
  fs.mkdirSync(dest,{recursive:true});
  const quando=new Date().toISOString().replace(/[:.]/g,'-');
  const arq=path.join(dest,'antes-baixas-orfas-'+quando+'.db');
  await db.backup(arq);
  return arq;
}

function aplicar(){
  const lista=levantar();
  db.transaction(()=>{
    lista.forEach(o=>aprovacao.fecharPorCancelamento('baixa_boleto',o.boleto_id,
      'Boleto cancelado'+(o.cancelado_motivo?': '+o.cancelado_motivo:'')+
      ' (pedido fechado depois, pelo limpar_baixas_orfas.js)',
      {nome:o.cancelado_por||null},o.cancelado_em));
  })();
  return {fechados:lista.length, lista};
}

async function main(){
  const gravar=process.argv.includes('--aplicar');
  console.log('Banco: '+db.arquivo);
  const lista=levantar();
  console.log('\nPEDIDOS DE BAIXA PENDENTES DE BOLETO CANCELADO ('+lista.length+')');
  lista.forEach(o=>console.log('  pedido #'+o.id+' · boleto '+o.numero+' (#'+o.boleto_id+')'+
    ' · pedido por '+(o.pedido_por||'?')+' em '+String(o.pedido_em||'').slice(0,16)+
    ' · cancelado por '+(o.cancelado_por||'?')+' em '+String(o.cancelado_em).slice(0,16)+
    (o.cancelado_motivo?' — "'+o.cancelado_motivo+'"':'')));
  if(!lista.length){ console.log('  nenhum — nada a fazer.'); return; }
  if(!gravar){ console.log('\nSimulacao: nada foi gravado. Rode com --aplicar para fechar.'); return; }
  const arq=await fazerBackup();
  console.log('\nbackup: '+arq);
  const r=aplicar();
  console.log('fechados: '+r.fechados+' (status cancelado; as linhas continuam no banco)');
}

if(require.main===module) main().catch(e=>{ console.error('ERRO: '+(e.message||e)); process.exit(1); });

module.exports={levantar,aplicar,fazerBackup};

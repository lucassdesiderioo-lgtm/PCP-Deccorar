#!/usr/bin/env node
/* O QUE O IMPORT DA PLANILHA VAI FAZER COM AS VENDAS CANCELADAS — e so diz.
 *
 *   node conferir_canceladas.js <relatorio-do-ML.xlsx>
 *   node conferir_canceladas.js <arquivo> --db /outro/dados.db
 *
 * VENDAS-E-MEDIA, fase 2 (26/09/2026). O primeiro import depois do deploy le
 * o relatorio inteiro — 14 meses no arquivo de 26/09 — e acha TODOS os
 * cancelamentos antigos de uma vez. Este script roda a mesma conta
 * (cancelada_dominio.js: `daPlanilha` e `marcar`) dentro de uma transacao que
 * e DESFEITA no fim, e lista volume a volume o que o import faria. Nada e
 * gravado.
 *
 * Rode depois de subir o servidor (as colunas novas do `lote` nascem no boot)
 * e antes do primeiro import.
 */
if(require.main !== module) return;
const fs = require('fs');
const Database = require('better-sqlite3');
const { lerPlanilha } = require('./planilha');
const CANC = require('./cancelada_dominio');

const args = process.argv.slice(2);
const iDb = args.indexOf('--db');
const CAMINHO = iDb >= 0 ? args[iDb + 1] : require('./caminhos').BANCO;
const arquivo = args.find((a, i) => !a.startsWith('--') && (iDb < 0 || i !== iDb + 1));
if(!arquivo){ console.log('uso: node conferir_canceladas.js <relatorio-do-ML.xlsx> [--db caminho]'); process.exit(1); }

const db = new Database(CAMINHO);
const cols = db.prepare('PRAGMA table_info(lote)').all().map(c => c.name);
if(cols.indexOf('cancelada_varias') < 0){
  console.log('O banco ainda nao tem as colunas de cancelamento. Suba o servidor com este codigo antes');
  console.log('(elas nascem no boot, no exp_route.js) e rode de novo.');
  process.exit(1);
}

const linhas = lerPlanilha(fs.readFileSync(arquivo));
const lista = CANC.daPlanilha(linhas, { venda:0, estado:3, sku:22 });
console.log('\n' + arquivo);
console.log('  ' + lista.length + ' linha(s) cancelada(s) no arquivo\n');

const ONDE = { pendente:'pendente (sai de "Faltam imprimir")', bloqueado:'bloqueado (sai de Bloqueados)',
  embalado:'IMPRESSA — vai para o card', no_canto:'NO CANTO DA COLETA — vai para o card',
  no_carro:'NO CARRO de uma viagem aberta — vai para o card' };

const DESFAZ = new Error('desfaz');
let resumo = null, mudou = [];
try{
  db.transaction(() => {
    resumo = CANC.marcar(db, lista, { origem:'conferencia' });
    mudou = db.prepare(`SELECT id, codigo, buyer, nf, data, cancelada_estagio, cancelada_varias, cancelada_motivo
      FROM lote WHERE (estagio='cancelado' AND cancelada_origem='conferencia')
         OR (cancelada_varias=1 AND cancelada_origem='conferencia') ORDER BY id`).all();
    throw DESFAZ;
  })();
}catch(e){ if(e !== DESFAZ) throw e; }

const grupos = {};
for(const v of mudou){
  const k = v.cancelada_varias ? 'varias' : (v.cancelada_estagio || '?');
  (grupos[k] = grupos[k] || []).push(v);
}
const titulo = { pendente:ONDE.pendente, bloqueado:ONDE.bloqueado, embalado:ONDE.embalado,
  carregado:'no canto ou no carro — vai para o card', varias:'CAIXA DE VARIAS — nao e cancelada, vai para o card' };
for(const k of ['embalado','carregado','varias','pendente','bloqueado']){
  const g = grupos[k]; if(!g || !g.length) continue;
  console.log('  ' + g.length + ' · ' + titulo[k]);
  g.forEach(v => console.log('      #' + String(v.id).padEnd(6) + String(v.codigo || '').padEnd(18)
    + ' NF ' + String(v.nf || '—').padEnd(7) + ' ' + (v.data || '') + '  ' + (v.buyer || '')
    + '  — ' + (v.cancelada_motivo || '')));
  console.log('');
}
console.log('  resumo: ' + JSON.stringify(resumo));
console.log('  (carregado = ja saiu, fica como esta · ja_marcada = import anterior · nao_achada = venda sem volume no sistema)');
console.log('\n  NADA FOI GRAVADO. O import de verdade e em Admin -> Planejamento.\n');
db.close();

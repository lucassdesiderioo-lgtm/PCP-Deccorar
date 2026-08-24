#!/usr/bin/env node
/* Marco zero do historico de custo — COMPRAS.md §6.
 *
 * O custo_dominio grava uma linha sempre que algo que compoe o custo MUDA. Mas
 * sem uma primeira linha, a evolucao de um SKU comeca na primeira mudanca, e
 * nao em hoje: o relatorio diria "subiu de X para Y" sem saber quanto era antes
 * de X. Este script grava o ponto de partida.
 *
 * Roda UMA VEZ, depois do cadastro estar de pe. Nao toca em SKU que ja tem
 * historico, entao rodar de novo e inofensivo.
 *
 * USO
 *   node custo_base.js --dry [caminho.db]
 *   node custo_base.js       [caminho.db]
 */
const path = require('path');
const Database = require('better-sqlite3');
const { garantirSchema } = require('./sku_schema');
const { garantirSchemaCompras } = require('./compras_schema');
const CUSTO = require('./custo_dominio');

const args = process.argv.slice(2);
const dry  = args.indexOf('--dry') >= 0;
const alvo = args.filter(a => a.indexOf('--') !== 0)[0] || '/opt/expedicao/dados.db';

console.log('Banco : ' + path.resolve(alvo));
console.log('Modo  : ' + (dry ? 'SIMULACAO (--dry) — nada sera gravado' : 'APLICAR'));
console.log('');

const db = new Database(alvo);
const log = [];
let erro = null, gravados = 0, jaTinham = 0, semCusto = [];

db.exec('BEGIN');
try{
  garantirSchema(db); garantirSchemaCompras(db);
  const temHist = db.prepare('SELECT 1 FROM custo_sku_historico WHERE sku=? LIMIT 1');
  for(const s of db.prepare('SELECT codigo FROM skus ORDER BY codigo').all()){
    if(temHist.get(s.codigo)){ jaTinham++; continue; }
    const r = CUSTO.registrar(db, s.codigo, 'marco inicial do histórico',
                              { usuario_nome:'custo_base' });
    /* registrar() devolve null quando o custo e indefinido — e ai nao ha marco
       a gravar. Regra 4: indefinido nunca vira zero, nem no historico. */
    if(r){ gravados++; log.push('  ' + s.codigo.padEnd(24) + 'R$ ' + r.para.toFixed(2).padStart(8)); }
    else semCusto.push(s.codigo);
  }
}catch(e){ erro = e; }
db.exec((dry || erro) ? 'ROLLBACK' : 'COMMIT');

console.log(log.join('\n') || '  (nenhum)');
console.log('');
console.log('Marco gravado .............. ' + gravados);
console.log('Já tinham histórico ........ ' + jaTinham);
if(semCusto.length){
  console.log('Sem custo definido ......... ' + semCusto.length + ' — ficaram de fora, e é o certo:');
  console.log('  (custo indefinido nunca vira zero, nem no histórico)');
  for(const c of semCusto) console.log('    - ' + c);
}
console.log('');
if(erro){ console.error('Nada foi gravado — a transacao inteira foi desfeita.\n'); throw erro; }
console.log(dry ? 'Simulacao encerrada — nada foi gravado.' : 'Marco inicial gravado.');
db.close();

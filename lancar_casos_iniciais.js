#!/usr/bin/env node
/* lancar_casos_iniciais.js — os 6 casos de "nós coletamos" que já existiam na
 * tabela de texto de 29/10/2026 (spec DEVOLUCOES-ACOMPANHAMENTO §11).
 *
 *   node lancar_casos_iniciais.js            simula: diz o que lançaria, não grava
 *   node lancar_casos_iniciais.js --aplicar  backup antes, depois grava
 *
 * Tipo coleta, responsável Renato, passado em 29/10/2026, motivo em BRANCO (o
 * dono escolhe na tela), etapa `lancado`, e o status da tabela em `obs`.
 *
 * ⚠️ O SKU DA TABELA NÃO É O DO CADASTRO (falta o `BK`). O script NÃO
 *    adivinha: busca a venda no `lote` e usa o SKU de lá; não achando, grava o
 *    texto como veio e escreve em `obs` para conferir.
 * ⚠️ RODAR DE NOVO NÃO DUPLICA: venda que já tem caso aberto, ou que já foi
 *    lançada por este script, é pulada e aparece na saída.
 * ⚠️ O BACKUP É PELO `db.backup()`, COM `await` (§12, §15): `cp dados.db`
 *    copia um arquivo de 4 KB sem os dados, que moram no WAL.
 */
const path = require('path'), fs = require('fs');
const D = require('./devcaso_dominio');

const AUTOR = { nome:'casos iniciais (29/10/2026)' };
const CASOS = [
  { nf:'7336', venda:'2000018711038526', sku:'160160branco', prazo:'2026-11-03', valor:132.72, situacao:'ja_veio', status:'' },
  { nf:'8040', venda:'2000015512825367', sku:'140140bege',   prazo:'2026-11-04', valor:null,   situacao:'pedido',  status:'Aguardando ML passar valor da coleta' },
  { nf:'7451', venda:'2000018750385396', sku:'160140bege',   prazo:'2026-11-04', valor:null,   situacao:null,      status:'Aguardando ML dar resposta' },
  { nf:'7245', venda:'2000015170807257', sku:'160140bege',   prazo:'2026-11-05', valor:174.87, situacao:'ja_veio', status:'' },
  { nf:'8271', venda:'2000018959493934', sku:'150150bege',   prazo:'2026-11-09', valor:163.74, situacao:'ja_veio', status:'' },
  { nf:'7675', venda:'2000015374485377', sku:'150150branco', prazo:'2026-11-09', valor:164.04, situacao:'ja_veio', status:'' }
];

async function rodar(db, opt){
  const o = opt || {};
  D.garantir(db);
  const lancaria = [], pulados = [];
  for(const c of CASOS){
    const ja = D.abertoDaVenda(db, c.venda) ||
      db.prepare('SELECT id FROM devolucao_caso WHERE venda=? AND criado_por=? LIMIT 1').get(c.venda, AUTOR.nome);
    if(ja){ pulados.push({ nf:c.nf, venda:c.venda, caso:ja.id }); continue; }
    const lt = D.buscarLote(db, c.venda);
    const obs = [c.status, lt ? '' : 'SKU como veio na tabela de 29/10 ("'+c.sku+'") — conferir: a venda não está no sistema']
      .filter(Boolean).join(' · ');
    lancaria.push({ c, lt, obs });
  }
  const r = { lancaria: lancaria.map(x => ({ nf:x.c.nf, venda:x.c.venda, sku: x.lt ? x.lt.codigo : x.c.sku, prazo:x.c.prazo,
                                             achou_venda: !!x.lt, obs:x.obs })),
              pulados, lancados:[], backup:null };
  if(!o.aplicar || !lancaria.length) return r;

  const dir = o.backupDir;
  if(dir){
    fs.mkdirSync(dir, { recursive:true });
    r.backup = path.join(dir, 'dados-antes-casos-iniciais-' + new Date().toISOString().replace(/[:.]/g,'-') + '.db');
    await db.backup(r.backup);
  }
  db.transaction(() => {
    for(const x of lancaria){
      const caso = D.lancar(db, {
        tipo:'coleta', venda:x.c.venda, nf:x.c.nf, sku: x.lt ? null : x.c.sku, prazo:x.c.prazo,
        responsavel:'Renato', passado_em:'2026-10-29', obs:x.obs || null,
        _valor_ml:x.c.valor, _valor_ml_situacao:x.c.situacao
      }, AUTOR, { semPublicidade:true });   // os 6 são de antes da pergunta: "não informado"
      r.lancados.push(caso.id);
    }
  })();
  return r;
}

module.exports = { rodar, CASOS };

if(require.main === module){
  const Database = require('better-sqlite3');
  const C = require('./caminhos');
  const aplicar = process.argv.includes('--aplicar');
  const db = new Database(C.BANCO);
  rodar(db, { aplicar, backupDir: C.BACKUPS }).then(r => {
    console.log(aplicar ? '\nLANÇANDO OS CASOS INICIAIS' : '\nSIMULAÇÃO (nada gravado — use --aplicar para gravar)');
    for(const x of r.lancaria)
      console.log('  NF '+x.nf+' · venda '+x.venda+' · '+x.sku+' · prazo '+x.prazo.split('-').reverse().join('/')+
        (x.achou_venda ? '' : '  ⚠ venda fora do sistema')+(x.obs ? '\n      obs: '+x.obs : ''));
    for(const p of r.pulados) console.log('  pulei NF '+p.nf+' · venda '+p.venda+': já existe o caso #'+p.caso);
    if(!r.lancaria.length) console.log('  nada a lançar.');
    if(aplicar && r.lancados.length) console.log('\nbackup: '+r.backup+'\nlançados: '+r.lancados.length+' (casos #'+r.lancados.join(', #')+')');
    db.close();
  }).catch(e => { console.error('FALHOU: '+e.message); db.close(); process.exit(1); });
}

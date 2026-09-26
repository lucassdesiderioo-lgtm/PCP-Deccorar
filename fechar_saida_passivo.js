#!/usr/bin/env node
/* Fecha, UMA vez, as caixas de coleta paradas em "esperando o caminhao".
 *
 *   node fechar_saida_passivo.js             so mostra
 *   node fechar_saida_passivo.js --aplicar   faz backup e grava
 *
 * DE ONDE VEM O PASSIVO
 * O "Fechar coleta" de 10/09/2026 (foto + numero do motorista) nao foi adotado
 * pela equipe. Um dia deixou de ser fechado, as caixas acumularam no canto como
 * "esperando o caminhao", e dali em diante o numero do sistema nunca mais bateu
 * com o do motorista — porque aquele fechamento comparava TUDO o que estava no
 * canto. O dono confirmou em 25/09/2026 que essas caixas ja sairam (spec
 * SAIDA-E-DUPLA-CONFERENCIA, §5 fase 1 e decisao 8). Sem esta limpeza a fase 3
 * nasceria com o mesmo canto cheio, e o primeiro caminhao ja divergiria.
 *
 * O QUE ELE FAZ
 * Cria UMA linha em `saida` com tipo 'passivo' e os ids, e em cada caixa grava
 * `saida_id`, `saiu_por='coleta'` e `saiu_em` = `retirado_em` = o `carregado_em`
 * DAQUELA caixa. Nunca `now`: e a regra dos scripts de passivo (CLAUDE.md §5) —
 * carimbar hoje criaria um pico falso de saidas num dia em que nao saiu nada.
 * O `carregado_em` e o limite de baixo honesto: a caixa nao saiu antes de ser
 * bipada pro canto. A hora real da retirada nao existe em lugar nenhum.
 *
 * O criterio e o `AGUARDA_CAMINHAO` do carga.js — a MESMA regua do card
 * "esperando o caminhao" da tela. Uma regua propria aqui fecharia uma lista
 * diferente da que a equipe ve.
 *
 * O QUE ELE NAO FAZ
 * - Nao mexe em `lote.modalidade` (o que a etiqueta disse continua dito).
 * - Nao mexe em estoque: a baixa aconteceu na impressao da etiqueta.
 * - Nao toca em volume `embalado` (esta na prateleira), `pendente`, no carro da
 *   agencia, nem em coleta ja retirada. Nem em volume do modo teste.
 * - Nao escreve no `coleta_fechamento`, que fica como historia.
 *
 * E idempotente: depois de aplicado, as caixas ganham `retirado_em` e saem do
 * criterio — rodar de novo nao acha nada.
 */
const Database = require('better-sqlite3');
const fs = require('fs'), path = require('path');
const { AGUARDA_CAMINHAO } = require('./carga');
const { garantirSaida } = require('./saida_schema');

const PRECISA = ['saida_id', 'saiu_em', 'saiu_por', 'retirado_em', 'carregado_em'];

function fecharPassivo(db, opcoes){
  const aplicar = !!(opcoes && opcoes.aplicar);
  const tem = db.prepare("SELECT name FROM pragma_table_info('lote')").all().map(c => c.name);
  const faltam = PRECISA.filter(c => !tem.includes(c));
  if(faltam.length) throw new Error('o banco ainda nao tem as colunas ' + faltam.join(', ') +
    ' — suba o servidor com o codigo novo (git pull + restart) antes de rodar este script');
  const caixas = db.prepare(`SELECT id, codigo, buyer, nf, despachar_em, carregado_em FROM lote
    WHERE ${AGUARDA_CAMINHAO} AND COALESCE(teste,0)=0 AND carregado_em IS NOT NULL
    ORDER BY carregado_em, id`).all();
  if(!aplicar || !caixas.length) return { caixas, saida_id: null };

  garantirSaida(db);
  let saida_id = null;
  db.transaction(() => {
    saida_id = db.prepare(`INSERT INTO saida (tipo, fechada_em, fechado_por, qtd_sistema, ids, motivo)
      VALUES ('passivo', datetime('now','localtime'), 'fechar_saida_passivo.js', ?, ?, ?)`)
      .run(caixas.length, JSON.stringify(caixas.map(c => c.id)),
           'limpeza de 25/09/2026: o dono confirmou que as caixas esperando o caminhao ja sairam')
      .lastInsertRowid;
    /* `retirado_em IS NULL` na guarda: duas rodadas ao mesmo tempo nao fecham
       a mesma caixa duas vezes. */
    const up = db.prepare(`UPDATE lote SET saida_id=?, saiu_por='coleta', saiu_em=carregado_em,
      retirado_em=carregado_em WHERE id=? AND retirado_em IS NULL`);
    for(const c of caixas) up.run(saida_id, c.id);
  })();
  return { caixas, saida_id };
}

module.exports = { fecharPassivo };

if(require.main === module){
  const APLICAR = process.argv.includes('--aplicar');
  (async () => {
    const CAMINHOS = require('./caminhos');
    const db = new Database(CAMINHOS.BANCO);
    const { caixas } = fecharPassivo(db, {aplicar:false});
    console.log('Caixas de coleta esperando o caminhao (a regua da tela): ' + caixas.length);
    const porDia = {};
    for(const c of caixas){ const d = String(c.carregado_em).slice(0,10); (porDia[d] = porDia[d] || []).push(c); }
    for(const d of Object.keys(porDia).sort()){
      console.log('\n  bipadas pro canto em ' + d + ' — ' + porDia[d].length + ' caixa(s)');
      for(const c of porDia[d])
        console.log('    #' + String(c.id).padEnd(6) + ' NF ' + String(c.nf || '—').padEnd(7) + ' ' +
          String(c.codigo || '').padEnd(18) + ' ' + String(c.buyer || '') +
          (c.despachar_em ? '  (despacho ' + c.despachar_em + ')' : ''));
    }
    const teste = db.prepare(`SELECT COUNT(*) n FROM lote WHERE ${AGUARDA_CAMINHAO} AND COALESCE(teste,0)=1`).get().n;
    if(teste) console.log('\n  (' + teste + ' caixa(s) do modo teste ficam de fora — o modo teste cuida delas)');
    if(!caixas.length){ console.log('\nNada a fechar.'); db.close(); return; }
    if(!APLICAR){
      console.log('\nSIMULACAO — nada foi gravado. Cada caixa sairia com a data do bipe dela, nunca hoje.');
      console.log('Para gravar: node fechar_saida_passivo.js --aplicar');
      db.close(); return;
    }
    /* Backup ANTES de tocar em qualquer linha, pelo db.backup() — `cp dados.db`
       copia 4 KB e deixa os dados no -wal (§12). E com await: sem ele o backup
       estoura depois do close, com o relatorio de sucesso ja impresso. */
    fs.mkdirSync(CAMINHOS.BACKUPS, {recursive:true});
    const arq = path.join(CAMINHOS.BACKUPS, 'antes-saida-passivo-' + new Date().toISOString().replace(/[:.]/g,'-') + '.db');
    await db.backup(arq);
    console.log('\nbackup -> ' + arq);
    const r = fecharPassivo(db,{aplicar:true});
    console.log('saida #' + r.saida_id + ' (passivo): ' + r.caixas.length + ' caixa(s) fechada(s)');
    db.close();
  })().catch(e => { console.error('erro:', e.message); process.exit(1); });
}

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

/* O SEGUNDO PASSIVO (01/10/2026): CAIXAS NUNCA BIPADAS.
 *
 *   node fechar_saida_passivo.js --nao-bipadas --ate 2026-09-30             so mostra
 *   node fechar_saida_passivo.js --nao-bipadas --ate 2026-09-30 --aplicar   backup e grava
 *
 * A primeira rodada (26/09) fechou 399 caixas que tinham ido pro canto. Ficaram
 * para tras as que pararam UM PASSO ANTES: etiqueta impressa (`embalado`) e
 * nenhum bipe depois — 460 de coleta e 26 de agencia, de 04/09 a 30/09. A equipe
 * imprimia e o caminhao levava sem ninguem bipar pro canto. O dono confirmou em
 * 01/10/2026 que todas sairam ate 30/09.
 *
 * A DATA DE CORTE E OBRIGATORIA. "Etiqueta impressa e sem bipe" tambem descreve a
 * caixa impressa hoje cedo, que esta na pilha esperando o caminhao de hoje. Quem
 * sabe ate quando tudo saiu e quem viu sair — nao ha heuristica aqui.
 *
 * O CARIMBO: o dia do despacho da caixa as 15:00 (a convencao dos scripts de
 * passivo, §5), nunca hoje. Duas guardas: se o despacho e ANTERIOR a impressao
 * (etiqueta impressa atrasada), vale o dia da impressao — a caixa nao saiu antes
 * de ter etiqueta; e o carimbo nunca fica antes do proprio `embalado_em`. Sem
 * despacho lido, o dia da impressao. Com isso a caixa nao conta como "saiu
 * adiantado": saiu no dia dela, que e o que se sabe.
 *
 * FICAM DE FORA: despacho depois de hoje (venda futura nao foi despachada, §5),
 * a agencia ja conferida na area ou no carro (essa tem bipe, e o lugar dela e a
 * viagem), caixa ja ligada a uma saida, e o modo teste.
 *
 * `retirado_em` so na coleta, como a viagem e o caminhao fazem: para ela e o
 * que diz que o caminhao levou. `conferido_em` fica vazio — ninguem conferiu.
 * Estoque e modalidade nao se mexem: a baixa foi na impressao. */
const NAO_BIPADA = "estagio='embalado' AND conferido_em IS NULL AND no_carro_em IS NULL" +
  " AND saida_id IS NULL AND COALESCE(teste,0)=0";

function carimbo(c){
  const impresso = String(c.embalado_em || c.data || '').slice(0, 10);
  let d = String(c.despachar_em || impresso).slice(0, 10);
  if(d < impresso) d = impresso;
  let t = d + ' 15:00:00';
  if(c.embalado_em && t < c.embalado_em) t = c.embalado_em;
  return t;
}

function fecharNaoBipadas(db, opcoes){
  const o = opcoes || {};
  const aplicar = !!o.aplicar, ate = o.ate;
  if(!ate) throw new Error('falta a data de corte (--ate AAAA-MM-DD): ate que dia todas as caixas sairam?');
  if(!/^\d{4}-\d{2}-\d{2}$/.test(ate)) throw new Error('data de corte "' + ate + '" fora do formato AAAA-MM-DD');
  const hoje = db.prepare("SELECT date('now','localtime') d").get().d;
  if(ate > hoje) throw new Error('data de corte ' + ate + ' e depois de hoje (' + hoje + ')');
  const tem = db.prepare("SELECT name FROM pragma_table_info('lote')").all().map(c => c.name);
  const faltam = PRECISA.concat(['conferido_em', 'no_carro_em', 'embalado_em']).filter(c => !tem.includes(c));
  if(faltam.length) throw new Error('o banco ainda nao tem as colunas ' + faltam.join(', ') +
    ' — suba o servidor com o codigo novo (git pull + restart) antes de rodar este script');

  const caixas = db.prepare(`SELECT id, codigo, buyer, nf, data, despachar_em, embalado_em,
      ${require('./carga').COLETA()} AS coleta FROM lote
    WHERE ${NAO_BIPADA} AND date(COALESCE(embalado_em, data)) <= ?
      AND (despachar_em IS NULL OR despachar_em <= ?)
    ORDER BY COALESCE(embalado_em, data), id`).all(ate, hoje)
    .map(c => Object.assign(c, { coleta: !!c.coleta, saida: carimbo(c) }));
  if(!aplicar || !caixas.length) return { caixas, saida_id: null };

  garantirSaida(db);
  let saida_id = null;
  db.transaction(() => {
    saida_id = db.prepare(`INSERT INTO saida (tipo, fechada_em, fechado_por, qtd_sistema, ids, motivo)
      VALUES ('passivo', datetime('now','localtime'), 'fechar_saida_passivo.js --nao-bipadas', ?, ?, ?)`)
      .run(caixas.length, JSON.stringify(caixas.map(c => c.id)),
           'limpeza de 01/10/2026: caixas com etiqueta impressa e nunca bipadas, ate ' + ate +
           '; o dono confirmou que todas ja sairam').lastInsertRowid;
    /* A guarda repete o criterio: duas rodadas ao mesmo tempo nao fecham a
       mesma caixa duas vezes, e uma caixa bipada no meio nao e atropelada. */
    const up = db.prepare(`UPDATE lote SET estagio='carregado', carregado_em=@t, saida_id=@s,
        saiu_em=@t, saiu_por=@por, retirado_em=CASE WHEN @col THEN @t ELSE retirado_em END
      WHERE id=@id AND ${NAO_BIPADA}`);
    for(const c of caixas)
      up.run({ t: c.saida, s: saida_id, por: c.coleta ? 'coleta' : 'agencia', col: c.coleta ? 1 : 0, id: c.id });
  })();
  return { caixas, saida_id };
}

module.exports = { fecharPassivo, fecharNaoBipadas, carimbo };

async function rodarNaoBipadas(){
  const APLICAR = process.argv.includes('--aplicar');
  const i = process.argv.indexOf('--ate');
  const ate = i >= 0 ? process.argv[i + 1] : null;
  const CAMINHOS = require('./caminhos');
  const db = new Database(CAMINHOS.BANCO);
  const { caixas } = fecharNaoBipadas(db, {aplicar:false, ate});
  const col = caixas.filter(c => c.coleta).length;
  console.log('Caixas com etiqueta impressa e nunca bipadas, ate ' + ate + ': ' + caixas.length +
    '  (coleta ' + col + ' · agencia ' + (caixas.length - col) + ')');
  const porDia = {};
  for(const c of caixas){ const d = String(c.embalado_em || c.data).slice(0,10); (porDia[d] = porDia[d] || []).push(c); }
  for(const d of Object.keys(porDia).sort()){
    console.log('\n  impressas em ' + d + ' — ' + porDia[d].length + ' caixa(s)');
    for(const c of porDia[d])
      console.log('    #' + String(c.id).padEnd(6) + (c.coleta ? 'coleta  ' : 'agencia ') + 'NF ' +
        String(c.nf || '—').padEnd(7) + ' ' + String(c.codigo || '').padEnd(18) + ' ' +
        String(c.buyer || '').padEnd(28) + ' sai em ' + c.saida);
  }
  const hoje = db.prepare("SELECT date('now','localtime') d").get().d;
  const futuras = db.prepare(`SELECT COUNT(*) n FROM lote WHERE ${NAO_BIPADA}
    AND date(COALESCE(embalado_em, data)) <= ? AND despachar_em > ?`).get(ate, hoje).n;
  if(futuras) console.log('\n  (' + futuras + ' caixa(s) com despacho depois de hoje ficam de fora — estao na fabrica)');
  const depois = db.prepare(`SELECT COUNT(*) n FROM lote WHERE ${NAO_BIPADA}
    AND date(COALESCE(embalado_em, data)) > ?`).get(ate).n;
  if(depois) console.log('  (' + depois + ' caixa(s) impressas depois de ' + ate + ' ficam de fora — sao trabalho, bipe-as)');
  if(!caixas.length){ console.log('\nNada a fechar.'); db.close(); return; }
  if(!APLICAR){
    console.log('\nSIMULACAO — nada foi gravado. Confira a lista antes de gravar.');
    console.log('Para gravar: node fechar_saida_passivo.js --nao-bipadas --ate ' + ate + ' --aplicar');
    db.close(); return;
  }
  fs.mkdirSync(CAMINHOS.BACKUPS, {recursive:true});
  const arq = path.join(CAMINHOS.BACKUPS, 'antes-nao-bipadas-' + new Date().toISOString().replace(/[:.]/g,'-') + '.db');
  await db.backup(arq);
  console.log('\nbackup -> ' + arq);
  const r = fecharNaoBipadas(db,{aplicar:true, ate});
  console.log('saida #' + r.saida_id + ' (passivo): ' + r.caixas.length + ' caixa(s) fechada(s)');
  db.close();
}

if(require.main === module && process.argv.includes('--nao-bipadas')){
  rodarNaoBipadas().catch(e => { console.error('erro:', e.message); process.exit(1); });
}else if(require.main === module){
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

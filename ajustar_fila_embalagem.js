#!/usr/bin/env node
/* ajustar_fila_embalagem.js — A FILA DA EMBALAGEM VIRA A CONTAGEM DA MESA.
 *
 *   node ajustar_fila_embalagem.js             simula
 *   node ajustar_fila_embalagem.js --aplicar   backup e grava
 *   ... --aplicar --motivo "texto"             o motivo que vai para o histórico da Mesa
 *
 * Decisão do dono em 04/11/2026: no fim do dia, na mesa de embalagem, havia
 * só as peças da MESA abaixo, e "zera o resto". A fila (`fila`, situação
 * `aguardando`) é a peça revisada esperando embalagem — a lista da tela
 * Embalagem (/montagem).
 *
 * ⚠️ NÃO MEXE NO ESTOQUE. A fila nunca somou +1 (§2): o +1 é da embalagem.
 *
 * - SKU da mesa com peça a MAIS na fila: sai a linha MAIS ANTIGA — a recente é
 *   a que está na mesa. Sai pela ação "Tirar da fila" da Mesa de correções
 *   (a régua do `limpar_fila.js`), uma correção por linha, com desfazer.
 * - SKU da mesa com peça a MENOS: entra linha nova `aguardando`, modo
 *   `estoque` — não abate a ordem do dia (R-EMB-03), porque não se sabe de
 *   qual ordem a peça veio.
 * - Todo o resto da fila sai, de qualquer SKU — inclusive a que veio de
 *   devolução (perde o vínculo; a peça, se existir, embala igual: a fila não
 *   é obrigatória, R-EMB-02).
 * - A linha `embalado` e a de teste não se tocam (R-EMB-07). Modo teste
 *   ligado: recusa.
 * - O SKU se acha pelas colunas, pela mesma régua do
 *   `conferir_contagem_persianas.js`. Linha sem SKU ou ambígua: recusa tudo.
 */
const Database = require('better-sqlite3');
const path = require('path'), fs = require('fs');
const BAIXA = require('./baixa_dominio');
const COR = require('./correcoes');
const { conferir } = require('./conferir_contagem_persianas');

/* A mesa de embalagem no fim do dia 04/11/2026 (largura × altura). */
const MESA = [
  { largura:140, altura:140, cor:'BRANCO', qtd:2 },
  { largura:150, altura:150, cor:'CINZA',  qtd:3 },
  { largura:150, altura:150, cor:'BEGE',   qtd:2 },
];

function erro(msg){ const e = new Error(msg); e.status = 400; return e; }

/* Só lê. */
function levantar(db, mesa){
  if(BAIXA.emTeste(db)) throw erro('modo teste ligado: desligue antes — esta é a fila de verdade');
  const r = conferir(db, mesa);
  if(r.naoAchei.length) throw erro('linha da mesa sem SKU cadastrado: ' + r.naoAchei.map(l => l.texto).join('; '));
  if(r.ambiguas.length) throw erro('linha da mesa que casa com mais de um SKU: ' +
    r.ambiguas.map(l => l.texto + ' → ' + l.skus.join(', ')).join('; '));

  const alvo = {};
  r.itens.filter(i => i.situacao === 'na_folha').forEach(i => { alvo[String(i.codigo).toUpperCase()] = i.contado; });

  const linhas = db.prepare(`SELECT id, codigo, modo, revisado_em FROM fila
    WHERE situacao='aguardando' AND COALESCE(teste,0)=0 ORDER BY revisado_em, id`).all();
  const por = {};
  linhas.forEach(l => { const c = String(l.codigo || '').toUpperCase(); (por[c] = por[c] || []).push(l); });

  const itens = Object.keys(alvo).sort().map(c => {
    const tem = (por[c] || []).length, fica = alvo[c];
    return { codigo:c, tem, fica, tirar:(por[c] || []).slice(0, Math.max(0, tem - fica)), por:Math.max(0, fica - tem) };
  });
  const resto = linhas.filter(l => alvo[String(l.codigo || '').toUpperCase()] == null);
  return { itens, resto };
}

/* Grava. Quem chama abre a transação. */
function aplicar(db, mesa, { quem, motivo }){
  COR.garantirSchema(db);
  const L = levantar(db, mesa);
  let tiradas = 0, postas = 0;
  const tira = l => { COR.executar(db, { acao:'fila', tipo:'fila', id:l.id, motivo, quem }); tiradas++; };
  L.itens.forEach(i => i.tirar.forEach(tira));
  L.resto.forEach(tira);
  const ins = db.prepare("INSERT INTO fila (codigo,modo,situacao,teste) VALUES (?, 'estoque', 'aguardando', 0)");
  L.itens.forEach(i => { for(let k = 0; k < i.por; k++){ ins.run(i.codigo); postas++; } });
  return { tiradas, postas };
}

module.exports = { levantar, aplicar, MESA };

if(require.main === module){
  const CAMINHOS = require('./caminhos');
  const APLICAR = process.argv.includes('--aplicar');
  (async () => {
    const db = new Database(CAMINHOS.BANCO, APLICAR ? {} : { readonly:true, fileMustExist:true });
    console.log('banco:', CAMINHOS.BANCO, '\n');
    let L;
    try{ L = levantar(db, MESA); }
    catch(e){ if(e.status === 400){ console.error('Recusado: ' + e.message + '.'); db.close(); process.exit(2); } throw e; }

    console.log('FILA DA EMBALAGEM — fica só o que estava na mesa\n');
    console.log('  SKU                    na fila   fica   tira   põe');
    L.itens.forEach(i => console.log('  ' + i.codigo.padEnd(22) + String(i.tem).padStart(8) + String(i.fica).padStart(7) +
      String(i.tirar.length).padStart(7) + String(i.por).padStart(6)));
    const porSku = {};
    L.resto.forEach(l => { porSku[l.codigo] = (porSku[l.codigo] || 0) + 1; });
    console.log('\n  O resto sai: ' + L.resto.length + ' linha(s)' + (L.resto.length ? ' — ' +
      Object.keys(porSku).sort().map(c => c + ' ' + porSku[c]).join(' · ') : ''));
    const devol = L.resto.filter(l => l.modo === 'devolucao').length;
    if(devol) console.log('  (' + devol + ' vieram de devolução: perdem o vínculo; a peça, se existir, embala igual)');
    console.log('\n  O estoque não se mexe: a fila nunca somou +1.');

    if(!APLICAR){
      console.log('\nSIMULAÇÃO — nada foi gravado.');
      console.log('  node ajustar_fila_embalagem.js --aplicar');
      db.close(); return;
    }
    fs.mkdirSync(CAMINHOS.BACKUPS, { recursive:true });
    const bkp = path.join(CAMINHOS.BACKUPS, 'antes-fila-embalagem-' + new Date().toISOString().replace(/[:.]/g, '-') + '.db');
    await db.backup(bkp);
    console.log('\nbackup -> ' + bkp);
    const T = COR.terminal('ajustar_fila_embalagem.js', process.argv);
    const motivo = process.argv.includes('--motivo') ? T.motivo : 'contagem da mesa de embalagem no fim do dia 04/11/2026';
    const r = db.transaction(() => aplicar(db, MESA, { quem:T.quem, motivo }))();
    console.log('aplicada: ' + r.tiradas + ' linha(s) tiradas (desfaz pela Mesa de correções) · ' + r.postas + ' posta(s).');
    db.close();
  })().catch(e => { console.error('erro:', e.message); process.exit(1); });
}

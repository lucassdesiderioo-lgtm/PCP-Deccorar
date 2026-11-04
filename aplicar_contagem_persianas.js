#!/usr/bin/env node
/* aplicar_contagem_persianas.js — O SALDO DAS PERSIANAS VIRA A FOLHA.
 *
 *   node aplicar_contagem_persianas.js --contado-em "2026-11-04 08:00"            simula
 *   node aplicar_contagem_persianas.js --contado-em "2026-11-04 08:00" --aplicar  backup e grava
 *
 * Decisão do dono em 04/11/2026: "apenas atualize a lista; tudo que não está
 * na lista deixe zerado". A folha é a de `conferir_contagem_persianas.js`
 * (CONTAGEM), e a régua de "que SKU é esta linha" é a de lá — uma só.
 *
 * ⚠️ É UMA EXCEÇÃO À REGRA DAS DUAS PESSOAS (R-EST-18, R-EST-20), por decisão
 * do dono, registrada em docs/DECISOES.md — como o `backfill_pacote.js
 * --baixar`: script com backup, simulação e uma pessoa que decidiu. Roda UMA
 * VEZ (marca em `config`). Contagem nova vai pelo Inventário.
 *
 * ── O QUE FAZ ──────────────────────────────────────────────────────────────
 * 1. Toda PERSIANA ativa (não sob medida, com medida): saldo = contado (fora
 *    da folha, 0) MAIS o que andou no livro depois da hora da contagem
 *    (R-EST-16: a peça embalada depois de contar não pode sumir). Pelo
 *    `estoque_dominio` (tipo `ajuste`), com linha em `ajuste_estoque`.
 *    Acessório, sob medida e inativo não se mexem.
 * 2. A caixa impressa ATÉ a hora da contagem e nunca baixada passa a contar
 *    como fora do saldo: `baixado_em = embalado_em`, sem movimento. A folha
 *    contou a PRATELEIRA, e a peça dessa caixa não estava lá — já saiu, ou
 *    está encaixotada. Sem isso a reserva dela continuaria comendo o livre
 *    (saldo − em caixa), que ficaria negativo e travaria a Etiqueta de
 *    Venda; e a conferência dela, depois, baixaria uma peça que a contagem
 *    já tirou. A caixa continua `embalado`: a Conferência ainda a vê.
 *    Só entra a caixa cujas peças são todas de persiana ajustada (ou sob
 *    medida): a de outro SKU seguiria com o saldo dele.
 * 2b. E a caixa impressa DEPOIS da contagem também sai do "em caixa" — o dono:
 *    "o que está como conferência deixe como zerado também". A peça dela
 *    estava na prateleira na hora de contar (entrou no contado), então ela
 *    ganha a baixa de verdade (`baixa_dominio.baixar`, −1 por peça), e não só
 *    a marca. Resultado: depois de aplicar, nenhuma caixa reserva peça.
 * 3. A conferência, DEPOIS da contagem, de uma caixa impressa ANTES dela não
 *    conta no "o que andou depois": essa peça já estava fora da prateleira.
 *
 * Linha da folha sem SKU, ou que casa com mais de um: recusa TUDO. Modo
 * teste ligado: recusa.
 */
const Database = require('better-sqlite3');
const path = require('path'), fs = require('fs');
const ESTOQUE = require('./estoque_dominio');
const BAIXA = require('./baixa_dominio');
const { conferir, CONTAGEM } = require('./conferir_contagem_persianas');

function erro(msg){ const e = new Error(msg); e.status = 400; return e; }
function dataBR(d){ const s = String(d || ''); return s.slice(8, 10) + '/' + s.slice(5, 7) + '/' + s.slice(0, 4); }

function validarHora(db, bruto){
  const h = String(bruto || '').trim();
  if(!h) throw erro('falta a hora da contagem (--contado-em "AAAA-MM-DD HH:MM"): o que andou depois dela continua valendo');
  if(!/^\d{4}-\d{2}-\d{2} \d{2}:\d{2}(:\d{2})?$/.test(h)) throw erro('hora da contagem inválida: ' + h + ' (use "AAAA-MM-DD HH:MM")');
  const ce = h.length === 16 ? h + ':00' : h;
  if(db.prepare('SELECT datetime(?) d').get(ce).d !== ce) throw erro('hora da contagem inválida: ' + h);
  if(ce > db.prepare("SELECT datetime('now','localtime') d").get().d) throw erro('a hora da contagem está no futuro: ' + h);
  return ce;
}
const marca = ce => 'contagem_persianas:' + ce.slice(0, 10);

/* Só lê. */
function levantar(db, folha, horaBruta){
  if(BAIXA.emTeste(db)) throw erro('modo teste ligado: desligue antes — esta correção é de saldo de verdade');
  const ce = validarHora(db, horaBruta);
  const ja = db.prepare('SELECT valor FROM config WHERE chave=?').get(marca(ce));
  if(ja) throw erro('a contagem de ' + dataBR(ce) + ' já foi aplicada (' + ja.valor + ')');

  const r = conferir(db, folha);
  if(r.naoAchei.length) throw erro('linha da folha sem SKU cadastrado: ' + r.naoAchei.map(l => l.texto).join('; '));
  if(r.ambiguas.length) throw erro('linha da folha que casa com mais de um SKU: ' +
    r.ambiguas.map(l => l.texto + ' → ' + l.skus.join(', ')).join('; '));

  const andou = db.prepare(`SELECT COALESCE(SUM(m.delta),0) s FROM movimento_estoque m
    WHERE m.codigo=? AND m.criado_em > ?
      AND NOT (m.tipo='conferencia' AND EXISTS (SELECT 1 FROM lote l
               WHERE 'lote:'||l.id = m.referencia AND l.embalado_em <= ?))`);
  const itens = r.itens.map(i => {
    const depoisDaContagem = andou.get(i.codigo, ce, ce).s;
    const alvo = i.contado + depoisDaContagem;
    return { codigo:i.codigo, medida:i.medida, cor:i.cor, saldo:i.saldo, contado:i.contado,
             andou:depoisDaContagem, depois:alvo, delta:alvo - i.saldo, na_folha:i.situacao === 'na_folha' };
  });

  const ajustados = new Set(itens.map(i => String(i.codigo).toUpperCase()));
  const caixas = [], caixasDepois = [], ficam = [];
  for(const v of db.prepare(`SELECT * FROM lote WHERE estagio='embalado' AND baixado_em IS NULL
        AND COALESCE(teste,0)=0 ORDER BY embalado_em, id`).all()){
    const ps = BAIXA.pecas(db, v);
    if(!ps.every(p => p.sob_medida || ajustados.has(p.codigo))){ ficam.push({ id:v.id, codigos:ps.map(p => p.codigo) }); continue; }
    const c = { id:v.id, embalado_em:v.embalado_em, pecas:ps };
    if(v.embalado_em && v.embalado_em <= ce) caixas.push(c); else caixasDepois.push(c);
  }
  return { ce, itens, caixas, caixasDepois, ficam, fora:r.fora };
}

/* Grava. Quem chama abre a transação (R-EST-07). */
function aplicar(db, folha, horaBruta, { quem }){
  const L = levantar(db, folha, horaBruta);
  const nome = (quem && quem.nome) || 'terminal: aplicar_contagem_persianas.js';
  const motivo = 'contagem da prateleira de ' + dataBR(L.ce) + ' (folha) — o saldo vira o contado, decidido por Lucas';
  const ins = db.prepare(`INSERT INTO ajuste_estoque (codigo,antes,depois,delta,motivo,obs,usuario_id,usuario_nome)
    VALUES (?,?,?,?,?,?,?,?)`);
  let skus = 0;
  for(const i of L.itens){
    if(!i.delta) continue;
    const r = ESTOQUE.movimentar(db, { codigo:i.codigo, delta:i.delta, tipo:'ajuste',
      referencia:marca(L.ce), motivo, usuario_nome:nome, aprovado_por:'Lucas (decisão de 04/11/2026)' });
    ins.run(i.codigo, r.antes, r.depois, i.delta, motivo,
      'contado ' + i.contado + (i.andou ? ' · andou ' + (i.andou > 0 ? '+' : '') + i.andou + ' depois da contagem' : '') +
      (i.na_folha ? '' : ' · fora da folha'), null, nome);
    skus++;
  }
  const up = db.prepare('UPDATE lote SET baixado_em=embalado_em WHERE id=? AND baixado_em IS NULL');
  L.caixas.forEach(c => up.run(c.id));
  L.caixasDepois.forEach(c => BAIXA.baixar(db, { id:c.id }, { nome }));
  db.prepare('INSERT INTO config (chave,valor) VALUES (?,?)').run(marca(L.ce),
    new Date().toISOString() + ' · ' + skus + ' SKU(s), ' + L.caixas.length + ' caixa(s) marcadas, ' +
    L.caixasDepois.length + ' baixada(s)');
  return { skus, caixas:L.caixas.length, caixasDepois:L.caixasDepois.length };
}

module.exports = { levantar, aplicar };

if(require.main === module){
  const CAMINHOS = require('./caminhos');
  const args = process.argv.slice(2);
  const APLICAR = args.includes('--aplicar');
  const i = args.indexOf('--contado-em');
  const HORA = i >= 0 ? args[i + 1] : null;

  (async () => {
    const db = new Database(CAMINHOS.BANCO, APLICAR ? {} : { readonly:true, fileMustExist:true });
    console.log('banco:', CAMINHOS.BANCO, '\n');
    let L;
    try{ L = levantar(db, CONTAGEM, HORA); }
    catch(e){
      if(e.status === 400){
        console.error('Recusado: ' + e.message + '.');
        if(!HORA) console.error('Exemplo: node aplicar_contagem_persianas.js --contado-em "2026-11-04 08:00"');
        db.close(); process.exit(2);
      }
      throw e;
    }
    const pad = (s, n) => String(s).padEnd(n), num = (s, n) => String(s).padStart(n);
    console.log('contagem de ' + L.ce.slice(0, 16) + ' — o saldo de cada persiana vira o contado\n');
    console.log(pad('SKU', 22) + pad('medida', 10) + pad('cor', 8) + num('saldo', 6) + num('contado', 8) + num('andou', 7) + num('fica', 6) + num('muda', 7));
    console.log('-'.repeat(74));
    L.itens.slice().sort((a, b) => Math.abs(b.delta) - Math.abs(a.delta)).forEach(x =>
      console.log(pad(x.codigo, 22) + pad(x.medida, 10) + pad(x.cor, 8) + num(x.saldo, 6) + num(x.contado, 8) +
        num(x.andou ? (x.andou > 0 ? '+' : '') + x.andou : '', 7) + num(x.depois, 6) + num(x.delta > 0 ? '+' + x.delta : x.delta, 7) +
        (x.na_folha ? '' : '  fora da folha')));
    console.log('\n' + L.itens.filter(x => x.delta).length + ' SKU(s) mudam.');
    console.log(L.caixas.length + ' caixa(s) impressas até a contagem e nunca conferidas passam a contar como fora do saldo');
    console.log('  (não deixam o livre negativo, e conferi-las depois não baixa de novo).');
    if(L.caixasDepois.length) console.log(L.caixasDepois.length + ' caixa(s) impressas DEPOIS da contagem ganham a baixa (−1 por peça).');
    console.log('Depois de aplicar, nenhuma caixa fica reservando peça ("em caixa" zerado).');
    if(L.ficam.length) console.log(L.ficam.length + ' caixa(s) de outro SKU ficam como estão: ' + L.ficam.map(c => '#' + c.id).join(', '));
    if(L.fora.length) console.log('Não mexo em: ' + L.fora.map(f => f.codigo + ' (' + f.saldo + ', ' + f.por + ')').join(' · '));

    if(!APLICAR){
      console.log('\nSIMULAÇÃO — nada foi gravado.');
      console.log('  node aplicar_contagem_persianas.js --contado-em "' + L.ce.slice(0, 16) + '" --aplicar');
      db.close(); return;
    }
    fs.mkdirSync(CAMINHOS.BACKUPS, { recursive:true });
    const bkp = path.join(CAMINHOS.BACKUPS, 'antes-contagem-persianas-' + new Date().toISOString().replace(/[:.]/g, '-') + '.db');
    await db.backup(bkp);
    console.log('\nbackup -> ' + bkp);
    const r = db.transaction(() => aplicar(db, CONTAGEM, HORA, { quem:{ nome:'terminal: aplicar_contagem_persianas.js' } }))();
    console.log('aplicada: ' + r.skus + ' SKU(s) ajustados · ' + r.caixas + ' caixa(s) fora do saldo · ' +
      r.caixasDepois + ' baixada(s).');
    console.log('Confira: node conferir_contagem_persianas.js');
    db.close();
  })().catch(e => { console.error('erro:', e.message); process.exit(1); });
}

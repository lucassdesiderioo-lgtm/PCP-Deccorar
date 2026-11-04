#!/usr/bin/env node
/* teste_ajustar_fila_embalagem.js — a fila da Embalagem vira a contagem da mesa.
 *
 *   node teste_ajustar_fila_embalagem.js
 *
 * Escrito ANTES do script. Decisão do dono em 04/11/2026: na mesa de
 * embalagem, no fim do dia, só havia 140x140 Branco 2, 150x150 Cinza 3 e
 * 150x150 Bege 2 — "zera o resto". O que ele trava:
 *   - cada SKU da folha fica com exatamente o contado em `aguardando`;
 *   - sobra: sai a linha MAIS ANTIGA (a recente é a que está na mesa), pela
 *     ação "Tirar da fila" da Mesa de correções, com desfazer;
 *   - falta: entra linha nova `aguardando`, modo `estoque` (não abate a
 *     ordem do dia, R-EMB-03);
 *   - o resto da fila sai inteiro (qualquer SKU);
 *   - a linha `embalado` e a de teste não se tocam (R-EMB-07);
 *   - o estoque não se mexe;
 *   - linha da folha sem SKU ou ambígua recusa tudo;
 *   - o script simula sem --aplicar, e grava com backup.
 */
const Database = require('better-sqlite3');
const fs = require('fs'), os = require('os'), path = require('path');
const { execFileSync } = require('child_process');

let n = 0, falhas = 0;
function ok(desc, cond, detalhe){
  n++;
  if(cond) console.log('  ok  ' + n + ' — ' + desc);
  else { falhas++; console.log('  FALHOU ' + n + ' — ' + desc + (detalhe ? '\n         ' + detalhe : '')); }
}
function eq(desc, achado, esperado){
  ok(desc, achado === esperado, 'esperado ' + JSON.stringify(esperado) + ', veio ' + JSON.stringify(achado));
}

const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'pcp-fila-'));
const SCRIPT = path.join(__dirname, 'ajustar_fila_embalagem.js');
const MESA = [
  { largura:140, altura:140, cor:'BRANCO', qtd:2 },
  { largura:150, altura:150, cor:'CINZA',  qtd:3 },
  { largura:150, altura:150, cor:'BEGE',   qtd:2 },
];

function montar(arq){
  const db = new Database(arq);
  db.exec(`
    CREATE TABLE config (chave TEXT PRIMARY KEY, valor TEXT);
    CREATE TABLE modelo (id INTEGER PRIMARY KEY, codigo TEXT, nome TEXT, exige_medida INTEGER DEFAULT 1, sob_medida INTEGER DEFAULT 0);
    CREATE TABLE skus (codigo TEXT PRIMARY KEY, descricao TEXT DEFAULT '', estoque INTEGER DEFAULT 0, alvo INTEGER DEFAULT 0,
      modelo_id INTEGER, largura_cm INTEGER, altura_cm INTEGER, cor_codigo TEXT, ativo INTEGER DEFAULT 1);
    CREATE TABLE lote (id INTEGER PRIMARY KEY AUTOINCREMENT, codigo TEXT, estagio TEXT, embalado_em TEXT, baixado_em TEXT, teste INTEGER DEFAULT 0);
    CREATE TABLE fila (id INTEGER PRIMARY KEY AUTOINCREMENT, codigo TEXT,
      modo TEXT DEFAULT 'hoje', situacao TEXT DEFAULT 'aguardando',
      revisado_em TEXT DEFAULT (datetime('now','localtime')), embalado_em TEXT,
      data TEXT DEFAULT (date('now','localtime')), teste INTEGER DEFAULT 0);
    INSERT INTO modelo VALUES (1,'ROLO','Rolô',1,0),(2,'ACESSORIO','Acessório',0,0);
    INSERT INTO skus (codigo,estoque,modelo_id,largura_cm,altura_cm,cor_codigo) VALUES
      ('BK140140BRANCO',61,1,140,140,'BRANCO'),
      ('BK150150CINZA',32,1,150,150,'CINZA'),
      ('BK150150BEGE',0,1,150,150,'BEGE'),
      ('BK160160CINZA',21,1,160,160,'CINZA'),
      ('KIT32',5,2,NULL,NULL,'');
  `);
  const f = db.prepare('INSERT INTO fila (codigo,modo,situacao,revisado_em,teste) VALUES (?,?,?,?,?)');
  // 140x140 branco: 5 esperando (vão sobrar 2, as mais recentes)
  ['2026-10-01','2026-10-20','2026-11-01','2026-11-04 09:00','2026-11-04 15:00'].forEach(d =>
    f.run('BK140140BRANCO','hoje','aguardando',d,0));
  // 150x150 cinza: 1 esperando (faltam 2)
  f.run('BK150150CINZA','estoque','aguardando','2026-11-04 10:00',0);
  // 150x150 bege: nenhuma (faltam 2)
  // resto: sai tudo
  f.run('BK160160CINZA','hoje','aguardando','2026-09-01',0);
  f.run('BK160160CINZA','devolucao','aguardando','2026-11-02',0);
  f.run('KIT32','estoque','aguardando','2026-11-03',0);
  // não se tocam: embalada e de teste
  f.run('BK160160CINZA','hoje','embalado','2026-10-01',0);
  f.run('BK140140BRANCO','hoje','aguardando','2026-11-04 08:00',1);
  return db;
}

const arq = path.join(tmp, 'a.db');
let db = montar(arq);
const F = require('./ajustar_fila_embalagem');
const esperando = c => db.prepare("SELECT COUNT(*) n FROM fila WHERE codigo=? AND situacao='aguardando' AND COALESCE(teste,0)=0").get(c).n;
const saldos = () => JSON.stringify(db.prepare('SELECT codigo,estoque FROM skus ORDER BY codigo').all());

console.log('\n1. a prévia');
const L = F.levantar(db, MESA);
const it = c => L.itens.find(i => i.codigo === c);
eq('140x140 branco: tem 5, fica 2, tira 3', JSON.stringify([it('BK140140BRANCO').tem, it('BK140140BRANCO').fica, it('BK140140BRANCO').tirar.length]), '[5,2,3]');
eq('150x150 cinza: tem 1, põe 2', JSON.stringify([it('BK150150CINZA').tem, it('BK150150CINZA').por]), '[1,2]');
eq('150x150 bege: tem 0, põe 2', it('BK150150BEGE').por, 2);
eq('o resto: tira as 3 (160 cinza ×2, kit)', L.resto.length, 3);
ok('tira as MAIS ANTIGAS do 140x140', it('BK140140BRANCO').tirar.every(l => l.revisado_em < '2026-11-04'));
ok('a prévia não gravou', esperando('BK140140BRANCO') === 5);

console.log('\n2. aplicar');
const antes = saldos();
const R = db.transaction(() => F.aplicar(db, MESA, { quem:{ id:null, nome:'terminal: teste' }, motivo:'contagem da mesa' }))();
eq('140x140 branco: 2 esperando', esperando('BK140140BRANCO'), 2);
eq('150x150 cinza: 3', esperando('BK150150CINZA'), 3);
eq('150x150 bege: 2', esperando('BK150150BEGE'), 2);
eq('160x160 cinza: 0', esperando('BK160160CINZA'), 0);
eq('kit: 0', esperando('KIT32'), 0);
eq('ficaram as 2 mais recentes do 140x140', JSON.stringify(db.prepare("SELECT revisado_em FROM fila WHERE codigo='BK140140BRANCO' AND situacao='aguardando' AND teste=0 ORDER BY id").all().map(r => r.revisado_em)),
  JSON.stringify(['2026-11-04 09:00','2026-11-04 15:00']));
eq('as novas entram como estoque (não abatem a ordem do dia)',
  db.prepare("SELECT COUNT(*) n FROM fila WHERE codigo='BK150150BEGE' AND modo='estoque'").get().n, 2);
eq('a linha embalada continua', db.prepare("SELECT COUNT(*) n FROM fila WHERE situacao='embalado'").get().n, 1);
eq('a linha de teste continua', db.prepare("SELECT COUNT(*) n FROM fila WHERE teste=1").get().n, 1);
eq('o estoque não se mexeu', saldos(), antes);
eq('uma correção na Mesa por linha tirada (3 + 3)', db.prepare("SELECT COUNT(*) n FROM correcao WHERE acao='fila'").get().n, 6);
eq('o resumo', R.tiradas + '/' + R.postas, '6/4');

console.log('\n3. de novo não muda nada');
const R2 = db.transaction(() => F.aplicar(db, MESA, { quem:{ id:null, nome:'terminal: teste' }, motivo:'de novo' }))();
eq('nada tirado, nada posto', R2.tiradas + '/' + R2.postas, '0/0');
db.close();

console.log('\n4. folha que não fecha');
db = montar(path.join(tmp, 'b.db'));
let e = null; try{ F.levantar(db, MESA.concat([{ largura:130, altura:130, cor:'BEGE', qtd:1 }])); }catch(x){ e = x; }
ok('linha sem SKU: recusa', e && /130×130/.test(e.message));
db.prepare("INSERT INTO skus (codigo,modelo_id,largura_cm,altura_cm,cor_codigo) VALUES ('SC150150BEGE',1,150,150,'BEGE')").run();
e = null; try{ F.levantar(db, MESA); }catch(x){ e = x; }
ok('linha ambígua: recusa', e && /mais de um SKU/.test(e.message));
db.close();

console.log('\n5. o script do terminal');
const arq3 = path.join(tmp, 'c.db');
db = montar(arq3); db.close();
const env = Object.assign({}, process.env, { PCP_DB:arq3, PCP_BACKUPS:path.join(tmp, 'bk') });
function rodar(args){
  try{ return { cod:0, out:execFileSync(process.execPath, [SCRIPT].concat(args), { env, encoding:'utf8', stdio:'pipe' }) }; }
  catch(x){ return { cod:x.status == null ? 1 : x.status, out:String(x.stdout || '') + String(x.stderr || '') }; }
}
const conta = () => { const d = new Database(arq3, { readonly:true }); const s = d.prepare("SELECT COUNT(*) n FROM fila WHERE situacao='aguardando' AND teste=0").get().n; d.close(); return s; };
let t = rodar([]);
ok('simula', t.cod === 0 && /SIMULA/.test(t.out), t.out);
eq('e não gravou', conta(), 9);
t = rodar(['--aplicar']);
ok('aplica', t.cod === 0 && /aplicad/i.test(t.out), t.out);
eq('ficam 7 esperando', conta(), 7);
ok('backup antes', fs.readdirSync(path.join(tmp, 'bk')).some(f => /^antes-fila-embalagem-/.test(f)));

fs.rmSync(tmp, { recursive:true, force:true });
console.log('\n' + (n - falhas) + '/' + n + ' ok' + (falhas ? ' — ' + falhas + ' FALHOU' : ''));
process.exit(falhas ? 1 : 0);

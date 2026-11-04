#!/usr/bin/env node
/* teste_conferir_contagem_persianas.js — a conta da folha contra o sistema.
 *
 *   node teste_conferir_contagem_persianas.js
 *
 * O script só LÊ, mas o número dele guia um ajuste de saldo — 🔴 (§0). Os
 * casos travam: o SKU achado pelas COLUNAS (§7), a folha contando a
 * PRATELEIRA (o que está em caixa soma no saldo novo, §2), o fora da folha
 * virando zero só para persiana, a linha ambígua sem repartir e sem zerar, e
 * o banco aberto sem nada gravado.
 */
const Database = require('better-sqlite3');
const fs = require('fs'), os = require('os'), path = require('path');
const { conferir, CONTAGEM } = require('./conferir_contagem_persianas');

let n = 0, falhas = 0;
function ok(cond, nome){ n++; if(cond) console.log('  ok  ' + nome); else { falhas++; console.log('  FALHOU  ' + nome); } }

function banco(){
  const db = new Database(':memory:');
  db.exec(`
    CREATE TABLE modelo (id INTEGER PRIMARY KEY, codigo TEXT, nome TEXT, exige_medida INTEGER DEFAULT 1, sob_medida INTEGER DEFAULT 0);
    CREATE TABLE skus (codigo TEXT PRIMARY KEY, estoque INTEGER DEFAULT 0, modelo_id INTEGER, largura_cm INTEGER,
      altura_cm INTEGER, cor_codigo TEXT, ativo INTEGER DEFAULT 1);
    CREATE TABLE lote (id INTEGER PRIMARY KEY, codigo TEXT, estagio TEXT, baixado_em TEXT);
    CREATE TABLE lote_item (id INTEGER PRIMARY KEY, lote_id INTEGER, codigo TEXT, qtd INTEGER);
    CREATE TABLE ajuste_pedido (id INTEGER PRIMARY KEY, codigo TEXT, status TEXT);
    INSERT INTO modelo VALUES (1,'ROLO','Rolô',1,0),(2,'ACESSORIO','Acessório',0,0),(3,'SOBMEDIDA','Sob medida',0,1);
  `);
  const s = db.prepare('INSERT INTO skus (codigo,estoque,modelo_id,largura_cm,altura_cm,cor_codigo,ativo) VALUES (?,?,?,?,?,?,?)');
  s.run('BK160160CINZA', 10, 1, 160, 160, 'CINZA', 1);   // na folha: 21
  s.run('BK160140CINZA', 120, 1, 160, 140, 'CINZA', 1);  // na folha: 114, com 3 em caixa
  s.run('BK140160CINZA', 4, 1, 140, 160, 'CINZA', 1);    // medida invertida: NÃO é o 160×140
  s.run('BK180180BEGE', 5, 1, 180, 180, 'BEGE', 1);      // fora da folha → 0
  s.run('BK100100BEGE', 27, 1, 100, 100, 'BEGE', 1);     // na folha: 27, bate
  s.run('KIT32', 40, 2, null, null, '', 1);              // acessório: fora da conta
  s.run('SOBMEDIDA', 0, 3, null, null, '', 1);           // sob medida: fora
  s.run('BK120120CINZA', 9, 1, 120, 120, 'CINZA', 0);    // inativo: fora
  s.run('BK150150BRANCO', 3, 1, 150, 150, 'BRANCO', 1);  // duas persianas com a mesma medida e cor
  s.run('SC150150BRANCO', 2, 1, 150, 150, 'BRANCO', 1);
  // em caixa: 2 volumes impressos e não conferidos + 1 de pacote com 1 peça; 1 já baixado não conta
  db.exec(`INSERT INTO lote VALUES (1,'BK160140CINZA','embalado',NULL),(2,'BK160140CINZA','embalado',NULL),
    (3,'BK160140CINZA','embalado','2026-11-01'),(4,'BK160140CINZA','carregado',NULL),(5,'BK160140CINZA','embalado',NULL);
    INSERT INTO lote_item (lote_id,codigo,qtd) VALUES (5,'BK160140CINZA',1);
    INSERT INTO ajuste_pedido (codigo,status) VALUES ('BK180180BEGE','pendente'),('BK100100BEGE','aprovado');`);
  return db;
}

const folha = [
  { largura:160, altura:160, cor:'CINZA', qtd:21 },
  { largura:160, altura:140, cor:'cinza', qtd:114 },
  { largura:100, altura:100, cor:'BEGE', qtd:27 },
  { largura:150, altura:150, cor:'BRANCO', qtd:17 },
  { largura:130, altura:130, cor:'BEGE', qtd:6 },
];

console.log('\n1. a conta SKU a SKU');
let db = banco();
let r = conferir(db, folha);
const por = c => r.itens.find(i => i.codigo === c);
ok(por('BK160160CINZA').contado === 21 && por('BK160160CINZA').diferenca === 11, '160×160 cinza: 21 contadas, saldo 10 → +11');
ok(por('BK160140CINZA').em_caixa === 3, 'em caixa: 3 impressas sem baixa (a baixada e a carregada não contam)');
ok(por('BK160140CINZA').livre === 117 && por('BK160140CINZA').diferenca === -3, 'livre = 120 − 3 = 117; contado 114 → −3');
ok(por('BK160140CINZA').saldo_novo === 117, 'saldo novo = contado + em caixa (114 + 3), não o contado');
ok(por('BK100100BEGE').diferenca === 0, 'o que bate dá diferença 0');
ok(por('BK100100BEGE').ajuste_pendente === false, 'ajuste já aprovado não conta como pendente');

console.log('\n2. a medida pelas colunas, na ordem largura × altura');
ok(por('BK140160CINZA').situacao === 'zerado' && por('BK140160CINZA').contado === 0,
  '140×160 não pega o 160×140 da folha');
ok(String(folha[1].cor) === 'cinza' && por('BK160140CINZA').situacao === 'na_folha', 'a cor casa sem diferença de maiúscula');

console.log('\n3. fora da folha é zero — só para persiana');
ok(por('BK180180BEGE').situacao === 'zerado' && por('BK180180BEGE').diferenca === -5 && por('BK180180BEGE').saldo_novo === 0,
  'persiana fora da folha: contado 0, −5');
ok(por('BK180180BEGE').ajuste_pendente === true, 'avisa o ajuste já pendente no SKU');
ok(!por('KIT32') && !por('SOBMEDIDA') && !por('BK120120CINZA'), 'acessório, sob medida e inativo não entram como zerados');
ok(r.fora.some(f => f.codigo === 'KIT32' && /não é persiana/.test(f.por)) && r.fora.some(f => f.codigo === 'BK120120CINZA'),
  'os que ficaram de fora COM saldo aparecem, dizendo por quê');
ok(!r.fora.some(f => f.codigo === 'SOBMEDIDA'), 'fora da conta com saldo zero não polui a lista');

console.log('\n4. a linha ambígua e a que não acha SKU');
ok(por('BK150150BRANCO').situacao === 'ambiguo' && por('SC150150BRANCO').situacao === 'ambiguo', 'duas persianas iguais: as duas ambíguas');
ok(por('BK150150BRANCO').contado === null && por('BK150150BRANCO').saldo_novo === null, 'a ambígua não vira zero nem ganha número');
ok(r.ambiguas.length === 1 && r.ambiguas[0].skus.length === 2, 'a linha ambígua é listada com os SKUs');
ok(r.naoAchei.length === 1 && r.naoAchei[0].largura === 130, 'linha sem SKU aparece em "não achei"');
let r2 = conferir(banco(), [{ largura:160, altura:160, cor:'CINZA', qtd:21 }, { largura:160, altura:160, cor:'CINZA', qtd:5 }]);
ok(r2.itens.find(i => i.codigo === 'BK160160CINZA').situacao === 'ambiguo', 'a mesma medida duas vezes na folha não decide sozinha');

console.log('\n5. o resumo');
ok(r.resumo.na_folha === 3 && r.resumo.ambiguos === 2 && r.resumo.zerados === 2, 'contagem das situações');
ok(r.resumo.batem === 1 && r.resumo.pecas_a_mais === 11 && r.resumo.pecas_a_menos === 3 + 4 + 5, 'peças a mais e a menos');

console.log('\n6. só lê');
const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'contagem-'));
const arq = path.join(dir, 'd.db');
db = banco(); db.exec(`VACUUM INTO '${arq}'`); db.close();
const antes = fs.readFileSync(arq);
const ro = new Database(arq, { readonly:true, fileMustExist:true });
conferir(ro, CONTAGEM); ro.close();
ok(Buffer.compare(antes, fs.readFileSync(arq)) === 0, 'o arquivo do banco sai byte a byte igual');
fs.rmSync(dir, { recursive:true, force:true });
ok(CONTAGEM.length === 13 && CONTAGEM.reduce((s, l) => s + l.qtd, 0) === 408, 'a folha de 04/11/2026: 13 linhas, 408 peças');

console.log(`\n${n - falhas}/${n} ok` + (falhas ? ` — ${falhas} FALHOU` : ''));
process.exit(falhas ? 1 : 0);

#!/usr/bin/env node
/* teste_carregados.js — a conta do passivo da dívida 13.
 *
 *   node teste_carregados.js
 *
 * O `conferir_carregados.js` só LÊ, e mesmo assim tem teste. O motivo é que o
 * número dele é o que vai guiar um **ajuste de saldo à mão** — 🔴 por definição
 * (§0). Uma conta que move estoque não pode ser a única coisa do sistema sem
 * ninguém olhando, mesmo quando quem a executa é uma pessoa.
 *
 * O que estes casos travam, e por que cada um existe:
 *
 *  1. A MARCA QUE SEPARA OS DOIS CASOS É UMA CONVENÇÃO. Volume carregado sem
 *     `embalado_em` pode ser o bipe que pulou a etiqueta (a dívida 13) OU um
 *     passivo fechado à mão pelos scripts do §5 — e os dois deixam o campo
 *     vazio. O que os separa é a hora `15:00:00` que os scripts carimbam por
 *     convenção (§8). Afrouxar isso mistura decisão humana com defeito.
 *
 *  2. A CONTA É POR PEÇA, NÃO POR VOLUME (§5, armadilha #23). A caixa de
 *     pacote leva N persianas e deveria ter baixado N.
 *
 *  3. SOB MEDIDA FICA DE FORA (§7). Ela nunca soma +1 na embalagem, então
 *     também não devia baixar: cobrar a baixa dela abriria um buraco em vez de
 *     fechar — seria o conserto criando o defeito que veio consertar.
 */
const Database = require('better-sqlite3');
const fs = require('fs'), os = require('os'), path = require('path');
const { levantar } = require('./conferir_carregados');

let n = 0, falhas = 0;
function ok(desc, cond, detalhe){
  n++;
  if(cond) console.log('  ok  ' + n + ' — ' + desc);
  else { falhas++; console.log('  FALHOU ' + n + ' — ' + desc + (detalhe ? '\n         ' + detalhe : '')); }
}
function eq(desc, achado, esperado){
  ok(desc, achado === esperado, 'esperado ' + JSON.stringify(esperado) + ', veio ' + JSON.stringify(achado));
}

const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'pcp-carregados-'));
const db = new Database(path.join(tmp, 't.db'));
db.exec(`
  CREATE TABLE modelo (id INTEGER PRIMARY KEY, codigo TEXT, nome TEXT, sob_medida INTEGER DEFAULT 0);
  CREATE TABLE skus (codigo TEXT PRIMARY KEY, estoque INTEGER DEFAULT 0, modelo_id INTEGER);
  CREATE TABLE lote (id INTEGER PRIMARY KEY AUTOINCREMENT, codigo TEXT, buyer TEXT, nf TEXT,
    estagio TEXT, data TEXT, despachar_em TEXT, embalado_em TEXT, carregado_em TEXT, modalidade TEXT);
  CREATE TABLE lote_item (id INTEGER PRIMARY KEY AUTOINCREMENT, lote_id INTEGER, codigo TEXT, qtd INTEGER DEFAULT 1);
  INSERT INTO modelo (id,codigo,nome,sob_medida) VALUES (1,'ROLO','Rolô',0),(2,'SM','Sob medida',1);
  INSERT INTO skus (codigo,estoque,modelo_id) VALUES ('BK140140BEGE',12,1),('BK160160CINZA',5,1),('SOBMEDIDA',0,2);
`);
const hoje = db.prepare("SELECT date('now','localtime') d").get().d;
const ins = db.prepare(`INSERT INTO lote (codigo,buyer,nf,estagio,data,embalado_em,carregado_em)
  VALUES (?,?,?,'carregado',?,?,?)`);

console.log('\n── 1. os três tipos de volume carregado ──');
// o normal: passou pela Etiqueta de Venda, baixou
ins.run('BK140140BEGE','Cliente Normal','9001',hoje, hoje+' 11:02:33', hoje+' 14:20:10');
// fechado à mão pelos scripts do §5: sem embalado_em, mas com a hora de convenção
ins.run('BK140140BEGE','Passivo Antigo','9002',hoje, null, hoje+' 15:00:00');
// o furo da dívida 13: bipado no carregamento sem passar pela etiqueta
ins.run('BK140140BEGE','Furo Um','9003',hoje, null, hoje+' 16:41:07');
ins.run('BK160160CINZA','Furo Dois','9004',hoje, null, hoje+' 09:12:55');

let r = levantar(db, {});
eq('conta os carregados', r.total, 4);
eq('o que passou pela etiqueta não entra', r.comEtiqueta, 1);
eq('o fechado à mão é separado, não acusado', r.porScript, 1);
eq('sobram os dois que saíram sem baixar', r.semBaixa, 2);
ok('e eles são nomeados', r.volumes.map(v => v.nf).join(',') === '9004,9003'
   || r.volumes.map(v => v.nf).sort().join(',') === '9003,9004',
   JSON.stringify(r.volumes.map(v => v.nf)));

console.log('\n── 2. o saldo que o sistema tem a mais ──');
eq('duas peças, uma de cada SKU', r.pecasTotal, 2);
eq('em dois SKUs', r.porSku.length, 2);
ok('a linha traz o saldo de hoje, pra comparar com a prateleira',
   r.porSku.every(l => typeof l.estoque === 'number'), JSON.stringify(r.porSku));

console.log('\n── 3. SOB MEDIDA fica de fora (§7) ──');
/* Ela nunca somou +1 na embalagem: cobrar a baixa abriria um buraco de uma
   peça, que é o defeito contrário ao que se está medindo. */
ins.run('SOBMEDIDA','Furo Sob Medida','9005',hoje, null, hoje+' 10:00:01');
r = levantar(db, {});
eq('o volume aparece na lista (saiu sem etiqueta, é fato)', r.semBaixa, 3);
eq('mas NÃO entra na conta de saldo', r.pecasTotal, 2);
eq('e é contado à parte, com o motivo', r.sobMedida, 1);

console.log('\n── 4. a caixa de pacote conta PEÇAS, não volumes (§5 #23) ──');
const pac = ins.run('BK140140BEGE','Furo Pacote','9006',hoje, null, hoje+' 17:30:22').lastInsertRowid;
db.prepare("INSERT INTO lote_item (lote_id,codigo,qtd) VALUES (?,'BK140140BEGE',1),(?,'BK160160CINZA',2)").run(pac,pac);
r = levantar(db, {});
eq('um volume a mais na lista', r.semBaixa, 4);
eq('mas TRÊS peças a mais na conta (1 + 2)', r.pecasTotal, 5);
const cinza = r.porSku.find(l => l.codigo === 'BK160160CINZA');
eq('o SKU do irmão do pacote soma as duas unidades', cinza.qtd, 3);
ok('e o volume do pacote aparece nos dois SKUs', cinza.volumes.indexOf(pac) >= 0);

console.log('\n── 5. SKU fora do cadastro não vira número inventado ──');
ins.run('NAOEXISTE','Furo Sem Cadastro','9007',hoje, null, hoje+' 18:00:00');
r = levantar(db, {});
eq('ele é listado à parte', r.semCadastro.length, 1);
eq('e não entra na conta de peças', r.pecasTotal, 5);

console.log('\n── 6. a janela em dias ──');
db.prepare("UPDATE lote SET data=date('now','localtime','-90 day') WHERE nf='9003'").run();
r = levantar(db, {dias:30});
eq('o volume velho sai da janela de 30 dias', r.semBaixa, 4);
r = levantar(db, {});
eq('e continua na conta de todo o histórico', r.semBaixa, 5);

console.log('\n────────────────────────────────────────────');
console.log(falhas ? '  ' + falhas + ' de ' + n + ' FALHARAM' : '  todos os ' + n + ' casos passaram');
try{ db.close(); fs.rmSync(tmp, {recursive:true, force:true}); }catch(e){}
process.exit(falhas ? 1 : 0);

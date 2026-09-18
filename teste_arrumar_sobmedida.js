#!/usr/bin/env node
/* teste_arrumar_sobmedida.js — o reparo de cadastro de 18/09/2026.
 *
 *   node teste_arrumar_sobmedida.js
 *
 * O `arrumar_sobmedida.js` mexe em CADASTRO DE PRODUÇÃO, e é 🔴 por isso: o
 * modelo que ele cria decide se a Etiqueta de Venda cobra estoque de uma peça
 * (§7) — e a flag `sob_medida` já ficou três semanas inerte uma vez, sem que
 * nada acusasse (§7, armadilha #30). Reparo de dado feito à mão foi justamente
 * o que produziu o estado que este script vem consertar.
 *
 * O banco de mentira monta o estado EXATO de 18/09/2026, com os quatro defeitos
 * juntos, porque é assim que eles apareceram:
 *
 *   1. nenhum modelo com `sob_medida = 1`, e o SKU SOBMEDIDA apontando pra ROLO;
 *   2. o texto "Sob medida " parado no campo livre `cor`;
 *   3. um SKU vazio (BKSOBMEDIDA) nascido de uma edição no campo do código;
 *   4. quatro cadastros desativados por engano (SCREEN3, BEGE, BRANCO, CINZA).
 *
 * ⚠️ A GUARDA DO APAGAR É O CASO QUE MAIS IMPORTA AQUI. Apagar um SKU que tem
 * volume atrás devolve aquele volume para `bloqueado` (§6) — a caixa para na
 * expedição e ninguém liga isso a um script rodado dias antes. Por isso o
 * script confere DEZ tabelas antes, e na dúvida não apaga: SKU a mais é ruído,
 * SKU a menos é caixa parada.
 */
const Database = require('better-sqlite3');
const fs = require('fs'), os = require('os'), path = require('path');
const { arrumar } = require('./arrumar_sobmedida');

let n = 0, falhas = 0;
function ok(desc, cond, detalhe){
  n++;
  if(cond) console.log('  ok  ' + n + ' — ' + desc);
  else { falhas++; console.log('  FALHOU ' + n + ' — ' + desc + (detalhe ? '\n         ' + detalhe : '')); }
}
function eq(desc, achado, esperado){
  ok(desc, achado === esperado, 'esperado ' + JSON.stringify(esperado) + ', veio ' + JSON.stringify(achado));
}

const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'pcp-arrumar-'));

/* O estado de 18/09/2026, montado do zero a cada caso. */
function bancoDeHoje(){
  const db = new Database(path.join(tmp, 'b' + (n + Math.random()) + '.db'));
  db.exec(`
    CREATE TABLE modelo (id INTEGER PRIMARY KEY AUTOINCREMENT, codigo TEXT UNIQUE, nome TEXT,
      ativo INTEGER DEFAULT 1, exige_medida INTEGER DEFAULT 1, sob_medida INTEGER DEFAULT 0);
    CREATE TABLE tecido (codigo TEXT PRIMARY KEY, nome TEXT, ativo INTEGER DEFAULT 1);
    CREATE TABLE cor (codigo TEXT PRIMARY KEY, nome TEXT, ativa INTEGER DEFAULT 1);
    CREATE TABLE skus (codigo TEXT PRIMARY KEY, descricao TEXT DEFAULT '', cor TEXT DEFAULT '',
      estoque INTEGER DEFAULT 0, alvo INTEGER DEFAULT 0, modelo_id INTEGER,
      largura_cm INTEGER, altura_cm INTEGER, cor_codigo TEXT, tecido_codigo TEXT);
    CREATE TABLE lote (id INTEGER PRIMARY KEY AUTOINCREMENT, codigo TEXT, estagio TEXT);
    CREATE TABLE lote_item (id INTEGER PRIMARY KEY AUTOINCREMENT, lote_id INTEGER, codigo TEXT);
    CREATE TABLE fila (id INTEGER PRIMARY KEY AUTOINCREMENT, codigo TEXT);
    CREATE TABLE producao (id INTEGER PRIMARY KEY AUTOINCREMENT, codigo TEXT);
    CREATE TABLE revisao (id INTEGER PRIMARY KEY AUTOINCREMENT, codigo TEXT);
    CREATE TABLE montagem (id INTEGER PRIMARY KEY AUTOINCREMENT, codigo TEXT);
    CREATE TABLE contagem (id INTEGER PRIMARY KEY AUTOINCREMENT, codigo TEXT);
    CREATE TABLE rejeicao (id INTEGER PRIMARY KEY AUTOINCREMENT, codigo TEXT);
    CREATE TABLE ajuste_estoque (id INTEGER PRIMARY KEY AUTOINCREMENT, codigo TEXT);
    CREATE TABLE devolucao (id INTEGER PRIMARY KEY AUTOINCREMENT, sku_fisico TEXT, sku_venda TEXT);

    INSERT INTO modelo (id,codigo,nome,ativo,exige_medida,sob_medida)
      VALUES (2,'ROLO','Rolô',1,1,0),(3,'ACESSORIO','Acessório',1,0,0);
    INSERT INTO tecido (codigo,nome,ativo) VALUES ('BLACKOUT','Blackout',1),('SCREEN3','Screen 3%',0);
    INSERT INTO cor (codigo,nome,ativa) VALUES ('BEGE',NULL,0),('BRANCO',NULL,0),('CINZA',NULL,0);

    INSERT INTO skus (codigo,cor,estoque,modelo_id) VALUES ('SOBMEDIDA','Sob medida ',0,2);
    INSERT INTO skus (codigo) VALUES ('BKSOBMEDIDA');
    INSERT INTO skus (codigo,estoque,modelo_id,largura_cm,altura_cm)
      VALUES ('BK140140BEGE',12,2,140,140);
  `);
  return db;
}
const sku = (db,c) => db.prepare('SELECT * FROM skus WHERE codigo=?').get(c);
const mod = (db,c) => db.prepare('SELECT * FROM modelo WHERE codigo=?').get(c);

console.log('\n── 1. a simulação não grava nada ──');
/* Sem --aplicar, NADA muda. É o que permite rodar em produção antes de decidir,
   e é o padrão dos outros scripts de reparo do projeto (§5). */
let db = bancoDeHoje();
let r = arrumar(db, { aplicar:false });
eq('o modelo Sob medida NÃO foi criado', mod(db,'SOBMEDIDA'), undefined);
eq('o SKU continua no Rolô', sku(db,'SOBMEDIDA').modelo_id, 2);
eq('a cor suja continua lá', sku(db,'SOBMEDIDA').cor, 'Sob medida ');
eq('o SKU vazio continua lá', !!sku(db,'BKSOBMEDIDA'), true);
eq('as cores continuam inativas', db.prepare("SELECT ativa a FROM cor WHERE codigo='BEGE'").get().a, 0);
ok('mas ele DIZ o que faria', r.acoes.length >= 5, JSON.stringify(r.acoes));
db.close();

console.log('\n── 2. com --aplicar: o modelo nasce com as duas flags certas ──');
/* ⚠️ As duas flags são o ponto inteiro do reparo. `sob_medida=1` tira a peça da
   trava de estoque e da baixa (§7); `exige_medida=0` evita que ela fique eterna
   em Pendências de SKU — contador que nunca zera é contador que se ignora. */
db = bancoDeHoje();
r = arrumar(db, { aplicar:true });
const m = mod(db,'SOBMEDIDA');
ok('o modelo existe', !!m);
eq('nome legível', m.nome, 'Sob medida');
eq('sob medida = sim', m.sob_medida, 1);
eq('tem medida = não', m.exige_medida, 0);
eq('e nasce ativo', m.ativo, 1);

console.log('\n── 3. o SKU passa a apontar pra ele, e a cor suja sai ──');
const s = sku(db,'SOBMEDIDA');
eq('o SKU aponta pro modelo novo', s.modelo_id, m.id);
eq('o texto que foi parar na cor saiu', s.cor, '');
eq('o saldo NÃO se mexe', s.estoque, 0);
eq('largura continua vazia', s.largura_cm, null);
eq('altura continua vazia', s.altura_cm, null);

console.log('\n── 4. os quatro desativados por engano voltam ──');
eq('SCREEN3 volta', db.prepare("SELECT ativo a FROM tecido WHERE codigo='SCREEN3'").get().a, 1);
eq('BEGE volta',   db.prepare("SELECT ativa a FROM cor WHERE codigo='BEGE'").get().a, 1);
eq('BRANCO volta', db.prepare("SELECT ativa a FROM cor WHERE codigo='BRANCO'").get().a, 1);
eq('CINZA volta',  db.prepare("SELECT ativa a FROM cor WHERE codigo='CINZA'").get().a, 1);
eq('o BLACKOUT, que estava ativo, não é tocado',
   db.prepare("SELECT ativo a FROM tecido WHERE codigo='BLACKOUT'").get().a, 1);

console.log('\n── 5. o SKU vazio é apagado ──');
eq('BKSOBMEDIDA saiu', sku(db,'BKSOBMEDIDA'), undefined);
eq('e os outros SKUs continuam', db.prepare('SELECT COUNT(*) c FROM skus').get().c, 2);
db.close();

console.log('\n── 6. ⚠️ VOLUME ATRÁS: o SKU vazio NÃO é apagado ──');
/* Apagar um SKU com volume atrás devolve aquele volume para `bloqueado` (§6):
   a caixa para na expedição, e ninguém liga isso a um script rodado dias antes.
   SKU a mais é ruído; SKU a menos é caixa parada. */
db = bancoDeHoje();
db.prepare("INSERT INTO lote (codigo,estagio) VALUES ('BKSOBMEDIDA','pendente')").run();
r = arrumar(db, { aplicar:true });
eq('ele continua cadastrado', !!sku(db,'BKSOBMEDIDA'), true);
ok('e o script DIZ por que não apagou',
   /lote/.test(JSON.stringify(r.bkRetido||'')), JSON.stringify(r.bkRetido));
eq('mas o resto do reparo aconteceu do mesmo jeito', mod(db,'SOBMEDIDA').sob_medida, 1);
db.close();

console.log('\n── 6-B. qualquer uma das dez tabelas segura o apagar ──');
/* Uma por vez: basta UMA referência em qualquer lugar para o script não apagar.
   Conferir só `lote` deixaria passar o SKU que tem fila, contagem ou ajuste. */
const REFS = [
  ["INSERT INTO lote_item (lote_id,codigo) VALUES (1,'BKSOBMEDIDA')", 'lote_item'],
  ["INSERT INTO fila (codigo) VALUES ('BKSOBMEDIDA')", 'fila'],
  ["INSERT INTO producao (codigo) VALUES ('BKSOBMEDIDA')", 'producao'],
  ["INSERT INTO revisao (codigo) VALUES ('BKSOBMEDIDA')", 'revisao'],
  ["INSERT INTO montagem (codigo) VALUES ('BKSOBMEDIDA')", 'montagem'],
  ["INSERT INTO contagem (codigo) VALUES ('BKSOBMEDIDA')", 'contagem'],
  ["INSERT INTO rejeicao (codigo) VALUES ('BKSOBMEDIDA')", 'rejeicao'],
  ["INSERT INTO ajuste_estoque (codigo) VALUES ('BKSOBMEDIDA')", 'ajuste_estoque'],
  ["INSERT INTO devolucao (sku_fisico) VALUES ('BKSOBMEDIDA')", 'devolucao'],
];
for(const [sql, tabela] of REFS){
  const d = bancoDeHoje();
  d.prepare(sql).run();
  arrumar(d, { aplicar:true });
  eq(tabela + ' segura o apagar', !!sku(d,'BKSOBMEDIDA'), true);
  d.close();
}

console.log('\n── 7. SKU com SALDO não é apagado, mesmo sem referência ──');
/* Saldo é peça na prateleira. Apagar o cadastro some com o número sem deixar
   linha em `ajuste_estoque` — a porta que a armadilha #25 (§6) fechou. */
db = bancoDeHoje();
db.prepare("UPDATE skus SET estoque=3 WHERE codigo='BKSOBMEDIDA'").run();
arrumar(db, { aplicar:true });
eq('ele continua cadastrado', !!sku(db,'BKSOBMEDIDA'), true);
eq('e o saldo está intacto', sku(db,'BKSOBMEDIDA').estoque, 3);
db.close();

console.log('\n── 8. rodar duas vezes não faz nada de novo ──');
/* Reparo de dado se roda mais de uma vez na vida real: alguém repete o comando,
   ou roda de novo depois de um restore. A segunda vez tem que ser inofensiva. */
db = bancoDeHoje();
arrumar(db, { aplicar:true });
const idModelo = mod(db,'SOBMEDIDA').id;
const r2 = arrumar(db, { aplicar:true });
eq('o modelo não é duplicado', db.prepare("SELECT COUNT(*) c FROM modelo WHERE codigo='SOBMEDIDA'").get().c, 1);
eq('e é o mesmo', mod(db,'SOBMEDIDA').id, idModelo);
eq('o SKU continua apontando pra ele', sku(db,'SOBMEDIDA').modelo_id, idModelo);
eq('a segunda rodada não tem nada a fazer', r2.acoes.length, 0);
db.close();

console.log('\n── 9. modelo que JÁ existe mas com as flags erradas ──');
/* Se alguém tiver criado o modelo pela tela e esquecido as caixinhas — que é
   exatamente o que aconteceu com o ROLO desde 25/08 —, o script conserta as
   flags em vez de reclamar que o código já existe. */
db = bancoDeHoje();
db.prepare("INSERT INTO modelo (codigo,nome,ativo,exige_medida,sob_medida) VALUES ('SOBMEDIDA','Sob medida',0,1,0)").run();
arrumar(db, { aplicar:true });
const m9 = mod(db,'SOBMEDIDA');
eq('sob medida corrigido', m9.sob_medida, 1);
eq('tem medida corrigido', m9.exige_medida, 0);
eq('e ele é reativado', m9.ativo, 1);
db.close();

console.log('\n── 10. ⚠️ O ROLO NUNCA VIRA SOB MEDIDA ──');
/* São 29 dos 30 SKUs. Marcar a flag ali tiraria a fábrica inteira da trava de
   estoque e da baixa de uma vez, sem um único aviso (§7, armadilha #30). */
db = bancoDeHoje();
arrumar(db, { aplicar:true });
eq('ROLO continua com sob_medida = 0', mod(db,'ROLO').sob_medida, 0);
eq('e continua exigindo medida', mod(db,'ROLO').exige_medida, 1);
eq('ACESSORIO também não é tocado', mod(db,'ACESSORIO').sob_medida, 0);
eq('e o SKU comum continua no Rolô', sku(db,'BK140140BEGE').modelo_id, 2);
db.close();

console.log('\n────────────────────────────────────────────');
console.log(falhas ? '  ' + falhas + ' de ' + n + ' FALHARAM' : '  todos os ' + n + ' casos passaram');
try{ fs.rmSync(tmp, {recursive:true, force:true}); }catch(e){}
process.exit(falhas ? 1 : 0);

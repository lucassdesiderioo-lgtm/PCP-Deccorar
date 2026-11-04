#!/usr/bin/env node
/* teste_aplicar_contagem_persianas.js — o saldo das persianas vira a folha.
 *
 *   node teste_aplicar_contagem_persianas.js
 *
 * Escrito ANTES do script (§0, risco vermelho). Decisão do dono em
 * 04/11/2026: "apenas atualize a lista; tudo que não está na lista deixe
 * zerado". O que ele trava:
 *   - o saldo de cada persiana vira o contado (fora da folha: 0), pelo livro
 *     (`estoque_dominio`, tipo `ajuste`), com linha em `ajuste_estoque`;
 *   - o que andou DEPOIS da contagem continua valendo (R-EST-16): a peça
 *     embalada depois de contar soma em cima do contado;
 *   - a caixa impressa ATÉ a hora da contagem e nunca baixada passa a contar
 *     como fora do saldo (`baixado_em`), sem movimento: a folha contou a
 *     prateleira, e essa peça não estava lá. Sem isso a reserva dela deixaria
 *     o livre negativo e a Etiqueta de Venda travaria;
 *   - a caixa impressa antes da contagem e conferida depois não baixa duas
 *     vezes;
 *   - a impressa depois da contagem ganha a baixa de verdade (−1): o dono quer
 *     o "em caixa" zerado, e a peça dela estava no contado;
 *   - acessório, sob medida e inativo não se mexem;
 *   - linha da folha ambígua ou sem SKU: recusa tudo;
 *   - uma vez só; o livro fecha; modo teste recusa;
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

const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'pcp-aplicacont-'));
const SCRIPT = path.join(__dirname, 'aplicar_contagem_persianas.js');
const ESTOQUE = require('./estoque_dominio');

const FOLHA = [
  { largura:160, altura:160, cor:'CINZA', qtd:21 },
  { largura:150, altura:150, cor:'BEGE',  qtd:5 },
];

function montar(arq){
  const db = new Database(arq);
  db.exec(`
    CREATE TABLE config (chave TEXT PRIMARY KEY, valor TEXT);
    CREATE TABLE modelo (id INTEGER PRIMARY KEY, codigo TEXT, nome TEXT, exige_medida INTEGER DEFAULT 1, sob_medida INTEGER DEFAULT 0);
    CREATE TABLE skus (codigo TEXT PRIMARY KEY, descricao TEXT DEFAULT '', estoque INTEGER DEFAULT 0, alvo INTEGER DEFAULT 0,
      modelo_id INTEGER, largura_cm INTEGER, altura_cm INTEGER, cor_codigo TEXT, ativo INTEGER DEFAULT 1);
    CREATE TABLE lote (id INTEGER PRIMARY KEY AUTOINCREMENT, codigo TEXT, estagio TEXT, embalado_em TEXT,
      conferido_em TEXT, baixado_em TEXT, despachar_em TEXT, data TEXT, teste INTEGER DEFAULT 0);
    CREATE TABLE lote_item (id INTEGER PRIMARY KEY AUTOINCREMENT, lote_id INTEGER, codigo TEXT, qtd INTEGER);
    CREATE TABLE ajuste_estoque (id INTEGER PRIMARY KEY AUTOINCREMENT, codigo TEXT, antes INTEGER, depois INTEGER,
      delta INTEGER, motivo TEXT, obs TEXT, usuario_id INTEGER, usuario_nome TEXT,
      criado_em TEXT DEFAULT (datetime('now','localtime')), data TEXT DEFAULT (date('now','localtime')), teste INTEGER DEFAULT 0);
    INSERT INTO config VALUES ('virada_baixa_conferencia','feita');
    INSERT INTO modelo VALUES (1,'ROLO','Rolô',1,0),(2,'ACESSORIO','Acessório',0,0),(3,'SOBMEDIDA','Sob medida',0,1);
    INSERT INTO skus (codigo,estoque,modelo_id,largura_cm,altura_cm,cor_codigo,ativo) VALUES
      ('BK160160CINZA',50,1,160,160,'CINZA',1),
      ('BK150150BEGE',58,1,150,150,'BEGE',1),
      ('BK180150BRANCO',47,1,180,150,'BRANCO',1),
      ('ACESSORIOSPERSIANAS',1,2,NULL,NULL,'',1),
      ('SOBMEDIDA',2,3,NULL,NULL,'',1),
      ('BK120120CINZA',9,1,120,120,'CINZA',0);
  `);
  ESTOQUE.garantirSchema(db);
  ESTOQUE.abertura(db);
  return db;
}

const CONTADO_EM = '2026-11-04 08:00';
const arq = path.join(tmp, 'a.db');
let db = montar(arq);
// as linhas de abertura ficam ANTES da contagem
db.prepare("UPDATE movimento_estoque SET criado_em='2026-11-01 00:00:00'").run();
const vol = o => { const c = Object.keys(o);
  return db.prepare('INSERT INTO lote (' + c.join(',') + ') VALUES (' + c.map(() => '?').join(',') + ')').run(c.map(k => o[k])).lastInsertRowid; };

// 3 caixas de BK150150BEGE impressas antes da contagem, nunca baixadas (já saíram)
const cAntes = [1, 2, 3].map(i => vol({ codigo:'BK150150BEGE', estagio:'embalado', embalado_em:'2026-10-2' + i + ' 10:00:00', despachar_em:'2026-10-2' + i }));
// 1 impressa antes, conferida DEPOIS da contagem (baixou −1 depois)
const cConfDepois = vol({ codigo:'BK160160CINZA', estagio:'embalado', embalado_em:'2026-11-03 10:00:00', despachar_em:'2026-11-04' });
// 1 impressa DEPOIS da contagem: ganha a baixa
const cDepois = vol({ codigo:'BK160160CINZA', estagio:'embalado', embalado_em:'2026-11-04 09:00:00', despachar_em:'2026-11-04' });
// sob medida impressa antes
const cSob = vol({ codigo:'SOBMEDIDA', estagio:'embalado', embalado_em:'2026-11-02 10:00:00' });
// caixa de teste: fica
const cTeste = vol({ codigo:'BK150150BEGE', estagio:'embalado', embalado_em:'2026-11-02 10:00:00', teste:1 });

// depois da contagem: a conferência da cConfDepois (−1) e uma embalagem nova (+1) de BK160160CINZA
const BAIXA = require('./baixa_dominio');
BAIXA.baixar(db, { id:cConfDepois }, null);
ESTOQUE.movimentar(db, { codigo:'BK160160CINZA', delta:1, tipo:'embalagem', referencia:'montagem:1' });
db.prepare("UPDATE movimento_estoque SET criado_em='2026-11-04 09:30:00' WHERE criado_em > '2026-11-02'").run();

const A = require('./aplicar_contagem_persianas');
const saldo = c => db.prepare('SELECT estoque FROM skus WHERE codigo=?').get(c).estoque;
const lote = id => db.prepare('SELECT * FROM lote WHERE id=?').get(id);
const livroBate = () => db.prepare(`SELECT 1 FROM skus s WHERE s.estoque <>
  COALESCE((SELECT SUM(delta) FROM movimento_estoque m WHERE m.codigo=s.codigo),0)`).all().length === 0;

console.log('\n1. a hora da contagem');
let e = null; try{ A.levantar(db, FOLHA, ''); }catch(x){ e = x; } ok('sem a hora: recusa', e && /hora da contagem/.test(e.message));
e = null; try{ A.levantar(db, FOLHA, '2099-01-01 08:00'); }catch(x){ e = x; } ok('no futuro: recusa', e && /futuro/.test(e.message));
e = null; try{ A.levantar(db, FOLHA, '04/11 8h'); }catch(x){ e = x; } ok('formato errado: recusa', !!e);

console.log('\n2. a prévia');
const L = A.levantar(db, FOLHA, CONTADO_EM);
const it = c => L.itens.find(i => i.codigo === c);
eq('160×160 cinza: contado 21, mais o que andou depois (−1 da conferida de antes não conta, +1 embalada) = 22', it('BK160160CINZA').depois, 22);
eq('150×150 bege: contado 5', it('BK150150BEGE').depois, 5);
eq('fora da folha: 0', it('BK180150BRANCO').depois, 0);
ok('acessório, sob medida e inativo não estão na lista', !it('ACESSORIOSPERSIANAS') && !it('SOBMEDIDA') && !it('BK120120CINZA'));
eq('caixas que passam a contar como fora do saldo: 3 + 1 sob medida (a conferida já baixou; a de depois e a de teste ficam)',
  JSON.stringify(L.caixas.map(c => c.id).sort((a, b) => a - b)), JSON.stringify(cAntes.concat([cSob]).sort((a, b) => a - b)));
ok('a prévia não gravou', saldo('BK150150BEGE') === 58 && !lote(cAntes[0]).baixado_em);

console.log('\n3. aplicar');
const R = db.transaction(() => A.aplicar(db, FOLHA, CONTADO_EM, { quem:{ nome:'terminal: teste' } }))();
eq('BK160160CINZA = 22 antes da baixa da caixa de depois', R.skus > 0 && db.prepare("SELECT depois FROM ajuste_estoque WHERE codigo='BK160160CINZA'").get().depois, 22);
eq('BK150150BEGE = 5', saldo('BK150150BEGE'), 5);
eq('BK180150BRANCO = 0', saldo('BK180150BRANCO'), 0);
eq('acessório intocado', saldo('ACESSORIOSPERSIANAS'), 1);
eq('sob medida intocado', saldo('SOBMEDIDA'), 2);
eq('inativo intocado', saldo('BK120120CINZA'), 9);
ok('o livro fecha', livroBate());
eq('movimentos de ajuste: um por SKU que mudou', db.prepare("SELECT COUNT(*) n FROM movimento_estoque WHERE tipo='ajuste'").get().n, 3);
ok('o motivo diz que é a contagem', db.prepare("SELECT motivo FROM movimento_estoque WHERE tipo='ajuste' LIMIT 1").get().motivo.includes('contagem'));
eq('histórico em ajuste_estoque', db.prepare('SELECT COUNT(*) n FROM ajuste_estoque').get().n, 3);
eq('a caixa de antes passa a baixada, na data da impressão', lote(cAntes[0]).baixado_em, '2026-10-21 10:00:00');
ok('sem movimento de conferência para ela', !db.prepare("SELECT 1 FROM movimento_estoque WHERE referencia=?").get('lote:' + cAntes[0]));
ok('a caixa continua embalada (a Conferência ainda a vê)', lote(cAntes[0]).estagio === 'embalado');
ok('a de depois baixou de verdade, com linha no livro', !!lote(cDepois).baixado_em &&
  !!db.prepare("SELECT 1 FROM movimento_estoque WHERE tipo='conferencia' AND referencia=?").get('lote:' + cDepois));
eq('BK160160CINZA: 22 − 1 da caixa de depois', saldo('BK160160CINZA'), 21);
ok('o livro continua fechando', livroBate());
ok('a de teste não se mexe', !lote(cTeste).baixado_em);
eq('nenhuma caixa de verdade reserva mais', JSON.stringify(Object.keys(BAIXA.reservados(db)).filter(c => c !== 'BK150150BEGE')), '[]');
eq('o livre do 150×150 bege: 5 − 1 da caixa de teste', BAIXA.disponivel(db, 'BK150150BEGE'), 4);
eq('o livre do 160×160 cinza = o saldo', BAIXA.disponivel(db, 'BK160160CINZA'), 21);
eq('o resumo', R.skus + '/' + R.caixas + '/' + R.caixasDepois, '3/4/1');

console.log('\n4. a caixa conferida depois');
BAIXA.baixar(db, { id:cAntes[1] }, null);
eq('conferir a caixa de antes não baixa de novo', saldo('BK150150BEGE'), 5);

console.log('\n5. uma vez só');
e = null; try{ A.levantar(db, FOLHA, CONTADO_EM); }catch(x){ e = x; }
ok('a segunda rodada é recusada', e && /já foi aplicada/.test(e.message));
db.close();

console.log('\n6. folha que não fecha');
db = montar(path.join(tmp, 'b.db'));
e = null; try{ A.levantar(db, FOLHA.concat([{ largura:130, altura:130, cor:'BEGE', qtd:6 }]), CONTADO_EM); }catch(x){ e = x; }
ok('linha sem SKU: recusa tudo', e && /130×130/.test(e.message));
db.prepare("INSERT INTO skus (codigo,estoque,modelo_id,largura_cm,altura_cm,cor_codigo) VALUES ('SC160160CINZA',0,1,160,160,'CINZA')").run();
e = null; try{ A.levantar(db, FOLHA, CONTADO_EM); }catch(x){ e = x; }
ok('linha ambígua: recusa tudo', e && /mais de um SKU/.test(e.message));
db.prepare("DELETE FROM skus WHERE codigo='SC160160CINZA'").run();
db.prepare("INSERT INTO config VALUES ('modo_teste','1')").run();
e = null; try{ A.levantar(db, FOLHA, CONTADO_EM); }catch(x){ e = x; }
ok('modo teste ligado: recusa', e && /modo teste/i.test(e.message));
db.close();

console.log('\n7. o script do terminal');
const arq3 = path.join(tmp, 'c.db');
db = montar(arq3);
db.prepare("DELETE FROM skus WHERE codigo IN ('BK160160CINZA','BK150150BEGE')").run();
db.prepare("DELETE FROM movimento_estoque WHERE codigo IN ('BK160160CINZA','BK150150BEGE')").run();
const insT = db.prepare("INSERT INTO skus (codigo,estoque,modelo_id,largura_cm,altura_cm,cor_codigo) VALUES (?,0,1,?,?,?)");
for(const l of require('./conferir_contagem_persianas').CONTAGEM) insT.run('T' + l.largura + l.altura + l.cor, l.largura, l.altura, l.cor);
db.prepare("UPDATE movimento_estoque SET criado_em='2026-11-01 00:00:00'").run(); db.close();
const env = Object.assign({}, process.env, { PCP_DB:arq3, PCP_BACKUPS:path.join(tmp, 'bk') });
function rodar(args){
  try{ return { cod:0, out:execFileSync(process.execPath, [SCRIPT].concat(args), { env, encoding:'utf8', stdio:'pipe' }) }; }
  catch(x){ return { cod:x.status == null ? 1 : x.status, out:String(x.stdout || '') + String(x.stderr || '') }; }
}
const ler = () => { const d = new Database(arq3, { readonly:true }); const s = d.prepare("SELECT estoque FROM skus WHERE codigo='BK180150BRANCO'").get().estoque; d.close(); return s; };
let t = rodar([]);
ok('sem a hora: explica e sai com 2', t.cod === 2 && /--contado-em/.test(t.out), t.out);
t = rodar(['--contado-em', CONTADO_EM]);
ok('simula', t.cod === 0 && /SIMULA/.test(t.out), t.out);
eq('e não gravou', ler(), 47);
t = rodar(['--contado-em', CONTADO_EM, '--aplicar']);
ok('aplica', t.cod === 0 && /aplicad/i.test(t.out), t.out);
eq('fora da folha zerado', ler(), 0);
ok('backup antes', fs.readdirSync(path.join(tmp, 'bk')).some(f => /^antes-contagem-persianas-/.test(f)));

fs.rmSync(tmp, { recursive:true, force:true });
console.log('\n' + (n - falhas) + '/' + n + ' ok' + (falhas ? ' — ' + falhas + ' FALHOU' : ''));
process.exit(falhas ? 1 : 0);

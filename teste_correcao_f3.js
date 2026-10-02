#!/usr/bin/env node
/* teste_correcao_f3.js — A MESA DE CORRECOES, fase 3 (02/10/2026).
 *
 *   node teste_correcao_f3.js
 *
 * Os cinco scripts de passivo passam a chamar o `correcoes.js` e a gravar em
 * `correcao`. A regra que este teste trava, e a unica que importa: SCRIPT E
 * BOTAO PRODUZEM O MESMO ANTES/DEPOIS PARA O MESMO CASO. Com duas reguas, o
 * terminal e a tela discordariam sobre o mesmo volume no dia em que uma delas
 * mudasse — a armadilha #12 na porta que apaga linha e carimba saida.
 *
 * Monta um banco, copia em dois: num roda o script de verdade (processo
 * separado, `--aplicar`), no outro chama a Mesa. Depois compara as tabelas.
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

const RAIZ = __dirname;
const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'pcp-correcao3-'));

function montar(arq){
  const db = new Database(arq);
  db.exec(`
    CREATE TABLE config (chave TEXT PRIMARY KEY, valor TEXT);
    CREATE TABLE modelo (id INTEGER PRIMARY KEY AUTOINCREMENT, codigo TEXT, nome TEXT,
      exige_medida INTEGER DEFAULT 1, sob_medida INTEGER DEFAULT 0);
    CREATE TABLE skus (codigo TEXT PRIMARY KEY, descricao TEXT DEFAULT '', cor TEXT DEFAULT '',
      estoque INTEGER DEFAULT 0, alvo INTEGER DEFAULT 0, modelo_id INTEGER);
    CREATE TABLE lote (id INTEGER PRIMARY KEY AUTOINCREMENT, codigo TEXT, cor TEXT DEFAULT '',
      buyer TEXT DEFAULT '', city TEXT DEFAULT '', nf TEXT, packId TEXT, venda TEXT,
      codes TEXT DEFAULT '[]', srcfile TEXT, labelPage INTEGER, danfePage INTEGER,
      estagio TEXT DEFAULT 'pendente', embalado_em TEXT, carregado_em TEXT,
      data TEXT DEFAULT (date('now','localtime')), criado_em TEXT DEFAULT (datetime('now','localtime')),
      teste INTEGER DEFAULT 0, reimpressoes INTEGER DEFAULT 0, reimpresso_em TEXT, bloqueio TEXT,
      descricao TEXT, despachar_em TEXT, bloqueio_resolvido TEXT, resolvido_por TEXT, resolvido_em TEXT,
      modalidade TEXT, retirado_em TEXT, impresso_por TEXT, conferido_por TEXT, conferido_em TEXT,
      no_carro_em TEXT, no_carro_por TEXT, saida_id INTEGER, saiu_em TEXT, saiu_por TEXT,
      cancelada_em TEXT, cancelada_origem TEXT, cancelada_estagio TEXT, cancelada_motivo TEXT,
      cancelada_varias INTEGER DEFAULT 0, cancelada_aviso_em TEXT,
      cancelada_resolvida_em TEXT, cancelada_resolvida_por TEXT, cancelada_voltou INTEGER);
    CREATE TABLE lote_item (id INTEGER PRIMARY KEY AUTOINCREMENT, lote_id INTEGER NOT NULL,
      codigo TEXT, qtd INTEGER DEFAULT 1, cor TEXT, descricao TEXT, origem TEXT DEFAULT 'folha',
      conferido_em TEXT, conferido_por TEXT, criado_em TEXT DEFAULT (datetime('now','localtime')),
      teste INTEGER DEFAULT 0, conferidos INTEGER DEFAULT 0);
    CREATE TABLE fila (id INTEGER PRIMARY KEY AUTOINCREMENT, codigo TEXT,
      modo TEXT DEFAULT 'hoje', situacao TEXT DEFAULT 'aguardando',
      revisado_em TEXT DEFAULT (datetime('now','localtime')), embalado_em TEXT,
      data TEXT DEFAULT (date('now','localtime')), teste INTEGER DEFAULT 0);
    INSERT INTO modelo (codigo,nome) VALUES ('ROLO','Rolô');
    INSERT INTO skus (codigo,estoque,modelo_id) VALUES ('BK140140BEGE',5,1),('BK160160CINZA',3,1);
  `);
  const d = k => db.prepare("SELECT date('now','localtime',?) d").get((k>=0?'+':'')+k+' day').d;
  const v = o => { const c = Object.keys(o);
    return db.prepare('INSERT INTO lote ('+c+') VALUES ('+c.map(()=>'?')+')').run(c.map(x=>o[x])).lastInsertRowid; };
  // fantasma: o original andou, a copia ficou pendente — com uma peca
  const orig = v({codigo:'BK140140BEGE', venda:'V1', packId:'P1', estagio:'carregado', data:d(-9),
    embalado_em:d(-9)+' 10:00:00', carregado_em:d(-9)+' 15:00:00'});
  const fant = v({codigo:'BK140140BEGE', venda:'V1', estagio:'pendente', data:d(-2)});
  db.prepare("INSERT INTO lote_item (lote_id,codigo,qtd) VALUES (?,'BK140140BEGE',1)").run(fant);
  // saida: pendente vencido (coleta) com uma copia pendente
  const sai = v({codigo:'BK160160CINZA', venda:'V2', estagio:'pendente', data:d(-5), despachar_em:d(-4), modalidade:'coleta'});
  const cop = v({codigo:'BK160160CINZA', venda:'V2', estagio:'pendente', data:d(-3), despachar_em:d(-4)});
  const fut = v({codigo:'BK160160CINZA', venda:'V3', estagio:'embalado', embalado_em:d(-1)+' 09:00:00',
    data:d(-1), despachar_em:d(3)});
  // vencidos
  v({codigo:'BK140140BEGE', venda:'V4', estagio:'pendente', data:d(-6), despachar_em:d(-5)});
  v({codigo:'BK140140BEGE', venda:'V5', estagio:'pendente', data:d(-8)});
  v({codigo:'BK140140BEGE', venda:'V6', estagio:'pendente', data:d(-1), despachar_em:d(2)});
  v({codigo:'XPTO', venda:'V7', estagio:'bloqueado', data:d(-6), despachar_em:d(-5)});
  // reabrir: carimbada no futuro, uma com etiqueta e uma sem
  const rf1 = v({codigo:'BK160160CINZA', venda:'V8', estagio:'carregado', embalado_em:d(-2)+' 10:00:00',
    data:d(-3), despachar_em:d(9), carregado_em:d(9)+' 15:00:00'});
  const rf2 = v({codigo:'BK160160CINZA', venda:'V9', estagio:'carregado', data:d(-3), despachar_em:d(4),
    carregado_em:d(4)+' 15:00:00'});
  // fila
  db.prepare("INSERT INTO fila (codigo,revisado_em,data) VALUES ('BK140140BEGE',?,?)").run(d(-50)+' 08:00:00', d(-50));
  db.prepare("INSERT INTO fila (codigo) VALUES ('BK160160CINZA')").run();
  db.prepare("INSERT INTO fila (codigo,situacao,embalado_em) VALUES ('BK140140BEGE','embalado',?)").run(d(-40)+' 09:00:00');
  db.close();
  return { orig, fant, sai, cop, fut, rf1, rf2 };
}

const BASE = path.join(tmp, 'base.db');
const ids = montar(BASE);

function copia(nome){ const a = path.join(tmp, nome); fs.copyFileSync(BASE, a); return a; }
function rodar(script, args, banco){
  const env = Object.assign({}, process.env, { PCP_DB: banco, PCP_DIR: path.dirname(banco) });
  return execFileSync(process.execPath, [path.join(RAIZ, script)].concat(args), { env, encoding:'utf8' });
}
/* O que se compara: as linhas de lote, lote_item e fila (o estado da
   operacao) e, das correcoes, o que a regra decide — acao, alvo, antes e
   depois. Data e hora da correcao e quem rodou ficam de fora: o script grava
   "o terminal", e a Mesa grava a pessoa logada. */
function retrato(arq){
  const db = new Database(arq, { readonly:true });
  const tab = t => JSON.stringify(db.prepare('SELECT * FROM ' + t + ' ORDER BY id').all());
  let cor = [];
  try{ cor = db.prepare('SELECT acao,alvo_tipo,alvo_id,antes,depois FROM correcao ORDER BY id').all(); }catch(e){}
  const r = { lote:tab('lote'), lote_item:tab('lote_item'), fila:tab('fila'), correcao:JSON.stringify(cor) };
  db.close(); return r;
}
function viaMesa(arq, fn){
  const db = new Database(arq);
  const COR = require('./correcoes');
  COR.garantirSchema(db);
  db.transaction(() => fn(db, COR))();
  db.close();
}
const QUEM = { id:null, nome:'terminal' };
function compara(nome, a, b){
  eq(nome + ': o lote fica igual', a.lote, b.lote);
  eq(nome + ': as peças ficam iguais', a.lote_item, b.lote_item);
  eq(nome + ': a fila fica igual', a.fila, b.fila);
  eq(nome + ': a correção gravada é a mesma (ação, alvo, antes e depois)', a.correcao, b.correcao);
  ok(nome + ': o script gravou correção', JSON.parse(a.correcao).length > 0);
}

/* 1. limpar_fantasmas */
console.log('\n1. limpar_fantasmas.js');
let A = copia('f_a.db'), B = copia('f_b.db');
rodar('limpar_fantasmas.js', ['--aplicar'], A);
viaMesa(B, (db, COR) => COR.classificarFantasmas(db).fantasmas.forEach(o =>
  COR.executar(db, { acao:'fantasma', tipo:'lote', id:o.v.id, motivo:'x', quem:QUEM })));
compara('fantasma', retrato(A), retrato(B));
eq('a peça do fantasma sai junto (o script deixava órfã)',
   new Database(A,{readonly:true}).prepare('SELECT COUNT(*) n FROM lote_item WHERE lote_id=?').get(ids.fant).n, 0);

/* 2. regularizar_saida */
console.log('\n2. regularizar_saida.js');
A = copia('s_a.db'); B = copia('s_b.db');
const sa = rodar('regularizar_saida.js', [String(ids.sai), String(ids.fut), '--aplicar'], A);
ok('o script recusa a venda futura, dizendo a data', /despacha em/.test(sa), sa);
viaMesa(B, (db, COR) => COR.executar(db, { acao:'saida', tipo:'lote', id:ids.sai, motivo:'x', quem:QUEM }));
compara('saída', retrato(A), retrato(B));
const vs = new Database(A,{readonly:true}).prepare('SELECT * FROM lote WHERE id=?').get(ids.sai);
ok('a coleta sai com retirado_em (não fica no card do caminhão)', !!vs.retirado_em, JSON.stringify(vs));

/* 3. fechar_vencidos */
console.log('\n3. fechar_vencidos.js');
A = copia('v_a.db'); B = copia('v_b.db');
rodar('fechar_vencidos.js', ['--aplicar'], A);
viaMesa(B, (db, COR) => COR.executar(db, { acao:'vencidos', tipo:'periodo', id:0,
  params:{ ate:db.prepare("SELECT date('now','localtime') d").get().d }, motivo:'x', quem:QUEM }));
compara('vencidos', retrato(A), retrato(B));
const fv = (() => { try{ return rodar('fechar_vencidos.js', ['--ate','2999-01-01','--aplicar'], copia('v_c.db')); }
                     catch(e){ return String(e.stdout || '') + String(e.stderr || ''); } })();
ok('data de corte no futuro é recusada também no terminal', /futuro/i.test(fv), fv);

/* 4. reabrir_futuros */
console.log('\n4. reabrir_futuros.js');
A = copia('r_a.db'); B = copia('r_b.db');
rodar('reabrir_futuros.js', ['--aplicar'], A);
viaMesa(B, (db, COR) => [ids.rf2, ids.rf1].forEach(id =>   // a ordem do script: pela data da saida
  COR.executar(db, { acao:'reabrir', tipo:'lote', id, motivo:'x', quem:QUEM })));
compara('reabrir', retrato(A), retrato(B));
eq('a sem etiqueta volta a pendente, não a embalado',
   new Database(A,{readonly:true}).prepare('SELECT estagio FROM lote WHERE id=?').get(ids.rf2).estagio, 'pendente');

/* 5. limpar_fila */
console.log('\n5. limpar_fila.js');
A = copia('l_a.db'); B = copia('l_b.db');
rodar('limpar_fila.js', ['--db', A, '--confirmar', '--saida', path.join(tmp,'bk')], A);
viaMesa(B, (db, COR) => COR.executar(db, { acao:'fila_velha', tipo:'periodo', id:0,
  params:{ ate:db.prepare("SELECT date('now','localtime') d").get().d }, motivo:'x', quem:QUEM }));
compara('fila', retrato(A), retrato(B));
eq('a linha embalada continua lá',
   new Database(A,{readonly:true}).prepare("SELECT COUNT(*) n FROM fila WHERE situacao='embalado'").get().n, 1);

/* 6. a simulacao nao grava, em nenhum dos cinco */
console.log('\n6. simulação');
const S = copia('sim.db'), antes = retrato(S);
rodar('limpar_fantasmas.js', [], S); rodar('regularizar_saida.js', [String(ids.sai)], S);
rodar('fechar_vencidos.js', [], S); rodar('reabrir_futuros.js', [], S);
rodar('limpar_fila.js', ['--db', S], S);
const depois = retrato(S);
eq('sem --aplicar, nada muda no lote', depois.lote, antes.lote);
eq('sem --aplicar, nada muda na fila', depois.fila, antes.fila);
eq('sem --aplicar, nenhuma correção é gravada', depois.correcao, antes.correcao);

/* 7. nenhum script tem regua propria — a varredura */
console.log('\n7. a régua mora num lugar só');
for(const s of ['limpar_fantasmas.js','regularizar_saida.js','fechar_vencidos.js','reabrir_futuros.js','limpar_fila.js']){
  const txt = fs.readFileSync(path.join(RAIZ, s), 'utf8')
    .replace(/\/\*[\s\S]*?\*\//g, '').replace(/\/\/.*$/gm, '');
  ok(s + ' chama o correcoes.js', /require\(['"]\.\/correcoes['"]\)/.test(txt));
  ok(s + ' não escreve em lote nem em fila por conta própria',
     !/\b(UPDATE\s+lote|DELETE\s+FROM\s+lote|DELETE\s+FROM\s+fila|INSERT\s+INTO\s+lote)\b/i.test(txt));
}

console.log('\n' + (falhas ? falhas + ' FALHA(S) em ' + n : 'tudo certo — ' + n + ' casos'));
fs.rmSync(tmp, { recursive:true, force:true });
process.exit(falhas ? 1 : 0);

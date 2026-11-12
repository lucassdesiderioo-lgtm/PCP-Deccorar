#!/usr/bin/env node
/* Testes do roteiro na ficha (spec PRODUCAO-MAPA-E-MOTOR, fase 1).
 *
 *   node teste_roteiro.js
 *
 * Cada linha da ficha tecnica (404) diz em que ETAPA da fabrica o material e
 * preparado. O roteiro do modelo SAI das linhas (nao e digitado): as etapas de
 * preparo marcadas, e a montagem, a revisao e a embalagem, que toda persiana
 * passa. `etapas.js` e o dono unico da lista. A etapa nao muda custo, compra,
 * baixa nem a aba Corte e separacao.
 *
 * Sobe um banco temporario. Nao abre porta, nao toca no banco de producao.
 */
const Database = require('better-sqlite3');
const fs = require('fs'), os = require('os'), path = require('path');

let ok = 0, falha = 0;
function caso(nome, fn){
  try{ fn(); ok++; console.log('ok      ' + nome); }
  catch(e){ falha++; console.log('FALHOU  ' + nome + '\n        ' + (e && e.message || e)); }
}
function igual(a, b, msg){
  if(JSON.stringify(a) !== JSON.stringify(b))
    throw new Error((msg ? msg + ': ' : '') + 'esperado ' + JSON.stringify(b) + ', veio ' + JSON.stringify(a));
}
function verdade(v, msg){ if(!v) throw new Error(msg || 'esperado verdadeiro'); }

const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'pcp-roteiro-'));
const db = new Database(path.join(tmp, 't.db'));
db.exec(`
  CREATE TABLE skus (codigo TEXT PRIMARY KEY, descricao TEXT DEFAULT '', cor TEXT DEFAULT '',
    estoque INTEGER DEFAULT 0, alvo INTEGER DEFAULT 0,
    modelo_id INTEGER, largura_cm INTEGER, altura_cm INTEGER,
    cor_codigo TEXT, tecido_codigo TEXT);
  CREATE TABLE auditoria (id INTEGER PRIMARY KEY AUTOINCREMENT, usuario_id INTEGER, usuario_nome TEXT,
    categoria TEXT, acao TEXT, alvo TEXT, detalhe TEXT, ip TEXT,
    criado_em TEXT DEFAULT (datetime('now','localtime')), data TEXT DEFAULT (date('now','localtime')));
`);
require('./sku_schema').garantirSchema(db);
require('./compras_schema').garantirSchemaCompras(db);

db.prepare("INSERT INTO modelo (id,codigo,nome,exige_medida,sob_medida) VALUES (1,'ROLO','Rolô',1,0)").run();
db.prepare("INSERT INTO cor (codigo,nome) VALUES ('BEGE','Bege')").run();
db.prepare("INSERT INTO tecido (codigo,nome) VALUES ('BLACKOUT','Blackout')").run();
db.prepare(`INSERT INTO skus (codigo,modelo_id,largura_cm,altura_cm,cor_codigo,tecido_codigo,tem_ficha)
  VALUES ('BK160140BEGE',1,160,140,'BEGE','BLACKOUT',1)`).run();
const comp = db.prepare("INSERT INTO componente (nome,unidade,ativo,modo_saldo) VALUES (?,?,1,'quantidade')");
const TUBO = comp.run('Tubo 38', 'm').lastInsertRowid;
const KIT  = comp.run('Kit de instalação', 'un').lastInsertRowid;
const CX   = comp.run('Caixa', 'un').lastInsertRowid;
const forn = db.prepare("INSERT INTO fornecedor (nome,ativo) VALUES ('F',1)").run().lastInsertRowid;
db.prepare("INSERT INTO oferta (componente_id,fornecedor_id,embalagem,preco,fator,ativo) VALUES (?,?,'m',10,1,1)").run(TUBO, forn);

const ins = db.prepare("INSERT INTO ficha_formula (modelo_id,componente_id,expressao,ordem) VALUES (1,?,?,?)");
const F_TUBO = ins.run(TUBO, 'largura / 100', 1).lastInsertRowid;
const F_KIT  = ins.run(KIT, '1', 2).lastInsertRowid;
const F_CX   = ins.run(CX, '1', 3).lastInsertRowid;

const ETAPAS = require('./etapas');

function rotas(){
  const r = { post:{}, get:{} };
  const app = { delete(){}, use(){},
    get(p, ...h){ r.get[p] = h[h.length-1]; },
    post(p, ...h){ r.post[p] = h[h.length-1]; } };
  require('./ficha_route')(app, db);
  return r;
}
function chamar(h, body, params){
  let st = 200, out = null;
  const res = { status(s){ st = s; return this; }, json(j){ out = j; return this; } };
  h({ body, usuario:{ id:1, nome:'Teste' }, params:params||{}, query:{} }, res);
  return { st, out };
}
const etapaDe = id => db.prepare('SELECT etapa FROM ficha_formula WHERE id=?').get(id).etapa;
const R = rotas();
const salvar = R.post['/api/formulas'];

/* ── A LISTA ──────────────────────────────────────────────────────────────── */
caso('etapas.js tem as quatro etapas de preparo e "sai direto na embalagem"', () => {
  igual(ETAPAS.PREPARO.map(e => e.chave), ['corte_tecido','corte_tubo','kit_comando','kit_instalacao']);
  verdade(ETAPAS.valida('embalagem'), '"embalagem" é uma etapa de linha');
  verdade(!ETAPAS.valida('montagem'), 'montagem não é etapa de linha: é de toda persiana');
  verdade(!ETAPAS.valida('qualquer'), 'etapa inventada não vale');
});
caso('cada etapa tem nome para a tela', () => {
  for(const e of ETAPAS.DE_LINHA) verdade(e.nome && e.nome.length > 3, 'nome de ' + e.chave);
});

/* ── A COLUNA ─────────────────────────────────────────────────────────────── */
caso('a coluna etapa existe na ficha_formula e nasce vazia', () => {
  const c = db.prepare("SELECT name, dflt_value FROM pragma_table_info('ficha_formula') WHERE name='etapa'").get();
  verdade(c, 'coluna etapa');
  igual(etapaDe(F_TUBO), null);
});
caso('banco antigo sem a coluna ganha a coluna no boot, no fim (§17)', () => {
  const d2 = new Database(':memory:');
  d2.exec(`CREATE TABLE skus (codigo TEXT PRIMARY KEY, descricao TEXT DEFAULT '', cor TEXT DEFAULT '',
    estoque INTEGER DEFAULT 0, alvo INTEGER DEFAULT 0, modelo_id INTEGER, largura_cm INTEGER, altura_cm INTEGER,
    cor_codigo TEXT, tecido_codigo TEXT);`);
  require('./sku_schema').garantirSchema(d2);
  require('./compras_schema').garantirSchemaCompras(d2);
  const cols = d2.prepare("SELECT name FROM pragma_table_info('ficha_formula')").all().map(c => c.name);
  igual(cols[cols.length - 1], 'etapa', 'a etapa é a última coluna');
});

/* ── A ROTA ───────────────────────────────────────────────────────────────── */
caso('POST /api/formulas grava a etapa', () => {
  const r = chamar(salvar, { id:F_TUBO, modelo_id:1, componente_id:TUBO, expressao:'largura / 100', etapa:'corte_tubo' });
  igual(r.st, 200, JSON.stringify(r.out));
  igual(etapaDe(F_TUBO), 'corte_tubo');
});
caso('sem o campo, a etapa gravada FICA (ausente não é vazio)', () => {
  chamar(salvar, { id:F_TUBO, modelo_id:1, componente_id:TUBO, expressao:'largura / 100' });
  igual(etapaDe(F_TUBO), 'corte_tubo');
});
caso('vazio de propósito tira a etapa', () => {
  chamar(salvar, { id:F_TUBO, modelo_id:1, componente_id:TUBO, expressao:'largura / 100', etapa:'' });
  igual(etapaDe(F_TUBO), null);
  chamar(salvar, { id:F_TUBO, modelo_id:1, componente_id:TUBO, expressao:'largura / 100', etapa:'corte_tubo' });
});
caso('etapa que não existe é recusada (400) e nada grava', () => {
  const r = chamar(salvar, { id:F_TUBO, modelo_id:1, componente_id:TUBO, expressao:'largura / 200', etapa:'montagem' });
  igual(r.st, 400);
  verdade(/etapa/i.test(r.out.erro), r.out.erro);
  igual(etapaDe(F_TUBO), 'corte_tubo');
  igual(db.prepare('SELECT expressao FROM ficha_formula WHERE id=?').get(F_TUBO).expressao, 'largura / 100',
    'a fórmula do mesmo envio também não grava');
});
caso('linha nova com etapa nasce com ela; sem o campo, vazia', () => {
  const a = chamar(salvar, { modelo_id:1, componente_id:CX, expressao:'2', etapa:'embalagem' });
  igual(etapaDe(a.out.id), 'embalagem');
  const b = chamar(salvar, { modelo_id:1, componente_id:CX, expressao:'3' });
  igual(etapaDe(b.out.id), null);
  db.prepare('DELETE FROM ficha_formula WHERE id IN (?,?)').run(a.out.id, b.out.id);
});

/* ── O ROTEIRO SAI DAS LINHAS ─────────────────────────────────────────────── */
caso('sem linha marcada, o roteiro é montagem → revisão → embalagem', () => {
  db.prepare('UPDATE ficha_formula SET etapa=NULL').run();
  const r = ETAPAS.roteiro(db, 1);
  igual(r.etapas.map(e => e.chave), ['montagem','revisao','embalagem']);
  igual(r.sem_etapa, 3, 'as três linhas estão sem etapa');
});
caso('com linhas marcadas, as etapas de preparo vêm antes, na ordem da fábrica', () => {
  db.prepare("UPDATE ficha_formula SET etapa='kit_instalacao' WHERE id=?").run(F_KIT);
  db.prepare("UPDATE ficha_formula SET etapa='corte_tubo' WHERE id=?").run(F_TUBO);
  db.prepare("UPDATE ficha_formula SET etapa='embalagem' WHERE id=?").run(F_CX);
  const r = ETAPAS.roteiro(db, 1);
  igual(r.etapas.map(e => e.chave), ['corte_tubo','kit_instalacao','montagem','revisao','embalagem']);
  igual(r.sem_etapa, 0);
});
caso('a linha desativada não entra no roteiro', () => {
  db.prepare("UPDATE ficha_formula SET ativo=0 WHERE id=?").run(F_KIT);
  igual(ETAPAS.roteiro(db, 1).etapas.map(e => e.chave), ['corte_tubo','montagem','revisao','embalagem']);
  db.prepare("UPDATE ficha_formula SET ativo=1 WHERE id=?").run(F_KIT);
});
caso('GET /api/formulas/roteiro/:modelo_id devolve o roteiro e as opções', () => {
  const h = R.get['/api/formulas/roteiro/:modelo_id'];
  verdade(h, 'a rota existe');
  const r = chamar(h, null, { modelo_id:'1' });
  igual(r.st, 200);
  igual(r.out.etapas.map(e => e.chave), ['corte_tubo','kit_instalacao','montagem','revisao','embalagem']);
  igual(r.out.opcoes.map(e => e.chave), ETAPAS.DE_LINHA.map(e => e.chave));
});
caso('GET /api/formulas traz a etapa de cada linha', () => {
  const r = chamar(R.get['/api/formulas'], null);
  const l = r.out.find(x => x.id === F_TUBO);
  igual(l.etapa, 'corte_tubo');
});
caso('a leitura do roteiro cai na regra das leituras da ficha (as chaves da 404)', () => {
  const ac = fs.readFileSync(path.join(__dirname, 'acesso.js'), 'utf8');
  verdade(/M === 'GET' && pre\('\/api\/formulas'\)\) return \['modelo\.cadastrar'/.test(ac));
});

/* ── NÃO MEXE EM CUSTO ────────────────────────────────────────────────────── */
caso('a etapa não muda um centavo do custo', () => {
  const FICHA = require('./ficha_dominio');
  const com = FICHA.calcularFicha(db, 'BK160140BEGE');
  db.prepare('UPDATE ficha_formula SET etapa=NULL').run();
  const sem = FICHA.calcularFicha(db, 'BK160140BEGE');
  igual(com.custo_material, sem.custo_material);
  igual(com.linhas.map(l => l.quantidade), sem.linhas.map(l => l.quantidade));
});

/* ── A TELA 404 ───────────────────────────────────────────────────────────── */
caso('a 404 tem o campo Etapa no editor e manda a etapa ao salvar', () => {
  const h = fs.readFileSync(path.join(__dirname, 'public/index.html'), 'utf8');
  verdade(/id="edEtapa"/.test(h), 'campo edEtapa');
  verdade(/corpo\.etapa=\$\('#edEtapa'\)\.value/.test(h), 'salvarEditor manda a etapa');
  verdade(/\/api\/formulas\/roteiro\//.test(h), 'a tela pede o roteiro');
});

console.log('');
console.log(falha ? ('FALHARAM ' + falha + ' de ' + (ok + falha)) : ('todos os ' + ok + ' casos passaram'));
try{ fs.rmSync(tmp, {recursive:true, force:true}); }catch(e){}
process.exit(falha ? 1 : 0);

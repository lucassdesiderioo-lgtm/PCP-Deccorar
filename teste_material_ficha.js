#!/usr/bin/env node
/* A lista de materiais da ficha técnica (404), sem dinheiro (AJUSTE de 12/11/2026).
 *
 *   node teste_material_ficha.js
 *
 * Quem abre a 404 só com "cadastrar modelo" precisa escolher o material de uma
 * linha nova da ficha. A lista de Compras (`GET /api/componentes`) é de
 * `compras.ver` e traz preço, estoque e consumo — então a 404 tem uma leitura
 * própria, `GET /api/componentes/para-ficha`, com as chaves da 404 e SÓ o que a
 * ficha precisa: id, código MAT, nome, unidade, família do tecido, ativo e
 * "vai para a ficha". Nenhum valor, saldo ou fornecedor viaja (§23).
 *
 * Banco temporário. Não abre porta, não toca no banco de produção.
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

const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'pcp-matficha-'));
process.env.PCP_DB = path.join(tmp, 't.db');
const db = new Database(path.join(tmp, 't.db'));
db.exec(`
  CREATE TABLE skus (codigo TEXT PRIMARY KEY, descricao TEXT DEFAULT '', cor TEXT DEFAULT '',
    estoque INTEGER DEFAULT 0, alvo INTEGER DEFAULT 0,
    modelo_id INTEGER, largura_cm INTEGER, altura_cm INTEGER, cor_codigo TEXT, tecido_codigo TEXT);
  CREATE TABLE config (chave TEXT PRIMARY KEY, valor TEXT);
  CREATE TABLE auditoria (id INTEGER PRIMARY KEY AUTOINCREMENT, usuario_id INTEGER, usuario_nome TEXT,
    categoria TEXT, acao TEXT, alvo TEXT, detalhe TEXT, ip TEXT,
    criado_em TEXT DEFAULT (datetime('now','localtime')), data TEXT DEFAULT (date('now','localtime')));
`);
require('./sku_schema').garantirSchema(db);
require('./compras_schema').garantirSchemaCompras(db);

const ins = db.prepare("INSERT INTO componente (nome,unidade,ativo,modo_saldo,familia,cor,largura_bobina_cm,estoque,custo_medio,vai_ficha) VALUES (?,?,?,'quantidade',?,?,?,?,?,?)");
const TUBO = ins.run('Tubo 38', 'm', 1, null, null, null, 120, 9.5, 1).lastInsertRowid;
const TEC  = ins.run('Blackout bege 3,20', 'm', 1, 'BLACKOUT', 'BEGE', 320, 80, 30, 1).lastInsertRowid;
const CAFE = ins.run('Café', 'un', 1, null, null, null, 5, 2, 0).lastInsertRowid;
const VELHO= ins.run('Suporte velho', 'un', 0, null, null, null, 0, 1, 1).lastInsertRowid;

const rotas = {};
const app = { get:(c,...f)=>rotas['GET '+c]=f[f.length-1], post:(c,...f)=>rotas['POST '+c]=f[f.length-1],
              put(){}, delete(){}, use(){}, locals:{} };
require('./compras_route')(app, db);
function chamar(metodo, caminho){
  const f = rotas[metodo+' '+caminho];
  if(!f) throw new Error('rota nao registrada: '+metodo+' '+caminho);
  let st = 200, out = null;
  const res = { status(c){ st = c; return this; }, json(o){ out = o; return this; } };
  f({ body:{}, params:{}, query:{}, headers:{}, usuario:{ id:1, nome:'Teste' } }, res);
  return { st, out };
}

caso('a rota GET /api/componentes/para-ficha existe', () => {
  verdade(rotas['GET /api/componentes/para-ficha'], 'rota registrada');
});
caso('devolve os materiais com só os campos da ficha — sem dinheiro, saldo ou fornecedor', () => {
  const r = chamar('GET', '/api/componentes/para-ficha');
  igual(r.st, 200);
  verdade(Array.isArray(r.out), 'lista');
  const campos = new Set();
  r.out.forEach(x => Object.keys(x).forEach(k => campos.add(k)));
  igual([...campos].sort(), ['ativo','codigo_cadastro','familia','id','nome','unidade','vai_ficha']);
  const t = r.out.find(x => x.id === TUBO);
  igual(t.codigo_cadastro, require('./material_dominio').codigoCadastro(TUBO));
  igual(t.unidade, 'm');
  igual(r.out.find(x => x.id === TEC).familia, 'BLACKOUT');
});
caso('traz o material com "vai para a ficha" desmarcado e o inativo marcados como tal (a tela filtra, como antes)', () => {
  const r = chamar('GET', '/api/componentes/para-ficha');
  igual(r.out.find(x => x.id === CAFE).vai_ficha, 0);
  igual(r.out.find(x => x.id === VELHO).ativo, 0);
});
caso('a ficha continua recusando no servidor o material com "vai para a ficha" desmarcado (R-CMP-02)', () => {
  const src = fs.readFileSync(path.join(__dirname, 'ficha_route.js'), 'utf8');
  verdade(/vai_ficha/.test(src), 'a trava continua na rota da fórmula');
});

/* ── A PERMISSÃO ─────────────────────────────────────────────────────────── */
const ac = { locals:{}, router:{ stack:[] }, get(){}, post(){}, delete(){} };
db.exec(`CREATE TABLE IF NOT EXISTS usuarios (id INTEGER PRIMARY KEY AUTOINCREMENT, nome TEXT,
  pin_hash TEXT, salt TEXT, areas TEXT, ativo INTEGER DEFAULT 1)`);
require('./acesso')(ac, db);
const AC = ac.locals.acesso;
caso('abre com as chaves da 404 (cadastrar modelo, ver custo, ver compras)', () => {
  igual(AC.permDaRota('/api/componentes/para-ficha', 'GET'), ['modelo.cadastrar','custo.ver','compras.ver']);
});
caso('a lista de Compras continua só de compras.ver', () => {
  igual(AC.permDaRota('/api/componentes', 'GET'), 'compras.ver');
});

/* ── A TELA 404 ──────────────────────────────────────────────────────────── */
caso('a 404 pede a lista da ficha, e não a de Compras', () => {
  const h = fs.readFileSync(path.join(__dirname, 'public/index.html'), 'utf8');
  const i = h.indexOf('async function carregarFicha()');
  const corpo = h.slice(i, h.indexOf('\n}\n', i));
  verdade(/\/api\/componentes\/para-ficha/.test(corpo), 'carregarFicha pede /api/componentes/para-ficha');
  verdade(!/fetch\('\/api\/componentes'\)/.test(corpo), 'e não pede mais a lista de Compras');
});

console.log('');
console.log(falha ? ('FALHARAM ' + falha + ' de ' + (ok + falha)) : ('todos os ' + ok + ' casos passaram'));
try{ fs.rmSync(tmp, {recursive:true, force:true}); }catch(e){}
process.exit(falha ? 1 : 0);

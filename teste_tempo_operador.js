#!/usr/bin/env node
/* teste_tempo_operador.js — o tempo da peça ao lado da mediana de quem a fez
 * (spec TEMPO-NA-BANCADA, cartão R-TEM-01, 21/11/2026).
 *
 *   node teste_tempo_operador.js
 *
 * Trava a conta (tempo_operador.js), a resposta das duas rotas que fecham a
 * peça (Revisão e Embalagem) e o desenho (public/tempo_bancada.js).
 */
const Database = require('better-sqlite3');
const fs = require('fs'), os = require('os'), path = require('path'), vm = require('vm');
const TEMPO = require('./tempo_operador');

let n = 0, falhas = 0;
function ok(desc, cond, detalhe){
  n++;
  if(cond) console.log('  ok  ' + n + ' — ' + desc);
  else { falhas++; console.log('  FALHOU ' + n + ' — ' + desc + (detalhe ? '\n         ' + detalhe : '')); }
}
function eq(desc, a, e){ ok(desc, JSON.stringify(a) === JSON.stringify(e), 'esperado ' + JSON.stringify(e) + ', veio ' + JSON.stringify(a)); }

const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'pcp-tempo-'));
const db = new Database(path.join(tmp, 't.db'));
db.exec(`
  CREATE TABLE revisao (id INTEGER PRIMARY KEY AUTOINCREMENT, codigo TEXT, inicio TEXT, fim TEXT,
    segundos INTEGER, data TEXT DEFAULT (date('now','localtime')), criado_em TEXT DEFAULT (datetime('now','localtime')),
    modo TEXT DEFAULT 'hoje', teste INTEGER DEFAULT 0, usuario_id INTEGER, usuario_nome TEXT);
  CREATE TABLE montagem (id INTEGER PRIMARY KEY AUTOINCREMENT, codigo TEXT, inicio TEXT, fim TEXT, segundos INTEGER,
    kit_ok INTEGER DEFAULT 1, data TEXT DEFAULT (date('now','localtime')), criado_em TEXT DEFAULT (datetime('now','localtime')),
    teste INTEGER DEFAULT 0, usuario_id INTEGER, usuario_nome TEXT, modo TEXT);
`);
const rev = (cod, seg, uid, dias, teste) => db.prepare(
  `INSERT INTO revisao (codigo,segundos,usuario_id,data,teste) VALUES (?,?,?,date('now','localtime',?),?)`)
  .run(cod, seg, uid, '-' + (dias||0) + ' days', teste||0).lastInsertRowid;

console.log('\n1. A conta');
eq('sem nenhuma peça: sem média, sem aviso', TEMPO.doBipe(db,'revisao',1,'A',40,null),
   { segundos:40, mediana:null, base:null, n:0, aviso:null });
rev('A',30,1); rev('A',40,1); rev('A',100,1);
let t = TEMPO.doBipe(db,'revisao',1,'A',35,null);
eq('mediana da pessoa no SKU (30·40·100 → 40), não a média', [t.mediana,t.base,t.n], [40,'sku',3]);
eq('mais rápido que a mediana: parabéns', t.aviso, 'parabens');
eq('no tempo exato da mediana: parabéns', TEMPO.doBipe(db,'revisao',1,'A',40,null).aviso, 'parabens');
eq('acima da mediana: pode melhorar', TEMPO.doBipe(db,'revisao',1,'A',41,null).aviso, 'melhorar');
eq('o SKU é comparado sem diferença de maiúscula', TEMPO.doBipe(db,'revisao',1,'a',35,null).mediana, 40);
eq('SKU sem peça no período: a mediana de todos os SKUs', (t=TEMPO.doBipe(db,'revisao',1,'B',35,null), [t.mediana,t.base]), [40,'geral']);
rev('A',500,2); rev('A',500,null);
eq('outra pessoa e linha sem id ficam fora', TEMPO.doBipe(db,'revisao',1,'A',35,null).mediana, 40);
rev('A',900,1,31); rev('A',900,1,0,1); rev('A',0,1);
eq('fora da janela de 30 dias, teste e tempo zero ficam fora', TEMPO.doBipe(db,'revisao',1,'A',35,null).n, 3);
eq('dentro da janela (30 dias atrás) conta', (rev('A',50,1,30), TEMPO.doBipe(db,'revisao',1,'A',35,null).n), 4);
const atual = rev('A',5000,1);
eq('a peça que acabou de gravar não entra na conta dela', TEMPO.doBipe(db,'revisao',1,'A',5000,atual).mediana, 45);
eq('sem login: sem média', TEMPO.doBipe(db,'revisao',null,'A',35,null).mediana, null);
eq('a embalagem tem a conta dela', TEMPO.doBipe(db,'montagem',1,'A',60,null).mediana, null);
ok('atividade desconhecida não vira zero calado', (()=>{ try{ TEMPO.doBipe(db,'corte',1,'A',1,null); return false; }catch(e){ return true; } })());
eq('o seguro não derruba o bipe', TEMPO.seguro(db,'corte',1,'A',1,null), null);
{ const velho = new Database(':memory:'); velho.exec('CREATE TABLE revisao (id INTEGER PRIMARY KEY, codigo TEXT, segundos INTEGER)');
  eq('consulta que falha (banco sem a coluna) vira null, e não "primeira peça"', TEMPO.seguro(velho,'revisao',1,'A',30,null), null); }

console.log('\n2. As rotas devolvem o tempo');
{ // Revisão
  const d2 = new Database(':memory:');
  d2.exec(`CREATE TABLE skus (codigo TEXT PRIMARY KEY, descricao TEXT DEFAULT '', cor TEXT DEFAULT '', estoque INTEGER DEFAULT 0, alvo INTEGER DEFAULT 0);
    CREATE TABLE producao (id INTEGER PRIMARY KEY AUTOINCREMENT, codigo TEXT, qtd INTEGER, produzido INTEGER DEFAULT 0, data TEXT DEFAULT (date('now','localtime')), teste INTEGER DEFAULT 0);
    CREATE TABLE revisao (id INTEGER PRIMARY KEY AUTOINCREMENT, codigo TEXT, inicio TEXT, fim TEXT, segundos INTEGER, data TEXT DEFAULT (date('now','localtime')), criado_em TEXT DEFAULT (datetime('now','localtime')), modo TEXT DEFAULT 'hoje', teste INTEGER DEFAULT 0);
    CREATE TABLE fila (id INTEGER PRIMARY KEY AUTOINCREMENT, codigo TEXT, modo TEXT DEFAULT 'hoje', situacao TEXT DEFAULT 'aguardando', revisado_em TEXT DEFAULT (datetime('now','localtime')), embalado_em TEXT, data TEXT DEFAULT (date('now','localtime')), teste INTEGER DEFAULT 0);
    INSERT INTO skus (codigo) VALUES ('BK1');`);
  const rotas = {}; const app = { locals:{}, get(p,h){ rotas['GET '+p]=h; }, post(p,h){ rotas['POST '+p]=h; } };
  require('./revisao_route')(app, d2);
  const post = (seg, u) => { const out={}; const res={ status(c){ out.s=c; return res; }, json(b){ out.b=b; return res; } };
    rotas['POST /api/revisao']({ body:{ codigo:'BK1', segundos:seg }, params:{}, query:{}, headers:{}, usuario:u }, res); return out.b; };
  const ANA = { id:7, nome:'Ana' };
  let b = post(30, ANA);
  eq('Revisão: a primeira peça volta sem média', [b.ok, b.tempo && b.tempo.segundos, b.tempo && b.tempo.mediana], [true, 30, null]);
  post(40, ANA); b = post(50, ANA);
  eq('Revisão: a terceira compara com a mediana das duas de antes (30·40 → 35)', [b.tempo.mediana, b.tempo.aviso], [35, 'melhorar']);
  b = post(20, { id:8, nome:'Bia' });
  eq('Revisão: outra pessoa não herda a média da Ana', b.tempo.mediana, null);
}
{ // Embalagem: a rota é grande; confere-se que ela chama a conta com a linha nova
  const src = fs.readFileSync(path.join(__dirname,'mont_route.js'),'utf8');
  ok('Embalagem: a resposta do POST /api/montagem leva o tempo', /TEMPO\.seguro\(db,'montagem',q\.usuario_id,cod,seg,novo\)/.test(src) && /estoque:est\?est\.estoque:0,tempo\}/.test(src));
  ok('Embalagem: a linha nova fica fora da conta dela (novo=mid)', /novo=mid;/.test(src));
}

console.log('\n3. O desenho');
{
  const st = { textContent:'' };
  const ctx = { window:{}, document:{ createElement:()=>st, head:{ appendChild(){} } }, String };
  vm.runInNewContext(fs.readFileSync(path.join(__dirname,'public','tempo_bancada.js'),'utf8'), ctx);
  const f = ctx.window.tempoBancada;
  eq('sem tempo (servidor antigo): nada', f(undefined), '');
  let h = f({ segundos:52, mediana:64, base:'sku', aviso:'parabens' });
  ok('parabéns com duas barras e a diferença', /Parabéns!/.test(h) && /Agora/.test(h) && /Sua média</.test(h) && /12 s abaixo da sua média/.test(h) && /1:04/.test(h), h);
  h = f({ segundos:91, mediana:64, base:'sku', aviso:'melhorar' });
  ok('pode melhorar, com a barra âmbar', /Você pode melhorar/.test(h) && /class="lento"/.test(h) && /27 s acima/.test(h), h);
  h = f({ segundos:58, mediana:62, base:'geral', aviso:'parabens' });
  ok('a média de todos os SKUs diz isso', /Sua média \(todos os SKUs\)/.test(h), h);
  h = f({ segundos:41, mediana:null, base:null, aviso:null });
  ok('primeira peça: só a barra de agora, sem aviso', /ainda sem média/.test(h) && !/Parabéns|melhorar/.test(h), h);
  h = f({ segundos:70, mediana:20, base:'sku', aviso:'parabens' });
  ok('quem decide o aviso é o servidor, não a tela', /Parabéns!/.test(h), h);
  const tels = ['operador','montagem'].map(x => fs.readFileSync(path.join(__dirname,'public',x+'.html'),'utf8'));
  ok('as duas telas carregam o desenho e o usam', tels.every(s => /src="\/tempo_bancada\.js"/.test(s) && /tempoBancada\(r/.test(s)));
}

db.close(); fs.rmSync(tmp, { recursive:true, force:true });
console.log('\n' + (falhas ? falhas + ' de ' + n + ' FALHARAM' : 'todos os ' + n + ' passaram'));
process.exit(falhas ? 1 : 0);

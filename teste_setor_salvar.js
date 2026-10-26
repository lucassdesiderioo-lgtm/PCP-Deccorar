/* teste_setor_salvar.js — fase 3 da spec ACESSOS-UNIFICADOS: A TELA DE SETOR
 * NAO APAGA NADA (divida 20) e sai a chave que nenhuma rota le (divida 19).
 *
 *   node teste_setor_salvar.js
 *
 * O defeito (19/09/2026, armadilha #34): o `POST /api/acesso/setores` fazia
 * DELETE + INSERT da lista inteira, e a tela so mandava as caixinhas
 * MARCADAS — as que ficavam acima do nivel do setor ela desenhava
 * `disabled`, entao nunca eram mandadas. Salvar o setor por qualquer motivo
 * apagava a chave em silencio. Foi assim que `sobmedida.cadastrar` saiu do
 * "Sob medida / Cadastros" num salvamento que era sobre outra coisa.
 *
 * A regra nova (R-ACE-03): o NIVEL e etiqueta de cuidado, nao trava
 * escondida. Salvar nunca apaga uma permissao que a pessoa nao desmarcou, e a
 * permissao SENSIVEL nova pede confirmacao antes de entrar.
 *
 * Escrito ANTES do codigo (§0, risco vermelho). Banco temporario.
 */
const fs = require('fs');
const os = require('os');
const path = require('path');
const Database = require('better-sqlite3');

let n = 0, falhas = 0;
function ok(desc, cond, detalhe){
  n++;
  if(cond) console.log('  ok  ' + n + ' — ' + desc);
  else { falhas++; console.log('  FALHOU ' + n + ' — ' + desc + (detalhe ? '\n         ' + detalhe : '')); }
}
function eq(desc, achado, esperado){
  ok(desc, achado === esperado, 'esperado ' + JSON.stringify(esperado) + ', veio ' + JSON.stringify(achado));
}

const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'setor-salvar-'));
const db = new Database(path.join(dir, 'teste.db'));
db.exec(`CREATE TABLE usuarios (id INTEGER PRIMARY KEY AUTOINCREMENT, nome TEXT,
    pin_hash TEXT, salt TEXT, areas TEXT, ativo INTEGER DEFAULT 1);
  CREATE TABLE config (chave TEXT PRIMARY KEY, valor TEXT);`);

/* Um banco de ANTES: a chave `minimo.definir` estava no setor Comprador e numa
   excecao. O primeiro boot cria tudo; depois ela e posta de volta como era. */
const rotas = {};
const appFalso = () => ({ locals:{}, router:{ stack:[] },
  get(p,h){ rotas['GET '+p]=h; }, post(p,h){ rotas['POST '+p]=h; }, delete(p,h){ rotas['DELETE '+p]=h; } });
db.prepare("INSERT INTO config (chave,valor) VALUES ('acesso_minimo_definir','1')").run();
require('./acesso')(appFalso(), db);
const setorId = nome => db.prepare('SELECT id FROM setores WHERE nome=?').get(nome).id;
const ag = db.prepare("INSERT INTO usuarios (nome,pin_hash,salt,areas,ativo) VALUES ('Lucas','x','y','',1)").run().lastInsertRowid;
db.prepare('INSERT INTO usuario_setor (usuario_id,setor_id) VALUES (?,?)').run(ag, setorId('Admin Geral'));
const comp = db.prepare("INSERT INTO usuarios (nome,pin_hash,salt,areas,ativo) VALUES ('Caio','x','y','',1)").run().lastInsertRowid;
db.prepare("INSERT OR IGNORE INTO setor_permissao (setor_id,chave) VALUES (?,'minimo.definir')").run(setorId('Comprador'));
db.prepare("INSERT INTO usuario_excecao (usuario_id,chave,concede) VALUES (?,'minimo.definir',1)").run(comp);
db.prepare("DELETE FROM config WHERE chave='acesso_minimo_definir'").run();

const app = appFalso();
require('./acesso')(app, db);
const AC = app.locals.acesso;
const PERMISSOES = require('./permissoes');
const chamar = (metodo, rota, corpo) => {
  const out = { status:200, body:null };
  const res = { status(c){ out.status=c; return res; }, json(b){ out.body=b; return res; }, send(b){ out.body=b; return res; } };
  rotas[metodo+' '+rota]({ body:corpo||{}, params:{}, query:{}, headers:{}, usuario:{ id:ag, nome:'Lucas', areas:['admin'] } }, res);
  return out;
};
const chaves = id => db.prepare('SELECT chave FROM setor_permissao WHERE setor_id=?').all(id).map(r => r.chave).sort();

console.log('\n── 1. a chave que nenhuma rota le saiu (divida 19) ──');
ok('minimo.definir saiu do registro', !PERMISSOES.find(p => p.chave === 'minimo.definir'));
eq('e de setor e excecao no banco', db.prepare(`SELECT COUNT(*) c FROM (SELECT chave FROM setor_permissao WHERE chave='minimo.definir'
  UNION ALL SELECT chave FROM usuario_excecao WHERE chave='minimo.definir')`).get().c, 0);
ok('o Comprador continua com o que de fato manda no card Materiais',
  chaves(setorId('Comprador')).includes('componente.cadastrar') && chaves(setorId('Comprador')).includes('compras.ver'));

console.log('\n── 2. SALVAR NAO APAGA o que esta acima do nivel do setor ──');
/* O caso real de 19/09/2026: setor de nivel `supervisor` com uma chave
   `admin` que ninguem desmarcou. */
const s = setorId('Supervisor');
db.prepare("INSERT OR IGNORE INTO setor_permissao (setor_id,chave) VALUES (?,'compras.ver')").run(s);
db.prepare("INSERT OR IGNORE INTO setor_permissao (setor_id,chave) VALUES (?,'custo.ver')").run(s);   // admin
const antes = chaves(s);
/* A TELA VELHA (a aba que ficou aberta num navegador antes do deploy): manda
   so as caixinhas habilitadas, sem a marca `todas`. */
const soHabilitadas = antes.filter(c => c !== 'custo.ver');
let r = chamar('POST', '/api/acesso/setores', { id:s, nome:'Supervisor', nivel:'supervisor', permissoes:soHabilitadas });
eq('a tela velha salva', r.status, 200);
ok('e o custo.ver (acima do nivel) CONTINUA no setor — ninguem o desmarcou', chaves(s).includes('custo.ver'), chaves(s).join(','));
/* A TELA NOVA: manda a lista inteira, inclusive o que esta acima do nivel. */
r = chamar('POST', '/api/acesso/setores', { id:s, nome:'Supervisor', nivel:'supervisor', permissoes:antes, todas:true });
eq('a tela nova salva com a chave acima do nivel na lista', r.status, 200, JSON.stringify(r.body));
eq('e nada mudou', chaves(s).join(','), antes.join(','));

console.log('\n── 3. desmarcar continua tirando ──');
r = chamar('POST', '/api/acesso/setores', { id:s, nome:'Supervisor', nivel:'supervisor',
  permissoes:antes.filter(c => c !== 'custo.ver' && c !== 'compras.ver'), todas:true });
eq('salva', r.status, 200);
ok('o que foi desmarcado saiu, os dois', !chaves(s).includes('custo.ver') && !chaves(s).includes('compras.ver'));

console.log('\n── 4. o NIVEL e etiqueta, e a SENSIVEL nova pede confirmacao ──');
const semCusto = chaves(s);
r = chamar('POST', '/api/acesso/setores', { id:s, nome:'Supervisor', nivel:'supervisor',
  permissoes:semCusto.concat(['custo.ver']), todas:true });
eq('marcar uma sensivel nova sem confirmar e recusado (409)', r.status, 409);
ok('e a resposta diz QUAL, com o nome da tela', Array.isArray(r.body && r.body.sensiveis) &&
  r.body.sensiveis.some(x => x.chave === 'custo.ver' && !!x.rotulo), JSON.stringify(r.body));
ok('e nada foi gravado', !chaves(s).includes('custo.ver'));
r = chamar('POST', '/api/acesso/setores', { id:s, nome:'Supervisor', nivel:'supervisor',
  permissoes:semCusto.concat(['custo.ver']), todas:true, confirmar:true });
eq('confirmando, salva — o nivel do setor nao e mais trava escondida', r.status, 200, JSON.stringify(r.body));
ok('e a chave entrou', chaves(s).includes('custo.ver'));
r = chamar('POST', '/api/acesso/setores', { id:s, nome:'Supervisor', nivel:'supervisor', permissoes:chaves(s), todas:true });
eq('salvar de novo sem mexer nao pede confirmacao (a sensivel ja estava la)', r.status, 200, JSON.stringify(r.body));

console.log('\n── 5. as INTRANSFERIVEIS continuam fora de qualquer setor que nao seja o Admin Geral ──');
/* Com o nivel virando etiqueta, a unica coisa que impedia pessoas.gerenciar num
   setor qualquer era ele ser de nivel admin_geral. A trava tem que existir por
   ela mesma (armadilha #28). */
for(const c of ['pessoas.gerenciar','setores.gerenciar','auditoria.ver']){
  r = chamar('POST', '/api/acesso/setores', { id:s, nome:'Supervisor', nivel:'supervisor',
    permissoes:chaves(s).concat([c]), todas:true, confirmar:true });
  eq(c + ' num setor comum e recusada', r.status, 400);
  ok('  e nao entrou', !chaves(s).includes(c));
}
r = chamar('POST', '/api/acesso/setores', { nome:'Coordenacao', nivel:'admin', permissoes:['pessoas.gerenciar'], todas:true, confirmar:true });
eq('nem num setor novo', r.status, 400);

db.close();
fs.rmSync(dir, { recursive:true, force:true });
console.log('\n' + (n - falhas) + ' ok, ' + falhas + ' falha(s)\n');
process.exit(falhas ? 1 : 0);

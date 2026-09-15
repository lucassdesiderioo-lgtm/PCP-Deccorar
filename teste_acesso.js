/* teste_acesso.js — as TRES PONTAS de uma permissao nova (§19, armadilha #13).
 *
 * Uma permissao so existe de verdade quando as tres estao no lugar:
 *   1. a CHAVE em permissoes.js  (senao a caixinha nao aparece em Acessos)
 *   2. a ROTA em permDaRota()    (senao a rota cai no '@logado' e nao gateia nada)
 *   3. alguem COM a chave        (senao a tela existe e da 403 para todo mundo)
 *
 * Faltando qualquer uma, o modo de falhar e o pior possivel: nao ha erro, nao ha
 * log, e ninguem descobre ate a caixa ficar parada em Bloqueados. Este arquivo
 * sobe o acesso.js contra um banco temporario e confere as tres.
 *
 * Rode:  node teste_acesso.js
 */
const fs = require('fs');
const os = require('os');
const path = require('path');
const Database = require('better-sqlite3');
const PERMISSOES = require('./permissoes');

let n = 0, falhas = 0;
function ok(desc, cond, detalhe){
  n++;
  if(cond) console.log('  ok  ' + n + ' — ' + desc);
  else { falhas++; console.log('  FALHOU ' + n + ' — ' + desc + (detalhe ? '\n         ' + detalhe : '')); }
}
function eq(desc, achado, esperado){
  ok(desc, achado === esperado, 'esperado ' + JSON.stringify(esperado) + ', veio ' + JSON.stringify(achado));
}

// ── harness: banco temporario + app falso (acesso.js so usa get/post/delete) ──
const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'acesso-'));
const db = new Database(path.join(dir, 'teste.db'));
db.exec(`
  CREATE TABLE usuarios (id INTEGER PRIMARY KEY AUTOINCREMENT, nome TEXT,
    pin_hash TEXT, salt TEXT, areas TEXT, ativo INTEGER DEFAULT 1);
  CREATE TABLE config (chave TEXT PRIMARY KEY, valor TEXT);
`);
const app = { locals:{}, get(){}, post(){}, delete(){} };
require('./acesso')(app, db);
const AC = app.locals.acesso;

console.log('\n── 1. a CHAVE existe no registro ──');
const chave = PERMISSOES.find(p => p.chave === 'pacote.assinar');
ok('pacote.assinar esta declarada em permissoes.js', !!chave);
if(chave){
  eq('nivel admin (quem assina decide o conteudo da caixa)', chave.nivel, 'admin');
  ok('marcada como sensivel — a assinatura mexe no saldo sem venda na frente', chave.sensivel === true);
  ok('tem rotulo e descricao (e o que aparece na tela de Acessos)', !!chave.rotulo && !!chave.desc);
}
ok('a chave chegou na tabela `permissoes` no boot',
  !!db.prepare("SELECT 1 FROM permissoes WHERE chave='pacote.assinar'").get());

console.log('\n── 2. a ROTA esta declarada ──');
eq('POST /api/pacote/resolver exige pacote.assinar',
  AC.permDaRota('/api/pacote/resolver', 'POST'), 'pacote.assinar');
eq('GET /api/pacote/pendentes e leitura da aba Bloqueados (@admin)',
  AC.permDaRota('/api/pacote/pendentes', 'GET'), '@admin');
/* O bipe das pecas acontece na BANCADA da Etiqueta de Venda, e sem ele a
   impressao e recusada. Se ele cair no `pre('/api/lote')` -> 'pdf.subir', quem
   tem so 'etiqueta.emitir' nao confere NEM imprime: a trava tranca a propria
   bancada que ela existe para proteger. */
eq('POST /api/lote/conferir e da bancada da etiqueta, nao do upload',
  AC.permDaRota('/api/lote/conferir', 'POST'), 'etiqueta.emitir');
eq('POST /api/lote/upload continua sendo de quem sobe o PDF',
  AC.permDaRota('/api/lote/upload', 'POST'), 'pdf.subir');
/* As outras duas travas da mesma aba nao podem ter mudado de dono. */
eq('divergencia continua em sku.cadastrar',
  AC.permDaRota('/api/divergencias/resolver', 'POST'), 'sku.cadastrar');
eq('modalidade continua em @admin',
  AC.permDaRota('/api/modalidade/resolver', 'POST'), '@admin');
/* Nenhuma rota de pacote pode cair no fallback '@logado' — era esse o buraco:
   a tela e '@admin', mas a ROTA aceitava qualquer pessoa logada. */
ok('nenhuma rota /api/pacote cai no fallback @logado',
  ['GET','POST'].every(m => ['/api/pacote', '/api/pacote/pendentes', '/api/pacote/resolver']
    .every(r => AC.permDaRota(r, m) !== '@logado')));

console.log('\n── 3. alguem TEM a chave ──');
const setores = db.prepare(`SELECT s.nome FROM setores s
  JOIN setor_permissao sp ON sp.setor_id=s.id WHERE sp.chave='pacote.assinar' ORDER BY s.nome`).all().map(r => r.nome);
ok('instalacao limpa: o setor Admin ja nasce podendo assinar',
  setores.indexOf('Admin') >= 0, 'setores com a chave: ' + (setores.join(', ') || '(nenhum)'));
/* Admin Geral tem TODAS por definicao — o resolvedor forca isso, entao a lista
   dele nao precisa da chave. Aqui ela vem do seed, e as duas coisas valem. */
const ug = db.prepare("INSERT INTO usuarios (nome,areas) VALUES ('Geral','admin')").run().lastInsertRowid;
const sg = db.prepare("SELECT id FROM setores WHERE nome='Admin Geral'").get().id;
db.prepare("INSERT INTO usuario_setor (usuario_id,setor_id) VALUES (?,?)").run(ug, sg);
ok('Admin Geral pode assinar', AC.permissoesDe(ug).has('pacote.assinar'));
/* E quem NAO tem nao pode — senao o gate nao gateia nada. */
const uo = db.prepare("INSERT INTO usuarios (nome,areas) VALUES ('Bancada','embalagem')").run().lastInsertRowid;
const so = db.prepare("SELECT id FROM setores WHERE nome='Operador / Expedição'").get().id;
db.prepare("INSERT INTO usuario_setor (usuario_id,setor_id) VALUES (?,?)").run(uo, so);
ok('operador de expedicao NAO assina', !AC.permissoesDe(uo).has('pacote.assinar'));
ok('...mas continua conferindo as pecas na bancada (etiqueta.emitir)',
  AC.permissoesDe(uo).has('etiqueta.emitir'));
/* E o veredito de ponta a ponta — e o `decidir()` que o auth.js chama, nao o
   permDaRota sozinho: '@admin' e '@ag' so viram sim ou nao aqui. */
const u2 = { id:uo, nome:'Bancada' }, g2 = { id:ug, nome:'Geral' };
ok('decidir(): a bancada NAO assina', AC.decidir(u2, '/api/pacote/resolver', 'POST').ok === false);
ok('decidir(): a bancada nao abre nem a lista de caixas retidas (@admin)',
  AC.decidir(u2, '/api/pacote/pendentes', 'GET').ok === false);
ok('decidir(): a bancada BIPA as pecas antes de imprimir',
  AC.decidir(u2, '/api/lote/conferir', 'POST').ok === true);
ok('decidir(): Admin Geral assina', AC.decidir(g2, '/api/pacote/resolver', 'POST').ok === true);
/* Um setor de gestao real (Admin), que e quem usa a aba Bloqueados no dia a dia. */
const ua = db.prepare("INSERT INTO usuarios (nome,areas) VALUES ('Gestao','admin')").run().lastInsertRowid;
const sa = db.prepare("SELECT id FROM setores WHERE nome='Admin'").get().id;
db.prepare("INSERT INTO usuario_setor (usuario_id,setor_id) VALUES (?,?)").run(ua, sa);
ok('decidir(): o setor Admin assina', AC.decidir({ id:ua, nome:'Gestao' }, '/api/pacote/resolver', 'POST').ok === true);

console.log('\n── 4. o banco que JA EXISTE recebe a chave nova ──');
/* Esta e a ponta que ninguem ve quebrar: o seed de setores so grava quando o
   setor NASCE. Num banco de producao o setor Admin existe ha meses, e sem o
   backfill a chave nova nunca chegaria a ninguem — 403 para todo mundo, sem
   erro e sem log. Simula: apaga a chave de todo mundo, apaga a marca, reboota. */
db.prepare("DELETE FROM setor_permissao WHERE chave='pacote.assinar'").run();
db.prepare("DELETE FROM config WHERE chave='seed_pacote_assinar'").run();
require('./acesso')({ locals:{}, get(){}, post(){}, delete(){} }, db);
const depois = db.prepare(`SELECT s.nome FROM setores s
  JOIN setor_permissao sp ON sp.setor_id=s.id WHERE sp.chave='pacote.assinar'`).all().map(r => r.nome);
ok('o backfill levou a chave a quem ja resolve divergencia (sku.cadastrar)',
  depois.indexOf('Admin') >= 0, 'setores com a chave: ' + (depois.join(', ') || '(nenhum)'));
ok('e so a quem ja resolvia — ninguem ganha o que nao tinha',
  depois.every(nome => db.prepare(`SELECT 1 FROM setores s JOIN setor_permissao sp ON sp.setor_id=s.id
    WHERE s.nome=? AND sp.chave='sku.cadastrar'`).get(nome)));
/* E roda UMA vez: quem desmarcar a caixinha nao a ve voltar no proximo restart,
   senao a decisao de quem gerencia acesso seria desfeita a cada boot. */
db.prepare("DELETE FROM setor_permissao WHERE chave='pacote.assinar'").run();
require('./acesso')({ locals:{}, get(){}, post(){}, delete(){} }, db);
eq('o backfill NAO volta no boot seguinte (decisao de acesso e respeitada)',
  db.prepare("SELECT COUNT(*) c FROM setor_permissao WHERE chave='pacote.assinar'").get().c, 0);

console.log('\n── 5. a cobertura enxerga as rotas novas ──');
/* Rota que nao esta em TODAS_ROTAS nao aparece no relatorio de cobertura nem no
   aviso do boot — fica invisivel justamente para quem confere se sobrou buraco. */
const fonte = fs.readFileSync(path.join(__dirname, 'acesso.js'), 'utf8');
/* Recorta a LISTA em vez de procurar no arquivo inteiro: as mesmas rotas
   aparecem antes, em permDaRota(), e um indexOf solto acharia aquelas. */
const ini = fonte.indexOf('const TODAS_ROTAS');
const lista = fonte.slice(ini, fonte.indexOf('];', ini));
['/api/pacote/pendentes', '/api/pacote/resolver', '/api/lote/conferir'].forEach(r =>
  ok('TODAS_ROTAS lista ' + r, ini >= 0 && lista.indexOf("'" + r + "'") >= 0));

db.close();
try{ fs.rmSync(dir, { recursive:true, force:true }); }catch(e){}
console.log('');
if(falhas){ console.log(falhas + ' de ' + n + ' casos FALHARAM'); process.exit(1); }
console.log('todos os ' + n + ' casos passaram');

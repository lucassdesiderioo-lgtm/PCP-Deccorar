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
/* O app falso passou a GUARDAR os handlers (17/09/2026, divida 17): as travas
   de escalonamento moram nas ROTAS, e ate aqui este arquivo so conseguia
   perguntar ao permDaRota. Trava que ninguem chama e trava que ninguem testa. */
const rotas = {};
const app = { locals:{},
  get(p,h){ rotas['GET '+p]=h; }, post(p,h){ rotas['POST '+p]=h; },
  delete(p,h){ rotas['DELETE '+p]=h; } };
require('./acesso')(app, db);
const AC = app.locals.acesso;
function chamar(metodo, rota, corpo, params, usuario){
  const h = rotas[metodo+' '+rota];
  if(!h) throw new Error('rota nao registrada: '+metodo+' '+rota);
  const out = { status:200, body:null };
  const res = { status(c){ out.status=c; return res; }, json(b){ out.body=b; return res; },
                send(b){ out.body=b; return res; } };
  h({ body:corpo||{}, params:params||{}, query:{}, headers:{}, usuario:usuario||null }, res);
  return out;
}

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
/* O conteudo da etiqueta do kit (spec GERADOR-ETIQUETA-KIT, fase 1) e do mesmo
   dono do Codigo do kit: e a mesma decisao, no mesmo card. Cair no '@logado'
   deixaria qualquer pessoa logada trocar o QR do manual — sem erro e sem log. */
eq('POST /api/config/kit/etiqueta exige kit.editar',
  AC.permDaRota('/api/config/kit/etiqueta', 'POST'), 'kit.editar');
eq('o Codigo do kit continua em kit.editar',
  AC.permDaRota('/api/config/kit', 'POST'), 'kit.editar');
eq('ler a etiqueta e leitura de tela (a Embalagem le o codigo no tablet)',
  AC.permDaRota('/api/config/kit/etiqueta', 'GET'), '@logado');
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
['/api/pacote/pendentes', '/api/pacote/resolver', '/api/lote/conferir',
 '/api/kit/etiqueta/imprimir'].forEach(r =>
  ok('TODAS_ROTAS lista ' + r, ini >= 0 && lista.indexOf("'" + r + "'") >= 0));

console.log('\n── 6. imprimir a etiqueta do kit NAO e editar o kit ──');
/* ⚠️ A ORDEM DAS LINHAS EM permDaRota() E A REGRA. A rota da impressao comeca
   com /api/kit, entao um `pre('/api/kit')` acima dela engoliria a chave nova e
   ela nao mandaria em nada — declarada, listada, e sem efeito. E a ponta que
   some em silencio (§5, armadilha #23) na sua terceira forma. */
const P = require('./permissoes');
ok('a chave kit.imprimir esta declarada em permissoes.js',
  P.some(p => p.chave === 'kit.imprimir'));
eq('POST /api/kit/etiqueta/imprimir pede kit.imprimir',
  AC.permDaRota('/api/kit/etiqueta/imprimir', 'POST'), 'kit.imprimir');
eq('...e o resto de /api/kit continua em kit.editar',
  AC.permDaRota('/api/kit/qualquer/outra', 'POST'), 'kit.editar');
eq('editar o conteudo da etiqueta continua sendo kit.editar',
  AC.permDaRota('/api/config/kit/etiqueta', 'POST'), 'kit.editar');
/* ⚠️ ELA NASCE SEM DONO, POR DECISAO DO DONO (17/09/2026): nao ha backfill.
   Quem edita o kit NAO ganha a impressao de brinde — o dono assinala nome por
   nome na tela de Acessos. E o contrario do caso `pacote.assinar`, onde a
   chave tinha que alcancar sozinha quem JA fazia aquilo; aqui ninguem fazia,
   porque a impressao nao existia. */
const comImprimir = db.prepare(`SELECT s.nome FROM setores s
  JOIN setor_permissao sp ON sp.setor_id=s.id WHERE sp.chave='kit.imprimir'`).all().map(r => r.nome);
eq('nenhum setor de gestao nasce com a chave (sem backfill, por decisao do dono)',
  comImprimir.filter(x => x !== 'Admin Geral').length, 0,
  'setores com a chave: ' + (comImprimir.join(', ') || '(nenhum)'));
/* Mas o dono NAO fica trancado do lado de fora: Admin Geral passa em tudo, por
   nivel. Sem isso a fase 3 subiria com a tela dando 403 para todo mundo — o
   defeito das tres pontas, onde a terceira e "alguem que tenha a chave". */
ok('...mas o Admin Geral imprime desde o primeiro boot',
  AC.decidir(g2, '/api/kit/etiqueta/imprimir', 'POST').ok === true);
ok('e quem so tem kit.editar NAO imprime',
  AC.decidir({ id:ua, nome:'Gestao' }, '/api/kit/etiqueta/imprimir', 'POST').ok === false);

/* ═══════════ AS TRAVAS DE ESCALONAMENTO (divida 17, 17/09/2026) ═══════════
   Tudo daqui pra baixo responde a mesma pergunta: DA PRA SUBIR DE NIVEL PELA
   TELA OFICIAL? Enquanto desse, a tela de Acessos era o caminho mais curto
   entre "tenho acesso de admin" e "tenho acesso a tudo" — e o rastro que ela
   deixa (auditoria) mostra uma acao legitima, porque ela ERA legitima. */
const AG = { id:ug, nome:'Geral' };   // o Admin Geral do bloco 3

console.log('\n── 7. a excecao nao delega o INDELEGAVEL ──');
const INTRANSF = ['pessoas.gerenciar','setores.gerenciar','auditoria.ver'];
const uNovo = db.prepare("INSERT INTO usuarios (nome,areas) VALUES ('Ze da Bancada','')").run().lastInsertRowid;
let recusou = 0;
for(const chave of INTRANSF){
  const r = chamar('POST','/api/acesso/usuario/:id/excecao',{chave,concede:1,motivo:'teste'},{id:String(uNovo)},AG);
  if(r.status === 400) recusou++;
}
eq('as tres chaves intransferiveis sao recusadas', recusou, 3);
eq('e NENHUMA foi gravada', db.prepare("SELECT COUNT(*) c FROM usuario_excecao WHERE usuario_id=? AND concede=1").get(uNovo).c, 0);
ok('quem recebeu a recusa nao ganhou a permissao', !AC.permissoesDe(uNovo).has('pessoas.gerenciar'));
/* REVOGAR uma intransferivel continua valendo: ela nao escala ninguem, e
   recusar tambem a revogacao seria trava disparando no caso seguro. */
let r7 = chamar('POST','/api/acesso/usuario/:id/excecao',{chave:'pessoas.gerenciar',concede:0,motivo:'teste'},{id:String(uNovo)},AG);
eq('mas REVOGAR uma intransferivel continua permitido', r7.status, 200);
r7 = chamar('POST','/api/acesso/usuario/:id/excecao',{chave:'custo.ver',concede:1,motivo:'ve custo'},{id:String(uNovo)},AG);
eq('e a excecao normal continua funcionando', r7.status, 200);
ok('a pessoa ganhou a permissao concedida', AC.permissoesDe(uNovo).has('custo.ver'));

console.log('\n── 8. o ultimo Admin Geral nao se tranca do lado de fora ──');
const sgId = db.prepare("SELECT id FROM setores WHERE nome='Admin Geral'").get().id;
const sOper = db.prepare("SELECT id FROM setores WHERE nome='Operador / Revisão'").get().id;
let r8 = chamar('POST','/api/acesso/usuario/:id/setores',{setores:[sOper]},{id:String(ug)},AG);
eq('tirar o Admin Geral do UNICO Admin Geral → 400', r8.status, 400);
ok('e ele continua Admin Geral', AC.ehAdminGeral(ug), 'perdeu o acesso total');
/* Com um segundo Admin Geral ativo, a troca passa: a trava e do ULTIMO. */
const ug2 = db.prepare("INSERT INTO usuarios (nome,areas) VALUES ('Segundo Geral','')").run().lastInsertRowid;
db.prepare("INSERT INTO usuario_setor (usuario_id,setor_id) VALUES (?,?)").run(ug2, sgId);
r8 = chamar('POST','/api/acesso/usuario/:id/setores',{setores:[sOper]},{id:String(ug)},AG);
eq('com outro Admin Geral ativo, a troca passa', r8.status, 200);
ok('e agora ele nao e mais Admin Geral', !AC.ehAdminGeral(ug));
ok('...mas a casa continua tendo um', AC.ehAdminGeral(ug2));
/* Devolve o cracha do `ug` para o resto do arquivo: ele e quem chama as rotas
   daqui pra baixo, e sem Admin Geral as chamadas viram 403 e os casos
   seguintes passariam a testar o 403, nao a trava. */
db.prepare("INSERT OR IGNORE INTO usuario_setor (usuario_id,setor_id) VALUES (?,?)").run(ug, sgId);
r8 = chamar('POST','/api/acesso/usuario/:id/setores',{setores:[]},{id:String(uNovo)},AG);
eq('mexer nos setores de quem nao e Admin Geral continua livre', r8.status, 200);

console.log('\n── 9. setor NOVO nao nasce Admin Geral ──');
let r9 = chamar('POST','/api/acesso/setores',{nome:'Quase Geral',nivel:'admin_geral',permissoes:[]},{},AG);
eq('criar setor de nivel admin_geral → 400', r9.status, 400);
eq('e ele nao foi criado', db.prepare("SELECT COUNT(*) c FROM setores WHERE nome='Quase Geral'").get().c, 0);
r9 = chamar('POST','/api/acesso/setores',{nome:'Conferencia',nivel:'admin',permissoes:['custo.ver']},{},AG);
eq('setor de nivel admin continua sendo criado normalmente', r9.status, 200);
r9 = chamar('POST','/api/acesso/setores',{id:sgId,nome:'Admin Geral',nivel:'admin_geral',permissoes:[]},{},AG);
eq('editar o setor Admin Geral continua recusado', r9.status, 400);

console.log('\n── 10. PORTA A: a excecao nao promove ninguem a Admin Geral ──');
/* A cadeia era: excecao de nivel admin → sincronizarAreas grava areas='admin'
   → migrarPendentes le `areas` (que virou SOMBRA, §19 armadilha #13) e traduz
   'admin' para o setor ADMIN GERAL. Quem so devia ver custo saia com acesso
   total, sem ninguem ter pedido isso — e a auditoria mostrando so a excecao. */
const uPorta = db.prepare("INSERT INTO usuarios (nome,areas) VALUES ('Alvo da Porta A','')").run().lastInsertRowid;
chamar('POST','/api/acesso/usuario/:id/excecao',{chave:'custo.ver',concede:1,motivo:'ve custo'},{id:String(uPorta)},AG);
ok('a sombra `areas` ganha admin (é como o modelo antigo enxerga a pessoa)',
  (db.prepare("SELECT areas FROM usuarios WHERE id=?").get(uPorta).areas||'').indexOf('admin') >= 0);
// esta rota chama migrarPendentes() — era aqui que a promocao acontecia
chamar('GET','/api/acesso/usuario/:id',{},{id:String(uPorta)},AG);
ok('NAO virou Admin Geral', !AC.ehAdminGeral(uPorta), 'a porta A ainda escala');
eq('e nao ganhou setor nenhum por causa da sombra',
  db.prepare("SELECT COUNT(*) c FROM usuario_setor WHERE usuario_id=?").get(uPorta).c, 0);
ok('continua tendo so a permissao que lhe deram', AC.permissoesDe(uPorta).has('custo.ver'));
ok('e nao pode gerenciar pessoas', !AC.permissoesDe(uPorta).has('pessoas.gerenciar'));

db.close();
try{ fs.rmSync(dir, { recursive:true, force:true }); }catch(e){}
console.log('');
if(falhas){ console.log(falhas + ' de ' + n + ' casos FALHARAM'); process.exit(1); }
console.log('todos os ' + n + ' casos passaram');

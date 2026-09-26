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
/* O app de mentira tem PILHA DE ROTAS como a do Express (17/09/2026, dívida
   16): a cobertura deixou de ler uma lista escrita à mão e passou a varrer o
   que o app registrou. Sem a pilha aqui, o teste não alcançaria a varredura —
   que é justamente a peça nova. */
const pilha = [];
const registra = (metodo,p,h) => {
  rotas[metodo+' '+p] = h;
  pilha.push({ route:{ path:p, methods:{ [metodo.toLowerCase()]:true } } });
};
const app = { locals:{}, router:{ stack:pilha },
  get(p,h){ registra('GET',p,h); }, post(p,h){ registra('POST',p,h); },
  delete(p,h){ registra('DELETE',p,h); } };
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
/* O card das caixas de varias persianas carrega comprador e NF — dado de
   cliente, como os impressos. Nao pode cair no '@logado'. */
eq('o card das caixas de varias persianas e da bancada da etiqueta',
  AC.permDaRota('/api/pendentes/varias', 'GET'), 'etiqueta.emitir');
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
/* ⚠️ ISTO AQUI CONFERIA UMA LISTA ESCRITA A MAO (`TODAS_ROTAS`), e ela saiu em
   17/09/2026 (divida 16): eram 49 linhas digitadas para 151 rotas reais, e o
   contador ainda descartava tudo que comecasse com `/api/`. Rota que nao
   estivesse na lista ficava invisivel justamente para quem confere se sobrou
   buraco — e ninguem lembra de editar uma lista ao criar uma rota.
   Hoje a cobertura VARRE o app, entao o teste registra rotas no app de mentira
   e cobra que a varredura as enxergue. */
app.post('/api/pacote/resolver', () => {});
app.post('/api/lote/conferir', () => {});
app.post('/api/kit/etiqueta/imprimir', () => {});
app.post('/api/rota/que/ninguem/declarou', () => {});
const varredura = AC.coberturaDeRotas();
const achou = (m,r) => varredura.linhas.some(l => l.metodo === m && l.rota === r);
['/api/pacote/resolver','/api/lote/conferir','/api/kit/etiqueta/imprimir']
  .forEach(r => ok('a varredura enxerga ' + r, achou('POST', r)));
const declarada = (r) => (varredura.linhas.find(l => l.rota === r) || {}).permissao;
eq('e com a permissao certa (o bipe das pecas e da bancada)',
  declarada('/api/lote/conferir'), 'etiqueta.emitir');
eq('imprimir a etiqueta do kit tem chave propria',
  declarada('/api/kit/etiqueta/imprimir'), 'kit.imprimir');
/* E a rota inventada aparece na conta das NAO DECLARADAS — que e o aviso que
   o boot grita. A lista antiga nao tinha como acusar isso: o que nao estava
   nela simplesmente nao existia para o relatorio. */
ok('a rota sem declaracao entra na conta', varredura.nao_declaradas >= 1);
ok('e ela e nomeada, para alguem poder declarar',
  varredura.lista_nao_declaradas.some(x => x.indexOf('/api/rota/que/ninguem/declarou') >= 0),
  JSON.stringify(varredura.lista_nao_declaradas));

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

console.log('\n── 6-B. vender sob medida e uma area PROPRIA, e ela nao pode ser admin ──');
/* Fase 2 da SOBMEDIDA-PEDIDO-REVENDA. Ate aqui o vendedor entrava pela area
   "Sob medida / Cadastros" — a da CHEFIA, que abre cadastro de tecido,
   parametros do encaixe e descarte de sobra. A area nova existe para ele
   parar de precisar daquela.

   ⚠️ E O NIVEL DELA E `operacao`, NAO `admin`, e isso nao e classificacao —
   e trava. `sincronizarAreas` poe a area 'admin' em quem tem QUALQUER chave
   de nivel admin, e o portao do sob medida (tecido/nucleo/acesso.js) le
   'admin' como DIRETOR. Declarada como admin, esta chave devolveria ao
   vendedor exatamente o modulo inteiro que ela veio tirar dele — sem
   ninguem pedir, e sem erro em tela nenhuma. */
const chaveVender = P.find(p => p.chave === 'sobmedida.vender');
ok('a chave sobmedida.vender esta declarada em permissoes.js', !!chaveVender);
if(chaveVender)
  eq('e o nivel dela e operacao — admin faria o vendedor virar diretor no sob medida',
    chaveVender.nivel, 'operacao');
ok('o setor "Sob medida / Venda" foi semeado',
  !!db.prepare("SELECT 1 FROM setores WHERE nome='Sob medida / Venda'").get());
const permsVenda = db.prepare(`SELECT sp.chave FROM setores s
  JOIN setor_permissao sp ON sp.setor_id=s.id WHERE s.nome='Sob medida / Venda'`)
  .all().map(r => r.chave);
eq('e ele nasce SO com a chave de vender — o vendedor nao corta',
  permsVenda.sort().join(','), 'sobmedida.vender');
/* A terceira ponta: a area tem que voltar para `usuarios.areas`, que e o que
   o portao do modulo le. A linha do PERM_AREA e conferida por texto no teste
   do proprio modulo (tecido/teste/acesso.test.js); aqui se confere o que
   decide se a area 'admin' vem junto — que e o que faria o vendedor entrar
   como DIRETOR. */
const uVend = db.prepare("INSERT INTO usuarios (nome,pin_hash,salt,areas,ativo) VALUES ('Vendedor teste','x','y','',1)")
  .run().lastInsertRowid;
const sVenda = db.prepare("SELECT id FROM setores WHERE nome='Sob medida / Venda'").get().id;
db.prepare('INSERT INTO usuario_setor (usuario_id,setor_id) VALUES (?,?)').run(uVend, sVenda);
const permsVend = AC.permissoesDe(uVend);
ok('quem esta no setor de venda ganha sobmedida.vender', permsVend.has('sobmedida.vender'));
const infoDe = c => P.find(x => x.chave === c);
const admDoVendedor = [...permsVend].filter(c => { const i = infoDe(c); return i && (i.nivel === 'admin' || i.nivel === 'admin_geral'); });
eq('e NENHUMA das permissoes dele e de nivel admin — e isso que mantem a area "admin" fora',
  admDoVendedor.join(', '), '', 'admin-level: ' + (admDoVendedor.join(', ') || '(nenhuma)'));
ok('ele nao corta nem cadastra tecido',
  !permsVend.has('sobmedida.cortar') && !permsVend.has('sobmedida.cadastrar'));
/* E o papel que sai disso, pelo tradutor do proprio modulo — a conta que o
   portao faz de verdade, e nao uma releitura dela aqui. */
const acessoSM = require('./tecido/nucleo/acesso');
eq('o modulo traduz essa area em "vendedor"',
  acessoSM.papelDe({ areas: ['sobmedida_venda'] }), 'vendedor');
eq('...e "admin" continuaria valendo diretor, que e o motivo da trava acima',
  acessoSM.papelDe({ areas: ['admin'] }), 'diretor');

console.log('\n── 6-C. os CINCO SETORES DE PRODUCAO do sob medida (fase 5-A) ──');
/* Decisao do dono, 24/09/2026: "tem que ser possivel a gente criar cada setor
   no controle de acesso, e quem tem acesso pega o tablet de manha e ve o que
   tem para fazer". Ate aqui o modulo traduzia area em UM papel, e "quais
   setores esta pessoa bipa" nao era pergunta que o sistema soubesse responder.

   ⚠️ SAO CINCO CHAVES, UMA POR SETOR, e nao uma chave so de "producao". Uma
   chave unica deixaria o serralheiro bipar a embalagem, e o bipe e o que
   grava QUEM fez a peca — na fase 5-B e por ele que a recusa acha a pessoa
   certa. Uma regua que aponta a pessoa errada e pior que nenhuma. */
const SETORES_SM = [
  ['serralheria','Sob medida / Serralheria','sobmedida_serralheria'],
  ['colecao',    'Sob medida / Coleção',    'sobmedida_colecao'],
  ['montagem',   'Sob medida / Montagem',   'sobmedida_montagem'],
  ['revisao',    'Sob medida / Revisão',    'sobmedida_revisao'],
  ['embalagem',  'Sob medida / Embalagem',  'sobmedida_embalagem']
];

for(const [chaveCurta, nomeSetor] of SETORES_SM){
  const chave = 'sobmedida.' + chaveCurta;
  const info = P.find(p => p.chave === chave);
  ok('a chave ' + chave + ' esta declarada em permissoes.js', !!info);
  /* ⚠️ O NIVEL E `operacao`, e pela MESMA razao da sobmedida.vender logo
     acima: `sincronizarAreas` poe a area 'admin' em quem tem qualquer chave
     de nivel admin, e o portao do modulo le 'admin' como DIRETOR. Um setor
     declarado como admin entregaria o modulo inteiro a quem so embala. */
  if(info) eq('  e o nivel dela e operacao — admin faria o operador virar diretor',
    info.nivel, 'operacao');
  ok('o setor "' + nomeSetor + '" foi semeado',
    !!db.prepare('SELECT 1 FROM setores WHERE nome=?').get(nomeSetor));
  const perms = db.prepare(`SELECT sp.chave FROM setores s
    JOIN setor_permissao sp ON sp.setor_id=s.id WHERE s.nome=?`).all(nomeSetor).map(r => r.chave);
  /* Nasce SO com a chave do proprio setor. Quem embala nao corta tecido, nao
     cadastra e nao vende — e a mesma regra dos tres setores de sob medida
     que ja existiam, que nascem vazios de gente e estreitos de chave. */
  eq('  e ele nasce SO com a chave do proprio setor',
    perms.sort().join(','), chave);
  eq('  e NINGUEM foi migrado para ele — setor de sob medida nasce vazio',
    db.prepare(`SELECT COUNT(*) c FROM usuario_setor us
      JOIN setores s ON s.id=us.setor_id WHERE s.nome=?`).get(nomeSetor).c, 0);
}

/* A TERCEIRA PONTA: a area tem que voltar para `usuarios.areas`, que e o que
   o portao do modulo le. Sem a linha no PERM_AREA o acesso e concedido na
   tela e SOME SOZINHO no primeiro salvamento seguinte (armadilha #13). */
const uEmb = db.prepare("INSERT INTO usuarios (nome,pin_hash,salt,areas,ativo) VALUES ('Embalador teste','x','y','',1)")
  .run().lastInsertRowid;
const sEmb = db.prepare("SELECT id FROM setores WHERE nome='Sob medida / Embalagem'").get();
if(sEmb){
  db.prepare('INSERT INTO usuario_setor (usuario_id,setor_id) VALUES (?,?)').run(uEmb, sEmb.id);
  const permsEmb = AC.permissoesDe(uEmb);
  ok('quem esta no setor de embalagem ganha sobmedida.embalagem',
    permsEmb.has('sobmedida.embalagem'));
  ok('e NAO ganha os outros quatro setores',
    !permsEmb.has('sobmedida.serralheria') && !permsEmb.has('sobmedida.colecao') &&
    !permsEmb.has('sobmedida.montagem') && !permsEmb.has('sobmedida.revisao'));
  ok('nem corta tecido, nem cadastra, nem vende',
    !permsEmb.has('sobmedida.cortar') && !permsEmb.has('sobmedida.cadastrar') &&
    !permsEmb.has('sobmedida.vender'));
  const admDoEmb = [...permsEmb].filter(c => { const i = P.find(x => x.chave === c); return i && (i.nivel === 'admin' || i.nivel === 'admin_geral'); });
  eq('e NENHUMA permissao dele e de nivel admin — e isso que mantem a area "admin" fora',
    admDoEmb.join(', '), '');
  /* A area de verdade, depois do sincronizarAreas — este e o texto que o
     portao do modulo vai ler. */
  /* ⚠️ Pergunta ao codigo que GRAVA, em vez de refazer a conta aqui. Um teste
     que remonta `usuarios.areas` pela propria leitura concordaria com o
     defeito — e a licao do QR (§4): ele perguntaria a si mesmo. */
  ok('o acesso.js expoe o sincronizarAreas para dar para conferir a 3a ponta',
    typeof AC.sincronizarAreas === 'function');
  if(typeof AC.sincronizarAreas === 'function') AC.sincronizarAreas(uEmb);
  const areasEmb = (db.prepare('SELECT areas FROM usuarios WHERE id=?').get(uEmb).areas || '').split(',').filter(Boolean);
  ok('a area sobmedida_embalagem chega em usuarios.areas (a linha do PERM_AREA)',
    areasEmb.includes('sobmedida_embalagem'),
    'areas: ' + (areasEmb.join(',') || '(vazio)'));
  ok('e a area "admin" NAO vem junto', !areasEmb.includes('admin'));
}

/* E O QUE O MODULO FAZ COM ISSO — a conta de verdade, feita pelo tradutor
   dele, e nao uma releitura dela aqui. */
const acessoProd = require('./tecido/nucleo/acesso');
eq('o modulo traduz area de setor em papel "producao"',
  acessoProd.papelDe({ areas: ['sobmedida_embalagem'] }), 'producao');
/* ⚠️ Funcao que ainda nao existe tem que dar VERMELHO, nunca derrubar a
   rodada: suite que morre no meio faz o defeito aparecer como "travou" em vez
   de falhar, e os casos de baixo nunca rodam. E a licao do teste_componentes
   de hoje de manha, um andar acima. */
ok('o modulo sabe responder QUAIS setores a pessoa bipa (setoresDe)',
  typeof acessoProd.setoresDe === 'function');
const setoresDe = a => { try{ return (acessoProd.setoresDe({areas:a})||[]); }catch(e){ return ['(estourou: '+e.message+')']; } };
eq('quem so embala bipa UM setor',
  setoresDe(['sobmedida_embalagem']).join(','), 'embalagem');
eq('quem tem dois setores bipa os dois, na ordem da fabrica',
  setoresDe(['sobmedida_embalagem','sobmedida_serralheria']).join(','),
  'serralheria,embalagem');
eq('quem nao tem setor nenhum nao bipa nada',
  setoresDe(['sobmedida_venda']).length, 0);
/* ⚠️ O SETOR NAO DEPENDE DO PAPEL, e e isso que faz o vendedor que tambem
   embala continuar embalando. O papel sai da area MAIS LARGA (uma so), os
   setores saem de TODAS as areas de setor — sao duas contas diferentes, e
   juntar as duas faria a pessoa perder a bancada ao ganhar a carteira. */
eq('quem vende E embala tem o papel mais largo...',
  acessoProd.papelDe({ areas: ['sobmedida_venda','sobmedida_embalagem'] }), 'vendedor');
eq('...e continua bipando a embalagem do mesmo jeito',
  setoresDe(['sobmedida_venda','sobmedida_embalagem']).join(','), 'embalagem');
/* O diretor bipa todos, por coerencia com o `*` das chaves dele: recusar o
   dono numa bancada seria trava disparando no caso normal (armadilha #6). */
eq('o diretor bipa os cinco',
  setoresDe(['admin']).length, 5);

console.log('\n── 6-D. cadastrar sob medida e CHEFIA DO MODULO, nao admin do PCP ──');
/* 24/09/2026. `sobmedida.cadastrar` era declarada `nivel:'admin'`, e isso
   dizia duas coisas que ninguem pediu:

     sincronizarAreas  -> area 'admin' em quem tem QUALQUER chave admin
     temAdmin(perms)   -> as 24 rotas '@admin' do PCP liberam pela mesma regua

   Entao a chave que devia dizer "mexe no cadastro do sob medida" dizia, de
   fato, "e admin do PCP". E o espelho exato da trava que a fase 2 pos na
   `sobmedida.vender` (secao 6-B) — la a chave de VENDER daria o modulo
   inteiro; aqui a chave do modulo da um pedaco do PCP.

   ⚠️ O QUE ISTO NAO MUDA: dentro do modulo a chefia JA E diretor — o
   `papelDe` devolve 'diretor' para 'admin' e para AREA_CHEFIA, e nunca
   houve papel "chefia" separado. O que sai e o PCP, e so ele. Esta escrito
   porque e exatamente onde alguem le a intencao errada depois. */
const chaveCad = P.find(p => p.chave === 'sobmedida.cadastrar');
ok('a chave sobmedida.cadastrar esta declarada', !!chaveCad);
if(chaveCad)
  eq('e o nivel dela e supervisor — admin a faria valer como admin do PCP inteiro',
    chaveCad.nivel, 'supervisor');

/* A PROVA DE VERDADE nao e o rotulo: e o que chega em usuarios.areas depois
   do sincronizarAreas, que e o texto que o portao do modulo le. Pergunto ao
   codigo que GRAVA, nunca refazendo a conta aqui (a licao do QR, §4). */
const uCad = db.prepare("INSERT INTO usuarios (nome,pin_hash,salt,areas,ativo) VALUES ('Chefia sob medida','x','y','',1)")
  .run().lastInsertRowid;
const sCad = db.prepare("SELECT id,nivel FROM setores WHERE nome='Sob medida / Cadastros'").get();
ok('o setor "Sob medida / Cadastros" existe', !!sCad);
if(sCad){
  /* ⚠️ O NIVEL DO SETOR TEM QUE CABER A CHAVE. A guarda da rota de salvar
     recusa permissao acima do nivel do setor, e a TELA nem desenha a
     caixinha — foi por isso que, em producao, a chave nao dava para marcar.
     Declarar o setor como `admin` e a chave como `supervisor` deixaria a
     declaracao mentindo sobre o proprio par. */
  eq('  e o nivel dele e supervisor, igual ao da chave que ele carrega',
    sCad.nivel, 'supervisor');
  const permsCad = db.prepare(`SELECT sp.chave FROM setores s
    JOIN setor_permissao sp ON sp.setor_id=s.id WHERE s.nome='Sob medida / Cadastros'`)
    .all().map(r => r.chave).sort();
  eq('  e ele carrega as duas chaves declaradas',
    permsCad.join(','), 'sobmedida.cadastrar,sobmedida.cortar');

  db.prepare('INSERT INTO usuario_setor (usuario_id,setor_id) VALUES (?,?)').run(uCad, sCad.id);
  const pc = AC.permissoesDe(uCad);
  ok('quem esta nele ganha sobmedida.cadastrar', pc.has('sobmedida.cadastrar'));
  const admDoCad = [...pc].filter(c => { const i = P.find(x => x.chave === c); return i && (i.nivel === 'admin' || i.nivel === 'admin_geral'); });
  eq('e NENHUMA das permissoes dele e de nivel admin — e isso que segura a area "admin" fora',
    admDoCad.join(', '), '');

  if(typeof AC.sincronizarAreas === 'function') AC.sincronizarAreas(uCad);
  const areasCad = (db.prepare('SELECT areas FROM usuarios WHERE id=?').get(uCad).areas || '').split(',').filter(Boolean);
  ok('a area sobmedida_adm chega em usuarios.areas (a linha do PERM_AREA continua de pe)',
    areasCad.includes('sobmedida_adm'),
    'areas: ' + (areasCad.join(',') || '(vazio)'));
  ok('e a area "admin" do PCP NAO vem junto — e este e o caso que a mudanca existe para travar',
    !areasCad.includes('admin'),
    'areas: ' + (areasCad.join(',') || '(vazio)'));

  /* As 24 rotas '@admin' liberam por temAdmin(perms). Sem chave admin, a
     chefia do sob medida para de passar nelas — que e o ponto. */
  ok('a chefia do sob medida NAO passa numa rota @admin do PCP',
    AC.decidir({ id:uCad, nome:'Chefia sob medida' }, '/api/divergencias', 'GET').ok === false);
}

/* E O QUE O MODULO FAZ COM ISSO — pelo tradutor dele, nao por uma releitura
   aqui. A chefia continua entrando como diretor: e o que a area sempre
   significou, e nao e isso que esta sendo mexido. */
eq('o modulo continua lendo sobmedida_adm como diretor',
  acessoProd.papelDe({ areas: ['sobmedida_adm'] }), 'diretor');
eq('e quem nao tem area nenhuma continua sem entrar',
  acessoProd.papelDe({ areas: [] }), null);

/* ⚠️ O SETOR NATIVO `Admin` DEIXA DE CARREGAR A CHAVE, e isso e DECISAO, nao
   efeito colateral. A lista de permissoes dele e calculada — "toda chave de
   nivel admin" (acesso.js, linha 38) —, entao baixar o nivel a tira de la na
   instalacao limpa. Em producao nada muda (ninguem a tinha), e o lugar dela
   passa a ser o setor dedicado. Esta afirmado aqui para nunca voltar por
   acidente no dia em que alguem reler a lista calculada. */
const permsAdmin = db.prepare(`SELECT sp.chave FROM setores s
  JOIN setor_permissao sp ON sp.setor_id=s.id WHERE s.nome='Admin'`).all().map(r => r.chave);
ok('o setor nativo Admin existe', permsAdmin.length > 0);
ok('e ele NAO carrega mais sobmedida.cadastrar — quem cadastra sob medida e o setor dedicado',
  permsAdmin.indexOf('sobmedida.cadastrar') < 0,
  'chaves admin: ' + permsAdmin.filter(c => c.indexOf('sobmedida') === 0).join(',' ));

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

/* ═══════════ ROTA SEM PERMISSÃO NASCE NEGADA (dívida 16) ═══════════════════
   O `permDaRota` terminava em `return '@logado'`: rota nova nascia aberta para
   qualquer pessoa logada, sem aparecer em lugar nenhum. A cobertura não
   acusava porque era uma lista escrita à mão que ainda descartava tudo que
   começa com `/api/` — o boot imprimia "cobertura OK (0 sem declarar)", que é
   um verde que ninguém conferiu. */
console.log('\n── 11. o padrao passou a ser NEGAR ──');
eq('rota que ninguem declarou → @negado', AC.permDaRota('/api/inventada/ontem','GET'), '@negado');
eq('e no POST tambem', AC.permDaRota('/api/inventada','POST'), '@negado');
const adminComum = db.prepare("INSERT INTO usuarios (nome,areas) VALUES ('Admin Comum','')").run().lastInsertRowid;
db.prepare("INSERT INTO usuario_setor (usuario_id,setor_id) VALUES (?,(SELECT id FROM setores WHERE nome='Admin'))").run(adminComum);
const AD = { id:adminComum, nome:'Admin Comum' };
ok('nem um Admin passa numa rota nao declarada', AC.decidir(AD,'/api/inventada','GET').ok === false);
eq('e o motivo diz o que houve', AC.decidir(AD,'/api/inventada','GET').motivo, 'rota_nao_declarada');
/* O Admin Geral passa por NÍVEL, antes da chave — e isso é proposital: uma
   rota que alguém esqueceu de declarar não pode trancar o dono fora do próprio
   sistema. Ele é quem vai ver o aviso no boot e mandar declarar. */
ok('mas o Admin Geral continua passando (ninguem se tranca fora)',
  AC.decidir(AG,'/api/inventada','GET').ok === true);

console.log('\n── 12. o ARQUIVO da tela nao e a tela ──');
/* ⚠️ O QUE QUASE DERRUBOU TUDO: com sessão aberta, `/sku.js`, `/base.css` e as
   imagens passam pelo `decidir` como qualquer caminho — só `/nav.js`,
   `/favicon.ico`, `/login` e `/login.html` estão na lista LIVRE do auth.js.
   Negar por padrão sem esta regra tiraria o JavaScript de TODAS as telas: elas
   abririam em branco, com 403 no console, para todo mundo menos o Admin Geral. */
for(const a of ['/sku.js','/barras.js','/kit_bipe.js','/qr.js','/base.css','/favicon.png','/img/logo.svg'])
  eq('arquivo de apoio continua @logado: '+a, AC.permDaRota(a,'GET'), '@logado');
eq('mas .html NAO e arquivo de apoio — herda a tela', AC.permDaRota('/operador.html','GET'), 'revisao.executar');

console.log('\n── 13. a gemea .html vale o mesmo que a tela ──');
const GEMEAS = [['/operador','revisao.executar'],['/montagem','embalagem.executar'],
  ['/embalagem','etiqueta.emitir'],['/carregamento','carregamento.executar'],
  ['/expedicao','pdf.subir'],['/devolucao','devolucao.registrar'],
  ['/painel','painel.ver'],['/relatorios','relatorios.ver'],
  ['/planejamento','planilha.importar'],['/recebimento','pedido.receber']];
let gemeasOk = 0;
for(const [rota,chave] of GEMEAS){
  if(AC.permDaRota(rota,'GET') === chave && AC.permDaRota(rota+'.html','GET') === chave) gemeasOk++;
  else console.log('       ' + rota + ': rota=' + AC.permDaRota(rota,'GET') + ' gemea=' + AC.permDaRota(rota+'.html','GET'));
}
eq('as 10 telas e as 10 gemeas pedem a MESMA chave', gemeasOk, GEMEAS.length);
eq('/index.html continua sendo o admin', AC.permDaRota('/index.html','GET'), '@admin');
eq('a escolha de setor e de qualquer sessao', AC.permDaRota('/setor','GET'), '@logado');
eq('e a gemea dela tambem', AC.permDaRota('/setor.html','GET'), '@logado');

console.log('\n── 14. as leituras ganharam dono, e o dono e uma LISTA ──');
/* Uma chave só não descreve quem lê: `/api/lote` é lido pela Etiqueta de Venda,
   pela tela de Lançar produção E pelo admin. Declarar uma delas trancaria as
   outras duas — e como as chaves de operação são de nível `operacao`, o setor
   Admin NÃO as tem: declarar por chave de tela tiraria a leitura do próprio
   Admin. Por isso a declaração aceita QUALQUER UMA das chaves da lista. */
const naLista = (r,m) => { const x = AC.permDaRota(r,m||'GET'); return Array.isArray(x) ? x : [x]; };
ok('/api/lote aceita quem sobe PDF, quem imprime e o admin',
  ['pdf.subir','etiqueta.emitir','@admin'].every(c => naLista('/api/lote').indexOf(c) >= 0),
  JSON.stringify(naLista('/api/lote')));
ok('o operador de expedicao le /api/lote', AC.decidir(u2,'/api/lote','GET').ok === true);
ok('o Admin tambem le /api/lote', AC.decidir(AD,'/api/lote','GET').ok === true);
ok('a bancada da embalagem le a fila', AC.decidir(
  { id:db.prepare("SELECT id FROM usuarios WHERE nome='Bancada'").get().id }, '/api/lote','GET').ok === true);
/* E quem nao tem nenhuma das chaves continua de fora — senao a lista vira
   @logado com mais passos. */
const soRevisao = db.prepare("INSERT INTO usuarios (nome,areas) VALUES ('So Revisao','')").run().lastInsertRowid;
db.prepare("INSERT INTO usuario_setor (usuario_id,setor_id) VALUES (?,(SELECT id FROM setores WHERE nome='Operador / Revisão'))").run(soRevisao);
const REV = { id:soRevisao, nome:'So Revisao' };
ok('quem so revisa NAO le a lista de lote', AC.decidir(REV,'/api/lote','GET').ok === false);
ok('...mas le a propria tela vermelha', AC.decidir(REV,'/api/revisao/dia','GET').ok === true);
ok('e nao abre o carregamento', AC.decidir(REV,'/api/carregamento','GET').ok === false);
ok('o carregamento e de quem carrega', AC.decidir(u2,'/api/carregamento','GET').ok === true);
/* A FOTO DA COLETA e prova (§8-B) e estava legivel por qualquer pessoa logada. */
ok('a foto da coleta virou de quem carrega', AC.decidir(u2,'/api/coleta/foto/12','GET').ok === true);
ok('e nao de qualquer pessoa logada', AC.decidir(REV,'/api/coleta/foto/12','GET').ok === false);

console.log('\n── 15. as listas de apoio de tela continuam abertas a quem entrou ──');
for(const r of ['/api/skus','/api/cores','/api/modelos','/api/tecidos','/api/listas/rejeicao',
                '/api/config/kit','/api/config/kit/etiqueta','/api/config/horarios','/api/config/conferencia'])
  eq('apoio de tela: '+r, AC.permDaRota(r,'GET'), '@logado');
/* O login nao pode depender do modelo de acesso: ele acontece ANTES de existir
   sessao. O auth.js ja o trata na lista LIVRE, e aqui ele fica declarado para
   a varredura nao acusar o que nao e problema. */
eq('/login continua aberto', AC.permDaRota('/login','GET'), '@logado');
eq('o healthcheck tambem', AC.permDaRota('/status','GET'), '@logado');

console.log('\n── 6-E. saida.liberar: liberar o caminhão com número diferente (fase 3 da saída) ──');
{
  /* Spec SAIDA-E-DUPLA-CONFERENCIA, decisão 7: liberar a saída divergente é
     só de supervisor e admin. As três pontas, e a quarta que a #34 ensinou:
     o NÍVEL da chave, porque nível admin viraria "é admin do PCP". */
  const ch = PERMISSOES.find(p => p.chave === 'saida.liberar');
  ok('saida.liberar está declarada em permissoes.js', !!ch);
  if(ch){
    eq('nível supervisor — admin viraria admin do PCP inteiro (#34)', ch.nivel, 'supervisor');
    ok('marcada como sensível: é a decisão que precisa ter nome', ch.sensivel === true);
    ok('tem rótulo e descrição', !!ch.rotulo && !!ch.desc);
  }
  eq('liberar a saída pede a chave própria', AC.permDaRota('/api/saida/liberar','POST'), 'saida.liberar');
  for(const r of ['/api/saida/abrir','/api/saida/sobra','/api/saida/sobra/tirar','/api/saida/nada',
                  '/api/saida/levou','/api/saida/levou/tirar','/api/saida/fechar','/api/saida/cancelar'])
    eq('a bancada do carregamento opera a saída: POST '+r, AC.permDaRota(r,'POST'), 'carregamento.executar');
  eq('ler a saída aberta: a bancada ou o admin',
     JSON.stringify(AC.permDaRota('/api/saida/aberta','GET')), JSON.stringify(['carregamento.executar','@admin']));
  eq('a foto da saída é prova, com o mesmo dono',
     JSON.stringify(AC.permDaRota('/api/saida/foto/7','GET')), JSON.stringify(['carregamento.executar','@admin']));

  const comChave = db.prepare(`SELECT s.nome FROM setores s JOIN setor_permissao sp ON sp.setor_id=s.id
    WHERE sp.chave='saida.liberar' ORDER BY s.nome`).all().map(r => r.nome);
  ok('o setor Supervisor recebe a chave', comChave.includes('Supervisor'), comChave.join(', '));
  ok('o setor Admin recebe a chave', comChave.includes('Admin'), comChave.join(', '));
  ok('a bancada de expedição NÃO recebe', !comChave.includes('Operador / Expedição'));
  ok('a chefia do sob medida e as Compras NÃO recebem (nível alto não é ser da expedição)',
     !comChave.includes('Sob medida / Cadastros') && !comChave.includes('Comprador') && !comChave.includes('Financeiro'),
     comChave.join(', '));
  ok('o backfill ficou marcado para rodar uma vez só',
     !!db.prepare("SELECT 1 FROM config WHERE chave='seed_saida_liberar'").get());

  const us = db.prepare("INSERT INTO usuarios (nome,areas) VALUES ('Sup','')").run().lastInsertRowid;
  db.prepare("INSERT INTO usuario_setor (usuario_id,setor_id) VALUES (?,?)")
    .run(us, db.prepare("SELECT id FROM setores WHERE nome='Supervisor'").get().id);
  const sup = { id:us, nome:'Sup' }, banc = { id:uo, nome:'Bancada' }, ger = { id:ug, nome:'Geral' };
  ok('decidir(): a bancada FECHA a saída que bateu', AC.decidir(banc,'/api/saida/fechar','POST').ok === true);
  ok('decidir(): a bancada NÃO libera a divergente', AC.decidir(banc,'/api/saida/liberar','POST').ok === false);
  ok('decidir(): o supervisor libera', AC.decidir(sup,'/api/saida/liberar','POST').ok === true);
  ok('decidir(): o Admin Geral libera', AC.decidir(ger,'/api/saida/liberar','POST').ok === true);
  /* A viagem à agência (fase 4) usa a mesma chave para liberar. */
  eq('liberar a viagem pede a mesma chave', AC.permDaRota('/api/viagem/liberar','POST'), 'saida.liberar');
  for(const r of ['/api/viagem/abrir','/api/viagem/carro','/api/viagem/tirar','/api/viagem/fechar','/api/viagem/cancelar'])
    eq('a bancada opera a viagem: POST '+r, AC.permDaRota(r,'POST'), 'carregamento.executar');
  eq('ler a viagem aberta: a bancada ou o admin',
     JSON.stringify(AC.permDaRota('/api/viagem/aberta','GET')), JSON.stringify(['carregamento.executar','@admin']));
  ok('decidir(): a bancada fecha a viagem que bateu', AC.decidir(banc,'/api/viagem/fechar','POST').ok === true);
  ok('decidir(): a bancada NÃO libera a viagem divergente', AC.decidir(banc,'/api/viagem/liberar','POST').ok === false);
  ok('decidir(): o supervisor libera a viagem', AC.decidir(sup,'/api/viagem/liberar','POST').ok === true);
  ok('a chave não faz do supervisor um admin do PCP (#34)', AC.decidir(sup,'/api/bloqueados','GET').ok === false);

  /* Quem desmarcar a caixinha não a vê voltar no próximo boot. */
  const idSup = db.prepare("SELECT id FROM setores WHERE nome='Supervisor'").get().id;
  db.prepare("DELETE FROM setor_permissao WHERE setor_id=? AND chave='saida.liberar'").run(idSup);
  const app2 = { locals:{}, router:{ stack:[] }, get(){}, post(){}, delete(){} };
  require('./acesso')(app2, db);
  ok('desmarcada, a chave não volta no boot seguinte',
     !db.prepare("SELECT 1 FROM setor_permissao WHERE setor_id=? AND chave='saida.liberar'").get(idSup));
}

console.log('\n── 6-F. a conferência em três papéis (fase 2 da ESTOQUE-LIVRO-E-CONFERENCIA) ──');
{
  /* As três pontas de cada chave nova (#13) e a quarta, o NÍVEL (#34): o
     recontar é da bancada e tem que ser `operacao` — se fosse admin, todo
     operador do estoque viraria admin do PCP pelo sincronizarAreas. */
  const nivel = { 'contagem.recontar':'operacao', 'contagem.planejar':'admin', 'contagem.aprovar':'admin' };
  for(const c in nivel){
    const ch = PERMISSOES.find(p => p.chave === c);
    ok(c + ' está declarada em permissoes.js', !!ch);
    if(ch){ eq(c + ' tem nível ' + nivel[c], ch.nivel, nivel[c]); ok(c + ' tem rótulo e descrição', !!ch.rotulo && !!ch.desc); }
  }
  ok('aprovar é sensível: mexe no saldo, e a decisão precisa ter nome',
     (PERMISSOES.find(p => p.chave === 'contagem.aprovar') || {}).sensivel === true);

  eq('a tela /inventario: quem conta OU quem reconta',
     JSON.stringify(AC.permDaRota('/inventario','GET')), JSON.stringify(['contagem.contar','contagem.recontar']));
  eq('a gêmea .html herda a tela',
     JSON.stringify(AC.permDaRota('/inventario.html','GET')), JSON.stringify(['contagem.contar','contagem.recontar']));
  for(const [r,m,c] of [['/api/inventario/sugestao','GET','contagem.planejar'], ['/api/inventario/abrir','POST','contagem.planejar'],
                        ['/api/inventario/encerrar','POST','contagem.planejar'],
                        ['/api/inventario/minha-lista','GET','contagem.contar'], ['/api/inventario/contar','POST','contagem.contar'],
                        ['/api/inventario/recontagem','GET','contagem.recontar'], ['/api/inventario/recontar','POST','contagem.recontar'],
                        ['/api/inventario/aprovacao','GET','contagem.aprovar'], ['/api/inventario/aprovar','POST','contagem.aprovar'],
                        ['/api/inventario/rejeitar','POST','contagem.aprovar']])
    eq(m + ' ' + r + ' pede ' + c, AC.permDaRota(r, m), c);
  eq('terminar serve as duas rodadas',
     JSON.stringify(AC.permDaRota('/api/inventario/terminar-sku','POST')), JSON.stringify(['contagem.contar','contagem.recontar']));

  const perm = nome => db.prepare(`SELECT sp.chave FROM setor_permissao sp JOIN setores s ON s.id=sp.setor_id
    WHERE s.nome=?`).all(nome).map(r => r.chave);
  ok('o setor Operador / Controle de Estoque nasce recontando', perm('Operador / Controle de Estoque').includes('contagem.recontar'));
  ok('   e NÃO aprova nem planeja',
     !perm('Operador / Controle de Estoque').includes('contagem.aprovar') && !perm('Operador / Controle de Estoque').includes('contagem.planejar'));

  /* O BACKFILL, num banco que já existia: um setor que aprovava pelo caminho
     antigo (contagem.ajustar) e um que só contava. Tira a marca, sobe o
     acesso.js de novo, e confere que a chave nova chegou — e só a certa. */
  const sA = db.prepare("INSERT INTO setores (nome,nivel,nativo) VALUES ('Estoque antigo','admin',0)").run().lastInsertRowid;
  const sC = db.prepare("INSERT INTO setores (nome,nivel,nativo) VALUES ('Contagem antiga','operacao',0)").run().lastInsertRowid;
  db.prepare("INSERT INTO setor_permissao (setor_id,chave) VALUES (?, 'contagem.ajustar')").run(sA);
  db.prepare("INSERT INTO setor_permissao (setor_id,chave) VALUES (?, 'contagem.contar')").run(sC);
  const uX = db.prepare("INSERT INTO usuarios (nome,areas) VALUES ('Excecao','')").run().lastInsertRowid;
  db.prepare("INSERT INTO usuario_excecao (usuario_id,chave,concede) VALUES (?,'contagem.ajustar',1)").run(uX);
  db.prepare("DELETE FROM config WHERE chave='seed_inventario'").run();
  const app3 = { locals:{}, router:{ stack:[] }, get(){}, post(){}, delete(){} };
  require('./acesso')(app3, db);
  const tem = (sid, c) => !!db.prepare('SELECT 1 FROM setor_permissao WHERE setor_id=? AND chave=?').get(sid, c);
  ok('backfill: quem tinha contagem.ajustar passa a aprovar', tem(sA, 'contagem.aprovar'));
  ok('backfill: e a planejar', tem(sA, 'contagem.planejar'));
  ok('backfill: quem só contava passa a recontar', tem(sC, 'contagem.recontar'));
  ok('backfill: e NÃO ganha aprovar nem planejar', !tem(sC, 'contagem.aprovar') && !tem(sC, 'contagem.planejar'));
  ok('backfill: a exceção que concedia contagem.ajustar concede aprovar',
     !!db.prepare("SELECT 1 FROM usuario_excecao WHERE usuario_id=? AND chave='contagem.aprovar' AND concede=1").get(uX));
  ok('o backfill ficou marcado para rodar uma vez só', !!db.prepare("SELECT 1 FROM config WHERE chave='seed_inventario'").get());
  db.prepare("DELETE FROM setor_permissao WHERE setor_id=? AND chave='contagem.recontar'").run(sC);
  require('./acesso')({ locals:{}, router:{ stack:[] }, get(){}, post(){}, delete(){} }, db);
  ok('desmarcada, a chave não volta no boot seguinte', !tem(sC, 'contagem.recontar'));

  /* A TERCEIRA PONTA: alguém que só conta e reconta ganha a área da tela, e
     NÃO a área admin. */
  const uC = db.prepare("INSERT INTO usuarios (nome,areas) VALUES ('Conta','')").run().lastInsertRowid;
  db.prepare("INSERT INTO usuario_setor (usuario_id,setor_id) VALUES (?,?)")
    .run(uC, db.prepare("SELECT id FROM setores WHERE nome='Operador / Controle de Estoque'").get().id);
  AC.sincronizarAreas(uC);
  const areasC = (db.prepare('SELECT areas FROM usuarios WHERE id=?').get(uC).areas || '').split(',').filter(Boolean);
  ok('quem conta ganha a área "inventario" (a tela fica na lista protegida)', areasC.includes('inventario'), areasC.join(','));
  eq('   uma vez só, mesmo com duas chaves levando a ela', areasC.filter(a => a === 'inventario').length, 1);
  ok('   e NÃO a área admin', !areasC.includes('admin'), areasC.join(','));
  ok('decidir(): quem conta abre a tela', AC.decidir({id:uC, nome:'Conta'}, '/inventario', 'GET').ok === true);
  ok('decidir(): quem conta NÃO aprova', AC.decidir({id:uC, nome:'Conta'}, '/api/inventario/aprovar', 'POST').ok === false);
  ok('decidir(): quem conta NÃO abre a conferência', AC.decidir({id:uC, nome:'Conta'}, '/api/inventario/abrir', 'POST').ok === false);
}

console.log('\n── 16. a cobertura passou a VARRER o app ──');
const cob = AC.coberturaDeRotas ? AC.coberturaDeRotas() : null;
ok('existe a varredura das rotas registradas', !!cob, 'coberturaDeRotas() nao existe');
if(cob){
  ok('ela devolve linhas com metodo, rota e permissao',
    Array.isArray(cob.linhas) && cob.linhas.length > 0 && 'permissao' in cob.linhas[0]);
  ok('e conta as NEGADAS, que sao as nao declaradas', typeof cob.nao_declaradas === 'number');
  /* A lista manual TODAS_ROTAS saiu: ela tinha 49 linhas para 151 rotas reais,
     e o contador ignorava tudo que comecasse com /api/ — por construcao nenhuma
     API sem dono aparecia. */
  ok('a varredura nao ignora /api/',
    cob.linhas.some(l => l.rota.indexOf('/api/') === 0), 'nenhuma rota /api/ na varredura');
}

db.close();
try{ fs.rmSync(dir, { recursive:true, force:true }); }catch(e){}
console.log('');
if(falhas){ console.log(falhas + ' de ' + n + ' casos FALHARAM'); process.exit(1); }
console.log('todos os ' + n + ' casos passaram');
/* Sai agora: o aviso de cobertura do boot roda num setImmediate, e sem isto ele
   imprimiria DEPOIS do resultado — o CI mostra a ultima linha. */
process.exit(0);

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

console.log('\n── 6-B. o sob medida: setores proprios, e NENHUMA chave admin ──');
/* Desde a fase 2 da ACESSOS-UNIFICADOS (26/10/2026) as chaves do sob medida
   moram nesta lista como `sobmedida.<chave>`, e os setores "Sob medida /"
   nascem com o pacote de cada trabalho. A trava que importa continua a mesma
   desde a fase 2 da SOBMEDIDA-PEDIDO-REVENDA: nenhuma delas e de nivel admin.
   `sincronizarAreas` poe a area 'admin' em quem tem QUALQUER chave admin, e
   as rotas '@admin' do PCP liberam por isso — uma chave do modulo declarada
   admin daria um pedaco do admin do PCP a quem so vende ou corta (#34).
   O "ninguem ganha nem perde nada" da passagem e o teste_acessos_f2.js. */
const acessoSM = require('./tecido/nucleo/acesso');
const SMP = require('./tecido/nucleo/permissoes');
const ehAdm = c => { const i = P.find(x => x.chave === c); return !!i && (i.nivel === 'admin' || i.nivel === 'admin_geral'); };
const doSetor = nome => db.prepare(`SELECT sp.chave FROM setores s
  JOIN setor_permissao sp ON sp.setor_id=s.id WHERE s.nome=?`).all(nome).map(r => r.chave);
eq('nenhuma chave do sob medida e de nivel admin',
  P.filter(p => p.chave.indexOf('sobmedida.') === 0 && ehAdm(p.chave)).map(p => p.chave).join(','), '');
for(const velha of ['sobmedida.cortar','sobmedida.cadastrar','sobmedida.vender'])
  ok(velha + ' saiu da lista (era o tradutor de papel)', !P.find(p => p.chave === velha));

ok('o setor "Sob medida / Venda" foi semeado',
  !!db.prepare("SELECT 1 FROM setores WHERE nome='Sob medida / Venda'").get());
const permsVenda = doSetor('Sob medida / Venda');
ok('e ele nasce com o simulador e a carteira', permsVenda.includes('sobmedida.catalogo.ler') &&
  permsVenda.includes('sobmedida.revenda.ler'));
ok('e SEM o corte — o vendedor nao corta', !permsVenda.includes('sobmedida.plano.confirmar'));
const uVend = db.prepare("INSERT INTO usuarios (nome,pin_hash,salt,areas,ativo) VALUES ('Vendedor teste','x','y','',1)")
  .run().lastInsertRowid;
db.prepare('INSERT INTO usuario_setor (usuario_id,setor_id) VALUES (?,?)')
  .run(uVend, db.prepare("SELECT id FROM setores WHERE nome='Sob medida / Venda'").get().id);
const permsVend = AC.permissoesDe(uVend);
eq('e NENHUMA das permissoes de quem esta nele e de nivel admin',
  [...permsVend].filter(ehAdm).join(', '), '');
/* E o que sai disso, pela conta do proprio modulo — a que o portao faz. */
const vend = acessoSM.daSessaoDoPcp({ id:uVend, nome:'V' }, [...permsVend]);
ok('o modulo deixa ele entrar e simular', !!vend && SMP.pode(vend, 'catalogo.ler'));
ok('...e nao descartar sobra', !!vend && !SMP.pode(vend, 'sobra.descartar'));
eq('...e uma pessoa com chaves so do PCP, nenhuma do modulo, NAO entra (fase 1)',
  acessoSM.daSessaoDoPcp({ id:1, nome:'x' }, ['compras.ver','custo.ver']), null);

console.log('\n── 6-C. os CINCO SETORES DE PRODUCAO do sob medida (fase 5-A) ──');
/* Decisao do dono, 24/09/2026: "tem que ser possivel a gente criar cada setor
   no controle de acesso, e quem tem acesso pega o tablet de manha e ve o que
   tem para fazer". Cinco chaves, UMA POR SETOR: o bipe grava QUEM fez a peca,
   e na fase 5-B e por ele que a recusa acha a pessoa certa. */
const SETORES_SM = [
  ['serralheria','Sob medida / Serralheria'], ['colecao','Sob medida / Coleção'],
  ['montagem','Sob medida / Montagem'], ['revisao','Sob medida / Revisão'],
  ['embalagem','Sob medida / Embalagem']
];
for(const [chaveCurta, nomeSetor] of SETORES_SM){
  const chave = 'sobmedida.' + chaveCurta;
  const info = P.find(p => p.chave === chave);
  ok('a chave ' + chave + ' esta declarada em permissoes.js', !!info);
  if(info) eq('  e o nivel dela e operacao', info.nivel, 'operacao');
  ok('o setor "' + nomeSetor + '" foi semeado',
    !!db.prepare('SELECT 1 FROM setores WHERE nome=?').get(nomeSetor));
  eq('  e ele nasce SO com a chave do proprio setor', doSetor(nomeSetor).sort().join(','), chave);
  eq('  e NINGUEM foi migrado para ele — setor de sob medida nasce vazio',
    db.prepare(`SELECT COUNT(*) c FROM usuario_setor us
      JOIN setores s ON s.id=us.setor_id WHERE s.nome=?`).get(nomeSetor).c, 0);
}
const uEmb = db.prepare("INSERT INTO usuarios (nome,pin_hash,salt,areas,ativo) VALUES ('Embalador teste','x','y','',1)")
  .run().lastInsertRowid;
db.prepare('INSERT INTO usuario_setor (usuario_id,setor_id) VALUES (?,?)')
  .run(uEmb, db.prepare("SELECT id FROM setores WHERE nome='Sob medida / Embalagem'").get().id);
const permsEmb = AC.permissoesDe(uEmb);
ok('quem esta no setor de embalagem ganha sobmedida.embalagem', permsEmb.has('sobmedida.embalagem'));
ok('e NAO ganha os outros quatro setores',
  !permsEmb.has('sobmedida.serralheria') && !permsEmb.has('sobmedida.colecao') &&
  !permsEmb.has('sobmedida.montagem') && !permsEmb.has('sobmedida.revisao'));
eq('e NENHUMA permissao dele e de nivel admin', [...permsEmb].filter(ehAdm).join(', '), '');
ok('o acesso.js expoe o sincronizarAreas para dar para conferir a sombra',
  typeof AC.sincronizarAreas === 'function');
if(typeof AC.sincronizarAreas === 'function') AC.sincronizarAreas(uEmb);
const areasEmb = (db.prepare('SELECT areas FROM usuarios WHERE id=?').get(uEmb).areas || '').split(',').filter(Boolean);
ok('a area "sobmedida" chega em usuarios.areas — e o destino depois do PIN',
  areasEmb.includes('sobmedida'), 'areas: ' + (areasEmb.join(',') || '(vazio)'));
ok('e a area "admin" NAO vem junto', !areasEmb.includes('admin'));
/* E o que o modulo faz com isso — pela conta dele, e nao uma releitura aqui. */
const emb = acessoSM.daSessaoDoPcp({ id:uEmb, nome:'E' }, [...permsEmb]);
ok('o modulo deixa ele entrar e bipar', !!emb && SMP.pode(emb, 'producao.bipar'));
eq('...so na embalagem', emb ? emb.setores.join(',') : '(nao entrou)', 'embalagem');
eq('e quem tem dois setores bipa os dois, na ordem da fabrica',
  acessoSM.daSessaoDoPcp({ id:1 }, ['sobmedida.embalagem','sobmedida.serralheria']).setores.join(','),
  'serralheria,embalagem');

console.log('\n── 6-D. a chefia do sob medida e CHEFIA DO MODULO, nao admin do PCP ──');
/* 24/09/2026: a chave da chefia era `nivel:'admin'`, e valia como "e admin do
   PCP" — area 'admin' e as rotas '@admin'. Desde a fase 2 a chefia e o setor
   "Sob medida / Cadastros" com todas as chaves do modulo, e nenhuma delas e
   admin: a trava continua de pe pela mesma conta. */
const uCad = db.prepare("INSERT INTO usuarios (nome,pin_hash,salt,areas,ativo) VALUES ('Chefia sob medida','x','y','',1)")
  .run().lastInsertRowid;
const sCad = db.prepare("SELECT id,nivel FROM setores WHERE nome='Sob medida / Cadastros'").get();
ok('o setor "Sob medida / Cadastros" existe', !!sCad);
if(sCad){
  /* ⚠️ O NIVEL DO SETOR TEM QUE CABER AS CHAVES: a guarda da rota de salvar
     recusa permissao acima do nivel do setor, e a tela nem desenha a caixinha
     (foi assim que a chave sumiu em producao em 19/09/2026). */
  eq('  e o nivel dele e supervisor', sCad.nivel, 'supervisor');
  const permsCad = doSetor('Sob medida / Cadastros');
  ok('  e ele carrega todas as chaves do modulo e as cinco bancadas',
    SMP.CHAVES.every(c => permsCad.includes('sobmedida.' + c.chave)) &&
    SETORES_SM.every(([c]) => permsCad.includes('sobmedida.' + c)));
  const NV = { operacao:1, supervisor:2, admin:3, admin_geral:4 };
  eq('  e nenhuma acima do nivel dele',
    permsCad.filter(c => { const i = P.find(x => x.chave === c); return i && NV[i.nivel] > NV.supervisor; }).join(','), '');
  db.prepare('INSERT INTO usuario_setor (usuario_id,setor_id) VALUES (?,?)').run(uCad, sCad.id);
  const pc = AC.permissoesDe(uCad);
  eq('e NENHUMA das permissoes de quem esta nele e de nivel admin', [...pc].filter(ehAdm).join(', '), '');
  if(typeof AC.sincronizarAreas === 'function') AC.sincronizarAreas(uCad);
  const areasCad = (db.prepare('SELECT areas FROM usuarios WHERE id=?').get(uCad).areas || '').split(',').filter(Boolean);
  ok('a area "sobmedida" chega em usuarios.areas', areasCad.includes('sobmedida'),
    'areas: ' + (areasCad.join(',') || '(vazio)'));
  ok('e a area "admin" do PCP NAO vem junto — e este e o caso que a trava existe para segurar',
    !areasCad.includes('admin'), 'areas: ' + (areasCad.join(',') || '(vazio)'));
  ok('a chefia do sob medida NAO passa numa rota @admin do PCP',
    AC.decidir({ id:uCad, nome:'Chefia sob medida' }, '/api/divergencias', 'GET').ok === false);
  const cad = acessoSM.daSessaoDoPcp({ id:uCad, nome:'C' }, [...pc]);
  ok('e no modulo ela pode tudo, inclusive descartar sobra', !!cad && SMP.pode(cad, 'sobra.descartar'));
  eq('...e bipa as cinco bancadas', cad ? cad.setores.length : 0, 5);
}
const permsAdmin = doSetor('Admin');
ok('o setor nativo Admin existe', permsAdmin.length > 0);
ok('e ele NAO carrega chave nenhuma do sob medida — quem cuida do modulo sao os setores dele',
  !permsAdmin.some(c => c.indexOf('sobmedida.') === 0),
  'chaves: ' + permsAdmin.filter(c => c.indexOf('sobmedida') === 0).join(','));

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
/* custo.ver e SENSIVEL: desde a fase 3 da ACESSOS-UNIFICADOS a sensivel
   nova pede confirmacao (teste_setor_salvar.js); aqui ela vem confirmada. */
r9 = chamar('POST','/api/acesso/setores',{nome:'Conferencia',nivel:'admin',permissoes:['custo.ver'],confirmar:true},{},AG);
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
for(const a of ['/sku.js','/barras.js','/kit_bipe.js','/qr.js','/base.css','/favicon.png','/img/logo.svg',
                '/ipad.css','/icones/embalagem-180.png','/app/embalagem.webmanifest'])
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

console.log('\n── 6-G. o ajuste em duas pessoas (fase 3 da ESTOQUE-LIVRO-E-CONFERENCIA) ──');
{
  ok('estoque.editar saiu do cadastro (aplicava sozinho)', !PERMISSOES.find(p => p.chave === 'estoque.editar'));
  for(const c of ['estoque.ajustar','estoque.aprovar_ajuste']){
    const ch = PERMISSOES.find(p => p.chave === c);
    ok(c + ' está declarada em permissoes.js', !!ch);
    if(ch){ eq(c + ' é nível admin', ch.nivel, 'admin'); ok(c + ' tem rótulo e descrição', !!ch.rotulo && !!ch.desc); }
  }
  ok('aprovar ajuste é sensível', (PERMISSOES.find(p => p.chave === 'estoque.aprovar_ajuste') || {}).sensivel === true);

  eq('POST /api/estoque/ajuste pede estoque.ajustar', AC.permDaRota('/api/estoque/ajuste','POST'), 'estoque.ajustar');
  eq('aprovar pede estoque.aprovar_ajuste', AC.permDaRota('/api/estoque/ajuste/12/aprovar','POST'), 'estoque.aprovar_ajuste');
  eq('recusar: quem pede (desiste) ou quem aprova',
     JSON.stringify(AC.permDaRota('/api/estoque/ajuste/12/recusar','POST')), JSON.stringify(['estoque.ajustar','estoque.aprovar_ajuste']));
  eq('a fila: quem pede ou quem aprova',
     JSON.stringify(AC.permDaRota('/api/estoque/ajuste/pendentes','GET')), JSON.stringify(['estoque.ajustar','estoque.aprovar_ajuste']));
  eq('o POST /api/estoque antigo (que só recusa) fica com a chave de quem pede', AC.permDaRota('/api/estoque','POST'), 'estoque.ajustar');
  eq('o histórico continua @admin', AC.permDaRota('/api/estoque/ajustes','GET'), '@admin');

  /* O BACKFILL, num banco que já existia: um setor que editava estoque direto. */
  const sE = db.prepare("INSERT INTO setores (nome,nivel,nativo) VALUES ('Estoque direto','admin',0)").run().lastInsertRowid;
  db.prepare("INSERT INTO setor_permissao (setor_id,chave) VALUES (?, 'estoque.editar')").run(sE);
  const uE = db.prepare("INSERT INTO usuarios (nome,areas) VALUES ('ExcecaoEstoque','')").run().lastInsertRowid;
  db.prepare("INSERT INTO usuario_excecao (usuario_id,chave,concede) VALUES (?,'estoque.editar',1)").run(uE);
  db.prepare("DELETE FROM config WHERE chave='seed_ajuste_duas'").run();
  require('./acesso')({ locals:{}, router:{ stack:[] }, get(){}, post(){}, delete(){} }, db);
  const tem = (sid, c) => !!db.prepare('SELECT 1 FROM setor_permissao WHERE setor_id=? AND chave=?').get(sid, c);
  ok('backfill: quem editava estoque passa a PEDIR', tem(sE, 'estoque.ajustar'));
  ok('backfill: e a APROVAR (a regra de pessoa é do código)', tem(sE, 'estoque.aprovar_ajuste'));
  ok('backfill: a exceção vai junto',
     !!db.prepare("SELECT 1 FROM usuario_excecao WHERE usuario_id=? AND chave='estoque.aprovar_ajuste' AND concede=1").get(uE));
  ok('marcado para rodar uma vez só', !!db.prepare("SELECT 1 FROM config WHERE chave='seed_ajuste_duas'").get());
  db.prepare("DELETE FROM setor_permissao WHERE setor_id=? AND chave='estoque.aprovar_ajuste'").run(sE);
  require('./acesso')({ locals:{}, router:{ stack:[] }, get(){}, post(){}, delete(){} }, db);
  ok('desmarcada, a chave não volta no boot seguinte', !tem(sE, 'estoque.aprovar_ajuste'));
  ok('o setor Admin nativo nasce com as duas',
     (function(){ const id = db.prepare("SELECT id FROM setores WHERE nome='Admin'").get().id;
       return tem(id,'estoque.ajustar') && tem(id,'estoque.aprovar_ajuste'); })());
}

console.log('\n── 6-H. a area "admin" nao abre o sob medida (fase 1 da ACESSOS-UNIFICADOS) ──');
/* Ate 21/10/2026 quem tinha QUALQUER chave de nivel admin entrava no sob
   medida como DIRETOR: o `sincronizarAreas` grava a area 'admin' e o
   `papelDe` lia essa area como diretor. Os setores Comprador e Financeiro sao
   de nivel admin, entao quem fosse posto la para comprar material ou pagar
   fornecedor lancava boleto, descartava sobra e aprovava correcao de corte.
   Decisao do dono (P1): diretor e so o Admin Geral e o setor
   "Sob medida / Cadastros".
   ⚠️ A prova pergunta ao codigo que GRAVA a area (sincronizarAreas) e ao que
   a LE (papelDe e destino), e nunca remonta a conta aqui. */
{
  const SM = require('./tecido/nucleo/acesso');
  const SMP = require('./tecido/nucleo/permissoes');
  const { destino } = require('./destino');
  const areasDe = id => { AC.sincronizarAreas(id);
    return (db.prepare('SELECT areas FROM usuarios WHERE id=?').get(id).areas || '').split(',').filter(Boolean); };
  /* Desde a fase 2 o portao do modulo pergunta ao PCP as chaves da pessoa
     (permissoesDe), e e essa a conta conferida aqui — a mesma do portao. */
  const noModulo = id => SM.daSessaoDoPcp({ id, nome:'x' }, [...AC.permissoesDe(id)]);
  const noSetor = (nome, setor) => {
    const id = db.prepare("INSERT INTO usuarios (nome,pin_hash,salt,areas,ativo) VALUES (?,'x','y','',1)").run(nome).lastInsertRowid;
    if(setor) db.prepare("INSERT INTO usuario_setor (usuario_id,setor_id) VALUES (?,(SELECT id FROM setores WHERE nome=?))").run(id, setor);
    return id;
  };
  for(const setor of ['Comprador','Financeiro','Admin']){
    const id = noSetor('So ' + setor, setor);
    const areas = areasDe(id);
    ok('  ' + setor + ': o PCP ainda grava a area "admin" (ela abre o /admin)', areas.includes('admin'),
      'areas: ' + areas.join(','));
    eq('  ' + setor + ': e o sob medida NAO o deixa entrar', noModulo(id), null);
    eq('  ' + setor + ': e a barra nao oferece o "Sob medida"', destino(areas).sobmedida, null);
  }
  /* A excecao solta pela mesma porta: "Ver custo" e de nivel admin. */
  const uCusto = noSetor('So custo', null);
  db.prepare("INSERT INTO usuario_excecao (usuario_id,chave,concede) VALUES (?,'custo.ver',1)").run(uCusto);
  eq('  a excecao "Ver custo" do PCP tambem nao abre o modulo', noModulo(uCusto), null);
  /* Os que podem tudo no modulo. */
  const uAG = noSetor('Geral da fase 1', 'Admin Geral');
  const ag = noModulo(uAG);
  ok('  o Admin Geral entra podendo tudo', !!ag && SMP.pode(ag, 'sobra.descartar') && SMP.pode(ag, 'boleto.editar'));
  eq('  e bipa os cinco setores', ag ? ag.setores.length : 0, 5);
  eq('  e a barra oferece o "Sob medida"', destino(areasDe(uAG)).sobmedida, '/sobmedida');
  const cadF1 = noModulo(noSetor('Cadastros da fase 1', 'Sob medida / Cadastros'));
  ok('  o setor "Sob medida / Cadastros" entra podendo tudo', !!cadF1 && SMP.pode(cadF1, 'sobra.descartar'));
  /* Quem tem admin E um setor do sob medida fica com o pacote DO SETOR, e nao
     com o de chefia por carona. */
  const uCompVend = noSetor('Comprador que vende', 'Comprador');
  db.prepare("INSERT INTO usuario_setor (usuario_id,setor_id) VALUES (?,(SELECT id FROM setores WHERE nome='Sob medida / Venda'))").run(uCompVend);
  const cv = noModulo(uCompVend);
  ok('  Comprador + Venda simula, e nao descarta sobra de carona',
    !!cv && SMP.pode(cv, 'catalogo.ler') && !SMP.pode(cv, 'sobra.descartar'));
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

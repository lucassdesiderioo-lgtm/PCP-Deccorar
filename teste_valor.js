#!/usr/bin/env node
/* teste_valor.js — A REGRA DO VALOR (spec ARRUMAR-O-LUGAR, fase 1, R-VAL).
 *
 *   node teste_valor.js
 *
 * O dono (11/11/2026): "sempre que uma tela tiver valor, ela tem que estar
 * linkada ao acessos. Então, a gente assinala ou não assinala essa opção para
 * que a pessoa tem ou não tem acesso a ver a tela com dinheiro, com valores."
 *
 * Trava:
 *   1. o mapa: toda tela com dinheiro declara a chave do valor (`valor:`), e
 *      só elas; a chave existe e é sensível (R-VAL-01, R-VAL-06);
 *   2. as chaves novas, com nível, tela e rótulo;
 *   3. o backfill de uma vez só: quem via o valor continua vendo, e mais
 *      ninguém ganha (R-VAL-06);
 *   4. a tela de Acessos mostra "Ver valores (R$)" em cada tela com valor, e o
 *      /api/telas/minhas diz a chave de cada tela (R-VAL-02);
 *   5. as rotas da medida padrão, com um servidor de verdade numa porta livre:
 *      sem a chave o dinheiro NÃO VIAJA (R-VAL-03), quem lança vê o que lança
 *      (R-VAL-04), e o vazamento do custo do SKU fechou.
 *
 * O sob medida (as duas chaves, preço de venda e custo) está no
 * `tecido/teste/valor.test.js`, que roda pelo `cd tecido && npm test`.
 *
 * ⚠️ O servidor sobe em PCP_DIR temporário e porta livre, NUNCA na 3010 (no
 * servidor de produção ele conversaria com a fábrica).
 */
const fs = require('fs'), os = require('os'), path = require('path'), net = require('net'), crypto = require('crypto');
const { spawn } = require('child_process');
const Database = require('better-sqlite3');

let n = 0, falhas = 0;
function ok(desc, cond, det){ n++; if(cond) console.log('  ok  ' + n + ' — ' + desc);
  else { falhas++; console.log('  FALHOU ' + n + ' — ' + desc + (det ? '\n         ' + det : '')); } }

const M = require('./telas');
const PERM = require('./permissoes');
const SMT = require('./tecido/nucleo/telas').TELAS;
const SMP = require('./tecido/nucleo/permissoes');
const infoPerm = {}; PERM.forEach(p => infoPerm[p.chave] = p);

/* ── 1. O MAPA ─────────────────────────────────────────────────────────────── */
console.log('\n── 1. o mapa: toda tela com dinheiro declara a chave do valor ──');
/* O INVENTÁRIO DE 11/11/2026 (as duas varreduras da fase 1). Tela nova com
   dinheiro entra AQUI e no mapa — o caso 1.3 reprova a que entrar só num. */
const PCP_VALOR = { 301:['custo.ver'], 302:['custo.ver'], 404:['custo.ver'],
  501:['compras.valores'], 252:['devolucao.valores'] };
/* ⚠️ UMA CHAVE DE VALOR POR TELA (③ REVISÃO): `pedido.pagar` e `devolucao.dinheiro`
   são AÇÕES (pagar, dar baixa no reembolso) e não podem aparecer na tela de
   Acessos como "Ver valores". */
const SM_CUSTO = [603, 604, 606, 607], SM_VENDA = [608, 609, 610, 611, 614, 615, 616];
const valorDe = t => Array.isArray(t.valor) ? t.valor : (t.valor ? [t.valor] : []);
for(const [nn, chaves] of Object.entries(PCP_VALOR)){
  const t = M.porNumero(+nn);
  ok(nn + ' declara o valor ' + chaves.join(' + '), t && JSON.stringify(valorDe(t)) === JSON.stringify(chaves), t && JSON.stringify(t.valor));
}
const smPorN = {}; Object.values(SMT).forEach(t => { if(!t.apelido) smPorN[t.numero] = t; });
ok('603, 604, 606 e 607 (sob medida) declaram o valor "custo.ver" (ver custo e valor do estoque)',
  SM_CUSTO.every(x => JSON.stringify(valorDe(smPorN[x])) === '["custo.ver"]'), SM_CUSTO.map(x => x + ':' + JSON.stringify(smPorN[x].valor)).join(' '));
ok('608, 609, 610, 611, 614, 615 e 616 (sob medida) declaram o valor "preco.ver" (ver preço de venda)',
  SM_VENDA.every(x => JSON.stringify(valorDe(smPorN[x])) === '["preco.ver"]'), SM_VENDA.map(x => x + ':' + JSON.stringify(smPorN[x].valor)).join(' '));
const comValor = M.TELAS.filter(t => valorDe(t).length).map(t => t.n).concat(Object.values(smPorN).filter(t => valorDe(t).length).map(t => t.numero)).sort();
const esperado = Object.keys(PCP_VALOR).map(Number).concat(SM_CUSTO, SM_VENDA).sort();
ok('a 602 Corte não declara valor: a tela e as rotas do corte não têm dinheiro (o aviso acenderia todo dia para o cortador)', !valorDe(smPorN[602]).length);
ok('as telas com `valor` são exatamente as do inventário (tela nova com dinheiro entra nos dois)',
  JSON.stringify(comValor) === JSON.stringify(esperado), 'mapa: ' + comValor.join(',') + ' · inventário: ' + esperado.join(','));
const chaveDoMapa = [];
M.TELAS.forEach(t => valorDe(t).forEach(c => chaveDoMapa.push(c)));
Object.values(smPorN).forEach(t => valorDe(t).forEach(c => chaveDoMapa.push('sobmedida.' + c)));
const semRegistro = chaveDoMapa.filter(c => !infoPerm[c]);
ok('toda chave de valor do mapa existe no registro de permissões', !semRegistro.length, semRegistro.join(', '));
const naoSens = [...new Set(chaveDoMapa)].filter(c => infoPerm[c] && !infoPerm[c].sensivel);
ok('toda chave de valor é sensível (R-VAL-06)', !naoSens.length, naoSens.join(', '));

/* ── 2. AS CHAVES ──────────────────────────────────────────────────────────── */
console.log('\n── 2. as chaves novas ──');
const dv = infoPerm['devolucao.valores'], cv = infoPerm['compras.valores'], pv = infoPerm['sobmedida.preco.ver'];
ok('devolucao.valores: Supervisor, tela 252, sensível, com rótulo', dv && dv.nivel === 'supervisor' && dv.tela === 252 && dv.sensivel && /valores/i.test(dv.rotulo || ''), JSON.stringify(dv));
ok('compras.valores: Supervisor, tela 501, sensível, com rótulo', cv && cv.nivel === 'supervisor' && cv.tela === 501 && cv.sensivel && /valores/i.test(cv.rotulo || ''), JSON.stringify(cv));
ok('sobmedida.preco.ver: Operação, sensível, pendurada numa tela de venda', pv && pv.nivel === 'operacao' && pv.sensivel && SM_VENDA.indexOf(pv.tela) >= 0, JSON.stringify(pv));
const cvs = infoPerm['sobmedida.custo.ver'];
ok('a sobmedida.custo.ver é a mesma CHAVE (#13), com o rótulo "Ver custo e valor do estoque"', cvs && /custo e valor do estoque/i.test(cvs.rotulo), cvs && cvs.rotulo);
ok('o vendedor nasce com a preco.ver (e o pacote de venda continua com a custo.ver até o dono tirar)',
  SMP.PAPEIS.vendedor.indexOf('preco.ver') >= 0 && SMP.PAPEIS.vendedor.indexOf('custo.ver') >= 0);
ok('a bancada (cortador e produção) não recebe a preco.ver', SMP.PAPEIS.cortador.indexOf('preco.ver') < 0 && SMP.PAPEIS.producao.indexOf('preco.ver') < 0);

/* ── 2b. O DONO ÚNICO: valor.js ──────────────────────────────────────────── */
console.log('\n── 2b. o valor.js: quem lança vê o que lança, e a régua bate com a do sob medida ──');
{
  const VA = require('./valor');
  ok('quem cria pedido vê o valor das compras sem a caixinha (R-VAL-04)', VA.ve(['pedido.criar'], 'compras.valores') && !VA.ve(['compras.ver'], 'compras.valores'));
  ok('o dinheiro das devoluções inclui os valores', VA.ve(['devolucao.dinheiro'], 'devolucao.valores'));
  ok('custo.ver não tem equivalente na medida padrão', !VA.ve(['modelo.cadastrar','compras.valores'], 'custo.ver'));
  const custoSm = fs.readFileSync(path.join(__dirname, 'tecido', 'dominio', 'custo.js'), 'utf8');
  ok('a equivalência do custo do sob medida (rolo.nota) é a mesma nos dois lados',
    JSON.stringify(VA.QUEM_LANCA['sobmedida.custo.ver']) === '["sobmedida.rolo.nota"]' && /veComercial=u=>pode\(u,'custo\.ver'\)\|\|pode\(u,'rolo\.nota'\)/.test(custoSm));
  ok('no sob medida, quem lança preço (catálogo), boleto ou limite de crédito vê o preço de venda; quem só monta pedido, não',
    ['sobmedida.catalogo.editar','sobmedida.boleto.editar','sobmedida.credito.editar'].every(c => VA.ve([c], 'sobmedida.preco.ver')) && !VA.ve(['sobmedida.pedido.lancar'], 'sobmedida.preco.ver'));
  const SMC = require('./tecido/dominio/custo');
  ok('a régua do sob medida (custo.vePreco) diz o mesmo que o valor.js',
    ['catalogo.editar','boleto.editar','credito.editar'].every(c => SMC.vePreco({ permissoes:[c] })) && !SMC.vePreco({ permissoes:['pedido.lancar'] }));
  ok('o semValor olha a PRIMEIRA chave da tela, e o Admin Geral nunca', VA.semValor({ valor:['compras.valores','pedido.pagar'] }, ['pedido.pagar'], false) === false
    && VA.semValor({ valor:['custo.ver'] }, [], true) === false && VA.semValor({ valor:[] }, [], false) === false);
}

/* ── 3. O BACKFILL ─────────────────────────────────────────────────────────── */
console.log('\n── 3. o backfill: quem via o valor continua vendo, uma vez só ──');
{
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'valor-bf-'));
  const db = new Database(path.join(dir, 't.db'));
  db.exec(`CREATE TABLE usuarios (id INTEGER PRIMARY KEY AUTOINCREMENT, nome TEXT, pin_hash TEXT, salt TEXT, areas TEXT, ativo INTEGER DEFAULT 1);
    CREATE TABLE config (chave TEXT PRIMARY KEY, valor TEXT);`);
  const appFalso = () => ({ locals:{}, router:{ stack:[] }, get(){}, post(){}, delete(){}, put(){}, use(){} });
  require('./acesso')(appFalso(), db);
  const setor = (nome, nivel, chaves) => { const id = db.prepare('INSERT INTO setores (nome,nivel) VALUES (?,?)').run(nome, nivel).lastInsertRowid;
    chaves.forEach(c => db.prepare('INSERT OR IGNORE INTO setor_permissao (setor_id,chave) VALUES (?,?)').run(id, c)); return id; };
  const pessoa = (nome, chaves) => { const id = db.prepare("INSERT INTO usuarios (nome,pin_hash,salt,areas) VALUES (?,'x','y','')").run(nome).lastInsertRowid;
    chaves.forEach(c => db.prepare('INSERT INTO usuario_excecao (usuario_id,chave,concede) VALUES (?,?,1)').run(id, c)); return id; };
  const sAcomp = setor('Pós-venda da casa', 'supervisor', ['devolucao.acompanhar']);
  const sLanca = setor('Lançar devolução', 'admin', ['devolucao.lancar']);
  const sCmp = setor('Comprador da casa', 'supervisor', ['compras.ver']);
  const sSm = setor('Venda da casa', 'operacao', ['sobmedida.modulo.entrar','sobmedida.custo.ver']);
  const sNada = setor('Expedição da casa', 'operacao', ['etiqueta.emitir','devolucao.registrar','pedido.receber']);
  const pDev = pessoa('Rê', ['devolucao.lancar']);
  const pSm = pessoa('Vê', ['sobmedida.custo.ver']);
  const pNada = pessoa('Zé', ['devolucao.baixar']);
  /* as revogações: a exceção concede=0 tirava a chave de origem da pessoa */
  const naSetor = (u, sid) => db.prepare('INSERT INTO usuario_setor (usuario_id,setor_id) VALUES (?,?)').run(u, sid);
  const revoga = (u, c) => db.prepare('INSERT INTO usuario_excecao (usuario_id,chave,concede) VALUES (?,?,0)').run(u, c);
  const pRev = pessoa('Revogada SM', []); naSetor(pRev, sSm); revoga(pRev, 'sobmedida.custo.ver');
  const pRevCmp = pessoa('Revogada CMP', []); naSetor(pRevCmp, sCmp); revoga(pRevCmp, 'compras.ver');
  const sDuas = setor('Lança e acompanha', 'admin', ['devolucao.lancar','devolucao.acompanhar']);
  const pDuas = pessoa('Duas origens', []); naSetor(pDuas, sDuas); revoga(pDuas, 'devolucao.lancar');
  [pRev, pRevCmp, pDuas].forEach(u => db.prepare("UPDATE usuarios SET nivel='admin' WHERE id=?").run(u));
  db.prepare("DELETE FROM config WHERE chave='seed_valor_1'").run();
  require('./acesso')(appFalso(), db);
  const tem = (s, c) => !!db.prepare('SELECT 1 FROM setor_permissao WHERE setor_id=? AND chave=?').get(s, c);
  const exc = (u, c) => !!db.prepare('SELECT 1 FROM usuario_excecao WHERE usuario_id=? AND chave=? AND concede=1').get(u, c);
  ok('quem acompanha devolução ganhou devolucao.valores (setor)', tem(sAcomp, 'devolucao.valores'));
  ok('quem lança devolução ganhou devolucao.valores (setor)', tem(sLanca, 'devolucao.valores'));
  ok('a exceção de lançar devolução ganhou devolucao.valores', exc(pDev, 'devolucao.valores'));
  ok('quem tem compras.ver ganhou compras.valores', tem(sCmp, 'compras.valores'));
  ok('quem tem a custo.ver do sob medida ganhou a preco.ver (setor)', tem(sSm, 'sobmedida.preco.ver'));
  ok('a exceção da custo.ver do sob medida ganhou a preco.ver', exc(pSm, 'sobmedida.preco.ver'));
  const AC0 = (() => { const a = appFalso(); require('./acesso')(a, db); return a.locals.acesso; })();
  ok('quem teve a custo.ver do sob medida REVOGADA por exceção não ganhou a preco.ver pelo setor',
    !AC0.permissoesDe(pRev).has('sobmedida.preco.ver'), JSON.stringify(Array.from(AC0.permissoesDe(pRev))));
  ok('quem teve a compras.ver revogada não ganhou compras.valores', !AC0.permissoesDe(pRevCmp).has('compras.valores'));
  ok('quem teve só o lançar revogado, mas acompanha pelo setor, continua com devolucao.valores', AC0.permissoesDe(pDuas).has('devolucao.valores'));
  const excRev = db.prepare("SELECT concede, motivo FROM usuario_excecao WHERE usuario_id=? AND chave='sobmedida.preco.ver'").get(pRev);
  ok('a exceção que o backfill cria diz de onde veio (o motivo), para o dono entender na tela de Acessos', excRev && excRev.concede === 0 && /valor/i.test(excRev.motivo || ''), JSON.stringify(excRev));
  ok('o setor sem nenhuma chave de origem não ganhou nada',
    !['devolucao.valores','compras.valores','sobmedida.preco.ver'].some(c => tem(sNada, c)));
  ok('a exceção sem chave de origem (só a baixa) não ganhou nada', !exc(pNada, 'devolucao.valores'));
  ok('a marca do backfill ficou gravada (uma vez só)', !!db.prepare("SELECT 1 FROM config WHERE chave='seed_valor_1'").get());
  // o dono tira a chave de um setor; o próximo boot não a devolve
  db.prepare("DELETE FROM setor_permissao WHERE setor_id=? AND chave='devolucao.valores'").run(sAcomp);
  require('./acesso')(appFalso(), db);
  ok('tirada pelo dono, a chave não volta no boot seguinte', !tem(sAcomp, 'devolucao.valores'));
  db.close(); try{ fs.rmSync(dir, { recursive:true, force:true }); }catch(e){}
}

/* ── 4 e 5. O SERVIDOR DE VERDADE ──────────────────────────────────────────── */
const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'pcp-valor-'));
const segredo = path.join(__dirname, '.session_secret');
const segredoExistia = fs.existsSync(segredo);
function portaLivre(){ return new Promise(r => { const s = net.createServer(); s.listen(0, '127.0.0.1', () => { const p = s.address().port; s.close(() => r(p)); }); }); }
const espera = ms => new Promise(r => setTimeout(r, ms));
let srv = null, base = '';
async function subir(){
  const porta = await portaLivre();
  base = 'http://127.0.0.1:' + porta;
  srv = spawn(process.execPath, ['server.js'], { cwd: __dirname, stdio: ['ignore','pipe','pipe'],
    env: Object.assign({}, process.env, { PCP_DIR: tmp, PCP_PORTA: String(porta), BANCO_TECIDO: path.join(tmp, 'sm-valor.db') }) });
  let log = ''; srv.stdout.on('data', d => log += d); srv.stderr.on('data', d => log += d);
  for(let i = 0; i < 160; i++){
    await espera(250);
    try{ const r = await fetch(base + '/login'); if(r.status === 200) return true; }catch(e){}
    if(srv.exitCode != null) break;
  }
  console.log(log.slice(-3000)); return false;
}
process.on('exit', () => { if(srv && srv.exitCode == null) srv.kill('SIGTERM'); try{ fs.rmSync(tmp, { recursive:true, force:true }); }catch(e){}
  if(!segredoExistia){ try{ fs.unlinkSync(segredo); }catch(e){} } });
const COOKIE = {};
async function req(quem, metodo, url, corpo){
  const h = { 'Content-Type':'application/json' }; if(COOKIE[quem]) h.Cookie = COOKIE[quem];
  const r = await fetch(base + url, { method: metodo, headers: h, body: corpo ? JSON.stringify(corpo) : undefined, redirect:'manual' });
  const t = await r.text(); let d; try{ d = JSON.parse(t); }catch(e){ d = { _texto: t.slice(0, 200) }; }
  return { st: r.status, d };
}
const get = (q, u) => req(q, 'GET', u), post = (q, u, b) => req(q, 'POST', u, b || {});
/* "o campo NÃO VIAJOU": a chave nem existe no JSON, em nenhum nível. */
function temCampo(o, nome){
  if(Array.isArray(o)) return o.some(x => temCampo(x, nome));
  if(!o || typeof o !== 'object') return false;
  return Object.keys(o).some(k => k === nome || temCampo(o[k], nome));
}

(async () => {
  console.log('\n── 4 e 5. o servidor de verdade (PCP_DIR temporário, porta livre) ──');
  ok('o servidor subiu', await subir());
  const db = new Database(path.join(tmp, 'dados.db')); db.pragma('busy_timeout = 5000');
  const hash = (pin, salt) => crypto.scryptSync(String(pin), salt, 32).toString('hex');
  const ID = {};
  /* AS PESSOAS NASCEM DEPOIS DO BOOT: o backfill já rodou, então o setor feito
     aqui fica exatamente com as chaves escritas — é o "depois de o dono tirar". */
  const setorNovo = (nome, nivel, chaves) => { const id = db.prepare('INSERT INTO setores (nome,nivel) VALUES (?,?)').run(nome, nivel).lastInsertRowid;
    chaves.forEach(c => db.prepare('INSERT INTO setor_permissao (setor_id,chave) VALUES (?,?)').run(id, c)); return id; };
  const setorId = nome => db.prepare('SELECT id FROM setores WHERE nome=?').get(nome).id;
  function pessoa(nome, nivel, setores){
    const salt = crypto.randomBytes(16).toString('hex');
    const id = db.prepare('INSERT INTO usuarios (nome,salt,pin_hash,areas,pin_curto,nivel) VALUES (?,?,?,?,0,?)').run(nome, salt, hash('246810', salt), '', nivel).lastInsertRowid;
    setores.forEach(s => db.prepare('INSERT INTO usuario_setor (usuario_id,setor_id) VALUES (?,?)').run(id, s));
    ID[nome] = id;
  }
  pessoa('Lucas', 'admin_geral', [setorId('Admin Geral')]);
  pessoa('Rev', 'operacao', [setorId('Operador / Revisão')]);
  pessoa('Custo', 'admin', [setorNovo('Custo da casa', 'admin', ['custo.ver','revisao.executar'])]);
  pessoa('DevSem', 'admin', [setorNovo('Dev sem valor', 'admin', ['devolucao.lancar','devolucao.acompanhar'])]);
  pessoa('DevCom', 'admin', [setorNovo('Dev com valor', 'admin', ['devolucao.lancar','devolucao.acompanhar','devolucao.valores'])]);
  pessoa('CmpSem', 'admin', [setorNovo('Compras sem valor', 'admin', ['compras.ver','pedido.ver'])]);
  pessoa('CmpCom', 'supervisor', [setorNovo('Compras com valor', 'supervisor', ['compras.ver','pedido.ver','compras.valores'])]);
  pessoa('CmpCria', 'admin', [setorNovo('Quem cria pedido', 'admin', ['compras.ver','pedido.ver','pedido.criar'])]);
  pessoa('FichaSem', 'admin', [setorNovo('Ficha sem custo', 'admin', ['modelo.cadastrar'])]);
  pessoa('AdmSem', 'admin', [setorNovo('Admin sem custo', 'admin', ['listas.editar'])]);
  for(const nome of Object.keys(ID)){
    const r = await fetch(base + '/api/auth/login', { method:'POST', headers:{'Content-Type':'application/json'}, body: JSON.stringify({ id: ID[nome], pin:'246810' }) });
    COOKIE[nome] = (r.headers.get('set-cookie') || '').split(';')[0];
  }
  ok('as pessoas entraram pelo PIN', Object.values(COOKIE).every(c => /^sess=/.test(c)));

  console.log('\n── 4. a tela de Acessos e o /api/telas/minhas ──');
  const reg = await get('Lucas', '/api/acesso/registro');
  const telasReg = []; ((reg.d && reg.d.mapa) || []).forEach(m => (m.telas || []).forEach(t => telasReg.push(t)));
  const tReg = nn => telasReg.find(t => t.n === nn) || {};
  const chavesValor = t => (t.valores || []).map(v => v.chave);
  ok('na tela de Acessos, a 301 e a 404 mostram "Ver valores (R$)" com a custo.ver (a mesma chave em duas telas, R-VAL-05)',
    chavesValor(tReg(301)).indexOf('custo.ver') >= 0 && chavesValor(tReg(404)).indexOf('custo.ver') >= 0, JSON.stringify(tReg(301).valores));
  ok('a 252 mostra a devolucao.valores e a 501 a compras.valores',
    chavesValor(tReg(252)).indexOf('devolucao.valores') >= 0 && chavesValor(tReg(501)).indexOf('compras.valores') >= 0);
  ok('a 609 (sob medida) mostra a sobmedida.preco.ver e a 607 a sobmedida.custo.ver',
    chavesValor(tReg(609)).indexOf('sobmedida.preco.ver') >= 0 && chavesValor(tReg(607)).indexOf('sobmedida.custo.ver') >= 0, JSON.stringify(tReg(609).valores));
  ok('tela sem dinheiro não ganha a linha de valores (101)', !chavesValor(tReg(101)).length);
  ok('pagar pedido continua AÇÃO da 501, e não "Ver valores"', chavesValor(tReg(501)).indexOf('pedido.pagar') < 0 && (tReg(501).acoes || []).some(a => a.chave === 'pedido.pagar'));
  ok('o dinheiro das devoluções continua AÇÃO da 252, e não "Ver valores"', chavesValor(tReg(252)).indexOf('devolucao.dinheiro') < 0 && (tReg(252).acoes || []).some(a => a.chave === 'devolucao.dinheiro'));
  const v501 = (tReg(501).valores || [])[0] || {};
  ok('a linha de valor diz quem também vê sem a caixinha (quem lança aquele dinheiro, R-VAL-04)',
    Array.isArray(v501.tambem) && v501.tambem.some(t => t.chave === 'pedido.criar' && t.rotulo), JSON.stringify(v501));
  const acsHtml = fs.readFileSync(path.join(__dirname, 'views', 'acessos.html'), 'utf8');
  ok('a tela de Acessos escreve quem também vê', /tambem/.test(acsHtml));
  ok('salvar o setor não manda a mesma chave repetida (ela aparece em várias telas)', /new Set\(/.test(acsHtml.slice(acsHtml.indexOf('async function salvarSetor('), acsHtml.indexOf('async function salvarSetor(') + 600)));
  const v = (tReg(301).valores || [])[0] || {};
  ok('a linha de valor diz o rótulo da chave e que é sensível', !!v.rotulo && v.sensivel === true, JSON.stringify(v));
  const minhas = await get('AdmSem', '/api/telas/minhas');
  const t301 = ((minhas.d && minhas.d.telas) || []).find(t => t.n === 301);
  ok('o /api/telas/minhas diz a chave de valor de cada tela (a 301: custo.ver)', t301 && JSON.stringify(t301.valor) === '["custo.ver"]', JSON.stringify(t301));
  ok('…e marca sem_valor na 301 de quem não tem custo.ver (a linha da barra acende)', t301 && t301.sem_valor === true);
  const mLu = await get('Lucas', '/api/telas/minhas');
  ok('o Admin Geral não tem tela sem_valor', ((mLu.d && mLu.d.telas) || []).every(t => !t.sem_valor));
  const mCria = await get('CmpCria', '/api/telas/minhas');
  const t501 = ((mCria.d && mCria.d.telas) || []).find(t => t.n === 501);
  ok('quem cria pedido (lança dinheiro de compra) não tem a 501 marcada sem_valor (R-VAL-04)', t501 && t501.sem_valor === false, JSON.stringify(t501));
  const mSem = await get('CmpSem', '/api/telas/minhas');
  const t501s = ((mSem.d && mSem.d.telas) || []).find(t => t.n === 501);
  ok('quem só vê compras tem a 501 marcada sem_valor', t501s && t501s.sem_valor === true, JSON.stringify(t501s));
  const MT = fs.readFileSync(path.join(__dirname, 'public', 'menu_telas.js'), 'utf8');
  ok('a frase da barra é uma só, no menu_telas.js, e as duas operações a chamam',
    /Os valores em R\$ desta tela não aparecem para o seu acesso/.test(MT)
    && /marcarSemValor/.test(fs.readFileSync(path.join(__dirname, 'public', 'nav.js'), 'utf8'))
    && /marcarSemValor/.test(fs.readFileSync(path.join(__dirname, 'tecido', 'public', 'nav.js'), 'utf8')));

  console.log('\n── 5a. o custo do SKU não vai para quem não tem custo.ver (o vazamento do /api/skus) ──');
  db.prepare("INSERT INTO skus (codigo,descricao,custo_direto) VALUES ('KITREV','Kit de revenda',12.5)").run();
  const sRev = await get('Rev', '/api/skus'), sCusto = await get('Custo', '/api/skus');
  ok('a Revisão lê os SKUs', sRev.st === 200 && Array.isArray(sRev.d) && sRev.d.some(s => s.codigo === 'KITREV'));
  ok('…sem o custo_direto (a chave nem viaja)', sRev.st === 200 && !temCampo(sRev.d, 'custo_direto'));
  ok('quem tem custo.ver recebe o custo_direto', sCusto.st === 200 && (sCusto.d.find(s => s.codigo === 'KITREV') || {}).custo_direto === 12.5);

  console.log('\n── 5b. 252: os valores do caso só com devolucao.valores ──');
  const caso = db.prepare("INSERT INTO devolucao_caso (tipo,etapa,venda,valor_ml,custo_etiqueta,limite_frete) VALUES ('ml','aguardando','2000099990001',150.5,48.7,60)").run().lastInsertRowid;
  const cSem = await get('DevSem', '/api/devolucao-casos/' + caso), cCom = await get('DevCom', '/api/devolucao-casos/' + caso);
  ok('quem lança e acompanha SEM a caixinha abre o caso', cSem.st === 200, JSON.stringify(cSem.d).slice(0, 200));
  ok('…sem valor_ml, custo_etiqueta e limite_frete', cSem.st === 200 && !['valor_ml','custo_etiqueta','limite_frete'].some(k => temCampo(cSem.d, k)), JSON.stringify(cSem.d).slice(0, 300));
  ok('com a caixinha, os valores vêm', cCom.st === 200 && temCampo(cCom.d, 'valor_ml'));
  const lSem = await get('DevSem', '/api/devolucao-casos');
  ok('a lista também sai sem os valores para quem não tem a caixinha', lSem.st === 200 && !temCampo(lSem.d, 'valor_ml'));
  const vSem = await post('DevSem', '/api/devolucao-casos/' + caso + '/valor', { valor_ml: 10 });
  ok('quem não tem a caixinha não lança valor no caso (403, dizendo a chave)', vSem.st === 403 && vSem.d && vSem.d.chave === 'devolucao.valores', JSON.stringify(vSem));
  const lanSem = await post('DevSem', '/api/devolucao-casos', { tipo:'ml', venda:'2000099990002', publicidade:0, custo_etiqueta: 48.7 });
  ok('nem no lançamento (custo da etiqueta digitado → 403)', lanSem.st === 403 && lanSem.d.chave === 'devolucao.valores', JSON.stringify(lanSem));
  const lanSemOk = await post('DevSem', '/api/devolucao-casos', { tipo:'ml', venda:'2000099990002', publicidade:0 });
  ok('lançar SEM valor continua sendo dele (a recusa, se houver, não é pela caixinha)', lanSemOk.st !== 403, JSON.stringify(lanSemOk));
  const eSem = await post('DevSem', '/api/devolucao-casos/' + caso + '/editar', { custo_etiqueta: 30 });
  ok('nem pelo "Salvar alterações" (custo da etiqueta → 403)', eSem.st === 403 && eSem.d.chave === 'devolucao.valores', JSON.stringify(eSem));
  const vCom = await post('DevCom', '/api/devolucao-casos/' + caso + '/valor', { valor_ml: 160 });
  ok('com a caixinha, lança o valor', vCom.st === 200, JSON.stringify(vCom));
  const rota = fs.readFileSync(path.join(__dirname, 'devcaso_route.js'), 'utf8');
  ok('a régua dos valores é a devolucao.valores (ou o dinheiro), e não mais lançar/acompanhar',
    /podeValores\s*=.*devolucao\.valores/.test(rota) && !/podeValores\s*=.*devolucao\.(lancar|acompanhar)/.test(rota));

  console.log('\n── 5c. 501: o dinheiro das compras só com compras.valores — ou com a chave de quem lança ──');
  const comp = db.prepare("INSERT INTO componente (nome,unidade,custo_medio) VALUES ('Tubo teste','m',7.25)").run().lastInsertRowid;
  const forn = db.prepare("INSERT INTO fornecedor (nome,pedido_minimo,frete_padrao) VALUES ('Forn teste',300,40)").run().lastInsertRowid;
  db.prepare("INSERT INTO oferta (fornecedor_id,componente_id,embalagem,fator,preco) VALUES (?,?,'barra 6 m',6,42)").run(forn, comp);
  const ped = db.prepare("INSERT INTO pedido_compra (fornecedor_id,status,valor_previsto) VALUES (?,'rascunho',420)").run(forn).lastInsertRowid;
  for(const [rota, campos] of [['/api/componentes',['custo_medio']], ['/api/fornecedores',['pedido_minimo','frete_padrao']],
                               ['/api/ofertas?componente_id=' + comp, ['preco']], ['/api/pedidos/' + ped, ['valor_previsto']]]){
    const sem = await get('CmpSem', rota), com = await get('CmpCom', rota);
    ok(rota + ': quem só vê compras recebe a lista sem ' + campos.join(', '), sem.st === 200 && !campos.some(c => temCampo(sem.d, c)), sem.st + ' ' + JSON.stringify(sem.d).slice(0, 240));
    ok(rota + ': com compras.valores, vem', com.st === 200 && campos.every(c => temCampo(com.d, c)), com.st + ' ' + JSON.stringify(com.d).slice(0, 240));
  }
  const pCria = await get('CmpCria', '/api/pedidos/' + ped);
  ok('quem cria pedido vê o valor do que lança (R-VAL-04)', pCria.st === 200 && temCampo(pCria.d, 'valor_previsto'));
  const pSemLista = await get('CmpSem', '/api/pedidos');
  ok('a lista de pedidos também sai sem dinheiro para quem só vê compras', pSemLista.st === 200 && !temCampo(pSemLista.d, 'valor_previsto'));
  const wSem = await get('CmpSem', '/api/pedidos/' + ped + '/whatsapp');
  ok('o texto de WhatsApp do pedido (tem preço) é recusado a quem não vê o valor', wSem.st === 403);

  console.log('\n── 5d. 404: a ficha abre sem o custo para quem não tem custo.ver ──');
  /* SKU DE REVENDA (modelo sem ficha): o custo é o direto, e é ele que a ficha devolve. */
  db.prepare("INSERT INTO skus (codigo,descricao,tem_ficha,custo_direto) VALUES ('BK100100VT','teste',0,33)").run();
  const fSem = await get('FichaSem', '/api/ficha/BK100100VT'), fLu = await get('Lucas', '/api/ficha/BK100100VT');
  ok('quem abre a 404 sem custo.ver lê a ficha (antes: 403)', fSem.st === 200, fSem.st + ' ' + JSON.stringify(fSem.d).slice(0, 200));
  ok('…sem o custo (custo_material e custo das linhas não viajam)', fSem.st === 200 && !temCampo(fSem.d, 'custo_material') && !temCampo(fSem.d, 'custo'), JSON.stringify(fSem.d).slice(0, 300));
  ok('com custo.ver, o custo vem', fLu.st === 200 && temCampo(fLu.d, 'custo_material'), JSON.stringify(fLu.d).slice(0, 200));
  const matSem = await post('FichaSem', '/api/ficha/BK100100VT/materializar', {});
  ok('gravar a ficha continua pedindo custo.ver (só a leitura mudou)', matSem.st === 403);

  console.log('\n── 5e. 301: o valor do estoque continua só com custo.ver ──');
  const eSemC = await get('AdmSem', '/api/estoque/painel'), eLu = await get('Lucas', '/api/estoque/painel');
  ok('o Admin sem custo.ver abre o estoque sem valor', eSemC.st === 200 && !temCampo(eSemC.d, 'valor_estoque'), eSemC.st + ' ' + JSON.stringify(eSemC.d).slice(0, 200));
  ok('com custo.ver (Admin Geral), o valor vem', eLu.st === 200 && temCampo(eLu.d, 'valor_estoque'));

  console.log('\n── 5f. o que a ③ REVISÃO achou (cada caso reprovava antes do conserto) ──');
  /* P1: a resposta da revisão do frete também é valor digitado */
  db.prepare("UPDATE devolucao_caso SET chegou_em=datetime('now','localtime'), revisao_pedida_em=datetime('now','localtime') WHERE id=?").run(caso);
  const rf = await post('DevSem', '/api/devolucao-casos/' + caso + '/revisao-frete-resposta', { resultado:'devolveu', valor_revisao: 77.5 });
  ok('a resposta da revisão do frete com valor é recusada sem a caixinha (403)', rf.st === 403 && rf.d.chave === 'devolucao.valores', JSON.stringify(rf));
  ok('…e nada foi gravado', db.prepare('SELECT valor_revisao FROM devolucao_caso WHERE id=?').get(caso).valor_revisao == null);
  /* as outras escritas com valor, uma a uma */
  for(const [rota, corpo] of [['/coleta', { transportadora_id: 1, custo: 50 }], ['/coleta-agenda', { custo: 50 }],
                              ['/coleta-resultado', { resultado:'coletou', custo: 50 }], ['/enviar', { rastreio:'BR1', custo_envio: 30 }]]){
    const r = await post('DevSem', '/api/devolucao-casos/' + caso + rota, corpo);
    ok(rota + ' com valor é recusada sem a caixinha (403)', r.st === 403 && r.d.chave === 'devolucao.valores', JSON.stringify(r));
  }
  /* P2: o aviso do comparar escreve R$ em texto */
  const comp2 = db.prepare("INSERT INTO componente (nome,unidade,custo_medio) VALUES ('Parafuso teste','un',0.1)").run().lastInsertRowid;
  const fA = db.prepare("INSERT INTO fornecedor (nome) VALUES ('Barato com frete')").run().lastInsertRowid;
  const fB = db.prepare("INSERT INTO fornecedor (nome) VALUES ('Caro sem frete')").run().lastInsertRowid;
  db.prepare("INSERT INTO oferta (fornecedor_id,componente_id,embalagem,fator,preco,frete) VALUES (?,?,'un',1,10,100)").run(fA, comp2);
  db.prepare("INSERT INTO oferta (fornecedor_id,componente_id,embalagem,fator,preco,frete) VALUES (?,?,'un',1,12,0)").run(fB, comp2);
  const cmpSem = await get('CmpSem', '/api/comparar?componente_id=' + comp2 + '&necessidade=7'), cmpCom = await get('CmpCom', '/api/comparar?componente_id=' + comp2 + '&necessidade=7');
  ok('o comparar com a caixinha traz o aviso com R$ (o caso é de verdade)', cmpCom.st === 200 && /R\$/.test(JSON.stringify(cmpCom.d)), JSON.stringify(cmpCom.d).slice(0, 300));
  ok('sem a caixinha, nenhum "R$" sobra no comparar — nem no texto do aviso', cmpSem.st === 200 && !/R\$/.test(JSON.stringify(cmpSem.d)), JSON.stringify(cmpSem.d).slice(0, 300));
  /* P6: a lista de compras (o previsto) e as rotas podadas, no código */
  db.prepare("UPDATE componente SET estoque_minimo=10, estoque_ideal=20 WHERE id=?").run(comp2);
  const lcSem = await get('CmpSem', '/api/compras/lista'), lcCom = await get('CmpCom', '/api/compras/lista');
  ok('a lista de compras com a caixinha traz o desembolso e o total', lcCom.st === 200 && temCampo(lcCom.d, 'desembolso') && 'total' in lcCom.d, JSON.stringify(lcCom.d).slice(0, 200));
  ok('sem a caixinha, a lista sai sem desembolso e sem o total previsto', lcSem.st === 200 && !temCampo(lcSem.d, 'desembolso') && !('total' in lcSem.d), JSON.stringify(lcSem.d).slice(0, 200));
  ok('…mas a quantidade da origem (subtotal) continua', lcSem.st === 200 && temCampo(lcSem.d, 'subtotal') === temCampo(lcCom.d, 'subtotal'));
  const fonteCmp = fs.readFileSync(path.join(__dirname, 'compras_route.js'), 'utf8');
  ok('as leituras do Compras com dinheiro passam todas pela poda (comparar, lista, necessidade, histórico de preço)',
    ['/api/comparar','/api/compras/lista','/api/compras/necessidade','/api/precos/historico'].every(r => fonteCmp.indexOf("'" + r + "'") >= 0 && new RegExp("\\['" + r.replace(/\//g, '\\/') + "'").test(fonteCmp)));
  /* P3: a 404 desenha a ficha para quem só cadastra modelo */
  const fm = await get('FichaSem', '/api/formulas?modelo_id=1');
  ok('quem abre a 404 com modelo.cadastrar lê as fórmulas da ficha (sem isso a tela fica vazia)', fm.st === 200 && Array.isArray(fm.d), JSON.stringify(fm).slice(0, 160));
  const idx = fs.readFileSync(path.join(__dirname, 'public', 'index.html'), 'utf8');
  ok('a ficha na tela não quebra se a leitura de fórmulas falhar (FXLINHAS só vale como lista)', /FXLINHAS=Array\.isArray\(/.test(idx));
  /* P4: sem a caixinha, a tela não escreve "sem limite" */
  const abas = fs.readFileSync(path.join(__dirname, 'public', 'compras_abas.js'), 'utf8');
  ok('a alçada do pedido só é escrita quando veio (podada não vira "sem limite")', /'alcada' in p/.test(abas));
  /* P7: o orçamento e o comprovante do pedido são arquivos com R$ */
  const anx = await post('CmpCria', '/api/compras/anexos', { pedido_id: ped, tipo:'orcamento', nome:'orc.txt', base64: Buffer.from('R$ 999,00').toString('base64') });
  ok('quem cria pedido anexa o orçamento', anx.st === 200 && anx.d.id, JSON.stringify(anx));
  const baixaSem = await get('CmpSem', '/api/compras/anexos/' + anx.d.id), baixaCom = await get('CmpCom', '/api/compras/anexos/' + anx.d.id);
  ok('sem a caixinha, o orçamento do pedido não se baixa (403)', baixaSem.st === 403, baixaSem.st + ' ' + JSON.stringify(baixaSem.d).slice(0, 120));
  ok('com a caixinha, baixa', baixaCom.st === 200);
  const detSem = await get('CmpSem', '/api/pedidos/' + ped), detCom = await get('CmpCom', '/api/pedidos/' + ped);
  ok('o detalhe do pedido (o que a 501 desenha) não lista o orçamento a quem não pode abrir', detSem.st === 200 && !(detSem.d.anexos || []).some(a => a.id === anx.d.id), JSON.stringify(detSem.d.anexos));
  ok('…e lista para quem pode', detCom.st === 200 && (detCom.d.anexos || []).some(a => a.id === anx.d.id));
  ok('o botão de WhatsApp não aparece para quem só lança preço (a rota pede ver o pedido inteiro e o valor)',
    !/id="pcWa" data-perm="[^"]*preco\.lancar/.test(fs.readFileSync(path.join(__dirname, 'public', 'compras_abas.js'), 'utf8')));
  const listaSem = await get('CmpSem', '/api/compras/anexos?pedido_id=' + ped);
  ok('…e a lista de anexos não o oferece a quem não pode abrir', listaSem.st === 200 && Array.isArray(listaSem.d) && !listaSem.d.some(a => a.id === anx.d.id));

  db.close();
  console.log('\n' + (n - falhas) + ' ok, ' + falhas + ' falha(s)');
  process.exit(falhas ? 1 : 0);
})().catch(e => { console.log('ERRO: ' + (e && e.stack || e)); process.exit(1); });

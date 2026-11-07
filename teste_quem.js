#!/usr/bin/env node
/* teste_quem.js — A REGRA-MÃE TRAVADA POR TESTE: toda rota de escrita do PCP
 * passa pelo `quem.js`, e sem login nada grava. Spec QUEM-FEZ-E-REVISAO, fase 7
 * (05/11/2026), CLAUDE.md §10.
 *
 *   node teste_quem.js
 *
 * Duas varreduras, e as duas olham o sistema inteiro — rota nova entra na conta
 * no mesmo minuto em que é escrita:
 *
 *   1. DINÂMICA. Sobe os módulos de rota do PCP na mesma ordem do server.js,
 *      num banco temporário e num `app` de mentira, e chama CADA rota de escrita
 *      (POST, PUT, PATCH, DELETE) sem ninguém logado. Toda uma tem que
 *      responder 401, e o banco não pode mudar (`total_changes()` igual).
 *   2. ESTÁTICA. Lê o texto dos arquivos: todo módulo que registra escrita
 *      carrega o `quem.js`; nenhum lê o nome de quem fez direto do
 *      `req.usuario` (o dono é o `quem.js`, spec §6.2); o server.js, que nenhum
 *      teste consegue carregar, passa a rota dele pelo `quem.js`; e a porta do
 *      sob medida grava o id na auditoria.
 *
 * As exceções são NOMEADAS, com o motivo, e a exceção que deixou de existir
 * reprova — lista de exceção que só cresce é onde a regra morre calada.
 */
const fs = require('fs'), os = require('os'), path = require('path');

const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'pcp-quem-'));
process.env.PCP_DIR = tmp;
process.env.PCP_DEVOLUCOES_DIR = path.join(tmp, 'devolucoes');

let falhas = 0, casos = 0;
const ok = (n, c, extra) => { casos++;
  if(c) console.log('ok      ' + n);
  else { falhas++; console.log('FALHOU  ' + n + (extra ? '   ' + extra : '')); } };

/* As rotas de escrita que NÃO passam pelo quem.js, e por quê. */
const EXCECOES_ROTA = {
  'POST /api/auth/login':      'é o próprio login: ninguém está logado ainda',
  'POST /api/auth/trocar-pin': 'é do portão: lê a sessão e responde 401 sozinho (teste_login.js)',
  'POST /api/auth/logout':     'é do portão: sem sessão não há o que registrar, e apaga o cookie',
  'POST /api/auth/setor':      'é do portão: lê a sessão e responde 401 sozinho (teste_login.js)'
};

/* ── 1. DINÂMICA ─────────────────────────────────────────────────────────── */
const db = require('./db');
const rotas = [];
const registra = metodo => function(p, ...h){
  if(typeof p === 'string' && h.length) rotas.push({ metodo, caminho:p, h:h[h.length-1], antes:h.slice(0,-1) });
  return app;
};
const app = { locals:{}, use(){ return app; }, set(){}, enable(){}, disable(){},
  get: registra('GET'), post: registra('POST'), put: registra('PUT'), patch: registra('PATCH'), delete: registra('DELETE'),
  all: registra('ALL') };
/* O que o server.js faz entre os módulos e eles leem (o ajuste à mão). */
db.exec(`CREATE TABLE IF NOT EXISTS ajuste_estoque (id INTEGER PRIMARY KEY AUTOINCREMENT, codigo TEXT, antes INTEGER,
  depois INTEGER, delta INTEGER, motivo TEXT, obs TEXT, usuario_id INTEGER, usuario_nome TEXT,
  criado_em TEXT DEFAULT (datetime('now','localtime')), data TEXT DEFAULT (date('now','localtime')), teste INTEGER DEFAULT 0)`);
require('./estoque_dominio').garantirSchema(db);
const MODULOS = ['auth','admin_telas','sku_cad_route','ajuste_route','revisao_route','painel_route','exp_route',
  'mont_route','carreg_route','saida_route','backup_route','rel_route','alvo_route','est_route','plan_route',
  'modo_route','cruz_route','cont_route','inventario_route','etq_route','correcao_route','dev_route',
  'devcaso_route','cad_route','sku_route','compras_route','ficha_route','pedido_route','receb_route','material_route','compra_route','recebimento_route','nota_route','almox_route','contagem_material_route','programada_route',
  'ger_route','st_route','pendencias_route','acesso','teste_route'];
const deQuem = {};
for(const m of MODULOS){
  const n0 = rotas.length;
  require('./' + m)(app, db);
  rotas.slice(n0).forEach(r => { r.modulo = m; });
}
const escritas = rotas.filter(r => /^(POST|PUT|PATCH|DELETE)$/.test(r.metodo));

(async () => {
  console.log('\n── 1. toda rota de escrita do PCP, sem login: 401, e o banco não muda ──');
  /* 143 em 05/11/2026 (fora as duas do server.js). Menos que isso é módulo
     que deixou de subir aqui — e rota que não sobe não é conferida. */
  ok('a varredura achou as escritas (143 ou mais)', escritas.length >= 143, escritas.length);
  const tot = () => db.prepare('SELECT total_changes() n').get().n;
  for(const r of escritas){
    const k = r.metodo + ' ' + r.caminho;
    if(EXCECOES_ROTA[k]) continue;
    const out = { status:200 };
    const antes = tot();
    const res = { status(c){ out.status = c; return res; }, json(o){ out.body = o; return res; },
      send(o){ out.body = o; return res; }, end(){ return res; }, setHeader(){ return res; }, set(){ return res; },
      type(){ return res; }, sendFile(){ return res; }, download(){ return res; }, redirect(){ out.status = 302; return res; } };
    const req = { body:{ id:1, ids:[1], codigo:'BK140140BEGE', itens:[], sessao:'S', motivo:'x', nome:'x', confirmar:true },
      params:{ id:'1', tid:'1', sessao:'S', codigo:'BK140140BEGE', tipo:'lote' }, query:{}, headers:{}, usuario:null,
      socket:{}, method:r.metodo, path:r.caminho, originalUrl:r.caminho };
    try{ const p = r.h(req, res, () => {}); if(p && typeof p.then === 'function') await p; }
    catch(e){ out.status = 'estourou: ' + String(e.message || e).slice(0,80); }
    ok('   ' + k + ' → 401 (' + r.modulo + ')', out.status === 401 && tot() === antes,
      out.status + (tot() !== antes ? ' · GRAVOU' : '') + ' ' + JSON.stringify(out.body || '').slice(0,80));
  }
  Object.keys(EXCECOES_ROTA).forEach(k => ok('a exceção ' + k + ' ainda existe (' + EXCECOES_ROTA[k] + ')',
    escritas.some(r => r.metodo + ' ' + r.caminho === k)));

  /* ── 1-B. COM LOGIN, O ID ENTRA ─────────────────────────────────────── */
  console.log('\n── 1-B. com login, quem fez entra pelo id ──');
  const rota = k => (escritas.find(r => r.metodo + ' ' + r.caminho === k) || {}).h;
  const chamar = (k, body, usuario, params) => new Promise(r => {
    const out = { status:200 };
    const res = { status(c){ out.status = c; res.statusCode = c; return res; }, json(o){ out.body = o; r(out); return res; },
      send(o){ out.body = o; r(out); return res; }, setHeader(){ return res; } };
    rota(k)({ body:body||{}, params:params||{}, query:{}, headers:{}, socket:{}, usuario }, res, () => {});
  });
  const RITA = { id:42, nome:'Rita', areas:['admin'] };
  db.prepare("INSERT OR IGNORE INTO usuarios (id,nome,salt,pin_hash,areas,ativo,pin_curto,nivel) VALUES (42,'Rita','x','x','admin',1,0,'admin_geral')").run();
  let r = await chamar('POST /api/cores', { codigo:'VERDE', nome:'Verde' }, RITA);
  const aud = db.prepare("SELECT * FROM auditoria WHERE categoria='cadastro' ORDER BY id DESC").get() || {};
  ok('o cadastro sem coluna de autor vira linha na auditoria, com o id', r.status === 200 && aud.usuario_id === 42 && aud.usuario_nome === 'Rita'
    && aud.acao === 'POST /api/cores' && aud.alvo === 'VERDE', r.status + ' ' + JSON.stringify(aud));
  const nAud = db.prepare('SELECT COUNT(*) n FROM auditoria').get().n;
  r = await chamar('POST /api/cores', { codigo:'' }, RITA);
  ok('   a escrita recusada não vira linha', r.status === 400 && db.prepare('SELECT COUNT(*) n FROM auditoria').get().n === nAud, r.status);
  const vse = db.prepare("INSERT INTO venda_sem_etiqueta (venda,sku) VALUES ('2000000000000001','BK140140BEGE')").run().lastInsertRowid;
  r = await chamar('POST /api/semetiqueta/resolver', { id:vse, resolucao:'cancelada', motivo:'cancelada no ML' }, RITA);
  const v1 = db.prepare('SELECT * FROM venda_sem_etiqueta WHERE id=?').get(vse);
  ok('a venda sem etiqueta resolvida grava o resolvida_por_id', v1.resolvida_por_id === 42 && v1.resolvida_por === 'Rita', r.status + ' ' + JSON.stringify(r.body) + ' ' + v1.resolvida_por_id);
  const lb = db.prepare("INSERT INTO lote (codigo,estagio,bloqueio) VALUES ('BK140140BEGE','bloqueado','modalidade: formato novo')").run().lastInsertRowid;
  db.prepare("INSERT OR IGNORE INTO skus (codigo) VALUES ('BK140140BEGE')").run();
  r = await chamar('POST /api/modalidade/resolver', { id:lb, modalidade:'coleta' }, RITA);
  const l1 = db.prepare('SELECT * FROM lote WHERE id=?').get(lb);
  ok('o bloqueado decidido grava o resolvido_por_id', l1.resolvido_por_id === 42 && l1.resolvido_por === 'Rita', r.status + ' ' + JSON.stringify(r.body) + ' ' + l1.resolvido_por_id);
  const cols = t => db.prepare(`SELECT name FROM pragma_table_info('${t}')`).all().map(c => c.name);
  [['lote','resolvido_por_id'],['venda_sem_etiqueta','resolvida_por_id'],['pdf_conta_aberta','resolvida_por_id'],['correcao','desfeita_por_id'],
   ['oferta','atualizado_por_id'],['preco_historico','usuario_id'],['custo_sku_historico','usuario_id'],['pedido_compra','criado_por_id'],
   ['pedido_compra','pago_por_id'],['recebimento','recebido_por_id']]
    .forEach(([t,c]) => ok('banco novo: ' + t + '.' + c, cols(t).indexOf(c) >= 0, cols(t).slice(-3).join(',')));

  /* ── 1-C. O BANCO ANTIGO GANHA AS COLUNAS PELO ALTER, NO FIM (§17) ───── */
  console.log('\n── 1-C. banco antigo: o ALTER acrescenta o id no fim ──');
  const Database = require('better-sqlite3');
  const velho = new Database(path.join(tmp, 'velho.db'));
  velho.exec(`CREATE TABLE skus (codigo TEXT PRIMARY KEY);
    CREATE TABLE oferta (id INTEGER PRIMARY KEY, fornecedor_id INTEGER, componente_id INTEGER, sku TEXT, embalagem TEXT, atualizado_por TEXT, ativo INTEGER);
    CREATE TABLE preco_historico (id INTEGER PRIMARY KEY, oferta_id INTEGER, usuario_nome TEXT, data TEXT);
    CREATE TABLE custo_sku_historico (id INTEGER PRIMARY KEY, sku TEXT, usuario_nome TEXT, data TEXT);
    CREATE TABLE pedido_compra (id INTEGER PRIMARY KEY, criado_por TEXT, pago_por TEXT, teste INTEGER);
    CREATE TABLE recebimento (id INTEGER PRIMARY KEY, recebido_por TEXT, teste INTEGER);
    CREATE TABLE correcao (id INTEGER PRIMARY KEY AUTOINCREMENT, acao TEXT, alvo_tipo TEXT, alvo_id INTEGER, desfeita_por TEXT, teste INTEGER DEFAULT 0);`);
  require('./compras_schema').garantirSchemaCompras(velho);
  require('./correcoes').garantirSchema(velho);
  const cv = t => velho.prepare(`SELECT name FROM pragma_table_info('${t}')`).all().map(c => c.name);
  [['oferta',['atualizado_por_id']],['preco_historico',['usuario_id']],['custo_sku_historico',['usuario_id']],
   ['pedido_compra',['criado_por_id','pago_por_id','canal','loja','numero_externo','comprado_em','comprado_por','comprado_por_id','aprovacao','aprovado_por','aprovado_por_id','aprovado_em','motivo_aprovacao','rapida']],['recebimento',['recebido_por_id']],['correcao',['desfeita_por_id']]]
    .forEach(([t,cs]) => ok('banco antigo: ' + t + ' termina em ' + cs.join(','), cv(t).slice(-cs.length).join(',') === cs.join(','), cv(t).slice(-3).join(',')));
  /* e a ordem do banco novo é a mesma (o id no fim de cada uma) */
  [['oferta',['atualizado_por_id']],['pedido_compra',['criado_por_id','pago_por_id','canal','loja','numero_externo','comprado_em','comprado_por','comprado_por_id','aprovacao','aprovado_por','aprovado_por_id','aprovado_em','motivo_aprovacao','rapida']],['recebimento',['recebido_por_id']],['correcao',['desfeita_por_id']],
   ['lote',['resolvido_por_id','horario_id']],['venda_sem_etiqueta',['resolvida_por_id']],['pdf_conta_aberta',['resolvida_por_id']]]
    .forEach(([t,cs]) => ok('banco novo: ' + t + ' termina em ' + cs.join(',') + ' (a mesma ordem do ALTER)', cols(t).slice(-cs.length).join(',') === cs.join(','), cols(t).slice(-3).join(',')));
  velho.close();
  const velho2 = new Database(path.join(tmp, 'velho2.db'));
  velho2.exec(`CREATE TABLE skus (codigo TEXT PRIMARY KEY, descricao TEXT DEFAULT '', cor TEXT DEFAULT '', estoque INTEGER DEFAULT 0, alvo INTEGER DEFAULT 0);
    CREATE TABLE config (chave TEXT PRIMARY KEY, valor TEXT);
    CREATE TABLE venda_sem_etiqueta (id INTEGER PRIMARY KEY AUTOINCREMENT, venda TEXT, packId TEXT, sku TEXT, qtd INTEGER DEFAULT 1, pdf TEXT,
      visto_em TEXT, ultimo_visto_em TEXT, resolvida_em TEXT, resolucao TEXT, resolvida_por TEXT, motivo TEXT, teste INTEGER DEFAULT 0);
    CREATE TABLE pdf_conta_aberta (id INTEGER PRIMARY KEY AUTOINCREMENT, hash TEXT, pdf TEXT, nfs TEXT, etiquetas INTEGER, folha INTEGER, sistema INTEGER, resto INTEGER,
      visto_em TEXT, ultimo_visto_em TEXT, resolvida_em TEXT, resolucao TEXT, resolvida_por TEXT, motivo TEXT, teste INTEGER DEFAULT 0);`);
  /* o lote de antes da fase 7: o CREATE de hoje sem a coluna nova */
  const createLote = (fs.readFileSync(path.join(__dirname, 'exp_route.js'), 'utf8').match(/db\.exec\("(CREATE TABLE IF NOT EXISTS lote \([^"]+)"\)/) || [])[1] || '';
  /* desde 05/11/2026 o lote termina no horario_id (HORARIOS-DE-COLETA), que entra
     por ALTER depois do resolvido_por_id: o banco antigo ganha os dois, nesta ordem */
  ok('achei o CREATE do lote no exp_route.js', /resolvido_por_id INTEGER, horario_id INTEGER\)/.test(createLote));
  velho2.exec(createLote.replace(', resolvido_por_id INTEGER, horario_id INTEGER)', ')'));
  require('./estoque_dominio').garantirSchema(velho2);
  require('./exp_route')({ locals:{}, use(){}, get(){}, post(){}, put(){}, patch(){}, delete(){} }, velho2);
  const cv2 = t => velho2.prepare(`SELECT name FROM pragma_table_info('${t}')`).all().map(c => c.name);
  ['venda_sem_etiqueta','pdf_conta_aberta'].forEach(t => ok('banco antigo: ' + t + ' termina em resolvida_por_id', cv2(t).slice(-1)[0] === 'resolvida_por_id', cv2(t).slice(-2).join(',')));
  ok('banco antigo: lote ganha o resolvido_por_id (e depois o horario_id) no fim', cv2('lote').slice(-2).join(',') === 'resolvido_por_id,horario_id', cv2('lote').slice(-2).join(','));
  velho2.close();

  /* ── 2. ESTÁTICA ─────────────────────────────────────────────────────── */
  console.log('\n── 2. o texto: o quem.js é o dono de "quem fez" ──');
  const ARQS = fs.readdirSync(__dirname).filter(f => /\.js$/.test(f) && !/^teste_|\.bak|^quem\.js$/.test(f));
  const texto = f => fs.readFileSync(path.join(__dirname, f), 'utf8');
  /* tira os comentários: um comentário que fala de req.usuario.nome não é código */
  const semComentario = s => s.replace(/\/\*[\s\S]*?\*\//g, '').replace(/(^|[^:'"`\\])\/\/[^\n]*/g, '$1');
  const comEscrita = ARQS.filter(f => /\bapp\.(post|put|patch|delete)\s*\(/.test(texto(f)));
  comEscrita.forEach(f => ok('   ' + f + ' carrega o quem.js', /require\(\s*['"]\.\/quem['"]\s*\)/.test(texto(f))));
  /* A PORTA DO MODULO: rota nova escrita amanha num modulo de rotas ja nasce
     passando pelo quem.js. O auth.js e o server.js chamam o exigir rota a
     rota (o portao do login nao pode exigir login). */
  const SEM_PORTAO = { 'auth.js':'é o próprio login', 'server.js':'chama o exigir na rota de escrita que tiver (caso abaixo; hoje não tem nenhuma)' };
  comEscrita.filter(f => !SEM_PORTAO[f]).forEach(f => ok('   ' + f + ' passa as escritas pela porta do módulo (QUEM.portao)',
    /app\s*=\s*QUEM\.portao\(\s*app\b/.test(semComentario(texto(f)))));

  /* ler o nome de quem fez direto do req.usuario: a autoria tem um dono só */
  const EXCECOES_TEXTO = {
    'acesso.js':    'a porta da auditoria (`auditar`) e a do controle de acesso: o usuário da sessão É o assunto ali',
    'auth.js':      'é quem PÕE o req.usuario'
  };
  const PADROES = [/req\.usuario\s*(?:&&\s*req\.usuario\s*)?\.\s*nome\b/, /\(\s*req\.usuario\s*\|\|\s*\{\s*\}\s*\)\s*\.\s*nome\b/,
    /\(\s*req\s*&&\s*req\.usuario\s*\)\s*\|\|/];
  ARQS.filter(f => !EXCECOES_TEXTO[f]).forEach(f => {
    const s = semComentario(texto(f));
    const achou = PADROES.map(p => (s.match(p) || [])[0]).filter(Boolean);
    /* a variável que guarda o req.usuario inteiro e depois lê o .nome */
    const vars = [...s.matchAll(/(?:const|let|var)\s+(\w+)\s*=\s*\(?\s*req\.usuario\s*(?:\|\|\s*\{\s*\}\s*)?\)?\s*[;,]/g)].map(m => m[1]);
    vars.forEach(v => { if(new RegExp('\\b' + v + '\\.nome\\b').test(s)) achou.push(v + ' = req.usuario … ' + v + '.nome'); });
    /* passar o req.usuario inteiro para o dominio gravar quem fez (a pessoa vai pelo QUEM.pessoa) */
    const passa = s.match(/\w+\.\w+\(\s*db\b[^;\n]*\breq\.usuario\b/);
    if(passa) achou.push(passa[0].slice(0,80));
    if(achou.length || /req\.usuario/.test(s)) ok('   ' + f + ' não lê o nome de quem fez do req.usuario', achou.length === 0, achou.join(' | '));
  });
  Object.keys(EXCECOES_TEXTO).forEach(f => ok('a exceção de texto ' + f + ' ainda lê o req.usuario', /req\.usuario/.test(texto(f))));

  /* o server.js não sobe em teste nenhum: a rota dele é conferida pelo texto */
  const srv = semComentario(texto('server.js'));
  const escritasSrv = [...srv.matchAll(/app\.(post|put|patch|delete)\(\s*'([^']+)'\s*,\s*\(req,\s*res\)\s*=>\s*\{([^]*?)\n\}\);/g)];
  /* a única escrita do server.js era o POST /api/producao (lançar à mão), que
     saiu em 05/11/2026 (spec PRODUCAO-SO-DO-PDF). Escrita nova ali tem de
     passar pelo exigir (casos abaixo); e nenhuma rota de escrita fica fora da
     conta por estar escrita de outro jeito. */
  const escritasSoltas = (srv.match(/app\.(post|put|patch|delete)\(/g) || []).length;
  ok('o server.js não tem escrita fora da conta', escritasSoltas === escritasSrv.length, escritasSoltas + ' × ' + escritasSrv.length);
  escritasSrv.forEach(m => ok('   server.js ' + m[1].toUpperCase() + ' ' + m[2] + ' passa pelo quem.js',
    /QUEM\.exigir\(req,\s*res\)/.test(m[3].split('\n').slice(0,3).join('\n'))));

  /* o sob medida: uma porta só, e ela grava o id */
  const reg = texto(path.join('tecido', 'nucleo', 'registro.js'));
  ok('a porta do sob medida grava o usuario_id na auditoria', /INSERT INTO auditoria\s*\(\s*usuario_id\s*,\s*usuario_nome/.test(reg));
  ok('   e recusa quem não tem permissão antes de rodar (sem login, nada roda)', /if\(!pode\(u,r\.permissao\)\)/.test(reg));

  console.log('\n' + (falhas ? falhas + ' FALHA(S) em ' + casos + ' casos' : 'TUDO OK — ' + casos + ' casos'));
  try{ db.close(); }catch(e){}
  fs.rmSync(tmp, { recursive:true, force:true });
  process.exit(falhas ? 1 : 0);
})().catch(e => { console.log('FALHOU — o teste estourou: ' + (e && e.stack || e)); process.exit(1); });

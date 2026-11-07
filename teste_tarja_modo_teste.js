#!/usr/bin/env node
/* A TARJA DO MODO TESTE APARECE PARA TODO MUNDO (CONSERTO de 07/11/2026).
 *
 *   node teste_tarja_modo_teste.js
 *
 * O CLAUDE.md §11 diz que a tarja amarela do modo teste aparece em TODAS as
 * telas, pelo nav.js. Mas o nav.js perguntava ao GET /api/teste, que exige
 * `teste.operar` (o painel do modo teste, com as contagens de cada tabela).
 * Quem nao tem a chave — o operador da bancada, o Supervisor — levava 403 e a
 * tarja nunca acendia: com o modo teste ligado, a bancada trabalhava sem saber
 * que nada ali conta como producao. Achado pelo testador-tela (07/11/2026).
 *
 * O conserto: GET /api/teste/ativo, para quem esta logado, devolvendo SO
 * `{ativo}` — nada das contagens. O resto do /api/teste continua de
 * `teste.operar`.
 *
 * ⚠️ ESCRITO ANTES DO CODIGO (§0, risco vermelho: acesso). Sobe o servidor de
 * verdade numa pasta temporaria (PCP_DIR) e numa porta livre (PCP_PORTA) —
 * NUNCA na 3010.
 */
const fs = require('fs'), os = require('os'), path = require('path'), net = require('net'), crypto = require('crypto');
const { spawn } = require('child_process');
const Database = require('better-sqlite3');

let falhas = 0, casos = 0;
const ok = (n, c, extra) => { casos++;
  if(c) console.log('ok      ' + n);
  else { falhas++; console.log('FALHOU  ' + n + (extra !== undefined ? '   ' + (typeof extra === 'string' ? extra : JSON.stringify(extra)) : '')); } };

const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'pcp-tarja-teste-'));
const segredo = path.join(__dirname, '.session_secret');
const segredoExistia = fs.existsSync(segredo);
const espera = ms => new Promise(r => setTimeout(r, ms));
function portaLivre(){ return new Promise(ok => { const s = net.createServer(); s.listen(0, () => { const p = s.address().port; s.close(() => ok(p)); }); }); }

let srv = null, base = '';
process.on('exit', () => {
  if(srv && srv.exitCode == null) srv.kill('SIGTERM');
  try{ fs.rmSync(tmp, { recursive:true, force:true }); }catch(e){}
  if(!segredoExistia){ try{ fs.unlinkSync(segredo); }catch(e){} }
});

const COOKIE = {};
async function req(quem, metodo, url, corpo){
  const h = { 'Content-Type':'application/json' };
  if(quem && COOKIE[quem]) h.Cookie = COOKIE[quem];
  const r = await fetch(base + url, { method:metodo, headers:h, body: corpo ? JSON.stringify(corpo) : undefined, redirect:'manual' });
  let d = null; const t = await r.text(); try{ d = JSON.parse(t); }catch(e){ d = { _texto:t.slice(0, 120) }; }
  return { st:r.status, d };
}

(async () => {
  const porta = await portaLivre();
  base = 'http://127.0.0.1:' + porta;
  srv = spawn(process.execPath, ['server.js'], { cwd:__dirname, stdio:['ignore','pipe','pipe'],
    env: Object.assign({}, process.env, { PCP_DIR:tmp, PCP_PORTA:String(porta) }) });
  let log = ''; srv.stdout.on('data', d => log += d); srv.stderr.on('data', d => log += d);
  let subiu = false;
  for(let i = 0; i < 120 && !subiu; i++){
    await espera(250);
    try{ subiu = (await fetch(base + '/login')).status === 200; }catch(e){}
    if(srv.exitCode != null) break;
  }
  ok('o servidor subiu numa pasta e porta temporarias', subiu, log.slice(-1500));
  if(!subiu) process.exit(1);

  /* as pessoas: um operador da bancada, um Supervisor e o Admin Geral */
  const db = new Database(path.join(tmp, 'dados.db')); db.pragma('busy_timeout = 5000');
  const setor = nome => db.prepare('SELECT id FROM setores WHERE nome=?').get(nome).id;
  const ID = {};
  function pessoa(nome, setores, nivel){
    const salt = crypto.randomBytes(16).toString('hex');
    const h = crypto.scryptSync('246810', salt, 32).toString('hex');
    const id = db.prepare('INSERT INTO usuarios (nome,salt,pin_hash,areas,pin_curto,nivel) VALUES (?,?,?,?,0,?)')
      .run(nome, salt, h, '', nivel).lastInsertRowid;
    setores.forEach(s => db.prepare('INSERT INTO usuario_setor (usuario_id,setor_id) VALUES (?,?)').run(id, setor(s)));
    ID[nome] = id;
  }
  pessoa('Op', ['Operador / Revisão'], 'operacao');
  pessoa('Sup', ['Supervisor'], 'supervisor');
  pessoa('Lucas', ['Admin Geral'], 'admin_geral');
  for(const n of Object.keys(ID)){
    const r = await fetch(base + '/api/auth/login', { method:'POST', headers:{'Content-Type':'application/json'}, body:JSON.stringify({ id:ID[n], pin:'246810' }) });
    COOKIE[n] = (r.headers.get('set-cookie') || '').split(';')[0];
  }
  ok('as tres pessoas entraram', Object.values(COOKIE).every(c => /^sess=/.test(c)));

  console.log('\n── com o modo teste DESLIGADO ──');
  let r = await req('Op', 'GET', '/api/teste/ativo');
  ok('o operador pergunta e recebe 200', r.st === 200, r);
  ok('e a resposta diz que esta desligado', r.d && r.d.ativo === false, r.d);

  console.log('\n── o Admin Geral liga o modo teste ──');
  r = await req('Lucas', 'POST', '/api/teste/ligar', {});
  ok('ligou', r.st === 200, r);

  for(const n of ['Op', 'Sup', 'Lucas']){
    r = await req(n, 'GET', '/api/teste/ativo');
    ok(n + ' fica sabendo que o modo teste esta LIGADO (a tarja acende)', r.st === 200 && r.d && r.d.ativo === true, r);
  }
  r = await req('Op', 'GET', '/api/teste/ativo');
  ok('a resposta traz SO o ativo — nada das contagens do painel', r.d && Object.keys(r.d).join(',') === 'ativo', r.d);

  console.log('\n── o resto continua fechado ──');
  r = await req(null, 'GET', '/api/teste/ativo');
  ok('sem login: 401', r.st === 401, r);
  r = await req('Op', 'GET', '/api/teste');
  ok('o painel do modo teste (com as contagens) continua so de teste.operar: o operador leva 403', r.st === 403, r);
  r = await req('Op', 'POST', '/api/teste/limpar', {});
  ok('o operador nao apaga o teste', r.st === 403, r);
  r = await req('Op', 'POST', '/api/teste/ativo', {});
  ok('o /ativo nao vira porta de escrita: POST nele pelo operador e barrado pela permissao (403, e nao so 404)', r.st === 403, r);
  ok('o modo teste continua ligado depois das tentativas do operador',
    (await req('Lucas', 'GET', '/api/teste/ativo')).d.ativo === true);

  console.log('\n── o nav.js pergunta pela porta certa ──');
  const nav = fs.readFileSync(path.join(__dirname, 'public', 'nav.js'), 'utf8');
  ok('a tarja pergunta ao /api/teste/ativo', /fetch\(\s*['"]\/api\/teste\/ativo['"]/.test(nav));
  ok('e nao mais ao painel /api/teste', !/fetch\(\s*['"]\/api\/teste['"]/.test(nav));

  console.log('\n── desligado de novo ──');
  r = await req('Lucas', 'POST', '/api/teste/limpar', {});
  ok('o Admin Geral apaga o teste', r.st === 200, r);
  r = await req('Op', 'GET', '/api/teste/ativo');
  ok('o operador volta a ver desligado (a tarja some)', r.st === 200 && r.d.ativo === false, r);

  db.close();
  console.log('\n' + (falhas ? falhas + ' de ' + casos + ' casos FALHARAM' : 'todos os ' + casos + ' casos passaram'));
  process.exit(falhas ? 1 : 0);
})().catch(e => { console.error(e); process.exit(1); });

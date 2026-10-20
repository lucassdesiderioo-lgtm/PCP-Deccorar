#!/usr/bin/env node
/* teste_login.js — o login por PIN e a sessao (CLAUDE.md §10).
 *
 *   node teste_login.js
 *
 * O que este arquivo trava, no auth.js:
 *   - o PIN nao e guardado: o banco tem salt proprio e o scrypt do PIN;
 *   - PIN certo entra e devolve o cookie de sessao (HttpOnly); PIN errado,
 *     pessoa inexistente e pessoa BLOQUEADA no cadastro nao entram;
 *   - 5 PINs errados seguram a pessoa por 1 minuto — inclusive com o PIN certo,
 *     senao a trava so atrasaria quem chuta — e a trava e POR PESSOA;
 *   - passado o minuto, entra de novo; e o PIN certo zera a conta de erros;
 *   - o cookie e assinado: mudar o id dentro dele nao vira outra pessoa, e
 *     cortar a assinatura derruba a sessao;
 *   - quem e bloqueado no cadastro perde a sessao que ja tinha;
 *   - sem sessao, API responde 401 e tela manda para o login (302).
 *
 * Ate 20/10/2026 nenhum teste do projeto passava pelo POST /api/auth/login.
 *
 * Sobe um Express de verdade numa porta livre, com banco temporario. O relogio
 * e trocado (Date.now) para o minuto da trava passar sem esperar.
 *
 * ⚠️ O auth.js le (ou cria) o `.session_secret` na pasta do projeto. Se ele nao
 * existia antes do teste, o teste o apaga no fim — nao deixa arquivo novo.
 */
const Database = require('better-sqlite3');
const express = require('express');
const crypto = require('crypto');
const fs = require('fs'), os = require('os'), path = require('path');

let n = 0, falhas = 0;
function ok(desc, cond, detalhe){
  n++;
  if(cond) console.log('  ok  ' + n + ' — ' + desc);
  else { falhas++; console.log('  FALHOU ' + n + ' — ' + desc + (detalhe ? '\n         ' + detalhe : '')); }
}
function eq(desc, achado, esperado){
  ok(desc, achado === esperado, 'esperado ' + JSON.stringify(esperado) + ', veio ' + JSON.stringify(achado));
}

const SEGREDO = path.join(__dirname, '.session_secret');
const segredoExistia = fs.existsSync(SEGREDO);

const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'pcp-login-'));
const db = new Database(path.join(tmp, 't.db'));

/* O relogio do teste. O auth.js mede a trava com Date.now(). */
const agoraReal = Date.now;
let desvio = 0;
Date.now = () => agoraReal() + desvio;

const app = express();
app.use(express.json());
require('./auth')(app, db);
app.get('/api/coisa', (req,res) => res.json({ ok:true, quem: req.usuario && req.usuario.nome }));
app.get('/painel', (req,res) => res.send('painel'));

/* Pessoas do teste. O auth.js semeia o Administrador (PIN 1234) no banco vazio;
   as outras entram com o MESMO formato que o auth.js grava (salt + scrypt). */
function pessoa(nome, pin, areas, ativo){
  const salt = crypto.randomBytes(16).toString('hex');
  return db.prepare('INSERT INTO usuarios(nome,salt,pin_hash,areas,ativo) VALUES(?,?,?,?,?)')
    .run(nome, salt, crypto.scryptSync(String(pin), salt, 32).toString('hex'), areas, ativo===0?0:1).lastInsertRowid;
}
const ADMIN = db.prepare("SELECT id FROM usuarios WHERE nome='Administrador'").get().id;
const ANA = pessoa('Ana', '4321', 'painel');
const JOAO = pessoa('Joao', '5555', 'painel');
const SAIU = pessoa('Desligado', '7777', 'painel', 0);

async function main(){
  const srv = app.listen(0);
  await new Promise(r => srv.once('listening', r));
  const base = 'http://127.0.0.1:' + srv.address().port;
  const login = async (id, pin) => {
    const r = await fetch(base + '/api/auth/login', { method:'POST',
      headers:{ 'content-type':'application/json' }, body: JSON.stringify({ id, pin }) });
    return { status: r.status, body: await r.json(), cookie: r.headers.get('set-cookie') || '' };
  };
  const eu = async cookie => (await fetch(base + '/api/auth/eu', { headers: cookie ? { cookie } : {} })).json();
  const sess = setCookie => setCookie.split(';')[0];

  try{
    console.log('\n── 1. o PIN nao e guardado ──');
    const linhas = db.prepare('SELECT salt,pin_hash FROM usuarios').all();
    ok('nenhum PIN aparece em claro no banco', linhas.every(l => !/^(1234|4321|5555|7777)$/.test(l.pin_hash)));
    eq('cada pessoa tem o seu salt', new Set(linhas.map(l => l.salt)).size, linhas.length);
    const adm = db.prepare('SELECT salt,pin_hash FROM usuarios WHERE id=?').get(ADMIN);
    eq('o hash do PIN e o scrypt com o salt da pessoa',
       adm.pin_hash, crypto.scryptSync('1234', adm.salt, 32).toString('hex'));

    console.log('\n── 2. entrar ──');
    let r = await login(ANA, '4321');
    eq('PIN certo entra', r.status, 200);
    eq('e devolve o nome', r.body.nome, 'Ana');
    ok('com o cookie de sessao', /^sess=/.test(r.cookie), r.cookie);
    ok('HttpOnly — o JavaScript da tela nao le a sessao', /HttpOnly/i.test(r.cookie), r.cookie);
    const cAna = sess(r.cookie);
    const e = await eu(cAna);
    eq('a sessao diz quem e', e.logado && e.nome, 'Ana');
    eq('PIN errado nao entra', (await login(ANA, '0000')).status, 401);
    eq('pessoa que nao existe nao entra', (await login(9999, '1234')).status, 401);
    eq('pessoa bloqueada no cadastro nao entra, nem com o PIN certo', (await login(SAIU, '7777')).status, 401);
    eq('PIN como numero tambem entra (o teclado manda texto, mas nao importa)', (await login(JOAO, 5555)).status, 200);

    console.log('\n── 3. 5 PINs errados seguram a pessoa por 1 minuto ──');
    /* A Ana errou uma vez no bloco acima. Um acerto zera a conta. */
    await login(ANA, '4321');
    for(let i=1;i<=4;i++) eq('erro ' + i + ' responde PIN incorreto (401)', (await login(ANA, '0000')).status, 401);
    eq('com 4 erros, o PIN certo ainda entra', (await login(ANA, '4321')).status, 200);
    for(let i=1;i<=5;i++) await login(ANA, '0000');
    r = await login(ANA, '4321');
    eq('com 5 erros, nem o PIN certo entra (429)', r.status, 429);
    ok('e a tela diz para aguardar 1 minuto', /1 minuto/.test(r.body.erro), JSON.stringify(r.body));
    eq('a trava e por pessoa: o Joao continua entrando', (await login(JOAO, '5555')).status, 200);
    desvio += 30 * 1000;
    eq('30 segundos depois, ainda travada', (await login(ANA, '4321')).status, 429);
    desvio += 31 * 1000;
    eq('passado o minuto, o PIN certo entra de novo', (await login(ANA, '4321')).status, 200);
    eq('e o acerto zerou a conta: um erro novo e so 401', (await login(ANA, '0000')).status, 401);
    eq('e o certo seguinte entra', (await login(ANA, '4321')).status, 200);

    console.log('\n── 4. o cookie e assinado ──');
    const valor = decodeURIComponent(cAna.slice(5));
    const [corpo, sig] = [valor.slice(0, valor.lastIndexOf('.')), valor.slice(valor.lastIndexOf('.') + 1)];
    const falso = Buffer.from(JSON.stringify({ id: ADMIN })).toString('base64');
    eq('trocar o id do cookie para o do Administrador nao entra como ele',
       (await eu('sess=' + encodeURIComponent(falso + '.' + sig))).logado, false);
    eq('cookie sem assinatura nao vale', (await eu('sess=' + encodeURIComponent(corpo))).logado, false);
    eq('assinatura trocada nao vale',
       (await eu('sess=' + encodeURIComponent(corpo + '.' + '0'.repeat(sig.length)))).logado, false);
    eq('sem cookie, ninguem', (await eu(null)).logado, false);

    console.log('\n── 5. quem e bloqueado perde a sessao que ja tinha ──');
    const cJoao = sess((await login(JOAO, '5555')).cookie);
    eq('o Joao esta dentro', (await eu(cJoao)).logado, true);
    db.prepare('UPDATE usuarios SET ativo=0 WHERE id=?').run(JOAO);
    eq('bloqueado no cadastro, a mesma sessao deixa de valer', (await eu(cJoao)).logado, false);

    console.log('\n── 6. sem sessao: API 401, tela vai para o login ──');
    let s = await fetch(base + '/api/coisa');
    eq('API sem sessao responde 401', s.status, 401);
    s = await fetch(base + '/painel', { redirect:'manual' });
    eq('tela sem sessao responde 302', s.status, 302);
    ok('para o /login', /\/login/.test(s.headers.get('location') || ''), s.headers.get('location'));
    s = await fetch(base + '/api/coisa', { headers:{ cookie: cAna } });
    eq('com a sessao da Ana, a API responde', s.status, 200);
    eq('e sabe que e ela', (await s.json()).quem, 'Ana');
  } finally {
    srv.close();
  }
}

main().catch(e => { falhas++; console.log('  FALHOU — o teste estourou: ' + (e && e.stack || e)); })
  .finally(() => {
    Date.now = agoraReal;
    db.close(); fs.rmSync(tmp, { recursive:true, force:true });
    if(!segredoExistia) try{ fs.unlinkSync(SEGREDO); }catch(e){}
    console.log('\n' + (n - falhas) + ' ok, ' + falhas + ' falha(s)\n');
    process.exit(falhas ? 1 : 0);
  });

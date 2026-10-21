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
 *   - sem sessao, API responde 401 e tela manda para o login (302);
 *   - PIN de 4 digitos pede troca no USO, inclusive na sessao ja aberta, e a
 *     troca exige o PIN atual; o cadastro so aceita 6 digitos (ACESSOS-UNIFICADOS
 *     fase 5-A, 21/10/2026);
 *   - esqueci meu PIN: quem tem `pessoas.gerenciar` autoriza com o proprio PIN,
 *     nunca para si mesmo, e o PIN dele conta na trava dele (fase 5-A2);
 *   - 1 hora sem uso encerra a sessao; leitura automatica nao renova; a TV e o
 *     quadro do sob medida ficam de fora so para ler (fase 5-A3).
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
app.get('/api/painel', (req,res) => res.json({ ok:true }));
app.get('/setor', (req,res) => res.send('tela de setor'));
app.post('/api/acao', (req,res) => res.json({ ok:true }));
/* O modelo de permissoes (acesso.js) nao sobe neste teste. Para o "Esqueci
   meu PIN" (fase 5-A2) basta a pergunta que o auth.js faz a ele: quem tem
   `pessoas.gerenciar`. O stub responde por id, e guarda o que foi auditado. */
const GERENCIA = new Set();
const AUDITADO = [];
app.locals.acesso = {
  permissoesDe: uid => new Set(GERENCIA.has(+uid) ? ['pessoas.gerenciar'] : []),
  auditar: (req, cat, acao, alvo, det) => AUDITADO.push({ quem: req.usuario && req.usuario.nome, cat, acao, alvo, det })
};

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

    console.log('\n── 7. o PIN de 4 digitos pede troca, inclusive na sessao aberta (fase 5-A) ──');
    /* Todo mundo de hoje tem 4 digitos, e a sessao dura 1 ano: os tablets quase
       nunca passam pelo login. Por isso a troca e cobrada no USO, e nao so no
       login — senao a bancada ficaria um ano com o PIN curto. */
    r = await login(ANA, '4321');
    eq('o PIN de 4 digitos ainda entra', r.status, 200);
    eq('mas a resposta pede a troca', r.body.trocar_pin, true);
    eq('o /api/auth/eu tambem diz que falta trocar', (await eu(cAna)).trocarPin, true);
    s = await fetch(base + '/api/coisa', { headers:{ cookie: cAna } });
    eq('com a sessao ja aberta, a API recusa (403)', s.status, 403);
    eq('dizendo que e para trocar o PIN', (await s.json()).erro, 'trocar_pin');
    s = await fetch(base + '/painel', { headers:{ cookie: cAna }, redirect:'manual' });
    eq('a tela manda para a troca (302)', s.status, 302);
    eq('no /login?trocar=1, levando a tela de volta', s.headers.get('location'), '/login?trocar=1&r=%2Fpainel');
    s = await fetch(base + '/sobmedida/corte', { headers:{ cookie: cAna }, redirect:'manual' });
    ok('vale no sob medida tambem: a tela vai para a troca', /^\/login\?trocar=1/.test(s.headers.get('location') || ''), s.headers.get('location'));
    s = await fetch(base + '/sobmedida/api/eu', { headers:{ cookie: cAna } });
    eq('e a API do sob medida recusa', s.status, 403);

    const trocar = async (cookie, atual, novo) => {
      const q = await fetch(base + '/api/auth/trocar-pin', { method:'POST',
        headers: Object.assign({ 'content-type':'application/json' }, cookie ? { cookie } : {}),
        body: JSON.stringify({ atual, novo }) });
      return { status: q.status, body: await q.json() };
    };
    eq('trocar sem sessao: 401', (await trocar(null, '4321', '246810')).status, 401);
    r = await trocar(cAna, '0000', '246810');
    eq('trocar com o PIN atual errado: 401', r.status, 401);
    eq('e o PIN antigo continua valendo', (await login(ANA, '4321')).status, 200);
    eq('PIN novo de 5 digitos: recusado', (await trocar(cAna, '4321', '24681')).status, 400);
    eq('PIN novo de 7 digitos: recusado', (await trocar(cAna, '4321', '2468101')).status, 400);
    r = await trocar(cAna, '4321', '24681a');
    eq('PIN novo com letra: recusado', r.status, 400);
    ok('e a recusa diz que sao 6 numeros', /6/.test(r.body.erro || ''), JSON.stringify(r.body));
    r = await trocar(cAna, '4321', '246810');
    eq('PIN atual certo e novo de 6 digitos: trocado', r.status, 200);
    eq('o /api/auth/eu deixa de pedir a troca', (await eu(cAna)).trocarPin, false);
    s = await fetch(base + '/api/coisa', { headers:{ cookie: cAna } });
    eq('a MESMA sessao volta a usar a API', s.status, 200);
    eq('e sabe que e ela', (await s.json()).quem, 'Ana');
    eq('o PIN antigo deixou de entrar', (await login(ANA, '4321')).status, 401);
    r = await login(ANA, '246810');
    eq('o novo entra', r.status, 200);
    eq('e nao pede troca', r.body.trocar_pin, false);
    eq('quem ja tem 6 pode trocar de novo', (await trocar(cAna, '246810', '135791')).status, 200);

    /* O PIN atual errado conta na mesma trava do login: senao a troca
       viraria a porta para chutar o PIN de quem deixou o tablet logado. */
    const cBia = sess((await login(pessoa('Bia', '8080', 'painel'), '8080')).cookie);
    for(let i=1;i<=5;i++) await trocar(cBia, '0000', '112233');
    eq('5 PINs atuais errados na troca seguram a pessoa (429)', (await trocar(cBia, '8080', '112233')).status, 429);

    console.log('\n── 8. o cadastro so aceita PIN de 6 digitos ──');
    let cAdm = sess((await login(ADMIN, '1234')).cookie);
    eq('o Administrador da instalacao (1234) tambem cai na troca',
       (await fetch(base + '/api/usuarios', { headers:{ cookie: cAdm } })).status, 403);
    eq('e troca', (await trocar(cAdm, '1234', '975310')).status, 200);
    const usuarios = async body => {
      const q = await fetch(base + '/api/usuarios', { method:'POST',
        headers:{ 'content-type':'application/json', cookie: cAdm }, body: JSON.stringify(body) });
      return { status: q.status, body: await q.json() };
    };
    r = await usuarios({ nome:'Caio', pin:'1234' });
    eq('pessoa nova com PIN de 4: recusada', r.status, 400);
    ok('dizendo que sao 6 numeros', /6/.test(r.body.erro || ''), JSON.stringify(r.body));
    eq('pessoa nova com PIN de 7: recusada', (await usuarios({ nome:'Caio', pin:'1234567' })).status, 400);
    r = await usuarios({ nome:'Caio', pin:'123456' });
    eq('pessoa nova com PIN de 6: criada', r.status, 200);
    const CAIO = r.body.id;
    r = await login(CAIO, '123456');
    eq('ela entra', r.status, 200);
    eq('e nao cai na troca', r.body.trocar_pin, false);
    eq('trocar o PIN de alguem para 4 digitos: recusado', (await usuarios({ id:CAIO, nome:'Caio', pin:'9999' })).status, 400);
    eq('e o PIN dela nao mudou', (await login(CAIO, '123456')).status, 200);
    eq('editar so o nome, sem PIN: continua valendo', (await usuarios({ id:CAIO, nome:'Caio Silva' })).status, 200);
    eq('trocar o PIN do Joao para 6 digitos: aceito', (await usuarios({ id:JOAO, nome:'Joao', pin:'555666', ativo:1 })).status, 200);
    r = await login(JOAO, '555666');
    eq('o Joao entra com o novo', r.status, 200);
    eq('e nao cai na troca', r.body.trocar_pin, false);

    console.log('\n── 9. banco antigo ganha a coluna, e todo mundo nasce marcado ──');
    const dbVelho = new Database(path.join(tmp, 'velho.db'));
    dbVelho.exec("CREATE TABLE usuarios(id INTEGER PRIMARY KEY AUTOINCREMENT, nome TEXT NOT NULL, salt TEXT NOT NULL, pin_hash TEXT NOT NULL, areas TEXT NOT NULL DEFAULT '', ativo INTEGER NOT NULL DEFAULT 1, criado_em TEXT)");
    dbVelho.prepare("INSERT INTO usuarios(nome,salt,pin_hash) VALUES('Velho','s','h')").run();
    require('./auth')(express(), dbVelho);
    const col = dbVelho.prepare("SELECT name FROM pragma_table_info('usuarios') WHERE name='pin_curto'").get();
    ok('a coluna pin_curto existe depois do boot', !!col);
    eq('e quem ja estava la fica marcado para trocar',
       dbVelho.prepare("SELECT pin_curto FROM usuarios WHERE nome='Velho'").get().pin_curto, 1);
    dbVelho.close();

    console.log('\n── 10. esqueci meu PIN: quem gerencia pessoas autoriza com o PROPRIO PIN (fase 5-A2) ──');
    /* Sem senha de recuperacao: ela seria uma chave mestra dita em voz alta
       perto de um tablet. Quem autoriza digita o proprio PIN, na hora, e nao
       fica sabendo o PIN novo. */
    const BETO = pessoa('Beto', '0', 'painel');
    const salt = crypto.randomBytes(16).toString('hex');
    db.prepare('UPDATE usuarios SET salt=?,pin_hash=?,pin_curto=0 WHERE id=?')
      .run(salt, crypto.scryptSync('424242', salt, 32).toString('hex'), BETO);
    GERENCIA.add(ADMIN); GERENCIA.add(BETO);
    let lista = await (await fetch(base + '/api/auth/autorizadores')).json();
    eq('a lista de quem pode autorizar tem os dois que gerenciam pessoas',
       lista.map(x => x.nome).sort().join(','), 'Administrador,Beto');
    eq('e so id e nome', Object.keys(lista[0]).sort().join(','), 'id,nome');
    const recuperar = async body => {
      const q = await fetch(base + '/api/auth/recuperar-pin', { method:'POST',
        headers:{ 'content-type':'application/json' }, body: JSON.stringify(body) });
      return { status: q.status, body: await q.json() };
    };
    r = await recuperar({ id:ANA, autorizador:CAIO, autorizador_pin:'123456' });
    eq('quem nao gerencia pessoas nao autoriza (403)', r.status, 403);
    r = await recuperar({ id:ANA, autorizador:BETO, autorizador_pin:'000000' });
    eq('PIN errado de quem autoriza: 401', r.status, 401);
    r = await recuperar({ id:BETO, autorizador:BETO, autorizador_pin:'424242', novo:'101010' });
    eq('ninguem autoriza a troca do proprio PIN (403)', r.status, 403);
    ok('e a frase diz que e outra pessoa', /outra pessoa/i.test(r.body.erro || ''), JSON.stringify(r.body));
    eq('pessoa que nao existe: 404', (await recuperar({ id:9999, autorizador:BETO, autorizador_pin:'424242' })).status, 404);
    eq('pessoa bloqueada no cadastro: 404', (await recuperar({ id:SAIU, autorizador:BETO, autorizador_pin:'424242' })).status, 404);
    r = await recuperar({ id:ANA, autorizador:BETO, autorizador_pin:'424242' });
    eq('sem o PIN novo, so confere quem autoriza (200)', r.status, 200);
    eq('e responde que esta autorizado', r.body.autorizado, true);
    eq('sem mexer no PIN da Ana', (await login(ANA, '135791')).status, 200);
    eq('PIN novo de 5 digitos: recusado', (await recuperar({ id:ANA, autorizador:BETO, autorizador_pin:'424242', novo:'77788' })).status, 400);
    const antes = AUDITADO.length;
    r = await recuperar({ id:ANA, autorizador:BETO, autorizador_pin:'424242', novo:'777888' });
    eq('autorizado e PIN novo de 6: trocado', r.status, 200);
    eq('a Ana entra com o novo', (await login(ANA, '777888')).status, 200);
    eq('e o antigo deixou de entrar', (await login(ANA, '135791')).status, 401);
    const reg = AUDITADO.slice(antes).find(a => a.acao === 'recuperar_pin');
    ok('a auditoria grava quem autorizou e para quem', !!reg && reg.quem === 'Beto' && reg.alvo === 'Ana', JSON.stringify(AUDITADO.slice(antes)));
    ok('e nao grava o PIN', !JSON.stringify(AUDITADO).includes('777888'));
    /* Quem tinha PIN de 4 sai da recuperacao com o de 6, sem cair na troca. */
    const DORA = pessoa('Dora', '1212', 'painel');
    eq('quem tinha 4 recupera direto para 6', (await recuperar({ id:DORA, autorizador:ADMIN, autorizador_pin:'975310', novo:'343434' })).status, 200);
    eq('e entra sem cair na troca', (await login(DORA, '343434')).body.trocar_pin, false);
    /* O PIN de quem autoriza conta na trava DELE: senao esta rota viraria a
       porta para chutar o PIN do Admin Geral. */
    for(let i=1;i<=5;i++) await recuperar({ id:ANA, autorizador:BETO, autorizador_pin:'999999' });
    eq('5 PINs errados de quem autoriza seguram essa pessoa (429)',
       (await recuperar({ id:ANA, autorizador:BETO, autorizador_pin:'424242' })).status, 429);
    eq('e o login dela tambem', (await login(BETO, '424242')).status, 429);
    desvio += 61 * 1000;
    eq('passado o minuto, volta', (await login(BETO, '424242')).status, 200);
    GERENCIA.clear();
    eq('sem o modelo de permissoes respondendo, ninguem autoriza',
       (await recuperar({ id:ANA, autorizador:BETO, autorizador_pin:'424242' })).status, 403);

    console.log('\n── 11. 1 hora sem uso encerra a sessao (fase 5-A3) ──');
    /* A sessao durava 1 ano: o tablet ficava com o nome da ultima pessoa ate
       alguem tocar em Sair. Agora vale 1 hora desde o ultimo USO. A
       atualizacao automatica das telas (o Carregamento pergunta a cada 4 s)
       NAO conta como uso — senao o tablet nunca sairia. */
    const MIN = 60 * 1000;
    const get = (path, cookie, extra) => fetch(base + path, { redirect:'manual',
      headers: Object.assign(cookie ? { cookie } : {}, extra || {}) });
    const novoCookie = q => { const c = q.headers.get('set-cookie') || ''; return c ? c.split(';')[0] : null; };
    let cCaio = sess((await login(CAIO, '123456')).cookie);
    desvio += 59 * MIN;
    eq('59 minutos depois do login, a sessao vale', (await get('/api/coisa', cCaio)).status, 200);
    let q = await get('/api/coisa', cCaio);
    eq('e a leitura automatica nao renova (sem cookie novo)', novoCookie(q), null);
    desvio += 2 * MIN;
    eq('61 minutos sem uso: a API responde 401', (await get('/api/coisa', cCaio)).status, 401);
    q = await get('/setor', cCaio);
    eq('a tela manda para o login', q.status, 302);
    ok('levando a tela de volta', /^\/login\?r=/.test(q.headers.get('location') || ''), q.headers.get('location'));
    eq('e o /api/auth/eu diz que nao esta logado', (await eu(cCaio)).logado, false);

    cCaio = sess((await login(CAIO, '123456')).cookie);
    desvio += 50 * MIN;
    q = await fetch(base + '/api/auth/ativo', { method:'POST', headers:{ cookie: cCaio } });
    eq('o aviso de uso da tela (toque, bipe) responde 200', q.status, 200);
    let c2 = novoCookie(q);
    ok('e renova a sessao', !!c2);
    desvio += 50 * MIN;
    eq('100 minutos depois do login, mas 50 do ultimo uso: vale', (await get('/api/coisa', c2)).status, 200);
    q = await fetch(base + '/api/acao', { method:'POST', headers:{ cookie: c2 } });
    eq('uma acao (POST) responde', q.status, 200);
    const c3 = novoCookie(q);
    ok('e tambem renova', !!c3);
    desvio += 50 * MIN;
    q = await get('/setor', c3);
    eq('abrir uma tela 50 minutos depois: abre', q.status, 200);
    const c4 = novoCookie(q);
    ok('e renova', !!c4);
    desvio += 50 * MIN;
    eq('e a sessao renovada pela tela segue valendo', (await get('/api/coisa', c4)).status, 200);
    eq('o cookie de antes da renovacao, sozinho, ja venceu', (await get('/api/coisa', c2)).status, 401);
    desvio += 61 * MIN;
    eq('sem uso de novo por 61 minutos: sai', (await get('/api/coisa', c4)).status, 401);
    eq('o aviso de uso com a sessao vencida nao ressuscita ninguem',
       (await fetch(base + '/api/auth/ativo', { method:'POST', headers:{ cookie: c4 } })).status, 401);

    /* A sessao aberta antes desta fase nao tem a hora do ultimo uso: ela vence. */
    const corpoVelho = Buffer.from(JSON.stringify({ id: CAIO })).toString('base64');
    const assinaVelho = crypto.createHmac('sha256', fs.readFileSync(SEGREDO, 'utf8').trim()).update(corpoVelho).digest('hex').slice(0, 32);
    const cVelho = 'sess=' + encodeURIComponent(corpoVelho + '.' + assinaVelho);
    eq('cookie de antes da fase (sem hora de uso) nao vale', (await get('/api/coisa', cVelho)).status, 401);

    console.log('\n── 12. a TV e o quadro do sob medida ficam de fora, so para LER (opcao A) ──');
    const cTv = sess((await login(ANA, '777888')).cookie);   // a Ana tem a area do painel
    desvio += 5 * 60 * MIN;
    eq('5 horas depois, a TV (/painel) abre', (await get('/painel', cTv)).status, 200);
    eq('e o numero dela (/api/painel) responde', (await get('/api/painel', cTv)).status, 200);
    q = await get('/sobmedida/kanban', cTv);
    ok('o quadro do sob medida nao vai para o login', q.status !== 302 && q.status !== 401, 'veio ' + q.status);
    q = await get('/sobmedida/api/kanban', cTv);
    ok('nem a leitura dele', q.status !== 401 && q.status !== 302, 'veio ' + q.status);
    ok('nem o arquivo de apoio dele', ![302,401].includes((await get('/sobmedida/nav.js', cTv)).status));
    eq('mas qualquer outra API recusa', (await get('/api/coisa', cTv)).status, 401);
    eq('e qualquer outra tela vai para o login', (await get('/setor', cTv)).status, 302);
    eq('mesmo vindo da TV (Referer /painel)', (await get('/setor', cTv, { referer: base + '/painel' })).status, 302);
    eq('e escrever, nem pela API da TV (POST)',
       (await fetch(base + '/api/painel', { method:'POST', headers:{ cookie: cTv } })).status, 401);
    let euTv = await (await fetch(base + '/api/auth/eu?tela=%2Fpainel', { headers:{ cookie: cTv } })).json();
    eq('o /api/auth/eu diz a tela que e de exibicao', euTv.exibicao, true);
    euTv = await (await fetch(base + '/api/auth/eu?tela=%2Fsetor', { headers:{ cookie: cTv } })).json();
    eq('e a que nao e', euTv.exibicao, false);
    eq('e diz o tempo sem uso, em minutos', euTv.inativoMin, 60);
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

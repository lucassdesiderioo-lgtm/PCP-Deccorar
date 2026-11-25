#!/usr/bin/env node
/* teste_mesa_ir_tela.js — o clique da 204 Pendências que leva à 205 Correções
 * chega lá com o pedido feito (CONSERTO de 25/11/2026).
 *
 *   node teste_mesa_ir_tela.js
 *
 * O defeito: desde que o Admin virou telas (04/11/2026), o "ir para a aba
 * Correções" da 204 TROCA DE PÁGINA, e o segundo passo do clique ("abrir o
 * quadro Fechar vencidos", "abrir o volume #4861") rodava na página que estava
 * sendo deixada e se perdia. A 205 abria vazia, sem o botão do bloco: só dava
 * para buscar volume a volume.
 *
 *   M1  "Fechar vencidos em bloco…" na 204 abre a 205 com o quadro e a data vazia
 *   M2  "Fechar conferências antigas em bloco…" idem
 *   M3  o clique num volume (e numa linha velha da fila) abre a 205 com ele
 *   M4  nenhum erro de script
 *
 * NAO sobe o server.js: monta um Express com o acesso de verdade (acesso.js
 * num banco temporario) e o admin_telas.js; a API da Mesa responde dados
 * fixos. Sem Playwright/Chromium diz "PULADO" e sai sem falhar.
 */
const fs = require('fs'), os = require('os'), path = require('path');
let chromium;
try { chromium = require('playwright').chromium; }
catch(e){ console.log('PULADO: sem Playwright neste computador — a tela NÃO foi conferida.'); process.exit(0); }

const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'pcp-mesair-'));
process.env.PCP_DIR = tmp;
const Database = require('better-sqlite3');
const express = require('express');

let n = 0, falhas = 0;
function ok(desc, cond, detalhe){ n++;
  if(cond) console.log('  ok  ' + n + ' — ' + desc);
  else { falhas++; console.log('  FALHOU ' + n + ' — ' + desc + (detalhe !== undefined ? '\n         ' + String(typeof detalhe === 'string' ? detalhe : JSON.stringify(detalhe)).slice(0, 600) : '')); } }
const secao = t => console.log('\n── ' + t + ' ──');

const db = new Database(path.join(tmp, 'p.db'));
db.exec(`CREATE TABLE usuarios (id INTEGER PRIMARY KEY AUTOINCREMENT, nome TEXT, pin_hash TEXT, salt TEXT, areas TEXT DEFAULT '', ativo INTEGER DEFAULT 1, pin_curto INTEGER DEFAULT 0);
  CREATE TABLE config (chave TEXT PRIMARY KEY, valor TEXT);
  INSERT INTO config (chave,valor) VALUES ('migracao_areas_fase1','1');`);
const app = express();
app.use(express.json());
app.use((req, res, next) => {
  const m = /(?:^|;\s*)quem=(\d+)/.exec(req.headers.cookie || '');
  if(m){ const u = db.prepare('SELECT id,nome FROM usuarios WHERE id=?').get(+m[1]); if(u) req.usuario = { id:u.id, nome:u.nome }; }
  next();
});
const log = console.log; console.log = () => {};
try{ require('./acesso')(app, db); } finally { console.log = log; }
const AC = app.locals.acesso;
const sid = nome => (db.prepare('SELECT id FROM setores WHERE nome=?').get(nome) || {}).id;
const LUCAS = db.prepare("INSERT INTO usuarios (nome,pin_hash,salt) VALUES ('Lucas Geral','x','y')").run().lastInsertRowid;
db.prepare('INSERT INTO usuario_setor (usuario_id,setor_id) VALUES (?,?)').run(LUCAS, sid('Admin Geral'));
db.prepare("DELETE FROM config WHERE chave='nivel_pessoa_1'").run(); AC.migrarNiveis(); AC.sincronizarAreas(LUCAS);

app.get('/api/auth/eu', (req, res) => res.json(req.usuario ? { logado:true, nome:req.usuario.nome, areas:['admin'], destino:{} } : { logado:false }));
app.get('/api/teste/ativo', (req, res) => res.json({ ativo:false }));
const venc = [
  { id:4861, codigo:'SOBMEDIDA', buyer:'Élen Regina', nf:'9941', despachar_em:'2026-11-16', data:'2026-11-16' },
  { id:5412, codigo:'SOBMEDIDA', buyer:'Adriano Fernandes', nf:'10436', despachar_em:'2026-11-23', data:'2026-11-23' }];
const conf = [{ id:6001, codigo:'BK140140BEGE', buyer:'Ana', nf:'1', embalado_em:'2026-11-20 10:00:00', data:'2026-11-20' }];
app.get('/api/correcao/passivo', (req, res) => res.json({ fantasmas:{n:0,itens:[]}, canceladas:{n:0,itens:[]},
  vencidos:{ n:venc.length, itens:venc }, futuras:{n:0,itens:[]}, fila:{ n:1, itens:[{ id:77, codigo:'BK140140BEGE', modo:'estoque', revisado_em:'2026-09-01 10:00:00' }] }, conferencias:{ n:conf.length, itens:conf } }));
app.get('/api/correcao/historico', (req, res) => res.json([]));
app.get('/api/correcao/lote/:id', (req, res) => res.json({ tipo:'lote', id:+req.params.id,
  volume:Object.assign({ estagio:'pendente' }, venc.find(v => v.id === +req.params.id) || { id:+req.params.id }),
  pecas:[], historia:[], acoes:[] }));
app.get('/api/correcao/fila/:id', (req, res) => res.json({ tipo:'fila', id:+req.params.id,
  fila:{ id:+req.params.id, codigo:'BK140140BEGE', situacao:'aguardando', modo:'estoque', revisado_em:'2026-09-01' }, historia:[], acoes:[] }));
require('./admin_telas')(app, db);
app.use(express.static(path.join(__dirname, 'public'), { index:false }));
app.use('/api', (req, res) => res.json([]));

const srv = app.listen(0, async () => {
  const B = 'http://127.0.0.1:' + srv.address().port;
  let b;
  try{ b = await chromium.launch(); }
  catch(e){
    const exe = process.env.PCP_CHROMIUM || (fs.existsSync('/opt/pw-browsers/chromium') ? '/opt/pw-browsers/chromium' : null);
    try{ if(!exe) throw e; b = await chromium.launch({ executablePath: exe }); }
    catch(e2){ console.log('PULADO: sem Chromium neste computador — a tela NÃO foi conferida.'); srv.close(); process.exit(0); }
  }
  const erros = [];
  async function abrir(url){
    const ctx = await b.newContext({ viewport:{ width:1440, height:1000 } });
    await ctx.addCookies([{ name:'quem', value:String(LUCAS), url:B }]);
    const p = await ctx.newPage();
    p.on('pageerror', e => erros.push(e.message + ' @ ' + String(e.stack||'').split('\n').slice(1,3).join(' ')));
    await p.goto(B + url); await p.waitForTimeout(900);
    return { p, ctx };
  }
  const naCorrecoes = p => /\/admin\/correcoes/.test(p.url());
  try{
    secao('M1. "Fechar vencidos em bloco…" leva à 205 com o quadro aberto');
    let A = await abrir('/admin/pendencias');
    await A.p.click('#corPassivo summary:has-text("vencidos")');
    await Promise.all([A.p.waitForURL(/\/admin\/correcoes/, { timeout:5000 }).catch(() => {}),
      A.p.click('button:has-text("Fechar vencidos em bloco")')]);
    await A.p.waitForTimeout(1200);
    ok('a página foi para a 205 Correções', naCorrecoes(A.p), A.p.url());
    const obj1 = (await A.p.textContent('#corObjeto')) || '';
    ok('   e o quadro "Fechar vencidos em bloco" está aberto', /Fechar vencidos em bloco/.test(obj1), obj1);
    ok('   com o campo da data, VAZIO', (await A.p.locator('#corAte').count()) === 1 && (await A.p.inputValue('#corAte')) === '');
    ok('   e o endereço fica limpo (recarregar não reabre um pedido velho)', !/abrir=/.test(A.p.url()), A.p.url());
    await A.ctx.close();

    secao('M2. "Fechar conferências antigas em bloco…" idem');
    A = await abrir('/admin/pendencias');
    await A.p.click('#corPassivo summary:has-text("conferência")');
    await Promise.all([A.p.waitForURL(/\/admin\/correcoes/, { timeout:5000 }).catch(() => {}),
      A.p.click('button:has-text("Fechar conferências antigas em bloco")')]);
    await A.p.waitForTimeout(1200);
    const obj2 = (await A.p.textContent('#corObjeto')) || '';
    ok('a 205 abre com o quadro "Fechar conferências antigas em bloco"', naCorrecoes(A.p) && /Fechar conferências antigas em bloco/.test(obj2), A.p.url() + ' | ' + obj2);
    await A.ctx.close();

    secao('M3. o clique num volume abre a 205 com o volume');
    A = await abrir('/admin/pendencias');
    await A.p.click('#corPassivo summary:has-text("vencidos")');
    await Promise.all([A.p.waitForURL(/\/admin\/correcoes/, { timeout:5000 }).catch(() => {}),
      A.p.click('a.corLink:has-text("#5412")')]);
    await A.p.waitForTimeout(1200);
    const obj3 = (await A.p.textContent('#corObjeto')) || '';
    ok('a 205 abre com o volume #5412', naCorrecoes(A.p) && /5412/.test(obj3), A.p.url() + ' | ' + obj3);
    await A.ctx.close();

    A = await abrir('/admin/pendencias');
    await A.p.click('#corPassivo summary:has-text("fila velha")');
    await Promise.all([A.p.waitForURL(/\/admin\/correcoes/, { timeout:5000 }).catch(() => {}),
      A.p.click('a.corLink:has-text("#77")')]);
    await A.p.waitForTimeout(1200);
    const obj4 = (await A.p.textContent('#corObjeto')) || '';
    ok('e a linha velha da fila abre a 205 com a linha #77', naCorrecoes(A.p) && /Linha #77/.test(obj4), A.p.url() + ' | ' + obj4);
    await A.ctx.close();

    secao('M4. nenhum erro de script');
    ok('nenhum erro de script nas páginas abertas', erros.length === 0, erros.join(' | '));
  }catch(e){ falhas++; console.log('  ERRO no teste: ' + e.message); }
  await b.close(); srv.close();
  try{ db.close(); fs.rmSync(tmp, { recursive:true, force:true }); }catch(e){}
  console.log('\n' + (n - falhas) + ' ok, ' + falhas + ' falha(s)');
  process.exit(falhas ? 1 : 0);
});

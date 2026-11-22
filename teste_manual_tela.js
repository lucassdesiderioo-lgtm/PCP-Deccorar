#!/usr/bin/env node
/* teste_manual_tela.js — a 907 Manual e o "?" de toda tela num navegador de
 * verdade (spec MANUAL-DO-SISTEMA, §8.1 D, fase 1, 21/11/2026).
 *
 *   node teste_manual_tela.js
 *
 * NAO sobe o server.js (a porta 3010 e fixa e, no servidor, bateria na
 * producao): monta um Express so com o acesso de verdade (acesso.js, num banco
 * temporario, com as pessoas do perfis_acesso.js), o /api/telas/minhas
 * (admin_telas.js), as rotas do manual e as telas do public/. O resto da API
 * responde `{}` — as telas da bancada pedem suas listas e seguem vazias.
 *
 *   D1  a 907 abre em "Minhas telas"; "Todas as telas" so com manual.ver_todas
 *   D2  a busca acha por tela, botao, palavra e termo — so no que a pessoa alcanca
 *   D3  tela que a pessoa nao opera: so nome, modulo e nivel
 *   D4  a ficha em rascunho: a tarja, e mesmo assim o fluxo gerado e as acoes
 *   D5  o "?" aparece para quem tem manual.ler e nao para quem nao tem
 *   D6  o "?" abre a ficha num painel na MESMA pagina, e fechar devolve o foco ao bipe
 *   D7  abrir e fechar nao mexe no campo de bipe nem no que estava digitado
 *   D8  a 400, 768, 1024 e 1440 px a 907 nao rola de lado; o painel a 768 tambem nao
 *   D9  o painel sobrevive ao redesenho periodico da tela (Conferencia, 4 s)
 *   D10 "O que mudou" mostra as linhas das fichas da pessoa, com data e tela
 *   D11 nenhum erro de script na 907 nem ao abrir o "?" na 101 e na 201
 *
 * Sem Playwright/Chromium diz "PULADO" e sai sem falhar — o CI do GitHub nao
 * tem navegador. Na maquina que tem o Chromium fora do lugar que o Playwright
 * espera, `PCP_CHROMIUM=/caminho/do/chrome` (ou o /opt/pw-browsers/chromium).
 *
 * O sob medida nao entra aqui: as telas 6xx sobem pelo tecido/montar.js, com
 * portao proprio; o "?" delas usa o MESMO arquivo e a MESMA rota, cobertos
 * abaixo e no teste_manual.js (C8).
 */
const fs = require('fs'), os = require('os'), path = require('path');
let chromium;
try { chromium = require('playwright').chromium; }
catch(e){ console.log('PULADO: sem Playwright neste computador — a tela NÃO foi conferida.'); process.exit(0); }

const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'pcp-manualtela-'));
process.env.PCP_DIR = tmp;
const Database = require('better-sqlite3');
const express = require('express');

let n = 0, falhas = 0;
function ok(desc, cond, detalhe){ n++;
  if(cond) console.log('  ok  ' + n + ' — ' + desc);
  else { falhas++; console.log('  FALHOU ' + n + ' — ' + desc + (detalhe !== undefined ? '\n         ' + (typeof detalhe === 'string' ? detalhe : JSON.stringify(detalhe)).slice(0, 600) : '')); } }
const secao = t => console.log('\n── ' + t + ' ──');

/* ── o servidor de mentira, com o acesso de verdade ───────────────────── */
const db = new Database(path.join(tmp, 'p.db'));
db.exec(`CREATE TABLE usuarios (id INTEGER PRIMARY KEY AUTOINCREMENT, nome TEXT, pin_hash TEXT, salt TEXT, areas TEXT DEFAULT '', ativo INTEGER DEFAULT 1, pin_curto INTEGER DEFAULT 0);
  CREATE TABLE config (chave TEXT PRIMARY KEY, valor TEXT);
  INSERT INTO config (chave,valor) VALUES ('migracao_areas_fase1','1'),('rev_minimo_seg','15');`);
const app = express();
app.use(express.json());
/* a sessao: o cookie `quem=<id>` diz quem esta logado (o auth.js nao sobe aqui) */
app.use((req, res, next) => {
  const m = /(?:^|;\s*)quem=(\d+)/.exec(req.headers.cookie || '');
  if(m){ const u = db.prepare('SELECT id,nome FROM usuarios WHERE id=?').get(+m[1]); if(u) req.usuario = { id:u.id, nome:u.nome }; }
  next();
});
const log = console.log; console.log = () => {};
try{ require('./acesso')(app, db); } finally { console.log = log; }
const AC = app.locals.acesso;
const sid = nome => (db.prepare('SELECT id FROM setores WHERE nome=?').get(nome) || {}).id;
function pessoa(nome, setores, concede){
  const id = db.prepare("INSERT INTO usuarios (nome,pin_hash,salt) VALUES (?,'x','y')").run(nome).lastInsertRowid;
  setores.forEach(s => db.prepare('INSERT INTO usuario_setor (usuario_id,setor_id) VALUES (?,?)').run(id, sid(s)));
  (concede || []).forEach(c => db.prepare('INSERT INTO usuario_excecao (usuario_id,chave,concede) VALUES (?,?,1)').run(id, c));
  AC.sincronizarAreas(id);
  return id;
}
const LUCAS = pessoa('Lucas Geral', ['Admin Geral']);
const EDVALDO = pessoa('Edvaldo Revisao', ['Operador / Revisão'], ['manual.ler']);
const BIA = pessoa('Bia Embalagem', ['Operador / Embalagem']);                       // SEM manual.ler
const DAVI = pessoa('Davi Expedicao', ['Operador / Expedição'], ['manual.ler']);
const SERGIO = pessoa('Sergio Supervisor', ['Supervisor'], ['manual.ler', 'manual.ver_todas']);
const CARLA = pessoa('Carla Estoque', ['Operador / Controle de Estoque'], ['manual.ler']);   // a 303 Inventário
db.prepare("DELETE FROM config WHERE chave='nivel_pessoa_1'").run(); AC.migrarNiveis();
[LUCAS, EDVALDO, BIA, DAVI, SERGIO, CARLA].forEach(id => AC.sincronizarAreas(id));

app.get('/api/auth/eu', (req, res) => res.json(req.usuario ? { logado:true, nome:req.usuario.nome, destino:{} } : { logado:false }));
app.get('/api/teste/ativo', (req, res) => res.json({ ativo:false }));
require('./admin_telas')(app, db);
require('./manual_route')(app, db);
['manual', 'operador', 'embalagem', 'carregamento', 'devolucao', 'inventario'].forEach(t => app.get('/' + t, (req, res) => res.sendFile(path.join(__dirname, 'public', t + '.html'))));
app.use(express.static(path.join(__dirname, 'public')));
/* o resto da API: as telas da bancada pedem suas listas; aqui elas ficam vazias */
app.use('/api', (req, res) => res.json({}));

const srv = app.listen(0, async () => {
  const B = 'http://127.0.0.1:' + srv.address().port;
  let b;
  const launch = async () => {
    try{ return await chromium.launch(); }
    catch(e){
      const exe = process.env.PCP_CHROMIUM || (fs.existsSync('/opt/pw-browsers/chromium') ? '/opt/pw-browsers/chromium' : null);
      if(!exe) throw e;
      return await chromium.launch({ executablePath: exe });
    }
  };
  try { b = await launch(); }
  catch(e){ console.log('PULADO: sem Chromium neste computador — a tela NÃO foi conferida (' + e.message.split('\n')[0] + ').'); srv.close(); fim(); return; }
  try {
    async function abrir(quem, url, largura){
      const ctx = await b.newContext({ viewport:{ width: largura || 1440, height: 1000 } });
      await ctx.addCookies([{ name:'quem', value:String(quem), url:B }]);
      const p = await ctx.newPage();
      const erros = []; p.on('pageerror', e => erros.push(e.message));
      const pedidos = []; p.on('request', r => pedidos.push(r.url()));
      await p.goto(B + url); await p.waitForTimeout(900);
      return { p, ctx, erros, pedidos };
    }
    const texto = async (p, sel) => (await p.textContent(sel)) || '';
    const rolaDeLado = p => p.evaluate(() => document.documentElement.scrollWidth > document.documentElement.clientWidth);

    /* ═════ D1 ═════ */
    secao('D1. a 907 abre em "Minhas telas"; "Todas as telas" só com a chave');
    let A = await abrir(EDVALDO, '/manual');
    let lista = await texto(A.p, '#lista');
    ok('o Edvaldo (Revisão + manual.ler) vê a 101 Revisão e a 105 Painel na lista', /101\s*Revisão/.test(lista) && /105\s*Painel/.test(lista), lista);
    ok('   agrupadas pelo módulo (Produção) e sem tela do Admin', /PRODUÇÃO|Produção/.test(lista) && !/Pendências|Estoque/.test(lista), lista);
    ok('   o botão "Todas as telas" não aparece para ele', await A.p.isHidden('#btTodas'));
    ok('   e a tela abre no mapa, com as telas dele em azul e as outras em cinza', (await A.p.locator('#conteudo svg .mapaNo').count()) === 53 && (await A.p.locator('#conteudo svg rect[stroke="#1565c0"]').count()) === (await A.p.locator('#lista a.tela').count()));
    /* ③ REVISÃO (22/11/2026): o nome é MEDIDO contra a caixa, e a tela não
       operada tem contraste de leitura (#5a6472 sobre #f4f6f8 = 5,5:1) */
    const mapa = await A.p.evaluate(() => Array.from(document.querySelectorAll('#conteudo svg .mapaNo')).map(g => { const t = g.querySelector('text'), r = g.querySelector('rect'); return { n:g.getAttribute('data-n'), larg:t.getComputedTextLength(), caixa:+r.getAttribute('width'), fill:t.getAttribute('fill'), op:r.getAttribute('stroke') === '#1565c0', nome:t.querySelector('.mapaNome').textContent }; }));
    ok('   nenhum nome passa da caixa (medido, não contado em letras)', mapa.every(x => x.larg <= x.caixa - 20), JSON.stringify(mapa.filter(x => x.larg > x.caixa - 20)));
    ok('   o nome que cabe não é cortado (a 252 "Devoluções — em andamento" cabe inteira ou termina em "…" só se não couber)', mapa.every(x => !/…$/.test(x.nome) || x.larg > x.caixa - 40), JSON.stringify(mapa.filter(x => /…$/.test(x.nome))));
    ok('   a tela não operada é escrita em #5a6472, nunca no cinza claro', mapa.filter(x => !x.op).every(x => x.fill === '#5a6472') && mapa.some(x => !x.op));
    const errosD1 = A.erros.slice();
    await A.ctx.close();
    let S = await abrir(SERGIO, '/manual');
    ok('o Sergio (Supervisor + ver_todas) vê o botão "Todas as telas"', await S.p.isVisible('#btTodas'));
    await S.p.click('#btTodas'); await S.p.waitForTimeout(700);
    ok('   e, clicando, a lista passa a ter as 53 telas, as que ele não opera em cinza', (await S.p.locator('#lista a.tela').count()) === 53 && (await S.p.locator('#lista a.tela.fora').count()) > 0, await S.p.locator('#lista a.tela').count());
    /* ③ REVISÃO: em "Todas as telas" a busca alcança o que a chave dá */
    await S.p.fill('#busca', 'Conferência'); await S.p.waitForTimeout(600);
    let resS = await texto(S.p, '#conteudo');
    ok('   e em "Todas as telas" a busca acha a 202 Conferência, que ele não opera', /202\s*Conferência/.test(resS), resS);
    await S.p.goto(B + '/manual#termo=pack-id'); await S.p.waitForTimeout(800);
    ok('   #termo=pack-id abre o glossário no próprio termo (o [[Termo]] da ficha), marcado', await S.p.evaluate(() => { const dt = document.getElementById('termo-pack-id'); return !!dt && dt.classList.contains('alvo') && document.getElementById('lkGlo').classList.contains('on'); }));
    await S.ctx.close();

    /* ═════ D2 ═════ */
    secao('D2. a busca');
    A = await abrir(EDVALDO, '/manual');
    await A.p.fill('#busca', 'Devolver peça'); await A.p.waitForTimeout(600);
    let res = await texto(A.p, '#conteudo');
    ok('"Devolver peça" (um botão da 101) acha a 101 Revisão, dizendo o botão', /101\s*Revisão/.test(res) && /botão/.test(res), res);
    await A.p.fill('#busca', 'comprometido'); await A.p.waitForTimeout(600);
    res = await texto(A.p, '#conteudo');
    ok('"comprometido" acha o termo no glossário', /no glossário/.test(res) && /Comprometido/.test(res), res);
    await A.p.fill('#busca', 'Conferência'); await A.p.waitForTimeout(600);
    res = await texto(A.p, '#conteudo');
    ok('"Conferência" não acha a 202 para quem não a opera (a busca fica dentro do acesso)', !/202\s*Conferência/.test(res), res);
    await A.p.fill('#busca', ''); await A.p.waitForTimeout(600);
    ok('   limpar a busca volta ao mapa', (await A.p.locator('#conteudo svg').count()) === 1);

    /* ═════ D3 ═════ */
    secao('D3. tela que a pessoa não opera');
    await A.p.goto(B + '/manual#tela=202'); await A.p.waitForTimeout(800);
    res = await texto(A.p, '#conteudo');
    ok('a 202 para o Edvaldo mostra o nome, o módulo, o nível e "Você não opera esta tela"', /Conferência/.test(res) && /Expedição/.test(res) && /Operação/.test(res) && /não opera esta tela/.test(res), res);
    ok('   e nenhuma seção da ficha', !/Para que serve|Botões e ações|O que a tela mostra/.test(res), res);

    /* ═════ D4 ═════ */
    secao('D4. a ficha em rascunho');
    await A.p.goto(B + '/manual#tela=101'); await A.p.waitForTimeout(800);
    res = await texto(A.p, '#conteudo');
    ok('a 101 (rascunho) mostra a tarja "Ficha ainda não escrita"', /ainda não escrita/.test(res), res);
    ok('   e mesmo assim o fluxo gerado (manda para a 102 Embalagem, recebe da 105 Painel)', /Manda para/.test(res) && /102\s*Embalagem/.test(res) && /105\s*Painel/.test(res), res);
    ok('   e as ações da tela pelo registro: Revisar peças e Devolver peça à produção', /Revisar peças/.test(res) && /Devolver peça à produção/.test(res), res);
    ok('   e o número de hoje do parâmetro, pelo NOME da ficha ("Tempo mínimo da revisão" = 15), lido do config — nunca a chave do config', /Tempo mínimo da revisão/.test(res) && /15/.test(res) && !/rev minimo seg|rev_minimo_seg/.test(res), res);
    ok('   a 102, que ele não opera, aparece no fluxo marcada "(você não opera)"', /102\s*Embalagem\s*\(você não opera\)/.test(res), res);
    const errosD4 = A.erros.slice();
    await A.ctx.close();

    /* ═════ D5 ═════ */
    secao('D5. o "?" aparece para quem tem manual.ler e some para quem não tem');
    let E = await abrir(EDVALDO, '/operador'); await E.p.waitForTimeout(900);
    ok('na 101, o Edvaldo (manual.ler) vê o "?" na barra, ao lado do ☰ Menu', await E.p.isVisible('#manualAjuda'), await E.p.locator('#sessBar').textContent().catch(() => ''));
    const Bi = await abrir(BIA, '/embalagem'); await Bi.p.waitForTimeout(900);
    ok('na 201, a Bia (sem manual.ler) NÃO vê o "?" — a rota devolve 403 e o botão não nasce', (await Bi.p.locator('#manualAjuda').count()) === 0);
    ok('   e a tela dela nem pergunta a ficha: nenhum pedido a /api/manual (sem 403 no console da bancada, ③ REVISÃO)', !Bi.pedidos.some(u => /\/api\/manual/.test(u)), Bi.pedidos.filter(u => /\/api\/manual/.test(u)));
    ok('   (e a do Edvaldo, que tem a chave, perguntou)', E.pedidos.some(u => /\/api\/manual\/ficha\/aqui/.test(u)));
    await Bi.ctx.close();
    /* ③ REVISÃO (22/11/2026): na 251 e na 303 a tela não puxa o bipe de volta;
       o "?" não pode levar o foco ao ✕, senão o bipe seguinte cai no botão */
    for(const [quem, url, campo, nome] of [[EDVALDO, '/devolucao', 'dvCod', '251 Receber peça'], [CARLA, '/inventario', 'scan', '303 Inventário']]){
      const F = await abrir(quem, url); await F.p.waitForTimeout(900);
      const tem = (await F.p.locator('#manualAjuda').count()) === 1;
      if(tem){ await F.p.focus('#' + campo); await F.p.click('#manualAjuda'); await F.p.waitForTimeout(500); }
      ok('na ' + nome + ', o "?" abre o painel e o foco FICA no campo de bipe (#' + campo + '), não no ✕', tem && await F.p.isVisible('#manualPainel') && await F.p.evaluate(c => document.activeElement && document.activeElement.id === c, campo), tem ? await F.p.evaluate(() => document.activeElement && document.activeElement.id) : 'sem o "?"');
      await F.ctx.close();
    }

    /* ═════ D6 ═════ */
    secao('D6. o "?" abre a ficha na mesma página e devolve o foco ao bipe');
    let Dv = await abrir(DAVI, '/embalagem'); await Dv.p.waitForTimeout(900);
    const paginasAntes = Dv.ctx.pages().length;
    await Dv.p.focus('#scan');
    await Dv.p.click('#manualAjuda'); await Dv.p.waitForTimeout(500);
    ok('clicar no "?" abre o painel com "201 · Etiqueta de Venda"', await Dv.p.isVisible('#manualPainel') && /Etiqueta de Venda/.test(await texto(Dv.p, '#manualPainel')) && /201/.test(await texto(Dv.p, '#manualPainel')), await texto(Dv.p, '#manualPainel'));
    ok('   nenhuma janela nova foi aberta', Dv.ctx.pages().length === paginasAntes);
    ok('   o painel é filho direto do <body> (fora de qualquer card que a tela redesenhe)', await Dv.p.evaluate(() => document.getElementById('manualPainel').parentElement === document.body));
    /* A ETIQUETA DE VENDA PUXA O BIPE DE VOLTA ("o bipe não pode ficar sem
       dono", embalagem.html): com o painel aberto, o campo de bipe continua
       com o foco, e o leitor continua funcionando. O painel é leitura. */
    ok('   na bancada o campo de bipe continua com o foco com o painel aberto (a tela o puxa de volta, e o bipe segue trabalhando)', await Dv.p.evaluate(() => document.activeElement && document.activeElement.id === 'scan'));
    await Dv.p.keyboard.press('Escape'); await Dv.p.waitForTimeout(300);
    ok('   e o Esc, com o foco no bipe, fecha o painel', await Dv.p.isHidden('#manualPainel'));
    await Dv.p.click('#manualAjuda'); await Dv.p.waitForTimeout(400);
    await Dv.p.click('#manualFechar'); await Dv.p.waitForTimeout(300);
    ok('   fechar esconde o painel e devolve o foco ao campo de bipe (#scan)', await Dv.p.isHidden('#manualPainel') && await Dv.p.evaluate(() => document.activeElement && document.activeElement.id === 'scan'));
    await Dv.p.click('#manualAjuda'); await Dv.p.waitForTimeout(300); await Dv.p.keyboard.press('Escape'); await Dv.p.waitForTimeout(300);
    ok('   Esc também fecha', await Dv.p.isHidden('#manualPainel'));
    ok('   o botão leva data-perm="manual.ler" (R-TEL-04) e aria-haspopup', await Dv.p.evaluate(() => { const b = document.getElementById('manualAjuda'); return b.getAttribute('data-perm') === 'manual.ler' && b.getAttribute('aria-haspopup') === 'dialog'; }));

    /* ═════ D7 ═════ */
    secao('D7. abrir e fechar não mexe no que a pessoa estava fazendo');
    /* O campo de bipe processa o que entra como um bipe (220 ms depois da última
       tecla), então o campo certo para esta prova é a busca do "Já impressos"
       (#impBusca), um campo comum: o digitado fica, e o foco volta para ele. */
    await Dv.p.click('#impBusca'); await Dv.p.type('#impBusca', 'abc'); await Dv.p.waitForTimeout(300);
    await Dv.p.click('#manualAjuda'); await Dv.p.waitForTimeout(400);
    ok('com o foco na busca, abrir o "?" não apaga o que estava digitado', (await Dv.p.inputValue('#impBusca')) === 'abc');
    await Dv.p.click('#manualFechar'); await Dv.p.waitForTimeout(300);
    ok('   e fechar devolve o foco à busca, que era quem o tinha', await Dv.p.evaluate(() => document.activeElement && document.activeElement.id === 'impBusca') && (await Dv.p.inputValue('#impBusca')) === 'abc', await Dv.p.evaluate(() => document.activeElement && document.activeElement.id));
    const errosD6 = Dv.erros.slice();
    await Dv.ctx.close();

    /* ═════ D8 ═════ */
    secao('D8. larguras: nada rola de lado');
    for(const w of [400, 768, 1024, 1440]){
      const X = await abrir(SERGIO, '/manual', w); await X.p.waitForTimeout(600);
      ok('a 907 a ' + w + ' px não rola de lado (mapa)', !(await rolaDeLado(X.p)));
      await X.p.goto(B + '/manual#tela=202'); await X.p.waitForTimeout(600);
      ok('   nem com a ficha aberta', !(await rolaDeLado(X.p)));
      await X.ctx.close();
    }
    const T = await abrir(DAVI, '/embalagem', 768); await T.p.waitForTimeout(900);
    await T.p.click('#manualAjuda'); await T.p.waitForTimeout(400);
    ok('o painel do "?" a 768 px (iPad em pé) não rola a página de lado', !(await rolaDeLado(T.p)));
    ok('   e cabe na tela: a largura do painel é no máximo a da janela', await T.p.evaluate(() => document.getElementById('manualPainel').getBoundingClientRect().width <= window.innerWidth + 1));
    await T.ctx.close();

    /* ═════ D9 ═════ */
    secao('D9. o painel sobrevive ao redesenho periódico');
    const C = await abrir(DAVI, '/carregamento'); await C.p.waitForTimeout(900);
    await C.p.click('#manualAjuda'); await C.p.waitForTimeout(300);
    const antes = await texto(C.p, '#manualPainel');
    await C.p.waitForTimeout(4600);   // a Conferência redesenha a cada 4 s
    ok('na Conferência, depois de 4,6 s o painel continua aberto e com o mesmo conteúdo', await C.p.isVisible('#manualPainel') && (await texto(C.p, '#manualPainel')) === antes);
    await C.ctx.close();

    /* ═════ D10 ═════ */
    secao('D10. "O que mudou"');
    A = await abrir(EDVALDO, '/manual#mudou'); await A.p.waitForTimeout(800);
    res = await texto(A.p, '#conteudo');
    ok('a lista mostra as linhas das fichas do Edvaldo, com a data e a tela (101 Revisão, "ficha criada em rascunho")', /O que mudou/.test(res) && /21\/11\/2026/.test(res) && /101\s*Revisão/.test(res) && /criada em rascunho/.test(res), res);
    ok('   e não mostra tela que ele não opera (202)', !/202\s*Conferência/.test(res));
    const errosD10 = A.erros.slice();
    await A.ctx.close();

    /* ═════ D11 ═════ */
    secao('D11. nenhum erro de script');
    const errosTodos = errosD1.concat(errosD4, errosD6, errosD10);
    ok('nenhum erro de script na 907 (mapa, ficha, o que mudou) nem ao abrir o "?" na 201', errosTodos.length === 0, errosTodos);
    const errosE = E.erros.slice(); await E.ctx.close();
    ok('   nem na 101 com o "?" na barra', errosE.length === 0, errosE);
    await S.ctx.close();
  } catch(e){ falhas++; console.log('  ERRO no roteiro: ' + (e && e.stack || e)); }
  try{ await b.close(); }catch(e){}
  srv.close(); fim();
});
function fim(){
  try{ db.close(); }catch(e){}
  fs.rmSync(tmp, { recursive:true, force:true });
  console.log('\n' + (n - falhas) + ' ok, ' + falhas + ' falha(s)\n');
  process.exit(falhas ? 1 : 0);
}

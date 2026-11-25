#!/usr/bin/env node
/* Testes da spec CONFERENCIA-CARRINHOS, fase 3 — A TRAVA DA 201 (R-TRV).
 *
 *   node teste_trava_dia.js
 *
 * Escrito ANTES do código (§0, risco 🔴). O que estes casos travam:
 * - R-TRV-01: a 201 não imprime etiqueta NOVA enquanto houver caixa impressa
 *   num dia anterior e sem conferência — ADIANTADA OU NÃO (D18, o dono,
 *   25/11/2026: "se essas 15 peças tivessem ficado sem a conferência, a tela
 *   precisa travar"), e o sob medida igual (D19). Para todo mundo (D11);
 * - a caixa impressa HOJE não trava;
 * - R-TRV-04: fora da trava a conferida (no carrinho ou não), a cancelada e a
 *   separada, a já entregue, e a de teste;
 * - R-TRV-02: a reimpressão nunca trava;
 * - R-TRV-03: bipar na 202 solta; separar como venda cancelada solta; "caixa
 *   não encontrada" (expedicao.caixa_nao_encontrada, com motivo) solta e vira
 *   pendência na 204;
 * - §7 / D6: reimprimir uma caixa que está travando abre a pendência da caixa
 *   reimpressa; "perdida" abre o PEDIDO de ajuste −1 por peça (outra pessoa
 *   aprova, R-EST-20) e o saldo NÃO muda; "achei" e "foi só a etiqueta" não
 *   mexem em nada;
 * - as duas linhas novas da central e a chave nova (Supervisor, sensível, 201).
 */
const Database = require('better-sqlite3');
const fs = require('fs'), os = require('os'), path = require('path');

const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'pcp-trava-'));
process.env.PCP_DIR = tmp;

let falhas = 0, casos = 0;
const ok = (n, c, extra) => { casos++;
  if(c) console.log('ok      ' + n);
  else { falhas++; console.log('FALHOU  ' + n + (extra ? '   ' + extra : '')); } };

const db = new Database(path.join(tmp, 't.db'));
const rotas = {};
let PODE = new Set();
const app = { get:(p,...h)=>{ rotas['GET '+p]=h[h.length-1]; },
              post:(p,...h)=>{ rotas['POST '+p]=h[h.length-1]; },
              delete:(p,...h)=>{ rotas['DELETE '+p]=h[h.length-1]; },
              use:()=>{}, locals:{ acesso:{ auditar(){}, podePermissao(u,k){ return PODE.has(k); } } } };
db.exec(`CREATE TABLE IF NOT EXISTS modelo (id INTEGER PRIMARY KEY AUTOINCREMENT, codigo TEXT, nome TEXT,
    exige_medida INTEGER DEFAULT 1, sob_medida INTEGER DEFAULT 0);
  CREATE TABLE IF NOT EXISTS skus (codigo TEXT PRIMARY KEY, descricao TEXT DEFAULT '', cor TEXT DEFAULT '',
    estoque INTEGER DEFAULT 0, alvo INTEGER DEFAULT 0, modelo_id INTEGER,
    largura_cm INTEGER, altura_cm INTEGER, cor_codigo TEXT, tecido_codigo TEXT);`);
db.exec("CREATE TABLE IF NOT EXISTS cor (codigo TEXT PRIMARY KEY, nome TEXT); CREATE TABLE IF NOT EXISTS tecido (codigo TEXT PRIMARY KEY, nome TEXT);");
db.prepare("INSERT INTO modelo (codigo,nome,exige_medida,sob_medida) VALUES ('SM','Sob medida',0,1)").run();
db.prepare("INSERT INTO skus (codigo,estoque) VALUES ('BK140140BEGE',100),('BK120160CINZA',100)").run();
db.prepare("INSERT INTO skus (codigo,estoque,modelo_id) VALUES ('SOBMEDIDA',0,1)").run();
require('./estoque_dominio').garantirSchema(db);
require('./exp_route')(app, db);
require('./etq_route')(app, db);
require('./cad_route')(app, db);
require('./carreg_route')(app, db);
require('./saida_route')(app, db);
require('./carrinho_route')(app, db);
require('./trava_route')(app, db);
const AJ = require('./ajuste_dominio'); AJ.garantirSchema(db);

const chamar = (k, body, usuario, params, query) => new Promise(r => {
  if(!rotas[k]) return r({ __sem_rota:k });
  const res = { _s:200, json:o=>r(Object.assign({__status:res._s}, o)), status(s){ res._s=s; return res; },
                send:o=>r({ __send:o, __status:res._s }), setHeader(){}, set(){}, type(){ return res; } };
  try{ rotas[k]({ body:body||{}, params:params||{}, query:query||{}, headers:{}, usuario:usuario||null }, res); }
  catch(e){ r({ __erro:e.message }); }
});
const ANA = {id:1,nome:'Ana'}, BETO = {id:2,nome:'Beto'}, SUP = {id:3,nome:'Sueli'};
const q1 = s => db.prepare(s).get();
const hoje = q1("SELECT date('now','localtime') d").d;
const amanha = q1("SELECT date('now','localtime','+1 day') d").d;
const lote = id => db.prepare('SELECT * FROM lote WHERE id=?').get(id);
const saldo = c => db.prepare('SELECT estoque FROM skus WHERE codigo=?').get(c).estoque;
const pdf = path.join(tmp, 'lote.pdf'); fs.writeFileSync(pdf, '%PDF-1.4 fake');
let n = 0;
/* impressa ha `dias` dias (0 = hoje), sem conferencia */
const impressa = (dias, extra, sku, mod, despacho) => { n++;
  const id = db.prepare(`INSERT INTO lote (codigo,buyer,nf,packId,codes,estagio,data,despachar_em,modalidade,
      embalado_em,impresso_por,impresso_por_id,srcfile,labelPage)
      VALUES (?,?,?,?,?,'embalado',?,?,?,datetime('now','localtime',?),'Beto',2,?,0)`)
    .run(sku||'BK140140BEGE', 'Cli'+n, String(9000+n), 'P'+n, JSON.stringify(['P'+n]), hoje,
         despacho||hoje, mod||'coleta', '-'+(dias||0)+' day', pdf).lastInsertRowid;
  if(extra) db.prepare('UPDATE lote SET '+extra+' WHERE id=?').run(id);
  return id;
};
const pendente = (sku) => { n++;
  return db.prepare(`INSERT INTO lote (codigo,buyer,nf,packId,codes,estagio,data,despachar_em,modalidade,srcfile,labelPage)
      VALUES (?,?,?,?,?,'pendente',?,?,'coleta',?,0)`)
    .run(sku||'BK140140BEGE','Nova'+n,String(9000+n),'P'+n,JSON.stringify(['P'+n]),hoje,hoje,pdf).lastInsertRowid; };
const trava = async (u) => chamar('GET /api/etiqueta/trava', {}, u||ANA);
const T = require('./trava_dominio');
const limpar = () => db.prepare("UPDATE lote SET estagio='carregado', conferido_em=datetime('now','localtime'), saiu_em=datetime('now','localtime') WHERE estagio='embalado'").run();

(async () => {
  // ── R-TRV-01: sem nada antigo, não trava ──
  let r = await trava();
  ok('sem caixa antiga, a 201 não está travada', r.travada === false && (r.caixas||[]).length === 0, JSON.stringify(r));

  // ── a impressa HOJE não trava ──
  const h0 = impressa(0);
  r = await trava();
  ok('a caixa impressa hoje e sem conferência não trava', r.travada === false, JSON.stringify(r));

  // ── a de ontem sem bipe trava ──
  const o1 = impressa(1);
  r = await trava();
  ok('a caixa impressa ontem e sem conferência trava a 201', r.travada === true && r.caixas.length === 1 && r.caixas[0].id === o1, JSON.stringify(r));
  ok('...e a lista diz cliente, NF e quem imprimiu', r.caixas[0].buyer && r.caixas[0].nf && r.caixas[0].impresso_por === 'Beto', JSON.stringify(r.caixas[0]));
  ok('...e o dia em que foi impressa', /^\d{4}-\d\d-\d\d/.test(r.caixas[0].embalado_em||''), JSON.stringify(r.caixas[0]));

  // ── a ADIANTADA de ontem sem bipe também trava (D18) ──
  const ad = impressa(1, null, 'BK120160CINZA', 'coleta', amanha);
  r = await trava();
  ok('a adiantada (despacho amanhã) impressa ontem e sem bipe também trava (D18)',
     r.caixas.some(c => c.id === ad), JSON.stringify(r.caixas.map(c=>c.id)));
  ok('...e vem marcada como adiantada, com o dia do despacho', r.caixas.find(c=>c.id===ad).despachar_em === amanha);

  // ── o sob medida trava igual (D19) ──
  const sm = impressa(2, null, 'SOBMEDIDA', 'agencia');
  r = await trava();
  ok('o sob medida impresso antes e sem bipe trava igual (D19)', r.caixas.some(c => c.id === sm));

  // ── /api/embalar recusa, para todo mundo ──
  const nova = pendente();
  r = await chamar('POST /api/embalar', {id:nova}, ANA);
  ok('com a trava, /api/embalar recusa a etiqueta nova (409 trava_dia)', r.__status === 409 && r.motivo === 'trava_dia', JSON.stringify(r));
  ok('...com a lista das caixas que travam', Array.isArray(r.caixas) && r.caixas.length === 3, JSON.stringify(r.caixas));
  ok('...e a frase manda bipar na Conferência', /Confer/i.test(r.erro||''), r.erro);
  ok('...e nada grava: a venda nova continua pendente', lote(nova).estagio === 'pendente');
  PODE = new Set(['expedicao.caixa_nao_encontrada','etiqueta.emitir']);
  r = await chamar('POST /api/embalar', {id:nova}, SUP);
  ok('vale para todo mundo, inclusive quem tem a chave nova (D11)', r.__status === 409 && lote(nova).estagio === 'pendente', JSON.stringify(r));
  PODE = new Set();
  r = await chamar('GET /api/proximo/:sku', {}, ANA, {sku:'BK140140BEGE'});
  ok('o bipe do SKU (/api/proximo) avisa a trava antes de imprimir', r.trava && r.trava.n === 3, JSON.stringify(r).slice(0,300));

  // ── R-TRV-02: a reimpressão nunca trava ──
  r = await chamar('POST /api/reimprimir', {id:h0}, ANA);
  ok('a reimpressão de uma caixa de hoje passa com a trava ligada', r.ok === true, JSON.stringify(r));
  ok('...e reimprimir a de hoje NÃO abre pendência de caixa reimpressa',
     q1('SELECT COUNT(*) n FROM caixa_reimpressa').n === 0);
  r = await chamar('POST /api/reimprimir', {id:o1}, ANA);
  ok('a reimpressão da própria caixa que trava também passa', r.ok === true, JSON.stringify(r));

  // ── §7 / D6: a reimpressa de dia anterior abre a pendência ──
  let cr = db.prepare("SELECT * FROM caixa_reimpressa WHERE lote_id=?").all(o1);
  ok('reimprimir a caixa que está travando abre UMA pendência de caixa reimpressa', cr.length === 1 && cr[0].status === 'pendente', JSON.stringify(cr));
  ok('...com quem reimprimiu, pelo id', cr[0].reimpresso_por_id === 1 && cr[0].reimpresso_por === 'Ana');
  await chamar('POST /api/reimprimir', {id:o1}, ANA);
  ok('reimprimir de novo não abre a segunda', q1(`SELECT COUNT(*) n FROM caixa_reimpressa WHERE lote_id=${o1}`).n === 1);
  ok('a reimpressa continua travando até ser bipada', (await trava()).caixas.some(c => c.id === o1));

  // ── a decisão da reimpressa: só com a chave ──
  r = await chamar('POST /api/etiqueta/reimpressa/decidir', {id:cr[0].id, decisao:'perdida'}, ANA);
  ok('decidir a reimpressa sem a chave: 403', r.__status === 403, JSON.stringify(r));
  PODE = new Set(['expedicao.caixa_nao_encontrada']);
  r = await chamar('POST /api/etiqueta/reimpressa/decidir', {id:cr[0].id, decisao:'xyz'}, SUP);
  ok('decisão fora da lista: 400', r.__status === 400, JSON.stringify(r));
  const sAntes = saldo('BK140140BEGE');
  db.prepare("UPDATE lote SET conferido_em=datetime('now','localtime'), estagio='carregado' WHERE id=?").run(o1);
  r = await chamar('POST /api/etiqueta/reimpressa/decidir', {id:cr[0].id, decisao:'perdida'}, SUP);
  ok('"perdida" abre o PEDIDO de ajuste −1 do SKU', r.ok === true, JSON.stringify(r));
  const ped = db.prepare("SELECT * FROM ajuste_pedido WHERE codigo='BK140140BEGE' AND status='pendente'").get();
  ok('...com delta −1, pedido por quem decidiu', ped && ped.delta === -1 && ped.pedido_por_id === 3, JSON.stringify(ped));
  ok('...e o motivo diz a NF da caixa', ped && ped.motivo.indexOf(lote(o1).nf) >= 0, ped && ped.motivo);
  ok('...e o saldo NÃO muda (outra pessoa aprova, R-EST-20)', saldo('BK140140BEGE') === sAntes);
  ok('a reimpressa fica decidida, com quem e quando',
     (x => x.status === 'perdida' && x.decidido_por_id === 3 && x.decidido_em)(db.prepare('SELECT * FROM caixa_reimpressa WHERE id=?').get(cr[0].id)));
  r = await chamar('POST /api/etiqueta/reimpressa/decidir', {id:cr[0].id, decisao:'achei'}, SUP);
  ok('decidida não se decide de novo: 409', r.__status === 409, JSON.stringify(r));
  let recusou = false; try{ AJ.aprovar(db, {id:ped.id, quem:SUP}); }catch(e){ recusou = true; }
  ok('quem pediu o ajuste não o aprova (a regra de sempre)', recusou && saldo('BK140140BEGE') === sAntes);

  // "achei" e "foi só a etiqueta" não mexem em nada
  const o2 = impressa(1, null, 'BK120160CINZA');
  await chamar('POST /api/reimprimir', {id:o2}, ANA);
  const cr2 = db.prepare('SELECT id FROM caixa_reimpressa WHERE lote_id=?').get(o2).id;
  const pedAntes = q1('SELECT COUNT(*) n FROM ajuste_pedido').n;
  r = await chamar('POST /api/etiqueta/reimpressa/decidir', {id:cr2, decisao:'achei'}, SUP);
  ok('"achei a caixa velha" fecha sem pedido de ajuste e sem mexer no saldo',
     r.ok === true && q1('SELECT COUNT(*) n FROM ajuste_pedido').n === pedAntes && saldo('BK120160CINZA') === 100, JSON.stringify(r));
  const o3 = impressa(1, null, 'BK120160CINZA');
  await chamar('POST /api/reimprimir', {id:o3}, ANA);
  const cr3 = db.prepare('SELECT id FROM caixa_reimpressa WHERE lote_id=?').get(o3).id;
  r = await chamar('POST /api/etiqueta/reimpressa/decidir', {id:cr3, decisao:'so_etiqueta'}, SUP);
  ok('"foi só a etiqueta" fecha sem nada', r.ok === true && q1('SELECT COUNT(*) n FROM ajuste_pedido').n === pedAntes);

  // a perdida da caixa de várias: um pedido por SKU, pelo número de peças
  const vv = impressa(1, null, 'BK140140BEGE');
  db.prepare("INSERT INTO lote_item (lote_id,codigo,qtd) VALUES (?,?,?),(?,?,?)").run(vv,'BK140140BEGE',1, vv,'BK120160CINZA',2);
  db.prepare("DELETE FROM ajuste_pedido").run();
  await chamar('POST /api/reimprimir', {id:vv}, ANA);
  const crv = db.prepare('SELECT id FROM caixa_reimpressa WHERE lote_id=?').get(vv).id;
  db.prepare("UPDATE lote SET conferido_em=datetime('now','localtime'), estagio='carregado' WHERE id=?").run(vv);
  r = await chamar('POST /api/etiqueta/reimpressa/decidir', {id:crv, decisao:'perdida'}, SUP);
  const pv = db.prepare("SELECT codigo,delta FROM ajuste_pedido WHERE status='pendente' ORDER BY codigo").all();
  ok('a perdida da caixa de várias abre um pedido por SKU, pelo número de peças',
     r.ok === true && pv.length === 2 && pv[0].codigo === 'BK120160CINZA' && pv[0].delta === -2 && pv[1].delta === -1, JSON.stringify(pv));
  // com pedido aberto do mesmo SKU: recusa sem decidir pela metade
  const vw = impressa(1, null, 'BK140140BEGE');
  await chamar('POST /api/reimprimir', {id:vw}, ANA);
  const crw = db.prepare('SELECT id FROM caixa_reimpressa WHERE lote_id=?').get(vw).id;
  db.prepare("UPDATE lote SET conferido_em=datetime('now','localtime'), estagio='carregado' WHERE id=?").run(vw);
  r = await chamar('POST /api/etiqueta/reimpressa/decidir', {id:crw, decisao:'perdida'}, SUP);
  ok('com pedido de ajuste já aberto do SKU, "perdida" é recusada e nada grava',
     r.__status === 409 && db.prepare('SELECT status FROM caixa_reimpressa WHERE id=?').get(crw).status === 'pendente', JSON.stringify(r));
  ok('a perdida do sob medida não pede ajuste (não usa estoque)', (() => {
    const s2 = impressa(1, null, 'SOBMEDIDA'); return s2; })() > 0);
  const s2 = db.prepare("SELECT MAX(id) id FROM lote WHERE codigo='SOBMEDIDA'").get().id;
  await chamar('POST /api/reimprimir', {id:s2}, ANA);
  const crs = db.prepare('SELECT id FROM caixa_reimpressa WHERE lote_id=?').get(s2).id;
  const pedS = q1('SELECT COUNT(*) n FROM ajuste_pedido').n;
  db.prepare("UPDATE lote SET conferido_em=datetime('now','localtime'), estagio='carregado' WHERE id=?").run(s2);
  r = await chamar('POST /api/etiqueta/reimpressa/decidir', {id:crs, decisao:'perdida'}, SUP);
  ok('...fecha como perdida sem pedido de ajuste', r.ok === true && q1('SELECT COUNT(*) n FROM ajuste_pedido').n === pedS, JSON.stringify(r));

  // ── R-TRV-03: "caixa não encontrada" ──
  PODE = new Set();
  r = await chamar('POST /api/etiqueta/trava/nao-encontrada', {id:sm, motivo:'sumiu'}, ANA);
  ok('"caixa não encontrada" sem a chave: 403', r.__status === 403 && !lote(sm).nao_encontrada_em, JSON.stringify(r));
  PODE = new Set(['expedicao.caixa_nao_encontrada']);
  r = await chamar('POST /api/etiqueta/trava/nao-encontrada', {id:sm, motivo:'  '}, SUP);
  ok('...sem motivo: 400', r.__status === 400 && !lote(sm).nao_encontrada_em, JSON.stringify(r));
  r = await chamar('POST /api/etiqueta/trava/nao-encontrada', {id:nova, motivo:'x'}, SUP);
  ok('...de caixa que não está travando: 409', r.__status === 409, JSON.stringify(r));
  const sSm = saldo('SOBMEDIDA');
  r = await chamar('POST /api/etiqueta/trava/nao-encontrada', {id:sm, motivo:'não está na fábrica'}, SUP);
  ok('com a chave e motivo, a caixa é marcada não encontrada', r.ok === true && lote(sm).nao_encontrada_em && lote(sm).nao_encontrada_por_id === 3, JSON.stringify(r));
  ok('...sai da trava', !(await trava()).caixas.some(c => c.id === sm));
  ok('...e não mexe em estoque nem no estágio', saldo('SOBMEDIDA') === sSm && lote(sm).estagio === 'embalado');
  r = await chamar('POST /api/etiqueta/trava/nao-encontrada', {id:sm, motivo:'de novo'}, SUP);
  ok('marcar de novo: 409', r.__status === 409);

  // ── ③ REVISÃO 1: a "não encontrada" reposta e reimpressa abre a pendência ──
  const ne = impressa(1, null, 'BK120160CINZA');
  PODE = new Set(['expedicao.caixa_nao_encontrada']);
  await chamar('POST /api/etiqueta/trava/nao-encontrada', {id:ne, motivo:'sumiu'}, SUP);
  PODE = new Set();
  await chamar('POST /api/reimprimir', {id:ne}, ANA);
  ok('a caixa marcada "não encontrada" e depois reimpressa também abre a pendência da reimpressa (③ REVISÃO)',
     q1(`SELECT COUNT(*) n FROM caixa_reimpressa WHERE lote_id=${ne}`).n === 1);
  db.prepare("UPDATE caixa_reimpressa SET status='so_etiqueta' WHERE lote_id=?").run(ne);
  db.prepare("UPDATE lote SET nao_encontrada_resolvida_em=datetime('now','localtime') WHERE id=?").run(ne);
  // ── ③ REVISÃO 2: "perdida" só depois de a caixa ser bipada ──
  const pb = impressa(1, null, 'BK120160CINZA');
  await chamar('POST /api/reimprimir', {id:pb}, ANA);
  const crb = db.prepare('SELECT id FROM caixa_reimpressa WHERE lote_id=?').get(pb).id;
  PODE = new Set(['expedicao.caixa_nao_encontrada']);
  db.prepare("DELETE FROM ajuste_pedido WHERE codigo='BK120160CINZA'").run();
  r = await chamar('POST /api/etiqueta/reimpressa/decidir', {id:crb, decisao:'perdida'}, SUP);
  ok('"persiana perdida" com a caixa ainda sem bipe é recusada, dizendo para bipar antes (③ REVISÃO)',
     r.__status === 409 && /bip/i.test(r.erro||'') && q1("SELECT COUNT(*) n FROM ajuste_pedido WHERE codigo='BK120160CINZA'").n === 0, JSON.stringify(r));
  db.prepare("UPDATE lote SET conferido_em=datetime('now','localtime'), estagio='carregado' WHERE id=?").run(pb);
  r = await chamar('POST /api/etiqueta/reimpressa/decidir', {id:crb, decisao:'perdida'}, SUP);
  ok('...e depois de bipada, aceita', r.ok === true, JSON.stringify(r));
  db.prepare("DELETE FROM ajuste_pedido WHERE codigo='BK120160CINZA'").run();
  // ── ③ REVISÃO 4: quem tem só a chave abre a 201 ──
  const tela201 = require('./telas').TELAS.find(t => t.n === 201);
  ok('a 201 abre também com expedicao.caixa_nao_encontrada (o Supervisor decide lá)',
     tela201 && (tela201.perms||[]).indexOf('expedicao.caixa_nao_encontrada') >= 0, JSON.stringify(tela201 && tela201.perms));

  // ── a pendência na central ──
  const P = require('./pendencias_dominio');
  const res = P.resumo(db, {});
  const lin = k => (res.linhas||res||[]).find(l => l.chave === k);
  ok('a central tem a linha "caixa não encontrada", com 1', lin('trava_nao_encontrada') && lin('trava_nao_encontrada').n === 1, JSON.stringify(lin('trava_nao_encontrada')));
  ok('...da tela 201, resolvida com expedicao.caixa_nao_encontrada',
     lin('trava_nao_encontrada').tela === 201 && (P.LINHAS.find(l=>l.chave==='trava_nao_encontrada').perm||[]).indexOf('expedicao.caixa_nao_encontrada') >= 0);
  ok('a central tem a linha "caixa reimpressa no dia seguinte", com as que esperam',
     lin('caixa_reimpressa') && lin('caixa_reimpressa').n === 1, JSON.stringify(lin('caixa_reimpressa')));
  r = await chamar('POST /api/etiqueta/trava/nao-encontrada/resolver', {id:sm, resposta:''}, SUP);
  ok('resolver a não encontrada sem resposta: 400', r.__status === 400);
  r = await chamar('POST /api/etiqueta/trava/nao-encontrada/resolver', {id:sm, resposta:'reenviada outra peça'}, SUP);
  ok('resolver com resposta: a linha da central zera', r.ok === true && P.resumo(db,{}).linhas.find(l=>l.chave==='trava_nao_encontrada').n === 0, JSON.stringify(r));
  r = await trava(SUP);
  ok('o GET da trava diz se a pessoa pode decidir (pode_resolver)', r.pode_resolver === true);
  PODE = new Set();
  ok('...e não diz para quem não pode', (await trava(ANA)).pode_resolver === false);

  // ── bipar na 202 solta ──
  db.prepare("UPDATE lote SET impresso_por_id=9, impresso_por='Zé' WHERE id IN (?,?,?,?,?,?)").run(o1,o2,o3,vv,vw,s2);
  const ob = impressa(1, "impresso_por_id=9, impresso_por='Zé'");
  ok('(a caixa nova de ontem trava)', (await trava()).caixas.some(c => c.id === ob));
  r = await chamar('POST /api/carregar', {code:lote(ob).packId, carrinho:'A'}, ANA);
  ok('a caixa de ontem bipada na Conferência sai da trava', r.ok === true && !(await trava()).caixas.some(c => c.id === ob), JSON.stringify(r));
  // separar como venda cancelada solta
  db.prepare("UPDATE lote SET estagio='cancelado' WHERE id=?").run(o2);
  ok('a caixa separada como cancelada sai da trava', !(await trava()).caixas.some(c => c.id === o2));
  // a já entregue, a de teste
  db.prepare("UPDATE lote SET saiu_em=datetime('now','localtime') WHERE id=?").run(o3);
  ok('a caixa que já saiu não trava', !(await trava()).caixas.some(c => c.id === o3));
  db.prepare("UPDATE lote SET teste=1 WHERE id=?").run(vv);
  ok('a caixa de teste não trava', !(await trava()).caixas.some(c => c.id === vv));
  // a conferida e sem carrinho (a "não achada" da recontagem) não trava
  const na = impressa(2, "conferido_em=datetime('now','localtime','-1 day'), estagio='carregado'");
  ok('a conferida (mesmo fora de carrinho) não trava (R-TRV-04)', !(await trava()).caixas.some(c => c.id === na));

  // ── sem trava, imprime ──
  limpar();
  r = await chamar('POST /api/embalar', {id:nova}, ANA);
  ok('sem caixa antiga, a etiqueta nova imprime', r.ok === true && lote(nova).estagio === 'embalado', JSON.stringify(r));

  // ── a falha da conta não derruba a bancada? Não: a trava é segurança. ──
  ok('a conta da trava está num lugar só (trava_dominio.caixas)', typeof T.caixas === 'function' && typeof T.travada === 'function');
  const src = fs.readFileSync(path.join(__dirname,'etq_route.js'),'utf8');
  ok('a /api/embalar pergunta ao trava_dominio (sem SQL próprio da trava)', /trava_dominio/.test(src) && !/date\(embalado_em\)\s*</.test(src));

  // ── a chave nova ──
  const PERM = require('./permissoes');
  const lista = PERM.PERMISSOES || PERM.lista || PERM;
  const k = (Array.isArray(lista) ? lista : []).find(p => p.chave === 'expedicao.caixa_nao_encontrada');
  ok('a chave expedicao.caixa_nao_encontrada existe: Supervisor, sensível, tela 201',
     k && k.nivel === 'supervisor' && k.sensivel === true && k.tela === 201, JSON.stringify(k));

  console.log('\n' + (falhas ? falhas + ' FALHA(S) de ' + casos : 'todos os ' + casos + ' casos passaram'));
  try{ fs.rmSync(tmp, {recursive:true, force:true}); }catch(e){}
  process.exit(falhas ? 1 : 0);
})();

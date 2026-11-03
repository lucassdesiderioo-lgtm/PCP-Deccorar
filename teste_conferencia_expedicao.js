#!/usr/bin/env node
/* Testes da spec CONFERENCIA-EXPEDICAO, fases 2, 3 e 4 (03/11/2026).
 *
 *   node teste_conferencia_expedicao.js
 *
 *   FASE 2  a agencia fecha como a coleta: abrir a viagem poe no carro as
 *           conferidas, o bipe tira o que ficou, e fechar exige foto, numero
 *           e QUEM LEVOU (pessoa do cadastro), alem de quem fechou.
 *   FASE 3  "a coleta nao passou": registrar nao mexe em estagio nem saldo, e
 *           no dia seguinte a caixa vem em cima, com a marca de onde ficou.
 *   FASE 4  a venda cancelada em duas pessoas: marcar nao mexe no saldo;
 *           confirmar (outra pessoa, com a permissao) devolve +1 por peca uma
 *           vez so, se a caixa ja baixou; recusar devolve a caixa a lista.
 *
 * Escrito ANTES das rotas (§0, risco vermelho). Banco temporario, handlers
 * chamados direto. Nao toca em producao.
 */
const Database = require('better-sqlite3');
const fs = require('fs'), os = require('os'), path = require('path');
const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'pcp-confexp-'));
process.env.PCP_DIR = tmp;

let falhas = 0, casos = 0;
const ok = (n, c, extra) => { casos++;
  if(c) console.log('ok      ' + n);
  else { falhas++; console.log('FALHOU  ' + n + (extra !== undefined ? '   ' + (typeof extra === 'string' ? extra : JSON.stringify(extra)) : '')); } };
const eq = (n, a, b) => ok(n, JSON.stringify(a) === JSON.stringify(b), 'esperado ' + JSON.stringify(b) + ', veio ' + JSON.stringify(a));

const db = new Database(path.join(tmp, 't.db'));
db.exec(`CREATE TABLE config (chave TEXT PRIMARY KEY, valor TEXT);
  CREATE TABLE skus (codigo TEXT PRIMARY KEY, descricao TEXT DEFAULT '', cor TEXT DEFAULT '',
    estoque INTEGER DEFAULT 0, alvo INTEGER DEFAULT 0, modelo_id INTEGER);
  CREATE TABLE modelo (id INTEGER PRIMARY KEY, codigo TEXT, nome TEXT, sob_medida INTEGER DEFAULT 0, exige_medida INTEGER DEFAULT 1);
  CREATE TABLE usuarios (id INTEGER PRIMARY KEY, nome TEXT, ativo INTEGER DEFAULT 1);
  INSERT INTO usuarios (id,nome,ativo) VALUES (1,'Ana',1),(2,'Lucas',1),(3,'Gestora',1),(4,'Saiu Da Empresa',0);
  INSERT INTO modelo (id,codigo,nome,sob_medida) VALUES (1,'ROLO','Rolô',0),(2,'SOBMEDIDA','Sob medida',1);
  INSERT INTO skus (codigo,estoque,modelo_id) VALUES ('BK140140BEGE',5,1),('BK120120BEGE',3,1),('BK160160CINZA',4,1),('SOBMEDIDA',0,2);`);

const auditado = [];
const PODE = { 3:['cancelamento.confirmar'], 2:['cancelamento.confirmar'] };   // a Gestora e o Lucas confirmam; a Ana nao
const rotas = {};
const app = { get:(p,...h)=>{ rotas['GET '+p]=h[h.length-1]; }, post:(p,...h)=>{ rotas['POST '+p]=h[h.length-1]; }, use:()=>{},
  locals:{ acesso:{ auditar(req,a,b,c,d){ auditado.push([b,c,d]); },
                    podePermissao(u,c){ return !!(u && (PODE[u.id]||[]).includes(c)); } } } };
require('./exp_route')(app, db);
require('./carreg_route')(app, db);
require('./saida_route')(app, db);
const ESTOQUE = require('./estoque_dominio'); ESTOQUE.garantirSchema(db); ESTOQUE.abertura(db);
require('./correcoes').garantirSchema(db);
const { AGUARDA_CAMINHAO } = require('./carga');

const ANA = {id:1, nome:'Ana'}, LUCAS = {id:2, nome:'Lucas'}, GESTORA = {id:3, nome:'Gestora'};
const chamar = (k, body, usuario) => new Promise(r => {
  if(!rotas[k]) return r({ __sem_rota:k });
  let st = 200;
  const res = { json:o=>r(Object.assign({__st:st}, o)), status(n){ st = n; return res; }, send:o=>r(o), setHeader(){} };
  try{ rotas[k]({ body:body||{}, params:{}, query:{}, headers:{}, usuario:usuario===undefined?LUCAS:usuario }, res); }
  catch(e){ r({ __st:500, __erro:String(e.stack||e) }); }
});
const lote = id => db.prepare('SELECT * FROM lote WHERE id=?').get(id);
const saldo = c => db.prepare('SELECT estoque FROM skus WHERE codigo=?').get(c).estoque;
const livroFecha = () => db.prepare(`SELECT s.codigo FROM skus s
  WHERE s.estoque <> COALESCE((SELECT SUM(delta) FROM movimento_estoque m WHERE m.codigo=s.codigo),0)`).all().length === 0;
function volume(o){ const c = Object.keys(o);
  return db.prepare('INSERT INTO lote ('+c.join(',')+') VALUES ('+c.map(()=>'?').join(',')+')').run(c.map(k=>o[k])).lastInsertRowid; }
const peca = (lid, cod, qtd) => db.prepare('INSERT INTO lote_item (lote_id,codigo,qtd,conferidos) VALUES (?,?,?,?)').run(lid,cod,qtd,qtd);
const HOJE = db.prepare("SELECT date('now','localtime') d").get().d;
const ONTEM = db.prepare("SELECT date('now','localtime','-1 day') d").get().d;
const H9 = HOJE + ' 09:00:00';
let n = 0;
const venda = () => '20000180000' + String(10000 + (++n));
function caixa(o){ const v = venda(); return volume(Object.assign({codigo:'BK140140BEGE', buyer:'Cliente '+n, nf:String(8000+n),
  venda:v, codes:JSON.stringify([v]), embalado_em:H9, data:HOJE, despachar_em:HOJE}, o)); }
const FOTO = 'data:image/jpeg;base64,' + Buffer.alloc(3000, 7).toString('base64');
const codeDe = id => JSON.parse(lote(id).codes)[0];

(async () => {
  let r;
  /* ════════════════════════ FASE 2 ════════════════════════ */
  console.log('\n=== FASE 2 · a agencia fecha como a coleta ===\n');
  const a1 = caixa({estagio:'embalado', modalidade:'agencia', conferido_em:H9, conferido_por:'Ana', baixado_em:H9});
  const a2 = caixa({estagio:'embalado', modalidade:'agencia', conferido_em:H9, conferido_por:'Ana', baixado_em:H9});
  const a3 = caixa({estagio:'embalado', modalidade:'agencia', conferido_em:H9, conferido_por:'Ana', baixado_em:H9});
  const aSem = caixa({estagio:'embalado', modalidade:'agencia'});
  const c1 = caixa({estagio:'carregado', modalidade:'coleta', carregado_em:H9, conferido_em:H9, conferido_por:'Ana', baixado_em:H9});
  ok('a coluna de quem levou existe na saida', db.prepare("PRAGMA table_info(saida)").all().some(c => c.name === 'quem_levou_id')
     && db.prepare("PRAGMA table_info(saida)").all().some(c => c.name === 'quem_levou'));
  r = await chamar('POST /api/viagem/abrir', {});
  ok('abrir a viagem poe no carro TODAS as conferidas de agencia', r.ok && r.sistema === 3, r);
  ok('   e nao a nao conferida, nem a de coleta do canto', !r.lista.some(v => v.id === aSem || v.id === c1), r.lista && r.lista.map(v=>v.id));
  const v1 = r.viagem.id;
  ok('   cada uma fica no carro desta viagem', [a1,a2,a3].every(id => lote(id).saida_id === v1 && lote(id).estagio === 'carregado'));
  r = await chamar('POST /api/viagem/ficou', {code:codeDe(a3)});
  ok('o bipe "ficou na fabrica" tira a caixa do carro', r.ok && r.sistema === 2, r);
  ok('   e ela volta a area, conferida', lote(a3).estagio === 'embalado' && !lote(a3).saida_id && !!lote(a3).conferido_em, lote(a3));
  r = await chamar('POST /api/viagem/ficou', {code:codeDe(a3)});
  ok('bipar de novo a que ja ficou diz que ela nao esta no carro', r.ok === false && r.motivo === 'fora_do_carro', r);
  r = await chamar('POST /api/viagem/ficou', {code:'99999999'});
  ok('codigo que nao existe: nao_encontrado', r.ok === false && r.motivo === 'nao_encontrado', r);
  const aDepois = caixa({estagio:'embalado', modalidade:'agencia', conferido_em:H9, conferido_por:'Ana', baixado_em:H9});
  r = await chamar('GET /api/viagem/aberta');
  ok('a conferida DEPOIS de abrir nao entra sozinha (o carro ja saiu)', r.sistema === 2 && r.prontas.some(v => v.id === aDepois), r);
  r = await chamar('POST /api/viagem/fechar', {atendente:2, foto:FOTO});
  ok('fechar SEM quem levou e recusado', r.ok === false && r.motivo === 'sem_quem_levou' && !!r.aviso, r);
  r = await chamar('POST /api/viagem/fechar', {atendente:2, foto:FOTO, quem_levou_id:4});
  ok('   pessoa desativada no cadastro tambem e recusada', r.ok === false && r.motivo === 'sem_quem_levou', r);
  r = await chamar('POST /api/viagem/fechar', {atendente:2, foto:FOTO, quem_levou_id:999});
  ok('   e pessoa que nao existe', r.ok === false && r.motivo === 'sem_quem_levou', r);
  r = await chamar('POST /api/viagem/fechar', {atendente:2, quem_levou_id:1});
  ok('sem a foto nao fecha', r.ok === false && r.motivo === 'sem_foto', r);
  r = await chamar('POST /api/viagem/fechar', {atendente:3, foto:FOTO, quem_levou_id:1});
  ok('numero que nao bate nao fecha', r.ok === false && r.motivo === 'divergente', r);
  ok('   e nada anda', !lote(a1).saiu_em);
  r = await chamar('POST /api/viagem/fechar', {atendente:2, foto:FOTO, quem_levou_id:1});
  ok('bateu, com foto e quem levou: fecha', r.ok === true && r.divergente === false, r);
  const sv = db.prepare('SELECT * FROM saida WHERE id=?').get(v1);
  eq('   grava quem LEVOU (pessoa do cadastro)', [sv.quem_levou_id, sv.quem_levou], [1, 'Ana']);
  eq('   e quem FECHOU (o login), que pode ser outra pessoa', sv.fechado_por, 'Lucas');
  ok('   com a foto e os dois numeros', !!sv.foto && sv.qtd_sistema === 2 && sv.qtd_externa === 2, sv);
  ok('   as caixas saem pela agencia', [a1,a2].every(id => lote(id).saiu_por === 'agencia' && !!lote(id).saiu_em));
  ok('   e a que ficou nao saiu', !lote(a3).saiu_em);
  r = await chamar('GET /api/carregamento');
  ok('a tela recebe quem levou na viagem do dia', ((r.carro||{}).viagens_hoje||[]).some(v => v.quem_levou === 'Ana'), (r.carro||{}).viagens_hoje);
  r = await chamar('GET /api/auth/pessoas');   // a lista vem do auth.js; aqui so confirmamos que a tela tem de onde tirar
  ok('a lista de pessoas para "quem levou" vem do cadastro ativo (rota do auth.js)', /\/api\/auth\/pessoas/.test(fs.readFileSync(path.join(__dirname,'public','carregamento.html'),'utf8')));

  /* ════════════════════════ FASE 3 ════════════════════════ */
  console.log('\n=== FASE 3 · a coleta nao passou ===\n');
  const f1 = caixa({estagio:'carregado', modalidade:'coleta', carregado_em:H9, conferido_em:H9, conferido_por:'Ana', baixado_em:H9});
  const f2 = caixa({estagio:'embalado', modalidade:'coleta'});
  const semMarca = caixa({estagio:'embalado', modalidade:'agencia', conferido_em:H9, conferido_por:'Ana', baixado_em:H9});
  const antesF = { f1:JSON.stringify(lote(f1)), f2:JSON.stringify(lote(f2)), s:saldo('BK140140BEGE') };
  r = await chamar('POST /api/carregamento/fimdia', {});
  ok('"a coleta nao passou hoje" registra', r.ok === true && r.fim_dia && r.fim_dia.n >= 3, r);
  eq('   com quem registrou', r.fim_dia && r.fim_dia.por, 'Lucas');
  eq('   a caixa nao muda NADA (estagio, saida, conferencia)', [JSON.stringify(lote(f1)), JSON.stringify(lote(f2))], [antesF.f1, antesF.f2]);
  eq('   e o saldo tambem nao', saldo('BK140140BEGE'), antesF.s);
  r = await chamar('POST /api/carregamento/fimdia', {}, ANA);
  eq('registrar de novo no mesmo dia nao abre outra linha', db.prepare('SELECT COUNT(*) n FROM fim_dia WHERE dia=?').get(HOJE).n, 1);
  eq('   e diz quem registrou por ultimo', r.fim_dia && r.fim_dia.por, 'Ana');
  r = await chamar('GET /api/carregamento');
  eq('a tela sabe que hoje ja foi registrado', !!(r.fim_dia && r.fim_dia.hoje), true);
  ok('   e hoje a caixa NAO leva a marca (a marca e do dia seguinte)', !(r.coleta.aguardando.find(v => v.id === f1) || {}).ficou_de);
  // vira o dia: o registro passa a ser de ontem
  db.prepare('UPDATE fim_dia SET dia=?').run(ONTEM);
  // uma caixa que nao estava no registro
  const g = caixa({estagio:'carregado', modalidade:'coleta', carregado_em:H9, conferido_em:H9, baixado_em:H9});
  r = await chamar('GET /api/carregamento');
  eq('no dia seguinte, a caixa do canto vem com a marca de ontem', (r.coleta.aguardando.find(v => v.id === f1) || {}).ficou_de, ONTEM);
  eq('   a impressa nao conferida tambem', (r.coleta.faltam.find(v => v.id === f2) || {}).ficou_de, ONTEM);
  ok('   a que nao estava no registro vem sem marca', !(r.coleta.aguardando.find(v => v.id === g) || {}).ficou_de);
  eq('   e a tela recebe o dia de hoje, para dizer "de ontem"', r.hoje, HOJE);
  ok('caixa sem marcacao continua na lista, como "nao saiu" (nunca cancelada)',
     (r.faltam||[]).some(v => v.id === semMarca) && lote(semMarca).estagio === 'embalado');
  const h = fs.readFileSync(path.join(__dirname,'public','carregamento.html'),'utf8');
  const m = h.match(/function listaUnica\([\s\S]*?\n\}/);
  if(m){
    const f = new Function(m[0] + '; return listaUnica;')();
    const u = f(r);
    ok('na lista unica, a marcada vem EM CIMA', u.conferidas[0] && u.conferidas[0].ficou_de === ONTEM, u.conferidas.slice(0,3));
    ok('   e na de esperando tambem', u.esperando[0] && u.esperando[0].ficou_de === ONTEM, u.esperando.slice(0,3));
  } else ok('a tela tem a listaUnica', false);

  /* ════════════════════════ FASE 4 ════════════════════════ */
  console.log('\n=== FASE 4 · a venda cancelada em duas pessoas ===\n');
  const SOBRA = 'POST /api/carregamento/sobra', CONF = 'POST /api/carregamento/cancelada/confirmar', REC = 'POST /api/carregamento/cancelada/recusar';
  ok('as rotas de confirmar e recusar existem', !!rotas[CONF] && !!rotas[REC]);
  const SRC_ACESSO = fs.readFileSync(path.join(__dirname,'acesso.js'),'utf8');
  ok('o permDaRota declara as duas com a chave nova', /cancelada\/confirmar[\s\S]{0,200}cancelamento\.confirmar/.test(SRC_ACESSO)
     && /cancelada\/recusar[\s\S]{0,200}cancelamento\.confirmar|cancelada\/(confirmar|recusar)[\s\S]{0,120}cancelamento\.confirmar/.test(SRC_ACESSO));
  const PERM = require('./permissoes');
  const lp = (PERM.PERMISSOES || PERM.LISTA || PERM).find ? (PERM.PERMISSOES || PERM.LISTA || PERM).find(p => p.chave === 'cancelamento.confirmar') : null;
  ok('a chave existe e e SENSIVEL', !!lp && lp.sensivel === true, lp);
  ok('   de nivel supervisor (nivel admin vira admin do PCP, #34)', !!lp && lp.nivel === 'supervisor', lp);
  ok('   e tem backfill de uma vez so para Supervisor e Admin', /seed_cancelamento_confirmar/.test(SRC_ACESSO));

  const X = caixa({estagio:'embalado', modalidade:'agencia', conferido_em:H9, conferido_por:'Ana', baixado_em:H9});
  const P = caixa({codigo:'BK120120BEGE', estagio:'carregado', modalidade:'coleta', carregado_em:H9, conferido_em:H9, conferido_por:'Joao', baixado_em:H9});
  peca(P,'BK120120BEGE',2); peca(P,'BK160160CINZA',1);
  const SM = caixa({codigo:'SOBMEDIDA', estagio:'embalado', modalidade:'agencia', conferido_em:H9, conferido_por:'Joao', baixado_em:H9});
  const NB = caixa({codigo:'BK160160CINZA', estagio:'embalado', modalidade:'agencia'});   // impressa, nunca conferida
  const R1 = caixa({estagio:'carregado', modalidade:'coleta', carregado_em:H9, conferido_em:H9, conferido_por:'Joao', baixado_em:H9});
  const s0 = { a:saldo('BK140140BEGE'), b:saldo('BK120120BEGE'), c:saldo('BK160160CINZA') };

  r = await chamar(SOBRA, {id:X, skus:['BK140140BEGE'], motivo:'cancelada', confirmar:true}, ANA);
  ok('quem CONFERIU a caixa nao a marca (D8)', r.ok === false && r.motivo === 'mesma_pessoa', r);
  r = await chamar(SOBRA, {id:X, skus:['BK140140BEGE'], motivo:'cancelada', confirmar:true}, LUCAS);
  ok('o operador marca a venda cancelada', r.ok === true && r.aguardando === true, r);
  eq('   MARCAR NAO MEXE NO SALDO', saldo('BK140140BEGE'), s0.a);
  eq('   a caixa sai das listas (vira cancelada, separada)', lote(X).estagio, 'cancelado');
  ok('   mas NAO fica decidida', !lote(X).cancelada_resolvida_em, lote(X));
  ok('   e o aviso manda separar e esperar a confirmacao', /separe/i.test(r.aviso||'') && /confirma/i.test(r.aviso||''), r.aviso);
  r = await chamar('GET /api/carregamento');
  ok('   nao esta mais na lista de saida', !(r.faltam||[]).some(v => v.id === X));
  r = await chamar(SOBRA, {id:X, skus:['BK140140BEGE'], motivo:'cancelada', confirmar:true}, GESTORA);
  ok('marcar de novo a mesma caixa e recusado', r.ok === false && r.motivo === 'ja_marcada', r);
  r = await chamar('GET /api/carregamento/sobras', {}, GESTORA);
  const pX = (r.aguardando||[]).find(p => p.lote_id === X);
  ok('a lista "Canceladas, aguardando confirmacao" traz a caixa', !!pX, r);
  eq('   e diz se quem olha pode confirmar', r.pode_confirmar, true);
  r = await chamar('GET /api/carregamento/sobras', {}, ANA);
  eq('   (a Ana nao pode)', r.pode_confirmar, false);

  r = await chamar(CONF, {id:pX.id}, LUCAS);
  ok('quem MARCOU nao confirma', r.ok === false && r.motivo === 'mesma_pessoa', r);
  r = await chamar(CONF, {id:pX.id}, ANA);
  ok('quem nao tem a permissao recebe 403', r.__st === 403, r);
  eq('   e o saldo nao mexeu', saldo('BK140140BEGE'), s0.a);
  r = await chamar(CONF, {id:pX.id}, GESTORA);
  ok('a gestao confirma', r.ok === true, r);
  eq('   +1 no saldo (a caixa tinha baixado)', saldo('BK140140BEGE'), s0.a + 1);
  ok('   a caixa fica decidida, por quem confirmou', !!lote(X).cancelada_resolvida_em && lote(X).cancelada_resolvida_por === 'Gestora', lote(X));
  const cx = db.prepare('SELECT * FROM cancelamento_caixa WHERE id=?').get(pX.id);
  eq('   o pedido guarda quem marcou, quem confirmou, o cliente e o que moveu',
     [cx.situacao, cx.marcado_por, cx.decidido_por, cx.buyer, JSON.parse(cx.estoque)], ['confirmada','Lucas','Gestora',lote(X).buyer,[{codigo:'BK140140BEGE',delta:1}]]);
  ok('   e vai para a auditoria', auditado.some(x => x[0] === 'cancelamento_confirmado'), auditado.slice(-2));
  r = await chamar(CONF, {id:pX.id}, GESTORA);
  ok('confirmar DUAS vezes nao soma duas', r.ok === false && r.motivo === 'ja_decidido' && saldo('BK140140BEGE') === s0.a + 1, r);
  ok('o livro fecha', livroFecha());

  r = await chamar(SOBRA, {id:P, skus:['BK120120BEGE','BK160160CINZA','BK120120BEGE'], motivo:'motorista', confirmar:true}, ANA);
  ok('o pacote de 3 persianas e marcado com o bipe de cada uma', r.ok === true, r);
  ok('   e sai do canto do caminhao', !db.prepare('SELECT 1 FROM lote WHERE id=? AND ' + AGUARDA_CAMINHAO).get(P));
  eq('   sem mexer no saldo', [saldo('BK120120BEGE'), saldo('BK160160CINZA')], [s0.b, s0.c]);
  const pP = (await chamar('GET /api/carregamento/sobras', {}, GESTORA)).aguardando.find(p => p.lote_id === P);
  r = await chamar(CONF, {id:pP.id}, GESTORA);
  eq('confirmar o pacote soma POR PECA: 2 de BK120 e 1 de BK160', [saldo('BK120120BEGE'), saldo('BK160160CINZA')], [s0.b + 2, s0.c + 1]);

  r = await chamar(SOBRA, {id:SM, skus:[], motivo:'cancelada', confirmar:true}, ANA);
  const pSM = (await chamar('GET /api/carregamento/sobras', {}, GESTORA)).aguardando.find(p => p.lote_id === SM);
  r = await chamar(CONF, {id:pSM.id}, LUCAS);
  ok('o sob medida e confirmado', r.ok === true, r);
  eq('   e NAO volta ao estoque (nunca teve saldo)', db.prepare("SELECT COUNT(*) n FROM movimento_estoque WHERE codigo='SOBMEDIDA'").get().n, 0);

  const cNB = saldo('BK160160CINZA');
  r = await chamar(SOBRA, {id:NB, skus:['BK160160CINZA'], motivo:'cancelada', confirmar:true}, ANA);
  const pNB = (await chamar('GET /api/carregamento/sobras', {}, GESTORA)).aguardando.find(p => p.lote_id === NB);
  r = await chamar(CONF, {id:pNB.id}, GESTORA);
  ok('a impressa que NUNCA baixou e confirmada', r.ok === true, r);
  eq('   e o saldo NAO sobe (a peca nunca saiu, so estava reservada)', saldo('BK160160CINZA'), cNB);

  r = await chamar(SOBRA, {id:R1, skus:['BK140140BEGE'], motivo:'outro', texto:'cliente ligou', confirmar:true}, LUCAS);
  const pR = (await chamar('GET /api/carregamento/sobras', {}, GESTORA)).aguardando.find(p => p.lote_id === R1);
  r = await chamar(REC, {id:pR.id}, GESTORA);
  ok('recusar sem motivo e recusado', r.ok === false && r.motivo === 'sem_motivo', r);
  r = await chamar(REC, {id:pR.id, motivo:'No ML a venda segue ativa'}, LUCAS);
  ok('quem marcou nao recusa (mesmo tendo a permissao)', r.ok === false && r.motivo === 'mesma_pessoa', r);
  const sR = saldo('BK140140BEGE');
  r = await chamar(REC, {id:pR.id, motivo:'No ML a venda segue ativa'}, GESTORA);
  ok('a gestao recusa com motivo', r.ok === true, r);
  ok('   a caixa VOLTA para o canto do caminhao', !!db.prepare('SELECT 1 FROM lote WHERE id=? AND ' + AGUARDA_CAMINHAO).get(R1), lote(R1));
  ok('   sem marca de cancelada', lote(R1).estagio === 'carregado' && !lote(R1).cancelada_em && !lote(R1).cancelada_origem, lote(R1));
  eq('   e o saldo nao mexeu', saldo('BK140140BEGE'), sR);
  const cr = db.prepare('SELECT * FROM cancelamento_caixa WHERE id=?').get(pR.id);
  eq('   a recusa fica registrada, com quem e por que', [cr.situacao, cr.decidido_por, cr.decisao_motivo], ['recusada','Gestora','No ML a venda segue ativa']);
  r = await chamar(CONF, {id:pR.id}, GESTORA);
  ok('   e o pedido recusado nao se confirma depois', r.ok === false && r.motivo === 'ja_decidido', r);

  // a de agencia que estava NO CARRO volta a area, conferida
  r = await chamar('POST /api/viagem/abrir', {});
  const A9 = caixa({estagio:'embalado', modalidade:'agencia', conferido_em:H9, conferido_por:'Joao', baixado_em:H9});
  await chamar('POST /api/viagem/carro', {code:codeDe(A9)});
  ok('(a caixa de agencia esta no carro)', lote(A9).estagio === 'carregado' && !!lote(A9).saida_id);
  await chamar(SOBRA, {id:A9, skus:['BK140140BEGE'], motivo:'cancelada', confirmar:true}, ANA);
  ok('marcada, ela sai do carro', !lote(A9).saida_id, lote(A9));
  const pA9 = (await chamar('GET /api/carregamento/sobras', {}, GESTORA)).aguardando.find(p => p.lote_id === A9);
  r = await chamar(REC, {id:pA9.id, motivo:'engano'}, GESTORA);
  ok('recusada, a caixa de agencia volta a AREA, conferida', lote(A9).estagio === 'embalado' && !lote(A9).carregado_em && !!lote(A9).conferido_em, lote(A9));

  // a cancelada pelo relatorio do ML: recusar nao a "descancela"
  const ML = caixa({estagio:'cancelado', cancelada_estagio:'embalado', cancelada_em:H9, cancelada_origem:'planilha',
    cancelada_motivo:'Cancelada pelo comprador', modalidade:'agencia', baixado_em:H9});
  r = await chamar('GET /api/carregamento/sobras', {}, GESTORA);
  ok('a cancelada no ML ainda na fabrica aparece como "a separar"', (r.caixas||[]).some(c => c.id === ML), r.caixas);
  await chamar(SOBRA, {id:ML, skus:['BK140140BEGE'], motivo:'cancelada', confirmar:true}, ANA);
  r = await chamar('GET /api/carregamento/sobras', {}, GESTORA);
  ok('   depois de marcada, sai de "a separar" e vai para "aguardando confirmacao"',
     !(r.caixas||[]).some(c => c.id === ML) && (r.aguardando||[]).some(p => p.lote_id === ML), r);
  ok('   e sai do card da Mesa (a decisao dela e a confirmacao)', !require('./cancelada_dominio').listar(db).some(v => v.id === ML));
  const pML = r.aguardando.find(p => p.lote_id === ML);
  r = await chamar(REC, {id:pML.id, motivo:'confirmar depois'}, GESTORA);
  eq('recusar a cancelada pelo ML deixa ela cancelada (o ML cancelou)', lote(ML).estagio, 'cancelado');
  ok('   e ela volta a esperar a separacao', (await chamar('GET /api/carregamento/sobras', {}, GESTORA)).caixas.some(c => c.id === ML));

  r = await chamar('POST /api/carregar', {code:codeDe(X)});
  ok('o bipe da conferencia recusa a caixa cancelada confirmada', r.ok === false && r.motivo === 'cancelada', r);
  ok('o livro fecha depois de tudo', livroFecha());

  console.log('\n=== A CENTRAL DE PENDENCIAS conta as canceladas da Conferencia ===\n');
  const PEND = require('./pendencias_dominio');
  const linha = PEND.resumo(db).linhas.find(l => l.chave === 'sobras') || {};
  ok('a linha existe e conta aguardando + a separar', linha.n === (await chamar('GET /api/carregamento/sobras', {}, GESTORA)).aguardando.length
     + (await chamar('GET /api/carregamento/sobras', {}, GESTORA)).caixas.length, linha);
  ok('   e diz que a confirmacao e da permissao nova', /confirmar/i.test(linha.quem || ''), linha);

  console.log('\n' + casos + ' casos · ' + falhas + ' falha(s)\n');
  try{ fs.rmSync(tmp, {recursive:true, force:true}); }catch(e){}
  process.exit(falhas ? 1 : 0);
})();

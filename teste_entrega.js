#!/usr/bin/env node
/* Testes da spec CONFERENCIA-CARRINHOS, fase 2 — a ENTREGA por carrinho.
 *
 *   node teste_entrega.js
 *
 * Escrito ANTES do código (§0, risco 🔴). Substitui, para a tela nova, a saída
 * do caminhão (R-SAI-01 a 03) e a viagem à agência (R-VIA-01/04). O que trava:
 * - R-ENT-02: a prévia lista as caixas impressas e não bipadas da modalidade;
 * - R-ENT-03: entregar um carrinho e deixar o outro; não se bipam sobras;
 * - R-ENT-04: sem foto não fecha; na agência, quem levou (pessoa ativa);
 * - R-ENT-05: não existe "foi sem conferir"; número diferente não fecha e não
 *   grava nada; liberar exige motivo (a chave saida.liberar é do permDaRota);
 * - R-ENT-06: o Carro da agência pode ir ao motorista, com saiu_por='coleta' e a
 *   modalidade intacta; carrinho de coleta não vai à agência;
 * - R-ENT-07: fechar grava saida_id, saiu_em, saiu_por e retirado_em, e NÃO
 *   mexe no estoque (a baixa já foi no bipe).
 */
const Database = require('better-sqlite3');
const fs = require('fs'), os = require('os'), path = require('path');

const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'pcp-entrega-'));
process.env.PCP_DIR = tmp;

let falhas = 0, casos = 0;
const ok = (n, c, extra) => { casos++;
  if(c) console.log('ok      ' + n);
  else { falhas++; console.log('FALHOU  ' + n + (extra ? '   ' + extra : '')); } };

const db = new Database(path.join(tmp, 't.db'));
const rotas = {};
const app = { get:(p,...h)=>{ rotas['GET '+p]=h[h.length-1]; },
              post:(p,...h)=>{ rotas['POST '+p]=h[h.length-1]; },
              delete:(p,...h)=>{ rotas['DELETE '+p]=h[h.length-1]; },
              use:()=>{}, locals:{ acesso:{ auditar(){}, podePermissao(){ return true; } } } };
db.exec(`CREATE TABLE IF NOT EXISTS modelo (id INTEGER PRIMARY KEY AUTOINCREMENT, codigo TEXT, nome TEXT,
    exige_medida INTEGER DEFAULT 1, sob_medida INTEGER DEFAULT 0);
  CREATE TABLE IF NOT EXISTS skus (codigo TEXT PRIMARY KEY, descricao TEXT DEFAULT '', cor TEXT DEFAULT '',
    estoque INTEGER DEFAULT 0, alvo INTEGER DEFAULT 0, modelo_id INTEGER);
  CREATE TABLE IF NOT EXISTS usuarios (id INTEGER PRIMARY KEY, nome TEXT, ativo INTEGER DEFAULT 1);`);
db.prepare("INSERT INTO usuarios (id,nome,ativo) VALUES (1,'Ana',1),(2,'Beto',1),(3,'Caio',0)").run();
db.prepare("INSERT INTO skus (codigo,estoque) VALUES ('BK140140BEGE',100)").run();
require('./estoque_dominio').garantirSchema(db);
require('./exp_route')(app, db);
require('./cad_route')(app, db);
require('./carreg_route')(app, db);
require('./saida_route')(app, db);
require('./carrinho_route')(app, db);

const chamar = (k, body, usuario, params, query) => new Promise(r => {
  if(!rotas[k]) return r({ __sem_rota:k });
  const res = { _s:200, json:o=>r(Object.assign({__status:res._s}, o)), status(s){ res._s=s; return res; },
                send:o=>r({ __send:o, __status:res._s }), setHeader(){}, type(){ return res; } };
  try{ rotas[k]({ body:body||{}, params:params||{}, query:query||{}, headers:{}, usuario:usuario||null }, res); }
  catch(e){ r({ __erro:e.message }); }
});
const ANA = {id:1,nome:'Ana'}, BETO = {id:2,nome:'Beto'};
const FOTO = 'data:image/jpeg;base64,' + Buffer.alloc(3000, 7).toString('base64');
const q1 = s => db.prepare(s).get();
const hoje = q1("SELECT date('now','localtime') d").d;
const lote = id => db.prepare('SELECT * FROM lote WHERE id=?').get(id);
const saldo = () => db.prepare("SELECT estoque FROM skus WHERE codigo='BK140140BEGE'").get().estoque;
const vol = (buyer, mod) => db.prepare(`INSERT INTO lote (codigo,buyer,nf,packId,codes,estagio,data,despachar_em,modalidade,
    embalado_em,impresso_por,impresso_por_id) VALUES ('BK140140BEGE',?,?,?,?,'embalado',?,?,?,datetime('now','localtime'),'Beto',2)`)
  .run(buyer, 'NF'+buyer, 'P'+buyer, JSON.stringify(['P'+buyer]), hoje, hoje, mod).lastInsertRowid;
const bipa = (buyer, carrinho) => chamar('POST /api/carregar', {code:'P'+buyer, carrinho}, ANA);

(async () => {
  const a1 = vol('A1','coleta'), a2 = vol('A2','coleta'), b1 = vol('B1','coleta');
  const g1 = vol('G1','agencia'), g2 = vol('G2','agencia');
  const solta = vol('Solta','coleta');                       // impressa, ninguém bipou
  await bipa('A1','A'); await bipa('A2','A'); await bipa('B1','B'); await bipa('G1','A'); await bipa('G2','A');
  ok('preparação: A=2, B=1, AG=2', lote(a1).carrinho==='A' && lote(b1).carrinho==='B' && lote(g1).carrinho==='AG');
  const s0 = saldo();

  // ── R-ENT-02: a prévia ──
  let r = await chamar('GET /api/entrega/previa', {}, ANA, {}, {destinos:'A'});
  ok('a prévia diz quantas caixas o carrinho tem', r.ok === true && r.sistema === 2, JSON.stringify(r));
  ok('...e as impressas sem bipe da coleta', (r.faltam_bipar||[]).length === 1 && r.faltam_bipar[0].id === solta, JSON.stringify(r.faltam_bipar));

  ok('a prévia traz as peças da caixa (a de várias conta persiana, R-VOL-02)', Array.isArray((r.faltam_bipar[0]||{}).itens), JSON.stringify(r.faltam_bipar[0]));
  ok('...e cada caixa do destino diz se é adiantada', r.caixas.every(c => 'adiantada' in c), JSON.stringify(r.caixas[0]));

  // ── validações ──
  r = await chamar('POST /api/entrega/fechar', {destinos:[], para:'motorista', numero:2, foto:FOTO}, ANA);
  ok('sem destino não fecha', r.ok === false && r.motivo === 'sem_destino', JSON.stringify(r));
  r = await chamar('POST /api/entrega/fechar', {destinos:['A'], para:'motorista', numero:2}, ANA);
  ok('sem foto não fecha', r.ok === false && r.motivo === 'sem_foto' && !lote(a1).saida_id, JSON.stringify(r));
  r = await chamar('POST /api/entrega/fechar', {destinos:['A'], para:'agencia', numero:2, foto:FOTO, quem_levou_id:1}, ANA);
  ok('carrinho de coleta não vai à agência', r.ok === false && r.motivo === 'para_invalido', JSON.stringify(r));
  r = await chamar('POST /api/entrega/fechar', {destinos:['A'], para:'motorista', numero:'2abc', foto:FOTO}, ANA);
  ok('número que não é número ("2abc") é recusado, e não lido como 2', r.ok === false && r.motivo === 'sem_numero', JSON.stringify(r));
  r = await chamar('POST /api/entrega/fechar', {destinos:['A'], para:'motorista', numero:3, foto:FOTO}, ANA);
  ok('número diferente não fecha', r.ok === false && r.motivo === 'divergente' && r.sistema === 2, JSON.stringify(r));
  ok('...e não grava nada', !lote(a1).saida_id && !lote(a2).saida_id && q1('SELECT COUNT(*) n FROM saida').n === 0);
  ok('...e a resposta NÃO oferece "foi sem conferir"', !('levou' in r) && !('pode_ter_ido' in r));
  r = await chamar('POST /api/entrega/liberar', {destinos:['A'], para:'motorista', numero:3, foto:FOTO}, ANA);
  ok('liberar com divergência exige motivo', r.ok === false && r.motivo === 'sem_motivo', JSON.stringify(r));

  // ── R-ENT-03/07: entregar o A e deixar o B ──
  r = await chamar('POST /api/entrega/fechar', {destinos:['A'], para:'motorista', numero:2, foto:FOTO}, BETO);
  ok('entregar o A com o número certo fecha', r.ok === true && r.sistema === 2 && r.id, JSON.stringify(r));
  const sA = lote(a1);
  ok('as caixas do A ganham a saída, saiu_por coleta e retirado_em', sA.saida_id === r.id && sA.saiu_por === 'coleta'
     && sA.saiu_em && sA.retirado_em && lote(a2).saida_id === r.id, JSON.stringify(sA));
  ok('o B continua na fábrica', !lote(b1).saida_id && lote(b1).carrinho === 'B');
  ok('entregar não mexe no estoque (a baixa foi no bipe)', saldo() === s0);
  const sd = q1('SELECT * FROM saida WHERE id='+r.id);
  ok('a saída grava quem fechou, a foto, os números e os carrinhos', sd.fechado_por_id === 2 && sd.foto && sd.qtd_sistema === 2
     && sd.qtd_externa === 2 && sd.divergente === 0 && JSON.parse(sd.carrinhos||'[]').join() === 'A', JSON.stringify(sd));
  r = await chamar('GET /api/entrega/previa', {}, ANA, {}, {destinos:'A'});
  ok('depois de entregue, o A está vazio', r.sistema === 0, JSON.stringify(r));
  r = await chamar('POST /api/entrega/fechar', {destinos:['A'], para:'motorista', numero:0, foto:FOTO}, ANA);
  ok('carrinho vazio não se entrega', r.ok === false && r.motivo === 'vazio', JSON.stringify(r));

  // ── R-ENT-04: a agência com quem levou ──
  r = await chamar('POST /api/entrega/fechar', {destinos:['AG'], para:'agencia', numero:2, foto:FOTO}, ANA);
  ok('agência sem quem levou não fecha', r.ok === false && r.motivo === 'sem_quem_levou', JSON.stringify(r));
  r = await chamar('POST /api/entrega/fechar', {destinos:['AG'], para:'agencia', numero:2, foto:FOTO, quem_levou_id:3}, ANA);
  ok('quem levou tem que ser pessoa ativa', r.ok === false && r.motivo === 'sem_quem_levou', JSON.stringify(r));

  // ── R-ENT-06: o Carro da agência vai ao motorista junto com o B ──
  r = await chamar('POST /api/entrega/fechar', {destinos:['B','AG'], para:'motorista', numero:3, foto:FOTO}, ANA);
  ok('B + Carro da agência ao motorista fecha', r.ok === true && r.sistema === 3, JSON.stringify(r));
  ok('a caixa de agência sai por coleta e continua modalidade agência',
     lote(g1).saiu_por === 'coleta' && lote(g1).modalidade === 'agencia' && lote(g1).estagio === 'carregado', JSON.stringify(lote(g1)));

  // ── a agência pelo carro, com liberação ──
  const g3 = vol('G3','agencia'); await bipa('G3','B');
  r = await chamar('POST /api/entrega/liberar', {destinos:['AG'], para:'agencia', numero:2, foto:FOTO, quem_levou_id:1,
    motivo:'atendente contou duas'}, BETO);
  ok('liberar com motivo fecha a agência mesmo diferente', r.ok === true && r.divergente === true, JSON.stringify(r));
  const sg = q1('SELECT * FROM saida WHERE id='+r.id);
  ok('...com quem levou, quem liberou e o motivo', sg.tipo === 'agencia' && sg.quem_levou_id === 1 && sg.liberado_por_id === 2
     && sg.motivo === 'atendente contou duas' && sg.divergente === 1, JSON.stringify(sg));
  ok('a caixa de agência pelo carro sai por agência', lote(g3).saiu_por === 'agencia' && lote(g3).saiu_em, JSON.stringify(lote(g3)));
  ok('a caixa solta (sem bipe) nunca saiu', !lote(solta).saida_id && lote(solta).estagio === 'embalado');

  console.log('\n' + (casos - falhas) + ' de ' + casos + ' casos passaram');
  try{ fs.rmSync(tmp, {recursive:true, force:true}); }catch(e){}
  process.exit(falhas ? 1 : 0);
})();

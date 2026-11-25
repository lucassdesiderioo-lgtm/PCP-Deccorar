#!/usr/bin/env node
/* Testes da spec CONFERENCIA-CARRINHOS, fase 1 — o CARRINHO na 202 Conferência.
 *
 *   node teste_carrinhos.js
 *
 * Escrito ANTES do código (§0, risco 🔴). O que estes casos travam:
 * - R-CRR-01/02: o bipe não tem modo. A caixa de COLETA vai para o carrinho
 *   ativo (e é recusada sem carrinho escolhido); a de AGÊNCIA vai sozinha para o
 *   Carro da agência ('AG'), mesmo com um carrinho escolhido;
 * - a baixa continua no bipe, por peça, uma vez só (R-EST-03), e "quem imprimiu
 *   não confere" continua valendo (R-SEG-01);
 * - a caixa conferida e sem carrinho (a de antes do deploy, ou a não achada na
 *   recontagem) volta a um carrinho pelo bipe SEM baixar de novo;
 * - o bipe da etiqueta do carrinho (CARRINHO-B) não é caixa: o servidor diz que
 *   é um carrinho, para a tela trocar o ativo;
 * - R-CRR-03: os carrinhos são a lista "Carrinhos da expedição" (A e B semeados
 *   uma vez); carrinho com caixa dentro não se desativa;
 * - R-CRR-04: a recontagem é cega — a tela manda os códigos no fim e só então
 *   recebe o que faltou e o que sobrou; "passar" muda o carrinho; "não achei"
 *   tira do carrinho, NÃO mexe no estoque e vira pendência (decisão do dono,
 *   25/11/2026);
 * - as duas barras do dia.
 */
const Database = require('better-sqlite3');
const fs = require('fs'), os = require('os'), path = require('path');

const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'pcp-carrinhos-'));
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
    estoque INTEGER DEFAULT 0, alvo INTEGER DEFAULT 0, modelo_id INTEGER);`);
db.prepare("INSERT INTO skus (codigo,estoque) VALUES ('BK140140BEGE',100),('BK120160CINZA',100)").run();
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
const q1 = s => db.prepare(s).get();
const hoje = q1("SELECT date('now','localtime') d").d;
const lote = id => db.prepare('SELECT * FROM lote WHERE id=?').get(id);
const saldo = c => db.prepare('SELECT estoque FROM skus WHERE codigo=?').get(c).estoque;
const vol = (buyer, mod, extra, sku) => {
  const id = db.prepare(`INSERT INTO lote (codigo,buyer,nf,packId,codes,estagio,data,despachar_em,modalidade,
      embalado_em,impresso_por,impresso_por_id) VALUES (?,?,?,?,?,'embalado',?,?,?,datetime('now','localtime'),'Beto',2)`)
    .run(sku||'BK140140BEGE', buyer, 'NF'+buyer, 'P'+buyer, JSON.stringify(['P'+buyer]), hoje, hoje, mod).lastInsertRowid;
  if(extra) db.prepare('UPDATE lote SET '+extra+' WHERE id=?').run(id);
  return id;
};

(async () => {
  // ── R-CRR-03: a lista dos carrinhos ──
  let r = await chamar('GET /api/carrinhos', {}, ANA);
  const cods = (r.carrinhos||[]).map(c => c.codigo);
  ok('a lista nasce com os carrinhos A e B', cods.join(',') === 'A,B', JSON.stringify(r));
  ok('...e diz também o Carro da agência, à parte', r.agencia && r.agencia.codigo === 'AG', JSON.stringify(r));
  ok('a lista vive em "Carrinhos da expedição" (listas.tipo carrinho_expedicao)',
     db.prepare("SELECT COUNT(*) n FROM listas WHERE tipo='carrinho_expedicao' AND ativo=1").get().n === 2);

  // ── R-CRR-02: o bipe sem modo ──
  const c1 = vol('Um','coleta'), c2 = vol('Dois','coleta'), ag1 = vol('AgUm','agencia');
  const antes = saldo('BK140140BEGE');
  r = await chamar('POST /api/carregar', {code:'PUm', carrinho:''}, ANA);
  ok('coleta com carrinho vazio: recusada, motivo sem_carrinho', r.ok === false && r.motivo === 'sem_carrinho', JSON.stringify(r));
  ok('...e nada grava (nem baixa)', !lote(c1).conferido_em && saldo('BK140140BEGE') === antes);
  r = await chamar('POST /api/carregar', {code:'PUm', carrinho:'Z'}, ANA);
  ok('carrinho que não existe é recusado', r.ok === false && r.motivo === 'carrinho_invalido', JSON.stringify(r));
  r = await chamar('POST /api/carregar', {code:'PUm', carrinho:'AG'}, ANA);
  ok('caixa de coleta não vai para o Carro da agência pelo bipe', r.ok === false && r.motivo === 'carrinho_invalido', JSON.stringify(r));
  r = await chamar('POST /api/carregar', {code:'PUm', carrinho:'A'}, ANA);
  ok('coleta com carrinho A: conferida', r.ok === true && r.carrinho === 'A', JSON.stringify(r));
  ok('...grava o carrinho, quem conferiu e baixa 1', lote(c1).carrinho === 'A' && lote(c1).conferido_por_id === 1
     && saldo('BK140140BEGE') === antes - 1, JSON.stringify(lote(c1)));
  r = await chamar('POST /api/carregar', {code:'PAgUm', carrinho:'A'}, ANA);
  ok('agência vai sozinha para o Carro da agência, mesmo com o A ativo', r.ok === true && r.carrinho === 'AG', JSON.stringify(r));
  ok('...com carrinho AG gravado e baixa', lote(ag1).carrinho === 'AG' && saldo('BK140140BEGE') === antes - 2);
  r = await chamar('POST /api/carregar', {code:'PUm', carrinho:'B'}, ANA);
  ok('bipar de novo a caixa que já está num carrinho diz onde ela está, e não baixa',
     r.ok === false && r.carrinho === 'A' && saldo('BK140140BEGE') === antes - 2, JSON.stringify(r));
  ok('...e não troca de carrinho pelo bipe', lote(c1).carrinho === 'A');

  // quem imprimiu não confere
  r = await chamar('POST /api/carregar', {code:'PDois', carrinho:'A'}, BETO);
  ok('quem imprimiu não confere (R-SEG-01), mesmo com carrinho', r.ok === false && r.motivo === 'mesma_pessoa', JSON.stringify(r));

  // a etiqueta do carrinho
  r = await chamar('POST /api/carregar', {code:'CARRINHO-B', carrinho:'A'}, ANA);
  ok('o bipe da etiqueta do carrinho responde que é carrinho', r.ok === true && r.trocar_carrinho === 'B', JSON.stringify(r));
  r = await chamar('POST /api/carregar', {code:'CARRINHO-Z', carrinho:'A'}, ANA);
  ok('...e o carrinho fora do cadastro é recusado', r.ok === false && r.motivo === 'carrinho_invalido', JSON.stringify(r));

  // página antiga (sem a chave carrinho): continua conferindo, sem carrinho
  const c3 = vol('Tres','coleta');
  r = await chamar('POST /api/carregar', {code:'PTres'}, ANA);
  ok('a página antiga (sem a chave carrinho) ainda confere, e a caixa fica sem carrinho',
     r.ok === true && lote(c3).conferido_em && lote(c3).carrinho === null, JSON.stringify(r));
  const s3 = saldo('BK140140BEGE');
  r = await chamar('POST /api/carregar', {code:'PTres', carrinho:'B'}, ANA);
  ok('a caixa conferida SEM carrinho entra no carrinho pelo bipe', r.ok === true && lote(c3).carrinho === 'B', JSON.stringify(r));
  ok('...sem baixar de novo', saldo('BK140140BEGE') === s3);

  // segundo bipe (o parâmetro da 906)
  db.prepare("INSERT OR REPLACE INTO config (chave,valor) VALUES ('conf_carregamento','1')").run();
  const c4 = vol('Quatro','coleta', null, 'BK120160CINZA');
  r = await chamar('POST /api/carregar', {code:'PQuatro', carrinho:'A'}, ANA);
  ok('com o segundo bipe ligado, pede o SKU sem dizer qual', r.ok === false && r.motivo === 'falta_sku' && !('esperado' in r), JSON.stringify(r));
  r = await chamar('POST /api/carregar', {code:'PQuatro', carrinho:'A', sku:'BK140140BEGE'}, ANA);
  ok('SKU errado: não confere', r.ok === false && r.motivo === 'sku_divergente' && !lote(c4).conferido_em);
  r = await chamar('POST /api/carregar', {code:'PQuatro', carrinho:'A', sku:'BK120160CINZA'}, ANA);
  ok('SKU certo: no carrinho A', r.ok === true && lote(c4).carrinho === 'A', JSON.stringify(r));
  db.prepare("UPDATE config SET valor='0' WHERE chave='conf_carregamento'").run();

  // ── R-CRR-04: a recontagem cega ──
  // carrinho A tem c1 e c4; B tem c3
  r = await chamar('POST /api/carrinho/recontar', {carrinho:'A', codes:['PUm','PUm','PQuatro']}, BETO);
  ok('recontagem que bate', r.ok === true && r.bateu === true && r.contadas === 2 && r.esperadas === 2, JSON.stringify(r));
  ok('...grava quem recontou', db.prepare("SELECT * FROM carrinho_recontagem ORDER BY id DESC").get().por_id === 2);
  r = await chamar('POST /api/carrinho/recontar', {carrinho:'A', codes:['PUm','PTres']}, BETO);
  ok('recontagem com uma faltando e uma de outro carrinho',
     r.ok === true && r.bateu === false && r.faltam.length === 1 && r.faltam[0].id === c4
       && r.sobraram.length === 1 && r.sobraram[0].id === c3 && r.sobraram[0].carrinho === 'B', JSON.stringify(r));
  r = await chamar('POST /api/carrinho/passar', {lote_id:c3, carrinho:'A'}, BETO);
  ok('"passar para este" muda o carrinho', r.ok === true && lote(c3).carrinho === 'A', JSON.stringify(r));
  r = await chamar('POST /api/carrinho/passar', {lote_id:c2, carrinho:'A'}, BETO);
  ok('não se passa caixa que não foi conferida', r.ok === false && lote(c2).carrinho === null, JSON.stringify(r));
  const s4 = saldo('BK120160CINZA');
  r = await chamar('POST /api/carrinho/nao-achou', {lote_id:c4}, BETO);
  ok('"não achei": a caixa sai do carrinho', r.ok === true && lote(c4).carrinho === null && lote(c4).nao_achada_em, JSON.stringify(r));
  ok('...NÃO mexe no estoque', saldo('BK120160CINZA') === s4);
  ok('...continua conferida (não volta a "faltam bipar")', !!lote(c4).conferido_em);
  ok('...e vira pendência', require('./carrinho_dominio').naoAchadas(db).n === 1);
  r = await chamar('POST /api/carregar', {code:'PQuatro', carrinho:'B'}, ANA);
  ok('achada depois, entra no carrinho pelo bipe, sem baixar de novo',
     r.ok === true && lote(c4).carrinho === 'B' && saldo('BK120160CINZA') === s4, JSON.stringify(r));
  ok('...e a pendência zera', require('./carrinho_dominio').naoAchadas(db).n === 0);

  // ── R-CRR-03: carrinho com caixa não se desativa ──
  const idB = db.prepare("SELECT id FROM listas WHERE tipo='carrinho_expedicao' AND valor='B'").get().id;
  r = await chamar('DELETE /api/listas/:id', {}, ANA, {id:idB});
  ok('carrinho com caixa dentro não se desativa', r.__status === 409 && db.prepare('SELECT ativo FROM listas WHERE id=?').get(idB).ativo === 1, JSON.stringify(r));

  // ── as barras do dia ──
  vol('SemBipe','coleta');                                                   // impressa hoje, sem bipe
  db.prepare(`INSERT INTO lote (codigo,buyer,nf,packId,codes,estagio,data,despachar_em,modalidade)
    VALUES ('BK140140BEGE','Pend','NFPend','PPend','["PPend"]','pendente',?,?,'coleta')`).run(hoje, hoje);  // sem etiqueta
  r = await chamar('GET /api/conferencia/dia', {}, ANA);
  const b = r.barras || {};
  ok('a barra da entrega conta o que está nos carrinhos, o sem bipe e o sem etiqueta',
     b.entrega && b.entrega.nos_carrinhos === 4 && b.entrega.sem_bipe === 2 && b.entrega.sem_etiqueta === 1
       && b.entrega.total === 7 && b.entrega.faltam === 7, JSON.stringify(b));
  ok('a barra do bipe conta as impressas hoje', b.bipe && b.bipe.impressas === 6 && b.bipe.bipadas === 4 && b.bipe.faltam === 2, JSON.stringify(b));
  const dA = (r.destinos||[]).find(d => d.codigo === 'A'), dAG = (r.destinos||[]).find(d => d.codigo === 'AG');
  ok('os destinos dizem quantas caixas cada um tem', dA && dA.n === 2 && dAG && dAG.n === 1, JSON.stringify(r.destinos));

  console.log('\n' + (casos - falhas) + ' de ' + casos + ' casos passaram');
  try{ fs.rmSync(tmp, {recursive:true, force:true}); }catch(e){}
  process.exit(falhas ? 1 : 0);
})();

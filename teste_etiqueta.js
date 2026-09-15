#!/usr/bin/env node
/* Testes da Etiqueta de Venda — a saída do estoque.
 *
 *   node teste_etiqueta.js
 *
 * ⚠️ A REGRA QUE ESTES TESTES PROTEGEM: **uma venda = uma etiqueta = uma
 * persiana** (§2). Cada impressão baixa exatamente UMA peça, porque cada
 * etiqueta é de uma peça. Não se junta etiqueta, pacote nem caixa.
 *
 * Em 01/09/2026 a baixa foi alterada para descontar uma "quantidade" do volume,
 * e a alteração foi revertida no mesmo dia por contrariar a regra da operação.
 * O caso 1 aqui existe para que a tentativa quebre um teste antes de chegar ao
 * saldo.
 *
 * A rota não tinha teste nenhum até aqui, e ela mexe em `skus.estoque` — que é
 * a coluna que não se reconstrói (§14).
 *
 * Sobe um banco temporário e chama os handlers direto, com um `app` de mentira
 * que só guarda as rotas. Não abre porta, não toca no banco de produção.
 */
const Database = require('better-sqlite3');
const fs = require('fs'), os = require('os'), path = require('path');

const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'pcp-etq-'));
const db = new Database(path.join(tmp, 't.db'));
db.exec(`
  CREATE TABLE modelo (id INTEGER PRIMARY KEY, codigo TEXT, nome TEXT,
    exige_medida INTEGER DEFAULT 1, sob_medida INTEGER DEFAULT 0);
  CREATE TABLE cor (codigo TEXT PRIMARY KEY, nome TEXT);
  CREATE TABLE tecido (codigo TEXT PRIMARY KEY, nome TEXT);
  CREATE TABLE skus (codigo TEXT PRIMARY KEY, descricao TEXT DEFAULT '', cor TEXT DEFAULT '',
    estoque INTEGER DEFAULT 0, alvo INTEGER DEFAULT 0, modelo_id INTEGER,
    largura_cm INTEGER, altura_cm INTEGER, cor_codigo TEXT, tecido_codigo TEXT);
  CREATE TABLE lote (id INTEGER PRIMARY KEY AUTOINCREMENT, codigo TEXT, cor TEXT, buyer TEXT,
    city TEXT, nf TEXT, packId TEXT, venda TEXT, estagio TEXT DEFAULT 'pendente',
    embalado_em TEXT, data TEXT DEFAULT (date('now','localtime')), despachar_em TEXT, modalidade TEXT);
  /* As pecas dentro da caixa (§5-B). O exp_route e o dono, mas quem le na hora
     de imprimir e o etq_route — entao ela precisa existir aqui. */
  CREATE TABLE lote_item (id INTEGER PRIMARY KEY AUTOINCREMENT, lote_id INTEGER NOT NULL,
    codigo TEXT, qtd INTEGER DEFAULT 1, cor TEXT, descricao TEXT,
    origem TEXT DEFAULT 'folha', conferido_em TEXT, conferido_por TEXT, teste INTEGER DEFAULT 0);
`);
db.prepare("INSERT INTO modelo (id,codigo,nome,sob_medida) VALUES (1,'ROLO','Rolô',0)").run();
db.prepare("INSERT INTO modelo (id,codigo,nome,sob_medida) VALUES (2,'SOBMED','Sob medida',1)").run();
db.prepare("INSERT INTO cor (codigo,nome) VALUES ('BEGE','Bege')").run();
const sku = db.prepare(`INSERT INTO skus (codigo,estoque,modelo_id,largura_cm,altura_cm,cor_codigo)
  VALUES (?,?,?,?,?,?)`);
sku.run('BK140140BEGE', 2, 1, 140, 140, 'BEGE');
sku.run('BK160160CINZA', 0, 1, 160, 160, null);
sku.run('SOBMEDIDA', 0, 2, null, null, null);

const hoje = db.prepare("SELECT date('now','localtime') d").get().d;
const amanha = db.prepare("SELECT date('now','localtime','+9 day') d").get().d;
const vol = db.prepare(`INSERT INTO lote (codigo,buyer,nf,packId,venda,estagio,data,despachar_em)
  VALUES (?,?,?,?,?,'pendente',?,?)`);
vol.run('BK140140BEGE','Abraao Amorim','1','111','901',hoje,hoje);   // id 1
vol.run('BK140140BEGE','Abraao Amorim','2','112','902',hoje,hoje);   // id 2 — mesma pessoa, outra venda
vol.run('BK140140BEGE','Maria Souza',  '3','113','903',hoje,amanha); // id 3 — venda futura
vol.run('BK160160CINZA','Joao Silva',  '4','114','904',hoje,hoje);   // id 4 — sem estoque
vol.run('SOBMEDIDA','Lucelia',         '5','115','905',hoje,hoje);   // id 5 — sob medida
db.prepare(`INSERT INTO lote (codigo,buyer,nf,packId,venda,estagio,data)
  VALUES ('BK140140BEGE','Pedro','6','116','906','bloqueado',?)`).run(hoje);  // id 6
/* COLETA (10/09/2026): o caminhao do ML vem buscar. A etiqueta sai igual, mas
   a caixa vai pro canto reservado, e a tela tem que dizer isso ANTES de
   imprimir — e quem cola a etiqueta que decide onde a caixa para. */
db.prepare(`INSERT INTO lote (codigo,buyer,nf,packId,venda,estagio,data,despachar_em,modalidade)
  VALUES ('BK160160CINZA','Julia Souza','6259','2000014948163325',null,'pendente',?,?,'coleta')`).run(hoje,hoje);  // id 7

const rotas = {};
const app = { get:(p,...h)=>{ rotas['GET '+p]=h[h.length-1]; },
              post:(p,...h)=>{ rotas['POST '+p]=h[h.length-1]; }, locals:{} };
require('./etq_route')(app, db);

const chamar = (k, body, params) => new Promise(r => {
  const res = { json:o=>r(o), status(){ return this; }, send:o=>r(o) };
  rotas[k]({ body:body||{}, params:params||{}, query:{}, headers:{} }, res);
});
const estoqueDe = c => db.prepare('SELECT estoque FROM skus WHERE codigo=?').get(c).estoque;

let falhas = 0, casos = 0;
const ok = (n, c, extra) => { casos++;
  if(c) console.log('ok      ' + n);
  else { falhas++; console.log('FALHOU  ' + n + (extra ? '   ' + extra : '')); } };

(async () => {
  // ── CADA ETIQUETA BAIXA UMA PECA ─────────────────────────────────────────
  const r1 = await chamar('POST /api/embalar', {id:1});
  ok('imprimir a etiqueta baixa UMA peça (2 → 1)',
     r1.ok && estoqueDe('BK140140BEGE') === 1, 'veio ' + estoqueDe('BK140140BEGE'));
  const r2 = await chamar('POST /api/embalar', {id:2});
  ok('a segunda venda do mesmo cliente baixa outra (1 → 0)',
     r2.ok && estoqueDe('BK140140BEGE') === 0, 'veio ' + estoqueDe('BK140140BEGE'));
  ok('o volume andou para embalado, com carimbo de hora',
     db.prepare("SELECT estagio,embalado_em FROM lote WHERE id=1").get().estagio === 'embalado' &&
     !!db.prepare("SELECT embalado_em FROM lote WHERE id=1").get().embalado_em);

  // ── A TRAVA DE ESTOQUE ───────────────────────────────────────────────────
  const r3 = await chamar('POST /api/embalar', {id:3});
  ok('sem peça na prateleira não imprime — nem a venda futura',
     !!r3.erro && estoqueDe('BK140140BEGE') === 0, JSON.stringify(r3));
  ok('e o volume recusado continua pendente',
     db.prepare("SELECT estagio FROM lote WHERE id=3").get().estagio === 'pendente');
  const r4 = await chamar('POST /api/embalar', {id:4});
  ok('SKU com estoque zero também é recusado', !!r4.erro, JSON.stringify(r4));

  // ── SOB MEDIDA: nem trava nem baixa (§7) ─────────────────────────────────
  const r5 = await chamar('POST /api/embalar', {id:5});
  ok('sob medida imprime com estoque zero — a peça é feita pro pedido', !!r5.ok,
     JSON.stringify(r5));
  ok('e não abre buraco no saldo: continua zero', estoqueDe('SOBMEDIDA') === 0,
     'veio ' + estoqueDe('SOBMEDIDA'));

  // ── O QUE A TRAVA DO §6 SEGURA ───────────────────────────────────────────
  const r6 = await chamar('POST /api/embalar', {id:6});
  ok('volume bloqueado não imprime (SKU fora do cadastro)', !!r6.erro,
     JSON.stringify(r6));

  // ── NADA ANDA DUAS VEZES ─────────────────────────────────────────────────
  db.prepare("UPDATE skus SET estoque=5 WHERE codigo='BK140140BEGE'").run();
  const rep = await chamar('POST /api/embalar', {id:1});
  ok('o mesmo volume não baixa duas vezes, nem com estoque sobrando',
     !!rep.erro && estoqueDe('BK140140BEGE') === 5, JSON.stringify(rep));

  // ── O BIPE DO SKU ────────────────────────────────────────────────────────
  const px = await chamar('GET /api/proximo/:sku', null, {sku:'BK140140BEGE'});
  ok('o bipe acha a próxima venda e diz o que a peça é',
     px.cadastrado && px.pedido && px.peca && px.peca.medida === '140 × 140',
     JSON.stringify(px.peca));
  /* Venda futura entra na busca (o que decide é a ORDEM, §8): esgotadas as de
     hoje, o bipe segue trabalhando em vez de dizer que não há nada. */
  ok('e marca quando a venda escolhida é adiantada', px.adiantado === true,
     JSON.stringify({adiantado:px.adiantado, prazo:px.pedido&&px.pedido.despachar_em}));
  const nx = await chamar('GET /api/proximo/:sku', null, {sku:'NAOEXISTE'});
  ok('SKU fora do cadastro responde que não é cadastrado', nx.cadastrado === false);
  ok('a venda de agência NÃO vem marcada como coleta', px.coleta === false, JSON.stringify(px.coleta));

  // ── O FILTRO DA TELA: Todas / Agência / Coleta (§8-B) ────────────────────
  // BK160160CINZA tem duas vendas pendentes de hoje: id 4 (agência) e id 7
  // (coleta). Sem filtro, a mais urgente manda (empate de data → menor id).
  db.prepare("UPDATE skus SET estoque=1 WHERE codigo='BK160160CINZA'").run();
  const pt = await chamar('GET /api/proximo/:sku', {}, {sku:'BK160160CINZA'});
  ok('sem filtro (Todas) o bipe pega a mais urgente, de qualquer lista', pt.pedido && pt.pedido.id === 4 && pt.modo === 'todas', JSON.stringify({id:pt.pedido&&pt.pedido.id, modo:pt.modo}));
  const pcol = await new Promise(r => { const res = { json:o=>r(o), status(){ return this; }, send:o=>r(o) };
    rotas['GET /api/proximo/:sku']({ body:{}, params:{sku:'BK160160CINZA'}, query:{modo:'coleta'}, headers:{} }, res); });
  ok('com filtro Coleta o bipe pula a venda de agência e pega a de coleta', pcol.pedido && pcol.pedido.id === 7 && pcol.coleta === true && pcol.modo === 'coleta', JSON.stringify({id:pcol.pedido&&pcol.pedido.id}));
  const pag = await new Promise(r => { const res = { json:o=>r(o), status(){ return this; }, send:o=>r(o) };
    rotas['GET /api/proximo/:sku']({ body:{}, params:{sku:'BK160160CINZA'}, query:{modo:'agencia'}, headers:{} }, res); });
  ok('com filtro Agência o bipe pega só a de agência', pag.pedido && pag.pedido.id === 4 && pag.coleta === false && pag.pendentes === 1, JSON.stringify({id:pag.pedido&&pag.pedido.id, pend:pag.pendentes}));
  /* SKU que só tem venda na OUTRA lista: a resposta tem que dizer isso, senão
     a tela diz "SKU não está no lote" e a pessoa acha que o PDF não subiu. */
  const pso = await new Promise(r => { const res = { json:o=>r(o), status(){ return this; }, send:o=>r(o) };
    rotas['GET /api/proximo/:sku']({ body:{}, params:{sku:'BK140140BEGE'}, query:{modo:'coleta'}, headers:{} }, res); });
  ok('filtro sem venda nesta lista diz quantas há na outra', !pso.pedido && pso.na_outra_lista === 1, JSON.stringify({pedido:pso.pedido, outra:pso.na_outra_lista}));

  // ── COLETA: a tela avisa antes de imprimir, e de novo depois ─────────────
  db.prepare("UPDATE lote SET estagio='embalado' WHERE id=4").run();   // tira o de agência da frente
  const pc = await chamar('GET /api/proximo/:sku', null, {sku:'BK160160CINZA'});
  ok('o bipe avisa que a venda é COLETA (o caminhão vem buscar)',
     pc.cadastrado && pc.pedido && pc.pedido.id === 7 && pc.coleta === true, JSON.stringify({coleta:pc.coleta, id:pc.pedido&&pc.pedido.id}));
  const ec = await chamar('POST /api/embalar', {id:7});
  ok('imprimir a etiqueta de coleta baixa a peça igual e diz que é coleta',
     ec.ok && ec.coleta === true && estoqueDe('BK160160CINZA') === 0, JSON.stringify(ec));

  /* ── A CAIXA COM MAIS DE UMA PERSIANA (§5-B, armadilha #23) ───────────────
     O caso real de 15/09/2026: NF 6585, Fabiano Pereira, pack 2000015040457349
     — UMA etiqueta com 1 x BK120120BEGE e 2 x BK140140BEGE, três persianas.
     Antes disso o sistema gravava só o item de cima e as outras duas sumiam
     sem aviso: não viravam volume, não baixavam estoque, não apareciam em tela
     nenhuma.
     ⚠️ A REGRA DO §2 CONTINUA INTEIRA: é UMA etiqueta, UM volume, UM
     carregamento. O que passou a existir é o conteúdo da caixa — e é por peça
     que o estoque baixa, porque é por peça que a prateleira esvazia. */
  db.prepare("INSERT INTO skus (codigo,estoque,modelo_id,largura_cm,altura_cm,cor_codigo) VALUES ('BK120120BEGE',5,1,120,120,'BEGE')").run();
  db.prepare("UPDATE skus SET estoque=4 WHERE codigo='BK140140BEGE'").run();
  db.prepare(`INSERT INTO lote (codigo,buyer,nf,packId,venda,estagio,data,despachar_em,modalidade)
    VALUES ('BK120120BEGE','Fabiano Pereira','6585','2000015040457349','2000018468081338','pendente',?,?,'coleta')`).run(hoje,hoje); // id 8
  const PAC = db.prepare("SELECT id FROM lote WHERE nf='6585'").get().id;
  db.prepare("INSERT INTO lote_item (lote_id,codigo,qtd,origem) VALUES (?,'BK120120BEGE',1,'gestao')").run(PAC);
  db.prepare("INSERT INTO lote_item (lote_id,codigo,qtd,origem) VALUES (?,'BK140140BEGE',2,'gestao')").run(PAC);

  const pp = await chamar('GET /api/proximo/:sku', null, {sku:'BK120120BEGE'});
  ok('o bipe entrega as peças da caixa quando ela leva mais de uma',
     pp.pedido && pp.pedido.id === PAC && (pp.itens||[]).length === 2, JSON.stringify({id:pp.pedido&&pp.pedido.id, itens:(pp.itens||[]).length}));

  const semBipe = await chamar('POST /api/embalar', {id:PAC});
  ok('SEM o bipe de todas as peças, não imprime',
     !!semBipe.erro && semBipe.faltam === 2, JSON.stringify(semBipe));
  ok('e nada saiu do estoque na recusa',
     estoqueDe('BK120120BEGE') === 5 && estoqueDe('BK140140BEGE') === 4,
     estoqueDe('BK120120BEGE')+'/'+estoqueDe('BK140140BEGE'));

  const errado = await chamar('POST /api/lote/conferir', {id:PAC, codigo:'BK160160CINZA'});
  ok('bipar um SKU que não é da caixa é recusado', !!errado.erro, JSON.stringify(errado));

  const c1 = await chamar('POST /api/lote/conferir', {id:PAC, codigo:'BK120120BEGE'});
  ok('o bipe da primeira peça confere e diz quantas faltam', c1.ok && c1.faltam === 1, JSON.stringify(c1));
  const bisRep = await chamar('POST /api/lote/conferir', {id:PAC, codigo:'BK120120BEGE'});
  ok('bipar duas vezes a mesma peça não fecha a conta sozinho', !!bisRep.erro, JSON.stringify(bisRep));

  const meio = await chamar('POST /api/embalar', {id:PAC});
  ok('com UMA peça conferida de duas, ainda não imprime',
     !!meio.erro && meio.faltam === 1, JSON.stringify(meio));

  const c2 = await chamar('POST /api/lote/conferir', {id:PAC, codigo:'BK140140BEGE'});
  ok('o bipe da segunda peça fecha a conferência', c2.ok && c2.faltam === 0, JSON.stringify(c2));

  const imp = await chamar('POST /api/embalar', {id:PAC});
  ok('conferidas todas, a etiqueta sai — e é UMA etiqueta só', !!imp.ok, JSON.stringify(imp));
  /* ESTA É A LINHA QUE IMPORTA: 3 persianas saíram da fábrica, 3 saíram do
     saldo. Enquanto o sistema gravava só o item de cima, as 2 do irmão saíam
     da prateleira e o estoque não baixava — furo silencioso. */
  ok('o estoque baixa POR PEÇA: 1 de um SKU e 2 do outro',
     estoqueDe('BK120120BEGE') === 4 && estoqueDe('BK140140BEGE') === 2,
     estoqueDe('BK120120BEGE')+'/'+estoqueDe('BK140140BEGE'));
  ok('a resposta diz quantas persianas fechar na caixa', imp.pecas === 3, JSON.stringify(imp.pecas));
  ok('e o volume andou UMA vez: um volume, um carregamento',
     db.prepare("SELECT estagio FROM lote WHERE id=?").get(PAC).estagio === 'embalado' &&
     db.prepare("SELECT COUNT(*) c FROM lote WHERE packId='2000015040457349'").get().c === 1);

  console.log('');
  console.log(falhas ? ('FALHARAM ' + falhas + ' de ' + casos)
                     : ('todos os ' + casos + ' casos passaram'));
  try{ fs.rmSync(tmp, {recursive:true, force:true}); }catch(e){}
  process.exit(falhas ? 1 : 0);
})();

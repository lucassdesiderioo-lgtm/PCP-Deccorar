#!/usr/bin/env node
/* Testes da fase 2 da spec CARREGAMENTO-SEGUNDA-PESSOA — a caixa de várias
 * persianas conferida peça a peça, ÀS CEGAS, no Carregamento.
 *
 *   node teste_pecas_carga.js
 *
 * Escrito ANTES do código (§0, risco vermelho). O que estes casos travam:
 * - a caixa de várias (SUM(qtd) > 1, a régua VARIAS, agora num lugar só) não
 *   anda no bipe da etiqueta: pede o bipe de cada persiana;
 * - a resposta TRAZ os SKUs da caixa, com quantos já foram bipados — mudou em
 *   05/10/2026, decisão do dono (era cega desde 02/10): quem confere precisa
 *   saber o que procurar nas etiquetas coladas por fora. A trava é o BIPE;
 * - cada bipe conta UMA persiana; bateu tudo, a caixa é conferida (agência)
 *   ou vai pro canto (coleta), como sempre;
 * - SKU que não está na caixa, ou um a mais, PARA e aí mostra os dois lados,
 *   sem a caixa andar, e vai para a auditoria;
 * - "Recomeçar esta caixa" zera a contagem;
 * - quem imprimiu continua sem conferir (fase 1), também peça a peça;
 * - a caixa de UMA persiana não muda nada;
 * - na impressão, a frase da caixa manda colar por fora as etiquetas do saco.
 *
 * Banco temporário, módulos de verdade, `app` de mentira. Não abre porta.
 */
const Database = require('better-sqlite3');
const fs = require('fs'), os = require('os'), path = require('path');

const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'pcp-pecas-carga-'));
process.env.PCP_DIR = tmp;

let falhas = 0, casos = 0;
const ok = (n, c, extra) => { casos++;
  if(c) console.log('ok      ' + n);
  else { falhas++; console.log('FALHOU  ' + n + (extra ? '   ' + extra : '')); } };

const db = new Database(path.join(tmp, 't.db'));
db.exec(`CREATE TABLE lote (id INTEGER PRIMARY KEY AUTOINCREMENT, codigo TEXT, cor TEXT, buyer TEXT,
  city TEXT, nf TEXT, packId TEXT, venda TEXT, codes TEXT DEFAULT '[]', estagio TEXT, data TEXT,
  embalado_em TEXT, carregado_em TEXT, despachar_em TEXT, modalidade TEXT, retirado_em TEXT,
  impresso_por TEXT, conferido_por TEXT, conferido_em TEXT, saida_id INTEGER, saiu_em TEXT, saiu_por TEXT, no_carro_em TEXT);
  CREATE TABLE lote_item (id INTEGER PRIMARY KEY AUTOINCREMENT, lote_id INTEGER, codigo TEXT, qtd INTEGER DEFAULT 1);
  CREATE TABLE usuarios (id INTEGER PRIMARY KEY AUTOINCREMENT, nome TEXT, ativo INTEGER DEFAULT 1);`);
const q1 = (s, ...a) => db.prepare(s).get(...a);
const hoje = q1("SELECT date('now','localtime') d").d;

const vol = (buyer, impresso, coleta, itens) => {
  const id = db.prepare(`INSERT INTO lote
      (codigo,buyer,nf,packId,codes,estagio,data,despachar_em,embalado_em,impresso_por,modalidade)
      VALUES (?,?,?,?,?,'embalado',?,?,datetime('now','localtime'),?,?)`)
    .run(itens && itens.length ? itens[0][0] : 'BK100100BRANCO', buyer, 'NF'+buyer, 'P'+buyer,
         JSON.stringify(['P'+buyer]), hoje, hoje, impresso, coleta ? 'coleta' : null).lastInsertRowid;
  (itens || []).forEach(([c, q]) => db.prepare('INSERT INTO lote_item (lote_id,codigo,qtd) VALUES (?,?,?)').run(id, c, q));
  return id;
};

const auditoria = [];
const rotas = {};
const app = { get:(p,...h)=>{ rotas['GET '+p]=h[h.length-1]; }, post:(p,...h)=>{ rotas['POST '+p]=h[h.length-1]; },
  locals:{ acesso:{
    auditar(req, cat, acao, alvo, det){ auditoria.push({acao, alvo, det, quem:req.usuario&&req.usuario.nome}); } } } };
require('./carreg_route')(app, db);
const chamar = (k, body, usuario) => new Promise(r => {
  if(!rotas[k]){ r({ _sem_rota:true }); return; }
  let cod = 200;
  const res = { json:o=>r(Object.assign({_status:cod}, o)), status(c){ cod = c; return res; }, send:o=>r(o) };
  rotas[k]({ body:body||{}, headers:{}, usuario:usuario||null }, res);
});
const ANA = {id:1,nome:'Ana'}, BETO = {id:2,nome:'Beto'};
const lote = id => q1('SELECT * FROM lote WHERE id=?', id);
const A = 'BK120120BEGE', B = 'BK140140BEGE', C = 'BK160160CINZA';

(async () => {
  // ── a régua num lugar só ──
  const carga = require('./carga');
  ok('a régua VARIAS mora no carga.js', typeof carga.VARIAS === 'function');
  ok('e o exp_route lê de lá, sem cópia própria',
     !/const VARIAS\s*=/.test(fs.readFileSync(path.join(__dirname, 'exp_route.js'), 'utf8')));

  // ── a caixa de várias, agência ──
  const cx = vol('Fabiano', 'Ana', false, [[A,1],[B,2]]);
  let r = await chamar('POST /api/carregar', {code:'PFabiano'}, BETO);
  ok('caixa de várias: o bipe da etiqueta NÃO confere — pede as peças', r.ok === false && r.motivo === 'conferir_pecas', JSON.stringify(r));
  ok('diz quantas persianas a caixa leva', r.pecas_total === 3 && r.bipadas === 0, JSON.stringify(r));
  /* 05/10/2026, decisão do dono: a lista APARECE (era cega). Todas as linhas
     da caixa, com a quantidade de cada uma e zero bipadas. */
  const lista = x => (x.pecas||[]).map(p => p.codigo+':'+p.qtd+':'+p.bipadas).join(',');
  ok('e TRAZ a lista dos SKUs da caixa, com quantas de cada', lista(r) === A+':1:0,'+B+':2:0', JSON.stringify(r));
  ok('a caixa não andou', !lote(cx).conferido_em);

  r = await chamar('POST /api/carregar/peca', {lote_id:cx, sku:B}, BETO);
  ok('o bipe da peça conta uma persiana', r.ok === true && r.bipadas === 1 && r.pecas_total === 3, JSON.stringify(r));
  ok('e a lista marca a peça bipada na linha certa', lista(r) === A+':1:0,'+B+':2:1', JSON.stringify(r));
  ok('a caixa ainda não andou', !lote(cx).conferido_em);
  r = await chamar('POST /api/carregar/peca', {lote_id:cx, sku:A}, BETO);
  ok('2 de 3', r.bipadas === 2, JSON.stringify(r));
  r = await chamar('POST /api/carregar/peca', {lote_id:cx, sku:B}, BETO);
  ok('na última persiana a caixa é CONFERIDA (agência fica na área)', r.ok === true && r.conferida === true, JSON.stringify(r));
  ok('grava quem conferiu', lote(cx).conferido_por === 'Beto' && !!lote(cx).conferido_em);
  ok('e a agência não vai pro carro por este bipe', lote(cx).estagio === 'embalado');
  r = await chamar('POST /api/carregar/peca', {lote_id:cx, sku:A}, BETO);
  ok('bipar peça de caixa já conferida é recusado', r.ok === false, JSON.stringify(r));

  // ── divergência: SKU que não está na caixa ──
  const cx2 = vol('Silvio', 'Ana', false, [[A,1],[B,1]]);
  await chamar('POST /api/carregar', {code:'PSilvio'}, BETO);
  await chamar('POST /api/carregar/peca', {lote_id:cx2, sku:A}, BETO);
  r = await chamar('POST /api/carregar/peca', {lote_id:cx2, sku:C}, BETO);
  ok('SKU que não está na caixa PARA', r.ok === false && r.motivo === 'peca_divergente', JSON.stringify(r));
  ok('e AÍ mostra os dois lados: o que a caixa devia ter…', /BK120120BEGE/.test(r.esperado||'') && /BK140140BEGE/.test(r.esperado||''), JSON.stringify(r));
  ok('…e o que foi bipado, incluindo o errado', /BK120120BEGE/.test(r.bipado||'') && /BK160160CINZA/.test(r.bipado||''), JSON.stringify(r));
  ok('a caixa não anda', !lote(cx2).conferido_em);
  ok('a divergência vai para a auditoria', auditoria.some(a => a.acao === 'carregar_peca_divergente'), JSON.stringify(auditoria.slice(-2)));

  // ── recomeçar ──
  r = await chamar('POST /api/carregar/recomecar', {lote_id:cx2}, BETO);
  ok('"Recomeçar esta caixa" zera a contagem', r.ok === true && r.bipadas === 0, JSON.stringify(r));
  await chamar('POST /api/carregar/peca', {lote_id:cx2, sku:A}, BETO);
  r = await chamar('POST /api/carregar/peca', {lote_id:cx2, sku:B}, BETO);
  ok('depois de recomeçar, as duas certas conferem a caixa', r.ok === true && r.conferida === true, JSON.stringify(r));

  // ── um a mais ──
  const cx3 = vol('Joverlandia', 'Ana', false, [[A,1],[B,1]]);
  await chamar('POST /api/carregar', {code:'PJoverlandia'}, BETO);
  await chamar('POST /api/carregar/peca', {lote_id:cx3, sku:A}, BETO);
  r = await chamar('POST /api/carregar/peca', {lote_id:cx3, sku:A}, BETO);
  ok('UM A MAIS do mesmo SKU também para', r.ok === false && r.motivo === 'peca_divergente', JSON.stringify(r));
  ok('e não conta a persiana a mais', (q1('SELECT SUM(conferidos_carga) n FROM lote_item WHERE lote_id=?', cx3).n || 0) === 1);

  // ── quem imprimiu, peça a peça ──
  const cx4 = vol('Marisa', 'Ana', false, [[A,2]]);
  r = await chamar('POST /api/carregar', {code:'PMarisa'}, ANA);
  ok('quem imprimiu continua sem conferir a caixa de várias', r.motivo === 'mesma_pessoa', JSON.stringify(r));
  r = await chamar('POST /api/carregar/peca', {lote_id:cx4, sku:A}, ANA);
  ok('nem peça a peça', r.ok === false && r.motivo === 'mesma_pessoa', JSON.stringify(r));
  ok('e a peça não foi contada', (q1('SELECT SUM(conferidos_carga) n FROM lote_item WHERE lote_id=?', cx4).n || 0) === 0);

  // ── 1 SKU com 2 unidades: é caixa de várias ──
  r = await chamar('POST /api/carregar', {code:'PMarisa'}, BETO);
  ok('1 SKU × 2 é caixa de várias (conta PERSIANA, não linha)', r.motivo === 'conferir_pecas' && r.pecas_total === 2, JSON.stringify(r));

  // ── coleta ──
  const cx5 = vol('Roberto', 'Ana', true, [[A,1],[C,1]]);
  r = await chamar('POST /api/carregar', {code:'PRoberto'}, BETO);
  ok('coleta de várias também pede as peças', r.motivo === 'conferir_pecas', JSON.stringify(r));
  await chamar('POST /api/carregar/peca', {lote_id:cx5, sku:C}, BETO);
  r = await chamar('POST /api/carregar/peca', {lote_id:cx5, sku:A}, BETO);
  ok('completa, a coleta vai pro canto como sempre', r.ok === true && lote(cx5).estagio === 'carregado', JSON.stringify(r));

  // ── a caixa de UMA persiana não muda ──
  const um = vol('Simples', 'Ana', false, null);
  r = await chamar('POST /api/carregar', {code:'PSimples'}, BETO);
  ok('caixa de uma persiana: o bipe da etiqueta confere direto', r.ok === true && r.conferida === true, JSON.stringify(r));
  const um2 = vol('UmItem', 'Ana', false, [[A,1]]);
  r = await chamar('POST /api/carregar', {code:'PUmItem'}, BETO);
  ok('lote_item de UMA peça também confere direto', r.ok === true && r.conferida === true, JSON.stringify(r));
  r = await chamar('POST /api/carregar/peca', {lote_id:um2, sku:A}, BETO);
  ok('bipe de peça em caixa que não é de várias é recusado', r.ok === false, JSON.stringify(r));

  // ── P6: a frase da impressão ──
  const html = fs.readFileSync(path.join(__dirname, 'public', 'embalagem.html'), 'utf8');
  const f = html.match(/function fita\([\s\S]*?\n\}/);
  const fita = f ? new Function(f[0] + '; return fita;')() : null;
  ok('a frase da caixa continua com o texto do dono', fita && /Atenção: vão 3 persianas no mesmo pacote — embalar junto/.test(fita(3)), fita && fita(3));
  ok('e manda colar POR FORA as etiquetas do saco', fita && /por fora/i.test(fita(3)) && /saco/i.test(fita(3)), fita && fita(3));

  // ── a tela ──
  const tela = fs.readFileSync(path.join(__dirname, 'public', 'carregamento.html'), 'utf8');
  ok('a tela trata o "conferir_pecas"', /conferir_pecas/.test(tela));
  ok('e tem o "Recomeçar esta caixa"', /Recome[cç]ar esta caixa/.test(tela));
  // o código da guarda, e não o número solto: "700" também aparece no comentário
  ok('e o guard de 700 ms no bipe de peça', /ultimaPeca\.c===code\s*&&\s*agora-ultimaPeca\.t<700/.test(tela));

  console.log('');
  console.log(falhas ? ('FALHARAM ' + falhas + ' de ' + casos) : ('todos os ' + casos + ' casos passaram'));
  try{ db.close(); fs.rmSync(tmp, { recursive:true, force:true }); }catch(e){}
  process.exit(falhas ? 1 : 0);
})();

#!/usr/bin/env node
/* Testes da spec RECUSA-DO-MOTORISTA (02/10/2026).
 *
 *   node teste_recusa_motorista.js
 *
 * O motorista do Mercado Livre bipa a caixa e o sistema dele diz "recusada":
 * a venda foi cancelada depois da etiqueta sair. A baixa do estoque ja
 * aconteceu na impressao, e a persiana esta na mao de quem confere. Dois passos,
 * decididos pelo dono:
 *
 *   1. a EXPEDICAO marca "Motorista recusou" no Carregamento. O volume vira
 *      cancelado (origem 'motorista'), sai do canto/do carro, e a tela avisa
 *      para voltar a peca a prateleira. O SALDO NAO SE MEXE AQUI.
 *   2. o ADMIN aceita pela Mesa de correcoes ("A persiana voltou"), e o saldo
 *      volta POR PECA, com movimento `cancelamento` no livro.
 *
 * Escrito ANTES do codigo (§0, risco vermelho). Sobe um banco temporario e
 * chama os handlers direto. Nao toca em producao.
 */
const Database = require('better-sqlite3');
const fs = require('fs'), os = require('os'), path = require('path');

const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'pcp-recusa-'));
process.env.PCP_DIR = tmp;

let falhas = 0, casos = 0;
const ok = (n, c, extra) => { casos++;
  if(c) console.log('ok      ' + n);
  else { falhas++; console.log('FALHOU  ' + n + (extra !== undefined ? '   ' + (typeof extra === 'string' ? extra : JSON.stringify(extra)) : '')); } };
const eq = (n, a, b) => ok(n, a === b, 'esperado ' + JSON.stringify(b) + ', veio ' + JSON.stringify(a));

const db = new Database(path.join(tmp, 't.db'));
db.exec(`CREATE TABLE config (chave TEXT PRIMARY KEY, valor TEXT);
  CREATE TABLE skus (codigo TEXT PRIMARY KEY, descricao TEXT DEFAULT '', cor TEXT DEFAULT '',
    estoque INTEGER DEFAULT 0, alvo INTEGER DEFAULT 0, modelo_id INTEGER);
  CREATE TABLE modelo (id INTEGER PRIMARY KEY, codigo TEXT, nome TEXT, sob_medida INTEGER DEFAULT 0,
    exige_medida INTEGER DEFAULT 1);
  INSERT INTO modelo (id,codigo,nome,sob_medida) VALUES (1,'ROLO','Rolô',0),(2,'SOBMEDIDA','Sob medida',1);
  INSERT INTO skus (codigo,estoque,modelo_id) VALUES
    ('BK140140BEGE',5,1),('BK120120BEGE',3,1),('BK160160CINZA',4,1),('SOBMEDIDA',0,2);`);

const auditado = [];
const rotas = {};
const app = { get:(p,...h)=>{ rotas['GET '+p]=h[h.length-1]; },
              post:(p,...h)=>{ rotas['POST '+p]=h[h.length-1]; },
              use:()=>{}, locals:{ acesso:{ auditar(req,a,b,c,d){ auditado.push([b,c,d]); } } } };
require('./exp_route')(app, db);
require('./carreg_route')(app, db);
require('./saida_route')(app, db);
const ESTOQUE = require('./estoque_dominio');
ESTOQUE.garantirSchema(db);
ESTOQUE.abertura(db);
const COR = require('./correcoes');
COR.garantirSchema(db);
const CANC = require('./cancelada_dominio');
const { AGUARDA_CAMINHAO } = require('./carga');

const chamar = (k, body, usuario) => new Promise(r => {
  if(!rotas[k]) return r({ __sem_rota:k });
  let st = 200;
  const res = { json:o=>r(Object.assign({__st:st}, o)), status(n){ st = n; return res; }, send:o=>r(o), setHeader(){} };
  try{ rotas[k]({ body:body||{}, params:{}, query:{}, headers:{}, usuario:usuario===undefined?ANA:usuario }, res); }
  catch(e){ r({ __st:500, __erro:String(e.message||e) }); }
});
const ANA = {id:1, nome:'Ana'};
const LUCAS = {id:2, nome:'Lucas'};
const lote = id => db.prepare('SELECT * FROM lote WHERE id=?').get(id);
const saldo = c => db.prepare('SELECT estoque FROM skus WHERE codigo=?').get(c).estoque;
const livroFecha = () => db.prepare(`SELECT s.codigo FROM skus s
  WHERE s.estoque <> COALESCE((SELECT SUM(delta) FROM movimento_estoque m WHERE m.codigo=s.codigo),0)`).all().length === 0;
function volume(o){
  const c = Object.keys(o);
  return db.prepare('INSERT INTO lote ('+c.join(',')+') VALUES ('+c.map(()=>'?').join(',')+')').run(c.map(k=>o[k])).lastInsertRowid;
}
const peca = (lid, cod, qtd) => db.prepare('INSERT INTO lote_item (lote_id,codigo,qtd,conferidos) VALUES (?,?,?,?)').run(lid,cod,qtd,qtd);

const agora = "datetime('now','localtime')";
const HOJE = db.prepare("SELECT date('now','localtime') d").get().d;
db.prepare("INSERT INTO saida (tipo,aberta_em,aberta_por) VALUES ('agencia',"+agora+",'Ana')").run();
const viagem = db.prepare('SELECT MAX(id) id FROM saida').get().id;

// A — agencia, conferida na area (embalado)
const A = volume({codigo:'BK140140BEGE', buyer:'Maria Souza', nf:'7011', venda:'2000018000000001', codes:'["2000018000000001"]',
  estagio:'embalado', embalado_em:HOJE+' 09:00:00', modalidade:'agencia', impresso_por:'Joao', conferido_por:'Ana', conferido_em:HOJE+' 10:00:00'});
// B — coleta, no canto esperando o caminhao
const B = volume({codigo:'BK140140BEGE', buyer:'Pedro Lima', nf:'7012', venda:'2000018000000002', codes:'["2000018000000002"]',
  estagio:'carregado', embalado_em:HOJE+' 09:00:00', carregado_em:HOJE+' 10:00:00', modalidade:'coleta'});
// C — agencia, dentro do carro de uma viagem aberta
const C = volume({codigo:'BK160160CINZA', buyer:'Rita Alves', nf:'7013', venda:'2000018000000003', codes:'["2000018000000003"]',
  estagio:'carregado', embalado_em:HOJE+' 09:00:00', carregado_em:HOJE+' 10:30:00', modalidade:'agencia',
  saida_id:viagem, no_carro_em:HOJE+' 10:30:00', no_carro_por:'Ana'});
// D — caixa de varias persianas (2 x BK120 + 1 x BK160), na area
const D = volume({codigo:'BK120120BEGE', buyer:'Fabiano Pereira', nf:'7014', packId:'2000015000000004', codes:'["2000015000000004"]',
  estagio:'embalado', embalado_em:HOJE+' 09:00:00', modalidade:'agencia'});
peca(D,'BK120120BEGE',2); peca(D,'BK160160CINZA',1);
// E — sob medida, na area
const E = volume({codigo:'SOBMEDIDA', buyer:'Geison Sobrinho', nf:'7015', venda:'2000018000000005', codes:'["2000018000000005"]',
  estagio:'embalado', embalado_em:HOJE+' 09:00:00', modalidade:'agencia'});
// F — pendente (sem etiqueta)
const F = volume({codigo:'BK140140BEGE', buyer:'Sem Etiqueta', nf:'7016', venda:'2000018000000006', codes:'["2000018000000006"]',
  estagio:'pendente', modalidade:'agencia'});
// G — ja saiu da fabrica
const G = volume({codigo:'BK140140BEGE', buyer:'Ja Saiu', nf:'7017', venda:'2000018000000007', codes:'["2000018000000007"]',
  estagio:'carregado', embalado_em:'2026-09-20 09:00:00', carregado_em:'2026-09-20 10:00:00', modalidade:'coleta',
  retirado_em:'2026-09-20 16:00:00', saida_id:1, saiu_em:'2026-09-20 16:00:00', saiu_por:'coleta'});
// H — ja cancelada pelo relatorio do ML
const H = volume({codigo:'BK140140BEGE', buyer:'Ja Cancelada', nf:'7018', venda:'2000018000000008', codes:'["2000018000000008"]',
  estagio:'cancelado', cancelada_estagio:'embalado', cancelada_em:HOJE+' 08:00:00', cancelada_origem:'planilha',
  cancelada_motivo:'Cancelada pelo comprador', modalidade:'agencia'});

const saldoAntes = { a:saldo('BK140140BEGE'), b:saldo('BK120120BEGE'), c:saldo('BK160160CINZA') };

(async () => {
  let r;
  console.log('\n=== 1. A ROTA E O DOMINIO ===\n');
  ok('a rota POST /api/carregamento/recusa existe', !!rotas['POST /api/carregamento/recusa']);
  ok('o dominio exporta recusar', typeof CANC.recusar === 'function');
  const SRC_ACESSO = fs.readFileSync(path.join(__dirname,'acesso.js'),'utf8');
  ok('o permDaRota declara a rota com carregamento.executar',
     /\/api\/carregamento\/recusa['"]\)\)\s*return\s*'carregamento\.executar'/.test(SRC_ACESSO));
  ok('a coluna cancelada_por existe no lote',
     db.prepare('PRAGMA table_info(lote)').all().some(c => c.name === 'cancelada_por'));

  console.log('\n=== 2. A PREVIA: mostra a caixa, nao grava nada ===\n');
  r = await chamar('POST /api/carregamento/recusa', {code:'2000018000000001'});
  ok('a previa responde ok', r.ok === true, r);
  ok('   e diz que e previa', r.previa === true);
  eq('   com o volume certo', r.pedido && r.pedido.id, A);
  eq('   cliente e NF', (r.pedido||{}).buyer + ' / ' + (r.pedido||{}).nf, 'Maria Souza / 7011');
  ok('   e as pecas', Array.isArray(r.pecas) && r.pecas.length === 1 && r.pecas[0].codigo === 'BK140140BEGE' && r.pecas[0].qtd === 1, r.pecas);
  eq('   o volume nao mudou', lote(A).estagio, 'embalado');
  eq('   e o saldo nao mudou', saldo('BK140140BEGE'), saldoAntes.a);
  r = await chamar('POST /api/carregamento/recusa', {code:'2000015000000004'});
  eq('a previa da caixa de varias lista as duas linhas', (r.pecas||[]).length, 2);
  eq('   e soma 3 persianas', (r.pecas||[]).reduce((s,p)=>s+p.qtd,0), 3);
  r = await chamar('POST /api/carregamento/recusa', {code:'2000018000000005'});
  ok('a previa do sob medida diz que ela nao volta ao estoque', r.sob_medida === true, r);

  console.log('\n=== 3. MARCAR: a caixa sai das listas, o saldo NAO anda ===\n');
  r = await chamar('POST /api/carregamento/recusa', {id:A, confirmar:true});
  ok('marcar responde ok', r.ok === true && !r.previa, r);
  const a = lote(A);
  eq('   o volume vira cancelado', a.estagio, 'cancelado');
  eq('   o estagio de antes fica guardado', a.cancelada_estagio, 'embalado');
  eq('   a origem e motorista', a.cancelada_origem, 'motorista');
  eq('   com quem marcou', a.cancelada_por, 'Ana');
  ok('   e quando', !!a.cancelada_em);
  ok('   e o motivo dito', /motorista/i.test(a.cancelada_motivo||''), a.cancelada_motivo);
  eq('   o saldo NAO mexeu', saldo('BK140140BEGE'), saldoAntes.a);
  ok('   a tela recebe o aviso de voltar a peca', /volte a peça ao estoque/i.test(r.aviso||''), r.aviso);
  ok('   a marcacao vai para a auditoria', auditado.some(x => x[0] === 'recusa_motorista' && /7011/.test(x[1])), auditado);

  r = await chamar('POST /api/carregamento/recusa', {id:B, confirmar:true});
  ok('a coleta no canto e marcada', r.ok === true, r);
  eq('   cancelada_estagio carregado', lote(B).cancelada_estagio, 'carregado');
  ok('   e saiu do canto do caminhao',
     !db.prepare('SELECT 1 FROM lote WHERE id=? AND ' + AGUARDA_CAMINHAO).get(B));

  r = await chamar('POST /api/carregamento/recusa', {id:C, confirmar:true});
  ok('a caixa no carro da viagem e marcada', r.ok === true, r);
  ok('   e sai da viagem (saida_id e no_carro limpos)', lote(C).saida_id == null && lote(C).no_carro_em == null, lote(C));

  r = await chamar('POST /api/carregamento/recusa', {id:D, confirmar:true});
  ok('a caixa de varias e marcada INTEIRA', r.ok === true && lote(D).estagio === 'cancelado', r);
  eq('   e NAO como cancelada_varias (o motorista recusou a caixa toda)', lote(D).cancelada_varias, 0);

  r = await chamar('POST /api/carregamento/recusa', {id:E, confirmar:true});
  ok('o sob medida e marcado', r.ok === true, r);
  ok('   e o aviso NAO manda por na prateleira', !/volte a peça ao estoque/i.test(r.aviso||'') && /sob medida/i.test(r.aviso||''), r.aviso);
  eq('   nenhum saldo andou ate aqui', [saldo('BK140140BEGE'),saldo('BK120120BEGE'),saldo('BK160160CINZA')].join(','),
     [saldoAntes.a,saldoAntes.b,saldoAntes.c].join(','));

  console.log('\n=== 4. AS RECUSAS — e cada uma diz o porque ===\n');
  r = await chamar('POST /api/carregamento/recusa', {code:'2000018000000006'});
  ok('pendente (sem etiqueta) e recusado', r.ok === false && r.motivo === 'sem_etiqueta' && !!r.aviso, r);
  r = await chamar('POST /api/carregamento/recusa', {id:F, confirmar:true});
  ok('   e nem confirmando passa', r.ok === false && lote(F).estagio === 'pendente', r);
  r = await chamar('POST /api/carregamento/recusa', {code:'2000018000000007'});
  ok('a caixa que ja saiu e recusada, dizendo que e devolucao', r.ok === false && r.motivo === 'ja_saiu' && /devolu/i.test(r.aviso||''), r);
  r = await chamar('POST /api/carregamento/recusa', {code:'2000018000000008'});
  ok('a ja cancelada pelo ML e recusada', r.ok === false && r.motivo === 'ja_cancelada', r);
  eq('   e a origem dela continua planilha', lote(H).cancelada_origem, 'planilha');
  r = await chamar('POST /api/carregamento/recusa', {id:A, confirmar:true});
  ok('marcar duas vezes e recusado', r.ok === false && r.motivo === 'ja_cancelada', r);
  r = await chamar('POST /api/carregamento/recusa', {code:'9999999999'});
  ok('codigo que nao existe: nao_encontrado', r.ok === false && r.motivo === 'nao_encontrado', r);
  r = await chamar('POST /api/carregamento/recusa', {id:F+1000, confirmar:true});
  ok('id que nao existe: nao_encontrado', r.ok === false && r.motivo === 'nao_encontrado', r);
  r = await chamar('POST /api/carregamento/recusa', {code:'2000018000000006'}, null);
  eq('sem pessoa logada: 401', r.__st, 401);

  console.log('\n=== 5. DEPOIS: o bipe recusa, o card mostra, o relatorio nao remarca ===\n');
  r = await chamar('POST /api/carregar', {code:'2000018000000001'});
  ok('o bipe do carregamento recusa a caixa recusada', r.ok === false && r.motivo === 'cancelada', r);
  ok('   e diz que foi o motorista, e para voltar ao estoque', /motorista/i.test(r.aviso||'') && /estoque/i.test(r.aviso||''), r.aviso);
  const card = CANC.listar(db).map(v => v.id);
  ok('as cinco aparecem no card "Canceladas depois da etiqueta"', [A,B,C,D,E].every(id => card.includes(id)), card);
  const lin = CANC.listar(db).find(v => v.id === A) || {};
  ok('   o card sabe a origem e quem marcou', lin.cancelada_origem === 'motorista' && lin.cancelada_por === 'Ana', lin);
  const res = CANC.marcar(db, [{numero:'2000018000000001', pack:'', estado:'Cancelada pelo comprador'}], {origem:'planilha'});
  eq('o relatorio do ML que chega depois acha a venda ja marcada', res.ja_marcada, 1);
  eq('   e a origem continua motorista', lote(A).cancelada_origem, 'motorista');

  console.log('\n=== 6. O ADMIN ACEITA PELA MESA: o saldo volta POR PECA ===\n');
  const vale = (id) => { try{ COR.previa(db,{acao:'cancelada',tipo:'lote',id,params:{voltou:true}}); return true; }catch(e){ return e.message; } };
  eq('a Mesa aceita a recusa da area', vale(A), true);
  const ex = (id, mot) => { try{ db.transaction(() => COR.executar(db,{acao:'cancelada',tipo:'lote',id,params:{voltou:true},motivo:mot,quem:LUCAS}))(); }
    catch(e){ ok('a Mesa executa o "voltou" do volume #'+id, false, e.message); } };
  ex(A, 'Motorista recusou — peça conferida na prateleira');
  eq('   "voltou" devolve +1', saldo('BK140140BEGE'), saldoAntes.a + 1);
  ex(B, 'Motorista recusou');
  eq('   a coleta tambem', saldo('BK140140BEGE'), saldoAntes.a + 2);
  ex(D, 'Motorista recusou a caixa de três');
  eq('   a caixa de varias devolve 2 de BK120', saldo('BK120120BEGE'), saldoAntes.b + 2);
  eq('   e 1 de BK160', saldo('BK160160CINZA'), saldoAntes.c + 1);
  ex(E, 'Sob medida recusada');
  eq('   o sob medida nao gera movimento',
     db.prepare("SELECT COUNT(*) n FROM movimento_estoque WHERE codigo='SOBMEDIDA' AND tipo='cancelamento'").get().n, 0);
  ok('o livro fecha com o saldo', livroFecha());
  eq('o movimento e `cancelamento`, uma linha por SKU (A, B e as duas da caixa de varias)',
     db.prepare("SELECT COUNT(*) n FROM movimento_estoque WHERE tipo='cancelamento'").get().n, 4);
  ok('e as decididas saem do card', ![A,B,D,E].some(id => CANC.listar(db).map(v=>v.id).includes(id)));
  ok('a C, ainda nao decidida, continua no card', CANC.listar(db).map(v=>v.id).includes(C));

  console.log('\n' + casos + ' casos · ' + falhas + ' falha(s)\n');
  try{ fs.rmSync(tmp, {recursive:true, force:true}); }catch(e){}
  process.exit(falhas ? 1 : 0);
})();

#!/usr/bin/env node
/* Testes da SOBRA — fase 2-B da spec CONFERENCIA-E-BAIXA (22/10/2026).
 *
 *   node teste_sobra.js
 *
 * A caixa que sobrou na fabrica (venda cancelada, motorista recusou, outro) e
 * resolvida NA EXPEDICAO, pelo botao "Sobrou" da Conferencia:
 *
 *   1. bipa a etiqueta da caixa  -> a tela mostra cliente, NF e persianas;
 *   2. motivo: Venda cancelada · Motorista recusou · Outro (escrito);
 *   3. bipa o SKU de CADA persiana -> SKU que nao e da caixa e recusado;
 *   4. confirma -> a caixa sai das listas e, se ja tinha baixado do estoque,
 *      volta +1 POR PECA (movimento `sobra`); se nao tinha, so solta a reserva.
 *
 * Substitui o "Motorista recusou" (que virou um dos motivos) e o "a persiana
 * voltou" da Mesa: desde a 2-B a Mesa NUNCA mexe em saldo (D7). Os casos do
 * antigo teste_recusa_motorista.js que continuam valendo moram aqui.
 *
 * Escrito ANTES do codigo (§0, risco vermelho). Sobe um banco temporario e
 * chama os handlers direto. Nao toca em producao.
 */
const Database = require('better-sqlite3');
const fs = require('fs'), os = require('os'), path = require('path');

const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'pcp-sobra-'));
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
const BAIXA = require('./baixa_dominio');
const { AGUARDA_CAMINHAO } = require('./carga');

const ANA = {id:1, nome:'Ana'};
const LUCAS = {id:2, nome:'Lucas'};
const chamar = (k, body, usuario) => new Promise(r => {
  if(!rotas[k]) return r({ __sem_rota:k });
  let st = 200;
  const res = { json:o=>r(Object.assign({__st:st}, o)), status(n){ st = n; return res; }, send:o=>r(o), setHeader(){} };
  try{ rotas[k]({ body:body||{}, params:{}, query:{}, headers:{}, usuario:usuario===undefined?LUCAS:usuario }, res); }
  catch(e){ r({ __st:500, __erro:String(e.message||e) }); }
});
const SOBRA = 'POST /api/carregamento/sobra';
const lote = id => db.prepare('SELECT * FROM lote WHERE id=?').get(id);
const saldo = c => db.prepare('SELECT estoque FROM skus WHERE codigo=?').get(c).estoque;
const movSobra = id => db.prepare("SELECT codigo, delta FROM movimento_estoque WHERE tipo='sobra' AND referencia=? ORDER BY codigo")
  .all('lote:' + id);
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
const B_ = HOJE + ' 09:00:00';

// A — agencia, conferida na area pela Ana, ja baixou
const A = volume({codigo:'BK140140BEGE', buyer:'Maria Souza', nf:'7011', venda:'2000018000000001', codes:'["2000018000000001"]',
  estagio:'embalado', embalado_em:B_, baixado_em:HOJE+' 10:00:00', modalidade:'agencia', impresso_por:'Joao',
  conferido_por:'Ana', conferido_em:HOJE+' 10:00:00'});
// B — coleta no canto, ja baixou, sem conferido_por (vazio nunca e igual a vazio)
const B = volume({codigo:'BK140140BEGE', buyer:'Pedro Lima', nf:'7012', venda:'2000018000000002', codes:'["2000018000000002"]',
  estagio:'carregado', embalado_em:B_, baixado_em:B_, carregado_em:HOJE+' 10:00:00', modalidade:'coleta'});
// C — agencia, dentro do carro de uma viagem aberta, ja baixou
const C = volume({codigo:'BK160160CINZA', buyer:'Rita Alves', nf:'7013', venda:'2000018000000003', codes:'["2000018000000003"]',
  estagio:'carregado', embalado_em:B_, baixado_em:B_, carregado_em:HOJE+' 10:30:00', modalidade:'agencia',
  conferido_por:'Joao', conferido_em:HOJE+' 10:20:00', saida_id:viagem, no_carro_em:HOJE+' 10:30:00', no_carro_por:'Ana'});
// D — caixa de varias persianas (2 x BK120 + 1 x BK160), na area, ja baixou
const D = volume({codigo:'BK120120BEGE', buyer:'Fabiano Pereira', nf:'7014', packId:'2000015000000004', codes:'["2000015000000004"]',
  estagio:'embalado', embalado_em:B_, baixado_em:B_, modalidade:'agencia'});
peca(D,'BK120120BEGE',2); peca(D,'BK160160CINZA',1);
// E — sob medida, na area
const E = volume({codigo:'SOBMEDIDA', buyer:'Geison Sobrinho', nf:'7015', venda:'2000018000000005', codes:'["2000018000000005"]',
  estagio:'embalado', embalado_em:B_, baixado_em:B_, modalidade:'agencia'});
// F — pendente (sem etiqueta)
const F = volume({codigo:'BK140140BEGE', buyer:'Sem Etiqueta', nf:'7016', venda:'2000018000000006', codes:'["2000018000000006"]',
  estagio:'pendente', modalidade:'agencia'});
// G — ja saiu da fabrica
const G = volume({codigo:'BK140140BEGE', buyer:'Ja Saiu', nf:'7017', venda:'2000018000000007', codes:'["2000018000000007"]',
  estagio:'carregado', embalado_em:'2026-09-20 09:00:00', baixado_em:'2026-09-20 09:00:00', carregado_em:'2026-09-20 10:00:00',
  modalidade:'coleta', retirado_em:'2026-09-20 16:00:00', saida_id:1, saiu_em:'2026-09-20 16:00:00', saiu_por:'coleta'});
// H — ja cancelada pelo relatorio do ML, com a caixa ainda na area, ja baixou, sem decisao
const H = volume({codigo:'BK140140BEGE', buyer:'Cancelada no ML', nf:'7018', venda:'2000018000000008', codes:'["2000018000000008"]',
  estagio:'cancelado', cancelada_estagio:'embalado', cancelada_em:HOJE+' 08:00:00', cancelada_origem:'planilha',
  cancelada_motivo:'Cancelada pelo comprador', embalado_em:B_, baixado_em:B_, modalidade:'agencia'});
// N — impressa depois da virada e NUNCA conferida: a peca ainda esta no saldo (so reservada)
const N = volume({codigo:'BK160160CINZA', buyer:'Nunca Baixou', nf:'7019', venda:'2000018000000009', codes:'["2000018000000009"]',
  estagio:'embalado', embalado_em:B_, modalidade:'agencia', impresso_por:'Joao'});
// V — caixa de varias com UM item cancelado pelo ML: nao e sobra (refaz-se na Etiqueta de Venda)
const V = volume({codigo:'BK120120BEGE', buyer:'Pacote Parcial', nf:'7020', packId:'2000015000000010', codes:'["2000015000000010"]',
  estagio:'embalado', embalado_em:B_, baixado_em:B_, modalidade:'agencia', cancelada_varias:1, cancelada_origem:'planilha'});
peca(V,'BK120120BEGE',1); peca(V,'BK140140BEGE',1);
// S — coleta que o caminhao deixou (sobra de uma saida JA FECHADA), ainda no canto
const S = volume({codigo:'BK120120BEGE', buyer:'Deixada Pelo Caminhao', nf:'7021', venda:'2000018000000011', codes:'["2000018000000011"]',
  estagio:'carregado', embalado_em:B_, baixado_em:B_, carregado_em:HOJE+' 11:00:00', modalidade:'coleta',
  conferido_por:'Ana', conferido_em:HOJE+' 11:00:00'});
db.prepare(`INSERT INTO saida (tipo,aberta_em,aberta_por,fechada_em,fechado_por,qtd_sistema,qtd_externa,sobras,ids)
  VALUES ('coleta',${agora},'Ana',${agora},'Ana',2,1,?,'[]')`).run(JSON.stringify([S]));
// K — cancelada pelo ML ainda na area, para a Mesa so registrar
const K = volume({codigo:'BK140140BEGE', buyer:'So Registrar', nf:'7022', venda:'2000018000000012', codes:'["2000018000000012"]',
  estagio:'cancelado', cancelada_estagio:'embalado', cancelada_em:HOJE+' 08:30:00', cancelada_origem:'planilha',
  cancelada_motivo:'Cancelada pelo comprador', embalado_em:B_, baixado_em:B_, modalidade:'agencia'});

const antes = { a:saldo('BK140140BEGE'), b:saldo('BK120120BEGE'), c:saldo('BK160160CINZA') };

(async () => {
  let r;
  console.log('\n=== 1. A ESTRUTURA ===\n');
  ok('a rota POST /api/carregamento/sobra existe', !!rotas[SOBRA]);
  ok('a rota GET /api/carregamento/sobras (a lista que zera) existe', !!rotas['GET /api/carregamento/sobras']);
  ok('a rota antiga da recusa saiu (o motorista virou um motivo da sobra)', !rotas['POST /api/carregamento/recusa']);
  const SRC_ACESSO = fs.readFileSync(path.join(__dirname,'acesso.js'),'utf8');
  ok('o permDaRota declara a sobra com carregamento.executar (D3, sem chave nova)',
     /\/api\/carregamento\/sobra['"]\)\)\s*return\s*'carregamento\.executar'/.test(SRC_ACESSO));
  ok('   e a lista tambem', /\/api\/carregamento\/sobras['"]\)\)\s*return\s*\[?'carregamento\.executar'/.test(SRC_ACESSO));
  ok('   e a linha da recusa antiga saiu do permDaRota', !/\/api\/carregamento\/recusa/.test(SRC_ACESSO));
  ok('o livro conhece o tipo `sobra`', ESTOQUE.TIPOS.includes('sobra'), ESTOQUE.TIPOS);
  ok('o baixa_dominio exporta a devolucao', typeof BAIXA.devolver === 'function');

  console.log('\n=== 2. A LISTA "ESPERANDO DECISAO" ===\n');
  r = await chamar('GET /api/carregamento/sobras');
  const ids0 = (r.caixas || []).map(c => c.id);
  ok('a lista traz a caixa que o caminhao deixou numa saida fechada', ids0.includes(S), r);
  ok('   e as canceladas ainda na fabrica, sem decisao', ids0.includes(H) && ids0.includes(K), ids0);
  ok('   e nao traz caixa normal, que ja saiu, pendente, nem a de varias com um item', ![A,G,F,V].some(id => ids0.includes(id)), ids0);
  const linS = (r.caixas || []).find(c => c.id === S) || {};
  eq('   a sobra do caminhao diz de onde veio', linS.de, 'caminhao');
  eq('   a cancelada tambem', ((r.caixas || []).find(c => c.id === H) || {}).de, 'cancelada');

  console.log('\n=== 3. A PREVIA: mostra a caixa, nao grava nada ===\n');
  r = await chamar(SOBRA, {code:'2000018000000001'});
  ok('a previa responde ok', r.ok === true && r.previa === true, r);
  eq('   com o volume certo', r.pedido && r.pedido.id, A);
  eq('   cliente e NF', (r.pedido||{}).buyer + ' / ' + (r.pedido||{}).nf, 'Maria Souza / 7011');
  ok('   as pecas a bipar', Array.isArray(r.pecas) && r.pecas.length === 1 && r.pecas[0].codigo === 'BK140140BEGE' && r.pecas[0].qtd === 1, r.pecas);
  eq('   e se ja baixou (decide se o saldo volta)', r.baixou, true);
  eq('   o volume nao mudou', lote(A).estagio, 'embalado');
  eq('   e o saldo nao mudou', saldo('BK140140BEGE'), antes.a);
  r = await chamar(SOBRA, {code:'2000015000000004'});
  eq('a previa da caixa de varias soma 3 persianas', (r.pecas||[]).reduce((s,p)=>s+p.qtd,0), 3);
  r = await chamar(SOBRA, {code:'2000018000000005'});
  ok('a previa do sob medida diz que nao ha SKU a bipar nem saldo a voltar', r.ok === true && r.sob_medida === true, r);
  r = await chamar(SOBRA, {code:'2000018000000009'});
  ok('a previa da caixa que nunca baixou diz que o saldo NAO volta', r.ok === true && r.baixou === false, r);

  console.log('\n=== 4. QUEM CONFERIU NAO MARCA A SOBRA (D8) ===\n');
  r = await chamar(SOBRA, {code:'2000018000000001'}, ANA);
  ok('a Ana conferiu a caixa A: a previa e recusada', r.ok === false && r.motivo === 'mesma_pessoa', r);
  eq('   dizendo quem conferiu', r.conferido_por, 'Ana');
  r = await chamar(SOBRA, {id:A, skus:['BK140140BEGE'], motivo:'cancelada', confirmar:true}, ANA);
  ok('   e nem confirmando passa', r.ok === false && r.motivo === 'mesma_pessoa' && lote(A).estagio === 'embalado', r);
  eq('   o saldo nao mexeu', saldo('BK140140BEGE'), antes.a);
  r = await chamar(SOBRA, {code:'2000018000000002'}, ANA);
  ok('caixa sem conferido_por passa (vazio nunca e igual a vazio)', r.ok === true, r);

  console.log('\n=== 5. O BIPE DO SKU PROVA QUE A PERSIANA ESTA NA MAO ===\n');
  r = await chamar(SOBRA, {id:A, skus:['BK999999XX']});
  ok('SKU que nao e da caixa e recusado', r.ok === false && r.motivo === 'sku_errado', r);
  ok('   e a recusa diz o que a caixa leva', /BK140140BEGE/.test(r.aviso||''), r.aviso);
  r = await chamar(SOBRA, {id:A, skus:['bk140140-bege']});
  ok('o SKU bipado se compara sem caixa e sem pontuacao (a regua do leitor, §12)', r.ok === true && r.faltam === 0, r);
  r = await chamar(SOBRA, {id:A, skus:['BK140140BEGE','BK140140BEGE']});
  ok('uma persiana A MAIS do que a caixa leva e recusada', r.ok === false && r.motivo === 'sku_errado', r);
  r = await chamar(SOBRA, {id:D, skus:['BK120120BEGE']});
  ok('caixa de varias com uma bipada: faltam 2', r.ok === true && r.faltam === 2, r);
  r = await chamar(SOBRA, {id:D, skus:['BK120120BEGE','BK160160CINZA','BK160160CINZA']});
  ok('   o BK160 bipado duas vezes (a caixa leva um) e recusado', r.ok === false && r.motivo === 'sku_errado', r);
  r = await chamar(SOBRA, {id:D, skus:['BK120120BEGE'], motivo:'cancelada', confirmar:true});
  ok('confirmar com persiana faltando e recusado', r.ok === false && r.motivo === 'faltam_pecas', r);
  eq('   e nada mudou', lote(D).estagio, 'embalado');
  r = await chamar(SOBRA, {id:A, skus:['BK140140BEGE'], confirmar:true});
  ok('confirmar sem motivo e recusado', r.ok === false && r.motivo === 'sem_motivo', r);
  r = await chamar(SOBRA, {id:A, skus:['BK140140BEGE'], motivo:'outro', texto:'  ', confirmar:true});
  ok('"Outro" sem escrever o motivo e recusado', r.ok === false && r.motivo === 'sem_motivo', r);
  r = await chamar(SOBRA, {id:A, skus:['BK140140BEGE'], motivo:'qualquer', confirmar:true});
  ok('motivo fora da lista e recusado', r.ok === false && r.motivo === 'sem_motivo', r);
  eq('   e o saldo continua o mesmo', saldo('BK140140BEGE'), antes.a);

  console.log('\n=== 6. CONFIRMAR: a caixa sai das listas e a peca volta POR PECA ===\n');
  r = await chamar(SOBRA, {id:A, skus:['BK140140BEGE'], motivo:'cancelada', confirmar:true});
  ok('a sobra de A responde ok', r.ok === true && !r.previa, r);
  const a = lote(A);
  eq('   o volume vira cancelado', a.estagio, 'cancelado');
  eq('   o estagio de antes fica guardado', a.cancelada_estagio, 'embalado');
  eq('   a origem e `sobra` (nao `conferencia`, que e do conferir_canceladas.js)', a.cancelada_origem, 'sobra');
  ok('   o motivo e o escolhido', /venda cancelada/i.test(a.cancelada_motivo||''), a.cancelada_motivo);
  eq('   quem marcou', a.cancelada_por, 'Lucas');
  ok('   e ja sai decidida (nao vai parar no card da Mesa)', !!a.cancelada_resolvida_em && a.cancelada_resolvida_por === 'Lucas', a);
  eq('   voltou para a prateleira', a.cancelada_voltou, 1);
  eq('   +1 no saldo', saldo('BK140140BEGE'), antes.a + 1);
  eq('   com uma linha `sobra` no livro, referencia lote:<id>', JSON.stringify(movSobra(A)), JSON.stringify([{codigo:'BK140140BEGE', delta:1}]));
  ok('   o livro fecha', livroFecha());
  ok('   e vai para a auditoria', auditado.some(x => x[0] === 'sobra' && /7011/.test(x[1])), auditado.slice(-3));
  ok('   a tela recebe o aviso de por na prateleira', /prateleira/i.test(r.aviso||''), r.aviso);

  r = await chamar(SOBRA, {id:A, skus:['BK140140BEGE'], motivo:'cancelada', confirmar:true});
  ok('a mesma caixa nao volta duas vezes', r.ok === false && r.motivo === 'ja_decidida', r);
  eq('   o saldo nao subiu de novo', saldo('BK140140BEGE'), antes.a + 1);
  eq('   a devolucao do dominio tambem nao repete', typeof BAIXA.devolver === 'function' ? BAIXA.devolver(db, lote(A), 'x').length : -1, 0);
  eq('   e continua uma linha so no livro', movSobra(A).length, 1);

  r = await chamar(SOBRA, {id:B, skus:['BK140140BEGE'], motivo:'motorista', confirmar:true}, ANA);
  ok('a coleta no canto, motivo "motorista recusou"', r.ok === true, r);
  ok('   o motivo diz motorista', /motorista/i.test(lote(B).cancelada_motivo||''), lote(B).cancelada_motivo);
  ok('   e saiu do canto do caminhao', !db.prepare('SELECT 1 FROM lote WHERE id=? AND ' + AGUARDA_CAMINHAO).get(B));
  eq('   +1 de novo', saldo('BK140140BEGE'), antes.a + 2);

  r = await chamar(SOBRA, {id:C, skus:['BK160160CINZA'], motivo:'outro', texto:'Caixa amassada, cliente desistiu', confirmar:true});
  ok('a caixa no carro da viagem, motivo escrito', r.ok === true, r);
  ok('   sai da viagem (saida_id e no_carro limpos)', lote(C).saida_id == null && lote(C).no_carro_em == null, lote(C));
  ok('   o motivo escrito fica gravado', /amassada/.test(lote(C).cancelada_motivo||''), lote(C).cancelada_motivo);
  eq('   +1 de BK160', saldo('BK160160CINZA'), antes.c + 1);

  r = await chamar(SOBRA, {id:D, skus:['BK160160CINZA','BK120120BEGE','BK120120BEGE'], motivo:'cancelada', confirmar:true});
  ok('a caixa de varias, com as 3 bipadas em qualquer ordem', r.ok === true, r);
  eq('   devolve 2 de BK120', saldo('BK120120BEGE'), antes.b + 2);
  eq('   e 1 de BK160', saldo('BK160160CINZA'), antes.c + 2);
  eq('   uma linha por SKU no livro', movSobra(D).length, 2);

  r = await chamar(SOBRA, {id:E, skus:[], motivo:'cancelada', confirmar:true});
  ok('o sob medida e registrado sem SKU a bipar', r.ok === true && lote(E).estagio === 'cancelado', r);
  eq('   e nao gera movimento', db.prepare("SELECT COUNT(*) n FROM movimento_estoque WHERE codigo='SOBMEDIDA'").get().n, 0);
  ok('   e o aviso nao manda por na prateleira', !/prateleira/i.test(r.aviso||'') && /sob medida/i.test(r.aviso||''), r.aviso);

  const resvAntes = (BAIXA.reservados(db)['BK160160CINZA'] || 0);
  const cAntes = saldo('BK160160CINZA');
  r = await chamar(SOBRA, {id:N, skus:['BK160160CINZA'], motivo:'cancelada', confirmar:true});
  ok('a caixa que nunca baixou e registrada', r.ok === true && lote(N).estagio === 'cancelado', r);
  eq('   o saldo NAO sobe (a peca nunca saiu)', saldo('BK160160CINZA'), cAntes);
  eq('   nenhuma linha no livro', movSobra(N).length, 0);
  eq('   e a reserva solta', (BAIXA.reservados(db)['BK160160CINZA'] || 0), resvAntes - 1);

  r = await chamar(SOBRA, {code:'2000018000000008', skus:['BK140140BEGE'], motivo:'cancelada', confirmar:true});
  ok('a cancelada pelo ML ainda na area tambem vai pela sobra', r.ok === true, r);
  eq('   a origem dela continua planilha (e historia)', lote(H).cancelada_origem, 'planilha');
  ok('   e fica decidida', !!lote(H).cancelada_resolvida_em && lote(H).cancelada_voltou === 1);
  eq('   +1', saldo('BK140140BEGE'), antes.a + 3);

  r = await chamar(SOBRA, {id:S, skus:['BK120120BEGE'], motivo:'cancelada', confirmar:true}, ANA);
  ok('a Ana conferiu a S: a sobra do caminhao tambem e recusada a ela', r.ok === false && r.motivo === 'mesma_pessoa', r);
  r = await chamar(SOBRA, {id:S, skus:['BK120120BEGE'], motivo:'cancelada', confirmar:true});
  ok('com outra pessoa, a sobra do caminhao volta', r.ok === true, r);
  eq('   +1 de BK120', saldo('BK120120BEGE'), antes.b + 3);
  ok('o livro fecha depois de tudo', livroFecha());

  console.log('\n=== 7. AS RECUSAS — e cada uma diz o porque ===\n');
  r = await chamar(SOBRA, {code:'2000018000000006'});
  ok('pendente (sem etiqueta) e recusado', r.ok === false && r.motivo === 'sem_etiqueta' && !!r.aviso, r);
  r = await chamar(SOBRA, {id:F, skus:['BK140140BEGE'], motivo:'cancelada', confirmar:true});
  ok('   e nem confirmando passa', r.ok === false && lote(F).estagio === 'pendente', r);
  r = await chamar(SOBRA, {code:'2000018000000007'});
  ok('a caixa que ja saiu e recusada, dizendo que e devolucao', r.ok === false && r.motivo === 'ja_saiu' && /devolu/i.test(r.aviso||''), r);
  r = await chamar(SOBRA, {code:'2000015000000010'});
  ok('a caixa de varias com UM item cancelado nao e sobra', r.ok === false && r.motivo === 'varias_item', r);
  ok('   e manda refazer na Etiqueta de Venda', /etiqueta de venda/i.test(r.aviso||''), r.aviso);
  r = await chamar(SOBRA, {code:'9999999999'});
  ok('codigo que nao existe: nao_encontrado', r.ok === false && r.motivo === 'nao_encontrado', r);
  r = await chamar(SOBRA, {id:99999, skus:[], motivo:'cancelada', confirmar:true});
  ok('id que nao existe: nao_encontrado', r.ok === false && r.motivo === 'nao_encontrado', r);
  r = await chamar(SOBRA, {code:'2000018000000006'}, null);
  eq('sem pessoa logada: 401', r.__st, 401);
  eq('nenhuma recusa mexeu no saldo', [saldo('BK140140BEGE'),saldo('BK120120BEGE'),saldo('BK160160CINZA')].join(','),
     [antes.a+3, antes.b+3, antes.c+2].join(','));

  console.log('\n=== 8. DEPOIS: o bipe recusa, a lista zera ===\n');
  r = await chamar('POST /api/carregar', {code:'2000018000000001'});
  ok('o bipe da conferencia recusa a caixa que sobrou', r.ok === false && r.motivo === 'cancelada', r);
  r = await chamar('GET /api/carregamento/sobras');
  const ids1 = (r.caixas || []).map(c => c.id);
  ok('a lista ficou so com a K (que ainda espera decisao)', ids1.length === 1 && ids1[0] === K, ids1);

  console.log('\n=== 9. A MESA NUNCA MEXE EM SALDO (D7) ===\n');
  const prev = (id, params) => { try{ return COR.previa(db,{acao:'cancelada',tipo:'lote',id,params}); }catch(e){ return { erro:e.message, status:e.status }; } };
  r = prev(K, {voltou:true});
  ok('o "a persiana voltou" da Mesa e recusado', !!r.erro, r);
  ok('   e manda para o "Sobrou" da Conferencia', /sobrou/i.test(r.erro||'') && /confer/i.test(r.erro||''), r.erro);
  const v = db.prepare('SELECT * FROM lote WHERE id=?').get(K);
  const opc = COR.ACOES.cancelada.opcoes(db, v).map(o => o.id);
  eq('a Mesa oferece so o "registrar"', opc.join(','), 'registrar');
  r = prev(K, {voltou:false});
  ok('o "registrar" continua', !r.erro && (r.estoque||[]).length === 0, r);
  const kAntes = saldo('BK140140BEGE');
  try{ db.transaction(() => COR.executar(db,{acao:'cancelada',tipo:'lote',id:K,params:{voltou:false},motivo:'Separada, sem volta',quem:LUCAS}))(); }
  catch(e){ ok('o registrar executa', false, e.message); }
  eq('   e nao mexe em saldo', saldo('BK140140BEGE'), kAntes);
  r = await chamar('GET /api/carregamento/sobras');
  eq('   e a lista zera', (r.caixas || []).length, 0);

  console.log('\n=== 10. UM LUGAR SO devolve a sobra ===\n');
  const arquivos = fs.readdirSync(__dirname).filter(f => f.endsWith('.js') && !f.startsWith('teste_'));
  const fora = arquivos.filter(f => f !== 'baixa_dominio.js' &&
    /tipo\s*:\s*['"]sobra['"]/.test(fs.readFileSync(path.join(__dirname, f), 'utf8')));
  ok('nenhum arquivo alem do baixa_dominio.js grava movimento `sobra`', fora.length === 0, fora);
  ok('   e o baixa_dominio.js grava', /tipo\s*:\s*['"]sobra['"]/.test(fs.readFileSync(path.join(__dirname,'baixa_dominio.js'),'utf8')));

  console.log('\n' + casos + ' casos · ' + falhas + ' falha(s)\n');
  try{ fs.rmSync(tmp, {recursive:true, force:true}); }catch(e){}
  process.exit(falhas ? 1 : 0);
})();

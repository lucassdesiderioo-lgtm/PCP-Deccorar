#!/usr/bin/env node
/* Testes da fase 1 da spec CARREGAMENTO-SEGUNDA-PESSOA — o carregamento por
 * outra pessoa (decisão do dono, 01/10/2026).
 *
 *   node teste_segunda_pessoa.js
 *
 * Até aqui "sem segunda pessoa" só MARCAVA (decisão 2 da
 * SAIDA-E-DUPLA-CONFERENCIA, 25/09/2026). Agora o bipe do Carregamento — o da
 * ÁREA (agência) e o do CANTO (coleta) — RECUSA quando o login é o mesmo de
 * quem imprimiu a etiqueta de venda, e diz o nome de quem imprimiu.
 *
 * O que estes casos travam:
 * - mesmo login recusado nos dois bipes, e nada é gravado na caixa;
 * - outro login confere, e a resposta traz quem imprimiu;
 * - " ana " é "Ana", e vazio nunca é igual a vazio;
 * - NÃO há liberação nenhuma (decisão do dono, 01/10/2026): o cruzamento é
 *   automático e vale para todo login, inclusive o de quem tem acesso total —
 *   uma porta de liberação vira o caminho de todo dia;
 * - a recusa vai para a auditoria, e a pilha diz quem imprimiu cada caixa.
 *
 * Banco temporário, módulos de verdade, `app` de mentira. Não abre porta.
 */
const Database = require('better-sqlite3');
const fs = require('fs'), os = require('os'), path = require('path');

const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'pcp-2pessoa-'));
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
  CREATE TABLE usuarios (id INTEGER PRIMARY KEY AUTOINCREMENT, nome TEXT, ativo INTEGER DEFAULT 1);
  INSERT INTO usuarios (nome) VALUES ('Ana'),('Beto'),('Sup'),('Carla');`);
const q1 = (s, ...a) => db.prepare(s).get(...a);
const hoje = q1("SELECT date('now','localtime') d").d;

const vol = (buyer, impresso, coleta) => db.prepare(`INSERT INTO lote
    (codigo,buyer,nf,packId,codes,estagio,data,despachar_em,embalado_em,impresso_por,modalidade)
    VALUES ('BK140140BEGE',?,?,?,?,'embalado',?,?,datetime('now','localtime'),?,?)`)
  .run(buyer, 'NF'+buyer, 'P'+buyer, JSON.stringify(['P'+buyer]), hoje, hoje, impresso, coleta ? 'coleta' : null)
  .lastInsertRowid;

const auditoria = [];
const rotas = {};
const app = { get:(p,...h)=>{ rotas['GET '+p]=h[h.length-1]; }, post:(p,...h)=>{ rotas['POST '+p]=h[h.length-1]; },
  locals:{ acesso:{
    auditar(req, cat, acao, alvo, det){ auditoria.push({acao, alvo, det, quem:req.usuario&&req.usuario.nome}); } } } };
require('./carreg_route')(app, db);
const chamar = (k, body, usuario) => new Promise(r => {
  let cod = 200;
  const res = { json:o=>r(Object.assign({_status:cod}, o)), status(c){ cod = c; return res; }, send:o=>r(o) };
  rotas[k]({ body:body||{}, headers:{}, usuario:usuario||null }, res);
});
const ANA = {id:1,nome:'Ana'}, BETO = {id:2,nome:'Beto'};
const lote = id => q1('SELECT * FROM lote WHERE id=?', id);

(async () => {
  const ag = vol('Agencia', 'Ana', false);
  const co = vol('Coleta', 'Ana', true);
  const ag2 = vol('Agencia2', 'Ana', false);

  // ── a recusa ──
  let r = await chamar('POST /api/carregar', {code:'PAgencia'}, ANA);
  ok('agência: quem imprimiu NÃO confere na área', r.ok === false && r.motivo === 'mesma_pessoa', JSON.stringify(r));
  ok('a recusa diz quem imprimiu (o nome do login)', r.impresso_por === 'Ana', JSON.stringify(r));
  ok('e diz que tem que ser outra pessoa', /outra pessoa/i.test(r.aviso||''), r.aviso);
  ok('e traz a caixa (cliente e NF) para a tela', r.pedido && r.pedido.buyer === 'Agencia' && r.pedido.nf === 'NFAgencia');
  ok('nada foi gravado: a caixa não ficou conferida', !lote(ag).conferido_em && !lote(ag).conferido_por);
  ok('a recusa vai para a auditoria', auditoria.some(a => a.acao === 'carregar_mesma_pessoa' && a.quem === 'Ana'),
     JSON.stringify(auditoria));

  r = await chamar('POST /api/carregar', {code:'PColeta'}, ANA);
  ok('coleta: quem imprimiu NÃO leva pro canto', r.ok === false && r.motivo === 'mesma_pessoa', JSON.stringify(r));
  ok('a caixa de coleta continua embalada, fora do canto', lote(co).estagio === 'embalado' && !lote(co).carregado_em);

  db.prepare("UPDATE lote SET impresso_por=' ana ' WHERE id=?").run(ag2);
  r = await chamar('POST /api/carregar', {code:'PAgencia2'}, ANA);
  ok('" ana " e "Ana" são a mesma pessoa', r.motivo === 'mesma_pessoa', JSON.stringify(r));
  ok('o nome volta limpo, sem os espaços', r.impresso_por === 'ana', JSON.stringify(r));

  // ── outra pessoa ──
  r = await chamar('POST /api/carregar', {code:'PAgencia'}, BETO);
  ok('outro login confere na área', r.ok === true && r.conferida === true, JSON.stringify(r));
  ok('e a resposta traz quem imprimiu', r.impresso_por === 'Ana', JSON.stringify(r));
  ok('a caixa ficou conferida pelo Beto', lote(ag).conferido_por === 'Beto');
  r = await chamar('POST /api/carregar', {code:'PColeta'}, BETO);
  ok('outro login leva a coleta pro canto, com quem imprimiu', r.ok === true && r.coleta === true && r.impresso_por === 'Ana',
     JSON.stringify(r));

  // ── vazio nunca é igual a vazio ──
  vol('SemNome', null, false);
  r = await chamar('POST /api/carregar', {code:'PSemNome'}, ANA);
  ok('caixa sem nome de quem imprimiu: não é "mesma pessoa", confere', r.ok === true, JSON.stringify(r));
  ok('e a resposta não inventa nome', !r.impresso_por, JSON.stringify(r));
  vol('Anon', 'Ana', false);
  r = await chamar('POST /api/carregar', {code:'PAnon'}, null);
  ok('bipe sem ninguém logado não é "mesma pessoa"', r.ok === true, JSON.stringify(r));
  vol('Ninguem', null, false);
  r = await chamar('POST /api/carregar', {code:'PNinguem'}, null);
  ok('sem nome dos DOIS lados não é "mesma pessoa": vazio não é igual a vazio', r.ok === true, JSON.stringify(r));

  // ── sem liberação: o cruzamento é automático ──
  ok('não existe rota de liberação', !rotas['POST /api/carregar/liberar'], Object.keys(rotas).join(' '));
  r = await chamar('POST /api/carregar', {code:'PAgencia2'}, ANA);
  ok('quem imprimiu continua recusado, sem porta de liberar', r.ok === false && r.motivo === 'mesma_pessoa', JSON.stringify(r));
  r = await chamar('POST /api/carregar', {code:'PAgencia2'}, BETO);
  ok('e outra pessoa confere a mesma caixa', r.ok === true && r.conferida === true && r.impresso_por === 'ana', JSON.stringify(r));

  // ── o GET da tela ──
  vol('Nova', ' Ana ', false);                                   // uma que ainda falta conferir
  const g = await chamar('GET /api/carregamento', {}, BETO);
  ok('o GET não fala de liberação', !('liberacoes_hoje' in g) && !('pode_liberar' in g), Object.keys(g).join(' '));
  ok('as linhas da pilha trazem quem imprimiu', (g.pilha.faltam||[]).every(f => 'impresso_por' in f) && g.pilha.faltam.length > 0,
     JSON.stringify(g.pilha.faltam));
  ok('e o nome vem limpo', g.pilha.faltam.some(f => f.impresso_por === 'Ana'), JSON.stringify(g.pilha.faltam));

  // ── a tela: o "Etiqueta feita por" tem linha própria (05/10/2026) ──
  // Em inline-block ele grudava no número de antes: "prontas pro carro 1Etiqueta feita por …".
  const css = require('fs').readFileSync(require('path').join(__dirname, 'public/carregamento.html'), 'utf8');
  const quem = (css.match(/\.quem\s*\{([^}]*)\}/) || [])[1] || '';
  ok('"Etiqueta feita por" sai em linha própria, não grudado no número', /display\s*:\s*block/.test(quem), quem);

  console.log('\n' + (falhas ? falhas + ' FALHA(S)' : 'tudo certo') + ' — ' + casos + ' casos');
  process.exit(falhas ? 1 : 0);
})().catch(e => { console.error(e); process.exit(1); });

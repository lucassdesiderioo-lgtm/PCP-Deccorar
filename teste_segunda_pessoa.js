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
 * - a liberação do dia (dia de uma pessoa só) exige a chave, o motivo, uma
 *   pessoa que existe, e NÃO pode ser dada por quem vai ser liberado;
 * - liberação de ontem não vale hoje;
 * - a caixa conferida sob liberação continua marcada "sem segunda pessoa".
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
const ontem = q1("SELECT date('now','localtime','-1 day') d").d;

const vol = (buyer, impresso, coleta) => db.prepare(`INSERT INTO lote
    (codigo,buyer,nf,packId,codes,estagio,data,despachar_em,embalado_em,impresso_por,modalidade)
    VALUES ('BK140140BEGE',?,?,?,?,'embalado',?,?,datetime('now','localtime'),?,?)`)
  .run(buyer, 'NF'+buyer, 'P'+buyer, JSON.stringify(['P'+buyer]), hoje, hoje, impresso, coleta ? 'coleta' : null)
  .lastInsertRowid;

const auditoria = [];
const PODE = { Sup:['saida.liberar'], Ana:['saida.liberar'] };   // a Ana é supervisora num dia: nem assim libera a si
const rotas = {};
const app = { get:(p,...h)=>{ rotas['GET '+p]=h[h.length-1]; }, post:(p,...h)=>{ rotas['POST '+p]=h[h.length-1]; },
  locals:{ acesso:{
    auditar(req, cat, acao, alvo, det){ auditoria.push({acao, alvo, det, quem:req.usuario&&req.usuario.nome}); },
    podePermissao(u, chave){ return !!u && (PODE[u.nome]||[]).includes(chave); } } } };
require('./carreg_route')(app, db);
const chamar = (k, body, usuario) => new Promise(r => {
  let cod = 200;
  const res = { json:o=>r(Object.assign({_status:cod}, o)), status(c){ cod = c; return res; }, send:o=>r(o) };
  rotas[k]({ body:body||{}, headers:{}, usuario:usuario||null }, res);
});
const ANA = {id:1,nome:'Ana'}, BETO = {id:2,nome:'Beto'}, SUP = {id:3,nome:'Sup'}, CARLA = {id:4,nome:'Carla'};
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

  // ── a liberação do dia ──
  r = await chamar('POST /api/carregar/liberar', {pessoa:'Ana', motivo:'sozinha na expedição'}, BETO);
  ok('liberar sem a chave saida.liberar é recusado', r.ok === false && r._status === 403, JSON.stringify(r));
  r = await chamar('POST /api/carregar/liberar', {pessoa:'Ana', motivo:'   '}, SUP);
  ok('liberar sem motivo é recusado', r.ok === false && r.motivo === 'sem_motivo', JSON.stringify(r));
  r = await chamar('POST /api/carregar/liberar', {pessoa:'Ana', motivo:'sozinha'}, ANA);
  ok('ninguém libera a si mesmo, nem com a chave', r.ok === false && r.motivo === 'propria', JSON.stringify(r));
  r = await chamar('POST /api/carregar/liberar', {pessoa:'Fulano', motivo:'sozinho'}, SUP);
  ok('pessoa que não existe no cadastro é recusada', r.ok === false && r.motivo === 'pessoa_inexistente', JSON.stringify(r));
  ok('nenhuma das recusas gravou liberação',
     q1('SELECT COUNT(*) n FROM carga_liberacao').n === 0);

  r = await chamar('POST /api/carregar/liberar', {pessoa:'Ana', motivo:'sozinha na expedição'}, SUP);
  ok('o supervisor libera a Ana para hoje, com motivo', r.ok === true, JSON.stringify(r));
  const lib = q1('SELECT * FROM carga_liberacao');
  ok('a liberação guarda dia, pessoa, motivo e quem liberou',
     lib && lib.dia === hoje && lib.pessoa === 'Ana' && lib.motivo === 'sozinha na expedição' && lib.liberado_por === 'Sup',
     JSON.stringify(lib));
  ok('a liberação vai para a auditoria', auditoria.some(a => a.acao === 'liberar_mesma_pessoa' && a.quem === 'Sup'));
  r = await chamar('POST /api/carregar/liberar', {pessoa:'ana', motivo:'de novo'}, SUP);
  ok('liberar de novo no mesmo dia não duplica', r.ok === true && q1('SELECT COUNT(*) n FROM carga_liberacao').n === 1,
     JSON.stringify(r));

  r = await chamar('POST /api/carregar', {code:'PAgencia2'}, ANA);
  ok('liberada, a Ana confere a caixa que ela mesma imprimiu', r.ok === true && r.conferida === true, JSON.stringify(r));
  const p = (await chamar('GET /api/carregamento')).pilha;
  ok('e a caixa continua marcada "sem segunda pessoa" na pilha', p.sem_segunda.some(s => s.id === ag2), JSON.stringify(p.sem_segunda));

  // ── ontem não vale hoje ──
  db.prepare("INSERT INTO carga_liberacao (dia,pessoa,motivo,liberado_por) VALUES (?,?,?,?)").run(ontem, 'Carla', 'ontem', 'Sup');
  vol('DaCarla', 'Carla', false);
  r = await chamar('POST /api/carregar', {code:'PDaCarla'}, CARLA);
  ok('a liberação de ontem não vale hoje', r.ok === false && r.motivo === 'mesma_pessoa', JSON.stringify(r));

  // ── o GET da tela ──
  let g = await chamar('GET /api/carregamento', {}, SUP);
  ok('o GET traz as liberações de hoje, com motivo e quem liberou',
     Array.isArray(g.liberacoes_hoje) && g.liberacoes_hoje.length === 1 && g.liberacoes_hoje[0].pessoa === 'Ana'
       && g.liberacoes_hoje[0].liberado_por === 'Sup' && g.liberacoes_hoje[0].motivo === 'sozinha na expedição',
     JSON.stringify(g.liberacoes_hoje));
  ok('o GET diz que o supervisor pode liberar', g.pode_liberar === true);
  g = await chamar('GET /api/carregamento', {}, BETO);
  ok('e que a bancada não pode', g.pode_liberar === false);
  ok('as linhas da pilha trazem quem imprimiu', (g.pilha.faltam||[]).every(f => 'impresso_por' in f) && g.pilha.faltam.length > 0,
     JSON.stringify(g.pilha.faltam));

  console.log('\n' + (falhas ? falhas + ' FALHA(S)' : 'tudo certo') + ' — ' + casos + ' casos');
  process.exit(falhas ? 1 : 0);
})().catch(e => { console.error(e); process.exit(1); });

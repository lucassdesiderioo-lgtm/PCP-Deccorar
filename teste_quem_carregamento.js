#!/usr/bin/env node
/* teste_quem_carregamento.js — QUEM FEZ na Conferência (o Carregamento), na
 * saída do caminhão e na viagem à agência. Spec QUEM-FEZ-E-REVISAO, fase 4
 * (05/11/2026).
 *
 *   node teste_quem_carregamento.js
 *
 * Quatro coisas:
 *   1. sem login nada grava: toda rota de escrita responde 401 e o banco não
 *      muda (regra-mãe, spec §2.3);
 *   2. o id de quem fez entra ao lado do nome (`lote.conferido_por_id`,
 *      `lote.no_carro_por_id`, `saida.aberta_por_id`, `fechado_por_id`,
 *      `liberado_por_id`);
 *   3. "a mesma pessoa" (quem imprimiu não confere — R-SEG-01; quem conferiu
 *      não separa a cancelada — D8; a conta "sem segunda pessoa") é pelo ID
 *      quando os dois lados têm o id: quem mudou de nome no cadastro continua
 *      barrado, e duas pessoas de nome igual não se barram;
 *   4. a caixa de antes, sem id, continua pelo nome, como sempre foi.
 *
 * Sobe um banco temporário e chama os handlers direto, com um `app` de mentira.
 */
const Database = require('better-sqlite3');
const fs = require('fs'), os = require('os'), path = require('path');

const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'pcp-quem-carga-'));
process.env.PCP_DIR = tmp;

let falhas = 0, casos = 0;
const ok = (n, c, extra) => { casos++;
  if(c) console.log('ok      ' + n);
  else { falhas++; console.log('FALHOU  ' + n + (extra ? '   ' + extra : '')); } };

const db = new Database(path.join(tmp, 't.db'));
const rotas = {};
const app = { get:(p,...h)=>{ rotas['GET '+p]=h[h.length-1]; },
              post:(p,...h)=>{ rotas['POST '+p]=h[h.length-1]; },
              use:()=>{}, locals:{ acesso:{ auditar(){}, podePermissao(){ return true; } } } };
db.exec(`CREATE TABLE IF NOT EXISTS modelo (id INTEGER PRIMARY KEY AUTOINCREMENT, codigo TEXT, nome TEXT,
    exige_medida INTEGER DEFAULT 1, sob_medida INTEGER DEFAULT 0);
  CREATE TABLE IF NOT EXISTS skus (codigo TEXT PRIMARY KEY, descricao TEXT DEFAULT '', cor TEXT DEFAULT '',
    estoque INTEGER DEFAULT 0, alvo INTEGER DEFAULT 0, modelo_id INTEGER);
  CREATE TABLE IF NOT EXISTS usuarios (id INTEGER PRIMARY KEY, nome TEXT, ativo INTEGER DEFAULT 1);
  INSERT OR IGNORE INTO usuarios (id,nome) VALUES (1,'Ana'),(2,'Beto'),(4,'Carla'),(5,'Ana');`);
db.prepare("INSERT OR IGNORE INTO skus (codigo,estoque) VALUES ('BK140140BEGE',100)").run();
require('./estoque_dominio').garantirSchema(db);
require('./exp_route')(app, db);
require('./carreg_route')(app, db);
require('./saida_route')(app, db);

let ultimoStatus = 200;
const chamar = (k, body, usuario) => new Promise(r => {
  ultimoStatus = 200;
  if(!rotas[k]) return r({ __sem_rota:k });
  const res = { json:o=>r(o||{}), status(c){ ultimoStatus = c; return res; }, send:o=>r(o), setHeader(){} };
  try{ rotas[k]({ body:body||{}, params:{}, query:{}, headers:{}, usuario:usuario===undefined?null:usuario }, res); }
  catch(e){ ultimoStatus = 500; r({ __estourou:String(e.message||e) }); }
});
const ANA = {id:1,nome:'Ana'}, BETO = {id:2,nome:'Beto'};
const ANA_RENOMEADA = {id:1,nome:'Ana Maria'};   // a mesma pessoa, com o nome trocado no cadastro
const OUTRA_ANA = {id:5,nome:'Ana'};             // outra pessoa, com o mesmo nome
const FOTO = 'data:image/jpeg;base64,' + Buffer.alloc(3000, 7).toString('base64');
const q1 = (s, ...a) => db.prepare(s).get(...a);
const hoje = q1("SELECT date('now','localtime') d").d;
const lote = id => q1('SELECT * FROM lote WHERE id=?', id);
const col = (t, c) => db.prepare(`SELECT name FROM pragma_table_info('${t}')`).all().some(x => x.name === c);

/* Uma caixa impressa hoje. `impressoId` null é a caixa de antes da fase 3. */
const vol = (buyer, impressoNome, impressoId, coleta) => db.prepare(`INSERT INTO lote
    (codigo,buyer,nf,packId,codes,estagio,data,despachar_em,embalado_em,impresso_por,impresso_por_id,modalidade)
    VALUES ('BK140140BEGE',?,?,?,?,'embalado',?,?,datetime('now','localtime'),?,?,?)`)
  .run(buyer, 'NF'+buyer, 'P'+buyer, JSON.stringify(['P'+buyer]), hoje, hoje, impressoNome, impressoId,
       coleta ? 'coleta' : 'agencia').lastInsertRowid;

/* O retrato do que importa no banco: se ele não muda, nada foi gravado. */
const retrato = () => JSON.stringify({
  lote: db.prepare('SELECT * FROM lote ORDER BY id').all(),
  saida: db.prepare('SELECT * FROM saida ORDER BY id').all(),
  livro: q1('SELECT COUNT(*) n FROM movimento_estoque').n,
  fim: (() => { try{ return db.prepare('SELECT * FROM fim_dia').all(); }catch(e){ return []; } })(),
  canc: (() => { try{ return db.prepare('SELECT * FROM cancelamento_caixa').all(); }catch(e){ return []; } })() });

(async () => {
  const ag1 = vol('Ag1', 'Ana', 1, false);
  const ag2 = vol('Ag2', 'Ana', 1, false);
  const ag3 = vol('Ag3', 'Ana', 1, false);
  const co1 = vol('Co1', 'Ana', 1, true);
  const antiga = vol('Antiga', 'Carla', null, false);

  // ── 1. SEM LOGIN, NADA GRAVA ─────────────────────────────────────────────
  console.log('\n── 1. sem login, toda rota de escrita responde 401 e nada muda ──');
  const ROTAS = [
    ['POST /api/carregar', {code:'PAg1'}],
    ['POST /api/carregar/peca', {code:'PAg1', sku:'BK140140BEGE'}],
    ['POST /api/carregar/recomecar', {code:'PAg1'}],
    ['POST /api/carregamento/sobra', {id:ag1}],
    ['POST /api/carregamento/cancelada/confirmar', {id:1}],
    ['POST /api/carregamento/cancelada/recusar', {id:1, motivo:'x'}],
    ['POST /api/carregamento/fimdia', {ids:[co1]}],
    ['POST /api/saida/abrir', {}],
    ['POST /api/saida/sobra', {code:'PCo1'}],
    ['POST /api/saida/sobra/tirar', {id:co1}],
    ['POST /api/saida/nada', {}],
    ['POST /api/saida/levou', {code:'PAg1'}],
    ['POST /api/saida/levou/tirar', {id:ag1}],
    ['POST /api/saida/cancelar', {}],
    ['POST /api/saida/fechar', {motorista:1, foto:FOTO}],
    ['POST /api/saida/liberar', {motorista:1, foto:FOTO, motivo:'x'}],
    ['POST /api/viagem/abrir', {}],
    ['POST /api/viagem/ficou', {code:'PAg1'}],
    ['POST /api/viagem/carro', {code:'PAg1'}],
    ['POST /api/viagem/tirar', {id:ag1}],
    ['POST /api/viagem/cancelar', {}],
    ['POST /api/viagem/fechar', {atendente:1, foto:FOTO, quem_levou_id:2}],
    ['POST /api/viagem/liberar', {atendente:1, foto:FOTO, quem_levou_id:2, motivo:'x'}],
  ];
  const antes = retrato();
  for(const [k, corpo] of ROTAS){
    await chamar(k, corpo, null);
    ok(k + ' sem login leva 401', ultimoStatus === 401, String(ultimoStatus));
  }
  await chamar('POST /api/carregar', {code:'PAg1'}, { nome:'Sem Id' });
  ok('pessoa sem id também leva 401 (o bipe da área)', ultimoStatus === 401, String(ultimoStatus));
  await chamar('POST /api/saida/abrir', {}, { nome:'Sem Id' });
  ok('pessoa sem id também leva 401 (abrir a saída)', ultimoStatus === 401, String(ultimoStatus));
  ok('e o banco não mudou em nada', retrato() === antes);

  // ── 2. O ID ENTRA AO LADO DO NOME ────────────────────────────────────────
  console.log('\n── 2. a conferência grava o id de quem conferiu ──');
  let r = await chamar('POST /api/carregar', {code:'PAg1'}, BETO);
  ok('o Beto confere a caixa da Ana', r.ok === true, JSON.stringify(r));
  ok('o lote tem a coluna conferido_por_id', col('lote', 'conferido_por_id'));
  ok('conferido_por_id é o id do Beto', lote(ag1).conferido_por_id === 2, JSON.stringify(lote(ag1).conferido_por_id));
  ok('e o nome ao lado, como sempre', lote(ag1).conferido_por === 'Beto', lote(ag1).conferido_por);

  // ── 3. "A MESMA PESSOA" PELO ID ──────────────────────────────────────────
  console.log('\n── 3. quem imprimiu não confere (R-SEG-01): pelo id ──');
  r = await chamar('POST /api/carregar', {code:'PAg2'}, ANA_RENOMEADA);
  ok('a Ana com o nome trocado no cadastro continua barrada na caixa que ela imprimiu',
     r.ok === false && r.motivo === 'mesma_pessoa', JSON.stringify(r));
  ok('e a caixa não foi conferida', !lote(ag2).conferido_em && !lote(ag2).conferido_por_id);
  r = await chamar('POST /api/carregar', {code:'PAg2'}, OUTRA_ANA);
  ok('outra pessoa chamada Ana NÃO é barrada (o id é outro)', r.ok === true, JSON.stringify(r));
  ok('e a caixa fica conferida por ela (id 5)', lote(ag2).conferido_por_id === 5, JSON.stringify(lote(ag2).conferido_por_id));

  console.log('\n── 4. a caixa de antes, sem id, continua pelo nome ──');
  r = await chamar('POST /api/carregar', {code:'PAntiga'}, {id:4, nome:'Carla'});
  ok('impressa pela Carla sem id: a Carla continua barrada pelo nome', r.ok === false && r.motivo === 'mesma_pessoa', JSON.stringify(r));
  r = await chamar('POST /api/carregar', {code:'PAntiga'}, BETO);
  ok('e outra pessoa confere', r.ok === true, JSON.stringify(r));

  console.log('\n── 5. quem conferiu não separa a cancelada (D8): pelo id ──');
  r = await chamar('POST /api/carregamento/sobra', {id:ag1}, {id:2, nome:'Roberto'});
  ok('o Beto com outro nome continua barrado na caixa que ele conferiu', r.motivo === 'mesma_pessoa', JSON.stringify(r));
  r = await chamar('POST /api/carregamento/sobra', {id:ag1}, {id:7, nome:'Beto'});
  ok('outro Beto (outro id) não é barrado', r.motivo !== 'mesma_pessoa' && ultimoStatus === 200, JSON.stringify(r));

  // ── 6. A SAÍDA DO CAMINHÃO ───────────────────────────────────────────────
  console.log('\n── 6. a saída do caminhão grava o id de quem abriu, fechou e liberou ──');
  r = await chamar('POST /api/carregar', {code:'PCo1'}, BETO);     // a coleta vai pro canto
  ok('a coleta foi pro canto', r.ok === true && r.coleta === true, JSON.stringify(r));
  r = await chamar('POST /api/saida/abrir', {}, ANA);
  const s1 = q1("SELECT * FROM saida WHERE tipo='coleta' ORDER BY id DESC");
  ok('a saída tem as colunas aberta_por_id, fechado_por_id e liberado_por_id',
     col('saida','aberta_por_id') && col('saida','fechado_por_id') && col('saida','liberado_por_id'));
  ok('quem abriu: a Ana, pelo id', s1 && s1.aberta_por_id === 1 && s1.aberta_por === 'Ana', JSON.stringify(s1));
  await chamar('POST /api/saida/nada', {}, BETO);
  r = await chamar('POST /api/saida/fechar', {motorista:1, foto:FOTO}, BETO);
  const s1b = q1('SELECT * FROM saida WHERE id=?', s1.id);
  ok('a saída fecha', r.ok === true && !!s1b.fechada_em, JSON.stringify(r));
  ok('quem fechou: o Beto, pelo id', s1b.fechado_por_id === 2 && s1b.fechado_por === 'Beto', JSON.stringify(s1b));
  ok('sem divergência, ninguém liberou', s1b.liberado_por_id == null, JSON.stringify(s1b.liberado_por_id));
  await chamar('POST /api/saida/abrir', {}, ANA);
  await chamar('POST /api/saida/nada', {}, ANA);
  r = await chamar('POST /api/saida/liberar', {motorista:1, foto:FOTO, motivo:'motorista contou outra'}, BETO);
  const s2 = q1("SELECT * FROM saida WHERE tipo='coleta' ORDER BY id DESC");
  ok('com divergência, o Beto libera', r.ok === true && !!s2.fechada_em, JSON.stringify(r));
  ok('quem liberou: o Beto, pelo id', s2.liberado_por_id === 2 && s2.liberado_por === 'Beto', JSON.stringify(s2));

  // ── 7. A VIAGEM À AGÊNCIA ────────────────────────────────────────────────
  console.log('\n── 7. a viagem grava o id de quem pôs no carro e de quem fechou ──');
  r = await chamar('POST /api/viagem/abrir', {}, ANA);
  const v = q1("SELECT * FROM saida WHERE tipo='agencia' ORDER BY id DESC");
  ok('a viagem abre', r.ok !== false && !!v, JSON.stringify(r));
  ok('o lote tem a coluna no_carro_por_id', col('lote', 'no_carro_por_id'));
  ok('quem abriu a viagem: a Ana, pelo id', v && v.aberta_por_id === 1, JSON.stringify(v));
  ok('as caixas conferidas entram no carro com o id de quem abriu',
     lote(ag1).no_carro_por_id === 1 && lote(ag2).no_carro_por_id === 1, JSON.stringify([lote(ag1).no_carro_por_id, lote(ag2).no_carro_por_id]));
  r = await chamar('POST /api/viagem/ficou', {code:'PAntiga'}, BETO);
  r = await chamar('POST /api/viagem/carro', {code:'PAntiga'}, BETO);
  ok('pôr mais uma no carro grava o id de quem pôs', lote(antiga).no_carro_por_id === 2, JSON.stringify(lote(antiga).no_carro_por_id));
  const noCarro = q1('SELECT COUNT(*) n FROM lote WHERE saida_id=?', v.id).n;
  r = await chamar('POST /api/viagem/fechar', {atendente:noCarro, foto:FOTO, quem_levou_id:2}, BETO);
  const vb = q1('SELECT * FROM saida WHERE id=?', v.id);
  ok('a viagem fecha', r.ok === true && !!vb.fechada_em, JSON.stringify(r));
  ok('quem fechou a viagem: o Beto, pelo id', vb.fechado_por_id === 2 && vb.fechado_por === 'Beto', JSON.stringify(vb));
  /* A Ag2 foi impressa pela Ana (id 1) e conferida pela OUTRA Ana (id 5): pelo
     nome era "sem segunda pessoa"; pelo id são duas pessoas. */
  ok('"sem segunda pessoa" conta pelo id: a outra Ana não é a mesma Ana', vb.sem_segunda_pessoa === 0, String(vb.sem_segunda_pessoa));

  // ── 8. A PILHA DA ÁREA ───────────────────────────────────────────────────
  console.log('\n── 8. a pilha da área conta "sem segunda pessoa" pela mesma régua ──');
  const ag4 = vol('Ag4', 'Ana', 1, false);
  db.prepare("UPDATE lote SET conferido_por='Ana Maria', conferido_por_id=1, conferido_em=datetime('now','localtime') WHERE id=?").run(ag4);
  const g = await chamar('GET /api/carregamento', {}, BETO);
  const sem2 = (g.pilha && g.pilha.sem_segunda || []).map(x => x.id);
  ok('a caixa impressa e conferida pela mesma Ana (nomes diferentes, mesmo id) é "sem segunda pessoa"',
     sem2.includes(ag4), JSON.stringify(sem2));
  ok('e a impressa por uma Ana e conferida pela outra Ana não é', !sem2.includes(ag2), JSON.stringify(sem2));

  console.log('\n' + (falhas ? falhas + ' FALHA(S)' : 'tudo certo') + ' — ' + casos + ' casos');
  try{ db.close(); fs.rmSync(tmp, {recursive:true, force:true}); }catch(e){}
  process.exit(falhas ? 1 : 0);
})().catch(e => { console.error(e); process.exit(1); });

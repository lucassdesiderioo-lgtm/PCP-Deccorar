#!/usr/bin/env node
/* Testes da fase 2 da spec SAIDA-E-DUPLA-CONFERENCIA — a conferência da pilha.
 *
 *   node teste_area.js
 *
 * A dupla conferência são duas contagens por caixa: a impressão da etiqueta
 * (bipe 1, `impresso_por`) e a conferência na área de expedição (bipe 2,
 * `conferido_por`). Nesta fase o bipe 2 é o bipe que o Carregamento já tem
 * (opção A, decidida pelo dono em 26/09/2026) — o que nasce é a CONTA:
 *
 *     impressas hoje 70 · conferidas 68 · faltam 2   (com nome de cada uma)
 *
 * O que estes casos travam:
 * - a conta fecha caixa a caixa (impressas = conferidas + faltam);
 * - a adiantada ENTRA na pilha, marcada (decisão 4 da spec);
 * - caixa impressa num dia anterior e não conferida não some (armadilha #9);
 * - pendente continua recusado no bipe e não entra na conta;
 * - mesmo login nos dois bipes é ACEITO e marcado, nunca bloqueado (decisão 2),
 *   e caixa sem o nome de quem imprimiu é "sem registro", nunca "mesma pessoa".
 *
 * Sobe um banco temporário e chama os módulos de verdade, com um `app` de
 * mentira que só guarda as rotas. Não abre porta, não toca no banco de produção.
 */
const Database = require('better-sqlite3');
const fs = require('fs'), os = require('os'), path = require('path');

const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'pcp-area-'));
process.env.PCP_DIR = tmp;

let falhas = 0, casos = 0;
const ok = (n, c, extra) => { casos++;
  if(c) console.log('ok      ' + n);
  else { falhas++; console.log('FALHOU  ' + n + (extra ? '   ' + extra : '')); } };

const db = new Database(path.join(tmp, 't.db'));
db.exec(`CREATE TABLE lote (id INTEGER PRIMARY KEY AUTOINCREMENT, codigo TEXT, cor TEXT, buyer TEXT,
  city TEXT, nf TEXT, packId TEXT, venda TEXT, codes TEXT DEFAULT '[]', estagio TEXT, data TEXT,
  embalado_em TEXT, carregado_em TEXT, despachar_em TEXT, modalidade TEXT, retirado_em TEXT,
  impresso_por TEXT, conferido_por TEXT, conferido_em TEXT, saida_id INTEGER, saiu_em TEXT, saiu_por TEXT);
  CREATE TABLE lote_item (id INTEGER PRIMARY KEY AUTOINCREMENT, lote_id INTEGER, codigo TEXT, qtd INTEGER DEFAULT 1);`);
const q1 = s => db.prepare(s).get();
const hoje = q1("SELECT date('now','localtime') d").d;
const ontem = q1("SELECT date('now','localtime','-1 day') d").d;
const futuro = q1("SELECT date('now','localtime','+6 day') d").d;
const agora = "datetime('now','localtime')";

const vol = (buyer, estagio, embaladoEm, extra) => {
  const id = db.prepare(`INSERT INTO lote (codigo,buyer,nf,packId,codes,estagio,data,despachar_em,embalado_em)
    VALUES ('BK140140BEGE',?,?,?,?,?,?,?,${embaladoEm})`)
    .run(buyer, 'NF'+buyer, 'P'+buyer, JSON.stringify(['P'+buyer]), estagio, hoje, hoje).lastInsertRowid;
  if(extra) db.prepare('UPDATE lote SET '+extra+' WHERE id=?').run(id);
  return id;
};

/* O dia de hoje: quatro impressas pela Ana, uma pelo Beto, uma sem nome. */
const a1 = vol('Um',     'embalado', agora, "impresso_por='Ana'");
const a2 = vol('Dois',   'embalado', agora, "impresso_por='Ana'");
const a3 = vol('Tres',   'embalado', agora, "impresso_por='Ana', modalidade='coleta'");
const adi= vol('Futura', 'embalado', agora, `impresso_por='Ana', despachar_em='${futuro}'`);
const b1 = vol('Beto',   'embalado', agora, "impresso_por='Beto'");
const sn = vol('SemNome','embalado', agora, null);
/* Ontem: impressa e esquecida — a caixa que ficou para trás. */
const velha = vol('Velha', 'embalado', `'${ontem} 16:00:00'`, "impresso_por='Ana'");
/* O que não é pilha: pendente (etiqueta não impressa) e bloqueado. */
const pend = vol('Pendente', 'pendente', 'NULL', null);
vol('Bloq', 'bloqueado', 'NULL', null);

const rotas = {};
const app = { get:(p,...h)=>{ rotas['GET '+p]=h[h.length-1]; }, post:(p,...h)=>{ rotas['POST '+p]=h[h.length-1]; },
              locals:{ acesso:{ auditar(){} } } };
require('./carreg_route')(app, db);
const chamar = (k, body, usuario) => new Promise(r => {
  const res = { json:o=>r(o), status(){ return res; }, send:o=>r(o) };
  rotas[k]({ body:body||{}, headers:{}, usuario:usuario||null }, res);
});
const ANA = {id:1,nome:'Ana'}, BETO = {id:2,nome:'Beto'};
const pilha = async () => (await chamar('GET /api/carregamento')).pilha;

(async () => {
  let p = await pilha();
  ok('o GET /api/carregamento traz o bloco da pilha', !!p && !!p.hoje, JSON.stringify(p));
  ok('antes de conferir: 6 impressas hoje, 0 conferidas, 6 faltam',
     p.hoje.impressas === 6 && p.hoje.conferidas === 0 && p.hoje.faltam === 6, JSON.stringify(p.hoje));
  ok('a lista das que faltam traz as 6, com cliente e NF',
     p.faltam.length === 6 && p.faltam.every(f => f.buyer && f.nf), JSON.stringify(p.faltam.map(f => f.buyer)));
  const fut = p.faltam.find(f => f.id === adi);
  ok('a adiantada entra na pilha e vem marcada com a data do despacho',
     !!fut && fut.adiantada === true && fut.despachar_em === futuro, JSON.stringify(fut));
  ok('pendente e bloqueado não entram na pilha',
     !p.faltam.concat(p.anteriores).some(f => f.buyer === 'Pendente' || f.buyer === 'Bloq'));
  ok('a caixa impressa ontem e não conferida aparece à parte, e não some',
     p.anteriores.length === 1 && p.anteriores[0].id === velha && !p.faltam.some(f => f.id === velha),
     JSON.stringify(p.anteriores));

  // ── o bipe 2 ──
  let r = await chamar('POST /api/carregar', {code:'PUm'}, BETO);          // Ana imprimiu, Beto confere
  ok('o bipe confere (pessoa diferente)', r.ok, JSON.stringify(r));
  r = await chamar('POST /api/carregar', {code:'PDois'}, ANA);             // Ana imprimiu e Ana confere
  ok('mesmo login nos dois bipes é ACEITO, nunca bloqueado (decisão 2)', r.ok, JSON.stringify(r));
  r = await chamar('POST /api/carregar', {code:'PTres'}, ANA);             // coleta, mesma pessoa
  ok('a caixa de coleta também é conferida pelo mesmo bipe', r.ok && r.coleta, JSON.stringify(r));
  r = await chamar('POST /api/carregar', {code:'PFutura'}, BETO);          // a adiantada, conferida
  ok('a adiantada é conferida como qualquer caixa', r.ok, JSON.stringify(r));
  r = await chamar('POST /api/carregar', {code:'PSemNome'}, ANA);          // sem nome de quem imprimiu
  ok('caixa sem o nome de quem imprimiu também é conferida', r.ok, JSON.stringify(r));
  r = await chamar('POST /api/carregar', {code:'PPendente'}, ANA);
  ok('pendente continua recusado no bipe (dívida 13)', r.motivo === 'nao_embalado', JSON.stringify(r));

  p = await pilha();
  ok('depois: 6 impressas, 5 conferidas, 1 falta',
     p.hoje.impressas === 6 && p.hoje.conferidas === 5 && p.hoje.faltam === 1, JSON.stringify(p.hoje));
  ok('a conta fecha caixa a caixa: impressas = conferidas + faltam, e a lista tem o tamanho de faltam',
     p.hoje.impressas === p.hoje.conferidas + p.hoje.faltam && p.faltam.length === p.hoje.faltam);
  ok('a que falta é a certa (a do Beto, ninguém bipou)',
     p.faltam.length === 1 && p.faltam[0].id === b1, JSON.stringify(p.faltam));
  ok('o pendente bipado não entrou na conta', p.hoje.impressas === 6);

  ok('"sem segunda pessoa" conta 2 (Dois e Tres: Ana imprimiu e Ana conferiu)',
     p.hoje.sem_segunda === 2, JSON.stringify(p.hoje));
  ok('e lista as duas, com quem fez',
     p.sem_segunda.length === 2 && p.sem_segunda.every(s => s.quem === 'Ana') &&
     [a2,a3].every(i => p.sem_segunda.some(s => s.id === i)), JSON.stringify(p.sem_segunda));
  ok('caixa conferida por outra pessoa NÃO é marcada', !p.sem_segunda.some(s => s.id === a1 || s.id === adi));
  ok('caixa sem o nome de quem imprimiu é "sem registro", nunca "mesma pessoa"',
     p.hoje.sem_registro === 1 && !p.sem_segunda.some(s => s.id === sn), JSON.stringify(p.hoje));

  /* Mesmo nome com caixa e espaço diferentes é a mesma pessoa: o nome vem do
     cadastro de login, e " ana" x "Ana" não é segunda pessoa. */
  db.prepare("UPDATE lote SET impresso_por=' ana ' WHERE id=?").run(b1);
  r = await chamar('POST /api/carregar', {code:'PBeto'}, ANA);
  p = await pilha();
  ok('"Ana" e " ana " são a mesma pessoa', p.hoje.sem_segunda === 3, JSON.stringify(p.hoje));
  ok('tudo de hoje conferido: faltam 0', p.hoje.faltam === 0 && p.faltam.length === 0);

  /* Ninguém logado nos DOIS bipes: vazio igual a vazio não é "a mesma pessoa",
     é não saber quem fez. Sem a guarda, dois nomes em branco batiam. */
  const anon = vol('Anonimo', 'embalado', agora, null);
  r = await chamar('POST /api/carregar', {code:'PAnonimo'}, null);
  p = await pilha();
  ok('ninguém logado nos dois bipes é "sem registro", nunca "mesma pessoa"',
     r.ok && p.hoje.sem_registro === 2 && !p.sem_segunda.some(s => s.id === anon), JSON.stringify(p.hoje));

  // ── a de ontem ──
  r = await chamar('POST /api/carregar', {code:'PVelha'}, BETO);
  p = await pilha();
  ok('conferida a de ontem, ela sai da lista das anteriores', r.ok && p.anteriores.length === 0);
  ok('e não entra na conta de hoje (foi impressa ontem)', p.hoje.impressas === 7);

  // ── o que o bipe já fazia continua ──
  const c = await chamar('GET /api/carregamento');
  ok('o "No carro" e a coleta continuam no mesmo GET', typeof c.carregados === 'number' && !!c.coleta);

  console.log('\n' + (falhas ? falhas + ' FALHA(S)' : 'tudo certo') + ' — ' + casos + ' casos');
  process.exit(falhas ? 1 : 0);
})().catch(e => { console.error(e); process.exit(1); });

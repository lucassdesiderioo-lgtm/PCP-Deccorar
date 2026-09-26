#!/usr/bin/env node
/* Testes da media de vendas contada pelo SISTEMA (VENDAS-E-MEDIA, fase 1).
 *
 *   node teste_media.js
 *
 * A media de hoje sai da planilha do ML, e a planilha e espelho: um recorte
 * apaga os 30 dias de historia e a tela azul para de pedir producao (armadilha
 * #11). A historia de vendas ja esta no sistema — todo volume do ML passa pelo
 * PDF da expedicao —, e o `media_dominio.js` a conta a partir de `lote`.
 *
 * Nesta fase ela so aparece AO LADO da planilha, para conferencia. Os casos
 * travam as regras da spec §4.1: conta PECA (a caixa de varias conta N), volume
 * sem `lote_item` conta 1, teste e cancelada ficam fora, bloqueado conta, a
 * janela maior que a historia e cortada e dita, e PDF repetido nao dobra.
 *
 * E o caso que vale mais que todos: a comparacao le a media da planilha do
 * PROPRIO `demanda_dominio`, nunca de uma consulta sua — e a produção continua
 * pela planilha.
 *
 * Sobe um banco temporario e chama os handlers direto. Nao toca em producao.
 */
const Database = require('better-sqlite3');
const fs = require('fs'), os = require('os'), path = require('path');

const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'pcp-media-'));
const db = new Database(path.join(tmp, 't.db'));
db.exec(`
  CREATE TABLE skus (codigo TEXT PRIMARY KEY, descricao TEXT DEFAULT '', cor TEXT DEFAULT '',
    estoque INTEGER DEFAULT 0, alvo INTEGER DEFAULT 0, modelo_id INTEGER);
  CREATE TABLE modelo (id INTEGER PRIMARY KEY, codigo TEXT, nome TEXT, sob_medida INTEGER DEFAULT 0,
    exige_medida INTEGER DEFAULT 1);
  CREATE TABLE lote (id INTEGER PRIMARY KEY AUTOINCREMENT, codigo TEXT, packId TEXT, venda TEXT,
    estagio TEXT DEFAULT 'pendente', data TEXT DEFAULT (date('now','localtime')),
    teste INTEGER DEFAULT 0, bloqueio TEXT);
  CREATE TABLE lote_item (id INTEGER PRIMARY KEY AUTOINCREMENT, lote_id INTEGER NOT NULL,
    codigo TEXT, qtd INTEGER DEFAULT 1, teste INTEGER DEFAULT 0);
`);

const rotas = {};
const app = {
  get:(p, ...h)=>{ rotas['GET '+p]  = h[h.length-1]; },
  post:(p, ...h)=>{ rotas['POST '+p] = h[h.length-1]; },
  use:()=>{}, locals:{}
};
require('./plan_route')(app, db);   // cria venda_futura e config
const MEDIA = require('./media_dominio');

let ok = 0, falhou = 0;
function caso(nome, cond, extra){
  if(cond){ ok++; console.log('  ✓ ' + nome); }
  else { falhou++; console.log('  ✗ ' + nome + (extra !== undefined ? '  → ' + JSON.stringify(extra) : '')); }
}
function chamar(rota, query){
  let out = null, st = 200;
  const res = { status(n){ st = n; return this; }, json(o){ out = o; return this; } };
  rotas[rota]({ query: query || {}, body: {}, params: {} }, res);
  return { st, out };
}
const dia = n => db.prepare("SELECT date('now','localtime','-'||?||' days') d").get(n).d;
const vol = db.prepare("INSERT INTO lote (codigo,packId,venda,estagio,data,teste) VALUES (?,?,?,?,?,?)");
const item = db.prepare("INSERT INTO lote_item (lote_id,codigo,qtd) VALUES (?,?,?)");
const novo = (cod, pack, venda, estagio, d, teste) =>
  vol.run(cod, pack, venda, estagio || 'embalado', d || dia(1), teste || 0).lastInsertRowid;

db.prepare("INSERT INTO skus (codigo) VALUES ('BK140140BEGE'),('BK120120BEGE'),('BK160160CINZA')").run();

/* A historia comeca ha 40 dias, entao a janela de 30 cabe inteira. */
novo('BK160160CINZA', 'P0', 'V0', 'carregado', dia(40));     // fora da janela

/* BK140140BEGE: 15 volumes simples na janela = 15 pecas = 0,5/dia. */
for(let i = 1; i <= 15; i++) novo('BK140140BEGE', 'P1'+i, 'V1'+i, 'carregado', dia(i));

/* Caixa de PACOTE (armadilha #23): um volume, 1 × BK120120BEGE + 2 × BK140140BEGE.
   O volume conta TRES pecas, repartidas pelo SKU de cada uma — e nao 1 do
   `lote.codigo`, que e so o item de cima. */
const pac = novo('BK120120BEGE', 'P2', 'V2', 'embalado', dia(2));
item.run(pac, 'BK120120BEGE', 1);
item.run(pac, 'BK140140BEGE', 2);

/* Caixa de 1 SKU com N unidades: uma linha com qtd 3. */
const n3 = novo('BK160160CINZA', 'P3', 'V3', 'embalado', dia(3));
item.run(n3, 'BK160160CINZA', 3);

/* BLOQUEADO conta: e venda, a duvida e so de leitura. */
novo('BK160160CINZA', 'P4', 'V4', 'bloqueado', dia(4));

/* MODO TESTE fica fora. */
novo('BK120120BEGE', 'P5', 'V5', 'embalado', dia(5), 1);

/* PDF REPETIDO: o mesmo pack de novo (fantasma anterior a 25/08, armadilha #5).
   O mais antigo e quem carrega a historia; a copia nao conta. */
novo('BK120120BEGE', 'P6', 'V6', 'carregado', dia(6));
novo('BK120120BEGE', 'P6', 'V6', 'pendente', dia(1));
/* E a mesma venda sem pack, repetida. */
novo('BK120120BEGE', '', 'V7', 'carregado', dia(7));
novo('BK120120BEGE', '', 'V7', 'pendente', dia(2));

/* A COPIA DENTRO DA JANELA, com o original de FORA dela: o original entrou ha
   35 dias e a copia ha 2. A copia nao e venda nova. */
novo('BK160160CINZA', 'P9', 'V9', 'carregado', dia(35));
novo('BK160160CINZA', 'P9', 'V9', 'pendente', dia(2));

/* Volume sem codigo lido nao vira peca de ninguem — e vai contado a parte. */
novo('', 'P8', 'V8', 'bloqueado', dia(3));

console.log('\n1. A conta por peça');
let m = MEDIA.mediaPorSku(db, { janela: 30 });
caso('volume simples conta 1 peça cada (15) + 2 da caixa de pacote = 17',
  m.skus.BK140140BEGE && m.skus.BK140140BEGE.pecas === 17, m.skus.BK140140BEGE);
caso('BK120120BEGE: 1 da caixa de pacote + 1 do pack repetido + 1 da venda repetida = 3',
  m.skus.BK120120BEGE && m.skus.BK120120BEGE.pecas === 3, m.skus.BK120120BEGE);
caso('linha de qtd 3 conta 3 peças, e o bloqueado conta 1 → 4',
  m.skus.BK160160CINZA && m.skus.BK160160CINZA.pecas === 4, m.skus.BK160160CINZA);
caso('volume fora da janela não entra', m.skus.BK160160CINZA.volumes === 2, m.skus.BK160160CINZA);
caso('a média divide pela janela: 17 ÷ 30',
  Math.abs(m.skus.BK140140BEGE.media - 17/30) < 1e-9, m.skus.BK140140BEGE.media);

console.log('\n2. O que fica de fora');
caso('volume do modo teste não conta (BK120120BEGE teria 4)', m.skus.BK120120BEGE.pecas === 3);
caso('PDF repetido não dobra: o pack repetido e a venda repetida contam uma vez',
  m.repetidos === 3, m.repetidos);
caso('a cópia cujo original entrou ANTES da janela também não conta',
  m.skus.BK160160CINZA.pecas === 4, m.skus.BK160160CINZA);
caso('volume sem código é contado à parte, e não vira peça de ninguém',
  m.sem_codigo === 1 && !m.skus[''], { sem_codigo: m.sem_codigo });

console.log('\n3. A janela maior que a história');
caso('com 40 dias de história, a janela de 30 fica inteira',
  m.janela.pedida === 30 && m.janela.usada === 30 && !m.janela.cortada, m.janela);
let m60 = MEDIA.mediaPorSku(db, { janela: 60 });
caso('janela de 60 com 40 dias de história é CORTADA em 40, e diz isso',
  m60.janela.usada === 40 && m60.janela.cortada === true && m60.janela.primeiro === dia(40), m60.janela);
caso('e a média divide pelos 40 dias que existem, não pelos 60',
  Math.abs(m60.skus.BK140140BEGE.media - 17/40) < 1e-9, m60.skus.BK140140BEGE.media);
const vazio = new Database(':memory:');
vazio.exec("CREATE TABLE lote (id INTEGER PRIMARY KEY, codigo TEXT, packId TEXT, venda TEXT, data TEXT, teste INTEGER DEFAULT 0); CREATE TABLE lote_item (id INTEGER PRIMARY KEY, lote_id INTEGER, codigo TEXT, qtd INTEGER);");
const mv = MEDIA.mediaPorSku(vazio, { janela: 30 });
caso('sem volume nenhum não há média: usada é null, e não zero',
  mv.janela.usada === null && Object.keys(mv.skus).length === 0, mv.janela);

console.log('\n4. A venda cancelada (a coluna nasce na fase 2)');
caso('sem a coluna cancelada_em, a conta roda', m.skus.BK140140BEGE.pecas === 17);
db.exec("ALTER TABLE lote ADD COLUMN cancelada_em TEXT");
db.prepare("UPDATE lote SET cancelada_em=datetime('now') WHERE packId='P11'").run();
m = MEDIA.mediaPorSku(db, { janela: 30 });
caso('com a coluna, o volume cancelado sai da conta (17 → 16)',
  m.skus.BK140140BEGE.pecas === 16, m.skus.BK140140BEGE);
db.prepare("UPDATE lote SET cancelada_em=NULL").run();

console.log('\n5. A comparação com a planilha');
const vf = db.prepare("INSERT INTO venda_futura (venda_id,codigo,data_venda) VALUES (?,?,?)");
for(let i = 1; i <= 30; i++) vf.run('W'+i, 'BK140140BEGE', dia(i % 29));   // 30 vendas = 1/dia
vf.run('W99', 'BK999SOPLANILHA', dia(2));
let r = chamar('GET /api/planejamento/media/comparar');
caso('a rota responde', r.st === 200 && r.out && Array.isArray(r.out.linhas), r);
const L = c => r.out.linhas.find(l => l.codigo === c);
caso('a planilha diz 1/dia e o sistema 17/30 no mesmo SKU',
  L('BK140140BEGE') && L('BK140140BEGE').planilha.media === 1 &&
  Math.abs(L('BK140140BEGE').sistema.media - 17/30) < 0.01, L('BK140140BEGE'));
caso('a diferença é sistema − planilha',
  Math.abs(L('BK140140BEGE').diferenca - (17/30 - 1)) < 0.01, L('BK140140BEGE'));
caso('SKU só na planilha aparece, com o sistema em zero',
  L('BK999SOPLANILHA') && L('BK999SOPLANILHA').sistema.pecas === 0, L('BK999SOPLANILHA'));
caso('SKU só no sistema aparece, com a planilha em zero',
  L('BK160160CINZA') && L('BK160160CINZA').planilha.vendas === 0, L('BK160160CINZA'));
caso('o maior desvio vem primeiro',
  r.out.linhas.every((l, i, a) => i === 0 || Math.abs(a[i-1].diferenca) >= Math.abs(l.diferenca)),
  r.out.linhas.map(l => [l.codigo, l.diferenca]));
caso('a resposta leva a janela e os totais', r.out.janela && r.out.janela.usada === 30 &&
  r.out.totais && typeof r.out.totais.sistema_pecas === 'number', { j: r.out.janela, t: r.out.totais });

/* A PLANILHA LIDA PELO DONO DELA. A media da planilha na tabela tem que ser a
   MESMA que a tela azul usa — se a comparacao tivesse consulta propria, ela
   conferiria a media do sistema contra um numero que a producao nao le. */
const DEMANDA = require('./demanda_dominio');
const dl = DEMANDA.calcular(db).linhas.find(l => l.codigo === 'BK140140BEGE');
caso('a coluna planilha é o número do demanda_dominio, o mesmo da tela azul',
  dl && L('BK140140BEGE').planilha.media === dl.media_dia && L('BK140140BEGE').planilha.vendas === dl.vendas_janela,
  { demanda: dl && [dl.vendas_janela, dl.media_dia], tabela: L('BK140140BEGE').planilha });

console.log('\n6. A produção não mudou de fonte');
caso('a tela azul continua lendo a média da planilha (30 vendas, 1/dia)',
  dl.vendas_janela === 30 && dl.media_dia === 1, dl);
caso('não nasceu config media_fonte nesta fase',
  !db.prepare("SELECT 1 FROM config WHERE chave='media_fonte'").get());

console.log('\n' + ok + ' ok · ' + falhou + ' falhou');
db.close(); fs.rmSync(tmp, { recursive: true, force: true });
process.exit(falhou ? 1 : 0);

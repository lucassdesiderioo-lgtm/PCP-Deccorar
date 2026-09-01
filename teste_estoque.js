#!/usr/bin/env node
/* Testes da aba Estoque — o painel e a conta da falta.
 *
 *   node teste_estoque.js
 *
 * O QUE ORIGINOU ESTES TESTES (01/09/2026): a aba tinha uma conta propria.
 * Ela media a falta como `alvo - estoque` lendo o `skus.alvo` GRAVADO, e a tela
 * AZUL do operador media como `comprometido + alvo - estoque` calculado ao
 * vivo. Os dois se chamavam "a repor" e nao eram o mesmo numero: faltava o
 * COMPROMETIDO na conta do admin, e o alvo dela era uma foto que so muda quando
 * alguem clica "Aplicar" no Planejamento. O admin cobrava um numero e a fabrica
 * produzia outro, cada tela certa na sua regua.
 *
 * O caso 1 e o que trava isso: o painel e a tela azul tem que devolver o MESMO
 * `precisa`, SKU a SKU. Se alguem escrever uma segunda conta aqui, quebra.
 *
 * Sobe um banco temporario e chama os handlers direto, com um `app` de mentira
 * que so guarda as rotas. Nao abre porta, nao toca no banco de producao.
 */
const Database = require('better-sqlite3');
const fs = require('fs'), os = require('os'), path = require('path');

const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'pcp-estoque-'));
const db = new Database(path.join(tmp, 't.db'));

/* Mesmo CREATE do db.js (skus) e dos donos de cada tabela. Copia consciente:
   o teste tem que subir sem o db.js, que aponta para /opt/expedicao. */
db.exec(`
  CREATE TABLE skus (codigo TEXT PRIMARY KEY, descricao TEXT DEFAULT '', cor TEXT DEFAULT '',
    estoque INTEGER DEFAULT 0, alvo INTEGER DEFAULT 0, criado_em TEXT DEFAULT (datetime('now','localtime')),
    modelo_id INTEGER, largura_cm INTEGER, altura_cm INTEGER,
    cor_codigo TEXT, tecido_codigo TEXT);
  CREATE TABLE montagem (id INTEGER PRIMARY KEY AUTOINCREMENT, codigo TEXT, inicio TEXT, fim TEXT,
    segundos INTEGER, kit_ok INTEGER DEFAULT 1, data TEXT DEFAULT (date('now','localtime')),
    criado_em TEXT DEFAULT (datetime('now','localtime')), teste INTEGER DEFAULT 0);
  CREATE TABLE lote (id INTEGER PRIMARY KEY AUTOINCREMENT, codigo TEXT, estagio TEXT DEFAULT 'pendente',
    embalado_em TEXT, carregado_em TEXT, data TEXT DEFAULT (date('now','localtime')),
    teste INTEGER DEFAULT 0);
  CREATE TABLE ajuste_estoque (id INTEGER PRIMARY KEY AUTOINCREMENT, codigo TEXT, antes INTEGER,
    depois INTEGER, delta INTEGER, motivo TEXT, obs TEXT, usuario_id INTEGER, usuario_nome TEXT,
    criado_em TEXT DEFAULT (datetime('now','localtime')), data TEXT DEFAULT (date('now','localtime')),
    teste INTEGER DEFAULT 0);
  CREATE TABLE auditoria (id INTEGER PRIMARY KEY AUTOINCREMENT, usuario_id INTEGER, usuario_nome TEXT,
    categoria TEXT, acao TEXT, alvo TEXT, detalhe TEXT, ip TEXT,
    criado_em TEXT DEFAULT (datetime('now','localtime')), data TEXT DEFAULT (date('now','localtime')));
`);
require('./sku_schema').garantirSchema(db);   // cor, modelo, tecido

db.prepare("INSERT INTO modelo (id,codigo,nome,exige_medida,sob_medida) VALUES (?,?,?,?,?)")
  .run(1, 'ROLO', 'Rolô', 1, 0);
db.prepare("INSERT INTO modelo (id,codigo,nome,exige_medida,sob_medida) VALUES (?,?,?,?,?)")
  .run(2, 'SOBMED', 'Sob medida', 1, 1);
db.prepare("INSERT INTO modelo (id,codigo,nome,exige_medida,sob_medida) VALUES (?,?,?,?,?)")
  .run(3, 'ACESSORIO', 'Acessório', 0, 0);
db.prepare("INSERT INTO cor (codigo,nome) VALUES ('BEGE','Bege')").run();
db.prepare("INSERT INTO tecido (codigo,nome) VALUES ('BLACKOUT','Blackout')").run();

const sku = db.prepare(`INSERT INTO skus (codigo,descricao,cor,estoque,alvo,modelo_id,
  largura_cm,altura_cm,cor_codigo,tecido_codigo) VALUES (?,?,?,?,?,?,?,?,?,?)`);
/* O SKU que gira: 30 vendas na janela = 1/dia, cobertura 10 dias => alvo 10.
   O alvo GRAVADO e 5, de um "aplicar" antigo — a conta velha diria "repor 3". */
sku.run('BK140140BEGE', 'Cortina Rolo Blackout', 'Bege', 2, 5, 1, 140, 140, 'BEGE', 'BLACKOUT');
/* SOB MEDIDA com alvo legado 6 gravado: a conta velha pedia 6 pecas todo dia,
   para sempre, de uma peca que so existe depois da venda (§7). */
sku.run('SOBMEDIDA', 'Rolô sob medida', '', 0, 6, 2, null, null, null, null);
/* Sob medida COM venda comprometida: essa falta e de verdade e tem que aparecer.
   Nao basta calar a linha de sob medida — isso esconderia trabalho real. */
sku.run('SOBMEDIDA2', 'Rolô sob medida 2', '', 0, 0, 2, null, null, null, null);
/* PARADO: sete pecas na prateleira e nenhuma venda na janela. */
sku.run('BK160160CINZA', 'Cortina Rolo Blackout', 'Cinza', 7, 2, 1, 160, 160, null, null);
/* Acessorio, sem medida (exige_medida = 0). */
sku.run('KIT32', 'Kit 32 mm completo', '', 5, 2, 3, null, null, null, null);

const hoje  = db.prepare("SELECT date('now','localtime') d").get().d;
const ontem = db.prepare("SELECT date('now','localtime','-1 day') d").get().d;

const rotas = {};
const app = {
  get:(p, ...h)=>{ rotas['GET '+p]  = h[h.length-1]; },
  post:(p, ...h)=>{ rotas['POST '+p] = h[h.length-1]; },
  use:()=>{}, locals:{}
};
require('./plan_route')(app, db);    // cria venda_futura, fechamento e config
require('./est_route')(app, db);

// --- vendas: a janela (media) e o comprometido (envio futuro) ---
const vf = db.prepare("INSERT INTO venda_futura (venda_id,codigo,data_venda,data_envio) VALUES (?,?,?,?)");
/* 28 vendas ja despachadas + as 2 comprometidas de baixo = 30 na janela de 30
   dias, media exata de 1/dia. A venda comprometida TAMBEM conta na media: ela
   foi vendida: o comprometido diz que ainda vai sair, nao que nao aconteceu. */
for(let i = 1; i <= 28; i++){
  const d = db.prepare("SELECT date('now','localtime','-'||?||' days') d").get(i).d;
  vf.run('V'+i, 'BK140140BEGE', d, null);
}
// duas ja vendidas com envio marcado pra frente: comprometido = 2
vf.run('F1','BK140140BEGE', hoje, db.prepare("SELECT date('now','localtime','+3 day') d").get().d);
vf.run('F2','BK140140BEGE', hoje, db.prepare("SELECT date('now','localtime','+5 day') d").get().d);
// e duas do sob medida COM envio marcado: falta legitima
vf.run('S1','SOBMEDIDA2', hoje, db.prepare("SELECT date('now','localtime','+2 day') d").get().d);
vf.run('S2','SOBMEDIDA2', hoje, db.prepare("SELECT date('now','localtime','+4 day') d").get().d);

// --- movimento: embalagem (+1) e etiqueta de venda (-1) ---
const mont = db.prepare("INSERT INTO montagem (codigo,segundos,data,teste) VALUES (?,?,?,?)");
mont.run('BK140140BEGE', 60, hoje, 0);
mont.run('BK140140BEGE', 55, hoje, 0);
mont.run('BK140140BEGE', 50, hoje, 1);          // teste: nao conta como producao
mont.run('BK160160CINZA', 70, ontem, 0);
mont.run('BK160160CINZA', 65, ontem, 0);
const lote = db.prepare("INSERT INTO lote (codigo,estagio,embalado_em,data,teste) VALUES (?,?,?,?,?)");
lote.run('BK140140BEGE','embalado', hoje +' 09:10:00', hoje, 0);
lote.run('BK140140BEGE','carregado',hoje +' 11:20:00', hoje, 0);
lote.run('BK140140BEGE','embalado', hoje +' 12:00:00', hoje, 1);   // teste
lote.run('BK160160CINZA','carregado',ontem+' 16:40:00', ontem, 0);

// --- dois ajustes manuais no mesmo SKU: vale o ultimo ---
const aj = db.prepare(`INSERT INTO ajuste_estoque (codigo,antes,depois,delta,motivo,usuario_nome,criado_em)
  VALUES (?,?,?,?,?,?,?)`);
aj.run('BK140140BEGE', 5, 4, -1, 'Correcao de contagem', 'Lucas', ontem+' 08:00:00');
aj.run('BK140140BEGE', 4, 2, -2, 'Peca quebrada',        'Ana',   hoje +' 08:30:00');

db.prepare(`INSERT INTO auditoria (categoria,acao,alvo,detalhe,criado_em)
  VALUES ('estoque','alvo_planejamento','(todos)','aplicados 4',?)`).run(ontem+' 17:00:00');

const chamar = (k, body) => new Promise(r => {
  const res = { json:o=>r(o), status(){ return this; }, send:o=>r(o) };
  rotas[k]({ body:body||{}, query:{}, headers:{} }, res);
});

let falhas = 0, casos = 0;
const ok = (n, c, extra) => { casos++;
  if(c) console.log('ok      ' + n);
  else { falhas++; console.log('FALHOU  ' + n + (extra ? '   ' + extra : '')); } };

(async () => {
  const p = await chamar('GET /api/estoque/painel');
  const por = {}; p.linhas.forEach(l => por[l.codigo] = l);

  // ── 1. A MESMA CONTA DA TELA AZUL ────────────────────────────────────────
  const azul = await chamar('GET /api/revisao/producao');
  const azulPor = {}; azul.forEach(l => azulPor[l.codigo] = l.precisa);
  const divergiu = Object.keys(azulPor).filter(c => !por[c] || por[c].precisa !== azulPor[c]);
  ok('o painel e a tela azul dao o MESMO precisa, SKU a SKU', divergiu.length === 0,
     'divergiram: ' + JSON.stringify(divergiu.map(c => c+' painel='+(por[c]||{}).precisa+' azul='+azulPor[c])));
  ok('e todo SKU que a tela azul pede aparece no painel',
     azul.every(l => !!por[l.codigo]));

  // ── 2. O COMPROMETIDO ENTRA NA CONTA (era o que faltava) ─────────────────
  ok('BK140140BEGE: alvo ao vivo 10 (30 vendas na janela x 10 dias)', por.BK140140BEGE.alvo === 10,
     'veio ' + por.BK140140BEGE.alvo);
  ok('BK140140BEGE: precisa 10 = comprometido 2 + alvo 10 - estoque 2',
     por.BK140140BEGE.precisa === 10 && por.BK140140BEGE.comprometido === 2,
     'precisa=' + por.BK140140BEGE.precisa + ' comprometido=' + por.BK140140BEGE.comprometido);
  ok('a conta velha (alvo salvo 5 - estoque 2 = 3) nao e mais o que a tela mostra',
     por.BK140140BEGE.precisa !== 3);

  // ── 3. O ALVO SALVO E UMA FOTO, E A LINHA DIZ QUANDO ELE ESTA VELHO ──────
  ok('marca o alvo defasado (salvo 5, ao vivo 10)',
     por.BK140140BEGE.alvo_defasado === true && por.BK140140BEGE.alvo_salvo === 5);
  ok('o resumo conta quantos estao defasados', p.resumo.alvo_defasados >= 1,
     'veio ' + p.resumo.alvo_defasados);
  ok('e diz quando o alvo foi aplicado pela ultima vez', !!p.resumo.alvo_aplicado_em);

  // ── 4. SOB MEDIDA NAO E FALTA ETERNA ─────────────────────────────────────
  ok('SOBMEDIDA com alvo legado 6 gravado nao pede producao nenhuma',
     por.SOBMEDIDA.precisa === 0 && por.SOBMEDIDA.alvo === 0,
     'precisa=' + por.SOBMEDIDA.precisa + ' alvo=' + por.SOBMEDIDA.alvo);
  ok('mas sob medida COM venda comprometida continua pedindo as 2',
     por.SOBMEDIDA2.precisa === 2, 'veio ' + por.SOBMEDIDA2.precisa);
  ok('e a linha vai marcada como sob medida, pra tela poder dizer por que',
     por.SOBMEDIDA.sob_medida === 1 && por.BK140140BEGE.sob_medida === 0);

  // ── 5. PARADO E EXCESSO — o grupo que a tela antiga nao mostrava ─────────
  ok('BK160160CINZA: 7 pecas e nenhuma venda na janela = parado',
     por.BK160160CINZA.parado === true && por.BK160160CINZA.situacao === 'excesso',
     'parado=' + por.BK160160CINZA.parado + ' situacao=' + por.BK160160CINZA.situacao);
  ok('sem venda na janela a cobertura e traco, nunca infinito',
     por.BK160160CINZA.cobertura_dias === null);
  ok('quem gira tem cobertura em dias', por.BK140140BEGE.cobertura_dias === 2,
     'veio ' + por.BK140140BEGE.cobertura_dias);
  ok('sob medida nunca conta como parado', por.SOBMEDIDA.parado === false);

  // ── 6. O ULTIMO AJUSTE, QUE NENHUMA TELA LIA ─────────────────────────────
  ok('a linha traz o ultimo ajuste (o de maior id), nao o primeiro',
     por.BK140140BEGE.ultimo_ajuste && por.BK140140BEGE.ultimo_ajuste.motivo === 'Peca quebrada',
     JSON.stringify(por.BK140140BEGE.ultimo_ajuste));
  ok('e o painel lista os ajustes recentes, do mais novo pro mais velho',
     p.ajustes.length === 2 && p.ajustes[0].motivo === 'Peca quebrada');
  ok('conta os ajustes dos ultimos 30 dias', p.resumo.ajustes_30d === 2,
     'veio ' + p.resumo.ajustes_30d);

  // ── 7. A SERIE DO GRAFICO ────────────────────────────────────────────────
  ok('a serie tem 30 dias', p.serie.length === 30, 'veio ' + p.serie.length);
  ok('termina em hoje e comeca 29 dias atras', p.serie[29].data === hoje);
  ok('hoje: entraram 2 (a de teste nao conta) e sairam 2',
     p.serie[29].entrou === 2 && p.serie[29].saiu === 2,
     JSON.stringify(p.serie[29]));
  ok('ontem: entraram 2 e saiu 1', p.serie[28].entrou === 2 && p.serie[28].saiu === 1,
     JSON.stringify(p.serie[28]));
  ok('dia sem movimento entra como ZERO, nao como buraco',
     p.serie[10].entrou === 0 && p.serie[10].saiu === 0 && p.serie[10].data);

  // ── 8. A MESMA REGUA DO FECHAMENTO DIARIO ────────────────────────────────
  const fech = await chamar('GET /api/fechamento');
  ok('o painel e o fechamento contam o mesmo produzido e o mesmo vendido',
     fech.produzido === p.resumo.entrou_hoje && fech.vendido === p.resumo.saiu_hoje,
     'fechamento=' + fech.produzido + '/' + fech.vendido +
     ' painel=' + p.resumo.entrou_hoje + '/' + p.resumo.saiu_hoje);
  ok('e a mesma cobertura media', fech.cobertura_dias === p.resumo.cobertura_dias,
     'fechamento=' + fech.cobertura_dias + ' painel=' + p.resumo.cobertura_dias);

  // ── 9. O RESUMO ──────────────────────────────────────────────────────────
  ok('soma as pecas em estoque (2 + 0 + 0 + 7 + 5)', p.resumo.pecas_estoque === 14,
     'veio ' + p.resumo.pecas_estoque);
  ok('conta os SKUs em falta', p.resumo.skus_falta === 2, 'veio ' + p.resumo.skus_falta);
  ok('soma as pecas a produzir (10 do BEGE + 2 do sob medida)',
     p.resumo.pecas_precisa === 12, 'veio ' + p.resumo.pecas_precisa);
  ok('o semaforo cobre todos os SKUs',
     p.resumo.zerados + p.resumo.baixos + p.resumo.ok + p.resumo.excesso === p.resumo.skus,
     JSON.stringify(p.resumo));
  ok('quem nao tem peca e precisa produzir sai como zerado',
     por.SOBMEDIDA2.situacao === 'zerado' && por.BK140140BEGE.situacao === 'baixo');

  // ── 10. O QUE A PECA E — os campos do pecaTexto vao na linha ─────────────
  ok('a linha carrega as colunas da peca, nao o texto do codigo',
     por.BK140140BEGE.largura_cm === 140 && por.BK140140BEGE.cor_nome === 'Bege' &&
     por.BK140140BEGE.tecido_nome === 'Blackout' && por.BK140140BEGE.modelo_nome === 'Rolô');
  ok('acessorio vai marcado como sem medida (exige_medida 0)',
     por.KIT32.exige_medida === 0);

  console.log('');
  console.log(falhas ? ('FALHARAM ' + falhas + ' de ' + casos)
                     : ('todos os ' + casos + ' casos passaram'));
  try{ fs.rmSync(tmp, {recursive:true, force:true}); }catch(e){}
  process.exit(falhas ? 1 : 0);
})();

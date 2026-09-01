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
  CREATE TABLE producao (id INTEGER PRIMARY KEY AUTOINCREMENT, codigo TEXT, qtd INTEGER,
    produzido INTEGER DEFAULT 0, data TEXT DEFAULT (date('now','localtime')),
    criado_em TEXT DEFAULT (datetime('now','localtime')), origem TEXT DEFAULT 'manual',
    urgente INTEGER DEFAULT 0, teste INTEGER DEFAULT 0);
  CREATE TABLE revisao (id INTEGER PRIMARY KEY AUTOINCREMENT, codigo TEXT, inicio TEXT, fim TEXT,
    segundos INTEGER, data TEXT DEFAULT (date('now','localtime')),
    criado_em TEXT DEFAULT (datetime('now','localtime')), modo TEXT DEFAULT 'hoje',
    teste INTEGER DEFAULT 0);
  CREATE TABLE contagem (id INTEGER PRIMARY KEY AUTOINCREMENT, codigo TEXT,
    contado_em TEXT DEFAULT (datetime('now','localtime')), sessao TEXT, teste INTEGER DEFAULT 0,
    tipo TEXT DEFAULT 'sku', componente_id INTEGER, qtd REAL DEFAULT 1);
  CREATE TABLE auditoria (id INTEGER PRIMARY KEY AUTOINCREMENT, usuario_id INTEGER, usuario_nome TEXT,
    categoria TEXT, acao TEXT, alvo TEXT, detalhe TEXT, ip TEXT,
    criado_em TEXT DEFAULT (datetime('now','localtime')), data TEXT DEFAULT (date('now','localtime')));
`);
require('./sku_schema').garantirSchema(db);              // cor, modelo, tecido
require('./compras_schema').garantirSchemaCompras(db);   // oferta, ficha e as colunas de custo

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

/* CUSTO: dois de revenda com custo direto digitado (o `ficha_dominio` devolve
   esse valor) e o resto sem custo nenhum — que e o estado real de quem ainda
   nao lancou ficha, e o caso que a regra 4 protege. */
const rev=db.prepare("UPDATE skus SET tem_ficha=0, custo_direto=? WHERE codigo=?");
rev.run(87.50,  'BK140140BEGE');    // estoque 2  -> R$ 175,00
rev.run(120.00, 'BK160160CINZA');   // estoque 7, parado -> R$ 840,00
rev.run(45.00,  'SOBMEDIDA');       // estoque 0  -> nao vale nada, e nao e buraco

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
require('./painel_route')(app, db);  // a TV do chao de fabrica
require('./ger_route')(app, db);     // o gerencial

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

/* Inventario: um SKU contado ha 5 dias, um contado no MODO TESTE (nao vale como
   conferencia de saldo real) e o resto nunca contado. */
const cinco=db.prepare("SELECT datetime('now','localtime','-5 days') d").get().d;
const cont=db.prepare("INSERT INTO contagem (codigo,contado_em,sessao,tipo,qtd,teste) VALUES (?,?,?,?,?,?)");
cont.run('BK140140BEGE', db.prepare("SELECT datetime('now','localtime','-9 days') d").get().d,'s0','sku',1,0);
cont.run('BK140140BEGE', cinco, 's1','sku',1,0);
cont.run('BK160160CINZA', cinco, 's1','sku',1,1);          // teste: nao conta
cont.run('TUBO 32MM',    cinco, 's1','componente',12.5,0); // material: outra unidade

const chamar = (k, body, usuario) => new Promise(r => {
  const res = { json:o=>r(o), status(){ return this; }, send:o=>r(o) };
  rotas[k]({ body:body||{}, query:{}, headers:{}, usuario:usuario||undefined }, res);
});
/* Quem pode ver custo. O `est_route` pergunta ao acesso.js; aqui o acesso e de
   mentira e responde pela permissao que o caso quer testar. */
let PERMITE_CUSTO = false;
app.locals.acesso = {
  podePermissao: (u, chave) => chave==='custo.ver' ? (PERMITE_CUSTO && !!u) : !!u,
  auditar: () => {}
};

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
  /* A COBERTURA DA ABA E A DO DOMINIO, SKU A SKU. A aba chegou a ter a sua
     propria conta e ela divergia na primeira casa decimal, porque dividia pela
     media ja arredondada. Uma segunda conta aqui quebra este caso. */
  {
    const dom = {};
    require('./demanda_dominio').calcular(db).linhas
      .forEach(l => { if(l.cadastrado) dom[l.codigo] = l.cobertura; });
    const fora = Object.keys(dom).filter(c => por[c] && por[c].cobertura_dias !== dom[c]);
    ok('a cobertura da aba é a mesma do demanda_dominio, SKU a SKU', fora.length === 0,
       JSON.stringify(fora.map(c => c+' aba='+por[c].cobertura_dias+' dominio='+dom[c])));
  }
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

  // ── 10. INVENTARIO: quando esse saldo foi conferido ──────────────────────
  ok('traz a idade do último inventário do SKU (5 dias, o mais recente)',
     por.BK140140BEGE.contado_ha === 5 && !!por.BK140140BEGE.contado_em,
     'veio ' + por.BK140140BEGE.contado_ha);
  ok('contagem em MODO TESTE não conta como conferência do saldo real',
     por.BK160160CINZA.contado_em === null);
  ok('contagem de MATERIAL não vira conferência de peça',
     !Object.keys(por).some(c => c === 'TUBO 32MM'));
  ok('o resumo conta quantos nunca passaram por contagem', p.resumo.nunca_contados === 4,
     'veio ' + p.resumo.nunca_contados);

  // ── 11. O QUE O BOTAO "APLICAR ALVO" RESOLVE, E O QUE NAO ────────────────
  ok('defasado COM venda na janela é aplicável', por.BK140140BEGE.alvo_aplicavel === true);
  ok('defasado SEM venda na janela não é: o Planejamento não sobrescreve às cegas',
     por.SOBMEDIDA.alvo_defasado === true && por.SOBMEDIDA.alvo_aplicavel === false);
  ok('e o resumo separa os dois números',
     p.resumo.alvo_defasados === 2 && p.resumo.alvo_aplicaveis === 1,
     'defasados=' + p.resumo.alvo_defasados + ' aplicaveis=' + p.resumo.alvo_aplicaveis);

  // ── 12. A MESMA REGUA NAS QUATRO TELAS ───────────────────────────────────
  /* A TV do chao de fabrica e o gerencial liam o `skus.alvo` GRAVADO: a TV
     somava `pedido + alvo - estoque` (quarta regua) e o gerencial listava
     `alvo - estoque` sem o comprometido (quinta). Os dois agora leem o
     demanda_dominio, e estes casos travam isso. */
  const painel = await chamar('GET /api/painel');
  const pPor = {}; painel.linhas.forEach(l => pPor[l.codigo.toUpperCase()] = l);
  ok('a TV do chão de fábrica pede o MESMO precisa da aba e da tela azul',
     Object.keys(azulPor).every(c => pPor[c] && pPor[c].precisa === azulPor[c]),
     JSON.stringify(Object.keys(azulPor).map(c => c+' tv='+(pPor[c]||{}).precisa+' azul='+azulPor[c])));
  ok('e mostra o alvo calculado, não o gravado (BK140140BEGE: 10, salvo 5)',
     pPor.BK140140BEGE.alvo === 10, 'veio ' + pPor.BK140140BEGE.alvo);
  ok('sob medida não pede reposição na TV, como na aba',
     pPor.SOBMEDIDA.precisa === 0 && pPor.SOBMEDIDA.alvo === 0);
  /* "Falta hoje" e outra pergunta: o que sobrou das ordens do dia. Nao se soma
     com `precisa`, e por isso as duas colunas tem nomes proprios. */
  db.prepare("INSERT INTO producao (codigo,qtd,produzido,data) VALUES ('BK140140BEGE',5,2,date('now','localtime'))").run();
  const painel2 = await chamar('GET /api/painel');
  const l2 = painel2.linhas.find(l => l.codigo === 'BK140140BEGE');
  ok('"falta hoje" conta a ordem do dia que ainda não saiu (5 pedidas − 2 feitas)',
     l2.faltaHoje === 3, 'veio ' + l2.faltaHoje);
  ok('e não se mistura com o precisa, que segue o do estoque',
     l2.precisa === 10, 'veio ' + l2.precisa);

  const ger = await chamar('GET /api/gerencial');
  const gPor = {}; (ger.estoque||[]).forEach(x => gPor[x.l] = x);
  ok('o gerencial lista a falta pela mesma conta',
     Object.keys(gPor).every(c => gPor[c].falta === (azulPor[c] || 0)),
     JSON.stringify(ger.estoque));
  ok('e não lista quem não precisa de nada', !gPor.BK160160CINZA && !gPor.KIT32,
     JSON.stringify(Object.keys(gPor)));

  // ── 13. O DINHEIRO PARADO, E QUEM PODE VER ───────────────────────────────
  /* Custo e gateado por `custo.ver`. Quem nao tem a permissao nao recebe os
     campos — nao adianta esconder na tela e mandar pelo fio (regra 14 do §13). */
  const semPerm = await chamar('GET /api/estoque/painel', null, {id:9, nome:'Operador'});
  ok('sem custo.ver, o JSON não traz valor nenhum',
     semPerm.resumo.custo_visivel === false &&
     semPerm.resumo.valor_estoque === undefined &&
     semPerm.linhas.every(l => l.custo_unitario === undefined && l.valor === undefined));

  PERMITE_CUSTO = true;
  const comP = await chamar('GET /api/estoque/painel', null, {id:1, nome:'Dono'});
  const cPor = {}; comP.linhas.forEach(l => cPor[l.codigo] = l);
  ok('com custo.ver, a linha traz custo unitário e valor (2 × 87,50 = 175,00)',
     cPor.BK140140BEGE.custo_unitario === 87.5 && cPor.BK140140BEGE.valor === 175,
     JSON.stringify({c:cPor.BK140140BEGE.custo_unitario, v:cPor.BK140140BEGE.valor}));
  ok('o total soma só quem tem custo (175 + 840)', comP.resumo.valor_estoque === 1015,
     'veio ' + comP.resumo.valor_estoque);
  ok('o valor PARADO é só o do SKU parado (840)', comP.resumo.valor_parado === 840,
     'veio ' + comP.resumo.valor_parado);
  /* Regra 4 do §7-B: custo indefinido nunca vira zero. O KIT32 tem 5 peças e
     nenhuma ficha; ele NÃO entra na soma como zero — sai contado à parte, e é
     isso que faz do total um piso em vez de uma mentira barata. */
  ok('SKU com peça e sem custo não vira zero: conta em sem_custo',
     comP.resumo.sem_custo === 1 && cPor.KIT32.valor === null && cPor.KIT32.estoque === 5,
     'sem_custo=' + comP.resumo.sem_custo + ' valor KIT32=' + cPor.KIT32.valor);
  ok('SKU zerado sem custo não conta como buraco — não há o que valorizar',
     cPor.SOBMEDIDA2.estoque === 0 && comP.resumo.sem_custo === 1);
  ok('e o número se chama "custo de material" enquanto a mão de obra for zero',
     comP.resumo.custo_rotulo === 'custo de material');

  // ── 14. O QUE A PECA E — os campos do pecaTexto vao na linha ─────────────
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

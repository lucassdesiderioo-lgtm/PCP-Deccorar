#!/usr/bin/env node
/* Testes da aba "Corte e separação" (spec PLANEJAMENTO-CORTE-E-SEPARACAO).
 *
 *   node teste_corte_separacao.js
 *
 * A aba transforma a FALTA da "O que produzir" (o `precisa` do
 * demanda_dominio, a mesma conta da tela azul) em lista de material, pelas
 * linhas da ficha tecnica marcadas "vai para o planejamento da producao".
 * Uma regra so de agrupar: o MATERIAL e a MEDIDA DE CORTE. Dela sai o que o
 * dono pediu em 10/11/2026: o tecido separado por cor, o tubo, a base e a
 * corrente com as cores juntas, e o kit de instalacao somando todas.
 *
 * Sobe um banco temporario. Nao abre porta, nao toca no banco de producao.
 */
const Database = require('better-sqlite3');
const fs = require('fs'), os = require('os'), path = require('path');

let ok = 0, falha = 0;
function caso(nome, fn){
  try{ fn(); ok++; console.log('ok      ' + nome); }
  catch(e){ falha++; console.log('FALHOU  ' + nome + '\n        ' + (e && e.message || e)); }
}
function igual(a, b, msg){
  if(JSON.stringify(a) !== JSON.stringify(b))
    throw new Error((msg ? msg + ': ' : '') + 'esperado ' + JSON.stringify(b) + ', veio ' + JSON.stringify(a));
}
function verdade(v, msg){ if(!v) throw new Error(msg || 'esperado verdadeiro'); }

const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'pcp-corte-'));
const db = new Database(path.join(tmp, 't.db'));
db.exec(`
  CREATE TABLE skus (codigo TEXT PRIMARY KEY, descricao TEXT DEFAULT '', cor TEXT DEFAULT '',
    estoque INTEGER DEFAULT 0, alvo INTEGER DEFAULT 0,
    modelo_id INTEGER, largura_cm INTEGER, altura_cm INTEGER,
    cor_codigo TEXT, tecido_codigo TEXT);
  CREATE TABLE auditoria (id INTEGER PRIMARY KEY AUTOINCREMENT, usuario_id INTEGER, usuario_nome TEXT,
    categoria TEXT, acao TEXT, alvo TEXT, detalhe TEXT, ip TEXT,
    criado_em TEXT DEFAULT (datetime('now','localtime')), data TEXT DEFAULT (date('now','localtime')));
`);
require('./sku_schema').garantirSchema(db);
require('./compras_schema').garantirSchemaCompras(db);

const FICHA = require('./ficha_dominio');
const CORTE = require('./corte_dominio');

/* ── O CATALOGO DO EXEMPLO DO DONO ─────────────────────────────────────────
   150x150 em branco, cinza e bege; uma 120x160 bege; um kit (sem medida); um
   sob medida. */
db.prepare("INSERT INTO modelo (id,codigo,nome,exige_medida,sob_medida) VALUES (1,'ROLO','Rolô',1,0)").run();
db.prepare("INSERT INTO modelo (id,codigo,nome,exige_medida,sob_medida) VALUES (2,'ACESSORIO','Acessório',0,0)").run();
db.prepare("INSERT INTO modelo (id,codigo,nome,exige_medida,sob_medida) VALUES (3,'SOBMEDIDA','Sob medida',0,1)").run();
for(const c of ['BRANCO','CINZA','BEGE']) db.prepare("INSERT INTO cor (codigo,nome) VALUES (?,?)").run(c, c);
db.prepare("INSERT INTO tecido (codigo,nome) VALUES ('BLACKOUT','Blackout')").run();

const sku = db.prepare(`INSERT INTO skus (codigo,modelo_id,largura_cm,altura_cm,cor_codigo,tecido_codigo,tem_ficha)
  VALUES (?,?,?,?,?,'BLACKOUT',1)`);
sku.run('BK150150BRANCO', 1, 150, 150, 'BRANCO');
sku.run('BK150150CINZA',  1, 150, 150, 'CINZA');
sku.run('BK150150BEGE',   1, 150, 150, 'BEGE');
sku.run('BK120160BEGE',   1, 120, 160, 'BEGE');
sku.run('KIT32',          2, null, null, null);
sku.run('SOBMEDIDA',      3, null, null, null);

const comp = db.prepare(`INSERT INTO componente (nome,unidade,familia,cor,largura_bobina_cm,ativo,vai_ficha)
  VALUES (?,?,?,?,?,1,1)`);
const TUBO  = comp.run('Tubo 32 mm', 'm', null, null, null).lastInsertRowid;
const BASE  = comp.run('Base redonda branca', 'm', null, null, null).lastInsertRowid;
const CORR  = comp.run('Corrente bola 10 branca', 'm', null, null, null).lastInsertRowid;
const KIT   = comp.run('Kit de instalação', 'un', null, null, null).lastInsertRowid;
const PARAF = comp.run('Parafuso 4x40', 'un', null, null, null).lastInsertRowid;
const TBRANCO = comp.run('Blackout branco 2,80', 'm', 'BLACKOUT', 'BRANCO', 280).lastInsertRowid;
const TCINZA  = comp.run('Blackout cinza 2,80',  'm', 'BLACKOUT', 'CINZA',  280).lastInsertRowid;
const TBEGE   = comp.run('Blackout bege 2,80',   'm', 'BLACKOUT', 'BEGE',   280).lastInsertRowid;

/* Preço em quase tudo: a escolha da bobina e por custo. O tecido CINZA fica
   SEM preço de proposito — a falta de preço nao pode tirar a linha da lista
   da bancada ("Falta de PRECO nao pode apagar a medida de CORTE"). */
const forn = db.prepare("INSERT INTO fornecedor (nome,ativo) VALUES ('F',1)").run().lastInsertRowid;
const of = db.prepare(`INSERT INTO oferta (componente_id,fornecedor_id,embalagem,preco,fator,ativo) VALUES (?,?,'un',?,1,1)`);
for(const [c,p] of [[TUBO,10],[BASE,8],[CORR,2],[KIT,5],[PARAF,0.1],[TBRANCO,30],[TBEGE,30]]) of.run(c, forn, p);

const linha = db.prepare(`INSERT INTO ficha_formula (modelo_id,componente_id,familia,expressao,ordem,
  corte_largura,corte_altura,planejamento) VALUES (1,?,?,?,?,?,?,?)`);
const F_TEC  = linha.run(null, 'BLACKOUT', '(altura + 20) / 200', 1, 'largura - 3', 'altura + 15', 1).lastInsertRowid;
const F_TUBO = linha.run(TUBO, null, 'largura / 100', 2, 'largura - 3', null, 1).lastInsertRowid;
const F_BASE = linha.run(BASE, null, 'largura / 100', 3, 'largura - 3', null, 1).lastInsertRowid;
const F_CORR = linha.run(CORR, null, '(2 * altura - 20) / 100', 4, null, 'altura - 10', 1).lastInsertRowid;
const F_KIT  = linha.run(KIT,  null, '1', 5, null, null, 1).lastInsertRowid;
linha.run(PARAF, null, '4', 6, null, null, 0);   // NAO marcada: fica de fora

/* A falta do exemplo do dono: 30 · 21 · 11 de 150x150, e 4 de 120x160. */
const FALTA = [
  { codigo:'BK150150BRANCO', cadastrado:true, precisa:30 },
  { codigo:'BK150150CINZA',  cadastrado:true, precisa:21 },
  { codigo:'BK150150BEGE',   cadastrado:true, precisa:11 },
  { codigo:'BK120160BEGE',   cadastrado:true, precisa:4 },
  { codigo:'KIT32',          cadastrado:true, precisa:9 },
  { codigo:'SOBMEDIDA',      cadastrado:true, precisa:2 }
];

const custoAntes = FALTA.slice(0,4).map(f => FICHA.calcularFicha(db, f.codigo).custo_material);
const r = CORTE.lista(db, FALTA);
const bloco = mat => r.blocos.find(b => b.material === mat);
const linhaDe = (mat, txt) => { const b = bloco(mat); return b && b.linhas.find(l => (l.corte||'') === txt); };

caso('a coluna planejamento existe e nasce desmarcada', () => {
  const c = db.prepare("SELECT dflt_value FROM pragma_table_info('ficha_formula') WHERE name='planejamento'").get();
  verdade(c, 'coluna planejamento na ficha_formula');
  const id = db.prepare("INSERT INTO ficha_formula (modelo_id,componente_id,expressao) VALUES (1,?, '1')").run(PARAF).lastInsertRowid;
  igual(db.prepare('SELECT planejamento FROM ficha_formula WHERE id=?').get(id).planejamento, 0);
  db.prepare('DELETE FROM ficha_formula WHERE id=?').run(id);
});

caso('as persianas contadas são só as do ML com medida (30+21+11+4 = 66)', () => {
  igual(r.persianas, 66);
});

caso('o tecido sai separado por COR, na medida de corte (largura−3 × altura+15)', () => {
  const tec = r.blocos.find(b => b.tecido);
  verdade(tec, 'bloco do tecido');
  const l = (nome) => tec.linhas.find(x => x.material === nome && x.corte === '147 × 165 cm');
  igual(l('Blackout branco 2,80').qtd, 30, 'branco');
  igual(l('Blackout bege 2,80').qtd, 11, 'bege 150');
  verdade(tec.linhas.find(x => x.material === 'Blackout bege 2,80' && x.corte === '117 × 175 cm' && x.qtd === 4), 'bege 120x160');
});

caso('o tecido SEM PREÇO continua na lista (a cor e a medida de corte), marcado', () => {
  const tec = r.blocos.find(b => b.tecido);
  const cz = tec.linhas.find(x => /cinza/i.test(x.material));
  verdade(cz, 'linha do cinza');
  igual(cz.qtd, 21); igual(cz.corte, '147 × 165 cm');
  verdade(cz.aviso, 'aviso de bobina não escolhida');
});

caso('o TUBO junta todas as cores pela medida (62 de 147, 4 de 117)', () => {
  igual(linhaDe('Tubo 32 mm', '147 cm').qtd, 62);
  igual(linhaDe('Tubo 32 mm', '117 cm').qtd, 4);
});

caso('a BASE junta todas as cores, em linha própria', () => {
  igual(linhaDe('Base redonda branca', '147 cm').qtd, 62);
  igual(linhaDe('Base redonda branca', '117 cm').qtd, 4);
});

caso('a CORRENTE (kit de comando) junta pela medida: altura−10', () => {
  igual(linhaDe('Corrente bola 10 branca', '140 cm').qtd, 62);
  igual(linhaDe('Corrente bola 10 branca', '150 cm').qtd, 4);
});

caso('o KIT DE INSTALAÇÃO (sem medida de corte) soma todas: 66', () => {
  const b = bloco('Kit de instalação');
  igual(b.linhas.length, 1); igual(b.linhas[0].qtd, 66); igual(b.linhas[0].corte, null);
});

caso('linha NÃO marcada fica de fora da lista', () => {
  verdade(!bloco('Parafuso 4x40'), 'parafuso não podia aparecer');
});

caso('cada linha diz de quais SKUs veio', () => {
  const l = linhaDe('Tubo 32 mm', '147 cm');
  igual(l.skus.map(s => s.codigo + ':' + s.qtd).sort(), ['BK150150BEGE:11','BK150150BRANCO:30','BK150150CINZA:21']);
});

caso('sob medida e kit ficam FORA, ditos com o motivo', () => {
  const f = c => r.fora.find(x => x.codigo === c);
  verdade(f('SOBMEDIDA') && /sob medida/i.test(f('SOBMEDIDA').motivo), 'sob medida');
  verdade(f('KIT32') && /medida/i.test(f('KIT32').motivo), 'kit');
});

caso('os blocos seguem a ordem da ficha', () => {
  igual(r.blocos.map(b => b.tecido ? 'tecido' : b.material),
    ['tecido','Tubo 32 mm','Base redonda branca','Corrente bola 10 branca','Kit de instalação']);
});

caso('nenhum número em reais sai da lista', () => {
  const chaves = new Set();
  (function varre(o){ if(o && typeof o === 'object') for(const k of Object.keys(o)){ chaves.add(k); varre(o[k]); } })(r);
  const ruins = [...chaves].filter(k => /custo|preco|brl|valor|opcoes/i.test(k));
  igual(ruins, [], 'chave de dinheiro na resposta');
});

caso('o custo da ficha não mudou um centavo (#18)', () => {
  igual(FALTA.slice(0,4).map(f => FICHA.calcularFicha(db, f.codigo).custo_material), custoAntes);
});

caso('a medida de corte não mexe no custo: mudar a folga não muda centavo', () => {
  db.prepare("UPDATE ficha_formula SET corte_altura='altura + 99' WHERE id=?").run(F_TEC);
  igual(FICHA.calcularFicha(db, 'BK150150BRANCO').custo_material, custoAntes[0]);
  db.prepare("UPDATE ficha_formula SET corte_altura='altura + 15' WHERE id=?").run(F_TEC);
});

caso('SKU cuja ficha não tem linha marcada fica fora, dito', () => {
  db.prepare("UPDATE ficha_formula SET planejamento=0 WHERE modelo_id=1").run();
  const r2 = CORTE.lista(db, FALTA);
  igual(r2.blocos.length, 0);
  verdade(r2.sem_marcadas, 'avisa que nenhuma linha da ficha está marcada');
  verdade(r2.fora.find(x => x.codigo === 'BK150150BRANCO'), 'o SKU aparece em fora');
  db.prepare("UPDATE ficha_formula SET planejamento=1 WHERE id IN (?,?,?,?,?)").run(F_TEC,F_TUBO,F_BASE,F_CORR,F_KIT);
});

caso('linha marcada que pede medida de corte e não tem: aparece, com aviso', () => {
  db.prepare("UPDATE ficha_formula SET corte_largura=NULL WHERE id=?").run(F_TUBO);
  const r2 = CORTE.lista(db, FALTA);
  const b = r2.blocos.find(x => x.material === 'Tubo 32 mm');
  igual(b.linhas.length, 1);
  igual(b.linhas[0].qtd, 97.8, 'soma o consumo: 62 × 1,50 m + 4 × 1,20 m');
  igual(b.linhas[0].unidade, 'm');
  verdade(b.sem_corte, 'o bloco diz "sem medida de corte"');
  db.prepare("UPDATE ficha_formula SET corte_largura='largura - 3' WHERE id=?").run(F_TUBO);
});

caso('sem lista passada, a aba lê a falta do demanda_dominio.aProduzir (#12)', () => {
  const D = require('./demanda_dominio');
  const orig = D.aProduzir; let chamou = false;
  D.aProduzir = () => { chamou = true; return FALTA; };
  try{ igual(CORTE.lista(db).persianas, 66); } finally { D.aProduzir = orig; }
  verdade(chamou, 'chamou o aProduzir');
});

caso('o corte_dominio não tem SQL de quantidade própria (não lê venda nem saldo)', () => {
  const src = fs.readFileSync(path.join(__dirname, 'corte_dominio.js'), 'utf8');
  verdade(!/venda_futura|FROM\s+lote|estoque/i.test(src.replace(/\/\*[\s\S]*?\*\/|\/\/.*$/gm, '')),
    'corte_dominio lê venda ou saldo por conta própria');
});

caso('a folga do dono numa expressão só: +15, e +10 na 1,80 (10/11/2026)', () => {
  const EXPR = 'altura + 15 - 5 * piso(largura / 180)';
  db.prepare("INSERT INTO skus (codigo,modelo_id,largura_cm,altura_cm,cor_codigo,tecido_codigo,tem_ficha) VALUES ('BK180150BEGE',1,180,150,'BEGE','BLACKOUT',1)").run();
  db.prepare('UPDATE ficha_formula SET corte_altura=? WHERE id=?').run(EXPR, F_TEC);
  try{
    const r2 = CORTE.lista(db, [{ codigo:'BK150150BEGE', precisa:3 }, { codigo:'BK180150BEGE', precisa:2 }]);
    const tec = r2.blocos.find(b => b.tecido);
    igual(tec.linhas.map(l => l.corte + '=' + l.qtd), ['147 × 165 cm=3', '177 × 160 cm=2']);
  } finally {
    db.prepare("UPDATE ficha_formula SET corte_altura='altura + 15' WHERE id=?").run(F_TEC);
    db.prepare("DELETE FROM skus WHERE codigo='BK180150BEGE'").run();
  }
});

/* ── ③ REVISÃO (10/11/2026): os cinco achados confirmados ───────────────── */
caso('R2: tecido sem preço E sem medida de corte não vira zero — fica indefinido', () => {
  db.prepare("UPDATE ficha_formula SET corte_largura=NULL, corte_altura=NULL WHERE id=?").run(F_TEC);
  try{
    const r2 = CORTE.lista(db, [{ codigo:'BK150150CINZA', precisa:3 }]);
    const l = r2.blocos.find(b => b.tecido).linhas[0];
    igual(l.qtd, null, 'quantidade indefinida, nunca 0');
    verdade(l.indefinido, 'marcada como indefinida');
    verdade(l.skus.every(k => k.qtd !== 0), 'nenhum SKU com 0');
  } finally {
    db.prepare("UPDATE ficha_formula SET corte_largura='largura - 3', corte_altura='altura + 15' WHERE id=?").run(F_TEC);
  }
});

caso('R3: o mesmo material em dois modelos soma num bloco só', () => {
  db.prepare("INSERT INTO modelo (id,codigo,nome,exige_medida,sob_medida) VALUES (9,'ROMANA','Romana',1,0)").run();
  db.prepare("INSERT INTO skus (codigo,modelo_id,largura_cm,altura_cm,cor_codigo,tecido_codigo,tem_ficha) VALUES ('RM150150BEGE',9,150,150,'BEGE','BLACKOUT',1)").run();
  const id = db.prepare("INSERT INTO ficha_formula (modelo_id,componente_id,expressao,ordem,corte_largura,planejamento) VALUES (9,?, 'largura / 100', 9, 'largura - 3', 1)").run(TUBO).lastInsertRowid;
  try{
    const r2 = CORTE.lista(db, [{ codigo:'BK150150BEGE', precisa:5 }, { codigo:'RM150150BEGE', precisa:2 }]);
    const tubos = r2.blocos.filter(b => b.material === 'Tubo 32 mm');
    igual(tubos.length, 1, 'um bloco só de tubo');
    igual(tubos[0].linhas.find(l => l.corte === '147 cm').qtd, 7);
    /* 2ª rodada: a ordem do bloco é a da ficha, e não a de quem chegou primeiro. */
    const r3 = CORTE.lista(db, [{ codigo:'RM150150BEGE', precisa:2 }, { codigo:'BK150150BEGE', precisa:5 }]);
    igual(r3.blocos.map(b => b.tecido ? 'tecido' : b.material), r2.blocos.map(b => b.tecido ? 'tecido' : b.material),
      'a ordem dos blocos não depende da ordem da falta');
  } finally {
    db.prepare('DELETE FROM ficha_formula WHERE id=?').run(id);
    db.prepare("DELETE FROM skus WHERE codigo='RM150150BEGE'").run();
    db.prepare('DELETE FROM modelo WHERE id=9').run();
  }
});

caso('R4: SKU com linha marcada em erro fica fora INTEIRO, uma vez, e não conta', () => {
  db.prepare("INSERT INTO cor (codigo,nome) VALUES ('VERDE','VERDE')").run();
  db.prepare("INSERT INTO skus (codigo,modelo_id,largura_cm,altura_cm,cor_codigo,tecido_codigo,tem_ficha) VALUES ('BK150150VERDE',1,150,150,'VERDE','BLACKOUT',1)").run();
  try{
    const r2 = CORTE.lista(db, [{ codigo:'BK150150BEGE', precisa:5 }, { codigo:'BK150150VERDE', precisa:4 }]);
    igual(r2.persianas, 5, 'o verde não conta');
    const naLista = JSON.stringify(r2.blocos).indexOf('BK150150VERDE') >= 0;
    verdade(!naLista, 'o verde não pode estar dentro da lista');
    igual(r2.fora.filter(f => f.codigo === 'BK150150VERDE').length, 1, 'uma vez só em fora');
  } finally {
    db.prepare("DELETE FROM skus WHERE codigo='BK150150VERDE'").run();
  }
});

caso('R1: a folha de impressão só vale ao apertar o Imprimir da aba (classe no body)', () => {
  const h = fs.readFileSync(path.join(__dirname, 'public/planejamento.html'), 'utf8');
  const pr = h.slice(h.indexOf('@media print'), h.indexOf('@media print') + 900);
  verdade(!/^\s*\.aba\{display:none/m.test(pr), 'a regra de impressão não pode valer sem condição');
  verdade(/body\.imprimirCorte/.test(pr), 'regra presa à classe body.imprimirCorte');
  verdade(/classList\.add\('imprimirCorte'\)/.test(h) && /afterprint/.test(h), 'o botão põe a classe e o afterprint tira');
});

caso('R5: o redesenho de 60 s devolve os "de quais SKUs" que estavam abertos', () => {
  const h = fs.readFileSync(path.join(__dirname, 'public/planejamento.html'), 'utf8');
  const fn = h.slice(h.indexOf('async function corte()'), h.indexOf("document.getElementById('ctImprimir')"));
  verdade(/details\[open\]/.test(fn) && /data-k=/.test(fn), 'guarda os abertos (data-k) e reabre');
});

/* ── A ROTA DA FICHA GRAVA A CAIXINHA, E AUSENTE NÃO APAGA ───────────────── */
function rotaFicha(){
  const rotas = {};
  const app = { get(){}, delete(){}, use(){},
    post(p, ...h){ rotas[p] = h[h.length-1]; } };
  require('./ficha_route')(app, db);
  return rotas['/api/formulas'];
}
function chamar(h, body){
  let st = 200, out = null;
  const res = { status(s){ st = s; return this; }, json(j){ out = j; return this; } };
  h({ body, usuario:{ id:1, nome:'Teste' }, params:{}, query:{} }, res);
  return { st, out };
}
caso('POST /api/formulas grava "vai para o planejamento"', () => {
  const h = rotaFicha();
  const r1 = chamar(h, { id:F_KIT, modelo_id:1, componente_id:KIT, expressao:'1', planejamento:0 });
  igual(r1.st, 200, JSON.stringify(r1.out));
  igual(db.prepare('SELECT planejamento FROM ficha_formula WHERE id=?').get(F_KIT).planejamento, 0);
  chamar(h, { id:F_KIT, modelo_id:1, componente_id:KIT, expressao:'1', planejamento:true });
  igual(db.prepare('SELECT planejamento FROM ficha_formula WHERE id=?').get(F_KIT).planejamento, 1);
});
caso('POST /api/formulas sem o campo NÃO apaga a marca (ausente não é vazio)', () => {
  const h = rotaFicha();
  chamar(h, { id:F_KIT, modelo_id:1, componente_id:KIT, expressao:'1' });
  igual(db.prepare('SELECT planejamento FROM ficha_formula WHERE id=?').get(F_KIT).planejamento, 1);
});
caso('POST /api/formulas recusa valor impossível na caixinha (400)', () => {
  const h = rotaFicha();
  const r1 = chamar(h, { id:F_KIT, modelo_id:1, componente_id:KIT, expressao:'1', planejamento:'talvez' });
  igual(r1.st, 400);
  igual(db.prepare('SELECT planejamento FROM ficha_formula WHERE id=?').get(F_KIT).planejamento, 1);
});
caso('linha nova sem o campo nasce desmarcada', () => {
  const h = rotaFicha();
  const r1 = chamar(h, { modelo_id:1, componente_id:PARAF, expressao:'2' });
  igual(db.prepare('SELECT planejamento FROM ficha_formula WHERE id=?').get(r1.out.id).planejamento, 0);
  db.prepare('DELETE FROM ficha_formula WHERE id=?').run(r1.out.id);
});

caso('a rota da aba existe, é só leitura e cai em @admin', () => {
  const src = fs.readFileSync(path.join(__dirname, 'plan_route.js'), 'utf8');
  verdade(/app\.get\('\/api\/planejamento\/corte'/.test(src), 'GET /api/planejamento/corte no plan_route');
  const ac = fs.readFileSync(path.join(__dirname, 'acesso.js'), 'utf8');
  verdade(/pre\('\/api\/planejamento'\)[^\n]*return '@admin'/.test(ac), "a leitura de /api/planejamento é @admin (teste_cobertura confere a rota)");
});

caso('a aba "Corte e separação" está na 401, com hash #corte', () => {
  const h = fs.readFileSync(path.join(__dirname, 'public/planejamento.html'), 'utf8');
  verdade(/data-t="corte"/.test(h), 'botão da aba');
  verdade(/corte:\{sec:'secCorte'/.test(h), 'aba registrada em ABAS');
  verdade(/\/api\/planejamento\/corte/.test(h), 'a aba chama a rota');
});

caso('a tela 404 tem a caixinha "Vai para o planejamento da produção"', () => {
  const h = fs.readFileSync(path.join(__dirname, 'public/index.html'), 'utf8');
  verdade(/id="edPlan"/.test(h), 'checkbox edPlan no editor');
  verdade(/planejamento:\s*\$\('#edPlan'\)\.checked/.test(h), 'salvarEditor manda a caixinha');
});

console.log('\n' + ok + ' ok, ' + falha + ' falha(s)');
try{ db.close(); fs.rmSync(tmp, { recursive:true, force:true }); }catch(e){}
process.exit(falha ? 1 : 0);

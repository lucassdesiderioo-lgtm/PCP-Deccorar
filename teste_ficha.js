#!/usr/bin/env node
/* Testes da ficha tecnica — a formula, o custo e a MEDIDA DE CORTE.
 *
 *   node teste_ficha.js
 *
 * O QUE ORIGINOU ESTES TESTES (04/09/2026):
 *
 * 1) O `(altura + 20) / 200` do tecido. O `/200` e um DOIS FIXO escrito dentro
 *    da formula: ele afirma que cabem duas pecas por faixa em qualquer bobina,
 *    de qualquer largura. Com as bobinas reais (2,80 e 3,20) isso e verdade na
 *    1,40 e na 1,60 — e falso nas duas pontas: a de 1,00 cabe TRES na 3,20 e a
 *    de 1,80 cabe UMA SO. A persiana de 1,80 custava metade do que custa.
 *
 *    Pior que o numero: o `/200` CURTO-CIRCUITA a maquina que ja existe. O
 *    ficha_dominio avalia a formula uma vez por bobina candidata e fica com a
 *    de menor custo por peca — desenhado exatamente para o corte invertido. Com
 *    um `2` fixo as duas bobinas dao o mesmo consumo, e a escolha desempata por
 *    preco por metro linear, que e o criterio errado (§7-B).
 *
 * 2) As tres medidas de teste do formula.js eram fixas, e a ultima (3,00 m) nao
 *    cabe em bobina nenhuma. A formula honesta do tecido, escrita com
 *    piso(largura_bobina / largura), dava DIVISAO POR ZERO ali e era recusada na
 *    tela. Trava que dispara no caso normal vira desvio (§7, armadilha #6): o
 *    desvio aqui era escrever o `2` fixo para conseguir salvar.
 *
 * 3) A medida de CORTE nao existia. Tubo, base redonda e tecido tem DOIS
 *    numeros na ficha — o que a peca CONSOME (vira custo e compra) e o que a
 *    bancada CORTA. Os dois nunca se reconciliam: o tubo de uma persiana de
 *    1,60 consome 1,60 m da barra e e cortado a 1,57, porque o resto entra nas
 *    ponteiras. Precificar pela medida de corte para de pagar por esses 3 cm.
 *    Ate aqui o segundo numero morava na cabeca de quem corta, que e a mesma
 *    doenca do SOBMEDIDA (§7).
 *
 * Sobe um banco temporario. Nao abre porta, nao toca no banco de producao.
 */
const Database = require('better-sqlite3');
const fs = require('fs'), os = require('os'), path = require('path');
const F = require('./formula');

const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'pcp-ficha-'));
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

/* ── O CATALOGO REAL, em miniatura ──────────────────────────────────────────
   As larguras que a fabrica tem hoje (04/09/2026): 1,00 · 1,20 · 1,30 · 1,40 ·
   1,50 · 1,60 (sete SKUs) · 1,80 (tres). E as bobinas de blackout que ele
   compra: 2,80 e 3,20. */
db.prepare("INSERT INTO modelo (id,codigo,nome,exige_medida,sob_medida) VALUES (1,'ROLO','Rolô',1,0)").run();
db.prepare("INSERT INTO cor (codigo,nome) VALUES ('BEGE','Bege')").run();
db.prepare("INSERT INTO tecido (codigo,nome) VALUES ('BLACKOUT','Blackout')").run();

const sku = db.prepare(`INSERT INTO skus (codigo,modelo_id,largura_cm,altura_cm,cor_codigo,tecido_codigo)
  VALUES (?,1,?,?, 'BEGE','BLACKOUT')`);
const LARGURAS = [100,120,130,140,150,160,180];
LARGURAS.forEach(l => sku.run('BK'+l+'150BEGE', l, 150));

const comp = db.prepare(`INSERT INTO componente (nome,unidade,familia,cor,largura_bobina_cm,ativo)
  VALUES (?,?,?,?,?,1)`);
const TUBO = comp.run('Tubo 32 mm', 'm', null, null, null).lastInsertRowid;
const B280 = comp.run('Blackout bege bobina 2,80', 'm', 'BLACKOUT', 'BEGE', 280).lastInsertRowid;
const B320 = comp.run('Blackout bege bobina 3,20', 'm', 'BLACKOUT', 'BEGE', 320).lastInsertRowid;

const forn = db.prepare("INSERT INTO fornecedor (nome,ativo) VALUES ('Fornecedor',1)").run().lastInsertRowid;
/* A EMBALAGEM MORA NA OFERTA, nao no componente: o mesmo tubo e barra de 6 m
   num fornecedor e de 3 m no outro (§7-B). */
const of = db.prepare(`INSERT INTO oferta (componente_id,fornecedor_id,embalagem,preco,fator,ativo)
  VALUES (?,?,?,?,?,1)`);
of.run(TUBO, forn, 'barra 6 m', 60, 6);      // R$ 10,00 / m
/* A bobina mais LARGA e mais cara por metro linear — e e ela que sai mais
   barata por peca quando cabem mais pecas lado a lado. E o caso que a escolha
   por menor preco linear erra. */
of.run(B280, forn, 'm linear', 100, 1);      // R$ 100,00 / m linear
of.run(B320, forn, 'm linear', 112, 1);      // R$ 112,00 / m linear

const formula = db.prepare(`INSERT INTO ficha_formula
  (modelo_id,componente_id,familia,expressao,observacao,ordem,corte_largura,corte_altura,corte_unidade)
  VALUES (1,?,?,?,?,?,?,?,?)`);

let falhas = 0, casos = 0;
const ok = (n, c, extra) => { casos++;
  if(c) console.log('ok      ' + n);
  else { falhas++; console.log('FALHOU  ' + n + (extra ? '   ' + extra : '')); } };
const perto = (a, b, t) => a != null && Math.abs(a - b) < (t || 0.001);

/* ═══ 1. A FORMULA DO TECIDO ══════════════════════════════════════════════ */
console.log('\n── a fórmula do tecido ' + '─'.repeat(46));

const ENCAIXE = '(altura + 20) * largura / largura_bobina / 100';
const SOZINHA = '(altura + 20) / 100 / piso(largura_bobina / largura)';
const VELHA   = '(altura + 20) / 200';

const quanto = (expr, largura, bobina) =>
  F.avaliar(expr, { largura, altura:150, largura_bobina:bobina });

/* 1,70 m de bobina (1,50 de altura + 20 de folga), repartidos por area:
   1,80 / 3,20 x 1,70 = 0,95625   e   1,40 / 3,20 x 1,70 = 0,74375
   As duas somadas dao 1,70 exatos — que e a faixa inteira, sem sobra. */
ok('o encaixe reparte a faixa: 1,80 + 1,40 na bobina de 3,20 fecham 1,70 m',
   perto(quanto(ENCAIXE,180,320) + quanto(ENCAIXE,140,320), 1.70),
   'deu ' + (quanto(ENCAIXE,180,320) + quanto(ENCAIXE,140,320)));

ok('a peça de 1,80 encaixada paga 0,956 m', perto(quanto(ENCAIXE,180,320), 0.95625));
ok('e cortada sozinha paga os 1,70 m inteiros da faixa', perto(quanto(SOZINHA,180,320), 1.70));

/* ⚠️ O NUMERO QUE JUSTIFICA A PRATICA DELE. A diferenca entre as duas pontas e
   o valor de mesclar 1,80 com 1,40 na mesma bobina — 78%, e hoje ninguem mede. */
ok('a diferença entre as duas pontas na 1,80 passa de 75%',
   quanto(SOZINHA,180,320) / quanto(ENCAIXE,180,320) > 1.75,
   'razão ' + (quanto(SOZINHA,180,320) / quanto(ENCAIXE,180,320)).toFixed(2));

/* Onde a peca divide a bobina exatamente, as duas pontas COINCIDEM: nao ha
   sobra para repartir. 1,40 x 2 = 2,80 e 1,60 x 2 = 3,20. */
ok('onde o corte fecha exato as duas contas dão o mesmo (1,40 na 2,80)',
   perto(quanto(ENCAIXE,140,280), quanto(SOZINHA,140,280)));
ok('idem 1,60 na bobina de 3,20', perto(quanto(ENCAIXE,160,320), quanto(SOZINHA,160,320)));

/* ⚠️ ONDE O `/200` MENTE. Ele afirma DUAS pecas por faixa sempre. */
console.log('\n── onde o /200 mente ' + '─'.repeat(48));
const cabe = (largura, bobina) => Math.floor(bobina / largura);

ok('o /200 dá o mesmo número nas duas bobinas — a assinatura de quem ignora a bobina',
   quanto(VELHA,180,280) === quanto(VELHA,180,320));

ok('1,80 não cabe duas vezes em bobina nenhuma (nem 2,80, nem 3,20)',
   cabe(180,280) === 1 && cabe(180,320) === 1);
ok('e por isso o /200 cobra METADE do que a peça de 1,80 sozinha consome',
   perto(quanto(VELHA,180,320) * 2, quanto(SOZINHA,180,320)));

ok('1,00 cabe TRÊS vezes na bobina de 3,20 — o /200 cobra 50% a mais',
   cabe(100,320) === 3 && perto(quanto(ENCAIXE,100,320), 1.70/3.2),
   'encaixe deu ' + quanto(ENCAIXE,100,320));

ok('e acerta por coincidência justamente onde cabem duas (1,40 e 1,60)',
   perto(quanto(VELHA,140,280), quanto(SOZINHA,140,280)) &&
   perto(quanto(VELHA,160,320), quanto(SOZINHA,160,320)));

/* ⚠️ O ESTRAGO ESTRUTURAL: com o `/200` a escolha de bobina do ficha_dominio
   deixa de ser por custo da peca e vira preco por metro linear. */
console.log('\n── a escolha da bobina ' + '─'.repeat(46));
formula.run(TUBO, null, 'largura / 100', 'a barra rende a largura da peça', 1,
            'largura - 3', null, 'cm');
const linhaTecido = formula.run(null, 'BLACKOUT', VELHA, 'a fórmula velha', 2,
            'largura', 'altura + 20', 'cm').lastInsertRowid;

let f = FICHA.calcularFicha(db, 'BK180150BEGE');
let tec = f.linhas.find(l => l.expressao === VELHA);
ok('com o /200 as duas bobinas consomem igual, e desempata o preço linear',
   perto(tec.opcoes[0].quantidade, tec.opcoes[1].quantidade) &&
   tec.motivo.indexOf('2,80') >= 0,
   'escolheu: ' + tec.motivo);

db.prepare('UPDATE ficha_formula SET expressao=? WHERE id=?').run(SOZINHA, linhaTecido);
f = FICHA.calcularFicha(db, 'BK180150BEGE');
tec = f.linhas.find(l => l.familia === 'BLACKOUT' || l.componente_id === B280 || l.componente_id === B320);
ok('com a fórmula honesta a 1,80 consome 1,70 m e escolhe a bobina mais BARATA por peça',
   perto(tec.quantidade, 1.70) && tec.componente_id === B280,
   'q=' + tec.quantidade + ' comp=' + tec.componente_id);

db.prepare('UPDATE ficha_formula SET expressao=? WHERE id=?').run(ENCAIXE, linhaTecido);
f = FICHA.calcularFicha(db, 'BK160150BEGE');
tec = f.linhas.find(l => l.componente_id === B280 || l.componente_id === B320);
/* 1,60 na 2,80: 1,60/2,80 x 1,70 = 0,9714 m a R$ 100 = R$ 97,14
   1,60 na 3,20: 1,60/3,20 x 1,70 = 0,8500 m a R$ 112 = R$ 95,20  <- ganha
   A bobina MAIS CARA por metro linear sai MAIS BARATA por peça. E exatamente
   o caso que a escolha por menor preco linear erraria. */
ok('a 1,60 escolhe a bobina de 3,20 — mais cara por metro, mais barata por peça',
   tec.componente_id === B320 && perto(tec.custo, 95.20, 0.01),
   'comp=' + tec.componente_id + ' custo=' + tec.custo);

/* ═══ 2. A MEDIDA DE CORTE — DOIS NUMEROS QUE NUNCA SE RECONCILIAM ════════ */
console.log('\n── a medida de corte ' + '─'.repeat(48));

f = FICHA.calcularFicha(db, 'BK160150BEGE');
const tubo = f.linhas.find(l => l.componente_id === TUBO);
tec = f.linhas.find(l => l.componente_id === B320);

ok('o tubo CONSOME 1,60 m da barra', perto(tubo.quantidade, 1.60));
ok('e a bancada CORTA a 157 cm — outro número, de propósito',
   perto(tubo.corte.largura, 157), JSON.stringify(tubo.corte));
ok('os dois números são diferentes, e é isso que se está travando',
   tubo.quantidade * 100 !== tubo.corte.largura);

/* ⚠️ O CASO CENTRAL: a medida de corte NAO ENTRA EM CENTAVO NENHUM. */
const soLinhas = f.linhas.filter(l => l.custo != null)
  .reduce((s, l) => s + l.custo, 0);
ok('⚠️ o custo do SKU é a soma das linhas e NADA MAIS — o corte não soma',
   perto(f.custo_material, soLinhas, 0.001),
   'total=' + f.custo_material + ' soma=' + soLinhas);

/* Dobrar a medida de corte nao pode mexer em um centavo. Se mexer, alguem
   ligou as duas contas — e a partir dali a fabrica passa a pagar pela medida
   errada sem que nada de erro. */
const custoAntes = f.custo_material;
db.prepare('UPDATE ficha_formula SET corte_largura=? WHERE componente_id=?').run('largura * 2', TUBO);
const depois = FICHA.calcularFicha(db, 'BK160150BEGE');
ok('⚠️ dobrar a medida de corte não muda o custo em um centavo',
   perto(depois.custo_material, custoAntes, 0.001),
   'antes=' + custoAntes + ' depois=' + depois.custo_material);
ok('mas muda a medida que vai pra bancada', perto(depois.linhas.find(l=>l.componente_id===TUBO).corte.largura, 320));
db.prepare('UPDATE ficha_formula SET corte_largura=? WHERE componente_id=?').run('largura - 3', TUBO);

/* O tecido corta um RETANGULO, nao um numero. */
f = FICHA.calcularFicha(db, 'BK160150BEGE');
tec = f.linhas.find(l => l.componente_id === B320);
ok('o tecido corta um retângulo: 160 × 170 cm',
   perto(tec.corte.largura, 160) && perto(tec.corte.altura, 170) &&
   tec.corte.texto === '160 × 170 cm', JSON.stringify(tec.corte));

/* Componente sem corte e resposta, nao pendencia. */
const PARAF = comp.run('Parafuso', 'un', null, null, null).lastInsertRowid;
of.run(PARAF, forn, 'pacote 500 un', 41.25, 500);
formula.run(PARAF, null, '4', 'dois por suporte', 3, null, null, null);
f = FICHA.calcularFicha(db, 'BK160150BEGE');
ok('componente sem corte fica com corte nulo — é resposta, não pendência',
   f.linhas.find(l => l.componente_id === PARAF).corte === null);
ok('e o parafuso continua entrando no custo normalmente',
   perto(f.linhas.find(l => l.componente_id === PARAF).custo, 0.33, 0.001));

/* Falta de PRECO nao pode apagar a medida de CORTE: a bancada corta o tubo do
   mesmo jeito sem fornecedor cadastrado, e ficha que some manda cortar de
   memoria. */
db.prepare('UPDATE oferta SET ativo=0 WHERE componente_id=?').run(TUBO);
f = FICHA.calcularFicha(db, 'BK160150BEGE');
const semPreco = f.linhas.find(l => l.componente_id === TUBO);
ok('sem preço de fornecedor o custo fica indefinido (regra 4)',
   f.custo_material === null && semPreco.custo === null && f.incompleto === true);
ok('⚠️ mas a medida de corte continua lá — a bancada corta igual',
   perto(semPreco.corte.largura, 157));
db.prepare('UPDATE oferta SET ativo=1 WHERE componente_id=?').run(TUBO);

/* ═══ 3. AS MEDIDAS DE TESTE ══════════════════════════════════════════════ */
console.log('\n── as medidas de teste ' + '─'.repeat(46));

/* ⚠️ O CASO QUE MOTIVOU A MUDANCA: com a lista fixa, a formula honesta era
   RECUSADA por causa de uma peca de 3,00 m que nenhuma bobina corta. */
const fixas = F.validar(SOZINHA, { largura_bobina:280 });
ok('⚠️ a peça de 3,00 m não cabe na bobina de 2,80 e sai das medidas testadas',
   fixas.ok === true && fixas.ignoradas.length === 1 && fixas.ignoradas[0].largura === 300,
   JSON.stringify(fixas.ignoradas || fixas.erro));

const reais = F.validar(SOZINHA, { largura_bobina:280,
  medidas:[{largura:100,altura:150},{largura:160,altura:150},{largura:180,altura:150}] });
ok('e com as medidas reais do catálogo ela passa limpa, sem nada ignorado',
   reais.ok === true && reais.ignoradas.length === 0, JSON.stringify(reais.erro));

/* Ignorar TODAS seria aprovar sem ter testado nada. */
const nenhuma = F.validar(SOZINHA, { largura_bobina:280, medidas:[{largura:300,altura:250}] });
ok('ignorar todas as medidas NÃO aprova: um ok sem evidência mente pior que a recusa',
   nenhuma.ok === false && /não cabe|não há como testar/.test(nenhuma.erro), nenhuma.erro);

/* A dica do resultado absurdo muda com a unidade: o corte sai em CENTIMETROS,
   entao "falta dividir por 100" seria conselho errado. */
const absurdo = F.validar('largura * 10000', { dica:'A medida de corte sai em centímetros.' });
ok('a dica do resultado absurdo respeita a unidade da linha',
   absurdo.ok === false && absurdo.erro.indexOf('centímetros') > 0, absurdo.erro);

/* O avaliador continua recusando tudo que nao e conta. Um `eval()` aqui daria a
   quem edita formula acesso ao .session_secret e aos PINs. */
console.log('\n── a porta única ' + '─'.repeat(52));
['process.exit(1)', 'require("fs")', 'largura.constructor', '"a"+1', 'global']
  .forEach(mau => {
    let barrou = false;
    try{ F.avaliar(mau, { largura:160, altura:150 }); }catch(e){ barrou = e instanceof F.ErroFormula; }
    ok('recusa "' + mau + '"', barrou);
  });

console.log('');
console.log(falhas ? ('FALHARAM ' + falhas + ' de ' + casos)
                   : ('todos os ' + casos + ' casos passaram'));
try{ fs.rmSync(tmp, {recursive:true, force:true}); }catch(e){}
process.exit(falhas ? 1 : 0);

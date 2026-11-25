#!/usr/bin/env node
/* teste_etiqueta_producao.js — as etiquetas da producao (spec PRODUCAO-MAPA-E-MOTOR
 * v7, §14.2 e §14.3, 25/11/2026): o maco em branco de tecido e de tubo, a
 * etiqueta de SKU em serie (numerada POR SKU, codigo de barras pelo numero da
 * fabrica), o tradutor, usar, cancelar, reimprimir e os PDFs lidos de volta.
 *
 *   node teste_etiqueta_producao.js
 */
const Database = require('better-sqlite3');
const zlib = require('zlib');
const { PDFDocument } = require('pdf-lib');
const ETQ = require('./etiqueta_producao');
const PDF = require('./sku_etq_pdf');
const barras = require('./public/barras.js');

let n = 0, falhas = 0;
function ok(desc, cond, det){ n++; if(cond) console.log('  ok  ' + n + ' — ' + desc); else { falhas++; console.log('  FALHOU ' + n + ' — ' + desc + (det ? '\n         ' + det : '')); } }
function eq(desc, a, e){ ok(desc, a === e, 'esperado ' + JSON.stringify(e) + ', veio ' + JSON.stringify(a)); }
function recusa(desc, fn, re){ let e = null; try{ fn(); }catch(x){ e = x; } ok(desc, e && e instanceof ETQ.Recusa && (!re || re.test(e.message)), e ? e.message : 'não recusou'); return e; }

const db = new Database(':memory:');
db.exec(`CREATE TABLE skus (codigo TEXT PRIMARY KEY, descricao TEXT DEFAULT '', cor TEXT DEFAULT '', cor_codigo TEXT,
  estoque INTEGER DEFAULT 0, alvo INTEGER DEFAULT 0, modelo_id INTEGER, largura_cm INTEGER, altura_cm INTEGER, tecido_codigo TEXT);
  INSERT INTO skus (codigo, largura_cm, altura_cm, cor_codigo, estoque) VALUES ('BK160140BEGE',160,140,'BEGE',7),('BK140140CINZA',140,140,'CINZA',3);`);
ETQ.garantirSchema(db);
ETQ.garantirSchema(db);   // de novo: nao estoura
const MARIA = { id:9, nome:'Maria' };
const saldo = () => db.prepare('SELECT SUM(estoque) s FROM skus').get().s;
const s0 = saldo();

console.log('\n── 1. o maço em branco ──');
let r = ETQ.imprimirMaco(db, 'TC', 3, MARIA);
eq('3 etiquetas de tecido', r.etiquetas.length, 3);
eq('a primeira é TC000001', r.etiquetas[0].codigo, 'TC000001');
eq('o rótulo escrito é "TC 000001"', ETQ.rotulo(r.etiquetas[0]), 'TC 000001');
ok('sem SKU e sem medida', r.etiquetas.every(e => e.sku == null));
r = ETQ.imprimirMaco(db, 'TC', 2, MARIA);
eq('o segundo maço continua a numeração (TC000004)', r.etiquetas[0].codigo, 'TC000004');
r = ETQ.imprimirMaco(db, 'TB', 2, MARIA);
eq('o tubo tem a sua própria sequência (TB000001)', r.etiquetas[0].codigo, 'TB000001');
eq('a próxima de tecido é a 6', ETQ.proxima(db, 'TC').rotulo, 'TC 000006');
eq('livres de tecido: 5', ETQ.livres(db, 'TC'), 5);
recusa('quantidade zero é recusada', () => ETQ.imprimirMaco(db, 'TC', 0, MARIA), /1 a/);
recusa('acima de 200 é recusada', () => ETQ.imprimirMaco(db, 'TB', 201, MARIA), /200/);
recusa('tipo desconhecido é recusado', () => ETQ.imprimirMaco(db, 'XX', 1, MARIA));

console.log('\n── 2. a etiqueta de SKU em série: a sequência é POR SKU ──');
r = ETQ.imprimirPersianas(db, [{ sku:'BK160140BEGE', quantidade:3 }, { sku:'bk140140cinza', quantidade:2 }], 'dia', MARIA);
const bege = r.etiquetas.filter(e => e.sku === 'BK160140BEGE'), cinza = r.etiquetas.filter(e => e.sku === 'BK140140CINZA');
eq('BEGE nº 1, 2, 3', bege.map(e => e.numero).join(','), '1,2,3');
eq('CINZA começa no nº 1 (o SKU em minúscula acha o cadastro)', cinza.map(e => e.numero).join(','), '1,2');
ok('o código de barras é PS + 8 dígitos do número da fábrica', r.etiquetas.every(e => /^PS\d{8}$/.test(e.codigo) && e.codigo === ETQ.codigoDe('PS', e.id)));
eq('o rótulo é "BK160140BEGE Nº 2"', ETQ.rotulo(bege[1]), 'BK160140BEGE Nº 2');
r = ETQ.imprimirPersianas(db, [{ sku:'BK160140BEGE', quantidade:2 }], 'proximos', MARIA);
eq('a segunda impressão continua: BEGE nº 4 e 5', r.etiquetas.map(e => e.numero).join(','), '4,5');
recusa('SKU fora do cadastro é recusado (404)', () => ETQ.imprimirPersianas(db, [{ sku:'NAOEXISTE', quantidade:1 }], 'dia', MARIA), /não cadastrado/);
recusa('parte desconhecida é recusada', () => ETQ.imprimirPersianas(db, [{ sku:'BK160140BEGE', quantidade:1 }], 'xyz', MARIA));
recusa('fora do planejamento SEM motivo é recusado', () => ETQ.imprimirPersianas(db, [{ sku:'BK160140BEGE', quantidade:1 }], 'fora', MARIA), /motivo/);
r = ETQ.imprimirPersianas(db, [{ sku:'BK160140BEGE', quantidade:1 }], 'fora', MARIA, 'Teste');
eq('fora do planejamento guarda o motivo', r.etiquetas[0].fora_motivo, 'Teste');
recusa('mais de 200 numa impressão é recusado', () => ETQ.imprimirPersianas(db, [{ sku:'BK160140BEGE', quantidade:150 }, { sku:'BK140140CINZA', quantidade:60 }], 'dia', MARIA), /200/);
const nAntes = db.prepare('SELECT COUNT(*) n FROM etiqueta_producao').get().n;
recusa('...e nada foi gravado da impressão recusada', () => ETQ.imprimirPersianas(db, [{ sku:'BK160140BEGE', quantidade:1 }, { sku:'XX', quantidade:1 }], 'dia', MARIA));
eq('...nenhuma etiqueta a mais', db.prepare('SELECT COUNT(*) n FROM etiqueta_producao').get().n, nAntes);

console.log('\n── 3. o tradutor ──');
const b2 = bege[1];
let t = ETQ.traduzir(db, b2.codigo);
eq('o código em série vira o SKU', t && t.sku, 'BK160140BEGE');
eq('...e o número', t && t.numero, 2);
t = ETQ.traduzir(db, 'ps-' + b2.codigo.slice(2));
eq('o leitor que manda hífen e minúscula também acha', t && t.id, b2.id);
eq('um SKU comum não é etiqueta: volta null', ETQ.traduzir(db, 'BK160140BEGE'), null);
eq('skuDoBipe do SKU comum volta o próprio SKU', ETQ.skuDoBipe(db, 'BK160140BEGE').sku, 'BK160140BEGE');
eq('skuDoBipe da etiqueta em série volta o SKU dela', ETQ.skuDoBipe(db, b2.codigo).sku, 'BK160140BEGE');
eq('skuDoBipe da etiqueta de TECIDO não é SKU (null)', ETQ.skuDoBipe(db, 'TC000001').sku, null);
t = ETQ.traduzir(db, 'PS99999999');
ok('código na forma de etiqueta mas inexistente: desconhecida', t && t.desconhecida === true);
ok('reservado: PS + 8 dígitos, TC/TB + 6 dígitos', ETQ.reservado('PS00000001') && ETQ.reservado('TC000123') && ETQ.reservado('TB0001234') && !ETQ.reservado('BK160140BEGE') && !ETQ.reservado('TC12'));

console.log('\n── 4. usar, soltar e cancelar ──');
db.transaction(() => ETQ.usar(db, 'TC000001', 'TC'))();
eq('usada', db.prepare("SELECT situacao FROM etiqueta_producao WHERE codigo='TC000001'").get().situacao, 'usada');
recusa('usar de novo é recusado (409), dizendo quando', () => ETQ.usar(db, 'TC000001', 'TC'), /já foi usada/);
recusa('etiqueta de tubo no lugar da de tecido é recusada', () => ETQ.usar(db, 'TB000001', 'TC'), /não é etiqueta de tecido/);
recusa('etiqueta que não existe é recusada', () => ETQ.usar(db, 'TC999999', 'TC'), /não reconhecida/);
ETQ.soltar(db, db.prepare("SELECT id FROM etiqueta_producao WHERE codigo='TC000001'").get().id);
eq('soltar devolve ao maço', db.prepare("SELECT situacao FROM etiqueta_producao WHERE codigo='TC000001'").get().situacao, 'livre');
const idC = db.prepare("SELECT id FROM etiqueta_producao WHERE codigo='TC000002'").get().id;
recusa('cancelar sem motivo é recusado', () => ETQ.cancelar(db, [idC], '', MARIA), /motivo/);
eq('cancelar com motivo', ETQ.cancelar(db, [idC], 'Estragada', MARIA), 1);
const canc = db.prepare('SELECT * FROM etiqueta_producao WHERE id=?').get(idC);
ok('grava quem cancelou, pelo id, e o motivo', canc.situacao === 'cancelada' && canc.cancelada_por_id === 9 && canc.cancelada_motivo === 'Estragada');
recusa('a cancelada não se usa', () => ETQ.usar(db, 'TC000002', 'TC'), /cancelada/);
recusa('cancelar de novo é recusado', () => ETQ.cancelar(db, [idC], 'x', MARIA), /não está livre/);
r = ETQ.imprimirMaco(db, 'TC', 1, MARIA);
eq('o número da cancelada não volta (a próxima é a 6)', r.etiquetas[0].codigo, 'TC000006');

console.log('\n── 5. não usadas, histórico e reimpressão ──');
db.prepare("UPDATE etiqueta_producao SET criada_em=datetime('now','localtime','-20 days') WHERE codigo='TC000003'").run();
let nu = ETQ.naoUsadas(db);
ok('a lista não traz a cancelada nem a usada', !nu.some(e => e.situacao !== 'livre'));
eq('a mais velha vem em cima', nu[0].codigo, 'TC000003');
ok('parada há 20 dias, acima dos 15: âmbar', nu[0].parada === true && nu[0].dias === 20);
db.prepare("INSERT INTO config (chave,valor) VALUES ('etiqueta_parada_dias','30')").run();
ok('com o parâmetro em 30, já não é parada', ETQ.naoUsadas(db)[0].parada === false);
const h = ETQ.historico(db);
ok('o histórico do dia lista as impressões, a mais nova em cima', h.length >= 6 && h[0].id > h[h.length-1].id);
ok('...com os números ("BK160140BEGE Nº 1–3")', h.some(x => /BK160140BEGE Nº 1–3/.test(x.numeros || '')), JSON.stringify(h.map(x => x.numeros)));
ok('...e quem imprimiu', h.every(x => x.por === 'Maria' && x.por_id === 9));
const re = ETQ.paraReimprimir(db, [b2.id], MARIA);
eq('reimprimir devolve a MESMA etiqueta', re[0].codigo, b2.codigo);
ok('...vira linha de reimpressão no histórico, sem criar etiqueta', ETQ.historico(db)[0].reimpressao === 1 && db.prepare('SELECT COUNT(*) n FROM etiqueta_producao WHERE sku=? AND numero=2').get('BK160140BEGE').n === 1);
recusa('a cancelada não se reimprime', () => ETQ.paraReimprimir(db, [idC], MARIA), /cancelada/);

console.log('\n── 6. nada disso mexe em saldo ──');
eq('o estoque dos SKUs não mudou', saldo(), s0);

/* O PDF lido de volta, como no teste_etiqueta_sku.js. */
async function abrir(buf){
  const doc = await PDFDocument.load(buf); const textos = [], rets = []; const MM = 72/25.4;
  for(let i=0; (i = buf.indexOf('stream', i)) >= 0; ){
    let s = i+6; if(buf[s]===13) s++; if(buf[s]===10) s++;
    const e = buf.indexOf('endstream', s); let tx = null;
    try{ tx = zlib.inflateSync(buf.slice(s,e)).toString('latin1'); }catch(err){ tx = buf.slice(s,e).toString('latin1'); }
    const pag = [], rs = [];
    for(const m of tx.matchAll(/<([0-9A-Fa-f]+)> Tj/g)) pag.push(Buffer.from(m[1],'hex').toString('latin1'));
    const RET = /1 0 0 1 (-?[\d.]+) (-?[\d.]+) cm\n1 0 0 1 0 0 cm\n1 0 0 1 0 0 cm\n0 0 m\n0 ([\d.]+) l\n([\d.]+) \3 l/g;
    for(const m of tx.matchAll(RET)) rs.push({ x:+m[1]/MM, w:+m[4]/MM });
    if(pag.length || rs.length){ textos.push(pag); rets.push(rs); }
    i = e > 0 ? e : buf.length;
  }
  return { doc, textos, rets };
}
function bits(rs){
  const r = rs.slice().sort((a,b)=>a.x-b.x), m = Math.min(...r.map(x=>x.w)), x0 = r[0].x, fim = Math.max(...r.map(x=>x.x+x.w));
  const b = new Array(Math.round((fim-x0)/m)).fill('0');
  for(const q of r){ const a = Math.round((q.x-x0)/m), z = Math.round((q.x+q.w-x0)/m); for(let k=a;k<z;k++) b[k]='1'; }
  return b.join('').replace(/0+$/,'');
}
(async () => {
  console.log('\n── 7. os PDFs ──');
  const skuRow = { codigo:'BK160140BEGE', descricao:'', largura_cm:160, altura_cm:140, cor_codigo:'BEGE', tecido_nome:'Blackout', exige_medida:1 };
  const buf = await PDF.gerarSerie([{ sku:skuRow, codigo:b2.codigo, numero:2 }, { sku:skuRow, codigo:bege[2].codigo, numero:3 }]);
  let p = await abrir(buf);
  eq('uma página por etiqueta em série', p.doc.getPageCount(), 2);
  const tx = p.textos[0].join(' | ');
  ok('escreve o SKU com o "Nº 2"', /BK160140BEGE Nº 2/.test(tx), tx);
  ok('o formato de hoje: a medida 1.60 X 1.40', /1\.60 X 1\.40/.test(tx), tx);
  ok('o código da fábrica NÃO vai escrito', !tx.includes(b2.codigo), tx);
  eq('as barras são do código da fábrica (lidas de volta)', bits(p.rets[0]), barras.modulos(b2.codigo).replace(/0+$/,''));
  const maco = await PDF.gerarMaco([{ codigo:'TC000006', rotulo:'TC 000006', titulo:'TECIDO' }]);
  p = await abrir(maco);
  eq('o maço: uma página', p.doc.getPageCount(), 1);
  ok('escreve TECIDO e TC 000006', p.textos[0].includes('TECIDO') && p.textos[0].includes('TC 000006'), p.textos[0].join('|'));
  eq('as barras do maço são o TC000006', bits(p.rets[0]), barras.modulos('TC000006').replace(/0+$/,''));
  ok('o maço não escreve medida nenhuma', !/×|X \d/.test(p.textos[0].join(' ')));

  console.log('\n' + (falhas ? falhas + ' de ' + n + ' casos FALHARAM' : 'todos os ' + n + ' casos passaram'));
  process.exit(falhas ? 1 : 0);
})();

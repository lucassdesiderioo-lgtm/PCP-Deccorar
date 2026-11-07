#!/usr/bin/env node
/* FASE 8 da spec COMPRAS-E-RECEBIMENTO — a nota por XML.
 *
 *   node teste_nota_xml.js
 *
 * ⚠️ ESCRITO ANTES DO CODIGO e conferido reintroduzindo cada defeito. Usa dois
 * XML no layout 4.00 da NF-e, de dois fornecedores (`teste_dados/nfe/`): um da
 * industria em regime normal (com `nfeProc`, IPI, ICMS, frete e desconto, e um
 * brinde que nao e do pedido) e um do Simples (CSOSN, sem `nfeProc`, seguro e
 * outras). ⚠️ NAO SAO XML REAIS DE FORNECEDOR: foram montados no layout da
 * Receita. A prova com XML real e o primeiro que o dono anexar.
 *
 * Trava: o leitor (cabeca, itens, impostos, nome com &amp;); casar pelo codigo
 * do fornecedor da oferta e pelo NCM; o que nao casa NAO e adivinhado (dois
 * candidatos, ou nenhum, ficam para escolher); a nota so se lanca com todo
 * item decidido; a mesma chave nao entra duas vezes.
 */
const fs = require('fs'), path = require('path');
const { bancada, MODULOS } = require('./util_teste_compras');
const B = bancada({ modulos: MODULOS.concat(['material_route', 'compra_route', 'recebimento_route', 'nota_route']) });
const { db, post, ok, fim, secao } = B;
const AG = { id:1, nome:'Lucas', admin_geral:true, permissoes:['alcada.definir'] };
const XML1 = fs.readFileSync(path.join(__dirname, 'teste_dados', 'nfe', 'metal_sul.xml'), 'utf8');
const XML2 = fs.readFileSync(path.join(__dirname, 'teste_dados', 'nfe', 'textil_simples.xml'), 'utf8');
const X = require('./nota_xml');
const quase = (a, b) => Math.abs(a - b) < 1e-6;

(async () => {
  db.exec('CREATE TABLE IF NOT EXISTS usuarios (id INTEGER PRIMARY KEY, nome TEXT, pin_hash TEXT, salt TEXT, areas TEXT, ativo INTEGER DEFAULT 1)');
  secao('o leitor do XML');
  const n1 = X.ler(XML1);
  ok('cabeca: chave de 44, numero, serie, emissao', n1.chave === '43261112345678000199550010000012341000012345' && n1.numero === '1234' && n1.serie === '1' && n1.emissao === '2026-11-05');
  ok('emitente: CNPJ e nome', n1.emitente_cnpj === '12345678000199' && /METAL SUL/.test(n1.emitente_nome));
  ok('tres itens, com codigo, NCM, CFOP e unidade', n1.itens.length === 3 && n1.itens[0].codigo_fornecedor === 'TB-38-6000' && n1.itens[0].ncm === '76082090' && n1.itens[0].cfop === '6101' && n1.itens[0].unidade === 'KG');
  ok('os valores do item como vieram: produto, frete, desconto, ICMS, IPI', quase(n1.itens[0].valor_produto, 5000) && quase(n1.itens[0].frete, 200) && quase(n1.itens[0].desconto, 50) && quase(n1.itens[0].icms, 618) && quase(n1.itens[0].ipi, 250));
  ok('o "&amp;" do nome vira "&"', n1.itens[2].descricao === 'CANETA BRINDE & CHAVEIRO');
  const n2 = X.ler(XML2);
  ok('o XML do Simples, sem nfeProc e com quebras de linha, tambem le', n2.numero === '9876' && n2.itens.length === 2 && quase(n2.itens[0].seguro, 18) && quase(n2.itens[0].outras, 12));
  ok('o CSOSN do Simples nao tem vICMS: zero', n2.itens.every(i => i.icms === 0));
  const comPrefixo = XML2.replace(/<(\/?)([A-Za-z])/g, '<$1nfe:$2');
  ok('o XML com prefixo de namespace (nfe:infNFe) tambem le', X.ler(comPrefixo).numero === '9876' && X.ler(comPrefixo).itens.length === 2);
  let erro = null; try{ X.ler('<html>nada</html>'); }catch(e){ erro = e; }
  ok('o que nao e NF-e e recusado dizendo por que', erro && /infNFe/.test(erro.message));

  /* o pedido da Metal Sul: tubo (oferta com o codigo do fornecedor) e base (casa pelo NCM) */
  const forn = (await post('/api/fornecedores', { nome:'Metal Sul', cnpj:'12.345.678/0001-99' }, AG)).corpo.id;
  const tubo = (await post('/api/componentes', { nome:'Tubo 38', unidade:'un', modo_saldo:'quantidade' }, AG)).corpo.id;
  const base = (await post('/api/componentes', { nome:'Base cônica', unidade:'un', modo_saldo:'quantidade', ncm:'7616.99.00' }, AG)).corpo.id;
  const ofT = (await post('/api/ofertas', { fornecedor_id:forn, componente_id:tubo, embalagem:'barra', fator:1, preco:8, codigo_fornec:'TB-38-6000' }, AG)).corpo.id;
  const ofB = (await post('/api/ofertas', { fornecedor_id:forn, componente_id:base, embalagem:'un', fator:1, preco:5 }, AG)).corpo.id;
  const pid = (await post('/api/pedidos', { itens:[{ oferta_id:ofT, necessidade:600, unidade_compra:'kg', qtd_compra:400, preco_unid_compra:12.5, qtd_declarada:600 }, { oferta_id:ofB, necessidade:100 }] }, AG)).corpo.pedidos[0].id;
  await post('/api/pedidos/' + pid + '/comprar', { canal:'direto', numero_externo:'OC-1', comprado_em:'2026-11-01' }, AG);
  const [iT, iB] = db.prepare('SELECT id FROM pedido_item WHERE pedido_id=? ORDER BY id').all(pid).map(x => x.id);

  secao('casar sem adivinhar');
  const c1 = X.casar(db, pid, n1);
  ok('o tubo casa pelo codigo do fornecedor (oferta)', c1[0].pedido_item_id === iT && c1[0].por === 'codigo_fornecedor');
  ok('a base casa pelo NCM (um so item do pedido com ele)', c1[1].pedido_item_id === iB && c1[1].por === 'ncm');
  ok('o brinde NAO casa: fica para escolher, com o motivo', c1[2].pedido_item_id === null && /escolha na tela/.test(c1[2].motivo));
  ok('os pedidos do emitente sao achados pelo CNPJ', X.pedidosDoEmitente(db, n1.emitente_cnpj).some(p => p.id === pid));

  let r = await post('/api/notas/xml/ler', { xml:XML1, pedido_id:pid }, AG);
  ok('a rota de ler devolve a nota e as sugestoes, sem gravar', r.status === 200 && r.corpo.casamento.length === 3 && db.prepare('SELECT COUNT(*) n FROM nota_compra').get().n === 0, () => JSON.stringify(r.corpo).slice(0, 200));
  r = await post('/api/notas/xml', { xml:XML1, pedido_id:pid }, AG);
  ok('sem decidir o brinde, a nota nao se lanca — e diz qual item falta', r.status === 400 && /3/.test(r.corpo.erro), () => JSON.stringify(r.corpo));
  r = await post('/api/notas/xml', { xml:XML1, pedido_id:pid, escolhas:{ '3':false } }, AG);
  ok('com o brinde marcado como "nao e deste pedido", lanca', r.status === 200, () => JSON.stringify(r.corpo));
  const nt = db.prepare('SELECT * FROM nota_compra WHERE id=?').get(r.corpo.id);
  ok('origem xml, chave, emitente e numero gravados', nt.origem === 'xml' && nt.chave === n1.chave && nt.numero === '1234' && nt.emitente_cnpj === '12345678000199');
  const ni = db.prepare('SELECT * FROM nota_compra_item WHERE nota_id=? ORDER BY id').all(r.corpo.id);
  ok('o custo pago do tubo: 5000 − 50 + 200 + 250 (IPI) = 5400', quase(ni[0].custo_pago, 5400) && ni[0].pedido_item_id === iT, () => ni[0].custo_pago);
  ok('o brinde entrou na nota sem item do pedido', ni[2].pedido_item_id == null && ni[2].codigo_fornecedor === 'BRINDE-01');
  r = await post('/api/notas/xml', { xml:XML1, pedido_id:pid, escolhas:{ '3':false } }, AG);
  ok('a mesma chave nao entra duas vezes (409)', r.status === 409);

  secao('dois itens com o mesmo NCM: escolha na tela');
  const f2 = (await post('/api/fornecedores', { nome:'Textil', cnpj:'11222333000144' }, AG)).corpo.id;
  const cinza = (await post('/api/componentes', { nome:'Screen cinza 2,80', unidade:'m', modo_saldo:'volume', ncm:'54076100' }, AG)).corpo.id;
  const bege = (await post('/api/componentes', { nome:'Screen bege 2,80', unidade:'m', modo_saldo:'volume', ncm:'54076100' }, AG)).corpo.id;
  const oc = (await post('/api/ofertas', { fornecedor_id:f2, componente_id:cinza, embalagem:'m', fator:1, preco:18 }, AG)).corpo.id;
  const ob = (await post('/api/ofertas', { fornecedor_id:f2, componente_id:bege, embalagem:'m', fator:1, preco:18 }, AG)).corpo.id;
  const p2 = (await post('/api/pedidos', { itens:[{ oferta_id:oc, necessidade:100 }, { oferta_id:ob, necessidade:50 }] }, AG)).corpo.pedidos[0].id;
  await post('/api/pedidos/' + p2 + '/comprar', { canal:'direto', numero_externo:'T-1', comprado_em:'2026-11-02' }, AG);
  const [i1, i2] = db.prepare('SELECT id FROM pedido_item WHERE pedido_id=? ORDER BY id').all(p2).map(x => x.id);
  const c2 = X.casar(db, p2, n2);
  ok('o NCM serve aos dois tecidos: NENHUM e adivinhado', c2.every(c => c.pedido_item_id === null) && c2[0].candidatos.length === 2, () => JSON.stringify(c2));
  r = await post('/api/notas/xml', { xml:XML2, pedido_id:p2, escolhas:{ '1':iT, '2':i2 } }, AG);
  ok('escolha de item de OUTRO pedido e recusada (400), e nada e gravado', r.status === 400 && db.prepare("SELECT COUNT(*) n FROM nota_compra WHERE numero='9876'").get().n === 0, () => JSON.stringify(r));
  r = await post('/api/notas/xml', { xml:XML2, pedido_id:p2, escolhas:{ '1':i1, '2':i2 } }, AG);
  ok('com as escolhas, lanca', r.status === 200, () => JSON.stringify(r.corpo));
  const si = db.prepare('SELECT * FROM nota_compra_item WHERE nota_id=? ORDER BY id').all(r.corpo.id);
  ok('Simples: pago = 1800 + 18 + 12 = 1830, e liquido igual', quase(si[0].custo_pago, 1830) && quase(si[0].custo_liquido, 1830));
  r = await post('/api/notas/xml', { xml:XML2, pedido_id:p2 }, null);
  ok('sem login nada grava (401)', r.status === 401);
  fim();
})().catch(e => { console.error(e); process.exit(1); });

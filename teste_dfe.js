#!/usr/bin/env node
/* FASE 11 da spec COMPRAS-E-RECEBIMENTO — as notas baixadas da Receita
 * (R-CMP-53 a 55).
 *
 *   node teste_dfe.js
 *
 * ⚠️ ESCRITO ANTES DO CODIGO e conferido reintroduzindo cada defeito. Sem
 * certificado real e sem falar com a Receita: o certificado de teste e gerado
 * na hora (openssl), e as respostas da distribuicao de DF-e e do evento sao
 * montadas no layout da Receita (retDistDFeInt com docZip em gzip+base64,
 * retEnvEvento). ⚠️ NAO SAO RESPOSTAS GRAVADAS DA RECEITA DE VERDADE: a prova e
 * a primeira consulta depois que o dono enviar o .pfx.
 *
 * Trava: o ultimo NSU guardado e mandado na consulta seguinte; o limite da
 * Receita (sem documento novo, espera uma hora); o resumo entra antes da
 * mercadoria e recebe a ciencia ASSINADA (a assinatura confere com a chave do
 * certificado); a completa entra pelo leitor da fase 8 com origem dfe, e so
 * se lanca sozinha com UM pedido e todos os itens casando; fornecedor sem
 * pedido vira "nota sem pedido" (aviso em Pendencias).
 */
const fs = require('fs'), path = require('path'), os = require('os'), zlib = require('zlib'), crypto = require('crypto');
const { spawnSync } = require('child_process');
if(spawnSync('openssl', ['version']).status !== 0){ console.log('PULADO: sem openssl para gerar o certificado de teste'); process.exit(0); }
const dirC = fs.mkdtempSync(path.join(os.tmpdir(), 'dfe-'));
spawnSync('openssl', ['req', '-x509', '-newkey', 'rsa:2048', '-keyout', path.join(dirC, 'k.pem'), '-out', path.join(dirC, 'c.pem'), '-days', '365', '-nodes', '-subj', '/C=BR/CN=DECCORAR LTDA:98765432000110']);
spawnSync('openssl', ['pkcs12', '-export', '-out', path.join(dirC, 'c.pfx'), '-inkey', path.join(dirC, 'k.pem'), '-in', path.join(dirC, 'c.pem'), '-passout', 'pass:abc123']);
const PUB = crypto.createPublicKey(fs.readFileSync(path.join(dirC, 'c.pem')));

process.env.PCP_DFE_AUTOMATICO = '0';
const { bancada, MODULOS } = require('./util_teste_compras');
const B = bancada({ modulos: MODULOS.concat(['material_route', 'compra_route', 'recebimento_route', 'nota_route', 'dfe_route']) });
const { db, get, post, ok, fim, secao } = B;
const AG = { id:1, nome:'Lucas', admin_geral:true, permissoes:['alcada.definir','certificado.gerenciar'] };
const DFE = require('./dfe_dominio');
const XML_METAL = fs.readFileSync(path.join(__dirname, 'teste_dados', 'nfe', 'metal_sul.xml'), 'utf8')
  .replace(/<det nItem="3">[\s\S]*?<\/det>/, '');   // sem o brinde: todos os itens casam
const CH_METAL = '43261112345678000199550010000012341000012345';
const CH_FORA = '35261199888777000166550010000000551000000550';
const zip = s => zlib.gzipSync(Buffer.from(s, 'utf8')).toString('base64');
const resNFe = (ch, cnpj, nome, v) => '<resNFe xmlns="http://www.portalfiscal.inf.br/nfe" versao="1.01"><chNFe>' + ch + '</chNFe><CNPJ>' + cnpj + '</CNPJ><xNome>' + nome + '</xNome><dhEmi>2026-11-05T09:00:00-03:00</dhEmi><vNF>' + v + '</vNF><cSitNFe>1</cSitNFe></resNFe>';
const XML_FORA = XML_METAL.replace(/43261112345678000199550010000012341000012345/g, CH_FORA).replace(/<emit><CNPJ>12345678000199<\/CNPJ><xNome>[^<]*</, '<emit><CNPJ>99888777000166</CNPJ><xNome>LOJA SEM PEDIDO<');
const ret = (cStat, ult, max, docs) => '<soap:Envelope xmlns:soap="http://www.w3.org/2003/05/soap-envelope"><soap:Body><nfeDistDFeInteresseResponse><nfeDistDFeInteresseResult>'
  + '<retDistDFeInt xmlns="http://www.portalfiscal.inf.br/nfe" versao="1.01"><tpAmb>1</tpAmb><verAplic>1.5</verAplic><cStat>' + cStat + '</cStat><xMotivo>' + (cStat === '138' ? 'Documento localizado' : 'Nenhum documento localizado') + '</xMotivo>'
  + '<dhResp>2026-11-07T10:00:00-03:00</dhResp><ultNSU>' + ult + '</ultNSU><maxNSU>' + max + '</maxNSU>'
  + (docs.length ? '<loteDistDFeInt>' + docs.map(d => '<docZip NSU="' + d[0] + '" schema="' + d[1] + '">' + zip(d[2]) + '</docZip>').join('') + '</loteDistDFeInt>' : '')
  + '</retDistDFeInt></nfeDistDFeInteresseResult></nfeDistDFeInteresseResponse></soap:Body></soap:Envelope>';
const okEvento = '<soap:Envelope xmlns:soap="http://www.w3.org/2003/05/soap-envelope"><soap:Body><retEnvEvento xmlns="http://www.portalfiscal.inf.br/nfe"><cStat>128</cStat><xMotivo>Lote de evento processado</xMotivo><retEvento><infEvento><cStat>135</cStat><xMotivo>Evento registrado e vinculado a NF-e</xMotivo></infEvento></retEvento></retEnvEvento></soap:Body></soap:Envelope>';

let fila = [], enviados = [];
const transporte = async (cert, url, corpo) => {
  enviados.push({ url, corpo });
  if(url === DFE.URL_EVENTO) return okEvento;
  return fila.shift();
};

(async () => {
  db.exec('CREATE TABLE IF NOT EXISTS usuarios (id INTEGER PRIMARY KEY, nome TEXT, pin_hash TEXT, salt TEXT, areas TEXT, ativo INTEGER DEFAULT 1)');
  await post('/api/certificado/dados', { cnpj:'98765432000110', uf_codigo:'43' }, AG);
  const rc = await post('/api/certificado', { base64:fs.readFileSync(path.join(dirC, 'c.pfx')).toString('base64'), senha:'abc123' }, AG);
  ok('o certificado de teste entra', rc.status === 200, () => JSON.stringify(rc.corpo));
  /* o pedido da Metal Sul (o mesmo da fase 8) */
  const forn = (await post('/api/fornecedores', { nome:'Metal Sul', cnpj:'12.345.678/0001-99' }, AG)).corpo.id;
  const tubo = (await post('/api/componentes', { nome:'Tubo 38', unidade:'un', modo_saldo:'quantidade' }, AG)).corpo.id;
  const base = (await post('/api/componentes', { nome:'Base cônica', unidade:'un', modo_saldo:'quantidade', ncm:'76169900' }, AG)).corpo.id;
  const ofT = (await post('/api/ofertas', { fornecedor_id:forn, componente_id:tubo, embalagem:'barra', fator:1, preco:8, codigo_fornec:'TB-38-6000' }, AG)).corpo.id;
  const ofB = (await post('/api/ofertas', { fornecedor_id:forn, componente_id:base, embalagem:'un', fator:1, preco:5 }, AG)).corpo.id;
  const pid = (await post('/api/pedidos', { itens:[{ oferta_id:ofT, necessidade:600 }, { oferta_id:ofB, necessidade:100 }] }, AG)).corpo.pedidos[0].id;
  await post('/api/pedidos/' + pid + '/comprar', { canal:'direto', numero_externo:'OC-1', comprado_em:'2026-11-01' }, AG);

  secao('a consulta, o resumo e a ciencia automatica (R-CMP-53, R-CMP-54)');
  fila = [ret('138', '000000000000002', '000000000000002', [['000000000000001', 'resNFe_v1.01.xsd', resNFe(CH_METAL, '12345678000199', 'METAL SUL', '5899.99')],
    ['000000000000002', 'resNFe_v1.01.xsd', resNFe(CH_FORA, '99888777000166', 'LOJA SEM PEDIDO', '120.00')]])];
  let r = await DFE.consultar(db, { transporte });
  ok('consultou e achou dois documentos', r.consultou && r.documentos === 2, () => JSON.stringify(r));
  ok('a primeira consulta pede a partir do NSU zero', /<ultNSU>000000000000000<\/ultNSU>/.test(enviados[0].corpo) && /<CNPJ>98765432000110<\/CNPJ>/.test(enviados[0].corpo) && /<cUFAutor>43<\/cUFAutor>/.test(enviados[0].corpo));
  ok('o ultimo NSU lido fica guardado (2)', DFE.controle(db).ultimo_nsu === '000000000000002');
  const docs = DFE.listar(db);
  ok('as notas aparecem com emitente, valor e data ANTES da mercadoria', docs.some(d => d.chave === CH_METAL && d.emitente_nome === 'METAL SUL' && d.valor === 5899.99 && d.emissao === '2026-11-05'));
  ok('a ciencia da operacao foi enviada sozinha, para as duas', r.ciencias === 2 && docs.every(d => d.ciencia_em), () => JSON.stringify(docs.map(d => d.ciencia_erro)));
  const ev = enviados.find(x => x.url === DFE.URL_EVENTO).corpo;
  ok('o evento e o 210210 (ciencia), so ela — nenhuma manifestacao conclusiva', /<tpEvento>210210<\/tpEvento>/.test(ev) && !/21020[0-9]|210220|210240/.test(ev.replace(/210210/g, '')));
  /* a assinatura confere: o digest do infEvento canonico e a assinatura RSA do SignedInfo */
  const inf = ev.match(/<infEvento Id="[^"]+">[\s\S]*?<\/infEvento>/)[0];
  const canon = inf.replace('<infEvento ', '<infEvento xmlns="http://www.portalfiscal.inf.br/nfe" ');
  const dig = crypto.createHash('sha1').update(canon).digest('base64');
  const si = ev.match(/<SignedInfo>[\s\S]*?<\/SignedInfo>/)[0].replace('<SignedInfo>', '<SignedInfo xmlns="http://www.w3.org/2000/09/xmldsig#">');
  const sv = ev.match(/<SignatureValue>([^<]+)</)[1];
  ok('o DigestValue e o do infEvento canonico', ev.indexOf('<DigestValue>' + dig + '</DigestValue>') >= 0);
  ok('a assinatura confere com a chave publica do certificado', crypto.createVerify('RSA-SHA1').update(si).verify(PUB, sv, 'base64'));
  ok('e o certificado vai junto (X509Certificate)', /<X509Certificate>[A-Za-z0-9+/=]{200,}<\/X509Certificate>/.test(ev));
  ok('a senha do certificado nunca vai na mensagem', ev.indexOf('abc123') < 0);

  secao('o limite da Receita');
  ok('com mais a ler (ultNSU < maxNSU) volta logo; sem, espera o intervalo', !!DFE.controle(db).proxima_consulta);
  ok('antes da proxima consulta, o relogio NAO pergunta', (await DFE.talvezConsultar(db, { transporte:() => { throw new Error('nao devia'); } })) === null);
  db.prepare('UPDATE dfe_controle SET proxima_consulta=NULL WHERE id=1').run();

  secao('a nota completa entra pelo leitor da fase 8 (R-CMP-55)');
  enviados = [];
  fila = [ret('138', '000000000000004', '000000000000004', [['000000000000003', 'procNFe_v4.00.xsd', XML_METAL], ['000000000000004', 'procNFe_v4.00.xsd', XML_FORA]])];
  r = await DFE.consultar(db, { transporte });
  ok('a segunda consulta manda o ultimo NSU guardado (2)', /<ultNSU>000000000000002<\/ultNSU>/.test(enviados[0].corpo));
  const dm = db.prepare('SELECT * FROM dfe_documento WHERE chave=?').get(CH_METAL);
  ok('a da Metal Sul: um pedido e todos os itens casando — lancada sozinha, origem dfe', dm.tipo === 'completa' && dm.situacao === 'lancada' && dm.nota_compra_id && db.prepare('SELECT origem FROM nota_compra WHERE id=?').get(dm.nota_compra_id).origem === 'dfe', () => JSON.stringify(dm));
  const df = db.prepare('SELECT * FROM dfe_documento WHERE chave=?').get(CH_FORA);
  ok('a da loja sem pedido: "nota sem pedido" (nao e lancada)', df.situacao === 'sem_pedido' && !df.nota_compra_id);
  const L = require('./pendencias_dominio').LINHAS.find(l => l.chave === 'nota_sem_pedido');
  ok('e e aviso na central de Pendencias', L && L.contar(db).n === 1);
  ok('o XML completo fica guardado fora de lotes/', fs.existsSync(path.join(require('./caminhos').ANEXOS_COMPRAS, 'dfe', CH_METAL + '.xml')));

  /* dois pedidos do mesmo fornecedor: nunca adivinhado */
  const pid2 = (await post('/api/pedidos', { itens:[{ oferta_id:ofT, necessidade:600 }, { oferta_id:ofB, necessidade:100 }] }, AG)).corpo.pedidos[0].id;
  await post('/api/pedidos/' + pid2 + '/comprar', { canal:'direto', numero_externo:'OC-2', comprado_em:'2026-11-02' }, AG);
  const pid3 = (await post('/api/pedidos', { itens:[{ oferta_id:ofT, necessidade:600 }, { oferta_id:ofB, necessidade:100 }] }, AG)).corpo.pedidos[0].id;
  await post('/api/pedidos/' + pid3 + '/comprar', { canal:'direto', numero_externo:'OC-3', comprado_em:'2026-11-02' }, AG);
  const CH3 = '43261112345678000199550010000012399000012399';
  db.prepare('UPDATE dfe_controle SET proxima_consulta=NULL WHERE id=1').run();
  fila = [ret('138', '000000000000005', '000000000000005', [['000000000000005', 'procNFe_v4.00.xsd', XML_METAL.replace(/43261112345678000199550010000012341000012345/g, CH3).replace('<nNF>1234</nNF>', '<nNF>1299</nNF>')]])];
  await DFE.consultar(db, { transporte });
  const d3 = db.prepare('SELECT * FROM dfe_documento WHERE chave=?').get(CH3);
  ok('com DOIS pedidos do fornecedor, fica "para escolher" (nunca adivinhado)', d3.situacao === 'escolher' && !d3.nota_compra_id, () => JSON.stringify(d3));
  r = await post('/api/dfe/' + d3.id + '/lancar', { pedido_id:pid2, escolhas:{ '1':db.prepare('SELECT id FROM pedido_item WHERE pedido_id=?').get(pid2).id, '2':false } }, AG);
  ok('escolhido na tela, lanca com origem dfe', r.status === 200 && db.prepare('SELECT situacao FROM dfe_documento WHERE id=?').get(d3.id).situacao === 'lancada', () => JSON.stringify(r.corpo));

  secao('sem documento novo: espera uma hora');
  db.prepare('UPDATE dfe_controle SET proxima_consulta=NULL WHERE id=1').run();
  /* intervalo de 5 min: o 137 tem que esperar a hora mesmo assim */
  db.prepare("INSERT INTO config (chave,valor) VALUES ('dfe_intervalo_min','5') ON CONFLICT(chave) DO UPDATE SET valor='5'").run();
  fila = [ret('137', '000000000000005', '000000000000005', [])];
  r = await DFE.consultar(db, { transporte });
  const ctl = DFE.controle(db);
  const espera = ctl.proxima_consulta ? (Date.parse(String(ctl.proxima_consulta).replace(' ', 'T')) - Date.now()) / 60000 : 0;
  ok('cStat 137: a proxima consulta fica para daqui a uma hora (ou mais)', espera >= 59, () => ctl.proxima_consulta);
  ok('o NSU continua o mesmo', ctl.ultimo_nsu === '000000000000005');
  fim();
})().catch(e => { console.error(e); process.exit(1); });

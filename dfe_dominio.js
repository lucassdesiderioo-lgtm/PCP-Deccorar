/* AS NOTAS BAIXADAS DA RECEITA — spec COMPRAS-E-RECEBIMENTO, fase 11
 * (R-CMP-53 a 56). Dono unico de: a consulta a distribuicao de DF-e do
 * Ambiente Nacional (o ultimo NSU lido, o intervalo, o limite da Receita), a
 * ciencia da operacao automatica e a nota completa entrando pelo leitor da
 * fase 8 (origem `dfe`).
 *
 * ⚠️ CONSTRUIDO SEM CERTIFICADO REAL (decisao do dono, 07/11/2026). O que fala
 * com a Receita passa por um TRANSPORTE trocavel: o de verdade (https com o
 * .pfx) e o dos testes (respostas gravadas no layout da Receita). A assinatura
 * da ciencia segue o XMLDSig da NF-e (C14N, RSA-SHA1) e e conferida pelo
 * proprio teste — NAO foi provada contra a Receita. A prova e o dono enviar o
 * .pfx e a primeira consulta trazer as notas.
 *
 * ⚠️ SO A CIENCIA E AUTOMATICA (R-CMP-54): ela nao confirma nem nega a compra, e
 * e o que a Receita exige para entregar o XML completo. As manifestacoes
 * conclusivas (confirmacao, desconhecimento, operacao nao realizada) ficam
 * fora.
 *
 * ⚠️ O QUE NAO CASA NAO E ADIVINHADO (R-CMP-55): a nota completa so se lanca
 * sozinha com UM pedido do emitente e todos os itens casando (fase 8); senao
 * fica "para escolher". Fornecedor sem pedido nenhum: "nota sem pedido" — e
 * aviso, porque alguem comprou por fora.
 */
const fs = require('fs'), path = require('path'), zlib = require('zlib'), crypto = require('crypto');
const CERT = require('./certificado_dominio');
const X = require('./nota_xml');
const CAMINHOS = require('./caminhos');

const URL_DIST = 'https://www1.nfe.fazenda.gov.br/NFeDistribuicaoDFe/NFeDistribuicaoDFe.asmx';
const URL_EVENTO = 'https://www.nfe.fazenda.gov.br/NFeRecepcaoEvento4/NFeRecepcaoEvento4.asmx';
const NS = 'http://www.portalfiscal.inf.br/nfe';

const valor = (x, tag) => { const m = String(x || '').match(new RegExp('<(?:\\w+:)?' + tag + '(?:\\s[^>]*)?>([\\s\\S]*?)</(?:\\w+:)?' + tag + '>')); return m ? m[1].trim() : null; };
function agora(){ const t = new Date(), z = n => String(n).padStart(2, '0'); return t.getFullYear() + '-' + z(t.getMonth() + 1) + '-' + z(t.getDate()) + ' ' + z(t.getHours()) + ':' + z(t.getMinutes()) + ':' + z(t.getSeconds()); }
function mais(min){ const t = new Date(Date.now() + min * 60000), z = n => String(n).padStart(2, '0'); return t.getFullYear() + '-' + z(t.getMonth() + 1) + '-' + z(t.getDate()) + ' ' + z(t.getHours()) + ':' + z(t.getMinutes()) + ':' + z(t.getSeconds()); }
function config(db, k, padrao){ const r = db.prepare('SELECT valor FROM config WHERE chave=?').get(k); return r && r.valor != null && r.valor !== '' ? r.valor : padrao; }

function controle(db){
  db.prepare('INSERT OR IGNORE INTO dfe_controle (id, ultimo_nsu) VALUES (1, ?)').run('000000000000000');
  return db.prepare('SELECT * FROM dfe_controle WHERE id=1').get();
}

/* ── O TRANSPORTE DE VERDADE: SOAP 1.2 com o .pfx (TLS mutuo) ─────────── */
function transporteReal(cert, url, corpo){
  const https = require('https');
  return new Promise((ok, falha) => {
    const u = new URL(url);
    const req = https.request({ host:u.hostname, path:u.pathname, method:'POST', pfx:cert.pfx, passphrase:cert.senha, timeout:60000,
      headers:{ 'Content-Type':'application/soap+xml; charset=utf-8', 'Content-Length':Buffer.byteLength(corpo) } }, res => {
      let d = ''; res.setEncoding('utf8'); res.on('data', c => d += c); res.on('end', () => ok(d));
    });
    req.on('timeout', () => req.destroy(new Error('a Receita não respondeu em 60 s')));
    req.on('error', falha); req.end(corpo);
  });
}

function envelopeDist(cnpj, cuf, ultNSU){
  return '<?xml version="1.0" encoding="utf-8"?><soap12:Envelope xmlns:soap12="http://www.w3.org/2003/05/soap-envelope"><soap12:Body>'
    + '<nfeDistDFeInteresse xmlns="http://www.portalfiscal.inf.br/nfe/wsdl/NFeDistribuicaoDFe"><nfeDadosMsg>'
    + '<distDFeInt xmlns="' + NS + '" versao="1.01"><tpAmb>1</tpAmb><cUFAutor>' + cuf + '</cUFAutor><CNPJ>' + cnpj + '</CNPJ>'
    + '<distNSU><ultNSU>' + String(ultNSU).padStart(15, '0') + '</ultNSU></distNSU></distDFeInt></nfeDadosMsg></nfeDistDFeInteresse></soap12:Body></soap12:Envelope>';
}

/* ── A ASSINATURA DA CIENCIA (XMLDSig da NF-e: C14N inclusivo, RSA-SHA1) ─────
   O infEvento e escrito ja na forma canonica (sem espacos, um atributo), e o
   namespace do pai entra nele, como a C14N inclusiva manda. */
function assinarEvento(infEvento, id, chavePem, certB64){
  const canon = infEvento.replace('<infEvento ', '<infEvento xmlns="' + NS + '" ');
  const digest = crypto.createHash('sha1').update(canon, 'utf8').digest('base64');
  const si = '<SignedInfo xmlns="http://www.w3.org/2000/09/xmldsig#"><CanonicalizationMethod Algorithm="http://www.w3.org/TR/2001/REC-xml-c14n-20010315"></CanonicalizationMethod>'
    + '<SignatureMethod Algorithm="http://www.w3.org/2000/09/xmldsig#rsa-sha1"></SignatureMethod><Reference URI="#' + id + '"><Transforms>'
    + '<Transform Algorithm="http://www.w3.org/2000/09/xmldsig#enveloped-signature"></Transform><Transform Algorithm="http://www.w3.org/TR/2001/REC-xml-c14n-20010315"></Transform>'
    + '</Transforms><DigestMethod Algorithm="http://www.w3.org/2000/09/xmldsig#sha1"></DigestMethod><DigestValue>' + digest + '</DigestValue></Reference></SignedInfo>';
  const sig = crypto.createSign('RSA-SHA1').update(si, 'utf8').sign(chavePem, 'base64');
  return '<Signature xmlns="http://www.w3.org/2000/09/xmldsig#">' + si.replace(' xmlns="http://www.w3.org/2000/09/xmldsig#"', '')
    + '<SignatureValue>' + sig + '</SignatureValue><KeyInfo><X509Data><X509Certificate>' + certB64 + '</X509Certificate></X509Data></KeyInfo></Signature>';
}
function envelopeCiencia(cnpj, chave, chavePem, certB64){
  const id = 'ID210210' + chave + '01';
  const dh = new Date().toISOString().replace(/\.\d{3}Z$/, '-00:00');
  const inf = '<infEvento Id="' + id + '"><cOrgao>91</cOrgao><tpAmb>1</tpAmb><CNPJ>' + cnpj + '</CNPJ><chNFe>' + chave + '</chNFe><dhEvento>' + dh + '</dhEvento>'
    + '<tpEvento>210210</tpEvento><nSeqEvento>1</nSeqEvento><verEvento>1.00</verEvento><detEvento versao="1.00"><descEvento>Ciencia da Operacao</descEvento></detEvento></infEvento>';
  const evento = '<evento xmlns="' + NS + '" versao="1.00">' + inf + assinarEvento(inf, id, chavePem, certB64) + '</evento>';
  return { id, xml: '<?xml version="1.0" encoding="utf-8"?><soap12:Envelope xmlns:soap12="http://www.w3.org/2003/05/soap-envelope"><soap12:Body>'
    + '<nfeDadosMsg xmlns="http://www.portalfiscal.inf.br/nfe/wsdl/NFeRecepcaoEvento4"><envEvento xmlns="' + NS + '" versao="1.00"><idLote>' + Date.now() % 1e15 + '</idLote>'
    + evento + '</envEvento></nfeDadosMsg></soap12:Body></soap12:Envelope>' };
}

/* ── CONSULTAR ─────────────────────────────────────────────────────────── */
async function consultar(db, opcoes){
  opcoes = opcoes || {};
  const transporte = opcoes.transporte || transporteReal;
  const est = CERT.estado(db);
  if(!est.tem) return { consultou:false, motivo:'nenhum certificado enviado' };
  if(est.vencido) return { consultou:false, motivo:'o certificado venceu em ' + est.validade + ': a busca parou. Envie o certificado novo em Compras → Certificado.' };
  const cuf = config(db, 'uf_codigo', null);
  if(!cuf) return { consultou:false, motivo:'falta o código da UF da Deccorar (Compras → Certificado)' };
  const cert = CERT.carregar(db);
  if(!cert) return { consultou:false, motivo:'o arquivo do certificado não está no servidor: envie de novo' };
  const ctl = controle(db);
  let resp;
  try{ resp = await transporte(cert, URL_DIST, envelopeDist(cert.cnpj, cuf, ctl.ultimo_nsu)); }
  catch(e){
    db.prepare('UPDATE dfe_controle SET ultima_consulta=?, proxima_consulta=?, ultimo_erro=? WHERE id=1').run(agora(), mais(+config(db, 'dfe_intervalo_min', 60)), 'a Receita não respondeu: ' + e.message);
    return { consultou:false, motivo:'a Receita não respondeu: ' + e.message };
  }
  const cStat = valor(resp, 'cStat'), xMotivo = valor(resp, 'xMotivo');
  const ult = valor(resp, 'ultNSU'), max = valor(resp, 'maxNSU');
  const intervalo = +config(db, 'dfe_intervalo_min', 60);
  const docs = [];
  const re = /<(?:\w+:)?docZip\s+NSU="(\d+)"\s+schema="([^"]+)"\s*>([^<]+)<\/(?:\w+:)?docZip>/g; let m;
  while((m = re.exec(resp))) docs.push({ nsu:m[1], schema:m[2], xml:zlib.gunzipSync(Buffer.from(m[3].trim(), 'base64')).toString('utf8') });
  /* O LIMITE DA RECEITA: sem documento novo (137) ou consumo indevido (656),
     espera-se uma hora antes de perguntar de novo. Com mais a ler, volta logo. */
  let prox;
  if(cStat === '138' && ult && max && ult < max) prox = mais(2);
  else if(cStat === '137' || cStat === '656') prox = mais(Math.max(60, intervalo));
  else prox = mais(intervalo);
  db.prepare('UPDATE dfe_controle SET ultimo_nsu=COALESCE(?, ultimo_nsu), ultima_consulta=?, proxima_consulta=?, ultimo_erro=? WHERE id=1')
    .run(ult || null, agora(), prox, (cStat === '137' || cStat === '138') ? null : (cStat + ' ' + (xMotivo || '')));
  const r = { consultou:true, cStat, xMotivo, documentos:0, ciencias:0, lancadas:0 };
  for(const d of docs){ const x = await guardar(db, d, cert, transporte, opcoes); r.documentos++; if(x.ciencia) r.ciencias++; if(x.lancada) r.lancadas++; }
  return r;
}

async function guardar(db, d, cert, transporte, opcoes){
  const out = {};
  if(/^resNFe/.test(d.schema)){
    const chave = valor(d.xml, 'chNFe');
    db.prepare(`INSERT OR IGNORE INTO dfe_documento (nsu, chave, tipo, emitente_cnpj, emitente_nome, valor, emissao, situacao)
      VALUES (?,?,?,?,?,?,?, 'aguardando_xml')`).run(d.nsu, chave, 'resumo', valor(d.xml, 'CNPJ'), valor(d.xml, 'xNome'), +valor(d.xml, 'vNF') || null, String(valor(d.xml, 'dhEmi') || '').slice(0, 10));
    const doc = db.prepare('SELECT * FROM dfe_documento WHERE chave=? ORDER BY id LIMIT 1').get(chave);
    if(doc && !doc.ciencia_em) out.ciencia = await ciencia(db, doc, cert, transporte, opcoes);
  }else if(/^procNFe/.test(d.schema)){
    const nota = X.ler(d.xml);
    const pasta = path.join(CAMINHOS.ANEXOS_COMPRAS, 'dfe');
    fs.mkdirSync(pasta, { recursive:true });
    fs.writeFileSync(path.join(pasta, nota.chave + '.xml'), d.xml);
    const ja = db.prepare('SELECT * FROM dfe_documento WHERE chave=? ORDER BY id LIMIT 1').get(nota.chave);
    if(ja) db.prepare("UPDATE dfe_documento SET tipo='completa', xml=?, nsu_xml=?, emitente_cnpj=COALESCE(emitente_cnpj,?), emitente_nome=COALESCE(emitente_nome,?), valor=COALESCE(valor,?), emissao=COALESCE(emissao,?) WHERE id=?")
      .run(nota.chave + '.xml', d.nsu, nota.emitente_cnpj, nota.emitente_nome, nota.total_nota, nota.emissao, ja.id);
    else db.prepare("INSERT INTO dfe_documento (nsu, chave, tipo, emitente_cnpj, emitente_nome, valor, emissao, xml, situacao) VALUES (?,?, 'completa', ?,?,?,?,?, 'aguardando_xml')")
      .run(d.nsu, nota.chave, nota.emitente_cnpj, nota.emitente_nome, nota.total_nota, nota.emissao, nota.chave + '.xml');
    out.lancada = ligar(db, nota.chave);
  }else{
    db.prepare("INSERT OR IGNORE INTO dfe_documento (nsu, chave, tipo, situacao) VALUES (?,?, 'evento', 'evento')").run(d.nsu, valor(d.xml, 'chNFe'));
  }
  return out;
}

async function ciencia(db, doc, cert, transporte){
  const pem = CERT.chavePrivada(cert);
  if(!pem){ db.prepare("UPDATE dfe_documento SET ciencia_erro=? WHERE id=?").run('não consegui assinar: o openssl do servidor não abriu a chave do certificado', doc.id); return false; }
  const env = envelopeCiencia(cert.cnpj, doc.chave, pem, CERT.certificadoPem(cert));
  let resp;
  try{ resp = await transporte(cert, URL_EVENTO, env.xml); }
  catch(e){ db.prepare('UPDATE dfe_documento SET ciencia_erro=? WHERE id=?').run('a Receita não respondeu: ' + e.message, doc.id); return false; }
  /* 135/136 = registrado; 573 = ja havia ciencia (duplicidade) — os tres valem */
  const cs = (String(resp).match(/<(?:\w+:)?retEvento[\s\S]*?<(?:\w+:)?cStat>(\d+)</) || [])[1];
  if(['135', '136', '573'].indexOf(cs) >= 0){ db.prepare("UPDATE dfe_documento SET ciencia_em=?, ciencia_erro=NULL WHERE id=?").run(agora(), doc.id); return true; }
  db.prepare('UPDATE dfe_documento SET ciencia_erro=? WHERE id=?').run('a Receita recusou a ciência: ' + (cs || '?') + ' ' + (valor(resp, 'xMotivo') || ''), doc.id);
  return false;
}

/* A nota completa vira a nota da fase 8, sem adivinhar (R-CMP-55). */
function ligar(db, chave){
  const doc = db.prepare('SELECT * FROM dfe_documento WHERE chave=? AND xml IS NOT NULL ORDER BY id LIMIT 1').get(chave);
  if(!doc || doc.nota_compra_id) return false;
  const xml = fs.readFileSync(path.join(CAMINHOS.ANEXOS_COMPRAS, 'dfe', path.basename(doc.xml)), 'utf8');
  const nota = X.ler(xml);
  const peds = X.pedidosDoEmitente(db, nota.emitente_cnpj);
  if(!peds.length){ db.prepare("UPDATE dfe_documento SET situacao='sem_pedido' WHERE id=?").run(doc.id); return false; }
  if(peds.length === 1){
    const c = X.casar(db, peds[0].id, nota);
    if(c.every(x => x.pedido_item_id)){
      try{
        const r = X.lancar(db, { xml, pedido_id:peds[0].id, origem:'dfe' }, { nome:'busca automática da Receita' });
        db.prepare("UPDATE dfe_documento SET situacao='lancada', nota_compra_id=? WHERE id=?").run(r.id, doc.id);
        return true;
      }catch(e){ /* cai para escolher */ }
    }
  }
  db.prepare("UPDATE dfe_documento SET situacao='escolher' WHERE id=?").run(doc.id);
  return false;
}
/* Lancar pela tela a que ficou para escolher (as escolhas da fase 8). */
function lancarEscolhida(db, id, b, quem){
  const doc = db.prepare('SELECT * FROM dfe_documento WHERE id=?').get(+id);
  if(!doc || !doc.xml) throw new X.Recusa(404, 'nota da Receita não encontrada (ou sem o XML completo ainda)');
  if(doc.nota_compra_id) throw new X.Recusa(409, 'esta nota já foi lançada');
  const xml = fs.readFileSync(path.join(CAMINHOS.ANEXOS_COMPRAS, 'dfe', path.basename(doc.xml)), 'utf8');
  const r = X.lancar(db, { xml, pedido_id:b.pedido_id, escolhas:b.escolhas, origem:'dfe' }, quem);
  db.prepare("UPDATE dfe_documento SET situacao='lancada', nota_compra_id=? WHERE id=?").run(r.id, doc.id);
  return r;
}
function listar(db){
  return db.prepare('SELECT id, nsu, chave, tipo, emitente_cnpj, emitente_nome, valor, emissao, ciencia_em, ciencia_erro, situacao, nota_compra_id, criado_em FROM dfe_documento WHERE tipo<>\'evento\' ORDER BY id DESC LIMIT 300').all();
}
function lerXml(db, id){
  const doc = db.prepare('SELECT * FROM dfe_documento WHERE id=?').get(+id);
  if(!doc || !doc.xml) return null;
  return fs.readFileSync(path.join(CAMINHOS.ANEXOS_COMPRAS, 'dfe', path.basename(doc.xml)), 'utf8');
}
function pendencias(db){
  const n = db.prepare("SELECT COUNT(*) n, MIN(criado_em) d FROM dfe_documento WHERE situacao='sem_pedido'").get();
  return { n:n.n, desde:n.d };
}
/* O RELOGIO: de tempos em tempos (o agendador do dfe_route chama), consulta
   se ha certificado valido e ja passou da proxima consulta. */
async function talvezConsultar(db, opcoes){
  const e = CERT.estado(db);
  if(!e.tem || e.vencido) return null;
  const ctl = controle(db);
  if(ctl.proxima_consulta && ctl.proxima_consulta > agora()) return null;
  return consultar(db, opcoes);
}

module.exports = { consultar, talvezConsultar, guardar, ligar, lancarEscolhida, listar, lerXml, pendencias, controle, assinarEvento, envelopeCiencia, envelopeDist, URL_DIST, URL_EVENTO };

/* O CERTIFICADO DIGITAL DA DECCORAR — spec COMPRAS-E-RECEBIMENTO, fase 11
 * (R-CMP-51, R-CMP-52, R-CMP-56).
 *
 * ⚠️ O CERTIFICADO ENTRA PELA TELA, NUNCA PELO REPOSITORIO. O `.pfx` e gravado
 * em `caminhos.CERTIFICADO` (fora do repositorio, de lotes/ e dos backups
 * comuns), com permissao so do usuario do servidor (0600). A senha e guardada
 * CIFRADA (AES-256-GCM) com uma chave propria do servidor, num arquivo a parte
 * (`.chave`, criado na primeira vez, como o `.session_secret`) — nunca em texto
 * no banco, nunca no log, nunca no JSON. O arquivo NUNCA se baixa: nao ha rota
 * que o entregue.
 *
 * ⚠️ SEM CERTIFICADO, TUDO FUNCIONA (R-CMP-56): `estado` diz "nenhum
 * certificado enviado", e a busca da Receita simplesmente nao roda.
 *
 * Abrir o `.pfx` e conferir a senha e o proprio Node (tls.createSecureContext):
 * senha errada e recusada na hora. A chave privada so sai do `.pfx` para
 * ASSINAR a ciencia da operacao, em memoria, pelo `openssl` do servidor
 * (`chavePrivada`) — o Node nao le PKCS#12 sozinho.
 */
const fs = require('fs'), path = require('path'), crypto = require('crypto'), tls = require('tls');
const { spawnSync } = require('child_process');
const CAMINHOS = require('./caminhos');

class Recusa extends Error{ constructor(status, msg){ super(msg); this.status = status; } }
const pasta = () => CAMINHOS.CERTIFICADO;
const ARQ_CHAVE = () => path.join(pasta(), '.chave');

function chaveDeCifra(){
  fs.mkdirSync(pasta(), { recursive:true, mode:0o700 });
  if(!fs.existsSync(ARQ_CHAVE())) fs.writeFileSync(ARQ_CHAVE(), crypto.randomBytes(32), { mode:0o600 });
  return fs.readFileSync(ARQ_CHAVE());
}
function cifrar(texto){
  const iv = crypto.randomBytes(12), c = crypto.createCipheriv('aes-256-gcm', chaveDeCifra(), iv);
  const enc = Buffer.concat([c.update(String(texto), 'utf8'), c.final()]);
  return 'v1:' + iv.toString('base64') + ':' + c.getAuthTag().toString('base64') + ':' + enc.toString('base64');
}
function decifrar(s){
  const [v, iv, tag, enc] = String(s || '').split(':');
  if(v !== 'v1') throw new Error('senha cifrada em formato desconhecido');
  const d = crypto.createDecipheriv('aes-256-gcm', chaveDeCifra(), Buffer.from(iv, 'base64'));
  d.setAuthTag(Buffer.from(tag, 'base64'));
  return Buffer.concat([d.update(Buffer.from(enc, 'base64')), d.final()]).toString('utf8');
}

/* Abre o .pfx com a senha (o Node confere) e le o certificado: titular, CNPJ e
   validade. O CNPJ do e-CNPJ da ICP-Brasil vem no fim do CN ("NOME:CNPJ"); na
   falta, procura-se 14 digitos no titular. */
function abrir(pfx, senha){
  let ctx;
  try{ ctx = tls.createSecureContext({ pfx, passphrase:senha }); }
  catch(e){
    if(/mac verify|password|decrypt|bad decrypt/i.test(e.message)) throw new Recusa(400, 'a senha não abre este certificado');
    throw new Recusa(400, 'este arquivo não é um certificado .pfx válido (' + e.message + ')');
  }
  const s = new tls.TLSSocket(null, { secureContext:ctx });
  const c = s.getCertificate();
  try{ s.destroy(); }catch(e){}
  if(!c || !c.subject) throw new Recusa(400, 'não achei o certificado dentro do .pfx');
  const cn = String(c.subject.CN || '');
  const m = cn.match(/:(\d{14})\s*$/) || JSON.stringify(c.subject).match(/(\d{14})/);
  const validade = new Date(c.valid_to);
  return { titular: cn.replace(/:\d{14}\s*$/, '') || cn, cnpj: m ? m[1] : null, validade: isNaN(validade) ? null : validade.toISOString().slice(0, 10) };
}

function cnpjDaEmpresa(db){
  const r = db.prepare("SELECT valor FROM config WHERE chave='cnpj'").get();
  return r && r.valor ? String(r.valor).replace(/\D/g, '') : null;
}
function definirCnpj(db, v){
  const d = String(v || '').replace(/\D/g, '');
  if(d.length !== 14) throw new Recusa(400, 'o CNPJ tem 14 dígitos');
  db.prepare("INSERT INTO config (chave,valor) VALUES ('cnpj',?) ON CONFLICT(chave) DO UPDATE SET valor=excluded.valor").run(d);
  return { cnpj:d };
}

function receber(db, b, quem){
  const senha = String(b.senha == null ? '' : b.senha);
  if(!senha) throw new Recusa(400, 'digite a senha do certificado');
  let pfx;
  try{ pfx = Buffer.from(String(b.base64 || '').replace(/^data:[^,]*,/, ''), 'base64'); }catch(e){ pfx = null; }
  if(!pfx || !pfx.length) throw new Recusa(400, 'escolha o arquivo .pfx');
  if(pfx.length > 50 * 1024) throw new Recusa(400, 'arquivo grande demais para um certificado A1');
  const info = abrir(pfx, senha);
  const empresa = cnpjDaEmpresa(db);
  if(!empresa) throw new Recusa(400, 'cadastre antes o CNPJ da Deccorar (campo logo acima): é por ele que o certificado é conferido');
  if(info.cnpj !== empresa) throw new Recusa(400, 'este certificado é do CNPJ ' + (info.cnpj || '(não achei o CNPJ)') + ', e o da Deccorar é ' + empresa);
  if(info.validade && info.validade < new Date().toISOString().slice(0, 10)) throw new Recusa(400, 'este certificado venceu em ' + info.validade);
  const arq = 'certificado-' + Date.now() + '.pfx';
  fs.mkdirSync(pasta(), { recursive:true, mode:0o700 });
  /* O NOVO PRIMEIRO, O VELHO SO DEPOIS (revisao do PR #305): o arquivo novo e
     gravado antes, o banco troca numa transacao, e so com ela feita o arquivo
     de antes e apagado. A troca que falha no meio deixa o que valia de pe. */
  const antigos = db.prepare('SELECT arquivo FROM certificado WHERE ativo=1').all();
  fs.writeFileSync(path.join(pasta(), arq), pfx, { mode:0o600 });
  try{
    db.transaction(() => {
      db.prepare('UPDATE certificado SET ativo=0 WHERE ativo=1').run();
      db.prepare(`INSERT INTO certificado (cnpj, titular, validade, arquivo, senha_cifrada, enviado_por, enviado_por_id, ativo)
        VALUES (?,?,?,?,?,?,?,1)`).run(info.cnpj, info.titular, info.validade, arq, cifrar(senha), quem && quem.nome || null, quem && quem.id || null);
    })();
  }catch(e){
    try{ fs.unlinkSync(path.join(pasta(), arq)); }catch(x){}
    throw e;
  }
  for(const v of antigos) try{ fs.unlinkSync(path.join(pasta(), path.basename(v.arquivo))); }catch(e){}
  /* a busca recomeca do ultimo NSU lido (se houver), sem esperar */
  try{ db.prepare("UPDATE dfe_controle SET proxima_consulta=NULL, ultimo_erro=NULL WHERE id=1").run(); }catch(e){}
  return estado(db);
}
function remover(db){
  for(const v of db.prepare('SELECT arquivo FROM certificado WHERE ativo=1').all())
    try{ fs.unlinkSync(path.join(pasta(), path.basename(v.arquivo))); }catch(e){}
  db.prepare("UPDATE certificado SET ativo=0, removido_em=datetime('now','localtime') WHERE ativo=1").run();
  return estado(db);
}
/* O que a TELA recebe: nunca a senha, nunca o caminho do arquivo. */
function estado(db){
  const empresa = cnpjDaEmpresa(db);
  const c = db.prepare('SELECT cnpj, titular, validade, enviado_por, enviado_em FROM certificado WHERE ativo=1 ORDER BY id DESC LIMIT 1').get();
  if(!c) return { tem:false, mensagem:'nenhum certificado enviado', cnpj_empresa:empresa, falta_cnpj:!empresa };
  const dias = c.validade ? Math.floor((Date.parse(c.validade + 'T23:59:59') - Date.now()) / 86400000) : null;
  return { tem:true, cnpj:c.cnpj, titular:c.titular, validade:c.validade, dias, vencido: dias != null && dias < 0, vencendo: dias != null && dias >= 0 && dias < 30,
    enviado_por:c.enviado_por, enviado_em:c.enviado_em, cnpj_empresa:empresa, falta_cnpj:!empresa };
}
/* Para a busca: o .pfx e a senha (so dentro do servidor). */
function carregar(db){
  const c = db.prepare('SELECT * FROM certificado WHERE ativo=1 ORDER BY id DESC LIMIT 1').get();
  if(!c) return null;
  const f = path.join(pasta(), path.basename(c.arquivo));
  if(!fs.existsSync(f)) return null;
  return { pfx:fs.readFileSync(f), senha:decifrar(c.senha_cifrada), cnpj:c.cnpj, validade:c.validade };
}
/* A chave privada em PEM, so na memoria, para assinar a ciencia. Pelo openssl
   do servidor (o Node nao abre PKCS#12). O certificado A1 da ICP-Brasil costuma
   vir com cifra antiga: tenta com e sem -legacy. Sem openssl: null, e a
   ciencia fica para depois, dizendo por que. */
function chavePrivada(cert){
  const env = Object.assign({}, process.env, { PCP_PFX_SENHA:cert.senha });
  const tmp = path.join(pasta(), '.tmp-' + crypto.randomBytes(6).toString('hex') + '.pfx');
  fs.writeFileSync(tmp, cert.pfx, { mode:0o600 });
  try{
    for(const extra of [[], ['-legacy']]){
      const r = spawnSync('openssl', ['pkcs12', '-in', tmp, '-nocerts', '-nodes', '-passin', 'env:PCP_PFX_SENHA'].concat(extra), { env, encoding:'utf8' });
      if(r.status === 0 && /PRIVATE KEY/.test(r.stdout || '')) return (r.stdout.match(/-----BEGIN (?:RSA )?PRIVATE KEY-----[\s\S]+?-----END (?:RSA )?PRIVATE KEY-----/) || [])[0] || null;
      if(r.error) return null;
    }
    return null;
  }finally{ try{ fs.unlinkSync(tmp); }catch(e){} }
}
function certificadoPem(cert){
  const ctx = tls.createSecureContext({ pfx:cert.pfx, passphrase:cert.senha });
  const s = new tls.TLSSocket(null, { secureContext:ctx });
  const c = s.getCertificate(); try{ s.destroy(); }catch(e){}
  return c && c.raw ? c.raw.toString('base64') : null;
}
function pendencias(db){
  const e = estado(db);
  return { n: e.tem && (e.vencido || e.vencendo) ? 1 : 0, desde:null };
}

module.exports = { Recusa, abrir, receber, remover, estado, carregar, chavePrivada, certificadoPem, cifrar, decifrar, cnpjDaEmpresa, definirCnpj, pendencias };

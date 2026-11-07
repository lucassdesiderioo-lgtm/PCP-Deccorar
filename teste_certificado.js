#!/usr/bin/env node
/* FASE 11 da spec COMPRAS-E-RECEBIMENTO — o certificado (R-CMP-51, 52, 56).
 *
 *   node teste_certificado.js
 *
 * ⚠️ ESCRITO ANTES DO CODIGO e conferido reintroduzindo cada defeito. Usa um
 * CERTIFICADO DE TESTE gerado na hora pelo `openssl` (nenhum certificado real
 * existe no repositorio). Trava: senha errada recusada; a senha nunca no JSON,
 * nunca no log, nunca em texto no banco; o arquivo nunca baixavel; CNPJ
 * diferente recusado; sem CNPJ da empresa, a falta aparece; a validade (tarja
 * de 30 dias, vencido); so o Admin Geral; sem certificado, nada quebra.
 */
const fs = require('fs'), path = require('path'), os = require('os');
const { spawnSync } = require('child_process');
if(spawnSync('openssl', ['version']).status !== 0){ console.log('PULADO: sem openssl para gerar o certificado de teste'); process.exit(0); }
const dirC = fs.mkdtempSync(path.join(os.tmpdir(), 'cert-'));
function gerar(nome, cn, dias, senha){
  spawnSync('openssl', ['req', '-x509', '-newkey', 'rsa:2048', '-keyout', path.join(dirC, nome + '.key'), '-out', path.join(dirC, nome + '.crt'), '-days', String(dias), '-nodes', '-subj', '/C=BR/O=ICP-Brasil/CN=' + cn]);
  spawnSync('openssl', ['pkcs12', '-export', '-out', path.join(dirC, nome + '.pfx'), '-inkey', path.join(dirC, nome + '.key'), '-in', path.join(dirC, nome + '.crt'), '-passout', 'pass:' + senha]);
  return fs.readFileSync(path.join(dirC, nome + '.pfx')).toString('base64');
}
const SENHA = 'Senha-Muito-Secreta-123';
const BOM = gerar('bom', 'DECCORAR LTDA:98765432000110', 365, SENHA);
const PERTO = gerar('perto', 'DECCORAR LTDA:98765432000110', 10, SENHA);
const OUTRO = gerar('outro', 'OUTRA EMPRESA:11111111000111', 365, SENHA);

/* tudo o que o processo escreve no console, para conferir que a senha nao sai */
const logs = []; const orig = console.log, origE = console.error;
console.log = function(){ logs.push([].join.call(arguments, ' ')); return orig.apply(console, arguments); };
console.error = function(){ logs.push([].join.call(arguments, ' ')); return origE.apply(console, arguments); };

process.env.PCP_DFE_AUTOMATICO = '0';
const { bancada, MODULOS } = require('./util_teste_compras');
const B = bancada({ modulos: MODULOS.concat(['material_route', 'compra_route', 'recebimento_route', 'nota_route', 'dfe_route']) });
const { db, get, post, del, ok, fim, secao } = B;
const AG = { id:1, nome:'Lucas', admin_geral:true, permissoes:['alcada.definir','certificado.gerenciar'] };
const CAMINHOS = require('./caminhos');

(async () => {
  secao('sem certificado, tudo funciona (R-CMP-56)');
  let e = (await get('/api/certificado', AG)).corpo;
  ok('a tela diz "nenhum certificado enviado"', e.tem === false && /nenhum certificado/.test(e.mensagem));
  ok('e a falta do CNPJ da empresa aparece', e.falta_cnpj === true);
  const DFE = require('./dfe_dominio');
  const c0 = await DFE.consultar(db, { transporte:() => { throw new Error('nao devia chamar'); } });
  ok('a busca da Receita nao roda, e diz por que', c0.consultou === false && /nenhum certificado/.test(c0.motivo));

  secao('o envio (R-CMP-51)');
  let r = await post('/api/certificado', { base64:BOM, senha:SENHA }, AG);
  ok('sem o CNPJ da Deccorar cadastrado, recusa dizendo isso', r.status === 400 && /CNPJ da Deccorar/.test(r.corpo.erro), () => JSON.stringify(r.corpo));
  r = await post('/api/certificado/dados', { cnpj:'98.765.432/0001-10', uf_codigo:'43' }, AG);
  ok('cadastra o CNPJ e a UF', r.status === 200);
  r = await post('/api/certificado', { base64:BOM, senha:'errada' }, AG);
  ok('senha errada e recusada na hora', r.status === 400 && /senha/.test(r.corpo.erro), () => JSON.stringify(r.corpo));
  r = await post('/api/certificado', { base64:Buffer.from('nada').toString('base64'), senha:SENHA }, AG);
  ok('arquivo que nao e .pfx e recusado', r.status === 400);
  r = await post('/api/certificado', { base64:OUTRO, senha:SENHA }, AG);
  ok('certificado de OUTRO CNPJ e recusado', r.status === 400 && /11111111000111/.test(r.corpo.erro));
  r = await post('/api/certificado', { base64:BOM, senha:SENHA }, { id:9, nome:'Admin', permissoes:['compras.ver'] });
  ok('quem nao e Admin Geral nao envia', r.status === 403, () => JSON.stringify(r));
  r = await post('/api/certificado', { base64:BOM, senha:SENHA }, null);
  ok('sem login nada grava (401)', r.status === 401);
  r = await post('/api/certificado', { base64:BOM, senha:SENHA }, AG);
  ok('o certificado certo entra', r.status === 200 && r.corpo.tem === true, () => JSON.stringify(r.corpo));
  ok('e a tela recebe CNPJ, titular e validade', r.corpo.cnpj === '98765432000110' && /DECCORAR/.test(r.corpo.titular) && /^\d{4}-\d{2}-\d{2}$/.test(r.corpo.validade));

  secao('a senha nunca vaza');
  const tudo = JSON.stringify((await get('/api/certificado', AG)).corpo) + JSON.stringify(r.corpo);
  ok('a senha NAO esta no JSON', tudo.indexOf(SENHA) < 0 && !/senha_cifrada|arquivo/.test(tudo), () => tudo);
  const linha = db.prepare('SELECT * FROM certificado WHERE ativo=1').get();
  ok('no banco, a senha esta CIFRADA (nunca em texto)', linha.senha_cifrada && linha.senha_cifrada.indexOf(SENHA) < 0 && /^v1:/.test(linha.senha_cifrada));
  ok('e a chave de cifra mora num arquivo a parte, so do servidor (0600)', (fs.statSync(path.join(CAMINHOS.CERTIFICADO, '.chave')).mode & 0o077) === 0);
  ok('a senha NAO apareceu no log', logs.every(l => l.indexOf(SENHA) < 0));
  ok('a decifra devolve a senha (para a busca)', require('./certificado_dominio').carregar(db).senha === SENHA);

  secao('o arquivo nunca e baixavel');
  const arq = path.join(CAMINHOS.CERTIFICADO, linha.arquivo);
  ok('o .pfx esta na pasta do certificado, so do servidor (0600)', fs.existsSync(arq) && (fs.statSync(arq).mode & 0o077) === 0);
  ok('a pasta do certificado nao esta dentro de lotes/ nem de backups/', CAMINHOS.CERTIFICADO.indexOf(CAMINHOS.LOTES) !== 0 && CAMINHOS.CERTIFICADO.indexOf(CAMINHOS.BACKUPS) !== 0);
  const rotas = [];
  (B.app.router || B.app._router).stack.forEach(l => { if(l.route) rotas.push(Object.keys(l.route.methods).join(',') + ' ' + l.route.path); });
  ok('nenhuma rota GET entrega o certificado', !rotas.some(x => /^get/i.test(x) && /certificado\/|pfx|baixar/i.test(x)), () => rotas.filter(x => /certific/.test(x)).join(' · '));
  const g = await B.chamar('GET', '/api/certificado/arquivo', undefined, AG);
  ok('pedir o arquivo da 404', g.status === 404);
  ok('o .gitignore tem a pasta do certificado', /^certificado\/$/m.test(fs.readFileSync(path.join(__dirname, '.gitignore'), 'utf8')));

  secao('revisao do PR #305: a troca que falha nao apaga o certificado que valia');
  db.exec("CREATE TRIGGER t_falha BEFORE INSERT ON certificado BEGIN SELECT RAISE(ABORT, 'disco cheio de mentira'); END");
  let erroT = null;
  try{ r = await post('/api/certificado', { base64:PERTO, senha:SENHA }, AG); }catch(x){ erroT = x; }
  ok('a troca falhou', erroT || r.status >= 400);
  ok('e o arquivo do certificado que valia continua la', fs.existsSync(arq));
  ok('e ele continua o ativo', db.prepare('SELECT arquivo FROM certificado WHERE ativo=1').get().arquivo === linha.arquivo);
  ok('sem arquivo novo largado na pasta', fs.readdirSync(CAMINHOS.CERTIFICADO).filter(f => /\.pfx$/.test(f)).length === 1, () => fs.readdirSync(CAMINHOS.CERTIFICADO).join(','));
  db.exec('DROP TRIGGER t_falha');

  secao('a validade (R-CMP-52)');
  r = await post('/api/certificado', { base64:PERTO, senha:SENHA }, AG);
  ok('trocar o certificado: o novo vale, o anterior sai (e o arquivo dele some)', r.status === 200 && db.prepare('SELECT COUNT(*) n FROM certificado WHERE ativo=1').get().n === 1 && !fs.existsSync(arq));
  ok('vencendo em menos de 30 dias: tarja (vencendo)', r.corpo.vencendo === true && r.corpo.dias <= 10, () => JSON.stringify(r.corpo));
  const L = require('./pendencias_dominio').LINHAS.find(l => l.chave === 'certificado');
  ok('e a central de Pendencias conta', L && L.contar(db).n === 1);
  db.prepare("UPDATE certificado SET validade='2026-01-01' WHERE ativo=1").run();
  e = (await get('/api/certificado', AG)).corpo;
  ok('vencido: a tela diz', e.vencido === true);
  const c1 = await DFE.consultar(db, { transporte:() => { throw new Error('nao devia chamar'); } });
  ok('vencido: a busca para e diz por que', c1.consultou === false && /venceu/.test(c1.motivo));

  secao('remover');
  r = await del('/api/certificado', AG);
  ok('remove: some o arquivo e a tela volta a "nenhum certificado"', r.status === 200 && r.corpo.tem === false && fs.readdirSync(CAMINHOS.CERTIFICADO).filter(f => /\.pfx$/.test(f)).length === 0);
  console.log = orig; console.error = origE;
  fim();
})().catch(e => { console.log = orig; console.error(e); process.exit(1); });

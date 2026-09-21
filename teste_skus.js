#!/usr/bin/env node
/* teste_skus.js — o cadastro de SKU e o SALDO que ele nao pode apagar.
 *
 *   node teste_skus.js
 *
 * O QUE ORIGINOU ESTES TESTES (divida 15 do §14, fechada em 17/09/2026):
 *
 *  1. O CAMPO QUE SOME. O corpo do POST /api/skus tinha `estoque=0` e `alvo=0`
 *     como PADRAO, e o upsert gravava `excluded.estoque`. Uma chamada que so
 *     mandasse codigo e descricao APAGAVA O SALDO — sem erro, sem log, sem
 *     motivo e sem linha em `ajuste_estoque`, que e o unico lugar onde um
 *     ajuste de saldo deixa rastro (§18). A tela do admin reenvia os valores
 *     (index.html) e por isso nunca caiu nisso; a API caiu.
 *     Campo AUSENTE nao e campo VAZIO — a mesma regra que ja valia para
 *     largura, altura, cor e tecido na mesma rota, e que o
 *     POST /api/config/kit/etiqueta copiou de proposito (§4).
 *
 *  2. O NUMERO IMPOSSIVEL. `+estoque||0` aceitava negativo e fracao. E o
 *     conserto NAO e clampar em zero: clampar apaga saldo em silencio, que e
 *     exatamente o defeito 1 por outra porta. Numero que nao e peca e RECUSADO,
 *     e o saldo gravado nao se mexe.
 *
 *  3. O `catch(e){}` VAZIO. O destravamento dos volumes retidos por SKU nao
 *     cadastrado (§6) ficava fora de transacao e dentro de um catch vazio:
 *     falhou, a API respondia `{ok:true}` e os volumes seguiam bloqueados sem
 *     nenhum sinal. Hoje as duas escritas sao uma transacao so, a resposta diz
 *     QUANTOS volumes soltou, e falha e 500 com nada gravado.
 *
 * A rota mora em `sku_cad_route.js` e nao mais no `server.js` — foi o recorte
 * que tornou este arquivo possivel. O `server.js` abre porta e banco real, e
 * por isso nenhum teste do projeto consegue carrega-lo.
 *
 * Sobe um banco temporario e chama os handlers direto, com um `app` de mentira
 * que so guarda as rotas. Nao abre porta, nao toca no banco de producao.
 */
const Database = require('better-sqlite3');
const fs = require('fs'), os = require('os'), path = require('path');

let n = 0, falhas = 0;
function ok(desc, cond, detalhe){
  n++;
  if(cond) console.log('  ok  ' + n + ' — ' + desc);
  else { falhas++; console.log('  FALHOU ' + n + ' — ' + desc + (detalhe ? '\n         ' + detalhe : '')); }
}
function eq(desc, achado, esperado){
  ok(desc, achado === esperado, 'esperado ' + JSON.stringify(esperado) + ', veio ' + JSON.stringify(achado));
}

const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'pcp-skus-'));
const db = new Database(path.join(tmp, 't.db'));

/* Mesmo CREATE do db.js (skus) e do sku_schema.js (cor, tecido, modelo) mais a
   `lote` do exp_route. Copia consciente: o teste tem que subir sem o db.js, que
   aponta para a pasta do servidor (§13). */
db.exec(`
  CREATE TABLE skus (codigo TEXT PRIMARY KEY, descricao TEXT DEFAULT '', cor TEXT DEFAULT '',
    estoque INTEGER DEFAULT 0, alvo INTEGER DEFAULT 0,
    criado_em TEXT DEFAULT (datetime('now','localtime')),
    modelo_id INTEGER, largura_cm INTEGER, altura_cm INTEGER,
    cor_codigo TEXT, tecido_codigo TEXT,
    tem_ficha INTEGER DEFAULT 1, custo_direto REAL);
  CREATE TABLE cor (codigo TEXT PRIMARY KEY, nome TEXT, ativa INTEGER DEFAULT 1);
  CREATE TABLE tecido (codigo TEXT PRIMARY KEY, nome TEXT, ativo INTEGER DEFAULT 1);
  CREATE TABLE modelo (id INTEGER PRIMARY KEY AUTOINCREMENT, nome TEXT,
    exige_medida INTEGER DEFAULT 1, sob_medida INTEGER DEFAULT 0);
  CREATE TABLE lote (id INTEGER PRIMARY KEY AUTOINCREMENT, codigo TEXT,
    estagio TEXT DEFAULT 'pendente', bloqueio TEXT,
    data TEXT DEFAULT (date('now','localtime')));
  INSERT INTO cor (codigo,nome) VALUES ('BEGE','Bege'),('CINZA','Cinza');
  INSERT INTO tecido (codigo,nome) VALUES ('BLACKOUT','Blackout');
  INSERT INTO modelo (id,nome,exige_medida) VALUES (1,'Rolô',1),(2,'Acessório',0);
`);

const rotas = {};
const app = { locals:{}, get(p,h){ rotas['GET '+p]=h; }, post(p,h){ rotas['POST '+p]=h; },
              delete(p,h){ rotas['DELETE '+p]=h; } };
require('./sku_cad_route')(app, db);

function chamar(metodo, rota, corpo, params){
  const h = rotas[metodo+' '+rota];
  if(!h) throw new Error('rota nao registrada: '+metodo+' '+rota);
  const out = { status:200, body:null };
  const res = {
    status(c){ out.status=c; return res; },
    json(b){ out.body=b; return res; },
    send(b){ out.body=b; return res; }
  };
  h({ body: corpo||{}, params: params||{}, headers:{}, usuario:{id:1,nome:'Gestao'} }, res);
  return out;
}
const sku = c => db.prepare('SELECT * FROM skus WHERE codigo=?').get(c);
const semear = (c, campos) => {
  db.prepare('INSERT OR REPLACE INTO skus (codigo,descricao,cor,estoque,alvo,largura_cm,altura_cm,cor_codigo,tecido_codigo,modelo_id,tem_ficha) VALUES (?,?,?,?,?,?,?,?,?,?,1)')
    .run(c, campos.descricao||'', campos.cor||'', campos.estoque||0, campos.alvo||0,
         campos.largura_cm||null, campos.altura_cm||null, campos.cor_codigo||null,
         campos.tecido_codigo||null, campos.modelo_id||null);
};

console.log('\n── 1. campo ausente NAO e campo vazio (a divida 15) ──');
semear('BK140140BEGE', {descricao:'Rolô Blackout 1,40', cor:'Bege', estoque:7, alvo:4,
                        largura_cm:140, altura_cm:140, cor_codigo:'BEGE', tecido_codigo:'BLACKOUT', modelo_id:1});

let r = chamar('POST','/api/skus',{codigo:'BK140140BEGE', descricao:'Rolô Blackout 1,40 m'});
eq('salvar so a descricao nao apaga o ESTOQUE', sku('BK140140BEGE').estoque, 7);
eq('salvar so a descricao nao apaga o ALVO', sku('BK140140BEGE').alvo, 4);
eq('a descricao enviada e gravada', sku('BK140140BEGE').descricao, 'Rolô Blackout 1,40 m');
eq('e a chamada continua respondendo ok', r.body && r.body.ok, true);

/* ⚠️ A PARTIR DAQUI A REGRA MUDOU (fase 1 do livro, 21/09/2026): O CADASTRO
   NAO MEXE EM SALDO, NEM QUANDO O CAMPO VEM. A #25 fechou a porta do campo
   AUSENTE apagar o saldo; esta fecha a do campo PRESENTE mexer nele sem motivo
   e sem auditoria, que era o que ficava aberto na divida 15.
   Estes casos eram o contrario ate ontem — e e por isso que eles estao aqui
   com o texto trocado em vez de apagados: o dia em que alguem devolver o
   `estoque=excluded.estoque` ao upsert, eles reprovam. */
r = chamar('POST','/api/skus',{codigo:'BK140140BEGE', estoque:9});
eq('salvar so o estoque nao apaga a DESCRICAO', sku('BK140140BEGE').descricao, 'Rolô Blackout 1,40 m');
eq('salvar so o estoque nao apaga a COR', sku('BK140140BEGE').cor, 'Bege');
eq('o estoque enviado NAO e gravado — saldo se move pelo livro', sku('BK140140BEGE').estoque, 7);
eq('e a rota DIZ que ignorou, em vez de calar', r.body && r.body.estoque_ignorado, true);
ok('   e o aviso manda pro lugar certo', /Admin → Estoque/.test((r.body&&r.body.aviso)||''),
   JSON.stringify(r.body));
eq('e a medida ja migrada continua de pe (o manda() de antes)', sku('BK140140BEGE').largura_cm, 140);

r = chamar('POST','/api/skus',{codigo:'BK140140BEGE', alvo:12});
eq('o alvo enviado e gravado — alvo nao e saldo', sku('BK140140BEGE').alvo, 12);
eq('e o estoque nao andou junto', sku('BK140140BEGE').estoque, 7);
eq('sem o campo, a resposta nao traz aviso nenhum', r.body && r.body.estoque_ignorado, undefined);

chamar('POST','/api/skus',{codigo:'BK140140BEGE', estoque:0});
eq('ZERO EXPLICITO tambem nao zera: era a porta mais perigosa das duas',
   sku('BK140140BEGE').estoque, 7);
chamar('POST','/api/skus',{codigo:'BK140140BEGE', cor:''});
eq('cor vazia de proposito apaga a cor (texto, nao saldo)', sku('BK140140BEGE').cor, '');
eq('e o saldo nao foi junto', sku('BK140140BEGE').estoque, 7);

console.log('\n── 2. numero impossivel e RECUSADO, nunca clampado ──');
r = chamar('POST','/api/skus',{codigo:'BK140140BEGE', estoque:-1});
eq('estoque negativo → 400', r.status, 400);
eq('e o saldo gravado NAO se mexeu', sku('BK140140BEGE').estoque, 7);
ok('o erro diz qual campo', /estoque/.test((r.body&&r.body.erro)||''), JSON.stringify(r.body));

r = chamar('POST','/api/skus',{codigo:'BK140140BEGE', alvo:-2});
eq('alvo negativo → 400', r.status, 400);
eq('e o alvo gravado NAO se mexeu', sku('BK140140BEGE').alvo, 12);

r = chamar('POST','/api/skus',{codigo:'BK140140BEGE', estoque:'2,5'});
eq('fracao → 400 (meia persiana nao existe)', r.status, 400);
eq('o saldo continua o mesmo', sku('BK140140BEGE').estoque, 7);

r = chamar('POST','/api/skus',{codigo:'BK140140BEGE', estoque:'abc'});
eq('texto que nao e numero → 400', r.status, 400);

r = chamar('POST','/api/skus',{codigo:'BK140140BEGE', estoque:''});
eq('estoque VAZIO → 400 (vazio nao e zero; para manter, nao mande o campo)', r.status, 400);
eq('e o saldo continua', sku('BK140140BEGE').estoque, 7);

r = chamar('POST','/api/skus',{codigo:'BK140140BEGE', estoque:null});
eq('estoque null → 400', r.status, 400);
eq('e o saldo continua', sku('BK140140BEGE').estoque, 7);

r = chamar('POST','/api/skus',{codigo:'BK140140BEGE', estoque:'8'});
eq('numero em texto ("8", como vem de um <input>) passa na validacao', r.status, 200);
eq('   mas o saldo segue sendo do livro', sku('BK140140BEGE').estoque, 7);

console.log('\n── 3. o SKU novo ──');
r = chamar('POST','/api/skus',{codigo:'novo1', descricao:'Peça nova'});
eq('SKU novo sem estoque nasce com 0', sku('NOVO1').estoque, 0);
eq('SKU novo sem alvo nasce com 0', sku('NOVO1').alvo, 0);
eq('codigo normalizado para maiusculas', sku('NOVO1').codigo, 'NOVO1');
eq('SKU novo sem cor nasce com texto vazio, nunca null', sku('NOVO1').cor, '');
chamar('POST','/api/skus',{codigo:'NOVO2', estoque:5, alvo:3});
/* ⚠️ NEM O SKU NOVO. Nascer com 5 e livro vazio quebraria
   `SUM(delta) = skus.estoque` na primeira linha — e essa soma e a guarda
   contra a volta dos sete donos. Peca em prateleira entra pela embalagem ou
   por um ajuste com motivo, nunca por um campo de cadastro. */
eq('SKU novo com estoque no corpo NASCE COM ZERO', sku('NOVO2').estoque, 0);
eq('SKU novo com alvo grava o alvo', sku('NOVO2').alvo, 3);

console.log('\n── 4. o destravamento dos volumes (§6) ──');
const volume = (cod, bloqueio) => db.prepare(
  "INSERT INTO lote (codigo,estagio,bloqueio) VALUES (?,'bloqueado',?)").run(cod,bloqueio).lastInsertRowid;
const estagio = id => db.prepare('SELECT estagio FROM lote WHERE id=?').get(id).estagio;

const vSku  = volume('TRAVADO','sku_nao_cadastrado');
const vSku2 = volume('TRAVADO','sku_nao_cadastrado');
const vDiv  = volume('TRAVADO','divergencia: leituras divergem: A / B');
const vMod  = volume('TRAVADO','modalidade: Despachar: 10/set');
const vPac  = volume('TRAVADO','pacote: esta etiqueta leva 3 pecas de 2 SKUs');
const vOutro= volume('OUTRO','sku_nao_cadastrado');

r = chamar('POST','/api/skus',{codigo:'TRAVADO'});
eq('cadastrar o SKU solta o volume retido por SKU nao cadastrado', estagio(vSku), 'pendente');
eq('solta todos os volumes daquele codigo', estagio(vSku2), 'pendente');
eq('NAO solta o retido por divergencia (§5)', estagio(vDiv), 'bloqueado');
eq('NAO solta o retido por modalidade (§8-B)', estagio(vMod), 'bloqueado');
eq('NAO solta o retido por pacote (§5, #23)', estagio(vPac), 'bloqueado');
eq('nao encosta no volume de outro codigo', estagio(vOutro), 'bloqueado');
eq('A RESPOSTA DIZ QUANTOS SOLTOU — "ok:true" nao distinguia 2 de nenhum', r.body.destravados, 2);

r = chamar('POST','/api/skus',{codigo:'TRAVADO', descricao:'de novo'});
eq('sem volume para soltar, destravados = 0', r.body.destravados, 0);

console.log('\n── 5. as duas escritas sao UMA transacao (o catch vazio que mentia) ──');
console.log('     (o erro de SQL que aparece abaixo E O CASO: e o log que nao existia)');
semear('ROLLBACK1', {descricao:'antes', estoque:7});
db.exec('ALTER TABLE lote RENAME TO lote_guardado');   // o destravamento passa a falhar
r = chamar('POST','/api/skus',{codigo:'ROLLBACK1', descricao:'depois', estoque:1});
eq('destravamento quebrado → 500, e nao mais ok:true', r.status, 500);
ok('o erro diz o que houve', /lote/.test((r.body&&r.body.erro)||''), JSON.stringify(r.body));
eq('NADA foi gravado: a descricao continua a antiga', sku('ROLLBACK1').descricao, 'antes');
eq('NADA foi gravado: o saldo continua o antigo', sku('ROLLBACK1').estoque, 7);
r = chamar('POST','/api/skus',{codigo:'NASCEUNAO'});
ok('e o SKU novo nao chega a existir', sku('NASCEUNAO') === undefined);
db.exec('ALTER TABLE lote_guardado RENAME TO lote');

console.log('\n── 6. o que ja valia continua valendo (o recorte nao mudou regra) ──');
r = chamar('POST','/api/skus',{descricao:'sem codigo'});
eq('codigo obrigatorio → 400', r.status, 400);

r = chamar('POST','/api/skus',{codigo:'REVENDA1', tem_ficha:0, modelo_id:1});
eq('revenda com modelo na MESMA chamada → 400 (COMPRAS.md §2)', r.status, 400);
chamar('POST','/api/skus',{codigo:'REVENDA1', tem_ficha:0, custo_direto:'12,50'});
eq('revenda sem modelo grava o custo direto', sku('REVENDA1').custo_direto, 12.5);
eq('e o modelo fica nulo', sku('REVENDA1').modelo_id, null);

chamar('POST','/api/skus',{codigo:'FANTASMA1', modelo_id:999});
eq('modelo inexistente vira NULL (vai para pendencias, nao para 500)', sku('FANTASMA1').modelo_id, null);
chamar('POST','/api/skus',{codigo:'FANTASMA1', cor_codigo:'VERDE'});
eq('cor fora da lista vira NULL', sku('FANTASMA1').cor_codigo, null);
chamar('POST','/api/skus',{codigo:'FANTASMA1', cor_codigo:'bege'});
eq('cor da lista grava normalizada', sku('FANTASMA1').cor_codigo, 'BEGE');
chamar('POST','/api/skus',{codigo:'FANTASMA1', largura_cm:'0'});
eq('medida <= 0 vira NULL, nunca 0 (§7)', sku('FANTASMA1').largura_cm, null);
chamar('POST','/api/skus',{codigo:'FANTASMA1', largura_cm:'160'});
eq('medida valida grava', sku('FANTASMA1').largura_cm, 160);
chamar('POST','/api/skus',{codigo:'FANTASMA1', descricao:'so a descricao'});
eq('e a medida sobrevive a uma chamada que nao a manda', sku('FANTASMA1').largura_cm, 160);

r = chamar('GET','/api/skus');
const linha = r.body.find(x => x.codigo === 'BK140140BEGE');
eq('GET /api/skus continua trazendo o nome da cor', linha.cor_nome, 'Bege');
eq('e o nome do modelo', linha.modelo_nome, 'Rolô');
eq('e o exige_medida do modelo', linha.exige_medida, 1);

chamar('DELETE','/api/skus/:codigo', null, {codigo:'NOVO2'});
ok('DELETE apaga o SKU', sku('NOVO2') === undefined);

console.log('\n────────────────────────────────────────────');
console.log(falhas ? '  ' + falhas + ' de ' + n + ' FALHARAM' : '  todos os ' + n + ' casos passaram');
try{ db.close(); fs.rmSync(tmp,{recursive:true,force:true}); }catch(e){}
process.exit(falhas ? 1 : 0);

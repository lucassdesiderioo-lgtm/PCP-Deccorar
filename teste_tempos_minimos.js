#!/usr/bin/env node
/* teste_tempos_minimos.js — OS DOIS TEMPOS MÍNIMOS DA BANCADA NA 906 (AJUSTE de
 * 24/11/2026, decisão do dono).
 *
 *   node teste_tempos_minimos.js
 *
 * O mínimo da embalagem (`config.emb_minimo_seg`, 45 s, R-EMB-09) e o da
 * revisão (`config.rev_minimo_seg`, 15 s, R-REV-07) só se mudavam por SQL no
 * servidor. Agora a 906 Parâmetros os muda, pela rota
 * `/api/config/tempos-minimos`, só para quem é nível Admin (como o segundo
 * bipe). Regras do dono: número inteiro, no mínimo 1 (zero desligaria a trava);
 * sem teto (acima de 600 a tela só avisa). Campo ausente fica como estava;
 * número impossível é recusado com o nome do campo e NADA grava. Cada troca vai
 * para a auditoria com o antes e o depois.
 *
 * Banco temporário, handlers chamados direto com um `app` de mentira.
 */
const Database = require('better-sqlite3');
const fs = require('fs'), os = require('os'), path = require('path');

let n = 0, falhas = 0;
function ok(desc, cond, detalhe){
  n++;
  if(cond) console.log('  ok  ' + n + ' — ' + desc);
  else { falhas++; console.log('  FALHOU ' + n + ' — ' + desc + (detalhe ? '\n         ' + detalhe : '')); }
}
const ler = f => fs.readFileSync(path.join(__dirname, f), 'utf8');

const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'pcp-tmin-'));
const db = new Database(path.join(tmp, 't.db'));
db.exec(`
  CREATE TABLE skus (codigo TEXT PRIMARY KEY, descricao TEXT DEFAULT '', cor TEXT DEFAULT '',
    estoque INTEGER DEFAULT 0, alvo INTEGER DEFAULT 0);
  CREATE TABLE fila (id INTEGER PRIMARY KEY AUTOINCREMENT, codigo TEXT,
    modo TEXT DEFAULT 'hoje', situacao TEXT DEFAULT 'aguardando',
    revisado_em TEXT DEFAULT (datetime('now','localtime')), embalado_em TEXT,
    data TEXT DEFAULT (date('now','localtime')), teste INTEGER DEFAULT 0);
  CREATE TABLE producao (id INTEGER PRIMARY KEY AUTOINCREMENT, codigo TEXT, qtd INTEGER,
    produzido INTEGER DEFAULT 0, data TEXT DEFAULT (date('now','localtime')),
    origem TEXT DEFAULT 'manual', urgente INTEGER DEFAULT 0, teste INTEGER DEFAULT 0);
  INSERT INTO skus (codigo,estoque) VALUES ('BK140140BEGE',0);
`);

const rotas = {};
const app = { locals:{}, get(p,h){ rotas['GET '+p]=h; }, post(p,h){ rotas['POST '+p]=h; },
              delete(p,h){ rotas['DELETE '+p]=h; } };
const auditoria = [];
app.locals.acesso = { auditar(req,cat,acao,alvo,detalhe){ auditoria.push({cat,acao,alvo,detalhe}); } };
require('./estoque_dominio').garantirSchema(db);
require('./revisao_route').garantirSchema(db);
require('./mont_route')(app, db);

function chamar(metodo, rota, corpo, usuario){
  const h = rotas[metodo+' '+rota];
  if(!h) throw new Error('rota nao registrada: '+metodo+' '+rota);
  const out = { status:200, body:null };
  const res = { status(c){ out.status=c; return res; }, json(b){ out.body=b; return res; }, send(b){ out.body=b; return res; } };
  h({ body: corpo||{}, params:{}, headers:{}, usuario: usuario===undefined ? {id:1,nome:'Admin'} : usuario }, res);
  return out;
}
const cfg = k => (db.prepare('SELECT valor FROM config WHERE chave=?').get(k) || {}).valor;
const R = '/api/config/tempos-minimos';

console.log('\n── 1. ler ──');
let r = chamar('GET', R);
ok('a rota existe e lê os dois números de hoje (45 e 15)', r.body && r.body.embalagem === 45 && r.body.revisao === 15, JSON.stringify(r.body));

console.log('\n── 2. gravar ──');
r = chamar('POST', R, { embalagem:40, revisao:20 });
ok('grava os dois', r.status === 200 && r.body && r.body.ok && cfg('emb_minimo_seg') === '40' && cfg('rev_minimo_seg') === '20', JSON.stringify(r));
ok('e responde os números gravados', r.body && r.body.embalagem === 40 && r.body.revisao === 20, JSON.stringify(r.body));
r = chamar('POST', R, { revisao:'18' });
ok('campo ausente fica como estava (a embalagem continua 40)', r.status === 200 && cfg('emb_minimo_seg') === '40' && cfg('rev_minimo_seg') === '18', JSON.stringify([cfg('emb_minimo_seg'), cfg('rev_minimo_seg')]));
r = chamar('POST', R, { embalagem:900 });
ok('sem teto: 900 é aceito', r.status === 200 && cfg('emb_minimo_seg') === '900', JSON.stringify(r));
chamar('POST', R, { embalagem:40 });

console.log('\n── 3. recusar o impossível, sem gravar nada ──');
for(const [rot, corpo] of [['zero', {embalagem:0, revisao:30}], ['negativo', {embalagem:-5}], ['fração', {embalagem:12.5}],
    ['texto', {embalagem:'abc'}], ['vazio', {embalagem:''}], ['texto com número', {revisao:'30s'}], ['nulo', {revisao:null}],
    /* ③ REVISÃO: o número que não se guarda virava "1e+21" e o parseInt da trava lia 1 */
    ['número gigante', {embalagem:'1000000000000000000000'}], ['número gigante (revisão)', {revisao:1e21}],
    ['lista', {embalagem:[60]}]]){
  r = chamar('POST', R, corpo);
  ok('recusa ' + rot + ' (400, diz o campo) e nada grava', r.status === 400 && r.body && /embalagem|revis/i.test(r.body.erro || '')
    && cfg('emb_minimo_seg') === '40' && cfg('rev_minimo_seg') === '18', JSON.stringify([r.status, r.body, cfg('emb_minimo_seg'), cfg('rev_minimo_seg')]));
}
r = chamar('POST', R, {});
ok('sem nenhum dos dois campos é 400', r.status === 400, JSON.stringify(r));

r = chamar('GET', R);
ok('a leitura diz em quantos segundos a reserva da peça solta (5 min = 300)', r.body && r.body.reserva_seg === 300, JSON.stringify(r.body));

console.log('\n── 4. sem login nada grava ──');
r = chamar('POST', R, { embalagem:50 }, null);
ok('sem login é 401 e nada grava', r.status === 401 && cfg('emb_minimo_seg') === '40', JSON.stringify([r.status, cfg('emb_minimo_seg')]));

console.log('\n── 5. a auditoria ──');
auditoria.length = 0;
chamar('POST', R, { embalagem:35, revisao:18 });
const a = auditoria.find(x => /tempo/.test(x.acao));
ok('a troca vai para a auditoria com o antes e o depois', !!a && /40/.test(a.detalhe) && /35/.test(a.detalhe), JSON.stringify(auditoria));
ok('   o que não mudou (a revisão, 18 → 18) não entra como troca', !!a && !/revis/i.test(a.detalhe), a && a.detalhe);
auditoria.length = 0;
chamar('POST', R, { embalagem:35 });
ok('gravar o mesmo número não gera linha', !auditoria.some(x => /tempo/.test(x.acao)), JSON.stringify(auditoria));

console.log('\n── 6. vale na hora ──');
db.prepare("INSERT INTO fila (codigo,modo) VALUES ('BK140140BEGE','hoje')").run();
r = chamar('POST', '/api/montagem', { codigo:'BK140140BEGE', segundos:30, kit_ok:1, kit:'X' });
ok('a próxima embalagem já usa o número novo (30 s < 35 s é recusado, e o mínimo dito é 35)', r.status === 409 && r.body && r.body.minimo === 35, JSON.stringify(r));
const REV = require('./revisao_route');
ok('a revisão lê o número gravado', REV.minimoSeg && REV.minimoSeg(db) === 18, String(REV.minimoSeg && REV.minimoSeg(db)));

console.log('\n── 7. a permissão e a tela ──');
const ac = ler('acesso.js');
ok('a rota é de quem é nível Admin (@admin), nas duas direções', /eq\('\/api\/config\/tempos-minimos'\)\)\s*return '@admin'/.test(ac));
const PAR = ler('public/parametros.html');
ok('a 906 tem o card "Tempo mínimo na bancada", pela rota', /Tempo mínimo na bancada/.test(PAR) && /\/api\/config\/tempos-minimos/.test(PAR));
ok('o card aparece só para o nível Admin', /if\(EU\.admin\)\{[^}]*partTempos\(\)/.test(PAR));
ok('a tela recusa menos de 1 e avisa acima de 600', /600/.test(PAR) && /mínimo é 1/.test(PAR));
ok('a tela recusa o número que não se guarda (isSafeInteger)', /isSafeInteger/.test(PAR));
ok('a tela avisa quando a embalagem passa do tempo da reserva', /reserva_seg/.test(PAR) && /reserva/.test(PAR));
ok('o aviso aparece já ao abrir, com o número gravado (③ REVISÃO, testador de tela)', /forEach\(function\(i\)\{ i\.oninput=[^\n]*avisoTempo\(c,i\.dataset\.tempo\); \}; avisoTempo\(c,i\.dataset\.tempo\); \}\)/.test(PAR));
/* A conta do aviso, rodada (③ REVISÃO, rodada 2): tirada do HTML e chamada. */
const fnAviso = (PAR.match(/function textoAviso\(k,v\)\{[\s\S]*?\n\}/) || [''])[0];
const aviso = new Function('RESERVA_SEG','TEMPO_AVISO', fnAviso + '; return textoAviso;')(300, 600);
ok('o aviso da reserva vale a partir de 300 s (no exato também), e não antes', /reserva/.test(aviso('embalagem',300)) && aviso('embalagem',299) === '', JSON.stringify([aviso('embalagem',300), aviso('embalagem',299)]));
ok('a revisão só avisa acima de 600 s', aviso('revisao',600) === '' && /600/.test(aviso('revisao',601)));
const aviso2 = new Function('RESERVA_SEG','TEMPO_AVISO', fnAviso + '; return textoAviso;')(600, 600);
ok('o aviso segue o tempo da reserva que o servidor manda (10 min: 400 s não avisa)', aviso2('embalagem',400) === '');
ok('a tela lê o reserva_seg da resposta', /RESERVA_SEG=x\.j\.reserva_seg/.test(PAR));
ok('a tela diz que, ao baixar o da Revisão, os tablets se recarregam', /recarregue os tablets da Revisão/.test(PAR));

db.close(); fs.rmSync(tmp, { recursive:true, force:true });
console.log('\n' + (falhas ? falhas + ' FALHA(S) em ' + n : 'TODOS OS ' + n + ' PASSARAM'));
process.exit(falhas ? 1 : 0);

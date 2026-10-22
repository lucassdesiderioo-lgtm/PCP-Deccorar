#!/usr/bin/env node
/* teste_conferencia_antiga.js — FECHAR CONFERENCIAS ANTIGAS, na Mesa de correcoes.
 *
 *   node teste_conferencia_antiga.js
 *
 * Fase 0 da spec CONFERENCIA-E-BAIXA (22/10/2026). A tela do Carregamento
 * ficou um tempo com problema, e mais de 500 caixas apareciam como impressas e
 * nao conferidas, de dias anteriores (a linha ambar, R-PIL-02). Quase todas
 * sairam de verdade. Esta acao fecha esse passivo EM BLOCO, ate uma data de
 * corte que o dono escolhe.
 *
 * Escrito ANTES do codigo (§0, risco vermelho). O que ele trava:
 *   - a data de corte e obrigatoria e NUNCA e hoje: a caixa de hoje ainda e
 *     trabalho da conferencia;
 *   - so pega `embalado` sem conferencia, fora do modo teste, que nao despacha
 *     no futuro;
 *   - carimba na data de despacho (ou da impressao, se ela veio depois), as
 *     15:00 — nunca hoje — e a coleta ganha `retirado_em`;
 *   - NAO MEXE EM ESTOQUE: a baixa ja aconteceu na impressao;
 *   - uma correcao para o bloco, desfeita tudo ou nada;
 *   - a linha ambar do Carregamento zera;
 *   - o script do terminal faz o mesmo, e so grava com --aplicar.
 *
 * Banco temporario, `app` de mentira; nao abre porta nem toca em producao.
 */
const Database = require('better-sqlite3');
const fs = require('fs'), os = require('os'), path = require('path');
const { execFileSync } = require('child_process');

let n = 0, falhas = 0;
function ok(desc, cond, detalhe){
  n++;
  if(cond) console.log('  ok  ' + n + ' — ' + desc);
  else { falhas++; console.log('  FALHOU ' + n + ' — ' + desc + (detalhe ? '\n         ' + detalhe : '')); }
}
function eq(desc, achado, esperado){
  ok(desc, achado === esperado, 'esperado ' + JSON.stringify(esperado) + ', veio ' + JSON.stringify(achado));
}

const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'pcp-confantiga-'));
const ARQ = path.join(tmp, 't.db');
const db = new Database(ARQ);
db.pragma('foreign_keys = OFF');
db.exec(`
  CREATE TABLE config (chave TEXT PRIMARY KEY, valor TEXT);
  CREATE TABLE auditoria (id INTEGER PRIMARY KEY AUTOINCREMENT, usuario_id INTEGER, usuario_nome TEXT,
    categoria TEXT, acao TEXT, alvo TEXT, detalhe TEXT, ip TEXT,
    criado_em TEXT DEFAULT (datetime('now','localtime')));
  CREATE TABLE modelo (id INTEGER PRIMARY KEY AUTOINCREMENT, codigo TEXT, nome TEXT,
    exige_medida INTEGER DEFAULT 1, sob_medida INTEGER DEFAULT 0);
  CREATE TABLE skus (codigo TEXT PRIMARY KEY, descricao TEXT DEFAULT '', cor TEXT DEFAULT '',
    estoque INTEGER DEFAULT 0, alvo INTEGER DEFAULT 0, modelo_id INTEGER);
  CREATE TABLE lote (id INTEGER PRIMARY KEY AUTOINCREMENT, codigo TEXT, cor TEXT DEFAULT '',
    buyer TEXT DEFAULT '', city TEXT DEFAULT '', nf TEXT, packId TEXT, venda TEXT,
    codes TEXT DEFAULT '[]', srcfile TEXT, labelPage INTEGER, danfePage INTEGER,
    estagio TEXT DEFAULT 'pendente', embalado_em TEXT, carregado_em TEXT,
    data TEXT DEFAULT (date('now','localtime')), criado_em TEXT DEFAULT (datetime('now','localtime')),
    teste INTEGER DEFAULT 0, reimpressoes INTEGER DEFAULT 0, reimpresso_em TEXT, bloqueio TEXT,
    descricao TEXT, despachar_em TEXT, bloqueio_resolvido TEXT, resolvido_por TEXT, resolvido_em TEXT,
    modalidade TEXT, retirado_em TEXT, impresso_por TEXT, conferido_por TEXT, conferido_em TEXT,
    no_carro_em TEXT, no_carro_por TEXT, saida_id INTEGER, saiu_em TEXT, saiu_por TEXT,
    cancelada_em TEXT, cancelada_origem TEXT, cancelada_estagio TEXT, cancelada_motivo TEXT,
    cancelada_varias INTEGER DEFAULT 0, cancelada_aviso_em TEXT,
    cancelada_resolvida_em TEXT, cancelada_resolvida_por TEXT, cancelada_voltou INTEGER);
  CREATE TABLE lote_item (id INTEGER PRIMARY KEY AUTOINCREMENT, lote_id INTEGER NOT NULL,
    codigo TEXT, qtd INTEGER DEFAULT 1, cor TEXT, descricao TEXT, origem TEXT DEFAULT 'folha',
    conferido_em TEXT, conferido_por TEXT, criado_em TEXT DEFAULT (datetime('now','localtime')),
    teste INTEGER DEFAULT 0, conferidos INTEGER DEFAULT 0);
  CREATE TABLE fila (id INTEGER PRIMARY KEY AUTOINCREMENT, codigo TEXT,
    modo TEXT DEFAULT 'hoje', situacao TEXT DEFAULT 'aguardando',
    revisado_em TEXT DEFAULT (datetime('now','localtime')), embalado_em TEXT,
    data TEXT DEFAULT (date('now','localtime')), teste INTEGER DEFAULT 0);
  INSERT INTO modelo (codigo,nome,sob_medida) VALUES ('ROLO','Rolô',0);
  INSERT INTO skus (codigo,descricao,estoque,modelo_id) VALUES
    ('BK140140BEGE','Rolo 1,40',10,1), ('BK160160CINZA','Rolo 1,60',4,1);
`);
const ESTOQUE = require('./estoque_dominio');
ESTOQUE.garantirSchema(db);
ESTOQUE.abertura(db);
require('./ajuste_dominio').garantirSchema(db);

const PERMS = {};
const rotas = {};
const app = {
  locals:{ acesso:{
    podePermissao(u, chave){ return !!(u && PERMS[u.id] && PERMS[u.id].has(chave)); },
    auditar(req, categoria, acao, alvo, detalhe){
      db.prepare(`INSERT INTO auditoria (usuario_id,usuario_nome,categoria,acao,alvo,detalhe,ip)
        VALUES (?,?,?,?,?,?,?)`).run((req.usuario||{}).id||null, (req.usuario||{}).nome||'',
        categoria||'', acao||'', String(alvo==null?'':alvo), String(detalhe==null?'':detalhe), '');
    }
  }},
  get(p,h){ rotas['GET '+p]=h; }, post(p,h){ rotas['POST '+p]=h; }
};
require('./correcao_route')(app, db);

const LUCAS = {id:1, nome:'Lucas'};
PERMS[1] = new Set(['correcao.executar']);

function chamar(metodo, rota, corpo, quem, params, query){
  const h = rotas[metodo+' '+rota];
  if(!h) throw new Error('rota nao registrada: '+metodo+' '+rota);
  const out = { status:200, body:null };
  const res = { status(c){ out.status=c; return res; }, json(b){ out.body=b; return res; } };
  try{ h({ body: corpo||{}, query: query||{}, params: params||{}, headers:{}, usuario: quem }, res); }
  catch(e){ out.status = 500; out.body = { erro:String(e && e.message) }; }
  return out;
}
const vol = id => db.prepare('SELECT * FROM lote WHERE id=?').get(id) || null;
const saldo = c => db.prepare('SELECT estoque FROM skus WHERE codigo=?').get(c).estoque;
const linhasLivro = () => db.prepare('SELECT COUNT(*) n FROM movimento_estoque').get().n;
const previa   = (params,quem) => chamar('POST','/api/correcao/previa',{acao:'conferencias',tipo:'bloco',id:0,params},quem||LUCAS);
const executar = (params,motivo,quem) =>
  chamar('POST','/api/correcao/executar',{acao:'conferencias',tipo:'bloco',id:0,params,motivo},quem||LUCAS);
const desfazer = (id,quem) => chamar('POST','/api/correcao/:id/desfazer',{},quem||LUCAS,{id:String(id)});
const passivo  = quem => chamar('GET','/api/correcao/passivo',null,quem||LUCAS);

const D = n => db.prepare("SELECT date('now','localtime',?) d").get((n>=0?'+':'')+n+' days').d;
const HOJE = D(0);
function volume(o){
  const campos = Object.keys(o);
  return db.prepare('INSERT INTO lote ('+campos.join(',')+') VALUES ('+campos.map(()=>'?').join(',')+')')
    .run(campos.map(k=>o[k])).lastInsertRowid;
}

/* O cenario. Todos de dias anteriores, salvo onde o nome diz. */
const vVelha  = volume({codigo:'BK140140BEGE', buyer:'Velha Agência', nf:'8001', venda:'9801',
  estagio:'embalado', embalado_em:D(-10)+' 09:00:00', impresso_por:'Ana', data:D(-11), despachar_em:D(-10)});
const vColeta = volume({codigo:'BK140140BEGE', buyer:'Velha Coleta', nf:'8002', venda:'9802', modalidade:'coleta',
  estagio:'embalado', embalado_em:D(-8)+' 09:00:00', impresso_por:'Ana', data:D(-9), despachar_em:D(-7)});
const vAtras  = volume({codigo:'BK160160CINZA', buyer:'Impressa Atrasada', nf:'8003', venda:'9803',
  estagio:'embalado', embalado_em:D(-6)+' 09:00:00', impresso_por:'Ana', data:D(-12), despachar_em:D(-9)});
const vSemDesp = volume({codigo:'BK160160CINZA', buyer:'Sem Despacho', nf:'8004', venda:'9804',
  estagio:'embalado', embalado_em:D(-7)+' 09:00:00', impresso_por:'Ana', data:D(-7)});
const vRecente = volume({codigo:'BK140140BEGE', buyer:'Depois do Corte', nf:'8005', venda:'9805',
  estagio:'embalado', embalado_em:D(-2)+' 09:00:00', impresso_por:'Ana', data:D(-2), despachar_em:D(-2)});
const vHoje   = volume({codigo:'BK140140BEGE', buyer:'Impressa Hoje', nf:'8006', venda:'9806',
  estagio:'embalado', embalado_em:HOJE+' 08:00:00', impresso_por:'Ana', data:HOJE, despachar_em:HOJE});
const vFutura = volume({codigo:'BK140140BEGE', buyer:'Despacha Depois', nf:'8007', venda:'9807',
  estagio:'embalado', embalado_em:D(-9)+' 09:00:00', impresso_por:'Ana', data:D(-9), despachar_em:D(4)});
const vConf   = volume({codigo:'BK140140BEGE', buyer:'Já Conferida', nf:'8008', venda:'9808',
  estagio:'embalado', embalado_em:D(-9)+' 09:00:00', impresso_por:'Ana', conferido_por:'Bia',
  conferido_em:D(-9)+' 10:00:00', data:D(-9), despachar_em:D(-9)});
const vSaiu   = volume({codigo:'BK140140BEGE', buyer:'Já Saiu', nf:'8009', venda:'9809',
  estagio:'carregado', embalado_em:D(-9)+' 09:00:00', carregado_em:D(-9)+' 11:00:00', data:D(-9)});
const vPend   = volume({codigo:'BK140140BEGE', buyer:'Sem Etiqueta', nf:'8010', venda:'9810',
  estagio:'pendente', data:D(-9), despachar_em:D(-9)});
const vTeste  = volume({codigo:'BK140140BEGE', buyer:'Modo Teste', nf:'8011', venda:'9811', teste:1,
  estagio:'embalado', embalado_em:D(-9)+' 09:00:00', data:D(-9), despachar_em:D(-9)});
const vCanc   = volume({codigo:'BK140140BEGE', buyer:'Cancelada', nf:'8012', venda:'9812',
  estagio:'cancelado', cancelada_estagio:'embalado', cancelada_em:D(-8), embalado_em:D(-9)+' 09:00:00',
  data:D(-9), despachar_em:D(-9)});

/* ═════════════════════════════════════════════════════════════════════════ */
console.log('\n=== 1. O CONTADOR — a linha âmbar do Carregamento, com o botão que a zera ===\n');

let pv = passivo().body;
const idsC = ((pv.conferencias || {}).itens || []).map(x => x.id);
ok('o contador de conferências antigas existe', pv.conferencias && typeof pv.conferencias.n === 'number',
   JSON.stringify(pv.conferencias));
ok('ele conta as impressas e não conferidas de dias anteriores',
   [vVelha, vColeta, vAtras, vSemDesp, vRecente, vFutura].every(id => idsC.indexOf(id) >= 0), JSON.stringify(idsC));
ok('NÃO conta a impressa hoje — é o trabalho de hoje da conferência', idsC.indexOf(vHoje) < 0, JSON.stringify(idsC));
ok('nem a conferida, a que saiu, a sem etiqueta, a de teste e a cancelada',
   [vConf, vSaiu, vPend, vTeste, vCanc].every(id => idsC.indexOf(id) < 0), JSON.stringify(idsC));

const CARGA = require('./carga');
const ambarAntes = CARGA.pilhaDaArea(db).anteriores.map(v => v.id);
ok('o contador é a MESMA lista da linha âmbar do Carregamento (sem o teste)',
   JSON.stringify(idsC.slice().sort()) === JSON.stringify(ambarAntes.filter(id => id !== vTeste).sort()),
   'mesa ' + JSON.stringify(idsC) + ' · carregamento ' + JSON.stringify(ambarAntes));

/* ═════════════════════════════════════════════════════════════════════════ */
console.log('\n=== 2. A DATA DE CORTE — obrigatória, e nunca hoje ===\n');

let r = previa({});
eq('SEM A DATA é recusado', r.status, 400);
r = previa({ate:HOJE});
eq('A DATA DE HOJE é recusada — a caixa de hoje ainda espera a conferência', r.status, 400);
ok('e a recusa diz por quê', /hoje/i.test((r.body||{}).erro || ''), (r.body||{}).erro);
r = previa({ate:D(3)});
eq('data no futuro é recusada', r.status, 400);
r = previa({ate:'ontem'});
eq('data fora do formato é recusada', r.status, 400);
r = previa({ate:D(-30)});
eq('data de corte sem nada antes dela: 409, dizendo que não há o que fechar', r.status, 409);

/* ═════════════════════════════════════════════════════════════════════════ */
console.log('\n=== 3. A PRÉVIA — o que entra, o que fica, e o estoque ===\n');

r = previa({ate:D(-3)});
eq('a prévia até 3 dias atrás responde 200', r.status, 200);
const idsPrev = ((r.body.antes || {}).volumes || []).map(x => x.id);
ok('pega as impressas até o corte', [vVelha, vColeta, vAtras, vSemDesp].every(id => idsPrev.indexOf(id) >= 0),
   JSON.stringify(idsPrev));
ok('NÃO pega a impressa depois do corte', idsPrev.indexOf(vRecente) < 0, JSON.stringify(idsPrev));
ok('NÃO pega a que despacha no futuro — venda futura não saiu', idsPrev.indexOf(vFutura) < 0, JSON.stringify(idsPrev));
ok('nem a de hoje, a conferida e a de teste', [vHoje, vConf, vTeste].every(id => idsPrev.indexOf(id) < 0),
   JSON.stringify(idsPrev));
ok('a prévia traz a lista para conferir', Array.isArray(r.body.lista) && r.body.lista.length === idsPrev.length);
eq('A PRÉVIA NÃO MEXE EM ESTOQUE — a baixa já foi na impressão', (r.body.estoque || []).length, 0);
ok('o resumo diz que o estoque não se mexe', /estoque n[aã]o se mexe/i.test(r.body.resumo || ''), r.body.resumo);
ok('o resumo diz o que fica de fora (a futura)', /futur/i.test(r.body.resumo || ''), r.body.resumo);
ok('e manda conferir a área e o canto antes', /canto/i.test(r.body.resumo || ''), r.body.resumo);
eq('a prévia não grava', vol(vVelha).estagio, 'embalado');
eq('nem cria correção', db.prepare('SELECT COUNT(*) n FROM correcao').get().n, 0);

/* ═════════════════════════════════════════════════════════════════════════ */
console.log('\n=== 4. FECHAR — na data de cada caixa, sem estoque ===\n');

r = executar({ate:D(-3)}, '');
eq('sem motivo é recusado (400)', r.status, 400);
eq('e nada andou', vol(vVelha).estagio, 'embalado');

const s1 = saldo('BK140140BEGE'), s2 = saldo('BK160160CINZA'), livro = linhasLivro();
r = executar({ate:D(-3)}, 'tela do carregamento estava com problema; conferido na área e no canto');
eq('fechar responde 200', r.status, 200);
const cId = r.body.correcao_id;
eq('a caixa de agência virou carregado', vol(vVelha).estagio, 'carregado');
eq('CARIMBADA NA DATA DE DESPACHO, às 15:00 — nunca hoje', vol(vVelha).carregado_em, D(-10)+' 15:00:00');
eq('a coleta também, na data dela', vol(vColeta).carregado_em, D(-7)+' 15:00:00');
eq('COLETA ganha retirado_em — senão cai em "esperando o caminhão"', vol(vColeta).retirado_em, D(-7)+' 15:00:00');
eq('IMPRESSA DEPOIS DO DESPACHO: sai no dia da impressão, não antes dela', vol(vAtras).carregado_em, D(-6)+' 15:00:00');
eq('sem despacho lido: sai no dia em que entrou', vol(vSemDesp).carregado_em, D(-7)+' 15:00:00');
eq('a conferência continua VAZIA — ninguém conferiu', vol(vVelha).conferido_em, null);
eq('e ninguém aparece como quem conferiu', vol(vVelha).conferido_por, null);
eq('O ESTOQUE NÃO SE MEXEU (BK140140BEGE)', saldo('BK140140BEGE'), s1);
eq('O ESTOQUE NÃO SE MEXEU (BK160160CINZA)', saldo('BK160160CINZA'), s2);
eq('e o livro não ganhou linha', linhasLivro(), livro);
eq('a impressa depois do corte fica', vol(vRecente).estagio, 'embalado');
eq('a de hoje fica', vol(vHoje).estagio, 'embalado');
eq('a futura fica', vol(vFutura).estagio, 'embalado');
eq('a de teste fica', vol(vTeste).estagio, 'embalado');
eq('é UMA correção para o bloco', db.prepare("SELECT COUNT(*) n FROM correcao WHERE acao='conferencias'").get().n, 1);
ok('a auditoria registrou', db.prepare("SELECT 1 FROM auditoria WHERE categoria='correcao' AND acao='conferencias'").get());

const ambarDepois = CARGA.pilhaDaArea(db).anteriores.map(v => v.id);
ok('a linha âmbar do Carregamento ficou só com o que o corte deixou de fora',
   [vVelha, vColeta, vAtras, vSemDesp].every(id => ambarDepois.indexOf(id) < 0) && ambarDepois.indexOf(vRecente) >= 0,
   JSON.stringify(ambarDepois));
pv = passivo().body;
eq('o contador desceu para as duas que ficaram (depois do corte e futura)', (pv.conferencias||{}).n, 2);

/* ═════════════════════════════════════════════════════════════════════════ */
console.log('\n=== 5. DESFAZER — tudo ou nada ===\n');

db.prepare("UPDATE lote SET saida_id=55 WHERE id=?").run(vAtras);   // alguém mexeu numa delas
r = desfazer(cId);
eq('desfazer com UMA caixa que andou é recusado', r.status, 409);
ok('a recusa nomeia a caixa', ((r.body || {}).erro || '').indexOf('#' + vAtras) >= 0, (r.body || {}).erro);
eq('e nenhuma foi reaberta', vol(vVelha).estagio, 'carregado');
db.prepare("UPDATE lote SET saida_id=NULL WHERE id=?").run(vAtras);
r = desfazer(cId);
eq('com o bloco intacto, desfaz', r.status, 200);
ok('todas voltam a embalado, sem carimbo',
   [vVelha, vColeta, vAtras, vSemDesp].every(id => vol(id).estagio === 'embalado' && !vol(id).carregado_em));
eq('o retirado_em da coleta volta a vazio', vol(vColeta).retirado_em, null);
eq('e o estoque continua igual', saldo('BK140140BEGE'), s1);

/* ═════════════════════════════════════════════════════════════════════════ */
console.log('\n=== 6. A CHAVE ===\n');
r = previa({ate:D(-3)}, {id:9, nome:'Sem Chave'});
eq('sem correcao.executar, a prévia é recusada (403)', r.status, 403);

/* ═════════════════════════════════════════════════════════════════════════ */
console.log('\n=== 7. O TERMINAL — a mesma ação, e só grava com --aplicar ===\n');

const SCRIPT = path.join(__dirname, 'fechar_conferencias_antigas.js');
const env = Object.assign({}, process.env, { PCP_DB:ARQ, PCP_BACKUPS:path.join(tmp, 'backups') });
function rodar(args){
  try{ return { cod:0, out:execFileSync(process.execPath, [SCRIPT].concat(args), { env, encoding:'utf8', stdio:'pipe' }) }; }
  catch(e){ return { cod:e.status == null ? 1 : e.status, out:String(e.stdout || '') + String(e.stderr || '') }; }
}
ok('o script existe', fs.existsSync(SCRIPT));
let t = rodar([]);
ok('SEM --ate o script recusa e não grava', t.cod !== 0 && /--ate/.test(t.out), t.out);
t = rodar(['--ate', D(-3)]);
eq('com --ate e sem --aplicar, termina bem', t.cod, 0);
ok('diz que é simulação', /SIMULA/i.test(t.out), t.out);
eq('e não gravou nada', vol(vVelha).estagio, 'embalado');
t = rodar(['--ate', D(-3), '--aplicar', '--motivo', 'limpeza pelo terminal']);
eq('com --aplicar, termina bem', t.cod, 0);
eq('fechou a caixa, na data dela', vol(vVelha).carregado_em, D(-10)+' 15:00:00');
const cT = db.prepare("SELECT * FROM correcao WHERE acao='conferencias' ORDER BY id DESC").get();
ok('a correção diz que veio do terminal', /terminal/.test((cT || {}).usuario_nome || ''), JSON.stringify(cT));
eq('com o motivo que foi passado', (cT || {}).motivo, 'limpeza pelo terminal');
ok('e fez backup antes', fs.existsSync(path.join(tmp, 'backups')) && fs.readdirSync(path.join(tmp, 'backups')).length === 1);
eq('o estoque continua igual', saldo('BK140140BEGE'), s1);

console.log('\n' + (n - falhas) + ' ok, ' + falhas + ' falha(s)\n');
try{ db.close(); fs.rmSync(tmp, { recursive:true, force:true }); }catch(e){}
process.exit(falhas ? 1 : 0);

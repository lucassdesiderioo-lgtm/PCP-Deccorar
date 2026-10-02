#!/usr/bin/env node
/* teste_correcao2.js — A MESA DE CORRECOES, fase 2.
 *
 *   node teste_correcao2.js
 *
 * Fase 2 da spec MESA-DE-CORRECOES (02/10/2026): Dar saida, Fechar vencidos,
 * Reabrir venda futura, Tirar da fila e Pedir ajuste. Escrito ANTES do codigo
 * (§0, risco vermelho). Os casos sao os da §6 da spec — saida carimbada na
 * data do volume e nunca hoje, venda futura recusada, fila `embalado`
 * intocavel — mais as regras dos cinco scripts que estas acoes substituem.
 *
 * Banco temporario, `app` de mentira; nao abre porta nem toca em producao.
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

const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'pcp-correcao2-'));
const db = new Database(path.join(tmp, 't.db'));
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
  INSERT INTO modelo (codigo,nome,sob_medida) VALUES ('ROLO','Rolô',0), ('SOBMEDIDA','Sob medida',1);
  INSERT INTO skus (codigo,descricao,estoque,modelo_id) VALUES
    ('BK140140BEGE','Rolo 1,40',10,1), ('BK160160CINZA','Rolo 1,60',4,1),
    ('SOBMEDIDA','Sob medida',0,2);
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
const COR = require('./correcoes');
require('./correcao_route')(app, db);

const LUCAS = {id:1, nome:'Lucas'};   // tem a Mesa e o pedido de ajuste
const JOAO  = {id:3, nome:'João'};    // tem a Mesa e NAO tem o pedido de ajuste
PERMS[1] = new Set(['correcao.executar','estoque.ajustar']);
PERMS[3] = new Set(['correcao.executar']);

function chamar(metodo, rota, corpo, quem, params, query){
  const h = rotas[metodo+' '+rota];
  if(!h) throw new Error('rota nao registrada: '+metodo+' '+rota);
  const out = { status:200, body:null };
  const res = { status(c){ out.status=c; return res; }, json(b){ out.body=b; return res; } };
  h({ body: corpo||{}, query: query||{}, params: params||{}, headers:{}, usuario: quem }, res);
  return out;
}
const vol = id => db.prepare('SELECT * FROM lote WHERE id=?').get(id) || null;
const filaL = id => db.prepare('SELECT * FROM fila WHERE id=?').get(id) || null;
const conta = t => db.prepare('SELECT COUNT(*) n FROM '+t).get().n;
const previa   = (acao,tipo,id,params,quem) => chamar('POST','/api/correcao/previa',{acao,tipo,id,params},quem||LUCAS);
const executar = (acao,tipo,id,params,motivo,quem) =>
  chamar('POST','/api/correcao/executar',{acao,tipo,id,params,motivo},quem||LUCAS);
const desfazer = (id,quem) => chamar('POST','/api/correcao/:id/desfazer',{},quem||LUCAS,{id:String(id)});
const objeto   = (tipo,id,quem) => chamar('GET','/api/correcao/:tipo/:id',null,quem||LUCAS,{tipo,id:String(id)});
const passivo  = quem => chamar('GET','/api/correcao/passivo',null,quem||LUCAS);
const buscar   = (q,quem) => chamar('GET','/api/correcao/buscar',null,quem||LUCAS,null,{q});
const acaoDe = (body, id) => (body.acoes||[]).find(a => a.id===id) || {};

const D = n => db.prepare("SELECT date('now','localtime',?) d").get((n>=0?'+':'')+n+' days').d;
const HOJE = D(0);
function volume(o){
  const campos = Object.keys(o);
  return db.prepare('INSERT INTO lote ('+campos.join(',')+') VALUES ('+campos.map(()=>'?').join(',')+')')
    .run(campos.map(k=>o[k])).lastInsertRowid;
}
function linhaFila(o){
  const campos = Object.keys(o);
  return db.prepare('INSERT INTO fila ('+campos.join(',')+') VALUES ('+campos.map(()=>'?').join(',')+')')
    .run(campos.map(k=>o[k])).lastInsertRowid;
}

/* ═════════════════════════════════════════════════════════════════════════ */
console.log('\n=== 1. DAR SAIDA — a data e a do volume, nunca hoje ===\n');

const vSaida = volume({codigo:'BK140140BEGE', buyer:'Lucélia Prado', nf:'7101', venda:'9001',
  estagio:'pendente', data:D(-20), despachar_em:D(-18)});
const vSemData = volume({codigo:'BK140140BEGE', buyer:'Sem Data', nf:'7102', venda:'9002',
  estagio:'embalado', embalado_em:D(-15)+' 10:00:00', data:D(-15)});
const vFutura = volume({codigo:'BK140140BEGE', buyer:'Futura', nf:'7103', venda:'9003',
  estagio:'embalado', embalado_em:D(-1)+' 10:00:00', data:D(-1), despachar_em:D(5)});
const vJa = volume({codigo:'BK140140BEGE', buyer:'Já Saiu', nf:'7104', venda:'9004',
  estagio:'carregado', carregado_em:D(-3)+' 11:00:00', data:D(-4)});
const vCanc = volume({codigo:'BK140140BEGE', buyer:'Cancelou', nf:'7105', venda:'9005',
  estagio:'cancelado', cancelada_em:D(-2), cancelada_estagio:'pendente', data:D(-5)});
const vColeta = volume({codigo:'BK140140BEGE', buyer:'Coleta Velha', nf:'7106', venda:'9006',
  estagio:'embalado', embalado_em:D(-9)+' 09:00:00', data:D(-9), despachar_em:D(-8), modalidade:'coleta'});
// a copia que o PDF reenviado criou do mesmo volume
const vCopia = volume({codigo:'BK140140BEGE', buyer:'Lucélia Prado', nf:'7101', venda:'9001',
  estagio:'pendente', data:D(-10), despachar_em:D(-18)});

let o = objeto('lote', vSaida);
eq('a saída vale para o pendente vencido', acaoDe(o.body,'saida').vale, true);
o = objeto('lote', vFutura);
const sFut = acaoDe(o.body,'saida');
eq('VENDA FUTURA: a saída não vale', sFut.vale, false);
ok('e o motivo diz quando ela despacha', /despacha/i.test(sFut.por_que_nao||'') && (sFut.por_que_nao||'').indexOf(D(5).slice(8,10))>=0,
   sFut.por_que_nao);
eq('volume já carregado: a saída não vale', acaoDe(objeto('lote', vJa).body,'saida').vale, false);
const sCanc = acaoDe(objeto('lote', vCanc).body,'saida');
eq('venda cancelada: a saída não vale', sCanc.vale, false);
ok('e diz que foi cancelada', /cancel/i.test(sCanc.por_que_nao||''), sCanc.por_que_nao);

let r = executar('saida','lote',vFutura,{},'saiu');
eq('executar a saída da venda futura é recusado (409)', r.status, 409);
eq('e o volume futuro continua embalado', vol(vFutura).estagio, 'embalado');

r = previa('saida','lote',vSaida,{});
eq('a prévia responde 200', r.status, 200);
ok('a prévia diz a data da saída — a do volume', (r.body.resumo||'').indexOf(D(-18).split('-').reverse().slice(0,2).join('/'))>=0 ||
   (r.body.resumo||'').indexOf(D(-18))>=0, r.body.resumo);
ok('a prévia avisa da cópia pendente que vira fantasma', /c[oó]pia/i.test(r.body.resumo||''), r.body.resumo);
eq('a prévia não grava', vol(vSaida).estagio, 'pendente');
eq('nem cria correção', conta('correcao'), 0);
eq('a prévia não mexe em estoque', (r.body.estoque||[]).length, 0);

r = executar('saida','lote',vSaida,{},'');
eq('sem motivo é recusado (400)', r.status, 400);
eq('e nada andou', vol(vSaida).estagio, 'pendente');

const saldoAntes = db.prepare("SELECT estoque FROM skus WHERE codigo='BK140140BEGE'").get().estoque;
r = executar('saida','lote',vSaida,{},'saiu pelo PDF do ML, conferido no painel');
eq('executar a saída responde 200', r.status, 200);
const cSaida = r.body.correcao_id;
eq('o volume virou carregado', vol(vSaida).estagio, 'carregado');
eq('CARIMBADO NA DATA DE DESPACHO DELE, às 15:00 — nunca hoje', vol(vSaida).carregado_em, D(-18)+' 15:00:00');
eq('o estoque não se mexeu', db.prepare("SELECT estoque FROM skus WHERE codigo='BK140140BEGE'").get().estoque, saldoAntes);
eq('a cópia pendente NÃO é apagada pela saída — ela vira fantasma', vol(vCopia).estagio, 'pendente');
ok('e agora aparece como fantasma no contador',
   (passivo().body.fantasmas.itens||[]).some(f => f.id===vCopia));
ok('a auditoria registrou', db.prepare("SELECT 1 FROM auditoria WHERE categoria='correcao' AND acao='saida'").get());

r = executar('saida','lote',vSemData,{},'saiu');
eq('volume sem despacho lido: carimba no dia em que ele entrou', vol(vSemData).carregado_em, D(-15)+' 15:00:00');

r = executar('saida','lote',vColeta,{},'o caminhão levou');
eq('coleta: carregado', vol(vColeta).estagio, 'carregado');
eq('COLETA ganha retirado_em no mesmo carimbo — senão cai no card "esperando o caminhão"',
   vol(vColeta).retirado_em, D(-8)+' 15:00:00');

// desfazer
r = desfazer(cSaida);
eq('desfazer a saída responde 200', r.status, 200);
eq('volta a pendente', vol(vSaida).estagio, 'pendente');
eq('e o carregado_em volta a vazio', vol(vSaida).carregado_em, null);
r = executar('saida','lote',vSaida,{},'de novo');
const cSaida2 = r.body.correcao_id;
db.prepare("UPDATE lote SET saida_id=77 WHERE id=?").run(vSaida);
r = desfazer(cSaida2);
eq('DESFAZER RECUSA O QUE ANDOU depois (entrou numa saída)', r.status, 409);
ok('e a recusa nomeia o campo', /saida_id/.test((r.body||{}).erro||''), (r.body||{}).erro);
eq('nada foi desfeito', vol(vSaida).estagio, 'carregado');

/* ═════════════════════════════════════════════════════════════════════════ */
console.log('\n=== 2. FECHAR VENCIDOS — em bloco, por período conferido ===\n');

const v1 = volume({codigo:'BK160160CINZA', buyer:'Vencido Um', nf:'7201', venda:'9101',
  estagio:'pendente', data:D(-12), despachar_em:D(-10)});
const v2 = volume({codigo:'BK160160CINZA', buyer:'Vencido Dois', nf:'7202', venda:'9102',
  estagio:'pendente', data:D(-12), despachar_em:D(-6), modalidade:'coleta'});
const v3 = volume({codigo:'BK160160CINZA', buyer:'Sem Data Velho', nf:'7203', venda:'9103',
  estagio:'pendente', data:D(-11)});
const vHoje = volume({codigo:'BK160160CINZA', buyer:'Vence Hoje', nf:'7204', venda:'9104',
  estagio:'pendente', data:D(-1), despachar_em:HOJE});
const vFut2 = volume({codigo:'BK160160CINZA', buyer:'Vence Depois', nf:'7205', venda:'9105',
  estagio:'pendente', data:D(-1), despachar_em:D(3)});
const vBloq = volume({codigo:'BK160160CINZA', buyer:'Bloqueado', nf:'7206', venda:'9106',
  estagio:'bloqueado', bloqueio:'sku_nao_cadastrado', data:D(-12), despachar_em:D(-10)});
const vTst = volume({codigo:'BK160160CINZA', buyer:'Teste', nf:'7207', venda:'9107',
  estagio:'pendente', data:D(-12), despachar_em:D(-10), teste:1});

const pv = passivo().body;
const idsVenc = (pv.vencidos && pv.vencidos.itens || []).map(x => x.id);
ok('o contador de vencidos existe', pv.vencidos && typeof pv.vencidos.n === 'number', JSON.stringify(pv.vencidos));
ok('ele conta o vencido e o sem data antigo', [v1,v2,v3].every(id => idsVenc.indexOf(id)>=0), JSON.stringify(idsVenc));
ok('não conta o que vence hoje (é trabalho de hoje), o futuro, o bloqueado nem o teste',
   [vHoje,vFut2,vBloq,vTst].every(id => idsVenc.indexOf(id)<0), JSON.stringify(idsVenc));

r = previa('vencidos','bloco',0,{});
eq('SEM A DATA DE CORTE é recusado — o período tem que ser conferido', r.status, 400);
r = previa('vencidos','bloco',0,{ate:D(2)});
eq('data de corte no futuro é recusada', r.status, 400);
r = previa('vencidos','bloco',0,{ate:'ontem'});
eq('data fora do formato é recusada', r.status, 400);

r = previa('vencidos','bloco',0,{ate:D(-7)});
eq('a prévia até 7 dias atrás responde 200', r.status, 200);
const idsPrev = (r.body.antes && r.body.antes.volumes || []).map(x => x.id);
ok('ela pega o vencido de 10 dias e o sem data de 11', idsPrev.indexOf(v1)>=0 && idsPrev.indexOf(v3)>=0, JSON.stringify(idsPrev));
ok('e NÃO pega o de 6 dias, que vence depois do corte', idsPrev.indexOf(v2)<0, JSON.stringify(idsPrev));
ok('nem o bloqueado nem o teste', idsPrev.indexOf(vBloq)<0 && idsPrev.indexOf(vTst)<0, JSON.stringify(idsPrev));
ok('a prévia diz o que fica de fora (futuros e bloqueados)', /bloquead/i.test(r.body.resumo||''), r.body.resumo);
ok('e manda conferir o Mercado Livre antes', /Mercado Livre/i.test(r.body.resumo||''), r.body.resumo);
eq('a prévia não grava', vol(v1).estagio, 'pendente');

r = executar('vencidos','bloco',0,{ate:HOJE},'conferido no ML: tudo entregue');
eq('fechar até hoje responde 200', r.status, 200);
const cVenc = r.body.correcao_id;
eq('o vencido virou carregado na data dele', vol(v1).carregado_em, D(-10)+' 15:00:00');
eq('o de coleta também, com retirado_em', vol(v2).retirado_em, D(-6)+' 15:00:00');
eq('o sem data, no dia em que entrou', vol(v3).carregado_em, D(-11)+' 15:00:00');
eq('o que vence hoje entrou (o corte é até hoje)', vol(vHoje).estagio, 'carregado');
eq('O FUTURO FICA — venda futura não foi despachada', vol(vFut2).estagio, 'pendente');
eq('o bloqueado fica', vol(vBloq).estagio, 'bloqueado');
eq('o teste fica', vol(vTst).estagio, 'pendente');
eq('é UMA correção para o bloco', db.prepare("SELECT COUNT(*) n FROM correcao WHERE acao='vencidos'").get().n, 1);

db.prepare("UPDATE lote SET estagio='embalado' WHERE id=?").run(v2);   // alguem mexeu num deles
r = desfazer(cVenc);
eq('desfazer o bloco com UM volume que andou é recusado', r.status, 409);
ok('a recusa nomeia o volume', ((r.body||{}).erro||'').indexOf('#'+v2)>=0, (r.body||{}).erro);
eq('e nenhum foi reaberto (tudo ou nada)', vol(v1).estagio, 'carregado');
db.prepare("UPDATE lote SET estagio='carregado' WHERE id=?").run(v2);
r = desfazer(cVenc);
eq('com o bloco intacto, desfaz', r.status, 200);
ok('todos voltam a pendente, sem carimbo', [v1,v2,v3,vHoje].every(id => vol(id).estagio==='pendente' && !vol(id).carregado_em));
eq('e o retirado_em da coleta volta a vazio', vol(v2).retirado_em, null);

/* ═════════════════════════════════════════════════════════════════════════ */
console.log('\n=== 3. REABRIR VENDA FUTURA — carregado numa data que nao chegou ===\n');

const vFechadaFut = volume({codigo:'BK140140BEGE', buyer:'Fechada Antes', nf:'7301', venda:'9201',
  estagio:'carregado', embalado_em:D(-2)+' 10:00:00', carregado_em:D(9)+' 15:00:00', data:D(-2), despachar_em:D(9)});
const vFechadaPend = volume({codigo:'BK140140BEGE', buyer:'Nunca Impressa', nf:'7302', venda:'9202',
  estagio:'carregado', carregado_em:D(4)+' 15:00:00', data:D(-2), despachar_em:D(4)});
const vOk = volume({codigo:'BK140140BEGE', buyer:'Saiu Ontem', nf:'7303', venda:'9203',
  estagio:'carregado', embalado_em:D(-2)+' 10:00:00', carregado_em:D(-1)+' 15:00:00', data:D(-2)});

const pv3 = passivo().body;
ok('o contador de futuras fechadas existe e as conta',
   pv3.futuras && (pv3.futuras.itens||[]).map(x=>x.id).indexOf(vFechadaFut)>=0, JSON.stringify(pv3.futuras));
ok('e não conta o que saiu ontem', (pv3.futuras.itens||[]).map(x=>x.id).indexOf(vOk)<0);
eq('reabrir não vale para quem saiu ontem', acaoDe(objeto('lote', vOk).body,'reabrir').vale, false);

r = executar('reabrir','lote',vFechadaFut,{},'fechado antes da hora pelo script');
eq('reabrir responde 200', r.status, 200);
eq('a impressa volta a EMBALADO', vol(vFechadaFut).estagio, 'embalado');
eq('sem carregado_em', vol(vFechadaFut).carregado_em, null);
r = executar('reabrir','lote',vFechadaPend,{},'fechado antes da hora');
eq('A QUE NUNCA FOI IMPRESSA VOLTA A PENDENTE — embalado sem a baixa é a armadilha #27',
   vol(vFechadaPend).estagio, 'pendente');
const cReab = r.body.correcao_id;
r = desfazer(cReab);
eq('desfazer a reabertura devolve o carimbo', vol(vFechadaPend).carregado_em, D(4)+' 15:00:00');

/* ═════════════════════════════════════════════════════════════════════════ */
console.log('\n=== 4. TIRAR DA FILA — a linha embalada e intocavel ===\n');

const fVelha = linhaFila({codigo:'BK140140BEGE', revisado_em:D(-45)+' 08:00:00', data:D(-45)});
const fHoje  = linhaFila({codigo:'BK140140BEGE'});
const fEmb   = linhaFila({codigo:'BK140140BEGE', situacao:'embalado', embalado_em:D(-40)+' 09:00:00',
                          revisado_em:D(-40)+' 08:00:00', data:D(-40)});
const fDev   = linhaFila({codigo:'BK160160CINZA', modo:'devolucao', revisado_em:D(-35)+' 08:00:00', data:D(-35)});
const fTst   = linhaFila({codigo:'BK140140BEGE', revisado_em:D(-50)+' 08:00:00', data:D(-50), teste:1});

const pv4 = passivo().body;
const idsFila = (pv4.fila && pv4.fila.itens || []).map(x => x.id);
ok('o contador da fila velha conta a linha de 45 dias', idsFila.indexOf(fVelha)>=0, JSON.stringify(pv4.fila));
ok('e não conta a de hoje (é trabalho), a embalada nem a de teste',
   [fHoje,fEmb,fTst].every(id => idsFila.indexOf(id)<0), JSON.stringify(idsFila));

o = objeto('fila', fEmb);
eq('a Mesa abre a linha da fila', o.status, 200);
const tEmb = acaoDe(o.body,'fila');
eq('LINHA EMBALADA: tirar não vale', tEmb.vale, false);
ok('e diz que é história de peça que virou estoque', /estoque/i.test(tEmb.por_que_nao||''), tEmb.por_que_nao);
r = executar('fila','fila',fEmb,{},'limpar');
eq('executar na linha embalada é recusado', r.status, 409);
ok('e ela continua lá', !!filaL(fEmb));

r = previa('fila','fila',fHoje,{});
ok('a prévia da linha de HOJE avisa que pode haver peça no carrinho', /carrinho/i.test(r.body.resumo||''), r.body.resumo);
r = previa('fila','fila',fDev,{});
ok('a prévia da linha de devolução avisa do vínculo', /devolu/i.test(r.body.resumo||''), r.body.resumo);

const sFila = db.prepare("SELECT estoque FROM skus WHERE codigo='BK140140BEGE'").get().estoque;
r = executar('fila','fila',fVelha,{},'passivo do período de testes');
eq('tirar a linha velha responde 200', r.status, 200);
ok('a linha sumiu', !filaL(fVelha));
eq('o estoque não se mexeu — a fila nunca somou +1', db.prepare("SELECT estoque FROM skus WHERE codigo='BK140140BEGE'").get().estoque, sFila);
const cFila = r.body.correcao_id;
r = desfazer(cFila);
eq('desfazer devolve a linha', r.status, 200);
eq('com o mesmo id e a mesma data de revisão', (filaL(fVelha)||{}).revisado_em, D(-45)+' 08:00:00');
r = executar('fila','fila',fVelha,{},'de novo');
const cFila2 = r.body.correcao_id;
linhaFila({id:fVelha, codigo:'BK160160CINZA'});      // o id foi reusado por outra linha
r = desfazer(cFila2);
eq('desfazer por cima de um id ocupado é recusado', r.status, 409);

/* ═════════════════════════════════════════════════════════════════════════ */
console.log('\n=== 5. O SKU NA MESA E O PEDIDO DE AJUSTE ===\n');

r = buscar('BK140140BEGE');
ok('a busca pelo código devolve o SKU', (r.body.skus||[]).some(s => s.codigo==='BK140140BEGE'), JSON.stringify(r.body.skus));
ok('e as linhas de fila aguardando dele', (r.body.fila||[]).some(f => f.id===fHoje), JSON.stringify(r.body.fila));

o = objeto('sku', 'BK140140BEGE');
eq('a Mesa abre o SKU', o.status, 200);
ok('com o saldo e o extrato', typeof o.body.sku.estoque === 'number' && Array.isArray(o.body.extrato));
const aj = acaoDe(o.body,'ajuste');
eq('pedir ajuste vale para quem tem estoque.ajustar', aj.vale, true);
eq('e aponta a porta do pedido, que é a do ajuste em duas pessoas', aj.porta, '/api/estoque/ajuste');
const ajJ = acaoDe(objeto('sku','BK140140BEGE', JOAO).body,'ajuste');
eq('sem a permissão de pedir ajuste, não vale', ajJ.vale, false);
ok('e diz qual permissão falta', /ajust/i.test(ajJ.por_que_nao||''), ajJ.por_que_nao);
r = executar('ajuste','sku','BK140140BEGE',{delta:-1},'quebrou');
eq('A MESA NÃO APLICA AJUSTE — ela não tem ação de estoque direto', r.status, 409);
r = previa('ajuste','sku','BK140140BEGE',{delta:-1});
eq('nem faz prévia dele: o pedido vai pela porta do ajuste', r.status, 409);
ok('e a recusa diz qual é a porta', /\/api\/estoque\/ajuste/.test((r.body||{}).erro||''), (r.body||{}).erro);
require('./ajuste_dominio').pedir(db, {codigo:'BK140140BEGE', delta:-1, motivo:'Avaria', obs:'', quem:LUCAS});
const ajP = acaoDe(objeto('sku','BK140140BEGE').body,'ajuste');
eq('com um pedido pendente, não vale outro', ajP.vale, false);
ok('e diz quem pediu', /Lucas/.test(ajP.por_que_nao||''), ajP.por_que_nao);
const ajS = acaoDe(objeto('sku','SOBMEDIDA').body,'ajuste');
eq('sob medida não tem saldo para ajustar', ajS.vale, false);

/* ═════════════════════════════════════════════════════════════════════════ */
console.log('\n=== 6. A CHAVE ===\n');
r = previa('saida','lote',vSaida,{}, {id:9, nome:'Sem Chave'});
eq('sem correcao.executar, a prévia é recusada (403)', r.status, 403);

console.log('\n' + (n - falhas) + ' ok, ' + falhas + ' falha(s)\n');
try{ db.close(); fs.rmSync(tmp, { recursive:true, force:true }); }catch(e){}
process.exit(falhas ? 1 : 0);

#!/usr/bin/env node
/* teste_correcao_f2.js — A MESA DE CORRECOES, fase 2 (02/10/2026).
 *
 *   node teste_correcao_f2.js
 *
 * Escrito ANTES do codigo, como a §0 pede no risco vermelho. As cinco acoes
 * que ate aqui so existiam como script no servidor:
 *
 *   Dar saida        a regra do regularizar_saida.js — a data e a DO VOLUME, as
 *                    15:00, nunca hoje; venda futura recusada; as copias
 *                    pendentes do mesmo volume saem junto (com as pecas)
 *   Fechar vencidos  a do fechar_vencidos.js — em bloco, por data conferida;
 *                    nao toca o futuro nem o bloqueado
 *   Reabrir futura   a do reabrir_futuros.js — so carregado_em DEPOIS de hoje
 *   Tirar da fila    a do limpar_fila.js — so `aguardando`; `embalado` intocavel
 *   Pedir ajuste     abre o pedido do ajuste_dominio; o saldo NAO anda, e quem
 *                    aprova e outra pessoa (§18, fase 3)
 *
 * Mais os tres contadores que faltavam (vencidos, futuras fechadas, fila velha)
 * e o desfazer de cada uma, que recusa o que andou.
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
  INSERT INTO modelo (codigo,nome,sob_medida) VALUES ('ROLO','Rolô',0);
  INSERT INTO skus (codigo,descricao,estoque,modelo_id) VALUES
    ('BK140140BEGE','Rolo 1,40',10,1), ('BK160160CINZA','Rolo 1,60',4,1), ('BK120120BEGE','Rolo 1,20',6,1);
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
const CARGA = require('./carga');
require('./correcao_route')(app, db);

const LUCAS = {id:1, nome:'Lucas'};   // Mesa + pedir ajuste
const BIA   = {id:3, nome:'Bia'};     // Mesa, SEM estoque.ajustar
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
const dia = d => db.prepare("SELECT date('now','localtime',?) d").get((d>=0?'+':'')+d+' day').d;
const br = d => d.split('-').reverse().join('/');
const HOJE = dia(0), ONTEM = dia(-1), ANTEONTEM = dia(-2), AMANHA = dia(1);
const saldo = c => db.prepare('SELECT estoque FROM skus WHERE codigo=?').get(c).estoque;
const vol = id => db.prepare('SELECT * FROM lote WHERE id=?').get(id) || null;
const linhaFila = id => db.prepare('SELECT * FROM fila WHERE id=?').get(id) || null;
const conta = (t, w) => db.prepare('SELECT COUNT(*) n FROM '+t+(w?' WHERE '+w:'')).get().n;
function livroFecha(){
  return db.prepare(`SELECT s.codigo, s.estoque,
      COALESCE((SELECT SUM(delta) FROM movimento_estoque m WHERE m.codigo=s.codigo),0) soma
    FROM skus s`).all().filter(r => r.estoque !== r.soma);
}
const previa   = (acao,tipo,id,params,quem) => chamar('POST','/api/correcao/previa',{acao,tipo,id,params},quem||LUCAS);
const executar = (acao,tipo,id,params,motivo,quem) =>
  chamar('POST','/api/correcao/executar',{acao,tipo,id,params,motivo},quem||LUCAS);
const desfazer = (id,quem) => chamar('POST','/api/correcao/:id/desfazer',{},quem||LUCAS,{id:String(id)});
const objeto   = (tipo,id,quem) => chamar('GET','/api/correcao/:tipo/:id',null,quem||LUCAS,{tipo,id:String(id)});
const passivo  = () => chamar('GET','/api/correcao/passivo',null,LUCAS).body;
const acaoDe = (body, id) => (body.acoes||[]).find(a => a.id===id) || {};

function volume(o){
  const campos = Object.keys(o);
  return db.prepare('INSERT INTO lote ('+campos.join(',')+') VALUES ('+campos.map(()=>'?').join(',')+')')
    .run(campos.map(k=>o[k])).lastInsertRowid;
}
function fila(o){
  const campos = Object.keys(o);
  return db.prepare('INSERT INTO fila ('+campos.join(',')+') VALUES ('+campos.map(()=>'?').join(',')+')')
    .run(campos.map(k=>o[k])).lastInsertRowid;
}

/* ═══ 1. DAR SAÍDA — a regra do regularizar_saida.js ════════════════════════ */
console.log('\n1. Dar saída');
const SAI = volume({codigo:'BK140140BEGE', buyer:'Geison Sobrinho', nf:'6001', venda:'2000018000000001',
  packId:'2000015000000001', estagio:'pendente', data:ANTEONTEM, despachar_em:ONTEM});
/* a copia que o PDF reenviado criou, com uma peca pendurada */
const COPIA = volume({codigo:'BK140140BEGE', buyer:'Geison Sobrinho', venda:'2000018000000001',
  estagio:'pendente', data:ONTEM, despachar_em:ONTEM});
db.prepare("INSERT INTO lote_item (lote_id,codigo,qtd) VALUES (?, 'BK140140BEGE', 1)").run(COPIA);

let r = objeto('lote', SAI);
eq('o volume pendente vencido oferece "Dar saída"', acaoDe(r.body,'saida').vale, true);
r = previa('saida','lote',SAI,null);
eq('a prévia responde 200', r.status, 200);
ok('a prévia diz a data do volume às 15:00, e não hoje', r.body.resumo.indexOf(br(ONTEM)+' às 15:00')>=0, r.body.resumo);
ok('a prévia avisa da cópia que sai junto', r.body.resumo.indexOf('#'+COPIA)>=0 && /c[óo]pia/i.test(r.body.resumo), r.body.resumo);
eq('a prévia não grava: o volume continua pendente', vol(SAI).estagio, 'pendente');
eq('a prévia não grava: a cópia continua lá', !!vol(COPIA), true);

r = executar('saida','lote',SAI,null,'');
eq('executar sem motivo é recusado (400)', r.status, 400);
const saldo140 = saldo('BK140140BEGE');
r = executar('saida','lote',SAI,null,'saiu por fora do sistema em 01/10, conferido no ML');
eq('executar responde 200', r.status, 200);
const C_SAIDA = r.body.correcao_id;
eq('o volume vira carregado', vol(SAI).estagio, 'carregado');
eq('a saída é carimbada na data do DESPACHO, às 15:00 — nunca hoje', vol(SAI).carregado_em, ONTEM + ' 15:00:00');
eq('a cópia pendente do mesmo volume sai', vol(COPIA), null);
eq('e a peça da cópia sai junto (sem lote_item órfão)', conta('lote_item','lote_id='+COPIA), 0);
eq('Dar saída não mexe em estoque', saldo('BK140140BEGE'), saldo140);
eq('o livro continua fechando', livroFecha().length, 0);
eq('a correção fica gravada, com o motivo', db.prepare('SELECT motivo FROM correcao WHERE id=?').get(C_SAIDA).motivo,
   'saiu por fora do sistema em 01/10, conferido no ML');
ok('e vai para a auditoria', conta('auditoria',"categoria='correcao' AND acao='saida'") === 1);

const FUT = volume({codigo:'BK160160CINZA', buyer:'Lucélia', estagio:'embalado', embalado_em:ONTEM+' 10:00:00',
  data:ONTEM, despachar_em:AMANHA});
r = objeto('lote', FUT);
eq('venda futura não oferece "Dar saída"', acaoDe(r.body,'saida').vale, false);
ok('e diz em qual data ela despacha', /despacha/i.test(acaoDe(r.body,'saida').por_que_nao||'') &&
   (acaoDe(r.body,'saida').por_que_nao||'').indexOf(br(AMANHA))>=0, acaoDe(r.body,'saida').por_que_nao);
r = executar('saida','lote',FUT,null,'tentando');
eq('e a rota recusa (409), mesmo chamada por fora da tela', r.status, 409);
eq('a venda futura continua embalada', vol(FUT).estagio, 'embalado');

r = executar('saida','lote',SAI,null,'de novo');
eq('volume já carregado é recusado', r.status, 409);

const CANCV = volume({codigo:'BK120120BEGE', estagio:'cancelado', cancelada_estagio:'pendente',
  cancelada_em:ONTEM, data:ANTEONTEM, despachar_em:ONTEM});
r = executar('saida','lote',CANCV,null,'x');
eq('venda cancelada não "sai" (409)', r.status, 409);

const SEMDATA = volume({codigo:'BK120120BEGE', estagio:'pendente', data:ANTEONTEM});
r = executar('saida','lote',SEMDATA,null,'saiu');
eq('sem despacho lido, vale a data de entrada às 15:00', vol(SEMDATA).carregado_em, ANTEONTEM + ' 15:00:00');

const COL = volume({codigo:'BK120120BEGE', estagio:'embalado', embalado_em:ANTEONTEM+' 09:00:00',
  data:ANTEONTEM, despachar_em:ONTEM, modalidade:'coleta'});
r = executar('saida','lote',COL,null,'o caminhão levou');
eq('coleta: ganha retirado_em com o mesmo carimbo (o caminhão levou)', vol(COL).retirado_em, ONTEM + ' 15:00:00');
eq('coleta: saiu_por fica coleta', vol(COL).saiu_por, 'coleta');
eq('coleta: não fica parada no card "esperando o caminhão"',
   conta('lote', 'id='+COL+' AND '+CARGA.AGUARDA_CAMINHAO), 0);

r = desfazer(C_SAIDA);
eq('desfazer a saída responde 200', r.status, 200);
eq('o volume volta a pendente', vol(SAI).estagio, 'pendente');
eq('o carimbo some', vol(SAI).carregado_em, null);
eq('a cópia volta com o mesmo id', !!vol(COPIA), true);
eq('e a peça da cópia volta junto', conta('lote_item','lote_id='+COPIA), 1);

r = executar('saida','lote',SAI,null,'agora sim');
const C_SAIDA2 = r.body.correcao_id;
db.prepare('UPDATE lote SET saida_id=99 WHERE id=?').run(SAI);
r = desfazer(C_SAIDA2);
eq('desfazer recusa o volume que andou depois (409)', r.status, 409);
ok('e diz o campo que mudou', /saida_id/.test(r.body.erro||''), r.body.erro);
eq('nada foi desfeito', vol(SAI).estagio, 'carregado');
db.prepare('UPDATE lote SET saida_id=NULL WHERE id=?').run(SAI);

/* ═══ 2. FECHAR VENCIDOS — a regra do fechar_vencidos.js ═══════════════════ */
console.log('\n2. Fechar vencidos');
const V1 = volume({codigo:'BK140140BEGE', estagio:'pendente', data:dia(-5), despachar_em:dia(-4)});
const V2 = volume({codigo:'BK160160CINZA', estagio:'pendente', data:dia(-3), despachar_em:dia(-3)});
const V3 = volume({codigo:'BK120120BEGE', estagio:'pendente', data:dia(-6)});          // sem data lida
const VF = volume({codigo:'BK120120BEGE', estagio:'pendente', data:ONTEM, despachar_em:AMANHA});  // futuro
const VB = volume({codigo:'XPTO', estagio:'bloqueado', data:dia(-5), despachar_em:dia(-4)});      // bloqueado
const VE = volume({codigo:'BK140140BEGE', estagio:'embalado', embalado_em:dia(-4)+' 10:00:00',
  data:dia(-5), despachar_em:dia(-4)});

const p = passivo();
ok('o contador "vencidos" conta os pendentes com despacho já passado', (p.vencidos||{}).n >= 2,
   JSON.stringify(p.vencidos && p.vencidos.n));
ok('e não conta o futuro', !((p.vencidos||{}).itens||[]).some(x => x.id === VF));
ok('e não conta o bloqueado', !((p.vencidos||{}).itens||[]).some(x => x.id === VB));

r = previa('vencidos','periodo',0,{ate:AMANHA});
eq('data de corte no futuro é recusada (venda futura não foi despachada)', r.status, 409);
r = previa('vencidos','periodo',0,{ate:'ontem'});
eq('data fora do formato é recusada', r.status, 400);
r = previa('vencidos','periodo',0,{});
eq('sem data de corte, recusa (é de quem conferiu o período)', r.status, 400);

r = previa('vencidos','periodo',0,{ate:dia(-3)});
eq('a prévia do bloco responde 200', r.status, 200);
ok('a prévia conta os que vão fechar', /\b3\b/.test(r.body.resumo), r.body.resumo);
ok('a prévia diz o que fica de fora (despacho depois do corte e bloqueado)', /depois de/i.test(r.body.resumo) && /bloquead/i.test(r.body.resumo), r.body.resumo);
eq('a prévia não grava', vol(V1).estagio, 'pendente');

r = executar('vencidos','periodo',0,{ate:dia(-3)},'conferi no ML: nada pendente até ' + dia(-3));
eq('fechar o bloco responde 200', r.status, 200);
const C_VENC = r.body.correcao_id;
eq('V1 sai na data DELE, às 15:00', vol(V1).carregado_em, dia(-4) + ' 15:00:00');
eq('V2 sai na data DELE, às 15:00', vol(V2).carregado_em, dia(-3) + ' 15:00:00');
eq('o sem data sai na data de entrada', vol(V3).carregado_em, dia(-6) + ' 15:00:00');
eq('o futuro não é tocado', vol(VF).estagio, 'pendente');
eq('o bloqueado não é tocado', vol(VB).estagio, 'bloqueado');
eq('o embalado não é tocado', vol(VE).estagio, 'embalado');
eq('uma correção só, para o bloco', conta('correcao',"acao='vencidos'"), 1);

db.prepare("UPDATE lote SET estagio='pendente', carregado_em=NULL WHERE id=?").run(V2);
r = desfazer(C_VENC);
eq('desfazer o bloco recusa se UM deles andou (409)', r.status, 409);
eq('e não desfaz nenhum', vol(V1).estagio, 'carregado');
db.prepare("UPDATE lote SET estagio='carregado', carregado_em=? WHERE id=?").run(dia(-3)+' 15:00:00', V2);
r = desfazer(C_VENC);
eq('com tudo como ficou, desfazer o bloco responde 200', r.status, 200);
eq('V1 volta a pendente', vol(V1).estagio, 'pendente');
eq('V3 volta sem carimbo', vol(V3).carregado_em, null);

/* ═══ 3. REABRIR VENDA FUTURA — a regra do reabrir_futuros.js ══════════════ */
console.log('\n3. Reabrir venda futura');
const RF = volume({codigo:'BK160160CINZA', buyer:'Lucélia', estagio:'carregado', embalado_em:dia(-2)+' 10:00:00',
  data:dia(-3), despachar_em:dia(14), carregado_em:dia(14)+' 15:00:00'});
const RP = volume({codigo:'BK160160CINZA', estagio:'carregado', data:dia(-3), despachar_em:dia(5),
  carregado_em:dia(5)+' 15:00:00'});   // nunca teve etiqueta
const RO = volume({codigo:'BK160160CINZA', estagio:'carregado', embalado_em:dia(-2)+' 10:00:00',
  data:dia(-3), carregado_em:ONTEM+' 15:00:00'});

ok('o contador "futuras fechadas" acha a saída no futuro', ((passivo().futuras||{}).itens||[]).some(x => x.id === RF));
r = objeto('lote', RO);
eq('saída no passado não oferece reabrir', acaoDe(r.body,'reabrir').vale, false);
r = executar('reabrir','lote',RO,null,'x');
eq('e a rota recusa', r.status, 409);

const s160 = saldo('BK160160CINZA');
r = executar('reabrir','lote',RF,null,'carimbada com data de setembro — a peça está na prateleira');
eq('reabrir responde 200', r.status, 200);
const C_REAB = r.body.correcao_id;
eq('com etiqueta impressa, volta a embalado', vol(RF).estagio, 'embalado');
eq('e perde o carimbo do futuro', vol(RF).carregado_em, null);
eq('reabrir não mexe em estoque', saldo('BK160160CINZA'), s160);
r = executar('reabrir','lote',RP,null,'nunca teve etiqueta');
eq('sem etiqueta impressa, volta a PENDENTE (não teve a baixa)', vol(RP).estagio, 'pendente');

r = desfazer(C_REAB);
eq('desfazer o reabrir responde 200', r.status, 200);
eq('volta a carregado com o carimbo de antes', vol(RF).carregado_em, dia(14) + ' 15:00:00');

/* ═══ 4. TIRAR DA FILA — a regra do limpar_fila.js ═════════════════════════ */
console.log('\n4. Tirar da fila');
const F_VELHA = fila({codigo:'BK140140BEGE', revisado_em:dia(-60)+' 08:00:00', data:dia(-60)});
const F_VELHA2 = fila({codigo:'BK160160CINZA', revisado_em:dia(-40)+' 08:00:00', data:dia(-40)});
const F_HOJE  = fila({codigo:'BK140140BEGE'});
const F_EMB   = fila({codigo:'BK140140BEGE', situacao:'embalado', embalado_em:dia(-50)+' 09:00:00',
  revisado_em:dia(-50)+' 08:00:00', data:dia(-50)});

const pf = passivo();
eq('o contador "fila velha" conta as aguardando com mais de 30 dias', (pf.fila_velha||{}).n, 2);
ok('e não conta a de hoje', !((pf.fila_velha||{}).itens||[]).some(x => x.id === F_HOJE));

r = objeto('fila', F_EMB);
eq('a linha embalada não oferece "Tirar da fila"', acaoDe(r.body,'fila').vale, false);
r = executar('fila','fila',F_EMB,null,'x');
eq('e a rota recusa (é história de peça que virou estoque)', r.status, 409);

const s140 = saldo('BK140140BEGE');
r = executar('fila','fila',F_VELHA,null,'revisão de teste de agosto, sem peça física');
eq('tirar uma linha responde 200', r.status, 200);
const C_FILA = r.body.correcao_id;
eq('a linha sai', linhaFila(F_VELHA), null);
eq('tirar da fila não mexe em estoque', saldo('BK140140BEGE'), s140);
r = desfazer(C_FILA);
eq('desfazer devolve a linha com o mesmo id', !!linhaFila(F_VELHA), true);

r = previa('fila_velha','periodo',0,{ate:dia(-31)});
eq('a prévia da fila velha responde 200', r.status, 200);
ok('ela conta as duas', /\b2\b/.test(r.body.resumo), r.body.resumo);
r = executar('fila_velha','periodo',0,{ate:dia(-31)},'inventário de 02/10 zerou a fila velha');
eq('tirar a fila velha responde 200', r.status, 200);
eq('as duas velhas saem', conta('fila', 'id IN ('+F_VELHA+','+F_VELHA2+')'), 0);
eq('a de hoje fica', !!linhaFila(F_HOJE), true);
eq('a embalada fica', !!linhaFila(F_EMB), true);

/* ═══ 5. PEDIR AJUSTE — o saldo NÃO anda ═══════════════════════════════════ */
console.log('\n5. Pedir ajuste de saldo');
r = objeto('sku', 'BK120120BEGE');
eq('o SKU abre na Mesa', r.status, 200);
eq('e oferece "Pedir ajuste"', acaoDe(r.body,'ajuste').vale, true);

r = executar('ajuste','sku','BK120120BEGE',{delta:-2, motivo:'Peça danificada'},'duas quebradas no carrinho', BIA);
eq('sem estoque.ajustar, pedir ajuste é recusado (403)', r.status, 403);
r = executar('ajuste','sku','BK120120BEGE',{delta:-2},'faltou o motivo da lista');
eq('sem o motivo da lista, recusa (400)', r.status, 400);

const s120 = saldo('BK120120BEGE');
r = executar('ajuste','sku','BK120120BEGE',{delta:-2, motivo:'Peça danificada'},'duas quebradas no carrinho');
eq('pedir ajuste responde 200', r.status, 200);
const C_AJ = r.body.correcao_id;
eq('o saldo NÃO anda — outra pessoa aprova', saldo('BK120120BEGE'), s120);
const ped = db.prepare("SELECT * FROM ajuste_pedido WHERE codigo='BK120120BEGE'").get();
eq('nasce um pedido pendente', ped && ped.status, 'pendente');
eq('em delta', ped && ped.delta, -2);
eq('pedido por quem estava na Mesa', ped && ped.pedido_por, 'Lucas');

r = objeto('sku', 'BK120120BEGE');
eq('com pedido aberto, o SKU não oferece outro', acaoDe(r.body,'ajuste').vale, false);

r = desfazer(C_AJ);
eq('desfazer o pedido responde 200', r.status, 200);
eq('o pedido vira desistido (nada se apaga)',
   db.prepare('SELECT status FROM ajuste_pedido WHERE id=?').get(ped.id).status, 'desistido');
eq('e o saldo continua onde estava', saldo('BK120120BEGE'), s120);

/* ═══ 6. A busca e o livro ═════════════════════════════════════════════════ */
console.log('\n6. A busca e o livro');
r = chamar('GET','/api/correcao/buscar',null,LUCAS,null,{q:'BK120120BEGE'});
ok('a busca acha o SKU', (r.body.skus||[]).some(s => s.codigo === 'BK120120BEGE'), JSON.stringify(r.body.skus));
eq('o livro fecha no fim de tudo', livroFecha().length, 0);

console.log('\n' + (falhas ? falhas + ' FALHA(S) em ' + n : 'tudo certo — ' + n + ' casos'));
db.close();
fs.rmSync(tmp, { recursive:true, force:true });
process.exit(falhas ? 1 : 0);

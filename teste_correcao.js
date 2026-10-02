#!/usr/bin/env node
/* teste_correcao.js — A MESA DE CORRECOES, fase 1.
 *
 *   node teste_correcao.js
 *
 * Fase 1 da spec MESA-DE-CORRECOES (02/10/2026). Escrito ANTES do codigo, como
 * a §0 pede no risco vermelho. Os casos sao os da §6 da spec, mais os das tres
 * decisoes do dono ao aprovar o plano:
 *   1. o `limpar_fantasmas.js` passa a LER a regua do `correcoes.js` ja nesta
 *      fase — duas copias seriam o botao e o terminal discordando sobre qual
 *      volume e fantasma (armadilha #12);
 *   2. "a persiana voltou" devolve POR PECA (a caixa de pacote baixou N, §5
 *      #23), e a caixa de varias com um item cancelado NAO tem essa acao: o
 *      sistema nao sabe qual peca foi cancelada;
 *   3. sem backfill de permissao (o Admin Geral passa por nivel), e os
 *      contadores da fase 1 sao os DOIS que tem botao.
 *
 * Sobe um banco temporario e chama os handlers direto, com um `app` de
 * mentira. Nao abre porta, nao toca no banco de producao.
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

const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'pcp-correcao-'));
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
  INSERT INTO modelo (codigo,nome,sob_medida) VALUES ('ROLO','Rolô',0), ('SOBMEDIDA','Sob medida',1);
  INSERT INTO skus (codigo,descricao,estoque,modelo_id) VALUES
    ('BK140140BEGE','Rolo 1,40',10,1), ('BK160160CINZA','Rolo 1,60',4,1),
    ('BK120120BEGE','Rolo 1,20',6,1), ('SOBMEDIDA','Sob medida',0,2);
`);
const ESTOQUE = require('./estoque_dominio');
ESTOQUE.garantirSchema(db);
/* A abertura do livro, pra soma comecar batendo com a coluna — e o primeiro
   caso de todos e justamente `SUM(delta) = skus.estoque`. */
ESTOQUE.abertura(db);

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

const LUCAS = {id:1, nome:'Lucas'};   // tem a chave
const ANA   = {id:2, nome:'Ana'};     // nao tem
PERMS[1] = new Set(['correcao.executar','estoque.ajustar']);
PERMS[2] = new Set(['etiqueta.emitir']);

function chamar(metodo, rota, corpo, quem, params, query){
  const h = rotas[metodo+' '+rota];
  if(!h) throw new Error('rota nao registrada: '+metodo+' '+rota);
  const out = { status:200, body:null };
  const res = { status(c){ out.status=c; return res; }, json(b){ out.body=b; return res; } };
  h({ body: corpo||{}, query: query||{}, params: params||{}, headers:{}, usuario: quem }, res);
  return out;
}
const saldo = c => db.prepare('SELECT estoque FROM skus WHERE codigo=?').get(c).estoque;
const vol = id => db.prepare('SELECT * FROM lote WHERE id=?').get(id) || null;
const conta = t => db.prepare('SELECT COUNT(*) n FROM '+t).get().n;
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
const acaoDe = (body, id) => (body.acoes||[]).find(a => a.id===id) || {};

/* ─── os volumes do cenario ─────────────────────────────────────────────────
   Nomes com o caso real atras, pra recusa e relatorio dizerem algo. */
function volume(o){
  const campos = Object.keys(o);
  return db.prepare('INSERT INTO lote ('+campos.join(',')+') VALUES ('+campos.map(()=>'?').join(',')+')')
    .run(campos.map(k=>o[k])).lastInsertRowid;
}
function peca(lote_id, codigo, qtd){
  return db.prepare('INSERT INTO lote_item (lote_id,codigo,qtd,conferidos) VALUES (?,?,?,?)')
    .run(lote_id, codigo, qtd, qtd).lastInsertRowid;
}

console.log('\n=== 1. O SCHEMA, A CHAVE E O MODO TESTE ===\n');

ok('`correcao` existe depois do garantirSchema',
   !!db.prepare("SELECT 1 FROM sqlite_master WHERE type='table' AND name='correcao'").get());
let antes = conta('correcao');
COR.garantirSchema(db);
eq('garantirSchema e idempotente', conta('correcao'), antes);
const colsCor = db.prepare('PRAGMA table_info(correcao)').all().map(c=>c.name);
ok('a tabela tem antes/depois em JSON, motivo, quem e o desfeita_em',
   ['acao','alvo_tipo','alvo_id','motivo','antes','depois','usuario_id','usuario_nome',
    'criado_em','desfeita_em','desfeita_por','teste'].every(c => colsCor.indexOf(c)>=0),
   'faltam: '+['acao','alvo_tipo','alvo_id','motivo','antes','depois','usuario_id','usuario_nome',
    'criado_em','desfeita_em','desfeita_por','teste'].filter(c=>colsCor.indexOf(c)<0).join(', '));

const SRC_TESTE = fs.readFileSync('teste_route.js','utf8');
ok('`correcao` entra em TABELAS do modo teste (§11)', /nome:\s*'correcao'/.test(SRC_TESTE));

const PERMISSOES = require('./permissoes');
const chaveCor = (PERMISSOES.PERMISSOES || PERMISSOES).find(p => p.chave === 'correcao.executar');
ok('a chave `correcao.executar` existe em permissoes.js', !!chaveCor);
eq('   e e nivel admin', chaveCor && chaveCor.nivel, 'admin');
eq('   e e sensivel', !!(chaveCor && chaveCor.sensivel), true);

const SRC_ACESSO = fs.readFileSync('acesso.js','utf8');
ok('o permDaRota() declara /api/correcao — sem a linha a rota nasce NEGADA (§10 #29)',
   /api\/correcao/.test(SRC_ACESSO) && /correcao\.executar/.test(SRC_ACESSO));
ok('e NAO ha backfill da chave: o Admin Geral passa por nivel (decisao 3)',
   !/seed_correcao/.test(SRC_ACESSO));

console.log('\n=== 2. O FANTASMA — a regua e de UM lugar so ===\n');

// #1 embalado + #2 pendente, mesma venda: #2 e fantasma (a #5 do CLAUDE.md)
const v1 = volume({codigo:'BK140140BEGE', buyer:'Abraao Amorim', nf:'6501', venda:'2000018016683414',
                   packId:'2000014610097547', estagio:'embalado', embalado_em:'2026-09-20 10:00:00', data:'2026-09-20'});
const v2 = volume({codigo:'BK140140BEGE', buyer:'Abraao Amorim', nf:'6501', venda:'2000018016683414',
                   packId:'2000014610097547', estagio:'pendente', data:'2026-09-25'});
// #3 pendente + #4 pendente: duvidoso, nao e fantasma
const v3 = volume({codigo:'BK120120BEGE', buyer:'Silvio Pereira', nf:'6502', venda:'2000018468081338',
                   estagio:'pendente', data:'2026-09-21'});
const v4 = volume({codigo:'BK120120BEGE', buyer:'Silvio Pereira', nf:'6502', venda:'2000018468081338',
                   estagio:'pendente', data:'2026-09-25'});
// #5 bloqueado + #6 pendente: tambem duvidoso (pode ser o SKU cadastrado no meio)
const v5 = volume({codigo:'BK160160CINZA', buyer:'Ryta Rufino', nf:'6503', packId:'2000015040457349',
                   estagio:'bloqueado', bloqueio:'sku_nao_cadastrado', data:'2026-09-22'});
const v6 = volume({codigo:'BK160160CINZA', buyer:'Ryta Rufino', nf:'6503', packId:'2000015040457349',
                   estagio:'pendente', data:'2026-09-25'});
// #7 sem venda e sem pack: sem chave, nao entra na conversa
const v7 = volume({codigo:'BK140140BEGE', buyer:'Dona Lizete', nf:'6504', estagio:'pendente', data:'2026-09-25'});
// #8 carregado + #9 pendente, caixa de PACOTE (duas pecas) — o fantasma com lote_item
const v8 = volume({codigo:'BK120120BEGE', buyer:'Fabiano Pereira', nf:'6585', packId:'2000015040457350',
                   venda:'2000018468081339', estagio:'carregado', embalado_em:'2026-09-18 09:00:00',
                   carregado_em:'2026-09-18 15:00:00', data:'2026-09-18'});
const v9 = volume({codigo:'BK120120BEGE', buyer:'Fabiano Pereira', nf:'6585', packId:'2000015040457350',
                   venda:'2000018468081339', estagio:'pendente', data:'2026-09-25'});
peca(v9, 'BK120120BEGE', 1); peca(v9, 'BK140140BEGE', 2);

const cls = COR.classificarFantasmas(db);
const idsF = cls.fantasmas.map(o=>o.v.id);
ok('o pendente cujo irmao mais antigo esta embalado E fantasma', idsF.indexOf(v2)>=0);
ok('   e o carregado tambem conta como "andou"', idsF.indexOf(v9)>=0);
ok('o irmao mais antigo PENDENTE nao vira fantasma', idsF.indexOf(v4)<0);
ok('   e sai na lista de duvidosos', cls.duvidosos.map(o=>o.v.id).indexOf(v4)>=0);
ok('o irmao mais antigo BLOQUEADO nao vira fantasma', idsF.indexOf(v6)<0);
ok('volume sem venda e sem pack fica de fora (sem chave nao da pra afirmar)', idsF.indexOf(v7)<0);
ok('o volume que JA ANDOU nunca e fantasma — e historia', idsF.indexOf(v1)<0 && idsF.indexOf(v8)<0);
eq('sao exatamente dois fantasmas no cenario', idsF.length, 2);

let r = objeto('lote', v2);
eq('o objeto traz a acao do fantasma como valendo', acaoDe(r.body,'fantasma').vale, true);
r = objeto('lote', v4);
eq('e no duvidoso ela NAO vale', acaoDe(r.body,'fantasma').vale, false);
ok('   e aparece com o motivo escrito, em vez de sumir (§5.5)',
   /mais antigo|ainda n[aã]o andou|pendente/i.test(acaoDe(r.body,'fantasma').por_que_nao||''),
   'veio: '+acaoDe(r.body,'fantasma').por_que_nao);

const SRC_LIMPAR = fs.readFileSync('limpar_fantasmas.js','utf8');
ok('o limpar_fantasmas.js LE a regua do correcoes.js (decisao 1)',
   /require\(['"]\.\/correcoes['"]\)/.test(SRC_LIMPAR));
ok('   e nao tem mais a copia do laco dele', !/const\s+primeiro\s*=\s*\{\}/.test(SRC_LIMPAR));

console.log('\n=== 3. O FANTASMA — previa, executar, e o saldo intocado ===\n');

const antesLote = conta('lote'), antesItem = conta('lote_item'), antesCor = conta('correcao');
r = previa('fantasma','lote',v9);
eq('a previa responde ok', r.body && r.body.ok, true);
eq('   e NAO grava: nenhum volume saiu', conta('lote'), antesLote);
eq('   nem linha de correcao', conta('correcao'), antesCor);
eq('   e ela diz que nao mexe em estoque', (r.body.estoque||[]).length, 0);
ok('   e diz o volume que fica (o mais antigo)', String(r.body.resumo||'').indexOf('#'+v8)>=0,
   'veio: '+r.body.resumo);

r = executar('fantasma','lote',v9,null,'');
eq('executar sem motivo e recusado', r.status, 400);
eq('   e nada foi gravado', conta('lote'), antesLote);

const saldosAntes = ['BK120120BEGE','BK140140BEGE'].map(saldo);
r = executar('fantasma','lote',v9,null,'Duplicata do PDF reenviado — o volume real e o #'+v8);
eq('executar responde ok', r.body && r.body.ok, true);
const cFant = r.body.correcao_id;
eq('o volume fantasma saiu', vol(v9), null);
ok('o volume mais antigo FICA', !!vol(v8));
eq('as pecas do fantasma sairam junto — nunca linha orfa (§11)',
   db.prepare('SELECT COUNT(*) n FROM lote_item WHERE lote_id=?').get(v9).n, 0);
eq('   e as dos outros volumes nao foram tocadas', conta('lote_item'), antesItem - 2);
eq('o saldo NAO andou (pendente nunca teve o -1)',
   ['BK120120BEGE','BK140140BEGE'].map(saldo).join(','), saldosAntes.join(','));
eq('e o livro continua fechando', livroFecha().length, 0);
const linCor = db.prepare('SELECT * FROM correcao WHERE id=?').get(cFant);
eq('a correcao guarda a acao', linCor.acao, 'fantasma');
eq('   o alvo', linCor.alvo_tipo+':'+linCor.alvo_id, 'lote:'+v9);
ok('   o motivo, inteiro', String(linCor.motivo).indexOf('o volume real e o #'+v8) > 0,
   'veio: '+linCor.motivo);
eq('   e quem fez', linCor.usuario_nome, 'Lucas');
ok('   o `antes` carrega o volume inteiro', JSON.parse(linCor.antes).lote.nf === '6585');
eq('   e as pecas dele, pro desfazer poder devolver', JSON.parse(linCor.antes).itens.length, 2);
eq('a correcao vai para a auditoria',
   db.prepare("SELECT COUNT(*) n FROM auditoria WHERE categoria='correcao'").get().n, 1);

console.log('\n=== 4. O FANTASMA — desfazer ===\n');

r = desfazer(cFant);
eq('desfazer responde ok', r.body && r.body.ok, true);
ok('o volume volta com o MESMO id', !!vol(v9));
eq('   com a NF que tinha', vol(v9).nf, '6585');
eq('   e o estagio de antes', vol(v9).estagio, 'pendente');
eq('as pecas voltam', db.prepare('SELECT SUM(qtd) n FROM lote_item WHERE lote_id=?').get(v9).n, 3);
eq('e o livro continua fechando', livroFecha().length, 0);
r = desfazer(cFant);
eq('desfazer duas vezes e recusado', r.status, 409);

// refaz, e ocupa o id: desfazer tem que recusar em vez de sobrescrever
r = executar('fantasma','lote',v9,null,'Duplicata, segunda rodada');
const cFant2 = r.body.correcao_id;
db.prepare('INSERT INTO lote (id,codigo,buyer,estagio) VALUES (?,?,?,?)')
  .run(v9, 'BK160160CINZA', 'Outro cliente', 'pendente');
r = desfazer(cFant2);
eq('desfazer recusa quando outro volume ocupou o id', r.status, 409);
ok('   e diz o que esta no lugar', /j[aá] existe|ocupad/i.test(String((r.body||{}).erro||'')),
   'veio: '+(r.body||{}).erro);
db.prepare('DELETE FROM lote WHERE id=?').run(v9);

console.log('\n=== 5. A CANCELADA DEPOIS DA ETIQUETA — quando a acao vale ===\n');

const ESTAGIO_CANC = 'cancelado';
// A: cancelada depois da etiqueta, UMA peca — o caso tipico
const c1 = volume({codigo:'BK140140BEGE', buyer:'Paula Cristine', nf:'6959', venda:'2000018578029006',
                   estagio:ESTAGIO_CANC, cancelada_estagio:'embalado', cancelada_em:'2026-10-01 09:18:00',
                   cancelada_motivo:'Venda cancelada. Nao envie.', embalado_em:'2026-09-30 11:00:00',
                   data:'2026-09-30'});
// B: cancelada depois da etiqueta, caixa de PACOTE de 3 pecas em 2 SKUs
const c2 = volume({codigo:'BK120120BEGE', buyer:'Fabiano Pereira', nf:'6586', venda:'2000018468081340',
                   packId:'2000015040457351', estagio:ESTAGIO_CANC, cancelada_estagio:'carregado',
                   cancelada_em:'2026-10-01 09:18:00', cancelada_motivo:'Cancelada pelo comprador',
                   embalado_em:'2026-09-29 10:00:00', carregado_em:'2026-09-29 15:00:00', data:'2026-09-29'});
peca(c2, 'BK120120BEGE', 1); peca(c2, 'BK140140BEGE', 2);
// C: cancelada ANTES da etiqueta (era pendente) — nao baixou, nao tem o que devolver
const c3 = volume({codigo:'BK160160CINZA', buyer:'Joverlandia Silva', nf:'6960', venda:'2000018578029007',
                   estagio:ESTAGIO_CANC, cancelada_estagio:'pendente', cancelada_em:'2026-10-01 09:18:00',
                   data:'2026-09-30'});
// D: caixa de VARIAS com UM item cancelado — o volume nem e cancelado
const c4 = volume({codigo:'BK120120BEGE', buyer:'Silmara Costa', nf:'6961', packId:'2000015040457352',
                   estagio:'embalado', cancelada_varias:1, cancelada_origem:'planilha',
                   cancelada_motivo:'Cancelada pelo comprador', cancelada_aviso_em:'2026-10-01 09:18:00',
                   embalado_em:'2026-09-30 12:00:00', data:'2026-09-30'});
peca(c4, 'BK120120BEGE', 1); peca(c4, 'BK140140BEGE', 1);
// F: cancelada depois da etiqueta que NINGUEM decide — e ela que fica no card
const c6 = volume({codigo:'BK120120BEGE', buyer:'Geison Sobrinho', nf:'6963', venda:'2000018578029009',
                   estagio:ESTAGIO_CANC, cancelada_estagio:'embalado', cancelada_em:'2026-10-01 09:18:00',
                   cancelada_motivo:'Pacote cancelado pelo Mercado Livre', embalado_em:'2026-09-30 14:00:00',
                   data:'2026-09-30'});
// E: sob medida cancelada depois da etiqueta — nunca baixou (§7)
const c5 = volume({codigo:'SOBMEDIDA', buyer:'Anderson Souza', nf:'6962', venda:'2000018578029008',
                   estagio:ESTAGIO_CANC, cancelada_estagio:'embalado', cancelada_em:'2026-10-01 09:18:00',
                   embalado_em:'2026-09-30 13:00:00', data:'2026-09-30'});

r = objeto('lote', c1);
eq('a acao vale no volume cancelado depois da etiqueta', acaoDe(r.body,'cancelada').vale, true);
ok('   e ela tem as DUAS saidas', (acaoDe(r.body,'cancelada').opcoes||[]).length === 2,
   'veio: '+JSON.stringify(acaoDe(r.body,'cancelada').opcoes));
r = objeto('lote', c3);
eq('no cancelado ANTES da etiqueta a acao nao vale', acaoDe(r.body,'cancelada').vale, false);
ok('   porque nada baixou', /n[aã]o baixou|antes da etiqueta|sem a etiqueta/i.test(acaoDe(r.body,'cancelada').por_que_nao||''),
   'veio: '+acaoDe(r.body,'cancelada').por_que_nao);
r = objeto('lote', c4);
eq('na caixa de VARIAS a acao existe', acaoDe(r.body,'cancelada').vale, true);
eq('   mas so com UMA saida: registrar (decisao 2)', (acaoDe(r.body,'cancelada').opcoes||[]).length, 1);
eq('   e a saida que sobra e o "nao voltou"', (acaoDe(r.body,'cancelada').opcoes||[])[0] &&
   (acaoDe(r.body,'cancelada').opcoes||[])[0].id, 'registrar');
ok('   dizendo que o sistema nao sabe QUAL peca foi cancelada',
   /qual|n[aã]o sabe/i.test(acaoDe(r.body,'cancelada').nota_voltou||''),
   'veio: '+acaoDe(r.body,'cancelada').nota_voltou);
r = executar('cancelada','lote',c4,{voltou:true},'A persiana voltou');
eq('e o "voltou" na caixa de varias e RECUSADO pelo servidor', r.status, 409);
eq('   sem gravar nada', db.prepare("SELECT COUNT(*) n FROM movimento_estoque WHERE tipo='cancelamento'").get().n, 0);

console.log('\n=== 6. A CANCELADA — o estoque volta POR PECA ===\n');

r = previa('cancelada','lote',c1,{voltou:true});
eq('a previa do "voltou" diz o movimento', (r.body.estoque||[]).length, 1);
eq('   com o SKU e o delta', (r.body.estoque||[])[0] &&
   (r.body.estoque[0].codigo+':'+r.body.estoque[0].delta), 'BK140140BEGE:1');
eq('   e nao grava', db.prepare("SELECT COUNT(*) n FROM movimento_estoque WHERE tipo='cancelamento'").get().n, 0);

const s140 = saldo('BK140140BEGE');
r = executar('cancelada','lote',c1,{voltou:true},'Cliente devolveu na agencia — peca conferida e na prateleira');
eq('executar o "voltou" responde ok', r.body && r.body.ok, true);
eq('o saldo subiu 1', saldo('BK140140BEGE'), s140 + 1);
const mov1 = db.prepare("SELECT * FROM movimento_estoque WHERE tipo='cancelamento' ORDER BY id DESC").get();
eq('o movimento e do tipo cancelamento', mov1.tipo, 'cancelamento');
eq('   com a referencia da correcao', mov1.referencia, 'correcao:'+r.body.correcao_id);
ok('   e o motivo escrito', /Cliente devolveu/.test(mov1.motivo||''), 'veio: '+mov1.motivo);
eq('e o livro fecha', livroFecha().length, 0);

const s120b = saldo('BK120120BEGE'), s140b = saldo('BK140140BEGE');
r = previa('cancelada','lote',c2,{voltou:true});
eq('na caixa de PACOTE a previa traz uma linha por SKU', (r.body.estoque||[]).length, 2);
r = executar('cancelada','lote',c2,{voltou:true},'As tres persianas voltaram na caixa');
eq('o SKU de 1 peca sobe 1', saldo('BK120120BEGE'), s120b + 1);
eq('e o de 2 unidades sobe 2 — por PECA, nao por linha (decisao 2)', saldo('BK140140BEGE'), s140b + 2);
eq('e o livro fecha', livroFecha().length, 0);

const movsSob = db.prepare("SELECT COUNT(*) n FROM movimento_estoque WHERE codigo='SOBMEDIDA'").get().n;
r = previa('cancelada','lote',c5,{voltou:true});
eq('o sob medida nao tem o que devolver (§7)', (r.body.estoque||[]).length, 0);
r = executar('cancelada','lote',c5,{voltou:true},'Voltou — sob medida');
eq('   e executar nao gera movimento nenhum nele',
   db.prepare("SELECT COUNT(*) n FROM movimento_estoque WHERE codigo='SOBMEDIDA'").get().n, movsSob);
eq('   e o saldo dele continua zero', saldo('SOBMEDIDA'), 0);

const movsAntes = conta('movimento_estoque');
r = executar('cancelada','lote',c3,{voltou:false},'Nao voltou — perdida no transporte');
eq('o cancelado ANTES da etiqueta nem com "registrar" e aceito', r.status, 409);
r = executar('cancelada','lote',c4,{voltou:false},'Avisado o admin — a caixa foi separada');
eq('"registrar" na caixa de varias e aceito', r.body && r.body.ok, true);
eq('   e nao gera movimento nenhum', conta('movimento_estoque'), movsAntes);
r = executar('cancelada','lote',c1,{voltou:false},'ja decidido');
eq('o volume ja resolvido nao e aceito de novo', r.status, 409);

console.log('\n=== 7. A CANCELADA — o card esvazia, e o desfazer volta o movimento ===\n');

const CANC = require('./cancelada_dominio');
const noCard = CANC.listar(db).map(v=>v.id);
ok('o volume resolvido sai do card de Bloqueados', noCard.indexOf(c1) < 0);
ok('   e o que ainda nao foi decidido continua la', noCard.indexOf(c6) >= 0);
ok('   (a cancelada ANTES da etiqueta nunca esteve no card)', noCard.indexOf(c3) < 0);
ok('a caixa de varias registrada tambem sai', noCard.indexOf(c4) < 0);

const sAntes = saldo('BK140140BEGE');
const cCanc = db.prepare("SELECT id FROM correcao WHERE acao='cancelada' AND alvo_id=? ORDER BY id DESC").get(c1).id;
r = desfazer(cCanc);
eq('desfazer o "voltou" responde ok', r.body && r.body.ok, true);
eq('   e devolve o saldo', saldo('BK140140BEGE'), sAntes - 1);
const movInv = db.prepare("SELECT * FROM movimento_estoque ORDER BY id DESC").get();
eq('   com o movimento inverso, tambem referenciado na correcao', movInv.referencia, 'correcao:'+cCanc);
eq('e o livro fecha', livroFecha().length, 0);
ok('o volume volta para o card', CANC.listar(db).map(v=>v.id).indexOf(c1) >= 0);

// o volume andou depois: desfazer recusa
r = executar('cancelada','lote',c1,{voltou:false},'Nao voltou');
const cCanc2 = r.body.correcao_id;
db.prepare("UPDATE lote SET estagio='carregado' WHERE id=?").run(c1);
r = desfazer(cCanc2);
eq('desfazer recusa objeto que ANDOU depois', r.status, 409);
ok('   dizendo o que mudou', /estagio|andou|mudou/i.test(String((r.body||{}).erro||'')),
   'veio: '+(r.body||{}).erro);
db.prepare("UPDATE lote SET estagio=? WHERE id=?").run(ESTAGIO_CANC, c1);

console.log('\n=== 8. BUSCAR, O PASSIVO E O HISTORICO ===\n');

const achaIds = q => ((chamar('GET','/api/correcao/buscar',null,LUCAS,{},{q}).body||{}).volumes||[]).map(v=>v.id);
ok('busca pelo numero do volume', achaIds(String(c2)).indexOf(c2)>=0);
ok('busca pela venda', achaIds('2000018468081340').indexOf(c2)>=0);
ok('busca pelo pack', achaIds('2000015040457351').indexOf(c2)>=0);
ok('busca pela NF', achaIds('6586').indexOf(c2)>=0);
ok('busca por parte do nome do cliente', achaIds('fabiano').indexOf(c2)>=0);
ok('busca pelo SKU', achaIds('BK160160CINZA').indexOf(c3)>=0);
eq('busca vazia nao varre o banco', achaIds('').length, 0);

const passivo = (chamar('GET','/api/correcao/passivo',null,LUCAS).body||{});
eq('o passivo conta os fantasmas', passivo.fantasmas && passivo.fantasmas.n, 1);
ok('   e lista quem sao', (passivo.fantasmas.itens||[]).map(x=>x.id).indexOf(v2)>=0);
eq('o passivo conta as canceladas que faltam decidir', passivo.canceladas && passivo.canceladas.n, 1);
ok('   e e a que ninguem decidiu', (passivo.canceladas.itens||[]).map(x=>x.id).indexOf(c6)>=0);
/* Decisao 3: cada contador chega JUNTO com a acao que o zera. Na fase 1 eram
   dois; a fase 2 trouxe os outros tres com os botoes deles. Contador sem acao
   nesta lista e a trava que acusa e nao sabe liberar. */
eq('e sao os contadores que tem botao, nada mais (decisao 3)', Object.keys(passivo).filter(k=>k!=='ok').sort().join(','),
   'canceladas,fantasmas,fila,futuras,vencidos');

const hist = (chamar('GET','/api/correcao/historico',null,LUCAS).body||{}).itens||[];
ok('o historico lista as correcoes, a mais nova em cima', hist.length >= 4 && hist[0].id > hist[1].id);
ok('   e diz quais foram desfeitas', hist.some(h => !!h.desfeita_em));

console.log('\n=== 9. A PERMISSAO ===\n');

for(const [metodo, rota, params] of [['GET','/api/correcao/passivo',null],
                                     ['GET','/api/correcao/buscar',null],
                                     ['GET','/api/correcao/historico',null],
                                     ['GET','/api/correcao/:tipo/:id',{tipo:'lote',id:String(c3)}],
                                     ['POST','/api/correcao/previa',null],
                                     ['POST','/api/correcao/executar',null],
                                     ['POST','/api/correcao/:id/desfazer',{id:'1'}]]){
  const out = chamar(metodo, rota, {acao:'fantasma',tipo:'lote',id:v2,motivo:'x'}, ANA, params, {q:'6586'});
  eq('sem correcao.executar, '+metodo+' '+rota+' da 403', out.status, 403);
}
eq('e nada foi gravado por quem nao pode', conta('correcao'),
   db.prepare('SELECT COUNT(*) n FROM correcao').get().n);

console.log('');
console.log(falhas ? '>>> ' + falhas + ' de ' + n + ' FALHARAM' : '>>> todos os ' + n + ' casos passaram');
db.close(); fs.rmSync(tmp, {recursive:true, force:true});
process.exit(falhas ? 1 : 0);

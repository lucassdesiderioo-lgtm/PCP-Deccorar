#!/usr/bin/env node
/* teste_baixa_conferencia.js — A BAIXA SAI DA IMPRESSAO E VAI PARA A CONFERENCIA.
 *
 *   node teste_baixa_conferencia.js
 *
 * Fase 2-A da spec CONFERENCIA-E-BAIXA (22/10/2026). Escrito ANTES do codigo
 * (§0, risco vermelho). O que ele trava:
 *   - imprimir a etiqueta de venda NAO mexe no saldo: so reserva a peca;
 *   - a trava da impressao olha o DISPONIVEL (saldo − reservado), senao a
 *     mesma peca sai em duas etiquetas;
 *   - a conferencia (area e canto) baixa POR PECA, uma vez so;
 *   - o "foi no caminhao" da saida baixa a caixa que ninguem conferiu, e ela
 *     continua sem conferencia;
 *   - sob medida nao baixa em caminho nenhum;
 *   - a VIRADA: o que foi impresso antes ja baixou, e nao baixa de novo;
 *   - urgencia e inventario olham o que esta na prateleira;
 *   - o grafico conta a saida pela data da baixa;
 *   - a Mesa: nunca devolve saldo (desde a 2-B o "voltou" e o Sobrou); "fechar
 *     conferencias antigas" so fecha caixa que ja baixou;
 *   - o livro fecha (SUM(delta) = skus.estoque) depois de tudo.
 *
 * Banco temporario, `app` de mentira; nao abre porta nem toca em producao.
 */
const Database = require('better-sqlite3');
const fs = require('fs'), os = require('os'), path = require('path');

const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'pcp-baixa-'));
process.env.PCP_DIR = tmp;

let n = 0, falhas = 0;
function ok(desc, cond, detalhe){
  n++;
  if(cond) console.log('  ok  ' + n + ' — ' + desc);
  else { falhas++; console.log('  FALHOU ' + n + ' — ' + desc + (detalhe ? '\n         ' + detalhe : '')); }
}
function eq(desc, achado, esperado){
  ok(desc, achado === esperado, 'esperado ' + JSON.stringify(esperado) + ', veio ' + JSON.stringify(achado));
}

const db = new Database(path.join(tmp, 't.db'));
db.pragma('foreign_keys = OFF');
db.exec(`
  CREATE TABLE config (chave TEXT PRIMARY KEY, valor TEXT);
  CREATE TABLE auditoria (id INTEGER PRIMARY KEY AUTOINCREMENT, usuario_id INTEGER, usuario_nome TEXT,
    categoria TEXT, acao TEXT, alvo TEXT, detalhe TEXT, ip TEXT,
    criado_em TEXT DEFAULT (datetime('now','localtime')));
  CREATE TABLE modelo (id INTEGER PRIMARY KEY AUTOINCREMENT, codigo TEXT, nome TEXT,
    exige_medida INTEGER DEFAULT 1, sob_medida INTEGER DEFAULT 0);
  CREATE TABLE cor (codigo TEXT PRIMARY KEY, nome TEXT);
  CREATE TABLE tecido (codigo TEXT PRIMARY KEY, nome TEXT);
  CREATE TABLE skus (codigo TEXT PRIMARY KEY, descricao TEXT DEFAULT '', cor TEXT DEFAULT '',
    estoque INTEGER DEFAULT 0, alvo INTEGER DEFAULT 0, modelo_id INTEGER, ativo INTEGER DEFAULT 1,
    largura_cm INTEGER, altura_cm INTEGER, cor_codigo TEXT, tecido_codigo TEXT);
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
    cancelada_resolvida_em TEXT, cancelada_resolvida_por TEXT, cancelada_voltou INTEGER, cancelada_por TEXT);
  CREATE TABLE lote_item (id INTEGER PRIMARY KEY AUTOINCREMENT, lote_id INTEGER NOT NULL,
    codigo TEXT, qtd INTEGER DEFAULT 1, cor TEXT, descricao TEXT, origem TEXT DEFAULT 'folha',
    conferido_em TEXT, conferido_por TEXT, criado_em TEXT DEFAULT (datetime('now','localtime')),
    teste INTEGER DEFAULT 0, conferidos INTEGER DEFAULT 0, conferidos_carga INTEGER DEFAULT 0);
  CREATE TABLE montagem (id INTEGER PRIMARY KEY AUTOINCREMENT, codigo TEXT,
    data TEXT DEFAULT (date('now','localtime')), teste INTEGER DEFAULT 0);
  CREATE TABLE fila (id INTEGER PRIMARY KEY AUTOINCREMENT, codigo TEXT,
    modo TEXT DEFAULT 'hoje', situacao TEXT DEFAULT 'aguardando',
    revisado_em TEXT DEFAULT (datetime('now','localtime')), embalado_em TEXT,
    data TEXT DEFAULT (date('now','localtime')), teste INTEGER DEFAULT 0);
  INSERT INTO modelo (codigo,nome,sob_medida,exige_medida) VALUES ('ROLO','Rolô',0,1), ('SOBMEDIDA','Sob medida',1,0);
  INSERT INTO skus (codigo,descricao,estoque,modelo_id) VALUES
    ('BK140140BEGE','Rolo 1,40 bege',5,1), ('BK160160CINZA','Rolo 1,60 cinza',1,1),
    ('BK120120BRANCO','Rolo 1,20 branco',4,1), ('SOBMEDIDA','Sob medida',0,2);
`);
const ESTOQUE = require('./estoque_dominio');
ESTOQUE.garantirSchema(db);
ESTOQUE.abertura(db);
require('./ajuste_dominio').garantirSchema(db);

const D = k => db.prepare("SELECT date('now','localtime',?) d").get((k>=0?'+':'')+k+' days').d;
const HOJE = D(0);
function volume(o){
  const campos = Object.keys(o);
  return db.prepare('INSERT INTO lote ('+campos.join(',')+') VALUES ('+campos.map(()=>'?').join(',')+')')
    .run(campos.map(k=>o[k])).lastInsertRowid;
}
const vol = id => db.prepare('SELECT * FROM lote WHERE id=?').get(id);
const saldo = c => db.prepare('SELECT estoque FROM skus WHERE codigo=?').get(c).estoque;
const movs = (ref, tipo) => db.prepare('SELECT codigo, delta FROM movimento_estoque WHERE referencia=?'
  + (tipo ? ' AND tipo=?' : '') + ' ORDER BY id').all(...(tipo ? [ref, tipo] : [ref]));
const livroFecha = () => db.prepare(`SELECT s.codigo, s.estoque, COALESCE((SELECT SUM(delta) FROM movimento_estoque m
    WHERE m.codigo=s.codigo),0) soma FROM skus s`).all().every(r => r.estoque === r.soma);

/* ═════════════════════════════════════════════════════════════════════════
   A VIRADA — o banco como ele esta no dia do deploy, antes do modulo novo. */
const vAntigo = volume({codigo:'BK140140BEGE', buyer:'Impressa Antes', nf:'5001', venda:'8001', codes:'["P8001"]',
  estagio:'embalado', embalado_em:D(-1)+' 10:00:00', impresso_por:'Ana', data:D(-1), despachar_em:HOJE});
const vAntigoSaiu = volume({codigo:'BK140140BEGE', buyer:'Saiu Antes', nf:'5002', venda:'8002',
  estagio:'carregado', embalado_em:D(-3)+' 10:00:00', carregado_em:D(-3)+' 15:00:00', data:D(-3)});
const vAntigoPend = volume({codigo:'BK140140BEGE', buyer:'Pendente Antes', nf:'5003', venda:'8003',
  estagio:'pendente', data:D(-1)});

console.log('\n=== 1. A VIRADA — o que ja foi impresso ja baixou ===\n');
const BAIXA = require('./baixa_dominio');
BAIXA.garantirSchema(db);
eq('a caixa impressa antes do deploy fica como baixada, na hora da impressao',
   vol(vAntigo).baixado_em, D(-1)+' 10:00:00');
eq('a que ja saiu tambem', vol(vAntigoSaiu).baixado_em, D(-3)+' 10:00:00');
eq('a pendente nao (nunca teve etiqueta)', vol(vAntigoPend).baixado_em, null);
ok('a virada se marca no config', !!db.prepare("SELECT 1 FROM config WHERE chave='virada_baixa_conferencia'").get());
const vDepois = volume({codigo:'BK140140BEGE', buyer:'Impressa Depois', nf:'5004', venda:'8004',
  estagio:'embalado', embalado_em:HOJE+' 08:00:00', data:HOJE});
BAIXA.garantirSchema(db);
eq('A VIRADA RODA UMA VEZ SO: a caixa impressa depois dela continua sem baixa', vol(vDepois).baixado_em, null);
db.prepare('DELETE FROM lote WHERE id=?').run(vDepois);
eq('a caixa antiga nao reserva — ela ja baixou', (BAIXA.reservados(db)['BK140140BEGE'] || 0), 0);

/* As rotas de verdade. */
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
  get(p,...h){ rotas['GET '+p]=h[h.length-1]; }, post(p,...h){ rotas['POST '+p]=h[h.length-1]; }
};
require('./exp_route')(app, db);
require('./etq_route')(app, db);
require('./carreg_route')(app, db);
require('./saida_route')(app, db);
require('./correcao_route')(app, db);
const ANA = {id:1, nome:'Ana'}, BETO = {id:2, nome:'Beto'};
PERMS[1] = new Set(['correcao.executar']); PERMS[2] = new Set(['correcao.executar']);
function chamar(k, corpo, quem, params, query){
  return new Promise(resolve => {
    const out = { status:200 };
    const res = { status(c){ out.status=c; return res; }, json(b){ out.body=b; resolve(out); return res; },
                  send(b){ out.body=b; resolve(out); return res; } };
    try{ const r = rotas[k]({ body:corpo||{}, query:query||{}, params:params||{}, headers:{}, usuario:quem||null }, res);
         if(r && r.catch) r.catch(e => { out.status=500; out.body={erro:String(e&&e.message)}; resolve(out); }); }
    catch(e){ out.status=500; out.body={erro:String(e&&e.message)}; resolve(out); }
  });
}
const imprimir = (id, quem) => chamar('POST /api/embalar', {id}, quem || ANA);
const conferir = (code, quem) => chamar('POST /api/carregar', {code}, quem || BETO);
const FOTO = 'data:image/jpeg;base64,' + Buffer.alloc(3000, 7).toString('base64');

(async () => {
  /* ═══════════════════════════════════════════════════════════════════════ */
  console.log('\n=== 2. IMPRIMIR — reserva, nao baixa ===\n');
  const linhasAntes = db.prepare('SELECT COUNT(*) n FROM movimento_estoque').get().n;
  const vA = volume({codigo:'BK140140BEGE', buyer:'Agencia Um', nf:'6001', venda:'9001', codes:'["P9001"]',
    estagio:'pendente', data:HOJE, despachar_em:HOJE});
  let r = await imprimir(vA);
  ok('a impressao responde ok', r.body && r.body.ok, JSON.stringify(r.body));
  eq('O SALDO NAO SE MEXE na impressao', saldo('BK140140BEGE'), 5);
  eq('e o livro nao ganha linha', db.prepare('SELECT COUNT(*) n FROM movimento_estoque').get().n, linhasAntes);
  eq('o volume vira embalado', vol(vA).estagio, 'embalado');
  eq('e fica SEM baixa', vol(vA).baixado_em, null);
  eq('a peca fica reservada', BAIXA.reservados(db)['BK140140BEGE'], 1);
  eq('o disponivel desce', BAIXA.disponivel(db, 'BK140140BEGE'), 4);

  /* ═══════════════════════════════════════════════════════════════════════ */
  console.log('\n=== 3. A TRAVA OLHA O DISPONIVEL — uma peca, uma etiqueta ===\n');
  const vB1 = volume({codigo:'BK160160CINZA', buyer:'Cinza Um', nf:'6101', venda:'9101', codes:'["P9101"]',
    estagio:'pendente', data:HOJE, despachar_em:HOJE});
  const vB2 = volume({codigo:'BK160160CINZA', buyer:'Cinza Dois', nf:'6102', venda:'9102', codes:'["P9102"]',
    estagio:'pendente', data:HOJE, despachar_em:HOJE});
  r = await imprimir(vB1);
  ok('a primeira venda da unica peca imprime', r.body && r.body.ok, JSON.stringify(r.body));
  r = await imprimir(vB2);
  ok('A SEGUNDA E RECUSADA — a peca ja esta numa caixa etiquetada', r.body && !r.body.ok && /estoque/i.test(r.body.erro || ''),
     JSON.stringify(r.body));
  eq('e a segunda continua pendente', vol(vB2).estagio, 'pendente');
  r = await chamar('GET /api/proximo/:sku', null, ANA, {sku:'BK160160CINZA'});
  eq('o bipe do SKU na Etiqueta de Venda mostra o LIVRE (0), e nao o saldo (1)', r.body && r.body.estoque, 0);
  r = await chamar('GET /api/pendentes', null, ANA);
  const linhaB = (r.body || []).find(l => l.codigo === 'BK160160CINZA');
  eq('a lista "Faltam imprimir" tambem mostra o livre', linhaB && linhaB.estoque, 0);

  /* ═══════════════════════════════════════════════════════════════════════ */
  console.log('\n=== 4. A CONFERENCIA BAIXA — na area (agencia) ===\n');
  r = await conferir('P9001');
  ok('a conferencia responde ok', r.body && r.body.ok, JSON.stringify(r.body));
  eq('A BAIXA ACONTECE NA CONFERENCIA', saldo('BK140140BEGE'), 4);
  const mA = movs('lote:' + vA);
  ok('uma linha no livro, tipo conferencia, −1', mA.length === 1 && mA[0].delta === -1 &&
     db.prepare("SELECT tipo FROM movimento_estoque WHERE referencia=?").get('lote:' + vA).tipo === 'conferencia',
     JSON.stringify(mA));
  ok('o volume ganha baixado_em', !!vol(vA).baixado_em);
  eq('a reserva some', BAIXA.reservados(db)['BK140140BEGE'] || 0, 0);
  eq('e o disponivel nao muda (saiu da reserva e do saldo juntos)', BAIXA.disponivel(db, 'BK140140BEGE'), 4);
  r = await conferir('P9001');
  ok('bipar de novo e recusado', r.body && !r.body.ok, JSON.stringify(r.body));
  eq('E NAO BAIXA DE NOVO', saldo('BK140140BEGE'), 4);
  r = await conferir('P8001');
  ok('a caixa impressa ANTES da virada e conferida', r.body && r.body.ok, JSON.stringify(r.body));
  eq('E NAO BAIXA DUAS VEZES — ela baixou na impressao', saldo('BK140140BEGE'), 4);
  eq('nenhuma linha nova para ela', movs('lote:' + vAntigo, 'conferencia').length, 0);

  /* ═══════════════════════════════════════════════════════════════════════ */
  console.log('\n=== 5. NO CANTO DA COLETA ===\n');
  const vC = volume({codigo:'BK140140BEGE', buyer:'Coleta Um', nf:'6201', venda:'9201', codes:'["P9201"]',
    estagio:'pendente', data:HOJE, despachar_em:HOJE, modalidade:'coleta'});
  await imprimir(vC);
  eq('impressa, o saldo continua', saldo('BK140140BEGE'), 4);
  r = await conferir('P9201');
  ok('a conferencia leva pro canto', r.body && r.body.ok && vol(vC).estagio === 'carregado', JSON.stringify(r.body));
  eq('e baixa', saldo('BK140140BEGE'), 3);

  /* ═══════════════════════════════════════════════════════════════════════ */
  console.log('\n=== 6. A CAIXA DE VARIAS PERSIANAS — baixa por peca, quando fecha ===\n');
  const vV = volume({codigo:'BK140140BEGE', buyer:'Pacote', nf:'6301', venda:'9301', codes:'["P9301"]',
    estagio:'pendente', data:HOJE, despachar_em:HOJE});
  db.prepare("INSERT INTO lote_item (lote_id,codigo,qtd,conferidos) VALUES (?,?,1,1),(?,?,2,2)")
    .run(vV, 'BK140140BEGE', vV, 'BK120120BRANCO');
  r = await imprimir(vV);
  ok('a caixa de varias imprime', r.body && r.body.ok, JSON.stringify(r.body));
  eq('reserva as tres persianas (branco: 2)', BAIXA.reservados(db)['BK120120BRANCO'], 2);
  eq('o saldo do branco nao se mexe', saldo('BK120120BRANCO'), 4);
  r = await conferir('P9301');
  eq('a conferencia pede as pecas', r.body && r.body.motivo, 'conferir_pecas');
  eq('e ainda nao baixou', saldo('BK120120BRANCO'), 4);
  await chamar('POST /api/carregar/peca', {lote_id:vV, sku:'BK120120BRANCO'}, BETO);
  await chamar('POST /api/carregar/peca', {lote_id:vV, sku:'BK120120BRANCO'}, BETO);
  eq('com uma peca faltando, nada baixa', saldo('BK120120BRANCO'), 4);
  r = await chamar('POST /api/carregar/peca', {lote_id:vV, sku:'BK140140BEGE'}, BETO);
  ok('a ultima peca fecha a caixa', r.body && r.body.ok, JSON.stringify(r.body));
  eq('BAIXA POR PECA: branco −2', saldo('BK120120BRANCO'), 2);
  eq('e bege −1', saldo('BK140140BEGE'), 2);

  /* ═══════════════════════════════════════════════════════════════════════ */
  console.log('\n=== 7. SOB MEDIDA — nada baixa, em caminho nenhum ===\n');
  const vS = volume({codigo:'SOBMEDIDA', buyer:'Sob Medida', nf:'6401', venda:'9401', codes:'["P9401"]',
    estagio:'pendente', data:HOJE, despachar_em:HOJE});
  r = await imprimir(vS);
  ok('sob medida imprime sem estoque', r.body && r.body.ok, JSON.stringify(r.body));
  eq('e nao reserva', BAIXA.reservados(db)['SOBMEDIDA'] || 0, 0);
  r = await conferir('P9401');
  ok('e e conferida', r.body && r.body.ok, JSON.stringify(r.body));
  eq('sem linha no livro', movs('lote:' + vS).length, 0);
  eq('o saldo continua zero', saldo('SOBMEDIDA'), 0);
  ok('mas fica marcada como baixada (nao fica pendente de baixa para sempre)', !!vol(vS).baixado_em);

  /* ═══════════════════════════════════════════════════════════════════════ */
  console.log('\n=== 8. "FOI NO CAMINHAO" — a caixa que ninguem conferiu baixa ao sair ===\n');
  const vL = volume({codigo:'BK140140BEGE', buyer:'Levou Sem Conferir', nf:'6501', venda:'9501', codes:'["P9501"]',
    estagio:'pendente', data:HOJE, despachar_em:HOJE});
  await imprimir(vL);
  const sAntes = saldo('BK140140BEGE');
  r = await chamar('POST /api/saida/abrir', {}, ANA);
  ok('a saida do caminhao abre', r.body && r.body.ok !== false, JSON.stringify(r.body));
  r = await chamar('POST /api/saida/levou', {id:vL}, ANA);
  ok('a caixa entra como "foi no caminhao"', r.body && r.body.ok, JSON.stringify(r.body));
  await chamar('POST /api/saida/nada', {}, ANA);
  const sis = r.body.sistema;
  r = await chamar('POST /api/saida/fechar', {motorista:sis, foto:FOTO}, ANA);
  ok('a saida fecha', r.body && r.body.ok, JSON.stringify(r.body));
  eq('A CAIXA BAIXOU AO SAIR', saldo('BK140140BEGE'), sAntes - 1);
  eq('uma vez', movs('lote:' + vL, 'conferencia').length, 1);
  eq('E CONTINUA SEM CONFERENCIA — ninguem conferiu', vol(vL).conferido_em, null);
  eq('as caixas do canto (ja conferidas) nao baixaram de novo', movs('lote:' + vC, 'conferencia').length, 1);

  /* ═══════════════════════════════════════════════════════════════════════ */
  console.log('\n=== 9. URGENCIA E INVENTARIO OLHAM A PRATELEIRA ===\n');
  // BK160160CINZA: saldo 1, a unica peca esta na caixa da vB1 (impressa, nao conferida)
  const URG = require('./urgencia');
  const u = URG.calcular(db).find(x => x.codigo === 'BK160160CINZA');
  eq('a venda pendente de cinza e URGENTE — a peca do saldo ja tem dono', u && u.urgente, 1);
  const INV = require('./inventario_dominio');
  INV.garantirSchema(db);
  INV.abrir(db, { tipo:'ciclico', codigos:['BK160160CINZA'], quem:ANA });
  INV.contar(db, { codigo:'BK160160CINZA', quantidade:0, zerar:true, papel:'contar', quem:ANA });
  INV.terminar(db, { codigo:'BK160160CINZA', papel:'contar', quem:ANA });
  const it = db.prepare("SELECT * FROM inventario_item WHERE codigo='BK160160CINZA'").get();
  eq('PRATELEIRA VAZIA BATE: a peca esta na caixa, e o inventario sabe', it.status, 'confirmado');
  eq('e guarda o que deveria estar na prateleira (0), nao o saldo (1)', it.saldo_na_contagem, 0);

  /* ═══════════════════════════════════════════════════════════════════════ */
  console.log('\n=== 10. O GRAFICO CONTA A SAIDA PELA BAIXA ===\n');
  const FLUXO = require('./fluxo_estoque');
  const saiuHoje = FLUXO.doDia(db).saiu;
  /* Conta PECA (22/10/2026): a caixa de varias soma o qtd dos itens; sem item, 1. */
  const baixadosHoje = db.prepare(`SELECT COALESCE(SUM(COALESCE((SELECT SUM(MAX(1,COALESCE(li.qtd,1)))
      FROM lote_item li WHERE li.lote_id=l.id),1)),0) n
    FROM lote l WHERE date(l.baixado_em)=date('now','localtime') AND COALESCE(l.teste,0)=0`).get().n;
  eq('"saiu" hoje = PECAS das caixas que baixaram hoje (a impressa e nao conferida nao conta)', saiuHoje, baixadosHoje);
  ok('a cinza impressa e nao conferida nao entrou em "saiu"', !vol(vB1).baixado_em);

  /* ═══════════════════════════════════════════════════════════════════════ */
  console.log('\n=== 11. A MESA SE AJUSTA ===\n');
  // cancelada antes da conferencia: a reserva some sozinha
  db.prepare("UPDATE lote SET estagio='cancelado', cancelada_estagio='embalado', cancelada_em=datetime('now','localtime') WHERE id=?").run(vB1);
  eq('cancelada antes de conferir: a reserva some', BAIXA.reservados(db)['BK160160CINZA'] || 0, 0);
  /* Desde a fase 2-B a Mesa nunca devolve saldo (D7): a volta e o "Sobrou" da
     Conferencia, que so devolve o que baixou (teste_sobra.js). */
  r = await chamar('POST /api/correcao/previa', {acao:'cancelada', tipo:'lote', id:vB1, params:{voltou:false}}, ANA);
  ok('o "registrar" de caixa que nunca baixou avisa que o saldo fica alto', r.status === 200 &&
     (r.body.estoque || []).length === 0 && /nunca (foi )?conferid|acima/i.test(r.body.resumo || ''), JSON.stringify(r.body));
  r = await chamar('POST /api/correcao/previa', {acao:'cancelada', tipo:'lote', id:vB1, params:{voltou:true}}, ANA);
  ok('o "a persiana voltou" da Mesa e recusado (2-B, D7)', r.status === 409, JSON.stringify(r.body));
  db.prepare("UPDATE lote SET estagio='cancelado', cancelada_estagio='embalado', cancelada_em=datetime('now','localtime') WHERE id=?").run(vA);
  r = await chamar('POST /api/correcao/previa', {acao:'cancelada', tipo:'lote', id:vA, params:{voltou:false}}, ANA);
  ok('o "registrar" da que ja baixou nao traz movimento', r.status === 200 && (r.body.estoque || []).length === 0,
     JSON.stringify(r.body));
  // conferencias antigas: so a que ja baixou
  const vVelhaSem = volume({codigo:'BK140140BEGE', buyer:'Velha Sem Baixa', nf:'6601', venda:'9601', codes:'["P9601"]',
    estagio:'embalado', embalado_em:D(-5)+' 09:00:00', data:D(-5), despachar_em:D(-5)});
  const vVelhaCom = volume({codigo:'BK140140BEGE', buyer:'Velha Com Baixa', nf:'6602', venda:'9602', codes:'["P9602"]',
    estagio:'embalado', embalado_em:D(-5)+' 09:00:00', baixado_em:D(-5)+' 09:00:00', data:D(-5), despachar_em:D(-5)});
  r = await chamar('POST /api/correcao/previa', {acao:'conferencias', tipo:'bloco', id:0, params:{ate:D(-2)}}, ANA);
  const ids = ((r.body && r.body.antes && r.body.antes.volumes) || []).map(x => x.id);
  ok('"fechar conferencias antigas" pega a que ja baixou', ids.indexOf(vVelhaCom) >= 0, JSON.stringify(r.body));
  ok('E DEIXA DE FORA A QUE NUNCA BAIXOU — fechar ela deixaria o saldo alto', ids.indexOf(vVelhaSem) < 0, JSON.stringify(ids));
  ok('e a previa diz quantas ficaram de fora por isso', /nunca baix/i.test((r.body && r.body.resumo) || ''), r.body && r.body.resumo);
  r = await chamar('POST /api/correcao/previa', {acao:'saida', tipo:'lote', id:vVelhaSem, params:{}}, ANA);
  ok('"dar saida" numa caixa que nunca baixou avisa que o saldo fica alto', r.status === 200 &&
     /nunca (foi )?conferid|ajuste/i.test(r.body.resumo || '') && (r.body.estoque || []).length === 0, JSON.stringify(r.body));

  /* ═══════════════════════════════════════════════════════════════════════ */
  console.log('\n=== 12. O LIVRO FECHA ===\n');
  ok('SUM(delta) = skus.estoque em todo SKU', livroFecha(),
     JSON.stringify(db.prepare(`SELECT s.codigo, s.estoque, (SELECT SUM(delta) FROM movimento_estoque m WHERE m.codigo=s.codigo) soma FROM skus s`).all()));
  ok('nenhuma linha de livro com tipo "etiqueta" nasceu nesta rodada',
     !db.prepare("SELECT 1 FROM movimento_estoque WHERE tipo='etiqueta'").get());

  console.log('\n' + (n - falhas) + ' ok, ' + falhas + ' falha(s)\n');
  try{ db.close(); fs.rmSync(tmp, { recursive:true, force:true }); }catch(e){}
  process.exit(falhas ? 1 : 0);
})().catch(e => { console.error(e); process.exit(1); });

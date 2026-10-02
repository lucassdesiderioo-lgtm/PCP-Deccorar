#!/usr/bin/env node
/* teste_acuracidade.js — ESTOQUE, fase 4: acuracidade e os estados do saldo.
 *
 *   node teste_acuracidade.js
 *
 * Fase 4 da spec ESTOQUE-LIVRO-E-CONFERENCIA (02/10/2026). Escrito antes do
 * codigo. A spec manda estes casos para o `teste_estoque.js`; vieram para um
 * arquivo proprio porque o cenario daquele (venda na janela, alvo, custo) e
 * outro, e misturar faria um caso de acuracidade quebrar por causa da media.
 *
 *  - §4: FISICO, RESERVADO e DISPONIVEL na aba Estoque. Reservado sao as pecas
 *    dos volumes `pendente` (sem etiqueta) do SKU — `lote_item` quando existe,
 *    senao 1 por volume. E "nao entram em conta nenhuma": o `precisa` da tela
 *    azul continua o mesmo (armadilha #12).
 *  - §8: ACURACIDADE do mes (itens que bateram na 1ª contagem ÷ itens
 *    contados) e a DIFERENCA EM R$ por motivo, so para quem tem `custo.ver`.
 */
const Database = require('better-sqlite3');
const fs = require('fs'), os = require('os'), path = require('path');

let casos = 0, falhas = 0;
function ok(desc, cond, detalhe){
  casos++;
  if(cond) console.log('  ok  ' + casos + ' — ' + desc);
  else { falhas++; console.log('  FALHOU ' + casos + ' — ' + desc + (detalhe ? '\n         ' + detalhe : '')); }
}
function eq(desc, achado, esperado){
  ok(desc, achado === esperado, 'esperado ' + JSON.stringify(esperado) + ', veio ' + JSON.stringify(achado));
}

const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'pcp-acuracidade-'));
const db = new Database(path.join(tmp, 't.db'));
db.exec(`
  CREATE TABLE skus (codigo TEXT PRIMARY KEY, descricao TEXT DEFAULT '', cor TEXT DEFAULT '',
    estoque INTEGER DEFAULT 0, alvo INTEGER DEFAULT 0, criado_em TEXT DEFAULT (datetime('now','localtime')),
    modelo_id INTEGER, largura_cm INTEGER, altura_cm INTEGER, cor_codigo TEXT, tecido_codigo TEXT);
  CREATE TABLE montagem (id INTEGER PRIMARY KEY AUTOINCREMENT, codigo TEXT, inicio TEXT, fim TEXT,
    segundos INTEGER, kit_ok INTEGER DEFAULT 1, data TEXT DEFAULT (date('now','localtime')),
    criado_em TEXT DEFAULT (datetime('now','localtime')), teste INTEGER DEFAULT 0);
  CREATE TABLE lote (id INTEGER PRIMARY KEY AUTOINCREMENT, codigo TEXT, estagio TEXT DEFAULT 'pendente',
    embalado_em TEXT, carregado_em TEXT, data TEXT DEFAULT (date('now','localtime')),
    teste INTEGER DEFAULT 0);
  CREATE TABLE lote_item (id INTEGER PRIMARY KEY AUTOINCREMENT, lote_id INTEGER NOT NULL,
    codigo TEXT, qtd INTEGER DEFAULT 1, teste INTEGER DEFAULT 0);
  CREATE TABLE ajuste_estoque (id INTEGER PRIMARY KEY AUTOINCREMENT, codigo TEXT, antes INTEGER,
    depois INTEGER, delta INTEGER, motivo TEXT, obs TEXT, usuario_id INTEGER, usuario_nome TEXT,
    criado_em TEXT DEFAULT (datetime('now','localtime')), data TEXT DEFAULT (date('now','localtime')),
    teste INTEGER DEFAULT 0);
  CREATE TABLE producao (id INTEGER PRIMARY KEY AUTOINCREMENT, codigo TEXT, qtd INTEGER,
    produzido INTEGER DEFAULT 0, data TEXT DEFAULT (date('now','localtime')),
    criado_em TEXT DEFAULT (datetime('now','localtime')), origem TEXT DEFAULT 'manual',
    urgente INTEGER DEFAULT 0, teste INTEGER DEFAULT 0);
  CREATE TABLE revisao (id INTEGER PRIMARY KEY AUTOINCREMENT, codigo TEXT, inicio TEXT, fim TEXT,
    segundos INTEGER, data TEXT DEFAULT (date('now','localtime')),
    criado_em TEXT DEFAULT (datetime('now','localtime')), modo TEXT DEFAULT 'hoje', teste INTEGER DEFAULT 0);
  CREATE TABLE contagem (id INTEGER PRIMARY KEY AUTOINCREMENT, codigo TEXT,
    contado_em TEXT DEFAULT (datetime('now','localtime')), sessao TEXT, teste INTEGER DEFAULT 0,
    tipo TEXT DEFAULT 'sku', componente_id INTEGER, qtd REAL DEFAULT 1);
  CREATE TABLE auditoria (id INTEGER PRIMARY KEY AUTOINCREMENT, usuario_id INTEGER, usuario_nome TEXT,
    categoria TEXT, acao TEXT, alvo TEXT, detalhe TEXT, ip TEXT,
    criado_em TEXT DEFAULT (datetime('now','localtime')), data TEXT DEFAULT (date('now','localtime')));
`);
require('./sku_schema').garantirSchema(db);
require('./compras_schema').garantirSchemaCompras(db);
db.prepare("INSERT INTO modelo (id,codigo,nome,exige_medida,sob_medida) VALUES (1,'ROLO','Rolô',1,0)").run();
db.prepare("INSERT INTO modelo (id,codigo,nome,exige_medida,sob_medida) VALUES (2,'SOBMED','Sob medida',0,1)").run();
const sku = db.prepare('INSERT INTO skus (codigo,descricao,estoque,modelo_id) VALUES (?,?,?,?)');
sku.run('BK140140BEGE',  'Rolo 1,40 Bege',  5, 1);
sku.run('BK160160CINZA', 'Rolo 1,60 Cinza', 0, 1);
sku.run('BK120120BEGE',  'Rolo 1,20 Bege',  4, 1);
sku.run('SOBMEDIDA',     'Sob medida',      0, 2);
db.prepare("UPDATE skus SET tem_ficha=0, custo_direto=10 WHERE codigo='BK140140BEGE'").run();

const rotas = {};
const PERMS = { 1:new Set(['custo.ver']), 2:new Set() };
const app = {
  get:(p, ...h)=>{ rotas['GET '+p]  = h[h.length-1]; },
  post:(p, ...h)=>{ rotas['POST '+p] = h[h.length-1]; },
  delete:(p, ...h)=>{ rotas['DELETE '+p] = h[h.length-1]; },
  use:()=>{},
  locals:{ acesso:{ podePermissao(u, k){ return !!(u && PERMS[u.id] && PERMS[u.id].has(k)); }, auditar(){} } }
};
require('./plan_route')(app, db);
require('./est_route')(app, db);
require('./estoque_dominio').garantirSchema(db);
require('./inventario_route')(app, db);
const INV = require('./inventario_dominio');

function painel(usuario){
  const out = { status:200, body:null };
  const res = { status(c){ out.status=c; return res; }, json(b){ out.body=b; return res; } };
  rotas['GET /api/estoque/painel']({ query:{}, params:{}, usuario }, res);
  return out.body;
}
const COM_CUSTO = { id:1, nome:'Lucas' }, SEM_CUSTO = { id:2, nome:'Ana' };
const linha = (b, c) => (b.linhas || []).find(l => l.codigo === c) || {};

/* ═══ 1. RESERVADO E DISPONIVEL (§4) ════════════════════════════════════ */
console.log('\n=== 1. FISICO, RESERVADO, DISPONIVEL ===\n');
const antes = painel(COM_CUSTO);
const precisaAntes = JSON.stringify(antes.linhas.map(l => [l.codigo, l.precisa]));

const vol = db.prepare('INSERT INTO lote (codigo,estagio,teste) VALUES (?,?,?)');
vol.run('BK140140BEGE', 'pendente', 0);                     // 1 peça reservada
const caixa = vol.run('BK140140BEGE', 'pendente', 0).lastInsertRowid;   // caixa de várias
db.prepare('INSERT INTO lote_item (lote_id,codigo,qtd) VALUES (?,?,?)').run(caixa, 'BK140140BEGE', 2);
db.prepare('INSERT INTO lote_item (lote_id,codigo,qtd) VALUES (?,?,?)').run(caixa, 'BK160160CINZA', 1);
vol.run('BK140140BEGE', 'embalado', 0);                     // já baixou: não reserva
vol.run('BK140140BEGE', 'pendente', 1);                     // modo teste: fora
vol.run('BK140140BEGE', 'cancelado', 0);                    // cancelada: fora
vol.run('BK140140BEGE', 'bloqueado', 0);                    // retido: fora (não é pendente)
vol.run('SOBMEDIDA', 'pendente', 0);

const d = painel(COM_CUSTO);
const a = linha(d, 'BK140140BEGE'), b = linha(d, 'BK160160CINZA'), c = linha(d, 'BK120120BEGE'), s = linha(d, 'SOBMEDIDA');
eq('o físico é o saldo do livro', a.estoque, 5);
eq('RESERVADO conta PEÇA: 1 do volume simples + 2 da caixa de várias', a.reservado, 3);
eq('disponível = físico − reservado', a.disponivel, 2);
eq('o segundo SKU da caixa também fica reservado', b.reservado, 1);
eq('e o disponível pode ficar NEGATIVO — é o que falta produzir', b.disponivel, -1);
eq('SKU sem volume pendente: reservado zero', c.reservado, 0);
eq('…e disponível igual ao físico', c.disponivel, 4);
eq('SOB MEDIDA não tem reservado: o saldo dela é sempre zero (§7)', s.reservado, null);
eq('nem disponível', s.disponivel, null);
eq('NÃO ENTRA EM CONTA NENHUMA: o `precisa` não mudou com os volumes pendentes',
   JSON.stringify(d.linhas.map(l => [l.codigo, l.precisa])), precisaAntes);
eq('o resumo soma o reservado', d.resumo.pecas_reservadas, 4);

/* ═══ 2. ACURACIDADE DO MÊS (§8) ═══════════════════════════════════════ */
console.log('\n=== 2. ACURACIDADE ===\n');
eq('sem contagem no mês, a acuracidade é nula — e não zero', (painel(COM_CUSTO).resumo.acuracidade || {}).pct, null);

const ciclo = db.prepare("INSERT INTO inventario_ciclo (tipo,aberto_por) VALUES ('diario','Lucas')").run().lastInsertRowid;
const item = db.prepare(`INSERT INTO inventario_item (ciclo_id,codigo,status,saldo_na_contagem,contado1,em1,
  diferenca,motivo,decidido_em,teste) VALUES (?,?,?,?,?,?,?,?,?,?)`);
const AGORA = db.prepare("SELECT datetime('now','localtime') d").get().d;
const MES_PASSADO = db.prepare("SELECT datetime('now','localtime','start of month','-3 days') d").get().d;
item.run(ciclo, 'BK120120BEGE', 'confirmado', 4, 4, AGORA, 0, null, null, 0);          // bateu
item.run(ciclo, 'BK160160CINZA', 'confirmado', 2, 2, AGORA, 0, null, null, 0);         // bateu
item.run(ciclo, 'BK140140BEGE', 'aprovado', 7, 5, AGORA, -2, 'Avaria', AGORA, 0);      // não bateu
item.run(ciclo, 'BK160160CINZA', 'aprovado', 3, 4, AGORA, 1, 'Erro de contagem', AGORA, 0); // não bateu, SKU sem custo
// errou na 1ª e a 3ª deu razão ao sistema: CONFIRMADO, mas não bateu na 1ª
item.run(ciclo, 'BK140140BEGE', 'confirmado', 5, 3, AGORA, 0, null, null, 0);
item.run(ciclo, 'BK120120BEGE', 'confirmado', 4, 4, MES_PASSADO, 0, null, null, 0);    // mês passado: fora
item.run(ciclo, 'BK120120BEGE', 'confirmado', 4, 4, AGORA, 0, null, null, 1);          // modo teste: fora
item.run(ciclo, 'BK120120BEGE', 'a_contar', null, null, null, null, null, null, 0);    // não contado: fora

const ac = INV.acuracidade(db);
eq('conta os itens contados no mês', ac.contados, 5);
eq('e os que bateram na 1ª contagem — o confirmado pela 3ª NÃO conta como acerto', ac.certos, 2);
eq('acuracidade = certos ÷ contados', ac.pct, 40);
const r2 = painel(COM_CUSTO).resumo;
eq('o painel devolve a mesma acuracidade', (r2.acuracidade || {}).pct, 40);

/* ═══ 3. DIFERENÇA EM R$ POR MOTIVO ════════════════════════════════════ */
console.log('\n=== 3. DIFERENÇA EM R$ ===\n');
const dif = r2.diferenca_mes || [];
const avaria = dif.find(x => x.motivo === 'Avaria') || {};
const erro = dif.find(x => x.motivo === 'Erro de contagem') || {};
eq('agrupa por motivo, em peças (|delta|)', avaria.pecas, 2);
eq('o valor é |delta| × custo de material', avaria.valor, 20);
eq('SKU sem custo: o valor é NULO, nunca zero (regra 4)', erro.valor, null);
eq('e o total vira piso: conta quantos ficaram sem custo', r2.diferenca_sem_custo, 1);
eq('o total em R$ soma só o que tem custo', r2.diferenca_valor, 20);
const r3 = painel(SEM_CUSTO).resumo;
ok('SEM custo.ver os campos de R$ NÃO VIAJAM — nem o total, nem por motivo',
   !('diferenca_valor' in r3) && (r3.diferenca_mes || []).every(x => !('valor' in x)), JSON.stringify(r3.diferenca_mes));
eq('mas as peças por motivo continuam', ((r3.diferenca_mes || []).find(x => x.motivo === 'Avaria') || {}).pecas, 2);

console.log('\n' + (falhas ? ('FALHARAM ' + falhas + ' de ' + casos) : ('todos os ' + casos + ' casos passaram')) + '\n');
try{ db.close(); fs.rmSync(tmp, { recursive:true, force:true }); }catch(e){}
process.exit(falhas ? 1 : 0);

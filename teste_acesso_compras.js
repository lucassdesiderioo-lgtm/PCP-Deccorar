#!/usr/bin/env node
/* AS TRES PONTAS DE CADA CHAVE NOVA DA COMPRAS-E-RECEBIMENTO (spec §7).
 *
 *   node teste_acesso_compras.js
 *
 * Cada chave nova tem que estar (1) no `permissoes.js`, com nivel, tela e
 * rotulo; (2) no `permDaRota()`, na rota que ela tranca; e (3) com QUEM JA A
 * TEM, pelo backfill de uma vez so (armadilha #13: a ponta que some em silencio
 * e sempre a ultima). Este arquivo cresce fase a fase.
 */
const fs = require('fs'), os = require('os'), path = require('path');
const Database = require('better-sqlite3');

let n = 0, falhas = 0;
function ok(desc, cond, det){ n++; if(cond) console.log('  ok  ' + n + ' — ' + desc);
  else { falhas++; console.log('  FALHOU ' + n + ' — ' + desc + (det ? '\n         ' + det : '')); } }

const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'acesso-cmp-'));
const db = new Database(path.join(dir, 't.db'));
db.exec(`CREATE TABLE usuarios (id INTEGER PRIMARY KEY AUTOINCREMENT, nome TEXT, pin_hash TEXT, salt TEXT, areas TEXT, ativo INTEGER DEFAULT 1);
  CREATE TABLE config (chave TEXT PRIMARY KEY, valor TEXT);`);
const appFalso = () => ({ locals:{}, router:{ stack:[] }, get(){}, post(){}, delete(){}, put(){}, use(){} });
require('./acesso')(appFalso(), db);

/* O banco "de antes": um setor feito a mao com as chaves de origem, e uma
   pessoa com excecao concedida. Depois as marcas de backfill saem, e o
   proximo boot roda como rodaria no deploy. */
const sid = db.prepare("INSERT INTO setores (nome, nivel) VALUES ('Compras da casa','admin')").run().lastInsertRowid;
for(const c of ['componente.cadastrar','pedido.criar','pedido.pagar','pedido.receber'])
  db.prepare('INSERT OR IGNORE INTO setor_permissao (setor_id,chave) VALUES (?,?)').run(sid, c);
const oper = db.prepare("INSERT INTO setores (nome, nivel) VALUES ('Receber','operacao')").run().lastInsertRowid;
db.prepare("INSERT OR IGNORE INTO setor_permissao (setor_id,chave) VALUES (?, 'pedido.receber')").run(oper);
const u = db.prepare("INSERT INTO usuarios (nome,pin_hash,salt,areas) VALUES ('Bia','x','y','')").run().lastInsertRowid;
for(const c of ['componente.cadastrar','pedido.criar','pedido.pagar','pedido.receber'])
  db.prepare("INSERT INTO usuario_excecao (usuario_id,chave,concede) VALUES (?, ?, 1)").run(u, c);
db.prepare("DELETE FROM config WHERE chave LIKE 'seed_cmp_%'").run();
const app = appFalso();
require('./acesso')(app, db);
const AC = app.locals.acesso;
const PERM = require('./permissoes');
const temSetor = (s, c) => !!db.prepare('SELECT 1 FROM setor_permissao WHERE setor_id=? AND chave=?').get(s, c);

/* chave nova · nivel. DECISÃO DO DONO (07/11/2026, revisão do PR #305): a
   R-ALC-06 vale sobre a spec §7 — TODA chave nova nasce só para o Admin Geral,
   e quem recebe é decidido na tela de Acessos. Nada de backfill: nem o setor
   que tinha a chave "parecida", nem a exceção, nem o setor Admin do banco novo. */
const CHAVES = [
  ['almoxarifado.cadastrar', 'admin'],
  ['pedido.aprovar', 'admin'],
  ['nota.lancar', 'admin'],
  ['alcada.definir', 'admin_geral'],
  ['recebimento.liberar', 'admin'],
  ['volume.movimentar', 'operacao'],
  ['certificado.gerenciar', 'admin_geral']
];
for(const [chave, nivel] of CHAVES){
  const p = PERM.find(x => x.chave === chave);
  ok(chave + ': esta no permissoes.js com nivel ' + nivel + ', tela e rotulo', p && p.nivel === nivel && p.tela && p.rotulo, JSON.stringify(p));
  const fora = db.prepare("SELECT s.nome FROM setor_permissao sp JOIN setores s ON s.id=sp.setor_id WHERE sp.chave=? AND s.nome<>'Admin Geral'").all(chave);
  ok(chave + ': nasce so para o Admin Geral (nenhum outro setor a tem, nem o Admin nativo)', fora.length === 0, JSON.stringify(fora));
  ok(chave + ': nenhuma excecao foi criada sozinha', !db.prepare('SELECT 1 FROM usuario_excecao WHERE chave=?').get(chave));
  if(nivel === 'admin_geral') ok(chave + ': e intransferivel', p && p.intransferivel === true);
}

/* As rotas — a ponta do permDaRota. */
const ROTAS = [
  ['POST', '/api/almoxarifados', 'almoxarifado.cadastrar'],
  ['DELETE', '/api/almoxarifados/3', 'almoxarifado.cadastrar'],
  ['GET', '/api/almoxarifados', 'pedido.receber'],
  ['GET', '/api/componentes/opcoes', 'compras.ver'],
  ['GET', '/api/componentes/pendencias', 'componente.cadastrar'],
  ['POST', '/api/pedidos/4/comprar', 'pedido.criar'],
  ['POST', '/api/pedidos/4/aprovar', 'pedido.aprovar'],
  ['GET', '/api/pedidos/4/parcelas', 'nota.lancar'],
  ['POST', '/api/pedidos/4/parcelas', 'pedido.pagar'],
  ['POST', '/api/parcelas/9/pagar', 'pedido.pagar'],
  ['POST', '/api/compras/alcadas', 'alcada.definir'],
  ['POST', '/api/compras/rapida', 'pedido.criar'],
  ['POST', '/api/compras/anexos', 'pedido.criar'],
  ['GET', '/api/compras/anexos/3', 'compras.ver'],
  ['GET', '/api/recebimento/retidos', 'recebimento.liberar'],
  ['POST', '/api/recebimento/itens/5/decidir', 'recebimento.liberar'],
  ['POST', '/api/recebimento/itens/5/ciencia', 'recebimento.liberar'],
  ['GET', '/api/compras/prazo', 'compras.ver'],
  ['GET', '/api/recebimento/aguardando', 'pedido.ver'],
  ['POST', '/api/recebimento', 'pedido.receber'],
  ['GET', '/api/notas', 'custo.ver'],
  ['GET', '/api/notas', 'nota.lancar'],
  ['POST', '/api/notas', 'nota.lancar'],
  ['POST', '/api/notas/regime', 'nota.lancar'],
  ['POST', '/api/almoxarifados/2/enderecos', 'almoxarifado.cadastrar'],
  ['GET', '/api/almoxarifados/2/enderecos', 'volume.movimentar'],
  ['POST', '/api/volumes/M-000001/mover', 'volume.movimentar'],
  ['POST', '/api/volumes/M-000001/abrir', 'volume.movimentar'],
  ['GET', '/api/volumes/M-000001/etiqueta', 'volume.movimentar'],
  ['GET', '/api/enderecos/E-000001', 'volume.movimentar'],
  ['GET', '/almoxarifado', 'volume.movimentar'],
  ['POST', '/api/contagem-material/abrir', 'contagem.contar'],
  ['POST', '/api/contagem-material/4/linha', 'contagem.contar'],
  ['POST', '/api/contagem-material/4/terminar', 'contagem.contar'],
  ['GET', '/api/contagem-material/pendentes', 'contagem.aprovar'],
  ['POST', '/api/contagem-material/itens/4/aprovar', 'contagem.aprovar'],
  ['GET', '/contagem-material', 'contagem.contar'],
  ['GET', '/api/contagem-material/a-etiquetar', 'contagem.aprovar'],
  ['POST', '/api/contagem-material/etiquetar', 'contagem.aprovar'],
  ['GET', '/api/compras/programada', 'compras.ver'],
  ['POST', '/api/compras/programada/pedido', 'pedido.criar'],
  ['POST', '/api/notas/xml/ler', 'nota.lancar'],
  ['POST', '/api/notas/xml', 'nota.lancar'],
  ['GET', '/api/certificado', 'certificado.gerenciar'],
  ['POST', '/api/certificado', 'certificado.gerenciar'],
  ['DELETE', '/api/certificado', 'certificado.gerenciar'],
  ['POST', '/api/certificado/dados', 'certificado.gerenciar'],
  ['POST', '/api/dfe/consultar', 'certificado.gerenciar'],
  ['GET', '/api/dfe', 'nota.lancar'],
  ['POST', '/api/dfe/4/lancar', 'nota.lancar']
];
/* A excecao de Bia (componente.cadastrar) e o setor Compras da casa
   (pedido.criar, pedido.pagar) tem de levar as chaves certas — e o setor que
   so recebe nao leva nenhuma das de admin. */
for(const [m, r, chave] of ROTAS){
  const d = AC.permDaRota(r, m);
  const lista = Array.isArray(d) ? d : [d];
  ok(m + ' ' + r + ' pede ' + chave, lista.indexOf(chave) >= 0, JSON.stringify(d));
}

/* O LADO "NÃO PODE" (revisão do PR #305): quem conta material não lê o saldo
   por porta nenhuma (R-CMP-42, a contagem cega), e a chave da 503 lê o que a
   tela dela precisa. */
const NAO = [
  ['GET', '/api/almoxarifados/2/estoque', 'contagem.contar'],
  ['GET', '/api/enderecos/E-000001', 'contagem.contar'],
  /* etiquetar o tecido de antes muda o saldo: nao e de quem so conta */
  ['POST', '/api/contagem-material/etiquetar', 'contagem.contar']
];
for(const [m, r, chave] of NAO){
  const d = AC.permDaRota(r, m);
  const lista = Array.isArray(d) ? d : [d];
  ok(m + ' ' + r + ' NÃO aceita ' + chave, lista.indexOf(chave) < 0, JSON.stringify(d));
}
{ const d = AC.permDaRota('/api/almoxarifados', 'GET');
  ok('GET /api/almoxarifados aceita volume.movimentar (a 503 escolhe o endereço)', (Array.isArray(d) ? d : [d]).indexOf('volume.movimentar') >= 0, JSON.stringify(d)); }

/* QUEM TEM SÓ A CHAVE DA 503 CHEGA NA 503 (revisão do PR #305): sem a área,
   o destino depois do PIN era o /login — o defeito do vendedor (§20). */
{ const uid = db.prepare("INSERT INTO usuarios (nome,pin_hash,salt,areas,nivel) VALUES ('Vol','x','y','','operacao')").run().lastInsertRowid;
  db.prepare("INSERT INTO usuario_excecao (usuario_id,chave,concede) VALUES (?, 'volume.movimentar', 1)").run(uid);
  AC.sincronizarAreas(uid);
  const areas = (db.prepare('SELECT areas FROM usuarios WHERE id=?').get(uid).areas || '').split(',').filter(Boolean);
  const dst = require('./destino').destino(areas);
  ok('só com volume.movimentar, depois do PIN vai para a 503 (e não para o login)', dst.inicial === '/almoxarifado', JSON.stringify({ areas, dst })); }

console.log('');
console.log(falhas ? (falhas + ' de ' + n + ' FALHARAM') : ('todos os ' + n + ' casos passaram'));
try{ fs.rmSync(dir, { recursive:true, force:true }); }catch(e){}
process.exit(falhas ? 1 : 0);

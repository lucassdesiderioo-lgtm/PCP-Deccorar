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

/* chave nova · nivel · de quem ela vem (null = so o Admin Geral) */
const CHAVES = [
  ['almoxarifado.cadastrar', 'admin', 'componente.cadastrar'],
  ['pedido.aprovar', 'admin', 'pedido.criar'],
  ['nota.lancar', 'admin', 'pedido.pagar'],
  ['alcada.definir', 'admin_geral', null],
  ['recebimento.liberar', 'admin', 'pedido.criar'],
  ['volume.movimentar', 'operacao', 'pedido.receber']
];
for(const [chave, nivel, de] of CHAVES){
  const p = PERM.find(x => x.chave === chave);
  ok(chave + ': esta no permissoes.js com nivel ' + nivel + ', tela e rotulo', p && p.nivel === nivel && p.tela && p.rotulo, JSON.stringify(p));
  if(de){
    ok(chave + ': o setor que tinha ' + de + ' recebeu', temSetor(sid, chave));
    ok(chave + ': a excecao concedida de ' + de + ' virou excecao da nova',
       !!db.prepare('SELECT 1 FROM usuario_excecao WHERE usuario_id=? AND chave=? AND concede=1').get(u, chave));
    if(de !== 'pedido.receber') ok(chave + ': o setor que NAO tinha ' + de + ' nao recebeu', !temSetor(oper, chave));
    else ok(chave + ': o setor de quem recebe (operacao) recebeu', temSetor(oper, chave));
  }else{
    const fora = db.prepare("SELECT s.nome FROM setor_permissao sp JOIN setores s ON s.id=sp.setor_id WHERE sp.chave=? AND s.nome<>'Admin Geral'").all(chave);
    ok(chave + ': so o Admin Geral (nenhum outro setor a tem)', fora.length === 0, JSON.stringify(fora));
    ok(chave + ': e intransferivel', p && p.intransferivel === true);
  }
}

/* A segunda volta nao repete: desmarcou, nao volta. */
db.prepare("DELETE FROM setor_permissao WHERE setor_id=? AND chave='almoxarifado.cadastrar'").run(sid);
require('./acesso')(appFalso(), db);
ok('o backfill roda uma vez so: quem desmarcar nao a ve voltar', !temSetor(sid, 'almoxarifado.cadastrar'));

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
  ['GET', '/api/compras/programada', 'compras.ver'],
  ['POST', '/api/compras/programada/pedido', 'pedido.criar'],
  ['POST', '/api/notas/xml/ler', 'nota.lancar'],
  ['POST', '/api/notas/xml', 'nota.lancar']
];
/* A excecao de Bia (componente.cadastrar) e o setor Compras da casa
   (pedido.criar, pedido.pagar) tem de levar as chaves certas — e o setor que
   so recebe nao leva nenhuma das de admin. */
for(const [m, r, chave] of ROTAS){
  const d = AC.permDaRota(r, m);
  const lista = Array.isArray(d) ? d : [d];
  ok(m + ' ' + r + ' pede ' + chave, lista.indexOf(chave) >= 0, JSON.stringify(d));
}

console.log('');
console.log(falhas ? (falhas + ' de ' + n + ' FALHARAM') : ('todos os ' + n + ' casos passaram'));
try{ fs.rmSync(dir, { recursive:true, force:true }); }catch(e){}
process.exit(falhas ? 1 : 0);

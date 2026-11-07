#!/usr/bin/env node
/* JUNTAR O FORNECEDOR REPETIDO E TIRAR O MARKETPLACE DO CADASTRO (07/11/2026,
 * decisão do dono depois da migração da fase 9: o "Ação" criado é o "AC" que
 * já existia; "ML" e "SHOPI" são canal, não fornecedor — R-CMP-11 e R-CMP-13).
 *
 *   node teste_arrumar_fornecedores.js
 *
 * Escrito antes do script. Monta os dois bancos à mão e trava: a simulação não
 * grava; juntar move TODA linha que cita o fornecedor que sai (nos dois
 * bancos), completa o que fica sem apagar o que ele já tinha, e desativa o que
 * sai sem apagá-lo; a oferta repetida recusa tudo; o marketplace vira canal nos
 * pedidos antigos e deixa de ser fornecedor; rodar de novo não faz nada.
 */
const Database = require('better-sqlite3');
const A = require('./arrumar_fornecedores_cmp');
let n = 0, falhas = 0;
function ok(d, c, det){ n++; if(c) console.log('  ok  ' + n + ' — ' + d); else { falhas++; console.log('  FALHOU ' + n + ' — ' + d + (det ? '\n         ' + det : '')); } }

function bancos(){
  const pcp = new Database(':memory:'), sm = new Database(':memory:');
  pcp.exec(`CREATE TABLE fornecedor (id INTEGER PRIMARY KEY AUTOINCREMENT, nome TEXT NOT NULL, cnpj TEXT, telefone TEXT, pix TEXT, observacao TEXT, ativo INTEGER DEFAULT 1);
    CREATE TABLE oferta (id INTEGER PRIMARY KEY AUTOINCREMENT, fornecedor_id INTEGER NOT NULL, componente_id INTEGER, sku TEXT, embalagem TEXT, preco REAL, ativo INTEGER DEFAULT 1);
    CREATE UNIQUE INDEX ux_of ON oferta(fornecedor_id, componente_id, embalagem) WHERE componente_id IS NOT NULL;
    CREATE TABLE pedido_compra (id INTEGER PRIMARY KEY AUTOINCREMENT, numero TEXT, fornecedor_id INTEGER, canal TEXT, loja TEXT, status TEXT);
    CREATE TABLE componente (id INTEGER PRIMARY KEY, nome TEXT);
    CREATE TABLE auditoria (id INTEGER PRIMARY KEY AUTOINCREMENT, usuario_id INTEGER, usuario_nome TEXT, categoria TEXT, acao TEXT, alvo TEXT, detalhe TEXT, ip TEXT, criado_em TEXT, data TEXT);
    INSERT INTO fornecedor (id,nome,telefone) VALUES (1,'JP',NULL),(2,'AC','51 9999'),(3,'ML',NULL),(5,'SHOPI',NULL),(6,'Ação',NULL);
    UPDATE fornecedor SET pix='acao@pix', telefone='11 1111' WHERE id=6;
    INSERT INTO componente VALUES (10,'Tubo 38'),(11,'Bucha 6');
    INSERT INTO oferta (fornecedor_id,componente_id,embalagem,preco) VALUES (2,10,'barra',8),(6,11,'un',1),(3,11,'pacote 50',20);
    INSERT INTO pedido_compra (numero,fornecedor_id,canal,loja,status) VALUES ('PC-1',2,NULL,NULL,'recebido'),('PC-2',6,'direto',NULL,'comprado'),
      ('PC-3',3,NULL,NULL,'recebido'),('PC-4',5,'',NULL,'recebido'),('PC-5',3,'mercado_livre','Loja do Zé','comprado');`);
  sm.exec(`CREATE TABLE fornecedor (id INTEGER PRIMARY KEY, nome TEXT, fornecedor_pcp_id INTEGER);
    CREATE TABLE rolo (id INTEGER PRIMARY KEY, codigo TEXT, fornecedor_id INTEGER, fornecedor_pcp_id INTEGER);
    INSERT INTO fornecedor VALUES (1,'Ação',6),(2,'JP',1);
    INSERT INTO rolo VALUES (1,'R-1',1,6),(2,'R-2',1,6),(3,'R-3',2,1);`);
  return { pcp, sm };
}
const OPC = { juntar:[{ sai:6, fica:2, nome:'Ação' }], canal:[{ fornecedor:3, canal:'mercado_livre' }, { fornecedor:5, canal:'shopee' }] };
const retrato = b => JSON.stringify([b.pcp.prepare('SELECT * FROM fornecedor').all(), b.pcp.prepare('SELECT * FROM oferta').all(), b.pcp.prepare('SELECT * FROM pedido_compra').all(), b.sm.prepare('SELECT * FROM fornecedor').all(), b.sm.prepare('SELECT * FROM rolo').all()]);

console.log('\n── a simulação');
let b = bancos();
const antes = retrato(b);
const plano = A.planejar(b.pcp, b.sm, OPC);
ok('não grava nada', retrato(b) === antes);
ok('diz o que move: 1 oferta e 1 pedido no PCP, 1 fornecedor e 2 rolos no sob medida', JSON.stringify(plano.juntar[0].mover) === JSON.stringify({ 'pcp.oferta':1, 'pcp.pedido_compra':1, 'sm.fornecedor':1, 'sm.rolo':2 }), JSON.stringify(plano.juntar[0].mover));
ok('diz os nomes dos dois, para conferir', plano.juntar[0].sai_nome === 'Ação' && plano.juntar[0].fica_nome === 'AC');
ok('o marketplace: 2 pedidos sem canal (ML 1, SHOPI 1) e a oferta que deixa de valer', plano.canal[0].pedidos === 1 && plano.canal[1].pedidos === 1 && plano.canal[0].ofertas.length === 1 && /Bucha/.test(plano.canal[0].ofertas[0]), JSON.stringify(plano.canal));

console.log('\n── aplicar');
const r = A.aplicar(b.pcp, b.sm, OPC, { nome:'teste' });
const f2 = b.pcp.prepare('SELECT * FROM fornecedor WHERE id=2').get(), f6 = b.pcp.prepare('SELECT * FROM fornecedor WHERE id=6').get();
ok('a oferta e o pedido do "Ação" passam para o #2', b.pcp.prepare('SELECT COUNT(*) n FROM oferta WHERE fornecedor_id=6').get().n === 0 && b.pcp.prepare("SELECT fornecedor_id f FROM pedido_compra WHERE numero='PC-2'").get().f === 2);
ok('o #2 fica com o nome "Ação"', f2.nome === 'Ação');
ok('e é completado com o que só o #6 tinha (o pix), sem perder o que ele já tinha (o telefone)', f2.pix === 'acao@pix' && f2.telefone === '51 9999', JSON.stringify(f2));
ok('o #6 não é apagado: fica desativado, dizendo para onde foi', f6 && f6.ativo === 0 && /#2/.test(f6.observacao || ''), JSON.stringify(f6));
ok('no sob medida, o espelho e os rolos apontam o #2', b.sm.prepare('SELECT fornecedor_pcp_id p FROM fornecedor WHERE id=1').get().p === 2 && b.sm.prepare('SELECT COUNT(*) n FROM rolo WHERE fornecedor_pcp_id=2').get().n === 2);
ok('o JP e o rolo dele não mexem', b.sm.prepare('SELECT fornecedor_pcp_id p FROM rolo WHERE id=3').get().p === 1);
ok('os pedidos antigos do ML e da SHOPI ganham o canal, e a loja escrita', b.pcp.prepare("SELECT canal, loja FROM pedido_compra WHERE numero='PC-3'").get().canal === 'mercado_livre' && b.pcp.prepare("SELECT canal FROM pedido_compra WHERE numero='PC-4'").get().canal === 'shopee' && b.pcp.prepare("SELECT loja FROM pedido_compra WHERE numero='PC-3'").get().loja === 'ML');
ok('o pedido que já tinha canal e loja não muda', JSON.stringify(b.pcp.prepare("SELECT canal, loja FROM pedido_compra WHERE numero='PC-5'").get()) === JSON.stringify({ canal:'mercado_livre', loja:'Loja do Zé' }));
ok('ML e SHOPI deixam de ser fornecedor (desativados, não apagados), e o pedido antigo continua apontando para eles', b.pcp.prepare('SELECT COUNT(*) n FROM fornecedor WHERE id IN (3,5) AND ativo=0').get().n === 2 && b.pcp.prepare("SELECT fornecedor_id f FROM pedido_compra WHERE numero='PC-3'").get().f === 3);
ok('tudo fica na auditoria', b.pcp.prepare("SELECT COUNT(*) n FROM auditoria WHERE categoria='compras'").get().n >= 3);
const depois = retrato(b);
A.aplicar(b.pcp, b.sm, OPC, { nome:'teste' });
ok('rodar de novo não muda nada', retrato(b) === depois);

console.log('\n── a oferta repetida recusa tudo');
b = bancos();
b.pcp.prepare("INSERT INTO oferta (fornecedor_id,componente_id,embalagem,preco) VALUES (6,10,'barra',9)").run();
const p2 = A.planejar(b.pcp, b.sm, OPC);
ok('a simulação acusa a oferta que já existe no #2', p2.juntar[0].conflitos.length === 1 && /Tubo 38/.test(p2.juntar[0].conflitos[0]), JSON.stringify(p2.juntar[0].conflitos));
const a2 = retrato(b);
let e = null; try{ A.aplicar(b.pcp, b.sm, OPC, { nome:'teste' }); }catch(x){ e = x; }
ok('aplicar recusa dizendo qual oferta e o que fazer, e nada é gravado em banco nenhum', e && /mesma oferta/.test(e.message) && /Tubo 38/.test(e.message) && retrato(b) === a2, e ? e.message : 'passou');

console.log('\n── nomes trocados não passam');
b = bancos();
e = null; try{ A.planejar(b.pcp, b.sm, { juntar:[{ sai:6, fica:6 }] }); }catch(x){ e = x; }
ok('juntar um fornecedor com ele mesmo é recusado', !!e);
e = null; try{ A.planejar(b.pcp, b.sm, { canal:[{ fornecedor:3, canal:'marte' }] }); }catch(x){ e = x; }
ok('canal fora da lista é recusado', !!e);

console.log('');
console.log(falhas ? (falhas + ' de ' + n + ' FALHARAM') : ('todos os ' + n + ' casos passaram'));
process.exit(falhas ? 1 : 0);

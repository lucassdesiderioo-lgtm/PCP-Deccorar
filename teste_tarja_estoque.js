#!/usr/bin/env node
/* teste_tarja_estoque.js — a tarja "sem estoque" da Etiqueta de Venda conta a
 * FILA INTEIRA do SKU (CONSERTO de 06/11/2026, dívida 21 do CLAUDE.md §14).
 *
 *   node teste_tarja_estoque.js
 *
 * Até aqui a linha por SKU só acusava livre ≤ 0, e a peça da caixa de várias
 * comparava o livre só com a quantidade dela: o SKU com alguma peça, mas não
 * para todas, ficava sem tarja e a venda era recusada no bipe. Agora o servidor
 * diz, em cada linha e em cada peça, quanto a fila de hoje pede do SKU e quanto
 * falta (`pedido_hoje`, `falta`), pela conta do tarja_estoque.js, e a tela só
 * desenha. A TRAVA DA IMPRESSÃO NÃO MUDA — o teste confere isso também.
 *
 * Banco em memória, rotas de verdade por HTTP (o exp_route), nunca /opt/expedicao.
 */
'use strict';
const fs = require('fs'), os = require('os'), path = require('path');
const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'pcp-tarja2-'));
process.env.PCP_DIR = tmp;
const Database = require('better-sqlite3');
const express = require('express');

let casos = 0, falhas = 0;
function ok(nome, cond, det){ casos++; if(cond) console.log('  ok   '+nome); else { falhas++; console.log('  FALHOU '+nome+(det?'\n         '+det:'')); } }

const db = new Database(':memory:');
db.exec(`CREATE TABLE skus (codigo TEXT PRIMARY KEY, largura_cm INT, altura_cm INT,
    cor_codigo TEXT, cor TEXT, tecido_codigo TEXT, modelo_id INT, estoque INT DEFAULT 0);
  CREATE TABLE cor (codigo TEXT PRIMARY KEY, nome TEXT);
  CREATE TABLE tecido (codigo TEXT PRIMARY KEY, nome TEXT);
  CREATE TABLE modelo (id INTEGER PRIMARY KEY, nome TEXT, exige_medida INT DEFAULT 1, sob_medida INT DEFAULT 0);
  INSERT INTO modelo VALUES (1,'Rolo',1,0),(2,'Sob medida',0,1);`);
const app = express(); app.use(express.json());
app.locals.acesso = { auditar:()=>{} };
app.use((req,res,next)=>{ req.usuario = { id:1, nome:'Teste' }; next(); });
require('./exp_route')(app, db);

const hoje = db.prepare("SELECT date('now','localtime') d").get().d;
const depois = db.prepare("SELECT date('now','localtime','+9 day') d").get().d;
const sku = (c, est, mod) => db.prepare('INSERT INTO skus (codigo,estoque,modelo_id) VALUES (?,?,?)').run(c, est, mod || 1);
const vol = (c, mod, desp) => db.prepare(`INSERT INTO lote (codigo,buyer,nf,estagio,despachar_em,modalidade)
  VALUES (?,?,?,'pendente',?,?)`).run(c, 'Cliente '+c, String(1000+Math.floor(Math.random()*8000)), desp || hoje, mod || null).lastInsertRowid;
const item = (lote, c, q) => db.prepare('INSERT INTO lote_item (lote_id,codigo,qtd) VALUES (?,?,?)').run(lote, c, q);

// A: 1 livre, 3 vendas na Agência
sku('A_PARCIAL', 1); vol('A_PARCIAL'); vol('A_PARCIAL'); vol('A_PARCIAL');
// B: 1 livre, 1 na Agência e 1 na Coleta
sku('B_DUAS', 1); vol('B_DUAS'); vol('B_DUAS', 'coleta');
// C: 2 livres, 1 venda comum + caixa de várias pedindo 2
sku('C_VARIAS', 2); vol('C_VARIAS');
const cx = vol('C_VARIAS'); item(cx, 'C_VARIAS', 2);
// D: zero
sku('D_ZERO', 0); vol('D_ZERO');
// E: sob medida, saldo zero — nunca tarja
sku('E_SOBMEDIDA', 0, 2); vol('E_SOBMEDIDA');
// F: código em minúscula no lote — a linha tem que achar o cadastro
sku('F_CAIXA', 5); vol('f_caixa');
// G: saldo 2, uma peça já numa caixa impressa → livre 1, e 1 venda: basta
sku('G_RESERVA', 2); vol('G_RESERVA');
db.prepare("INSERT INTO lote (codigo,estagio,embalado_em) VALUES ('G_RESERVA','embalado',datetime('now'))").run();
// H: 3 livres, 2 vendas — sem tarja
sku('H_SOBRA', 3); vol('H_SOBRA'); vol('H_SOBRA');
// I: venda futura não entra na conta de hoje
sku('I_FUT', 1); vol('I_FUT'); vol('I_FUT', null, depois);

const srv = app.listen(0, async () => {
  const B = 'http://127.0.0.1:' + srv.address().port;
  const get = async u => (await fetch(B + u)).json();
  try {
    const L = await get('/api/pendentes');
    const linha = (c, mod) => L.find(x => String(x.codigo).toUpperCase() === c && (mod ? x.modalidade === mod : true)) || {};
    console.log('\n── a linha por SKU diz quanto a fila de hoje pede, e quanto falta');
    ok('A: livre 1, pedido 3, falta 2', linha('A_PARCIAL').estoque === 1 && linha('A_PARCIAL').pedido_hoje === 3 && linha('A_PARCIAL').falta === 2, JSON.stringify(linha('A_PARCIAL')));
    ok('B: Agência e Coleta somam: pedido 2, falta 1 nas duas linhas',
      linha('B_DUAS','agencia').pedido_hoje === 2 && linha('B_DUAS','agencia').falta === 1 && linha('B_DUAS','coleta').falta === 1,
      JSON.stringify([linha('B_DUAS','agencia'), linha('B_DUAS','coleta')]));
    ok('C: a linha conta as peças da caixa de várias: pedido 3, falta 1', linha('C_VARIAS').pedido_hoje === 3 && linha('C_VARIAS').falta === 1, JSON.stringify(linha('C_VARIAS')));
    ok('D: livre 0, falta 1', linha('D_ZERO').estoque === 0 && linha('D_ZERO').falta === 1, JSON.stringify(linha('D_ZERO')));
    ok('E: sob medida — falta 0 e marcado', linha('E_SOBMEDIDA').sob_medida === true && linha('E_SOBMEDIDA').falta === 0, JSON.stringify(linha('E_SOBMEDIDA')));
    ok('F: código em minúscula acha o cadastro (livre 5, falta 0)', linha('F_CAIXA').estoque === 5 && linha('F_CAIXA').falta === 0, JSON.stringify(linha('F_CAIXA')));
    ok('G: a caixa impressa reserva: livre 1, falta 0', linha('G_RESERVA').estoque === 1 && linha('G_RESERVA').falta === 0, JSON.stringify(linha('G_RESERVA')));
    ok('H: sobra peça — falta 0', linha('H_SOBRA').falta === 0 && linha('H_SOBRA').pedido_hoje === 2, JSON.stringify(linha('H_SOBRA')));
    ok('I: a venda futura fica fora (pedido 1, falta 0)', linha('I_FUT').pedido_hoje === 1 && linha('I_FUT').falta === 0, JSON.stringify(linha('I_FUT')));

    console.log('\n── a peça da caixa de várias usa a mesma conta');
    const V = await get('/api/pendentes/varias');
    const it = ((V.find(v => v.id === cx) || {}).itens || [])[0] || {};
    ok('a peça C na caixa: pedido 3, falta 1', it.pedido_hoje === 3 && it.falta === 1, JSON.stringify(it));

    console.log('\n── o painel "Pra despachar depois" não muda (fica de fora)');
    const F = await get('/api/pendentes/futuros');
    const fu = F.find(x => x.codigo === 'I_FUT') || {};
    ok('a linha futura não leva pedido_hoje nem falta', fu.codigo === 'I_FUT' && !('falta' in fu) && !('pedido_hoje' in fu), JSON.stringify(fu));

    console.log('\n── a frase da tela (embalagem.html, tarjaEstoque)');
    const html = fs.readFileSync(path.join(__dirname, 'public', 'embalagem.html'), 'utf8');
    const m = html.match(/\/\*TARJA_ESTOQUE_INICIO\*\/([\s\S]*?)\/\*TARJA_ESTOQUE_FIM\*\//);
    ok('a função está marcada na tela', !!m);
    const tarja = m ? new Function(m[1] + '; return tarjaEstoque;')() : () => '';
    ok('livre 0: "sem estoque — precisa produzir"', /sem estoque — precisa produzir/.test(tarja({ estoque:0, pedido_hoje:1, falta:1 })));
    const t = tarja({ estoque:1, pedido_hoje:3, falta:2 });
    ok('livre 1 para 3: diz quantas faltam', /só 1 livre para 3 de hoje/.test(t) && /faltam 2/.test(t), t);
    ok('falta 1: concorda no singular', /falta 1:/.test(tarja({ estoque:1, pedido_hoje:2, falta:1 })), tarja({ estoque:1, pedido_hoje:2, falta:1 }));
    ok('2 livres: concorda no plural', /só 2 livres para 3 de hoje — falta 1/.test(tarja({ estoque:2, pedido_hoje:3, falta:1 })), tarja({ estoque:2, pedido_hoje:3, falta:1 }));
    ok('falta 0: nenhuma tarja', tarja({ estoque:3, pedido_hoje:2, falta:0 }) === '');
    ok('sob medida: nenhuma tarja, nem com saldo zero', tarja({ estoque:0, pedido_hoje:1, falta:0, sob_medida:true }) === '');
    ok('sem o número do cadastro: nenhuma tarja', tarja({ estoque:null }) === '');
    ok('página antiga do servidor (sem `falta`): a regra de antes, livre ≤ 0', /sem estoque/.test(tarja({ estoque:0 })) && tarja({ estoque:1 }) === '');
    ok('na caixa de várias sem `falta`: livre menor que a quantidade da peça', /sem estoque/.test(tarja({ estoque:1, qtd:2, peca:true })));
    ok('a linha e a peça da caixa usam a mesma função', (html.match(/tarjaEstoque\(/g) || []).length >= 3);

    console.log('\n── a trava da impressão não mudou');
    const etq = fs.readFileSync(path.join(__dirname, 'etq_route.js'), 'utf8');
    ok('o etq_route não usa a conta da fila (a recusa continua sendo pela caixa)', !/tarja_estoque/.test(etq));
  } catch(e){ falhas++; console.log('ESTOUROU: ' + e.stack); }
  srv.close(); db.close(); fs.rmSync(tmp, { recursive:true, force:true });
  console.log('\n' + (casos - falhas) + ' ok, ' + falhas + ' falha(s)');
  process.exit(falhas ? 1 : 0);
});

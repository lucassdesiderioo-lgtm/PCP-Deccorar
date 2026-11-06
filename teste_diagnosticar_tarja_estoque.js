#!/usr/bin/env node
/* teste_diagnosticar_tarja_estoque.js — confere a conta do
   diagnosticar_tarja_estoque.js com casos montados à mão, num banco temporário.
   Cada caso é uma das situações em que a tarja "sem estoque" some (ou aparece
   sem dever) na Etiqueta de Venda. */
'use strict';
const Database = require('better-sqlite3');
const fs = require('fs'), os = require('os'), path = require('path');

const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'pcp-tarja-'));
process.env.PCP_DIR = tmp;
const arq = path.join(tmp, 't.db');
const w = new Database(arq);
w.exec(`
  CREATE TABLE modelo (id INTEGER PRIMARY KEY, nome TEXT, sob_medida INTEGER DEFAULT 0);
  CREATE TABLE skus (codigo TEXT PRIMARY KEY, estoque INTEGER DEFAULT 0, modelo_id INTEGER);
  CREATE TABLE lote (id INTEGER PRIMARY KEY AUTOINCREMENT, codigo TEXT, buyer TEXT, nf TEXT,
    estagio TEXT DEFAULT 'pendente', despachar_em TEXT, modalidade TEXT,
    embalado_em TEXT, baixado_em TEXT);
  CREATE TABLE lote_item (id INTEGER PRIMARY KEY AUTOINCREMENT, lote_id INTEGER, codigo TEXT, qtd INTEGER DEFAULT 1);
`);
w.prepare("INSERT INTO modelo VALUES (1,'Rolô',0),(2,'Sob medida',1)").run();
const sku = w.prepare('INSERT INTO skus VALUES (?,?,?)');
const hoje = w.prepare("SELECT date('now','localtime') d").get().d;
const futuro = w.prepare("SELECT date('now','localtime','+9 day') d").get().d;
const vol = (codigo, mod, desp, estagio) => w.prepare(
  'INSERT INTO lote (codigo,buyer,nf,estagio,despachar_em,modalidade) VALUES (?,?,?,?,?,?)')
  .run(codigo, 'Cliente '+codigo, String(Math.floor(Math.random()*9000)+1000),
       estagio||'pendente', desp===undefined?hoje:desp, mod||null).lastInsertRowid;

// A: 1 livre, 3 vendas na Agência
sku.run('A_PARCIAL', 1, 1); vol('A_PARCIAL'); vol('A_PARCIAL'); vol('A_PARCIAL');
// B: 1 livre, 1 na Agência e 1 na Coleta
sku.run('B_DUAS_LISTAS', 1, 1); vol('B_DUAS_LISTAS'); vol('B_DUAS_LISTAS','coleta');
// C: 2 livres, caixa de várias pede 2 + 1 venda comum
sku.run('C_VARIAS', 2, 1); vol('C_VARIAS');
const cx = vol('C_VARIAS');
w.prepare("INSERT INTO lote_item (lote_id,codigo,qtd) VALUES (?,?,2)").run(cx,'C_VARIAS');
// D: zero de verdade — a tarja aparece
sku.run('D_ZERO', 0, 1); vol('D_ZERO'); vol('D_ZERO','coleta');
// E: saldo 2, 1 em caixa impressa, 1 venda → livre 1, basta
sku.run('E_TEM', 2, 1); vol('E_TEM');
w.prepare("INSERT INTO lote (codigo,estagio,embalado_em) VALUES ('E_TEM','embalado',datetime('now'))").run();
// F: sob medida, saldo 0
sku.run('F_SOBMEDIDA', 0, 2); vol('F_SOBMEDIDA');
// G: saldo 1, mas a peça já está em caixa impressa → livre 0, a tarja aparece
sku.run('G_RESERVADO', 1, 1); vol('G_RESERVADO');
w.prepare("INSERT INTO lote (codigo,estagio,embalado_em) VALUES ('G_RESERVADO','embalado',datetime('now'))").run();
// H: o lote traz o código em minúscula — o JOIN da tela não acha o cadastro
sku.run('H_CAIXA', 0, 1); vol('h_caixa');
// I: venda futura não entra na fila de hoje
sku.run('I_FUTURO', 0, 1); vol('I_FUTURO', null, futuro);
w.close();

const db = new Database(arq, { readonly:true });
const { diagnosticar } = require('./diagnosticar_tarja_estoque');
const r = diagnosticar(db);
const de = c => r.find(s=>s.codigo===c);

let ok = 0, falhou = 0;
const caso = (nome, cond) => { if(cond){ ok++; console.log('  ok   '+nome); } else { falhou++; console.log('  FALHOU '+nome); } };

/* DESDE O CONSERTO DE 06/11/2026 (dívida 21) a tela conta a fila inteira do
   SKU: os casos que antes ficavam sem tarja agora a têm em todos os lugares. */
caso('A: 1 livre para 3 vendas — a tarja aparece', de('A_PARCIAL').grupo==='OK' && de('A_PARCIAL').tarjas===1);
caso('A: 2 vão ser recusadas no bipe (a trava não mudou)', de('A_PARCIAL').recusadas===2);
caso('B: Agência + Coleta com 1 livre — tarja nas duas', de('B_DUAS_LISTAS').grupo==='OK' && de('B_DUAS_LISTAS').tarjas===2);
caso('B: 1 recusada', de('B_DUAS_LISTAS').recusadas===1);
caso('C: caixa de várias + linha disputando 2 livres — tarja na linha e na peça', de('C_VARIAS').grupo==='OK' && de('C_VARIAS').tarjas===2);
caso('C: pede 3, 1 recusada', de('C_VARIAS').pede===3 && de('C_VARIAS').recusadas===1);
caso('D: livre zero — a tarja aparece nos dois lugares', de('D_ZERO').grupo==='OK' && de('D_ZERO').tarjas===2);
caso('E: 1 livre para 1 venda — o sistema acha que tem, sem tarja', de('E_TEM').grupo==='SISTEMA_ACHA_QUE_TEM' && de('E_TEM').livre===1 && de('E_TEM').tarjas===0);
caso('F: sob medida — sem tarja falsa', de('F_SOBMEDIDA').grupo==='OK' && de('F_SOBMEDIDA').tarjas===0);
caso('G: peça reservada por caixa impressa — livre 0 e a tarja aparece', de('G_RESERVADO').grupo==='OK' && de('G_RESERVADO').livre===0);
caso('H: código em minúscula no lote — agora liga ao cadastro e ganha a tarja', de('H_CAIXA') && de('H_CAIXA').grupo==='OK' && de('H_CAIXA').tarjas===1);
caso('I: venda futura fica fora da fila de hoje', !de('I_FUTURO'));
caso('nenhum SKU com tarja faltando', !r.some(s=>s.grupo==='TARJA_FALTANDO'||s.grupo==='TARJA_EM_PARTE'||s.grupo==='TARJA_FALSA_SOB_MEDIDA'));

db.close();
fs.rmSync(tmp, { recursive:true, force:true });
console.log('\n'+ok+' ok, '+falhou+' falharam');
process.exit(falhou ? 1 : 0);

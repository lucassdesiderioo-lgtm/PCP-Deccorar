#!/usr/bin/env node
/* Testes de "zerar a fila de embalagem" (Admin → Contagem, mont_route.js).
 *
 *   node teste_fila.js
 *
 * A fila guarda a peca REVISADA e ainda nao EMBALADA — a lista "Aguardando
 * embalagem" da tela /montagem. Ela nao e estoque (§2: o +1 acontece na
 * embalagem), entao zerar a fila nao pode mexer no saldo, nao pode apagar a
 * linha `embalado` (historia de peca que virou estoque) e nao pode travar a
 * bancada: POST /api/montagem consome a fila QUANDO ela existe e funciona sem
 * ela. As tres regras sao as do limpar_fila.js, e este arquivo trava as tres.
 *
 * Sobe um banco temporario e chama os handlers direto, com um `app` de mentira
 * que so guarda as rotas. Nao abre porta, nao toca no banco de producao.
 */
const Database=require('better-sqlite3');
const fs=require('fs'), os=require('os'), path=require('path');

const tmp=fs.mkdtempSync(path.join(os.tmpdir(),'pcp-fila-'));
const db=new Database(path.join(tmp,'t.db'));
db.exec(`CREATE TABLE skus (codigo TEXT PRIMARY KEY, cor TEXT, estoque INTEGER DEFAULT 0);
  CREATE TABLE producao (id INTEGER PRIMARY KEY AUTOINCREMENT, codigo TEXT, qtd INTEGER, produzido INTEGER DEFAULT 0,
    data TEXT DEFAULT (date('now','localtime')));
  CREATE TABLE fila (id INTEGER PRIMARY KEY AUTOINCREMENT, codigo TEXT,
    modo TEXT DEFAULT 'hoje', situacao TEXT DEFAULT 'aguardando',
    revisado_em TEXT DEFAULT (datetime('now','localtime')), embalado_em TEXT,
    data TEXT DEFAULT (date('now','localtime')), teste INTEGER DEFAULT 0);
  CREATE TABLE auditoria (id INTEGER PRIMARY KEY AUTOINCREMENT, usuario_id INTEGER, usuario_nome TEXT,
    categoria TEXT, acao TEXT, alvo TEXT, detalhe TEXT, ip TEXT, criado_em TEXT DEFAULT (datetime('now','localtime')));`);
db.prepare("INSERT INTO skus (codigo,cor,estoque) VALUES ('BK160160CINZA','CINZA',5),('BK130130BEGE','BEGE',2)").run();
db.prepare("INSERT INTO producao (codigo,qtd) VALUES ('BK160160CINZA',3)").run();
/* O caso da tela: 14 CINZA de meses atras (passivo dos testes), 1 BEGE de
   hoje (trabalho), uma de devolucao, e uma linha JA embalada, que e historia. */
const insVelha=db.prepare("INSERT INTO fila (codigo,modo,revisado_em,data) VALUES (?,?,datetime('now','localtime','-70 day'),date('now','localtime','-70 day'))");
for(let i=0;i<14;i++) insVelha.run('BK160160CINZA','hoje');
db.prepare("INSERT INTO fila (codigo,modo) VALUES ('BK130130BEGE','hoje')").run();
db.prepare("INSERT INTO fila (codigo,modo,revisado_em,data) VALUES ('BK130130BEGE','devolucao',datetime('now','localtime','-3 day'),date('now','localtime','-3 day'))").run();
db.prepare("INSERT INTO fila (codigo,modo,situacao,embalado_em) VALUES ('BK160160CINZA','hoje','embalado',datetime('now','localtime'))").run();

const rotas={};
const app={ get:(p,h)=>{rotas['GET '+p]=h;}, post:(p,h)=>{rotas['POST '+p]=h;}, delete:(p,h)=>{rotas['DELETE '+p]=h;},
  locals:{ backupDir: path.join(tmp,'backups'),
    acesso:{ auditar:(req,cat,acao,alvo,det)=>db.prepare("INSERT INTO auditoria (usuario_nome,categoria,acao,alvo,detalhe) VALUES (?,?,?,?,?)").run('teste',cat,acao,alvo,det) } } };
require('./mont_route')(app,db);
const chamar=(k,body)=>new Promise(r=>{
  const res={ json:o=>r(o), status(){ return this; }, send:o=>r(o) };
  rotas[k]({body:body||{},headers:{},socket:{}}, res);
});

let falhas=0, casos=0;
const ok=(n,c,extra)=>{ casos++;
  if(c) console.log('ok      '+n);
  else { falhas++; console.log('FALHOU  '+n+(extra?'   '+extra:'')); } };
const estoque=c=>db.prepare('SELECT estoque FROM skus WHERE codigo=?').get(c).estoque;

(async()=>{
  /* 1. A simulacao conta, separa por idade e NAO apaga. */
  let s=await chamar('GET /api/fila/limpar');
  ok('simulacao conta so o que esta aguardando', s.total===16, 'veio '+s.total);
  ok('separa por idade: 1 de hoje, 1 na semana, 14 antigas',
     s.idade.hoje===1 && s.idade.semana===1 && s.idade.antigas===14, 'veio '+JSON.stringify(s.idade));
  ok('aponta a devolucao', s.devolucao===1, 'veio '+s.devolucao);
  ok('o maior SKU vem em cima', s.skus[0].codigo==='BK160160CINZA' && s.skus[0].qtd===14, 'veio '+JSON.stringify(s.skus));
  ok('diz quantas embaladas ficam intactas', s.embaladas_intactas===1, 'veio '+s.embaladas_intactas);
  ok('simulacao nao devolve as linhas cruas', s.linhas===undefined);
  ok('simulacao nao apaga nada', db.prepare("SELECT COUNT(*) c FROM fila WHERE situacao='aguardando'").get().c===16);

  /* 2. Zerar: apaga so `aguardando`, faz backup, grava CSV, audita. */
  const antesCinza=estoque('BK160160CINZA'), antesBege=estoque('BK130130BEGE');
  let r=await chamar('POST /api/fila/limpar');
  ok('zerar apaga as 16 aguardando', r.ok===true && r.apagadas===16, 'veio '+JSON.stringify(r));
  ok('a linha embalada continua la', db.prepare("SELECT COUNT(*) c FROM fila WHERE situacao='embalado'").get().c===1);
  ok('nada mais esta aguardando', db.prepare("SELECT COUNT(*) c FROM fila WHERE situacao='aguardando'").get().c===0);
  ok('O ESTOQUE NAO MUDA', estoque('BK160160CINZA')===antesCinza && estoque('BK130130BEGE')===antesBege,
     'cinza '+antesCinza+'→'+estoque('BK160160CINZA')+' bege '+antesBege+'→'+estoque('BK130130BEGE'));
  const bkp=path.join(tmp,'backups',r.backup||''), csv=path.join(tmp,'backups',r.csv||'');
  ok('fez backup do banco antes de apagar', r.backup && fs.existsSync(bkp) && fs.statSync(bkp).size>0, 'veio '+r.backup);
  ok('o backup ainda tem as 16 linhas', (()=>{ try{ const b=new Database(bkp,{readonly:true});
     const c=b.prepare("SELECT COUNT(*) c FROM fila WHERE situacao='aguardando'").get().c; b.close(); return c===16; }catch(e){ return false; } })());
  ok('gravou o CSV do antes com 16 linhas + cabecalho', r.csv && fs.existsSync(csv)
     && fs.readFileSync(csv,'utf8').trim().split('\n').length===17, 'veio '+r.csv);
  const aud=db.prepare("SELECT * FROM auditoria ORDER BY id DESC LIMIT 1").get();
  ok('deixa rastro na auditoria', aud && aud.acao==='fila_zerada' && aud.alvo==='16' && /antigas 14/.test(aud.detalhe),
     'veio '+JSON.stringify(aud));

  /* 3. A bancada NAO trava: embalar sem fila grava, soma +1 e vira modo estoque
        (deixa de abater a ordem do dia). */
  const m=await chamar('POST /api/montagem',{codigo:'BK160160CINZA',segundos:30,kit_ok:1});
  ok('embalar depois de zerar funciona', m.ok===true, 'veio '+JSON.stringify(m));
  ok('e soma +1 no estoque', m.estoque===antesCinza+1 && estoque('BK160160CINZA')===antesCinza+1, 'veio '+m.estoque);
  ok('sem fila a embalagem vira modo estoque: nao consome fila nem abate a ordem', m.naFila===false && m.abatido===false,
     'veio '+JSON.stringify(m));
  ok('a ordem do dia segue com produzido=0', db.prepare("SELECT produzido p FROM producao").get().p===0);

  /* 4. Zerar fila vazia e um nao-fazer, sem backup. */
  r=await chamar('POST /api/fila/limpar');
  ok('fila vazia: zero apagadas e sem backup novo', r.ok===true && r.apagadas===0 && r.backup===null, 'veio '+JSON.stringify(r));
  ok('a tela de embalagem lista vazia', (await chamar('GET /api/fila')).length===0);

  console.log('');
  console.log(falhas ? 'FALHOU: '+falhas+' de '+casos+' caso(s)' : 'OK: '+casos+' casos');
  db.close();
  try{ fs.rmSync(tmp,{recursive:true,force:true}); }catch(e){}
  process.exit(falhas?1:0);
})().catch(e=>{ console.error('erro:',e); process.exit(1); });

const express = require('express');
const path = require('path');
const db = require('./db');
const app = express();
const PORT = 3010;
app.use(express.json({limit:'25mb'}));
require('./auth')(app, db);
app.use(express.static(path.join(__dirname, 'public')));

app.get('/api/skus', (req,res)=> res.json(db.prepare('SELECT * FROM skus ORDER BY codigo').all()));
app.post('/api/skus', (req,res)=>{
  const {codigo,descricao='',cor='',estoque=0,alvo=0}=req.body||{};
  if(!codigo||!codigo.trim()) return res.status(400).json({erro:'código obrigatório'});
  db.prepare(`INSERT INTO skus (codigo,descricao,cor,estoque,alvo) VALUES (?,?,?,?,?)
    ON CONFLICT(codigo) DO UPDATE SET descricao=excluded.descricao,cor=excluded.cor,estoque=excluded.estoque,alvo=excluded.alvo`)
    .run(codigo.trim().toUpperCase(),descricao,cor,+estoque||0,+alvo||0);
  res.json({ok:true});
});
app.delete('/api/skus/:codigo',(req,res)=>{ db.prepare('DELETE FROM skus WHERE codigo=?').run(req.params.codigo); res.json({ok:true}); });

app.post('/api/estoque',(req,res)=>{
  const {codigo,estoque,delta}=req.body||{};
  if(!codigo) return res.status(400).json({erro:'codigo'});
  if(delta!==undefined) db.prepare('UPDATE skus SET estoque=MAX(0,estoque+?) WHERE codigo=?').run(Math.trunc(+delta||0),codigo);
  else db.prepare('UPDATE skus SET estoque=? WHERE codigo=?').run(Math.max(0,Math.trunc(+estoque||0)),codigo);
  const e=db.prepare('SELECT estoque FROM skus WHERE codigo=?').get(codigo);
  res.json({ok:true,estoque:e?e.estoque:null});
});

app.post('/api/producao',(req,res)=>{
  const itens=(req.body&&req.body.itens)||[];
  const ins=db.prepare('INSERT INTO producao (codigo,qtd) VALUES (?,?)');
  db.transaction(l=>{ for(const it of l){ if(it.codigo && +it.qtd>0) ins.run(it.codigo,+it.qtd); } })(itens);
  res.json({ok:true,lancados:itens.length});
});
app.get('/api/producao',(req,res)=> res.json(db.prepare(`SELECT p.*, s.estoque, s.alvo, s.cor FROM producao p
  LEFT JOIN skus s ON s.codigo=p.codigo WHERE p.data=date('now','localtime') ORDER BY p.id DESC`).all()));

// baixa da revisão: registra tempo + abate do pedido + soma no estoque
app.post('/api/revisao',(req,res)=>{
  const {codigo,segundos=0,inicio=null,fim=null}=req.body||{};
  if(!codigo) return res.status(400).json({erro:'codigo'});
  const cod=codigo.trim().toUpperCase();
  if(!db.prepare('SELECT 1 FROM skus WHERE codigo=?').get(cod)) return res.status(404).json({erro:'SKU não cadastrado: '+cod});
  db.transaction(()=>{
    db.prepare('INSERT INTO revisao (codigo,inicio,fim,segundos) VALUES (?,?,?,?)').run(cod,inicio,fim,Math.round(+segundos||0));
    db.prepare('UPDATE skus SET estoque=estoque+1 WHERE codigo=?').run(cod);
    const modo=(req.body&&req.body.modo)==='estoque'?'estoque':'hoje';
    let abatido=false;
    if(modo==='hoje'){
      const row=db.prepare(`SELECT id FROM producao WHERE codigo=? AND data=date('now','localtime') AND produzido<qtd ORDER BY id LIMIT 1`).get(cod);
      if(row){ db.prepare('UPDATE producao SET produzido=produzido+1 WHERE id=?').run(row.id); abatido=true; }
    }
    db.prepare(`UPDATE revisao SET modo=? WHERE id=(SELECT MAX(id) FROM revisao)`).run(modo);
    res.locals.abatido=abatido; res.locals.modo=modo;
  })();
  const est=db.prepare('SELECT estoque FROM skus WHERE codigo=?').get(cod);
  const prog=db.prepare(`SELECT COALESCE(SUM(qtd),0) pedido, COALESCE(SUM(produzido),0) feito FROM producao WHERE codigo=? AND data=date('now','localtime')`).get(cod);
  res.json({ok:true,codigo:cod,estoque:est?est.estoque:null,pedido:prog.pedido,feito:prog.feito});
});
app.get('/api/revisao/hoje',(req,res)=> res.json(db.prepare(`SELECT codigo, COUNT(*) qtd, ROUND(AVG(segundos)) tmedio
  FROM revisao WHERE data=date('now','localtime') GROUP BY codigo ORDER BY qtd DESC`).all()));

app.get('/operador',(req,res)=> res.sendFile(path.join(__dirname,'public','operador.html')));
require('./painel_route')(app, db);
require('./exp_route')(app, db);
app.get('/expedicao',(req,res)=>res.sendFile(require('path').join(__dirname,'public','expedicao.html')));
require('./mont_route')(app, db);
app.get('/montagem',(req,res)=>res.sendFile(require('path').join(__dirname,'public','montagem.html')));
app.get('/painel',(req,res)=>res.sendFile(path.join(__dirname,'public','painel.html')));
app.get('/embalagem',(req,res)=>res.sendFile(path.join(__dirname,'public','embalagem.html')));
require('./carreg_route')(app, db);
app.get('/carregamento',(req,res)=>res.sendFile(path.join(__dirname,'public','carregamento.html')));
require('./backup_route')(app, db);
require('./rel_route')(app, db);
app.get('/relatorios',(req,res)=>res.sendFile(path.join(__dirname,'public','relatorios.html')));
require('./alvo_route')(app, db);
require('./nec_route')(app, db);
app.get('/necessidade',(req,res)=>res.sendFile(path.join(__dirname,'public','necessidade.html')));
app.get('/status',(req,res)=> res.json({ok:true,hora:new Date().toISOString()}));
app.get('/admin',(req,res)=> res.sendFile(path.join(__dirname,'public','index.html')));
require('./modo_route')(app, db);
require('./teste_route')(app, db);
app.listen(PORT,()=> console.log('Servidor na porta '+PORT));

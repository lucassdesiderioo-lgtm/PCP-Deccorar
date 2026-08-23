const express = require('express');
const path = require('path');
const db = require('./db');
const app = express();
const PORT = 3010;
app.use(express.json({limit:'25mb'}));
require('./auth')(app, db);
app.use(express.static(path.join(__dirname, 'public')));

app.get('/api/skus', (req,res)=> res.json(db.prepare('SELECT * FROM skus ORDER BY codigo').all()));
/* Compras Fase 0: o que a tela grava e o que esta NOS CAMPOS, nunca o que o
   codigo do SKU diz. Quem cadastra corrige o preenchimento automatico, e um SKU
   fora da nomenclatura salva normalmente com as medidas digitadas a mao.

   Medida vazia vira NULL, nunca 0 — e por isso que <=0 tambem vira NULL: um
   zero gravado passaria batido pela tela de pendencias e viraria uma mentira
   silenciosa na formula da ficha tecnica. Melhor a linha aparecer como pendente.

   Campo AUSENTE do corpo nao e o mesmo que campo VAZIO: ausente preserva o que
   ja esta no banco. Sem isso, qualquer chamador antigo que so mande
   codigo/descricao/cor apagaria a medida de um SKU ja migrado. */
const cmDe = v => { const n = parseInt(v,10); return (Number.isFinite(n) && n>0) ? n : null; };
app.post('/api/skus', (req,res)=>{
  const b=req.body||{};
  const {codigo,descricao='',cor='',estoque=0,alvo=0}=b;
  if(!codigo||!codigo.trim()) return res.status(400).json({erro:'código obrigatório'});
  const cod=codigo.trim().toUpperCase();
  const atual=db.prepare('SELECT modelo_id,largura_cm,altura_cm,cor_codigo FROM skus WHERE codigo=?').get(cod)||{};
  const manda=(k,novo)=> (k in b) ? novo : (atual[k]===undefined?null:atual[k]);

  let modeloId=null;
  if('modelo_id' in b){
    const id=parseInt(b.modelo_id,10);
    // id que nao existe vira NULL: o SKU aparece em pendencias em vez de apontar
    // para um modelo fantasma.
    modeloId=Number.isFinite(id)&&db.prepare('SELECT 1 FROM modelo WHERE id=?').get(id) ? id : null;
  } else modeloId=atual.modelo_id===undefined?null:atual.modelo_id;

  let corCod=null;
  if('cor_codigo' in b){
    // Mesmo tratamento do modelo: cor que nao esta na lista vira NULL e o SKU
    // aparece em pendencias. Nao e so higiene — as colunas novas sao as
    // primeiras FKs do schema e o better-sqlite3 liga foreign_keys por padrao,
    // entao um codigo desconhecido derrubaria o INSERT com 500. Cadastro nunca
    // bloqueia (§3 do CLAUDE.md): registra o que da e sinaliza o que falta.
    const c=String(b.cor_codigo||'').trim().toUpperCase();
    corCod=(c&&db.prepare('SELECT 1 FROM cor WHERE codigo=?').get(c))?c:null;
  } else corCod=atual.cor_codigo===undefined?null:atual.cor_codigo;

  db.prepare(`INSERT INTO skus (codigo,descricao,cor,estoque,alvo,modelo_id,largura_cm,altura_cm,cor_codigo)
    VALUES (?,?,?,?,?,?,?,?,?)
    ON CONFLICT(codigo) DO UPDATE SET descricao=excluded.descricao,cor=excluded.cor,estoque=excluded.estoque,alvo=excluded.alvo,
      modelo_id=excluded.modelo_id,largura_cm=excluded.largura_cm,altura_cm=excluded.altura_cm,cor_codigo=excluded.cor_codigo`)
    .run(cod,descricao,cor,+estoque||0,+alvo||0,
      modeloId, manda('largura_cm',cmDe(b.largura_cm)), manda('altura_cm',cmDe(b.altura_cm)), corCod);
  try{ db.prepare("UPDATE lote SET estagio='pendente' WHERE estagio='bloqueado' AND codigo=?").run(cod); }catch(e){}
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

// revisao: registra tempo e joga na fila de embalagem
app.post('/api/revisao',(req,res)=>{
  const {codigo,segundos=0,inicio=null,fim=null}=req.body||{};
  if(!codigo) return res.status(400).json({erro:'codigo'});
  const cod=codigo.trim().toUpperCase();
  if(!db.prepare('SELECT 1 FROM skus WHERE codigo=?').get(cod)) return res.status(404).json({erro:'SKU não cadastrado: '+cod});
  db.transaction(()=>{
    db.prepare('INSERT INTO revisao (codigo,inicio,fim,segundos) VALUES (?,?,?,?)').run(cod,inicio,fim,Math.round(+segundos||0));
    const modo=(req.body&&req.body.modo)==='estoque'?'estoque':'hoje';
    db.prepare(`UPDATE revisao SET modo=? WHERE id=(SELECT MAX(id) FROM revisao)`).run(modo);
    db.prepare('INSERT INTO fila (codigo,modo) VALUES (?,?)').run(cod,modo);
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
require('./plan_route')(app, db);
app.get('/planejamento',(req,res)=>res.sendFile(path.join(__dirname,'public','planejamento.html')));
app.get('/status',(req,res)=> res.json({ok:true,hora:new Date().toISOString()}));
app.get('/admin',(req,res)=> res.sendFile(path.join(__dirname,'public','index.html')));
require('./modo_route')(app, db);
require('./cruz_route')(app, db);
require('./cont_route')(app, db);
require('./etq_route')(app, db);
require('./dev_route')(app, db);
app.get('/devolucao',(req,res)=> res.sendFile(path.join(__dirname,'public','devolucao.html')));
require('./cad_route')(app, db);
// Antes do acesso.js: as rotas de cor/modelo/pendencias precisam existir quando
// a cobertura de permissoes for montada.
require('./sku_route')(app, db);
require('./ger_route')(app, db);
require('./st_route')(app, db);
// Controle de Acesso — Fase 1 (roda em paralelo; NAO decide acesso ainda).
// Depois do auth (precisa da tabela usuarios) e antes do teste_route.
require('./acesso')(app, db);
// teste_route por ULTIMO: ele cria os triggers de modo teste em cima das
// tabelas dos outros modulos (fila, devolucao, rejeicao, contagem,
// foto_estoque). Se subir antes, as tabelas ainda nao existem e os triggers
// sao pulados em silencio — o teste passaria a sujar dados reais.
require('./teste_route')(app, db);
app.listen(PORT,()=> console.log('Servidor na porta '+PORT));

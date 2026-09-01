const express = require('express');
const path = require('path');
const db = require('./db');
const app = express();
const PORT = 3010;
app.use(express.json({limit:'25mb'}));
require('./auth')(app, db);
app.use(express.static(path.join(__dirname, 'public')));

/* Vai junto o NOME de cor, tecido e modelo. As colunas de `skus` guardam o
   codigo ('BEGE'), e quem confere a peca na bancada precisa ler a palavra. Sao
   campos a MAIS: tudo que existia continua igual, e nenhuma tela que so lia
   `codigo`/`estoque` muda de comportamento. */
app.get('/api/skus', (req,res)=> res.json(db.prepare(`SELECT s.*,
    c.nome cor_nome, t.nome tecido_nome, m.nome modelo_nome,
    COALESCE(m.exige_medida,1) exige_medida
  FROM skus s
  LEFT JOIN cor c ON c.codigo=s.cor_codigo
  LEFT JOIN tecido t ON t.codigo=s.tecido_codigo
  LEFT JOIN modelo m ON m.id=s.modelo_id
  ORDER BY s.codigo`).all()));
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
  const atual=db.prepare('SELECT modelo_id,largura_cm,altura_cm,cor_codigo,tecido_codigo,tem_ficha,custo_direto FROM skus WHERE codigo=?').get(cod)||{};
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

  let tecCod=null;
  if('tecido_codigo' in b){
    const t=String(b.tecido_codigo||'').trim().toUpperCase();
    tecCod=(t&&db.prepare('SELECT 1 FROM tecido WHERE codigo=?').get(t))?t:null;
  } else tecCod=atual.tecido_codigo===undefined?null:atual.tecido_codigo;

  /* COMPRAS.md §2: o SKU tem ficha tecnica ou nao tem, e e o CADASTRO que
     responde — nunca a ausencia de dados. Deduzir "sem ficha => e revenda"
     silenciaria o erro mais comum: a persiana nova sem ficha lancada apareceria
     como revenda com custo zero e ninguem notaria. */
  const temFicha = ('tem_ficha' in b) ? (b.tem_ficha?1:0)
                 : (atual.tem_ficha===undefined?1:atual.tem_ficha);
  let custoDireto = ('custo_direto' in b) ? (function(){
        const n=parseFloat(String(b.custo_direto==null?'':b.custo_direto).replace(',','.'));
        return (Number.isFinite(n)&&n>=0)?n:null;   // vazio nunca vira zero
      })() : (atual.custo_direto===undefined?null:atual.custo_direto);
  /* §2, tabela de erros: "tem_ficha = 0 com modelo apontado" e bloqueado no
     cadastro. Produto comprado pronto nao tem modelo de fabricacao.
     Mas so e contradicao quando as DUAS coisas vem na mesma requisicao. Se o SKU
     ja tinha modelo e agora esta virando revenda, o modelo simplesmente deixa de
     fazer sentido — recusar ali seria um beco sem saida: nao haveria como fazer
     a transicao sem editar duas vezes. */
  if(!temFicha){
    if(('modelo_id' in b) && modeloId!=null)
      return res.status(400).json({erro:'SKU de revenda não pode ter modelo — ele não é fabricado aqui'});
    modeloId=null;
  }
  if(temFicha) custoDireto=null;   // custo_direto so existe quando tem_ficha = 0

  db.prepare(`INSERT INTO skus (codigo,descricao,cor,estoque,alvo,modelo_id,largura_cm,altura_cm,cor_codigo,tecido_codigo,tem_ficha,custo_direto)
    VALUES (?,?,?,?,?,?,?,?,?,?,?,?)
    ON CONFLICT(codigo) DO UPDATE SET descricao=excluded.descricao,cor=excluded.cor,estoque=excluded.estoque,alvo=excluded.alvo,
      modelo_id=excluded.modelo_id,largura_cm=excluded.largura_cm,altura_cm=excluded.altura_cm,
      cor_codigo=excluded.cor_codigo,tecido_codigo=excluded.tecido_codigo,
      tem_ficha=excluded.tem_ficha,custo_direto=excluded.custo_direto`)
    .run(cod,descricao,cor,+estoque||0,+alvo||0,
      modeloId, manda('largura_cm',cmDe(b.largura_cm)), manda('altura_cm',cmDe(b.altura_cm)), corCod, tecCod,
      temFicha, custoDireto);
  /* Cadastrar o SKU libera os volumes retidos por ele (§6) — mas NUNCA os
     retidos por divergencia de leitura da folha. Ali a duvida nao e se o SKU
     existe, e sim QUAL peca o cliente comprou: as duas leituras do PDF
     discordaram. Sem esta guarda, cadastrar um SKU qualquer soltaria um volume
     que ninguem conferiu. Esses saem so pelo POST /api/divergencias/resolver,
     depois de alguem olhar o pedido no Mercado Livre. */
  try{ db.prepare(`UPDATE lote SET estagio='pendente' WHERE estagio='bloqueado' AND codigo=?
        AND COALESCE(bloqueio,'') NOT LIKE 'divergencia%'`).run(cod); }catch(e){}
  res.json({ok:true});
});
app.delete('/api/skus/:codigo',(req,res)=>{ db.prepare('DELETE FROM skus WHERE codigo=?').run(req.params.codigo); res.json({ok:true}); });

/* ── AJUSTE MANUAL DE ESTOQUE ────────────────────────────────────────────────
 * Era o unico movimento de estoque do sistema SEM registro: um UPDATE direto,
 * sem quem, sem por que, sem o valor anterior. Todos os outros deixam rastro —
 * a embalagem grava em `montagem`, a etiqueta grava `lote.embalado_em`, a
 * contagem grava `contagem_pendente` com contado/sistema_era/contado_por, e o
 * material passa pelo componente_dominio e deixa linha em movimento_componente.
 * Numero que qualquer um muda e ninguem sabe quem mudou e numero em que a
 * equipe para de confiar — e quando param de confiar, voltam pro caderno.
 *
 * O NOME E `ajuste_estoque`, NAO `movimento_estoque`, DE PROPOSITO. Ele guarda
 * so o ajuste feito na mao por esta rota; a embalagem, a etiqueta e a contagem
 * continuam mexendo em skus.estoque por fora (a divida dos nove donos, §14).
 * Uma tabela chamada "movimento" prometeria a historia inteira da coluna e
 * seria lida como tal — e ai o saldo nao fecharia com ela, em silencio. */
db.exec(`CREATE TABLE IF NOT EXISTS ajuste_estoque (
  id           INTEGER PRIMARY KEY AUTOINCREMENT,
  codigo       TEXT,
  antes        INTEGER,
  depois       INTEGER,
  delta        INTEGER,
  motivo       TEXT,
  obs          TEXT,
  usuario_id   INTEGER,
  usuario_nome TEXT,
  criado_em    TEXT DEFAULT (datetime('now','localtime')),
  data         TEXT DEFAULT (date('now','localtime')),
  teste        INTEGER DEFAULT 0
);`);

app.post('/api/estoque',(req,res)=>{
  const {codigo,estoque,delta,motivo,obs}=req.body||{};
  if(!codigo) return res.status(400).json({erro:'codigo'});
  /* O MOTIVO E OBRIGATORIO, e e o ponto todo desta rota. Ajuste sem motivo e
     exatamente o que existia antes: um numero que mudou e ninguem sabe por que. */
  const mot=String(motivo||'').trim();
  if(!mot) return res.status(400).json({erro:'informe o motivo do ajuste'});

  const linha=db.prepare('SELECT estoque FROM skus WHERE codigo=?').get(codigo);
  if(!linha) return res.status(404).json({erro:'SKU nao cadastrado: '+codigo});
  const antes=+linha.estoque||0;
  const depois = (delta!==undefined)
    ? Math.max(0, antes + Math.trunc(+delta||0))
    : Math.max(0, Math.trunc(+estoque||0));
  if(depois===antes) return res.json({ok:true,estoque:antes,sem_mudanca:true});

  const u=req.usuario||{};
  db.transaction(()=>{
    db.prepare('UPDATE skus SET estoque=? WHERE codigo=?').run(depois,codigo);
    db.prepare(`INSERT INTO ajuste_estoque (codigo,antes,depois,delta,motivo,obs,usuario_id,usuario_nome)
      VALUES (?,?,?,?,?,?,?,?)`).run(codigo,antes,depois,depois-antes,mot,
        String(obs||'').trim()||null,u.id||null,u.nome||'');
  })();
  try{ app.locals.acesso.auditar(req,'estoque','ajuste_manual',codigo,
    antes+' -> '+depois+'  ('+mot+')'); }catch(e){}
  res.json({ok:true,estoque:depois,antes:antes});
});

/* O historico de um SKU — e o que transforma o ajuste em algo conferivel. */
app.get('/api/estoque/ajustes',(req,res)=>{
  const cod=(req.query.codigo||'').trim();
  const q=`SELECT id,codigo,antes,depois,delta,motivo,obs,usuario_nome,criado_em
    FROM ajuste_estoque `+(cod?'WHERE UPPER(codigo)=UPPER(?) ':'')+
    'ORDER BY id DESC LIMIT 100';
  res.json(cod ? db.prepare(q).all(cod) : db.prepare(q).all());
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
/* A aba Estoque do admin. Depois do CREATE de `ajuste_estoque` la em cima —
   a rota le a tabela, e num banco novo ela precisa existir antes. */
require('./est_route')(app, db);
/* A tela /necessidade (curva ABC) saiu em 01/09/2026. Ela lia a tabela `demanda`,
   que era semeada UMA VEZ no codigo do nec_route e nunca mais atualizada — entao
   mostrava a demanda de um mes ja passado com cara de numero atual. Pior: o
   botao dela sobrescrevia `skus.alvo` com esse numero congelado, brigando com o
   Planejamento pela MESMA coluna, e criava SKU deduzindo a cor do texto do
   codigo (o que o §7 aposentou quando medida e cor viraram coluna).
   O Planejamento a absorveu: mesmo calculo, alimentado pela planilha do ML.
   A tabela `demanda` fica no banco como historia; o demanda_dominio le dela
   dentro de try/catch, entao instalacao limpa nao quebra sem ela. */
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
require('./compras_route')(app, db);
require('./ficha_route')(app, db);
require('./pedido_route')(app, db);
require('./receb_route')(app, db);
app.get('/recebimento',(req,res)=>res.sendFile(path.join(__dirname,'public','recebimento.html')));
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

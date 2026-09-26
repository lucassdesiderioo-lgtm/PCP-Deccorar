const express = require('express');
const path = require('path');
const db = require('./db');
const ESTOQUE = require('./estoque_dominio');
const app = express();
const PORT = 3010;
app.use(express.json({limit:'25mb'}));
require('./auth')(app, db);
app.use(express.static(path.join(__dirname, 'public')));

/* O cadastro de SKU (GET, POST e DELETE /api/skus) mora no
   sku_cad_route.js desde 17/09/2026, e o require fica EXATAMENTE onde as
   rotas estavam: mudar o lugar mudaria a ordem de registro no Express.
   Saiu daqui porque este arquivo abre porta e banco real e nenhum teste
   consegue carrega-lo — e aquela e a rota que apagava saldo em silencio
   (divida 15 do §14). Agora ela tem o teste_skus.js atras. */
require('./sku_cad_route')(app, db);

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
  /* O `MAX(0, ...)` SAIU na fase 1 do livro (21/09/2026). Ele fazia o ajuste
     mentir em silencio: pedir -5 num saldo de 3 gravava 0 e a linha de
     auditoria dizia "-3", entao nem o rastro contava o que foi pedido. Hoje o
     numero pedido e o numero aplicado, e saldo negativo acende alerta em vez
     de sumir. */
  const depois = (delta!==undefined)
    ? antes + Math.trunc(+delta||0)
    : Math.trunc(+estoque||0);
  if(depois===antes) return res.json({ok:true,estoque:antes,sem_mudanca:true});

  const u=req.usuario||{};
  db.transaction(()=>{
    /* O saldo passa pelo dono unico; `ajuste_estoque` continua guardando o
       MOTIVO, que e o que o livro nao pergunta. */
    ESTOQUE.movimentar(db,{codigo, delta:depois-antes, tipo:'ajuste',
      referencia:'ajuste manual', motivo:mot, usuario:u});
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
require('./saida_route')(app, db);   // a saida do caminhao da coleta (fase 3 da SAIDA-E-DUPLA-CONFERENCIA)
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
app.get('/setor',(req,res)=> res.sendFile(path.join(__dirname,'public','setor.html')));
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

/* ── SOB MEDIDA ────────────────────────────────────────────────────────────
 * A segunda operacao da fabrica (corte de tecido contra o pedido do cliente)
 * mora em tecido/, com banco e dominio proprios, e se monta aqui em
 * /sobmedida. Ate 02/09/2026 era um servidor separado na porta 3020 — o que
 * significava dois PINs, dois cadastros de pessoas e dois lugares para
 * lembrar de bloquear alguem.
 *
 * Depois do teste_route de proposito: aquele require tem que ser o ultimo a
 * tocar o banco do PCP, e este nao toca nele — usa o tecido.db.
 *
 * O TRY/CATCH NAO E PREGUICA. Este modulo tem migracoes que rodam no boot; um
 * banco de tecido corrompido ou um disco cheio derrubaria, sem ele, a
 * expedicao inteira junto — e a expedicao e quem despacha o dia. O sob medida
 * ficar fora do ar para tres pessoas e um problema; a expedicao ficar fora do
 * ar para a fabrica toda e outro. O erro grita no log e /sobmedida responde
 * 503 dizendo o que houve, em vez de 404 fingindo que a tela nao existe. */
try{
  /* A PORTA DE PESSOAS (fase 2 da SOBMEDIDA-PEDIDO-REVENDA). O sob medida
     precisa saber quem sao as pessoas do PCP para a revenda apontar o
     vendedor da carteira — e nao guarda cadastro de gente proprio, que seria
     um segundo lugar para lembrar de desligar alguem (CLAUDE.md §19).

     Sai daqui, e nao de uma consulta la dentro, porque o banco e outro: o
     modulo abre o tecido.db e nunca o dados.db. Uma porta so, com id e nome
     — o `nucleo/pessoas.js` remapeia o que recebe, entao PIN, salt e areas
     nao atravessam nem por engano. */
  /* A PORTA DE MATERIAL (fase 4-C da mesma spec) vai nos DOIS sentidos, e as
     duas metades se ligam aqui, numa chamada so.

     IDA: a lista de material de compra do PCP entra no sob medida, para o
     cadastro apontar qual tubo cada degrau da escada usa. So id, nome e
     unidade atravessam — preco, estoque e fornecedor sao assunto daqui.

     VOLTA: o `consumoDeMaterial` diz quanto de cada material ja esta vendido
     la e ainda nao foi produzido, e entra na lista de compras pelo mesmo
     gatilho 2 da medida padrao. O tubo e o MESMO material dos dois lados, e
     Compras e um so — decisao do dono, 24/09/2026. */
  const sm = require('./tecido/montar').montar(app, null, {
    pessoas: () => db.prepare('SELECT id,nome FROM usuarios WHERE ativo=1 ORDER BY nome').all(),
    materiais: () => db.prepare('SELECT id,nome,unidade FROM componente WHERE ativo=1 ORDER BY nome').all()
  });
  require('./sobmedida_material').ligar(sm && sm.consumoDeMaterial);
}catch(e){
  console.error('[sobmedida] NAO SUBIU:',e);
  app.use('/sobmedida',(req,res)=>res.status(503).send(
    '<body style="font-family:system-ui;background:#0e1217;color:#eef1f6;padding:40px">'+
    '<h2>Sob medida fora do ar</h2><p>O modulo nao subiu neste boot. '+
    'O resto do PCP esta funcionando normalmente.</p>'+
    '<p>Chame o suporte e diga: falha no boot do sob medida.</p></body>'));
}

app.listen(PORT,()=> console.log('Servidor na porta '+PORT));

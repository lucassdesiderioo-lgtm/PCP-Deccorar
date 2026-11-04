/* revisao_route.js — POST /api/revisao: registra o tempo da revisao e joga a
 * peca na fila de embalagem.
 *
 * ARMADILHA #1 (CLAUDE.md §2): revisar NAO mexe no estoque. A peca revisada
 * ainda nao esta pronta — falta embalar e conferir o kit. Ela vira +1 so na
 * embalagem (mont_route.js). Nao "conserte" isto.
 *
 * ARMADILHA #2: a resposta ainda traz `estoque`, `pedido` e `feito`. E resquicio
 * da versao em que a revisao somava estoque; a tela nao usa.
 *
 * Saiu do server.js em 20/10/2026 sem mudar uma linha, so para ter o
 * teste_revisao.js atras: o server.js abre porta e banco real.
 */
/* QUEM REVISOU (fase 4 da ACESSOS-UNIFICADOS, divida 9, 26/10/2026): a
   linha grava o id e o NOME de quem bipou — o nome como retrato, porque a
   pessoa pode mudar de nome no cadastro e a revisao de ontem continua sendo
   de quem era. As colunas nascem no CREATE do db.js; o ALTER guardado fica
   AQUI tambem porque e esta rota que grava nelas, e um banco que subiu sem
   o db.js (um teste, um script) estouraria no primeiro bipe. */
/* QUEM-FEZ-E-REVISAO, fase 1 (04/11/2026). O bipe duplo acidental — o leitor
   ou o dedo mandando dois bipes colados — virava inicio + fim, gravava uma
   revisao de 1 s e punha na fila da embalagem uma peca que ninguem revisou. E
   nao havia volta. Quatro pecas, todas aqui:
     - a BARREIRA: bipe de fim abaixo de `config.rev_minimo_seg` (15) e
       RECUSADO, nao perguntado — um "confirma?" vira botao apertado sem ler;
     - CANCELAR: zera a revisao em andamento. NAO e a "Peca com problema", que
       grava defeito em `rejeicao` — bipe errado nao e defeito;
     - DESFAZER A ULTIMA: so a propria, so do dia, so antes de embalar, e uma
       vez so (o botao volta na proxima revisao). Desfazer APAGA a revisao e a
       linha da fila: a revisao e contada em cinco lugares, e uma coluna
       `desfeita` obrigaria cada um a lembrar de filtrar. O rastro inteiro fica
       em `revisao_evento`;
     - QUEM FEZ: toda escrita pelo `quem.js`, e sem login nada grava.
   Nada aqui mexe em estoque (armadilha #1): o desfazer para antes da
   embalagem, que e onde a peca vira +1. */
const { exigir } = require('./quem');

const MINIMO_PADRAO = 15;

/* O schema que a rota precisa, guardado: o CREATE de verdade mora no db.js
   (§17), mas um banco que subiu sem ele — um teste, um script — estouraria no
   primeiro bipe. O db.js chama isto tambem, para o ALTER da fila. */
function garantirSchema(db){
  /* QUEM REVISOU (fase 4 da ACESSOS-UNIFICADOS, divida 9, 26/10/2026). */
  for(const c of ['usuario_id INTEGER','usuario_nome TEXT'])
    try{ db.exec('ALTER TABLE revisao ADD COLUMN '+c); }catch(e){}
  /* A linha da fila sabe de que revisao nasceu: e por ela que o desfazer acha
     a peca certa, e nao "a mais antiga do SKU". */
  try{ db.exec('ALTER TABLE fila ADD COLUMN revisao_id INTEGER'); }catch(e){}
  db.exec(`CREATE TABLE IF NOT EXISTS revisao_evento (id INTEGER PRIMARY KEY AUTOINCREMENT,
    tipo TEXT NOT NULL, revisao_id INTEGER, codigo TEXT, segundos INTEGER, modo TEXT,
    inicio TEXT, fim TEXT, usuario_id INTEGER, usuario_nome TEXT,
    data TEXT DEFAULT (date('now','localtime')), criado_em TEXT DEFAULT (datetime('now','localtime')),
    teste INTEGER DEFAULT 0)`);
  /* O numero mora no config para andar sem deploy (o catalogo muda). So
     semeia: quem mudou o valor nao o ve voltar no boot. */
  db.exec('CREATE TABLE IF NOT EXISTS config (chave TEXT PRIMARY KEY, valor TEXT)');
  db.prepare("INSERT OR IGNORE INTO config (chave,valor) VALUES ('rev_minimo_seg',?)").run(String(MINIMO_PADRAO));
}

function minimoSeg(db){
  const r = db.prepare("SELECT valor FROM config WHERE chave='rev_minimo_seg'").get();
  const n = r ? parseInt(r.valor, 10) : NaN;
  return Number.isFinite(n) && n >= 0 ? n : MINIMO_PADRAO;
}
const emTeste = db => {
  try{ const r = db.prepare("SELECT valor FROM config WHERE chave='modo_teste'").get(); return r && r.valor === '1' ? 1 : 0; }
  catch(e){ return 0; }
};
const modoDe = b => (b && b.modo) === 'estoque' ? 'estoque' : 'hoje';
const texto = v => v == null || v === '' ? null : String(v).slice(0, 40);

function evento(db, tipo, q, d){
  db.prepare(`INSERT INTO revisao_evento (tipo,revisao_id,codigo,segundos,modo,inicio,fim,usuario_id,usuario_nome)
    VALUES (?,?,?,?,?,?,?,?,?)`).run(tipo, d.revisao_id != null ? d.revisao_id : null, d.codigo || null,
    d.segundos != null ? d.segundos : null, d.modo || null, texto(d.inicio), texto(d.fim),
    q.usuario_id, q.usuario_nome);
}

/* A revisao que esta pessoa pode desfazer agora — ou null, ou a razao de nao
   poder. A "ultima" e a revisao mais recente COM O ID DE QUEM ESTA LOGADO, de
   hoje (nao a do tablet: dois operadores no mesmo tablet nao desfazem um a
   peca do outro). Depois de um desfazer, nao ha "ultima" ate a proxima
   revisao fechar: uma pilha de desfazer vira jeito de apagar o dia. Em modo
   teste so a revisao de teste conta, e fora dele so a de verdade — o modo
   teste so marca o que nasce, e desfazer em teste uma revisao de verdade a
   apagaria para sempre (§11). */
function candidata(db, usuarioId){
  const t = emTeste(db);
  const r = db.prepare(`SELECT id, codigo, segundos, modo, inicio, fim, criado_em, data,
      CAST(ROUND((julianday('now','localtime') - julianday(criado_em)) * 86400) AS INTEGER) ha_seg
    FROM revisao WHERE usuario_id=? AND data=date('now','localtime') AND COALESCE(teste,0)=?
    ORDER BY id DESC LIMIT 1`).get(usuarioId, t);
  if(!r) return null;
  const jaDesfez = db.prepare(`SELECT 1 FROM revisao_evento WHERE tipo='desfeita' AND usuario_id=? AND revisao_id>?`).get(usuarioId, r.id);
  if(jaDesfez) return null;
  return r;
}
function situacaoFila(db, revisaoId){
  const f = db.prepare('SELECT id, situacao FROM fila WHERE revisao_id=? ORDER BY id LIMIT 1').get(revisaoId);
  if(!f) return { fila:null, motivo:'fora_da_fila' };
  if(f.situacao !== 'aguardando') return { fila:f, motivo:'embalada' };
  return { fila:f, motivo:null };
}
const MSG = {
  embalada:       'Essa peça já foi embalada — a revisão não se desfaz mais pela bancada.',
  fora_da_fila:   'Essa peça já saiu da fila da embalagem — a revisão não se desfaz mais pela bancada.',
  nao_e_sua:      'Essa revisão é de outra pessoa. Cada um desfaz só a própria.',
  outro_dia:      'Só se desfaz a revisão de hoje.',
  nao_e_a_ultima: 'Só se desfaz a última revisão, uma vez. Não há outra para desfazer agora.',
  modo_teste:     'Modo teste ligado: só se desfaz revisão feita em teste.',
  nada:           'Não há revisão para desfazer agora.'
};

module.exports=function(app,db){
  garantirSchema(db);

  app.post('/api/revisao',(req,res)=>{
    const q=exigir(req,res); if(!q) return;
    const {codigo,segundos=0,inicio=null,fim=null}=req.body||{};
    if(!codigo) return res.status(400).json({erro:'codigo'});
    const cod=String(codigo).trim().toUpperCase();
    if(!db.prepare('SELECT 1 FROM skus WHERE codigo=?').get(cod)) return res.status(404).json({erro:'SKU não cadastrado: '+cod});
    const seg=Math.round(+segundos||0), modo=modoDe(req.body);
    /* A BARREIRA vale aqui tambem, e nao so na tela: o tablet com a tela
       velha nao pode furar a regra. A revisao continua aberta na tela; o
       operador termina e bipa de novo. */
    const min=minimoSeg(db);
    if(seg<min){
      evento(db,'rapido_demais',q,{codigo:cod,segundos:seg,modo,inicio,fim});
      return res.status(409).json({erro:'Rápido demais ('+seg+' s) — a revisão continua. Termine de revisar e bipe de novo.',
        motivo:'rapido_demais',minimo:min,segundos:seg});
    }
    db.transaction(()=>{
      const id=db.prepare('INSERT INTO revisao (codigo,inicio,fim,segundos,usuario_id,usuario_nome,modo) VALUES (?,?,?,?,?,?,?)')
        .run(cod,inicio,fim,seg,q.usuario_id,q.usuario_nome,modo).lastInsertRowid;
      db.prepare('INSERT INTO fila (codigo,modo,revisao_id) VALUES (?,?,?)').run(cod,modo,id);
    })();
    const est=db.prepare('SELECT estoque FROM skus WHERE codigo=?').get(cod);
    const prog=db.prepare(`SELECT COALESCE(SUM(qtd),0) pedido, COALESCE(SUM(produzido),0) feito FROM producao WHERE codigo=? AND data=date('now','localtime')`).get(cod);
    res.json({ok:true,codigo:cod,estoque:est?est.estoque:null,pedido:prog.pedido,feito:prog.feito});
  });

  /* Zera a revisao em andamento. Ela so existe na tela (o cronometro), entao
     nao ha linha para apagar: fica so o evento, com quem cancelou. */
  app.post('/api/revisao/cancelar',(req,res)=>{
    const q=exigir(req,res); if(!q) return;
    const b=req.body||{};
    const cod=String(b.codigo||'').trim().toUpperCase();
    if(!cod) return res.status(400).json({erro:'codigo'});
    evento(db,'cancelada',q,{codigo:cod,segundos:Math.round(+b.segundos||0),modo:modoDe(b),inicio:b.inicio,fim:b.fim});
    res.json({ok:true});
  });

  /* O que a tela precisa: o minimo da barreira e a revisao que da para
     desfazer. A ultima embalada vem tambem, com `pode:false`, para a tela
     dizer o porque em vez de o botao sumir calado. */
  app.get('/api/revisao/ultima',(req,res)=>{
    const q=exigir(req,res); if(!q) return;
    const c=candidata(db,q.usuario_id);
    let desfazer=null;
    if(c){
      const s=situacaoFila(db,c.id);
      desfazer={revisao_id:c.id,codigo:c.codigo,segundos:c.segundos,modo:c.modo,ha_seg:Math.max(0,c.ha_seg||0),
        pode:!s.motivo,motivo:s.motivo,erro:s.motivo?MSG[s.motivo]:null};
    }
    res.json({minimo_seg:minimoSeg(db),desfazer});
  });

  app.post('/api/revisao/desfazer',(req,res)=>{
    const q=exigir(req,res); if(!q) return;
    const b=req.body||{};
    const recusa=(st,motivo)=>res.status(st).json({erro:MSG[motivo]||motivo,motivo});
    let alvo;
    if(b.revisao_id!=null && b.revisao_id!==''){
      alvo=db.prepare('SELECT * FROM revisao WHERE id=?').get(+b.revisao_id);
      if(!alvo) return res.status(404).json({erro:'Revisão não encontrada.',motivo:'nao_existe'});
      if(alvo.usuario_id!==q.usuario_id) return recusa(409,'nao_e_sua');
      if(alvo.data!==db.prepare("SELECT date('now','localtime') d").get().d) return recusa(409,'outro_dia');
      if((alvo.teste?1:0)!==emTeste(db)) return recusa(409,'modo_teste');
      const c=candidata(db,q.usuario_id);
      if(!c||c.id!==alvo.id) return recusa(409,'nao_e_a_ultima');
    } else {
      const c=candidata(db,q.usuario_id);
      if(!c) return recusa(409,'nada');
      alvo=db.prepare('SELECT * FROM revisao WHERE id=?').get(c.id);
    }
    /* Numa transacao so: a copia, a revisao e a fila. Se a linha da fila nao
       esta mais aguardando, NADA muda — a peca embalada ja virou estoque, e
       desfazer seria mexer em saldo, que nao e desta regra. */
    let motivo=null;
    try{
      db.transaction(()=>{
        const s=situacaoFila(db,alvo.id);
        if(s.motivo){ motivo=s.motivo; throw new Error(s.motivo); }
        evento(db,'desfeita',q,{revisao_id:alvo.id,codigo:alvo.codigo,segundos:alvo.segundos,modo:alvo.modo,inicio:alvo.inicio,fim:alvo.fim});
        db.prepare('DELETE FROM revisao WHERE id=?').run(alvo.id);
        const del=db.prepare("DELETE FROM fila WHERE id=? AND situacao='aguardando'").run(s.fila.id);
        if(del.changes!==1){ motivo='embalada'; throw new Error('embalada'); }
      })();
    }catch(e){
      if(motivo) return recusa(409,motivo);
      console.error('[revisao/desfazer]',e);
      return res.status(500).json({erro:'Não deu para desfazer — nada foi apagado. Tente de novo.'});
    }
    res.json({ok:true,codigo:alvo.codigo,revisao_id:alvo.id});
  });

  /* Saiu do server.js em 04/11/2026 sem mudar o SQL, para o teste alcancar:
     depois do desfazer, este numero tem que voltar ao de antes. */
  app.get('/api/revisao/hoje',(req,res)=> res.json(db.prepare(`SELECT codigo, COUNT(*) qtd, ROUND(AVG(segundos)) tmedio
  FROM revisao WHERE data=date('now','localtime') GROUP BY codigo ORDER BY qtd DESC`).all()));
};
module.exports.garantirSchema=garantirSchema;

/* A devolucao esperando a baixa do admin, numa funcao: a aba Devolucoes e a
   central de pendencias contam pela mesma conta. */
function devolucoesPendentes(db){
  /* O caso em andamento ligado vem junto (spec DEVOLUCOES-ACOMPANHAMENTO, R12):
     a baixa mostra o motivo do caso ja escolhido. Sem a tabela (banco que
     ainda nao subiu com ela), a lista e a de sempre. */
  try{
    return db.prepare(`SELECT d.*, c.id caso_id, c.motivo caso_motivo, c.tipo caso_tipo
      FROM devolucao d LEFT JOIN devolucao_caso c ON c.devolucao_id=d.id
      WHERE d.baixado=0 ORDER BY d.id DESC`).all();
  }catch(e){
    return db.prepare("SELECT * FROM devolucao WHERE baixado=0 ORDER BY id DESC").all();
  }
}
const CASO=require('./devcaso_dominio');
module.exports=function(app,db){
  db.exec("CREATE TABLE IF NOT EXISTS devolucao (id INTEGER PRIMARY KEY AUTOINCREMENT, codigo_ml TEXT, sku_fisico TEXT, sku_venda TEXT, venda_id INTEGER, buyer TEXT, embalagem TEXT, tecido TEXT, tubo TEXT, base TEXT, comando TEXT, kit TEXT, destinacao TEXT, obs TEXT, reputacao TEXT, motivo TEXT, baixado INTEGER DEFAULT 0, baixado_em TEXT, recebido_em TEXT DEFAULT (datetime('now','localtime')), data TEXT DEFAULT (date('now','localtime')), teste INTEGER DEFAULT 0)");
  // As tabelas do caso em andamento: o bipe e a baixa daqui leem e ligam o caso.
  CASO.garantir(db);

  app.get('/api/devolucao/buscar/:cod',(req,res)=>{
    const c=(req.params.cod||'').trim();
    const dig=c.replace(/\D/g,'');
    let r=db.prepare("SELECT id,codigo,cor,buyer,city,nf,venda,packId,data FROM lote WHERE venda=? OR packId=? OR venda=? OR packId=? ORDER BY id DESC LIMIT 1").get(c,c,dig,dig);
    /* O CASO EM ANDAMENTO (R14): se a etiqueta aponta um caso aberto, ele vem
       junto, para a tarja "devolucao esperada". SEM CASO, A RESPOSTA E A DE
       SEMPRE, com as mesmas duas chaves — o tablet antigo nao percebe nada. */
    let caso=null;
    try{ caso=CASO.abertoPorCodigo(db,c,{semRevisao:true}); }catch(e){}
    if(!caso) return res.json({achou:!!r,venda:r||null});
    if(!r && caso.lote_id) r=db.prepare("SELECT id,codigo,cor,buyer,city,nf,venda,packId,data FROM lote WHERE id=?").get(caso.lote_id);
    res.json({achou:!!r,venda:r||null,caso:{id:caso.id,tipo:caso.tipo,motivo:caso.motivo,etapa:caso.etapa,
      etapa_nome:CASO.NOME_ETAPA[caso.etapa]||caso.etapa,sku:caso.sku,venda:caso.venda,nf:caso.nf}});
  });

  /* OS CASOS ESPERADOS DE UM SKU (CONSERTO de 03/11/2026, NF 8207): a
     etiqueta de devolucao do ML nao e venda, pack nem NF, e o bipe nao acha o
     caso. Depois do SKU, a tela pergunta "e esta?". A Baixa usa a mesma lista. */
  app.get('/api/devolucao/esperadas',(req,res)=>{
    try{ res.json({casos:CASO.esperadas(db,(req.query||{}).sku)}); }
    catch(e){ res.status(e.status||500).json({erro:e.message}); }
  });
  /* Ligar pela Baixa a revisao que ficou sem caso (quem da baixa). */
  app.post('/api/devolucao/ligar-caso',(req,res)=>{
    let ok=false; try{ ok=!!app.locals.acesso.podePermissao(req.usuario,'devolucao.baixar'); }catch(e){}
    if(!ok) return res.status(403).json({erro:'Ligar a revisão pela Baixa é de quem dá baixa nas devoluções.',chave:'devolucao.baixar'});
    const b=req.body||{};
    try{ CASO.ligarManual(db,b.caso_id,b.devolucao_id,req.usuario,!!b.confirmar); res.json({ok:true}); }
    catch(e){ if(e instanceof CASO.Recusa) return res.status(e.status).json(Object.assign({erro:e.message},e.extra)); console.log('[devolucao] '+(e&&e.stack||e)); res.status(500).json({erro:'Não deu para gravar. Nada foi alterado.'}); }
  });

  app.post('/api/devolucao',(req,res)=>{
    const b=req.body||{};
    const sku=(b.sku_fisico||'').trim().toUpperCase();
    if(!sku) return res.status(400).json({erro:'informe o SKU'});
    if(!db.prepare('SELECT 1 FROM skus WHERE codigo=?').get(sku)) return res.status(400).json({erro:'SKU nao cadastrado: '+sku});
    /* A gravacao da revisao, a fila e o vinculo com o caso em andamento sao
       UMA transacao: revisao gravada com o caso solto (ou o contrario) seria a
       historia do caso mentindo. Sem caso, nada muda (§9, R14). */
    let info, naFila=false, casoId=null;
    db.transaction(()=>{
      info=db.prepare('INSERT INTO devolucao (codigo_ml,sku_fisico,sku_venda,venda_id,buyer,embalagem,tecido,tubo,base,comando,kit,destinacao,obs) VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?)')
        .run(b.codigo_ml||null,sku,b.sku_venda||null,b.venda_id||null,b.buyer||null,b.embalagem||null,b.tecido||null,b.tubo||null,b.base||null,b.comando||null,b.kit||null,b.destinacao||null,b.obs||null);
      if(b.destinacao==='reembalar'){
        db.prepare("INSERT INTO fila (codigo,modo) VALUES (?,'devolucao')").run(sku);
        naFila=true;
      }
      casoId=CASO.ligarRevisao(db,{caso_id:b.caso_id,codigo:b.codigo_ml},info.lastInsertRowid,req.usuario);
    })();
    const resp={ok:true,id:info.lastInsertRowid,naFila};
    if(casoId) resp.caso_id=casoId;
    res.json(resp);
  });

  /* AS ABAS DAS DEVOLUCOES (AJUSTE de 03/11/2026, a pedido do dono: "concentrar
     em um unico lugar"). Tres telas, uma entrada no rodape: cada aba aparece
     pela PERMISSAO de verdade — e nao pela coluna `areas`, que e sombra e ficou
     desatualizada no deploy das devolucoes em andamento. Esconder a aba nao e
     seguranca: quem tranca e a chave de cada tela e de cada rota. */
  function abasDe(u){
    const p=(c)=>{ try{ return !!app.locals.acesso.podePermissao(u,c); }catch(e){ return false; } };
    return { receber:p('devolucao.registrar'), andamento:p('devolucao.acompanhar')||p('devolucao.lancar')||p('devolucao.dinheiro'), baixa:p('devolucao.baixar') };
  }
  app.get('/api/devolucao/abas',(req,res)=> res.json(abasDe(req.usuario)));
  /* A porta unica do rodape: leva a primeira aba que a pessoa alcanca. Em
     andamento primeiro (e o trabalho de escritorio do dia); quem so registra
     cai na tela de sempre; quem nao tem nada tambem, e o portao responde la
     como sempre respondeu. */
  app.get('/devolucoes',(req,res)=>{
    if(!req.usuario) return res.redirect('/login?r='+encodeURIComponent('/devolucoes'));
    const a=abasDe(req.usuario);
    res.redirect(a.andamento?'/devolucao-casos':a.receber?'/devolucao':a.baixa?'/admin#dv':'/devolucao');
  });

  app.get('/api/devolucao/pendentes',(req,res)=> res.json(devolucoesPendentes(db)));

  app.get('/api/devolucao/hoje',(req,res)=>{
    res.json(db.prepare("SELECT COUNT(*) qtd FROM devolucao WHERE data=date('now','localtime')").get());
  });

  app.post('/api/devolucao/baixa',(req,res)=>{
    const b=req.body||{};
    if(!b.id) return res.status(400).json({erro:'sem id'});
    /* Responder ok para o que nao gravou e o pior silencio: o id que nao
       existe passava, e a baixa repetida regravava a data de quem deu antes. */
    const d=db.prepare("SELECT baixado, baixado_em FROM devolucao WHERE id=?").get(b.id);
    if(!d) return res.status(404).json({erro:'Devolução não encontrada. Atualize a lista.'});
    if(d.baixado) return res.status(409).json({erro:'Esta devolução já teve baixa'+(d.baixado_em?' em '+d.baixado_em.slice(8,10)+'/'+d.baixado_em.slice(5,7)+' às '+d.baixado_em.slice(11,16):'')+'.'});
    /* Ligada a um caso em andamento, o motivo vem do caso quando ninguem
       escolheu (R12), e o "ML devolve" encerra aqui (R19). Uma transacao. */
    db.transaction(()=>{
      const bx=CASO.baixaDaDevolucao(db,b.id,b.motivo||null,req.usuario);
      db.prepare("UPDATE devolucao SET reputacao=?, motivo=?, baixado=1, baixado_em=datetime('now','localtime') WHERE id=? AND baixado=0")
        .run(b.reputacao||null,bx.motivo,b.id);
    })();
    res.json({ok:true});
  });
};
module.exports.pendentes = devolucoesPendentes;

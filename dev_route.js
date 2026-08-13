module.exports=function(app,db){
  db.exec("CREATE TABLE IF NOT EXISTS devolucao (id INTEGER PRIMARY KEY AUTOINCREMENT, codigo_ml TEXT, sku_fisico TEXT, sku_venda TEXT, venda_id INTEGER, buyer TEXT, embalagem TEXT, tecido TEXT, tubo TEXT, base TEXT, comando TEXT, kit TEXT, destinacao TEXT, obs TEXT, reputacao TEXT, motivo TEXT, baixado INTEGER DEFAULT 0, baixado_em TEXT, recebido_em TEXT DEFAULT (datetime('now','localtime')), data TEXT DEFAULT (date('now','localtime')), teste INTEGER DEFAULT 0)");

  app.get('/api/devolucao/buscar/:cod',(req,res)=>{
    const c=(req.params.cod||'').trim();
    const dig=c.replace(/\D/g,'');
    const r=db.prepare("SELECT id,codigo,cor,buyer,city,nf,venda,packId,data FROM lote WHERE venda=? OR packId=? OR venda=? OR packId=? ORDER BY id DESC LIMIT 1").get(c,c,dig,dig);
    res.json({achou:!!r,venda:r||null});
  });

  app.post('/api/devolucao',(req,res)=>{
    const b=req.body||{};
    const sku=(b.sku_fisico||'').trim().toUpperCase();
    if(!sku) return res.status(400).json({erro:'informe o SKU'});
    if(!db.prepare('SELECT 1 FROM skus WHERE codigo=?').get(sku)) return res.status(400).json({erro:'SKU nao cadastrado: '+sku});
    const info=db.prepare('INSERT INTO devolucao (codigo_ml,sku_fisico,sku_venda,venda_id,buyer,embalagem,tecido,tubo,base,comando,kit,destinacao,obs) VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?)')
      .run(b.codigo_ml||null,sku,b.sku_venda||null,b.venda_id||null,b.buyer||null,b.embalagem||null,b.tecido||null,b.tubo||null,b.base||null,b.comando||null,b.kit||null,b.destinacao||null,b.obs||null);
    let naFila=false;
    if(b.destinacao==='reembalar'){
      db.prepare("INSERT INTO fila (codigo,modo) VALUES (?,'devolucao')").run(sku);
      naFila=true;
    }
    res.json({ok:true,id:info.lastInsertRowid,naFila});
  });

  app.get('/api/devolucao/pendentes',(req,res)=>{
    res.json(db.prepare("SELECT * FROM devolucao WHERE baixado=0 ORDER BY id DESC").all());
  });

  app.get('/api/devolucao/hoje',(req,res)=>{
    res.json(db.prepare("SELECT COUNT(*) qtd FROM devolucao WHERE data=date('now','localtime')").get());
  });

  app.post('/api/devolucao/baixa',(req,res)=>{
    const b=req.body||{};
    if(!b.id) return res.status(400).json({erro:'sem id'});
    db.prepare("UPDATE devolucao SET reputacao=?, motivo=?, baixado=1, baixado_em=datetime('now','localtime') WHERE id=?")
      .run(b.reputacao||null,b.motivo||null,b.id);
    res.json({ok:true});
  });
};

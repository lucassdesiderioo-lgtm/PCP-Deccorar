module.exports=function(app,db){
  db.exec("CREATE TABLE IF NOT EXISTS listas (id INTEGER PRIMARY KEY AUTOINCREMENT, tipo TEXT, valor TEXT, ordem INTEGER DEFAULT 0, ativo INTEGER DEFAULT 1)");
  db.exec("CREATE TABLE IF NOT EXISTS rejeicao (id INTEGER PRIMARY KEY AUTOINCREMENT, codigo TEXT, motivo TEXT, obs TEXT, segundos INTEGER, modo TEXT, usuario TEXT, data TEXT DEFAULT (date('now','localtime')), criado_em TEXT DEFAULT (datetime('now','localtime')), teste INTEGER DEFAULT 0)");

  const seed=(tipo,vals)=>{
    const n=db.prepare('SELECT COUNT(*) c FROM listas WHERE tipo=?').get(tipo).c;
    if(n>0) return;
    const ins=db.prepare('INSERT INTO listas (tipo,valor,ordem) VALUES (?,?,?)');
    vals.forEach((v,i)=>ins.run(tipo,v,i));
  };
  seed('rejeicao',['Corte de tecido errado','Medida errada','Etiqueta errada','Defeito no tecido','Lado do comando trocado','Outro']);
  seed('motivo_devolucao',['Comprador se arrependeu','Enviado medida ou cor errada','Avaria no transporte','Defeito de fabricacao']);
  /* Motivos do ajuste manual de estoque. Configuraveis como os outros: a lista
     que nasce no codigo envelhece calada, e quando nao tem o motivo certo a
     pessoa escolhe qualquer um — que e o mesmo que nao ter motivo. */
  seed('ajuste_estoque',['Peca quebrada','Peca perdida','Peca encontrada','Correcao de contagem','Correcao de erro do sistema','Outro']);

  app.get('/api/listas/:tipo',(req,res)=>
    res.json(db.prepare('SELECT id,valor FROM listas WHERE tipo=? AND ativo=1 ORDER BY ordem,id').all(req.params.tipo)));

  app.post('/api/listas',(req,res)=>{
    const b=req.body||{};
    if(!b.tipo||!b.valor) return res.status(400).json({erro:'faltam dados'});
    const n=db.prepare('SELECT COALESCE(MAX(ordem),0)+1 o FROM listas WHERE tipo=?').get(b.tipo).o;
    db.prepare('INSERT INTO listas (tipo,valor,ordem) VALUES (?,?,?)').run(b.tipo,b.valor.trim(),n);
    res.json({ok:true});
  });

  app.delete('/api/listas/:id',(req,res)=>{
    db.prepare('UPDATE listas SET ativo=0 WHERE id=?').run(req.params.id);
    res.json({ok:true});
  });

  app.post('/api/rejeicao',(req,res)=>{
    const b=req.body||{};
    const cod=(b.codigo||'').trim().toUpperCase();
    if(!cod||!b.motivo) return res.status(400).json({erro:'faltam dados'});
    db.prepare('INSERT INTO rejeicao (codigo,motivo,obs,segundos,modo,usuario) VALUES (?,?,?,?,?,?)')
      .run(cod,b.motivo,b.obs||null,Math.round(+b.segundos||0),b.modo||null,(req.usuario&&req.usuario.nome)||null);
    res.json({ok:true});
  });

  app.get('/api/rejeicao/resumo',(req,res)=>{
    const de=req.query.de||null, ate=req.query.ate||null;
    let w='1=1', p=[];
    if(de){ w+=" AND data>=?"; p.push(de); }
    if(ate){ w+=" AND data<=?"; p.push(ate); }
    res.json({
      porMotivo: db.prepare('SELECT motivo, COUNT(*) qtd FROM rejeicao WHERE '+w+' GROUP BY motivo ORDER BY qtd DESC').all(...p),
      porSku: db.prepare('SELECT codigo, COUNT(*) qtd FROM rejeicao WHERE '+w+' GROUP BY codigo ORDER BY qtd DESC LIMIT 15').all(...p),
      lista: db.prepare('SELECT * FROM rejeicao WHERE '+w+' ORDER BY id DESC LIMIT 100').all(...p),
      total: db.prepare('SELECT COUNT(*) c FROM rejeicao WHERE '+w).get(...p).c
    });
  });
};

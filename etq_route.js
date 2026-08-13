module.exports=function(app,db){
  app.get('/api/proximo/:sku',(req,res)=>{
    const sku=(req.params.sku||'').trim().toUpperCase();
    const s=db.prepare('SELECT codigo,estoque FROM skus WHERE codigo=?').get(sku);
    if(!s) return res.json({cadastrado:false});
    const total=db.prepare("SELECT COUNT(*) c FROM lote WHERE codigo=? AND data=date('now','localtime')").get(sku).c;
    const pend=db.prepare("SELECT COUNT(*) c FROM lote WHERE codigo=? AND data=date('now','localtime') AND estagio='pendente'").get(sku).c;
    const p=db.prepare("SELECT id,codigo,cor,buyer,city,nf,packId,venda FROM lote WHERE codigo=? AND data=date('now','localtime') AND estagio='pendente' ORDER BY id LIMIT 1").get(sku);
    res.json({cadastrado:true,estoque:s.estoque,total,pendentes:pend,pedido:p||null});
  });

  app.post('/api/embalar',(req,res)=>{
    const id=(req.body&&req.body.id);
    if(!id) return res.status(400).json({erro:'sem id'});
    const o=db.prepare('SELECT * FROM lote WHERE id=?').get(id);
    if(!o) return res.status(404).json({erro:'venda nao encontrada'});
    if(o.estagio==='bloqueado') return res.json({erro:'Volume bloqueado: SKU fora do cadastro.'});
    if(o.estagio!=='pendente') return res.json({erro:'Esta venda ja foi processada ('+o.estagio+').'});
    const s=db.prepare('SELECT estoque FROM skus WHERE codigo=?').get(o.codigo);
    if(!s) return res.json({erro:'SKU nao cadastrado.'});
    if(s.estoque<=0) return res.json({erro:'Sem estoque desse SKU.'});
    db.transaction(()=>{
      db.prepare("UPDATE lote SET estagio='embalado', embalado_em=datetime('now','localtime') WHERE id=?").run(id);
      db.prepare('UPDATE skus SET estoque=MAX(0,estoque-1) WHERE codigo=?').run(o.codigo);
    })();
    const e=db.prepare('SELECT estoque FROM skus WHERE codigo=?').get(o.codigo);
    res.json({ok:true,estoque:e?e.estoque:0});
  });
};

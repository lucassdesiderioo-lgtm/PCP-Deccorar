module.exports=function(app,db){
  db.exec("CREATE TABLE IF NOT EXISTS contagem (id INTEGER PRIMARY KEY AUTOINCREMENT, codigo TEXT, contado_em TEXT DEFAULT (datetime('now','localtime')), sessao TEXT, teste INTEGER DEFAULT 0)");

  app.post('/api/contagem/bipe',(req,res)=>{
    const cod=((req.body&&req.body.codigo)||'').trim().toUpperCase();
    const ses=((req.body&&req.body.sessao)||'').trim();
    if(!cod) return res.status(400).json({erro:'sem codigo'});
    const existe=db.prepare('SELECT codigo,descricao,cor,estoque FROM skus WHERE codigo=?').get(cod);
    db.prepare('INSERT INTO contagem (codigo,sessao) VALUES (?,?)').run(cod,ses);
    const n=db.prepare('SELECT COUNT(*) c FROM contagem WHERE codigo=? AND sessao=?').get(cod,ses).c;
    res.json({ok:true,codigo:cod,cadastrado:!!existe,contado:n,estoque:existe?existe.estoque:null,cor:existe?existe.cor:''});
  });

  app.get('/api/contagem/:sessao',(req,res)=>{
    const ses=req.params.sessao;
    const cont=db.prepare('SELECT codigo, COUNT(*) qtd FROM contagem WHERE sessao=? GROUP BY codigo').all(ses);
    const mapa={}; cont.forEach(c=>{ mapa[c.codigo]=c.qtd; });
    const skus=db.prepare('SELECT codigo,cor,estoque FROM skus ORDER BY codigo').all();
    const linhas=[], desconhecidos=[];
    skus.forEach(s=>{
      if(mapa[s.codigo]===undefined) return;
      linhas.push({codigo:s.codigo,cor:s.cor,sistema:s.estoque,contado:mapa[s.codigo],dif:mapa[s.codigo]-s.estoque});
      delete mapa[s.codigo];
    });
    Object.keys(mapa).forEach(k=>desconhecidos.push({codigo:k,qtd:mapa[k]}));
    const naoContados=skus.filter(s=>!linhas.some(l=>l.codigo===s.codigo)&&s.estoque>0)
                          .map(s=>({codigo:s.codigo,sistema:s.estoque}));
    res.json({linhas,desconhecidos,naoContados});
  });

  app.post('/api/contagem/ajustar',(req,res)=>{
    const ses=((req.body&&req.body.sessao)||'').trim();
    const codigos=(req.body&&req.body.codigos)||[];
    if(!ses||!codigos.length) return res.status(400).json({erro:'faltam dados'});
    let n=0;
    db.transaction(()=>{
      const up=db.prepare('UPDATE skus SET estoque=? WHERE codigo=?');
      codigos.forEach(c=>{
        const q=db.prepare('SELECT COUNT(*) c FROM contagem WHERE codigo=? AND sessao=?').get(c,ses).c;
        up.run(q,c); n++;
      });
    })();
    res.json({ok:true,ajustados:n});
  });

  app.post('/api/contagem/lancar',(req,res)=>{
    const ses=((req.body&&req.body.sessao)||'').trim();
    const codigos=(req.body&&req.body.codigos)||[];
    if(!ses||!codigos.length) return res.status(400).json({erro:'faltam dados'});
    let n=0;
    db.transaction(()=>{
      const up=db.prepare('UPDATE skus SET estoque=estoque+? WHERE codigo=?');
      codigos.forEach(c=>{
        const q=db.prepare('SELECT COUNT(*) c FROM contagem WHERE codigo=? AND sessao=?').get(c,ses).c;
        up.run(q,c); n++;
      });
      db.prepare('DELETE FROM contagem WHERE sessao=?').run(ses);
    })();
    res.json({ok:true,lancados:n});
  });

  app.delete('/api/contagem/:sessao',(req,res)=>{
    const n=db.prepare('DELETE FROM contagem WHERE sessao=?').run(req.params.sessao).changes;
    res.json({ok:true,apagados:n});
  });
};

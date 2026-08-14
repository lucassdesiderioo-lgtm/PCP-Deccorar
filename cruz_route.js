module.exports=function(app,db){
  // sem id: a PK e a data (uma foto por dia). O trigger de modo teste casa por data
  db.exec("CREATE TABLE IF NOT EXISTS foto_estoque (data TEXT PRIMARY KEY, dados TEXT, criado_em TEXT DEFAULT (datetime('now','localtime')), teste INTEGER DEFAULT 0)");

  function foto(){
    const hoje=db.prepare("SELECT date('now','localtime') d").get().d;
    let f=db.prepare('SELECT dados FROM foto_estoque WHERE data=?').get(hoje);
    if(!f){
      const snap={};
      db.prepare('SELECT codigo,estoque FROM skus').all().forEach(s=>{ snap[s.codigo]=s.estoque; });
      db.prepare('INSERT INTO foto_estoque (data,dados) VALUES (?,?)').run(hoje,JSON.stringify(snap));
      return snap;
    }
    try{ return JSON.parse(f.dados); }catch(e){ return {}; }
  }

  function calcular(){
    const snap=foto();
    const vendas=db.prepare("SELECT codigo, COUNT(*) qtd FROM lote WHERE data=date('now','localtime') AND codigo IS NOT NULL AND estagio!='bloqueado' GROUP BY codigo").all();
    const r=[];
    for(const v of vendas){
      const est=snap[v.codigo]||0;
      const atendido=Math.min(v.qtd,est);
      const urgente=Math.max(0,v.qtd-est);
      r.push({codigo:v.codigo,vendas:v.qtd,estoque:est,atendido,urgente,reposicao:atendido});
    }
    return r;
  }

  app.get('/api/cruzamento',(req,res)=> res.json(calcular()));

  app.post('/api/cruzamento/aplicar',(req,res)=>{
    const linhas=calcular();
    let urg=0, rep=0;
    db.transaction(()=>{
      db.prepare("DELETE FROM producao WHERE data=date('now','localtime') AND origem='ml'").run();
      const ins=db.prepare("INSERT INTO producao (codigo,qtd,origem,urgente) VALUES (?,?,'ml',?)");
      for(const l of linhas){
        if(l.urgente>0){ ins.run(l.codigo,l.urgente,1); urg+=l.urgente; }
        if(l.reposicao>0){ ins.run(l.codigo,l.reposicao,0); rep+=l.reposicao; }
      }
    })();
    res.json({ok:true,urgentes:urg,reposicao:rep,linhas});
  });
};

module.exports=function(app,db){
  function faixa(req){
    let de=(req.query.de||'').trim(), ate=(req.query.ate||'').trim();
    if(!/^\d{4}-\d{2}-\d{2}$/.test(de)) de="date('now','localtime','-6 days')"; else de="'"+de+"'";
    if(!/^\d{4}-\d{2}-\d{2}$/.test(ate)) ate="date('now','localtime')"; else ate="'"+ate+"'";
    return {de,ate};
  }
  // por SKU: qtd + tempo médio de revisão e de embalagem
  app.get('/api/rel/sku',(req,res)=>{
    const {de,ate}=faixa(req);
    const rev=db.prepare(`SELECT UPPER(codigo) c, COUNT(*) q, ROUND(AVG(segundos)) t FROM revisao WHERE data BETWEEN ${de} AND ${ate} GROUP BY UPPER(codigo)`).all();
    const mon=db.prepare(`SELECT UPPER(codigo) c, COUNT(*) q, ROUND(AVG(segundos)) t FROM montagem WHERE data BETWEEN ${de} AND ${ate} GROUP BY UPPER(codigo)`).all();
    const rmap={},mmap={}; rev.forEach(r=>rmap[r.c]=r); mon.forEach(m=>mmap[m.c]=m);
    const cods=[...new Set([...rev.map(r=>r.c),...mon.map(m=>m.c)])].sort();
    const skus=db.prepare('SELECT UPPER(codigo) c, cor FROM skus').all(); const cor={}; skus.forEach(s=>cor[s.c]=s.cor);
    res.json(cods.map(c=>({ codigo:c, cor:cor[c]||'',
      rev_qtd:(rmap[c]||{}).q||0, rev_tmedio:(rmap[c]||{}).t||0,
      emb_qtd:(mmap[c]||{}).q||0, emb_tmedio:(mmap[c]||{}).t||0 })));
  });
  // por dia: total revisadas e embaladas
  app.get('/api/rel/dia',(req,res)=>{
    const {de,ate}=faixa(req);
    const rev=db.prepare(`SELECT data, COUNT(*) q FROM revisao WHERE data BETWEEN ${de} AND ${ate} GROUP BY data`).all();
    const mon=db.prepare(`SELECT data, COUNT(*) q FROM montagem WHERE data BETWEEN ${de} AND ${ate} GROUP BY data`).all();
    const map={}; rev.forEach(r=>{map[r.data]=map[r.data]||{data:r.data,rev:0,emb:0}; map[r.data].rev=r.q;});
    mon.forEach(m=>{map[m.data]=map[m.data]||{data:m.data,rev:0,emb:0}; map[m.data].emb=m.q;});
    res.json(Object.values(map).sort((a,b)=>a.data.localeCompare(b.data)));
  });
  // totais gerais do período
  app.get('/api/rel/resumo',(req,res)=>{
    const {de,ate}=faixa(req);
    const rev=db.prepare(`SELECT COUNT(*) q, ROUND(AVG(segundos)) t FROM revisao WHERE data BETWEEN ${de} AND ${ate}`).get();
    const mon=db.prepare(`SELECT COUNT(*) q, ROUND(AVG(segundos)) t FROM montagem WHERE data BETWEEN ${de} AND ${ate}`).get();
    res.json({ rev_qtd:rev.q||0, rev_tmedio:rev.t||0, emb_qtd:mon.q||0, emb_tmedio:mon.t||0 });
  });
};

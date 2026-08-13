module.exports=function(app,db){
  const DIAS=['dom','seg','ter','qua','qui','sex','sab'];
  function cfg(chave,padrao){
    try{ const c=db.prepare('SELECT valor FROM config WHERE chave=?').get(chave); if(c&&c.valor) return c.valor; }catch(e){}
    return padrao;
  }
  function hoje(){
    const a=new Date();
    return {d:DIAS[a.getDay()], hm:String(a.getHours()).padStart(2,'0')+':'+String(a.getMinutes()).padStart(2,'0')};
  }
  app.get('/api/revisao/status',(req,res)=>{
    const h=hoje();
    const corte=cfg('corte_'+h.d,'10:30');
    const prod=db.prepare("SELECT COALESCE(SUM(qtd),0) total, COALESCE(SUM(CASE WHEN urgente=1 THEN qtd ELSE 0 END),0) urg, COALESCE(SUM(CASE WHEN urgente=0 THEN qtd ELSE 0 END),0) rep FROM producao WHERE data=date('now','localtime')").get();
    const revUrg=db.prepare("SELECT COUNT(*) c FROM revisao WHERE data=date('now','localtime') AND modo='hoje'").get().c;
    res.json({corte, agora:h.hm, passouCorte:h.hm>=corte, dia:h.d,
      lancado: prod.total>0, urgentes:prod.urg, reposicao:prod.rep,
      urgentesFalta: Math.max(0, prod.urg-revUrg)});
  });
  app.get('/api/expedicao/status',(req,res)=>{
    const h=hoje();
    const desp=cfg('despacho_'+h.d,'15:00');
    const pend=db.prepare("SELECT COUNT(*) c FROM lote WHERE data=date('now','localtime') AND estagio='pendente'").get().c;
    const emb=db.prepare("SELECT COUNT(*) c FROM lote WHERE data=date('now','localtime') AND estagio='embalado'").get().c;
    const car=db.prepare("SELECT COUNT(*) c FROM lote WHERE data=date('now','localtime') AND estagio='carregado'").get().c;
    let falta=0;
    const p1=desp.split(':'), p2=h.hm.split(':');
    falta=(+p1[0]*60+ +p1[1])-(+p2[0]*60+ +p2[1]);
    res.json({despacho:desp, agora:h.hm, minutosRestantes:falta, passou:falta<0,
      pendentes:pend, embalados:emb, carregados:car});
  });
  app.get('/api/config/horarios',(req,res)=>{
    const r={};
    DIAS.forEach(d=>{ r[d]={corte:cfg('corte_'+d,'10:30'), despacho:cfg('despacho_'+d,'15:00')}; });
    res.json(r);
  });
  app.post('/api/config/horarios',(req,res)=>{
    const b=req.body||{};
    const ins=db.prepare("INSERT INTO config (chave,valor) VALUES (?,?) ON CONFLICT(chave) DO UPDATE SET valor=excluded.valor");
    let n=0;
    DIAS.forEach(d=>{
      if(b[d]){
        if(/^\d{2}:\d{2}$/.test(b[d].corte||'')){ ins.run('corte_'+d,b[d].corte); n++; }
        if(/^\d{2}:\d{2}$/.test(b[d].despacho||'')){ ins.run('despacho_'+d,b[d].despacho); n++; }
      }
    });
    res.json({ok:true,salvos:n});
  });
};

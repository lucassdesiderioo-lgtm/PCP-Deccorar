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
    /* Mesma régua do tile da tela vermelha (ordem_dia.js). `urgentesFalta` é o
       que a bancada ainda tem que PRODUZIR; `atendidas` é a ordem que ficou
       aberta com a venda já fora do estoque — peça revisada na tela azul e
       embalada como estoque não abate ordem (§4), mas atende o cliente igual. */
    const r=require('./ordem_dia').resumo(db);
    res.json({corte, agora:h.hm, passouCorte:h.hm>=corte, dia:h.d,
      lancado: (r.urgentes+r.reposicao)>0, urgentes:r.urgentes, reposicao:r.reposicao,
      urgentesFalta: r.urgentesFalta, atendidas: r.atendidas});
  });
  app.get('/api/expedicao/status',(req,res)=>{
    const h=hoje();
    const desp=cfg('despacho_'+h.d,'15:00');
    /* Mesma regua da fila (fila_dia.js). Contando por dia de importacao, o
       relogio de despacho ficava vermelho por causa de venda que so vence em
       setembro — pressa por trabalho que nao e do dia. */
    /* O RELOGIO E DA AGENCIA. A hora de despacho configurada e o limite pra
       levar o carro ate la; a coleta nao tem hora (a etiqueta dela vem sem, e
       quem manda e o caminhao do ML). Contar a coleta em `pendentes` deixaria
       o relogio vermelho por caixa que nao vai no carro — pressa por trabalho
       que nao e desse prazo. Ela sai a parte, em `pendentes_coleta`, pra tela
       dizer que existe sem alarmar. Regua unica em carga.js. */
    const {COLETA,AGENCIA}=require('./carga');
    const VH=require('./fila_dia').VENCE_HOJE;
    const pend=db.prepare("SELECT COUNT(*) c FROM lote WHERE estagio='pendente' AND "+VH+" AND "+AGENCIA()).get().c;
    const pendCol=db.prepare("SELECT COUNT(*) c FROM lote WHERE estagio='pendente' AND "+VH+" AND "+COLETA()).get().c;
    const emb=db.prepare("SELECT COUNT(*) c FROM lote WHERE data=date('now','localtime') AND estagio='embalado'").get().c;
    const car=db.prepare("SELECT COUNT(*) c FROM lote WHERE data=date('now','localtime') AND estagio='carregado'").get().c;
    let falta=0;
    const p1=desp.split(':'), p2=h.hm.split(':');
    falta=(+p1[0]*60+ +p1[1])-(+p2[0]*60+ +p2[1]);
    res.json({despacho:desp, agora:h.hm, minutosRestantes:falta, passou:falta<0,
      pendentes:pend, pendentes_coleta:pendCol, embalados:emb, carregados:car});
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

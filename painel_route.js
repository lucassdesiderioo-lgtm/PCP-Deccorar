module.exports = function(app, db){
  app.get('/api/painel', (req,res)=>{
    const skus = db.prepare('SELECT codigo, cor, estoque, alvo FROM skus ORDER BY codigo').all();
    const prod = db.prepare("SELECT codigo, COALESCE(SUM(qtd),0) pedido, COALESCE(SUM(produzido),0) produzido FROM producao WHERE data=date('now','localtime') GROUP BY codigo").all();
    const rev  = db.prepare("SELECT codigo, COUNT(*) revisadas FROM revisao WHERE data=date('now','localtime') GROUP BY codigo").all();
    let emb={}, car={};
    try{ db.prepare("SELECT UPPER(codigo) c, SUM(CASE WHEN estagio IN ('embalado','carregado') THEN 1 ELSE 0 END) emb, SUM(CASE WHEN estagio='carregado' THEN 1 ELSE 0 END) car FROM lote WHERE data=date('now','localtime') GROUP BY UPPER(codigo)").all().forEach(r=>{ emb[r.c]=r.emb; car[r.c]=r.car; }); }catch(e){}
    const pMap={}, rMap={}; prod.forEach(p=>pMap[p.codigo]=p); rev.forEach(r=>rMap[r.codigo]=r.revisadas);
    const linhas = skus.map(s=>{
      const p = pMap[s.codigo] || {pedido:0, produzido:0};
      const U=s.codigo.toUpperCase();
      return { codigo:s.codigo, cor:s.cor||'', estoque:s.estoque||0, alvo:s.alvo||0,
        demanda:p.pedido, produzido:p.produzido||0, revisadas:rMap[s.codigo]||0,
        embalado:emb[U]||0, carregado:car[U]||0,
        aProduzir: Math.max(0, p.pedido + (s.alvo||0) - (s.estoque||0)) };
    });
    // produtividade do dia: quantas peças revisadas/embaladas e o tempo médio
    // (revisao/montagem trazem segundos e data). Calculado no servidor p/ usar
    // a data local do banco e nao depender do relogio do navegador.
    const rp = db.prepare("SELECT COUNT(*) q, ROUND(AVG(segundos)) t FROM revisao WHERE data=date('now','localtime')").get();
    const ep = db.prepare("SELECT COUNT(*) q, ROUND(AVG(segundos)) t FROM montagem WHERE data=date('now','localtime')").get();
    res.json({ linhas, prod:{ rev_qtd:rp.q||0, rev_tmedio:rp.t||0, emb_qtd:ep.q||0, emb_tmedio:ep.t||0 } });
  });
};

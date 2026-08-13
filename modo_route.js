module.exports=function(app, db){
  app.get('/api/revisao/metas',(req,res)=>{
    res.json(db.prepare(`SELECT codigo, descricao, cor, estoque, alvo,
      MAX(0, alvo-estoque) AS falta
      FROM skus WHERE alvo>0 ORDER BY (alvo-estoque) DESC`).all());
  });
  app.get('/api/revisao/adiantar',(req,res)=>{
    res.json(db.prepare(`SELECT p.codigo, s.descricao, s.cor, SUM(p.qtd) qtd,
      SUM(p.produzido) produzido, MAX(0,SUM(p.qtd)-SUM(p.produzido)) falta
      FROM producao p LEFT JOIN skus s ON s.codigo=p.codigo
      WHERE p.data=date('now','localtime','+1 day') GROUP BY p.codigo HAVING falta>0 ORDER BY falta DESC`).all());
  });
  app.get('/api/revisao/dia',(req,res)=>{
    res.json(db.prepare(`SELECT p.codigo, s.descricao, s.cor, SUM(p.qtd) qtd,
      SUM(p.produzido) produzido, MAX(0,SUM(p.qtd)-SUM(p.produzido)) falta
      FROM producao p LEFT JOIN skus s ON s.codigo=p.codigo
      WHERE p.data=date('now','localtime') GROUP BY p.codigo ORDER BY falta DESC`).all());
  });
};

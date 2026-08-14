module.exports=function(app,db){
  // Fase 3 (docs/DESENHO-PLANEJAMENTO.md, secoes 5 e 9): o PDF passa a gerar
  // SO urgencia. A reposicao saiu do cruzamento — agora vem do calculo ao vivo
  // (tela azul, /api/revisao/producao). Com isso a foto_estoque perdeu a razao
  // de existir e foi removida.
  //
  // Urgencia = venda do dia com NF cujo SKU nao tem estoque. Contamos os volumes
  // ainda PENDENTES (nao embalados/expedidos) contra o estoque atual: assim o
  // numero se auto-corrige — reaplicar depois de produzir/expedir nao infla nada,
  // porque o volume ja processado sai de 'pendente' e o estoque ja baixou junto.
  // Era isso que a foto_estoque protegia; agora o proprio dado corrente resolve.
  function calcular(){
    const pend=db.prepare(`SELECT codigo, COUNT(*) qtd FROM lote
      WHERE data=date('now','localtime') AND codigo IS NOT NULL AND estagio='pendente'
      GROUP BY codigo`).all();
    const emap={};
    db.prepare('SELECT codigo,estoque FROM skus').all().forEach(s=>{ emap[s.codigo]=s.estoque; });
    const r=[];
    for(const v of pend){
      const estoque=emap[v.codigo]||0;
      const urgente=Math.max(0, v.qtd-estoque);
      r.push({codigo:v.codigo, pendentes:v.qtd, estoque, urgente});
    }
    return r;
  }

  app.get('/api/cruzamento',(req,res)=> res.json(calcular()));

  app.post('/api/cruzamento/aplicar',(req,res)=>{
    const linhas=calcular();
    let urg=0;
    db.transaction(()=>{
      // idempotente: apaga as ordens 'ml' do dia e refaz so as urgentes
      db.prepare("DELETE FROM producao WHERE data=date('now','localtime') AND origem='ml'").run();
      const ins=db.prepare("INSERT INTO producao (codigo,qtd,origem,urgente) VALUES (?,?,'ml',1)");
      for(const l of linhas){ if(l.urgente>0){ ins.run(l.codigo,l.urgente); urg+=l.urgente; } }
    })();
    res.json({ok:true,urgentes:urg,linhas});
  });
};

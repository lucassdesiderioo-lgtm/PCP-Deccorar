const URGENCIA = require('./urgencia');

module.exports=function(app,db){
  // Fase 3 (docs/DESENHO-PLANEJAMENTO.md, secoes 5 e 9): o PDF passa a gerar
  // SO urgencia. A reposicao saiu do cruzamento — agora vem do calculo ao vivo
  // (tela azul, /api/revisao/producao). Com isso a foto_estoque perdeu a razao
  // de existir e foi removida.
  //
  // Urgencia = venda do dia com NF cujo SKU nao tem estoque. Contamos o que
  // ainda esta PENDENTE (nao embalado/expedido) contra o estoque atual: assim o
  // numero se auto-corrige — reaplicar depois de produzir/expedir nao infla nada,
  // porque o volume ja processado sai de 'pendente' e o estoque ja baixou junto.
  // Era isso que a foto_estoque protegia; agora o proprio dado corrente resolve.
  //
  // ⚠️ A CONTA E EM PECAS, e ela mora no `urgencia.js` — nao aqui. O
  // `rastrear.js --lote` faz a MESMA pergunta para explicar a escada do PDF ate
  // a tela; com duas copias, a ferramenta de diagnostico confirmaria com
  // autoridade um numero que a tela nao usa (mesmo motivo do `fila_dia.js`).
  const calcular = () => URGENCIA.calcular(db);

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

module.exports=function(app,db){
  app.get('/api/proximo/:sku',(req,res)=>{
    const sku=(req.params.sku||'').trim().toUpperCase();
    /* O QUE A PECA E, nao so o codigo dela. O leitor de codigo de barras le a
       ETIQUETA, nunca a persiana: se a peca dentro da caixa nao for o que a
       etiqueta diz, nenhum bipe no mundo percebe. Estas quatro informacoes sao
       a unica conferencia possivel contra isso — o operador olha a peca e olha
       a tela. Vem das colunas de `skus` (§7), nunca do texto do codigo. */
    const s=db.prepare(`SELECT s.codigo,s.estoque,s.largura_cm,s.altura_cm,
        COALESCE(c.nome,s.cor_codigo,s.cor) cor_nome, COALESCE(t.nome,s.tecido_codigo) tecido_nome,
        m.nome modelo_nome, COALESCE(m.exige_medida,1) exige_medida
      FROM skus s
      LEFT JOIN cor c ON c.codigo=s.cor_codigo
      LEFT JOIN tecido t ON t.codigo=s.tecido_codigo
      LEFT JOIN modelo m ON m.id=s.modelo_id
      WHERE s.codigo=?`).get(sku);
    if(!s) return res.json({cadastrado:false});
    const total=db.prepare("SELECT COUNT(*) c FROM lote WHERE codigo=? AND data=date('now','localtime')").get(sku).c;
    const pend=db.prepare("SELECT COUNT(*) c FROM lote WHERE codigo=? AND data=date('now','localtime') AND estagio='pendente'").get(sku).c;
    const p=db.prepare("SELECT id,codigo,cor,buyer,city,nf,packId,venda FROM lote WHERE codigo=? AND data=date('now','localtime') AND estagio='pendente' ORDER BY id LIMIT 1").get(sku);
    /* Medida so entra quando o modelo cobra medida — acessorio nao tem, e
       exibir "null x null" ensinaria o operador a ignorar a linha inteira. */
    const peca={
      medida:(s.exige_medida && s.largura_cm && s.altura_cm)?(s.largura_cm+' × '+s.altura_cm):null,
      cor:s.cor_nome||null, tecido:s.tecido_nome||null, modelo:s.modelo_nome||null
    };
    res.json({cadastrado:true,estoque:s.estoque,total,pendentes:pend,pedido:p||null,peca});
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

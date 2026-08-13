module.exports=function(app,db){
  // bipe da etiqueta de venda -> acha o pacote pelos codigos e marca carregado
  app.post('/api/carregar',(req,res)=>{
    let code=((req.body&&req.body.code)||'').trim();
    if(!code) return res.status(400).json({erro:'sem codigo'});
    const digits=code.replace(/\D/g,'');
    const jid=(code.match(/"id"\s*:\s*"?(\d+)/)||[])[1]||null;
    const cands=[code, digits, jid].filter(Boolean);
    // procura no lote de hoje um pedido cujos codigos batam
    const rows=db.prepare("SELECT * FROM lote WHERE data=date('now','localtime')").all();
    let alvo=null;
    for(const r of rows){
      let cs=[]; try{ cs=JSON.parse(r.codes||'[]'); }catch(e){}
      cs=cs.concat([r.packId,r.venda].filter(Boolean));
      if(cs.some(c=> cands.includes(String(c)) )){ alvo=r; break; }
    }
    if(!alvo) return res.json({ok:false,motivo:'nao_encontrado',lido:code});
    if(alvo.estagio==='bloqueado') return res.json({ok:false,motivo:'bloqueado',pedido:alvo,
        aviso:'SKU "'+(alvo.codigo||'(vazio)')+'" nao esta no cadastro. Nao pode ser carregado.'});
    if(alvo.estagio==='carregado') return res.json({ok:false,motivo:'duplicado',pedido:alvo});
    db.prepare("UPDATE lote SET estagio='carregado', carregado_em=datetime('now','localtime') WHERE id=?").run(alvo.id);
    const tot=db.prepare("SELECT COUNT(*) n FROM lote WHERE data=date('now','localtime') AND estagio IN ('embalado','carregado')").get().n;
    const car=db.prepare("SELECT COUNT(*) n FROM lote WHERE data=date('now','localtime') AND estagio='carregado'").get().n;
    res.json({ok:true,pedido:alvo,carregados:car,total:tot});
  });
  // conferencia: o que falta carregar (do que foi embalado hoje)
  app.get('/api/carregamento',(req,res)=>{
    const total=db.prepare("SELECT COUNT(*) n FROM lote WHERE data=date('now','localtime') AND estagio IN ('embalado','carregado')").get().n;
    const car=db.prepare("SELECT COUNT(*) n FROM lote WHERE data=date('now','localtime') AND estagio='carregado'").get().n;
    const falta=db.prepare("SELECT id,codigo,cor,buyer,nf FROM lote WHERE data=date('now','localtime') AND estagio='embalado' ORDER BY id").all();
    res.json({total,carregados:car,faltam:falta});
  });
};

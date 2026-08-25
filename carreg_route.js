module.exports=function(app,db){
  /* ── CONFERENCIA DUPLA (etiqueta de venda + SKU da caixa) ──────────────────
     A ultima rede antes do carro. Bipe 1 = a etiqueta de venda JA COLADA;
     bipe 2 = o codigo de barras do SKU na propria caixa (que continua visivel,
     porque a etiqueta de venda e colada por baixo dele). Sao dois objetos
     diferentes na mesma caixa: se a etiqueta foi parar na caixa errada, os dois
     nao batem e o volume nao carrega.
     O bipe 2 e CEGO de proposito — o sistema nao mostra o SKU esperado antes,
     senao a conferencia vira confirmacao: quem ja sabe a resposta bipa o que
     for pra fechar a linha. So depois de divergir e que os dois codigos
     aparecem, e ai como alarme.
     Fica desligavel porque custa um bipe por volume, todo dia: o dono liga
     quando quiser a trava e desliga se ela atrapalhar mais do que protege. */
  const conferenciaLigada=()=>{
    try{ const c=db.prepare("SELECT valor FROM config WHERE chave='conf_carregamento'").get();
         return !!(c && String(c.valor)==='1'); }catch(e){ return false; }
  };
  const soCodigo=s=>String(s||'').replace(/[^A-Za-z0-9]/g,'').toUpperCase();
  app.get('/api/config/conferencia',(req,res)=> res.json({ligada:conferenciaLigada()}));
  app.post('/api/config/conferencia',(req,res)=>{
    const v=(req.body&&req.body.ligada)?'1':'0';
    db.prepare(`INSERT INTO config (chave,valor) VALUES ('conf_carregamento',?)
      ON CONFLICT(chave) DO UPDATE SET valor=excluded.valor`).run(v);
    res.json({ok:true,ligada:v==='1'});
  });

  // bipe da etiqueta de venda -> acha o pacote pelos codigos e marca carregado
  app.post('/api/carregar',(req,res)=>{
    let code=((req.body&&req.body.code)||'').trim();
    const skuLido=soCodigo((req.body&&req.body.sku)||'');
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
    if(conferenciaLigada()){
      const esperado=soCodigo(alvo.codigo);
      if(!esperado) return res.json({ok:false,motivo:'volume_sem_sku',
        pedido:{id:alvo.id,buyer:alvo.buyer,nf:alvo.nf},
        aviso:'Esse volume nao tem SKU no sistema. Resolva no Admin antes de carregar.'});
      /* Sem o 2o bipe o volume nao passa — e a resposta NAO leva o SKU esperado,
         pra conferencia continuar cega. */
      if(!skuLido) return res.json({ok:false,motivo:'falta_sku',
        pedido:{id:alvo.id,buyer:alvo.buyer,nf:alvo.nf,city:alvo.city}});
      if(skuLido!==esperado){
        try{ const ac=app.locals.acesso;
             if(ac&&ac.auditar) ac.auditar(req,'expedicao','sku_divergente_carregamento',
               'NF '+(alvo.nf||alvo.id), 'esperado '+alvo.codigo+' / lido '+skuLido); }catch(e){}
        return res.json({ok:false,motivo:'sku_divergente',esperado:alvo.codigo,lido:skuLido,
          pedido:{id:alvo.id,buyer:alvo.buyer,nf:alvo.nf,city:alvo.city}});
      }
    }
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

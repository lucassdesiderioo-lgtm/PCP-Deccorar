module.exports=function(app,db){
  app.get('/api/gerencial',(req,res)=>{
    const de=req.query.de||null, ate=req.query.ate||null;
    let W='1=1'; const P=[];
    if(de){ W+=' AND data>=?'; P.push(de); }
    if(ate){ W+=' AND data<=?'; P.push(ate); }
    const q=(sql)=>{ try{ return db.prepare(sql).all(...P); }catch(e){ return []; } };
    const g=(sql)=>{ try{ return db.prepare(sql).get(...P)||{}; }catch(e){ return {}; } };
    const totRev=g("SELECT COUNT(*) c, ROUND(AVG(segundos)) t FROM revisao WHERE "+W);
    const totEmb=g("SELECT COUNT(*) c, ROUND(AVG(segundos)) t FROM montagem WHERE "+W);
    const totRej=g("SELECT COUNT(*) c FROM rejeicao WHERE "+W);
    const totDev=g("SELECT COUNT(*) c FROM devolucao WHERE "+W);
    const totVen=g("SELECT COUNT(*) c FROM lote WHERE "+W);
    const div=g("SELECT COUNT(*) c FROM devolucao WHERE "+W+" AND sku_venda IS NOT NULL AND sku_venda<>sku_fisico");
    let fila={}; try{ fila=db.prepare("SELECT COUNT(*) c FROM fila WHERE situacao='aguardando'").get()||{}; }catch(e){}
    let est=[]; try{ est=db.prepare("SELECT codigo l, estoque, alvo, MAX(0,alvo-estoque) falta FROM skus WHERE alvo>0 ORDER BY (alvo-estoque) DESC LIMIT 12").all(); }catch(e){}
    res.json({
      totais:{revisadas:totRev.c||0,tempoRev:totRev.t||0,embaladas:totEmb.c||0,tempoEmb:totEmb.t||0,
        rejeitadas:totRej.c||0,devolucoes:totDev.c||0,vendas:totVen.c||0,filaAtual:fila.c||0,divergencias:div.c||0},
      serie:{
        producao:q("SELECT data, COUNT(*) qtd FROM revisao WHERE "+W+" GROUP BY data ORDER BY data"),
        embalagem:q("SELECT data, COUNT(*) qtd FROM montagem WHERE "+W+" GROUP BY data ORDER BY data"),
        rejeicao:q("SELECT data, COUNT(*) qtd FROM rejeicao WHERE "+W+" GROUP BY data ORDER BY data")
      },
      qualidade:{
        porMotivo:q("SELECT motivo l, COUNT(*) qtd FROM rejeicao WHERE "+W+" GROUP BY motivo ORDER BY qtd DESC"),
        porSku:q("SELECT codigo l, COUNT(*) qtd FROM rejeicao WHERE "+W+" GROUP BY codigo ORDER BY qtd DESC LIMIT 10")
      },
      devolucao:{
        porMotivo:q("SELECT COALESCE(motivo,'(sem baixa)') l, COUNT(*) qtd FROM devolucao WHERE "+W+" GROUP BY motivo ORDER BY qtd DESC"),
        porSku:q("SELECT sku_fisico l, COUNT(*) qtd FROM devolucao WHERE "+W+" GROUP BY sku_fisico ORDER BY qtd DESC LIMIT 10"),
        destinacao:q("SELECT COALESCE(destinacao,'-') l, COUNT(*) qtd FROM devolucao WHERE "+W+" GROUP BY destinacao"),
        reputacao:g("SELECT SUM(CASE WHEN reputacao='sim' THEN 1 ELSE 0 END) sim, SUM(CASE WHEN reputacao='nao' THEN 1 ELSE 0 END) nao, SUM(CASE WHEN baixado=0 THEN 1 ELSE 0 END) pendente FROM devolucao WHERE "+W)
      },
      tempos:{
        porSku:q("SELECT codigo l, COUNT(*) qtd, ROUND(AVG(segundos)) media FROM revisao WHERE "+W+" GROUP BY codigo ORDER BY media DESC LIMIT 10"),
        porModo:q("SELECT COALESCE(modo,'?') l, COUNT(*) qtd, ROUND(AVG(segundos)) media FROM revisao WHERE "+W+" GROUP BY modo")
      },
      estoque:est
    });
  });
};

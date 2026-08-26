const {PRA_CARREGAR,ORDEM_CARGA,atrasado}=require('./carga');
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
    /* PROCURA O VOLUME PELO CODIGO, NAO PELO DIA (carga.js).
       Enquanto isto era `WHERE data=date('now','localtime')`, o volume
       embalado ontem e nao carregado ontem respondia "nao encontrado" hoje —
       com a caixa na mao, na frente do carro. A busca larga primeiro (a chave
       e o codigo do ML, que e unico) e so depois confere o codigo exato, que
       e a mesma comparacao de antes. */
    const vistos=new Set(); const achados=[];
    for(const c of cands){
      for(const r of db.prepare('SELECT * FROM lote WHERE packId=? OR venda=? OR codes LIKE ?').all(c,c,'%'+c+'%')){
        if(vistos.has(r.id)) continue;
        vistos.add(r.id); achados.push(r);
      }
    }
    const batem=achados.filter(r=>{
      let cs=[]; try{ cs=JSON.parse(r.codes||'[]'); }catch(e){}
      cs=cs.concat([r.packId,r.venda].filter(Boolean));
      return cs.some(c=> cands.includes(String(c)) );
    });
    /* Duplicata do mesmo codigo existe (§5, os fantasmas). Entre irmaos, o que
       esta pra carregar manda: bipar a caixa certa nao pode dar "ja carregado"
       so porque um irmao fantasma andou antes. */
    const alvo = batem.find(r=>r.estagio==='embalado') || batem[0] || null;
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
    const p=progresso();
    res.json({ok:true,pedido:alvo,carregados:p.carregados,total:p.total});
  });
  /* O PROGRESSO DA CARGA — o mesmo numero pras duas rotas.
     "Carregados X de Y" e a lista tem que falar do mesmo universo, senao o
     banner diz 12 de 12 com a lista mostrando 3 faltando. Y e o que ha pra
     fazer agora (todo `embalado`, de qualquer dia) mais o que ja foi carregado
     hoje — nao o total do dia de importacao, que era o que escondia o
     atrasado. */
  function progresso(){
    const hoje=db.prepare("SELECT date('now','localtime') d").get().d;
    const faltam=db.prepare(`SELECT id,codigo,cor,buyer,nf,data,despachar_em FROM lote
      WHERE ${PRA_CARREGAR} ORDER BY ${ORDEM_CARGA}`).all()
      .map(v=>Object.assign({},v,{atrasado: atrasado(v,hoje)?1:0}));
    /* CARREGADOS HOJE conta por `carregado_em`, nao por `data` — mesma razao do
       "impressas hoje" no exp_route.js. Contando pelo dia de importacao, o
       operador bipava um volume atrasado, ele saia da lista e o contador NAO
       andava: a tela ficava dizendo que ele nao tinha feito nada. */
    const car=db.prepare(`SELECT COUNT(*) n FROM lote WHERE carregado_em IS NOT NULL
      AND date(carregado_em)=date('now','localtime')`).get().n;
    return {total:car+faltam.length, carregados:car, faltam,
            atrasados:faltam.filter(f=>f.atrasado).length};
  }
  // conferencia: o que falta carregar — todo `embalado`, com o atrasado marcado
  app.get('/api/carregamento',(req,res)=> res.json(progresso()));
};

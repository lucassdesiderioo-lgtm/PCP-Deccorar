module.exports=function(app,db){
  db.exec("CREATE TABLE IF NOT EXISTS contagem (id INTEGER PRIMARY KEY AUTOINCREMENT, codigo TEXT, contado_em TEXT DEFAULT (datetime('now','localtime')), sessao TEXT, teste INTEGER DEFAULT 0)");
  // contagem_pendente (secao 10) e criada em acesso.js; garantimos aqui tambem,
  // para o modulo funcionar mesmo carregado isolado. IF NOT EXISTS = idempotente.
  db.exec("CREATE TABLE IF NOT EXISTS contagem_pendente (id INTEGER PRIMARY KEY AUTOINCREMENT, sessao TEXT, codigo TEXT, contado INTEGER, sistema_era INTEGER, operacao TEXT, contado_por TEXT, criado_em TEXT DEFAULT (datetime('now','localtime')), aprovado INTEGER DEFAULT 0, aprovado_por TEXT, aprovado_em TEXT)");

  // Quem tem contagem.ajustar aplica direto ao estoque; quem so tem
  // contagem.contar deixa o ajuste PENDENTE para o admin aprovar (secao 9).
  function podeAjustar(req){
    const u = req.usuario, ac = app.locals.acesso;
    try{ if(ac && ac.podePermissao) return ac.podePermissao(u, 'contagem.ajustar'); }catch(e){}
    return !!(u && (u.areas||[]).includes('admin'));   // fallback modelo antigo
  }
  function auditar(req, acao, alvo, detalhe){
    const ac = app.locals.acesso;
    try{ if(ac && ac.auditar) ac.auditar(req, 'estoque', acao, alvo, detalhe); }catch(e){}
  }

  // enfileira o ajuste para aprovacao posterior; captura a contagem e o estoque
  // do momento, e limpa a sessao (o dado agora vive em contagem_pendente).
  function enfileirar(req, sessao, codigos, operacao){
    const cont = db.prepare('SELECT COUNT(*) c FROM contagem WHERE codigo=? AND sessao=?');
    const est  = db.prepare('SELECT estoque FROM skus WHERE codigo=?');
    const ins  = db.prepare("INSERT INTO contagem_pendente (sessao,codigo,contado,sistema_era,operacao,contado_por) VALUES (?,?,?,?,?,?)");
    const quem = (req.usuario && req.usuario.nome) || '';
    let n = 0;
    db.transaction(()=>{
      codigos.forEach(c=>{
        const q = cont.get(c, sessao).c;
        const e = est.get(c);
        ins.run(sessao, c, q, e ? e.estoque : null, operacao, quem);
        n++;
      });
      db.prepare('DELETE FROM contagem WHERE sessao=?').run(sessao);
    })();
    return n;
  }

  app.post('/api/contagem/bipe',(req,res)=>{
    const cod=((req.body&&req.body.codigo)||'').trim().toUpperCase();
    const ses=((req.body&&req.body.sessao)||'').trim();
    if(!cod) return res.status(400).json({erro:'sem codigo'});
    const existe=db.prepare('SELECT codigo,descricao,cor,estoque FROM skus WHERE codigo=?').get(cod);
    db.prepare('INSERT INTO contagem (codigo,sessao) VALUES (?,?)').run(cod,ses);
    const n=db.prepare('SELECT COUNT(*) c FROM contagem WHERE codigo=? AND sessao=?').get(cod,ses).c;
    res.json({ok:true,codigo:cod,cadastrado:!!existe,contado:n,estoque:existe?existe.estoque:null,cor:existe?existe.cor:''});
  });

  // ── contagem pendente (registra ANTES do /:sessao para nao cair no param) ──
  app.get('/api/contagem/pendentes',(req,res)=>{
    const linhas=db.prepare(`SELECT p.id,p.sessao,p.codigo,p.contado,p.sistema_era,p.operacao,
        p.contado_por,p.criado_em, s.estoque AS estoque_atual, s.cor
      FROM contagem_pendente p LEFT JOIN skus s ON s.codigo=p.codigo
      WHERE p.aprovado=0 ORDER BY p.criado_em, p.codigo`).all();
    res.json({linhas, total:linhas.length});
  });

  app.post('/api/contagem/pendentes/aprovar',(req,res)=>{
    const ids=(req.body&&req.body.ids)||[];
    if(!ids.length) return res.status(400).json({erro:'sem ids'});
    const quem=(req.usuario&&req.usuario.nome)||'';
    let n=0;
    db.transaction(()=>{
      const get=db.prepare('SELECT * FROM contagem_pendente WHERE id=? AND aprovado=0');
      const setEst=db.prepare('UPDATE skus SET estoque=? WHERE codigo=?');
      const addEst=db.prepare('UPDATE skus SET estoque=MAX(0,estoque+?) WHERE codigo=?');
      const mark=db.prepare("UPDATE contagem_pendente SET aprovado=1,aprovado_por=?,aprovado_em=datetime('now','localtime') WHERE id=?");
      ids.forEach(id=>{
        const p=get.get(id); if(!p) return;
        if(p.operacao==='lancar') addEst.run(p.contado,p.codigo);
        else setEst.run(Math.max(0,p.contado|0),p.codigo);
        mark.run(quem,id); n++;
        auditar(req,'contagem_aprovada',p.codigo,p.operacao+' contado='+p.contado+' (contou: '+p.contado_por+')');
      });
    })();
    res.json({ok:true,aprovados:n});
  });

  app.post('/api/contagem/pendentes/rejeitar',(req,res)=>{
    const ids=(req.body&&req.body.ids)||[];
    if(!ids.length) return res.status(400).json({erro:'sem ids'});
    let n=0;
    db.transaction(()=>{
      const get=db.prepare('SELECT codigo,operacao,contado,contado_por FROM contagem_pendente WHERE id=? AND aprovado=0');
      const del=db.prepare('DELETE FROM contagem_pendente WHERE id=? AND aprovado=0');
      ids.forEach(id=>{
        const p=get.get(id); if(!p) return;
        del.run(id); n++;
        auditar(req,'contagem_rejeitada',p.codigo,p.operacao+' contado='+p.contado+' (contou: '+p.contado_por+')');
      });
    })();
    res.json({ok:true,rejeitados:n});
  });

  app.get('/api/contagem/:sessao',(req,res)=>{
    const ses=req.params.sessao;
    const cont=db.prepare('SELECT codigo, COUNT(*) qtd FROM contagem WHERE sessao=? GROUP BY codigo').all(ses);
    const mapa={}; cont.forEach(c=>{ mapa[c.codigo]=c.qtd; });
    const skus=db.prepare('SELECT codigo,cor,estoque FROM skus ORDER BY codigo').all();
    const linhas=[], desconhecidos=[];
    skus.forEach(s=>{
      if(mapa[s.codigo]===undefined) return;
      linhas.push({codigo:s.codigo,cor:s.cor,sistema:s.estoque,contado:mapa[s.codigo],dif:mapa[s.codigo]-s.estoque});
      delete mapa[s.codigo];
    });
    Object.keys(mapa).forEach(k=>desconhecidos.push({codigo:k,qtd:mapa[k]}));
    const naoContados=skus.filter(s=>!linhas.some(l=>l.codigo===s.codigo)&&s.estoque>0)
                          .map(s=>({codigo:s.codigo,sistema:s.estoque}));
    res.json({linhas,desconhecidos,naoContados});
  });

  // ajustar = SUBSTITUI (estoque := contado). Direto p/ quem tem contagem.ajustar;
  // senao vira pendente.
  app.post('/api/contagem/ajustar',(req,res)=>{
    const ses=((req.body&&req.body.sessao)||'').trim();
    const codigos=(req.body&&req.body.codigos)||[];
    if(!ses||!codigos.length) return res.status(400).json({erro:'faltam dados'});
    if(!podeAjustar(req)){
      const pend=enfileirar(req,ses,codigos,'ajustar');
      return res.json({ok:true,pendente:pend});
    }
    let n=0;
    db.transaction(()=>{
      const up=db.prepare('UPDATE skus SET estoque=? WHERE codigo=?');
      codigos.forEach(c=>{
        const q=db.prepare('SELECT COUNT(*) c FROM contagem WHERE codigo=? AND sessao=?').get(c,ses).c;
        up.run(q,c); n++;
        auditar(req,'contagem_ajuste',c,'substitui -> '+q);
      });
    })();
    res.json({ok:true,ajustados:n});
  });

  // lancar = SOMA (estoque += contado). Direto p/ quem tem contagem.ajustar;
  // senao vira pendente.
  app.post('/api/contagem/lancar',(req,res)=>{
    const ses=((req.body&&req.body.sessao)||'').trim();
    const codigos=(req.body&&req.body.codigos)||[];
    if(!ses||!codigos.length) return res.status(400).json({erro:'faltam dados'});
    if(!podeAjustar(req)){
      const pend=enfileirar(req,ses,codigos,'lancar');
      return res.json({ok:true,pendente:pend});
    }
    let n=0;
    db.transaction(()=>{
      const up=db.prepare('UPDATE skus SET estoque=estoque+? WHERE codigo=?');
      codigos.forEach(c=>{
        const q=db.prepare('SELECT COUNT(*) c FROM contagem WHERE codigo=? AND sessao=?').get(c,ses).c;
        up.run(q,c); n++;
        auditar(req,'contagem_lancamento',c,'soma +'+q);
      });
      db.prepare('DELETE FROM contagem WHERE sessao=?').run(ses);
    })();
    res.json({ok:true,lancados:n});
  });

  app.delete('/api/contagem/:sessao',(req,res)=>{
    const n=db.prepare('DELETE FROM contagem WHERE sessao=?').run(req.params.sessao).changes;
    res.json({ok:true,apagados:n});
  });
};

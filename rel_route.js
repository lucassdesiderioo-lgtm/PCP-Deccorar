/* RELATORIOS-UNIFICADOS (08/11/2026): a central de relatorios na 904. Toda
   rota daqui so LE, e cada numero vem do dono dele (relatorios_dominio.js,
   produtividade_dominio.js). Quem pode: `/api/rel/*` e "Ver relatorios"; a
   "Minha producao" e "Ver a propria producao"; o "Por pessoa" e "Ver producao
   da equipe" ou "com nome" — e o nome so viaja com a de nome (permDaRota). */
const REL = require('./relatorios_dominio');
const PROD = require('./produtividade_dominio');
const QUEM = require('./quem');
module.exports=function(app,db){
  const responder = (res, f) => { try{ res.json(f()); }
    catch(e){ console.log('[relatorios] ' + (e && e.stack || e)); res.status(500).json({ erro:'não consegui montar o relatório' }); } };
  const per = req => REL.periodo(db, (req.query||{}).de, (req.query||{}).ate);
  app.get('/api/rel/semana', (req,res) => responder(res, () => REL.semana(db, (req.query||{}).domingo)));
  app.get('/api/rel/vendas', (req,res) => responder(res, () => REL.vendas(db, (req.query||{}).de, (req.query||{}).ate)));
  app.get('/api/rel/producao', (req,res) => responder(res, () => { const p = per(req); return REL.producao(db, p.de, p.ate); }));
  app.get('/api/rel/expedicao', (req,res) => responder(res, () => { const p = per(req); return REL.expedicao(db, p.de, p.ate); }));
  app.get('/api/rel/estoque', (req,res) => responder(res, () => { const p = per(req); return REL.estoque(db, p.de, p.ate); }));

  /* POR PESSOA (fase 3). A equipe sem nome a quem so tem "Ver producao da
     equipe"; com nome a quem tem "Ver producao com nome". */
  app.get('/api/rel/pessoas', (req,res) => responder(res, () => {
    const p = per(req);
    let comNome = false;
    try{ comNome = !!app.locals.acesso.podePermissao(req.usuario, 'produtividade.nominal'); }catch(e){}
    return { de:p.de, ate:p.ate, com_nome:comNome, desde:PROD.desde(db), etapas:PROD.daEquipe(db, p.de, p.ate, comNome) };
  }));

  /* A MINHA PRODUCAO (905): o que a pessoa LOGADA fez — hoje, nesta semana
     (de segunda ate hoje) e neste mes. Quem e a pessoa vem do servidor
     (quem.js), nunca da tela: nao ha parametro de pessoa nesta rota. */
  app.get('/api/rel/minha', (req,res) => {
    const uid = QUEM.idDe(req);
    if(uid == null) return res.status(401).json({ erro:'Entre com o seu PIN para ver a sua produção.' });
    responder(res, () => {
      const hoje = REL.periodo(db).ate;
      const seg = REL.mais(REL.domingoAte(hoje), -6), mes = hoje.slice(0, 8) + '01';
      return { nome:QUEM.nomeDe(req), hoje, desde:PROD.desde(db),
        periodos:[ { chave:'hoje', nome:'Hoje', de:hoje, ate:hoje, etapas:PROD.daPessoa(db, uid, hoje, hoje) },
                   { chave:'semana', nome:'Nesta semana', de:seg, ate:hoje, etapas:PROD.daPessoa(db, uid, seg, hoje) },
                   { chave:'mes', nome:'Neste mês', de:mes, ate:hoje, etapas:PROD.daPessoa(db, uid, mes, hoje) } ] };
    });
  });

  function faixa(req){
    let de=(req.query.de||'').trim(), ate=(req.query.ate||'').trim();
    if(!/^\d{4}-\d{2}-\d{2}$/.test(de)) de="date('now','localtime','-6 days')"; else de="'"+de+"'";
    if(!/^\d{4}-\d{2}-\d{2}$/.test(ate)) ate="date('now','localtime')"; else ate="'"+ate+"'";
    return {de,ate};
  }
  // por SKU: qtd + tempo médio de revisão e de embalagem
  app.get('/api/rel/sku',(req,res)=>{
    const {de,ate}=faixa(req);
    const rev=db.prepare(`SELECT UPPER(codigo) c, COUNT(*) q, ROUND(AVG(segundos)) t FROM revisao WHERE data BETWEEN ${de} AND ${ate} GROUP BY UPPER(codigo)`).all();
    const mon=db.prepare(`SELECT UPPER(codigo) c, COUNT(*) q, ROUND(AVG(segundos)) t FROM montagem WHERE data BETWEEN ${de} AND ${ate} GROUP BY UPPER(codigo)`).all();
    const rmap={},mmap={}; rev.forEach(r=>rmap[r.c]=r); mon.forEach(m=>mmap[m.c]=m);
    const cods=[...new Set([...rev.map(r=>r.c),...mon.map(m=>m.c)])].sort();
    const skus=db.prepare('SELECT UPPER(codigo) c, cor FROM skus').all(); const cor={}; skus.forEach(s=>cor[s.c]=s.cor);
    res.json(cods.map(c=>({ codigo:c, cor:cor[c]||'',
      rev_qtd:(rmap[c]||{}).q||0, rev_tmedio:(rmap[c]||{}).t||0,
      emb_qtd:(mmap[c]||{}).q||0, emb_tmedio:(mmap[c]||{}).t||0 })));
  });
  // por dia: total revisadas e embaladas
  app.get('/api/rel/dia',(req,res)=>{
    const {de,ate}=faixa(req);
    const rev=db.prepare(`SELECT data, COUNT(*) q FROM revisao WHERE data BETWEEN ${de} AND ${ate} GROUP BY data`).all();
    const mon=db.prepare(`SELECT data, COUNT(*) q FROM montagem WHERE data BETWEEN ${de} AND ${ate} GROUP BY data`).all();
    const map={}; rev.forEach(r=>{map[r.data]=map[r.data]||{data:r.data,rev:0,emb:0}; map[r.data].rev=r.q;});
    mon.forEach(m=>{map[m.data]=map[m.data]||{data:m.data,rev:0,emb:0}; map[m.data].emb=m.q;});
    res.json(Object.values(map).sort((a,b)=>a.data.localeCompare(b.data)));
  });
  // totais gerais do período
  app.get('/api/rel/resumo',(req,res)=>{
    const {de,ate}=faixa(req);
    const rev=db.prepare(`SELECT COUNT(*) q, ROUND(AVG(segundos)) t FROM revisao WHERE data BETWEEN ${de} AND ${ate}`).get();
    const mon=db.prepare(`SELECT COUNT(*) q, ROUND(AVG(segundos)) t FROM montagem WHERE data BETWEEN ${de} AND ${ate}`).get();
    res.json({ rev_qtd:rev.q||0, rev_tmedio:rev.t||0, emb_qtd:mon.q||0, emb_tmedio:mon.t||0 });
  });
};

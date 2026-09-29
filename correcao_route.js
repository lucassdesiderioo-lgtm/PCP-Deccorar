/* A MESA DE CORRECOES — as rotas. Fase 1 da spec MESA-DE-CORRECOES
 * (29/09/2026). A regra mora no correcoes.js; aqui so ha transacao, resposta e
 * auditoria. Todas pedem `correcao.executar` (permDaRota, no acesso.js).
 */
const C = require('./correcoes');

module.exports = function(app, db){
  C.garantirSchema(db);

  const quem = req => { const u = req.usuario || null; return u ? { id:u.id != null ? u.id : null, nome:u.nome || '' } : null; };
  function auditar(req, acao, alvo, detalhe){
    try{ app.locals.acesso.auditar(req, 'correcao', acao, alvo, detalhe); }catch(e){}
  }
  function responder(res, fn){
    try{ return res.json(Object.assign({ ok:true }, fn())); }
    catch(e){
      if(e && e.status) return res.status(e.status).json(Object.assign({ ok:false, erro:e.message }, e.extra || {}));
      console.log('[correcao] ' + (e && e.stack || e));
      return res.status(500).json({ ok:false, erro:'falhou, e nada foi gravado: ' + (e && e.message) });
    }
  }
  const tx = fn => db.transaction(fn)();

  // As tres de leitura vem antes da `:tipo/:id`, que casaria com qualquer coisa.
  app.get('/api/correcao/buscar', (req,res) => responder(res, () => ({ volumes:C.buscar(db, (req.query||{}).q) })));
  app.get('/api/correcao/passivo', (req,res) => responder(res, () => C.passivo(db)));
  app.get('/api/correcao/historico', (req,res) => responder(res, () => {
    const q = req.query || {};
    return { itens:C.historico(db, { limite:q.limite, acao:q.acao, usuario:q.usuario }) };
  }));
  app.get('/api/correcao/:tipo/:id', (req,res) => responder(res, () => C.objeto(db, req.params.tipo, req.params.id)));

  app.post('/api/correcao/previa', (req,res) => responder(res, () => {
    const b = req.body || {};
    return C.previa(db, { acao:b.acao, tipo:b.tipo, id:b.id, params:b.params });
  }));

  app.post('/api/correcao/executar', (req,res) => responder(res, () => {
    const b = req.body || {};
    const r = tx(() => C.executar(db, { acao:b.acao, tipo:b.tipo, id:b.id, params:b.params, motivo:b.motivo, quem:quem(req) }));
    const dec = r.depois && r.depois.decisao ? ' · ' + r.depois.decisao : '';
    auditar(req, r.acao, r.alvo_id, 'correção #' + r.correcao_id + dec + ' — ' + String(b.motivo || '').trim());
    return r;
  }));

  app.post('/api/correcao/:id/desfazer', (req,res) => responder(res, () => {
    const b = req.body || {};
    const r = tx(() => C.desfazer(db, { id:req.params.id, motivo:b.motivo, quem:quem(req) }));
    auditar(req, r.acao + '_desfeita', r.alvo_id, 'correção #' + r.correcao_id + ' — ' + String(b.motivo || '').trim());
    return r;
  }));
};

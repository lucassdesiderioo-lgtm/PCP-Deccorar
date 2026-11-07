/* O que vem depois do recebimento — spec COMPRAS-E-RECEBIMENTO, fase 3.
 *
 * Retidos e avisos (quem libera: `recebimento.liberar`), a decisao com motivo
 * (aceitar, aceitar e reclamar, devolver), a ciencia do aviso e o prazo medido
 * do fornecedor. A fila e o receber continuam no receb_route.js (a 502).
 */
const RD = require('./recebimento_dominio');
const QUEM = require('./quem');

module.exports = function(app, db){
  app = QUEM.portao(app);   // sem login nada grava (R-ALC-09)
  const auditar = (req, acao, alvo, det) => { try{ const ac = app.locals.acesso; if(ac && ac.auditar) ac.auditar(req, 'compras', acao, alvo, det); }catch(e){} };
  const responder = (res, fn) => {
    try{ return res.json(Object.assign({ ok:true }, fn())); }
    catch(e){ if(e instanceof RD.Recusa) return res.status(e.status).json({ erro:e.message }); throw e; }
  };
  app.get('/api/recebimento/retidos', (req, res) => res.json(RD.retidos(db)));
  app.post('/api/recebimento/itens/:id/decidir', (req, res) => responder(res, () => {
    const r = RD.decidir(db, req.params.id, req.body || {}, QUEM.pessoa(req));
    auditar(req, 'recebimento_' + r.decisao, 'item ' + req.params.id, (req.body || {}).motivo);
    return r;
  }));
  app.post('/api/recebimento/itens/:id/ciencia', (req, res) => responder(res, () => RD.ciencia(db, req.params.id, QUEM.pessoa(req))));
  app.get('/api/compras/prazo', (req, res) => res.json(RD.prazo(db, req.query || {})));
};

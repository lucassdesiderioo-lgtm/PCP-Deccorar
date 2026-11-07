/* A nota fiscal de compra — spec COMPRAS-E-RECEBIMENTO, fase 4.
 *
 * Lancar nota (digitada; o XML e a fase 8), ler, o regime vigente e a tabela de
 * credito. As regras moram no nota_dominio.js.
 *
 * ⚠️ NOTA, IMPOSTOS E PARCELAS SO COM custo.ver OU nota.lancar (R-CMP-27): a
 * rota inteira e dessas chaves (permDaRota), e o pedido completo poda as notas.
 * ⚠️ O REGIME E A TABELA DE CREDITO SAO DO ADMIN GERAL: mudam o custo de tudo.
 */
const N = require('./nota_dominio');
const QUEM = require('./quem');

module.exports = function(app, db){
  app = QUEM.portao(app, { auditar:'compras' });   // sem login nada grava (R-ALC-09)
  const pode = (req, chave) => { try{ return !!app.locals.acesso.podePermissao(req.usuario, chave); }catch(e){ return false; } };
  const ehAG = req => pode(req, 'alcada.definir');   // intransferivel: so o Admin Geral
  const responder = (res, fn) => {
    try{ return res.json(Object.assign({ ok:true }, fn())); }
    catch(e){ if(e instanceof N.Recusa) return res.status(e.status).json({ erro:e.message }); throw e; }
  };
  app.get('/api/notas', (req, res) => res.json(N.listar(db, req.query || {})));
  app.post('/api/notas', (req, res) => responder(res, () => N.lancar(db, req.body || {}, QUEM.pessoa(req))));
  app.get('/api/notas/regime', (req, res) => res.json({ vigente:N.regimeVigente(db), regimes:N.REGIMES, regras:N.regras(db) }));
  app.post('/api/notas/regime', (req, res) => {
    if(!ehAG(req)) return res.status(403).json({ erro:'só o Admin Geral muda o regime tributário da empresa' });
    responder(res, () => N.mudarRegime(db, String((req.body || {}).vigente || '')));
  });
  app.post('/api/notas/regras', (req, res) => {
    if(!ehAG(req)) return res.status(403).json({ erro:'só o Admin Geral mexe na tabela de crédito' });
    responder(res, () => N.novaRegra(db, req.body || {}, QUEM.pessoa(req)));
  });
};

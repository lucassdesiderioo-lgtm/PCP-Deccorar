/* A compra programada — spec COMPRAS-E-RECEBIMENTO, fase 7 (R-CMP-46 a 48).
 * Ler e de quem ve compras; gerar o pedido e de quem cria pedido. As regras
 * moram no programada_dominio.js; a aba e a "Compra programada" da 501.
 */
const P = require('./programada_dominio');
const QUEM = require('./quem');
module.exports = function(app, db){
  app = QUEM.portao(app, { auditar:'compras' });   // sem login nada grava (R-ALC-09)
  app.get('/api/compras/programada', (req, res) => res.json(P.painel(db)));
  app.post('/api/compras/programada/pedido', (req, res) => {
    try{ res.json(Object.assign({ ok:true }, P.gerarPedidos(db, (req.body || {}).itens, QUEM.pessoa(req)))); }
    catch(e){ if(e instanceof P.Recusa) return res.status(e.status).json({ erro:e.message }); throw e; }
  });
};

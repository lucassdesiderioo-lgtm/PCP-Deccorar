/* A contagem de material por almoxarifado e o consumo — spec
 * COMPRAS-E-RECEBIMENTO, fase 6. A tela e a 504 (`/contagem-material`,
 * tablet). Contar e de `contagem.contar`; aprovar o que passou da tolerancia e
 * de `contagem.aprovar` (as chaves que ja existem). As regras moram no
 * contagem_material_dominio.js.
 */
const C = require('./contagem_material_dominio');
const QUEM = require('./quem');

module.exports = function(app, db){
  app = QUEM.portao(app);   // sem login nada grava (R-ALC-09)
  const responder = (res, fn) => {
    try{ return res.json(Object.assign({ ok:true }, fn())); }
    catch(e){ if(e instanceof C.Recusa) return res.status(e.status).json({ erro:e.message }); throw e; }
  };
  /* as rotas de nome fixo antes das de :id */
  app.get('/api/contagem-material/pendentes', (req, res) => res.json(C.pendentes(db)));
  app.get('/api/contagem-material/consumo', (req, res) => responder(res, () => C.consumo(db, (req.query || {}).componente_id)));
  app.get('/api/contagem-material/a-contar', (req, res) => res.json(C.aContar(db, (req.query || {}).almoxarifado_id)));
  app.get('/api/contagem-material/abertas', (req, res) => res.json(db.prepare(`SELECT c.id, c.almoxarifado_id, a.nome almoxarifado, c.usuario_nome, c.aberta_em
    FROM contagem_material c LEFT JOIN almoxarifado a ON a.id=c.almoxarifado_id WHERE c.situacao='aberta' ORDER BY c.id`).all()));
  app.post('/api/contagem-material/abrir', (req, res) => responder(res, () => C.abrir(db, (req.body || {}).almoxarifado_id, QUEM.pessoa(req))));
  app.post('/api/contagem-material/linhas/:id/tirar', (req, res) => responder(res, () => C.tirarLinha(db, req.params.id, QUEM.pessoa(req))));
  app.post('/api/contagem-material/itens/:id/aprovar', (req, res) => responder(res, () => C.decidir(db, req.params.id, true, (req.body || {}).motivo, QUEM.pessoa(req))));
  app.post('/api/contagem-material/itens/:id/rejeitar', (req, res) => responder(res, () => C.decidir(db, req.params.id, false, (req.body || {}).motivo, QUEM.pessoa(req))));
  app.get('/api/contagem-material/:id', (req, res) => responder(res, () => C.ler(db, req.params.id)));
  app.post('/api/contagem-material/:id/linha', (req, res) => responder(res, () => C.linha(db, req.params.id, req.body || {}, QUEM.pessoa(req))));
  app.post('/api/contagem-material/:id/terminar', (req, res) => responder(res, () => C.terminar(db, req.params.id, QUEM.pessoa(req))));
  app.get('/contagem-material', (req, res) => res.sendFile(require('path').join(__dirname, 'public', 'contagem-material.html')));
};

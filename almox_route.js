/* Almoxarifados, enderecos e volumes — spec COMPRAS-E-RECEBIMENTO, fase 5.
 *
 * Os enderecos (cadastro: `almoxarifado.cadastrar`), a leitura do volume e do
 * nivel pelo bipe, guardar, mover e abrir (`volume.movimentar`) e a etiqueta
 * da casa. A tela e a 503 (`/almoxarifado`, tablet). As regras moram no
 * almox_dominio.js.
 */
const A = require('./almox_dominio');
const ETQ = require('./volume_etq_pdf');
const QUEM = require('./quem');

module.exports = function(app, db){
  app = QUEM.portao(app);   // sem login nada grava (R-ALC-09)
  const responder = (res, fn) => {
    try{ return res.json(Object.assign({ ok:true }, fn())); }
    catch(e){ if(e instanceof A.Recusa) return res.status(e.status).json({ erro:e.message }); throw e; }
  };
  app.get('/api/almoxarifados/:id/enderecos', (req, res) => res.json(A.enderecos(db, req.params.id)));
  /* O ENDEREÇO NÃO TEM COLUNA DE AUTOR: criar, renomear e desativar viram linha
     na auditoria, com quem (revisão do PR #305; §10, "toda escrita grava quem
     fez"). Só aqui, e não no módulo inteiro: guardar e mover volume já gravam
     quem no volume_evento, e auditar cada bipe enterraria a auditoria. */
  const auditado = (req, rota, fn) => { const r = fn();
    QUEM.auditar(app, req, 'almoxarifado', 'POST ' + rota, String(req.params.id || ''), JSON.stringify(req.body || {}).slice(0, 200)); return r; };
  app.post('/api/almoxarifados/:id/enderecos', (req, res) => responder(res, () => auditado(req, '/api/almoxarifados/:id/enderecos', () => A.criarEnderecos(db, req.params.id, req.body || {}))));
  app.get('/api/enderecos/:codigo', (req, res) => responder(res, () => A.noNivel(db, req.params.codigo)));
  /* fase 10: o saldo numa lista so (volumes do PCP + rolos e sobras do sob
     medida, por endereco) e renomear/desativar endereco (o sob medida le daqui). */
  app.get('/api/almoxarifados/:id/estoque', (req, res) => res.json(A.estoque(db, req.params.id)));
  app.post('/api/enderecos/:tipo/:id', (req, res) => responder(res, () => auditado(req, '/api/enderecos/:tipo/:id', () => A.renomear(db, req.params.tipo, req.params.id, req.body || {}))));
  app.get('/api/volumes', (req, res) => res.json(A.listar(db, req.query || {})));
  app.get('/api/volumes/:codigo', (req, res) => responder(res, () => A.ler(db, req.params.codigo)));
  app.post('/api/volumes/:codigo/mover', (req, res) => responder(res, () => A.mover(db, req.params.codigo, req.body || {}, QUEM.pessoa(req))));
  app.post('/api/volumes/:codigo/abrir', (req, res) => responder(res, () => A.abrir(db, req.params.codigo, QUEM.pessoa(req))));
  app.get('/api/volumes/:codigo/etiqueta', async (req, res) => {
    let v;
    try{ v = A.ler(db, req.params.codigo); }
    catch(e){ if(e instanceof A.Recusa) return res.status(e.status).json({ erro:e.message }); throw e; }
    const pdf = await ETQ.gerar(v);
    res.setHeader('Content-Type', 'application/pdf');
    res.setHeader('Content-Disposition', 'inline; filename="volume-' + v.codigo + '.pdf"');
    res.send(pdf);
  });
  app.get('/almoxarifado', (req, res) => res.sendFile(require('path').join(__dirname, 'public', 'almoxarifado.html')));
};

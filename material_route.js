/* O cadastro de material e de almoxarifado — spec COMPRAS-E-RECEBIMENTO, fase 1.
 *
 * O `POST /api/componentes` continua no compras_route.js (e o card Materiais e
 * a tela nova chamam a mesma rota); as regras das colunas novas moram no
 * material_dominio.js. Aqui ficam o almoxarifado (R-CMP-05, R-CMP-38), as
 * opcoes da tela (modo de saldo, como sai, categoria) e as Pendencias de
 * cadastro (material sem almoxarifado).
 */
const MAT = require('./material_dominio');
const QUEM = require('./quem');

module.exports = function(app, db){
  /* SEM LOGIN NADA GRAVA (R-ALC-09): toda escrita deste modulo passa pelo quem.js. */
  app = QUEM.portao(app, { auditar:'compras' });

  const responder = (res, fn) => {
    try{ return res.json(Object.assign({ ok:true }, fn())); }
    catch(e){ if(e instanceof MAT.Recusa) return res.status(e.status).json({ erro:e.message }); throw e; }
  };

  app.get('/api/almoxarifados', (req, res) => res.json(MAT.listarAlmox(db)));
  app.post('/api/almoxarifados', (req, res) => responder(res, () => MAT.salvarAlmox(db, req.body || {}, QUEM.pessoa(req))));
  app.delete('/api/almoxarifados/:id', (req, res) => responder(res, () => MAT.desativarAlmox(db, req.params.id)));

  app.get('/api/componentes/opcoes', (req, res) => res.json({
    modos: MAT.MODOS.map(m => ({ valor:m, nome:MAT.NOME_MODO[m] })),
    como_sai: MAT.COMO_SAI,
    categorias: db.prepare("SELECT valor FROM listas WHERE tipo='categoria_material' AND ativo=1 ORDER BY ordem,id").all().map(r => r.valor)
  }));

  app.get('/api/componentes/pendencias', (req, res) => res.json(MAT.pendencias(db)));
};

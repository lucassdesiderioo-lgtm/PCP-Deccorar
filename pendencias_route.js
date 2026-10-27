/* pendencias_route.js — a central de pendências, fase 1 (spec
 * docs/specs/CENTRAL-DE-PENDENCIAS.md). Só leitura: os números de cada lugar
 * onde uma pessoa tem algo a decidir, para o topo da aba Pendências do admin.
 *
 *   GET /api/pendencias/resumo  -> @admin (só números, nunca detalhe)
 *
 * A conta de cada linha é da tela dona; ver o pendencias_dominio.js.
 */
const PEND = require('./pendencias_dominio');

module.exports = function(app, db){
  app.get('/api/pendencias/resumo', (req,res) => {
    try{ res.json(PEND.resumo(db)); }
    catch(e){ console.log('[pendencias] ' + (e && e.stack || e)); res.status(500).json({ erro:'não consegui montar o resumo' }); }
  });
};

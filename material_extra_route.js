/* AS ROTAS DA 106 MATERIAL EXTRA — spec FICHAS-NO-CADASTRO-UNICO §3-G.
 * Todas pedem `material.extra` (permDaRota, pre('/api/material-extra')).
 * A escrita passa pelo portao do quem.js: sem login, 401, nada grava. */
const QUEM = require('./quem');
const ME = require('./material_extra_dominio');
const MAT = require('./material_dominio');

module.exports = function(app, db){
  app = QUEM.portao(app);

  app.get('/api/material-extra', (req, res) => {
    res.json({ linhas:ME.listar(db, req.query.filtro === 'decididas' ? 'decididas' : 'pendentes'),
               pendentes:ME.pendentes(db) });
  });

  /* Os materiais que se podem baixar: ATIVOS e POR QUANTIDADE, com o codigo de
     cadastro. Nada de saldo nem de preco: quem decide diz o que gastou. */
  app.get('/api/material-extra/materiais', (req, res) => {
    const l = db.prepare(`SELECT id, nome, unidade FROM componente
      WHERE ativo=1 AND modo_saldo='quantidade' ORDER BY nome`).all();
    res.json(l.map(c => Object.assign(c, { codigo_cadastro:MAT.codigoCadastro(c.id) })));
  });

  app.post('/api/material-extra/:id/decidir', (req, res) => {
    try{ res.json({ ok:true, linha:ME.decidir(db, req.params.id, req.body || {}, req) }); }
    catch(e){
      if(e instanceof ME.Recusa) return res.status(e.status).json({ erro:e.message });
      console.error('[material-extra] decidir falhou:', e);
      res.status(500).json({ erro:'não deu para decidir: ' + e.message });
    }
  });
};

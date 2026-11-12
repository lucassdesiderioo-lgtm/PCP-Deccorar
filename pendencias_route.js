/* pendencias_route.js — a central de pendências, fase 1 (spec
 * docs/arquivo/CENTRAL-DE-PENDENCIAS.md). Só leitura: os números de cada lugar
 * onde uma pessoa tem algo a decidir, para o topo da aba Pendências do admin.
 *
 *   GET /api/pendencias/resumo  -> @admin (só números, nunca detalhe)
 *   GET /api/pendencias/total   -> a bancada, a Conferência, a TV e o admin:
 *                                  três números (total, dias, sem_etiqueta)
 *   GET /api/pendencias/minhas  -> @logado: só o que a PRÓPRIA pessoa resolve,
 *                                  por tela e o total — a etiqueta vermelha do
 *                                  ☰ Menu (spec PENDENCIAS-NO-MENU, fase 2)
 *
 * A conta de cada linha é da tela dona; ver o pendencias_dominio.js.
 */
const PEND = require('./pendencias_dominio');
const DIA = require('./pendencias_dia');   // o retrato de cada dia, para o relatório (R7)

module.exports = function(app, db){
  try{ DIA.garantir(db); }catch(e){}
  app.get('/api/pendencias/resumo', (req,res) => {
    try{ const r = PEND.resumo(db); DIA.gravar(db, r); res.json(r); }
    catch(e){ console.log('[pendencias] ' + (e && e.stack || e)); res.status(500).json({ erro:'não consegui montar o resumo' }); }
  });
  /* Quem é vem do login, nunca de parâmetro: a pessoa só pergunta por ela.
     "Pode" é a conta do portão — a chave (`podePermissao`) e abrir a tela dona
     (`decidir`), as mesmas que a rota e a tela usam. */
  app.get('/api/pendencias/minhas', (req,res) => {
    const u = req.usuario, ac = app.locals.acesso;
    if(!u || !ac) return res.status(401).json({ erro:'faça login' });
    try{
      const pode = {
        tem: c => { try{ return !!ac.podePermissao(u, c); }catch(e){ return false; } },
        abre: r => { try{ return !!ac.decidir(u, r, 'GET').ok; }catch(e){ return false; } }
      };
      res.json(PEND.minhas(db, pode));
    }catch(e){ console.log('[pendencias] minhas: ' + (e && e.stack || e)); res.status(500).json({ erro:'não consegui contar' }); }
  });
  app.get('/api/pendencias/total', (req,res) => {
    try{ const r = PEND.resumo(db); DIA.gravar(db, r); res.json(PEND.total(db, r)); }
    catch(e){ console.log('[pendencias] ' + (e && e.stack || e)); res.status(500).json({ erro:'não consegui contar' }); }
  });
};

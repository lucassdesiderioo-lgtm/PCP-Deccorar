/* O AJUSTE MANUAL DE ESTOQUE EM DUAS PESSOAS — as rotas. Fase 3 da spec
 * ESTOQUE-LIVRO-E-CONFERENCIA (28/09/2026). A regra mora no ajuste_dominio.js.
 *
 * ⚠️ O `POST /api/estoque` ANTIGO MORA AQUI, E SO RECUSA. Ele aplicava o
 * ajuste na hora, pela mao de uma pessoa so. Recusar dizendo o caminho, em vez
 * de sumir com a rota: uma aba aberta antes do deploy (ou um script) receberia
 * 404 e alguem iria procurar o defeito no lugar errado.
 */
const AJ = require('./ajuste_dominio');

module.exports = function(app, db){
  AJ.garantirSchema(db);

  const quem = req => { const u = req.usuario || {}; return { id: u.id != null ? u.id : null, nome: u.nome || '' }; };
  function pode(req, chave){
    try{ return !!app.locals.acesso.podePermissao(req.usuario, chave); }
    catch(e){ return (((req.usuario||{}).areas)||[]).indexOf('admin') >= 0; }
  }
  function auditar(req, acao, alvo, detalhe){
    try{ app.locals.acesso.auditar(req, 'estoque', acao, alvo, detalhe); }catch(e){}
  }
  function responder(res, fn){
    try{ return res.json(Object.assign({ ok:true }, fn())); }
    catch(e){
      if(e && e.status) return res.status(e.status).json(Object.assign({ ok:false, erro:e.message }, e.extra || {}));
      console.log('[ajuste] ' + (e && e.stack || e));
      return res.status(500).json({ ok:false, erro:'falhou: ' + (e && e.message) });
    }
  }
  const tx = fn => db.transaction(fn)();

  app.post('/api/estoque', (req,res) => res.status(410).json({ ok:false, motivo:'use_pedido',
    erro:'O ajuste de estoque agora é em duas pessoas: peça o ajuste (quantas peças a mais ou a menos, ' +
         'com motivo) e outra pessoa aprova. Nada foi gravado.' }));

  app.post('/api/estoque/ajuste', (req,res) => responder(res, () => {
    const b = req.body || {};
    const r = tx(() => AJ.pedir(db, { codigo:b.codigo, delta:b.delta, estoque:b.estoque,
      motivo:b.motivo, obs:b.obs, quem:quem(req) }));
    auditar(req, 'ajuste_pedido', r.codigo, (r.delta > 0 ? '+' : '') + r.delta + ' · ' + (b.motivo || ''));
    return r;
  }));

  app.get('/api/estoque/ajuste/pendentes', (req,res) => responder(res, () =>
    ({ itens: AJ.pendentes(db, { quem:quem(req) }) })));

  app.post('/api/estoque/ajuste/:id/aprovar', (req,res) => responder(res, () => {
    if(!pode(req, 'estoque.aprovar_ajuste')) throw AJ.erro(403, 'sem permissão para aprovar ajuste');
    const r = tx(() => AJ.aprovar(db, { id:req.params.id, quem:quem(req) }));
    auditar(req, 'ajuste_aprovado', r.codigo, r.antes + ' -> ' + r.depois + ' (pedido #' + r.id + ')');
    return r;
  }));

  app.post('/api/estoque/ajuste/:id/recusar', (req,res) => responder(res, () => {
    const r = tx(() => AJ.recusar(db, { id:req.params.id, resposta:(req.body||{}).resposta,
      quem:quem(req), podeAprovar:pode(req, 'estoque.aprovar_ajuste') }));
    auditar(req, r.status === 'desistido' ? 'ajuste_desistido' : 'ajuste_recusado', r.codigo, 'pedido #' + r.id);
    return r;
  }));
};

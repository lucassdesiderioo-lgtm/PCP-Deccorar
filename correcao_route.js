/* A MESA DE CORRECOES — as rotas. Fase 1 da spec MESA-DE-CORRECOES
 * (02/10/2026). A regra mora toda no `correcoes.js`.
 *
 * ⚠️ TODA ESCRITA EMBRULHADA AQUI, porque o dominio nao abre transacao: a
 * cancelada de uma caixa de pacote sao N movimentos de livro mais o UPDATE do
 * volume, e o fantasma apaga o `lote` e o `lote_item` — os dois entram ou nao
 * entram juntos (§2).
 *
 * ⚠️ AS LEITURAS TAMBEM PEDEM `correcao.executar` (§5.4 da spec). Nao e zelo
 * demais: o `GET /api/correcao/:tipo/:id` devolve a historia do volume e o
 * `passivo` e a lista de tudo que esta errado na operacao.
 */
const COR = require('./correcoes');

module.exports = function(app, db){
  COR.garantirSchema(db);

  const quem = req => { const u = req.usuario || {}; return { id:u.id != null ? u.id : null, nome:u.nome || '' }; };
  function pode(req){
    try{ return !!app.locals.acesso.podePermissao(req.usuario, 'correcao.executar'); }
    catch(e){ return (((req.usuario || {}).areas) || []).indexOf('admin') >= 0; }
  }
  function auditar(req, acao, alvo, detalhe){
    try{ app.locals.acesso.auditar(req, 'correcao', acao, alvo, detalhe); }catch(e){}
  }
  function responder(req, res, fn){
    if(!pode(req)) return res.status(403).json({ ok:false, erro:'sem permissão para a Mesa de correções' });
    try{ return res.json(Object.assign({ ok:true }, fn())); }
    catch(e){
      if(e && e.status) return res.status(e.status).json(Object.assign({ ok:false, erro:e.message }, e.extra || {}));
      console.log('[correcao] ' + (e && e.stack || e));
      return res.status(500).json({ ok:false, erro:'falhou: ' + (e && e.message) });
    }
  }
  const tx = fn => db.transaction(fn)();

  app.get('/api/correcao/passivo',   (req,res) => responder(req, res, () => COR.contadores(db)));
  app.get('/api/correcao/buscar',    (req,res) => responder(req, res, () => COR.buscar(db, (req.query || {}).q)));
  app.get('/api/correcao/historico', (req,res) => responder(req, res, () =>
    ({ itens: COR.historico(db, { limite:(req.query || {}).limite, acao:(req.query || {}).acao,
                                  pessoa:(req.query || {}).pessoa }) })));

  app.get('/api/correcao/:tipo/:id', (req,res) => responder(req, res, () =>
    COR.objeto(db, req.params.tipo, req.params.id)));

  /* A PREVIA NAO GRAVA — e ela que faz a Mesa nao ser um editor de linhas do
     banco (§2 da spec). Nem transacao precisa. */
  app.post('/api/correcao/previa', (req,res) => responder(req, res, () => {
    const b = req.body || {};
    return COR.previa(db, { acao:b.acao, tipo:b.tipo, id:b.id, params:b.params });
  }));

  app.post('/api/correcao/executar', (req,res) => responder(req, res, () => {
    const b = req.body || {};
    const r = tx(() => COR.executar(db, { acao:b.acao, tipo:b.tipo, id:b.id, params:b.params,
      motivo:b.motivo, quem:quem(req) }));
    auditar(req, r.acao, r.alvo, [b.motivo, r.estoque.length
      ? 'estoque: ' + r.estoque.map(l => l.codigo + ' ' + (l.delta > 0 ? '+' : '') + l.delta).join(', ')
      : 'sem efeito no estoque'].filter(Boolean).join(' · '));
    return r;
  }));

  app.post('/api/correcao/:id/desfazer', (req,res) => responder(req, res, () => {
    const r = tx(() => COR.desfazer(db, { id:req.params.id, quem:quem(req) }));
    auditar(req, 'desfeita', r.alvo, 'correção #' + r.id + ' (' + r.acao + ')');
    return r;
  }));
};

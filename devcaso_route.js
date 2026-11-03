/* devcaso_route.js — as rotas das devoluções EM ANDAMENTO (tela
 * /devolucao-casos). Quem decide é o devcaso_dominio.js; aqui só se traduz
 * HTTP, se confere a chave do dinheiro e se registra a decisão na auditoria.
 *
 * As chaves de cada rota estão no permDaRota() do acesso.js:
 *   ler e acompanhar   → devolucao.acompanhar (ou devolucao.lancar)
 *   lançar e editar    → devolucao.lancar
 *   dinheiro e decisão → devolucao.dinheiro, conferida AQUI TAMBÉM: o portão
 *                        é a primeira trava, o handler é a segunda, e é a do
 *                        handler que o teste consegue exercitar.
 */
const D = require('./devcaso_dominio');

module.exports = function(app, db){
  D.garantir(db);

  function podeDinheiro(req){
    /* Sem o acesso.js carregado não há quem responda — e a resposta é NÃO.
       O dinheiro é intransferível (§7 da spec): o "é admin" do modelo antigo
       não serve de escape aqui. */
    try{ return !!app.locals.acesso.podePermissao(req.usuario, 'devolucao.dinheiro'); }
    catch(e){ return false; }
  }
  function auditar(req, acao, alvo, detalhe){
    try{ app.locals.acesso.auditar(req, 'devolucao', acao, String(alvo), detalhe || ''); }catch(e){}
  }
  function responder(res, fn){
    try{ return res.json(fn()); }
    catch(e){
      if(e instanceof D.Recusa) return res.status(e.status).json(Object.assign({ erro:e.message }, e.extra));
      console.log('[devolucao-casos] ' + (e && e.stack || e));
      return res.status(500).json({ erro:'Não deu para gravar. Nada foi alterado. Tente de novo.' });
    }
  }
  const semDinheiro = (req, res) => res.status(403).json({ erro:'Só quem tem a permissão de ver o dinheiro das devoluções faz isto.', chave:'devolucao.dinheiro' });

  /* ── leituras ── */
  function pode(req){
    const p = (c) => { try{ return !!app.locals.acesso.podePermissao(req.usuario, c); }catch(e){ return false; } };
    return { lancar:p('devolucao.lancar'), acompanhar:p('devolucao.acompanhar'), dinheiro:podeDinheiro(req) };
  }
  /* A lista diz também O QUE a pessoa pode fazer, para a tela não mostrar
     botão que dá "sem permissão". Esconder não é segurança: quem tranca é o
     portão e o handler. */
  app.get('/api/devolucao-casos', (req,res) => responder(res, () => Object.assign(D.listar(db, {}), { pode:pode(req) })));
  app.get('/api/devolucao-casos/encerrados', (req,res) => responder(res, () => ({ casos: D.encerrados(db, {}) })));
  /* A tela de lançar acha a venda antes de gravar, para preencher SKU,
     comprador e NF (R2). A NF também acha. */
  app.get('/api/devolucao-casos/venda/:cod', (req,res) => responder(res, () => {
    const cod = req.params.cod;
    const v = D.buscarLote(db, cod) || D.buscarLotePorNF(db, cod);
    const venda = v ? v.venda : String(cod||'').replace(/\s+/g,'');
    const ja = D.abertoDaVenda(db, venda);
    return { achou: !!v, venda: v, caso_aberto: ja ? ja.id : null };
  }));
  app.get('/api/devolucao-casos/:id', (req,res) => responder(res, () => D.detalhe(db, req.params.id, {})));

  /* ── lançar e editar (devolucao.lancar) ── */
  app.post('/api/devolucao-casos', (req,res) => responder(res, () => {
    const b = Object.assign({}, req.body || {});
    // Os campos de dinheiro não entram pelo lançamento comum (R15).
    delete b._valor_ml; delete b._valor_ml_situacao;
    const c = D.lancar(db, b, req.usuario);
    return { ok:true, id:c.id };
  }));
  app.post('/api/devolucao-casos/:id/editar', (req,res) => responder(res, () => {
    D.editar(db, req.params.id, req.body, req.usuario);
    return { ok:true };
  }));

  /* ── acompanhar (devolucao.acompanhar) ── */
  app.post('/api/devolucao-casos/:id/etapa', (req,res) => responder(res, () => {
    const b = req.body || {};
    D.etapa(db, req.params.id, b.para, req.usuario, b.texto);
    return { ok:true };
  }));
  app.post('/api/devolucao-casos/:id/prorrogacao', (req,res) => responder(res, () => {
    D.pedirProrrogacao(db, req.params.id, req.usuario, (req.body||{}).texto);
    return { ok:true };
  }));
  app.post('/api/devolucao-casos/:id/prazo', (req,res) => responder(res, () => {
    D.novoPrazo(db, req.params.id, (req.body||{}).prazo, req.usuario);
    return { ok:true };
  }));

  /* ── decisões do admin geral (devolucao.dinheiro) ── */
  app.post('/api/devolucao-casos/:id/perda', (req,res) => {
    if(!podeDinheiro(req)) return semDinheiro(req, res);
    responder(res, () => {
      const c = D.encerrarPerda(db, req.params.id, req.body, req.usuario);
      auditar(req, 'perda_prazo', c.id, 'encerrou como perda por prazo'+(c.valor_perdido != null ? ' · R$ '+c.valor_perdido.toFixed(2) : ' · sem valor lançado'));
      return { ok:true };
    });
  });
};

/* A CONFERENCIA DE ESTOQUE — as rotas. Fase 2 da spec
 * ESTOQUE-LIVRO-E-CONFERENCIA (26/09/2026). A regra mora no
 * inventario_dominio.js; aqui e so a porta: quem pode, a transacao e a
 * auditoria.
 *
 * ⚠️ AS ROTAS DE QUEM CONTA NAO DEVOLVEM SALDO — nem por engano: elas so
 * repassam o que o dominio monta, e o dominio nao poe o campo (regra 14 do
 * §13). Ha caso no teste_inventario.js varrendo o JSON atras de `estoque` e
 * `saldo`.
 *
 * ⚠️ `terminar-sku` serve as duas rodadas, e por isso a rota aceita
 * contagem.contar OU contagem.recontar no `permDaRota()`; e o handler que
 * confere a chave CERTA para a rodada em que o item esta. Declarar so uma
 * trancaria a outra metade da bancada.
 */
const INV = require('./inventario_dominio');
const ESTOQUE = require('./estoque_dominio');

module.exports = function(app, db){
  INV.garantirSchema(db);

  const quem = req => {
    const u = req.usuario || {};
    return { id: u.id != null ? u.id : null, nome: u.nome || '' };
  };
  function pode(req, chave){
    try{ return !!app.locals.acesso.podePermissao(req.usuario, chave); }
    catch(e){ return (((req.usuario||{}).areas)||[]).indexOf('admin') >= 0; }
  }
  function auditar(req, acao, alvo, detalhe){
    try{ app.locals.acesso.auditar(req, 'estoque', acao, alvo, detalhe); }catch(e){}
  }
  /* Erro do dominio vira status + mensagem; erro de verdade vira 500 dizendo o
     que foi, e a transacao ja desfez tudo. */
  function responder(res, fn){
    try{ return res.json(Object.assign({ ok:true }, fn())); }
    catch(e){
      if(e && e.status) return res.status(e.status).json(Object.assign({ ok:false, erro:e.message }, e.extra || {}));
      console.log('[inventario] ' + (e && e.stack || e));
      return res.status(500).json({ ok:false, erro:'falhou: ' + (e && e.message) });
    }
  }
  const tx = fn => db.transaction(fn)();

  // ── quem planeja ──────────────────────────────────────────────────────────
  app.get('/api/inventario/sugestao', (req,res) => responder(res, () =>
    ({ sugestao: INV.sugestao(db, req.query && req.query.qtd) })));

  app.get('/api/inventario/andamento', (req,res) => responder(res, () => INV.andamento(db)));

  app.post('/api/inventario/abrir', (req,res) => responder(res, () => {
    const b = req.body || {};
    const r = tx(() => INV.abrir(db, { tipo:b.tipo, codigos:b.codigos, quem:quem(req) }));
    auditar(req, 'inventario_aberto', 'conferencia #' + r.ciclo_id, r.tipo + ' · ' + r.itens + ' SKU(s)');
    return r;
  }));

  app.post('/api/inventario/encerrar', (req,res) => responder(res, () => {
    const id = +((req.body || {}).ciclo_id);
    const r = tx(() => INV.encerrar(db, id));
    auditar(req, 'inventario_encerrado', 'conferencia #' + id, r.nao_contados + ' nao contado(s)');
    return r;
  }));

  // ── quem conta (1ª rodada) ────────────────────────────────────────────────
  app.get('/api/inventario/minha-lista', (req,res) => responder(res, () =>
    ({ itens: INV.lista(db, { papel:'contar', quem:quem(req) }) })));

  app.post('/api/inventario/contar', (req,res) => responder(res, () => {
    const b = req.body || {};
    return tx(() => INV.contar(db, { codigo:b.codigo, quantidade:b.quantidade, zerar:!!b.zerar,
      papel:'contar', quem:quem(req) }));
  }));

  // ── quem reconta (2ª e 3ª rodadas) ────────────────────────────────────────
  app.get('/api/inventario/recontagem', (req,res) => responder(res, () =>
    ({ itens: INV.lista(db, { papel:'recontar', quem:quem(req) }) })));

  app.post('/api/inventario/recontar', (req,res) => responder(res, () => {
    const b = req.body || {};
    return tx(() => INV.contar(db, { codigo:b.codigo, quantidade:b.quantidade, zerar:!!b.zerar,
      papel:'recontar', quem:quem(req) }));
  }));

  app.post('/api/inventario/terminar-sku', (req,res) => responder(res, () => {
    const b = req.body || {};
    const papel = b.papel === 'recontar' ? 'recontar' : 'contar';
    const chave = papel === 'recontar' ? 'contagem.recontar' : 'contagem.contar';
    if(!pode(req, chave)){ const e = INV.erro(403, 'sem permissao para ' + (papel === 'recontar' ? 'recontar' : 'contar')); throw e; }
    const r = tx(() => INV.terminar(db, { codigo:b.codigo, papel, quem:quem(req) }));
    auditar(req, papel === 'recontar' ? 'inventario_recontado' : 'inventario_contado', r.codigo, '');
    return r;
  }));

  // ── quem aprova ───────────────────────────────────────────────────────────
  app.get('/api/inventario/aprovacao', (req,res) => responder(res, () => {
    const itens = INV.aprovacao(db, { quem:quem(req) });
    /* O R$ da diferenca so vai para quem tem custo.ver — o campo nem viaja
       para os outros (regra 14 do §13). O custo e o do ficha_dominio, o mesmo
       da aba Estoque. */
    if(pode(req, 'custo.ver')){
      let FICHA = null; try{ FICHA = require('./ficha_dominio'); }catch(e){}
      itens.forEach(i => {
        let c = null;
        try{ const f = FICHA && FICHA.calcularFicha(db, i.codigo); if(f && f.custo_material != null && isFinite(f.custo_material)) c = +f.custo_material; }catch(e){}
        i.valor_diferenca = c == null ? null : Math.round(c * (i.diferenca || 0) * 100) / 100;
      });
    }
    return { itens };
  }));

  app.post('/api/inventario/aprovar', (req,res) => responder(res, () => {
    const b = req.body || {};
    const r = tx(() => INV.aprovar(db, { id:b.id, motivo:b.motivo, obs:b.obs, quem:quem(req) }));
    auditar(req, 'inventario_aprovado', r.codigo, 'delta ' + r.delta + ' (' + r.antes + ' -> ' + r.depois + ') · ' + (b.motivo || ''));
    return r;
  }));

  app.post('/api/inventario/rejeitar', (req,res) => responder(res, () => {
    const b = req.body || {};
    const r = tx(() => INV.rejeitar(db, { id:b.id, motivo:b.motivo, obs:b.obs, quem:quem(req) }));
    auditar(req, 'inventario_rejeitado', r.codigo, (b.motivo || '') + ' · volta a contar do zero');
    return r;
  }));
};

/* AS ROTAS DA TRAVA DA 201 (spec CONFERENCIA-CARRINHOS, fase 3).
 *
 * A conta e as decisões moram no trava_dominio.js; aqui só a porta.
 * - GET  /api/etiqueta/trava — as caixas que travam, as não encontradas e as
 *   reimpressas esperando decisão (a tela 201 desenha);
 * - POST /api/etiqueta/trava/nao-encontrada            (expedicao.caixa_nao_encontrada)
 * - POST /api/etiqueta/trava/nao-encontrada/resolver   (idem)
 * - POST /api/etiqueta/reimpressa/decidir              (idem)
 *
 * A chave é conferida também AQUI, e não só no permDaRota: o mesmo endereço
 * dos testes e o mesmo cuidado do "Trocar para…" das devoluções.
 */
const QUEM = require('./quem');
const T = require('./trava_dominio');

module.exports = function(app, db){
  app = QUEM.portao(app);
  T.garantirSchema(db);
  const CHAVE = 'expedicao.caixa_nao_encontrada';
  const pode = req => { try{ return !!app.locals.acesso.podePermissao(req.usuario, CHAVE); }catch(e){ return false; } };
  const responder = (res, fn) => {
    try{ res.json(fn()); }
    catch(e){
      if(e.status){ return res.status(e.status).json(Object.assign({ ok:false, erro:e.message }, e.extra || {})); }
      console.log('[trava] ' + e.message); res.status(500).json({ ok:false, erro:'não deu para gravar' });
    }
  };
  const exigirChave = (req, res) => {
    if(pode(req)) return true;
    res.status(403).json({ ok:false, erro:'só quem tem a permissão "Caixa não encontrada" decide isto' });
    return false;
  };

  app.get('/api/etiqueta/trava', (req, res) => responder(res, () => {
    const t = T.travada(db);
    return { travada:t.travada, n:t.n, erro:t.erro || null, caixas:t.caixas, frase:t.travada ? T.frase(t.n) : null,
      nao_encontradas:T.naoEncontradas(db), reimpressas:T.reimpressas(db), pode_resolver:pode(req) };
  }));

  app.post('/api/etiqueta/trava/nao-encontrada', (req, res) => {
    const q = QUEM.exigir(req, res); if(!q) return;
    if(!exigirChave(req, res)) return;
    const b = req.body || {};
    responder(res, () => T.marcarNaoEncontrada(db, { id:b.id, motivo:b.motivo, quem:QUEM.pessoa(req) }));
  });
  app.post('/api/etiqueta/trava/nao-encontrada/resolver', (req, res) => {
    const q = QUEM.exigir(req, res); if(!q) return;
    if(!exigirChave(req, res)) return;
    const b = req.body || {};
    responder(res, () => T.resolverNaoEncontrada(db, { id:b.id, resposta:b.resposta, quem:QUEM.pessoa(req) }));
  });
  app.post('/api/etiqueta/reimpressa/decidir', (req, res) => {
    const q = QUEM.exigir(req, res); if(!q) return;
    if(!exigirChave(req, res)) return;
    const b = req.body || {};
    responder(res, () => T.decidirReimpressa(db, { id:b.id, decisao:b.decisao, quem:QUEM.pessoa(req) }));
  });
};

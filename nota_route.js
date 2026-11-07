/* A nota fiscal de compra — spec COMPRAS-E-RECEBIMENTO, fase 4.
 *
 * Lancar nota (digitada; o XML e a fase 8), ler, o regime vigente e a tabela de
 * credito. As regras moram no nota_dominio.js.
 *
 * ⚠️ NOTA, IMPOSTOS E PARCELAS SO COM custo.ver OU nota.lancar (R-CMP-27): a
 * rota inteira e dessas chaves (permDaRota), e o pedido completo poda as notas.
 * ⚠️ O REGIME E A TABELA DE CREDITO SAO DO ADMIN GERAL: mudam o custo de tudo.
 */
const N = require('./nota_dominio');
const QUEM = require('./quem');

module.exports = function(app, db){
  app = QUEM.portao(app, { auditar:'compras' });   // sem login nada grava (R-ALC-09)
  const pode = (req, chave) => { try{ return !!app.locals.acesso.podePermissao(req.usuario, chave); }catch(e){ return false; } };
  const ehAG = req => pode(req, 'alcada.definir');   // intransferivel: so o Admin Geral
  const responder = (res, fn) => {
    try{ return res.json(Object.assign({ ok:true }, fn())); }
    catch(e){ if(e instanceof N.Recusa) return res.status(e.status).json({ erro:e.message }); throw e; }
  };
  app.get('/api/notas', (req, res) => res.json(N.listar(db, req.query || {})));
  app.post('/api/notas', (req, res) => responder(res, () => N.lancar(db, req.body || {}, QUEM.pessoa(req))));
  /* A NOTA POR XML (fase 8): ler devolve a nota e o casamento SEM gravar; lancar
     exige cada item decidido — o que nao casa nunca e adivinhado. */
  const X = require('./nota_xml');
  const xmlDe = b => b.xml != null ? String(b.xml) : (b.base64 ? Buffer.from(String(b.base64), 'base64').toString('utf8') : '');
  app.post('/api/notas/xml/ler', (req, res) => {
    const b = req.body || {};
    try{
      const nota = X.ler(xmlDe(b));
      const out = { ok:true, nota, pedidos_do_emitente:X.pedidosDoEmitente(db, nota.emitente_cnpj) };
      if(b.pedido_id){
        out.casamento = X.casar(db, b.pedido_id, nota);
        out.pedido_itens = db.prepare('SELECT i.id, COALESCE(c.nome, i.sku) item FROM pedido_item i LEFT JOIN componente c ON c.id=i.componente_id WHERE i.pedido_id=? ORDER BY i.id').all(+b.pedido_id);
      }
      res.json(out);
    }catch(e){ if(e instanceof X.Recusa) return res.status(e.status).json({ erro:e.message }); throw e; }
  });
  app.post('/api/notas/xml', (req, res) => {
    const b = req.body || {};
    try{ res.json(Object.assign({ ok:true }, X.lancar(db, Object.assign({}, b, { xml:xmlDe(b) }), QUEM.pessoa(req)))); }
    catch(e){ if(e instanceof X.Recusa || e instanceof N.Recusa) return res.status(e.status).json({ erro:e.message }); throw e; }
  });
  app.get('/api/notas/regime', (req, res) => res.json({ vigente:N.regimeVigente(db), regimes:N.REGIMES, regras:N.regras(db) }));
  app.post('/api/notas/regime', (req, res) => {
    if(!ehAG(req)) return res.status(403).json({ erro:'só o Admin Geral muda o regime tributário da empresa' });
    responder(res, () => N.mudarRegime(db, String((req.body || {}).vigente || '')));
  });
  app.post('/api/notas/regras', (req, res) => {
    if(!ehAG(req)) return res.status(403).json({ erro:'só o Admin Geral mexe na tabela de crédito' });
    responder(res, () => N.novaRegra(db, req.body || {}, QUEM.pessoa(req)));
  });
};

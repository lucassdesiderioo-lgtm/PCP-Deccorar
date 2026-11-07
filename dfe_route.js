/* O certificado e as notas baixadas da Receita — spec COMPRAS-E-RECEBIMENTO,
 * fase 11 (R-CMP-51 a 56).
 *
 * ⚠️ O CERTIFICADO SO ENTRA E SAI PELA TELA, e so com `certificado.gerenciar`
 * (Admin Geral, intransferivel). NAO HA ROTA QUE ENTREGUE O ARQUIVO: enviar,
 * trocar e remover — nunca baixar. A senha nao volta em resposta nenhuma.
 *
 * O agendador consulta a Receita de tempos em tempos SO quando ha certificado
 * valido (sem ele, nada acontece — R-CMP-56). `PCP_DFE_AUTOMATICO=0` o desliga.
 */
const CERT = require('./certificado_dominio');
const DFE = require('./dfe_dominio');
const X = require('./nota_xml');
const QUEM = require('./quem');

module.exports = function(app, db){
  app = QUEM.portao(app, { auditar:'compras' });   // sem login nada grava (R-ALC-09)
  const responder = (res, fn) => {
    try{ return res.json(Object.assign({ ok:true }, fn())); }
    catch(e){ if(e instanceof CERT.Recusa || e instanceof X.Recusa) return res.status(e.status).json({ erro:e.message }); throw e; }
  };
  const pode = (req, chave) => { try{ return !!app.locals.acesso.podePermissao(req.usuario, chave); }catch(e){ return false; } };
  /* A rota ja pede certificado.gerenciar (permDaRota); o handler confere de
     novo — e intransferivel, e o arquivo e a senha sao o que ha de mais sensivel. */
  const soAG = (req, res) => { if(pode(req, 'certificado.gerenciar')) return true; res.status(403).json({ erro:'só o Admin Geral mexe no certificado' }); return false; };
  const extra = () => { const c = DFE.controle(db); const uf = db.prepare("SELECT valor FROM config WHERE chave='uf_codigo'").get();
    return { uf_codigo: uf ? uf.valor : null, ultima_consulta:c.ultima_consulta, proxima_consulta:c.proxima_consulta, ultimo_erro:c.ultimo_erro, ultimo_nsu:c.ultimo_nsu }; };

  app.get('/api/certificado', (req, res) => res.json(Object.assign(CERT.estado(db), extra())));
  app.post('/api/certificado', (req, res) => { if(soAG(req, res)) responder(res, () => CERT.receber(db, req.body || {}, QUEM.pessoa(req))); });
  app.delete('/api/certificado', (req, res) => { if(soAG(req, res)) responder(res, () => CERT.remover(db)); });
  app.post('/api/certificado/dados', (req, res) => { if(soAG(req, res)) responder(res, () => {
    const b = req.body || {}, out = {};
    if(b.cnpj != null) Object.assign(out, CERT.definirCnpj(db, b.cnpj));
    if(b.uf_codigo != null){
      const u = String(b.uf_codigo).replace(/\D/g, '');
      if(!/^\d{2}$/.test(u)) throw new CERT.Recusa(400, 'o código da UF tem 2 dígitos (ex.: 43 para RS, 35 para SP)');
      db.prepare("INSERT INTO config (chave,valor) VALUES ('uf_codigo',?) ON CONFLICT(chave) DO UPDATE SET valor=excluded.valor").run(u); out.uf_codigo = u;
    }
    return out;
  }); });
  app.get('/api/dfe', (req, res) => res.json({ documentos:DFE.listar(db), controle:extra(), certificado:CERT.estado(db) }));
  app.post('/api/dfe/consultar', async (req, res) => { if(soAG(req, res)) res.json(Object.assign({ ok:true }, await DFE.consultar(db))); });
  app.get('/api/dfe/:id/ler', (req, res) => {
    const xml = DFE.lerXml(db, req.params.id);
    if(!xml) return res.status(404).json({ erro:'esta nota ainda não tem o XML completo (a Receita entrega depois da ciência)' });
    const nota = X.ler(xml);
    const peds = X.pedidosDoEmitente(db, nota.emitente_cnpj);
    res.json({ nota, pedidos_do_emitente:peds, casamento: req.query.pedido_id ? X.casar(db, req.query.pedido_id, nota) : null,
      pedido_itens: req.query.pedido_id ? db.prepare('SELECT i.id, COALESCE(c.nome, i.sku) item FROM pedido_item i LEFT JOIN componente c ON c.id=i.componente_id WHERE i.pedido_id=? ORDER BY i.id').all(+req.query.pedido_id) : [] });
  });
  app.post('/api/dfe/:id/lancar', (req, res) => responder(res, () => DFE.lancarEscolhida(db, req.params.id, req.body || {}, QUEM.pessoa(req))));

  if(process.env.PCP_DFE_AUTOMATICO !== '0'){
    const t = setInterval(() => { DFE.talvezConsultar(db).catch(e => console.log('[dfe] ' + e.message)); }, 5 * 60 * 1000);
    if(t.unref) t.unref();
  }
};

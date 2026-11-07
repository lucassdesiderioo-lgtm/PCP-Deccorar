/* Pedido de compra depois do rascunho — spec COMPRAS-E-RECEBIMENTO, fase 2.
 *
 * Comprar, aprovar (alcada), as parcelas, os anexos e a compra rapida. As
 * regras moram no compra_dominio.js; o pedido em rascunho (criar, ler, texto de
 * WhatsApp, cancelar) continua no pedido_route.js.
 *
 * ⚠️ PARCELAS SAO DINHEIRO: ler e de quem tem `custo.ver`, `nota.lancar` ou
 * `pedido.pagar` (R-CMP-27); a poda do pedido completo e no pedido_route.
 */
const fs = require('fs'), path = require('path'), crypto = require('crypto');
const D = require('./compra_dominio');
const QUEM = require('./quem');
const CAMINHOS = require('./caminhos');

const TIPOS_ANEXO = ['orcamento', 'nota_pdf', 'nota_foto', 'xml', 'comprovante', 'outro'];
const MIME = { pdf:'application/pdf', xml:'application/xml', jpg:'image/jpeg', jpeg:'image/jpeg', png:'image/png', webp:'image/webp' };

module.exports = function(app, db){
  /* SEM LOGIN NADA GRAVA (R-ALC-09). */
  app = QUEM.portao(app, { auditar:'compras' });

  const pode = (req, chave) => { try{ return !!app.locals.acesso.podePermissao(req.usuario, chave); }catch(e){ return false; } };
  const ehAG = req => pode(req, 'alcada.definir');   // intransferivel: so o Admin Geral a tem
  const auditar = (req, acao, alvo, det) => { try{ const ac = app.locals.acesso; if(ac && ac.auditar) ac.auditar(req, 'compras', acao, alvo, det); }catch(e){} };
  const responder = (res, fn) => {
    try{ return res.json(Object.assign({ ok:true }, fn())); }
    catch(e){ if(e instanceof D.Recusa) return res.status(e.status).json({ erro:e.message }); throw e; }
  };
  const numero = id => { const p = db.prepare('SELECT numero FROM pedido_compra WHERE id=?').get(+id); return p ? p.numero : String(id); };

  app.get('/api/compras/opcoes', (req, res) => res.json({ canais:D.CANAIS, formas:D.FORMAS, tipos_fornecedor:D.TIPOS_FORNECEDOR, tipos_anexo:TIPOS_ANEXO }));

  app.post('/api/pedidos/:id/comprar', (req, res) => responder(res, () => {
    const r = D.comprar(db, req.params.id, req.body || {}, QUEM.pessoa(req));
    auditar(req, r.aguardando ? 'pedido_aguardando_aprovacao' : 'pedido_comprado', numero(req.params.id), (req.body || {}).canal + ' · ' + (req.body || {}).numero_externo);
    return r;
  }));
  app.post('/api/pedidos/:id/aprovar', (req, res) => responder(res, () => {
    const r = D.aprovar(db, req.params.id, (req.body || {}).motivo, QUEM.pessoa(req), ehAG(req));
    auditar(req, 'pedido_aprovado', numero(req.params.id), (req.body || {}).motivo);
    return r;
  }));

  /* ── ALCADA (so o Admin Geral: alcada.definir e intransferivel) ──────── */
  app.get('/api/compras/alcadas', (req, res) => res.json(D.listarAlcadas(db)));
  app.post('/api/compras/alcadas', (req, res) => {
    if(!ehAG(req)) return res.status(403).json({ erro:'só o Admin Geral define a alçada de compra' });
    responder(res, () => D.definirAlcada(db, req.body || {}, QUEM.pessoa(req)));
  });
  app.delete('/api/compras/alcadas/:uid', (req, res) => {
    if(!ehAG(req)) return res.status(403).json({ erro:'só o Admin Geral define a alçada de compra' });
    responder(res, () => D.tirarAlcada(db, req.params.uid));
  });

  /* ── PARCELAS ─────────────────────────────────────────────────────────── */
  app.get('/api/pedidos/:id/parcelas', (req, res) => res.json(D.parcelasDe(db, req.params.id)));
  app.post('/api/pedidos/:id/parcelas', (req, res) => responder(res, () => D.registrarParcelas(db, req.params.id, (req.body || {}).parcelas, QUEM.pessoa(req))));
  app.post('/api/parcelas/:id/pagar', (req, res) => responder(res, () => D.pagarParcela(db, req.params.id, QUEM.pessoa(req))));
  app.delete('/api/parcelas/:id', (req, res) => responder(res, () => D.apagarParcela(db, req.params.id)));

  /* ── ANEXOS (R-CMP-20) ─────────────────────────────────────────────────
     O arquivo vem em base64 (como o anexo das devolucoes) e e gravado DENTRO
     da transacao da linha: disco recusou, a linha nao existe. O nome no disco
     e gerado aqui — o nome mandado so e mostrado, nunca vira caminho. */
  /* O ANEXO DA NOTA SÓ PARA QUEM VÊ A NOTA (revisão do PR #305, R-CMP-27): o
     XML, o PDF e a foto da nota trazem impostos e valores que o JSON poda para
     quem não tem custo.ver nem nota.lancar — o arquivo não pode contornar a poda. */
  const DA_NOTA = ['xml', 'nota_pdf', 'nota_foto'];
  const podeAcesso = (req, c) => { try{ return !!app.locals.acesso.podePermissao(req.usuario, c); }catch(e){ return false; } };
  const veNota = req => podeAcesso(req, 'custo.ver') || podeAcesso(req, 'nota.lancar');
  const anexoDeNota = a => DA_NOTA.indexOf(a.tipo) >= 0 || !!a.nota_id;
  app.get('/api/compras/anexos', (req, res) => {
    const w = [], p = [];
    for(const k of ['pedido_id', 'nota_id', 'recebimento_id']) if(req.query[k]){ w.push(k + '=?'); p.push(+req.query[k]); }
    if(!w.length) return res.json([]);
    const l = db.prepare('SELECT id, pedido_id, nota_id, recebimento_id, tipo, nome, tamanho, criado_em, criado_por FROM compra_anexo WHERE ' + w.join(' AND ') + ' ORDER BY id').all(...p);
    res.json(veNota(req) ? l : l.filter(a => !anexoDeNota(a)));
  });
  app.post('/api/compras/anexos', (req, res) => {
    const b = req.body || {};
    if(TIPOS_ANEXO.indexOf(b.tipo) < 0) return res.status(400).json({ erro:'o tipo do anexo tem que ser: ' + TIPOS_ANEXO.join(', ') });
    if(!b.pedido_id && !b.nota_id && !b.recebimento_id) return res.status(400).json({ erro:'diga a que o anexo pertence (pedido, nota ou recebimento)' });
    if(b.pedido_id && !db.prepare('SELECT 1 FROM pedido_compra WHERE id=?').get(+b.pedido_id)) return res.status(404).json({ erro:'pedido não encontrado' });
    let buf;
    try{ buf = Buffer.from(String(b.base64 || '').replace(/^data:[^,]*,/, ''), 'base64'); }catch(e){ buf = null; }
    if(!buf || !buf.length) return res.status(400).json({ erro:'o arquivo veio vazio' });
    if(buf.length > 15 * 1024 * 1024) return res.status(400).json({ erro:'o arquivo passou de 15 MB' });
    const nome = String(b.nome || 'anexo').replace(/[\\/]/g, '_').slice(0, 200);
    const ext = (nome.match(/\.([a-z0-9]{1,5})$/i) || [, 'bin'])[1].toLowerCase();
    const arq = Date.now() + '-' + crypto.randomBytes(6).toString('hex') + '.' + ext;
    let id;
    try{
      db.transaction(() => {
        const q = QUEM.pessoa(req);
        id = db.prepare(`INSERT INTO compra_anexo (pedido_id, nota_id, recebimento_id, tipo, nome, arquivo, tamanho, criado_por, criado_por_id)
          VALUES (?,?,?,?,?,?,?,?,?)`).run(b.pedido_id ? +b.pedido_id : null, b.nota_id ? +b.nota_id : null, b.recebimento_id ? +b.recebimento_id : null,
            b.tipo, nome, arq, buf.length, q && q.nome, q && q.id).lastInsertRowid;
        fs.mkdirSync(CAMINHOS.ANEXOS_COMPRAS, { recursive:true });
        fs.writeFileSync(path.join(CAMINHOS.ANEXOS_COMPRAS, arq), buf);
      })();
    }catch(e){ console.log('[compras] anexo nao gravado: ' + e.message); return res.status(500).json({ erro:'o anexo não foi gravado (' + e.message + ')' }); }
    res.json({ ok:true, id });
  });
  app.get('/api/compras/anexos/:id', (req, res) => {
    const a = db.prepare('SELECT * FROM compra_anexo WHERE id=?').get(+req.params.id);
    if(!a) return res.status(404).json({ erro:'anexo não encontrado' });
    if(anexoDeNota(a) && !veNota(req)) return res.status(403).json({ erro:'o anexo da nota é de quem lança nota ou vê custo' });
    const f = path.join(CAMINHOS.ANEXOS_COMPRAS, path.basename(a.arquivo));
    if(!fs.existsSync(f)) return res.status(404).json({ erro:'o arquivo do anexo não está no disco' });
    const ext = (a.arquivo.split('.').pop() || '').toLowerCase();
    res.setHeader('Content-Type', MIME[ext] || 'application/octet-stream');
    res.setHeader('Content-Disposition', 'inline; filename="' + String(a.nome || a.arquivo).replace(/"/g, '') + '"');
    res.send(fs.readFileSync(f));
  });

  /* ── COMPRA RAPIDA ────────────────────────────────────────────────────── */
  app.post('/api/compras/rapida', (req, res) => responder(res, () => {
    const r = D.compraRapida(db, req.body || {}, QUEM.pessoa(req));
    auditar(req, 'compra_rapida', numero(r.id), (req.body || {}).canal + ' · ' + (req.body || {}).loja + ' · R$ ' + (req.body || {}).valor_total);
    return r;
  }));
};

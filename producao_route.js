/* producao_route.js — as rotas da producao da medida padrao (spec
 * PRODUCAO-MAPA-E-MOTOR v7, §14, 25/11/2026):
 *
 *   /api/producao/etiquetas…  a aba "Etiquetas da producao" da 401 (Supervisor)
 *   /api/producao/corte/…     a 108 Corte de tecido e a 110 Serralheria
 *   /api/producao/montagem…   a 107 Montagem
 *   /api/producao/persiana/:c quem fez a persiana (a revisao mostra os nomes)
 *   /api/producao/traduzir/:c o tradutor do codigo em serie, para as telas
 *
 * As permissoes estao no permDaRota (acesso.js). Toda escrita passa pelo
 * portao do quem.js: sem login, 401, nada grava (R-ALC-09).
 */
const QUEM = require('./quem');
const ETQ = require('./etiqueta_producao');
const LISTA = require('./producao_lista');
const CORTE = require('./corte_bancada');
const MONT = require('./montagem_persiana');
const PDF = require('./sku_etq_pdf');

module.exports = function(app, db){
  app = QUEM.portao(app);
  try{ LISTA.garantirSchema(db); }catch(e){ console.error('[producao] schema:', e.message); }

  const pode = (req, chave) => { try{ return !!app.locals.acesso.podePermissao(req.usuario, chave); }catch(e){ return false; } };
  const erro = (res, e, onde) => {
    if(e instanceof ETQ.Recusa) return res.status(e.status).json({ erro:e.message });
    console.error('[producao] ' + onde + ' falhou:', e);
    return res.status(500).json({ erro:'Não deu para ' + onde + ': ' + e.message });
  };

  /* O PDF das etiquetas de SKU em serie: a linha do SKU como o cadastro a
     imprime (sku_cad_route.js). */
  async function pdfPersianas(lista){
    const sku = c => db.prepare(`SELECT s.*, COALESCE(t.nome, t.codigo) tecido_nome, m.nome modelo_nome,
        COALESCE(m.exige_medida,1) exige_medida
      FROM skus s LEFT JOIN tecido t ON t.codigo=s.tecido_codigo LEFT JOIN modelo m ON m.id=s.modelo_id WHERE s.codigo=?`).get(c);
    return PDF.gerarSerie(lista.map(e => ({ sku:sku(e.sku), codigo:e.codigo, numero:e.numero })));
  }
  const pdfMaco = lista => PDF.gerarMaco(lista.map(e => ({ codigo:e.codigo, rotulo:ETQ.rotulo(e), titulo:ETQ.TIPOS[e.tipo].toUpperCase() })));
  const mandaPdf = (res, buf, nome, extra) => res.json(Object.assign({ ok:true, tipo:'pdf', nome, arquivo:buf.toString('base64') }, extra || {}));

  // ── A aba "Etiquetas da producao" da 401 ────────────────────────────────
  app.get('/api/producao/etiquetas', (req, res) => {
    try{
      res.json({ aba:LISTA.etiquetas(db),
        macos:{ TC:{ proxima:ETQ.proxima(db, 'TC').rotulo, livres:ETQ.livres(db, 'TC') },
                TB:{ proxima:ETQ.proxima(db, 'TB').rotulo, livres:ETQ.livres(db, 'TB') } },
        nao_usadas:ETQ.naoUsadas(db), dias_parada:ETQ.diasParada(db), historico:ETQ.historico(db),
        motivos_fora:ETQ.MOTIVOS_FORA, pode_cancelar:pode(req, 'producao.corrigir') });
    }catch(e){ erro(res, e, 'montar a aba de etiquetas'); }
  });
  /* A bolinha do ☰ Menu: as etiquetas de hoje a imprimir. Nao entra na 204. */
  app.get('/api/producao/etiquetas/contar', (req, res) => {
    try{ res.json({ hoje:LISTA.etiquetas(db).dia.total }); }
    catch(e){ res.json({ hoje:null, erro:e.message }); }
  });
  app.post('/api/producao/etiquetas/imprimir', async (req, res) => {
    const b = req.body || {};
    let r;
    try{ r = ETQ.imprimirPersianas(db, LISTA.paraImprimir(db, b.parte, b.quantidade), b.parte, QUEM.pessoa(req)); }
    catch(e){ return erro(res, e, 'imprimir'); }
    try{ mandaPdf(res, await pdfPersianas(r.etiquetas), 'etiquetas-' + b.parte + '.pdf', { quantidade:r.etiquetas.length }); }
    catch(e){ erro(res, e, 'gerar o PDF (as etiquetas foram gravadas: reimprima pelo histórico)'); }
  });
  app.post('/api/producao/etiquetas/maco', async (req, res) => {
    const b = req.body || {};
    let r;
    try{ r = ETQ.imprimirMaco(db, String(b.tipo || ''), b.quantidade, QUEM.pessoa(req)); }
    catch(e){ return erro(res, e, 'imprimir o maço'); }
    try{ mandaPdf(res, await pdfMaco(r.etiquetas), 'maco-' + b.tipo + '.pdf', { quantidade:r.etiquetas.length }); }
    catch(e){ erro(res, e, 'gerar o PDF (as etiquetas foram gravadas: reimprima pelo histórico)'); }
  });
  app.post('/api/producao/etiquetas/fora', async (req, res) => {
    const b = req.body || {};
    let r;
    try{
      let motivo = String(b.motivo || '').trim();
      if(ETQ.MOTIVOS_FORA.indexOf(motivo) < 0) throw new ETQ.Recusa('Escolha o motivo na lista.');
      if(motivo === 'Outro'){ const t = String(b.texto || '').trim(); if(!t) throw new ETQ.Recusa('Em "Outro", escreva o motivo.'); motivo = 'Outro: ' + t; }
      r = ETQ.imprimirPersianas(db, [{ sku:b.sku, quantidade:b.quantidade }], 'fora', QUEM.pessoa(req), motivo);
    }catch(e){ return erro(res, e, 'imprimir fora do planejamento'); }
    try{ mandaPdf(res, await pdfPersianas(r.etiquetas), 'etiquetas-fora.pdf', { quantidade:r.etiquetas.length }); }
    catch(e){ erro(res, e, 'gerar o PDF (as etiquetas foram gravadas: reimprima pelo histórico)'); }
  });
  app.post('/api/producao/etiquetas/cancelar', (req, res) => {
    const b = req.body || {};
    try{ res.json({ ok:true, canceladas:ETQ.cancelar(db, b.ids, b.motivo, QUEM.pessoa(req)) }); }
    catch(e){ erro(res, e, 'cancelar'); }
  });
  app.post('/api/producao/etiquetas/reimprimir', async (req, res) => {
    const b = req.body || {};
    let l;
    try{ l = ETQ.paraReimprimir(db, b.ids, QUEM.pessoa(req)); }
    catch(e){ return erro(res, e, 'reimprimir'); }
    try{ mandaPdf(res, l[0].tipo === 'PS' ? await pdfPersianas(l) : await pdfMaco(l), 'reimpressao.pdf', { quantidade:l.length }); }
    catch(e){ erro(res, e, 'gerar o PDF'); }
  });

  // ── 108 Corte de tecido e 110 Serralheria ───────────────────────────────
  const tipoOk = t => (t === 'tecido' || t === 'tubo') ? t : null;
  const listaDe = t => t === 'tecido' ? LISTA.listaTecido(db) : LISTA.listaTubo(db);
  app.get('/api/producao/corte/:tipo', (req, res) => {
    const t = tipoOk(req.params.tipo);
    if(!t) return res.status(404).json({ erro:'Corte desconhecido.' });
    try{
      res.json({ lista:listaDe(t), aberto:CORTE.aberto(db, req.usuario, t), dia:CORTE.doDia(db, req.usuario, t),
        motivos:CORTE.MOTIVOS_PERDA[t], proxima:ETQ.proxima(db, CORTE.TIPOS[t]).rotulo,
        pode_entrada:pode(req, 'producao.corrigir') });
    }catch(e){ erro(res, e, 'montar a lista do corte'); }
  });
  app.post('/api/producao/corte/:tipo/iniciar', (req, res) => {
    const t = tipoOk(req.params.tipo), b = req.body || {};
    if(!t) return res.status(404).json({ erro:'Corte desconhecido.' });
    try{
      /* A entrada inicial (§14.10) e so do Supervisor (producao.corrigir). */
      if(b.entrada_inicial && !pode(req, 'producao.corrigir')) throw new ETQ.Recusa('A entrada inicial é de quem tem a permissão de corrigir a produção (Supervisor).', 403);
      /* O item tem que estar na lista — ou, na entrada inicial, ser um item
         que a ficha conhece. A descricao e a da lista, nunca a da tela. */
      const it = listaDe(t).itens.find(x => x.chave === String(b.item || ''));
      let desc = it ? it.titulo + ' ' + it.cor : null;
      if(!it){
        if(!b.entrada_inicial) throw new ETQ.Recusa('Este item não está na lista do que cortar.', 409);
        desc = LISTA.descreverItem(db, t, b.item);
      }
      res.json({ ok:true, aberto:CORTE.iniciar(db, { tipo:t, item:String(b.item), descricao:desc, quantidade:b.quantidade,
        etiqueta:b.etiqueta, entrada_inicial:!!b.entrada_inicial }, QUEM.pessoa(req)) });
    }catch(e){ erro(res, e, 'iniciar o corte'); }
  });
  app.post('/api/producao/corte/:tipo/bipar', (req, res) => {
    try{
      const r = CORTE.bipar(db, (req.body || {}).codigo, QUEM.pessoa(req));
      if(r.fechado) r.tempo = tempo(req, r.fechado.tipo === 'tecido' ? 'corte_tecido' : 'corte_tubo', r.fechado);
      res.json(Object.assign({ ok:true }, r));
    }catch(e){ erro(res, e, 'bipar'); }
  });
  app.post('/api/producao/corte/:tipo/perdida', (req, res) => {
    try{ res.json(Object.assign({ ok:true }, CORTE.perdida(db, (req.body || {}).motivo, QUEM.pessoa(req)))); }
    catch(e){ erro(res, e, 'marcar a peça perdida'); }
  });
  app.post('/api/producao/corte/:tipo/cancelar', (req, res) => {
    try{ CORTE.cancelar(db, QUEM.pessoa(req)); res.json({ ok:true }); }
    catch(e){ erro(res, e, 'cancelar o corte'); }
  });

  // ── 107 Montagem ────────────────────────────────────────────────────────
  app.get('/api/producao/montagem', (req, res) => {
    try{ res.json({ lista:LISTA.listaMontagem(db), aberto:MONT.aberto(db, req.usuario), dia:MONT.doDia(db, req.usuario) }); }
    catch(e){ erro(res, e, 'montar a lista da montagem'); }
  });
  app.post('/api/producao/montagem/iniciar', (req, res) => {
    const b = req.body || {};
    try{
      if(!LISTA.listaMontagem(db).itens.some(x => x.chave.toUpperCase() === String(b.sku || '').toUpperCase()))
        throw new ETQ.Recusa('Este SKU não está na lista do que montar.', 409);
      res.json({ ok:true, aberto:MONT.iniciar(db, b, QUEM.pessoa(req)) });
    }catch(e){ erro(res, e, 'iniciar a montagem'); }
  });
  app.post('/api/producao/montagem/bipar', (req, res) => {
    try{
      const r = MONT.bipar(db, (req.body || {}).codigo, QUEM.pessoa(req));
      if(r.fechado) r.tempo = tempo(req, 'montagem_persiana', r.fechado);
      res.json(Object.assign({ ok:true }, r));
    }catch(e){ erro(res, e, 'bipar'); }
  });
  app.post('/api/producao/montagem/cancelar', (req, res) => {
    try{ MONT.cancelar(db, QUEM.pessoa(req)); res.json({ ok:true }); }
    catch(e){ erro(res, e, 'cancelar a montagem'); }
  });

  // ── O tradutor e quem fez a persiana ────────────────────────────────────
  app.get('/api/producao/traduzir/:codigo', (req, res) => {
    const t = ETQ.traduzir(db, req.params.codigo);
    if(!t) return res.json({ etiqueta:false });
    res.json({ etiqueta:true, tipo:t.tipo, desconhecida:!!t.desconhecida, sku:t.sku || null, numero:t.numero || null,
      rotulo:t.desconhecida ? null : ETQ.rotulo(t), situacao:t.situacao || null });
  });
  app.get('/api/producao/persiana/:codigo', (req, res) => {
    const r = MONT.porEtiqueta(db, req.params.codigo);
    if(!r) return res.status(404).json({ erro:'Não é etiqueta de persiana.' });
    const nome = x => x ? { nome:x.nome || null, em:x.em || null, etiqueta:x.codigo ? ETQ.rotulo({ tipo:x.codigo.slice(0,2), numero:x.numero }) : null } : null;
    res.json({ sku:r.etiqueta.sku, numero:r.etiqueta.numero, rotulo:ETQ.rotulo(r.etiqueta), montada:!!r.persiana,
      situacao:r.persiana ? r.persiana.situacao : null,
      tecido:nome(r.tecido), tubo:nome(r.tubo), montagem:r.persiana ? { nome:r.montagem.nome, em:r.montagem.em } : null });
  });

  /* O tempo da bancada (R-TEM-01): por peca, com a mediana da pessoa. A conta
     e do tempo_operador.js; aqui so se passa o lote. A entrada inicial nao conta. */
  function tempo(req, atividade, lote){
    try{
      if(lote.entrada_inicial) return null;
      const n = Math.max(1, (lote.quantidade || 1) - (lote.perdidas || 0));
      const seg = Math.round((lote.segundos || 0) / n);
      return require('./tempo_operador').seguro(db, atividade, QUEM.idDe(req), lote.item || lote.sku, seg, lote.id);
    }catch(e){ console.error('[producao] tempo:', e.message); return null; }
  }
};

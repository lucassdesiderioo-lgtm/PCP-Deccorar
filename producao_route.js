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
  /* Antes de GRAVAR (o numero nao volta): o PDF tem que poder sair. Sem isto a
     etiqueta ficava gravada e sem papel, e a reimpressao falhava igual (③). */
  function conferirAntes(itens){
    for(const it of itens){
      const s = db.prepare(`SELECT s.*, COALESCE(m.exige_medida,1) exige_medida FROM skus s LEFT JOIN modelo m ON m.id=s.modelo_id
        WHERE UPPER(s.codigo)=UPPER(?)`).get(String(it.sku || ''));
      if(!s) throw new ETQ.Recusa('SKU não cadastrado: ' + it.sku + '.', 404);
      const v = PDF.conferirSerie(s, null);
      if(!v.pronta) throw new ETQ.Recusa(s.codigo + ': ' + v.problemas[0], 409);
    }
  }
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
    try{ const itens = LISTA.paraImprimir(db, b.parte, b.quantidade); conferirAntes(itens); r = ETQ.imprimirPersianas(db, itens, b.parte, QUEM.pessoa(req)); }
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
      conferirAntes([{ sku:b.sku }]);
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
    try{
      let ids = b.ids;
      if(b.texto != null){
        const e = ETQ.buscar(db, b.texto);
        if(!e) throw new ETQ.Recusa('Não achei a etiqueta "' + String(b.texto).trim() + '". Escreva como está nela: "TC 000123" ou "BK160140BEGE Nº 45".', 404);
        ids = [e.id];
      }
      l = ETQ.paraReimprimir(db, ids, QUEM.pessoa(req));
    }
    catch(e){ return erro(res, e, 'reimprimir'); }
    try{ mandaPdf(res, l[0].tipo === 'PS' ? await pdfPersianas(l) : await pdfMaco(l), 'reimpressao.pdf', { quantidade:l.length }); }
    catch(e){ erro(res, e, 'gerar o PDF'); }
  });

  /* Os dias que uma etiqueta impressa fica parada antes de ficar ambar na
     lista das nao usadas (o dono: 15, mudavel na 906 Parametros). Inteiro, de
     1 a 365; numero impossivel e recusado, nunca clampado (#25). */
  app.get('/api/config/etiqueta-parada', (req, res) => res.json({ dias:ETQ.diasParada(db), padrao:ETQ.DIAS_PARADA_PADRAO }));
  app.post('/api/config/etiqueta-parada', (req, res) => {
    const v = (req.body || {}).dias, t = String(v == null ? '' : v).trim();
    if(!/^\d+$/.test(t) || +t < 1 || +t > 365) return res.status(400).json({ erro:'Os dias têm que ser um número inteiro de 1 a 365.' });
    const antes = ETQ.diasParada(db);
    db.prepare("INSERT INTO config (chave,valor) VALUES ('etiqueta_parada_dias',?) ON CONFLICT(chave) DO UPDATE SET valor=excluded.valor").run(String(+t));
    try{ app.locals.acesso.auditar(req, 'producao', 'etiqueta_parada_dias', 'de ' + antes + ' para ' + (+t) + ' dias'); }catch(e){}
    res.json({ ok:true, dias:+t });
  });

  // ── 108 Corte de tecido e 110 Serralheria ───────────────────────────────
  const listaDe = t => t === 'tecido' ? LISTA.listaTecido(db) : LISTA.listaTubo(db);
  /* Uma rota por bancada, com o caminho escrito: a permissao e de cada uma
     (producao.cortar_tecido, producao.cortar_tubo), e a varredura da
     cobertura confere o caminho de verdade. */
  for(const t of ['tecido', 'tubo']){
  app.get('/api/producao/corte/' + t, (req, res) => {
    try{
      res.json({ lista:listaDe(t), aberto:CORTE.aberto(db, QUEM.pessoa(req), t), dia:CORTE.doDia(db, QUEM.pessoa(req), t),
        motivos:CORTE.MOTIVOS_PERDA[t], proxima:ETQ.proximaLivre(db, CORTE.TIPOS[t]),
        pode_entrada:pode(req, 'producao.corrigir'),
        /* a entrada inicial lanca qualquer item que a ficha conhece (§14.10) */
        itens_entrada: pode(req, 'producao.corrigir') ? LISTA.itensConhecidos(db, t) : undefined });
    }catch(e){ erro(res, e, 'montar a lista do corte'); }
  });
  app.post('/api/producao/corte/' + t + '/iniciar', (req, res) => {
    const b = req.body || {};
    try{
      /* A entrada inicial (§14.10) e so do Supervisor (producao.corrigir). */
      if(b.entrada_inicial && !pode(req, 'producao.corrigir')) throw new ETQ.Recusa('A entrada inicial é de quem tem a permissão de corrigir a produção (Supervisor).', 403);
      /* O item tem que estar na lista — ou, na entrada inicial, ser um item
         que a ficha conhece. A descricao e a da lista, nunca a da tela. */
      let it = listaDe(t).itens.find(x => x.chave === String(b.item || ''));
      if(!it && b.entrada_inicial) it = LISTA.itensConhecidos(db, t).find(x => x.chave === String(b.item || ''));
      if(!it) throw new ETQ.Recusa(b.entrada_inicial ? 'A ficha técnica não conhece este item.' : 'Este item não está na lista do que cortar.', 409);
      const desc = it.titulo + ' ' + it.cor;
      res.json({ ok:true, aberto:CORTE.iniciar(db, { tipo:t, item:String(b.item), descricao:desc, quantidade:b.quantidade,
        etiqueta:b.etiqueta, entrada_inicial:!!b.entrada_inicial }, QUEM.pessoa(req)) });
    }catch(e){ erro(res, e, 'iniciar o corte'); }
  });
  app.post('/api/producao/corte/' + t + '/bipar', (req, res) => {
    try{
      const r = CORTE.bipar(db, (req.body || {}).codigo, QUEM.pessoa(req));
      if(r.fechado) r.tempo = tempo(req, r.fechado.tipo === 'tecido' ? 'corte_tecido' : 'corte_tubo', r.fechado);
      res.json(Object.assign({ ok:true }, r));
    }catch(e){ erro(res, e, 'bipar'); }
  });
  app.post('/api/producao/corte/' + t + '/perdida', (req, res) => {
    try{ res.json(Object.assign({ ok:true }, CORTE.perdida(db, (req.body || {}).motivo, QUEM.pessoa(req)))); }
    catch(e){ erro(res, e, 'marcar a peça perdida'); }
  });
  app.post('/api/producao/corte/' + t + '/cancelar', (req, res) => {
    try{ CORTE.cancelar(db, QUEM.pessoa(req)); res.json({ ok:true }); }
    catch(e){ erro(res, e, 'cancelar o corte'); }
  });
  }

  // ── 107 Montagem ────────────────────────────────────────────────────────
  app.get('/api/producao/montagem', (req, res) => {
    try{ res.json({ lista:LISTA.listaMontagem(db), aberto:MONT.aberto(db, QUEM.pessoa(req)), dia:MONT.doDia(db, QUEM.pessoa(req)) }); }
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
      situacao:r.persiana ? r.persiana.situacao : null, ...(() => {
        /* a regra de "pode revisar?" é do montagem_persiana.paraRevisar (a troca,
           a peça com problema): a tela não decide por conta própria. */
        try{ MONT.paraRevisar(db, req.params.codigo); return { revisavel:true }; }
        catch(e){ if(e instanceof MONT.Recusa) return { revisavel:false, motivo:e.message }; throw e; } })(),
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

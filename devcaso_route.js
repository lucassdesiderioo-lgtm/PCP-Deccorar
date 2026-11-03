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
const CAMINHOS = require('./caminhos');

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
  /* VER valores entra na auditoria AMORTECIDA (como o valor do estoque, §18):
     a lista se recarrega a cada 30 s, e uma linha por leitura enterraria a
     auditoria de verdade. No máximo uma por pessoa a cada 30 min. Cada
     DECISÃO grava sempre. */
  const vistoEm = new Map();
  function comDinheiro(req){
    if(!podeDinheiro(req)) return false;
    const u = req.usuario || {}, agora = Date.now();
    if((agora - (vistoEm.get(u.id) || 0)) >= 30*60*1000){
      vistoEm.set(u.id, agora);
      auditar(req, 'viu_valores', '(devoluções)', 'viu os valores das devoluções em andamento');
    }
    return true;
  }
  const semDinheiro = (req, res) => res.status(403).json({ erro:'Só quem tem a permissão de ver o dinheiro das devoluções faz isto.', chave:'devolucao.dinheiro' });

  /* ── leituras ── */
  function pode(req){
    const p = (c) => { try{ return !!app.locals.acesso.podePermissao(req.usuario, c); }catch(e){ return false; } };
    /* `listas` é a chave do cadastro de motivos (Admin → Cadastros): a mesma
       lista aparece aqui para quem já pode editá-la, e só para ele. */
    return { lancar:p('devolucao.lancar'), acompanhar:p('devolucao.acompanhar'), dinheiro:podeDinheiro(req), listas:p('listas.editar') };
  }
  /* A lista diz também O QUE a pessoa pode fazer, para a tela não mostrar
     botão que dá "sem permissão". Esconder não é segurança: quem tranca é o
     portão e o handler. */
  app.get('/api/devolucao-casos', (req,res) => responder(res, () => Object.assign(D.listar(db, { comDinheiro: comDinheiro(req) }), { pode:pode(req) })));
  app.get('/api/devolucao-casos/encerrados', (req,res) => responder(res, () => ({ casos: D.encerrados(db, { comDinheiro: comDinheiro(req) }) })));
  /* O relatório do mês por motivo (R22). Antes do `/:id`. */
  app.get('/api/devolucao-casos/relatorio', (req,res) => responder(res, () => {
    const q = req.query || {};
    const mes = q.mes || D.hoje(db).slice(0,7);
    return D.relatorio(db, mes, comDinheiro(req));
  }));
  /* A tela de lançar acha a venda antes de gravar, para preencher SKU,
     comprador e NF (R2). A NF também acha. */
  app.get('/api/devolucao-casos/venda/:cod', (req,res) => responder(res, () => {
    const cod = req.params.cod;
    const v = D.buscarLote(db, cod) || D.buscarLotePorNF(db, cod);
    const venda = v ? v.venda : String(cod||'').replace(/\s+/g,'');
    const ja = D.abertoDaVenda(db, venda);
    return { achou: !!v, venda: v, caso_aberto: ja ? ja.id : null };
  }));
  /* ── transportadoras (fase 3). ANTES do `/:id`: no Express, a rota com
     parâmetro registrada primeiro engoliria "transportadoras" como um id. ── */
  app.get('/api/devolucao-casos/transportadoras', (req,res) => responder(res, () =>
    ({ transportadoras: D.listarTransportadoras(db, (req.query||{}).todas === '1') })));
  app.get('/api/devolucao-casos/transportadoras/sugestao', (req,res) => responder(res, () =>
    ({ sugestoes: D.sugerirTransportadoras(db, (req.query||{}).cep) })));
  app.post('/api/devolucao-casos/transportadoras', (req,res) => responder(res, () =>
    ({ ok:true, id: D.salvarTransportadora(db, null, req.body) })));
  app.post('/api/devolucao-casos/transportadoras/:tid', (req,res) => responder(res, () =>
    ({ ok:true, id: D.salvarTransportadora(db, req.params.tid, req.body) })));

  /* O anexo, de volta (fase 4). Só leitura: prova não se edita nem se apaga
     por rota. */
  app.get('/api/devolucao-casos/anexo/:aid', (req,res) => {
    let arq;
    try{ arq = D.arquivoDoAnexo(db, req.params.aid); }
    catch(e){ return res.status(e.status || 500).json({ erro:e.message }); }
    let ok = false; try{ ok = require('fs').existsSync(arq); }catch(e){}
    if(!ok) return res.status(410).json({ erro:'O arquivo não está mais no disco.' });
    res.sendFile(arq);
  });

  /* A busca por NF, venda ou pack (AJUSTE de 03/11/2026). Antes do `/:id`. */
  app.get('/api/devolucao-casos/buscar', (req,res) => responder(res, () =>
    ({ casos: D.buscar(db, (req.query||{}).q, { comDinheiro: comDinheiro(req) }) })));

  app.get('/api/devolucao-casos/:id', (req,res) => responder(res, () => D.detalhe(db, req.params.id, { comDinheiro: comDinheiro(req) })));

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

  /* A caixa chegou e ainda não foi revisada (fase 2). */
  app.post('/api/devolucao-casos/:id/chegou', (req,res) => responder(res, () => {
    D.chegou(db, req.params.id, req.usuario);
    return { ok:true };
  }));
  app.post('/api/devolucao-casos/:id/aviso-ml', (req,res) => responder(res, () => {
    D.avisarML(db, req.params.id, req.usuario);
    return { ok:true };
  }));

  /* As tentativas de coleta (fase 3, R8). */
  app.post('/api/devolucao-casos/:id/coleta', (req,res) => responder(res, () => {
    D.pedirColeta(db, req.params.id, req.body, req.usuario);
    return { ok:true };
  }));
  app.post('/api/devolucao-casos/:id/coleta-resultado', (req,res) => responder(res, () => {
    D.resultadoColeta(db, req.params.id, req.body, req.usuario);
    return { ok:true };
  }));

  /* Os anexos (fase 4, R11, R21). */
  app.post('/api/devolucao-casos/:id/anexo', (req,res) => responder(res, () =>
    ({ ok:true, id: D.anexar(db, req.params.id, req.body, req.usuario, CAMINHOS.DEVOLUCOES) })));

  /* A situação do valor do ML (R18) é de quem acompanha; o número, não. */
  app.post('/api/devolucao-casos/:id/situacao-valor', (req,res) => responder(res, () => {
    D.situacaoValor(db, req.params.id, (req.body||{}).situacao, req.usuario);
    return { ok:true };
  }));

  /* ── decisões do admin geral (devolucao.dinheiro) ── */
  app.post('/api/devolucao-casos/:id/valor', (req,res) => {
    if(!podeDinheiro(req)) return semDinheiro(req, res);
    responder(res, () => {
      const mud = D.lancarValor(db, req.params.id, req.body, req.usuario);
      if(mud.length) auditar(req, 'valor', req.params.id, 'lançou '+mud.join(', ')+': '+JSON.stringify(req.body||{}));
      return { ok:true, mudou:mud };
    });
  });
  app.post('/api/devolucao-casos/:id/reembolso', (req,res) => {
    if(!podeDinheiro(req)) return semDinheiro(req, res);
    responder(res, () => {
      const c = D.baixaReembolso(db, req.params.id, (req.body||{}).resultado, req.usuario);
      auditar(req, c.saida, c.id, 'baixa do reembolso: '+(c.saida === 'reembolso_recebido' ? 'recebido' : 'não recebido'));
      return { ok:true };
    });
  });
  app.post('/api/devolucao-casos/:id/devolver-comprador', (req,res) => {
    if(!podeDinheiro(req)) return semDinheiro(req, res);
    responder(res, () => {
      const c = D.devolverComprador(db, req.params.id, req.body, req.usuario);
      auditar(req, 'devolvido_comprador', c.id, 'devolveu o dinheiro ao comprador sem coletar'+(c.valor_devolvido != null ? ' · R$ '+c.valor_devolvido.toFixed(2) : ' · sem valor lançado'));
      return { ok:true };
    });
  });
  app.post('/api/devolucao-casos/:id/perda', (req,res) => {
    if(!podeDinheiro(req)) return semDinheiro(req, res);
    responder(res, () => {
      const c = D.encerrarPerda(db, req.params.id, req.body, req.usuario);
      auditar(req, 'perda_prazo', c.id, 'encerrou como perda por prazo'+(c.valor_perdido != null ? ' · R$ '+c.valor_perdido.toFixed(2) : ' · sem valor lançado'));
      return { ok:true };
    });
  });
};

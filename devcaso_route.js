/* devcaso_route.js — as rotas das devoluções EM ANDAMENTO (tela
 * /devolucao-casos). Quem decide é o devcaso_dominio.js; aqui só se traduz
 * HTTP, se confere a chave do dinheiro e se registra a decisão na auditoria.
 *
 * As chaves de cada rota estão no permDaRota() do acesso.js:
 *   ler e acompanhar   → devolucao.acompanhar (ou devolucao.lancar)
 *   lançar e editar    → devolucao.lancar
 *   os valores do caso → quem lança ou acompanha (AJUSTE de 03/11/2026, dono:
 *                        "quem estiver lançando e quem estiver à frente do
 *                        problema")
 *   decisões e totais  → devolucao.dinheiro: baixa do reembolso, perda,
 *                        devolver ao comprador, o valor perdido e o devolvido,
 *                        e os totais em reais do relatório. Conferida AQUI
 *                        TAMBÉM: o portão é a primeira trava, o handler é a
 *                        segunda, e é a do handler que o teste exercita.
 */
const D = require('./devcaso_dominio');
const CAMINHOS = require('./caminhos');

module.exports = function(app, db){
  D.garantir(db);

  function podeChave(req, chave){
    /* Sem o acesso.js carregado não há quem responda — e a resposta é NÃO.
       O "é admin" do modelo antigo não serve de escape aqui. */
    try{ return !!app.locals.acesso.podePermissao(req.usuario, chave); }
    catch(e){ return false; }
  }
  const podeDinheiro = (req) => podeChave(req, 'devolucao.dinheiro');
  /* Os VALORES do caso (valor do ML, custos, etiqueta, limite do frete, frete
     devolvido) são de quem lança e de quem acompanha — e de quem tem o
     dinheiro, que decide sobre eles. */
  const podeValores = (req) => podeChave(req, 'devolucao.lancar') || podeChave(req, 'devolucao.acompanhar') || podeDinheiro(req);
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
  function comValores(req, so){
    if(!(so || podeValores)(req)) return false;
    const u = req.usuario || {}, agora = Date.now();
    if((agora - (vistoEm.get(u.id) || 0)) >= 30*60*1000){
      vistoEm.set(u.id, agora);
      auditar(req, 'viu_valores', '(devoluções)', 'viu os valores das devoluções em andamento');
    }
    return true;
  }
  const semDinheiro = (req, res) => res.status(403).json({ erro:'Só quem tem a permissão do dinheiro das devoluções faz isto.', chave:'devolucao.dinheiro' });

  /* ── leituras ── */
  function pode(req){
    const p = (c) => { try{ return !!app.locals.acesso.podePermissao(req.usuario, c); }catch(e){ return false; } };
    /* `listas` é a chave do cadastro de motivos (Admin → Cadastros): a mesma
       lista aparece aqui para quem já pode editá-la, e só para ele. */
    return { lancar:p('devolucao.lancar'), acompanhar:p('devolucao.acompanhar'), dinheiro:podeDinheiro(req), valores:podeValores(req), listas:p('listas.editar') };
  }
  /* A lista diz também O QUE a pessoa pode fazer, para a tela não mostrar
     botão que dá "sem permissão". Esconder não é segurança: quem tranca é o
     portão e o handler. */
  app.get('/api/devolucao-casos', (req,res) => responder(res, () => Object.assign(D.listar(db, { comDinheiro: comValores(req) }), { pode:pode(req) })));
  app.get('/api/devolucao-casos/encerrados', (req,res) => responder(res, () => ({ casos: D.encerrados(db, { comDinheiro: comValores(req) }) })));
  /* O relatório do mês por motivo (R22). Antes do `/:id`. */
  app.get('/api/devolucao-casos/relatorio', (req,res) => responder(res, () => {
    const q = req.query || {};
    const mes = q.mes || D.hoje(db).slice(0,7);
    // Os TOTAIS em reais do mês são só da chave do dinheiro.
    return D.relatorio(db, mes, comValores(req, podeDinheiro));
  }));
  /* A tela de lançar acha a venda antes de gravar, para preencher SKU,
     comprador e NF (R2). A NF também acha. */
  app.get('/api/devolucao-casos/venda/:cod', (req,res) => responder(res, () => {
    const cod = req.params.cod;
    const v = D.buscarLote(db, cod) || D.buscarLotePorNF(db, cod);
    const venda = v ? v.venda : String(cod||'').replace(/\s+/g,'');
    const ja = D.abertoDaVenda(db, venda);
    /* Os outros casos abertos do mesmo comprador: quem pede a coleta fica
       sabendo, antes de lançar, que há mais peça da mesma pessoa. */
    const irm = v && v.buyer ? D.mesmoComprador(db, v.buyer, ja ? ja.id : null)
      .map(x => ({ id:x.id, venda:x.venda, nf:x.nf, etapa_nome: D.NOME_ETAPA[x.etapa] || x.etapa })) : [];
    return { achou: !!v, venda: v, caso_aberto: ja ? ja.id : null, comprador_casos: irm };
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
    ({ casos: D.buscar(db, (req.query||{}).q, { comDinheiro: comValores(req) }) })));

  /* As revisões recebidas sem caso, para ligar à mão (CONSERTO de 03/11/2026). */
  app.get('/api/devolucao-casos/:id/revisoes-soltas', (req,res) => responder(res, () => ({ revisoes: D.revisoesSoltas(db, req.params.id) })));

  app.get('/api/devolucao-casos/:id', (req,res) => responder(res, () => D.detalhe(db, req.params.id, { comDinheiro: comValores(req), usuario: req.usuario })));

  /* ── lançar e editar (devolucao.lancar) ── */
  app.post('/api/devolucao-casos', (req,res) => {
    const b = Object.assign({}, req.body || {});
    // Os campos internos do script dos casos iniciais não entram pela rota.
    delete b._valor_ml; delete b._valor_ml_situacao;
    /* Os valores no lançamento são de quem lança (AJUSTE de 03/11/2026). */
    const cheio = (v) => v !== undefined && v !== null && String(v).trim() !== '';
    /* Pedir a coleta e marcar a situação do valor são de quem acompanha, nas
       rotas próprias; pelo lançamento, também (achado na revisão). */
    const pode2 = pode(req);
    if((b.coleta && cheio(b.coleta.transportadora_id) || cheio(b.valor_ml_situacao)) && !pode2.acompanhar)
      return res.status(403).json({ erro:'Pedir a coleta e marcar a situação do valor são de quem acompanha as devoluções. Lance sem eles.', chave:'devolucao.acompanhar' });
    responder(res, () => {
      const r = D.lancarCompleto(db, b, req.usuario);
      if(r.valorMudou && r.valorMudou.length) auditar(req, 'valor', r.caso.id, 'lançou no lançamento '+r.valorMudou.join(', ')+': '+JSON.stringify({ valor_ml: b.valor_ml, custo_etiqueta: b.custo_etiqueta, limite_frete: b.limite_frete, custo: b.coleta && b.coleta.custo }));
      return { ok:true, id:r.caso.id };
    });
  });
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
    D.pedirProrrogacao(db, req.params.id, req.usuario, (req.body||{}).texto, (req.body||{}).qual);
    return { ok:true };
  }));
  app.post('/api/devolucao-casos/:id/prazo', (req,res) => responder(res, () => {
    D.novoPrazo(db, req.params.id, (req.body||{}).prazo, req.usuario, (req.body||{}).qual);
    return { ok:true };
  }));

  /* Trocar o tipo (ML devolve ↔ Nós coletamos) — de quem lança, como o
     editar. A chave é conferida aqui também: o portão é a primeira trava. */
  app.post('/api/devolucao-casos/:id/tipo', (req,res) => {
    if(!pode(req).lancar) return res.status(403).json({ erro:'Trocar o tipo do caso é de quem lança as devoluções.', chave:'devolucao.lancar' });
    responder(res, () => { D.trocarTipo(db, req.params.id, req.body, req.usuario); return { ok:true }; });
  });

  /* A revisão do frete do "ML devolve" (de quem acompanha, com o valor
     devolvido junto — os valores do caso são de quem acompanha). */
  const semAcompanhar = (res) => res.status(403).json({ erro:'A revisão do frete é de quem acompanha as devoluções.', chave:'devolucao.acompanhar' });
  app.post('/api/devolucao-casos/:id/revisao-frete', (req,res) => {
    if(!pode(req).acompanhar) return semAcompanhar(res);
    responder(res, () => { D.pedirRevisaoFrete(db, req.params.id, req.body, req.usuario); return { ok:true }; });
  });
  app.post('/api/devolucao-casos/:id/revisao-frete-resposta', (req,res) => {
    if(!pode(req).acompanhar) return semAcompanhar(res);
    const b = req.body || {};
    responder(res, () => {
      const r = D.respostaRevisaoFrete(db, req.params.id, b, req.usuario);
      if(r.valorMudou && r.valorMudou.length) auditar(req, 'valor', req.params.id, 'lançou '+r.valorMudou.join(', ')+': '+JSON.stringify({ valor_revisao: b.valor_revisao }));
      return { ok:true };
    });
  });

  /* Desfazer a última mudança de etapa feita à mão — só quem a fez. */
  app.post('/api/devolucao-casos/:id/desfazer-etapa', (req,res) => responder(res, () => {
    D.desfazerEtapa(db, req.params.id, req.usuario);
    return { ok:true };
  }));

  /* Ligar à mão uma revisão solta a este caso (quem acompanha). */
  app.post('/api/devolucao-casos/:id/ligar', (req,res) => {
    if(!pode(req).acompanhar) return res.status(403).json({ erro:'Ligar a revisão é de quem acompanha as devoluções.', chave:'devolucao.acompanhar' });
    responder(res, () => { const b = req.body || {}; D.ligarManual(db, req.params.id, b.devolucao_id, req.usuario, !!b.confirmar); return { ok:true }; });
  });

  /* A caixa chegou e ainda não foi revisada (fase 2). */
  app.post('/api/devolucao-casos/:id/chegou', (req,res) => responder(res, () => {
    D.chegou(db, req.params.id, req.usuario, req.body);
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
  app.post('/api/devolucao-casos/:id/coleta-agenda', (req,res) => responder(res, () => {
    D.agendarColeta(db, req.params.id, req.body, req.usuario);
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

  /* Os valores do caso — de quem lança ou acompanha. O valor perdido e o
     devolvido ao comprador acompanham as DECISÕES, e ficam com o dinheiro. */
  app.post('/api/devolucao-casos/:id/valor', (req,res) => {
    const b = req.body || {};
    if(!podeValores(req)) return res.status(403).json({ erro:'Os valores do caso são de quem lança ou acompanha as devoluções.', chave:'devolucao.acompanhar' });
    if(('valor_perdido' in b || 'valor_devolvido' in b) && !podeDinheiro(req)) return semDinheiro(req, res);
    responder(res, () => {
      const mud = D.lancarValor(db, req.params.id, req.body, req.usuario);
      if(mud.length) auditar(req, 'valor', req.params.id, 'lançou '+mud.join(', ')+': '+JSON.stringify(req.body||{}));
      return { ok:true, mudou:mud };
    });
  });
  /* ── decisões (devolucao.dinheiro) ── */
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

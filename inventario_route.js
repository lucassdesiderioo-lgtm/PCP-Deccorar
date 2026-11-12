/* A CONFERENCIA DE ESTOQUE — as rotas. Spec ESTOQUE-LIVRO-E-CONFERENCIA
 * (fase 2 em 26/09/2026, versao 2 em 04/11/2026). A regra mora no
 * inventario_dominio.js; aqui e so a porta: quem pode, a transacao e a
 * auditoria.
 *
 * ⚠️ AS ROTAS DE QUEM CONTA NAO DEVOLVEM SALDO NEM CONTAGEM DE NINGUEM — elas
 * so repassam o que o dominio monta, e o dominio nao poe o campo (regra 14 do
 * §13). O teste varre o JSON atras de `saldo`, `estoque` e `contado1..3`.
 *
 * ⚠️ `hoje`, `bipe` e `terminar` servem as tres rodadas, e por isso a rota
 * aceita contagem.contar OU contagem.desempatar no `permDaRota()`. Quem decide
 * QUAL rodada a pessoa pode contar e o dominio (`pode`), item a item.
 *
 * ⚠️ O RODIZIO LE A CHAVE PELO SETOR OU PELA EXCECAO, E NAO PELO NIVEL. O Admin
 * Geral passa em toda chave por nivel (§10); pelo nivel ele entraria no
 * rodizio sem nunca ter sido posto no setor de contagem. Quem tem a chave por
 * outro setor ou por excecao entra (spec §8.1).
 */
const INV = require('./inventario_dominio');
const QUEM = require('./quem');

module.exports = function(app, db){
  /* SEM LOGIN NADA GRAVA (QUEM-FEZ-E-REVISAO fase 7, 05/11/2026): toda escrita
     registrada neste modulo passa pelo quem.js antes do handler — a de amanha
     tambem. */
  app = QUEM.portao(app);

  INV.garantirSchema(db);

  /* Quem faz vem do quem.js, o dono unico (QUEM-FEZ-E-REVISAO fase 5,
     05/11/2026), no formato que o dominio ja conhece ({id, nome}). As
     leituras (a lista, a tarja) aceitam ninguem e devolvem pouco; toda
     ESCRITA passa pelo `post` abaixo, que responde 401 sem login. */
  const quem = req => {
    const q = QUEM.quem(req);
    return q ? { id: q.usuario_id, nome: q.usuario_nome || '' } : { id: null, nome: '' };
  };
  const post = (rota, h) => app.post(rota, (req,res) => { if(!QUEM.exigir(req,res)) return; return h(req,res); });
  function pode(req, chave){
    try{ return !!app.locals.acesso.podePermissao(req.usuario, chave); }
    catch(e){ return (((req.usuario||{}).areas)||[]).indexOf('admin') >= 0; }
  }
  const podeDe = req => chave => pode(req, chave);
  /* A chave contagem.contar pelo setor ou pela excecao (ver o cabecalho). */
  function temChaveRodizio(uid){
    const ac = app.locals.acesso;
    if(!ac || !ac.permissoesDe) return false;
    try{
      if(ac.ehAdminGeral && ac.ehAdminGeral(uid)){
        const porSetor = db.prepare(`SELECT 1 FROM usuario_setor us JOIN setor_permissao sp ON sp.setor_id=us.setor_id
          JOIN setores s ON s.id=us.setor_id WHERE us.usuario_id=? AND s.ativo=1 AND s.nivel<>'admin_geral'
            AND sp.chave='contagem.contar' LIMIT 1`).get(uid);
        const porExc = db.prepare("SELECT 1 FROM usuario_excecao WHERE usuario_id=? AND chave='contagem.contar' AND concede=1").get(uid);
        const revoga = db.prepare("SELECT 1 FROM usuario_excecao WHERE usuario_id=? AND chave='contagem.contar' AND concede=0").get(uid);
        return !!(porSetor || porExc) && !revoga;
      }
      return ac.permissoesDe(uid).has('contagem.contar');
    }catch(e){ return false; }
  }
  function auditar(req, acao, alvo, detalhe){
    try{ app.locals.acesso.auditar(req, 'estoque', acao, alvo, detalhe); }catch(e){}
  }
  /* Erro do dominio vira status + mensagem; erro de verdade vira 500 dizendo o
     que foi, e a transacao ja desfez tudo. */
  function responder(res, fn){
    try{
      const r = fn();
      if(r && r.__status){ const st = r.__status; delete r.__status; return res.status(st).json(Object.assign({ ok:false }, r)); }
      return res.json(Object.assign({ ok:true }, r));
    }catch(e){
      if(e && e.status) return res.status(e.status).json(Object.assign({ ok:false, erro:e.message }, e.extra || {}));
      console.log('[inventario] ' + (e && e.stack || e));
      return res.status(500).json({ ok:false, erro:'falhou: ' + (e && e.message) });
    }
  }
  const tx = fn => db.transaction(fn)();
  /* a etiqueta do ☰ Menu (pendencias_route) pergunta a lista do dia pela mesma régua */
  app.locals.inventarioTemChave = temChaveRodizio;
  const ctx = { temChave: temChaveRodizio };

  // ── quem conta (as tres rodadas) ──────────────────────────────────────────
  app.get('/api/inventario/hoje', (req,res) => responder(res, () =>
    tx(() => INV.hoje(db, { quem:quem(req), pode:podeDe(req), temChave:temChaveRodizio }))));

  /* A tarja (§7.1): qualquer pessoa logada pergunta; quem nao tem a chave
     recebe nada. */
  app.get('/api/inventario/tarja', (req,res) => responder(res, () =>
    ({ tarja: tx(() => INV.tarja(db, { quem:quem(req), pode:podeDe(req), temChave:temChaveRodizio })) })));

  post('/api/inventario/bipe', (req,res) => responder(res, () => {
    const b = req.body || {};
    return tx(() => INV.contar(db, { codigo:b.codigo, quantidade:b.quantidade, zerar:!!b.zerar, abrir:!!b.abrir,
      quem:quem(req), pode:podeDe(req) }));
  }));

  post('/api/inventario/terminar', (req,res) => responder(res, () => {
    const b = req.body || {};
    const r = tx(() => INV.terminar(db, { codigo:b.codigo, nenhuma:!!b.nenhuma, quem:quem(req), pode:podeDe(req) }));
    if(r.invalidada){
      auditar(req, 'inventario_recontar_na_hora', r.codigo, 'mexeram no SKU durante a contagem');
      return Object.assign({ __status:409, erro:r.mensagem }, r);
    }
    auditar(req, 'inventario_contado', r.codigo, b.nenhuma ? 'nao tem nenhuma' : '');
    return r;
  }));

  post('/api/inventario/geral/terminar-prateleira', (req,res) => responder(res, () => {
    const b = req.body || {};
    const r = tx(() => INV.terminarPrateleira(db, { quem:quem(req), pode:podeDe(req), confirmar:!!b.confirmar }));
    if(r.zerados != null) auditar(req, 'inventario_prateleira_zero', 'geral', r.zerados + ' SKU(s) sem nenhuma peça');
    return r;
  }));

  // ── quem planeja ──────────────────────────────────────────────────────────
  app.get('/api/inventario/sugestao', (req,res) => responder(res, () =>
    ({ sugestao: INV.sugestao(db, req.query && req.query.qtd) })));

  app.get('/api/inventario/andamento', (req,res) => responder(res, () =>
    tx(() => { INV.garantirDia(db, ctx); return INV.andamento(db, ctx); })));

  post('/api/inventario/abrir', (req,res) => responder(res, () => {
    const b = req.body || {};
    const r = tx(() => INV.abrir(db, { tipo:b.tipo, codigos:b.codigos, quem:quem(req), confirmar:!!b.confirmar }));
    auditar(req, 'inventario_aberto', 'conferencia #' + r.ciclo_id, r.tipo + ' · ' + r.itens + ' SKU(s)');
    return r;
  }));
  post('/api/inventario/geral/abrir', (req,res) => responder(res, () => {
    const b = req.body || {};
    const r = tx(() => INV.abrir(db, { tipo:'geral', quem:quem(req), confirmar:!!b.confirmar }));
    auditar(req, 'inventario_aberto', 'conferencia #' + r.ciclo_id, 'geral · ' + r.itens + ' SKU(s) · expedição parada');
    return r;
  }));
  post('/api/inventario/quinzenal/abrir', (req,res) => responder(res, () => {
    const r = tx(() => INV.abrirQuinzenal(db, { quem:quem(req) }));
    auditar(req, 'inventario_aberto', 'conferencia #' + r.ciclo_id, 'quinzenal antecipada · ' + r.itens + ' SKU(s) · prazo ' + r.prazo);
    return r;
  }));

  post('/api/inventario/encerrar', (req,res) => responder(res, () => {
    const id = +((req.body || {}).ciclo_id);
    const r = tx(() => INV.encerrar(db, id));
    auditar(req, 'inventario_encerrado', 'conferencia #' + id, r.nao_contados + ' nao contado(s)');
    return r;
  }));

  app.get('/api/inventario/rodizio', (req,res) => responder(res, () =>
    ({ pessoas: INV.rodizio(db, temChaveRodizio) })));
  post('/api/inventario/rodizio', (req,res) => responder(res, () => {
    const b = req.body || {};
    const r = tx(() => INV.marcarRodizio(db, { usuario_id:b.usuario_id, fora:!!b.fora }));
    auditar(req, 'rodizio_' + (r.fora ? 'fora' : 'dentro'), r.nome, r.fora ? 'fora do rodízio da contagem' : 'de volta ao rodízio');
    return r;
  }));

  // ── quem resolve (a fila do admin) ────────────────────────────────────────
  function comValor(req, itens){
    /* O R$ so vai para quem tem custo.ver — o campo nem viaja para os outros
       (regra 14 do §13). O custo e o do ficha_dominio, o mesmo da aba Estoque. */
    if(!pode(req, 'custo.ver')) return itens;
    let FICHA = null; try{ FICHA = require('./ficha_dominio'); }catch(e){}
    const custo = {};
    itens.forEach(i => {
      if(!(i.codigo in custo)){
        let c = null;
        try{ const f = FICHA && FICHA.calcularFicha(db, i.codigo); if(f && f.custo_material != null && isFinite(f.custo_material)) c = +f.custo_material; }catch(e){}
        custo[i.codigo] = c;
      }
      const c = custo[i.codigo];
      i.valor_diferenca = c == null ? null : Math.round(c * (i.diferenca || 0) * 100) / 100;
    });
    return itens;
  }
  app.get('/api/inventario/aprovacao', (req,res) => responder(res, () =>
    ({ itens: comValor(req, INV.aprovacao(db, { quem:quem(req) })) })));

  function aplicar(req){
    const b = req.body || {};
    const r = tx(() => INV.aprovar(db, { id:b.id, motivo:b.motivo, obs:b.obs, diferenca:b.diferenca, quem:quem(req) }));
    auditar(req, 'inventario_resolvido', r.codigo, 'delta ' + r.delta + ' (' + r.antes + ' -> ' + r.depois + ') · ' + (b.motivo || ''));
    return r;
  }
  function recontar(req){
    const b = req.body || {};
    const r = tx(() => INV.rejeitar(db, { id:b.id, motivo:b.motivo, obs:b.obs, quem:quem(req) }));
    auditar(req, 'inventario_contar_de_novo', r.codigo, (b.motivo || '') + (r.amanha ? ' · volta na lista de amanhã' : ' · volta a contar do zero'));
    return r;
  }
  post('/api/inventario/aprovar', (req,res) => responder(res, () => aplicar(req)));
  post('/api/inventario/rejeitar', (req,res) => responder(res, () => recontar(req)));
  post('/api/inventario/resolver', (req,res) => responder(res, () =>
    (((req.body || {}).acao) === 'recontar') ? recontar(req) : aplicar(req)));

  // ── o relatorio de furos (§7.3) ───────────────────────────────────────────
  app.get('/api/inventario/relatorio', (req,res) => responder(res, () => {
    const r = INV.relatorio(db, { desde: req.query && req.query.desde });
    if(pode(req, 'custo.ver')){
      comValor(req, r.furos);
      const custo = {}; r.furos.forEach(f => custo[f.codigo] = f.valor_diferenca == null ? null : f.valor_diferenca / f.diferenca);
      const valor = lista => { let v = 0, falta = 0; lista.forEach(f => { const c = custo[f.codigo]; if(c == null) falta++; else v += c * f.diferenca; });
        return { valor: Math.round(v * 100) / 100, sem_custo: falta }; };
      r.valor_periodo = valor(r.furos);
    }
    return r;
  }));
};

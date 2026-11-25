/* As rotas do carrinho e da entrega da 202 Conferência (spec
 * CONFERENCIA-CARRINHOS, fases 1 e 2, 25/11/2026). A conta mora no
 * carrinho_dominio.js; aqui só a porta HTTP, a foto e a auditoria.
 *
 * O bipe da caixa continua no POST /api/carregar (carreg_route.js), que agora
 * recebe o carrinho ativo. As rotas antigas da saída do caminhão e da viagem
 * (saida_route.js) ficam no ar para o tablet com a página velha em cache.
 */
const fs = require('fs'), path = require('path');
const QUEM = require('./quem');
const C = require('./carrinho_dominio');
const BAIXA = require('./baixa_dominio');
const { ehColeta } = require('./carga');
const { decodificarFoto } = require('./foto');
const FOTOS_DIR = require('./caminhos').COLETAS;

module.exports = function(app, db){
  /* SEM LOGIN NADA GRAVA (quem.js): toda escrita deste módulo passa pela porta. */
  app = QUEM.portao(app);
  require('./saida_schema').garantirSaida(db);
  try{ db.exec("ALTER TABLE saida ADD COLUMN carrinhos TEXT"); }catch(e){}
  C.garantirSchema(db);
  BAIXA.garantirSchema(db);
  try{ fs.mkdirSync(FOTOS_DIR, {recursive:true}); }catch(e){}
  const auditar = (req, acao, alvo, det) => {
    try{ const ac = app.locals.acesso; if(ac && ac.auditar) ac.auditar(req, 'expedicao', acao, alvo, det); }catch(e){}
  };
  const pecasDaCaixa = require('./pecas_caixa')(db);
  const hoje = () => db.prepare("SELECT date('now','localtime') d").get().d;
  const marca = v => ({ id:v.id, codigo:v.codigo, buyer:v.buyer, nf:v.nf, city:v.city, itens:pecasDaCaixa(v.id),
    coleta:ehColeta(v), despachar_em:v.despachar_em, embalado_em:v.embalado_em,
    impresso_por:String(v.impresso_por||'').trim()||null, conferido_por:String(v.conferido_por||'').trim()||null,
    carrinho:v.carrinho||null, nao_achada:!!v.nao_achada_em,
    antiga: !!(v.embalado_em && String(v.embalado_em).slice(0,10) < hoje()),
    adiantada: !!(v.despachar_em && v.despachar_em > hoje()) });

  app.get('/api/carrinhos', (req, res) => res.json({ carrinhos:C.carrinhos(db), agencia:C.agencia() }));

  /* TUDO O QUE A TELA NOVA DESENHA, numa leitura só. */
  app.get('/api/conferencia/dia', (req, res) => {
    const SEM_TESTE = "COALESCE(teste,0)=0";
    const ultimaRecont = db.prepare('SELECT * FROM carrinho_recontagem WHERE carrinho=? ORDER BY id DESC LIMIT 1');
    const destinos = C.carrinhos(db).concat([C.agencia()]).map(d => {
      const l = C.noDestino(db, d.codigo);
      const rc = ultimaRecont.get(d.codigo);
      const ultimaEntrada = l.reduce((m, v) => (v.carrinho_em && v.carrinho_em > m ? v.carrinho_em : m), '');
      return Object.assign({}, d, { n:l.length,
        recontado: !!(rc && rc.bateu && l.length && rc.em >= ultimaEntrada) ? { por:rc.por, em:rc.em } : null });
    });
    const faltam = db.prepare(`SELECT * FROM lote WHERE estagio='embalado' AND conferido_em IS NULL AND ${SEM_TESTE}
      ORDER BY embalado_em, id`).all().map(marca);
    const nos = db.prepare(`SELECT * FROM lote WHERE carrinho IS NOT NULL AND ${C.NA_FABRICA} ORDER BY carrinho, carrinho_em, id`).all().map(marca);
    const entregues = db.prepare(`SELECT * FROM lote WHERE estagio='carregado' AND ${SEM_TESTE}
      AND date(COALESCE(saiu_em, retirado_em))=date('now','localtime') ORDER BY COALESCE(saiu_em, retirado_em) DESC, id`).all().map(marca);
    const semEtiqueta = db.prepare(`SELECT * FROM lote WHERE estagio IN ('pendente','bloqueado') AND codigo IS NOT NULL
      AND ${require('./fila_dia').VENCE_HOJE} AND ${SEM_TESTE} ORDER BY despachar_em, id`).all().map(marca);
    const sem = C.semCarrinho(db).map(marca);
    /* O "a coleta não passou" (R-FIM-01): a caixa marcada vem EM CIMA, com o
       dia, em toda lista. */
    try{ const marcas = require('./fim_dia').marcas(db);
      const poe = l => { l.forEach(v => { if(marcas.has(v.id)) v.ficou_de = marcas.get(v.id); });
        l.sort((a, b) => (b.ficou_de ? 1 : 0) - (a.ficou_de ? 1 : 0)); };
      [faltam, nos, sem].forEach(poe); }catch(e){}
    /* A saída ou a viagem aberta por um tablet com a página antiga: as caixas
       dela saem dos destinos até alguém fechá-la lá. A tela nova avisa (③ REVISÃO). */
    let abertas = [];
    try{ abertas = db.prepare(`SELECT id, tipo, aberta_em, aberta_por FROM saida WHERE fechada_em IS NULL AND tipo IN ('coleta','agencia')`).all(); }catch(e){}
    let segundo = false;
    try{ const c = db.prepare("SELECT valor FROM config WHERE chave='conf_carregamento'").get(); segundo = !!(c && String(c.valor) === '1'); }catch(e){}
    /* O histórico do dia: as saídas fechadas hoje (as da tela nova e as das
       rotas antigas), com a foto. */
    let saidas = [];
    try{ saidas = db.prepare(`SELECT id, tipo, fechada_em, fechado_por, qtd_sistema, qtd_externa, divergente, motivo,
        quem_levou, carrinhos, foto FROM saida WHERE fechada_em IS NOT NULL AND date(fechada_em)=date('now','localtime')
        AND tipo IN ('coleta','agencia') ORDER BY fechada_em DESC`).all()
      .map(x => ({ id:x.id, tipo:x.tipo, fechada_em:x.fechada_em, fechado_por:x.fechado_por, sistema:x.qtd_sistema,
        externa:x.qtd_externa, divergente:!!x.divergente, motivo:x.motivo, quem_levou:x.quem_levou,
        carrinhos:(()=>{ try{ return JSON.parse(x.carrinhos||'[]'); }catch(e){ return []; } })(),
        foto:x.foto ? '/api/saida/foto/'+x.id : null })); }catch(e){ saidas = []; }
    res.json({ barras:C.barras(db), destinos, faltam, nos, entregues, sem_etiqueta:semEtiqueta, sem_carrinho:sem,
      segundo_bipe:segundo, saidas_hoje:saidas, abertas_antigas:abertas });
  });

  // ── a recontagem cega (R-CRR-04) ──
  app.post('/api/carrinho/recontar', (req, res) => {
    const b = req.body || {};
    const c = String(b.carrinho||'').trim().toUpperCase();
    if(c !== C.AG && !C.existe(db, c)) return res.json({ ok:false, motivo:'carrinho_invalido', aviso:'Carrinho fora do cadastro.' });
    const r = db.transaction(() => C.recontar(db, c, b.codes, QUEM.pessoa(req), b.ids))();
    auditar(req, 'carrinho_recontado', C.nomeDe(c), r.contadas+' contadas / '+r.esperadas+' na conferência'+(r.bateu?' — bateu':' — não bateu'));
    res.json(Object.assign({ ok:true }, r));
  });
  app.post('/api/carrinho/passar', (req, res) => {
    const b = req.body || {};
    const r = db.transaction(() => C.passar(db, +b.lote_id, b.carrinho))();
    if(r.ok) auditar(req, 'carrinho_passou', 'volume #'+b.lote_id, 'para o '+C.nomeDe(r.carrinho));
    res.json(r);
  });
  app.post('/api/carrinho/nao-achou', (req, res) => {
    const b = req.body || {};
    const r = db.transaction(() => C.naoAchou(db, +b.lote_id, QUEM.pessoa(req)))();
    if(r.ok) auditar(req, 'carrinho_nao_achada', 'volume #'+b.lote_id, 'conferida e não achada no '+C.nomeDe(r.de)+' — estoque não mexeu');
    res.json(r);
  });

  /* A etiqueta do carrinho, em PDF do tamanho do rolo (a mesma porta da
     etiqueta de SKU). O código de barras é "CARRINHO-A". */
  app.get('/api/carrinho/etiqueta/:codigo', async (req, res) => {
    const c = String(req.params.codigo||'').trim().toUpperCase();
    if(!C.existe(db, c)) return res.status(404).json({ erro:'carrinho fora do cadastro' });
    try{
      const pdf = await require('./sku_etq_pdf').gerar({ codigo:'CARRINHO-'+c, exige_medida:0,
        modelo_nome:'EXPEDIÇÃO', descricao:'CARRINHO '+c }, 1);
      res.setHeader('Content-Type', 'application/pdf');
      res.setHeader('Content-Disposition', 'inline; filename="carrinho-'+c+'.pdf"');
      res.send(pdf);
    }catch(e){ res.status(400).json({ erro:e.message }); }
  });

  // ── a entrega (R-ENT) ──
  app.get('/api/entrega/previa', (req, res) => {
    const ds = String((req.query||{}).destinos||'').split(',');
    const p = C.previa(db, ds);
    const porId = id => db.prepare('SELECT * FROM lote WHERE id=?').get(id);
    res.json({ ok:true, destinos:p.destinos, sistema:p.sistema, caixas:p.caixas.map(marca),
      faltam_bipar:p.faltam_bipar.map(v => marca(porId(v.id))) });
  });

  function fechar(req, res, liberar){
    const b = req.body || {};
    const v = C.validarEntrega(db, b);
    if(v.motivo) return res.json({ ok:false, motivo:v.motivo, aviso:v.aviso });
    let levou = null;
    if(v.para === 'agencia'){
      try{ levou = db.prepare('SELECT id, nome FROM usuarios WHERE id=? AND ativo=1').get(parseInt(b.quem_levou_id, 10)) || null; }catch(e){}
      if(!levou) return res.json({ ok:false, motivo:'sem_quem_levou', aviso:'Escolha quem levou as caixas à agência.' });
    }
    const foto = decodificarFoto(b.foto);
    if(!foto) return res.json({ ok:false, motivo:'sem_foto',
      aviso:'Falta a foto da tela do '+(v.para==='agencia'?'atendente':'motorista')+' mostrando quantas caixas ele bipou.' });
    const caixas = []; for(const d of v.destinos) caixas.push(...C.noDestino(db, d));
    const sistema = caixas.length, divergente = sistema !== v.numero;
    const motivo = String(b.motivo||'').trim().slice(0, 300);
    if(divergente && !liberar){
      auditar(req, 'entrega_divergente', v.destinos.join('+'), 'sistema '+sistema+' x '+v.numero+' — não fechou');
      return res.json({ ok:false, motivo:'divergente', sistema, numero:v.numero,
        aviso:'Não bateu: o sistema tem '+sistema+' e '+(v.para==='agencia'?'o atendente':'o motorista')+' bipou '+v.numero+'.' });
    }
    if(liberar && divergente && !motivo) return res.json({ ok:false, motivo:'sem_motivo', aviso:'Escreva o motivo para liberar com número diferente.' });
    const ids = caixas.map(x => x.id);
    const pessoa = QUEM.pessoa(req);
    const saiuPor = v.para === 'agencia' ? 'agencia' : 'coleta';
    let sid = null;
    db.transaction(() => {
      sid = db.prepare(`INSERT INTO saida (tipo, aberta_por, aberta_por_id, fechada_em, fechado_por, fechado_por_id,
          qtd_sistema, qtd_externa, divergente, liberado_por, liberado_por_id, motivo, ids, nada_ficou, quem_levou_id, quem_levou, carrinhos)
        VALUES (?,?,?,datetime('now','localtime'),?,?,?,?,?,?,?,?,?,1,?,?,?)`)
        .run(saiuPor, pessoa.nome||'', pessoa.id, pessoa.nome||'', pessoa.id, sistema, v.numero, divergente?1:0,
             divergente ? pessoa.nome : null, divergente ? pessoa.id : null, motivo || null, JSON.stringify(ids),
             levou ? levou.id : null, levou ? levou.nome : null, JSON.stringify(v.destinos)).lastInsertRowid;
      /* A baixa já foi no bipe; `baixar` não baixa duas vezes, e chamar aqui
         garante que nada sai da fábrica com a peça ainda no saldo. */
      for(const id of ids) BAIXA.baixar(db, { id }, pessoa);
      const up = db.prepare(`UPDATE lote SET estagio='carregado', carregado_em=COALESCE(carregado_em, datetime('now','localtime')),
          saida_id=?, saiu_em=datetime('now','localtime'), saiu_por=?,
          retirado_em=CASE WHEN ?='coleta' OR COALESCE(modalidade,'agencia')='coleta'
                           THEN COALESCE(retirado_em, datetime('now','localtime')) ELSE retirado_em END
        WHERE id=? AND saida_id IS NULL`);
      for(const id of ids) up.run(sid, saiuPor, saiuPor, id);
      const arq = path.join(FOTOS_DIR, 'saida-' + sid + '.' + foto.ext);
      fs.writeFileSync(arq, foto.buf);
      db.prepare('UPDATE saida SET foto=? WHERE id=?').run(arq, sid);
    })();
    auditar(req, divergente ? 'entrega_liberada_divergente' : 'entrega_fechada', 'saida '+sid,
      v.destinos.map(C.nomeDe).join(' + ')+': sistema '+sistema+' / '+v.numero+(levou?' · levou: '+levou.nome:'')+(motivo?' — '+motivo:''));
    res.json({ ok:true, id:sid, sistema, numero:v.numero, divergente, destinos:v.destinos, foto:'/api/saida/foto/'+sid });
  }
  app.post('/api/entrega/fechar', (req, res) => fechar(req, res, false));
  app.post('/api/entrega/liberar', (req, res) => fechar(req, res, true));
};

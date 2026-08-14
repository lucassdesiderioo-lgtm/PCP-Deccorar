/* Fase 1 do Planejamento por estoque alvo (ver docs/DESENHO-PLANEJAMENTO.md).
 *
 * NAO altera o fluxo atual: so importa a planilha do Mercado Livre para a
 * tabela `venda_futura` e expoe o calculo NOVO ao lado do modelo ATUAL (ABC),
 * para conferencia. Nada de estoque, producao ou cruzamento e tocado aqui.
 *
 * As duas contas (secao 3 do desenho):
 *   media diaria = vendas do SKU na janela / dias da janela
 *   alvo         = max(alvo_minimo, ceil(media diaria * dias_cobertura))
 *   precisa      = max(0, comprometido + alvo - estoque)
 * comprometido = vendas com data de envio futura (coluna Estado da planilha).
 */
const express = require('express');
const { lerPlanilha, parseDataVenda, parseDataEnvio } = require('./planilha');

module.exports = function(app, db){
  // Schema no mesmo commit em que o codigo passa a usar (CLAUDE.md secao 17).
  db.exec(`CREATE TABLE IF NOT EXISTS venda_futura (
    venda_id     TEXT PRIMARY KEY,
    codigo       TEXT,
    data_venda   TEXT,
    data_envio   TEXT,
    importado_em TEXT DEFAULT (datetime('now','localtime')),
    teste        INTEGER DEFAULT 0,
    cancelada    INTEGER DEFAULT 0
  );`);
  // 'cancelada' entrou depois de a tabela ja existir em producao. O ALTER
  // acrescenta a coluna no fim (mesma ordem do CREATE) so quando falta, com
  // default estatico 0 — ALTER nao aceita default dinamico no SQLite (secao 17).
  try{
    var vfCols = db.prepare("PRAGMA table_info(venda_futura)").all().map(function(c){return c.name;});
    if(vfCols.indexOf('cancelada') < 0) db.exec("ALTER TABLE venda_futura ADD COLUMN cancelada INTEGER DEFAULT 0");
  }catch(e){ console.log('[plan] nao consegui conferir venda_futura.cancelada: '+e.message); }
  // Fase 4: snapshot diario do fechamento, uma linha por dia (PK = data).
  // Guarda o numero do dia para permitir "era M ontem" e o historico.
  // So numeros derivados de dado real (a contagem ja exclui teste=1), por isso
  // nao entra na cobertura do modo teste.
  db.exec(`CREATE TABLE IF NOT EXISTS fechamento (
    data         TEXT PRIMARY KEY,
    produzido    INTEGER DEFAULT 0,
    vendido      INTEGER DEFAULT 0,
    variou       INTEGER DEFAULT 0,
    estoque_fim  INTEGER DEFAULT 0,
    cobertura    REAL,
    atualizado_em TEXT
  );`);
  db.exec("CREATE TABLE IF NOT EXISTS config (chave TEXT PRIMARY KEY, valor TEXT);");
  // defaults (secao 6 do desenho); OR IGNORE preserva valor ja ajustado
  const seed = db.prepare("INSERT OR IGNORE INTO config (chave,valor) VALUES (?,?)");
  seed.run('dias_cobertura','10');
  seed.run('janela_media','30');
  seed.run('alvo_minimo','2');

  function cfgNum(chave, padrao){
    try{ const c = db.prepare("SELECT valor FROM config WHERE chave=?").get(chave);
      if(c && c.valor!=null && c.valor!=='' && !isNaN(+c.valor)) return +c.valor;
    }catch(e){}
    return padrao;
  }

  // Colunas usadas na planilha (secao 2 do desenho, 1-based -> 0-based):
  //   1=N.o de venda(0)  2=Data da venda(1)  4=Estado(3)  23=SKU(22)
  const IV = 0, IDV = 1, IE = 3, ISKU = 22;

  const bigJson = express.json({ limit:'25mb' });
  app.post('/api/planejamento/importar', bigJson, (req,res)=>{
    try{
      const b64 = ((req.body && req.body.arquivo) || '').replace(/^data:[^,]*,/, '');
      if(!b64) return res.status(400).json({ erro:'sem arquivo' });
      const buf = Buffer.from(b64, 'base64');
      const linhas = lerPlanilha(buf);

      const up = db.prepare(`INSERT INTO venda_futura (venda_id,codigo,data_venda,data_envio,cancelada)
        VALUES (?,?,?,?,?)
        ON CONFLICT(venda_id) DO UPDATE SET
          codigo=excluded.codigo, data_venda=excluded.data_venda,
          data_envio=excluded.data_envio, cancelada=excluded.cancelada,
          importado_em=datetime('now','localtime')`);
      const existe   = db.prepare("SELECT 1 FROM venda_futura WHERE venda_id=?");
      const skuExiste= db.prepare("SELECT 1 FROM skus WHERE codigo=?");
      const del      = db.prepare("DELETE FROM venda_futura WHERE venda_id=? AND teste=0");

      let novas=0, atualizadas=0, semSku=0, semData=0, removidas=0, canceladas=0;
      const vistos = new Set();
      const desconhecidos = {};

      db.transaction(()=>{
        for(const l of linhas){
          const vid = String(l[IV] || '').trim();
          // cabecalho e lixo caem aqui: N.o de venda do ML e numero longo
          if(!/^\d{6,}$/.test(vid)) continue;
          const sku = String(l[ISKU] || '').replace(/\s+/g,'').toUpperCase();
          if(!sku){ semSku++; continue; }
          const dv = parseDataVenda(l[IDV]);
          const estado = String(l[IE] || '');
          const de = parseDataEnvio(estado);
          // venda cancelada/devolvida/reembolsada nao e demanda real -> fora da media
          const cancelada = /cancel|devolu|reembols/i.test(estado) ? 1 : 0;
          if(!de) semData++;
          if(cancelada) canceladas++;
          if(existe.get(vid)) atualizadas++; else novas++;
          up.run(vid, sku, dv, de, cancelada);
          vistos.add(vid);
          if(!skuExiste.get(sku)) desconhecidos[sku] = (desconhecidos[sku]||0) + 1;
        }
        // vendas que sumiram da planilha: canceladas ou ja enviadas
        for(const r of db.prepare("SELECT venda_id FROM venda_futura WHERE teste=0").all()){
          if(!vistos.has(r.venda_id)){ del.run(r.venda_id); removidas++; }
        }
      })();

      res.json({ ok:true, linhas_arquivo:linhas.length, novas, atualizadas,
        removidas, sem_sku:semSku, sem_data_envio:semData, canceladas,
        desconhecidos: Object.keys(desconhecidos).map(k=>({sku:k, qtd:desconhecidos[k]})) });
    }catch(e){ console.error(e); res.status(500).json({ erro:String(e.message||e) }); }
  });

  // Calculo compartilhado entre a tela de comparacao (/api/planejamento) e a
  // lista do modo azul do operador (/api/revisao/producao).
  function calcular(){
    const diasCob     = cfgNum('dias_cobertura', 10);
    const janela      = cfgNum('janela_media', 30);
    const alvoMin     = cfgNum('alvo_minimo', 2);
    const diasColchao = cfgNum('dias_colchao', 10); // parametro do modelo ATUAL

    // --- modelo NOVO: media pela janela e demanda comprometida ---
    const mediaMap = {}, compMap = {};
    db.prepare("SELECT UPPER(codigo) c, COUNT(*) n FROM venda_futura "+
      "WHERE data_venda IS NOT NULL AND COALESCE(cancelada,0)=0 "+
      "AND data_venda >= date('now','localtime','-'||?||' days') "+
      "GROUP BY UPPER(codigo)").all(janela).forEach(r=> mediaMap[r.c]=r.n);
    db.prepare("SELECT UPPER(codigo) c, COUNT(*) n FROM venda_futura "+
      "WHERE data_envio IS NOT NULL AND data_envio >= date('now','localtime') "+
      "GROUP BY UPPER(codigo)").all().forEach(r=> compMap[r.c]=r.n);

    const smap = {};
    db.prepare("SELECT UPPER(codigo) c, descricao, cor, estoque, alvo FROM skus").all().forEach(s=> smap[s.c]=s);

    // --- modelo ATUAL: curva ABC da tabela `demanda` (igual a /api/necessidade) ---
    const demMap = {};
    let dem = [];
    try{ dem = db.prepare("SELECT UPPER(codigo) c, qtd30 FROM demanda ORDER BY qtd30 DESC").all(); }catch(e){}
    const totalDem = dem.reduce((a,b)=>a+b.qtd30,0) || 1;
    let cum = 0;
    for(const r of dem){
      cum += r.qtd30; const pct = cum/totalDem*100;
      const classe = pct<=80 ? 'A' : (pct<=95 ? 'B' : 'C');
      const media = r.qtd30/30;
      demMap[r.c] = { qtd30:r.qtd30, media_dia:+media.toFixed(1), classe,
        alvo_sugerido: Math.max(1, Math.ceil(media*diasColchao)) };
    }

    // --- uniao de todos os codigos vistos ---
    const cods = new Set();
    Object.keys(mediaMap).forEach(c=>cods.add(c));
    Object.keys(compMap).forEach(c=>cods.add(c));
    Object.keys(demMap).forEach(c=>cods.add(c));
    Object.keys(smap).forEach(c=>cods.add(c));

    const linhas = [];
    for(const c of cods){
      const s = smap[c];
      const estoque = s ? s.estoque : null;
      const nVendas = mediaMap[c] || 0;
      const media = janela>0 ? nVendas/janela : 0;
      const alvo = Math.max(alvoMin, Math.ceil(media*diasCob));
      const comprometido = compMap[c] || 0;
      const precisa = Math.max(0, comprometido + alvo - (estoque||0));
      const at = demMap[c] || null;
      linhas.push({
        codigo:c, cadastrado:!!s,
        descricao: s?s.descricao:'', cor: s?s.cor:'',
        estoque,
        // NOVO
        vendas_janela:nVendas, media_dia:+media.toFixed(2), alvo, comprometido, precisa,
        // ATUAL
        at_qtd30: at?at.qtd30:null, at_media: at?at.media_dia:null,
        at_classe: at?at.classe:null, at_alvo: at?at.alvo_sugerido:null
      });
    }
    linhas.sort((a,b)=> b.precisa - a.precisa
      || (b.at_qtd30||0) - (a.at_qtd30||0)
      || a.codigo.localeCompare(b.codigo));

    return { config:{ dias_cobertura:diasCob, janela_media:janela, alvo_minimo:alvoMin, dias_colchao:diasColchao }, linhas };
  }

  app.get('/api/planejamento',(req,res)=>{
    const { config, linhas } = calcular();
    let meta = { imp:null, linhas:0, skus:0 };
    try{ meta = db.prepare("SELECT MAX(importado_em) imp, COUNT(*) linhas, "+
      "COUNT(DISTINCT UPPER(codigo)) skus FROM venda_futura WHERE teste=0").get(); }catch(e){}
    const desconhecidos = db.prepare(
      "SELECT UPPER(vf.codigo) codigo, COUNT(*) qtd FROM venda_futura vf "+
      "LEFT JOIN skus s ON s.codigo=UPPER(vf.codigo) "+
      "WHERE vf.teste=0 AND s.codigo IS NULL GROUP BY UPPER(vf.codigo) ORDER BY qtd DESC").all();
    res.json({
      config,
      importado_em: meta.imp, total_linhas: meta.linhas, total_skus: meta.skus,
      total_precisa: linhas.reduce((a,b)=>a+b.precisa,0),
      total_comprometido: linhas.reduce((a,b)=>a+b.comprometido,0),
      desconhecidos, linhas
    });
  });

  // Fase 2: a tela AZUL (PRODUCAO PRA ESTOQUE) passa a usar o calculo ao vivo,
  // em vez de depender de lancamento. So SKUs cadastrados com necessidade > 0,
  // ja ordenados pela maior necessidade. A tela vermelha (pedidos de hoje) nao muda.
  app.get('/api/revisao/producao',(req,res)=>{
    const { linhas } = calcular();
    res.json(linhas.filter(l=> l.cadastrado && l.precisa>0).map(l=>({
      codigo:l.codigo, descricao:l.descricao, cor:l.cor,
      estoque:l.estoque, comprometido:l.comprometido, alvo:l.alvo, precisa:l.precisa
    })));
  });

  // Fase 4: fechamento diario (secao 10 do desenho).
  //   Produzi X   = pecas que viraram estoque hoje  (embalagem, tabela montagem)
  //   Vendi  Y    = pecas que sairam hoje           (etiqueta de venda, lote.embalado_em)
  //   Estoque variou Z = X - Y
  //   Cobertura   = estoque total / media diaria total (dias que o estoque dura)
  // Grava o snapshot do dia (idempotente) para comparar com ontem e formar historico.
  app.get('/api/fechamento',(req,res)=>{
    const janela = cfgNum('janela_media', 30);
    const hoje = db.prepare("SELECT date('now','localtime') d").get().d;

    const produzido = db.prepare("SELECT COUNT(*) n FROM montagem "+
      "WHERE data=date('now','localtime') AND COALESCE(teste,0)=0").get().n;
    let vendido = 0;
    try{ vendido = db.prepare("SELECT COUNT(*) n FROM lote "+
      "WHERE embalado_em IS NOT NULL AND date(embalado_em)=date('now','localtime') "+
      "AND COALESCE(teste,0)=0").get().n; }catch(e){}
    const variou = produzido - vendido;

    const estoqueTotal = db.prepare("SELECT COALESCE(SUM(estoque),0) t FROM skus").get().t;
    let vendJanela = 0;
    try{ vendJanela = db.prepare("SELECT COUNT(*) n FROM venda_futura "+
      "WHERE data_venda IS NOT NULL AND COALESCE(cancelada,0)=0 "+
      "AND data_venda >= date('now','localtime','-'||?||' days') "+
      "AND COALESCE(teste,0)=0").get(janela).n; }catch(e){}
    const mediaDiaTotal = janela>0 ? vendJanela/janela : 0;
    const cobertura = mediaDiaTotal>0 ? +(estoqueTotal/mediaDiaTotal).toFixed(1) : null;

    try{
      db.prepare(`INSERT INTO fechamento (data,produzido,vendido,variou,estoque_fim,cobertura,atualizado_em)
        VALUES (date('now','localtime'),?,?,?,?,?,datetime('now','localtime'))
        ON CONFLICT(data) DO UPDATE SET produzido=excluded.produzido, vendido=excluded.vendido,
          variou=excluded.variou, estoque_fim=excluded.estoque_fim, cobertura=excluded.cobertura,
          atualizado_em=excluded.atualizado_em`).run(produzido,vendido,variou,estoqueTotal,cobertura);
    }catch(e){}
    let ontem = null;
    try{ ontem = db.prepare("SELECT cobertura FROM fechamento WHERE data=date('now','localtime','-1 day')").get(); }catch(e){}

    res.json({ data:hoje, produzido, vendido, variou,
      estoque_total:estoqueTotal, media_dia_total:+mediaDiaTotal.toFixed(2),
      cobertura_dias:cobertura, cobertura_ontem: ontem&&ontem.cobertura!=null ? ontem.cobertura : null,
      dias_cobertura_alvo: cfgNum('dias_cobertura',10) });
  });

  app.post('/api/planejamento/config',(req,res)=>{
    const b = req.body || {};
    const ins = db.prepare("INSERT INTO config (chave,valor) VALUES (?,?) "+
      "ON CONFLICT(chave) DO UPDATE SET valor=excluded.valor");
    let n = 0;
    if(b.dias_cobertura!=null){ ins.run('dias_cobertura', String(Math.max(1, Math.trunc(+b.dias_cobertura||10)))); n++; }
    if(b.janela_media!=null){   ins.run('janela_media',   String(Math.max(1, Math.trunc(+b.janela_media||30)))); n++; }
    if(b.alvo_minimo!=null){    ins.run('alvo_minimo',    String(Math.max(0, Math.trunc(+b.alvo_minimo||0)))); n++; }
    res.json({ ok:true, salvos:n });
  });
};

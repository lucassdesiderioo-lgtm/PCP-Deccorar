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
const { lerPlanilha, parseDataVenda } = require('./planilha');
const ESTADO = require('./planilha_estado');
const DEMANDA = require('./demanda_dominio');
const FLUXO = require('./fluxo_estoque');
const MEDIA = require('./media_dominio');
const CANC = require('./cancelada_dominio');

const QUEM = require('./quem');
module.exports = function(app, db){
  /* SEM LOGIN NADA GRAVA (QUEM-FEZ-E-REVISAO fase 7, 05/11/2026): toda escrita
     registrada neste modulo passa pelo quem.js antes do handler — a de amanha
     tambem. */
  app = QUEM.portao(app);

  // Schema no mesmo commit em que o codigo passa a usar (CLAUDE.md secao 17).
  db.exec(`CREATE TABLE IF NOT EXISTS venda_futura (
    venda_id     TEXT PRIMARY KEY,
    codigo       TEXT,
    data_venda   TEXT,
    data_envio   TEXT,
    importado_em TEXT DEFAULT (datetime('now','localtime')),
    teste        INTEGER DEFAULT 0,
    cancelada    INTEGER DEFAULT 0,
    unidades     INTEGER DEFAULT 1,
    grupo        TEXT,
    estado       TEXT,
    data_confirmar INTEGER DEFAULT 0
  );`);
  // 'cancelada' entrou depois de a tabela ja existir em producao. O ALTER
  // acrescenta a coluna no fim (mesma ordem do CREATE) so quando falta, com
  // default estatico 0 — ALTER nao aceita default dinamico no SQLite (secao 17).
  try{
    var vfCols = db.prepare("PRAGMA table_info(venda_futura)").all().map(function(c){return c.name;});
    if(vfCols.indexOf('cancelada') < 0) db.exec("ALTER TABLE venda_futura ADD COLUMN cancelada INTEGER DEFAULT 0");
    /* PLANEJAMENTO-VENDAS-FUTURAS fase 1 (07/11/2026): a peca (coluna Unidades),
       o grupo da tabela §3-B do dono, o Estado como veio e a marca "data a
       confirmar" da NF a emitir. No fim, na ordem do CREATE (§17). */
    if(vfCols.indexOf('unidades') < 0)       db.exec("ALTER TABLE venda_futura ADD COLUMN unidades INTEGER DEFAULT 1");
    if(vfCols.indexOf('grupo') < 0)          db.exec("ALTER TABLE venda_futura ADD COLUMN grupo TEXT");
    if(vfCols.indexOf('estado') < 0)         db.exec("ALTER TABLE venda_futura ADD COLUMN estado TEXT");
    if(vfCols.indexOf('data_confirmar') < 0) db.exec("ALTER TABLE venda_futura ADD COLUMN data_confirmar INTEGER DEFAULT 0");
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
  // PLANEJAMENTO-VENDAS-FUTURAS: o ritmo (fase 3) e a ordem pela falta (fase 4),
  // que nasce DESLIGADA — so o dono liga, pela 401.
  seed.run('janela_curta','14');
  seed.run('ordem_por_falta','0');

  // Delega ao dominio: o padrao de cada parametro tem que ser o MESMO nos dois
  // lados, senao a tela mostra uma janela e a compra usa outra.
  const cfgNum = (chave, padrao) => DEMANDA.cfgNum(db, chave, padrao);

  /* As colunas saem do cabecalho do relatorio (planilha_estado.colunas): o
     relatorio de 07/11/2026 trouxe "Descricao do status" (5), "Pacote" (6) e
     "Unidades" (8) alem das quatro de sempre, e tem "Estado" de novo no
     endereco do comprador — vale a PRIMEIRA. */
  const bigJson = express.json({ limit:'25mb' });
  app.post('/api/planejamento/importar', bigJson, (req,res)=>{
    try{
      const b64 = ((req.body && req.body.arquivo) || '').replace(/^data:[^,]*,/, '');
      if(!b64) return res.status(400).json({ erro:'sem arquivo' });
      const buf = Buffer.from(b64, 'base64');
      const linhas = lerPlanilha(buf);
      const COL = ESTADO.colunas(linhas);
      const IV = COL.venda, IDV = COL.data, IE = COL.estado, ISKU = COL.sku;

      const up = db.prepare(`INSERT INTO venda_futura (venda_id,codigo,data_venda,data_envio,cancelada,
          unidades,grupo,estado,data_confirmar)
        VALUES (?,?,?,?,?,?,?,?,?)
        ON CONFLICT(venda_id) DO UPDATE SET
          codigo=excluded.codigo, data_venda=excluded.data_venda,
          data_envio=excluded.data_envio, cancelada=excluded.cancelada,
          unidades=excluded.unidades, grupo=excluded.grupo, estado=excluded.estado,
          data_confirmar=excluded.data_confirmar,
          importado_em=datetime('now','localtime')`);
      const existe   = db.prepare("SELECT 1 FROM venda_futura WHERE venda_id=?");
      const skuExiste= db.prepare("SELECT 1 FROM skus WHERE codigo=?");
      const del      = db.prepare("DELETE FROM venda_futura WHERE venda_id=? AND teste=0");

      /* ── 1. LER O ARQUIVO INTEIRO ANTES DE GRAVAR NADA ─────────────────────
         As duas guardas (arquivo sem futura, tirar mais da metade) precisam da
         conta pronta: decidir no meio da gravacao deixaria meio arquivo no banco. */
      const hoje = db.prepare("SELECT date('now','localtime') d").get().d;
      /* A data do RELATORIO e a regua das datas que ele nao escreve ("segunda-
         feira", "dia seguinte"): o arquivo tirado sexta e subido sabado diz a
         segunda da semana em que foi tirado. Sem titulo nem nome, hoje. */
      const rel = ESTADO.dataDoRelatorio(linhas, req.body && req.body.nome);
      const ref = ESTADO.deIso(rel ? rel.data : hoje);
      let semSku=0, semData=0, canceladas=0;
      const regs = [];
      const grupos = {}; ESTADO.GRUPOS.forEach(g => grupos[g] = { linhas:0, pecas:0 });
      const novos = {};
      /* As linhas canceladas saem do dono unico, com o pack do cabecalho no
         item do pacote de varios produtos (cancelada_dominio.js). */
      const cancelVol = CANC.daPlanilha(linhas, { venda:IV, estado:IE, sku:ISKU });
      for(const l of linhas){
        const vid = String(l[IV] || '').trim();
        // cabecalho e lixo caem aqui: N.o de venda do ML e numero longo
        if(!/^\d{6,}$/.test(vid)) continue;
        const estado = String(l[IE] || '');
        const sku = String(l[ISKU] || '').replace(/\s+/g,'').toUpperCase();
        /* A tabela §3-B do dono (planilha_estado.js): o grupo, se entra na
           media, se e venda futura e a data de envio de onde a tabela diz. */
        const c = ESTADO.classificar(estado, l[COL.descricao], ref);
        const un = ESTADO.unidades(l[COL.unidades]);
        /* O cabecalho do pacote de varios produtos ("Pacote de 2 produtos",
           sem SKU) nao e venda: os itens vem nas linhas de baixo. */
        if(!sku && CANC.cabecalhoDePacote(estado)){ grupos.nao_venda.linhas++; continue; }
        if(!sku){ semSku++; continue; }
        grupos[c.grupo].linhas++; grupos[c.grupo].pecas += un;
        if(!c.conhecido){ const k = estado.replace(/\s+/g,' ').trim(); novos[k] = (novos[k]||0) + 1; }
        const cancelada = c.media ? 0 : 1;
        if(!c.data_envio) semData++;
        if(cancelada) canceladas++;
        regs.push({ vid, sku, dv: parseDataVenda(l[IDV]), de: c.data_envio, cancelada,
                    un, grupo:c.grupo, estado:estado.replace(/\s+/g,' ').trim(), conf:c.data_confirmar, futura:c.futura });
      }

      /* ── 2. AS GUARDAS (spec VENDAS-E-MEDIA §5.2) ──────────────────────────
         A planilha deixou de ser espelho da HISTORIA: ela so espelha as vendas
         FUTURAS. Um arquivo sem nenhuma e quase sempre o periodo errado
         exportado — e aceito, ele apagaria todo o comprometido. */
      /* Futura e o que ainda nao saiu da fabrica (§3-B), e isso inclui a de
         data ja passada — a coluna "Atrasada" (R3). */
      const futuras = regs.filter(r => r.futura).length;
      if(!futuras) return res.status(400).json({ ok:false, motivo:'sem_futura',
        erro:'Este arquivo não tem venda com envio futuro — confira o período exportado. '+
             'Ele precisa ter as vendas ainda não enviadas.' });
      const vistos = new Set(regs.map(r => r.vid));
      /* As futuras gravadas: as de antes desta fase (sem grupo) so de hoje em
         diante, como sempre; as classificadas, todas que tem data de envio —
         so a venda futura recebe data (planilha_estado.js). A passada sem
         grupo nunca sai por ausencia (#11). */
      const futurasHoje = db.prepare("SELECT venda_id FROM venda_futura WHERE teste=0 AND data_envio >= ?").all(hoje);
      /* A ATRASADA (data ja passada) QUE NAO VEIO NO ARQUIVO NAO E APAGADA: ela
         tem data de venda no passado e e da media — apagar seria a #11 por
         outra porta (③ REVISAO, 07/11/2026). Ela perde a data de envio e passa
         a "ja saiu": deixa de ser venda futura e continua sendo venda. */
      const atrasadasGravadas = db.prepare("SELECT venda_id FROM venda_futura WHERE teste=0 AND data_envio < ? "+
        "AND grupo IS NOT NULL").all(hoje);
      const sairiam = futurasHoje.filter(r => !vistos.has(r.venda_id)).map(r => r.venda_id);
      const atrasadasSairam = atrasadasGravadas.filter(r => !vistos.has(r.venda_id)).map(r => r.venda_id);
      const confirmar = !!(req.body && req.body.confirmar);
      /* O guarda conta a ATRASADA junto: ela sai do comprometido igual a futura
         (③ REVISAO, rodada 3). */
      const naFabrica = futurasHoje.length + atrasadasGravadas.length;
      const saem = sairiam.length + atrasadasSairam.length;
      if(naFabrica && saem * 2 > naFabrica && !confirmar)
        return res.status(409).json({ ok:false, motivo:'confirmar', sairiam: saem,
          futuras_hoje: naFabrica,
          aviso:'Este arquivo tira '+saem+' de '+naFabrica+' vendas futuras do sistema (atrasadas incluídas). '+
                'Se ele é um recorte, falta período. Confirme só se essas vendas foram mesmo enviadas ou canceladas.' });

      /* ── 3. GRAVAR, TUDO OU NADA ──────────────────────────────────────────── */
      let novas=0, atualizadas=0, removidas=0, cancVol = null;
      const desconhecidos = {};
      db.transaction(()=>{
        for(const r of regs){
          if(existe.get(r.vid)) atualizadas++; else novas++;
          up.run(r.vid, r.sku, r.dv, r.de, r.cancelada, r.un, r.grupo, r.estado, r.conf);
          if(!skuExiste.get(r.sku)) desconhecidos[r.sku] = (desconhecidos[r.sku]||0) + 1;
        }
        /* O ESPELHO VALE SO ENTRE AS FUTURAS. A venda futura que nao veio no
           arquivo saiu (foi cancelada ou despachada); a PASSADA nunca e apagada
           por ausencia — e historia, e ate a fase 3 e dela que sai a media da
           planilha. Era esta linha que fazia o recorte zerar a media (#11). */
        for(const v of sairiam){ del.run(v); removidas++; }
        const saiu = db.prepare("UPDATE venda_futura SET data_envio=NULL, data_confirmar=0, grupo='saiu', "+
          "estado='(não veio no arquivo — estava '||COALESCE(estado,'')||')' WHERE venda_id=? AND teste=0");
        for(const v of atrasadasSairam){ saiu.run(v); }
        cancVol = CANC.marcar(db, cancelVol, { origem:'planilha' });
        /* R8: a aba diz quando o relatorio foi TIRADO (o titulo dele), nao so
           quando subiu. */
        db.prepare("INSERT INTO config (chave,valor) VALUES ('planilha_relatorio_em',?) "+
          "ON CONFLICT(chave) DO UPDATE SET valor=excluded.valor")
          .run(rel ? rel.data+' '+rel.hora : db.prepare("SELECT datetime('now','localtime') d").get().d.slice(0,16));
      })();

      if(cancVol && (cancVol.embalado || cancVol.no_canto || cancVol.no_carro || cancVol.varias)){
        try{ const ac = app.locals.acesso;
             if(ac && ac.auditar) ac.auditar(req, 'planejamento', 'canceladas_importadas', 'planilha do ML',
               JSON.stringify(cancVol)); }catch(e){}
      }
      res.json({ ok:true, linhas_arquivo:linhas.length, novas, atualizadas,
        removidas, sem_sku:semSku, sem_data_envio:semData, canceladas, futuras,
        canceladas_volumes: cancVol,
        atrasadas_sairam: atrasadasSairam.length,
        grupos, relatorio_em: rel ? rel.data+' '+rel.hora : null,
        pecas_futuras: regs.filter(r => r.futura).reduce((a,r)=>a+r.un,0),
        /* Estado novo NAO TRAVA (decisao do dono): contou como venda — e como
           futura se trouxe data. O import so avisa, para o dono saber. */
        estados_novos: Object.keys(novos).map(k=>({ estado:k, linhas:novos[k] })),
        desconhecidos: Object.keys(desconhecidos).map(k=>({sku:k, qtd:desconhecidos[k]})) });
    }catch(e){ console.error(e); res.status(500).json({ erro:String(e.message||e) }); }
  });

  /* CANCELADAS DEPOIS DA ETIQUETA (spec VENDAS-E-MEDIA §6, decisao D3 do dono).
     O card de Admin -> Bloqueados le daqui. SO MOSTRA: o estoque dessas ja
     baixou, e so quem olhar a prateleira sabe se a persiana voltou. Decidir e
     da Mesa de correcoes, que ainda nao existe. */
  app.get('/api/canceladas', (req,res)=>{
    try{ res.json({ ok:true, volumes: CANC.listar(db) }); }
    catch(e){ console.error(e); res.status(500).json({ erro:String(e.message||e) }); }
  });

  // Calculo compartilhado entre a tela de comparacao (/api/planejamento) e a
  // lista do modo azul do operador (/api/revisao/producao).
  /* A conta mora em demanda_dominio.js desde a Fase 6 de Compras: o `precisa`
     daqui e o mesmo numero que decide a compra de material, e duas copias
     divergiriam no primeiro ajuste de parametro (§9). */
  const calcular = () => DEMANDA.calcular(db);

  /* R8: quando foi a ultima planilha — a hora do RELATORIO (o titulo dele) e a
     do import. A tela pinta de ambar quando nao foi enviada hoje. */
  function ultimaPlanilha(){
    let rel = null, imp = null;
    try{ const c = db.prepare("SELECT valor FROM config WHERE chave='planilha_relatorio_em'").get(); rel = c ? c.valor : null; }catch(e){}
    try{ imp = db.prepare("SELECT MAX(importado_em) i FROM venda_futura WHERE teste=0").get().i; }catch(e){}
    const hoje = db.prepare("SELECT date('now','localtime') d").get().d;
    const quando = rel || (imp ? imp.slice(0,16) : null);
    return { relatorio_em: rel, importado_em: imp, de_hoje: !!quando && quando.slice(0,10) === hoje };
  }

  /* FASE 1 — AS VENDAS FUTURAS POR DIA DE ENVIO (so leitura). A conta e do
     demanda_dominio.porDia (R1): esta rota nao conta nada. */
  app.get('/api/planejamento/futuras',(req,res)=>{
    try{ res.json(Object.assign({ ok:true, planilha: ultimaPlanilha() }, DEMANDA.porDia(db))); }
    catch(e){ console.error(e); res.status(500).json({ erro:String(e.message||e) }); }
  });

  /* FASE 2 — AS JANELAS 7 · 14 · 30 · 45 DIAS, SO PARA OLHAR (R9): nada aqui
     grava na `config`, e a producao continua com a janela de la. */
  app.get('/api/planejamento/janelas',(req,res)=>{
    try{ res.json(Object.assign({ ok:true, janela_producao: cfgNum('janela_media', 30) }, DEMANDA.janelas(db))); }
    catch(e){ console.error(e); res.status(500).json({ erro:String(e.message||e) }); }
  });

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
      planilha: ultimaPlanilha(),
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
    /* FASE 4: com `config.ordem_por_falta` ligada, a ordem e a da data da
       falta e cada linha leva o porque (`motivo`). Desligada, a resposta e a
       de sempre — o tablet nao ve diferenca nenhuma. */
    const porFalta = cfgNum('ordem_por_falta', 0) === 1;
    res.json(linhas.filter(l=> l.cadastrado && l.precisa>0).map(l=>{
      const o = { codigo:l.codigo, descricao:l.descricao, cor:l.cor,
        estoque:l.estoque, comprometido:l.comprometido, alvo:l.alvo, precisa:l.precisa };
      if(porFalta){ o.motivo = l.motivo; o.data_falta = l.data_falta; o.falta_tipo = l.falta_tipo; }
      return o;
    }));
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

    /* As duas contas saem do fluxo_estoque, que passou a ser o dono unico dos
       movimentos: o painel da aba Estoque mostra a MESMA coisa em serie de 30
       dias, e duas copias divergiriam no primeiro filtro mudado de um lado so. */
    const fx = FLUXO.doDia(db);
    const produzido = fx.entrou, vendido = fx.saiu, variou = fx.variou;

    const cob = FLUXO.cobertura(db, janela);
    const estoqueTotal = cob.estoque_total;
    const mediaDiaTotal = cob.media_dia_total;
    const cobertura = cob.cobertura_dias;

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

  /* VENDAS-E-MEDIA, fase 1: a media contada pelo sistema (os PDFs), ao lado da
     da planilha. So conferencia — a producao continua lendo a planilha. A
     janela e a mesma do parametro "Janela da media", senao a diferenca da
     tabela seria so a borda. */
  app.get('/api/planejamento/media/comparar',(req,res)=>{
    try{
      const { linhas } = calcular();
      res.json(MEDIA.comparar(db, linhas, { janela: cfgNum('janela_media', 30) }));
    }catch(e){ console.error(e); res.status(500).json({ erro:String(e.message||e) }); }
  });

  // Tarja de lembrete no admin: ha quantos dias foi a ultima importacao da
  // planilha. A tarja se auto-resolve — sobe a planilha, o contador zera.
  app.get('/api/planejamento/status',(req,res)=>{
    let imp=null;
    try{ imp=db.prepare("SELECT MAX(importado_em) i FROM venda_futura WHERE teste=0").get().i; }catch(e){}
    let dias=null;
    if(imp){
      try{ dias=db.prepare("SELECT CAST(julianday('now','localtime') - julianday(substr(?,1,10)) AS INTEGER) n").get(imp).n; }catch(e){}
    }
    res.json({ importado_em:imp, dias, periodo_dias: cfgNum('janela_media',30) });
  });

  // Aplica o alvo do modelo NOVO em skus.alvo (absorve o "aplicar" da tela
  // Necessidade). Um SKU (body.codigo) ou todos. "Todos" so mexe onde ha venda
  // na janela — assim nao zera o alvo de SKU sem dado de venda.
  app.post('/api/planejamento/aplicar',(req,res)=>{
    const b = req.body || {};
    const { linhas } = calcular();
    const upd = db.prepare("UPDATE skus SET alvo=? WHERE UPPER(codigo)=?");
    let n = 0;
    db.transaction(()=>{
      if(b.codigo){
        const c = String(b.codigo).toUpperCase();
        const l = linhas.find(x=>x.codigo===c);
        if(l && l.cadastrado){ upd.run(l.alvo, c); n++; }
      } else {
        linhas.filter(l=> l.cadastrado && l.vendas_janela>0)
          .forEach(l=>{ upd.run(l.alvo, l.codigo); n++; });
      }
    })();
    const ac = app.locals.acesso; try{ if(ac&&ac.auditar) ac.auditar(req,'estoque','alvo_planejamento', b.codigo||'(todos)', 'aplicados '+n); }catch(e){}
    res.json({ ok:true, aplicados:n });
  });

  app.post('/api/planejamento/config',(req,res)=>{
    const b = req.body || {};
    const ins = db.prepare("INSERT INTO config (chave,valor) VALUES (?,?) "+
      "ON CONFLICT(chave) DO UPDATE SET valor=excluded.valor");
    let n = 0;
    /* A recusa vem ANTES de gravar qualquer outro campo do mesmo pedido. */
    const ac = app.locals.acesso, u = req.usuario;
    if(b.ordem_por_falta!=null){
      let ag = false; try{ ag = !!(u && ac && ac.ehAdminGeral && ac.ehAdminGeral(u.id)); }catch(e){}
      if(!ag) return res.status(403).json({ ok:false, motivo:'admin_geral',
        erro:'Só o nível Admin Geral liga ou desliga a ordem pela data da falta.' });
    }
    if(b.dias_cobertura!=null){ ins.run('dias_cobertura', String(Math.max(1, Math.trunc(+b.dias_cobertura||10)))); n++; }
    if(b.janela_media!=null){   ins.run('janela_media',   String(Math.max(1, Math.trunc(+b.janela_media||30)))); n++; }
    if(b.alvo_minimo!=null){    ins.run('alvo_minimo',    String(Math.max(0, Math.trunc(+b.alvo_minimo||0)))); n++; }
    // fase 3: a janela curta do ritmo, editada onde se edita a janela
    if(b.janela_curta!=null){   ins.run('janela_curta',   String(Math.max(1, Math.trunc(+b.janela_curta||14)))); n++; }
    /* FASE 4: a ordem pela data da falta nasce DESLIGADA e SO O ADMIN GERAL
       liga ou desliga (decisao do dono, 07/11/2026: "quem liga sou eu"). A rota
       e a mesma da janela (planilha.importar); o nivel e conferido aqui. */
    if(b.ordem_por_falta!=null){
      const v = (b.ordem_por_falta === true || +b.ordem_por_falta === 1) ? '1' : '0';
      ins.run('ordem_por_falta', v); n++;
      try{ if(ac && ac.auditar) ac.auditar(req, 'planejamento', 'ordem_por_falta', v==='1'?'ligada':'desligada', ''); }catch(e){}
    }
    res.json({ ok:true, salvos:n });
  });
};

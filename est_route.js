/* A ABA ESTOQUE do admin — dono unico do que ela mostra.
 *
 * ⚠️ POR QUE ESTA ROTA EXISTE: ATE 01/09/2026 A ABA TINHA UMA CONTA PROPRIA.
 *
 * Ela calculava a falta como `alvo - estoque`, lendo o `skus.alvo` gravado. A
 * tela AZUL do operador calcula `comprometido + alvo - estoque` ao vivo
 * (demanda_dominio.js). Os dois numeros se chamavam "a repor" e nao eram o
 * mesmo numero: faltava na conta do admin justamente o COMPROMETIDO — a venda
 * ja feita com envio marcado pra frente. O admin cobrava um numero e a fabrica
 * produzia outro, e a diferenca era invisivel porque as duas telas estavam
 * certas cada uma na sua regua. E a mesma doenca que aposentou a tela
 * /necessidade em 01/09/2026: duas fontes para a mesma pergunta.
 *
 * Agora a aba le o MESMO `precisa` da tela azul, do mesmo `demanda_dominio`.
 *
 * Isso resolve, de tabela, mais dois defeitos que vinham junto:
 *
 * 1. `skus.alvo` E UMA FOTO, e a aba media contra ela. A coluna so muda quando
 *    alguem clica "Aplicar" no Planejamento, e o "aplicar todos" so mexe em SKU
 *    COM VENDA NA JANELA (plan_route.js). SKU que parou de vender guardava o
 *    alvo do mes passado para sempre, e a aba ficava cobrando reposicao de peca
 *    que ninguem compra mais. O alvo mostrado agora e o calculado ao vivo; o
 *    salvo vai junto em `alvo_salvo`, e quando os dois discordam a linha sai
 *    marcada (`alvo_defasado`) em vez de mentir em silencio.
 *
 * 2. SOB MEDIDA APARECIA COMO FALTA ETERNA. A peca feita contra o pedido nunca
 *    tem estoque (§7): com um alvo legado > 0 gravado na coluna, `alvo-estoque`
 *    dava falta todo dia, para sempre. O alvo ao vivo de sob medida e ZERO
 *    (demanda_dominio), entao a linha so pede producao quando ha venda
 *    comprometida — que e a unica coisa que ela pode precisar. Lista que nunca
 *    zera e lista que a equipe aprende a ignorar, e ai a falta de verdade some
 *    junto com o ruido (§3).
 *
 * A rota SO LE. Nada aqui muda saldo: o ajuste continua sendo o POST
 * /api/estoque do server.js, que e onde o motivo e obrigatorio.
 */
const DEMANDA = require('./demanda_dominio');
const FLUXO   = require('./fluxo_estoque');
const FICHA   = require('./ficha_dominio');

module.exports = function(app, db){

  /* ── O DINHEIRO PARADO NA PRATELEIRA ───────────────────────────────────────
   *
   * O custo por SKU sai do `ficha_dominio` — o dono unico (§7-B). Ele ja e a
   * conta que a ficha tecnica mostra e que o historico de custo grava; uma
   * segunda soma aqui divergiria da tela de custo no primeiro preco lancado.
   *
   * ⚠️ REGRA 4 DO §7-B: CUSTO INDEFINIDO NUNCA VIRA ZERO. SKU sem preco de
   * fornecedor devolve `custo_material = null`, e null NAO entra na soma como
   * zero — ele sai contado a parte (`sem_custo`), e a tela mostra o total como
   * PISO ("≥ R$ ..."). Zero seria um custo valido e mentiroso: o estoque
   * pareceria mais barato do que e, e ninguem saberia por que.
   *
   * Cache de 60 s: custo so muda quando alguem lanca preco, recebe material ou
   * mexe na ficha — nao a cada refresh da aba. Local da rota, pelo mesmo motivo
   * do painel_route: quem decide compra precisa do numero fresco. */
  let custoCache = null, custoEm = 0;
  function mapaCusto(){
    const agora = Date.now();
    if(custoCache && (agora - custoEm) < 60000) return custoCache;
    const m = {};
    for(const s of db.prepare('SELECT codigo FROM skus').all()){
      let c = null;
      try{
        const f = FICHA.calcularFicha(db, s.codigo);
        if(f && f.custo_material != null && isFinite(f.custo_material)) c = +f.custo_material;
      }catch(e){}
      m[String(s.codigo).toUpperCase()] = c;
    }
    custoCache = m; custoEm = agora;
    return m;
  }

  /* Custo e a informacao mais estrategica do sistema (§18) e mora atras de
     `custo.ver`. Quem nao tem a permissao nao recebe os campos — nao adianta
     esconder na tela e mandar pelo fio (regra 14 do §13). */
  function podeVerCusto(req){
    try{ return !!app.locals.acesso.podePermissao(req.usuario, 'custo.ver'); }
    catch(e){ return (((req.usuario||{}).areas)||[]).indexOf('admin') >= 0; }
  }
  /* A aba se recarrega sozinha a cada 12 s. Uma linha de auditoria por refresh
     enterraria a auditoria de verdade em ruido, entao o registro e amortecido:
     no maximo um por pessoa a cada 30 minutos. */
  const vistoEm = new Map();
  function auditarCusto(req){
    const u = req.usuario || {}; const agora = Date.now();
    if((agora - (vistoEm.get(u.id) || 0)) < 30*60*1000) return;
    vistoEm.set(u.id, agora);
    try{ app.locals.acesso.auditar(req,'estoque','valor_estoque','(painel)',
      'viu o valor em R$ do estoque'); }catch(e){}
  }

  app.get('/api/estoque/painel', (req,res)=>{
    const { config, linhas } = DEMANDA.calcular(db);

    /* O que a peca E vem das COLUNAS (§7), nunca do texto do codigo. Os campos
       vao crus para a tela montar a frase com o `pecaTexto` de public/sku.js —
       o mesmo formatador da embalagem e da tela Bloqueados. Uma terceira tela
       escrevendo a medida do seu jeito ensinaria a equipe a achar que sao
       coisas diferentes. */
    const extra = {};
    db.prepare(`SELECT UPPER(s.codigo) c, s.alvo alvo_salvo,
        s.largura_cm, s.altura_cm, s.cor_codigo, s.tecido_codigo,
        co.nome cor_nome, t.nome tecido_nome, m.nome modelo_nome,
        COALESCE(m.exige_medida,1) exige_medida,
        COALESCE(m.sob_medida,0)   sob_medida
      FROM skus s
      LEFT JOIN cor co   ON co.codigo = s.cor_codigo
      LEFT JOIN tecido t ON t.codigo  = s.tecido_codigo
      LEFT JOIN modelo m ON m.id      = s.modelo_id`).all()
      .forEach(r => extra[r.c] = r);

    /* O ultimo ajuste manual de cada SKU. E a resposta para "por que esse
       numero mudou", que a tela nao sabia dar: a tabela `ajuste_estoque` grava
       quem/quando/de-para/motivo desde que o ajuste passou a exigir motivo, e
       ate agora NENHUMA tela lia. Metade do valor do registro estava desligada. */
    const ultimo = {};
    try{
      db.prepare(`SELECT a.codigo, a.delta, a.motivo, a.criado_em, a.usuario_nome,
          COALESCE(a.teste,0) teste
        FROM ajuste_estoque a
        JOIN (SELECT codigo, MAX(id) id FROM ajuste_estoque GROUP BY codigo) u
          ON u.id = a.id`).all()
        .forEach(r => ultimo[String(r.codigo).toUpperCase()] = r);
    }catch(e){}

    /* QUANDO ESSE SALDO FOI CONFERIDO PELA ULTIMA VEZ. Saldo nunca contado e
       saldo em que ninguem tem por que confiar: `skus.estoque` tem varios donos
       e nao se reconstroi (§14), entao o inventario e o unico momento em que a
       coluna volta a bater com a prateleira. O try/catch cobre banco antigo,
       anterior a coluna `tipo` — sem ele a aba inteira cairia por causa de uma
       informacao de apoio. */
    const contagem = {};
    try{
      db.prepare(`SELECT UPPER(codigo) c, MAX(contado_em) em,
          CAST(julianday('now','localtime') - julianday(MAX(contado_em)) AS INTEGER) dias
        FROM contagem
        WHERE COALESCE(tipo,'sku')='sku' AND COALESCE(teste,0)=0
        GROUP BY UPPER(codigo)`).all()
        .forEach(r => contagem[r.c] = r);
    }catch(e){}

    const verCusto = podeVerCusto(req);
    const custo = verCusto ? mapaCusto() : null;
    if(verCusto) auditarCusto(req);

    let zerados=0, baixos=0, ok=0, excesso=0, parados=0, sobMedida=0, defasados=0;
    let pecas=0, precisaTotal=0, skusFalta=0, aplicaveis=0, nuncaContados=0;
    let valorTotal=0, valorParado=0, semCusto=0;

    const lista = linhas.filter(l => l.cadastrado).map(l => {
      const e = extra[l.codigo] || {};
      const estoque = l.estoque || 0;
      const sobra = Math.max(0, estoque - (l.alvo + l.comprometido));
      /* Cobertura POR SKU: quantos dias essa peca aguenta no ritmo dela. E o
         numero que decide — 40 pecas de um SKU que vende 1 por semana e
         excesso; 40 de um que vende 10 por dia e falta. Sem venda na janela
         fica NULL, nunca infinito: numero errado e pior que traco. */
      const cobertura = l.media_dia > 0 ? +(estoque / l.media_dia).toFixed(1) : null;
      /* PARADO: tem peca na prateleira e nao vendeu uma unica vez na janela.
         E o unico grupo que a tela antiga nao tinha como mostrar, e e onde o
         dinheiro dorme. Sob medida fica de fora: o estoque dela e sempre zero
         por definicao, entao ela nunca esta parada. */
      const parado = estoque > 0 && l.vendas_janela === 0 && !e.sob_medida;

      let situacao;
      if(l.precisa > 0)   situacao = estoque <= 0 ? 'zerado' : 'baixo';
      else if(sobra > 0)  situacao = 'excesso';
      else                situacao = 'ok';

      if(situacao === 'zerado') zerados++;
      else if(situacao === 'baixo') baixos++;
      else if(situacao === 'excesso') excesso++;
      else ok++;
      if(parado) parados++;
      if(e.sob_medida) sobMedida++;
      pecas += estoque;
      precisaTotal += l.precisa;
      if(l.precisa > 0) skusFalta++;

      /* O alvo salvo so e "defasado" quando ha o que aplicar. SKU sem venda
         nenhuma na janela cai no alvo minimo dos dois lados e nao entra aqui. */
      const alvoSalvo = e.alvo_salvo == null ? null : +e.alvo_salvo;
      const defasado = alvoSalvo != null && alvoSalvo !== l.alvo;
      if(defasado) defasados++;
      /* O "Aplicar todos" do Planejamento so grava em SKU COM VENDA NA JANELA —
         e proposital: sem dado de venda ele zeraria o alvo de quem tem historia
         e nao vendeu no periodo. Entao nem todo defasado se resolve pelo botao,
         e a tela precisa dizer quantos, senao a pessoa clica e nao entende por
         que o aviso continua ali. */
      const aplicavel = defasado && l.vendas_janela > 0;
      if(aplicavel) aplicaveis++;

      const cont = contagem[l.codigo] || null;
      if(!cont) nuncaContados++;

      /* Valor da linha. So conta quem TEM peca: SKU zerado sem custo nao e
         buraco na conta — nao ha o que valorizar ali. */
      let cu = null, valor = null;
      if(verCusto){
        cu = custo[l.codigo];
        if(cu != null){
          valor = +(cu * estoque).toFixed(2);
          valorTotal += valor;
          if(parado) valorParado += valor;
        } else if(estoque > 0) semCusto++;
      }

      return {
        codigo: l.codigo, descricao: l.descricao, cor: l.cor,
        estoque, alvo: l.alvo, alvo_salvo: alvoSalvo, alvo_defasado: defasado,
        alvo_aplicavel: aplicavel,
        contado_em: cont ? cont.em : null, contado_ha: cont ? cont.dias : null,
        /* Campos de custo SO existem quando quem pergunta pode ver. Ausente e
           diferente de null: null seria "não tem custo", e isso é outra coisa. */
        ...(verCusto ? { custo_unitario: cu, valor } : {}),
        comprometido: l.comprometido, precisa: l.precisa, sobra,
        media_dia: l.media_dia, vendas_janela: l.vendas_janela,
        cobertura_dias: cobertura, situacao, parado,
        sob_medida: e.sob_medida ? 1 : 0,
        exige_medida: e.exige_medida == null ? 1 : e.exige_medida,
        largura_cm: e.largura_cm, altura_cm: e.altura_cm,
        cor_codigo: e.cor_codigo, cor_nome: e.cor_nome,
        tecido_nome: e.tecido_nome, modelo_nome: e.modelo_nome,
        ultimo_ajuste: ultimo[l.codigo] || null
      };
    });

    // ── movimento: hoje, e a serie que vira grafico ──
    const hoje  = FLUXO.doDia(db);
    const serie = FLUXO.serie(db, 30);
    const cob   = FLUXO.cobertura(db, config.janela_media);

    let coberturaOntem = null;
    try{
      const o = db.prepare("SELECT cobertura FROM fechamento "+
        "WHERE data=date('now','localtime','-1 day')").get();
      if(o && o.cobertura != null) coberturaOntem = o.cobertura;
    }catch(e){}

    let ajustes30 = 0, ajustesDelta30 = 0, recentes = [];
    try{
      const a = db.prepare("SELECT COUNT(*) n, COALESCE(SUM(delta),0) d FROM ajuste_estoque "+
        "WHERE criado_em >= datetime('now','localtime','-30 days')").get();
      ajustes30 = a.n; ajustesDelta30 = a.d;
      recentes = db.prepare(`SELECT id,codigo,antes,depois,delta,motivo,obs,
          usuario_nome,criado_em, COALESCE(teste,0) teste
        FROM ajuste_estoque ORDER BY id DESC LIMIT 8`).all();
    }catch(e){}

    /* Quando o alvo foi aplicado pela ultima vez. O `plan_route` ja auditava
       cada "aplicar"; a tela nunca mostrou. Sem essa data, um alvo de tres
       semanas atras e visualmente identico a um de hoje. */
    let alvoAplicadoEm = null;
    try{
      const t = db.prepare("SELECT MAX(criado_em) m FROM auditoria "+
        "WHERE categoria='estoque' AND acao='alvo_planejamento'").get();
      if(t && t.m) alvoAplicadoEm = t.m;
    }catch(e){}

    res.json({
      config,
      resumo: {
        skus: lista.length,
        pecas_estoque: pecas,
        skus_falta: skusFalta,
        pecas_precisa: precisaTotal,
        zerados, baixos, ok, excesso, parados,
        sob_medida: sobMedida,
        alvo_defasados: defasados,
        alvo_aplicaveis: aplicaveis,
        nunca_contados: nuncaContados,
        alvo_aplicado_em: alvoAplicadoEm,
        cobertura_dias: cob.cobertura_dias,
        cobertura_ontem: coberturaOntem,
        dias_cobertura_alvo: config.dias_cobertura,
        media_dia_total: cob.media_dia_total,
        entrou_hoje: hoje.entrou, saiu_hoje: hoje.saiu, variou_hoje: hoje.variou,
        ajustes_30d: ajustes30, ajustes_delta_30d: ajustesDelta30,
        custo_visivel: verCusto,
        /* `sem_custo > 0` faz do total um PISO, e a tela escreve o "≥". A regra
           4 vale para a soma inteira: o valor do estoque com uma linha sem
           preço não é um número menor — é um número que ainda não fechou. */
        ...(verCusto ? {
          valor_estoque: +valorTotal.toFixed(2),
          valor_parado:  +valorParado.toFixed(2),
          sem_custo: semCusto,
          // Regra 17 do §7-B: enquanto a mão de obra for zero, é isto que o número é.
          custo_rotulo: 'custo de material'
        } : {})
      },
      serie, ajustes: recentes, linhas: lista
    });
  });
};

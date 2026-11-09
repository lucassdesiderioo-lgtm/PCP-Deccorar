/* O DONO UNICO da conta de demanda por SKU.
 *
 * Estava dentro do `plan_route.js`, como closure, e servia a tres rotas de la:
 * o planejamento, a tela AZUL de producao e o "aplicar alvo". A Fase 6 de
 * Compras precisa do MESMO numero para explodir a ficha e descobrir quanto
 * material comprar — e duas copias divergiriam no primeiro ajuste de parametro
 * (§9). Entao a conta saiu de dentro do route.
 *
 * O numero que importa e o `precisa`: quantas pecas de cada SKU ainda faltam
 * produzir. E ele que a fabrica ja usa na tela azul, e por isso e ele — e nao
 * uma segunda ideia de demanda — que manda na compra de material. Comprar contra
 * um numero diferente do que a producao persegue seria comprar para uma fabrica
 * que nao existe.
 *
 * As contas (secao 3 do docs/DESENHO-PLANEJAMENTO.md):
 *   media diaria = vendas do SKU na janela / dias da janela
 *   alvo         = max(alvo_minimo, ceil(media diaria * dias_cobertura))
 *   precisa      = max(0, comprometido + alvo - livre)
 * comprometido = vendas com data de envio futura (coluna Estado da planilha)
 *                SEM as que ja tem etiqueta impressa no PCP (09/11/2026);
 * livre        = saldo − peca em caixa com etiqueta (baixa_dominio).
 *
 * O modelo ATUAL (curva ABC da tabela `demanda`) continua sendo devolvido lado a
 * lado, nos campos `at_*`, porque a tela de planejamento compara os dois. Ele
 * NAO decide nada.
 */

function cfgNum(db, chave, padrao){
  try{ const c = db.prepare("SELECT valor FROM config WHERE chave=?").get(chave);
    if(c && c.valor!=null && c.valor!=='' && !isNaN(+c.valor)) return +c.valor;
  }catch(e){}
  return padrao;
}

/* ── PLANEJAMENTO-VENDAS-FUTURAS (07/11/2026) ────────────────────────────────
 * R1: UMA CONTA SO. A falta por dia da aba nova, o comprometido da tela azul, a
 * media e a ordem da fase 4 saem daqui. O resto le daqui.
 * R2: conta-se PECA (coluna Unidades). A linha de antes desta fase nasce com
 *     unidades=1, que e o que ela valia.
 * R3: venda futura e o que a tabela §3-B (planilha_estado.js) diz que ainda nao
 *     saiu da fabrica — so ela recebe data de envio no import. A de data ja
 *     passada e "Atrasada", e CONTA: atraso tem que aparecer, nao sumir.
 *     A linha de antes desta fase (sem grupo) continua valendo so de hoje em
 *     diante, como sempre: uma data passada nela pode ser envio que ja saiu.
 */
/* As colunas novas nascem no plan_route.js (CREATE + ALTER, §17). Um banco que
   so tem a tabela de antes (um script, um teste que monta a sua) conta como
   antes: 1 por linha, e futura so de hoje em diante. */
function etiquetaSql(db){
  let lc = [];
  try{ lc = db.prepare("PRAGMA table_info(lote)").all().map(c => c.name); }catch(e){}
  if(lc.indexOf('embalado_em') < 0 || lc.indexOf('venda') < 0) return '';
  const pack = lc.indexOf('packId') >= 0 ? " OR l.packId=venda_futura.venda_id" : '';
  const teste = lc.indexOf('teste') >= 0 ? " AND COALESCE(l.teste,0)=0" : '';
  return "EXISTS (SELECT 1 FROM lote l WHERE (l.venda=venda_futura.venda_id"+pack+") "+
         "AND l.embalado_em IS NOT NULL"+teste+")";
}

/* O RESERVADO pela etiqueta, por SKU: o dono e o baixa_dominio (o mesmo
   numero do livre da Etiqueta de Venda e da TV). Banco sem `lote` (um teste
   que monta so a planilha) nao tem reserva. */
function reservadoPorSku(db){
  try{ return require('./baixa_dominio').reservados(db) || {}; }catch(e){ return {}; }
}

function sql(db){
  let cols = [];
  try{ cols = db.prepare("PRAGMA table_info(venda_futura)").all().map(c => c.name); }catch(e){}
  const tem = n => cols.indexOf(n) >= 0;
  return {
    PECA: tem('unidades') ? "COALESCE(unidades,1)" : "1",
    FUTURA: (tem('teste') ? "COALESCE(teste,0)=0 AND " : "") + "data_envio IS NOT NULL " +
            (tem('grupo') ? "AND (data_envio >= date('now','localtime') OR grupo IS NOT NULL)"
                          : "AND data_envio >= date('now','localtime')"),
    CONF: tem('data_confirmar') ? "COALESCE(data_confirmar,0)" : "0",
    /* A VENDA COM ETIQUETA JA FOI ATENDIDA PELA PRODUCAO (decisao do dono,
       09/11/2026): a peca ja foi embalada e esta na caixa dela. A planilha so
       troca o Estado quando o caminhao bipa, e ate la a venda ficava no
       comprometido E a peca ja tinha saido do saldo na Conferencia — a mesma
       peca contada duas vezes (o A3 da PLANEJAMENTO-VENDAS-FUTURAS). Quem
       liga a venda da planilha a caixa e o cruzamento do cancelamento: a
       venda ou o pack. A venda que o PCP nao acha CONTINUA contando: na
       duvida, produz-se. */
    ETQ: etiquetaSql(db),
    TESTE: tem('teste') ? " AND COALESCE(teste,0)=0" : ""
  };
}

/* Vendas (em PECA) por SKU nos ultimos N dias, pela Data de venda. A media da
   producao, a da cobertura do fechamento e a dos botoes da fase 2 leem daqui. */
function vendasPorSku(db, dias){
  const m = {}, Q = sql(db);
  db.prepare("SELECT UPPER(codigo) c, SUM("+Q.PECA+") n FROM venda_futura "+
    "WHERE data_venda IS NOT NULL AND COALESCE(cancelada,0)=0"+Q.TESTE+" "+
    "AND data_venda >= date('now','localtime','-'||?||' days') "+
    "GROUP BY UPPER(codigo)").all(dias).forEach(r=> m[r.c]=r.n);
  return m;
}
/* RELATORIOS-UNIFICADOS (08/11/2026): a mesma venda, por PERIODO. A regua e a
   de cima — peca (Unidades), pela Data de venda, sem a cancelada e sem a linha
   que nao e venda (`cancelada`), sem o modo teste —, so com as bordas dadas.
   O relatorio nao conta venda por conta propria: le daqui (R1). */
function vendasPorDiaPeriodo(db, de, ate){
  const m = {}, Q = sql(db);
  db.prepare("SELECT data_venda d, SUM("+Q.PECA+") n FROM venda_futura "+
    "WHERE data_venda IS NOT NULL AND COALESCE(cancelada,0)=0"+Q.TESTE+" "+
    "AND data_venda BETWEEN ? AND ? GROUP BY data_venda").all(de, ate).forEach(r => m[r.d] = r.n);
  return m;
}
function vendasPorMes(db){
  const Q = sql(db);
  return db.prepare("SELECT substr(data_venda,1,7) mes, SUM("+Q.PECA+") pecas FROM venda_futura "+
    "WHERE data_venda IS NOT NULL AND COALESCE(cancelada,0)=0"+Q.TESTE+" "+
    "GROUP BY substr(data_venda,1,7) ORDER BY mes").all();
}
/* Os SKUs do periodo, com a cor e a medida do CADASTRO (§7: o codigo nao diz
   o que a peca e). SKU fora do cadastro sai com cor e medida vazias. */
function vendasPorSkuPeriodo(db, de, ate){
  const Q = sql(db);
  return db.prepare("SELECT UPPER(v.codigo) codigo, SUM("+Q.PECA.replace('unidades','v.unidades')+") pecas, "+
    "s.cor_codigo cor, s.largura_cm largura, s.altura_cm altura FROM venda_futura v "+
    "LEFT JOIN skus s ON s.codigo=UPPER(v.codigo) "+
    "WHERE v.data_venda IS NOT NULL AND COALESCE(v.cancelada,0)=0"+Q.TESTE.replace('teste','v.teste')+" "+
    "AND v.data_venda BETWEEN ? AND ? GROUP BY UPPER(v.codigo) ORDER BY pecas DESC, codigo").all(de, ate);
}
function primeiraVenda(db){
  try{ const Q = sql(db);
    return db.prepare("SELECT MIN(data_venda) d FROM venda_futura WHERE data_venda IS NOT NULL"+Q.TESTE).get().d || null;
  }catch(e){ return null; }
}
function vendasTotal(db, dias){
  const m = vendasPorSku(db, dias);
  return Object.keys(m).reduce((a,k)=>a+m[k], 0);
}

const DSEM = ['dom','seg','ter','qua','qui','sex','sáb'];
function rotuloDia(isoData){
  const m = String(isoData||'').match(/^(\d{4})-(\d{2})-(\d{2})/);
  if(!m) return '';
  const d = new Date(+m[1], +m[2]-1, +m[3]);
  return DSEM[d.getDay()] + ' ' + m[3] + '/' + m[2];
}
function somaDias(isoData, n){
  const m = String(isoData).match(/^(\d{4})-(\d{2})-(\d{2})/);
  const d = new Date(+m[1], +m[2]-1, +m[3]); d.setDate(d.getDate() + n);
  return d.getFullYear()+'-'+String(d.getMonth()+1).padStart(2,'0')+'-'+String(d.getDate()).padStart(2,'0');
}

/* AS VENDAS FUTURAS POR DIA DE ENVIO, com a falta ACUMULADA (R4):
 *   falta ate o dia D = max(0, vendas de hoje ate D − estoque)
 * O estoque cobre primeiro o dia mais cedo. O estoque e o SALDO, o mesmo da
 * tela azul (§2: o comprometido ja conta a venda impressa ate ela sair).
 * A primeira coluna e "Atrasada" (data ja passada). O horizonte e todo dia que
 * tem venda futura (R5). Sob medida fica fora da falta (R6) e SKU sem cadastro
 * em linha propria (R7). */
function porDia(db){
  const hoje = db.prepare("SELECT date('now','localtime') d").get().d;
  const Q = sql(db), PECA = Q.PECA, FUTURA = Q.FUTURA;
  const smap = {};
  db.prepare(`SELECT UPPER(s.codigo) c, s.descricao, s.cor, s.estoque, COALESCE(m.sob_medida,0) sob_medida
    FROM skus s LEFT JOIN modelo m ON m.id=s.modelo_id`).all().forEach(s=> smap[s.c]=s);
  const regs = db.prepare(`SELECT UPPER(codigo) c,
      CASE WHEN data_envio < ? THEN 'atrasada' ELSE data_envio END d,
      SUM(${PECA}) n,
      SUM(CASE WHEN ${Q.CONF}=1 THEN ${PECA} ELSE 0 END) nconf
    FROM venda_futura WHERE ${FUTURA}${Q.ETQ ? ' AND NOT '+Q.ETQ : ''}
    GROUP BY UPPER(codigo), CASE WHEN data_envio < ? THEN 'atrasada' ELSE data_envio END`).all(hoje, hoje);
  const reserva = reservadoPorSku(db);

  const diasSet = new Set(), porSku = {};
  for(const r of regs){
    if(r.d !== 'atrasada') diasSet.add(r.d);
    (porSku[r.c] = porSku[r.c] || {})[r.d] = { n:r.n, confirmar:r.nconf };
  }
  const temAtrasada = regs.some(r => r.d === 'atrasada');
  const dias = (temAtrasada ? ['atrasada'] : []).concat(Array.from(diasSet).sort());

  const linhas = [], sobMedida = [], semCadastro = [];
  const total = {}; dias.forEach(d => total[d] = { vendas:0, falta:0, confirmar:0 });
  for(const c of Object.keys(porSku)){
    const s = smap[c], v = porSku[c];
    const cel = dias.map(d => ({ dia:d, vendas: v[d] ? v[d].n : 0, confirmar: v[d] ? v[d].confirmar : 0 }));
    const totalSku = cel.reduce((a,x)=>a+x.vendas, 0);
    if(!s){ semCadastro.push({ codigo:c, total:totalSku, celulas:cel }); continue; }
    if(s.sob_medida){ sobMedida.push({ codigo:c, total:totalSku, celulas:cel }); continue; }
    /* O LIVRE, e nao o saldo: a venda com etiqueta saiu da lista, e a peca
       dela (em caixa, esperando a Conferencia) nao pode cobrir outra venda. */
    const emCaixa = reserva[c] || 0, estoque = s.estoque || 0, livre = estoque - emCaixa;
    let acum = 0, faltaDesde = null, faltaPrimeiro = 0;
    for(const x of cel){
      acum += x.vendas;
      x.acumulado = acum;
      /* Antes da primeira venda do SKU nao ha falta: o saldo negativo
         (R-EST-08) nao vira "atrasada" numa coluna em que o SKU nao vendeu
         nada (③ REVISAO, 07/11/2026). Ele entra na falta da primeira venda. */
      x.falta = acum > 0 ? Math.max(0, acum - livre) : 0;
      if(x.falta > 0 && faltaDesde == null){ faltaDesde = x.dia; faltaPrimeiro = x.falta; }
      total[x.dia].vendas += x.vendas; total[x.dia].falta += x.falta; total[x.dia].confirmar += x.confirmar;
    }
    linhas.push({ codigo:c, descricao:s.descricao, cor:s.cor, estoque, livre, em_caixa:emCaixa, total:totalSku,
      falta_total: cel.length ? cel[cel.length-1].falta : 0,
      falta_desde: faltaDesde, falta_desde_rotulo: faltaDesde==='atrasada' ? 'atrasada' : rotuloDia(faltaDesde),
      falta_primeiro: faltaPrimeiro, celulas:cel });
  }
  /* Pela data da PRIMEIRA falta ("atrasada" vem antes de toda data); quem nao
     falta vai embaixo. No mesmo dia, mais pecas faltando primeiro. */
  const chave = l => l.falta_desde == null ? '9999' : (l.falta_desde === 'atrasada' ? '0000' : l.falta_desde);
  linhas.sort((a,b)=> (chave(a) < chave(b) ? -1 : chave(a) > chave(b) ? 1 : 0) || b.falta_primeiro - a.falta_primeiro
    || b.falta_total - a.falta_total || a.codigo.localeCompare(b.codigo));
  const ordemAlfa = (a,b)=> a.codigo.localeCompare(b.codigo);
  sobMedida.sort(ordemAlfa); semCadastro.sort(ordemAlfa);
  return { hoje, dias: dias.map(d => ({ dia:d, rotulo: d==='atrasada' ? 'Atrasada' : rotuloDia(d) })),
           linhas, sob_medida:sobMedida, sem_cadastro:semCadastro, total, com_etiqueta: comEtiqueta(db) };
}

/* Quantas vendas que a planilha ainda mostra na fabrica ja tem etiqueta impressa
   no PCP — as que sairam da lista. A tela diz, para o total que cai ao longo do
   dia nao parecer sumir. */
function comEtiqueta(db){
  const Q = sql(db);
  if(!Q.ETQ) return { vendas:0, pecas:0 };
  try{ const r = db.prepare(`SELECT COUNT(*) v, COALESCE(SUM(${Q.PECA}),0) p FROM venda_futura WHERE ${Q.FUTURA} AND ${Q.ETQ}`).get();
    return { vendas:r.v, pecas:r.p }; }catch(e){ return { vendas:0, pecas:0 }; }
}

function calcular(db){
  const diasCob = cfgNum(db, 'dias_cobertura', 10);
  const janela  = cfgNum(db, 'janela_media', 30);
  const alvoMin = cfgNum(db, 'alvo_minimo', 2);
  /* FASE 3: a janela curta. O ritmo e o MAIOR entre a media da janela e a da
     janela curta — protege contra a falta quando o SKU acelera, e demora mais
     a baixar quando ele desacelera (o preco decidido, DECISOES 07/11/2026). */
  const curta   = cfgNum(db, 'janela_curta', 14);
  const ordemFalta = cfgNum(db, 'ordem_por_falta', 0) === 1;
  const hoje = db.prepare("SELECT date('now','localtime') d").get().d;
  const Q = sql(db), PECA = Q.PECA, FUTURA = Q.FUTURA;

  // --- media pela janela (em PECA) e demanda comprometida ---
  const mediaMap = vendasPorSku(db, janela), curtaMap = vendasPorSku(db, curta);
  const compMap = {};
  /* O COMPROMETIDO QUEBRADO POR PRAZO, em PECA, pela regua da §3-B (FUTURA).
     A atrasada conta em "ja" (despacha ate amanha): atraso e prazo vencido. */
  db.prepare(`SELECT UPPER(codigo) c,
      SUM(CASE WHEN data_envio <= date('now','localtime','+1 day') THEN ${PECA} ELSE 0 END) ja,
      SUM(CASE WHEN data_envio <  date('now','localtime') THEN ${PECA} ELSE 0 END) atrasada,
      SUM(CASE WHEN data_envio >  date('now','localtime','+1 day')
                AND data_envio <= date('now','localtime','+7 day') THEN ${PECA} ELSE 0 END) semana,
      SUM(CASE WHEN data_envio >  date('now','localtime','+7 day') THEN ${PECA} ELSE 0 END) depois,
      SUM(${PECA}) total
    FROM venda_futura
    WHERE ${FUTURA}${Q.ETQ ? ' AND NOT '+Q.ETQ : ''}
    GROUP BY UPPER(codigo)`).all().forEach(r=> compMap[r.c]=r);
  const reserva = reservadoPorSku(db);

  /* `sob_medida` vem junto porque muda a conta la embaixo: peca feita contra o
     pedido nao tem estoque para repor. Sem o JOIN ela cai no alvo minimo e pede
     producao para sempre. */
  const smap = {};
  db.prepare(`SELECT UPPER(s.codigo) c, s.descricao, s.cor, s.estoque, s.alvo,
      COALESCE(m.sob_medida,0) sob_medida
    FROM skus s LEFT JOIN modelo m ON m.id=s.modelo_id`).all().forEach(s=> smap[s.c]=s);

  /* A curva ABC da tabela `demanda` saiu daqui em 01/09/2026, junto com a tela
     /necessidade. Ela vinha lado a lado so para conferencia (Fase 1 do desenho),
     e a tabela que a alimentava era semeada uma vez no codigo e nunca mais
     atualizada — entao a comparacao passou a ser contra um numero congelado, o
     que e pior que nao comparar: da a impressao de que ha uma segunda opiniao. */

  /* FASE 4: a primeira falta de venda feita sai da MESMA conta da aba (R1). */
  const faltaVenda = {};
  if(ordemFalta) porDia(db).linhas.forEach(l => { if(l.falta_desde) faltaVenda[l.codigo] = l; });

  // --- uniao de todos os codigos vistos ---
  const cods = new Set();
  Object.keys(mediaMap).forEach(c=>cods.add(c));
  Object.keys(compMap).forEach(c=>cods.add(c));
  Object.keys(smap).forEach(c=>cods.add(c));

  const linhas = [];
  for(const c of cods){
    const s = smap[c];
    const estoque = s ? s.estoque : null;
    /* O LIVRE (saldo − peca em caixa com etiqueta): a venda com etiqueta saiu
       do comprometido, e a peca reservada a ela nao cobre outra venda. Sem
       caixa impressa o livre e o saldo, e a conta e a de sempre. O `estoque`
       devolvido continua sendo o SALDO (a aba Estoque, o custo e a cobertura
       leem o saldo); o que muda e o `precisa`. */
    const emCaixa = s ? (reserva[c] || 0) : 0;
    const livre = s ? (estoque || 0) - emCaixa : null;
    const nVendas = mediaMap[c] || 0;
    const media = janela>0 ? nVendas/janela : 0;
    const mediaCurta = curta>0 ? (curtaMap[c] || 0)/curta : 0;
    /* R10: o ritmo e o maior dos dois; quando a curta vence, a tela diz
       "subindo". */
    const ritmo = Math.max(media, mediaCurta);
    const subindo = mediaCurta > media;
    const cp = compMap[c] || null;
    const comprometido = cp ? cp.total : 0;
    /* SOB MEDIDA NAO TEM ALVO, E ISSO NAO E EXCECAO — E A DEFINICAO.
       A peca feita contra o pedido do cliente nao existe antes da venda e nao
       sobra depois (§7): ela nao soma +1 na embalagem nem baixa na etiqueta, e
       por isso o estoque dela e sempre zero. Com alvo, `precisa` daria
       `alvo - 0` todo dia: o SKU ficava eternamente na tela azul pedindo
       producao de peca que ninguem encomendou, e fila que nunca zera e fila que
       a equipe aprende a ignorar.
       O que ela precisa e o que foi VENDIDO — o comprometido, e so ele. */
    const alvo = (s && s.sob_medida) ? 0 : Math.max(alvoMin, Math.ceil(ritmo*diasCob));
    const precisa = Math.max(0, comprometido + alvo - (livre||0));
    /* COBERTURA: quantos DIAS o estoque atual aguenta a venda desse SKU, no
       RITMO (fase 3). E a metrica que ordena por risco, e nao por tamanho.
       Sem venda na janela nao ha cobertura a calcular: `null` e "nao da pra
       dizer", que e diferente de zero. */
    const cobertura = (ritmo > 0 && estoque != null) ? +(estoque/ritmo).toFixed(1) : null;

    /* A PRIORIDADE E UM DEGRAU COM NOME, NAO UMA NOTA.
       Uma pontuacao composta ordena bem e nao explica nada — e quem le a lista
       precisa saber POR QUE aquele SKU esta em cima, senao volta a produzir pela
       intuicao. Cada linha carrega o motivo que a colocou ali. */
    let prioridade = 0, motivo = null;
    if(precisa > 0){
      if(cp && cp.ja > 0){        prioridade = 1; motivo = 'despacha até amanhã'; }
      else if(!estoque){          prioridade = 2; motivo = 'sem estoque'; }
      else if(cobertura != null && cobertura < diasCob/2){
                                  prioridade = 3; motivo = 'cobre só ' + cobertura + ' dia(s)'; }
      else {                      prioridade = 4; motivo = 'abaixo do alvo'; }
    }

    /* FASE 4 — A DATA DA FALTA (R11). Venda feita: o primeiro dia de envio
       que o estoque nao cobre (exato). Reposicao: hoje + (estoque −
       comprometido) ÷ ritmo (estimado). Sem ritmo, sem data — vazia, nunca
       zero (R-REV-03). */
    let data_falta = null, falta_tipo = null, falta_pecas = 0;
    if(ordemFalta && precisa > 0 && s && !s.sob_medida){
      const fv = faltaVenda[c];
      if(fv){
        falta_tipo = 'venda'; falta_pecas = fv.falta_primeiro;
        data_falta = fv.falta_desde === 'atrasada' ? somaDias(hoje, -1) : fv.falta_desde;
        motivo = fv.falta_desde === 'atrasada'
          ? 'faltam ' + falta_pecas + ' atrasadas (vendidas)'
          : 'faltam ' + falta_pecas + ' para ' + rotuloDia(fv.falta_desde) + ' (vendidas)';
      } else {
        falta_tipo = 'reposicao'; falta_pecas = precisa;
        const livreDaVenda = (livre||0) - comprometido;
        const r1 = (+ritmo.toFixed(1)).toString().replace('.', ',');
        if(ritmo > 0){
          data_falta = somaDias(hoje, Math.max(0, Math.floor(livreDaVenda / ritmo)));
          motivo = data_falta === hoje ? 'acaba hoje pelo ritmo (' + r1 + '/dia)'
                 : 'acaba ' + rotuloDia(data_falta) + ' pelo ritmo (' + r1 + '/dia)';
        } else motivo = 'abaixo do alvo (sem venda na janela)';
      }
    }

    linhas.push({
      codigo:c, cadastrado:!!s,
      descricao: s?s.descricao:'', cor: s?s.cor:'',
      estoque, livre, em_caixa: emCaixa,
      vendas_janela:nVendas, media_dia:+media.toFixed(2),
      media_curta:+mediaCurta.toFixed(2), ritmo:+ritmo.toFixed(2), subindo,
      alvo, comprometido, precisa,
      comp_ja: cp?cp.ja:0, comp_atrasada: cp?cp.atrasada:0, comp_semana: cp?cp.semana:0, comp_depois: cp?cp.depois:0,
      cobertura, prioridade, motivo, data_falta, falta_tipo, falta_pecas
    });
  }
  if(ordemFalta){
    /* R11: a data mais cedo primeiro; no mesmo dia, venda feita antes de
       reposicao; no mesmo dia e tipo, mais pecas faltando primeiro. Quem nao
       precisa produzir cai para o fim; quem precisa sem data, logo antes. */
    const k = l => l.prioridade === 0 ? '~' : (l.data_falta || '}');
    const tipo = l => l.falta_tipo === 'venda' ? 0 : 1;
    const cmp = (x, y) => x < y ? -1 : (x > y ? 1 : 0);   // byte a byte: localeCompare poe '}' antes de '2'
    linhas.sort((a,b)=> cmp(k(a), k(b)) || tipo(a) - tipo(b)
      || b.falta_pecas - a.falta_pecas || b.precisa - a.precisa || a.codigo.localeCompare(b.codigo));
  } else {
  /* A ORDEM E A DA PRIORIDADE, NAO A DA QUANTIDADE.
     Ordenar por `precisa` poe em cima o SKU que gira mais, que quase nunca e o
     que vai faltar primeiro. A escada agora e: quem tem cliente com prazo curto,
     depois quem esta sem estoque, depois quem tem pouca cobertura. Dentro de
     cada degrau, quem tem menos folga vem antes. Quem nao precisa produzir
     (prioridade 0) cai para o fim — a tela esconde por padrao. */
  const ORD = l => l.prioridade === 0 ? 9 : l.prioridade;
  linhas.sort((a,b)=> ORD(a) - ORD(b)
    || b.comp_ja - a.comp_ja
    || ((a.cobertura==null?1e9:a.cobertura) - (b.cobertura==null?1e9:b.cobertura))
    || b.precisa - a.precisa
    || a.codigo.localeCompare(b.codigo));
  }

  return { config:{ dias_cobertura:diasCob, janela_media:janela, alvo_minimo:alvoMin,
                    janela_curta:curta, ordem_por_falta: ordemFalta ? 1 : 0 }, linhas };
}

/* FASE 2 — AS JANELAS SO PARA OLHAR (R9). A media de 7, 14, 30 e 45 dias por
   SKU, da MESMA fonte que a producao le (a planilha), e a tendencia 14 contra
   30. Nao grava nada na `config`. Janela maior que a historia da planilha e
   CORTADA no primeiro dia de venda que ela tem, e a tela diz (a #16). */
const JANELAS = [7, 14, 30, 45];
function janelas(db){
  const hoje = db.prepare("SELECT date('now','localtime') d").get().d;
  let primeiro = null;
  try{ primeiro = db.prepare("SELECT MIN(data_venda) d FROM venda_futura WHERE data_venda IS NOT NULL "+
    "AND COALESCE(cancelada,0)=0"+sql(db).TESTE).get().d; }catch(e){}
  const historia = primeiro
    ? db.prepare("SELECT CAST(julianday(?) - julianday(?) AS INTEGER) n").get(hoje, primeiro).n + 1 : 0;
  const cab = JANELAS.map(n => ({ dias:n, usada: primeiro ? Math.max(1, Math.min(n, historia)) : null,
                                  cortada: !!primeiro && historia < n }));
  const mapas = JANELAS.map(n => vendasPorSku(db, n));
  const cods = new Set(); mapas.forEach(m => Object.keys(m).forEach(c => cods.add(c)));
  const linhas = Array.from(cods).sort().map(c => {
    const medias = {};
    JANELAS.forEach((n, i) => {
      const u = cab[i].usada; const v = mapas[i][c] || 0;
      medias[n] = { vendas: v, media: u ? +(v / u).toFixed(2) : 0 };
    });
    const m14 = medias[14].media, m30 = medias[30].media;
    const tendencia = m14 > m30 * 1.1 ? 'sobe' : (m14 < m30 * 0.9 ? 'desce' : 'igual');
    return { codigo:c, medias, tendencia };
  });
  return { hoje, primeiro, historia_dias: historia, janelas: cab, linhas };
}

/* So o que a fabrica precisa produzir, e so de SKU que existe no cadastro.
   Venda de codigo desconhecido NAO vira compra de material: nao ha ficha para
   explodir, e chutar seria comprar material para uma peca que ninguem sabe
   fazer. Esses codigos ja aparecem em `desconhecidos` na tela de planejamento. */
function aProduzir(db){
  return calcular(db).linhas.filter(l => l.cadastrado && l.precisa > 0);
}

module.exports = { calcular, aProduzir, cfgNum, porDia, comEtiqueta, janelas, vendasPorSku, vendasTotal, rotuloDia, JANELAS,
  vendasPorDiaPeriodo, vendasPorMes, vendasPorSkuPeriodo, primeiraVenda };

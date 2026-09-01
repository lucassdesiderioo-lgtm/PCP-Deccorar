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
 *   precisa      = max(0, comprometido + alvo - estoque)
 * comprometido = vendas com data de envio futura (coluna Estado da planilha).
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

function calcular(db){
  const diasCob = cfgNum(db, 'dias_cobertura', 10);
  const janela  = cfgNum(db, 'janela_media', 30);
  const alvoMin = cfgNum(db, 'alvo_minimo', 2);

  // --- media pela janela e demanda comprometida ---
  const mediaMap = {}, compMap = {};
  db.prepare("SELECT UPPER(codigo) c, COUNT(*) n FROM venda_futura "+
    "WHERE data_venda IS NOT NULL AND COALESCE(cancelada,0)=0 "+
    "AND data_venda >= date('now','localtime','-'||?||' days') "+
    "GROUP BY UPPER(codigo)").all(janela).forEach(r=> mediaMap[r.c]=r.n);
  /* O COMPROMETIDO QUEBRADO POR PRAZO.
     O total continua sendo o mesmo — o WHERE nao mudou, entao `precisa` e a
     compra de material nao se mexem. O que entra e a REPARTICAO: duas pecas que
     despacham amanha e oito que despacham em tres semanas somavam 10 e a tela
     nao sabia dizer qual delas empurra a producao hoje. Quantidade nao e
     urgencia; prazo e. */
  db.prepare(`SELECT UPPER(codigo) c,
      SUM(CASE WHEN data_envio <= date('now','localtime','+1 day') THEN 1 ELSE 0 END) ja,
      SUM(CASE WHEN data_envio >  date('now','localtime','+1 day')
                AND data_envio <= date('now','localtime','+7 day') THEN 1 ELSE 0 END) semana,
      SUM(CASE WHEN data_envio >  date('now','localtime','+7 day') THEN 1 ELSE 0 END) depois,
      COUNT(*) total
    FROM venda_futura
    WHERE data_envio IS NOT NULL AND data_envio >= date('now','localtime')
    GROUP BY UPPER(codigo)`).all().forEach(r=> compMap[r.c]=r);

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

  // --- uniao de todos os codigos vistos ---
  const cods = new Set();
  Object.keys(mediaMap).forEach(c=>cods.add(c));
  Object.keys(compMap).forEach(c=>cods.add(c));
  Object.keys(smap).forEach(c=>cods.add(c));

  const linhas = [];
  for(const c of cods){
    const s = smap[c];
    const estoque = s ? s.estoque : null;
    const nVendas = mediaMap[c] || 0;
    const media = janela>0 ? nVendas/janela : 0;
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
    const alvo = (s && s.sob_medida) ? 0 : Math.max(alvoMin, Math.ceil(media*diasCob));
    const precisa = Math.max(0, comprometido + alvo - (estoque||0));
    /* COBERTURA: quantos DIAS o estoque atual aguenta a venda desse SKU.
       E a metrica que ordena por risco, e nao por tamanho. Um SKU que vende 6
       por dia com 3 em estoque tem meio dia de folga; outro que vende 0,2 por
       dia com 4 em estoque tem 20 dias — e o segundo aparece em cima quando se
       ordena por `precisa`, porque a quantidade que falta e maior.
       Sem venda na janela nao ha cobertura a calcular: `null` e "nao da pra
       dizer", que e diferente de zero. */
    const cobertura = (media > 0 && estoque != null) ? +(estoque/media).toFixed(1) : null;

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

    linhas.push({
      codigo:c, cadastrado:!!s,
      descricao: s?s.descricao:'', cor: s?s.cor:'',
      estoque,
      vendas_janela:nVendas, media_dia:+media.toFixed(2), alvo, comprometido, precisa,
      comp_ja: cp?cp.ja:0, comp_semana: cp?cp.semana:0, comp_depois: cp?cp.depois:0,
      cobertura, prioridade, motivo
    });
  }
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

  return { config:{ dias_cobertura:diasCob, janela_media:janela, alvo_minimo:alvoMin }, linhas };
}

/* So o que a fabrica precisa produzir, e so de SKU que existe no cadastro.
   Venda de codigo desconhecido NAO vira compra de material: nao ha ficha para
   explodir, e chutar seria comprar material para uma peca que ninguem sabe
   fazer. Esses codigos ja aparecem em `desconhecidos` na tela de planejamento. */
function aProduzir(db){
  return calcular(db).linhas.filter(l => l.cadastrado && l.precisa > 0);
}

module.exports = { calcular, aProduzir, cfgNum };

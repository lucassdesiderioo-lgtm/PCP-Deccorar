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
  db.prepare("SELECT UPPER(codigo) c, COUNT(*) n FROM venda_futura "+
    "WHERE data_envio IS NOT NULL AND data_envio >= date('now','localtime') "+
    "GROUP BY UPPER(codigo)").all().forEach(r=> compMap[r.c]=r.n);

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
    const comprometido = compMap[c] || 0;
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
    linhas.push({
      codigo:c, cadastrado:!!s,
      descricao: s?s.descricao:'', cor: s?s.cor:'',
      estoque,
      vendas_janela:nVendas, media_dia:+media.toFixed(2), alvo, comprometido, precisa
    });
  }
  /* Desempate por VENDAS NA JANELA — antes era o qtd30 da curva ABC, que sumiu
     com ela. Os dois respondem a mesma pergunta ("qual SKU gira mais"), so que
     este le venda de verdade em vez de uma foto antiga. */
  linhas.sort((a,b)=> b.precisa - a.precisa
    || b.vendas_janela - a.vendas_janela
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

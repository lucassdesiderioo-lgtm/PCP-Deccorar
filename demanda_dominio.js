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
  const diasCob     = cfgNum(db, 'dias_cobertura', 10);
  const janela      = cfgNum(db, 'janela_media', 30);
  const alvoMin     = cfgNum(db, 'alvo_minimo', 2);
  const diasColchao = cfgNum(db, 'dias_colchao', 10); // parametro do modelo ATUAL

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

/* So o que a fabrica precisa produzir, e so de SKU que existe no cadastro.
   Venda de codigo desconhecido NAO vira compra de material: nao ha ficha para
   explodir, e chutar seria comprar material para uma peca que ninguem sabe
   fazer. Esses codigos ja aparecem em `desconhecidos` na tela de planejamento. */
function aProduzir(db){
  return calcular(db).linhas.filter(l => l.cadastrado && l.precisa > 0);
}

module.exports = { calcular, aProduzir, cfgNum };

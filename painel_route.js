/* A TV DO CHAO DE FABRICA — o dia acontecendo, de 3 em 3 segundos.
 *
 * ⚠️ POR QUE ESTA TELA MUDOU EM 01/09/2026: ela tinha a QUARTA regua de
 * "quanto produzir".
 *
 * O `aProduzir` era `pedido + alvo - estoque`, com `pedido` = ordens lancadas
 * hoje e `alvo` = o `skus.alvo` GRAVADO. Isso somava duas perguntas diferentes
 * num numero so — o trabalho do dia e a reposicao de estoque — e media a
 * segunda contra uma foto que so muda quando alguem clica "Aplicar" no
 * Planejamento. Resultado: a TV podia pedir 8 enquanto a tela azul do operador
 * pedia 3, e ninguem tinha como ver de onde vinha a diferenca.
 *
 * Agora sao DUAS colunas, com nomes que nao se confundem:
 *
 *   FALTA HOJE = ordem_dia.a_produzir → as ordens de hoje que ainda pedem peca
 *   PRECISA    = demanda_dominio      → a MESMA conta da tela azul e da aba
 *                                       Estoque (comprometido + alvo - estoque)
 *
 * Elas nao se somam, e e por isso que estao separadas: a primeira e o que a
 * bancada tem na mao agora, a segunda e o que o estoque pede. Uma soma seria a
 * quinta regua.
 *
 * ⚠️ FALTA HOJE ERA `pedido - produzido` ATE 08/09/2026, e isso era a terceira
 * regua da MESMA pergunta que a tela vermelha faz (armadilha #20 do CLAUDE.md):
 * o tile contava revisao de qualquer modo, o aviso contava revisao modo 'hoje',
 * a TV contava embalagem de fila modo 'hoje'. No dia em que 4 pecas revisadas
 * na tela azul atenderam a venda, a TV cobrava 1 de um SKU cujas 5 etiquetas ja
 * tinham saido. Agora as tres leem o ordem_dia.js, e a TV ganha `atendidas` —
 * a ordem que ficou aberta com a venda ja fora do estoque — para dizer POR QUE
 * a falta e zero com o produzido abaixo do pedido.
 */
const DEMANDA = require('./demanda_dominio');
const ORDEM_DIA = require('./ordem_dia');
const BLOQ = require('./bloqueados');

module.exports = function(app, db){

  /* ⚠️ CACHE DE 20 s, E ELE E OBRIGATORIO AQUI. A tela recarrega a cada 3
     segundos e o `calcular` percorre a planilha de vendas e o catalogo inteiro.
     Sem isto, a TV ligada o dia todo faz esse trabalho 1.200 vezes por hora.
     O cache e LOCAL desta rota, e nao dentro do demanda_dominio, de proposito:
     quem grava alvo ou decide compra precisa do numero fresco, e um cache
     escondido no dominio entregaria dado velho para eles sem avisar. */
  let cache = null, cacheEm = 0;
  const CACHE_MS = 20000;
  function demanda(){
    const agora = Date.now();
    if(cache && (agora - cacheEm) < CACHE_MS) return cache;
    cache = DEMANDA.calcular(db).linhas;
    cacheEm = agora;
    return cache;
  }

  app.get('/api/painel', (req,res)=>{
    const skus = db.prepare('SELECT codigo, cor, estoque, alvo FROM skus ORDER BY codigo').all();
    const prod = db.prepare("SELECT codigo, COALESCE(SUM(qtd),0) pedido, COALESCE(SUM(produzido),0) produzido FROM producao WHERE data=date('now','localtime') GROUP BY codigo").all();
    const rev  = db.prepare("SELECT codigo, COUNT(*) revisadas FROM revisao WHERE data=date('now','localtime') GROUP BY codigo").all();
    let emb={}, car={};
    try{ db.prepare("SELECT UPPER(codigo) c, SUM(CASE WHEN estagio IN ('embalado','carregado') THEN 1 ELSE 0 END) emb, SUM(CASE WHEN estagio='carregado' THEN 1 ELSE 0 END) car FROM lote WHERE data=date('now','localtime') GROUP BY UPPER(codigo)").all().forEach(r=>{ emb[r.c]=r.emb; car[r.c]=r.car; }); }catch(e){}
    const pMap={}, rMap={}; prod.forEach(p=>pMap[p.codigo]=p); rev.forEach(r=>rMap[r.codigo]=r.revisadas);
    const oMap={}; ORDEM_DIA.linhas(db).forEach(o=> oMap[o.codigo]=o);

    const dMap={}; demanda().forEach(l=> dMap[l.codigo]=l);

    const linhas = skus.map(s=>{
      const p = pMap[s.codigo] || {pedido:0, produzido:0};
      const o = oMap[s.codigo] || {a_produzir:0, atendidas:0, pendentes:0};
      const U=s.codigo.toUpperCase();
      const d = dMap[U] || {alvo:0, precisa:0, comprometido:0};
      return { codigo:s.codigo, cor:s.cor||'', estoque:s.estoque||0,
        /* O alvo mostrado e o CALCULADO, igual ao da aba Estoque. O gravado
           continua no banco e nao aparece aqui: numero velho com cara de numero
           de hoje e o que faz a conta "quebrar" sem ninguem notar. */
        alvo:d.alvo, comprometido:d.comprometido,
        demanda:p.pedido, produzido:p.produzido||0, revisadas:rMap[s.codigo]||0,
        embalado:emb[U]||0, carregado:car[U]||0,
        faltaHoje: o.a_produzir,
        /* Ordem aberta cuja venda ja saiu do estoque (ou que o estoque cobre):
           nao e trabalho, e a TV escreve isso em vez de deixar o "produzido"
           abaixo do pedido sem explicacao. `pendentes` diz qual dos dois. */
        atendidas: o.atendidas, pendentesHoje: o.pendentes,
        precisa: d.precisa,
        /* `aProduzir` fica como apelido de `faltaHoje` para nao quebrar nenhum
           consumidor antigo desta rota. Nao use em tela nova. */
        aProduzir: o.a_produzir };
    });
    // produtividade do dia: quantas peças revisadas/embaladas e o tempo médio
    // (revisao/montagem trazem segundos e data). Calculado no servidor p/ usar
    // a data local do banco e nao depender do relogio do navegador.
    const rp = db.prepare("SELECT COUNT(*) q, ROUND(AVG(segundos)) t FROM revisao WHERE data=date('now','localtime')").get();
    const ep = db.prepare("SELECT COUNT(*) q, ROUND(AVG(segundos)) t FROM montagem WHERE data=date('now','localtime')").get();
    /* BLOQUEADOS na TV: e o numero que a fila nao mostra. Em 09/09/2026 a
       fila dizia 49 e o ML 50; a unidade estava retida e so a aba Bloqueados
       do admin sabia. A TV e lida de longe pelo gestor — se o numero e zero
       vira traco cinza, se nao e, e vermelho e ele vai olhar. Conta do
       bloqueados.js, dono unico, a mesma da Etiqueta de Venda. */
    const bloq = BLOQ.resumo(db);
    res.json({ linhas, prod:{ rev_qtd:rp.q||0, rev_tmedio:rp.t||0, emb_qtd:ep.q||0, emb_tmedio:ep.t||0 },
               bloqueados: bloq.total, bloqueados_hoje: bloq.hoje });
  });
};

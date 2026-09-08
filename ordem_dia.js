/* O DONO ÚNICO de "o que ainda falta das ORDENS DE HOJE" — a tela vermelha.
 *
 * Até 08/09/2026 essa pergunta tinha três respostas em três lugares:
 *
 *   tile da tela vermelha   qtd − revisões de hoje (QUALQUER modo)
 *   aviso de status         urgentes − revisões de hoje (modo 'hoje')
 *   producao.produzido      +1 a cada embalagem cuja linha da fila era modo 'hoje'
 *
 * Nesse dia o tile de BK150150BEGE dizia "revisão completa" (10 revisões pra 5
 * pedidas), o aviso dizia "4 peça(s) URGENTE(S) para hoje" e nenhum volume
 * estava pendente: as 140 etiquetas do dia já tinham saído. As 4 "pendentes"
 * eram peças revisadas na tela AZUL e embaladas como estoque — a venda saiu da
 * prateleira, mas a ordem, que só é abatida pela embalagem de fila modo 'hoje'
 * (mont_route.js), ficou aberta. Ninguém perdeu peça; a tela é que não sabia
 * dizer isso.
 *
 * ⚠️ A REGRA: ordem urgente existe por causa de um VOLUME sem estoque. Quando a
 * conta ao vivo do `urgencia.js` — a MESMA que o botão "Lançar urgentes" usa —
 * diz que aquele SKU não tem mais urgência, a ordem aberta não tem mais o que
 * produzir: ou o volume já foi embalado/carregado, ou o estoque cobre. Isso vira
 * `atendidas`, e a tela escreve "saiu do estoque" em vez de cobrar produção.
 *
 * `falta` continua sendo por revisão modo 'hoje': é a régua do aviso de status
 * desde sempre, e a tela vermelha é a tela de REVISÃO — a revisão azul é
 * produção pra estoque por definição (§3), não abate pedido. A embalagem em
 * modo estoque também não (§4), e é esse o caminho pelo qual a ordem fica aberta.
 *
 * Só ordem URGENTE (urgente=1, vinda do PDF) tem venda atrás para comparar. A
 * ordem manual é produção sem venda (§5): nela `atendidas` é sempre zero.
 */
const URGENCIA = require('./urgencia');

function linhas(db){
  const ordens = db.prepare(`SELECT p.codigo, s.descricao, s.cor, SUM(p.qtd) qtd,
      SUM(p.produzido) produzido,
      SUM(CASE WHEN p.urgente=1 THEN p.qtd ELSE 0 END) qtd_urgente
    FROM producao p LEFT JOIN skus s ON s.codigo=p.codigo
    WHERE p.data=date('now','localtime') GROUP BY p.codigo`).all();

  const rev = {};
  db.prepare(`SELECT codigo, COUNT(*) n FROM revisao
    WHERE data=date('now','localtime') AND modo='hoje' GROUP BY codigo`).all()
    .forEach(r => { rev[r.codigo] = r.n; });

  const urg = {};
  URGENCIA.calcular(db).forEach(u => { urg[u.codigo] = u; });

  return ordens.map(o => {
    const revisadas = rev[o.codigo] || 0;
    const falta = Math.max(0, o.qtd - revisadas);
    const u = urg[o.codigo] || { pendentes:0, estoque:null, urgente:0 };
    /* Da falta, só a parte urgente tem volume para comparar. O que a conta ao
       vivo ainda pede (u.urgente) é trabalho de verdade; o resto foi atendido
       por outro caminho. */
    const faltaUrg = Math.min(falta, o.qtd_urgente || 0);
    const atendidas = Math.max(0, faltaUrg - u.urgente);
    return {
      codigo: o.codigo, descricao: o.descricao, cor: o.cor,
      qtd: o.qtd, produzido: o.produzido, qtd_urgente: o.qtd_urgente,
      revisadas, falta,
      urgente_agora: u.urgente,
      pendentes: u.pendentes,        // volumes do SKU ainda sem etiqueta hoje
      atendidas,                     // ordem aberta cuja venda já saiu do estoque
      a_produzir: falta - atendidas, // o que a bancada ainda tem que fazer
      urgentes_falta: faltaUrg - atendidas, // só a parte urgente do a_produzir
    };
  }).sort((a, b) => (b.a_produzir - a.a_produzir) || (b.falta - a.falta) || a.codigo.localeCompare(b.codigo));
}

function resumo(db){
  const l = linhas(db);
  const r = { urgentes:0, reposicao:0, falta:0, atendidas:0, a_produzir:0, urgentesFalta:0 };
  for(const x of l){
    r.urgentes += x.qtd_urgente;
    r.reposicao += x.qtd - x.qtd_urgente;
    r.falta += x.falta;
    r.atendidas += x.atendidas;
    r.a_produzir += x.a_produzir;
    r.urgentesFalta += x.urgentes_falta;
  }
  return r;
}

module.exports = { linhas, resumo };

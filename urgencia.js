/* O DONO ÚNICO de "quanto falta PRODUZIR do que o PDF trouxe hoje".
 *
 * A conta morava dentro do `cruz_route.js` e o `rastrear.js --lote` tinha uma
 * cópia dela — cópia que contava volumes com `+1` por linha. No dia em que o
 * cruzamento passou a contar PEÇAS (dívida 11 do §14), a ferramenta de
 * diagnóstico continuaria dizendo o número velho: e uma ferramenta de
 * diagnóstico com régua própria é pior que nenhuma, porque confirma com
 * autoridade um número que a tela não usa. Mesmo motivo do `fila_dia.js`.
 *
 * ⚠️ CONTA PEÇAS, NÃO VOLUMES. O item da folha que diz "Quantidade: 3" tem UMA
 * etiqueta e vira UM volume — o parse está certo em gravar uma linha só
 * (armadilha #8). Mas a fábrica precisa das TRÊS persianas. Contando volumes,
 * aquele envio virava 1 ordem urgente: a bancada produzia 1, o cliente tinha
 * comprado 3, e a conta fechava com ela mesma porque a tela também mostrava 1.
 *
 * `COALESCE(pecas,1)`: volume gravado antes da coluna existir vale uma peça —
 * exatamente o que o sistema assumia até aqui. O passivo não muda de número.
 *
 * O que NÃO entra: volume já embalado (não é mais trabalho de produção) e
 * volume `bloqueado` (ninguém sabe ainda qual peça é — §6 e §5).
 */

function calcular(db, data){
  const pend = db.prepare(`SELECT codigo, COUNT(*) volumes,
      SUM(COALESCE(pecas,1)) qtd FROM lote
    WHERE data = COALESCE(?, date('now','localtime'))
      AND codigo IS NOT NULL AND estagio='pendente'
    GROUP BY codigo ORDER BY codigo`).all(data || null);

  const emap = {};
  db.prepare('SELECT codigo,estoque FROM skus').all()
    .forEach(s => { emap[s.codigo] = s.estoque; });

  return pend.map(v => {
    const estoque = emap[v.codigo] || 0;
    /* Quem já tem peça pronta sai direto para a Etiqueta de Venda, sem ordem de
       produção: a tela vermelha mostra o que falta PRODUZIR, nunca o que falta
       EXPEDIR. */
    const urgente = Math.max(0, v.qtd - estoque);
    return { codigo:v.codigo, pendentes:v.qtd, volumes:v.volumes, estoque, urgente,
             cobertos: v.qtd - urgente };
  });
}

module.exports = { calcular };

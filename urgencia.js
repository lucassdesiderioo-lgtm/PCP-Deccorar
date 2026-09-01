/* O DONO ÚNICO de "quanto falta PRODUZIR do que o PDF trouxe hoje".
 *
 * ⚠️ A CONTA É POR ETIQUETA, E ISSO É A REGRA DO NEGÓCIO, NÃO UM ATALHO:
 * **uma venda = uma etiqueta = uma persiana** (§2). Não se junta etiqueta,
 * pacote nem caixa. Cada peça vendida tem o seu volume, então contar linhas de
 * `lote` É contar peças — não existe volume que leve duas.
 *
 * Se um dia alguém for tentado a multiplicar isto por uma "quantidade", pare:
 * essa tentativa já foi feita em 01/09/2026 e foi revertida no mesmo dia. O
 * campo `Quantidade` da folha de controle não multiplica volume nenhum aqui.
 *
 * POR QUE É UM MÓDULO, e não uma função dentro do `cruz_route`: o
 * `rastrear.js --lote` faz a MESMA pergunta para explicar a escada do PDF até a
 * tela, e tinha uma cópia da conta. Ferramenta de diagnóstico com régua própria
 * é pior que nenhuma — ela confirma com autoridade um número que a tela não
 * usa. Mesmo motivo do `fila_dia.js` e do `carga.js`.
 *
 * O que NÃO entra: volume já embalado (não é mais trabalho de produção) e
 * volume `bloqueado` (ninguém sabe ainda qual peça é — §5 e §6).
 */

function calcular(db, data){
  const pend = db.prepare(`SELECT codigo, COUNT(*) qtd FROM lote
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
    return { codigo:v.codigo, pendentes:v.qtd, estoque, urgente,
             cobertos: v.qtd - urgente };
  });
}

module.exports = { calcular };

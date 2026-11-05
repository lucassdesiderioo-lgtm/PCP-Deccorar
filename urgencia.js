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

  /* O LIVRE, e nao o saldo (CONFERENCIA-E-BAIXA, fase 2-A, 22/10/2026): a peca
     que ja esta numa caixa impressa continua no saldo ate a conferencia, mas
     tem dono. Contada aqui, a venda pendente parecia coberta por ela e nao
     virava urgente. */
  const resv = require('./baixa_dominio').reservados(db);
  const emap = {};
  db.prepare('SELECT codigo,estoque FROM skus').all()
    .forEach(s => { emap[s.codigo] = (s.estoque || 0) - (resv[String(s.codigo).toUpperCase()] || 0); });

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

/* APLICAR: a urgência vira ordem do dia (`producao`, origem 'ml', urgente).
   Desde a spec PRODUCAO-SO-DO-PDF (05/11/2026) roda SOZINHO no fim de cada
   upload (R-PRD-01); até ali dependia de um Admin clicar "Lançar N urgentes",
   e quem é Operação, que sobe o PDF, nem via o botão.
   É idempotente (R-URG-02, R-PRD-02): apaga as ordens 'ml' do dia e refaz as
   urgentes pela conta de agora, que já desconta o produzido e o expedido —
   reaplicar não infla. A ordem manual antiga (origem vazia ou 'manual') não se
   toca. O domínio não abre transação; quem chama abre (R-EST-07). */
function aplicar(db){
  const linhas = calcular(db);
  let urgentes = 0;
  db.prepare("DELETE FROM producao WHERE data=date('now','localtime') AND origem='ml'").run();
  const ins = db.prepare("INSERT INTO producao (codigo,qtd,origem,urgente) VALUES (?,?,'ml',1)");
  for(const l of linhas){ if(l.urgente > 0){ ins.run(l.codigo, l.urgente); urgentes += l.urgente; } }
  return { urgentes, linhas };
}

module.exports = { calcular, aplicar };

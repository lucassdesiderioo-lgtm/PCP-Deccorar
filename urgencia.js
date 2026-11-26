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

/* ⚠️ A URGÊNCIA É A PRIORIDADE ATÉ A PRÓXIMA SAÍDA, E NÃO O PDF DO DIA
   (spec PRIORIDADE-PROXIMA-SAIDA, decisão do dono de 26/11/2026). Até ali ela
   contava só o volume subido HOJE (`lote.data`): o PDF de amanhã subido às 18h
   entrava, mas na manhã seguinte ele era "de ontem" e sumia da urgência — e o
   atrasado de outro dia nunca entrava. Hoje é a régua do `prioridade_dia.js`:
   toda venda sem etiqueta que vence até a próxima saída, qualquer que seja o
   dia do upload.
   `data` explícito (o `rastrear.js`, que explica o que UM PDF gerou) continua
   pela régua antiga: é a pergunta dele. */
/* Banco sem `despachar_em` (um teste de antes da coluna): sem data lida, toda
   venda é urgente — é o que a régua diz da venda sem data. */
function pendentesPrioridade(db){
  const P = require('./prioridade_dia');
  try{
    return db.prepare(`SELECT codigo, COUNT(*) qtd FROM lote WHERE ${P.regua('', P.proximaSaida(db))}
      GROUP BY codigo ORDER BY codigo`).all();
  }catch(e){
    if(!/no such column: despachar_em/.test(e.message)) throw e;
    return db.prepare(`SELECT codigo, COUNT(*) qtd FROM lote WHERE codigo IS NOT NULL AND estagio='pendente'
      GROUP BY codigo ORDER BY codigo`).all();
  }
}

function calcular(db, data){
  const pend = data
    ? db.prepare(`SELECT codigo, COUNT(*) qtd FROM lote
        WHERE data = ? AND codigo IS NOT NULL AND estagio='pendente'
        GROUP BY codigo ORDER BY codigo`).all(data)
    : pendentesPrioridade(db);

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
  marcarDia(db);
  return { urgentes, linhas };
}

/* A URGÊNCIA SE REFAZ SOZINHA NA VIRADA DO DIA (R-PRI-03). Até aqui ela só se
   refazia no upload, e de manhã, sem PDF novo, a ordem do dia nascia vazia —
   com as vendas de hoje (subidas ontem à noite) sem peça. A primeira leitura
   do dia (101, 102, TV, aviso de status) aplica uma vez, sem cron, como a
   lista do Inventário. Idempotente (R-URG-02).
   ⚠️ Só aplica quando NINGUÉM aplicou hoje, não há ordem do PDF de hoje e hoje
   é dia de coleta: a ordem gravada de hoje nunca é refeita por uma leitura. */
function marcarDia(db){
  try{ db.prepare("INSERT INTO config (chave,valor) VALUES ('urgencia_dia', date('now','localtime')) ON CONFLICT(chave) DO UPDATE SET valor=excluded.valor").run(); }
  catch(e){
    /* Sem a marca, a próxima leitura aplicaria de novo (③ REVISÃO): o log diz. */
    if(!/no such table/.test(e.message)) console.error('[urgencia] não consegui marcar o dia aplicado:', e.message);
  }
}
/* A urgência de hoje foi aplicada (pelo upload ou pela virada)? A 101 só põe a
   prioridade em Hoje quando sim: sem a ordem do dia, a venda da próxima saída
   ficaria fora de Hoje E dos Próximos dias (③ REVISÃO, rodada 2). */
function aplicadaHoje(db){
  try{
    const c = db.prepare("SELECT valor FROM config WHERE chave='urgencia_dia'").get();
    if(c && c.valor === db.prepare("SELECT date('now','localtime') d").get().d) return true;
    return !!db.prepare("SELECT 1 FROM producao WHERE data=date('now','localtime') AND origem='ml' LIMIT 1").get();
  }catch(e){ return false; }
}
function garantirDia(db){
  try{
    const h = db.prepare("SELECT date('now','localtime') d").get().d;
    const c = db.prepare("SELECT valor FROM config WHERE chave='urgencia_dia'").get();
    if(c && c.valor === h) return false;
    /* ⚠️ SÓ NO DIA DE COLETA (③ REVISÃO): no sábado, no domingo e no "sem
       coleta" da 206 a leitura não lança — com a TV ligada, a venda de segunda
       virava falta de sábado e de domingo na 904. O upload continua aplicando. */
    if(!require('./prioridade_dia').ehDiaDeColeta(db, h)) return false;
    const tem = db.prepare("SELECT 1 FROM producao WHERE data=date('now','localtime') AND origem='ml' LIMIT 1").get();
    if(tem){ marcarDia(db); return false; }
    const fn = () => aplicar(db);
    if(db.inTransaction) fn(); else db.transaction(fn)();
    return true;
  }catch(e){
    /* Banco sem `config` ou sem `producao` (um script, um teste): a leitura
       segue sem a virada, e o log diz. */
    if(!/no such table/.test(e.message)) console.error('[urgencia] não consegui refazer a urgência do dia:', e.message);
    return false;
  }
}

/* A FALTA DE ESTOQUE NO RELATORIO (RELATORIOS-UNIFICADOS, 08/11/2026): as
   pecas que a urgencia do PDF mandava produzir em cada dia. ⚠️ E O RETRATO DO
   ULTIMO PDF DO DIA, e nao a soma do dia: o `aplicar` apaga as ordens `ml` de
   hoje e refaz pela conta de agora (R-URG-02), entao a urgencia da manha que
   a fabrica ja resolveu antes do PDF da tarde nao aparece. A tela diz isso. */
function porDia(db, de, ate){
  const m = {};
  db.prepare("SELECT data d, SUM(qtd) q FROM producao WHERE origem='ml' AND urgente=1 AND COALESCE(teste,0)=0 "+
    "AND data BETWEEN ? AND ? GROUP BY data").all(de, ate).forEach(r => m[r.d] = r.q);
  return m;
}
function porSku(db, de, ate){
  return db.prepare("SELECT UPPER(codigo) codigo, SUM(qtd) pecas, COUNT(DISTINCT data) dias FROM producao "+
    "WHERE origem='ml' AND urgente=1 AND COALESCE(teste,0)=0 AND data BETWEEN ? AND ? "+
    "GROUP BY UPPER(codigo) ORDER BY pecas DESC, codigo").all(de, ate);
}
function primeira(db){
  try{ return db.prepare("SELECT MIN(data) d FROM producao WHERE origem='ml' AND urgente=1 AND COALESCE(teste,0)=0").get().d || null; }catch(e){ return null; }
}

module.exports = { calcular, aplicar, garantirDia, aplicadaHoje, porDia, porSku, primeira };

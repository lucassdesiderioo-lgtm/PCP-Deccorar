/* ENTROU e SAIU do estoque de pecas — a regua unica dos dois movimentos.
 *
 * `skus.estoque` tem varios donos (§14: a embalagem soma +1, a etiqueta de
 * venda baixa -1, a contagem substitui, o ajuste manual corrige), e por isso a
 * HISTORIA do saldo nao se reconstroi da coluna: ela guarda o numero de agora,
 * nao como ele chegou ali. O que da pra reconstruir sao os dois movimentos que
 * respondem pela producao e pela venda:
 *
 *   ENTROU = pecas embaladas               (tabela `montagem`, o +1 do §4)
 *   SAIU   = caixas que baixaram do estoque (`lote.baixado_em`, o -1 do §2)
 *
 * A conta ja existia dentro do `/api/fechamento` (plan_route.js). Quando o
 * painel da aba Estoque passou a mostrar o MESMO movimento em serie de 30 dias,
 * copiar a regua daria dois graficos da mesma coisa discordando no primeiro
 * filtro que mudasse de um lado so — e um grafico com regua propria e pior que
 * nenhum, porque confirma com autoridade um numero que a outra tela nao usa.
 * Entao a conta saiu de dentro do route.
 *
 * O QUE NAO ESTA AQUI, DE PROPOSITO: o ajuste manual e a contagem. Os dois
 * mexem no saldo e nenhum dos dois e producao nem venda; somados as barras, o
 * grafico deixaria de responder "quanto a fabrica fez e quanto saiu do estoque"
 * e passaria a responder "quanto a coluna variou", que ninguem perguntou. Eles
 * aparecem no painel com numero proprio (ajustes nos ultimos 30 dias).
 *
 * A SOBRA E A TERCEIRA BARRA, "VOLTOU" (22/10/2026, decisao do dono). A caixa
 * que sobrou na fabrica volta pelo ↩ Sobrou e grava `sobra` no livro, +1 por
 * PECA. Ela fica separada do ENTROU (nao e producao) e NAO reescreve o SAIU: a
 * caixa saiu no dia da baixa e voltou no dia da sobra. O fechamento diario
 * continua gravando `variou = entrou - saiu`; a sobra so aparece ao lado.
 *
 * `teste=0` em tudo: peca de teste nao e producao (§11).
 */

/* O -1 e a BAIXA, e desde 22/10/2026 ela e na conferencia (spec
   CONFERENCIA-E-BAIXA, fase 2-A): conta `baixado_em`, e nao mais
   `embalado_em` (a hora da impressao). A virada deu a toda caixa impressa antes
   do deploy `baixado_em = embalado_em`, entao os dias de antes nao mudam. O
   try/catch cobre banco antigo sem a coluna, do mesmo jeito que o fechamento. */
function saidasDoDia(db){
  try{
    return db.prepare("SELECT COUNT(*) n FROM lote "+
      "WHERE baixado_em IS NOT NULL AND date(baixado_em)=date('now','localtime') "+
      "AND COALESCE(teste,0)=0").get().n;
  }catch(e){ return 0; }
}

/* As pecas que voltaram pelo ↩ Sobrou, por dia: SOMA do delta (a caixa de
   duas persianas devolve 2), nunca contagem de linhas. Banco sem o livro
   devolve vazio. */
function sobrasPorDia(db, desde){
  try{
    return db.prepare("SELECT data d, COALESCE(SUM(delta),0) q FROM movimento_estoque "+
      "WHERE tipo='sobra' AND data >= ? AND COALESCE(teste,0)=0 GROUP BY data").all(desde);
  }catch(e){ return []; }
}

/* Os movimentos de hoje. O fechamento diario grava entrou, saiu e variou; o
   `voltou` vai ao lado e nao entra no variou (ver o topo). */
function doDia(db){
  const entrou = db.prepare("SELECT COUNT(*) n FROM montagem "+
    "WHERE data=date('now','localtime') AND COALESCE(teste,0)=0").get().n;
  const saiu = saidasDoDia(db);
  const hoje = db.prepare("SELECT date('now','localtime') d").get().d;
  const v = sobrasPorDia(db, hoje).find(r => r.d === hoje);
  return { entrou, saiu, variou: entrou - saiu, voltou: v ? v.q : 0 };
}

/* Os ultimos `dias` dias, um por linha, do mais antigo ao mais novo.
 *
 * Dia sem movimento entra como ZERO, nunca ausente: buraco no grafico se le
 * como "nao sei", e aqui a resposta e "nao houve" — sao coisas diferentes, e a
 * segunda e informacao. */
function serie(db, dias){
  const n = Math.max(1, Math.min(365, Math.trunc(+dias) || 30));
  const ent = {}, sai = {}, vol = {};
  db.prepare("SELECT data d, COUNT(*) q FROM montagem "+
    "WHERE data >= date('now','localtime','-'||?||' days') AND COALESCE(teste,0)=0 "+
    "GROUP BY data").all(n-1).forEach(r => ent[r.d] = r.q);
  try{
    db.prepare("SELECT date(baixado_em) d, COUNT(*) q FROM lote "+
      "WHERE baixado_em IS NOT NULL "+
      "AND date(baixado_em) >= date('now','localtime','-'||?||' days') "+
      "AND COALESCE(teste,0)=0 GROUP BY date(baixado_em)").all(n-1)
      .forEach(r => sai[r.d] = r.q);
  }catch(e){}
  const desde = db.prepare("SELECT date('now','localtime','-'||?||' days') d").get(n-1).d;
  sobrasPorDia(db, desde).forEach(r => vol[r.d] = r.q);

  /* As datas saem do proprio SQLite ('now','localtime') e nao do relogio do
     Node: e o mesmo fuso que gravou as linhas, e nenhum dia se desloca. */
  const hoje = db.prepare("SELECT date('now','localtime') d").get().d;
  const base = new Date(hoje + 'T00:00:00');
  const out = [];
  for(let i = n-1; i >= 0; i--){
    const dt = new Date(base.getTime());
    dt.setDate(dt.getDate() - i);
    const k = dt.getFullYear() + '-' +
      String(dt.getMonth()+1).padStart(2,'0') + '-' +
      String(dt.getDate()).padStart(2,'0');
    out.push({ data:k, entrou: ent[k]||0, saiu: sai[k]||0, voltou: vol[k]||0 });
  }
  return out;
}

/* COBERTURA: quantos dias o estoque de hoje aguenta no ritmo de venda da
 * janela. E o numero que decide, e nao o saldo bruto: 40 pecas de um SKU que
 * vende 1 por semana e excesso; 40 de um que vende 10 por dia e falta.
 *
 * Le `venda_futura` (a planilha do ML, §3), a mesma fonte da media do
 * planejamento — nunca a producao, que e o que a fabrica fez e nao o que o
 * cliente levou. */
function cobertura(db, janela){
  const j = Math.max(1, Math.trunc(+janela) || 30);
  const estoque_total = db.prepare("SELECT COALESCE(SUM(estoque),0) t FROM skus").get().t;
  let vendas_janela = 0;
  try{
    vendas_janela = db.prepare("SELECT COUNT(*) n FROM venda_futura "+
      "WHERE data_venda IS NOT NULL AND COALESCE(cancelada,0)=0 "+
      "AND data_venda >= date('now','localtime','-'||?||' days') "+
      "AND COALESCE(teste,0)=0").get(j).n;
  }catch(e){}
  const media_dia_total = vendas_janela / j;
  /* Sem venda na janela a cobertura e NULL, nunca infinito nem zero: os dois
     seriam numeros, e numero errado numa tela e pior que traco. */
  const cobertura_dias = media_dia_total > 0
    ? +(estoque_total / media_dia_total).toFixed(1) : null;
  return { janela:j, estoque_total, vendas_janela,
           media_dia_total:+media_dia_total.toFixed(2), cobertura_dias };
}

module.exports = { doDia, serie, cobertura, saidasDoDia };

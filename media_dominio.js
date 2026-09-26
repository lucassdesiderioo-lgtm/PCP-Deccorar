/* QUANTO VENDE POR DIA, contado pelo SISTEMA — VENDAS-E-MEDIA, fase 1.
 *
 * Dono unico desta conta. A media de hoje sai da planilha do ML, e a planilha
 * e espelho: um recorte apaga os 30 dias de historia e a tela azul para de
 * pedir producao sem erro nenhum (armadilha #11 do CLAUDE.md). Mas toda venda
 * do ML ja passa pelo PDF que a expedicao sobe todo dia — a historia esta em
 * `lote`, e nao depende de ninguem lembrar de subir nada.
 *
 * NESTA FASE ELA SO APARECE AO LADO DA PLANILHA, para conferencia. Quem decide
 * a producao continua sendo o `demanda_dominio`, lendo a planilha. A troca
 * (fase 3) espera o ok do dono depois de conferir a tabela por alguns dias.
 *
 * As regras (spec §4.1):
 *   - conta PECA, nao caixa: volume com `lote_item` soma o `qtd` de cada SKU
 *     (a caixa de varias persianas, armadilha #23); volume sem `lote_item`
 *     conta 1 do `lote.codigo` (uma venda = uma etiqueta = uma persiana, §5);
 *   - modo teste fica fora; volume cancelado fica fora (a coluna so nasce na
 *     fase 2 — ate la a conta roda sem ela);
 *   - BLOQUEADO CONTA: e venda. O bloqueio e duvida de leitura, nao de existencia;
 *   - a data e `lote.data`, o dia em que o PDF entrou;
 *   - a janela e a MESMA da planilha (`data >= hoje - N dias`, dividido por N),
 *     senao a diferenca da tabela seria so a borda da janela;
 *   - janela maior que a historia e CORTADA no primeiro volume e dita: dividir
 *     12 dias de venda por 30 da um numero 2,5x menor com cara de fato (a
 *     armadilha #16 do sob medida, a mesma doenca).
 *
 * ⚠️ PDF REPETIDO NAO DOBRA. Quem garante isso na entrada e a dedup do upload
 * (#5), que olha o historico inteiro desde 25/08/2026. Antes disso ela olhava
 * so o dia, e sobraram volumes repetidos no banco — por isso a conta agrupa
 * pela identidade do volume (pack, ou venda) e fica com o MAIS ANTIGO, que e
 * quem carrega a historia (a regra do limpar_fantasmas.js). A resposta diz
 * quantos descartou, em vez de calar.
 */

function colunasDe(db, tabela){
  try{ return db.prepare("PRAGMA table_info(" + tabela + ")").all().map(c => c.name); }
  catch(e){ return []; }
}

function mediaPorSku(db, opts){
  const pedida = Math.max(1, Math.trunc(+((opts && opts.janela) || 30)) || 30);
  const hoje  = db.prepare("SELECT date('now','localtime') d").get().d;
  const desde = db.prepare("SELECT date('now','localtime','-'||?||' days') d").get(pedida).d;

  const temCancelada = colunasDe(db, 'lote').indexOf('cancelada_em') >= 0;
  const vivo = "COALESCE(teste,0)=0" + (temCancelada ? " AND cancelada_em IS NULL" : "");

  // O primeiro volume registrado e o chao da janela.
  let primeiro = null;
  try{ primeiro = db.prepare("SELECT MIN(data) d FROM lote WHERE data IS NOT NULL AND " + vivo).get().d; }catch(e){}

  const janela = { pedida, usada: null, cortada: false, desde, primeiro, hoje };
  const skus = {};
  if(!primeiro) return { janela, skus, repetidos: 0, sem_codigo: 0, volumes: 0 };

  const historia = db.prepare("SELECT CAST(julianday(?) - julianday(?) AS INTEGER) n").get(hoje, primeiro).n;
  janela.usada = Math.max(1, Math.min(pedida, historia));
  janela.cortada = janela.usada < pedida;

  /* Um volume por identidade, o mais antigo. Pack ID e Venda sao numeros do ML
     que nunca se repetem entre vendas (#5); sem nenhum dos dois, o volume e ele
     mesmo. */
  const vols = db.prepare(`
    SELECT id, UPPER(TRIM(COALESCE(codigo,''))) codigo,
           COALESCE(NULLIF(TRIM(packId),''), 'v:'||NULLIF(TRIM(venda),''), 'id:'||id) ident
    FROM lote
    WHERE ${vivo} AND data >= ? AND data <= ?
    ORDER BY id`).all(desde, hoje);

  const itens = {};
  if(vols.length){
    db.prepare(`SELECT li.lote_id, UPPER(TRIM(COALESCE(li.codigo,''))) codigo, COALESCE(li.qtd,1) qtd
      FROM lote_item li JOIN lote l ON l.id=li.lote_id
      WHERE COALESCE(l.teste,0)=0 AND l.data >= ? AND l.data <= ?`).all(desde, hoje)
      .forEach(r => { (itens[r.lote_id] = itens[r.lote_id] || []).push(r); });
  }

  /* A identidade repetida PRECISA olhar antes da janela: o volume original pode
     ter entrado no dia 31 e a copia no dia 29, e a copia nao e venda nova. */
  const jaVisto = new Set();
  try{
    db.prepare(`SELECT COALESCE(NULLIF(TRIM(packId),''), 'v:'||NULLIF(TRIM(venda),''), 'id:'||id) ident
      FROM lote WHERE ${vivo} AND data < ?`).all(desde).forEach(r => jaVisto.add(r.ident));
  }catch(e){}

  let repetidos = 0, semCodigo = 0, volumes = 0;
  const soma = (cod, n, volId) => {
    const s = skus[cod] = skus[cod] || { pecas: 0, volumes: 0, media: 0, _v: new Set() };
    s.pecas += n;
    if(!s._v.has(volId)){ s._v.add(volId); s.volumes++; }
  };
  for(const v of vols){
    if(jaVisto.has(v.ident)){ repetidos++; continue; }
    jaVisto.add(v.ident);
    const lis = (itens[v.id] || []).filter(i => i.codigo);
    if(lis.length){
      volumes++;
      lis.forEach(i => soma(i.codigo, Math.max(0, i.qtd), v.id));
    } else if(v.codigo){
      volumes++;
      soma(v.codigo, 1, v.id);
    } else {
      semCodigo++;
    }
  }
  Object.keys(skus).forEach(c => { delete skus[c]._v; skus[c].media = skus[c].pecas / janela.usada; });
  return { janela, skus, repetidos, sem_codigo: semCodigo, volumes };
}

/* PLANILHA x SISTEMA, por SKU. A coluna da planilha vem das linhas do
   `demanda_dominio` — a mesma conta que a tela azul le —, e nunca de uma
   consulta propria: conferir contra um numero que a producao nao usa
   confirmaria com autoridade o que ninguem le (armadilha #12). Por isso as
   linhas entram por parametro, em vez de este arquivo chamar o dominio: na
   fase 3 e o `demanda_dominio` que vai ler DAQUI, e a volta fecharia um ciclo. */
function comparar(db, linhasDemanda, opts){
  const s = mediaPorSku(db, opts);
  const plan = {};
  (linhasDemanda || []).forEach(l => {
    if(l.vendas_janela > 0) plan[l.codigo] = { vendas: l.vendas_janela, media: l.media_dia };
  });
  const cods = new Set(Object.keys(plan).concat(Object.keys(s.skus)));
  const r2 = x => Math.round(x * 100) / 100;
  const linhas = Array.from(cods).map(c => {
    const p = plan[c] || { vendas: 0, media: 0 };
    const q = s.skus[c] || { pecas: 0, volumes: 0, media: 0 };
    return {
      codigo: c,
      planilha: { vendas: p.vendas, media: p.media },
      sistema:  { pecas: q.pecas, volumes: q.volumes, media: r2(q.media) },
      diferenca: r2(q.media - p.media)
    };
  }).sort((a, b) => Math.abs(b.diferenca) - Math.abs(a.diferenca) || a.codigo.localeCompare(b.codigo));

  const somaP = linhas.reduce((t, l) => t + l.planilha.vendas, 0);
  const somaS = linhas.reduce((t, l) => t + l.sistema.pecas, 0);
  return {
    janela: s.janela, repetidos: s.repetidos, sem_codigo: s.sem_codigo, volumes: s.volumes,
    totais: {
      planilha_vendas: somaP, sistema_pecas: somaS,
      sistema_media: s.janela.usada ? r2(somaS / s.janela.usada) : null
    },
    linhas
  };
}

module.exports = { mediaPorSku, comparar };

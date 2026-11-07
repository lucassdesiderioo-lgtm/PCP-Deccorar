#!/usr/bin/env node
/* A PROVA DA FASE 3 da PLANEJAMENTO-VENDAS-FUTURAS — so le, nao grava nada.
 *
 *   node simular_ritmo.js <relatorio do ML .xlsx ou .csv> [--cobertura 10] [--minimo 2] [--json]
 *
 * Pergunta: o ritmo novo (o MAIOR entre a media de 30 e a de 14 dias) faria a
 * fabrica faltar MENOS que a media de 30 sozinha?
 *
 * Para cada dia D em que ja ha 30 dias de historia antes e 10 dias de venda
 * real depois (dentro do relatorio):
 *   alvo velho = max(minimo, ceil(media30(D) × cobertura))
 *   alvo novo  = max(minimo, ceil(max(media30(D), media14(D)) × cobertura))
 *   real       = pecas vendidas de D ate D+cobertura−1
 *   falta      = max(0, real − alvo)      sobra = max(0, alvo − real)
 * A media de D usa os N dias CHEIOS antes de D (o dia de hoje pela metade
 * entortaria as duas). Venda = o que a tabela §3-B poe na media (o pos-venda
 * entra, a cancelada e a linha que nao e venda ficam fora), pela Data de
 * venda, em PECA (Unidades). O sob medida fica fora (nao tem alvo).
 *
 * E uma regua de comparacao, nao a fabrica: ela nao sabe da capacidade nem do
 * estoque de cada dia. O que ela diz e qual das duas regras chega mais perto
 * da venda que veio.
 */
const fs = require('fs');
const { lerPlanilha, parseDataVenda } = require('./planilha');
const P = require('./planilha_estado');

function simular(linhas, opts){
  const cob = (opts && opts.cobertura) || 10, minimo = opts && opts.minimo != null ? opts.minimo : 2;
  const col = P.colunas(linhas);
  const rel = P.dataDoRelatorio(linhas, opts && opts.nome);
  const vendas = {};              // sku -> { 'aaaa-mm-dd': pecas }
  let primeiro = null, ultimo = null;
  for(const l of linhas){
    if(!/^\d{6,}$/.test(String(l[col.venda]||'').trim())) continue;
    const sku = String(l[col.sku]||'').replace(/\s+/g,'').toUpperCase();
    if(!sku || /SOBMEDIDA/.test(sku)) continue;
    const ref = P.deIso(rel ? rel.data : P.iso(new Date()));
    if(!P.classificar(l[col.estado], l[col.descricao], ref).media) continue;
    const d = parseDataVenda(l[col.data]);
    if(!d) continue;
    (vendas[sku] = vendas[sku] || {})[d] = (vendas[sku][d] || 0) + P.unidades(l[col.unidades]);
    if(!primeiro || d < primeiro) primeiro = d;
    if(!ultimo || d > ultimo) ultimo = d;
  }
  if(!primeiro) return { erro:'nenhuma venda no arquivo' };
  const fim = rel ? rel.data : ultimo;
  const soma = (m, de, ate) => { let s = 0; for(let d = de; d <= ate; d = P.iso(P.mais(P.deIso(d), 1))) s += m[d] || 0; return s; };
  const dias = [];
  for(let d = P.iso(P.mais(P.deIso(primeiro), 30)); P.iso(P.mais(P.deIso(d), cob - 1)) < fim; d = P.iso(P.mais(P.deIso(d), 1))) dias.push(d);

  const porSku = [];
  const tot = { velho:{ falta:0, sobra:0, dias_falta:0 }, novo:{ falta:0, sobra:0, dias_falta:0 }, real:0 };
  for(const sku of Object.keys(vendas).sort()){
    const m = vendas[sku];
    const r = { sku, velho:{ falta:0, sobra:0, dias_falta:0 }, novo:{ falta:0, sobra:0, dias_falta:0 }, real:0,
                media30_fim:0, media14_fim:0 };
    for(const d of dias){
      const ontem = P.iso(P.mais(P.deIso(d), -1));
      const m30 = soma(m, P.iso(P.mais(P.deIso(d), -30)), ontem) / 30;
      const m14 = soma(m, P.iso(P.mais(P.deIso(d), -14)), ontem) / 14;
      const real = soma(m, d, P.iso(P.mais(P.deIso(d), cob - 1)));
      const av = Math.max(minimo, Math.ceil(m30 * cob)), an = Math.max(minimo, Math.ceil(Math.max(m30, m14) * cob));
      for(const [k, alvo] of [['velho', av], ['novo', an]]){
        const f = Math.max(0, real - alvo), s = Math.max(0, alvo - real);
        r[k].falta += f; r[k].sobra += s; if(f > 0) r[k].dias_falta++;
      }
      r.real += real;
    }
    const ontemFim = P.iso(P.mais(P.deIso(fim), -1));
    r.media30_fim = +(soma(m, P.iso(P.mais(P.deIso(fim), -30)), ontemFim) / 30).toFixed(2);
    r.media14_fim = +(soma(m, P.iso(P.mais(P.deIso(fim), -14)), ontemFim) / 14).toFixed(2);
    ['velho','novo'].forEach(k => ['falta','sobra','dias_falta'].forEach(c => tot[k][c] += r[k][c]));
    tot.real += r.real;
    porSku.push(r);
  }
  porSku.sort((a,b)=> (b.velho.falta - b.novo.falta) - (a.velho.falta - a.novo.falta) || a.sku.localeCompare(b.sku));
  return { de: primeiro, ate: fim, dias_avaliados: dias.length, primeiro_dia: dias[0], ultimo_dia: dias[dias.length-1],
           cobertura: cob, minimo, total: tot, skus: porSku,
           melhora: tot.novo.falta < tot.velho.falta };
}

module.exports = { simular };

if(require.main === module){
  const args = process.argv.slice(2);
  const arq = args.find(a => !a.startsWith('--') && !/^\d+$/.test(a));
  const num = (k, p) => { const i = args.indexOf(k); return i >= 0 ? +args[i+1] : p; };
  if(!arq){ console.error('uso: node simular_ritmo.js <relatorio.xlsx|.csv> [--cobertura 10] [--minimo 2] [--json]'); process.exit(2); }
  const r = simular(lerPlanilha(fs.readFileSync(arq)), { cobertura: num('--cobertura', 10), minimo: num('--minimo', 2), nome: arq });
  if(r.erro){ console.error(r.erro); process.exit(1); }
  if(args.indexOf('--json') >= 0){ console.log(JSON.stringify(r, null, 2)); process.exit(0); }
  console.log('Relatório de ' + r.de + ' a ' + r.ate + ' · ' + r.dias_avaliados + ' dias avaliados (' + r.primeiro_dia + ' a ' + r.ultimo_dia
    + ') · cobertura ' + r.cobertura + ' dias · alvo mínimo ' + r.minimo);
  console.log('peças que FALTARIAM (venda dos ' + r.cobertura + ' dias seguintes acima do alvo), somadas dia a dia\n');
  const pad = (s, n) => String(s).padEnd(n), lp = (s, n) => String(s).padStart(n);
  console.log(pad('SKU', 22) + lp('30d/d', 7) + lp('14d/d', 7) + lp('falta velho', 13) + lp('falta novo', 12) + lp('sobra velho', 13) + lp('sobra novo', 12));
  for(const s of r.skus)
    console.log(pad(s.sku, 22) + lp(s.media30_fim.toFixed(2), 7) + lp(s.media14_fim.toFixed(2), 7)
      + lp(s.velho.falta, 13) + lp(s.novo.falta, 12) + lp(s.velho.sobra, 13) + lp(s.novo.sobra, 12));
  const t = r.total;
  console.log('\nTOTAL' + ' '.repeat(31) + lp(t.velho.falta, 13) + lp(t.novo.falta, 12) + lp(t.velho.sobra, 13) + lp(t.novo.sobra, 12));
  console.log('\n' + (r.melhora ? 'A REGRA NOVA FALTA MENOS: ' : 'A REGRA NOVA NÃO MELHORA A FALTA: ')
    + t.velho.falta + ' → ' + t.novo.falta + ' peças faltando · sobra ' + t.velho.sobra + ' → ' + t.novo.sobra);
}

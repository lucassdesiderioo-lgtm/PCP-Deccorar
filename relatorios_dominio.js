/* A CENTRAL DE RELATÓRIOS (spec RELATORIOS-UNIFICADOS, 08/11/2026).
 *
 * Este arquivo NÃO TEM SQL, e não é descuido: é a regra da central de
 * pendências (§5, #12) pela porta dos relatórios. Cada número é perguntado à
 * função do dono dele — a venda ao `demanda_dominio`, a devolução ao
 * `devcaso_dominio`, a embalagem e a baixa ao `fluxo_estoque`, o despacho ao
 * `carga.js`, a urgência ao `urgencia.js`, o inventário ao
 * `inventario_dominio`, a coleta que não passou ao `fim_dia.js`, as pendências
 * ao `pendencias_dia.js`. Aqui só se junta, se compara e se diz desde quando.
 * Uma conta copiada diverge no primeiro ajuste, e o relatório confirmaria com
 * autoridade um número que a tela dona não usa. O `teste_relatorios.js`
 * recusa SQL neste arquivo.
 *
 * Regras de todos os números (§3 da spec):
 * - QUANTIDADE, NUNCA REAIS. Nenhum campo de dinheiro sai daqui.
 * - A VENDA CANCELADA FICA FORA (o dono: "são vendas que não saíram da empresa").
 * - "SEM REGISTRO" NÃO É ZERO. A semana que termina antes do primeiro dado de
 *   um número sai `null`, e a tela diz "sem registro".
 * - A SEMANA É DE SEGUNDA A DOMINGO, e a da reunião é a ÚLTIMA COMPLETA.
 */
const DEMANDA = require('./demanda_dominio');
const FLUXO = require('./fluxo_estoque');
const CARGA = require('./carga');
const DEV = require('./devcaso_dominio');
const URG = require('./urgencia');
const INV = require('./inventario_dominio');
const FIM = require('./fim_dia');
const PDIA = require('./pendencias_dia');

/* ── datas, só texto AAAA-MM-DD (em UTC para nenhum dia escorregar) ── */
const ISO = /^\d{4}-\d{2}-\d{2}$/;
const deIso = s => { const [a, m, d] = s.split('-').map(Number); return new Date(Date.UTC(a, m - 1, d)); };
const iso = d => d.toISOString().slice(0, 10);
const mais = (s, n) => { const d = deIso(s); d.setUTCDate(d.getUTCDate() + n); return iso(d); };
const diaSemana = s => deIso(s).getUTCDay();             // 0 domingo … 6 sábado
const domingoAte = s => mais(s, (7 - diaSemana(s)) % 7);  // o domingo da semana do dia
const dias = (de, ate) => { const r = []; for(let d = de; d <= ate; d = mais(d, 1)) r.push(d); return r; };
const soma = (m, de, ate) => dias(de, ate).reduce((a, d) => a + (m[d] || 0), 0);
const fimDoMes = mes => iso(new Date(Date.UTC(+mes.slice(0, 4), +mes.slice(5, 7), 0)));

/* "Hoje" é o do `relogio.js`, o relógio do servidor — o mesmo que o
   `date('now','localtime')` dos donos (e que os testes conseguem fixar). */
const RELOGIO = require('./relogio');
const hojeDe = () => RELOGIO.hoje();

/* A ÚLTIMA SEMANA COMPLETA: o domingo antes de hoje (hoje domingo → o de
   hoje ainda não acabou, então é o anterior). */
function ultimoDomingo(db){
  const h = hojeDe(db);
  return mais(h, -(diaSemana(h) === 0 ? 7 : diaSemana(h)));
}

/* Os números de UMA semana (de segunda a domingo). `null` = sem registro. */
function numerosDaSemana(db, de, ate, desde){
  const valeu = k => desde[k] && desde[k] <= ate;
  const vend = valeu('vendas') ? soma(DEMANDA.vendasPorDiaPeriodo(db, de, ate), de, ate) : null;
  let dev = null, envio = null;
  if(valeu('devolucoes')){ const r = DEV.relatorioPeriodo(db, de, ate, false); dev = r.devolucoes; envio = r.por_tipo.envio; }
  let emb = null, saiu = null;
  if(valeu('embalagem')){ const f = FLUXO.periodo(db, de, ate); emb = f.reduce((a, x) => a + x.entrou, 0); saiu = f.reduce((a, x) => a + x.saiu, 0); }
  let desp = null;
  if(valeu('despacho')){
    const m = CARGA.despachoPorDia(db, de, ate);
    desp = Object.values(m).reduce((a, x) => ({ no_prazo:a.no_prazo + x.no_prazo, atrasado:a.atrasado + x.atrasado, sem_prazo:a.sem_prazo + x.sem_prazo }),
      { no_prazo:0, atrasado:0, sem_prazo:0 });
  }
  const pct = (a, b) => (a != null && b) ? Math.round(a / b * 1000) / 10 : null;
  return {
    de, ate,
    vendas: vend,
    devolucoes: dev,
    taxa_devolucao: pct(dev, vend),
    item_faltante: envio,
    embaladas: emb,
    saiu,
    despacho: desp,
    despacho_no_prazo_pct: desp ? pct(desp.no_prazo, desp.no_prazo + desp.atrasado) : null
  };
}

function desdeDe(db){
  return { vendas:DEMANDA.primeiraVenda(db), devolucoes:DEV.primeiraDevolucao(db),
           embalagem:FLUXO.primeiraEmbalagem(db), despacho:CARGA.primeiraSaida(db) };
}

/* O RESUMO DA SEGUNDA-FEIRA (fase 1): a semana escolhida, a anterior e a média
   das QUATRO semanas antes dela — a média não conta a própria semana, senão
   ela puxaria a régua para perto de si. A média só usa as semanas com
   registro, e diz de quantas é. */
function semana(db, domingo){
  const fim = (domingo && ISO.test(domingo)) ? domingoAte(domingo) : ultimoDomingo(db);
  const desde = desdeDe(db);
  const semanas = [0, 1, 2, 3, 4].map(k => numerosDaSemana(db, mais(fim, -6 - 7 * k), mais(fim, -7 * k), desde));
  const CAMPOS = ['vendas', 'devolucoes', 'taxa_devolucao', 'item_faltante', 'embaladas', 'saiu', 'despacho_no_prazo_pct'];
  const media = {};
  CAMPOS.forEach(c => {
    const v = semanas.slice(1).map(s => s[c]).filter(x => x != null);
    media[c] = v.length ? { media:Math.round(v.reduce((a, x) => a + x, 0) / v.length * 10) / 10, semanas:v.length } : null;
  });
  return { semana:semanas[0], anterior:semanas[1], media4:media, semanas, desde,
           hoje:hojeDe(db), proxima: mais(fim, 7) <= hojeDe(db) ? mais(fim, 7) : null, anterior_domingo:mais(fim, -7) };
}

/* VENDAS (fase 2): o mês a mês com o crescimento, os SKUs, as cores e as
   medidas do período, e coleta × agência. O mês corrente vem marcado como
   parcial, com a projeção pelo ritmo do mês — e a projeção vem dita como tal. */
function vendas(db, de, ate){
  const hoje = hojeDe(db);
  const meses = DEMANDA.vendasPorMes(db);
  const porMes = {}; meses.forEach(m => porMes[m.mes] = m.pecas);
  const mesHoje = hoje.slice(0, 7);
  const linhas = meses.map(m => {
    const [a, mm] = m.mes.split('-').map(Number);
    const ant = mm === 1 ? (a - 1) + '-12' : a + '-' + String(mm - 1).padStart(2, '0');
    const anoAnt = (a - 1) + '-' + String(mm).padStart(2, '0');
    const cresc = (x, y) => (y ? Math.round((x - y) / y * 1000) / 10 : null);
    const o = { mes:m.mes, pecas:m.pecas, vs_mes_anterior: porMes[ant] != null ? cresc(m.pecas, porMes[ant]) : null,
                vs_ano_anterior: porMes[anoAnt] != null ? cresc(m.pecas, porMes[anoAnt]) : null };
    if(m.mes === mesHoje){
      const diaN = +hoje.slice(8, 10), total = +fimDoMes(m.mes).slice(8, 10);
      o.parcial = true; o.ate_dia = diaN; o.projecao = Math.round(m.pecas / diaN * total);
    }
    return o;
  });
  const fimP = (ate && ISO.test(ate)) ? ate : hoje, deP = (de && ISO.test(de)) ? de : mais(fimP, -29);
  const skus = DEMANDA.vendasPorSkuPeriodo(db, deP, fimP);
  const agrupa = f => { const m = new Map(); skus.forEach(s => { const k = f(s); m.set(k, (m.get(k) || 0) + s.pecas); });
    return Array.from(m, ([k, pecas]) => ({ k, pecas })).sort((a, b) => b.pecas - a.pecas || String(a.k).localeCompare(String(b.k))); };
  const modal = {};
  CARGA.modalidadePorMes(db).forEach(r => { const x = modal[r.mes] = modal[r.mes] || { mes:r.mes, coleta:0, agencia:0 }; x[r.coleta ? 'coleta' : 'agencia'] += r.pecas; });
  return {
    meses: linhas, desde: DEMANDA.primeiraVenda(db),
    periodo: { de:deP, ate:fimP, total: skus.reduce((a, s) => a + s.pecas, 0),
      top_skus: skus.slice(0, 10).map(s => ({ codigo:s.codigo, pecas:s.pecas })),
      cores: agrupa(s => s.cor || '(sem cor no cadastro)').map(x => ({ cor:x.k, pecas:x.pecas })),
      medidas: agrupa(s => (s.largura && s.altura) ? (s.largura + '×' + s.altura) : '(sem medida no cadastro)').map(x => ({ medida:x.k, pecas:x.pecas })) },
    modalidade: Object.values(modal)
  };
}

/* PRODUÇÃO (fase 4): o entrou e o saiu dia a dia do período. O resto da aba
   (peça com problema, tempos) é o painel gerencial que já existia na 904. */
function producao(db, de, ate){
  return { de, ate, dias: FLUXO.periodo(db, de, ate), desde: FLUXO.primeiraEmbalagem(db) };
}

/* EXPEDIÇÃO (fase 4): o despacho no prazo dia a dia, e os dias em que a
   coleta não passou. */
function expedicao(db, de, ate){
  const m = CARGA.despachoPorDia(db, de, ate);
  return { de, ate, desde: CARGA.primeiraSaida(db),
    dias: dias(de, ate).map(d => Object.assign({ data:d }, m[d] || { no_prazo:0, atrasado:0, sem_prazo:0 })),
    coleta_nao_passou: FIM.porPeriodo(db, de, ate) };
}

/* ESTOQUE (fase 4): a falta de estoque (a urgência do PDF), o acerto do
   inventário mês a mês e as pendências de cada dia (o retrato, R7). */
function estoque(db, de, ate){
  const urg = URG.porDia(db, de, ate);
  const hoje = hojeDe(db);
  const meses = [];
  for(let m = hoje.slice(0, 7), i = 0; i < 6; i++){
    const a = INV.acuracidade(db, { desde:m + '-01', ate:fimDoMes(m) });
    meses.unshift(Object.assign({ mes:m }, a));
    const [y, mm] = m.split('-').map(Number); m = mm === 1 ? (y - 1) + '-12' : y + '-' + String(mm - 1).padStart(2, '0');
  }
  return { de, ate,
    urgencia: { desde: URG.primeira(db), dias: dias(de, ate).map(d => ({ data:d, pecas:urg[d] || 0 })), skus: URG.porSku(db, de, ate).slice(0, 10) },
    acuracidade: meses,
    pendencias: { desde: PDIA.primeira(db), dias: PDIA.porPeriodo(db, de, ate) } };
}

/* O período das abas: `de` e `ate` válidos, senão os últimos 30 dias. Nunca
   mais de 366 dias (a tela não precisa, e a conta dia a dia não fica pesada). */
function periodo(db, de, ate){
  const hoje = hojeDe(db);
  let a = (ate && ISO.test(ate)) ? ate : hoje, d = (de && ISO.test(de)) ? de : mais(a, -29);
  if(d > a){ const t = d; d = a; a = t; }
  if(dias(d, a).length > 366) d = mais(a, -365);
  return { de:d, ate:a };
}

module.exports = { semana, vendas, producao, expedicao, estoque, periodo, ultimoDomingo, mais, domingoAte };

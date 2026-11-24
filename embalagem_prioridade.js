/* embalagem_prioridade.js — DONO ÚNICO de "o que a 102 embala primeiro"
 * (spec EMBALAGEM-PRIORIDADE §2 e §3, decisão do dono de 22–23/11/2026).
 *
 * Quatro blocos:
 *   1 vermelho  DO DIA      SKU com venda de hoje sem peça livre na Etiqueta de
 *                           Venda (a `falta` do tarja_estoque.js). Toda peça
 *                           aguardando do SKU conta aqui, de qualquer modo.
 *   2 âmbar     PEDIDO DE HOJE   fila modo `hoje` de SKU fora do bloco 1
 *   3 azul      REPOSIÇÃO        fila modo `estoque` de SKU fora do bloco 1
 *   4 roxo      DEVOLUÇÃO        fila modo `devolucao` de SKU fora do bloco 1
 * Kit, acessório e sob medida (modelo sem medida) ficam fora dos blocos.
 *
 * ⚠️ NENHUMA CONTA PRÓPRIA (#12): a falta e o "pedido de hoje" são do
 * `tarja_estoque.js` (que usa o `fila_dia.js`), o livre é saldo − o
 * `baixa_dominio.reservados`, a reserva é do `embalagem_reserva.js`, a ordem
 * do dia é a tabela `producao`, e o abaixo do alvo é o `precisa` do
 * `demanda_dominio`. Aqui só se junta e se ordena. A tela só desenha.
 */
'use strict';
const TARJA   = require('./tarja_estoque');
const BAIXA   = require('./baixa_dominio');
const RESERVA = require('./embalagem_reserva');

const up = s => String(s == null ? '' : s).trim().toUpperCase();

function medida(s){
  if(!s || !s.largura_cm || !s.altura_cm) return '';
  const m = v => (v / 100).toFixed(2).replace('.', ',');
  return m(s.largura_cm) + ' × ' + m(s.altura_cm);
}

function infoSku(db){
  let q;
  try{ q = db.prepare(`SELECT s.codigo, s.cor, s.largura_cm, s.altura_cm, s.estoque,
      COALESCE(m.exige_medida,1) exige_medida, COALESCE(m.sob_medida,0) sob_medida
      FROM skus s LEFT JOIN modelo m ON m.id=s.modelo_id WHERE s.codigo=?`); }
  catch(e){ q = db.prepare(`SELECT codigo, cor, largura_cm, altura_cm, estoque, 1 exige_medida, 0 sob_medida FROM skus WHERE codigo=?`); }
  const cache = new Map();
  return c => { c = up(c); if(!cache.has(c)) cache.set(c, q.get(c) || null); return cache.get(c); };
}

/* O que falta para o alvo, por SKU (o `precisa`). Sem a conta, nulo: a tela
   escreve só "reposição", e a fila continua saindo. */
function precisaPorSku(db){
  const m = new Map();
  try{ for(const l of require('./demanda_dominio').calcular(db).linhas) m.set(up(l.codigo), l.precisa); }
  catch(e){ return null; }
  return m;
}

/* opcoes: { emTeste:0|1, usuario_id } — quem pergunta: a reserva dele conta
   como "aqui" para ele, e a dos outros como "sendo embalada". */
function montar(db, opcoes){
  opcoes = opcoes || {};
  const t = opcoes.emTeste ? 1 : 0, eu = opcoes.usuario_id == null ? null : opcoes.usuario_id;
  const sku = infoSku(db);
  const resv = RESERVA.mapa(db);

  // A fila que espera, por SKU, separada por modo e com quem está embalando.
  const porSku = new Map(), outros = new Map();
  for(const f of db.prepare(`SELECT id, codigo, modo, revisado_em FROM fila WHERE situacao='aguardando' AND COALESCE(teste,0)=? ORDER BY id`).all(t)){
    const c = up(f.codigo), s = sku(c);
    if(s && s.exige_medida === 0){
      const o = outros.get(c) || { codigo:c, cor:s.cor || '', aqui:0, desde:f.revisado_em };
      o.aqui++; outros.set(c, o); continue;
    }
    const g = porSku.get(c) || { codigo:c, aqui:0, sendo:[], minha:false, modos:{hoje:0, estoque:0, devolucao:0}, desde:null, ids:[] };
    g.ids.push(f.id);
    const r = resv.get(f.id);
    if(r && r.usuario_id !== eu){ g.sendo.push(r.usuario_nome || 'outra pessoa'); }
    else {
      g.aqui++;
      const md = f.modo === 'estoque' || f.modo === 'devolucao' ? f.modo : 'hoje';
      g.modos[md]++;
      if(r) g.minha = true;
      if(!g.desde || (f.revisado_em && f.revisado_em < g.desde)) g.desde = f.revisado_em;
    }
    porSku.set(c, g);
  }

  // A falta de hoje: os pedaços são os SKUs que a fila de hoje pede e os da fila.
  const ped = TARJA.pedidoHoje(db);
  const rv = BAIXA.reservados(db);
  const codigos = new Set([...ped.keys(), ...porSku.keys()]);
  const pedacos = [...codigos].map(c => { const s = sku(c);
    return { codigo:c, estoque:s ? (+s.estoque || 0) - (rv[c] || 0) : null }; });
  TARJA.marcar(db, pedacos, ped);
  const falta = new Map(pedacos.map(p => [p.codigo, p]));

  // A barra do dia: M = peças que a fila de hoje pede (fora o sob medida e o kit).
  let m = 0, faltaTotal = 0;
  for(const p of pedacos){
    const s = sku(p.codigo);
    if(p.sob_medida || (s && s.exige_medida === 0) || !p.pedido_hoje) continue;
    m += p.pedido_hoje; faltaTotal += p.falta;
  }

  // Bloco 1.
  /* ⚠️ O CARTÃO MOSTRA SÓ O TRABALHO DA EMBALAGEM (decisão do dono, 24/11/2026:
     "a pessoa tem que focar no que precisa ser feito"). Nada de "com peça"
     (estoque) nem de "na produção": o número é o que embalar agora para
     destravar venda de hoje — o menor entre as peças aqui e as vendas paradas.
     O SKU do dia SEM peça aqui sai do vermelho (não há o que embalar), e a peça
     que passa das vendas paradas desce para a Reposição. */
  const dia = [], doDiaSet = new Set(), excesso = new Map();
  for(const p of pedacos){
    if(!(p.falta > 0)) continue;
    const s = sku(p.codigo); if(s && s.exige_medida === 0) continue;
    doDiaSet.add(p.codigo);
    const g = porSku.get(p.codigo) || { aqui:0, sendo:[], minha:false, desde:null, ids:[] };
    if(!(g.aqui > 0)) continue;
    const para = Math.min(g.aqui, p.falta), listrado = Math.min(g.sendo.length, p.falta - para);
    if(g.aqui > para) excesso.set(p.codigo, g.aqui - para);
    dia.push({ codigo:p.codigo, medida:medida(s), cor:s ? s.cor || '' : '',
      paradas:p.falta, para_embalar:para, aqui:g.aqui, minha:g.minha, sendo:g.sendo,
      quadros:{ amarelo:para, listrado }, desde:g.desde, ids:g.ids });
  }
  /* Mais vendas paradas primeiro; depois a revisada há mais tempo. */
  dia.sort((a, b) => (b.paradas - a.paradas)
    || String(a.desde || '9').localeCompare(String(b.desde || '9')) || a.codigo.localeCompare(b.codigo));
  /* Todo SKU do dia fica fora dos outros blocos — o que sobra dele entra na
     Reposição pelo `excesso`, logo abaixo. */
  const noDia = doDiaSet;

  // A ordem do dia (bloco 2) e o abaixo do alvo (bloco 3).
  const ordem = new Map();
  try{ for(const r of db.prepare(`SELECT UPPER(codigo) c, SUM(qtd) q, SUM(produzido) p FROM producao
      WHERE data=date('now','localtime') AND COALESCE(teste,0)=? GROUP BY UPPER(codigo)`).all(t)) ordem.set(r.c, r); }
  catch(e){}
  const precisa = precisaPorSku(db);

  const blocoDe = (modo, extra) => {
    const out = [];
    for(const g of porSku.values()){
      if(noDia.has(g.codigo) || !(g.modos[modo] > 0)) continue;
      const s = sku(g.codigo);
      out.push(Object.assign({ codigo:g.codigo, medida:medida(s), cor:s ? s.cor || '' : '',
        aqui:g.modos[modo], minha:g.minha, sendo:g.sendo, desde:g.desde, ids:g.ids }, extra(g.codigo)));
    }
    out.sort((a, b) => ((b.falta || 0) - (a.falta || 0)) || String(a.desde || '9').localeCompare(String(b.desde || '9')));
    return out;
  };
  const hoje = blocoDe('hoje', c => { const o = ordem.get(c);
    return o ? { ordem_pede:o.q || 0, falta:Math.max(0, (o.q || 0) - (o.p || 0)) } : { ordem_pede:0, falta:0 }; });
  const reposicao = blocoDe('estoque', c => ({ falta:precisa ? (precisa.get(c) || 0) : null }));
  const devolucao = blocoDe('devolucao', () => ({}));

  /* A peça do dia que passa das vendas paradas (17 aqui para 9 vendas) é reposição. */
  for(const [c, n] of excesso){
    const g = porSku.get(c), s = sku(c);
    reposicao.push({ codigo:c, medida:medida(s), cor:s ? s.cor || '' : '', aqui:n, minha:false, sendo:[],
      desde:g.desde, ids:g.ids, falta:precisa ? (precisa.get(c) || 0) : null });
  }
  reposicao.sort((a, b) => ((b.falta || 0) - (a.falta || 0)) || String(a.desde || '9').localeCompare(String(b.desde || '9')));

  // Os SKUs que só têm peça com outra pessoa (fora do vermelho) aparecem junto.
  for(const g of porSku.values()){
    if(noDia.has(g.codigo) || g.aqui > 0 || !g.sendo.length) continue;
    const s = sku(g.codigo);
    reposicao.push({ codigo:g.codigo, medida:medida(s), cor:s ? s.cor || '' : '', aqui:0, minha:false, sendo:g.sendo,
      desde:null, ids:g.ids, falta:precisa ? (precisa.get(g.codigo) || 0) : null });
  }

  return {
    dia:{ linhas:dia, m, n:m - faltaTotal, todas:m > 0 && faltaTotal === 0,
      aqui:dia.reduce((s, d) => s + d.aqui, 0),
      /* a barra do topo: quantas peças do dia faltam embalar (decisão 1b, 24/11/2026) */
      faltam_embalar:dia.reduce((s, d) => s + d.para_embalar, 0) },
    hoje, reposicao, devolucao,
    outros:[...outros.values()],
    reserva_min:RESERVA.minutos(db)
  };
}

/* "Este SKU é do bloco 1?" e qual peça do dia está esperando — para o aviso do
   bipe fora da prioridade (§4). */
function doDia(p, codigo){
  const c = up(codigo);
  return p.dia.linhas.some(d => d.codigo === c);
}

module.exports = { montar, doDia, medida };

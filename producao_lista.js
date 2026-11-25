/* producao_lista.js — DONO UNICO das listas da producao da medida padrao (spec
 * PRODUCAO-MAPA-E-MOTOR v7, §14.3 e §14.4, 25/11/2026): o que cortar (108, 110),
 * o que montar (107) e quantas etiquetas de SKU em serie imprimir (a aba da 401).
 *
 * ⚠️ NAO TEM CONTA DE QUANTIDADE PROPRIA (#12). A necessidade e a lista da 101
 *    Revisao (`revisao_lista.montar`): Hoje · Proximos dias · Completar o alvo,
 *    ja sem a peca revisada esperando a embalagem. Aqui so se desconta, NA MESMA
 *    ORDEM (hoje → proximos dias → alvo), o que ja esta pronto mais a frente:
 *
 *      o que montar   − no carrinho da revisao − sendo montado
 *      o que imprimir − no carrinho − sendo montado − etiqueta impressa e livre
 *      o tecido       − no carrinho − sendo montado − cortado na prateleira − em corte
 *      o tubo         − idem, somado pelo tubo (material + medida de corte)
 *
 * ⚠️ O que cada SKU usa sai da FICHA TECNICA (404): a linha de etapa "corte de
 *    tecido" e a primeira de etapa "corte de tubo e base" (o tubo). SKU sem essas
 *    linhas nao entra em lista nenhuma: vai para "ficou fora", com o motivo.
 */
'use strict';
const ETQ = require('./etiqueta_producao');
const CORTE = require('./corte_bancada');
const MONT = require('./montagem_persiana');

const n2 = v => (v / 100).toFixed(2).replace('.', ',');
const num = v => (Math.round(v * 10) / 10).toString().replace('.', ',');

function garantirSchema(db){ MONT.garantirSchema(db); }

/* O que o SKU usa no corte, pela ficha. Cache por chamada (a lista pergunta o
   mesmo SKU varias vezes). */
function pecasDoSku(db, sku, cache){
  const k = String(sku).toUpperCase();
  if(cache && cache[k]) return cache[k];
  const r = (function(){
    const s = db.prepare(`SELECT s.codigo, s.largura_cm, s.altura_cm, s.cor_codigo, COALESCE(s.tem_ficha,1) tem_ficha,
        COALESCE(m.sob_medida,0) sob_medida, m.exige_medida FROM skus s LEFT JOIN modelo m ON m.id=s.modelo_id WHERE UPPER(s.codigo)=?`).get(k);
    if(!s) return { erro:'SKU fora do cadastro' };
    if(s.sob_medida) return { erro:'sob medida — tem a bancada dele' };
    if(s.exige_medida === 0) return { erro:'não é persiana (kit ou acessório)' };
    if(s.largura_cm == null || s.altura_cm == null) return { erro:'medida pendente no cadastro do SKU' };
    if(!s.tem_ficha) return { erro:'SKU de revenda — sem ficha técnica' };
    const fx = require('./ficha_dominio').calcularFicha(db, s.codigo);
    if(fx.erro) return { erro:fx.erro };
    if(fx.pendencia && !(fx.linhas || []).length) return { erro:fx.pendencia };
    const etapa = {};
    db.prepare('SELECT id, etapa, ordem FROM ficha_formula').all().forEach(f => { etapa[f.id] = f; });
    const linhas = (fx.linhas || []).slice().sort((a, b) => ((etapa[a.formula_id]||{}).ordem||0) - ((etapa[b.formula_id]||{}).ordem||0) || a.formula_id - b.formula_id);
    const lt = linhas.find(l => (etapa[l.formula_id]||{}).etapa === 'corte_tecido');
    const lb = linhas.find(l => (etapa[l.formula_id]||{}).etapa === 'corte_tubo');
    if(!lt) return { erro:'a ficha não tem linha de corte de tecido' };
    if(!lb) return { erro:'a ficha não tem linha de corte de tubo' };
    if(!lt.corte || lt.corte.largura == null || lt.corte.altura == null) return { erro:'a linha do tecido não tem medida de corte' };
    if(!lb.corte || lb.corte.largura == null || !lb.componente_id) return { erro:'a linha do tubo não tem material ou medida de corte' };
    const cor = s.cor_codigo || '';
    return {
      sku:s.codigo, cor, largura_cm:s.largura_cm, altura_cm:s.altura_cm,
      final: n2(s.largura_cm) + ' × ' + n2(s.altura_cm),
      tecido:{ item:s.codigo, corte_l:lt.corte.largura, corte_a:lt.corte.altura,
               texto:'corte ' + num(lt.corte.largura) + ' × ' + num(lt.corte.altura) },
      tubo:{ item:'c' + lb.componente_id + ':' + num(lb.corte.largura).replace(',', '.'), componente_id:lb.componente_id,
             material:lb.componente_nome || 'tubo', corte:lb.corte.largura, texto:'corte ' + num(lb.corte.largura) }
    };
  })();
  if(cache) cache[k] = r;
  return r;
}

/* Como a tela fala de um item: o tecido pela medida do SKU final e a cor; o
   tubo pela medida de corte. */
function descreverItem(db, tipo, item){
  if(tipo === 'tecido'){
    const p = pecasDoSku(db, item);
    return p.erro ? item : p.final + ' ' + p.cor;
  }
  const m = String(item).match(/^c(\d+):([\d.]+)$/);
  if(!m) return item;
  const c = db.prepare('SELECT nome FROM componente WHERE id=?').get(+m[1]);
  return (c ? c.nome + ' ' : 'tubo ') + 'cortado em ' + m[2].replace('.', ',');
}

/* A necessidade por SKU, da lista da 101. */
function necessidade(db){
  const L = require('./revisao_lista').montar(db);
  const m = new Map();
  L.hoje_lista.concat(L.proximos_lista, L.alvo_lista).forEach(x => {
    const c = String(x.codigo).toUpperCase();
    if(m.has(c)) return;
    m.set(c, { codigo:x.codigo, hoje:x.hoje || 0, na_embalagem:x.hoje_na_embalagem || 0,
      dias:(x.dias || []).map(d => ({ dia:d.dia, rotulo:d.rotulo, n:d.n || 0 })), alvo:x.alvo || 0 });
  });
  return { itens:[...m.values()], dias:L.dias, hoje:L.hoje };
}

/* Tirar `q` na ordem hoje → proximos dias → alvo. */
function descontar(nec, q){
  const r = { hoje:nec.hoje, dias:nec.dias.map(d => Object.assign({}, d)), alvo:nec.alvo };
  let resto = Math.max(0, q || 0);
  const t = v => { const x = Math.min(resto, v); resto -= x; return v - x; };
  r.hoje = t(r.hoje);
  r.dias.forEach(d => { d.n = t(d.n); });
  r.alvo = t(r.alvo);
  return r;
}
const somaDias = p => p.dias.reduce((a, d) => a + d.n, 0);
const primeiroDia = p => { const d = p.dias.find(x => x.n > 0); return d ? d.dia : '9999'; };

function contagens(db){
  garantirSchema(db);
  const livresPS = {};
  db.prepare("SELECT UPPER(sku) c, COUNT(*) n FROM etiqueta_producao WHERE tipo='PS' AND situacao='livre' GROUP BY UPPER(sku)").all()
    .forEach(r => { livresPS[r.c] = r.n; });
  const up = o => { const m = {}; Object.keys(o).forEach(k => { m[k.toUpperCase()] = o[k]; }); return m; };
  return { carrinho:MONT.noCarrinho(db), montando:MONT.emMontagem(db), livresPS,
    tecPrat:up(CORTE.naPrateleira(db, 'tecido')), tecCorte:up(CORTE.emCorte(db, 'tecido')),
    tubPrat:CORTE.naPrateleira(db, 'tubo'), tubCorte:CORTE.emCorte(db, 'tubo') };
}

/* A base das quatro listas: a necessidade de cada SKU com ficha, e os que
   ficaram fora. */
function base(db){
  const nec = necessidade(db), cache = {}, ok = [], fora = [];
  for(const x of nec.itens){
    const p = pecasDoSku(db, x.codigo, cache);
    const total = x.hoje + somaDias(x) + x.alvo;
    if(p.erro){ if(total > 0) fora.push({ codigo:x.codigo, falta:total, motivo:p.erro }); continue; }
    ok.push({ nec:x, p });
  }
  return { ok, fora, dias:nec.dias, hoje:nec.hoje, cont:contagens(db) };
}

const cartao = (chave, p, partes, extra) => Object.assign({ chave, hoje:partes.hoje, dias:partes.dias.filter(d => d.n > 0),
  proximos:somaDias(partes), alvo:partes.alvo, primeiro_dia:primeiroDia(partes) }, p, extra || {});

/* A 107: o que montar, por SKU, com o que ha cortado na prateleira. */
function listaMontagem(db){
  const b = base(db), c = b.cont, itens = [];
  for(const { nec, p } of b.ok){
    const k = nec.codigo.toUpperCase();
    const partes = descontar(nec, (c.carrinho[k] || 0) + (c.montando[k] || 0));
    const tot = partes.hoje + somaDias(partes) + partes.alvo;
    if(!tot) continue;
    itens.push(cartao(nec.codigo, { titulo:p.final, cor:p.cor, sku:nec.codigo, sub:nec.codigo }, partes,
      { carrinho:c.carrinho[k] || 0, tecido:c.tecPrat[k] || 0, tubo:c.tubPrat[p.tubo.item] || 0 }));
  }
  return { itens, fora:b.fora, dias:b.dias };
}

/* A 108: o tecido, por SKU. */
function listaTecido(db){
  const b = base(db), c = b.cont, itens = [];
  for(const { nec, p } of b.ok){
    const k = nec.codigo.toUpperCase();
    const pronto = (c.carrinho[k] || 0) + (c.montando[k] || 0);
    const partes = descontar(descontar(nec, pronto), (c.tecPrat[k] || 0) + (c.tecCorte[k] || 0));
    const tot = partes.hoje + somaDias(partes) + partes.alvo;
    if(!tot) continue;
    itens.push(cartao(p.tecido.item, { titulo:p.final, cor:p.cor, sku:nec.codigo,
      sub:p.tecido.texto + ' · ' + nec.codigo, corte_l:p.tecido.corte_l, corte_a:p.tecido.corte_a }, partes,
      { prateleira:c.tecPrat[k] || 0 }));
  }
  return { itens, fora:b.fora, dias:b.dias };
}

/* A 110: o tubo, somado pelo tubo (material + medida de corte), sem cor. */
function listaTubo(db){
  const b = base(db), c = b.cont, grupos = new Map();
  for(const { nec, p } of b.ok){
    const k = nec.codigo.toUpperCase();
    const partes = descontar(nec, (c.carrinho[k] || 0) + (c.montando[k] || 0));
    let g = grupos.get(p.tubo.item);
    if(!g){ g = { p, skus:[], nec:{ hoje:0, dias:b.dias.map(d => ({ dia:d.dia, rotulo:d.rotulo, n:0 })), alvo:0 } }; grupos.set(p.tubo.item, g); }
    g.skus.push(nec.codigo);
    g.nec.hoje += partes.hoje; g.nec.alvo += partes.alvo;
    partes.dias.forEach(d => { const x = g.nec.dias.find(y => y.dia === d.dia); if(x) x.n += d.n; else g.nec.dias.push(Object.assign({}, d)); });
  }
  const itens = [];
  for(const [item, g] of grupos){
    const partes = descontar(g.nec, (c.tubPrat[item] || 0) + (c.tubCorte[item] || 0));
    const tot = partes.hoje + somaDias(partes) + partes.alvo;
    if(!tot) continue;
    itens.push(cartao(item, { titulo:'Tubo ' + n2(g.p.largura_cm), cor:g.p.tubo.material + ' + base',
      sub:g.p.tubo.texto + ' · ' + g.skus.join(', '), corte:g.p.tubo.corte, skus:g.skus }, partes,
      { prateleira:c.tubPrat[item] || 0 }));
  }
  return { itens, fora:b.fora, dias:b.dias };
}

/* A aba "Etiquetas da producao" da 401 — com a regra F do §14.3:
   - o dia: tudo o que falta, sem limite (a venda esta esperando);
   - os proximos dias: abrem quando o dia inteiro tem etiqueta, e ate o que ha
     de tecido e tubo cortados LIVRES;
   - o alvo: abre quando o DIA SEGUINTE inteiro tem etiqueta, e reparte na
     ordem do alvo, ate o cortado livre.
   Livre = o cortado na prateleira menos o que as etiquetas ja impressas e
   ainda nao montadas vao usar. */
function etiquetas(db){
  const b = base(db), c = b.cont;
  const rows = b.ok.map(({ nec, p }) => {
    const k = nec.codigo.toUpperCase();
    const partes = descontar(nec, (c.carrinho[k] || 0) + (c.montando[k] || 0) + (c.livresPS[k] || 0));
    return { sku:nec.codigo, k, p, nec, partes };
  });
  const livreTec = {}, livreTub = {};
  rows.forEach(r => { livreTec[r.k] = Math.max(0, (c.tecPrat[r.k] || 0) - (c.livresPS[r.k] || 0)); });
  rows.forEach(r => { livreTub[r.p.tubo.item] = (livreTub[r.p.tubo.item] == null ? (c.tubPrat[r.p.tubo.item] || 0) : livreTub[r.p.tubo.item]) - (c.livresPS[r.k] || 0); });
  Object.keys(livreTub).forEach(x => { livreTub[x] = Math.max(0, livreTub[x]); });
  const reparte = (r, quer) => {
    const pode = Math.min(quer, livreTec[r.k] || 0, livreTub[r.p.tubo.item] || 0);
    livreTec[r.k] -= pode; livreTub[r.p.tubo.item] -= pode;
    return pode;
  };

  const dia = rows.filter(r => r.partes.hoje > 0).map(r => ({ sku:r.sku, n:r.partes.hoje, titulo:r.p.final + ' ' + r.p.cor,
    sem_cortado: !(c.tecPrat[r.k] > 0 && c.tubPrat[r.p.tubo.item] > 0) }));
  const totalDia = dia.reduce((a, x) => a + x.n, 0);
  const amanha = b.dias.length ? b.dias[0].dia : null;
  const prox = rows.filter(r => somaDias(r.partes) > 0).sort((x, y) => primeiroDia(x.partes) < primeiroDia(y.partes) ? -1 : primeiroDia(x.partes) > primeiroDia(y.partes) ? 1 : x.sku.localeCompare(y.sku))
    .map(r => { const quer = somaDias(r.partes); const pode = reparte(r, quer);
      return { sku:r.sku, falta:quer, n:pode, titulo:r.p.final + ' ' + r.p.cor, primeiro:primeiroDia(r.partes),
        amanha:(r.partes.dias.find(d => d.dia === amanha) || { n:0 }).n }; });
  const faltaAmanha = prox.reduce((a, x) => a + x.amanha, 0);
  const alvo = rows.filter(r => r.partes.alvo > 0).sort((x, y) => y.partes.alvo - x.partes.alvo || x.sku.localeCompare(y.sku))
    .map(r => ({ sku:r.sku, falta:r.partes.alvo, n:reparte(r, r.partes.alvo), titulo:r.p.final + ' ' + r.p.cor }));
  const hojeStr = db.prepare("SELECT date('now','localtime') d").get().d;
  const impressasHoje = db.prepare(`SELECT COUNT(*) n FROM etiqueta_producao WHERE tipo='PS' AND parte='dia' AND date(criada_em)=?`).get(hojeStr).n;
  const ultima = db.prepare(`SELECT MAX(em) em FROM etiqueta_impressao WHERE tipo='PS' AND parte='dia' AND date(em)=?`).get(hojeStr).em;
  return {
    dia:{ itens:dia, total:totalDia, impresso:totalDia === 0,
          /* "N novas desde a ultima impressao": ja se imprimiu o dia hoje e a
             necessidade voltou a subir (o PDF das 10:15). */
          novas: impressasHoje > 0 && totalDia > 0 ? { n:totalDia, desde:ultima } : null },
    proximos:{ itens:prox, total:prox.reduce((a, x) => a + x.n, 0), falta:prox.reduce((a, x) => a + x.falta, 0),
               aberto:totalDia === 0, falta_amanha:faltaAmanha },
    alvo:{ itens:alvo, total:alvo.reduce((a, x) => a + x.n, 0), falta:alvo.reduce((a, x) => a + x.falta, 0),
           aberto:totalDia === 0 && faltaAmanha === 0 },
    conta: rows.map(r => ({ sku:r.sku, hoje:r.nec.hoje, na_embalagem:r.nec.na_embalagem, carrinho:c.carrinho[r.k] || 0,
      montando:c.montando[r.k] || 0, impressas:c.livresPS[r.k] || 0, imprimir_hoje:r.partes.hoje,
      tecido:c.tecPrat[r.k] || 0, tubo:c.tubPrat[r.p.tubo.item] || 0 })).filter(x => x.hoje || x.carrinho || x.impressas || x.imprimir_hoje),
    fora:b.fora
  };
}

/* O que a impressao de uma parte imprime — a conta e do servidor, nunca da
   tela. No alvo, `quantidade` e quantas o Supervisor pediu (ex.: 20), e a
   reparticao segue a ordem do alvo. */
function paraImprimir(db, parte, quantidade){
  const e = etiquetas(db);
  if(parte === 'dia'){
    if(!e.dia.total) throw new ETQ.Recusa('Toda a necessidade de hoje já tem etiqueta.', 409);
    return e.dia.itens.map(x => ({ sku:x.sku, quantidade:x.n }));
  }
  if(parte === 'proximos'){
    if(!e.proximos.aberto) throw new ETQ.Recusa('Os próximos dias abrem quando toda a necessidade de hoje tiver etiqueta.', 409);
    const l = e.proximos.itens.filter(x => x.n > 0).map(x => ({ sku:x.sku, quantidade:x.n }));
    if(!l.length) throw new ETQ.Recusa(e.proximos.falta ? 'Não há tecido e tubo cortados livres para os próximos dias.' : 'Os próximos dias já têm etiqueta.', 409);
    return l;
  }
  if(parte === 'alvo'){
    if(!e.alvo.aberto) throw new ETQ.Recusa('O alvo abre quando o dia seguinte inteiro tiver etiqueta.', 409);
    let q = Number(quantidade);
    if(!Number.isInteger(q) || q < 1) throw new ETQ.Recusa('Diga quantas etiquetas do alvo imprimir.');
    const l = [];
    for(const x of e.alvo.itens){ if(q <= 0) break; const k = Math.min(q, x.n); if(k > 0){ l.push({ sku:x.sku, quantidade:k }); q -= k; } }
    if(!l.length) throw new ETQ.Recusa(e.alvo.falta ? 'Não há tecido e tubo cortados livres para o alvo.' : 'O alvo está completo.', 409);
    return l;
  }
  throw new ETQ.Recusa('Parte desconhecida.');
}

module.exports = { garantirSchema, pecasDoSku, descreverItem, necessidade, descontar, listaMontagem, listaTecido, listaTubo,
  etiquetas, paraImprimir };

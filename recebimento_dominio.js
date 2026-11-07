/* O RECEBIMENTO — spec COMPRAS-E-RECEBIMENTO, fase 3 (R-CMP-28 a 37). Dono unico
 * de: a fila sem preco, os tres modos, a pesagem cega, as reguas e as faixas, a
 * retencao e a liberacao, o custo por unidade recebida, o fator real e o prazo
 * medido. O saldo continua so no `componente_dominio.js` (dono unico).
 *
 * ⚠️ QUEM RECEBE NAO VE PRECO, NEM O ESPERADO (R-CMP-28/29). A fila monta o JSON
 * sem preco, sem o pedido e sem o declarado do item por quantidade: e contagem
 * CEGA. So o item "sem saldo" mostra o pedido — ele se recebe com um toque.
 *
 * ⚠️ AS REGUAS DO PESO (R-CMP-31, R-CMP-35). Peso medido = peso de 10 ÷ 10.
 *   nota      = kg do pedido (o que falta receber dele) ÷ quantidade contada
 *   cadastro  = componente.peso_padrao_kg, se existir
 *   historico = a media dos fatores medidos antes (R-CMP-35: "lote fora da media
 *               e divergencia") — so quando ha historico
 * Vale o PIOR desvio. A do cadastro pega o fornecedor que fatura errado; a da
 * nota funciona sem cadastro.
 *
 * ⚠️ O RETIDO NAO ENTRA NO SALDO, e sai com um toque (R-CMP-33): aceitar,
 * aceitar e reclamar, ou devolver, com motivo, quem e quando.
 *
 * ⚠️ CUSTO POR UNIDADE RECEBIDA (R-CMP-34): na compra por kg, o valor do item ÷
 * o que chegou contado — 400 kg com 590 tubos: cada tubo custa valor ÷ 590.
 */
const DOM = require('./componente_dominio');

class Recusa extends Error{ constructor(status, msg){ super(msg); this.status = status; } }
const num = v => { if(v === null || v === undefined || v === '') return null; const n = parseFloat(String(v).replace(',', '.')); return Number.isFinite(n) ? n : NaN; };
const r6 = n => Math.round(n * 1e6) / 1e6;
const DECISOES = ['aceitar', 'aceitar_reclamar', 'devolver'];
const MOTIVOS_DEV = ['fora_medida', 'defeito', 'veio_errado', 'qtd_a_mais'];

/* ── A FILA, SEM PRECO E SEM O ESPERADO ───────────────────────────────── */
function fila(db){
  const pedidos = db.prepare(`SELECT p.id, p.numero, p.status, p.comprado_em, p.canal, p.loja, f.nome fornecedor
    FROM pedido_compra p LEFT JOIN fornecedor f ON f.id=p.fornecedor_id
    WHERE p.status IN ('comprado','parcial') ORDER BY COALESCE(p.comprado_em, p.enviado_em), p.id`).all();
  for(const p of pedidos){
    const itens = db.prepare(`SELECT i.id, i.componente_id, i.sku, i.status, i.qtd_consumo, i.qtd_recebida, i.unidade_compra,
        COALESCE(c.nome, i.sku) item, c.unidade, c.modo_saldo, c.almoxarifado_id, a.nome almox_nome
      FROM pedido_item i LEFT JOIN componente c ON c.id=i.componente_id LEFT JOIN almoxarifado a ON a.id=c.almoxarifado_id
      WHERE i.pedido_id=? AND i.status IN ('aberto','parcial') ORDER BY i.id`).all(p.id);
    p.itens = itens.filter(i => !temRetidoAberto(db, i.id)).map(i => {
      /* Repare: o que sai daqui e escolhido campo a campo. Nada de preco, e
         nada do esperado — a nao ser o pedido do item "sem saldo". */
      const o = { id:i.id, item:i.item, unidade:i.unidade || 'un', modo_saldo:i.modo_saldo || 'quantidade',
        pesar: String(i.unidade_compra || '').toLowerCase() === 'kg', ja_recebido: i.qtd_recebida > 0,
        levar_para: i.almoxarifado_id ? { id:i.almoxarifado_id, nome:i.almox_nome } : null };
      if(o.modo_saldo === 'sem') o.pedido = Math.max(0, (i.qtd_consumo || 0) - (i.qtd_recebida || 0));
      return o;
    });
  }
  return pedidos.filter(p => p.itens.length);
}
function temRetidoAberto(db, pedido_item_id){
  return !!db.prepare("SELECT 1 FROM recebimento_item WHERE pedido_item_id=? AND faixa='retido' AND decisao IS NULL").get(pedido_item_id);
}

/* ── O FATOR REAL (R-CMP-35) ────────────────────────────────────────────── */
function fatorMedio(db, componente_id, excetoRecItem){
  const l = db.prepare(`SELECT ri.fator_real f FROM recebimento_item ri JOIN pedido_item pi ON pi.id=ri.pedido_item_id
    WHERE pi.componente_id=? AND ri.fator_real > 0 ${excetoRecItem ? 'AND ri.id<>' + (+excetoRecItem) : ''} ORDER BY ri.id DESC LIMIT 10`).all(componente_id);
  if(!l.length) return null;
  return { kg_por_unidade: r6(l.reduce((s, x) => s + x.f, 0) / l.length), n:l.length };
}

/* ── O CUSTO DE UMA UNIDADE DA CASA DESTE ITEM (R-CMP-34) ───────────────── */
function custoUnit(pi, contadaAgora, db){
  /* Com nota lancada ANTES do recebimento, o valor e o LIQUIDO da nota
     (R-CMP-26, fase 4). */
  const nota = db ? require('./nota_dominio').liquidoDoItem(db, pi.id) : null;
  if(nota && !(pi.qtd_compra != null && pi.preco_unid_compra != null))
    return nota.quantidade > 0 ? nota.valor / (nota.quantidade * (pi.fator || 1)) : null;
  if(pi.qtd_compra != null && pi.preco_unid_compra != null){
    const valor = nota ? nota.valor : pi.qtd_compra * pi.preco_unid_compra;
    /* Primeira entrega do item: o valor inteiro ÷ o que chegou contado. Entrega
       parcial depois da primeira: pelo declarado (a conta exata so fecha com a
       nota, na fase 4). */
    if(!(pi.qtd_recebida > 0) && contadaAgora > 0) return valor / contadaAgora;
    const base = pi.qtd_declarada || pi.qtd_consumo;
    return base > 0 ? valor / base : null;
  }
  return pi.preco_unit != null ? pi.preco_unit / (pi.fator || 1) : null;
}

/* A entrada no saldo, conforme o modo. "Sem saldo" nao guarda estoque: entra e
   sai na mesma hora (o consumo e a media das compras, R-CMP-45), e o custo
   medio e a media ponderada de TODAS as compras — o preco medio do cafe. */
function darEntrada(db, pi, comp, qtd, custo, ref, quem){
  if(!(qtd > 0) || !pi.componente_id) return;
  DOM.entrada(db, { componente_id:pi.componente_id, delta:qtd, custo_unit:custo, referencia:ref,
    usuario_nome:quem && quem.nome, usuario_id:quem && quem.id });
  if(comp && comp.modo_saldo === 'sem'){
    DOM.movimentar(db, { componente_id:pi.componente_id, delta:-qtd, motivo:'consumo', referencia:ref + ' (sem saldo: consumido na entrada)',
      usuario_nome:quem && quem.nome, usuario_id:quem && quem.id });
    const m = db.prepare(`SELECT SUM(delta*custo_unit) v, SUM(delta) q FROM movimento_componente
      WHERE componente_id=? AND motivo='recebimento' AND custo_unit IS NOT NULL AND delta>0`).get(pi.componente_id);
    if(m && m.q > 0) db.prepare('UPDATE componente SET custo_medio=? WHERE id=?').run(Math.round(m.v / m.q * 1e6) / 1e6, pi.componente_id);
  }
}

function fecharStatusPedido(db, pedido_id){
  const abertos = db.prepare(`SELECT COUNT(*) c FROM pedido_item WHERE pedido_id=? AND status IN ('aberto','parcial')`).get(pedido_id).c;
  const algum = db.prepare('SELECT COUNT(*) c FROM pedido_item WHERE pedido_id=? AND qtd_recebida>0').get(pedido_id).c;
  db.prepare('UPDATE pedido_compra SET status=? WHERE id=?').run(abertos ? (algum ? 'parcial' : 'comprado') : 'recebido', pedido_id);
}
function somarRecebido(db, pi, qtd){
  const tot = (pi.qtd_recebida || 0) + qtd;
  const st = (tot >= (pi.qtd_consumo || 0) - 1e-9) ? 'recebido' : (tot > 0 ? 'parcial' : 'aberto');
  db.prepare('UPDATE pedido_item SET qtd_recebida=?, status=? WHERE id=?').run(tot, st, pi.id);
}

/* ── RECEBER ────────────────────────────────────────────────────────────── */
function receber(db, b, quem){
  const ped = db.prepare('SELECT id, numero, status FROM pedido_compra WHERE id=?').get(+b.pedido_id);
  if(!ped) throw new Recusa(404, 'pedido não encontrado');
  if(ped.status !== 'comprado' && ped.status !== 'parcial')
    throw new Recusa(400, 'este pedido não está aguardando entrega (' + ped.status + ')');
  const itens = Array.isArray(b.itens) ? b.itens : [];
  if(!itens.length) throw new Recusa(400, 'informe o que chegou');

  const prep = [];
  for(const it of itens){
    const pi = db.prepare(`SELECT i.*, c.nome cnome, c.modo_saldo, c.peso_padrao_kg, c.tol_aviso_pct, c.tol_retem_pct, c.almoxarifado_id calm
      FROM pedido_item i LEFT JOIN componente c ON c.id=i.componente_id WHERE i.id=? AND i.pedido_id=?`).get(+it.pedido_item_id, ped.id);
    if(!pi) throw new Recusa(400, 'item ' + it.pedido_item_id + ' não é deste pedido');
    const nome = pi.cnome || pi.sku;
    if(temRetidoAberto(db, pi.id)) throw new Recusa(409, nome + ' tem uma entrega retida esperando decisão');
    const modo = pi.modo_saldo || 'quantidade';
    let qtd, volumes = null;
    if(modo === 'sem' && it.chegou_tudo) qtd = Math.max(0, (pi.qtd_consumo || 0) - (pi.qtd_recebida || 0));
    else if(modo === 'volume'){
      if(!Array.isArray(it.volumes) || !it.volumes.length) throw new Recusa(400, nome + ' é recebido por volume: um registro por volume, com a metragem da etiqueta do fornecedor');
      volumes = it.volumes.map((v, k) => { const m = num(v && v.metragem); if(!(m > 0)) throw new Recusa(400, nome + ': a metragem do volume ' + (k + 1) + ' tem que ser maior que zero'); return { metragem:m, codigo_fornecedor:v.codigo_fornecedor || null }; });
      qtd = r6(volumes.reduce((s, v) => s + v.metragem, 0));
    }else{
      let q = num(it.qtd_contada);
      /* A tela antiga mandava embalagens; continua aceita (tablet com cache). */
      if(q === null && it.embalagens_recebidas != null){ const e = num(it.embalagens_recebidas); q = Number.isNaN(e) ? NaN : e * (pi.fator || 1); }
      if(q === null) q = 0;
      if(Number.isNaN(q) || q < 0) throw new Recusa(400, 'a quantidade contada de ' + nome + ' tem que ser um número maior ou igual a zero');
      qtd = q;
    }
    const dev = num(it.embalagens_devolvidas) || 0;
    if(dev < 0) throw new Recusa(400, 'quantidade devolvida negativa em ' + nome);
    if(dev > 0 && MOTIVOS_DEV.indexOf(it.motivo_devolucao) < 0) throw new Recusa(400, 'devolução de ' + nome + ' precisa de motivo');
    let p1 = null, p10 = null;
    const porKg = String(pi.unidade_compra || '').toLowerCase() === 'kg';
    if(porKg && qtd > 0){
      p1 = num(it.peso_1_kg); p10 = num(it.peso_10_kg);
      if(!(p1 > 0) || !(p10 > 0)) throw new Recusa(400, nome + ' foi comprado por kg: pese 1 unidade e pese 10 unidades — sem os dois pesos o recebimento não fecha');
    }
    let alm = it.almoxarifado_id ? +it.almoxarifado_id : (pi.calm || null);
    if(alm && !db.prepare('SELECT 1 FROM almoxarifado WHERE id=?').get(alm)) throw new Recusa(400, 'o almoxarifado escolhido para ' + nome + ' não existe');
    if(qtd === 0 && dev === 0) continue;
    prep.push({ pi, nome, modo, qtd, dev: dev * (pi.fator || 1), motivoDev: dev > 0 ? it.motivo_devolucao : null, p1, p10, porKg, alm, volumes });
  }
  if(!prep.length) throw new Recusa(400, 'nada foi informado como recebido ou devolvido');

  let recId, retidos = 0, avisos = 0, entradas = 0;
  const volumesCriados = [];
  db.transaction(() => {
    recId = db.prepare('INSERT INTO recebimento (pedido_id, nota_fiscal, nota_data, recebido_por, recebido_por_id) VALUES (?,?,?,?,?)')
      .run(ped.id, b.nota_fiscal || null, b.nota_data || null, quem && quem.nome || null, quem && quem.id || null).lastInsertRowid;
    for(const x of prep){
      const pi = x.pi;
      let espN = null, espC = null, desvio = null, fator = null, faixa = 'ok';
      if(x.porKg && x.qtd > 0){
        const medido = x.p10 / 10;
        fator = r6(medido);
        /* kg da nota: o do pedido, menos o que ja chegou dele (entrega parcial) */
        const jaKg = db.prepare('SELECT COALESCE(SUM(qtd_consumo*fator_real),0) k FROM recebimento_item WHERE pedido_item_id=? AND fator_real>0 AND COALESCE(decisao,\'\')<>\'devolver\'').get(pi.id).k;
        const kgNota = Math.max(0, (pi.qtd_compra || 0) - jaKg);
        espN = kgNota > 0 ? r6(kgNota / x.qtd) : null;
        espC = pi.peso_padrao_kg > 0 ? pi.peso_padrao_kg : null;
        const hist = fatorMedio(db, pi.componente_id);
        const d = [espN, espC, hist && hist.kg_por_unidade].filter(e => e > 0).map(e => Math.abs(medido - e) / e * 100);
        desvio = d.length ? Math.round(Math.max.apply(null, d) * 1000) / 1000 : null;
        const av = pi.tol_aviso_pct != null ? pi.tol_aviso_pct : 2, rt = pi.tol_retem_pct != null ? pi.tol_retem_pct : 5;
        if(desvio != null) faixa = desvio <= av ? 'ok' : (desvio <= rt ? 'aviso' : 'retido');
      }
      /* Contagem diferente da quantidade declarada RETEM (R-CMP-32). */
      if(pi.qtd_declarada != null && x.qtd > 0 && Math.abs((pi.qtd_recebida || 0) + x.qtd - pi.qtd_declarada) > 1e-9) faixa = 'retido';
      const ri = db.prepare(`INSERT INTO recebimento_item (recebimento_id, pedido_item_id, qtd_embalagem, qtd_consumo, qtd_devolvida, motivo_devolucao,
          divergencia, qtd_contada, peso_1_kg, peso_10_kg, esperado_nota_kg, esperado_cadastro_kg, desvio_pct, faixa, fator_real, almoxarifado_id)
        VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)`).run(recId, pi.id, pi.fator ? x.qtd / pi.fator : x.qtd, x.qtd, x.dev, x.motivoDev,
          faixa === 'ok' ? 'nenhuma' : 'quantidade', x.qtd, x.p1, x.p10, espN, espC, desvio, faixa, fator, x.alm).lastInsertRowid;
      if(faixa === 'retido'){ retidos++; continue; }
      if(faixa === 'aviso') avisos++;
      const custo = custoUnit(pi, x.qtd, db);
      db.prepare('UPDATE recebimento_item SET custo_unit=? WHERE id=?').run(custo, ri);
      darEntrada(db, pi, { modo_saldo:x.modo }, x.qtd, custo, ped.numero, quem);
      if(x.qtd > 0) entradas++;
      somarRecebido(db, pi, x.qtd);
      if(x.volumes && module.exports.criarVolumes) volumesCriados.push.apply(volumesCriados, module.exports.criarVolumes(db, { componente_id:pi.componente_id, recebimento_item_id:ri, volumes:x.volumes, almoxarifado_id:x.alm, quem }));
    }
    fecharStatusPedido(db, ped.id);
  })();
  const st = db.prepare('SELECT status FROM pedido_compra WHERE id=?').get(ped.id).status;
  /* A resposta a quem recebe NAO traz desvio nem esperado: so o que fazer. */
  return { recebimento_id:recId, status_pedido:st, entradas, retidos, avisos, volumes:volumesCriados,
    aviso: retidos ? retidos + ' item(ns) ficou(aram) RETIDO(S): não guarde no estoque, deixe separado — quem libera decide.' :
           st === 'parcial' ? 'O pedido continua aberto — o saldo segue contando como a caminho.' : null };
}

/* ── RETIDOS E AVISOS (para quem libera) ─────────────────────────────────── */
function retidos(db){
  const sel = faixa => db.prepare(`SELECT ri.id, ri.pedido_item_id, ri.qtd_contada, ri.peso_1_kg, ri.peso_10_kg, ri.esperado_nota_kg, ri.esperado_cadastro_kg,
      ri.desvio_pct, ri.faixa, r.criado_em, r.recebido_por, p.numero, p.id pedido_id, pi.qtd_declarada, COALESCE(c.nome, pi.sku) item, c.unidade, f.nome fornecedor
    FROM recebimento_item ri JOIN recebimento r ON r.id=ri.recebimento_id JOIN pedido_item pi ON pi.id=ri.pedido_item_id
    JOIN pedido_compra p ON p.id=r.pedido_id LEFT JOIN componente c ON c.id=pi.componente_id LEFT JOIN fornecedor f ON f.id=p.fornecedor_id
    WHERE ri.faixa=? AND ri.decisao IS NULL ORDER BY ri.id`).all(faixa);
  return { itens:sel('retido'), avisos:sel('aviso') };
}
function decidir(db, id, b, quem){
  const ri = db.prepare(`SELECT ri.*, r.pedido_id, p.numero FROM recebimento_item ri JOIN recebimento r ON r.id=ri.recebimento_id
    JOIN pedido_compra p ON p.id=r.pedido_id WHERE ri.id=?`).get(+id);
  if(!ri) throw new Recusa(404, 'recebimento não encontrado');
  if(ri.faixa !== 'retido') throw new Recusa(409, 'este item não está retido');
  if(ri.decisao) throw new Recusa(409, 'este item já foi decidido (' + ri.decisao + ', por ' + (ri.decidido_por || '—') + ')');
  const d = String(b.decisao || '');
  if(DECISOES.indexOf(d) < 0) throw new Recusa(400, 'a decisão tem que ser: aceitar, aceitar e reclamar com o fornecedor, ou devolver');
  const motivo = String(b.motivo || '').trim();
  if(!motivo) throw new Recusa(400, 'diga o motivo da decisão — ele fica gravado');
  if(d === 'devolver' && b.motivo_devolucao && MOTIVOS_DEV.indexOf(b.motivo_devolucao) < 0) throw new Recusa(400, 'motivo de devolução fora da lista: ' + MOTIVOS_DEV.join(', '));
  const pi = db.prepare('SELECT i.*, c.modo_saldo FROM pedido_item i LEFT JOIN componente c ON c.id=i.componente_id WHERE i.id=?').get(ri.pedido_item_id);
  db.transaction(() => {
    db.prepare("UPDATE recebimento_item SET decisao=?, decidido_por=?, decidido_por_id=?, decidido_em=datetime('now','localtime'), motivo_decisao=? WHERE id=?")
      .run(d, quem && quem.nome || null, quem && quem.id || null, motivo, ri.id);
    if(d === 'devolver'){
      /* O devolvido NAO entra e continua a caminho: o fornecedor ainda deve. */
      db.prepare('UPDATE recebimento_item SET qtd_devolvida=?, motivo_devolucao=? WHERE id=?').run(ri.qtd_contada, b.motivo_devolucao || 'defeito', ri.id);
    }else{
      const custo = custoUnit(pi, ri.qtd_contada, db);
      db.prepare('UPDATE recebimento_item SET custo_unit=? WHERE id=?').run(custo, ri.id);
      darEntrada(db, pi, { modo_saldo:pi.modo_saldo }, ri.qtd_contada, custo, ri.numero + ' (liberado)', quem);
      somarRecebido(db, pi, ri.qtd_contada);
    }
    fecharStatusPedido(db, ri.pedido_id);
  })();
  return { decisao:d };
}
function ciencia(db, id, quem){
  const ri = db.prepare('SELECT * FROM recebimento_item WHERE id=?').get(+id);
  if(!ri) throw new Recusa(404, 'recebimento não encontrado');
  if(ri.faixa !== 'aviso') throw new Recusa(409, 'este item não está em aviso');
  if(ri.decisao) throw new Recusa(409, 'a ciência deste aviso já foi dada (por ' + (ri.decidido_por || '—') + ')');
  db.prepare("UPDATE recebimento_item SET decisao='ciente', decidido_por=?, decidido_por_id=?, decidido_em=datetime('now','localtime') WHERE id=?")
    .run(quem && quem.nome || null, quem && quem.id || null, ri.id);
  return {};
}
function pendencias(db){
  const r = retidos(db);
  const desde = l => l.map(x => x.criado_em).filter(Boolean).sort()[0] || null;
  return { retido:{ n:r.itens.length, desde:desde(r.itens) }, aviso:{ n:r.avisos.length, desde:desde(r.avisos) } };
}

/* ── O PRAZO MEDIDO (R-CMP-36) ─────────────────────────────────────────────
   Dias corridos entre a data da compra e o PRIMEIRO recebimento de cada
   pedido; a media das ultimas 5 compras. Com menos de 3 recebimentos vale o
   digitado (oferta ou fornecedor), e a resposta diz qual vale. */
function prazo(db, q){
  const w = [], p = [];
  if(q.fornecedor_id){ w.push('pc.fornecedor_id=?'); p.push(+q.fornecedor_id); }
  if(q.componente_id){ w.push('EXISTS (SELECT 1 FROM pedido_item i WHERE i.pedido_id=pc.id AND i.componente_id=?)'); p.push(+q.componente_id); }
  if(!w.length) return { dias:null, fonte:null, n:0 };
  const l = db.prepare(`SELECT pc.id, pc.comprado_em, (SELECT MIN(r.criado_em) FROM recebimento r WHERE r.pedido_id=pc.id) chegou
    FROM pedido_compra pc WHERE pc.comprado_em IS NOT NULL AND ${w.join(' AND ')}
      AND EXISTS (SELECT 1 FROM recebimento r WHERE r.pedido_id=pc.id) ORDER BY chegou DESC LIMIT 5`).all(...p)
    .map(x => Math.max(0, Math.round((Date.parse(String(x.chegou).slice(0, 10) + 'T12:00:00') - Date.parse(String(x.comprado_em).slice(0, 10) + 'T12:00:00')) / 86400000)));
  const total = db.prepare(`SELECT COUNT(*) n FROM pedido_compra pc WHERE pc.comprado_em IS NOT NULL AND ${w.join(' AND ')}
      AND EXISTS (SELECT 1 FROM recebimento r WHERE r.pedido_id=pc.id)`).get(...p).n;
  if(total >= 3 && l.length) return { dias: Math.round(l.reduce((s, x) => s + x, 0) / l.length * 10) / 10, fonte:'medido', n:total };
  let dig = null;
  if(q.componente_id){
    const o = db.prepare(`SELECT COALESCE(o.prazo_entrega, f.prazo_entrega) d FROM oferta o JOIN fornecedor f ON f.id=o.fornecedor_id
      WHERE o.componente_id=? AND o.ativo=1 ${q.fornecedor_id ? 'AND o.fornecedor_id=' + (+q.fornecedor_id) : ''} AND COALESCE(o.prazo_entrega, f.prazo_entrega) IS NOT NULL ORDER BY o.preco LIMIT 1`).get(+q.componente_id);
    dig = o ? o.d : null;
  }
  if(dig == null && q.fornecedor_id){ const f = db.prepare('SELECT prazo_entrega d FROM fornecedor WHERE id=?').get(+q.fornecedor_id); dig = f ? f.d : null; }
  return { dias:dig, fonte: dig != null ? 'digitado' : null, n:total };
}

module.exports = { Recusa, DECISOES, MOTIVOS_DEV, fila, receber, retidos, decidir, ciencia, pendencias, prazo, fatorMedio, custoUnit, criarVolumes:null };

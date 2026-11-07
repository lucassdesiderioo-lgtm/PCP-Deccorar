/* O PEDIDO DE COMPRA DEPOIS DO RASCUNHO — spec COMPRAS-E-RECEBIMENTO, fase 2
 * (R-CMP-13 a 21). Dono unico de: o caminho do status, a alcada, as parcelas e
 * a compra rapida.
 *
 *   rascunho ─▶ aguardando_aprovacao ─▶ comprado ─▶ parcial ─▶ recebido
 *                 (so acima da alcada)                         cancelado (antes de recebido)
 *
 * ⚠️ "COMPRADO" EXIGE CANAL, NUMERO DO PEDIDO NO FORNECEDOR E DATA (R-CMP-16).
 * E a data da compra que mede o prazo do fornecedor (R-CMP-36). Os tres sao
 * pedidos ja no "comprar": quem passa o pedido para a aprovacao ja comprou (ou
 * esta comprando) e sabe o numero; o aprovador so diz sim.
 *
 * ⚠️ QUEM NAO TEM ALCADA CADASTRADA NAO TEM LIMITE (R-CMP-17) — e o dono hoje.
 * A tabela nasce vazia: pronta e sem uso enquanto so o dono compra.
 *
 * Nenhuma funcao abre transacao fora do que escreve mais de uma linha; quem
 * chama nao precisa pensar nisso.
 */
class Recusa extends Error{ constructor(status, msg){ super(msg); this.status = status; } }

const CANAIS = [
  { valor:'mercado_livre', nome:'Mercado Livre', marketplace:true },
  { valor:'shopee', nome:'Shopee', marketplace:true },
  { valor:'amazon', nome:'Amazon', marketplace:true },
  { valor:'loja_fisica', nome:'Loja física', marketplace:false },
  { valor:'direto', nome:'Direto com o fornecedor', marketplace:false }
];
const FORMAS = ['pix', 'boleto', 'cartao', 'dinheiro', 'transferencia'];
const TIPOS_FORNECEDOR = ['industria', 'distribuidor', 'loja', 'importador'];
const ABERTOS = ['rascunho', 'aguardando_aprovacao', 'comprado', 'parcial'];
const A_CAMINHO = ['comprado', 'parcial'];   // o que conta como a caminho e aparece na fila do Recebimento

const num = v => { const n = parseFloat(String(v == null ? '' : v).replace(',', '.')); return Number.isFinite(n) ? n : null; };
const txt = v => { const t = String(v == null ? '' : v).trim(); return t === '' ? null : t; };
function dataValida(d){
  if(!/^\d{4}-\d{2}-\d{2}( \d{2}:\d{2}(:\d{2})?)?$/.test(d)) return false;
  const t = new Date(d.slice(0, 10) + 'T12:00:00');
  return !isNaN(t) && t.toISOString().slice(0, 10) === d.slice(0, 10);
}
function hoje(){ const t = new Date(), z = n => String(n).padStart(2, '0'); return t.getFullYear() + '-' + z(t.getMonth() + 1) + '-' + z(t.getDate()); }

/* Os tres campos da compra, conferidos — devolve o objeto ou lanca. */
function lerCompra(b, padraoHoje){
  const canal = txt(b.canal);
  if(!canal) throw new Recusa(400, 'diga o canal da compra: ' + CANAIS.map(c => c.nome).join(', '));
  if(!CANAIS.some(c => c.valor === canal)) throw new Recusa(400, 'o canal tem que ser um destes: ' + CANAIS.map(c => c.valor).join(', ') + ' — veio "' + canal + '"');
  const numero = txt(b.numero_externo);
  if(!numero) throw new Recusa(400, 'falta o número do pedido no fornecedor (ou no marketplace)');
  let data = txt(b.comprado_em);
  if(!data && padraoHoje) data = hoje();
  if(!data) throw new Recusa(400, 'falta a data da compra');
  if(!dataValida(data)) throw new Recusa(400, 'a data da compra tem que ser AAAA-MM-DD — veio "' + data + '"');
  if(data.slice(0, 10) > hoje()) throw new Recusa(400, 'a data da compra não pode ser no futuro');
  return { canal, loja:txt(b.loja), numero_externo:numero, comprado_em:data };
}

/* A alcada de quem CRIOU o pedido. null = sem limite. */
function alcadaDe(db, usuario_id){
  if(usuario_id == null) return null;
  return db.prepare('SELECT * FROM compra_alcada WHERE usuario_id=?').get(usuario_id) || null;
}
function precisaAprovar(db, pedido){
  const a = alcadaDe(db, pedido.criado_por_id);
  return !!a && (+pedido.valor_previsto || 0) > a.limite;
}

/* COMPRAR: rascunho -> comprado (ou aguardando_aprovacao, acima da alcada). */
function comprar(db, id, b, quem){
  const p = db.prepare('SELECT * FROM pedido_compra WHERE id=?').get(+id);
  if(!p) throw new Recusa(404, 'pedido não encontrado');
  if(p.status !== 'rascunho') throw new Recusa(409, 'este pedido não está em rascunho (' + p.status + ')');
  const c = lerCompra(b || {});
  const espera = precisaAprovar(db, p);
  db.prepare(`UPDATE pedido_compra SET canal=?, loja=?, numero_externo=?, comprado_em=?, comprado_por=?, comprado_por_id=?,
      status=?, aprovacao=? WHERE id=?`)
    .run(c.canal, c.loja, c.numero_externo, c.comprado_em, quem && quem.nome || null, quem && quem.id || null,
         espera ? 'aguardando_aprovacao' : 'comprado', espera ? 'aguardando' : 'nao_precisa', p.id);
  return { status: espera ? 'aguardando_aprovacao' : 'comprado', aguardando:espera };
}

/* APROVAR: so o aprovador da alcada de quem criou, ou o Admin Geral, com motivo. */
function aprovar(db, id, motivo, quem, ehAdminGeral){
  const p = db.prepare('SELECT * FROM pedido_compra WHERE id=?').get(+id);
  if(!p) throw new Recusa(404, 'pedido não encontrado');
  if(p.status !== 'aguardando_aprovacao') throw new Recusa(409, 'este pedido não está aguardando aprovação (' + p.status + ')');
  const a = alcadaDe(db, p.criado_por_id);
  const ok = ehAdminGeral || (a && a.aprovador_id != null && quem && +a.aprovador_id === +quem.id);
  if(!ok) throw new Recusa(403, 'só quem aprova as compras de ' + (p.criado_por || 'quem criou o pedido') + ' (ou o Admin Geral) passa este pedido para comprado');
  const m = txt(motivo);
  if(!m) throw new Recusa(400, 'diga o motivo da aprovação — ele fica gravado');
  db.prepare(`UPDATE pedido_compra SET status='comprado', aprovacao='aprovado', aprovado_por=?, aprovado_por_id=?,
      aprovado_em=datetime('now','localtime'), motivo_aprovacao=? WHERE id=?`).run(quem && quem.nome || null, quem && quem.id || null, m, p.id);
  return { status:'comprado' };
}

/* ── ALCADA ─────────────────────────────────────────────────────────────── */
function listarAlcadas(db){
  return db.prepare(`SELECT a.*, u.nome usuario_nome, ap.nome aprovador_nome FROM compra_alcada a
    LEFT JOIN usuarios u ON u.id=a.usuario_id LEFT JOIN usuarios ap ON ap.id=a.aprovador_id ORDER BY u.nome`).all();
}
function definirAlcada(db, b, quem){
  const uid = +b.usuario_id;
  if(!uid || !db.prepare('SELECT 1 FROM usuarios WHERE id=?').get(uid)) throw new Recusa(400, 'escolha a pessoa');
  const lim = num(b.limite);
  if(lim === null || lim < 0) throw new Recusa(400, 'o limite tem que ser um valor em reais maior ou igual a zero — veio "' + b.limite + '"');
  let ap = null;
  if(b.aprovador_id != null && b.aprovador_id !== ''){
    ap = +b.aprovador_id;
    if(!db.prepare('SELECT 1 FROM usuarios WHERE id=?').get(ap)) throw new Recusa(400, 'o aprovador não existe');
    if(ap === uid) throw new Recusa(400, 'a pessoa não aprova as próprias compras: escolha outro aprovador');
  }
  db.prepare(`INSERT INTO compra_alcada (usuario_id, limite, aprovador_id, definido_por, definido_por_id) VALUES (?,?,?,?,?)
    ON CONFLICT(usuario_id) DO UPDATE SET limite=excluded.limite, aprovador_id=excluded.aprovador_id,
      definido_por=excluded.definido_por, definido_por_id=excluded.definido_por_id, definido_em=datetime('now','localtime')`)
    .run(uid, lim, ap, quem && quem.nome || null, quem && quem.id || null);
  return { usuario_id:uid };
}
function tirarAlcada(db, uid){ db.prepare('DELETE FROM compra_alcada WHERE usuario_id=?').run(+uid); return {}; }

/* ── PARCELAS (R-CMP-19) ────────────────────────────────────────────────── */
const centavos = v => { const n = num(v); return n === null ? null : Math.round(n * 100); };
function parcelasDe(db, pedido_id){
  return db.prepare('SELECT * FROM pagamento_parcela WHERE pedido_id=? ORDER BY numero').all(+pedido_id);
}
function registrarParcelas(db, pedido_id, lista, quem){
  const p = db.prepare('SELECT id, status FROM pedido_compra WHERE id=?').get(+pedido_id);
  if(!p) throw new Recusa(404, 'pedido não encontrado');
  if(p.status === 'cancelado') throw new Recusa(409, 'pedido cancelado não recebe parcela');
  if(!Array.isArray(lista) || !lista.length) throw new Recusa(400, 'informe ao menos uma parcela');
  const prep = lista.map((x, i) => {
    const forma = txt(x.forma);
    if(FORMAS.indexOf(forma) < 0) throw new Recusa(400, 'parcela ' + (i + 1) + ': a forma tem que ser ' + FORMAS.join(', '));
    const v = centavos(x.valor);
    if(v === null || v <= 0) throw new Recusa(400, 'parcela ' + (i + 1) + ': o valor tem que ser maior que zero');
    const venc = txt(x.vencimento);
    if(venc && !dataValida(venc)) throw new Recusa(400, 'parcela ' + (i + 1) + ': o vencimento tem que ser AAAA-MM-DD');
    return { forma, v, venc, obs:txt(x.obs), nota_id:x.nota_id || null };
  });
  db.transaction(() => {
    let n = db.prepare('SELECT COALESCE(MAX(numero),0) n FROM pagamento_parcela WHERE pedido_id=?').get(p.id).n;
    const ins = db.prepare(`INSERT INTO pagamento_parcela (pedido_id, nota_id, numero, forma, valor_centavos, vencimento, obs, criado_por, criado_por_id)
      VALUES (?,?,?,?,?,?,?,?,?)`);
    for(const x of prep) ins.run(p.id, x.nota_id, ++n, x.forma, x.v, x.venc, x.obs, quem && quem.nome || null, quem && quem.id || null);
    derivarPago(db, p.id);
  })();
  return { parcelas:parcelasDe(db, p.id).length };
}
/* `pedido_compra.pago_em` e DERIVADO: todas as parcelas pagas = a data da
   ultima; alguma em aberto (ou nenhuma) = nao pago. */
function derivarPago(db, pedido_id){
  const l = parcelasDe(db, pedido_id);
  if(!l.length) return;
  const abertas = l.filter(x => !x.pago_em);
  if(abertas.length){ db.prepare('UPDATE pedido_compra SET pago_em=NULL, pago_por=NULL, pago_por_id=NULL WHERE id=?').run(+pedido_id); return; }
  const ult = l.slice().sort((a, b) => String(a.pago_em).localeCompare(String(b.pago_em))).pop();
  db.prepare('UPDATE pedido_compra SET pago_em=?, pago_por=?, pago_por_id=? WHERE id=?').run(ult.pago_em, ult.pago_por, ult.pago_por_id, +pedido_id);
}
function pagarParcela(db, id, quem){
  const x = db.prepare('SELECT * FROM pagamento_parcela WHERE id=?').get(+id);
  if(!x) throw new Recusa(404, 'parcela não encontrada');
  if(x.pago_em) throw new Recusa(409, 'esta parcela já está paga (' + x.pago_em + (x.pago_por ? ', por ' + x.pago_por : '') + ')');
  db.transaction(() => {
    db.prepare("UPDATE pagamento_parcela SET pago_em=datetime('now','localtime'), pago_por=?, pago_por_id=? WHERE id=?").run(quem && quem.nome || null, quem && quem.id || null, x.id);
    if(x.pedido_id) derivarPago(db, x.pedido_id);
  })();
  return { id:x.id };
}
function apagarParcela(db, id){
  const x = db.prepare('SELECT * FROM pagamento_parcela WHERE id=?').get(+id);
  if(!x) throw new Recusa(404, 'parcela não encontrada');
  if(x.pago_em) throw new Recusa(409, 'parcela paga não se apaga');
  db.transaction(() => { db.prepare('DELETE FROM pagamento_parcela WHERE id=?').run(x.id); if(x.pedido_id) derivarPago(db, x.pedido_id); })();
  return {};
}
/* O "marcar pago" de antes: sem parcela, vira UMA parcela paga do valor do
   pedido; com parcelas, paga as abertas. */
function pagarTudo(db, pedido_id, quem){
  const p = db.prepare('SELECT * FROM pedido_compra WHERE id=?').get(+pedido_id);
  if(!p) throw new Recusa(404, 'pedido não encontrado');
  db.transaction(() => {
    if(!parcelasDe(db, p.id).length)
      db.prepare(`INSERT INTO pagamento_parcela (pedido_id, numero, forma, valor_centavos, criado_por, criado_por_id, obs)
        VALUES (?,1,'transferencia',?,?,?,'marcado como pago de uma vez')`).run(p.id, Math.round((+p.valor_previsto || 0) * 100), quem && quem.nome || null, quem && quem.id || null);
    db.prepare("UPDATE pagamento_parcela SET pago_em=datetime('now','localtime'), pago_por=?, pago_por_id=? WHERE pedido_id=? AND pago_em IS NULL")
      .run(quem && quem.nome || null, quem && quem.id || null, p.id);
    derivarPago(db, p.id);
  })();
  return {};
}

/* ── COMPRA RAPIDA (R-CMP-21): material, quantidade, valor, canal, loja, numero.
   Nasce comprada — e passa pela alcada igual. */
function proximoNumero(db){
  const r = db.prepare("SELECT numero FROM pedido_compra WHERE numero LIKE 'PC-%' ORDER BY id DESC LIMIT 1").get();
  const n = r ? (parseInt(String(r.numero).replace(/\D/g, ''), 10) || 0) + 1 : 1;
  return 'PC-' + String(n).padStart(6, '0');
}
function compraRapida(db, b, quem){
  const c = db.prepare('SELECT id, nome, ativo FROM componente WHERE id=?').get(+b.componente_id);
  if(!c || !c.ativo) throw new Recusa(400, 'escolha o material (ativo)');
  const q = num(b.quantidade);
  if(q === null || q <= 0) throw new Recusa(400, 'a quantidade tem que ser maior que zero');
  const v = num(b.valor_total);
  if(v === null || v < 0) throw new Recusa(400, 'o valor total tem que ser um número maior ou igual a zero');
  const compra = lerCompra(b, true);
  const unid = txt(b.unidade_compra);
  let id;
  db.transaction(() => {
    const numero = proximoNumero(db);
    const r = db.prepare(`INSERT INTO pedido_compra (numero, fornecedor_id, status, valor_previsto, frete, observacao, criado_por, criado_por_id, rapida)
      VALUES (?,?, 'rascunho', ?, 0, ?, ?, ?, 1)`).run(numero, b.fornecedor_id ? +b.fornecedor_id : null, v, txt(b.observacao), quem && quem.nome || null, quem && quem.id || null);
    id = r.lastInsertRowid;
    db.prepare(`INSERT INTO pedido_item (pedido_id, componente_id, embalagem, fator, preco_unit, qtd_embalagem, qtd_consumo,
        unidade_compra, qtd_compra, preco_unid_compra) VALUES (?,?,?,?,?,?,?,?,?,?)`)
      .run(id, c.id, 'compra rápida', 1, v / q, q, q, unid, q, v / q);
    comprar(db, id, compra, quem);
  })();
  const p = db.prepare('SELECT status FROM pedido_compra WHERE id=?').get(id);
  return { id, status:p.status };
}

/* ── PENDENCIAS: pedido aguardando aprovacao ─────────────────────────────── */
function pendencias(db){
  const l = db.prepare("SELECT id, numero, comprado_em FROM pedido_compra WHERE status='aguardando_aprovacao' ORDER BY id").all();
  const d = l.map(x => x.comprado_em).filter(Boolean).sort();
  return { aguardando_aprovacao:{ n:l.length, desde:d[0] || null } };
}

module.exports = { Recusa, CANAIS, FORMAS, TIPOS_FORNECEDOR, ABERTOS, A_CAMINHO, lerCompra, dataValida, hoje,
  alcadaDe, precisaAprovar, comprar, aprovar, listarAlcadas, definirAlcada, tirarAlcada,
  parcelasDe, registrarParcelas, pagarParcela, apagarParcela, pagarTudo, derivarPago, compraRapida, proximoNumero, pendencias };

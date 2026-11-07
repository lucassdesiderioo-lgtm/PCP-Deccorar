/* A NOTA FISCAL DE COMPRA E O CUSTO — spec COMPRAS-E-RECEBIMENTO, fase 4
 * (R-CMP-22 a 27). Dono unico de: a nota e os itens dela, o rateio, o regime e a
 * tabela de credito, e o custo pago e liquido.
 *
 *   custo pago    = produto − desconto + frete + seguro + outras + IPI + ICMS-ST
 *   custo liquido = custo pago − os creditos que o regime permite aproveitar
 *
 * ⚠️ O CREDITO VEM DE UMA TABELA, NAO DO CODIGO (R-CMP-25): `regra_credito`
 * (regime, imposto, aproveita, vigente desde). Cada nota GRAVA o regime da data
 * dela — a compra feita no Simples nunca ganha credito retroativo quando o regime
 * mudar. E a licao do preco congelado no pedido.
 *
 * ⚠️ O CUSTO MEDIO ANDA PELO LIQUIDO ÷ O RECEBIDO (R-CMP-26), e continua sendo do
 * `componente_dominio.js`: nota lancada depois do recebimento corrige o custo
 * medio (`corrigirCustoPago`); antes, o recebimento ja entra pelo liquido.
 *
 * ⚠️ CUSTO INDEFINIDO NUNCA VIRA ZERO: valor ausente e recusa, nao zero.
 */
const DOM = require('./componente_dominio');

class Recusa extends Error{ constructor(status, msg){ super(msg); this.status = status; } }
const REGIMES = [{ valor:'simples', nome:'Simples Nacional' }, { valor:'presumido', nome:'Lucro Presumido' }, { valor:'real', nome:'Lucro Real' }, { valor:'mei', nome:'MEI' }];
const IMPOSTOS = ['icms', 'ipi'];
const CAMPOS_VALOR = ['valor_produto', 'desconto', 'frete', 'seguro', 'outras', 'ipi', 'icms', 'icms_st'];
const ROTULO = { valor_produto:'o valor do produto', desconto:'o desconto', frete:'o frete', seguro:'o seguro', outras:'outras despesas', ipi:'o IPI', icms:'o ICMS', icms_st:'o ICMS-ST', valor_pago:'o valor pago', quantidade:'a quantidade' };
const r2 = n => Math.round(n * 100) / 100;
const r6 = n => Math.round(n * 1e6) / 1e6;
const num = v => { if(v === null || v === undefined || v === '') return null; const n = parseFloat(String(v).replace(',', '.')); return Number.isFinite(n) ? n : NaN; };
function hoje(){ const t = new Date(), z = n => String(n).padStart(2, '0'); return t.getFullYear() + '-' + z(t.getMonth() + 1) + '-' + z(t.getDate()); }

/* ── REGIME E TABELA ────────────────────────────────────────────────────── */
function regimeVigente(db){
  const r = db.prepare("SELECT valor FROM config WHERE chave='regime_vigente'").get();
  return r ? r.valor : 'simples';
}
function mudarRegime(db, v){
  if(!REGIMES.some(x => x.valor === v)) throw new Recusa(400, 'o regime tem que ser: ' + REGIMES.map(x => x.valor).join(', '));
  db.prepare("INSERT INTO config (chave,valor) VALUES ('regime_vigente',?) ON CONFLICT(chave) DO UPDATE SET valor=excluded.valor").run(v);
  return { vigente:v };
}
function aproveita(db, regime, imposto, data){
  const r = db.prepare('SELECT aproveita FROM regra_credito WHERE regime=? AND imposto=? AND vigente_desde<=? ORDER BY vigente_desde DESC, id DESC LIMIT 1')
    .get(regime, imposto, String(data || hoje()).slice(0, 10));
  return !!(r && r.aproveita);
}
function regras(db){ return db.prepare('SELECT * FROM regra_credito ORDER BY regime, imposto, vigente_desde').all(); }
function novaRegra(db, b, quem){
  if(!REGIMES.some(x => x.valor === b.regime)) throw new Recusa(400, 'regime fora da lista: ' + REGIMES.map(x => x.valor).join(', '));
  if(IMPOSTOS.indexOf(b.imposto) < 0) throw new Recusa(400, 'imposto fora da lista: ' + IMPOSTOS.join(', '));
  const d = String(b.vigente_desde || '');
  if(!/^\d{4}-\d{2}-\d{2}$/.test(d)) throw new Recusa(400, 'diga desde quando a regra vale (AAAA-MM-DD)');
  const id = db.prepare('INSERT INTO regra_credito (regime, imposto, aproveita, vigente_desde, criado_por, criado_por_id) VALUES (?,?,?,?,?,?)')
    .run(b.regime, b.imposto, b.aproveita ? 1 : 0, d, quem && quem.nome || null, quem && quem.id || null).lastInsertRowid;
  return { id };
}

/* ── LANCAR A NOTA ──────────────────────────────────────────────────────── */
function lancar(db, b, quem){
  const ped = db.prepare('SELECT * FROM pedido_compra WHERE id=?').get(+b.pedido_id);
  if(!ped) throw new Recusa(404, 'pedido não encontrado');
  if(ped.status === 'cancelado') throw new Recusa(409, 'pedido cancelado não recebe nota');
  const semNota = !!b.sem_nota;
  const numero = String(b.numero || '').trim();
  if(!semNota && !numero) throw new Recusa(400, 'diga o número da nota (ou marque "sem nota")');
  const emissao = String(b.emissao || hoje()).slice(0, 10);
  if(!/^\d{4}-\d{2}-\d{2}$/.test(emissao)) throw new Recusa(400, 'a data de emissão tem que ser AAAA-MM-DD');
  const itens = Array.isArray(b.itens) ? b.itens : [];
  if(!itens.length) throw new Recusa(400, 'a nota precisa de pelo menos um item');
  const tot = {};
  for(const k of ['frete', 'desconto', 'seguro', 'outras']){
    const v = num(b[k + '_total']);
    if(Number.isNaN(v) || (v != null && v < 0)) throw new Recusa(400, ROTULO[k] + ' do total da nota tem que ser um número maior ou igual a zero');
    tot[k] = v || 0;
  }
  const prep = itens.map((it, k) => {
    const pi = it.pedido_item_id ? db.prepare('SELECT i.*, c.nome cnome FROM pedido_item i LEFT JOIN componente c ON c.id=i.componente_id WHERE i.id=? AND i.pedido_id=?').get(+it.pedido_item_id, ped.id) : null;
    if(it.pedido_item_id && !pi) throw new Recusa(400, 'o item ' + (k + 1) + ' não é deste pedido');
    const x = { pi, descricao:String(it.descricao || (pi && pi.cnome) || '').trim() || null, ncm:it.ncm ? String(it.ncm).replace(/\D/g, '') : null,
      cfop:it.cfop ? String(it.cfop).replace(/\D/g, '') : null, unidade:it.unidade || null, cprod:it.codigo_fornecedor || null };
    const q = num(it.quantidade);
    if(q === null || Number.isNaN(q) || q <= 0) throw new Recusa(400, 'item ' + (k + 1) + ': ' + ROTULO.quantidade + ' tem que ser maior que zero');
    x.quantidade = q;
    if(semNota){
      const vp = num(it.valor_pago);
      if(vp === null || Number.isNaN(vp) || vp < 0) throw new Recusa(400, 'item ' + (k + 1) + ': compra sem nota precisa do valor pago');
      x.valor_pago = vp;
      for(const c of CAMPOS_VALOR) x[c] = 0;
      x.valor_produto = vp;
    }else{
      for(const c of CAMPOS_VALOR){
        const v = num(it[c]);
        if(Number.isNaN(v) || (v != null && v < 0)) throw new Recusa(400, 'item ' + (k + 1) + ': ' + ROTULO[c] + ' tem que ser um número maior ou igual a zero — veio "' + it[c] + '"');
        x[c] = v || 0;
      }
      if(it.valor_produto == null || it.valor_produto === '') throw new Recusa(400, 'item ' + (k + 1) + ': falta ' + ROTULO.valor_produto);
    }
    return x;
  });
  /* RATEIO (R-CMP-23): frete, desconto, seguro e outras lancados so no total da
     nota sao repartidos PELO VALOR do produto entre os itens — a mesma regua do
     COMPRAS.md. O centavo que sobra do arredondamento vai para o ultimo. */
  const soma = prep.reduce((s, x) => s + x.valor_produto, 0);
  for(const k of ['frete', 'desconto', 'seguro', 'outras']){
    if(!tot[k]) continue;
    let resto = tot[k];
    prep.forEach((x, i) => {
      const parte = i === prep.length - 1 ? r2(resto) : r2(soma > 0 ? tot[k] * x.valor_produto / soma : tot[k] / prep.length);
      x[k] = r2(x[k] + parte); resto = r2(resto - parte);
    });
  }
  const regime = regimeVigente(db);
  const apICMS = aproveita(db, regime, 'icms', emissao), apIPI = aproveita(db, regime, 'ipi', emissao);
  for(const x of prep){
    x.custo_pago = semNota ? x.valor_pago : r2(x.valor_produto - x.desconto + x.frete + x.seguro + x.outras + x.ipi + x.icms_st);
    x.credito_icms = (!semNota && apICMS) ? x.icms : 0;
    x.credito_ipi = (!semNota && apIPI) ? x.ipi : 0;
    x.custo_liquido = r2(x.custo_pago - x.credito_icms - x.credito_ipi);
    if(x.custo_pago < 0) throw new Recusa(400, 'o desconto passou do valor do item "' + (x.descricao || '') + '"');
  }
  let id;
  db.transaction(() => {
    id = db.prepare(`INSERT INTO nota_compra (pedido_id, chave, numero, serie, emitente_cnpj, emitente_nome, emissao, total_produtos,
        total_desconto, total_frete, total_seguro, total_outras, total_ipi, total_icms, total_icms_st, total_nota, sem_nota, regime, origem,
        criado_por, criado_por_id) VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)`)
      .run(ped.id, b.chave ? String(b.chave).replace(/\D/g, '') : null, semNota ? null : numero, b.serie || null,
        b.emitente_cnpj ? String(b.emitente_cnpj).replace(/\D/g, '') : null, b.emitente_nome || null, emissao,
        r2(prep.reduce((s, x) => s + x.valor_produto, 0)), r2(prep.reduce((s, x) => s + x.desconto, 0)), r2(prep.reduce((s, x) => s + x.frete, 0)),
        r2(prep.reduce((s, x) => s + x.seguro, 0)), r2(prep.reduce((s, x) => s + x.outras, 0)), r2(prep.reduce((s, x) => s + x.ipi, 0)),
        r2(prep.reduce((s, x) => s + x.icms, 0)), r2(prep.reduce((s, x) => s + x.icms_st, 0)), r2(prep.reduce((s, x) => s + x.custo_pago, 0)),
        semNota ? 1 : 0, regime, b.origem || 'manual', quem && quem.nome || null, quem && quem.id || null).lastInsertRowid;
    const ins = db.prepare(`INSERT INTO nota_compra_item (nota_id, pedido_item_id, componente_id, descricao, ncm, cfop, unidade, quantidade,
        valor_produto, desconto, frete, seguro, outras, ipi, icms, icms_st, credito_icms, credito_ipi, custo_pago, custo_liquido, codigo_fornecedor)
      VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)`);
    for(const x of prep){
      x.id = ins.run(id, x.pi ? x.pi.id : null, x.pi ? x.pi.componente_id : null, x.descricao, x.ncm, x.cfop, x.unidade, x.quantidade,
        x.valor_produto, x.desconto, x.frete, x.seguro, x.outras, x.ipi, x.icms, x.icms_st, x.credito_icms, x.credito_ipi, x.custo_pago, x.custo_liquido, x.cprod).lastInsertRowid;
      if(x.pi) corrigirPeloLiquido(db, x.pi);
    }
  })();
  return { id, regime };
}

/* O LIQUIDO DE UMA UNIDADE DA CASA, quando o item do pedido tem nota. */
function liquidoDoItem(db, pedido_item_id){
  const r = db.prepare('SELECT SUM(custo_liquido) v, SUM(quantidade) q FROM nota_compra_item WHERE pedido_item_id=?').get(pedido_item_id);
  return r && r.v != null ? { valor:r.v, quantidade:r.q } : null;
}
/* A nota que chega DEPOIS do recebimento corrige o custo medio pelo que ja
   entrou: o custo de antes (o que o recebimento usou) contra o liquido ÷ o
   recebido. Fica no componente_dominio (dono unico do custo medio). */
function corrigirPeloLiquido(db, pi){
  if(!pi.componente_id) return;
  const rec = db.prepare(`SELECT SUM(qtd_contada) q, SUM(qtd_contada*custo_unit) v FROM recebimento_item
    WHERE pedido_item_id=? AND custo_unit IS NOT NULL AND (decisao IS NULL OR decisao IN ('aceitar','aceitar_reclamar','ciente'))`).get(pi.id);
  if(!rec || !(rec.q > 0)) return;
  const liq = liquidoDoItem(db, pi.id);
  if(!liq) return;
  const antigo = rec.v / rec.q, novo = liq.valor / rec.q;
  DOM.corrigirCustoPago(db, { componente_id:pi.componente_id, quantidade:rec.q, custo_antigo:antigo, custo_novo:novo });
  db.prepare('UPDATE recebimento_item SET custo_unit=? WHERE pedido_item_id=? AND custo_unit IS NOT NULL').run(r6(novo), pi.id);
}

function listar(db, q){
  const w = [], p = [];
  if(q && q.pedido_id){ w.push('n.pedido_id=?'); p.push(+q.pedido_id); }
  const l = db.prepare(`SELECT n.*, pc.numero pedido_numero FROM nota_compra n LEFT JOIN pedido_compra pc ON pc.id=n.pedido_id
    ${w.length ? 'WHERE ' + w.join(' AND ') : ''} ORDER BY n.id DESC LIMIT 300`).all(...p);
  for(const n of l) n.itens = db.prepare('SELECT * FROM nota_compra_item WHERE nota_id=? ORDER BY id').all(n.id);
  return l;
}

module.exports = { Recusa, REGIMES, IMPOSTOS, regimeVigente, mudarRegime, aproveita, regras, novaRegra, lancar, listar, liquidoDoItem, corrigirPeloLiquido };

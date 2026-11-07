/* A COMPRA PROGRAMADA — spec COMPRAS-E-RECEBIMENTO, fase 7 (R-CMP-46 a 48).
 *
 *   LISTA DO MES (R-CMP-46): para o material SEM saldo, a media mensal das
 *     compras, arredondada para a embalagem da ultima compra. E sugestao: vira
 *     pedido com um clique, editavel.
 *   AVISO PELA DATA (R-CMP-47): para o que TEM saldo,
 *       dias ate acabar = saldo ÷ consumo diario
 *       pedir ate       = hoje + dias ate acabar − prazo medido − margem
 *     Sem consumo medido, nao entra pela data, so pelo minimo — e a tela diz.
 *   MAIOR, NUNCA A SOMA (R-CMP-48): o ponto de pedido e o MAIOR entre o
 *     `estoque_minimo` digitado e o calculado pela data; sempre desconta o que
 *     esta a caminho. A mesma regua dos dois gatilhos do COMPRAS.md.
 *
 * Nenhuma conta nova de consumo, prazo ou saldo mora aqui: o consumo e do
 * contagem_material_dominio, o prazo do recebimento_dominio, o saldo do
 * componente (dono unico).
 */
const CM = require('./contagem_material_dominio');
const RD = require('./recebimento_dominio');

class Recusa extends Error{ constructor(status, msg){ super(msg); this.status = status; } }
const r3 = n => Math.round(n * 1000) / 1000;
function hojeData(){ const t = new Date(); t.setHours(12, 0, 0, 0); return t; }
const iso = d => { const z = n => String(n).padStart(2, '0'); return d.getFullYear() + '-' + z(d.getMonth() + 1) + '-' + z(d.getDate()); };

function diaDaLista(db){
  const r = db.prepare("SELECT valor FROM config WHERE chave='compra_programada_dia'").get();
  const d = r ? parseInt(r.valor, 10) : 1;
  return d >= 1 && d <= 28 ? d : 1;
}
/* A caminho e a regua do compra_dominio (A_CAMINHO): o pedido esperando
   aprovacao ainda nao foi comprado e nem aparece na fila do Recebimento
   (revisao do PR #305). */
function aCaminho(db, componente_id){
  const st = require('./compra_dominio').A_CAMINHO;
  const r = db.prepare(`SELECT COALESCE(SUM(MAX(0, i.qtd_consumo - i.qtd_recebida)),0) q FROM pedido_item i JOIN pedido_compra p ON p.id=i.pedido_id
    WHERE i.componente_id=? AND p.status IN (${st.map(() => '?').join(',')}) AND i.status IN ('aberto','parcial')`).get(componente_id, ...st);
  return r3(r.q || 0);
}
/* A embalagem da ULTIMA compra do material: o fator (unidades da casa por
   embalagem) e o nome. */
function ultimaEmbalagem(db, componente_id){
  const r = db.prepare(`SELECT i.fator, i.embalagem, i.oferta_id FROM pedido_item i JOIN pedido_compra p ON p.id=i.pedido_id
    WHERE i.componente_id=? AND p.status<>'cancelado' ORDER BY p.id DESC, i.id DESC LIMIT 1`).get(componente_id);
  if(r) return { fator: r.fator > 0 ? r.fator : 1, embalagem:r.embalagem, oferta_id:r.oferta_id };
  /* Sem compra ainda: a embalagem da oferta mais barata (por unidade), senao 1. */
  const o = db.prepare('SELECT id, fator, embalagem FROM oferta WHERE componente_id=? AND ativo=1 ORDER BY preco/fator LIMIT 1').get(componente_id);
  return o ? { fator: o.fator > 0 ? o.fator : 1, embalagem:o.embalagem, oferta_id:o.id } : { fator:1, embalagem:null, oferta_id:null };
}
const arredondar = (q, fator) => q <= 0 ? 0 : Math.ceil(q / fator - 1e-9) * fator;

function listaDoMes(db){
  const l = db.prepare("SELECT id, nome, unidade, categoria FROM componente WHERE ativo=1 AND modo_saldo='sem' ORDER BY categoria, nome").all();
  return l.map(c => {
    const m = CM.mediaDeCompra(db, c.id);
    const emb = ultimaEmbalagem(db, c.id);
    const cam = aCaminho(db, c.id);
    const sug = m.por_mes == null ? null : r3(arredondar(Math.max(0, m.por_mes - cam), emb.fator));
    return { componente_id:c.id, nome:c.nome, unidade:c.unidade, categoria:c.categoria, media_mes:m.por_mes, meses:m.meses,
      pouco_historico:m.pouco_historico, a_caminho:cam, embalagem:emb.embalagem, fator:emb.fator, sugestao:sug,
      motivo: m.por_mes == null ? 'nenhuma compra recebida ainda: não há média' : null };
  });
}

function pelaData(db){
  const hoje = hojeData();
  const l = db.prepare("SELECT id, nome, unidade, estoque, estoque_minimo, estoque_ideal, margem_dias FROM componente WHERE ativo=1 AND modo_saldo IN ('quantidade','volume') ORDER BY nome").all();
  const out = [];
  for(const c of l){
    const cons = CM.consumo(db, c.id);
    const pz = RD.prazo(db, { componente_id:c.id });
    const prazo = pz.dias != null ? pz.dias : 0;
    const margem = c.margem_dias != null ? c.margem_dias : 5;
    const cam = aCaminho(db, c.id);
    const saldo = +c.estoque || 0;
    const disponivel = r3(saldo + cam);
    const porDia = cons && cons.por_dia > 0 ? cons.por_dia : null;
    let diasAte = null, pedirAte = null, pontoData = null;
    if(porDia){
      diasAte = Math.floor(disponivel / porDia);
      const d = new Date(hoje); d.setDate(d.getDate() + diasAte - Math.ceil(prazo) - margem);
      pedirAte = iso(d);
      pontoData = r3(porDia * (prazo + margem));
    }
    const minimo = +c.estoque_minimo || 0;
    const ponto = Math.max(minimo, pontoData || 0);        // o MAIOR, nunca a soma
    const peloMinimo = minimo > 0 && disponivel <= minimo;
    const pelaDataJa = pedirAte != null && pedirAte <= iso(hoje);
    if(!peloMinimo && !pelaDataJa) continue;
    const emb = ultimaEmbalagem(db, c.id);
    const alvo = Math.max(+c.estoque_ideal || 0, ponto);
    out.push({ componente_id:c.id, nome:c.nome, unidade:c.unidade, saldo, a_caminho:cam, disponivel, minimo, ponto_data:pontoData, ponto,
      consumo_dia:porDia, prazo_dias:pz.dias, prazo_fonte:pz.fonte, margem, dias_ate_acabar:diasAte, pedir_ate:pedirAte,
      gatilho: pelaDataJa ? (peloMinimo && minimo >= (pontoData || 0) ? 'minimo' : 'data') : 'minimo',
      sem_consumo: !porDia, sugestao: r3(arredondar(Math.max(0, alvo - disponivel), emb.fator)), embalagem:emb.embalagem, fator:emb.fator });
  }
  return out;
}

function painel(db){
  const dia = diaDaLista(db);
  const hoje = hojeData();
  return { dia, hoje_e_o_dia: hoje.getDate() === dia, hoje:iso(hoje), lista_mes:listaDoMes(db), pela_data:pelaData(db) };
}

/* VIRA PEDIDO COM UM CLIQUE (editavel): rascunhos, agrupados pela oferta da
   ultima compra; quem nao tem oferta vai num rascunho sem fornecedor (para
   virar compra rapida ou ganhar fornecedor). */
function gerarPedidos(db, itens, quem){
  if(!Array.isArray(itens) || !itens.length) throw new Recusa(400, 'escolha ao menos um material');
  const D = require('./compra_dominio');
  const grupos = {};
  for(const it of itens){
    const q = +it.quantidade;
    if(!(q > 0)) throw new Recusa(400, 'a quantidade de cada material tem que ser maior que zero');
    const c = db.prepare('SELECT id, nome, custo_medio FROM componente WHERE id=? AND ativo=1').get(+it.componente_id);
    if(!c) throw new Recusa(400, 'material ' + it.componente_id + ' não existe');
    const emb = ultimaEmbalagem(db, c.id);
    const of = emb.oferta_id ? db.prepare('SELECT * FROM oferta WHERE id=? AND ativo=1').get(emb.oferta_id) : null;
    const k = of ? 'f' + of.fornecedor_id : 'sem';
    (grupos[k] = grupos[k] || []).push({ c, q, of, fator: of ? of.fator : emb.fator });
  }
  const criados = [];
  db.transaction(() => {
    for(const k of Object.keys(grupos)){
      const lista = grupos[k];
      const valor = lista.reduce((s, x) => s + (x.of ? Math.ceil(x.q / x.fator - 1e-9) * x.of.preco : x.q * (x.c.custo_medio || 0)), 0);
      const numero = D.proximoNumero(db);
      const id = db.prepare(`INSERT INTO pedido_compra (numero, fornecedor_id, status, valor_previsto, frete, observacao, criado_por, criado_por_id)
        VALUES (?,?, 'rascunho', ?, 0, 'compra programada', ?, ?)`).run(numero, lista[0].of ? lista[0].of.fornecedor_id : null, valor, quem && quem.nome || null, quem && quem.id || null).lastInsertRowid;
      for(const x of lista){
        const emb = x.of ? Math.ceil(x.q / x.fator - 1e-9) : x.q;
        db.prepare(`INSERT INTO pedido_item (pedido_id, oferta_id, componente_id, embalagem, fator, preco_unit, qtd_embalagem, qtd_consumo)
          VALUES (?,?,?,?,?,?,?,?)`).run(id, x.of ? x.of.id : null, x.c.id, x.of ? x.of.embalagem : 'un', x.of ? x.fator : 1,
            x.of ? x.of.preco : (x.c.custo_medio || 0), emb, x.of ? emb * x.fator : x.q);
      }
      criados.push({ id, numero, itens:lista.length });
    }
  })();
  return { pedidos:criados };
}

module.exports = { Recusa, diaDaLista, aCaminho, listaDoMes, pelaData, painel, gerarPedidos };

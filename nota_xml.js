/* O LEITOR DO XML DA NF-e — spec COMPRAS-E-RECEBIMENTO, fase 8 (e a porta por
 * onde a nota baixada da Receita entra na fase 11, R-CMP-55).
 *
 * Le o layout 4.00 (com ou sem o envelope `nfeProc`, com ou sem namespace) sem
 * biblioteca: o que se precisa sao algumas tags de um documento de formato
 * fixo, e uma dependencia nova seria mais uma coisa para atualizar.
 *
 * ⚠️ O QUE NAO CASA NAO E ADIVINHADO (fase 8). O item da nota casa com o item
 * do pedido por DOIS caminhos, nesta ordem:
 *   1. o codigo do produto do fornecedor (cProd) = `oferta.codigo_fornec` da
 *      oferta do item;
 *   2. o NCM = `componente.ncm` — so se UM item do pedido tem esse NCM.
 * Dois candidatos, ou nenhum, e "escolha na tela". Casar por nome parecido ou
 * por valor e o chute que este arquivo existe para nao dar.
 *
 * ⚠️ O ICMS DO SIMPLES (CSOSN) NAO TEM vICMS: o leitor devolve 0, e a nota
 * lancada no regime da empresa decide o credito pela tabela (R-CMP-25).
 */
class Recusa extends Error{ constructor(status, msg){ super(msg); this.status = status; } }

const semNs = x => String(x || '').replace(/<(\/?)[A-Za-z0-9_]+:/g, '<$1');
function bloco(x, tag){ const m = x.match(new RegExp('<' + tag + '(?:\\s[^>]*)?>([\\s\\S]*?)</' + tag + '>')); return m ? m[1] : null; }
function blocos(x, tag){ const out = [], re = new RegExp('<' + tag + '(\\s[^>]*)?>([\\s\\S]*?)</' + tag + '>', 'g'); let m; while((m = re.exec(x))) out.push({ attrs:m[1] || '', corpo:m[2] }); return out; }
function valor(x, tag){ const b = x ? bloco(x, tag) : null; return b == null ? null : b.replace(/<!\[CDATA\[|\]\]>/g, '').trim(); }
function num(x, tag){ const v = valor(x, tag); if(v == null || v === '') return 0; const n = parseFloat(v); return Number.isFinite(n) ? n : 0; }
function desescapar(t){ return t == null ? t : String(t).replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&quot;/g, '"').replace(/&apos;/g, "'").replace(/&amp;/g, '&'); }

function ler(xmlTexto){
  const x = semNs(String(xmlTexto || ''));
  const inf = blocos(x, 'infNFe')[0];
  if(!inf) throw new Recusa(400, 'isto não parece um XML de NF-e (não achei <infNFe>)');
  const id = (inf.attrs.match(/Id\s*=\s*"NFe(\d{44})"/) || [])[1] || null;
  const ide = bloco(inf.corpo, 'ide') || '', emit = bloco(inf.corpo, 'emit') || '', dest = bloco(inf.corpo, 'dest') || '';
  const tot = bloco(inf.corpo, 'ICMSTot') || '';
  const itens = blocos(inf.corpo, 'det').map(d => {
    const prod = bloco(d.corpo, 'prod') || '', imp = bloco(d.corpo, 'imposto') || '';
    const icms = bloco(imp, 'ICMS') || '', ipi = bloco(imp, 'IPI') || '';
    return { n: +((d.attrs.match(/nItem\s*=\s*"(\d+)"/) || [])[1] || 0),
      codigo_fornecedor: desescapar(valor(prod, 'cProd')), descricao: desescapar(valor(prod, 'xProd')),
      ncm: valor(prod, 'NCM'), cfop: valor(prod, 'CFOP'), unidade: valor(prod, 'uCom'),
      quantidade: num(prod, 'qCom'), valor_produto: num(prod, 'vProd'), desconto: num(prod, 'vDesc'),
      frete: num(prod, 'vFrete'), seguro: num(prod, 'vSeg'), outras: num(prod, 'vOutro'),
      icms: num(icms, 'vICMS'), icms_st: num(icms, 'vICMSST'), ipi: num(ipi, 'vIPI') };
  });
  if(!itens.length) throw new Recusa(400, 'a NF-e não tem itens (<det>)');
  return {
    chave: id || (valor(x, 'chNFe') || null), numero: valor(ide, 'nNF'), serie: valor(ide, 'serie'),
    emissao: String(valor(ide, 'dhEmi') || valor(ide, 'dEmi') || '').slice(0, 10) || null,
    emitente_cnpj: valor(emit, 'CNPJ') || valor(emit, 'CPF'), emitente_nome: desescapar(valor(emit, 'xNome')),
    destinatario_cnpj: valor(dest, 'CNPJ') || valor(dest, 'CPF'),
    total_nota: num(tot, 'vNF'), itens };
}

/* Casar os itens da nota com os do pedido — sem adivinhar. */
function casar(db, pedido_id, nota){
  const its = db.prepare(`SELECT i.id, i.componente_id, c.nome, c.ncm, o.codigo_fornec FROM pedido_item i
    LEFT JOIN componente c ON c.id=i.componente_id LEFT JOIN oferta o ON o.id=i.oferta_id WHERE i.pedido_id=? ORDER BY i.id`).all(+pedido_id);
  const ncmDe = d => String(d.ncm || '').replace(/\D/g, '');
  const porCodDe = d => d.codigo_fornecedor ? its.filter(i => i.codigo_fornec && String(i.codigo_fornec).trim().toUpperCase() === String(d.codigo_fornecedor).trim().toUpperCase()) : [];
  /* O NCM DISPUTADO NAO CASA (R-CMP-08, revisao do PR #305): dois itens da nota
     que so casariam pelo mesmo NCM iriam para o MESMO item do pedido — o
     sistema estaria adivinhando qual e qual. Os dois ficam para escolher. */
  const disputa = {};
  for(const d of nota.itens) if(porCodDe(d).length === 0 && ncmDe(d)) disputa[ncmDe(d)] = (disputa[ncmDe(d)] || 0) + 1;
  return nota.itens.map(d => {
    const porCod = porCodDe(d);
    if(porCod.length === 1) return { n:d.n, pedido_item_id:porCod[0].id, por:'codigo_fornecedor', item:porCod[0].nome };
    const porNcm = d.ncm ? its.filter(i => i.ncm && i.ncm === ncmDe(d)) : [];
    if(porNcm.length === 1 && porCod.length === 0 && disputa[ncmDe(d)] > 1)
      return { n:d.n, pedido_item_id:null, por:null, candidatos:porNcm.map(i => ({ pedido_item_id:i.id, item:i.nome })),
        motivo:'mais de um item da nota tem este NCM e nenhum tem o código do fornecedor — escolha na tela' };
    if(porNcm.length === 1 && porCod.length === 0) return { n:d.n, pedido_item_id:porNcm[0].id, por:'ncm', item:porNcm[0].nome };
    const cand = (porCod.length > 1 ? porCod : porNcm).map(i => ({ pedido_item_id:i.id, item:i.nome }));
    return { n:d.n, pedido_item_id:null, por:null, candidatos:cand,
      motivo: cand.length > 1 ? 'mais de um item do pedido serve — escolha na tela' : 'nenhum item do pedido casa pelo código do fornecedor nem pelo NCM — escolha na tela' };
  });
}

/* Os pedidos abertos do emitente (pelo CNPJ do fornecedor) — a ponte da nota
   baixada da Receita (fase 11) para o pedido. */
function pedidosDoEmitente(db, cnpj){
  const d = String(cnpj || '').replace(/\D/g, '');
  if(!d) return [];
  return db.prepare(`SELECT p.id, p.numero, p.status FROM pedido_compra p JOIN fornecedor f ON f.id=p.fornecedor_id
    WHERE REPLACE(REPLACE(REPLACE(COALESCE(f.cnpj,''),'.',''),'/',''),'-','')=? AND p.status IN ('comprado','parcial','recebido') ORDER BY p.id DESC`).all(d);
}
/* So o pedido A CAMINHO recebe nota sozinha (R-CMP-55, revisao do PR #305): o
   ja recebido aparece na tela para escolher, mas nao e adivinhado. */
function pedidosAbertosDoEmitente(db, cnpj){
  const A = require('./compra_dominio').A_CAMINHO;
  return pedidosDoEmitente(db, cnpj).filter(p => A.indexOf(p.status) >= 0);
}

/* Lanca a nota lida, com as escolhas da tela: cada item da nota com um
   pedido_item_id, ou `false` ("nao e deste pedido"). Item sem escolha recusa. */
function lancar(db, b, quem){
  const N = require('./nota_dominio');
  const nota = ler(b.xml);
  const pedido_id = +b.pedido_id;
  if(!pedido_id) throw new Recusa(400, 'escolha o pedido desta nota');
  const auto = casar(db, pedido_id, nota);
  const esc = b.escolhas || {};
  const faltam = [];
  const itens = [];
  for(const d of nota.itens){
    const a = auto.find(x => x.n === d.n);
    let pi = Object.prototype.hasOwnProperty.call(esc, String(d.n)) ? esc[String(d.n)] : (a && a.pedido_item_id);
    if(pi === undefined || pi === null || pi === '') { faltam.push(d.n + ' (' + (d.descricao || d.codigo_fornecedor || '') + ')'); continue; }
    if(pi !== false && pi !== 'nao'){
      if(!db.prepare('SELECT 1 FROM pedido_item WHERE id=? AND pedido_id=?').get(+pi, pedido_id)) throw new Recusa(400, 'a escolha do item ' + d.n + ' não é deste pedido');
      pi = +pi;
    }else pi = null;
    itens.push(Object.assign({}, d, { pedido_item_id:pi }));
  }
  if(faltam.length) throw new Recusa(400, 'escolha na tela o item do pedido de: ' + faltam.join(' · '), { faltam });
  if(nota.chave && db.prepare('SELECT 1 FROM nota_compra WHERE chave=?').get(nota.chave)) throw new Recusa(409, 'esta nota (chave ' + nota.chave + ') já foi lançada');
  const r = N.lancar(db, { pedido_id, numero:nota.numero, serie:nota.serie, chave:nota.chave, emitente_cnpj:nota.emitente_cnpj,
    emitente_nome:nota.emitente_nome, emissao:nota.emissao, origem:b.origem || 'xml', itens }, quem);
  return Object.assign(r, { itens:itens.length });
}

module.exports = { Recusa, ler, casar, pedidosDoEmitente, pedidosAbertosDoEmitente, lancar };

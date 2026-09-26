/* A VENDA CANCELADA NO MERCADO LIVRE — VENDAS-E-MEDIA, fase 2 (26/09/2026).
 *
 * Dono unico de "este volume foi cancelado?". Ate aqui a venda cancelada entre
 * o PDF subido e o envio ficava parada como `pendente` para sempre: cobrada em
 * "Faltam imprimir", contada na urgencia, na fila do dia e na media — e se a
 * etiqueta ja tivesse saido, a caixa subia no carro. A planilha do ML traz o
 * Estado de cada venda, e o import passa a cruzar isso com os volumes.
 *
 * O QUE O RELATORIO REAL MOSTROU (26/09/2026, 4.867 linhas):
 *  - a coluna "N.o de venda" traz a VENDA (2000018...) na venda comum e o PACK
 *    (2000015...) na venda em pacote — por isso o cruzamento olha `lote.venda`
 *    E `lote.packId`;
 *  - o pacote de varios produtos vem com uma linha de CABECALHO ("Pacote de 2
 *    produtos", o numero do pack, sem SKU) e uma linha por item embaixo, cada
 *    uma com a venda dela. O item cancelado acha a caixa pelo pack do cabecalho;
 *  - cancelamento sao tres frases, e todas dizem "cancel". Devolucao e
 *    reembolso acontecem DEPOIS de entregue: sao assunto da §9, nao mexem em
 *    volume (continuam fora da media da planilha, como sempre).
 *
 * AS TRES DECISOES DO DONO:
 *  D1 A — o volume cancelado ganha estagio proprio, 'cancelado'. Doze arquivos
 *         perguntam `estagio='pendente'`; um estagio novo sai de todos de uma
 *         vez, sem `cancelada_em IS NULL` espalhado por rota. O estagio de
 *         antes fica em `cancelada_estagio` — e historia, nao se apaga.
 *  D2 — o bipe do carregamento recusa a caixa cancelada (carreg/saida_route).
 *  D3 — o que ja baixou do estoque aparece no card "Canceladas depois da
 *       etiqueta" (Admin -> Bloqueados). O ESTOQUE NAO VOLTA SOZINHO: o
 *       sistema nao sabe se a persiana voltou para a prateleira.
 *
 * ⚠️ A CAIXA DE VARIAS PERSIANAS NUNCA E CANCELADA SOZINHA. Cada item do pacote
 * tem o seu Estado, e o cancelamento de um nao diz nada dos outros — cancelar
 * a caixa inteira tiraria da fila as persianas que o cliente ainda quer. Ela
 * fica como esta, marcada em `cancelada_varias`, e vai para o card.
 *
 * ⚠️ NENHUMA FUNCAO DAQUI ABRE TRANSACAO: o import grava a planilha e os
 * cancelamentos juntos, e e ele quem desfaz se algo falhar (a regra do §2).
 */

const ESTAGIO = 'cancelado';

/* So "cancel" cancela volume. A regra larga (`cancel|devolu|reembols`) continua
   valendo para tirar a venda da media da planilha, e so para isso. */
function ehCancelamento(estado){
  return /cancel/i.test(String(estado || ''));
}

/* O cabecalho do pacote de varios produtos: "Pacote de 2 produtos", sem SKU. */
function cabecalhoDePacote(estado){
  const m = String(estado || '').match(/^\s*pacote de (\d+) produtos?/i);
  return m ? +m[1] : 0;
}

function colunas(db){
  try{ return db.prepare('PRAGMA table_info(lote)').all().map(c => c.name); }catch(e){ return []; }
}
function pronto(db){
  return colunas(db).indexOf('cancelada_varias') >= 0;
}

/* Quantas persianas a caixa leva (a mesma conta do etq_route: a soma das qtd do
   lote_item; sem lote_item, uma). */
function pecas(db, id){
  try{
    const r = db.prepare('SELECT SUM(qtd) n, COUNT(*) c FROM lote_item WHERE lote_id=?').get(id);
    return r && r.c ? (r.n || 0) : 1;
  }catch(e){ return 1; }
}

/* Onde a caixa esta, e o que fazer. `carregado` so conta como "na fabrica" em
   dois lugares: no canto da coleta esperando o caminhao (a mesma regua do
   AGUARDA_CAMINHAO do carga.js) e dentro do carro de uma viagem ainda aberta. */
function onde(v){
  if(v.estagio === 'pendente' || v.estagio === 'bloqueado' || v.estagio === 'embalado') return v.estagio;
  if(v.estagio === 'carregado'){
    if(v.modalidade === 'coleta' && !v.retirado_em && !v.saida_id) return 'no_canto';
    if(v.saida_id && !v.saiu_em && v.no_carro_em) return 'no_carro';
    return 'carregado';
  }
  return null;
}

/* AS LINHAS CANCELADAS DO RELATORIO DO ML, com o pack do cabecalho no item do
   pacote de varios produtos. O import e o conferir_canceladas.js leem por aqui:
   duas leituras do mesmo arquivo seriam duas reguas para o mesmo cancelamento.
   col = { venda, estado } (indices 0-based). */
function daPlanilha(linhas, col){
  const IV = col.venda, IE = col.estado, out = [];
  let packAtual = '', restantes = 0;
  for(const l of linhas || []){
    const vid = String((l && l[IV]) || '').trim();
    if(!/^\d{6,}$/.test(vid)) continue;
    const estado = String(l[IE] || '');
    const n = cabecalhoDePacote(estado);
    const temSku = col.sku != null && String(l[col.sku] || '').trim() !== '';
    if(n && !temSku){ packAtual = vid; restantes = n; continue; }
    const pack = restantes > 0 ? packAtual : '';
    if(restantes > 0) restantes--;
    if(ehCancelamento(estado)) out.push({ numero: vid, pack, estado });
  }
  return out;
}

/* lista: [{numero, pack, estado}] — so as linhas canceladas. `pack` vem
   preenchido so no item de um pacote de varios produtos (o cabecalho).
   Devolve o resumo por estagio, que o import mostra. */
function marcar(db, lista, opts){
  const r = { pendente:0, bloqueado:0, embalado:0, no_canto:0, no_carro:0, carregado:0,
              varias:0, ja_marcada:0, nao_achada:0 };
  if(!pronto(db) || !lista || !lista.length) return r;
  const origem = (opts && opts.origem) || 'planilha';
  const achar = db.prepare(`SELECT * FROM lote WHERE COALESCE(teste,0)=0
    AND (venda=@n OR packId=@n OR (@p<>'' AND packId=@p)) ORDER BY id`);
  const cancelar = db.prepare(`UPDATE lote SET estagio='${ESTAGIO}', cancelada_estagio=estagio,
      cancelada_em=datetime('now','localtime'), cancelada_origem=?, cancelada_motivo=?,
      saida_id=CASE WHEN ? THEN NULL ELSE saida_id END,
      no_carro_em=CASE WHEN ? THEN NULL ELSE no_carro_em END,
      no_carro_por=CASE WHEN ? THEN NULL ELSE no_carro_por END
    WHERE id=?`);
  const avisar = db.prepare(`UPDATE lote SET cancelada_varias=1, cancelada_origem=?, cancelada_motivo=?,
      cancelada_aviso_em=datetime('now','localtime') WHERE id=?`);
  const vistos = new Set();
  for(const l of lista){
    const n = String(l.numero || '').trim();
    if(!n) continue;
    const vs = achar.all({ n, p: String(l.pack || '').trim() });
    if(!vs.length){ r.nao_achada++; continue; }
    for(const v of vs){
      if(vistos.has(v.id)) continue;
      vistos.add(v.id);
      if(v.estagio === ESTAGIO || v.cancelada_varias){ r.ja_marcada++; continue; }
      const lugar = onde(v);
      if(!lugar) continue;
      if(lugar === 'carregado'){ r.carregado++; continue; }   // saiu: se voltar, e devolucao
      const motivo = String(l.estado || '').trim().slice(0, 200);
      /* O item que veio debaixo de um cabecalho "Pacote de N produtos" e de
         uma caixa de varias pelo proprio arquivo — mesmo que o volume seja
         anterior ao lote_item (15/09/2026) e o sistema conheca so uma peca. */
      if(l.pack || pecas(db, v.id) > 1){ avisar.run(origem, motivo, v.id); r.varias++; continue; }
      const tirar = lugar === 'no_carro' ? 1 : 0;
      cancelar.run(origem, motivo, tirar, tirar, tirar, v.id);
      r[lugar]++;
    }
  }
  return r;
}

/* O CARD (D3): o que ja tinha baixado do estoque, ou esta na fabrica, e a caixa
   de varias persianas com um item cancelado. So mostra — decidir e da Mesa de
   correcoes, que ainda nao existe. */
function listar(db){
  if(!pronto(db)) return [];
  return db.prepare(`SELECT id, codigo, buyer, nf, venda, packId, modalidade, despachar_em, embalado_em,
      estagio, cancelada_estagio, cancelada_em, cancelada_motivo, cancelada_varias, cancelada_aviso_em,
      (SELECT SUM(qtd) FROM lote_item i WHERE i.lote_id=lote.id) pecas
    FROM lote
    WHERE COALESCE(teste,0)=0 AND (
      (estagio='${ESTAGIO}' AND cancelada_estagio IN ('embalado','carregado'))
      OR (cancelada_varias=1 AND estagio<>'carregado'))
    ORDER BY COALESCE(cancelada_em, cancelada_aviso_em) DESC, id DESC`).all();
}

module.exports = { ESTAGIO, ehCancelamento, cabecalhoDePacote, daPlanilha, marcar, listar, onde };

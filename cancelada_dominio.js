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

/* ── A SOBRA (CONFERENCIA-E-BAIXA, fase 2-B, 22/10/2026) ─────────────────────
   A caixa que ficou na fabrica — o cliente cancelou, o motorista recusou, ou
   outro motivo — e resolvida NA EXPEDICAO, pelo "Sobrou" da Conferencia: a
   pessoa bipa a etiqueta, diz o motivo e bipa o SKU de cada persiana. O
   "Motorista recusou" de 02/10/2026 virou um dos motivos, e o "a persiana
   voltou" da Mesa saiu: a Mesa nunca mexe em saldo (D7). Quem devolve o saldo
   e o `baixa_dominio.devolver`; aqui mora so o volume.

   ⚠️ A ORIGEM E 'sobra', E NAO 'conferencia': esse valor ja e do
   `conferir_canceladas.js`, e as duas origens se confundiriam. A venda que ja
   estava cancelada (pelo relatorio, ou pela recusa de antes da 2-B) mantem a
   origem dela — e historia — e so ganha a decisao.

   ⚠️ A CAIXA DE VARIAS COM UM ITEM CANCELADO NAO E SOBRA. O ML cancelou um
   item e o cliente ainda quer os outros: a caixa se refaz na Etiqueta de
   Venda. Ja a caixa de varias que sobrou INTEIRA (o motorista recusou, o
   pacote todo foi cancelado) e sobra, e volta por peca.

   Recusa (devolve {motivo, aviso}) ou null. A frase diz o que fazer: a pessoa
   esta com a caixa na mao. */
const ORIGEM_MOTORISTA = 'motorista';
const ORIGEM_SOBRA = 'sobra';
function naoSobra(v){
  if(!v) return { motivo:'nao_encontrado', aviso:'Etiqueta não encontrada. Bipe a etiqueta de VENDA da caixa que sobrou.' };
  if(v.estagio === ESTAGIO){
    if(v.cancelada_resolvida_em)
      return { motivo:'ja_decidida', aviso:'Esta caixa já foi resolvida' +
        (v.cancelada_resolvida_por ? ' por ' + v.cancelada_resolvida_por : '') + '. Não há mais nada a fazer com ela.' };
    if(v.cancelada_estagio !== 'embalado' && v.cancelada_estagio !== 'carregado')
      return { motivo:'sem_etiqueta', aviso:'Esta venda foi cancelada antes de a etiqueta de venda sair: nada saiu ' +
        'do estoque, então não há o que voltar. Separe a caixa e avise o admin.' };
    return null;
  }
  if(v.cancelada_varias)
    return { motivo:'varias_item', aviso:'O Mercado Livre cancelou só um item desta caixa de várias persianas, e o ' +
      'cliente ainda quer as outras. Ela não é sobra: refaça a caixa na Etiqueta de Venda.' };
  const lugar = onde(v);
  if(lugar === 'pendente' || lugar === 'bloqueado')
    return { motivo:'sem_etiqueta', aviso:'Esta venda ainda não teve a etiqueta impressa: nada saiu do ' +
      'estoque, então não há o que voltar. Separe a caixa e avise o admin.' };
  if(lugar === 'carregado')
    return { motivo:'ja_saiu', aviso:'O sistema diz que esta caixa já saiu da fábrica. Se ela voltou, ' +
      'é devolução: lance pela tela de Devoluções.' };
  if(!lugar) return { motivo:'nao_cabe', aviso:'Esta caixa não está num lugar em que a sobra vale.' };
  return null;
}

/* As pecas da caixa, para a tela mostrar o que a pessoa tem na mao (a soma das
   qtd do lote_item; sem lote_item, uma do lote.codigo), e se e sob medida —
   que nao tem estoque, e nao volta para prateleira nenhuma (§7). */
function pecasDaCaixa(db, v){
  let l = [];
  try{ l = db.prepare('SELECT codigo, SUM(qtd) qtd FROM lote_item WHERE lote_id=? GROUP BY codigo ORDER BY MIN(id)').all(v.id); }catch(e){}
  if(!l.length) l = [{ codigo:v.codigo, qtd:1 }];
  const sm = db.prepare(`SELECT COALESCE(m.sob_medida,0) s FROM skus k LEFT JOIN modelo m ON m.id=k.modelo_id
    WHERE UPPER(k.codigo)=UPPER(?)`);
  return l.map(p => { let s = 0; try{ const r = sm.get(p.codigo); s = r ? r.s : 0; }catch(e){}
    return { codigo:p.codigo, qtd:p.qtd, sob_medida:s ? 1 : 0 }; });
}

/* Marca a sobra. NAO abre transacao (a regra do §2): a rota abre, e devolve o
   saldo na mesma. O volume sai do canto, do carro e da saida, e ja nasce
   DECIDIDO — senao ia parar no card da Mesa, que pediria uma segunda decisao
   sobre a mesma caixa. Devolve o volume como estava, para a auditoria. */
function marcarSobra(db, id, o){
  const v = db.prepare('SELECT * FROM lote WHERE id=?').get(+id);
  const nao = naoSobra(v);
  if(nao) return Object.assign({ ok:false }, nao);
  const nome = String((o && o.quem && o.quem.nome) || '').trim() || null;
  const lugar = v.estagio === ESTAGIO ? 'cancelada' : onde(v);
  if(v.estagio !== ESTAGIO){
    const tirar = lugar === 'no_carro' ? 1 : 0;
    db.prepare(`UPDATE lote SET estagio='${ESTAGIO}', cancelada_estagio=estagio,
        cancelada_em=datetime('now','localtime'), cancelada_origem=?, cancelada_motivo=?, cancelada_por=?,
        saida_id=CASE WHEN ? THEN NULL ELSE saida_id END,
        no_carro_em=CASE WHEN ? THEN NULL ELSE no_carro_em END,
        no_carro_por=CASE WHEN ? THEN NULL ELSE no_carro_por END
      WHERE id=?`).run(ORIGEM_SOBRA, String((o && o.motivo) || '').slice(0, 200), nome, tirar, tirar, tirar, v.id);
  }
  db.prepare(`UPDATE lote SET cancelada_resolvida_em=datetime('now','localtime'), cancelada_resolvida_por=?,
      cancelada_voltou=1 WHERE id=?`).run(nome || '', v.id);
  return { ok:true, antes:v, lugar };
}

/* AS CANCELADAS QUE AINDA ESPERAM A SOBRA: a caixa com etiqueta, ainda na
   fabrica, sem decisao. A caixa de varias com um item cancelado fica de fora —
   o lugar dela e a Etiqueta de Venda, e o card da Mesa a mostra. */
function aguardandoSobra(db){
  const cols = colunas(db);
  if(cols.indexOf('cancelada_resolvida_em') < 0) return [];
  return db.prepare(`SELECT id, codigo, buyer, nf, modalidade, despachar_em, cancelada_motivo, cancelada_origem,
      cancelada_em, conferido_por, (SELECT SUM(qtd) FROM lote_item i WHERE i.lote_id=lote.id) pecas
    FROM lote
    WHERE COALESCE(teste,0)=0 AND estagio='${ESTAGIO}' AND cancelada_estagio IN ('embalado','carregado')
      AND cancelada_resolvida_em IS NULL AND COALESCE(cancelada_varias,0)=0
    ORDER BY cancelada_em, id`).all();
}

/* O CARD (D3): o que ja tinha baixado do estoque, ou esta na fabrica, e a caixa
   de varias persianas com um item cancelado.
   DESDE 02/10/2026 ELE ESVAZIA: a Mesa de correcoes (fase 1) decide cada caixa,
   e o volume decidido sai daqui. Ate aqui o card so MOSTRAVA, e por isso nunca
   zerava — numero que nao zera vira paisagem, e aí ninguem o le no dia em que
   ele significa alguma coisa. Quem escreve a marca e o `correcoes.js`.
   ⚠️ A clausula entra so quando a coluna existe: um banco que nao passou pelo
   boot do `exp_route` (um script, um teste) nao pode perder a lista inteira por
   causa de uma coluna que ninguem criou ainda. */
function listar(db){
  if(!pronto(db)) return [];
  const cols = colunas(db);
  const decidida = cols.indexOf('cancelada_resolvida_em') >= 0
    ? 'AND cancelada_resolvida_em IS NULL' : '';
  const porCol = cols.indexOf('cancelada_por') >= 0 ? 'cancelada_por' : 'NULL cancelada_por';
  return db.prepare(`SELECT id, codigo, buyer, nf, venda, packId, modalidade, despachar_em, embalado_em,
      estagio, cancelada_estagio, cancelada_em, cancelada_motivo, cancelada_varias, cancelada_aviso_em,
      cancelada_origem, ${porCol},
      (SELECT SUM(qtd) FROM lote_item i WHERE i.lote_id=lote.id) pecas
    FROM lote
    WHERE COALESCE(teste,0)=0 ${decidida} AND (
      (estagio='${ESTAGIO}' AND cancelada_estagio IN ('embalado','carregado'))
      OR (cancelada_varias=1 AND estagio<>'carregado'))
    ORDER BY COALESCE(cancelada_em, cancelada_aviso_em) DESC, id DESC`).all();
}

module.exports = { ESTAGIO, ORIGEM_MOTORISTA, ehCancelamento, cabecalhoDePacote, daPlanilha, marcar, listar, onde,
                   ORIGEM_SOBRA, naoSobra, pecasDaCaixa, marcarSobra, aguardandoSobra };

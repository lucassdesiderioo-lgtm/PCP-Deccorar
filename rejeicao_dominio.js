/* rejeicao_dominio.js — DONO ÚNICO de "registrar a peça com problema".
 *
 * A peça com problema volta para a produção e não entra na fila (R-REV-06). Ela
 * nasce em dois lugares desde 21/11/2026 (spec EMBALAGEM-DEFEITO-VOLTA):
 *   - na Revisão, pelo botão "Peça com problema" (`origem` vazia ou 'revisao');
 *   - na Embalagem, quando a peça devolvida por defeito é confirmada na Revisão
 *     (`origem` = 'embalagem', com o `setor` responsável).
 * As duas passam por aqui, para a peça com problema ser uma conta só (#12).
 *
 * ⚠️ A PEÇA COM PROBLEMA VIRA "MATERIAL EXTRA A DECIDIR" (FICHAS-NO-CADASTRO-UNICO
 *    §3-G), na mesma transação, num ponto de salvamento próprio: falhou, vai ao
 *    log e a peça com problema fica registrada do mesmo jeito (#6). A peça sob
 *    medida do PCP (sem ficha aqui) não entra.
 * ⚠️ O DOMÍNIO NÃO ABRE TRANSAÇÃO PRÓPRIA DE FORA: quem chama abre (R-EST-07).
 */
const ORIGENS = ['revisao', 'embalagem'];

function garantir(db){
  try{ db.exec('ALTER TABLE rejeicao ADD COLUMN origem TEXT'); }catch(e){}
  try{ db.exec('ALTER TABLE rejeicao ADD COLUMN setor TEXT'); }catch(e){}
}

/* d: { codigo, motivo, obs, segundos, modo, origem, setor }  quem: { usuario_id, usuario_nome } */
function registrar(db, d, quem){
  const cod = String(d.codigo || '').trim().toUpperCase();
  const rid = db.prepare(`INSERT INTO rejeicao (codigo,motivo,obs,segundos,modo,usuario,usuario_id,origem,setor)
    VALUES (?,?,?,?,?,?,?,?,?)`).run(cod, d.motivo, d.obs || null, Math.round(+d.segundos || 0), d.modo || null,
      quem.usuario_nome, quem.usuario_id, d.origem || null, d.setor || null).lastInsertRowid;
  let sm = false;
  try{ const m = db.prepare('SELECT COALESCE(m.sob_medida,0) s FROM skus s LEFT JOIN modelo m ON m.id=s.modelo_id WHERE s.codigo=?').get(cod); sm = !!(m && m.s); }catch(e){ sm = false; }
  if(!sm) try{ db.transaction(() => require('./material_extra_dominio').registrarRevisao(db, { sku:cod, referencia:'rejeicao:' + rid,
    motivo:d.motivo + (d.obs ? ' — ' + d.obs : ''), quem:{ id:quem.usuario_id, nome:quem.usuario_nome } }))(); }
  catch(e){ console.error('[rejeicao] o material extra de ' + cod + ' nao gravou (a peca com problema ficou registrada):', e.message); }
  return rid;
}

module.exports = { ORIGENS, garantir, registrar };

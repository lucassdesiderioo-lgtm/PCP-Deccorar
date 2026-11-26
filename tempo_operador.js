/* tempo_operador.js — DONO ÚNICO de "qual é a mediana desta pessoa nesta
 * atividade?" (spec TEMPO-NA-BANCADA, cartão R-TEM-01, 21/11/2026).
 *
 * Ao terminar a peça, a tela mostra duas barras — "Agora" e "Sua média" — e o
 * aviso "Parabéns!" (fez no tempo da mediana ou mais rápido) ou "Você pode
 * melhorar" (passou dela). A conta mora aqui; a tela só desenha.
 *
 * ⚠️ "Sua média" é a MEDIANA (decisão do dono): uma peça parada 20 minutos não
 *    puxa o número. A mediana é a do produtividade_dominio, não uma segunda.
 * ⚠️ Só a própria pessoa, pelo id do login. A linha sem id não é de ninguém.
 * ⚠️ A peça que acabou de terminar não entra na conta dela mesma.
 * ⚠️ Sem peça do SKU nos 30 dias, a mediana de TODOS os SKUs (base 'geral');
 *    sem nenhuma, null — nunca um zero inventado.
 *
 * TELA NOVA QUE MEDE TEMPO DO OPERADOR registra a atividade em ATIVIDADES e
 * devolve `tempo` no bipe que fecha a peça.
 */
const { mediana } = require('./produtividade_dominio');

const JANELA_DIAS = 30;
/* As do corte e da montagem da persiana (PRODUCAO-MAPA-E-MOTOR v7, §14.4): o
   tempo e do LOTE, e a peca vale o lote ÷ as pecas boas. A entrada inicial da
   virada (§14.10) nao conta. */
const LOTE_CORTE = tipo => ({ sql:`SELECT CAST(segundos AS REAL)/(quantidade - perdidas) s FROM corte_lote
    WHERE usuario_id=? AND tipo='${tipo}' AND situacao='fechado' AND entrada_inicial=0 AND segundos>0
      AND (quantidade - perdidas)>0 AND id<>? AND date(fim) >= date('now','localtime','-${JANELA_DIAS} days')`, campo:'item' });
const ATIVIDADES = { revisao:'revisao', montagem:'montagem',
  corte_tecido:LOTE_CORTE('tecido'), corte_tubo:LOTE_CORTE('tubo'),
  montagem_persiana:{ sql:`SELECT CAST(segundos AS REAL)/quantidade s FROM montagem_lote
    WHERE usuario_id=? AND situacao='fechado' AND segundos>0 AND quantidade>0 AND id<>?
      AND date(fim) >= date('now','localtime','-${JANELA_DIAS} days')`, campo:'sku' } };

function tempos(db, tabela, uid, codigo, excluirId){
  if(typeof tabela === 'object'){
    const args = [uid, excluirId == null ? -1 : excluirId]; if(codigo) args.push(String(codigo).toUpperCase());
    return db.prepare(tabela.sql + (codigo ? ' AND UPPER(' + tabela.campo + ')=?' : '')).all(...args).map(r => Math.round(+r.s));
  }
  const sql = `SELECT segundos s FROM ${tabela}
    WHERE usuario_id=? AND COALESCE(teste,0)=0 AND segundos>0 AND id<>?
      AND data >= date('now','localtime','-${JANELA_DIAS} days')`
    + (codigo ? ' AND UPPER(codigo)=?' : '');
  const args = [uid, excluirId == null ? -1 : excluirId]; if(codigo) args.push(String(codigo).toUpperCase());
  /* SEM catch aqui (③ REVISÃO): a consulta que falha sobe até o `seguro`, que
     loga e devolve null. Engolida, ela virava lista vazia — "primeira peça" para
     quem tem 200 no mês, calado. */
  return db.prepare(sql).all(...args).map(r => +r.s);
}

/* { segundos, mediana, base:'sku'|'geral'|null, n, aviso:'parabens'|'melhorar'|null } */
function doBipe(db, atividade, uid, codigo, segundos, excluirId){
  const tabela = ATIVIDADES[atividade];
  if(!tabela) throw new Error('atividade sem tempo registrado: ' + atividade);
  const seg = Math.round(+segundos || 0);
  const vazio = { segundos:seg, mediana:null, base:null, n:0, aviso:null };
  if(uid == null) return vazio;
  let base = 'sku', v = tempos(db, tabela, uid, codigo, excluirId);
  if(!v.length){ base = 'geral'; v = tempos(db, tabela, uid, null, excluirId); }
  if(!v.length) return vazio;
  const m = mediana(v);
  return { segundos:seg, mediana:m, base, n:v.length, aviso: seg <= m ? 'parabens' : 'melhorar' };
}

/* O bipe que gravou não pode falhar por causa da conta: erro vira null. */
function seguro(db, atividade, uid, codigo, segundos, excluirId){
  try{ return doBipe(db, atividade, uid, codigo, segundos, excluirId); }
  catch(e){ console.error('[tempo_operador]', e.message); return null; }
}

module.exports = { doBipe, seguro, JANELA_DIAS, ATIVIDADES };

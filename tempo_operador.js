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
const ATIVIDADES = { revisao:'revisao', montagem:'montagem' };

function tempos(db, tabela, uid, codigo, excluirId){
  const sql = `SELECT segundos s FROM ${tabela}
    WHERE usuario_id=? AND COALESCE(teste,0)=0 AND segundos>0 AND id<>?
      AND data >= date('now','localtime','-${JANELA_DIAS} days')`
    + (codigo ? ' AND UPPER(codigo)=?' : '');
  const args = [uid, excluirId == null ? -1 : excluirId]; if(codigo) args.push(String(codigo).toUpperCase());
  try{ return db.prepare(sql).all(...args).map(r => +r.s); }catch(e){ return []; }
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

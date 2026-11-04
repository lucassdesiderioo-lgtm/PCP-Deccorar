/* O RELOGIO DA CONFERENCIA — "que horas sao para a lista do dia?"
 *
 * Spec ESTOQUE-LIVRO-E-CONFERENCIA v2 (04/11/2026): a lista diaria nasce as 7h,
 * de segunda a sexta, e as 10h abre para todo o setor. A regra depende da hora,
 * e um teste que so pudesse rodar as 7h de uma terca nao seria teste.
 *
 * ⚠️ EM PRODUCAO ESTE ARQUIVO E SO O RELOGIO DO SERVIDOR. As duas portas de
 * trocar a hora sao de teste:
 *   - `fixar(texto)`, no mesmo processo (teste que chama os handlers direto);
 *   - `PCP_RELOGIO_ARQUIVO`, um arquivo com a hora dentro, lido a cada
 *     pergunta (teste que sobe o servidor de verdade). Sem a variavel — que e o
 *     caso do servidor, que sobe com `pm2 start server.js` — ele nunca e lido.
 *
 * A hora e a LOCAL (a mesma do `datetime('now','localtime')` do SQLite), no
 * formato do banco: 'AAAA-MM-DD HH:MM:SS'.
 */
const fs = require('fs');
let fixo = null;

function doisDig(n){ return String(n).padStart(2, '0'); }
function formatar(d){
  return d.getFullYear() + '-' + doisDig(d.getMonth() + 1) + '-' + doisDig(d.getDate()) + ' ' +
         doisDig(d.getHours()) + ':' + doisDig(d.getMinutes()) + ':' + doisDig(d.getSeconds());
}
const FORMA = /^\d{4}-\d{2}-\d{2} \d{2}:\d{2}(:\d{2})?$/;
function normal(t){ t = String(t || '').trim().replace('T', ' '); if(!FORMA.test(t)) return null; return t.length === 16 ? t + ':00' : t; }

function agora(){
  if(fixo) return fixo;
  const arq = process.env.PCP_RELOGIO_ARQUIVO;
  if(arq){ try{ const t = normal(fs.readFileSync(arq, 'utf8')); if(t) return t; }catch(e){} }
  return formatar(new Date());
}
function fixar(t){ fixo = t == null ? null : normal(t); if(t != null && !fixo) throw new Error('hora invalida: ' + t); }
function hoje(){ return agora().slice(0, 10); }
function hora(){ return agora().slice(11, 16); }           // 'HH:MM'
/* Dia da semana de uma data 'AAAA-MM-DD': 0 domingo ... 6 sabado. Pela data, e
   nao pelo Date local, para nao depender do fuso de quem roda. */
function diaSemana(data){ const [a,m,d] = String(data).split('-').map(Number); return new Date(Date.UTC(a, m - 1, d)).getUTCDay(); }
function somarDias(data, n){
  const [a,m,d] = String(data).split('-').map(Number);
  const x = new Date(Date.UTC(a, m - 1, d + n));
  return x.getUTCFullYear() + '-' + doisDig(x.getUTCMonth() + 1) + '-' + doisDig(x.getUTCDate());
}
module.exports = { agora, hoje, hora, fixar, diaSemana, somarDias, formatar };

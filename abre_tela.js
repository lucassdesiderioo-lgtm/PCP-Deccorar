/* abre_tela.js — "esta pessoa abre esta tela?", para as DUAS operações (spec
 * docs/specs/PENDENCIAS-NO-MENU.md, fase 3, 12/11/2026).
 *
 * A medida padrão responde pelo portão do PCP (`acesso.decidir`). O sob medida
 * tem PORTÃO PRÓPRIO (tecido/montar.js), que o `decidir` não conhece: a resposta
 * é a dele — as chaves do PCP (`permissoesDe`) viram o usuário de lá
 * (`daSessaoDoPcp`), e a tela vale pelo `pode` de lá, com a permissão declarada
 * em `tecido/nucleo/telas.js`. ⚠️ NÃO É "TEM A CHAVE sobmedida.X": quem está num
 * setor de bancada entra PELO SETOR, sem a chave escrita (③ REVISÃO da fase 3 da
 * ORGANIZACAO-DO-SISTEMA).
 *
 * Um lugar só para esta conta: o ☰ Menu (admin_telas.js), a etiqueta das
 * pendências e a caixinha "Abrir em Pendências" perguntam aqui. Duas cópias
 * divergiriam no primeiro ajuste (#12).
 */
const PRE = '/sobmedida';

/* O usuário do sob medida desta pessoa, ou null (sem entrada no módulo). */
function usuarioSm(ac, u){
  if(!u || !ac) return null;
  try{ return require('./tecido/nucleo/acesso').daSessaoDoPcp(u, Array.from(ac.permissoesDe(u.id))); }
  catch(e){ return null; }
}

function ehSobMedida(rota){ return rota === PRE || String(rota || '').indexOf(PRE + '/') === 0; }

/* `sm` (opcional): o usuário do sob medida já montado, para não remontar. */
function abreSm(sm, rota){
  if(!sm) return false;
  try{
    const decl = require('./tecido/nucleo/telas').TELAS[String(rota).slice(PRE.length) || '/'];
    return !!(decl && require('./tecido/nucleo/permissoes').pode(sm, decl.permissao));
  }catch(e){ return false; }
}

function abre(ac, u, rota, sm){
  if(!u || !ac || !rota) return false;
  if(ehSobMedida(rota)) return abreSm(sm === undefined ? usuarioSm(ac, u) : sm, rota);
  try{ return !!ac.decidir(u, rota, 'GET').ok; }catch(e){ return false; }
}

/* A tela do mapa pelo número, nas duas operações (as 6xx moram no tecido). */
function telaDe(n){
  const M = require('./telas');
  return M.TELAS.find(t => t.n === +n) || M.telasSobMedida().find(t => t.n === +n) || null;
}

module.exports = { usuarioSm, abreSm, abre, ehSobMedida, telaDe };

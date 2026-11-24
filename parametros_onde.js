/* parametros_onde.js — DONO ÚNICO de "este parâmetro vale em que tela" (AJUSTE
 * de 24/11/2026, decisão do dono: na 906 Parâmetros, todo ajuste diz de qual
 * tela é, senão a informação fica perdida).
 *
 * Aqui mora só a ligação chave → números de tela. O número, o nome e o endereço
 * saem dos dois mapas (`telas.js` e `tecido/nucleo/telas.js`), nunca escritos à
 * mão: a tela que muda de nome muda também na 906.
 *
 * ⚠️ PARÂMETRO NOVO NA 906 ENTRA AQUI. O `teste_parametros_onde.js` reprova o
 * parâmetro do sob medida (do banco de lá) e os da medida padrão sem a tela.
 */
'use strict';
const M = require('./telas');

const ONDE = {
  // medida padrão
  emb_minimo_seg:       [102],
  rev_minimo_seg:       [101],
  conf_carregamento:    [202],
  // sob medida: o plano de corte
  larguraMinimaSobra:   [602],
  alturaMinimaSobra:    [602],
  pesoSobra:            [602],
  margem:               [602],
  corteTempoMaxHoras:   [602, 607],
  // a lista de medidas da sobra
  sobraLarguraMin:      [603],
  sobraLarguraMax:      [603],
  sobraAlturaMin:       [603],
  sobraAlturaMax:       [603],
  // a etiqueta da sobra e a do rolo
  etqFonteCodigo:       [605],
  etqBarraAltura:       [605],
  etqLargura:           [605],
  etqAltura:            [605],
  etqMargem:            [605],
  etqRoloFonte:         [604],
  etqRoloLargura:       [604],
  etqRoloAltura:        [604],
  etqRoloBarra:         [604],
  etqRoloMargem:        [604],
  // o estoque mínimo e o parado, no painel
  estMinDias:           [607],
  estMinSeguranca:      [607],
  paradoDias:           [607],
  // o pedido e o prazo
  pedidoNumeroInicial:  [611],
  prazoCorteDiaSemana:  [611, 610],
  prazoCorteHora:       [611, 610],
  prazoEntregaDiaSemana:[611, 610],
  prazoSemanas:         [611, 610],
  // a bancada e o crédito
  bipeAbertoMaxHoras:   [613, 615],
  creditoRevisaoMeses:  [616]
};

/* A tela pelo número, nos dois mapas: { n, nome, rota }, ou null. */
function tela(num){
  const t = M.porNumero(num);
  if(t) return { n:t.n || num, nome:t.nome, rota:t.rota };
  const s = M.telasSobMedida().find(x => x.n === num);
  return s ? { n:s.n, nome:s.nome, rota:s.rota } : null;
}

/* { chave: [{n, nome, rota}] } — o que a 906 desenha. */
function mapa(){
  const out = {};
  for(const [chave, nums] of Object.entries(ONDE)) out[chave] = nums.map(tela).filter(Boolean);
  return out;
}

module.exports = { ONDE, mapa, tela };

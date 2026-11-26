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
  etiqueta_parada_dias: [401],   // a etiqueta da producao parada (PRODUCAO-MAPA-E-MOTOR v7)
  // sob medida: o plano de corte
  larguraMinimaSobra:   [602],
  alturaMinimaSobra:    [602],
  pesoSobra:            [602],
  margem:               [602],
  // a lista de medidas da sobra
  sobraLarguraMin:      [602, 603],
  sobraLarguraMax:      [602, 603],
  sobraAlturaMin:       [602, 603],
  sobraAlturaMax:       [602, 603],
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
  // o tempo do corte só sai no painel (o corte não lê o número)
  corteTempoMaxHoras:   [607],
  // o pedido e o prazo
  pedidoNumeroInicial:  [611],
  prazoCorteDiaSemana:  [611, 610],
  prazoCorteHora:       [611, 610],
  prazoEntregaDiaSemana:[611, 610],
  prazoSemanas:         [611, 610],
  feriados:             [611, 610],   // o card de feriados: empurram o prazo
  // o bipe longo só sai dos indicadores (a bancada não lê o número), e o crédito
  bipeAbertoMaxHoras:   [615],
  creditoRevisaoMeses:  [616, 610]
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

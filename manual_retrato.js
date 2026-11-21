#!/usr/bin/env node
/* manual_retrato.js — regrava docs/manual/retrato.json, e RECUSA quando o que
 * mudou não veio com a linha datada em "Mudanças" (spec MANUAL-DO-SISTEMA,
 * §3.3 regra 9 e §8.1 B).
 *
 *   node manual_retrato.js          regrava, ou recusa dizendo o quê
 *
 * O retrato guarda, por ficha, a impressão digital do corpo (tudo menos a
 * seção "Mudanças"), a última linha de "Mudanças", a situação e as ações da
 * tela; e, por cartão de docs/regras/ citado em alguma ficha, a impressão
 * digital do cartão. O teste_manual.js exige que ele bata com os arquivos.
 *
 * ⚠️ ELE NÃO SE REGRAVA PARA O TESTE PASSAR. Quem muda o texto de uma ficha,
 * a regra de um cartão que ela cita ou pendura um botão novo na tela escreve
 * a linha em "Mudanças" — é dela que a 907 monta o "O que mudou" — e só então
 * este script regrava. Sem a linha, ele diz o que falta e não toca no arquivo.
 * É o mesmo aviso do teste_mapa_antes.json: regravar é apagar a prova.
 *
 * Não toca no banco nem na rede. Só lê docs/ e escreve o retrato.
 */
'use strict';
const MAN = require('./manual');

function rodar(opts){
  opts = opts || {};
  const L = MAN.lerTudo(opts);
  const saida = { recusas:[], problemas:[], gravou:false, fichas:L.fichas.size };
  if(L.erros.length){ saida.problemas = L.erros.slice(); }
  saida.problemas = saida.problemas.concat(MAN.validar(L));
  const antigo = MAN.lerRetrato(L.pastaManual);
  const novo = MAN.retratoDe(L);
  saida.recusas = MAN.confrontar(antigo, novo, L);
  if(saida.recusas.length || saida.problemas.length){
    if(!opts.calado){
      if(saida.problemas.length){ console.log('\nA FICHA ESTÁ FORA DO FORMATO (' + saida.problemas.length + '):'); saida.problemas.forEach(p => console.log('  · ' + p)); }
      if(saida.recusas.length){ console.log('\nRECUSADO — mudou sem a linha em "Mudanças" (' + saida.recusas.length + '):'); saida.recusas.forEach(r => console.log('  · ' + r));
        console.log('\nEscreva a linha "- dd/mm/aaaa — o que mudou, para quem usa a tela" na seção "Mudanças" da ficha e rode de novo.'); }
      console.log('\nO retrato NÃO foi regravado.\n');
    }
    return saida;
  }
  MAN.gravarRetrato(novo, L.pastaManual);
  saida.gravou = true;
  if(!opts.calado){
    const dif = MAN.diferencas(antigo, novo);
    console.log('\nretrato ok -> ' + L.pastaManual + '/retrato.json | ' + L.fichas.size + ' fichas · ' + Object.keys(novo.cartoes).length + ' cartões citados'
      + (antigo ? (dif.length ? ' | mudou: ' + dif.join(', ') : ' | nada mudou') : ' | primeiro retrato') + '\n');
  }
  return saida;
}

if(require.main === module){
  const s = rodar({});
  process.exit(s.recusas.length || s.problemas.length ? 1 : 0);
}
module.exports = { rodar };

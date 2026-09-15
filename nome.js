/* DONO UNICO DE "ESTES DOIS NOMES SAO A MESMA PESSOA?".
 *
 * A pergunta aparece em dois lugares que nao se falam: a conferencia 2 do
 * upload (parse.js — "o comprador da etiqueta e o do item?") e a conferencia de
 * NF (conferir_nf.js — "os volumes desta nota sao do mesmo cliente?"). Sao a
 * mesma pergunta, e com duas reguas a segunda chamaria de gente diferente quem
 * a primeira ja aceitou como a mesma pessoa — uma lista de alarme cheia de
 * falso positivo, que e a armadilha #10: trava que acusa inocente para de
 * proteger contra o culpado.
 *
 * Nao carrega o pdf.js. E de proposito: comparar nome nao precisa do leitor de
 * PDF, e uma ferramenta que roda em producao nao devia arrastar meio parser
 * atras de uma comparacao de string.
 */

/* A forma em que dois nomes viram comparaveis: sem acento, sem pontuacao, sem
   caixa. Nada mais — cada coisa que se "limpa" a mais aqui e uma diferenca que
   deixa de ser vista. */
function nomeChave(s){
  return String(s||'').toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g,'')
    .replace(/[^a-z ]/g,' ').replace(/\s+/g,' ').trim();
}

/* O MESMO NOME COM LETRA REPETIDA A MAIS OU A MENOS.
 *
 * Existe para UM caso, e ele e estreito de proposito: "Ryta de Kassia Andrade
 * Rufiino" na etiqueta e "...Rufino" na folha. E a mesma pessoa com a letra
 * dobrada — digitacao do proprio Mercado Livre, nao troca de cliente.
 *
 * A tentacao aqui e usar distancia de edicao ("ate 2 letras de diferenca"), e
 * ela ABRE UM BURACO exatamente onde nao pode: "Marcelo Sousa Silva" e "Marcela
 * Sousa Silvo" tambem estao a duas letras, e sao duas pessoas. Um nome trocado
 * por outro e o erro que esta conferencia existe para pegar — ela e a UNICA que
 * nao depende do Pack ID, que e justamente o numero que desalinha.
 *
 * Entao a tolerancia nao mede distancia: ela colapsa letras repetidas dos dois
 * lados e exige igualdade. "rufiino" e "rufino" viram o mesmo; "marcelo" e
 * "marcela" continuam diferentes, porque ali a letra foi TROCADA, nao dobrada.
 * So passa quem difere unicamente na repeticao — o que, num nome inteiro,
 * significa a mesma pessoa escrita duas vezes.
 */
function mesmoNomeComRepeticao(a,b){
  const colapsa=s=>String(s||'').replace(/(.)\1+/g,'$1');
  const x=colapsa(a), y=colapsa(b);
  return !!x && x===y;
}

/* "Estes dois nomes sao a mesma pessoa?" — a regra inteira num lugar so:
   igualdade, um contido no outro (nome abreviado de um lado), ou a letra
   dobrada do proprio ML. Nunca letra TROCADA.
   Devolve NULL quando falta um dos lados: nome que nao deu pra ler nao e "outra
   pessoa", e silencio por falta de dado nunca pode virar acusacao (§5). Por
   isso quem chama compara com `===false`, e nao com `!`. */
function mesmoCliente(a,b){
  const x=nomeChave(a), y=nomeChave(b);
  if(!x||!y) return null;
  return x===y || x.indexOf(y)>=0 || y.indexOf(x)>=0 || mesmoNomeComRepeticao(x,y);
}

module.exports={nomeChave,mesmoNomeComRepeticao,mesmoCliente};

/* Decomposicao do codigo do SKU — parser unico do projeto.
 *
 * Formato (§7 do CLAUDE.md):  PREFIXO + largura(3) + altura(3) + COR
 * Exemplo: BK160140CINZA = Blackout, 1,60 m x 1,40 m, cinza.
 *
 * Esta funcao morava dentro do <script> do public/index.html e so existia no
 * navegador. Foi movida para ca — sem mudanca de comportamento, mesmo nome e
 * mesma assinatura — porque a migracao da Fase 0 roda em Node e precisa dela.
 * Escrever um parser novo do lado do servidor daria uma quarta estrategia de
 * normalizacao num projeto que ja tem tres; o objetivo da fase e reduzir isso.
 *
 * ATENCAO ao que ela passou a ser: depois da Fase 0, medida e cor se leem das
 * COLUNAS de `skus`. Esta funcao e conveniencia de cadastro — preenche o
 * formulario quando alguem digita o codigo, e alimentou a migracao uma vez.
 * Nao e mais fonte da verdade. Nao a use para decidir nada em tempo de execucao.
 *
 * As copias em public/operador.html e public/devolucao.html continuam de pe e
 * cravam o prefixo BK. Sao dividas conhecidas; a limpeza vem depois, com teste,
 * porque sao telas de operacao.
 *
 * Devolve null para codigo fora do padrao — inclusive o legado BK110X240BEGE
 * (§14, item 7). Fora do padrao NUNCA vira chute: quem chama trata o null.
 */
(function(raiz){
  function medidaDe(cod){
    var m=/^([A-Z]+?)(\d{3})(\d{3})([A-Z]+)$/.exec(String(cod||"").toUpperCase());
    if(!m) return null;
    return {fam:m[1],larg:+m[2],alt:+m[3],cor:m[4]};
  }
  if(typeof module!=="undefined"&&module.exports) module.exports={medidaDe:medidaDe};
  else raiz.medidaDe=medidaDe;
})(typeof self!=="undefined"?self:this);

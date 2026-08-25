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
 * ATENCAO ao que ela passou a ser: NAO HA MAIS PADRAO DE SKU. O codigo e uma
 * etiqueta livre — pode ser o que a operacao quiser. Medida, cor, modelo e
 * tecido se leem das COLUNAS de `skus`, e so delas.
 *
 * Sobrou UM uso, e e conveniencia de digitacao: quando alguem cadastra um SKU
 * cujo codigo por acaso segue o formato antigo, o formulario adianta largura,
 * altura e cor. Os campos seguem editaveis e o que salva e o campo.
 *
 * NUNCA deduza MODELO daqui. O prefixo 'BK' e o TECIDO (blackout); o modelo e o
 * mecanismo (Rolo). A primeira migracao da Fase 0 confundiu os dois — foi
 * exatamente o erro que estas colunas existem para impedir.
 *
 * As telas de operacao (operador.html, devolucao.html) e a etiqueta ja nao
 * chamam esta funcao: leem as colunas.
 *
 * Devolve null para qualquer codigo que nao siga o formato antigo. Null NUNCA
 * vira chute: quem chama simplesmente nao adianta nada.
 */
(function(raiz){
  function medidaDe(cod){
    var m=/^([A-Z]+?)(\d{3})(\d{3})([A-Z]+)$/.exec(String(cod||"").toUpperCase());
    if(!m) return null;
    return {fam:m[1],larg:+m[2],alt:+m[3],cor:m[4]};
  }

  /* O QUE A PECA E, em uma linha, pra pessoa comparar com a peca na mao.
   *
   * Formatador unico: a embalagem e a etiqueta de venda mostram a MESMA frase.
   * Duas telas escrevendo a medida cada uma do seu jeito ensinariam a equipe
   * a achar que sao coisas diferentes.
   *
   * Le SO as colunas (§7) — nunca o texto do codigo. Medida so entra quando o
   * modelo cobra medida: acessorio nao tem, e "null x null" na tela ensina o
   * operador a ignorar a linha inteira.
   */
  function pecaDeSku(s){
    s=s||{};
    var exige = (s.exige_medida===undefined||s.exige_medida===null) ? 1 : s.exige_medida;
    return {
      medida: (exige && s.largura_cm && s.altura_cm) ? (s.largura_cm+" × "+s.altura_cm) : null,
      cor:    s.cor_nome || s.cor_codigo || s.cor || null,
      tecido: s.tecido_nome || s.tecido_codigo || null,
      modelo: s.modelo_nome || null
    };
  }
  function pecaTexto(p){
    if(!p) return "";
    var partes=[];
    if(p.medida) partes.push(p.medida+" cm");
    if(p.cor) partes.push(p.cor);
    if(p.tecido) partes.push(p.tecido);
    if(p.modelo) partes.push(p.modelo);
    return partes.join(" · ");
  }
  var api={medidaDe:medidaDe,pecaDeSku:pecaDeSku,pecaTexto:pecaTexto};
  if(typeof module!=="undefined"&&module.exports) module.exports=api;
  else for(var k in api) raiz[k]=api[k];
})(typeof self!=="undefined"?self:this);

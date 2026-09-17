/* kit_bipe.js — "o que foi bipado é o kit?", e esta é a ÚNICA régua.
 *
 * Saiu de dentro do <script> do montagem.html em 17/09/2026 (dívida 14 do §14).
 * O motivo é o de sempre neste projeto: a partir dali o SERVIDOR passou a
 * conferir o kit também (`POST /api/montagem`), e duas cópias desta função
 * seriam duas respostas para a mesma pergunta — a tela aceitando um bipe que o
 * servidor recusa, ou o contrário, no dia em que uma das duas mudasse. É o
 * mesmo arranjo do `public/barras.js` (que serve o sob medida e a etiqueta do
 * kit) e do `public/kit_etiqueta.js` (que o `kit_pdf.js` lê do back).
 *
 * A comparação ignora símbolos de propósito: o leitor com teclado ABNT2
 * embaralha a pontuação do link do Drive (`:` vira `Ç`, `/` vira `;`), mas o
 * miolo alfanumérico é o mesmo. Por isso bate tanto bipando o QR quanto
 * digitando a URL limpa.
 */
(function(raiz){
  function kitNorm(x){ return String(x||'').replace(/[^A-Za-z0-9]/g,'').toUpperCase(); }
  // maior sequencia continua de letras/numeros — no link do Drive e o ID da
  // pasta, que e igual em qualquer forma do link (/folders/, /u/1/folders/, ?usp).
  function kitTok(x){ var m=String(x||'').toUpperCase().match(/[A-Z0-9]+/g)||[]; return m.reduce(function(a,b){return b.length>a.length?b:a;},''); }
  // Bate o kit ignorando simbolos: pelo miolo alfanumerico (um conter o outro)
  // OU pelo ID da pasta (maior token). Min 12 chars evita casar por acaso.
  function kitBate(lido, cad){
    var a=kitNorm(lido), b=kitNorm(cad);
    if(a.length<3 || b.length<3) return false;
    if(a===b) return true;   // exato: serve para codigo simples (KITENVIO) e link igual
    // daqui pra baixo e a tolerancia do LINK do Drive (formas diferentes do
    // mesmo link). So com pedacos longos, para nao casar codigo curto por acaso.
    if(a.length>=12 && b.length>=12 && (a.indexOf(b)>=0 || b.indexOf(a)>=0)) return true;
    var ta=kitTok(lido), tb=kitTok(cad);
    if(ta.length>=12 && ta===tb) return true;
    if(ta.length>=15 && b.indexOf(ta)>=0) return true;   // ID da pasta como substring
    if(tb.length>=15 && a.indexOf(tb)>=0) return true;
    return false;
  }
  var api={kitNorm:kitNorm,kitTok:kitTok,kitBate:kitBate};
  if(typeof module!=="undefined"&&module.exports) module.exports=api;
  else for(var k in api) raiz[k]=api[k];
})(typeof self!=="undefined"?self:this);

/* codigo_serie.js (a tela) — o TRADUTOR da etiqueta de SKU em serie nas telas
 * que conferem o SKU no proprio tablet: a Embalagem (102) e a Etiqueta de Venda
 * (201). Spec PRODUCAO-MAPA-E-MOTOR v7, §14.2, 25/11/2026.
 *
 * O codigo de barras da etiqueta em serie e o numero dela na fabrica (PS + 8
 * digitos), nao o SKU. Aqui ele vira o SKU, perguntando ao servidor
 * (/api/producao/traduzir); o resto do bipe segue como sempre. No servidor, o
 * codigo_serie.js da raiz faz o mesmo na porta das rotas.
 */
(function(){
  var cache = {};
  window.codigoSerie = {
    eh: function(c){ return /^PS\d{8}$/.test(String(c || '').replace(/[^A-Za-z0-9]/g, '').toUpperCase()); },
    /* Devolve o SKU da etiqueta em serie, ou o proprio codigo (o SKU comum, ou
       a etiqueta que o servidor nao conhece — a tela recusa como sempre). */
    sku: async function(c){
      var k = String(c || '').replace(/[^A-Za-z0-9]/g, '').toUpperCase();
      if(!this.eh(k)) return c;
      if(cache[k]) return cache[k];
      try{
        var r = await (await fetch('/api/producao/traduzir/' + encodeURIComponent(k), { credentials:'same-origin' })).json();
        if(r && r.etiqueta && r.sku){ cache[k] = r.sku; return r.sku; }
      }catch(e){}
      return c;
    }
  };
})();

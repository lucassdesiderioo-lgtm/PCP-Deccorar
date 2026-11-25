/* codigo_serie.js — o TRADUTOR na porta das telas que bipam SKU
 * (spec PRODUCAO-MAPA-E-MOTOR v7, §14.2 e §14.10, 25/11/2026).
 *
 * A persiana que vem da montagem nova (107) leva por fora a ETIQUETA DE SKU EM
 * SERIE, cujo codigo de barras e o numero da etiqueta na fabrica (PS + 8
 * digitos), e nao o SKU. No dia da virada ela chega a Embalagem, a Etiqueta de
 * Venda, a Conferencia e ao Inventario — telas que esperam o SKU. Este
 * middleware troca, SO nas rotas abaixo, o codigo em serie pelo SKU dele,
 * antes da rota. A etiqueta comum passa como sempre.
 *
 * ⚠️ A REVISAO (/api/revisao) NAO PASSA POR AQUI, de proposito: ela precisa
 *    do codigo em serie para ligar a revisao a persiana (§14.5).
 * ⚠️ So o codigo em serie conhecido vira SKU. TC/TB (tecido e tubo) e o PS que
 *    nao existe passam como vieram, e a rota os recusa como SKU desconhecido.
 * ⚠️ Fica ANTES das rotas no server.js: middleware registrado depois de uma
 *    rota nao roda para ela.
 */
const ETQ = require('./etiqueta_producao');

const CORPO = {
  '/api/montagem':['codigo'], '/api/montagem/reservar':['codigo'], '/api/montagem/renovar':['codigo'],
  '/api/montagem/defeito':['codigo'], '/api/montagem/cancelar':['codigo'],
  '/api/lote/conferir':['codigo'], '/api/carregar/peca':['sku'], '/api/carregamento/sobra':['skus'],
  '/api/inventario/bipe':['codigo']
};

function traduzir(db, v){
  if(typeof v !== 'string' || !/^PS\d{8}$/i.test(ETQ.limpar(v))) return v;
  try{ const t = ETQ.skuDoBipe(db, v); return t.sku || v; }catch(e){ return v; }
}

module.exports = function(app, db){
  app.use((req, res, next) => {
    try{
      const p = req.path;
      if(req.method === 'POST' && CORPO[p] && req.body && typeof req.body === 'object'){
        for(const k of CORPO[p]){
          if(Array.isArray(req.body[k])) req.body[k] = req.body[k].map(x => traduzir(db, x));
          else if(k in req.body) req.body[k] = traduzir(db, req.body[k]);
        }
      } else if(req.method === 'GET' && p.indexOf('/api/proximo/') === 0){
        const cod = decodeURIComponent(p.slice('/api/proximo/'.length));
        const sku = traduzir(db, cod);
        if(sku !== cod) req.url = '/api/proximo/' + encodeURIComponent(sku) + (req.url.indexOf('?') >= 0 ? req.url.slice(req.url.indexOf('?')) : '');
      }
    }catch(e){ console.error('[codigo_serie]', e.message); }
    next();
  });
};
module.exports.traduzir = traduzir;
module.exports.CORPO = CORPO;

/* anexo_compra.js — DONO ÚNICO DE "ESTA PESSOA PODE VER ESTE ANEXO DE COMPRA?"
 * (R-CMP-27 e R-VAL-03). O arquivo não pode contornar a poda do JSON:
 *  - o anexo da NOTA (XML, PDF, foto) traz impostos e valores: custo.ver ou nota.lancar;
 *  - o orçamento e o comprovante do PEDIDO têm preço: quem vê os valores das
 *    compras (compras.valores, ou quem lança aquele dinheiro — o valor.js);
 *  - o anexo do recebimento continua de quem recebe.
 * A lista de anexos (compra_route) e o detalhe do pedido (pedido_route) usam
 * esta mesma conta: duas listas divergiriam (#12). */
const VA = require('./valor');
const DA_NOTA = ['xml', 'nota_pdf', 'nota_foto'];
const deNota = a => DA_NOTA.indexOf(a.tipo) >= 0 || !!a.nota_id;
const comPreco = a => !deNota(a) && !!a.pedido_id && !a.recebimento_id;
const veNota = tem => tem('custo.ver') || tem('nota.lancar');
const veValor = tem => VA.ve(tem, 'compras.valores');
/* `tem(chave)` é a pergunta de permissão de quem chama. */
function podeVer(tem, a){ return (!deNota(a) || veNota(tem)) && (!comPreco(a) || veValor(tem)); }
module.exports = { DA_NOTA, deNota, comPreco, veNota, veValor, podeVer };

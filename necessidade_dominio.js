/* Necessidade de material POR DEMANDA — COMPRAS.md Fase 6, gatilho 2.
 *
 * Fecha o circuito que o sistema tinha aberto:
 *
 *   venda  ->  peca a produzir  ->  ficha  ->  material  ->  compra
 *
 * Ate aqui a compra so enxergava o gatilho 1 (o ponto de pedido): "o estoque do
 * tubo caiu abaixo do minimo, encha ate o ideal". Esse gatilho e cego para
 * venda — ele reage ao passado. O gatilho 2 olha para a frente: ha 47 persianas
 * vendidas para entregar, cada uma leva 2,1 m de tubo, entao faltam 98,7 m
 * independentemente de onde o minimo esteja.
 *
 * REGRA (CLAUDE.md §7-B): a necessidade e o MAIOR dos dois gatilhos, NUNCA a
 * soma. Somar contaria a mesma peca duas vezes — o minimo existe justamente para
 * cobrir a venda que ainda nao apareceu.
 *
 * O QUE ESTE ARQUIVO NAO FAZ: nao decide de quem comprar nem por quanto. Ele
 * responde "quanto material falta". A comparacao de oferta continua no
 * compras_calc.js, e o merge dos dois gatilhos no compras_route.js, onde moram
 * estoque, minimo e o que ja esta a caminho.
 *
 * PENDENCIA NUNCA VIRA ZERO. Um SKU com venda e sem ficha calculavel nao
 * contribui com material nenhum — e isso e um BURACO na lista de compras, nao um
 * zero. Ele sai em `pendencias`, com o motivo, para o comprador ver que a lista
 * esta incompleta. E a mesma regra 4 do custo: indefinido nao vira zero.
 */
const DEMANDA = require('./demanda_dominio');
const FICHA   = require('./ficha_dominio');
const SOBMED  = require('./sobmedida_material');

const q3 = n => Math.round((+n||0)*1000)/1000;

function porItem(db){
  const aProduzir  = DEMANDA.aProduzir(db);
  const componentes = {};    // componente_id -> { consumo, origem:[] }
  const revenda     = {};    // sku de revenda -> { precisa }
  const pendencias  = [];

  const anota = (id, sku, precisa, porPeca) => {
    const e = componentes[id] || (componentes[id] = { consumo:0, origem:[] });
    e.consumo += porPeca * precisa;
    /* Um SKU pode ter DUAS linhas do mesmo material de proposito — o parafuso do
       suporte e o da base. Somam na mesma origem em vez de virar duas linhas
       iguais na tela. */
    const o = e.origem.find(x => x.sku === sku);
    if(o){ o.por_peca = q3(o.por_peca + porPeca); o.subtotal = q3(o.por_peca * precisa); }
    else e.origem.push({ sku, precisa, por_peca:q3(porPeca), subtotal:q3(porPeca*precisa) });
  };

  for(const s of aProduzir){
    const f = FICHA.calcularFicha(db, s.codigo);

    if(f.erro){ pendencias.push({ sku:s.codigo, precisa:s.precisa, motivo:f.erro }); continue; }

    /* Revenda nao consome material: a peca vendida E a peca comprada. A demanda
       dela vira compra do proprio SKU, pela oferta que aponta `oferta.sku`. */
    if(f.tem_ficha === 0){ revenda[s.codigo] = { sku:s.codigo, precisa:s.precisa }; continue; }

    if(f.pendencia){ pendencias.push({ sku:s.codigo, precisa:s.precisa, motivo:f.pendencia }); continue; }
    if(!f.linhas || !f.linhas.length){
      pendencias.push({ sku:s.codigo, precisa:s.precisa, motivo:'ficha sem linhas' }); continue;
    }

    for(const l of f.linhas){
      /* `incompleto` da ficha e sobre PRECO, e preco nao muda quanto material a
         peca gasta — uma linha sem fornecedor cadastrado ainda diz a quantidade,
         e ela entra na necessidade normalmente. So fica de fora o que nao tem
         QUANTIDADE: formula que nao avaliou, ou tecido que nao deu para resolver.

         O tecido e o caso delicado: sem preco em nenhuma bobina, a ficha nao
         escolhe bobina — e com corte invertido a bobina MUDA a quantidade. Aqui
         chutar seria pior que faltar, entao vira pendencia com o motivo. */
      if(l.erro || l.componente_id == null || l.quantidade == null){
        pendencias.push({ sku:s.codigo, precisa:s.precisa,
          motivo: l.erro || 'linha da ficha sem componente',
          expressao: l.expressao || null });
        continue;
      }
      anota(l.componente_id, s.codigo, s.precisa, l.quantidade);
    }
  }

  /* O SOB MEDIDA ENTRA AQUI, no mesmo mapa — nao numa lista ao lado. O tubo e
     o mesmo material dos dois lados, e duas linhas para o mesmo componente na
     tela de compras fariam o comprador pedir duas vezes. */
  const sm = somarSobMedida(db, componentes);

  for(const id in componentes) componentes[id].consumo = q3(componentes[id].consumo);

  return { componentes, revenda, pendencias,
           skus_a_produzir: aProduzir.length,
           pecas_a_produzir: aProduzir.reduce((a,b)=>a+b.precisa,0),
           /* Separada da pendencia de SKU sem ficha de proposito: aquela fala
              de uma peca do catalogo, esta fala de um PEDIDO de revenda. Uma
              lista so obrigaria a tela a adivinhar qual frase escrever. */
           pendencias_sobmedida: sm.pendencias,
           sobmedida_fora: sm.fora, sobmedida_motivo: sm.motivo,
           sobmedida_pecas: sm.pecas };
}

/* ─────────────────────────────────────────────────────────────────────────────
 * O MATERIAL VENDIDO PELO SOB MEDIDA (fase 4-C da SOBMEDIDA-PEDIDO-REVENDA).
 *
 * O tubo da persiana sob medida e o MESMO tubo da medida padrao — decisao do
 * dono, 24/09/2026 —, comprado do mesmo fornecedor, e Compras e um so. Ate
 * aqui a lista nao o enxergava: sao dois bancos, e nao havia vinculo entre o
 * que a etiqueta do sob medida manda cortar e o que se compra.
 *
 * ⚠️ SOMA, NUNCA SOBRESCREVE. Os dois lados pedem o mesmo componente, e quem
 * chegasse depois apagaria o outro — a fabrica compraria metade, e o lado que
 * some e sempre o que chega por ultimo.
 *
 * ⚠️ A ORIGEM VAI EM CAMPO PROPRIO. `origem` e por SKU e `origem_sobmedida` e
 * por PEDIDO. Enfiar "pedido 5001" num campo chamado `sku` seria mentira de
 * campo, e a tela escreveria uma frase que nao se confere em lugar nenhum.
 *
 * ⚠️ O QUE NAO DA PARA SOMAR VIRA PENDENCIA, NUNCA NUMERO. Unidade divergente,
 * componente que sumiu do cadastro ou que foi desativado: somar ali seria
 * inventar uma conversao que ninguem decidiu. E a regra 4 do custo — indefinido
 * nao vira zero, e tambem nao vira palpite.
 * ────────────────────────────────────────────────────────────────────────── */
function somarSobMedida(db, componentes){
  const r = SOBMED.consumo();
  const pendencias = (r.pendencias||[]).slice();
  if(r.fora) return { fora:true, motivo:r.motivo, pendencias, pecas:0 };

  let pecas = 0;
  for(const m of (r.materiais||[])){
    const c = db.prepare('SELECT id,nome,unidade,ativo FROM componente WHERE id=?').get(m.componente_id);
    const comoOSobMedidaChama = m.nome || ('id '+m.componente_id);

    if(!c){ pendencias.push({ motivo:'o material "'+comoOSobMedidaChama+'" está apontado no '+
      'cadastro do sob medida mas não existe mais em Compras' }); continue; }

    /* Inativo nao e inexistente: o material existe e ALGUEM o desativou. Somar
       em silencio deixaria a venda sem compra; a pendencia diz "desativado"
       para o comprador nao ir procurar o erro no sob medida, onde ele nao esta. */
    if(!c.ativo){ pendencias.push({ motivo:'o material "'+c.nome+'" está desativado em '+
      'Compras, e o sob medida continua vendendo peça que o usa' }); continue; }

    if(c.unidade !== m.unidade){ pendencias.push({ motivo:'o material "'+c.nome+'" é '+
      'comprado em "'+c.unidade+'" e o sob medida calculou em "'+m.unidade+'" — não há '+
      'conversão decidida entre os dois, então ele NÃO foi somado' }); continue; }

    const e = componentes[c.id] || (componentes[c.id] = { consumo:0, origem:[] });
    e.consumo += (+m.quantidade||0);
    e.origem_sobmedida = (e.origem_sobmedida||[]).concat(m.origem||[]);
    pecas += (+m.pecas||0);
  }
  return { fora:false, motivo:null, pendencias, pecas };
}

module.exports = { porItem, somarSobMedida };

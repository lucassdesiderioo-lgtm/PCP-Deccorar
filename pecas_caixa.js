/* AS PECAS DE UMA CAIXA, PARA QUEM CONFERE DEPOIS DE IMPRESSA (05/10/2026).
 *
 * O volume guarda UM codigo em `lote.codigo` — o do primeiro item da folha. A
 * caixa de varias persianas (§5, armadilha #23) tem as outras pecas em
 * `lote_item`, e ate aqui so a tela de ANTES da impressao as lia. Depois dela,
 * o "Impresso ✓", o "Reimpresso ✓" e a lista "Ja impressos" escreviam so o
 * `lote.codigo`: na NF 7449 (2 persianas de SKUs DIFERENTES) quem voltou para
 * conferir via um SKU so, e um SKU so numa caixa de dois diferentes se le
 * como "duas iguais" — e e assim que a peca errada entra no saco.
 *
 * Devolve a lista so quando a caixa leva MAIS DE UMA PERSIANA (soma das `qtd`,
 * nunca `length`, §5 #23); a venda comum devolve [] e a tela nao muda nada.
 *
 * O que a peca E vem das colunas de `skus` (§7), pelo mesmo formatador da tela
 * (`pecaTexto`). Banco sem as tabelas de cadastro (cor, tecido, modelo) cai na
 * lista crua — codigo e quantidade —, e nunca em lista vazia: sumir com as
 * pecas e justamente o defeito que este arquivo existe para fechar.
 */
const COMPLETA=`SELECT i.codigo, COALESCE(i.qtd,1) qtd,
    s.largura_cm, s.altura_cm, COALESCE(c.nome,s.cor_codigo,s.cor) cor_nome,
    COALESCE(t.nome,s.tecido_codigo) tecido_nome, m.nome modelo_nome,
    COALESCE(m.exige_medida,1) exige_medida
  FROM lote_item i
  LEFT JOIN skus s ON s.codigo=UPPER(i.codigo)
  LEFT JOIN cor c ON c.codigo=s.cor_codigo
  LEFT JOIN tecido t ON t.codigo=s.tecido_codigo
  LEFT JOIN modelo m ON m.id=s.modelo_id
  WHERE i.lote_id=? ORDER BY i.id`;
const CRUA=`SELECT codigo, COALESCE(qtd,1) qtd FROM lote_item WHERE lote_id=? ORDER BY id`;

module.exports=function(db){
  let st=null;
  return function pecasDaCaixa(loteId){
    let itens;
    try{
      if(!st){ try{ st=db.prepare(COMPLETA); }catch(e){ st=db.prepare(CRUA); } }
      itens=st.all(loteId);
    }catch(e){ return []; }   // sem `lote_item`: volume anterior a tabela, uma persiana
    const pecas=itens.reduce((s,i)=>s+Math.max(1,i.qtd||1),0);
    return pecas>1 ? itens : [];
  };
};

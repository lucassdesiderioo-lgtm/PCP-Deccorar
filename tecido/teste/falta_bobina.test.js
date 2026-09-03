// NAO HA EMENDA — e por isso a recusa vira numero de compra.
//
// Decisao do dono, 03/09/2026: peca mais larga que toda bobina do estoque
// simplesmente nao sai. Nao ha o que combinar, nao ha meia solucao.
//
// O que isso muda: a recusa deixa de ser um contratempo do encaixe e passa a
// ser uma VENDA PARADA esperando material. Se ela morre numa linha de texto
// na tela do corte, quem compra tecido nunca fica sabendo que se perdeu uma
// peca por 10 cm de bobina.
const encaixe=require('../dominio/encaixe');

const P=(largura,altura,id)=>({id:id||('p'+largura+'x'+altura), largura, altura});
// A fonte tem `fonte` e `alturaMax` — nao `tipo` e `altura`. Escrever errado
// nao da erro: os campos chegam undefined e a comparacao vira NaN, entao o
// teste "passa" sem exercitar nada. Por isso os construtores ficam aqui, uma
// vez, em vez de literais espalhados pelos casos.
const ROLO =(largura,saldo)  =>({id:1, fonte:'rolo',  largura, alturaMax:saldo});
const SOBRA=(largura,altura) =>({id:1, fonte:'sobra', largura, alturaMax:altura});
const params={margem:0, larguraMinimaSobra:0.30, alturaMinimaSobra:1.00, pesoSobra:0.5};

module.exports=[

{nome:'peca mais larga que a bobina volta com codigo, nao so com frase', executar({igual}){
  const r=encaixe.planejar([P(2.40,1.50)],[ROLO(2.00,30)],params);
  igual(r.pecasNaoAlocadas.length,1,'a peca nao entrou');
  const p=r.pecasNaoAlocadas[0];
  igual(p.codigo,'sem_largura','o motivo tem codigo');
  igual(p.largura_necessaria,2.40,'e diz que largura PRECISARIA existir');
  // Contar frase de texto funciona ate o dia em que alguem corrige uma
  // virgula. O codigo e o campo que a compra soma.
}},

{nome:'sem NENHUMA fonte o motivo e outro — e a compra tambem', executar({igual}){
  const r=encaixe.planejar([P(1.40,1.50)],[],params);
  const p=r.pecasNaoAlocadas[0];
  igual(p.codigo,'sem_estoque','nao ha bobina nem sobra deste tecido');
  igual(p.largura_necessaria,1.40,'e a largura pedida continua registrada');
  // Sao coisas diferentes na prateleira: "a bobina e estreita demais" pede
  // compra de bobina larga; "nao ha tecido nenhum" pede compra do tecido.
}},

{nome:'FALTOU ALTURA nao e falta de bobina — nao vira pedido de compra', executar({igual}){
  // Rolo largo o bastante e curto demais. A bobina esta certa; o que acabou
  // foi o metro. Somar isso na compra de bobina mandaria comprar a bobina
  // errada.
  const r=encaixe.planejar([P(1.00,5.00)],[SOBRA(2.00,1.00)],params);
  const p=r.pecasNaoAlocadas[0];
  igual(p.codigo,'sem_material','e falta de metro, nao de largura');
  igual(p.largura_necessaria,null,'e por isso nao entra na conta da bobina');
}},

{nome:'a peca que CABE nao vira falta nenhuma', executar({igual}){
  const r=encaixe.planejar([P(1.40,1.50)],[ROLO(2.00,30)],params);
  igual(r.pecasNaoAlocadas.length,0,'entrou, e nao sobrou recusa');
}},

// ── O RESUMO QUE VIRA COMPRA ─────────────────────────────────────────────

{nome:'agrupa POR LARGURA, que e como se compra bobina', executar({igual}){
  const plano=require('../dominio/plano');
  const f=plano.faltaBobina([
    {largura:2.10, altura:1.50, largura_necessaria:2.10},
    {largura:2.10, altura:2.00, largura_necessaria:2.10},
    {largura:2.40, altura:1.00, largura_necessaria:2.40},
    {largura:1.20, altura:1.00, largura_necessaria:null}   // falta de metro, nao de largura
  ], {nome:'Rolo 3% Bege'}, 2.00);

  igual(f.pecas,3,'so as tres que precisam de bobina');
  igual(f.larguras.length,2,'duas larguras de bobina resolvem');
  igual(f.larguras[0].largura,2.40,'a MAIOR primeiro');
  igual(f.larguras[0].pecas,1,'uma peca precisa de 2,40');
  igual(f.larguras[1].pecas,2,'e duas precisam de 2,10');
  // Nao interessa que sejam tres pecas diferentes; interessa que duas
  // precisam de 2,10 e uma de 2,40. E assim que se pede ao fornecedor.
}},

{nome:'diz QUANTO falta, e nao so que falta', executar({igual,perto}){
  const plano=require('../dominio/plano');
  const f=plano.faltaBobina([{largura:2.08, altura:1.50, largura_necessaria:2.08}],
                            {nome:'Rolo 3% Bege'}, 2.00);
  igual(f.largura_necessaria,2.08,'a bobina que resolve tudo');
  igual(f.largura_maxima_estoque,2.00,'a maior que existe hoje');
  perto(f.faltam_m,0.08,'faltam 8 cm');
  // Perder a peca por 8 cm de bobina e uma conversa com o fornecedor;
  // por 60 cm e outra. O numero e que separa as duas.
}},

{nome:'sem falta de bobina o resumo e NULL, nao um objeto vazio', executar({igual}){
  const plano=require('../dominio/plano');
  igual(plano.faltaBobina([],{nome:'x'},2.00),null,'lista vazia');
  igual(plano.faltaBobina([{largura:1,altura:1,largura_necessaria:null}],{nome:'x'},2.00),
        null,'so falta de metro');
  // Objeto vazio faria a tela desenhar a tarja vermelha com zero pecas
  // dentro. Tarja de alarme que aparece sem alarme e tarja que a equipe
  // aprende a ignorar.
}}

];

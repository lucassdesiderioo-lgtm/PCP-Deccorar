// Os criterios de aceite da secao 10. Sem servidor, sem HTTP, sem banco —
// encaixe.js e funcao pura e e testado como tal.
//
// O PRIMEIRO teste e a tabela do 6.4. Se ele falhar, nada mais importa.
const {planejar,simularLarguras}=require('../dominio/encaixe');

const P={margem:0, larguraMinimaSobra:0.80, pesoSobra:0.50, alturaMinimaSobra:0};
const tresPecas=[
  {id:1,largura:0.90,altura:2.50},
  {id:2,largura:0.90,altura:2.50},
  {id:3,largura:0.90,altura:2.50}
];
const bobina=(largura,alturaMax)=>[{id:'b'+largura,fonte:'rolo',largura,
  alturaMax:alturaMax===undefined?Infinity:alturaMax}];

module.exports=[

{nome:'A TABELA DO 6.4, exata — 0,75 / 3,75 / 1,875', executar({perto,igual}){
  const r300=planejar(tresPecas,bobina(3.00),P);
  const r250=planejar(tresPecas,bobina(2.50),P);
  const r200=planejar(tresPecas,bobina(2.00),P);

  perto(r300.consumoM2,7.50,'3,00 consumo'); perto(r300.areaPecas,6.75,'3,00 pecas');
  perto(r300.areaSobras,0,'3,00 nao gera sobra'); perto(r300.desperdicio,0.75,'3,00 DESPERDICIO');

  perto(r250.consumoM2,12.50,'2,50 consumo');
  perto(r250.areaSobras,1.60*2.50,'2,50 sobra gerada 1,60x2,50');
  perto(r250.desperdicio,3.75,'2,50 DESPERDICIO');

  perto(r200.consumoM2,10.00,'2,00 consumo');
  perto(r200.areaSobras,1.10*2.50,'2,00 sobra gerada 1,10x2,50');
  perto(r200.desperdicio,1.875,'2,00 DESPERDICIO');

  // E o consumo LINEAR: a de 3,00 puxa uma vez so.
  perto(r300.consumoLinear,2.50,'3,00 puxa 2,50 m');
  perto(r250.consumoLinear,5.00,'2,50 puxa 5,00 m');
  perto(r200.consumoLinear,5.00,'2,00 puxa 5,00 m');

  const vencedora=simularLarguras(tresPecas,[3.00,2.50,2.00],P)[0];
  igual(vencedora.largura,3.00,'a bobina de 3,00 vence');
}},

{nome:'bobina ESTREITA pode vencer a larga: 2,00 bate 2,50', executar({igual,perto}){
  const ordem=simularLarguras(tresPecas,[2.50,2.00],P);
  igual(ordem[0].largura,2.00,'a de 2,00 vem na frente');
  perto(ordem[0].desperdicio,1.875,'desperdicio da 2,00');
  perto(ordem[1].desperdicio,3.75,'desperdicio da 2,50');
  // O sistema nunca escolhe a mais larga por padrao — e por isso que ele
  // simula todas as larguras que existem em estoque.
}},

{nome:'A ARMADILHA DA AREA: dimensao filtra, area so ordena', executar({igual}){
  // Sobra 0,50 x 4,00 tem 2,00 m2 — MAIS area que a peca de 0,90 x 2,00
  // (1,80 m2). E nao serve, porque 0,90 nao passa por 0,50.
  const peca=[{id:1,largura:0.90,altura:2.00}];
  const r=planejar(peca,[{id:'S1',fonte:'sobra',largura:0.50,alturaMax:4.00}],P);
  igual(r.faixas.length,0,'nao encaixou nada');
  igual(r.pecasNaoAlocadas.length,1,'a peca voltou marcada');
  igual(/largura/.test(r.pecasNaoAlocadas[0].motivo),true,'o motivo fala da largura');
}},

{nome:'SEM ROTACAO: 0,70 x 3,00 nao serve para peca 3,00 x 0,70', executar({igual}){
  const peca=[{id:1,largura:3.00,altura:0.70}];
  const r=planejar(peca,[{id:'S1',fonte:'sobra',largura:0.70,alturaMax:3.00}],P);
  igual(r.pecasNaoAlocadas.length,1,'nao coube');
  // Girar a peca resolveria no papel, mas o tecido tem sentido: o desenho, o
  // brilho e o caimento mudam. permite_girar=0 e o padrao, e quem filtra por
  // ele e o plano — o encaixe simplesmente nunca gira nada.
}},

{nome:'ALTURAS MISTURADAS: faixa de 2,50 e resto de pe de 0,90 x 0,70', executar({igual,perto}){
  const pecas=[{id:1,largura:0.90,altura:2.50},{id:2,largura:0.90,altura:1.80}];
  const r=planejar(pecas,bobina(3.00),P);
  igual(r.faixas.length,1,'as duas dividem a mesma faixa');
  perto(r.faixas[0].altura,2.50,'a faixa puxa a MAIOR altura');
  const pe=r.sobrasGeradas.concat(r.refugos).find(x=>x.de==='resto_de_pe');
  perto(pe.largura,0.90,'largura do resto de pe');
  perto(pe.altura,0.70,'altura do resto de pe');
}},

{nome:'UMA SOBRA, VARIAS PECAS: 1,90x2,60 leva duas de 0,90x2,50', executar({igual,perto}){
  const pecas=[{id:1,largura:0.90,altura:2.50},{id:2,largura:0.90,altura:2.50}];
  const r=planejar(pecas,[{id:'S-0142',fonte:'sobra',largura:1.90,alturaMax:2.60}],P);
  igual(r.faixas.length,1,'uma faixa so');
  igual(r.faixas[0].pecas.length,2,'as duas pecas nela');
  igual(r.pecasNaoAlocadas.length,0,'nada sobrou de fora');
  // A sobra sai INTEIRA: o que ela custa e a area toda dela, nao a faixa.
  perto(r.consumoM2,1.90*2.60,'consumo = a sobra inteira');
  perto(r.consumoLinear,0,'sobra nao puxa metro linear de rolo');
  // A tira lateral de 0,10 e estreita demais: refugo.
  const tira=r.refugos.find(x=>x.de==='tira_lateral');
  perto(tira.largura,0.10,'tira lateral de 0,10');
}},

{nome:'O LIMITE DOS 80 cm, na borda exata', executar({igual,perto}){
  // Resto de 0,79 -> refugo. Resto de 0,80 -> sobra. Testado no milimetro.
  const r79=planejar([{id:1,largura:1.21,altura:2.00}],bobina(2.00),P);
  perto(r79.refugos[0].largura,0.79,'0,79 medido');
  igual(r79.sobrasGeradas.length,0,'0,79 NAO vira sobra');

  const r80=planejar([{id:1,largura:1.20,altura:2.00}],bobina(2.00),P);
  perto(r80.sobrasGeradas[0].largura,0.80,'0,80 medido');
  igual(r80.refugos.length,0,'0,80 vira sobra, nao refugo');
}},

{nome:'pesoSobra MUDA O VENCEDOR — prova que o parametro e usado', executar({igual}){
  const meio=simularLarguras(tresPecas,[3.00,2.50,2.00],{...P,pesoSobra:0.50});
  igual(meio[0].largura,3.00,'com peso 0,50 vence a de 3,00');

  const cheio=simularLarguras(tresPecas,[3.00,2.50,2.00],{...P,pesoSobra:1.00});
  igual(cheio[0].largura,2.00,'com peso 1,00 vence a de 2,00');
  // Com o retalho valendo 100%, gerar sobra grande deixa de ser desperdicio.
  // E exatamente a pergunta de fabrica que o parametro faz: o retalho volta
  // a ser usado, ou encalha?
}},

{nome:'PECA QUE NAO CABE volta marcada, e o resto do plano sai', executar({igual}){
  // Resposta do dono: o plano NUNCA deixa de sair. A peca larga demais volta
  // com o motivo e as outras seguem planejadas.
  const pecas=[{id:1,largura:1.90,altura:2.00},{id:2,largura:0.90,altura:2.00}];
  const r=planejar(pecas,bobina(1.50),P);
  igual(r.pecasNaoAlocadas.length,1,'so a larga ficou de fora');
  igual(r.pecasNaoAlocadas[0].id,1,'e a de 1,90');
  igual(r.pecasNaoAlocadas[0].motivo,'nenhuma bobina em estoque tem largura ≥ 1,90','o motivo diz o numero');
  igual(r.faixas.length,1,'a outra peca foi planejada assim mesmo');
  igual(r.faixas[0].pecas[0].id,2,'a de 0,90 entrou');
}},

{nome:'saldo curto: a peca volta marcada por ALTURA, nao por largura', executar({igual}){
  const pecas=[{id:1,largura:0.90,altura:2.50},{id:2,largura:0.90,altura:2.50}];
  // Bobina estreita (uma peca por faixa) com saldo de so 3 m: a segunda faixa
  // precisaria de mais 2,50 e nao ha.
  const r=planejar(pecas,[{id:'r1',fonte:'rolo',largura:1.00,alturaMax:3.00}],P);
  igual(r.faixas.length,1,'so uma faixa coube no saldo');
  igual(r.pecasNaoAlocadas.length,1,'a segunda voltou');
  igual(/altura disponivel/.test(r.pecasNaoAlocadas[0].motivo),true,'o motivo fala do saldo');
}},

{nome:'a MARGEM muda o encaixe: 3 de 0,90 nao cabem mais em 2,70', executar({igual}){
  const semMargem=planejar(tresPecas,bobina(2.70),{...P,margem:0});
  igual(semMargem.faixas.length,1,'sem margem: as tres numa faixa');

  const com2cm=planejar(tresPecas,bobina(2.70),{...P,margem:0.02});
  igual(com2cm.faixas.length,2,'com 2 cm de folga: nao cabem mais');
  // Era a pergunta mais importante da secao 11, e por isso a margem e
  // parametro cadastravel: se existir e o encaixe ignorar, o plano promete
  // tres pecas que na pratica nao cabem.
}},

{nome:'a ordem das pecas na entrada nao muda o resultado', executar({perto}){
  const baralhado=[
    {id:2,largura:0.90,altura:1.80},
    {id:3,largura:0.60,altura:2.50},
    {id:1,largura:0.90,altura:2.50}
  ];
  const ordenado=[baralhado[2],baralhado[0],baralhado[1]];
  const a=planejar(baralhado,bobina(3.00),P);
  const b=planejar(ordenado,bobina(3.00),P);
  perto(a.desperdicio,b.desperdicio,'mesmo desperdicio');
  perto(a.consumoLinear,b.consumoLinear,'mesmo consumo');
  // O algoritmo ordena por altura decrescente antes de comecar; a digitacao
  // do operador nao pode mudar o plano.
}},

{nome:'a funcao e PURA: nao altera as listas que recebe', executar({igual}){
  const pecas=[{id:1,largura:0.90,altura:2.50}];
  const fontes=[{id:'r1',fonte:'rolo',largura:2.00,alturaMax:10}];
  const antesP=JSON.stringify(pecas), antesF=JSON.stringify(fontes);
  planejar(pecas,fontes,P);
  igual(JSON.stringify(pecas),antesP,'a lista de pecas voltou intacta');
  igual(JSON.stringify(fontes),antesF,'a lista de fontes voltou intacta');
  // Sem isso, chamar planejar duas vezes para comparar bobinas daria
  // resultados diferentes na segunda — e a comparacao e o coracao do 6.4.
}},

{nome:'sem peca nenhuma, nao inventa consumo', executar({perto,igual}){
  const r=planejar([],bobina(3.00),P);
  perto(r.consumoM2,0,'consumo zero'); perto(r.desperdicio,0,'desperdicio zero');
  igual(r.faixas.length,0,'nenhuma faixa');
}},

{nome:'a posicao de cada peca sai pronta para a tela desenhar', executar({perto,igual}){
  // Com 2 cm de folga: 0,90 + 0,02 + 0,90 + 0,02 + 0,90 = 2,74, que ainda
  // cabe em 3,00. Cada peca comeca depois da anterior MAIS a folga.
  const r=planejar(tresPecas,bobina(3.00),{...P,margem:0.02});
  const pcs=r.faixas[0].pecas;
  igual(pcs.length,3,'as tres cabem em 3,00 mesmo com a folga');
  perto(pcs[0].x,0.00,'a primeira comeca no zero');
  perto(pcs[1].x,0.92,'a segunda: 0,90 + 0,02');
  perto(pcs[2].x,1.84,'a terceira: 1,82 + 0,02');
  perto(r.faixas[0].larguraUsada,2.74,'largura usada inclui as folgas');
}}

];

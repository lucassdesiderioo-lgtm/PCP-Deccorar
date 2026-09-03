// O QUE SAI, E QUANTO SAI POR DIA.
//
// Este arquivo protege UM defeito acima de todos, e ele nao da erro:
//
//   media de 12 dias de historico dividida por 30 dias de janela
//   = um numero 2,5x MENOR que a verdade, com cara de fato
//
// Ninguem descobre olhando a tela. O comprador ve "gastamos 4 m²/dia", compra
// para isso, e a fabrica gasta 10. Por isso a janela EFETIVA e cortada na
// historia que existe, e a resposta diz de quantos dias ela esta falando.
//
// E o segundo: ajuste e encerramento tambem mexem no saldo, e nenhum dos dois
// e corte. Somados, o painel deixaria de responder "quanto a fabrica cortou".
const db=require('../nucleo/db');
const rolo=require('../dominio/rolo');
const tecido=require('../dominio/tecido');
const giro=require('../dominio/giro');
const custo=require('../dominio/custo');

const EU='Lucas';

let base=null;
function cena(){
  if(base) return base;
  const l=tecido.criarLinha({nome:'Rolo'});
  const a=tecido.criarAbertura({nome:'3%',linha_id:l.id});
  const bege=tecido.criarCor({nome:'Bege'});
  const preto=tecido.criarCor({nome:'Preto'});
  const t1=tecido.criarTecido({linha_id:l.id,abertura_id:a.id,cor_id:bege.id});
  const t2=tecido.criarTecido({linha_id:l.id,abertura_id:a.id,cor_id:preto.id});
  base={
    t1,t2,
    // bobina 2,00 · 100 m  ·  bobina 3,00 · 100 m  ·  bobina 2,00 · 50 m (preto)
    r1:rolo.entrada({tecido_id:t1.id,largura:'2,00',metragem:'100',preco_m2:'20'},EU),
    r2:rolo.entrada({tecido_id:t1.id,largura:'3,00',metragem:'100',preco_m2:'25'},EU),
    r3:rolo.entrada({tecido_id:t2.id,largura:'2,00',metragem:'50',preco_m2:'30'},EU)
  };
  return base;
}

// Empurra a data de um movimento para tras — e o unico jeito de testar janela
// sem esperar o calendario.
const envelhecer=(rolo_id,dias)=>db.prepare(
  `UPDATE movimento_rolo SET data=date('now','localtime','-'||?||' day'),
     criado_em=datetime('now','localtime','-'||?||' day')
    WHERE rolo_id=? AND motivo='consumo'`).run(dias,dias,rolo_id);

module.exports=[

{nome:'sem corte nenhum, o painel diz que NAO EXISTE — nao mostra zero', executar({igual}){
  cena();
  const p=giro.painel(30);
  igual(p.janela.vazia,true,'a janela sabe que nao ha historia');
  igual(p.tecidos.length,0,'e nao inventa linha nenhuma');
  igual(p.sem_saida.length,2,'mas os dois tecidos parados aparecem na lista propria');
  /* Zero corte apresentado como "0 m²/dia" seria um fato falso: nao e que a
     fabrica nao gasta, e que o sistema ainda nao viu ela gastar. */
}},

{nome:'⚠️ A JANELA NUNCA E MAIOR QUE A HISTORIA — e ela DIZ isso', executar({igual,perto}){
  const {r1}=cena();
  rolo.consumir(r1.id,60,'plano-1',EU);      // 60 m de bobina 2,00 = 120 m²
  envelhecer(r1.id,11);                       // o corte foi ha 11 dias

  const p=giro.painel(30);
  igual(p.janela.pedidos,30,'a tela pediu 30');
  igual(p.janela.dias,12,'mas so existem 12 dias de historia');
  igual(p.janela.completa,false,'e a resposta acusa a diferenca');

  perto(p.tecidos[0].media_dia,10,'120 m² / 12 dias = 10 m²/dia');

  /* DIVIDIR POR 30 DARIA 4 m²/dia. O comprador leria "gastamos 4", compraria
     para isso, e a fabrica gastaria 10. Nenhum erro apareceria em lugar
     nenhum — e por isso a tarja ambar da tela e obrigatoria. */
}},

{nome:'janela menor que a historia passa completa', executar({igual}){
  const p=giro.painel(7);
  igual(p.janela.dias,7,'sete dias de janela');
  igual(p.janela.completa,true,'e ha historia para eles');
  igual(p.tecidos.length,0,'mas o corte de 11 dias atras esta FORA dela');
  // Janela e recorte, nao filtro de conveniencia: o que ficou para tras
  // ficou, e a media de 7 dias tem que refletir os ultimos 7.
}},

{nome:'⚠️ AJUSTE E ENCERRAMENTO NAO SAO SAIDA', executar({igual,perto}){
  const {r3}=cena();
  rolo.ajustar(r3.id,45,'contagem de inventario',EU);   // -5 m, e nao e corte
  rolo.encerrar(r3.id,EU);                              // sobra vira acerto

  const p=giro.painel(30);
  igual(p.tecidos.some(t=>t.cor_nome==='Preto'),false,'o Preto nao aparece como saida');
  perto(p.tecidos.reduce((s,t)=>s+t.m2,0),120,'a soma continua so o corte de verdade');

  /* Os dois mexem no saldo e nenhum e corte: o ajuste e correcao de contagem,
     o encerramento e o acerto do que sobrou no tubo. Somados, o painel
     deixaria de responder "quanto a fabrica cortou" e passaria a responder
     "quanto a coluna variou", que ninguem perguntou (CLAUDE.md §18). */
}},

{nome:'o m² manda, e nao o metro linear', executar({perto,igual}){
  const {r2}=cena();
  rolo.consumir(r2.id,50,'plano-2',EU);      // 50 m de bobina 3,00 = 150 m²

  const p=giro.painel(30);
  const bobinas=new Map(p.larguras.map(l=>[String(l.chave),l]));
  perto(bobinas.get('3').m2,150,'50 m de bobina 3,00 sao 150 m²');
  perto(bobinas.get('2').m2,120,'60 m de bobina 2,00 sao 120 m²');
  igual(p.larguras[0].chave,3,'e a 3,00 vem em cima, apesar de MENOS metros lineares');

  /* Ordenar por metro linear poria a 2,00 primeiro (60 m contra 50 m) e
     responderia errado a pergunta "qual bobina mais uso": o que se compra e
     area, nao comprimento. */
}},

{nome:'COBERTURA mede risco; sem consumo ela e null, nunca zero', executar({igual,perto}){
  const p=giro.painel(30);
  const bege=p.tecidos.find(t=>t.cor_nome==='Bege');
  // Bege: sobraram 40 m x 2,00 (80 m²) + 50 m x 3,00 (150 m²) = 230 m² parados
  perto(bege.m2_parado,230,'230 m² na prateleira');
  perto(bege.media_dia,22.5,'270 m² em 12 dias');
  perto(bege.cobertura,10.2,'dez dias de folga neste ritmo');

  const parado=p.sem_saida.find(l=>l.cor_nome==='Preto');
  igual(parado===undefined||parado.cobertura===undefined,true,
    'o que nao saiu nao ganha cobertura de zero — ele vai para a lista propria');

  /* COBERTURA E O QUE MEDE RISCO, e a quantidade nao: 200 m² de um tecido que
     gira 40/dia e menos folga que 50 m² de um que gira 1. E "sem venda na
     janela" e null — nao da pra dizer, que nao e zero (CLAUDE.md §3). */
}},

{nome:'o que NAO saiu tem lista propria — senao ele some da tela', executar({igual}){
  const {r2}=cena();
  envelhecer(r2.id,8);      // os dois cortes agora estao fora de uma janela de 7

  const p=giro.painel(7);
  igual(p.tecidos.length,0,'ninguem cortou nos ultimos 7 dias');
  igual(p.sem_saida.some(l=>l.cor_nome==='Bege'),true,
    'mas o Bege, com 230 m² na prateleira, aparece assim mesmo');
  /* A lista de giro parte do consumo. Sem esta segunda lista, o tecido que
     nao gira SOME da tela — o pior lugar onde um tecido parado pode estar. */
}},

{nome:'⚠️ "nao saiu nada" e por TECIDO — senao o titulo mente', executar({igual}){
  const {t1,r1}=cena();
  // O Bege tem dois rolos. Um deles corta HOJE; o outro segue parado.
  rolo.consumir(r1.id,5,'plano-hoje',EU);

  const p=giro.painel(7);
  igual(p.tecidos.some(t=>t.cor_nome==='Bege'),true,'o Bege saiu na janela');
  igual(p.sem_saida.some(l=>l.tecido_id===t1.id),false,
    'entao ele NAO pode estar tambem na lista de "nao saiu nada"');

  /* Contando por ROLO, o Bege apareceria nas duas listas ao mesmo tempo, e o
     titulo "nao saiu nada em 7 dias" estaria mentindo sobre ele. Rolo parado
     ja tem resposta propria e melhor — a coluna "Parado" da tela de Rolos,
     que conta desde o ultimo consumo DAQUELE tubo. Duas telas respondendo a
     mesma pergunta com granularidades diferentes e o comeco de duas reguas. */
}},

{nome:'a media diaria divide por DIAS CORRIDOS, e diz quantos tiveram corte', executar({igual,perto}){
  const p=giro.painel(30);
  const bege=p.tecidos.find(t=>t.cor_nome==='Bege');
  igual(bege.dias_com_corte<p.janela.dias,true,
    'houve corte em '+bege.dias_com_corte+' dos '+p.janela.dias+' dias');
  // A relacao, e nao um numero magico: a media x os dias CORRIDOS tem que
  // devolver exatamente o que saiu. Se dividisse pelos dias com corte, esta
  // conta nao fecharia.
  // Tolerancia de 1 cm²: `media_dia` e arredondada em 3 casas para a tela, e
  // multiplicar de volta pelos dias devolve o centesimo perdido ali. Exigir
  // igualdade exata seria testar o arredondamento, nao a conta.
  perto(bege.media_dia*p.janela.dias,bege.m2,'media x dias corridos = o que saiu',0.01);
  /* Dividir so pelos dias com corte responderia "quanto ela gasta num dia de
     corte", que e outro numero e sempre maior. A pergunta e quanto essa
     fabrica gasta por dia — fim de semana incluido. */
}},

{nome:'a serie por mes NAO e cortada pela janela', executar({igual}){
  igual(giro.porMes().length>=1,true,'a historia inteira esta la');
  igual(giro.painel(7).meses.length,giro.porMes().length,'a janela nao a encolhe');
  // A janela e da MEDIA; a serie e a historia. Cortar as duas pelo mesmo
  // numero tiraria justamente a tendencia, que e o que a serie existe para
  // mostrar.
}},

{nome:'quem nao ve preco nao recebe o valor do que esta parado', executar({igual}){
  const p=giro.painel(30);
  igual(p.sem_saida.every(l=>'valor' in l),true,'a chefia recebe o valor');
  const podado=custo.semPreco(p);
  igual(podado.sem_saida.every(l=>!('valor' in l)),true,'e a bancada nao');
  igual(podado.janela.dias,p.janela.dias,'o resto do painel chega igual');
  // A lista "nao saiu" carrega o dinheiro parado, e dinheiro e preco: a mesma
  // poda do rolo vale aqui, e na ROTA — nao na tela.
}},

{nome:'janela absurda e apertada para um valor util', executar({igual}){
  igual(giro.janela(0).pedidos,30,'zero cai no padrao');
  igual(giro.janela(9999).pedidos,365,'e um ano e o teto');
  igual(giro.janela('abc').pedidos,30,'texto tambem cai no padrao');
  // A janela vem da URL. Sem o aperto, um `dias=0` viraria divisao por zero e
  // um `dias=99999` varreria a tabela inteira a cada refresh.
}}

];

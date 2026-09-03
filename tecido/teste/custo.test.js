// O DINHEIRO PARADO NA PRATELEIRA, e de quem o rolo veio.
//
// O que estes casos protegem e uma familia de erros que NAO DA ERRO: o numero
// sai, parece certo, e esta errado por baixo. Sao tres:
//
//   ZERO NO LUGAR DE "NAO SEI"   rolo sem nota entrando na soma como zero faz
//                                o estoque parecer mais barato do que e.
//   PRECO QUE ANDA PARA TRAS     preco no cadastro do fornecedor faz o rolo
//                                comprado em marco mudar de valor em setembro.
//   IDADE NO LUGAR DE PARADO     rolo cortado toda semana aparecendo como
//                                encalhe so porque entrou ha muito tempo.
const rolo=require('../dominio/rolo');
const tecido=require('../dominio/tecido');
const fornecedor=require('../dominio/fornecedor');
const custo=require('../dominio/custo');
const {pode}=require('../nucleo/permissoes');

const DIRETOR={nome:'Lucas',papel:'diretor'};
const CORTADOR={nome:'Ana da bancada',papel:'cortador'};

let base=null;
function cena(){
  if(base) return base;
  const l=tecido.criarLinha({nome:'Rolo'});
  const a=tecido.criarAbertura({nome:'3%',linha_id:l.id});
  const bege=tecido.criarCor({nome:'Bege'});
  const preto=tecido.criarCor({nome:'Preto'});
  base={
    t1:tecido.criarTecido({linha_id:l.id,abertura_id:a.id,cor_id:bege.id}),
    t2:tecido.criarTecido({linha_id:l.id,abertura_id:a.id,cor_id:preto.id}),
    f1:fornecedor.criar({nome:'Ecotex'},DIRETOR),
    f2:fornecedor.criar({nome:'Tecelagem Sul'},DIRETOR)
  };
  return base;
}

module.exports=[

{nome:'o valor do rolo e m² x o preco DAQUELA compra', executar({igual,perto}){
  const {t1,f1}=cena();
  // 50 m de bobina 2,00 = 100 m², a R$ 20,00 = R$ 2.000,00
  const r=rolo.entrada({tecido_id:t1.id,largura:'2,00',metragem:'50',
    fornecedor_id:f1.id, preco_m2:'20,00'},DIRETOR.nome);
  perto(r.m2,100,'100 m² no rolo');
  perto(r.valor,2000,'R$ 2.000,00 parados nele');
  igual(r.fornecedor_nome,'Ecotex','e sabe de quem veio');
}},

{nome:'⚠️ REAJUSTE DO FORNECEDOR NAO MEXE NO QUE JA ESTA NA PRATELEIRA', executar({perto,igual}){
  const {t1,f1}=cena();
  // O mesmo tecido, o mesmo fornecedor, tres meses depois e mais caro.
  const caro=rolo.entrada({tecido_id:t1.id,largura:'2,00',metragem:'50',
    fornecedor_id:f1.id, preco_m2:'26,00'},DIRETOR.nome);
  perto(caro.valor,2600,'o rolo novo vale o preco novo');

  const antigo=rolo.porCodigo('R-000001');
  perto(antigo.valor,2000,'e o antigo continua valendo o que foi PAGO nele');

  /* ESTA E A RAZAO DE O PRECO MORAR NO ROLO. Se ele morasse no cadastro do
     fornecedor e fosse multiplicado na hora de mostrar, o rolo de marco
     passaria a valer o preco de setembro — e ninguem perceberia, porque o
     numero so ficaria maior. E a mesma regra do COMPRAS.md: o pedido congela
     embalagem, fator e preco. */
  igual(custo.ultimoPreco(t1.id,f1.id).preco,26,'a proxima entrada e que sugere o preco novo');
}},

{nome:'⚠️ ROLO SEM PRECO NAO ENTRA COMO ZERO — o total vira PISO', executar({igual,perto}){
  const {t2}=cena();
  const sem=rolo.entrada({tecido_id:t2.id,largura:'2,50',metragem:'40'},DIRETOR.nome);
  igual(sem.valor,null,'o rolo sem nota vale "ainda nao se sabe", nao zero');

  const p=custo.painel();
  igual(p.resumo.piso,true,'o painel avisa que o total e minimo');
  igual(p.resumo.rolos_sem_preco,1,'e diz quantos faltam');
  perto(p.resumo.valor,4600,'a soma so tem os que TEM preco: 2000 + 2600');

  /* Zero e um custo valido e mentiroso. Somado, faria o estoque parecer mais
     barato do que e — e o defeito e invisivel, porque um total menor nao tem
     cara de erro. Por isso a tela escreve o ">=" e o numero de rolos sem
     preco: regra 4 do COMPRAS.md. */
}},

{nome:'preco lancado DEPOIS tira o rolo do piso', executar({igual,perto}){
  const sem=rolo.porCodigo('R-000003');
  const {f2}=cena();
  rolo.editarDados(sem.id,{nf:'12345',fornecedor_id:f2.id,preco_m2:'15,00'},DIRETOR.nome);

  const r=rolo.porCodigo('R-000003');
  perto(r.valor,1500,'40 m x 2,50 = 100 m² a R$ 15,00');
  igual(custo.painel().resumo.piso,false,'e agora o total do painel e exato');
  // A NOTA CHEGA DEPOIS DO ROLO, e isso e o caso normal. Um sistema que so
  // aceita a nota na entrada obriga a inventar um numero ou a deixar o rolo
  // fora do sistema — e as duas sao piores que a lacuna temporaria.
}},

{nome:'mexer no preco deixa RASTRO, com de -> para', executar({igual}){
  const r=rolo.porCodigo('R-000003');
  const ms=rolo.movimentos(r.id).filter(m=>m.motivo==='nota');
  igual(ms.length,1,'uma linha de historico');
  igual(ms[0].delta,0,'delta zero: o saldo nao mudou, o dado mudou');
  igual(ms[0].observacao.includes('NF: — -> 12345'),true,'diz o que era e o que virou');
  igual(ms[0].observacao.includes('preco/m²'),true,'e que o preco entrou');
  igual(ms[0].usuario_nome,DIRETOR.nome,'com quem fez');
  // Mudar preco muda o valor do estoque. Passar calado seria a mesma coisa
  // que ajustar saldo sem movimento — saldo sem historia nao se investiga.
}},

{nome:'salvar sem mudar nada NAO vira linha de historico', executar({igual}){
  const r=rolo.porCodigo('R-000003');
  const antes=rolo.movimentos(r.id).length;
  rolo.editarDados(r.id,{nf:'12345',fornecedor_id:r.fornecedor_id,preco_m2:'15,00'},DIRETOR.nome);
  igual(rolo.movimentos(r.id).length,antes,'nada foi gravado');
  // Historico que nao conta nada e historico que ninguem le — e quem para de
  // ler o historico para de achar o dia em que o estoque furou.
}},

{nome:'⚠️ PARADO E TEMPO SEM SAIR, e nao idade do rolo', executar({igual}){
  const {t1}=cena();
  const r=rolo.entrada({tecido_id:t1.id,largura:'2,00',metragem:'30'},DIRETOR.nome);
  igual(rolo.porId(r.id).dias_parado,0,'entrou hoje, zero dias');
  igual(rolo.porId(r.id).ultimo_consumo,null,'e nunca foi cortado');

  rolo.consumir(r.id,5,'plano-teste',DIRETOR.nome);
  const depois=rolo.porId(r.id);
  igual(depois.ultimo_consumo!=null,true,'agora tem ultimo corte');
  igual(depois.dias_parado,0,'e a conta passa a correr dali');

  /* A DIFERENCA IMPORTA QUANDO O ROLO E VELHO: um que entrou ha oito meses e
     e cortado toda semana NAO esta parado. Medir por idade poria ele no topo
     da lista de encalhe, e a lista de encalhe que acusa quem trabalha e uma
     lista que ninguem le — armadilha #10 do CLAUDE.md. */
}},

{nome:'o m² comprado do fornecedor sai da COMPRA, nao do saldo', executar({perto,igual}){
  const linhas=custo.porFornecedor().filter(f=>f.fornecedor_nome==='Ecotex');
  igual(linhas.length,1,'uma linha por fornecedor + tecido');
  perto(linhas[0].m2_comprado,200,'os dois rolos de 100 m² comprados');
  // Media ponderada pelo m2: (100x20 + 100x26) / 200 = 23
  perto(linhas[0].preco_medio,23,'media ponderada pelo m², nao pela contagem');
  perto(linhas[0].menor,20,'e a faixa aparece'); perto(linhas[0].maior,26,'dos dois lados');
  /* Ponderar pela quantidade de compras faria uma ponta de 5 m pesar igual a
     uma bobina de 200 — e o comprador decidiria por um numero que nao
     descreve o que ele gastou. */
}},

{nome:'a lista SEM NOTA e a lista de trabalho de quem fecha o mes', executar({igual}){
  const sem=custo.semNota().map(r=>r.codigo);
  igual(sem.includes('R-000003'),false,'o que ja tem nota saiu da lista');
  igual(sem.includes('R-000001'),true,'e o que so tem preco, sem NF, continua');
  /* Sem esta lista, "a nota chega depois" vira "a nota nunca chega". E a
     mesma licao da armadilha #14: marcar sem listar nao e adiar a revisao, e
     cancelar a revisao. */
}},

{nome:'⚠️ QUEM NAO TEM custo.ver NAO RECEBE OS CAMPOS — nem pelo fio', executar({igual}){
  igual(pode(CORTADOR,'custo.ver'),false,'o cortador nao ve preco');
  igual(pode(DIRETOR,'custo.ver'),true,'a chefia ve');

  const cru=rolo.porCodigo('R-000001');
  const podado=custo.semPreco(cru);
  igual('preco_m2' in cru,true,'o dado existe');
  igual('preco_m2' in podado,false,'e some do JSON, nao da tela');
  igual('valor' in podado,false,'o valor tambem');
  igual(podado.codigo,'R-000001','o resto do rolo continua chegando');

  /* NAO ADIANTA ESCONDER NA TELA E MANDAR PELO FIO (regra 14 do §13): o
     numero apareceria inteiro para quem abrisse a aba de rede do navegador,
     e a trava seria decoracao. */
}},

{nome:'preco absurdo e recusado — virgula no lugar errado nao entra', executar({recusa}){
  const {t1}=cena();
  recusa(()=>rolo.entrada({tecido_id:t1.id,largura:'2,00',metragem:'10',preco_m2:'20000'},DIRETOR.nome),
    'preco_absurdo');
  recusa(()=>rolo.entrada({tecido_id:t1.id,largura:'2,00',metragem:'10',preco_m2:'-5'},DIRETOR.nome),
    'preco_invalido');
  // R$ 20.000 por m² e alguem que digitou o total da nota no campo do preco.
}},

{nome:'fornecedor com rolo NAO se apaga, e a recusa diz quantos', executar({recusa,igual}){
  const exclusao=require('../dominio/exclusao');
  const {f1}=cena();
  igual(exclusao.quemUsa('fornecedor',f1.id)[0].includes('rolo(s) vieram deste fornecedor'),true,
    'a conta acha os rolos');
  recusa(()=>exclusao.excluir('fornecedor',f1.id),'cadastro_em_uso');

  const novo=fornecedor.criar({nome:'Nunca comprou nada'},DIRETOR);
  exclusao.excluir('fornecedor',novo.id);
  igual(fornecedor.listar().some(f=>f.id===novo.id),false,'o que ninguem usou some de vez');
}},

{nome:'fornecedor criado pela BANCADA cai na lista de conferencia', executar({igual}){
  const conferir=require('../dominio/conferir');
  const f=fornecedor.criar({nome:'Trouxe o rolo hoje'},CORTADOR);
  igual(f.conferir,1,'nasce marcado');
  const item=conferir.listar().find(i=>i.tipo==='fornecedor'&&i.id===f.id);
  igual(item.rotulo,'Trouxe o rolo hoje','aparece para a chefia');
  igual(item.criado_por,CORTADOR.nome,'com quem cadastrou');
  /* O rolo desce do caminhao de um fornecedor que ninguem cadastrou. A
     alternativa a deixar a bancada criar nao e ela esperar — e o rolo entrar
     SEM fornecedor, e esse dado nao volta depois. */
}}

];

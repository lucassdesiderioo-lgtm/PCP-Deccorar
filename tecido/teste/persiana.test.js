// O QUE ESTA PERSIANA E — os casos que a spec escreveu antes de existir codigo.
//
// ⚠️ ESTE ARQUIVO FOI ESCRITO ANTES DO `dominio/persiana.js`, e de proposito:
// risco vermelho da secao 0 do CLAUDE.md pede teste antes. As medidas daqui
// NAO foram tiradas do codigo — vieram da secao 4.5, 4.7 e 4.8 da spec
// SOBMEDIDA-PEDIDO-REVENDA, que e a conta que a fabrica faz hoje a mao.
//
// Teste que reproduz a conta do codigo com a mesma convencao do codigo nao
// testa nada: ele pergunta a si mesmo. Foi assim que o QR da etiqueta do kit
// passou por tres rodadas verdes (CLAUDE.md secao 4). Por isso cada numero
// abaixo esta escrito, e nao calculado.
const tecido=require('../dominio/tecido');
const catalogo=require('../dominio/catalogo_sm');
const persiana=require('../dominio/persiana');
const revendas=require('../dominio/revenda');

/* A CENA: o catalogo de tecido (linha, colecao, cor) que ja existe no modulo,
   mais o vinculo de venda. O modelo Rolo, os degraus e a ficha vem da SEMENTE
   da migracao — se a semente mudar, estes casos reprovam, que e o ponto. */
let base=null;
function cena(){
  if(base) return base;
  const l=tecido.criarLinha({nome:'Rolô'});
  const screen1=tecido.criarAbertura({nome:'Screen 1%',linha_id:l.id});
  const screen3=tecido.criarAbertura({nome:'Screen 3%',linha_id:l.id});
  const semPreco=tecido.criarAbertura({nome:'Screen 5%',linha_id:l.id});
  const cor=tecido.criarCor({nome:'Branco'});

  const m=catalogo.modeloPorNome('Rolô');
  // Screen 1% vai ate 2,800 de largura (secao 4.4 da spec) e custa R$ 110/m².
  catalogo.ligarColecao({modelo_id:m.id, abertura_id:screen1.id,
    preco_m2_centavos:11000, largura_max_mm:2800});
  // Screen 3% sem teto proprio: quem limita e a escada, e e com ela que a
  // maioria dos casos abaixo trabalha.
  catalogo.ligarColecao({modelo_id:m.id, abertura_id:screen3.id,
    preco_m2_centavos:11000});
  // Screen 5% SEM PRECO — custo indefinido nunca vira zero.
  catalogo.ligarColecao({modelo_id:m.id, abertura_id:semPreco.id});
  catalogo.ligarCorAcessorio({modelo_id:m.id, cor_id:cor.id});

  base={m, screen1, screen3, semPreco, cor};
  return base;
}

function sim(extra){
  const b=cena();
  return persiana.calcular(Object.assign({
    modelo_id:b.m.id, abertura_id:b.screen3.id, cor_acessorio_id:b.cor.id,
    largura_mm:1000, altura_mm:1000,
    comando:'direito', rolamento:'frente', adicional:'nenhum', reducao:'nao'
  }, extra||{}));
}
const peca=(r,chave)=>r.componentes.find(c=>c.chave===chave)||{};
const tubo=r=>r.degrau.nome;

/* Uma revenda com tabela e desconto, para os casos do preco da fase 2.
   Os percentuais entram em CENTESIMOS de por cento: 1000 = 10,00%. */
let nRev=0;
function revendaCom(tabelaCent,descontoCent,extra){
  const t=revendas.tabelas()[0];
  revendas.definirDescontoTabela(t.id,tabelaCent,{nome:'teste'});
  const r=revendas.criar(Object.assign({
    razao_social:'Revenda de teste '+(++nRev)+' LTDA',
    nome_fantasia:'Revenda '+nRev,
    tabela_id:t.id, desconto_centesimos:descontoCent},extra||{}),{nome:'teste'});
  return r;
}

module.exports=[

/* ═══ SECAO 4.5 — AS TRES CONFERENCIAS OBRIGATORIAS ════════════════════════
   Elas estao na spec com todas as medidas escritas. Sao o caso 1 deste
   arquivo porque sao a unica prova de que a ficha do Rolo semeada descreve a
   persiana que a fabrica corta. */

{nome:'4.5 — 1,000 × 1,000 = 1,000 m² → TUBO 32, e as cinco medidas',
 executar({igual}){
  const r=sim();
  igual(r.medida.area_mm2,1000000,'a area em mm²');
  igual(tubo(r),'Tubo 32','o degrau');
  igual(peca(r,'tubo').largura_corte_mm,970,'tubo 0,970');
  igual(peca(r,'tecido').largura_corte_mm,965,'tecido 0,965 de largura');
  igual(peca(r,'tecido').altura_corte_mm,1200,'tecido 1,200 de altura (final + 200)');
  igual(peca(r,'base').largura_corte_mm,970,'base 0,970 — fica igual ao tubo');

  const comBando=sim({adicional:'bando'});
  igual(peca(comBando,'bando').largura_corte_mm,995,'bando 0,995');
  const comBarra=sim({adicional:'barra'});
  igual(peca(comBarra,'barra').largura_corte_mm,991,'barra 0,991');
}},

{nome:'4.5 — 1,000 × 1,000: reducao de peso NAO automatica, e o tubo 32 nem oferece',
 executar({igual,recusa}){
  const r=sim();
  igual(r.reducao.automatica,false,'nao e automatica');
  igual(r.reducao.aplicada,false,'e nao foi aplicada');
  igual(r.reducao.pode_pedir,false,'o tubo 32 nao oferece');
  recusa(()=>sim({reducao:'pedida'}),'reducao_indisponivel','pedir no tubo 32');
}},

{nome:'4.5 — 2,000 × 2,000 = 4,000 m² → TUBO 41 (passou dos 3,5 m² do 38)',
 executar({igual,recusa}){
  const r=sim({largura_mm:2000,altura_mm:2000});
  igual(r.medida.area_mm2,4000000,'4,000 m²');
  igual(tubo(r),'Tubo 41','subiu por m², nao por largura');
  igual(peca(r,'tubo').largura_corte_mm,1960,'tubo 1,960 (desconto de 40)');
  igual(peca(r,'tecido').largura_corte_mm,1955,'tecido 1,955');
  igual(peca(r,'tecido').altura_corte_mm,2250,'tecido 2,250 (final + 250)');
  igual(peca(r,'base').largura_corte_mm,1960,'base 1,960');
  igual(r.reducao.automatica,false,'≤ 2,200 e ≤ 4,5 m²: nao automatica');
  recusa(()=>sim({largura_mm:2000,altura_mm:2000,adicional:'bando'}),
    'bando_indisponivel','bando no tubo 41');
}},

{nome:'4.5 — 2,400 × 2,000 = 4,800 m² → TUBO 41 (passou de 2,200 de largura), reducao automatica',
 executar({igual}){
  const r=sim({largura_mm:2400,altura_mm:2000,adicional:'barra'});
  igual(r.medida.area_mm2,4800000,'4,800 m²');
  igual(tubo(r),'Tubo 41','subiu por largura');
  igual(peca(r,'tubo').largura_corte_mm,2360,'tubo 2,360');
  igual(peca(r,'tecido').largura_corte_mm,2355,'tecido 2,355');
  igual(peca(r,'tecido').altura_corte_mm,2250,'tecido 2,250');
  igual(peca(r,'base').largura_corte_mm,2360,'base 2,360');
  igual(peca(r,'barra').largura_corte_mm,2391,'barra 2,391');
  igual(r.reducao.automatica,true,'acima de 4,5 m² — incluida pela regra de garantia');
  igual(r.reducao.aplicada,true,'e vai na peca');
}},

/* ═══ AS DIVISAS DA ESCADA — a medida exata fica no degrau de baixo ═════════
   "Passou de qualquer um dos dois, sobe" (secao 4.4). Cada divisa entra com
   o par: o valor exato, que FICA, e o proximo milimetro, que SOBE. Uma so
   das duas metades deixaria passar um >= trocado por >. */

{nome:'divisa 1,700 de largura: 1,700 fica no 32, 1,701 sobe para o 38',
 executar({igual}){
  igual(tubo(sim({largura_mm:1700,altura_mm:1000})),'Tubo 32','1,700 exato');
  igual(tubo(sim({largura_mm:1701,altura_mm:1000})),'Tubo 38','1,701');
}},

{nome:'divisa 3,0 m²: 3,0 fica no 32, 3,001 m² sobe para o 38',
 executar({igual}){
  igual(tubo(sim({largura_mm:1000,altura_mm:3000})),'Tubo 32','3,0 m² exatos');
  igual(tubo(sim({largura_mm:1000,altura_mm:3001})),'Tubo 38','3,001 m²');
}},

{nome:'divisa 2,200 de largura: 2,200 fica no 38, 2,201 sobe para o 41',
 executar({igual}){
  igual(tubo(sim({largura_mm:2200,altura_mm:1000})),'Tubo 38','2,200 exato');
  igual(tubo(sim({largura_mm:2201,altura_mm:1000})),'Tubo 41','2,201');
}},

{nome:'divisa 3,5 m²: 3,5 fica no 38, 3,501 m² sobe para o 41',
 executar({igual}){
  igual(tubo(sim({largura_mm:1000,altura_mm:3500})),'Tubo 38','3,5 m² exatos');
  igual(tubo(sim({largura_mm:1000,altura_mm:3501})),'Tubo 41','3,501 m²');
}},

{nome:'divisa do tubo 56: 3,000 de largura entra, 3,001 e RECUSADA dizendo o limite',
 executar({igual,recusa}){
  igual(tubo(sim({largura_mm:3000,altura_mm:1000})),'Tubo 56','3,000 exato');
  const e=recusa(()=>sim({largura_mm:3001,altura_mm:1000}),'medida_acima_da_escada','3,001');
  igual(/3,000/.test(e.mensagem),true,'a recusa DIZ qual limite estourou: '+e.mensagem);
}},

{nome:'divisa 7,0 m²: a area tambem tem teto, e a recusa nomeia a area',
 executar({igual,recusa}){
  igual(tubo(sim({largura_mm:2000,altura_mm:3500})),'Tubo 56','7,0 m² exatos');
  const e=recusa(()=>sim({largura_mm:2000,altura_mm:3501}),'medida_acima_da_escada','7,002 m²');
  igual(/m²/.test(e.mensagem),true,'a recusa fala de area: '+e.mensagem);
}},

{nome:'⚠️ o mais restritivo VENCE: 2,900 cabe no tubo 56 e a COLECAO recusa',
 executar({igual,recusa}){
  const b=cena();
  // 2,800 e o teto do Screen 1% — e o tubo 56 aceitaria ate 3,000.
  igual(tubo(sim({abertura_id:b.screen1.id,largura_mm:2800,altura_mm:1000})),'Tubo 56','2,800 passa');
  const e=recusa(()=>sim({abertura_id:b.screen1.id,largura_mm:2900,altura_mm:1000}),
    'medida_acima_da_colecao','2,900 no Screen 1%');
  igual(/Screen 1%/.test(e.mensagem),true,'a recusa nomeia a COLECAO: '+e.mensagem);
  // e a mesma medida passa numa colecao sem teto proprio
  igual(tubo(sim({largura_mm:2900,altura_mm:1000})),'Tubo 56','2,900 no Screen 3%');
}},

/* ═══ SECAO 4.6 — O QUE A REVENDA VE ═══════════════════════════════════════ */

{nome:'4.6 — o bando cabe ate 3,000 de altura: 3,000 passa, 3,001 e recusado com a FRASE',
 executar({igual,recusa}){
  const r=sim({largura_mm:1000,altura_mm:3000,adicional:'bando'});
  igual(tubo(r),'Tubo 32','3,0 m² ainda e tubo 32');
  igual(peca(r,'bando').largura_corte_mm,995,'e o bando sai');
  const e=recusa(()=>sim({largura_mm:1000,altura_mm:3001,adicional:'bando'}),
    'bando_indisponivel','altura 3,001');
  igual(/tubo enrolado/.test(e.mensagem),true,
    'a frase explica por que, e ela e parte da regra: '+e.mensagem);
}},

{nome:'4.6 — bando E barra na mesma persiana nao existe',
 executar({igual,recusa}){
  const e=recusa(()=>sim({adicional:['bando','barra']}),'bando_e_barra','os dois juntos');
  igual(/bandô/i.test(e.mensagem),true,'a recusa diz o que houve: '+e.mensagem);
}},

{nome:'4.6 — reducao automatica: divisa de 4,5 m² e divisa de 2,200 de largura',
 executar({igual}){
  igual(sim({largura_mm:1500,altura_mm:3000}).reducao.automatica,false,'4,5 m² exatos: nao');
  igual(sim({largura_mm:1500,altura_mm:3001}).reducao.automatica,true,'4,5001 m²: sim');
  igual(sim({largura_mm:2200,altura_mm:1000}).reducao.automatica,false,'2,200 exatos: nao');
  igual(sim({largura_mm:2201,altura_mm:1000}).reducao.automatica,true,'2,201: sim');
}},

{nome:'4.6 — reducao PEDIDA vale nos tubos 38, 41 e 56, e nunca no 32',
 executar({igual,recusa}){
  igual(sim({largura_mm:2000,altura_mm:1000,reducao:'pedida'}).reducao.aplicada,true,'tubo 38');
  igual(sim({largura_mm:2000,altura_mm:2000,reducao:'pedida'}).reducao.aplicada,true,'tubo 41');
  igual(sim({largura_mm:2800,altura_mm:1000,reducao:'pedida'}).reducao.aplicada,true,'tubo 56');
  recusa(()=>sim({reducao:'pedida'}),'reducao_indisponivel','tubo 32');
}},

/* ═══ SECAO 4.7 — O KIT ════════════════════════════════════════════════════ */

{nome:'4.7 — sem bando e sem barra e KIT TRADICIONAL, com os suportes do proprio kit',
 executar({igual}){
  const r=sim();
  igual(r.kit.chave,'kit_tradicional','o kit');
  igual(r.kit.suportes,null,'suportes: o padrao do kit, nao a faixa de largura');
}},

{nome:'4.7 — com bando e KIT BANDO; com barra e KIT BARRA',
 executar({igual}){
  igual(sim({adicional:'bando'}).kit.chave,'kit_bando','bando');
  igual(sim({adicional:'barra'}).kit.chave,'kit_barra','barra');
}},

{nome:'4.7 — as quatro divisas de suporte: a medida exata fica no degrau de baixo',
 executar({igual}){
  const sup=(largura)=>sim({largura_mm:largura,altura_mm:1000,adicional:'barra'}).kit.suportes;
  igual(sup(1000),2,'1,000 → 2');
  igual(sup(1001),3,'1,001 → 3');
  igual(sup(1900),3,'1,900 → 3');
  igual(sup(1901),4,'1,901 → 4');
  igual(sup(2600),4,'2,600 → 4');
  igual(sup(2601),5,'2,601 → 5');
  igual(sup(3000),5,'3,000 → 5');
}},

{nome:'4.7 — cada kit tem codigo de barras PROPRIO: a embalagem recusa o kit errado',
 executar({igual}){
  const t=sim().kit, b=sim({adicional:'bando'}).kit, x=sim({adicional:'barra'}).kit;
  [t,b,x].forEach(k=>igual(!!k.codigo_barras,true,k.chave+' tem codigo'));
  igual(new Set([t.codigo_barras,b.codigo_barras,x.codigo_barras]).size,3,
    'e os tres sao diferentes — um codigo so nao provaria que entrou o CERTO');
}},

/* ═══ SECAO 4.8 — PRECO ════════════════════════════════════════════════════ */

{nome:'4.8 — o exemplo da spec: 0,800 × 1,200 com bando, Screen 1% → R$ 209,00',
 executar({igual}){
  const b=cena();
  const r=sim({abertura_id:b.screen1.id,largura_mm:800,altura_mm:1200,adicional:'bando'});
  igual(r.preco.m2_real_mm2,960000,'0,960 m² reais');
  igual(r.preco.m2_cobrado_mm2,1500000,'cobra o minimo faturado de 1,500 m²');
  const linha=c=>r.preco.linhas.find(l=>l.chave===c).valor_centavos;
  igual(linha('tecido'),16500,'tecido: 1,500 × 110,00 = R$ 165,00');
  igual(linha('bando'),4400,'bando: 0,800 m × 55,00 = R$ 44,00');
  igual(r.preco.valor_subtotal_centavos,20900,'total R$ 209,00');
}},

{nome:'4.8 — acima do minimo faturado quem manda e o m² real',
 executar({igual}){
  const b=cena();
  const r=sim({abertura_id:b.screen1.id,largura_mm:2000,altura_mm:1000});
  igual(r.preco.m2_real_mm2,2000000,'2,000 m² reais');
  igual(r.preco.m2_cobrado_mm2,2000000,'acima de 1,5 nao ha minimo a aplicar');
  igual(r.preco.valor_subtotal_centavos,22000,'2 × 110,00 = R$ 220,00');
}},

{nome:'4.8 — a barra cobra por metro linear REAL, nao pela medida de corte',
 executar({igual}){
  const b=cena();
  const r=sim({abertura_id:b.screen1.id,largura_mm:2000,altura_mm:1000,adicional:'barra'});
  igual(peca(r,'barra').largura_corte_mm,1991,'a barra e cortada a 1,991');
  igual(r.preco.linhas.find(l=>l.chave==='barra').valor_centavos,3400,
    'e cobrada por 2,000 m × 17,00 = R$ 34,00');
}},

{nome:'4.8 — a reducao de peso e cobrada INCLUSIVE quando entra automatica',
 executar({igual}){
  const b=cena();
  const auto=sim({abertura_id:b.screen1.id,largura_mm:2400,altura_mm:2000});
  igual(auto.reducao.automatica,true,'entrou pela regra');
  igual(auto.preco.linhas.find(l=>l.chave==='reducao').valor_centavos,5000,'e cobra R$ 50,00');
  const pedida=sim({abertura_id:b.screen1.id,largura_mm:2000,altura_mm:1000,reducao:'pedida'});
  igual(pedida.preco.linhas.find(l=>l.chave==='reducao').valor_centavos,5000,'pedida cobra igual');
}},

{nome:'⚠️ CUSTO INDEFINIDO NUNCA VIRA ZERO — colecao sem preco sai como PISO',
 executar({igual}){
  const b=cena();
  const r=sim({abertura_id:b.semPreco.id,largura_mm:1000,altura_mm:1000,adicional:'barra'});
  igual(r.preco.valor_subtotal_centavos,null,'o subtotal e null, nunca a soma parcial');
  igual(r.preco.valor_piso_centavos,1700,'o que se sabe — a barra de 1,000 m — sai como piso');
  igual(r.preco.sem_preco.join(','),'tecido','e a linha que falta e NOMEADA');
}},

{nome:'⚠️ 4.8 — arredonda UMA VEZ, no total da linha, e nao por metro',
 executar({igual}){
  /* A diferenca so aparece quando a conta por unidade cai exatamente no meio
     centavo: 0,500 m x R$ 28,33 = 1416,5 centavos. Arredondando por metro e
     multiplicando por 2 da 2834; arredondando o total da linha da 2833. Um
     centavo — e e um centavo que ninguem consegue explicar depois, porque a
     conta escrita na tela ("0,500 m x R$ 28,33") da o outro numero. */
  const b=cena();
  const linha=catalogo.fichaLinhaDe(b.m.id,'barra','barra');
  const comp=catalogo.listarComponentes().find(c=>c.chave==='barra');
  catalogo.definirPrecoComponente(comp.id,2833,{nome:'teste'});
  catalogo.editarFichaLinha(linha.id,{quantidade:2});

  const r=sim({abertura_id:b.screen1.id,largura_mm:500,altura_mm:1000,adicional:'barra'});
  igual(r.preco.linhas.find(l=>l.chave==='barra').valor_centavos,2833,
    '0,500 x 28,33 x 2 = 2833 centavos, e nao 2834');

  catalogo.editarFichaLinha(linha.id,{quantidade:1});
  catalogo.definirPrecoComponente(comp.id,1700,{nome:'teste'});
}},

/* ═══ SECAO 4.1 — AS UNIDADES ══════════════════════════════════════════════ */

{nome:'4.1 — milimetro INTEIRO: 1000,5 mm e recusado, nao arredondado',
 executar({igual,recusa}){
  recusa(()=>sim({largura_mm:1000.5}),'medida_nao_inteira','largura fracionada');
  recusa(()=>sim({altura_mm:1000.5}),'medida_nao_inteira','altura fracionada');
  recusa(()=>sim({largura_mm:0}),'medida_invalida','largura zero');
  recusa(()=>sim({largura_mm:'mil'}),'medida_invalida','largura que nao e numero');
  igual(sim({largura_mm:'1200',altura_mm:'1000'}).medida.largura_mm,1200,
    'texto de numero inteiro passa — e o que vem do formulario');
}},

{nome:'4.1 — todo dinheiro devolvido e centavo INTEIRO',
 executar({igual}){
  const b=cena();
  const r=sim({abertura_id:b.screen1.id,largura_mm:833,altura_mm:1177,adicional:'barra'});
  const inteiros=[r.preco.valor_subtotal_centavos,r.preco.valor_piso_centavos]
    .concat(r.preco.linhas.map(l=>l.valor_centavos))
    .filter(v=>v!=null);
  igual(inteiros.every(v=>Number.isInteger(v)),true,
    'nenhum centavo quebrado: '+JSON.stringify(inteiros));
}},

/* ═══ ARMADILHA #18 — CONSUMO E CORTE SAO DOIS NUMEROS, E NUNCA FECHAM ═════ */

{nome:'⚠️ #18 — consumo e corte vem em campos SEPARADOS, desde o primeiro dia',
 executar({igual}){
  const r=sim();
  const t=peca(r,'tubo');
  igual(t.largura_corte_mm!==undefined,true,'o corte existe');
  igual(t.consumo_largura_mm!==undefined,true,'e o consumo existe ao lado');
  igual(peca(r,'tecido').consumo_altura_mm!==undefined,true,'inclusive no tecido');
}},

{nome:'⚠️ #18 — dobrar a medida de CORTE nao mexe em um centavo',
 executar({igual}){
  const b=cena();
  const antes=sim({abertura_id:b.screen1.id,largura_mm:1000,altura_mm:1000,adicional:'barra'});
  const linha=catalogo.fichaLinhaDe(b.m.id,'barra','barra');
  catalogo.editarFichaLinha(linha.id,{ajuste_largura_mm:-18});   // era -9
  const depois=sim({abertura_id:b.screen1.id,largura_mm:1000,altura_mm:1000,adicional:'barra'});
  igual(peca(depois,'barra').largura_corte_mm,982,'a barra passou a ser cortada a 0,982');
  igual(depois.preco.valor_subtotal_centavos,antes.preco.valor_subtotal_centavos,
    'e o preco nao se mexeu — quem precifica e a medida ACABADA, nunca a de corte');
  catalogo.editarFichaLinha(linha.id,{ajuste_largura_mm:-9});    // devolve a cena
}},

/* ═══ O QUE A TELA MOSTRA ══════════════════════════════════════════════════ */

{nome:'4.1 — a medida sai em metro com TRES casas, inclusive o zero final',
 executar({igual}){
  const r=sim();
  igual(peca(r,'tubo').largura_corte,'0,970','0,970 — e nao 0,97');
  igual(r.medida.largura,'1,000','1,000 — e nao 1');
  igual(r.medida.altura,'1,000','a altura tambem');
}},

{nome:'4.6 — a resposta diz o que a medida ACEITA, para a opcao sumir COM a frase',
 executar({igual}){
  // 1,000 x 1,000 e tubo 32: o bando cabe.
  const cabe=sim();
  igual(cabe.opcoes.bando.disponivel,true,'bando disponivel no tubo 32');
  igual(cabe.opcoes.bando.motivo,null,'e sem motivo, porque nao ha o que explicar');

  // 2,000 x 2,000 e tubo 41: nao cabe, e a resposta DIZ por que — sem recusar
  // a persiana, que continua calculada.
  const nao=sim({largura_mm:2000,altura_mm:2000});
  igual(nao.opcoes.bando.disponivel,false,'bando indisponivel no tubo 41');
  igual(/tubo enrolado/.test(nao.opcoes.bando.motivo),true,'com a frase: '+nao.opcoes.bando.motivo);
  igual(nao.degrau.nome,'Tubo 41','e a persiana foi calculada do mesmo jeito');
  igual(nao.opcoes.reducao.pode_pedir,true,'e a reducao pode ser pedida neste tubo');
  igual(sim().opcoes.reducao.pode_pedir,false,'mas nao no tubo 32');
}},

/* ═══ SECAO 4.8 — O PRECO DA REVENDA (fase 2) ══════════════════════════════
   O subtotal acima e o preco DECCORAR. O que a revenda paga sai dele com a
   tabela A/B/C e o desconto dela — EM CASCATA, decisao do dono em 22/09/2026.

   ⚠️ O caso que importa mais aqui nao e o que confere o numero novo: e o que
   confere que o numero VELHO nao se mexeu. "Misturar o preco com markup em
   qualquer numero da Deccorar" e o decimo item da secao 9 da spec, e o jeito
   de isso acontecer nao e alguem decidir — e o desconto entrar no subtotal
   por descuido e ninguem notar, porque o total continua parecendo dinheiro. */

{nome:'4.8 — sem revenda, nao ha preco de revenda nenhum no resultado',
 executar({igual}){
  const b=cena();
  const r=sim({abertura_id:b.screen1.id,largura_mm:800,altura_mm:1200,adicional:'bando'});
  igual(r.preco.revenda,null,'nulo, e nao um objeto com o subtotal repetido dentro');
  igual(r.preco.valor_subtotal_centavos,20900,'e o preco Deccorar e o de sempre');
}},

{nome:'4.8 — A TABELA E O DESCONTO ENTRAM EM CASCATA, nesta ordem',
 executar({igual}){
  const b=cena();
  const rev=revendaCom(1000,500);                       // tabela 10% + desconto 5%
  const r=sim({abertura_id:b.screen1.id,largura_mm:800,altura_mm:1200,
               adicional:'bando',revenda_id:rev.id});
  // 20900 x 0,90 x 0,95 = 17869,5 -> 17870. Somados dariam 20900 x 0,85 = 17765.
  igual(r.preco.revenda.valor_final_centavos,17870,'R$ 178,70 — cascata');
  igual(r.preco.revenda.valor_final_centavos!==17765,true,
    'e nao R$ 177,65, que e o que a soma dos dois percentuais daria');
  igual(r.preco.revenda.tabela.nome,'A','a tabela vai nomeada');
  igual(r.preco.revenda.desconto,'5,00','e o desconto por extenso, para a tela nao ter que dividir');
}},

{nome:'4.8 — O SUBTOTAL DECCORAR NAO SE MEXE com a revenda na frente',
 executar({igual}){
  const b=cena();
  const rev=revendaCom(2500,1000);
  const semRev=sim({abertura_id:b.screen1.id,largura_mm:800,altura_mm:1200,adicional:'bando'});
  const comRev=sim({abertura_id:b.screen1.id,largura_mm:800,altura_mm:1200,
                    adicional:'bando',revenda_id:rev.id});
  igual(comRev.preco.valor_subtotal_centavos,semRev.preco.valor_subtotal_centavos,
    'o preco da Deccorar e o mesmo com e sem revenda');
  igual(comRev.preco.valor_subtotal_centavos,20900,'e continua sendo R$ 209,00');
  igual(JSON.stringify(comRev.preco.linhas),JSON.stringify(semRev.preco.linhas),
    'linha por linha, nada do desconto vazou para dentro do preco Deccorar');
}},

{nome:'4.8 — ARREDONDA UMA VEZ, no fim, e nao a cada degrau',
 executar({igual}){
  const b=cena();
  const rev=revendaCom(1000,1000);
  // 0,835 x 1,200 em Screen 1%: 1,002 m² cai no minimo (1,5 x 11000 = 16500)
  // e o bando cobra 835 x 55,00/m = 4592,5 -> 4593. Subtotal 21093.
  const r=sim({abertura_id:b.screen1.id,largura_mm:835,altura_mm:1200,
               adicional:'bando',revenda_id:rev.id});
  igual(r.preco.valor_subtotal_centavos,21093,'subtotal R$ 210,93');
  // 21093 x 0,90 x 0,90 = 17085,33 -> 17085.
  // Arredondando em cada degrau: round(18983,7)=18984; 18984 x 0,9 = 17085,6 -> 17086.
  igual(r.preco.revenda.valor_final_centavos,17085,'R$ 170,85, e nao R$ 170,86');
}},

{nome:'4.8 — TABELA SEM PERCENTUAL: o preco da revenda nao existe, e ela e NOMEADA',
 executar({igual}){
  const b=cena();
  const rev=revendaCom(null,0);
  const r=sim({abertura_id:b.screen1.id,largura_mm:800,altura_mm:1200,
               adicional:'bando',revenda_id:rev.id});
  igual(r.preco.revenda.valor_final_centavos,null,
    'custo indefinido nunca vira zero — e percentual em branco e indefinido');
  /* ⚠️ E NAO HA PISO AQUI, de proposito. Piso e "no minimo isto"; desconto so
     DESCE o numero, entao o subtotal Deccorar seria um TETO, nunca um piso.
     Escrever 209,00 com um >= na frente diria a coisa errada com a palavra
     certa — e o >= e justamente o sinal que a equipe aprendeu a ler como
     "falta preco em alguma linha". */
  igual(r.preco.revenda.valor_piso_centavos,null,'sem o percentual nao ha piso nenhum');
  igual(r.preco.valor_subtotal_centavos,20900,'o que continua na tela e o preco DECCORAR');
  igual(r.preco.revenda.sem_preco.join(' '),'tabela A',
    'e a tela sabe dizer o que falta lancar, em vez de mostrar um >= sem explicacao');
}},

{nome:'4.8 — REVENDA SEM TABELA tambem nao tem preco, e diz isso',
 executar({igual}){
  const b=cena();
  const rev=revendaCom(1000,0,{tabela_id:null});
  const r=sim({abertura_id:b.screen1.id,largura_mm:800,altura_mm:1200,
               adicional:'bando',revenda_id:rev.id});
  igual(r.preco.revenda.valor_final_centavos,null,'sem tabela nao ha preco de revenda');
  igual(/tabela/.test(r.preco.revenda.sem_preco.join(' ')),true,
    'e o que falta e dito: '+r.preco.revenda.sem_preco.join(', '));
}},

{nome:'4.8 — colecao SEM PRECO com revenda: os dois pisos, e nenhum numero inventado',
 executar({igual}){
  const b=cena();
  const rev=revendaCom(1000,0);
  const r=sim({abertura_id:b.semPreco.id,revenda_id:rev.id});
  igual(r.preco.valor_subtotal_centavos,null,'o subtotal Deccorar ja era nulo');
  igual(r.preco.revenda.valor_final_centavos,null,'e o da revenda tambem');
  igual(r.preco.revenda.sem_preco.indexOf('tecido')>=0,true,
    'e a linha que falta continua sendo nomeada pelo nome dela: '+r.preco.revenda.sem_preco.join(', '));
}},

{nome:'4.8 — 100% de desconto da ZERO, e zero aqui e resposta, nao falta de preco',
 executar({igual}){
  const b=cena();
  const rev=revendaCom(10000,0);
  const r=sim({abertura_id:b.screen1.id,largura_mm:800,altura_mm:1200,
               adicional:'bando',revenda_id:rev.id});
  igual(r.preco.revenda.valor_final_centavos,0,'zero de verdade');
  igual(r.preco.revenda.sem_preco.length,0,'e nao um piso com linha faltando');
}},

{nome:'4.8 — revenda que nao existe, ou desativada, e RECUSADA',
 executar({igual,recusa}){
  const b=cena();
  recusa(()=>sim({revenda_id:99999}),'revenda_inexistente','id inventado');
  const rev=revendaCom(1000,0);
  revendas.editar(rev.id,{ativo:0});
  const e=recusa(()=>sim({revenda_id:rev.id}),'revenda_inativa','revenda desligada');
  igual(/desativada|inativa/i.test(e.mensagem),true,'e a frase diz por que: '+e.mensagem);
}},

{nome:'a resposta diz o que a peca E, em uma frase, para a conferencia da bancada',
 executar({igual}){
  const b=cena();
  const r=sim({abertura_id:b.screen1.id,adicional:'bando'});
  ['1,000 × 1,000','Screen 1%','Branco','direito','Bandô'].forEach(p=>
    igual(r.resumo.indexOf(p)>=0,true,'"'+p+'" aparece em: '+r.resumo));
}}

];

// O PAINEL GERENCIAL: minimo, status e faixas de parado.
//
// O caso que da razao a este arquivo inteiro e o primeiro: SOMAR AS BOBINAS
// DE UM MESMO TECIDO responde bem "o que mais sai" e responde ERRADO a
// cobertura. Aqui nao ha emenda — peca de 2,20 nao sai de bobina 2,00 — entao
// 120 m² de 2,00 nao cobrem nada de 2,20, e um painel que somasse as duas
// diria ao gestor que ha folga onde ha zero.
//
// Os outros protegem a mesma familia de defeito que este projeto ja conhece:
// numero que sai bonito e esta errado por baixo — zero no lugar de "nao sei",
// media dividida por janela maior que a historia, ajuste contado como corte.
const db=require('../nucleo/db');
const rolo=require('../dominio/rolo');
const tecido=require('../dominio/tecido');
const gerencial=require('../dominio/gerencial');
const custo=require('../dominio/custo');
const config=require('../nucleo/config');

const EU='Lucas';
const por=(chave,valor)=>config.gravar(chave,valor,'teste');
const envelhecer=(rolo_id,dias)=>db.prepare(
  `UPDATE movimento_rolo SET data=date('now','localtime','-'||?||' day'),
     criado_em=datetime('now','localtime','-'||?||' day')
    WHERE rolo_id=? AND motivo='consumo'`).run(dias,dias,rolo_id);

let base=null;
function cena(){
  if(base) return base;
  const l=tecido.criarLinha({nome:'Rolo'});
  const a=tecido.criarAbertura({nome:'1%',linha_id:l.id});
  const branco=tecido.criarCor({nome:'Branco'});
  const preto=tecido.criarCor({nome:'Preto'});
  const t1=tecido.criarTecido({linha_id:l.id,abertura_id:a.id,cor_id:branco.id});
  const t2=tecido.criarTecido({linha_id:l.id,abertura_id:a.id,cor_id:preto.id});
  base={t1,t2,
    // MESMO TECIDO, DUAS BOBINAS — o caso que o grao fino existe para separar.
    estreito:rolo.entrada({tecido_id:t1.id,largura:'2,00',metragem:'60',preco_m2:'20'},EU),
    largo:   rolo.entrada({tecido_id:t1.id,largura:'3,00',metragem:'100',preco_m2:'25'},EU),
    parado:  rolo.entrada({tecido_id:t2.id,largura:'2,50',metragem:'40',preco_m2:'30'},EU)};
  return base;
}

const acha=(p,cor,largura)=>p.linhas.find(l=>l.cor_nome===cor&&l.largura===largura);

module.exports=[

{nome:'⚠️ O GRAO E TECIDO × LARGURA — somar as bobinas esconde a que vai faltar',
 executar({igual,perto}){
  const {estreito,largo}=cena();
  // A bobina estreita gira MUITO mais rapido que a larga.
  rolo.consumir(estreito.id,50,'p1',EU);   // sobram 10 m x 2,00 =  20 m²
  rolo.consumir(largo.id,10,'p2',EU);      // sobram 90 m x 3,00 = 270 m²
  envelhecer(estreito.id,9); envelhecer(largo.id,9);

  const p=gerencial.painel(30,{});
  const e=acha(p,'Branco',2), g=acha(p,'Branco',3);
  igual(!!e&&!!g,true,'o mesmo tecido aparece em DUAS linhas, uma por bobina');
  perto(e.m2_parado,20,'a estreita tem 20 m² na prateleira');
  perto(g.m2_parado,270,'a larga tem 270 m²');
  igual(e.cobertura<g.cobertura,true,
    'e a estreita cobre MUITO menos: '+e.cobertura+' d contra '+g.cobertura+' d');

  /* SOMADAS, as duas dariam 290 m² sobre 13 m²/dia = 22 dias de folga, e o
     gestor leria "tranquilo". A verdade e que a bobina de 2,00 acaba em
     dois dias, e AQUI NAO HA EMENDA: a peca de 2,20 nao sai da de 2,00, e a
     de 2,00 nao vira 3,00. Sao estoques diferentes, e e por isso que a
     fabrica mantem as duas. */
}},

{nome:'os consolidados sao SOMA do grao, nunca uma segunda consulta', executar({perto}){
  const p=gerencial.painel(30,{});
  const soma=c=>p[c].reduce((s,x)=>s+(x.m2_parado||0),0);
  perto(soma('por_colecao'),p.resumo.m2,'por colecao fecha com o total');
  perto(soma('por_cor'),    p.resumo.m2,'por cor tambem');
  perto(soma('por_largura'),p.resumo.m2,'por largura tambem');
  /* Uma segunda consulta por recorte divergiria da tabela detalhada no dia
     em que uma das duas esquecesse de excluir o ajuste — e as duas
     pareceriam certas, cada uma na sua regua (armadilha #12). */
}},

{nome:'⚠️ ESTOQUE MINIMO = media diaria × dias-alvo, e o alvo e PARAMETRO',
 executar({perto,igual}){
  por('estMinDias',30); por('estMinSeguranca',0);
  let p=gerencial.painel(30,{});
  let e=acha(p,'Branco',2);
  perto(e.minimo,e.media_dia*30,'trinta dias de consumo');

  por('estMinDias',45);
  p=gerencial.painel(30,{}); e=acha(p,'Branco',2);
  perto(e.minimo,e.media_dia*45,'mudou o parametro, mudou o minimo');

  por('estMinSeguranca',20);
  p=gerencial.painel(30,{}); e=acha(p,'Branco',2);
  perto(e.minimo,e.media_dia*45*1.2,'e a seguranca entra por cima');

  por('estMinDias',30); por('estMinSeguranca',0);
  igual(Number(config.ler('estMinSeguranca')),0,'a seguranca NASCE zero');

  /* NASCE ZERO DE PROPOSITO. Um colchao inventado no primeiro dia viraria
     fato: o minimo sairia inflado e ninguem lembraria que os 30% foram
     palpite meu, nao decisao de ninguem. E os dois vivem em `parametro`,
     nao no codigo — um "x 1,3" escondido numa funcao e um numero que
     ninguem sabe de onde saiu e ninguem muda sem deploy. */
}},

{nome:'⚠️ SEM CONSUMO, O MINIMO E null — nao zero', executar({igual}){
  const p=gerencial.painel(30,{});
  const parado=acha(p,'Preto',2.5);
  igual(parado.minimo,null,'nao da para dizer qual e o minimo');
  igual(parado.cobertura,null,'nem a cobertura');
  igual(parado.dias_sem_consumo,null,'e nunca houve corte');
  /* Zero diria "nao precisa manter nada em estoque", que e uma afirmacao
     que ninguem fez. E cobertura zero diria "acaba hoje", quando o que
     acontece e o contrario: ele nao sai nunca. */
}},

{nome:'STATUS: a ORDEM e a regra, e nao a lista', executar({igual}){
  por('estMinDias',30); por('paradoDias',90);
  const p=gerencial.painel(30,{});

  // Estreita: 20 m² / ~5,6 m²/dia = ~3,6 dias. Abaixo de metade de 30.
  igual(acha(p,'Branco',2).status,'critico','cobertura abaixo de metade do alvo');
  // Preto: tem estoque, nunca teve corte.
  igual(acha(p,'Preto',2.5).status,'parado','com estoque e sem corte nenhum');

  /* A ORDEM IMPORTA: um material parado com cobertura infinita nao e
     "normal", e um sem estoque nenhum nao e "parado" — ele e a urgencia.
     Uma lista de status sem precedencia deixaria a linha cair no primeiro
     `if` que casasse, que e o pior criterio possivel. */
}},

{nome:'sem estoque e o unico caso em que cobertura ZERO e verdade', executar({igual}){
  const {estreito}=cena();
  rolo.consumir(estreito.id,10,'p3',EU);          // zera a bobina de 2,00
  const p=gerencial.painel(30,{});
  const e=acha(p,'Branco',2);
  igual(e.m2_parado,0,'nao sobrou nada');
  igual(e.status,'sem_estoque','e o status diz isso, e nao "critico" generico');
  // Em todo o resto do sistema, cobertura sem consumo e `null` porque nao da
  // pra dizer. Aqui da: acabou.
}},

{nome:'FAIXAS de parado: quem NUNCA saiu cai na ultima, e nao numa sexta',
 executar({igual}){
  const p=gerencial.painel(30,{});
  igual(gerencial.faixaDe(null),'180+','nunca consumido = a faixa mais grave');
  igual(gerencial.faixaDe(0),'0-30','hoje');
  igual(gerencial.faixaDe(30),'0-30','o limite fecha na faixa');
  igual(gerencial.faixaDe(31),'31-60','e o dia seguinte abre a proxima');
  igual(gerencial.faixaDe(181),'180+','a ultima e aberta');
  igual(p.por_faixa.length,5,'as cinco do briefing, sempre — mesmo vazias');

  /* Uma sexta faixa chamada "nunca" no fim da lista tiraria o caso MAIS
     GRAVE de onde o olho procura. A coluna "ultimo corte" continua vazia,
     que e onde a diferenca aparece sem custar uma faixa. */
}},

{nome:'⚠️ A COBERTURA DO CONJUNTO SO OLHA O QUE GIRA', executar({perto,igual}){
  const p=gerencial.painel(30,{});
  const giram=p.linhas.filter(l=>l.media_dia>0);
  const m2Giram=giram.reduce((s,l)=>s+(l.m2_parado||0),0);

  // Tolerancia de meio decimo: a cobertura e arredondada em 1 casa para a
  // tela. Exigir igualdade exata seria testar o arredondamento, nao a conta.
  perto(p.resumo.cobertura,m2Giram/p.resumo.media_dia,
    'estoque QUE GIRA dividido pelo consumo',0.05);

  igual(m2Giram<p.resumo.m2,true,'ha estoque parado fora dessa conta');
  igual(p.resumo.cobertura<p.resumo.m2/p.resumo.media_dia,true,
    'e por isso a cobertura sai MENOR que a do estoque inteiro');

  /* DUAS ARMADILHAS, e a segunda quase passou:

     1. A media aritmetica das coberturas seria puxada por um material de
        giro minusculo com 900 dias de folga.
     2. O conjunto INTEIRO tem o mesmo defeito por outra porta: o material
        parado poe metros no numerador e zero no denominador. Numa fabrica
        com metade do estoque encalhado a cobertura dobra — e o numero diz
        "folgado" justamente PORQUE ha dinheiro dormindo. */
}},

{nome:'os filtros cortam as linhas E recalculam o topo', executar({igual,perto}){
  const todos=gerencial.painel(30,{});
  const so3=gerencial.painel(30,{largura:'3'});
  igual(so3.linhas.every(l=>l.largura===3),true,'so a bobina 3,00');
  igual(so3.resumo.m2<todos.resumo.m2,true,'e o total do topo encolheu junto');
  perto(so3.resumo.m2,so3.linhas.reduce((s,l)=>s+l.m2_parado,0),
    'o cabecalho conta exatamente o que a tabela mostra');

  const soPreto=gerencial.painel(30,{cor:'Preto'});
  igual(soPreto.linhas.every(l=>l.cor_nome==='Preto'),true,'filtro por cor');
  /* Filtrar a tabela e deixar o cabecalho no total faria a tela contar uma
     coisa em cima e outra embaixo — e quem le o cabecalho nao percebe. */
}},

{nome:'as opcoes de filtro saem do que EXISTE, nao do cadastro', executar({igual}){
  tecido.criarCor({nome:'Turquesa'});   // cadastrada e nunca comprada
  const p=gerencial.painel(30,{});
  igual(p.opcoes.cores.includes('Turquesa'),false,
    'cor sem rolo e sem consumo nao vira botao de filtro');
  igual(p.opcoes.cores.includes('Preto'),true,'e a que existe, sim');
  /* Cor cadastrada e nunca comprada no seletor faz a pessoa filtrar,
     receber tela vazia e concluir que o sistema perdeu dado. */
}},

{nome:'⚠️ AJUSTE E ENCERRAMENTO nao entram no consumo daqui tambem', executar({perto}){
  const {largo}=cena();
  const antes=acha(gerencial.painel(30,{}),'Branco',3).m2;
  rolo.ajustar(largo.id,80,'contagem',EU);
  const depois=acha(gerencial.painel(30,{}),'Branco',3);
  perto(depois.m2,antes,'o consumo nao mudou');
  // O estoque mudou (o ajuste e real), o CONSUMO nao — ajuste e correcao de
  // contagem, nao corte. E a regra do fluxo_estoque.js do PCP (§18).
}},

{nome:'quem nao ve preco nao recebe valor NENHUM do painel', executar({igual}){
  const p=gerencial.painel(30,{});
  igual('valor' in p.resumo,true,'a chefia recebe');
  const podado=custo.semPreco(p);
  igual('valor' in podado.resumo,false,'e a bancada nao, nem no resumo');
  igual(podado.linhas.every(l=>!('valor' in l)),true,'nem linha a linha');
  igual(podado.por_faixa.every(f=>!('valor' in f)),true,'nem nas faixas');
  igual(podado.resumo.m2,p.resumo.m2,'o resto do painel chega igual');
}},

{nome:'a auditoria de inconsistencia LE e nao conserta', executar({igual}){
  const antes=db.prepare('SELECT saldo FROM rolo WHERE id=?').get(cena().largo.id).saldo;
  const p=gerencial.problemas();
  igual(Array.isArray(p),true,'devolve lista');
  igual(db.prepare('SELECT saldo FROM rolo WHERE id=?').get(cena().largo.id).saldo,antes,
    'e nao escreveu nada');
  /* Numero errado que a tela arruma sozinha e pior que numero errado
     visivel: some a chance de alguem descobrir a CAUSA, e o proximo erro
     entra pela mesma porta. */
}},

{nome:'saldo negativo e acusado, nao escondido', executar({igual}){
  const {parado}=cena();
  db.prepare('UPDATE rolo SET saldo=-5 WHERE id=?').run(parado.id);
  const achou=gerencial.problemas().some(p=>p.includes('NEGATIVO'));
  db.prepare('UPDATE rolo SET saldo=40 WHERE id=?').run(parado.id);
  igual(achou,true,'o painel acusa o saldo negativo');
}}

];

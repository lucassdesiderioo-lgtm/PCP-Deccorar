// O PAINEL GERENCIAL DO ESTOQUE DE BOBINA NOVA.
//
// ⚠️ ESTE ARQUIVO NAO CALCULA CONSUMO NEM VALOR. Ele COMPOE o que os donos
// unicos ja respondem — `giro.js` (quanto consumiu) e `custo.js` (quanto
// vale) — e e dono unico de tres conceitos que nao existiam:
//
//     ESTOQUE MINIMO   ·   STATUS   ·   FAIXAS DE PARADO
//
// A distincao importa: no dia em que este arquivo tiver a sua propria conta
// de consumo, a tela gerencial e a tela de giro vao divergir, e as duas vao
// parecer certas — cada uma na sua regua. E a armadilha #12 do CLAUDE.md.
//
// ── O QUE ESTE PAINEL OLHA, E O QUE ELE IGNORA ─────────────────────────────
//
//   OLHA     bobina NOVA em estoque (tabela `rolo`, status aberto/fechado)
//   IGNORA   sobra, retalho e refugo — sao outra prateleira e ja tem painel
//            proprio (Painel -> Encalhe)
//
// ⚠️ E POR ISSO A FONTE DE CONSUMO E `movimento_rolo`, E NAO `plano.consumo_m2`.
// O plano soma rolo E sobra na mesma coluna (encaixe.js:146) — legitimo para
// medir desperdicio do corte, e errado aqui: contaria retalho como tecido
// novo. Os dois numeros existem, os dois estao certos, e eles NAO se
// reconciliam. Quem tentar somar um no outro esta misturando duas perguntas.
const db=require('../nucleo/db');
const config=require('../nucleo/config');
const giro=require('./giro');
// `descrever` e o dono unico do formato do endereco ('ROLO · A-1-2'). Montar
// 'haste-andar-nivel' aqui seria uma segunda escrita do mesmo endereco, e as
// duas divergiriam no dia em que o formato mudasse num lugar so.
const endereco=require('./endereco');
/* ⚠️ O COMPROMETIDO NAO E CALCULADO AQUI (fase 4-B). Este arquivo COMPOE os
   donos unicos e nao tem conta propria — e a mesma razao pela qual o consumo
   vem do `giro.js` e o valor do `custo.js`. No dia em que ele somar peca de
   pedido por fora, a tela gerencial e a tela de pedidos divergem, e as duas
   parecem certas (armadilha #12). */
const consumo=require('./consumo');

const arred=(v,c)=>v==null?null:Math.round(v*Math.pow(10,c==null?3:c))/Math.pow(10,c==null?3:c);
const num=v=>Number(config.ler(v));

/* ── ESTOQUE MINIMO ───────────────────────────────────────────────────────
   O que NAO foi feito, e de proposito: ponto de pedido. Ponto de pedido
   precisa de prazo de reposicao do fornecedor, e este modulo nao tem isso
   (nem e escopo dele). Um ponto de pedido sem prazo seria um numero com nome
   de coisa que ele nao e.

   O que existe e uma pergunta que o gestor consegue responder:

       "quantos dias de consumo eu quero ter na prateleira?"

       minimo = consumo medio diario x estMinDias x (1 + estMinSeguranca/100)

   Os dois parametros vivem em `parametro`, editaveis em Cadastros, com
   rotulo e ajuda ao lado. Um "x 1,3" escondido numa funcao seria um numero
   que ninguem sabe de onde saiu — e que ninguem consegue mudar sem deploy.

   ⚠️ SEM CONSUMO, O MINIMO E `null` — NAO ZERO. Material que nunca saiu nao
   tem minimo de zero: nao da para dizer qual e, que e outra coisa. Zero
   diria "nao precisa manter nada", que e uma afirmacao que ninguem fez. */
function minimoDe(mediaDia){
  if(!(mediaDia>0)) return null;
  return arred(mediaDia*num('estMinDias')*(1+num('estMinSeguranca')/100));
}

/* ── STATUS ───────────────────────────────────────────────────────────────
   Quatro estados, nesta ordem de precedencia. A ordem e a regra: um material
   parado com cobertura infinita nao e "normal", e um sem estoque nenhum nao
   e "parado" — ele e a urgencia.

   ┌────────────┬──────────────────────────────────────────────────────────┐
   │ SEM ESTOQUE│ saldo zerado. Nao ha o que cobrir — e o unico caso em que │
   │  (CRITICO) │ cobertura zero e verdade, e nao "nao da pra dizer".       │
   │ CRITICO    │ cobertura < METADE dos dias-alvo. Metade porque o alvo ja │
   │            │ e o piso desejado: chegar nele nao e emergencia, cair a   │
   │            │ metade dele e.                                            │
   │ PARADO     │ tem estoque e NENHUM consumo em `paradoDias`. Dinheiro    │
   │            │ dormindo — outro problema, nao menos grave.               │
   │ ATENCAO    │ cobertura abaixo do alvo, mas acima da metade.            │
   │ NORMAL     │ o resto.                                                  │
   └────────────┴──────────────────────────────────────────────────────────┘

   ⚠️ MATERIAL SEM CONSUMO **E SEM ESTOQUE** NAO TEM STATUS NENHUM — ele nem
   entra na lista. Nao ha nada para gerir ali, e uma linha por combinacao
   tecido x largura que a fabrica nunca comprou encheria a tela de nada. */
function statusDe(l,dias){
  const alvo=num('estMinDias');
  if(!(l.m2_parado>0)) return 'sem_estoque';
  if(l.cobertura!=null&&l.cobertura<alvo/2) return 'critico';
  if(l.dias_sem_consumo==null||l.dias_sem_consumo>=num('paradoDias')) return 'parado';
  if(l.cobertura!=null&&l.cobertura<alvo) return 'atencao';
  return 'normal';
}

/* ── FAIXAS DE PARADO ─────────────────────────────────────────────────────
   As cinco do briefing. `ate:null` e a ultima, aberta.

   ⚠️ O MATERIAL QUE NUNCA FOI CONSUMIDO CAI NA ULTIMA FAIXA, e nao numa
   sexta chamada "nunca". Do ponto de vista do dinheiro parado ele e o caso
   mais grave que existe — separa-lo numa faixa propria no fim da lista o
   tiraria de onde o olho procura. A coluna "ultimo consumo" continua vazia,
   que e onde a diferenca aparece. */
const FAIXAS=[
  {chave:'0-30',    nome:'ate 30 dias',   de:0,   ate:30},
  {chave:'31-60',   nome:'31 a 60 dias',  de:31,  ate:60},
  {chave:'61-90',   nome:'61 a 90 dias',  de:61,  ate:90},
  {chave:'91-180',  nome:'91 a 180 dias', de:91,  ate:180},
  {chave:'180+',    nome:'mais de 180 dias', de:181, ate:null}
];
const faixaDe=dias=>dias==null?'180+'
  :(FAIXAS.find(f=>dias>=f.de&&(f.ate==null||dias<=f.ate))||FAIXAS[FAIXAS.length-1]).chave;

/* Ha quantos dias este material nao tem consumo. `null` = nunca teve.
   Conta desde o ULTIMO CORTE, sem janela: a janela mede a media, e cortar
   esta conta por ela faria todo material parado ha mais tempo que a janela
   mostrar a mesma idade. */
const diasDesde=data=>data==null?null:
  db.prepare("SELECT CAST(julianday('now','localtime')-julianday(?) AS INTEGER) d").get(data).d;

/* ── SOMAR SEM RECONSULTAR ────────────────────────────────────────────────
   Todo consolidado (colecao, cor, bobina) e SOMA do grao tecido x largura.
   Uma segunda consulta por recorte divergiria da tabela detalhada no dia em
   que uma das duas esquecesse de excluir o ajuste — e as duas pareceriam
   certas, cada uma na sua regua. */
function agrupar(linhas,chaveDe,nomeDe){
  const mapa=new Map();
  linhas.forEach(l=>{
    const c=chaveDe(l);
    if(!mapa.has(c)) mapa.set(c,{chave:c, nome:nomeDe(l), materiais:0,
      m2:0, metros:0, m2_parado:0, saldo:0, rolos:0, valor:null, rolos_sem_preco:0});
    const g=mapa.get(c);
    g.materiais++; g.m2+=l.m2||0; g.metros+=l.metros||0;
    g.m2_parado+=l.m2_parado||0; g.saldo+=l.saldo||0; g.rolos+=l.rolos||0;
    g.rolos_sem_preco+=l.rolos_sem_preco||0;
    // Custo indefinido nunca vira zero: o grupo so tem valor se ALGUEM nele
    // tiver preco, e o `rolos_sem_preco` diz que aquele total e piso.
    if(l.valor!=null) g.valor=(g.valor||0)+l.valor;
  });
  return [...mapa.values()].map(g=>({...g,
    m2:arred(g.m2), metros:arred(g.metros), m2_parado:arred(g.m2_parado),
    saldo:arred(g.saldo), valor:arred(g.valor,2)}));
}

/* ── O PAINEL ─────────────────────────────────────────────────────────────
   `filtro` = {linha, abertura, cor, largura} — todos opcionais, todos por
   NOME (a tela monta as opcoes do proprio resultado, entao nao ha id para
   carregar). O filtro corta as LINHAS; a janela e os totais se recalculam em
   cima do que sobrou, senao o cabecalho contaria uma coisa e a tabela outra. */
function painel(diasJanela,filtro){
  const j=giro.janela(diasJanela);
  const f=filtro||{};
  // Uma leitura so por chamada: `comprometido()` varre pedido e plano, e a
  // tela pergunta o mesmo numero em quatro lugares desta funcao.
  /* ⚠️ E ELE PASSA PELO MESMO FILTRO DAS LINHAS. A primeira versao filtrava
     so o `falta` e deixava o `vendido` somar tudo — abrindo a tela em "Cor:
     Branco", o cartao dizia 9,54 m² vendidos e 1,96 de falta, numeros de
     recortes diferentes lado a lado. E o que o comentario do `painel` ja
     mandava nao fazer: o filtro corta as linhas, e o cabecalho conta o que
     sobrou, senao a tela diz duas coisas. */
  const comp=consumo.comprometido().filter(c=>
    (!f.linha    ||c.linha_nome===f.linha)&&
    (!f.abertura ||c.abertura_nome===f.abertura)&&
    (!f.cor      ||c.cor_nome===f.cor));
  const dias=j.vazia?Math.max(1,j.pedidos):j.dias;

  let linhas=giro.porMaterial(dias)
    .map(l=>{
      const media_dia=arred((l.m2||0)/dias);
      const dias_sem_consumo=diasDesde(l.ultimo_corte);
      const minimo=minimoDe(media_dia);
      const base={...l,
        media_dia, media_semana:arred(media_dia*7), media_mes:arred(media_dia*30),
        media_dia_linear:arred((l.metros||0)/dias),
        dias_sem_consumo, faixa_parado:faixaDe(dias_sem_consumo),
        minimo,
        // Quanto falta para chegar ao minimo. Positivo = falta.
        abaixo_do_minimo: minimo==null?null:arred(Math.max(0,minimo-(l.m2_parado||0))),
        // COBERTURA: dias que o estoque aguenta neste ritmo. Sem consumo e
        // `null` — "nao da pra dizer", que nao e zero (CLAUDE.md §3).
        cobertura: media_dia>0?arred((l.m2_parado||0)/media_dia,1):null};
      return {...base, status:statusDe(base,dias)};
    })
    // Material sem estoque E sem consumo nao e gestao, e ruido.
    .filter(l=>l.m2_parado>0||l.m2>0);

  if(f.linha)     linhas=linhas.filter(l=>l.linha_nome===f.linha);
  if(f.abertura)  linhas=linhas.filter(l=>l.abertura_nome===f.abertura);
  if(f.cor)       linhas=linhas.filter(l=>l.cor_nome===f.cor);
  if(f.largura)   linhas=linhas.filter(l=>String(l.largura)===String(f.largura));

  const soma=(campo)=>arred(linhas.reduce((s,l)=>s+(l[campo]||0),0));
  const valor=linhas.reduce((s,l)=>s+(l.valor||0),0);
  const semPreco=linhas.reduce((s,l)=>s+(l.rolos_sem_preco||0),0);
  const m2Parado=soma('m2_parado');
  const mediaDia=soma('media_dia');

  const porFaixa=FAIXAS.map(fx=>{
    const dentro=linhas.filter(l=>l.m2_parado>0&&l.faixa_parado===fx.chave);
    return {...fx, materiais:dentro.length,
      m2:arred(dentro.reduce((s,l)=>s+l.m2_parado,0)),
      valor:arred(dentro.reduce((s,l)=>s+(l.valor||0),0),2),
      rolos_sem_preco:dentro.reduce((s,l)=>s+(l.rolos_sem_preco||0),0)};
  });

  const conta=st=>linhas.filter(l=>l.status===st).length;

  return {
    janela:j, dias,
    parametros:{dias_alvo:num('estMinDias'), seguranca:num('estMinSeguranca'),
                parado_dias:num('paradoDias')},
    resumo:{
      valor:arred(valor,2), piso:semPreco>0, rolos_sem_preco:semPreco,
      m2:m2Parado, metros:soma('saldo'), rolos:linhas.reduce((s,l)=>s+(l.rolos||0),0),
      materiais:linhas.length,
      media_dia:mediaDia, media_mes:arred(mediaDia*30),
      /* ⚠️ A COBERTURA DO CONJUNTO SO OLHA O QUE GIRA — e nao o estoque todo.
         Duas armadilhas, e a segunda quase passou:

         1. A MEDIA ARITMETICA DAS COBERTURAS seria puxada por um material de
            giro minusculo com 900 dias de folga, e o painel diria que esta
            tudo tranquilo enquanto o tecido que gira acaba amanha. Por isso a
            conta e do conjunto: estoque ÷ consumo.

         2. So que o conjunto INTEIRO tem o mesmo defeito por outra porta: o
            material PARADO poe metros no numerador e zero no denominador.
            Numa fabrica com metade do estoque encalhado, a cobertura do
            conjunto dobra — e o numero diz "folgado" justamente porque ha
            dinheiro dormindo, que e o oposto do que ele deveria alarmar.

         Entao o numerador e so o estoque dos materiais QUE TEM CONSUMO. O
         que esta parado tem numero proprio no card ao lado, onde ele e
         problema em vez de virar conforto. */
      cobertura: mediaDia>0
        ? arred(linhas.filter(l=>l.media_dia>0)
                      .reduce((s,l)=>s+(l.m2_parado||0),0)/mediaDia,1)
        : null,
      criticos:conta('critico')+conta('sem_estoque'),
      atencao:conta('atencao'), parados:conta('parado'),
      m2_parado:arred(linhas.filter(l=>l.status==='parado')
        .reduce((s,l)=>s+(l.m2_parado||0),0)),
      valor_parado:arred(linhas.filter(l=>l.status==='parado')
        .reduce((s,l)=>s+(l.valor||0),0),2),
      /* O GATILHO 2 QUE FALTAVA AQUI: o que ja esta vendido e ainda nao foi
         cortado. O minimo acima olha para tras (o giro); este olha para a
         frente, e os dois nao se somam — sao duas perguntas, como o
         `faltaHoje` e o `precisa` do §18 do CLAUDE.md. */
      comprometido:arred(comp.reduce((s,l)=>s+(l.m2||0),0)),
      comprometido_pecas:comp.reduce((s,l)=>s+(l.pecas||0),0),
      // Quanto falta COMPRAR por causa de venda ja aprovada. Soma por tecido:
      // somar os saldos antes faria a sobra de um cobrir a falta do outro.
      falta_comprometida:arred(porTecido(linhas,comp)
        .reduce((s,l)=>s+(l.falta||0),0))
    },
    linhas,
    por_colecao:agrupar(linhas,l=>l.linha_nome+' · '+l.abertura_nome,l=>l.linha_nome+' · '+l.abertura_nome),
    por_cor:agrupar(linhas,l=>l.cor_nome,l=>l.cor_nome),
    por_largura:agrupar(linhas,l=>String(l.largura),l=>l.largura),
    /* ⚠️ O GRAO DO COMPROMETIDO E O TECIDO, e por isso ele tem lista PROPRIA
       em vez de uma coluna em `linhas`. Aquela tabela e tecido x largura, e o
       pedido nao escolhe largura — quem escolhe e o plano de corte, na hora
       de cortar. Repartir seria inventar a escolha dele (armadilha #17). */
    por_tecido:porTecido(linhas,comp),
    por_faixa:porFaixa,
    meses:giro.porMes(),
    // As opcoes dos filtros saem do PROPRIO resultado sem filtro de tela, e
    // nao do cadastro: cor cadastrada e nunca comprada num seletor faz a
    // pessoa filtrar e receber tela vazia, achando que o sistema perdeu dado.
    opcoes:opcoes(),
    problemas:problemas()
  };
}

/* ── O TECIDO INTEIRO: o que tem, o que ja esta vendido, o que falta ──────
   O grao aqui e o TECIDO (linha · abertura · cor), somando as larguras — e
   e o unico lugar do painel onde somar bobina e legitimo, porque a pergunta
   e "quanto deste tecido eu preciso comprar", e nao "esta bobina aguenta".
   A #17 continua valendo para COBERTURA; para COMPRA, a bobina e detalhe do
   plano de corte.

   ⚠️ TECIDO COMPROMETIDO E SEM ROLO NENHUM TEM QUE APARECER. Ele nao esta em
   `linhas` — aquele filtro tira quem nao tem estoque nem consumo, e esta
   certo para gestao de estoque. Mas aqui ha venda aprovada esperando por ele,
   e some-lo seria o silencio que a §4.10 da spec manda evitar: e justamente
   o pedido "sem tecido" que o vendedor precisa ver para negociar prazo. */
function porTecido(linhas,comp){
  const mapa=new Map();
  const poe=(id,base)=>{
    if(!mapa.has(id)) mapa.set(id,Object.assign({tecido_id:id,
      linha_nome:'', abertura_nome:'', cor_nome:'',
      m2:0, metros:0, rolos:0, larguras:[], comprometido:0, pecas:0,
      pedidos:[]},base||{}));
    return mapa.get(id);
  };

  linhas.forEach(l=>{
    const g=poe(l.tecido_id,{linha_nome:l.linha_nome,
      abertura_nome:l.abertura_nome, cor_nome:l.cor_nome});
    g.m2+=l.m2_parado||0; g.metros+=l.saldo||0; g.rolos+=l.rolos||0;
    if(l.largura!=null&&g.larguras.indexOf(l.largura)<0) g.larguras.push(l.largura);
  });

  /* `comp` JA CHEGA FILTRADO pelo `painel`, e de proposito: filtrar aqui
     dentro tambem deixaria o cartao do resumo e esta tabela com duas contas
     do mesmo numero, que e como elas divergem.

     ⚠️ A LARGURA NUNCA FILTRA O COMPROMETIDO: ele nao tem largura (regra 3 do
     `consumo.js` — quem escolhe a bobina e o plano). Filtrar por ela o
     zeraria, e zero ali seria mentira. */
  comp.forEach(c=>{
    const g=poe(c.tecido_id,{linha_nome:c.linha_nome,
      abertura_nome:c.abertura_nome, cor_nome:c.cor_nome});
    g.comprometido+=c.m2||0; g.pecas+=c.pecas||0;
    g.pedidos=g.pedidos.concat(c.pedidos||[]);
  });

  return [...mapa.values()]
    // Tecido sem estoque E sem venda aprovada nao e gestao, e ruido — a
    // mesma regra da tabela de cima.
    .filter(g=>g.m2>0||g.comprometido>0)
    .map(g=>({...g,
      m2:arred(g.m2), metros:arred(g.metros),
      comprometido:arred(g.comprometido),
      larguras:g.larguras.sort((a,b)=>a-b),
      // ⚠️ FALTA NUNCA E NEGATIVA, e sobra nao e falta de outro: a conta e
      // por tecido, e nao ha emenda entre cores.
      falta:arred(Math.max(0,(g.comprometido||0)-(g.m2||0)))}))
    .sort((a,b)=>(b.falta-a.falta)||(b.comprometido-a.comprometido));
}

/* Os valores que existem DE VERDADE no estoque ou no consumo. */
function opcoes(){
  const l=giro.porMaterial(1).filter(x=>x.m2_parado>0||x.m2>0);
  const unicos=(f)=>[...new Set(l.map(f))].filter(v=>v!=null&&v!=='').sort();
  return {
    linhas:unicos(x=>x.linha_nome),
    aberturas:unicos(x=>x.abertura_nome),
    cores:unicos(x=>x.cor_nome),
    larguras:[...new Set(l.map(x=>x.largura))].sort((a,b)=>a-b)
  };
}

/* ── ⚠️ INCONSISTENCIA NAO SE CORRIGE EM SILENCIO ─────────────────────────
   Este e um sistema de estoque: um numero errado que a tela "arruma" sozinha
   e pior que um numero errado visivel, porque some a chance de alguem
   descobrir a causa. Estas seis checagens sao read-only e aparecem no
   proprio painel; nenhuma delas escreve nada. */
function problemas(){
  const p=[];
  const q=(sql,frase)=>{ const r=db.prepare(sql).all(); if(r.length) p.push(frase(r)); };

  q(`SELECT codigo, saldo FROM rolo WHERE saldo < -0.001`,
    r=>r.length+' rolo(s) com saldo NEGATIVO: '+r.map(x=>x.codigo).join(', ')+
      ' — consumo maior que a entrada, ou ajuste errado');

  q(`SELECT codigo FROM rolo WHERE largura IS NULL OR largura <= 0`,
    r=>r.length+' rolo(s) sem largura de bobina: '+r.map(x=>x.codigo).join(', ')+
      ' — nao entram em nenhum m² nem em cobertura');

  q(`SELECT r.codigo, r.saldo,
            COALESCE((SELECT SUM(delta) FROM movimento_rolo m WHERE m.rolo_id=r.id),0) soma
       FROM rolo r
      WHERE ABS(r.saldo - COALESCE((SELECT SUM(delta) FROM movimento_rolo m
                                     WHERE m.rolo_id=r.id),0)) > 0.001`,
    r=>r.length+' rolo(s) com saldo diferente da soma dos movimentos: '+
      r.map(x=>x.codigo+' (saldo '+x.saldo+', movimentos '+arred(x.soma)+')').join(', '));

  q(`SELECT p.id FROM plano p
      WHERE p.confirmado=1
        AND NOT EXISTS (SELECT 1 FROM movimento_rolo m WHERE m.referencia=CAST(p.id AS TEXT)
                         AND ${giro.SAIDA})
        AND EXISTS (SELECT 1 FROM plano_faixa f WHERE f.plano_id=p.id AND f.rolo_id IS NOT NULL)`,
    r=>r.length+' plano(s) confirmado(s) que usaram rolo e NAO geraram consumo — '+
      'o estoque nao baixou: plano '+r.map(x=>x.id).join(', '));

  q(`SELECT DISTINCT r.largura FROM rolo r
      WHERE r.status<>'encerrado' AND r.largura > 0
        AND NOT EXISTS (SELECT 1 FROM largura_bobina lb
                         WHERE ROUND(lb.valor,3)=ROUND(r.largura,3))`,
    r=>r.length+' largura(s) em uso que sumiram do cadastro: '+
      r.map(x=>x.largura+' m').join(', ')+' — o filtro por bobina nao as oferece');

  /* DOIS TUBOS NO MESMO BURACO. Cada nivel guarda um rolo so, e a entrada e o
     Mover recusam desde entao — mas o que ja estava na prateleira antes da
     regra continua la. Trava nova nao apaga passado, e a alternativa (recusar
     de uma vez tudo que ja existe) pararia a estante inteira por um estado que
     ninguem criou hoje.

     Por isso ele aparece AQUI, onde e trabalho de arrumar em vez de recusa na
     cara de quem tem o tubo na mao: mover um dos dois resolve, e ate la os
     dois estao visiveis. */
  q(`SELECT r.nivel_id,
            GROUP_CONCAT(r.codigo,', ') codigos, COUNT(*) c
       FROM rolo r
      WHERE r.nivel_id IS NOT NULL AND r.status IN ('aberto','fechado')
      GROUP BY r.nivel_id HAVING COUNT(*) > 1`,
    r=>r.length+' endereco(s) com mais de um rolo: '+
      r.map(x=>endereco.descrever(x.nivel_id)+' ('+x.codigos+')').join('; ')+
      ' — cada nivel guarda um rolo so; mova um deles para outro buraco');

  return p;
}

module.exports={painel,minimoDe,statusDe,faixaDe,FAIXAS,problemas,opcoes};

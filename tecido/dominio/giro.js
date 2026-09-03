// O QUE SAI, E QUANTO SAI POR DIA.
//
// ⚠️ ESTE ARQUIVO E O DONO UNICO DE "QUANTO CONSUMIU". Duas contas de saida
// divergiriam no primeiro mes, e as duas pareceriam certas — e a armadilha #12
// do CLAUDE.md, que ja custou a reforma inteira da aba Estoque do PCP.
//
// ── AS TRES REGRAS QUE FAZEM O NUMERO SER VERDADE ───────────────────────────
//
// 1. SAIDA E `motivo='consumo'`, E SO. Ajuste e encerramento tambem mexem no
//    saldo e nenhum dos dois e corte: o ajuste e correcao de contagem, o
//    encerramento e o acerto do que sobrou no tubo. Somados, o numero deixaria
//    de responder "quanto a fabrica cortou" e passaria a responder "quanto a
//    coluna variou", que ninguem perguntou. E a licao do fluxo_estoque.js
//    (CLAUDE.md §18), aqui de novo.
//
// 2. ⚠️ A JANELA NUNCA E MAIOR QUE A HISTORIA QUE EXISTE. Pedir media de 30
//    dias com 12 dias de historico divide por 30 e devolve um numero 2,5x
//    menor que a verdade — sem erro, sem aviso, com cara de fato. Por isso a
//    janela EFETIVA e cortada no primeiro consumo registrado, e a resposta diz
//    de quantos dias ela esta falando. Media de 12 dias apresentada como
//    "media diaria" e o tipo de numero que faz alguem comprar errado.
//
// 3. COBERTURA SEM CONSUMO E `null`, NAO ZERO. Tecido que nao saiu na janela
//    nao tem cobertura de zero dias — nao da para dizer, que e outra coisa.
//    Mesma regra da tela azul do operador (CLAUDE.md §3).
const db=require('../nucleo/db');

const arred=(v,c)=>v==null?null:Math.round(v*Math.pow(10,c==null?3:c))/Math.pow(10,c==null?3:c);

// O consumo e delta NEGATIVO. `-m.delta` e o que saiu do rolo, em metro
// linear; multiplicado pela largura DAQUELE rolo vira o m² que virou peca.
const SAIDA=`m.motivo='consumo'`;

const primeiroConsumo=()=>{
  const r=db.prepare(`SELECT MIN(data) d FROM movimento_rolo m WHERE ${SAIDA}`).get();
  return r&&r.d||null;
};

/* A JANELA DE VERDADE. `pedidos` e o que a tela quis; `dias` e o que a
   historia permite. Quando os dois diferem, a tela TEM que dizer — e por isso
   os dois voltam na resposta, e nao so o resultado. */
function janela(diasPedidos){
  const pedidos=Math.max(1,Math.min(365,Number(diasPedidos)||30));
  const desde=primeiroConsumo();
  if(!desde) return {pedidos, dias:0, desde:null, completa:false, vazia:true};

  const idade=db.prepare(
    "SELECT CAST(julianday('now','localtime')-julianday(?) AS INTEGER)+1 d").get(desde).d;
  const dias=Math.max(1,Math.min(pedidos,idade));
  return {pedidos, dias, desde, completa:dias>=pedidos, vazia:false};
}

const DE=`FROM movimento_rolo m
  JOIN rolo r ON r.id=m.rolo_id
  JOIN tecido t ON t.id=r.tecido_id
  JOIN linha l ON l.id=t.linha_id
  JOIN abertura a ON a.id=t.abertura_id
  JOIN cor c ON c.id=t.cor_id`;

const SOMAS=`
  ROUND(SUM(-m.delta),3) AS metros,
  ROUND(SUM(-m.delta*r.largura),3) AS m2,
  COUNT(DISTINCT m.data) AS dias_com_corte,
  COUNT(DISTINCT m.rolo_id) AS rolos,
  MAX(m.data) AS ultimo_corte`;

/* O recorte generico. `chave` e a coluna que agrupa — tecido, largura ou cor.
   Um SQL so para os tres porque a CONTA e a mesma: tres copias envelheceriam
   separadas e, no dia em que uma esquecesse de excluir o ajuste, os totais
   deixariam de bater entre si sem ninguem entender por que. */
function porChave(chave,extra,dias){
  return db.prepare(`
    SELECT ${chave} AS chave, ${extra?extra+',':''} ${SOMAS}
      ${DE}
     WHERE ${SAIDA} AND m.data >= date('now','localtime','-'||?||' day')
     GROUP BY chave
     ORDER BY m2 DESC`).all(dias-1);
}

/* Quanto tem parado hoje, para casar com o que sai por dia. Sai do MESMO
   lugar do saldo (a soma dos rolos), e nao de uma coluna guardada — saldo
   guardado e saldo que diverge sozinho (R6). */
const saldoPor=chave=>db.prepare(`
  SELECT ${chave} AS chave,
         ROUND(SUM(r.saldo),3) AS saldo,
         ROUND(SUM(r.saldo*r.largura),3) AS m2_parado
    FROM rolo r
    JOIN tecido t ON t.id=r.tecido_id
    JOIN cor c ON c.id=t.cor_id
   WHERE r.status IN ('aberto','fechado') AND r.saldo > 0.001
   GROUP BY chave`).all();

/* Media diaria por DIAS CORRIDOS da janela, nao por dias com corte.
   A pergunta e "quanto essa fabrica gasta por dia"; dividir so pelos dias em
   que houve corte responde "quanto ela gasta num dia de corte", que e outro
   numero e sempre maior. Os dois vao na resposta — `dias_com_corte` diz de
   quantos dias uteis aquela media saiu. */
function comMedia(linhas,dias,saldos){
  const porChaveSaldo=new Map(saldos.map(s=>[String(s.chave),s]));
  return linhas.map(l=>{
    const media_dia=arred(l.m2/dias);
    const s=porChaveSaldo.get(String(l.chave))||{saldo:0,m2_parado:0};
    return {...l, media_dia, media_mes:arred(media_dia*30),
      media_dia_linear:arred(l.metros/dias),
      m2_parado:s.m2_parado||0, saldo:s.saldo||0,
      /* COBERTURA: quantos dias o que esta na prateleira aguenta neste ritmo.
         E ela que mede risco, e nao a quantidade — 200 m² de um tecido que
         gira 40 m²/dia e menos folga que 50 m² de um que gira 1. */
      cobertura: media_dia>0 ? arred((s.m2_parado||0)/media_dia,1) : null};
  });
}

/* O TECIDO que esta na prateleira e do qual NAO saiu nada na janela. Nao
   entra na lista de giro por definicao (a consulta parte do consumo), e some
   — que e o pior lugar para um tecido parado estar. Aqui ele tem lista
   propria.

   ⚠️ A CONTA E POR TECIDO, E NAO POR ROLO. Por rolo, um tecido com um tubo
   girando e outro esquecido apareceria nas DUAS listas — e o titulo "nao saiu
   nada" estaria mentindo sobre ele, porque saiu. Rolo parado ja tem resposta
   propria e melhor: a coluna "Parado" da tela de Rolos, que conta desde o
   ultimo consumo daquele tubo. Duas telas respondendo a mesma pergunta com
   granularidades diferentes e o comeco de duas reguas. */
const semSaida=dias=>db.prepare(`
  SELECT t.id AS tecido_id, l.nome AS linha_nome, a.nome AS abertura_nome,
         c.nome AS cor_nome, COUNT(*) AS rolos,
         ROUND(SUM(r.saldo),3) AS saldo, ROUND(SUM(r.saldo*r.largura),3) AS m2_parado,
         ROUND(SUM(CASE WHEN r.preco_m2 IS NOT NULL THEN r.saldo*r.largura*r.preco_m2 END),2) AS valor,
         SUM(CASE WHEN r.preco_m2 IS NULL THEN 1 ELSE 0 END) AS rolos_sem_preco
    FROM rolo r
    JOIN tecido t ON t.id=r.tecido_id
    JOIN linha l ON l.id=t.linha_id
    JOIN abertura a ON a.id=t.abertura_id
    JOIN cor c ON c.id=t.cor_id
   WHERE r.status IN ('aberto','fechado') AND r.saldo > 0.001
     AND NOT EXISTS (SELECT 1 FROM movimento_rolo m
                       JOIN rolo ir ON ir.id=m.rolo_id
                      WHERE ir.tecido_id=t.id AND ${SAIDA}
                        AND m.data >= date('now','localtime','-'||?||' day'))
   GROUP BY t.id
   ORDER BY valor DESC NULLS LAST, m2_parado DESC`).all(dias-1);

// O consumo mes a mes, para ver tendencia. Nunca cortado pela janela: a
// janela e da media; a serie e a historia.
const porMes=()=>db.prepare(`
  SELECT substr(m.data,1,7) AS mes,
         ROUND(SUM(-m.delta),3) AS metros,
         ROUND(SUM(-m.delta*r.largura),3) AS m2,
         COUNT(DISTINCT m.rolo_id) AS rolos
    FROM movimento_rolo m JOIN rolo r ON r.id=m.rolo_id
   WHERE ${SAIDA}
   GROUP BY mes ORDER BY mes DESC`).all();

/* ── O PAINEL DO GIRO ─────────────────────────────────────────────────────
   `janela` sobe inteira na resposta de proposito: e obrigacao da tela dizer
   de quantos dias a media esta falando. Um numero de media sem a janela do
   lado e um numero que engana com cara de fato. */
function painel(diasPedidos){
  const j=janela(diasPedidos);
  if(j.vazia) return {janela:j, tecidos:[], larguras:[], cores:[],
                      sem_saida:semSaida(j.pedidos), meses:[]};
  const d=j.dias;
  return {
    janela:j,
    tecidos:comMedia(
      porChave('t.id',"l.nome AS linha_nome, a.nome AS abertura_nome, c.nome AS cor_nome",d),
      d, saldoPor('t.id')),
    larguras:comMedia(porChave('r.largura',null,d), d, saldoPor('r.largura')),
    cores:comMedia(porChave('c.nome',null,d), d, saldoPor('c.nome')),
    sem_saida:semSaida(d),
    meses:porMes()
  };
}

module.exports={painel,janela,porMes,semSaida,primeiroConsumo};

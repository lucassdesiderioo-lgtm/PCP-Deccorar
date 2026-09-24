// O QUE OS PEDIDOS APROVADOS AINDA VAO CONSUMIR — fase 4-B da spec
// SOBMEDIDA-PEDIDO-REVENDA, a metade do TECIDO.
//
// O painel gerencial ja sabia quanto tem na estante e quanto GIROU
// (`giro.js`), e dizia, com todas as letras, que nao faz ponto de pedido.
// Faltava ali o outro lado da mesma pergunta: quanto ja esta VENDIDO e ainda
// nao foi cortado. Este arquivo e o dono unico disso.
//
//   giro.js      o que SAIU        (olha para tras)
//   consumo.js   o que VAI SAIR    (olha para a frente)   ← este
//   gerencial.js compoe os dois — e nao calcula nenhum deles
//
// ⚠️ TRES REGRAS, E CADA UMA FECHA UMA PORTA DE ERRO DIFERENTE.
//
// 1. E CONSUMO, NAO CORTE. Sao os dois numeros da linha da ficha (armadilha
//    #18 do CLAUDE.md), e eles nunca fecham. O corte e sempre o mais
//    apertado — comprar por ele compra a MENOS, e a bobina acaba no meio de
//    um pedido.
//
// 2. ELE BAIXA QUANDO A PECA E CORTADA. Um numero que so sobe vira numero que
//    a equipe aprende a ignorar, e aI ele nao compra nada. O que baixa e o
//    plano CONFIRMADO — plano so calculado nao consumiu rolo nenhum.
//
// 3. ELE NAO E REPARTIDO ENTRE AS BOBINAS. O pedido escolhe a COR; quem
//    escolhe a LARGURA e o plano de corte, e so na hora de cortar. Dividir o
//    comprometido entre as larguras seria inventar a escolha do plano — e e a
//    armadilha #17 por dentro: nao ha emenda, cada bobina e um estoque.
const db=require('../nucleo/db');

const arred=(v,c)=>v==null?null:Math.round(v*Math.pow(10,c==null?3:c))/Math.pow(10,c==null?3:c);

/* ── AS PECAS QUE A FABRICA AINDA DEVE ────────────────────────────────────
   Pedido aprovado, nao cancelado, peca nao cancelada, e a linha de TECIDO da
   ficha congelada. `m2_mm2` sai do consumo, em milimetro quadrado inteiro —
   a conta so vira metro no fim (nucleo/unidade.js manda dentro, §19). */
const PECAS=`
  SELECT i.id AS item_id, i.n, i.tecido_id,
         p.id AS pedido_id, p.numero AS pedido_numero,
         r.nome_fantasia AS revenda_nome,
         c.consumo_largura_mm AS cl, c.consumo_altura_mm AS ca,
         c.largura_corte_mm AS corte_l, c.altura_corte_mm AS corte_a
    FROM sm_pedido_item i
    JOIN sm_pedido p ON p.id=i.pedido_id
    LEFT JOIN sm_revenda r ON r.id=p.revenda_id
    JOIN sm_pedido_componente c ON c.item_id=i.id AND c.chave='tecido'
   WHERE p.marco='aprovado' AND p.cancelado_em IS NULL
     AND i.cancelado_em IS NULL AND i.tecido_id IS NOT NULL
     AND c.consumo_largura_mm IS NOT NULL AND c.consumo_altura_mm IS NOT NULL`;

/* ── O QUE JA FOI CORTADO ─────────────────────────────────────────────────
   Peca de plano CONFIRMADO, casada por (pedido, tecido, medida de corte).

   ⚠️ O CASAMENTO E POR MEDIDA, E ISSO E EXATO — nao e chute. A 4-A manda a
   peca ao plano com `largura_corte_mm/1000`, entao a medida que chega em
   `plano_peca` e a MESMA que esta na ficha congelada. Duas persianas
   identicas do mesmo pedido tem a mesma chave, e aI tanto faz qual das duas
   foi cortada: o que sobra e uma, com o consumo de uma.

   O `pedido` do plano e TEXTO (ele aceita pedido digitado a mao, e o numero
   do Decorsoft), entao a comparacao normaliza — nunca por id, que o plano
   nao tem. */
const CORTADAS=`
  SELECT UPPER(TRIM(pp.pedido)) AS pedido, pp.tecido_id,
         ROUND(pp.largura,3) AS largura, ROUND(pp.altura,3) AS altura,
         COUNT(*) AS n
    FROM plano_peca pp
    JOIN plano pl ON pl.id=pp.plano_id
   WHERE pl.confirmado=1 AND pp.pedido IS NOT NULL AND TRIM(pp.pedido)<>''
     AND pp.nao_alocada_motivo IS NULL
   GROUP BY 1,2,3,4`;

const chaveDe=(pedido,tecido_id,l,a)=>
  String(pedido).toUpperCase().trim()+'|'+tecido_id+'|'+arred(l)+'|'+arred(a);

/* O NOME DO TECIDO vem do mesmo caminho do painel (linha · abertura · cor).
   Montar 'Rolô Screen 1% Branco' a mao aqui seria a segunda escrita do mesmo
   nome, e as duas divergiriam no dia em que o formato mudasse num lugar so. */
const NOMES=`
  SELECT t.id AS tecido_id, l.nome AS linha_nome, a.nome AS abertura_nome,
         c.nome AS cor_nome
    FROM tecido t JOIN linha l ON l.id=t.linha_id
    JOIN abertura a ON a.id=t.abertura_id JOIN cor c ON c.id=t.cor_id`;

/* ── O COMPROMETIDO ───────────────────────────────────────────────────────
   Uma linha por TECIDO — nunca por tecido x largura (regra 3 do topo).
   Devolve tambem de quais pedidos ele veio: sem a origem, um numero grande
   na tela nao tem como ser conferido, e numero que ninguem confere ninguem
   usa para comprar. */
function comprometido(){
  const cortadas=new Map();
  for(const c of db.prepare(CORTADAS).all())
    cortadas.set(chaveDe(c.pedido,c.tecido_id,c.largura,c.altura),c.n);

  const nomes=new Map();
  for(const n of db.prepare(NOMES).all()) nomes.set(n.tecido_id,n);

  const porTecido=new Map();
  for(const p of db.prepare(PECAS).all()){
    /* Cada peca gasta a "cota" de uma cortada igual a ela, se houver. Gastar
       em vez de so comparar e o que faz duas persianas identicas com UMA
       cortada deixarem uma de pe — comparar diria que as duas ja sairam. */
    const k=chaveDe(p.pedido_numero,p.tecido_id,p.corte_l/1000,p.corte_a/1000);
    const resta=cortadas.get(k);
    if(resta>0){ cortadas.set(k,resta-1); continue; }

    const m2=p.cl*p.ca/1e6;
    if(!porTecido.has(p.tecido_id)){
      const n=nomes.get(p.tecido_id)||{};
      porTecido.set(p.tecido_id,{tecido_id:p.tecido_id,
        linha_nome:n.linha_nome||'', abertura_nome:n.abertura_nome||'',
        cor_nome:n.cor_nome||'', m2:0, pecas:0, _ped:new Map()});
    }
    const g=porTecido.get(p.tecido_id);
    g.m2+=m2; g.pecas++;
    const chave=p.pedido_id;
    if(!g._ped.has(chave)) g._ped.set(chave,{pedido_id:p.pedido_id,
      numero:p.pedido_numero, revenda:p.revenda_nome||'', pecas:0, m2:0});
    const e=g._ped.get(chave); e.pecas++; e.m2+=m2;
  }

  return [...porTecido.values()].map(g=>({
    tecido_id:g.tecido_id, linha_nome:g.linha_nome,
    abertura_nome:g.abertura_nome, cor_nome:g.cor_nome,
    m2:arred(g.m2), pecas:g.pecas,
    pedidos:[...g._ped.values()].map(x=>({...x,m2:arred(x.m2)}))
                                .sort((a,b)=>(a.numero||0)-(b.numero||0))
  })).sort((a,b)=>b.m2-a.m2);
}

/* Um mapa tecido_id -> m² comprometido, para quem so quer o numero. O
   `gerencial.js` usa este; a tela de tecido usa a lista inteira. */
function porTecido(){
  const m=new Map();
  for(const l of comprometido()) m.set(l.tecido_id,l);
  return m;
}

/* ── OS PEDIDOS QUE ESTAO ESPERANDO TECIDO ────────────────────────────────
   O `sem_tecido` gravado no pedido e uma FOTO do momento do envio (§4.10): ele
   diz que naquele dia nao havia bobina. Depois disso o rolo pode ter chegado
   — ou, pior, o pedido de ontem pode ter comido o rolo que este esperava, e aI
   o pedido nasceu "com tecido" e hoje esta sem.

   ⚠️ SAO DUAS PERGUNTAS DIFERENTES, E AS DUAS FICAM. A foto explica por que a
   revenda ouviu um prazo maior no dia do envio; esta diz o que esta parado
   AGORA. Trocar uma pela outra apagaria a conversa que o vendedor ja teve. */
function pedidosEmRisco(){
  const estoque=new Map();
  for(const r of db.prepare(`
    SELECT tecido_id, ROUND(SUM(saldo*largura),3) AS m2
      FROM rolo WHERE status IN ('aberto','fechado') AND saldo > 0.001
     GROUP BY tecido_id`).all()) estoque.set(r.tecido_id,r.m2||0);

  const risco=new Map();
  for(const t of comprometido()){
    const tem=estoque.get(t.tecido_id)||0;
    if(tem>=t.m2) continue;           // o estoque cobre: nao ha o que avisar
    const tecidoNome=[t.linha_nome,t.abertura_nome,t.cor_nome].filter(Boolean).join(' ');
    /* ⚠️ O PEDIDO INTEIRO ENTRA, e nao so a parte que nao cabe. Nao da para
       dizer QUAL pedido fica sem tecido quando dois disputam a mesma bobina —
       quem decide isso e quem corta, na ordem em que cortar. Escolher aqui
       seria inventar uma fila que nao existe. */
    t.pedidos.forEach(p=>{
      if(!risco.has(p.pedido_id)) risco.set(p.pedido_id,
        {pedido_id:p.pedido_id, numero:p.numero, revenda:p.revenda, tecidos:[]});
      /* ⚠️ SAO DOIS NUMEROS, E O DA LINHA E O DO PEDIDO. A primeira versao
         mandava so o total do tecido, e a tela escrevia "pedido 5001 precisa
         de 7,56 m²" e "pedido 5002 precisa de 7,56 m²" — o mesmo numero em
         dois pedidos de tamanhos diferentes, que quem le soma e compra o
         dobro. `usa` e o que ESTA peca custa; `vendido` e o que a fabrica
         deve daquele tecido inteiro. So apareceu abrindo a tela. */
      risco.get(p.pedido_id).tecidos.push({tecido_id:t.tecido_id, nome:tecidoNome,
        usa:p.m2, vendido:t.m2, tem:arred(tem), falta:arred(t.m2-tem)});
    });
  }
  return [...risco.values()];
}

module.exports={comprometido, porTecido, pedidosEmRisco};

// QUANTO VALE O TECIDO PARADO NA PRATELEIRA — e quanto se pagou por ele.
//
// ⚠️ DONO UNICO DE "QUANTO VALE". Uma segunda soma em qualquer tela divergiria
// da primeira no dia em que alguem lancasse um preco, e as duas estariam
// "certas" — cada uma na sua regua. E a armadilha #12 do CLAUDE.md, que ja
// custou uma reforma inteira da aba Estoque do PCP.
//
// AS QUATRO REGRAS QUE GOVERNAM O NUMERO
//
// 1. O PRECO E DO ROLO, congelado na compra. Nao se guarda preco no cadastro
//    do fornecedor para multiplicar depois: o dia em que ele reajustasse,
//    todo o estoque comprado antes mudaria de valor retroativamente, e
//    ninguem perceberia porque o numero so ficaria maior.
//
// 2. CUSTO INDEFINIDO NUNCA VIRA ZERO. Rolo sem nota lancada nao entra na
//    soma como zero — ele e contado a parte e o total sai como PISO (>=).
//    Zero e um custo valido e mentiroso: faria o estoque parecer mais barato
//    do que e, e ninguem saberia por que.
//
// 3. SEM PECA, TRACO — nunca R$ 0,00. Rolo encerrado tem valor zero de
//    verdade; "R$ 0,00" num rolo sem preco se le como "nao vale nada", que e
//    outra afirmacao.
//
// 4. QUEM NAO TEM custo.ver NAO RECEBE OS CAMPOS. O JSON sai sem eles — nao
//    adianta esconder na tela e mandar pelo fio (regra 14 do CLAUDE.md §13).
const db=require('../nucleo/db');

const arred=(v,casas)=>v==null?null:Math.round(v*Math.pow(10,casas||2))/Math.pow(10,casas||2);

/* ── O PRECO QUE PRE-PREENCHE A PROXIMA ENTRADA ───────────────────────────
   NAO existe tabela de preco por fornecedor, e isso e decisao. Uma tabela
   mantida a mao envelhece calada: o numero fica la parecendo atual e ninguem
   sabe de quando e — a mesma divida dos "minimos sao placeholder" do
   COMPRAS.md, e do alvo velho da §18.

   O que pre-preenche e o ULTIMO PRECO REALMENTE PAGO daquele fornecedor
   naquele tecido, tirado das proprias entradas. Nunca fica velho, porque vem
   da compra de verdade.

   Sem historico daquele par, cai para o ultimo preco do TECIDO com qualquer
   fornecedor — e a resposta diz de quem era (`de_outro_fornecedor`), para a
   tela avisar em vez de fingir que e o preco daquele. */
function ultimoPreco(tecido_id,fornecedor_id){
  const doPar=fornecedor_id&&db.prepare(`
    SELECT preco_m2, criado_em FROM rolo
     WHERE tecido_id=? AND fornecedor_id=? AND preco_m2 IS NOT NULL
     ORDER BY id DESC LIMIT 1`).get(tecido_id,fornecedor_id);
  if(doPar) return {preco:doPar.preco_m2, quando:doPar.criado_em, de_outro_fornecedor:null};

  const doTecido=db.prepare(`
    SELECT r.preco_m2, r.criado_em, f.nome AS fornecedor_nome FROM rolo r
      LEFT JOIN fornecedor f ON f.id=r.fornecedor_id
     WHERE r.tecido_id=? AND r.preco_m2 IS NOT NULL
     ORDER BY r.id DESC LIMIT 1`).get(tecido_id);
  if(doTecido) return {preco:doTecido.preco_m2, quando:doTecido.criado_em,
                       de_outro_fornecedor:doTecido.fornecedor_nome||'sem fornecedor'};
  return {preco:null, quando:null, de_outro_fornecedor:null};
}

/* ── O QUE ESTA PARADO, POR TECIDO ────────────────────────────────────────
   Rolo encerrado fica de fora: ele nao esta na prateleira. */
const EM_ESTOQUE=`r.status IN ('aberto','fechado') AND r.saldo > 0.001`;

const porTecido=()=>db.prepare(`
  SELECT t.id AS tecido_id, t.codigo AS tecido_codigo,
         l.nome AS linha_nome, a.nome AS abertura_nome, c.nome AS cor_nome,
         COUNT(*) AS rolos,
         ROUND(SUM(r.saldo),3) AS saldo,
         ROUND(SUM(r.saldo*r.largura),3) AS m2,
         ROUND(SUM(CASE WHEN r.preco_m2 IS NOT NULL THEN r.saldo*r.largura*r.preco_m2 END),2) AS valor,
         SUM(CASE WHEN r.preco_m2 IS NULL THEN 1 ELSE 0 END) AS rolos_sem_preco,
         ROUND(SUM(CASE WHEN r.preco_m2 IS NULL THEN r.saldo*r.largura END),3) AS m2_sem_preco,
         MIN(CAST(julianday('now','localtime') - julianday(COALESCE(
           (SELECT MAX(m.criado_em) FROM movimento_rolo m
             WHERE m.rolo_id=r.id AND m.motivo='consumo'), r.criado_em)) AS INTEGER)) AS dias_parado
    FROM rolo r
    JOIN tecido t ON t.id=r.tecido_id
    JOIN linha l ON l.id=t.linha_id
    JOIN abertura a ON a.id=t.abertura_id
    JOIN cor c ON c.id=t.cor_id
   WHERE ${EM_ESTOQUE}
   GROUP BY t.id
   ORDER BY valor DESC NULLS LAST, m2 DESC`).all();

/* Por LARGURA DE BOBINA e por COR. Sao dois recortes do mesmo dinheiro, e nao
   dois numeros novos: a soma de qualquer um dos tres bate com o total. */
const agrupado=coluna=>db.prepare(`
  SELECT ${coluna} AS chave, COUNT(*) AS rolos,
         ROUND(SUM(r.saldo),3) AS saldo,
         ROUND(SUM(r.saldo*r.largura),3) AS m2,
         ROUND(SUM(CASE WHEN r.preco_m2 IS NOT NULL THEN r.saldo*r.largura*r.preco_m2 END),2) AS valor,
         SUM(CASE WHEN r.preco_m2 IS NULL THEN 1 ELSE 0 END) AS rolos_sem_preco
    FROM rolo r
    JOIN tecido t ON t.id=r.tecido_id
    JOIN cor c ON c.id=t.cor_id
   WHERE ${EM_ESTOQUE}
   GROUP BY chave ORDER BY valor DESC NULLS LAST, m2 DESC`).all();

/* Quanto cada fornecedor cobrou, de verdade — e nao o que uma tabela diz.
   Sai das compras: o preco medio ponderado pelo m2 comprado, o ultimo preco e
   quando foi. E o unico jeito honesto de comparar dois fornecedores. */
const porFornecedor=()=>db.prepare(`
  SELECT f.id AS fornecedor_id, f.nome AS fornecedor_nome,
         t.id AS tecido_id, t.codigo AS tecido_codigo,
         l.nome AS linha_nome, a.nome AS abertura_nome, c.nome AS cor_nome,
         COUNT(*) AS compras,
         ROUND(SUM(r.metragem_inicial*r.largura),3) AS m2_comprado,
         ROUND(SUM(r.metragem_inicial*r.largura*r.preco_m2)
               / NULLIF(SUM(r.metragem_inicial*r.largura),0),4) AS preco_medio,
         ROUND(MIN(r.preco_m2),4) AS menor, ROUND(MAX(r.preco_m2),4) AS maior,
         MAX(r.criado_em) AS ultima_compra
    FROM rolo r
    JOIN fornecedor f ON f.id=r.fornecedor_id
    JOIN tecido t ON t.id=r.tecido_id
    JOIN linha l ON l.id=t.linha_id
    JOIN abertura a ON a.id=t.abertura_id
    JOIN cor c ON c.id=t.cor_id
   WHERE r.preco_m2 IS NOT NULL
   GROUP BY f.id, t.id
   ORDER BY l.nome, a.nome, c.nome, preco_medio`).all();

/* Os rolos que entraram e ainda nao tem nota lancada. E a lista de trabalho
   de quem fecha o mes — sem ela, "a nota chega depois" vira "a nota nunca
   chega", que e o mesmo fim de qualquer marcacao sem lista (armadilha #14). */
const semNota=()=>db.prepare(`
  SELECT r.id, r.codigo, r.largura, r.saldo, r.criado_em, r.criado_por,
         r.nf, r.preco_m2, f.nome AS fornecedor_nome,
         l.nome AS linha_nome, a.nome AS abertura_nome, c.nome AS cor_nome,
         CAST(julianday('now','localtime')-julianday(r.criado_em) AS INTEGER) AS dias
    FROM rolo r
    JOIN tecido t ON t.id=r.tecido_id
    JOIN linha l ON l.id=t.linha_id
    JOIN abertura a ON a.id=t.abertura_id
    JOIN cor c ON c.id=t.cor_id
    LEFT JOIN fornecedor f ON f.id=r.fornecedor_id
   WHERE r.status<>'encerrado'
     AND (r.preco_m2 IS NULL OR TRIM(COALESCE(r.nf,''))='' OR r.fornecedor_id IS NULL)
   ORDER BY dias DESC, r.id`).all();

/* ── O PAINEL DO DINHEIRO PARADO ──────────────────────────────────────────
   `piso` e a palavra certa quando ha rolo sem preco: o total e no MINIMO
   isso. A tela escreve o >= na frente e diz quantos rolos faltam — prometer
   um total exato com buraco dentro e a mesma mentira do zero. */
function painel(){
  const tecidos=porTecido();
  const total=tecidos.reduce((s,t)=>s+(t.valor||0),0);
  const semPreco=tecidos.reduce((s,t)=>s+(t.rolos_sem_preco||0),0);
  const rolos=tecidos.reduce((s,t)=>s+t.rolos,0);
  return {
    tecidos,
    larguras:agrupado('r.largura'),
    cores:agrupado('c.nome'),
    fornecedores:porFornecedor(),
    sem_nota:semNota(),
    resumo:{
      rolos, valor:arred(total), rolos_sem_preco:semPreco,
      // `piso` e o que a tela usa para decidir entre "R$ X" e ">= R$ X".
      piso:semPreco>0,
      m2:arred(tecidos.reduce((s,t)=>s+(t.m2||0),0),3)
    }
  };
}

/* A PODA DOS CAMPOS DE PRECO, num lugar so. Chamada pela rota quando quem
   pediu nao tem custo.ver: o JSON sai SEM os campos, e nao com eles zerados
   ou escondidos por CSS. */
const CAMPOS_PRECO=['preco_m2','valor','valor_total','preco_medio','menor','maior'];
function semPreco(dados){
  if(Array.isArray(dados)) return dados.map(semPreco);
  if(!dados||typeof dados!=='object') return dados;
  const fora={};
  for(const k in dados) if(!CAMPOS_PRECO.includes(k)) fora[k]=semPreco(dados[k]);
  return fora;
}

module.exports={ultimoPreco,porTecido,agrupado,porFornecedor,semNota,painel,
                semPreco,CAMPOS_PRECO};

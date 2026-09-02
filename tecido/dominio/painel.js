// Os numeros que o modulo entrega. Leitura pura — nao move nada.
//
// O CRUZAMENTO que da razao ao painel: tecido SEM ROLO e COM RETALHO. E ele
// que evita comprar tecido que ja esta na prateleira, e por isso ele nao pode
// ficar atras de filtro nenhum.
const db=require('../nucleo/db');
const dRolo=require('../dados/rolo');
const dSobra=require('../dados/sobra');

function estoque(){
  const rolos=dRolo.saldoPorTecido();
  const sobras=dSobra.resumoPorTecido();
  const porId=new Map(sobras.map(s=>[s.tecido_id,s]));
  return rolos.map(r=>{
    const s=porId.get(r.tecido_id)||{sobras:0,area:0};
    return {
      tecido_id:r.tecido_id, tecido_codigo:r.tecido_codigo,
      linha_nome:r.linha_nome, abertura_nome:r.abertura_nome, cor_nome:r.cor_nome,
      saldo:r.saldo, m2_rolo:r.m2, abertos:r.abertos||0, fechados:r.fechados||0,
      sobras:s.sobras, m2_sobra:s.area,
      // A linha que o diretor precisa ver de longe.
      so_retalho: r.saldo<=0.001 && s.area>0
    };
  }).filter(l=>l.saldo>0||l.sobras>0||l.abertos||l.fechados);
}

// Encalhe: a mais parada primeiro. Retalho que nao sai ha meses e dinheiro
// dormindo — e e este relatorio que, em alguns meses, responde melhor que o
// palpite de 50% do pesoSobra.
const encalhe=limite=>db.prepare(`
  SELECT s.codigo, s.largura, s.altura, s.area, s.condicao, s.criado_em,
         CAST(julianday('now','localtime')-julianday(s.criado_em) AS INTEGER) AS dias_parada,
         l.nome AS linha_nome, a.nome AS abertura_nome, c.nome AS cor_nome
    FROM sobra s
    JOIN tecido t ON t.id=s.tecido_id
    JOIN linha l ON l.id=t.linha_id
    JOIN abertura a ON a.id=t.abertura_id
    JOIN cor c ON c.id=t.cor_id
   WHERE s.status='disponivel'
   ORDER BY dias_parada DESC, s.area DESC LIMIT ?`).all(limite||40);

// Refugo por mes e motivo: a perda medida. Sem esta tabela o desperdicio do
// mes e uma sensacao.
const refugo=()=>db.prepare(`
  SELECT substr(data,1,7) AS mes, motivo,
         COUNT(*) AS linhas, ROUND(SUM(area),3) AS area
    FROM refugo GROUP BY mes, motivo ORDER BY mes DESC, area DESC`).all();

// Recusas: onde o reaproveitamento trava. Se "tonalidade" dominar, a resposta
// e registrar o tom no cadastro da sobra; se for "defeito nao cadastrado", o
// problema esta no lancamento na bancada. O motivo e o diagnostico.
const recusas=()=>db.prepare(`
  SELECT m.nome AS motivo, COUNT(*) AS vezes,
         MAX(r.criado_em) AS ultima
    FROM plano_recusa r LEFT JOIN motivo_recusa m ON m.id=r.motivo_id
   GROUP BY r.motivo_id ORDER BY vezes DESC`).all();

// Consumo e desperdicio dos planos confirmados, por mes.
const cortes=()=>db.prepare(`
  SELECT substr(data,1,7) AS mes, COUNT(*) AS planos,
         ROUND(SUM(consumo_linear),2) AS consumo_linear,
         ROUND(SUM(area_pecas),2) AS area_pecas,
         ROUND(SUM(area_sobra_gerada),2) AS area_sobra,
         ROUND(SUM(desperdicio),2) AS desperdicio
    FROM plano WHERE confirmado=1 GROUP BY mes ORDER BY mes DESC`).all();

module.exports={estoque,encalhe,refugo,recusas,cortes};

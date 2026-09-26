// SQL do boleto (secao 4.13, fase 6-C1). Sem regra nenhuma aqui — quem decide
// o que conta, o que sai da conta e o que e recusado e o `dominio/boleto.js`.
//
// ⚠️ A SITUACAO E DERIVADA, e nao uma coluna. Ela sai de `cancelado_em` e
// `pago_em`, que sao os dois fatos gravados; uma coluna `situacao` ao lado
// seria a segunda afirmacao sobre o mesmo fato e divergiria no dia em que
// alguem escrevesse numa so (armadilha #12). A ordem importa: cancelado vence
// pago — um titulo cancelado depois de baixado saiu da conta de vez.
const db=require('../nucleo/db');

const SITUACAO=`CASE WHEN b.cancelado_em IS NOT NULL THEN 'cancelado'
                     WHEN b.pago_em      IS NOT NULL THEN 'pago'
                     ELSE 'aberto' END`;

/* ⚠️ VENCIDO E MARCA, NAO SITUACAO. Ele continua em ABERTO e continua na soma
   do credito: tirar o vencido faria o limite de quem NAO paga parecer mais
   folgado que o de quem paga em dia — exatamente ao contrario. */
const CAMPOS=`b.*, ${SITUACAO} AS situacao,
  CASE WHEN b.cancelado_em IS NULL AND b.pago_em IS NULL
        AND b.vencimento < date('now','localtime')
       THEN 1 ELSE 0 END AS vencido,
  r.nome_fantasia AS revenda_nome, r.vendedor_usuario_id, r.vendedor_nome,
  /* ⚠️ A SOMA DOS PEDIDOS QUE O TITULO CITA — e NULL quando ele nao cita
     nenhum, nunca zero: sem pedido nao ha contra o que comparar, e a
     pergunta nem se faz (regra 4 do custo, §7-B). E por isso a subconsulta
     usa SUM sem COALESCE.
     (O comentario vive dentro de um template literal: crase aqui fecharia a
      string, e foi o que aconteceu na primeira escrita.) */
  (SELECT SUM(p.valor_total_centavos) FROM sm_boleto_pedido bp
     JOIN sm_pedido p ON p.id=bp.pedido_id
    WHERE bp.boleto_id=b.id) AS valor_pedidos_centavos,
  (SELECT COUNT(*) FROM sm_boleto_pedido bp WHERE bp.boleto_id=b.id) AS pedidos_n`;

const DE=`FROM sm_boleto b
  JOIN sm_revenda r ON r.id=b.revenda_id`;

/* Os pedidos de um titulo, na ordem em que a revenda os reconhece — pelo
   NUMERO, que e o que esta escrito no papel dela, e nao pelo id de banco. */
const pedidosDe=boleto_id=>db.prepare(
  'SELECT p.id, p.numero, p.valor_total_centavos, p.marco, p.cancelado_em '+
  '  FROM sm_boleto_pedido bp JOIN sm_pedido p ON p.id=bp.pedido_id '+
  ' WHERE bp.boleto_id=? ORDER BY p.numero').all(boleto_id);

/* Os vinculos de VARIOS titulos numa consulta so — a lista da tela nao pode
   custar uma ida por linha, pela mesma razao do `estouradas` logo abaixo. */
const pedidosDeVarios=ids=>{
  if(!ids.length) return new Map();
  const m=new Map();
  for(const r of db.prepare(
    'SELECT bp.boleto_id, p.id, p.numero, p.valor_total_centavos '+
    '  FROM sm_boleto_pedido bp JOIN sm_pedido p ON p.id=bp.pedido_id '+
    ' WHERE bp.boleto_id IN ('+ids.map(()=>'?').join(',')+') '+
    ' ORDER BY p.numero').all(...ids)){
    if(!m.has(r.boleto_id)) m.set(r.boleto_id,[]);
    m.get(r.boleto_id).push({id:r.id, numero:r.numero,
      valor_total_centavos:r.valor_total_centavos});
  }
  return m;
};

const ligarPedidos=(boleto_id,pedido_ids)=>{
  const ins=db.prepare('INSERT OR IGNORE INTO sm_boleto_pedido(boleto_id,pedido_id) VALUES(?,?)');
  for(const id of pedido_ids) ins.run(boleto_id,id);
};

const porId=id=>db.prepare('SELECT '+CAMPOS+' '+DE+' WHERE b.id=?').get(id);

const porNumero=(revenda_id,numero)=>db.prepare(
  'SELECT '+CAMPOS+' '+DE+' WHERE b.revenda_id=? AND b.numero=? COLLATE NOCASE')
  .get(revenda_id,numero);

const listar=filtro=>{
  const f=filtro||{}, onde=[], v=[];
  if(f.revenda_id!==undefined){ onde.push('b.revenda_id=?'); v.push(f.revenda_id); }
  if(f.pedido_id!==undefined){
    onde.push('EXISTS (SELECT 1 FROM sm_boleto_pedido bp WHERE bp.boleto_id=b.id AND bp.pedido_id=?)');
    v.push(f.pedido_id);
  }
  /* O avulso a parte, porque e a excecao que tem que ficar visivel — e nao
     se misturar com os que tem pedido (decisao do dono, 26/09/2026). */
  if(f.avulso===true)  onde.push('NOT EXISTS (SELECT 1 FROM sm_boleto_pedido bp WHERE bp.boleto_id=b.id)');
  if(f.avulso===false) onde.push('EXISTS (SELECT 1 FROM sm_boleto_pedido bp WHERE bp.boleto_id=b.id)');
  if(f.vendedor_usuario_id!==undefined){
    onde.push('r.vendedor_usuario_id=?'); v.push(f.vendedor_usuario_id);
  }
  if(f.situacao==='aberto')    onde.push('b.cancelado_em IS NULL AND b.pago_em IS NULL');
  if(f.situacao==='pago')      onde.push('b.cancelado_em IS NULL AND b.pago_em IS NOT NULL');
  if(f.situacao==='cancelado') onde.push('b.cancelado_em IS NOT NULL');
  /* A ordem e a do trabalho: vence primeiro, aparece primeiro. */
  return db.prepare('SELECT '+CAMPOS+' '+DE+
    (onde.length?' WHERE '+onde.join(' AND '):'')+
    ' ORDER BY (b.cancelado_em IS NOT NULL), (b.pago_em IS NOT NULL), b.vencimento, b.id').all(...v);
};

/* O QUE A REVENDA DEVE, numa consulta so. `aberto` e a regra inteira: pago e
   cancelado ficam de fora, vencido fica dentro e sai tambem a parte. */
const emAberto=revenda_id=>db.prepare(
  "SELECT COUNT(*) AS quantos, COALESCE(SUM(valor_centavos),0) AS valor, "+
  "  SUM(CASE WHEN vencimento < date('now','localtime') THEN 1 ELSE 0 END) AS vencidos, "+
  "  COALESCE(SUM(CASE WHEN vencimento < date('now','localtime') "+
  "                    THEN valor_centavos ELSE 0 END),0) AS valor_vencido "+
  "  FROM sm_boleto WHERE revenda_id=? AND cancelado_em IS NULL AND pago_em IS NULL")
  .get(revenda_id);

/* ⚠️ A JANELA. O ultimo instante em que alguem mexeu nos boletos desta
   revenda — lancamento, baixa, reabertura ou cancelamento. Ela existe porque
   o modo de falhar deste desenho e OTIMISTA: ninguem lanca, e o disponivel
   fica igual ao limite. Numero sem a janela ao lado engana (armadilha #16). */
const ultimoMovimento=revenda_id=>db.prepare(
  'SELECT MAX(MAX(COALESCE(criado_em,\'\')), MAX(COALESCE(pago_em,\'\')), '+
  '       MAX(COALESCE(reaberto_em,\'\')), MAX(COALESCE(cancelado_em,\'\'))) v '+
  '  FROM sm_boleto WHERE revenda_id=?').get(revenda_id).v||null;

/* OS PEDIDOS APROVADOS SEM BOLETO APONTADO — a segunda metade da pergunta 6
   da §8, que a spec responde com "os dois, mostrados separados".
   ⚠️ Cancelado fora: ele nao e compromisso. E `marco='aprovado'` e nao
   `enviado`, porque o enviado ainda espera o vendedor. */
const aprovadosSemBoleto=revenda_id=>db.prepare(
  "SELECT COUNT(*) AS quantos, COALESCE(SUM(p.valor_total_centavos),0) AS valor "+
  "  FROM sm_pedido p "+
  " WHERE p.revenda_id=? AND p.marco='aprovado' AND p.cancelado_em IS NULL "+
  "   AND NOT EXISTS (SELECT 1 FROM sm_boleto_pedido bp "+
  "                     JOIN sm_boleto b ON b.id=bp.boleto_id "+
  "                    WHERE bp.pedido_id=p.id AND b.cancelado_em IS NULL)")
  .get(revenda_id);

/* A LISTA que a tela marca — e nao so a contagem. Digitar numero de pedido e
   onde nasce o vinculo errado; a lista ja e exatamente o que o sistema sabe,
   como o card de pacote do §5, que nasce preenchido. */
const pedidosSemBoleto=revenda_id=>db.prepare(
  "SELECT p.id, p.numero, p.valor_total_centavos, p.criado_em "+
  "  FROM sm_pedido p "+
  " WHERE p.revenda_id=? AND p.marco='aprovado' AND p.cancelado_em IS NULL "+
  "   AND NOT EXISTS (SELECT 1 FROM sm_boleto_pedido bp "+
  "                     JOIN sm_boleto b ON b.id=bp.boleto_id "+
  "                    WHERE bp.pedido_id=p.id AND b.cancelado_em IS NULL) "+
  " ORDER BY p.numero").all(revenda_id);

// As revendas que TEM boleto em aberto, para a tarefa semanal da carteira.
const revendasComAberto=vendedor_usuario_id=>db.prepare(
  'SELECT r.id, r.nome_fantasia, r.vendedor_usuario_id, r.vendedor_nome, '+
  '       r.valor_limite_credito_centavos '+
  '  FROM sm_revenda r '+
  ' WHERE EXISTS (SELECT 1 FROM sm_boleto b WHERE b.revenda_id=r.id '+
  '                AND b.cancelado_em IS NULL AND b.pago_em IS NULL) '+
  (vendedor_usuario_id===undefined?'':' AND r.vendedor_usuario_id=? ')+
  ' ORDER BY r.nome_fantasia')
  .all(...(vendedor_usuario_id===undefined?[]:[vendedor_usuario_id]));

// TODAS as revendas com limite estourado, numa consulta — o selo do Quadro
// nao pode custar uma ida por cartao.
const estouradas=()=>new Set(db.prepare(
  'SELECT r.id FROM sm_revenda r '+
  ' WHERE r.valor_limite_credito_centavos IS NOT NULL '+
  '   AND (SELECT COALESCE(SUM(b.valor_centavos),0) FROM sm_boleto b '+
  '         WHERE b.revenda_id=r.id AND b.cancelado_em IS NULL AND b.pago_em IS NULL) '+
  '       > r.valor_limite_credito_centavos').all().map(x=>x.id));

const criar=x=>{
  const r=db.prepare(
    'INSERT INTO sm_boleto(revenda_id,numero,valor_centavos,vencimento,'+
    ' emitido_em,observacao,criado_por) VALUES(?,?,?,?,?,?,?)')
    .run(x.revenda_id,x.numero,x.valor_centavos,x.vencimento,
         x.emitido_em||null,x.observacao||null,x.criado_por||null);
  if(x.pedido_ids&&x.pedido_ids.length) ligarPedidos(r.lastInsertRowid,x.pedido_ids);
  return porId(r.lastInsertRowid);
};

const atualizar=(id,campos)=>{
  const ks=Object.keys(campos);
  if(!ks.length) return porId(id);
  db.prepare('UPDATE sm_boleto SET '+ks.map(k=>k+'=?').join(', ')+' WHERE id=?')
    .run(...ks.map(k=>campos[k]),id);
  return porId(id);
};

module.exports={porId,porNumero,listar,emAberto,ultimoMovimento,
  aprovadosSemBoleto,pedidosSemBoleto,revendasComAberto,estouradas,
  pedidosDe,pedidosDeVarios,ligarPedidos,criar,atualizar};

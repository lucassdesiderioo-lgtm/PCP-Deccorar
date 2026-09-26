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
  p.numero AS pedido_numero`;

const DE=`FROM sm_boleto b
  JOIN sm_revenda r ON r.id=b.revenda_id
  LEFT JOIN sm_pedido p ON p.id=b.pedido_id`;

const porId=id=>db.prepare('SELECT '+CAMPOS+' '+DE+' WHERE b.id=?').get(id);

const porNumero=(revenda_id,numero)=>db.prepare(
  'SELECT '+CAMPOS+' '+DE+' WHERE b.revenda_id=? AND b.numero=? COLLATE NOCASE')
  .get(revenda_id,numero);

const listar=filtro=>{
  const f=filtro||{}, onde=[], v=[];
  if(f.revenda_id!==undefined){ onde.push('b.revenda_id=?'); v.push(f.revenda_id); }
  if(f.pedido_id!==undefined){ onde.push('b.pedido_id=?'); v.push(f.pedido_id); }
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
  "   AND NOT EXISTS (SELECT 1 FROM sm_boleto b "+
  "                    WHERE b.pedido_id=p.id AND b.cancelado_em IS NULL)")
  .get(revenda_id);

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
    'INSERT INTO sm_boleto(revenda_id,pedido_id,numero,valor_centavos,vencimento,'+
    ' emitido_em,observacao,criado_por) VALUES(?,?,?,?,?,?,?,?)')
    .run(x.revenda_id,x.pedido_id||null,x.numero,x.valor_centavos,x.vencimento,
         x.emitido_em||null,x.observacao||null,x.criado_por||null);
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
  aprovadosSemBoleto,revendasComAberto,estouradas,criar,atualizar};

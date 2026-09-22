// SQL do pedido sob medida. Sem regra nenhuma aqui — quem decide o que pode
// virar o que e o dominio/pedido.js.
//
// ⚠️ O QUE ESTE ARQUIVO NAO FAZ: ele nao le catalogo e nao calcula preco.
// O pedido congelado e feito de COLUNAS, e quem as preenche e o dominio, uma
// vez so, no envio e na aprovacao. Uma consulta aqui que fosse buscar o preco
// de hoje na colecao seria a releitura que a secao 4.8 da spec proibe — e ela
// nao apareceria em tela nenhuma ate o dia de um reajuste.
const db=require('../nucleo/db');

const CAMPOS=`p.*,
  r.nome_fantasia AS revenda_nome,
  r.vendedor_usuario_id, r.vendedor_nome,
  r.entrega AS revenda_entrega`;
const DE='FROM sm_pedido p JOIN sm_revenda r ON r.id=p.revenda_id';

const porId=id=>db.prepare('SELECT '+CAMPOS+' '+DE+' WHERE p.id=?').get(id);
const porNumero=n=>db.prepare('SELECT '+CAMPOS+' '+DE+' WHERE p.numero=?').get(n);

function listar(f){
  const filtro=f||{}, onde=[], v=[];
  if(filtro.marco){ onde.push('p.marco=?'); v.push(filtro.marco); }
  if(filtro.tipo){ onde.push('p.tipo=?'); v.push(filtro.tipo); }
  if(filtro.revenda_id){ onde.push('p.revenda_id=?'); v.push(filtro.revenda_id); }
  if(filtro.vendedor_usuario_id){ onde.push('r.vendedor_usuario_id=?'); v.push(filtro.vendedor_usuario_id); }
  return db.prepare('SELECT '+CAMPOS+' '+DE+
    (onde.length?' WHERE '+onde.join(' AND '):'')+
    ' ORDER BY p.id DESC').all(...v);
}

/* ⚠️ O MAIOR NUMERO JA USADO, e nao a contagem de pedidos. Numero nao se
   reaproveita: um pedido cancelado guarda o dele, porque ele ja foi dito a
   revenda por escrito — e porque o plano de corte agrupa o tom pelo TEXTO do
   pedido e olha para tras (secao 4.18). */
const maiorNumero=()=>db.prepare('SELECT MAX(numero) v FROM sm_pedido').get().v||0;

const COLUNAS=['revenda_id','tipo','marco','numero','enviado_em','enviado_por',
  'tabela_id','tabela_nome','tabela_desconto_centesimos','desconto_centesimos',
  'valor_total_centavos','prazo_prometido','prazo_atual',
  'aprovado_em','aprovado_por','endereco_entrega_id','entrega','observacao','sem_tecido',
  'cancelado_em','cancelado_por','cancelado_motivo'];

function criar(d){
  const cols=COLUNAS.filter(c=>d[c]!==undefined);
  const info=db.prepare('INSERT INTO sm_pedido('+cols.concat('criado_por').join(',')+') VALUES('+
    cols.map(()=>'?').concat('?').join(',')+')').run(...cols.map(c=>d[c]),d.criado_por||null);
  return porId(info.lastInsertRowid);
}

function atualizar(id,d){
  const cols=COLUNAS.filter(c=>d[c]!==undefined);
  if(!cols.length) return porId(id);
  db.prepare('UPDATE sm_pedido SET '+cols.map(c=>c+'=?').join(', ')+' WHERE id=?')
    .run(...cols.map(c=>d[c]),id);
  return porId(id);
}

// ── Os itens ──────────────────────────────────────────────────────────────
const itens=pedido_id=>db.prepare('SELECT * FROM sm_pedido_item WHERE pedido_id=? ORDER BY n').all(pedido_id);
const item=(pedido_id,id)=>db.prepare('SELECT * FROM sm_pedido_item WHERE pedido_id=? AND id=?').get(pedido_id,id);
const proximoN=pedido_id=>(db.prepare('SELECT MAX(n) v FROM sm_pedido_item WHERE pedido_id=?').get(pedido_id).v||0)+1;

const COL_ITEM=['pedido_id','n','modelo_id','abertura_id','cor_tecido_id','tecido_id',
  'cor_acessorio_id','largura_mm','altura_mm','comando','rolamento','adicional','reducao',
  'degrau_nome','m2_real_mm2','m2_cobrado_mm2','valor_subtotal_centavos','valor_final_centavos',
  'resumo','sem_tecido','sem_tecido_motivo','cancelado_em','cancelado_por','cancelado_motivo'];

function criarItem(d){
  const cols=COL_ITEM.filter(c=>d[c]!==undefined);
  const info=db.prepare('INSERT INTO sm_pedido_item('+cols.join(',')+') VALUES('+
    cols.map(()=>'?').join(',')+')').run(...cols.map(c=>d[c]));
  return db.prepare('SELECT * FROM sm_pedido_item WHERE id=?').get(info.lastInsertRowid);
}

function atualizarItem(id,d){
  const cols=COL_ITEM.filter(c=>d[c]!==undefined&&c!=='pedido_id'&&c!=='n');
  if(!cols.length) return;
  db.prepare('UPDATE sm_pedido_item SET '+cols.map(c=>c+'=?').join(', ')+' WHERE id=?')
    .run(...cols.map(c=>d[c]),id);
}

const apagarItem=id=>{
  db.prepare('DELETE FROM sm_pedido_item_preco WHERE item_id=?').run(id);
  db.prepare('DELETE FROM sm_pedido_componente WHERE item_id=?').run(id);
  db.prepare('DELETE FROM sm_pedido_item WHERE id=?').run(id);
};

// ── As linhas de preco e a ficha explodida ────────────────────────────────
const linhas=item_id=>db.prepare(
  'SELECT * FROM sm_pedido_item_preco WHERE item_id=? ORDER BY ordem, id').all(item_id);
const apagarLinhas=item_id=>db.prepare('DELETE FROM sm_pedido_item_preco WHERE item_id=?').run(item_id);
const criarLinha=d=>db.prepare(`INSERT INTO sm_pedido_item_preco
  (item_id,ordem,chave,nome,unidade,preco_unitario_centavos,base,valor_centavos)
  VALUES(@item_id,@ordem,@chave,@nome,@unidade,@preco_unitario_centavos,@base,@valor_centavos)`).run(d);

const componentes=item_id=>db.prepare(
  'SELECT * FROM sm_pedido_componente WHERE item_id=? ORDER BY ordem, id').all(item_id);
const apagarComponentes=item_id=>db.prepare('DELETE FROM sm_pedido_componente WHERE item_id=?').run(item_id);
const criarComponente=d=>db.prepare(`INSERT INTO sm_pedido_componente
  (item_id,ordem,chave,nome,setor,quantidade,gera_etiqueta,eh_kit,codigo_barras,suportes,
   largura_corte_mm,altura_corte_mm,consumo_largura_mm,consumo_altura_mm)
  VALUES(@item_id,@ordem,@chave,@nome,@setor,@quantidade,@gera_etiqueta,@eh_kit,@codigo_barras,
   @suportes,@largura_corte_mm,@altura_corte_mm,@consumo_largura_mm,@consumo_altura_mm)`).run(d);

// ── Os tres registros ─────────────────────────────────────────────────────
const marcos=pedido_id=>db.prepare(
  'SELECT * FROM sm_pedido_marco WHERE pedido_id=? ORDER BY id').all(pedido_id);
const criarMarco=d=>db.prepare(
  'INSERT INTO sm_pedido_marco(pedido_id,marco,detalhe,usuario_nome) VALUES(@pedido_id,@marco,@detalhe,@usuario_nome)').run(d);

const prazos=pedido_id=>db.prepare(
  'SELECT * FROM sm_pedido_prazo WHERE pedido_id=? ORDER BY id DESC').all(pedido_id);
const criarPrazo=d=>db.prepare(
  'INSERT INTO sm_pedido_prazo(pedido_id,de,para,motivo,usuario_nome) VALUES(@pedido_id,@de,@para,@motivo,@usuario_nome)').run(d);

const alteracoes=pedido_id=>db.prepare(
  'SELECT * FROM sm_pedido_alteracao WHERE pedido_id=? ORDER BY id').all(pedido_id);
const criarAlteracao=d=>db.prepare(`INSERT INTO sm_pedido_alteracao
  (pedido_id,item_id,o_que,antes,depois,motivo,usuario_nome)
  VALUES(@pedido_id,@item_id,@o_que,@antes,@depois,@motivo,@usuario_nome)`).run(d);

module.exports={porId,porNumero,listar,maiorNumero,criar,atualizar,
  itens,item,proximoN,criarItem,atualizarItem,apagarItem,
  linhas,apagarLinhas,criarLinha,
  componentes,apagarComponentes,criarComponente,
  marcos,criarMarco,prazos,criarPrazo,alteracoes,criarAlteracao};

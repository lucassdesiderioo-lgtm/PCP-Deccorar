// SQL do kanban. Sem regra nenhuma aqui — quem decide em que etapa um pedido
// esta e o `dominio/kanban.js`.
//
// ⚠️ ELE SO LE. Nao ha um UPDATE neste arquivo que toque em pedido, item ou
// componente: o quadro responde "onde esta o pedido X" e nao decide nada. O
// `marco` e o `pronto_em` continuam com os donos que ja tinham (fases 3 e
// 5-B1), e a unica escrita daqui e no cadastro das colunas.
const db=require('../nucleo/db');

/* Os pedidos do quadro, com o que o cartao mostra. Uma consulta so — montar
   em N idas faria um quadro de 200 pedidos custar 600 consultas, e e a mesma
   razao do `dados/producao.js`. */
const CAMPOS=`p.id, p.numero, p.tipo, p.marco, p.pronto_em, p.sem_tecido,
  p.prazo_prometido, p.prazo_atual, p.valor_total_centavos,
  p.enviado_em, p.aprovado_em, p.cancelado_em, p.revenda_id,
  r.nome_fantasia AS revenda_nome, r.vendedor_nome`;

const pedidos=()=>db.prepare(
  'SELECT '+CAMPOS+' FROM sm_pedido p JOIN sm_revenda r ON r.id=p.revenda_id '+
  ' ORDER BY (p.prazo_atual IS NULL), p.prazo_atual, p.numero, p.id').all();

/* ⚠️ "COMECOU A PRODUZIR?" E UMA CONSULTA SO, e nao uma por pedido. Basta UM
   componente iniciado: a partir dai ha trabalho na bancada, e o pedido saiu
   de "aprovado" para "em producao". */
const comBipe=()=>new Set(db.prepare(
  'SELECT DISTINCT i.pedido_id AS id FROM sm_pedido_componente c '+
  '  JOIN sm_pedido_item i ON i.id=c.item_id '+
  ' WHERE c.iniciado_em IS NOT NULL AND i.cancelado_em IS NULL').all().map(x=>x.id));

/* A BARRINHA: por pedido e por setor, quantas pecas ha e quantas terminaram.
   ⚠️ `gera_etiqueta=1` NAO E FILTRO DE SOBRA — cada persiana tem DUAS linhas
   de setor 'embalagem' (o trabalho e o KIT que vai dentro), e o kit nao tem
   codigo, nao e bipado e nunca termina. Conta-lo deixaria a barrinha
   eternamente a uma peca do fim: foi exatamente o defeito que o teste da
   5-B1 pegou no Pronto.
   ⚠️ E a peca CANCELADA sai (secao 4.10): ela fica na lista do pedido, mas
   nao e trabalho — cobrar a barrinha por ela faria o pedido nunca fechar. */
const porSetor=()=>db.prepare(
  'SELECT i.pedido_id AS id, c.setor, COUNT(*) AS total, '+
  '       SUM(CASE WHEN c.terminado_em IS NOT NULL THEN 1 ELSE 0 END) AS feitos '+
  '  FROM sm_pedido_componente c JOIN sm_pedido_item i ON i.id=c.item_id '+
  ' WHERE c.gera_etiqueta=1 AND i.cancelado_em IS NULL '+
  ' GROUP BY i.pedido_id, c.setor').all();

// ── O cadastro das colunas ────────────────────────────────────────────────
const colunas=()=>db.prepare(
  'SELECT * FROM sm_kanban_coluna ORDER BY ordem, nome').all();
const colunaPorEtapa=etapa=>db.prepare(
  'SELECT * FROM sm_kanban_coluna WHERE etapa=? COLLATE NOCASE').get(etapa);
const colunaPorId=id=>db.prepare('SELECT * FROM sm_kanban_coluna WHERE id=?').get(id);

const criarColuna=x=>{
  const r=db.prepare('INSERT INTO sm_kanban_coluna(nome,etapa,ordem,ativo) VALUES(?,?,?,1)')
    .run(x.nome,x.etapa,x.ordem||0);
  return colunaPorId(r.lastInsertRowid);
};

const atualizarColuna=(id,dados)=>{
  const campos=[], v=[];
  if(dados.nome!==undefined){ campos.push('nome=?'); v.push(dados.nome); }
  if(dados.ordem!==undefined){ campos.push('ordem=?'); v.push(dados.ordem); }
  if(dados.ativo!==undefined){ campos.push('ativo=?'); v.push(dados.ativo?1:0); }
  /* ⚠️ A ETAPA NAO ESTA AQUI, e e de proposito: trocar a etapa de uma coluna
     move um monte de cartao de uma vez, sem nada dizendo o que aconteceu.
     Quem quiser outra etapa desativa esta e cria a outra — que e um ato
     visivel. */
  if(!campos.length) return colunaPorId(id);
  db.prepare('UPDATE sm_kanban_coluna SET '+campos.join(', ')+' WHERE id=?').run(...v,id);
  return colunaPorId(id);
};

module.exports={pedidos,comBipe,porSetor,
  colunas,colunaPorEtapa,colunaPorId,criarColuna,atualizarColuna};

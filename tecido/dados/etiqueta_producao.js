// SQL da etiqueta de producao. Sem regra nenhuma aqui — quem decide o que
// vira etiqueta, com que codigo e o que vai escrito nela e o
// dominio/etiqueta_producao.js.
//
// ⚠️ TUDO SAI DO PEDIDO APROVADO, e nada volta ao catalogo. A ficha foi
// congelada na aprovacao (secao 4.11) e a etiqueta e o que a bancada tem na
// mao: reler o catalogo aqui faria o papel e a tela discordarem, e na bancada
// vence a etiqueta.
const db=require('../nucleo/db');

// ── O cadastro de setor ───────────────────────────────────────────────────
const setores=()=>db.prepare('SELECT * FROM sm_setor WHERE ativo=1 ORDER BY ordem, nome').all();
const setor=chave=>db.prepare('SELECT * FROM sm_setor WHERE chave=? COLLATE NOCASE').get(chave);

/* ⚠️ O PROXIMO NUMERO E LIDO E GRAVADO NA MESMA INSTRUCAO. Ler e depois
   escrever deixa uma fresta entre as duas em que dois lotes aprovados ao
   mesmo tempo pegariam o mesmo numero — e o UNIQUE parcial recusaria o
   segundo com um erro que ninguem saberia ler. O RETURNING fecha a fresta. */
const proximoNumero=chave=>db.prepare(
  'UPDATE sm_setor SET ultimo_numero=ultimo_numero+1 WHERE chave=? COLLATE NOCASE '+
  'RETURNING ultimo_numero, prefixo').get(chave);

// ── Os componentes de um pedido, com tudo que a etiqueta precisa ──────────
/* A consulta junta as quatro coisas que a etiqueta mostra: o componente (o
   que fazer), o item (o que a peca e), o pedido (numero e prazo) e a revenda
   (para quem). Uma consulta so — montar em quatro idas ao banco daria a
   mesma resposta e faria a lista de 200 etiquetas custar 800 consultas. */
const CAMPOS=`c.*,
  i.n AS item_n, i.largura_mm, i.altura_mm, i.comando, i.rolamento,
  i.adicional, i.reducao, i.degrau_nome, i.cor_tecido_id, i.tecido_id,
  i.cancelado_em AS item_cancelado,
  a.nome AS colecao_nome, l.nome AS linha_nome, cor.nome AS cor_nome,
  p.id AS pedido_id, p.numero AS pedido_numero, p.marco, p.prazo_atual,
  r.nome_fantasia AS revenda_nome`;
const DE=`FROM sm_pedido_componente c
  JOIN sm_pedido_item i ON i.id=c.item_id
  JOIN sm_pedido p ON p.id=i.pedido_id
  JOIN sm_revenda r ON r.id=p.revenda_id
  LEFT JOIN abertura a ON a.id=i.abertura_id
  LEFT JOIN linha l ON l.id=a.linha_id
  LEFT JOIN cor ON cor.id=i.cor_tecido_id`;

const listaDe=n=>Array.from({length:n},()=>'?').join(',');

/* ⚠️ O FILTRO DE PECA CANCELADA E DO SQL, e nao de quem chama. Ela continua
   na lista do pedido (secao 4.10 — historia nao se apaga), mas nao vira
   etiqueta: papel impresso de peca que nao vai ser feita vira peca feita. */
const VIVOS=`p.marco='aprovado' AND p.cancelado_em IS NULL AND i.cancelado_em IS NULL`;

const componentes=(pedidos,filtroSetor)=>db.prepare(
  'SELECT '+CAMPOS+' '+DE+' WHERE '+VIVOS+
  ' AND p.id IN ('+listaDe(pedidos.length)+')'+
  (filtroSetor?' AND c.setor=?':'')+
  ' ORDER BY p.numero, i.n, c.ordem')
  .all(...pedidos, ...(filtroSetor?[filtroSetor]:[]));

// Quantas pecas VIVAS o pedido tem — o "3 de 10" da etiqueta.
const pecasDoPedido=pedidos=>db.prepare(
  'SELECT i.pedido_id, COUNT(*) AS total FROM sm_pedido_item i '+
  'WHERE i.cancelado_em IS NULL AND i.pedido_id IN ('+listaDe(pedidos.length)+') '+
  'GROUP BY i.pedido_id').all(...pedidos);

/* A lista da tela: pedido aprovado, com quantas etiquetas cada setor tem e
   quantas ja sairam. E a contagem de impressas que faz a tela avisar — sem
   ela, imprimir o lote duas vezes e o jeito mais facil de ter duas etiquetas
   iguais em duas pecas (secao 4.14). */
const aImprimir=()=>db.prepare(
  'SELECT p.id AS pedido_id, p.numero AS pedido_numero, p.prazo_atual, p.sem_tecido, '+
  '       r.nome_fantasia AS revenda_nome, c.setor, '+
  '       COUNT(*) AS total, SUM(CASE WHEN c.impresso_em IS NOT NULL THEN 1 ELSE 0 END) AS impressas '+
  DE+
  ' WHERE '+VIVOS+" AND c.codigo_etiqueta IS NOT NULL"+
  ' GROUP BY p.id, c.setor ORDER BY p.numero, c.setor').all();

const semCodigo=()=>db.prepare(
  'SELECT c.id, c.setor '+DE+' WHERE '+VIVOS+
  ' AND c.gera_etiqueta=1 AND c.codigo_etiqueta IS NULL ORDER BY c.item_id, c.ordem').all();

const gravarCodigo=(id,codigo)=>db.prepare(
  'UPDATE sm_pedido_componente SET codigo_etiqueta=? WHERE id=?').run(codigo,id);

const marcarImpresso=(ids,quando,quem)=>db.prepare(
  'UPDATE sm_pedido_componente SET impresso_em=?, impresso_por=?, '+
  'reimpressoes=reimpressoes+(CASE WHEN impresso_em IS NULL THEN 0 ELSE 1 END) '+
  'WHERE id IN ('+listaDe(ids.length)+')').run(quando,quem,...ids);

const registrar=d=>db.prepare(
  'INSERT INTO sm_etiqueta_impressao(setor,quantidade,pedidos,reimpressao,usuario_nome) '+
  'VALUES(@setor,@quantidade,@pedidos,@reimpressao,@usuario_nome)').run(d);

const impressoes=limite=>db.prepare(
  'SELECT * FROM sm_etiqueta_impressao ORDER BY id DESC LIMIT ?').all(limite||30);

module.exports={setores,setor,proximoNumero,componentes,pecasDoPedido,
  aImprimir,semCodigo,gravarCodigo,marcarImpresso,registrar,impressoes};

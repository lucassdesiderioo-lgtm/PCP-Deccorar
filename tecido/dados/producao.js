// SQL da producao bipada. Sem regra nenhuma aqui — quem decide o que esta
// liberado, o que segura e quem pode bipar e o dominio/producao.js.
//
// ⚠️ O "VIVOS" E O MESMO DO dados/etiqueta_producao.js, e de proposito: a
// fila da bancada e o maco de etiquetas tem que falar da MESMA peca. Duas
// reguas de "isto ainda vale?" fariam a bancada bipar um codigo que a
// impressao ja nao considera, e o inverso. Ele e importado, nao copiado.
const db=require('../nucleo/db');

/* A peca cancelada continua na lista do pedido (secao 4.10 — historia nao se
   apaga) e sai de tudo que e trabalho: nao vira etiqueta, nao entra em fila
   e nao segura o pronto do pedido. */
const VIVOS=`p.marco='aprovado' AND p.cancelado_em IS NULL AND i.cancelado_em IS NULL`;

/* A consulta junta o que a bancada precisa ver: o componente (o que fazer), o
   item (o que a peca e) e o pedido (numero e prazo). Uma consulta so — a
   mesma razao do etiqueta_producao: montar em tres idas faria a fila de 200
   pecas custar 600 consultas. */
const CAMPOS=`c.*,
  i.n AS item_n, i.largura_mm, i.altura_mm, i.comando, i.rolamento,
  i.adicional, i.reducao, i.degrau_nome, i.cor_tecido_id,
  i.cancelado_em AS item_cancelado_em,
  a.nome AS colecao_nome, l.nome AS linha_nome, cor.nome AS cor_nome,
  p.id AS pedido_id, p.numero AS pedido_numero, p.prazo_atual, p.pronto_em,
  r.nome_fantasia AS revenda_nome`;
const DE=`FROM sm_pedido_componente c
  JOIN sm_pedido_item i ON i.id=c.item_id
  JOIN sm_pedido p ON p.id=i.pedido_id
  JOIN sm_revenda r ON r.id=p.revenda_id
  LEFT JOIN abertura a ON a.id=i.abertura_id
  LEFT JOIN linha l ON l.id=a.linha_id
  LEFT JOIN cor ON cor.id=i.cor_tecido_id`;

const porCodigo=codigo=>db.prepare(
  'SELECT '+CAMPOS+' '+DE+' WHERE c.codigo_etiqueta=? COLLATE NOCASE').get(codigo);

/* ⚠️ A ORDEM E A DO PRAZO, e nao a da aprovacao. Quem esta na bancada
   trabalha de cima para baixo; ordenar pela entrada faria o pedido que vence
   amanha esperar o que vence em dezembro. Vencido primeiro, e por isso o
   prazo nulo vai para o fim (o pedido sem prazo lido nao e urgente, so e
   desconhecido). */
const doSetor=setor=>db.prepare(
  'SELECT '+CAMPOS+' '+DE+' WHERE '+VIVOS+
  ' AND c.setor=? AND c.codigo_etiqueta IS NOT NULL AND c.terminado_em IS NULL'+
  ' ORDER BY (p.prazo_atual IS NULL), p.prazo_atual, p.numero, i.n, c.ordem').all(setor);

// Os componentes irmaos: a mesma persiana, que e onde a liberacao se decide.
const doItem=item_id=>db.prepare(
  'SELECT * FROM sm_pedido_componente WHERE item_id=? ORDER BY ordem').all(item_id);

const marcar=(id,campos)=>{
  const cols=Object.keys(campos);
  db.prepare('UPDATE sm_pedido_componente SET '+cols.map(c=>c+'=?').join(', ')+' WHERE id=?')
    .run(...cols.map(c=>campos[c]), id);
};

/* As pecas VIVAS de um pedido que ainda nao foram embaladas. Zero = pronto.
   A contagem e do SQL e nao de quem chama, pela mesma razao do VIVOS: quem
   soma por fora esquece a peca cancelada e o pedido nunca fecha.

   ⚠️ `gera_etiqueta=1` NAO E FILTRO DE SOBRA: cada persiana tem DUAS linhas
   de setor 'embalagem' — o trabalho de embalar e o KIT que vai dentro. O kit
   nao tem codigo, nao e bipado e nunca termina, entao conta-lo aqui deixaria
   o pedido eternamente a uma peca do pronto. Foi assim que os tres casos do
   pronto reprovaram na primeira rodada. */
const faltamEmbalar=pedido_id=>db.prepare(
  'SELECT COUNT(*) AS n '+DE+' WHERE '+VIVOS+
  " AND p.id=? AND c.setor='embalagem' AND c.gera_etiqueta=1 AND c.terminado_em IS NULL")
  .get(pedido_id).n;

const marcarPronto=(pedido_id,quando)=>db.prepare(
  'UPDATE sm_pedido SET pronto_em=? WHERE id=? AND pronto_em IS NULL').run(quando,pedido_id);

const criarPendencia=x=>db.prepare(
  'INSERT INTO sm_pendencia(componente_id,codigo_etiqueta,motivo,usuario_nome) VALUES(?,?,?,?)')
  .run(x.componente_id,x.codigo_etiqueta,x.motivo,x.usuario_nome);

/* ── A RECUSA (fase 5-B2, secao 4.16) ─────────────────────────────────────
   REABRIR e apagar o bipe: a peca volta para a fila do setor dela e sera
   bipada de novo, por quem a refizer. O `kit_conferido_em` vai junto — senao
   a proxima embalagem daquela persiana fecharia a caixa sem o terceiro bipe,
   e a trava do kit deixaria de existir justamente na peca que ja deu
   problema uma vez. */
const listaDe=n=>Array.from({length:n},()=>'?').join(',');

const reabrir=ids=>{
  if(!ids.length) return 0;
  return db.prepare(
    'UPDATE sm_pedido_componente SET iniciado_em=NULL, iniciado_por=NULL, '+
    'terminado_em=NULL, terminado_por=NULL, kit_conferido_em=NULL '+
    'WHERE id IN ('+listaDe(ids.length)+')').run(...ids).changes;
};

/* ⚠️ `refeitas` SOBE SO NO CULPADO. Ele responde "quantas vezes esta peca
   FISICA foi feita" — o tubo que foi para o lixo e o que sera cortado de
   novo. O que volta atras dele e trabalho refeito, nao peca refeita. */
const contarRefeita=id=>db.prepare(
  'UPDATE sm_pedido_componente SET refeitas=refeitas+1 WHERE id=?').run(id);

/* O pedido que ja estava pronto deixa de estar: ha peca voltando para a
   bancada. O `marco` NAO se mexe (a razao esta na migracao 21), e a linha
   'pronto' do historico fica — ela diz que o pedido ESTEVE pronto, o que e
   verdade e e o que alguem vai querer saber depois. */
const desfazerPronto=pedido_id=>db.prepare(
  'UPDATE sm_pedido SET pronto_em=NULL WHERE id=?').run(pedido_id);

const criarRecusa=x=>db.prepare(
  'INSERT INTO sm_recusa(item_id,componente_id,codigo_etiqueta,motivo_id,motivo_nome,'+
  'observacao,recusado_de,recusado_codigo,recusado_por,feito_por,feito_em,reabertos) '+
  'VALUES(@item_id,@componente_id,@codigo_etiqueta,@motivo_id,@motivo_nome,'+
  '@observacao,@recusado_de,@recusado_codigo,@recusado_por,@feito_por,@feito_em,@reabertos)')
  .run(x);

/* O CARD REFAZER: as pecas que voltaram e ainda nao foram refeitas, com o
   motivo da ULTIMA recusa de cada uma. Ela e a lista de quem esta na Zebra —
   e por codigo, nunca pelo maco do pedido, porque reimprimir o maco inteiro
   para refazer uma peca poe etiquetas repetidas na bancada, que e o que a
   fase 4-A existe para impedir. */
const aRefazer=()=>db.prepare(
  'SELECT '+CAMPOS+', ('+
  '  SELECT r.motivo_nome FROM sm_recusa r WHERE r.componente_id=c.id '+
  '   ORDER BY r.id DESC LIMIT 1) AS motivo, ('+
  '  SELECT r.recusado_por FROM sm_recusa r WHERE r.componente_id=c.id '+
  '   ORDER BY r.id DESC LIMIT 1) AS recusado_por '+
  DE+' WHERE '+VIVOS+
  ' AND c.refeitas>0 AND c.terminado_em IS NULL AND c.codigo_etiqueta IS NOT NULL'+
  ' ORDER BY (p.prazo_atual IS NULL), p.prazo_atual, p.numero, i.n, c.ordem').all();

module.exports={porCodigo,doSetor,doItem,marcar,faltamEmbalar,marcarPronto,criarPendencia,
  reabrir,contarRefeita,desfazerPronto,criarRecusa,aRefazer};

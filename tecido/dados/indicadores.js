// SQL dos indicadores (secao 4.17, fase 6-B). Sem regra nenhuma aqui: quem
// decide se um tempo presta, o que e peca completa e como se tira a mediana e
// o `dominio/indicadores.js`.
//
// ⚠️ ELE SO LE. Nao ha um UPDATE neste arquivo. Indicador que escreve deixa
// de ser indicador e vira dono — e os donos do bipe, do prazo e da recusa ja
// existem (fases 3, 5-B1 e 5-B2).
//
// ⚠️ UMA CONSULTA ALIMENTA OS TRES INDICADORES DE TEMPO. Horas-homem, tempo
// por m² e produtividade sao TRES perguntas sobre A MESMA lista de bipes;
// tres consultas com tres filtros seriam tres reguas para "este tempo
// presta?", e elas divergiriam no dia em que alguem mexesse numa so — a
// armadilha #12 dentro de um numero. A classificacao mora no dominio,
// aplicada uma vez sobre esta lista.
const db=require('../nucleo/db');

/* CADA BIPE FECHADO, com tudo que os tres indicadores precisam pendurado.
   `horas` sai do banco e nao de aritmetica de Date em JS: julianday e a
   mesma conta que o resto do modulo usa (dias parados, encalhe, giro).

   ⚠️ `gera_etiqueta=1` NAO E FILTRO DE SOBRA — cada persiana tem DUAS linhas
   de setor 'embalagem' (o trabalho e o KIT que vai dentro), e o kit nao tem
   codigo, nao e bipado e nunca termina. Conta-lo deixaria toda peca
   eternamente a um bipe do fim, que foi o defeito que o teste da 5-B1 pegou
   no Pronto.
   ⚠️ E a peca CANCELADA sai (secao 4.10): ela fica na lista do pedido, mas
   nao e trabalho. */
const BIPE=fim=>`
  SELECT c.id, c.codigo_etiqueta AS codigo, c.chave, c.nome, c.setor,
         c.iniciado_em, c.iniciado_por, c.terminado_em, c.terminado_por,
         (julianday(${fim})-julianday(c.iniciado_em))*24.0 AS horas,
         i.id AS item_id, i.n AS item_n, i.m2_real_mm2,
         p.id AS pedido_id, p.numero AS pedido_numero
    FROM sm_pedido_componente c
    JOIN sm_pedido_item i ON i.id=c.item_id
    JOIN sm_pedido p ON p.id=i.pedido_id
   WHERE c.gera_etiqueta=1 AND i.cancelado_em IS NULL`;

/* O `desde` filtra pelo FIM do bipe, e nao pelo comeco: e quando o trabalho
   ficou pronto que ele entra na conta do periodo. Sem `desde`, tudo. */
const FECHADO=BIPE('c.terminado_em');
const bipes=desde=>desde
  ? db.prepare(FECHADO+' AND c.terminado_em IS NOT NULL AND c.terminado_em>=? ORDER BY c.terminado_em').all(desde)
  : db.prepare(FECHADO+' AND c.terminado_em IS NOT NULL ORDER BY c.terminado_em').all();

/* OS ABERTOS. Nao levam `desde`: um bipe esquecido em aberto ha tres semanas
   e justamente o que nao pode sumir por causa do filtro de periodo — ele e
   pendencia hoje, e alguem tem que ir corrigir hoje. */
const abertos=()=>db.prepare(
  BIPE("datetime('now','localtime')")+
  ' AND c.iniciado_em IS NOT NULL AND c.terminado_em IS NULL ORDER BY c.iniciado_em').all();

/* Quantas etiquetas cada persiana tem. E o divisor de "a peca esta completa?"
   — sem ele, uma persiana com um unico bipe pareceria pronta. */
const etiquetasPorItem=()=>db.prepare(
  'SELECT i.id AS item_id, COUNT(*) AS etiquetas '+
  '  FROM sm_pedido_componente c JOIN sm_pedido_item i ON i.id=c.item_id '+
  ' WHERE c.gera_etiqueta=1 AND i.cancelado_em IS NULL GROUP BY i.id').all();

// Existe ALGUM bipe, em qualquer data? E a diferenca entre "ninguem bipou
// ainda" e "o periodo escolhido nao teve bipe" — dois conselhos opostos.
const algumBipe=()=>!!db.prepare(
  'SELECT 1 v FROM sm_pedido_componente WHERE terminado_em IS NOT NULL LIMIT 1').get();

/* ── APROVACAO ────────────────────────────────────────────────────────────
   Um pedido por linha, com as duas pontas. A conta da mediana e do maior e
   do dominio: SQL nao tem mediana, e emula-la com LIMIT/OFFSET esconderia a
   regra dentro de uma string. */
const aprovacoes=desde=>db.prepare(
  'SELECT p.id, p.numero, r.vendedor_nome, r.nome_fantasia AS revenda_nome, '+
  '       p.enviado_em, p.aprovado_em, '+
  '       (julianday(p.aprovado_em)-julianday(p.enviado_em))*24.0 AS horas '+
  '  FROM sm_pedido p JOIN sm_revenda r ON r.id=p.revenda_id '+
  ' WHERE p.enviado_em IS NOT NULL AND p.aprovado_em IS NOT NULL '+
  (desde?' AND p.aprovado_em>=? ':' ')+
  ' ORDER BY p.aprovado_em').all(...(desde?[desde]:[]));

const algumaAprovacao=()=>!!db.prepare(
  'SELECT 1 v FROM sm_pedido WHERE aprovado_em IS NOT NULL LIMIT 1').get();

// O QUE ESPERA APROVACAO. Sem `desde`: pedido parado ha dois meses e
// justamente o que nao pode sumir do filtro.
const parados=()=>db.prepare(
  'SELECT p.id, p.numero, p.enviado_em, p.prazo_prometido, p.prazo_atual, '+
  '       p.valor_total_centavos, r.nome_fantasia AS revenda_nome, r.vendedor_nome, '+
  "       (julianday('now','localtime')-julianday(p.enviado_em))*24.0 AS horas_parado "+
  '  FROM sm_pedido p JOIN sm_revenda r ON r.id=p.revenda_id '+
  " WHERE p.marco='enviado' ORDER BY p.enviado_em").all();

/* ── PRAZO CUMPRIDO ───────────────────────────────────────────────────────
   As duas datas vem cruas, e a comparacao e do dominio. `pronto_em` e
   'AAAA-MM-DD hh:mm:ss' e o prazo e 'AAAA-MM-DD': quem corta os dez
   primeiros caracteres e o dominio, num lugar so. */
const prontos=desde=>db.prepare(
  'SELECT p.id, p.numero, p.pronto_em, p.prazo_prometido, p.prazo_atual, '+
  '       r.nome_fantasia AS revenda_nome, r.vendedor_nome '+
  '  FROM sm_pedido p JOIN sm_revenda r ON r.id=p.revenda_id '+
  ' WHERE p.pronto_em IS NOT NULL '+
  (desde?' AND p.pronto_em>=? ':' ')+
  ' ORDER BY p.pronto_em').all(...(desde?[desde]:[]));

const algumPronto=()=>!!db.prepare(
  'SELECT 1 v FROM sm_pedido WHERE pronto_em IS NOT NULL LIMIT 1').get();

/* ── RECUSAS ──────────────────────────────────────────────────────────────
   ⚠️ O SETOR VEM DO COMPONENTE CULPADO, e nao de `recusado_de`. A pergunta e
   DE ONDE VEM o defeito; `recusado_de` e a bancada que o ACHOU, e contar nela
   acusaria justamente quem fez o trabalho de pegar o erro. Os dois campos
   sobem, porque a tela mostra o par. */
const recusas=desde=>db.prepare(
  'SELECT r.id, r.codigo_etiqueta, r.motivo_nome, r.feito_por, r.recusado_por, '+
  '       r.recusado_de, r.criado_em, c.setor, c.nome AS peca_nome, '+
  '       p.numero AS pedido_numero '+
  '  FROM sm_recusa r '+
  '  JOIN sm_pedido_componente c ON c.id=r.componente_id '+
  '  JOIN sm_pedido_item i ON i.id=r.item_id '+
  '  JOIN sm_pedido p ON p.id=i.pedido_id '+
  (desde?' WHERE r.criado_em>=? ':' ')+
  ' ORDER BY r.criado_em DESC').all(...(desde?[desde]:[]));

const algumaRecusa=()=>!!db.prepare('SELECT 1 v FROM sm_recusa LIMIT 1').get();

module.exports={bipes,abertos,etiquetasPorItem,algumBipe,
  aprovacoes,algumaAprovacao,parados,
  prontos,algumPronto,recusas,algumaRecusa};

// Tabela 'sm_motivo_producao' — por que uma bancada devolveu a peca para o
// setor de tras (secao 4.16 da spec SOBMEDIDA-PEDIDO-REVENDA).
//
// ⚠️ NAO E A `motivo_recusa`. Aquela e do plano de corte: por que o cortador
// nao usou a sobra que o sistema sugeriu. Juntar as duas misturaria "o plano
// nao conseguiu cortar" com "a montagem achou o tubo maior", e os relatorios
// das duas ficariam errados.
const db=require('../nucleo/db');
const lista=require('./_lista')({tabela:'sm_motivo_producao', extras:['componente_chave']});

/* O motivo aponta o COMPONENTE; o setor sai dele. Uma consulta so, com o
   JOIN — a tela precisa do nome da peca e do NOME do setor (nunca a chave:
   chave de banco em tela e o "— Correcao de contagem" do §2 do CLAUDE.md). */
const COM_DESTINO=
  'SELECT m.*, k.nome AS componente_nome, k.setor, k.gera_etiqueta, '+
  '       s.nome AS setor_nome, s.ordem AS setor_ordem '+
  '  FROM sm_motivo_producao m '+
  '  JOIN sm_componente k ON k.chave=m.componente_chave COLLATE NOCASE '+
  '  LEFT JOIN sm_setor s ON s.chave=k.setor COLLATE NOCASE ';

const comDestino=()=>db.prepare(COM_DESTINO+
  'ORDER BY s.ordem, m.ordem, m.nome').all();
const ativosComDestino=()=>db.prepare(COM_DESTINO+
  'WHERE m.ativo=1 ORDER BY s.ordem, m.ordem, m.nome').all();
const porIdComDestino=id=>db.prepare(COM_DESTINO+'WHERE m.id=?').get(id);

const componente=chave=>db.prepare(
  'SELECT * FROM sm_componente WHERE chave=? COLLATE NOCASE').get(chave);

/* As pecas que PODEM ser motivo: as que geram etiqueta, e so elas. A reducao
   de peso e os kits nao tem codigo e nunca foram bipados por ninguem — nao
   ha trabalho para reabrir. Ela sai por esta mesma porta para a tela de
   cadastro nao precisar de uma segunda chave so para montar a lista. */
const possiveis=()=>db.prepare(
  'SELECT k.chave, k.nome, k.setor, s.nome AS setor_nome '+
  '  FROM sm_componente k LEFT JOIN sm_setor s ON s.chave=k.setor COLLATE NOCASE '+
  ' WHERE k.gera_etiqueta=1 AND k.ativo=1 ORDER BY s.ordem, k.ordem').all();

module.exports=Object.assign({},lista,
  {comDestino,ativosComDestino,porIdComDestino,componente,possiveis});

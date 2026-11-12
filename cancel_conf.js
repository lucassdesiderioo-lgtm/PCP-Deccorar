/* A VENDA CANCELADA NA CONFERENCIA — spec CONFERENCIA-EXPEDICAO, fase 4 (03/11/2026).
 *
 * Decisao do dono: a venda cancelada passa por DUAS pessoas. O operador
 * marca, na Conferencia, com a caixa na mao (bipe da etiqueta e do SKU de cada
 * persiana); quem tem `cancelamento.confirmar` confere no Mercado Livre e
 * confirma — ou recusa, e a caixa volta para a lista de saida.
 *
 *   marcar     a caixa sai das listas e fica SEPARADA. O estoque NAO mexe.
 *   confirmar  a caixa fica decidida, e o saldo volta +1 POR PECA — se ela ja
 *              tinha baixado (baixa_dominio.devolver, dono unico). Sob medida
 *              nao volta: nunca teve saldo (§7).
 *   recusar    a caixa volta para onde estava; nada no saldo.
 *
 * ⚠️ POR QUE DUAS PESSOAS: confirmar devolve peca ao estoque sem venda na
 * frente — a mesma natureza do `estoque.editar` e do `pacote.assinar`, que ja
 * sao sensiveis. Com um clique so, um engano do operador, ou uma venda que so
 * PARECIA cancelada, ficaria invisivel no saldo.
 *
 * ⚠️ QUEM MARCOU NAO CONFIRMA NEM RECUSA, nem o Admin Geral (a regra do
 * R-EST-18: ninguem aprova o proprio trabalho). E quem CONFERIU a caixa nao a
 * marca (D8, na rota).
 *
 * ⚠️ "+1 POR PECA" SO SE A CAIXA JA BAIXOU. A spec diz "cada persiana volta ao
 * estoque"; o CLAUDE.md §2 manda: a caixa impressa e nao conferida nunca saiu
 * do saldo (so estava reservada), e devolver a ela seria saldo a mais. Onde os
 * dois divergem vale o CLAUDE.md.
 *
 * A tabela e a historia: um pedido por marcacao, com o volume como estava
 * (`antes`, JSON), as pecas, quem marcou, quem decidiu e o que moveu no saldo
 * — o mesmo desenho do `ajuste_estoque` (§18). Nenhuma funcao abre transacao.
 */
const CANC = require('./cancelada_dominio');
const BAIXA = require('./baixa_dominio');

function garantir(db){
  db.exec(`CREATE TABLE IF NOT EXISTS cancelamento_caixa (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    lote_id INTEGER NOT NULL,
    buyer TEXT, nf TEXT,
    motivo TEXT,
    pecas TEXT DEFAULT '[]',
    antes TEXT,
    marcado_em TEXT DEFAULT (datetime('now','localtime')),
    marcado_por TEXT DEFAULT '',
    marcado_por_id INTEGER,
    situacao TEXT NOT NULL DEFAULT 'aguardando',
    decidido_em TEXT,
    decidido_por TEXT,
    decidido_por_id INTEGER,
    decisao_motivo TEXT,
    estoque TEXT DEFAULT '[]',
    teste INTEGER DEFAULT 0)`);
}
const nomeDe = q => String((q && q.nome) || '').trim();
const idDe = q => (q && q.id != null ? +q.id : null);
const norm = s => String(s || '').normalize('NFD').replace(/[̀-ͯ]/g, '').trim().toLowerCase();
/* A mesma pessoa: pelo id quando os dois tem; senao pelo nome. Vazio nunca e
   igual a vazio (a regra do D8). */
function mesma(a_id, a_nome, quem){
  if(a_id != null && idDe(quem) != null) return +a_id === idDe(quem);
  return !!norm(a_nome) && norm(a_nome) === norm(nomeDe(quem));
}

function aberto(db, loteId){
  garantir(db);
  return db.prepare("SELECT * FROM cancelamento_caixa WHERE lote_id=? AND situacao='aguardando' ORDER BY id DESC").get(+loteId) || null;
}

/* O operador marcou. `v` e o volume; `pecas` as do CANC.pecasDaCaixa. */
function marcar(db, v, o){
  garantir(db);
  if(aberto(db, v.id)) return { ok:false, motivo:'ja_marcada',
    aviso:'Esta caixa já está separada como venda cancelada, esperando a confirmação.' };
  const r = CANC.separar(db, v.id, { motivo:o.motivo, quem:o.quem });
  if(!r.ok) return r;
  const id = db.prepare(`INSERT INTO cancelamento_caixa (lote_id, buyer, nf, motivo, pecas, antes, marcado_por, marcado_por_id, teste)
      VALUES (?,?,?,?,?,?,?,?,?)`)
    .run(v.id, v.buyer || null, v.nf || null, String(o.motivo || '').slice(0, 200), JSON.stringify(o.pecas || []),
         JSON.stringify(r.antes), nomeDe(o.quem), idDe(o.quem), BAIXA.emTeste(db) ? 1 : 0).lastInsertRowid;
  return { ok:true, pedido:id, lugar:r.lugar };
}

function pegar(db, id){
  garantir(db);
  return db.prepare('SELECT * FROM cancelamento_caixa WHERE id=?').get(+id) || null;
}
function recusaComum(db, p, quem){
  if(!p) return { ok:false, motivo:'nao_encontrado', aviso:'Pedido de cancelamento não encontrado.' };
  if(p.situacao !== 'aguardando') return { ok:false, motivo:'ja_decidido',
    aviso:'Este cancelamento já foi ' + (p.situacao === 'confirmada' ? 'confirmado' : 'recusado') +
      (p.decidido_por ? ' por ' + p.decidido_por : '') + '.' };
  if(!nomeDe(quem) && idDe(quem) == null) return { ok:false, motivo:'sem_login', aviso:'Entre com o seu login.' };
  if(mesma(p.marcado_por_id, p.marcado_por, quem)) return { ok:false, motivo:'mesma_pessoa',
    aviso:'Você marcou esta caixa como cancelada. A confirmação é de outra pessoa.' };
  return null;
}

/* A confirmacao. Devolve { ok, estoque:[{codigo,delta}] }. */
function confirmar(db, id, quem){
  const p = pegar(db, id);
  const nao = recusaComum(db, p, quem);
  if(nao) return nao;
  const v = db.prepare('SELECT * FROM lote WHERE id=?').get(p.lote_id);
  if(!v || v.estagio !== CANC.ESTAGIO) return { ok:false, motivo:'fora_do_lugar',
    aviso:'A caixa não está mais separada como cancelada. Recuse o pedido.' };
  if(v.cancelada_resolvida_em) return { ok:false, motivo:'ja_decidida',
    aviso:'Esta caixa já foi resolvida' + (v.cancelada_resolvida_por ? ' por ' + v.cancelada_resolvida_por : '') + '.' };
  const trava = BAIXA.travaTeste(db, v);
  if(trava) return trava;
  CANC.resolver(db, v.id, nomeDe(quem));
  const moveu = BAIXA.devolver(db, v, quem);
  db.prepare(`UPDATE cancelamento_caixa SET situacao='confirmada', decidido_em=datetime('now','localtime'),
      decidido_por=?, decidido_por_id=?, estoque=? WHERE id=?`).run(nomeDe(quem), idDe(quem), JSON.stringify(moveu), p.id);
  return { ok:true, estoque:moveu, lote:v.id, sob_medida: !moveu.length && JSON.parse(p.pecas || '[]').every(x => x.sob_medida) };
}

/* A recusa: com motivo, e a caixa volta para a lista de saida (R7). */
function recusar(db, id, quem, motivo){
  const p = pegar(db, id);
  const nao = recusaComum(db, p, quem);
  if(nao) return nao;
  const m = String(motivo || '').trim().slice(0, 300);
  if(!m) return { ok:false, motivo:'sem_motivo', aviso:'Escreva por que o cancelamento foi recusado.' };
  let antes = null; try{ antes = JSON.parse(p.antes || 'null'); }catch(e){}
  const volta = CANC.desfazer(db, p.lote_id, antes);
  db.prepare(`UPDATE cancelamento_caixa SET situacao='recusada', decidido_em=datetime('now','localtime'),
      decidido_por=?, decidido_por_id=?, decisao_motivo=? WHERE id=?`).run(nomeDe(quem), idDe(quem), m, p.id);
  return { ok:true, volta, lote:p.lote_id };
}

/* Os pedidos esperando confirmacao, mais antigo primeiro. */
function aguardando(db){
  garantir(db);
  return db.prepare(`SELECT c.id, c.lote_id, c.buyer, c.nf, c.motivo, c.pecas, c.marcado_em, c.marcado_por, c.teste,
      l.modalidade, l.codigo, l.baixado_em
    FROM cancelamento_caixa c LEFT JOIN lote l ON l.id=c.lote_id
    WHERE c.situacao='aguardando' ORDER BY c.marcado_em, c.id`).all()
    .map(x => { let pc = []; try{ pc = JSON.parse(x.pecas || '[]'); }catch(e){}
      return Object.assign(x, { pecas:pc, baixou: !!x.baixado_em }); });
}

/* Esta pessoa pode decidir (confirmar ou recusar) este pedido? A mesma régua
   das duas rotas — quem marcou não decide (R-REC-06). A etiqueta do ☰ Menu
   pergunta aqui, para não ter uma segunda régua (#12). */
function podeDecidir(db, p, quem){ return !recusaComum(db, p, quem); }

module.exports = { garantir, marcar, confirmar, recusar, aguardando, aberto, pegar, podeDecidir };

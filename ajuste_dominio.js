/* O AJUSTE MANUAL DE ESTOQUE EM DUAS PESSOAS — fase 3 da spec
 * ESTOQUE-LIVRO-E-CONFERENCIA (28/09/2026). Dono unico do pedido de ajuste.
 *
 *   PEDIR (estoque.ajustar) ─▶ o saldo NAO anda
 *   APROVAR (estoque.aprovar_ajuste, outra pessoa) ─▶ movimento `ajuste` no livro
 *   RECUSAR (com resposta) ─▶ o pedido fica, recusado
 *   DESISTIR (quem pediu) ─▶ o pedido fica, desistido
 *
 * ⚠️ O PEDIDO E EM DELTA, E NUNCA EM "SALDO NOVO" (decisao do dono,
 * 28/09/2026). Um pedido de "o saldo e 8" aprovado dois dias depois apagaria o
 * que a bancada embalou no meio — a armadilha #32 pela porta do ajuste. Quem
 * pede pode digitar o saldo novo; ele vira delta contra o saldo DAQUELE
 * momento, e os dois numeros ficam guardados.
 *
 * ⚠️ OS PEDIDOS MORAM EM `ajuste_pedido`, E NAO EM `ajuste_estoque` (decisao do
 * dono, 28/09/2026 — divergencia da §7 da spec). Cinco lugares leem o
 * `ajuste_estoque` como "o que foi aplicado": o historico da linha, o ultimo
 * ajuste, o card da aba Estoque, o numero da faixa e o comparar_inventario. Um
 * pedido pendente ali apareceria como ajuste feito, sem erro nenhum. A
 * aprovacao grava la, como sempre foi.
 *
 * ⚠️ NINGUEM APROVA O PROPRIO PEDIDO, E ISSO VALE PARA O ADMIN GERAL
 * (`outraPessoa`, a mesma da conferencia). O aprovador unico ESPERA — a mesma
 * decisao A do §6.4.
 *
 * ⚠️ NENHUMA FUNCAO DAQUI ABRE TRANSACAO: a rota embrulha cada passo.
 */
const ESTOQUE = require('./estoque_dominio');

function garantirSchema(db){
  db.exec(`CREATE TABLE IF NOT EXISTS ajuste_pedido (
    id              INTEGER PRIMARY KEY AUTOINCREMENT,
    codigo          TEXT,
    delta           INTEGER,
    saldo_no_pedido INTEGER,
    motivo          TEXT,
    obs             TEXT,
    pedido_por      TEXT,
    pedido_por_id   INTEGER,
    pedido_em       TEXT DEFAULT (datetime('now','localtime')),
    status          TEXT DEFAULT 'pendente',
    decidido_por    TEXT,
    decidido_por_id INTEGER,
    decidido_em     TEXT,
    resposta        TEXT,
    movimento_id    INTEGER,
    ajuste_id       INTEGER,
    teste           INTEGER DEFAULT 0
  );`);
  db.exec('CREATE INDEX IF NOT EXISTS ix_ajuste_pedido_status ON ajuste_pedido(status, codigo)');
}

function erro(status, mensagem, extra){
  const e = new Error(mensagem); e.status = status; e.extra = extra || null; return e;
}
function quemPediu(p){ return [{ id:p.pedido_por_id, nome:p.pedido_por }]; }

/* Motivo e obrigatorio, e "Outro" exige a observacao — a mesma regra da
   conferencia. Motivo sem porque e o numero que mudou e ninguem sabe por que. */
function exigeMotivo(motivo, obs){
  const m = String(motivo || '').trim();
  if(!m) throw erro(400, 'escolha o motivo');
  if(/^outro/i.test(m) && !String(obs || '').trim()) throw erro(400, 'o motivo "Outro" exige a observação');
  return m;
}

function pedir(db, { codigo, delta, estoque, motivo, obs, quem }){
  const cod = String(codigo || '').trim().toUpperCase();
  if(!cod) throw erro(400, 'sem código');
  if(!quem || (!quem.id && !quem.nome)) throw erro(401, 'sem pessoa logada');
  const m = exigeMotivo(motivo, obs);
  const agora = ESTOQUE.saldo(db, cod);
  if(agora === null) throw erro(404, 'SKU não cadastrado: ' + cod);

  let d;
  if(delta !== undefined && delta !== null && delta !== ''){
    d = Number(delta);
  } else if(estoque !== undefined && estoque !== null && estoque !== ''){
    const alvo = Number(estoque);
    if(!Number.isInteger(alvo)) throw erro(400, 'saldo novo inválido: peça é número inteiro');
    d = alvo - agora;
  } else throw erro(400, 'diga quantas peças a mais ou a menos, ou o saldo novo');
  if(!Number.isInteger(d)) throw erro(400, 'quantidade inválida: peça é número inteiro');
  if(d === 0) throw erro(400, 'não há o que ajustar: o saldo já é ' + agora);

  /* Um pendente por SKU. Dois pedidos abertos do mesmo SKU, aprovados em
     sequencia, aplicariam a mesma correcao duas vezes — e cada um parece certo
     sozinho. */
  const aberto = db.prepare("SELECT id, pedido_por FROM ajuste_pedido WHERE codigo=? AND status='pendente'").get(cod);
  if(aberto) throw erro(409, 'já há um pedido de ajuste de ' + cod + ' esperando aprovação (feito por ' +
    (aberto.pedido_por || 'alguém') + '): decida aquele antes', { motivo:'ja_pendente', pedido_id:aberto.id });

  const id = db.prepare(`INSERT INTO ajuste_pedido (codigo,delta,saldo_no_pedido,motivo,obs,pedido_por,pedido_por_id)
    VALUES (?,?,?,?,?,?,?)`).run(cod, d, agora, m, String(obs || '').trim() || null,
      quem.nome || '', quem.id != null ? quem.id : null).lastInsertRowid;
  return { id, codigo:cod, delta:d, saldo_no_pedido:agora };
}

function pendentes(db, { quem }){
  const linhas = db.prepare("SELECT * FROM ajuste_pedido WHERE status='pendente' ORDER BY pedido_em, id").all();
  return linhas.map(p => {
    const pode = ESTOQUE.outraPessoa(quem, quemPediu(p));
    const agora = ESTOQUE.saldo(db, p.codigo);
    let extrato = [];
    try{ extrato = ESTOQUE.extrato(db, p.codigo, { desde:p.pedido_em, limite:50 }); }catch(e){}
    return {
      id:p.id, codigo:p.codigo, delta:p.delta, motivo:p.motivo, obs:p.obs,
      pedido_por:p.pedido_por, pedido_em:p.pedido_em, saldo_no_pedido:p.saldo_no_pedido,
      saldo_agora:agora, saldo_depois:(agora || 0) + p.delta, extrato,
      pode_aprovar:pode,
      por_que_nao: pode ? null : 'você pediu este ajuste — a aprovação é de outra pessoa'
    };
  });
}

function aprovar(db, { id, quem }){
  const p = db.prepare('SELECT * FROM ajuste_pedido WHERE id=?').get(+id);
  if(!p) throw erro(404, 'pedido não encontrado');
  if(p.status !== 'pendente') throw erro(409, 'este pedido já foi decidido (' + p.status + ')');
  if(!ESTOQUE.outraPessoa(quem, quemPediu(p)))
    throw erro(403, 'você pediu este ajuste: a aprovação tem que ser de outra pessoa', { motivo:'mesma_pessoa' });
  /* O DELTA sobre o saldo de AGORA. O que andou entre o pedido e a aprovacao
     continua valendo. */
  const r = ESTOQUE.movimentar(db, { codigo:p.codigo, delta:p.delta, tipo:'ajuste',
    referencia:'ajuste:' + p.id, motivo:p.motivo + (p.obs ? ' — ' + p.obs : ''),
    usuario_nome:p.pedido_por || null, aprovado_por:quem.nome || null });
  const mov = db.prepare('SELECT MAX(id) id FROM movimento_estoque WHERE codigo=?').get(p.codigo).id;
  /* O historico do que FOI aplicado — o que o botao "historico" e o card da
     aba Estoque leem. Quem pediu assina a linha; quem aprovou vai na obs. */
  const aj = db.prepare(`INSERT INTO ajuste_estoque (codigo,antes,depois,delta,motivo,obs,usuario_id,usuario_nome)
    VALUES (?,?,?,?,?,?,?,?)`).run(p.codigo, r.antes, r.depois, p.delta, p.motivo,
      [p.obs, 'aprovado por ' + (quem.nome || '?'),
       'pedido quando o saldo era ' + p.saldo_no_pedido].filter(Boolean).join(' · '),
      p.pedido_por_id, p.pedido_por || '').lastInsertRowid;
  db.prepare(`UPDATE ajuste_pedido SET status='aprovado', decidido_por=?, decidido_por_id=?,
      decidido_em=datetime('now','localtime'), movimento_id=?, ajuste_id=? WHERE id=?`)
    .run(quem.nome || '', quem.id != null ? quem.id : null, mov, aj, p.id);
  return { id:p.id, codigo:p.codigo, delta:p.delta, antes:r.antes, depois:r.depois };
}

/* RECUSAR (outra pessoa, com a chave de aprovar) ou DESISTIR (quem pediu). Os
   dois guardam o pedido com a resposta — nada se apaga. Sem a desistencia, um
   pedido errado travaria o SKU (um pendente por vez) ate outra pessoa
   aparecer: a trava que so sabe acusar (§5). `podeAprovar` vem da rota. */
function recusar(db, { id, resposta, quem, podeAprovar }){
  const p = db.prepare('SELECT * FROM ajuste_pedido WHERE id=?').get(+id);
  if(!p) throw erro(404, 'pedido não encontrado');
  if(p.status !== 'pendente') throw erro(409, 'este pedido já foi decidido (' + p.status + ')');
  const txt = String(resposta || '').trim();
  if(!txt) throw erro(400, 'escreva o porquê');
  const meu = !ESTOQUE.outraPessoa(quem, quemPediu(p));
  if(!meu && !podeAprovar) throw erro(403, 'só quem aprova ajuste pode recusar o pedido de outra pessoa');
  const status = meu ? 'desistido' : 'recusado';
  db.prepare(`UPDATE ajuste_pedido SET status=?, resposta=?, decidido_por=?, decidido_por_id=?,
      decidido_em=datetime('now','localtime') WHERE id=?`)
    .run(status, txt, quem.nome || '', quem.id != null ? quem.id : null, p.id);
  return { id:p.id, codigo:p.codigo, status };
}

module.exports = { garantirSchema, pedir, pendentes, aprovar, recusar, erro };

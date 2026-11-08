/* O FIM DO DIA DA CONFERENCIA — spec CONFERENCIA-EXPEDICAO, fase 3 (03/11/2026).
 *
 * No fim do dia, a caixa que ficou na fabrica tem dois destinos (decisao do
 * dono): "a coleta nao passou" (continua esperando) ou "venda cancelada" (fase
 * 4, cancel_conf.js). Este modulo e o dono do PRIMEIRO: o registro de que
 * aquelas caixas ficaram, com quem e quando, e a marca que as poe no topo da
 * lista no dia seguinte, com o selo "de ontem".
 *
 * ⚠️ REGISTRAR NAO MEXE EM NADA. Nem estagio, nem estoque, nem saida: a caixa
 * continua exatamente onde estava, esperando. O registro so da nome ao atraso.
 * Pela armadilha #9 ela ja nao sumia da lista; aqui ela ganha lugar e selo.
 *
 * ⚠️ CAIXA SEM MARCACAO NUNCA E CANCELADA. Quem nao foi registrado aqui
 * continua na lista como antes, sem selo — o sistema entende "nao saiu", e
 * so. Cancelar e outra porta, com duas pessoas (cancel_conf.js).
 *
 * Uma linha por dia (e por modo teste): registrar de novo no mesmo dia JUNTA
 * as caixas e atualiza quem e quando, em vez de criar duas linhas.
 */
function garantir(db){
  db.exec(`CREATE TABLE IF NOT EXISTS fim_dia (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    dia TEXT NOT NULL,
    em TEXT DEFAULT (datetime('now','localtime')),
    por TEXT DEFAULT '',
    por_id INTEGER,
    ids TEXT DEFAULT '[]',
    teste INTEGER DEFAULT 0)`);
}
const hoje = db => db.prepare("SELECT date('now','localtime') d").get().d;
const lista = s => { try{ const v = JSON.parse(s || '[]'); return Array.isArray(v) ? v.map(Number).filter(Number.isFinite) : []; }catch(e){ return []; } };
function emTeste(db){
  try{ const r = db.prepare("SELECT valor FROM config WHERE chave='modo_teste'").get(); return !!(r && String(r.valor) === '1'); }catch(e){ return false; }
}

/* Registra "a coleta nao passou hoje" para as caixas dadas. Nao abre
   transacao (quem chama abre, se quiser). Devolve a linha do dia. */
function registrar(db, ids, quem){
  garantir(db);
  const dia = hoje(db), t = emTeste(db) ? 1 : 0;
  const nome = String((quem && quem.nome) || '').trim();
  const qid = quem && quem.id != null ? +quem.id : null;
  const limpos = [...new Set((ids || []).map(Number).filter(Number.isFinite))];
  const ja = db.prepare('SELECT * FROM fim_dia WHERE dia=? AND COALESCE(teste,0)=? ORDER BY id DESC').get(dia, t);
  if(ja){
    const juntos = [...new Set(lista(ja.ids).concat(limpos))];
    db.prepare("UPDATE fim_dia SET ids=?, por=?, por_id=?, em=datetime('now','localtime') WHERE id=?")
      .run(JSON.stringify(juntos), nome, qid, ja.id);
  } else {
    db.prepare('INSERT INTO fim_dia (dia, por, por_id, ids, teste) VALUES (?,?,?,?,?)')
      .run(dia, nome, qid, JSON.stringify(limpos), t);
  }
  return doDia(db);
}

/* O registro de hoje (ou null): a tela diz "registrado por X as HH:MM". */
function doDia(db){
  garantir(db);
  const r = db.prepare('SELECT * FROM fim_dia WHERE dia=? ORDER BY id DESC').get(hoje(db));
  return r ? { id:r.id, dia:r.dia, em:r.em, por:r.por, n:lista(r.ids).length } : null;
}

/* A marca de cada caixa: o dia MAIS RECENTE, antes de hoje, em que ela ficou.
   Olha 30 dias para tras — mais que isso e caso da Mesa de correcoes, nao
   selo de lista. Devolve um Map lote_id -> 'AAAA-MM-DD'. */
function marcas(db){
  garantir(db);
  const m = new Map();
  db.prepare(`SELECT dia, ids FROM fim_dia WHERE dia < date('now','localtime')
      AND dia >= date('now','localtime','-30 days') ORDER BY dia ASC`).all()
    .forEach(r => lista(r.ids).forEach(id => m.set(id, r.dia)));
  return m;
}

/* RELATORIOS-UNIFICADOS (08/11/2026): os dias em que a coleta nao passou, e
   quantas caixas ficaram em cada um. Fora do modo teste. */
function porPeriodo(db, de, ate){
  garantir(db);
  return db.prepare("SELECT dia, ids FROM fim_dia WHERE COALESCE(teste,0)=0 AND dia BETWEEN ? AND ? ORDER BY dia")
    .all(de, ate).map(r => ({ dia:r.dia, caixas:lista(r.ids).length }));
}

module.exports = { garantir, registrar, doDia, marcas, porPeriodo };

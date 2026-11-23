/* embalagem_reserva.js — DONO ÚNICO da peça reservada para quem está embalando
 * (spec EMBALAGEM-PRIORIDADE §5, decisão do dono de 23/11/2026).
 *
 * No 1º bipe do SKU, UMA linha `aguardando` da fila fica presa no nome da
 * pessoa. É a linha que o bipe final consome e a que a "Peça com defeito"
 * marca. Os outros não a contam como "aqui".
 *
 *  - A linha escolhida segue a ordem do consumo: modo `hoje`, depois
 *    `estoque`, depois `devolucao`; no mesmo modo, a mais antiga (ORDEM).
 *  - A reserva é da PESSOA (o login), não do tablet: uma por pessoa; bipar o
 *    mesmo SKU de outro tablet reaproveita a dela; bipar outro SKU troca.
 *  - Solta quando a embalagem fecha, cancela, marca defeito, ou depois de
 *    `config.emb_reserva_min` (5) minutos sem bipe dela. Sem cron: toda
 *    pergunta começa descartando as vencidas (`limpar`).
 *  - NÃO MEXE EM SALDO NEM NA FILA: só aponta para uma linha dela.
 */
'use strict';

const RESERVA_MIN_PADRAO = 5;
/* A ordem em que a embalagem consome a fila (decisão do dono, 23/11/2026). */
const ORDEM = "CASE f.modo WHEN 'hoje' THEN 0 WHEN 'estoque' THEN 1 ELSE 2 END, f.id";

class Recusa extends Error {
  constructor(status, msg, extra){ super(msg); this.status = status; this.extra = extra || {}; }
}

function garantir(db){
  db.exec(`CREATE TABLE IF NOT EXISTS embalagem_reserva (id INTEGER PRIMARY KEY AUTOINCREMENT,
    fila_id INTEGER NOT NULL UNIQUE, codigo TEXT NOT NULL, usuario_id INTEGER NOT NULL, usuario_nome TEXT,
    desde TEXT DEFAULT (datetime('now','localtime')), ultimo_bipe TEXT DEFAULT (datetime('now','localtime')),
    teste INTEGER DEFAULT 0)`);
}

function minutos(db){
  try{
    const r = db.prepare("SELECT valor FROM config WHERE chave='emb_reserva_min'").get();
    const n = r ? parseInt(r.valor, 10) : NaN;
    return Number.isFinite(n) && n > 0 ? n : RESERVA_MIN_PADRAO;
  }catch(e){ return RESERVA_MIN_PADRAO; }
}

/* Tira as vencidas e as que apontam para linha que já não espera embalagem. */
function limpar(db){
  garantir(db);
  db.prepare(`DELETE FROM embalagem_reserva WHERE ultimo_bipe < datetime('now','localtime', ?)`)
    .run('-' + minutos(db) + ' minutes');
  db.prepare(`DELETE FROM embalagem_reserva WHERE fila_id NOT IN (SELECT id FROM fila WHERE situacao='aguardando')`).run();
}

const up = s => String(s == null ? '' : s).trim().toUpperCase();

/* As reservas válidas, por linha da fila: { fila_id: {usuario_id, usuario_nome, codigo} }. */
function mapa(db){
  limpar(db);
  const m = new Map();
  for(const r of db.prepare('SELECT fila_id, codigo, usuario_id, usuario_nome FROM embalagem_reserva').all()) m.set(r.fila_id, r);
  return m;
}

function daPessoa(db, usuario_id){
  return db.prepare('SELECT * FROM embalagem_reserva WHERE usuario_id=?').get(usuario_id) || null;
}

/* Reserva uma peça do SKU para a pessoa. Devolve { fila_id, modo, nova }.
   Recusa 409 quando todas as que esperam estão com outras pessoas. Sem
   nenhuma linha esperando, devolve { fila_id:null } — quem recusa a persiana
   sem revisão é o bipe final (R-EMB-02), como sempre. */
function reservar(db, codigo, quem, emTeste){
  if(!quem || quem.usuario_id == null) throw new Recusa(401, 'Entre com o seu PIN para embalar.');
  const cod = up(codigo);
  if(!cod) throw new Recusa(400, 'Falta o SKU.');
  limpar(db);
  const minha = daPessoa(db, quem.usuario_id);
  if(minha && up(minha.codigo) === cod){
    db.prepare("UPDATE embalagem_reserva SET ultimo_bipe=datetime('now','localtime') WHERE id=?").run(minha.id);
    const f = db.prepare('SELECT modo FROM fila WHERE id=?').get(minha.fila_id) || {};
    return { fila_id:minha.fila_id, modo:f.modo || null, nova:false };
  }
  if(minha) db.prepare('DELETE FROM embalagem_reserva WHERE id=?').run(minha.id);
  const livre = db.prepare(`SELECT f.id, f.modo FROM fila f WHERE UPPER(f.codigo)=? AND f.situacao='aguardando'
      AND COALESCE(f.teste,0)=? AND f.id NOT IN (SELECT fila_id FROM embalagem_reserva) ORDER BY ${ORDEM} LIMIT 1`).get(cod, emTeste ? 1 : 0);
  if(!livre){
    const outra = db.prepare(`SELECT r.usuario_nome FROM embalagem_reserva r JOIN fila f ON f.id=r.fila_id
        WHERE UPPER(f.codigo)=? AND COALESCE(f.teste,0)=? ORDER BY r.desde LIMIT 1`).get(cod, emTeste ? 1 : 0);
    if(outra) throw new Recusa(409, 'A ' + cod + ' que estava esperando já está sendo embalada' +
      (outra.usuario_nome ? ' por ' + outra.usuario_nome : ' por outra pessoa') + '. Embale outra peça.',
      { motivo:'reservada', por:outra.usuario_nome || null });
    return { fila_id:null, modo:null, nova:false };
  }
  db.prepare('INSERT INTO embalagem_reserva (fila_id,codigo,usuario_id,usuario_nome,teste) VALUES (?,?,?,?,?)')
    .run(livre.id, cod, quem.usuario_id, quem.usuario_nome || null, emTeste ? 1 : 0);
  return { fila_id:livre.id, modo:livre.modo, nova:true };
}

/* O bipe do kit renova o relógio da reserva. Devolve se ainda há reserva. */
function renovar(db, codigo, quem){
  limpar(db);
  if(!quem || quem.usuario_id == null) return false;
  const minha = daPessoa(db, quem.usuario_id);
  if(!minha || up(minha.codigo) !== up(codigo)) return false;
  db.prepare("UPDATE embalagem_reserva SET ultimo_bipe=datetime('now','localtime') WHERE id=?").run(minha.id);
  return true;
}

function soltar(db, quem){
  garantir(db);
  if(!quem || quem.usuario_id == null) return;
  db.prepare('DELETE FROM embalagem_reserva WHERE usuario_id=?').run(quem.usuario_id);
}

/* A linha que o bipe final consome: a reservada pela pessoa (se ainda vale e é
   do SKU); senão a primeira livre pela ORDEM. ⚠️ NUNCA A RESERVADA POR OUTRA
   PESSOA (③ REVISÃO): quem não tem reserva (a página antiga em cache, a
   reserva vencida) leva o 409 no fim — e não quem reservou. `null` com linha
   esperando quer dizer "todas com outras pessoas" (ver `reservadaPor`). */
function linhaParaConsumir(db, codigo, quem, emTeste){
  limpar(db);
  const cod = up(codigo), t = emTeste ? 1 : 0;
  if(quem && quem.usuario_id != null){
    const minha = daPessoa(db, quem.usuario_id);
    if(minha && up(minha.codigo) === cod){
      const f = db.prepare("SELECT id, modo FROM fila WHERE id=? AND situacao='aguardando' AND COALESCE(teste,0)=?").get(minha.fila_id, t);
      if(f) return f;
    }
  }
  return db.prepare(`SELECT f.id, f.modo FROM fila f WHERE UPPER(f.codigo)=? AND f.situacao='aguardando' AND COALESCE(f.teste,0)=?
      AND f.id NOT IN (SELECT fila_id FROM embalagem_reserva) ORDER BY ${ORDEM} LIMIT 1`).get(cod, t)
    || null;
}

/* Quem está com a peça do SKU (o nome da reserva mais antiga), ou null. */
function reservadaPor(db, codigo, emTeste){
  const r = db.prepare(`SELECT r.usuario_nome FROM embalagem_reserva r JOIN fila f ON f.id=r.fila_id
      WHERE UPPER(f.codigo)=? AND f.situacao='aguardando' AND COALESCE(f.teste,0)=? ORDER BY r.desde LIMIT 1`).get(up(codigo), emTeste ? 1 : 0);
  return r ? (r.usuario_nome || 'outra pessoa') : null;
}

module.exports = { garantir, limpar, mapa, reservar, renovar, soltar, linhaParaConsumir, reservadaPor, minutos, Recusa, ORDEM, RESERVA_MIN_PADRAO };

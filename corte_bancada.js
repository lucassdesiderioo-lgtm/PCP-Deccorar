/* corte_bancada.js — DONO UNICO do corte da medida padrao: a 108 Corte de tecido
 * e a 110 Serralheria (spec PRODUCAO-MAPA-E-MOTOR v7, §14.4, 25/11/2026).
 *
 *   corte_lote  um corte de uma pessoa: o item, quantas, inicio, fim, perdidas
 *   corte_peca  cada peca cortada, ligada a UMA etiqueta do maco (TC ou TB)
 *
 * O item do tecido e o SKU (o cartao e a medida do SKU final: "1,50 × 1,50
 * BEGE"); o do tubo e o material e a medida de corte da ficha ("c12:147"), que
 * serve a qualquer cor. Quem diz que item existe e quanto falta e o
 * `producao_lista.js`; aqui so se registra o que a bancada fez.
 *
 * Os bipes (o dono, 25/11/2026):
 *   1 peca  — bipa a etiqueta no INICIO e a MESMA de novo no FIM;
 *   lote    — bipa a PRIMEIRA no inicio e depois CADA UMA ao colar; a ultima
 *             fecha. "Para nao correr o risco de nenhuma ser extraviada."
 *
 * ⚠️ Cortar NAO mexe em saldo: o material so baixa na embalagem (§24). A peca
 *    cortada fica "na prateleira" ate a montagem (107) bipa-la.
 * ⚠️ A "entrada inicial" (§14.10) e o mesmo fluxo, marcado: lanca o que ja
 *    estava cortado no dia da virada, e NAO conta tempo nem produtividade.
 */
'use strict';
const ETQ = require('./etiqueta_producao');
const { Recusa } = ETQ;

const TIPOS = { tecido:'TC', tubo:'TB' };
const MOTIVOS_PERDA = {
  tecido:['Corte torto', 'Mancha ou defeito no rolo', 'Medida errada', 'Outro'],
  tubo:['Corte torto', 'Medida errada', 'Tubo amassado', 'Outro']
};

function garantirSchema(db){
  ETQ.garantirSchema(db);
  db.exec(`CREATE TABLE IF NOT EXISTS corte_lote (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      tipo TEXT NOT NULL, item TEXT NOT NULL, descricao TEXT,
      quantidade INTEGER NOT NULL, perdidas INTEGER DEFAULT 0, perdas_motivos TEXT,
      entrada_inicial INTEGER DEFAULT 0,
      situacao TEXT NOT NULL DEFAULT 'aberto',
      inicio TEXT DEFAULT (datetime('now','localtime')), fim TEXT, segundos INTEGER,
      usuario_id INTEGER, usuario_nome TEXT)`);
  db.exec(`CREATE TABLE IF NOT EXISTS corte_peca (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      lote_id INTEGER NOT NULL, etiqueta_id INTEGER NOT NULL UNIQUE,
      tipo TEXT NOT NULL, item TEXT NOT NULL,
      situacao TEXT NOT NULL DEFAULT 'cortando',
      criada_em TEXT DEFAULT (datetime('now','localtime')),
      montada_em TEXT, persiana_id INTEGER)`);
  db.exec(`CREATE INDEX IF NOT EXISTS ix_corte_peca_item ON corte_peca(tipo, item, situacao)`);
}

function pessoa(q){ q = q || {}; return { id: q.id == null ? null : q.id, nome: q.nome || null }; }
const mesma = (lote, q) => q && lote.usuario_id != null && q.id === lote.usuario_id;

function aberto(db, quem, tipo){
  const p = pessoa(quem);
  if(p.id == null) return null;
  const l = db.prepare(`SELECT * FROM corte_lote WHERE situacao='aberto' AND usuario_id=?${tipo ? ' AND tipo=?' : ''} ORDER BY id DESC LIMIT 1`)
    .get(...(tipo ? [p.id, tipo] : [p.id]));
  if(!l) return null;
  l.pecas = db.prepare(`SELECT p.id, p.etiqueta_id, e.codigo, e.numero FROM corte_peca p JOIN etiqueta_producao e ON e.id=p.etiqueta_id
    WHERE p.lote_id=? ORDER BY p.id`).all(l.id).map(x => Object.assign(x, { rotulo: ETQ.rotulo(Object.assign({ tipo:TIPOS[l.tipo] }, x)) }));
  l.faltam = l.quantidade - l.perdidas - l.pecas.length;
  return l;
}

/* INICIO: o bipe da primeira etiqueta. `item` e `descricao` vem da lista do
   planejamento (a rota confere que o item existe). */
function iniciar(db, d, quem){
  const p = pessoa(quem);
  const tipo = d.tipo;
  if(!TIPOS[tipo]) throw new Recusa('Tipo de corte desconhecido.');
  const item = String(d.item || '').trim();
  if(!item) throw new Recusa('Escolha na lista o que vai cortar.');
  const q = Number(d.quantidade);
  if(!Number.isInteger(q) || q < 1 || q > 999) throw new Recusa('A quantidade tem que ser um número de 1 a 999.');
  if(aberto(db, quem, null)) throw new Recusa('Termine ou cancele o corte aberto antes.', 409);
  return db.transaction(() => {
    const e = ETQ.usar(db, d.etiqueta, TIPOS[tipo]);
    const lote = db.prepare(`INSERT INTO corte_lote (tipo, item, descricao, quantidade, entrada_inicial, usuario_id, usuario_nome)
      VALUES (?,?,?,?,?,?,?)`).run(tipo, item, d.descricao || null, q, d.entrada_inicial ? 1 : 0, p.id, p.nome).lastInsertRowid;
    db.prepare('INSERT INTO corte_peca (lote_id, etiqueta_id, tipo, item) VALUES (?,?,?,?)').run(lote, e.id, tipo, item);
    return aberto(db, quem, tipo);
  })();
}

function fechar(db, l){
  db.prepare(`UPDATE corte_lote SET situacao='fechado', fim=datetime('now','localtime'),
    segundos=CAST(ROUND((julianday(datetime('now','localtime')) - julianday(inicio)) * 86400) AS INTEGER) WHERE id=?`).run(l.id);
  db.prepare("UPDATE corte_peca SET situacao='prateleira' WHERE lote_id=?").run(l.id);
  return db.prepare('SELECT * FROM corte_lote WHERE id=?').get(l.id);
}

/* Cada bipe depois do inicio. Na peca unica, o FIM e a MESMA etiqueta. No
   lote, cada etiqueta nova e uma peca; a que completa o lote fecha. */
function bipar(db, codigo, quem){
  const l = aberto(db, quem, null);
  if(!l) throw new Recusa('Nenhum corte aberto. Escolha na lista o que vai cortar.', 409);
  const c = ETQ.limpar(codigo);
  return db.transaction(() => {
    if(l.quantidade === 1){
      if(c !== l.pecas[0].codigo) throw new Recusa('Para terminar, bipe de novo a ' + l.pecas[0].rotulo + '.');
      return { fechado:fechar(db, l), pecas:l.pecas };
    }
    if(l.pecas.some(x => x.codigo === c)) throw new Recusa(ETQ.rotulo(ETQ.traduzir(db, c)) + ' já foi bipada neste corte.');
    const e = ETQ.usar(db, c, TIPOS[l.tipo]);
    db.prepare('INSERT INTO corte_peca (lote_id, etiqueta_id, tipo, item) VALUES (?,?,?,?)').run(l.id, e.id, l.tipo, l.item);
    const a = aberto(db, quem, null);
    if(a.faltam <= 0) return { fechado:fechar(db, a), pecas:a.pecas };
    return { aberto:a };
  })();
}

/* Peca perdida no corte (corte torto, mancha): conta no lote, com o motivo, e
   volta para a lista (a falta nao baixa). Nao gasta etiqueta. */
function perdida(db, motivo, quem){
  const l = aberto(db, quem, null);
  if(!l) throw new Recusa('Nenhum corte aberto.', 409);
  const m = String(motivo || '').trim();
  if(!m) throw new Recusa('Diga o motivo da peça perdida.');
  if(l.faltam <= 0 || (l.quantidade - l.perdidas - 1) < 1) throw new Recusa('Todas as peças deste corte já estão contadas: cancele o corte.');
  return db.transaction(() => {
    const motivos = JSON.parse(l.perdas_motivos || '[]'); motivos.push(m);
    db.prepare('UPDATE corte_lote SET perdidas=perdidas+1, perdas_motivos=? WHERE id=?').run(JSON.stringify(motivos), l.id);
    const a = aberto(db, quem, null);
    if(a.faltam <= 0) return { fechado:fechar(db, a), pecas:a.pecas };
    return { aberto:a };
  })();
}

/* Cancelar: nada fica; as etiquetas bipadas voltam ao maco. */
function cancelar(db, quem){
  const l = aberto(db, quem, null);
  if(!l) throw new Recusa('Nenhum corte aberto.', 409);
  db.transaction(() => {
    for(const x of l.pecas) ETQ.soltar(db, x.etiqueta_id);
    db.prepare('DELETE FROM corte_peca WHERE lote_id=?').run(l.id);
    db.prepare("UPDATE corte_lote SET situacao='cancelado', fim=datetime('now','localtime') WHERE id=?").run(l.id);
  })();
  return true;
}

/* O que esta na prateleira (cortado e ainda nao montado), por item. */
function naPrateleira(db, tipo){
  const m = {};
  db.prepare("SELECT item, COUNT(*) n FROM corte_peca WHERE tipo=? AND situacao='prateleira' GROUP BY item").all(tipo)
    .forEach(r => { m[r.item] = r.n; });
  return m;
}
/* O que esta sendo cortado agora (lote aberto): o que falta bipar tambem ja
   esta na mao de alguem, e nao se pede de novo. */
function emCorte(db, tipo){
  const m = {};
  db.prepare(`SELECT item, SUM(quantidade - perdidas) n FROM corte_lote WHERE tipo=? AND situacao='aberto' GROUP BY item`).all(tipo)
    .forEach(r => { m[r.item] = r.n; });
  return m;
}

/* As pecas e o tempo do dia de uma pessoa (o "cortados hoje" do topo). A
   entrada inicial nao conta. */
function doDia(db, quem, tipo){
  const p = pessoa(quem);
  const r = db.prepare(`SELECT COALESCE(SUM(quantidade - perdidas),0) pecas, COUNT(*) lotes FROM corte_lote
    WHERE situacao='fechado' AND entrada_inicial=0 AND tipo=? AND usuario_id IS ? AND date(fim)=date('now','localtime')`).get(tipo, p.id);
  return r;
}

module.exports = { Recusa, TIPOS, MOTIVOS_PERDA, garantirSchema, aberto, iniciar, bipar, perdida, cancelar,
  naPrateleira, emCorte, doDia, mesma };

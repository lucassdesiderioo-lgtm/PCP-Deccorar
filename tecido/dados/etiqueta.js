// Tabelas 'etiqueta' e 'etiqueta_lote'. Nao decidem nada — quem decide o
// numero seguinte e a recusa e dominio/etiqueta.js.
const db=require('../nucleo/db');

const ultimoSeq=()=>db.prepare('SELECT MAX(seq) m FROM etiqueta').get().m||0;

const criarLote=(quantidade,de,ate,quem)=>{
  const r=db.prepare('INSERT INTO etiqueta_lote(quantidade,de_seq,ate_seq,criado_por) VALUES(?,?,?,?)')
    .run(quantidade,de,ate,quem||null);
  return r.lastInsertRowid;
};
const criar=(codigo,seq,lote_id)=>
  db.prepare('INSERT INTO etiqueta(codigo,seq,lote_id) VALUES(?,?,?)').run(codigo,seq,lote_id);

const porCodigo=codigo=>db.prepare('SELECT * FROM etiqueta WHERE codigo=?').get(codigo);

const marcarUsada=(codigo,sobra_id,quando)=>
  db.prepare('UPDATE etiqueta SET sobra_id=?, usada_em=? WHERE codigo=?').run(sobra_id,quando,codigo);

const soltar=codigo=>
  db.prepare('UPDATE etiqueta SET sobra_id=NULL, usada_em=NULL WHERE codigo=?').run(codigo);

// A lista que a pergunta 6 pedia: etiqueta impressa e ainda NAO bipada.
// Nao e palpite sobre lacunas na sequencia — e o que o sistema imprimiu menos
// o que voltou da bancada.
const pendentes=()=>db.prepare(`
  SELECT e.codigo, e.seq, e.lote_id, e.criado_em,
         CAST(julianday('now','localtime')-julianday(e.criado_em) AS INTEGER) AS dias
    FROM etiqueta e WHERE e.sobra_id IS NULL ORDER BY e.seq`).all();

const lotes=()=>db.prepare(`
  SELECT l.*, (SELECT COUNT(*) FROM etiqueta e WHERE e.lote_id=l.id AND e.sobra_id IS NOT NULL) AS usadas
    FROM etiqueta_lote l ORDER BY l.id DESC`).all();

const doLote=lote_id=>db.prepare('SELECT codigo,seq,sobra_id FROM etiqueta WHERE lote_id=? ORDER BY seq').all(lote_id);

module.exports={ultimoSeq,criarLote,criar,porCodigo,marcarUsada,soltar,pendentes,lotes,doLote};

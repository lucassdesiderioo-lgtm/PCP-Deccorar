/* defeito_dominio.js — DONO ÚNICO da peça devolvida da Embalagem por defeito
 * (spec EMBALAGEM-DEFEITO-VOLTA, cartão R-EMB-11, 21/11/2026).
 *
 *   EMBALAGEM: quem embala marca "Peça com defeito" (motivo obrigatório). Nada
 *              embala, nada soma; a linha da fila sai de 'aguardando' e passa a
 *              'defeito' — sem ela a persiana não embala de novo (R-EMB-02).
 *   REVISÃO:   a volta aparece no bloco "Voltaram da embalagem por defeito". O
 *              revisor decide:
 *              - 'defeito'     → vira a peça com problema (rejeicao_dominio), com
 *                                a origem 'embalagem' e o setor responsável;
 *              - 'sem_defeito' → a volta fecha, e a peça é REVISADA DE NOVO pelos
 *                                dois bipes: só a revisão nova a põe na fila.
 *
 * ⚠️ NÃO MEXE NO ESTOQUE (a peça com defeito nunca somou) e não apaga a linha
 *    da fila: ela é o rastro de onde a peça estava.
 * ⚠️ O DOMÍNIO NÃO ABRE TRANSAÇÃO: quem chama abre (R-EST-07).
 */
const REJ = require('./rejeicao_dominio');

/* Q3 da spec: lista fixa, das etapas de preparo da ficha (etapas.js) mais a montagem. */
const SETORES = [
  { chave:'corte_tecido', nome:'Corte de tecido' },
  { chave:'corte_tubo',   nome:'Corte de tubo e base' },
  { chave:'kit_comando',  nome:'Kit de comando' },
  { chave:'montagem',     nome:'Montagem' },
  { chave:'outro',        nome:'Outro' }
];

class Recusa extends Error { constructor(status, msg, extra){ super(msg); this.status = status; this.extra = extra || {}; } }

function garantir(db){
  db.exec(`CREATE TABLE IF NOT EXISTS embalagem_defeito (id INTEGER PRIMARY KEY AUTOINCREMENT,
    codigo TEXT NOT NULL, fila_id INTEGER, modo TEXT, motivo TEXT NOT NULL, obs TEXT, segundos INTEGER,
    achou_por_id INTEGER, achou_por TEXT, achou_em TEXT DEFAULT (datetime('now','localtime')),
    decisao TEXT, setor TEXT, decisao_obs TEXT, decidido_por_id INTEGER, decidido_por TEXT, decidido_em TEXT,
    rejeicao_id INTEGER, teste INTEGER DEFAULT 0)`);
}

/* A persiana é a régua da R-EMB-02: modelo com medida; SKU sem modelo conta como persiana. */
function ehPersiana(db, cod){
  try{
    const r = db.prepare('SELECT COALESCE(m.exige_medida,1) e FROM skus s LEFT JOIN modelo m ON m.id=s.modelo_id WHERE s.codigo=?').get(cod);
    return !r || r.e !== 0;
  }catch(e){ return true; }
}

/* Q1: a mesma lista de motivos da Revisão. Lista vazia ou sem a tabela: aceita
   o texto que veio (o motivo continua obrigatório). */
function motivoValido(db, motivo){
  try{
    const n = db.prepare("SELECT COUNT(*) n FROM listas WHERE tipo='rejeicao' AND ativo=1").get().n;
    if(!n) return true;
    return !!db.prepare("SELECT 1 FROM listas WHERE tipo='rejeicao' AND ativo=1 AND valor=?").get(motivo);
  }catch(e){ return true; }
}

const txt = (v, n) => v == null || String(v).trim() === '' ? null : String(v).trim().slice(0, n);

/* d: { codigo, motivo, obs, segundos }  quem: { usuario_id, usuario_nome }  emTeste: 0|1 */
function marcar(db, d, quem, emTeste){
  const cod = String(d.codigo || '').trim().toUpperCase().slice(0, 80);
  if(!cod) throw new Recusa(400, 'Falta o SKU da peça.');
  const motivo = txt(d.motivo, 120);
  if(!motivo) throw new Recusa(400, 'Escolha o motivo do defeito.', { motivo:'sem_motivo' });
  if(!motivoValido(db, motivo)) throw new Recusa(400, 'Esse motivo não está na lista. Escolha um da lista.', { motivo:'motivo_invalido' });
  if(!db.prepare('SELECT 1 FROM skus WHERE codigo=?').get(cod)) throw new Recusa(404, 'SKU não cadastrado: ' + cod);
  if(!ehPersiana(db, cod)) throw new Recusa(400, cod + ' não é persiana: kit, acessório e sob medida não voltam para a Revisão.', { motivo:'nao_persiana' });
  const f = db.prepare("SELECT id, modo FROM fila WHERE UPPER(codigo)=? AND situacao='aguardando' AND COALESCE(teste,0)=? ORDER BY id LIMIT 1").get(cod, emTeste ? 1 : 0);
  if(!f) throw new Recusa(409, 'Não há nenhuma ' + cod + ' esperando embalagem: ela não pode voltar para a Revisão por aqui.', { motivo:'sem_revisao' });
  db.prepare("UPDATE fila SET situacao='defeito' WHERE id=?").run(f.id);
  const id = db.prepare(`INSERT INTO embalagem_defeito (codigo,fila_id,modo,motivo,obs,segundos,achou_por_id,achou_por)
    VALUES (?,?,?,?,?,?,?,?)`).run(cod, f.id, f.modo || null, motivo, txt(d.obs, 500), Math.round(+d.segundos || 0),
      quem.usuario_id, quem.usuario_nome).lastInsertRowid;
  try{ db.prepare(`INSERT INTO montagem_evento (tipo,codigo,segundos,usuario_id,usuario_nome) VALUES ('defeito',?,?,?,?)`)
    .run(cod, Math.round(+d.segundos || 0), quem.usuario_id, quem.usuario_nome); }catch(e){}
  return { id, fila_id:f.id };
}

/* As voltas abertas, a mais antiga em cima, com a medida e a cor para o revisor. */
function abertas(db){
  return db.prepare(`SELECT d.id, d.codigo, d.motivo, d.obs, d.achou_por, d.achou_em,
      CAST((julianday('now','localtime') - julianday(d.achou_em)) * 1440 AS INTEGER) AS ha_min,
      s.largura_cm, s.altura_cm, s.cor_codigo, s.cor
    FROM embalagem_defeito d LEFT JOIN skus s ON s.codigo=d.codigo
    WHERE d.decisao IS NULL ORDER BY d.achou_em, d.id`).all();
}

/* b: { decisao:'defeito'|'sem_defeito', setor, obs } */
function decidir(db, id, b, quem){
  const d = db.prepare('SELECT * FROM embalagem_defeito WHERE id=?').get(+id);
  if(!d) throw new Recusa(404, 'Essa volta da embalagem não existe.');
  if(d.decisao) throw new Recusa(409, 'Essa volta já foi decidida por ' + (d.decidido_por || 'outra pessoa') + '.');
  const decisao = String(b.decisao || '');
  if(decisao !== 'defeito' && decisao !== 'sem_defeito') throw new Recusa(400, 'Diga se a peça tem defeito ou não.');
  let setor = null, rejeicao_id = null;
  if(decisao === 'defeito'){
    const s = SETORES.find(x => x.chave === b.setor);
    if(!s) throw new Recusa(400, 'Escolha o setor responsável.', { motivo:'sem_setor' });
    setor = s.chave;
    REJ.garantir(db);
    rejeicao_id = REJ.registrar(db, { codigo:d.codigo, motivo:d.motivo, obs:[d.obs, txt(b.obs, 500)].filter(Boolean).join(' — ') || null,
      segundos:d.segundos, modo:d.modo, origem:'embalagem', setor:s.nome }, quem);
  }
  db.prepare(`UPDATE embalagem_defeito SET decisao=?, setor=?, decisao_obs=?, decidido_por_id=?, decidido_por=?,
    decidido_em=datetime('now','localtime'), rejeicao_id=? WHERE id=?`)
    .run(decisao, setor, txt(b.obs, 500), quem.usuario_id, quem.usuario_nome, rejeicao_id, d.id);
  return { id:d.id, decisao, setor, rejeicao_id, codigo:d.codigo };
}

module.exports = { SETORES, Recusa, garantir, ehPersiana, marcar, abertas, decidir };

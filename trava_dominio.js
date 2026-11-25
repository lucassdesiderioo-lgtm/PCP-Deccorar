/* A TRAVA DA 201 (spec CONFERENCIA-CARRINHOS, fase 3, R-TRV-01 a 04 e §7).
 *
 * DONO ÚNICO de "a Etiqueta de Venda pode imprimir etiqueta nova?". A
 * /api/embalar, o bipe do SKU, a tela e a central de pendências perguntam
 * aqui; ninguém escreve a régua de novo.
 *
 * TRAVA = caixa impressa num dia ANTERIOR e ainda sem conferência, fora de
 * qualquer saída — ADIANTADA OU NÃO (D18; o dono, 25/11/2026: "se essas 15
 * peças tivessem ficado sem a conferência, a tela precisa travar"), e o sob
 * medida igual (D19). Vale para todo mundo (D11).
 *
 * ⚠️ O QUE SOLTA (R-TRV-03): o bipe na 202 (`conferido_em`), separar como
 * venda cancelada (`estagio='cancelado'`), ou um Supervisor marcar "caixa não
 * encontrada" (`nao_encontrada_em`, com motivo) — que vira pendência na 204.
 *
 * ⚠️ A REIMPRESSÃO NUNCA TRAVA (R-TRV-02), mas reimprimir uma caixa que ESTÁ
 * travando abre a pendência da "caixa reimpressa no dia seguinte" (§7, D6): a
 * reimpressão não pede motivo, e é assim que o sistema reconhece sozinho a
 * persiana que pode ter sumido. "Perdida" abre o PEDIDO de ajuste −1 por peça
 * — outra pessoa aprova (R-EST-20); nada aqui mexe em saldo.
 *
 * ⚠️ NENHUMA FUNÇÃO DAQUI ABRE TRANSAÇÃO, menos `decidirReimpressa`, que
 * precisa desfazer os pedidos de ajuste se um deles for recusado.
 */
const AJUSTE = require('./ajuste_dominio');

function garantirSchema(db){
  const cols = ['nao_encontrada_em TEXT','nao_encontrada_por TEXT','nao_encontrada_por_id INTEGER',
    'nao_encontrada_motivo TEXT','nao_encontrada_resolvida_em TEXT','nao_encontrada_resolvida_por TEXT',
    'nao_encontrada_resolvida_por_id INTEGER','nao_encontrada_resposta TEXT'];
  for(const c of cols){ try{ db.exec('ALTER TABLE lote ADD COLUMN ' + c); }catch(e){} }
  db.exec(`CREATE TABLE IF NOT EXISTS caixa_reimpressa (
    id                INTEGER PRIMARY KEY AUTOINCREMENT,
    lote_id           INTEGER,
    reimpressa_em     TEXT DEFAULT (datetime('now','localtime')),
    reimpresso_por    TEXT,
    reimpresso_por_id INTEGER,
    status            TEXT DEFAULT 'pendente',
    decidido_em       TEXT,
    decidido_por      TEXT,
    decidido_por_id   INTEGER,
    ajustes           TEXT,
    teste             INTEGER DEFAULT 0
  )`);
  db.exec('CREATE INDEX IF NOT EXISTS ix_caixa_reimpressa ON caixa_reimpressa(status, lote_id)');
}

function erro(status, mensagem, extra){
  const e = new Error(mensagem); e.status = status; if(extra) Object.assign(e, { extra }); return e;
}

/* A RÉGUA, numa frase só. `embalado` e sem `conferido_em` é a caixa impressa
   esperando o bipe (a conferida de coleta vira `carregado`; a de agência fica
   `embalado` COM `conferido_em`). */
const ESPERANDO_BIPE = `l.estagio='embalado' AND l.conferido_em IS NULL AND l.embalado_em IS NOT NULL
  AND date(l.embalado_em) < date('now','localtime')
  AND l.saida_id IS NULL AND l.saiu_em IS NULL AND l.retirado_em IS NULL
  AND COALESCE(l.teste,0)=0`;
const TRAVA = ESPERANDO_BIPE + ' AND l.nao_encontrada_em IS NULL';

function caixas(db){
  return db.prepare(`SELECT l.id, l.codigo, l.buyer, l.nf, l.envio, l.impresso_por, l.embalado_em,
      l.despachar_em, l.modalidade,
      CASE WHEN l.despachar_em > date(l.embalado_em) THEN 1 ELSE 0 END adiantada,
      COALESCE((SELECT SUM(COALESCE(i.qtd,1)) FROM lote_item i WHERE i.lote_id=l.id),1) pecas,
      (SELECT COUNT(*) FROM caixa_reimpressa c WHERE c.lote_id=l.id) reimpressa
    FROM lote l WHERE ` + TRAVA + ` ORDER BY l.embalado_em, l.id`).all();
}
function estaTravando(db, id){
  return !!db.prepare('SELECT 1 FROM lote l WHERE l.id=? AND ' + TRAVA).get(id);
}
/* A conta que falhar (banco sem as colunas — só um banco de teste mínimo; o de
   produção sempre as tem, o exp_route as cria) NÃO derruba a bancada: vai ao log
   e a resposta diz `erro`, nunca "zero caixas" calado. */
function travada(db){
  let c;
  try{ c = caixas(db); }
  catch(e){ console.log('[trava] não consegui conferir a trava da 201: ' + e.message);
    return { travada:false, n:0, caixas:[], erro:'não consegui conferir a trava' }; }
  return { travada: c.length > 0, n: c.length, caixas: c };
}
function frase(n){
  return n + (n === 1 ? ' caixa impressa num dia anterior ainda não foi conferida'
    : ' caixas impressas em dias anteriores ainda não foram conferidas') +
    '. Bipe essas caixas na Conferência para liberar.';
}

/* "CAIXA NÃO ENCONTRADA" (R-TRV-03): sem persiana para repor, um Supervisor
   solta a trava com motivo. A caixa não muda de estágio nem de saldo — a venda
   está parada e vira pendência na 204 (decidir com o ML). Se ela aparecer e for
   bipada, sai da pendência sozinha (a conta pede `conferido_em IS NULL`). */
function marcarNaoEncontrada(db, { id, motivo, quem }){
  const m = String(motivo || '').trim();
  if(!m) throw erro(400, 'escreva o motivo');
  const o = db.prepare('SELECT id, nao_encontrada_em FROM lote WHERE id=?').get(Number(id));
  if(!o) throw erro(404, 'caixa não encontrada no sistema');
  if(o.nao_encontrada_em) throw erro(409, 'esta caixa já foi marcada como não encontrada');
  if(!estaTravando(db, o.id)) throw erro(409, 'esta caixa não está travando a Etiqueta de Venda');
  db.prepare(`UPDATE lote SET nao_encontrada_em=datetime('now','localtime'), nao_encontrada_por=?,
      nao_encontrada_por_id=?, nao_encontrada_motivo=? WHERE id=?`)
    .run(quem.nome || '', quem.id != null ? quem.id : null, m, o.id);
  return { ok:true, id:o.id };
}
const NAO_ENCONTRADA = `l.nao_encontrada_em IS NOT NULL AND l.nao_encontrada_resolvida_em IS NULL
  AND l.conferido_em IS NULL AND l.estagio='embalado' AND l.saiu_em IS NULL AND COALESCE(l.teste,0)=0`;
function naoEncontradas(db){
  try{
    return db.prepare(`SELECT l.id, l.codigo, l.buyer, l.nf, l.envio, l.nao_encontrada_em, l.nao_encontrada_por,
        l.nao_encontrada_motivo FROM lote l WHERE ` + NAO_ENCONTRADA + ' ORDER BY l.nao_encontrada_em').all();
  }catch(e){ return []; }
}
function resolverNaoEncontrada(db, { id, resposta, quem }){
  const t = String(resposta || '').trim();
  if(!t) throw erro(400, 'escreva o que foi decidido');
  const o = db.prepare('SELECT l.id FROM lote l WHERE l.id=? AND ' + NAO_ENCONTRADA).get(Number(id));
  if(!o) throw erro(409, 'esta caixa não está esperando decisão');
  db.prepare(`UPDATE lote SET nao_encontrada_resolvida_em=datetime('now','localtime'), nao_encontrada_resolvida_por=?,
      nao_encontrada_resolvida_por_id=?, nao_encontrada_resposta=? WHERE id=?`)
    .run(quem.nome || '', quem.id != null ? quem.id : null, t, o.id);
  return { ok:true };
}

/* A CAIXA REIMPRESSA NO DIA SEGUINTE (§7, D6). Chamada pela /api/reimprimir
   DENTRO da transação dela, e ANTES de gravar: depois da reimpressão a caixa
   continua travando do mesmo jeito, então a pergunta é a mesma. Uma pendência
   aberta por caixa. */
/* ⚠️ A "NÃO ENCONTRADA" TAMBÉM CONTA (③ REVISÃO, 25/11/2026): ela saiu da trava,
   mas continua sendo a caixa de um dia anterior sem bipe — e é a mais provável de
   ser reposta e reimpressa. Pela régua da trava ela escapava, e a persiana
   perdida não deixava rastro. */
function registrarReimpressa(db, { lote_id, quem }){
  if(!db.prepare('SELECT 1 FROM lote l WHERE l.id=? AND ' + ESPERANDO_BIPE).get(lote_id)) return null;
  if(db.prepare("SELECT 1 FROM caixa_reimpressa WHERE lote_id=? AND status='pendente'").get(lote_id)) return null;
  return db.prepare('INSERT INTO caixa_reimpressa (lote_id,reimpresso_por,reimpresso_por_id) VALUES (?,?,?)')
    .run(lote_id, quem.usuario_nome || quem.nome || '', quem.usuario_id != null ? quem.usuario_id : (quem.id != null ? quem.id : null)).lastInsertRowid;
}
function reimpressas(db){
  try{
    return db.prepare(`SELECT c.id, c.lote_id, c.reimpressa_em, c.reimpresso_por, l.codigo, l.buyer, l.nf, l.envio,
        CASE WHEN l.conferido_em IS NOT NULL THEN 1 ELSE 0 END conferida
      FROM caixa_reimpressa c JOIN lote l ON l.id=c.lote_id
      WHERE c.status='pendente' AND COALESCE(c.teste,0)=0 ORDER BY c.reimpressa_em`).all();
  }catch(e){ return []; }
}
const DECISOES = { achei:'achei a caixa velha', perdida:'persiana perdida', so_etiqueta:'foi só a etiqueta' };

/* As peças da caixa por SKU, para o pedido de ajuste: a caixa de várias pelo
   `lote_item` (persiana, §5 #23); o sob medida não usa estoque (§7) e fica fora. */
function pecasPorSku(db, lote_id){
  const l = db.prepare('SELECT codigo FROM lote WHERE id=?').get(lote_id);
  let itens = db.prepare('SELECT UPPER(codigo) codigo, COALESCE(qtd,1) qtd FROM lote_item WHERE lote_id=?').all(lote_id);
  if(!itens.length) itens = [{ codigo:String(l.codigo || '').toUpperCase(), qtd:1 }];
  const sob = db.prepare('SELECT COALESCE(m.sob_medida,0) s FROM skus s LEFT JOIN modelo m ON m.id=s.modelo_id WHERE s.codigo=?');
  const por = {};
  for(const i of itens){ const r = sob.get(i.codigo); if(r && r.s) continue; por[i.codigo] = (por[i.codigo] || 0) + i.qtd; }
  return por;
}

function decidirReimpressa(db, { id, decisao, quem }){
  if(!DECISOES[decisao]) throw erro(400, 'escolha: achei a caixa velha, persiana perdida ou foi só a etiqueta');
  const c = db.prepare('SELECT c.*, l.nf, l.conferido_em FROM caixa_reimpressa c JOIN lote l ON l.id=c.lote_id WHERE c.id=?').get(Number(id));
  if(!c) throw erro(404, 'pendência não encontrada');
  if(c.status !== 'pendente') throw erro(409, 'esta caixa já foi decidida (' + (DECISOES[c.status] || c.status) + ')');
  /* ⚠️ "PERDIDA" SÓ DEPOIS DO BIPE (③ REVISÃO, 25/11/2026): a perda é a SEGUNDA
     persiana — a reposição, que baixou ao ser bipada. Com a caixa ainda sem bipe
     a reposição pode nem acontecer, e mais tarde o passivo das nunca conferidas
     daria a baixa dela: o −1 do ajuste baixaria a mesma peça de novo. */
  if(decisao === 'perdida' && !c.conferido_em)
    throw erro(409, 'bipe a caixa reimpressa na Conferência antes: a persiana só está perdida depois que a reposta saiu');
  return db.transaction(() => {
    const feitos = [];
    if(decisao === 'perdida'){
      const por = pecasPorSku(db, c.lote_id);
      for(const cod of Object.keys(por).sort()){
        const p = AJUSTE.pedir(db, { codigo:cod, delta:-por[cod],
          motivo:'Persiana perdida (caixa da NF ' + (c.nf || '—') + ' reimpressa no dia seguinte)',
          quem:{ id:quem.id, nome:quem.nome } });
        feitos.push({ id:p.id, codigo:cod, delta:p.delta });
      }
    }
    db.prepare(`UPDATE caixa_reimpressa SET status=?, decidido_em=datetime('now','localtime'), decidido_por=?,
        decidido_por_id=?, ajustes=? WHERE id=?`)
      .run(decisao, quem.nome || '', quem.id != null ? quem.id : null, feitos.length ? JSON.stringify(feitos) : null, c.id);
    return { ok:true, decisao, ajustes:feitos };
  })();
}

/* As duas linhas da central (pendencias_dominio): número e há quanto tempo. */
function contarNaoEncontradas(db){
  const r = naoEncontradas(db); return { n:r.length, desde:r.length ? r[0].nao_encontrada_em : null };
}
function contarReimpressas(db){
  const r = reimpressas(db); return { n:r.length, desde:r.length ? r[0].reimpressa_em : null };
}

module.exports = { garantirSchema, TRAVA, ESPERANDO_BIPE, caixas, travada, estaTravando, frase, marcarNaoEncontrada,
  naoEncontradas, resolverNaoEncontrada, registrarReimpressa, reimpressas, decidirReimpressa, DECISOES,
  contarNaoEncontradas, contarReimpressas, erro };

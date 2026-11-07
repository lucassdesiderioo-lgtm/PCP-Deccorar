/* ALMOXARIFADOS, ENDERECOS E VOLUMES — spec COMPRAS-E-RECEBIMENTO, fase 5
 * (R-CMP-06, R-CMP-38 a 41). Dono unico de: o endereco haste -> andar -> nivel,
 * o volume etiquetado (`volume_material`), guardar, mover e abrir.
 *
 * ⚠️ O SALDO DE UM MATERIAL POR VOLUME E A SOMA DOS VOLUMES NAO ENCERRADOS
 * (R-CMP-39). Quem move o saldo continua sendo o `componente_dominio.js`: o
 * volume nasce na MESMA transacao da entrada do recebimento, e abrir e uma saida
 * pelo livro (motivo `abertura`) na mesma transacao do encerramento. Mover nao
 * mexe em saldo.
 *
 * ⚠️ "UM POR NIVEL" E DO MATERIAL QUE ESTA SENDO GUARDADO (R-CMP-06): o nivel
 * ocupado por outro volume nao encerrado recusa, dizendo qual esta la.
 *
 * ⚠️ ABRIR O ROLO DO ML E CONSUMIR O ROLO (R-CMP-40): encerra o volume e sai o
 * saldo inteiro. Como ele e cortado e decisao de producao, e fica fora.
 *
 * O desenho e o do `armazem -> haste -> andar -> nivel` do sob medida, e e para
 * ca que os enderecos dele migram na fase 10.
 */
const DOM = require('./componente_dominio');

class Recusa extends Error{ constructor(status, msg){ super(msg); this.status = status; } }
const txt = v => { const t = String(v == null ? '' : v).trim(); return t === '' ? null : t; };
const pad = n => String(n).padStart(6, '0');

/* ── ENDERECOS ──────────────────────────────────────────────────────────── */
function codigoNivel(id){ return 'E-' + pad(id); }
function nomeNivel(db, nivel_id){
  const r = db.prepare(`SELECT a.nome alm, h.nome haste, d.nome andar, n.nome nivel FROM alm_nivel n JOIN alm_andar d ON d.id=n.andar_id
    JOIN alm_haste h ON h.id=d.haste_id JOIN almoxarifado a ON a.id=h.almoxarifado_id WHERE n.id=?`).get(nivel_id);
  return r ? r.alm + ' · ' + r.haste + ' · ' + r.andar + ' · ' + r.nivel : null;
}
function criarEnderecos(db, almoxarifado_id, b){
  const a = db.prepare('SELECT id FROM almoxarifado WHERE id=?').get(+almoxarifado_id);
  if(!a) throw new Recusa(404, 'almoxarifado não encontrado');
  const haste = txt(b.haste);
  if(!haste) throw new Recusa(400, 'dê um nome à haste (ex.: H1)');
  const andares = (Array.isArray(b.andares) ? b.andares : []).map(txt).filter(Boolean);
  const niveis = (Array.isArray(b.niveis) ? b.niveis : []).map(txt).filter(Boolean);
  if(!andares.length || !niveis.length) throw new Recusa(400, 'diga os andares e os níveis da haste');
  let n = 0;
  db.transaction(() => {
    db.prepare('INSERT OR IGNORE INTO alm_haste (almoxarifado_id, nome) VALUES (?,?)').run(a.id, haste);
    const h = db.prepare('SELECT id FROM alm_haste WHERE almoxarifado_id=? AND nome=?').get(a.id, haste).id;
    andares.forEach((an, i) => {
      db.prepare('INSERT OR IGNORE INTO alm_andar (haste_id, nome, ordem) VALUES (?,?,?)').run(h, an, i);
      const d = db.prepare('SELECT id FROM alm_andar WHERE haste_id=? AND nome=?').get(h, an).id;
      niveis.forEach((nv, k) => { db.prepare('INSERT OR IGNORE INTO alm_nivel (andar_id, nome, ordem) VALUES (?,?,?)').run(d, nv, k); });
    });
    n = db.prepare('SELECT COUNT(*) n FROM alm_nivel n JOIN alm_andar d ON d.id=n.andar_id WHERE d.haste_id=?').get(h).n;
  })();
  return { niveis:n };
}
function enderecos(db, almoxarifado_id){
  const niveis = db.prepare(`SELECT n.id, n.nome nivel, d.nome andar, h.nome haste, n.ativo,
      (SELECT COUNT(*) FROM volume_material v WHERE v.nivel_id=n.id AND v.situacao<>'encerrado') volumes
    FROM alm_nivel n JOIN alm_andar d ON d.id=n.andar_id JOIN alm_haste h ON h.id=d.haste_id
    WHERE h.almoxarifado_id=? ORDER BY h.ordem, h.nome, d.ordem, d.nome, n.ordem, n.nome`).all(+almoxarifado_id);
  const a = db.prepare('SELECT nome FROM almoxarifado WHERE id=?').get(+almoxarifado_id);
  for(const n of niveis){ n.codigo = codigoNivel(n.id); n.nome = (a ? a.nome : '') + ' · ' + n.haste + ' · ' + n.andar + ' · ' + n.nivel; }
  return { niveis };
}
function acharNivel(db, b){
  let id = null;
  if(b.nivel_id != null && b.nivel_id !== '') id = +b.nivel_id;
  else if(b.nivel){ const m = String(b.nivel).trim().toUpperCase().match(/^E-?(\d{1,9})$/); if(m) id = +m[1]; }
  if(!id) throw new Recusa(400, 'bipe ou escolha o endereço novo');
  const n = db.prepare('SELECT n.id, n.ativo, h.almoxarifado_id FROM alm_nivel n JOIN alm_andar d ON d.id=n.andar_id JOIN alm_haste h ON h.id=d.haste_id WHERE n.id=?').get(id);
  if(!n) throw new Recusa(404, 'endereço ' + (b.nivel || id) + ' não existe');
  return n;
}
function noNivel(db, codigo){
  const m = String(codigo || '').trim().toUpperCase().match(/^E-?(\d{1,9})$/);
  if(!m) throw new Recusa(400, 'isto não é um código de endereço (E-000000)');
  const id = +m[1];
  const nome = nomeNivel(db, id);
  if(!nome) throw new Recusa(404, 'endereço não existe');
  const volumes = db.prepare(`SELECT v.codigo, v.saldo, c.nome material, c.unidade FROM volume_material v JOIN componente c ON c.id=v.componente_id
    WHERE v.nivel_id=? AND v.situacao<>'encerrado' ORDER BY v.id`).all(id);
  const fora = module.exports.foraDoPcp ? module.exports.foraDoPcp(db, id) : [];
  return { id, codigo:codigoNivel(id), nome, volumes, fora };
}

/* ── VOLUMES ────────────────────────────────────────────────────────────── */
function proximoCodigo(db){
  const r = db.prepare("SELECT codigo FROM volume_material WHERE codigo LIKE 'M-%' ORDER BY id DESC LIMIT 1").get();
  return 'M-' + pad(r ? (parseInt(r.codigo.replace(/\D/g, ''), 10) || 0) + 1 : 1);
}
function evento(db, volume_id, tipo, de, para, quem, obs){
  db.prepare('INSERT INTO volume_evento (volume_id, tipo, de_nivel_id, para_nivel_id, obs, usuario_id, usuario_nome) VALUES (?,?,?,?,?,?,?)')
    .run(volume_id, tipo, de || null, para || null, obs || null, quem && quem.id || null, quem && quem.nome || null);
}
/* Chamada DENTRO da transacao do recebimento (recebimento_dominio). */
function criarVolumes(db, a){
  const out = [];
  for(const v of a.volumes){
    const codigo = proximoCodigo(db);
    const id = db.prepare(`INSERT INTO volume_material (codigo, componente_id, recebimento_item_id, qtd_inicial, saldo, metragem, codigo_fornecedor,
        almoxarifado_id, situacao, criado_por, criado_por_id) VALUES (?,?,?,?,?,?,?,?,'guardado',?,?)`)
      .run(codigo, a.componente_id, a.recebimento_item_id, v.metragem, v.metragem, v.metragem, v.codigo_fornecedor || null, a.almoxarifado_id || null,
        a.quem && a.quem.nome || null, a.quem && a.quem.id || null).lastInsertRowid;
    evento(db, id, 'recebido', null, null, a.quem);
    out.push({ id, codigo, metragem:v.metragem });
  }
  return out;
}
function porCodigo(db, codigo){
  const v = db.prepare(`SELECT v.*, c.nome material, c.unidade, c.um_por_nivel FROM volume_material v JOIN componente c ON c.id=v.componente_id
    WHERE UPPER(v.codigo)=UPPER(?)`).get(String(codigo || '').trim());
  if(!v) throw new Recusa(404, 'volume ' + codigo + ' não encontrado');
  return v;
}
function ler(db, codigo){
  const v = porCodigo(db, codigo);
  return { id:v.id, codigo:v.codigo, material:v.material, unidade:v.unidade, saldo:v.saldo, qtd_inicial:v.qtd_inicial, situacao:v.situacao,
    nivel_id:v.nivel_id, endereco: v.nivel_id ? nomeNivel(db, v.nivel_id) : null, criado_em:v.criado_em };
}
function listar(db, q){
  const w = ["v.situacao<>'encerrado'"], p = [];
  if(q.sem_endereco === '1') w.push('v.nivel_id IS NULL');
  if(q.almoxarifado_id){ w.push('v.almoxarifado_id=?'); p.push(+q.almoxarifado_id); }
  if(q.componente_id){ w.push('v.componente_id=?'); p.push(+q.componente_id); }
  const l = db.prepare(`SELECT v.id, v.codigo, v.saldo, v.situacao, v.nivel_id, v.almoxarifado_id, v.criado_em, c.nome material, c.unidade
    FROM volume_material v JOIN componente c ON c.id=v.componente_id WHERE ${w.join(' AND ')} ORDER BY v.id`).all(...p);
  for(const v of l) v.endereco = v.nivel_id ? nomeNivel(db, v.nivel_id) : null;
  return l;
}
function mover(db, codigo, b, quem){
  const v = porCodigo(db, codigo);
  if(v.situacao === 'encerrado') throw new Recusa(409, 'o volume ' + v.codigo + ' está encerrado — não se guarda nem se move');
  const n = acharNivel(db, b || {});
  if(!n.ativo) throw new Recusa(409, 'este endereço está desativado');
  if(v.nivel_id === n.id) return { codigo:v.codigo, endereco:nomeNivel(db, n.id), igual:true };
  if(v.um_por_nivel){
    const ocupa = db.prepare("SELECT codigo FROM volume_material WHERE nivel_id=? AND situacao<>'encerrado' AND id<>? LIMIT 1").get(n.id, v.id);
    if(ocupa) throw new Recusa(409, 'este nível já guarda o volume ' + ocupa.codigo + ' — cada nível guarda um só deste material');
    const fora = module.exports.foraDoPcp ? module.exports.foraDoPcp(db, n.id) : [];
    if(fora.length) throw new Recusa(409, 'este nível já guarda ' + fora[0] + ' (sob medida) — cada nível guarda um só');
  }
  db.transaction(() => {
    db.prepare('UPDATE volume_material SET nivel_id=?, almoxarifado_id=? WHERE id=?').run(n.id, n.almoxarifado_id, v.id);
    evento(db, v.id, v.nivel_id ? 'movido' : 'guardado', v.nivel_id, n.id, quem);
  })();
  return { codigo:v.codigo, endereco:nomeNivel(db, n.id) };
}
function abrir(db, codigo, quem){
  const v = porCodigo(db, codigo);
  if(v.situacao === 'encerrado') throw new Recusa(409, 'o volume ' + v.codigo + ' já foi aberto/encerrado em ' + (v.encerrado_em || '—'));
  db.transaction(() => {
    if(v.saldo > 0) DOM.movimentar(db, { componente_id:v.componente_id, delta:-v.saldo, motivo:'abertura', referencia:v.codigo,
      usuario_id:quem && quem.id, usuario_nome:quem && quem.nome });
    db.prepare("UPDATE volume_material SET situacao='encerrado', saldo=0, encerrado_em=datetime('now','localtime'), encerrado_por=?, encerrado_por_id=? WHERE id=?")
      .run(quem && quem.nome || null, quem && quem.id || null, v.id);
    evento(db, v.id, 'aberto', v.nivel_id, null, quem, 'consumido inteiro: ' + v.saldo + ' ' + (v.unidade || ''));
  })();
  return { codigo:v.codigo, saiu:v.saldo };
}
/* O saldo do material por volume = a soma dos volumes nao encerrados. */
function conferirSaldo(db, componente_id){
  const c = db.prepare('SELECT estoque FROM componente WHERE id=?').get(componente_id);
  const s = db.prepare("SELECT ROUND(COALESCE(SUM(saldo),0),3) s FROM volume_material WHERE componente_id=? AND situacao<>'encerrado'").get(componente_id).s;
  return { estoque:c ? c.estoque : null, volumes:s, bate: c && Math.abs((c.estoque || 0) - s) < 1e-6 };
}

module.exports = { Recusa, codigoNivel, nomeNivel, criarEnderecos, enderecos, acharNivel, noNivel, criarVolumes, ler, listar, mover, abrir, conferirSaldo, porCodigo, foraDoPcp:null };

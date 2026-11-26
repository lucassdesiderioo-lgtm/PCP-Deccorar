/* montagem_persiana.js — DONO UNICO da montagem da persiana da medida padrao,
 * a 107 Montagem (spec PRODUCAO-MAPA-E-MOTOR v7, §14.4, 25/11/2026).
 *
 *   montagem_lote  uma montagem de uma pessoa: o SKU, quantas, inicio, fim
 *   persiana       cada persiana: a etiqueta de SKU em serie (PS), o tecido e o
 *                  tubo cortados (corte_peca), quem montou, e a situacao
 *                  montando → montada (o carrinho da revisao) → revisada → embalada
 *
 * QUATRO BIPES POR PECA (o dono, 25/11/2026):
 *   ① a etiqueta de SKU em serie  ② o tecido  ③ o tubo   … monta …   ④ o SKU de novo
 * Com mais de uma: ①②③ de cada peca no inicio; cada peca fecha com o seu ④.
 * ② e ③ sao CONFERIDOS NA HORA contra a ficha: o tecido tem que ter sido
 * cortado para este SKU, e o tubo na medida de corte dele.
 *
 * ⚠️ E A MONTAGEM QUE LIGA a persiana ao tecido, ao tubo, a quem cortou cada um
 *    e a quem montou. A troca de etiqueta de SKU entre duas persianas montadas
 *    e possivel, e nada a pega (o dono aceita, §14.4).
 * ⚠️ Montar NAO mexe em saldo nem na fila da embalagem: a persiana vai para o
 *    carrinho da revisao, e o +1 continua na embalagem (R-EST-02).
 */
'use strict';
const ETQ = require('./etiqueta_producao');
const CORTE = require('./corte_bancada');
const { Recusa } = ETQ;

function garantirSchema(db){
  CORTE.garantirSchema(db);
  db.exec(`CREATE TABLE IF NOT EXISTS montagem_lote (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      sku TEXT NOT NULL, quantidade INTEGER NOT NULL,
      situacao TEXT NOT NULL DEFAULT 'aberto',
      inicio TEXT DEFAULT (datetime('now','localtime')), fim TEXT, segundos INTEGER,
      usuario_id INTEGER, usuario_nome TEXT)`);
  db.exec(`CREATE TABLE IF NOT EXISTS persiana (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      etiqueta_id INTEGER NOT NULL UNIQUE, codigo TEXT NOT NULL, sku TEXT NOT NULL, numero INTEGER NOT NULL,
      lote_id INTEGER, tecido_peca_id INTEGER, tubo_peca_id INTEGER,
      situacao TEXT NOT NULL DEFAULT 'montando',
      inicio TEXT DEFAULT (datetime('now','localtime')), fim TEXT,
      montada_por TEXT, montada_por_id INTEGER,
      revisao_id INTEGER, revisada_em TEXT, embalada_em TEXT,
      voltou_defeito INTEGER DEFAULT 0)`);
  /* a coluna no banco de antes desta revisao (③, 25/11/2026), no fim (§17) */
  const cols = db.prepare('PRAGMA table_info(persiana)').all().map(c => c.name);
  if(cols.indexOf('voltou_defeito') < 0) db.exec('ALTER TABLE persiana ADD COLUMN voltou_defeito INTEGER DEFAULT 0');
  db.exec(`CREATE INDEX IF NOT EXISTS ix_persiana_sku ON persiana(sku, situacao)`);
}

function pessoa(q){ q = q || {}; return { id: q.id == null ? null : q.id, nome: q.nome || null }; }
const LISTA = () => require('./producao_lista');

function pecasDoLote(db, lote_id){
  return db.prepare(`SELECT p.*, t.codigo tc_codigo, b.codigo tb_codigo FROM persiana p
    LEFT JOIN corte_peca ct ON ct.id=p.tecido_peca_id LEFT JOIN etiqueta_producao t ON t.id=ct.etiqueta_id
    LEFT JOIN corte_peca cb ON cb.id=p.tubo_peca_id LEFT JOIN etiqueta_producao b ON b.id=cb.etiqueta_id
    WHERE p.lote_id=? ORDER BY p.id`).all(lote_id);
}

function aberto(db, quem){
  const p = pessoa(quem);
  if(p.id == null) return null;
  const l = db.prepare("SELECT * FROM montagem_lote WHERE situacao='aberto' AND usuario_id=? ORDER BY id DESC LIMIT 1").get(p.id);
  if(!l) return null;
  l.pecas = pecasDoLote(db, l.id);
  const prontas = l.pecas.filter(x => x.tecido_peca_id && x.tubo_peca_id).length;
  /* A fase: enquanto faltar ①②③ de alguma peca, "preparo"; depois, "montando"
     (cada ④ fecha uma). */
  l.fase = (l.pecas.length < l.quantidade || prontas < l.quantidade) ? 'preparo' : 'montando';
  const atual = l.pecas.find(x => !(x.tecido_peca_id && x.tubo_peca_id));
  l.vez = l.fase === 'preparo' ? (atual ? (!atual.tecido_peca_id ? 'tecido' : 'tubo') : 'persiana') : 'fim';
  l.peca_vez = l.fase === 'preparo' ? (atual ? l.pecas.indexOf(atual) + 1 : l.pecas.length + 1) : null;
  return l;
}

/* O que cabe montar: o tecido e o tubo cortados na prateleira para este SKU. */
function cabe(db, sku){
  const L = LISTA();
  const info = L.pecasDoSku(db, sku);
  if(info.erro) return { erro:info.erro, n:0 };
  /* ③ REVISAO (25/11/2026): o que um lote aberto ainda vai tirar da prateleira
     (as pecas dele sem o ② ou sem o ③) ja esta prometido — sem descontar, duas
     pessoas abriam 3 cada com 3 cortados, e a segunda so descobria no ②. */
  const res = reservado(db);
  const tec = Math.max(0, (CORTE.naPrateleira(db, 'tecido')[info.tecido.item] || 0) - (res.tecido[info.tecido.item] || 0));
  let tubRes = 0;
  for(const k of Object.keys(res.tuboPorSku)){ const pi = L.pecasDoSku(db, k); if(!pi.erro && pi.tubo.item === info.tubo.item) tubRes += res.tuboPorSku[k]; }
  const tub = Math.max(0, (CORTE.naPrateleira(db, 'tubo')[info.tubo.item] || 0) - tubRes);
  return { n:Math.min(tec, tub), tecido:tec, tubo:tub, info,
    tecido_prateleira:CORTE.naPrateleira(db, 'tecido')[info.tecido.item] || 0, tubo_prateleira:CORTE.naPrateleira(db, 'tubo')[info.tubo.item] || 0 };
}
/* O que os lotes abertos ainda vao tirar da prateleira: por SKU, as pecas do
   lote que ainda nao tem o tecido (e o tubo). O tecido do item e o proprio SKU. */
function reservado(db){
  const tecido = {}, tuboPorSku = {};
  db.prepare(`SELECT l.sku, l.quantidade,
      (SELECT COUNT(*) FROM persiana p WHERE p.lote_id=l.id AND p.tecido_peca_id IS NOT NULL) ct,
      (SELECT COUNT(*) FROM persiana p WHERE p.lote_id=l.id AND p.tubo_peca_id IS NOT NULL) cb
    FROM montagem_lote l WHERE l.situacao='aberto'`).all().forEach(r => {
      tecido[r.sku] = (tecido[r.sku] || 0) + Math.max(0, r.quantidade - r.ct);
      tuboPorSku[r.sku] = (tuboPorSku[r.sku] || 0) + Math.max(0, r.quantidade - r.cb);
    });
  return { tecido, tuboPorSku };
}

function iniciar(db, d, quem){
  const p = pessoa(quem);
  const s = db.prepare('SELECT codigo FROM skus WHERE UPPER(codigo)=UPPER(?)').get(String(d.sku || ''));
  if(!s) throw new Recusa('Escolha na lista o que vai montar.', 404);
  const q = Number(d.quantidade);
  if(!Number.isInteger(q) || q < 1 || q > 99) throw new Recusa('A quantidade tem que ser um número de 1 a 99.');
  if(aberto(db, quem)) throw new Recusa('Termine ou cancele a montagem aberta antes.', 409);
  const c = cabe(db, s.codigo);
  if(c.erro) throw new Recusa(s.codigo + ': ' + c.erro);
  if(c.n < 1 && (c.tecido < 1 ? c.tecido_prateleira : c.tubo_prateleira) > 0)
    throw new Recusa('O ' + (c.tecido < 1 ? 'tecido' : 'tubo') + ' cortado para o ' + s.codigo + ' já está separado para outra montagem em andamento.', 409);
  if(c.n < 1) throw new Recusa('Não há ' + (c.tecido < 1 ? 'tecido' : 'tubo') + ' cortado para o ' + s.codigo + '. Ele precisa passar pel' + (c.tecido < 1 ? 'o corte de tecido (108)' : 'a serralheria (110)') + ' antes.', 409);
  if(q > c.n) throw new Recusa('Só há tecido e tubo cortados para ' + c.n + '.', 409);
  db.prepare('INSERT INTO montagem_lote (sku, quantidade, usuario_id, usuario_nome) VALUES (?,?,?,?)').run(s.codigo, q, p.id, p.nome);
  return aberto(db, quem);
}

function descr(db, tipo, item){ return LISTA().descreverItem(db, tipo, item); }

/* Cada bipe. Devolve o lote aberto (ou o fechado, no ultimo ④). */
function bipar(db, codigo, quem){
  const l = aberto(db, quem);
  if(!l) throw new Recusa('Nenhuma montagem aberta. Escolha na lista o que vai montar.', 409);
  const p = pessoa(quem);
  const t = ETQ.traduzir(db, codigo);
  const tipo = t ? t.tipo : null;
  const nomeVez = { persiana:'① a etiqueta de SKU', tecido:'② o tecido', tubo:'③ o tubo', fim:'④ a etiqueta de SKU de uma peça' };
  return db.transaction(() => {
    if(l.fase === 'montando'){
      if(tipo !== 'PS') throw new Recusa('Agora é ' + nomeVez.fim + ' que terminou.');
      const pc = l.pecas.find(x => x.etiqueta_id === t.id);
      if(!pc) throw new Recusa(ETQ.rotulo(t) + ' não é desta montagem.');
      if(pc.situacao !== 'montando') throw new Recusa(ETQ.rotulo(t) + ' já foi fechada.');
      db.prepare(`UPDATE persiana SET situacao='montada', fim=datetime('now','localtime'), montada_por=?, montada_por_id=? WHERE id=?`).run(p.nome, p.id, pc.id);
      const restam = db.prepare("SELECT COUNT(*) n FROM persiana WHERE lote_id=? AND situacao='montando'").get(l.id).n;
      if(!restam){
        db.prepare(`UPDATE montagem_lote SET situacao='fechado', fim=datetime('now','localtime'),
          segundos=CAST(ROUND((julianday(datetime('now','localtime')) - julianday(inicio)) * 86400) AS INTEGER) WHERE id=?`).run(l.id);
        return { fechado:db.prepare('SELECT * FROM montagem_lote WHERE id=?').get(l.id), pecas:pecasDoLote(db, l.id) };
      }
      return { aberto:aberto(db, quem) };
    }
    /* preparo */
    const esperado = l.vez === 'persiana' ? 'PS' : l.vez === 'tecido' ? 'TC' : 'TB';
    if(tipo !== esperado) throw new Recusa('Agora é ' + nomeVez[l.vez] + ' da peça ' + l.peca_vez + '.');
    if(l.vez === 'persiana'){
      if(t.desconhecida) throw new Recusa('Etiqueta não reconhecida: ' + t.codigo + '.', 404);
      if(t.sku !== l.sku) throw new Recusa(ETQ.rotulo(t) + ' é de outro SKU. Esta montagem é do ' + l.sku + '.');
      const e = ETQ.usar(db, t.codigo, 'PS');
      /* O tempo e do PRIMEIRO ① ao ultimo ④ (§14.4): o toque no cartao e o OK
         do teclado nao contam (③ REVISAO). */
      if(!l.pecas.length) db.prepare("UPDATE montagem_lote SET inicio=datetime('now','localtime') WHERE id=?").run(l.id);
      db.prepare(`INSERT INTO persiana (etiqueta_id, codigo, sku, numero, lote_id) VALUES (?,?,?,?,?)`).run(e.id, e.codigo, e.sku, e.numero, l.id);
      return { aberto:aberto(db, quem) };
    }
    const pc = l.pecas[l.peca_vez - 1];
    const peca = t.desconhecida ? null : db.prepare('SELECT * FROM corte_peca WHERE etiqueta_id=?').get(t.id);
    const rot = ETQ.rotulo(t.desconhecida ? { tipo:t.tipo, numero:+t.codigo.slice(2) } : t);
    if(!peca) throw new Recusa(rot + ' não foi cortado: a etiqueta não está ligada a nenhuma peça.', 409);
    if(peca.situacao !== 'prateleira') throw new Recusa(rot + (peca.situacao === 'montada' ? ' já foi usado em outra persiana.' : ' ainda está sendo cortado.'), 409);
    const info = LISTA().pecasDoSku(db, l.sku);
    const quer = l.vez === 'tecido' ? info.tecido.item : info.tubo.item;
    if(peca.item !== quer)
      throw new Recusa('Recusado: o ' + (l.vez === 'tecido' ? 'tecido ' : 'tubo ') + rot + ' foi cortado ' +
        (l.vez === 'tecido' ? 'como ' : 'para ') + descr(db, l.vez, peca.item) + '. O ' + l.sku + ' pede ' + descr(db, l.vez, quer) + '.', 409);
    db.prepare("UPDATE corte_peca SET situacao='montada', montada_em=datetime('now','localtime'), persiana_id=? WHERE id=?").run(pc.id, peca.id);
    db.prepare(`UPDATE persiana SET ${l.vez === 'tecido' ? 'tecido_peca_id' : 'tubo_peca_id'}=? WHERE id=?`).run(peca.id, pc.id);
    return { aberto:aberto(db, quem) };
  })();
}

/* Cancelar: nada fica; as etiquetas de SKU voltam a ficar livres, e o tecido e
   o tubo voltam para a prateleira. A peca ja fechada (④) fica montada. */
function cancelar(db, quem){
  const l = aberto(db, quem);
  if(!l) throw new Recusa('Nenhuma montagem aberta.', 409);
  db.transaction(() => {
    for(const pc of l.pecas.filter(x => x.situacao === 'montando')){
      ETQ.soltar(db, pc.etiqueta_id);
      db.prepare("UPDATE corte_peca SET situacao='prateleira', montada_em=NULL, persiana_id=NULL WHERE persiana_id=?").run(pc.id);
      db.prepare('DELETE FROM persiana WHERE id=?').run(pc.id);
    }
    const fechadas = db.prepare('SELECT COUNT(*) n FROM persiana WHERE lote_id=?').get(l.id).n;
    db.prepare(`UPDATE montagem_lote SET situacao=?, quantidade=CASE WHEN ?>0 THEN ? ELSE quantidade END, fim=datetime('now','localtime') WHERE id=?`)
      .run(fechadas ? 'fechado' : 'cancelado', fechadas, fechadas, l.id);
  })();
  return true;
}

/* No carrinho da revisao: montada e ainda nao revisada. */
function noCarrinho(db){
  const m = {};
  db.prepare("SELECT sku, COUNT(*) n FROM persiana WHERE situacao='montada' GROUP BY sku").all().forEach(r => { m[String(r.sku).toUpperCase()] = r.n; });
  return m;
}
/* O que os lotes abertos JA tiraram de cada lado (③ REVISAO, 25/11/2026): a
   persiana com a etiqueta de SKU ja bipada (o ①), com o tecido (②), com o
   tubo (③). A lista do corte desconta so isso — o resto do lote ainda esta na
   prateleira, e descontar o lote inteiro contaria a mesma peca duas vezes. */
function emMontagemBipado(db){
  const ps = {}, tecido = {}, tubo = {};
  db.prepare(`SELECT p.sku, COUNT(*) n, SUM(CASE WHEN p.tecido_peca_id IS NOT NULL THEN 1 ELSE 0 END) ct,
      SUM(CASE WHEN p.tubo_peca_id IS NOT NULL THEN 1 ELSE 0 END) cb
    FROM persiana p JOIN montagem_lote l ON l.id=p.lote_id WHERE l.situacao='aberto' AND p.situacao='montando' GROUP BY p.sku`).all()
    .forEach(r => { const k = String(r.sku).toUpperCase(); ps[k] = r.n; tecido[k] = r.ct; tubo[k] = r.cb; });
  return { ps, tecido, tubo };
}
/* Sendo montadas agora: o lote aberto inteiro, ja e trabalho na mao de alguem
   (a lista da 107 desconta isto). */
function emMontagem(db){
  const m = {};
  db.prepare(`SELECT l.sku, SUM(l.quantidade - (SELECT COUNT(*) FROM persiana p WHERE p.lote_id=l.id AND p.situacao<>'montando')) n
    FROM montagem_lote l WHERE l.situacao='aberto' GROUP BY l.sku`).all().forEach(r => { m[String(r.sku).toUpperCase()] = r.n; });
  return m;
}

/* A persiana de uma etiqueta em serie, com quem fez cada etapa (a revisao
   mostra os nomes no primeiro bipe; o rastreio, na fase 6). */
function porEtiqueta(db, codigo){
  const t = ETQ.traduzir(db, codigo);
  if(!t || t.tipo !== 'PS' || t.desconhecida) return null;
  const p = db.prepare('SELECT * FROM persiana WHERE etiqueta_id=?').get(t.id);
  if(!p) return { etiqueta:t, persiana:null };
  const corte = id => id == null ? null : db.prepare(`SELECT l.usuario_nome nome, l.usuario_id, l.fim em, e.codigo, e.numero, cp.item
    FROM corte_peca cp JOIN corte_lote l ON l.id=cp.lote_id JOIN etiqueta_producao e ON e.id=cp.etiqueta_id WHERE cp.id=?`).get(id);
  return { etiqueta:t, persiana:p, tecido:corte(p.tecido_peca_id), tubo:corte(p.tubo_peca_id),
    montagem:{ nome:p.montada_por, id:p.montada_por_id, em:p.fim } };
}

/* As montadas do dia de uma pessoa (o topo da tela). */
function doDia(db, quem){
  const p = pessoa(quem);
  return db.prepare(`SELECT COUNT(*) n FROM persiana WHERE situacao<>'montando' AND montada_por_id IS ? AND date(fim)=date('now','localtime')`).get(p.id).n;
}

/* A revisao (101) com a etiqueta em serie (§14.5). A persiana tem que estar
   no carrinho (montada, ainda nao revisada). Devolve o SKU dela, ou a recusa. */
function paraRevisar(db, codigo){
  const r = porEtiqueta(db, codigo);
  if(!r) return null;
  const rot = ETQ.rotulo(r.etiqueta);
  if(r.etiqueta.situacao === 'cancelada') throw new Recusa(rot + ' foi cancelada.', 409);
  if(!r.persiana) throw new Recusa(rot + ' ainda não passou pela montagem (107): monte a persiana antes de revisar.', 409);
  if(r.persiana.situacao === 'montando') throw new Recusa(rot + ' ainda está sendo montada.', 409);
  if(r.persiana.situacao === 'revisada'){
    /* ③ REVISAO (25/11/2026): a Embalagem ainda nao sabe QUAL persiana devolveu
       por defeito (fase 4): ela volta a linha mais antiga do SKU, e a persiana
       daquela revisao vai para o carrinho marcada `voltou_defeito`. Se e OUTRA
       que volta fisicamente a revisao, as duas trocam de lugar: esta passa a
       ser a revisada de volta ao carrinho, e a marcada fica com a revisao dela. */
    const troca = db.prepare("SELECT id FROM persiana WHERE sku=? AND situacao='montada' AND voltou_defeito=1 ORDER BY id LIMIT 1").get(r.persiana.sku);
    if(!troca) throw new Recusa(rot + ' já foi revisada.', 409);
    r.troca = troca.id;
    return r;
  }
  if(r.persiana.situacao !== 'montada' && r.persiana.situacao !== 'problema') throw new Recusa(rot + ' já foi revisada.', 409);
  return r;
}
function revisada(db, persiana_id, revisao_id, troca){
  if(troca){
    const p = db.prepare('SELECT revisao_id, revisada_em FROM persiana WHERE id=?').get(persiana_id);
    db.prepare("UPDATE persiana SET situacao='revisada', revisao_id=?, revisada_em=?, voltou_defeito=0 WHERE id=?").run(p.revisao_id, p.revisada_em, troca);
    db.prepare("UPDATE persiana SET situacao='montada', revisao_id=NULL, revisada_em=NULL WHERE id=?").run(persiana_id);
  }
  db.prepare("UPDATE persiana SET situacao='revisada', revisao_id=?, revisada_em=datetime('now','localtime'), voltou_defeito=0 WHERE id=? AND situacao IN ('montada','problema')").run(revisao_id, persiana_id);
}
/* A peca com problema na revisao (R-REV-06): a persiana sai do carrinho (a lista
   do corte e da montagem voltam a pedir a peca), e volta a ser revisavel quando
   for consertada. Quem a devolve a quem fez a etapa e a fase 5. */
function comProblema(db, codigo){
  const r = porEtiqueta(db, codigo);
  if(!r || !r.persiana || r.persiana.situacao !== 'montada') return false;
  db.prepare("UPDATE persiana SET situacao='problema' WHERE id=?").run(r.persiana.id);
  return true;
}
/* A revisao apagada (o "Desfazer", a peca devolvida pela embalagem) devolve a
   persiana ao carrinho da revisao. Sem a tabela (banco antigo, teste), nada. */
function revisaoApagada(db, revisao_id, porDefeito){
  try{ db.prepare("UPDATE persiana SET situacao='montada', revisao_id=NULL, revisada_em=NULL, voltou_defeito=? WHERE revisao_id=?").run(porDefeito ? 1 : 0, revisao_id); }
  catch(e){ if(!/no such table/.test(e.message)) throw e; }
}

module.exports = { Recusa, garantirSchema, paraRevisar, revisada, revisaoApagada, comProblema, emMontagemBipado, reservado, aberto, iniciar, bipar, cancelar, noCarrinho, emMontagem, porEtiqueta, cabe, doDia };

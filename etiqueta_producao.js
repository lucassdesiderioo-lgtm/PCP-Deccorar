/* etiqueta_producao.js — DONO UNICO das etiquetas da producao da medida padrao
 * (spec PRODUCAO-MAPA-E-MOTOR v7, §14.2 e §14.3, 25/11/2026).
 *
 * Tres tipos, numa tabela so (`etiqueta_producao`):
 *
 *   TC  tecido   maco EM BRANCO, sequencial (TC 000123), sem medida. O corte de
 *                tecido (108) liga a etiqueta a peca no bipe.
 *   TB  tubo     idem, para a serralheria (110).
 *   PS  persiana a etiqueta de SKU EM SERIE, por fora do saco: o formato da
 *                etiqueta de SKU de hoje com o "Nº 45". A sequencia e POR SKU
 *                (o dono: "vai ser mais intuitivo"); o CODIGO DE BARRAS e o
 *                numero da etiqueta na fabrica (PS + 8 digitos), que nao vai
 *                escrito: o codigo do SKU e livre (§7) e o leitor tira espaco e
 *                hifen — "SKU-41" chegaria como outro SKU.
 *
 * ⚠️ O NUMERO NUNCA VOLTA E NUNCA SE REAPROVEITA, nem o da etiqueta cancelada.
 * ⚠️ O TRADUTOR MORA AQUI (`traduzir`): toda tela que bipa SKU pergunta a ele,
 *    e o codigo em serie vira SKU + Nº. A etiqueta comum continua aceita.
 * ⚠️ Imprimir NAO mexe em saldo, fila nem estoque: etiqueta e papel. Quem liga a
 *    etiqueta a uma peca e o corte (`usar`) e a montagem.
 */
'use strict';

class Recusa extends Error { constructor(msg, status){ super(msg); this.status = status || 400; } }

const TIPOS = { TC:'tecido', TB:'tubo', PS:'persiana' };
const PARTES = ['dia', 'proximos', 'alvo', 'fora', 'maco', 'entrada'];
/* Os motivos do "fora do planejamento" (o dono, 25/11/2026). */
const MOTIVOS_FORA = ['Peça com defeito para refazer', 'Reposição de perda', 'Teste', 'Outro'];
/* O teto de uma impressao: a diferenca entre "errei uma etiqueta" e "errei o
   rolo" (o mesmo da etiqueta de SKU, sku_etq_pdf.js). */
const MAX = 200;
/* Os dias que uma etiqueta impressa fica parada antes de ficar ambar na lista
   das nao usadas. O dono: 15, mudavel na 906 Parametros. */
const DIAS_PARADA_PADRAO = 15;

function garantirSchema(db){
  db.exec(`CREATE TABLE IF NOT EXISTS etiqueta_impressao (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      em TEXT DEFAULT (datetime('now','localtime')),
      por TEXT, por_id INTEGER,
      tipo TEXT NOT NULL, parte TEXT, descricao TEXT, quantidade INTEGER NOT NULL,
      reimpressao INTEGER DEFAULT 0)`);
  db.exec(`CREATE TABLE IF NOT EXISTS etiqueta_producao (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      tipo TEXT NOT NULL,
      numero INTEGER NOT NULL,
      codigo TEXT NOT NULL UNIQUE,
      sku TEXT,
      parte TEXT,
      fora_motivo TEXT,
      impressao_id INTEGER,
      situacao TEXT NOT NULL DEFAULT 'livre',
      usada_em TEXT,
      cancelada_em TEXT, cancelada_por TEXT, cancelada_por_id INTEGER, cancelada_motivo TEXT,
      criada_em TEXT DEFAULT (datetime('now','localtime')))`);
  db.exec(`CREATE INDEX IF NOT EXISTS ix_etqprod_tipo ON etiqueta_producao(tipo, situacao)`);
  db.exec(`CREATE INDEX IF NOT EXISTS ix_etqprod_sku ON etiqueta_producao(sku, tipo)`);
  db.exec(`CREATE TABLE IF NOT EXISTS config (chave TEXT PRIMARY KEY, valor TEXT)`);
}

const pad = (n, w) => String(n).padStart(w, '0');
/* O que vai no codigo de barras. Letras e digitos so: o leitor limpa o resto. */
function codigoDe(tipo, n){ return tipo === 'PS' ? 'PS' + pad(n, 8) : tipo + pad(n, 6); }
/* O que se le escrito na etiqueta de tecido e de tubo. */
function rotulo(e){
  if(!e) return '';
  if(e.tipo === 'PS') return e.sku + ' Nº ' + e.numero;
  return e.tipo + ' ' + pad(e.numero, 6);
}
const limpar = c => String(c == null ? '' : c).toUpperCase().replace(/[^A-Z0-9]/g, '');
/* Os codigos reservados: o cadastro de SKU recusa um codigo com esta forma
   (sku_cad_route.js), senao o bipe nao saberia se e SKU ou etiqueta. */
const RESERVADO = /^(PS\d{8}|T[CB]\d{6,})$/;
const reservado = c => RESERVADO.test(limpar(c));

function pessoa(q){ q = q || {}; return { id: q.id == null ? null : q.id, nome: q.nome || null }; }

function inteiro(v, nome){
  const n = Number(v);
  if(!Number.isInteger(n) || n < 1 || n > MAX) throw new Recusa('A quantidade ' + (nome ? 'de ' + nome + ' ' : '') + 'tem que ser um número de 1 a ' + MAX + '.');
  return n;
}

function registrarImpressao(db, tipo, parte, descricao, qtd, quem, reimpressao){
  const p = pessoa(quem);
  return db.prepare(`INSERT INTO etiqueta_impressao (por, por_id, tipo, parte, descricao, quantidade, reimpressao)
    VALUES (?,?,?,?,?,?,?)`).run(p.nome, p.id, tipo, parte || null, descricao || null, qtd, reimpressao ? 1 : 0).lastInsertRowid;
}

/* O maco em branco de tecido ou de tubo. */
function imprimirMaco(db, tipo, quantidade, quem){
  if(tipo !== 'TC' && tipo !== 'TB') throw new Recusa('Tipo de maço desconhecido: ' + tipo + '.');
  const q = inteiro(quantidade);
  return db.transaction(() => {
    const ult = db.prepare('SELECT COALESCE(MAX(numero),0) n FROM etiqueta_producao WHERE tipo=?').get(tipo).n;
    const imp = registrarImpressao(db, tipo, 'maco', 'Maço de ' + TIPOS[tipo], q, quem);
    const ins = db.prepare(`INSERT INTO etiqueta_producao (tipo, numero, codigo, parte, impressao_id) VALUES (?,?,?,?,?)`);
    const out = [];
    for(let i = 1; i <= q; i++){
      const n = ult + i, c = codigoDe(tipo, n);
      out.push(db.prepare('SELECT * FROM etiqueta_producao WHERE id=?').get(ins.run(tipo, n, c, 'maco', imp).lastInsertRowid));
    }
    return { impressao_id:imp, etiquetas:out };
  })();
}

/* As etiquetas de SKU em serie. `itens` = [{ sku, quantidade }]. `parte` diz de
   onde veio (dia, proximos, alvo, fora, entrada); o fora do planejamento exige
   o motivo da lista. Quem decide QUANTAS e a conta do planejamento
   (producao_lista.js), nao esta funcao: aqui so se numera e se grava. */
function imprimirPersianas(db, itens, parte, quem, motivo){
  if(PARTES.indexOf(parte) < 0 || parte === 'maco') throw new Recusa('Parte desconhecida: ' + parte + '.');
  if(!Array.isArray(itens) || !itens.length) throw new Recusa('Nada para imprimir.');
  let fora = null;
  if(parte === 'fora'){
    const m = String(motivo || '').trim();
    if(!m) throw new Recusa('Fora do planejamento pede o motivo.');
    fora = m;
  }
  const lista = itens.map(it => {
    const s = db.prepare('SELECT codigo FROM skus WHERE UPPER(codigo)=UPPER(?)').get(String(it.sku || ''));
    if(!s) throw new Recusa('SKU não cadastrado: ' + it.sku + '.', 404);
    return { sku:s.codigo, q:inteiro(it.quantidade, s.codigo) };
  });
  const total = lista.reduce((a, x) => a + x.q, 0);
  if(total > MAX) throw new Recusa('O máximo por vez são ' + MAX + ' etiquetas — divida em lotes.');
  return db.transaction(() => {
    const desc = lista.map(x => x.sku + ' × ' + x.q).join(' · ');
    const imp = registrarImpressao(db, 'PS', parte, desc, total, quem);
    const ins = db.prepare(`INSERT INTO etiqueta_producao (tipo, numero, codigo, sku, parte, fora_motivo, impressao_id)
      VALUES ('PS',?,?,?,?,?,?)`);
    const fix = db.prepare('UPDATE etiqueta_producao SET codigo=? WHERE id=?');
    const out = [];
    for(const x of lista){
      const ult = db.prepare("SELECT COALESCE(MAX(numero),0) n FROM etiqueta_producao WHERE tipo='PS' AND sku=?").get(x.sku).n;
      for(let i = 1; i <= x.q; i++){
        /* O codigo de barras e o id: provisorio e unico ate saber o id. */
        const id = ins.run(ult + i, 'PS-' + x.sku + '-' + (ult + i), x.sku, parte, fora, imp).lastInsertRowid;
        fix.run(codigoDe('PS', id), id);
        out.push(db.prepare('SELECT * FROM etiqueta_producao WHERE id=?').get(id));
      }
    }
    return { impressao_id:imp, etiquetas:out };
  })();
}

/* O TRADUTOR. Recebe o que o leitor mandou; devolve a etiqueta (com o SKU, no
   caso da persiana) ou null quando o codigo nao e etiqueta da producao — e a
   tela segue tratando como SKU, como sempre. */
function traduzir(db, codigo){
  const c = limpar(codigo);
  if(!RESERVADO.test(c)) return null;
  const e = db.prepare('SELECT * FROM etiqueta_producao WHERE codigo=?').get(c);
  if(!e) return { codigo:c, tipo:c.slice(0, 2), desconhecida:true };
  return Object.assign(e, { rotulo:rotulo(e) });
}
/* O SKU de um bipe: a persiana em serie vira o SKU dela; o resto volta como
   veio. Para as telas que so precisam do SKU (embalagem, conferencia...). */
function skuDoBipe(db, codigo){
  const t = traduzir(db, codigo);
  if(!t) return { sku:String(codigo == null ? '' : codigo).trim(), etiqueta:null };
  if(t.tipo !== 'PS' || t.desconhecida || !t.sku) return { sku:null, etiqueta:t };
  return { sku:t.sku, etiqueta:t };
}

/* Ligar a etiqueta a uma peca: so a LIVRE, do tipo certo. Quem chama abre a
   transacao (R-EST-07). */
function usar(db, codigo, tipo){
  const t = traduzir(db, codigo);
  if(!t || t.desconhecida) throw new Recusa('Etiqueta não reconhecida: ' + limpar(codigo) + '.', 404);
  if(t.tipo !== tipo) throw new Recusa(rotulo(t) + ' não é etiqueta de ' + TIPOS[tipo] + '.');
  if(t.situacao === 'cancelada') throw new Recusa(rotulo(t) + ' foi cancelada (' + (t.cancelada_motivo || 'sem motivo') + ').', 409);
  if(t.situacao !== 'livre') throw new Recusa(rotulo(t) + ' já foi usada' + ondeUsada(db, t) + '.', 409);
  db.prepare("UPDATE etiqueta_producao SET situacao='usada', usada_em=datetime('now','localtime') WHERE id=? AND situacao='livre'").run(t.id);
  return t;
}
/* "em 25/11 às 17:53, por Ana, como 1,50 × 1,50 BEGE" — a recusa diz quando,
   por quem e como (§14.4), com a data de fabrica e nao a do banco (③ REVISAO). */
function ondeUsada(db, t){
  const quando = t.usada_em ? ' em ' + t.usada_em.slice(8, 10) + '/' + t.usada_em.slice(5, 7) + ' às ' + t.usada_em.slice(11, 16) : '';
  let quem = '', como = '';
  try{
    if(t.tipo === 'PS'){
      const p = db.prepare('SELECT montada_por FROM persiana WHERE etiqueta_id=?').get(t.id);
      if(p && p.montada_por) quem = ', por ' + p.montada_por;
      como = ', na persiana ' + rotulo(t);
    } else {
      const c = db.prepare('SELECT l.usuario_nome, l.descricao FROM corte_peca cp JOIN corte_lote l ON l.id=cp.lote_id WHERE cp.etiqueta_id=?').get(t.id);
      if(c){ if(c.usuario_nome) quem = ', por ' + c.usuario_nome; if(c.descricao) como = ', como ' + c.descricao; }
    }
  }catch(e){}
  return quando + quem + como;
}
/* A proxima etiqueta LIVRE do maco (a de cima da mesa), para a bancada. A
   `proxima` e o proximo numero a IMPRIMIR, para a 401. */
function proximaLivre(db, tipo){
  const r = db.prepare("SELECT MIN(numero) n FROM etiqueta_producao WHERE tipo=? AND situacao='livre'").get(tipo);
  return r && r.n ? tipo + ' ' + pad(r.n, 6) : null;
}

/* Devolver ao maco a etiqueta de um corte cancelado. */
function soltar(db, id){
  db.prepare("UPDATE etiqueta_producao SET situacao='livre', usada_em=NULL WHERE id=? AND situacao='usada'").run(id);
}

function cancelar(db, ids, motivo, quem){
  const m = String(motivo || '').trim();
  if(!m) throw new Recusa('Cancelar pede o motivo.');
  if(!Array.isArray(ids) || !ids.length) throw new Recusa('Marque uma etiqueta para cancelar.');
  const p = pessoa(quem);
  return db.transaction(() => {
    let n = 0;
    for(const id of ids){
      const e = db.prepare('SELECT * FROM etiqueta_producao WHERE id=?').get(+id);
      if(!e) throw new Recusa('Etiqueta não encontrada: ' + id + '.', 404);
      if(e.situacao !== 'livre') throw new Recusa(rotulo(e) + ' não está livre: ' + (e.situacao === 'usada' ? 'já foi usada' : 'já está cancelada') + '.', 409);
      db.prepare(`UPDATE etiqueta_producao SET situacao='cancelada', cancelada_em=datetime('now','localtime'),
        cancelada_por=?, cancelada_por_id=?, cancelada_motivo=? WHERE id=?`).run(p.nome, p.id, m, e.id);
      n++;
    }
    return n;
  })();
}

function diasParada(db){
  const r = db.prepare("SELECT valor FROM config WHERE chave='etiqueta_parada_dias'").get();
  const n = r ? parseInt(r.valor, 10) : NaN;
  return Number.isInteger(n) && n >= 1 ? n : DIAS_PARADA_PADRAO;
}

/* As impressas e ainda nao usadas, a mais velha em cima. */
function naoUsadas(db){
  const lim = diasParada(db);
  return db.prepare(`SELECT e.*, i.por imprimiu, CAST(julianday(date('now','localtime')) - julianday(date(e.criada_em)) AS INTEGER) dias
    FROM etiqueta_producao e LEFT JOIN etiqueta_impressao i ON i.id=e.impressao_id
    WHERE e.situacao='livre' ORDER BY e.criada_em, e.id`).all()
    .map(e => Object.assign(e, { rotulo:rotulo(e), parada: e.dias > lim }));
}
/* Quantas de cada tipo estao livres (o "sobram N na mesa" do maco). */
function livres(db, tipo){
  return db.prepare("SELECT COUNT(*) n FROM etiqueta_producao WHERE tipo=? AND situacao='livre'").get(tipo).n;
}
function proxima(db, tipo){
  const n = db.prepare('SELECT COALESCE(MAX(numero),0) n FROM etiqueta_producao WHERE tipo=?').get(tipo).n + 1;
  return { numero:n, rotulo: tipo + ' ' + pad(n, 6) };
}

function historico(db, dia){
  return db.prepare(`SELECT i.*, (SELECT GROUP_CONCAT(x, ' · ') FROM (
      SELECT CASE WHEN tipo='PS' THEN sku || ' Nº ' || MIN(numero) || CASE WHEN MAX(numero)>MIN(numero) THEN '–' || MAX(numero) ELSE '' END
                  ELSE tipo || ' ' || printf('%06d', MIN(numero)) || CASE WHEN MAX(numero)>MIN(numero) THEN ' a ' || printf('%06d', MAX(numero)) ELSE '' END END x
      FROM etiqueta_producao e WHERE e.impressao_id=i.id GROUP BY COALESCE(sku, tipo))) numeros
    FROM etiqueta_impressao i WHERE date(i.em)=COALESCE(?, date('now','localtime')) ORDER BY i.id DESC`).all(dia || null);
}

/* As etiquetas para reimprimir (perdida ou estragada depois de colada): o
   MESMO numero. Cancelada nao se reimprime. A reimpressao vira linha no
   historico, sem criar etiqueta. */
function paraReimprimir(db, ids, quem){
  if(!Array.isArray(ids) || !ids.length) throw new Recusa('Diga qual etiqueta reimprimir.');
  if(ids.length > MAX) throw new Recusa('O máximo por vez são ' + MAX + ' etiquetas.');
  const l = ids.map(id => {
    const e = db.prepare('SELECT * FROM etiqueta_producao WHERE id=?').get(+id);
    if(!e) throw new Recusa('Etiqueta não encontrada: ' + id + '.', 404);
    if(e.situacao === 'cancelada') throw new Recusa(rotulo(e) + ' foi cancelada: não se reimprime.', 409);
    return e;
  });
  const tipo = l[0].tipo;
  if(l.some(e => e.tipo !== tipo)) throw new Recusa('Reimprima um tipo de etiqueta por vez.');
  registrarImpressao(db, tipo, null, 'Reimpressão: ' + l.map(rotulo).join(' · '), l.length, quem, true);
  return l;
}

/* Achar uma etiqueta pelo que a pessoa escreve para reimprimir: o codigo de
   barras, "TC 000123" ou "BK160140BEGE Nº 45" (a etiqueta perdida nao se bipa). */
function buscar(db, texto){
  const t = String(texto == null ? '' : texto).trim();
  if(!t) return null;
  const direto = traduzir(db, t);
  if(direto && !direto.desconhecida) return direto;
  let m = t.toUpperCase().match(/^(TC|TB)\s*0*(\d+)$/);
  if(m) return db.prepare('SELECT * FROM etiqueta_producao WHERE tipo=? AND numero=?').get(m[1], +m[2]) || null;
  m = t.match(/^(.+?)\s+(?:N[ºo°.]?\s*)?(\d+)$/i);
  if(m){
    const s = db.prepare('SELECT codigo FROM skus WHERE UPPER(codigo)=UPPER(?)').get(m[1].trim());
    if(s) return db.prepare("SELECT * FROM etiqueta_producao WHERE tipo='PS' AND sku=? AND numero=?").get(s.codigo, +m[2]) || null;
  }
  return null;
}

module.exports = { Recusa, buscar, proximaLivre, TIPOS, PARTES, MOTIVOS_FORA, MAX, DIAS_PARADA_PADRAO, garantirSchema,
  codigoDe, rotulo, limpar, reservado, traduzir, skuDoBipe, usar, soltar,
  imprimirMaco, imprimirPersianas, cancelar, naoUsadas, livres, proxima, historico, paraReimprimir, diasParada };

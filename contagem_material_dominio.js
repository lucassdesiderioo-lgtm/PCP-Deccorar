/* A CONTAGEM DE MATERIAL E O CONSUMO — spec COMPRAS-E-RECEBIMENTO, fase 6
 * (R-CMP-42 a 45). Dono unico de: a contagem por almoxarifado (uma pessoa,
 * cega), as linhas (inteiros e cortados), a tolerancia que aplica sozinha, a
 * aprovacao do que passou dela, o consumo pela contagem e a media de compra.
 *
 * ⚠️ CEGA: o saldo nao viaja para quem conta, nem pelo JSON.
 * ⚠️ ZERO E LANCAMENTO VALIDO; NAO CONTADO NAO E ZERO. So o material com linha
 * lancada entra no resultado — quem ficou de fora nao vira "acabou".
 * ⚠️ A CORRECAO APLICA A DIFERENCA SOBRE O SALDO DE AGORA (R-EST-16), pelo
 * `componente_dominio.js` (motivo `contagem`). Material POR VOLUME nunca e
 * ajustado aqui: o saldo dele e a soma dos volumes (R-CMP-39); a diferenca vai
 * para quem aprova, e a correcao e abrir/encerrar o volume na 503.
 * ⚠️ O CONSUMO COM UMA CONTAGEM SO E `null`, NUNCA ZERO (R-CMP-44).
 */
const DOM = require('./componente_dominio');

class Recusa extends Error{ constructor(status, msg){ super(msg); this.status = status; } }
const r3 = n => Math.round(n * 1000) / 1000;
const num = v => { if(v === null || v === undefined || v === '') return null; const n = parseFloat(String(v).replace(',', '.')); return Number.isFinite(n) ? n : NaN; };

function abrir(db, almoxarifado_id, quem){
  const a = db.prepare('SELECT id, nome, ativo FROM almoxarifado WHERE id=?').get(+almoxarifado_id);
  if(!a) throw new Recusa(404, 'almoxarifado não encontrado');
  const aberta = db.prepare("SELECT id, usuario_nome FROM contagem_material WHERE almoxarifado_id=? AND situacao='aberta'").get(a.id);
  if(aberta) throw new Recusa(409, 'o ' + a.nome + ' já tem uma contagem aberta (de ' + (aberta.usuario_nome || '—') + ')');
  const id = db.prepare("INSERT INTO contagem_material (almoxarifado_id, situacao, usuario_id, usuario_nome) VALUES (?, 'aberta', ?, ?)")
    .run(a.id, quem && quem.id || null, quem && quem.nome || null).lastInsertRowid;
  return { id };
}
function cabeca(db, id){
  const c = db.prepare('SELECT * FROM contagem_material WHERE id=?').get(+id);
  if(!c) throw new Recusa(404, 'contagem não encontrada');
  return c;
}
function exigirQuemAbriu(c, quem){
  if(!quem || +c.usuario_id !== +quem.id) throw new Recusa(403, 'esta contagem é de ' + (c.usuario_nome || 'outra pessoa') + ': a contagem é de uma pessoa só');
}
function materiais(db, almoxarifado_id){
  return db.prepare(`SELECT id componente_id, nome, unidade, modo_saldo FROM componente
    WHERE ativo=1 AND almoxarifado_id=? AND modo_saldo IN ('quantidade','volume') ORDER BY nome`).all(almoxarifado_id);
}
/* O que vai para QUEM CONTA: nome, unidade e o que ele mesmo lancou. Nada do saldo. */
function ler(db, id){
  const c = cabeca(db, id);
  const a = db.prepare('SELECT nome FROM almoxarifado WHERE id=?').get(c.almoxarifado_id);
  const itens = materiais(db, c.almoxarifado_id).map(m => {
    const linhas = db.prepare('SELECT id, tipo, medida_m, quantidade FROM contagem_material_linha WHERE contagem_id=? AND componente_id=? ORDER BY id').all(c.id, m.componente_id);
    return { componente_id:m.componente_id, nome:m.nome, unidade:m.unidade, modo:m.modo_saldo, linhas,
      contado: linhas.length ? r3(linhas.reduce((s, l) => s + valor(m.unidade, l), 0)) : null };
  });
  return { id:c.id, almoxarifado:a ? a.nome : null, situacao:c.situacao, aberta_em:c.aberta_em, usuario_nome:c.usuario_nome, itens };
}
function valor(unidade, l){ return (unidade === 'm' ? (l.medida_m || 0) : 1) * l.quantidade; }

function linha(db, id, b, quem){
  const c = cabeca(db, id);
  if(c.situacao !== 'aberta') throw new Recusa(409, 'esta contagem já terminou');
  exigirQuemAbriu(c, quem);
  const m = db.prepare('SELECT id, nome, unidade, almoxarifado_id, modo_saldo FROM componente WHERE id=?').get(+b.componente_id);
  if(!m || m.almoxarifado_id !== c.almoxarifado_id || ['quantidade', 'volume'].indexOf(m.modo_saldo) < 0) throw new Recusa(400, 'este material não é contado neste almoxarifado');
  const tipo = b.tipo || 'inteiro';
  if(['inteiro', 'cortado'].indexOf(tipo) < 0) throw new Recusa(400, 'a linha é de barras inteiras ou de cortados');
  if(tipo === 'cortado' && m.unidade !== 'm') throw new Recusa(400, 'só material em metro tem "cortados" — ' + m.nome + ' se conta em ' + (m.unidade || 'unidade'));
  const q = num(b.quantidade);
  if(q === null || Number.isNaN(q) || q < 0) throw new Recusa(400, 'a quantidade tem que ser um número maior ou igual a zero');
  let med = null;
  if(m.unidade === 'm'){
    med = num(b.medida_m);
    if(med === null || Number.isNaN(med) || med <= 0) throw new Recusa(400, (tipo === 'cortado' ? 'diga a medida do cortado' : 'diga a medida da barra inteira') + ' em metros');
  }
  /* O SALDO DO SISTEMA E O DA HORA EM QUE O MATERIAL COMECOU A SER CONTADO
     (R-EST-16): o que entrar depois disso nao vira "sobra" da contagem — a
     diferenca e contra o que havia quando a pessoa olhou a prateleira, e se
     aplica sobre o saldo de agora. Nunca vai para a tela. */
  const sis = (db.prepare('SELECT estoque FROM componente WHERE id=?').get(m.id) || {}).estoque || 0;
  const lid = db.prepare('INSERT INTO contagem_material_linha (contagem_id, componente_id, tipo, medida_m, quantidade, usuario_id, sistema) VALUES (?,?,?,?,?,?,?)')
    .run(c.id, m.id, tipo, med, q, quem && quem.id || null, sis).lastInsertRowid;
  return { id:lid };
}
function tirarLinha(db, lid, quem){
  const l = db.prepare('SELECT l.*, c.situacao, c.usuario_id quem_abriu, c.usuario_nome FROM contagem_material_linha l JOIN contagem_material c ON c.id=l.contagem_id WHERE l.id=?').get(+lid);
  if(!l) throw new Recusa(404, 'linha não encontrada');
  if(l.situacao !== 'aberta') throw new Recusa(409, 'esta contagem já terminou');
  exigirQuemAbriu({ usuario_id:l.quem_abriu, usuario_nome:l.usuario_nome }, quem);
  db.prepare('DELETE FROM contagem_material_linha WHERE id=?').run(l.id);
  return {};
}

function terminar(db, id, quem){
  const c = cabeca(db, id);
  if(c.situacao !== 'aberta') throw new Recusa(409, 'esta contagem já terminou');
  exigirQuemAbriu(c, quem);
  const r = { aplicados:0, pendentes:0, iguais:0 };
  db.transaction(() => {
    for(const m of materiais(db, c.almoxarifado_id)){
      const linhas = db.prepare('SELECT * FROM contagem_material_linha WHERE contagem_id=? AND componente_id=? ORDER BY id').all(c.id, m.componente_id);
      if(!linhas.length) continue;   // nao contado nao e zero
      const comp = db.prepare('SELECT estoque, tol_aviso_pct FROM componente WHERE id=?').get(m.componente_id);
      const contado = r3(linhas.reduce((s, l) => s + valor(m.unidade, l), 0));
      const sistema = r3(+(linhas[0].sistema != null ? linhas[0].sistema : comp.estoque) || 0);   // o da primeira linha
      const dif = r3(contado - sistema);
      const base = Math.max(Math.abs(sistema), Math.abs(contado));
      const pct = base > 0 ? Math.round(Math.abs(dif) / base * 100000) / 1000 : 0;
      const tol = comp.tol_aviso_pct != null ? comp.tol_aviso_pct : 2;
      let sit;
      if(dif === 0){ sit = 'igual'; r.iguais++; }
      else if(pct <= tol && m.modo_saldo !== 'volume'){
        DOM.movimentar(db, { componente_id:m.componente_id, delta:dif, motivo:'contagem', referencia:'contagem de material #' + c.id,
          usuario_id:c.usuario_id, usuario_nome:c.usuario_nome });
        sit = 'aplicado'; r.aplicados++;
      }else{ sit = 'pendente'; r.pendentes++; }
      db.prepare(`INSERT INTO contagem_material_item (contagem_id, componente_id, contado, sistema, diferenca, diferenca_pct, situacao, contado_em)
        VALUES (?,?,?,?,?,?,?, datetime('now','localtime'))`).run(c.id, m.componente_id, contado, sistema, dif, pct, sit);
    }
    db.prepare("UPDATE contagem_material SET situacao='terminada', terminada_em=datetime('now','localtime') WHERE id=?").run(c.id);
  })();
  return r;
}

function pendentes(db){
  return db.prepare(`SELECT i.*, c.usuario_nome contado_por, c.usuario_id contado_por_id, co.nome, co.unidade, co.modo_saldo, a.nome almoxarifado
    FROM contagem_material_item i JOIN contagem_material c ON c.id=i.contagem_id JOIN componente co ON co.id=i.componente_id
    LEFT JOIN almoxarifado a ON a.id=c.almoxarifado_id WHERE i.situacao='pendente' ORDER BY i.id`).all();
}
function decidir(db, iid, aprovar, motivo, quem){
  const i = db.prepare('SELECT i.*, c.usuario_id contou, co.modo_saldo FROM contagem_material_item i JOIN contagem_material c ON c.id=i.contagem_id JOIN componente co ON co.id=i.componente_id WHERE i.id=?').get(+iid);
  if(!i) throw new Recusa(404, 'item de contagem não encontrado');
  if(i.situacao !== 'pendente') throw new Recusa(409, 'este item já foi decidido (' + i.situacao + ')');
  if(quem && +i.contou === +quem.id) throw new Recusa(403, 'quem contou não aprova a própria contagem');
  const m = String(motivo || '').trim();
  if(!m) throw new Recusa(400, 'diga o motivo — ele fica gravado');
  db.transaction(() => {
    let sit = aprovar ? 'aprovado' : 'rejeitado';
    if(aprovar && i.modo_saldo !== 'volume' && i.diferenca)
      DOM.movimentar(db, { componente_id:i.componente_id, delta:i.diferenca, motivo:'contagem', referencia:'contagem de material #' + i.contagem_id + ' (aprovada)',
        usuario_id:quem && quem.id, usuario_nome:quem && quem.nome });
    if(aprovar && i.modo_saldo === 'volume') sit = 'ciente';
    db.prepare("UPDATE contagem_material_item SET situacao=?, decidido_por=?, decidido_por_id=?, decidido_em=datetime('now','localtime'), motivo=? WHERE id=?")
      .run(sit, quem && quem.nome || null, quem && quem.id || null, m, i.id);
  })();
  return { situacao: aprovar ? (i.modo_saldo === 'volume' ? 'ciente' : 'aprovado') : 'rejeitado' };
}

/* ── O CONSUMO ──────────────────────────────────────────────────────────── */
function consumo(db, componente_id){
  const c = db.prepare('SELECT id, nome, modo_saldo FROM componente WHERE id=?').get(+componente_id);
  if(!c) throw new Recusa(404, 'material não encontrado');
  if(c.modo_saldo === 'sem') return mediaDeCompra(db, c.id);
  /* R-CMP-44: as duas ULTIMAS contagens deste material. */
  const l = db.prepare("SELECT contado, contado_em FROM contagem_material_item WHERE componente_id=? ORDER BY contado_em DESC, id DESC LIMIT 2").all(c.id);
  if(l.length < 2) return { consumo:null, por_dia:null, motivo:'precisa de duas contagens para dizer o consumo — há ' + l.length };
  const [atual, ant] = l;
  const ent = db.prepare(`SELECT COALESCE(SUM(delta),0) e FROM movimento_componente WHERE componente_id=? AND delta>0 AND motivo='recebimento'
    AND criado_em > ? AND criado_em <= ?`).get(c.id, ant.contado_em, atual.contado_em).e;
  const cons = r3(ant.contado + ent - atual.contado);
  const dias = Math.max(1, Math.round((Date.parse(atual.contado_em.replace(' ', 'T')) - Date.parse(ant.contado_em.replace(' ', 'T'))) / 86400000));
  return { consumo:cons, por_dia:Math.round(cons / dias * 1e6) / 1e6, dias, de:ant.contado_em, ate:atual.contado_em, fonte:'contagem' };
}
/* R-CMP-45: media mensal das quantidades recebidas na janela (padrao 6
   meses), dizendo DE QUANTOS MESES saiu. Janela maior que a historia e cortada
   no primeiro recebimento (a armadilha #16), e abaixo de 3 meses a tarja diz. */
function mediaDeCompra(db, componente_id, janela){
  janela = janela || 6;
  const prim = db.prepare("SELECT MIN(criado_em) d FROM movimento_componente WHERE componente_id=? AND motivo='recebimento' AND delta>0").get(componente_id).d;
  if(!prim) return { por_mes:null, por_dia:null, meses:0, pouco_historico:true, fonte:'compras', motivo:'nenhuma compra recebida ainda' };
  const diasHist = (Date.now() - Date.parse(prim.replace(' ', 'T'))) / 86400000;
  const meses = Math.max(1, Math.min(janela, Math.ceil(diasHist / 30.4375 - 1e-9) || 1));
  const tot = db.prepare(`SELECT COALESCE(SUM(delta),0) q FROM movimento_componente WHERE componente_id=? AND motivo='recebimento' AND delta>0
    AND criado_em >= datetime('now','localtime', ?)`).get(componente_id, '-' + Math.round(meses * 30.4375) + ' days').q;
  const pm = r3(tot / meses);
  return { por_mes:pm, por_dia:Math.round(pm / 30.4375 * 1e6) / 1e6, meses, pouco_historico: meses < 3, fonte:'compras' };
}
/* A frequencia: quem passou de `contagem_dias` sem contar (ou nunca contou). */
function aContar(db, almoxarifado_id){
  return db.prepare(`SELECT c.id componente_id, c.nome, c.contagem_dias,
      (SELECT MAX(i.contado_em) FROM contagem_material_item i WHERE i.componente_id=c.id) ultima
    FROM componente c WHERE c.ativo=1 AND c.modo_saldo IN ('quantidade','volume') ${almoxarifado_id ? 'AND c.almoxarifado_id=' + (+almoxarifado_id) : ''}
    ORDER BY c.nome`).all().filter(x => !x.ultima || (Date.now() - Date.parse(x.ultima.replace(' ', 'T'))) / 86400000 >= (x.contagem_dias || 30));
}
function pendencias(db){
  const l = pendentes(db);
  return { n:l.length, desde:l.map(x => x.contado_em).filter(Boolean).sort()[0] || null };
}

/* ── O TECIDO DE ANTES VIRA VOLUME NA 504 (decisao do dono, 07/11/2026) ─────
   O tecido que ja tinha saldo antes da fase 1 ficou "por quantidade" (o
   backfill nao inventa rolo). Aqui quem aprova a contagem registra cada rolo
   com a metragem da etiqueta: o material passa a "por volume", nascem os
   volumes, e o saldo vira a soma deles — a diferenca entra no livro como
   contagem, com quem. A lista nao mostra o saldo (a contagem e cega). */
function aEtiquetar(db){
  return db.prepare(`SELECT c.id, c.nome, c.unidade, c.almoxarifado_id, a.nome almoxarifado FROM componente c
    LEFT JOIN almoxarifado a ON a.id=c.almoxarifado_id
    WHERE c.ativo=1 AND c.modo_saldo='quantidade' AND c.familia IS NOT NULL AND COALESCE(c.estoque,0) > 0 ORDER BY c.nome`).all();
}
function etiquetar(db, b, quem){
  const c = db.prepare('SELECT * FROM componente WHERE id=?').get(+(b && b.componente_id));
  if(!c || !c.ativo) throw new Recusa(404, 'material não encontrado');
  if(c.modo_saldo !== 'quantidade') throw new Recusa(400, c.nome + ' já não é por quantidade: não há o que etiquetar');
  const vs = Array.isArray(b.volumes) ? b.volumes : [];
  if(!vs.length) throw new Recusa(400, 'registre cada rolo, com a metragem da etiqueta');
  const volumes = vs.map((v, k) => { const m = parseFloat(String(v && v.metragem).replace(',', '.'));
    if(!(m > 0)) throw new Recusa(400, 'a metragem do rolo ' + (k + 1) + ' tem que ser maior que zero');
    return { metragem: Math.round(m * 1000) / 1000, codigo_fornecedor: (v && v.codigo_fornecedor) || null }; });
  const total = Math.round(volumes.reduce((s2, v) => s2 + v.metragem, 0) * 1000) / 1000;
  let criados;
  db.transaction(() => {
    const delta = Math.round((total - (+c.estoque || 0)) * 1000) / 1000;
    if(delta !== 0) DOM.movimentar(db, { componente_id:c.id, delta, motivo:'contagem',
      referencia:'504: etiquetado em ' + volumes.length + ' volume(s)', usuario_nome:quem && quem.nome, usuario_id:quem && quem.id });
    db.prepare("UPDATE componente SET modo_saldo='volume', um_por_nivel=1 WHERE id=?").run(c.id);
    criados = require('./almox_dominio').criarVolumes(db, { componente_id:c.id, recebimento_item_id:null, volumes, almoxarifado_id:c.almoxarifado_id, quem });
  })();
  return { volumes:criados };
}

module.exports = { Recusa, abrir, ler, linha, tirarLinha, terminar, pendentes, decidir, consumo, mediaDeCompra, aContar, pendencias, aEtiquetar, etiquetar };

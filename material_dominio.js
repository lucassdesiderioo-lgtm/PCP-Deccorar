/* O CADASTRO DE MATERIAL — dono unico das regras das colunas novas do
 * `componente` (spec COMPRAS-E-RECEBIMENTO, fase 1, R-CMP-01 a 10) e do
 * cadastro de almoxarifado (R-CMP-05, R-CMP-38).
 *
 * A rota (`POST /api/componentes`, no compras_route.js) chama `lerCampos` e
 * grava o que ele devolve. As regras da armadilha #33 valem inteiras aqui:
 *   - CAMPO AUSENTE NAO E CAMPO VAZIO: ausente fica de fora, vazio apaga;
 *   - NUMERO IMPOSSIVEL E RECUSADO dizendo QUAL campo, nunca clampado.
 *
 * ⚠️ O MODO DE SALDO NAO TEM PADRAO ESCONDIDO (R-CMP-03, armadilha #30): para
 * NASCER, a escolha e obrigatoria. Os materiais de antes receberam o que eles
 * sao no backfill de uma vez so (`compras_schema.js`).
 *
 * ⚠️ `como_sai = 'ficha'` NAO SE ESCOLHE enquanto a montagem nao existir
 * (R-CMP-09). A opcao existe e DIZ que esta esperando — e a resposta a divida
 * 18 (a regra inerte que ninguem ve). Quando a PRODUCAO-MONTAGEM chegar, liga-se
 * `COMO_SAI_FICHA_LIGADA`, e a baixa e de la.
 */
class Recusa extends Error{ constructor(status, msg){ super(msg); this.status = status; } }

const MODOS = ['sem', 'quantidade', 'volume'];
const NOME_MODO = { sem:'sem saldo (não se conta)', quantidade:'por quantidade', volume:'por volume etiquetado' };
const COMO_SAI_FICHA_LIGADA = false;
const COMO_SAI = [
  { valor:'contagem', nome:'pela contagem' },
  { valor:'ficha', nome:'pela ficha técnica, na embalagem',
    desligada:!COMO_SAI_FICHA_LIGADA, motivo:'depende da montagem (PRODUCAO-MONTAGEM.md), que ainda não existe' }
];
const CATEGORIAS = ['Matéria-prima','Tecido','Embalagem','Ferramenta','Limpeza','Copa','Escritório','Manutenção'];

const PADRAO = { tol_aviso_pct:2, tol_retem_pct:5, contagem_dias:30, margem_dias:5 };
const num = v => { const n = parseFloat(String(v == null ? '' : v).replace(',', '.')); return Number.isFinite(n) ? n : null; };
const txt = v => { const t = String(v == null ? '' : v).trim(); return t === '' ? null : t; };

/* Le as colunas NOVAS do corpo. Devolve o objeto de campos a gravar, ou lanca
   Recusa. `atual` e a linha gravada (na edicao), ou null (nascer). */
function lerCampos(db, b, atual){
  const tem = k => Object.prototype.hasOwnProperty.call(b, k);
  const c = {};
  const nascer = !atual;

  if(tem('categoria')) c.categoria = txt(b.categoria);

  if(tem('vai_ficha')) c.vai_ficha = (b.vai_ficha === true || b.vai_ficha === 1 || b.vai_ficha === '1') ? 1 : 0;
  else if(nascer) c.vai_ficha = 1;   // sem dizer, o material e da ficha — o caso da materia-prima

  if(tem('modo_saldo')){
    const m = txt(b.modo_saldo);
    if(!m) throw new Recusa(400, nascer ? 'escolha o modo de saldo do material: sem saldo, por quantidade ou por volume'
                                        : 'o modo de saldo não pode ficar vazio — escolha um dos três');
    if(MODOS.indexOf(m) < 0) throw new Recusa(400, 'o modo de saldo tem que ser um destes: ' + MODOS.join(', ') + ' — veio "' + m + '"');
    /* COM SALDO O MODO NAO MUDA (revisao do PR #305): virar "por volume" sem
       volume nenhum deixaria o saldo sem os rolos que o compoem (R-CMP-39), e
       virar "sem saldo" apagaria o que esta na prateleira. O tecido de antes
       vira volume ETIQUETADO na 504 (decisao do dono, 07/11/2026). */
    if(!nascer && atual.modo_saldo && m !== atual.modo_saldo && (+atual.estoque || 0) > 0)
      throw new Recusa(400, 'este material tem saldo: o modo não muda pelo cadastro. ' + (m === 'volume'
        ? 'Para passar a "por volume", etiquete os rolos na 504 (Contagem de material).'
        : 'Zere o saldo pela contagem antes de trocar o modo.'));
    c.modo_saldo = m;
  }else if(nascer){
    throw new Recusa(400, 'escolha o modo de saldo do material: sem saldo, por quantidade ou por volume');
  }

  if(tem('almoxarifado_id')){
    if(b.almoxarifado_id === '' || b.almoxarifado_id === null) c.almoxarifado_id = null;
    else{
      const a = db.prepare('SELECT id, ativo, nome FROM almoxarifado WHERE id=?').get(+b.almoxarifado_id);
      if(!a) throw new Recusa(400, 'o almoxarifado ' + b.almoxarifado_id + ' não existe');
      if(!a.ativo && !(atual && atual.almoxarifado_id === a.id))
        throw new Recusa(400, 'o almoxarifado "' + a.nome + '" está desativado: reative antes de pôr material nele');
      c.almoxarifado_id = a.id;
    }
  }

  /* O TECIDO DO SOB MEDIDA (fase 9): conferido pela porta — tecido que nao
     existe la e recusado; sem a porta, nao da para apontar. */
  if(tem('sm_tecido_id')){
    if(b.sm_tecido_id === '' || b.sm_tecido_id === null) c.sm_tecido_id = null;
    else{
      const t = require('./sobmedida_rolo').tecidos();
      if(t.fora) throw new Recusa(400, 'não dá para apontar o tecido do sob medida agora: ' + t.motivo);
      if(!t.tecidos.some(x => x.id === +b.sm_tecido_id)) throw new Recusa(400, 'o tecido ' + b.sm_tecido_id + ' não existe no sob medida');
      c.sm_tecido_id = +b.sm_tecido_id;
    }
  }
  if(tem('um_por_nivel')) c.um_por_nivel = b.um_por_nivel ? 1 : 0;
  else if(nascer) c.um_por_nivel = (c.modo_saldo === 'volume' && txt(b.familia)) ? 1 : 0;

  const NUMS = [['peso_padrao_kg','o peso de 1 unidade', false], ['tol_aviso_pct','a tolerância de aviso', false],
                ['tol_retem_pct','a tolerância de reter', false], ['contagem_dias','o intervalo da contagem (dias)', true],
                ['margem_dias','a margem de dias', true]];
  for(const [k, rot, inteiro] of NUMS){
    if(!tem(k)) continue;
    if(b[k] === '' || b[k] === null){
      /* As tolerancias e os dias tem padrao da spec; "vazio" volta a ele, e nao
         a NULL — uma tolerancia NULL desligaria a conferencia por peso calada. */
      c[k] = PADRAO[k] != null ? PADRAO[k] : null;
      continue;
    }
    const n = num(b[k]);
    if(n === null || n < 0 || (inteiro && !Number.isInteger(n)) || (k === 'contagem_dias' && n < 1))
      throw new Recusa(400, rot + ' tem que ser um número ' + (inteiro ? 'inteiro ' : '') + 'maior ou igual a ' + (k === 'contagem_dias' ? 1 : 0) + ' — veio "' + b[k] + '"');
    c[k] = n;
  }
  const av = c.tol_aviso_pct != null ? c.tol_aviso_pct : (atual ? atual.tol_aviso_pct : 2);
  const rt = c.tol_retem_pct != null ? c.tol_retem_pct : (atual ? atual.tol_retem_pct : 5);
  if(av != null && rt != null && av > rt)
    throw new Recusa(400, 'a tolerância de aviso (' + av + '%) não pode passar da de reter (' + rt + '%)');

  if(tem('ncm')){
    const d = String(b.ncm == null ? '' : b.ncm).replace(/[.\s-]/g, '');
    if(d === '') c.ncm = null;
    else if(!/^\d{8}$/.test(d)) throw new Recusa(400, 'o NCM tem 8 dígitos (ex.: 3916.90.90) — veio "' + b.ncm + '"');
    else c.ncm = d;
  }

  if(tem('como_sai')){
    const v = txt(b.como_sai) || 'contagem';
    const o = COMO_SAI.find(x => x.valor === v);
    if(!o) throw new Recusa(400, 'como sai do estoque tem que ser "contagem" ou "ficha" — veio "' + v + '"');
    if(o.desligada) throw new Recusa(400, 'sair pela ficha técnica ' + o.motivo + '. Por enquanto, o material sai pela contagem.');
    c.como_sai = v;
  }

  /* R-CMP-02: desmarcar `vai_ficha` de material que JA esta numa ficha nao some
     com ele da ficha — a recusa diz onde ele esta, para alguem tirar de la
     primeiro, de proposito. */
  if(atual && c.vai_ficha === 0 && atual.vai_ficha !== 0){
    const ms = modelosQueUsam(db, atual.id);
    if(ms.length) throw new Recusa(409, 'este material está na ficha técnica de: ' + ms.join(', ') +
      '. Tire-o dessas fichas antes de desmarcar "vai para a ficha".');
  }
  return c;
}

function modelosQueUsam(db, componente_id){
  try{
    return db.prepare(`SELECT DISTINCT m.nome FROM ficha_formula f JOIN modelo m ON m.id=f.modelo_id
      WHERE f.componente_id=? AND f.ativo=1 ORDER BY m.nome`).all(componente_id).map(r => r.nome);
  }catch(e){ return []; }
}

/* A ficha recusa material que nao vai para a ficha (R-CMP-02) — a trava e do
   servidor, nao so da lista da tela. */
function podeIrParaFicha(db, componente_id){
  const c = db.prepare('SELECT nome, vai_ficha FROM componente WHERE id=?').get(componente_id);
  if(!c) return { ok:false, erro:'componente inválido' };
  if(c.vai_ficha === 0) return { ok:false, erro:'"' + c.nome + '" não vai para a ficha técnica (é material de consumo da empresa). ' +
    'Se ele vai, marque "vai para a ficha" no cadastro de material (Compras → Materiais).' };
  return { ok:true };
}

/* ── ALMOXARIFADO ───────────────────────────────────────────────────────── */
function listarAlmox(db){
  return db.prepare(`SELECT a.*, (SELECT COUNT(*) FROM componente c WHERE c.almoxarifado_id=a.id AND c.ativo=1) materiais
    FROM almoxarifado a ORDER BY a.ativo DESC, a.nome`).all();
}

function salvarAlmox(db, b, quem){
  const tem = k => Object.prototype.hasOwnProperty.call(b, k);
  const c = {};
  for(const k of ['nome', 'local', 'finalidade']) if(tem(k)) c[k] = txt(b[k]);
  if(tem('ativo')) c.ativo = b.ativo ? 1 : 0;
  if(b.id){
    const a = db.prepare('SELECT * FROM almoxarifado WHERE id=?').get(+b.id);
    if(!a) throw new Recusa(404, 'almoxarifado não encontrado');
    if(tem('nome') && !c.nome) throw new Recusa(400, 'o nome do almoxarifado não pode ficar vazio');
    const cols = Object.keys(c);
    if(!cols.length) return { id:a.id };
    try{ db.prepare('UPDATE almoxarifado SET ' + cols.map(k => k + '=@' + k).join(',') + ' WHERE id=@id').run(Object.assign({ id:a.id }, c)); }
    catch(e){ if(/UNIQUE/.test(e.message)) throw new Recusa(409, 'já existe um almoxarifado com este nome'); throw e; }
    return { id:a.id };
  }
  if(!c.nome) throw new Recusa(400, 'dê um nome ao almoxarifado');
  try{
    const r = db.prepare('INSERT INTO almoxarifado (nome, local, finalidade, criado_por, criado_por_id) VALUES (?,?,?,?,?)')
      .run(c.nome, c.local || null, c.finalidade || null, quem && quem.nome || null, quem && quem.id || null);
    return { id:r.lastInsertRowid };
  }catch(e){ if(/UNIQUE/.test(e.message)) throw new Recusa(409, 'já existe um almoxarifado com este nome'); throw e; }
}

/* Desativar, nunca apagar (R-CMP-38): ha material, volume e contagem apontando. */
function desativarAlmox(db, id){
  const a = db.prepare('SELECT id FROM almoxarifado WHERE id=?').get(+id);
  if(!a) throw new Recusa(404, 'almoxarifado não encontrado');
  db.prepare('UPDATE almoxarifado SET ativo=0 WHERE id=?').run(a.id);
  return { id:a.id };
}

/* ── PENDENCIAS DE CADASTRO (R-CMP-05) ───────────────────────────────────
   A MESMA conta serve a tela de Compras e a central (pendencias_dominio). */
function pendencias(db){
  const itens = db.prepare(`SELECT id, nome, criado_em FROM componente
    WHERE ativo=1 AND almoxarifado_id IS NULL ORDER BY nome`).all();
  const datas = itens.map(i => i.criado_em).filter(Boolean).sort();
  return { sem_almoxarifado:{ n:itens.length, desde:datas[0] || null, itens } };
}

module.exports = { Recusa, MODOS, NOME_MODO, COMO_SAI, COMO_SAI_FICHA_LIGADA, CATEGORIAS,
  lerCampos, modelosQueUsam, podeIrParaFicha, listarAlmox, salvarAlmox, desativarAlmox, pendencias };

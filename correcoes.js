/* A MESA DE CORRECOES — dono unico de cada acao. Fase 1 da spec
 * MESA-DE-CORRECOES (29/09/2026).
 *
 *   BUSCAR ─▶ VER O OBJETO ─▶ PREVIA ─▶ EXECUTAR (motivo) ─▶ DESFAZER (se nada andou)
 *
 * Nao e um editor de linhas do banco. Cada acao so vale para o estado em que
 * ela faz sentido, com a MESMA regra que o script de terminal ja segue — e a
 * que nao vale aparece com o motivo escrito, em vez de sumir.
 *
 * Fase 1: duas acoes, as que mais pesam.
 *
 *   `cancelada`  Cancelada depois da etiqueta (VENDAS-E-MEDIA F2, o card de
 *                Bloqueados). Duas saidas: "a persiana voltou" desfaz a baixa
 *                (movimento `cancelamento` no livro) e "nao voltou" so registra.
 *   `fantasma`   Descartar fantasma: o `pendente` cujo irmao mais antigo (mesma
 *                venda ou pack) ja andou. A regra do `limpar_fantasmas.js` (#5).
 *
 * ⚠️ "VOLTOU" DESFAZ AS BAIXAS QUE O LIVRO REGISTROU, e nao "uma peca do
 * codigo" (decisao do dono, 29/09/2026). A etiqueta grava uma linha por SKU da
 * caixa com `referencia 'lote:<id>'`: e essa a baixa conhecida, e e ela que se
 * desfaz. Volume impresso ANTES do livro (21/09/2026) nao tem linha — ai a
 * volta sai pela peca do volume, e a previa DIZ isso, porque o numero deixou de
 * ser leitura e passou a ser suposicao.
 *
 * ⚠️ SOB MEDIDA NUNCA BAIXOU (§7): "voltou" e recusado. Somar ali abriria um
 * furo para cima em cada cancelada sob medida. "Nao voltou" continua valendo.
 *
 * ⚠️ A CAIXA DE VARIAS PERSIANAS FICA FORA DESTA FASE: so um item dela foi
 * cancelado, e nao da para saber qual peca voltou sem escolher peca a peca.
 *
 * ⚠️ "JA DECIDIDA" SE LE DAQUI, DA TABELA `correcao`, E NAO DE UMA COLUNA NO
 * `lote`. Uma coluna seria a segunda afirmacao sobre o mesmo fato, e divergiria
 * no primeiro "desfazer". O card de Bloqueados le a mesma coisa.
 *
 * ⚠️ DESCARTAR FANTASMA APAGA A LINHA, como o script (decisao do dono). A linha
 * inteira e as pecas ficam no `antes`, e o desfazer a devolve com o MESMO id —
 * o SQLite nunca reaproveita id de AUTOINCREMENT. Botao e script fazendo coisas
 * diferentes seria a fase 3 nascendo com duas reguas.
 *
 * ⚠️ NENHUMA FUNCAO DAQUI ABRE TRANSACAO: a rota embrulha cada passo, como no
 * estoque_dominio e no ajuste_dominio.
 */
const ESTOQUE = require('./estoque_dominio');

function garantirSchema(db){
  db.exec(`CREATE TABLE IF NOT EXISTS correcao (
    id              INTEGER PRIMARY KEY AUTOINCREMENT,
    acao            TEXT,
    alvo_tipo       TEXT,
    alvo_id         INTEGER,
    motivo          TEXT,
    params          TEXT,
    antes           TEXT,
    depois          TEXT,
    usuario_id      INTEGER,
    usuario_nome    TEXT,
    criado_em       TEXT DEFAULT (datetime('now','localtime')),
    desfeita_em     TEXT,
    desfeita_por    TEXT,
    desfeita_por_id INTEGER,
    desfeita_motivo TEXT,
    teste           INTEGER DEFAULT 0
  );`);
  db.exec('CREATE INDEX IF NOT EXISTS ix_correcao_alvo ON correcao(alvo_tipo, alvo_id)');
}

function erro(status, mensagem, extra){
  const e = new Error(mensagem); e.status = status; e.extra = extra || null; return e;
}
const dataBr = s => { s = String(s || ''); return s.length >= 16 ? s.slice(8,10) + '/' + s.slice(5,7) + ' ' + s.slice(11,16) : s; };

/* O ESTADO que o "desfazer" compara: os campos que dizem se o volume andou.
   So entram os que existem na tabela — banco antigo sem uma coluna nao pode
   fazer toda correcao parecer "andou". */
const CAMPOS_ESTADO = ['codigo','estagio','embalado_em','carregado_em','saida_id','bloqueio',
  'cancelada_estagio','cancelada_em','cancelada_varias'];
function colunas(db, t){ return db.prepare('PRAGMA table_info(' + t + ')').all().map(c => c.name); }
function estado(db, v){
  const cols = colunas(db, 'lote'), e = {};
  for(const c of CAMPOS_ESTADO) if(cols.indexOf(c) >= 0) e[c] = v[c] === undefined ? null : v[c];
  return e;
}
function volume(db, id){ return db.prepare('SELECT * FROM lote WHERE id=?').get(+id) || null; }

function decisaoAtiva(db, acao, id){
  return db.prepare(`SELECT id, usuario_nome, criado_em FROM correcao
    WHERE acao=? AND alvo_tipo='lote' AND alvo_id=? AND desfeita_em IS NULL ORDER BY id DESC LIMIT 1`).get(acao, +id);
}

/* ─── FANTASMA ─────────────────────────────────────────────────────────── */

/* O irmao MAIS ANTIGO: o volume de id menor com a mesma venda ou o mesmo pack.
   E ele que carrega a historia (embalado_em, carregado_em, reimpressoes). */
function irmaoMaisAntigo(db, v){
  const venda = String(v.venda || ''), pack = String(v.packId || '');
  if(!venda && !pack) return null;
  return db.prepare(`SELECT id, estagio, data FROM lote WHERE id<? AND (
      (?<>'' AND venda=?) OR (?<>'' AND packId=?)) ORDER BY id LIMIT 1`).get(v.id, venda, venda, pack, pack) || null;
}

const fantasma = {
  id:'fantasma', rotulo:'Descartar fantasma', estoque:false,
  valePara(db, v){
    if(v.estagio !== 'pendente') return 'só um volume pendente pode ser fantasma — este está ' + (v.estagio || '?');
    const irmao = irmaoMaisAntigo(db, v);
    if(!irmao) return 'não há volume mais antigo com a mesma venda ou pack: não é fantasma';
    if(irmao.estagio !== 'embalado' && irmao.estagio !== 'carregado')
      return 'o volume mais antigo com a mesma venda/pack (#' + irmao.id + ') ainda está ' + irmao.estagio +
             ' — olhe caso a caso: pode ser um bloqueado que só virou pendente na segunda entrada';
    /* Um pendente nao baixou estoque. Se houver linha no livro apontando para
       ele, apagar a linha deixaria o livro falando de um volume que nao existe. */
    if(db.prepare('SELECT 1 FROM movimento_estoque WHERE referencia=? LIMIT 1').get('lote:' + v.id))
      return 'há movimento de estoque apontando para este volume — não é um fantasma comum';
    return true;
  },
  previa(db, v){
    const irmao = irmaoMaisAntigo(db, v);
    return { antes:{ lote:estado(db, v) }, depois:{ apagado:true, fica:irmao && irmao.id },
      estoque:[], avisos:['O volume #' + v.id + ' sai; fica o #' + irmao.id + ' (' + irmao.estagio +
        '), que é o mais antigo com a mesma venda/pack.'] };
  },
  executar(db, v){
    const itens = db.prepare('SELECT * FROM lote_item WHERE lote_id=?').all(v.id);
    db.prepare('DELETE FROM lote_item WHERE lote_id=?').run(v.id);
    db.prepare('DELETE FROM lote WHERE id=?').run(v.id);
    const irmao = irmaoMaisAntigo(db, v);
    return { antes:{ lote:v, itens }, depois:{ apagado:true, fica:irmao && irmao.id }, movimentos:[] };
  },
  desfazer(db, c){
    const antes = JSON.parse(c.antes || '{}');
    if(!antes.lote) throw erro(409, 'a correção não guardou a linha do volume — não há o que devolver');
    if(volume(db, c.alvo_id)) throw erro(409, 'já existe um volume #' + c.alvo_id + ' — não dá para devolver por cima');
    reinserir(db, 'lote', antes.lote);
    for(const it of (antes.itens || [])){
      const livre = !db.prepare('SELECT 1 FROM lote_item WHERE id=?').get(it.id);
      const linha = Object.assign({}, it); if(!livre) delete linha.id;
      reinserir(db, 'lote_item', linha);
    }
    return [];
  }
};

function reinserir(db, tabela, linha){
  const cols = colunas(db, tabela).filter(c => Object.prototype.hasOwnProperty.call(linha, c));
  db.prepare(`INSERT INTO ${tabela} (${cols.join(',')}) VALUES (${cols.map(() => '?').join(',')})`)
    .run(...cols.map(c => linha[c]));
}

/* ─── CANCELADA DEPOIS DA ETIQUETA ─────────────────────────────────────── */

function ehSobMedida(db, codigo){
  try{
    const r = db.prepare(`SELECT COALESCE(m.sob_medida,0) sm FROM skus s LEFT JOIN modelo m ON m.id=s.modelo_id
      WHERE s.codigo=?`).get(codigo);
    return !!(r && r.sm);
  }catch(e){ return false; }
}

/* O que volta ao estoque se a persiana voltou. Primeiro o LIVRO (as baixas
   registradas deste volume); sem linha, a peca do volume. */
function volta(db, v){
  const movs = db.prepare(`SELECT codigo, SUM(delta) s FROM movimento_estoque
    WHERE referencia=? AND tipo='etiqueta' GROUP BY codigo ORDER BY codigo`).all('lote:' + v.id)
    .filter(m => m.s < 0).map(m => ({ codigo:m.codigo, delta:-m.s }));
  if(movs.length) return { fonte:'livro', estoque:movs, avisos:[] };

  let pecas = db.prepare('SELECT codigo, SUM(qtd) q FROM lote_item WHERE lote_id=? GROUP BY codigo ORDER BY codigo').all(v.id)
    .map(p => ({ codigo:p.codigo, delta:+p.q || 1 }));
  if(!pecas.length && v.codigo) pecas = [{ codigo:v.codigo, delta:1 }];
  const sob = pecas.filter(p => ehSobMedida(db, p.codigo));
  pecas = pecas.filter(p => !ehSobMedida(db, p.codigo));
  if(!pecas.length){
    if(sob.length) throw erro(409, 'peça sob medida nunca baixou do estoque, então não há o que devolver — aqui só vale “não voltou”', { motivo:'sob_medida' });
    throw erro(409, 'o volume não diz qual peça ele leva — não há o que devolver ao estoque');
  }
  for(const p of pecas) if(ESTOQUE.saldo(db, p.codigo) === null)
    throw erro(409, 'SKU fora do cadastro: ' + p.codigo + ' — cadastre antes de devolver a peça');
  return { fonte:'peca', estoque:pecas, avisos:['Este volume foi impresso antes do livro de movimentos (21/09/2026): ' +
    'não há baixa registrada, e a volta sai pela peça do volume.'] };
}

const cancelada = {
  id:'cancelada', rotulo:'Cancelada depois da etiqueta', estoque:true,
  valePara(db, v){
    if(v.cancelada_varias) return 'caixa de várias persianas com um item cancelado: não dá para saber qual peça voltou — ' +
      'fica para a próxima fase da Mesa, e continua no card de Bloqueados';
    if(v.estagio !== 'cancelado') return 'o volume não está cancelado';
    if(v.cancelada_estagio !== 'embalado' && v.cancelada_estagio !== 'carregado')
      return 'cancelada antes da etiqueta (estava ' + (v.cancelada_estagio || '?') + '): nada baixou do estoque, não há o que decidir';
    const d = decisaoAtiva(db, 'cancelada', v.id);
    if(d) return 'já decidida em ' + dataBr(d.criado_em) + ' por ' + (d.usuario_nome || '?') +
      ' (correção #' + d.id + ') — desfaça aquela para decidir de novo';
    return true;
  },
  previa(db, v, params){
    const voltou = decisao(params);
    const r = voltou ? volta(db, v) : { fonte:null, estoque:[], avisos:['Só registra: o saldo não muda.'] };
    return { antes:{ lote:estado(db, v) },
      depois:{ lote:estado(db, v), decisao: voltou ? 'voltou' : 'nao_voltou' },
      estoque:r.estoque, fonte:r.fonte, avisos:r.avisos };
  },
  executar(db, v, params, ctx){
    const p = this.previa(db, v, params);
    const movimentos = [];
    for(const m of p.estoque){
      ESTOQUE.movimentar(db, { codigo:m.codigo, delta:m.delta, tipo:'cancelamento', referencia:'correcao:' + ctx.id,
        motivo:'volume #' + v.id + ' · ' + (v.buyer || 'cliente?') + ' · NF ' + (v.nf || '—') + ' — ' + ctx.motivo,
        usuario:ctx.quem });
      movimentos.push({ codigo:m.codigo, delta:m.delta });
    }
    return { antes:p.antes, depois:Object.assign({}, p.depois, { movimentos, fonte:p.fonte }), movimentos };
  },
  desfazer(db, c, ctx){
    const v = volume(db, c.alvo_id);
    if(!v) throw erro(409, 'o volume #' + c.alvo_id + ' não existe mais');
    const depois = JSON.parse(c.depois || '{}');
    const mudou = diferencas(depois.lote || {}, estado(db, v));
    if(mudou.length) throw erro(409, 'o volume mudou depois da correção (' + mudou.join(', ') + ') — não dá para desfazer', { motivo:'andou' });
    const movimentos = [];
    for(const m of (depois.movimentos || [])){
      ESTOQUE.movimentar(db, { codigo:m.codigo, delta:-m.delta, tipo:'correcao', referencia:'correcao:' + c.id,
        motivo:'desfeita a correção #' + c.id + ' (volume #' + v.id + ') — ' + ctx.motivo, usuario:ctx.quem });
      movimentos.push({ codigo:m.codigo, delta:-m.delta });
    }
    return movimentos;
  }
};

function decisao(params){
  const v = (params || {}).voltou;
  if(v === true || v === 'true' || v === 1 || v === '1') return true;
  if(v === false || v === 'false' || v === 0 || v === '0') return false;
  throw erro(400, 'diga se a persiana voltou para a fábrica ou não');
}
function diferencas(a, b){
  return Object.keys(a).filter(k => String(a[k] == null ? '' : a[k]) !== String(b[k] == null ? '' : b[k]));
}

const ACOES = { cancelada, fantasma };

/* ─── O QUE A ROTA CHAMA ───────────────────────────────────────────────── */

function exigeLote(tipo){
  if(String(tipo || 'lote') !== 'lote') throw erro(400, 'nesta fase a Mesa corrige volumes (lote)');
}
function acoesDe(db, v){
  return Object.values(ACOES).map(a => {
    const r = a.valePara(db, v);
    return { id:a.id, rotulo:a.rotulo, estoque:a.estoque, vale:r === true, motivo:r === true ? null : r,
      /* A cancelada tem duas saidas, e o sob medida so tem uma: a tela precisa
         saber antes do clique, e nao descobrir na recusa. */
      voltou_vale: a.id === 'cancelada' && r === true ? (() => { try{ volta(db, v); return true; }catch(e){ return e.message; } })() : undefined };
  });
}
function historicoDe(db, tipo, id){
  return db.prepare(`SELECT id, acao, alvo_tipo, alvo_id, motivo, usuario_nome, criado_em, desfeita_em, desfeita_por, desfeita_motivo, depois
    FROM correcao WHERE alvo_tipo=? AND alvo_id=? ORDER BY id DESC`).all(tipo, +id).map(resumo);
}
function resumo(c){
  let d = {}; try{ d = JSON.parse(c.depois || '{}'); }catch(e){}
  return { id:c.id, acao:c.acao, rotulo:(ACOES[c.acao] || {}).rotulo || c.acao, alvo_tipo:c.alvo_tipo, alvo_id:c.alvo_id,
    motivo:c.motivo, usuario_nome:c.usuario_nome, criado_em:c.criado_em, desfeita_em:c.desfeita_em,
    desfeita_por:c.desfeita_por, desfeita_motivo:c.desfeita_motivo, decisao:d.decisao || null,
    movimentos:d.movimentos || [], fica:d.fica || null };
}

function objeto(db, tipo, id){
  exigeLote(tipo);
  const v = volume(db, id);
  if(!v){
    const apagado = db.prepare(`SELECT id FROM correcao WHERE alvo_tipo='lote' AND alvo_id=? AND acao='fantasma'
      AND desfeita_em IS NULL ORDER BY id DESC LIMIT 1`).get(+id);
    throw erro(404, 'volume #' + id + ' não encontrado' + (apagado ? ' — foi descartado como fantasma (correção #' + apagado.id + ')' : ''));
  }
  const itens = db.prepare('SELECT codigo, qtd, descricao FROM lote_item WHERE lote_id=? ORDER BY id').all(v.id);
  let livro = [];
  try{
    livro = db.prepare(`SELECT codigo, delta, tipo, referencia, motivo, usuario_nome, criado_em FROM movimento_estoque
      WHERE referencia=? OR referencia IN (SELECT 'correcao:'||id FROM correcao WHERE alvo_tipo='lote' AND alvo_id=?)
      ORDER BY id`).all('lote:' + v.id, v.id);
  }catch(e){}
  const dados = Object.assign({}, v); delete dados.codes;
  return { tipo:'lote', dados, itens, livro, acoes:acoesDe(db, v), historico:historicoDe(db, 'lote', v.id) };
}

function acharAcao(acao){
  const a = ACOES[String(acao || '')];
  if(!a) throw erro(400, 'ação desconhecida: ' + acao + ' (nesta fase: ' + Object.keys(ACOES).join(', ') + ')');
  return a;
}
function preparar(db, { acao, tipo, id }){
  exigeLote(tipo);
  const a = acharAcao(acao);
  const v = volume(db, id);
  if(!v) throw erro(404, 'volume #' + id + ' não encontrado');
  const r = a.valePara(db, v);
  if(r !== true) throw erro(409, r, { motivo:'nao_vale' });
  return { a, v };
}

function previa(db, args){
  const { a, v } = preparar(db, args);
  const p = a.previa(db, v, args.params || {});
  return { acao:a.id, alvo_id:v.id, antes:p.antes, depois:p.depois, estoque:p.estoque || [], fonte:p.fonte || null, avisos:p.avisos || [] };
}

function exigeQuem(quem){ if(!quem || (!quem.id && !quem.nome)) throw erro(401, 'sem pessoa logada'); }
function exigeMotivo(m){ const t = String(m || '').trim(); if(!t) throw erro(400, 'escreva o motivo'); return t; }

function executar(db, args){
  exigeQuem(args.quem);
  const motivo = exigeMotivo(args.motivo);
  const { a, v } = preparar(db, args);
  if(a.id === 'cancelada') decisao(args.params);   // recusa antes de gravar a linha
  const cid = db.prepare(`INSERT INTO correcao (acao,alvo_tipo,alvo_id,motivo,params,usuario_id,usuario_nome)
    VALUES (?,?,?,?,?,?,?)`).run(a.id, 'lote', v.id, motivo, JSON.stringify(args.params || {}),
      args.quem.id != null ? args.quem.id : null, args.quem.nome || '').lastInsertRowid;
  const r = a.executar(db, v, args.params || {}, { id:cid, motivo, quem:args.quem });
  db.prepare('UPDATE correcao SET antes=?, depois=? WHERE id=?').run(JSON.stringify(r.antes), JSON.stringify(r.depois), cid);
  return { correcao_id:cid, acao:a.id, alvo_id:v.id, movimentos:r.movimentos || [], depois:r.depois };
}

function desfazer(db, { id, motivo, quem }){
  exigeQuem(quem);
  const m = exigeMotivo(motivo);
  const c = db.prepare('SELECT * FROM correcao WHERE id=?').get(+id);
  if(!c) throw erro(404, 'correção não encontrada');
  if(c.desfeita_em) throw erro(409, 'esta correção já foi desfeita em ' + dataBr(c.desfeita_em) + ' por ' + (c.desfeita_por || '?'));
  const a = acharAcao(c.acao);
  const movimentos = a.desfazer(db, c, { motivo:m, quem });
  db.prepare(`UPDATE correcao SET desfeita_em=datetime('now','localtime'), desfeita_por=?, desfeita_por_id=?, desfeita_motivo=? WHERE id=?`)
    .run(quem.nome || '', quem.id != null ? quem.id : null, m, c.id);
  return { correcao_id:c.id, acao:c.acao, alvo_id:c.alvo_id, movimentos };
}

/* OS CONTADORES DO TOPO — so das acoes que existem nesta fase. Um contador sem
   botao que resolva e a trava que acusa e nao sabe liberar (§5). A regua e a
   MESMA `valePara` das acoes: contador com regra propria contaria volume que o
   botao recusa. */
function passivo(db){
  const breve = v => ({ id:v.id, codigo:v.codigo, buyer:v.buyer, nf:v.nf, venda:v.venda, packId:v.packId,
    data:v.data, estagio:v.estagio, cancelada_estagio:v.cancelada_estagio, cancelada_em:v.cancelada_em,
    cancelada_motivo:v.cancelada_motivo, modalidade:v.modalidade });
  const fantasmas = [];
  for(const v of db.prepare(`SELECT * FROM lote WHERE estagio='pendente' AND COALESCE(teste,0)=0
      AND (COALESCE(venda,'')<>'' OR COALESCE(packId,'')<>'') ORDER BY id`).all()){
    if(fantasma.valePara(db, v) === true){
      const i = irmaoMaisAntigo(db, v);
      fantasmas.push(Object.assign(breve(v), { irmao:i.id, irmao_estagio:i.estagio }));
    }
  }
  const canceladas = [];
  for(const v of db.prepare(`SELECT * FROM lote WHERE estagio='cancelado' AND COALESCE(teste,0)=0
      AND cancelada_estagio IN ('embalado','carregado') ORDER BY id DESC`).all())
    if(cancelada.valePara(db, v) === true) canceladas.push(breve(v));
  return { fantasmas, canceladas };
}

function historico(db, { limite, acao, usuario } = {}){
  const w = [], p = [];
  if(acao){ w.push('acao=?'); p.push(String(acao)); }
  if(usuario){ w.push('usuario_nome LIKE ?'); p.push('%' + String(usuario) + '%'); }
  const lim = Math.min(Math.max(+limite || 100, 1), 500);
  return db.prepare(`SELECT * FROM correcao ${w.length ? 'WHERE ' + w.join(' AND ') : ''} ORDER BY id DESC LIMIT ${lim}`)
    .all(...p).map(resumo);
}

/* A BUSCA aceita o numero do volume, a venda, o pack, a NF, o cliente e o bipe
   da etiqueta de venda — pelo `acharVolumes` do carga.js, o mesmo do bipe do
   carregamento: duas buscas pelo mesmo codigo achariam caixas diferentes. */
function buscar(db, q){
  q = String(q || '').trim();
  if(!q) return [];
  const achados = new Map();
  const por = rows => rows.forEach(r => { if(!achados.has(r.id)) achados.set(r.id, r); });
  if(/^\d+$/.test(q)) por(db.prepare('SELECT * FROM lote WHERE id=? OR venda=? OR packId=? OR nf=? ORDER BY id DESC LIMIT 50').all(+q, q, q, q));
  try{ por(require('./carga').acharVolumes(db, q)); }catch(e){}
  if(q.length >= 3){
    por(db.prepare('SELECT * FROM lote WHERE buyer LIKE ? OR codigo=? ORDER BY id DESC LIMIT 50').all('%' + q + '%', q.toUpperCase()));
  }
  return Array.from(achados.values()).sort((a, b) => b.id - a.id).slice(0, 50).map(v => ({
    id:v.id, codigo:v.codigo, buyer:v.buyer, nf:v.nf, venda:v.venda, packId:v.packId, data:v.data,
    estagio:v.estagio, cancelada_estagio:v.cancelada_estagio, teste:v.teste }));
}

module.exports = { garantirSchema, ACOES, objeto, previa, executar, desfazer, passivo, historico, buscar, erro };

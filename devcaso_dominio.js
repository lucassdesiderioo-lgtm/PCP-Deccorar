/* devcaso_dominio.js — DONO ÚNICO das devoluções EM ANDAMENTO.
 *
 * Spec docs/specs/DEVOLUCOES-ACOMPANHAMENTO.md. Responde, num lugar só:
 *   - o que é um caso, e por quais etapas ele anda (§3 da spec);
 *   - quantos dias faltam para o prazo do ML e de que cor isso fica (R3);
 *   - há quantos dias o caso está parado (R4) e há quantos o ML devolve espera (R5);
 *   - a história de cada passo (R20).
 *
 * A tela, as rotas e o script dos casos iniciais chamam DAQUI. Uma segunda
 * conta de "está vencido?" numa tela seria a armadilha #12 do CLAUDE.md: as
 * duas certas, cada uma na sua, e o caso vencido verde numa delas.
 *
 * ⚠️ O DOMÍNIO NÃO ABRE TRANSAÇÃO NAS FUNÇÕES PEQUENAS; quem chama abre.
 *    As que escrevem mais de uma linha (caso + evento) abrem a dela, porque
 *    caso sem evento é história perdida — e são chamadas uma por vez.
 *
 * ⚠️ O DINHEIRO NÃO SAI DAQUI POR PADRÃO (R15). `publico()` devolve o caso
 *    sem nenhum campo em reais; quem tem `devolucao.dinheiro` pede `comDinheiro`
 *    na rota. Esconder na tela e mandar pelo fio é o mesmo que mostrar.
 */

/* As etapas de cada tipo, na ordem da fábrica (§3 da spec). */
const ETAPAS = {
  coleta: ['lancado','coleta_pedida','docs_enviados','a_caminho','chegou','ml_avisado','revisado','encerrado'],
  ml:     ['aguardando','chegou','revisado','encerrado']
};
const NOME_ETAPA = {
  lancado:'Lançado', coleta_pedida:'Coleta pedida', docs_enviados:'Documentos ao ML',
  a_caminho:'A caminho', chegou:'Chegou', ml_avisado:'ML avisado', revisado:'Revisado',
  encerrado:'Encerrado', aguardando:'Aguardando chegar'
};
/* As que se movem À MÃO pela tela. As outras têm porta própria:
   - `chegou` é o botão "chegou" (ou o bipe do Edvaldo);
   - `ml_avisado` é o botão "avisamos o ML", e só depois de chegar. Ele é
     botão, e não etapa à mão, porque o aviso pode vir DEPOIS da revisão do
     Edvaldo — e aí ele é só história: voltar o caso de "revisado" para "ML
     avisado" apagaria da trilha que a peça já foi revisada;
   - `revisado` é o bipe do Edvaldo, na tela de sempre (R14);
   - `encerrado` é decisão (R19). */
const MANUAIS = {
  coleta: ['lancado','coleta_pedida','docs_enviados','a_caminho'],
  ml:     ['aguardando']
};
const NOME_SAIDA = {
  reembolso_recebido:'Reembolso recebido', reembolso_nao_recebido:'Reembolso não recebido',
  revisado_ml:'Revisado (ML devolve)', devolvido_comprador:'Devolvido ao comprador', perda_prazo:'Perda por prazo'
};
/* Os campos em reais. Ficam fora de tudo que vai para quem não tem a chave. */
const DINHEIRO = ['valor_ml','valor_devolvido','valor_perdido'];

const PADROES = { devol_prazo_ambar:'3', devol_prazo_vermelho:'1', devol_parado_dias:'2' };

class Recusa extends Error {
  constructor(status, msg, extra){ super(msg); this.status = status; this.extra = extra || {}; }
}

function garantir(db){
  /* O `config` é do mont_route; criado aqui também porque este módulo GRAVA
     nele (os padrões dos limites). Carregado sozinho — o script dos casos
     iniciais, um teste —, o INSERT cairia num try e não gravaria nada (§10, #28). */
  db.exec("CREATE TABLE IF NOT EXISTS config (chave TEXT PRIMARY KEY, valor TEXT)");
  db.exec(`CREATE TABLE IF NOT EXISTS devolucao_caso (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    tipo TEXT NOT NULL,
    venda TEXT, pack_id TEXT, nf TEXT,
    sku TEXT, comprador TEXT, lote_id INTEGER,
    motivo TEXT,
    etapa TEXT NOT NULL,
    etapa_desde TEXT DEFAULT (datetime('now','localtime')),
    prazo TEXT, prazo_original TEXT,
    responsavel TEXT, passado_em TEXT,
    cep TEXT,
    valor_ml REAL, valor_ml_situacao TEXT,
    valor_devolvido REAL, valor_perdido REAL,
    saida TEXT,
    devolucao_id INTEGER,
    chegou_em TEXT, encerrado_em TEXT, encerrado_por TEXT,
    obs TEXT, criado_por TEXT,
    criado_em TEXT DEFAULT (datetime('now','localtime')),
    teste INTEGER DEFAULT 0)`);
  db.exec("CREATE INDEX IF NOT EXISTS idx_devcaso_venda ON devolucao_caso(venda)");
  db.exec("CREATE INDEX IF NOT EXISTS idx_devcaso_aberto ON devolucao_caso(encerrado_em)");
  db.exec(`CREATE TABLE IF NOT EXISTS devolucao_evento (
    id INTEGER PRIMARY KEY AUTOINCREMENT, caso_id INTEGER NOT NULL,
    tipo TEXT, de TEXT, para TEXT, texto TEXT, usuario TEXT,
    criado_em TEXT DEFAULT (datetime('now','localtime')),
    teste INTEGER DEFAULT 0)`);
  db.exec("CREATE INDEX IF NOT EXISTS idx_devevento_caso ON devolucao_evento(caso_id)");
  /* FASE 3 — a transportadora é CADASTRO (não entra no modo teste); a
     tentativa de coleta é movimento (entra). */
  db.exec(`CREATE TABLE IF NOT EXISTS transportadora (
    id INTEGER PRIMARY KEY AUTOINCREMENT, nome TEXT NOT NULL, contato TEXT, canal TEXT, obs TEXT,
    ativo INTEGER DEFAULT 1, criado_em TEXT DEFAULT (datetime('now','localtime')))`);
  db.exec(`CREATE TABLE IF NOT EXISTS devolucao_coleta (
    id INTEGER PRIMARY KEY AUTOINCREMENT, caso_id INTEGER NOT NULL, transportadora_id INTEGER,
    cep TEXT, pedida_em TEXT DEFAULT (datetime('now','localtime')), custo REAL,
    resultado TEXT DEFAULT 'aguardando', obs TEXT, usuario TEXT,
    criado_em TEXT DEFAULT (datetime('now','localtime')), teste INTEGER DEFAULT 0)`);
  db.exec("CREATE INDEX IF NOT EXISTS idx_devcoleta_caso ON devolucao_coleta(caso_id)");
  const ins = db.prepare("INSERT OR IGNORE INTO config (chave,valor) VALUES (?,?)");
  for(const [k,v] of Object.entries(PADROES)) ins.run(k, v);
}

/* ── datas: dias CORRIDOS, contados pela data, nunca pela hora ── */
function hoje(db){ return db.prepare("SELECT date('now','localtime') d").get().d; }
function dataValida(s){
  const m = String(s||'').trim().match(/^(\d{4})-(\d{2})-(\d{2})$/);
  if(!m) return null;
  const d = new Date(Date.UTC(+m[1], +m[2]-1, +m[3]));
  if(d.getUTCFullYear() !== +m[1] || d.getUTCMonth() !== +m[2]-1 || d.getUTCDate() !== +m[3]) return null;
  return m[1]+'-'+m[2]+'-'+m[3];
}
function dias(de, ate){
  if(!de || !ate) return null;
  const a = dataValida(String(de).slice(0,10)), b = dataValida(String(ate).slice(0,10));
  if(!a || !b) return null;
  return Math.round((Date.parse(b+'T00:00:00Z') - Date.parse(a+'T00:00:00Z')) / 86400000);
}

function limites(db){
  const ler = (k) => { const r = db.prepare('SELECT valor FROM config WHERE chave=?').get(k);
    const v = parseInt(r ? r.valor : PADROES[k], 10); return isFinite(v) ? v : parseInt(PADROES[k], 10); };
  return { ambar: ler('devol_prazo_ambar'), vermelho: ler('devol_prazo_vermelho'), parado: ler('devol_parado_dias') };
}

/* O que o caso É agora: a conta da cor, do parado e da espera (R3, R4, R5).
   Lê só a linha; não grava nada — a leitura nunca encerra um caso (R7). */
function situacao(c, h, lim){
  const aberto = !c.encerrado_em;
  const o = { dias_prazo:null, cor:'', dias_parado:null, parado:false, dias_esperando:null };
  o.dias_parado = dias(c.etapa_desde || c.criado_em, h);
  if(c.tipo === 'coleta'){
    if(c.prazo){
      o.dias_prazo = dias(h, c.prazo);
      if(aberto){
        if(o.dias_prazo < 0) o.cor = 'vencido';
        else if(o.dias_prazo <= lim.vermelho) o.cor = 'vermelho';
        else if(o.dias_prazo <= lim.ambar) o.cor = 'ambar';
      }
    }
    o.parado = aberto && o.dias_parado !== null && o.dias_parado >= lim.parado;
  } else {
    // R5: só a espera. Sem cor e sem trava — a regra de cobrar o ML vem depois.
    o.dias_esperando = dias(c.criado_em, c.chegou_em || h);
  }
  return o;
}

/* O caso como vai pelo fio. Sem os reais, a menos que a rota peça (R15). */
function publico(c, h, lim, comDinheiro){
  const o = {};
  for(const k of Object.keys(c)) if(comDinheiro || DINHEIRO.indexOf(k) < 0) o[k] = c[k];
  delete o.teste;
  o.teste = c.teste;
  o.etapa_nome = NOME_ETAPA[c.etapa] || c.etapa;
  o.saida_nome = c.saida ? (NOME_SAIDA[c.saida] || c.saida) : null;
  return Object.assign(o, situacao(c, h, lim));
}

function evento(db, caso_id, tipo, de, para, texto, usuario){
  db.prepare('INSERT INTO devolucao_evento (caso_id,tipo,de,para,texto,usuario) VALUES (?,?,?,?,?,?)')
    .run(caso_id, tipo, de == null ? null : String(de), para == null ? null : String(para), texto || null, usuario || null);
}

/* ── leituras ── */
function buscarLote(db, cod){
  const c = String(cod||'').trim(), dig = c.replace(/\D/g,'');
  if(!c) return null;
  return db.prepare(`SELECT id,codigo,buyer,city,nf,venda,packId,data FROM lote
    WHERE venda=? OR packId=? OR venda=? OR packId=? ORDER BY id DESC LIMIT 1`).get(c, c, dig, dig) || null;
}
function buscarLotePorNF(db, nf){
  const s = String(nf||'').trim();
  if(!s) return null;
  return db.prepare('SELECT id,codigo,buyer,city,nf,venda,packId,data FROM lote WHERE nf=? ORDER BY id DESC LIMIT 1').get(s) || null;
}
function ler(db, id){ return db.prepare('SELECT * FROM devolucao_caso WHERE id=?').get(+id) || null; }
function abertoDaVenda(db, venda){
  if(!venda) return null;
  return db.prepare('SELECT id FROM devolucao_caso WHERE venda=? AND encerrado_em IS NULL ORDER BY id LIMIT 1').get(venda) || null;
}

function listar(db, opt){
  const o = opt || {};
  const h = hoje(db), lim = limites(db);
  const linhas = db.prepare('SELECT * FROM devolucao_caso WHERE encerrado_em IS NULL ORDER BY id').all()
    .map(c => publico(c, h, lim, o.comDinheiro));
  /* R3: o "nós coletamos" vai pelo PRAZO — o vencido mais antigo em cima —,
     nunca pela data de lançamento. Sem prazo (não deveria existir) vai ao fim. */
  const coleta = linhas.filter(c => c.tipo === 'coleta').sort((a,b) => {
    const x = a.dias_prazo === null ? 1e9 : a.dias_prazo, y = b.dias_prazo === null ? 1e9 : b.dias_prazo;
    return x - y || a.id - b.id;
  });
  // R5: o "ML devolve" vai pela espera, quem espera há mais tempo em cima.
  const ml = linhas.filter(c => c.tipo === 'ml').sort((a,b) => (b.dias_esperando||0) - (a.dias_esperando||0) || a.id - b.id);
  return { hoje:h, limites:lim, coleta, ml };
}
function encerrados(db, opt){
  const o = opt || {}, h = hoje(db), lim = limites(db);
  return db.prepare('SELECT * FROM devolucao_caso WHERE encerrado_em IS NOT NULL ORDER BY encerrado_em DESC, id DESC LIMIT ?')
    .all(o.limite || 200).map(c => publico(c, h, lim, o.comDinheiro));
}
function detalhe(db, id, opt){
  const c = ler(db, id);
  if(!c) throw new Recusa(404, 'Caso não encontrado. Atualize a lista.');
  const o = opt || {};
  return { caso: publico(c, hoje(db), limites(db), o.comDinheiro),
           tentativas: tentativas(db, c.id, o.comDinheiro),
           eventos: db.prepare('SELECT id,tipo,de,para,texto,usuario,criado_em FROM devolucao_evento WHERE caso_id=? ORDER BY id').all(c.id),
           etapas: ETAPAS[c.tipo], manuais: MANUAIS[c.tipo], nomes: NOME_ETAPA };
}

/* ── validações ── */
function motivoValido(db, motivo){
  if(!motivo) return null;
  const m = String(motivo).trim();
  let r = null;
  try{ r = db.prepare("SELECT valor FROM listas WHERE tipo='motivo_devolucao' AND ativo=1 AND valor=?").get(m); }catch(e){}
  if(!r) throw new Recusa(400, 'Motivo fora da lista de motivos de devolução: "'+m+'". Escolha um da lista (Admin → Cadastros).');
  return r.valor;
}
/* Reais vindos da tela: "164,04", "1.234,56", 164.04. Vazio é NULO — nunca
   zero (R9): valor não lançado não é valor zero. Impossível é recusado,
   nunca clampado (§6, armadilha #25). */
function reais(v, rotulo){
  if(v === undefined || v === null || String(v).trim() === '') return null;
  let s = String(v).trim().replace(/^R\$\s*/,'');
  if(/,/.test(s)) s = s.replace(/\./g,'').replace(',','.');
  const n = Number(s);
  if(!isFinite(n) || n < 0) throw new Recusa(400, 'Valor impossível em '+rotulo+': "'+v+'".');
  return Math.round(n * 100) / 100;
}
function aberto(db, id){
  const c = ler(db, id);
  if(!c) throw new Recusa(404, 'Caso não encontrado. Atualize a lista.');
  if(c.encerrado_em) throw new Recusa(409, 'O caso #'+c.id+' já está encerrado ('+(NOME_SAIDA[c.saida]||c.saida||'')+').');
  return c;
}
const nomeDe = (u) => (u && u.nome) || null;

/* ── escritas ── */
function lancar(db, b, usuario){
  b = b || {};
  const tipo = String(b.tipo||'').trim();
  if(!ETAPAS[tipo]) throw new Recusa(400, 'Escolha o tipo: "ML devolve" ou "Nós coletamos".');
  let venda = String(b.venda||'').replace(/\s+/g,'');
  let nf = String(b.nf||'').trim();
  let pack = String(b.pack_id||'').replace(/\s+/g,'');
  if(!venda && !nf && !pack) throw new Recusa(400, 'Informe a venda, o pack ou a NF.');
  let prazo = null;
  if(tipo === 'coleta'){
    prazo = dataValida(b.prazo);
    if(!prazo) throw new Recusa(400, 'No "Nós coletamos" o prazo do ML (resolver até) é obrigatório.');
  }
  const motivo = motivoValido(db, b.motivo);

  // R2: achar o volume pela venda (ou pelo pack bipado no lugar), ou pela NF.
  const lt = buscarLote(db, venda || pack) || buscarLotePorNF(db, nf);
  if(lt){
    if(lt.venda) venda = lt.venda;
    if(!pack && lt.packId) pack = lt.packId;
    if(!nf && lt.nf) nf = lt.nf;
  }
  const ja = abertoDaVenda(db, venda);
  if(ja) throw new Recusa(409, 'Já existe o caso #'+ja.id+' aberto para a venda '+venda+'.', { caso_id: ja.id });

  const etapa = ETAPAS[tipo][0];
  const txt = (v) => { const s = String(v == null ? '' : v).trim(); return s || null; };
  let id;
  db.transaction(() => {
    id = db.prepare(`INSERT INTO devolucao_caso (tipo,venda,pack_id,nf,sku,comprador,lote_id,motivo,etapa,prazo,
        responsavel,passado_em,cep,valor_ml,valor_ml_situacao,obs,criado_por)
      VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)`).run(
        tipo, venda || null, pack || null, nf || null,
        txt(b.sku) || (lt ? lt.codigo : null), txt(b.comprador) || (lt ? lt.buyer : null), lt ? lt.id : null,
        motivo, etapa, prazo,
        txt(b.responsavel), dataValida(b.passado_em), txt(b.cep),
        b._valor_ml === undefined ? null : b._valor_ml, b._valor_ml_situacao || null,
        txt(b.obs), nomeDe(usuario)).lastInsertRowid;
    evento(db, id, 'lancado', null, etapa, (tipo === 'coleta' ? 'Nós coletamos' : 'ML devolve') + (prazo ? ' · prazo '+prazo : ''), nomeDe(usuario));
  })();
  return ler(db, id);
}

/* Editar o que foi lançado. CAMPO AUSENTE NÃO É CAMPO VAZIO (§6, #25): só o
   que veio no corpo muda, e o resto fica como está. */
const EDITAVEIS = ['motivo','nf','sku','comprador','responsavel','passado_em','cep','obs'];
function editar(db, id, b, usuario){
  const c = aberto(db, id);
  b = b || {};
  const mud = [];
  const sets = [], vals = [];
  for(const k of EDITAVEIS){
    if(!(k in b)) continue;
    let v = b[k];
    if(k === 'motivo') v = motivoValido(db, v);
    else if(k === 'passado_em'){ v = (v === '' || v == null) ? null : dataValida(v); if(b[k] && !v) throw new Recusa(400, 'Data impossível em "passado em".'); }
    else { v = String(v == null ? '' : v).trim() || null; }
    if((c[k] == null ? null : c[k]) === v) continue;
    sets.push(k+'=?'); vals.push(v); mud.push(k+': '+(c[k]==null?'—':c[k])+' → '+(v==null?'—':v));
  }
  if(!sets.length) return c;
  db.transaction(() => {
    db.prepare('UPDATE devolucao_caso SET '+sets.join(',')+' WHERE id=?').run(...vals, c.id);
    evento(db, c.id, 'editado', null, null, mud.join(' · '), nomeDe(usuario));
  })();
  return ler(db, c.id);
}

function moverEtapa(db, c, para, usuario, texto, tipoEvento){
  db.prepare("UPDATE devolucao_caso SET etapa=?, etapa_desde=datetime('now','localtime') WHERE id=?").run(para, c.id);
  evento(db, c.id, tipoEvento || 'etapa', c.etapa, para, texto, nomeDe(usuario));
}

/* Mover a etapa à mão (R20). Só as etapas manuais do tipo; o resto tem porta
   própria. `trava` é o gancho das travas de etapa (os documentos, fase 4). */
function etapa(db, id, para, usuario, texto, travas){
  const c = aberto(db, id);
  para = String(para||'').trim();
  if(ETAPAS[c.tipo].indexOf(para) < 0) throw new Recusa(400, 'A etapa "'+para+'" não existe para este tipo de devolução.');
  if(MANUAIS[c.tipo].indexOf(para) < 0) throw new Recusa(400, '"'+(NOME_ETAPA[para]||para)+'" não se marca à mão: '+
    (para === 'revisado' ? 'é o bipe da tela de Devoluções.' : para === 'chegou' ? 'use o botão "chegou".' : 'é uma decisão com botão próprio.'));
  if(para === c.etapa) throw new Recusa(400, 'O caso já está em "'+(NOME_ETAPA[para]||para)+'".');
  if(para === 'ml_avisado' && !c.chegou_em) throw new Recusa(400, 'Só se avisa o ML que recebemos depois de a peça chegar.');
  if(travas) for(const t of travas) t(db, c, para);
  db.transaction(() => moverEtapa(db, c, para, usuario, texto))();
  return ler(db, c.id);
}

/* R6: prorrogar é PEDIDO, e o prazo não muda. */
function pedirProrrogacao(db, id, usuario, texto){
  const c = aberto(db, id);
  if(c.tipo !== 'coleta') throw new Recusa(400, 'No "ML devolve" não há prazo do ML para prorrogar.');
  evento(db, c.id, 'prorrogacao_pedida', c.prazo, null, texto || 'pedi prorrogação ao ML', nomeDe(usuario));
  return ler(db, c.id);
}
/* R6: o ML aceitou — lança o prazo novo, e o ORIGINAL fica guardado. O
   segundo prazo novo não sobrescreve o original: ele é o primeiro, sempre. */
function novoPrazo(db, id, prazo, usuario){
  const c = aberto(db, id);
  if(c.tipo !== 'coleta') throw new Recusa(400, 'No "ML devolve" não há prazo do ML.');
  const p = dataValida(prazo);
  if(!p) throw new Recusa(400, 'Data impossível para o prazo novo.');
  if(p === c.prazo) throw new Recusa(400, 'Esse já é o prazo do caso.');
  db.transaction(() => {
    db.prepare('UPDATE devolucao_caso SET prazo=?, prazo_original=COALESCE(prazo_original, ?) WHERE id=?').run(p, c.prazo, c.id);
    evento(db, c.id, 'prazo', c.prazo, p, 'prazo novo do ML', nomeDe(usuario));
  })();
  return ler(db, c.id);
}

/* Encerrar. Só por decisão (R7, R16, R19): a leitura nunca encerra. */
function encerrar(db, c, saida, usuario, texto, extra){
  const sets = ["etapa='encerrado'", 'saida=?', "encerrado_em=datetime('now','localtime')", 'encerrado_por=?'];
  const vals = [saida, nomeDe(usuario)];
  for(const [k,v] of Object.entries(extra || {})){ sets.push(k+'=?'); vals.push(v); }
  db.prepare('UPDATE devolucao_caso SET '+sets.join(',')+' WHERE id=?').run(...vals, c.id);
  evento(db, c.id, 'encerrado', c.etapa, 'encerrado', (NOME_SAIDA[saida]||saida) + (texto ? ' · '+texto : ''), nomeDe(usuario));
}
/* R7: o vencido fica no topo até o admin geral escolher. Encerrar como perda
   registra o valor perdido — vazio fica NULO, e o total do mês sai como piso (R9). */
function encerrarPerda(db, id, b, usuario){
  const c = aberto(db, id);
  if(c.tipo !== 'coleta') throw new Recusa(400, 'Perda por prazo é do "Nós coletamos".');
  const v = reais((b||{}).valor_perdido, 'o valor perdido');
  db.transaction(() => encerrar(db, c, 'perda_prazo', usuario, (b||{}).texto, { valor_perdido: v }))();
  return ler(db, c.id);
}

/* ═══ FASE 2 — a chegada ═══ */

/* O caso ABERTO que a etiqueta bipada aponta: venda, pack ou NF (R2). A caixa
   que vem por transportadora pode chegar só com a NF. */
function abertoPorCodigo(db, cod, opt){
  const c = String(cod||'').trim(), dig = c.replace(/\D/g,'');
  if(!c) return null;
  const semRevisao = (opt && opt.semRevisao) ? ' AND devolucao_id IS NULL' : '';
  return db.prepare(`SELECT * FROM devolucao_caso WHERE encerrado_em IS NULL`+semRevisao+`
    AND (venda=? OR venda=? OR pack_id=? OR pack_id=? OR nf=? OR nf=?) ORDER BY id DESC LIMIT 1`)
    .get(c, dig, c, dig, c, dig) || null;
}

/* O botão "chegou": a caixa chegou e ainda não foi revisada. A chegada é UMA
   — revisar depois não regrava a data (teste 27). */
function chegou(db, id, usuario){
  const c = aberto(db, id);
  if(c.chegou_em) throw new Recusa(409, 'A chegada do caso #'+c.id+' já foi marcada em '+c.chegou_em.slice(8,10)+'/'+c.chegou_em.slice(5,7)+'.');
  const etapas = ETAPAS[c.tipo];
  db.transaction(() => {
    db.prepare("UPDATE devolucao_caso SET chegou_em=datetime('now','localtime') WHERE id=?").run(c.id);
    if(etapas.indexOf(c.etapa) < etapas.indexOf('chegou')) moverEtapa(db, c, 'chegou', usuario, 'a caixa chegou');
    else evento(db, c.id, 'chegou', null, null, 'a caixa chegou', nomeDe(usuario));
  })();
  return ler(db, c.id);
}

/* "Avisamos o ML que recebemos" (⑥). Antes da revisão vira a etapa; depois,
   só história — a trilha não volta de "revisado". */
function avisarML(db, id, usuario){
  const c = aberto(db, id);
  if(c.tipo !== 'coleta') throw new Recusa(400, 'No "ML devolve" não há aviso de recebimento a fazer.');
  if(!c.chegou_em) throw new Recusa(400, 'Só se avisa o ML que recebemos depois de a peça chegar.');
  const ja = c.etapa === 'ml_avisado' || db.prepare("SELECT 1 FROM devolucao_evento WHERE caso_id=? AND tipo='aviso_ml'").get(c.id);
  if(ja) throw new Recusa(409, 'O aviso ao ML do caso #'+c.id+' já foi registrado.');
  db.transaction(() => {
    if(c.etapa === 'chegou') moverEtapa(db, c, 'ml_avisado', usuario, 'avisamos o ML que recebemos', 'aviso_ml');
    else evento(db, c.id, 'aviso_ml', null, null, 'avisamos o ML que recebemos', nomeDe(usuario));
  })();
  return ler(db, c.id);
}

/* A revisão do Edvaldo LIGA o caso (R14). Sem caso, devolve null e nada é
   tocado — o vínculo é bônus, não requisito (§9). Quem chama abre a transação
   (a mesma da gravação da devolução): revisão sem o caso ligado, ou caso
   ligado a revisão que não gravou, é a história mentindo. */
function ligarRevisao(db, ref, devolucao_id, usuario){
  ref = ref || {};
  let c = null;
  if(ref.caso_id){
    const x = ler(db, ref.caso_id);
    if(x && !x.encerrado_em && !x.devolucao_id) c = x;
  }
  if(!c) c = abertoPorCodigo(db, ref.codigo, { semRevisao:true });
  if(!c) return null;
  db.prepare(`UPDATE devolucao_caso SET devolucao_id=?, chegou_em=COALESCE(chegou_em, datetime('now','localtime')),
    etapa='revisado', etapa_desde=datetime('now','localtime') WHERE id=?`).run(devolucao_id, c.id);
  evento(db, c.id, 'revisado', c.etapa, 'revisado', 'revisão #'+devolucao_id+' na tela de Devoluções', nomeDe(usuario));
  return c.id;
}

/* A BAIXA de uma devolução ligada a um caso (a baixa que já existe, na aba
   Devoluções do admin). O motivo vem do caso quando ninguém escolheu (R12);
   o "ML devolve" encerra aqui, porque é o fim dele (R19). O "nós coletamos"
   NÃO: ele ainda espera o reembolso, que é do admin geral. Quem chama abre a
   transação. Devolve o motivo a gravar na devolução. */
function baixaDaDevolucao(db, devolucao_id, motivoEscolhido, usuario){
  const c = db.prepare('SELECT * FROM devolucao_caso WHERE devolucao_id=? AND encerrado_em IS NULL').get(devolucao_id);
  if(!c) return { motivo: motivoEscolhido || null, caso:null };
  const motivo = motivoEscolhido || c.motivo || null;
  if(!c.motivo && motivoEscolhido){
    // Um motivo por caso: o caso sem motivo ganha o da baixa, e isso é história.
    db.prepare('UPDATE devolucao_caso SET motivo=? WHERE id=?').run(motivoEscolhido, c.id);
    evento(db, c.id, 'editado', null, null, 'motivo: — → '+motivoEscolhido+' (na baixa)', nomeDe(usuario));
  }
  if(c.tipo === 'ml') encerrar(db, c, 'revisado_ml', usuario, 'baixa da devolução #'+devolucao_id);
  return { motivo, caso:c.id };
}

/* ═══ FASE 3 — transportadora e tentativas ═══ */

const RESULTADOS = ['aguardando','coletou','nao_encontrou'];
const cepDe = (v) => { const d = String(v||'').replace(/\D/g,''); return d || null; };

function listarTransportadoras(db, todas){
  return db.prepare('SELECT id,nome,contato,canal,obs,ativo FROM transportadora'+(todas ? '' : ' WHERE ativo=1')+' ORDER BY ativo DESC, nome').all();
}
/* Cadastrar ou editar. CAMPO AUSENTE NÃO É CAMPO VAZIO (§6, #25); `nome` é
   obrigatório só para nascer (§7-B, #33). Desativar não apaga: há tentativa
   apontando para a linha, e o caminho de volta é o mesmo campo. */
function salvarTransportadora(db, id, b){
  b = b || {};
  const txt = (v) => String(v == null ? '' : v).trim() || null;
  if(!id){
    const nome = txt(b.nome);
    if(!nome) throw new Recusa(400, 'Dê um nome à transportadora.');
    return db.prepare('INSERT INTO transportadora (nome,contato,canal,obs) VALUES (?,?,?,?)').run(nome, txt(b.contato), txt(b.canal), txt(b.obs)).lastInsertRowid;
  }
  const t = db.prepare('SELECT * FROM transportadora WHERE id=?').get(+id);
  if(!t) throw new Recusa(404, 'Transportadora não encontrada.');
  const sets = [], vals = [];
  for(const k of ['nome','contato','canal','obs']){
    if(!(k in b)) continue;
    const v = txt(b[k]);
    if(k === 'nome' && !v) throw new Recusa(400, 'O nome não pode ficar vazio.');
    sets.push(k+'=?'); vals.push(v);
  }
  if('ativo' in b){ sets.push('ativo=?'); vals.push(+b.ativo ? 1 : 0); }
  if(sets.length) db.prepare('UPDATE transportadora SET '+sets.join(',')+' WHERE id=?').run(...vals, t.id);
  return t.id;
}

/* As tentativas de um caso, numeradas (1ª, 2ª…). O custo é DINHEIRO (R15):
   só vai pelo fio a quem tem a chave. */
function tentativas(db, caso_id, comDinheiro){
  return db.prepare(`SELECT k.id,k.transportadora_id,t.nome transportadora,k.cep,k.pedida_em,k.custo,k.resultado,k.obs,k.usuario
      FROM devolucao_coleta k LEFT JOIN transportadora t ON t.id=k.transportadora_id
      WHERE k.caso_id=? ORDER BY k.id`).all(caso_id)
    .map((k, i) => { const o = Object.assign({ numero:i+1 }, k); if(!comDinheiro) delete o.custo; return o; });
}

/* R8: pedir a coleta abre uma tentativa. Uma de cada vez: duas aguardando ao
   mesmo tempo seriam dois caminhões para a mesma caixa. */
function pedirColeta(db, caso_id, b, usuario){
  const c = aberto(db, caso_id);
  b = b || {};
  if(c.tipo !== 'coleta') throw new Recusa(400, 'No "ML devolve" a coleta é do Mercado Livre.');
  const t = db.prepare('SELECT * FROM transportadora WHERE id=?').get(+b.transportadora_id || 0);
  if(!t) throw new Recusa(400, 'Escolha a transportadora.');
  if(!t.ativo) throw new Recusa(400, 'A transportadora "'+t.nome+'" está desativada.');
  const custo = reais(b.custo, 'o custo da coleta');
  const cep = cepDe(b.cep) || c.cep;
  const ja = db.prepare("SELECT id FROM devolucao_coleta WHERE caso_id=? AND resultado='aguardando'").get(c.id);
  if(ja) throw new Recusa(409, 'Já há uma tentativa de coleta aguardando neste caso. Registre o resultado dela antes.');
  const n = db.prepare('SELECT COUNT(*) n FROM devolucao_coleta WHERE caso_id=?').get(c.id).n + 1;
  db.transaction(() => {
    db.prepare('INSERT INTO devolucao_coleta (caso_id,transportadora_id,cep,custo,obs,usuario) VALUES (?,?,?,?,?,?)')
      .run(c.id, t.id, cep, custo, String(b.obs||'').trim() || null, nomeDe(usuario));
    if(cep && !c.cep) db.prepare('UPDATE devolucao_caso SET cep=? WHERE id=?').run(cep, c.id);
    if(c.etapa !== 'coleta_pedida') moverEtapa(db, c, 'coleta_pedida', usuario, n+'ª tentativa · '+t.nome, 'coleta');
    else evento(db, c.id, 'coleta', null, null, n+'ª tentativa · '+t.nome, nomeDe(usuario));
  })();
  return ler(db, c.id);
}

/* O resultado de uma tentativa. "Não achou o cliente" abre a PRÓXIMA (mesma
   transportadora, mesmo CEP, custo vazio — ainda não se sabe se a segunda ida
   cobra) e volta a etapa para coleta pedida. "Coletou" leva a caminho. */
function resultadoColeta(db, caso_id, b, usuario){
  const c = aberto(db, caso_id);
  b = b || {};
  const k = db.prepare('SELECT * FROM devolucao_coleta WHERE id=? AND caso_id=?').get(+b.tentativa_id || 0, c.id);
  if(!k) throw new Recusa(404, 'Tentativa não encontrada neste caso.');
  if(k.resultado !== 'aguardando') throw new Recusa(409, 'Esta tentativa já tem resultado.');
  const res = String(b.resultado||'');
  if(['coletou','nao_encontrou'].indexOf(res) < 0) throw new Recusa(400, 'O resultado é "coletou" ou "não achou o cliente".');
  const custo = ('custo' in b) ? reais(b.custo, 'o custo da coleta') : undefined;
  const t = db.prepare('SELECT nome FROM transportadora WHERE id=?').get(k.transportadora_id) || {};
  db.transaction(() => {
    db.prepare('UPDATE devolucao_coleta SET resultado=?'+(custo !== undefined && custo !== null ? ', custo=?' : '')+' WHERE id=?')
      .run(...[res].concat(custo !== undefined && custo !== null ? [custo] : []).concat([k.id]));
    if(res === 'coletou'){
      if(ETAPAS.coleta.indexOf(c.etapa) < ETAPAS.coleta.indexOf('a_caminho')) moverEtapa(db, c, 'a_caminho', usuario, 'coletou · '+(t.nome||''), 'coleta');
      else evento(db, c.id, 'coleta', null, null, 'coletou · '+(t.nome||''), nomeDe(usuario));
    } else {
      db.prepare('INSERT INTO devolucao_coleta (caso_id,transportadora_id,cep,custo,usuario) VALUES (?,?,?,NULL,?)')
        .run(c.id, k.transportadora_id, k.cep, nomeDe(usuario));
      const txt = 'não achou o cliente · '+(t.nome||'')+' · nova tentativa aberta';
      if(c.etapa !== 'coleta_pedida') moverEtapa(db, c, 'coleta_pedida', usuario, txt, 'coleta');
      else evento(db, c.id, 'coleta', null, null, txt, nomeDe(usuario));
    }
  })();
  return ler(db, c.id);
}

/* R10: quem JÁ COLETOU naquela região — 5 primeiros dígitos do CEP, depois os
   3. Sai das tentativas com resultado `coletou`: não há tabela de cobertura
   escrita à mão, que envelheceria calada. */
function sugerirTransportadoras(db, cep){
  const d = cepDe(cep);
  if(!d || d.length < 3) return [];
  const q = (n) => db.prepare(`SELECT t.id, t.nome, COUNT(*) vezes, MAX(k.criado_em) ultima
      FROM devolucao_coleta k JOIN transportadora t ON t.id=k.transportadora_id
      WHERE k.resultado='coletou' AND t.ativo=1 AND substr(k.cep,1,?)=?
      GROUP BY t.id ORDER BY vezes DESC, ultima DESC`).all(n, d.slice(0, n));
  const cinco = d.length >= 5 ? q(5).map(x => Object.assign(x, { casa:5 })) : [];
  const ids = new Set(cinco.map(x => x.id));
  const tres = q(3).filter(x => !ids.has(x.id)).map(x => Object.assign(x, { casa:3 }));
  return cinco.concat(tres);
}

module.exports = {
  RESULTADOS, listarTransportadoras, salvarTransportadora, tentativas, pedirColeta, resultadoColeta, sugerirTransportadoras,
  abertoPorCodigo, chegou, avisarML, ligarRevisao, baixaDaDevolucao,
  ETAPAS, MANUAIS, NOME_ETAPA, NOME_SAIDA, DINHEIRO, Recusa,
  garantir, hoje, dataValida, dias, limites, situacao, publico, evento,
  buscarLote, buscarLotePorNF, ler, abertoDaVenda, listar, encerrados, detalhe,
  motivoValido, reais, aberto, lancar, editar, etapa, moverEtapa, pedirProrrogacao, novoPrazo,
  encerrar, encerrarPerda
};

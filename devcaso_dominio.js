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
  /* `ml_revisei` (03/11/2026, decisão do dono): depois da revisão do Edvaldo,
     alguém marca "Já revisei" no ML — sem isso o ML entende que a peça chegou
     como esperado e o prazo de contestar passa. */
  ml:     ['aguardando','chegou','revisado','ml_revisei','encerrado']
};
const NOME_ETAPA = {
  lancado:'Lançado', coleta_pedida:'Coleta pedida', docs_enviados:'Documentos ao ML',
  a_caminho:'A caminho', chegou:'Chegou', ml_avisado:'ML avisado', revisado:'Revisado',
  encerrado:'Encerrado', aguardando:'Aguardando chegar', ml_revisei:'Já revisei no ML'
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
const DINHEIRO = ['valor_ml','valor_devolvido','valor_perdido','custo_etiqueta','valor_revisao','limite_frete'];

/* devol_coleta_dias: o ML dá 20 dias CORRIDOS, contados da abertura da
   reclamação, para a coleta no comprador (AJUSTE de 03/11/2026, dono). */
const PADROES = { devol_prazo_ambar:'3', devol_prazo_vermelho:'1', devol_parado_dias:'2', devol_coleta_dias:'20' };

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
    valor_ml REAL, valor_ml_situacao TEXT, valor_ml_desde TEXT,
    valor_devolvido REAL, valor_perdido REAL,
    saida TEXT,
    devolucao_id INTEGER,
    chegou_em TEXT, encerrado_em TEXT, encerrado_por TEXT,
    obs TEXT, criado_por TEXT,
    criado_em TEXT DEFAULT (datetime('now','localtime')),
    teste INTEGER DEFAULT 0,
    publicidade INTEGER, mensagem_ml TEXT, link_ml TEXT,
    custo_etiqueta REAL,
    revisao_pedida_em TEXT, revisao_numero TEXT, revisao_resultado TEXT, revisao_resp_em TEXT, valor_revisao REAL,
    aberta_em TEXT, prazo_coleta TEXT, prazo_coleta_original TEXT, limite_frete REAL,
    revisar_ate TEXT, revisao_pede TEXT, etiqueta_devolucao TEXT,
    responsavel_id INTEGER, responsavel_nome TEXT)`);
  /* FASE 5 — desde quando o valor do ML está nesta situação (R18: "pedir" há
     ≥ 2 dias entra no parado). O ALTER fica ao lado do CREATE, no fim da
     tabela, para o banco que nasceu antes desta fase (§17). */
  try{ db.exec("ALTER TABLE devolucao_caso ADD COLUMN valor_ml_desde TEXT"); }catch(e){}
  /* AJUSTE de 03/11/2026 (pedido do dono): a venda veio de publicidade (1),
     não veio (0) ou o caso é de antes da pergunta (NULL, "não informado");
     a mensagem que o ML mandou, colada inteira; e o link da conversa da
     reclamação, para o caso abrir direto nela. No fim da tabela (§17). */
  try{ db.exec("ALTER TABLE devolucao_caso ADD COLUMN publicidade INTEGER"); }catch(e){}
  try{ db.exec("ALTER TABLE devolucao_caso ADD COLUMN mensagem_ml TEXT"); }catch(e){}
  try{ db.exec("ALTER TABLE devolucao_caso ADD COLUMN link_ml TEXT"); }catch(e){}
  /* O custo da etiqueta de devolução que o ML cobra da Deccorar (AJUSTE de
     03/11/2026, dono): no "ML devolve" também há custo quando o ML entende que
     o problema é nosso. Dinheiro — só com devolucao.dinheiro (R15). */
  try{ db.exec("ALTER TABLE devolucao_caso ADD COLUMN custo_etiqueta REAL"); }catch(e){}
  /* A REVISÃO DO FRETE (AJUSTE de 03/11/2026, dono): no "ML devolve", quando o
     ML cobra o frete e a culpa não é nossa, depois de a peça chegar pede-se
     revisão; o ML devolve o frete ou nega. valor_revisao é dinheiro (R15). */
  for(const col of ['revisao_pedida_em TEXT','revisao_numero TEXT','revisao_resultado TEXT','revisao_resp_em TEXT','valor_revisao REAL'])
    try{ db.exec("ALTER TABLE devolucao_caso ADD COLUMN "+col); }catch(e){}
  /* OS DOIS PRAZOS DO ML (AJUSTE de 03/11/2026, dono): no "nós coletamos" o
     `prazo` é o de mandar o comprovante do agendamento; a coleta tem o seu,
     20 dias corridos da abertura da reclamação (`aberta_em`), com o original
     guardado como o do comprovante (R6). E o limite do frete que o ML paga
     (dinheiro, mas de quem lança e acompanha). No fim da tabela (§17). */
  for(const col of ['aberta_em TEXT','prazo_coleta TEXT','prazo_coleta_original TEXT','limite_frete REAL'])
    try{ db.exec("ALTER TABLE devolucao_caso ADD COLUMN "+col); }catch(e){}
  /* O prazo do ML para marcar "Já revisei" no ML devolve, e o que a revisão no
     ML pede: o valor cobrado, a reputação, ou os dois (03/11/2026). (§17) */
  for(const col of ['revisar_ate TEXT','revisao_pede TEXT'])
    try{ db.exec("ALTER TABLE devolucao_caso ADD COLUMN "+col); }catch(e){}
  /* O número da ETIQUETA DE DEVOLUÇÃO do ML (o envio de volta, que o PCP não
     conhece), gravado quando a revisão é ligada: bipar de novo acha o caso, e
     a busca do ML acha a devolução por ele (03/11/2026, caso #20). (§17) */
  try{ db.exec("ALTER TABLE devolucao_caso ADD COLUMN etiqueta_devolucao TEXT"); }catch(e){}
  /* O RESPONSÁVEL COMO PESSOA (spec DEVOLUCOES-PROXIMO-PASSO, fase 3,
     04/11/2026): o id da pessoa do PCP e o nome como retrato (como o
     revisao.usuario_nome). O texto livre `responsavel` fica como está — não é
     apagado nem convertido — e aparece até alguém escolher a pessoa. (§17) */
  for(const col of ['responsavel_id INTEGER','responsavel_nome TEXT'])
    try{ db.exec("ALTER TABLE devolucao_caso ADD COLUMN "+col); }catch(e){}
  db.exec("CREATE INDEX IF NOT EXISTS idx_devcaso_venda ON devolucao_caso(venda)");
  db.exec("CREATE INDEX IF NOT EXISTS idx_devcaso_aberto ON devolucao_caso(encerrado_em)");
  db.exec(`CREATE TABLE IF NOT EXISTS devolucao_evento (
    id INTEGER PRIMARY KEY AUTOINCREMENT, caso_id INTEGER NOT NULL,
    tipo TEXT, de TEXT, para TEXT, texto TEXT, usuario TEXT,
    criado_em TEXT DEFAULT (datetime('now','localtime')),
    teste INTEGER DEFAULT 0,
    usuario_id INTEGER, etapa_desde_antes TEXT)`);
  /* AJUSTE de 03/11/2026 (o desfazer): quem moveu a etapa, pelo id e não só
     pelo nome, e a data em que o caso estava na etapa de antes — é ela que
     volta, para o "parado" não zerar por causa de um clique errado. */
  try{ db.exec("ALTER TABLE devolucao_evento ADD COLUMN usuario_id INTEGER"); }catch(e){}
  try{ db.exec("ALTER TABLE devolucao_evento ADD COLUMN etapa_desde_antes TEXT"); }catch(e){}
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
    criado_em TEXT DEFAULT (datetime('now','localtime')), teste INTEGER DEFAULT 0,
    agendada_para TEXT)`);
  // O dia em que a transportadora vai buscar (AJUSTE de 03/11/2026). No fim (§17).
  try{ db.exec("ALTER TABLE devolucao_coleta ADD COLUMN agendada_para TEXT"); }catch(e){}
  db.exec("CREATE INDEX IF NOT EXISTS idx_devcoleta_caso ON devolucao_coleta(caso_id)");
  // FASE 4 — os anexos: documentos da coleta e a foto do comprador.
  db.exec(`CREATE TABLE IF NOT EXISTS devolucao_anexo (
    id INTEGER PRIMARY KEY AUTOINCREMENT, caso_id INTEGER NOT NULL, tipo TEXT NOT NULL,
    doc_tipo TEXT, arquivo TEXT, usuario TEXT,
    criado_em TEXT DEFAULT (datetime('now','localtime')), teste INTEGER DEFAULT 0)`);
  db.exec("CREATE INDEX IF NOT EXISTS idx_devanexo_caso ON devolucao_anexo(caso_id)");
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
  return { ambar: ler('devol_prazo_ambar'), vermelho: ler('devol_prazo_vermelho'), parado: ler('devol_parado_dias'), coleta: ler('devol_coleta_dias') };
}

/* Os prazos do ML de um caso "nós coletamos", em ordem: mandar o comprovante
   do agendamento (`prazo`) e coletar (`prazo_coleta`). Cumprido é pela etapa:
   o comprovante, quando o caso chegou a "Documentos ao ML"; a coleta, quando
   chegou a "A caminho" (a transportadora coletou). O caso de antes dos dois
   prazos, sem a abertura, só tem o do comprovante. */
const NOME_PRAZO = { comprovante:'Mandar o comprovante ao ML', coleta:'Coletar' };
function prazosDoCaso(c, h){
  const i = ETAPAS.coleta.indexOf(c.etapa);
  const fim = c.etapa === 'encerrado';
  const out = [];
  if(c.prazo) out.push({ qual:'comprovante', nome:NOME_PRAZO.comprovante, data:c.prazo, original:c.prazo_original || null,
    dias: dias(h, c.prazo), feito: fim || i >= ETAPAS.coleta.indexOf('docs_enviados') });
  if(c.prazo_coleta) out.push({ qual:'coleta', nome:NOME_PRAZO.coleta, data:c.prazo_coleta, original:c.prazo_coleta_original || null,
    dias: dias(h, c.prazo_coleta), feito: fim || i >= ETAPAS.coleta.indexOf('a_caminho') });
  return out;
}
function somarDias(d, n){
  const t = Date.parse(String(d).slice(0,10)+'T00:00:00Z');
  return isFinite(t) ? new Date(t + n*86400000).toISOString().slice(0,10) : null;
}
/* A abertura da reclamação: vazia é hoje; impossível ou no futuro, recusada. */
function abertaValida(db, v){
  if(!String(v == null ? '' : v).trim()) return hoje(db);
  const d = dataValida(v);
  if(!d) throw new Recusa(400, 'Data impossível em "reclamação aberta em".');
  if(d > hoje(db)) throw new Recusa(400, 'A reclamação não pode ter sido aberta depois de hoje.');
  return d;
}

/* O que o caso É agora: a conta da cor, do parado e da espera (R3, R4, R5).
   Lê só a linha; não grava nada — a leitura nunca encerra um caso (R7). */
function situacao(c, h, lim){
  const aberto = !c.encerrado_em;
  const o = { dias_prazo:null, cor:'', dias_parado:null, parado:false, parado_valor:false, dias_esperando:null };
  o.dias_parado = dias(c.etapa_desde || c.criado_em, h);
  if(c.tipo === 'coleta'){
    /* OS DOIS PRAZOS (AJUSTE de 03/11/2026): a cor, o número e a ordem vêm do
       PRÓXIMO prazo aberto — o mais perto dos que ainda não foram cumpridos.
       Cumpridos os dois (a peça foi coletada), não há prazo correndo. */
    o.prazos = prazosDoCaso(c, h);
    const vig = o.prazos.filter(x => !x.feito && x.dias !== null).sort((a,b) => a.dias - b.dias)[0] || null;
    o.prazo_qual = vig ? vig.qual : null;
    o.prazo_nome = vig ? vig.nome : null;
    o.prazo_data = vig ? vig.data : null;
    if(vig){
      o.dias_prazo = vig.dias;
      if(aberto){
        if(o.dias_prazo < 0) o.cor = 'vencido';
        else if(o.dias_prazo <= lim.vermelho) o.cor = 'vermelho';
        else if(o.dias_prazo <= lim.ambar) o.cor = 'ambar';
      }
    }
    o.parado = aberto && o.dias_parado !== null && o.dias_parado >= lim.parado;
    /* R18: "precisamos pedir o valor ao ML" parado há N dias também grita —
       mesmo com a etapa andando, o dinheiro da coleta não vem sozinho. */
    if(aberto && c.valor_ml_situacao === 'pedir'){
      const dv = dias(c.valor_ml_desde || c.criado_em, h);
      if(dv !== null && dv >= lim.parado){ o.parado = true; o.parado_valor = true; o.dias_valor = dv; }
    }
  } else {
    // R5: só a espera. Sem cor e sem trava — a regra de cobrar o ML vem depois.
    o.dias_esperando = dias(c.criado_em, c.chegou_em || h);
    /* "Já revisei no ML" (03/11/2026): depois da revisão do Edvaldo, falta
       marcar no ML; e o "revisar no ML até", quando lançado, dá a cor. */
    const avisado = c.etapa === 'ml_revisei' || c.etapa === 'encerrado';
    o.falta_revisei = aberto && !!c.devolucao_id && !avisado;
    /* O QUE FALTA PARA ENCERRAR (03/11/2026: o caso #20 ficou parado em "Já
       revisei" sem dizer que faltava a baixa). Só depois da revisão ligada;
       antes, o caso espera a peça. `dev_baixado` vem de quem lê a lista. */
    o.falta = [];
    if(aberto && c.devolucao_id){
      if(!c.dev_baixado) o.falta.push('dar a baixa');
      if(!avisado) o.falta.push('marcar "Já revisei" no ML');
      if(c.revisao_pedida_em && !c.revisao_resultado) o.falta.push('resposta da revisão no ML');
    }
    o.prazo_qual = null; o.prazo_nome = null; o.prazo_data = null;
    if(c.revisar_ate && !avisado){
      o.prazo_qual = 'revisar'; o.prazo_nome = 'Revisar no ML'; o.prazo_data = c.revisar_ate;
      o.dias_prazo = dias(h, c.revisar_ate);
      if(aberto && o.dias_prazo !== null){
        if(o.dias_prazo < 0) o.cor = 'vencido';
        else if(o.dias_prazo <= lim.vermelho) o.cor = 'vermelho';
        else if(o.dias_prazo <= lim.ambar) o.cor = 'ambar';
      }
    }
    /* A revisão do frete pedida e sem resposta grita como o "parado": a
       resposta do ML não vem sozinha, e o caso fica aberto esperando por ela. */
    o.revisao_pendente = !!(c.revisao_pedida_em && !c.revisao_resultado);
    o.dias_revisao = o.revisao_pendente ? dias(String(c.revisao_pedida_em).slice(0,10), h) : null;
    o.revisao_parada = o.revisao_pendente && o.dias_revisao !== null && o.dias_revisao >= lim.parado;
  }
  return o;
}

/* O caso como vai pelo fio. Sem os reais, a menos que a rota peça (R15).
   Com eles, vai também o SALDO (R9): valor do ML menos os custos das
   tentativas — nulo e "incompleto" quando falta o valor ou algum custo. Custo
   indefinido nunca vira zero (§7-B, regra 4). */
function publico(c, h, lim, comDinheiro, custos){
  const o = {};
  for(const k of Object.keys(c)) if(comDinheiro || DINHEIRO.indexOf(k) < 0) o[k] = c[k];
  delete o.teste;
  o.teste = c.teste;
  o.etapa_nome = NOME_ETAPA[c.etapa] || c.etapa;
  o.falta_lancamento = c.encerrado_em ? [] : faltaLancamento(c);
  o.saida_nome = c.saida ? (NOME_SAIDA[c.saida] || c.saida) : null;
  if(comDinheiro && c.tipo === 'coleta'){
    const k = (custos && custos.get(c.id)) || { soma:0, faltam:0, n:0 };
    o.custos = Math.round(k.soma * 100) / 100;
    o.incompleto = c.valor_ml == null || k.faltam > 0;
    o.saldo = o.incompleto ? null : Math.round((c.valor_ml - k.soma) * 100) / 100;
  }
  return Object.assign(o, situacao(c, h, lim));
}
/* A baixa da revisão ligada, junto do caso: é ela que diz "falta dar a
   baixa" e que mostra o bloco da baixa dentro do caso. */
function comBaixa(db, linhas){
  const q = db.prepare('SELECT baixado, reputacao, motivo FROM devolucao WHERE id=?');
  return linhas.map(c => {
    if(!c.devolucao_id) return c;
    const d = q.get(c.devolucao_id) || {};
    return Object.assign({}, c, { dev_baixado: d.baixado ? 1 : 0, dev_reputacao: d.reputacao || null, dev_motivo: d.motivo || null });
  });
}
/* Os custos das tentativas, por caso: a soma e quantos estão vazios. */
function custosPorCaso(db){
  const m = new Map();
  for(const r of db.prepare('SELECT caso_id, COALESCE(SUM(custo),0) soma, SUM(CASE WHEN custo IS NULL THEN 1 ELSE 0 END) faltam, COUNT(*) n FROM devolucao_coleta GROUP BY caso_id').all())
    m.set(r.caso_id, { soma:r.soma, faltam:r.faltam, n:r.n });
  return m;
}

function evento(db, caso_id, tipo, de, para, texto, usuario){
  return db.prepare('INSERT INTO devolucao_evento (caso_id,tipo,de,para,texto,usuario) VALUES (?,?,?,?,?,?)')
    .run(caso_id, tipo, de == null ? null : String(de), para == null ? null : String(para), texto || null, usuario || null).lastInsertRowid;
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
  const cu = o.comDinheiro ? custosPorCaso(db) : null;
  const abertos = comBaixa(db, db.prepare('SELECT * FROM devolucao_caso WHERE encerrado_em IS NULL ORDER BY id').all());
  /* O próximo passo lê a linha CRUA (com os campos que não vão pelo fio) e a
     situação já calculada; só o passo, sem reais, viaja. */
  const crus = new Map(abertos.map(c => [c.id, c]));
  const linhas = comProximo(db, abertos.map(c => Object.assign({}, c, situacao(c, h, lim))), h, lim)
    .map(x => Object.assign(publico(crus.get(x.id), h, lim, o.comDinheiro, cu),
      { proximo: x.proximo, mesmo_comprador: irmaos(abertos, x.comprador, x.id).map(y => y.id) }));
  /* R3: o "nós coletamos" vai pelo PRAZO — o vencido mais antigo em cima —,
     nunca pela data de lançamento. Sem prazo (não deveria existir) vai ao fim. */
  const coleta = linhas.filter(c => c.tipo === 'coleta').sort((a,b) => {
    const x = a.dias_prazo === null ? 1e9 : a.dias_prazo, y = b.dias_prazo === null ? 1e9 : b.dias_prazo;
    return x - y || a.id - b.id;
  });
  // R5: o "ML devolve" vai pela espera, quem espera há mais tempo em cima.
  /* Com o "revisar no ML até" lançado, o prazo manda (o mais perto em cima);
     sem ele, a espera, como antes. */
  const ml = linhas.filter(c => c.tipo === 'ml').sort((a,b) => {
    const x = a.dias_prazo === null || a.dias_prazo === undefined ? 1e9 : a.dias_prazo, y = b.dias_prazo === null || b.dias_prazo === undefined ? 1e9 : b.dias_prazo;
    return x - y || (b.dias_esperando||0) - (a.dias_esperando||0) || a.id - b.id;
  });
  return { hoje:h, limites:lim, coleta, ml, por_responsavel: resumoPorResponsavel(linhas) };
}
function encerrados(db, opt){
  const o = opt || {}, h = hoje(db), lim = limites(db);
  const cu = o.comDinheiro ? custosPorCaso(db) : null;
  return db.prepare('SELECT * FROM devolucao_caso WHERE encerrado_em IS NOT NULL ORDER BY encerrado_em DESC, id DESC LIMIT ?')
    .all(o.limite || 200).map(c => publico(c, h, lim, o.comDinheiro, cu));
}
/* A MESMA PESSOA COM VÁRIOS CASOS ABERTOS (AJUSTE de 03/11/2026, dono:
   "ela sabe que tem 3 unidades da mesma pessoa"). Só AVISA: cada venda tem o
   seu prazo, o seu valor e o seu reembolso no ML, então os casos continuam
   separados. Quem diz se dois nomes são a mesma pessoa é o nome.js
   (mesmaPessoaPorPalavras: palavra inteira, nunca pedaço — a revisão achou
   "Ana" juntando com "Luciana"); nome vazio não junta ninguém. */
function irmaos(abertos, comprador, menos){
  const N = require('./nome');
  if(!N.nomeChave(comprador)) return [];
  return abertos.filter(x => x.id !== menos && N.mesmaPessoaPorPalavras(x.comprador, comprador) === true);
}
function mesmoComprador(db, comprador, menos){
  return irmaos(db.prepare('SELECT * FROM devolucao_caso WHERE encerrado_em IS NULL ORDER BY id').all(), comprador, menos);
}
function detalhe(db, id, opt){
  const c = ler(db, id);
  if(!c) throw new Recusa(404, 'Caso não encontrado. Atualize a lista.');
  const o = opt || {};
  const h = hoje(db), lim = limites(db), cb = comBaixa(db, [c])[0];
  const caso = publico(cb, h, lim, o.comDinheiro, o.comDinheiro ? custosPorCaso(db) : null);
  caso.proximo = comProximo(db, [Object.assign({}, cb, situacao(cb, h, lim))], h, lim)[0].proximo || null;
  return { caso,
           tentativas: tentativas(db, c.id, o.comDinheiro),
           anexos: listarAnexos(db, c.id),
           docs: c.tipo === 'coleta' ? situacaoDocs(db, c.id) : [],
           eventos: db.prepare('SELECT id,tipo,de,para,texto,usuario,criado_em FROM devolucao_evento WHERE caso_id=? ORDER BY id').all(c.id),
           revisao: revisaoLigada(db, c.devolucao_id),
           etapas: ETAPAS[c.tipo], manuais: MANUAIS[c.tipo], nomes: NOME_ETAPA,
           desfazer: podeDesfazer(db, c, o.usuario),
           mesmo_comprador: mesmoComprador(db, c.comprador, c.id).map(x => ({ id:x.id, venda:x.venda, nf:x.nf, tipo:x.tipo, etapa_nome: NOME_ETAPA[x.etapa] || x.etapa })) };
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

/* "Via publicidade?" — Sim ou Não, e nada mais. Vazio não é "não": seria o
   esquecimento contando como resposta (o custo vazio do R9 pela outra porta). */
function publicidadeValida(v){
  if(v === true || v === 1 || v === '1') return 1;
  if(v === false || v === 0 || v === '0') return 0;
  const t = String(v == null ? '' : v).trim().toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g,'');
  if(t === 'sim') return 1;
  if(t === 'nao') return 0;
  throw new Recusa(400, 'Diga se a venda foi via publicidade: Sim ou Não.');
}
/* O link da conversa vira um botão que abre noutra aba: só http(s), sem
   espaço, e de tamanho de link. "javascript:" ali seria código rodando na
   sessão de quem clica. Vazio de propósito apaga. */
const LINK_MAX = 2000, MENSAGEM_MAX = 20000;
function linkValido(v){
  const s = String(v == null ? '' : v).trim();
  if(!s) return null;
  if(s.length > LINK_MAX || !/^https?:\/\/[^\s<>"']+$/i.test(s))
    throw new Recusa(400, 'O link da conversa tem que ser o endereço inteiro, começando com https://');
  return s;
}
function mensagemValida(v){
  const s = String(v == null ? '' : v).replace(/\r\n/g, '\n').trim();
  if(!s) return null;
  if(s.length > MENSAGEM_MAX) throw new Recusa(400, 'A mensagem do ML passou de '+MENSAGEM_MAX.toLocaleString('pt-BR')+' letras. Cole só a parte que importa.');
  return s;
}
const simNao = (v) => v === 1 ? 'sim' : v === 0 ? 'não' : '—';
const br = (d) => d ? String(d).slice(0,10).split('-').reverse().join('/') : '—';

/* ── escritas ── */
function lancar(db, b, usuario, opt){
  b = b || {};
  const tipo = String(b.tipo||'').trim();
  if(!ETAPAS[tipo]) throw new Recusa(400, 'Escolha o tipo: "ML devolve" ou "Nós coletamos".');
  let venda = String(b.venda||'').replace(/\s+/g,'');
  let nf = String(b.nf||'').trim();
  let pack = String(b.pack_id||'').replace(/\s+/g,'');
  if(!venda && !nf && !pack) throw new Recusa(400, 'Informe a venda, o pack ou a NF.');
  let prazo = null, aberta_em = null, prazo_coleta = null;
  if(tipo === 'coleta'){
    prazo = dataValida(b.prazo);
    if(!prazo) throw new Recusa(400, 'No "Nós coletamos" o prazo do ML para mandar o comprovante é obrigatório.');
    aberta_em = abertaValida(db, b.aberta_em);
    prazo_coleta = somarDias(aberta_em, limites(db).coleta);
  }
  const motivo = motivoValido(db, b.motivo);
  /* Obrigatória no lançamento (decisão do dono, 03/11/2026). Só o script dos
     casos iniciais, que é de antes da pergunta, lança sem ela. */
  const publicidade = (opt && opt.semPublicidade && b.publicidade === undefined) ? null : publicidadeValida(b.publicidade);
  const mensagem_ml = mensagemValida(b.mensagem_ml), link_ml = linkValido(b.link_ml);
  const resp = ('responsavel_id' in b) ? responsavelValido(db, b.responsavel_id, opt && opt.temChave) : null;
  /* "Passado em" é o dia do lançamento (dono, 03/11/2026): no "nós coletamos"
     ele nasce hoje quando não vem, e a data informada vale. Data impossível é
     recusada — virar hoje em silêncio esconderia o erro de quem digitou. */
  let passado_em = null;
  if(String(b.passado_em == null ? '' : b.passado_em).trim()){
    passado_em = dataValida(b.passado_em);
    if(!passado_em) throw new Recusa(400, 'Data impossível em "passado em".');
  } else if(tipo === 'coleta') passado_em = hoje(db);

  // R2: achar o volume pela venda (ou pelo pack bipado no lugar), ou pela NF.
  const lt = buscarLote(db, venda || pack) || buscarLotePorNF(db, nf);
  if(lt){
    if(lt.venda) venda = lt.venda;
    if(!pack && lt.packId) pack = lt.packId;
    if(!nf && lt.nf) nf = lt.nf;
  }
  const ja = abertoDaVenda(db, venda);
  if(ja) throw new Recusa(409, 'Já existe o caso #'+ja.id+' aberto para a venda '+venda+'.', { caso_id: ja.id });
  /* O QUE NÃO PODE FALTAR NO LANÇAMENTO (decisão do dono, 04/11/2026): sem
     isso alguém abre o caso depois para completar. O SKU e o comprador que
     vieram da venda no sistema contam. A recusa é UMA, dizendo todos. Só o
     script dos casos iniciais, de antes da regra, lança sem eles. */
  if(!(opt && opt.semObrigatorios)){
    const t = (v) => { const x = String(v == null ? '' : v).trim(); return x || null; };
    const faltam = faltaLancamento({ motivo, sku: t(b.sku) || (lt ? lt.codigo : null),
      comprador: t(b.comprador) || (lt ? lt.buyer : null), responsavel_id: resp ? resp.id : null, link_ml }, true);
    if(faltam.length) throw new Recusa(400, 'Para lançar, falta: '+faltam.map(x => x.nome).join(' · ')+'.', { faltam: faltam.map(x => x.campo) });
  }

  const etapa = ETAPAS[tipo][0];
  const txt = (v) => { const s = String(v == null ? '' : v).trim(); return s || null; };
  let id;
  db.transaction(() => {
    id = db.prepare(`INSERT INTO devolucao_caso (tipo,venda,pack_id,nf,sku,comprador,lote_id,motivo,etapa,prazo,
        responsavel,passado_em,cep,valor_ml,valor_ml_situacao,obs,criado_por,publicidade,mensagem_ml,link_ml,aberta_em,prazo_coleta)
      VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)`).run(
        tipo, venda || null, pack || null, nf || null,
        txt(b.sku) || (lt ? lt.codigo : null), txt(b.comprador) || (lt ? lt.buyer : null), lt ? lt.id : null,
        motivo, etapa, prazo,
        txt(b.responsavel), passado_em, cepDe(b.cep),
        b._valor_ml === undefined ? null : b._valor_ml, b._valor_ml_situacao || null,
        txt(b.obs), nomeDe(usuario), publicidade, mensagem_ml, link_ml, aberta_em, prazo_coleta).lastInsertRowid;
    if(b._valor_ml_situacao) db.prepare("UPDATE devolucao_caso SET valor_ml_desde=datetime('now','localtime') WHERE id=?").run(id);
    if(resp) db.prepare('UPDATE devolucao_caso SET responsavel_id=?, responsavel_nome=? WHERE id=?').run(resp.id, resp.nome, id);
    evento(db, id, 'lancado', null, etapa, (tipo === 'coleta' ? 'Nós coletamos' : 'ML devolve') +
      (prazo ? ' · comprovante até '+br(prazo)+' · coletar até '+br(prazo_coleta) : '') +
      (publicidade == null ? '' : ' · via publicidade: '+simNao(publicidade)), nomeDe(usuario));
  })();
  return ler(db, id);
}

/* O LANÇAMENTO COMPLETO (AJUSTE de 03/11/2026, dono: "no lançar devolução é
   onde devemos já lançar o maior número de informações"). Lança e, no mesmo
   passo, pede a coleta, marca a situação do valor do ML e lança o valor —
   pelas MESMAS funções da tela do caso, nunca uma segunda conta. É uma
   transação só: se uma parte for recusada, o caso não nasce pela metade.
   Bloco vazio é como não ter vindo. Quem pode mandar valor e custo é a rota
   que decide (a chave do dinheiro, R15). */
const preenchido = (v) => v !== undefined && v !== null && String(v).trim() !== '';
function lancarCompleto(db, b, usuario, opt){
  b = b || {};
  /* Custo sem transportadora não tem onde morar: recusa, em vez de sumir
     calado (achado na revisão). */
  if(b.coleta && !preenchido(b.coleta.transportadora_id) && preenchido(b.coleta.custo))
    throw new Recusa(400, 'Escolha a transportadora para lançar o custo da coleta — ou apague o custo.');
  const co = (b.coleta && preenchido(b.coleta.transportadora_id)) ? b.coleta : null;
  const sit = preenchido(b.valor_ml_situacao) ? String(b.valor_ml_situacao).trim() : null;
  const valor = preenchido(b.valor_ml) ? b.valor_ml : null;
  const limite = preenchido(b.limite_frete) ? b.limite_frete : null;
  if((co || sit || valor !== null || limite !== null) && String(b.tipo||'').trim() === 'ml')
    throw new Recusa(400, 'No "ML devolve" a coleta, o limite do frete e o valor são do Mercado Livre: lance sem eles.');
  let c, valorMudou = [];
  db.transaction(() => {
    c = lancar(db, b, usuario, opt);
    if(co) pedirColeta(db, c.id, { transportadora_id: co.transportadora_id, custo: co.custo, cep: b.cep, obs: co.obs, agendada_para: co.agendada_para }, usuario);
    if(limite !== null) valorMudou = valorMudou.concat(lancarValor(db, c.id, { limite_frete: limite }, usuario));
    if(sit) situacaoValor(db, c.id, sit, usuario);
    /* Valor sem situação escolhida é "já veio" (a regra do lancarValor);
       com a situação escolhida no lançamento, vale a escolhida. */
    if(valor !== null) valorMudou = lancarValor(db, c.id, sit ? { valor_ml: valor, valor_ml_situacao: sit } : { valor_ml: valor }, usuario);
    if(preenchido(b.custo_etiqueta)) valorMudou = valorMudou.concat(lancarValor(db, c.id, { custo_etiqueta: b.custo_etiqueta }, usuario));
  })();
  return { caso: ler(db, c.id), valorMudou };
}

/* TROCAR O TIPO (AJUSTE de 03/11/2026, dono: "ainda não sei se o ML vai me
   entregar a persiana ou se eu vou ter que coletar"). O tipo deixa de ser
   fixo enquanto o caso está aberto. A etapa vai para a equivalente do outro
   tipo, e a DATA da etapa não muda — trocar o tipo não é o caso andar, e o
   "parado" não zera.
   · → Nós coletamos: o prazo do ML é obrigatório, como no lançamento.
   · → ML devolve: RECUSADO com coleta pedida ou valor do ML lançado (decisão
     do dono). O relatório só soma o dinheiro da coleta no "nós coletamos", e
     o custo e o valor sairiam da conta calados. O prazo fica guardado. */
const PARA_ML = { lancado:'aguardando', coleta_pedida:'aguardando', docs_enviados:'aguardando', a_caminho:'aguardando',
                  chegou:'chegou', ml_avisado:'chegou', revisado:'revisado' };
const PARA_COLETA = { aguardando:'lancado', chegou:'chegou', revisado:'revisado', ml_revisei:'revisado' };
function trocarTipo(db, id, b, usuario){
  const c = aberto(db, id);
  b = b || {};
  const para = String(b.para || '').trim();
  if(!ETAPAS[para]) throw new Recusa(400, 'O tipo é "ML devolve" ou "Nós coletamos".');
  if(para === c.tipo) throw new Recusa(400, 'O caso já é '+(para === 'coleta' ? '"Nós coletamos"' : '"ML devolve"')+'.');
  let prazo = c.prazo, etapa, aberta_em = c.aberta_em, prazo_coleta = c.prazo_coleta;
  if(para === 'coleta'){
    prazo = dataValida(b.prazo);
    if(!prazo) throw new Recusa(400, 'Para passar a "Nós coletamos", informe o prazo do ML para mandar o comprovante.');
    /* A abertura da reclamação: a informada, ou a que o caso já tem, ou o dia
       do lançamento. O prazo da coleta sai dela, se ainda não houver um. */
    aberta_em = String(b.aberta_em == null ? '' : b.aberta_em).trim() ? abertaValida(db, b.aberta_em)
      : (c.aberta_em || String(c.criado_em||'').slice(0,10) || hoje(db));
    if(!c.prazo_coleta_original || !prazo_coleta) prazo_coleta = somarDias(aberta_em, limites(db).coleta);
    etapa = PARA_COLETA[c.etapa];
  } else {
    const tent = db.prepare('SELECT COUNT(*) n FROM devolucao_coleta WHERE caso_id=?').get(c.id).n;
    if(tent) throw new Recusa(409, 'Este caso já tem coleta pedida com transportadora. Não dá para trocar para "ML devolve": a coleta e o custo dela sairiam da conta.');
    if(c.valor_ml != null) throw new Recusa(409, 'Este caso já tem o valor do ML pela coleta lançado. Não dá para trocar para "ML devolve": o valor sairia da conta.');
    etapa = PARA_ML[c.etapa];
  }
  if(!etapa) throw new Recusa(409, 'A etapa "'+(NOME_ETAPA[c.etapa]||c.etapa)+'" não tem equivalente no outro tipo.');
  db.transaction(() => {
    db.prepare('UPDATE devolucao_caso SET tipo=?, etapa=?, prazo=?, aberta_em=?, prazo_coleta=? WHERE id=?').run(para, etapa, prazo, aberta_em, prazo_coleta, c.id);
    // "Passado em" é o dia do lançamento (dono): o "ML devolve" não tem, e quem vira coleta ganha.
    if(para === 'coleta' && !c.passado_em) db.prepare('UPDATE devolucao_caso SET passado_em=? WHERE id=?').run(String(c.criado_em||'').slice(0,10) || hoje(db), c.id);
    evento(db, c.id, 'tipo', c.tipo, para, (c.tipo === 'coleta' ? 'Nós coletamos' : 'ML devolve')+' → '+(para === 'coleta' ? 'Nós coletamos' : 'ML devolve')+
      (para === 'coleta' ? ' · comprovante até '+br(prazo)+' · coletar até '+br(prazo_coleta) : '')+
      (etapa !== c.etapa ? ' · etapa '+(NOME_ETAPA[c.etapa]||c.etapa)+' → '+(NOME_ETAPA[etapa]||etapa) : ''), nomeDe(usuario));
  })();
  return ler(db, c.id);
}

/* A REVISÃO DO FRETE — pedir (quem acompanha). Só no "ML devolve", só
   depois de a caixa chegar (o pedido ao ML precisa da peça vista), uma vez. */
const PEDE = { valor:'devolver o valor cobrado', reputacao:'tirar o impacto na reputação', ambos:'devolver o valor cobrado e tirar o impacto na reputação' };
function pedirRevisaoFrete(db, id, b, usuario){
  const c = aberto(db, id);
  if(c.tipo !== 'ml') throw new Recusa(400, 'A revisão do frete é do "ML devolve": no "Nós coletamos" quem cobra é a transportadora.');
  if(!c.chegou_em) throw new Recusa(409, 'A revisão do frete se pede depois de a caixa chegar. Marque "A caixa chegou" antes.');
  if(c.revisao_pedida_em) throw new Recusa(409, 'A revisão do frete já foi pedida em '+String(c.revisao_pedida_em).slice(0,10).split('-').reverse().join('/')+'.');
  const numero = String((b||{}).numero == null ? '' : b.numero).trim().slice(0,100) || null;
  /* O QUE SE PEDE (03/11/2026, dono): o valor cobrado, tirar o impacto na
     reputação, ou os dois. Ausente é o pedido de antes (o valor); vazio de
     propósito é recusado. */
  const pede = (b && 'pede' in b) ? String(b.pede == null ? '' : b.pede).trim() : 'valor';
  if(!PEDE[pede]) throw new Recusa(400, 'Diga o que se pede ao ML: o valor cobrado, a reputação, ou os dois.');
  db.transaction(() => {
    db.prepare("UPDATE devolucao_caso SET revisao_pedida_em=datetime('now','localtime'), revisao_numero=?, revisao_pede=? WHERE id=?").run(numero, pede, c.id);
    evento(db, c.id, 'revisao_frete', null, 'pedida', 'pedi revisão ao ML: '+PEDE[pede]+(numero ? ' · nº '+numero : ''), nomeDe(usuario));
  })();
  return ler(db, c.id);
}
/* A resposta do ML (quem acompanha). O VALOR devolvido é dinheiro: vem pela
   rota só com devolucao.dinheiro (conferido lá), e também pelo "Salvar
   valores", depois. Com o caso já baixado, a resposta o encerra. */
function respostaRevisaoFrete(db, id, b, usuario){
  const c = aberto(db, id);
  b = b || {};
  const resultado = String(b.resultado || '').trim();
  if(['devolveu','negou'].indexOf(resultado) < 0) throw new Recusa(400, 'A resposta do ML é "devolveu o frete" ou "negou".');
  if(!c.revisao_pedida_em) throw new Recusa(409, 'A revisão do frete ainda não foi pedida.');
  if(c.revisao_resultado) throw new Recusa(409, 'A resposta da revisão já foi lançada ('+(c.revisao_resultado === 'devolveu' ? 'atendeu' : 'negou')+').');
  if(c.revisao_pede === 'reputacao' && b.valor_revisao !== undefined && String(b.valor_revisao).trim() !== '')
    throw new Recusa(400, 'Esta revisão pediu só a reputação: não há valor devolvido a lançar.');
  let mud = [];
  db.transaction(() => {
    db.prepare("UPDATE devolucao_caso SET revisao_resultado=?, revisao_resp_em=datetime('now','localtime') WHERE id=?").run(resultado, c.id);
    evento(db, c.id, 'revisao_frete', 'pedida', resultado, resultado === 'devolveu' ? 'o ML atendeu a revisão' : 'o ML negou a revisão', nomeDe(usuario));
    if(resultado === 'devolveu' && b.valor_revisao !== undefined && String(b.valor_revisao).trim() !== '')
      mud = lancarValor(db, c.id, { valor_revisao: b.valor_revisao }, usuario);
    // Com a baixa e o "Já revisei" já feitos, a resposta encerra.
    talvezEncerrarML(db, c.id, usuario, false);
  })();
  return { caso: ler(db, c.id), valorMudou: mud };
}

/* QUEM PODE SER O RESPONSÁVEL (fase 3, decisão do dono 04/11/2026): pessoa
   ATIVA do PCP com `devolucao.lancar` ou `devolucao.acompanhar`. Quem
   responde se a pessoa tem a chave é o acesso.js, pela rota (`temChave`);
   daqui só saem id e nome (a regra do R-SMR-05). */
function responsaveis(db, temChave){
  let gente = [];
  try{ gente = db.prepare('SELECT id, nome FROM usuarios WHERE ativo=1').all(); }catch(e){ return []; }
  return gente.filter(u => !temChave || temChave(u.id))
    .map(u => ({ id:u.id, nome:u.nome }))
    .sort((a,b) => String(a.nome||'').localeCompare(String(b.nome||''), 'pt-BR'));
}
/* O id escolhido: vazio de propósito tira a pessoa (null); fora da lista é
   recusado dizendo por quê, nunca gravado calado. */
function responsavelValido(db, v, temChave){
  if(v === null || v === undefined || String(v).trim() === '') return null;
  const id = Number(v);
  const recusa = () => new Recusa(400, 'Escolha como responsável uma pessoa ativa que lança ou acompanha as devoluções.');
  if(!Number.isInteger(id) || id <= 0) throw recusa();
  let u = null;
  try{ u = db.prepare('SELECT id, nome FROM usuarios WHERE id=? AND ativo=1').get(id); }catch(e){}
  if(!u || (temChave && !temChave(u.id))) throw recusa();
  return u;
}
/* O que o lançamento exige e o caso ainda não tem (dono único de "o que
   falta neste caso"). O responsável conta pela PESSOA: o texto escrito à mão
   de antes não alimenta o "Meus casos". `comCampo` devolve também a chave. */
const OBRIGATORIOS = [['motivo','motivo'],['sku','SKU'],['comprador','comprador'],['responsavel_id','responsável'],['link_ml','link da conversa']];
function faltaLancamento(c, comCampo){
  const vazio = (v) => v === null || v === undefined || String(v).trim() === '';
  const f = OBRIGATORIOS.filter(([k]) => vazio(c[k]));
  return comCampo ? f.map(([campo, nome]) => ({ campo, nome })) : f.map(([, nome]) => nome);
}
const nomeResp = (c) => (c && (c.responsavel_nome || c.responsavel)) || '—';

/* Editar o que foi lançado. CAMPO AUSENTE NÃO É CAMPO VAZIO (§6, #25): só o
   que veio no corpo muda, e o resto fica como está. */
const EDITAVEIS = ['motivo','nf','sku','comprador','responsavel','passado_em','cep','obs','publicidade','mensagem_ml','link_ml','aberta_em','revisar_ate'];
function editar(db, id, b, usuario, opt){
  const c = aberto(db, id);
  b = b || {};
  const mud = [];
  const sets = [], vals = [];
  if('responsavel_id' in b){
    const u = responsavelValido(db, b.responsavel_id, opt && opt.temChave);
    if((u ? u.id : null) !== (c.responsavel_id == null ? null : c.responsavel_id)){
      sets.push('responsavel_id=?', 'responsavel_nome=?'); vals.push(u ? u.id : null, u ? u.nome : null);
      mud.push('responsável: '+nomeResp(c)+' → '+(u ? u.nome : (c.responsavel || '—')));
    }
  }
  for(const k of EDITAVEIS){
    if(!(k in b)) continue;
    let v = b[k];
    /* O motivo que o caso JÁ tem passa mesmo se saiu da lista: removido não é
       apagado (a aba Motivos só desativa), e editar a NF não pode levá-lo. */
    if(k === 'motivo') v = (c.motivo && String(v == null ? '' : v).trim() === c.motivo) ? c.motivo : motivoValido(db, v);
    else if(k === 'passado_em'){ v = (v === '' || v == null) ? null : dataValida(v); if(b[k] && !v) throw new Recusa(400, 'Data impossível em "passado em".'); }
    else if(k === 'publicidade') v = publicidadeValida(v);
    else if(k === 'mensagem_ml') v = mensagemValida(v);
    else if(k === 'link_ml') v = linkValido(v);
    else if(k === 'revisar_ate'){
      if(c.tipo !== 'ml') continue;
      v = (v === '' || v == null) ? null : dataValida(v);
      if(b[k] && !v) throw new Recusa(400, 'Data impossível em "revisar no ML até".');
    }
    else if(k === 'aberta_em'){
      if(c.tipo !== 'coleta') continue;
      /* Vazio não apaga a abertura: sem ela não há prazo da coleta. */
      if(!String(v == null ? '' : v).trim()) continue;
      v = abertaValida(db, v);
    }
    else { v = String(v == null ? '' : v).trim() || null; }
    if((c[k] == null ? null : c[k]) === v) continue;
    sets.push(k+'=?'); vals.push(v);
    /* Corrigir a abertura recalcula o prazo da coleta — a menos que o ML já
       tenha dado um prazo novo: aí vale o que o ML deu (R6). */
    if(k === 'aberta_em' && !c.prazo_coleta_original){
      const pc = somarDias(v, limites(db).coleta);
      sets.push('prazo_coleta=?'); vals.push(pc);
      mud.push('reclamação aberta em: '+br(c.aberta_em)+' → '+br(v)+' (coletar até '+br(pc)+')');
      continue;
    }
    if(k === 'aberta_em'){ mud.push('reclamação aberta em: '+br(c.aberta_em)+' → '+br(v)+' (o prazo da coleta dado pelo ML fica)'); continue; }
    /* A mensagem e o link não vão para a história: a mensagem é longa, e quem
       lê a história quer saber que mudou, não reler o texto. */
    if(k === 'publicidade') mud.push('publicidade: '+simNao(c[k])+' → '+simNao(v));
    else if(k === 'mensagem_ml') mud.push('mensagem do ML '+(v == null ? 'apagada' : c[k] == null ? 'colada' : 'trocada'));
    else if(k === 'link_ml') mud.push('link da conversa '+(v == null ? 'apagado' : c[k] == null ? 'colado' : 'trocado'));
    else mud.push(k+': '+(c[k]==null?'—':c[k])+' → '+(v==null?'—':v));
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
  const ev = evento(db, c.id, tipoEvento || 'etapa', c.etapa, para, texto, nomeDe(usuario));
  db.prepare('UPDATE devolucao_evento SET usuario_id=?, etapa_desde_antes=? WHERE id=?').run((usuario && usuario.id) || null, c.etapa_desde || null, ev);
}

/* O DESFAZER (AJUSTE de 03/11/2026, dono: "um clique acidental vai me trazer
   problema"). Volta SÓ a última mudança de etapa feita à mão, SÓ por quem a
   fez, e só enquanto nada mais andou no caso. O caso volta à etapa de antes
   COM a data de antes. A história guarda o clique e o desfeito: nada se apaga.
   Andar no caso é o que muda a etapa por outra porta (lançar, coleta, chegada,
   revisão, aviso, encerrar, desfazer); editar, anexar, prazo e valor não. */
const ANDAM = ['lancado','etapa','desfeito','coleta','chegou','aviso_ml','revisado','encerrado','tipo','desligado'];
function ultimoAndar(db, caso_id){
  return db.prepare('SELECT * FROM devolucao_evento WHERE caso_id=? AND tipo IN ('+ANDAM.map(()=>'?').join(',')+') ORDER BY id DESC LIMIT 1')
    .get(caso_id, ...ANDAM) || null;
}
/* O que esta pessoa pode desfazer neste caso, ou null. */
function podeDesfazer(db, c, usuario){
  if(!c || c.encerrado_em || !usuario || !usuario.id) return null;
  const e = ultimoAndar(db, c.id);
  /* A chegada também grava um evento "etapa" (pelo moverEtapa): só conta como
     mudança à mão a etapa que se marca à mão (MANUAIS). */
  if(!e || e.tipo !== 'etapa' || e.para !== c.etapa || !e.de || !e.etapa_desde_antes) return null;
  if(MANUAIS[c.tipo].indexOf(e.para) < 0) return null;
  if(e.usuario_id !== usuario.id) return null;
  return { evento_id: e.id, de: e.para, para: e.de, nome: NOME_ETAPA[e.de] || e.de };
}
function desfazerEtapa(db, id, usuario){
  const c = aberto(db, id);
  const d = podeDesfazer(db, c, usuario);
  if(!d){
    const e = ultimoAndar(db, c.id);
    if(e && e.tipo === 'etapa' && e.para === c.etapa && MANUAIS[c.tipo].indexOf(e.para) >= 0 && e.usuario_id && usuario && e.usuario_id !== usuario.id)
      throw new Recusa(403, 'Só quem mudou a etapa ('+(e.usuario||'outra pessoa')+') pode desfazer. Para voltar, use os botões de etapa.');
    throw new Recusa(409, 'Não há mudança de etapa para desfazer: o caso já andou depois dela, ou ela já foi desfeita.');
  }
  const e = db.prepare('SELECT * FROM devolucao_evento WHERE id=?').get(d.evento_id);
  // A volta passa pela mesma trava da ida (R11): sem os documentos, não volta a "Documentos ao ML".
  if(e.de === 'docs_enviados'){
    const falta = situacaoDocs(db, c.id).filter(x => !x.ok).map(x => x.doc);
    if(falta.length) throw new Recusa(400, 'Não dá para voltar a "Documentos ao ML": faltam '+falta.join(' · ')+'. Use os botões de etapa.', { faltam: falta });
  }
  db.transaction(() => {
    db.prepare('UPDATE devolucao_caso SET etapa=?, etapa_desde=? WHERE id=?').run(e.de, e.etapa_desde_antes, c.id);
    const ev = evento(db, c.id, 'desfeito', e.para, e.de, 'desfeito: '+(NOME_ETAPA[e.para]||e.para)+' → '+(NOME_ETAPA[e.de]||e.de), nomeDe(usuario));
    db.prepare('UPDATE devolucao_evento SET usuario_id=? WHERE id=?').run(usuario.id, ev);
  })();
  return ler(db, c.id);
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
  // R11: "Documentos ao ML" só com TODOS os documentos ativos da lista anexados.
  if(para === 'docs_enviados'){
    const falta = situacaoDocs(db, c.id).filter(d => !d.ok).map(d => d.doc);
    if(falta.length) throw new Recusa(400, 'Faltam documentos para ir a "Documentos ao ML": '+falta.join(' · ')+'.', { faltam: falta });
  }
  if(travas) for(const t of travas) t(db, c, para);
  db.transaction(() => moverEtapa(db, c, para, usuario, texto))();
  return ler(db, c.id);
}

/* R6: prorrogar é PEDIDO, e o prazo não muda. */
/* Qual prazo: o que veio (comprovante ou coleta), ou o PRÓXIMO aberto — é o
   que a tela mostra. Sem nenhum aberto, o do comprovante. */
function qualPrazo(db, c, qual){
  if(qual !== undefined && qual !== null && String(qual).trim() !== ''){
    if(!NOME_PRAZO[qual]) throw new Recusa(400, 'O prazo é o do comprovante ou o da coleta.');
    if(qual === 'coleta' && !c.prazo_coleta) throw new Recusa(400, 'Este caso não tem o prazo da coleta: informe quando a reclamação foi aberta.');
    return qual;
  }
  return situacao(c, hoje(db), limites(db)).prazo_qual || 'comprovante';
}
function pedirProrrogacao(db, id, usuario, texto, qual){
  const c = aberto(db, id);
  if(c.tipo !== 'coleta') throw new Recusa(400, 'No "ML devolve" não há prazo do ML para prorrogar.');
  const q = qualPrazo(db, c, qual);
  evento(db, c.id, 'prorrogacao_pedida', q === 'coleta' ? c.prazo_coleta : c.prazo, null,
    (texto || 'pedi prorrogação ao ML')+' · prazo '+(q === 'coleta' ? 'da coleta' : 'do comprovante'), nomeDe(usuario));
  return ler(db, c.id);
}
/* R6: o ML aceitou — lança o prazo novo, e o ORIGINAL fica guardado. O
   segundo prazo novo não sobrescreve o original: ele é o primeiro, sempre. */
function novoPrazo(db, id, prazo, usuario, qual){
  const c = aberto(db, id);
  if(c.tipo !== 'coleta') throw new Recusa(400, 'No "ML devolve" não há prazo do ML.');
  const q = qualPrazo(db, c, qual);
  const p = dataValida(prazo);
  if(!p) throw new Recusa(400, 'Data impossível para o prazo novo.');
  const col = q === 'coleta' ? 'prazo_coleta' : 'prazo', orig = col + '_original';
  if(p === c[col]) throw new Recusa(400, 'Esse já é o prazo '+(q === 'coleta' ? 'da coleta' : 'do comprovante')+'.');
  db.transaction(() => {
    db.prepare('UPDATE devolucao_caso SET '+col+'=?, '+orig+'=COALESCE('+orig+', ?) WHERE id=?').run(p, c[col], c.id);
    evento(db, c.id, 'prazo', c[col], p, 'prazo novo do ML · '+(q === 'coleta' ? 'coleta' : 'comprovante'), nomeDe(usuario));
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
  const exato = db.prepare(`SELECT * FROM devolucao_caso WHERE encerrado_em IS NULL`+semRevisao+`
    AND (venda=? OR venda=? OR pack_id=? OR pack_id=? OR nf=? OR nf=? OR etiqueta_devolucao=? OR etiqueta_devolucao=?) ORDER BY id DESC LIMIT 1`)
    .get(c, dig, c, dig, c, dig, c, dig);
  if(exato) return exato;
  /* OS ÚLTIMOS NÚMEROS DO PACK ID IMPRESSO (03/11/2026): a etiqueta de
     devolução traz a venda/pack só em texto, e o Edvaldo digita os finais.
     De 5 a 10 números (4 é NF; 11 é o código da etiqueta de devolução). Só
     acha se UM caso aberto bate — com dois, ninguém é escolhido sozinho. */
  const l = porFinais(db, dig, semRevisao);
  return l.length === 1 ? l[0] : null;
}
function porFinais(db, dig, semRevisao){
  if(!/^\d{5,10}$/.test(dig || '')) return [];
  const like = '%' + dig;
  return db.prepare(`SELECT * FROM devolucao_caso WHERE encerrado_em IS NULL`+(semRevisao || '')+`
    AND (venda LIKE ? OR pack_id LIKE ?) ORDER BY id`).all(like, like);
}
/* Os casos abertos sem revisão cujos finais batem, quando são MAIS de um: a
   tela do Edvaldo mostra todos para ele tocar no certo. */
function candidatosPorFinais(db, cod){
  const dig = String(cod||'').replace(/\D/g,'');
  const l = porFinais(db, dig, ' AND devolucao_id IS NULL');
  return l.length > 1 ? l.map(c => ({ id:c.id, tipo:c.tipo, venda:c.venda, pack_id:c.pack_id, nf:c.nf, comprador:c.comprador, motivo:c.motivo, sku:c.sku })) : [];
}
/* O número bipado é a etiqueta de devolução do ML quando não é a venda, o
   pack, a NF nem os finais deles. É ele que se grava no caso. */
function etiquetaDeDevolucao(c, cod){
  const s = String(cod || '').trim(), dig = s.replace(/\D/g, '');
  if(!s || !dig || dig.length < 11) return null;
  for(const v of [c.venda, c.pack_id, c.nf]) if(v && (String(v) === s || String(v) === dig || String(v).endsWith(dig))) return null;
  return dig;
}

/* O botão "chegou": a caixa chegou e ainda não foi revisada. A chegada é UMA
   — revisar depois não regrava a data (teste 27). */
function chegou(db, id, usuario, b){
  const c = aberto(db, id);
  if(c.chegou_em) throw new Recusa(409, 'A chegada do caso #'+c.id+' já foi marcada em '+c.chegou_em.slice(8,10)+'/'+c.chegou_em.slice(5,7)+'.');
  const etapas = ETAPAS[c.tipo];
  /* No ML devolve, a chegada já pode trazer o "revisar no ML até" (o prazo
     que o ML mostra na devolução). Vazio fica sem prazo. */
  let revisar = null;
  if(c.tipo === 'ml' && b && String(b.revisar_ate == null ? '' : b.revisar_ate).trim()){
    revisar = dataValida(b.revisar_ate);
    if(!revisar) throw new Recusa(400, 'Data impossível em "revisar no ML até".');
  }
  db.transaction(() => {
    db.prepare("UPDATE devolucao_caso SET chegou_em=datetime('now','localtime') WHERE id=?").run(c.id);
    if(revisar) db.prepare('UPDATE devolucao_caso SET revisar_ate=? WHERE id=?').run(revisar, c.id);
    if(etapas.indexOf(c.etapa) < etapas.indexOf('chegou')) moverEtapa(db, c, 'chegou', usuario, 'a caixa chegou');
    else evento(db, c.id, 'chegou', null, null, 'a caixa chegou', nomeDe(usuario));
  })();
  return ler(db, c.id);
}

/* "Avisamos o ML que recebemos" (⑥). Antes da revisão vira a etapa; depois,
   só história — a trilha não volta de "revisado". */
function avisarML(db, id, usuario){
  const c = aberto(db, id);
  if(c.tipo === 'ml'){
    /* "Já revisei no ML" (03/11/2026): só depois da revisão do Edvaldo, uma
       vez; e é ele que, junto com a baixa, encerra o ML devolve. */
    if(!c.devolucao_id) throw new Recusa(400, 'O "Já revisei" se marca no ML depois de a peça ser revisada na tela de Devoluções.');
    if(c.etapa === 'ml_revisei') throw new Recusa(409, 'O "Já revisei" do caso #'+c.id+' já foi marcado.');
    db.transaction(() => {
      moverEtapa(db, c, 'ml_revisei', usuario, 'marcamos "Já revisei" no ML', 'aviso_ml');
      talvezEncerrarML(db, c.id, usuario, false);
    })();
    return ler(db, c.id);
  }
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
  const etq = etiquetaDeDevolucao(c, ref.codigo);
  db.prepare(`UPDATE devolucao_caso SET devolucao_id=?, chegou_em=COALESCE(chegou_em, datetime('now','localtime')),
    etapa='revisado', etapa_desde=datetime('now','localtime'), etiqueta_devolucao=COALESCE(?, etiqueta_devolucao) WHERE id=?`).run(devolucao_id, etq, c.id);
  evento(db, c.id, 'revisado', c.etapa, 'revisado', 'revisão #'+devolucao_id+' na tela de Devoluções'+(etq ? ' · etiqueta de devolução '+etq : ''), nomeDe(usuario));
  return c.id;
}

/* O ML devolve ENCERRA quando as três coisas estão feitas: a baixa da
   devolução, o "Já revisei" no ML e — se pedida — a resposta da revisão
   (decisões do dono, 03/11/2026). Chamada por quem pode completar a última:
   a baixa, o "Já revisei" e a resposta. Quem chama abre a transação. */
function talvezEncerrarML(db, id, usuario, baixadaAgora, texto){
  const c = ler(db, id);
  if(!c || c.tipo !== 'ml' || c.encerrado_em || !c.devolucao_id) return false;
  if(c.etapa !== 'ml_revisei') return false;
  if(c.revisao_pedida_em && !c.revisao_resultado) return false;
  const d = db.prepare('SELECT baixado FROM devolucao WHERE id=?').get(c.devolucao_id);
  if(!baixadaAgora && !(d && d.baixado)) return false;
  encerrar(db, c, 'revisado_ml', usuario, texto || 'baixa, "Já revisei" e revisão resolvidos');
  return true;
}

/* OS CASOS ESPERADOS DE UM SKU (CONSERTO de 03/11/2026, NF 8207). A etiqueta
   de DEVOLUÇÃO do ML é um número de envio que o PCP não conhece: o bipe não
   acha o caso. Depois de escolher o SKU, o Edvaldo vê os casos abertos ainda
   sem revisão daquele SKU e toca no certo. Sem nenhum valor em reais. */
function esperadas(db, sku){
  const s = String(sku || '').trim().toUpperCase();
  if(!s) throw new Recusa(400, 'Informe o SKU.');
  /* A CIDADE do comprador (AJUSTE de 03/11/2026): a etiqueta de devolução
     traz o remetente — o comprador, às vezes pelo apelido — e a cidade dele,
     e nem sempre o Pack ID. Ela vem da venda ligada ao caso; sem venda no
     sistema, vem vazia. */
  let comCidade = true;
  try{ db.prepare('SELECT city FROM lote LIMIT 0').all(); }catch(e){ comCidade = false; }
  return db.prepare(`SELECT c.id,c.tipo,c.venda,c.pack_id,c.nf,c.comprador,c.motivo,c.etapa,c.sku,
        ${comCidade ? "NULLIF(TRIM(l.city),'')" : 'NULL'} cidade
      FROM devolucao_caso c ${comCidade ? 'LEFT JOIN lote l ON l.id=c.lote_id' : ''}
      WHERE c.encerrado_em IS NULL AND c.devolucao_id IS NULL AND UPPER(c.sku)=? ORDER BY c.id`).all(s)
    .map(c => Object.assign(c, { etapa_nome: NOME_ETAPA[c.etapa] || c.etapa }));
}

/* As revisões recebidas SEM caso (últimos 30 dias), as do mesmo SKU em cima:
   é daqui que o caso aberto se liga à mão. */
function revisoesSoltas(db, caso_id){
  const c = ler(db, caso_id);
  if(!c) throw new Recusa(404, 'Caso não encontrado. Atualize a lista.');
  const sku = String(c.sku || '').toUpperCase();
  return db.prepare(`SELECT ${CAMPOS_REVISAO.map(k => 'd.'+k).join(',')},d.baixado FROM devolucao d
      WHERE NOT EXISTS (SELECT 1 FROM devolucao_caso x WHERE x.devolucao_id=d.id)
        AND d.recebido_em >= datetime('now','localtime','-30 days')
      ORDER BY (UPPER(d.sku_fisico)=?) DESC, d.id DESC`).all(sku)
    .map(d => Object.assign(d, { mesmo_sku: !!sku && String(d.sku_fisico || '').toUpperCase() === sku }));
}

/* LIGAR À MÃO uma revisão solta a um caso aberto — pela tela do caso ou pela
   Baixa. SKU recebido diferente do vendido pede confirmação, e a confirmação
   fica na história: é a evidência de envio errado (§9, DIVERGÊNCIA). Ligada
   depois da baixa, o ML devolve segue a regra de encerrar. */
function ligarManual(db, caso_id, devolucao_id, usuario, confirmar){
  const c = aberto(db, caso_id);
  if(c.devolucao_id) throw new Recusa(409, 'O caso #'+c.id+' já tem a revisão #'+c.devolucao_id+' ligada.');
  const d = db.prepare('SELECT * FROM devolucao WHERE id=?').get(+devolucao_id || 0);
  if(!d) throw new Recusa(404, 'Revisão não encontrada. Atualize a lista.');
  const outro = db.prepare('SELECT id FROM devolucao_caso WHERE devolucao_id=?').get(d.id);
  if(outro) throw new Recusa(409, 'A revisão #'+d.id+' já está ligada ao caso #'+outro.id+'.');
  const skuC = String(c.sku || '').toUpperCase(), skuD = String(d.sku_fisico || '').toUpperCase();
  const diferente = !!skuC && !!skuD && skuC !== skuD;
  if(diferente && !confirmar) throw new Recusa(409, 'O SKU recebido ('+skuD+') é diferente do vendido ('+skuC+'). Confirme para ligar: isso fica registrado como envio diferente.', { sku_diferente:true });
  db.transaction(() => {
    db.prepare(`UPDATE devolucao_caso SET devolucao_id=?, chegou_em=COALESCE(chegou_em, ?),
      etapa='revisado', etapa_desde=datetime('now','localtime'), etiqueta_devolucao=COALESCE(?, etiqueta_devolucao) WHERE id=?`)
      .run(d.id, d.recebido_em || null, etiquetaDeDevolucao(c, d.codigo_ml), c.id);
    if(!c.chegou_em && !d.recebido_em) db.prepare("UPDATE devolucao_caso SET chegou_em=datetime('now','localtime') WHERE id=?").run(c.id);
    evento(db, c.id, 'revisado', c.etapa, 'revisado', 'revisão #'+d.id+' ligada à mão (etiqueta bipada: '+(d.codigo_ml || '—')+')'+
      (diferente ? ' · SKU recebido '+skuD+' diferente do vendido '+skuC : ''), nomeDe(usuario));
    if(d.baixado && c.tipo === 'ml') evento(db, c.id, 'baixa', null, null, 'a revisão #'+d.id+' já tinha baixa — falta marcar "Já revisei" no ML', nomeDe(usuario));
  })();
  return ler(db, c.id);
}

/* O que a revisão do Edvaldo diz da peça: a etiqueta bipada, a hora e a
   triagem. É com isso que se separam três 150×150 cinza (AJUSTE de
   03/11/2026, dono). Sem nenhum valor em reais. */
const CAMPOS_REVISAO = ['id','codigo_ml','sku_fisico','destinacao','recebido_em','embalagem','tecido','tubo','base','comando','kit','obs'];
function revisaoLigada(db, devolucao_id){
  if(!devolucao_id) return null;
  return db.prepare('SELECT '+CAMPOS_REVISAO.join(',')+' FROM devolucao WHERE id=?').get(devolucao_id) || null;
}

/* DESLIGAR A REVISÃO ERRADA (AJUSTE de 03/11/2026, decisão do dono "a"):
   ligou-se a peça de outro cliente. Com motivo, o caso fica sem revisão, volta
   a "Chegou" (a chegada continua) e REABRE se encerrou por causa dela (o ML
   devolve). A BAIXA dada naquela peça é desfeita junto: a reputação e o motivo
   vieram do caso errado — ela volta solta e pendente na Baixa, e recebe a
   baixa certa quando for ligada ao caso dela. O "Já revisei" não se desfaz no
   ML; a história avisa para marcar de novo depois de ligar a peça certa.
   Encerrado por decisão de dinheiro (perda, comprador, reembolso) não volta
   por aqui. */
function desligarRevisao(db, caso_id, motivo, usuario){
  const c = ler(db, caso_id);
  if(!c) throw new Recusa(404, 'Caso não encontrado. Atualize a lista.');
  if(!c.devolucao_id) throw new Recusa(409, 'O caso #'+c.id+' não tem revisão ligada.');
  if(c.encerrado_em && c.saida !== 'revisado_ml')
    throw new Recusa(409, 'O caso #'+c.id+' foi encerrado como "'+(NOME_SAIDA[c.saida]||c.saida||'')+'": a revisão dele não se desliga por aqui.');
  const m = String(motivo || '').trim();
  if(!m) throw new Recusa(400, 'Diga por que esta não é a peça certa (por exemplo: a etiqueta é da venda de outro cliente).');
  const d = db.prepare('SELECT * FROM devolucao WHERE id=?').get(c.devolucao_id) || { id:c.devolucao_id };
  const etq = etiquetaDeDevolucao(c, d.codigo_ml);
  const quem = nomeDe(usuario);
  db.transaction(() => {
    if(d.baixado){
      db.prepare('UPDATE devolucao SET baixado=0, baixado_em=NULL, reputacao=NULL, motivo=NULL WHERE id=?').run(d.id);
      evento(db, c.id, 'baixa', null, null, 'baixa da revisão #'+d.id+' desfeita (era: afetou a reputação '+(d.reputacao||'—')+' · motivo '+(d.motivo||'—')+
        (d.baixado_em ? ' · de '+d.baixado_em.slice(8,10)+'/'+d.baixado_em.slice(5,7) : '')+') — ela volta para a Baixa sem caso', quem);
    }
    db.prepare(`UPDATE devolucao_caso SET devolucao_id=NULL, etapa='chegou', etapa_desde=datetime('now','localtime'),
      chegou_em=COALESCE(chegou_em, datetime('now','localtime')), encerrado_em=NULL, encerrado_por=NULL, saida=NULL,
      etiqueta_devolucao=CASE WHEN etiqueta_devolucao=? THEN NULL ELSE etiqueta_devolucao END WHERE id=?`).run(etq, c.id);
    const avisos = [];
    if(c.encerrado_em) avisos.push('caso reaberto');
    if(c.etapa === 'ml_revisei' || (c.encerrado_em && c.tipo === 'ml')) avisos.push('o "Já revisei" tinha sido marcado com esta peça — marque de novo depois de ligar a certa');
    evento(db, c.id, 'desligado', c.etapa, 'chegou', 'revisão #'+d.id+' desligada (etiqueta bipada: '+(d.codigo_ml || '—')+') · motivo: '+m+
      (avisos.length ? ' · '+avisos.join(' · ') : ''), quem);
  })();
  return ler(db, c.id);
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
  if(c.tipo === 'ml'){
    /* A baixa encerra o ML devolve só com o "Já revisei" marcado e sem
       revisão pedida esperando resposta (decisões do dono, 03/11/2026): o caso
       não some da lista antes de alguém avisar o ML ou de o ML responder. */
    const falta = [];
    if(c.etapa !== 'ml_revisei') falta.push('marcar "Já revisei" no ML');
    if(c.revisao_pedida_em && !c.revisao_resultado) falta.push('a resposta da revisão do frete');
    if(falta.length) evento(db, c.id, 'baixa', null, null, 'baixa da devolução #'+devolucao_id+' — o caso fica aberto: falta '+falta.join(' e '), nomeDe(usuario));
    else talvezEncerrarML(db, c.id, usuario, true, 'baixa da devolução #'+devolucao_id);
  }
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
  /* Os dois AVISOS (AJUSTE de 03/11/2026) — avisam, nunca travam: a coleta
     agendada depois do prazo da coleta, e o custo acima do limite do frete
     que o ML paga. O do limite fala de reais: só vai com os valores. */
  const c = ler(db, caso_id) || {};
  return db.prepare(`SELECT k.id,k.transportadora_id,t.nome transportadora,k.cep,k.pedida_em,k.agendada_para,k.custo,k.resultado,k.obs,k.usuario
      FROM devolucao_coleta k LEFT JOIN transportadora t ON t.id=k.transportadora_id
      WHERE k.caso_id=? ORDER BY k.id`).all(caso_id)
    .map((k, i) => {
      const o = Object.assign({ numero:i+1 }, k);
      if(k.agendada_para && c.prazo_coleta && k.agendada_para > c.prazo_coleta)
        o.aviso_agenda = 'Agendada para '+br(k.agendada_para)+', depois do prazo da coleta ('+br(c.prazo_coleta)+'). Peça prorrogação ao ML ou remarque.';
      if(comDinheiro && k.custo != null && c.limite_frete != null && k.custo > c.limite_frete)
        o.aviso_limite = 'O custo passa do limite do frete que o ML paga.';
      if(!comDinheiro) delete o.custo;
      return o;
    });
}

/* A data agendada da coleta, lançada ou remarcada depois do pedido (quem
   acompanha). Vazio apaga. Só avisa se passar do prazo — nunca trava. */
function agendarColeta(db, caso_id, b, usuario){
  const c = aberto(db, caso_id);
  b = b || {};
  const k = db.prepare('SELECT * FROM devolucao_coleta WHERE id=? AND caso_id=?').get(+b.tentativa_id || 0, c.id);
  if(!k) throw new Recusa(404, 'Tentativa não encontrada neste caso.');
  const d = agendaValida(b.agendada_para);
  if(d === (k.agendada_para || null)) return ler(db, c.id);
  const num = db.prepare('SELECT COUNT(*) n FROM devolucao_coleta WHERE caso_id=? AND id<=?').get(c.id, k.id).n;
  db.transaction(() => {
    db.prepare('UPDATE devolucao_coleta SET agendada_para=? WHERE id=?').run(d, k.id);
    evento(db, c.id, 'coleta', k.agendada_para, d, num+'ª tentativa · '+(d ? 'agendada para '+br(d) : 'data agendada apagada'), nomeDe(usuario));
  })();
  return ler(db, c.id);
}
function agendaValida(v){
  if(!String(v == null ? '' : v).trim()) return null;
  const d = dataValida(v);
  if(!d) throw new Recusa(400, 'Data impossível em "coleta agendada para".');
  return d;
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
  const agendada = agendaValida(b.agendada_para);
  const cep = cepDe(b.cep) || c.cep;
  const ja = db.prepare("SELECT id FROM devolucao_coleta WHERE caso_id=? AND resultado='aguardando'").get(c.id);
  if(ja) throw new Recusa(409, 'Já há uma tentativa de coleta aguardando neste caso. Registre o resultado dela antes.');
  const n = db.prepare('SELECT COUNT(*) n FROM devolucao_coleta WHERE caso_id=?').get(c.id).n + 1;
  db.transaction(() => {
    db.prepare('INSERT INTO devolucao_coleta (caso_id,transportadora_id,cep,custo,obs,usuario,agendada_para) VALUES (?,?,?,?,?,?,?)')
      .run(c.id, t.id, cep, custo, String(b.obs||'').trim() || null, nomeDe(usuario), agendada);
    if(cep && !c.cep) db.prepare('UPDATE devolucao_caso SET cep=? WHERE id=?').run(cep, c.id);
    const tx = n+'ª tentativa · '+t.nome + (agendada ? ' · agendada para '+br(agendada) : '');
    if(c.etapa !== 'coleta_pedida') moverEtapa(db, c, 'coleta_pedida', usuario, tx, 'coleta');
    else evento(db, c.id, 'coleta', null, null, tx, nomeDe(usuario));
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

/* ═══ FASE 4 — documentos e a foto do comprador ═══ */

function docsExigidos(db){
  try{ return db.prepare("SELECT valor FROM listas WHERE tipo='doc_devolucao' AND ativo=1 ORDER BY ordem,id").all().map(x => x.valor); }
  catch(e){ return []; }
}
function situacaoDocs(db, caso_id){
  const tem = new Set(db.prepare("SELECT DISTINCT doc_tipo FROM devolucao_anexo WHERE caso_id=? AND tipo='doc'").all(caso_id).map(x => x.doc_tipo));
  return docsExigidos(db).map(d => ({ doc:d, ok: tem.has(d) }));
}
function listarAnexos(db, caso_id){
  return db.prepare('SELECT id,tipo,doc_tipo,usuario,criado_em, arquivo FROM devolucao_anexo WHERE caso_id=? ORDER BY id').all(caso_id)
    .map(a => ({ id:a.id, tipo:a.tipo, doc_tipo:a.doc_tipo, usuario:a.usuario, criado_em:a.criado_em,
                 formato: /\.pdf$/i.test(a.arquivo||'') ? 'pdf' : 'imagem' }));
}

/* O arquivo como chega da tela (data URL). Foto pela régua ÚNICA do `foto.js`
   (foto vazia não é prova); PDF tem que começar com %PDF. Devolve null quando
   não serve. */
function decodificarAnexo(s, soImagem){
  const F = require('./foto');
  const img = F.decodificarFoto(s);
  if(img) return { ext: img.ext === 'jpeg' ? 'jpg' : img.ext, buf: img.buf };
  if(soImagem) return null;
  const m = String(s||'').match(/^data:application\/pdf;base64,([A-Za-z0-9+/=\s]+)$/i);
  if(!m) return null;
  const buf = Buffer.from(m[1].replace(/\s+/g,''), 'base64');
  if(buf.length < 1000 || buf.slice(0,4).toString() !== '%PDF') return null;
  return { ext:'pdf', buf };
}

/* Anexar (R11, R17, R21). A linha e o arquivo nascem JUNTOS: o arquivo é
   gravado DENTRO da transação, e se o disco recusar a linha não existe.
   `dir` é a pasta das devoluções (caminhos.js, chave DEVOLUCOES). */
function anexar(db, caso_id, b, usuario, dir){
  const c = aberto(db, caso_id);
  b = b || {};
  const tipo = String(b.tipo||'');
  if(['doc','foto_comprador'].indexOf(tipo) < 0) throw new Recusa(400, 'O anexo é um documento da coleta ou a foto do comprador.');
  let doc = null;
  if(tipo === 'doc'){
    doc = String(b.doc_tipo||'').trim();
    if(docsExigidos(db).indexOf(doc) < 0) throw new Recusa(400, 'Documento fora da lista de documentos da devolução: "'+doc+'".');
  }
  const arq = decodificarAnexo(b.arquivo, tipo === 'foto_comprador');
  if(!arq) throw new Recusa(400, tipo === 'foto_comprador'
    ? 'A foto do comprador tem que ser uma imagem com conteúdo (JPEG, PNG ou WebP). Foto vazia não é prova.'
    : 'O documento tem que ser uma imagem ou um PDF com conteúdo.');
  const fs = require('fs'), path = require('path');
  let id, caminho;
  try{
    db.transaction(() => {
      id = db.prepare('INSERT INTO devolucao_anexo (caso_id,tipo,doc_tipo,usuario) VALUES (?,?,?,?)').run(c.id, tipo, doc, nomeDe(usuario)).lastInsertRowid;
      fs.mkdirSync(dir, { recursive:true });
      caminho = path.join(dir, 'caso-'+c.id+'-anexo-'+id+'-'+tipo+'.'+arq.ext);
      fs.writeFileSync(caminho, arq.buf);
      db.prepare('UPDATE devolucao_anexo SET arquivo=? WHERE id=?').run(caminho, id);
      evento(db, c.id, 'anexo', null, null, tipo === 'doc' ? doc : 'foto do comprador', nomeDe(usuario));
    })();
  }catch(e){
    if(e instanceof Recusa) throw e;
    try{ if(caminho) fs.unlinkSync(caminho); }catch(x){}
    throw new Recusa(500, 'O disco recusou o arquivo: nada foi anexado. Tente de novo; se repetir, avise quem cuida do servidor.');
  }
  return id;
}
function arquivoDoAnexo(db, aid){
  const a = db.prepare('SELECT arquivo FROM devolucao_anexo WHERE id=?').get(+aid);
  if(!a || !a.arquivo) throw new Recusa(404, 'Anexo não encontrado.');
  return a.arquivo;
}

/* R17: devolver ao comprador em vez de coletar (chegou amassada). Só com a foto
   que o comprador mandou ao ML anexada. A chave é conferida na rota (R16). */
function devolverComprador(db, id, b, usuario){
  const c = aberto(db, id);
  const foto = db.prepare("SELECT 1 FROM devolucao_anexo WHERE caso_id=? AND tipo='foto_comprador' AND arquivo IS NOT NULL").get(c.id);
  if(!foto) throw new Recusa(400, 'Anexe antes a foto que o comprador mandou ao ML: sem ela o caso não encerra por este caminho.');
  const v = reais((b||{}).valor_devolvido, 'o valor devolvido');
  db.transaction(() => encerrar(db, c, 'devolvido_comprador', usuario, (b||{}).texto, { valor_devolvido: v }))();
  return ler(db, c.id);
}

/* ═══ FASE 5 — o dinheiro e o relatório ═══ */

const SITUACOES_VALOR = { ja_veio:'já veio', pedir:'precisamos pedir ao ML', pedido:'pedimos, esperando o ML' };

/* R18: a SITUAÇÃO do valor do ML não é dinheiro — quem acompanha marca
   "precisamos pedir" e "pedimos". O NÚMERO é do admin geral. */
function situacaoValor(db, id, sit, usuario){
  const c = aberto(db, id);
  if(c.tipo !== 'coleta') throw new Recusa(400, 'No "ML devolve" não há valor de coleta.');
  if(!SITUACOES_VALOR[sit]) throw new Recusa(400, 'A situação do valor é: já veio, precisamos pedir, ou pedimos.');
  if(sit === c.valor_ml_situacao) throw new Recusa(400, 'O valor já está nessa situação.');
  db.transaction(() => {
    db.prepare("UPDATE devolucao_caso SET valor_ml_situacao=?, valor_ml_desde=datetime('now','localtime') WHERE id=?").run(sit, c.id);
    evento(db, c.id, 'valor_situacao', c.valor_ml_situacao, sit, 'valor do ML: '+SITUACOES_VALOR[sit], nomeDe(usuario));
  })();
  return ler(db, c.id);
}

/* Os valores em reais (devolucao.dinheiro, conferida na rota). CAMPO AUSENTE
   NÃO É CAMPO VAZIO; vazio de propósito apaga (vira nulo, e o total do mês
   vira piso). Vale também no caso encerrado: o valor perdido costuma chegar
   depois. A história diz O QUE mudou, nunca o número — quem acompanha lê a
   história e não pode ler os reais (R15). Devolve a lista do que mudou. */
function lancarValor(db, id, b, usuario){
  const c = ler(db, id);
  if(!c) throw new Recusa(404, 'Caso não encontrado. Atualize a lista.');
  b = b || {};
  const sets = [], vals = [], mud = [];
  const ROT = { valor_ml:'valor do ML', valor_perdido:'valor perdido', valor_devolvido:'valor devolvido', custo_etiqueta:'custo da etiqueta de devolução', valor_revisao:'frete devolvido na revisão', limite_frete:'limite do frete do ML' };
  if('limite_frete' in b && c.tipo !== 'coleta') throw new Recusa(400, 'O limite do frete é do "Nós coletamos": no "ML devolve" quem paga a coleta é o ML.');
  for(const k of Object.keys(ROT)){
    if(!(k in b)) continue;
    const v = reais(b[k], ROT[k]);
    if(v === c[k]) continue;
    sets.push(k+'=?'); vals.push(v); mud.push(ROT[k]);
  }
  if('valor_ml' in b && b.valor_ml !== '' && b.valor_ml != null && !('valor_ml_situacao' in b) && c.valor_ml_situacao !== 'ja_veio'){
    sets.push("valor_ml_situacao='ja_veio'", "valor_ml_desde=datetime('now','localtime')");
  }
  if('valor_ml_situacao' in b){
    if(!SITUACOES_VALOR[b.valor_ml_situacao]) throw new Recusa(400, 'A situação do valor é: já veio, precisamos pedir, ou pedimos.');
    if(b.valor_ml_situacao !== c.valor_ml_situacao){ sets.push('valor_ml_situacao=?', "valor_ml_desde=datetime('now','localtime')"); vals.push(b.valor_ml_situacao); mud.push('situação do valor do ML'); }
  }
  let tent = null, custo;
  if('tentativa_id' in b){
    tent = db.prepare('SELECT * FROM devolucao_coleta WHERE id=? AND caso_id=?').get(+b.tentativa_id || 0, c.id);
    if(!tent) throw new Recusa(404, 'Tentativa não encontrada neste caso.');
    custo = reais(b.custo, 'o custo da coleta');
    const num = db.prepare('SELECT COUNT(*) n FROM devolucao_coleta WHERE caso_id=? AND id<=?').get(c.id, tent.id).n;
    if(custo !== tent.custo) mud.push('custo da '+num+'ª tentativa');
  }
  if(!mud.length) return mud;
  db.transaction(() => {
    if(sets.length) db.prepare('UPDATE devolucao_caso SET '+sets.join(',')+' WHERE id=?').run(...vals, c.id);
    if(tent && custo !== tent.custo) db.prepare('UPDATE devolucao_coleta SET custo=? WHERE id=?').run(custo, tent.id);
    evento(db, c.id, 'valor', null, null, 'lançado: '+mud.join(', '), nomeDe(usuario));
  })();
  return mud;
}

/* R16, R19: a baixa do reembolso, conferida no Mercado Pago. Só encerra o
   "nós coletamos" que já foi REVISADO (a peça voltou e o Edvaldo a viu). */
function baixaReembolso(db, id, resultado, usuario){
  const c = aberto(db, id);
  if(c.tipo !== 'coleta') throw new Recusa(400, 'O "ML devolve" encerra na baixa da devolução, sem reembolso de coleta.');
  const saida = { recebido:'reembolso_recebido', nao_recebido:'reembolso_nao_recebido' }[resultado];
  if(!saida) throw new Recusa(400, 'O reembolso foi "recebido" ou "não recebido".');
  if(!c.devolucao_id) throw new Recusa(400, 'A peça ainda não foi revisada na tela de Devoluções: o caso só encerra depois da revisão.');
  db.transaction(() => encerrar(db, c, saida, usuario, 'conferido no Mercado Pago'))();
  return ler(db, c.id);
}

/* R22: O MÊS POR MOTIVO, NUMA RÉGUA SÓ. Conta os casos lançados no mês E as
   devoluções recebidas no mês que NÃO estão ligadas a caso nenhum (pelo motivo
   da baixa) — a devolução ligada a um caso conta uma vez, pelo caso. O
   dinheiro (só com a chave) separa a perda por prazo do devolvido ao
   comprador, e sai como PISO quando falta algum valor (R9). */
function relatorio(db, mes, comDinheiro){
  if(!/^\d{4}-(0[1-9]|1[0-2])$/.test(String(mes||''))) throw new Recusa(400, 'Mês impossível. Use AAAA-MM.');
  const casos = db.prepare("SELECT * FROM devolucao_caso WHERE teste=0 AND substr(criado_em,1,7)=?").all(mes);
  let semCaso = [];
  try{
    semCaso = db.prepare(`SELECT motivo FROM devolucao d WHERE COALESCE(d.teste,0)=0 AND substr(d.data,1,7)=?
      AND NOT EXISTS (SELECT 1 FROM devolucao_caso c WHERE c.devolucao_id=d.id)`).all(mes);
  }catch(e){}
  const SEM = 'sem motivo';
  const por = new Map();
  const linha = (m) => { const k = m || SEM; if(!por.has(k)) por.set(k, { motivo:k, qtd:0, casos:0, sem_caso:0, publicidade:0, perda_prazo:0, devolvido_comprador:0 }); return por.get(k); };
  for(const c of casos){
    const l = linha(c.motivo); l.qtd++; l.casos++;
    if(c.publicidade === 1) l.publicidade++;
    if(c.saida === 'perda_prazo' && c.valor_perdido != null) l.perda_prazo += c.valor_perdido;
    if(c.saida === 'devolvido_comprador' && c.valor_devolvido != null) l.devolvido_comprador += c.valor_devolvido;
  }
  for(const d of semCaso){ const l = linha(d.motivo); l.qtd++; l.sem_caso++; }
  const r2 = (v) => Math.round(v * 100) / 100;
  const por_motivo = Array.from(por.values()).sort((a,b) => b.qtd - a.qtd || a.motivo.localeCompare(b.motivo))
    .map(l => comDinheiro ? Object.assign(l, { perda_prazo:r2(l.perda_prazo), devolvido_comprador:r2(l.devolvido_comprador) })
                          : { motivo:l.motivo, qtd:l.qtd, casos:l.casos, sem_caso:l.sem_caso, publicidade:l.publicidade });
  const out = { mes, total: casos.length + semCaso.length, casos: casos.length, sem_caso: semCaso.length, por_motivo,
                por_saida: casos.reduce((a,c) => { if(c.saida) a[c.saida] = (a[c.saida]||0) + 1; return a; }, {}),
                /* Só os casos: a devolução recebida sem caso não tem a pergunta. */
                publicidade: { sim: casos.filter(c => c.publicidade === 1).length,
                               nao: casos.filter(c => c.publicidade === 0).length,
                               nao_informado: casos.filter(c => c.publicidade == null).length } };
  if(comDinheiro){
    const coleta = casos.filter(c => c.tipo === 'coleta');
    const ids = coleta.map(c => c.id);
    const tent = ids.length ? db.prepare('SELECT custo FROM devolucao_coleta WHERE caso_id IN ('+ids.map(()=>'?').join(',')+')').all(...ids) : [];
    const faltam = [];
    const semValor = coleta.filter(c => c.valor_ml == null && !['devolvido_comprador'].includes(c.saida)).length;
    const semCusto = tent.filter(t => t.custo == null).length;
    const perdaSem = casos.filter(c => c.saida === 'perda_prazo' && c.valor_perdido == null).length;
    const devSem = casos.filter(c => c.saida === 'devolvido_comprador' && c.valor_devolvido == null).length;
    if(semValor) faltam.push(semValor+' caso(s) sem o valor do ML');
    if(semCusto) faltam.push(semCusto+' tentativa(s) de coleta sem custo');
    if(perdaSem) faltam.push(perdaSem+' perda(s) por prazo sem o valor perdido');
    if(devSem) faltam.push(devSem+' devolução(ões) ao comprador sem o valor devolvido');
    const valor_ml = r2(coleta.reduce((a,c) => a + (c.valor_ml || 0), 0));
    const custos = r2(tent.reduce((a,t) => a + (t.custo || 0), 0));
    out.dinheiro = { valor_ml, custos, saldo: r2(valor_ml - custos),
      perda_prazo: r2(casos.filter(c => c.saida === 'perda_prazo').reduce((a,c) => a + (c.valor_perdido || 0), 0)),
      devolvido_comprador: r2(casos.filter(c => c.saida === 'devolvido_comprador').reduce((a,c) => a + (c.valor_devolvido || 0), 0)),
      /* As etiquetas de devolução que o ML cobrou, de todos os casos do mês
         (o "ML devolve" também tem). Fora do saldo da coleta: não é custo de
         coleta, e o saldo do "nós coletamos" não muda. */
      custo_etiqueta: r2(casos.reduce((a,c) => a + (c.custo_etiqueta || 0), 0)),
      // O que a revisão trouxe de volta, e o que ficou de prejuízo no frete.
      frete_devolvido: r2(casos.reduce((a,c) => a + (c.valor_revisao || 0), 0)),
      frete_prejuizo: r2(casos.reduce((a,c) => a + (c.custo_etiqueta || 0), 0) - casos.reduce((a,c) => a + (c.valor_revisao || 0), 0)),
      piso: faltam.length > 0, faltam };
  }
  return out;
}

/* A BUSCA (AJUSTE de 03/11/2026): "esta reclamação já foi lançada?". Pelo
   número da NF, da venda ou do pack — inteiro ou um pedaço, a partir de 3
   dígitos —, nos casos ABERTOS e nos ENCERRADOS: o encerrado também responde
   "já foi". Os espaços que o leitor manda saem. Os abertos vêm primeiro. */
function buscar(db, q, opt){
  const d = String(q || '').replace(/\D/g, '');
  if(d.length < 3) throw new Recusa(400, 'Digite pelo menos 3 números da NF, da venda ou do pack.');
  const o = opt || {}, h = hoje(db), lim = limites(db);
  const cu = o.comDinheiro ? custosPorCaso(db) : null;
  const like = '%' + d + '%';
  return comBaixa(db, db.prepare(`SELECT * FROM devolucao_caso WHERE venda LIKE ? OR pack_id LIKE ? OR nf LIKE ? OR etiqueta_devolucao LIKE ?
      ORDER BY (encerrado_em IS NOT NULL), id DESC LIMIT 30`).all(like, like, like, like))
    .map(c => publico(c, h, lim, o.comDinheiro, cu));
}

/* ═══ O PRÓXIMO PASSO (spec DEVOLUCOES-PROXIMO-PASSO, fase 1, 04/11/2026) ═══
   Todo caso aberto diz, numa frase, o próximo passo, de quem é a vez e até
   quando. O passo é CALCULADO do que já está gravado — nunca gravado, nunca
   digitado — e não muda regra nenhuma: só lê. A primeira linha do mapa (§3 da
   spec) que bate é o passo. Dono único: a lista e o caso leem daqui; uma
   segunda régua na tela divergiria no primeiro ajuste (#12).
   ⚠️ NENHUM NÚMERO EM REAIS NO PASSO: ele vai a quem acompanha e a quem só
   lança, e a varredura do teste recusa. Só datas e dias.
   `vez`: nos · dinheiro · receber_peca (a gente) · transportadora · ml (outros). */
const VEZ_NOSSA = ['nos','dinheiro','receber_peca'];
const QUEM = { nos:'quem acompanha', dinheiro:'quem tem a permissão do dinheiro das devoluções',
  receber_peca:'quem recebe a peça (tela Receber peça)', transportadora:'a transportadora', ml:'o Mercado Livre' };
function passo(texto, vez, ate, acao, quem){
  return { texto, vez, ate: ate || null, acao: acao || null, quem: quem || QUEM[vez], nossa: VEZ_NOSSA.indexOf(vez) >= 0 };
}
const diasTxt = (n) => n === 1 ? '1 dia' : (n || 0)+' dias';
/* ctx: { tentativas (as do caso, em ordem), docs (situacaoDocs), avisado, h, lim, sit } */
function proximoPasso(c, ctx){
  if(!c || c.encerrado_em) return null;
  ctx = ctx || {};
  const h = ctx.h, lim = ctx.lim || { parado: parseInt(PADROES.devol_parado_dias, 10) };
  const sit = ctx.sit || situacao(c, h, lim);
  if(c.tipo === 'coleta'){
    // C1 — algum prazo vencido: pode ter havido prorrogação não lançada (R7).
    if(sit.cor === 'vencido')
      return passo('O prazo de "'+String(sit.prazo_nome||'').toLowerCase()+'" venceu em '+br(sit.prazo_data)+': lançar o prazo novo do ML ou encerrar como perda', 'dinheiro', sit.prazo_data, 'prazo');
    const i = ETAPAS.coleta.indexOf(c.etapa);
    const prazoCom = c.prazo || null, prazoCol = c.prazo_coleta || null;
    if(!c.chegou_em && !c.devolucao_id && i < ETAPAS.coleta.indexOf('a_caminho')){
      const ts = ctx.tentativas || [];
      const ult = ts.length ? ts[ts.length-1] : null;
      const ant = ts.length > 1 ? ts[ts.length-2] : null;
      // C2 — ainda sem transportadora (ou a última já coletou e a etapa ficou para trás).
      if(!ult || ult.resultado !== 'aguardando')
        return passo('Pedir a coleta à transportadora'+(c.cep ? ' (a sugestão sai pelo CEP)' : ''), 'nos', prazoCol || prazoCom, 'pedir_coleta');
      if(!ult.agendada_para){
        // C4 — a última ida não achou o cliente: remarcar dentro do prazo da coleta.
        if(ant && ant.resultado === 'nao_encontrou')
          return passo('Remarcar a coleta: a transportadora não achou o cliente'+(prazoCol ? ' — antes de '+br(prazoCol)+' (prazo da coleta)' : ''), 'nos', prazoCol, 'agendar');
        // C3 — coleta pedida sem a data.
        return passo('Confirmar com a transportadora a data da coleta e lançar', 'nos', prazoCol || prazoCom, 'agendar');
      }
      // C5 — coleta agendada, o comprovante ainda não foi ao ML.
      if(i < ETAPAS.coleta.indexOf('docs_enviados')){
        const faltam = (ctx.docs || []).filter(d => !d.ok).map(d => d.doc);
        return passo(faltam.length
            ? 'Mandar o comprovante do agendamento ao ML — anexar: '+faltam.join(', ')
            : 'Mandar o comprovante do agendamento ao ML e marcar "Documentos ao ML"', 'nos', prazoCom, 'docs');
      }
      // C6 — documentos no ML, a data ainda não chegou.
      if(ult.agendada_para >= h)
        return passo('Aguardar a coleta de '+br(ult.agendada_para), 'transportadora', ult.agendada_para, 'resultado_coleta');
      // C7 — a data passou e ninguém lançou que coletou.
      return passo('Ligar para a transportadora: a coleta de '+br(ult.agendada_para)+' não foi confirmada — lançar o resultado', 'nos', prazoCol, 'resultado_coleta');
    }
    // C8 — a caminho; parado há N dias devolve a vez para nós.
    if(!c.chegou_em && !c.devolucao_id){
      if(sit.dias_parado !== null && sit.dias_parado >= lim.parado)
        return passo('Cobrar a transportadora: a caixa foi coletada há '+diasTxt(sit.dias_parado)+' e não chegou', 'nos', null, 'chegou');
      return passo('Acompanhar a entrega; quando chegar, marcar "A caixa chegou"', 'transportadora', null, 'chegou');
    }
    // C9 — chegou e não foi revisada.
    if(!c.devolucao_id) return passo('Revisar a peça na tela Receber peça', 'receber_peca', null, 'revisar');
    // C10 — revisada, o ML não sabe que recebemos.
    if(!ctx.avisado && c.etapa !== 'ml_avisado') return passo('Avisar o ML que recebemos a peça', 'nos', null, 'aviso_ml');
    // C11 a C13 — o valor da coleta e o reembolso.
    const sv = c.valor_ml_situacao;
    if(!sv || sv === 'pedir') return passo('Pedir ao ML o valor da coleta (ou marcar que já veio)', 'nos', null, 'valor');
    if(sv === 'pedido'){
      const dv = dias(c.valor_ml_desde || c.criado_em, h);
      if(dv !== null && dv >= lim.parado)
        return passo('Cobrar o ML: o valor da coleta foi pedido há '+diasTxt(dv)+' e não veio', 'nos', null, 'valor');
      return passo('Aguardar o ML pagar o valor da coleta (pedido há '+diasTxt(dv)+')', 'ml', null, 'valor');
    }
    return passo('Conferir no Mercado Pago e dar a baixa do reembolso', 'dinheiro', null, 'reembolso');
  }
  // ── ML devolve ──
  const avisado = c.etapa === 'ml_revisei';
  // M1 — o "revisar no ML até" venceu: o prazo de contestar passou.
  if(sit.cor === 'vencido' && sit.prazo_qual === 'revisar'){
    if(!c.devolucao_id) return passo('Revisar a peça hoje na tela Receber peça: o prazo do ML para revisar venceu em '+br(c.revisar_ate), 'receber_peca', c.revisar_ate, 'revisar');
    return passo('Marcar "Já revisei" no ML hoje: o prazo de contestar venceu em '+br(c.revisar_ate), 'nos', c.revisar_ate, 'revisei');
  }
  // M2 — a peça ainda não chegou.
  if(!c.chegou_em && !c.devolucao_id)
    return passo('Nada a fazer: o ML traz a peça (há '+diasTxt(sit.dias_esperando)+'); quando chegar, marcar "A caixa chegou"', 'ml', null, 'chegou');
  // M3 — chegou e não foi revisada.
  if(!c.devolucao_id) return passo('Revisar a peça na tela Receber peça', 'receber_peca', c.revisar_ate, 'revisar');
  // M4 — o `falta` que já existe, em ordem.
  if(!c.dev_baixado) return passo('Dar a baixa da devolução (reputação e motivo)', 'nos', c.revisar_ate, 'baixa', 'quem dá baixa em devolução');
  if(!avisado) return passo('Marcar "Já revisei" no ML — e, se o problema não foi nosso, pedir a revisão do valor ou da reputação', 'nos', c.revisar_ate, 'revisei');
  // M5 — a revisão pedida espera o ML; parada, a vez volta para nós.
  if(c.revisao_pedida_em && !c.revisao_resultado){
    if(sit.revisao_parada) return passo('Cobrar o ML: a revisão foi pedida há '+diasTxt(sit.dias_revisao)+' e não teve resposta', 'nos', null, 'revisao_frete');
    return passo('Aguardar a resposta do ML à revisão (pedida há '+diasTxt(sit.dias_revisao)+')', 'ml', null, 'revisao_frete');
  }
  return passo('Conferir o caso: a baixa, o "Já revisei" e a revisão estão feitos e ele não encerrou', 'nos', null, null);
}
/* O passo de uma porção de casos abertos de uma vez — a lista não faz uma
   consulta por caso. Devolve as linhas com `proximo`. */
function comProximo(db, linhas, h, lim){
  const abertos = linhas.filter(c => !c.encerrado_em);
  if(!abertos.length) return linhas;
  const ids = new Set(abertos.map(c => c.id));
  const tent = new Map(), docs = new Map(), avisados = new Set();
  for(const k of db.prepare('SELECT caso_id,id,resultado,agendada_para FROM devolucao_coleta ORDER BY id').all())
    if(ids.has(k.caso_id)){ if(!tent.has(k.caso_id)) tent.set(k.caso_id, []); tent.get(k.caso_id).push(k); }
  const exig = docsExigidos(db);
  for(const a of db.prepare("SELECT DISTINCT caso_id,doc_tipo FROM devolucao_anexo WHERE tipo='doc'").all())
    if(ids.has(a.caso_id)){ if(!docs.has(a.caso_id)) docs.set(a.caso_id, new Set()); docs.get(a.caso_id).add(a.doc_tipo); }
  for(const e of db.prepare("SELECT DISTINCT caso_id FROM devolucao_evento WHERE tipo='aviso_ml'").all()) avisados.add(e.caso_id);
  return linhas.map(c => {
    if(c.encerrado_em) return c;
    const tem = docs.get(c.id) || new Set();
    c.proximo = proximoPasso(c, { h, lim, sit:c, tentativas: tent.get(c.id) || [],
      docs: exig.map(d => ({ doc:d, ok: tem.has(d) })), avisado: avisados.has(c.id) });
    return c;
  });
}

/* ═══ OS CASOS DE CADA RESPONSÁVEL E O HISTÓRICO DE DESEMPENHO (04/11/2026) ═══
   Spec docs/arquivo/DEVOLUCOES-DESEMPENHO.md. Dono único das duas contas: a
   tela só desenha. O caso conta para o RESPONSÁVEL (a pessoa escolhida no
   sistema, `responsavel_id`); o nome escrito à mão de antes não é pessoa e
   vai para "Sem responsável" — sem chute (decisões do dono, 04/11/2026).
   Nenhum valor em reais em nenhuma das duas. */
const SEM_RESP = 'Sem responsável';
/* O quadro dos casos ABERTOS, sobre as mesmas linhas da lista (já com o
   `proximo`, a cor e o parado): uma régua só. */
function resumoPorResponsavel(linhas){
  const m = new Map();
  for(const c of linhas){
    const id = c.responsavel_id || null;
    if(!m.has(id)) m.set(id, { id, nome: id ? (c.responsavel_nome || ('#'+id)) : SEM_RESP, casos:0, esperando:0, vencidos:0, vermelhos:0, parados:0 });
    const x = m.get(id);
    x.casos++;
    if(!c.proximo || c.proximo.nossa) x.esperando++;
    if(c.cor === 'vencido') x.vencidos++;
    if(c.cor === 'vermelho') x.vermelhos++;
    if(c.parado || c.revisao_parada) x.parados++;
  }
  return [...m.values()].sort((a,b) => (a.id === null) - (b.id === null) || b.vencidos - a.vencidos ||
    b.vermelhos - a.vermelhos || b.esperando - a.esperando || String(a.nome).localeCompare(String(b.nome), 'pt-BR'));
}
/* Mediana: o caso de 60 dias não esconde os outros (a régua do R-SMI-06). */
function mediana(ns){
  if(!ns.length) return null;
  const s = ns.slice().sort((a,b) => a-b), k = Math.floor(s.length/2);
  return s.length % 2 ? s[k] : Math.round((s[k-1] + s[k]) / 2 * 10) / 10;
}
/* O HISTÓRICO: os casos ENCERRADOS no mês, por responsável.
   - prazo do ML cumprido: o caso chegou à etapa que cumpre o prazo até o fim
     do dia do prazo FINAL (o prorrogado conta pelo prazo novo, e é contado à
     parte); chegou depois, ou fechou como perda sem chegar, é vencido; fechou
     por outro caminho sem chegar (devolvido ao comprador) não decide nada;
   - o tempo até encerrar é a mediana em dias corridos, com o maior ao lado;
   - parado é cada intervalo entre dois "andar" (ANDAM) que passou do
     `devol_parado_dias`. */
function desempenho(db, mes){
  if(!/^\d{4}-(0[1-9]|1[0-2])$/.test(String(mes||''))) throw new Recusa(400, 'Mês impossível. Use AAAA-MM.');
  const lim = limites(db);
  const casos = db.prepare("SELECT * FROM devolucao_caso WHERE teste=0 AND encerrado_em IS NOT NULL AND substr(encerrado_em,1,7)=? ORDER BY id").all(mes);
  const qEv = db.prepare('SELECT tipo,para,criado_em FROM devolucao_evento WHERE caso_id=? ORDER BY criado_em, id');
  const IDX = (e) => ETAPAS.coleta.indexOf(e);
  const pessoas = new Map();
  for(const c of casos){
    const evs = qEv.all(c.id);
    const dia = (t) => String(t || '').slice(0,10);
    /* O dia em que o caso chegou à etapa (ou adiante), ou null. */
    const chegouEm = (etapaMin) => { const e = evs.find(x => IDX(x.para) >= IDX(etapaMin) && x.para !== 'encerrado'); return e ? dia(e.criado_em) : null; };
    const prazos = [];
    const decide = (prazo, quando, prorrogado) => {
      if(!prazo) return;
      if(quando) prazos.push({ ok: quando <= prazo, prorrogado });
      else if(c.saida === 'perda_prazo') prazos.push({ ok:false, prorrogado });
    };
    if(c.tipo === 'coleta'){
      decide(c.prazo, chegouEm('docs_enviados'), !!c.prazo_original);
      decide(c.prazo_coleta, chegouEm('a_caminho'), !!c.prazo_coleta_original);
    } else if(c.revisar_ate){
      const e = evs.find(x => x.para === 'ml_revisei');
      decide(c.revisar_ate, e ? dia(e.criado_em) : null, false);
    }
    const andares = evs.filter(x => ANDAM.indexOf(x.tipo) >= 0).map(x => dia(x.criado_em));
    let vezes = 0, maior = 0;
    for(let i = 1; i < andares.length; i++){
      const g = dias(andares[i-1], andares[i]);
      if(g !== null && g >= lim.parado){ vezes++; if(g > maior) maior = g; }
    }
    const d = dias(c.aberta_em || c.criado_em, c.encerrado_em);
    const id = c.responsavel_id || null;
    if(!pessoas.has(id)) pessoas.set(id, { id, nome: id ? (c.responsavel_nome || ('#'+id)) : SEM_RESP, casos:0,
      prazos:{ cumpridos:0, vencidos:0, decididos:0, prorrogados:0 }, saidas:{}, _dias:[], vezes_parado:0, maior_parado:0, lista:[] });
    const p = pessoas.get(id);
    p.casos++;
    for(const x of prazos){ p.prazos.decididos++; if(x.ok) p.prazos.cumpridos++; else p.prazos.vencidos++; if(x.prorrogado) p.prazos.prorrogados++; }
    p.saidas[c.saida] = (p.saidas[c.saida] || 0) + 1;
    if(d !== null) p._dias.push(d);
    p.vezes_parado += vezes; if(maior > p.maior_parado) p.maior_parado = maior;
    p.lista.push({ id:c.id, tipo:c.tipo, venda:c.venda, nf:c.nf, comprador:c.comprador, saida:c.saida, saida_nome: NOME_SAIDA[c.saida] || c.saida,
      encerrado_em:c.encerrado_em, dias:d, prazos_cumpridos: prazos.filter(x => x.ok).length, prazos_vencidos: prazos.filter(x => !x.ok).length, vezes_parado:vezes });
  }
  const out = [...pessoas.values()].map(p => {
    const o = Object.assign({}, p, { dias_mediana: mediana(p._dias), dias_maior: p._dias.length ? Math.max(...p._dias) : null });
    delete o._dias;
    return o;
  }).sort((a,b) => (a.id === null) - (b.id === null) || String(a.nome).localeCompare(String(b.nome), 'pt-BR'));
  return { mes, parado_dias: lim.parado, nomes_saida: NOME_SAIDA, pessoas: out };
}

module.exports = {
  resumoPorResponsavel, desempenho,
  faltaLancamento, OBRIGATORIOS,
  responsaveis, responsavelValido,
  proximoPasso, comProximo, VEZ_NOSSA,
  buscar, lancarCompleto, trocarTipo, pedirRevisaoFrete, respostaRevisaoFrete, desfazerEtapa, podeDesfazer, mesmoComprador,
  SITUACOES_VALOR, situacaoValor, lancarValor, baixaReembolso, relatorio, custosPorCaso,
  docsExigidos, situacaoDocs, listarAnexos, anexar, arquivoDoAnexo, devolverComprador,
  RESULTADOS, listarTransportadoras, salvarTransportadora, tentativas, pedirColeta, resultadoColeta, sugerirTransportadoras,
  abertoPorCodigo, chegou, avisarML, ligarRevisao, baixaDaDevolucao,
  ETAPAS, MANUAIS, NOME_ETAPA, NOME_SAIDA, DINHEIRO, Recusa,
  garantir, hoje, dataValida, dias, limites, situacao, publico, evento,
  buscarLote, buscarLotePorNF, ler, abertoDaVenda, listar, encerrados, detalhe,
  motivoValido, reais, aberto, lancar, editar, etapa, moverEtapa, pedirProrrogacao, novoPrazo, prazosDoCaso, agendarColeta,
  talvezEncerrarML, esperadas, revisoesSoltas, ligarManual, desligarRevisao, candidatosPorFinais,
  encerrar, encerrarPerda
};

/* A CONFERENCIA DE ESTOQUE — dono unico do ciclo de inventario da PECA.
 * Fase 2 da spec ESTOQUE-LIVRO-E-CONFERENCIA (26/09/2026), refeita pela
 * versao 2 da spec (04/11/2026).
 *
 *   A conta cego ─▶ B conta cego (outra pessoa)
 *                     ├─ acharam a MESMA diferenca ─▶ APLICA SOZINHO (furo no relatorio)
 *                     └─ diferentes ─▶ C conta cego (terceira pessoa, contagem.desempatar)
 *                                       ├─ C bate com A ou B ─▶ APLICA SOZINHO
 *                                       └─ ninguem bate ─▶ FILA DO ADMIN (contagem.resolver)
 *
 * ⚠️ DESDE 04/11/2026 NAO HA APROVACAO QUANDO AS CONTAGENS BATEM (decisao do
 * dono, linha em docs/DECISOES.md). Duas pessoas que contaram as cegas e
 * acharam a mesma diferenca sao a prova; o dono LE o relatorio de furos. Os
 * itens que ja esperavam aprovacao pela regra velha no dia do deploy CONTINUAM
 * na fila (status `aprovar`), como a contagem_pendente antiga ficou — decisao
 * do dono.
 *
 * ⚠️ O QUE SE COMPARA E A DIFERENCA, NAO O NUMERO CONTADO. Cada contagem guarda
 * o LIVRE do momento em que terminou (saldo − pecas em caixa impressa e nao
 * conferida, `baixa_dominio.disponivel`), e a pergunta e "as duas acharam a
 * mesma DIFERENCA contra o sistema?". O que se aplica ao saldo e a diferenca,
 * nunca o numero contado — a embalagem do meio continua valendo (§5.5).
 *
 * ⚠️ MEXERAM NO SKU DURANTE A CONTAGEM → CONTA DE NOVO (§5.5-B). Cada contagem
 * guarda, no primeiro bipe (ou ao abrir o SKU), o livre e o ultimo id do livro.
 * No "terminei", se o livre mudou ou se o livro tem linha daquele SKU que nao
 * seja `conferencia`, a contagem nao vale: nao e gravada, e a tela pede para
 * recomecar. A spec dizia "linha no livro"; desde 22/10/2026 a etiqueta so
 * RESERVA (nao gera linha), e por isso a pergunta e o LIVRE — decisao do dono,
 * 04/11/2026. A conferencia (−1 de caixa ja impressa) nao mexe no livre: a
 * caixa ja estava fora da prateleira, e ela nao invalida.
 *
 * ⚠️ QUEM CONTA NUNCA RECEBE O SALDO — nem o JSON o traz (regra 14 do §13).
 * Nem a resposta do "terminei" diz se bateu.
 *
 * ⚠️ NINGUEM CONTA DUAS VEZES O MESMO SKU, E O ADMIN NAO RESOLVE O QUE CONTOU
 * (`outraPessoa`, no estoque_dominio). Vale para o Admin Geral.
 *
 * ⚠️ NENHUMA FUNCAO DAQUI ABRE TRANSACAO — quem chama decide o escopo, como no
 * estoque_dominio. A rota embrulha cada passo numa so.
 *
 * As tres rodadas (§6): a lista DIARIA (8 SKUs, seg a sex, nasce as 7h, com o
 * rodizio de duas pessoas), a QUINZENAL (todos, prazo de 3 dias uteis,
 * suspende a diaria) e a GERAL (o dono abre, com a expedicao parada).
 */
const ESTOQUE = require('./estoque_dominio');
const RELOGIO = require('./relogio');

const ABERTOS  = ['a_contar','recontar','terceira','aprovar'];   // item que ainda anda
const CONTANDO = ['a_contar','recontar','terceira'];             // item que espera uma contagem
const CONFERIU = ['confirmado','aprovado','aplicado'];           // item que conferiu o saldo

const MOTIVOS = ['Perda ou avaria','Erro de bipe na embalagem','Erro de bipe na etiqueta',
  'Devolucao nao lancada','Cancelamento nao lancado','Peca sem registro de entrada',
  'Contagem anterior errada','Outro'];

const DEGRAUS = ['Sobrou de ontem','Travou na etiqueta','Estoque mais baixo','Nunca conferido','Mais tempo sem conferir'];

function addCol(db, tabela, def){ try{ db.exec('ALTER TABLE ' + tabela + ' ADD COLUMN ' + def); }catch(e){ /* ja existe */ } }

function garantirSchema(db){
  db.exec("CREATE TABLE IF NOT EXISTS config (chave TEXT PRIMARY KEY, valor TEXT);");
  db.exec(`CREATE TABLE IF NOT EXISTS inventario_ciclo (
    id         INTEGER PRIMARY KEY AUTOINCREMENT,
    tipo       TEXT,
    aberto_por TEXT,
    aberto_em  TEXT DEFAULT (datetime('now','localtime')),
    fechado_em TEXT,
    status     TEXT DEFAULT 'aberto',
    teste      INTEGER DEFAULT 0,
    data       TEXT,
    prazo      TEXT
  );`);
  /* Colunas da v2 (04/11/2026), no fim, para o banco que ja existe (§17). */
  addCol(db, 'inventario_ciclo', 'data TEXT');
  addCol(db, 'inventario_ciclo', 'prazo TEXT');
  /* Um SKU por ciclo. As tres contagens moram na MESMA linha: a regra "quem
     contou nao reconta" e "quem contou nao resolve" e uma pergunta sobre a
     linha inteira.

     `saldo_na_contagem`, `saldo2` e `saldo3` guardam o LIVRE de quando cada
     contagem terminou; `inicio1/2/3` e `em1/2/3` sao o comeco e o fim (§5.5-B).
     `rascunho*` e a contagem EM ANDAMENTO: quem, quanto, quando comecou, e o
     livre e o ultimo id do livro naquele instante. */
  db.exec(`CREATE TABLE IF NOT EXISTS inventario_item (
    id                INTEGER PRIMARY KEY AUTOINCREMENT,
    ciclo_id          INTEGER,
    codigo            TEXT,
    status            TEXT DEFAULT 'a_contar',
    fora_do_plano     INTEGER DEFAULT 0,
    rascunho          INTEGER,
    rascunho_por      TEXT,
    rascunho_por_id   INTEGER,
    saldo_na_contagem INTEGER,
    contado1 INTEGER, por1 TEXT, por1_id INTEGER, em1 TEXT,
    saldo2   INTEGER, contado2 INTEGER, por2 TEXT, por2_id INTEGER, em2 TEXT,
    saldo3   INTEGER, contado3 INTEGER, por3 TEXT, por3_id INTEGER, em3 TEXT,
    diferenca         INTEGER,
    motivo            TEXT,
    obs               TEXT,
    decidido_por      TEXT,
    decidido_por_id   INTEGER,
    decidido_em       TEXT,
    movimento_id      INTEGER,
    anterior_id       INTEGER,
    criado_em         TEXT DEFAULT (datetime('now','localtime')),
    teste             INTEGER DEFAULT 0,
    degrau            INTEGER,
    ordem             INTEGER,
    inicio1 TEXT, inicio2 TEXT, inicio3 TEXT,
    rascunho_inicio   TEXT,
    rascunho_livre    INTEGER,
    rascunho_mov      INTEGER,
    veio_de           INTEGER
  );`);
  for(const c of ['degrau INTEGER','ordem INTEGER','inicio1 TEXT','inicio2 TEXT','inicio3 TEXT',
                  'rascunho_inicio TEXT','rascunho_livre INTEGER','rascunho_mov INTEGER','veio_de INTEGER'])
    addCol(db, 'inventario_item', c);
  db.exec('CREATE INDEX IF NOT EXISTS ix_inventario_item_codigo ON inventario_item(codigo, status)');
  garantirRecusa(db);
  /* O RODIZIO (§6.5): quem foi escalado em cada dia. `abriu_para_todos_em` e a
     marca das 10h: a escalada nao tinha comecado, e a contagem abriu para o
     setor — e o relatorio diz "escalada, nao contou". */
  db.exec(`CREATE TABLE IF NOT EXISTS inventario_escala (
    id                  INTEGER PRIMARY KEY AUTOINCREMENT,
    data                TEXT,
    ciclo_id            INTEGER,
    usuario_id          INTEGER,
    usuario_nome        TEXT,
    papel               TEXT DEFAULT 'escalada',
    abriu_para_todos_em TEXT,
    teste               INTEGER DEFAULT 0
  );`);
  db.exec('CREATE INDEX IF NOT EXISTS ix_inventario_escala ON inventario_escala(data, ciclo_id)');
  /* A primeira quinzenal e 15 dias DEPOIS do deploy, e nao no primeiro boot:
     abrir no dia da subida jogaria o catalogo inteiro em cima da equipe no
     mesmo dia em que ela conhece a tela nova. Uma vez so. */
  try{ db.prepare("INSERT OR IGNORE INTO config (chave,valor) VALUES ('quinzenal_base', ?)").run(RELOGIO.hoje()); }catch(e){}
  /* A lista de motivos nasce com os oito da spec (§5.7) e e editavel. */
  try{
    db.exec("CREATE TABLE IF NOT EXISTS listas (id INTEGER PRIMARY KEY AUTOINCREMENT, tipo TEXT, valor TEXT, ordem INTEGER DEFAULT 0, ativo INTEGER DEFAULT 1)");
    if(!db.prepare("SELECT COUNT(*) c FROM listas WHERE tipo='motivo_estoque'").get().c){
      const ins = db.prepare("INSERT INTO listas (tipo,valor,ordem) VALUES ('motivo_estoque',?,?)");
      MOTIVOS.forEach((v,i) => ins.run(v, i));
    }
  }catch(e){}
}

/* A RECUSA "SEM ESTOQUE" DA ETIQUETA DE VENDA (§6.1, degrau 1). O `etq_route`
   grava aqui; quem le e a lista do dia seguinte. Uma DDL so, chamada pelos
   dois — duas copias da mesma tabela divergem. */
function garantirRecusa(db){
  db.exec(`CREATE TABLE IF NOT EXISTS recusa_estoque (
    id           INTEGER PRIMARY KEY AUTOINCREMENT,
    codigo       TEXT,
    em           TEXT DEFAULT (datetime('now','localtime')),
    usuario_nome TEXT,
    lote_id      INTEGER,
    teste        INTEGER DEFAULT 0,
    usuario_id   INTEGER
  );`);
  /* Quem tentou imprimir, pelo id (QUEM-FEZ-E-REVISAO fase 3, 05/11/2026). */
  try{ db.exec('ALTER TABLE recusa_estoque ADD COLUMN usuario_id INTEGER'); }catch(e){}
}
function registrarRecusa(db, { codigo, usuario_id, usuario_nome, lote_id }){
  garantirRecusa(db);
  db.prepare('INSERT INTO recusa_estoque (codigo,em,usuario_id,usuario_nome,lote_id) VALUES (?,?,?,?,?)')
    .run(String(codigo || '').toUpperCase(), RELOGIO.agora(), usuario_id != null ? usuario_id : null, usuario_nome || null, lote_id || null);
}

/* ─── config ─────────────────────────────────────────────────────────────── */
function cfg(db, chave, padrao){
  try{ const r = db.prepare('SELECT valor FROM config WHERE chave=?').get(chave);
       return r && r.valor != null && String(r.valor).trim() !== '' ? String(r.valor).trim() : padrao; }
  catch(e){ return padrao; }
}
function cfgInt(db, chave, padrao){ const v = parseInt(cfg(db, chave, ''), 10); return v > 0 ? v : padrao; }
function cfgHora(db, chave, padrao){ const v = cfg(db, chave, padrao); return /^\d{1,2}:\d{2}$/.test(v) ? v.padStart(5, '0') : padrao; }
function cicloQtd(db){ return cfgInt(db, 'ciclo_qtd', 8); }
/* Dias de trabalho da lista diaria: 1 = segunda ... 6 = sabado, 0 = domingo.
   Padrao segunda a sexta (em aberto na spec ate o dono decidir o sabado). */
function diasUteis(db){
  const v = cfg(db, 'ciclo_dias', '1,2,3,4,5').split(',').map(x => parseInt(x, 10)).filter(x => x >= 0 && x <= 6);
  return v.length ? v : [1,2,3,4,5];
}
function ehDiaUtil(db, data){ return diasUteis(db).indexOf(RELOGIO.diaSemana(data)) >= 0; }

/* Coluna existe? Banco de teste e banco antigo nao tem todas. */
function temColuna(db, tabela, col){
  try{ return db.prepare('PRAGMA table_info('+tabela+')').all().some(c => c.name === col); }
  catch(e){ return false; }
}
function temTabela(db, t){ try{ return !!db.prepare("SELECT 1 FROM sqlite_master WHERE type='table' AND name=?").get(t); }catch(e){ return false; } }

/* O que a peca E — para a pessoa comparar com a prateleira. Nunca o saldo. */
function descreverSkus(db, codigos){
  const out = {};
  if(!codigos.length) return out;
  const marcas = codigos.map(() => '?').join(',');
  const cols = ['s.codigo','s.descricao'];
  const joins = [];
  if(temColuna(db,'skus','largura_cm')) cols.push('s.largura_cm','s.altura_cm');
  if(temTabela(db,'cor')){ joins.push('LEFT JOIN cor c ON c.codigo=s.cor_codigo'); cols.push('COALESCE(c.nome,s.cor_codigo,s.cor) cor_nome'); }
  else cols.push('s.cor cor_nome');
  if(temTabela(db,'tecido')){ joins.push('LEFT JOIN tecido t ON t.codigo=s.tecido_codigo'); cols.push('COALESCE(t.nome,s.tecido_codigo) tecido_nome'); }
  if(temTabela(db,'modelo') && temColuna(db,'skus','modelo_id')){ joins.push('LEFT JOIN modelo m ON m.id=s.modelo_id'); cols.push('m.nome modelo_nome','COALESCE(m.exige_medida,1) exige_medida'); }
  let linhas = [];
  try{ linhas = db.prepare(`SELECT ${cols.join(',')} FROM skus s ${joins.join(' ')} WHERE s.codigo IN (${marcas})`).all(...codigos); }
  catch(e){ linhas = []; }
  linhas.forEach(l => out[l.codigo] = l);
  return out;
}

/* Sob medida nao tem estoque (§7): contar essa peca nao confere saldo nenhum. */
function ehSobMedida(db, codigo){
  try{
    const r = db.prepare(`SELECT COALESCE(m.sob_medida,0) sm FROM skus s
      LEFT JOIN modelo m ON m.id=s.modelo_id WHERE s.codigo=?`).get(codigo);
    return !!(r && r.sm);
  }catch(e){ return false; }
}

/* O que deve estar NA PRATELEIRA — e contra isso que a contagem se compara
   (CONFERENCIA-E-BAIXA fase 2-A). */
function livre(db, codigo){ return require('./baixa_dominio').disponivel(db, codigo); }

/* A IDADE DA CONFERENCIA — quando o saldo de cada SKU foi olhado na prateleira
 * pela ultima vez. Dono unico: a aba Estoque (est_route), a lista do dia e a
 * folga leem daqui (§18, #32).
 *
 * Tres fontes: a `contagem` e a `contagem_pendente` sao a historia de antes da
 * fase 2; da conferencia vale o item CONFIRMADO, APLICADO ou APROVADO, datado
 * pela 1ª contagem (`em1`). Os dias se contam contra o RELOGIO (o do servidor,
 * em producao). */
function conferencias(db){
  const m = {};
  const somar = (linhas) => linhas.forEach(r => {
    if(!r.em) return;
    const c = String(r.codigo || '').toUpperCase();
    if(!m[c] || r.em > m[c].em) m[c] = { em: r.em };
  });
  try{ somar(db.prepare(`SELECT codigo, MAX(contado_em) em FROM contagem
      WHERE COALESCE(tipo,'sku')='sku' AND COALESCE(teste,0)=0 GROUP BY codigo`).all()); }catch(e){}
  try{ somar(db.prepare(`SELECT codigo, MAX(criado_em) em FROM contagem_pendente
      WHERE COALESCE(tipo,'sku')='sku' AND COALESCE(teste,0)=0 AND aprovado=1 GROUP BY codigo`).all()); }catch(e){}
  try{ somar(db.prepare(`SELECT codigo, MAX(em1) em FROM inventario_item
      WHERE status IN ('confirmado','aprovado','aplicado') AND COALESCE(teste,0)=0 GROUP BY codigo`).all()); }catch(e){}
  const hoje = db.prepare("SELECT julianday(?) j").get(RELOGIO.agora()).j;
  const dia = db.prepare("SELECT julianday(?) j");
  for(const c in m) m[c].dias = Math.floor(hoje - dia.get(m[c].em).j);
  return m;
}

/* O SKU ja esta num item que anda? Um SKU so pode estar em UM item aberto. */
function itemAberto(db, codigo){
  return db.prepare(`SELECT i.* FROM inventario_item i JOIN inventario_ciclo c ON c.id=i.ciclo_id
    WHERE i.codigo=? AND i.status IN ('a_contar','recontar','terceira','aprovar') AND c.status='aberto'
    ORDER BY i.id DESC LIMIT 1`).get(codigo);
}
/* Item que espera contagem num ciclo FECHADO (a divergencia da quinzenal
   vencida esperando a proxima diaria). Conta como aberto para nao duplicar. */
function itemPendente(db, codigo){
  return itemAberto(db, codigo) || db.prepare(`SELECT i.* FROM inventario_item i
    WHERE i.codigo=? AND i.status IN ('recontar','terceira') ORDER BY i.id DESC LIMIT 1`).get(codigo);
}

/* O catalogo que se confere: sem sob medida e sem inativo. */
function skusConferiveis(db){
  const filtroAtivo = temColuna(db, 'skus', 'ativo') ? ' AND COALESCE(s.ativo,1)=1' : '';
  try{
    return db.prepare(`SELECT s.codigo FROM skus s LEFT JOIN modelo m ON m.id=s.modelo_id
      WHERE COALESCE(m.sob_medida,0)=0 ${filtroAtivo} ORDER BY s.codigo`).all().map(r => r.codigo);
  }catch(e){
    return db.prepare(`SELECT codigo FROM skus s WHERE 1=1 ${filtroAtivo} ORDER BY codigo`).all().map(r => r.codigo);
  }
}

/* A ORDEM (§6.1): travou na etiqueta → menor cobertura → nunca conferido →
 * mais tempo sem conferir. `folga` (dias) tira dos degraus 2 a 4 o que foi
 * conferido ha pouco; o degrau 1 ignora a folga — o furo apareceu.
 *
 * Cobertura = LIVRE ÷ media diaria (demanda_dominio, a media da JANELA — e nao o
 * ritmo, que a tela azul usa desde 07/11/2026 para o alvo e a cobertura dela).
 * Sem venda na janela a cobertura e null e o SKU cai para 3 e 4. */
function ordenar(db, { codigos, folga, recusasDesde }){
  const conf = conferencias(db);
  const media = {};
  try{ require('./demanda_dominio').calcular(db).linhas.forEach(l => media[String(l.codigo).toUpperCase()] = +l.media_dia || 0); }catch(e){}
  const travou = new Set();
  try{
    db.prepare('SELECT DISTINCT UPPER(codigo) c FROM recusa_estoque WHERE em > ? AND COALESCE(teste,0)=0')
      .all(recusasDesde || '0000').forEach(r => travou.add(r.c));
  }catch(e){}
  let resv = {};
  try{ resv = require('./baixa_dominio').reservados(db); }catch(e){}
  const out = [];
  for(const codigo of codigos){
    const c = String(codigo).toUpperCase();
    const k = conf[c];
    if(travou.has(c)){ out.push({ codigo, degrau:1, chave:0 }); continue; }
    if(folga && k && k.dias < folga) continue;
    const md = media[c] || 0;
    if(md > 0){
      const lv = (ESTOQUE.saldo(db, codigo) || 0) - (resv[c] || 0);
      out.push({ codigo, degrau:2, chave: lv / md, cobertura: Math.round(lv / md * 10) / 10 });
    } else if(!k) out.push({ codigo, degrau:3, chave:0 });
    else out.push({ codigo, degrau:4, chave: -k.dias });
  }
  out.sort((a,b) => (a.degrau - b.degrau) || (a.chave - b.chave) || String(a.codigo).localeCompare(String(b.codigo)));
  return out;
}

/* A SUGESTAO (conferencia avulsa que quem planeja abre na mao). Mesma ordem da
   lista do dia, sem o que ja esta num item aberto. */
function sugestao(db, qtd){
  const n = Math.max(1, Math.min(200, +qtd || cicloQtd(db)));
  const cods = skusConferiveis(db).filter(c => !itemPendente(db, c));
  return ordenar(db, { codigos:cods, folga:1, recusasDesde: RELOGIO.somarDias(RELOGIO.hoje(), -7) })
    .slice(0, n).map(l => ({ codigo:l.codigo, degrau:l.degrau, por_que:DEGRAUS[l.degrau] }));
}

/* O que entra num inventario GERAL ou QUINZENAL: todo SKU com saldo, ou com
   movimento nos ultimos 30 dias. Sob medida e inativo, nao. */
function universoGeral(db){
  const filtroAtivo = temColuna(db, 'skus', 'ativo') ? ' AND COALESCE(s.ativo,1)=1' : '';
  const desde = RELOGIO.somarDias(RELOGIO.hoje(), -30);
  let linhas = [];
  try{
    linhas = db.prepare(`SELECT s.codigo FROM skus s LEFT JOIN modelo m ON m.id=s.modelo_id
      WHERE COALESCE(m.sob_medida,0)=0 ${filtroAtivo} AND (COALESCE(s.estoque,0)<>0 OR EXISTS(
        SELECT 1 FROM movimento_estoque v WHERE v.codigo=s.codigo AND v.tipo<>'abertura'
          AND v.criado_em >= ?))
      ORDER BY s.codigo`).all(desde);
  }catch(e){
    linhas = db.prepare(`SELECT codigo FROM skus s WHERE COALESCE(estoque,0)<>0 ${filtroAtivo} ORDER BY codigo`).all();
  }
  return linhas.map(l => l.codigo);
}

function erro(status, mensagem, extra){
  const e = new Error(mensagem); e.status = status; e.extra = extra || null; return e;
}

function novoCiclo(db, tipo, quem, extra){
  const x = extra || {};
  return db.prepare('INSERT INTO inventario_ciclo (tipo,aberto_por,aberto_em,data,prazo) VALUES (?,?,?,?,?)')
    .run(tipo, (quem && quem.nome) || '', RELOGIO.agora(), x.data || null, x.prazo || null).lastInsertRowid;
}

/* AS SOBRAS: o que ficou sem as contagens necessarias numa diaria anterior (ou
 * na quinzenal vencida) vai para o TOPO do novo ciclo, degrau 0, com as
 * contagens que ja tem. E o SKU que o admin mandou contar de novo numa diaria
 * volta como item novo, do zero (§5.7). */
function absorverSobras(db, novoId){
  const movidos = db.prepare(`SELECT i.id, i.ciclo_id FROM inventario_item i JOIN inventario_ciclo c ON c.id=i.ciclo_id
    WHERE c.tipo IN ('diario','quinzenal') AND i.ciclo_id<>? AND i.status IN ('a_contar','recontar','terceira')
    ORDER BY i.ordem, i.id`).all(novoId);
  /* `ordem` negativa: a sobra fica na frente das novas (que comecam em 1),
     na ordem em que estava. */
  const up = db.prepare('UPDATE inventario_item SET ciclo_id=?, degrau=0, ordem=?, veio_de=?, rascunho=NULL, rascunho_por=NULL, rascunho_por_id=NULL, rascunho_inicio=NULL WHERE id=?');
  const velhos = new Set();
  movidos.forEach((m, i) => { up.run(novoId, i - 100000, m.ciclo_id, m.id); velhos.add(m.ciclo_id); });
  const rejeitados = db.prepare(`SELECT i.* FROM inventario_item i JOIN inventario_ciclo c ON c.id=i.ciclo_id
    WHERE c.tipo='diario' AND i.status='rejeitado'
      AND NOT EXISTS (SELECT 1 FROM inventario_item x WHERE x.anterior_id=i.id)`).all();
  const ins = db.prepare('INSERT INTO inventario_item (ciclo_id,codigo,anterior_id,degrau,ordem,criado_em) VALUES (?,?,?,0,?,?)');
  let n = movidos.length;
  for(const r of rejeitados){
    if(itemPendente(db, r.codigo)) continue;
    ins.run(novoId, r.codigo, r.id, n - 100000, RELOGIO.agora()); n++;
  }
  velhos.forEach(id => talvezFechar(db, id));
  return n;
}

/* Abre um ciclo na mao. `geral` exige `confirmar` (a expedicao parada, §6.3);
   `quinzenal` antecipa a quinzenal; `ciclico` e a conferencia avulsa. */
function abrir(db, { tipo, codigos, quem, confirmar }){
  const t = tipo === 'geral' ? 'geral' : tipo === 'quinzenal' ? 'quinzenal' : 'ciclico';
  if(t === 'quinzenal') return abrirQuinzenal(db, { quem });
  if(t === 'geral' && !confirmar)
    throw erro(409, 'A contagem geral é com a EXPEDIÇÃO PARADA: ninguém embala nem imprime etiqueta enquanto ela roda. Confirme para abrir.', { motivo:'confirmar' });
  let lista = t === 'geral' ? universoGeral(db)
    : ((codigos && codigos.length) ? codigos : sugestao(db).map(s => s.codigo));
  lista = [...new Set(lista.map(c => String(c || '').trim().toUpperCase()).filter(Boolean))];
  const existe = db.prepare('SELECT 1 FROM skus WHERE codigo=?');
  const fora = lista.filter(c => !existe.get(c));
  if(fora.length) throw erro(400, 'SKU fora do cadastro: ' + fora.join(', '));
  const ja = lista.filter(c => itemPendente(db, c));
  const sm = lista.filter(c => ehSobMedida(db, c));
  const entram = lista.filter(c => ja.indexOf(c) < 0 && sm.indexOf(c) < 0);
  if(!entram.length) throw erro(409, ja.length
    ? 'todos os SKUs escolhidos ja estao numa conferencia aberta'
    : 'nao ha SKU para conferir');
  const id = novoCiclo(db, t, quem, { data: RELOGIO.hoje() });
  const ins = db.prepare('INSERT INTO inventario_item (ciclo_id,codigo,ordem,criado_em) VALUES (?,?,?,?)');
  entram.forEach((c, i) => ins.run(id, c, i, RELOGIO.agora()));
  return { ciclo_id:id, tipo:t, itens:entram.length, ja_abertos:ja, sob_medida:sm };
}

/* O prazo da quinzenal: o N-esimo dia util contando o de hoje (§6.2). */
function prazoUteis(db, desde, n){
  let d = desde, conta = 0;
  for(let i = 0; i < 60; i++){
    if(ehDiaUtil(db, d)){ conta++; if(conta >= n) return d; }
    d = RELOGIO.somarDias(d, 1);
  }
  return d;
}

function quinzenalAberta(db){
  return db.prepare("SELECT * FROM inventario_ciclo WHERE tipo='quinzenal' AND status='aberto' ORDER BY id DESC LIMIT 1").get();
}

/* A QUINZENAL (§6.2): todo o universo, na ordem da diaria, sem folga. As sobras
   da diaria entram em cima. Suspende a diaria enquanto estiver aberta. */
function abrirQuinzenal(db, { quem }){
  if(quinzenalAberta(db)) throw erro(409, 'ja existe uma conferencia quinzenal aberta');
  const hoje = RELOGIO.hoje();
  const prazo = prazoUteis(db, hoje, cfgInt(db, 'quinzenal_prazo', 3));
  const id = novoCiclo(db, 'quinzenal', quem || { nome:'sistema' }, { data:hoje, prazo });
  const sobras = absorverSobras(db, id);
  const cods = universoGeral(db).filter(c => !itemPendente(db, c));
  const ord = ordenar(db, { codigos:cods, folga:0, recusasDesde: RELOGIO.somarDias(hoje, -7) });
  const ins = db.prepare('INSERT INTO inventario_item (ciclo_id,codigo,degrau,ordem,criado_em) VALUES (?,?,?,?,?)');
  ord.forEach((o, i) => ins.run(id, o.codigo, o.degrau, i + 1, RELOGIO.agora()));
  return { ciclo_id:id, tipo:'quinzenal', itens: sobras + ord.length, prazo };
}

/* Fim do prazo: o que ninguem contou fecha como `nao_conferido` e aparece no
   relatorio. A divergencia em andamento (2ª ou 3ª contagem) NAO e esquecida:
   ela ja achou uma diferenca, e vai para o topo da proxima diaria. */
function fecharQuinzenal(db, ciclo){
  db.prepare(`UPDATE inventario_item SET status='nao_conferido', rascunho=NULL, rascunho_por=NULL, rascunho_por_id=NULL
    WHERE ciclo_id=? AND status='a_contar'`).run(ciclo.id);
  db.prepare("UPDATE inventario_ciclo SET status='fechado', fechado_em=? WHERE id=?").run(RELOGIO.agora(), ciclo.id);
}

function quinzenalDevida(db, hoje){
  const ult = db.prepare("SELECT MAX(COALESCE(data, substr(aberto_em,1,10))) d FROM inventario_ciclo WHERE tipo='quinzenal'").get();
  const base = (ult && ult.d) || cfg(db, 'quinzenal_base', hoje);
  return hoje >= RELOGIO.somarDias(base, cfgInt(db, 'quinzenal_dias', 15));
}

/* A LISTA DO DIA (§6.1): nasce uma vez, no primeiro pedido depois das 7h, e nao
   muda durante o dia. Sobras primeiro; o resto ate completar ciclo_qtd. */
function abrirDiario(db, hoje){
  const ant = db.prepare("SELECT MAX(aberto_em) em FROM inventario_ciclo WHERE tipo='diario'").get();
  const id = novoCiclo(db, 'diario', { nome:'sistema' }, { data:hoje });
  const sobras = absorverSobras(db, id);
  const resta = Math.max(0, cicloQtd(db) - sobras);
  const cods = skusConferiveis(db).filter(c => !itemPendente(db, c));
  const ord = ordenar(db, { codigos:cods, folga: cfgInt(db, 'ciclo_folga', 7),
    recusasDesde: (ant && ant.em) || RELOGIO.somarDias(hoje, -7) }).slice(0, resta);
  const ins = db.prepare('INSERT INTO inventario_item (ciclo_id,codigo,degrau,ordem,criado_em) VALUES (?,?,?,?,?)');
  ord.forEach((o, i) => ins.run(id, o.codigo, o.degrau, i + 1, RELOGIO.agora()));
  return id;
}

/* ─── o rodizio (§6.5) ───────────────────────────────────────────────────── */
/* Quem entra no rodizio: pessoa ativa, fora do "fora do rodizio", com a chave
   contagem.contar EFETIVA — por setor ou por excecao (`temChave`, que a rota
   monta com o resolvedor de acesso). */
function candidatos(db, temChave){
  if(!temTabela(db, 'usuarios')) return [];
  const fora = temColuna(db, 'usuarios', 'fora_rodizio') ? ' AND COALESCE(fora_rodizio,0)=0' : '';
  const gente = db.prepare(`SELECT id, nome FROM usuarios WHERE ativo=1 ${fora}`).all()
    .filter(u => { try{ return !!(temChave && temChave(u.id)); }catch(e){ return false; } });
  const ult = {};
  db.prepare('SELECT usuario_id, MAX(data) d FROM inventario_escala WHERE COALESCE(teste,0)=0 GROUP BY usuario_id')
    .all().forEach(r => ult[r.usuario_id] = r.d);
  gente.forEach(u => u.ultima = ult[u.id] || null);
  /* Ha mais tempo sem escala primeiro; quem nunca foi escalado vem antes de
     todos; empate, pela ordem do nome. */
  gente.sort((a,b) => {
    if(a.ultima !== b.ultima){ if(!a.ultima) return -1; if(!b.ultima) return 1; return a.ultima < b.ultima ? -1 : 1; }
    return String(a.nome).localeCompare(String(b.nome), 'pt');
  });
  return gente;
}
function escalaDe(db, cicloId, data){
  return db.prepare('SELECT * FROM inventario_escala WHERE ciclo_id=? AND data=? ORDER BY id').all(cicloId, data);
}
function garantirEscala(db, cicloId, data, temChave){
  const ja = escalaDe(db, cicloId, data);
  if(ja.length) return ja;
  const n = cfgInt(db, 'ciclo_pessoas', 2);
  const c = candidatos(db, temChave);
  if(c.length < 2 || c.length < n) return [];
  const ins = db.prepare("INSERT INTO inventario_escala (data,ciclo_id,usuario_id,usuario_nome,papel) VALUES (?,?,?,?,'escalada')");
  c.slice(0, n).forEach(u => ins.run(data, cicloId, u.id, u.nome));
  return escalaDe(db, cicloId, data);
}

/* O CICLO DO DIA. Chamado pela lista e pela tarja: e o "na pratica, na
 * primeira consulta depois das 7h" da spec. Fecha a quinzenal vencida, abre a
 * quinzenal devida, ou a diaria; e escala as duas pessoas. Fim de semana (fora
 * de `ciclo_dias`) e antes das 7h: nada nasce. */
function garantirDia(db, ctx){
  const c = ctx || {};
  const agora = RELOGIO.agora(), hoje = agora.slice(0, 10), hora = agora.slice(11, 16);
  db.prepare("SELECT * FROM inventario_ciclo WHERE tipo='quinzenal' AND status='aberto' AND prazo IS NOT NULL AND prazo < ?")
    .all(hoje).forEach(q => fecharQuinzenal(db, q));
  if(!ehDiaUtil(db, hoje) || hora < cfgHora(db, 'ciclo_hora', '07:00')) return cicloDoDia(db);
  let q = quinzenalAberta(db);
  if(!q && quinzenalDevida(db, hoje)){ abrirQuinzenal(db, { quem:{ nome:'sistema' } }); q = quinzenalAberta(db); }
  if(q){ garantirEscala(db, q.id, hoje, c.temChave); return q; }
  let d = db.prepare("SELECT * FROM inventario_ciclo WHERE tipo='diario' AND data=? ORDER BY id DESC LIMIT 1").get(hoje);
  if(!d){ abrirDiario(db, hoje); d = db.prepare("SELECT * FROM inventario_ciclo WHERE tipo='diario' AND data=? ORDER BY id DESC LIMIT 1").get(hoje); }
  garantirEscala(db, d.id, hoje, c.temChave);
  return d;
}
function cicloDoDia(db){
  const hoje = RELOGIO.hoje();
  return quinzenalAberta(db) ||
    db.prepare("SELECT * FROM inventario_ciclo WHERE tipo='diario' AND data=? ORDER BY id DESC LIMIT 1").get(hoje) || null;
}

/* A escalada ja comecou hoje? (bipou, ou terminou alguma contagem.) */
function comecou(db, cicloId, uid, hoje){
  return !!db.prepare(`SELECT 1 FROM inventario_item WHERE ciclo_id=? AND (
      (rascunho_por_id=? AND rascunho_inicio >= ?) OR (por1_id=? AND em1 >= ?) OR (por2_id=? AND em2 >= ?) OR (por3_id=? AND em3 >= ?)) LIMIT 1`)
    .get(cicloId, uid, hoje, uid, hoje, uid, hoje, uid, hoje);
}
/* AS 10h (§6.5): se uma escalada ainda nao comecou, a contagem do dia abre para
   todo o setor. A marca fica gravada na escala (e o "escalada, nao contou" do
   relatorio). Sem escala (menos de duas pessoas no rodizio) a lista ja nasce
   aberta: senao ninguem a contaria. */
function abertoParaTodos(db, ciclo){
  if(!ciclo || ['diario','quinzenal'].indexOf(ciclo.tipo) < 0) return true;
  /* So o ciclo DO DIA conta, e so depois das 7h de um dia de trabalho: a sobra
     de ontem espera a lista de hoje nascer, e antes das 7h nao ha lista. */
  const doDia = cicloDoDia(db);
  if(!doDia || doDia.id !== ciclo.id) return false;
  const agora = RELOGIO.agora(), hoje = agora.slice(0, 10), hora = agora.slice(11, 16);
  if(!ehDiaUtil(db, hoje) || hora < cfgHora(db, 'ciclo_hora', '07:00')) return false;
  const esc = escalaDe(db, ciclo.id, hoje);
  if(!esc.length) return true;
  if(esc.some(e => e.abriu_para_todos_em)) return true;
  if(hora < cfgHora(db, 'ciclo_abre_todos', '10:00')) return false;
  const faltou = esc.filter(e => !comecou(db, ciclo.id, e.usuario_id, hoje));
  if(!faltou.length) return false;
  const up = db.prepare('UPDATE inventario_escala SET abriu_para_todos_em=? WHERE id=?');
  faltou.forEach(e => up.run(agora, e.id));
  return true;
}
function ehEscalada(db, ciclo, quem){
  if(!ciclo || !quem) return false;
  const doDia = cicloDoDia(db);
  if(!doDia || doDia.id !== ciclo.id) return false;
  const agora = RELOGIO.agora();
  if(!ehDiaUtil(db, agora.slice(0, 10)) || agora.slice(11, 16) < cfgHora(db, 'ciclo_hora', '07:00')) return false;
  return escalaDe(db, ciclo.id, RELOGIO.hoje()).some(e =>
    (quem.id != null && String(e.usuario_id) === String(quem.id)) || (quem.id == null && e.usuario_nome === quem.nome));
}

/* ─── a contagem ─────────────────────────────────────────────────────────── */
function estagio(item){
  return item.status === 'a_contar' ? 1 : item.status === 'recontar' ? 2 : item.status === 'terceira' ? 3 : 0;
}
function quemJaContou(item){
  const p = [];
  if(item.por1 || item.por1_id) p.push({ id:item.por1_id, nome:item.por1 });
  if(item.por2 || item.por2_id) p.push({ id:item.por2_id, nome:item.por2 });
  if(item.por3 || item.por3_id) p.push({ id:item.por3_id, nome:item.por3 });
  return p;
}
const todas = () => true;

/* ESTA PESSOA PODE CONTAR ESTE ITEM AGORA? Devolve null (pode) ou o erro.
 *   - 1ª e 2ª contagem: contagem.contar; na diaria e na quinzenal, so as
 *     escaladas do dia ate as 10h (ou ate abrir para todos);
 *   - 3ª: contagem.desempatar, de quem nao contou;
 *   - ninguem conta duas vezes o mesmo SKU (outraPessoa). */
function porQueNao(db, item, ciclo, quem, pode){
  const est = estagio(item);
  if(est === 0) return erro(409, item.codigo + ' ja foi contado e espera a decisao', { motivo:'aguardando_decisao' });
  if(est > 1 && !ESTOQUE.outraPessoa(quem, quemJaContou(item)))
    return erro(403, 'voce ja contou ' + item.codigo + ': a proxima contagem tem que ser de outra pessoa', { motivo:'mesma_pessoa' });
  if(est === 3){
    if(!pode('contagem.desempatar')) return erro(403, item.codigo + ' espera a 3ª contagem, de quem tem permissao para desempatar', { motivo:'sem_permissao' });
    return null;
  }
  if(!pode('contagem.contar')) return erro(403, 'sem permissao para contar', { motivo:'sem_permissao' });
  if(ciclo && ['diario','quinzenal'].indexOf(ciclo.tipo) >= 0 && !ehEscalada(db, ciclo, quem) && !abertoParaTodos(db, ciclo))
    return erro(403, 'a contagem de hoje e das escaladas ate as ' + cfgHora(db, 'ciclo_abre_todos', '10:00'), { motivo:'nao_escalada' });
  return null;
}

function ehDele(item, quem){
  return (quem.id != null && item.rascunho_por_id != null) ? String(quem.id) === String(item.rascunho_por_id)
       : String(quem.nome || '') === String(item.rascunho_por || '');
}
function ultimoMov(db){ const r = db.prepare('SELECT MAX(id) id FROM movimento_estoque').get(); return (r && r.id) || 0; }

/* SOMA UM BIPE (ou uma quantidade digitada) na contagem em andamento. O
 * primeiro bipe — ou `abrir`, quando a pessoa escolhe o SKU na lista — marca o
 * INICIO da contagem (§5.5-B). A resposta e SO "contado: N".
 *
 * SKU fora da lista: na diaria e recusado (a lista nao muda no dia); com uma
 * quinzenal, geral ou avulsa aberta ele entra marcado (`fora_do_plano`). */
function contar(db, { codigo, quantidade, zerar, abrir: soAbrir, quem, pode }){
  pode = pode || todas;
  const cod = String(codigo || '').trim().toUpperCase();
  if(!cod) throw erro(400, 'sem codigo');
  if(!quem || (!quem.id && !quem.nome)) throw erro(401, 'sem pessoa logada');
  const q = soAbrir ? 0 : (quantidade === undefined || quantidade === null || quantidade === '' ? 1 : Number(quantidade));
  if(!Number.isInteger(q) || q < 0) throw erro(400, 'quantidade invalida: peca e numero inteiro');
  if(!db.prepare('SELECT 1 FROM skus WHERE codigo=?').get(cod))
    throw erro(404, cod + ' nao existe no cadastro de SKU — etiqueta errada?', { motivo:'sem_cadastro' });
  if(ehSobMedida(db, cod))
    throw erro(409, cod + ' e sob medida: nao tem estoque para conferir', { motivo:'sob_medida' });

  let item = itemAberto(db, cod);
  if(!item){
    const ciclo = db.prepare("SELECT id FROM inventario_ciclo WHERE status='aberto' AND tipo IN ('quinzenal','geral','ciclico') ORDER BY id DESC LIMIT 1").get();
    if(!ciclo){
      const hoje = cicloDoDia(db);
      throw erro(409, hoje ? cod + ' nao esta na lista de hoje — a lista do dia nao muda' : 'nenhuma conferencia aberta agora',
        { motivo: hoje ? 'fora_da_lista' : 'sem_ciclo' });
    }
    if(!pode('contagem.contar')) throw erro(403, 'sem permissao para contar', { motivo:'sem_permissao' });
    const id = db.prepare('INSERT INTO inventario_item (ciclo_id,codigo,fora_do_plano,criado_em) VALUES (?,?,1,?)')
      .run(ciclo.id, cod, RELOGIO.agora()).lastInsertRowid;
    item = db.prepare('SELECT * FROM inventario_item WHERE id=?').get(id);
  }
  const ciclo = db.prepare('SELECT * FROM inventario_ciclo WHERE id=?').get(item.ciclo_id);
  const nao = porQueNao(db, item, ciclo, quem, pode);
  if(nao) throw nao;

  /* Uma pessoa por vez no mesmo SKU: duas contando a mesma prateleira somariam
     as duas contagens num numero so. */
  if(item.rascunho != null && (item.rascunho_por_id || item.rascunho_por) && !ehDele(item, quem))
    throw erro(409, (item.rascunho_por || 'outra pessoa') + ' esta contando ' + cod + ' agora', { motivo:'outra_contando' });

  const novoInicio = item.rascunho == null || zerar;
  const novo = (zerar || item.rascunho == null ? 0 : item.rascunho) + (zerar ? 0 : q);
  if(novoInicio){
    db.prepare(`UPDATE inventario_item SET rascunho=?, rascunho_por=?, rascunho_por_id=?, rascunho_inicio=?,
        rascunho_livre=?, rascunho_mov=? WHERE id=?`)
      .run(novo, quem.nome || '', quem.id != null ? quem.id : null, RELOGIO.agora(), livre(db, cod), ultimoMov(db), item.id);
  } else {
    db.prepare('UPDATE inventario_item SET rascunho=? WHERE id=?').run(novo, item.id);
  }
  return { codigo:cod, contado:novo };
}

/* "Mexeram no SKU enquanto a pessoa contava?" (§5.5-B). O livre mudou, ou o
   livro tem linha daquele SKU que nao e a baixa da conferencia. */
function mexeram(db, item){
  if(item.rascunho == null || item.rascunho_livre == null) return false;
  if(livre(db, item.codigo) !== item.rascunho_livre) return true;
  return !!db.prepare("SELECT 1 FROM movimento_estoque WHERE codigo=? AND id>? AND tipo<>'conferencia' LIMIT 1")
    .get(item.codigo, item.rascunho_mov || 0);
}

/* APLICA a diferenca no livro, sobre o saldo de agora (armadilha #32). Usado
   pelo "bateu" (sem aprovacao) e pela decisao do admin. */
function aplicarNoLivro(db, item, delta, { motivo, obs, quem, livroNome, aprovado_por }){
  let mov = null;
  const antes = ESTOQUE.saldo(db, item.codigo);
  let depois = antes;
  if(delta !== 0){
    const contaram = quemJaContou(item).map(p => p.nome).filter(Boolean).join(' / ');
    const r = ESTOQUE.movimentar(db, { codigo:item.codigo, delta, tipo:'inventario',
      referencia:'inventario:' + item.id, motivo: motivo ? motivo + (obs ? ' — ' + String(obs).trim() : '') : null,
      usuario_id: !livroNome && quem && quem.id != null ? quem.id : null,
      usuario_nome: livroNome || (quem && quem.nome) || contaram || null, aprovado_por: aprovado_por || null });
    depois = r.depois;
    mov = db.prepare('SELECT MAX(id) id FROM movimento_estoque WHERE codigo=?').get(item.codigo).id;
    /* O rastro que a aba Estoque ja le (o botao "historico"). */
    try{
      db.prepare(`INSERT INTO ajuste_estoque (codigo,antes,depois,delta,motivo,obs,usuario_id,usuario_nome)
        VALUES (?,?,?,?,?,?,?,?)`).run(item.codigo, antes, depois, delta,
          'Inventario: ' + (motivo || 'as contagens bateram'),
          'conferencia #' + item.ciclo_id + ' · contaram: ' + contaram +
          ' · 1ª ' + item.contado1 + ' (sistema dizia ' + item.saldo_na_contagem + ')' +
          (obs ? ' · ' + String(obs).trim() : ''), quem && quem.id != null ? quem.id : null, (quem && quem.nome) || '');
    }catch(e){}
  }
  return { mov, antes, depois };
}

/* "TERMINEI ESTE SKU" (ou "Nao tem nenhuma": `nenhuma`, sem bipe nenhum). Guarda
 * o livre do momento, compara, e decide o estado — aplicando sozinho quando
 * duas contagens acham a mesma diferenca. A resposta nao diz se bateu.
 *
 * Mexeram no SKU durante a contagem: devolve `{invalidada:true}` e a contagem
 * em andamento e apagada — nao e terceira contagem, nem divergencia. */
function terminar(db, { codigo, nenhuma, quem, pode }){
  pode = pode || todas;
  const cod = String(codigo || '').trim().toUpperCase();
  if(!quem || (!quem.id && !quem.nome)) throw erro(401, 'sem pessoa logada');
  const item = itemAberto(db, cod);
  if(!item) throw erro(404, cod + ' nao esta em nenhuma conferencia aberta');
  const ciclo = db.prepare('SELECT * FROM inventario_ciclo WHERE id=?').get(item.ciclo_id);
  const nao = porQueNao(db, item, ciclo, quem, pode);
  if(nao) throw nao;
  if(item.rascunho != null && (item.rascunho_por_id || item.rascunho_por) && !ehDele(item, quem))
    throw erro(409, (item.rascunho_por || 'outra pessoa') + ' esta contando ' + cod + ' agora', { motivo:'outra_contando' });
  if(nenhuma && item.rascunho > 0)
    throw erro(409, 'voce bipou ' + item.rascunho + ' de ' + cod + ': toque "Terminei este SKU", ou recomece', { motivo:'bipou' });

  if(mexeram(db, item)){
    db.prepare(`UPDATE inventario_item SET rascunho=NULL, rascunho_por=NULL, rascunho_por_id=NULL, rascunho_inicio=NULL,
        rascunho_livre=NULL, rascunho_mov=NULL WHERE id=?`).run(item.id);
    return { codigo:cod, invalidada:true, motivo:'mexeram',
      mensagem:'Mexeram no ' + cod + ' enquanto você contava — conte de novo.' };
  }

  const est = estagio(item);
  const contado = item.rascunho || 0;
  const saldo = livre(db, cod);
  const agora = RELOGIO.agora();
  const inicio = item.rascunho_inicio || agora;
  const nome = quem.nome || '', uid = quem.id != null ? quem.id : null;
  const d1 = est === 1 ? contado - saldo : item.contado1 - item.saldo_na_contagem;
  let status, diferenca = null, aplicar = null;

  if(est === 1){
    status = d1 === 0 ? 'confirmado' : 'recontar';
    if(d1 === 0) diferenca = 0;
  } else if(est === 2){
    const d2 = contado - saldo;
    if(d2 === d1){ status = 'aplicado'; diferenca = d1; aplicar = d1; }
    else status = 'terceira';
  } else {
    /* A 3ª decide pelo acordo: vale a diferenca em que DUAS das tres
       contagens concordam. Acordo zero: o sistema estava certo. Sem acordo:
       a fila do admin (§5.7). */
    const d2 = item.contado2 - item.saldo2, d3 = contado - saldo;
    const acordo = (d3 === d1) ? d1 : (d3 === d2) ? d2 : null;
    if(acordo === 0){ status = 'confirmado'; diferenca = 0; }
    else if(acordo !== null){ status = 'aplicado'; diferenca = acordo; aplicar = acordo; }
    else { status = 'aprovar'; diferenca = d3; }
  }
  const n = est;
  const colSaldo = n === 1 ? 'saldo_na_contagem' : 'saldo' + n;
  db.prepare(`UPDATE inventario_item SET ${colSaldo}=?, contado${n}=?, por${n}=?, por${n}_id=?, inicio${n}=?, em${n}=?,
      status=?, diferenca=?, rascunho=NULL, rascunho_por=NULL, rascunho_por_id=NULL, rascunho_inicio=NULL,
      rascunho_livre=NULL, rascunho_mov=NULL WHERE id=?`)
    .run(saldo, contado, nome, uid, inicio, agora, status, diferenca, item.id);
  if(status === 'confirmado' || status === 'aplicado')
    db.prepare('UPDATE inventario_item SET decidido_em=? WHERE id=?').run(agora, item.id);
  if(aplicar !== null && aplicar !== 0){
    const atual = db.prepare('SELECT * FROM inventario_item WHERE id=?').get(item.id);
    const r = aplicarNoLivro(db, atual, aplicar, { quem });
    db.prepare('UPDATE inventario_item SET movimento_id=? WHERE id=?').run(r.mov, item.id);
  }
  talvezFechar(db, item.ciclo_id);
  return { codigo:cod, registrado:true };
}

/* NA GERAL, O QUE NAO FOI BIPADO E ZERO DELA (§6.4). Sem `confirmar` so diz
   quantos e quais; confirmando, cada SKU que a pessoa podia contar e nao bipou
   vira uma contagem ZERO dela. O estoque so vira zero se as DUAS confirmarem. */
function terminarPrateleira(db, { quem, pode, confirmar }){
  pode = pode || todas;
  const geral = db.prepare("SELECT * FROM inventario_ciclo WHERE tipo='geral' AND status='aberto' ORDER BY id DESC LIMIT 1").get();
  if(!geral) throw erro(409, 'nao ha contagem geral aberta', { motivo:'sem_geral' });
  const itens = db.prepare(`SELECT * FROM inventario_item WHERE ciclo_id=? AND status IN ('a_contar','recontar','terceira') ORDER BY codigo`).all(geral.id)
    .filter(i => i.rascunho == null && !porQueNao(db, i, geral, quem, pode));
  if(!confirmar) return { confirmar:true, n:itens.length, codigos:itens.map(i => i.codigo),
    pergunta: itens.length + ' SKU(s) da lista você não bipou. Esses não têm nenhuma peça?' };
  itens.forEach(i => terminar(db, { codigo:i.codigo, nenhuma:true, quem, pode }));
  return { zerados:itens.length };
}

/* Fecha o ciclo quando nada mais anda nele. A diaria de HOJE e a quinzenal
   ficam abertas mesmo sem nada a contar: a lista e a tarja leem delas, e a
   quinzenal suspende a diaria ate o PRAZO, e nao ate acabar (§6.2). A diaria
   de ontem fecha quando as sobras dela vao para a de hoje. */
function talvezFechar(db, cicloId){
  const c = db.prepare('SELECT tipo, data FROM inventario_ciclo WHERE id=?').get(cicloId);
  if(!c) return;
  if(c.tipo === 'quinzenal') return;
  if(c.tipo === 'diario' && c.data === RELOGIO.hoje()) return;
  const r = db.prepare(`SELECT COUNT(*) n FROM inventario_item WHERE ciclo_id=?
    AND status IN ('a_contar','recontar','terceira','aprovar')`).get(cicloId);
  if(!r.n) db.prepare(`UPDATE inventario_ciclo SET status='fechado', fechado_em=?
    WHERE id=? AND status='aberto'`).run(RELOGIO.agora(), cicloId);
}

/* "Encerrar" (avulsa e geral): o que ninguem contou sai como `nao_contado`. A
   divergencia em andamento continua ate ser decidida. */
function encerrar(db, cicloId){
  const c = db.prepare('SELECT * FROM inventario_ciclo WHERE id=?').get(cicloId);
  if(!c) throw erro(404, 'conferencia nao encontrada');
  if(c.tipo === 'quinzenal'){ fecharQuinzenal(db, c); return { nao_contados:0, em_andamento:0 }; }
  const n = db.prepare(`UPDATE inventario_item SET status='nao_contado', rascunho=NULL
    WHERE ciclo_id=? AND status='a_contar'`).run(cicloId).changes;
  if(c.tipo === 'diario'){
    const r = db.prepare(`SELECT COUNT(*) n FROM inventario_item WHERE ciclo_id=? AND status IN ('recontar','terceira','aprovar')`).get(cicloId);
    if(!r.n) db.prepare("UPDATE inventario_ciclo SET status='fechado', fechado_em=? WHERE id=?").run(RELOGIO.agora(), cicloId);
  } else talvezFechar(db, cicloId);
  const resta = db.prepare(`SELECT COUNT(*) n FROM inventario_item WHERE ciclo_id=?
    AND status IN ('recontar','terceira','aprovar')`).get(cicloId).n;
  return { nao_contados:n, em_andamento:resta };
}

/* ─── o que cada um ve ───────────────────────────────────────────────────── */
/* AS DUAS FILAS QUE ESPERAM UMA PESSOA, para a central de pendencias. */
const NA_LISTA  = status => `c.status='aberto' AND i.status IN (${status.map(() => '?').join(',')})`;
const RECONTAR  = ['recontar','terceira'];
const A_APROVAR = "i.status='aprovar'";
function pendencias(db){
  const um = (where, args) => db.prepare(`SELECT COUNT(*) n, MIN(i.em1) desde FROM inventario_item i
    JOIN inventario_ciclo c ON c.id=i.ciclo_id WHERE ${where}`).get(...(args || []));
  return { aprovar: um(A_APROVAR), recontar: um(NA_LISTA(RECONTAR), RECONTAR) };
}

/* A LISTA QUE ESTA PESSOA PODE CONTAR AGORA — sem saldo e sem as contagens de
 * ninguem no JSON (§5.3). `rodada` diz se e a 1ª, a 2ª ou a 3ª; quem conta a 2ª
 * nao sabe o que a 1ª achou. Cria a lista e a escala do dia, se ja e hora. */
function hoje(db, { quem, pode, temChave }){
  pode = pode || todas;
  const doDia = garantirDia(db, { temChave });
  const linhas = db.prepare(`SELECT i.*, c.tipo ciclo_tipo FROM inventario_item i JOIN inventario_ciclo c ON c.id=i.ciclo_id
    WHERE ${NA_LISTA(CONTANDO)} ORDER BY CASE c.tipo WHEN 'diario' THEN 0 WHEN 'quinzenal' THEN 1 ELSE 2 END,
      COALESCE(i.degrau,9), COALESCE(i.ordem,999999), i.codigo`).all(...CONTANDO);
  const ciclos = {};
  const ciclo = id => ciclos[id] || (ciclos[id] = db.prepare('SELECT * FROM inventario_ciclo WHERE id=?').get(id));
  /* Na quinzenal, o SKU que travou na etiqueta durante ela sobe para o topo. */
  const travou = new Set();
  const q = quinzenalAberta(db);
  if(q){ try{ db.prepare('SELECT DISTINCT UPPER(codigo) c FROM recusa_estoque WHERE em >= ? AND COALESCE(teste,0)=0')
    .all(q.aberto_em).forEach(r => travou.add(r.c)); }catch(e){} }
  const minhas = linhas.filter(i => !porQueNao(db, i, ciclo(i.ciclo_id), quem, pode));
  minhas.sort((a,b) => (travou.has(b.codigo) && b.ciclo_id === (q && q.id)) - (travou.has(a.codigo) && a.ciclo_id === (q && q.id)));
  const desc = descreverSkus(db, minhas.map(l => l.codigo));
  const itens = minhas.map(i => {
    const d = desc[i.codigo] || {};
    const minha = i.rascunho != null && ehDele(i, quem);
    return {
      codigo: i.codigo, rodada: estagio(i), tipo: i.ciclo_tipo,
      por_que: i.degrau != null ? DEGRAUS[i.degrau] : (i.fora_do_plano ? 'fora do plano' : null),
      descricao: d.descricao || '', largura_cm: d.largura_cm || null, altura_cm: d.altura_cm || null,
      cor_nome: d.cor_nome || null, tecido_nome: d.tecido_nome || null, modelo_nome: d.modelo_nome || null,
      exige_medida: d.exige_medida == null ? 1 : d.exige_medida,
      contando: minha ? i.rascunho : null,
      ocupado_por: (!minha && i.rascunho != null) ? (i.rascunho_por || 'outra pessoa') : null
    };
  });
  return { itens, ciclo: doDia ? { tipo:doDia.tipo, data:doDia.data, prazo:doDia.prazo } : null,
    geral: !!db.prepare("SELECT 1 FROM inventario_ciclo WHERE tipo='geral' AND status='aberto' LIMIT 1").get() };
}

function diaDaSemana(data){
  const n = ['domingo','segunda','terça','quarta','quinta','sexta','sábado'][RELOGIO.diaSemana(data)];
  return n + ' ' + data.slice(8, 10) + '/' + data.slice(5, 7);
}

/* A TARJA (§7.1): o texto, ou null. Nao fecha e nao bloqueia — so diz. Some
   para a pessoa quando nao sobra item que ELA possa contar. */
function tarja(db, { quem, pode, temChave }){
  pode = pode || todas;
  if(!pode('contagem.contar') && !pode('contagem.desempatar') && !pode('contagem.planejar')) return null;
  const c = garantirDia(db, { temChave });
  if(!c) return null;
  const hojeD = RELOGIO.hoje();
  const tot = db.prepare(`SELECT COUNT(*) n, SUM(CASE WHEN status IN ('a_contar','recontar','terceira') THEN 1 ELSE 0 END) f
    FROM inventario_item WHERE ciclo_id=? AND status NOT IN ('rejeitado')`).get(c.id);
  const total = tot.n || 0, faltam = tot.f || 0;
  const esc = escalaDe(db, c.id, hojeD);
  const ate = cfgHora(db, 'ciclo_abre_todos', '10:00').replace(/^0/, '').replace(':00', 'h');
  if(!esc.length && pode('contagem.planejar') && faltam){
    const n = candidatos(db, temChave).length;
    return { texto: 'Contagem do dia sem gente: só ' + n + ' pessoa(s) no rodízio', tipo:'aviso', link:'/admin' };
  }
  const minhas = hoje(db, { quem, pode, temChave }).itens.filter(i => i.tipo === c.tipo || i.rodada === 3);
  if(!minhas.length) return null;
  if(minhas.every(i => i.rodada === 3) && !ehEscalada(db, c, quem))
    return { texto: minhas.length + ' SKU(s) esperam a 3ª contagem — você pode contar', tipo:'terceira', link:'/inventario' };
  const aberto = abertoParaTodos(db, c);
  if(c.tipo === 'quinzenal')
    return { texto: 'Conferência quinzenal: faltam ' + faltam + ' de ' + total + ' — prazo ' + diaDaSemana(c.prazo), tipo:'quinzenal', link:'/inventario' };
  if(ehEscalada(db, c, quem) && !aberto){
    const outra = esc.filter(e => !((quem.id != null && String(e.usuario_id) === String(quem.id)) || e.usuario_nome === quem.nome))
      .map(e => e.usuario_nome).join(' e ');
    return { texto: 'Hoje a contagem é sua' + (outra ? ' e de ' + outra : '') + ' — faltam ' + faltam + ' de ' + total + ' SKUs — até ' + ate,
      tipo:'escalada', link:'/inventario' };
  }
  return { texto: 'Contagem do dia aberta para todo o setor — faltam ' + faltam + ' de ' + total + ' SKUs', tipo:'todos', link:'/inventario' };
}

/* A FILA DO ADMIN (§5.7): o que nem a 3ª contagem resolveu — e o que ja esperava
   aprovacao pela regra velha no dia do deploy. Aqui os numeros aparecem. */
function aprovacao(db, { quem }){
  const linhas = db.prepare(`SELECT i.*, c.tipo ciclo_tipo FROM inventario_item i
    JOIN inventario_ciclo c ON c.id=i.ciclo_id
    WHERE ${A_APROVAR} ORDER BY i.em1, i.id`).all();
  const desc = descreverSkus(db, linhas.map(l => l.codigo));
  return linhas.map(i => {
    const pode = ESTOQUE.outraPessoa(quem, quemJaContou(i));
    const d1 = i.contado1 - i.saldo_na_contagem;
    const d2 = i.contado2 != null ? i.contado2 - i.saldo2 : null;
    const d3 = i.contado3 != null ? i.contado3 - i.saldo3 : null;
    let extrato = [];
    try{ extrato = ESTOQUE.extrato(db, i.codigo, { desde: desdeConferencia(db, i), limite:50 }); }catch(e){}
    const d = desc[i.codigo] || {};
    return {
      id: i.id, codigo: i.codigo, descricao: d.descricao || '',
      largura_cm: d.largura_cm || null, altura_cm: d.altura_cm || null, cor_nome: d.cor_nome || null,
      tecido_nome: d.tecido_nome || null, modelo_nome: d.modelo_nome || null,
      exige_medida: d.exige_medida == null ? 1 : d.exige_medida,
      contagens: [
        { rodada:1, contado:i.contado1, saldo:i.saldo_na_contagem, diferenca:d1, por:i.por1, em:i.em1 },
        d2 === null ? null : { rodada:2, contado:i.contado2, saldo:i.saldo2, diferenca:d2, por:i.por2, em:i.em2 },
        d3 === null ? null : { rodada:3, contado:i.contado3, saldo:i.saldo3, diferenca:d3, por:i.por3, em:i.em3 }
      ].filter(Boolean),
      diferenca: i.diferenca,
      sem_acordo: d3 !== null && d3 !== d1 && d3 !== d2,
      regra_velha: d3 === null,
      saldo_agora: ESTOQUE.saldo(db, i.codigo),
      saldo_depois: (ESTOQUE.saldo(db, i.codigo) || 0) + (i.diferenca || 0),
      extrato,
      pode_aprovar: pode,
      por_que_nao: pode ? null : 'voce contou este SKU — a decisao e de outra pessoa'
    };
  });
}

function exigeMotivo(motivo, obs){
  const m = String(motivo || '').trim();
  if(!m) throw erro(400, 'escolha o motivo');
  if(/^outro/i.test(m) && !String(obs || '').trim()) throw erro(400, 'motivo "Outro" exige a observacao');
  return m;
}

/* RESOLVER — APLICAR (§5.7): grava no livro a diferenca escolhida, sobre o
   saldo de agora. Sem `diferenca`, vale a do item. Motivo obrigatorio. */
function aprovar(db, { id, motivo, obs, quem, diferenca }){
  const item = db.prepare('SELECT * FROM inventario_item WHERE id=?').get(+id);
  if(!item) throw erro(404, 'item nao encontrado');
  if(item.status !== 'aprovar') throw erro(409, 'este item nao esta esperando decisao');
  if(!ESTOQUE.outraPessoa(quem, quemJaContou(item)))
    throw erro(403, 'voce contou este SKU: a decisao tem que ser de outra pessoa', { motivo:'mesma_pessoa' });
  const m = exigeMotivo(motivo, obs);
  let delta = item.diferenca || 0;
  if(diferenca !== undefined && diferenca !== null && diferenca !== ''){
    const d = Number(diferenca);
    if(!Number.isInteger(d)) throw erro(400, 'a diferenca e numero inteiro de pecas');
    delta = d;
  }
  const r = aplicarNoLivro(db, item, delta, { motivo:m, obs, quem,
    livroNome: quemJaContou(item).map(p => p.nome).filter(Boolean).join(' / ') || null, aprovado_por: quem.nome || null });
  db.prepare(`UPDATE inventario_item SET status='aprovado', diferenca=?, motivo=?, obs=?, decidido_por=?, decidido_por_id=?,
      decidido_em=?, movimento_id=? WHERE id=?`)
    .run(delta, m, obs ? String(obs).trim() : null, quem.nome || '', quem.id != null ? quem.id : null, RELOGIO.agora(), r.mov, item.id);
  talvezFechar(db, item.ciclo_id);
  return { codigo:item.codigo, delta, antes:r.antes, depois:r.depois };
}

/* RESOLVER — MANDAR CONTAR DE NOVO. Nao apaga: o item fica `rejeitado`, com
   motivo. Na diaria o SKU volta na lista de AMANHA, do zero (§5.7); na
   quinzenal, na geral e na avulsa nasce um item novo no mesmo ciclo. */
function rejeitar(db, { id, motivo, obs, quem }){
  const item = db.prepare('SELECT * FROM inventario_item WHERE id=?').get(+id);
  if(!item) throw erro(404, 'item nao encontrado');
  if(item.status !== 'aprovar') throw erro(409, 'este item nao esta esperando decisao');
  if(!ESTOQUE.outraPessoa(quem, quemJaContou(item)))
    throw erro(403, 'voce contou este SKU: quem decide e outra pessoa', { motivo:'mesma_pessoa' });
  const m = exigeMotivo(motivo, obs);
  db.prepare(`UPDATE inventario_item SET status='rejeitado', motivo=?, obs=?, decidido_por=?, decidido_por_id=?,
      decidido_em=? WHERE id=?`)
    .run(m, obs ? String(obs).trim() : null, quem.nome || '', quem.id != null ? quem.id : null, RELOGIO.agora(), item.id);
  const ciclo = db.prepare('SELECT tipo FROM inventario_ciclo WHERE id=?').get(item.ciclo_id);
  let novo = null;
  if(!ciclo || ciclo.tipo !== 'diario')
    novo = db.prepare('INSERT INTO inventario_item (ciclo_id,codigo,anterior_id,criado_em) VALUES (?,?,?,?)')
      .run(item.ciclo_id, item.codigo, item.id, RELOGIO.agora()).lastInsertRowid;
  talvezFechar(db, item.ciclo_id);
  return { codigo:item.codigo, novo_item:novo, amanha: !novo };
}

/* O ANDAMENTO, para quem planeja: os ciclos abertos, o ciclo do dia, a escala
   e em que pe cada SKU esta. Sem numero de contagem — so estado e quem. */
function andamento(db, ctx){
  const doDia = cicloDoDia(db);
  const ciclos = db.prepare("SELECT * FROM inventario_ciclo WHERE status='aberto' ORDER BY id").all();
  const itens = db.prepare(`SELECT i.id, i.ciclo_id, i.codigo, i.status, i.fora_do_plano, i.degrau,
      i.por1, i.por2, i.por3, i.rascunho_por, i.rascunho IS NOT NULL contando
    FROM inventario_item i JOIN inventario_ciclo c ON c.id=i.ciclo_id
    WHERE c.status='aberto' ORDER BY i.ciclo_id, COALESCE(i.degrau,9), COALESCE(i.ordem,999999), i.codigo`).all();
  const conta = {};
  itens.forEach(i => conta[i.status] = (conta[i.status] || 0) + 1);
  const recentes = db.prepare(`SELECT i.codigo, i.status, i.diferenca, i.motivo, i.decidido_por, i.decidido_em, i.em1
    FROM inventario_item i WHERE i.status IN ('confirmado','aprovado','aplicado','rejeitado')
    ORDER BY COALESCE(i.decidido_em, i.em1) DESC, i.id DESC LIMIT 20`).all();
  const escala = doDia ? escalaDe(db, doDia.id, RELOGIO.hoje()) : [];
  const rodizio = (ctx && ctx.temChave) ? candidatos(db, ctx.temChave).map(u => ({ id:u.id, nome:u.nome, ultima:u.ultima })) : [];
  return { ciclos, itens, conta, recentes, ciclo_qtd: cicloQtd(db), do_dia: doDia, escala, rodizio,
    degraus: DEGRAUS, quinzenal_proxima: proximaQuinzenal(db) };
}
function proximaQuinzenal(db){
  const ult = db.prepare("SELECT MAX(COALESCE(data, substr(aberto_em,1,10))) d FROM inventario_ciclo WHERE tipo='quinzenal'").get();
  const base = (ult && ult.d) || cfg(db, 'quinzenal_base', RELOGIO.hoje());
  return RELOGIO.somarDias(base, cfgInt(db, 'quinzenal_dias', 15));
}

/* Quem esta no rodizio, e quem esta fora (§6.5), para a marcacao. */
function rodizio(db, temChave){
  if(!temTabela(db, 'usuarios')) return [];
  const temFora = temColuna(db, 'usuarios', 'fora_rodizio');
  const ult = {};
  db.prepare('SELECT usuario_id, MAX(data) d FROM inventario_escala WHERE COALESCE(teste,0)=0 GROUP BY usuario_id')
    .all().forEach(r => ult[r.usuario_id] = r.d);
  return db.prepare(`SELECT id, nome, ativo ${temFora ? ', COALESCE(fora_rodizio,0) fora' : ', 0 fora'} FROM usuarios ORDER BY nome`).all()
    .filter(u => { try{ return !!temChave(u.id); }catch(e){ return false; } })
    .map(u => ({ id:u.id, nome:u.nome, ativo:!!u.ativo, fora:!!u.fora, ultima: ult[u.id] || null }));
}
function marcarRodizio(db, { usuario_id, fora }){
  if(!temColuna(db, 'usuarios', 'fora_rodizio')) addCol(db, 'usuarios', 'fora_rodizio INTEGER DEFAULT 0');
  const u = db.prepare('SELECT id, nome FROM usuarios WHERE id=?').get(+usuario_id);
  if(!u) throw erro(404, 'pessoa nao encontrada');
  db.prepare('UPDATE usuarios SET fora_rodizio=? WHERE id=?').run(fora ? 1 : 0, u.id);
  return { id:u.id, nome:u.nome, fora:!!fora };
}

/* ─── o relatorio de furos (§7.3) ────────────────────────────────────────── */
/* O extrato do SKU "desde a ultima conferencia": a do item anterior que
   conferiu, ou 30 dias antes da 1ª contagem deste. */
function desdeConferencia(db, item){
  const ant = db.prepare(`SELECT MAX(COALESCE(decidido_em, em1)) em FROM inventario_item
    WHERE codigo=? AND id<? AND status IN ('confirmado','aprovado','aplicado')`).get(item.codigo, item.id);
  if(ant && ant.em) return ant.em;
  const base = item.em1 || RELOGIO.agora();
  return RELOGIO.somarDias(base.slice(0, 10), -30);
}

function relatorio(db, opcoes){
  const o = opcoes || {};
  const hojeD = RELOGIO.hoje();
  const mes = hojeD.slice(0, 8) + '01';
  const desde = o.desde || mes;
  const semana = RELOGIO.somarDias(hojeD, -6);
  const furos = db.prepare(`SELECT * FROM inventario_item WHERE status IN ('aplicado','aprovado')
      AND diferenca IS NOT NULL AND diferenca<>0 AND COALESCE(teste,0)=0 AND decidido_em >= ?
    ORDER BY decidido_em DESC, id DESC`).all(desde).map(i => ({
      id:i.id, codigo:i.codigo, diferenca:i.diferenca, status:i.status,
      sozinho: i.status === 'aplicado', motivo:i.motivo, obs:i.obs, decidido_por:i.decidido_por, quando:i.decidido_em,
      contagens: [
        { rodada:1, contado:i.contado1, saldo:i.saldo_na_contagem, por:i.por1, inicio:i.inicio1, em:i.em1 },
        i.contado2 != null ? { rodada:2, contado:i.contado2, saldo:i.saldo2, por:i.por2, inicio:i.inicio2, em:i.em2 } : null,
        i.contado3 != null ? { rodada:3, contado:i.contado3, saldo:i.saldo3, por:i.por3, inicio:i.inicio3, em:i.em3 } : null
      ].filter(Boolean),
      extrato: (() => { try{ return ESTOQUE.extrato(db, i.codigo, { desde: desdeConferencia(db, i), limite:50 }); }catch(e){ return []; } })()
    }));
  const soma = (lista) => lista.reduce((s, f) => {
    s.pecas += f.diferenca; if(f.diferenca < 0) s.faltou += -f.diferenca; else s.sobrou += f.diferenca; s.itens++; return s;
  }, { pecas:0, faltou:0, sobrou:0, itens:0 });
  const todosMes = db.prepare(`SELECT codigo, diferenca, decidido_em FROM inventario_item WHERE status IN ('aplicado','aprovado')
      AND diferenca IS NOT NULL AND diferenca<>0 AND COALESCE(teste,0)=0 AND decidido_em >= ?`).all(mes < semana ? mes : semana);
  const semanaL = todosMes.filter(f => f.decidido_em >= semana);
  const mesL = todosMes.filter(f => f.decidido_em >= mes);
  const porSku = {};
  furos.forEach(f => { const p = porSku[f.codigo] || (porSku[f.codigo] = { codigo:f.codigo, vezes:0, pecas:0, faltou:0 });
    p.vezes++; p.pecas += f.diferenca; if(f.diferenca < 0) p.faltou += -f.diferenca; });
  const maisFuram = Object.values(porSku).sort((a,b) => (Math.abs(b.pecas) - Math.abs(a.pecas)) || (b.vezes - a.vezes)).slice(0, 10);
  const naoConferidos = db.prepare(`SELECT i.codigo, i.status, c.tipo, c.data, c.prazo FROM inventario_item i
    JOIN inventario_ciclo c ON c.id=i.ciclo_id
    WHERE i.status IN ('nao_conferido','nao_contado') AND COALESCE(i.teste,0)=0 AND COALESCE(c.data, substr(c.aberto_em,1,10)) >= ?
    ORDER BY c.id DESC, i.codigo`).all(desde.slice(0, 10));
  const pelaMetade = db.prepare(`SELECT c.id, c.data, COUNT(i.id) sobraram FROM inventario_ciclo c
    JOIN inventario_item i ON i.veio_de=c.id WHERE c.tipo='diario' AND COALESCE(c.teste,0)=0 AND c.data >= ?
    GROUP BY c.id ORDER BY c.data DESC`).all(desde.slice(0, 10));
  const escala = db.prepare(`SELECT data, usuario_nome, abriu_para_todos_em FROM inventario_escala
    WHERE COALESCE(teste,0)=0 AND data >= ? ORDER BY data DESC, id`).all(desde.slice(0, 10))
    .map(e => ({ data:e.data, nome:e.usuario_nome, nao_contou: !!e.abriu_para_todos_em }));
  return { desde, furos, semana: soma(semanaL), mes: soma(mesL), mais_furam: maisFuram,
    nao_conferidos: naoConferidos, listas_pela_metade: pelaMetade, escala,
    fila_admin: pendencias(db).aprovar.n, acuracidade: acuracidade(db, { desde: mes }) };
}

/* ─── A ACURACIDADE (fase 4 da spec, §8, 02/10/2026) ─────────────────────────
   Itens que BATERAM na 1ª contagem ÷ itens contados, no mes corrente (R-EST-23:
   a pergunta e se o saldo estava certo quando alguem foi olhar). A spec v2
   (§7.3) escreve "confirmados sem diferenca ÷ conferidos"; vale o CLAUDE.md.
   Sem contagem no periodo e NULL, nunca zero. Modo teste fica fora. */
function acuracidade(db, opcoes){
  const desde = (opcoes && opcoes.desde) || (RELOGIO.hoje().slice(0, 8) + '01');
  const r = db.prepare(`SELECT COUNT(*) contados,
      SUM(CASE WHEN contado1 = saldo_na_contagem THEN 1 ELSE 0 END) certos
    FROM inventario_item
    WHERE contado1 IS NOT NULL AND em1 >= ? AND COALESCE(teste,0)=0`).get(desde);
  const contados = r.contados || 0, certos = r.certos || 0;
  return { desde, contados, certos, pct: contados ? Math.round(certos / contados * 1000) / 10 : null };
}

/* A diferenca do mes, por motivo, em PECAS (|delta|). O que aplicou sozinho
   (as contagens bateram) nao tem motivo de ninguem, e aparece como tal. */
function diferencaPorMotivo(db, opcoes){
  const desde = (opcoes && opcoes.desde) || (RELOGIO.hoje().slice(0, 8) + '01');
  return db.prepare(`SELECT codigo, COALESCE(motivo, 'Contagens bateram (sem motivo)') motivo, ABS(diferenca) pecas FROM inventario_item
    WHERE status IN ('aprovado','aplicado') AND diferenca IS NOT NULL AND diferenca<>0
      AND decidido_em >= ? AND COALESCE(teste,0)=0`).all(desde);
}

module.exports = { ABERTOS, CONFERIU, MOTIVOS, DEGRAUS, garantirSchema, garantirRecusa, registrarRecusa,
  pendencias, acuracidade, diferencaPorMotivo, conferencias, sugestao, abrir, abrirQuinzenal, encerrar,
  garantirDia, cicloDoDia, candidatos, rodizio, marcarRodizio, abertoParaTodos,
  contar, terminar, terminarPrateleira, hoje, tarja, aprovacao, aprovar, rejeitar, andamento, relatorio,
  itemAberto, erro };

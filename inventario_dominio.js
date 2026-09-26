/* A CONFERENCIA DE ESTOQUE — fase 2 da spec ESTOQUE-LIVRO-E-CONFERENCIA
 * (26/09/2026). Dono unico do ciclo de inventario da PECA.
 *
 *   PLANEJAR ─▶ CONTAR CEGO ─▶ bateu ─────────▶ CONFIRMADO (sozinho)
 *                           └─ diferente ─▶ RECONTAR CEGO (outra pessoa)
 *                                            ├─ achou a MESMA diferenca ─▶ APROVAR
 *                                            └─ outra ─▶ 3ª contagem (3ª pessoa) ─▶ APROVAR
 *   APROVAR (quem nao contou) ─▶ movimento `inventario` = diferenca contra o saldo guardado
 *
 * ⚠️ O QUE SE COMPARA E A DIFERENCA, NAO O NUMERO CONTADO. A spec (§5.1) diz
 * "recontagem = 1ª contagem". Isso so vale se nada andou entre as duas: a
 * fabrica embala e imprime no meio, e a prateleira muda junto com o saldo.
 * Cada contagem guarda o saldo do momento em que terminou, e a pergunta e
 * "as duas acharam a mesma DIFERENCA contra o sistema?". Sem nada no meio, e
 * exatamente a regra da spec; com uma embalagem no meio, e a unica que nao
 * manda recontar uma terceira vez por causa de trabalho legitimo.
 *
 * ⚠️ QUEM CONTA NUNCA RECEBE O SALDO — nem o JSON o traz (regra 14 do §13).
 * Nem a resposta do "terminei" diz se bateu: dizer "nao bateu" a quem conta e
 * convidar a recontar de cabeca. A comparacao e do sistema.
 *
 * ⚠️ NINGUEM APROVA O PROPRIO TRABALHO, E ISSO VALE PARA O ADMIN GERAL
 * (`outraPessoa`, no estoque_dominio). E o aprovador unico ESPERA (decisao do
 * dono, §6.4, 26/09/2026): nao ha motivo que dispense a segunda pessoa.
 *
 * ⚠️ NENHUMA FUNCAO DAQUI ABRE TRANSACAO — quem chama decide o escopo, como no
 * estoque_dominio. A rota embrulha cada passo numa so.
 */
const ESTOQUE = require('./estoque_dominio');

const ABERTOS  = ['a_contar','recontar','terceira','aprovar'];   // item que ainda anda
const CONFERIU = ['confirmado','aprovado'];                      // item que conferiu o saldo

const MOTIVOS = ['Perda ou avaria','Erro de bipe na embalagem','Erro de bipe na etiqueta',
  'Devolucao nao lancada','Cancelamento nao lancado','Peca sem registro de entrada',
  'Contagem anterior errada','Outro'];

function garantirSchema(db){
  db.exec(`CREATE TABLE IF NOT EXISTS inventario_ciclo (
    id         INTEGER PRIMARY KEY AUTOINCREMENT,
    tipo       TEXT,
    aberto_por TEXT,
    aberto_em  TEXT DEFAULT (datetime('now','localtime')),
    fechado_em TEXT,
    status     TEXT DEFAULT 'aberto',
    teste      INTEGER DEFAULT 0
  );`);
  /* Um SKU por ciclo. As tres contagens moram na MESMA linha: a regra "quem
     contou nao reconta" e "quem contou nao aprova" e uma pergunta sobre a
     linha inteira, e espalhar as contagens em tabela filha tornaria a pergunta
     uma consulta que alguem um dia escreve pela metade.

     `saldo_na_contagem` e o nome da spec (§5.4) para o saldo guardado da 1ª
     contagem; `saldo2` e `saldo3` sao os das outras (ver o cabecalho: o que se
     compara e a diferenca, e cada contagem tem o seu momento).

     `rascunho` e a contagem EM ANDAMENTO (a pessoa bipando), de quem esta
     contando. Vira `contadoN` no "terminei". */
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
    teste             INTEGER DEFAULT 0
  );`);
  db.exec('CREATE INDEX IF NOT EXISTS ix_inventario_item_codigo ON inventario_item(codigo, status)');
  /* A lista de motivos nasce com os oito da spec (§5.7) e e editavel como as
     outras. Lista vazia faria a aprovacao pedir um motivo que nao existe —
     regra escrita que nao pega em ninguem (divida 18). */
  try{
    db.exec("CREATE TABLE IF NOT EXISTS listas (id INTEGER PRIMARY KEY AUTOINCREMENT, tipo TEXT, valor TEXT, ordem INTEGER DEFAULT 0, ativo INTEGER DEFAULT 1)");
    if(!db.prepare("SELECT COUNT(*) c FROM listas WHERE tipo='motivo_estoque'").get().c){
      const ins = db.prepare("INSERT INTO listas (tipo,valor,ordem) VALUES ('motivo_estoque',?,?)");
      MOTIVOS.forEach((v,i) => ins.run(v, i));
    }
  }catch(e){}
}

/* Coluna existe? Banco de teste e banco antigo nao tem todas. */
function temColuna(db, tabela, col){
  try{ return db.prepare('PRAGMA table_info('+tabela+')').all().some(c => c.name === col); }
  catch(e){ return false; }
}

/* O que a peca E — para a pessoa comparar com a prateleira. Nunca o saldo. */
function descreverSkus(db, codigos){
  const out = {};
  if(!codigos.length) return out;
  const marcas = codigos.map(() => '?').join(',');
  /* A consulta se monta pelo que o banco tem: banco antigo ou de teste sem as
     tabelas de cor, tecido e modelo continua mostrando a medida, que e o que a
     pessoa compara com a prateleira. */
  const tem = t => { try{ return !!db.prepare("SELECT 1 FROM sqlite_master WHERE type='table' AND name=?").get(t); }catch(e){ return false; } };
  const cols = ['s.codigo','s.descricao'];
  const joins = [];
  if(temColuna(db,'skus','largura_cm')) cols.push('s.largura_cm','s.altura_cm');
  if(tem('cor')){ joins.push('LEFT JOIN cor c ON c.codigo=s.cor_codigo'); cols.push('COALESCE(c.nome,s.cor_codigo,s.cor) cor_nome'); }
  else cols.push('s.cor cor_nome');
  if(tem('tecido')){ joins.push('LEFT JOIN tecido t ON t.codigo=s.tecido_codigo'); cols.push('COALESCE(t.nome,s.tecido_codigo) tecido_nome'); }
  if(tem('modelo') && temColuna(db,'skus','modelo_id')){ joins.push('LEFT JOIN modelo m ON m.id=s.modelo_id'); cols.push('m.nome modelo_nome','COALESCE(m.exige_medida,1) exige_medida'); }
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

/* A IDADE DA CONFERENCIA — quando o saldo de cada SKU foi olhado na prateleira
 * pela ultima vez. Dono unico: a aba Estoque (est_route) e a sugestao do ciclo
 * leem daqui. Duas reguas aqui era o que fazia a idade mentir (§18, #32).
 *
 * SAO TRES FONTES, E NAO UMA TROCA: a `contagem` e a `contagem_pendente` sao a
 * historia de antes desta fase, e trocar apagaria quem foi contado antes do
 * deploy. Cada uma em try proprio: tabela que nao existe num banco nao pode
 * apagar a idade que as outras sabem.
 *
 * Da conferencia nova vale o item CONFIRMADO ou APROVADO, datado pela 1ª
 * contagem (`em1`): quem olhou a prateleira olhou naquele dia, e uma aprovacao
 * que demora nao rejuvenesce a conferencia. Rejeitado nao conferiu nada. */
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
      WHERE status IN ('confirmado','aprovado') AND COALESCE(teste,0)=0 GROUP BY codigo`).all()); }catch(e){}
  const hoje = db.prepare("SELECT julianday('now','localtime') j").get().j;
  const dia = db.prepare("SELECT julianday(?) j");
  for(const c in m) m[c].dias = Math.floor(hoje - dia.get(m[c].em).j);
  return m;
}

/* O SKU ja esta num item que anda? Um SKU so pode estar em UM item aberto por
   vez: dois itens abertos do mesmo SKU seriam duas contagens da mesma
   prateleira disputando a mesma diferenca. */
function itemAberto(db, codigo){
  return db.prepare(`SELECT i.* FROM inventario_item i JOIN inventario_ciclo c ON c.id=i.ciclo_id
    WHERE i.codigo=? AND i.status IN ('a_contar','recontar','terceira','aprovar') AND c.status='aberto'
    ORDER BY i.id DESC LIMIT 1`).get(codigo);
}

/* A SUGESTAO DO CICLO DIARIO (§5.5): nunca conferidos primeiro; depois mais
   dias sem conferencia × mais giro. Fora: sob medida, inativo e o que ja esta
   num item aberto. */
function sugestao(db, qtd){
  const n = Math.max(1, Math.min(200, +qtd || cicloQtd(db)));
  const conf = conferencias(db);
  const media = {};
  try{ require('./demanda_dominio').calcular(db).linhas.forEach(l => media[l.codigo] = +l.media_dia || 0); }catch(e){}
  const filtroAtivo = temColuna(db, 'skus', 'ativo') ? ' AND COALESCE(s.ativo,1)=1' : '';
  let skus = [];
  try{
    skus = db.prepare(`SELECT s.codigo, COALESCE(s.estoque,0) estoque FROM skus s
      LEFT JOIN modelo m ON m.id=s.modelo_id
      WHERE COALESCE(m.sob_medida,0)=0 ${filtroAtivo}`).all();
  }catch(e){
    skus = db.prepare(`SELECT codigo, COALESCE(estoque,0) estoque FROM skus s WHERE 1=1 ${filtroAtivo}`).all();
  }
  const lista = [];
  for(const s of skus){
    if(itemAberto(db, s.codigo)) continue;
    const c = conf[String(s.codigo).toUpperCase()];
    // Conferido hoje nao volta na sugestao de hoje: contar de novo a mesma
    // prateleira no mesmo dia gasta o tempo da conferencia sem conferir nada.
    if(c && c.dias === 0) continue;
    const giro = media[s.codigo] || 0;
    lista.push({ codigo:s.codigo, nunca: !c, dias: c ? c.dias : null, media_dia: giro,
      // Sem conferencia nenhuma nao tem idade: fica acima de todos (`nunca`).
      peso: c ? (c.dias + 1) * (giro + 0.1) : 0 });
  }
  lista.sort((a,b) => (b.nunca - a.nunca) || (b.peso - a.peso) || (b.media_dia - a.media_dia) ||
    String(a.codigo).localeCompare(String(b.codigo)));
  return lista.slice(0, n).map(l => ({ codigo:l.codigo, nunca:l.nunca, dias:l.dias, media_dia:l.media_dia }));
}

function cicloQtd(db){
  try{ const r = db.prepare("SELECT valor FROM config WHERE chave='ciclo_qtd'").get();
       const v = r ? parseInt(r.valor, 10) : NaN; return v > 0 ? v : 8; }catch(e){ return 8; }
}

/* O que entra num inventario GERAL: todo SKU com saldo, ou com movimento nos
   ultimos 30 dias (§5.5). Sob medida e inativo, nao. */
function universoGeral(db){
  const filtroAtivo = temColuna(db, 'skus', 'ativo') ? ' AND COALESCE(s.ativo,1)=1' : '';
  let linhas = [];
  try{
    linhas = db.prepare(`SELECT s.codigo FROM skus s LEFT JOIN modelo m ON m.id=s.modelo_id
      WHERE COALESCE(m.sob_medida,0)=0 ${filtroAtivo} AND (COALESCE(s.estoque,0)<>0 OR EXISTS(
        SELECT 1 FROM movimento_estoque v WHERE v.codigo=s.codigo AND v.tipo<>'abertura'
          AND v.criado_em >= datetime('now','localtime','-30 days')))
      ORDER BY s.codigo`).all();
  }catch(e){
    linhas = db.prepare(`SELECT codigo FROM skus s WHERE COALESCE(estoque,0)<>0 ${filtroAtivo} ORDER BY codigo`).all();
  }
  return linhas.map(l => l.codigo);
}

/* Abre um ciclo. `codigos` vazio num ciclico = a sugestao do dia. SKU que ja
   esta num item aberto fica de fora e e DITO (`ja_abertos`), em vez de sumir. */
function abrir(db, { tipo, codigos, quem }){
  const t = tipo === 'geral' ? 'geral' : 'ciclico';
  let lista = t === 'geral' ? universoGeral(db)
    : ((codigos && codigos.length) ? codigos : sugestao(db).map(s => s.codigo));
  lista = [...new Set(lista.map(c => String(c || '').trim().toUpperCase()).filter(Boolean))];
  const existe = db.prepare('SELECT 1 FROM skus WHERE codigo=?');
  const fora = lista.filter(c => !existe.get(c));
  if(fora.length) throw erro(400, 'SKU fora do cadastro: ' + fora.join(', '));
  const ja = lista.filter(c => itemAberto(db, c));
  const sm = lista.filter(c => ehSobMedida(db, c));
  const entram = lista.filter(c => ja.indexOf(c) < 0 && sm.indexOf(c) < 0);
  if(!entram.length) throw erro(409, ja.length
    ? 'todos os SKUs escolhidos ja estao numa conferencia aberta'
    : 'nao ha SKU para conferir');
  const id = db.prepare('INSERT INTO inventario_ciclo (tipo,aberto_por) VALUES (?,?)')
    .run(t, (quem && quem.nome) || '').lastInsertRowid;
  const ins = db.prepare('INSERT INTO inventario_item (ciclo_id,codigo) VALUES (?,?)');
  entram.forEach(c => ins.run(id, c));
  return { ciclo_id:id, tipo:t, itens:entram.length, ja_abertos:ja, sob_medida:sm };
}

function erro(status, mensagem, extra){
  const e = new Error(mensagem); e.status = status; e.extra = extra || null; return e;
}

/* Fecha o ciclo quando nada mais anda nele. */
function talvezFechar(db, cicloId){
  const r = db.prepare(`SELECT COUNT(*) n FROM inventario_item WHERE ciclo_id=?
    AND status IN ('a_contar','recontar','terceira','aprovar')`).get(cicloId);
  if(!r.n) db.prepare(`UPDATE inventario_ciclo SET status='fechado', fechado_em=datetime('now','localtime')
    WHERE id=? AND status='aberto'`).run(cicloId);
}

/* "Encerrar": o que ninguem contou sai como `nao_contado`. Divergencia em
   andamento NAO sai: ela ja achou uma diferenca, e fechar ali seria esquecer
   uma peca que falta. O ciclo fecha quando elas terminarem. */
function encerrar(db, cicloId){
  const c = db.prepare('SELECT * FROM inventario_ciclo WHERE id=?').get(cicloId);
  if(!c) throw erro(404, 'conferencia nao encontrada');
  const n = db.prepare(`UPDATE inventario_item SET status='nao_contado', rascunho=NULL
    WHERE ciclo_id=? AND status='a_contar'`).run(cicloId).changes;
  talvezFechar(db, cicloId);
  const resta = db.prepare(`SELECT COUNT(*) n FROM inventario_item WHERE ciclo_id=?
    AND status IN ('recontar','terceira','aprovar')`).get(cicloId).n;
  return { nao_contados:n, em_andamento:resta };
}

/* O ESTAGIO de contagem do item, e quem pode contar nele. */
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

/* SOMA UM BIPE (ou uma quantidade digitada) na contagem em andamento.
 *
 * `papel` e 'contar' (1ª contagem) ou 'recontar' (2ª e 3ª): quem so tem
 * contagem.contar nao cai numa recontagem por bipar o SKU errado, e a
 * recontagem recusa quem ja contou aquele item.
 *
 * SKU fora de qualquer conferencia, com uma conferencia aberta: entra como
 * item novo (`fora_do_plano`) — a peca esta na prateleira, e recusar seria
 * mandar a pessoa ignorar o que ela esta vendo. Sem conferencia aberta, recusa.
 *
 * A resposta e SO "contado: N". */
function contar(db, { codigo, quantidade, zerar, papel, quem }){
  const cod = String(codigo || '').trim().toUpperCase();
  if(!cod) throw erro(400, 'sem codigo');
  if(!quem || (!quem.id && !quem.nome)) throw erro(401, 'sem pessoa logada');
  const q = quantidade === undefined || quantidade === null || quantidade === '' ? 1 : Number(quantidade);
  if(!Number.isInteger(q) || q < 0) throw erro(400, 'quantidade invalida: peca e numero inteiro');
  if(!db.prepare('SELECT 1 FROM skus WHERE codigo=?').get(cod))
    throw erro(404, cod + ' nao existe no cadastro de SKU — etiqueta errada?', { motivo:'sem_cadastro' });
  if(ehSobMedida(db, cod))
    throw erro(409, cod + ' e sob medida: nao tem estoque para conferir', { motivo:'sob_medida' });

  let item = itemAberto(db, cod);
  if(!item){
    if(papel !== 'contar') throw erro(409, cod + ' nao esta em recontagem', { motivo:'fora_da_recontagem' });
    const ciclo = db.prepare("SELECT id FROM inventario_ciclo WHERE status='aberto' ORDER BY id DESC LIMIT 1").get();
    if(!ciclo) throw erro(409, 'nenhuma conferencia aberta — peca ao responsavel para abrir', { motivo:'sem_ciclo' });
    const id = db.prepare('INSERT INTO inventario_item (ciclo_id,codigo,fora_do_plano) VALUES (?,?,1)')
      .run(ciclo.id, cod).lastInsertRowid;
    item = db.prepare('SELECT * FROM inventario_item WHERE id=?').get(id);
  }
  const est = estagio(item);
  if(est === 0) throw erro(409, cod + ' ja foi contado e espera aprovacao', { motivo:'aguardando_aprovacao' });
  if(papel === 'contar' && est !== 1)
    throw erro(409, cod + ' esta em RECONTAGEM — quem reconta e outra pessoa', { motivo:'em_recontagem' });
  if(papel === 'recontar' && est === 1)
    throw erro(409, cod + ' ainda nao teve a primeira contagem', { motivo:'nao_contado' });
  if(papel === 'recontar' && !ESTOQUE.outraPessoa(quem, quemJaContou(item)))
    throw erro(403, 'voce ja contou ' + cod + ': a recontagem tem que ser de outra pessoa', { motivo:'mesma_pessoa' });

  /* Uma pessoa por vez no mesmo SKU. Duas contando a mesma prateleira somariam
     as duas contagens num numero so, e ninguem saberia. */
  const dono = item.rascunho_por_id || item.rascunho_por;
  const eu   = (quem.id != null && item.rascunho_por_id != null) ? String(quem.id) === String(item.rascunho_por_id)
             : String(quem.nome || '') === String(item.rascunho_por || '');
  if(item.rascunho != null && dono && !eu)
    throw erro(409, (item.rascunho_por || 'outra pessoa') + ' esta contando ' + cod + ' agora', { motivo:'outra_contando' });

  const base = zerar ? 0 : (item.rascunho || 0);
  const novo = base + (zerar ? 0 : q);
  db.prepare('UPDATE inventario_item SET rascunho=?, rascunho_por=?, rascunho_por_id=? WHERE id=?')
    .run(novo, quem.nome || '', quem.id != null ? quem.id : null, item.id);
  return { codigo:cod, contado:novo };
}

/* "TERMINEI ESTE SKU". Guarda o saldo do momento, compara, e decide o estado.
 * Sem bipe nenhum e permitido: e assim que "nao tem nenhuma" vira contagem
 * (zero e resposta, igual a contagem de material). A resposta nao diz se bateu. */
function terminar(db, { codigo, papel, quem }){
  const cod = String(codigo || '').trim().toUpperCase();
  if(!quem || (!quem.id && !quem.nome)) throw erro(401, 'sem pessoa logada');
  const item = itemAberto(db, cod);
  if(!item) throw erro(404, cod + ' nao esta em nenhuma conferencia aberta');
  const est = estagio(item);
  if(est === 0) throw erro(409, cod + ' ja foi contado e espera aprovacao');
  if(papel === 'contar' && est !== 1) throw erro(409, cod + ' esta em recontagem', { motivo:'em_recontagem' });
  if(papel === 'recontar' && est === 1) throw erro(409, cod + ' ainda nao teve a primeira contagem');
  if(est > 1 && !ESTOQUE.outraPessoa(quem, quemJaContou(item)))
    throw erro(403, 'voce ja contou ' + cod + ': a recontagem tem que ser de outra pessoa', { motivo:'mesma_pessoa' });
  if(item.rascunho != null && (item.rascunho_por_id || item.rascunho_por)){
    const eu = (quem.id != null && item.rascunho_por_id != null) ? String(quem.id) === String(item.rascunho_por_id)
             : String(quem.nome || '') === String(item.rascunho_por || '');
    if(!eu) throw erro(409, (item.rascunho_por || 'outra pessoa') + ' esta contando ' + cod + ' agora', { motivo:'outra_contando' });
  }
  const contado = item.rascunho || 0;
  const saldo = ESTOQUE.saldo(db, cod) || 0;
  const nome = quem.nome || '', uid = quem.id != null ? quem.id : null;
  const d1 = est === 1 ? contado - saldo : item.contado1 - item.saldo_na_contagem;
  let status, diferenca = null;

  if(est === 1){
    status = d1 === 0 ? 'confirmado' : 'recontar';
    if(d1 === 0) diferenca = 0;
    db.prepare(`UPDATE inventario_item SET saldo_na_contagem=?, contado1=?, por1=?, por1_id=?,
        em1=datetime('now','localtime'), status=?, diferenca=?, rascunho=NULL, rascunho_por=NULL, rascunho_por_id=NULL
      WHERE id=?`).run(saldo, contado, nome, uid, status, diferenca, item.id);
  } else if(est === 2){
    const d2 = contado - saldo;
    if(d2 === d1){ status = 'aprovar'; diferenca = d1; }
    else status = 'terceira';
    db.prepare(`UPDATE inventario_item SET saldo2=?, contado2=?, por2=?, por2_id=?,
        em2=datetime('now','localtime'), status=?, diferenca=?, rascunho=NULL, rascunho_por=NULL, rascunho_por_id=NULL
      WHERE id=?`).run(saldo, contado, nome, uid, status, diferenca, item.id);
  } else {
    /* A 3ª decide pelo acordo: a diferenca em que DUAS das tres contagens
       concordam. Se o acordo e zero, o sistema estava certo e quem errou foi a
       1ª contagem — confirma sem movimento. Sem acordo nenhum, vai para a
       aprovacao com a da 3ª, e a tela mostra as tres: quem aprova ve que elas
       nao concordam, e pode rejeitar. */
    const d2 = item.contado2 - item.saldo2, d3 = contado - saldo;
    const acordo = (d3 === d1) ? d1 : (d3 === d2) ? d2 : null;
    if(acordo === 0){ status = 'confirmado'; diferenca = 0; }
    else { status = 'aprovar'; diferenca = acordo === null ? d3 : acordo; }
    db.prepare(`UPDATE inventario_item SET saldo3=?, contado3=?, por3=?, por3_id=?,
        em3=datetime('now','localtime'), status=?, diferenca=?, rascunho=NULL, rascunho_por=NULL, rascunho_por_id=NULL
      WHERE id=?`).run(saldo, contado, nome, uid, status, diferenca, item.id);
  }
  talvezFechar(db, item.ciclo_id);
  return { codigo:cod, registrado:true };
}

/* O que a pessoa tem para contar (papel 'contar') ou recontar ('recontar').
   SEM saldo e SEM contagem anterior — o JSON nao traz os campos. Na
   recontagem, some o que a pessoa ja contou. */
function lista(db, { papel, quem }){
  const status = papel === 'recontar' ? ['recontar','terceira'] : ['a_contar'];
  const linhas = db.prepare(`SELECT i.* FROM inventario_item i JOIN inventario_ciclo c ON c.id=i.ciclo_id
    WHERE c.status='aberto' AND i.status IN (${status.map(() => '?').join(',')})
    ORDER BY i.codigo`).all(...status)
    .filter(i => papel !== 'recontar' || ESTOQUE.outraPessoa(quem, quemJaContou(i)));
  const desc = descreverSkus(db, linhas.map(l => l.codigo));
  const eu = i => (quem && quem.id != null && i.rascunho_por_id != null)
    ? String(quem.id) === String(i.rascunho_por_id) : String((quem && quem.nome) || '') === String(i.rascunho_por || '');
  return linhas.map(i => {
    const d = desc[i.codigo] || {};
    const minha = i.rascunho != null && eu(i);
    return {
      codigo: i.codigo, rodada: estagio(i),
      descricao: d.descricao || '', largura_cm: d.largura_cm || null, altura_cm: d.altura_cm || null,
      cor_nome: d.cor_nome || null, tecido_nome: d.tecido_nome || null, modelo_nome: d.modelo_nome || null,
      exige_medida: d.exige_medida == null ? 1 : d.exige_medida,
      // So o que a PROPRIA pessoa ja bipou. O que outro esta contando aparece
      // como "ocupado", sem o numero dele.
      contando: minha ? i.rascunho : null,
      ocupado_por: (!minha && i.rascunho != null) ? (i.rascunho_por || 'outra pessoa') : null
    };
  });
}

/* A FILA DE APROVACAO (e o resto do andamento), para quem aprova. Aqui os
   numeros aparecem: quem aprova precisa ver o que cada contagem achou. */
function aprovacao(db, { quem }){
  const linhas = db.prepare(`SELECT i.*, c.tipo ciclo_tipo FROM inventario_item i
    JOIN inventario_ciclo c ON c.id=i.ciclo_id
    WHERE i.status='aprovar' ORDER BY i.em1, i.id`).all();
  const desc = descreverSkus(db, linhas.map(l => l.codigo));
  return linhas.map(i => {
    const pode = ESTOQUE.outraPessoa(quem, quemJaContou(i));
    const d1 = i.contado1 - i.saldo_na_contagem;
    const d2 = i.contado2 != null ? i.contado2 - i.saldo2 : null;
    const d3 = i.contado3 != null ? i.contado3 - i.saldo3 : null;
    let extrato = [];
    try{ extrato = ESTOQUE.extrato(db, i.codigo, { desde:i.em1, limite:50 }); }catch(e){}
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
      saldo_agora: ESTOQUE.saldo(db, i.codigo),
      saldo_depois: (ESTOQUE.saldo(db, i.codigo) || 0) + (i.diferenca || 0),
      extrato,
      pode_aprovar: pode,
      por_que_nao: pode ? null : 'voce contou este SKU — a aprovacao e de outra pessoa'
    };
  });
}

function exigeMotivo(motivo, obs){
  const m = String(motivo || '').trim();
  if(!m) throw erro(400, 'escolha o motivo');
  if(/^outro/i.test(m) && !String(obs || '').trim()) throw erro(400, 'motivo "Outro" exige a observacao');
  return m;
}

/* APROVAR: grava no livro a diferenca contra o saldo GUARDADO, sobre o saldo
   de agora. O que foi embalado ou impresso entre contar e aprovar continua
   valendo (§5.4, e a armadilha #32). */
function aprovar(db, { id, motivo, obs, quem }){
  const item = db.prepare('SELECT * FROM inventario_item WHERE id=?').get(+id);
  if(!item) throw erro(404, 'item nao encontrado');
  if(item.status !== 'aprovar') throw erro(409, 'este item nao esta esperando aprovacao');
  if(!ESTOQUE.outraPessoa(quem, quemJaContou(item)))
    throw erro(403, 'voce contou este SKU: a aprovacao tem que ser de outra pessoa', { motivo:'mesma_pessoa' });
  const m = exigeMotivo(motivo, obs);
  const delta = item.diferenca || 0;
  let mov = null, antes = ESTOQUE.saldo(db, item.codigo), depois = antes;
  if(delta !== 0){
    const contaram = quemJaContou(item).map(p => p.nome).filter(Boolean).join(' / ');
    const r = ESTOQUE.movimentar(db, { codigo:item.codigo, delta, tipo:'inventario',
      referencia:'inventario:' + item.id, motivo:m + (obs ? ' — ' + String(obs).trim() : ''),
      usuario_nome: contaram || null, aprovado_por: quem.nome || null });
    depois = r.depois;
    mov = db.prepare('SELECT MAX(id) id FROM movimento_estoque WHERE codigo=?').get(item.codigo).id;
    /* E o rastro que a aba Estoque ja le (o botao "historico"), como a fase 0
       deixou para a contagem. A fase 3 troca esse card para ler do livro. */
    try{
      db.prepare(`INSERT INTO ajuste_estoque (codigo,antes,depois,delta,motivo,obs,usuario_id,usuario_nome)
        VALUES (?,?,?,?,?,?,?,?)`).run(item.codigo, antes, depois, delta, 'Inventario: ' + m,
          'conferencia #' + item.ciclo_id + ' · contaram: ' + contaram +
          ' · 1ª ' + item.contado1 + ' (sistema dizia ' + item.saldo_na_contagem + ')' +
          (obs ? ' · ' + String(obs).trim() : ''), quem.id || null, quem.nome || '');
    }catch(e){}
  }
  db.prepare(`UPDATE inventario_item SET status='aprovado', motivo=?, obs=?, decidido_por=?, decidido_por_id=?,
      decidido_em=datetime('now','localtime'), movimento_id=? WHERE id=?`)
    .run(m, obs ? String(obs).trim() : null, quem.nome || '', quem.id != null ? quem.id : null, mov, item.id);
  talvezFechar(db, item.ciclo_id);
  return { codigo:item.codigo, delta, antes, depois };
}

/* REJEITAR NAO APAGA: o item fica `rejeitado`, com motivo, e nasce um item
   novo a contar do zero no mesmo ciclo. A spec diz "recontar"; na construcao
   ficou "a contar do zero", porque quem rejeita esta dizendo que nao confia
   nas contagens — e uma recontagem compararia de novo com a 1ª. */
function rejeitar(db, { id, motivo, obs, quem }){
  const item = db.prepare('SELECT * FROM inventario_item WHERE id=?').get(+id);
  if(!item) throw erro(404, 'item nao encontrado');
  if(item.status !== 'aprovar') throw erro(409, 'este item nao esta esperando aprovacao');
  if(!ESTOQUE.outraPessoa(quem, quemJaContou(item)))
    throw erro(403, 'voce contou este SKU: quem decide e outra pessoa', { motivo:'mesma_pessoa' });
  const m = exigeMotivo(motivo, obs);
  db.prepare(`UPDATE inventario_item SET status='rejeitado', motivo=?, obs=?, decidido_por=?, decidido_por_id=?,
      decidido_em=datetime('now','localtime') WHERE id=?`)
    .run(m, obs ? String(obs).trim() : null, quem.nome || '', quem.id != null ? quem.id : null, item.id);
  const novo = db.prepare('INSERT INTO inventario_item (ciclo_id,codigo,anterior_id) VALUES (?,?,?)')
    .run(item.ciclo_id, item.codigo, item.id).lastInsertRowid;
  return { codigo:item.codigo, novo_item:novo };
}

/* O ANDAMENTO, para quem planeja: os ciclos abertos e em que pe cada SKU esta.
   Sem numero de contagem — so estado e quem. */
function andamento(db){
  const ciclos = db.prepare("SELECT * FROM inventario_ciclo WHERE status='aberto' ORDER BY id").all();
  const itens = db.prepare(`SELECT i.id, i.ciclo_id, i.codigo, i.status, i.fora_do_plano,
      i.por1, i.por2, i.por3, i.rascunho_por, i.rascunho IS NOT NULL contando
    FROM inventario_item i JOIN inventario_ciclo c ON c.id=i.ciclo_id
    WHERE c.status='aberto' ORDER BY i.ciclo_id, i.codigo`).all();
  const conta = {};
  itens.forEach(i => conta[i.status] = (conta[i.status] || 0) + 1);
  const recentes = db.prepare(`SELECT i.codigo, i.status, i.diferenca, i.motivo, i.decidido_por, i.decidido_em, i.em1
    FROM inventario_item i WHERE i.status IN ('confirmado','aprovado','rejeitado')
    ORDER BY COALESCE(i.decidido_em, i.em1) DESC, i.id DESC LIMIT 20`).all();
  return { ciclos, itens, conta, recentes, ciclo_qtd: cicloQtd(db) };
}

module.exports = { ABERTOS, CONFERIU, MOTIVOS, garantirSchema, conferencias, sugestao, abrir, encerrar,
  contar, terminar, lista, aprovacao, aprovar, rejeitar, andamento, itemAberto, erro };

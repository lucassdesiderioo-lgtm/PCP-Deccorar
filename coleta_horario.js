/* coleta_horario.js — DONO ÚNICO dos horários de saída (spec HORARIOS-DE-COLETA,
 * fases 1 e 2, 05/11/2026).
 *
 * Responde três perguntas:
 *   - que saídas tem um dia (as coletas do caminhão do ML e a agência), com a
 *     janela e o corte ("vendido até");
 *   - para qual saída é a venda que entrou no PDF (`marcavel`, usado pelo upload);
 *   - quanto falta para a próxima coleta e quantas caixas dela faltam (`status`).
 *
 * Regras (cartões R-HCO no docs/regras/carregamento.md):
 *   - o horário é da DATA, e não do dia da semana: o ML muda durante a semana
 *     (R-HCO-01). A agência sem horário lançado continua no `config` de sempre;
 *   - de 0 a 3 coletas por dia, janela início < fim, corte opcional e no máximo
 *     no início (R-HCO-02); a Coleta 1 é a mais cedo;
 *   - lançar de novo substitui, e o antes e o depois ficam na história, com
 *     quem e por onde (R-HCO-03). A coleta corrigida mantém o id: as caixas
 *     marcadas continuam ligadas a ela. A coleta tirada fica com `removido_em`,
 *     e as caixas dela passam a contar como "sem coleta marcada";
 *   - vazio não é "sem coleta": "sem coleta" é uma marcação (R-HCO-04);
 *   - campo `corte` AUSENTE preserva o que está gravado; a janela mudada sem
 *     corte novo deixa o corte "a conferir" (R-HCO-07). Vazio de propósito apaga;
 *   - dia que já passou não se edita (R-HCO-08).
 *
 * Fase 3 (§12 da spec, 05/11/2026):
 *   - a semana nasce copiada da anterior como RASCUNHO, só nos dias vazios, no
 *     primeiro pedido de segunda a sábado (`garantirSemana`, sem cron); o
 *     "sem coleta" (o feriado) é da data e não se copia (R-HCO-12);
 *   - o rascunho NÃO vale: a faixa, a agência e a saída do upload o ignoram
 *     (R-HCO-13). Lançar o dia, conferir o dia ou confirmar a semana o tira;
 *   - o primeiro upload do dia confere ("certo" ou "mudou", `conferir`); a
 *     saída do upload só vale com o dia conferido (R-HCO-14). O "mudou" de
 *     quem não corrige não trava nada: o PDF sobe sem saída, e quem corrige
 *     recebe a tarefa até lançar o dia (R-HCO-15);
 *   - "sem coleta" ganha motivo: feriado (com o nome) ou outro (R-HCO-16).
 *
 * O relógio é o `relogio.js` (em produção, só o relógio do servidor).
 */
const R = require('./relogio');

const HM = /^([01]\d|2[0-3]):[0-5]\d$/;
const DATA = /^\d{4}-\d{2}-\d{2}$/;
const MAX_COLETAS = 3;

function garantirSchema(db){
  db.exec(`CREATE TABLE IF NOT EXISTS saida_horario (
      id INTEGER PRIMARY KEY AUTOINCREMENT, data TEXT NOT NULL, tipo TEXT NOT NULL,
      ordem INTEGER NOT NULL, inicio TEXT, fim TEXT NOT NULL, corte TEXT,
      corte_conferir INTEGER DEFAULT 0, removido_em TEXT, origem TEXT,
      usuario_id INTEGER, usuario_nome TEXT,
      criado_em TEXT DEFAULT (datetime('now','localtime')), atualizado_em TEXT,
      rascunho INTEGER DEFAULT 0);
    CREATE INDEX IF NOT EXISTS ix_saida_horario_data ON saida_horario(data);
    CREATE TABLE IF NOT EXISTS saida_dia (
      data TEXT PRIMARY KEY, sem_coleta INTEGER DEFAULT 0,
      usuario_id INTEGER, usuario_nome TEXT, em TEXT,
      motivo TEXT, motivo_texto TEXT,
      conferido_em TEXT, conferido_por_id INTEGER, conferido_por TEXT,
      mudou_em TEXT, mudou_por_id INTEGER, mudou_por TEXT);
    CREATE TABLE IF NOT EXISTS saida_horario_evento (
      id INTEGER PRIMARY KEY AUTOINCREMENT, data TEXT NOT NULL, antes TEXT, depois TEXT,
      origem TEXT, usuario_id INTEGER, usuario_nome TEXT,
      em TEXT DEFAULT (datetime('now','localtime')), acao TEXT);
    CREATE TABLE IF NOT EXISTS saida_semana (
      segunda TEXT PRIMARY KEY, copiada_em TEXT,
      confirmada_em TEXT, confirmada_por_id INTEGER, confirmada_por TEXT);`);
  /* o ALTER guardado do banco que já tinha as tabelas da fase 1 (§17) */
  const cols = t => db.prepare(`SELECT name FROM pragma_table_info('${t}')`).all().map(c => c.name);
  const add = (t, c, tipo) => { if(!cols(t).includes(c)) db.exec(`ALTER TABLE ${t} ADD COLUMN ${c} ${tipo}`); };
  add('saida_horario', 'rascunho', 'INTEGER DEFAULT 0');
  ['motivo TEXT', 'motivo_texto TEXT', 'conferido_em TEXT', 'conferido_por_id INTEGER', 'conferido_por TEXT',
   'mudou_em TEXT', 'mudou_por_id INTEGER', 'mudou_por TEXT'].forEach(x => { const [c, t] = x.split(' '); add('saida_dia', c, t); });
  add('saida_horario_evento', 'acao', 'TEXT');
}
const MOTIVOS = ['feriado', 'outro'];

function erro(msg){ const e = new Error(msg); e.status = 400; return e; }
const min = hm => { const [h, m] = String(hm).split(':').map(Number); return h * 60 + m; };

/* O dia como a tela o lê. `lancado` diz se alguém lançou alguma coisa. */
function dia(db, data){
  const rows = db.prepare(`SELECT id,tipo,ordem,inicio,fim,corte,corte_conferir,rascunho FROM saida_horario
    WHERE data=? AND removido_em IS NULL ORDER BY tipo, ordem`).all(data);
  rows.forEach(r => { r.rascunho = r.rascunho ? 1 : 0; });
  const d = db.prepare('SELECT * FROM saida_dia WHERE data=?').get(data) || {};
  const coletas = rows.filter(r => r.tipo === 'coleta');
  const agencia = rows.find(r => r.tipo === 'agencia') || null;
  const sem = !!d.sem_coleta;
  const lancado = coletas.length > 0 || sem || !!agencia;
  const conferido = d.conferido_em ? { em:d.conferido_em, por_id:d.conferido_por_id, por:d.conferido_por } : null;
  const mudou = d.mudou_em ? { em:d.mudou_em, por_id:d.mudou_por_id, por:d.mudou_por } : null;
  return { data, coletas, agencia, sem_coleta: sem,
    motivo: sem ? (d.motivo || null) : null, motivo_texto: sem ? (d.motivo_texto || null) : null,
    lancado, passado: data < R.hoje(),
    rascunho: rows.some(r => r.rascunho === 1),
    conferido, mudou,
    precisa_conferir: lancado && !conferido && !mudou };
}

/* Para a história: só o que se lê, sem id interno de linha removida. */
const retrato = x => ({ sem_coleta: x.sem_coleta, motivo: x.motivo || null, motivo_texto: x.motivo_texto || null,
  coletas: x.coletas.map(c => ({ ordem:c.ordem, inicio:c.inicio, fim:c.fim, corte:c.corte })),
  agencia: x.agencia ? { fim: x.agencia.fim } : null });

/* Lança (ou corrige) o dia. `corpo`:
     coletas    [{id?, inicio, fim, corte?}]  — ausente: as coletas não mudam
     agencia    {fim} | null                  — ausente: não muda; null tira
     sem_coleta true|false                    — ausente: não muda
     motivo     'feriado'|'outro'|null e motivo_texto — só com "sem coleta" (R-HCO-16)
   Lançar o dia tira o rascunho dele; lançar o dia de HOJE conta como a
   conferência do dia e fecha o "mudou" (R-HCO-14, R-HCO-15).
   `pessoa` = {id, nome}; `origem` = 'tela' | 'upload'. */
function lancar(db, data, corpo, pessoa, origem){
  corpo = corpo || {};
  if(!DATA.test(String(data || ''))) throw erro('Data inválida.');
  if(data < R.hoje()) throw erro('Esse dia já passou: o horário dele fica só como registro.');
  origem = origem === 'upload' ? 'upload' : 'tela';
  const tem = k => Object.prototype.hasOwnProperty.call(corpo, k);
  const antes = dia(db, data);

  let coletas = null;
  if(tem('coletas')){
    if(!Array.isArray(corpo.coletas)) throw erro('As coletas vieram num formato que não dá para ler.');
    if(corpo.coletas.length > MAX_COLETAS) throw erro('No máximo ' + MAX_COLETAS + ' coletas por dia.');
    coletas = corpo.coletas.map((c, i) => {
      c = c || {};
      const n = 'Coleta ' + (i + 1);
      if(!HM.test(String(c.inicio || '')) || !HM.test(String(c.fim || ''))) throw erro(n + ': a janela tem que ser HH:MM às HH:MM.');
      if(min(c.inicio) >= min(c.fim)) throw erro(n + ': o fim da janela tem que ser depois do início.');
      const temCorte = Object.prototype.hasOwnProperty.call(c, 'corte');
      const corte = temCorte ? (c.corte == null || c.corte === '' ? null : String(c.corte)) : undefined;
      if(corte != null && !HM.test(corte)) throw erro(n + ': o corte tem que ser HH:MM.');
      if(corte != null && min(corte) > min(c.inicio)) throw erro(n + ': o corte ("vendido até") não pode ser depois do início da janela.');
      const id = c.id == null || c.id === '' ? null : +c.id;
      if(id != null && !antes.coletas.some(x => x.id === id)) throw erro(n + ': essa coleta não é deste dia.');
      return { id, inicio:String(c.inicio), fim:String(c.fim), corte };
    }).sort((a, b) => min(a.inicio) - min(b.inicio));
    for(let i = 1; i < coletas.length; i++)
      if(coletas[i].inicio === coletas[i - 1].inicio) throw erro('Duas coletas começando no mesmo horário.');
  }
  let agencia;
  if(tem('agencia')){
    if(corpo.agencia == null) agencia = null;
    else {
      const f = String((corpo.agencia || {}).fim || '');
      if(!HM.test(f)) throw erro('Agência: o horário tem que ser HH:MM.');
      agencia = { fim:f };
    }
  }
  let sem;
  if(tem('sem_coleta')) sem = !!corpo.sem_coleta;
  const coletasFinal = coletas || antes.coletas;
  const semFinal = sem === undefined ? antes.sem_coleta : sem;
  if(semFinal && coletasFinal.length)
    throw erro('"Hoje não tem coleta" junto com uma coleta lançada: escolha um dos dois.');
  /* o motivo: ausente preserva; sem "sem coleta" ele não existe */
  let motivo = antes.motivo, motivoTexto = antes.motivo_texto;
  if(tem('motivo')){
    motivo = corpo.motivo == null || corpo.motivo === '' ? null : String(corpo.motivo);
    motivoTexto = String(corpo.motivo_texto == null ? '' : corpo.motivo_texto).trim().slice(0, 60) || null;
    if(motivo != null && !MOTIVOS.includes(motivo)) throw erro('Motivo: escolha Feriado ou Outro.');
    if(motivo != null && !semFinal) throw erro('O motivo é do dia sem coleta: marque "não tem coleta" junto.');
    if(motivo != null && !motivoTexto) throw erro(motivo === 'feriado' ? 'Diga o nome do feriado.' : 'Diga o motivo de não ter coleta.');
    if(motivo == null) motivoTexto = null;
  }
  if(!semFinal){ motivo = null; motivoTexto = null; }

  const pid = pessoa ? pessoa.id : null, pnome = pessoa ? pessoa.nome : null;
  db.transaction(() => {
    if(coletas){
      const ficam = new Set(coletas.filter(c => c.id != null).map(c => c.id));
      const rem = db.prepare("UPDATE saida_horario SET removido_em=datetime('now','localtime'), atualizado_em=datetime('now','localtime'), usuario_id=?, usuario_nome=?, origem=? WHERE id=?");
      antes.coletas.forEach(c => { if(!ficam.has(c.id)) rem.run(pid, pnome, origem, c.id); });
      coletas.forEach((c, i) => {
        const ordem = i + 1;
        if(c.id != null){
          const v = antes.coletas.find(x => x.id === c.id);
          const janelaMudou = v.inicio !== c.inicio || v.fim !== c.fim;
          let corte = v.corte, conferir = v.corte_conferir;
          if(c.corte !== undefined){ corte = c.corte; conferir = 0; }
          else if(janelaMudou && v.corte != null) conferir = 1;
          if(corte != null && min(corte) > min(c.inicio)) conferir = 1;
          if(v.ordem !== ordem || janelaMudou || corte !== v.corte || conferir !== v.corte_conferir)
            db.prepare(`UPDATE saida_horario SET ordem=?, inicio=?, fim=?, corte=?, corte_conferir=?, origem=?,
              usuario_id=?, usuario_nome=?, atualizado_em=datetime('now','localtime') WHERE id=?`)
              .run(ordem, c.inicio, c.fim, corte, conferir, origem, pid, pnome, c.id);
        } else {
          db.prepare(`INSERT INTO saida_horario (data,tipo,ordem,inicio,fim,corte,corte_conferir,origem,usuario_id,usuario_nome,atualizado_em)
            VALUES (?,'coleta',?,?,?,?,0,?,?,?,datetime('now','localtime'))`)
            .run(data, ordem, c.inicio, c.fim, c.corte === undefined ? null : c.corte, origem, pid, pnome);
        }
      });
    }
    if(agencia !== undefined){
      const v = antes.agencia;
      if(agencia === null){
        if(v) db.prepare("UPDATE saida_horario SET removido_em=datetime('now','localtime'), atualizado_em=datetime('now','localtime'), usuario_id=?, usuario_nome=?, origem=? WHERE id=?").run(pid, pnome, origem, v.id);
      } else if(v){
        if(v.fim !== agencia.fim) db.prepare("UPDATE saida_horario SET fim=?, origem=?, usuario_id=?, usuario_nome=?, atualizado_em=datetime('now','localtime') WHERE id=?").run(agencia.fim, origem, pid, pnome, v.id);
      } else {
        db.prepare(`INSERT INTO saida_horario (data,tipo,ordem,inicio,fim,origem,usuario_id,usuario_nome,atualizado_em)
          VALUES (?,'agencia',1,NULL,?,?,?,?,datetime('now','localtime'))`).run(data, agencia.fim, origem, pid, pnome);
      }
    }
    if((sem !== undefined && sem !== antes.sem_coleta) || motivo !== antes.motivo || motivoTexto !== antes.motivo_texto)
      db.prepare(`INSERT INTO saida_dia (data,sem_coleta,motivo,motivo_texto,usuario_id,usuario_nome,em) VALUES (?,?,?,?,?,?,datetime('now','localtime'))
        ON CONFLICT(data) DO UPDATE SET sem_coleta=excluded.sem_coleta, motivo=excluded.motivo, motivo_texto=excluded.motivo_texto,
          usuario_id=excluded.usuario_id, usuario_nome=excluded.usuario_nome, em=excluded.em`)
        .run(data, semFinal ? 1 : 0, motivo, motivoTexto, pid, pnome);
    /* quem lança olhou: o rascunho do dia acaba (R-HCO-13) */
    db.prepare('UPDATE saida_horario SET rascunho=0 WHERE data=? AND rascunho=1').run(data);
    /* o dia de HOJE lançado conta como conferido, e fecha o "mudou" (R-HCO-14/15) */
    if(data === R.hoje()){
      db.prepare("INSERT INTO saida_dia (data) VALUES (?) ON CONFLICT(data) DO NOTHING").run(data);
      db.prepare(`UPDATE saida_dia SET conferido_em=COALESCE(conferido_em, datetime('now','localtime')),
          conferido_por_id=CASE WHEN conferido_em IS NULL THEN ? ELSE conferido_por_id END,
          conferido_por=CASE WHEN conferido_em IS NULL THEN ? ELSE conferido_por END,
          mudou_em=NULL, mudou_por_id=NULL, mudou_por=NULL WHERE data=?`).run(pid, pnome, data);
    }
    const depois = dia(db, data);
    const a = JSON.stringify(retrato(antes)), b = JSON.stringify(retrato(depois));
    const marcas = x => JSON.stringify(x.coletas.map(c => c.corte_conferir));
    if(a !== b || marcas(antes) !== marcas(depois))
      db.prepare('INSERT INTO saida_horario_evento (data,antes,depois,origem,usuario_id,usuario_nome) VALUES (?,?,?,?,?,?)')
        .run(data, a, b, origem, pid, pnome);
  })();
  return dia(db, data);
}

/* A segunda da semana (de segunda a sábado) que contém `data`; o domingo é da
   semana que começa no dia seguinte. */
function segundaDe(data){
  const ds = R.diaSemana(data);
  return R.somarDias(data, ds === 0 ? 1 : 1 - ds);
}
function semana(db, data){
  if(!DATA.test(String(data || ''))) data = R.hoje();
  const seg = segundaDe(data);
  return [0, 1, 2, 3, 4, 5].map(i => dia(db, R.somarDias(seg, i)));
}
function infoSemana(db, data){
  const seg = segundaDe(DATA.test(String(data || '')) ? data : R.hoje());
  const s = db.prepare('SELECT * FROM saida_semana WHERE segunda=?').get(seg) || {};
  return { segunda:seg, copiada_em:s.copiada_em || null, confirmada_em:s.confirmada_em || null,
    confirmada_por_id:s.confirmada_por_id || null, confirmada_por:s.confirmada_por || null };
}

/* ── A SEMANA COMO TAREFA (fase 3) ─────────────────────────────────────
   No primeiro pedido de segunda a sábado, cada dia de hoje em diante SEM
   NADA LANÇADO recebe, como rascunho, as coletas e a agência do mesmo dia da
   semana anterior. O "sem coleta" (o feriado) não se copia: o dia nasce
   vazio. Roda uma vez por semana (`saida_semana.copiada_em`). */
function garantirSemana(db){
  const hoje = R.hoje();
  if(R.diaSemana(hoje) === 0) return;
  const seg = segundaDe(hoje);
  const ja = db.prepare('SELECT copiada_em FROM saida_semana WHERE segunda=?').get(seg);
  if(ja && ja.copiada_em) return;
  db.transaction(() => {
    db.prepare("INSERT INTO saida_semana (segunda) VALUES (?) ON CONFLICT(segunda) DO NOTHING").run(seg);
    const marcou = db.prepare("UPDATE saida_semana SET copiada_em=datetime('now','localtime') WHERE segunda=? AND copiada_em IS NULL").run(seg);
    if(!marcou.changes) return;                       // outro pedido copiou junto
    for(let i = 0; i < 6; i++){
      const data = R.somarDias(seg, i);
      if(data < hoje) continue;
      const alvo = dia(db, data);
      if(alvo.lancado) continue;
      const fonte = dia(db, R.somarDias(data, -7));
      if(fonte.sem_coleta || (!fonte.coletas.length && !fonte.agencia)) continue;
      const ins = db.prepare(`INSERT INTO saida_horario (data,tipo,ordem,inicio,fim,corte,corte_conferir,origem,rascunho,atualizado_em)
        VALUES (?,?,?,?,?,?,?,'copia',1,datetime('now','localtime'))`);
      fonte.coletas.forEach(c => ins.run(data, 'coleta', c.ordem, c.inicio, c.fim, c.corte, c.corte_conferir));
      if(fonte.agencia) ins.run(data, 'agencia', 1, null, fonte.agencia.fim, null, 0);
      db.prepare("INSERT INTO saida_horario_evento (data,antes,depois,origem,acao) VALUES (?,?,?,'copia','copia')")
        .run(data, JSON.stringify(retrato(alvo)), JSON.stringify(retrato(dia(db, data))));
    }
  })();
}

/* "Confirmar semana" (`coleta.horario`): tira o rascunho da semana inteira. */
function confirmarSemana(db, data, pessoa){
  const seg = segundaDe(DATA.test(String(data || '')) ? data : R.hoje());
  if(R.somarDias(seg, 5) < R.hoje()) throw erro('Essa semana já passou.');
  const pid = pessoa ? pessoa.id : null, pnome = pessoa ? pessoa.nome : null;
  db.transaction(() => {
    const fim = R.somarDias(seg, 5);
    const dias = db.prepare('SELECT DISTINCT data FROM saida_horario WHERE data BETWEEN ? AND ? AND rascunho=1 AND removido_em IS NULL').all(seg, fim).map(r => r.data);
    db.prepare('UPDATE saida_horario SET rascunho=0 WHERE data BETWEEN ? AND ? AND rascunho=1').run(seg, fim);
    db.prepare("INSERT INTO saida_semana (segunda) VALUES (?) ON CONFLICT(segunda) DO NOTHING").run(seg);
    db.prepare("UPDATE saida_semana SET confirmada_em=datetime('now','localtime'), confirmada_por_id=?, confirmada_por=? WHERE segunda=?").run(pid, pnome, seg);
    const ev = db.prepare("INSERT INTO saida_horario_evento (data,antes,depois,origem,usuario_id,usuario_nome,acao) VALUES (?,NULL,NULL,'tela',?,?,'confirmou_semana')");
    dias.forEach(d => ev.run(d, pid, pnome));
  })();
  return infoSemana(db, seg);
}

/* A conferência do primeiro upload do dia (R-HCO-14/15). `resposta`:
   'certo' — o horário de hoje bate com o ML: confere o dia e tira o rascunho;
   'mudou' — quem não corrige avisa: nada trava, e quem corrige recebe a tarefa.
   O dia já conferido (ou avisado) não muda: vale a primeira resposta. */
function conferir(db, resposta, pessoa){
  if(resposta !== 'certo' && resposta !== 'mudou') throw erro('Responda "Está certo" ou "Mudou".');
  const hoje = R.hoje();
  const d = dia(db, hoje);
  if(!d.lancado) throw erro('O horário de hoje ainda não foi lançado: não há o que conferir. O PDF sobe sem saída.');
  if(!d.precisa_conferir) return d;
  const pid = pessoa ? pessoa.id : null, pnome = pessoa ? pessoa.nome : null;
  db.transaction(() => {
    db.prepare("INSERT INTO saida_dia (data) VALUES (?) ON CONFLICT(data) DO NOTHING").run(hoje);
    if(resposta === 'certo'){
      db.prepare("UPDATE saida_dia SET conferido_em=datetime('now','localtime'), conferido_por_id=?, conferido_por=? WHERE data=?").run(pid, pnome, hoje);
      db.prepare('UPDATE saida_horario SET rascunho=0 WHERE data=? AND rascunho=1').run(hoje);
    } else {
      db.prepare("UPDATE saida_dia SET mudou_em=datetime('now','localtime'), mudou_por_id=?, mudou_por=? WHERE data=?").run(pid, pnome, hoje);
    }
    db.prepare("INSERT INTO saida_horario_evento (data,antes,depois,origem,usuario_id,usuario_nome,acao) VALUES (?,NULL,NULL,'upload',?,?,?)")
      .run(hoje, pid, pnome, resposta === 'certo' ? 'conferiu' : 'mudou');
  })();
  return dia(db, hoje);
}

/* As tarefas dos horários, para quem CORRIGE horário (a rota filtra):
   'semana' — a semana de hoje não foi confirmada (atrasada depois das 12:00
              de segunda); 'mudou' — alguém avisou que o de hoje mudou;
   'hoje'   — nada lançado para hoje (nem "sem coleta"). */
function tarefas(db){
  const hoje = R.hoje(), ds = R.diaSemana(hoje);
  if(ds === 0) return [];
  const out = [];
  const d = dia(db, hoje);
  if(d.mudou) out.push({ tipo:'mudou', atrasada:true,
    texto:'Horário de hoje mudou no ML — avisado por ' + (d.mudou.por || '?') + ' às ' + String(d.mudou.em).slice(11, 16) + ': corrija' });
  else if(!d.lancado) out.push({ tipo:'hoje', atrasada:true, texto:'Horário da coleta de hoje não lançado: lance' });
  const s = infoSemana(db, hoje);
  if(!s.confirmada_em) out.push({ tipo:'semana', atrasada: ds > 1 || min(R.hora()) >= 12 * 60,
    texto:'Tarefa semanal: confira e confirme os horários de coleta desta semana' });
  return out;
}

function historia(db, data){
  return db.prepare('SELECT id,data,antes,depois,origem,usuario_id,usuario_nome,em,acao FROM saida_horario_evento WHERE data=? ORDER BY id')
    .all(data).map(e => Object.assign(e, { antes: JSON.parse(e.antes || 'null'), depois: JSON.parse(e.depois || 'null') }));
}

/* ── O UPLOAD ────────────────────────────────────────────────────────────
   A saída escolhida tem de existir, estar de pé e ser de HOJE. */
function saidaDeHoje(db, id){
  const s = db.prepare('SELECT * FROM saida_horario WHERE id=?').get(+id);
  if(!s || s.removido_em) throw erro('Essa saída não está lançada. Confira os horários de hoje e escolha de novo.');
  if(s.data !== R.hoje()) throw erro('Essa saída não é de hoje. Escolha uma das saídas de hoje.');
  if(s.rascunho) throw erro('O horário de hoje veio copiado da semana passada e ninguém conferiu: responda "Está certo" antes.');
  const d = dia(db, s.data);
  if(d.mudou) throw erro('Avisaram que o horário de hoje mudou no ML: até alguém corrigir, o PDF sobe sem saída.');
  if(!d.conferido) throw erro('Confira o horário de hoje antes ("Está certo" ou "Mudou").');
  return s;
}
/* Por que a venda NÃO ganha a marca: 'outro_dia' (a etiqueta é de outro dia,
   e vai em outro caminhão) ou 'outra_modalidade' (a etiqueta diz agência num
   PDF de coleta, ou o contrário — a modalidade continua a da etiqueta,
   R-MOD-01). null = marca. */
function motivoSemMarca(saida, venda){
  if(venda.despacharEm && venda.despacharEm > saida.data) return 'outro_dia';
  if(venda.modalidade !== saida.tipo) return 'outra_modalidade';
  return null;
}
function rotulo(s){
  if(!s) return '';
  return s.tipo === 'agencia' ? 'Agência até ' + s.fim : 'Coleta ' + s.inicio + '–' + s.fim;
}

/* ── O RELÓGIO (fase 2) ───────────────────────────────────────────────── */
const ATIVA = "SELECT id FROM saida_horario WHERE removido_em IS NULL";
function contar(db, onde, ...p){
  const q = s => db.prepare('SELECT COUNT(*) n FROM lote WHERE ' + s + ' AND ' + onde).get(...p).n;
  return { por_imprimir: q("estagio IN ('pendente','bloqueado')"),
           por_conferir: q("estagio='embalado' AND conferido_em IS NULL") };
}
function status(db){
  garantirSemana(db);
  const hoje = R.hoje(), agora = min(R.hora());
  const d = dia(db, hoje);
  /* o rascunho não vale (R-HCO-13): para o relógio, o dia é "não lançado" */
  const valeColetas = d.rascunho ? [] : d.coletas;
  const coletas = valeColetas.map(c => {
    const ini = min(c.inicio), fim = min(c.fim);
    const estado = agora < ini ? 'antes' : agora < fim ? 'janela' : 'passou';
    return Object.assign({ id:c.id, ordem:c.ordem, inicio:c.inicio, fim:c.fim, corte:c.corte,
      corte_conferir:!!c.corte_conferir, estado, minutos: ini - agora }, contar(db, 'horario_id=?', c.id));
  });
  const proxima = coletas.find(c => c.estado !== 'passou') || null;
  const sem_marca = contar(db, `COALESCE(modalidade,'agencia')='coleta'
      AND (despachar_em IS NULL OR despachar_em<=?) AND (horario_id IS NULL OR horario_id NOT IN (${ATIVA}))`, hoje);
  return { data:hoje, agora:R.hora(), lancado:d.lancado && !d.rascunho, rascunho:d.rascunho,
    mudou:d.mudou, motivo:d.motivo, motivo_texto:d.motivo_texto, sem_coleta:d.sem_coleta, coletas, proxima,
    encerradas: coletas.length > 0 && !proxima, sem_marca,
    agencia: d.agencia && !d.rascunho ? { id:d.agencia.id, fim:d.agencia.fim, minutos: min(d.agencia.fim) - agora } : null };
}

/* O horário da agência lançado para hoje, ou null (aí vale o config). */
function agenciaDeHoje(db){
  try{ const d = dia(db, R.hoje()); return d.agencia && !d.rascunho ? d.agencia.fim : null; }catch(e){ return null; }
}

/* A PRÓXIMA COLETA DEPOIS DE UMA HORA (09/11/2026, decisão do dono, opção (a)).
   O relatório do ML diz "entregue o pacote na próxima coleta", sem dia; o
   planejamento pergunta aqui qual é. Só vale o horário LANÇADO (o rascunho da
   semana copiada não vale, R-HCO-13), e o dia "sem coleta" é pulado.
   - no dia do relatório, a coleta que começa depois da hora dele → esse dia;
   - senão, o próximo dia com coleta lançada → esse dia;
   - o próximo dia sem nada lançado → esse dia, "a confirmar" (o domingo, que
     a 206 não tem, é pulado);
   - o dia do relatório sem nada lançado → null: quem pergunta decide (o
     planejamento põe no dia do relatório, a confirmar). */
function proximaColeta(db, data, hora){
  if(!DATA.test(String(data || ''))) return null;
  let coletas, semColeta;
  try{
    const q1 = db.prepare(`SELECT inicio, fim FROM saida_horario WHERE data=? AND tipo='coleta'
      AND removido_em IS NULL AND COALESCE(rascunho,0)=0 ORDER BY inicio`);
    const q2 = db.prepare('SELECT sem_coleta FROM saida_dia WHERE data=?');
    coletas = d => q1.all(d);
    semColeta = d => { const r = q2.get(d); return !!(r && r.sem_coleta); };
  }catch(e){ return null; }
  const mais = (d, n) => { const [a, m, x] = d.split('-').map(Number); const t = new Date(a, m - 1, x + n);
    return t.getFullYear() + '-' + String(t.getMonth() + 1).padStart(2, '0') + '-' + String(t.getDate()).padStart(2, '0'); };
  const domingo = d => { const [a, m, x] = d.split('-').map(Number); return new Date(a, m - 1, x).getDay() === 0; };
  const deHoje = coletas(data);
  if(!deHoje.length && !semColeta(data)) return null;
  const h = HM.test(String(hora || '')) ? min(hora) : -1;
  if(!semColeta(data) && deHoje.some(c => min(c.inicio || c.fim) > h)) return { data, confirmar:0 };
  for(let i = 1; i <= 14; i++){
    const d = mais(data, i);
    if(semColeta(d)) continue;
    if(coletas(d).length) return { data:d, confirmar:0 };
    if(domingo(d)) continue;
    return { data:d, confirmar:1 };
  }
  return { data: mais(data, 1), confirmar:1 };
}

module.exports = { garantirSchema, dia, lancar, semana, infoSemana, historia, saidaDeHoje, motivoSemMarca, rotulo,
  status, agenciaDeHoje, garantirSemana, confirmarSemana, conferir, tarefas, proximaColeta, MAX_COLETAS };

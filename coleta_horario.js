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
      criado_em TEXT DEFAULT (datetime('now','localtime')), atualizado_em TEXT);
    CREATE INDEX IF NOT EXISTS ix_saida_horario_data ON saida_horario(data);
    CREATE TABLE IF NOT EXISTS saida_dia (
      data TEXT PRIMARY KEY, sem_coleta INTEGER DEFAULT 0,
      usuario_id INTEGER, usuario_nome TEXT, em TEXT);
    CREATE TABLE IF NOT EXISTS saida_horario_evento (
      id INTEGER PRIMARY KEY AUTOINCREMENT, data TEXT NOT NULL, antes TEXT, depois TEXT,
      origem TEXT, usuario_id INTEGER, usuario_nome TEXT,
      em TEXT DEFAULT (datetime('now','localtime')));`);
}

function erro(msg){ const e = new Error(msg); e.status = 400; return e; }
const min = hm => { const [h, m] = String(hm).split(':').map(Number); return h * 60 + m; };

/* O dia como a tela o lê. `lancado` diz se alguém lançou alguma coisa. */
function dia(db, data){
  const rows = db.prepare(`SELECT id,tipo,ordem,inicio,fim,corte,corte_conferir FROM saida_horario
    WHERE data=? AND removido_em IS NULL ORDER BY tipo, ordem`).all(data);
  const d = db.prepare('SELECT sem_coleta FROM saida_dia WHERE data=?').get(data);
  const coletas = rows.filter(r => r.tipo === 'coleta');
  const agencia = rows.find(r => r.tipo === 'agencia') || null;
  const sem = !!(d && d.sem_coleta);
  return { data, coletas, agencia, sem_coleta: sem,
    lancado: coletas.length > 0 || sem || !!agencia, passado: data < R.hoje() };
}

/* Para a história: só o que se lê, sem id interno de linha removida. */
const retrato = x => ({ sem_coleta: x.sem_coleta,
  coletas: x.coletas.map(c => ({ ordem:c.ordem, inicio:c.inicio, fim:c.fim, corte:c.corte })),
  agencia: x.agencia ? { fim: x.agencia.fim } : null });

/* Lança (ou corrige) o dia. `corpo`:
     coletas    [{id?, inicio, fim, corte?}]  — ausente: as coletas não mudam
     agencia    {fim} | null                  — ausente: não muda; null tira
     sem_coleta true|false                    — ausente: não muda
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
  if((sem === undefined ? antes.sem_coleta : sem) && coletasFinal.length)
    throw erro('"Hoje não tem coleta" junto com uma coleta lançada: escolha um dos dois.');

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
    if(sem !== undefined && sem !== antes.sem_coleta)
      db.prepare(`INSERT INTO saida_dia (data,sem_coleta,usuario_id,usuario_nome,em) VALUES (?,?,?,?,datetime('now','localtime'))
        ON CONFLICT(data) DO UPDATE SET sem_coleta=excluded.sem_coleta, usuario_id=excluded.usuario_id,
          usuario_nome=excluded.usuario_nome, em=excluded.em`).run(data, sem ? 1 : 0, pid, pnome);
    const depois = dia(db, data);
    const a = JSON.stringify(retrato(antes)), b = JSON.stringify(retrato(depois));
    const marcas = x => JSON.stringify(x.coletas.map(c => c.corte_conferir));
    if(a !== b || marcas(antes) !== marcas(depois))
      db.prepare('INSERT INTO saida_horario_evento (data,antes,depois,origem,usuario_id,usuario_nome) VALUES (?,?,?,?,?,?)')
        .run(data, a, b, origem, pid, pnome);
  })();
  return dia(db, data);
}

/* A semana de segunda a sábado que contém `data`. */
function semana(db, data){
  if(!DATA.test(String(data || ''))) data = R.hoje();
  const ds = R.diaSemana(data);
  const seg = R.somarDias(data, ds === 0 ? 1 : 1 - ds);
  return [0, 1, 2, 3, 4, 5].map(i => dia(db, R.somarDias(seg, i)));
}

function historia(db, data){
  return db.prepare('SELECT id,data,antes,depois,origem,usuario_id,usuario_nome,em FROM saida_horario_evento WHERE data=? ORDER BY id')
    .all(data).map(e => Object.assign(e, { antes: JSON.parse(e.antes || 'null'), depois: JSON.parse(e.depois || 'null') }));
}

/* ── O UPLOAD ────────────────────────────────────────────────────────────
   A saída escolhida tem de existir, estar de pé e ser de HOJE. */
function saidaDeHoje(db, id){
  const s = db.prepare('SELECT * FROM saida_horario WHERE id=?').get(+id);
  if(!s || s.removido_em) throw erro('Essa saída não está lançada. Confira os horários de hoje e escolha de novo.');
  if(s.data !== R.hoje()) throw erro('Essa saída não é de hoje. Escolha uma das saídas de hoje.');
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
  const hoje = R.hoje(), agora = min(R.hora());
  const d = dia(db, hoje);
  const coletas = d.coletas.map(c => {
    const ini = min(c.inicio), fim = min(c.fim);
    const estado = agora < ini ? 'antes' : agora < fim ? 'janela' : 'passou';
    return Object.assign({ id:c.id, ordem:c.ordem, inicio:c.inicio, fim:c.fim, corte:c.corte,
      corte_conferir:!!c.corte_conferir, estado, minutos: ini - agora }, contar(db, 'horario_id=?', c.id));
  });
  const proxima = coletas.find(c => c.estado !== 'passou') || null;
  const sem_marca = contar(db, `COALESCE(modalidade,'agencia')='coleta'
      AND (despachar_em IS NULL OR despachar_em<=?) AND (horario_id IS NULL OR horario_id NOT IN (${ATIVA}))`, hoje);
  return { data:hoje, agora:R.hora(), lancado:d.lancado, sem_coleta:d.sem_coleta, coletas, proxima,
    encerradas: coletas.length > 0 && !proxima, sem_marca,
    agencia: d.agencia ? { id:d.agencia.id, fim:d.agencia.fim, minutos: min(d.agencia.fim) - agora } : null };
}

/* O horário da agência lançado para hoje, ou null (aí vale o config). */
function agenciaDeHoje(db){
  try{ const a = dia(db, R.hoje()).agencia; return a ? a.fim : null; }catch(e){ return null; }
}

module.exports = { garantirSchema, dia, lancar, semana, historia, saidaDeHoje, motivoSemMarca, rotulo,
  status, agenciaDeHoje, MAX_COLETAS };

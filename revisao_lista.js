/* revisao_lista.js — o DONO ÚNICO da lista da 101 Revisão em tela única
 * (spec REVISAO-TELA-UNICA, 23/11/2026). Ele NÃO tem conta própria de
 * quantidade (#12): junta o que os donos de sempre devolvem.
 *
 *   HOJE              ordem_dia.js (a_produzir) — as vendas de hoje que estão
 *                     na Etiqueta de Venda sem peça; a mesma régua do aviso de
 *                     status e da TV.
 *   PRÓXIMOS DIAS     demanda_dominio.porDia — a falta ACUMULADA por dia de
 *                     envio; aqui só o que ela cresce depois de hoje, dia a
 *                     dia, até sexta (na sexta e no sábado, só a segunda).
 *   COMPLETAR O ALVO  demanda_dominio.calcular — o `precisa` menos a falta das
 *                     vendas até o fim da janela (e a venda depois da janela
 *                     entra aqui: o `precisa` já a conta).
 *
 * A peça revisada e ainda não embalada (fila 'aguardando', modo 'estoque')
 * ainda não subiu o livre: sem descontá-la, o número dos próximos dias só
 * cairia na embalagem e a bancada revisaria a mesma falta duas vezes. Ela sai
 * primeiro dos próximos dias e depois do alvo. A de modo 'hoje' já sai da
 * conta de Hoje pelo ordem_dia.
 *
 * ⚠️ A VENDA DE HOJE DA PLANILHA QUE AINDA NÃO ESTÁ NA 201 NÃO APARECE EM HOJE:
 * Hoje é a 201 (o dono, 23/11/2026). Ela aparece quando o PDF sobe.
 */
const ORDEM_DIA = require('./ordem_dia');
const DEMANDA = require('./demanda_dominio');

const DSEM = ['dom','seg','ter','qua','qui','sex','sab'];

function addDias(iso, n){
  const m = String(iso).match(/^(\d{4})-(\d{2})-(\d{2})/);
  const d = new Date(+m[1], +m[2]-1, +m[3]); d.setDate(d.getDate() + n);
  return d.getFullYear()+'-'+String(d.getMonth()+1).padStart(2,'0')+'-'+String(d.getDate()).padStart(2,'0');
}
function diaSemana(iso){ const m = String(iso).match(/^(\d{4})-(\d{2})-(\d{2})/); return new Date(+m[1], +m[2]-1, +m[3]).getDay(); }
function rotulo(iso){ const m = String(iso).match(/^(\d{4})-(\d{2})-(\d{2})/); return DSEM[diaSemana(iso)] + ' ' + m[3] + '/' + m[2]; }

/* A janela dos próximos dias (decisão do dono, 23/11/2026): de amanhã até
   sexta — a coleta é de segunda a sexta. Na sexta e no sábado, só a segunda.
   No domingo, de segunda a sexta. Só dias de semana. */
function janela(hoje){
  const ds = diaSemana(hoje);
  if(ds === 5) return [addDias(hoje, 3)];
  if(ds === 6) return [addDias(hoje, 2)];
  const dias = [];
  for(let i = 1; i <= 6; i++){
    const d = addDias(hoje, i), w = diaSemana(d);
    if(w === 0 || w === 6) continue;
    dias.push(d);
    if(w === 5) break;
  }
  return dias;
}

function contar(db, sql, args){
  const m = {};
  try{ db.prepare(sql).all(...(args||[])).forEach(r => { m[String(r.c).toUpperCase()] = r.n; }); }catch(e){}
  return m;
}

function montar(db){
  const hoje = db.prepare("SELECT date('now','localtime') d").get().d;
  const dias = janela(hoje);
  const amanha = addDias(hoje, 1);

  /* HOJE — o ordem_dia, como está. */
  const hojeMap = {};
  ORDEM_DIA.linhas(db).forEach(o => { hojeMap[String(o.codigo).toUpperCase()] = o; });

  /* A falta acumulada por dia de envio, por SKU (a régua da 401). */
  const pd = DEMANDA.porDia(db, { semResumo:true });
  const faltaAte = {};   // c -> função(dia) -> falta acumulada até o dia
  pd.linhas.forEach(l => {
    const cel = l.celulas;
    faltaAte[String(l.codigo).toUpperCase()] = function(dia){
      let f = 0;
      for(const x of cel){ if(x.dia === 'atrasada' || x.dia <= dia) f = x.falta; }
      return f;
    };
  });

  /* O precisa de cada SKU (a mesma conta da 401). */
  const calc = {};
  DEMANDA.calcular(db).linhas.forEach(l => { if(l.cadastrado) calc[String(l.codigo).toUpperCase()] = l; });

  /* Revisada e ainda na fila da embalagem, para estoque. */
  const naFila = contar(db, `SELECT UPPER(codigo) c, COUNT(*) n FROM fila
    WHERE situacao='aguardando' AND COALESCE(modo,'estoque')='estoque' AND COALESCE(teste,0)=0 GROUP BY UPPER(codigo)`);
  /* Revisada hoje para estoque (o andamento dos próximos dias e do alvo). */
  const revEst = contar(db, `SELECT UPPER(codigo) c, COUNT(*) n FROM revisao
    WHERE data=date('now','localtime') AND COALESCE(modo,'estoque')='estoque' AND COALESCE(teste,0)=0 GROUP BY UPPER(codigo)`);

  const skus = {};
  db.prepare(`SELECT UPPER(s.codigo) c, s.codigo, s.descricao, s.cor, s.cor_codigo, s.largura_cm, s.altura_cm,
      COALESCE(m.sob_medida,0) sob_medida
    FROM skus s LEFT JOIN modelo m ON m.id=s.modelo_id`).all().forEach(s => { skus[s.c] = s; });

  const cods = new Set(Object.keys(hojeMap).concat(Object.keys(faltaAte), Object.keys(calc)));
  const itens = [];
  for(const c of cods){
    const s = skus[c];
    if(!s) continue;
    const o = hojeMap[c];
    const hojeFalta = o ? Math.max(0, o.a_produzir) : 0;
    const hojeFeitas = o ? (o.revisadas || 0) : 0;
    const f = faltaAte[c] || (() => 0);
    const base = f(hoje);
    let resto = naFila[c] || 0;
    /* Dia a dia: o quanto a falta acumulada cresce em cada dia da janela. */
    const porDiaSku = []; let ant = base;
    for(const d of dias){ const v = f(d); porDiaSku.push({ dia:d, n:Math.max(0, v - ant) }); ant = v; }
    /* A peça revisada e ainda não embalada sai primeiro do dia mais cedo. */
    for(const x of porDiaSku){ const t = Math.min(resto, x.n); x.n -= t; resto -= t; }
    const proxTotal = porDiaSku.reduce((a, x) => a + x.n, 0);
    const l = calc[c];
    const faltaJanela = f(dias.length ? dias[dias.length-1] : hoje);
    let alvo = l ? Math.max(0, l.precisa - faltaJanela) : 0;
    if(s.sob_medida) alvo = 0;   // sob medida não tem alvo (R-REV-04)
    const t = Math.min(resto, alvo); alvo -= t; resto -= t;
    if(!hojeFalta && !proxTotal && !alvo && !hojeFeitas) continue;
    const primeiro = porDiaSku.length ? porDiaSku[0] : null;
    itens.push({
      codigo: s.codigo, descricao: s.descricao || '', cor: s.cor_codigo || s.cor || '',
      largura_cm: s.largura_cm, altura_cm: s.altura_cm,
      hoje: hojeFalta, hoje_revisadas: hojeFeitas,
      dias: porDiaSku.map(x => ({ dia:x.dia, rotulo: x.dia === amanha ? 'amanhã' : rotulo(x.dia), n:x.n })),
      primeiro_dia: primeiro ? primeiro.n : 0,
      resto_semana: porDiaSku.slice(1).reduce((a, x) => a + x.n, 0),
      proximos: proxTotal, alvo, revisadas_estoque: revEst[c] || 0,
      parte: hojeFalta > 0 ? 'hoje' : (proxTotal > 0 ? 'proximos' : (alvo > 0 ? 'alvo' : null))
    });
  }
  /* Ordem: em Hoje, quem mais falta; nos próximos dias, a data da primeira
     falta (o dia mais cedo primeiro), e no mesmo dia mais peças primeiro; no
     alvo, mais peças primeiro. */
  const primeiraData = x => { const d = x.dias.find(y => y.n > 0); return d ? d.dia : '9999'; };
  const parte = p => itens.filter(x => x.parte === p);
  const hojeL = parte('hoje').sort((a,b) => b.hoje - a.hoje || a.codigo.localeCompare(b.codigo));
  const proxL = parte('proximos').sort((a,b) => (primeiraData(a) < primeiraData(b) ? -1 : primeiraData(a) > primeiraData(b) ? 1 : 0)
    || b.proximos - a.proximos || a.codigo.localeCompare(b.codigo));
  const alvoL = parte('alvo').sort((a,b) => b.alvo - a.alvo || a.codigo.localeCompare(b.codigo));
  /* "Depois de hoje" mostra também o SKU que está em Hoje e falta nos dias
     seguintes; e o alvo, todo SKU com falta de alvo. */
  const depois = itens.filter(x => x.proximos > 0).sort((a,b) => (primeiraData(a) < primeiraData(b) ? -1 : primeiraData(a) > primeiraData(b) ? 1 : 0)
    || b.proximos - a.proximos || a.codigo.localeCompare(b.codigo));
  const alvoTodos = itens.filter(x => x.alvo > 0).sort((a,b) => b.alvo - a.alvo || a.codigo.localeCompare(b.codigo));
  const soma = (l, k) => l.reduce((a, x) => a + x[k], 0);
  const temOrdem = Object.keys(hojeMap).length > 0;
  return {
    hoje, dias: dias.map(d => ({ dia:d, rotulo: d === amanha ? 'amanhã' : rotulo(d) })),
    ate: dias.length ? rotulo(dias[dias.length-1]) : null,
    hoje_lista: hojeL, proximos_lista: depois, alvo_lista: alvoTodos,
    so_proximos: proxL, so_alvo: alvoL,
    totais: { hoje: soma(hojeL, 'hoje'), hoje_revisadas: soma(itens, 'hoje_revisadas'),
              proximos: soma(depois, 'proximos'), alvo: soma(alvoTodos, 'alvo') },
    hoje_terminado: temOrdem && soma(hojeL, 'hoje') === 0,
    sem_venda_hoje: !temOrdem
  };
}

/* O modo que a revisão grava, decidido no servidor no bipe que fecha
   (R-REV-01 nova): 'hoje' se a peça cobre uma venda de hoje sem peça, e
   'estoque' nos outros casos. É o mesmo a_produzir do ordem_dia: a revisão
   'hoje' abate a ordem do dia na embalagem (R-EMB-03), como sempre. */
function modoPara(db, codigo){
  const c = String(codigo || '').toUpperCase();
  /* A conta que falhar (banco sem a tabela da ordem do dia: um script, um
     teste) não derruba o bipe: a peça vai como estoque, e o log diz. */
  try{
    const o = ORDEM_DIA.linhas(db).find(x => String(x.codigo).toUpperCase() === c);
    return o && o.a_produzir > 0 ? 'hoje' : 'estoque';
  }catch(e){ console.error('[revisao] não consegui decidir o modo de '+c+':', e.message); return 'estoque'; }
}

/* A semana, só para ler: SKU × dia (hoje e a janela), com o alvo. */
function semana(db){
  const l = montar(db);
  const linhas = l.hoje_lista.concat(l.proximos_lista.filter(x => !(x.hoje > 0)))
    .map(x => ({ codigo:x.codigo, cor:x.cor, largura_cm:x.largura_cm, altura_cm:x.altura_cm,
      hoje:x.hoje, dias:x.dias.map(d => d.n), total: x.hoje + x.proximos, alvo:x.alvo }));
  return { hoje:l.hoje, dias:l.dias, linhas };
}

module.exports = { montar, modoPara, semana, janela };

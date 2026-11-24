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
 * A peça revisada e ainda não embalada ainda não subiu o livre: sem
 * descontá-la, o número dos próximos dias só cairia na embalagem e a bancada
 * revisaria a mesma falta duas vezes. A de modo 'hoje' revisada hoje já sai de
 * Hoje (o ordem_dia); todas as outras saem primeiro dos próximos dias e depois
 * do alvo.
 *
 * A MESMA VENDA NÃO CONTA DUAS VEZES, E A VENDA QUE A PLANILHA NÃO TRAZ NÃO
 * APAGA A DE OUTRO CLIENTE (③ REVISÃO, 23/11/2026): a venda do PDF de hoje é
 * ligada à planilha pela venda ou pelo pack (a régua do demanda_dominio). A
 * ligada sai do dia dela na planilha; e todo o PDF de hoje entra como o
 * primeiro a usar o livre — como na urgência.
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

/* Sem catch: a conta que falhar sobe, e a rota diz que a lista não montou —
   um zero calado aqui faria a peça na fila deixar de ser descontada (③). */
function contar(db, sql, args){
  const m = {};
  db.prepare(sql).all(...(args||[])).forEach(r => { m[String(r.c).toUpperCase()] = r.n; });
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
  const planCel = {};    // c -> { livre, dem: { dia -> vendas } }
  pd.linhas.forEach(l => {
    const cel = l.celulas, c = String(l.codigo).toUpperCase();
    const dem = {};
    for(const x of cel){ const d = x.dia === 'atrasada' ? hoje : x.dia; dem[d] = (dem[d] || 0) + x.vendas; }
    planCel[c] = { livre: l.livre, dem };
  });

  /* O precisa de cada SKU (a mesma conta da 401). */
  const calc = {};
  DEMANDA.calcular(db).linhas.forEach(l => { if(l.cadastrado) calc[String(l.codigo).toUpperCase()] = l; });

  /* AS PEÇAS REVISADAS E AINDA NÃO EMBALADAS (fila 'aguardando'). O livre só
     sobe na embalagem: sem descontá-las, a bancada revisaria a mesma falta
     duas vezes (③ REVISÃO, 23/11/2026). A de modo 'hoje' revisada HOJE já
     saiu de Hoje (o ordem_dia a conta como revisada); TODAS as outras —
     estoque, devolução e a de 'hoje' de dias anteriores — viram +1 na
     embalagem e são descontadas PRIMEIRO DE HOJE (decisão do dono, 24/11/2026:
     "tem 29 na embalagem, já tem 9 … deveria aparecer 20 para a pessoa revisar"),
     e o que sobrar, dos próximos dias e depois do alvo. */
  const naFila = naFilaMap(db);
  /* Revisada hoje para estoque (o andamento dos próximos dias e do alvo). */
  const revEst = contar(db, `SELECT UPPER(codigo) c, COUNT(*) n FROM revisao
    WHERE data=date('now','localtime') AND COALESCE(modo,'estoque')='estoque' AND COALESCE(teste,0)=0 GROUP BY UPPER(codigo)`);

  /* O PDF de hoje, por SKU (a régua do urgencia.js: volume pendente, do dia),
     e quanto dele a planilha também traz, em que data de envio. */
  const pdfHoje = contar(db, `SELECT UPPER(codigo) c, COUNT(*) n FROM lote
    WHERE data=date('now','localtime') AND codigo IS NOT NULL AND estagio='pendente' GROUP BY UPPER(codigo)`);
  /* A ligação só olha a linha da planilha que a 401 conta: os MESMOS filtros
     do porDia (a futura, e sem a venda que já tem etiqueta). Uma linha que a
     401 deixou de fora apagaria, no dia dela, a venda de OUTRO cliente (③
     REVISÃO, rodada 4). */
  const ligada = {};   // c -> { dia -> n }
  const Q = DEMANDA.sql(db);
  db.prepare(`SELECT UPPER(l.codigo) c,
      CASE WHEN vf.data_envio < date('now','localtime') THEN date('now','localtime') ELSE vf.data_envio END d,
      COUNT(*) n
    FROM lote l JOIN (SELECT venda_id, codigo, data_envio FROM venda_futura
                      WHERE ${Q.FUTURA}${Q.ETQ ? ' AND NOT '+Q.ETQ : ''}) vf
      ON vf.venda_id IN (l.venda, l.packId) AND UPPER(vf.codigo)=UPPER(l.codigo)
    WHERE l.data=date('now','localtime') AND l.codigo IS NOT NULL AND l.estagio='pendente'
    GROUP BY UPPER(l.codigo), d`).all().forEach(r => { (ligada[r.c] = ligada[r.c] || {})[r.d] = r.n; });

  const skus = {};
  db.prepare(`SELECT UPPER(s.codigo) c, s.codigo, s.descricao, s.cor, s.cor_codigo, s.largura_cm, s.altura_cm,
      COALESCE(m.sob_medida,0) sob_medida
    FROM skus s LEFT JOIN modelo m ON m.id=s.modelo_id`).all().forEach(s => { skus[s.c] = s; });

  const cods = new Set(Object.keys(hojeMap).concat(Object.keys(planCel), Object.keys(calc)));
  const itens = [];
  for(const c of cods){
    const s = skus[c];
    if(!s) continue;
    const o = hojeMap[c];
    /* A peça já revisada e esperando a embalagem sai primeiro de Hoje. */
    const hojeBruto = o ? Math.max(0, o.a_produzir) : 0;
    const naEmb = Math.min(hojeBruto, naFila[c] || 0);
    const hojeFalta = hojeBruto - naEmb;
    const hojeFeitas = o ? (o.revisadas || 0) : 0;
    /* A falta dos próximos dias, venda a venda: a demanda da planilha sem as
       vendas que o PDF de hoje já trouxe (essas estão em Hoje), e o PDF de hoje
       inteiro como o primeiro a usar o livre (③ REVISÃO). */
    const pc = planCel[c];
    const l = calc[c];
    const porDiaSku = [];
    const incHoje = { n:0 };
    /* O ALVO É A MESMA CONTA, ATÉ O FIM (③ REVISÃO, rodada 4): depois da
       janela, a venda que vem depois dela e o alvo do SKU entram na mesma
       soma acumulada, contra o mesmo livre. A venda do PDF que a planilha
       ainda não traz usa o livre aqui e também no alvo — antes ela usava o
       livre nos próximos dias e sumia do alvo, e a lista pedia peça a menos. */
    let alvo = 0;
    {
      const dem = Object.assign({}, pc ? pc.dem : {}), lig = ligada[c] || {};
      for(const d of Object.keys(lig)) dem[d] = Math.max(0, (dem[d] || 0) - lig[d]);
      const livre = pc ? (pc.livre || 0) : (l && l.livre != null ? l.livre : 0);
      let acum = (pdfHoje[c] || 0) + Object.keys(dem).filter(d => d <= hoje).reduce((a, d) => a + dem[d], 0);
      const fl = () => acum > 0 ? Math.max(0, acum - livre) : 0;
      let ant = fl();
      /* Cada dia da janela leva também a venda dos dias que ficaram fora
         dela antes dele (o sábado e o domingo antes da segunda). */
      let antD = hoje;
      for(const d of dias){
        acum += Object.keys(dem).filter(k => k > antD && k <= d).reduce((a, k) => a + dem[k], 0);
        const v = fl(); porDiaSku.push({ dia:d, n:Math.max(0, v - ant) }); ant = v; antD = d;
      }
      acum += Object.keys(dem).filter(k => k > antD).reduce((a, k) => a + dem[k], 0);
      acum += (s.sob_medida || !l) ? 0 : (l.alvo || 0);   // sob medida não tem alvo (R-REV-04)
      alvo = Math.max(0, fl() - ant);
    }
    const tirar = (q) => { for(const x of [incHoje].concat(porDiaSku)){ const t = Math.min(q, x.n); x.n -= t; q -= t; } return q; };
    /* A peça revisada e ainda não embalada sai do dia mais cedo. */
    let resto = tirar((naFila[c] || 0) - naEmb);
    const proxTotal = porDiaSku.reduce((a, x) => a + x.n, 0);
    alvo -= Math.min(resto, alvo);
    /* O SKU com o Hoje todo coberto pela embalagem fica na conta (③ REVISÃO):
       sem nada a revisar, ele não entra em lista nenhuma, mas a peça dele
       conta em "já revisadas" e na faixa de venda nova. */
    if(!hojeFalta && !proxTotal && !alvo && !hojeFeitas && !naEmb) continue;
    const primeiro = porDiaSku.length ? porDiaSku[0] : null;
    itens.push({
      codigo: s.codigo, descricao: s.descricao || '', cor: s.cor_codigo || s.cor || '',
      largura_cm: s.largura_cm, altura_cm: s.altura_cm,
      hoje: hojeFalta, hoje_revisadas: hojeFeitas, hoje_na_embalagem: naEmb,
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
    totais: { hoje: soma(hojeL, 'hoje'), hoje_revisadas: soma(itens, 'hoje_revisadas'), hoje_na_embalagem: soma(itens, 'hoje_na_embalagem'),
              proximos: soma(depois, 'proximos'), alvo: soma(alvoTodos, 'alvo') },
    /* As revisadas de hoje para a ordem do dia, de todo SKU com ordem (a tela
       usa para separar a venda nova do "Desfazer"). */
    /* A peça na embalagem conta junto: a que sai da fila por defeito sobe o
       Hoje e desce aqui, e não é venda nova (24/11/2026). */
    revisadas_hoje: Object.keys(hojeMap).reduce((m, c) => {
      const it = itens.find(x => String(x.codigo).toUpperCase() === c);
      m[hojeMap[c].codigo] = (hojeMap[c].revisadas || 0) + (it ? it.hoje_na_embalagem || 0 : 0); return m; }, {}),
    hoje_terminado: temOrdem && soma(hojeL, 'hoje') === 0,
    sem_venda_hoje: !temOrdem
  };
}

/* As peças revisadas esperando a embalagem que ainda não saíram de Hoje pelo
   ordem_dia: toda a fila 'aguardando', menos a de modo 'hoje' revisada hoje
   (essa o ordem_dia já conta como revisada). Uma régua só para a lista e para
   o modo (③ REVISÃO). */
function naFilaMap(db){
  return contar(db, `SELECT UPPER(codigo) c, COUNT(*) n FROM fila
    WHERE situacao='aguardando' AND NOT (COALESCE(modo,'')='hoje' AND data=date('now','localtime'))
      AND COALESCE(teste,0)=0 GROUP BY UPPER(codigo)`);
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
    /* A mesma conta do Hoje da lista: o dia já coberto pelas peças esperando a
       embalagem não pede mais peça do dia (decisão do dono, 24/11/2026). */
    return o && (o.a_produzir - (naFilaMap(db)[c] || 0)) > 0 ? 'hoje' : 'estoque';
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

#!/usr/bin/env node
/* Testes da spec PLANEJAMENTO-VENDAS-FUTURAS (07/11/2026), as quatro fases.
 *
 *   node teste_vendas_futuras.js
 *
 * 1. O relatorio REAL do ML de 07/11/2026 09:59 (casos/planilha-ml-2026-11-07.csv,
 *    so as 7 colunas que a conta usa — sem nome, CPF nem endereco): os 40
 *    estados caem nos grupos da tabela §3-B do dono e o comprometido e de
 *    239 pecas (o dono, 07/11/2026: "vale 239").
 * 2. A falta acumulada por dia (R4), a Atrasada (R3), a NF sem data, as
 *    unidades (R2), o sob medida fora (R6), o SKU sem cadastro (R7), e a aba e a
 *    tela azul dando o MESMO comprometido (R1).
 * 3. As janelas 7/14/30/45 so para olhar (R9).
 * 4. O ritmo = maior entre a janela e a janela curta (R10).
 * 5. A ordem pela data da falta (R11), desligada por padrao e ligada so pelo
 *    Admin Geral.
 * 7. A venda com etiqueta impressa sai da lista, e a conta usa o livre
 *    (09/11/2026, decisao do dono).
 *
 * Sobe um banco temporario e chama os handlers direto. Nao toca em producao.
 */
const Database = require('better-sqlite3');
const fs = require('fs'), os = require('os'), path = require('path');

const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'pcp-vfut-'));
process.env.PCP_DIR = tmp;

let falhas = 0, casos = 0;
const ok = (n, c, extra) => { casos++;
  if(c) console.log('ok      ' + n);
  else { falhas++; console.log('FALHOU  ' + n + (extra !== undefined ? '   ' + (typeof extra === 'string' ? extra : JSON.stringify(extra)).slice(0, 600) : '')); } };

const P = require('./planilha_estado');
const { lerPlanilha } = require('./planilha');
const DEMANDA = require('./demanda_dominio');

function novoBanco(){
  const db = new Database(path.join(tmp, 't' + Math.random().toString(36).slice(2) + '.db'));
  db.exec(`CREATE TABLE skus (codigo TEXT PRIMARY KEY, descricao TEXT DEFAULT '', cor TEXT DEFAULT '',
      estoque INTEGER DEFAULT 0, alvo INTEGER DEFAULT 0, modelo_id INTEGER);
    CREATE TABLE modelo (id INTEGER PRIMARY KEY, codigo TEXT, nome TEXT, sob_medida INTEGER DEFAULT 0,
      exige_medida INTEGER DEFAULT 1);
    INSERT INTO modelo (id,codigo,nome,sob_medida) VALUES (1,'ROLO','Rolô',0),(2,'SOBMEDIDA','Sob medida',1);`);
  const rotas = {};
  const app = { get:(p,...h)=>{ rotas['GET '+p]=h[h.length-1]; },
                post:(p,...h)=>{ rotas['POST '+p]=h[h.length-1]; },
                use:()=>{}, locals:{ acesso:{ auditar(){}, ehAdminGeral(uid){ return uid === 1; } } } };
  require('./plan_route')(app, db);
  const chamar = (k, body, usuario, query) => new Promise(r => {
    if(!rotas[k]) return r({ __sem_rota:k });
    let st = 200;
    const res = { json:o=>r(Object.assign({__st:st}, Array.isArray(o) ? {lista:o} : o)), status(n){ st = n; return res; }, send:o=>r(o), setHeader(){} };
    try{ rotas[k]({ body:body||{}, params:{}, query:query||{}, headers:{}, usuario: usuario === undefined ? {id:1, nome:'Dono'} : usuario }, res); }
    catch(e){ r({ __st:500, __erro:String(e.stack||e) }); }
  });
  return { db, chamar };
}
const dia = (db, n) => db.prepare("SELECT date('now','localtime',?||' day') d").get(String(n)).d;
const csv64 = txt => 'data:text/csv;base64,' + Buffer.from(txt, 'utf8').toString('base64');

(async () => {
  /* ═════════ 1. O RELATORIO REAL DE 07/11/2026 ═════════ */
  const arqReal = fs.readFileSync(path.join(__dirname, 'casos', 'planilha-ml-2026-11-07.csv'));
  const L = lerPlanilha(arqReal);
  const col = P.colunas(L);
  ok('as colunas saem do cabeçalho (Descrição, Pacote, Unidades)',
     col.venda === 0 && col.data === 1 && col.estado === 2 && col.descricao === 3 && col.unidades === 5 && col.sku === 6, col);
  ok('sem cabeçalho, as posições do relatório de hoje (1, 2, 4, 5, 6, 8, 23)',
     JSON.stringify(P.colunas([['x']])) === JSON.stringify({ venda:0, data:1, estado:3, descricao:4, pacote:5, unidades:7, sku:22 }));
  const rel = P.dataDoRelatorio(L);
  ok('a data e a hora do relatório saem do título', rel && rel.data === '2026-11-07' && rel.hora === '09:59', rel);
  ok('...ou do nome do arquivo', JSON.stringify(P.dataDoRelatorio([], '20261107_Vendas_BR_Mercado_Libre_y_Mercado_Shops_2026-11-07_09-59hs_136721278.xlsx'))
     === JSON.stringify({ data:'2026-11-07', hora:'09:59' }));

  /* A TABELA §3-B, estado por estado (o dono, 07/11/2026: os 26 do pós-venda
     no grupo 4). "dia N" normalizado: cada data é o mesmo estado. */
  const ESPERADO = {
    fabrica: ['Para entregar na coleta do dia N', 'Pronto para coleta', 'Pronta para emitir NF-e da venda'],
    saiu: ['A caminho', 'Envio reagendado', 'Envio atrasado'],
    entregue: ['Entregue', 'Venda entregue'],
    pos_venda: ['Devolução finalizada com reembolso para o comprador', 'Mediação finalizada com reembolso para o comprador',
      'Devolvido no dia N', 'Reclamação encerrada. Devolvemos o dinheiro', 'Reclamação com devolução habilitada',
      'Devolução a caminho', 'Mediação para responder sexta-feira', 'Mediação em espera de resposta do Mercado Livre',
      'Devolução em preparação', 'Mediação finalizada. Te demos o dinheiro.', 'Reclamação encerrada',
      'Liberamos o dinheiro da venda para você e reembolsamos o comprador',
      'Reclamação aberta para resolver até segunda-feira às 14 h', 'Reclamação encerrada com reembolso para o comprador',
      'Mediação para responder terça-feira', 'Liberamos o valor do produto que devolveram para você',
      'Mediação para responder segunda-feira', 'Pacote não entregue', 'Reclamação esperando resposta do comprador',
      'Devolução para revisar até quarta-feira', 'Mediação para responder quarta-feira', 'Devolução com data atualizada',
      'Reclamação com oferta de reembolso parcial enviada', 'Mediação com devolução habilitada',
      'Reembolsamos o valor ao comprador', 'Reclamação encerrada com reembolso parcial'],
    cancelada: ['Cancelada pelo comprador', 'Venda cancelada. Não envie.', 'Cancelada pelo Mercado Livre', 'Pacote cancelado pelo Mercado Livre'],
    nao_venda: ['Pacote de N produtos', '']
  };
  const visto = {};
  const ref = P.deIso(rel.data);
  for(const l of L){
    if(!/^\d{6,}$/.test(String(l[col.venda]||'').trim())) continue;
    const k = String(l[col.estado]||'').replace(/\s+/g,' ').trim().replace(/dia \d+ de [a-zç]+/i, 'dia N').replace(/^Pacote de \d+ produtos?$/, 'Pacote de N produtos');
    visto[k] = P.classificar(l[col.estado], l[col.descricao], ref).grupo;
  }
  const todos = [].concat.apply([], Object.keys(ESPERADO).map(g => ESPERADO[g]));
  ok('o arquivo tem 40 estados, e a lista da §3-B os cobre todos (nenhum novo)',
     Object.keys(visto).length === 40 && Object.keys(visto).every(k => todos.indexOf(k) >= 0),
     Object.keys(visto).filter(k => todos.indexOf(k) < 0));
  for(const g of Object.keys(ESPERADO)){
    const errados = ESPERADO[g].filter(k => visto[k] !== g);
    ok('grupo ' + g + ': os ' + ESPERADO[g].length + ' estados caem nele', !errados.length, errados.map(k => k + ' → ' + visto[k]));
  }

  /* O import do arquivo inteiro, pela rota. Cadastra os SKUs do arquivo
     menos dois, para ver a linha "sem cadastro". */
  let B = novoBanco();
  const skusArq = new Set();
  for(const l of L) if(/^\d{6,}$/.test(String(l[col.venda]||'').trim()) && String(l[col.sku]||'').trim()) skusArq.add(String(l[col.sku]).trim().toUpperCase());
  const listaSku = Array.from(skusArq).sort();
  const fora = listaSku.slice(0, 2);
  const insSku = B.db.prepare("INSERT INTO skus (codigo,estoque,modelo_id) VALUES (?,?,1)");
  listaSku.slice(2).forEach((c, i) => insSku.run(c, i % 7));
  let r = await B.chamar('POST /api/planejamento/importar', { arquivo: 'data:;base64,' + arqReal.toString('base64'),
    nome:'casos/planilha-ml-2026-11-07.csv' });
  ok('o import do relatório real passa', r.ok === true, r);
  const G = r.grupos || {};
  ok('ainda na fábrica: 228 linhas · 239 peças', G.fabrica && G.fabrica.linhas === 228 && G.fabrica.pecas === 239, G.fabrica);
  ok('já saiu: 164 · 171', G.saiu && G.saiu.linhas === 164 && G.saiu.pecas === 171, G.saiu);
  ok('entregue: 2.636 · 2.716', G.entregue && G.entregue.linhas === 2636 && G.entregue.pecas === 2716, G.entregue);
  ok('pós-venda: 158 · 171', G.pos_venda && G.pos_venda.linhas === 158 && G.pos_venda.pecas === 171, G.pos_venda);
  ok('cancelada: 122 · 129', G.cancelada && G.cancelada.linhas === 122 && G.cancelada.pecas === 129, G.cancelada);
  ok('não é venda: 16 cabeçalhos de pacote + 2 Estado vazio', G.nao_venda && G.nao_venda.linhas === 18, G.nao_venda);
  ok('nenhum estado novo no arquivo de 07/11', Array.isArray(r.estados_novos) && r.estados_novos.length === 0, r.estados_novos);
  ok('o resumo diz as 239 peças futuras e a hora do relatório', r.pecas_futuras === 239 && r.relatorio_em === '2026-11-07 09:59', r);
  const q1 = s => B.db.prepare(s).get();
  ok('A1: Pronto para coleta e NF a emitir entram — 46 linhas · 49 peças',
     q1("SELECT COUNT(*) n, SUM(unidades) u FROM venda_futura WHERE estado IN ('Pronto para coleta','Pronta para emitir NF-e da venda') AND data_envio IS NOT NULL").n === 46
     && q1("SELECT SUM(unidades) u FROM venda_futura WHERE estado IN ('Pronto para coleta','Pronta para emitir NF-e da venda')").u === 49);
  ok('"coleta que passará na segunda-feira" num relatório de sábado 07/11 → segunda 09/11',
     q1("SELECT COUNT(*) n FROM venda_futura WHERE estado='Pronto para coleta' AND data_envio='2026-11-09' AND data_confirmar=0").n === 42);
  ok('"NF a emitir" fica no dia seguinte, marcada "data a confirmar"',
     q1("SELECT COUNT(*) n FROM venda_futura WHERE estado LIKE 'Pronta para emitir%' AND data_envio='2026-11-08' AND data_confirmar=1").n === 4);
  ok('A2: a venda de 2 unidades vale 2 (9 linhas de 2 e 1 de 3 no grupo 1)',
     q1("SELECT SUM(unidades) u FROM venda_futura WHERE grupo='fabrica'").u === 239);
  ok('A4: o pós-venda entra na média (cancelada=0)', q1("SELECT COUNT(*) n FROM venda_futura WHERE grupo='pos_venda' AND cancelada=1").n === 0
     && q1("SELECT COUNT(*) n FROM venda_futura WHERE grupo='pos_venda'").n === 158);
  ok('...a cancelada e o Estado vazio não', q1("SELECT COUNT(*) n FROM venda_futura WHERE grupo IN ('cancelada','nao_venda') AND cancelada=0").n === 0);
  ok('já saiu e entregue não têm data de envio (não são futuras)',
     q1("SELECT COUNT(*) n FROM venda_futura WHERE grupo IN ('saiu','entregue','pos_venda','cancelada','nao_venda') AND data_envio IS NOT NULL").n === 0);
  /* "Devolvido no dia 3 de novembro" ganhava data de envio pelo parse antigo. */
  ok('"Devolvido no dia N" não vira venda futura', q1("SELECT COUNT(*) n FROM venda_futura WHERE estado LIKE 'Devolvido no dia%' AND data_envio IS NOT NULL").n === 0);

  const calc = DEMANDA.calcular(B.db), pd = DEMANDA.porDia(B.db);
  const compCalc = calc.linhas.reduce((a, l) => a + l.comprometido, 0);
  const somaCel = x => x.celulas.reduce((a, c) => a + c.vendas, 0);
  const compAba = pd.linhas.reduce((a, l) => a + somaCel(l), 0) + pd.sob_medida.reduce((a, l) => a + somaCel(l), 0)
                + pd.sem_cadastro.reduce((a, l) => a + somaCel(l), 0);
  ok('R1: a tela azul e a aba dão o mesmo comprometido — 239 peças', compCalc === 239 && compAba === 239, { compCalc, compAba });
  ok('R1, SKU a SKU: o acumulado da última coluna = o comprometido da tela azul',
     pd.linhas.every(l => { const c = calc.linhas.find(x => x.codigo === l.codigo);
       return c && l.celulas[l.celulas.length-1].acumulado === c.comprometido; }));
  ok('R7: SKU da planilha sem cadastro aparece em linha própria',
     fora.every(c => pd.sem_cadastro.some(x => x.codigo === c) || !pd.linhas.concat(pd.sob_medida).some(x => x.codigo === c))
     && !pd.linhas.some(l => fora.indexOf(l.codigo) >= 0));
  r = await B.chamar('GET /api/planejamento/futuras');
  ok('GET /api/planejamento/futuras devolve a conta e a hora da planilha',
     r.ok && r.planilha && r.planilha.relatorio_em === '2026-11-07 09:59' && Array.isArray(r.dias) && r.linhas.length > 0, r.planilha);

  /* ═════════ 2. A FALTA ACUMULADA, COM DADO MONTADO ═════════ */
  B = novoBanco();
  const db = B.db;
  db.prepare("INSERT INTO skus (codigo,estoque,modelo_id) VALUES ('A',5,1),('B',10,1),('SM',0,2),('C',0,1)").run();
  const vf = db.prepare(`INSERT INTO venda_futura (venda_id,codigo,data_venda,data_envio,cancelada,unidades,grupo,estado,data_confirmar)
    VALUES (?,?,?,?,0,?,?,?,?)`);
  let n = 0; const v = (c, envio, un, grupo, conf, venda) =>
    vf.run('V' + (++n), c, venda != null ? venda : dia(db, 0), envio, un || 1, grupo === undefined ? 'fabrica' : grupo, 'x', conf || 0);
  v('A', dia(db, 0), 3);                 // hoje 3 (uma linha de 3 unidades)
  v('A', dia(db, 1), 2); v('A', dia(db, 1), 2);  // amanhã 4
  v('A', dia(db, 3), 1, 'fabrica', 1);   // NF a emitir: data a confirmar
  v('A', dia(db, 3), 1);
  v('B', dia(db, -1), 1);                // atrasada (data passada, ainda na fábrica)
  v('B', dia(db, 2), 4);
  v('SM', dia(db, 2), 2);                // sob medida
  v('ZZ', dia(db, 2), 1);                // sem cadastro
  v('B', dia(db, -3), 1, null);          // linha de antes desta fase, data passada: NÃO é futura
  v('B', dia(db, 5), 1, null);           // linha de antes, data futura: é

  const p2 = DEMANDA.porDia(db);
  ok('a primeira coluna é "Atrasada"', p2.dias[0] && p2.dias[0].dia === 'atrasada' && p2.dias[0].rotulo === 'Atrasada', p2.dias);
  ok('R5: o horizonte é todo dia com venda futura', p2.dias.map(d => d.dia).join() ===
     ['atrasada', dia(db,0), dia(db,1), dia(db,2), dia(db,3), dia(db,5)].join(), p2.dias);
  const A = p2.linhas.find(l => l.codigo === 'A');
  const cel = (l, d) => l.celulas.find(c => c.dia === d);
  ok('R2: a linha de 3 unidades vale 3', cel(A, dia(db,0)).vendas === 3, cel(A, dia(db,0)));
  ok('R4: o estoque (5) cobre hoje (3) — falta 0', cel(A, dia(db,0)).falta === 0);
  ok('R4: amanhã acumula 7 contra 5 — falta 2', cel(A, dia(db,1)).acumulado === 7 && cel(A, dia(db,1)).falta === 2, cel(A, dia(db,1)));
  ok('R4: dia +3 acumula 9 — falta 4', cel(A, dia(db,3)).falta === 4, cel(A, dia(db,3)));
  ok('"falta a partir de" é o primeiro dia que o estoque não cobre', A.falta_desde === dia(db,1) && A.falta_primeiro === 2
     && /^[a-zá]{3} \d{2}\/\d{2}$/.test(A.falta_desde_rotulo), A);
  ok('a NF sem data aparece marcada "data a confirmar" na célula', cel(A, dia(db,3)).confirmar === 1);
  const Bl = p2.linhas.find(l => l.codigo === 'B');
  ok('R3: a atrasada conta, na primeira coluna', cel(Bl, 'atrasada').vendas === 1);
  ok('a linha de antes desta fase com data passada não conta; a de data futura conta',
     Bl.total === 1 + 4 + 1, Bl);
  ok('R6: sob medida fica fora da falta, contado à parte', !p2.linhas.some(l => l.codigo === 'SM')
     && p2.sob_medida.length === 1 && p2.sob_medida[0].total === 2);
  ok('R7: sem cadastro em linha própria', p2.sem_cadastro.length === 1 && p2.sem_cadastro[0].codigo === 'ZZ');
  ok('C, sem venda futura, não aparece na aba', !p2.linhas.some(l => l.codigo === 'C'));
  ok('a linha de quem falta vem pela data da primeira falta; quem não falta, embaixo',
     p2.linhas[0].codigo === 'A' && p2.linhas[p2.linhas.length-1].codigo === 'B' && Bl.falta_desde == null, p2.linhas.map(l => l.codigo + ':' + l.falta_desde));
  ok('o total da fábrica por dia soma as vendas', p2.total[dia(db,2)].vendas === 4 && p2.total[dia(db,1)].vendas === 4, p2.total);
  const c2 = DEMANDA.calcular(db);
  const cA = c2.linhas.find(l => l.codigo === 'A'), cB = c2.linhas.find(l => l.codigo === 'B');
  ok('R1: o comprometido da tela azul é o acumulado da aba (A 9, B 6)', cA.comprometido === 9 && cB.comprometido === 6, [cA.comprometido, cB.comprometido]);
  ok('a atrasada empurra para "despacha até amanhã" na tela azul', cB.comp_ja >= 1 && cB.comp_atrasada === 1, cB);

  /* O import: estado novo não trava; o espelho tira a atrasada que saiu. */
  const MES = ['janeiro','fevereiro','março','abril','maio','junho','julho','agosto','setembro','outubro','novembro','dezembro'];
  const ext = n => { const d = new Date(); d.setDate(d.getDate()+n); return d.getDate() + ' de ' + MES[d.getMonth()]; };
  const venda = d => { const x = new Date(); x.setDate(x.getDate()-d); return x.getDate()+' de '+MES[x.getMonth()]+' de '+x.getFullYear()+' 10:00 hs.'; };
  const linhaCsv = (vid, estado, sku, un, desc, diasAtras) => [vid, venda(diasAtras||0), estado, desc||'', 'Não', un||'1.0', sku].join(';');
  const CAB = 'N.º de venda;Data de venda;Estado;Descrição do status;Pacote de diversos produtos;Unidades;SKU';
  B = novoBanco();
  B.db.prepare("INSERT INTO skus (codigo,estoque,modelo_id) VALUES ('A',0,1)").run();
  r = await B.chamar('POST /api/planejamento/importar', { arquivo: csv64([CAB,
    linhaCsv('2000000000000001', 'Para entregar na coleta do dia ' + ext(2), 'A', '2.0'),
    linhaCsv('2000000000000002', 'Aguardando algo novo do dia ' + ext(4), 'A'),
    linhaCsv('2000000000000003', 'Um estado que ninguém viu', 'A', '1.0', '', 3),
    linhaCsv('2000000000000004', 'Para entregar na coleta do dia ' + ext(-2), 'A')].join('\n') + '\n') });
  ok('estado novo não trava o import', r.ok === true, r);
  ok('...e o import avisa os estados novos', (r.estados_novos||[]).length === 2, r.estados_novos);
  const vfB = id => B.db.prepare('SELECT * FROM venda_futura WHERE venda_id=?').get(id);
  ok('estado novo COM data vira venda futura', vfB('2000000000000002').data_envio && vfB('2000000000000002').grupo === 'novo');
  ok('estado novo sem data conta na média (não é cancelada)', vfB('2000000000000003').cancelada === 0 && !vfB('2000000000000003').data_envio);
  ok('a coleta de data passada fica como atrasada', vfB('2000000000000004').grupo === 'fabrica' && vfB('2000000000000004').data_envio < dia(B.db,0));
  r = await B.chamar('POST /api/planejamento/importar', { arquivo: csv64([CAB,
    linhaCsv('2000000000000001', 'Para entregar na coleta do dia ' + ext(2), 'A', '2.0'),
    linhaCsv('2000000000000002', 'Aguardando algo novo do dia ' + ext(4), 'A')].join('\n') + '\n'), confirmar:true });
  /* ③ REVISÃO (07/11/2026): apagar a atrasada ausente levava a venda junto
     com a média — a #11 por outra porta. Ela fica, sem data de envio: saiu. */
  ok('a atrasada que não veio no arquivo NÃO é apagada (#11): perde a data e conta como saída',
     r.ok && !!vfB('2000000000000004') && vfB('2000000000000004').data_envio == null && vfB('2000000000000004').grupo === 'saiu'
     && vfB('2000000000000004').cancelada === 0 && r.atrasadas_sairam === 1, [r, vfB('2000000000000004')]);
  ok('...e a passada sem data nunca sai por ausência (#11)', !!vfB('2000000000000003'));
  /* ③ REVISÃO, rodada 3: o guarda dos 50% conta a atrasada — ela sai do
     comprometido igual à futura. Um recorte que tira 10 atrasadas e deixa 1
     futura pede confirmação, e nada grava antes. */
  B = novoBanco();
  B.db.prepare("INSERT INTO skus (codigo,estoque,modelo_id) VALUES ('A',0,1)").run();
  const va = B.db.prepare(`INSERT INTO venda_futura (venda_id,codigo,data_venda,data_envio,unidades,grupo,estado) VALUES (?,?,?,?,1,'fabrica','x')`);
  for(let i = 0; i < 10; i++) va.run('300000000000000' + i, 'A', dia(B.db,-5), dia(B.db,-2));
  va.run('2000000000000001', 'A', dia(B.db,-1), dia(B.db,2));
  r = await B.chamar('POST /api/planejamento/importar', { arquivo: csv64([CAB,
    linhaCsv('2000000000000001', 'Para entregar na coleta do dia ' + ext(2), 'A')].join('\n') + '\n') });
  ok('o recorte que tira as atrasadas pede confirmação (409), e nada grava',
     r.__st === 409 && r.motivo === 'confirmar' && DEMANDA.calcular(B.db).linhas.find(l => l.codigo === 'A').comprometido === 11, r);
  ok('"Pronto para coleta" num relatório de segunda é o mesmo dia',
     P.classificar('Pronto para coleta', 'Você deve entregar o pacote à coleta que passará na segunda-feira.', new Date(2026,10,9)).data_envio === '2026-11-09');
  ok('"Pronto para coleta" sem dia na descrição: dia seguinte, a confirmar',
     (c => c.data_envio === '2026-11-08' && c.data_confirmar === 1)(P.classificar('Pronto para coleta', '', new Date(2026,10,7))));
  ok('estado novo com "cancel" não é cancelada: conta como venda e avisa', P.classificar('Cancelamento em análise', '', new Date()).grupo === 'novo');

  /* ③ REVISÃO: saldo negativo sem venda atrasada não pode virar "atrasada". */
  B = novoBanco();
  B.db.prepare("INSERT INTO skus (codigo,estoque,modelo_id) VALUES ('NEG',-2,1),('OUTRO',0,1)").run();
  const vn = B.db.prepare(`INSERT INTO venda_futura (venda_id,codigo,data_venda,data_envio,unidades,grupo) VALUES (?,?,?,?,1,'fabrica')`);
  vn.run('n1', 'NEG', dia(B.db,0), dia(B.db,5)); vn.run('n2', 'OUTRO', dia(B.db,-3), dia(B.db,-1));
  const pN = DEMANDA.porDia(B.db).linhas.find(l => l.codigo === 'NEG');
  ok('saldo negativo: a falta começa no dia da venda do SKU, e não na coluna Atrasada',
     pN.falta_desde === dia(B.db,5) && pN.celulas[0].falta === 0 && pN.falta_primeiro === 3, pN);
  B.db.prepare("UPDATE config SET valor='1' WHERE chave='ordem_por_falta'").run();
  const cN = DEMANDA.calcular(B.db).linhas.find(l => l.codigo === 'NEG');
  ok('...e o motivo não diz "atrasadas" para quem não tem venda atrasada', !/atrasad/.test(cN.motivo) && cN.data_falta === dia(B.db,5), cN.motivo);
  ok('"amanhã" na descrição dá o dia seguinte sem "a confirmar"',
     (c => c.data_envio === '2026-11-08' && c.data_confirmar === 0)(P.classificar('Pronto para coleta', 'A coleta passa amanhã.', new Date(2026,10,7))));

  /* CONSERTO de 08/11/2026 (decisão do dono, linha em DECISOES): a planilha
     da tarde troca "coleta do dia 9 de novembro" por "coleta de amanhã", e
     traz "Etiqueta pronta para impressão". Os dois são venda AINDA NA FÁBRICA,
     para o dia seguinte ao do relatório — sem isso, 81 + 21 vendas do relatório
     das 17:34 saíam do comprometido de segunda. */
  ok('"Para entregar na coleta de amanhã" é ainda na fábrica, no dia seguinte ao relatório, sem "a confirmar"',
     (c => c.grupo === 'fabrica' && c.futura && c.data_envio === '2026-11-09' && c.data_confirmar === 0)(P.classificar('Para entregar na coleta de amanhã',
       'Para organizar os envios, você poderá imprimir a etiqueta amanhã. Já avisamos seu comprador e isso não vai afetar sua reputação.', new Date(2026,10,8))));
  ok('"Etiqueta pronta para impressão" com "coleta que passará amanhã" na descrição: ainda na fábrica, dia seguinte',
     (c => c.grupo === 'fabrica' && c.futura && c.data_envio === '2026-11-09' && c.data_confirmar === 0)(P.classificar('Etiqueta pronta para impressão',
       'Você deve entregar o pacote à coleta que passará amanhã.', new Date(2026,10,8))));
  ok('"Etiqueta pronta para impressão" sem dia na descrição: dia seguinte, a confirmar (nunca some)',
     (c => c.grupo === 'fabrica' && c.data_envio === '2026-11-09' && c.data_confirmar === 1)(P.classificar('Etiqueta pronta para impressão', '', new Date(2026,10,8))));
  /* E os três estados de uma linha do mesmo relatório (o dono, 08/11/2026). */
  ok('"Seu pacote foi devolvido em 11 de setembro" é pós-venda (entra na média, não é futura)',
     (c => c.grupo === 'pos_venda' && c.media && !c.futura)(P.classificar('Seu pacote foi devolvido em 11 de setembro', '', new Date(2026,10,8))));
  ok('"Venda não entregue" é pós-venda, como "Pacote não entregue"',
     (c => c.grupo === 'pos_venda' && c.media && !c.futura)(P.classificar('Venda não entregue', '', new Date(2026,10,8))));
  ok('"Cancelada" sozinha é cancelada (fora da média)',
     (c => c.grupo === 'cancelada' && !c.media && !c.futura)(P.classificar('Cancelada', '', new Date(2026,10,8))));
  B = novoBanco();
  B.db.prepare("INSERT INTO skus (codigo,estoque,modelo_id) VALUES ('AM',0,1)").run();
  B.db.prepare(`INSERT INTO venda_futura (venda_id,codigo,data_venda,data_envio,unidades,grupo,estado) VALUES ('2000000000000077','AM',?,?,1,'fabrica','x')`)
    .run(dia(B.db,-2), dia(B.db,1));
  r = await B.chamar('POST /api/planejamento/importar', { arquivo: csv64([CAB,
    linhaCsv('2000000000000077', 'Para entregar na coleta de amanhã', 'AM'),
    linhaCsv('2000000000000078', 'Etiqueta pronta para impressão', 'AM')].join('\n') + '\n') });
  const vAm = B.db.prepare("SELECT data_envio, grupo FROM venda_futura WHERE venda_id IN ('2000000000000077','2000000000000078') ORDER BY venda_id").all();
  ok('no import, a venda que virou "coleta de amanhã" continua no comprometido, e a "etiqueta pronta" entra',
     r.ok && vAm.length === 2 && vAm.every(v => v.grupo === 'fabrica' && v.data_envio === dia(B.db,1))
     && DEMANDA.calcular(B.db).linhas.find(l => l.codigo === 'AM').comprometido === 2
     && !(r.estados_novos || []).length, { r, vAm });

  /* ═════════ 3. AS JANELAS, SÓ PARA OLHAR ═════════ */
  B = novoBanco();
  B.db.prepare("INSERT INTO skus (codigo,estoque,modelo_id) VALUES ('J',0,1)").run();
  const ins = B.db.prepare("INSERT INTO venda_futura (venda_id,codigo,data_venda,unidades,grupo) VALUES (?,?,?,?,'entregue')");
  for(let i = 0; i < 20; i++) ins.run('J'+i, 'J', dia(B.db, -i), 1);
  const cfgAntes = JSON.stringify(B.db.prepare("SELECT * FROM config ORDER BY chave").all());
  r = await B.chamar('GET /api/planejamento/janelas');
  ok('as quatro janelas 7 · 14 · 30 · 45', r.ok && r.janelas.map(j => j.dias).join() === '7,14,30,45', r.janelas);
  const J = (r.linhas||[]).find(l => l.codigo === 'J');
  ok('a média de 7 dias: 8 vendas (hoje e mais 7 dias) ÷ 7', J && J.medias[7].vendas === 8 && J.medias[7].media === +(8/7).toFixed(2), J && J.medias[7]);
  ok('janela maior que a história é cortada, e dita (20 dias de história)',
     r.janelas[2].cortada === true && r.janelas[2].usada === 20 && r.janelas[3].usada === 20 && r.janelas[0].cortada === false, r.janelas);
  ok('...e a média cortada divide pela história, não pela janela', J.medias[30].media === 1, J.medias[30]);
  ok('a seta de tendência (14 contra 30)', ['sobe','desce','igual'].indexOf(J.tendencia) >= 0);
  ok('R9: olhar as janelas não muda a config', JSON.stringify(B.db.prepare("SELECT * FROM config ORDER BY chave").all()) === cfgAntes);

  /* ═════════ 4. O RITMO ═════════ */
  B = novoBanco();
  B.db.prepare("INSERT INTO skus (codigo,estoque,modelo_id) VALUES ('SOBE',0,1),('DESCE',0,1),('SM2',0,2)").run();
  const iv = B.db.prepare("INSERT INTO venda_futura (venda_id,codigo,data_venda,unidades,grupo) VALUES (?,?,?,?,'entregue')");
  let k = 0;
  // SOBE: 3/dia nos últimos 10 dias, nada antes → média 30 = 1, de 14 = 30/14
  for(let i = 0; i < 10; i++) iv.run('s'+(k++), 'SOBE', dia(B.db, -i), 3);
  // DESCE: 3/dia entre 16 e 25 dias atrás, nada recente → média 30 = 1, de 14 = 0
  for(let i = 16; i < 26; i++) iv.run('d'+(k++), 'DESCE', dia(B.db, -i), 3);
  // SM2: sob medida que acelera
  for(let i = 0; i < 10; i++) iv.run('m'+(k++), 'SM2', dia(B.db, -i), 3);
  let cr = DEMANDA.calcular(B.db);
  const L4 = c => cr.linhas.find(l => l.codigo === c);
  ok('subida pega em dias: o ritmo é a média de 14 (30 ÷ 14)', L4('SOBE').ritmo === +(30/14).toFixed(2) && L4('SOBE').subindo === true, L4('SOBE'));
  ok('...e o alvo usa o ritmo: ceil(30/14 × 10) = 22', L4('SOBE').alvo === Math.ceil(30/14*10), L4('SOBE'));
  ok('a média da janela continua dita ao lado (1,00/dia)', L4('SOBE').media_dia === 1);
  ok('queda NÃO derruba o alvo antes dos 30: ritmo = média de 30 (1/dia), alvo 10',
     L4('DESCE').ritmo === 1 && L4('DESCE').alvo === 10 && L4('DESCE').subindo === false, L4('DESCE'));
  ok('sob medida continua sem alvo', L4('SM2').alvo === 0);
  r = await B.chamar('POST /api/planejamento/config', { janela_curta: 30 });
  cr = DEMANDA.calcular(B.db);
  ok('a janela curta é config.janela_curta (editada pela rota da janela)', r.ok && cr.config.janela_curta === 30 && L4('SOBE').ritmo === 1, cr.config);

  /* ═════════ 5. A ORDEM PELA DATA DA FALTA ═════════ */
  B = novoBanco();
  const d5 = B.db;
  d5.prepare(`INSERT INTO skus (codigo,estoque,modelo_id) VALUES
    ('HOJE',3,1),('AMANHA_POUCO',0,1),('AMANHA_MUITO',0,1),('REPOE',6,1),('REPOE_AMANHA',1,1),('SEMVENDA',0,1)`).run();
  const fv = d5.prepare(`INSERT INTO venda_futura (venda_id,codigo,data_venda,data_envio,unidades,grupo) VALUES (?,?,?,?,?,?)`);
  let z = 0;
  const fut = (c, d, un) => fv.run('f'+(z++), c, dia(d5,0), dia(d5,d), un, 'fabrica');
  const pas = (c, dAtras, un) => fv.run('p'+(z++), c, dia(d5,-dAtras), null, un, 'entregue');
  fut('HOJE', 0, 3);                              // o de hoje, coberto pelo estoque (3)
  fut('HOJE', 1, 2);                              // falta amanhã: 2
  fut('AMANHA_POUCO', 1, 1);                      // falta amanhã: 1
  fut('AMANHA_MUITO', 1, 4);                      // falta amanhã: 4
  for(let i = 0; i < 10; i++) pas('REPOE', i, 1); // ritmo 1/dia → 6 peças acabam daqui a 6 dias
  for(let i = 0; i < 10; i++) pas('REPOE_AMANHA', i, 1); // 1 peça → acaba amanhã
  fv.run('q'+(z++), 'SEMVENDA', null, null, 1, 'entregue');  // sem venda na janela, sem estoque → alvo mínimo

  cr = DEMANDA.calcular(d5);
  ok('a chave nasce DESLIGADA (config.ordem_por_falta = 0)', cr.config.ordem_por_falta === 0
     && d5.prepare("SELECT valor FROM config WHERE chave='ordem_por_falta'").get().valor === '0');
  ok('desligada, a ordem é a de degraus de sempre (R-REV-03)', cr.linhas.filter(l => l.precisa > 0).every((l, i, a) => !i || (a[i-1].prioridade||9) <= (l.prioridade||9)));
  ok('desligada, nenhuma data de falta', cr.linhas.every(l => l.data_falta == null && l.falta_tipo == null));
  r = await B.chamar('GET /api/revisao/producao');
  ok('desligada, a tela azul recebe a resposta de sempre (sem motivo)', r.lista && r.lista.every(x => !('motivo' in x)), r.lista && r.lista[0]);

  r = await B.chamar('POST /api/planejamento/config', { ordem_por_falta: 1, janela_media: 99 }, { id:7, nome:'Admin' });
  ok('quem não é Admin Geral não liga (403), e nada do pedido grava',
     r.__st === 403 && d5.prepare("SELECT valor FROM config WHERE chave='ordem_por_falta'").get().valor === '0'
     && d5.prepare("SELECT valor FROM config WHERE chave='janela_media'").get().valor === '30', r);
  r = await B.chamar('POST /api/planejamento/config', { ordem_por_falta: 1 }, { id:1, nome:'Dono' });
  ok('o Admin Geral liga', r.ok && d5.prepare("SELECT valor FROM config WHERE chave='ordem_por_falta'").get().valor === '1', r);

  cr = DEMANDA.calcular(d5);
  const ord = cr.linhas.filter(l => l.precisa > 0).map(l => l.codigo);
  ok('o caso do meio-dia: terminado o de hoje (coberto), a primeira linha é a falta de amanhã',
     ['AMANHA_MUITO','HOJE','AMANHA_POUCO'].indexOf(ord[0]) >= 0 && cr.linhas[0].data_falta === dia(d5,1), ord);
  const iVM = ord.indexOf('AMANHA_MUITO'), iH = ord.indexOf('HOJE'), iVP = ord.indexOf('AMANHA_POUCO'), iRA = ord.indexOf('REPOE_AMANHA');
  ok('no mesmo dia e tipo, mais peças faltando primeiro (4 > 2 > 1)', iVM < iH && iH < iVP, ord);
  ok('no mesmo dia, venda feita antes de reposição', iVP < iRA, ord);
  ok('a reposição que acaba depois vem depois', ord.indexOf('REPOE') > iRA, ord);
  const lin = c => cr.linhas.find(l => l.codigo === c);
  ok('cada linha diz o porquê — venda: "faltam 4 para <dia> (vendidas)"',
     /^faltam 4 para [a-zá]{3} \d{2}\/\d{2} \(vendidas\)$/.test(lin('AMANHA_MUITO').motivo) && lin('AMANHA_MUITO').falta_tipo === 'venda', lin('AMANHA_MUITO').motivo);
  /* REPOE: 10 vendas nos últimos 10 dias → ritmo = 10/14 (a de 14 vence a de
     30); 6 peças ÷ 0,71/dia = 8,4 → acaba daqui a 8 dias. */
  ok('reposição: hoje + (estoque − comprometido) ÷ ritmo, e "acaba <dia> pelo ritmo (0,7/dia)"',
     /^acaba [a-zá]{3} \d{2}\/\d{2} pelo ritmo \(0,7\/dia\)$/.test(lin('REPOE').motivo)
     && lin('REPOE').data_falta === dia(d5, Math.floor(6 / (10/14))), [lin('REPOE').motivo, lin('REPOE').data_falta]);
  ok('reposição sem venda na janela: sem data (vazia, nunca zero)', lin('SEMVENDA').data_falta == null
     && /sem venda na janela/.test(lin('SEMVENDA').motivo) && ord.indexOf('SEMVENDA') === ord.length - 1, [lin('SEMVENDA'), ord]);
  r = await B.chamar('GET /api/revisao/producao');
  ok('ligada, a tela azul recebe a ordem e o motivo', r.lista && r.lista[0].codigo === ord[0] && !!r.lista[0].motivo, r.lista && r.lista[0]);
  r = await B.chamar('POST /api/planejamento/config', { ordem_por_falta: 0 }, { id:1, nome:'Dono' });
  ok('o Admin Geral desliga, e volta a ordem de sempre', r.ok && DEMANDA.calcular(d5).config.ordem_por_falta === 0);

  /* ═════════ 6. A SIMULAÇÃO DA FASE 3, nos 60 dias do relatório real ═════════ */
  const SIM = require('./simular_ritmo').simular(L, { cobertura:10, minimo:2, regua:'producao' });
  const SIMc = require('./simular_ritmo').simular(L, { cobertura:10, minimo:2, regua:'cheios' });
  ok('a simulação avalia os dias com 30 de história antes e 10 de venda depois (08/10 a 28/10)',
     SIM.dias_avaliados === 21 && SIM.primeiro_dia === '2026-10-08' && SIM.ultimo_dia === '2026-10-28', SIM.dias_avaliados);
  ok('com a régua da produção (N+1 dias ÷ N), o ritmo novo falta MENOS: 2.005 → 1.386 peças',
     SIM.melhora === true && SIM.total.velho.falta === 2005 && SIM.total.novo.falta === 1386, SIM.total);
  ok('...e o preço é sobra maior (2.091 → 3.232), o decidido', SIM.total.velho.sobra === 2091 && SIM.total.novo.sobra === 3232, SIM.total);
  ok('com N dias cheios (sem o viés da borda) também: 2.130 → 1.584', SIMc.melhora === true
     && SIMc.total.velho.falta === 2130 && SIMc.total.novo.falta === 1584, SIMc.total);
  const s150 = SIM.skus.find(x => x.sku === 'BK150150BRANCO');
  ok('o BK150150BRANCO da spec: 6,33/dia na de 30 e 8,93 na de 14', s150 && s150.media30_fim === 6.33 && s150.media14_fim === 8.93, s150);

  /* ═════════ 7. A VENDA COM ETIQUETA SAI DA LISTA (09/11/2026) ═════════
     Decisão do dono: impressa a etiqueta de venda, a produção daquela venda
     acabou. A falta só se mexe quando a venda chega e quando a peça é
     embalada — a etiqueta e a Conferência não mexem nela. A consulta de
     09/11 achou 84 peças conferidas ainda no comprometido (falta 269 × 199). */
  B = novoBanco();
  const d7 = B.db;
  d7.exec(`CREATE TABLE lote (id INTEGER PRIMARY KEY AUTOINCREMENT, codigo TEXT, venda TEXT, packId TEXT,
      estagio TEXT, embalado_em TEXT, baixado_em TEXT, teste INTEGER DEFAULT 0, data TEXT);
    CREATE TABLE lote_item (id INTEGER PRIMARY KEY AUTOINCREMENT, lote_id INTEGER, codigo TEXT, qtd INTEGER DEFAULT 1);`);
  d7.prepare("INSERT INTO skus (codigo,estoque,modelo_id) VALUES ('X',0,1),('Y',2,1)").run();
  const v7 = d7.prepare("INSERT INTO venda_futura (venda_id,codigo,data_venda,data_envio,unidades,grupo) VALUES (?,?,?,?,1,'fabrica')");
  ['v1','v2','v3'].forEach(v => v7.run(v, 'X', dia(d7,0), dia(d7,1)));
  const lx = () => DEMANDA.porDia(d7).linhas.find(l => l.codigo === 'X');
  const cx = () => DEMANDA.calcular(d7).linhas.find(l => l.codigo === 'X');
  const passo = () => ({ falta: lx().falta_total, precisa: cx().precisa, comp: cx().comprometido, livre: lx().livre });
  let e0 = passo();
  const alvoX = DEMANDA.calcular(d7).linhas.find(l => l.codigo === 'X').alvo;
  ok('a venda chega: 3 vendidas, nada em estoque → falta 3 (precisa = 3 + o alvo)', e0.falta === 3 && e0.precisa === 3 + alvoX && e0.comp === 3, e0);
  d7.prepare("UPDATE skus SET estoque=1 WHERE codigo='X'").run();
  let e1 = passo();
  ok('a peça é EMBALADA (+1): a falta cai para 2', e1.falta === 2 && e1.precisa === e0.precisa - 1 && e1.livre === 1, e1);
  d7.prepare("INSERT INTO lote (codigo,venda,estagio,embalado_em,data) VALUES ('X','v1','embalado',datetime('now','localtime'),date('now','localtime'))").run();
  let e2 = passo();
  ok('a ETIQUETA de v1 sai: v1 sai da lista, o livre cai (peça em caixa), e a falta NÃO muda',
     e2.falta === 2 && e2.precisa === e1.precisa && e2.comp === 2 && e2.livre === 0 && lx().em_caixa === 1 && lx().estoque === 1, [e2, lx()]);
  const ce = DEMANDA.porDia(d7).com_etiqueta;
  ok('a aba diz quantas vendas saíram da lista por já ter etiqueta', ce.vendas === 1 && ce.pecas === 1, ce);
  d7.prepare("UPDATE lote SET baixado_em=datetime('now','localtime') WHERE venda='v1'").run();
  d7.prepare("UPDATE skus SET estoque=0 WHERE codigo='X'").run();
  let e3 = passo();
  ok('a CONFERÊNCIA baixa (−1 no saldo): a falta continua 2 — antes do conserto subia para 3', e3.falta === 2 && e3.precisa === e1.precisa && e3.comp === 2, e3);
  d7.prepare("INSERT INTO lote (codigo,venda,estagio,embalado_em,teste) VALUES ('X','v2','embalado',datetime('now','localtime'),1)").run();
  ok('a caixa do MODO TESTE não tira a venda de verdade da lista', passo().comp === 2, passo());
  d7.prepare("INSERT INTO lote (codigo,venda,packId,estagio,embalado_em,baixado_em) VALUES ('X','outra','v3','carregado',datetime('now','localtime'),datetime('now','localtime'))").run();
  ok('a venda se acha também pelo PACK, como no cancelamento', passo().comp === 1, passo());
  ok('a venda que o PCP não acha (v2) continua contando: na dúvida, produz-se', passo().comp === 1 && lx().total === 1, lx());
  const y0 = DEMANDA.calcular(d7).linhas.find(l => l.codigo === 'Y');
  d7.prepare("INSERT INTO lote (codigo,venda,estagio,embalado_em) VALUES ('Y','fora-da-planilha','embalado',datetime('now','localtime'))").run();
  const y1 = DEMANDA.calcular(d7).linhas.find(l => l.codigo === 'Y');
  ok('a caixa impressa de venda que a planilha ainda não trouxe reserva a peça: o precisa conta pelo livre',
     y1.precisa === y0.precisa + 1 && y1.livre === 1 && y1.estoque === 2, [y0, y1]);
  ok('o `estoque` devolvido continua sendo o SALDO (a aba Estoque e o custo leem o saldo)', cx().estoque === 0 && y1.estoque === 2);
  const banco0 = novoBanco().db;
  banco0.prepare("INSERT INTO skus (codigo,estoque,modelo_id) VALUES ('Z',2,1)").run();
  banco0.prepare("INSERT INTO venda_futura (venda_id,codigo,data_venda,data_envio,unidades,grupo) VALUES ('z1','Z',?,?,3,'fabrica')").run(dia(banco0,0), dia(banco0,1));
  ok('banco sem a tabela `lote`: a conta de sempre (saldo, sem desconto)',
     DEMANDA.porDia(banco0).linhas[0].falta_total === 1 && DEMANDA.porDia(banco0).linhas[0].livre === 2
     && (z => z.precisa === z.comprometido + z.alvo - 2)(DEMANDA.calcular(banco0).linhas.find(l=>l.codigo==='Z')));
  const htm = fs.readFileSync(path.join(__dirname, 'public', 'planejamento.html'), 'utf8');
  ok('a 401 mostra "Livre" com o "em caixa" embaixo, e a linha das vendas com etiqueta', /<th>Livre<\/th>/.test(htm) && /em caixa/.test(htm) && /com_etiqueta/.test(htm));
  ok('a 401 se atualiza sozinha a cada minuto, sem pisar no campo digitado',
     /setInterval\(\s*atualizarSozinha\s*,\s*60000\s*\)/.test(htm) && /activeElement/.test(htm));

  console.log('\n' + (falhas ? 'FALHARAM ' + falhas + ' de ' + casos : 'todos os ' + casos + ' casos passaram'));
  process.exit(falhas ? 1 : 0);
})().catch(e => { console.error(e); process.exit(1); });

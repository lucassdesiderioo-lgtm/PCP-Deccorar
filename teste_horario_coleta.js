#!/usr/bin/env node
/* teste_horario_coleta.js — OS HORÁRIOS DE SAÍDA (spec HORARIOS-DE-COLETA,
 * fases 1 e 2, 05/11/2026). Escrito ANTES do código (risco 🔴).
 *
 *   node teste_horario_coleta.js
 *
 * Trava:
 *   1. o horário é da DATA (R-HCO-01): 0 a 3 coletas, janela e corte, sábado
 *      entra, dia passado não se edita (R-HCO-08);
 *   2. lançar de novo SUBSTITUI e guarda a história (R-HCO-03); campo `corte`
 *      ausente preserva, e a janela mudada deixa o corte "a conferir" (R-HCO-07);
 *   3. vazio não é "sem coleta" (R-HCO-04);
 *   4. o PDF diz a saída (D4): só a venda de HOJE (ou sem data) e da MESMA
 *      modalidade ganha a marca; a futura e a de outra modalidade não, e a
 *      resposta diz quantas; a repetida não ganha marca nova; sem a permissão
 *      a escolha é ignorada DIZENDO; saída que não é de hoje é recusada;
 *   5. o relógio (fase 2): conta até o INÍCIO da janela (R-HCO-06), conta as
 *      caixas por coleta e as "sem coleta marcada"; a coleta tirada solta as
 *      caixas para "sem coleta marcada" (decisão 4 do plano);
 *   6. a agência usa o horário lançado, e sem ele o config (D6);
 *   7. sem login nada grava (401), e a alçada: tela 206, `coleta.horario`.
 *
 * Sobe um Express de verdade numa porta livre, num banco temporário. O
 * parsePdf é trocado por um que devolve os volumes já lidos (como no
 * teste_upload.js). O relógio é o `relogio.js` fixado.
 */
const Database = require('better-sqlite3');
const express = require('express');
const fs = require('fs'), os = require('os'), path = require('path');

const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'pcp-horario-'));
process.env.PCP_LOTES = path.join(tmp, 'lotes');

let proximos = [];
const PARSE = require.resolve('./parse');
require.cache[PARSE] = { id:PARSE, filename:PARSE, loaded:true, exports:{ parsePdf: async () => proximos } };

const RELOGIO = require('./relogio');

let casos = 0, falhas = 0;
function ok(desc, cond, detalhe){
  casos++;
  if(cond) console.log('  ok  ' + casos + ' — ' + desc);
  else { falhas++; console.log('  FALHOU ' + casos + ' — ' + desc + (detalhe ? '\n         ' + detalhe : '')); }
}
function eq(desc, achado, esperado){
  ok(desc, JSON.stringify(achado) === JSON.stringify(esperado), 'esperado ' + JSON.stringify(esperado) + ', veio ' + JSON.stringify(achado));
}

const db = new Database(path.join(tmp, 't.db'));
db.exec(`CREATE TABLE skus (codigo TEXT PRIMARY KEY, largura_cm INT, altura_cm INT,
    cor_codigo TEXT, cor TEXT, tecido_codigo TEXT, modelo_id INT, estoque INT DEFAULT 0);
  INSERT INTO skus (codigo,estoque) VALUES ('BK160140BEGE',30);
  CREATE TABLE config (chave TEXT PRIMARY KEY, valor TEXT);`);

/* Quem está logado e o que pode: o teste troca a cada caso. */
let usuario = { id:1, nome:'Expedição' };
let podeHorario = true, nivel = 'operacao';
const app = express(); app.use(express.json({ limit:'5mb' }));
app.locals.acesso = {
  auditar(){},
  podePermissao(u, chave){ return !!u && chave === 'coleta.horario' && podeHorario; },
  nivelDaPessoa(){ return nivel; }
};
app.use((req,res,next)=>{ req.usuario = usuario; next(); });
require('./exp_route')(app, db);
let carregou = true;
try{ require('./coleta_horario_route')(app, db); }catch(e){ carregou = false; console.log('  (coleta_horario_route.js: ' + e.message + ')'); }
require('./st_route')(app, db);
let D = null; try{ D = require('./coleta_horario'); }catch(e){}

let seq = 500;
function vol(extra){
  seq++;
  return Object.assign({ sku:'BK160140BEGE', packId:'20000146'+seq, venda:'20000180'+seq, cor:'Bege',
    buyer:'Cliente '+seq, city:'Jundiaí', nf:String(9000+seq), codes:[], labelPage:0, danfePage:1,
    descricao:null, despacharEm:'2026-11-05', modalidade:'coleta', despachoLinha:null,
    conflito:null, itens:null, folhaNaoFecha:null }, extra||{});
}
const volume = venda => db.prepare('SELECT * FROM lote WHERE venda=?').get(venda);

async function main(){
  const srv = app.listen(0); await new Promise(r => srv.once('listening', r));
  const base = 'http://127.0.0.1:' + srv.address().port;
  async function req(metodo, rota, corpo){
    const r = await fetch(base + rota, { method:metodo, headers:{'Content-Type':'application/json'},
      body: corpo === undefined ? undefined : JSON.stringify(corpo) });
    let b = null; try{ b = await r.json(); }catch(e){}
    return { status:r.status, body:b || {} };
  }
  const subir = (volumes, extra) => { proximos = volumes;
    return req('POST', '/api/lote/upload', Object.assign({ pdf:'data:application/pdf;base64,' + Buffer.from('%PDF-t').toString('base64') }, extra||{})); };
  const lancar = (corpo) => req('POST', '/api/saidas/dia', corpo);
  const dia = d => req('GET', '/api/saidas/dia?data=' + d);

  try{
    ok('o módulo coleta_horario_route.js existe e sobe', carregou);
    ok('o domínio coleta_horario.js existe', !!D);
    RELOGIO.fixar('2026-11-05 06:50');   // quinta-feira, antes da primeira coleta

    console.log('\n── 1. o horário é da DATA: 0 a 3 coletas, janela e corte ──');
    let r = await lancar({ data:'2026-11-05', origem:'tela', coletas:[
      { inicio:'15:00', fim:'17:00', corte:'13:00' }, { inicio:'12:00', fim:'14:00', corte:'10:00' } ] });
    eq('lançar a quinta responde 200', r.status, 200);
    r = await dia('2026-11-05');
    eq('as coletas saem ordenadas pela hora (Coleta 1 = a mais cedo)', (r.body.coletas||[]).map(c => c.ordem + ' ' + c.inicio + '-' + c.fim + ' ' + c.corte),
      ['1 12:00-14:00 10:00', '2 15:00-17:00 13:00']);
    ok('o dia diz que foi lançado', r.body.lancado === true);
    r = await lancar({ data:'2026-11-06', origem:'tela', coletas:[
      { inicio:'11:15', fim:'13:15', corte:'07:15' }, { inicio:'15:00', fim:'17:00', corte:'11:00' } ] });
    eq('a sexta tem os seus, sem mexer na quinta', r.status, 200);
    eq('a quinta continua com as duas', ((await dia('2026-11-05')).body.coletas||[]).length, 2);
    r = await lancar({ data:'2026-11-07', origem:'tela', coletas:[{ inicio:'09:00', fim:'11:00' }] });
    eq('o sábado entra (D2), e o corte é opcional', r.status, 200);
    r = await lancar({ data:'2026-11-09', origem:'tela', coletas:[
      { inicio:'09:00', fim:'10:00' }, { inicio:'11:00', fim:'12:00' }, { inicio:'13:00', fim:'14:00' }, { inicio:'15:00', fim:'16:00' } ] });
    eq('quatro coletas num dia é recusado', r.status, 400);
    r = await lancar({ data:'2026-11-09', origem:'tela', coletas:[{ inicio:'14:00', fim:'12:00' }] });
    eq('janela com o fim antes do início é recusada', r.status, 400);
    r = await lancar({ data:'2026-11-09', origem:'tela', coletas:[{ inicio:'12:00', fim:'14:00', corte:'12:30' }] });
    eq('corte depois do início da janela é recusado', r.status, 400);
    r = await lancar({ data:'2026-11-09', origem:'tela', coletas:[{ inicio:'9h', fim:'14:00' }] });
    eq('hora fora do formato HH:MM é recusada', r.status, 400);
    r = await lancar({ data:'2026-11-04', origem:'tela', coletas:[{ inicio:'12:00', fim:'14:00' }] });
    eq('dia que já passou não se edita (R-HCO-08)', r.status, 400);
    eq('e nada foi gravado no dia passado', ((await dia('2026-11-04')).body.coletas||[]).length, 0);

    console.log('\n── 2. lançar de novo substitui, e a história fica ──');
    const antes = (await dia('2026-11-05')).body.coletas;
    const c12 = antes[0], c15 = antes[1];
    r = await lancar({ data:'2026-11-05', origem:'upload', coletas:[
      { id:c12.id, inicio:'12:30', fim:'14:30' }, { id:c15.id, inicio:'15:00', fim:'17:00' } ] });
    eq('relançar pelo upload responde 200', r.status, 200);
    let d = (await dia('2026-11-05')).body.coletas;
    eq('a coleta corrigida mantém o mesmo id (as caixas continuam ligadas)', d[0].id, c12.id);
    eq('o corte que não veio é preservado (ausente não é vazio)', d[0].corte, '10:00');
    ok('e, com a janela mudada, fica "a conferir" (R-HCO-07)', d[0].corte_conferir === 1);
    ok('a coleta que não mudou não fica a conferir', d[1].corte_conferir === 0);
    r = await lancar({ data:'2026-11-05', origem:'tela', coletas:[
      { id:c12.id, inicio:'12:30', fim:'14:30', corte:'10:30' }, { id:c15.id, inicio:'15:00', fim:'17:00' } ] });
    d = (await dia('2026-11-05')).body.coletas;
    ok('lançar o corte tira o "a conferir"', d[0].corte === '10:30' && d[0].corte_conferir === 0);
    r = await req('GET', '/api/saidas/historia?data=2026-11-05');
    const hist = r.body.eventos || [];
    eq('a história tem as três mudanças da quinta', hist.length, 3);
    ok('cada mudança diz quem e por onde', hist.every(e => e.usuario_id === 1 && e.usuario_nome === 'Expedição' && (e.origem === 'tela' || e.origem === 'upload')));
    ok('e guarda o antes e o depois', hist.some(e => /12:00/.test(JSON.stringify(e.antes)) && /12:30/.test(JSON.stringify(e.depois))));
    r = await lancar({ data:'2026-11-05', origem:'tela', coletas:[
      { id:c12.id, inicio:'12:30', fim:'14:30', corte:'10:30' }, { id:c15.id, inicio:'15:00', fim:'17:00' } ] });
    eq('lançar igual não cria evento novo', ((await req('GET', '/api/saidas/historia?data=2026-11-05')).body.eventos||[]).length, 3);

    console.log('\n── 3. vazio não é "sem coleta" ──');
    r = await dia('2026-11-10');
    ok('dia sem lançamento diz "não lançado"', r.body.lancado === false && r.body.sem_coleta === false);
    r = await lancar({ data:'2026-11-10', origem:'tela', sem_coleta:true });
    r = await dia('2026-11-10');
    ok('"hoje não tem coleta" é marcação feita por alguém', r.body.lancado === true && r.body.sem_coleta === true);
    r = await lancar({ data:'2026-11-11', origem:'tela', sem_coleta:true, coletas:[{ inicio:'12:00', fim:'14:00' }] });
    eq('"sem coleta" junto com coleta é recusado', r.status, 400);

    console.log('\n── 4. o PDF diz a saída (D4) ──');
    const hoje = vol({ venda:'V-HOJE-1' }), hoje2 = vol({ venda:'V-HOJE-2', despacharEm:null });
    const futura = vol({ venda:'V-FUT', despacharEm:'2026-11-12' });
    const agencia = vol({ venda:'V-AG', modalidade:'agencia' });
    r = await subir([hoje, hoje2, futura, agencia], { saida:c12.id });
    eq('o upload com a saída responde 200', r.status, 200);
    eq('a venda de hoje ganha a coleta', volume('V-HOJE-1').horario_id, c12.id);
    eq('a sem data também (volume invisível é pior que cedo demais)', volume('V-HOJE-2').horario_id, c12.id);
    eq('a futura NÃO ganha a coleta de hoje', volume('V-FUT').horario_id, null);
    eq('a de agência num PDF de coleta não ganha a marca (R-MOD-01 não muda)', volume('V-AG').horario_id, null);
    eq('a modalidade continua a da etiqueta', volume('V-AG').modalidade, 'agencia');
    eq('a resposta diz quantas marcou', r.body.saida && r.body.saida.marcadas, 2);
    eq('quantas ficaram de fora por serem de outro dia', r.body.saida && r.body.saida.outro_dia, 1);
    eq('e quantas por serem de outra modalidade', r.body.saida && r.body.saida.outra_modalidade, 1);
    r = await subir([vol({ venda:'V-HOJE-1', packId:hoje.packId })], { saida:c15.id });
    eq('a venda repetida não ganha marca nova', volume('V-HOJE-1').horario_id, c12.id);
    r = await subir([vol({ venda:'V-SEM' })]);
    eq('subir sem escolher passa (D1)', r.status, 200);
    eq('e a venda fica sem coleta marcada', volume('V-SEM').horario_id, null);
    ok('e a resposta avisa', r.body.saida && r.body.saida.sem_saida === true);
    r = await subir([vol({ venda:'V-ERRADA' })], { saida:999999 });
    eq('saída que não existe é recusada', r.status, 400);
    eq('e nada foi gravado', volume('V-ERRADA'), undefined);
    const sexta = (await dia('2026-11-06')).body.coletas[0];
    r = await subir([vol({ venda:'V-SEXTA' })], { saida:sexta.id });
    eq('saída de outro dia é recusada', r.status, 400);
    podeHorario = false;
    r = await subir([vol({ venda:'V-SEMPERM' })], { saida:c15.id });
    eq('sem coleta.horario o upload passa', r.status, 200);
    eq('mas a escolha é ignorada', volume('V-SEMPERM').horario_id, null);
    ok('e a resposta DIZ que ignorou', r.body.saida && r.body.saida.ignorada === 'sem_permissao');
    podeHorario = true;

    console.log('\n── 5. o relógio da coleta (fase 2) ──');
    // a caixa V-HOJE-2 foi impressa; a V-HOJE-1 continua para imprimir
    db.prepare("UPDATE lote SET estagio='embalado', embalado_em='2026-11-05 07:00' WHERE venda='V-HOJE-2'").run();
    r = await req('GET', '/api/saidas/status');
    eq('o status responde 200', r.status, 200);
    let s = r.body;
    eq('a próxima é a das 12:30', s.proxima && s.proxima.inicio, '12:30');
    eq('falta até o INÍCIO da janela (06:50 → 12:30)', s.proxima && s.proxima.minutos, 340);
    eq('por imprimir desta coleta', s.proxima && s.proxima.por_imprimir, 1);
    eq('por conferir desta coleta', s.proxima && s.proxima.por_conferir, 1);
    eq('a sem marca de hoje aparece à parte (V-SEM e V-SEMPERM)', s.sem_marca && s.sem_marca.por_imprimir, 2);
    RELOGIO.fixar('2026-11-05 13:00');
    s = (await req('GET', '/api/saidas/status')).body;
    eq('dentro da janela, a coleta está "na janela"', s.proxima && s.proxima.estado, 'janela');
    RELOGIO.fixar('2026-11-05 14:31');
    s = (await req('GET', '/api/saidas/status')).body;
    eq('depois do fim, a próxima passa a ser a das 15:00', s.proxima && s.proxima.inicio, '15:00');
    eq('com 29 minutos', s.proxima && s.proxima.minutos, 29);
    RELOGIO.fixar('2026-11-05 17:30');
    s = (await req('GET', '/api/saidas/status')).body;
    ok('depois da última: "coletas de hoje encerradas"', s.proxima === null && s.encerradas === true);
    RELOGIO.fixar('2026-11-05 08:00');
    r = await lancar({ data:'2026-11-05', origem:'tela', coletas:[{ id:c15.id, inicio:'15:00', fim:'17:00' }] });
    eq('tirar a coleta que tem caixas passa', r.status, 200);
    s = (await req('GET', '/api/saidas/status')).body;
    eq('e as caixas dela vão para "sem coleta marcada"', s.sem_marca && s.sem_marca.por_imprimir, 3);
    RELOGIO.fixar('2026-11-10 08:00');
    s = (await req('GET', '/api/saidas/status')).body;
    ok('dia marcado sem coleta diz isso', s.sem_coleta === true && s.proxima === null);
    RELOGIO.fixar('2026-11-12 08:00');
    s = (await req('GET', '/api/saidas/status')).body;
    ok('dia sem lançamento diz "não lançado", sem alarme', s.lancado === false && s.proxima === null);
    ok('quem é Operação não vê a faixa em toda tela', s.em_toda_tela === false);
    nivel = 'supervisor';
    s = (await req('GET', '/api/saidas/status')).body;
    ok('quem é Supervisor vê a faixa em toda tela (D5)', s.em_toda_tela === true);
    nivel = 'operacao';

    console.log('\n── 6. a agência (D6) ──');
    RELOGIO.fixar('2026-11-05 08:00');
    db.prepare("INSERT INTO config (chave,valor) VALUES ('despacho_qui','15:00')").run();
    r = await lancar({ data:'2026-11-05', origem:'upload', agencia:{ fim:'14:00' } });
    eq('lançar a agência responde 200', r.status, 200);
    eq('as coletas de antes ficam (campo ausente não apaga)', ((await dia('2026-11-05')).body.coletas||[]).length, 1);
    s = (await req('GET', '/api/saidas/status')).body;
    eq('o status traz a agência lançada', s.agencia && s.agencia.fim, '14:00');
    r = await req('GET', '/api/expedicao/status');
    eq('o relógio da agência usa o horário lançado', r.body.despacho, '14:00');
    ok('e diz de onde veio', r.body.despacho_origem === 'lancado');
    r = await lancar({ data:'2026-11-05', origem:'tela', agencia:null });
    r = await req('GET', '/api/expedicao/status');
    eq('sem horário lançado, volta o config de sempre', r.body.despacho, '15:00');
    const ag = (await lancar({ data:'2026-11-05', origem:'upload', agencia:{ fim:'14:00' } }), (await dia('2026-11-05')).body.agencia);
    r = await subir([vol({ venda:'V-AG2', modalidade:'agencia' }), vol({ venda:'V-CO2' })], { saida:ag.id });
    eq('PDF de agência marca a venda de agência', volume('V-AG2').horario_id, ag.id);
    eq('e não marca a de coleta', volume('V-CO2').horario_id, null);

    console.log('\n── 7. sem login nada grava, e a alçada ──');
    usuario = null;
    const antesN = db.prepare('SELECT COUNT(*) n FROM saida_horario').get().n;
    r = await lancar({ data:'2026-11-13', origem:'tela', coletas:[{ inicio:'12:00', fim:'14:00' }] });
    eq('lançar sem login é 401', r.status, 401);
    eq('e nada foi gravado', db.prepare('SELECT COUNT(*) n FROM saida_horario').get().n, antesN);
    usuario = { id:1, nome:'Expedição' };
    const M = require('./telas');
    const t = M.porNumero(206);
    ok('a tela 206 está no mapa', !!t && t.rota === '/coleta-horarios' && t.nivel === 'operacao');
    eq('e abre com coleta.horario', t && t.perms, ['coleta.horario']);
    const P = require('./permissoes');
    const lista = P.PERMISSOES || P.permissoes || P;
    const pc = (Array.isArray(lista) ? lista : []).find(p => p.chave === 'coleta.horario');
    ok('coleta.horario existe, nível Operação, na tela 206, não sensível', !!pc && pc.nivel === 'operacao' && pc.tela === 206 && !pc.sensivel);
    const auth = fs.readFileSync(path.join(__dirname, 'auth.js'), 'utf8');
    ok('a tela 206 está na lista protegida do auth.js (sem sessão, 302)', /'\/coleta-horarios':/.test(auth));
    const srvTxt = fs.readFileSync(path.join(__dirname, 'server.js'), 'utf8');
    ok('server.js sobe o coleta_horario_route', /require\('\.\/coleta_horario_route'\)\(app, db\)/.test(srvTxt));
    ok('e serve a tela', /'\/coleta-horarios'/.test(srvTxt));
    const ac = fs.readFileSync(path.join(__dirname, 'acesso.js'), 'utf8');
    ok('as rotas de escrita dos horários pedem coleta.horario', /\/api\/saidas[\s\S]{0,200}coleta\.horario/.test(ac));
  }catch(e){
    falhas++; console.log('  ESTOUROU — ' + (e.stack || e));
  }finally{
    RELOGIO.fixar(null);
    srv.close();
  }
  console.log('\n' + (casos - falhas) + ' ok, ' + falhas + ' falha(s)\n');
  process.exit(falhas ? 1 : 0);
}
main();

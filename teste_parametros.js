#!/usr/bin/env node
/* teste_parametros.js — A 906 PARÂMETROS (spec ARRUMAR-O-LUGAR, fase 3).
 *
 *   node teste_parametros.js
 *
 * Quatro ajustes espalhados vão para uma tela só, a 906 Parâmetros
 * (Administração · Comum, nível Supervisor — decisão do dono, 11/11/2026):
 *   - o segundo bipe na Conferência (era um card da 902; muda quem é nível Admin);
 *   - os horários de corte e despacho por dia da semana (a rota existia e não
 *     tinha tela — dívida 18; `horarios.editar`);
 *   - os parâmetros do plano de corte do sob medida (era a aba Parâmetros da 606;
 *     `sobmedida.parametro.editar`);
 *   - os números do prazo e os feriados do sob medida (era o card da 610).
 * A prévia "Enviando agora: pronto na …" FICA na 610, só leitura (decisão do
 * dono: é o vendedor dizendo o prazo à revenda, assunto comercial).
 * E o horário impossível deixa de ser descartado calado: 400 dizendo o dia, sem
 * gravar nada.
 */
const fs = require('fs'), path = require('path');
const Database = require('better-sqlite3');
const M = require('./telas');
const MO = require('./modulos');
const PERMISSOES = require('./permissoes');
const P = require('./perfis_acesso');

let n = 0, falhas = 0;
function ok(desc, cond, detalhe){
  n++;
  if(cond) console.log('  ok  ' + n + ' — ' + desc);
  else { falhas++; console.log('  FALHOU ' + n + ' — ' + desc + (detalhe ? '\n         ' + detalhe : '')); }
}
const ler = f => fs.readFileSync(path.join(__dirname, f), 'utf8');
const existe = f => fs.existsSync(path.join(__dirname, f));

const ABRE = ['horarios.editar','sobmedida.parametro.ler','sobmedida.parametro.editar','@admin'];

console.log('\n── 1. a 906 no mapa ──');
const t = M.porNumero(906);
ok('a 906 existe, em /parametros', !!t && t.rota === '/parametros', JSON.stringify(t && t.rota));
if(t){
  ok('   Administração · Comum, nível Supervisor', t.modulo === 'administracao' && t.bloco === 'comum' && t.nivel === 'supervisor',
    JSON.stringify({ modulo:t.modulo, bloco:t.bloco, nivel:t.nivel }));
  ok('   abre com as chaves de cada parte (horários, parâmetros do sob medida, nível Admin para o segundo bipe)',
    JSON.stringify(t.perms.slice().sort()) === JSON.stringify(ABRE.slice().sort()), JSON.stringify(t.perms));
  ok('   diz a que se liga (202, 201/206, 602, 609–611)', Array.isArray(t.liga) && [202, 206, 602, 610].every(x => t.liga.indexOf(x) >= 0), JSON.stringify(t.liga));
  ok('   sem dinheiro, sem `valor`', !t.valor);
  ok('   o número cai na faixa do módulo', MO.moduloDaFaixa(906) === 'administracao');
}

console.log('\n── 2. o que saiu dos lugares antigos ──');
const t902 = M.porNumero(902);
ok('a 902 não tem mais a parte de horários', !(t902.partes || []).some(x => x.id === 'horarios'), JSON.stringify(t902.partes));
ok('a 902 não abre mais com horarios.editar (não havia nada de horário nela)', t902.perms.indexOf('horarios.editar') < 0, JSON.stringify(t902.perms));
const INDEX = ler('public/index.html');
ok('a 902 não desenha mais o card do segundo bipe', !/cdConf/.test(INDEX) && !/Segundo bipe na Confer/.test(INDEX));
ok('o que estava fora do lugar acabou (a lista está vazia)', MO.FORA_DO_LUGAR.length === 0, MO.FORA_DO_LUGAR.map(f => f.item).join(', '));
const CAD = ler('tecido/public/telas/cadastros.html');
ok('a 606 não tem mais a aba Parâmetros', !/id:'parametro'/.test(CAD) && !/function telaParametro/.test(CAD) && !/\/api\/parametros/.test(CAD));
const REV = ler('tecido/public/telas/revendas.html');
ok('a 610 continua com a prévia do prazo, só leitura ("Enviando agora: pronto na …")', /Enviando agora: pronto na/.test(REV) && /\/api\/prazo/.test(REV));
ok('a 610 não muda mais número do prazo nem feriado (sem PUT, POST ou DELETE)', !/\/api\/parametros\//.test(REV) && !/metodo:'(POST|DELETE)'[^\n]*feriad|\/api\/feriados[^\n]*metodo/.test(REV) && !/abertaId='par'/.test(REV));
/* ③ REVISÃO: o vendedor (revenda.ler, nível Operação) LIA os números do prazo e
   os feriados na 610, e não abre a 906 — eles continuam ali, só leitura. */
ok('a 610 continua MOSTRANDO os números do prazo e os feriados, só leitura (o vendedor não abre a 906)', /Os quatro números do prazo/.test(REV) && /api\('\/api\/feriados'\)/.test(REV));
ok('a 610 diz onde se mudam (a 906) só a quem tem a parametro.editar', /posso\('parametro\.editar'\)[^\n]*906|906[^\n]*posso\('parametro\.editar'\)/.test(REV) || /if\(posso\('parametro\.editar'\)\)[\s\S]{0,200}906/.test(REV));

console.log('\n── 3. a caixinha de cada ação na tela de Acessos ──');
const info = {}; PERMISSOES.forEach(p => info[p.chave] = p);
ok('horarios.editar aparece pendurada na 906', info['horarios.editar'] && info['horarios.editar'].tela === 906, JSON.stringify(info['horarios.editar'] && info['horarios.editar'].tela));
ok('sobmedida.parametro.editar aparece pendurada na 906', info['sobmedida.parametro.editar'] && info['sobmedida.parametro.editar'].tela === 906,
  JSON.stringify(info['sobmedida.parametro.editar'] && info['sobmedida.parametro.editar'].tela));
ok('sobmedida.parametro.ler aparece na 602 Corte (é o Corte e as Sobras que leem os parâmetros)', info['sobmedida.parametro.ler'] && info['sobmedida.parametro.ler'].tela === 602,
  JSON.stringify(info['sobmedida.parametro.ler'] && info['sobmedida.parametro.ler'].tela));
ok('nenhuma chave mudou de nome ou de nível (#13)', info['horarios.editar'].nivel === 'admin' && info['sobmedida.parametro.editar'].nivel === 'supervisor'
  && info['sobmedida.parametro.ler'].nivel === 'operacao', JSON.stringify(['horarios.editar','sobmedida.parametro.editar','sobmedida.parametro.ler'].map(c => info[c] && info[c].nivel)));

console.log('\n── 4. a tela ──');
ok('public/parametros.html existe', existe('public/parametros.html'));
const PAG = existe('public/parametros.html') ? ler('public/parametros.html') : '';
ok('carrega o nav.js da medida padrão (barra de sessão e ☰ Menu)', /<script src="\/nav\.js"/.test(PAG));
ok('o servidor serve /parametros', /app\.get\('\/parametros'/.test(ler('server.js')));
ok('o auth.js protege /parametros e /parametros.html (tela fora do /admin/, #3)', /'\/parametros':/.test(ler('auth.js')) && /'\/parametros\.html':/.test(ler('auth.js')));
ok('horários: lê e grava pela rota de sempre', /\/api\/config\/horarios/.test(PAG) && /horarios\.editar/.test(PAG));
ok('segundo bipe: lê e grava pela rota de sempre, e só nível Admin muda', /\/api\/config\/conferencia/.test(PAG) && /nivel_admin/.test(PAG));
ok('parâmetros do corte e o prazo: pela rota do sob medida, sem conta própria', /\/sobmedida\/api\/parametros/.test(PAG) && /\/sobmedida\/api\/prazo/.test(PAG));
ok('feriados: pela rota do sob medida (listar, cadastrar, apagar)', /\/sobmedida\/api\/feriados/.test(PAG) && /DELETE/.test(PAG));
ok('cada parte só aparece para quem tem a chave dela', /sobmedida\.parametro\.ler/.test(PAG) && /sobmedida\.parametro\.editar/.test(PAG));
ok('③ REVISÃO: o parâmetro de tipo texto (a hora do corte do prazo) vai como TEXTO, e quem recusa é o servidor', /tipo\s*===\s*'numero'/.test(PAG) && /data-tipo/.test(PAG));
ok('③ REVISÃO: o horário recusado fica marcado no campo, e não só na mensagem', /partHorarios[\s\S]*classList\.add\('erro'\)[\s\S]*function partBipe/.test(PAG));
ok('③ REVISÃO: o card do sob medida não se chama "plano de corte" (ele lista etiqueta, rolo, crédito…)', !/parâmetros do plano de corte<\/h2>/.test(PAG));
ok('③ REVISÃO r2: o redesenho depois de salvar devolve o que estava digitado e não salvo nas outras linhas (§12)', /function guardarDigitado/.test(PAG) && /function devolverDigitado/.test(PAG) && /redesenharSm[\s\S]{0,400}guardarDigitado[\s\S]{0,400}devolverDigitado/.test(PAG));
ok('③ REVISÃO r3: o campo devolvido volta marcado como não salvo', /Não salvo — clique em Salvar/.test(PAG));
ok('③ REVISÃO r2: o parâmetro de texto vazio é recusado na tela (como a 606 recusava)', /data-tipo|dataset\.tipo/.test(PAG) && /Não deixe o campo vazio/.test(PAG));
ok('o /api/telas/minhas diz se a pessoa é de nível Admin (o segundo bipe)', /nivel_admin/.test(ler('admin_telas.js')));
ok('nenhum texto proibido (chefia, dono…)', !/\b(chefia|chefe|patr[aã]o|gest[aã]o)\b/i.test(PAG.replace(/<!--[\s\S]*?-->/g,'').replace(/\/\*[\s\S]*?\*\//g,'')));

console.log('\n── 5. o horário impossível é recusado, e nada grava ──');
{
  const db = new Database(':memory:');
  db.exec("CREATE TABLE config (chave TEXT PRIMARY KEY, valor TEXT); CREATE TABLE auditoria (id INTEGER PRIMARY KEY, quando TEXT, usuario_id INTEGER, usuario TEXT, acao TEXT, alvo TEXT, detalhe TEXT)");
  db.prepare("INSERT INTO config VALUES ('corte_seg','10:30'),('despacho_seg','15:00')").run();
  const rotas = {};
  const app = { get(p, ...h){ rotas['GET ' + p] = h[h.length - 1]; }, post(p, ...h){ rotas['POST ' + p] = h[h.length - 1]; } };
  require('./st_route')(app, db);
  const chamar = (corpo) => new Promise(res => {
    const r = { statusCode:200, status(c){ this.statusCode = c; return this; }, json(o){ res({ s:this.statusCode, o }); } };
    rotas['POST /api/config/horarios']({ body:corpo, usuario:{ id:1, nome:'Teste' }, method:'POST', path:'/api/config/horarios' }, r);
  });
  const val = k => (db.prepare('SELECT valor FROM config WHERE chave=?').get(k) || {}).valor;
  (async () => {
    let r = await chamar({ seg:{ corte:'11:00', despacho:'25:99' } });
    ok('hora impossível (25:99) é 400', r.s === 400, JSON.stringify(r));
    ok('   …e a recusa diz o dia e o campo', /segunda/i.test(r.o.erro || '') && /despacho/i.test(r.o.erro || ''), r.o.erro);
    ok('   …e nada grava, nem o campo certo do mesmo envio', val('corte_seg') === '10:30' && val('despacho_seg') === '15:00', JSON.stringify([val('corte_seg'), val('despacho_seg')]));
    r = await chamar({ ter:{ corte:'9h' } });
    ok('hora fora do formato (9h) é 400', r.s === 400, JSON.stringify(r));
    r = await chamar({ seg:{ corte:'11:00' } });
    ok('hora certa grava (o campo ausente fica como estava)', r.s === 200 && val('corte_seg') === '11:00' && val('despacho_seg') === '15:00', JSON.stringify([r, val('corte_seg'), val('despacho_seg')]));
    let r2; try{ r2 = await chamar({ seg:'10:30' }); }catch(e){ r2 = { s:500, o:{ erro:e.message } }; }
    ok('③ REVISÃO: o dia que não vem como objeto é 400 (não estoura)', r2.s === 400 && val('corte_seg') === '11:00', JSON.stringify(r2));
    r = await chamar({ seg:{ corte:'' } });
    ok('campo vazio não apaga o horário (é recusado, dizendo o dia)', r.s === 400 && val('corte_seg') === '11:00', JSON.stringify(r));
    db.close();
    pessoas();
  })().catch(e => { ok('a rota não estoura', false, e.stack); fim(); });
}

function pessoas(){
  console.log('\n── 6. pessoa a pessoa: quem via ou mudava uma parte abre a 906 ──');
  const B = P.montar();
  try{
    for(const p of B.pessoas){
      const u = B.db.prepare('SELECT * FROM usuarios WHERE id=?').get(p.id);
      const ps = B.AC.permissoesDe(u.id);
      const ag = B.AC.ehAdminGeral(u.id);
      const admin = ag || B.AC.ehNivelAdmin(u.id);
      /* ANTES: o segundo bipe — quem abria a 902 via o card, e só quem é nível
         Admin mudava (POST '@admin'); os horários — horarios.editar, pela rota;
         os parâmetros do sob medida — quem abria a 606; o calendário — quem
         abria a 610 e tinha a parametro.editar. */
      const antes = B.AC.decidir(u, '/admin/cadastros', 'GET').ok || admin || ps.has('horarios.editar')
        || ps.has('sobmedida.parametro.editar') || ps.has('sobmedida.parametro.ler') && ps.has('sobmedida.cadastro.editar');
      const abre = B.AC.decidir(u, '/parametros', 'GET').ok;
      /* O GANHO ACEITO, e nomeado: quem é nível Supervisor ou acima e tem a
         `sobmedida.parametro.ler` abre a 906 só para ler — os parâmetros que a
         rota já lhe entregava. */
      const nv = B.AC.nivelDaPessoa ? B.AC.nivelDaPessoa(u.id) : null;
      const ganho = abre && !antes && ps.has('sobmedida.parametro.ler');
      ok(p.nome + ': abre a 906 onde via ou mudava uma parte', antes === abre || ganho, JSON.stringify({ antes, abre, nv }));
    }
  }finally{ B.fechar(); }
  fim();
}

function fim(){
  console.log('\n' + (falhas ? 'FALHOU: ' + falhas + ' de ' + n : 'OK: ' + n + ' casos'));
  process.exit(falhas ? 1 : 0);
}

#!/usr/bin/env node
/* teste_pendencias.js — a central de pendências, fase 1 (spec
 * docs/specs/CENTRAL-DE-PENDENCIAS.md, 27/10/2026).
 *
 *   node teste_pendencias.js
 *
 * O dono, em 27/10/2026: "essas pendências e esses tipos de problemas devemos
 * concentrar em apenas uma única tela, para não ficar o problema espalhado".
 * A fase 1 põe no topo da aba Pendências (a antiga Bloqueados) o número de cada
 * lugar onde uma pessoa tem algo a decidir.
 *
 * O que este arquivo trava:
 *   1. cada linha da central diz o MESMO número que a tela dona, no mesmo banco
 *      — pela rota da tela, e não por uma conta copiada;
 *   2. resolvida na tela dona, a pendência sai da central;
 *   3. a cancelada que está nas duas portas (Mesa e ↩ Sobrou) conta uma vez
 *      no total;
 *   4. a central manda só números: nenhum SKU, cliente ou saldo viaja;
 *   5. a linha que não consegue contar diz isso, e não vira zero;
 *   6. nenhuma conta mora no domínio da central (ele não tem SQL);
 *   7. a rota é declarada `@admin`, e a tela chama a rota.
 *
 * Banco novo de verdade (db.js) com os módulos de rota de verdade.
 */
const fs = require('fs'), os = require('os'), path = require('path');
const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'pcp-pendencias-'));
process.env.PCP_DIR = tmp;

let casos = 0, falhas = 0;
function ok(desc, cond, detalhe){
  casos++;
  if(cond) console.log('  ok  ' + casos + ' — ' + desc);
  else { falhas++; console.log('  FALHOU ' + casos + ' — ' + desc + (detalhe ? '\n         ' + detalhe : '')); }
}
function eq(desc, achado, esperado){
  ok(desc, achado === esperado, 'esperado ' + JSON.stringify(esperado) + ', veio ' + JSON.stringify(achado));
}

const express = require('express');
const app = express(); app.use(express.json());
const db = require('./db.js');
/* Sem o auth: aqui se confere a CONTA. Quem chama é uma pessoa que não contou
   nada (a recontagem da tela esconde de quem contou). */
app.use((req,res,next) => { req.usuario = { id:999, nome:'Quem Olha', areas:['admin'] }; next(); });
const MODULOS = ['sku_cad_route','exp_route','mont_route','carreg_route','saida_route','est_route',
  'cont_route','inventario_route','ajuste_route','correcao_route','dev_route','cad_route','sku_route',
  'compras_route','pendencias_route'];
const quebrados = [];
for(const m of MODULOS){ try{ require('./' + m)(app, db); }catch(e){ quebrados.push(m + ': ' + e.message); } }
require('./acesso')(app, db);
const AC = app.locals.acesso;
/* A pessoa que olha pode tudo nas telas donas: a Mesa recusa sem a permissão
   dela, e uma recusa compararia a central com um erro. */
AC.podePermissao = () => true;

let srv, base;
async function get(url){ const r = await fetch(base + url); return r.json(); }
async function post(url, corpo){
  const r = await fetch(base + url, { method:'POST', headers:{ 'Content-Type':'application/json' }, body:JSON.stringify(corpo) });
  return { status:r.status, corpo:await r.json() };
}
const linha = (r, chave) => (r.linhas || []).find(l => l.chave === chave) || {};

function semear(){
  /* Um SKU de nome reconhecível: se ele aparecer no JSON da central, vazou detalhe. */
  db.prepare("INSERT OR IGNORE INTO skus (codigo, estoque) VALUES ('BKCENTRAL999', 5)").run();
  // devoluções: duas esperando a baixa, uma já baixada
  const dev = db.prepare("INSERT INTO devolucao (codigo_ml, sku_fisico, buyer, baixado, recebido_em) VALUES (?,?,?,?,?)");
  dev.run('ML1', 'BKCENTRAL999', 'Cliente Secreto', 0, '2026-10-20 10:00:00');
  dev.run('ML2', 'BKCENTRAL999', 'Cliente Secreto', 0, '2026-10-25 10:00:00');
  dev.run('ML3', 'BKCENTRAL999', 'Cliente Secreto', 1, '2026-10-01 10:00:00');
  // contagem de material: uma esperando, uma aprovada
  const cp = db.prepare("INSERT INTO contagem_pendente (sessao, codigo, contado, operacao, contado_por, aprovado, criado_em) VALUES (?,?,?,?,?,?,?)");
  cp.run('s1', 'BKCENTRAL999', 3, 'set', 'Alguém', 0, '2026-10-22 08:00:00');
  cp.run('s1', 'BKCENTRAL999', 4, 'set', 'Alguém', 1, '2026-10-22 08:00:00');
  // ajuste de saldo: um pendente, um aprovado
  const aj = db.prepare("INSERT INTO ajuste_pedido (codigo, delta, saldo_no_pedido, motivo, pedido_por, status, pedido_em) VALUES (?,?,?,?,?,?,?)");
  aj.run('BKCENTRAL999', -1, 5, 'Perda', 'Fulano', 'pendente', '2026-10-23 09:00:00');
  aj.run('BKCENTRAL999', -1, 5, 'Perda', 'Fulano', 'aprovado', '2026-10-01 09:00:00');
  // inventário: ciclo aberto com uma para aprovar, duas para recontar e uma a contar;
  // ciclo fechado com uma "recontar" velha que não espera ninguém
  const ab = db.prepare("INSERT INTO inventario_ciclo (tipo, status) VALUES ('dia','aberto')").run().lastInsertRowid;
  const fe = db.prepare("INSERT INTO inventario_ciclo (tipo, status) VALUES ('dia','fechado')").run().lastInsertRowid;
  const it = db.prepare("INSERT INTO inventario_item (ciclo_id, codigo, status, contado1, saldo_na_contagem, por1, em1) VALUES (?,?,?,?,?,?,?)");
  it.run(ab, 'BKCENTRAL999', 'aprovar', 3, 5, 'Outro', '2026-10-24 10:00:00');
  it.run(ab, 'BKOUTRO1', 'recontar', 3, 5, 'Outro', '2026-10-24 10:00:00');
  it.run(ab, 'BKOUTRO2', 'terceira', 3, 5, 'Outro', '2026-10-24 11:00:00');
  it.run(ab, 'BKOUTRO3', 'a_contar', null, null, null, null);
  it.run(fe, 'BKOUTRO4', 'recontar', 3, 5, 'Outro', '2026-09-01 10:00:00');
  // lote: um pendente vencido (Mesa) e uma cancelada depois da etiqueta que está na fábrica (Mesa + ↩ Sobrou)
  db.prepare(`INSERT INTO lote (data, codigo, buyer, nf, estagio, despachar_em, teste)
    VALUES ('2026-10-01','BKCENTRAL999','Cliente Secreto','9001','pendente','2026-10-02',0)`).run();
  db.prepare(`INSERT INTO lote (data, codigo, buyer, nf, estagio, cancelada_estagio, cancelada_em, embalado_em, teste)
    VALUES ('2026-10-10','BKCENTRAL999','Cliente Secreto','9002','cancelado','embalado','2026-10-12 10:00:00','2026-10-11 10:00:00',0)`).run();
}

(async () => {
  console.log('\n── 0. os módulos sobem ──');
  ok('os módulos de rota carregaram', quebrados.length === 0, quebrados.join(' · '));
  srv = app.listen(0); await new Promise(r => srv.once('listening', r));
  base = 'http://127.0.0.1:' + srv.address().port;
  try{ semear(); ok('o banco foi semeado', true); }
  catch(e){ ok('o banco foi semeado', false, e.message); }

  const r = await get('/api/pendencias/resumo');

  console.log('\n── 1. cada linha diz o número da tela dona ──');
  const pass = await get('/api/correcao/passivo');
  const nMesa = Object.keys(pass).reduce((s, k) => s + ((pass[k] && pass[k].n) || 0), 0);
  eq('Correções = a soma dos contadores da Mesa', linha(r, 'correcoes').n, nMesa);
  ok('a Mesa tem o vencido e a cancelada semeados', nMesa >= 2, 'veio ' + nMesa);
  eq('Ajuste de saldo = a lista da aba Estoque', linha(r, 'ajuste').n, (await get('/api/estoque/ajuste/pendentes')).itens.length);
  eq('Ajuste de saldo conta só o pendente', linha(r, 'ajuste').n, 1);
  eq('Inventário — aprovar = a fila de aprovação', linha(r, 'inventario_aprovar').n, (await get('/api/inventario/aprovacao')).itens.length);
  eq('Inventário — aprovar conta 1', linha(r, 'inventario_aprovar').n, 1);
  eq('Inventário — recontar = a recontagem de quem não contou', linha(r, 'inventario_recontar').n, (await get('/api/inventario/recontagem')).itens.length);
  eq('Inventário — recontar conta recontar e terceira do ciclo aberto, e não o fechado', linha(r, 'inventario_recontar').n, 2);
  eq('Contagem de material = a aba Contagem', linha(r, 'contagem').n, (await get('/api/contagem/pendentes')).total);
  eq('Contagem de material conta só a não aprovada', linha(r, 'contagem').n, 1);
  eq('SKU incompleto = a aba SKU incompleto', linha(r, 'sku').n, (await get('/api/skus/pendencias')).total);
  ok('SKU incompleto acha o SKU sem cor', linha(r, 'sku').n >= 1);
  eq('Sobras = a lista da Conferência', linha(r, 'sobras').n, (await get('/api/carregamento/sobras')).caixas.length);
  eq('Sobras acha a cancelada na fábrica', linha(r, 'sobras').n, 1);
  eq('Devoluções = a aba Devoluções', linha(r, 'devolucoes').n, (await get('/api/devolucao/pendentes')).length);
  eq('Devoluções conta as duas sem baixa', linha(r, 'devolucoes').n, 2);
  eq('a devolução mais antiga é a de 20/10', String(linha(r, 'devolucoes').desde || '').slice(0, 10), '2026-10-20');
  ok('cada linha diz quem resolve', (r.linhas || []).every(l => l.quem && l.quem.length > 2),
     (r.linhas || []).filter(l => !l.quem).map(l => l.chave).join(', '));
  ok('cada linha diz onde se resolve', (r.linhas || []).every(l => l.onde && (l.onde.aba || l.onde.url)));

  console.log('\n── 3. a cancelada nas duas portas conta uma vez ──');
  eq('uma caixa está em duas linhas', r.em_duas_linhas, 1);
  const soma = (r.linhas || []).reduce((s, l) => s + (l.n || 0), 0);
  eq('o total é a soma menos a repetida', r.total, soma - 1);

  console.log('\n── 2. resolvida na tela dona, sai da central ──');
  const d = (await get('/api/devolucao/pendentes'))[0];
  const b = await post('/api/devolucao/baixa', { id:d.id, reputacao:'nao', motivo:'arrependimento' });
  eq('a baixa da devolução passou', b.status, 200);
  const r2 = await get('/api/pendencias/resumo');
  eq('Devoluções caiu para 1', linha(r2, 'devolucoes').n, 1);
  eq('o total caiu 1', r2.total, r.total - 1);

  console.log('\n── 4. só números ──');
  const fio = JSON.stringify(r);
  ok('nenhum SKU viaja', fio.indexOf('BKCENTRAL999') < 0 && fio.indexOf('BKOUTRO') < 0);
  ok('nenhum cliente viaja', fio.indexOf('Cliente Secreto') < 0);
  ok('nenhuma lista de itens viaja', !(r.linhas || []).some(l => l.itens || l.caixas || l.linhas));
  ok('nenhum ponteiro interno viaja', fio.indexOf('_canc') < 0);

  console.log('\n── 6. nenhuma conta mora na central ──');
  const fonte = fs.readFileSync(path.join(__dirname, 'pendencias_dominio.js'), 'utf8')
    .replace(/\/\*[\s\S]*?\*\//g, '').replace(/\/\/.*$/gm, '');
  ok('o pendencias_dominio.js não tem SQL', !/\b(SELECT|FROM|WHERE)\b/.test(fonte) && !/db\.prepare|db\.exec/.test(fonte));
  const dono = (arq, fn) => new RegExp(fn).test(fs.readFileSync(path.join(__dirname, arq), 'utf8'));
  ok('a aba Devoluções lê pela mesma função', dono('dev_route.js', "'/api/devolucao/pendentes',\\(req,res\\)=> res\\.json\\(devolucoesPendentes\\(db\\)\\)"));
  ok('a aba Contagem lê pela mesma função', dono('cont_route.js', 'const linhas=contagemPendentes\\(db\\)'));
  ok('a aba SKU incompleto lê pela mesma função', dono('sku_route.js', "'/api/skus/pendencias',\\(req,res\\)=> res\\.json\\(pendenciasSku\\(db\\)\\)"));
  ok('a Conferência lê pela mesma função', dono('carreg_route.js', "'/api/carregamento/sobras',\\(req,res\\)=> res\\.json\\(\\{caixas:sobrasEsperando\\(db\\)\\}\\)"));
  ok('o ajuste e a central usam a mesma frase', dono('ajuste_dominio.js', "WHERE ' \\+ PENDENTE \\+ ' ORDER BY") && dono('ajuste_dominio.js', "FROM ajuste_pedido WHERE ' \\+ PENDENTE"));
  ok('o inventário e a central usam as mesmas frases', dono('inventario_dominio.js', 'WHERE \\$\\{A_APROVAR\\} ORDER BY') && dono('inventario_dominio.js', 'WHERE \\$\\{NA_LISTA\\(status\\)\\}'));

  console.log('\n── 7. a permissão e a tela ──');
  eq('GET /api/pendencias/resumo é @admin', AC.permDaRota('/api/pendencias/resumo', 'GET'), '@admin');
  const tela = fs.readFileSync(path.join(__dirname, 'public', 'index.html'), 'utf8');
  ok('a aba chama a central', tela.indexOf('/api/pendencias/resumo') >= 0);
  /* O primeiro painel nasceu com o id `pendResumo`, que já era da aba SKU
     incompleto: a central escrevia por cima do resumo dela e ficava em
     "carregando…". Só apareceu abrindo a tela. */
  const marcacao = tela.replace(/<script[\s\S]*?<\/script>/g, '');   // os ids montados por JS nascem e morrem com o card
  const ids = {}; (marcacao.match(/\bid="[^"]+"/g) || []).forEach(x => { ids[x] = (ids[x] || 0) + 1; });
  const rep = Object.keys(ids).filter(k => ids[k] > 1);
  ok('nenhum id repetido na marcação da tela do admin', rep.length === 0, rep.join(', '));
  ok('a aba Bloqueados virou Pendências', /data-t="blq" id="tabBlq">Pendências</.test(tela));
  ok('a aba Pendências de SKU virou SKU incompleto', /data-t="pend" id="tabPend">SKU incompleto</.test(tela) && tela.indexOf("'Pendências de SKU'") < 0);

  console.log('\n── 5. a linha que não conta diz isso ──');
  db.exec('DROP TABLE devolucao');
  const r3 = await get('/api/pendencias/resumo');
  eq('Devoluções sem tabela é null, e não zero', linha(r3, 'devolucoes').n, null);
  ok('e diz que não conseguiu contar', !!linha(r3, 'devolucoes').erro);
  eq('o resumo diz quantas linhas ficaram sem conta', r3.sem_conta, 1);
  ok('as outras linhas continuam contando', linha(r3, 'ajuste').n === 1);
})().catch(e => { falhas++; console.log('  FALHOU — o teste estourou: ' + (e && e.stack || e)); })
  .finally(() => {
    try{ srv && srv.close(); }catch(e){}
    try{ db.close(); }catch(e){}
    fs.rmSync(tmp, { recursive:true, force:true });
    console.log('\n' + (casos - falhas) + ' ok, ' + falhas + ' falha(s)\n');
    process.exit(falhas ? 1 : 0);
  });

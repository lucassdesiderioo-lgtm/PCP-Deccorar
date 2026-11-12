#!/usr/bin/env node
/* teste_pendencias_caminho.js — a caixinha "Abrir em Pendências" (spec
 * docs/specs/PENDENCIAS-NO-MENU.md, fase 1, 12/11/2026).
 *
 *   node teste_pendencias_caminho.js
 *
 * O que trava:
 *   1. toda linha da central diz a tela dona, e a tela existe no mapa;
 *   2. toda ação vigiada aponta linha que existe, e a rota existe no código;
 *   3. a ação que cria pendência responde `pendencias` com a frase e o caminho;
 *      a que não cria (ou que é recusada) responde como sempre;
 *   4. o botão só vai para quem abre a tela dona — quem não abre recebe quem
 *      resolve;
 *   5. a resposta assíncrona (o upload) também ganha a caixinha;
 *   6. nada de SKU, cliente ou saldo na caixinha;
 *   7. o vigia é registrado no server.js antes das rotas e do static;
 *   8. o nav.js carrega a caixinha, e ela só olha POST.
 *
 * Banco novo de verdade (db.js), módulos de rota de verdade.
 */
const fs = require('fs'), os = require('os'), path = require('path');
const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'pcp-pendcaminho-'));
process.env.PCP_DIR = tmp;

let casos = 0, falhas = 0;
function ok(desc, cond, detalhe){
  casos++;
  if(cond) console.log('  ok  ' + casos + ' — ' + desc);
  else { falhas++; console.log('  FALHOU ' + casos + ' — ' + desc + (detalhe ? '\n         ' + detalhe : '')); }
}

const PEND = require('./pendencias_dominio');
const VIG = require('./pendencias_vigia');
const M = require('./telas');

console.log('\n1. toda linha da central diz a tela dona');
PEND.LINHAS.forEach(L => {
  const t = require('./abre_tela').telaDe(L.tela);   // as 6xx moram no tecido
  ok(L.chave + ' → tela ' + L.tela + ' no mapa', !!t, 'sem tela no mapa');
});

console.log('\n2. as ações vigiadas');
const codigo = fs.readdirSync(__dirname).filter(f => /\.js$/.test(f) && !/^teste_/.test(f))
  .map(f => fs.readFileSync(path.join(__dirname, f), 'utf8')).join('\n');
/* as rotas do sob medida moram em tecido/rotas, sem o prefixo /sobmedida */
const codigoSm = fs.readdirSync(path.join(__dirname, 'tecido', 'rotas')).filter(f => /\.js$/.test(f))
  .map(f => fs.readFileSync(path.join(__dirname, 'tecido', 'rotas', f), 'utf8')).join('\n');
const AMOSTRA = { '/api/lote/upload':1, '/api/carregamento/sobra':1, '/api/estoque/ajuste':1, '/api/inventario/terminar':1,
  '/api/inventario/geral/terminar-prateleira':1, '/api/inventario/rejeitar':1, '/api/skus':1, '/api/pedidos/:id/comprar':1,
  '/api/compras/rapida':1, '/api/recebimento':1, '/api/pedidos/:id/fechar':1, '/api/contagem-material/:id/terminar':1,
  '/api/componentes':1, '/sobmedida/api/boletos/:id/baixa':1, '/sobmedida/api/sobras/:id/descartar':1,
  '/sobmedida/api/planos/:id/correcao':1, '/sobmedida/api/niveis':1 };
VIG.VIGIA.forEach(([re, chaves]) => {
  chaves.forEach(c => {
    const L = PEND.LINHAS.find(x => x.chave === c);
    ok(re + ' → linha ' + c + ' existe e tem frase', !!(L && L.frase), 'linha ou frase faltando');
  });
  const rota = Object.keys(AMOSTRA).find(r => re.test(r.replace(':id', '7')));
  const sm = rota && rota.indexOf('/sobmedida') === 0;
  ok(re + ' → a rota está registrada no código', !!rota && (sm ? codigoSm.indexOf("'" + rota.slice('/sobmedida'.length) + "'") >= 0
                                                             : codigo.indexOf("'" + rota + "'") >= 0), 'rota não achada: ' + rota);
});
ok('ação de outra rota não é vigiada', VIG.vigiaDe('/api/estoque/ajuste/7/aprovar') == null);

console.log('\n3 a 6. as respostas');
const express = require('express');
const db = require('./db.js');
let quemVe = { id:999, nome:'Quem Faz', areas:['admin'] };
let abre = true;
function montar(){
  const app = express(); app.use(express.json());
  app.use((req,res,next) => { req.usuario = quemVe; next(); });
  VIG(app, db);
  /* um upload de mentira, ASSÍNCRONO como o de verdade: no meio da espera
     (a leitura do PDF) OUTRA PESSOA retém uma caixa; depois da leitura ele
     recomeça a conta (`req.recontarPendencias`, o que o exp_route faz) e
     retém a dele. Só a dele pode aparecer. `?modo=` testa as recusas. */
  app.post('/api/lote/upload', (req,res) => {
    db.prepare("INSERT INTO lote (codigo, estagio, buyer) VALUES ('NAOEXISTE0','bloqueado','Cliente Secreto')").run();
    setTimeout(() => {
      if(req.recontarPendencias) req.recontarPendencias();
      db.prepare("INSERT INTO lote (codigo, estagio, buyer) VALUES ('NAOEXISTE1','bloqueado','Cliente Secreto')").run();
      if(req.query.modo === 'erro') return res.status(409).json({ erro:'recusado' });
      if(req.query.modo === 'okfalse') return res.json({ ok:false, motivo:'recusado' });
      if(req.query.modo === 'status') return res.status(422).json({ motivo:'recusado' });
      res.json({ novos:1, bloqueados:1 });
    }, 30);
  });
  ['sku_cad_route','exp_route','mont_route','carreg_route','est_route','ajuste_route','dev_route','cad_route','sku_route','compras_route']
    .forEach(m => { try{ require('./' + m)(app, db); }catch(e){ console.log('  (módulo ' + m + ': ' + e.message + ')'); } });
  require('./acesso')(app, db);
  const AC = app.locals.acesso;
  AC.podePermissao = () => true;
  const decidir = AC.decidir;
  AC.decidir = (u, r, m) => abre ? { ok:true } : { ok:false };
  return app;
}
const app = montar();
db.prepare("INSERT OR IGNORE INTO skus (codigo, estoque, descricao) VALUES ('BKCAMINHO1', 5, 'x')").run();
db.prepare("INSERT OR IGNORE INTO skus (codigo, estoque, descricao) VALUES ('BKCAMINHO3', 5, 'x')").run();

(async () => {
  const srv = app.listen(0); const base = 'http://127.0.0.1:' + srv.address().port;
  async function post(url, corpo){
    const r = await fetch(base + url, { method:'POST', headers:{ 'Content-Type':'application/json' }, body:JSON.stringify(corpo || {}) });
    return { status:r.status, corpo:await r.json() };
  }

  let r = await post('/api/estoque/ajuste', { codigo:'BKCAMINHO1', delta:-1, motivo:'Perda' });
  const p = (r.corpo.pendencias || [])[0] || {};
  ok('pedir ajuste responde com a caixinha', r.status === 200 && p.chave === 'ajuste' && p.n === 1, JSON.stringify(r.corpo));
  ok('a frase diz o que nasceu', /pedido de ajuste/.test(p.frase || ''), p.frase);
  ok('o caminho é a tela dona (301)', p.tela === 301 && p.rota === '/admin/estoque' && p.pode === true, JSON.stringify(p));
  ok('a resposta da rota continua inteira', r.corpo.codigo === 'BKCAMINHO1');

  r = await post('/api/estoque/ajuste', { codigo:'BKCAMINHO1', delta:-1 });
  ok('ação recusada não ganha caixinha', r.status >= 400 && !r.corpo.pendencias, JSON.stringify(r.corpo));

  abre = false; quemVe = { id:998, nome:'Outra', areas:[] };
  r = await post('/api/estoque/ajuste', { codigo:'BKCAMINHO3', delta:1, motivo:'Achei' });
  const q = (r.corpo.pendencias || [])[0] || {};
  ok('quem não abre a tela dona não recebe o caminho', q.chave === 'ajuste' && q.pode === false && q.rota === null, JSON.stringify(q));
  ok('…e recebe quem resolve', /aprovar|ajuste/i.test(q.quem || ''), q.quem);
  abre = true; quemVe = { id:999, nome:'Quem Faz', areas:['admin'] };

  r = await post('/api/skus', { codigo:'BKCAMINHO2', descricao:'sem medida' });
  const s = (r.corpo.pendencias || []).find(x => x.chave === 'sku') || {};
  ok('SKU salvo incompleto abre a caixinha do 403', s.n === 1 && s.tela === 403, JSON.stringify(r.corpo));
  r = await post('/api/skus', { codigo:'BKCAMINHO2', descricao:'ainda sem medida' });
  ok('editar o mesmo SKU incompleto não repete a caixinha', !r.corpo.pendencias, JSON.stringify(r.corpo));

  r = await post('/api/devolucao', { sku_fisico:'BKCAMINHO1', codigo_ml:'ML77', buyer:'Cliente Secreto' });
  const d = {};
  /* A 251 FICA DE FORA (decisão do dono, 12/11/2026): toda peça recebida nasce
     esperando a baixa, e a caixinha apareceria em toda devolução bipada, sem
     botão — quem recebe aprende a fechar sem ler. Quem dá a baixa vê pela 253. */
  ok('devolução recebida (251) NÃO mostra a caixinha', r.status === 200 && r.corpo.ok && !r.corpo.pendencias, JSON.stringify(r.corpo));
  ok('a 251 não está na lista vigiada', VIG.vigiaDe('/api/devolucao') == null);

  r = await post('/api/lote/upload', {});
  const u = (r.corpo.pendencias || [])[0] || {};
  ok('o upload (assíncrono) aponta Bloqueados (204), sem somar a caixa que outra pessoa reteve no meio', u.chave === 'bloqueados' && u.n === 1 && u.rota === '/admin/pendencias', JSON.stringify(r.corpo));

  for(const modo of ['erro','okfalse','status']){
    r = await post('/api/lote/upload?modo=' + modo, {});
    ok('resposta recusada (' + modo + ') não ganha caixinha, mesmo com pendência criada', !r.corpo.pendencias, JSON.stringify(r.corpo));
  }

  const tudo = JSON.stringify(r.corpo.pendencias) + JSON.stringify(d) + JSON.stringify(p);
  ok('nada de SKU, cliente ou saldo na caixinha', !/BKCAMINHO|NAOEXISTE|Cliente Secreto|"estoque":|"saldo/.test(tudo), tudo);


  quemVe = { id:997, nome:'Sem Admin', areas:[] }; abre = false;
  r = await post('/api/lote/upload', {});
  const b2 = (r.corpo.pendencias || [])[0] || {};
  ok('Bloqueados para quem não abre a 204 diz o nível de quem resolve', b2.pode === false && b2.quem === 'nível Admin', JSON.stringify(b2));
  abre = true;
  srv.close();

  console.log('\n7 e 8. o lugar do vigia e a tela');
  const sv = fs.readFileSync(path.join(__dirname, 'server.js'), 'utf8');
  const iV = sv.indexOf("require('./pendencias_vigia')"), iS = sv.indexOf('express.static'),
        iR = sv.indexOf("require('./sku_cad_route')"), iA = sv.indexOf("require('./auth')");
  ok('o server.js registra o vigia depois do auth', iV > iA && iA >= 0);
  ok('…e antes do static e da primeira rota', iV >= 0 && iV < iS && iV < iR);
  const nav = fs.readFileSync(path.join(__dirname, 'public', 'nav.js'), 'utf8');
  ok('o nav.js carrega a caixinha', nav.indexOf("'/pendencias_aviso.js'") >= 0);
  const av = fs.readFileSync(path.join(__dirname, 'public', 'pendencias_aviso.js'), 'utf8');
  ok('a caixinha só olha POST e lê uma cópia da resposta', /metodo !== 'POST'/.test(av) && /r\.clone\(\)/.test(av));
  ok('a caixinha não fecha sozinha', !/setTimeout\([^)]*remove/.test(av));
  ok('a caixinha nova se SOMA à que já está na tela (não apaga a anterior)', /insertAdjacentHTML\('afterbegin'/.test(av) && !/el\.innerHTML = h;/.test(av));
  const ex = fs.readFileSync(path.join(__dirname, 'exp_route.js'), 'utf8');
  const iP = ex.indexOf('await parsePdf('), iC = ex.indexOf('req.recontarPendencias');
  ok('o upload de verdade recomeça a conta logo depois de ler o PDF', iP >= 0 && iC > iP && iC - iP < 400);

  console.log('\n' + (falhas ? falhas + ' FALHA(S) em ' : 'tudo certo: ') + casos + ' casos');
  try{ fs.rmSync(tmp, { recursive:true, force:true }); }catch(e){}
  process.exit(falhas ? 1 : 0);
})().catch(e => { console.log('ERRO', e); process.exit(1); });

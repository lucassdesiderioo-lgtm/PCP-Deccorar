#!/usr/bin/env node
/* teste_menu.js — O MENU POR PESSOA NO LUGAR DO RODAPÉ (spec
 * ACESSO-POR-TELA-E-NIVEL, fase 6, R-TEL-04 e R-TEL-06).
 *
 *   node teste_menu.js
 *
 * O nav.js roda num navegador de mentira (como no teste_atalho.js). Trava:
 *   - o rodapé de atalhos SAIU, e o Alt+número de troca de tela junto
 *     (o Alt+0 do "Sair" e o "Trocar setor" ficam);
 *   - o menu sai do mapa (`/api/telas/minhas`): só os módulos e as telas que a
 *     pessoa alcança, com o número ao lado do nome; módulo sem tela não aparece;
 *   - o botão de ação que a pessoa não tem some (`data-perm`): o servidor
 *     continua travando por baixo — esconder é conforto, não segurança.
 */
const fs = require('fs'), path = require('path'), vm = require('vm');

let n = 0, falhas = 0;
function ok(desc, cond, detalhe){
  n++;
  if(cond) console.log('  ok  ' + n + ' — ' + desc);
  else { falhas++; console.log('  FALHOU ' + n + ' — ' + desc + (detalhe ? '\n         ' + detalhe : '')); }
}
const NAV = fs.readFileSync(path.join(__dirname, 'public', 'nav.js'), 'utf8');

function abrir(tela, eu, minhas){
  const ouvintes = [], estilos = [], elementos = {};
  const el = (tag) => { const e = { tag, style:{}, children:[], _html:'', textContent:'', className:'',
    appendChild(c){ this.children.push(c); if(c.id) elementos[c.id] = c; return c; },
    insertBefore(c){ this.children.push(c); if(c.id) elementos[c.id] = c; return c; },
    addEventListener(){}, setAttribute(k, v){ this[k] = v; }, remove(){},
    querySelectorAll(){ return []; }, closest(){ return null; },
    set innerHTML(v){ this._html = v; }, get innerHTML(){ return this._html; } };
    return e; };
  const head = el('head'); head.appendChild = function(c){ estilos.push(c); return c; };
  const body = Object.assign(el('body'), { firstChild:null });
  const location = { pathname:tela, _href:tela, get href(){ return this._href; }, set href(v){ this._href = v; } };
  const resp = (u) => {
    if(/\/api\/auth\/eu/.test(u)) return eu;
    if(/\/api\/telas\/minhas/.test(u)) return minhas;
    return {};
  };
  const pend = [];
  const janela = {
    document:{ body, head, documentElement:{ style:{} }, readyState:'complete',
      createElement:el, getElementById:(id) => elementos[id] || (elementos['_' + id] = elementos['_' + id] || el('div')),
      addEventListener:(t, fn) => { if(t === 'keydown') ouvintes.push(fn); }, querySelectorAll:() => [] },
    location, getComputedStyle:() => ({ backgroundColor:'rgb(255, 255, 255)' }),
    localStorage:{ getItem:() => null, setItem(){} },
    fetch:(u) => { const p = Promise.resolve({ ok:true, json:() => Promise.resolve(resp(u)) }); pend.push(p); return p; },
    setInterval(){}, setTimeout(fn){ fn(); }, confirm:() => false, parseInt, Math, String, JSON, Object, Array, console, Promise
  };
  vm.runInNewContext(NAV, janela);
  const tecla = (e) => { const ev = Object.assign({ altKey:false, ctrlKey:false, metaKey:false, preventDefault(){} }, e); ouvintes.forEach(fn => fn(ev)); };
  return { body, estilos, elementos, location, tecla, esperar:() => new Promise(r => setTimeout(r, 20)) };
}

const OP = { logado:true, id:7, nome:'Olga', destino:{ padrao:'/operador', duas:false } };
const MINHAS_OP = { telas:[ { n:101, nome:'Revisão', rota:'/operador', modulo:100 }, { n:251, nome:'Devoluções — receber', rota:'/devolucao', modulo:250 } ],
  modulos:{ 100:'Produção', 200:'Expedição', 250:'Devoluções', 900:'Sistema' }, perms:['revisao.executar','devolucao.registrar'], admin_geral:false };

(async () => {
  console.log('\n── 1. o rodapé de atalhos saiu (R-TEL-06) ──');
  ok('o nav.js não tem mais a barra de atalhos (MAP / "Alt+N")', !/var MAP=\{/.test(NAV) && !/'<b>Alt\+'/.test(NAV));
  ok('nem empurra a página para cima do rodapé (paddingBottom)', !/paddingBottom='52px'/.test(NAV));
  const t = abrir('/operador', OP, MINHAS_OP); await t.esperar();
  t.tecla({ key:'Alt', code:'AltLeft', altKey:true }); t.tecla({ key:'2', code:'Digit2', altKey:true });
  ok('Alt+2 não troca mais de tela', t.location.href === '/operador', t.location.href);
  ok('o "Trocar setor" continua', /Trocar setor/.test(NAV) && /['"]\/setor['"]/.test(NAV));
  ok('o Alt+0 do "Sair" continua (pelo digitoDoAtalho)', /digitoDoAtalho\(e\)==='0'/.test(NAV));

  console.log('\n── 2. o menu é por pessoa, e sai do mapa ──');
  ok('o nav.js pergunta /api/telas/minhas', /\/api\/telas\/minhas/.test(NAV));
  const menu = t.elementos.menuTelas;
  const html = menu ? menu.innerHTML : '';
  ok('o menu existe', !!menu);
  ok('mostra as telas dela com o número ao lado do nome', /<b>101<\/b> Revisão/.test(html) && /<b>251<\/b> Devoluções — receber/.test(html), html.slice(0, 300));
  ok('agrupadas pelo módulo (Produção, Devoluções)', /Produção/.test(html) && /Devoluções/.test(html));
  ok('módulo sem tela da pessoa não aparece (Expedição, Sistema)', !/Expedição/.test(html) && !/Sistema/.test(html));
  ok('a tela aberta vem marcada', /aria-current="page"><b>101<\/b>/.test(html) && !/aria-current="page"><b>251/.test(html));

  console.log('\n── 3. o botão de ação que a pessoa não tem some (R-TEL-04) ──');
  const css = t.estilos.map(s => s.textContent || '').join('\n');
  ok('todo [data-perm] nasce escondido', /\[data-perm\]\{display:none/.test(css), css.slice(0, 200));
  ok('e aparece o que ela tem', /\[data-perm~="revisao\.executar"\]/.test(css));
  ok('   e não o que ela não tem', !/\[data-perm~="custo\.ver"\]/.test(css));
  const ag = abrir('/admin/estoque', { logado:true, id:1, nome:'Lucas', destino:{} }, { telas:[], modulos:{}, perms:[], admin_geral:true });
  await ag.esperar();
  ok('o Admin Geral vê todos os botões', /\[data-perm\]\{display:revert/.test(ag.estilos.map(s => s.textContent || '').join('\n')));

  console.log('\n── 4. o servidor manda o menu e trava por baixo ──');
  const P = require('./perfis_acesso'); const B = P.montar(); require('./admin_telas')(B.app, B.db);
  const u = nome => Object.assign(B.db.prepare('SELECT * FROM usuarios WHERE id=?').get(B.pessoas.find(p => p.nome.indexOf(nome) === 0).id), { areas:[] });
  let out = null; B.rotas['GET /api/telas/minhas']({ usuario:u('Edvaldo') }, { json(b){ out = b; } });
  ok('/api/telas/minhas manda os nomes dos módulos e as permissões da pessoa', !!out.modulos && out.modulos[100] === 'Produção' && Array.isArray(out.perms) && out.perms.indexOf('revisao.executar') >= 0);
  ok('   o Edvaldo (Operação) não tem tela do Admin no menu', !out.telas.some(t => /^\/admin\//.test(t.rota) || t.rota === '/acessos'), JSON.stringify(out.telas.map(t => t.n)));
  ok('   e tem as dele: 101 Revisão, 105 Painel e 251 Devoluções — receber', [101,105,251].every(x => out.telas.some(t => t.n === x)), JSON.stringify(out.telas.map(t => t.n)));
  const dv = B.AC.permDaRota('/devolucoes', 'GET');
  ok('a porta /devolucoes deixa de ser @logado: é a entrada do bloco 250 (as 4 chaves das devoluções)',
    Array.isArray(dv) && ['devolucao.registrar','devolucao.acompanhar','devolucao.lancar','devolucao.baixar'].every(c => dv.indexOf(c) >= 0), JSON.stringify(dv));
  B.fechar();

  const html2 = fs.readFileSync(path.join(__dirname, 'public', 'index.html'), 'utf8');
  const marcados = (html2.match(/data-perm="/g) || []).length;
  ok('as telas do Admin marcam os botões de ação com a permissão (data-perm): ' + marcados, marcados >= 8);

  console.log('\n' + (n - falhas) + ' ok, ' + falhas + ' falha(s)\n');
  process.exit(falhas ? 1 : 0);
})().catch(e => { console.log('  FALHOU — estourou: ' + e.stack); process.exit(1); });

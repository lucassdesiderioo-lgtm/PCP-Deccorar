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
/* O desenho do menu mora no menu_telas.js desde o menu único (ORGANIZACAO-DO-SISTEMA fase 3):
   no navegador o nav.js o carrega por uma tag de script; aqui ele roda antes. */
const MENU_JS = fs.readFileSync(path.join(__dirname, 'public', 'menu_telas.js'), 'utf8');

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
  janela.window = janela;
  vm.createContext(janela); vm.runInContext(MENU_JS, janela); vm.runInContext(NAV, janela);
  const tecla = (e) => { const ev = Object.assign({ altKey:false, ctrlKey:false, metaKey:false, preventDefault(){} }, e); ouvintes.forEach(fn => fn(ev)); };
  return { body, estilos, elementos, location, tecla, esperar:() => new Promise(r => setTimeout(r, 20)) };
}

const OP = { logado:true, id:7, nome:'Olga', destino:{ padrao:'/operador', duas:false } };
/* Desde o menu único (fase 3 da ORGANIZACAO-DO-SISTEMA) o módulo vem pela CHAVE do
   módulo do assunto, com o bloco, e os módulos vêm em lista, na ordem do menu. */
const MO = require('./modulos');
const MINHAS_OP = { telas:[ { n:101, nome:'Revisão', rota:'/operador', modulo:'producao', bloco:'medida_padrao' },
    { n:251, nome:'Devoluções — receber', rota:'/devolucao', modulo:'posvenda', bloco:'mercado_livre' } ],
  modulos: MO.MODULOS.map(m => ({ chave:m.chave, nome:m.nome })), blocos: MO.BLOCOS,
  perms:['revisao.executar','devolucao.registrar'], admin_geral:false };

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
  ok('agrupadas pelo módulo do assunto (Produção, Pós-venda)', />Produção</.test(html) && />Pós-venda</.test(html));
  ok('módulo sem tela da pessoa não aparece (Expedição, Administração)', !/>Expedição</.test(html) && !/>Administração</.test(html));
  ok('a tela aberta vem marcada', /aria-current="page"><b>101<\/b>/.test(html) && !/aria-current="page"><b>251/.test(html));

  console.log('\n── 3. o botão de ação que a pessoa não tem some (R-TEL-04) ──');
  const regra = e => ((e.estilos.find(x => x.id === 'permCss') || {}).textContent || '');
  const css = regra(t);
  ok('esconde o botão cuja marca não tem nenhuma chave dela', /^\[data-perm\](:not\(\[data-perm~="[^"]+"\]\))+\{display:none !important\}$/.test(css), css.slice(0, 200));
  ok('   as chaves dela ficam de fora da regra (o botão dela não some)', /:not\(\[data-perm~="revisao\.executar"\]\)/.test(css));
  ok('   e a que ela não tem não entra (o botão some)', !/custo\.ver/.test(css));
  ok('nunca força a aparecer: nada de display:revert (a tela que esconde continua escondendo)', !/revert !important['"]/.test(NAV));
  const ag = abrir('/admin/estoque', { logado:true, id:1, nome:'Lucas', destino:{} }, { telas:[], modulos:{}, perms:[], admin_geral:true });
  await ag.esperar();
  ok('o Admin Geral vê todos os botões (nenhuma regra de esconder)', regra(ag) === '', regra(ag));

  console.log('\n── 4. o servidor manda o menu e trava por baixo ──');
  const P = require('./perfis_acesso'); const B = P.montar(); require('./admin_telas')(B.app, B.db);
  const u = nome => Object.assign(B.db.prepare('SELECT * FROM usuarios WHERE id=?').get(B.pessoas.find(p => p.nome.indexOf(nome) === 0).id), { areas:[] });
  let out = null; B.rotas['GET /api/telas/minhas']({ usuario:u('Edvaldo') }, { json(b){ out = b; } });
  ok('/api/telas/minhas manda os nomes dos módulos e as permissões da pessoa', Array.isArray(out.modulos) && out.modulos.some(m => m.chave === 'producao' && m.nome === 'Produção') && Array.isArray(out.perms) && out.perms.indexOf('revisao.executar') >= 0);
  ok('   o Edvaldo (Operação) não tem tela do Admin no menu', !out.telas.some(t => /^\/admin\//.test(t.rota) || t.rota === '/acessos'), JSON.stringify(out.telas.map(t => t.n)));
  ok('   e tem as dele: 101 Revisão, 105 Painel e 251 Devoluções — receber', [101,105,251].every(x => out.telas.some(t => t.n === x)), JSON.stringify(out.telas.map(t => t.n)));
  const dv = B.AC.permDaRota('/devolucoes', 'GET');
  ok('a porta /devolucoes deixa de ser @logado: é a entrada do bloco 250 (as 4 chaves das devoluções)',
    Array.isArray(dv) && ['devolucao.registrar','devolucao.acompanhar','devolucao.lancar','devolucao.baixar'].every(c => dv.indexOf(c) >= 0), JSON.stringify(dv));
  B.fechar();

  const html2 = fs.readFileSync(path.join(__dirname, 'public', 'index.html'), 'utf8');
  const marcados = (html2.match(/data-perm="/g) || []).length;
  ok('as telas do Admin marcam os botões de ação com a permissão (data-perm): ' + marcados, marcados >= 8);

  console.log('\n── 5. o botão cuja ação pede OUTRA chave que a da tela leva data-perm (AJUSTE de 04/11/2026) ──');
  /* Cada linha: o arquivo, um pedaço único do botão e a chave que a ROTA dele
     exige (permDaRota). Botão que usa a mesma chave da tela não precisa de
     marca: quem abriu a tela já a tem. E as telas que já escondem pela
     permissão vinda do servidor (Devoluções em andamento, a venda cancelada,
     a aprovação do ajuste e a da contagem de peça) ficam como estão. */
  const MARCAS = [
    ['public/operador.html',  "b.id='rjBt'",                                   'revisao.rejeitar'],
    /* a caixa "Subir PDF" da 201 saiu em 05/11/2026: o upload é só na 103 (D2) */
    ['public/carregamento.html', 'onclick="fecharSaida(true)"',                'saida.liberar'],
    ['public/carregamento.html', 'onclick="fecharViagem(true)"',               'saida.liberar'],
    ['public/index.html', "data-resolvediv=\"'+r.id+'\" data-sku=\"'+esc(sug.codigo)", 'sku.cadastrar'],
    ['public/index.html', "data-resolvediv=\"'+r.id+'\" data-sku=\"'+esc(outras[k2].codigo)", 'sku.cadastrar'],
    ['public/index.html', "data-resolveoutro=\"'+r.id+'\">Confirmar",       'sku.cadastrar'],
    ['public/index.html', "data-ajsalvar=\"'+esc(cod)+'\">pedir",            'estoque.ajustar'],
    ['public/index.html', 'onclick="ctAprovar([',                              'contagem.ajustar'],
    ['public/index.html', 'onclick="ctRejeitar([',                             'contagem.ajustar'],
    ['public/index.html', 'data-tipo="modelo" data-id=',                         'modelo.cadastrar'],
    ['public/index.html', 'data-tipo="modelo">Adicionar',                         'modelo.cadastrar'],
    ['public/index.html', 'data-tipo="tecido" data-id=',                         'sku.cadastrar'],
    ['public/index.html', 'data-tipo="tecido">Adicionar',                         'sku.cadastrar'],
    ['public/index.html', 'data-tipo="cor" data-id=',                            'sku.cadastrar'],
    ['public/index.html', 'data-tipo="cor">Adicionar',                            'sku.cadastrar'],
    ['public/index.html', "data-nova-cor=",                                    'sku.cadastrar'],
    ['public/index.html', 'id="edSalvar"',                                     'modelo.cadastrar'],
    ['public/index.html', 'id="edExcluir"',                                    'modelo.cadastrar'],
    ['public/index.html', 'cdAdd" data-perm',                                    'listas.editar'],
    ['public/index.html', 'cdDel" data-perm',                                   'listas.editar'],
    ['public/index.html', 'id="cdKitBt"',                                      'kit.editar']
  ];
  for(const [arq, pedaco, chave] of MARCAS){
    const txt = fs.readFileSync(path.join(__dirname, arq), 'utf8');
    const i = txt.indexOf(pedaco);
    if(i < 0){ ok(arq + ': o botão "' + pedaco + '" existe', false); continue; }
    /* a marca mora no mesmo elemento: entre o "<button" (ou o createElement) que
       abre e o fim da tag */
    const ini = Math.max(txt.lastIndexOf('<button', i), txt.lastIndexOf('<div', i), txt.lastIndexOf('createElement', i));
    const fim = txt.indexOf('>', i + pedaco.length);
    /* o botão criado por createElement recebe a marca nas linhas de baixo
       (setAttribute); o escrito em texto, dentro da própria tag — e a janela
       acaba nela, senão a marca do botão vizinho passaria por esta */
    const trecho = /createElement/.test(txt.slice(ini, i)) ? txt.slice(ini, i + 400) : txt.slice(ini, fim + 1);
    ok(arq.replace('public/','') + ' · ' + pedaco.slice(0, 40) + ' → ' + chave, new RegExp('data-perm[\\"=,\' ]+' + chave.replace('.', '\\.')).test(trecho) || trecho.indexOf("setAttribute('data-perm','" + chave + "')") >= 0, trecho.slice(0, 220));
  }

  console.log('\n' + (n - falhas) + ' ok, ' + falhas + ' falha(s)\n');
  process.exit(falhas ? 1 : 0);
})().catch(e => { console.log('  FALHOU — estourou: ' + e.stack); process.exit(1); });

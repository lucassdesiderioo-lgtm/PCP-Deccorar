#!/usr/bin/env node
/* teste_menu_unico.js — O MENU ÚNICO (spec ORGANIZACAO-DO-SISTEMA, fase 3,
 * R-ORG-08 e R-ORG-06).
 *
 *   node teste_menu_unico.js
 *
 * Trava:
 *   - o ☰ Menu agrupa por MÓDULO DO ASSUNTO → bloco → tela, nas duas
 *     operações, na ordem da lista dos módulos (`modulos.js`), e não pela
 *     centena do número;
 *   - o desenho do menu é UM só (`public/menu_telas.js`), lido pelo nav.js
 *     das duas operações;
 *   - o sob medida perdeu o rodapé (NOMES, ORDEM, `rodape`) e ganhou o ☰ Menu;
 *   - ninguém ganha nem perde tela: as telas da medida padrão no menu são as
 *     mesmas que o portão deixa abrir, e as do sob medida são, pessoa a pessoa,
 *     as mesmas que o portão de lá (`tecido/nucleo/acesso.js` + `pode`) deixa.
 */
const fs = require('fs'), path = require('path'), vm = require('vm');
const MO = require('./modulos');
const M = require('./telas');

let n = 0, falhas = 0;
function ok(desc, cond, detalhe){
  n++;
  if(cond) console.log('  ok  ' + n + ' — ' + desc);
  else { falhas++; console.log('  FALHOU ' + n + ' — ' + desc + (detalhe ? '\n         ' + detalhe : '')); }
}
const ler = f => { try{ return fs.readFileSync(path.join(__dirname, f), 'utf8'); }catch(e){ return ''; } };

console.log('\n── 1. um desenho só do menu ──');
const MENU_JS = ler('public/menu_telas.js');
ok('existe o public/menu_telas.js', !!MENU_JS);
const NAV = ler('public/nav.js'), NAV_SM = ler('tecido/public/nav.js'), BASE_SM = ler('tecido/public/base.css');
ok('o nav.js da medida padrão usa o menu_telas.js', /\/menu_telas\.js/.test(NAV) && /MENU_TELAS/.test(NAV));
ok('o nav.js do sob medida usa o mesmo menu_telas.js', /\/menu_telas\.js/.test(NAV_SM) && /MENU_TELAS/.test(NAV_SM));
ok('o nav.js da medida padrão não desenha mais o menu por conta própria (sem menuHtml)', !/function menuHtml/.test(NAV));

console.log('\n── 2. o sob medida perdeu o rodapé ──');
ok('sem a lista de telas do rodapé (NOMES, ORDEM)', !/var NOMES=/.test(NAV_SM) && !/var ORDEM=/.test(NAV_SM));
ok('sem a função que montava o rodapé', !/function rodape\(/.test(NAV_SM) && !/className='rodape'/.test(NAV_SM));
ok('sem o estilo do rodapé no base.css', !/^\.rodape\{/m.test(BASE_SM));
ok('com o ☰ Menu na barra de cima', /☰ Menu/.test(NAV_SM));
ok('e pergunta as telas ao mesmo lugar que a medida padrão (/api/telas/minhas)', /\/api\/telas\/minhas/.test(NAV_SM));

console.log('\n── 3. o desenho: módulo → bloco → tela ──');
const ctx = { window:{} }; ctx.window = ctx;
try{ vm.runInNewContext(MENU_JS, ctx); }catch(e){}
const MT = ctx.MENU_TELAS;
ok('o menu_telas.js publica window.MENU_TELAS.html', !!MT && typeof MT.html === 'function');
const D = {
  modulos: MO.MODULOS.map(m => ({ chave:m.chave, nome:m.nome })),
  blocos: MO.BLOCOS,
  telas: [
    { n:609, nome:'Simulador', rota:'/sobmedida/simulador', modulo:'comercial', bloco:'revenda' },
    { n:103, nome:'Subir PDF de vendas', rota:'/admin/producao', modulo:'comercial', bloco:'mercado_livre' },
    { n:101, nome:'Revisão', rota:'/operador', modulo:'producao', bloco:'medida_padrao' },
    { n:102, nome:'Embalagem', rota:'/montagem', modulo:'producao', bloco:'medida_padrao' },
    { n:402, nome:'Cadastro de SKU', rota:'/admin/skus', modulo:'cadastros', bloco:'medida_padrao' }
  ] };
const h = MT ? MT.html(D, '/operador') : '';
const pos = s => h.indexOf(s);
ok('os módulos saem na ordem da lista da spec (Comercial antes de Produção, Produção antes de Cadastros)',
  pos('>Comercial<') >= 0 && pos('>Comercial<') < pos('>Produção<') && pos('>Produção<') < pos('>Cadastros<'), h.slice(0, 300));
ok('a 402 aparece em Cadastros, e não em Planejamento', pos('>Cadastros<') < pos('<b>402</b>') && pos('>Planejamento<') < 0);
ok('módulo com telas de dois blocos mostra o título de cada bloco (Comercial: Mercado Livre e Revenda)',
  pos('>Mercado Livre<') > pos('>Comercial<') && pos('>Revenda<') > pos('>Comercial<'));
ok('módulo com um bloco só não repete o título do bloco (Produção sem "Medida padrão")',
  !/>Medida padrão</.test(h));
ok('dentro do bloco a ordem é o número (Mercado Livre antes de Revenda, pela ordem dos blocos)',
  pos('<b>103</b>') < pos('<b>609</b>'));
ok('a tela aberta vem marcada', /aria-current="page"><b>101<\/b>/.test(h) && !/aria-current="page"><b>102/.test(h));
ok('módulo sem tela da pessoa não aparece', pos('>Fiscal<') < 0 && pos('>Administração<') < 0);
ok('quem não alcança tela nenhuma lê a frase', MT ? /não alcança nenhuma tela/.test(MT.html({ modulos:D.modulos, telas:[] }, '/')) : false);

console.log('\n── 4. o servidor: módulo do assunto, e ninguém ganha nem perde tela ──');
const P = require('./perfis_acesso'); const B = P.montar(); require('./admin_telas')(B.app, B.db);
const SMA = require('./tecido/nucleo/acesso'), SMP = require('./tecido/nucleo/permissoes'), SMT = require('./tecido/nucleo/telas').TELAS;
const usuario = p => Object.assign(B.db.prepare('SELECT * FROM usuarios WHERE id=?').get(p.id), { areas:[] });
const minhas = u => { let out = null; B.rotas['GET /api/telas/minhas']({ usuario:u }, { json(b){ out = b; } }); return out || {}; };
const lucas = minhas(usuario(B.pessoas.find(p => /^Lucas/.test(p.nome))));
ok('os módulos vêm como lista, na ordem do modulos.js', Array.isArray(lucas.modulos)
  && JSON.stringify(lucas.modulos.map(m => m.chave)) === JSON.stringify(MO.MODULOS.map(m => m.chave)));
ok('e os nomes dos blocos vêm junto', !!lucas.blocos && lucas.blocos.medida_padrao === 'Medida padrão');
const decl = {}; M.TELAS.forEach(t => { decl[t.rota] = t; });
Object.entries(SMT).forEach(([r, t]) => { if(!t.apelido) decl['/sobmedida' + (r === '/' ? '' : r)] = t; });
const errMod = (lucas.telas || []).filter(t => !decl[t.rota] || decl[t.rota].modulo !== t.modulo || decl[t.rota].bloco !== t.bloco).map(t => t.n);
ok('cada tela do menu sai com o módulo e o bloco declarados no mapa (não a centena)', (lucas.telas || []).length >= 45 && !errMod.length,
  'erradas: ' + errMod.join(', '));

const ac = B.app.locals.acesso;
const difPcp = [], difSm = [];
B.pessoas.forEach(p => {
  const u = usuario(p), out = minhas(u), rotas = new Set((out.telas || []).map(t => t.rota));
  // a medida padrão: o que o portão deixa abrir
  M.TELAS.forEach(t => { const pode = !!ac.decidir(u, t.rota, 'GET').ok; if(pode !== rotas.has(t.rota)) difPcp.push(p.nome + ':' + t.n); });
  // o sob medida: o que o portão DE LÁ deixa abrir (as chaves do PCP → o usuário de lá → pode)
  const sm = SMA.daSessaoDoPcp({ id:u.id, nome:u.nome }, Array.from(ac.permissoesDe(u.id)));
  Object.entries(SMT).forEach(([r, t]) => {
    if(t.apelido) return;
    const rota = '/sobmedida' + (r === '/' ? '' : r), pode = !!sm && SMP.pode(sm, t.permissao);
    if(pode !== rotas.has(rota)) difSm.push(p.nome + ':' + t.numero + (pode ? ' (falta no menu)' : ' (sobra no menu)'));
  });
});
ok('medida padrão: o menu de cada pessoa tem exatamente as telas que o portão deixa abrir (' + B.pessoas.length + ' pessoas)',
  !difPcp.length, difPcp.slice(0, 12).join(', '));
ok('sob medida: o menu de cada pessoa tem exatamente as telas que o portão do sob medida deixa abrir',
  !difSm.length, difSm.slice(0, 12).join(', '));
B.fechar();

console.log('\n── 5. o lugar: as telas saíram da lista do que está fora do lugar ──');
ok('o "módulo de hoje" é o módulo declarado (o menu já agrupa por ele)', M.moduloHoje(402) === 'cadastros' && M.moduloHoje(103) === 'comercial');
const sobra = MO.FORA_DO_LUGAR.map(f => f.item).filter(x => !/\//.test(x));
ok('nenhuma TELA fica na lista do que está fora do lugar — só abas e partes', !sobra.length, sobra.join(', '));
ok('o Financeiro foi inaugurado pela 616', (MO.porChave('financeiro') || {}).situacao === 'existe');

console.log('\n' + (n - falhas) + ' ok, ' + falhas + ' falha(s)');
process.exit(falhas ? 1 : 0);

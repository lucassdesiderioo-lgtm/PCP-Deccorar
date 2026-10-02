#!/usr/bin/env node
/* teste_tablets.js — a estação vira app no iPad (camada 2 da spec TABLETS-E-KIOSK).
 *
 *   node teste_tablets.js
 *
 * O que trava (02/10/2026):
 * - cada estação de tablet tem as meta tags de app, o título dela, o ícone dela
 *   e o manifest DELA — um manifest só, com um start_url só, faria todo tablet
 *   abrir na mesma tela (a spec escreve um /app.webmanifest único e ao mesmo
 *   tempo pede "um ícone por estação": as duas coisas não cabem juntas);
 * - com sessão aberta o `.webmanifest` passa pela regra das extensões de apoio
 *   do `acesso.js` (sem ela levaria 403, e o iPad o ignoraria em silêncio) — o
 *   caso mora no `teste_acesso.js`, seção 12;
 * - o manifest e os ícones existem, o JSON é válido e os PNG têm o tamanho que
 *   declaram (lido do cabeçalho do arquivo, e não do nome);
 * - o `ipad.css` tira o zoom por toque duplo, o elástico e a lupa — e devolve a
 *   seleção aos campos, senão o leitor e a digitação ficariam presos.
 */
const fs = require('fs'), path = require('path');

let n = 0, falhas = 0;
function ok(desc, cond, detalhe){
  n++;
  if(cond) console.log('  ok  ' + n + ' — ' + desc);
  else { falhas++; console.log('  FALHOU ' + n + ' — ' + desc + (detalhe ? '\n         ' + detalhe : '')); }
}
const PUB = path.join(__dirname, 'public');
const ESTACOES = ['operador','montagem','embalagem','carregamento','inventario','devolucao'];

function tamanhoPng(arq){
  const b = fs.readFileSync(arq);
  if(b.slice(1, 4).toString() !== 'PNG') return null;
  return b.readUInt32BE(16) + 'x' + b.readUInt32BE(20);
}

const urls = new Set();
for(const e of ESTACOES){
  const html = fs.readFileSync(path.join(PUB, e + '.html'), 'utf8');
  const head = html.slice(0, html.indexOf('</head>') > 0 ? html.indexOf('</head>') : html.indexOf('<body'));
  ok(e + ': vira app (apple-mobile-web-app-capable)', /<meta name="apple-mobile-web-app-capable" content="yes">/.test(head));
  ok(e + ': tem o nome da estação na tela de início', /<meta name="apple-mobile-web-app-title" content="[^"]+">/.test(head));
  ok(e + ': o ícone é o DELA', head.indexOf('href="/icones/' + e + '-180.png"') >= 0);
  const m = head.match(/<link rel="manifest" href="([^"]+)"([^>]*)>/);
  ok(e + ': o manifest é o DELA', !!m && m[1] === '/app/' + e + '.webmanifest', m && m[1]);
  ok(e + ': carrega o ipad.css', head.indexOf('href="/ipad.css"') >= 0);
  ok(e + ': o viewport não deixa dar zoom', /maximum-scale=1/.test(head));
  ok(e + ': uma viewport só (a antiga saiu)', (head.match(/name="viewport"/g) || []).length === 1);

  let man = null;
  try{ man = JSON.parse(fs.readFileSync(path.join(PUB, 'app', e + '.webmanifest'), 'utf8')); }catch(err){}
  ok(e + ': o manifest é JSON válido', !!man);
  if(man){
    ok(e + ': abre na estação dele', man.start_url === '/' + e, man.start_url);
    urls.add(man.start_url);
    ok(e + ': em tela cheia (standalone)', man.display === 'standalone');
    for(const ic of man.icons || []){
      const arq = path.join(PUB, ic.src);
      ok(e + ': o ícone ' + ic.sizes + ' existe e tem esse tamanho', fs.existsSync(arq) && tamanhoPng(arq) === ic.sizes,
         fs.existsSync(arq) ? tamanhoPng(arq) : 'não existe');
    }
  }
  const t180 = path.join(PUB, 'icones', e + '-180.png');
  ok(e + ': o ícone do iPad tem 180x180', fs.existsSync(t180) && tamanhoPng(t180) === '180x180');
}
ok('cada estação abre numa tela diferente — um manifest por estação', urls.size === ESTACOES.length, [...urls].join(', '));

const css = fs.readFileSync(path.join(PUB, 'ipad.css'), 'utf8');
ok('ipad.css: sem zoom por toque duplo', /touch-action:\s*manipulation/.test(css));
ok('ipad.css: sem o efeito elástico', /overscroll-behavior:\s*none/.test(css));
ok('ipad.css: sem a lupa no toque longo', /body\s*\{[^}]*user-select:\s*none/.test(css));
ok('ipad.css: e o campo de bipe continua selecionável', /input[^{]*\{[^}]*user-select:\s*text/.test(css));

console.log('\n' + (falhas ? ('FALHARAM ' + falhas + ' de ' + n) : ('todos os ' + n + ' casos passaram')) + '\n');
process.exit(falhas ? 1 : 0);

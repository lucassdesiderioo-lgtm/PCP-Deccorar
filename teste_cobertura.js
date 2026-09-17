#!/usr/bin/env node
/* teste_cobertura.js — TODA rota registrada tem permissão declarada.
 *
 *   node teste_cobertura.js
 *
 * Este arquivo é a outra metade da dívida 16 (17/09/2026). O `permDaRota`
 * passou a NEGAR por padrão: rota sem declaração responde 403 em vez de nascer
 * aberta a qualquer pessoa logada. Isso fecha o buraco — e cria outro risco,
 * simétrico: a rota nova de amanhã, esquecida, **para de funcionar**.
 *
 * O `teste_acesso.js` cobre a regra com um app de mentira. Este aqui sobe os
 * módulos DE VERDADE, com o banco de verdade criado do zero, e varre o que o
 * Express registrou. É o único lugar do projeto que responde:
 *
 *     "as 150 e tantas rotas que existem hoje estão todas declaradas?"
 *
 * Quem criar uma rota sem a linha no `permDaRota()` descobre aqui, no CI, e não
 * na bancada três dias depois — que é exatamente a diferença entre uma trava
 * que protege e uma que a equipe aprende a contornar (§7, armadilha #6).
 *
 * ⚠️ NÃO transforme a falha num aviso. Se um dia uma rota legítima não puder
 * ser declarada, o conserto é declará-la (ou pô-la na lista de apoio de tela),
 * nunca afrouxar este arquivo: ele é a única rede embaixo do padrão "negar".
 */
const fs = require('fs'), os = require('os'), path = require('path');

const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'pcp-cobertura-'));
/* O banco e as pastas desta rodada são descartáveis. Tem que vir ANTES de
   qualquer require nosso: o db.js e o caminhos.js leem isto no carregamento. */
process.env.PCP_DIR = tmp;

let n = 0, falhas = 0;
function ok(desc, cond, detalhe){
  n++;
  if(cond) console.log('  ok  ' + n + ' — ' + desc);
  else { falhas++; console.log('  FALHOU ' + n + ' — ' + desc + (detalhe ? '\n         ' + detalhe : '')); }
}

const express = require('express');
const app = express();
const db = require('./db.js');

/* A MESMA ORDEM DO server.js, e o mesmo conjunto. Um módulo que entrar lá e não
   entrar aqui deixa as rotas dele sem conferência — por isso a lista fica à
   vista, e o caso final compara o total com o que o server.js carrega. */
const MODULOS = ['sku_cad_route','painel_route','exp_route','mont_route','carreg_route',
  'backup_route','rel_route','alvo_route','est_route','plan_route','modo_route','cruz_route',
  'cont_route','etq_route','dev_route','cad_route','sku_route','compras_route','ficha_route',
  'pedido_route','receb_route','ger_route','st_route','teste_route'];

require('./auth')(app, db);
const quebrados = [];
for(const m of MODULOS){
  try{ require('./' + m)(app, db); }catch(e){ quebrados.push(m + ': ' + e.message); }
}
require('./acesso')(app, db);
const AC = app.locals.acesso;

console.log('\n── 1. os módulos sobem ──');
ok('todos os módulos de rota carregaram', quebrados.length === 0, quebrados.join(' · '));

console.log('\n── 2. nenhuma rota registrada nasce negada ──');
const c = AC.coberturaDeRotas();
ok('a varredura achou as rotas do app (mais de cem)', c.total > 100, 'achou ' + c.total);
ok('ZERO rotas sem permissão declarada', c.nao_declaradas === 0,
   c.nao_declaradas + ' rota(s):\n         ' + c.lista_nao_declaradas.join('\n         '));

console.log('\n── 2-B. as rotas que moram no próprio server.js ──');
/* ⚠️ PONTO CEGO QUE O BOOT PEGOU E ESTE ARQUIVO NÃO (17/09/2026): nem toda
   rota está num `*_route.js`. O `server.js` registra as dele direto — o ajuste
   de estoque, a revisão, as telas —, e como ele não é carregável (abre porta e
   banco real) elas não entram na varredura acima. `GET /api/producao` era uma
   delas, e só apareceu quando o servidor de verdade subiu.
   A varredura aqui é pelo TEXTO do arquivo, que é a mesma técnica do
   `teste_caminhos.js`: não é elegante, e é o que enxerga. */
const fonteServidor = fs.readFileSync(path.join(__dirname, 'server.js'), 'utf8');
const doServidor = [];
const rx = /app\.(get|post|put|delete)\('([^']+)'/g;
let achado;
while((achado = rx.exec(fonteServidor)) !== null)
  doServidor.push({ metodo: achado[1].toUpperCase(), rota: achado[2] });
ok('achou as rotas declaradas dentro do server.js', doServidor.length > 10,
   'achou ' + doServidor.length);
const negadasNoServer = doServidor
  .filter(r => AC.permDaRota(r.rota.replace(/:([A-Za-z_0-9]+)\??/g, '1'), r.metodo) === '@negado')
  .map(r => r.metodo + ' ' + r.rota);
ok('nenhuma delas nasce negada (' + doServidor.length + ' conferidas)',
   negadasNoServer.length === 0, negadasNoServer.join(', '));

console.log('\n── 3. as telas e os arquivos que elas carregam ──');
/* ⚠️ COM SESSÃO ABERTA, O ARQUIVO DA TELA TAMBÉM PASSA PELO `decidir`. A lista
   LIVRE do auth.js tem só /login, /login.html, /nav.js e /favicon.ico — todo o
   resto do public/ é julgado. Negar por padrão sem cobrir isso tiraria o
   JavaScript de todas as telas, e o sintoma (tela em branco) não se parece nem
   de longe com "mexeram na permissão". */
const publicos = fs.readdirSync(path.join(__dirname, 'public'));
const arquivos = publicos.filter(f => /\.(js|css|png|jpg|svg|ico|webp)$/i.test(f));
const negados = arquivos.filter(f => AC.permDaRota('/' + f, 'GET') === '@negado');
ok('nenhum arquivo de apoio do public/ ficou negado (' + arquivos.length + ' conferidos)',
   negados.length === 0, negados.join(', '));

const telas = publicos.filter(f => f.endsWith('.html'));
/* As DUAS telas que são de qualquer sessão, e o motivo de cada uma:
   · login.html — acontece antes de existir sessão (está na lista LIVRE);
   · setor.html — é onde a pessoa diz onde vai trabalhar hoje, antes de ter
     qualquer coisa marcada; o auth.js sempre a tratou como '*' (§ TELAS).
   Qualquer OUTRA tela aberta a quem só fez login é o buraco da dívida 16. */
const TELAS_DE_QUALQUER_SESSAO = ['login.html', 'setor.html'];
const telasAbertas = telas.filter(f => AC.permDaRota('/' + f, 'GET') === '@logado'
                                       && TELAS_DE_QUALQUER_SESSAO.indexOf(f) < 0);
ok('nenhuma tela .html continua aberta a qualquer pessoa logada (' + telas.length + ' conferidas)',
   telasAbertas.length === 0, telasAbertas.join(', '));
/* A gêmea tem que pedir o MESMO que a tela — nem mais, nem menos. Mais tranca
   quem podia entrar; menos é o buraco que ela veio fechar. */
const paresErrados = telas
  .map(f => ({ f, tela: '/' + f.replace(/\.html$/, ''), }))
  .filter(x => x.f !== 'login.html' && x.f !== 'index.html')
  .filter(x => JSON.stringify(AC.permDaRota('/' + x.f, 'GET')) !== JSON.stringify(AC.permDaRota(x.tela, 'GET')))
  .map(x => x.f + ' (' + JSON.stringify(AC.permDaRota('/' + x.f,'GET')) + ') != ' + x.tela + ' (' + JSON.stringify(AC.permDaRota(x.tela,'GET')) + ')');
ok('cada gêmea .html pede o mesmo que a tela dela', paresErrados.length === 0,
   paresErrados.join('\n         '));

console.log('\n── 4. o sob medida fica de fora, e de propósito ──');
/* O módulo montado em /sobmedida tem portão próprio (tecido/montar.js) e o
   auth.js passa por ele ANTES do decidir — um dono só por caminho (§19).
   Acusá-lo aqui seria ruído permanente, e ruído permanente é o que faz a lista
   deixar de ser lida. */
ok('nenhuma rota /sobmedida entra na varredura',
   !c.linhas.some(l => l.rota.indexOf('/sobmedida') === 0));

console.log('\n── 5. a lista de módulos não pode envelhecer ──');
/* Um módulo que entre no server.js e não aqui teria as rotas dele sem esta
   conferência — o mesmo defeito da lista TODAS_ROTAS que saiu, uma casa adiante. */
const servidor = fs.readFileSync(path.join(__dirname, 'server.js'), 'utf8');
const doServer = (servidor.match(/require\('\.\/([a-z_]+_route)'\)/g) || [])
  .map(s => s.replace(/require\('\.\//, '').replace(/'\)/, ''));
const faltando = doServer.filter(m => MODULOS.indexOf(m) < 0);
ok('todo módulo de rota do server.js está nesta varredura', faltando.length === 0,
   'fora da lista: ' + faltando.join(', '));

console.log('\n────────────────────────────────────────────');
console.log('  ' + c.total + ' rotas registradas · ' + c.nao_declaradas + ' sem declaração');
console.log(falhas ? '  ' + falhas + ' de ' + n + ' FALHARAM' : '  todos os ' + n + ' casos passaram');
try{ db.close(); }catch(e){}
try{ fs.rmSync(tmp, { recursive:true, force:true }); }catch(e){}
process.exit(falhas ? 1 : 0);

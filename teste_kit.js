/* teste_kit.js — o CONTEUDO da etiqueta do kit (spec GERADOR-ETIQUETA-KIT, fase 1).
 *
 * Duas coisas que o operador nunca ve e que quebram calado:
 *
 *  1. O CODIGO TROCADO EM SILENCIO. O rolo de etiquetas impresso com o codigo
 *     antigo para de bater no bipe da Embalagem — e a bancada descobre isso com
 *     a peca na mao, sem ninguem saber que alguem trocou o codigo. Por isso a
 *     troca exige `confirmar`, e SEM ele nada e gravado (nao basta avisar na
 *     tela: quem chama a rota por fora tambem tem que esbarrar).
 *
 *  2. O CAMPO QUE SOME. `POST /api/skus` zera o estoque quando o corpo nao traz
 *     `estoque` (divida 15 do §14) — a mesma forma de falhar cabe aqui: um POST
 *     sem `linha1` nao pode apagar a linha 1. Campo ausente NAO e campo vazio.
 *
 * Rode:  node teste_kit.js
 */
const fs = require('fs');
const os = require('os');
const path = require('path');
const Database = require('better-sqlite3');

let n = 0, falhas = 0;
function ok(desc, cond, detalhe){
  n++;
  if(cond) console.log('  ok  ' + n + ' — ' + desc);
  else { falhas++; console.log('  FALHOU ' + n + ' — ' + desc + (detalhe ? '\n         ' + detalhe : '')); }
}
function eq(desc, achado, esperado){
  ok(desc, achado === esperado, 'esperado ' + JSON.stringify(esperado) + ', veio ' + JSON.stringify(achado));
}

// ── harness: banco temporario + app falso (guarda os handlers por metodo+rota) ──
const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'kit-'));
const db = new Database(path.join(dir, 'teste.db'));
db.exec(`
  CREATE TABLE skus (codigo TEXT PRIMARY KEY, estoque INTEGER DEFAULT 0, cor TEXT);
  CREATE TABLE fila (id INTEGER PRIMARY KEY AUTOINCREMENT, codigo TEXT, situacao TEXT,
    modo TEXT, revisado_em TEXT, embalado_em TEXT);
  CREATE TABLE producao (id INTEGER PRIMARY KEY AUTOINCREMENT, codigo TEXT, qtd INTEGER,
    produzido INTEGER DEFAULT 0, data TEXT);
`);
const rotas = {};
const app = {
  locals:{},
  get(p, h){ rotas['GET ' + p] = h; },
  post(p, h){ rotas['POST ' + p] = h; },
  delete(p, h){ rotas['DELETE ' + p] = h; }
};
// auditoria de mentira: guarda as linhas para o caso do registro (R9)
const auditoria = [];
app.locals.acesso = { auditar(req, cat, acao, alvo, detalhe){ auditoria.push({ cat, acao, alvo, detalhe }); } };
require('./mont_route')(app, db);

function chamar(metodo, rota, corpo){
  const h = rotas[metodo + ' ' + rota];
  if(!h) throw new Error('rota nao registrada: ' + metodo + ' ' + rota);
  let out = { status:200, body:null };
  const res = {
    status(c){ out.status = c; return res; },
    json(b){ out.body = b; return res; },
    send(b){ out.body = b; return res; }
  };
  h({ body: corpo || {}, headers:{}, usuario:{ id:1, nome:'Gestao' } }, res);
  return out;
}
const valorDe = (chave) => {
  const r = db.prepare('SELECT valor FROM config WHERE chave=?').get(chave);
  return r ? r.valor : null;
};

console.log('\n── 1. os padroes da R4 ──');
let r = chamar('GET', '/api/config/kit/etiqueta');
eq('linha 1 nasce "SEU MANUAL ESTÁ"', r.body.linha1, 'SEU MANUAL ESTÁ');
eq('linha 2 nasce "AQUI"', r.body.linha2, 'AQUI');
eq('a legenda do QR nasce "MANUAL"', r.body.qr_legenda, 'MANUAL');
eq('o link nasce vazio', r.body.link, '');
ok('sem link, a etiqueta ainda nao pode ser impressa (R7)', r.body.pronta === false);

console.log('\n── 2. o link (R4) ──');
r = chamar('POST', '/api/config/kit/etiqueta', { link:'http://drive.google.com/drive/folders/abc' });
eq('link sem https e recusado', r.status, 400);
eq('...e nada foi gravado', valorDe('kit_etq_link'), null);
r = chamar('POST', '/api/config/kit/etiqueta', { link:'drive.google.com/drive/folders/abc' });
eq('link sem esquema nenhum tambem e recusado', r.status, 400);
/* Fora do Drive AVISA e DEIXA SALVAR — a spec e explicita. Recusar aqui seria
   trava que dispara no caso legitimo (armadilha #6): o manual pode estar em
   outro lugar, e quem decide isso e quem cola o link, nao o sistema. */
r = chamar('POST', '/api/config/kit/etiqueta', { link:'https://exemplo.com/manual' });
eq('link fora do Drive SALVA', r.status, 200);
ok('...com aviso', !!r.body.aviso && /drive/i.test(r.body.aviso));
eq('...e o valor foi gravado', valorDe('kit_etq_link'), 'https://exemplo.com/manual');
r = chamar('POST', '/api/config/kit/etiqueta', { link:'https://drive.google.com/drive/folders/1a2b3c' });
eq('link do Drive salva sem aviso', r.body.aviso, null);
/* Link salvo, mas sem Codigo do kit ainda: a impressao continua bloqueada, e a
   tela tem que saber dizer o que falta antes de a fase 3 existir (R7). */
r = chamar('GET','/api/config/kit/etiqueta');
ok('so com o link, a etiqueta ainda nao esta pronta', r.body.pronta === false);
ok('...e a tela sabe o que falta: o Código do kit',
  (r.body.falta||[]).some(f => /Código do kit/.test(f)), JSON.stringify(r.body.falta));

console.log('\n── 3. os textos (R4) ──');
r = chamar('POST', '/api/config/kit/etiqueta', { qr_legenda:'MANUAL DE INSTALACAO' });
eq('legenda acima de 10 caracteres e recusada', r.status, 400);
eq('...e a legenda anterior continua de pe', chamar('GET','/api/config/kit/etiqueta').body.qr_legenda, 'MANUAL');
r = chamar('POST', '/api/config/kit/etiqueta', { qr_legenda:'INSTALACAO' });
eq('legenda de exatos 10 caracteres passa', r.status, 200);
r = chamar('POST', '/api/config/kit/etiqueta', { linha1:'SEU MANUAL ESTÁ AQUI DENTRO DA CAIXA' });
eq('linha 1 longa demais e recusada (limite provisorio ate a fase 2)', r.status, 400);
/* Acento tem que sobreviver ao banco: e o "ESTÁ" da etiqueta atual. */
r = chamar('POST', '/api/config/kit/etiqueta', { linha1:'SEU MANUAL ESTÁ', linha2:'AQUI DENTRO' });
eq('acento volta inteiro do banco', chamar('GET','/api/config/kit/etiqueta').body.linha1, 'SEU MANUAL ESTÁ');
eq('linha 2 gravada', valorDe('kit_etq_linha2'), 'AQUI DENTRO');
/* A DIVIDA 15 DO §14 EM FORMA DE CASO: campo ausente nao e campo vazio. */
r = chamar('POST', '/api/config/kit/etiqueta', { link:'https://drive.google.com/drive/folders/1a2b3c' });
eq('POST so com o link NAO apaga a linha 1', valorDe('kit_etq_linha1'), 'SEU MANUAL ESTÁ');
eq('...nem a linha 2', valorDe('kit_etq_linha2'), 'AQUI DENTRO');
/* Mas apagar DE PROPOSITO tem que funcionar — linha 2 vazia e etiqueta de uma
   linha so, nao erro. */
r = chamar('POST', '/api/config/kit/etiqueta', { linha2:'' });
eq('linha 2 vazia e uma decisao, e e respeitada', valorDe('kit_etq_linha2'), '');
eq('...e o GET nao "conserta" isso com o padrao', chamar('GET','/api/config/kit/etiqueta').body.linha2, '');
chamar('POST', '/api/config/kit/etiqueta', { linha2:'AQUI' });

console.log('\n── 4. a troca do Codigo do kit (R8) ──');
r = chamar('POST', '/api/config/kit', { kit:'KITENVIO' });
eq('o PRIMEIRO codigo salva direto — nao ha etiqueta impressa para quebrar', r.status, 200);
eq('...e ficou gravado', valorDe('kit_codigo'), 'KITENVIO');
r = chamar('POST', '/api/config/kit', { kit:'KITENVIO' });
eq('salvar o MESMO codigo de novo nao pede confirmacao', r.status, 200);
r = chamar('POST', '/api/config/kit', { kit:'KITNOVO' });
eq('trocar por outro codigo e RECUSADO sem confirmar', r.status, 409);
ok('...com o aviso da R8, nomeando os dois codigos',
  /KITENVIO/.test(r.body.erro) && /KITNOVO/.test(r.body.erro) && /Embalagem/.test(r.body.erro), JSON.stringify(r.body));
ok('...e a tela sabe que e pergunta, nao erro', r.body.confirmar_troca === true);
eq('...E NADA FOI GRAVADO: a Embalagem continua bipando o codigo antigo', valorDe('kit_codigo'), 'KITENVIO');
/* Apagar o codigo quebra o bipe do mesmo jeito que trocar. */
r = chamar('POST', '/api/config/kit', { kit:'' });
eq('apagar o codigo tambem pede confirmacao', r.status, 409);
eq('...e nao apagou', valorDe('kit_codigo'), 'KITENVIO');
const antesDaTroca = auditoria.length;
r = chamar('POST', '/api/config/kit', { kit:'KITNOVO', confirmar:true });
eq('com confirmar, a troca acontece', r.status, 200);
eq('...e o novo codigo esta gravado', valorDe('kit_codigo'), 'KITNOVO');

console.log('\n── 5. o registro (R9) ──');
ok('a troca de codigo foi para a auditoria', auditoria.length > antesDaTroca);
const linhaTroca = auditoria[auditoria.length - 1];
ok('...dizendo qual era o codigo antigo',
  linhaTroca && /KITENVIO/.test(String(linhaTroca.detalhe)), JSON.stringify(linhaTroca));
ok('a edicao dos campos da etiqueta tambem e registrada',
  auditoria.some(l => /etiqueta/i.test(String(l.acao))), JSON.stringify(auditoria.map(l => l.acao)));
/* Recusa nao e acao: auditoria cheia de tentativa recusada enterra a troca de
   verdade no ruido — a mesma razao do amortecimento do custo.ver (§18). */
const antesRecusa = auditoria.length;
chamar('POST', '/api/config/kit', { kit:'OUTRO' });
eq('a RECUSA nao vira linha de auditoria', auditoria.length, antesRecusa);

console.log('\n── 6. o limite das linhas sai do DESENHO (fase 2) ──');
/* O numero era 20 por chute. Agora e medido em public/kit_etiqueta.js, com a
   largura real das letras na menor altura legivel. Se alguem reescrever o
   numero aqui no servidor, as duas reguas divergem no dia em que o desenho
   mudar de tamanho — e o texto passa a sair pela borda da etiqueta. */
const DESENHO = require('./public/kit_etiqueta.js');
const LIM = DESENHO.limiteDeCaracteres();
eq('o GET publica o limite que o desenho mediu',
  chamar('GET','/api/config/kit/etiqueta').body.limites.linha, LIM);
r = chamar('POST', '/api/config/kit/etiqueta', { linha1:'I'.repeat(LIM) });
eq('16 letras estreitas passam', r.status, 200);
r = chamar('POST', '/api/config/kit/etiqueta', { linha1:'I'.repeat(LIM+1) });
eq('um caractere acima da cerca e recusado', r.status, 400);
ok('...dizendo o limite', String(r.body.erro).indexOf(String(LIM)) >= 0, JSON.stringify(r.body.erro));
/* ⚠️ O CASO QUE PROVA QUE QUEM MANDA E A MEDIDA. 16 'M' tem o mesmo TAMANHO
   que 16 'I' e ocupa quase o triplo da largura. Se a regra fosse contar
   caractere, este texto passaria e sairia cortado no papel — e ninguem na
   fabrica veria isso acontecer, porque a etiqueta ja sai errada da impressora. */
r = chamar('POST', '/api/config/kit/etiqueta', { linha1:'M'.repeat(LIM) });
eq('16 letras LARGAS passam na cerca e sao recusadas pela medida', r.status, 400);
ok('...com a recusa falando de caber, nao de contar',
  /não cabe/.test(String(r.body.erro)), JSON.stringify(r.body.erro));
eq('...e nada foi gravado', valorDe('kit_etq_linha1'), 'I'.repeat(LIM));
/* As duas linhas dividem o mesmo tamanho de letra: uma linha 2 comprida pode
   fazer a linha 1 (que este POST nem tocou) deixar de caber. Por isso a medida
   olha o RESULTADO, e nao so o campo enviado. */
chamar('POST', '/api/config/kit/etiqueta', { linha1:'SEU MANUAL ESTÁ' });
r = chamar('POST', '/api/config/kit/etiqueta', { linha2:'M'.repeat(LIM) });
eq('a medida olha as DUAS linhas, nao so a que veio', r.status, 400);
chamar('POST', '/api/config/kit/etiqueta', { linha1:'SEU MANUAL ESTÁ' });

console.log('\n── 7. o desenho sabe o que falta ANTES de imprimir (R7) ──');
const cheio = { linha1:'SEU MANUAL ESTÁ', linha2:'AQUI', qr_legenda:'MANUAL',
  codigo:'KITINSTALACAO', link:'https://drive.google.com/drive/folders/1H8Pe8XngnQChRFoJ1MBl7Ni4hi3HGHqb' };
eq('com tudo preenchido, nenhum problema', DESENHO.medir(cheio).problemas.length, 0);
ok('sem link, o desenho acusa',
  DESENHO.medir(Object.assign({}, cheio, {link:''})).problemas.some(p => /link/.test(p)));
ok('sem Código do kit, o desenho acusa',
  DESENHO.medir(Object.assign({}, cheio, {codigo:''})).problemas.some(p => /Código do kit/.test(p)));
ok('a letra ENCOLHE para caber, em vez de vazar pela borda',
  DESENHO.medir(cheio).cap < DESENHO.DESENHO.texto.capAlvo);
ok('...mas nunca abaixo do minimo legivel',
  DESENHO.medir(cheio).cap >= DESENHO.DESENHO.texto.capMin);

console.log('\n── 8. o QR da previa cai na grade de PIXELS ──');
/* ⚠️ O CASO QUE NASCEU DO CELULAR NAO LENDO. Na fase 2 a previa desenhava o QR
   de 20 mm a 4,6 px/mm: 2,49 px por modulo. O navegador arredonda cada borda
   para o pixel mais proximo e a grade sai com modulos de 2 e de 3 px
   alternando — inclusive na LINHA DE TIMING, que e a regua que o leitor usa
   para medir o modulo. Grade que respira e QR que nao le, e nada na tela
   denuncia isso: o desenho continua com cara de QR. */
[[4.6,37],[7,37],[8,45],[5,29],[12,37]].forEach(([escala,mods]) => {
  const g = DESENHO.gradeDoQr(escala, mods);
  ok('escala '+escala+' com '+mods+' modulos: o modulo tem pixel INTEIRO',
    Math.abs(g.passo*escala - Math.round(g.passo*escala)) < 1e-9,
    'deu ' + (g.passo*escala) + ' px');
  ok('...e a origem do QR tambem cai em pixel inteiro',
    Math.abs(g.x*escala - Math.round(g.x*escala)) < 1e-9 &&
    Math.abs(g.topo*escala - Math.round(g.topo*escala)) < 1e-9,
    'x=' + (g.x*escala) + ' topo=' + (g.topo*escala));
});
/* O ajuste nao pode "consertar" o QR empurrando ele para fora do lugar: ele
   continua dentro do espaco reservado, e a folga do silencio segue de pe. */
const g8 = DESENHO.gradeDoQr(8, 37), QRD = DESENHO.DESENHO.qr;
ok('o QR ajustado continua dentro do espaco reservado',
  g8.lado <= QRD.lado + 1e-9 && g8.x >= QRD.x - 1e-9 &&
  g8.x + g8.lado <= QRD.x + QRD.lado + 1e-9,
  'lado ' + g8.lado.toFixed(2) + ' mm, x ' + g8.x.toFixed(2));
ok('e o desenho do PAPEL nao mudou: o QR nominal segue 20 mm',
  QRD.lado === 20);
eq('a 8 px/mm o modulo fecha em 4 px cheios (era 2,49 e nao lia)',
  DESENHO.gradeDoQr(8, 37).passoPx, 4);
/* E o arredondamento e sempre PARA BAIXO: para cima o QR passaria dos 20 mm e
   comeria a folga do silencio, trocando um problema de leitura por outro. */
ok('o QR ajustado nunca fica MAIOR que o espaco reservado, em escala nenhuma',
  [3,4,4.6,5,6,7,8,9,10,12,16].every(e => DESENHO.gradeDoQr(e,37).lado <= QRD.lado + 1e-9));

console.log('\n── 9. a Embalagem nao muda (R10) ──');
/* A tela da Embalagem le esta rota, e so ela. Se o GET mudar de formato, a
   bancada para de conferir o kit sem ninguem mexer no montagem.html. */
r = chamar('GET', '/api/config/kit');
eq('GET /api/config/kit continua devolvendo {kit}', r.body.kit, 'KITNOVO');

console.log('\n' + (falhas ? falhas + ' FALHA(S) em ' + n + ' casos' : 'todos os ' + n + ' casos passaram'));
try{ db.close(); fs.rmSync(dir, { recursive:true, force:true }); }catch(e){}
process.exit(falhas ? 1 : 0);

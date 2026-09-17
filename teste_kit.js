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

console.log('\n── 9. UM DESENHO, DOIS DESENHISTAS (fase 3) ──');
/* ⚠️ O CASO CENTRAL DA FASE 3. O PDF nao repete o desenho: ele le a MESMA
   lista que a previa desenha. Se alguem escrever uma medida dentro do
   `kit_pdf.js`, a etiqueta da tela e a do rolo passam a divergir — e a
   divergencia so aparece com o rolo impresso, que e o que esta spec veio
   consertar. */
const itens = DESENHO.elementos(cheio, { escala:8 });
ok('elementos() devolve a etiqueta como lista', Array.isArray(itens) && itens.length > 50);
ok('tudo cai DENTRO da etiqueta de 100 x 35 mm', itens.every(it => {
  if(it.tipo === 'ret') return it.x >= 0 && it.y >= 0 &&
    it.x + it.largura <= DESENHO.ETIQUETA.largura + 1e-9 &&
    it.y + it.altura <= DESENHO.ETIQUETA.altura + 1e-9;
  if(it.tipo === 'circulo') return it.cx - it.raio >= 0 && it.cy + it.raio <= DESENHO.ETIQUETA.altura;
  if(it.tipo === 'poligono') return it.pontos.every(p => p[0] >= 0 && p[1] >= 0 &&
    p[0] <= DESENHO.ETIQUETA.largura && p[1] <= DESENHO.ETIQUETA.altura);
  return it.x >= 0 && it.base <= DESENHO.ETIQUETA.altura;
}));
eq('so existem quatro tipos de item — quem desenha nao precisa saber mais',
  [...new Set(itens.map(i => i.tipo))].sort().join(','), 'circulo,poligono,ret,texto');
ok('a letra do texto e a MESMA que `medir` calculou (uma regua so)',
  itens.filter(i => i.tipo==='texto' && i.texto===cheio.linha1)[0].cap === DESENHO.medir(cheio).cap);
/* A SETA TEM HASTE. Um triangulo sozinho dentro do circulo nao se le como
   seta, se le como BOTAO DE PLAY — numa etiqueta que manda apontar a camera
   para um QR, simbolo de video e a pior confusao possivel. */
const seta = itens.filter(i => i.tipo==='poligono')[0];
eq('a seta e um poligono de 7 pontos (circulo + haste), nao um triangulo',
  seta.pontos.length, 7);
eq('e ela e BRANCA, por cima do circulo preto', seta.cor, 'branco');
/* O QR do PAPEL cai na grade da IMPRESSORA. A 203 dpi um milimetro tem 8
   pontos; modulo em ponto quebrado faz o rasterizador da Zebra alternar
   modulos de 4 e 5 pontos — o mesmo defeito que quebrou a previa, agora no
   papel, onde ele custa o rolo inteiro. */
const passoQr = itens.filter(i => i.tipo==='ret' && i.altura < 1)[0].altura;
ok('o modulo do QR fecha em ponto INTEIRO da impressora (8/mm a 203 dpi)',
  Math.abs(passoQr*8 - Math.round(passoQr*8)) < 1e-9, 'deu ' + (passoQr*8) + ' pontos');
// sem link nao ha QR; sem codigo nao ha barras — e nao um QR em branco
ok('sem link, nenhum modulo de QR entra na lista',
  DESENHO.elementos(Object.assign({}, cheio, {link:''})).filter(i=>i.tipo==='ret'&&i.altura<1).length === 0);
ok('sem Código do kit, nenhuma barra entra na lista',
  DESENHO.elementos(Object.assign({}, cheio, {codigo:''})).filter(i=>i.tipo==='ret'&&i.altura>5).length === 0);

console.log('\n── 10. o PDF (R6 — a impressao) ──');
const PDF = require('./kit_pdf.js');
eq('a etiqueta pronta nao tem impedimento', PDF.conferir(cheio, 1).pronta, true);
ok('sem link o PDF e recusado (R7)', PDF.conferir(Object.assign({},cheio,{link:''}),1).pronta === false);
ok('sem Código do kit o PDF e recusado (R7)', PDF.conferir(Object.assign({},cheio,{codigo:''}),1).pronta === false);
/* ⚠️ A LISTA DE PROBLEMAS VEM INTEIRA. Dizer um por vez faz a pessoa corrigir,
   tentar, descobrir o seguinte e concluir que o sistema inventa impedimento
   novo a cada clique — e ai ela para de ler o aviso (armadilha #6). */
eq('faltando os dois, o aviso traz os DOIS',
  PDF.conferir({}, 1).problemas.length >= 2, true);
[0, -1, 501, 1.5, 'tres', null].forEach(q =>
  ok('quantidade ' + JSON.stringify(q) + ' e recusada', PDF.conferir(cheio, q).pronta === false));
[1, 2, 500].forEach(q =>
  ok('quantidade ' + q + ' e aceita', PDF.conferir(cheio, q).pronta === true));
eq('o teto do lote e 500', PDF.MAX, 500);
eq('a grade do papel e a da ZD220: 8 pontos por milimetro', PDF.PONTOS_POR_MM, 8);

console.log('\n── 11. a rota de impressao ──');
// A rota e assincrona (o PDF demora): o harness espera a resposta.
async function chamarAsync(metodo, rota, corpo, usuario){
  const h = rotas[metodo + ' ' + rota];
  if(!h) throw new Error('rota nao registrada: ' + metodo + ' ' + rota);
  let out = { status:200, body:null };
  const res = { status(c){ out.status = c; return res; },
                json(b){ out.body = b; return res; }, send(b){ out.body = b; return res; } };
  await h({ body: corpo||{}, headers:{}, usuario: usuario||{ id:1, nome:'Gestao' } }, res);
  return out;
}
(async () => {
  // o card ainda esta sem link neste ponto do teste? garante o estado cheio
  chamar('POST', '/api/config/kit', { kit:'KITINSTALACAO', confirmar:true });
  chamar('POST', '/api/config/kit/etiqueta', { link:cheio.link, linha1:cheio.linha1,
    linha2:cheio.linha2, qr_legenda:cheio.qr_legenda });
  const antes = auditoria.length;

  let p = await chamarAsync('POST', '/api/kit/etiqueta/imprimir', { quantidade:2 });
  eq('imprimir 2 responde 200', p.status, 200);
  eq('...e devolve um PDF', p.body.tipo, 'pdf');
  eq('...com a quantidade pedida', p.body.quantidade, 2);
  ok('...num arquivo que comeca com %PDF',
    Buffer.from(p.body.arquivo, 'base64').slice(0,4).toString() === '%PDF');
  /* Uma PAGINA por etiqueta, todas iguais: o rolo da ZD220 e continuo, e uma
     pagina do tamanho exato faz a impressora avancar exatamente uma. E a
     pagina tem que sair no tamanho da ETIQUETA — "ajustar a pagina" foi o que
     sempre deformou as barras (§7). */
  const doc = await require('pdf-lib').PDFDocument.load(Buffer.from(p.body.arquivo,'base64'));
  eq('...com uma pagina por etiqueta', doc.getPageCount(), 2);
  const pag = doc.getPages()[0], MM = 72/25.4;
  ok('...e a pagina JA nasce com 100 x 35 mm — nao ha o que configurar',
    Math.abs(pag.getWidth() - 100*MM) < 0.01 && Math.abs(pag.getHeight() - 35*MM) < 0.01,
    pag.getWidth().toFixed(2) + ' x ' + pag.getHeight().toFixed(2) + ' pt');
  /* R9 — quem imprimiu, quando e quantas. O rolo circula pela fabrica por
     meses; sem registro ninguem responde de que dia e aquele rolo quando o
     codigo mudar. */
  const reg = auditoria.slice(antes).filter(a => a.acao === 'kit_etiqueta_impressa');
  eq('a impressao vai para a auditoria (R9)', reg.length, 1);
  ok('...dizendo quantas', /2 etiqueta/.test(reg[0].alvo));
  ok('...e com qual codigo o rolo saiu', /KITINSTALACAO/.test(reg[0].detalhe));

  /* ⚠️ O QR LIDO DE VOLTA DO PDF, MODULO A MODULO.
     A licao da fase 2: conferir o QR com a mesma convencao com que ele foi
     escrito nao confere nada. Aqui o caminho e outro — o PDF e ABERTO e os
     retangulos dele sao remontados em matriz, do jeito que um leitor faz.
     E o que pega o defeito que nenhum olho pega: um QR ESPELHADO continua com
     cara de QR na tela e nao le em celular nenhum. A conversao de eixo mora no
     `kit_pdf.js` (a lista mede de cima para baixo, o PDF de baixo para cima),
     e inverter o sinal la e um erro de um caractere. */
  const zlib = require('zlib');
  const bruto = Buffer.from(p.body.arquivo, 'base64');
  let fluxo = '';
  for(let i=0; (i = bruto.indexOf('stream', i)) >= 0; ){
    let s = i+6; if(bruto[s]===13) s++; if(bruto[s]===10) s++;
    const e = bruto.indexOf('endstream', s);
    try{ const t = zlib.inflateSync(bruto.slice(s,e)).toString('latin1');
      if(t.length > fluxo.length) fluxo = t; }catch(err){}
    i = e > 0 ? e : bruto.length;
  }
  // cada retangulo do pdf-lib: "1 0 0 1 <x> <y> cm ... 0 0 m 0 <h> l <w> <h> l"
  const RET = /1 0 0 1 (-?[\d.]+) (-?[\d.]+) cm\n1 0 0 1 0 0 cm\n1 0 0 1 0 0 cm\n0 0 m\n0 ([\d.]+) l\n([\d.]+) \3 l/g;
  const MMpt = 72/25.4, retangulos = [];
  for(let mt; (mt = RET.exec(fluxo)); )
    retangulos.push({ x:+mt[1]/MMpt, y:+mt[2]/MMpt, h:+mt[3]/MMpt, w:+mt[4]/MMpt });
  const QR = require('./public/qr.js');
  const esperado = QR.modulos(cheio.link);
  const g = DESENHO.gradeDoQr(8, esperado.length);
  const escuro = (xm, ym) => retangulos.some(R =>
    xm > R.x - 1e-6 && xm < R.x + R.w + 1e-6 &&
    ym > (DESENHO.ETIQUETA.altura - R.y - R.h) - 1e-6 &&
    ym < (DESENHO.ETIQUETA.altura - R.y) + 1e-6);
  let diferentes = 0;
  for(let i=0;i<esperado.length;i++) for(let j=0;j<esperado.length;j++){
    const lido = escuro(g.x + (j+0.5)*g.passo, g.topo + (i+0.5)*g.passo);
    if(lido !== !!esperado[i][j]) diferentes++;
  }
  /* O PDF tem que trazer UM retangulo para cada `ret` da lista: nenhum se
     perdeu no caminho, e nenhum foi inventado aqui. */
  eq('o PDF traz um retangulo para cada item da lista — nem a mais, nem a menos',
    retangulos.length, DESENHO.elementos(cheio, { escala:8 }).filter(i => i.tipo === 'ret').length);
  eq('o QR remontado do PDF bate MODULO A MODULO com o gerado (nao espelhou, nao deslocou)',
    diferentes, 0);
  /* E a folga do silencio segue de pe no papel: o padrao pede 4 modulos livres
     em volta, e encostar a legenda faz o celular demorar ou desistir. */
  ok('o QR do papel cabe nos 20 mm reservados, com a folga inteira',
    g.x >= DESENHO.DESENHO.qr.x - 1e-9 &&
    g.x + g.lado <= DESENHO.DESENHO.qr.x + DESENHO.DESENHO.qr.lado + 1e-9);

  p = await chamarAsync('POST', '/api/kit/etiqueta/imprimir', { quantidade:9000 });
  eq('lote acima do teto e recusado', p.status, 409);
  /* 409 e nao 400: o corpo esta bem formado; o que falta e o CADASTRO. A tela
     precisa saber a diferenca para mandar preencher o card em vez de dizer que
     a quantidade esta errada. */
  chamar('POST', '/api/config/kit/etiqueta', { link:'' });
  p = await chamarAsync('POST', '/api/kit/etiqueta/imprimir', { quantidade:1 });
  eq('sem o link do manual, nao imprime (R7)', p.status, 409);
  ok('...e diz o que falta', /link/.test(p.body.erro));
  eq('nada foi impresso nesse caso',
    auditoria.filter(a => a.acao === 'kit_etiqueta_impressa').length, 1);
  // devolve o estado que os casos seguintes esperam
  chamar('POST', '/api/config/kit/etiqueta', { link:cheio.link });
  chamar('POST', '/api/config/kit', { kit:'KITNOVO', confirmar:true });

  fim();
})();

function fim(){
console.log('\n── 12. o SEGUNDO CAMINHO nao existe mais (R11, fase 4) ──');
/* ⚠️ O ARQUIVO PRONTO ERA UMA IMAGEM MORTA, e e por isso que ele saiu.
   Ate 17/09/2026 dava para subir a arte da etiqueta (PDF/PNG/JPG/SVG) e
   imprimir por ela. O gerador acompanha o Codigo do kit; o arquivo enviado
   nao. Trocado o codigo, quem imprimisse pelo upload tirava um rolo que nao
   bipa na Embalagem — e descobria com a peca na mao, sem ninguem saber que
   havia dois caminhos.
   Este caso existe para uma coisa so: impedir que o segundo caminho volte
   sem ninguem perceber. Rota de impressao de etiqueta do kit ha UMA. */
['POST /api/kit/label', 'GET /api/kit/label', 'GET /api/kit/label/meta',
 'DELETE /api/kit/label'].forEach(r =>
  ok('a rota ' + r + ' nao existe mais', rotas[r] === undefined));
ok('e a unica porta de impressao e a do gerador',
  typeof rotas['POST /api/kit/etiqueta/imprimir'] === 'function');

console.log('\n── 13. a Embalagem nao muda (R10) ──');
/* A tela da Embalagem le esta rota, e so ela. Se o GET mudar de formato, a
   bancada para de conferir o kit sem ninguem mexer no montagem.html. */
r = chamar('GET', '/api/config/kit');
eq('GET /api/config/kit continua devolvendo {kit}', r.body.kit, 'KITNOVO');

console.log('\n' + (falhas ? falhas + ' FALHA(S) em ' + n + ' casos' : 'todos os ' + n + ' casos passaram'));
try{ db.close(); fs.rmSync(dir, { recursive:true, force:true }); }catch(e){}
process.exit(falhas ? 1 : 0);
}

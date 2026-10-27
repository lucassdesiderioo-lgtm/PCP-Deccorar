#!/usr/bin/env node
/* teste_etiqueta_sku.js — a etiqueta de SKU (100 x 35 mm) em PDF.
 *
 *   node teste_etiqueta_sku.js
 *
 * Escrito ANTES do codigo (§0, risco vermelho: etiqueta). O DEFEITO: a
 * etiqueta de SKU do admin (botao "etiqueta" no Cadastro de SKU) era uma
 * pagina HTML impressa pelo navegador. So encaixava no rolo quando quem
 * imprimia acertava margens "Nenhuma" e escala 100% — toda vez —, baixava o
 * gerador de barras da internet a cada impressao (sem internet, sem barras) e
 * podia soltar uma etiqueta em branco no fim. E a licao que o sob medida
 * (`tecido/dominio/etiqueta_pdf.js`) e o kit (`kit_pdf.js`) ja aprenderam: a
 * pagina tem que NASCER no tamanho da etiqueta.
 *
 * O QUE NAO MUDA, e estes casos travam: o que vai escrito. Titulo, medida,
 * M², cor, barras CODE128 e o codigo — as mesmas frases da pagina antiga.
 * Persiana sem medida continua recusada; acessorio sai sem M².
 *
 * As barras sao LIDAS DE VOLTA do PDF, retangulo a retangulo, e comparadas
 * com o CODE128 do codigo: conferir com a mesma conta que desenhou nao
 * conferiria nada (a licao do QR, §4).
 *
 * Banco temporario, rota chamada direto com um `app` de mentira. Nao abre
 * porta, nao toca no banco de producao.
 */
const Database = require('better-sqlite3');
const fs = require('fs'), os = require('os'), path = require('path'), zlib = require('zlib');
const { PDFDocument } = require('pdf-lib');

let n = 0, falhas = 0;
function ok(desc, cond, detalhe){
  n++;
  if(cond) console.log('  ok  ' + n + ' — ' + desc);
  else { falhas++; console.log('  FALHOU ' + n + ' — ' + desc + (detalhe ? '\n         ' + detalhe : '')); }
}
function eq(desc, achado, esperado){
  ok(desc, JSON.stringify(achado) === JSON.stringify(esperado),
    'esperado ' + JSON.stringify(esperado) + ', veio ' + JSON.stringify(achado));
}

const ETQ = require('./sku_etq_pdf.js');
const barras = require('./public/barras.js');
const MMpt = 72/25.4;

/* Os SKUs como o GET /api/skus os entrega (com os nomes do JOIN). */
const PERSIANA = { codigo:'BK180150BRANCO', descricao:'', largura_cm:180, altura_cm:150,
  cor_codigo:'BRANCO', tecido_codigo:'BLACKOUT', tecido_nome:'Blackout', modelo_nome:'Rolô', exige_medida:1 };
const ACESSORIO = { codigo:'KIT32', descricao:'Kit 32 mm completo', largura_cm:null, altura_cm:null,
  cor_codigo:'', modelo_nome:'Acessório', exige_medida:0 };
const SEM_MEDIDA = Object.assign({}, PERSIANA, { codigo:'BK999', largura_cm:null, altura_cm:null });

/* O PDF aberto como um leitor abriria: as paginas, o texto de cada uma (os
   `<hex> Tj` da Helvetica, que e WinAnsi) e os retangulos (as barras). */
async function abrirPdf(buf){
  const doc = await PDFDocument.load(buf);
  const textos = [], rets = [];
  for(let i=0; (i = buf.indexOf('stream', i)) >= 0; ){
    let s = i+6; if(buf[s]===13) s++; if(buf[s]===10) s++;
    const e = buf.indexOf('endstream', s);
    let t = null;
    try{ t = zlib.inflateSync(buf.slice(s,e)).toString('latin1'); }catch(err){ t = buf.slice(s,e).toString('latin1'); }
    const pag = [], rs = [];
    for(const m of t.matchAll(/<([0-9A-Fa-f]+)> Tj/g))
      pag.push(Buffer.from(m[1],'hex').toString('latin1'));
    const RET = /1 0 0 1 (-?[\d.]+) (-?[\d.]+) cm\n1 0 0 1 0 0 cm\n1 0 0 1 0 0 cm\n0 0 m\n0 ([\d.]+) l\n([\d.]+) \3 l/g;
    for(const m of t.matchAll(RET)) rs.push({ x:+m[1]/MMpt, y:+m[2]/MMpt, h:+m[3]/MMpt, w:+m[4]/MMpt });
    if(pag.length || rs.length){ textos.push(pag); rets.push(rs); }
    i = e > 0 ? e : buf.length;
  }
  return { doc, textos, rets };
}

/* As barras remontadas em modulos: '1' barra, '0' espaco — o que o leitor ve. */
function lerBarras(rs){
  if(!rs.length) return { bits:'', modulo:0 };
  const r = rs.slice().sort((a,b)=>a.x-b.x);
  const modulo = Math.min(...r.map(x=>x.w));
  const x0 = r[0].x, fim = Math.max(...r.map(x=>x.x+x.w));
  const bits = new Array(Math.round((fim-x0)/modulo)).fill('0');
  for(const q of r){
    const a = Math.round((q.x-x0)/modulo), b = Math.round((q.x+q.w-x0)/modulo);
    for(let k=a;k<b;k++) bits[k]='1';
  }
  return { bits:bits.join(''), modulo, x0, fim };
}

(async () => {
  console.log('\n── 1. a pagina nasce no tamanho do rolo ──');
  let buf = await ETQ.gerar(PERSIANA, 3);
  ok('gera um PDF', buf.slice(0,4).toString() === '%PDF');
  let p = await abrirPdf(buf);
  eq('uma pagina por etiqueta — e nenhuma em branco no fim', p.doc.getPageCount(), 3);
  ok('cada pagina tem EXATAMENTE 100 x 35 mm',
    p.doc.getPages().every(g => Math.abs(g.getWidth()-100*MMpt) < 0.01 && Math.abs(g.getHeight()-35*MMpt) < 0.01),
    p.doc.getPages().map(g => (g.getWidth()/MMpt).toFixed(2)+'x'+(g.getHeight()/MMpt).toFixed(2)).join(' '));
  buf = await ETQ.gerar(PERSIANA, 1);
  eq('pedir 1 da 1 pagina', (await PDFDocument.load(buf)).getPageCount(), 1);

  console.log('\n── 2. o que vai escrito e o mesmo da etiqueta antiga ──');
  p = await abrirPdf(await ETQ.gerar(PERSIANA, 1));
  const txt = p.textos[0].join(' | ');
  ok('titulo: ROLO SOBRE MEDIDA - tecido ML cor', /ROLO SOBRE MEDIDA - Blackout ML BRANCO/.test(txt), txt);
  ok('a medida em metros: 1.80 X 1.50', /1\.80 X 1\.50/.test(txt), txt);
  ok('o M² e a cor: M² 2.70 · BRANCO', /M² 2\.70 · BRANCO/.test(txt), txt);
  ok('o codigo escrito por extenso', p.textos[0].includes('BK180150BRANCO'), txt);
  const comDesc = await abrirPdf(await ETQ.gerar(Object.assign({}, PERSIANA, { descricao:'Rolô Blackout Premium' }), 1));
  ok('com descricao cadastrada, o titulo usa a descricao', /ROLO SOBRE MEDIDA - Rolô Blackout Premium/.test(comDesc.textos[0].join(' | ')), comDesc.textos[0].join(' | '));

  console.log('\n── 3. acessorio e persiana sem medida ──');
  p = await abrirPdf(await ETQ.gerar(ACESSORIO, 1));
  const ta = p.textos[0].join(' | ');
  ok('acessorio SAI, com o modelo no titulo e a descricao em destaque', /Acessório/.test(ta) && /Kit 32 mm completo/.test(ta), ta);
  ok('...e SEM M² (area de acessorio nao existe)', !/M²/.test(ta), ta);
  let v = ETQ.conferir(SEM_MEDIDA, 1);
  ok('persiana sem medida e RECUSADA', !v.pronta);
  ok('...dizendo o caminho (aba SKU incompleto)', /medida/i.test(v.problemas.join(' ')) && /SKU incompleto/.test(v.problemas.join(' ')), v.problemas.join(' '));
  let erro = null; try{ await ETQ.gerar(SEM_MEDIDA, 1); }catch(e){ erro = e; }
  ok('...e o gerar tambem recusa (nao sai PDF sem medida)', !!erro);

  console.log('\n── 4. as barras, lidas de volta do papel ──');
  for(const sku of [PERSIANA, ACESSORIO, Object.assign({}, PERSIANA, { codigo:'BK 140X160 cinza-2' })]){
    const q = await abrirPdf(await ETQ.gerar(sku, 1));
    const lido = lerBarras(q.rets[0]);
    eq('as barras de "'+sku.codigo+'" sao o CODE128-B dele, modulo a modulo', lido.bits, barras.modulos(sku.codigo));
    ok('...com o modulo em ponto INTEIRO da Zebra (203 dpi = 8 pontos/mm) e de pelo menos 0,25 mm',
      lido.modulo >= 0.25 - 1e-9 && Math.abs(lido.modulo*8 - Math.round(lido.modulo*8)) < 1e-6, String(lido.modulo));
    ok('...e com o silencio de 10 modulos livre dos dois lados, dentro da etiqueta',
      lido.x0 - 10*lido.modulo >= 0 && lido.fim + 10*lido.modulo <= 100, lido.x0.toFixed(2)+' a '+lido.fim.toFixed(2)+' mm');
  }
  const longo = Object.assign({}, PERSIANA, { codigo:'X'.repeat(60) });
  v = ETQ.conferir(longo, 1);
  ok('codigo comprido demais para caber nas barras e RECUSADO, e nao impresso ilegivel', !v.pronta && /comprido/.test(v.problemas.join(' ')), v.problemas.join(' '));

  console.log('\n── 5. tudo dentro da etiqueta ──');
  const textoLongo = Object.assign({}, ACESSORIO, { codigo:'KITLONGO',
    descricao:'Kit de instalação completo com suportes, parafusos, buchas, tampas laterais e corrente de comando metálica' });
  for(const sku of [PERSIANA, ACESSORIO, textoLongo, Object.assign({}, PERSIANA, { descricao:'Persiana rolô blackout premium com bando e acabamento especial em alumínio' })]){
    const d = await ETQ.desenho(sku);
    const fora = d.itens.filter(it => {
      const x = it.x, dir = it.x + it.largura, topo = it.tipo === 'texto' ? it.base - it.cap : it.topo,
            baixo = it.tipo === 'texto' ? it.base : it.topo + it.altura;
      return x < 1 || dir > 99 || topo < 1 || baixo > 34;
    });
    ok('"'+sku.codigo+(sku.descricao?' / '+sku.descricao.slice(0,20):'')+'": nada encosta na borda (1 mm de folga)', fora.length === 0,
      JSON.stringify(fora.map(f => f.texto || 'barra')));
    const txts = d.itens.filter(it => it.tipo === 'texto').sort((a,b) => a.base - b.base);
    const sobre = txts.some((t,i) => i && t.base - t.cap < txts[i-1].base);
    ok('...e nenhuma linha de texto em cima da outra', !sobre);
  }
  const dl = await ETQ.desenho(textoLongo);
  const linhas = dl.itens.filter(it => it.tipo === 'texto' && /instala|corrente|suportes|parafusos/.test(it.texto));
  ok('descricao comprida quebra em ate 2 linhas (e nao some cortada sem aviso)', linhas.length >= 1 && linhas.length <= 2, JSON.stringify(linhas.map(l=>l.texto)));
  ok('...e o que nao coube termina em reticencias', linhas.length && /…$/.test(linhas[linhas.length-1].texto) , JSON.stringify(linhas.map(l=>l.texto)));
  let estourou = null;
  try{ await ETQ.gerar(Object.assign({}, ACESSORIO, { codigo:'KITX', descricao:'Kit → completo 😀 ✓' }), 1); }catch(e){ estourou = e; }
  ok('caractere que a fonte da etiqueta nao tem (seta, emoji) nao derruba a impressao', !estourou, estourou && estourou.message);

  console.log('\n── 6. a quantidade ──');
  for(const q of [0, -1, 1.5, 'abc', ETQ.MAX + 1])
    ok('quantidade '+JSON.stringify(q)+' e recusada', !ETQ.conferir(PERSIANA, q).pronta);
  ok('o maximo continua '+ETQ.MAX+' por vez (o mesmo da tela antiga)', ETQ.MAX === 200 && ETQ.conferir(PERSIANA, 200).pronta);

  console.log('\n── 7. a rota ──');
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'pcp-etq-sku-'));
  const db = new Database(path.join(tmp, 't.db'));
  db.exec(`
    CREATE TABLE skus (codigo TEXT PRIMARY KEY, descricao TEXT DEFAULT '', cor TEXT DEFAULT '',
      estoque INTEGER DEFAULT 0, alvo INTEGER DEFAULT 0, criado_em TEXT,
      modelo_id INTEGER, largura_cm INTEGER, altura_cm INTEGER, cor_codigo TEXT, tecido_codigo TEXT,
      tem_ficha INTEGER DEFAULT 1, custo_direto REAL);
    CREATE TABLE cor (codigo TEXT PRIMARY KEY, nome TEXT, ativa INTEGER DEFAULT 1);
    CREATE TABLE tecido (codigo TEXT PRIMARY KEY, nome TEXT, ativo INTEGER DEFAULT 1);
    CREATE TABLE modelo (id INTEGER PRIMARY KEY AUTOINCREMENT, nome TEXT, exige_medida INTEGER DEFAULT 1, sob_medida INTEGER DEFAULT 0);
    CREATE TABLE lote (id INTEGER PRIMARY KEY AUTOINCREMENT, codigo TEXT, estagio TEXT DEFAULT 'pendente', bloqueio TEXT, data TEXT);
    INSERT INTO tecido (codigo,nome) VALUES ('BLACKOUT','Blackout');
    INSERT INTO modelo (id,nome,exige_medida) VALUES (1,'Rolô',1),(2,'Acessório',0);
    INSERT INTO skus (codigo,largura_cm,altura_cm,cor_codigo,tecido_codigo,modelo_id,estoque) VALUES ('BK180150BRANCO',180,150,'BRANCO','BLACKOUT',1,7);
    INSERT INTO skus (codigo,cor_codigo,tecido_codigo,modelo_id) VALUES ('BK999','BRANCO','BLACKOUT',1);
  `);
  const rotas = {};
  const app = { locals:{}, get(p,h){ rotas['GET '+p]=h; }, post(p,h){ rotas['POST '+p]=h; }, delete(p,h){ rotas['DELETE '+p]=h; } };
  require('./sku_cad_route')(app, db);
  async function chamar(rota, corpo){
    const h = rotas['POST '+rota]; if(!h) throw new Error('rota nao registrada: POST '+rota);
    const out = { status:200, body:null };
    const res = { status(c){ out.status=c; return res; }, json(b){ out.body=b; return res; }, send(b){ out.body=b; return res; } };
    await h({ body:corpo||{}, params:{}, headers:{}, usuario:{id:1,nome:'Gestao'} }, res);
    return out;
  }
  let r = await chamar('/api/skus/etiqueta', { codigo:'BK180150BRANCO', quantidade:2 });
  eq('POST /api/skus/etiqueta responde 200', r.status, 200);
  eq('...com um PDF', r.body && r.body.tipo, 'pdf');
  const doc = await PDFDocument.load(Buffer.from(r.body.arquivo, 'base64'));
  eq('...de 2 paginas', doc.getPageCount(), 2);
  ok('...lendo o SKU do BANCO (o titulo traz o tecido cadastrado)',
    /Blackout/.test((await abrirPdf(Buffer.from(r.body.arquivo,'base64'))).textos[0].join(' ')));
  r = await chamar('/api/skus/etiqueta', { codigo:'NAOEXISTE', quantidade:1 });
  eq('SKU que nao existe e 404', r.status, 404);
  r = await chamar('/api/skus/etiqueta', { codigo:'BK999', quantidade:1 });
  eq('persiana sem medida e 409 (falta CADASTRO, nao e pedido errado)', r.status, 409);
  ok('...com a frase que manda a aba SKU incompleto', r.body && /SKU incompleto/.test(r.body.erro), r.body && r.body.erro);
  r = await chamar('/api/skus/etiqueta', { codigo:'BK180150BRANCO', quantidade:0 });
  eq('quantidade invalida e 400', r.status, 400);
  eq('imprimir NAO mexe no saldo', db.prepare("SELECT estoque FROM skus WHERE codigo='BK180150BRANCO'").get().estoque, 7);
  try{ db.close(); fs.rmSync(tmp, { recursive:true, force:true }); }catch(e){}

  console.log('\n── 8. a permissao e a tela ──');
  const dirA = fs.mkdtempSync(path.join(os.tmpdir(), 'pcp-etq-sku-acesso-'));
  const dbA = new Database(path.join(dirA, 't.db'));
  dbA.exec(`CREATE TABLE usuarios (id INTEGER PRIMARY KEY AUTOINCREMENT, nome TEXT, pin_hash TEXT, salt TEXT, areas TEXT, ativo INTEGER DEFAULT 1);
            CREATE TABLE config (chave TEXT PRIMARY KEY, valor TEXT);`);
  const appA = { locals:{}, router:{ stack:[] }, get(){}, post(){}, delete(){} };
  require('./acesso')(appA, dbA);
  const AC = appA.locals.acesso;
  eq('a rota esta DECLARADA como @logado — a mesma leitura do GET /api/skus de onde a etiqueta antiga saia',
    AC.permDaRota('/api/skus/etiqueta', 'POST'), '@logado');
  const tela = fs.readFileSync(path.join(__dirname, 'public', 'index.html'), 'utf8');
  ok('o admin nao baixa mais o gerador de barras da internet', !/jsbarcode/i.test(tela));
  ok('...e a etiqueta de SKU nao e mais pagina impressa pelo navegador (@page 100mm 35mm)', !/@page\{size:100mm 35mm/.test(tela));
  ok('...ela pede o PDF ao servidor', /\/api\/skus\/etiqueta/.test(tela));

  console.log('');
  console.log(falhas ? ('FALHARAM ' + falhas + ' de ' + n) : ('todos os ' + n + ' casos passaram'));
  process.exit(falhas ? 1 : 0);
})().catch(e => { console.log('FALHOU — o teste nao chegou ao fim: ' + e.message); process.exit(1); });

#!/usr/bin/env node
/* teste_upload.js — a subida do PDF do Mercado Livre (POST /api/lote/upload).
 *
 *   node teste_upload.js
 *
 * O que este arquivo trava (CLAUDE.md §5, §6 e §8-B):
 *   - a DEDUPLICACAO olha o HISTORICO INTEIRO, nao o dia (armadilha #5): pack ou
 *     venda que ja existe em qualquer data nao entra de novo. Foi assim que
 *     nasceram os 94 fantasmas de 25/08/2026;
 *   - a trava do SKU nao cadastrado e POR VOLUME, nao por lote (§6): 3 SKUs
 *     desconhecidos em 5 vendas retem 3, e as outras seguem;
 *   - a ORDEM das travas, porque cada uma e solta por um caminho diferente:
 *       divergencia > pacote de varios SKUs > folha que nao fecha > modalidade
 *       > SKU sem cadastro
 *     Cadastrar SKU so solta o ultimo — por isso ele tem que ser o ultimo;
 *   - a modalidade fora dos dois formatos conhecidos RETEM e fica NULL (#21);
 *   - so o pacote de varios SKUs retem; a caixa de N unidades do MESMO SKU
 *     passa, com as pecas gravadas em `lote_item` (#23);
 *   - a conferencia 5 (familia do anuncio × prefixo do SKU) so acusa depois
 *     de 5 ocorrencias — produto novo nao para a expedicao;
 *   - subir o PDF nao mexe no estoque (o -1 e da Etiqueta de Venda).
 *
 * ⚠️ A LEITURA DO PDF NAO E TESTADA AQUI, de proposito: ela e do parse.js e do
 * folha.js, e o teste_parse.js monta a folha no formato real do ML. Aqui o
 * parsePdf e trocado por um que devolve os volumes ja lidos — o que se testa e
 * o que a ROTA faz com eles. Ate 20/10/2026 nenhum teste chamava esta rota.
 *
 * Os PDFs que a rota grava vao para uma pasta temporaria (PCP_LOTES), nunca
 * para a pasta do servidor.
 */
const Database = require('better-sqlite3');
const express = require('express');
const fs = require('fs'), os = require('os'), path = require('path');

const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'pcp-upload-'));
process.env.PCP_LOTES = path.join(tmp, 'lotes');

/* O parsePdf de mentira: devolve o que o teste mandar, e mais nada. Entra no
   cache do require ANTES do exp_route, que o desestrutura no topo. */
let proximos = [];
const PARSE = require.resolve('./parse');
require.cache[PARSE] = { id:PARSE, filename:PARSE, loaded:true, exports:{ parsePdf: async () => proximos } };

let casos = 0, falhas = 0;
function ok(desc, cond, detalhe){
  casos++;
  if(cond) console.log('  ok  ' + casos + ' — ' + desc);
  else { falhas++; console.log('  FALHOU ' + casos + ' — ' + desc + (detalhe ? '\n         ' + detalhe : '')); }
}
function eq(desc, achado, esperado){
  ok(desc, achado === esperado, 'esperado ' + JSON.stringify(esperado) + ', veio ' + JSON.stringify(achado));
}

const db = new Database(path.join(tmp, 't.db'));
db.exec(`CREATE TABLE skus (codigo TEXT PRIMARY KEY, largura_cm INT, altura_cm INT,
    cor_codigo TEXT, cor TEXT, tecido_codigo TEXT, modelo_id INT, estoque INT DEFAULT 0);
  INSERT INTO skus (codigo,estoque) VALUES ('BK160140BEGE',3),('BK140140BEGE',2),
    ('BK120120BEGE',1),('SCREEN3-160140BEGE',0);`);
const app = express(); app.use(express.json());
app.locals.acesso = { auditar:()=>{} };
app.use((req,res,next)=>{ req.usuario={id:1,nome:'Expedicao'}; next(); });
require('./exp_route')(app, db);

/* Um volume como o parse.js entrega. Agencia por padrao, que e o caso comum. */
let seq = 100;
function vol(sku, extra){
  seq++;
  return Object.assign({ sku, packId:'20000146100'+seq, venda:'20000180166'+seq, cor:'Bege',
    buyer:'Cliente '+seq, city:'Curitiba', nf:String(7000+seq), codes:[], labelPage:0, danfePage:1,
    descricao:null, despacharEm:'2026-10-21', modalidade:'agencia', despachoLinha:'Despachar: ter 21/out, antes das 15:00 h',
    conflito:null, itens:null, folhaNaoFecha:null }, extra||{});
}
const saldos = () => db.prepare('SELECT codigo,estoque FROM skus ORDER BY codigo').all().map(s=>s.codigo+'='+s.estoque).join(',');
const volume = venda => db.prepare('SELECT * FROM lote WHERE venda=?').get(venda);
const contar = w => db.prepare('SELECT COUNT(*) n FROM lote'+(w?' WHERE '+w:'')).get().n;

async function main(){
  const srv = app.listen(0); await new Promise(r => srv.once('listening', r));
  const base = 'http://127.0.0.1:' + srv.address().port;
  async function subir(volumes, pdf){
    proximos = volumes;
    const r = await fetch(base + '/api/lote/upload', { method:'POST', headers:{'Content-Type':'application/json'},
      body: JSON.stringify({ pdf: pdf===undefined ? 'data:application/pdf;base64,' + Buffer.from('%PDF-teste').toString('base64') : pdf }) });
    return { status:r.status, body: await r.json() };
  }
  try{
    const saldoAntes = saldos();

    console.log('\n── 1. a dedup olha o HISTORICO INTEIRO (armadilha #5) ──');
    /* Um volume de um mes atras, ja impresso e carregado. */
    db.prepare(`INSERT INTO lote (codigo,packId,venda,estagio,data) VALUES
      ('BK160140BEGE','2000014610000001','2000018016000001','carregado','2026-09-20')`).run();
    let r = await subir([
      vol('BK160140BEGE', { packId:'2000014610000001', venda:'2000018016000099' }),   // mesmo pack, de setembro
      vol('BK160140BEGE', { packId:'2000014610000098', venda:'2000018016000001' }),   // mesma venda, de setembro
      vol('BK160140BEGE', { packId:null, venda:'2000018016000002' }),
      vol('BK160140BEGE', { packId:null, venda:'2000018016000002' }),                 // repetido no mesmo PDF
    ]);
    eq('a rota responde ok', r.status, 200);
    eq('o pack de um mes atras nao entra de novo', r.body.repetidas, 3);
    eq('so o volume novo entrou', r.body.novos, 1);
    eq('nenhum fantasma pendente nasceu do volume ja carregado', contar("packId='2000014610000001'"), 1);
    eq('a venda de setembro nao virou pendente de hoje', contar("venda='2000018016000001'"), 1);
    r = await subir([ vol('BK160140BEGE', { packId:null, venda:'2000018016000002' }) ]);
    eq('subir o mesmo PDF de novo nao duplica nada', r.body.novos, 0);
    eq('e conta como repetido', r.body.repetidas, 1);

    console.log('\n── 2. SKU sem cadastro retem POR VOLUME (§6) ──');
    const lote2 = [ vol('BK160140BEGE'), vol('BK999XXX'), vol('BK140140BEGE'), vol('BK999XXX'), vol('BK888YYY') ];
    r = await subir(lote2);
    eq('cinco volumes entraram', r.body.novos, 5);
    eq('tres ficaram retidos', r.body.bloqueados, 3);
    eq('o de SKU conhecido segue pendente', volume(lote2[0].venda).estagio, 'pendente');
    eq('o outro conhecido tambem', volume(lote2[2].venda).estagio, 'pendente');
    const desc = volume(lote2[1].venda);
    eq('o desconhecido fica bloqueado', desc.estagio, 'bloqueado');
    eq('com o motivo sku_nao_cadastrado — o unico que o cadastro solta', desc.bloqueio, 'sku_nao_cadastrado');
    const lista = (r.body.desconhecidos||[]).map(d=>d.sku+'×'+d.qtd).sort().join(' ');
    eq('a resposta diz quais SKUs e quantas vezes', lista, 'BK888YYY×1 BK999XXX×2');
    r = await subir([ vol('') ]);
    eq('volume sem SKU na folha tambem fica retido', r.body.bloqueados, 1);
    ok('e aparece como "sem SKU na folha"', (r.body.desconhecidos||[]).some(d=>/sem SKU/.test(d.sku)), JSON.stringify(r.body.desconhecidos));

    console.log('\n── 3. modalidade: so os dois formatos conhecidos decidem (#21) ──');
    const lote3 = [ vol('BK160140BEGE', { modalidade:'coleta', despachoLinha:'Despachar: quinta 22/out' }),
                    vol('BK160140BEGE', { modalidade:'desconhecida', despachoLinha:'Despachar: amanha, cedo' }),
                    vol('BK160140BEGE', { modalidade:null, despachoLinha:null }) ];
    r = await subir(lote3);
    eq('a resposta conta a coleta', r.body.coleta, 1);
    eq('e as duas em duvida', r.body.modalidade_duvida, 2);
    eq('a coleta e gravada como coleta, e segue', volume(lote3[0].venda).modalidade + '/' + volume(lote3[0].venda).estagio, 'coleta/pendente');
    const fmt = volume(lote3[1].venda);
    eq('formato novo fica retido', fmt.estagio, 'bloqueado');
    ok('com o texto cru da linha no motivo', /^modalidade: .*amanha, cedo/.test(fmt.bloqueio), fmt.bloqueio);
    eq('e a modalidade fica NULL ate a gestao decidir', fmt.modalidade, null);
    ok('sem a linha, o motivo diz que veio SEM', /SEM a linha/.test(volume(lote3[2].venda).bloqueio), volume(lote3[2].venda).bloqueio);
    eq('a agencia e gravada como agencia', volume(lote2[0].venda).modalidade, 'agencia');

    console.log('\n── 4. a caixa de varias persianas (#23) ──');
    const pac = vol('BK120120BEGE', { itens:[ {sku:'BK120120BEGE',qtd:1,cor:'Bege'}, {sku:'bk140140bege',qtd:2,cor:'Bege'} ] });
    const mesma = vol('BK160140BEGE', { itens:[ {sku:'BK160140BEGE',qtd:2,cor:'Bege'} ] });
    r = await subir([pac, mesma]);
    eq('a resposta conta um pacote', r.body.pacotes, 1);
    const vp = volume(pac.venda);
    eq('o pacote de VARIOS SKUs fica retido', vp.estagio, 'bloqueado');
    ok('dizendo quantas pecas e de quantos SKUs', /^pacote: esta etiqueta leva 3 pecas de 2 SKUs/.test(vp.bloqueio), vp.bloqueio);
    const itensP = db.prepare('SELECT codigo,qtd,origem FROM lote_item WHERE lote_id=? ORDER BY id').all(vp.id);
    eq('as pecas do pacote sao gravadas mesmo retido — a gestao assina por elas',
       itensP.map(i=>i.qtd+'x'+i.codigo).join(' + '), '1xBK120120BEGE + 2xBK140140BEGE');
    ok('com origem folha', itensP.every(i=>i.origem==='folha'));
    const vm = volume(mesma.venda);
    eq('a caixa de 2 unidades do MESMO SKU NAO e retida', vm.estagio, 'pendente');
    eq('mas as duas pecas vao para o lote_item', db.prepare('SELECT SUM(qtd) s FROM lote_item WHERE lote_id=?').get(vm.id).s, 2);
    eq('e o volume continua UM so (peca nao e volume, #8)', contar("venda='"+mesma.venda+"'"), 1);

    console.log('\n── 5. a ORDEM das travas ──');
    const ord = [
      vol('BK999XXX', { conflito:'leituras divergem: BK999XXX / BK160140BEGE', modalidade:null,
                        itens:[ {sku:'BK999XXX',qtd:1}, {sku:'BK160140BEGE',qtd:1} ] }),
      vol('BK999XXX', { modalidade:null, itens:[ {sku:'BK999XXX',qtd:1}, {sku:'BK160140BEGE',qtd:1} ] }),
      vol('BK999XXX', { modalidade:'desconhecida', folhaNaoFecha:'2 etiqueta(s), 2 item(ns), e 1 etiqueta(s) sem item na folha' }),
      vol('BK999XXX', { modalidade:'desconhecida', despachoLinha:'x' }),
    ];
    r = await subir(ord);
    ok('divergencia vence tudo (a peca errada e a duvida mais grave)', /^divergencia: leituras/.test(volume(ord[0].venda).bloqueio), volume(ord[0].venda).bloqueio);
    ok('pacote vence modalidade e SKU', /^pacote:/.test(volume(ord[1].venda).bloqueio), volume(ord[1].venda).bloqueio);
    ok('folha que nao fecha vai como divergencia, antes da modalidade', /^divergencia: 2 etiqueta/.test(volume(ord[2].venda).bloqueio), volume(ord[2].venda).bloqueio);
    ok('modalidade vence SKU sem cadastro — cadastrar SKU nao diz por onde a caixa sai',
       /^modalidade:/.test(volume(ord[3].venda).bloqueio), volume(ord[3].venda).bloqueio);
    eq('e o SKU desconhecido nao foi contado como desconhecido nesses casos', (r.body.desconhecidos||[]).length, 0);
    eq('a resposta conta duas divergencias', r.body.divergencias, 2);
    eq('e o "nao fecha"', r.body.folha_nao_fecha, 1);

    console.log('\n── 6. a conferencia 5 aprende antes de acusar ──');
    const anuncio = 'Cortina Rolo Blackout 1,60x1,40 Blecaute Bege';
    for(let i=0;i<5;i++) await subir([ vol('BK160140BEGE', { descricao: anuncio }) ]);
    r = await subir([ vol('SCREEN3-160140BEGE', { descricao: anuncio }) ]);
    const sc = db.prepare("SELECT estagio,bloqueio FROM lote WHERE codigo='SCREEN3-160140BEGE'").get();
    eq('depois de 5 vezes BK, o mesmo anuncio com outro prefixo e retido', sc && sc.estagio, 'bloqueado');
    ok('como divergencia que diz o prefixo de sempre', /^divergencia: .*sempre foi BK/.test(sc && sc.bloqueio), sc && sc.bloqueio);
    const novo = 'Toucher Rolo Evolux 1,60x1,40 Bege';
    for(let i=0;i<4;i++) await subir([ vol('BK160140BEGE', { descricao: novo }) ]);
    const so4 = vol('SCREEN3-160140BEGE', { descricao: novo });
    await subir([ so4 ]);
    eq('com so 4 ocorrencias o sistema ainda aprende, e nao acusa', volume(so4.venda).estagio, 'pendente');

    console.log('\n── 7. subir PDF nao mexe no estoque, e sem PDF nao grava ──');
    eq('nenhum saldo andou com todos os uploads acima', saldos(), saldoAntes);
    const total = contar();
    r = await subir([ vol('BK160140BEGE') ], '');
    eq('corpo sem pdf e recusado (400)', r.status, 400);
    eq('e nada foi gravado', contar(), total);
    ok('o PDF enviado foi guardado na pasta de lotes (a do teste)', fs.readdirSync(process.env.PCP_LOTES).length > 0);
  } finally { srv.close(); }
}

main().catch(e => { falhas++; console.log('  FALHOU — o teste estourou: ' + (e && e.stack || e)); })
  .finally(() => {
    db.close(); fs.rmSync(tmp, { recursive:true, force:true });
    console.log('\n' + (casos - falhas) + ' ok, ' + falhas + ' falha(s)\n');
    process.exit(falhas ? 1 : 0);
  });

#!/usr/bin/env node
/* teste_impressos.js — a lista "Já impressos — reimprimir" da Etiqueta de Venda
 * (GET /api/impressos).
 *
 *   node teste_impressos.js
 *
 * O que este arquivo trava (CLAUDE.md §5, R-CAR e a reimpressão do §2):
 *   - a BUSCA vai ao banco, no histórico INTEIRO. Até 27/10/2026 a rota trazia
 *     no máximo 30 dias e 400 vendas, e a busca procurava só dentro delas, no
 *     navegador. Saindo ~57 caixas por dia, as 400 eram uns 7 dias: a NF 7892
 *     de uma semana e meia atrás dava "Nada com esse termo";
 *   - a lista sem busca continua como era (período, mais recente primeiro), e
 *     diz quando bateu no teto (`X-Cortado`) em vez de cortar calada;
 *   - a busca só acha o que foi impresso (embalado/carregado): pendente,
 *     bloqueado e cancelado ficam fora, como na lista;
 *   - `tem_pdf` diz ANTES do clique se o PDF ainda está no servidor, e o
 *     caminho do arquivo não viaja pelo fio.
 *
 * Banco temporário e PCP_DIR temporário: nada toca a pasta do servidor.
 */
const Database = require('better-sqlite3');
const express = require('express');
const fs = require('fs'), os = require('os'), path = require('path');

const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'pcp-impressos-'));
process.env.PCP_DIR = tmp;

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
    cor_codigo TEXT, cor TEXT, tecido_codigo TEXT, modelo_id INT, estoque INT DEFAULT 0);`);
const app = express(); app.use(express.json());
app.locals.acesso = { auditar:()=>{} };
app.use((req,res,next)=>{ req.usuario={id:1,nome:'Expedicao'}; next(); });
require('./exp_route')(app, db);

const dia = n => db.prepare("SELECT date('now','localtime',?) d").get((n>=0?'+':'')+n+' day').d;
const ins = db.prepare(`INSERT INTO lote (codigo,buyer,city,nf,packId,venda,estagio,data,embalado_em,srcfile)
  VALUES (?,?,?,?,?,?,?,?,?,?)`);
function volume(codigo, buyer, nf, estagio, data, srcfile){
  return ins.run(codigo, buyer, 'Curitiba', nf, 'P'+nf, 'V'+nf, estagio, data, data+' 10:00:00', srcfile||null).lastInsertRowid;
}

/* 410 caixas de 10 dias atrás: mais que o teto da lista. */
db.transaction(()=>{ for(let i=0;i<410;i++) volume('BK160140BEGE','Fila '+i, String(80000+i), 'embalado', dia(-10)); })();
/* A venda de dois meses atrás — a que motivou o conserto. */
const antiga = volume('BK140140BEGE','Bruno Antigo','7892','carregado', dia(-60));
/* A caixa de várias, achada pelo SKU da SEGUNDA persiana. */
const varias = volume('BK120120BEGE','Caixa Varias','7893','carregado', dia(-45));
db.prepare("INSERT INTO lote_item (lote_id,codigo,qtd) VALUES (?,?,1),(?,?,1)").run(varias,'BK120120BEGE',varias,'BK-999ITEM');
/* O que nunca foi impresso não aparece na lista, e não aparece na busca. */
volume('BK140140BEGE','Ainda Pendente','7777','pendente', dia(-40));
volume('BK140140BEGE','Venda Cancelada','7778','cancelado', dia(-40));
volume('BK140140BEGE','Retida','7779','bloqueado', dia(-40));
/* Hoje: uma com o PDF no disco, uma sem. */
const pdf = path.join(tmp, 'hoje.pdf'); fs.writeFileSync(pdf, '%PDF-teste');
const comPdf = volume('BK160140BEGE','Hoje Com PDF','9001','embalado', dia(0), pdf);
const semPdf = volume('BK160140BEGE','Hoje Sem PDF','9002','embalado', dia(0), path.join(tmp,'apagado.pdf'));

async function main(){
  const srv = app.listen(0); await new Promise(r => srv.once('listening', r));
  const base = 'http://127.0.0.1:' + srv.address().port;
  async function lista(qs){
    const r = await fetch(base + '/api/impressos' + qs);
    return { status:r.status, corte:r.headers.get('x-cortado'), body: await r.json() };
  }
  const ids = l => l.map(v=>v.id);
  try{
    console.log('\n── 1. sem busca: a lista do período, como era ──');
    let r = await lista('?dias=1');
    eq('hoje traz as duas de hoje', r.body.length, 2);
    eq('mais recente primeiro (a mesma ordem de antes)', r.body[0].id, semPdf);
    eq('abaixo do teto não diz que cortou', r.corte, null);
    r = await lista('?dias=30');
    eq('30 dias para no teto de 400', r.body.length, 400);
    eq('e DIZ que cortou, com o teto', r.corte, '400');
    ok('a venda de 60 dias não está na lista do período', !ids(r.body).includes(antiga));
    r = await lista('?dias=999');
    eq('o período continua limitado a 30 dias', r.body.length, 400);

    console.log('\n── 2. com busca: o histórico INTEIRO ──');
    r = await lista('?q=7892');
    eq('a NF de dois meses atrás é achada', JSON.stringify(ids(r.body)), JSON.stringify([antiga]));
    eq('com o cliente', r.body[0] && r.body[0].buyer, 'Bruno Antigo');
    eq('e marcada como carregada', r.body[0] && r.body[0].estagio, 'carregado');
    r = await lista('?q=BRUNO%20antigo');
    eq('pelo nome, sem ligar pra maiúscula', JSON.stringify(ids(r.body)), JSON.stringify([antiga]));
    r = await lista('?q=P7892');
    eq('pelo pack', JSON.stringify(ids(r.body)), JSON.stringify([antiga]));
    r = await lista('?q=V7892');
    eq('pela venda', JSON.stringify(ids(r.body)), JSON.stringify([antiga]));
    r = await lista('?q=bk-999item');
    eq('pelo SKU da segunda persiana da caixa de várias', JSON.stringify(ids(r.body)), JSON.stringify([varias]));
    r = await lista('?q=BK999%20ITEM');
    eq('mesmo com espaço e hífen diferentes (como a busca da tela)', JSON.stringify(ids(r.body)), JSON.stringify([varias]));
    eq('e a caixa vem com as peças', r.body[0] && r.body[0].pecas, 2);
    r = await lista('?q=7892&dias=1');
    eq('a busca ignora o período', r.body.length, 1);

    console.log('\n── 3. a busca só acha o que foi impresso ──');
    for(const [nf, quem] of [['7777','pendente'],['7778','cancelada'],['7779','bloqueada']]){
      r = await lista('?q=' + nf);
      eq('a ' + quem + ' não aparece', r.body.length, 0);
    }

    console.log('\n── 4. a busca não vira coringa, e tem teto que avisa ──');
    r = await lista('?q=%25');
    eq('"%" não acha tudo', r.body.length, 0);
    r = await lista('?q=_');
    eq('"_" não acha tudo', r.body.length, 0);
    r = await lista('?q=Fila');
    eq('busca larga para no teto de 60', r.body.length, 60);
    eq('e diz que cortou', r.corte, '60');
    r = await lista('?q=%20%20');
    eq('busca só de espaço é a lista do período', r.corte, null);

    console.log('\n── 5. o PDF: a tela sabe antes do clique ──');
    r = await lista('?dias=1');
    const porId = id => r.body.find(v=>v.id===id) || {};
    eq('a de hoje com PDF no disco: tem_pdf 1', porId(comPdf).tem_pdf, 1);
    eq('a de hoje cujo PDF sumiu: tem_pdf 0', porId(semPdf).tem_pdf, 0);
    ok('o caminho do arquivo não viaja pelo fio', r.body.every(v => !('srcfile' in v)));
    r = await lista('?q=7892');
    eq('a antiga da busca também diz que não tem PDF', r.body[0] && r.body[0].tem_pdf, 0);
    ok('nem na busca', r.body.every(v => !('srcfile' in v)));

    console.log('\n── 6. a tela usa a busca do servidor ──');
    const html = fs.readFileSync(path.join(__dirname,'public','embalagem.html'),'utf8');
    ok('a busca chama /api/impressos?q=', /\/api\/impressos\?q='/.test(html));
    ok('a tela lê o aviso de corte', /x-cortado/i.test(html));
    ok('e o botão olha o tem_pdf', /tem_pdf/.test(html));
  } finally { srv.close(); }
}

main().catch(e => { falhas++; console.log('  FALHOU — o teste estourou: ' + (e && e.stack || e)); })
  .finally(() => {
    db.close(); fs.rmSync(tmp, { recursive:true, force:true });
    console.log('\n' + (casos - falhas) + ' ok, ' + falhas + ' falha(s)\n');
    process.exit(falhas ? 1 : 0);
  });

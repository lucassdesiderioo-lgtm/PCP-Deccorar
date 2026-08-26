#!/usr/bin/env node
/* Testes do carregamento — a ultima tela antes do volume subir no carro.
 *
 *   node teste_carga.js
 *
 * O caso que originou estes testes (26/08/2026): seis volumes impressos no dia
 * anterior e nao carregados. As tres consultas da tela filtravam por
 * `data=date('now','localtime')` — o dia da IMPORTACAO — entao eles sumiram da
 * lista, sumiram do contador e, o pior, o bipe da etiqueta respondia
 * "nao encontrado" com a caixa na mao, na frente do carro. Ali ninguem tem como
 * conferir: o que a equipe aprende e que o sistema erra.
 *
 * A regra vive no carga.js e diz que volume `embalado` esta pra carregar em
 * qualquer dia — ele esta fisicamente na fabrica ate alguem carregar.
 *
 * Sobe um banco temporario e chama os handlers direto, com um `app` de mentira
 * que so guarda as rotas. Nao abre porta, nao toca no banco de producao.
 */
const Database=require('better-sqlite3');
const fs=require('fs'), os=require('os'), path=require('path');

const tmp=fs.mkdtempSync(path.join(os.tmpdir(),'pcp-carga-'));
const db=new Database(path.join(tmp,'t.db'));
db.exec(`CREATE TABLE lote (id INTEGER PRIMARY KEY AUTOINCREMENT, codigo TEXT, cor TEXT, buyer TEXT,
  city TEXT, nf TEXT, packId TEXT, venda TEXT, codes TEXT DEFAULT '[]', estagio TEXT, data TEXT,
  carregado_em TEXT, despachar_em TEXT);`);
const hoje=db.prepare("SELECT date('now','localtime') d").get().d;
const ontem=db.prepare("SELECT date('now','localtime','-1 day') d").get().d;
const ins=db.prepare(`INSERT INTO lote (codigo,buyer,nf,packId,venda,codes,estagio,data)
  VALUES (?,?,?,?,?,?,?,?)`);
/* Tres de ontem, embalados e nunca carregados — o passivo que a tela escondia.
   Um casa por Venda e outro por Pack ID, porque a etiqueta traz ora um ora o
   outro e os dois caminhos precisam achar. */
ins.run('BK140140CINZA','Giovane Teixeira',  '5501',null,'2000018114406178','["2000018114406178"]','embalado',ontem);
ins.run('BK160160CINZA','Gabrieli Costantin','5502',null,'2000018113871756','["2000018113871756"]','embalado',ontem);
ins.run('BK140140CINZA','Bruno Golin',       '5503','2000014702772477',null,'["2000014702772477"]','embalado',ontem);
// e o dia de hoje: um pra carregar, um ja carregado, um bloqueado
ins.run('BK160140BEGE', 'Ana Costa', '5601','333','903','["333","903"]','embalado', hoje);
ins.run('BK150150CINZA','Joao Silva','5602','444','904','["444","904"]','carregado',hoje);
db.prepare("UPDATE lote SET carregado_em=datetime('now','localtime') WHERE buyer='Joao Silva'").run();
ins.run('SEMCADASTRO',  'Pedro Lima','5603','555','905','["555","905"]','bloqueado',hoje);

const rotas={};
const app={ get:(p,h)=>{rotas['GET '+p]=h;}, post:(p,h)=>{rotas['POST '+p]=h;}, locals:{} };
require('./carreg_route')(app,db);
const chamar=(k,body)=>new Promise(r=>{
  const res={ json:o=>r(o), status(){ return this; }, send:o=>r(o) };
  rotas[k]({body:body||{},headers:{}}, res);
});

let falhas=0, casos=0;
const ok=(n,c,extra)=>{ casos++;
  if(c) console.log('ok      '+n);
  else { falhas++; console.log('FALHOU  '+n+(extra?'   '+extra:'')); } };

(async()=>{
  let d=await chamar('GET /api/carregamento');
  ok('a lista mostra o atrasado junto com o de hoje', d.faltam.length===4,
     'veio '+JSON.stringify(d.faltam.map(f=>f.buyer)));
  ok('marca quantos sao de dias anteriores', d.atrasados===3, 'veio '+d.atrasados);
  ok('o atrasado vem em cima', d.faltam[0].atrasado===1 && d.faltam[3].atrasado===0);
  ok('total = o que falta + o que ja foi carregado hoje', d.total===5, 'veio '+d.total);
  ok('carregados conta por carregado_em, nao por dia de importacao', d.carregados===1, 'veio '+d.carregados);

  /* O CASO QUE ORIGINOU TUDO: antes disto a resposta era "nao_encontrado". */
  let r=await chamar('POST /api/carregar',{code:'2000018114406178'});
  ok('bipe de volume embalado ONTEM carrega', r.ok===true && r.pedido.buyer==='Giovane Teixeira',
     'veio '+JSON.stringify(r.motivo||(r.pedido||{}).buyer));
  ok('o contador anda ao carregar um atrasado', r.carregados===2, 'veio '+r.carregados);

  r=await chamar('POST /api/carregar',{code:'2000014702772477'});
  ok('acha pelo Pack ID tambem', r.ok===true && r.pedido.buyer==='Bruno Golin', 'veio '+JSON.stringify(r.motivo));

  r=await chamar('POST /api/carregar',{code:'2000014702772477'});
  ok('bipar duas vezes acusa duplicado', r.ok===false && r.motivo==='duplicado', 'veio '+JSON.stringify(r.motivo));

  r=await chamar('POST /api/carregar',{code:'555'});
  ok('bloqueado continua recusado (§6)', r.ok===false && r.motivo==='bloqueado', 'veio '+JSON.stringify(r.motivo));

  /* A busca larga nao pode virar "acha qualquer coisa": codigo que nao existe
     tem que continuar dando nao_encontrado, senao o alarme perde o sentido. */
  r=await chamar('POST /api/carregar',{code:'999999999'});
  ok('codigo inexistente segue nao_encontrado', r.ok===false && r.motivo==='nao_encontrado', 'veio '+JSON.stringify(r.motivo));

  r=await chamar('POST /api/carregar',{code:'333'});
  ok('o volume do proprio dia carrega como sempre', r.ok===true && r.pedido.buyer==='Ana Costa', 'veio '+JSON.stringify(r.motivo));

  d=await chamar('GET /api/carregamento');
  ok('a lista esvazia conforme carrega', d.faltam.length===1 && d.atrasados===1,
     'veio '+JSON.stringify(d.faltam.map(f=>f.buyer)));

  db.close();
  try{ fs.rmSync(tmp,{recursive:true,force:true}); }catch(e){}
  console.log('');
  console.log(falhas? (falhas+' de '+casos+' FALHARAM') : ('todos os '+casos+' casos passaram'));
  process.exit(falhas?1:0);
})();

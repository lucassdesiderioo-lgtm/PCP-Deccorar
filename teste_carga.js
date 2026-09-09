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
  carregado_em TEXT, despachar_em TEXT, modalidade TEXT, retirado_em TEXT);`);
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
/* VENDA FUTURA: etiqueta impressa adiantada, despacho marcado pra frente.
   Existe e esta na fabrica, mas nao e carga de hoje — e nao pode ser marcada
   de atrasada so porque entrou num dia anterior (o caso da Lucelia, 26/08). */
const setembro=db.prepare("SELECT date('now','localtime','+22 day') d").get().d;
ins.run('BK150150BRANCO','Lucelia','5606','777','907','["777","907"]','embalado',ontem);
db.prepare("UPDATE lote SET despachar_em=? WHERE buyer='Lucelia'").run(setembro);
/* E um atrasado DE VERDADE: o prazo ja venceu. */
ins.run('BK120120CINZA','Maria Rita','5604','888','908','["888","908"]','embalado',ontem);
db.prepare("UPDATE lote SET despachar_em=date('now','localtime','-3 day') WHERE buyer='Maria Rita'").run();
/* COLETA (10/09/2026): o caminhao do ML vem buscar. Tres caixas embaladas com
   etiqueta de coleta — elas NAO vao no carro, vao pro canto reservado, e o
   motorista tem que bipar as tres. Uma quarta e de coleta mas futura. */
ins.run('BK150150BEGE','Julia Souza',  '6259','2000014948163325',null,'["2000014948163325"]','embalado',hoje);
ins.run('BK150150BEGE','Julia Souza',  '6257','2000014948163323',null,'["2000014948163323"]','embalado',hoje);
ins.run('BK180150CINZA','John Phillips','6262','2000014941393951',null,'["2000014941393951"]','embalado',hoje);
ins.run('BK150150BRANCO','Priscila Loyola','6270','2000014948199999',null,'["2000014948199999"]','embalado',hoje);
db.prepare("UPDATE lote SET modalidade='coleta', despachar_em=date('now','localtime') WHERE nf IN ('6259','6257','6262')").run();
db.prepare("UPDATE lote SET modalidade='coleta', despachar_em=date('now','localtime','+5 day') WHERE nf='6270'").run();

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
  ok('a lista mostra o atrasado junto com o de hoje', d.faltam.length===5,
     'veio '+JSON.stringify(d.faltam.map(f=>f.buyer)));
  ok('marca quantos sao de dias anteriores', d.atrasados===4, 'veio '+d.atrasados);
  ok('o atrasado vem em cima', d.faltam[0].atrasado===1 && d.faltam[4].atrasado===0);
  ok('total = o que falta + o que ja foi carregado hoje', d.total===6, 'veio '+d.total);

  /* A VENDA FUTURA: nem cobrada junto com o dia, nem escondida (#9). */
  ok('venda futura sai da lista de hoje', !d.faltam.some(f=>f.buyer==='Lucelia'),
     'veio '+JSON.stringify(d.faltam.map(f=>f.buyer)));
  const luc=d.depois.find(f=>f.buyer==='Lucelia')||null;
  ok('mas aparece a parte, com a data', d.adiantadas===2 && !!luc && luc.despachar_em===setembro,
     'veio '+JSON.stringify(d.depois));
  ok('e NAO e chamada de atrasada', !!luc && !luc.atrasado, 'veio '+JSON.stringify(luc));
  /* Atraso se mede pelo prazo: este venceu ha tres dias. */
  ok('o prazo vencido conta como atrasado', (d.faltam.find(f=>f.buyer==='Maria Rita')||{}).atrasado===1,
     'veio '+JSON.stringify(d.faltam.find(f=>f.buyer==='Maria Rita')));
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

  /* Sobram os dois que ninguem bipou — os dois atrasados de verdade — e a
     venda futura continua onde estava: fora da cobranca, mas visivel. */
  d=await chamar('GET /api/carregamento');
  ok('a lista esvazia conforme carrega', d.faltam.length===2 && d.atrasados===2,
     'veio '+JSON.stringify(d.faltam.map(f=>f.buyer)));
  ok('a venda futura nao entra na lista nem some', d.adiantadas===2 && !d.faltam.some(f=>f.buyer==='Lucelia'),
     'veio faltam='+JSON.stringify(d.faltam.map(f=>f.buyer))+' depois='+JSON.stringify(d.depois.map(f=>f.buyer)));

  /* ── COLETA: A SEGUNDA PORTA DE SAIDA (10/09/2026) ─────────────────────────
     A caixa de coleta nao vai no carro: nao pode aparecer em "faltam carregar"
     nem contar no "carregados X de Y" do carro. Ela tem lista propria, e o
     bipe dela responde quantas estao esperando o caminhao — o numero que o
     motorista tem que bater. */
  ok('a coleta NAO entra na lista do carro', !d.faltam.some(f=>f.nf==='6259'||f.nf==='6257'||f.nf==='6262'),
     'veio '+JSON.stringify(d.faltam.map(f=>f.nf)));
  ok('e tem lista propria, so com as do dia', d.coleta && d.coleta.faltam.length===3
     && !d.coleta.faltam.some(f=>f.nf==='6270'), 'veio '+JSON.stringify((d.coleta||{}).faltam));
  ok('a coleta futura vai pro "depois", como a do carro', d.depois.some(f=>f.nf==='6270'),
     'veio '+JSON.stringify(d.depois.map(f=>f.nf)));
  ok('nada esperando o caminhao antes de bipar', d.coleta.aguardando.length===0);

  const carroAntes=d.carregados;
  r=await chamar('POST /api/carregar',{code:'2000014948163325'});
  ok('bipar a caixa de coleta responde que e coleta', r.ok===true && r.coleta===true, 'veio '+JSON.stringify(r));
  ok('e diz quantas estao indo (1)', r.coleta_aguardando===1, 'veio '+r.coleta_aguardando);
  ok('o contador do CARRO nao anda com caixa de coleta', r.carregados===carroAntes, 'veio '+r.carregados+' (era '+carroAntes+')');
  r=await chamar('POST /api/carregar',{code:'2000014948163323'});
  r=await chamar('POST /api/carregar',{code:'2000014941393951'});
  ok('depois das tres, estao indo 3', r.coleta_aguardando===3, 'veio '+r.coleta_aguardando);
  d=await chamar('GET /api/carregamento');
  ok('a lista de coleta esvazia e o canto enche', d.coleta.faltam.length===0 && d.coleta.aguardando.length===3,
     'veio faltam='+d.coleta.faltam.length+' aguardando='+d.coleta.aguardando.length);
  r=await chamar('POST /api/carregar',{code:'2000014948163325'});
  ok('bipar de novo acusa duplicado, e continua dizendo que e coleta', r.ok===false && r.motivo==='duplicado' && r.coleta===true,
     'veio '+JSON.stringify(r.motivo));

  /* O MOTORISTA BIPOU 49 DE 50. Nada anda: a resposta traz a lista pra
     conferir caixa a caixa, e o canto continua com as tres. */
  r=await chamar('POST /api/coleta/fechar',{motorista:2});
  ok('motorista com numero diferente NAO fecha a coleta', r.ok===false && r.motivo==='divergente'
     && r.sistema===3 && r.motorista===2, 'veio '+JSON.stringify(r));
  ok('e devolve a lista pra conferir uma a uma', Array.isArray(r.lista) && r.lista.length===3, 'veio '+JSON.stringify(r.lista));
  d=await chamar('GET /api/carregamento');
  ok('as caixas continuam esperando o caminhao', d.coleta.aguardando.length===3 && d.coleta.fechamentos.length===0);
  r=await chamar('POST /api/coleta/fechar',{motorista:'abc'});
  ok('numero invalido e recusado', !!r.erro, 'veio '+JSON.stringify(r));

  /* O numero bateu: as tres saem do canto, e o fechamento fica registrado. */
  r=await chamar('POST /api/coleta/fechar',{motorista:3});
  ok('numero igual fecha a coleta', r.ok===true && r.divergente===false && r.sistema===3, 'veio '+JSON.stringify(r));
  d=await chamar('GET /api/carregamento');
  ok('o canto esvazia e o dia registra 3 retiradas', d.coleta.aguardando.length===0 && d.coleta.retiradas_hoje===3,
     'veio '+JSON.stringify(d.coleta));
  ok('o fechamento fica na historia do dia', d.coleta.fechamentos.length===1 && d.coleta.fechamentos[0].divergente===0
     && d.coleta.fechamentos[0].qtd_sistema===3, 'veio '+JSON.stringify(d.coleta.fechamentos));
  r=await chamar('POST /api/coleta/fechar',{motorista:0});
  ok('sem caixa no canto nao ha o que fechar', r.ok===false && r.motivo==='nada', 'veio '+JSON.stringify(r));

  /* Fechar COM divergencia, confirmando: permitido (o caminhao nao pode ficar
     preso), mas gravado como divergente. */
  ins.run('BK150150BEGE','Dorli Beck','6261','2000014948163399',null,'["2000014948163399"]','embalado',hoje);
  db.prepare("UPDATE lote SET modalidade='coleta' WHERE nf='6261'").run();
  await chamar('POST /api/carregar',{code:'2000014948163399'});
  r=await chamar('POST /api/coleta/fechar',{motorista:0,confirmar:true,obs:'motorista nao achou a caixa'});
  ok('fechar confirmando a divergencia grava como divergente', r.ok===true && r.divergente===true, 'veio '+JSON.stringify(r));
  d=await chamar('GET /api/carregamento');
  ok('e o registro do dia mostra a divergencia', d.coleta.fechamentos.length===2 && d.coleta.fechamentos[0].divergente===1,
     'veio '+JSON.stringify(d.coleta.fechamentos));

  db.close();
  try{ fs.rmSync(tmp,{recursive:true,force:true}); }catch(e){}
  console.log('');
  console.log(falhas? (falhas+' de '+casos+' FALHARAM') : ('todos os '+casos+' casos passaram'));
  process.exit(falhas?1:0);
})();

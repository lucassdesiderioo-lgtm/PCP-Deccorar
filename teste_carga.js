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
/* As fotos da coleta vao pra um diretorio de teste, nunca pro /opt. Tem que
   ser definido ANTES do require do carreg_route. */
process.env.PCP_COLETAS_DIR=path.join(tmp,'coletas');
/* Uma "foto": JPEG falso com tamanho de foto. O servidor confere so que e
   imagem em data URL e que tem conteudo — o que a camera do tablet manda. */
const FOTO='data:image/jpeg;base64,'+Buffer.alloc(4000,7).toString('base64');
const db=new Database(path.join(tmp,'t.db'));
db.exec(`CREATE TABLE lote (id INTEGER PRIMARY KEY AUTOINCREMENT, codigo TEXT, cor TEXT, buyer TEXT,
  city TEXT, nf TEXT, packId TEXT, venda TEXT, codes TEXT DEFAULT '[]', estagio TEXT, data TEXT,
  carregado_em TEXT, despachar_em TEXT, modalidade TEXT, retirado_em TEXT,
  conferido_por TEXT, conferido_em TEXT, embalado_em TEXT, impresso_por TEXT,
  saida_id INTEGER, saiu_em TEXT, saiu_por TEXT, no_carro_em TEXT, no_carro_por TEXT);
  CREATE TABLE lote_item (id INTEGER PRIMARY KEY AUTOINCREMENT, lote_id INTEGER, codigo TEXT, qtd INTEGER DEFAULT 1);`);
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
/* Auditoria de mentira: a recusa do volume nao embalado precisa deixar rastro,
   senao ninguem descobre que a caixa chegou no carro sem passar pela etiqueta. */
const auditoria=[];
app.locals.acesso={ auditar(req,cat,acao,alvo,detalhe){ auditoria.push({cat,acao,alvo,detalhe}); } };
require('./carreg_route')(app,db);
require('./saida_route')(app,db);
const chamar=(k,body)=>new Promise(r=>{
  const res={ json:o=>r(o), status(){ return this; }, send:o=>r(o) };
  rotas[k]({body:body||{},headers:{}}, res);
});

let falhas=0, casos=0;
const ok=(n,c,extra)=>{ casos++;
  if(c) console.log('ok      '+n);
  else { falhas++; console.log('FALHOU  '+n+(extra?'   '+extra:'')); } };

/* DESDE A FASE 4 (D1, 26/09/2026) a caixa de AGENCIA tem dois bipes: o da
   area confere e o da viagem poe no carro. "Carregar", para a agencia, e
   passar pelos dois — este ajudante faz isso e devolve o que o bipe da area
   dizia (pedido, adiantado) com o contador do carro depois. */
async function noCarro(code){
  const a=await chamar('POST /api/carregar',{code});
  if(!a.ok) return a;
  const c=await chamar('POST /api/viagem/carro',{code});
  const dd=await chamar('GET /api/carregamento');
  return Object.assign({},a,{ok:c.ok===true, carro:c, carregados:dd.carregados});
}
(async()=>{
  await chamar('POST /api/viagem/abrir',{});
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
  ok('sem nada adiantado, a conta do adiantado nasce zerada',
     !!d.saiu_adiantado && d.saiu_adiantado.hoje.pecas===0 && d.saiu_adiantado.periodo.pecas===0,
     'veio '+JSON.stringify(d.saiu_adiantado));

  /* O CASO QUE ORIGINOU TUDO: antes disto a resposta era "nao_encontrado". */
  let r=await noCarro('2000018114406178');
  ok('bipe de volume embalado ONTEM carrega', r.ok===true && r.pedido.buyer==='Giovane Teixeira',
     'veio '+JSON.stringify(r.motivo||(r.pedido||{}).buyer));
  ok('o contador anda ao carregar um atrasado', r.carregados===2, 'veio '+r.carregados);

  r=await noCarro('2000014702772477');
  ok('acha pelo Pack ID tambem', r.ok===true && r.pedido.buyer==='Bruno Golin', 'veio '+JSON.stringify(r.motivo));

  r=await chamar('POST /api/carregar',{code:'2000014702772477'});
  ok('bipar na area a caixa que ja esta no carro acusa duplicado', r.ok===false && r.motivo==='duplicado', 'veio '+JSON.stringify(r.motivo));
  r=await chamar('POST /api/viagem/carro',{code:'2000014702772477'});
  ok('e bipar de novo no carro nao conta duas vezes', r.ok===false && r.motivo==='ja_no_carro', 'veio '+JSON.stringify(r.motivo));

  r=await chamar('POST /api/carregar',{code:'555'});
  ok('bloqueado continua recusado (§6)', r.ok===false && r.motivo==='bloqueado', 'veio '+JSON.stringify(r.motivo));

  /* A busca larga nao pode virar "acha qualquer coisa": codigo que nao existe
     tem que continuar dando nao_encontrado, senao o alarme perde o sentido. */
  r=await chamar('POST /api/carregar',{code:'999999999'});
  ok('codigo inexistente segue nao_encontrado', r.ok===false && r.motivo==='nao_encontrado', 'veio '+JSON.stringify(r.motivo));

  r=await noCarro('333');
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

  /* O "FECHAR COLETA" FOI APOSENTADO (fase 3 da SAIDA-E-DUPLA-CONFERENCIA,
     26/09/2026). Ele fechava o canto INTEIRO de uma vez, e um dia sem fechar
     estragava todos os seguintes. A saida por caminhao e o saida_route.js, e
     os casos dela (foto, divergencia, sobras, dois caminhoes) moram no
     teste_saida_coleta.js. Aqui fica o que e deste modulo: a rota antiga
     RECUSA dizendo onde e agora (o tablet com a pagina em cache ainda a
     chama), nao mexe em nada, e a foto dos fechamentos antigos continua
     sendo lida — e historia, e prova. */
  r=await chamar('POST /api/coleta/fechar',{motorista:3,foto:FOTO});
  ok('o "Fechar coleta" antigo recusa e diz onde e agora', r.ok===false && r.motivo==='aposentado'
     && /Sa[ií]da do caminh/.test(r.aviso||''), 'veio '+JSON.stringify(r));
  d=await chamar('GET /api/carregamento');
  ok('e nada anda: as tres continuam esperando o caminhao', d.coleta.aguardando.length===3 && d.coleta.retiradas_hoje===0);
  ok('a resposta do carregamento traz as saidas do dia e a aberta', Array.isArray(d.coleta.saidas_hoje)
     && d.coleta.saida_aberta===null, 'veio '+JSON.stringify({s:d.coleta.saidas_hoje,a:d.coleta.saida_aberta}));
  {
    fs.mkdirSync(process.env.PCP_COLETAS_DIR,{recursive:true});
    const arq=path.join(process.env.PCP_COLETAS_DIR,'coleta-antiga.jpeg');
    fs.writeFileSync(arq,Buffer.alloc(4000,7));
    const fid=db.prepare(`INSERT INTO coleta_fechamento (fechado_por,qtd_sistema,qtd_motorista,foto)
      VALUES ('Ana',3,3,?)`).run(arq).lastInsertRowid;
    let ct=null, corpo=null;
    await new Promise(rs=>{ rotas['GET /api/coleta/foto/:id']({params:{id:fid},body:{},headers:{}},
      {setHeader:(k,v)=>{ if(/content-type/i.test(k)) ct=v; }, send:b=>{ corpo=b; rs(); }, status(){ return this; }, json:o=>{ corpo=o; rs(); }}); });
    ok('a foto de um fechamento antigo continua sendo servida', ct==='image/jpeg' && Buffer.isBuffer(corpo) && corpo.length===4000,
       'veio '+ct+' '+(corpo&&corpo.length));
  }

  /* ── O VOLUME QUE NUNCA FOI EMBALADO (divida 13, 17/09/2026) ──────────────
     O carregamento recusava so 'bloqueado' e 'carregado'. Volume 'pendente'
     virava 'carregado' e a peca saia da fabrica sem o -1 da Etiqueta de Venda:
     o estoque ficava permanentemente acima do fisico, e como o cruzamento so
     conta 'pendente', o volume sumia tambem da conta de urgencia. Nada
     registrava. O caminho que criava isso era imprimir a etiqueta pela lista do
     admin, sem passar pela bancada.
     `carga.js` sempre disse que estar pra carregar e `estagio='embalado'` — a
     lista e o contador liam de la, e so o BIPE tinha regua propria. */
  ins.run('BK140140BEGE','Nunca Embalado','7001','7771','9071','["7771","9071"]','pendente',hoje);
  r=await chamar('POST /api/carregar',{code:'7771'});
  ok('volume que nunca foi embalado NAO carrega', r.ok===false && r.motivo==='nao_embalado',
     'veio '+JSON.stringify(r));
  ok('e a recusa diz por onde a caixa tem que passar', /etiqueta de venda/i.test(r.aviso||''),
     'veio '+JSON.stringify(r.aviso));
  ok('o volume continua pendente (nao andou pela metade)',
     db.prepare("SELECT estagio FROM lote WHERE nf='7001'").get().estagio==='pendente');
  ok('e a recusa vai pra auditoria — antes nada registrava',
     auditoria.some(a=>a.acao==='carregar_nao_embalado'), 'veio '+JSON.stringify(auditoria));

  /* A regra do irmao continua valendo (§5, os fantasmas): entre duplicatas do
     mesmo codigo, quem esta pra carregar manda. O pendente nao pode roubar o
     bipe do embalado e virar "nao_embalado" com a caixa certa na mao. */
  ins.run('BK140140BEGE','Irmao Fantasma','7002','7781','9081','["7781","9081"]','pendente',hoje);
  ins.run('BK140140BEGE','Irmao Bom',     '7003','7781','9081','["7781","9081"]','embalado',hoje);
  r=await chamar('POST /api/carregar',{code:'7781'});
  ok('entre irmaos, o embalado ainda manda', r.ok===true && r.pedido.nf==='7003',
     'veio '+JSON.stringify(r.pedido&&r.pedido.nf));

  /* ── O QUE SAI ADIANTADO (25/09/2026) ─────────────────────────────────────
     Adiantado = saiu da fabrica ANTES da data de despacho da etiqueta. A saida
     da agencia e o bipe no carro; a da coleta e o caminhao levando
     (`retirado_em`), nao a caixa indo pro canto. Conta PECA (a caixa de 2
     persianas conta 2), com a caixa ao lado. Ate aqui nenhum volume do dia
     saiu adiantado: todos tinham prazo de hoje, vencido ou nenhum. */
  d=await chamar('GET /api/carregamento');
  ok('o que saiu no prazo nao conta como adiantado', d.saiu_adiantado.hoje.pecas===0,
     'veio '+JSON.stringify(d.saiu_adiantado));

  r=await noCarro('777');
  ok('bipar venda futura no carro avisa que e adiantado', r.ok===true && r.adiantado===true
     && r.pedido.despachar_em===setembro, 'veio '+JSON.stringify({ok:r.ok,ad:r.adiantado,p:r.pedido&&r.pedido.despachar_em}));
  r=await noCarro('888');
  ok('o atrasado NAO e adiantado', r.ok===true && r.adiantado===false, 'veio '+JSON.stringify(r.adiantado));
  d=await chamar('GET /api/carregamento');
  ok('a venda futura carregada conta 1 peca adiantada hoje, na agencia',
     d.saiu_adiantado.hoje.pecas===1 && d.saiu_adiantado.hoje.agencia===1 && d.saiu_adiantado.hoje.coleta===0,
     'veio '+JSON.stringify(d.saiu_adiantado));

  /* A caixa de 2 persianas conta DUAS pecas e UMA caixa (§5, #23). */
  ins.run('BK140140BEGE','Silvio Duas','7101','7811','9111','["7811","9111"]','embalado',hoje);
  const silvio=db.prepare("SELECT id FROM lote WHERE nf='7101'").get().id;
  db.prepare("UPDATE lote SET despachar_em=date('now','localtime','+3 day') WHERE id=?").run(silvio);
  db.prepare("INSERT INTO lote_item (lote_id,codigo,qtd) VALUES (?,?,2)").run(silvio,'BK140140BEGE');
  await noCarro('7811');
  d=await chamar('GET /api/carregamento');
  ok('a caixa de 2 persianas conta 2 pecas e 1 caixa',
     d.saiu_adiantado.hoje.pecas===3 && d.saiu_adiantado.hoje.caixas===2,
     'veio '+JSON.stringify(d.saiu_adiantado.hoje));

  /* COLETA: ir pro canto NAO e sair. So conta quando o caminhao leva. */
  r=await chamar('POST /api/carregar',{code:'2000014948199999'});
  ok('a coleta futura avisa adiantado no bipe', r.ok===true && r.coleta===true && r.adiantado===true,
     'veio '+JSON.stringify({ok:r.ok,col:r.coleta,ad:r.adiantado}));
  d=await chamar('GET /api/carregamento');
  ok('mas no canto ainda nao saiu: a conta nao anda', d.saiu_adiantado.hoje.pecas===3 && d.saiu_adiantado.hoje.coleta===0,
     'veio '+JSON.stringify(d.saiu_adiantado.hoje));
  /* O caminhao leva pela SAIDA (fase 3): abre, "nao ficou nada", foto e o
     numero que a propria saida conta. */
  r=await chamar('POST /api/saida/abrir',{});
  await chamar('POST /api/saida/nada',{});
  r=await chamar('POST /api/saida/fechar',{motorista:r.sistema,foto:FOTO});
  d=await chamar('GET /api/carregamento');
  ok('o caminhao levou: conta 1 peca de coleta', r.ok===true && d.saiu_adiantado.hoje.pecas===4
     && d.saiu_adiantado.hoje.coleta===1, 'veio '+JSON.stringify(d.saiu_adiantado.hoje));

  /* O PERIODO: ontem conta nos 30 dias e nao hoje; 40 dias atras fica fora; e
     o fechamento a mao dos scripts do §5 (carimbado NA data do despacho, as
     15:00) nunca e adiantado. */
  const insC=db.prepare(`INSERT INTO lote (codigo,buyer,nf,packId,venda,codes,estagio,data,despachar_em,carregado_em)
    VALUES ('BK100100BEGE',?,?,?,?,'[]','carregado',?,?,?)`);
  insC.run('Ontem Adiantado','7201','72011','72012',ontem,
    db.prepare("SELECT date('now','localtime','+1 day') d").get().d, ontem+' 10:00:00');
  insC.run('Muito Antigo','7202','72021','72022',ontem,
    db.prepare("SELECT date('now','localtime','-30 day') d").get().d,
    db.prepare("SELECT date('now','localtime','-40 day') d").get().d+' 10:00:00');
  insC.run('Fechado Script','7203','72031','72032',ontem, ontem, ontem+' 15:00:00');
  d=await chamar('GET /api/carregamento');
  ok('adiantado de ontem conta no periodo e nao no dia',
     d.saiu_adiantado.hoje.pecas===4 && d.saiu_adiantado.periodo.pecas===5 && d.saiu_adiantado.periodo.dias===30,
     'veio '+JSON.stringify(d.saiu_adiantado));
  ok('o periodo e de 30 dias, o de 40 dias atras fica fora e o fechamento a mao nao conta',
     d.saiu_adiantado.periodo.caixas===4, 'veio '+JSON.stringify(d.saiu_adiantado.periodo));

  /* VENDAS-E-MEDIA fase 2 (D2): a venda cancelada no ML depois da etiqueta.
     O import tirou a caixa de 'embalado'; ela nao aparece para carregar, e se
     alguem a bipar mesmo assim, a recusa diz para nao carregar. */
  ins.run('BK140140BEGE','Cancelou Depois','7301','73011','73012','["73011","73012"]','cancelado',hoje);
  d=await chamar('GET /api/carregamento');
  ok('a caixa cancelada nao aparece para carregar', !JSON.stringify(d).includes('Cancelou Depois'));
  r=await chamar('POST /api/carregar',{code:'73011'});
  ok('o bipe recusa a caixa cancelada, dizendo para nao carregar',
     r.ok===false && r.motivo==='cancelada' && /carregar/i.test(r.aviso||''), 'veio '+JSON.stringify(r));

  db.close();
  try{ fs.rmSync(tmp,{recursive:true,force:true}); }catch(e){}
  console.log('');
  console.log(falhas? (falhas+' de '+casos+' FALHARAM') : ('todos os '+casos+' casos passaram'));
  process.exit(falhas?1:0);
})();

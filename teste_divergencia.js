#!/usr/bin/env node
/* Testes do destravamento de divergencia (§5 do CLAUDE.md).
 *
 *   node teste_divergencia.js
 *
 * As cinco conferencias do §5 param o volume por motivos com TEXTOS diferentes,
 * e a tela precisa oferecer uma escolha valida em todos. Ate 01/09/2026 ela
 * montava os botoes com split("/") no texto do bloqueio: funcionava so no motivo
 * 1 e nos outros quatro oferecia a frase inteira como se fosse um SKU. O volume
 * ficava preso para sempre — a trava sabia acusar e nao sabia liberar.
 *
 * Banco em memoria. Nao toca no dados.db nem na rede.
 */
const Database=require('better-sqlite3');
const express=require('express');
let falhas=0, casos=0;

async function montar(){
  const db=new Database(':memory:');
  db.exec(`CREATE TABLE skus (codigo TEXT PRIMARY KEY, largura_cm INT, altura_cm INT,
    cor_codigo TEXT, cor TEXT, tecido_codigo TEXT, modelo_id INT, estoque INT DEFAULT 0);
   CREATE TABLE cor (codigo TEXT PRIMARY KEY, nome TEXT);
   CREATE TABLE tecido (codigo TEXT PRIMARY KEY, nome TEXT);
   CREATE TABLE modelo (id INTEGER PRIMARY KEY, nome TEXT, exige_medida INT DEFAULT 1);
   INSERT INTO modelo VALUES (1,'Rolo',1);
   INSERT INTO cor VALUES ('BEGE','Bege'),('CINZA','Cinza');
   INSERT INTO tecido VALUES ('BLACKOUT','Blackout');
   INSERT INTO skus (codigo,largura_cm,altura_cm,cor_codigo,tecido_codigo,modelo_id) VALUES
     ('BK160140BEGE',160,140,'BEGE','BLACKOUT',1),
     ('BK140140BEGE',140,140,'BEGE','BLACKOUT',1),
     ('BK160160CINZA',160,160,'CINZA','BLACKOUT',1),
     ('SCREEN3-160140BEGE',160,140,'BEGE','BLACKOUT',1),
     ('ROLO SOB MEDIDA 137x212',137,212,'BEGE','BLACKOUT',1);`);
  const app=express(); app.use(express.json());
  app.locals.acesso={auditar:()=>{}};
  /* Sem auth aqui: quem responde por permissao e o auth.js (§10), e o que este
     teste pergunta e outra coisa — se a divergencia consegue ser resolvida. */
  app.use((req,res,next)=>{ req.usuario={id:1,nome:'Conferente'}; next(); });
  require('./exp_route')(app,db);
  const server=await new Promise(r=>{ const s=app.listen(0,()=>r(s)); });
  return {db,app,server,base:'http://127.0.0.1:'+server.address().port};
}
/* Chama a rota de verdade, por HTTP: e o mesmo caminho que a tela usa. */
async function chamar(ctx,metodo,url,corpo){
  const r=await fetch(ctx.base+url,{method:metodo,
    headers:{'Content-Type':'application/json'},
    body:corpo?JSON.stringify(corpo):undefined});
  return {status:r.status, body:await r.json()};
}
function fechar(ctx){ try{ctx.server.close();}catch(e){} try{ctx.db.close();}catch(e){} }
function bloquear(db,motivo,codigo){
  return db.prepare(`INSERT INTO lote (codigo,buyer,nf,packId,venda,estagio,bloqueio,descricao)
    VALUES (?,?,?,?,?,'bloqueado',?,?)`)
    .run(codigo,'Cliente Teste','5001','2000014610097547','2000018016683414',
         'divergencia: '+motivo,'Persiana Cortina Rolo Blackout 1,60x1,40 Blecaute Bege').lastInsertRowid;
}
function conferir(nome,cond,detalhe){
  casos++;
  if(cond) console.log('ok      '+nome);
  else { falhas++; console.log('FALHOU  '+nome); if(detalhe) console.log('        '+detalhe); }
}

(async()=>{
  /* Os cinco motivos, com o texto EXATO que o parse.js escreve. Se o texto de
     um deles mudar la, o caso correspondente quebra aqui — que e o ponto. */
  const MOTIVOS=[
    ['1 leituras divergem',     'leituras divergem: BK160140BEGE / BK140140BEGE', 'BK160140BEGE', 2],
    ['2 comprador nao bate',    'comprador nao bate: etiqueta "Silvia Carolina" / folha "Evandro Souza"', 'BK160140BEGE', 1],
    ['3 descricao x SKU',       'descricao diz 160x140 e o SKU e BK140140BEGE', 'BK140140BEGE', 1],
    ['4 cor do anuncio',        'anuncio diz cor Cinza e o SKU e BK160140BEGE', 'BK160140BEGE', 1],
    ['5 familia do anuncio',    'o anuncio "Toucher Rolo Evolux" sempre foi SCREEN3, e o SKU e BK160140BEGE', 'BK160140BEGE', 1],
  ];
  for(const [nome,motivo,gravado,minOpcoes] of MOTIVOS){
    const ctx=await montar(); const db=ctx.db;
    bloquear(db,motivo,gravado);
    const r=await chamar(ctx,'GET','/api/divergencias');
    const v=(r.body||[])[0]||{};
    const ops=(v.opcoes||[]).map(o=>o.codigo);
    conferir('motivo '+nome+': oferece SKU de verdade',
      ops.length>=minOpcoes && ops.every(c=>/^[A-Z0-9 -]+$/.test(c)),
      'opcoes vieram: '+JSON.stringify(ops));
    conferir('motivo '+nome+': o codigo gravado esta entre as opcoes',
      ops.indexOf(gravado)===0, 'opcoes: '+JSON.stringify(ops));
    fechar(ctx);
  }

  /* Resolver: o volume sai de bloqueado, vira pendente e guarda a historia. */
  {
    const ctx=await montar(); const db=ctx.db;
    const id=bloquear(db,'leituras divergem: BK160140BEGE / BK140140BEGE','BK160140BEGE');
    const r=await chamar(ctx,'POST','/api/divergencias/resolver',{id,codigo:'BK140140BEGE'});
    const v=db.prepare('SELECT * FROM lote WHERE id=?').get(id);
    conferir('resolver troca o SKU e solta o volume',
      r.body.ok && v.estagio==='pendente' && v.codigo==='BK140140BEGE' && !v.bloqueio,
      JSON.stringify({resp:r.body,estagio:v.estagio,codigo:v.codigo,bloqueio:v.bloqueio}));
    conferir('a duvida vira historia, com quem desempatou',
      /leituras divergem/.test(v.bloqueio_resolvido||'') && v.resolvido_por==='Conferente' && !!v.resolvido_em,
      JSON.stringify({b:v.bloqueio_resolvido,q:v.resolvido_por,em:v.resolvido_em}));
    fechar(ctx);
  }
  /* Concordar com o sistema tambem e uma resposta — e era a unica que a tela
     nao aceitava nos motivos 3, 4 e 5. */
  {
    const ctx=await montar(); const db=ctx.db;
    const id=bloquear(db,'descricao diz 160x140 e o SKU e BK140140BEGE','BK140140BEGE');
    const r=await chamar(ctx,'POST','/api/divergencias/resolver',{id,codigo:'BK140140BEGE'});
    const v=db.prepare('SELECT * FROM lote WHERE id=?').get(id);
    conferir('confirmar o SKU que ja estava gravado solta o volume',
      r.body.ok && r.body.manteve===true && v.estagio==='pendente',
      JSON.stringify(r.body));
    fechar(ctx);
  }
  /* SKU com espaco (§7: etiqueta livre) — nenhuma quebra por token acharia. */
  {
    const ctx=await montar(); const db=ctx.db;
    bloquear(db,'leituras divergem: ROLO SOB MEDIDA 137x212 / BK140140BEGE','BK140140BEGE');
    const r=await chamar(ctx,'GET','/api/divergencias');
    const ops=((r.body[0]||{}).opcoes||[]).map(o=>o.codigo);
    conferir('SKU com espaco no nome entra como opcao',
      ops.indexOf('ROLO SOB MEDIDA 137x212')>=0, 'opcoes: '+JSON.stringify(ops));
    fechar(ctx);
  }
  /* A trava do §6 continua de pe: SKU fora do cadastro nao solta volume. */
  {
    const ctx=await montar(); const db=ctx.db;
    const id=bloquear(db,'leituras divergem: BK160140BEGE / BK999999PRETO','BK160140BEGE');
    const r=await chamar(ctx,'POST','/api/divergencias/resolver',{id,codigo:'BK999999PRETO'});
    const v=db.prepare('SELECT estagio FROM lote WHERE id=?').get(id);
    conferir('SKU fora do cadastro nao solta o volume (§6)',
      !!r.body.erro && v.estagio==='bloqueado', JSON.stringify(r.body));
    fechar(ctx);
  }
  console.log('');
  console.log(falhas? (falhas+' de '+casos+' FALHARAM') : ('todos os '+casos+' casos passaram'));
  process.exit(falhas?1:0);
})();

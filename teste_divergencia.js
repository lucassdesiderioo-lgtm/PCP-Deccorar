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
function bloquear(db,motivo,codigo,prefixo){
  return db.prepare(`INSERT INTO lote (codigo,buyer,nf,packId,venda,estagio,bloqueio,descricao)
    VALUES (?,?,?,?,?,'bloqueado',?,?)`)
    .run(codigo,'Cliente Teste','5001','2000014610097547','2000018016683414',
         (prefixo||'divergencia: ')+motivo,'Persiana Cortina Rolo Blackout 1,60x1,40 Blecaute Bege').lastInsertRowid;
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

  /* ── ETIQUETA EM FORMATO NOVO: A GESTAO DECIDE (§8-B, armadilha #21) ──────
     O volume retido por `modalidade:` nao aparece na lista de SKU sem cadastro
     nem na de divergencia — tem lista propria — e sai so pela decisao
     agencia/coleta, que grava a modalidade e o rastro. */
  {
    const ctx=await montar(); const db=ctx.db;
    const id=bloquear(db,'a linha "Despachar:" veio num formato novo — "quinta 10/set — retirada"','BK140140BEGE','modalidade: ');
    const p=await chamar(ctx,'GET','/api/modalidade/pendentes');
    conferir('o volume em formato novo aparece na lista da gestao, com o motivo',
      p.body.length===1 && p.body[0].id===id && /formato novo/.test(p.body[0].motivo), JSON.stringify(p.body));
    const b=await chamar(ctx,'GET','/api/bloqueados');
    const dv=await chamar(ctx,'GET','/api/divergencias');
    conferir('e NAO aparece como SKU sem cadastro nem como divergencia',
      b.body.length===0 && dv.body.length===0, JSON.stringify({bloq:b.body,div:dv.body}));
    const r=await chamar(ctx,'POST','/api/modalidade/resolver',{ids:[id],modalidade:'coleta'});
    const v=db.prepare('SELECT * FROM lote WHERE id=?').get(id);
    conferir('decidir "coleta" grava a modalidade, solta o volume e deixa rastro',
      r.body.ok && r.body.liberados===1 && v.estagio==='pendente' && v.modalidade==='coleta' && v.bloqueio===null
      && /formato novo/.test(v.bloqueio_resolvido||'') && v.resolvido_por==='Conferente' && !!v.resolvido_em,
      JSON.stringify({r:r.body,v}));
    const r2=await chamar(ctx,'POST','/api/modalidade/resolver',{ids:[id],modalidade:'agencia'});
    conferir('decidir de novo um volume ja solto nao mexe nele',
      r2.body.ok && r2.body.ignorados===1 && db.prepare('SELECT modalidade FROM lote WHERE id=?').get(id).modalidade==='coleta',
      JSON.stringify(r2.body));
    const r3=await chamar(ctx,'POST','/api/modalidade/resolver',{ids:[id],modalidade:'caminhao'});
    conferir('so agencia ou coleta sao respostas', r3.status===400, JSON.stringify(r3.body));
    fechar(ctx);
  }
  /* DUAS LISTAS EM "FALTAM IMPRIMIR": o mesmo SKU sai numa linha por porta
     de saida, cada uma com a sua conta. NULL e agencia. */
  {
    const ctx=await montar(); const db=ctx.db;
    const ins=db.prepare(`INSERT INTO lote (codigo,buyer,nf,packId,estagio,modalidade) VALUES (?,?,?,?,'pendente',?)`);
    ins.run('BK140140BEGE','A','1','p1','agencia'); ins.run('BK140140BEGE','B','2','p2',null);
    ins.run('BK140140BEGE','C','3','p3','coleta'); ins.run('BK160140BEGE','D','4','p4','coleta');
    const r=await chamar(ctx,'GET','/api/pendentes');
    const linhas=r.body.map(x=>x.codigo+':'+x.modalidade+'='+x.qtd).sort();
    conferir('pendentes vem por SKU e por modalidade, NULL contando como agencia',
      JSON.stringify(linhas)===JSON.stringify(['BK140140BEGE:agencia=2','BK140140BEGE:coleta=1','BK160140BEGE:coleta=1']),
      JSON.stringify(linhas));
    fechar(ctx);
  }
  /* A decisao da modalidade nao passa por cima do §6: SKU fora do cadastro
     continua retido, agora pelo motivo certo. */
  {
    const ctx=await montar(); const db=ctx.db;
    const id=bloquear(db,'a etiqueta veio SEM a linha "Despachar:"','BK999999PRETO','modalidade: ');
    const r=await chamar(ctx,'POST','/api/modalidade/resolver',{ids:[id],modalidade:'agencia'});
    const v=db.prepare('SELECT * FROM lote WHERE id=?').get(id);
    conferir('SKU fora do cadastro: a modalidade fica gravada mas o volume segue bloqueado pelo §6',
      r.body.ok && r.body.ainda_sem_sku===1 && v.estagio==='bloqueado' && v.bloqueio==='sku_nao_cadastrado' && v.modalidade==='agencia',
      JSON.stringify({r:r.body,v}));
    const b=await chamar(ctx,'GET','/api/bloqueados');
    conferir('e agora aparece na lista de SKU sem cadastro', b.body.length===1 && b.body[0].codigo==='BK999999PRETO', JSON.stringify(b.body));
    fechar(ctx);
  }
  /* ── A ETIQUETA COM MAIS DE UM PRODUTO (§5-B, armadilha #23) ──────────────
     Caso real de 15/09/2026: NF 6585, Fabiano Pereira — UMA etiqueta com três
     persianas de dois SKUs. Antes disso o volume passava LIMPO (conflito null)
     e as duas peças do irmão sumiam sem aviso.
     A trava aqui não é sobre QUAL peça (isso é divergência) — é sobre QUANTAS,
     e por isso tem motivo, tela e resolvedor próprios. */
  {
    const ctx=await montar(); const db=ctx.db;
    const id=db.prepare(`INSERT INTO lote (codigo,buyer,nf,packId,venda,estagio,bloqueio,modalidade)
      VALUES ('BK120120BEGE','Fabiano Pereira','6585','2000015040457349','2000018468081338','bloqueado',?,'coleta')`)
      .run('pacote: esta etiqueta leva 3 pecas de 2 SKUs — 1x BK120120BEGE + 2x BK140140BEGE').lastInsertRowid;
    db.prepare("INSERT INTO skus (codigo,largura_cm,altura_cm,cor_codigo,tecido_codigo,modelo_id) VALUES ('BK120120BEGE',120,120,'BEGE','BLACKOUT',1)").run();
    db.prepare("INSERT INTO lote_item (lote_id,codigo,qtd,origem) VALUES (?,'BK120120BEGE',1,'folha')").run(id);
    db.prepare("INSERT INTO lote_item (lote_id,codigo,qtd,origem) VALUES (?,'BK140140BEGE',2,'folha')").run(id);

    const p=await chamar(ctx,'GET','/api/pacote/pendentes');
    const v0=p.body[0]||{};
    conferir('o volume do pacote sai na tela com as peças que a folha leu',
      p.body.length===1 && (v0.itens||[]).length===2 && v0.itens[0].codigo==='BK120120BEGE' && v0.itens[1].qtd===2,
      JSON.stringify(p.body));
    conferir('e cada peça vem com o que ela É, não só o código (§7)',
      v0.itens[0].largura_cm===120 && v0.itens[0].cor_nome==='Bege' && v0.itens[0].cadastrado===1,
      JSON.stringify(v0.itens[0]));

    /* O volume do pacote NAO pode aparecer na lista generica de bloqueados:
       ali a solucao e cadastrar SKU, e cadastrar SKU nao diz quantas persianas
       vao na caixa. Misturar as duas esconde a que e grave. */
    const b=await chamar(ctx,'GET','/api/bloqueados');
    conferir('e não se mistura com os bloqueados por SKU sem cadastro', b.body.length===0, JSON.stringify(b.body));

    /* A TRAVA DO §6 VALE PARA CADA PECA, e nao so pro `lote.codigo`. */
    const ruim=await chamar(ctx,'POST','/api/pacote/resolver',{id,itens:[{codigo:'BK120120BEGE',qtd:1},{codigo:'BK999PRETO',qtd:1}]});
    conferir('assinar com um SKU fora do cadastro é recusado, dizendo qual',
      !!ruim.body.erro && /BK999PRETO/.test(ruim.body.erro), JSON.stringify(ruim.body));
    conferir('e o volume continua retido depois da recusa',
      db.prepare('SELECT estagio FROM lote WHERE id=?').get(id).estagio==='bloqueado');

    /* CONCORDAR COM A FOLHA E UM CLIQUE — e a licao da §5: a tela que so aceita
       discordar prende o volume para sempre. */
    const r=await chamar(ctx,'POST','/api/pacote/resolver',
      {id,itens:[{codigo:'BK120120BEGE',qtd:1},{codigo:'BK140140BEGE',qtd:2}]});
    const v=db.prepare('SELECT * FROM lote WHERE id=?').get(id);
    conferir('assinar solta o volume e conta as peças',
      r.body.ok && r.body.pecas===3 && v.estagio==='pendente' && v.bloqueio===null, JSON.stringify({r:r.body,v}));
    conferir('a dúvida vira história: quem assinou, quando, e qual era',
      /^pacote:/.test(v.bloqueio_resolvido||'') && v.resolvido_por==='Conferente' && !!v.resolvido_em,
      JSON.stringify({b:v.bloqueio_resolvido,q:v.resolvido_por}));
    conferir('as peças passam a ser da GESTÃO, não da folha',
      db.prepare("SELECT COUNT(*) c FROM lote_item WHERE lote_id=? AND origem='gestao'").get(id).c===2);
    conferir('e continua sendo UM volume: nenhuma etiqueta foi inventada',
      db.prepare("SELECT COUNT(*) c FROM lote WHERE packId='2000015040457349'").get().c===1);

    /* O conserto existe: a folha pode ter lido errado, e quem abriu o pedido no
       ML troca o SKU. Sem isso a tela so sabe concordar. */
    const id2=db.prepare(`INSERT INTO lote (codigo,buyer,nf,packId,estagio,bloqueio)
      VALUES ('BK140140BEGE','Outro','6586','p9','bloqueado','pacote: esta etiqueta leva 2 pecas de 2 SKUs')`).run().lastInsertRowid;
    db.prepare("INSERT INTO lote_item (lote_id,codigo,qtd,origem) VALUES (?,'BK140140BEGE',1,'folha')").run(id2);
    db.prepare("INSERT INTO lote_item (lote_id,codigo,qtd,origem) VALUES (?,'BK160160CINZA',1,'folha')").run(id2);
    const troca=await chamar(ctx,'POST','/api/pacote/resolver',
      {id:id2,itens:[{codigo:'BK140140BEGE',qtd:1},{codigo:'BK160140BEGE',qtd:3}]});
    const itens2=db.prepare('SELECT codigo,qtd FROM lote_item WHERE lote_id=? ORDER BY id').all(id2);
    conferir('a gestão pode TROCAR o SKU e a quantidade que a folha trouxe',
      troca.body.ok && troca.body.pecas===4 && itens2.length===2 &&
      itens2[1].codigo==='BK160140BEGE' && itens2[1].qtd===3, JSON.stringify({r:troca.body,itens:itens2}));
    conferir('e o lote.codigo passa a ser o da primeira peça',
      db.prepare('SELECT codigo FROM lote WHERE id=?').get(id2).codigo==='BK140140BEGE');
    fechar(ctx);
  }

  /* ── A CAIXA DE VARIAS PERSIANAS NA TELA DE QUEM IMPRIME (16/09/2026) ──
     A NF 6490 saiu com uma persiana de duas. A trava do bipe ja existia, mas a
     pessoa so descobria DEPOIS de montar a caixa: a lista contava CAIXA, dizia
     "1", e ela voltava da prateleira com uma peca. Estes casos travam os dois
     numeros e o card que os separa. */
  {
    const ctx=await montar(); const db=ctx.db;
    const ins=db.prepare(`INSERT INTO lote (codigo,buyer,nf,packId,estagio,modalidade) VALUES (?,?,?,?,'pendente',?)`);
    const normal=ins.run('BK140140BEGE','Ana','1','p1','agencia').lastInsertRowid;
    const dupla =ins.run('BK140140BEGE','Bruno','6490','p2','agencia').lastInsertRowid;
    const pack  =ins.run('BK120120BEGE','Fabiano','6585','p3','coleta').lastInsertRowid;
    // Sem nenhuma linha em lote_item: o volume de sempre, que e a esmagadora maioria.
    ins.run('BK160160CINZA','Carla','9','p4','agencia');
    // Bruno: 2 unidades do MESMO SKU (o caso da 6490). Fabiano: 2 SKUs.
    db.prepare("INSERT INTO lote_item (lote_id,codigo,qtd,origem) VALUES (?,'BK140140BEGE',2,'folha')").run(dupla);
    db.prepare("INSERT INTO lote_item (lote_id,codigo,qtd,origem) VALUES (?,'BK120120BEGE',1,'folha')").run(pack);
    db.prepare("INSERT INTO lote_item (lote_id,codigo,qtd,origem) VALUES (?,'BK140140BEGE',2,'folha')").run(pack);

    const p=await chamar(ctx,'GET','/api/pendentes');
    const linha=(p.body||[]).find(x=>x.codigo==='BK140140BEGE' && x.modalidade==='agencia')||{};
    /* CAIXA e PERSIANA sao numeros diferentes, e so divergem aqui: 2 caixas
       (Ana e Bruno) carregando 3 persianas. Se `pecas` copiasse `qtd`, a linha
       voltaria a mandar a pessoa buscar 2 quando ela precisa de 3. */
    conferir('a lista conta CAIXA e PERSIANA, e as duas contas convivem',
      linha.qtd===2 && linha.pecas===3, JSON.stringify(linha));
    /* O volume SEM linha em `lote_item` vale 1 — e o volume de sempre, e e ele
       que nao pode ganhar linha ambar nem card por causa desta mudanca. */
    const semItens=(p.body||[]).find(x=>x.codigo==='BK160160CINZA')||{};
    conferir('volume sem linha em lote_item vale 1 peca, como sempre valeu',
      semItens.qtd===1 && semItens.pecas===1, JSON.stringify(semItens));
    // E o pai do pacote conta as 3 que vao na caixa dele, nao a 1 do lote.codigo.
    const doPack=(p.body||[]).find(x=>x.codigo==='BK120120BEGE')||{};
    conferir('a caixa de pacote conta as pecas que vao dentro, nao o codigo do volume',
      doPack.qtd===1 && doPack.pecas===3, JSON.stringify(doPack));

    /* A MESMA CAIXA APARECE NO CARD E NA LISTA, E A LINHA TEM QUE DIZER ISSO
       (25/09/2026, NF 7044). O card agrupa por cliente e a lista por SKU — duas
       perguntas, e as duas ficam. Mas quem le de relance via o mesmo SKU duas
       vezes e achava que eram duas vendas. A linha passa a nomear QUEM e a caixa
       de varias persianas, com o mesmo nome escrito no card: o nome e o que liga
       as duas. So o cliente dessa caixa — a Ana, venda comum na mesma linha,
       nao pode aparecer, senao a frase aponta uma caixa que nao esta no card. */
    conferir('a linha nomeia o cliente da caixa de varias persianas, e so ele',
      JSON.stringify(linha.clientes_varias)===JSON.stringify(['Bruno']), JSON.stringify(linha.clientes_varias));
    conferir('a linha do pacote de 2 SKUs nomeia o cliente dele',
      JSON.stringify(doPack.clientes_varias)===JSON.stringify(['Fabiano']), JSON.stringify(doPack.clientes_varias));
    conferir('a linha sem caixa de varias nao nomeia ninguem',
      (semItens.clientes_varias||[]).length===0, JSON.stringify(semItens.clientes_varias));

    const v=await chamar(ctx,'GET','/api/pendentes/varias');
    const ids=(v.body||[]).map(x=>x.id).sort((a,b)=>a-b);
    /* O card so mostra caixa com MAIS DE UMA persiana. A venda normal da Ana
       nao pode aparecer: card que lista o dia inteiro nao separa nada. */
    conferir('o card traz so as caixas de varias persianas, nunca a venda normal',
      JSON.stringify(ids)===JSON.stringify([dupla,pack].sort((a,b)=>a-b)), JSON.stringify(ids));
    const cx=(v.body||[]).find(x=>x.id===pack)||{};
    /* Agrupado por VOLUME e trazendo as pecas: e uma caixa para uma pessoa, e
       sem a lista das pecas a bancada nao sabe o que buscar na prateleira. */
    conferir('cada caixa vem com o cliente e as pecas que vao dentro',
      cx.buyer==='Fabiano' && cx.pecas===3 && (cx.itens||[]).length===2
      && cx.itens[1].codigo==='BK140140BEGE' && cx.itens[1].qtd===2, JSON.stringify(cx));
    const cy=(v.body||[]).find(x=>x.id===dupla)||{};
    conferir('a caixa de 2 unidades do MESMO SKU tambem entra no card (NF 6490)',
      cy.pecas===2 && (cy.itens||[]).length===1 && cy.itens[0].qtd===2, JSON.stringify(cy));
    fechar(ctx);
  }
  /* Dia sem nenhuma caixa dupla: o card tem que vir VAZIO, para a tela poder
     escondê-lo. Card vazio todo dia vira paisagem e ninguem le no dia em que
     ele aparece cheio. */
  {
    const ctx=await montar(); const db=ctx.db;
    db.prepare(`INSERT INTO lote (codigo,buyer,nf,packId,estagio) VALUES ('BK140140BEGE','Ana','1','p1','pendente')`).run();
    const v=await chamar(ctx,'GET','/api/pendentes/varias');
    conferir('dia normal devolve lista vazia — o card some, nao fica dizendo "nenhuma"',
      Array.isArray(v.body) && v.body.length===0, JSON.stringify(v.body));
    fechar(ctx);
  }

  /* ── A CAIXA DE VARIAS PERSIANAS NO PAINEL "PRA DESPACHAR DEPOIS" (23/09) ──
     O caso real: NF 6959, Silmara, 2 persianas de 2 SKUs, despacho em 01/10. O
     volume estava certo no banco (retido, assinado, solto) e MENTIA na tela: o
     painel do "depois" contava volume com COUNT(*) e so olhava `lote.codigo`,
     entao saia "BK130130BEGE ×1" — o numero errado E o segundo SKU invisivel.
     E o painel convida a adiantar ("bipe o SKU e a etiqueta sai"), enquanto o
     /api/proximo NAO filtra por prazo (§8): a pessoa ia buscar UMA peca e so
     descobria na volta. E a armadilha #23 pela quarta porta. */
  {
    const ctx=await montar(); const db=ctx.db;
    db.prepare("INSERT INTO cor VALUES ('BRANCO','Branco')").run();
    db.prepare(`INSERT INTO skus (codigo,largura_cm,altura_cm,cor_codigo,tecido_codigo,modelo_id)
      VALUES ('BK130130BEGE',130,130,'BEGE','BLACKOUT',1),('BK130130BRANCO',130,130,'BRANCO','BLACKOUT',1)`).run();
    const hoje=db.prepare("SELECT date('now','localtime') d").get().d;
    const dep =db.prepare("SELECT date('now','localtime','+8 days') d").get().d;
    const ins=db.prepare(`INSERT INTO lote (codigo,buyer,nf,packId,estagio,modalidade,despachar_em)
      VALUES (?,?,?,?,'pendente',?,?)`);
    const dep2=db.prepare("SELECT date('now','localtime','+15 days') d").get().d;
    const silmara=ins.run('BK130130BEGE','Silmara','6959','p9','agencia',dep).lastInsertRowid;
    const futNormal=ins.run('BK140140BEGE','Ana','7000','p10','agencia',dep).lastInsertRowid;
    const hojeDupla=ins.run('BK160160CINZA','Carla','7001','p11','agencia',hoje).lastInsertRowid;
    /* Uma segunda data e uma COLETA: o painel quebra por dia e a tela precisa do
       `modalidade` pra respeitar o filtro do topo. Em producao (23/09/2026) o
       futuro inteiro era coleta — 22 de 22. */
    ins.run('BK140140BEGE','Joao','7002','p12','coleta',dep2);
    db.prepare("UPDATE skus SET estoque=0 WHERE codigo='BK130130BEGE'").run();
    db.prepare("UPDATE skus SET estoque=4 WHERE codigo='BK140140BEGE'").run();
    db.prepare("INSERT INTO lote_item (lote_id,codigo,qtd,origem) VALUES (?,'BK130130BEGE',1,'folha')").run(silmara);
    db.prepare("INSERT INTO lote_item (lote_id,codigo,qtd,origem) VALUES (?,'BK130130BRANCO',1,'folha')").run(silmara);
    db.prepare("INSERT INTO lote_item (lote_id,codigo,qtd,origem) VALUES (?,'BK160160CINZA',2,'folha')").run(hojeDupla);

    const f=await chamar(ctx,'GET','/api/pendentes/futuros');
    const lin=(f.body||[]).find(x=>x.codigo==='BK130130BEGE')||{};
    /* UMA caixa, DUAS persianas. Os dois numeros, nunca um so — e `pecas` e o
       que diz quantas peças tirar da prateleira. */
    conferir('o painel do depois conta CAIXA e PERSIANA (NF 6959)',
      lin.qtd===1 && lin.pecas===2, JSON.stringify(lin));
    /* O painel do "depois" usa o mesmo desenhista e a mesma consulta: a caixa
       dele tambem aparece duas vezes, e a linha tambem tem que dizer de quem e. */
    conferir('o painel do depois nomeia o cliente da caixa de varias',
      JSON.stringify(lin.clientes_varias)===JSON.stringify(['Silmara']), JSON.stringify(lin.clientes_varias));
    const linN=(f.body||[]).find(x=>x.codigo==='BK140140BEGE' && x.despachar_em===dep)||{};
    conferir('venda futura normal continua valendo 1 peca',
      linN.qtd===1 && linN.pecas===1, JSON.stringify(linN));

    /* ── A REORGANIZACAO DO PAINEL (23/09/2026) ──
       Ele era um resumo cru de tres colunas (data, codigo, COUNT). Sem medida,
       sem cor, sem modelo e — o mais caro — SEM ESTOQUE, enquanto a propria
       linha do painel promete "bipe o SKU e a etiqueta sai, se tiver peca na
       prateleira". Hoje ele sai do MESMO `SELECT` da lista do dia. */
    conferir('o painel traz o que a peca E, nao so o codigo (§7)',
      lin.largura_cm===130 && lin.altura_cm===130 && lin.cor_nome==='Bege'
      && lin.tecido_nome==='Blackout' && lin.modelo_nome==='Rolo', JSON.stringify(lin));
    /* O vermelho de "sem estoque — precisa produzir" sai deste campo, e e a
       resposta a pergunta que o painel fazia e nao respondia. */
    conferir('o painel traz o estoque, que e o que responde "da pra adiantar?"',
      lin.estoque===0 && linN.estoque===4, JSON.stringify({a:lin.estoque,b:linN.estoque}));
    /* Uma linha por DATA: o mesmo SKU em dois dias sao duas linhas, senao o dia
       grande (11 caixas em 28/09, em producao) se dilui no vizinho. */
    const doJoao=(f.body||[]).filter(x=>x.codigo==='BK140140BEGE');
    conferir('o mesmo SKU em duas datas vira DUAS linhas, uma por dia',
      doJoao.length===2 && doJoao[0].despachar_em===dep && doJoao[1].despachar_em===dep2,
      JSON.stringify(doJoao.map(x=>x.despachar_em)));
    /* `modalidade` e o que faz o filtro Todas/Agencia/Coleta do topo valer aqui
       embaixo tambem — ate 23/09 o painel o ignorava, e a mesma tela passava a
       dizer duas coisas. */
    conferir('cada linha diz por onde a caixa sai, pra o filtro do topo valer aqui',
      doJoao[0].modalidade==='agencia' && doJoao[1].modalidade==='coleta',
      JSON.stringify(doJoao.map(x=>x.modalidade)));
    /* E a lista do DIA nao pode ter mudado de forma ao passar a dividir o
       SELECT com o painel: ela nao quebra por data. */
    const hj2=await chamar(ctx,'GET','/api/pendentes');
    conferir('a lista do dia continua sem quebrar por data',
      (hj2.body||[]).length>0 && (hj2.body||[]).every(x=>x.despachar_em===undefined),
      JSON.stringify((hj2.body||[]).map(x=>x.codigo)));

    const d=await chamar(ctx,'GET','/api/pendentes/varias?quando=depois');
    const ids=(d.body||[]).map(x=>x.id);
    /* A caixa de HOJE nao pode vazar pro painel do depois: fila que mostra o
       que nao e pra agora e fila que a equipe aprende a ignorar (§8, #7). */
    conferir('o depois traz so a caixa futura, nunca a de hoje',
      JSON.stringify(ids)===JSON.stringify([silmara]), JSON.stringify(ids));
    const cx=(d.body||[])[0]||{};
    /* O SEGUNDO SKU, que e o que a consulta antiga nao tinha como mostrar: ele
       mora no lote_item, e sem ele a pessoa busca uma peca bege e fecha a caixa
       sem a branca. */
    conferir('a caixa futura vem com o cliente, a data e as DUAS pecas',
      cx.buyer==='Silmara' && cx.pecas===2 && cx.despachar_em===dep
      && (cx.itens||[]).length===2 && cx.itens[1].codigo==='BK130130BRANCO'
      && cx.itens[1].cor_nome==='Branco', JSON.stringify(cx));

    /* SEM o parametro a rota responde o de HOJE, exatamente como respondia —
       e um tablet com a pagina em cache continua chamando assim. */
    const hj=await chamar(ctx,'GET','/api/pendentes/varias');
    conferir('sem `quando` a rota devolve o de hoje, como o tablet em cache espera',
      (hj.body||[]).length===1 && hj.body[0].id===hojeDupla, JSON.stringify((hj.body||[]).map(x=>x.id)));

    /* ── O ULTIMO LUGAR EM QUE A CAIXA APARECE: os JA IMPRESSOS (23/09/2026) ──
       Depois de impressa, a caixa sai do card e da lista por SKU — as duas
       mostram o que FALTA — e o banner "FECHE A CAIXA COM N PERSIANAS" some no
       bipe seguinte. Dali em diante o volume ficava igual a qualquer venda, e
       e desta lista que se REIMPRIME. O caso real: NF 6986, Silvio. */
    db.prepare("UPDATE lote SET estagio='embalado', embalado_em=datetime('now','localtime') WHERE id IN (?,?)")
      .run(hojeDupla, futNormal);
    const imp=await chamar(ctx,'GET','/api/impressos?dias=2');
    const cxImp=(imp.body||[]).find(x=>x.id===hojeDupla)||{};
    const soloImp=(imp.body||[]).find(x=>x.id===futNormal)||{};
    conferir('o ja impresso diz quantas persianas a caixa levou',
      cxImp.pecas===2, JSON.stringify({id:cxImp.id,pecas:cxImp.pecas}));
    /* E a venda comum continua valendo 1 — sem isso a tarja apareceria em toda
       linha e viraria paisagem. */
    conferir('a venda comum ja impressa continua valendo 1 peca',
      soloImp.pecas===1, JSON.stringify({id:soloImp.id,pecas:soloImp.pecas}));
    fechar(ctx);
  }

  console.log('');
  console.log(falhas? (falhas+' de '+casos+' FALHARAM') : ('todos os '+casos+' casos passaram'));
  process.exit(falhas?1:0);
})();

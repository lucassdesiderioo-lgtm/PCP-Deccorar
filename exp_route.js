const express=require('express'); const fs=require('fs');
const {parsePdf}=require('./parse'); const {PDFDocument}=require('pdf-lib');
module.exports=function(app,db){
  db.exec("CREATE TABLE IF NOT EXISTS lote (id INTEGER PRIMARY KEY AUTOINCREMENT, codigo TEXT, cor TEXT DEFAULT '', buyer TEXT DEFAULT '', city TEXT DEFAULT '', nf TEXT, packId TEXT, venda TEXT, codes TEXT DEFAULT '[]', srcfile TEXT, labelPage INTEGER, danfePage INTEGER, estagio TEXT DEFAULT 'pendente', embalado_em TEXT, carregado_em TEXT, data TEXT DEFAULT (date('now','localtime')), criado_em TEXT DEFAULT (datetime('now','localtime')), teste INTEGER DEFAULT 0, reimpressoes INTEGER DEFAULT 0, reimpresso_em TEXT, bloqueio TEXT, descricao TEXT, despachar_em TEXT);");
  // Reimpressao (impressora enroscou, etiqueta saiu borrada). As duas colunas
  // sao so historia: quantas vezes o volume voltou pra impressora e quando foi a
  // ultima. O ALTER mora aqui, no dono da tabela (§17 do CLAUDE.md), com a
  // coluna no fim — que e onde o SQLite a coloca, mantendo a ordem igual a de
  // producao. Sem default dinamico em reimpresso_em: ALTER nao aceita.
  try{ db.exec("ALTER TABLE lote ADD COLUMN reimpressoes INTEGER DEFAULT 0"); }catch(e){}
  try{ db.exec("ALTER TABLE lote ADD COLUMN reimpresso_em TEXT"); }catch(e){}
  // POR QUE o volume foi bloqueado. Ate aqui so havia um motivo possivel (SKU
  // fora do cadastro) e ele se lia do proprio codigo; com a divergencia de
  // leitura da folha sao dois, e eles se resolvem de formas diferentes — um
  // cadastrando o SKU, o outro escolhendo qual leitura vale.
  try{ db.exec("ALTER TABLE lote ADD COLUMN bloqueio TEXT"); }catch(e){}
  // A descricao do anuncio, como o ML escreveu. Guardada porque e dela que sai
  // a familia do produto na conferencia 5, e porque ter o texto original ajuda
  // a entender uma divergencia meses depois.
  try{ db.exec("ALTER TABLE lote ADD COLUMN descricao TEXT"); }catch(e){}
  /* A DATA LIMITE DE DESPACHO que a etiqueta traz ("Despachar: qua 26/ago").
     Nem todo volume de um lote sai no mesmo dia — no PDF de 25/08 as 14
     etiquetas tinham CINCO datas, so 6 para o dia seguinte. Sem esta coluna a
     fila "Faltam imprimir" cobra hoje a etiqueta que so vence em tres semanas.
     Fica NULL quando a linha nao deu pra ler: volume sem data conhecida conta
     como de hoje, porque some da fila e pior que aparecer cedo demais. */
  try{ db.exec("ALTER TABLE lote ADD COLUMN despachar_em TEXT"); }catch(e){}

  /* ── O QUE O SISTEMA APRENDE SOBRE FAMILIA x PREFIXO DE SKU ────────────────
     Medida e cor nao separam duas pecas que so diferem no TECIDO — e elas
     existem no catalogo: BK160140BEGE ("Cortina Rolo Blackout") e
     SCREEN3-160140BEGE ("Toucher Rolo Evolux") tem a mesma medida e a mesma cor.
     Se um cliente comprar as duas e o vinculo falhar entre elas, nenhuma das
     quatro conferencias acusa.

     A ligacao existe no documento — a familia da descricao sempre anda com o
     mesmo prefixo de SKU — mas uma folha sozinha nao prova nada: SCREEN3 apareceu
     UMA vez em 47 volumes. Entao o sistema acumula o par entre uploads e passa a
     acusar quando um par consolidado e contrariado. Aprende do proprio historico
     em vez de uma tabela escrita a mao, que envelheceria calada. */
  db.exec(`CREATE TABLE IF NOT EXISTS familia_sku (
    familia TEXT, prefixo TEXT, vezes INTEGER DEFAULT 0,
    visto_em TEXT DEFAULT (datetime('now','localtime')),
    PRIMARY KEY (familia,prefixo));`);
  const familiaDe=d=>String(d||'').replace(/\d[,.]\d{2}\s*[xX].*/,'')
    .toUpperCase().normalize('NFD').replace(/[̀-ͯ]/g,'').replace(/[^A-Z ]/g,' ')
    .replace(/\s+/g,' ').trim();
  const prefixoDe=s=>{ const m=String(s||'').toUpperCase().match(/^([A-Z0-9-]*?)(?=\d{3})/);
    return m?m[1].replace(/[-\s]+$/,''):''; };
  /* Quantas vezes um par precisa ter sido visto pra virar regra. Abaixo disso o
     sistema ainda esta aprendendo e nao acusa ninguem — produto novo entrando no
     catalogo nao pode parar a expedicao. */
  const APRENDIZADO=5;
  try{ fs.mkdirSync('/opt/expedicao/lotes',{recursive:true}); }catch(e){}
  const bigJson=express.json({limit:'25mb'});
  app.post('/api/lote/upload', bigJson, async (req,res)=>{
    try{
      const b64=((req.body&&req.body.pdf)||'').replace(/^data:[^,]*,/,'');
      if(!b64) return res.status(400).json({erro:'sem pdf'});
      const buf=Buffer.from(b64,'base64');
      const orders=await parsePdf(new Uint8Array(buf));
      const fname='/opt/expedicao/lotes/'+Date.now()+'.pdf'; fs.writeFileSync(fname,buf);
      /* A DEDUPLICACAO OLHA O HISTORICO INTEIRO, NAO SO O DIA.
         Pack ID e Venda sao numeros do Mercado Livre: cada volume tem o seu, e
         ele nunca se repete em outra venda. Entao "ja existe" e resposta
         definitiva, nao "ja existe hoje".
         Enquanto ela olhava so o dia, resubir um PDF de ontem — ou um PDF que
         repete vendas de dias anteriores, que e o normal quando o lote e
         reemitido — reinseria tudo como PENDENTE de hoje. O volume ja tinha
         sido impresso e carregado; voltava para a fila "Faltam imprimir" como
         se faltasse. Em 25/08 foram 94 volumes fantasmas num dia so, e os
         montes orfaos de 21, 19 e 18/08 mostram que vinha acontecendo ha
         semanas. Uma fila que mostra o que nao existe e uma fila que a equipe
         aprende a ignorar — e ai o volume que falta de verdade some junto. */
      const seen=new Set(); db.prepare("SELECT packId,venda FROM lote").all().forEach(r=>{ if(r.packId)seen.add('p:'+r.packId); if(r.venda)seen.add('v:'+r.venda); });
      const ins=db.prepare("INSERT INTO lote (codigo,cor,buyer,city,nf,packId,venda,codes,srcfile,labelPage,danfePage,estagio,bloqueio,descricao,despachar_em) VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)");
      const existe=db.prepare('SELECT 1 FROM skus WHERE codigo=?');
      const famVista=db.prepare('SELECT prefixo,vezes FROM familia_sku WHERE familia=?');
      const famGrava=db.prepare(`INSERT INTO familia_sku (familia,prefixo,vezes) VALUES (?,?,1)
        ON CONFLICT(familia,prefixo) DO UPDATE SET vezes=vezes+1, visto_em=datetime('now','localtime')`);
      let novos=0,rep=0,semsku=0,bloq=0,divs=0; const desconhecidos={};
      db.transaction(()=>{ for(const o of orders){
        if((o.packId&&seen.has('p:'+o.packId))||(o.venda&&seen.has('v:'+o.venda))){ rep++; continue; }
        if(o.packId)seen.add('p:'+o.packId); if(o.venda)seen.add('v:'+o.venda);
        const sku=(o.sku||'').trim().toUpperCase();
        const ok = sku && existe.get(sku);
        let est='pendente', motivo=null, conflito=o.conflito;

        /* CONFERENCIA 5 — a familia do anuncio contra o prefixo do SKU.
           Acusa so quando ha regra consolidada: a familia ja foi vista >= 5
           vezes com OUTRO prefixo e nunca com este. Familia nova, prefixo novo
           ou pouca historia nao param ninguem — o sistema aprende primeiro. */
        const fam=familiaDe(o.descricao), pre=prefixoDe(sku);
        if(fam && pre){
          const vistos=famVista.all(fam);
          const desteAqui=vistos.find(v=>v.prefixo===pre);
          const consolidado=vistos.find(v=>v.prefixo!==pre && v.vezes>=APRENDIZADO);
          if(!desteAqui && consolidado)
            conflito=(conflito?conflito+' · ':'')+
              'o anuncio "'+String(o.descricao||'').slice(0,40)+'" sempre foi '+consolidado.prefixo+', e o SKU e '+sku;
          else famGrava.run(fam,pre);
        }

        /* A divergencia vem PRIMEIRO: um volume em que as leituras da folha
           discordam nao pode ser liberado por cadastro de SKU, porque nao e o
           cadastro que esta em duvida — e qual peca o cliente comprou. */
        if(conflito){ est='bloqueado'; bloq++; divs++; motivo='divergencia: '+conflito; }
        else if(!ok){ est='bloqueado'; bloq++; motivo='sku_nao_cadastrado';
          const k=sku||'(sem SKU na folha)'; desconhecidos[k]=(desconhecidos[k]||0)+1; }
        if(!o.sku) semsku++;
        ins.run(sku||null,o.cor,o.buyer,o.city,o.nf,o.packId,o.venda,JSON.stringify(o.codes||[]),fname,o.labelPage,o.danfePage,est,motivo,o.descricao||null,o.despacharEm||null); novos++;
      }})();
      res.json({ok:true,total:orders.length,novos,repetidas:rep,sem_sku:semsku,bloqueados:bloq,divergencias:divs,
                desconhecidos:Object.keys(desconhecidos).map(k=>({sku:k,qtd:desconhecidos[k]}))});
    }catch(e){ console.error(e); res.status(500).json({erro:String(e.message||e)}); }
  });
  /* Duas listas, porque sao dois problemas com solucoes diferentes: SKU fora do
     cadastro se resolve cadastrando (e o §6 libera sozinho), divergencia de
     leitura se resolve escolhendo qual peca o cliente comprou. Misturar as duas
     numa contagem so esconderia a segunda, que e a grave. */
  app.get('/api/bloqueados',(req,res)=>{
    res.json(db.prepare(`SELECT codigo, COUNT(*) qtd, GROUP_CONCAT(DISTINCT buyer) compradores
      FROM lote WHERE estagio='bloqueado' AND COALESCE(bloqueio,'') NOT LIKE 'divergencia%'
      GROUP BY codigo ORDER BY qtd DESC`).all());
  });
  /* CONFERENCIA DO QUE JA FOI IMPRESSO.
     A trava do upload so vale pro que entra dali pra frente. Esta rota olha pra
     tras: rele a folha de cada PDF do periodo e compara com o SKU que ficou
     gravado em cada volume. Serve pro dia em que o PDF subiu antes de uma
     correcao, e pro erro que ainda ninguem imaginou — a folha e a unica fonte
     independente que existe do que o cliente comprou.
     E cara (abre e le PDFs), entao roda sob demanda, nunca em intervalo. */
  app.get('/api/auditoria/skus', async (req,res)=>{
    try{
      let dias=parseInt(req.query.dias,10); if(!(dias>=1)) dias=1; if(dias>30) dias=30;
      const {lerFolha,mapasDaFolha,skuDaFolha,itemDaFolha,travasAtivas}=require('./folha');
      const arqs=db.prepare(`SELECT DISTINCT srcfile FROM lote
        WHERE srcfile IS NOT NULL AND data >= date('now','localtime','-'||?||' day')`).all(dias-1)
        .map(r=>r.srcfile).filter(a=>{ try{ return fs.existsSync(a); }catch(e){ return false; } });
      let conferidos=0, semFolha=0; const divergencias=[]; const ilegiveis=[];
      /* Cobertura das travas: quantos volumes cada conferencia do §5 conseguiu
         de fato olhar. Uma trava que para de acusar porque o dado sumiu nao faz
         barulho nenhum — o silencio dela e igual ao silencio de "esta tudo
         certo". Este contador e o que separa os dois. */
      const cobertura={medida:0,cor:0,comprador:0,familia:0};
      const famConsolidada=db.prepare('SELECT 1 FROM familia_sku WHERE familia=? AND vezes>=? LIMIT 1');
      for(const arq of arqs){
        let f; try{ f=await lerFolha(arq); }catch(e){ ilegiveis.push(arq); continue; }
        const mapas=mapasDaFolha(f.blocos);
        const cores=new Set(f.blocos.map(b=>String(b.cor||'').toUpperCase()
          .normalize('NFD').replace(/[̀-ͯ]/g,'').replace(/[^A-Z0-9]/g,'')).filter(c=>c.length>2));
        for(const v of db.prepare('SELECT * FROM lote WHERE srcfile=? ORDER BY id').all(arq)){
          const esperado=skuDaFolha(v,mapas);
          if(!esperado){ semFolha++; continue; }
          conferidos++;
          const t=travasAtivas(v, itemDaFolha(v,f.blocos), cores);
          if(t.medida)cobertura.medida++; if(t.cor)cobertura.cor++; if(t.comprador)cobertura.comprador++;
          /* A conferencia 5 so age quando a familia daquele anuncio ja virou
             regra. Enquanto for produto novo ela nao protege — e isso precisa
             aparecer, senao um catalogo que muda de nomenclatura toda semana
             ficaria eternamente sem essa trava, em silencio. */
          const fam=familiaDe(v.descricao);
          if(fam && famConsolidada.get(fam,APRENDIZADO)) cobertura.familia++;
          if(String(v.codigo||'').toUpperCase()!==String(esperado).toUpperCase())
            divergencias.push({id:v.id,buyer:v.buyer,nf:v.nf,data:v.data,estagio:v.estagio,
                               gravado:v.codigo,folha:esperado,packId:v.packId,venda:v.venda});
        }
      }
      res.json({dias,pdfs:arqs.length,conferidos,sem_folha:semFolha,
                ilegiveis:ilegiveis.length,cobertura,divergencias});
    }catch(e){ console.error(e); res.status(500).json({erro:String(e.message||e)}); }
  });

  app.get('/api/divergencias',(req,res)=>{
    res.json(db.prepare(`SELECT id,codigo,buyer,city,nf,packId,venda,data,bloqueio
      FROM lote WHERE estagio='bloqueado' AND bloqueio LIKE 'divergencia%'
      ORDER BY data DESC, id DESC`).all());
  });
  /* Resolver = alguem OLHOU o pedido no Mercado Livre e disse qual e o SKU.
     Nao ha escolha automatica possivel aqui: se houvesse, nao teria bloqueado. */
  app.post('/api/divergencias/resolver',(req,res)=>{
    const b=req.body||{};
    const id=b.id, sku=String(b.codigo||'').trim().toUpperCase();
    if(!id||!sku) return res.status(400).json({erro:'informe o volume e o SKU'});
    const o=db.prepare('SELECT * FROM lote WHERE id=?').get(id);
    if(!o) return res.status(404).json({erro:'volume nao encontrado'});
    if(!/^divergencia/.test(String(o.bloqueio||''))) return res.json({erro:'esse volume nao esta em divergencia'});
    if(!db.prepare('SELECT 1 FROM skus WHERE codigo=?').get(sku)) return res.json({erro:'SKU nao cadastrado: '+sku});
    db.prepare("UPDATE lote SET codigo=?, estagio='pendente', bloqueio=NULL WHERE id=?").run(sku,id);
    res.json({ok:true,id:id,codigo:sku});
  });
  /* A FILA E POR DATA DE DESPACHO, NAO POR DATA DE ENTRADA.
     O que decide se a etiqueta sai hoje e o prazo que o Mercado Livre carimbou
     na etiqueta, nao o dia em que o PDF foi subido: um lote traz volumes de
     varias datas ao mesmo tempo (no PDF de 25/08, cinco datas em 14 etiquetas).
     Entra na fila o que vence hoje, o que ja venceu — atraso tem que gritar,
     nao sumir — e o que nao tem data lida, porque volume invisivel e pior que
     volume cedo demais.
     O filtro por `data` sai: um volume de ontem que vence hoje e trabalho de
     hoje, e era justamente ele que desaparecia. */
  const {filaDoDia}=require('./fila_dia');
  const FILA_HOJE=filaDoDia();
  /* A LISTA E O ROTEIRO DE BUSCA, NAO UM PLACAR.
     Quem esta na expedicao le esta lista e vai PROCURAR as caixas no estoque.
     So o codigo ("BK160140BEGE") serve para quem decorou o catalogo — e a tela
     e usada por gente diferente a cada dia. Por isso vao junto as colunas de
     `skus` (§7): medida, cor, tecido e modelo, que e o que se le na prateleira.
     O JOIN e por UPPER(codigo) porque o lote guarda o codigo como veio da
     folha; skus.codigo e a chave. */
  app.get('/api/pendentes',(req,res)=>{
    res.json(db.prepare(`SELECT l.codigo, COUNT(*) qtd,
        MIN(l.despachar_em) vence_em,
        SUM(CASE WHEN l.despachar_em IS NOT NULL AND l.despachar_em<date('now','localtime') THEN 1 ELSE 0 END) atrasados,
        s.largura_cm, s.altura_cm,
        COALESCE(c.nome,s.cor_codigo,s.cor) cor_nome,
        COALESCE(t.nome,s.tecido_codigo) tecido_nome,
        m.nome modelo_nome, COALESCE(m.exige_medida,1) exige_medida,
        s.estoque
      FROM lote l
      LEFT JOIN skus s ON s.codigo=l.codigo
      LEFT JOIN cor c ON c.codigo=s.cor_codigo
      LEFT JOIN tecido t ON t.codigo=s.tecido_codigo
      LEFT JOIN modelo m ON m.id=s.modelo_id
      WHERE ${filaDoDia('l')}
      GROUP BY l.codigo ORDER BY atrasados DESC, qtd DESC`).all());
  });
  /* OS NUMEROS DA TELA, NUM LUGAR SO.
     A tela mostrava "15 PENDENTES" no topo e "Nada pendente" na lista logo
     abaixo — duas respostas opostas para a mesma pergunta, na mesma tela. Nao
     era divergencia de opiniao: eram tres consultas com reguas diferentes
     (/api/lote contava tudo que ENTROU hoje, a lista filtrava por PRAZO, e o
     relogio de despacho tinha uma terceira). Quando o operador ve dois numeros
     que se contradizem, ele para de confiar em todos.
     Daqui pra frente a tela pergunta uma vez so, e a regua e a do fila_dia. */
  app.get('/api/fila/resumo',(req,res)=>{
    const hoje=db.prepare(`SELECT COUNT(*) c FROM lote WHERE ${FILA_HOJE}`).get().c;
    const atras=db.prepare(`SELECT COUNT(*) c FROM lote WHERE estagio='pendente'
      AND despachar_em IS NOT NULL AND despachar_em<date('now','localtime')`).get().c;
    const fut=db.prepare(`SELECT COUNT(*) c FROM lote WHERE estagio='pendente'
      AND despachar_em IS NOT NULL AND despachar_em>date('now','localtime')`).get().c;
    /* Impressas HOJE conta por embalado_em, nao por `data`: um volume que
       entrou ontem e foi impresso hoje e trabalho de hoje. Pelo criterio antigo
       ele nao aparecia, e o placar do dia saia menor do que o dia rendeu. */
    const imp=db.prepare(`SELECT COUNT(*) c FROM lote
      WHERE embalado_em IS NOT NULL AND date(embalado_em)=date('now','localtime')`).get().c;
    res.json({hoje,atrasados:atras,futuros:fut,impressas_hoje:imp});
  });
  /* O QUE VEM PELA FRENTE — venda ja faturada com prazo de despacho futuro.
     Fica fora da fila do dia de proposito: cobrar hoje o que so vence em tres
     semanas e o que ensina a equipe a ignorar a fila inteira. Mas nao pode
     sumir, senao ninguem planeja a producao — entao aparece em painel proprio,
     agrupado por data. */
  app.get('/api/pendentes/futuros',(req,res)=>{
    res.json(db.prepare(`SELECT despachar_em, codigo, COUNT(*) qtd
      FROM lote WHERE estagio='pendente' AND codigo IS NOT NULL
        AND despachar_em IS NOT NULL AND despachar_em>date('now','localtime')
      GROUP BY despachar_em, codigo ORDER BY despachar_em, codigo`).all());
  });
  app.get('/api/lote',(req,res)=> res.json(db.prepare("SELECT id,codigo,cor,buyer,city,nf,estagio FROM lote WHERE data=date('now','localtime') ORDER BY id").all()));

  // ── Reimpressao ───────────────────────────────────────────────────────────
  // O PDF de origem some de lotes/ depois de 7 dias (limpeza por cron). Sem essa
  // guarda o reimprimir estoura 500 com "ENOENT" na cara do operador, que nao
  // tem como saber que a saida e subir o PDF de novo.
  const PDF_SUMIU='O PDF de origem nao esta mais no servidor (os arquivos saem depois de 7 dias). Suba o PDF do Mercado Livre de novo pra reimprimir.';
  const temPdf=o=>{ try{ return !!o.srcfile && fs.existsSync(o.srcfile); }catch(e){ return false; } };

  // Notas e clientes ja impressos. Serve a UMA pergunta: "a impressora enroscou,
  // qual era mesmo aquela venda?" — por isso vem do mais recente pro mais
  // antigo, que e a ordem em que o operador procura.
  app.get('/api/impressos',(req,res)=>{
    let dias=parseInt(req.query.dias,10); if(!(dias>=1)) dias=1; if(dias>30) dias=30;
    res.json(db.prepare(`SELECT id,codigo,cor,buyer,city,nf,packId,venda,estagio,data,
        embalado_em,carregado_em,COALESCE(reimpressoes,0) reimpressoes,reimpresso_em
      FROM lote
      WHERE estagio IN ('embalado','carregado')
        AND data >= date('now','localtime','-'||?||' day')
      ORDER BY COALESCE(embalado_em,criado_em) DESC, id DESC LIMIT 400`).all(dias-1));
  });

  // Reimprimir NAO mexe no estoque. A baixa (-1) acontece uma unica vez, no
  // POST /api/embalar; a etiqueta saindo pela segunda vez e o MESMO volume indo
  // pro MESMO cliente. Somar de novo aqui furaria o estoque a cada papel preso.
  app.post('/api/reimprimir',(req,res)=>{
    const id=(req.body&&req.body.id);
    if(!id) return res.status(400).json({erro:'sem id'});
    const o=db.prepare('SELECT id,codigo,buyer,nf,estagio,srcfile FROM lote WHERE id=?').get(id);
    if(!o) return res.status(404).json({erro:'venda nao encontrada'});
    if(o.estagio==='bloqueado') return res.json({erro:'Volume bloqueado: SKU fora do cadastro.'});
    if(o.estagio==='pendente') return res.json({erro:'Essa venda ainda nao foi impressa. Bipe o SKU pra imprimir a primeira vez.'});
    if(!temPdf(o)) return res.json({erro:PDF_SUMIU});
    db.prepare("UPDATE lote SET reimpressoes=COALESCE(reimpressoes,0)+1, reimpresso_em=datetime('now','localtime') WHERE id=?").run(o.id);
    const n=db.prepare('SELECT COALESCE(reimpressoes,0) v FROM lote WHERE id=?').get(o.id);
    res.json({ok:true,id:o.id,codigo:o.codigo,buyer:o.buyer,nf:o.nf,vezes:n?n.v:1});
  });

  app.get('/api/print/:id', async (req,res)=>{
    try{
      const o=db.prepare('SELECT * FROM lote WHERE id=?').get(req.params.id);
      if(!o) return res.status(404).send('nao encontrado');
      if(o.estagio==='bloqueado') return res.status(409).send('BLOQUEADO: o SKU "'+(o.codigo||'(vazio)')+'" nao esta no cadastro. Cadastre no Admin antes de imprimir.');
      if(!temPdf(o)) return res.status(410).send(PDF_SUMIU);
      const src=await PDFDocument.load(fs.readFileSync(o.srcfile));
      const out=await PDFDocument.create();
      const idx=[o.labelPage]; if(o.danfePage!=null) idx.push(o.danfePage);
      const pgs=await out.copyPages(src,idx); pgs.forEach(p=>out.addPage(p));
      res.setHeader('Content-Type','application/pdf'); res.send(Buffer.from(await out.save()));
    }catch(e){ console.error(e); res.status(500).send(String(e.message||e)); }
  });
};

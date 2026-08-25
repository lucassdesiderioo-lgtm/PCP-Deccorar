const express=require('express'); const fs=require('fs');
const {parsePdf}=require('./parse'); const {PDFDocument}=require('pdf-lib');
module.exports=function(app,db){
  db.exec("CREATE TABLE IF NOT EXISTS lote (id INTEGER PRIMARY KEY AUTOINCREMENT, codigo TEXT, cor TEXT DEFAULT '', buyer TEXT DEFAULT '', city TEXT DEFAULT '', nf TEXT, packId TEXT, venda TEXT, codes TEXT DEFAULT '[]', srcfile TEXT, labelPage INTEGER, danfePage INTEGER, estagio TEXT DEFAULT 'pendente', embalado_em TEXT, carregado_em TEXT, data TEXT DEFAULT (date('now','localtime')), criado_em TEXT DEFAULT (datetime('now','localtime')), teste INTEGER DEFAULT 0, reimpressoes INTEGER DEFAULT 0, reimpresso_em TEXT, bloqueio TEXT);");
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
  try{ fs.mkdirSync('/opt/expedicao/lotes',{recursive:true}); }catch(e){}
  const bigJson=express.json({limit:'25mb'});
  app.post('/api/lote/upload', bigJson, async (req,res)=>{
    try{
      const b64=((req.body&&req.body.pdf)||'').replace(/^data:[^,]*,/,'');
      if(!b64) return res.status(400).json({erro:'sem pdf'});
      const buf=Buffer.from(b64,'base64');
      const orders=await parsePdf(new Uint8Array(buf));
      const fname='/opt/expedicao/lotes/'+Date.now()+'.pdf'; fs.writeFileSync(fname,buf);
      const seen=new Set(); db.prepare("SELECT packId,venda FROM lote WHERE data=date('now','localtime')").all().forEach(r=>{ if(r.packId)seen.add('p:'+r.packId); if(r.venda)seen.add('v:'+r.venda); });
      const ins=db.prepare("INSERT INTO lote (codigo,cor,buyer,city,nf,packId,venda,codes,srcfile,labelPage,danfePage,estagio,bloqueio) VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?)");
      const existe=db.prepare('SELECT 1 FROM skus WHERE codigo=?');
      let novos=0,rep=0,semsku=0,bloq=0,divs=0; const desconhecidos={};
      db.transaction(()=>{ for(const o of orders){
        if((o.packId&&seen.has('p:'+o.packId))||(o.venda&&seen.has('v:'+o.venda))){ rep++; continue; }
        if(o.packId)seen.add('p:'+o.packId); if(o.venda)seen.add('v:'+o.venda);
        const sku=(o.sku||'').trim().toUpperCase();
        const ok = sku && existe.get(sku);
        let est='pendente', motivo=null;
        /* A divergencia vem PRIMEIRO: um volume em que as duas leituras da folha
           discordam nao pode ser liberado por cadastro de SKU, porque nao e o
           cadastro que esta em duvida — e qual peca o cliente comprou. */
        if(o.conflito){ est='bloqueado'; bloq++; divs++; motivo='divergencia: '+o.conflito; }
        else if(!ok){ est='bloqueado'; bloq++; motivo='sku_nao_cadastrado';
          const k=sku||'(sem SKU na folha)'; desconhecidos[k]=(desconhecidos[k]||0)+1; }
        if(!o.sku) semsku++;
        ins.run(sku||null,o.cor,o.buyer,o.city,o.nf,o.packId,o.venda,JSON.stringify(o.codes||[]),fname,o.labelPage,o.danfePage,est,motivo); novos++;
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
  app.get('/api/pendentes',(req,res)=>{
    res.json(db.prepare("SELECT codigo, COUNT(*) qtd FROM lote WHERE data=date('now','localtime') AND estagio='pendente' AND codigo IS NOT NULL GROUP BY codigo ORDER BY qtd DESC").all());
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

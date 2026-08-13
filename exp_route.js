const express=require('express'); const fs=require('fs');
const {parsePdf}=require('./parse'); const {PDFDocument}=require('pdf-lib');
module.exports=function(app,db){
  db.exec("CREATE TABLE IF NOT EXISTS lote (id INTEGER PRIMARY KEY AUTOINCREMENT, codigo TEXT, cor TEXT DEFAULT '', buyer TEXT DEFAULT '', city TEXT DEFAULT '', nf TEXT, packId TEXT, venda TEXT, codes TEXT DEFAULT '[]', srcfile TEXT, labelPage INTEGER, danfePage INTEGER, estagio TEXT DEFAULT 'pendente', embalado_em TEXT, carregado_em TEXT, data TEXT DEFAULT (date('now','localtime')), criado_em TEXT DEFAULT (datetime('now','localtime')));");
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
      const ins=db.prepare("INSERT INTO lote (codigo,cor,buyer,city,nf,packId,venda,codes,srcfile,labelPage,danfePage,estagio) VALUES (?,?,?,?,?,?,?,?,?,?,?,?)");
      const existe=db.prepare('SELECT 1 FROM skus WHERE codigo=?');
      let novos=0,rep=0,semsku=0,bloq=0; const desconhecidos={};
      db.transaction(()=>{ for(const o of orders){
        if((o.packId&&seen.has('p:'+o.packId))||(o.venda&&seen.has('v:'+o.venda))){ rep++; continue; }
        if(o.packId)seen.add('p:'+o.packId); if(o.venda)seen.add('v:'+o.venda);
        const sku=(o.sku||'').trim().toUpperCase();
        const ok = sku && existe.get(sku);
        let est='pendente';
        if(!ok){ est='bloqueado'; bloq++; const k=sku||'(sem SKU na folha)'; desconhecidos[k]=(desconhecidos[k]||0)+1; }
        if(!o.sku) semsku++;
        ins.run(sku||null,o.cor,o.buyer,o.city,o.nf,o.packId,o.venda,JSON.stringify(o.codes||[]),fname,o.labelPage,o.danfePage,est); novos++;
      }})();
      res.json({ok:true,total:orders.length,novos,repetidas:rep,sem_sku:semsku,bloqueados:bloq,
                desconhecidos:Object.keys(desconhecidos).map(k=>({sku:k,qtd:desconhecidos[k]}))});
    }catch(e){ console.error(e); res.status(500).json({erro:String(e.message||e)}); }
  });
  app.get('/api/bloqueados',(req,res)=>{
    res.json(db.prepare("SELECT codigo, COUNT(*) qtd, GROUP_CONCAT(DISTINCT buyer) compradores FROM lote WHERE estagio='bloqueado' GROUP BY codigo ORDER BY qtd DESC").all());
  });
  app.get('/api/pendentes',(req,res)=>{
    res.json(db.prepare("SELECT codigo, COUNT(*) qtd FROM lote WHERE data=date('now','localtime') AND estagio='pendente' AND codigo IS NOT NULL GROUP BY codigo ORDER BY qtd DESC").all());
  });
  app.get('/api/lote',(req,res)=> res.json(db.prepare("SELECT id,codigo,cor,buyer,city,nf,estagio FROM lote WHERE data=date('now','localtime') ORDER BY id").all()));
  app.get('/api/print/:id', async (req,res)=>{
    try{
      const o=db.prepare('SELECT * FROM lote WHERE id=?').get(req.params.id);
      if(!o) return res.status(404).send('nao encontrado');
      if(o.estagio==='bloqueado') return res.status(409).send('BLOQUEADO: o SKU "'+(o.codigo||'(vazio)')+'" nao esta no cadastro. Cadastre no Admin antes de imprimir.');
      const src=await PDFDocument.load(fs.readFileSync(o.srcfile));
      const out=await PDFDocument.create();
      const idx=[o.labelPage]; if(o.danfePage!=null) idx.push(o.danfePage);
      const pgs=await out.copyPages(src,idx); pgs.forEach(p=>out.addPage(p));
      res.setHeader('Content-Type','application/pdf'); res.send(Buffer.from(await out.save()));
    }catch(e){ console.error(e); res.status(500).send(String(e.message||e)); }
  });
};

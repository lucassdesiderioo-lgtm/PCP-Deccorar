const fs=require('fs'), path=require('path');
module.exports=function(app,db){
  db.exec("CREATE TABLE IF NOT EXISTS config (chave TEXT PRIMARY KEY, valor TEXT);");
  // pasta dos arquivos do kit (etiqueta enviada pelo admin). __dirname resolve
  // tanto no servidor (/opt/expedicao) quanto no ambiente de teste. Fica fora
  // do git (ver .gitignore).
  const KITDIR=path.join(__dirname,'kit');
  try{ fs.mkdirSync(KITDIR,{recursive:true}); }catch(e){}

  // Sobe a etiqueta do kit (imagem ou PDF). Guarda no disco e o metadado em
  // config('kit_label'). Substitui a anterior.
  app.post('/api/kit/label',(req,res)=>{
    const dataURL=(req.body&&req.body.arquivo)||'';
    const mime=(dataURL.match(/^data:([^;,]+)/)||[])[1]||'application/octet-stream';
    const b64=dataURL.replace(/^data:[^,]*,/,'');
    if(!b64) return res.status(400).json({erro:'sem arquivo'});
    const ext = /pdf/i.test(mime)?'pdf' : /png/i.test(mime)?'png' : /jpe?g/i.test(mime)?'jpg' : /svg/i.test(mime)?'svg' : null;
    if(!ext) return res.status(400).json({erro:'formato não suportado — use PDF, PNG, JPG ou SVG'});
    let buf; try{ buf=Buffer.from(b64,'base64'); }catch(e){ return res.status(400).json({erro:'arquivo inválido'}); }
    if(buf.length>8*1024*1024) return res.status(400).json({erro:'arquivo muito grande (máx 8 MB)'});
    ['pdf','png','jpg','svg'].forEach(e=>{ try{ fs.unlinkSync(path.join(KITDIR,'label.'+e)); }catch(_){} });
    fs.writeFileSync(path.join(KITDIR,'label.'+ext), buf);
    const meta={arquivo:'label.'+ext, tipo:mime, nome:String((req.body&&req.body.nome)||('etiqueta.'+ext)).slice(0,120), em:new Date().toLocaleString('pt-BR')};
    db.prepare("INSERT INTO config (chave,valor) VALUES ('kit_label',?) ON CONFLICT(chave) DO UPDATE SET valor=excluded.valor").run(JSON.stringify(meta));
    const ac=app.locals.acesso; try{ if(ac&&ac.auditar) ac.auditar(req,'sistema','kit_etiqueta',meta.nome,''); }catch(e){}
    res.json({ok:true, arquivo:meta.arquivo, nome:meta.nome, em:meta.em});
  });
  app.get('/api/kit/label/meta',(req,res)=>{
    const r=db.prepare("SELECT valor FROM config WHERE chave='kit_label'").get();
    let meta={arquivo:null}; try{ if(r) meta=JSON.parse(r.valor); }catch(e){}
    res.json({arquivo:meta.arquivo||null, nome:meta.nome||null, em:meta.em||null});
  });
  app.get('/api/kit/label',(req,res)=>{
    const r=db.prepare("SELECT valor FROM config WHERE chave='kit_label'").get();
    let meta; try{ meta=r?JSON.parse(r.valor):null; }catch(e){ meta=null; }
    if(!meta||!meta.arquivo) return res.status(404).send('nenhuma etiqueta enviada');
    const f=path.join(KITDIR, path.basename(meta.arquivo));
    if(!fs.existsSync(f)) return res.status(404).send('arquivo não encontrado');
    res.setHeader('Content-Type', meta.tipo||'application/octet-stream');
    res.send(fs.readFileSync(f));
  });
  app.delete('/api/kit/label',(req,res)=>{
    ['pdf','png','jpg','svg'].forEach(e=>{ try{ fs.unlinkSync(path.join(KITDIR,'label.'+e)); }catch(_){} });
    try{ db.prepare("DELETE FROM config WHERE chave='kit_label'").run(); }catch(e){}
    res.json({ok:true});
  });
  // teste vem por ultimo: e a coluna que o teste_route adicionava por ALTER
  db.exec("CREATE TABLE IF NOT EXISTS montagem (id INTEGER PRIMARY KEY AUTOINCREMENT, codigo TEXT, inicio TEXT, fim TEXT, segundos INTEGER, kit_ok INTEGER DEFAULT 1, data TEXT DEFAULT (date('now','localtime')), criado_em TEXT DEFAULT (datetime('now','localtime')), teste INTEGER DEFAULT 0);");
  app.get('/api/config/kit',(req,res)=>{ const r=db.prepare("SELECT valor FROM config WHERE chave='kit_codigo'").get(); res.json({kit:r?r.valor:null}); });
  // Guarda o valor COMO VEIO (so trim) — o link do Drive e case-sensitive e
  // vira QR pro cliente. A conferencia na embalagem (kitBate/kitNorm) compara
  // ignorando maiusculas/simbolos, entao o casamento nao depende do case.
  app.post('/api/config/kit',(req,res)=>{ const v=((req.body&&req.body.kit)||'').trim(); db.prepare("INSERT INTO config (chave,valor) VALUES ('kit_codigo',?) ON CONFLICT(chave) DO UPDATE SET valor=excluded.valor").run(v); res.json({ok:true,kit:v}); });
  app.post('/api/montagem',(req,res)=>{
    const {codigo,segundos=0,kit_ok=1,inicio=null,fim=null}=req.body||{};
    if(!codigo) return res.status(400).json({erro:'codigo'});
    const cod=codigo.trim().toUpperCase();
    db.prepare("INSERT INTO montagem (codigo,inicio,fim,segundos,kit_ok) VALUES (?,?,?,?,?)").run(cod,inicio,fim,Math.round(+segundos||0),kit_ok?1:0);
    const f=db.prepare("SELECT id,modo FROM fila WHERE codigo=? AND situacao='aguardando' ORDER BY id LIMIT 1").get(cod);
    let naFila=false, modo='estoque';
    if(f){ db.prepare("UPDATE fila SET situacao='embalado', embalado_em=datetime('now','localtime') WHERE id=?").run(f.id); naFila=true; modo=f.modo; }
    db.prepare('UPDATE skus SET estoque=estoque+1 WHERE codigo=?').run(cod);
    let abatido=false;
    if(modo==='hoje'){
      const r=db.prepare("SELECT id FROM producao WHERE codigo=? AND data=date('now','localtime') AND produzido<qtd ORDER BY id LIMIT 1").get(cod);
      if(r){ db.prepare('UPDATE producao SET produzido=produzido+1 WHERE id=?').run(r.id); abatido=true; }
    }
    const est=db.prepare('SELECT estoque FROM skus WHERE codigo=?').get(cod);
    const prog=db.prepare("SELECT COUNT(*) n FROM montagem WHERE data=date('now','localtime')").get();
    res.json({ok:true,total_hoje:prog.n,naFila:naFila,abatido:abatido,estoque:est?est.estoque:0});
  });
  app.get('/api/fila',(req,res)=>{
    res.json(db.prepare(`SELECT f.codigo, s.cor, COUNT(*) qtd, MIN(f.revisado_em) desde
      FROM fila f LEFT JOIN skus s ON s.codigo=f.codigo
      WHERE f.situacao='aguardando' GROUP BY f.codigo ORDER BY desde`).all());
  });
  app.get('/api/montagem/hoje',(req,res)=> res.json(db.prepare("SELECT codigo, COUNT(*) qtd, ROUND(AVG(segundos)) tmedio FROM montagem WHERE data=date('now','localtime') GROUP BY codigo ORDER BY qtd DESC").all()));
};

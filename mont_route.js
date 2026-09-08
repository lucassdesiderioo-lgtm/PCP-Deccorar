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

  /* ── ZERAR A FILA DE EMBALAGEM (Admin → Contagem) ──────────────────────────
     E o `limpar_fila.js` como botao, com as MESMAS regras dele:
       - some so `situacao='aguardando'`. A linha `embalado` e historia de peca
         que virou estoque e nao e tocada;
       - o estoque nao muda. A fila nunca somou +1 (§2), entao apagar nao
         desconta nada;
       - a bancada nao trava: POST /api/montagem consome a fila QUANDO ela
         existe e funciona sem ela — so o `modo` vira 'estoque'.
     Antes de apagar faz backup por db.backup() (o WAL torna `cp` inutil, §12)
     e grava um CSV do que tinha na fila, porque a pergunta "o que estava la
     naquele dia?" aparece depois e merece um arquivo que abre no Excel.
     A simulacao (GET) mostra a IDADE das linhas: fila de hoje quase sempre tem
     peca fisica no carrinho, fila de meses quase nunca tem. Quem decide e quem
     olha a bancada; aqui so se poe o numero na frente. */
  const BKPDIR=()=> (app.locals&&app.locals.backupDir) || path.join(__dirname,'backups');
  function resumoFila(){
    const linhas=db.prepare(`SELECT id, codigo, modo, revisado_em, data FROM fila
      WHERE situacao='aguardando' ORDER BY revisado_em, id`).all();
    const hoje=db.prepare("SELECT date('now','localtime') d").get().d;
    const idade={hoje:0, semana:0, mes:0, antigas:0, sem_data:0};
    linhas.forEach(l=>{
      const d=String(l.revisado_em||l.data||'').slice(0,10);
      if(!d){ idade.sem_data++; return; }
      if(d===hoje){ idade.hoje++; return; }
      const dias=Math.round((new Date(hoje+'T12:00:00')-new Date(d+'T12:00:00'))/86400000);
      if(dias<=7) idade.semana++; else if(dias<=30) idade.mes++; else idade.antigas++;
    });
    const porSku={};
    linhas.forEach(l=>{ porSku[l.codigo]=(porSku[l.codigo]||0)+1; });
    const skus=Object.keys(porSku).map(c=>({codigo:c, qtd:porSku[c]})).sort((a,b)=>b.qtd-a.qtd);
    const embaladas=db.prepare("SELECT COUNT(*) c FROM fila WHERE situacao<>'aguardando'").get().c;
    return { total:linhas.length, idade, skus,
      devolucao: linhas.filter(l=>l.modo==='devolucao').length,
      embaladas_intactas: embaladas, linhas };
  }
  app.get('/api/fila/limpar',(req,res)=>{
    const r=resumoFila(); delete r.linhas; res.json(r);
  });
  app.post('/api/fila/limpar',async (req,res)=>{
    try{
      const r=resumoFila();
      if(!r.total) return res.json({ok:true, apagadas:0, backup:null, csv:null});
      const dir=BKPDIR(); fs.mkdirSync(dir,{recursive:true});
      const d=new Date(), p2=n=>String(n).padStart(2,'0');
      const carimbo=d.getFullYear()+'-'+p2(d.getMonth()+1)+'-'+p2(d.getDate())+'_'+p2(d.getHours())+p2(d.getMinutes())+p2(d.getSeconds());
      const bkp=path.join(dir,'antes-limpar-fila-'+carimbo+'.db');
      await db.backup(bkp);
      const csv=v=>{ const s=String(v==null?'':v); return /[",;\n]/.test(s)?'"'+s.replace(/"/g,'""')+'"':s; };
      const arqCsv=path.join(dir,'antes_fila_'+carimbo+'.csv');
      fs.writeFileSync(arqCsv, ['id,codigo,modo,revisado_em,data']
        .concat(r.linhas.map(l=>[l.id,l.codigo,l.modo,l.revisado_em,l.data].map(csv).join(','))).join('\n')+'\n','utf8');
      const n=db.prepare("DELETE FROM fila WHERE situacao='aguardando'").run().changes;
      const ac=app.locals.acesso;
      try{ if(ac&&ac.auditar) ac.auditar(req,'estoque','fila_zerada',String(n),
        'hoje '+r.idade.hoje+' · 7d '+r.idade.semana+' · 30d '+r.idade.mes+' · antigas '+r.idade.antigas
        +(r.devolucao?' · devolucao '+r.devolucao:'')+' · backup '+path.basename(bkp)); }catch(e){}
      res.json({ok:true, apagadas:n, backup:path.basename(bkp), csv:path.basename(arqCsv), embaladas_intactas:r.embaladas_intactas});
    }catch(e){ res.status(500).json({erro:'não consegui zerar a fila: '+e.message}); }
  });
  app.get('/api/montagem/hoje',(req,res)=> res.json(db.prepare("SELECT codigo, COUNT(*) qtd, ROUND(AVG(segundos)) tmedio FROM montagem WHERE data=date('now','localtime') GROUP BY codigo ORDER BY qtd DESC").all()));
};

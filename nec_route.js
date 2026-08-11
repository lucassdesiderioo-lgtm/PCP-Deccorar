module.exports=function(app,db){
  db.exec("CREATE TABLE IF NOT EXISTS demanda (codigo TEXT PRIMARY KEY, qtd30 INTEGER DEFAULT 0, media_dia REAL DEFAULT 0, atualizado TEXT);");
  db.exec("CREATE TABLE IF NOT EXISTS config (chave TEXT PRIMARY KEY, valor TEXT);");
  // seed inicial com os 30 dias (só se estiver vazio)
  if(db.prepare("SELECT COUNT(*) c FROM demanda").get().c===0){
    const seed=[["BK160160BEGE",194],["BK160160CINZA",132],["BK160140BRANCO",128],["BK160160BRANCO",117],["BK160140BEGE",107],["BK180150BRANCO",79],["BK150150BRANCO",70],["BK150150CINZA",68],["BK150150BEGE",64],["BK180150BEGE",51],["BK160140CINZA",49],["BK140140BEGE",41],["BK140140BRANCO",38],["BK140140CINZA",36],["BK180150CINZA",21],["BK120120BEGE",10],["BK100100BRANCO",7],["BK120120CINZA",7],["BK120120BRANCO",6],["BK100100BEGE",5],["BK100100CINZA",2],["BK110X240BEGE",1]];
    const ins=db.prepare("INSERT INTO demanda (codigo,qtd30,media_dia,atualizado) VALUES (?,?,?,date('now','localtime'))");
    db.transaction(()=>{ for(const [c,q] of seed) ins.run(c,q,+(q/30).toFixed(3)); })();
  }
  const dias=()=>{ const r=db.prepare("SELECT valor FROM config WHERE chave='dias_colchao'").get(); return r?(+r.valor||10):10; };
  app.post('/api/config/dias',(req,res)=>{ const v=Math.max(1,Math.trunc(+((req.body||{}).dias)||10)); db.prepare("INSERT INTO config (chave,valor) VALUES ('dias_colchao',?) ON CONFLICT(chave) DO UPDATE SET valor=excluded.valor").run(String(v)); res.json({ok:true,dias:v}); });
  app.get('/api/necessidade',(req,res)=>{
    const d=dias();
    const dem=db.prepare("SELECT * FROM demanda ORDER BY qtd30 DESC").all();
    const total=dem.reduce((a,b)=>a+b.qtd30,0)||1;
    const skus=db.prepare("SELECT UPPER(codigo) c, estoque, alvo FROM skus").all();
    const smap={}; skus.forEach(s=>smap[s.c]=s);
    let cum=0;
    const linhas=dem.map(r=>{ cum+=r.qtd30; const pct=cum/total*100;
      const classe=pct<=80?'A':(pct<=95?'B':'C'); const media=r.qtd30/30; const sug=Math.max(1,Math.ceil(media*d));
      const s=smap[r.codigo.toUpperCase()];
      return { codigo:r.codigo, qtd30:r.qtd30, media_dia:+media.toFixed(1), classe, estoque:s?s.estoque:null, alvo_atual:s?s.alvo:null, alvo_sugerido:sug, cadastrado:!!s };
    });
    res.json({dias:d, total_colchao:linhas.reduce((a,b)=>a+b.alvo_sugerido,0), linhas});
  });
  app.post('/api/necessidade/aplicar',(req,res)=>{
    const only=(req.body&&req.body.codigo)||null; const d=dias();
    const dem= only ? db.prepare("SELECT * FROM demanda WHERE UPPER(codigo)=UPPER(?)").all(only) : db.prepare("SELECT * FROM demanda").all();
    const corDe=n=>{ n=(n||'').toUpperCase(); if(n.includes('BEGE'))return'Bege'; if(n.includes('CINZA'))return'Cinza'; if(n.includes('BRANCO'))return'Branco'; return''; };
    let aplicados=0,criados=0;
    db.transaction(()=>{ for(const r of dem){ const sug=Math.max(1,Math.ceil((r.qtd30/30)*d));
      const ex=db.prepare("SELECT codigo FROM skus WHERE UPPER(codigo)=UPPER(?)").get(r.codigo);
      if(ex) db.prepare("UPDATE skus SET alvo=? WHERE UPPER(codigo)=UPPER(?)").run(sug,r.codigo);
      else { db.prepare("INSERT INTO skus (codigo,descricao,cor,estoque,alvo) VALUES (?,?,?,0,?)").run(r.codigo.toUpperCase(),'',corDe(r.codigo),sug); criados++; }
      aplicados++; } })();
    res.json({ok:true,aplicados,criados});
  });
};

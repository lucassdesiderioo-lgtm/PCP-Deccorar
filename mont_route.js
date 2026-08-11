module.exports=function(app,db){
  db.exec("CREATE TABLE IF NOT EXISTS config (chave TEXT PRIMARY KEY, valor TEXT);");
  db.exec("CREATE TABLE IF NOT EXISTS montagem (id INTEGER PRIMARY KEY AUTOINCREMENT, codigo TEXT, inicio TEXT, fim TEXT, segundos INTEGER, kit_ok INTEGER DEFAULT 1, data TEXT DEFAULT (date('now','localtime')), criado_em TEXT DEFAULT (datetime('now','localtime')));");
  app.get('/api/config/kit',(req,res)=>{ const r=db.prepare("SELECT valor FROM config WHERE chave='kit_codigo'").get(); res.json({kit:r?r.valor:null}); });
  app.post('/api/config/kit',(req,res)=>{ const v=((req.body&&req.body.kit)||'').trim().toUpperCase(); db.prepare("INSERT INTO config (chave,valor) VALUES ('kit_codigo',?) ON CONFLICT(chave) DO UPDATE SET valor=excluded.valor").run(v); res.json({ok:true,kit:v}); });
  app.post('/api/montagem',(req,res)=>{
    const {codigo,segundos=0,kit_ok=1,inicio=null,fim=null}=req.body||{};
    if(!codigo) return res.status(400).json({erro:'codigo'});
    db.prepare("INSERT INTO montagem (codigo,inicio,fim,segundos,kit_ok) VALUES (?,?,?,?,?)").run(codigo.trim().toUpperCase(),inicio,fim,Math.round(+segundos||0),kit_ok?1:0);
    const prog=db.prepare("SELECT COUNT(*) n FROM montagem WHERE data=date('now','localtime')").get();
    res.json({ok:true,total_hoje:prog.n});
  });
  app.get('/api/montagem/hoje',(req,res)=> res.json(db.prepare("SELECT codigo, COUNT(*) qtd, ROUND(AVG(segundos)) tmedio FROM montagem WHERE data=date('now','localtime') GROUP BY codigo ORDER BY qtd DESC").all()));
};

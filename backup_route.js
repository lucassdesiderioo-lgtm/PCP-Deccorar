const fs=require('fs'),path=require('path'),crypto=require('crypto');
module.exports=function(app,db){
  db.exec("CREATE TABLE IF NOT EXISTS config (chave TEXT PRIMARY KEY, valor TEXT);");
  const DIR='/opt/expedicao/backups';
  let t=db.prepare("SELECT valor FROM config WHERE chave='backup_token'").get();
  if(!t){ const tok=crypto.randomBytes(12).toString('hex'); db.prepare("INSERT INTO config (chave,valor) VALUES ('backup_token',?)").run(tok); t={valor:tok}; }
  const TOKEN=t.valor;
  app.get('/baixar-backup',(req,res)=>{
    if((req.query.token||'')!==TOKEN) return res.status(403).send('token invalido');
    try{ fs.mkdirSync(DIR,{recursive:true});
      const files=fs.readdirSync(DIR).filter(f=>/^dados-.*\.db$/.test(f)).sort();
      if(!files.length) return res.status(404).send('sem backup ainda');
      res.download(path.join(DIR,files[files.length-1]));
    }catch(e){ res.status(500).send(String(e)); }
  });
};

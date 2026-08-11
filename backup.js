const Database=require('better-sqlite3'); const fs=require('fs'); const path=require('path');
const SRC='/opt/expedicao/dados.db', DIR='/opt/expedicao/backups';
fs.mkdirSync(DIR,{recursive:true});
const d=new Date(); const st=d.getFullYear()+'-'+String(d.getMonth()+1).padStart(2,'0')+'-'+String(d.getDate()).padStart(2,'0');
const dest=path.join(DIR,'dados-'+st+'.db');
(async()=>{
  const db=new Database(SRC,{readonly:true});
  await db.backup(dest); db.close();
  const files=fs.readdirSync(DIR).filter(f=>/^dados-\d{4}-\d{2}-\d{2}\.db$/.test(f)).sort();
  while(files.length>30){ fs.unlinkSync(path.join(DIR,files.shift())); }
  console.log('backup ok ->',dest,'| copias:',fs.readdirSync(DIR).filter(f=>f.endsWith('.db')).length);
})().catch(e=>{ console.error('backup erro:',e.message); process.exit(1); });

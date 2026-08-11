module.exports=function(app,db){
  app.post('/api/alvo',(req,res)=>{
    const {codigo,alvo}=req.body||{};
    if(!codigo) return res.status(400).json({erro:'codigo'});
    db.prepare('UPDATE skus SET alvo=? WHERE UPPER(codigo)=UPPER(?)').run(Math.max(0,Math.trunc(+alvo||0)),codigo);
    const r=db.prepare('SELECT alvo FROM skus WHERE UPPER(codigo)=UPPER(?)').get(codigo);
    res.json({ok:true,alvo:r?r.alvo:null});
  });
};

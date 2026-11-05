const QUEM = require('./quem');
module.exports=function(app,db){
  /* SEM LOGIN NADA GRAVA (QUEM-FEZ-E-REVISAO fase 7, 05/11/2026): toda escrita
     registrada neste modulo passa pelo quem.js antes do handler — a de amanha
     tambem. */
  app = QUEM.portao(app, { auditar:'planejamento' });   // a linha nao tem autor: quem fez vai na auditoria

  app.post('/api/alvo',(req,res)=>{
    const {codigo,alvo}=req.body||{};
    if(!codigo) return res.status(400).json({erro:'codigo'});
    db.prepare('UPDATE skus SET alvo=? WHERE UPPER(codigo)=UPPER(?)').run(Math.max(0,Math.trunc(+alvo||0)),codigo);
    const r=db.prepare('SELECT alvo FROM skus WHERE UPPER(codigo)=UPPER(?)').get(codigo);
    res.json({ok:true,alvo:r?r.alvo:null});
  });
};

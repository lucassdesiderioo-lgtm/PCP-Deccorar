// A UNICA porta por onde uma rota entra no Express.
//
// app.get/app.post direto nao existe fora daqui (fora o /login e /api/auth/*,
// que sao o proprio portao). Uma rota declarada ganha de graca, e sempre:
//   permissao conferida  ·  envelope unico  ·  erro tratado  ·  auditoria
// Rota sem 'permissao' e NEGADA — esquecer a chave nao abre a porta, fecha.
const {ErroDeRegra}=require('./erros');
const {pode}=require('./permissoes');

function montar(app, db, modulos){
  const gravaAud=db.prepare(
    'INSERT INTO auditoria(usuario_nome,permissao,metodo,caminho,detalhe,ok) VALUES(?,?,?,?,?,?)');
  const audita=(u,perm,metodo,caminho,detalhe,ok)=>{
    try{ gravaAud.run(u?u.nome:null,perm||null,metodo,caminho,detalhe||null,ok?1:0); }catch(e){}
  };

  let n=0;
  for(const mod of modulos){
    for(const r of (mod.rotas||[])){
      const metodo=(r.metodo||'GET').toLowerCase();
      const leitura=metodo==='get';

      if(!r.permissao){
        // Falha ALTA e visivel: a rota sobe, mas so sabe dizer nao.
        console.error('[registro] NEGADA — rota sem permissao declarada: '+metodo.toUpperCase()+' '+r.caminho);
        app[metodo](r.caminho,(req,res)=>res.status(403).json({
          ok:false,motivo:'rota_sem_permissao',
          mensagem:'Esta rota subiu sem permissao declarada e por isso esta fechada.'}));
        continue;
      }

      app[metodo](r.caminho,(req,res)=>{
        const u=req.usuario;
        if(!pode(u,r.permissao)){
          audita(u,r.permissao,req.method,req.path,'negado',0);
          return res.status(403).json({ok:false,motivo:'sem_permissao',
            mensagem:'Voce nao tem permissao para isto.'});
        }
        try{
          const dados=r.manipulador({
            corpo:req.body||{}, params:req.params, query:req.query, usuario:u, db
          });
          if(!leitura) audita(u,r.permissao,req.method,req.path,r.detalhe?r.detalhe(req,dados):null,1);
          res.json({ok:true,dados:dados===undefined?{}:dados});
        }catch(e){
          if(e instanceof ErroDeRegra){
            audita(u,r.permissao,req.method,req.path,'recusado: '+e.motivo,0);
            return res.status(400).json({ok:false,motivo:e.motivo,mensagem:e.mensagem});
          }
          // Nenhum stack trace chega ao operador. Ele vai para o log.
          console.error('[erro] '+req.method+' '+req.path,e);
          audita(u,r.permissao,req.method,req.path,'erro: '+e.message,0);
          res.status(500).json({ok:false,motivo:'erro_interno',
            mensagem:'Deu erro aqui dentro. Chame o suporte e diga o que estava fazendo.'});
        }
      });
      n++;
    }
  }
  console.log('[registro] '+n+' rotas declaradas');
}

module.exports={montar};

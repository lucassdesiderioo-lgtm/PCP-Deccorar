// A UNICA porta por onde uma rota entra no Express.
//
// app.get/app.post direto nao existe fora daqui (fora o /login e /api/auth/*,
// que sao o proprio portao). Uma rota declarada ganha de graca, e sempre:
//   permissao conferida  ·  envelope unico  ·  erro tratado  ·  auditoria
// Rota sem 'permissao' e NEGADA — esquecer a chave nao abre a porta, fecha.
const {ErroDeRegra}=require('./erros');
const {pode}=require('./permissoes');

// `prefixo` existe para o modulo viver DENTRO do PCP ('/sobmedida'). Ele nao e
// cosmetico: sem ele, /api/usuarios daqui colidiria com /api/usuarios de la, e
// a ultima rota registrada venceria — em silencio, e so em producao.
function montar(app, db, modulos, prefixo){
  const pre=prefixo||'';
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

      const caminho=pre+r.caminho;

      if(!r.permissao){
        // Falha ALTA e visivel: a rota sobe, mas so sabe dizer nao.
        console.error('[registro] NEGADA — rota sem permissao declarada: '+metodo.toUpperCase()+' '+caminho);
        app[metodo](caminho,(req,res)=>res.status(403).json({
          ok:false,motivo:'rota_sem_permissao',
          mensagem:'Esta rota subiu sem permissao declarada e por isso esta fechada.'}));
        continue;
      }

      app[metodo](caminho,async (req,res)=>{
        const u=req.usuario;
        if(!pode(u,r.permissao)){
          audita(u,r.permissao,req.method,req.path,'negado',0);
          return res.status(403).json({ok:false,motivo:'sem_permissao',
            mensagem:'Voce nao tem permissao para isto.'});
        }
        try{
          // O await serve ao manipulador que fala com o mundo de fora (o PCP,
          // no login unico). Sem ele a resposta sairia como objeto vazio, e o
          // erro apareceria como tela em branco em vez de falha.
          const dados=await r.manipulador({
            corpo:req.body||{}, params:req.params, query:req.query, usuario:u, db
          });
          if(!leitura||r.tipo) audita(u,r.permissao,req.method,req.path,r.detalhe?r.detalhe(req,dados):null,1);

          /* ARQUIVO, nao envelope. A etiqueta vai para a impressora como PDF, e
             PDF dentro de {ok,dados} teria que passar por base64 e ser
             remontado na tela — mais codigo, e a URL deixaria de ser algo que
             o operador consegue abrir, salvar e reimprimir amanha.

             A porta continua sendo esta: permissao conferida, erro tratado e
             AUDITADO — impressao de etiqueta e um GET, mas gasta rolo e cria
             sequencia; e das poucas leituras que valem uma linha na auditoria. */
          if(r.tipo==='pdf'){
            res.setHeader('Content-Type','application/pdf');
            res.setHeader('Content-Disposition',
              'inline; filename="'+(dados.nome||'etiquetas.pdf')+'"');
            return res.send(dados.arquivo);
          }

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

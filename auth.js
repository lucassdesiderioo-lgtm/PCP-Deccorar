const crypto=require('crypto'), fs=require('fs'), path=require('path');

const AREAS=[
  {id:'admin',       nome:'Admin (controle geral)'},
  {id:'painel',      nome:'Painel do dia'},
  {id:'relatorios',  nome:'Relatorios'},
  {id:'necessidade', nome:'Necessidade (ABC)'},
  {id:'operador',    nome:'Revisao'},
  {id:'devolucao',   nome:'Devolucoes'},
  {id:'montagem',    nome:'Montagem'},
  {id:'embalagem',   nome:'Etiqueta de Venda'},
  {id:'expedicao',   nome:'Subir PDFs (ML)'},
  {id:'carregamento',nome:'Carregamento'}
];

const TELAS={
  '/':'admin','/admin':'admin','/index.html':'admin',
  '/painel':'painel','/painel.html':'painel',
  '/relatorios':'relatorios','/relatorios.html':'relatorios',
  '/necessidade':'necessidade','/necessidade.html':'necessidade',
  '/planejamento':'necessidade','/planejamento.html':'necessidade',
  '/operador':'operador','/operador.html':'operador',
  '/devolucao':'devolucao','/devolucao.html':'devolucao',
  '/montagem':'montagem','/montagem.html':'montagem',
  '/embalagem':'embalagem','/embalagem.html':'embalagem',
  '/expedicao':'expedicao','/expedicao.html':'expedicao',
  '/carregamento':'carregamento','/carregamento.html':'carregamento'
};

const API_ADMIN=['/api/teste','/api/usuarios','/api/estoque','/api/alvo','/api/backup','/api/zerar'];
const LIVRE=['/login','/login.html','/nav.js','/favicon.ico'];

module.exports=function(app, db){
  db.exec("CREATE TABLE IF NOT EXISTS usuarios(id INTEGER PRIMARY KEY AUTOINCREMENT, nome TEXT NOT NULL, salt TEXT NOT NULL, pin_hash TEXT NOT NULL, areas TEXT NOT NULL DEFAULT '', ativo INTEGER NOT NULL DEFAULT 1, criado_em TEXT DEFAULT (datetime('now','localtime')))");

  const arqSeg=path.join(__dirname,'.session_secret');
  let SEG;
  try{ SEG=fs.readFileSync(arqSeg,'utf8').trim(); }
  catch(e){ SEG=crypto.randomBytes(32).toString('hex'); fs.writeFileSync(arqSeg,SEG,{mode:0o600}); }

  const hash=(pin,salt)=>crypto.scryptSync(String(pin),salt,32).toString('hex');
  const assina=v=>crypto.createHmac('sha256',SEG).update(v).digest('hex').slice(0,32);

  function criar(nome,pin,areas){
    const salt=crypto.randomBytes(16).toString('hex');
    return db.prepare('INSERT INTO usuarios(nome,salt,pin_hash,areas) VALUES(?,?,?,?)')
      .run(nome,salt,hash(pin,salt),(areas||[]).join(','));
  }

  if(db.prepare('SELECT COUNT(*) c FROM usuarios').get().c===0){
    criar('Administrador','1234',AREAS.map(a=>a.id));
    console.log('[auth] usuario inicial: Administrador / PIN 1234 - TROQUE ASSIM QUE ENTRAR');
  }

  function lerSessao(req){
    const raw=req.headers.cookie||'';
    const par=raw.split(';').map(s=>s.trim()).find(s=>s.startsWith('sess='));
    if(!par) return null;
    const val=decodeURIComponent(par.slice(5));
    const i=val.lastIndexOf('.');
    if(i<0) return null;
    const corpo=val.slice(0,i), sig=val.slice(i+1);
    if(assina(corpo)!==sig) return null;
    try{
      const o=JSON.parse(Buffer.from(corpo,'base64').toString('utf8'));
      const u=db.prepare('SELECT id,nome,areas,ativo FROM usuarios WHERE id=?').get(o.id);
      if(!u||!u.ativo) return null;
      return {id:u.id,nome:u.nome,areas:u.areas.split(',').filter(Boolean)};
    }catch(e){ return null; }
  }

  const tem=(u,a)=>u&&(u.areas.includes('admin')||u.areas.includes(a));

  const falhas={};
  function bloqueado(id){
    const f=falhas[id];
    return f&&f.n>=5&&(Date.now()-f.t)<60000;
  }

  const negaTela=res=>res.status(403).send('<body style="font-family:system-ui;padding:40px"><h2>Sem permissao</h2><p>Voce nao tem acesso a esta tela.</p><a href="/login">Entrar com outro usuario</a></body>');

  // auditoria (secao 7): o modulo de acesso expoe auditar() via app.locals apos
  // subir. Aqui so registra; nunca deixa o log derrubar a acao.
  const aud=(reqOrShim,cat,acao,alvo,det)=>{ const ac=app.locals.acesso;
    try{ if(ac&&ac.auditar) ac.auditar(reqOrShim,cat,acao,alvo,det); }catch(e){} };

  app.use(function(req,res,next){
    const p=req.path;
    if(LIVRE.includes(p)||p.startsWith('/api/auth/')) return next();
    const u=lerSessao(req);
    req.usuario=u;
    const area=TELAS[p];
    const api=p.startsWith('/api/');
    if(!u){
      if(api) return res.status(401).json({erro:'nao_logado'});
      if(area) return res.redirect('/login?r='+encodeURIComponent(req.originalUrl));
      return next();
    }
    // FASE 3 do controle de acesso: com o modo 'novo' ligado, o modelo de
    // permissoes decide. Qualquer erro no modelo novo cai no antigo abaixo —
    // um bug no controle novo nunca tranca ninguem.
    const ac=app.locals.acesso;
    if(ac&&ac.modoAcesso&&ac.modoAcesso()==='novo'){
      try{
        const d=ac.decidir(u,p,req.method);
        if(!d.ok){
          // registra a negativa (mutacoes e telas; leituras GET de API sao
          // ignoradas para nao afogar a auditoria com polling)
          if(req.method!=='GET' || !api) aud(req,'seguranca','acesso_negado',p,'chave='+(d.chave||''));
          return api?res.status(403).json({erro:'sem_permissao',chave:d.chave}):negaTela(res);
        }
        return next();
      }catch(e){ /* fallback pro modelo antigo */ }
    }
    if(area&&!tem(u,area)) return negaTela(res);
    if(api&&API_ADMIN.some(x=>p.startsWith(x))&&!tem(u,'admin')) return res.status(403).json({erro:'sem_permissao'});
    next();
  });

  app.get('/login',(req,res)=>res.sendFile(path.join(__dirname,'public','login.html')));

  app.get('/api/auth/pessoas',(req,res)=>
    res.json(db.prepare('SELECT id,nome FROM usuarios WHERE ativo=1 ORDER BY nome').all()));

  app.post('/api/auth/login',(req,res)=>{
    const {id,pin}=req.body||{};
    const shim=n=>({usuario:{id:id||null,nome:n||''},headers:req.headers,socket:req.socket});
    if(bloqueado(id)){ aud(shim(),'acesso','bloqueio',String(id||''),'5 PINs errados'); return res.status(429).json({erro:'Muitas tentativas. Aguarde 1 minuto.'}); }
    const u=db.prepare('SELECT * FROM usuarios WHERE id=? AND ativo=1').get(id);
    if(!u||hash(pin,u.salt)!==u.pin_hash){
      const f=falhas[id]||{n:0,t:0};
      falhas[id]={n:(Date.now()-f.t<60000?f.n:0)+1,t:Date.now()};
      aud(shim(u&&u.nome),'acesso','pin_errado',String(id||''),'');
      return res.status(401).json({erro:'PIN incorreto'});
    }
    delete falhas[id];
    const corpo=Buffer.from(JSON.stringify({id:u.id})).toString('base64');
    res.setHeader('Set-Cookie','sess='+encodeURIComponent(corpo+'.'+assina(corpo))+'; Path=/; Max-Age=31536000; HttpOnly; SameSite=Lax');
    aud({usuario:{id:u.id,nome:u.nome},headers:req.headers,socket:req.socket},'acesso','login',u.nome,'');
    res.json({ok:true,nome:u.nome,areas:u.areas.split(',').filter(Boolean)});
  });

  app.post('/api/auth/logout',(req,res)=>{
    const u=lerSessao(req);
    if(u) aud({usuario:u,headers:req.headers,socket:req.socket},'acesso','logout',u.nome,'');
    res.setHeader('Set-Cookie','sess=; Path=/; Max-Age=0');
    res.json({ok:true});
  });

  app.get('/api/auth/eu',(req,res)=>{
    const u=lerSessao(req);
    res.json(u?{logado:true,...u}:{logado:false});
  });

  app.get('/api/auth/areas',(req,res)=>res.json(AREAS));

  app.get('/api/usuarios',(req,res)=>
    res.json(db.prepare('SELECT id,nome,areas,ativo FROM usuarios ORDER BY nome').all()));

  app.post('/api/usuarios',(req,res)=>{
    const {id,nome,pin,areas,ativo}=req.body||{};
    if(!nome) return res.status(400).json({erro:'nome obrigatorio'});
    if(id){
      // areas e ativo so mudam se vierem no corpo — a tela de Acessos edita
      // nome/PIN sem tocar neles (areas passou a ser derivada dos setores).
      if(ativo!==undefined && !ativo && ehUltimoAdminGeral(id))
        return res.status(400).json({erro:'Esta é a única pessoa com acesso total (Admin Geral). Dê esse acesso a outra pessoa antes de bloquear esta.'});
      db.prepare('UPDATE usuarios SET nome=? WHERE id=?').run(nome,id);
      if(areas!==undefined) db.prepare('UPDATE usuarios SET areas=? WHERE id=?').run((areas||[]).join(','),id);
      if(ativo!==undefined) db.prepare('UPDATE usuarios SET ativo=? WHERE id=?').run(ativo?1:0,id);
      if(pin&&String(pin).length>=4){
        const salt=crypto.randomBytes(16).toString('hex');
        db.prepare('UPDATE usuarios SET salt=?,pin_hash=? WHERE id=?').run(salt,hash(pin,salt),id);
      }
    } else {
      if(!pin||String(pin).length<4) return res.status(400).json({erro:'PIN de 4 digitos obrigatorio'});
      const r=criar(nome,pin,areas||[]);
      return res.json({ok:true,id:r.lastInsertRowid});
    }
    res.json({ok:true});
  });

  // Trava de seguranca: nao deixa remover/bloquear o ULTIMO Admin Geral ativo —
  // senao ninguem mais consegue administrar (regra "ninguem sem acesso").
  function ehUltimoAdminGeral(id){
    const ac=app.locals.acesso;
    if(!ac||!ac.ehAdminGeral) return false;         // modelo novo indisponivel: nao trava
    if(!ac.ehAdminGeral(+id)) return false;         // nem e Admin Geral
    const outros=db.prepare('SELECT id FROM usuarios WHERE ativo=1 AND id!=?').all(id);
    return !outros.some(u=>ac.ehAdminGeral(u.id));   // ninguem mais e AG ativo
  }

  app.delete('/api/usuarios/:id',(req,res)=>{
    const id=req.params.id;
    const hard=req.query.hard==='1';
    if(ehUltimoAdminGeral(id))
      return res.status(400).json({erro:'Esta é a única pessoa com acesso total (Admin Geral). Dê o acesso de Admin Geral a outra pessoa antes de remover esta.'});
    const alvo=db.prepare('SELECT nome FROM usuarios WHERE id=?').get(id);
    if(hard){
      db.transaction(()=>{
        db.prepare('DELETE FROM usuarios WHERE id=?').run(id);
        try{ db.prepare('DELETE FROM usuario_setor WHERE usuario_id=?').run(id); }catch(e){}
        try{ db.prepare('DELETE FROM usuario_excecao WHERE usuario_id=?').run(id); }catch(e){}
      })();
      aud(req,'sistema','pessoa_excluida',alvo?alvo.nome:String(id),'exclusao definitiva');
      return res.json({ok:true,excluido:true});
    }
    db.prepare('UPDATE usuarios SET ativo=0 WHERE id=?').run(id);
    aud(req,'sistema','pessoa_desativada',alvo?alvo.nome:String(id),'acesso bloqueado');
    res.json({ok:true});
  });
};

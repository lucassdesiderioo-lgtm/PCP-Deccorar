// PIN de 4 digitos com scrypt + salt individual, cookie de sessao assinado com
// HMAC-SHA256. Mesmo desenho do PCP do Mercado Livre, banco proprio: a equipe
// da fabrica ja sabe entrar assim (grade de nomes -> teclado numerico).
const crypto=require('crypto'), fs=require('fs'), path=require('path');
const {pode}=require('./permissoes');
const pcp=require('./pcp');

// Tela -> arquivo + permissao. Uma tela fora desta lista nao existe.
const TELAS={
  '/':          {arquivo:'telas/inicio.html',    permissao:'cadastro.ler'},
  '/inicio':    {arquivo:'telas/inicio.html',    permissao:'cadastro.ler'},
  '/cadastros': {arquivo:'telas/cadastros.html', permissao:'cadastro.ler'},
  '/sobras':    {arquivo:'telas/sobras.html',    permissao:'sobra.ler'},
  '/etiquetas': {arquivo:'telas/etiquetas.html', permissao:'etiqueta.imprimir'},
  '/rolos':     {arquivo:'telas/rolos.html',     permissao:'rolo.ler'},
  '/corte':     {arquivo:'telas/corte.html',     permissao:'plano.calcular'},
  '/painel':    {arquivo:'telas/painel.html',    permissao:'painel.ler'}
};
const LIVRE=['/login','/favicon.ico','/base.css','/ui.js','/barras.js'];

module.exports=function(app, db){
  const arqSeg=path.join(__dirname,'..','.session_secret');
  let SEG;
  try{ SEG=fs.readFileSync(arqSeg,'utf8').trim(); }
  catch(e){ SEG=crypto.randomBytes(32).toString('hex'); fs.writeFileSync(arqSeg,SEG,{mode:0o600}); }

  const hash=(pin,salt)=>crypto.scryptSync(String(pin),salt,32).toString('hex');
  const assina=v=>crypto.createHmac('sha256',SEG).update(v).digest('hex').slice(0,32);

  function criar(nome,pin,papel){
    const salt=crypto.randomBytes(16).toString('hex');
    return db.prepare('INSERT INTO usuario(nome,salt,pin_hash,papel) VALUES(?,?,?,?)')
      .run(nome,salt,hash(pin,salt),papel||'cortador');
  }

  if(db.prepare('SELECT COUNT(*) c FROM usuario').get().c===0){
    criar('Diretor','1234','diretor');
    console.log('[auth] usuario inicial: Diretor / PIN 1234 - TROQUE ASSIM QUE ENTRAR');
  }

  function lerSessao(req){
    const raw=req.headers.cookie||'';
    const par=raw.split(';').map(s=>s.trim()).find(s=>s.startsWith('tec='));
    if(!par) return null;
    const val=decodeURIComponent(par.slice(4));
    const i=val.lastIndexOf('.');
    if(i<0) return null;
    const corpo=val.slice(0,i), sig=val.slice(i+1);
    if(assina(corpo)!==sig) return null;
    try{
      const o=JSON.parse(Buffer.from(corpo,'base64').toString('utf8'));
      const u=db.prepare('SELECT id,nome,papel,ativo FROM usuario WHERE id=?').get(o.id);
      if(!u||!u.ativo) return null;
      return {id:u.id,nome:u.nome,papel:u.papel};
    }catch(e){ return null; }
  }
  app.locals.lerSessao=lerSessao;

  const falhas={};
  const bloqueado=id=>{ const f=falhas[id]; return f&&f.n>=5&&(Date.now()-f.t)<60000; };

  const negaTela=res=>res.status(403).send(
    '<body style="font-family:system-ui;padding:40px"><h2>Sem permissao</h2>'+
    '<p>Voce nao tem acesso a esta tela.</p><a href="/login">Entrar com outro usuario</a></body>');

  // A pessoa esta logada no PCP mas ninguem liberou o acesso a este modulo.
  // A mensagem diz o nome e o caminho — sem isso ela tentaria o PIN do PCP
  // aqui, nao funcionaria, e abriria um chamado.
  const semAcesso=(res,nome)=>res.status(403).send(
    '<body style="font-family:system-ui;padding:40px;max-width:32em">'+
    '<h2>Acesso ainda nao liberado</h2>'+
    '<p><b>'+String(nome||'').replace(/[<>&]/g,'')+'</b> esta logado no PCP, mas ainda nao tem acesso ao Plano de corte.</p>'+
    '<p>Peca ao diretor para liberar em <b>Cadastros &rarr; Pessoas</b>, aqui neste modulo.</p>'+
    '<a href="/login">Entrar com um PIN daqui</a></body>');

  // ── LOGIN UNICO ────────────────────────────────────────────────────────
  // Autenticacao no PCP, autorizacao aqui: o PCP diz QUEM e a pessoa, e o
  // cadastro deste modulo diz SE ela entra e com que papel. Bloqueou no PCP,
  // nao entra aqui — que era o furo do cadastro duplicado.
  const porPcp=db.prepare('SELECT id,nome,papel,ativo FROM usuario WHERE pcp_id=?');
  async function sessaoDoPcp(req){
    const quem=await pcp.quemEsta(req.headers.cookie||'');
    if(!quem) return null;
    const u=porPcp.get(quem.id);
    if(!u) return {bloqueado:'nao_liberado', nome:quem.nome};
    if(!u.ativo) return {bloqueado:'inativo', nome:u.nome};
    return {id:u.id, nome:u.nome, papel:u.papel, via:'pcp'};
  }

  app.use(async function(req,res,next){
    const p=req.path;
    if(LIVRE.includes(p)||p.startsWith('/api/auth/')) return next();

    // Primeiro a sessao PROPRIA (PIN daqui), depois a do PCP. Nesta ordem
    // porque quem entrou com o PIN daqui fez isso de proposito — em geral
    // porque o PCP estava fora do ar.
    let u=lerSessao(req);
    let recado=null;
    if(!u){
      const doPcp=await sessaoDoPcp(req);
      if(doPcp&&doPcp.bloqueado) recado=doPcp;
      else u=doPcp;
    }
    req.usuario=u;

    if(recado){
      if(p.startsWith('/api/')) return res.status(403).json({ok:false,motivo:recado.bloqueado,
        mensagem:recado.bloqueado==='inativo'
          ?'Seu acesso ao Plano de corte esta bloqueado.'
          :'Voce ainda nao tem acesso ao Plano de corte. Peca ao diretor para liberar.'});
      return semAcesso(res,recado.nome);
    }

    // Nenhum .html sai do disco por caminho direto. As telas so abrem pelo
    // caminho declarado em TELAS, e e la que a permissao e conferida — e a
    // armadilha #3 do PCP: static antes do auth entrega a tela sem senha.
    if(p.endsWith('.html')) return u?negaTela(res):res.redirect('/login');

    const tela=TELAS[p];
    if(!u){
      if(p.startsWith('/api/')) return res.status(401).json({ok:false,motivo:'nao_logado',mensagem:'Sessao expirada. Entre de novo.'});
      if(tela) return res.redirect('/login?r='+encodeURIComponent(req.originalUrl));
      return next();
    }
    if(tela){
      if(!pode(u,tela.permissao)) return negaTela(res);
      return res.sendFile(path.join(__dirname,'..','public',tela.arquivo));
    }
    next();
  });

  app.get('/login',(req,res)=>res.sendFile(path.join(__dirname,'..','public','login.html')));

  app.get('/api/auth/pessoas',(req,res)=>
    res.json({ok:true,dados:db.prepare('SELECT id,nome FROM usuario WHERE ativo=1 ORDER BY nome').all()}));

  app.post('/api/auth/login',(req,res)=>{
    const {id,pin}=req.body||{};
    if(bloqueado(id)) return res.status(429).json({ok:false,motivo:'muitas_tentativas',mensagem:'Muitas tentativas. Aguarde 1 minuto.'});
    const u=db.prepare('SELECT * FROM usuario WHERE id=? AND ativo=1').get(id);
    if(!u||hash(pin,u.salt)!==u.pin_hash){
      const f=falhas[id]||{n:0,t:0};
      falhas[id]={n:(Date.now()-f.t<60000?f.n:0)+1,t:Date.now()};
      return res.status(401).json({ok:false,motivo:'pin_incorreto',mensagem:'PIN incorreto.'});
    }
    delete falhas[id];
    const corpo=Buffer.from(JSON.stringify({id:u.id})).toString('base64');
    res.setHeader('Set-Cookie','tec='+encodeURIComponent(corpo+'.'+assina(corpo))+'; Path=/; Max-Age=31536000; HttpOnly; SameSite=Lax');
    res.json({ok:true,dados:{nome:u.nome,papel:u.papel}});
  });

  app.post('/api/auth/logout',(req,res)=>{
    res.setHeader('Set-Cookie','tec=; Path=/; Max-Age=0');
    res.json({ok:true,dados:{}});
  });

  app.get('/api/auth/eu',async (req,res)=>{
    let u=lerSessao(req);
    if(!u){
      const doPcp=await sessaoDoPcp(req);
      if(doPcp&&!doPcp.bloqueado) u=doPcp;
    }
    res.json({ok:true,dados:u?{logado:true,...u}:{logado:false}});
  });

  return {criar,hash};
};

module.exports.TELAS=TELAS;

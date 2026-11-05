const crypto=require('crypto'), fs=require('fs'), path=require('path');
// Para onde a pessoa vai (login, /setor e as duas barras): dono unico.
const {destino}=require('./destino');
const QUEM=require('./quem');

const AREAS=[
  {id:'admin',       nome:'Admin (controle geral)'},
  {id:'painel',      nome:'Painel do dia'},
  {id:'relatorios',  nome:'Relatorios'},
  /* O id continua 'necessidade' de proposito: ele esta gravado em
     usuarios.areas de quem ja tem acesso, e renomear o id tiraria a permissao
     de todo mundo de uma vez. Mudou so o rotulo — a tela ABC saiu e quem esta
     area libera hoje e o Planejamento. */
  {id:'necessidade', nome:'Planejamento'},
  {id:'operador',    nome:'Revisao'},
  {id:'devolucao',   nome:'Devolucoes'},
  {id:'montagem',    nome:'Montagem'},
  {id:'embalagem',   nome:'Etiqueta de Venda'},
  {id:'expedicao',   nome:'Subir PDFs (ML)'},
  {id:'carregamento',nome:'Conferência'},
  // Compras fase 5. A area existe no modelo ANTIGO so para a tela ficar na
  // lista protegida abaixo — sem entrada em TELAS, um usuario deslogado cairia
  // no next() e a pagina seria servida do disco (armadilha #3 da secao 10 do
  // CLAUDE.md). Quem decide de verdade e a permissao pedido.receber.
  {id:'recebimento', nome:'Recebimento de compras'},
  /* A conferencia de estoque no tablet (fase 2 da ESTOQUE-LIVRO-E-CONFERENCIA,
     26/09/2026). Mesma razao do recebimento: sem a area, /inventario ficaria
     fora de TELAS e o express.static a serviria sem sessao. */
  {id:'inventario',  nome:'Conferencia de estoque (contar e recontar)'},
  /* As devolucoes EM ANDAMENTO (spec DEVOLUCOES-ACOMPANHAMENTO, 03/11/2026).
     Mesma razao do inventario: sem a area, /devolucao-casos ficaria fora de
     TELAS e o pedido sem sessao cairia no next(). Quem decide e a chave. */
  {id:'devolucao_casos', nome:'Devolucoes em andamento'},
  /* SOB MEDIDA (02/09/2026). A fabrica tem duas operacoes: a de medida padrao,
     que vende pelo Mercado Livre, e a sob medida, que corta tecido contra o
     pedido do cliente. Ate aqui a segunda vivia num segundo servidor, com um
     segundo cadastro de pessoas — e desligar alguem exigia lembrar dos dois.

     Como areas do PCP, a liberacao passa a ser uma linha na MESMA tela em que
     se libera revisao ou carregamento, e o desligamento vale para tudo de uma
     vez. Quem traduz area em papel la dentro e `tecido/nucleo/acesso.js`. */
  {id:'sobmedida',     nome:'Sob medida - bancada (corte, sobras, etiquetas)'},
  {id:'sobmedida_adm', nome:'Sob medida - cadastros e parametros'}
];

// O caminho onde o modulo sob medida esta montado. Constante porque o auth e o
// server.js precisam concordar, e um deles concordando sozinho e uma tela
// servida sem sessao (armadilha #3).
const SOBMEDIDA='/sobmedida';

const TELAS={
  '/':'admin','/admin':'admin','/index.html':'admin',
  '/painel':'painel','/painel.html':'painel',
  '/relatorios':'relatorios','/relatorios.html':'relatorios',
  '/planejamento':'necessidade','/planejamento.html':'necessidade',
  '/operador':'operador','/operador.html':'operador',
  '/devolucao':'devolucao','/devolucao.html':'devolucao',
  '/montagem':'montagem','/montagem.html':'montagem',
  '/embalagem':'embalagem','/embalagem.html':'embalagem',
  /* /expedicao (a antiga 203) só redireciona para a 103 desde 05/11/2026; fica na
     lista para quem não tem sessão ir ao login, e não cair no static. */
  '/expedicao':'expedicao','/expedicao.html':'expedicao',
  '/carregamento':'carregamento','/carregamento.html':'carregamento',
  '/recebimento':'recebimento','/recebimento.html':'recebimento',
  '/inventario':'inventario','/inventario.html':'inventario',
  '/devolucao-casos':'devolucao_casos','/devolucao-casos.html':'devolucao_casos',
  '/coleta-horarios':'coleta_horarios','/coleta-horarios.html':'coleta_horarios',
  /* A escolha de setor. O '*' quer dizer QUALQUER SESSAO: nao ha area para
     escolher onde trabalhar. Ela precisa estar nesta lista de todo jeito —
     fora dela, o pedido cairia no next() e o express.static entregaria o
     arquivo do disco sem sessao nenhuma (armadilha #3 da secao 10). */
  '/setor':'*','/setor.html':'*'
};
/* AS TELAS DO ADMIN (fase 5 da ACESSO-POR-TELA-E-NIVEL): cada aba virou uma
   tela `/admin/...`, e elas entram nesta lista protegida a partir do mapa —
   fora dela, sem sessao, o pedido cairia no next() (armadilha #3). */
try{ require('./telas').TELAS.forEach(t=>{ if(t.rota.indexOf('/admin/')===0) TELAS[t.rota]='admin'; }); }catch(e){}

const API_ADMIN=['/api/teste','/api/usuarios','/api/estoque','/api/alvo','/api/backup'];
const LIVRE=['/login','/login.html','/nav.js','/favicon.ico'];

module.exports=function(app, db){
  db.exec("CREATE TABLE IF NOT EXISTS usuarios(id INTEGER PRIMARY KEY AUTOINCREMENT, nome TEXT NOT NULL, salt TEXT NOT NULL, pin_hash TEXT NOT NULL, areas TEXT NOT NULL DEFAULT '', ativo INTEGER NOT NULL DEFAULT 1, criado_em TEXT DEFAULT (datetime('now','localtime')), pin_curto INTEGER NOT NULL DEFAULT 1, fora_rodizio INTEGER DEFAULT 0, nivel TEXT)");
  /* PIN DE 6 DIGITOS (ACESSOS-UNIFICADOS fase 5-A, 21/10/2026). `pin_curto=1`
     quer dizer "esta pessoa ainda entra com o PIN de 4 e tem que trocar". O
     hash nao diz o tamanho do PIN, entao a marca e uma coluna: quem ja estava
     no banco nasce marcado, porque ate aqui todo PIN era de 4. Ela so vira 0
     quando um PIN de 6 e gravado (troca pela pessoa ou pelo cadastro).

     A troca e cobrada no USO, nao so no login: a sessao dura 1 ano e os
     tablets quase nunca passam pela tela de PIN. */
  try{ db.exec('ALTER TABLE usuarios ADD COLUMN pin_curto INTEGER NOT NULL DEFAULT 1'); }catch(e){ /* ja existe */ }
  /* FORA DO RODIZIO DA CONTAGEM (ESTOQUE-LIVRO-E-CONFERENCIA v2, §6.5,
     04/11/2026): folga, ferias, afastamento. Quem liga e desliga e quem tem
     contagem.planejar (inventario_route). No fim, por ALTER (§17). */
  try{ db.exec('ALTER TABLE usuarios ADD COLUMN fora_rodizio INTEGER DEFAULT 0'); }catch(e){ /* ja existe */ }
  /* O NIVEL DA PESSOA (spec ACESSO-POR-TELA-E-NIVEL, fase 3): o teto do que ela
     alcanca. Depois do fora_rodizio, na ordem do CREATE (§17). A migracao (o maior nivel que cada um ja alcanca) e o acesso.js.
     ⚠️ SEM DEFAULT, DE PROPOSITO: vazio quer dizer "sem nivel gravado" (a
     linha nasceu por SQL direto, um teste ou um script) e nao corta nada; a
     pessoa criada pela tela nasce `operacao`, gravado aqui no `criar`. */
  try{ if(db.prepare("SELECT name FROM pragma_table_info('usuarios')").all().every(c=>c.name!=='nivel')) db.exec("ALTER TABLE usuarios ADD COLUMN nivel TEXT"); }catch(e){ console.log('[auth] coluna nivel falhou: '+e.message); }
  /* A ENTRADA E A SAIDA DO LOGIN (QUEM-FEZ-E-REVISAO fase 6, 05/11/2026). Uma
     linha de `sessao` por login — quem, quando entrou, quando e COMO saiu
     (logout, bloqueado, expirou), o IP e o aparelho —, e cada coisa que
     acontece com ela em `sessao_evento`: login, logout, troca de setor,
     troca de PIN, a que caiu porque a pessoa foi bloqueada e a que expirou.
     E a base do relogio de aba do PCP-CONTROLE-E-VISAO (fase 2 de la).

     ⚠️ FICAM FORA DO MODO TESTE (`TABELAS` do teste_route.js), de proposito:
     o login feito com o modo ligado e um login de verdade, e apagar ao
     encerrar o teste tiraria da historia quem esteve no sistema.

     ⚠️ O COOKIE DE ANTES (so com o id) CONTINUA VALENDO: a sessao dura 1 ano e
     os tablets quase nunca passam pela tela de PIN. Ninguem e deslogado pelo
     deploy; o que ele faz vira evento com quem e quando, sem `sessao_id` — o
     passado nao se reconstroi. */
  db.exec(`CREATE TABLE IF NOT EXISTS sessao (
      id INTEGER PRIMARY KEY AUTOINCREMENT, usuario_id INTEGER NOT NULL, usuario_nome TEXT,
      entrou_em TEXT DEFAULT (datetime('now','localtime')), saiu_em TEXT, como_saiu TEXT,
      ip TEXT, aparelho TEXT);
    CREATE INDEX IF NOT EXISTS idx_sessao_aberta ON sessao(saiu_em);
    CREATE TABLE IF NOT EXISTS sessao_evento (
      id INTEGER PRIMARY KEY AUTOINCREMENT, sessao_id INTEGER, usuario_id INTEGER, usuario_nome TEXT,
      tipo TEXT NOT NULL, detalhe TEXT, em TEXT DEFAULT (datetime('now','localtime')), ip TEXT);
    CREATE INDEX IF NOT EXISTS idx_sessao_evento_usuario ON sessao_evento(usuario_id);`);
  const ipDe=req=>String((req&&req.headers&&req.headers['x-forwarded-for'])||(req&&req.socket&&req.socket.remoteAddress)||'').split(',')[0].trim()||null;
  const aparelhoDe=req=>{ const a=String((req&&req.headers&&req.headers['user-agent'])||'').slice(0,200); return a||null; };
  /* Registrar NUNCA derruba o login: o registro e historia, a entrada e o
     trabalho. Um erro aqui vai para o log, e a pessoa entra do mesmo jeito. */
  function sessEvento(sessaoId,u,tipo,detalhe,req){
    try{ db.prepare('INSERT INTO sessao_evento (sessao_id,usuario_id,usuario_nome,tipo,detalhe,ip) VALUES (?,?,?,?,?,?)')
      .run(sessaoId||null,u&&u.id!=null?u.id:null,u&&u.nome!=null?String(u.nome):null,tipo,detalhe==null?null:String(detalhe),ipDe(req)); }
    catch(e){ console.log('[auth] evento de sessao falhou: '+e.message); }
  }
  /* Fecha a sessao UMA vez: so a que ainda esta aberta. */
  function fecharSessao(sessaoId,como,u,req){
    if(!sessaoId) return false;
    try{
      const r=db.prepare("UPDATE sessao SET saiu_em=datetime('now','localtime'), como_saiu=? WHERE id=? AND saiu_em IS NULL").run(como,sessaoId);
      if(r.changes){ sessEvento(sessaoId,u,como,null,req); return true; }
    }catch(e){ console.log('[auth] fechar sessao falhou: '+e.message); }
    return false;
  }
  /* A sessao aberta ha mais de 1 ano (o Max-Age do cookie) ja nao vale no
     navegador: fecha como "expirou". Roda no boot e a cada login — o servidor
     nao fica sabendo da hora em que o cookie vence, entao fecha quando passa. */
  function fecharExpiradas(){
    try{
      const velhas=db.prepare("SELECT id,usuario_id,usuario_nome FROM sessao WHERE saiu_em IS NULL AND entrou_em < datetime('now','localtime','-365 days')").all();
      velhas.forEach(v=>fecharSessao(v.id,'expirou',{id:v.usuario_id,nome:v.usuario_nome},null));
    }catch(e){ console.log('[auth] sessoes expiradas falharam: '+e.message); }
  }
  fecharExpiradas();
  const PIN_OK=/^[0-9]{6}$/;
  const ERRO_PIN='O PIN tem que ter 6 números.';

  const arqSeg=path.join(__dirname,'.session_secret');
  let SEG;
  try{ SEG=fs.readFileSync(arqSeg,'utf8').trim(); }
  catch(e){ SEG=crypto.randomBytes(32).toString('hex'); fs.writeFileSync(arqSeg,SEG,{mode:0o600}); }

  const hash=(pin,salt)=>crypto.scryptSync(String(pin),salt,32).toString('hex');
  const assina=v=>crypto.createHmac('sha256',SEG).update(v).digest('hex').slice(0,32);

  // O seed do Administrador (1234) e a unica pessoa criada com PIN curto: ele
  // nasce marcado e cai na troca no primeiro uso.
  function criar(nome,pin,areas){
    const salt=crypto.randomBytes(16).toString('hex');
    // Pessoa nova nasce de nivel Operacao (spec ACESSO-POR-TELA-E-NIVEL): quem
    // sobe de nivel e o Admin Geral, pela tela de Acessos.
    return db.prepare("INSERT INTO usuarios(nome,salt,pin_hash,areas,pin_curto,nivel) VALUES(?,?,?,?,?,'operacao')")
      .run(nome,salt,hash(pin,salt),(areas||[]).join(','),PIN_OK.test(String(pin))?0:1);
  }
  function gravarPin(id,pin){
    const salt=crypto.randomBytes(16).toString('hex');
    db.prepare('UPDATE usuarios SET salt=?,pin_hash=?,pin_curto=0 WHERE id=?').run(salt,hash(pin,salt),id);
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
      const u=db.prepare('SELECT id,nome,areas,ativo,pin_curto FROM usuarios WHERE id=?').get(o.id);
      /* Bloqueado no cadastro: a sessao cai (como sempre) e, se ela tem
         numero, fecha como "bloqueado" — uma vez so, nao a cada pedido. */
      if(!u||!u.ativo){ if(u&&Number.isInteger(o.s)) fecharSessao(o.s,'bloqueado',{id:u.id,nome:u.nome},req); return null; }
      const s={id:u.id,nome:u.nome,areas:u.areas.split(',').filter(Boolean),trocarPin:!!u.pin_curto};
      /* O numero da sessao viaja escondido: nao entra no `...u` do
         /api/auth/eu, e a tela nao precisa dele. */
      Object.defineProperty(s,'sessao',{value:Number.isInteger(o.s)?o.s:null,enumerable:false});
      return s;
    }catch(e){ return null; }
  }

  const tem=(u,a)=>!!u&&(a==='*'||u.areas.includes('admin')||u.areas.includes(a));

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
    /* PIN DE 4 DIGITOS: ate trocar, nada alem do login e da propria troca
       (fase 5-A). Fica ANTES do desvio do sob medida, para valer la tambem.
       Arquivo de apoio (.js, .css, imagem) segue o caminho normal: so tela
       e API sao barradas. A tela leva o `r`, para o tablet voltar a estacao
       dele depois da troca. */
    if(u&&u.trocarPin){
      if(p.startsWith('/api/')||p.startsWith(SOBMEDIDA+'/api/'))
        return res.status(403).json({erro:'trocar_pin'});
      if(!/\.[a-z0-9]+$/i.test(p)||/\.html$/i.test(p)) return res.redirect('/login?trocar=1&r='+encodeURIComponent(req.originalUrl));
    }
    /* SOB MEDIDA — o modulo montado em /sobmedida tem portao proprio
       (tecido/montar.js): ele traduz area do PCP em papel e confere permissao
       por chave, tela a tela. Aqui so se passa a sessao adiante.

       Fica ANTES do modelo novo de acesso de proposito. O `decidir()` nao
       conhece estes caminhos, e decidir por omissao seria arbitrario nos dois
       sentidos: liberar tudo abriria o corte a quem nao tem area, negar tudo
       trancaria quem tem. Um dono so por caminho. */
    if(p===SOBMEDIDA||p.startsWith(SOBMEDIDA+'/')) return next();
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

  /* HTTPS (fase 5-B). O Traefik recebe o https e repassa ao PCP em http,
     avisando pelo X-Forwarded-Proto; quando ele diz https, o cookie ganha
     Secure e o navegador nunca mais o manda por http. Pelo endereco velho
     (http://…:3010) o cookie sai SEM Secure: enquanto a porta estiver aberta
     na transicao, um Secure ali faria ninguem conseguir logar.
     O cabecalho pode ser forjado por quem chama a :3010 direto, mas o unico
     efeito e o proprio cookie dele ficar mais restrito. */
  const seguro=req=>String(req.headers['x-forwarded-proto']||'').split(',')[0].trim().toLowerCase()==='https'?'; Secure':'';

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
    fecharExpiradas();
    let sessaoId=null;
    try{ sessaoId=db.prepare('INSERT INTO sessao (usuario_id,usuario_nome,ip,aparelho) VALUES (?,?,?,?)')
      .run(u.id,u.nome,ipDe(req),aparelhoDe(req)).lastInsertRowid; }
    catch(e){ console.log('[auth] abrir sessao falhou: '+e.message); }
    sessEvento(sessaoId,u,'login',null,req);
    const corpo=Buffer.from(JSON.stringify(sessaoId?{id:u.id,s:Number(sessaoId)}:{id:u.id})).toString('base64');
    res.setHeader('Set-Cookie','sess='+encodeURIComponent(corpo+'.'+assina(corpo))+'; Path=/; Max-Age=31536000; HttpOnly; SameSite=Lax'+seguro(req));
    aud({usuario:{id:u.id,nome:u.nome},headers:req.headers,socket:req.socket},'acesso','login',u.nome,'');
    const areasU=u.areas.split(',').filter(Boolean);
    res.json({ok:true,nome:u.nome,areas:areasU,destino:destino(areasU),trocar_pin:!!u.pin_curto});
  });

  /* A pessoa troca o proprio PIN. Exige o PIN ATUAL: num tablet deixado
     logado, qualquer um que passasse trocaria o PIN de quem esta na sessao.
     O PIN atual errado conta na MESMA trava do login (5 erros, 1 minuto),
     senao esta rota viraria a porta para chutar PIN. */
  app.post('/api/auth/trocar-pin',(req,res)=>{
    const s=lerSessao(req);
    if(!s) return res.status(401).json({erro:'nao_logado'});
    const {atual,novo}=req.body||{};
    const quem={usuario:{id:s.id,nome:s.nome},headers:req.headers,socket:req.socket};
    if(bloqueado(s.id)) return res.status(429).json({erro:'Muitas tentativas. Aguarde 1 minuto.'});
    const u=db.prepare('SELECT * FROM usuarios WHERE id=? AND ativo=1').get(s.id);
    if(!u||hash(atual,u.salt)!==u.pin_hash){
      const f=falhas[s.id]||{n:0,t:0};
      falhas[s.id]={n:(Date.now()-f.t<60000?f.n:0)+1,t:Date.now()};
      aud(quem,'acesso','pin_errado',String(s.id),'troca de PIN');
      return res.status(401).json({erro:'PIN atual incorreto'});
    }
    delete falhas[s.id];
    if(!PIN_OK.test(String(novo==null?'':novo))) return res.status(400).json({erro:ERRO_PIN});
    gravarPin(s.id,String(novo));
    aud(quem,'acesso','troca_pin',s.nome,'');
    sessEvento(s.sessao,s,'troca_pin',null,req);
    res.json({ok:true,destino:destino(s.areas)});
  });

  app.post('/api/auth/logout',(req,res)=>{
    const u=lerSessao(req);
    if(u){
      aud({usuario:u,headers:req.headers,socket:req.socket},'acesso','logout',u.nome,'');
      // O evento sempre (com ou sem numero); a sessao fecha uma vez so.
      sessEvento(u.sessao,u,'logout',null,req);
      if(u.sessao){ try{ db.prepare("UPDATE sessao SET saiu_em=datetime('now','localtime'), como_saiu='logout' WHERE id=? AND saiu_em IS NULL").run(u.sessao); }catch(e){} }
    }
    res.setHeader('Set-Cookie','sess=; Path=/; Max-Age=0'+seguro(req));
    res.json({ok:true});
  });

  /* A TROCA DE SETOR: a /setor e os atalhos "Sob medida →" e "Medida padrao →"
     avisam aqui ao clicar (fase 6). So registra; nao muda nada da sessao nem do
     destino. Sem sessao, 401 e nada grava; destino fora da lista, 400. */
  const SETORES=['padrao','sobmedida'];
  app.post('/api/auth/setor',(req,res)=>{
    const u=lerSessao(req);
    if(!u) return res.status(401).json({erro:'nao_logado'});
    const para=String((req.body||{}).para||'');
    if(SETORES.indexOf(para)<0) return res.status(400).json({erro:'Setor desconhecido.'});
    sessEvento(u.sessao,u,'troca_setor',para,req);
    res.json({ok:true});
  });

  app.get('/api/auth/eu',(req,res)=>{
    const u=lerSessao(req);
    res.json(u?{logado:true,...u,destino:destino(u.areas)}:{logado:false});
  });

  app.get('/api/auth/areas',(req,res)=>res.json(AREAS));

  app.get('/api/usuarios',(req,res)=>
    res.json(db.prepare('SELECT id,nome,areas,ativo FROM usuarios ORDER BY nome').all()));

  app.post('/api/usuarios',(req,res)=>{
    // Sem login nada grava (QUEM-FEZ-E-REVISAO fase 7): o cadastro de pessoas e escrita.
    if(!QUEM.exigir(req,res)) return;
    const {id,nome,pin,areas,ativo}=req.body||{};
    if(!nome) return res.status(400).json({erro:'nome obrigatorio'});
    if(id){
      // areas e ativo so mudam se vierem no corpo — a tela de Acessos edita
      // nome/PIN sem tocar neles (areas passou a ser derivada dos setores).
      if(ativo!==undefined && !ativo && ehUltimoAdminGeral(id))
        return res.status(400).json({erro:'Esta é a única pessoa com acesso total (Admin Geral). Dê esse acesso a outra pessoa antes de bloquear esta.'});
      // PIN vazio ou ausente = mantem. PIN mandado e fora do formato e
      // RECUSADO antes de gravar qualquer coisa — ate 21/10/2026 um PIN de 3
      // digitos era ignorado em silencio e a tela dizia "salvo".
      if(pin!==undefined&&pin!==null&&pin!==''&&!PIN_OK.test(String(pin))) return res.status(400).json({erro:ERRO_PIN});
      db.prepare('UPDATE usuarios SET nome=? WHERE id=?').run(nome,id);
      if(areas!==undefined) db.prepare('UPDATE usuarios SET areas=? WHERE id=?').run((areas||[]).join(','),id);
      if(ativo!==undefined) db.prepare('UPDATE usuarios SET ativo=? WHERE id=?').run(ativo?1:0,id);
      if(pin) gravarPin(id,String(pin));
    } else {
      if(!PIN_OK.test(String(pin==null?'':pin))) return res.status(400).json({erro:ERRO_PIN});
      const r=criar(nome,pin,areas||[]);
      return res.json({ok:true,id:r.lastInsertRowid});
    }
    res.json({ok:true});
  });

  // Trava de seguranca: nao deixa remover/bloquear o ULTIMO Admin Geral ativo —
  // senao ninguem mais consegue administrar (regra "ninguem sem acesso").
  //
  // A CONTA MORA NO acesso.js, ao lado de "quem e Admin Geral" (17/09/2026).
  // Ela passou a ser feita em dois lugares — aqui e na tela de Acessos, que
  // tambem pode tirar o cracha do ultimo AG (divida 17) — e duas copias
  // divergiriam no dia em que "quem e Admin Geral" mudasse de definicao.
  // Modelo novo indisponivel: NAO trava, que e como sempre foi.
  function ehUltimoAdminGeral(id){
    const ac=app.locals.acesso;
    if(!ac||!ac.ehUltimoAdminGeral) return false;
    try{ return ac.ehUltimoAdminGeral(+id); }catch(e){ return false; }
  }

  app.delete('/api/usuarios/:id',(req,res)=>{
    if(!QUEM.exigir(req,res)) return;
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

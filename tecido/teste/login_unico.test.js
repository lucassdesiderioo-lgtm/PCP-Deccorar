// LOGIN UNICO — autenticacao no PCP, autorizacao aqui.
//
// O PCP e um servidor de mentira montado no proprio teste. E o que permite
// provar o caso que motivou a mudanca: bloquear alguem SO no PCP tem que
// tirar o acesso ao estoque de tecido na hora, sem ninguem lembrar do
// segundo sistema.
const http=require('http');
const usuario=require('../dominio/usuario');
const pcp=require('../nucleo/pcp');
const config=require('../nucleo/config');

// ── o PCP de mentira ─────────────────────────────────────────────────────
let gente=[{id:1,nome:'Administrador',ativo:true},{id:2,nome:'Zeca',ativo:true}];
let servidor=null, porta=0;

function subir(){
  return new Promise(ok=>{
    servidor=http.createServer((req,res)=>{
      res.setHeader('Content-Type','application/json');
      if(req.url==='/api/auth/pessoas')
        return res.end(JSON.stringify(gente.filter(p=>p.ativo).map(p=>({id:p.id,nome:p.nome}))));
      if(req.url==='/api/auth/eu'){
        // O cookie do teste carrega o id direto: 'sess=2'.
        const m=/sess=(\d+)/.exec(req.headers.cookie||'');
        const p=m&&gente.find(x=>x.id===Number(m[1])&&x.ativo);
        return res.end(JSON.stringify(p?{logado:true,id:p.id,nome:p.nome}:{logado:false}));
      }
      res.statusCode=404; res.end('{}');
    });
    servidor.listen(0,()=>{ porta=servidor.address().port; ok(); });
  });
}

const apontar=url=>{ config.gravar('pcpUrl',url,'teste'); pcp.esquecer(); };
const esperar=ms=>new Promise(r=>setTimeout(r,ms));

module.exports=[

{nome:'sem endereco do PCP, o login unico fica desligado', executar({igual}){
  // Um diretor de verdade, como o que o boot cria. Sem ele a trava do
  // "ultimo diretor" reagiria nos testes seguintes — e reagiria com razao.
  usuario.criar({nome:'Chefe',pin:'9999',papel:'diretor'});
  config.gravar('pcpUrl','','teste'); pcp.esquecer();
  igual(pcp.ligado(),false,'desligado');
  igual(usuario.loginUnicoLigado(),false,'e o dominio concorda');
  // Apagar o endereco e o jeito de voltar ao PIN proprio para todo mundo,
  // sem mexer em codigo.
}},

{nome:'com o PCP no ar, ele diz quem esta logado', async executar({igual}){
  await subir();
  apontar('http://localhost:'+porta);
  igual(pcp.ligado(),true,'ligado');
  const quem=await pcp.quemEsta('sess=2');
  igual(quem&&quem.nome,'Zeca','achou o Zeca pelo cookie');
  igual(await pcp.quemEsta('sess=999'),null,'cookie de quem nao existe nao autentica');
  igual(await pcp.quemEsta(''),null,'sem cookie, ninguem');
}},

{nome:'estar logado no PCP NAO basta: precisa ser liberado aqui', async executar({igual}){
  const lista=await usuario.doPcp();
  igual(lista.length,2,'as duas pessoas do PCP aparecem');
  igual(lista.every(p=>!p.liberado),true,'e nenhuma tem acesso ainda');
  // A autorizacao e daqui. O PCP so diz QUEM e a pessoa.
}},

{nome:'liberar cria a conta sem senha nenhuma', async executar({igual}){
  const u=usuario.liberarDoPcp({pcp_id:2,nome:'Zeca',papel:'cortador'});
  igual(u.papel,'cortador','papel dado aqui');
  const conta=usuario.listar().find(x=>x.pcp_id===2);
  igual(conta.tem_pin,0,'sem PIN proprio — a credencial continua sendo a do PCP');
  const lista=await usuario.doPcp();
  igual(lista.find(p=>p.pcp_id===2).liberado,true,'aparece como liberado');
}},

{nome:'liberar de novo nao duplica: so troca o papel', executar({igual}){
  const antes=usuario.listar().length;
  usuario.liberarDoPcp({pcp_id:2,nome:'Zeca',papel:'diretor'});
  igual(usuario.listar().length,antes,'nenhuma conta nova');
  igual(usuario.listar().find(x=>x.pcp_id===2).papel,'diretor','papel trocado');
  usuario.liberarDoPcp({pcp_id:2,nome:'Zeca',papel:'cortador'});
}},

{nome:'quem ja tinha PIN daqui e VINCULADO, nao duplicado', executar({igual}){
  const proprio=usuario.criar({nome:'Administrador',pin:'4321',papel:'diretor'});
  const antes=usuario.listar().length;
  const u=usuario.liberarDoPcp({pcp_id:1,nome:'Administrador',papel:'diretor'});
  igual(u.id,proprio.id,'e a MESMA conta');
  igual(usuario.listar().length,antes,'nao nasceu uma segunda');
  const conta=usuario.listar().find(x=>x.id===proprio.id);
  igual(conta.tem_pin,1,'mantem o PIN proprio');
  igual(conta.pcp_id,1,'e agora tambem entra pelo PCP');
  // Sem isso a mesma pessoa apareceria duas vezes na lista de acessos, e
  // bloquear uma das duas daria falsa sensacao de ter bloqueado.
}},

{nome:'BLOQUEAR NO PCP TIRA O ACESSO AQUI, na hora', async executar({igual}){
  igual(!!(await pcp.quemEsta('sess=2')),true,'o Zeca entra');
  gente=gente.map(p=>p.id===2?{...p,ativo:false}:p);   // desligado no PCP
  pcp.esquecer();
  igual(await pcp.quemEsta('sess=2'),null,'e para de entrar');
  // A conta daqui continua existinde e ATIVA — e mesmo assim ele nao entra.
  // Era este o furo do cadastro duplicado: bloquear num sistema e esquecer
  // do outro.
  igual(usuario.listar().find(x=>x.pcp_id===2).ativo,1,'a conta local nem foi tocada');
  gente=gente.map(p=>p.id===2?{...p,ativo:true}:p); pcp.esquecer();
}},

{nome:'tirar o acesso AQUI nao mexe no PCP', async executar({igual}){
  const conta=usuario.listar().find(x=>x.pcp_id===2);
  usuario.atualizar(conta.id,{ativo:0});
  igual(!!(await pcp.quemEsta('sess=2')),true,'ele continua entrando no PCP');
  const lista=await usuario.doPcp();
  igual(lista.find(p=>p.pcp_id===2).liberado,false,'mas nao no corte');
  usuario.atualizar(conta.id,{ativo:1});
}},

{nome:'PCP FORA DO AR nao derruba este modulo', async executar({igual}){
  await new Promise(r=>servidor.close(r));
  pcp.esquecer();
  const quem=await pcp.quemEsta('sess=2');
  igual(quem,null,'ninguem entra pelo PCP');
  igual((await pcp.pessoas()).length,0,'e a lista vem vazia, sem estourar');
  // O PIN proprio continua valendo — e por isso que ele existe. Sem essa
  // saida, uma queda da expedicao pararia o corte junto.
  const comPin=usuario.listar().filter(u=>u.tem_pin);
  igual(comPin.length>0,true,'ha quem entre com PIN daqui: '+comPin.map(u=>u.nome).join(', '));
}},

{nome:'a lista do PCP nao carrega senha nenhuma', async executar({igual}){
  await subir(); apontar('http://localhost:'+porta);
  const lista=await pcp.pessoas();
  const campos=new Set(lista.flatMap(p=>Object.keys(p)));
  igual([...campos].sort().join(','),'id,nome','so id e nome atravessam');
  await new Promise(r=>servidor.close(r));
}}

];

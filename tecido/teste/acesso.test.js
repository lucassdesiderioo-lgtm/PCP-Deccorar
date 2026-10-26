// ENTRADA UNICA — as permissoes do PCP decidem quem entra no sob medida.
//
// Estes casos substituem o antigo login_unico.test.js, que provava a ponte
// HTTP entre dois servidores. Nao ha mais ponte nem segundo servidor: o
// modulo monta dentro do PCP. Ate 26/10/2026 o que se provava aqui era a
// TRADUCAO area -> papel; desde a fase 2 da ACESSOS-UNIFICADOS nao ha
// traducao: o PCP diz quais chaves `sobmedida.*` a pessoa tem, e o PORTAO
// barra quem nao tem a de entrar.
//
// O caso que motivou tudo esta aqui embaixo, e e o unico que importa de
// verdade: com dois cadastros separados, liberar alguem exigia estar
// liberado. Uma tranca sem chave.
const express=require('express');
const http=require('http');
const acesso=require('../nucleo/acesso');
const {montar}=require('../montar');

// Um PCP de mentira: so o que o portao le do req.usuario.
function subir(usuarioFalso){
  const app=express();
  app.use(express.json());
  app.use((req,res,next)=>{ req.usuario=usuarioFalso(); next(); });
  montar(app,'/sobmedida');
  return new Promise(ok=>{
    const s=app.listen(0,()=>ok({servidor:s, porta:s.address().port}));
  });
}

function pedir(porta,caminho){
  return new Promise(ok=>{
    http.get({host:'127.0.0.1',port:porta,path:caminho},r=>{
      let corpo='';
      r.on('data',d=>corpo+=d);
      r.on('end',()=>ok({status:r.statusCode, corpo, tipo:r.headers['content-type']||''}));
    }).on('error',()=>ok({status:0,corpo:'',tipo:''}));
  });
}

let quem=null;              // quem o "PCP" diz estar logado, por teste
let servidor=null, porta=0;

/* As chaves do PCP de uma pessoa, montadas pelos SETORES em que ela esta —
   com o mesmo pacote com que o acesso.js do PCP faz os setores nascerem. */
const {PAPEIS,CHAVES}=require('../nucleo/permissoes');
const pre=l=>l.map(c=>'sobmedida.'+c);
const SETOR={
  bancada:  pre(PAPEIS.cortador),
  venda:    pre(PAPEIS.vendedor),
  cadastros:pre(CHAVES.map(c=>c.chave)).concat(pre(['serralheria','colecao','montagem','revisao','embalagem'])),
  embalagem:['sobmedida.embalagem'], serralheria:['sobmedida.serralheria'],
  comprador:['compras.ver','custo.ver','pedido.criar'],   // chaves do PCP, nenhuma do modulo
  revisaoML:['revisao.executar','painel.ver']
};
const chavesDe=(...setores)=>[...new Set([].concat(...setores.map(s=>SETOR[s])))];
const sessao=(...setores)=>acesso.daSessaoDoPcp({id:1,nome:'x'},chavesDe(...setores));

module.exports=[

{nome:'sem chave de sob medida, a pessoa NAO entra', executar({igual}){
  igual(sessao('revisaoML'),null,'revisor do ML nao entra');
  igual(acesso.daSessaoDoPcp({id:1,nome:'Ze'},[]),null,'sem chave nenhuma tambem nao');
  igual(acesso.daSessaoDoPcp(null,[]),null,'sem sessao, ninguem');
  /* ⚠️ O COMPRADOR TEM CHAVES DE NIVEL ADMIN NO PCP, e por isso a area
     'admin' — que ate 21/10 abria o modulo como diretor (fase 1). Desde a
     fase 2 o modulo nem olha area: sem chave `sobmedida.*`, nao entra. */
  igual(sessao('comprador'),null,'o Comprador nao entra');
}},

{nome:'cada setor traz o seu pacote', executar({igual}){
  const {pode}=require('../nucleo/permissoes');
  const b=sessao('bancada'), c=sessao('cadastros');
  igual(pode(b,'plano.confirmar'),true,'a bancada corta');
  igual(pode(b,'sobra.descartar'),false,'e nao descarta sobra');
  igual(pode(c,'sobra.descartar'),true,'Cadastros descarta');
  igual(pode(c,'boleto.editar'),true,'e lanca boleto');
  // Quem esta nos dois fica com a soma: acumular setor nunca pode TIRAR acesso.
  igual(pode(sessao('bancada','cadastros'),'parametro.editar'),true,'os dois juntos');
}},

{nome:'a VENDA nao carrega a bancada junto', executar({igual}){
  const {pode}=require('../nucleo/permissoes');
  const v=sessao('venda');
  igual(pode(v,'catalogo.ler'),true,'ele simula');
  igual(pode(v,'revenda.ler'),true,'e ve a carteira');
  igual(pode(v,'cadastro.editar'),false,'mas nao abre o cadastro de tecido');
  igual(pode(v,'sobra.descartar'),false,'nem descarta sobra');
  igual(pode(v,'credito.editar'),false,'nem mexe no limite de credito');
}},

{nome:'UMA PERMISSAO SOLTA: lancar boleto sem ser a chefia inteira (o motivo da fase 2)', executar({igual}){
  /* Ate a fase 2, quem precisava lancar boleto tinha que ser DIRETOR: o
     pacote era fixo. Agora a chave se marca sozinha na tela de Acessos. */
  const {pode}=require('../nucleo/permissoes');
  const fin=acesso.daSessaoDoPcp({id:8,nome:'Fin'},
    ['sobmedida.modulo.entrar','sobmedida.boleto.ler','sobmedida.boleto.editar']);
  igual(pode(fin,'boleto.editar'),true,'ela lanca e baixa boleto');
  igual(pode(fin,'sobra.descartar'),false,'e nao descarta sobra');
  igual(pode(fin,'parametro.editar'),false,'nem mexe no calculo');
}},

{nome:'o nome vem do PCP, as chaves tambem', executar({igual}){
  const u=acesso.daSessaoDoPcp({id:3,nome:'Lucas'},chavesDe('cadastros'));
  igual(u.nome,'Lucas','nome do PCP');
  igual(u.papel,undefined,'nao ha mais papel');
  igual(u.via,'pcp','marcado como vindo de la');
  // A auditoria deste modulo grava o NOME. Sem esta traducao ela gravaria o
  // usuario do banco local, que nao existe mais.
}},

// ── O PORTAO, de verdade, por HTTP ───────────────────────────────────────

{nome:'quem tem a chave recebe a tela; quem nao tem recebe recado', async executar({igual}){
  const s=await subir(()=>quem);
  servidor=s.servidor; porta=s.porta;

  quem={id:1,nome:'Lucas',permissoes:chavesDe('cadastros')};
  igual((await pedir(porta,'/sobmedida')).status,200,'a chefia abre o inicio');

  quem={id:9,nome:'Comprador',permissoes:chavesDe('comprador')};
  igual((await pedir(porta,'/sobmedida')).status,403,'o Comprador e barrado');
  igual((await pedir(porta,'/sobmedida/api/eu')).status,403,'e a API tambem');

  quem={id:2,nome:'Ze',permissoes:chavesDe('revisaoML')};
  const barrado=await pedir(porta,'/sobmedida');
  igual(barrado.status,403,'revisor do ML e barrado');
  igual(barrado.corpo.includes('Admin')&&barrado.corpo.includes('Acessos'),true,
    'e o recado diz ONDE se resolve');
  // Recado que nao diz o caminho vira chamado de suporte — ou, pior, a pessoa
  // tentando um segundo PIN que nao existe mais.
}},

{nome:'SEM SESSAO nao ha tela: manda para o login do PCP', async executar({igual}){
  quem=null;
  const r=await pedir(porta,'/sobmedida/corte');
  igual(r.status,302,'redireciona');
  const api=await pedir(porta,'/sobmedida/api/eu');
  igual(api.status,401,'e a API responde 401, nao 302');
}},

{nome:'a permissao e conferida POR TELA, nao so na porta de entrada', async executar({igual}){
  quem={id:2,nome:'Ze',permissoes:chavesDe('bancada')};
  igual((await pedir(porta,'/sobmedida/corte')).status,200,'a bancada corta');
  igual((await pedir(porta,'/sobmedida/cadastros')).status,403,'mas nao cadastra');
  quem={id:1,nome:'Lucas',permissoes:chavesDe('cadastros')};
  igual((await pedir(porta,'/sobmedida/cadastros')).status,200,'a chefia cadastra');

  quem={id:5,nome:'Renato',permissoes:chavesDe('venda')};
  igual((await pedir(porta,'/sobmedida')).status,200,'o vendedor entra');
  igual((await pedir(porta,'/sobmedida/simulador')).status,200,'e simula');
  igual((await pedir(porta,'/sobmedida/revendas')).status,200,'e abre a carteira');
  igual((await pedir(porta,'/sobmedida/corte')).status,403,'mas nao corta');
  igual((await pedir(porta,'/sobmedida/cadastros')).status,403,'nem cadastra tecido');
  igual((await pedir(porta,'/sobmedida/catalogo')).status,403,'nem edita o catalogo');
}},

{nome:'NENHUM .html sai do disco por caminho direto', async executar({igual}){
  quem={id:1,nome:'Lucas',permissoes:chavesDe('cadastros')};
  const r=await pedir(porta,'/sobmedida/telas/cadastros.html');
  igual(r.status,403,'nem para a chefia');
}},

{nome:'o TEMA vem do servidor: bancada clara, escritorio escuro', async executar({igual}){
  quem={id:1,nome:'Lucas',permissoes:chavesDe('cadastros')};
  const corte=await pedir(porta,'/sobmedida/corte');
  const cad=await pedir(porta,'/sobmedida/cadastros');
  igual(corte.corpo.includes('data-contexto="operacao"'),true,'corte e de bancada');
  igual(cad.corpo.includes('data-contexto="admin"'),true,'cadastros e de escritorio');
}},

{nome:'O CONTRATO COM O PCP: uma lista so, sem area de papel', executar({igual}){
  const fs=require('fs'), path=require('path');
  const raiz=path.join(__dirname,'..','..');
  const P=require(path.join(raiz,'permissoes.js'));
  const acessoPcp=fs.readFileSync(path.join(raiz,'acesso.js'),'utf8');
  const server=fs.readFileSync(path.join(raiz,'server.js'),'utf8');

  // 1. Toda chave do modulo esta no catalogo do PCP — sem ela nao ha caixinha.
  const faltam=CHAVES.filter(c=>!P.some(p=>p.chave==='sobmedida.'+c.chave)).map(c=>c.chave);
  igual(faltam.join(','),'','todas as chaves do modulo aparecem na tela de Acessos');
  // ...e nenhuma de nivel admin: daria um pedaco do admin do PCP (armadilha #34).
  const adm=P.filter(p=>p.chave.indexOf('sobmedida.')===0&&/admin/.test(p.nivel)).map(p=>p.chave);
  igual(adm.join(','),'','nenhuma chave do sob medida e nivel admin');
  // 2. As chaves velhas sairam: eram o tradutor de papel.
  igual(P.some(p=>['sobmedida.cortar','sobmedida.cadastrar','sobmedida.vender'].includes(p.chave)),false,
    'cortar/cadastrar/vender sairam do registro');
  // 3. O portao pergunta ao resolvedor do PCP, e nao a sombra `areas`.
  igual(server.includes('permissoes: uid =>'),true,'o server.js liga a porta do acesso');
  // 4. Os setores nascem com os pacotes, para liberar em um clique.
  for(const setor of ['Sob medida / Bancada','Sob medida / Cadastros','Sob medida / Venda',
      'Sob medida / Serralheria','Sob medida / Coleção','Sob medida / Montagem',
      'Sob medida / Revisão','Sob medida / Embalagem'])
    igual(acessoPcp.includes(setor),true,'o setor "'+setor+'" semeado');
}},

{nome:'o SETOR da producao vale sozinho, e salva quem faz duas coisas', async executar({igual}){
  const {pode}=require('../nucleo/permissoes');
  igual(sessao('embalagem').setores.join(','),'embalagem','quem so tem a bancada bipa a dele');
  igual(pode(sessao('embalagem'),'modulo.entrar'),true,
    'ele ENTRA — sem isto o modulo abre em branco com 403 no console');
  igual(pode(sessao('embalagem'),'producao.bipar'),true,'e bipa');
  igual(pode(sessao('embalagem'),'plano.confirmar'),false,'e nao corta tecido');

  const vendeEmbala=sessao('venda','embalagem');
  igual(vendeEmbala.setores.join(','),'embalagem','quem vende e embala continua com a bancada');
  igual(pode(vendeEmbala,'producao.bipar'),true,'e bipa');
  igual(pode(vendeEmbala,'catalogo.ler'),true,'e simula');

  igual(pode(sessao('venda'),'producao.bipar'),false,'vendedor puro nao bipa');
  igual(pode(sessao('bancada'),'producao.bipar'),false,'cortador puro tambem nao');

  igual(sessao('embalagem','serralheria').setores.join(','),
    'serralheria,embalagem','dois setores saem na ordem da fabrica');
  igual(sessao('cadastros').setores.join(','),
    'serralheria,colecao,montagem,revisao,embalagem','e a chefia bipa os cinco');
}},

{nome:'o menu so oferece o que a pessoa alcanca', async executar({igual}){
  quem={id:2,nome:'Ze',permissoes:chavesDe('bancada')};
  const d=JSON.parse((await pedir(porta,'/sobmedida/api/eu')).corpo).dados;
  igual(d.telas.includes('/corte'),true,'ve o corte');
  igual(d.telas.includes('/cadastros'),false,'NAO ve cadastros');
  igual(d.permissoes.includes('sobra.descartar'),false,'e a lista dele nao tem o descarte');

  quem={id:5,nome:'Renato',permissoes:chavesDe('venda')};
  const v=JSON.parse((await pedir(porta,'/sobmedida/api/eu')).corpo).dados;
  igual(v.telas.includes('/simulador')&&v.telas.includes('/revendas'),true,'ve as duas dele');
  igual(v.telas.includes('/corte'),false,'e nao ve a bancada');
  await new Promise(ok=>servidor.close(ok));
}}

];

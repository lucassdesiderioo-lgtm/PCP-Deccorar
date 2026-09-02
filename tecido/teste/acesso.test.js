// ENTRADA UNICA — a area do PCP decide quem entra no sob medida.
//
// Estes casos substituem o antigo login_unico.test.js, que provava a ponte
// HTTP entre dois servidores. Nao ha mais ponte nem segundo servidor: o
// modulo monta dentro do PCP, e o que precisa ser provado agora e a
// TRADUCAO — area vira papel — e o PORTAO, que barra quem nao tem area.
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

module.exports=[

{nome:'sem area de sob medida, a pessoa NAO entra', executar({igual}){
  igual(acesso.papelDe({nome:'Ze',areas:['operador','carregamento']}),null,'revisor do ML nao entra');
  igual(acesso.papelDe({nome:'Ze',areas:[]}),null,'sem area nenhuma tambem nao');
  igual(acesso.papelDe(null),null,'sem sessao, ninguem');
  // Fechado por padrao — regra 4 do docs/CONTROLE-DE-ACESSO.md. Area nova no
  // PCP nao abre esta porta por acidente.
}},

{nome:'a area da bancada vira cortador; a de cadastros, diretor', executar({igual}){
  igual(acesso.papelDe({areas:['sobmedida']}),'cortador','bancada');
  igual(acesso.papelDe({areas:['sobmedida_adm']}),'diretor','chefia');
  igual(acesso.papelDe({areas:['admin']}),'diretor','o admin do PCP alcanca tudo');
  // Quem tem as duas fica com a maior: acumular area nunca pode TIRAR acesso.
  igual(acesso.papelDe({areas:['sobmedida','sobmedida_adm']}),'diretor','as duas juntas');
}},

{nome:'o cortador nao descarta sobra, e e por isso que o papel existe', executar({igual}){
  const {pode}=require('../nucleo/permissoes');
  const bancada=acesso.daSessaoDoPcp({id:7,nome:'Ze',areas:['sobmedida']});
  igual(pode(bancada,'sobra.criar'),true,'cadastra sobra');
  igual(pode(bancada,'plano.confirmar'),true,'confirma o plano de corte');
  igual(pode(bancada,'sobra.descartar'),false,'NAO descarta');
  igual(pode(bancada,'parametro.editar'),false,'NAO mexe no calculo');
  // Baixa de sobra sem trava e o furo classico de inventario. A area nova nao
  // pode ter afrouxado isso sem ninguem notar.
}},

{nome:'o nome vem do PCP, o papel e daqui', executar({igual}){
  const u=acesso.daSessaoDoPcp({id:3,nome:'Lucas',areas:['admin']});
  igual(u.nome,'Lucas','nome do PCP');
  igual(u.papel,'diretor','papel traduzido aqui');
  igual(u.via,'pcp','marcado como vindo de la');
  // A auditoria deste modulo grava o NOME. Sem esta traducao ela gravaria o
  // usuario do banco local, que nao existe mais.
}},

// ── O PORTAO, de verdade, por HTTP ───────────────────────────────────────

{nome:'quem tem area recebe a tela; quem nao tem recebe recado', async executar({igual}){
  const s=await subir(()=>quem);
  servidor=s.servidor; porta=s.porta;

  quem={id:1,nome:'Lucas',areas:['admin']};
  const bom=await pedir(porta,'/sobmedida');
  igual(bom.status,200,'diretor abre o inicio');

  quem={id:2,nome:'Ze',areas:['operador']};
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
  // Tela 302 e API 401 e a mesma regra da secao 10 do CLAUDE.md. Uma API que
  // redireciona devolve HTML no lugar de JSON e a tela quebra sem dizer por que.
}},

{nome:'a permissao e conferida POR TELA, nao so na porta de entrada', async executar({igual}){
  quem={id:2,nome:'Ze',areas:['sobmedida']};
  igual((await pedir(porta,'/sobmedida/corte')).status,200,'a bancada corta');
  igual((await pedir(porta,'/sobmedida/cadastros')).status,403,'mas nao cadastra');
  quem={id:1,nome:'Lucas',areas:['sobmedida_adm']};
  igual((await pedir(porta,'/sobmedida/cadastros')).status,200,'a chefia cadastra');
}},

{nome:'NENHUM .html sai do disco por caminho direto', async executar({igual}){
  quem={id:1,nome:'Lucas',areas:['admin']};
  const r=await pedir(porta,'/sobmedida/telas/cadastros.html');
  igual(r.status,403,'nem para o diretor');
  // E a armadilha #3 do CLAUDE.md por dentro deste modulo: o static existe
  // (serve base.css e ui.js), e sem esta guarda ele entregaria a tela por um
  // caminho que ninguem declarou — e onde permissao nenhuma e conferida.
}},

{nome:'o TEMA vem do servidor: bancada clara, escritorio escuro', async executar({igual}){
  quem={id:1,nome:'Lucas',areas:['admin']};
  const corte=await pedir(porta,'/sobmedida/corte');
  const cad=await pedir(porta,'/sobmedida/cadastros');
  igual(corte.corpo.includes('data-contexto="operacao"'),true,'corte e de bancada');
  igual(cad.corpo.includes('data-contexto="admin"'),true,'cadastros e de escritorio');
  // Tela escura na bancada, sob a lampada de inspecao, vira espelho — o
  // operador enxerga o proprio reflexo em vez da medida (DESIGN.md secao 1).
  // Deixar cada arquivo declarar o proprio tema garante que, uma hora, uma
  // tela nova nasca errada.
}},

{nome:'O CONTRATO COM O PCP: as duas areas existem la, e viram sombra', executar({igual}){
  const fs=require('fs'), path=require('path');
  const raiz=path.join(__dirname,'..','..');
  const perms=fs.readFileSync(path.join(raiz,'permissoes.js'),'utf8');
  const acessoPcp=fs.readFileSync(path.join(raiz,'acesso.js'),'utf8');

  // 1. As chaves existem no catalogo do PCP — sem elas nao ha caixinha para o
  //    admin marcar, e a liberacao nao tem por onde ser feita.
  igual(perms.includes("chave:'sobmedida.cortar'"),true,'a chave da bancada esta declarada');
  igual(perms.includes("chave:'sobmedida.cadastrar'"),true,'a da chefia tambem');

  // 2. E o PERM_AREA as devolve para `usuarios.areas`. ESTA E A LINHA QUE
  //    QUASE FICOU DE FORA, e o modo de falhar dela e o pior possivel: no
  //    modelo novo do PCP a coluna `areas` virou SOMBRA — recalculada a cada
  //    mudanca de setor a partir deste mapa. Faltando aqui, o admin marca o
  //    acesso, a tela confirma, e a area e apagada no salvamento seguinte.
  //    O portao deste modulo le `areas`: o acesso sumiria sozinho, sem erro.
  igual(acessoPcp.includes("['sobmedida.cortar','"+acesso.AREA_BANCADA+"']"),true,
    'sobmedida.cortar -> '+acesso.AREA_BANCADA);
  igual(acessoPcp.includes("['sobmedida.cadastrar','"+acesso.AREA_CHEFIA+"']"),true,
    'sobmedida.cadastrar -> '+acesso.AREA_CHEFIA);

  // 3. E ha um setor pronto, para o admin liberar em um clique em vez de
  //    caçar duas caixinhas numa lista de 44.
  igual(acessoPcp.includes("Sob medida / Bancada"),true,'setor da bancada semeado');
  igual(acessoPcp.includes("Sob medida / Cadastros"),true,'setor da chefia semeado');
}},

{nome:'o menu so oferece o que a pessoa alcanca', async executar({igual}){
  quem={id:2,nome:'Ze',areas:['sobmedida']};
  const r=await pedir(porta,'/sobmedida/api/eu');
  const d=JSON.parse(r.corpo).dados;
  igual(d.papel,'cortador','papel');
  igual(d.telas.includes('/corte'),true,'ve o corte');
  igual(d.telas.includes('/cadastros'),false,'NAO ve cadastros');
  // Botao que leva a porta fechada ensina o operador a nao tentar: quem bate
  // em "sem permissao" tres vezes para de clicar na quarta, mesmo quando ja
  // podia. Por isso o menu se monta com a MESMA conta do portao.
  await new Promise(ok=>servidor.close(ok));
}}

];

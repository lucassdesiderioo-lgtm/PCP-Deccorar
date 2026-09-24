// O MODULO SOB MEDIDA DENTRO DO PCP.
//
// Ate 02/09/2026 este modulo era um segundo servidor: outra porta, outro PIN,
// outro cadastro de pessoas. Custou tres defeitos em producao no primeiro dia
// (o iframe do admin, a porta fechada no firewall e — o pior — um beco sem
// saida: liberar alguem exigia uma sessao que so existia depois de liberado).
//
// Agora ele MONTA dentro do PCP, sob '/sobmedida'. O que muda de verdade:
//
//   entrada     um PIN so, na tela que a equipe ja conhece
//   liberacao   uma area em Admin -> Acessos, junto de todas as outras
//   bloqueio    desligar a pessoa no PCP tira os dois lados de uma vez
//   deploy      um processo, um pm2, uma porta
//
// O que NAO muda, de proposito: banco proprio (tecido.db), dominio proprio,
// migracoes numeradas, testes proprios. A juncao e de PORTA, nao de miolo —
// misturar os dois esquemas seria trocar um problema de acesso por um de
// dados, e o schema deste modulo e o unico do projeto que se reconstroi
// sozinho num banco novo.
const path=require('path');
const express=require('express');

const db=require('./nucleo/db');
const schema=require('./nucleo/schema');
const registro=require('./nucleo/registro');
const acesso=require('./nucleo/acesso');
const {TELAS}=require('./nucleo/telas');
const {pode}=require('./nucleo/permissoes');
const pessoas=require('./nucleo/pessoas');
const materiais=require('./nucleo/materiais');

/* A LISTA DE MODULOS DE ROTA, e ela e EXPORTADA de proposito.
   O `teste/acesso_operador.js` conferia "toda rota declara permissao" por uma
   copia escrita a mao desta lista — e a copia ja tinha envelhecido: './rotas/
   planos' nao estava nela, entao as rotas do plano de corte nao eram
   conferidas por ninguem. E a mesma doenca da poda por lista literal e da
   TODAS_ROTAS do PCP (CLAUDE.md secao 10, armadilha #29): lista mantida a mao
   nao acompanha o codigo, e o furo e silencioso dos dois lados.
   Agora ha uma lista so, e ela e esta. */
const MODULOS=[
  './rotas/eu','./rotas/cadastros','./rotas/parametros','./rotas/sobras',
  './rotas/rolos','./rotas/planos','./rotas/painel','./rotas/catalogo_sm',
  './rotas/revenda','./rotas/pedido','./rotas/etiqueta_producao'
];

// A pessoa esta logada no PCP mas ninguem marcou a area dela. A mensagem diz
// ONDE se resolve: sem isso ela abriria chamado, ou pior, tentaria um segundo
// PIN que nao existe mais.
const semAcesso=(res,nome)=>res.status(403).send(
  '<body style="font-family:system-ui;background:#0e1217;color:#eef1f6;padding:40px;max-width:34em">'+
  '<h2 style="color:#ffb800">Sob medida — acesso nao liberado</h2>'+
  '<p><b>'+String(nome||'').replace(/[<>&]/g,'')+'</b> esta logado, mas nao tem area de sob medida.</p>'+
  '<p>Quem libera e o admin, em <b>Admin &rarr; Acessos</b>, marcando<br>'+
  '<b>Sob medida — bancada</b> (corte e sobras), <b>Sob medida — cadastros</b><br>'+
  'ou <b>Sob medida — venda</b> (simulador, catalogo e revendas).</p>'+
  '<p><a href="/" style="color:#ffb800">Voltar</a></p></body>');

const negaTela=res=>res.status(403).send(
  '<body style="font-family:system-ui;background:#0e1217;color:#eef1f6;padding:40px">'+
  '<h2>Sem permissao</h2><p>Seu acesso ao sob medida nao alcanca esta tela.</p>'+
  '<p><a href="/sobmedida" style="color:#ffb800">Voltar ao sob medida</a></p></body>');

// O TEMA VEM DO SERVIDOR, nao do arquivo.
//
// `telas.js` diz se a tela e de bancada (clara) ou de escritorio (escura), e
// aqui esse dado e carimbado no <html> antes de a pagina sair. Deixar cada
// arquivo declarar o proprio tema garantiria que, mais cedo ou mais tarde,
// uma tela nova nascesse no tema errado — e tela escura na bancada, sob a
// lampada de inspecao, vira espelho (docs/DESIGN.md secao 1).
const fs=require('fs');
const cache=new Map();
function servir(tela){
  const arq=path.join(__dirname,'public',tela.arquivo);
  const chave=arq+'|'+tela.contexto;
  let html=cache.get(chave);
  if(html===undefined){
    html=fs.readFileSync(arq,'utf8')
      .replace('<html lang="pt-BR">','<html lang="pt-BR" data-contexto="'+tela.contexto+'">');
    if(process.env.NODE_ENV!=='dev') cache.set(chave,html);
  }
  return html;
}

// `prefixo` e parametro e nao constante porque os testes montam o modulo num
// app de mentira para provar a traducao de area sem subir o PCP inteiro.
/* `opcoes.pessoas` e A PORTA por onde a lista de gente do PCP entra neste
   modulo — ela alimenta a escolha do vendedor da carteira (fase 2). Quem a
   liga e o server.js, e o modulo nao guarda cadastro de pessoas proprio: dois
   cadastros de gente sao dois lugares para lembrar de desligar alguem, e foi
   por isso que este modulo deixou de ter o dele em 02/09/2026.

   Sem a porta o modulo sobe igual — so a escolha do vendedor e que RECUSA,
   dizendo onde se liga. Lista vazia em silencio faria a tela afirmar que a
   fabrica nao tem ninguem. */
function montar(app, prefixo, opcoes){
  const pre=prefixo||'/sobmedida';
  pessoas.ligar(opcoes&&opcoes.pessoas);
  /* `opcoes.materiais` e a porta do material de compra do PCP (fase 4-C): o
     tubo da persiana sob medida e o MESMO da medida padrao, e Compras e um
     so. Ela entra para o cadastro poder apontar; o caminho de VOLTA e o
     `consumoDeMaterial` devolvido la embaixo. */
  materiais.ligar(opcoes&&opcoes.materiais);
  schema.aplicar(db);

  // ── O PORTAO ──────────────────────────────────────────────────────────
  // Roda ANTES das rotas e do static deste modulo. Traduz o usuario do PCP
  // (areas) no usuario deste dominio (papel), e barra quem nao tem area.
  //
  // Ele NAO autentica: quem faz isso e o auth.js do PCP, que ja rodou. Aqui
  // so se decide o que a pessoa pode. Autenticacao la, autorizacao aqui —
  // com a diferenca de que agora as duas moram no mesmo processo, e nao ha
  // ponte HTTP nenhuma para cair.
  app.use(pre,(req,res,next)=>{
    const doPcp=req.usuario;
    if(!doPcp) return req.path.startsWith('/api/')
      ? res.status(401).json({ok:false,motivo:'nao_logado',mensagem:'Sessao expirada. Entre de novo.'})
      : res.redirect('/login?r='+encodeURIComponent(req.originalUrl));

    const u=acesso.daSessaoDoPcp(doPcp);
    if(!u) return req.path.startsWith('/api/')
      ? res.status(403).json({ok:false,motivo:'sem_area',
          mensagem:'Voce nao tem area de sob medida. Peca ao admin em Admin -> Acessos.'})
      : semAcesso(res,doPcp.nome);

    req.usuario=u;

    // Nenhum .html sai do disco por caminho direto — a armadilha #3 do
    // CLAUDE.md por dentro deste modulo. As telas so abrem pelo caminho
    // declarado em TELAS, e e la que a permissao e conferida.
    if(req.path.endsWith('.html')) return negaTela(res);

    const tela=TELAS[req.path];
    if(tela){
      if(!pode(u,tela.permissao)) return negaTela(res);
      return res.type('html').send(servir(tela));
    }
    next();
  });

  registro.montar(app,db,MODULOS.map(m=>require(m)),pre);

  app.use(pre,express.static(path.join(__dirname,'public')));

  // Criterio 13 da secao 10: a soma dos movimentos tem que dar o saldo de cada
  // rolo. Nao trava o boot — reclama alto no log.
  try{ require('./dominio/rolo').conferirSaldos(); }catch(e){
    console.error('[sobmedida] conferencia de saldos falhou:',e.message);
  }

  console.log('[sobmedida] montado em '+pre+' — banco '+db.arquivo);

  /* ── O CAMINHO DE VOLTA (fase 4-C) ──────────────────────────────────────
     Quanto de cada material do PCP ja esta vendido aqui e ainda nao foi
     produzido. Quem a recebe e o `sobmedida_material.js` do PCP, e e ele que
     decide o que fazer quando ela falha — a lista de compras nao pode cair
     porque o tecido.db tropecou, mas tambem nao pode calar sobre isso.

     Sai como RETORNO do montar(), e nao como um require direto do outro
     lado: este modulo sobe dentro de um try/catch justamente para que uma
     falha aqui nao derrube a expedicao (o comentario do topo). Um require
     desfaria isso em silencio. */
  return { consumoDeMaterial: ()=>require('./dominio/consumo').materialDeCompra() };
}

module.exports={montar, MODULOS, AREAS_PCP:acesso.AREAS_PCP, PREFIXO:'/sobmedida'};

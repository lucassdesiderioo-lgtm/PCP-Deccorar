// A MOLDURA COMPARTILHADA: barra de sessao em cima, barra de atalhos embaixo.
//
// Existe pelo mesmo motivo do `public/nav.js` do PCP, e imita o gesto dele de
// proposito: a pessoa que trabalha nas duas operacoes no mesmo dia acha a
// navegacao no lugar onde ela sempre esteve. Um modulo com navegacao propria
// e um modulo que a equipe le como "outro sistema" — foi exatamente o que
// aconteceu na primeira versao.
//
// O MENU SE MONTA COM O QUE A PESSOA PODE. Botao que leva a porta fechada
// ensina o operador a nao tentar: quem bate em "sem permissao" tres vezes
// para de clicar na quarta, mesmo quando ja podia. Por isso a lista de telas
// vem do servidor (`/api/eu`), que a calcula com as mesmas chaves do portao.
(function(){
'use strict';

var BASE='/sobmedida';
// ⚠️ TELA QUE NAO ESTA NESTES DOIS MAPAS NASCE INVISIVEL. O rodape monta
// `ORDEM.filter(...)`, entao uma tela declarada em nucleo/telas.js e liberada
// pela permissao, mas esquecida aqui, simplesmente nao tem botao — sem erro,
// sem log, e so quem souber o endereco de cor chega nela. E a armadilha #13
// do CLAUDE.md por mais uma porta: a ponta que some em silencio e sempre a
// ultima. Tela nova pede a linha aqui, no mesmo commit.
var NOMES={'/':'Inicio','/corte':'Plano de corte','/sobras':'Sobras',
           '/rolos':'Rolos','/etiquetas':'Etiquetas','/cadastros':'Cadastros',
           '/painel':'Painel','/simulador':'Simulador','/catalogo':'Catalogo',
           '/revendas':'Revendas','/pedidos':'Pedidos','/producao':'Produção',
           '/kanban':'Quadro','/indicadores':'Indicadores',
           '/financeiro':'Financeiro'};
// A ordem do rodape segue o FLUXO da bancada, nao o alfabeto: o rolo entra,
// vira plano de corte, sobra o retalho, a sobra ganha etiqueta.
var ORDEM=['/','/bancada','/corte','/producao','/rolos','/sobras','/etiquetas','/simulador','/pedidos','/kanban','/indicadores','/revendas','/financeiro','/painel','/cadastros','/catalogo'];

var aqui=location.pathname.replace(/\/$/,'')||BASE;
var rel=aqui.indexOf(BASE)===0 ? (aqui.slice(BASE.length)||'/') : '/';

// ── Ajuste de fonte, so na bancada ────────────────────────────────────────
// Tres niveis, salvos POR APARELHO: o tablet da bancada pode ficar grande sem
// afetar o desktop do escritorio. Mesma mecanica (zoom no <html>) e mesma
// chave de leitura da secao 3 do docs/DESIGN.md.
var operacao=document.documentElement.getAttribute('data-contexto')!=='admin';
var FONTE=(function(){
  var Z=[1,1.15,1.30], R=['A','A+','A++'];
  function nivel(){ var v; try{ v=parseInt(localStorage.getItem('sm_fonte')||'0',10); }catch(e){ v=0; }
                    return (v>=0&&v<=2)?v:0; }
  function aplicar(){ if(operacao){ try{ document.documentElement.style.zoom=Z[nivel()]; }catch(e){} } }
  aplicar();
  return {nivel:nivel, rotulo:function(){ return R[nivel()]; },
          proximo:function(){ try{ localStorage.setItem('sm_fonte',String((nivel()+1)%3)); }catch(e){} aplicar(); }};
})();

function elo(caminho,atual){
  var a=document.createElement('a');
  a.href=BASE+(caminho==='/'?'':caminho);
  a.textContent=NOMES[caminho]||caminho;
  if(caminho===atual) a.setAttribute('aria-current','page');
  return a;
}

function rodape(telas){
  var bar=document.createElement('nav');
  bar.className='rodape';
  bar.setAttribute('aria-label','Atalhos do sob medida');
  ORDEM.filter(function(c){ return telas.indexOf(c)>=0; })
       .forEach(function(c){ bar.appendChild(elo(c,rel)); });
  // A volta para a medida padrao SAIU daqui (spec NAVEGACAO-E-LINGUAGEM,
  // fase 1): ela apontava para '/', que e o admin, e quem nao tem admin caia
  // em "sem permissao". Ela mora agora na barra de cima, com destino calculado.
  document.body.appendChild(bar);
}

function sessao(eu,dest){
  var b=document.createElement('div');
  b.className='sessao';

  var setor=document.createElement('span');
  setor.className='setor'; setor.textContent='SOB MEDIDA';
  b.appendChild(setor);

  var quem=document.createElement('span');
  quem.innerHTML='<b>'+String(eu.nome||'').replace(/[<>&]/g,'')+'</b> · '+eu.papel;
  b.appendChild(quem);

  b.appendChild(Object.assign(document.createElement('span'),{className:'espaco'}));

  if(operacao){
    var f=document.createElement('button');
    f.textContent='Fonte '+FONTE.rotulo();
    f.title='Aumentar a letra desta tela, so neste aparelho';
    f.onclick=function(){ FONTE.proximo(); f.textContent='Fonte '+FONTE.rotulo(); };
    b.appendChild(f);
  }

  // A TROCA DE OPERACAO (spec NAVEGACAO-E-LINGUAGEM, fase 1): o atalho
  // direto so para quem alcanca as duas, e "Trocar setor" sempre. Mesmo lugar
  // e mesmo visual do bloco no public/nav.js. O destino vem do servidor
  // (destino.js, o dono unico) — a primeira tela da medida padrao que a
  // pessoa alcanca, nunca o admin para todo mundo.
  if(dest&&dest.duas&&dest.padrao){
    var at=document.createElement('a');
    at.className='trocaOp atalho'; at.href=dest.padrao; at.textContent='Medida padrão →';
    b.appendChild(at);
  }
  var trocar=document.createElement('a');
  trocar.className='trocaOp'; trocar.href='/setor'; trocar.textContent='Trocar setor';
  b.appendChild(trocar);

  // Sair e do PCP: a sessao e uma so, e sair "so do sob medida" nao existe
  // mais — era justamente a confusao dos dois PINs.
  var sair=document.createElement('button');
  sair.textContent='Sair';
  sair.onclick=function(){
    fetch('/api/auth/logout',{method:'POST',credentials:'same-origin'})
      .then(function(){ location.href='/login'; });
  };
  b.appendChild(sair);

  document.body.insertBefore(b,document.body.firstChild);
}

fetch(BASE+'/api/eu',{credentials:'same-origin'})
  .then(function(r){ return r.json(); })
  .then(function(j){
    if(!j||!j.ok) return;
    // O destino da medida padrao e conta do PCP, nao do modulo: vem do
    // /api/auth/eu. Se falhar, a barra sai so com "Trocar setor".
    fetch('/api/auth/eu',{credentials:'same-origin'})
      .then(function(r){ return r.json(); })
      .catch(function(){ return {}; })
      .then(function(u){
        sessao(j.dados,(u&&u.destino)||null);
        rodape(j.dados.telas||[]);
      });
  })
  .catch(function(){ /* moldura e conforto: a tela funciona sem ela */ });
})();

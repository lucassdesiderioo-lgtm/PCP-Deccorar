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
// ⚠️ O RODAPÉ DE ATALHOS SAIU (spec ORGANIZACAO-DO-SISTEMA, fase 3, menu
// único, 10/11/2026), e com ele as listas NOMES e ORDEM. O sob medida usa o
// mesmo ☰ Menu da medida padrão: as telas vêm do `/api/telas/minhas` do PCP
// (as das duas operações, pela mesma conta dos portões) e o desenho é o
// `/menu_telas.js`, o mesmo arquivo — duas cópias divergiriam. Tela nova do
// sob medida entra no menu pelo mapa (`nucleo/telas.js`, com módulo e bloco),
// e não por uma lista daqui.
var aqui=location.pathname.replace(/\/$/,'')||BASE;

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

// ── O ☰ Menu ──────────────────────────────────────────────────────────────
var MENU={telas:null, painel:null, botao:null};
function desenharMenu(){
  if(MENU.painel && MENU.telas && typeof MENU_TELAS!=='undefined')
    MENU.painel.innerHTML=MENU_TELAS.html(MENU.telas, aqui);
  // R-VAL: a tela com dinheiro que a pessoa não vê diz isso uma vez, debaixo do menu
  if(MENU.painel && MENU.telas && typeof MENU_TELAS!=='undefined' && MENU_TELAS.marcarSemValor)
    MENU_TELAS.marcarSemValor(MENU.telas, aqui, MENU.painel);
  // a etiqueta vermelha das pendências (PENDENCIAS-NO-MENU fase 2): o desenho mora no menu_telas.js
  if(MENU.painel && MENU.telas && typeof MENU_TELAS!=='undefined' && MENU_TELAS.pendencias)
    MENU_TELAS.pendencias(MENU.painel, MENU.botao);
}
function carregarMenu(){
  if(typeof MENU_TELAS==='undefined'){
    var sc=document.createElement('script'); sc.src='/menu_telas.js'; sc.onload=desenharMenu;
    // sem o desenho, o menu diz que nao carregou — e nao fica em "carregando…" para sempre
    sc.onerror=function(){ if(MENU.painel) MENU.painel.innerHTML='<div class="mnVazio">Não deu para carregar o menu. Recarregue a página.</div>'; };
    document.head.appendChild(sc);
  }
  fetch('/api/telas/minhas',{credentials:'same-origin'})
    .then(function(r){ return r.json(); })
    .then(function(d){ MENU.telas=d||{}; desenharMenu(); })
    .catch(function(){ if(MENU.painel) MENU.painel.innerHTML='<div class="mnVazio">Não deu para carregar as telas.</div>'; });
}

function sessao(eu,dest){
  var b=document.createElement('div');
  b.className='sessao';

  var setor=document.createElement('span');
  setor.className='setor'; setor.textContent='SOB MEDIDA';
  b.appendChild(setor);

  var quem=document.createElement('span');
  quem.innerHTML='<b>'+String(eu.nome||'').replace(/[<>&]/g,'')+'</b>';
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
    // A troca de setor fica registrada no PCP (QUEM-FEZ-E-REVISAO fase 6).
    at.addEventListener('click',function(){ try{ fetch('/api/auth/setor',{method:'POST',keepalive:true,credentials:'same-origin',
      headers:{'content-type':'application/json'},body:JSON.stringify({para:'padrao'})}).catch(function(){}); }catch(e){} });
    b.appendChild(at);
  }
  // O ☰ Menu (menu único): o mesmo da medida padrão, ao lado do "Trocar setor".
  var bm=document.createElement('button');
  bm.className='menuBt'; bm.textContent='☰ Menu';
  bm.setAttribute('aria-expanded','false'); bm.setAttribute('aria-controls','menuTelas');
  b.appendChild(bm);

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

  var pn=document.createElement('nav');
  pn.id='menuTelas'; pn.className='menuTelas'; pn.setAttribute('aria-label','Telas');
  pn.style.display='none'; pn.innerHTML='<div class="mnVazio">carregando…</div>';
  document.body.insertBefore(pn,b.nextSibling||null);
  MENU.painel=pn; MENU.botao=bm;
  bm.onclick=function(){ var ab=pn.style.display==='none'; pn.style.display=ab?'flex':'none'; bm.setAttribute('aria-expanded',ab?'true':'false'); };
  desenharMenu();
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
        carregarMenu();
      });
  })
  .catch(function(){ /* moldura e conforto: a tela funciona sem ela */ });
})();
/* A caixinha "Abrir em Pendências" (spec PENDENCIAS-NO-MENU, fase 3): o mesmo
   pendencias_aviso.js da medida padrão — a ação do sob medida que cria
   pendência responde `pendencias`, e a caixinha aparece aqui também. */
(function(){
  if(typeof window!=='undefined' && window.__pendCaixa) return;
  var sc=document.createElement('script'); sc.src='/pendencias_aviso.js'; document.head.appendChild(sc);
})();

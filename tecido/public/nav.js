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
var NOMES={'/':'Inicio','/corte':'Plano de corte','/sobras':'Sobras',
           '/rolos':'Rolos','/etiquetas':'Etiquetas','/cadastros':'Cadastros',
           '/painel':'Painel'};
// A ordem do rodape segue o FLUXO da bancada, nao o alfabeto: o rolo entra,
// vira plano de corte, sobra o retalho, a sobra ganha etiqueta.
var ORDEM=['/','/corte','/rolos','/sobras','/etiquetas','/painel','/cadastros'];

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
  // A volta para a outra operacao. Fica no rodape, junto dos atalhos, porque
  // e o mesmo gesto: mudar de tela. E escrito por extenso — "medida padrao"
  // e o nome que a equipe usa, nao "PCP".
  var v=document.createElement('a');
  v.className='volta'; v.href='/'; v.textContent='← Medida padrao';
  bar.appendChild(v);
  document.body.appendChild(bar);
}

function sessao(eu){
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

  var trocar=document.createElement('button');
  trocar.textContent='Trocar setor';
  trocar.onclick=function(){ location.href='/setor'; };
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
    sessao(j.dados);
    rodape(j.dados.telas||[]);
  })
  .catch(function(){ /* moldura e conforto: a tela funciona sem ela */ });
})();

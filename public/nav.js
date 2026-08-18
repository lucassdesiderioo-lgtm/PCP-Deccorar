/* Chrome (rodape de atalhos + barra de sessao) ciente do tema.
   Operacao usa fundo CLARO (DESIGN secao 2); admin/dashboards seguem escuros.
   Detecta pela luminancia do fundo real da pagina, entao adapta sozinho. */
var CH=(function(){
  var light=false;
  try{
    var bg=getComputedStyle(document.body).backgroundColor||'';
    var m=bg.match(/(\d+)[,\s]+(\d+)[,\s]+(\d+)/);
    if(m){ var lum=0.299*+m[1]+0.587*+m[2]+0.114*+m[3]; light=lum>140; }
  }catch(e){}
  return light
    ? {light:true, barBg:'#f4f6f8',barLine:'#d8dee6',off:'#5a6472',actBg:'#b26a00',actTx:'#ffffff',
       planBg:'#1565c0',planTx:'#ffffff',
       sBg:'#f4f6f8',sLine:'#d8dee6',sTx:'#5a6472',sName:'#1a1d23',sBtn:'#b26a00'}
    : {light:false, barBg:'#0b0f14',barLine:'#262d37',off:'#8b97a5',actBg:'#ffb800',actTx:'#1a1300',
       planBg:'#4493f8',planTx:'#04121f',
       sBg:'#0b0e13',sLine:'#2a2f3a',sTx:'#8b97a5',sName:'#eef1f6',sBtn:'#f0b429'};
})();

/* Ajuste de fonte A+/A- por aparelho (DESIGN secao 3) — so na operacao (fundo
   claro). 3 niveis: normal, +15%, +30%. Escala o layout inteiro via zoom no
   <html> (as telas usam px; zoom reflui e funciona no Safari do iPad). A escolha
   fica salva em localStorage, por aparelho. */
var FONT=(function(){
  var Z=[1, 1.15, 1.30], LB=['A', 'A+', 'A++'];
  function get(){ var v; try{ v=parseInt(localStorage.getItem('op_font')||'0',10); }catch(e){ v=0; } return (v>=0&&v<=2)?v:0; }
  function apply(){ if(CH.light){ try{ document.documentElement.style.zoom=Z[get()]; }catch(e){} } }
  apply();
  return { get:get, label:function(){ return LB[get()]; },
    set:function(v){ v=Math.max(0,Math.min(2,v)); try{ localStorage.setItem('op_font',String(v)); }catch(e){} apply(); } };
})();

(function(){
  // Saíram do menu (rotas seguem vivas por URL):
  //  '/expedicao' (Subir PDFs) -> upload agora fica na Etiqueta de Venda.
  //  '/necessidade' (ABC) -> absorvida pelo Planejamento (mesmo cálculo + planilha).
  var MAP={ '1':'/painel','2':'/operador','3':'/montagem','5':'/embalagem','6':'/carregamento','7':'/','8':'/relatorios' };
  var NAMES={ '/painel':'Painel','/operador':'Revisão','/montagem':'Embalagem','/embalagem':'Etiqueta Venda','/carregamento':'Carregamento','/':'Admin','/relatorios':'Relatórios' };
  var cur=location.pathname.replace(/\/$/,'')||'/';
  // barra de atalhos no rodapé
  var bar=document.createElement('div');
  bar.style.cssText='position:fixed;left:0;right:0;bottom:0;background:'+CH.barBg+';border-top:1px solid '+CH.barLine+';display:flex;gap:2px;justify-content:center;padding:6px;z-index:9999;flex-wrap:wrap;font-family:system-ui,sans-serif';
  var html='';
  for(var k in MAP){ var p=MAP[k]; var on=(p===cur||(p==='/'&&cur==='/'));
    html+='<a href="'+p+'" style="text-decoration:none;font-size:12px;padding:6px 12px;border-radius:7px;color:'+(on?CH.actTx:CH.off)+';background:'+(on?CH.actBg:'transparent')+';font-weight:'+(on?'700':'500')+'"><b>Alt+'+k+'</b> '+NAMES[p]+'</a>';
  }
  // Planejamento (Fase 1/2/4) — sem atalho Alt porque 1..9 ja estao ocupados
  var onPlan=(cur==='/planejamento');
  html+='<a href="/planejamento" style="text-decoration:none;font-size:12px;padding:6px 12px;border-radius:7px;color:'+(onPlan?CH.planTx:CH.off)+';background:'+(onPlan?CH.planBg:'transparent')+';font-weight:'+(onPlan?'700':'500')+'">Planejamento</a>';
  bar.innerHTML=html;
  document.body.appendChild(bar);
  document.body.style.paddingBottom='52px';
  // atalhos de teclado
  document.addEventListener('keydown',function(e){
    if(e.altKey && !e.ctrlKey && !e.metaKey && MAP[e.key]){
      e.preventDefault();
      if((MAP[e.key]===cur)||(MAP[e.key]==='/'&&cur==='/')) return;
      location.href=MAP[e.key];
    }
  });
})();

/* ---- sessao: quem esta logado + sair (botao e Alt+0) ---- */
(function(){
  if(location.pathname.indexOf('/login')===0) return;

  var css=document.createElement('style');
  css.textContent=
    '#sessBar{position:sticky;top:0;z-index:9999;display:flex;align-items:center;justify-content:flex-end;'+
    'gap:10px;background:'+CH.sBg+';border-bottom:1px solid '+CH.sLine+';'+
    'padding:6px 14px;font:600 13px system-ui,-apple-system,Segoe UI,Roboto,sans-serif;color:'+CH.sTx+'}'+
    '#sessBar b{font-weight:700}'+
    '#sessSair{background:transparent;color:'+CH.sBtn+';border:1px solid '+CH.sBtn+';border-radius:8px;'+
    'padding:6px 14px;font:700 13px system-ui;cursor:pointer;min-height:34px}'+
    '#sessSair:active{opacity:.75}'+
    '#fadj{margin-right:auto;display:flex;gap:8px;align-items:center}'+
    '#fadj .fbtn{min-width:46px;min-height:34px;border:1px solid '+CH.sBtn+';color:'+CH.sBtn+';'+
    'background:transparent;border-radius:8px;font:800 15px system-ui;cursor:pointer}'+
    '#fadj .fbtn:active{opacity:.7}'+
    '#flab{color:'+CH.sTx+';min-width:28px;text-align:center;font-weight:800}'+
    '@media print{#sessBar{display:none}}';
  document.head.appendChild(css);

  function sair(){
    if(!confirm('Sair do sistema?')) return;
    fetch('/api/auth/logout',{method:'POST'}).then(function(){ location.href='/login'; });
  }

  fetch('/api/auth/eu').then(function(r){return r.json();}).then(function(u){
    if(!u.logado) return;
    var d=document.createElement('div');
    d.id='sessBar';
    var fadj = CH.light ? '<div id="fadj"><button class="fbtn" data-fd="-1" aria-label="Diminuir a fonte">A−</button>'+
      '<b id="flab">'+FONT.label()+'</b><button class="fbtn" data-fd="1" aria-label="Aumentar a fonte">A+</button></div>' : '';
    d.innerHTML=fadj+'<span><b style="color:'+CH.sName+'">'+u.nome+'</b></span><button id="sessSair">Sair</button>';
    document.body.insertBefore(d, document.body.firstChild);
    document.getElementById('sessSair').onclick=sair;
    var fa=document.getElementById('fadj');
    if(fa){ fa.addEventListener('click',function(e){ var btn=e.target.closest('[data-fd]'); if(!btn) return;
      FONT.set(FONT.get()+ (+btn.getAttribute('data-fd')));
      var l=document.getElementById('flab'); if(l) l.textContent=FONT.label(); }); }
  });

  document.addEventListener('keydown',function(e){
    if(e.altKey && !e.ctrlKey && !e.metaKey && (e.key==='0'||e.code==='Digit0')){
      e.preventDefault(); sair();
    }
  });
})();

/* ---- tarja de modo teste (amarela em qualquer tema) ---- */
(function(){
  if(location.pathname.indexOf('/login')===0) return;
  function pinta(){
    fetch('/api/teste').then(function(r){return r.json();}).then(function(t){
      var el=document.getElementById('tstBar');
      if(!t.ativo){ if(el) el.remove(); document.body.style.paddingTop=''; return; }
      if(!el){
        el=document.createElement('div'); el.id='tstBar';
        el.style.cssText='position:fixed;top:0;left:0;right:0;z-index:10000;background:#f0b429;'+
          'color:#12141a;text-align:center;font:800 13px system-ui;padding:7px;letter-spacing:.5px';
        el.textContent='MODO TESTE — nada aqui conta como produção real';
        document.body.appendChild(el);
      }
    }).catch(function(){});
  }
  pinta(); setInterval(pinta,10000);
})();

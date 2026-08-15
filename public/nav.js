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
    ? {barBg:'#f4f6f8',barLine:'#d8dee6',off:'#5a6472',actBg:'#b26a00',actTx:'#ffffff',
       planBg:'#1565c0',planTx:'#ffffff',
       sBg:'#f4f6f8',sLine:'#d8dee6',sTx:'#5a6472',sName:'#1a1d23',sBtn:'#b26a00'}
    : {barBg:'#0b0f14',barLine:'#262d37',off:'#8b97a5',actBg:'#ffb800',actTx:'#1a1300',
       planBg:'#4493f8',planTx:'#04121f',
       sBg:'#0b0e13',sLine:'#2a2f3a',sTx:'#8b97a5',sName:'#eef1f6',sBtn:'#f0b429'};
})();

(function(){
  var MAP={ '1':'/painel','2':'/operador','3':'/montagem','4':'/expedicao','5':'/embalagem','6':'/carregamento','7':'/','8':'/relatorios','9':'/necessidade' };
  var NAMES={ '/painel':'Painel','/operador':'Revisão','/montagem':'Embalagem','/embalagem':'Etiqueta Venda','/expedicao':'Subir PDFs','/carregamento':'Carregamento','/':'Admin','/relatorios':'Relatórios','/necessidade':'Necessidade' };
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
    d.innerHTML='<span><b style="color:'+CH.sName+'">'+u.nome+'</b></span><button id="sessSair">Sair</button>';
    document.body.insertBefore(d, document.body.firstChild);
    document.getElementById('sessSair').onclick=sair;
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

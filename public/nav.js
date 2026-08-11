(function(){
  var MAP={ '1':'/painel','2':'/operador','3':'/montagem','4':'/embalagem','5':'/carregamento','6':'/','7':'/relatorios','8':'/necessidade' };
  var NAMES={ '/painel':'Painel','/operador':'Revisão','/montagem':'Montagem','/embalagem':'Expedição','/carregamento':'Carregamento','/':'Admin','/relatorios':'Relatórios','/necessidade':'Necessidade' };
  var cur=location.pathname.replace(/\/$/,'')||'/';
  // barra de atalhos no rodapé
  var bar=document.createElement('div');
  bar.style.cssText='position:fixed;left:0;right:0;bottom:0;background:#0b0f14;border-top:1px solid #262d37;display:flex;gap:2px;justify-content:center;padding:6px;z-index:9999;flex-wrap:wrap;font-family:system-ui,sans-serif';
  var html='';
  for(var k in MAP){ var p=MAP[k]; var on=(p===cur||(p==='/'&&cur==='/'));
    html+='<a href="'+p+'" style="text-decoration:none;font-size:12px;padding:6px 12px;border-radius:7px;color:'+(on?'#1a1300':'#8b97a5')+';background:'+(on?'#ffb800':'transparent')+';font-weight:'+(on?'700':'500')+'"><b>Alt+'+k+'</b> '+NAMES[p]+'</a>';
  }
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
    '#sessBar{position:fixed;top:10px;right:12px;z-index:9999;display:flex;align-items:center;'+
    'gap:10px;background:rgba(28,31,40,.94);border:1px solid #2a2f3a;border-radius:999px;'+
    'padding:7px 8px 7px 15px;font:600 14px system-ui,-apple-system,Segoe UI,Roboto,sans-serif;color:#eef1f6}'+
    '#sessBar b{font-weight:700}'+
    '#sessSair{background:#f0b429;color:#12141a;border:0;border-radius:999px;padding:9px 17px;'+
    'font:700 14px system-ui;cursor:pointer;min-height:40px}'+
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
    d.innerHTML='<span><b>'+u.nome+'</b></span><button id="sessSair">Sair</button>';
    document.body.appendChild(d);
    document.getElementById('sessSair').onclick=sair;
  });

  document.addEventListener('keydown',function(e){
    if(e.altKey && !e.ctrlKey && !e.metaKey && (e.key==='0'||e.code==='Digit0')){
      e.preventDefault(); sair();
    }
  });
})();

/* ---- tarja de modo teste ---- */
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

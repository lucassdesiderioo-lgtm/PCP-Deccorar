/* Chrome (barra de sessao + menu por pessoa) ciente do tema.
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

/* ⚠️ ATALHO E SO O NUMERO DA FILEIRA DE CIMA (20/10/2026, teste_atalho.js).
   O leitor de codigo no modo "Alt + teclado numerico" (o jeito do Windows de
   digitar um caractere pelo codigo, comum em PC com teclado ABNT2) manda cada
   caractere como Alt segurado + digitos do teclado NUMERICO: o "5" vira
   Alt+5-3. Aceitando qualquer digito com Alt, o primeiro digito do codigo era
   um atalho — bipar jogava a pessoa na Etiqueta de Venda, no Carregamento ou
   no "Sair do sistema?". Pessoa aperta o numero de cima (`Digit1`); o teclado
   numerico com Alt e do leitor e nunca dispara atalho. Devolve o digito, ou
   null quando a tecla nao e atalho. Aparelho que nao informa a tecla fisica
   (`code` vazio) fica como era antes. */
function digitoDoAtalho(e){
  if(!e.altKey || e.ctrlKey || e.metaKey) return null;
  var c=e.code||'';
  if(c) return /^Digit[0-9]$/.test(c) ? c.slice(5) : null;
  return /^[0-9]$/.test(e.key||'') ? e.key : null;
}

/* ⚠️ O RODAPÉ DE ATALHOS SAIU (spec ACESSO-POR-TELA-E-NIVEL, fase 6, R-TEL-06,
   04/11/2026), e o Alt+1..8 de troca de tela junto. Ele mostrava os mesmos
   atalhos a todo mundo — o embalador clicava em "Admin" e caía em "Sem
   permissão" —, a equipe não o usava, e ele aparecia duplicado nas abas que o
   Admin abria em iframe. No lugar dele fica o MENU POR PESSOA (abaixo, na
   barra de sessão), montado do mapa de telas. O Alt+0 do "Sair" continua. */

/* ---- o menu por pessoa e os botões que a pessoa não tem ----
   `/api/telas/minhas` diz as telas do mapa (`telas.js`) que ESTA pessoa abre,
   pela mesma conta do portão, com o número e o módulo, e as permissões dela.
   O menu mostra só os módulos e as telas que ela alcança; o botão de ação
   marcado com `data-perm="chave outra.chave"` some para quem não tem nenhuma
   delas (R-TEL-04). ESCONDER NÃO É SEGURANÇA: o servidor continua travando
   por baixo (§20, Regra A). A aparência do menu é da conversa de design; aqui
   ele é funcional, no visual atual. */
var MENU={ telas:null };
function menuHtml(d, atual){
  var mods=d.modulos||{}, grupos={}, ordem=[];
  (d.telas||[]).forEach(function(t){
    var m=String(t.modulo); if(!grupos[m]){ grupos[m]=[]; ordem.push(m); } grupos[m].push(t);
  });
  ordem.sort(function(a,b){ return (+a)-(+b); });
  if(!ordem.length) return '<div class="mnVazio">Seu acesso não alcança nenhuma tela.</div>';
  return ordem.map(function(m){
    return '<div class="mnMod"><div class="mnTit">'+(mods[m]||m)+'</div>'+grupos[m].map(function(t){
      var on=(t.rota===atual);
      return '<a class="mnTela'+(on?' on':'')+'" href="'+t.rota+'"'+(on?' aria-current="page"':'')+'><b>'+t.n+'</b> '+t.nome+'</a>';
    }).join('')+'</div>';
  }).join('');
}
/* SÓ ESCONDE, NUNCA FORÇA A APARECER: a regra pega o botão cuja marca não
   tem NENHUMA chave da pessoa. O que ela tem segue a tela — se a própria tela
   esconde o botão (`display:none` no estilo), ele continua escondido. Um
   `display:revert !important` no permitido passaria por cima disso. */
function estiloDasPermissoes(d){
  if(d.admin_geral) return '';
  return '[data-perm]'+(d.perms||[]).map(function(c){
    return ':not([data-perm~="'+String(c).replace(/[^a-z0-9_.]/gi,'')+'"])';
  }).join('')+'{display:none !important}';
}
(function(){
  if(location.pathname.indexOf('/login')===0) return;
  /* Nasce escondido: o botão que a pessoa não tem não pisca antes da resposta. */
  var st=document.createElement('style'); st.id='permCss';
  st.textContent='[data-perm]{display:none !important}';
  document.head.appendChild(st);
  fetch('/api/telas/minhas',{credentials:'same-origin'}).then(function(r){ return r.json(); }).then(function(d){
    MENU.telas=d||{};
    st.textContent=estiloDasPermissoes(MENU.telas);
    var m=document.getElementById('menuTelas');
    if(m) m.innerHTML=menuHtml(MENU.telas, location.pathname.replace(/\/$/,'')||'/');
  }).catch(function(){});
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
    '#fadj{display:flex;gap:8px;align-items:center}'+
    '#fadj .fbtn{min-width:46px;min-height:34px;border:1px solid '+CH.sBtn+';color:'+CH.sBtn+';'+
    'background:transparent;border-radius:8px;font:800 15px system-ui;cursor:pointer}'+
    '#fadj .fbtn:active{opacity:.7}'+
    '#flab{color:'+CH.sTx+';min-width:28px;text-align:center;font-weight:800}'+
    /* A TROCA DE OPERACAO (spec NAVEGACAO-E-LINGUAGEM, fase 1). Mesmo lugar,
       mesmo tamanho e mesmas cores do bloco no tecido/public/base.css: a
       pessoa que trabalha nas duas operacoes acha o botao onde ele sempre
       esteve. A cor e o azul de acao do PCP (planBg), nenhuma cor nova. */
    '#sessBar .sessOp{display:inline-flex;align-items:center;min-height:36px;padding:0 14px;'+
    'border-radius:8px;border:1px solid '+CH.planBg+';color:'+CH.planBg+';background:transparent;'+
    'font:700 14px system-ui,-apple-system,Segoe UI,Roboto,sans-serif;text-decoration:none;white-space:nowrap}'+
    '#sessBar .sessOp.atalho{background:'+CH.planBg+';color:'+CH.planTx+'}'+
    '#sessBar .sessOp:active{opacity:.75}'+
    '#sessMenu{margin-right:auto}'+
    '#menuTelas{position:sticky;top:48px;z-index:9998;background:'+CH.sBg+';border-bottom:1px solid '+CH.sLine+';'+
    'padding:10px 14px;display:flex;flex-wrap:wrap;gap:18px;font:500 14px system-ui,-apple-system,Segoe UI,Roboto,sans-serif}'+
    '#menuTelas .mnMod{display:inline-block;vertical-align:top;margin:0 22px 10px 0;min-width:180px}'+
    '#menuTelas .mnTit{color:'+CH.sTx+';font-weight:800;font-size:12px;text-transform:uppercase;letter-spacing:.4px;margin-bottom:4px}'+
    '#menuTelas .mnTela{display:block;min-height:34px;line-height:34px;padding:0 10px;border-radius:8px;text-decoration:none;color:'+CH.sName+'}'+
    '#menuTelas .mnTela b{color:'+CH.sTx+';margin-right:6px}'+
    '#menuTelas .mnTela.on{background:'+CH.planBg+';color:'+CH.planTx+'}'+
    '#menuTelas .mnTela.on b{color:'+CH.planTx+'}'+
    '#menuTelas .mnVazio{color:'+CH.sTx+'}'+
    '@media (max-width:600px){#sessBar{flex-wrap:wrap}}'+
    '@media print{#sessBar,#menuTelas{display:none}}';
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
    // "Trocar setor" sempre; o atalho direto so para quem alcanca as duas
    // operacoes. Quem decide e o servidor (destino.js) — esconder aqui nao e
    // seguranca, so evita mostrar um caminho que da "sem permissao".
    var dest=u.destino||{};
    var atalho=(dest.duas&&dest.sobmedida) ? '<a class="sessOp atalho" id="sessAtalho" href="'+dest.sobmedida+'">Sob medida →</a>' : '';
    d.innerHTML=fadj+'<button class="sessOp" id="sessMenu" aria-expanded="false" aria-controls="menuTelas">☰ Menu</button>'+
      '<span><b style="color:'+CH.sName+'">'+u.nome+'</b></span>'+
      atalho+'<a class="sessOp" id="sessSetor" href="/setor">Trocar setor</a><button id="sessSair">Sair</button>';
    document.body.insertBefore(d, document.body.firstChild);
    /* O MENU (fase 6): a lista sai do /api/telas/minhas (acima). Abre e fecha
       no botão; quem tem uma tela só vê só ela. */
    var pn=document.createElement('nav'); pn.id='menuTelas'; pn.setAttribute('aria-label','Telas');
    pn.style.display='none';
    pn.innerHTML=MENU.telas?menuHtml(MENU.telas, location.pathname.replace(/\/$/,'')||'/'):'<div class="mnVazio">carregando…</div>';
    document.body.insertBefore(pn, d.nextSibling||null);
    var bm=document.getElementById('sessMenu');
    if(bm) bm.onclick=function(){ var ab=pn.style.display==='none'; pn.style.display=ab?'block':'none'; bm.setAttribute('aria-expanded',ab?'true':'false'); };
    document.getElementById('sessSair').onclick=sair;
    /* O atalho para a outra operacao avisa a troca de setor (QUEM-FEZ-E-REVISAO
       fase 6), sem segurar o link; falhar o aviso nao muda nada. */
    var ata=document.getElementById('sessAtalho');
    if(ata) ata.addEventListener('click',function(){ try{ fetch('/api/auth/setor',{method:'POST',keepalive:true,credentials:'same-origin',
      headers:{'content-type':'application/json'},body:JSON.stringify({para:'sobmedida'})}).catch(function(){}); }catch(e){} });
    var fa=document.getElementById('fadj');
    if(fa){ fa.addEventListener('click',function(e){ var btn=e.target.closest('[data-fd]'); if(!btn) return;
      FONT.set(FONT.get()+ (+btn.getAttribute('data-fd')));
      var l=document.getElementById('flab'); if(l) l.textContent=FONT.label(); }); }
  });

  document.addEventListener('keydown',function(e){
    if(digitoDoAtalho(e)==='0'){
      e.preventDefault(); sair();
    }
  });
})();

/* ---- tarja de modo teste (amarela em qualquer tema) ---- */
(function(){
  if(location.pathname.indexOf('/login')===0) return;
  function pinta(){
    fetch('/api/teste/ativo').then(function(r){return r.json();}).then(function(t){
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

/* ---- tarja da contagem de estoque (ESTOQUE-LIVRO-E-CONFERENCIA v2, §7.1) ----
   Aparece no topo de todas as telas para as duas escaladas do dia (e para o
   setor depois das 10h, se uma nao comecou). NAO FECHA E NAO BLOQUEIA:
   incomoda, nao trava — uma trava que para a bancada perto do despacho vira
   desvio (armadilha #6). Quem decide se ela aparece e o servidor
   (/api/inventario/tarja); quem nao tem a chave recebe nada. Toque abre a
   tela de contagem. Fora do fluxo do bipe: um elemento no topo, sem foco. */
(function(){
  if(location.pathname.indexOf('/login')===0) return;
  function pinta(){
    fetch('/api/inventario/tarja').then(function(r){ return r.ok ? r.json() : {}; }).then(function(d){
      var t=d&&d.tarja, el=document.getElementById('invBar');
      if(!t||!t.texto){ if(el) el.remove(); return; }
      if(!el){
        el=document.createElement('a'); el.id='invBar';
        el.style.cssText='display:block;position:relative;z-index:9999;text-decoration:none;text-align:center;'+
          'font:800 15px system-ui;padding:9px 12px;letter-spacing:.2px;line-height:1.3';
        document.body.insertBefore(el, document.body.firstChild);
      }
      var aviso=t.tipo==='aviso';
      el.style.background=aviso?'#fbf1db':'#1565c0'; el.style.color=aviso?'#7a4a00':'#fff';
      el.href=t.link||'/inventario';
      el.textContent=(aviso?'⚠ ':'▣ ')+t.texto+(aviso?'':'  →');
    }).catch(function(){});
  }
  if(document.readyState==='loading') document.addEventListener('DOMContentLoaded',pinta); else pinta();
  setInterval(pinta,60000);
})();

/* ---- a faixa da próxima coleta (spec HORARIOS-DE-COLETA, fase 2, 05/11/2026) ----
   Nas telas de operação da Expedição (201 Etiqueta de Venda, 202 Conferência,
   103 Subir PDF de vendas —, 206 Horários de coleta) para todo mundo, e em qualquer tela para quem tem nível
   Supervisor ou acima (D5) — quem decide é o servidor (`em_toda_tela`). Conta
   até o INÍCIO da janela (o caminhão pode chegar no começo, R-HCO-06): âmbar
   abaixo de 2 h, vermelho abaixo de 1 h e dentro da janela, a mesma régua do
   relógio da agência (§8). As caixas são as DESTA coleta; as que ninguém
   marcou aparecem à parte. Não fecha, não bloqueia, e fica fora do bipe.
   Fase 3 (§12 da spec): as TAREFAS dos horários (a semana a confirmar, o
   "mudou" avisado, o dia sem lançar) aparecem em QUALQUER tela, numa tarja
   própria que leva à 206 — só para quem corrige horário (o servidor manda
   `tarefas` vazio para os outros). Âmbar quando atrasada. */
(function(){
  if(location.pathname.indexOf('/login')===0) return;
  var EXP=['/embalagem','/carregamento','/admin/producao','/coleta-horarios'];
  var aqui=location.pathname.replace(/\.html$/,'').replace(/\/+$/,'');
  var naExpedicao=EXP.indexOf(aqui)>=0;
  function hm(m){ m=Math.max(0,m); var h=Math.floor(m/60), r=m%60; return h?(h+'h'+(r<10?'0':'')+r):(r+' min'); }
  function plural(n,s,p){ return n+' '+(n===1?s:p); }
  function pinta(){
    fetch('/api/saidas/status',{credentials:'same-origin'}).then(function(r){ return r.ok ? r.json() : null; }).then(function(d){
      tarefas(d && d.tarefas || []);
      var el=document.getElementById('colBar');
      if(!d || (!naExpedicao && !d.em_toda_tela)){ if(el) el.remove(); return; }
      /* quem corrige já tem a tarefa "lance o horário de hoje": a faixa cinza
         dizendo o mesmo saía duas vezes (AJUSTE de 05/11/2026). Com caixa sem
         coleta marcada a faixa fica, porque ela diz quantas são */
      var smx=d.sem_marca||{};
      if((d.tarefas||[]).some(function(x){ return x.tipo==='hoje'; }) && !((smx.por_imprimir||0)+(smx.por_conferir||0))){ if(el) el.remove(); return; }
      if(!el){
        el=document.createElement('div'); el.id='colBar';
        el.style.cssText='position:relative;z-index:9998;text-align:center;font:700 14px system-ui;padding:8px 12px;line-height:1.35';
        document.body.insertBefore(el, document.body.firstChild);
      }
      var cor='#2a2f3a', txt='#e6edf3', t;
      var sm=d.sem_marca||{}, semMarca=(sm.por_imprimir||0)+(sm.por_conferir||0);
      var semTxt=semMarca?' · '+plural(semMarca,'caixa sem coleta marcada','caixas sem coleta marcada'):'';
      if(d.sem_coleta) t='Hoje não tem coleta'+(d.motivo_texto?' ('+(d.motivo==='feriado'?'Feriado: ':'')+d.motivo_texto+')':'')+semTxt;
      /* quem corrige tem a tarefa do "mudou": a faixa não repete */
      else if(d.mudou && !d.pode_editar){ t='⚠ Avisaram que o horário de hoje mudou no ML — aguardando a correção'+semTxt; cor='#c98a00'; txt='#1a1300'; }
      else if(d.rascunho){ t='Horário de hoje copiado da semana passada — falta conferir (no primeiro PDF do dia)'+semTxt; cor='#3a3f4a'; txt='#c9d1d9'; }
      else if(!d.lancado){ t='Horário da coleta de hoje não lançado'+semTxt; cor='#3a3f4a'; txt='#c9d1d9'; }
      else if(!d.proxima) t='Coletas de hoje encerradas'+semTxt;
      else {
        var p=d.proxima, jan=p.inicio+'–'+p.fim;
        var falta=p.por_imprimir+p.por_conferir;
        var resto=' · '+plural(p.por_imprimir,'por imprimir','por imprimir')+' · '+plural(p.por_conferir,'por conferir','por conferir')+semTxt;
        if(p.estado==='janela'){ t='🚚 Coleta '+jan+' — o caminhão pode estar na porta'+resto; cor='#b42318'; txt='#fff'; }
        else {
          t='🚚 Próxima coleta '+jan+' — faltam '+hm(p.minutos)+resto+(p.corte?' · corte '+p.corte+(p.corte_conferir?' (a conferir)':(d.agora&&p.corte<=d.agora?' (passou)':'')):'');
          if(falta && p.minutos<60){ cor='#b42318'; txt='#fff'; }
          else if(falta && p.minutos<120){ cor='#c98a00'; txt='#1a1300'; }
        }
      }
      el.style.background=cor; el.style.color=txt; el.textContent=t;
    }).catch(function(){});
  }
  function tarefas(lista){
    var el=document.getElementById('colTarefas');
    if(!lista.length){ if(el) el.remove(); return; }
    if(!el){
      el=document.createElement('div'); el.id='colTarefas';
      el.style.cssText='position:relative;z-index:9998';
      var bar=document.getElementById('colBar');
      document.body.insertBefore(el, bar ? bar.nextSibling : document.body.firstChild);
    }
    el.innerHTML='';
    lista.forEach(function(t){
      var a=document.createElement('a'); a.href='/coleta-horarios';
      a.style.cssText='display:block;text-align:center;font:700 14px system-ui;padding:8px 12px;text-decoration:none;'
        +(t.atrasada?'background:#c98a00;color:#1a1300':'background:#1565c0;color:#fff');
      a.textContent=(t.tipo==='semana'?'📋 ':'⚠ ')+t.texto+(t.atrasada&&t.tipo==='semana'?' (atrasada)':'')+'  →';
      el.appendChild(a);
    });
  }
  if(document.readyState==='loading') document.addEventListener('DOMContentLoaded',pinta); else pinta();
  setInterval(pinta,60000);
  try{ window.addEventListener('saidas-mudou',pinta); }catch(e){}   // o quadro do upload ou a 206 mudou o dia
})();

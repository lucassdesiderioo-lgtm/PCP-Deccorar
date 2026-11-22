/* manual_ajuda.js — o botão "?" de toda tela e o desenho da ficha (spec
 * MANUAL-DO-SISTEMA, fase 1, 21/11/2026).
 *
 * UM ARQUIVO SÓ, para as duas operações: o `public/nav.js` (medida padrão) e o
 * `tecido/public/nav.js` (sob medida) o carregam por uma tag de script, como
 * fazem com o menu_telas.js. Duas cópias do desenho divergiriam no primeiro
 * ajuste (#12). A 907 Manual usa o MESMO desenho (`MANUAL_FICHA.html`) para a
 * ficha aberta na tela.
 *
 * O "?" só aparece quando o servidor devolve a ficha da tela em que a pessoa
 * está (`/api/manual/ficha/aqui?rota=…`): sem `manual.ler` a rota é 403, e o
 * botão não nasce. Esconder é conforto; quem tranca é a rota (R-TEL-04).
 *
 * O PAINEL ABRE NA MESMA PÁGINA, nunca em aba nova: as estações do iPad abrem
 * em tela cheia, e um `target="_blank"` cai no Safari sem botão de voltar
 * (§12). Ele é filho direto do <body>, fora de qualquer card que a tela
 * redesenhe (§12, "redesenho periódico apaga o campo"), e ao fechar devolve o
 * foco ao campo que o tinha — o campo de bipe, na bancada. Abrir e fechar não
 * mexe em nada da tela: é só leitura.
 */
(function(){
  if(typeof window === 'undefined') return;
  function esc(s){ return String(s == null ? '' : s).replace(/[&<>"]/g, function(c){ return { '&':'&amp;', '<':'&lt;', '>':'&gt;', '"':'&quot;' }[c]; }); }
  /* [[Termo]] vira link para o glossário da 907; o texto fica como está */
  /* [[Termo]] leva ao próprio termo no glossário da 907 (o id do <dt> é "termo-" + o mesmo apelido) */
  function apelidoTermo(t){ return String(t || '').toLowerCase().replace(/[^a-z0-9]+/g, '-'); }
  /* o apelido sai do texto CRU (antes do esc), e esta é a única régua — a 907 usa a mesma (③ REVISÃO, 2ª rodada) */
  function texto(s){
    return String(s == null ? '' : s).split(/(\[\[[^\]]+\]\])/).map(function(p){
      var m = /^\[\[([^\]]+)\]\]$/.exec(p);
      return m ? '<a class="mfTermo" href="/manual#termo=' + apelidoTermo(m[1]) + '">' + esc(m[1]) + '</a>' : esc(p);
    }).join('');
  }
  function itens(lista){
    if(!lista || !lista.length) return '';
    return '<ul class="mfLista">' + lista.map(function(i){
      return '<li>' + (i.nome ? '<b>' + texto(i.nome) + '</b>' + (i.texto ? ' — ' : '') : '') + texto(i.texto) + '</li>';
    }).join('') + '</ul>';
  }
  function chips(lista, vazio){
    if(!lista || !lista.length) return '<span class="mfVazio">' + esc(vazio || '—') + '</span>';
    return lista.map(function(t){
      var cls = 'mfChip' + (t.opera ? '' : ' fora');
      var tit = t.opera ? '' : ' title="você não opera esta tela"';
      return '<a class="' + cls + '" href="/manual#tela=' + esc(t.n) + '"' + tit + '><b>' + esc(t.n) + '</b> ' + esc(t.nome) + (t.opera ? '' : ' <span class="mfSo">(você não opera)</span>') + '</a>';
    }).join(' ');
  }
  function secao(titulo, corpo, vazio){
    return '<section class="mfSec"><h3>' + esc(titulo) + '</h3>' + (corpo || '<p class="mfVazio">' + esc(vazio || 'ainda não escrito') + '</p>') + '</section>';
  }

  /* A FICHA INTEIRA, em HTML. `f` é a resposta de /api/manual/ficha/:n. */
  function fichaHtml(f, opts){
    opts = opts || {};
    if(!f) return '<p class="mfVazio">Ficha não encontrada.</p>';
    if(f.opera === false && !f.secoes){
      return '<div class="mfCabe"><div class="mfNum">' + esc(f.n) + '</div><div><h2>' + esc(f.nome) + '</h2>'
        + '<div class="mfSub">' + esc(nomeModulo(f.modulo, opts.modulos)) + ' · nível ' + esc(nomeNivel(f.nivel)) + '</div></div></div>'
        + '<p class="mfAviso">Você não opera esta tela. O manual mostra o nome e onde ela fica; o conteúdo é de quem a opera.</p>';
    }
    var s = f.secoes || {};
    var h = '<div class="mfCabe"><div class="mfNum">' + esc(f.n) + '</div><div><h2>' + esc(f.titulo || f.nome) + '</h2>'
      + '<div class="mfSub">' + esc(nomeModulo(f.modulo, opts.modulos)) + ' · nível ' + esc(nomeNivel(f.nivel)) + (f.opera === false ? ' · <span class="mfSo">você não opera esta tela</span>' : '') + '</div></div></div>';
    if(f.situacao === 'rascunho' || f.situacao === 'sem_ficha')
      h += '<div class="mfTarja">Ficha ainda não escrita. O que o sistema sabe sozinho está abaixo: onde a tela entra no fluxo e os botões que ela tem.</div>';
    h += secao('Para que serve', itens(s.para_que_serve));
    var fl = s.fluxo || {};
    var fluxo = '<div class="mfFluxo"><div><span class="mfRot">Recebe de</span> ' + chips(fl.recebe_de, 'nenhuma tela manda para esta') + '</div>'
      + '<div><span class="mfRot">Manda para</span> ' + chips(fl.manda_para, 'nenhuma tela') + '</div>'
      + (fl.extra ? '<p>' + texto(fl.extra) + '</p>' : '') + '</div>';
    h += secao('Onde entra no fluxo', fluxo);
    var bot = itens(s.botoes);
    if(f.acoes && f.acoes.length){
      bot += '<div class="mfAcoes"><span class="mfRot">Ações desta tela, pela permissão</span><ul class="mfLista">' + f.acoes.map(function(a){
        return '<li><b>' + esc(a.rotulo) + '</b>' + (a.desc ? ' — ' + esc(a.desc) : '') + (a.sensivel ? ' <span class="mfSo">(sensível)</span>' : '') + '</li>';
      }).join('') + '</ul></div>';
    }
    h += secao('Botões e ações', bot, 'esta tela não tem botão com permissão própria');
    h += secao('O que a tela mostra', itens(s.mostra));
    if(f.parametros && f.parametros.length){
      h += '<section class="mfSec"><h3>Os números de hoje</h3><ul class="mfLista">' + f.parametros.map(function(p){
        /* o nome vem da ficha (chave = Nome); a chave do config nunca é escrita na tela (③ REVISÃO) */
        return '<li><b>' + esc(p.rotulo || 'parâmetro sem nome na ficha') + '</b> — ' + (p.valor == null || p.valor === '' ? '<span class="mfVazio">sem valor gravado</span>' : esc(p.valor)) + '</li>';
      }).join('') + '</ul><p class="mfNota">Lidos agora da configuração do sistema. Mudou lá, muda aqui.</p></section>';
    }
    h += secao('Por que a tela faz isso', itens(s.porque));
    h += secao('Perguntas frequentes', itens(s.perguntas));
    var mud = (s.mudancas || []).slice(0, 8);
    h += secao('Mudanças', mud.length ? '<ul class="mfLista">' + mud.map(function(m){ return '<li><b>' + esc(m.data) + '</b> — ' + texto(m.texto) + '</li>'; }).join('') + '</ul>' : '');
    if(!opts.semLink) h += '<p class="mfLink"><a href="/manual#tela=' + esc(f.n) + '">Abrir o manual →</a></p>';
    return h;
  }
  var NIVEIS = { operacao:'Operação', supervisor:'Supervisor', admin:'Admin', admin_geral:'Admin Geral' };
  function nomeNivel(n){ return NIVEIS[n] || n || ''; }
  function nomeModulo(chave, mods){
    var m = (mods || []).filter(function(x){ return x.chave === chave; })[0];
    return m ? m.nome : (chave || '');
  }
  var CSS = '.mfCabe{display:flex;gap:12px;align-items:center;margin:0 0 10px}.mfNum{min-width:52px;height:44px;border-radius:10px;background:#1565c0;color:#fff;display:grid;place-items:center;font:800 18px system-ui}'
    + '.mfCabe h2{margin:0;font-size:20px;line-height:1.2}.mfSub{color:#5a6472;font-size:13px;margin-top:2px}'
    + '.mfTarja{background:#fff4e5;color:#b26a00;border:1px solid #b26a00;border-radius:10px;padding:10px 12px;font-weight:700;margin:0 0 12px}'
    + '.mfAviso{background:#f4f6f8;border:1px solid #d8dee6;border-radius:10px;padding:12px;color:#5a6472}'
    + '.mfSec{margin:0 0 14px}.mfSec h3{margin:0 0 6px;font-size:14px;text-transform:uppercase;letter-spacing:.4px;color:#5a6472}'
    + '.mfLista{margin:0;padding-left:18px}.mfLista li{margin:0 0 6px;line-height:1.45}.mfVazio{color:#8b97a5}.mfNota{color:#5a6472;font-size:12px;margin:6px 0 0}'
    + '.mfFluxo>div{margin:0 0 6px;line-height:1.9}.mfRot{color:#5a6472;font-size:12px;text-transform:uppercase;letter-spacing:.3px;margin-right:6px}'
    /* chips e link com 44 px de altura: alvo de toque da bancada (DESIGN.md §4; ③ REVISÃO, 22/11/2026) */
    + '.mfChip{display:inline-flex;align-items:center;min-height:44px;border:1px solid #1565c0;color:#1565c0;border-radius:999px;padding:0 14px;text-decoration:none;font-size:13px;margin:0 6px 6px 0;white-space:nowrap}'
    + '.mfChip b{margin-right:4px}.mfChip.fora{border-color:#d8dee6;color:#5a6472}.mfSo{color:#5a6472;font-size:12px;font-weight:400}'
    + '.mfAcoes{margin-top:8px}.mfLink a{display:inline-flex;align-items:center;min-height:44px;color:#1565c0;font-weight:700;text-decoration:none}.mfTermo{color:#1565c0;text-decoration:underline dotted}';
  function estilo(){
    if(document.getElementById('mfCss')) return;
    var st = document.createElement('style'); st.id = 'mfCss'; st.textContent = CSS; document.head.appendChild(st);
  }
  window.MANUAL_FICHA = { html: fichaHtml, estilo: estilo, esc: esc, texto: texto, apelidoTermo: apelidoTermo, nomeModulo: nomeModulo, nomeNivel: nomeNivel };

  /* ── o "?" na barra de sessão ─────────────────────────────────────────── */
  if(window.__manualAjuda || location.pathname.indexOf('/login') === 0) return;
  window.__manualAjuda = true;
  var rota = location.pathname.replace(/\/$/, '') || '/';
  var ficha = null, anterior = null, modulos = null;

  function barra(){
    var b = document.getElementById('sessMenu');                 // medida padrão
    if(b) return { depois:b, classe:'sessOp' };
    var m = document.querySelector('.sessao .menuBt');            // sob medida
    if(m) return { depois:m, classe:'' };
    return null;
  }
  function painel(){
    var p = document.getElementById('manualPainel');
    if(p) return p;
    estilo();
    p = document.createElement('aside'); p.id = 'manualPainel'; p.setAttribute('role', 'dialog'); p.setAttribute('aria-label', 'Como funciona esta tela'); p.hidden = true;
    p.style.cssText = 'position:fixed;top:0;right:0;bottom:0;width:min(560px,100vw);max-width:100vw;box-sizing:border-box;overflow:auto;z-index:10001;background:#ffffff;color:#1a1d23;'
      + 'box-shadow:-6px 0 24px rgba(0,0,0,.25);padding:14px 18px 80px;font:15px/1.45 system-ui,-apple-system,Segoe UI,Roboto,sans-serif';
    document.body.appendChild(p);
    return p;
  }
  function fechar(){
    var p = document.getElementById('manualPainel'), b = document.getElementById('manualAjuda');
    if(p) p.hidden = true;
    if(b) b.setAttribute('aria-expanded', 'false');
    /* devolve o foco a quem o tinha — o campo de bipe, na bancada */
    try{ if(anterior && document.body.contains(anterior) && anterior.focus) anterior.focus(); }catch(e){}
    anterior = null;
  }
  function abrir(){
    var p = painel(), b = document.getElementById('manualAjuda');
    /* quem tinha o foco antes do clique (o pointerdown do botão já guardou);
       pelo teclado, é quem está com o foco agora */
    if(!anterior || anterior === b) anterior = document.activeElement;
    p.innerHTML = '<div style="display:flex;justify-content:space-between;align-items:center;gap:10px;margin:0 0 12px">'
      + '<span style="font:700 12px system-ui;color:#5a6472;text-transform:uppercase;letter-spacing:.4px">Como funciona esta tela</span>'
      + '<button id="manualFechar" type="button" aria-label="Fechar" style="min-width:44px;min-height:44px;border:1px solid #d8dee6;border-radius:10px;background:#f4f6f8;color:#1a1d23;font:800 18px system-ui;cursor:pointer">✕</button></div>'
      + fichaHtml(ficha, { modulos: modulos });
    p.hidden = false;
    if(b) b.setAttribute('aria-expanded', 'true');
    var f = document.getElementById('manualFechar');
    /* O ✕ NÃO RECEBE O FOCO (③ REVISÃO, 22/11/2026): na 251 e na 303 a tela não
       puxa o bipe de volta, e o bipe seguinte caía no botão — o Enter do
       leitor fechava o painel e o código sumia calado. O foco fica onde
       estava; Esc e o ✕ continuam fechando. */
    if(f){ f.onclick = fechar; }
  }
  function desenhar(onde){
    if(document.getElementById('manualAjuda')) return;
    var b = document.createElement('button');
    b.id = 'manualAjuda'; b.type = 'button'; b.textContent = '?';
    if(onde.classe) b.className = onde.classe;
    b.setAttribute('data-perm', 'manual.ler');
    b.setAttribute('aria-haspopup', 'dialog'); b.setAttribute('aria-expanded', 'false'); b.setAttribute('aria-controls', 'manualPainel');
    b.title = 'Como funciona esta tela'; b.setAttribute('aria-label', 'Como funciona esta tela');
    b.style.minWidth = '44px'; b.style.fontWeight = '800';
    /* O CLIQUE NÃO ROUBA O FOCO: o botão guarda quem o tinha (o campo de bipe,
       a busca) e não o toma para si, para devolvê-lo ao fechar. Na bancada a
       tela puxa o bipe de volta sozinha enquanto o painel está aberto — e é
       assim que tem que ser: o painel é leitura, o bipe continua trabalhando. */
    b.addEventListener('pointerdown', function(){ var a = document.activeElement; anterior = (a && a !== b) ? a : anterior; });
    b.addEventListener('mousedown', function(e){ e.preventDefault(); });
    b.onclick = function(){ var p = document.getElementById('manualPainel'); if(p && !p.hidden) fechar(); else abrir(); };
    onde.depois.parentNode.insertBefore(b, onde.depois.nextSibling);
  }
  document.addEventListener('keydown', function(e){ if(e.key === 'Escape'){ var p = document.getElementById('manualPainel'); if(p && !p.hidden) fechar(); } });

  /* SÓ PERGUNTA A FICHA QUEM TEM A CHAVE (③ REVISÃO, 22/11/2026): o nav.js já
     guarda em MENU.telas a resposta do /api/telas/minhas (as permissões da
     pessoa, e se é Admin Geral). Sem `manual.ler` o portão responderia 403 em
     toda tela de toda pessoa — ruído no console da bancada inteira até o dia em
     que a chave for marcada. Espera a resposta até 10 s; sem ela, não pergunta. */
  function temChave(){
    var m = window.MENU && window.MENU.telas;
    if(!m) return null;
    return !!(m.admin_geral || (m.perms || []).indexOf('manual.ler') >= 0);
  }
  var espera = 0;
  var aguarda = new Promise(function(res){
    (function olha(){ var t = temChave(); if(t !== null) return res(t); if(++espera > 40) return res(false); setTimeout(olha, 250); })();
  });
  aguarda.then(function(pode){ if(!pode) return null;
    return fetch('/api/manual/ficha/aqui?rota=' + encodeURIComponent(rota), { credentials:'same-origin' }); })
    .then(function(r){ return r && r.status === 200 ? r.json() : null; })
    .then(function(f){
      if(!f || f.opera === false) return;   // sem permissão, ou tela fora do mapa: nada a desenhar
      ficha = f;
      /* os nomes dos módulos, para o cabeçalho; falhar aqui não impede o "?" */
      fetch('/api/manual/mapa', { credentials:'same-origin' }).then(function(r){ return r.ok ? r.json() : null; }).then(function(m){ if(m) modulos = m.modulos; }).catch(function(){});
      /* a barra nasce depois do /api/auth/eu: espera por ela, até 10 s */
      var tentativas = 0;
      var t = setInterval(function(){
        var onde = barra();
        if(onde){ clearInterval(t); desenhar(onde); }
        else if(++tentativas > 40) clearInterval(t);
      }, 250);
    })
    .catch(function(){});
})();

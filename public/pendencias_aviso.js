/* pendencias_aviso.js — a linha da central de pendências nas telas da bancada
 * (spec CENTRAL-DE-PENDENCIAS, fase 3, 27/10/2026).
 *
 * Quem opera a Etiqueta de Venda ou a Conferência não abre o admin. Esta linha
 * diz QUANTAS coisas esperam uma decisão em Admin → Pendências e há quanto
 * tempo — e só isso: sem botão, sem lista, sem SKU nem cliente. Decidir
 * continua sendo de quem tem a permissão, na aba.
 *
 * Uma frase só para as duas telas, aqui: duas cópias divergem (#12).
 * Âmbar no dia, vermelho a partir do dia seguinte; sem pendência, nada.
 * Atualiza a cada 60 s por conta própria — nunca dentro do redesenho da tela,
 * que na Conferência roda a cada 4 s e apagaria campo digitado (§12).
 */
(function(){
  function pl(n, um, muitos){ return n === 1 ? um : muitos; }
  async function desenhar(el){
    var t = null;
    try{ var r = await fetch('/api/pendencias/total'); if(r.ok) t = await r.json(); }catch(e){ return; }
    if(!t || !t.total){ el.innerHTML = ''; return; }
    var velha = t.dias || 0;
    var cor = velha >= 1 ? '#c62828' : '#b26a00', fundo = velha >= 1 ? '#fdecea' : '#fff4e5';
    var frase = '⚠ ' + t.total + ' ' + pl(t.total, 'pendência esperando', 'pendências esperando')
      + ' decisão em Admin → Pendências'
      + (t.dias == null ? '' : ' — a mais antiga ' + (velha === 0 ? 'é de hoje' : 'há ' + velha + ' ' + pl(velha, 'dia', 'dias')));
    if(t.sem_etiqueta)
      frase += ' · ' + t.sem_etiqueta + ' ' + pl(t.sem_etiqueta, 'venda da folha está', 'vendas da folha estão')
        + ' sem etiqueta e não ' + pl(t.sem_etiqueta, 'aparece', 'aparecem') + ' em "Faltam imprimir": pode atrasar no ML';
    el.innerHTML = '<div style="margin:0 0 12px;padding:10px 12px;border-radius:10px;border:2px solid ' + cor
      + ';background:' + fundo + ';color:' + cor + ';font-weight:700">' + frase + '</div>';
  }
  window.avisoPendencias = function(id){
    var el = document.getElementById(id); if(!el) return;
    desenhar(el); setInterval(function(){ desenhar(el); }, 60000);
  };
})();

/* A CAIXINHA "ABRIR EM PENDÊNCIAS" (spec PENDENCIAS-NO-MENU, fase 1,
 * 12/11/2026). O dono: "quando fizer alguma coisa em uma tela e gerar
 * pendências, colocar uma caixinha para clicar e ir para a tela de pendência
 * — em todas as telas".
 *
 * Quem sabe que a ação criou pendência é o SERVIDOR (pendencias_vigia.js): a
 * resposta traz `pendencias`. Aqui só se desenha — e por isso vale para toda
 * tela que carrega o nav.js, sem cada uma lembrar de chamar nada: o `fetch`
 * da página é embrulhado, e a resposta de um POST com `pendencias` abre a
 * caixinha. A resposta que a tela recebe é a mesma (é lida uma cópia).
 *
 * Fica até a pessoa fechar no ✕: pendência que some sozinha é a que ninguém
 * viu. O botão só aparece para quem abre a tela dona; quem não abre lê a frase
 * e quem resolve. Na própria tela dona, a frase diz "está nesta tela".
 */
(function(){
  if(window.__pendCaixa || !window.fetch) return;
  window.__pendCaixa = true;
  function esc(t){ return String(t == null ? '' : t).replace(/[&<>"]/g, function(c){ return {'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;'}[c]; }); }
  function aqui(rota){ return rota && (location.pathname.replace(/\/$/, '') || '/') === rota; }
  function mostrar(lista){
    var el = document.getElementById('pendCaixa');
    if(!el){
      el = document.createElement('div'); el.id = 'pendCaixa'; el.setAttribute('role', 'alert');
      el.style.cssText = 'position:fixed;right:16px;bottom:64px;z-index:9998;max-width:min(460px,calc(100vw - 32px));'
        + 'box-sizing:border-box;padding:12px 40px 12px 14px;border-radius:10px;border:2px solid #c62828;background:#fdecea;'
        + 'color:#8e1b1b;font:600 15px/1.35 system-ui,sans-serif;box-shadow:0 4px 18px rgba(0,0,0,.25)';
      document.body.appendChild(el);
      el.addEventListener('click', function(e){ if(e.target && e.target.getAttribute('data-pendfechar') != null) el.remove(); });
    }
    var h = '<button type="button" data-pendfechar aria-label="Fechar" style="position:absolute;top:6px;right:8px;border:0;background:none;'
      + 'color:#8e1b1b;font-size:22px;line-height:1;cursor:pointer;padding:4px">✕</button>';
    lista.forEach(function(p){
      h += '<div class="pendCaixaLinha" style="margin:2px 0 8px">⚠ ' + esc(p.frase);
      if(aqui(p.rota)) h += ' — <span style="font-weight:400">está nesta tela.</span>';
      else if(p.pode && p.rota) h += '<div style="margin-top:6px"><a href="' + esc(p.rota) + '" style="display:inline-block;padding:8px 12px;'
        + 'border-radius:8px;background:#c62828;color:#fff;text-decoration:none;font-weight:700">Abrir em ' + esc((p.tela ? p.tela + ' ' : '') + (p.nome_tela || 'Pendências')) + ' →</a></div>';
      else h += '<div style="font-weight:400;margin-top:4px">Quem resolve: quem tem ' + esc(p.quem) + '.</div>';
      h += '</div>';
    });
    el.innerHTML = h;
  }
  window.mostrarPendencias = mostrar;
  var original = window.fetch;
  window.fetch = function(entrada, op){
    var p = original.apply(this, arguments);
    var metodo = String((op && op.method) || (entrada && entrada.method) || 'GET').toUpperCase();
    if(metodo !== 'POST') return p;
    return p.then(function(r){
      try{
        var tipo = r.headers && r.headers.get && r.headers.get('content-type') || '';
        if(/json/i.test(tipo)) r.clone().json().then(function(j){
          if(j && j.pendencias && j.pendencias.length) mostrar(j.pendencias);
        }).catch(function(){});
      }catch(e){}
      return r;
    });
  };
})();


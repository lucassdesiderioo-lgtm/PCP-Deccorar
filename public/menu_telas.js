/* O DESENHO DO ☰ MENU — um só, para as duas operações (spec
   ORGANIZACAO-DO-SISTEMA, fase 3, R-ORG-08).

   Quem lê: o `public/nav.js` (medida padrão) e o `tecido/public/nav.js` (sob
   medida). Os dois carregam este arquivo e pedem as telas ao mesmo lugar,
   `/api/telas/minhas` (`admin_telas.js`), que diz o que ESTA pessoa abre pela
   mesma conta dos portões. Duas cópias do desenho divergiriam no primeiro
   ajuste — foi o que aconteceu com o rodapé do sob medida e o menu daqui.

   O formato: MÓDULO DO ASSUNTO → bloco → tela, com o número ao lado do nome.
   - os módulos saem na ordem da lista (`modulos.js`), e módulo sem tela da
     pessoa não aparece;
   - o título do bloco só aparece quando a pessoa tem telas de MAIS DE UM bloco
     naquele módulo (quem só trabalha na medida padrão não lê "Medida padrão"
     em todo módulo); os blocos seguem a ordem do `blocos` da resposta;
   - dentro do bloco, a ordem é o número;
   - a tela aberta vem marcada.
   ESCONDER NÃO É SEGURANÇA: o menu só mostra; quem tranca é o portão. */
(function(raiz){
  function esc(s){ return String(s == null ? '' : s).replace(/[&<>"]/g, function(c){ return { '&':'&amp;', '<':'&lt;', '>':'&gt;', '"':'&quot;' }[c]; }); }
  function html(d, atual){
    d = d || {};
    var mods = Array.isArray(d.modulos) ? d.modulos : [], blocos = d.blocos || {};
    var ordemBloco = Object.keys(blocos);
    var porMod = {};
    (d.telas || []).forEach(function(t){ (porMod[t.modulo] = porMod[t.modulo] || []).push(t); });
    var saida = [];
    mods.forEach(function(m){
      var ts = porMod[m.chave]; if(!ts || !ts.length) return;
      var porBloco = {}, usados = [];
      ts.forEach(function(t){ var b = t.bloco || 'comum'; if(!porBloco[b]){ porBloco[b] = []; usados.push(b); } porBloco[b].push(t); });
      usados.sort(function(a, b){ var ia = ordemBloco.indexOf(a), ib = ordemBloco.indexOf(b); return (ia < 0 ? 99 : ia) - (ib < 0 ? 99 : ib); });
      var corpo = usados.map(function(b){
        var linhas = porBloco[b].slice().sort(function(x, y){ return x.n - y.n; }).map(function(t){
          var on = (t.rota === atual);
          return '<a class="mnTela' + (on ? ' on' : '') + '" data-n="' + esc(t.n) + '" href="' + esc(t.rota) + '"' + (on ? ' aria-current="page"' : '') + '><b>' + esc(t.n) + '</b> ' + esc(t.nome) + '</a>';
        }).join('');
        return (usados.length > 1 ? '<div class="mnBloco">' + esc(blocos[b] || b) + '</div>' : '') + linhas;
      }).join('');
      saida.push('<div class="mnMod"><div class="mnTit">' + esc(m.nome) + '</div>' + corpo + '</div>');
    });
    if(!saida.length) return '<div class="mnVazio">Seu acesso não alcança nenhuma tela.</div>';
    return saida.join('');
  }
  /* A LINHA DOS VALORES (R-VAL, spec ARRUMAR-O-LUGAR): na tela com dinheiro em
     que a pessoa não vê o valor (`sem_valor`, que o servidor decide pelo
     valor.js), uma linha só, no topo: os "—" da tela não são defeito. Quem
     TIRA o dinheiro é o servidor; esta linha só explica. Devolve a frase, ou
     '' quando a tela aberta não tem nada a dizer. */
  var FRASE_SEM_VALOR = 'Os valores em R$ desta tela não aparecem para o seu acesso.';
  function avisoValor(d, atual){
    var t = ((d && d.telas) || []).filter(function(x){ return x.rota === atual; })[0];
    return t && t.sem_valor ? FRASE_SEM_VALOR : '';
  }
  function marcarSemValor(d, atual, antes){
    if(typeof document === 'undefined' || document.getElementById('semValor')) return;
    var f = avisoValor(d, atual); if(!f || !antes) return;
    var el = document.createElement('div'); el.id = 'semValor'; el.setAttribute('role', 'note');
    el.style.cssText = 'margin:8px 16px;padding:8px 12px;border:1px solid #d29922;border-radius:8px;color:#d29922;font-size:13px;background:transparent';
    el.textContent = f;
    // só depois do menu: antes dele a barra ainda não existe, e a linha iria parar acima dela
    if(antes && antes.parentNode) antes.parentNode.insertBefore(el, antes.nextSibling);
  }
  /* A ETIQUETA VERMELHA DAS PENDÊNCIAS (spec PENDENCIAS-NO-MENU, fase 2): ao
     lado de cada tela, o número do que ESTA pessoa resolve ali, e no botão
     ☰ Menu o total — só o que ela pode resolver (D1), sempre vermelha (D3),
     e nada quando é zero. Quem conta é o servidor (`/api/pendencias/minhas`,
     a mesma conta da 204); aqui só se desenha. Linha que o servidor não
     conseguiu contar vira "?", nunca zero.
     Pergunta a cada 60 s e ao abrir o menu — fora de qualquer redesenho de
     tela (§12) — e não pergunta com a aba escondida. */
  function pl(n, um, muitos){ return n === 1 ? um : muitos; }
  function bolinha(txt, titulo){
    return '<span class="mnPend" title="' + esc(titulo) + '" aria-label="' + esc(titulo) + '" style="display:inline-block;min-width:20px;'
      + 'height:20px;line-height:20px;padding:0 6px;margin-left:8px;border-radius:10px;background:#c62828;color:#fff;font:700 12px/20px system-ui,sans-serif;'
      + 'text-align:center;vertical-align:middle;box-sizing:border-box">' + esc(txt) + '</span>';
  }
  function tituloTela(t){
    if(!t.n && t.erro) return 'Não deu para contar as pendências desta tela';
    return t.n + ' ' + pl(t.n, 'pendência esperando você', 'pendências esperando você')
      + (t.dias == null ? '' : ' — a mais antiga ' + (t.dias === 0 ? 'é de hoje' : 'há ' + t.dias + ' ' + pl(t.dias, 'dia', 'dias')))
      + (t.erro ? ' (e uma linha não deu para contar)' : '');
  }
  function etiquetas(painel, botao, p){
    if(typeof document === 'undefined') return;
    p = p || {};
    var por = p.por_tela || {};
    if(painel) Array.prototype.forEach.call(painel.querySelectorAll('a.mnTela[data-n]'), function(a){
      var velha = a.querySelector('.mnPend'); if(velha) velha.remove();
      var t = por[a.getAttribute('data-n')];
      if(!t || (!t.n && !t.erro)) return;
      a.insertAdjacentHTML('beforeend', bolinha(t.n ? String(t.n) : '?', tituloTela(t)));
    });
    if(botao){
      var vb = botao.querySelector('.mnPend'); if(vb) vb.remove();
      if(p.total) botao.insertAdjacentHTML('beforeend', bolinha(String(p.total), p.total + ' ' + pl(p.total, 'pendência esperando você', 'pendências esperando você') + (p.erro ? ' (e uma linha não deu para contar)' : '')));
      else if(p.erro) botao.insertAdjacentHTML('beforeend', bolinha('?', 'Não deu para contar as pendências'));
    }
  }
  var PEND = { painel:null, botao:null, dados:null, ligado:false };
  function pedirPendencias(){
    if(typeof fetch === 'undefined' || (typeof document !== 'undefined' && document.hidden)) return;
    fetch('/api/pendencias/minhas', { credentials:'same-origin' })
      .then(function(r){ return r.ok ? r.json() : null; })
      .then(function(d){ if(d){ PEND.dados = d; etiquetas(PEND.painel, PEND.botao, d); } })
      .catch(function(){});
  }
  /* Os dois nav.js chamam depois de desenhar o menu: guarda onde desenhar,
     redesenha com o último número (o menu acabou de ser refeito) e, na
     primeira vez, liga a pergunta de 60 s e a do clique no botão. */
  function pendencias(painel, botao){
    PEND.painel = painel || PEND.painel;
    /* o botão pode chegar depois do painel (a barra nasce quando o login responde) */
    if(botao && botao !== PEND.botao){ PEND.botao = botao; botao.addEventListener('click', pedirPendencias); }
    if(PEND.dados) etiquetas(PEND.painel, PEND.botao, PEND.dados);
    if(PEND.ligado) return;
    PEND.ligado = true;
    pedirPendencias();
    setInterval(pedirPendencias, 60000);
  }
  raiz.MENU_TELAS = { html:html, avisoValor:avisoValor, marcarSemValor:marcarSemValor, FRASE_SEM_VALOR:FRASE_SEM_VALOR,
                      etiquetas:etiquetas, pendencias:pendencias };
})(typeof window !== 'undefined' ? window : this);

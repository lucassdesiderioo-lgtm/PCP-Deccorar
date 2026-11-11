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
          return '<a class="mnTela' + (on ? ' on' : '') + '" href="' + esc(t.rota) + '"' + (on ? ' aria-current="page"' : '') + '><b>' + esc(t.n) + '</b> ' + esc(t.nome) + '</a>';
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
  raiz.MENU_TELAS = { html:html, avisoValor:avisoValor, marcarSemValor:marcarSemValor, FRASE_SEM_VALOR:FRASE_SEM_VALOR };
})(typeof window !== 'undefined' ? window : this);

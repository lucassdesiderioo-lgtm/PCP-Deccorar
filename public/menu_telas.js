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
  raiz.MENU_TELAS = { html:html };
})(typeof window !== 'undefined' ? window : this);

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

/* tempo_bancada.js — o DESENHO único do tempo da peça na bancada
 * (spec TEMPO-NA-BANCADA, cartão R-TEM-01, 21/11/2026).
 *
 * Recebe o campo `tempo` que o servidor devolve no bipe que fecha a peça
 * (tempo_operador.js, o dono da conta) e devolve o HTML das duas barras —
 * "Agora" e "Sua média" — com o aviso "Parabéns!" ou "Você pode melhorar".
 * A tela NÃO calcula nada: sem `tempo` (servidor antigo), não desenha nada.
 * Tela nova que mede tempo do operador usa ESTA função.
 */
(function(){
  var css = '.tbBarras{display:flex;flex-direction:column;gap:8px;margin:16px auto 0;max-width:520px;text-align:left}'
    + '.tbR{display:grid;grid-template-columns:minmax(0,150px) minmax(0,1fr) 70px;gap:10px;align-items:center;font-size:16px;font-variant-numeric:tabular-nums}'
    + '.tbR b{text-align:right}'
    + '.tbT{height:16px;border-radius:8px;background:#d8dee6;overflow:hidden}'
    + '.tbT i{display:block;height:100%;border-radius:8px;background:#2e7d32}'
    + '.tbT i.lento{background:#b26a00}.tbT i.media{background:#5a6472}'
    + '.tbAv{margin:14px auto 0;max-width:520px;font-size:24px;font-weight:800;padding:10px 14px;border-radius:12px;background:#fff}'
    + '.tbAv.bom{color:#2e7d32;border:2px solid #a9d8b4}.tbAv.mel{color:#b26a00;border:2px solid #b26a00}'
    + '.tbAv small{display:block;font-size:15px;font-weight:600;color:#5a6472;margin-top:2px}'
    + '.tbSem{margin-top:10px;font-size:15px;color:#5a6472}';
  var st = document.createElement('style'); st.textContent = css; document.head.appendChild(st);

  function txt(s){ s = Math.max(0, Math.round(+s || 0)); return s < 60 ? s + ' s' : Math.floor(s/60) + ':' + String(s%60).padStart(2,'0'); }
  function dif(s){ s = Math.abs(Math.round(s)); return s < 60 ? s + ' s' : Math.floor(s/60) + ' min ' + String(s%60).padStart(2,'0') + ' s'; }

  window.tempoBancada = function(t){
    if(!t || typeof t.segundos !== 'number') return '';
    var seg = t.segundos, m = (typeof t.mediana === 'number') ? t.mediana : null;
    var teto = Math.max(seg, m || 0, 1) * 1.15;
    var w = function(v){ return Math.max(3, Math.round(v / teto * 100)); };
    var lento = t.aviso === 'melhorar';   /* quem decide é o servidor */
    var h = '<div class="tbBarras"><div class="tbR"><span>Agora</span><div class="tbT"><i class="' + (lento ? 'lento' : '') + '" style="width:' + w(seg) + '%"></i></div><b>' + txt(seg) + '</b></div>';
    if(m == null || !t.aviso) return h + '</div><div class="tbSem">Primeira peça — ainda sem média</div>';
    h += '<div class="tbR"><span>Sua média' + (t.base === 'geral' ? ' (todos os SKUs)' : '') + '</span><div class="tbT"><i class="media" style="width:' + w(m) + '%"></i></div><b>' + txt(m) + '</b></div></div>';
    var frase = seg === m ? 'no tempo da sua média' : (lento ? dif(seg - m) + ' acima da sua média' : dif(m - seg) + ' abaixo da sua média');
    return h + (lento ? '<div class="tbAv mel">Você pode melhorar<small>' + frase + '</small></div>'
                      : '<div class="tbAv bom">Parabéns!<small>' + frase + '</small></div>');
  };
})();

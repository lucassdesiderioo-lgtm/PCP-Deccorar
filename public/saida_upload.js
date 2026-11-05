/* saida_upload.js — "PARA QUAL SAÍDA SÃO ESTAS VENDAS?" no upload do PDF
 * (spec HORARIOS-DE-COLETA, D4 e D6, 05/11/2026).
 *
 * Um quadro só, usado nas três portas de upload (201 Etiqueta de Venda, 203
 * Subir PDF e o Admin). Quem sobe o PDF olha o ML → Envios de hoje, confere o
 * horário das coletas (corrige ali se mudou) e escolhe a saída das vendas.
 *
 *   saidaUpload.montar(el)   desenha o quadro dentro de `el`. Sem a permissão
 *                            `coleta.horario` ele não aparece, e o upload segue
 *                            como sempre.
 *   saidaUpload.escolha()    grava os horários mudados (origem 'upload') e
 *                            devolve o id da saída escolhida, ou null. Recusa
 *                            do servidor vira erro (o upload não segue).
 *   saidaUpload.somar(j)     junta a resposta de cada PDF
 *   saidaUpload.texto()      o resumo para a linha de resultado
 *
 * Não trava nada (D1): sem escolha, o PDF sobe e a tela avisa em âmbar.
 */
(function(){
  var esc = function(s){ return String(s == null ? '' : s).replace(/[&<>"]/g, function(c){ return {'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;'}[c]; }); };
  var el = null, dia = null, novas = 0, soma = null;
  var AMBAR = 'margin-top:8px;padding:8px 10px;border-radius:8px;background:rgba(255,184,0,.14);border:1px solid #c98a00;font-weight:600';
  var CAMPO = 'font:inherit;padding:4px 6px;border-radius:6px;border:1px solid rgba(128,128,128,.5);background:transparent;color:inherit;width:7.6em';

  function linhaColeta(c, i, nova){
    var v = nova ? 'n' + i : 'c' + c.id;
    var corte = nova ? '' : (c.corte ? ' · corte ' + esc(c.corte) + (c.corte_conferir ? ' <b style="color:#c98a00">(a conferir)</b>' : '') : ' · <span style="opacity:.7">sem corte lançado</span>');
    return '<label style="display:flex;flex-wrap:wrap;gap:6px;align-items:center;padding:6px 0">'
      + '<input type="radio" name="saidaEsc" value="' + v + '"> <b>Coleta ' + (nova ? 'nova' : c.ordem) + '</b> '
      + '<input type="time" data-ini="' + v + '" value="' + esc(c ? c.inicio : '') + '" style="' + CAMPO + '"> às '
      + '<input type="time" data-fim="' + v + '" value="' + esc(c ? c.fim : '') + '" style="' + CAMPO + '">' + corte + '</label>';
  }
  function desenhar(){
    if(!el || !dia) return;
    var h = '<div style="font-weight:700">Para qual saída são estas vendas?</div>'
      + '<div style="font-size:12px;opacity:.75;margin-bottom:4px">Confira no Mercado Livre → Envios de hoje. Mudou o horário? Corrija aqui antes de subir.</div>';
    if(dia.sem_coleta) h += '<div style="font-size:13px;opacity:.8">Hoje está marcado sem coleta.</div>';
    (dia.coletas || []).forEach(function(c, i){ h += linhaColeta(c, i, false); });
    for(var k = 0; k < novas; k++) h += linhaColeta(null, k, true);
    if(!dia.sem_coleta && (dia.coletas || []).length + novas < 3)
      h += '<button type="button" id="saidaMais" style="font:inherit;font-size:12px;margin:2px 0 6px;padding:4px 10px;border-radius:6px;border:1px solid rgba(128,128,128,.5);background:transparent;color:inherit;cursor:pointer">+ coleta</button>';
    h += '<label style="display:flex;flex-wrap:wrap;gap:6px;align-items:center;padding:6px 0"><input type="radio" name="saidaEsc" value="ag"> <b>Agência</b> — entregar até '
      + '<input type="time" data-ag="1" value="' + esc(dia.agencia ? dia.agencia.fim : '') + '" style="' + CAMPO + '"></label>'
      + '<div id="saidaErro" style="display:none;' + AMBAR + ';border-color:#c62828;color:#c62828"></div>';
    el.innerHTML = h; el.style.display = 'block';
    var mais = document.getElementById('saidaMais');
    if(mais) mais.onclick = function(){ guardar(); novas++; desenhar(); devolver(); };
  }
  /* o redesenho do "+ coleta" não pode apagar o que a pessoa já mexeu */
  var guardado = null;
  function guardar(){
    guardado = {};
    el.querySelectorAll('input[type=time]').forEach(function(i){ guardado[i.getAttribute('data-ini') ? 'i' + i.getAttribute('data-ini') : i.getAttribute('data-fim') ? 'f' + i.getAttribute('data-fim') : 'ag'] = i.value; });
    var r = el.querySelector('input[name=saidaEsc]:checked'); guardado.esc = r ? r.value : null;
  }
  function devolver(){
    if(!guardado) return;
    el.querySelectorAll('input[type=time]').forEach(function(i){ var k = i.getAttribute('data-ini') ? 'i' + i.getAttribute('data-ini') : i.getAttribute('data-fim') ? 'f' + i.getAttribute('data-fim') : 'ag'; if(guardado[k] != null) i.value = guardado[k]; });
    if(guardado.esc){ var r = el.querySelector('input[name=saidaEsc][value="' + guardado.esc + '"]'); if(r) r.checked = true; }
  }
  async function carregar(){
    try{
      var r = await fetch('/api/saidas/dia');
      if(!r.ok){ if(el){ el.style.display = 'none'; el.innerHTML = ''; } dia = null; return; }
      dia = await r.json(); novas = 0; desenhar();
    }catch(e){ dia = null; }
  }
  function valor(sel){ var i = el.querySelector(sel); return i ? i.value : ''; }
  function erro(t){ var d = document.getElementById('saidaErro'); if(d){ d.textContent = t; d.style.display = t ? 'block' : 'none'; } }

  async function escolha(){
    if(!el || !dia) return null;
    erro('');
    var sel = el.querySelector('input[name=saidaEsc]:checked');
    var esc_ = sel ? sel.value : null;
    /* o que mudou nas coletas e na agência */
    var coletas = [], mudouC = false;
    (dia.coletas || []).forEach(function(c){
      var ini = valor('[data-ini="c' + c.id + '"]'), fim = valor('[data-fim="c' + c.id + '"]');
      if(ini !== c.inicio || fim !== c.fim) mudouC = true;
      coletas.push({ id:c.id, inicio:ini, fim:fim });
    });
    var novasLidas = [];
    for(var k = 0; k < novas; k++){
      var ini = valor('[data-ini="n' + k + '"]'), fim = valor('[data-fim="n' + k + '"]');
      if(ini || fim){ mudouC = true; coletas.push({ inicio:ini, fim:fim }); novasLidas.push({ k:k, inicio:ini }); }
    }
    var ag = valor('[data-ag]'), mudouA = ag && (!dia.agencia || dia.agencia.fim !== ag);
    if(esc_ === 'ag' && !ag) throw new Error('Diga o horário da agência que aparece no Mercado Livre.');
    if(esc_ && esc_.charAt(0) === 'n' && !novasLidas.some(function(x){ return 'n' + x.k === esc_; })) throw new Error('Preencha o horário da coleta nova escolhida.');
    var d = dia;
    if(mudouC || mudouA){
      var corpo = { data:dia.data, origem:'upload' };
      if(mudouC) corpo.coletas = coletas;
      if(mudouA) corpo.agencia = { fim:ag };
      var r = await fetch('/api/saidas/dia', { method:'POST', headers:{'Content-Type':'application/json'}, body:JSON.stringify(corpo) });
      var j = {}; try{ j = await r.json(); }catch(e){}
      if(!r.ok){ erro(j.erro || 'Não deu para gravar os horários.'); throw new Error(j.erro || 'Não deu para gravar os horários.'); }
      d = j;
    }
    var id = null;
    if(esc_ === 'ag') id = d.agencia && d.agencia.id;
    else if(esc_ && esc_.charAt(0) === 'c') id = +esc_.slice(1);
    else if(esc_ && esc_.charAt(0) === 'n'){
      var n = novasLidas.filter(function(x){ return 'n' + x.k === esc_; })[0];
      var achou = (d.coletas || []).filter(function(c){ return c.inicio === n.inicio; })[0];
      id = achou ? achou.id : null;
    }
    if(d !== dia){ dia = d; novas = 0; desenhar(); if(esc_){ var v = esc_ === 'ag' ? 'ag' : 'c' + id; var rr = el.querySelector('input[name=saidaEsc][value="' + v + '"]'); if(rr) rr.checked = true; } }
    return id || null;
  }

  function somar(j){
    if(!soma) soma = { marcadas:0, outro_dia:0, outra_modalidade:0, sem:0, ignorada:0, rotulo:'' };
    var s = j && j.saida; if(!s) return;
    if(s.sem_saida) soma.sem += (j.novos || 0);
    else if(s.ignorada) soma.ignorada += (j.novos || 0);
    else { soma.marcadas += s.marcadas || 0; soma.outro_dia += s.outro_dia || 0; soma.outra_modalidade += s.outra_modalidade || 0; soma.rotulo = s.rotulo || soma.rotulo; }
  }
  function texto(){
    var s = soma; soma = null;
    if(!s || !dia) return '';
    var h = '';
    if(s.marcadas) h += '<div style="margin-top:8px;font-weight:600">🚚 ' + s.marcadas + ' venda(s) marcada(s) para <b>' + esc(s.rotulo) + '</b>'
      + (s.outro_dia ? ' · ' + s.outro_dia + ' de outro dia (vão em outra saída)' : '') + '</div>';
    if(s.outra_modalidade) h += '<div style="' + AMBAR + '">⚠ ' + s.outra_modalidade + ' etiqueta(s) de outra modalidade (agência num PDF de coleta, ou o contrário) ficaram sem a saída. Confira o PDF.</div>';
    if(s.sem) h += '<div style="' + AMBAR + '">⚠ Sem saída marcada: ' + s.sem + ' venda(s) nova(s) ficam como "sem coleta marcada".</div>';
    if(s.ignorada) h += '<div style="' + AMBAR + '">⚠ A saída escolhida não foi gravada: falta a permissão "Lançar horários de coleta".</div>';
    return h;
  }
  window.saidaUpload = { montar:function(e){ el = e; if(el){ el.style.display = 'none'; carregar(); } }, escolha:escolha, somar:somar, texto:texto, recarregar:carregar };
})();

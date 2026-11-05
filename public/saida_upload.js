/* saida_upload.js — "PARA QUAL SAÍDA SÃO ESTAS VENDAS?" no upload do PDF
 * (spec HORARIOS-DE-COLETA, D4 e D6, 05/11/2026).
 *
 * Um quadro só, no único lugar de subir o PDF: a 103 Subir PDF de vendas (desde
 * 05/11/2026 a 201 e a 203 não sobem mais PDF — decisão do dono). Quem sobe o PDF olha o ML → Envios de hoje, confere o
 * horário das coletas (corrige ali se mudou) e escolhe a saída das vendas.
 *
 *   saidaUpload.montar(el)   desenha o quadro dentro de `el` para quem sobe o
 *                            PDF. Quem não tem `coleta.horario` (Operação) vê os
 *                            horários TRAVADOS e só escolhe a saída — corrigir
 *                            horário é de Supervisor e Admin (05/11/2026).
 *   saidaUpload.escolha()    grava os horários mudados (origem 'upload') e
 *                            devolve o id da saída escolhida, ou null. Recusa
 *                            do servidor vira erro (o upload não segue).
 *   saidaUpload.somar(j)     junta a resposta de cada PDF
 *   saidaUpload.texto()      o resumo para a linha de resultado
 *
 * Não trava nada (D1): sem escolha, o PDF sobe e a tela avisa em âmbar.
 *
 * Fase 3 (§12 da spec): o PRIMEIRO upload do dia pergunta se o horário de
 * hoje está certo (R-HCO-14). "✓ Está certo" confere o dia (e tira o rascunho
 * da cópia); "✗ Mudou" abre os campos para quem corrige, e para quem é
 * Operação avisa quem corrige — o PDF sobe sem saída (R-HCO-15). Os outros
 * uploads do dia não perguntam (D2).
 */
(function(){
  var esc = function(s){ return String(s == null ? '' : s).replace(/[&<>"]/g, function(c){ return {'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;'}[c]; }); };
  var el = null, dia = null, novas = 0, soma = null, corrigindo = false;
  var BOTAO = 'font:inherit;font-weight:700;padding:8px 14px;border-radius:8px;cursor:pointer;margin:6px 8px 0 0;border:1px solid ';
  var AMBAR = 'margin-top:8px;padding:8px 10px;border-radius:8px;background:rgba(255,184,0,.14);border:1px solid #c98a00;font-weight:600';
  /* estilo na própria linha: a 103 (index.html) tem `label{display:block;
     text-transform:uppercase}` e input largo, que entortavam o quadro */
  var LINHA = 'display:flex;flex-wrap:wrap;gap:6px;align-items:center;padding:6px 0;margin:0;text-transform:none;letter-spacing:normal;font-size:14px;color:inherit';
  var RADIO = 'width:auto;margin:0;display:inline-block';
  var CAMPO_ = 'font:inherit;padding:4px 6px;border-radius:6px;border:1px solid rgba(128,128,128,.5);background:transparent;color:inherit;width:7.6em';

  function linhaColeta(c, i, nova){
    var v = nova ? 'n' + i : 'c' + c.id;
    var trava = dia && dia.pode_editar ? '' : ' disabled title="Quem corrige horário é Supervisor ou Admin"';
    var CAMPO = CAMPO_ + (trava ? ';opacity:.65;cursor:not-allowed' : '');
    var corte = nova ? '' : (c.corte ? ' · corte ' + esc(c.corte) + (c.corte_conferir ? ' <b style="color:#c98a00">(a conferir)</b>' : '') : ' · <span style="opacity:.7">sem corte lançado</span>');
    return '<label style="' + LINHA + '">'
      + '<input type="radio" name="saidaEsc" value="' + v + '" style="' + RADIO + '"> <b>Coleta ' + (nova ? 'nova' : c.ordem) + '</b> '
      + '<input type="time" data-ini="' + v + '" value="' + esc(c ? c.inicio : '') + '" style="' + CAMPO + '"' + trava + '> às '
      + '<input type="time" data-fim="' + v + '" value="' + esc(c ? c.fim : '') + '" style="' + CAMPO + '"' + trava + '>' + corte + '</label>';
  }
  function hora(em){ return String(em || '').slice(11, 16); }
  function resumo(){
    if(dia.sem_coleta) return 'Hoje: <b>sem coleta</b>' + (dia.motivo_texto ? ' (' + (dia.motivo === 'feriado' ? 'Feriado: ' : '') + esc(dia.motivo_texto) + ')' : '') + '.';
    var cs = dia.coletas || [];
    var t = cs.length ? 'Hoje: <b>' + cs.length + ' coleta' + (cs.length > 1 ? 's' : '') + '</b> · '
      + cs.map(function(c){ return c.ordem + 'ª ' + esc(c.inicio) + '–' + esc(c.fim); }).join(' · ') : 'Hoje: <b>nenhuma coleta</b>';
    if(dia.agencia) t += ' · Agência até ' + esc(dia.agencia.fim);
    return t + '.';
  }
  /* a pergunta do primeiro upload do dia */
  function desenharPergunta(){
    var h = '<div style="font-weight:700">Antes de subir: o horário de hoje está certo?</div>'
      + '<div style="margin:6px 0 2px">' + resumo() + '</div>'
      + (dia.rascunho ? '<div style="font-size:12px;color:#c98a00;font-weight:600">Copiado da semana passada: ninguém conferiu ainda.</div>' : '')
      + '<div style="font-size:12px;opacity:.75">Confira no Mercado Livre → Envios de hoje (quantas coletas e os horários).</div>'
      + '<button type="button" id="saidaCerto" style="' + BOTAO + '#2e7d32;background:#2e7d32;color:#fff">✓ Está certo</button>'
      + '<button type="button" id="saidaMudou" style="' + BOTAO + '#c98a00;background:transparent;color:inherit">✗ Mudou</button>'
      + '<div id="saidaErro" style="display:none;' + AMBAR + ';border-color:#c62828;color:#c62828"></div>';
    el.innerHTML = h; el.style.display = 'block';
    document.getElementById('saidaCerto').onclick = function(){ responder('certo'); };
    document.getElementById('saidaMudou').onclick = function(){
      if(dia.pode_editar){ corrigindo = true; desenhar(); }   // quem corrige corrige ali
      else responder('mudou');
    };
  }
  async function responder(r){
    try{
      var x = await fetch('/api/saidas/conferir', { method:'POST', headers:{'Content-Type':'application/json'}, body:JSON.stringify({ resposta:r }) });
      var j = {}; try{ j = await x.json(); }catch(e){}
      if(!x.ok){ erro(j.erro || 'Não deu para gravar a resposta.'); return; }
      dia = j; novas = 0; corrigindo = false; desenhar(); avisarFaixa();
    }catch(e){ erro('Sem conexão: tente de novo.'); }
  }
  /* a faixa de cima (nav.js) se atualiza a cada 60 s; depois de uma resposta
     ou correção ela redesenha na hora, senão diria "falta conferir" no dia
     que acabou de ser conferido */
  function avisarFaixa(){ try{ window.dispatchEvent(new Event('saidas-mudou')); }catch(e){} }
  function desenhar(){
    if(!el || !dia) return;
    var pode = !!dia.pode_editar;
    if(dia.precisa_conferir && !corrigindo) return desenharPergunta();
    /* avisaram que mudou: quem é Operação sobe sem saída; quem corrige corrige */
    if(dia.mudou && !pode){
      el.innerHTML = '<div style="font-weight:700">Para qual saída são estas vendas?</div>'
        + '<div style="' + AMBAR + '">⚠ ' + esc(dia.mudou.por || 'Alguém') + ' avisou às ' + hora(dia.mudou.em) + ' que o horário de hoje mudou no ML. '
        + 'Até quem tem nível Supervisor ou Admin corrigir, o PDF sobe sem saída (as vendas ficam "sem coleta marcada").</div>';
      el.style.display = 'block';
      return;
    }
    var h = '<div style="font-weight:700">Para qual saída são estas vendas?</div>'
      + '<div style="font-size:12px;opacity:.75;margin-bottom:4px">Confira no Mercado Livre → Envios de hoje. '
      + (pode ? 'Mudou o horário? Corrija aqui antes de subir.' : 'Mudou o horário? Avise quem tem nível Supervisor ou Admin: são eles que corrigem.') + '</div>';
    if(dia.mudou && pode) h += '<div style="' + AMBAR + '">⚠ ' + esc(dia.mudou.por || 'Alguém') + ' avisou às ' + hora(dia.mudou.em) + ' que o horário de hoje mudou no ML: corrija abaixo. Ao subir, o horário corrigido vale como a conferência de hoje.</div>';
    else if(corrigindo) h += '<div style="' + AMBAR + '">Corrija o que mudou (pode acrescentar ou tirar coleta). Ao subir, o horário corrigido vale como a conferência de hoje.</div>';
    if(dia.sem_coleta) h += '<div style="font-size:13px;opacity:.8">Hoje está marcado sem coleta' + (dia.motivo_texto ? ' (' + (dia.motivo === 'feriado' ? 'Feriado: ' : '') + esc(dia.motivo_texto) + ')' : '') + '.</div>';
    if(!pode && !(dia.coletas || []).length && !dia.agencia && !dia.sem_coleta)
      h += '<div style="' + AMBAR + '">⚠ O horário das coletas de hoje ainda não foi lançado. O PDF sobe do mesmo jeito, e as vendas ficam "sem coleta marcada".</div>';
    (dia.coletas || []).forEach(function(c, i){ h += linhaColeta(c, i, false); });
    for(var k = 0; k < novas; k++) h += linhaColeta(null, k, true);
    if(pode && !dia.sem_coleta && (dia.coletas || []).length + novas < 3)
      h += '<button type="button" id="saidaMais" style="font:inherit;font-size:12px;margin:2px 0 6px;padding:4px 10px;border-radius:6px;border:1px solid rgba(128,128,128,.5);background:transparent;color:inherit;cursor:pointer">+ coleta</button>';
    if(pode || dia.agencia) h += '<label style="' + LINHA + '"><input type="radio" name="saidaEsc" value="ag" style="' + RADIO + '"> <b>Agência</b> — entregar até '
      + '<input type="time" data-ag="1" value="' + esc(dia.agencia ? dia.agencia.fim : '') + '" style="' + CAMPO_ + (pode ? '' : ';opacity:.65;cursor:not-allowed') + '"' + (pode ? '' : ' disabled') + '></label>';
    if(dia.conferido && !corrigindo) h += '<div style="font-size:12px;opacity:.7;margin-top:4px">Horário de hoje conferido por ' + esc(dia.conferido.por || '?') + ' às ' + hora(dia.conferido.em) + '.</div>';
    h += ''
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
      dia = await r.json(); novas = 0; corrigindo = false; desenhar();
    }catch(e){ dia = null; }
  }
  function valor(sel){ var i = el.querySelector(sel); return i ? i.value : ''; }
  function erro(t){ var d = document.getElementById('saidaErro'); if(d){ d.textContent = t; d.style.display = t ? 'block' : 'none'; } }

  async function escolha(){
    if(!el || !dia) return null;
    if(dia.precisa_conferir && !corrigindo) throw new Error('Antes de subir: responda no quadro se o horário de hoje está certo.');
    if(dia.mudou && !dia.pode_editar) return null;   // sobe sem saída (D1), quem corrige já foi avisado
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
    if(!dia.pode_editar){ mudouC = false; mudouA = false; }   // Operação não grava horário: só escolhe
    else if(corrigindo || dia.mudou) mudouC = true;            // a correção grava mesmo igual: é a conferência do dia
    if(mudouC || mudouA){
      var corpo = { data:dia.data, origem:'upload' };
      if(mudouC) corpo.coletas = coletas;
      if(mudouA) corpo.agencia = { fim:ag };
      var r = await fetch('/api/saidas/dia', { method:'POST', headers:{'Content-Type':'application/json'}, body:JSON.stringify(corpo) });
      var j = {}; try{ j = await r.json(); }catch(e){}
      if(!r.ok){ erro(j.erro || 'Não deu para gravar os horários.'); throw new Error(j.erro || 'Não deu para gravar os horários.'); }
      d = j; corrigindo = false; avisarFaixa();
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
    if(!soma) soma = { marcadas:0, outro_dia:0, outra_modalidade:0, sem:0, rotulo:'' };
    var s = j && j.saida; if(!s) return;
    if(s.sem_saida) soma.sem += (j.novos || 0);
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
    return h;
  }
  window.saidaUpload = { montar:function(e){ el = e; if(el){ el.style.display = 'none'; carregar(); } }, escolha:escolha, somar:somar, texto:texto, recarregar:carregar };
})();

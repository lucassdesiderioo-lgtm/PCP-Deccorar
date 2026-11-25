/* bancada_producao.js — o DESENHO unico das bancadas da producao da medida
 * padrao: 108 Corte de tecido, 110 Serralheria e 107 Montagem (spec
 * PRODUCAO-MAPA-E-MOTOR v7, §14.4, 25/11/2026), no formato da 101 Revisao:
 * em cima as pecas de hoje; a direita a lista (HOJE em destaque, depois os
 * proximos dias e o alvo); a esquerda a peca na mao.
 *
 * A tela NAO conta nada: a lista e o lote aberto vem do servidor
 * (producao_lista.js, corte_bancada.js, montagem_persiana.js). Ela desenha,
 * guarda o cartao escolhido e a quantidade digitada, e manda os bipes.
 *
 * window.BANCADA = { tipo:'tecido'|'tubo'|'montagem', titulo, letra, api, ... }
 */
(function(){
  var C = window.BANCADA;
  var $ = function(s){ return document.querySelector(s); };
  var esc = function(t){ return String(t == null ? '' : t).replace(/[&<>"]/g, function(c){ return { '&':'&amp;', '<':'&lt;', '>':'&gt;', '"':'&quot;' }[c]; }); };
  var CONF_CANC = false;
  var DADOS = null, ERRO_LISTA = false, SEL = null, DIG = '', ENTRADA = false, MSG = null, FIM = null, PERDA = false, ENVIANDO = false, SEMANA = false;
  var MONT = C.tipo === 'montagem';

  function beep(ok){ try{ var a = new (window.AudioContext || window.webkitAudioContext)(), o = a.createOscillator(), g = a.createGain();
    o.connect(g); g.connect(a.destination); o.frequency.value = ok ? 820 : 240; g.gain.value = .05; o.start();
    setTimeout(function(){ o.stop(); a.close(); }, ok ? 100 : 220); }catch(e){} }

  async function carregar(){
    if(ENVIANDO) return;
    try{ var r = await fetch(C.api); if(!r.ok) throw new Error(r.status); DADOS = await r.json(); ERRO_LISTA = false; }
    catch(e){ ERRO_LISTA = true; }
    desenhar();
  }
  async function post(acao, corpo){
    ENVIANDO = true;
    var ctl = ('AbortController' in window) ? new AbortController() : null, t = setTimeout(function(){ if(ctl) ctl.abort(); }, 20000);
    try{
      var r = await fetch(C.api + '/' + acao, { method:'POST', headers:{ 'Content-Type':'application/json' }, body:JSON.stringify(corpo || {}), signal:ctl ? ctl.signal : undefined });
      var j = await r.json().catch(function(){ return { erro:'resposta inválida do servidor' }; });
      return j;
    }catch(e){ return { erro:'Sem conexão. O bipe pode ter sido gravado: confira a tela antes de bipar de novo.', conexao:true }; }
    finally{ clearTimeout(t); ENVIANDO = false; }
  }

  // ── o que a tela mostra ────────────────────────────────────────────────
  function resta(x){ return x.hoje + x.proximos + x.alvo; }
  function cartao(x, grupo){
    var n = grupo === 'hoje' ? x.hoje : grupo === 'prox' ? x.proximos : x.alvo;
    var act = SEL && SEL.chave === x.chave;
    var extra = MONT
      ? '<div class="d" style="font-weight:700;color:' + ((x.tecido < 1 || x.tubo < 1) ? 'var(--amber)' : 'var(--muted)') + '">Na prateleira: ' +
          (x.tecido < 1 ? '⚠ sem tecido cortado' : x.tecido + ' tecido' + (x.tecido > 1 ? 's' : '')) + ' · ' + (x.tubo < 1 ? '⚠ sem tubo cortado' : x.tubo + ' tubo' + (x.tubo > 1 ? 's' : '')) + '</div>'
      : (x.prateleira ? '<div class="d">já há ' + x.prateleira + ' cortad' + (x.prateleira > 1 ? 'as' : 'a') + ' na prateleira</div>' : '');
    var dias = grupo !== 'hoje' && x.dias.length ? '<div class="d">' + x.dias.map(function(d){ return d.rotulo + ' ' + d.n; }).join(' · ') + '</div>' : '';
    return '<button type="button" class="cd' + (act ? ' active' : '') + '" data-item="' + esc(x.chave) + '"><div class="m">' + esc(x.titulo) + '</div><div class="c">' + esc(x.cor) + '</div>' +
      '<div class="sk">' + esc(x.sub).split(' · ').join('<br>') + '</div><div class="n"><b>' + n + '</b><small>' + (grupo === 'hoje' ? 'faltam hoje' : 'faltam') + '</small></div>' + dias + extra + '</button>';
  }
  function mini(x, campo){ return '<button type="button" class="' + (SEL && SEL.chave === x.chave ? 'active' : '') + '" data-item="' + esc(x.chave) + '">' + esc(x.titulo + ' ' + (MONT || C.tipo === 'tecido' ? x.cor.toLowerCase() : '')) + '<b>' + x[campo] + '</b></button>'; }
  function lista(){
    /* Na entrada inicial (§14.10) a lista e de TODO item que a ficha conhece:
       a prateleira pode ter o que hoje nao falta. */
    if(DADOS && ENTRADA && DADOS.itens_entrada) return '<div class="foco fp"><div class="fcab"><span class="ft">Entrada inicial</span><span class="fs">escolha o que já está cortado na prateleira</span></div><div class="gd">' +
      DADOS.itens_entrada.map(function(x){ return '<button type="button" class="cd' + (SEL && SEL.chave === x.chave ? ' active' : '') + '" data-item="' + esc(x.chave) + '"><div class="m">' + esc(x.titulo) + '</div><div class="c">' + esc(x.cor) + '</div><div class="sk">' + esc(x.sub).split(' · ').join('<br>') + '</div></button>'; }).join('') + '</div></div>';
    if(!DADOS) return ERRO_LISTA ? '<div class="aviso">Não deu para carregar a lista. A tela tenta de novo sozinha.</div>' : '<div class="muted">Carregando a lista…</div>';
    var L = DADOS.lista.itens, h = ERRO_LISTA ? '<div class="aviso">Não deu para atualizar a lista agora; os números podem estar velhos.</div>' : '';
    var H = L.filter(function(x){ return x.hoje > 0; }).sort(function(a, b){ return b.hoje - a.hoje; });
    var P = L.filter(function(x){ return x.proximos > 0; }).sort(function(a, b){ return a.primeiro_dia < b.primeiro_dia ? -1 : a.primeiro_dia > b.primeiro_dia ? 1 : b.proximos - a.proximos; });
    var A = L.filter(function(x){ return x.alvo > 0; }).sort(function(a, b){ return b.alvo - a.alvo; });
    var soma = function(l, k){ return l.reduce(function(s, x){ return s + x[k]; }, 0); };
    if(H.length) h += '<div class="foco fh"><div class="fcab"><span class="ft">Hoje</span><span class="fs">o que falta para as vendas de hoje</span><span class="fn">faltam <b>' + soma(H, 'hoje') + '</b></span></div><div class="gd">' + H.map(function(x){ return cartao(x, 'hoje'); }).join('') + '</div></div>';
    else h += '<div class="fechado">✓ Hoje está terminado</div>';
    if(P.length) h += H.length ? '<div class="depois"><h3>Depois de hoje<b>faltam ' + soma(P, 'proximos') + '</b></h3><div class="mini">' + P.map(function(x){ return mini(x, 'proximos'); }).join('') + '</div></div>'
      : '<div class="foco fp"><div class="fcab"><span class="ft">Próximos dias</span><span class="fs">o dia mais cedo primeiro</span><span class="fn">faltam <b>' + soma(P, 'proximos') + '</b></span></div><div class="gd">' + P.map(function(x){ return cartao(x, 'prox'); }).join('') + '</div></div>';
    if(A.length) h += '<div class="depois"><h3>Completar o alvo<b>faltam ' + soma(A, 'alvo') + '</b></h3><div class="mini">' + A.map(function(x){ return mini(x, 'alvo'); }).join('') + '</div></div>';
    if(!L.length) h += '<div class="muted">Nada a ' + (MONT ? 'montar' : 'cortar') + ' agora.</div>';
    if(DADOS.lista.fora && DADOS.lista.fora.length) h += '<details class="depois"><summary class="muted" style="padding:0;cursor:pointer">Ficou fora (' + DADOS.lista.fora.length + ') — sem ficha técnica completa</summary><div class="muted" style="padding:6px 0">' +
      DADOS.lista.fora.map(function(x){ return esc(x.codigo) + ' · ' + esc(x.motivo); }).join('<br>') + '</div></details>';
    return h;
  }
  function teclado(){
    var max = MONT && SEL ? Math.min(SEL.tecido, SEL.tubo) : 999;
    return '<div class="visor">' + (DIG || '—') + '</div>' +
      (DIG && MONT && +DIG > max ? '<div class="bs" style="color:var(--red);font-weight:700">Só há tecido e tubo cortados para ' + max + '.</div>' : '') +
      (DIG && !MONT && SEL && +DIG > resta(SEL) ? '<div class="bs" style="color:var(--amber);font-weight:700">' + (+DIG - resta(SEL)) + ' a mais do que falta: ficam na prateleira.</div>' : '') +
      '<div class="teclado">' + [1,2,3,4,5,6,7,8,9].map(function(k){ return '<button type="button" data-dig="' + k + '">' + k + '</button>'; }).join('') +
      '<button type="button" data-dig="apaga" aria-label="apagar">⌫</button><button type="button" data-dig="0">0</button><button type="button" class="okb" data-dig="ok">OK</button></div>';
  }
  function cab(x){ return '<div class="bm">' + esc(x.titulo) + ' ' + esc(x.cor) + '</div><div class="bc">' + esc(x.sub) + '</div>'; }
  function como(x, n){
    if(C.tipo === 'tecido') return n > 1 ? 'Puxe ' + x.corte_a + ' e corte, ' + n + ' vezes. Depois o corte de ' + x.corte_l + ' em todas.' : 'Puxe ' + x.corte_a + ', corte, e faça o corte de ' + x.corte_l + '.';
    if(C.tipo === 'tubo') return 'Corte ' + n + ' tubo' + (n > 1 ? 's' : '') + ' e ' + n + ' base' + (n > 1 ? 's' : '') + ' em ' + x.corte + '. A base vai junto, sem etiqueta.';
    return '';
  }
  function esquerda(){
    var h = '<input id="scan" autocomplete="off" autocorrect="off" autocapitalize="characters" spellcheck="false" inputmode="text" placeholder="bipe aqui" aria-label="Bipe a etiqueta">';
    if(MSG) h += '<div class="aviso' + (MSG.ok ? ' okk' : '') + '">' + esc(MSG.t) + '</div>';
    var ab = DADOS && DADOS.aberto;
    if(MONT) h += voltou();
    if(ab) return h + (MONT ? montando(ab) : cortando(ab));
    if(FIM) return h + fim();
    if(!SEL) return h + '<div class="banner"><div class="bt">Escolha na lista o que vai ' + (MONT ? 'montar' : 'cortar') + '</div><div class="bs">Comece pelo vermelho: o que falta para hoje.</div></div>' +
      (!MONT && DADOS && DADOS.pode_entrada ? '<label class="entrada"><input type="checkbox" id="entrada"' + (ENTRADA ? ' checked' : '') + '> Entrada inicial (o que já estava cortado no dia da virada)</label>' : '');
    if(!SEL.qtd) return h + '<div class="banner">' + cab(SEL) + (ENTRADA ? '<div class="bs" style="color:var(--amber);font-weight:700">Entrada inicial: não conta tempo nem produtividade.</div>' : '') +
      '<div class="bs">Quantas vai ' + (MONT ? 'montar' : (ENTRADA ? 'lançar' : 'cortar')) + '? (faltam ' + resta(SEL) + (MONT ? ' · na prateleira dá para ' + Math.min(SEL.tecido, SEL.tubo) : '') + ')</div>' + teclado() + '</div>' +
      '<button type="button" class="btn" data-acao="voltar">Cancelar</button>';
    /* quantidade escolhida: espera o primeiro bipe (o corte) ou inicia (a montagem) */
    return h + '<div class="banner rev">' + cab(SEL) + '<div class="bt">INÍCIO</div><div class="bs">Bipe a primeira etiqueta do maço · ' + SEL.qtd + ' peça' + (SEL.qtd > 1 ? 's' : '') + (DADOS ? ' · próxima no maço: ' + esc(DADOS.proxima) : '') + '</div></div>' +
      '<button type="button" class="btn" data-acao="voltar">Cancelar</button>';
  }
  function cortando(ab){
    var x = (DADOS.lista.itens.find(function(i){ return i.chave === ab.item; })) || SEL || { titulo:ab.descricao || ab.item, cor:'', sub:'' };
    var boas = ab.quantidade - ab.perdidas;
    var h = '<div class="banner rev">' + cab(x) + (ab.entrada_inicial ? '<div class="bs" style="color:var(--amber);font-weight:700">Entrada inicial</div>' : '') +
      '<div class="bs">' + esc(como(x, boas)) + '</div>' +
      '<div class="bt" style="font-size:20px">' + (ab.quantidade === 1 ? 'FIM: bipe a etiqueta de novo' : 'Cole e bipe cada etiqueta · ' + ab.pecas.length + ' de ' + boas) + '</div>' +
      '<div class="chips">' + ab.pecas.map(function(p){ return '<span class="chip">' + esc(p.rotulo) + ' ✓</span>'; }).join(' ') + '</div>' +
      (ab.perdidas ? '<div class="bs" style="color:var(--amber);font-weight:700">' + ab.perdidas + ' perdida' + (ab.perdidas > 1 ? 's' : '') + ' no corte</div>' : '') + '</div>';
    if(PERDA) h += '<div class="caixa"><b>Peça perdida no corte</b><select id="motivo" aria-label="motivo">' + DADOS.motivos.map(function(m){ return '<option>' + esc(m) + '</option>'; }).join('') +
      '</select><div class="linha"><button type="button" class="btn perigo" data-acao="perdaOk">Marcar 1 perdida</button><button type="button" class="btn" data-acao="perdaNao">Voltar</button></div></div>';
    else h += '<div class="linha"><button type="button" class="btn perigo" data-acao="perda">Peça perdida no corte</button><button type="button" class="btn" data-acao="cancelar">Cancelar corte</button></div>';
    return h;
  }
  function montando(ab){
    var x = (DADOS.lista.itens.find(function(i){ return i.chave.toUpperCase() === ab.sku.toUpperCase(); })) || { titulo:ab.sku, cor:'', sub:ab.sku };
    var vez = { persiana:'① a etiqueta de SKU', tecido:'② o tecido', tubo:'③ o tubo' }[ab.vez];
    var h = '<div class="banner rev">' + cab(x) +
      (ab.fase === 'preparo' ? '<div class="bt" style="font-size:22px">Peça ' + ab.peca_vez + ' de ' + ab.quantidade + ': bipe ' + vez + '</div>'
        : '<div class="bt" style="font-size:20px">Montando · ao terminar cada peça, bipe ④ a etiqueta de SKU dela</div><div class="bs">' + ab.pecas.filter(function(p){ return p.situacao === 'montando'; }).length + ' de ' + ab.quantidade + ' ainda abertas</div>') + '</div>';
    h += '<table class="pecas"><thead><tr><th></th><th>① SKU</th><th>② Tecido</th><th>③ Tubo</th><th>④ Fim</th></tr></thead><tbody>';
    for(var i = 0; i < ab.quantidade; i++){
      var p = ab.pecas[i] || {};
      h += '<tr><td>' + (i + 1) + '</td><td class="' + (p.codigo ? 'ok' : '') + '">' + (p.numero ? 'Nº ' + p.numero : '—') + '</td><td class="' + (p.tc_codigo ? 'ok' : '') + '">' + (p.tc_codigo ? esc(p.tc_codigo.slice(2).replace(/^0+/, '')) : '—') +
        '</td><td class="' + (p.tb_codigo ? 'ok' : '') + '">' + (p.tb_codigo ? esc(p.tb_codigo.slice(2).replace(/^0+/, '')) : '—') + '</td><td class="' + (p.situacao === 'montada' ? 'ok' : '') + '">' + (p.situacao === 'montada' ? '✓' : '—') + '</td></tr>';
    }
    return h + '</tbody></table><button type="button" class="btn perigo" data-acao="cancelar">Cancelar montagem</button>';
  }
  function fim(){
    var f = FIM, l = f.fechado, n = MONT ? l.quantidade : l.quantidade - l.perdidas;
    var h = '<div class="banner ok"><div class="bm">' + esc(f.titulo) + '</div><div class="bt" style="color:var(--green)">' +
      (MONT ? n + ' persiana' + (n > 1 ? 's montadas' : ' montada') + ' ✓' : 'Corte gravado ✓ ' + n + ' peça' + (n > 1 ? 's' : '')) + '</div>' +
      '<div class="bs">' + (MONT ? 'Foram para o carrinho da revisão.' : (C.tipo === 'tecido' ? 'Leve à prateleira do ' + esc(f.titulo) + '.' : 'Leve à prateleira dos tubos (serve para qualquer cor).')) + '</div>' +
      (l.perdidas ? '<div class="bs" style="color:var(--amber)">' + l.perdidas + ' perdida(s) no corte: voltaram para a lista.</div>' : '') +
      (window.tempoBancada ? window.tempoBancada(f.tempo) : '') + '</div><div class="muted" style="text-align:center">Toque no próximo da lista para continuar.</div>';
    return h;
  }
  function voltou(){
    var v = DADOS && DADOS.voltou;
    if(!v || !v.length) return '';
    return '<div class="volta"><b>↩ Voltou para você (' + v.length + ')</b>' + v.map(function(x){ return '<div>' + esc(x.texto) + '</div>'; }).join('') + '</div>';
  }
  function topo(){
    var d = DADOS && DADOS.dia;
    var feitas = d == null ? '—' : (typeof d === 'number' ? d : d.pecas);
    return '<header><div class="mark">' + C.letra + '</div><div><h1>' + C.titulo + '</h1><div class="hdia" id="hdia"></div></div><span class="hesp"></span>' +
      '<div class="cont"><div><b>' + feitas + '</b>' + (MONT ? 'montadas hoje' : C.tipo === 'tecido' ? 'cortados hoje' : 'tubos hoje') + '</div></div>' +
      '<button type="button" class="btTopo" data-acao="semana">Ver a semana</button></header>';
  }
  function semana(){
    if(!SEMANA || !DADOS) return '';
    var L = DADOS.lista.itens, dias = DADOS.lista.dias || [];
    return '<div id="semana"><div class="sbox" role="dialog" aria-label="A semana"><div class="scab"><h3>A semana</h3><button type="button" data-acao="semana">Fechar</button></div>' +
      '<div style="overflow-x:auto"><table><thead><tr><th>Item</th><th>Hoje</th>' + dias.map(function(d){ return '<th>' + esc(d.rotulo) + '</th>'; }).join('') + '<th>Alvo</th></tr></thead><tbody>' +
      L.map(function(x){ return '<tr><td>' + esc(x.titulo + ' ' + x.cor) + '</td><td>' + (x.hoje || '') + '</td>' + dias.map(function(d){ var y = x.dias.find(function(z){ return z.dia === d.dia; }); return '<td>' + (y ? y.n : '') + '</td>'; }).join('') + '<td>' + (x.alvo || '') + '</td></tr>'; }).join('') +
      '</tbody></table></div></div></div>';
  }

  /* §12: o redesenho nao apaga o que se digita (a quantidade mora em DIG; o
     motivo da perda e o unico campo, e a atualizacao espera por ele). */
  function desenhar(){
    var foco = document.activeElement && document.activeElement.id;
    var mot = $('#motivo') ? $('#motivo').value : null;
    $('#app').innerHTML = topo() + '<div class="corpo"><div class="esq">' + esquerda() + '</div><div class="dir">' + lista() + '</div></div>' + semana();
    if(mot && $('#motivo')) $('#motivo').value = mot;
    var D = ['domingo','segunda','terça','quarta','quinta','sexta','sábado'], M = ['janeiro','fevereiro','março','abril','maio','junho','julho','agosto','setembro','outubro','novembro','dezembro'], d = new Date();
    if($('#hdia')) $('#hdia').textContent = D[d.getDay()] + ', ' + d.getDate() + ' de ' + M[d.getMonth()];
    if(foco === 'motivo' && $('#motivo')) $('#motivo').focus(); else manter();
  }
  function manter(){
    var a = document.activeElement, s = $('#scan');
    if(!s) return;
    if(a && a !== s && /^(INPUT|SELECT|TEXTAREA)$/.test(a.tagName) && a.type !== 'checkbox') return;
    if(a !== s) s.focus({ preventScroll:true });
  }

  // ── o que a pessoa faz ─────────────────────────────────────────────────
  function achar(chave){ if(!DADOS) return null; var l = (ENTRADA && DADOS.itens_entrada) ? DADOS.itens_entrada : DADOS.lista.itens; return l.find(function(x){ return x.chave === chave; }); }
  async function bipe(v){
    if(ENVIANDO) return;
    MSG = null;
    var ab = DADOS && DADOS.aberto, r;
    if(ab) r = await post('bipar', { codigo:v });
    else if(!MONT && SEL && SEL.qtd) r = await post('iniciar', { item:SEL.chave, quantidade:SEL.qtd, etiqueta:v, entrada_inicial:ENTRADA });
    else { MSG = { t:'Escolha na lista o que vai ' + (MONT ? 'montar' : 'cortar') + ', e a quantidade, antes de bipar.' }; beep(false); desenhar(); return; }
    resposta(r);
  }
  async function resposta(r){
    if(r.erro){ MSG = { t:r.erro }; beep(false); }
    else {
      beep(true);
      if(r.fechado){ FIM = { fechado:r.fechado, tempo:r.tempo, titulo: (SEL ? SEL.titulo + ' ' + SEL.cor : (r.fechado.descricao || r.fechado.sku || '')) }; SEL = null; DIG = ''; ENTRADA = false; PERDA = false; }
    }
    await carregar();
  }
  document.addEventListener('click', async function(e){
    var b = e.target.closest('button,[data-item],input[type=checkbox]');
    if(!b){ manter(); return; }
    if(b.id === 'entrada'){ ENTRADA = b.checked; SEL = null; desenhar(); return; }
    var item = b.getAttribute('data-item'), dig = b.getAttribute('data-dig'), acao = b.getAttribute('data-acao');
    if(item){
      if(DADOS && DADOS.aberto){ MSG = { t:'Termine ou cancele ' + (MONT ? 'esta montagem' : 'este corte') + ' antes.' }; beep(false); desenhar(); return; }
      var x = achar(item); if(!x) return;
      if(MONT && Math.min(x.tecido, x.tubo) < 1){ MSG = { t:'Não há ' + (x.tecido < 1 ? 'tecido' : 'tubo') + ' cortado para o ' + x.titulo + ' ' + x.cor + '. Ele precisa passar pel' + (x.tecido < 1 ? 'o corte de tecido (108)' : 'a serralheria (110)') + ' antes.' }; beep(false); desenhar(); return; }
      SEL = Object.assign({}, x); DIG = ''; FIM = null; MSG = null; desenhar(); return;
    }
    if(dig){
      if(dig === 'apaga') DIG = DIG.slice(0, -1);
      else if(dig === 'ok'){
        var q = +DIG; if(!(q >= 1)) return;
        if(MONT){
          if(q > Math.min(SEL.tecido, SEL.tubo)){ beep(false); return; }
          var r = await post('iniciar', { sku:SEL.chave, quantidade:q }); DIG = '';
          if(r.erro){ MSG = { t:r.erro }; beep(false); } else beep(true);
          await carregar(); return;
        }
        SEL.qtd = q; DIG = '';
      }
      else if(DIG.length < 3 && !(DIG === '' && dig === '0')) DIG += dig;
      desenhar(); return;
    }
    if(acao === 'voltar'){ SEL = null; DIG = ''; desenhar(); return; }
    if(acao === 'semana'){ SEMANA = !SEMANA; desenhar(); return; }
    if(acao !== 'cancelar') CONF_CANC = false;
    if(acao === 'perda'){ PERDA = true; desenhar(); var m = $('#motivo'); if(m) m.focus(); return; }
    if(acao === 'perdaNao'){ PERDA = false; desenhar(); return; }
    if(acao === 'perdaOk'){ var mo = $('#motivo') ? $('#motivo').value : ''; PERDA = false; resposta(await post('perdida', { motivo:mo })); return; }
    if(acao === 'cancelar' && !MONT && DADOS && DADOS.aberto && DADOS.aberto.pecas.length > 1 && !CONF_CANC){
      /* ③ REVISAO: cancelar solta as etiquetas bipadas — so se as pecas NAO foram cortadas. */
      CONF_CANC = true; MSG = { t:'As ' + DADOS.aberto.pecas.length + ' etiquetas bipadas voltam para o maço, e as peças saem do sistema. Só cancele se elas NÃO foram cortadas. Toque em Cancelar corte de novo para confirmar.' }; beep(false); desenhar(); return; }
    if(acao === 'cancelar'){ CONF_CANC = false; var rc = await post('cancelar', {}); if(rc.erro){ MSG = { t:rc.erro }; beep(false); } SEL = null; FIM = null; await carregar(); return; }
  });

  /* O bipe: o campo visivel (iPad), Enter ou Tab, e o leitor em rajada fora
     dele. Letras e digitos so; o mesmo codigo em menos de 700 ms e repeticao
     do leitor. */
  var tmr = null, ultimo = '', ultEm = 0;
  function processa(){
    var s = $('#scan'); if(!s) return;
    var v = (s.value || '').replace(/[^A-Za-z0-9]/g, '').toUpperCase(); s.value = '';
    if(v.length < 6) return;
    var t = Date.now(); if(v === ultimo && t - ultEm < 700) return; ultimo = v; ultEm = t;
    bipe(v);
  }
  document.addEventListener('keydown', function(e){
    if(e.target && e.target.id === 'scan' && (e.key === 'Enter' || e.key === 'Tab')){ e.preventDefault(); clearTimeout(tmr); processa(); }
  });
  document.addEventListener('input', function(e){
    if(e.target && e.target.id === 'scan'){ clearTimeout(tmr); tmr = setTimeout(processa, 220); }
  });
  document.addEventListener('focusout', function(){ setTimeout(manter, 60); });
  /* A lista se atualiza sozinha a cada 20 s, menos com a aba escondida, com o
     motivo da perda aberto ou com a quantidade sendo digitada. */
  setInterval(function(){ if(!document.hidden && !PERDA && !DIG && !SEMANA) carregar(); }, 20000);
  carregar();
})();

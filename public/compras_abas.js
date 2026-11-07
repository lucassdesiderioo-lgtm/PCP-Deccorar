/* AS ABAS DA 501 COMPRAS — spec COMPRAS-E-RECEBIMENTO (07/11/2026).
 *
 * A 501 e o mesmo index.html do Admin, servido com `window.TELA_ADMIN`; este
 * arquivo desenha as abas DENTRO do painel de Compras (`#v-compras`) e cada
 * fase da spec acrescenta as suas em `ABAS`. Os cards de antes (comparar, o
 * que comprar, pedidos, minimos) continuam, dentro das abas deles.
 *
 * ⚠️ ESCONDER UMA ABA NAO E SEGURANCA. Quem tranca e a rota (permDaRota) e a
 * poda do JSON no servidor (quem recebe nao ve preco, R-CMP-28). A aba some so
 * para nao mostrar um caminho que da "sem permissao".
 *
 * ⚠️ RECUSA FICA NA LINHA E O DIGITADO FICA (a licao da #33): toda resposta com
 * `erro` aparece ao lado do botao que a pediu, e nada e redesenhado por cima.
 */
(function(){
  var $ = function(s, r){ return (r || document).querySelector(s); };
  var $$ = function(s, r){ return Array.prototype.slice.call((r || document).querySelectorAll(s)); };
  function esc(v){ return String(v == null ? '' : v).replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;'); }
  function n3(v){ return v == null || v === '' ? '—' : (Math.round((+v) * 1000) / 1000).toLocaleString('pt-BR'); }
  function brl(v){ return v == null ? '—' : 'R$ ' + (+v).toLocaleString('pt-BR', { minimumFractionDigits:2, maximumFractionDigits:2 }); }
  function data(v){ if(!v) return '—'; var s = String(v); return s.slice(8,10) + '/' + s.slice(5,7) + '/' + s.slice(0,4) + (s.length > 10 ? ' ' + s.slice(11,16) : ''); }
  async function api(metodo, rota, corpo){
    try{
      var r = await fetch(rota, { method:metodo, headers:{ 'Content-Type':'application/json' }, body: corpo === undefined ? undefined : JSON.stringify(corpo) });
      var c = null; try{ c = await r.json(); }catch(e){ c = { erro:'resposta sem JSON (' + r.status + ')' }; }
      if(!r.ok && c && !c.erro) c.erro = 'recusado (' + r.status + ')';
      return c;
    }catch(e){ return { erro:'sem conexão com o servidor — tente de novo' }; }
  }
  function msg(el, r, okTxt){
    if(!el) return;
    if(r && r.erro){ el.style.color = 'var(--red)'; el.textContent = r.erro; }
    else{ el.style.color = 'var(--green)'; el.textContent = okTxt || 'salvo'; setTimeout(function(){ if(el.textContent === (okTxt || 'salvo')) el.textContent = ''; }, 3000); }
  }
  /* As permissoes da propria pessoa vem do /api/telas/minhas (nav.js). */
  var PERMS = null, AG = false;
  async function perms(){
    if(PERMS) return PERMS;
    var r = await api('GET', '/api/telas/minhas');
    PERMS = (r && r.perms) || []; AG = !!(r && r.admin_geral);
    return PERMS;
  }
  function pode(){ if(AG) return true; for(var i = 0; i < arguments.length; i++) if((PERMS || []).indexOf(arguments[i]) >= 0) return true; return false; }

  var ESTILO = '<style>'
    + '#cmpAbas .cab{display:flex;gap:4px;flex-wrap:wrap;border-bottom:1px solid var(--line);margin:0 0 16px}'
    + '#cmpAbas .cab div{padding:10px 14px;font-size:13px;font-weight:600;color:var(--muted);cursor:pointer;border-bottom:2px solid transparent;margin-bottom:-1px}'
    + '#cmpAbas .cab div.on{color:var(--txt);border-bottom-color:var(--amber)}'
    + '.cmpG{display:grid;grid-template-columns:repeat(auto-fill,minmax(180px,1fr));gap:10px 14px;margin:8px 0}'
    + '.cmpG label{display:block;font-size:12px;color:var(--muted);margin-bottom:4px}'
    + '.cmpG input,.cmpG select,.cmpG textarea{width:100%;box-sizing:border-box}'
    + '.cmpTab{width:100%;border-collapse:collapse}.cmpTab td,.cmpTab th{padding:7px 8px;border-bottom:1px solid var(--line);text-align:left;font-size:13px;vertical-align:top}'
    + '.cmpRola{overflow-x:auto;max-width:100%}'
    + '.cmpChip{display:inline-block;padding:2px 8px;border-radius:10px;font-size:11px;border:1px solid var(--line);color:var(--muted);margin-right:4px}'
    + '.cmpChip.am{color:var(--amber);border-color:var(--amber)}.cmpChip.vm{color:var(--red);border-color:var(--red)}.cmpChip.vd{color:var(--green);border-color:var(--green)}'
    + '.cmpAvi{border:1px solid var(--amber);color:var(--amber);border-radius:10px;padding:10px 12px;margin:8px 0;font-size:13px}'
    + '</style>';

  /* ── AS ABAS ────────────────────────────────────────────────────────── */
  var ABAS = [];
  var ATUAL = null;
  function registrar(a){ ABAS.push(a); }
  function velho(ids){ ['cmpVelhoLista','cmpVelhoPedidos','cmpVelhoMateriais'].forEach(function(i){ var e = document.getElementById(i); if(e) e.style.display = ids.indexOf(i) >= 0 ? '' : 'none'; }); }

  async function abrir(id){
    await perms();
    var cab = $('#cmpAbas'); if(!cab) return;
    var vis = ABAS.filter(function(a){ return !a.perms || pode.apply(null, a.perms); });
    if(!vis.length) return;
    try{ if(!id) id = localStorage.getItem('cmpAba'); }catch(e){}
    var a = vis.find(function(x){ return x.id === id; }) || vis[0];
    ATUAL = a.id; try{ localStorage.setItem('cmpAba', a.id); }catch(e){}
    cab.innerHTML = ESTILO + '<div class="cab">' + vis.map(function(x){ return '<div data-cmp-aba="' + x.id + '" class="' + (x.id === a.id ? 'on' : '') + '">' + esc(x.nome) + '</div>'; }).join('') + '</div>';
    velho(a.velho || []);
    var corpo = $('#cmpCorpo'); corpo.innerHTML = '';
    if(a.desenhar) await a.desenhar(corpo);
  }
  document.addEventListener('click', function(ev){
    var t = ev.target.closest && ev.target.closest('[data-cmp-aba]');
    if(t) abrir(t.getAttribute('data-cmp-aba'));
  });

  window.CMP = { abrir:abrir, registrar:registrar, api:api, esc:esc, n3:n3, brl:brl, data:data, msg:msg, pode:pode, perms:perms, $:$, $$:$$,
    get atual(){ return ATUAL; } };

  /* ── LISTA DE COMPRAS (o que ja existia) ─────────────────────────────── */
  registrar({ id:'lista', nome:'Lista de compras', perms:['compras.ver'], velho:['cmpVelhoLista'] });

  /* ── MATERIAIS (fase 1, R-CMP-01 a 10) ───────────────────────────────── */
  var OPC = null, ALM = [];
  registrar({ id:'materiais', nome:'Materiais', perms:['compras.ver','componente.cadastrar'], velho:['cmpVelhoMateriais'],
    desenhar: async function(box){
      OPC = await api('GET', '/api/componentes/opcoes');
      ALM = await api('GET', '/api/almoxarifados'); if(!Array.isArray(ALM)) ALM = [];
      var comps = await api('GET', '/api/componentes'); if(!Array.isArray(comps)) comps = [];
      var pend = await api('GET', '/api/componentes/pendencias');
      var filtro = '';
      function linhas(){
        var f = filtro.toLowerCase();
        return comps.filter(function(c){ return !f || (c.nome + ' ' + (c.categoria || '') + ' ' + (c.almoxarifado_nome || '')).toLowerCase().indexOf(f) >= 0; })
          .map(function(c){
            return '<tr' + (c.ativo ? '' : ' style="opacity:.55"') + '><td><b>' + esc(c.nome) + '</b>' + (c.codigo ? '<div class="sub">' + esc(c.codigo) + '</div>' : '') + '</td>'
              + '<td>' + esc(c.categoria || '—') + '</td><td>' + esc((OPC.modos.find(function(m){ return m.valor === c.modo_saldo; }) || {}).nome || '—') + '</td>'
              + '<td>' + (c.almoxarifado_nome ? esc(c.almoxarifado_nome) : '<span class="cmpChip am">sem almoxarifado</span>') + '</td>'
              + '<td>' + (c.vai_ficha === 0 ? '<span class="cmpChip">fora da ficha</span>' : '<span class="cmpChip vd">vai para a ficha</span>') + '</td>'
              + '<td>' + n3(c.estoque) + ' ' + esc(c.unidade || '') + '</td>'
              + '<td><button class="ghost" data-mat-edit="' + c.id + '">Editar</button></td></tr>';
          }).join('');
      }
      box.innerHTML = '<div class="card"><div style="font-weight:700">Materiais — tudo que a empresa compra</div>'
        + '<div class="sub" style="margin:4px 0 10px">Café, estilete, tubo e tecido moram no mesmo cadastro. <b>Vai para a ficha</b> decide o que a ficha técnica oferece. '
        + 'O <b>modo de saldo</b> decide como o material é recebido e contado: <b>sem saldo</b> (café, detergente — um toque "chegou tudo"), <b>por quantidade</b> (tubo, comando — contagem cega) '
        + 'ou <b>por volume</b> (rolo de tecido — um registro por volume, com etiqueta e endereço).</div>'
        + (pend && pend.sem_almoxarifado && pend.sem_almoxarifado.n ? '<div class="cmpAvi">' + pend.sem_almoxarifado.n + ' material(is) sem almoxarifado: o Recebimento não sabe para onde levar e a contagem não os acha.</div>' : '')
        + '<input id="matFiltro" placeholder="filtrar por nome, categoria ou almoxarifado" style="width:100%;max-width:420px;margin:6px 0 10px">'
        + '<div class="cmpRola"><table class="cmpTab"><thead><tr><th>Material</th><th>Categoria</th><th>Saldo</th><th>Almoxarifado</th><th>Ficha</th><th>Estoque</th><th></th></tr></thead><tbody id="matLinhas">' + linhas() + '</tbody></table></div>'
        + '<div class="row-actions" style="margin-top:12px"><button class="primary" data-perm="componente.cadastrar" data-mat-edit="novo">+ Material novo</button></div></div>'
        + '<div id="matForm"></div>';
      $('#matFiltro').oninput = function(){ filtro = this.value; $('#matLinhas').innerHTML = linhas(); };
      box.onclick = function(ev){
        var b = ev.target.closest('[data-mat-edit]'); if(!b) return;
        var id = b.getAttribute('data-mat-edit');
        formulario(id === 'novo' ? null : comps.find(function(c){ return String(c.id) === id; }), async function(){ await abrir('materiais'); });
      };
    } });

  function opt(lista, sel, vazio){ return (vazio ? '<option value="">' + esc(vazio) + '</option>' : '') + lista.map(function(o){ var v = o.valor != null ? o.valor : o; var n = o.nome != null ? o.nome : o; return '<option value="' + esc(v) + '"' + (String(v) === String(sel == null ? '' : sel) ? ' selected' : '') + (o.desligada ? ' disabled' : '') + '>' + esc(n) + (o.desligada ? ' — ' + esc(o.motivo) : '') + '</option>'; }).join(''); }

  /* Um material de cada vez (a licao da ficha: dez campos em duas linhas de
     tabela dava para editar e nao dava para ler). So o campo MUDADO vai no
     POST — campo ausente nao e campo vazio (#33). */
  function formulario(c, depois){
    var box = $('#matForm'); var novo = !c; c = c || {};
    var almOpts = ALM.filter(function(a){ return a.ativo || a.id === c.almoxarifado_id; }).map(function(a){ return { valor:a.id, nome:a.nome + (a.ativo ? '' : ' (desativado)') }; });
    var campos = [
      ['nome','Nome','text'], ['codigo','Código (opcional)','text'],
      ['categoria','Categoria','sel', OPC.categorias, '— escolha —'],
      ['unidade','Unidade de consumo','sel', [{valor:'m',nome:'metro'},{valor:'un',nome:'unidade'},{valor:'kg',nome:'quilo'}], null],
      ['modo_saldo','Modo de saldo (obrigatório)','sel', OPC.modos, novo ? '— escolha —' : null],
      ['almoxarifado_id','Almoxarifado padrão','sel', almOpts, '— nenhum ainda —'],
      ['vai_ficha','Vai para a ficha técnica?','sel', [{valor:1,nome:'sim — é material da persiana'},{valor:0,nome:'não — é consumo da empresa'}], null],
      ['um_por_nivel','Um volume por nível?','sel', [{valor:0,nome:'não'},{valor:1,nome:'sim (como o rolo de tecido)'}], null],
      ['ncm','NCM (casa a nota por XML)','text'],
      ['peso_padrao_kg','Peso de 1 unidade (kg)','num'],
      ['tol_aviso_pct','Tolerância de aviso (%)','num'], ['tol_retem_pct','Tolerância de reter (%)','num'],
      ['contagem_dias','Contar a cada (dias)','num'], ['margem_dias','Margem do "pedir até" (dias)','num'],
      ['como_sai','Como sai do estoque','sel', OPC.como_sai, null]
    ];
    var val = function(k){ if(novo){ return ({ vai_ficha:1, um_por_nivel:0, unidade:'un', como_sai:'contagem', tol_aviso_pct:2, tol_retem_pct:5, contagem_dias:30, margem_dias:5 })[k]; } return c[k]; };
    box.innerHTML = '<div class="card"><div style="font-weight:700">' + (novo ? 'Material novo' : esc(c.nome)) + '</div>'
      + '<div class="sub">Para nascer bastam nome, categoria, unidade, modo de saldo e almoxarifado. O resto se completa depois.</div>'
      + '<div class="cmpG">' + campos.map(function(f){
          var v = val(f[0]);
          var inp = f[2] === 'sel' ? '<select data-mf="' + f[0] + '">' + opt(f[3], v, f[4]) + '</select>'
            : '<input data-mf="' + f[0] + '"' + (f[2] === 'num' ? ' type="number" step="any" min="0"' : '') + ' value="' + esc(v == null ? '' : v) + '">';
          return '<div><label>' + esc(f[1]) + '</label>' + inp + '<div class="sub" data-mf-erro="' + f[0] + '" style="color:var(--red)"></div></div>';
        }).join('') + '</div>'
      + '<div class="sub">O <b>estoque</b> não se edita aqui: entra pelo Recebimento e se corrige pela Contagem.</div>'
      + '<div class="row-actions" style="margin-top:10px"><button class="primary" data-perm="componente.cadastrar" id="mfSalvar">Salvar</button> '
      + '<button class="ghost" id="mfFechar">Fechar</button> <span class="msg" id="mfMsg"></span></div></div>';
    var orig = {}; $$('[data-mf]', box).forEach(function(e){ orig[e.getAttribute('data-mf')] = e.value; });
    $('#mfFechar').onclick = function(){ box.innerHTML = ''; };
    $('#mfSalvar').onclick = async function(){
      var corpo = novo ? {} : { id:c.id };
      $$('[data-mf]', box).forEach(function(e){ var k = e.getAttribute('data-mf'); if(novo ? e.value !== '' : e.value !== orig[k]) corpo[k] = e.value; });
      if(!novo && Object.keys(corpo).length === 1){ msg($('#mfMsg'), null, 'nada mudou'); return; }
      var r = await api('POST', '/api/componentes', corpo);
      msg($('#mfMsg'), r);
      if(!r.erro){ setTimeout(depois, 400); }
    };
  }

  /* ── ALMOXARIFADOS (fase 1, R-CMP-38) ───────────────────────────────── */
  registrar({ id:'almox', nome:'Almoxarifados', perms:['almoxarifado.cadastrar','componente.cadastrar','compras.ver'],
    desenhar: async function(box){
      var l = await api('GET', '/api/almoxarifados'); if(!Array.isArray(l)) l = [];
      box.innerHTML = '<div class="card"><div style="font-weight:700">Almoxarifados</div>'
        + '<div class="sub" style="margin:4px 0 10px">Os lugares da fábrica onde o material mora. Criar, renomear e desativar é aqui, sem código. '
        + 'Almoxarifado com material dentro <b>não se apaga</b>: desativa, e volta pelo "Reativar".</div>'
        + '<div class="cmpRola"><table class="cmpTab"><thead><tr><th>Nome</th><th>Onde fica</th><th>O que guarda</th><th>Materiais</th><th></th></tr></thead><tbody>'
        + l.map(function(a){
            return '<tr' + (a.ativo ? '' : ' style="opacity:.55"') + '><td><input data-al="nome" data-id="' + a.id + '" value="' + esc(a.nome) + '"></td>'
              + '<td><input data-al="local" data-id="' + a.id + '" value="' + esc(a.local || '') + '"></td>'
              + '<td><input data-al="finalidade" data-id="' + a.id + '" value="' + esc(a.finalidade || '') + '"></td>'
              + '<td>' + a.materiais + '</td><td><button class="ghost" data-perm="almoxarifado.cadastrar" data-al-ativo="' + (a.ativo ? 0 : 1) + '" data-id="' + a.id + '">' + (a.ativo ? 'Desativar' : 'Reativar') + '</button>'
              + ' <span class="sub" data-al-msg="' + a.id + '"></span></td></tr>';
          }).join('') + '</tbody></table></div>'
        + '<div class="row-actions" style="margin-top:12px;align-items:flex-end;gap:8px;flex-wrap:wrap">'
        + '<div><label class="sub">Almoxarifado novo</label><br><input id="alNome" placeholder="Ex.: Expedição"></div>'
        + '<div><label class="sub">Onde fica</label><br><input id="alLocal"></div>'
        + '<button class="primary" data-perm="almoxarifado.cadastrar" id="alAdd">Criar</button> <span class="msg" id="alMsg"></span></div></div>'
        + '<div id="almEnderecos"></div>';
      box.onchange = async function(ev){
        var e = ev.target; if(!e.matches('[data-al]')) return;
        var r = await api('POST', '/api/almoxarifados', { id:+e.getAttribute('data-id'), [e.getAttribute('data-al')]:e.value });
        msg($('[data-al-msg="' + e.getAttribute('data-id') + '"]'), r);
      };
      box.onclick = async function(ev){
        var b = ev.target.closest('[data-al-ativo]');
        if(b){ var id = +b.getAttribute('data-id'), at = +b.getAttribute('data-al-ativo');
          var r = at ? await api('POST', '/api/almoxarifados', { id:id, ativo:1 }) : await api('DELETE', '/api/almoxarifados/' + id);
          if(r.erro) return msg($('[data-al-msg="' + id + '"]'), r); return abrir('almox'); }
        if(ev.target.id === 'alAdd'){
          var r2 = await api('POST', '/api/almoxarifados', { nome:$('#alNome').value, local:$('#alLocal').value });
          if(r2.erro) return msg($('#alMsg'), r2); abrir('almox');
        }
      };
      if(window.CMP.enderecos) window.CMP.enderecos($('#almEnderecos'), l);
    } });

  /* ── PEDIDOS (o card de antes, ate a fase 2) ─────────────────────────── */
  registrar({ id:'pedidos', nome:'Pedidos', perms:['compras.ver','pedido.criar','pedido.pagar'], velho:['cmpVelhoPedidos'] });
})();

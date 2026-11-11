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
  /* Leitura que falhou nao vira lista vazia (revisao do PR #305): "Nenhum pedido"
     com a rota respondendo 403 diz uma coisa falsa. */
  function falhou(box, r){
    box.innerHTML = '<div class="card"><div class="cmpAvi">Não consegui ler esta lista: ' + esc((r && r.erro) || 'sem resposta') + '.</div></div>';
  }
  function msg(el, r, okTxt){
    if(!el) return;
    if(r && r.erro){ el.style.color = 'var(--red)'; el.textContent = r.erro; }
    else{ el.style.color = 'var(--green)'; el.textContent = okTxt || 'salvo'; setTimeout(function(){ if(el.textContent === (okTxt || 'salvo')) el.textContent = ''; }, 3000); }
  }
  /* As permissoes da propria pessoa vem do /api/telas/minhas (nav.js). */
  var PERMS = null, AG = false, TELAS = [];
  async function perms(){
    if(PERMS) return PERMS;
    var r = await api('GET', '/api/telas/minhas');
    PERMS = (r && r.perms) || []; AG = !!(r && r.admin_geral); TELAS = (r && r.telas) || [];
    return PERMS;
  }
  /* ⚠️ SEIS ABAS DESTE ARQUIVO VIRARAM TELAS (ARRUMAR-O-LUGAR fase 2,
     11/11/2026): Materiais (1101), Fornecedores (1102), Almoxarifados (1103),
     Recebimento retido (1201), Notas (1301) e Certificado (1302) — o `tela:` do
     registrar diz qual. Na tela nova (`TELA_ADMIN.cmp`) a aba é desenhada
     SOZINHA, sem a faixa; na 501 ela não aparece, e o link antigo (o #notas, ou
     a aba lembrada neste computador) leva à tela nova. O código da aba não
     mudou: só o lugar. */
  var SOLO = (window.TELA_ADMIN && window.TELA_ADMIN.cmp) || null;
  function rotaDaTela(n){ var t = TELAS.find(function(x){ return x.n === n; }); return t ? t.rota : null; }
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
    if(SOLO) id = SOLO;
    else{
      /* o link antigo numa aba que saiu: o #hash do endereço, ou a aba lembrada */
      var pedido = id || (location.hash || '').replace('#', '');
      if(!pedido){ try{ pedido = localStorage.getItem('cmpAba'); }catch(e){} }
      var saiu = ABAS.find(function(x){ return x.id === pedido && x.tela && x.tela !== 501; });
      if(saiu){
        try{ localStorage.removeItem('cmpAba'); }catch(e){}
        var destino = rotaDaTela(saiu.tela);
        if(destino){ location.replace(destino); return; }
        /* sem acesso à tela nova: fica na 501, e o #hash da aba que saiu sai do endereço */
        if(location.hash){ try{ history.replaceState(null, '', location.pathname + location.search); }catch(e){} }
        id = null;
      }
    }
    var vis = ABAS.filter(function(a){ return (SOLO ? a.id === SOLO : !(a.tela && a.tela !== 501)) && (!a.perms || pode.apply(null, a.perms)) && (!a.le || pode.apply(null, a.le)); });
    if(!vis.length){
      /* Quem abre a 501 só pela chave de uma aba que virou tela (o almoxarifado,
         o material): nada de compra aqui. Some os cards velhos e diz para onde
         foi o trabalho dele (③ REVISÃO, fase 2). */
      if(!SOLO){
        velho([]);
        var foram = ABAS.filter(function(x){ return x.tela && x.tela !== 501; }).map(function(x){ return x.tela; });
        var minhas = TELAS.filter(function(t){ return foram.indexOf(t.n) >= 0; });
        cab.innerHTML = ESTILO + '<div class="card"><div class="cmpAvi">As abas do seu acesso mudaram de tela em 11/11/2026: '
          + (minhas.length ? minhas.map(function(t){ return '<a href="' + esc(t.rota) + '">' + t.n + ' ' + esc(t.nome) + '</a>'; }).join(' · ') : 'nenhuma tela de compra para o seu acesso') + '.</div></div>';
        $('#cmpCorpo').innerHTML = '';
      }
      return;
    }
    if(!SOLO){ try{ if(!id) id = localStorage.getItem('cmpAba'); }catch(e){} }
    var a = vis.find(function(x){ return x.id === id; }) || vis[0];
    ATUAL = a.id; if(!SOLO){ try{ localStorage.setItem('cmpAba', a.id); }catch(e){} }
    cab.innerHTML = ESTILO + (SOLO ? '' : '<div class="cab">' + vis.map(function(x){ return '<div data-cmp-aba="' + x.id + '" class="' + (x.id === a.id ? 'on' : '') + '">' + esc(x.nome) + '</div>'; }).join('') + '</div>');
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
  registrar({ id:'materiais', tela:1101, nome:'Materiais', perms:['compras.ver','componente.cadastrar'], le:['compras.ver'], velho:['cmpVelhoMateriais'],
    desenhar: async function(box){
      OPC = await api('GET', '/api/componentes/opcoes');
      ALM = await api('GET', '/api/almoxarifados'); if(!Array.isArray(ALM)) ALM = [];
      var comps = await api('GET', '/api/componentes'); if(!Array.isArray(comps)) return falhou(box, comps);
      var pend = await api('GET', '/api/componentes/pendencias');
      var filtro = '';
      function linhas(){
        var f = filtro.toLowerCase();
        return comps.filter(function(c){ return !f || (c.nome + ' ' + (c.codigo_cadastro || '') + ' ' + (c.codigo || '') + ' ' + (c.categoria || '') + ' ' + (c.almoxarifado_nome || '')).toLowerCase().indexOf(f) >= 0; })
          .map(function(c){
            /* O codigo de cadastro (MAT-0001), o "usado em" das duas fichas e o
               consumido no mes por operacao (FICHAS-NO-CADASTRO-UNICO). */
            var us = (c.usado_em || []);
            var usado = us.length ? us.map(function(u){ return '<div class="sub">' + (u.operacao === 'sobmedida' ? 'Sob medida' : 'Medida padrão') + ' · ' + esc(u.modelo) + ' · <code>' + esc(u.expressao) + '</code></div>'; }).join('')
              : '<div class="sub">em ficha nenhuma</div>';
            var cm = c.consumo_mes || {};
            var est = c.como_sai === 'ficha' ? '' : ' <span class="cmpChip">estimado</span>';
            var consumo = (cm.padrao || cm.sobmedida) ? '<div class="sub">no mês: padrão ' + n3(cm.padrao || 0) + ' · <span style="white-space:nowrap">sob medida ' + n3(cm.sobmedida || 0) + ' ' + esc(c.unidade || '') + '</span>' + est + '</div>' : '';
            return '<tr' + (c.ativo ? '' : ' style="opacity:.55"') + '><td><b>' + esc(c.nome) + '</b><div class="sub"><code>' + esc(c.codigo_cadastro || '') + '</code>' + (c.codigo ? ' · ' + esc(c.codigo) : '') + '</div>' + usado + '</td>'
              + '<td>' + esc(c.categoria || '—') + '</td><td>' + esc((OPC.modos.find(function(m){ return m.valor === c.modo_saldo; }) || {}).nome || '—') + '</td>'
              + '<td>' + (c.almoxarifado_nome ? esc(c.almoxarifado_nome) : '<span class="cmpChip am">sem almoxarifado</span>') + '</td>'
              + '<td>' + (c.vai_ficha === 0 ? '<span class="cmpChip">fora da ficha</span>' : '<span class="cmpChip vd">vai para a ficha</span>') + '</td>'
              + '<td>' + n3(c.estoque) + ' ' + esc(c.unidade || '') + (c.como_sai === 'ficha' ? '<div class="sub">sai pela ficha</div>' : '') + consumo + '</td>'
              + '<td><button class="ghost" data-mat-edit="' + c.id + '">Editar</button></td></tr>';
          }).join('');
      }
      box.innerHTML = '<div class="card"><div style="font-weight:700">Materiais — tudo que a empresa compra</div>'
        + '<div class="sub" style="margin:4px 0 10px">Café, estilete, tubo e tecido moram no mesmo cadastro. <b>Vai para a ficha</b> decide o que a ficha técnica oferece. '
        + 'O <b>modo de saldo</b> decide como o material é recebido e contado: <b>sem saldo</b> (café, detergente — um toque "chegou tudo"), <b>por quantidade</b> (tubo, comando — contagem cega) '
        + 'ou <b>por volume</b> (rolo de tecido — um registro por volume, com etiqueta e endereço).</div>'
        + (pend && pend.sem_almoxarifado && pend.sem_almoxarifado.n ? '<div class="cmpAvi">' + pend.sem_almoxarifado.n + ' material(is) sem almoxarifado: o Recebimento não sabe para onde levar e a contagem não os acha.</div>' : '')
        + '<input id="matFiltro" placeholder="nome, código MAT-0001, categoria ou almoxarifado" style="width:100%;max-width:460px;margin:6px 0 10px">'
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
      ['como_sai','Como sai do estoque','sel', OPC.como_sai, null],
      ['sm_tecido_id','Tecido do sob medida (o rolo nasce lá)','sel', ((OPC.tecidos_sm && OPC.tecidos_sm.tecidos) || []).map(function(t){ return { valor:t.id, nome:t.nome }; }), '— não é tecido do sob medida —']
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
  registrar({ id:'almox', tela:1103, nome:'Almoxarifados', perms:['almoxarifado.cadastrar','componente.cadastrar','compras.ver'],
    desenhar: async function(box){
      var l = await api('GET', '/api/almoxarifados'); if(!Array.isArray(l)) return falhou(box, l);
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

  /* ── FORNECEDORES (fase 2, R-CMP-11 e 12) ──────────────────────────── */
  var OPCC = null;
  async function opcoes(){ if(!OPCC) OPCC = await api('GET', '/api/compras/opcoes'); return OPCC; }
  registrar({ id:'fornecedores', tela:1102, nome:'Fornecedores', perms:['compras.ver','fornecedor.cadastrar'], le:['compras.ver'],
    desenhar: async function(box){
      var o = await opcoes();
      var l = await api('GET', '/api/fornecedores'); if(!Array.isArray(l)) return falhou(box, l);
      var verPag = pode('pedido.pagar');
      var COLS = [['nome','Nome'],['tipo','Tipo'],['cnpj','CNPJ'],['contato','Contato'],['telefone','Telefone'],['whatsapp','WhatsApp'],['prazo_entrega','Prazo digitado (dias)']]
        .concat(verPag ? [['pix','Chave Pix'],['banco','Banco'],['agencia','Agência'],['conta','Conta']] : []);
      function campo(f, k){
        if(k === 'tipo') return '<select data-fo="tipo" data-id="' + f.id + '">' + opt(o.tipos_fornecedor.map(function(t){ return { valor:t, nome:t }; }), f.tipo, '—') + '</select>';
        return '<input data-fo="' + k + '" data-id="' + f.id + '" value="' + esc(f[k] == null ? '' : f[k]) + '" style="min-width:110px">';
      }
      box.innerHTML = '<div class="card"><div style="font-weight:700">Fornecedores</div>'
        + '<div class="sub" style="margin:4px 0 10px">Fornecedor cadastrado é para <b>quem se compra de novo</b> (indústrias, os três de tecido). '
        + 'Na compra de marketplace a loja vai como texto no pedido, sem cadastro. ' + (verPag ? 'Os dados de pagamento só aparecem a quem paga.' : '') + '</div>'
        + '<div class="cmpRola"><table class="cmpTab"><thead><tr>' + COLS.map(function(c){ return '<th>' + esc(c[1]) + '</th>'; }).join('') + '<th></th></tr></thead><tbody>'
        + l.map(function(f){ return '<tr' + (f.ativo ? '' : ' style="opacity:.55"') + '>' + COLS.map(function(c){ return '<td>' + campo(f, c[0]) + '</td>'; }).join('')
            + '<td><span class="sub" data-fo-prazo="' + f.id + '"></span> <span class="sub" data-fo-msg="' + f.id + '"></span></td></tr>'; }).join('')
        + '</tbody></table></div>'
        + '<div class="row-actions" style="margin-top:12px;gap:8px;align-items:flex-end;flex-wrap:wrap"><div><label class="sub">Fornecedor novo</label><br><input id="foNome"></div>'
        + '<div><label class="sub">Tipo</label><br><select id="foTipo">' + opt(o.tipos_fornecedor.map(function(t){ return { valor:t, nome:t }; }), '', '—') + '</select></div>'
        + '<button class="primary" data-perm="fornecedor.cadastrar" id="foAdd">Criar</button> <span class="msg" id="foMsg"></span></div></div>';
      /* O PRAZO QUE VALE (R-CMP-36): o medido com 3 recebimentos, senao o digitado — e a tela diz qual. */
      l.forEach(async function(f){ var pz = await api('GET', '/api/compras/prazo?fornecedor_id=' + f.id); var e = $('[data-fo-prazo="' + f.id + '"]');
        if(e && pz && pz.dias != null) e.textContent = 'prazo valendo: ' + n3(pz.dias) + ' d (' + (pz.fonte === 'medido' ? 'medido em ' + pz.n + ' compras' : 'digitado — menos de 3 recebimentos') + ')'; });
      box.onchange = async function(ev){
        var e = ev.target; if(!e.matches('[data-fo]')) return;
        var r = await api('POST', '/api/fornecedores', { id:+e.getAttribute('data-id'), [e.getAttribute('data-fo')]:e.value });
        msg($('[data-fo-msg="' + e.getAttribute('data-id') + '"]'), r);
      };
      box.onclick = async function(ev){
        if(ev.target.id !== 'foAdd') return;
        var r = await api('POST', '/api/fornecedores', { nome:$('#foNome').value, tipo:$('#foTipo').value });
        if(r.erro) return msg($('#foMsg'), r); abrir('fornecedores');
      };
    } });

  /* ── PEDIDOS (fase 2, R-CMP-15 a 20) ────────────────────────────────── */
  var NOME_ST = { rascunho:'rascunho', aguardando_aprovacao:'aguardando aprovação', comprado:'comprado', parcial:'parcial', recebido:'recebido', cancelado:'cancelado' };
  var COR_ST = { rascunho:'', aguardando_aprovacao:'am', comprado:'am', parcial:'am', recebido:'vd', cancelado:'vm' };
  function nomeCanal(o, v){ var c = (o.canais || []).find(function(x){ return x.valor === v; }); return c ? c.nome : (v || '—'); }
  registrar({ id:'pedidos', nome:'Pedidos', perms:['compras.ver','pedido.criar','pedido.pagar','pedido.aprovar'], le:['pedido.ver'],
    desenhar: async function(box){
      var o = await opcoes();
      var l = await api('GET', '/api/pedidos'); if(!Array.isArray(l)) return falhou(box, l);
      box.innerHTML = '<div class="card"><div style="font-weight:700">Pedidos de compra</div>'
        + '<div class="sub" style="margin:4px 0 10px">rascunho → <b>comprado</b> (com canal, nº do pedido no fornecedor e data) → parcial → recebido. '
        + 'Acima da alçada de quem criou, o pedido espera o aprovador. Só pedido <b>comprado</b> aparece na fila do Recebimento.</div>'
        + '<div class="cmpRola"><table class="cmpTab"><thead><tr><th>Nº</th><th>Fornecedor / loja</th><th>Canal</th><th>Valor</th><th>Status</th><th>Compra</th><th></th></tr></thead><tbody>'
        + (l.length ? l.map(function(p){
            return '<tr><td class="code">' + esc(p.numero) + (p.rapida ? ' <span class="cmpChip">rápida</span>' : '') + '</td>'
              + '<td>' + esc(p.fornecedor_nome || p.loja || '—') + '</td><td>' + esc(nomeCanal(o, p.canal)) + '</td><td>' + brl(p.valor_previsto) + '</td>'
              + '<td><span class="cmpChip ' + (COR_ST[p.status] || '') + '">' + esc(NOME_ST[p.status] || p.status) + '</span>' + (p.pago_em ? ' <span class="cmpChip vd">pago</span>' : '') + '</td>'
              + '<td class="sub">' + data(p.comprado_em) + (p.numero_externo ? '<br>nº ' + esc(p.numero_externo) : '') + '</td>'
              + '<td><button class="ghost" data-pd="' + p.id + '">Abrir</button></td></tr>';
          }).join('') : '<tr><td colspan="7" class="sub">Nenhum pedido ainda. Os pedidos nascem da Lista de compras ("Gerar pedidos") ou de uma Compra rápida.</td></tr>')
        + '</tbody></table></div></div><div id="pdDet"></div><div id="pdAlc"></div>';
      box.onclick = function(ev){ var b = ev.target.closest('[data-pd]'); if(b) detalhe(+b.getAttribute('data-pd')); };
      if(pode('alcada.definir', 'pedido.aprovar')) alcadas($('#pdAlc'));
    } });

  async function detalhe(id){
    var o = await opcoes();
    var box = $('#pdDet');
    var p = await api('GET', '/api/pedidos/' + id);
    if(p.erro){ box.innerHTML = '<div class="card" style="color:var(--red)">' + esc(p.erro) + '</div>'; return; }
    var h = '<div class="card"><div style="display:flex;justify-content:space-between;flex-wrap:wrap;gap:8px"><div style="font-weight:700">' + esc(p.numero) + ' · ' + esc(p.fornecedor_nome || p.loja || '—')
      + ' <span class="cmpChip ' + (COR_ST[p.status] || '') + '">' + esc(NOME_ST[p.status] || p.status) + '</span></div><div class="sub">criado por ' + esc(p.criado_por || '—') + ' em ' + data(p.criado_em) + '</div></div>';
    h += '<div class="cmpRola"><table class="cmpTab" style="margin-top:8px"><thead><tr><th>Item</th><th>Comprado</th><th>Declarado</th><th>Recebido</th><th>Valor</th></tr></thead><tbody>'
      + (p.itens || []).map(function(i){
          var comp = i.unidade_compra ? n3(i.qtd_compra) + ' ' + esc(i.unidade_compra) + ' × ' + brl(i.preco_unid_compra) : n3(i.qtd_embalagem) + ' × ' + esc(i.embalagem || '') + ' × ' + brl(i.preco_unit);
          return '<tr><td>' + esc(i.item) + '</td><td>' + comp + '</td><td>' + (i.qtd_declarada != null ? n3(i.qtd_declarada) + ' ' + esc(i.unidade || '') : '—') + '</td><td>' + n3(i.qtd_recebida) + '</td><td>' + brl(i.desembolso) + '</td></tr>';
        }).join('') + '</tbody></table></div>';
    h += '<div class="sub" style="margin-top:6px">Total ' + brl(p.valor_previsto) + (!('alcada' in p) ? '' : p.alcada ? ' · alçada de quem criou: ' + brl(p.alcada.limite) : ' · quem criou não tem alçada (sem limite)') + '</div>';
    if(p.comprado_em) h += '<div class="sub">Comprado em ' + data(p.comprado_em) + ' · ' + esc(nomeCanal(o, p.canal)) + (p.loja ? ' · loja ' + esc(p.loja) : '') + ' · nº ' + esc(p.numero_externo || '—') + ' · por ' + esc(p.comprado_por || '—') + '</div>';
    if(p.aprovado_em) h += '<div class="sub">Aprovado por ' + esc(p.aprovado_por) + ' em ' + data(p.aprovado_em) + ' — "' + esc(p.motivo_aprovacao) + '"</div>';
    if(p.status === 'rascunho'){
      h += '<div style="margin-top:12px;font-weight:600">Marcar como comprado</div><div class="cmpG">'
        + '<div><label>Canal</label><select id="pcCanal">' + opt(o.canais, '', '— escolha —') + '</select></div>'
        + '<div><label>Loja (marketplace)</label><input id="pcLoja"></div>'
        + '<div><label>Nº do pedido no fornecedor</label><input id="pcNum"></div>'
        + '<div><label>Data da compra</label><input id="pcData" type="date" value="' + new Date().toISOString().slice(0,10) + '"></div></div>'
        + '<button class="primary" data-perm="pedido.criar" id="pcComprar">Comprado</button> <span class="msg" id="pcMsg"></span>';
    }
    if(p.status === 'aguardando_aprovacao'){
      h += '<div class="cmpAvi">Acima da alçada de ' + esc(p.criado_por || 'quem criou') + '. Só o aprovador dele (ou o Admin Geral) passa para comprado, com o motivo.</div>'
        + '<div class="cmpG"><div style="grid-column:1/-1"><label>Motivo da aprovação</label><input id="paMotivo"></div></div>'
        + '<button class="primary" data-perm="pedido.aprovar" id="paAprovar">Aprovar e passar para comprado</button> <span class="msg" id="paMsg"></span>';
    }
    if(['rascunho','aguardando_aprovacao','comprado','parcial'].indexOf(p.status) >= 0)
      h += ' <button class="ghost" data-perm="pedido.criar" id="pcCancelar">Cancelar pedido</button> <button class="ghost" id="pcWa" data-perm="compras.valores pedido.criar pedido.aprovar pedido.pagar nota.lancar custo.ver">Texto de WhatsApp</button>';
    h += '<div id="pcWaTxt"></div>';
    /* PARCELAS: so chegam a quem pode ver (a poda e no servidor). */
    if(Array.isArray(p.parcelas)){
      h += '<div style="margin-top:14px;font-weight:600">Parcelas</div><div class="sub">Registro de como foi pago — ainda não é contas a pagar.</div>'
        + '<table class="cmpTab"><thead><tr><th>#</th><th>Forma</th><th>Valor</th><th>Vencimento</th><th>Pago</th><th></th></tr></thead><tbody>'
        + p.parcelas.map(function(x){ return '<tr><td>' + x.numero + '</td><td>' + esc(x.forma) + '</td><td>' + brl(x.valor_centavos / 100) + '</td><td>' + data(x.vencimento) + '</td>'
            + '<td>' + (x.pago_em ? data(x.pago_em) + ' · ' + esc(x.pago_por || '') : '<button class="ghost" data-perm="pedido.pagar" data-pg="' + x.id + '">Pagar</button>') + '</td>'
            + '<td>' + (x.pago_em ? '' : '<button class="ghost" data-pgdel="' + x.id + '">tirar</button>') + '</td></tr>'; }).join('')
        + '</tbody></table><div class="cmpG"><div><label>Forma</label><select id="ppForma">' + opt(o.formas, 'pix') + '</select></div>'
        + '<div><label>Valor (R$)</label><input id="ppValor" type="number" step="0.01" min="0"></div><div><label>Vencimento</label><input id="ppVenc" type="date"></div>'
        + '<div><label>Em quantas vezes</label><input id="ppVezes" type="number" min="1" value="1"></div></div>'
        + '<button class="ghost" id="ppAdd">+ Parcela(s)</button> <span class="msg" id="ppMsg"></span>';
    }
    h += '<div style="margin-top:14px;font-weight:600">Anexos</div>'
      + (p.anexos || []).map(function(a){ return '<div class="sub">📎 <a style="color:var(--blue)" target="_blank" href="/api/compras/anexos/' + a.id + '">' + esc(a.nome || a.tipo) + '</a> · ' + esc(a.tipo) + ' · ' + data(a.criado_em) + ' · ' + esc(a.criado_por || '') + '</div>'; }).join('')
      + '<div class="cmpG"><div><label>Tipo</label><select id="anTipo">' + opt(o.tipos_anexo, 'orcamento') + '</select></div><div><label>Arquivo</label><input id="anArq" type="file"></div></div>'
      + '<button class="ghost" id="anAdd">Anexar</button> <span class="msg" id="anMsg"></span></div>';
    box.innerHTML = h;
    box.onclick = async function(ev){
      var t = ev.target, r;
      if(t.id === 'pcComprar'){ r = await api('POST', '/api/pedidos/' + id + '/comprar', { canal:$('#pcCanal').value, loja:$('#pcLoja').value, numero_externo:$('#pcNum').value, comprado_em:$('#pcData').value });
        if(r.erro) return msg($('#pcMsg'), r); return abrir('pedidos').then(function(){ detalhe(id); }); }
      if(t.id === 'paAprovar'){ r = await api('POST', '/api/pedidos/' + id + '/aprovar', { motivo:$('#paMotivo').value });
        if(r.erro) return msg($('#paMsg'), r); return abrir('pedidos').then(function(){ detalhe(id); }); }
      if(t.id === 'pcCancelar'){ var m = prompt('Por que está cancelando? (vai para a auditoria)'); if(!m) return;
        r = await api('POST', '/api/pedidos/' + id + '/cancelar', { motivo:m }); if(r.erro) return alert(r.erro); return abrir('pedidos'); }
      if(t.id === 'pcWa'){ r = await api('GET', '/api/pedidos/' + id + '/whatsapp');
        /* a recusa NÃO vai para a caixa do texto a mandar (③ REVISÃO): ali ela seria copiada como a mensagem */
        $('#pcWaTxt').innerHTML = r.erro ? '<div class="cmpAvi">' + esc(r.erro) + '</div>' : '<textarea style="width:100%;min-height:140px;margin-top:8px">' + esc(r.texto) + '</textarea>'; return; }
      if(t.matches('[data-pg]')){ r = await api('POST', '/api/parcelas/' + t.getAttribute('data-pg') + '/pagar', {}); if(r.erro) return alert(r.erro); return detalhe(id); }
      if(t.matches('[data-pgdel]')){ r = await api('DELETE', '/api/parcelas/' + t.getAttribute('data-pgdel')); if(r.erro) return alert(r.erro); return detalhe(id); }
      if(t.id === 'ppAdd'){
        var vezes = Math.max(1, parseInt($('#ppVezes').value, 10) || 1), tot = parseFloat($('#ppValor').value), venc = $('#ppVenc').value, lista = [];
        if(!(tot > 0)) return msg($('#ppMsg'), { erro:'diga o valor' });
        var cada = Math.floor(tot * 100 / vezes) / 100;
        for(var i = 0; i < vezes; i++){
          var v = i === vezes - 1 ? Math.round((tot - cada * (vezes - 1)) * 100) / 100 : cada, d = '';
          if(venc){ var dt = new Date(venc + 'T12:00:00'); dt.setMonth(dt.getMonth() + i); d = dt.toISOString().slice(0, 10); }
          lista.push({ forma:$('#ppForma').value, valor:v, vencimento:d });
        }
        r = await api('POST', '/api/pedidos/' + id + '/parcelas', { parcelas:lista }); if(r.erro) return msg($('#ppMsg'), r); return detalhe(id);
      }
      if(t.id === 'anAdd'){
        var f = $('#anArq').files[0]; if(!f) return msg($('#anMsg'), { erro:'escolha o arquivo' });
        var b64 = await new Promise(function(ok){ var fr = new FileReader(); fr.onload = function(){ ok(String(fr.result).split(',')[1]); }; fr.readAsDataURL(f); });
        r = await api('POST', '/api/compras/anexos', { pedido_id:id, tipo:$('#anTipo').value, nome:f.name, base64:b64 }); if(r.erro) return msg($('#anMsg'), r); return detalhe(id);
      }
    };
  }

  async function alcadas(box){
    var l = await api('GET', '/api/compras/alcadas'); if(!Array.isArray(l)) l = [];
    var pes = []; try{ pes = await (await fetch('/api/auth/pessoas')).json(); }catch(e){}
    pes = Array.isArray(pes) ? pes : (pes.pessoas || []);
    var po = pes.map(function(x){ return { valor:x.id, nome:x.nome }; });
    var edita = pode('alcada.definir');
    box.innerHTML = '<div class="card"><div style="font-weight:700">Alçada de compra</div>'
      + '<div class="sub" style="margin:4px 0 10px">Pedido acima do limite de quem o criou espera o aprovador (ou o Admin Geral). Quem não está aqui <b>não tem limite</b>. Só o Admin Geral define.</div>'
      + '<table class="cmpTab"><thead><tr><th>Pessoa</th><th>Limite</th><th>Aprovador</th><th></th></tr></thead><tbody>'
      + (l.length ? l.map(function(a){ return '<tr><td>' + esc(a.usuario_nome) + '</td><td>' + brl(a.limite) + '</td><td>' + esc(a.aprovador_nome || '— só o Admin Geral') + '</td><td>'
          + (edita ? '<button class="ghost" data-alc-tira="' + a.usuario_id + '">tirar</button>' : '') + '</td></tr>'; }).join('') : '<tr><td colspan="4" class="sub">Ninguém tem alçada: todo pedido passa direto para comprado.</td></tr>')
      + '</tbody></table>'
      + (edita ? '<div class="cmpG"><div><label>Pessoa</label><select id="alcU">' + opt(po, '', '—') + '</select></div><div><label>Limite (R$)</label><input id="alcL" type="number" min="0" step="0.01"></div>'
          + '<div><label>Aprovador</label><select id="alcA">' + opt(po, '', '— só o Admin Geral —') + '</select></div></div><button class="ghost" id="alcOk">Definir</button> <span class="msg" id="alcMsg"></span>' : '')
      + '</div>';
    box.onclick = async function(ev){
      var r;
      if(ev.target.id === 'alcOk'){ r = await api('POST', '/api/compras/alcadas', { usuario_id:$('#alcU').value, limite:$('#alcL').value, aprovador_id:$('#alcA').value }); if(r.erro) return msg($('#alcMsg'), r); return alcadas(box); }
      var t = ev.target.closest('[data-alc-tira]'); if(t){ r = await api('DELETE', '/api/compras/alcadas/' + t.getAttribute('data-alc-tira')); if(r.erro) return alert(r.erro); alcadas(box); }
    };
  }

  /* ── RECEBIMENTO RETIDO E AVISOS (fase 3, R-CMP-32/33) ─────────────── */
  registrar({ id:'retidos', tela:1201, nome:'Recebimento retido', perms:['recebimento.liberar','compras.ver'],
    desenhar: async function(box){
      var r = await api('GET', '/api/recebimento/retidos'); var it = (r && r.itens) || [], av = (r && r.avisos) || [];
      var decide = pode('recebimento.liberar');
      function pesos(x){ return x.peso_10_kg ? '10 un = ' + n3(x.peso_10_kg) + ' kg (' + n3(x.peso_10_kg / 10) + ' cada) · esperado pela nota ' + n3(x.esperado_nota_kg) + (x.esperado_cadastro_kg ? ' · pelo cadastro ' + n3(x.esperado_cadastro_kg) : '') + ' · desvio ' + n3(x.desvio_pct) + '%' : 'sem pesagem'; }
      box.innerHTML = '<div class="card"><div style="font-weight:700">Entregas retidas</div>'
        + '<div class="sub" style="margin:4px 0 10px">Não entraram no saldo: o peso passou da tolerância de reter, ou a contagem não bateu com o declarado. Sai com um toque — nunca fica preso.</div>'
        + (it.length ? it.map(function(x){
            return '<div class="card" style="background:transparent"><b>' + esc(x.item) + '</b> · ' + esc(x.numero) + ' · ' + esc(x.fornecedor || '—') + '<div class="sub">'
              + 'contados ' + n3(x.qtd_contada) + ' ' + esc(x.unidade || '') + (x.qtd_declarada != null ? ' · declarado ' + n3(x.qtd_declarada) : '') + ' · ' + pesos(x)
              + ' · recebido por ' + esc(x.recebido_por || '—') + ' em ' + data(x.criado_em) + '</div>'
              + (decide ? '<div class="cmpG"><div style="grid-column:span 2"><label>Motivo (fica gravado)</label><input data-rt-mot="' + x.id + '"></div></div>'
                + '<button class="primary" data-rt="' + x.id + '" data-d="aceitar">Aceitar</button> <button class="ghost" data-rt="' + x.id + '" data-d="aceitar_reclamar">Aceitar e reclamar com o fornecedor</button> '
                + '<button class="ghost" data-rt="' + x.id + '" data-d="devolver">Devolver</button> <span class="msg" data-rt-msg="' + x.id + '"></span>' : '') + '</div>';
          }).join('') : '<div class="sub">Nada retido.</div>') + '</div>'
        + '<div class="card"><div style="font-weight:700">Avisos de peso (entraram no saldo)</div><div class="sub" style="margin:4px 0 10px">O peso ficou entre as duas tolerâncias. Dê ciência.</div>'
        + (av.length ? av.map(function(x){ return '<div style="margin-bottom:8px"><b>' + esc(x.item) + '</b> · ' + esc(x.numero) + '<div class="sub">' + pesos(x) + '</div>'
            + (decide ? '<button class="ghost" data-ci="' + x.id + '">Dar ciência</button> <span class="msg" data-ci-msg="' + x.id + '"></span>' : '') + '</div>'; }).join('') : '<div class="sub">Nenhum aviso esperando.</div>') + '</div>';
      box.onclick = async function(ev){
        var b = ev.target.closest('[data-rt]');
        if(b){ var id = b.getAttribute('data-rt');
          var res = await api('POST', '/api/recebimento/itens/' + id + '/decidir', { decisao:b.getAttribute('data-d'), motivo:$('[data-rt-mot="' + id + '"]').value });
          if(res.erro) return msg($('[data-rt-msg="' + id + '"]'), res); return abrir('retidos'); }
        var c = ev.target.closest('[data-ci]');
        if(c){ var res2 = await api('POST', '/api/recebimento/itens/' + c.getAttribute('data-ci') + '/ciencia', {}); if(res2.erro) return msg($('[data-ci-msg="' + c.getAttribute('data-ci') + '"]'), res2); abrir('retidos'); }
      };
    } });

  /* ── NOTAS (fase 4, R-CMP-22 a 27) ───────────────────────────────────── */
  var CAMPOS_NOTA = [['quantidade','Qtd'],['valor_produto','Produto'],['desconto','Desconto'],['frete','Frete'],['seguro','Seguro'],['outras','Outras'],['ipi','IPI'],['icms','ICMS'],['icms_st','ICMS-ST']];
  registrar({ id:'notas', tela:1301, nome:'Notas', perms:['nota.lancar','custo.ver'],
    desenhar: async function(box){
      var reg = await api('GET', '/api/notas/regime');
      var notas = await api('GET', '/api/notas'); if(!Array.isArray(notas)) return falhou(box, notas);
      var peds = await api('GET', '/api/pedidos'); var pedsFalhou = !Array.isArray(peds); if(pedsFalhou) peds = [];
      var nomeReg = function(v){ var x = (reg.regimes || []).find(function(r){ return r.valor === v; }); return x ? x.nome : v; };
      box.innerHTML = '<div class="card"><div style="font-weight:700">Notas fiscais de compra</div>'
        + '<div class="sub" style="margin:4px 0 10px"><b>Custo pago</b> = produto − desconto + frete + seguro + outras + IPI + ICMS-ST. <b>Custo líquido</b> = pago − os créditos que o regime aproveita. '
        + 'Regime vigente: <b>' + esc(nomeReg(reg.vigente)) + '</b> — cada nota grava o regime da data dela. O custo médio do material anda pelo líquido ÷ o que foi recebido.</div>'
        + '<div class="cmpRola"><table class="cmpTab"><thead><tr><th>Nota</th><th>Pedido</th><th>Emitente</th><th>Emissão</th><th>Regime</th><th>Total pago</th><th>Líquido</th></tr></thead><tbody>'
        + (notas.length ? notas.map(function(n){ var liq = (n.itens || []).reduce(function(s, i){ return s + (i.custo_liquido || 0); }, 0);
            return '<tr><td>' + (n.sem_nota ? '<span class="cmpChip am">sem nota</span>' : esc(n.numero) + (n.serie ? '/' + esc(n.serie) : '')) + (n.origem && n.origem !== 'manual' ? ' <span class="cmpChip">' + esc(n.origem) + '</span>' : '') + '</td>'
              + '<td class="code">' + esc(n.pedido_numero || '—') + '</td><td>' + esc(n.emitente_nome || '—') + '</td><td>' + data(n.emissao) + '</td><td>' + esc(nomeReg(n.regime)) + '</td><td>' + brl(n.total_nota) + '</td><td>' + brl(liq) + '</td></tr>'; }).join('')
          : '<tr><td colspan="7" class="sub">Nenhuma nota lançada.</td></tr>') + '</tbody></table></div></div>'
        + (pode('nota.lancar') ? '<div class="card"><div style="font-weight:700">Lançar nota</div><div class="cmpG"><div style="grid-column:span 2"><label>Pedido</label><select id="ntPed">'
            + opt(peds.filter(function(p){ return p.status !== 'cancelado' && p.status !== 'rascunho'; }).map(function(p){ return { valor:p.id, nome:p.numero + ' · ' + (p.fornecedor_nome || p.loja || '—') }; }), '', '— escolha —') + '</select></div></div>' + (pedsFalhou ? '<div class="cmpAvi">Não consegui ler os pedidos: a lista acima pode estar faltando.</div>' : '') + '<div id="ntForm"></div></div>' : '')
        + '<div id="ntDfe"></div><div id="ntXml"></div><div id="ntRegras"></div>';
      var sel = $('#ntPed'); if(sel) sel.onchange = function(){ formNota(+this.value); };
      regrasCredito($('#ntRegras'), reg);
      if(window.CMP.xml) window.CMP.xml($('#ntXml'));
      if(window.CMP.dfe) window.CMP.dfe($('#ntDfe'));
    } });

  async function formNota(pid){
    var box = $('#ntForm'); if(!pid){ box.innerHTML = ''; return; }
    var p = await api('GET', '/api/pedidos/' + pid);
    box.innerHTML = '<div class="cmpG"><div><label>Sem nota?</label><select id="ntSem"><option value="0">não — tem nota</option><option value="1">sim — compra sem nota</option></select></div>'
      + '<div><label>Número</label><input id="ntNum"></div><div><label>Série</label><input id="ntSerie"></div><div><label>Emissão</label><input id="ntEmi" type="date" value="' + new Date().toISOString().slice(0,10) + '"></div>'
      + '<div><label>CNPJ do emitente</label><input id="ntCnpj"></div><div><label>Emitente</label><input id="ntEmit" value="' + esc(p.fornecedor_nome || p.loja || '') + '"></div>'
      + '<div><label>Frete só no total (R$)</label><input id="ntFrete" type="number" step="0.01" min="0"></div><div><label>Desconto só no total (R$)</label><input id="ntDesc" type="number" step="0.01" min="0"></div>'
      + '<div><label>Seguro só no total</label><input id="ntSeg" type="number" step="0.01" min="0"></div><div><label>Outras despesas no total</label><input id="ntOut" type="number" step="0.01" min="0"></div></div>'
      + '<div class="sub">O que vier só no total da nota é <b>rateado pelo valor</b> entre os itens.</div>'
      + '<div class="cmpRola"><table class="cmpTab"><thead><tr><th>Item</th>' + CAMPOS_NOTA.map(function(c){ return '<th>' + c[1] + '</th>'; }).join('') + '<th>Pago (sem nota)</th></tr></thead><tbody>'
      + (p.itens || []).map(function(i){ return '<tr data-nti="' + i.id + '"><td>' + esc(i.item) + '</td>' + CAMPOS_NOTA.map(function(c){
          var v = c[0] === 'quantidade' ? (i.qtd_compra != null ? i.qtd_compra : i.qtd_embalagem) : (c[0] === 'valor_produto' ? Math.round((i.desembolso || 0) * 100) / 100 : '');
          return '<td><input data-ntc="' + c[0] + '" type="number" step="any" min="0" value="' + esc(v) + '" style="width:90px"></td>'; }).join('')
          + '<td><input data-ntc="valor_pago" type="number" step="0.01" min="0" style="width:90px"></td></tr>'; }).join('')
      + '</tbody></table></div><button class="primary" data-perm="nota.lancar" id="ntOk">Lançar nota</button> <span class="msg" id="ntMsg"></span>';
    $('#ntOk').onclick = async function(){
      var itens = Array.prototype.map.call(box.querySelectorAll('[data-nti]'), function(tr){
        var o = { pedido_item_id:+tr.getAttribute('data-nti') };
        tr.querySelectorAll('[data-ntc]').forEach(function(e){ if(e.value !== '') o[e.getAttribute('data-ntc')] = e.value; });
        return o; });
      var r = await api('POST', '/api/notas', { pedido_id:pid, sem_nota:$('#ntSem').value === '1', numero:$('#ntNum').value, serie:$('#ntSerie').value, emissao:$('#ntEmi').value,
        emitente_cnpj:$('#ntCnpj').value, emitente_nome:$('#ntEmit').value, frete_total:$('#ntFrete').value, desconto_total:$('#ntDesc').value,
        seguro_total:$('#ntSeg').value, outras_total:$('#ntOut').value, itens:itens });
      if(r.erro) return msg($('#ntMsg'), r);
      abrir('notas');
    };
  }

  function regrasCredito(box, reg){
    var nomeReg = function(v){ var x = (reg.regimes || []).find(function(r){ return r.valor === v; }); return x ? x.nome : v; };
    if(!box) return;
    var ag = pode('alcada.definir');
    box.innerHTML = '<div class="card"><div style="font-weight:700">Regime e tabela de crédito</div>'
      + '<div class="sub" style="margin:4px 0 10px">O crédito de ICMS e IPI vem desta tabela, e não do código. Mudar o regime não dá crédito retroativo: cada nota guarda o regime dela. '
      + (ag ? '' : 'Só o Admin Geral muda.') + '</div>'
      + '<table class="cmpTab"><thead><tr><th>Regime</th><th>Imposto</th><th>Aproveita?</th><th>Desde</th></tr></thead><tbody>'
      + (reg.regras || []).map(function(r){ return '<tr><td>' + esc(nomeReg(r.regime)) + '</td><td>' + esc(String(r.imposto || '').toUpperCase().replace('_', '-')) + '</td><td>' + (r.aproveita ? 'sim' : 'não') + '</td><td>' + data(r.vigente_desde) + '</td></tr>'; }).join('') + '</tbody></table>'
      + (ag ? '<div class="cmpG"><div><label>Regime vigente</label><select id="rgVig">' + opt(reg.regimes, reg.vigente) + '</select></div></div><button class="ghost" id="rgOk">Mudar regime</button> <span class="msg" id="rgMsg"></span>'
        + '<div class="cmpG"><div><label>Regime</label><select id="rcReg">' + opt(reg.regimes, 'real') + '</select></div><div><label>Imposto</label><select id="rcImp"><option value="icms">ICMS</option><option value="ipi">IPI</option></select></div>'
        + '<div><label>Aproveita?</label><select id="rcAp"><option value="1">sim</option><option value="0">não</option></select></div><div><label>Desde</label><input id="rcDesde" type="date"></div></div>'
        + '<button class="ghost" id="rcOk">Acrescentar regra</button> <span class="msg" id="rcMsg"></span>' : '') + '</div>';
    box.onclick = async function(ev){
      var r;
      if(ev.target.id === 'rgOk'){ r = await api('POST', '/api/notas/regime', { vigente:$('#rgVig').value }); if(r.erro) return msg($('#rgMsg'), r); return abrir('notas'); }
      if(ev.target.id === 'rcOk'){ r = await api('POST', '/api/notas/regras', { regime:$('#rcReg').value, imposto:$('#rcImp').value, aproveita:$('#rcAp').value === '1', vigente_desde:$('#rcDesde').value }); if(r.erro) return msg($('#rcMsg'), r); return abrir('notas'); }
    };
  }

  /* ── ENDERECOS DOS ALMOXARIFADOS (fase 5, R-CMP-38) ──────────────────── */
  window.CMP.enderecos = async function(box, l){
    if(!box) return;
    var ativos = l.filter(function(a){ return a.ativo; });
    var cad = pode('almoxarifado.cadastrar');
    box.innerHTML = '<div class="card"><div style="font-weight:700">Endereços</div><div class="sub" style="margin:4px 0 10px">haste → andar → nível, como no armazém do sob medida. '
      + 'Cada nível tem um código de bipe (E-000000) para a tela 503 Almoxarifado.</div>'
      + '<div class="cmpG"><div><label>Almoxarifado</label><select id="enAlm">' + opt(ativos.map(function(a){ return { valor:a.id, nome:a.nome }; }), '', '— escolha —') + '</select></div></div>'
      + '<div id="enLista"></div>'
      + (cad ? '<div class="cmpG"><div><label>Haste</label><input id="enH" placeholder="H1"></div><div><label>Andares (separados por vírgula)</label><input id="enA" placeholder="A1, A2, A3"></div>'
        + '<div><label>Níveis por andar</label><input id="enN" placeholder="N1, N2"></div></div><button class="ghost" id="enOk">Criar endereços</button> <span class="msg" id="enMsg"></span>' : '') + '</div>';
    async function lista(){
      var id = $('#enAlm').value; if(!id){ $('#enLista').innerHTML = ''; return; }
      var e = await api('GET', '/api/almoxarifados/' + id + '/enderecos');
      $('#enLista').innerHTML = (e.niveis || []).length ? '<div class="cmpRola"><table class="cmpTab"><thead><tr><th>Código</th><th>Endereço</th><th>Volumes do PCP</th><th></th></tr></thead><tbody>'
        + e.niveis.map(function(n){ return '<tr><td class="code">' + esc(n.codigo) + '</td><td>' + esc(n.nome) + (n.ativo ? '' : ' <span class="cmpChip">desativado</span>') + '</td><td>' + n.volumes + '</td>'
          + '<td>' + (cad ? '<button class="ghost" data-en-ren="' + n.id + '" data-nome="' + esc(n.nivel) + '">renomear</button> <button class="ghost" data-en-at="' + n.id + '" data-v="' + (n.ativo ? 0 : 1) + '">' + (n.ativo ? 'desativar' : 'reativar') + '</button>' : '') + '</td></tr>'; }).join('') + '</tbody></table></div>'
        : '<div class="sub">Sem endereço ainda.</div>';
      /* O SALDO NUMA LISTA SO (fase 10, R-CMP-50): os volumes do PCP e os rolos e
         sobras do sob medida, por endereço. Sem a ligação, a tela DIZ. */
      var st = await api('GET', '/api/almoxarifados/' + id + '/estoque');
      $('#enLista').insertAdjacentHTML('beforeend', '<div style="margin-top:12px;font-weight:600">O que está guardado</div>'
        + (st.sob_medida_fora ? '<div class="cmpAvi">' + esc(st.motivo) + '</div>' : '')
        + ((st.itens || []).length ? '<div class="cmpRola"><table class="cmpTab"><thead><tr><th>Endereço</th><th>Código</th><th>O quê</th><th>Saldo</th><th>De</th></tr></thead><tbody>'
          + st.itens.map(function(x){ return '<tr><td>' + esc(x.endereco || 'sem endereço') + '</td><td class="code">' + esc(x.codigo) + '</td><td>' + esc(x.item) + '</td><td>' + n3(x.saldo) + ' ' + esc(x.unidade || '') + '</td><td><span class="cmpChip">' + esc(x.origem) + '</span></td></tr>'; }).join('')
          + '</tbody></table></div>' : '<div class="sub">Nada guardado.</div>'));
    }
    $('#enAlm').onchange = lista;
    box.addEventListener('click', async function(ev){
      var b = ev.target.closest('[data-en-ren]');
      if(b){ var nm = prompt('Novo nome do nível', b.getAttribute('data-nome')); if(!nm) return;
        var r = await api('POST', '/api/enderecos/nivel/' + b.getAttribute('data-en-ren'), { nome:nm }); if(r.erro) return alert(r.erro); return lista(); }
      var a = ev.target.closest('[data-en-at]');
      if(a){ var r2 = await api('POST', '/api/enderecos/nivel/' + a.getAttribute('data-en-at'), { ativo:a.getAttribute('data-v') === '1' }); if(r2.erro) return alert(r2.erro); return lista(); }
    });
    var ok2 = $('#enOk'); if(ok2) ok2.onclick = async function(){
      var sp = function(v){ return String(v || '').split(',').map(function(x){ return x.trim(); }).filter(Boolean); };
      var r = await api('POST', '/api/almoxarifados/' + $('#enAlm').value + '/enderecos', { haste:$('#enH').value, andares:sp($('#enA').value), niveis:sp($('#enN').value) });
      msg($('#enMsg'), r, r.erro ? null : r.niveis + ' níveis na haste'); if(!r.erro) lista();
    };
  };

  /* A aprovação da contagem de material que passou da tolerância (fase 6,
     R-CMP-42) mudou de casa em 11/11/2026: mora na 504, no aprov_material.js
     (ARRUMAR-O-LUGAR fase 2). */

  /* ── COMPRA PROGRAMADA (fase 7, R-CMP-46 a 48) ──────────────────────── */
  registrar({ id:'programada', nome:'Compra programada', perms:['compras.ver','pedido.criar'],
    desenhar: async function(box){
      var p = await api('GET', '/api/compras/programada');
      if(p.erro){ box.innerHTML = '<div class="card" style="color:var(--red)">' + esc(p.erro) + '</div>'; return; }
      var lm = p.lista_mes || [], pd = p.pela_data || [];
      box.innerHTML = '<div class="card"><div style="font-weight:700">Lista do mês — o que não tem saldo</div>'
        + '<div class="sub" style="margin:4px 0 10px">A média mensal das compras de cada material, arredondada para a embalagem da última compra. A lista sai no dia ' + p.dia
        + ' de cada mês' + (p.hoje_e_o_dia ? ' — <b>é hoje</b>' : '') + '. É sugestão: edite a quantidade e gere o pedido.</div>'
        + '<div class="cmpRola"><table class="cmpTab"><thead><tr><th></th><th>Material</th><th>Média/mês</th><th>A caminho</th><th>Sugestão</th></tr></thead><tbody>'
        + (lm.length ? lm.map(function(x){ return '<tr><td><input type="checkbox" data-pg-sel="' + x.componente_id + '"' + (x.sugestao > 0 ? ' checked' : '') + '></td><td>' + esc(x.nome)
            + (x.pouco_historico ? ' <span class="cmpChip am">pouco histórico</span>' : '') + '</td><td>' + (x.media_mes == null ? '<span class="sub">' + esc(x.motivo) + '</span>' : n3(x.media_mes) + ' <span class="sub">(de ' + x.meses + ' mês/meses)</span>') + '</td>'
            + '<td>' + n3(x.a_caminho) + '</td><td><input data-pg-q="' + x.componente_id + '" type="number" min="0" step="any" value="' + (x.sugestao || '') + '" style="width:90px"> ' + esc(x.unidade || '') + (x.embalagem ? ' <span class="sub">(' + esc(x.embalagem) + ')</span>' : '') + '</td></tr>'; }).join('')
          : '<tr><td colspan="5" class="sub">Nenhum material sem saldo cadastrado.</td></tr>') + '</tbody></table></div></div>'
        + '<div class="card"><div style="font-weight:700">Pela data — o que tem saldo</div>'
        + '<div class="sub" style="margin:4px 0 10px"><b>pedir até</b> = hoje + dias até acabar − prazo do fornecedor − margem. O ponto de pedido é o <b>maior</b> entre o mínimo e o calculado pela data, nunca a soma, e sempre desconta o que está a caminho. '
        + 'Material sem consumo medido (menos de duas contagens) só entra pelo mínimo.</div>'
        + '<div class="cmpRola"><table class="cmpTab"><thead><tr><th></th><th>Material</th><th>Disponível</th><th>Consumo/dia</th><th>Prazo</th><th>Pedir até</th><th>Ponto</th><th>Sugestão</th></tr></thead><tbody>'
        + (pd.length ? pd.map(function(x){ return '<tr><td><input type="checkbox" data-pg-sel="' + x.componente_id + '" checked></td><td>' + esc(x.nome) + ' <span class="cmpChip ' + (x.gatilho === 'data' ? 'vm' : 'am') + '">' + (x.gatilho === 'data' ? 'pela data' : 'pelo mínimo') + '</span>'
            + (x.sem_consumo ? ' <span class="cmpChip">sem consumo medido</span>' : '') + '</td><td>' + n3(x.disponivel) + ' <span class="sub">(' + n3(x.saldo) + ' + ' + n3(x.a_caminho) + ' a caminho)</span></td>'
            + '<td>' + (x.consumo_dia ? n3(x.consumo_dia) : '—') + '</td><td>' + (x.prazo_dias != null ? n3(x.prazo_dias) + ' d <span class="sub">(' + esc(x.prazo_fonte) + ')</span>' : '—') + '</td>'
            + '<td>' + (x.pedir_ate ? data(x.pedir_ate) : '—') + '</td><td>' + n3(x.ponto) + '</td><td><input data-pg-q="' + x.componente_id + '" type="number" min="0" step="any" value="' + (x.sugestao || '') + '" style="width:90px"> ' + esc(x.unidade || '') + '</td></tr>'; }).join('')
          : '<tr><td colspan="8" class="sub">Nada a pedir hoje pela data nem pelo mínimo.</td></tr>') + '</tbody></table></div>'
        + '<button class="primary" data-perm="pedido.criar" id="pgGerar">Gerar pedido(s) com os marcados</button> <span class="msg" id="pgMsg"></span></div>';
      $('#pgGerar').onclick = async function(){
        var itens = Array.prototype.filter.call(box.querySelectorAll('[data-pg-sel]'), function(c){ return c.checked; }).map(function(c){
          var id = c.getAttribute('data-pg-sel'); var q = box.querySelector('[data-pg-q="' + id + '"]'); return { componente_id:+id, quantidade:q ? q.value : 0 }; });
        var r = await api('POST', '/api/compras/programada/pedido', { itens:itens });
        if(r.erro) return msg($('#pgMsg'), r);
        msg($('#pgMsg'), null, r.pedidos.length + ' pedido(s) em rascunho: ' + r.pedidos.map(function(x){ return x.numero; }).join(', ') + ' — veja na aba Pedidos');
      };
    } });

  /* ── NOTA POR XML (fase 8) ────────────────────────────────────────────
     Anexar o XML preenche nota e itens; o que nao casa fica para escolher. */
  window.CMP.xml = async function(box){
    if(!box || !pode('nota.lancar')) return;
    var peds = await api('GET', '/api/pedidos'); if(!Array.isArray(peds)) peds = [];
    box.innerHTML = '<div class="card"><div style="font-weight:700">Lançar nota pelo XML</div>'
      + '<div class="sub" style="margin:4px 0 10px">O item da nota casa com o do pedido pelo <b>código do fornecedor</b> (o da oferta) ou pelo <b>NCM</b> (quando um só item do pedido tem ele). '
      + 'O que não casar fica para você escolher — nunca é adivinhado.</div>'
      + '<div class="cmpG"><div style="grid-column:span 2"><label>Pedido</label><select id="xmPed">' + opt(peds.filter(function(p){ return p.status !== 'cancelado' && p.status !== 'rascunho'; }).map(function(p){ return { valor:p.id, nome:p.numero + ' · ' + (p.fornecedor_nome || p.loja || '—') }; }), '', '— escolha —') + '</select></div>'
      + '<div style="grid-column:span 2"><label>Arquivo XML da NF-e</label><input id="xmArq" type="file" accept=".xml,text/xml"></div></div>'
      + '<button class="ghost" id="xmLer">Ler o XML</button> <span class="msg" id="xmMsg"></span><div id="xmRes"></div></div>';
    var XML = null;
    box.onclick = async function(ev){
      if(ev.target.id === 'xmLer'){
        var f = $('#xmArq').files[0]; if(!f) return msg($('#xmMsg'), { erro:'escolha o arquivo' });
        XML = await f.text();
        var r = await api('POST', '/api/notas/xml/ler', { xml:XML, pedido_id:$('#xmPed').value || null });
        if(r.erro) return msg($('#xmMsg'), r);
        var p = r.pedido_itens || [];
        $('#xmRes').innerHTML = '<div class="sub" style="margin-top:8px">NF ' + esc(r.nota.numero) + ' · ' + esc(r.nota.emitente_nome || '') + ' · ' + data(r.nota.emissao) + ' · total ' + brl(r.nota.total_nota)
          + (r.pedidos_do_emitente && r.pedidos_do_emitente.length ? ' · pedidos deste fornecedor: ' + r.pedidos_do_emitente.map(function(x){ return esc(x.numero); }).join(', ') : '') + '</div>'
          + '<table class="cmpTab"><thead><tr><th>#</th><th>Na nota</th><th>Qtd</th><th>Valor</th><th>Item do pedido</th></tr></thead><tbody>'
          + r.nota.itens.map(function(d){ var c = (r.casamento || []).find(function(x){ return x.n === d.n; }) || {};
              return '<tr><td>' + d.n + '</td><td>' + esc(d.descricao) + '<div class="sub">' + esc(d.codigo_fornecedor || '') + ' · NCM ' + esc(d.ncm || '—') + '</div></td><td>' + n3(d.quantidade) + ' ' + esc(d.unidade || '') + '</td><td>' + brl(d.valor_produto) + '</td>'
                + '<td><select data-xm="' + d.n + '"><option value="">— escolha —</option><option value="nao">não é deste pedido</option>' + p.map(function(i){ return '<option value="' + i.id + '"' + (c.pedido_item_id === i.id ? ' selected' : '') + '>' + esc(i.item) + '</option>'; }).join('') + '</select>'
                + (c.por ? ' <span class="cmpChip vd">' + (c.por === 'ncm' ? 'pelo NCM' : 'pelo código') + '</span>' : (c.motivo ? '<div class="sub" style="color:var(--amber)">' + esc(c.motivo) + '</div>' : '')) + '</td></tr>'; }).join('')
          + '</tbody></table><button class="primary" data-perm="nota.lancar" id="xmOk">Lançar esta nota</button> <span class="msg" id="xmMsg2"></span>';
        return;
      }
      if(ev.target.id === 'xmOk'){
        var esc2 = {}; box.querySelectorAll('[data-xm]').forEach(function(s){ if(s.value === 'nao') esc2[s.getAttribute('data-xm')] = false; else if(s.value) esc2[s.getAttribute('data-xm')] = +s.value; });
        var r2 = await api('POST', '/api/notas/xml', { xml:XML, pedido_id:$('#xmPed').value, escolhas:esc2 });
        if(r2.erro) return msg($('#xmMsg2'), r2); abrir('notas');
      }
    };
  };

  /* ── CERTIFICADO (fase 11, R-CMP-51 a 56) — só o Admin Geral ──────────
     Enviar, trocar e remover. NUNCA baixar: não há botão nem rota. */
  registrar({ id:'certificado', tela:1302, nome:'Certificado', perms:['certificado.gerenciar'],
    desenhar: async function(box){
      var e = await api('GET', '/api/certificado');
      box.innerHTML = '<div class="card"><div style="font-weight:700">Certificado digital (A1) — notas baixadas da Receita</div>'
        + '<div class="sub" style="margin:4px 0 10px">Com o certificado, o sistema consulta a Receita de hora em hora e traz cada nota emitida contra a Deccorar <b>antes da mercadoria chegar</b>. '
        + 'Ele dá sozinho a <b>ciência da operação</b> (não confirma nem nega a compra). O arquivo fica guardado no servidor e <b>nunca pode ser baixado</b>; a senha fica cifrada. Sem certificado, tudo funciona.</div>'
        + '<div class="cmpG"><div><label>CNPJ da Deccorar</label><input id="ctCnpj" value="' + esc(e.cnpj_empresa || '') + '" placeholder="00.000.000/0000-00"></div>'
        + '<div><label>Código da UF (IBGE)</label><input id="ctUf" value="' + esc(e.uf_codigo || '') + '" placeholder="43 = RS, 35 = SP…"></div></div>'
        + '<button class="ghost" id="ctDados">Salvar CNPJ e UF</button> <span class="msg" id="ctDadosMsg"></span>'
        + (e.falta_cnpj ? '<div class="cmpAvi">Falta o CNPJ da Deccorar: é por ele que o certificado é conferido.</div>' : '')
        + '<div style="margin-top:14px;font-weight:600">Situação</div>'
        + (e.tem ? '<div>' + esc(e.titular) + ' · CNPJ ' + esc(e.cnpj) + ' · válido até <b>' + data(e.validade) + '</b>' + (e.vencido ? ' <span class="cmpChip vm">VENCIDO — a busca parou</span>' : e.vencendo ? ' <span class="cmpChip am">vence em ' + e.dias + ' dia(s)</span>' : '') + '</div>'
            + '<div class="sub">enviado por ' + esc(e.enviado_por || '—') + ' em ' + data(e.enviado_em) + '</div>'
          : '<div class="sub">' + esc(e.mensagem) + '.</div>')
        + '<div class="sub" style="margin-top:6px">Última consulta: ' + data(e.ultima_consulta) + ' · próxima: ' + data(e.proxima_consulta) + ' · último NSU: ' + esc(e.ultimo_nsu || '—') + (e.ultimo_erro ? '<br><span style="color:var(--amber)">' + esc(e.ultimo_erro) + '</span>' : '') + '</div>'
        + '<div style="margin-top:14px;font-weight:600">' + (e.tem ? 'Trocar o certificado' : 'Enviar o certificado') + '</div>'
        + '<div class="cmpG"><div><label>Arquivo .pfx</label><input id="ctArq" type="file" accept=".pfx,.p12"></div><div><label>Senha do certificado</label><input id="ctSenha" type="password" autocomplete="new-password"></div></div>'
        + '<button class="primary" id="ctEnviar">' + (e.tem ? 'Trocar' : 'Enviar') + '</button> '
        + (e.tem ? '<button class="ghost" id="ctRemover">Remover o certificado</button> <button class="ghost" id="ctConsultar">Consultar a Receita agora</button>' : '')
        + ' <span class="msg" id="ctMsg"></span></div>';
      box.onclick = async function(ev){
        var r;
        if(ev.target.id === 'ctDados'){ r = await api('POST', '/api/certificado/dados', { cnpj:$('#ctCnpj').value || null, uf_codigo:$('#ctUf').value || null }); if(r.erro) return msg($('#ctDadosMsg'), r); return abrir('certificado'); }
        if(ev.target.id === 'ctEnviar'){
          var f = $('#ctArq').files[0]; if(!f) return msg($('#ctMsg'), { erro:'escolha o arquivo .pfx' });
          var b64 = await new Promise(function(ok){ var fr = new FileReader(); fr.onload = function(){ ok(String(fr.result).split(',')[1]); }; fr.readAsDataURL(f); });
          r = await api('POST', '/api/certificado', { base64:b64, senha:$('#ctSenha').value });
          $('#ctSenha').value = '';
          if(r.erro) return msg($('#ctMsg'), r); return abrir('certificado');
        }
        if(ev.target.id === 'ctRemover'){ if(!confirm('Remover o certificado? A busca na Receita para até um novo ser enviado.')) return; r = await api('DELETE', '/api/certificado'); if(r.erro) return msg($('#ctMsg'), r); return abrir('certificado'); }
        if(ev.target.id === 'ctConsultar'){ msg($('#ctMsg'), null, 'consultando…'); r = await api('POST', '/api/dfe/consultar', {}); msg($('#ctMsg'), r.erro ? r : null, r.consultou ? (r.documentos + ' documento(s) novo(s)') : (r.motivo || '')); }
      };
    } });

  /* AS NOTAS RECEBIDAS DA RECEITA (fase 11), dentro da aba Notas */
  window.CMP.dfe = async function(box){
    if(!box) return;
    var r = await api('GET', '/api/dfe'); if(r.erro || !r.documentos) return;
    var SIT = { aguardando_xml:'esperando o XML completo', escolher:'escolha o pedido e os itens', sem_pedido:'NOTA SEM PEDIDO', lancada:'lançada', ciente:'sem pedido — ciente', erro:'não entrou' };
    box.innerHTML = '<div class="card"><div style="font-weight:700">Notas recebidas da Receita</div>'
      + (!r.certificado.tem ? '<div class="sub">' + esc(r.certificado.mensagem) + ' — a busca automática liga quando o Admin Geral enviar o certificado (aba Certificado).</div>' : '')
      + (r.certificado.tem && r.certificado.vencido ? '<div class="cmpAvi">O certificado digital venceu em ' + data(r.certificado.validade) + ': a busca na Receita parou até o Admin Geral enviar um novo.</div>'
        : r.certificado.tem && r.certificado.vencendo ? '<div class="cmpAvi">O certificado digital vence em ' + r.certificado.dias + ' dia(s) (' + data(r.certificado.validade) + '): peça um novo antes, senão a busca na Receita para.</div>' : '')
      + (r.documentos.length ? '<div class="cmpRola"><table class="cmpTab"><thead><tr><th>Emitente</th><th>Emissão</th><th>Valor</th><th>Ciência</th><th>Situação</th><th></th></tr></thead><tbody>'
        + r.documentos.map(function(d){ return '<tr><td>' + esc(d.emitente_nome || d.emitente_cnpj || '—') + '<div class="sub code">' + esc(d.chave || '') + '</div></td><td>' + data(d.emissao) + '</td><td>' + brl(d.valor) + '</td>'
          + '<td>' + (d.ciencia_em ? data(d.ciencia_em) : (d.ciencia_erro ? '<span style="color:var(--amber)">' + esc(d.ciencia_erro) + '</span>' : '—')) + '</td>'
          + '<td><span class="cmpChip ' + (d.situacao === 'sem_pedido' || d.situacao === 'erro' ? 'vm' : d.situacao === 'lancada' ? 'vd' : 'am') + '">' + esc(SIT[d.situacao] || d.situacao) + '</span>'
          + (d.erro ? '<div class="sub">' + esc(d.erro) + '</div>' : '') + (d.ciente_motivo ? '<div class="sub">' + esc(d.ciente_motivo) + ' — ' + esc(d.ciente_por || '') + '</div>' : '') + '</td>'
          + '<td>' + (d.situacao === 'escolher' || d.situacao === 'sem_pedido' ? '<button class="ghost" data-dfe="' + d.id + '">Abrir</button>' : '')
          + ((d.situacao === 'sem_pedido' || d.situacao === 'erro') && pode('nota.lancar') ? ' <button class="ghost" data-dfe-ciente="' + d.id + '">Ciente, sem pedido</button>' : '') + '</td></tr>'; }).join('') + '</tbody></table></div>'
        : '<div class="sub">Nenhuma nota baixada ainda.</div>') + '<div id="dfeDet"></div></div>';
    box.onclick = async function(ev){
      /* a nota sem pedido: quem lanca nota diz por que ela nao tem pedido, e ela
         sai das Pendencias (revisao do PR #305) */
      var c = ev.target.closest('[data-dfe-ciente]');
      if(c){
        var mot = prompt('Por que esta nota não tem pedido? (ex.: comprado no balcão) — o motivo fica gravado');
        if(mot === null) return;
        var rc = await api('POST', '/api/dfe/' + c.getAttribute('data-dfe-ciente') + '/ciente', { motivo:mot });
        if(rc.erro) return alert(rc.erro);
        return abrir('notas');
      }
      var b = ev.target.closest('[data-dfe]'); if(!b) return;
      var id = b.getAttribute('data-dfe'), x = await api('GET', '/api/dfe/' + id + '/ler');
      if(x.erro) return alert(x.erro);
      var peds = x.pedidos_do_emitente || [];
      $('#dfeDet').innerHTML = '<div class="sub" style="margin-top:8px">NF ' + esc(x.nota.numero) + ' · ' + esc(x.nota.emitente_nome) + (peds.length ? '' : ' — <b>nenhum pedido deste fornecedor</b>: alguém comprou por fora?') + '</div>'
        + '<div class="cmpG"><div><label>Pedido</label><select id="dfePed">' + opt(peds.map(function(p){ return { valor:p.id, nome:p.numero }; }), '', '— escolha —') + '</select></div></div><div id="dfeItens"></div>';
      $('#dfePed').onchange = async function(){
        var y = await api('GET', '/api/dfe/' + id + '/ler?pedido_id=' + this.value);
        $('#dfeItens').innerHTML = '<table class="cmpTab">' + y.nota.itens.map(function(dd){ var c = (y.casamento || []).find(function(k){ return k.n === dd.n; }) || {};
          return '<tr><td>' + esc(dd.descricao) + '</td><td><select data-dfi="' + dd.n + '"><option value="">— escolha —</option><option value="nao">não é deste pedido</option>'
            + (y.pedido_itens || []).map(function(i){ return '<option value="' + i.id + '"' + (c.pedido_item_id === i.id ? ' selected' : '') + '>' + esc(i.item) + '</option>'; }).join('') + '</select></td></tr>'; }).join('')
          + '</table><button class="primary" id="dfeOk">Lançar a nota</button> <span class="msg" id="dfeMsg"></span>';
        $('#dfeOk').onclick = async function(){
          var es = {}; document.querySelectorAll('[data-dfi]').forEach(function(s){ if(s.value === 'nao') es[s.getAttribute('data-dfi')] = false; else if(s.value) es[s.getAttribute('data-dfi')] = +s.value; });
          var rr = await api('POST', '/api/dfe/' + id + '/lancar', { pedido_id:$('#dfePed').value, escolhas:es }); if(rr.erro) return msg($('#dfeMsg'), rr); abrir('notas');
        };
      };
    };
  };

  /* ── COMPRA RAPIDA (fase 2, R-CMP-21) ───────────────────────────────── */
  registrar({ id:'rapida', nome:'Compra rápida', perms:['pedido.criar'],
    desenhar: async function(box){
      var o = await opcoes();
      var comps = await api('GET', '/api/componentes'); if(!Array.isArray(comps)) comps = [];
      box.innerHTML = '<div class="card"><div style="font-weight:700">Compra rápida</div>'
        + '<div class="sub" style="margin:4px 0 10px">O caminho da bucha e do café: o que já foi comprado no marketplace ou na loja. <b>Nasce comprada</b> — e passa pela alçada igual. O pedido completo, com oferta e fornecedor, é o da indústria.</div>'
        + '<div class="cmpG"><div style="grid-column:span 2"><label>Material</label><select id="crMat">' + opt(comps.filter(function(c){ return c.ativo; }).map(function(c){ return { valor:c.id, nome:c.nome + ' (' + (c.unidade || 'un') + ')' }; }), '', '— escolha —') + '</select></div>'
        + '<div><label>Quantidade (na unidade do material)</label><input id="crQtd" type="number" min="0" step="any"></div>'
        + '<div><label>Valor total pago (R$)</label><input id="crValor" type="number" min="0" step="0.01"></div>'
        + '<div><label>Canal</label><select id="crCanal">' + opt(o.canais, 'mercado_livre') + '</select></div>'
        + '<div><label>Loja</label><input id="crLoja"></div><div><label>Nº do pedido</label><input id="crNum"></div>'
        + '<div><label>Data da compra</label><input id="crData" type="date" value="' + new Date().toISOString().slice(0,10) + '"></div></div>'
        + '<button class="primary" data-perm="pedido.criar" id="crOk">Registrar compra</button> <span class="msg" id="crMsg"></span></div>';
      box.onclick = async function(ev){
        if(ev.target.id !== 'crOk') return;
        var r = await api('POST', '/api/compras/rapida', { componente_id:$('#crMat').value, quantidade:$('#crQtd').value, valor_total:$('#crValor').value,
          canal:$('#crCanal').value, loja:$('#crLoja').value, numero_externo:$('#crNum').value, comprado_em:$('#crData').value });
        if(r.erro) return msg($('#crMsg'), r);
        msg($('#crMsg'), null, r.status === 'aguardando_aprovacao' ? 'registrada — acima da sua alçada, espera o aprovador' : 'registrada como comprada');
        ['#crQtd','#crValor','#crNum'].forEach(function(s){ $(s).value = ''; });
      };
    } });
})();

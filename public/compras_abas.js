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

  /* ── FORNECEDORES (fase 2, R-CMP-11 e 12) ──────────────────────────── */
  var OPCC = null;
  async function opcoes(){ if(!OPCC) OPCC = await api('GET', '/api/compras/opcoes'); return OPCC; }
  registrar({ id:'fornecedores', nome:'Fornecedores', perms:['compras.ver','fornecedor.cadastrar'],
    desenhar: async function(box){
      var o = await opcoes();
      var l = await api('GET', '/api/fornecedores'); if(!Array.isArray(l)) l = [];
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
            + '<td><span class="sub" data-fo-msg="' + f.id + '"></span></td></tr>'; }).join('')
        + '</tbody></table></div>'
        + '<div class="row-actions" style="margin-top:12px;gap:8px;align-items:flex-end;flex-wrap:wrap"><div><label class="sub">Fornecedor novo</label><br><input id="foNome"></div>'
        + '<div><label class="sub">Tipo</label><br><select id="foTipo">' + opt(o.tipos_fornecedor.map(function(t){ return { valor:t, nome:t }; }), '', '—') + '</select></div>'
        + '<button class="primary" data-perm="fornecedor.cadastrar" id="foAdd">Criar</button> <span class="msg" id="foMsg"></span></div></div>';
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
  registrar({ id:'pedidos', nome:'Pedidos', perms:['compras.ver','pedido.criar','pedido.pagar','pedido.aprovar'],
    desenhar: async function(box){
      var o = await opcoes();
      var l = await api('GET', '/api/pedidos'); if(!Array.isArray(l)) l = [];
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
    h += '<div class="sub" style="margin-top:6px">Total ' + brl(p.valor_previsto) + (p.alcada ? ' · alçada de quem criou: ' + brl(p.alcada.limite) : ' · quem criou não tem alçada (sem limite)') + '</div>';
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
      h += ' <button class="ghost" data-perm="pedido.criar" id="pcCancelar">Cancelar pedido</button> <button class="ghost" id="pcWa">Texto de WhatsApp</button>';
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
      if(t.id === 'pcWa'){ r = await api('GET', '/api/pedidos/' + id + '/whatsapp'); $('#pcWaTxt').innerHTML = '<textarea style="width:100%;min-height:140px;margin-top:8px">' + esc(r.texto || r.erro) + '</textarea>'; return; }
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

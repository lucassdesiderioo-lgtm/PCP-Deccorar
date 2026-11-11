/* aprov_material.js — A APROVAÇÃO DA CONTAGEM DE MATERIAL, NA 504 (spec
 * ARRUMAR-O-LUGAR, fase 2, decisão do dono "a", 11/11/2026).
 *
 * Até aqui ela morava na 302 Contagem (que é de peça). Agora mora na tela do
 * assunto, a 504 Contagem de material. Dois blocos, cada um só para quem tem a
 * chave — o operador que conta não vê nenhum dos dois:
 *   - a contagem por almoxarifado que passou da tolerância: aprovar aplica a
 *     DIFERENÇA sobre o saldo de agora, rejeitar descarta (contagem.aprovar,
 *     /api/contagem-material/pendentes e /itens/:id/aprovar|rejeitar);
 *   - os ajustes ANTIGOS de material (a contagem da 302 que saiu em 07/11/2026):
 *     só se REJEITAM — aprovar um deles é 410 no servidor, e conta-se de novo
 *     aqui (contagem.ajustar, /api/contagem/pendentes/rejeitar).
 * Esconder não é segurança: as rotas continuam recusando quem não tem a chave.
 */
(function(){
  function esc(v){ return String(v == null ? '' : v).replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/"/g,'&quot;'); }
  function n3(v){ return v == null ? '—' : (Math.round((+v || 0) * 1000) / 1000).toString().replace('.', ','); }
  async function api(m, u, b){
    try{ var r = await fetch(u, { method:m, headers:{ 'Content-Type':'application/json' }, body:b ? JSON.stringify(b) : undefined });
      var j = null; try{ j = await r.json(); }catch(e){ j = { erro:'resposta sem JSON (' + r.status + ')' }; }
      if(!r.ok && j && !j.erro) j.erro = 'recusado (' + r.status + ')'; return j;
    }catch(e){ return { erro:'SEM CONEXÃO — tente de novo' }; }
  }
  function aviso(el, r){ if(!el) return; el.style.color = 'var(--verm)'; el.textContent = (r && r.erro) || 'não deu certo'; }

  /* `mi` é o /api/telas/minhas (as permissões da própria pessoa). */
  async function desenhar(box, mi){
    if(!box || !mi) return;
    var tem = function(c){ return !!mi.admin_geral || (mi.perms || []).indexOf(c) >= 0; };
    var h = '';
    if(tem('contagem.aprovar')){
      var l = await api('GET', '/api/contagem-material/pendentes');
      if(!Array.isArray(l)) h += '<div class="card"><div class="nome">Contagem de material esperando aprovação</div><div class="sub">Não consegui ler esta lista: ' + esc((l && l.erro) || 'sem resposta') + '.</div></div>';
      else if(!l.length) h += '<div class="card"><div class="nome">Contagem de material esperando aprovação</div><div class="sub">Nada esperando aprovação.</div></div>';
      else{
        h += '<div class="card"><div class="nome">Contagem de material esperando aprovação (' + l.length + ')</div>'
          + '<div class="sub">A diferença passou da tolerância do material. Aprovar aplica a DIFERENÇA sobre o saldo de agora. Quem contou não aprova. '
          + 'Material por volume não se ajusta aqui: o saldo dele é a soma dos volumes (corrige-se abrindo ou encerrando o volume na 503).</div>'
          + l.map(function(i){
              return '<div class="item"><b>' + esc(i.nome) + '</b> · ' + esc(i.almoxarifado || '') + '<div class="sub">contado ' + n3(i.contado) + ' ' + esc(i.unidade || '')
                + ' · sistema ' + n3(i.sistema) + ' · diferença ' + n3(i.diferenca) + ' (' + n3(i.diferenca_pct) + '%) · contou ' + esc(i.contado_por || '') + '</div>'
                + '<div class="lin" style="flex-wrap:wrap"><input data-am-mot="' + i.id + '" placeholder="motivo" style="flex:1 1 200px">'
                + '<button class="b pri" data-am="' + i.id + '" data-a="aprovar">Aprovar</button><button class="b" data-am="' + i.id + '" data-a="rejeitar">Rejeitar</button></div>'
                + '<div data-am-msg="' + i.id + '"></div></div>';
            }).join('') + '</div>';
      }
    }
    if(tem('contagem.ajustar')){
      var d = await api('GET', '/api/contagem/pendentes');
      var antigos = d && Array.isArray(d.linhas) ? d.linhas.filter(function(x){ return x.tipo === 'componente'; }) : [];
      if(antigos.length){
        h += '<div class="card"><div class="nome">Ajustes antigos de material (' + antigos.length + ')</div>'
          + '<div class="sub">São da contagem de material antiga, que saiu em 07/11/2026. Não se aprovam mais: rejeite e conte de novo aqui, por almoxarifado.</div>'
          + antigos.map(function(x){
              return '<div class="item"><b>' + esc(x.codigo) + '</b><div class="sub">contado ' + esc(x.contado) + (x.cor ? ' ' + esc(x.cor) : '') + ' · contou ' + esc(x.contado_por || '—') + '</div>'
                + '<button class="b" data-amv="' + x.id + '">Rejeitar</button><div data-amv-msg="' + x.id + '"></div></div>';
            }).join('') + '</div>';
      }
    }
    box.innerHTML = h;
    box.onclick = async function(ev){
      var b = ev.target.closest && ev.target.closest('[data-am]');
      if(b){
        var id = b.getAttribute('data-am');
        var mot = box.querySelector('[data-am-mot="' + id + '"]');
        var r = await api('POST', '/api/contagem-material/itens/' + id + '/' + b.getAttribute('data-a'), { motivo: mot ? mot.value : '' });
        if(r && r.erro) return aviso(box.querySelector('[data-am-msg="' + id + '"]'), r);
        return desenhar(box, mi);
      }
      var v = ev.target.closest && ev.target.closest('[data-amv]');
      if(v){
        if(!confirm('Rejeitar este ajuste antigo? Conte o material de novo, por almoxarifado.')) return;
        var iv = v.getAttribute('data-amv');
        var rv = await api('POST', '/api/contagem/pendentes/rejeitar', { ids:[+iv] });
        if(rv && rv.erro) return aviso(box.querySelector('[data-amv-msg="' + iv + '"]'), rv);
        return desenhar(box, mi);
      }
    };
  }
  window.APROV_MATERIAL = { desenhar:desenhar };
})();

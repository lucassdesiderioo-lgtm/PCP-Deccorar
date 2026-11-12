/* pendencias_vigia.js — a caixinha "Abrir em Pendências" (spec
 * docs/specs/PENDENCIAS-NO-MENU.md, fase 1, 12/11/2026).
 *
 * O dono: "quando fizer alguma coisa em uma tela e gerar pendências, colocar
 * uma caixinha para clicar e ir para a tela de pendência. Isso em todas as
 * telas que gerar pendência."
 *
 * Como: as ações que podem criar pendência estão na lista VIGIA, cada uma com
 * as linhas da central que ela mexe. Antes da ação conta-se cada linha; quando
 * a rota responde com sucesso, conta-se de novo. Se o número SUBIU, a resposta
 * ganha `pendencias: [{chave, n, frase, tela, nome_tela, rota, pode, quem}]`,
 * e o `public/pendencias_aviso.js` (carregado pelo nav.js em toda tela) mostra
 * a caixinha.
 *
 * ⚠️ NENHUMA CONTA MORA AQUI (#12): o número é o `contar` da linha da central,
 * que pergunta à função da tela dona. Este arquivo só subtrai.
 *
 * ⚠️ SÓ AVISA. Não muda nada do que a rota grava nem do que ela responde —
 * apenas acrescenta `pendencias`, e só quando a resposta é de sucesso. Falhou
 * ao contar, não aparece caixinha: o log diz, e a ação segue (a caixinha é
 * conforto; a pendência continua na central).
 *
 * ⚠️ O BOTÃO SÓ VAI PARA QUEM ABRE A TELA DONA (`pode`, pela mesma conta do
 * portão, `decidir`). Quem não abre recebe a frase e quem resolve.
 *
 * ⚠️ TEM QUE SER REGISTRADO ANTES DAS ROTAS (server.js, logo depois do
 * admin_telas): middleware registrado depois de uma rota não roda para ela.
 */
const PEND = require('./pendencias_dominio');
const M = require('./telas');

/* Ação → as linhas da central que ela pode fazer crescer. */
const VIGIA = [
  [/^\/api\/lote\/upload$/,                 ['bloqueados']],                          // 103 Subir PDF
  [/^\/api\/carregamento\/sobra$/,          ['sobras']],                              // 202 ✕ Venda cancelada
  [/^\/api\/estoque\/ajuste$/,              ['ajuste']],                              // 301 pedir ajuste
  [/^\/api\/inventario\/(terminar|geral\/terminar-prateleira|rejeitar)$/, ['inventario_aprovar']], // 303
  [/^\/api\/skus$/,                         ['sku']],                                 // 402 salvar SKU
  [/^\/api\/pedidos\/\d+\/comprar$/,        ['pedido_aprovacao']],                    // 501 acima da alçada
  [/^\/api\/compras\/rapida$/,              ['pedido_aprovacao']],                    // 501 compra rápida
  [/^\/api\/recebimento$/,                  ['recebimento_retido','recebimento_aviso']], // 502
  [/^\/api\/pedidos\/\d+\/fechar$/,         ['recebimento_retido']],                  // fechar com falta
  [/^\/api\/contagem-material\/\d+\/terminar$/, ['contagem_material']],               // 504
  [/^\/api\/componentes$/,                  ['material_sem_almox']],                  // 1101
  [/^\/api\/devolucao$/,                    ['devolucoes']]                           // 251 receber peça
];

const linhaDe = c => PEND.LINHAS.find(L => L.chave === c);

function medir(db, chaves){
  const o = {};
  chaves.forEach(c => {
    const L = linhaDe(c);
    try{ const r = L.contar(db); o[c] = (r && r.n != null) ? r.n : null; }
    catch(e){ o[c] = null; console.log('[pendencias_vigia] ' + c + ': ' + (e && e.message)); }
  });
  return o;
}

function novas(db, chaves, antes){
  const depois = medir(db, chaves);
  return chaves.filter(c => antes[c] != null && depois[c] != null && depois[c] > antes[c])
    .map(c => ({ chave:c, n:depois[c] - antes[c] }));
}

/* O que a tela precisa para desenhar a caixinha — e nada de SKU, cliente,
   saldo ou valor (a regra da central). */
function descrever(acesso, u, lista){
  return lista.map(p => {
    const L = linhaDe(p.chave), t = M.TELAS.find(x => x.n === L.tela) || {};
    let pode = false;
    try{ pode = !!(acesso && t.rota && acesso.decidir(u, t.rota, 'GET').ok); }catch(e){}
    return { chave:p.chave, n:p.n, frase:PEND.frase(L, p.n), tela:L.tela || null,
             nome_tela:t.nome || null, rota:pode ? t.rota : null, pode, quem:PEND.quemFora(L) };
  });
}

function vigiaDe(c){ const v = VIGIA.find(x => x[0].test(c)); return v ? v[1] : null; }

module.exports = function(app, db){
  app.use((req, res, next) => {
    if(req.method !== 'POST' || !req.usuario) return next();
    const chaves = vigiaDe(req.path);
    if(!chaves) return next();
    let antes = medir(db, chaves);
    /* A ROTA ASSÍNCRONA RECOMEÇA A CONTA quando para de esperar (③ REVISÃO):
       o upload lê o PDF por segundos, e nesse meio outra pessoa pode reter uma
       caixa ou resolver um card — a caixinha somaria o que não é desta ação.
       Do recomeço até a resposta é tudo síncrono (better-sqlite3), e aí a
       diferença é só desta ação. */
    req.recontarPendencias = () => { try{ antes = medir(db, chaves); }catch(e){} };
    const json = res.json.bind(res);
    res.json = function(corpo){
      try{
        if(corpo && typeof corpo === 'object' && !Array.isArray(corpo) && !corpo.erro
           && corpo.ok !== false && res.statusCode < 400){
          const n = novas(db, chaves, antes);
          if(n.length) corpo = Object.assign({}, corpo, { pendencias:descrever(app.locals.acesso, req.usuario, n) });
        }
      }catch(e){ console.log('[pendencias_vigia] ' + (e && e.message)); }
      return json(corpo);
    };
    next();
  });
};
module.exports.VIGIA = VIGIA;
module.exports.vigiaDe = vigiaDe;
module.exports.descrever = descrever;

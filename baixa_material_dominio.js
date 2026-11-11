/* A SAIDA DE MATERIAL PELO QUE FOI PRODUZIDO — spec FICHAS-NO-CADASTRO-UNICO,
 * fase 4 (§3-E), decisao do dono de 11/11/2026 (DECISOES.md).
 *
 * As duas operacoes dao saida no FIM, quando a peca e EMBALADA: a medida
 * padrao na embalagem (o +1 do estoque), o sob medida no bipe da embalagem.
 * Este arquivo e o dono unico de "o que a peca embalada tira do material":
 *
 *   - a lista vem da FICHA de cada operacao (a da 404 pelo ficha_dominio; a do
 *     sob medida congelada na aprovacao, que chega pela porta);
 *   - so baixa o material que sai PELA FICHA (`como_sai='ficha'`, por
 *     quantidade, com contagem resolvida na 504 — material_dominio). O resto
 *     continua saindo pela contagem e aqui so e IGNORADO, com o motivo;
 *   - o saldo anda SO pelo componente_dominio (dono unico, regra 10), com a
 *     operacao gravada na linha do livro.
 *
 * ⚠️ NAO ABRE TRANSACAO (a regra do componente_dominio): quem chama decide. A
 * embalagem da medida padrao chama dentro da transacao dela.
 *
 * ⚠️ A DEVOLUCAO REEMBALADA NAO BAIXA (quem chama decide pelo `modo` da fila):
 * a peca ja existia, o material foi gasto quando ela foi feita.
 */
const COMP = require('./componente_dominio');

/* Os itens [{componente_id, quantidade}] -> baixa os que saem pela ficha.
   Devolve { baixados:[...], ignorados:[...] } — nada estoura por material que
   so sai pela contagem. Quantidade zero ou invalida e ignorada (nao e erro:
   a linha de ficha "quando = bando" de uma peca sem bando nem chega aqui). */
function baixar(db, a){
  const baixados = [], ignorados = [];
  const soma = {};
  for(const it of (a.itens || [])){
    const id = +it.componente_id, q = +it.quantidade;
    if(!id || !Number.isFinite(q) || q <= 0) continue;
    soma[id] = (soma[id] || 0) + q;
  }
  for(const id of Object.keys(soma)){
    const c = db.prepare('SELECT id, nome, como_sai, modo_saldo, ativo FROM componente WHERE id=?').get(+id);
    if(!c){ ignorados.push({ componente_id:+id, motivo:'material não existe' }); continue; }
    if(c.como_sai !== 'ficha'){ ignorados.push({ componente_id:c.id, nome:c.nome, motivo:'sai pela contagem' }); continue; }
    if(c.modo_saldo !== 'quantidade'){ ignorados.push({ componente_id:c.id, nome:c.nome, motivo:'não é por quantidade' }); continue; }
    const r = COMP.movimentar(db, { componente_id:c.id, delta:-soma[id], motivo:a.motivo || 'ficha',
      referencia:a.referencia || null, usuario_id:a.usuario_id, usuario_nome:a.usuario_nome,
      teste:a.teste, operacao:a.operacao || null });
    baixados.push({ componente_id:c.id, nome:c.nome, quantidade:soma[id], saldo_apos:r.saldo_apos });
  }
  return { baixados, ignorados };
}

/* O que a ficha da medida padrao diz que UM SKU gasta: [{componente_id, nome,
   unidade, quantidade}]. Linha com erro (sem preco nao conta: a quantidade
   existe mesmo sem preco; a formula que nao avalia, sim) fica de fora e volta
   em `faltam`. O tecido sai pela bobina que a ficha escolheu. */
function daFichaPadrao(db, sku){
  const F = require('./ficha_dominio').calcularFicha(db, sku);
  const itens = [], faltam = [];
  if(!F || F.erro || F.pendencia || !F.linhas) return { itens, faltam:[F && (F.erro || F.pendencia) || 'sem ficha'] };
  for(const l of F.linhas){
    if(l.componente_id && Number.isFinite(+l.quantidade) && +l.quantidade > 0)
      itens.push({ componente_id:l.componente_id, nome:l.componente_nome, unidade:l.unidade, quantidade:+l.quantidade });
    else if(l.erro && !/sem preço/.test(l.erro)) faltam.push(l.erro);
  }
  return { itens, faltam };
}

/* ── O CONSUMIDO POR OPERACAO (fase 3, §3-D) ────────────────────────────────
   Quanto cada material foi consumido no periodo, por operacao, pelas
   embalagens x ficha. E ESTIMATIVA para o material que sai pela contagem (a
   tela diz isso); para o que sai pela ficha e o mesmo numero que o livro tem.
   Medida padrao: as linhas de `montagem` do periodo, menos a devolucao
   reembalada e o modo teste. Sob medida: o que a porta devolve (a lista de
   material congelada de cada peca embalada no periodo). Nada em reais. */
function consumoPorOperacao(db, desde, ate, sobmedida){
  const out = {};
  const por = (id, op, q) => { const o = out[id] = out[id] || { padrao:0, sobmedida:0 }; o[op] = Math.round((o[op] + q) * 1000) / 1000; };
  let emb = [];
  try{
    emb = db.prepare(`SELECT codigo, COUNT(*) n FROM montagem
      WHERE data >= ? AND data <= ? AND COALESCE(teste,0)=0 AND COALESCE(modo,'') <> 'devolucao'
      GROUP BY codigo`).all(desde, ate);
  }catch(e){ emb = []; }
  for(const e of emb){
    const f = daFichaPadrao(db, e.codigo);
    for(const it of f.itens) por(it.componente_id, 'padrao', it.quantidade * e.n);
  }
  for(const it of (sobmedida || [])) if(it && it.componente_id) por(it.componente_id, 'sobmedida', +it.quantidade || 0);
  return out;
}

module.exports = { baixar, daFichaPadrao, consumoPorOperacao };

/* A BAIXA NA CONFERENCIA — dono unico de "esta caixa ja saiu do estoque?" e
 * de "quantas pecas estao livres na prateleira?". Fase 2-A da spec
 * CONFERENCIA-E-BAIXA (22/10/2026).
 *
 *   embalada  ─▶ +1 (mont_route)
 *   etiqueta  ─▶ RESERVA a peca: o saldo nao se mexe          (etq_route)
 *   conferida ─▶ −1 por peca, uma vez so, `lote.baixado_em`   (este arquivo)
 *
 * Ate 22/10/2026 o −1 era na impressao, e a venda cancelada entre a impressao
 * e o caminhao ficava com o saldo baixo ate alguem lembrar de devolver. Hoje a
 * peca so sai do estoque quando a conferencia bate com a etiqueta — decisao do
 * dono, D1 da spec.
 *
 * QUEM CHAMA `baixar`: o bipe da conferencia (area e canto, carreg_route.js) e
 * o "foi no caminhao" da saida (saida_route.js), que e a caixa que saiu sem
 * ninguem conferir. Mais ninguem. A Mesa de correcoes NAO baixa (D7).
 *
 * QUEM CHAMA `devolver` (fase 2-B): so o "Sobrou" da Conferencia, depois de
 * bipado o SKU de cada persiana. E o caminho de volta do mesmo −1, e por isso
 * mora aqui: um dono so para a baixa e para o que ela devolve.
 *
 * ⚠️ O SALDO CONTINUA SENDO `skus.estoque`, e o livro continua fechando: a
 * reserva e CONTA, nao movimento. Quem move saldo e o `estoque_dominio`.
 *
 * ⚠️ O DISPONIVEL NAO ENTRA NO `precisa` DA TELA AZUL. O comprometido da
 * planilha ja conta a venda impressa ate ela sair (`venda_futura` com envio a
 * partir de hoje); descontar a reserva de novo contaria a mesma peca duas
 * vezes. Ele entra onde a pergunta e "tem peca LIVRE?": a trava da impressao,
 * a urgencia, o inventario e o numero que a Etiqueta de Venda mostra.
 *
 * Nenhuma funcao daqui abre transacao: quem chama abre (R-EST-07).
 */
const ESTOQUE = require('./estoque_dominio');

/* A coluna nasce aqui, e a VIRADA tambem. Chamado pelo exp_route, que e o dono
   da tabela `lote` (§17): depois dos ALTERs dela. */
function garantirSchema(db){
  try{ db.exec('ALTER TABLE lote ADD COLUMN baixado_em TEXT'); }catch(e){}
  db.exec('CREATE TABLE IF NOT EXISTS config (chave TEXT PRIMARY KEY, valor TEXT);');
  /* ⚠️ A VIRADA RODA UMA VEZ SO. No dia do deploy, toda caixa com etiqueta ja
     baixou na impressao (a regra de antes): ela ganha `baixado_em` igual a
     hora da impressao, e a conferencia nao baixa de novo. Do deploy em diante,
     a caixa impressa nasce SEM `baixado_em` — e rodar a virada outra vez
     marcaria como baixada uma caixa que nunca baixou. Por isso a marca. */
  if(db.prepare("SELECT 1 FROM config WHERE chave='virada_baixa_conferencia'").get()) return;
  const n = db.prepare(`UPDATE lote SET baixado_em=embalado_em
    WHERE baixado_em IS NULL AND embalado_em IS NOT NULL`).run().changes;
  db.prepare("INSERT INTO config (chave,valor) VALUES ('virada_baixa_conferencia',?)")
    .run(new Date().toISOString() + ' · ' + n + ' volume(s) ja baixados na impressao');
}

/* AS PECAS DA CAIXA — a regua de sempre (§5, #23): conta PERSIANA, nunca linha.
   Uma linha por SKU, com a soma das `qtd`. Sob medida vem marcada: nunca baixa. */
function pecas(db, v){
  let itens = [];
  try{ itens = db.prepare('SELECT codigo,qtd FROM lote_item WHERE lote_id=? ORDER BY id').all(v.id); }
  catch(e){ itens = []; }
  const varias = itens.reduce((s, i) => s + Math.max(1, i.qtd || 1), 0) > 1;
  const lista = varias
    ? itens.map(i => ({ codigo:String(i.codigo || '').toUpperCase(), qtd:Math.max(1, i.qtd || 1) }))
    : [{ codigo:String(v.codigo || '').toUpperCase(), qtd:1 }];
  const por = {};
  lista.forEach(l => { if(l.codigo) por[l.codigo] = (por[l.codigo] || 0) + l.qtd; });
  const sm = db.prepare(`SELECT COALESCE(m.sob_medida,0) s FROM skus s LEFT JOIN modelo m ON m.id=s.modelo_id
    WHERE s.codigo=?`);
  return Object.keys(por).map(codigo => {
    const r = sm.get(codigo);
    return { codigo, qtd:por[codigo], sob_medida:!!(r && r.s) };
  });
}

/* A BAIXA. Uma vez por volume: com `baixado_em` cheio, nao faz nada. Sob medida
   nao baixa (§7) — mas o volume fica marcado, senao ele seria uma caixa
   "esperando baixa" para sempre. Devolve as linhas que moveram. */
function baixar(db, v, usuario){
  const atual = db.prepare('SELECT * FROM lote WHERE id=?').get(v.id);
  if(!atual || atual.baixado_em) return [];
  const moveu = [];
  for(const l of pecas(db, atual)){
    if(l.sob_medida) continue;
    ESTOQUE.movimentar(db, { codigo:l.codigo, delta:-l.qtd, tipo:'conferencia',
      referencia:'lote:' + atual.id, usuario:usuario || null });
    moveu.push({ codigo:l.codigo, delta:-l.qtd });
  }
  db.prepare("UPDATE lote SET baixado_em=datetime('now','localtime') WHERE id=?").run(atual.id);
  return moveu;
}

/* A SOBRA (fase 2-B): a caixa que ficou na fabrica volta para a prateleira, e
   a persiana volta ao saldo +1 POR PECA — mas SO SE A CAIXA JA TINHA BAIXADO.
   A caixa impressa e nunca conferida nao saiu do saldo: a reserva some
   sozinha quando ela vira `cancelado`, e devolver ali criaria uma peca que nao
   existe. Sob medida nao tem saldo (§7).
   ⚠️ UMA VEZ SO: a linha `sobra` do livro com a referencia da caixa e a
   prova de que ela ja voltou. A rota tambem recusa a caixa ja decidida — esta
   guarda e para o dia em que alguem chamar daqui sem passar por la. */
function devolver(db, v, usuario){
  const atual = db.prepare('SELECT * FROM lote WHERE id=?').get(v.id);
  if(!atual || !atual.baixado_em) return [];
  const ref = 'lote:' + atual.id;
  if(db.prepare("SELECT 1 FROM movimento_estoque WHERE tipo='sobra' AND referencia=? LIMIT 1").get(ref)) return [];
  const moveu = [];
  for(const l of pecas(db, atual)){
    if(l.sob_medida) continue;
    ESTOQUE.movimentar(db, { codigo:l.codigo, delta:l.qtd, tipo:'sobra', referencia:ref,
      motivo:'sobrou — ' + String(atual.cancelada_motivo || 'caixa de volta à prateleira').slice(0, 160),
      usuario:usuario || null });
    moveu.push({ codigo:l.codigo, delta:l.qtd });
  }
  return moveu;
}

/* O MODO TESTE E A CAIXA DE VERDADE (22/10/2026). O modo teste so marca o que
   NASCE enquanto ele esta ligado (trigger de INSERT, teste_route.js). Imprimir
   ou conferir uma caixa que ja existia deixava a caixa impressa ou baixada, e
   o "apagar tudo" devolvia o saldo pela foto — a conferida ficava marcada como
   baixada e nunca mais baixava: estoque 1 acima, para sempre e sem aviso.
   Por isso, com o modo ligado, as portas que mexem em estoque (imprimir,
   conferir, o Sobrou e o "foi no caminhao") so aceitam caixa de teste.
   Devolve a recusa, ou null. */
function emTeste(db){
  try{ const r = db.prepare("SELECT valor FROM config WHERE chave='modo_teste'").get();
       return !!(r && String(r.valor) === '1'); }catch(e){ return false; }
}
function travaTeste(db, v){
  if(!v || v.teste || !emTeste(db)) return null;
  return { ok:false, motivo:'modo_teste',
    aviso:'Modo teste ligado: esta caixa é de verdade. Desligue o modo teste para trabalhar nela.' };
}

/* O RESERVADO PELA ETIQUETA: pecas em caixa impressa (`embalado`) que ainda
   nao baixou. A caixa `carregado` sem baixa NAO reserva: ela saiu da fabrica
   (pela Mesa, por exemplo), e reservar para sempre travaria o SKU. Sob medida
   fica de fora — nao tem saldo. */
function reservados(db){
  const out = {};
  let vols = [];
  try{ vols = db.prepare("SELECT id,codigo FROM lote WHERE estagio='embalado' AND baixado_em IS NULL").all(); }
  catch(e){ return out; }
  for(const v of vols)
    for(const l of pecas(db, v))
      if(!l.sob_medida) out[l.codigo] = (out[l.codigo] || 0) + l.qtd;
  return out;
}

/* O LIVRE: o saldo menos o que ja tem etiqueta. E o que deve estar NA
   PRATELEIRA, e o que a impressao pode usar. */
function disponivel(db, codigo, mapa){
  const c = String(codigo || '').toUpperCase();
  const s = ESTOQUE.saldo(db, c) || 0;
  return s - ((mapa || reservados(db))[c] || 0);
}

module.exports = { garantirSchema, pecas, baixar, devolver, reservados, disponivel, emTeste, travaTeste };

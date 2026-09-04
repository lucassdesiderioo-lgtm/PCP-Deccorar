// O ESTADO DO MODULO DE COMPRAS EM UMA TELA. So le — pode rodar em producao.
//
//   node ver_compras.js
//
// Existe porque "o que ficou pendente" tem duas metades e so uma esta no
// codigo. A outra esta nos DADOS: minimo que ninguem revisou, modelo sem
// ficha, fornecedor sem oferta, pedido parado ha meses. Nenhuma delas aparece
// lendo arquivo, e todas mudam o que vale a pena fazer em seguida.
//
// As tres divididas do CLAUDE.md §7-B que este script mede:
//   - "Minimos sao placeholder"  -> quantos ainda estao no valor semeado
//   - "Modelo ACESSORIO sem ficha" -> quais modelos nao tem linha de formula
//   - "Formula do tecido fecha 6 de 8" -> quantas formulas existem por modelo
const db = require('./db');

const bloco = (titulo, linhas) => {
  console.log('\n── ' + titulo + ' ' + '─'.repeat(Math.max(0, 52 - titulo.length)));
  if (!linhas.length) console.log('   (vazio)');
  linhas.forEach(l => console.log('   ' + l));
};
const um = sql => { try { return db.prepare(sql).get(); } catch (e) { return null; } };
const todos = sql => { try { return db.prepare(sql).all(); } catch (e) { return []; } };
const dinheiro = v => v == null ? '—' : 'R$ ' + Number(v).toFixed(2).replace('.', ',');

const avisos = [];

// ── O CADASTRO ────────────────────────────────────────────────────────────
const comp = um('SELECT COUNT(*) c FROM componente');
const forn = um('SELECT COUNT(*) c FROM fornecedor');
const ofer = um('SELECT COUNT(*) c FROM oferta');
bloco('CADASTRO', [
  (comp ? comp.c : 0) + ' componente(s)',
  (forn ? forn.c : 0) + ' fornecedor(es)',
  (ofer ? ofer.c : 0) + ' oferta(s) — e a oferta que carrega embalagem, fator e preco'
]);

/* COMPONENTE SEM OFERTA nao tem preco, e sem preco ele nao entra na soma da
   lista de compras: ele sai em `pendencias`, com o motivo. E a regra 4 do
   COMPRAS.md — custo indefinido nunca vira zero. */
const semOferta = todos(`
  SELECT c.nome FROM componente c
   WHERE NOT EXISTS (SELECT 1 FROM oferta o WHERE o.componente_id = c.id)
   ORDER BY c.nome`);
if (semOferta.length)
  avisos.push(semOferta.length + ' componente(s) sem NENHUMA oferta — ficam sem custo e ' +
    'saem como pendencia na lista de compras: ' + semOferta.slice(0, 6).map(x => x.nome).join(', ') +
    (semOferta.length > 6 ? ' …' : ''));

// ── OS MINIMOS ────────────────────────────────────────────────────────────
/* ⚠️ A DIVIDA MAIS CARA DA FASE 6, e a que nao da erro: os minimos foram
   semeados com um valor padrao ("depois eu edito"). Enquanto forem, o gatilho
   1 (ponto de pedido) vence quase sempre e a DEMANDA quase nao aparece na
   lista — o sistema compra pelo minimo inventado em vez de pela venda real. */
const minimos = todos('SELECT estoque_minimo v, COUNT(*) n FROM componente GROUP BY v ORDER BY n DESC');
bloco('ESTOQUE MINIMO POR COMPONENTE', minimos.map(m =>
  String(m.n).padStart(3) + ' componente(s) com minimo ' + m.v));
if (minimos.length && minimos[0].n > 1 && (comp ? comp.c : 0) > 1)
  avisos.push(minimos[0].n + ' componente(s) compartilham o MESMO minimo (' + minimos[0].v +
    ') — cheiro de valor semeado, nao revisado. Enquanto for assim, a lista de ' +
    'compras responde ao minimo inventado e nao a venda real.');

// ── AS FICHAS ─────────────────────────────────────────────────────────────
/* A ficha e formula, e mora no MODELO: componentes se lancam uma vez, nunca
   SKU a SKU. Modelo sem nenhuma linha e modelo que nao tem custo — e sem
   custo ele nao entra na conta do que comprar. */
const porModelo = todos(`
  SELECT m.id, m.nome, m.exige_medida, m.sob_medida,
         (SELECT COUNT(*) FROM ficha_formula f WHERE f.modelo_id = m.id) linhas,
         (SELECT COUNT(*) FROM skus s WHERE s.modelo_id = m.id) skus
    FROM modelo m ORDER BY m.nome`);
bloco('FICHA POR MODELO', porModelo.map(m =>
  m.nome.padEnd(16) + String(m.linhas).padStart(3) + ' linha(s) de ficha   ' +
  String(m.skus).padStart(4) + ' SKU(s)' +
  (m.sob_medida ? '   [sob medida]' : '') +
  (m.exige_medida ? '' : '   [sem medida]')));

porModelo.filter(m => m.linhas === 0 && m.skus > 0).forEach(m =>
  avisos.push('o modelo "' + m.nome + '" tem ' + m.skus + ' SKU(s) e NENHUMA linha de ficha — ' +
    'esses SKUs nao tem custo e nao entram na necessidade de material. ' +
    'Ou lancam ficha, ou viram revenda com custo direto.'));

// ── PEDIDOS ───────────────────────────────────────────────────────────────
const pedidos = todos(`
  SELECT situacao, COUNT(*) n,
         CAST(julianday('now','localtime') - julianday(MIN(criado_em)) AS INTEGER) mais_velho
    FROM pedido_compra GROUP BY situacao ORDER BY n DESC`);
bloco('PEDIDOS DE COMPRA', pedidos.map(p =>
  String(p.n).padStart(3) + ' ' + String(p.situacao).padEnd(12) +
  '  mais antigo ha ' + p.mais_velho + ' dia(s)'));

/* PEDIDO ABERTO HA MUITO TEMPO e o "zumbi": o saldo dele continua contando
   como A CAMINHO e some da necessidade — a fabrica deixa de comprar o que
   precisa porque o sistema acha que ja vem vindo. */
const zumbis = todos(`
  SELECT numero, criado_em,
         CAST(julianday('now','localtime') - julianday(criado_em) AS INTEGER) dias
    FROM pedido_compra
   WHERE situacao IN ('enviado','parcial')
     AND julianday('now','localtime') - julianday(criado_em) > 45
   ORDER BY dias DESC`);
if (zumbis.length)
  avisos.push(zumbis.length + ' pedido(s) abertos ha mais de 45 dias — o saldo deles conta ' +
    'como "a caminho" e SOME da necessidade: ' +
    zumbis.slice(0, 4).map(z => z.numero + ' (' + z.dias + 'd)').join(', '));

// ── HISTORICO — os relogios que so andam para a frente ────────────────────
const hp = um('SELECT COUNT(*) c, MIN(data) de, MAX(data) ate FROM preco_historico');
const hc = um('SELECT COUNT(*) c, MIN(data) de, MAX(data) ate FROM custo_sku_historico');
const mv = um('SELECT COUNT(*) c, MIN(criado_em) de FROM movimento_componente');
bloco('HISTORICO ACUMULADO', [
  'preco de componente: ' + (hp ? hp.c : 0) + ' registro(s)' + (hp && hp.c ? ' — de ' + hp.de + ' a ' + hp.ate : ''),
  'custo de SKU:        ' + (hc ? hc.c : 0) + ' registro(s)' + (hc && hc.c ? ' — de ' + hc.de + ' a ' + hc.ate : ''),
  'movimento material:  ' + (mv ? mv.c : 0) + ' registro(s)' + (mv && mv.c ? ' — desde ' + String(mv.de).slice(0, 10) : '')
]);

/* ⚠️ ESTAS SEIS ROTAS EXISTEM NO SERVIDOR E NENHUMA TELA AS CHAMA.
   E o mesmo defeito que o /api/estoque/ajustes teve ate 01/09 (§18): o dado
   e gravado e ninguem consegue ler. Metade do valor do registro desligada —
   e a metade que custa, porque historico so se constroi esperando. */
bloco('ROTAS SEM TELA (a Fase 7 que falta)', [
  'GET /api/precos/historico      quanto cada componente ja custou',
  'GET /api/custo/historico       como o custo de um SKU andou no tempo',
  'GET /api/skus/custo            o custo de material de cada SKU',
  'GET /api/compras/necessidade   a necessidade por componente, aberta',
  'GET /api/pedidos/zumbis        pedido aberto ha muito tempo',
  'GET /api/recebimento/devolucoes  o que voltou para o fornecedor'
]);

bloco('OLHAR COM ATENCAO (' + avisos.length + ')', avisos);
console.log('\n   banco: /opt/expedicao/dados.db\n');

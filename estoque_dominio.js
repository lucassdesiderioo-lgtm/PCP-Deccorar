/* O DONO UNICO de `skus.estoque` e de `movimento_estoque`.
 *
 * Fase 1 da spec ESTOQUE-LIVRO-E-CONFERENCIA (21/09/2026).
 *
 * O PROBLEMA, EM UMA FRASE: o saldo da persiana era um numero que SETE lugares
 * sobrescreviam — a embalagem, a etiqueta, o ajuste manual, a contagem, o
 * cadastro de SKU, dois scripts e o modo teste. Quando ele errava, nao sobrava
 * rastro de quem mexeu, quando, nem por que; e a contagem, que devia consertar,
 * tambem sobrescrevia.
 *
 * O material de compras nao tem esse problema desde o `componente_dominio.js` +
 * `movimento_componente`. Este arquivo e o mesmo desenho para a persiana, e foi
 * escrito olhando para aquele de proposito: duas mecanicas diferentes para a
 * mesma pergunta seria a armadilha #12 dentro do proprio conserto.
 *
 * ⚠️ `skus.estoque` CONTINUA EXISTINDO, como CACHE do saldo. As telas e as
 * contas continuam lendo dele — sao dezenas de consultas que somam, filtram e
 * ordenam por saldo, e trocar todas por uma soma do livro seria reescrever o
 * sistema inteiro para responder o que a coluna ja responde. Quem MANDA e o
 * livro: `SUM(delta) = skus.estoque` para todo SKU, e ha teste varrendo o
 * projeto atras de quem escreva na coluna por fora (`teste_livro.js`).
 *
 * ⚠️ NENHUMA FUNCAO DAQUI ABRE TRANSACAO. Quem chama decide o escopo, porque a
 * embalagem sao quatro escritas que entram ou nao entram juntas (§4, #26) e a
 * etiqueta de uma caixa de pacote sao N baixas que valem como uma (§5, #23).
 */

/* Os tipos sao fechados, e a lista e a spec §3.1. Tipo livre viraria, em um
   mes, sete grafias da mesma coisa — e ai o extrato nao agrupa e a pergunta
   "quanto saiu por venda?" deixa de ter resposta. */
const TIPOS = ['abertura','embalagem','etiqueta','inventario','ajuste','correcao','cancelamento'];

/* Peca e inteiro. Nao existe meia persiana, e um `delta` fracionario aqui seria
   erro de chamador — material e que se mede em metro, e tem o dominio dele. */
function garantirSchema(db){
  /* ⚠️ O `config` E CRIADO AQUI, e nao e redundancia (§10). Este modulo GRAVA
     ali (a marca da abertura), e ele roda no `db.js` — antes do `mont_route`,
     que e quem normalmente cria a tabela. Sem isto, num banco novo o
     `INSERT INTO config` falharia, o try/catch engoliria, e a abertura rodaria
     de novo a cada boot somando linha em cima de linha. */
  db.exec("CREATE TABLE IF NOT EXISTS config (chave TEXT PRIMARY KEY, valor TEXT);");
  db.exec(`CREATE TABLE IF NOT EXISTS movimento_estoque (
    id           INTEGER PRIMARY KEY AUTOINCREMENT,
    codigo       TEXT,
    delta        INTEGER,
    tipo         TEXT,
    referencia   TEXT,
    motivo       TEXT,
    usuario_id   INTEGER,
    usuario_nome TEXT,
    aprovado_por TEXT,
    saldo_depois INTEGER,
    criado_em    TEXT DEFAULT (datetime('now','localtime')),
    data         TEXT DEFAULT (date('now','localtime')),
    teste        INTEGER DEFAULT 0
  );`);
  /* O extrato de um SKU e a consulta que a aba Estoque faz por linha. Sem
     indice ela varre o livro inteiro, que so cresce. */
  db.exec("CREATE INDEX IF NOT EXISTS ix_movimento_estoque_codigo ON movimento_estoque(codigo, id)");
  abertura(db);
}

/* A VIRADA (spec §3.4). Cada SKU com saldo diferente de zero ganha UMA linha
   `abertura` com o saldo daquele momento. A historia comeca ali; o que veio
   antes nao se reconstroi — e e exatamente por isso que esta spec existe.
 *
 * ⚠️ EVENTO DE UMA VEZ SO, marcado em `config`. Sem a marca ela rodaria a cada
 * boot e o livro passaria a dizer o dobro, o triplo, o quadruplo do saldo — e a
 * soma nunca mais bateria. E a mesma licao da migracao de `areas` (§10, #28):
 * o que e evento nao pode virar rotina.
 *
 * ⚠️ E O `NULL` E NORMALIZADO AQUI, de propósito. `skus.estoque` NULL nao e
 * saldo: `estoque+1` vira NULL e `MAX(0,estoque-1)` tambem, entao o SKU nunca
 * sobe e nunca desce — o `zerar_estoque.js` descreve esse buraco. O livro
 * precisa de numero; NULL vira 0 sem gerar movimento, porque zerar o que ja nao
 * andava nao e movimento de peca nenhuma. */
function abertura(db){
  let feita = null;
  try{ feita = db.prepare("SELECT valor FROM config WHERE chave='livro_abertura'").get(); }catch(e){ return; }
  if(feita) return;
  db.transaction(()=>{
    db.prepare('UPDATE skus SET estoque=0 WHERE estoque IS NULL').run();
    const ins = db.prepare(`INSERT INTO movimento_estoque
        (codigo,delta,tipo,referencia,saldo_depois,usuario_nome)
      VALUES (?,?,'abertura','abertura do livro',?,'sistema')`);
    let n = 0;
    for(const s of db.prepare('SELECT codigo, estoque FROM skus WHERE estoque<>0').all()){
      ins.run(s.codigo, s.estoque, s.estoque); n++;
    }
    db.prepare("INSERT OR REPLACE INTO config (chave,valor) VALUES ('livro_abertura',?)")
      .run(new Date().toISOString().slice(0,10) + ' · ' + n + ' SKU(s)');
  })();
}

function saldo(db, codigo){
  const s = db.prepare('SELECT estoque FROM skus WHERE codigo=?').get(codigo);
  return s ? (+s.estoque || 0) : null;         // null = SKU nao existe
}

/* O UNICO lugar do sistema que escreve em `skus.estoque`.
 *
 * ⚠️ NAO HA `MAX(0, ...)`, E ISSO E A REGRA, NAO UM ESQUECIMENTO (spec §3.3.1).
 * Todos os sete donos cortavam o saldo em zero, e com isso apagavam justamente
 * o SINAL de que alguma peca saiu sem registro. Saldo negativo agora FICA
 * negativo e acende alerta vermelho na aba Estoque. A trava da Etiqueta de
 * Venda (nao imprime sem estoque) continua igual: e ela que impede o negativo
 * na operacao normal, entao negativo que aparecer e verdadeiro. */
function movimentar(db, args){
  const a = args || {};
  const codigo = String(a.codigo || '').trim().toUpperCase();
  if(!codigo) throw new Error('movimento de estoque sem SKU');

  const linha = db.prepare('SELECT estoque FROM skus WHERE codigo=?').get(codigo);
  /* SKU fora do cadastro e recusado, e nao "criado na hora": era assim que a
     embalagem perdia peca antes da #26 — o UPDATE pegava 0 linhas em silencio
     e a resposta dizia ok. */
  if(!linha) throw new Error('SKU nao cadastrado: ' + codigo);

  const delta = Number(a.delta);
  if(!Number.isInteger(delta) || delta === 0)
    throw new Error('movimento de estoque com delta invalido: ' + a.delta +
                    ' (peca e numero inteiro, e zero nao e movimento)');

  const tipo = String(a.tipo || '');
  if(TIPOS.indexOf(tipo) < 0)
    throw new Error('movimento de estoque com tipo invalido: ' + tipo +
                    ' (os validos sao ' + TIPOS.join(', ') + ')');

  const antes  = +linha.estoque || 0;
  const depois = antes + delta;
  const u = a.usuario || {};

  db.prepare('UPDATE skus SET estoque=? WHERE codigo=?').run(depois, codigo);
  db.prepare(`INSERT INTO movimento_estoque
      (codigo,delta,tipo,referencia,motivo,usuario_id,usuario_nome,aprovado_por,saldo_depois)
    VALUES (?,?,?,?,?,?,?,?,?)`)
    .run(codigo, delta, tipo, a.referencia || null, a.motivo || null,
         (a.usuario_id != null ? a.usuario_id : (u.id || null)),
         (a.usuario_nome != null ? a.usuario_nome : (u.nome || null)),
         a.aprovado_por || null, depois);

  return { antes, depois, delta };
}

/* O livro de um SKU, do mais novo para o mais velho. */
function extrato(db, codigo, opcoes){
  const o = opcoes || {};
  const args = [String(codigo || '').toUpperCase()];
  let sql = `SELECT id,codigo,delta,tipo,referencia,motivo,usuario_nome,aprovado_por,
      saldo_depois,criado_em,COALESCE(teste,0) teste
    FROM movimento_estoque WHERE UPPER(codigo)=UPPER(?)`;
  if(o.desde){ sql += ' AND criado_em >= ?'; args.push(o.desde); }
  sql += ' ORDER BY id DESC LIMIT ' + Math.min(500, Math.max(1, +o.limite || 100));
  return db.prepare(sql).all(...args);
}

/* ⚠️ A RESTAURACAO DA FOTO DO MODO TESTE MORA AQUI, e nao no `teste_route.js`.
 *
 * Ela escreve em `skus.estoque` sem ser um movimento — e justamente o
 * contrario: desfaz movimentos que foram apagados. Se ficasse la, o
 * `teste_route` seria o segundo dono da coluna, e a varredura do
 * `teste_livro.js` (que recusa `UPDATE skus SET estoque` fora deste arquivo)
 * teria que abrir uma excecao. Excecao numa regra de dono unico e o comeco do
 * terceiro dono.
 *
 * Nao gera linha no livro porque as linhas de teste ja foram apagadas pelo
 * chamador: gravar um movimento de "volta" aqui deixaria o livro contando uma
 * historia que nao aconteceu. */
function restaurarFoto(db, linhas){
  const up = db.prepare('UPDATE skus SET estoque=?, alvo=? WHERE codigo=?');
  let n = 0;
  (linhas || []).forEach(s => { up.run(s.estoque, s.alvo, s.codigo); n++; });
  return n;
}

/* "NINGUEM APROVA O PROPRIO TRABALHO" — spec §6.2, fase 2 (26/09/2026).
 *
 * Uma funcao so, usada pela recontagem, pela aprovacao de inventario e (na
 * fase 3) pela aprovacao de ajuste. Tres copias desta pergunta seriam tres
 * reguas, e a que ficasse frouxa seria justamente a que alguem usaria.
 *
 * ⚠️ VALE PARA O ADMIN GERAL. Nao ha permissao que dispense: o Admin Geral
 * passa em toda CHAVE por nivel (§10), e se passasse aqui tambem a regra
 * deixaria de existir para a unica pessoa que consegue aprovar qualquer coisa.
 *
 * `quem` e {id, nome}; `pessoas` e a lista de quem ja fez alguma coisa no item
 * ({id, nome} cada). Compara pelo id quando os dois lados tem, e pelo nome
 * normalizado quando falta id — mas VAZIO NUNCA E IGUAL A VAZIO: sem saber
 * quem fez, a resposta e "outra pessoa", porque recusar ai travaria a
 * conferencia por falta de dado (a mesma guarda do "sem segunda pessoa", §8-B).
 * E quem pergunta sem nome e sem id nao e ninguem: recusado. */
function normNome(n){ return String(n || '').trim().replace(/\s+/g,' ').toLowerCase(); }
function outraPessoa(quem, pessoas){
  const q = quem || {};
  const qid = q.id != null && q.id !== '' ? String(q.id) : '';
  const qn  = normNome(q.nome);
  if(!qid && !qn) return false;
  for(const p of (pessoas || [])){
    if(!p) continue;
    const pid = p.id != null && p.id !== '' ? String(p.id) : '';
    const pn  = normNome(p.nome);
    if(qid && pid){ if(qid === pid) return false; continue; }
    if(qn && pn && qn === pn) return false;
  }
  return true;
}

module.exports = { TIPOS, garantirSchema, abertura, saldo, movimentar, extrato, restaurarFoto, outraPessoa };

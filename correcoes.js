/* A MESA DE CORRECOES — dono unico de cada acao. Fase 1 da spec
 * MESA-DE-CORRECOES (02/10/2026).
 *
 *   BUSCAR ─▶ VER O OBJETO ─▶ PREVIA ─▶ EXECUTAR (motivo) ─▶ DESFAZER
 *
 * Todo passivo da operacao se corrigia pedindo ao Claude Code para rodar um
 * script no servidor (§5, "os tres scripts que fecham passivo"), e a CANCELADA
 * DEPOIS DA ETIQUETA nao se corrigia de jeito nenhum: o card em Admin →
 * Bloqueados so MOSTRA (decisao D3 da VENDAS F2), e este arquivo e o "decidir"
 * que faltava.
 *
 * ⚠️ NENHUMA FUNCAO DAQUI ABRE TRANSACAO — a rota embrulha cada passo, como no
 * `ajuste_dominio` e pela mesma razao do §2: a cancelada de uma caixa de
 * pacote sao N movimentos que valem como um, e dominio que abrisse a propria
 * transacao tiraria de quem chama a chance de desfazer.
 *
 * ⚠️ QUEM MEXE EM SALDO CHAMA O `estoque_dominio.movimentar()`, NUNCA
 * `UPDATE skus` — a varredura do `teste_livro.js` recusa, e e o que mantem
 * `SUM(delta) = skus.estoque` (§2, o livro).
 *
 * ⚠️ A MESA NAO TEM ACAO DE ESTOQUE DIRETO. Mexer em saldo sem venda na frente
 * e o que as duas pessoas do ajuste existem para vigiar (§18, fase 3). A unica
 * excecao e a cancelada que VOLTOU: ali o movimento desfaz uma baixa conhecida,
 * com o volume e o cliente na referencia.
 */
const ESTOQUE = require('./estoque_dominio');
const CANC    = require('./cancelada_dominio');

function erro(status, mensagem, extra){
  const e = new Error(mensagem); e.status = status; e.extra = extra || null; return e;
}

function garantirSchema(db){
  db.exec(`CREATE TABLE IF NOT EXISTS correcao (
    id           INTEGER PRIMARY KEY AUTOINCREMENT,
    acao         TEXT,
    alvo_tipo    TEXT,
    alvo_id      INTEGER,
    motivo       TEXT,
    antes        TEXT,
    depois       TEXT,
    usuario_id   INTEGER,
    usuario_nome TEXT,
    criado_em    TEXT DEFAULT (datetime('now','localtime')),
    desfeita_em  TEXT,
    desfeita_por TEXT,
    teste        INTEGER DEFAULT 0
  );`);
  db.exec('CREATE INDEX IF NOT EXISTS ix_correcao_alvo ON correcao(alvo_tipo, alvo_id)');
}

/* ─── A REGUA DO FANTASMA, DE UM LUGAR SO ────────────────────────────────────
   Era o laco do `limpar_fantasmas.js`, e desde 02/10/2026 ele LE daqui
   (decisao 1 do dono): com duas copias, o botao e o terminal discordariam
   sobre qual volume e fantasma no dia em que uma delas mudasse — a armadilha
   #12 na porta mais cara que existe, que e a que apaga linha.

   ⚠️ A REGUA E "O IRMAO MAIS ANTIGO", E NAO "ALGUM IRMAO MAIS ANTIGO". Ela
   varre o `lote` inteiro por id e guarda o PRIMEIRO volume de cada chave; um
   `SELECT` por volume (o `MIN(id)` de quem compartilha pack ou venda) parece
   igual e nao e: com #1 so-venda, #2 venda+pack e #3 so-pack, o laco faz do #3
   um primeiro e a consulta o casaria com o #2. Varrer custa uma passada por
   tela de admin, e a resposta e a mesma do script. */
function classificarFantasmas(db){
  const linhas = db.prepare(`SELECT id,data,codigo,buyer,nf,packId,venda,estagio
                             FROM lote ORDER BY id`).all();
  const primeiro = {}, fantasmas = [], duvidosos = [];
  for(const v of linhas){
    const chaves = [];
    if(v.venda)  chaves.push('v:' + v.venda);
    if(v.packId) chaves.push('p:' + v.packId);
    if(!chaves.length) continue;          // sem chave nao da pra afirmar que e o mesmo
    const anterior = chaves.map(k => primeiro[k]).find(Boolean);
    if(!anterior){ chaves.forEach(k => primeiro[k] = v); continue; }
    if(v.estagio !== 'pendente') continue; // ja andou: nao e fantasma, e historia
    if(anterior.estagio === 'embalado' || anterior.estagio === 'carregado') fantasmas.push({ v, anterior });
    else duvidosos.push({ v, anterior });
  }
  return { fantasmas, duvidosos, total: linhas.length };
}

/* ─── AS PECAS DA CAIXA — a MESMA regua do etq_route (§5, #23) ───────────────
   O criterio e PERSIANA, nunca LINHA: uma linha de `qtd:2` e uma linha e duas
   persianas, e foi contando linha que a NF 6490 saiu com uma de duas. */
function pecasDoVolume(db, v){
  let itens = [];
  try{ itens = db.prepare('SELECT id,codigo,qtd FROM lote_item WHERE lote_id=? ORDER BY id').all(v.id); }
  catch(e){ itens = []; }
  const pacote = itens.reduce((s,i) => s + Math.max(1, i.qtd || 1), 0) > 1;
  const linhas = pacote
    ? itens.map(i => ({ codigo:String(i.codigo || '').toUpperCase(), qtd:Math.max(1, i.qtd || 1) }))
    : [{ codigo:String(v.codigo || '').toUpperCase(), qtd:1 }];
  const dados = db.prepare(`SELECT s.codigo, s.estoque, COALESCE(m.sob_medida,0) sob_medida
    FROM skus s LEFT JOIN modelo m ON m.id=s.modelo_id WHERE s.codigo=?`);
  for(const l of linhas){
    const d = dados.get(l.codigo);
    l.cadastrado = !!d;
    l.sob_medida = !!(d && d.sob_medida);
    l.estoque = d ? d.estoque : null;
  }
  return linhas;
}

/* O que a cancelada devolveria ao estoque: uma linha por SKU, com a soma das
   `qtd`. SOB MEDIDA FICA DE FORA — ela nunca somou `+1` na embalagem e nao
   baixou na etiqueta (§7), entao devolver abriria um buraco em vez de fechar. */
function devolucaoDeEstoque(db, v){
  const por = {};
  for(const l of pecasDoVolume(db, v)){
    if(l.sob_medida) continue;
    por[l.codigo] = (por[l.codigo] || 0) + l.qtd;
  }
  return Object.keys(por).map(codigo => ({ codigo, delta: por[codigo] }));
}

function volumePorId(db, id){
  const v = db.prepare('SELECT * FROM lote WHERE id=?').get(+id);
  if(!v) throw erro(404, 'volume #' + id + ' não existe (ou já foi corrigido)');
  return v;
}
/* Os campos que dizem "o objeto ANDOU depois". O desfazer compara estes, e nao
   a linha inteira: `reimpressoes` ou um `conferido_em` nao desfazem a decisao. */
const ANDOU = ['estagio','embalado_em','carregado_em','retirado_em','saida_id','saiu_em','no_carro_em'];
function temColuna(db, tabela, col){
  try{ return db.prepare('PRAGMA table_info(' + tabela + ')').all().some(c => c.name === col); }
  catch(e){ return false; }
}
const RESOLVIDA = ['cancelada_resolvida_em','cancelada_resolvida_por','cancelada_voltou'];

/* ─── AS ACOES ───────────────────────────────────────────────────────────────
   Cada uma responde as cinco perguntas da §5.1 da spec. Acao que nao vale
   devolve o MOTIVO, e nao `false`: a tela escreve o motivo no botao
   desabilitado, em vez de sumir com ele (§5.5) — trava que some nao ensina
   nada a quem procurava por ela. */
const ACOES = {

  fantasma: {
    id:'fantasma', alvo:'lote',
    rotulo:'Descartar fantasma',
    explica:'Apaga a duplicata que o PDF reenviado criou. Fica sempre o volume mais antigo, ' +
            'que é quem carrega a história. Não mexe em estoque.',
    carregar: volumePorId,
    valePara(db, v){
      const cls = classificarFantasmas(db);
      if(cls.fantasmas.some(o => o.v.id === v.id)) return true;
      const duv = cls.duvidosos.find(o => o.v.id === v.id);
      if(duv) return 'o irmão mais antigo (#' + duv.anterior.id + ') ainda não andou — está ' +
        duv.anterior.estagio + '. Pode ser um bloqueado que só virou pendente na segunda entrada: olhe caso a caso.';
      if(v.estagio !== 'pendente') return 'este volume já andou (' + v.estagio + ') — não é fantasma, é história';
      if(!v.venda && !v.packId) return 'o volume não tem venda nem pack: sem chave não dá para afirmar que é o mesmo';
      return 'não há outro volume com a mesma venda ou o mesmo pack — este é o original';
    },
    previa(db, v){
      const cls = classificarFantasmas(db);
      const o = cls.fantasmas.find(x => x.v.id === v.id);
      const itens = db.prepare('SELECT * FROM lote_item WHERE lote_id=? ORDER BY id').all(v.id);
      const pecas = itens.reduce((s, i) => s + Math.max(1, i.qtd || 1), 0);
      return {
        antes:  { lote:v, itens },
        depois: { lote:null, itens:[] },
        estoque: [],
        resumo: 'Apaga o volume #' + v.id + ' de ' + v.data +
          (pecas > 1 ? ' e as ' + pecas + ' peças dele' : '') +
          '. Fica o #' + (o ? o.anterior.id + ' de ' + o.anterior.data + ' (' + o.anterior.estagio + ')' : '?') +
          '. O saldo não se mexe: volume pendente nunca teve a baixa da etiqueta.'
      };
    },
    executar(db, v){
      /* AS PECAS SAEM JUNTO. O `limpar_fantasmas.js` so apagava o `lote`, e o
         fantasma que era caixa de varias persianas deixava linha orfa em
         `lote_item` — o proprio comentario do `TABELAS` do modo teste avisa que
         "o proximo volume com o mesmo id herdaria pecas que nunca foram dele". */
      db.prepare('DELETE FROM lote_item WHERE lote_id=?').run(v.id);
      db.prepare('DELETE FROM lote WHERE id=?').run(v.id);
    },
    desfazer(db, c){
      const a = JSON.parse(c.antes || '{}');
      if(!a.lote) throw erro(409, 'esta correção não guardou o volume — não dá para devolver');
      if(db.prepare('SELECT 1 FROM lote WHERE id=?').get(c.alvo_id))
        throw erro(409, 'o número #' + c.alvo_id + ' já está ocupado por outro volume: devolver por cima ' +
                        'apagaria o que está lá');
      for(const i of (a.itens || []))
        if(db.prepare('SELECT 1 FROM lote_item WHERE id=?').get(i.id))
          throw erro(409, 'a peça #' + i.id + ' do volume já está ocupada por outra linha');
      const campos = Object.keys(a.lote);
      db.prepare('INSERT INTO lote (' + campos.join(',') + ') VALUES (' + campos.map(() => '?').join(',') + ')')
        .run(campos.map(k => a.lote[k]));
      for(const i of (a.itens || [])){
        const ci = Object.keys(i);
        db.prepare('INSERT INTO lote_item (' + ci.join(',') + ') VALUES (' + ci.map(() => '?').join(',') + ')')
          .run(ci.map(k => i[k]));
      }
    }
  },

  cancelada: {
    id:'cancelada', alvo:'lote',
    rotulo:'Cancelada depois da etiqueta',
    explica:'O cliente cancelou depois de a etiqueta sair, então a baixa do estoque já aconteceu. ' +
            'Duas saídas: a persiana voltou para a prateleira (o saldo volta) ou não voltou (só registra).',
    carregar: volumePorId,
    opcoes(db, v){
      const so = { id:'registrar', rotulo:'Não voltou — só registrar' };
      if(v.cancelada_varias) return [so];
      return [{ id:'voltou', rotulo:'A persiana voltou para a prateleira' }, so];
    },
    /* ⚠️ A CAIXA DE VARIAS NAO TEM O "VOLTOU", e e decisao do dono (02/10/2026).
       Ali o volume nem e cancelado — o cliente ainda quer as outras persianas —
       e o relatorio do ML cancela UM item, sem dizer qual peca da caixa e. O
       sistema nao sabe, e inventar seria somar saldo de uma persiana que esta
       dentro de uma caixa a caminho do cliente. */
    nota(db, v){
      return v.cancelada_varias
        ? 'Esta caixa leva mais de uma persiana e o Mercado Livre cancelou só um item — o sistema não sabe ' +
          'qual peça é. Separe a caixa, confira na mão, e o saldo se corrige por Admin → Estoque, com motivo.'
        : null;
    },
    valePara(db, v){
      if(temColuna(db, 'lote', 'cancelada_resolvida_em') && v.cancelada_resolvida_em)
        return 'já decidida em ' + v.cancelada_resolvida_em + ' por ' + (v.cancelada_resolvida_por || '?') +
               ' — desfaça aquela correção antes';
      if(v.cancelada_varias) return true;
      if(v.estagio !== CANC.ESTAGIO) return 'este volume não está cancelado';
      if(v.cancelada_estagio !== 'embalado' && v.cancelada_estagio !== 'carregado')
        return 'a venda foi cancelada ANTES da etiqueta sair (estava ' + (v.cancelada_estagio || '?') +
               '): nada baixou do estoque, então não há o que devolver';
      return true;
    },
    previa(db, v, params){
      const voltou = !!(params && params.voltou);
      if(voltou && v.cancelada_varias)
        throw erro(409, 'a caixa de várias persianas não tem o "voltou": o sistema não sabe qual peça ' +
                        'o Mercado Livre cancelou');
      const estoque = voltou ? devolucaoDeEstoque(db, v) : [];
      const pecas = pecasDoVolume(db, v);
      const sem = pecas.filter(l => !l.cadastrado).map(l => l.codigo);
      if(voltou && sem.length)
        throw erro(409, 'SKU não cadastrado: ' + sem.join(', ') + ' — cadastre antes de devolver o saldo');
      const total = estoque.reduce((s, l) => s + l.delta, 0);
      /* ⚠️ "1 peça(s)" e meia concordancia, e ela se le pior que nenhuma numa
         tela de fabrica — a licao do "1 destes pedidos ja tiveram" (§19, 4-A).
         Só apareceu abrindo a tela. */
      const pl = (n, um, muitos) => n === 1 ? um : muitos;
      return {
        antes:  { lote:v },
        depois: { lote:Object.assign({}, v, { cancelada_resolvida_em:'(agora)', cancelada_voltou:voltou ? 1 : 0 }) },
        estoque,
        resumo: voltou
          ? 'Devolve ' + total + ' ' + pl(total, 'peça', 'peças') + ' ao estoque' +
            (estoque.length > 1 ? ' (' + estoque.map(l => l.codigo + ' +' + l.delta).join(', ') + ')' : '') +
            ', com movimento `cancelamento` no livro. O volume sai do card de Bloqueados.'
          : 'Registra que a persiana NÃO voltou. O saldo não se mexe — a baixa da etiqueta continua valendo. ' +
            'O volume sai do card de Bloqueados.' +
            (pecas.length > 1 ? ' A caixa leva ' + pecas.reduce((s, l) => s + l.qtd, 0) + ' persianas.' : '')
      };
    },
    executar(db, v, params, ctx){
      const voltou = !!(params && params.voltou);
      const p = this.previa(db, v, params);
      /* ⚠️ POR PECA, NUNCA +1 (decisao 2 do dono, 02/10/2026 — divergencia da
         §4 da spec). A etiqueta de uma caixa de pacote baixou N (§5, #23):
         devolver 1 de 2 deixaria o buraco pela metade, e ninguem procuraria. */
      for(const l of p.estoque)
        ESTOQUE.movimentar(db, { codigo:l.codigo, delta:l.delta, tipo:'cancelamento',
          referencia:'correcao:' + ctx.correcao_id,
          motivo:ctx.motivo + ' — volume #' + v.id + (v.buyer ? ', ' + v.buyer : '') +
                 (v.nf ? ', NF ' + v.nf : ''),
          usuario:ctx.quem });
      db.prepare(`UPDATE lote SET cancelada_resolvida_em=datetime('now','localtime'),
          cancelada_resolvida_por=?, cancelada_voltou=? WHERE id=?`)
        .run((ctx.quem && ctx.quem.nome) || '', voltou ? 1 : 0, v.id);
    },
    desfazer(db, c, quem){
      const a = JSON.parse(c.antes || '{}'), d = JSON.parse(c.depois || '{}');
      const v = volumePorId(db, c.alvo_id);
      /* O objeto nao pode ter ANDADO depois. Diferente, recusa dizendo o que
         mudou: desfazer por cima de trabalho novo e a armadilha #32 pela porta
         da Mesa. */
      for(const campo of ANDOU)
        if(String(v[campo] == null ? '' : v[campo]) !== String(a.lote && a.lote[campo] == null ? '' : a.lote[campo]))
          throw erro(409, 'o volume andou depois desta correção: ' + campo + ' era ' +
            ((a.lote && a.lote[campo]) || 'vazio') + ' e agora é ' + (v[campo] || 'vazio') + '. Não desfiz nada.');
      for(const l of (JSON.parse(c.depois || '{}').estoque || []))
        ESTOQUE.movimentar(db, { codigo:l.codigo, delta:-l.delta, tipo:'cancelamento',
          referencia:'correcao:' + c.id, motivo:'desfeita a correção #' + c.id +
            ' (volume #' + c.alvo_id + ')', usuario:quem });
      db.prepare(`UPDATE lote SET cancelada_resolvida_em=NULL, cancelada_resolvida_por=NULL,
          cancelada_voltou=NULL WHERE id=?`).run(c.alvo_id);
      void d;
    }
  }
};

/* ─── A PORTA ────────────────────────────────────────────────────────────────  */

function acao(id){
  const A = ACOES[id];
  if(!A) throw erro(400, 'ação desconhecida: ' + id);
  return A;
}

function buscar(db, q){
  const t = String(q == null ? '' : q).trim();
  if(!t) return { volumes: [] };                 // busca vazia nao varre o banco
  const like = '%' + t.replace(/[%_\\]/g, '') + '%';
  const id = /^\d+$/.test(t) ? +t : -1;
  const up = t.toUpperCase();
  const volumes = db.prepare(`SELECT id,codigo,buyer,nf,packId,venda,estagio,data,despachar_em,
      modalidade,cancelada_em,cancelada_estagio,cancelada_varias,bloqueio
    FROM lote
    WHERE id=? OR venda=? OR packId=? OR nf=? OR UPPER(codigo)=? OR buyer LIKE ?
       OR EXISTS (SELECT 1 FROM lote_item i WHERE i.lote_id=lote.id AND UPPER(i.codigo)=?)
    ORDER BY id DESC LIMIT 50`).all(id, t, t, t, up, like, up);
  return { volumes };
}

/* O objeto, a historia e as acoes — com o motivo das que nao valem. */
function objeto(db, tipo, id){
  if(tipo !== 'lote') throw erro(400, 'nesta fase a Mesa só abre volume (`lote`)');
  const v = volumePorId(db, id);
  const pecas = pecasDoVolume(db, v);
  let historia = [];
  try{
    historia = db.prepare(`SELECT id,acao,motivo,usuario_nome,criado_em,desfeita_em,desfeita_por
      FROM correcao WHERE alvo_tipo=? AND alvo_id=? ORDER BY id DESC`).all(tipo, +id);
  }catch(e){}
  const acoes = Object.keys(ACOES).map(k => {
    const A = ACOES[k];
    let vale = true, por_que_nao = null;
    try{ const r = A.valePara(db, v); if(r !== true){ vale = false; por_que_nao = r; } }
    catch(e){ vale = false; por_que_nao = e.message; }
    const linha = { id:A.id, rotulo:A.rotulo, explica:A.explica, vale, por_que_nao };
    if(A.opcoes) linha.opcoes = A.opcoes(db, v);
    if(A.nota){ const nt = A.nota(db, v); if(nt) linha.nota_voltou = nt; }
    return linha;
  });
  return { tipo, id:v.id, volume:v, pecas, historia, acoes };
}

function previa(db, { acao:nome, tipo, id, params }){
  const A = acao(nome);
  if(tipo !== A.alvo) throw erro(400, 'a ação ' + nome + ' é de ' + A.alvo + ', não de ' + tipo);
  const o = A.carregar(db, id);
  const v = A.valePara(db, o, params);
  if(v !== true) throw erro(409, v);
  return A.previa(db, o, params);
}

function executar(db, { acao:nome, tipo, id, params, motivo, quem }){
  const A = acao(nome);
  if(tipo !== A.alvo) throw erro(400, 'a ação ' + nome + ' é de ' + A.alvo + ', não de ' + tipo);
  const o = A.carregar(db, id);
  const v = A.valePara(db, o, params);
  if(v !== true) throw erro(409, v);
  const m = String(motivo == null ? '' : motivo).trim();
  if(!m) throw erro(400, 'escreva o motivo da correção');
  if(!quem || (quem.id == null && !quem.nome)) throw erro(401, 'sem pessoa logada');

  const p = A.previa(db, o, params);
  /* A linha da correcao nasce ANTES do efeito, porque e o id dela que vai na
     `referencia` do movimento — `correcao:<id>` (§5.1 da spec). O `depois`
     guarda tambem o estoque que a acao moveu: e ele que o desfazer inverte. */
  const cid = db.prepare(`INSERT INTO correcao (acao,alvo_tipo,alvo_id,motivo,antes,depois,
      usuario_id,usuario_nome,teste) VALUES (?,?,?,?,?,?,?,?,?)`)
    .run(nome, tipo, +id, m, JSON.stringify(p.antes),
      JSON.stringify(Object.assign({}, p.depois, { estoque:p.estoque || [] })),
      quem.id != null ? quem.id : null, quem.nome || '', o.teste ? 1 : 0).lastInsertRowid;
  A.executar(db, o, params, { quem, motivo:m, correcao_id:cid });
  return { correcao_id:cid, acao:nome, alvo:tipo + ':' + id, resumo:p.resumo, estoque:p.estoque || [] };
}

function desfazer(db, { id, quem }){
  const c = db.prepare('SELECT * FROM correcao WHERE id=?').get(+id);
  if(!c) throw erro(404, 'correção não encontrada');
  if(c.desfeita_em) throw erro(409, 'esta correção já foi desfeita em ' + c.desfeita_em +
    ' por ' + (c.desfeita_por || '?'));
  if(!quem || (quem.id == null && !quem.nome)) throw erro(401, 'sem pessoa logada');
  acao(c.acao).desfazer(db, c, quem);
  db.prepare(`UPDATE correcao SET desfeita_em=datetime('now','localtime'), desfeita_por=? WHERE id=?`)
    .run(quem.nome || '', c.id);
  return { id:c.id, acao:c.acao, alvo:c.alvo_tipo + ':' + c.alvo_id };
}

function historico(db, opcoes){
  const o = opcoes || {};
  const lim = Math.min(Math.max(+o.limite || 50, 1), 200);
  const where = [], args = [];
  if(o.acao){ where.push('acao=?'); args.push(String(o.acao)); }
  if(o.pessoa){ where.push('usuario_nome=?'); args.push(String(o.pessoa)); }
  const itens = db.prepare('SELECT * FROM correcao' + (where.length ? ' WHERE ' + where.join(' AND ') : '') +
    ' ORDER BY id DESC LIMIT ' + lim).all(args);
  return itens.map(c => ({
    id:c.id, acao:c.acao, rotulo:(ACOES[c.acao] || {}).rotulo || c.acao,
    alvo_tipo:c.alvo_tipo, alvo_id:c.alvo_id, motivo:c.motivo,
    usuario_nome:c.usuario_nome, criado_em:c.criado_em,
    desfeita_em:c.desfeita_em, desfeita_por:c.desfeita_por,
    estoque:(() => { try{ return JSON.parse(c.depois || '{}').estoque || []; }catch(e){ return []; } })()
  }));
}

/* ⚠️ OS CONTADORES DA FASE 1 SAO OS DOIS QUE TEM BOTAO (decisao 3 do dono).
   Vencidos, futuras fechadas e fila velha chegam na fase 2 JUNTO com a acao
   deles: contador que acusa e nao sabe liberar e a trava que a equipe aprende
   a contornar (§5), e numero que nao zera vira paisagem. */
function contadores(db){
  const f = classificarFantasmas(db).fantasmas
    .filter(o => !o.v.teste)
    .map(o => ({ id:o.v.id, data:o.v.data, codigo:o.v.codigo, buyer:o.v.buyer, nf:o.v.nf,
                 ja_era:o.anterior.id, ja_era_data:o.anterior.data, ja_era_estagio:o.anterior.estagio }));
  let canc = [];
  try{ canc = CANC.listar(db); }catch(e){ canc = []; }
  return { fantasmas:{ n:f.length, itens:f }, canceladas:{ n:canc.length, itens:canc } };
}

module.exports = { ACOES, garantirSchema, erro, classificarFantasmas, pecasDoVolume,
                   devolucaoDeEstoque, buscar, objeto, previa, executar, desfazer,
                   historico, contadores };

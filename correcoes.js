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
const AJUSTE  = require('./ajuste_dominio');
const CARGA   = require('./carga');

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

/* ─── O QUE AS ACOES DA FASE 2 DIVIDEM ───────────────────────────────────────  */
function hoje(db){ return db.prepare("SELECT date('now','localtime') d").get().d; }
function diaRel(db, n){ return db.prepare("SELECT date('now','localtime',?) d").get((n >= 0 ? '+' : '') + n + ' day').d; }
/* Data em tela e dd/mm/aaaa: o formato do banco vazando para quem le e o
   "— Correcao de contagem" do §2 por outra porta. */
function br(d){ const s = String(d || '').slice(0, 10); return /^\d{4}-\d{2}-\d{2}$/.test(s) ? s.split('-').reverse().join('/') : s; }
const pl = (n, um, muitos) => n === 1 ? um : muitos;

/* A DATA DA SAIDA E A DO VOLUME, AS 15:00 — NUNCA HOJE (§5, os scripts que
   fecham passivo). Fechar passivo com a data de hoje cria um pico falso de
   carregamentos num dia em que nada saiu, e deixa vazios os dias em que as
   pecas sairam. 15:00 e o limite do despacho (§8): convencao, nao medicao. */
function carimboDe(v){ return String(v.despachar_em || v.data).slice(0, 10) + ' 15:00:00'; }

/* O efeito de "saiu" num volume. Na COLETA a saida e o caminhao levando
   (`retirado_em`, §8-B): sem ele a caixa ficaria parada no card "esperando o
   caminhao" de um caminhao que ja foi — o defeito que o `regularizar_saida.js`
   tinha e que o `fechar_saida_passivo.js` ja evitava. `saiu_por` segue a
   modalidade, como no passivo; a `modalidade` nunca e reescrita (§8-B, #21). */
function efeitoDeSaida(v){
  const c = carimboDe(v), coleta = CARGA.ehColeta(v);
  return { estagio:'carregado', carregado_em:c,
           retirado_em: coleta ? c : v.retirado_em,
           saiu_por: v.saiu_por || (coleta ? 'coleta' : 'agencia') };
}

function gravarCampos(db, tabela, id, campos){
  const k = Object.keys(campos);
  if(!k.length) return;
  db.prepare('UPDATE ' + tabela + ' SET ' + k.map(c => c + '=?').join(',') + ' WHERE id=?')
    .run(k.map(c => campos[c]).concat([id]));
}
function inserirLinha(db, tabela, linha){
  const k = Object.keys(linha);
  db.prepare('INSERT INTO ' + tabela + ' (' + k.join(',') + ') VALUES (' + k.map(() => '?').join(',') + ')')
    .run(k.map(c => linha[c]));
}

/* O volume ANDOU depois da correcao? Compara os campos do ANDOU com o estado
   que a correcao deixou (o de antes, com o que ela mudou por cima). Diferente,
   devolve a frase — desfazer por cima de trabalho novo e a armadilha #32. */
function andou(atual, esperado){
  for(const campo of ANDOU){
    const a = atual[campo] == null ? '' : String(atual[campo]);
    const e = esperado[campo] == null ? '' : String(esperado[campo]);
    if(a !== e) return 'o volume #' + atual.id + ' andou depois desta correção: ' + campo + ' era ' +
      (e || 'vazio') + ' e agora é ' + (a || 'vazio') + '. Não desfiz nada.';
  }
  return null;
}

/* Data de corte das acoes em bloco. E de quem CONFERIU o periodo, e o sistema
   nao adivinha: sem ela, recusa. Fora do formato e erro de quem chamou (400);
   no futuro e recusa de regra (409) — venda futura nao foi despachada. */
function dataDeCorte(params){
  const ate = String((params && params.ate) || '').trim();
  if(!ate) throw erro(400, 'diga até que data você conferiu (AAAA-MM-DD)');
  if(!/^\d{4}-\d{2}-\d{2}$/.test(ate)) throw erro(400, 'data de corte fora do formato AAAA-MM-DD: ' + ate);
  return ate;
}

/* A regua dos vencidos, a mesma do `fechar_vencidos.js`: pendente com despacho
   ate a data (ou sem data lida, que e do mesmo passivo). Bloqueado nao entra —
   e outro problema, outro caminho. */
function vencidosAte(db, ate){
  return db.prepare(`SELECT * FROM lote WHERE estagio='pendente'
    AND (despachar_em IS NULL OR despachar_em<=?) ORDER BY COALESCE(despachar_em,data), id`).all(ate);
}
/* A regua da fila velha, a mesma do `limpar_fila.js`: so `aguardando`. A linha
   `embalado` e historia de peca que virou estoque e nunca e tocada. */
function filaAte(db, ate){
  return db.prepare(`SELECT * FROM fila WHERE situacao='aguardando'
    AND (date(COALESCE(revisado_em,data))<=? OR (revisado_em IS NULL AND data IS NULL))
    ORDER BY revisado_em, id`).all(ate);
}

function linhaFilaPorId(db, id){
  const l = db.prepare('SELECT * FROM fila WHERE id=?').get(+id);
  if(!l) throw erro(404, 'linha #' + id + ' da fila não existe (ou já foi tirada)');
  return l;
}
function skuPorCodigo(db, codigo){
  const c = String(codigo || '').trim().toUpperCase();
  const s = db.prepare('SELECT codigo,descricao,estoque FROM skus WHERE codigo=?').get(c);
  if(!s) throw erro(404, 'SKU não cadastrado: ' + c);
  return s;
}
function pedidoAberto(db, codigo){
  try{ return db.prepare("SELECT * FROM ajuste_pedido WHERE codigo=? AND status='pendente'").get(codigo) || null; }
  catch(e){ return null; }
}

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
  },

  /* ═══ FASE 2 (02/10/2026) — as cinco acoes que so existiam como script ═══ */

  /* DAR SAIDA — a regra do `regularizar_saida.js`, um volume por vez, por
     decisao humana: "volume velho e pendente" tambem descreve a venda que a
     equipe ESQUECEU, e por isso nao ha heuristica aqui. */
  saida: {
    id:'saida', alvo:'lote',
    rotulo:'Dar saída',
    explica:'O volume saiu de verdade e o sistema não soube. Marca como carregado na data do despacho dele, ' +
            'às 15:00 — nunca hoje — e apaga as cópias pendentes do mesmo volume. Não mexe em estoque.',
    carregar: volumePorId,
    valePara(db, v){
      if(v.estagio === 'carregado') return 'este volume já está carregado' +
        (v.carregado_em ? ' (' + br(v.carregado_em) + ')' : '');
      if(v.estagio === CANC.ESTAGIO) return 'a venda foi cancelada no Mercado Livre — não sai; ' +
        'se a etiqueta já tinha saído, use "Cancelada depois da etiqueta"';
      /* VENDA FUTURA NAO FOI DESPACHADA (§5): a caixa esta na fabrica esperando
         o prazo, e fecha-la tira o volume da tela de carregamento no dia em que
         ele tiver que sair de verdade. */
      if(v.despachar_em && v.despachar_em > hoje(db))
        return 'só despacha em ' + br(v.despachar_em) + ' — ainda não saiu';
      return true;
    },
    previa(db, v){
      const copias = db.prepare(`SELECT * FROM lote WHERE id<>? AND estagio='pendente'
          AND ((packId IS NOT NULL AND packId=?) OR (venda IS NOT NULL AND venda=?)) ORDER BY id`)
        .all(v.id, v.packId, v.venda)
        .map(c => ({ lote:c, itens:db.prepare('SELECT * FROM lote_item WHERE lote_id=? ORDER BY id').all(c.id) }));
      const efeito = efeitoDeSaida(v);
      return {
        antes:  { lote:v, copias },
        depois: { campos:efeito },
        estoque: [],
        resumo: 'Marca o volume #' + v.id + ' como carregado em ' + br(efeito.carregado_em) + ' às 15:00' +
          (v.despachar_em ? ' (o dia do despacho dele)' : ' (sem despacho lido: vale o dia em que entrou)') +
          (CARGA.ehColeta(v) ? ', e como levado pelo caminhão' : '') + '.' +
          (copias.length ? ' Apaga ' + copias.length + ' ' + pl(copias.length, 'cópia pendente', 'cópias pendentes') +
            ' do mesmo volume: ' + copias.map(c => '#' + c.lote.id + ' de ' + br(c.lote.data)).join(', ') + '.' : '') +
          ' O saldo não se mexe.'
      };
    },
    executar(db, v){
      const p = this.previa(db, v);
      gravarCampos(db, 'lote', v.id, p.depois.campos);
      /* As copias saem COM AS PECAS — a licao do fantasma (fase 1): `lote_item`
         orfao seria herdado pelo proximo volume com o mesmo id. */
      for(const c of p.antes.copias){
        db.prepare('DELETE FROM lote_item WHERE lote_id=?').run(c.lote.id);
        db.prepare('DELETE FROM lote WHERE id=?').run(c.lote.id);
      }
    },
    desfazer(db, c){
      const a = JSON.parse(c.antes || '{}'), d = JSON.parse(c.depois || '{}');
      const v = volumePorId(db, c.alvo_id);
      const msg = andou(v, Object.assign({}, a.lote, d.campos));
      if(msg) throw erro(409, msg);
      for(const cp of (a.copias || [])){
        if(db.prepare('SELECT 1 FROM lote WHERE id=?').get(cp.lote.id))
          throw erro(409, 'o número #' + cp.lote.id + ' (a cópia) já está ocupado por outro volume');
      }
      const volta = {};
      Object.keys(d.campos || {}).forEach(k => { volta[k] = a.lote[k] == null ? null : a.lote[k]; });
      gravarCampos(db, 'lote', v.id, volta);
      for(const cp of (a.copias || [])){
        inserirLinha(db, 'lote', cp.lote);
        for(const i of (cp.itens || [])) inserirLinha(db, 'lote_item', i);
      }
    }
  },

  /* FECHAR VENCIDOS — a regra do `fechar_vencidos.js`, em BLOCO. So vale
     quando alguem CONFERIU no Mercado Livre que nao ha venda pendente no
     periodo: com uma venda real atrasada no meio, ela some da fila junto com o
     ruido, e e a peca que ninguem mais vai procurar. Por isso a data de corte
     e obrigatoria e vem de quem conferiu. */
  vencidos: {
    id:'vencidos', alvo:'periodo', emBloco:true,
    rotulo:'Fechar vencidos',
    explica:'Fecha em bloco os pendentes com despacho até a data que você conferiu no Mercado Livre. ' +
            'Cada um sai na data dele, às 15:00. Não toca no que despacha depois nem no bloqueado.',
    carregar: () => ({ id:0 }),
    valePara(db, o, params){
      const ate = dataDeCorte(params);
      if(ate > hoje(db)) return 'a data de corte (' + br(ate) + ') está no futuro — venda futura não foi despachada';
      if(!vencidosAte(db, ate).length) return 'nada pendente com despacho até ' + br(ate);
      return true;
    },
    previa(db, o, params){
      const ate = dataDeCorte(params);
      const lotes = vencidosAte(db, ate);
      const semData = lotes.filter(v => !v.despachar_em).length;
      const futuros = db.prepare(`SELECT COUNT(*) n FROM lote WHERE estagio='pendente'
        AND despachar_em IS NOT NULL AND despachar_em>?`).get(ate).n;
      const bloq = db.prepare("SELECT COUNT(*) n FROM lote WHERE estagio='bloqueado'").get().n;
      return {
        antes:  { ate, lotes },
        depois: { ate, campos:lotes.map(v => Object.assign({ id:v.id }, efeitoDeSaida(v))) },
        estoque: [],
        lista: lotes.slice(0, 200).map(v => ({ id:v.id, codigo:v.codigo, buyer:v.buyer, nf:v.nf,
          data:v.data, despachar_em:v.despachar_em, sai_em:carimboDe(v) })),
        resumo: 'Fecha ' + lotes.length + ' ' + pl(lotes.length, 'volume pendente', 'volumes pendentes') +
          ' com despacho até ' + br(ate) +
          (semData ? ' (' + semData + ' sem despacho lido, que ' + pl(semData, 'sai', 'saem') + ' no dia em que entrou)' : '') +
          '. Cada um sai na data dele, às 15:00. Ficam de fora: ' + futuros + ' com despacho depois de ' + br(ate) + ' e ' +
          bloq + ' ' + pl(bloq, 'bloqueado', 'bloqueados') + '. O saldo não se mexe.'
      };
    },
    executar(db, o, params){
      const p = this.previa(db, o, params);
      for(const c of p.depois.campos){
        const k = Object.assign({}, c); delete k.id;
        gravarCampos(db, 'lote', c.id, k);
      }
    },
    /* TUDO OU NADA: um que andou recusa o bloco inteiro, dizendo qual. Desfazer
       metade deixaria o bloco descrito por uma correcao que ja nao e verdade. */
    desfazer(db, c){
      const a = JSON.parse(c.antes || '{}'), d = JSON.parse(c.depois || '{}');
      const porId = {}; (a.lotes || []).forEach(v => { porId[v.id] = v; });
      for(const campos of (d.campos || [])){
        const v = db.prepare('SELECT * FROM lote WHERE id=?').get(campos.id);
        if(!v) throw erro(409, 'o volume #' + campos.id + ' não existe mais. Não desfiz nada.');
        const msg = andou(v, Object.assign({}, porId[campos.id], campos));
        if(msg) throw erro(409, msg);
      }
      for(const campos of (d.campos || [])){
        const ant = porId[campos.id], volta = {};
        Object.keys(campos).filter(k => k !== 'id').forEach(k => { volta[k] = ant[k] == null ? null : ant[k]; });
        gravarCampos(db, 'lote', campos.id, volta);
      }
    }
  },

  /* REABRIR VENDA FUTURA — a regra do `reabrir_futuros.js`. O criterio e
     estreito de proposito: so `carregado_em` DEPOIS de hoje, que nao tem
     interpretacao alternativa — ninguem saiu amanha. */
  reabrir: {
    id:'reabrir', alvo:'lote',
    rotulo:'Reabrir venda futura',
    explica:'O volume foi dado como saído numa data que ainda não chegou. Volta para a fábrica, para aparecer ' +
            'no Carregamento no dia em que tiver que sair de verdade. Não mexe em estoque.',
    carregar: volumePorId,
    valePara(db, v){
      if(!v.carregado_em) return 'este volume não tem saída marcada';
      if(String(v.carregado_em).slice(0, 10) <= hoje(db))
        return 'a saída (' + br(v.carregado_em) + ') não está no futuro — não há o que reabrir';
      if(v.saida_id) return 'saiu numa saída registrada (#' + v.saida_id + ') — não se reabre por aqui';
      return true;
    },
    previa(db, v){
      /* Volta para ONDE ELE ESTAVA: com etiqueta impressa (`embalado_em`), a
         embalado, que e o que o script fazia; SEM etiqueta, a pendente — voltar
         um volume que nunca teve a baixa a "embalado" o poria no Carregamento
         sem o −1 da etiqueta, que e a armadilha #27. */
      const destino = v.embalado_em ? 'embalado' : 'pendente';
      const campos = { estagio:destino, carregado_em:null, retirado_em:null, saiu_por:null };
      return {
        antes:  { lote:v },
        depois: { campos },
        estoque: [],
        resumo: 'Tira a saída de ' + br(v.carregado_em) + ' (data que ainda não chegou) e devolve o volume #' + v.id +
          ' a ' + destino + (destino === 'embalado' ? ' — a etiqueta já tinha saído' :
          ' — ele nunca teve a etiqueta de venda impressa') + '. O saldo não se mexe.'
      };
    },
    executar(db, v){ gravarCampos(db, 'lote', v.id, this.previa(db, v).depois.campos); },
    desfazer(db, c){ return ACOES.saida.desfazer.call(this, db, c); }
  },

  /* TIRAR DA FILA — a regra do `limpar_fila.js`, uma linha. A fila nunca somou
     +1 (o estoque nasce na embalagem, §2), entao tirar nao desconta nada. */
  fila: {
    id:'fila', alvo:'fila',
    rotulo:'Tirar da fila',
    explica:'Tira da fila de embalagem uma peça revisada que nunca foi embalada. Não mexe em estoque: ' +
            'a fila nunca somou nada. Embalar depois continua possível.',
    carregar: linhaFilaPorId,
    valePara(db, l){
      if(l.situacao !== 'aguardando') return 'esta linha já foi embalada — é a história de uma peça que virou estoque';
      return true;
    },
    previa(db, l){
      const d = String(l.revisado_em || l.data || '').slice(0, 10);
      return {
        antes: { linha:l }, depois: { linha:null }, estoque: [],
        resumo: 'Tira da fila a linha #' + l.id + ' (' + (l.codigo || '?') + (d ? ', revisada em ' + br(d) : '') +
          (l.modo === 'devolucao' ? ', veio de devolução' : '') + '). O saldo não se mexe.' +
          (d === hoje(db) ? ' ⚠ Revisada HOJE: confira o carrinho da bancada antes.' : '')
      };
    },
    executar(db, l){ db.prepare('DELETE FROM fila WHERE id=?').run(l.id); },
    desfazer(db, c){
      const a = JSON.parse(c.antes || '{}');
      if(db.prepare('SELECT 1 FROM fila WHERE id=?').get(c.alvo_id))
        throw erro(409, 'o número #' + c.alvo_id + ' da fila já está ocupado');
      inserirLinha(db, 'fila', a.linha);
    }
  },

  /* A FILA VELHA EM BLOCO — o lugar natural de limpar e o INVENTARIO (§4):
     zerado o estoque e contada a prateleira, a fila velha nao descreve mais
     nada. A idade e o que separa passivo de trabalho, e por isso a data de
     corte e de quem olhou a bancada. */
  fila_velha: {
    id:'fila_velha', alvo:'periodo', emBloco:true,
    rotulo:'Tirar a fila velha',
    explica:'Tira da fila as peças revisadas até a data escolhida e nunca embaladas. As embaladas ficam. ' +
            'Não mexe em estoque.',
    carregar: () => ({ id:0 }),
    valePara(db, o, params){
      const ate = dataDeCorte(params);
      if(ate > hoje(db)) return 'a data de corte (' + br(ate) + ') está no futuro';
      if(!filaAte(db, ate).length) return 'nenhuma peça aguardando embalagem revisada até ' + br(ate);
      return true;
    },
    previa(db, o, params){
      const ate = dataDeCorte(params);
      const linhas = filaAte(db, ate);
      const deHoje = linhas.filter(l => String(l.revisado_em || l.data || '').slice(0, 10) === hoje(db)).length;
      const dev = linhas.filter(l => l.modo === 'devolucao').length;
      return {
        antes: { ate, linhas }, depois: { ate, linhas:[] }, estoque: [],
        resumo: 'Tira da fila ' + linhas.length + ' ' + pl(linhas.length, 'peça revisada', 'peças revisadas') +
          ' até ' + br(ate) + ' e nunca ' + pl(linhas.length, 'embalada', 'embaladas') + '.' +
          (dev ? ' ' + dev + ' ' + pl(dev, 'veio', 'vieram') + ' de devolução.' : '') +
          (deHoje ? ' ⚠ ' + deHoje + ' ' + pl(deHoje, 'foi revisada', 'foram revisadas') +
            ' HOJE: confira o carrinho da bancada antes.' : '') +
          ' As embaladas ficam. O saldo não se mexe.'
      };
    },
    executar(db, o, params){
      for(const l of filaAte(db, dataDeCorte(params))) db.prepare('DELETE FROM fila WHERE id=?').run(l.id);
    },
    desfazer(db, c){
      const a = JSON.parse(c.antes || '{}');
      for(const l of (a.linhas || []))
        if(db.prepare('SELECT 1 FROM fila WHERE id=?').get(l.id))
          throw erro(409, 'o número #' + l.id + ' da fila já está ocupado. Não desfiz nada.');
      for(const l of (a.linhas || [])) inserirLinha(db, 'fila', l);
    }
  },

  /* PEDIR AJUSTE DE SALDO — a Mesa NAO tem acao de estoque direto. Ela abre o
     pedido do `ajuste_dominio` (§18, fase 3): o saldo nao anda, e quem aprova e
     outra pessoa, na aba Estoque. Exige tambem `estoque.ajustar` (a rota
     confere), porque a Mesa nao pode ser a porta dos fundos dessa chave. */
  ajuste: {
    id:'ajuste', alvo:'sku', chaveTexto:true, exige:'estoque.ajustar',
    rotulo:'Pedir ajuste de saldo',
    explica:'Abre um pedido de ajuste: quantas peças a mais ou a menos, com o motivo. O saldo não anda agora — ' +
            'outra pessoa aprova na aba Estoque.',
    carregar: skuPorCodigo,
    valePara(db, s){
      const p = pedidoAberto(db, s.codigo);
      if(p) return 'já há um pedido de ajuste de ' + s.codigo + ' esperando aprovação (feito por ' +
        (p.pedido_por || 'alguém') + ') — decida aquele antes';
      return true;
    },
    previa(db, s, params){
      const pr = params || {};
      const agora = ESTOQUE.saldo(db, s.codigo);
      let d;
      if(pr.delta !== undefined && pr.delta !== null && pr.delta !== '') d = Number(pr.delta);
      else if(pr.estoque !== undefined && pr.estoque !== null && pr.estoque !== '') d = Number(pr.estoque) - agora;
      else throw erro(400, 'diga quantas peças a mais ou a menos, ou o saldo novo');
      if(!Number.isInteger(d)) throw erro(400, 'quantidade inválida: peça é número inteiro');
      if(d === 0) throw erro(400, 'não há o que ajustar: o saldo já é ' + agora);
      if(!String(pr.motivo || '').trim()) throw erro(400, 'escolha o motivo da lista');
      return {
        antes: { sku:s, saldo:agora }, depois: { delta:d }, estoque: [],
        resumo: 'Abre um pedido de ajuste de ' + (d > 0 ? '+' : '') + d + ' em ' + s.codigo +
          ' (hoje o saldo é ' + agora + '), motivo "' + String(pr.motivo).trim() + '". O saldo NÃO anda agora: ' +
          'outra pessoa aprova na aba Estoque, e a aprovação aplica a diferença sobre o saldo daquele momento.'
      };
    },
    executar(db, s, params, ctx){
      this.previa(db, s, params);
      const pr = params || {};
      const r = AJUSTE.pedir(db, { codigo:s.codigo, delta:pr.delta, estoque:pr.estoque, motivo:pr.motivo,
        obs:[String(pr.obs || '').trim(), 'Mesa de correções #' + ctx.correcao_id + ': ' + ctx.motivo]
          .filter(Boolean).join(' · '),
        quem:ctx.quem });
      return { pedido_id:r.id, delta:r.delta, saldo_no_pedido:r.saldo_no_pedido };
    },
    /* Desfazer e DESISTIR do pedido (nada se apaga), e so enquanto ele estiver
       pendente: aprovado, o saldo ja andou, e o caminho e outro pedido. */
    desfazer(db, c, quem, ctx){
      const d = JSON.parse(c.depois || '{}');
      const p = d.pedido_id && db.prepare('SELECT * FROM ajuste_pedido WHERE id=?').get(d.pedido_id);
      if(!p) throw erro(409, 'esta correção não guardou o pedido de ajuste');
      if(p.status !== 'pendente') throw erro(409, 'o pedido #' + p.id + ' já foi ' + p.status +
        (p.status === 'aprovado' ? ' — o saldo já andou; corrija com outro pedido' : ''));
      AJUSTE.recusar(db, { id:p.id, resposta:'desfeito na Mesa de correções (#' + c.id + ')', quem,
        podeAprovar: !!(ctx && ctx.podeAprovar) });
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
  if(!t) return { volumes: [], skus: [] };       // busca vazia nao varre o banco
  const like = '%' + t.replace(/[%_\\]/g, '') + '%';
  const id = /^\d+$/.test(t) ? +t : -1;
  const up = t.toUpperCase();
  const volumes = db.prepare(`SELECT id,codigo,buyer,nf,packId,venda,estagio,data,despachar_em,
      modalidade,cancelada_em,cancelada_estagio,cancelada_varias,bloqueio
    FROM lote
    WHERE id=? OR venda=? OR packId=? OR nf=? OR UPPER(codigo)=? OR buyer LIKE ?
       OR EXISTS (SELECT 1 FROM lote_item i WHERE i.lote_id=lote.id AND UPPER(i.codigo)=?)
    ORDER BY id DESC LIMIT 50`).all(id, t, t, t, up, like, up);
  /* O SKU tambem abre na Mesa (fase 2): e por ele que se pede ajuste de saldo
     e se ve a fila de embalagem daquele codigo. */
  let skus = [];
  try{
    skus = db.prepare(`SELECT codigo,descricao,estoque FROM skus
      WHERE UPPER(codigo)=? OR UPPER(codigo) LIKE ? ORDER BY (UPPER(codigo)=?) DESC, codigo LIMIT 20`)
      .all(up, '%' + up.replace(/[%_\\]/g, '') + '%', up);
  }catch(e){ skus = []; }
  return { volumes, skus };
}

/* As acoes que valem para este objeto — com o motivo das que nao valem. So as
   do MESMO tipo de alvo: oferecer "Tirar da fila" num volume seria um botao
   que so serve para dar erro. As de bloco nao entram aqui: elas nascem nos
   contadores, com a data de corte. */
function acoesDe(db, tipo, o){
  return Object.keys(ACOES).filter(k => ACOES[k].alvo === tipo && !ACOES[k].emBloco).map(k => {
    const A = ACOES[k];
    let vale = true, por_que_nao = null;
    try{ const r = A.valePara(db, o); if(r !== true){ vale = false; por_que_nao = r; } }
    catch(e){ vale = false; por_que_nao = e.message; }
    const linha = { id:A.id, rotulo:A.rotulo, explica:A.explica, vale, por_que_nao };
    if(A.exige) linha.exige = A.exige;
    if(A.opcoes) linha.opcoes = A.opcoes(db, o);
    if(A.nota){ const nt = A.nota(db, o); if(nt) linha.nota_voltou = nt; }
    return linha;
  });
}
function historiaDe(db, tipo, id){
  try{
    return db.prepare(`SELECT id,acao,motivo,usuario_nome,criado_em,desfeita_em,desfeita_por
      FROM correcao WHERE alvo_tipo=? AND alvo_id=? ORDER BY id DESC`).all(tipo, id);
  }catch(e){ return []; }
}

/* O objeto, a historia e as acoes — com o motivo das que nao valem. */
function objeto(db, tipo, id){
  if(tipo === 'lote'){
    const v = volumePorId(db, id);
    return { tipo, id:v.id, volume:v, pecas:pecasDoVolume(db, v), historia:historiaDe(db, tipo, v.id),
             acoes:acoesDe(db, tipo, v) };
  }
  if(tipo === 'fila'){
    const l = linhaFilaPorId(db, id);
    return { tipo, id:l.id, linha:l, historia:historiaDe(db, tipo, l.id), acoes:acoesDe(db, tipo, l) };
  }
  if(tipo === 'sku'){
    const s = skuPorCodigo(db, id);
    let fila = [];
    try{ fila = db.prepare(`SELECT id,codigo,modo,revisado_em,data FROM fila
      WHERE codigo=? AND situacao='aguardando' ORDER BY revisado_em, id LIMIT 100`).all(s.codigo); }catch(e){}
    return { tipo, id:s.codigo, sku:s, saldo:ESTOQUE.saldo(db, s.codigo), pedido_aberto:pedidoAberto(db, s.codigo),
             fila, historia:historiaDe(db, tipo, s.codigo), acoes:acoesDe(db, tipo, s) };
  }
  throw erro(400, 'a Mesa abre volume (lote), linha da fila (fila) e SKU (sku) — não ' + tipo);
}

function alvoId(A, id){ return A.chaveTexto ? String(id == null ? '' : id).trim().toUpperCase() : +id; }

function previa(db, { acao:nome, tipo, id, params }){
  const A = acao(nome);
  if(tipo !== A.alvo) throw erro(400, 'a ação ' + nome + ' é de ' + A.alvo + ', não de ' + tipo);
  const o = A.carregar(db, alvoId(A, id));
  const v = A.valePara(db, o, params);
  if(v !== true) throw erro(409, v);
  return A.previa(db, o, params);
}

function executar(db, { acao:nome, tipo, id, params, motivo, quem }){
  const A = acao(nome);
  if(tipo !== A.alvo) throw erro(400, 'a ação ' + nome + ' é de ' + A.alvo + ', não de ' + tipo);
  const aid = alvoId(A, id);
  const o = A.carregar(db, aid);
  const v = A.valePara(db, o, params);
  if(v !== true) throw erro(409, v);
  const m = String(motivo == null ? '' : motivo).trim();
  if(!m) throw erro(400, 'escreva o motivo da correção');
  if(!quem || (quem.id == null && !quem.nome)) throw erro(401, 'sem pessoa logada');

  const p = A.previa(db, o, params);
  /* A linha da correcao nasce ANTES do efeito, porque e o id dela que vai na
     `referencia` do movimento — `correcao:<id>` (§5.1 da spec). O `depois`
     guarda tambem o estoque que a acao moveu: e ele que o desfazer inverte. */
  const depois = Object.assign({}, p.depois, { estoque:p.estoque || [] });
  const cid = db.prepare(`INSERT INTO correcao (acao,alvo_tipo,alvo_id,motivo,antes,depois,
      usuario_id,usuario_nome,teste) VALUES (?,?,?,?,?,?,?,?,?)`)
    .run(nome, tipo, A.emBloco ? 0 : aid, m, JSON.stringify(p.antes), JSON.stringify(depois),
      quem.id != null ? quem.id : null, quem.nome || '', o.teste ? 1 : 0).lastInsertRowid;
  /* O que a acao so sabe DEPOIS de agir (o id do pedido de ajuste) entra no
     `depois` — e dele que o desfazer precisa. */
  const extra = A.executar(db, o, params, { quem, motivo:m, correcao_id:cid });
  if(extra && typeof extra === 'object')
    db.prepare('UPDATE correcao SET depois=? WHERE id=?').run(JSON.stringify(Object.assign(depois, extra)), cid);
  return { correcao_id:cid, acao:nome, alvo:tipo + ':' + (A.emBloco ? 'bloco' : aid), resumo:p.resumo,
           estoque:p.estoque || [], extra:extra || null };
}

function desfazer(db, { id, quem, podeAprovar }){
  const c = db.prepare('SELECT * FROM correcao WHERE id=?').get(+id);
  if(!c) throw erro(404, 'correção não encontrada');
  if(c.desfeita_em) throw erro(409, 'esta correção já foi desfeita em ' + c.desfeita_em +
    ' por ' + (c.desfeita_por || '?'));
  if(!quem || (quem.id == null && !quem.nome)) throw erro(401, 'sem pessoa logada');
  acao(c.acao).desfazer(db, c, quem, { podeAprovar:!!podeAprovar });
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
  return itens.map(c => {
    let dep = {}; try{ dep = JSON.parse(c.depois || '{}'); }catch(e){}
    let ant = {}; try{ ant = JSON.parse(c.antes || '{}'); }catch(e){}
    const bloco = ACOES[c.acao] && ACOES[c.acao].emBloco;
    return {
      id:c.id, acao:c.acao, rotulo:(ACOES[c.acao] || {}).rotulo || c.acao,
      alvo_tipo:c.alvo_tipo, alvo_id:c.alvo_id,
      /* O bloco nao tem um alvo: diz quantos e ate quando, que e o que se
         confere depois. */
      bloco: bloco ? { ate:ant.ate || null, n:(ant.lotes || ant.linhas || []).length } : null,
      motivo:c.motivo, usuario_nome:c.usuario_nome, criado_em:c.criado_em,
      desfeita_em:c.desfeita_em, desfeita_por:c.desfeita_por,
      estoque:dep.estoque || []
    };
  });
}

/* OS CONTADORES SAO OS QUE TEM BOTAO (decisao 3 do dono): contador que acusa e
   nao sabe liberar e a trava que a equipe aprende a contornar (§5), e numero
   que nao zera vira paisagem. Na fase 2 chegam os tres que faltavam, JUNTO
   com a acao deles. O que e de modo teste fica de fora — e ensaio, nao
   passivo. */
function contadores(db){
  const f = classificarFantasmas(db).fantasmas
    .filter(o => !o.v.teste)
    .map(o => ({ id:o.v.id, data:o.v.data, codigo:o.v.codigo, buyer:o.v.buyer, nf:o.v.nf,
                 ja_era:o.anterior.id, ja_era_data:o.anterior.data, ja_era_estagio:o.anterior.estagio }));
  let canc = [];
  try{ canc = CANC.listar(db); }catch(e){ canc = []; }
  const H = hoje(db);
  const curto = v => ({ id:v.id, data:v.data, codigo:v.codigo, buyer:v.buyer, nf:v.nf, estagio:v.estagio,
                        despachar_em:v.despachar_em, carregado_em:v.carregado_em, embalado_em:v.embalado_em });
  /* VENCIDO e despacho JA PASSADO (antes de hoje). O volume sem data lida esta
     na fila de hoje por regra (§8, #7) e nao e "vencido" — a acao em bloco o
     inclui, como o script, e a previa diz quantos. */
  const venc = db.prepare(`SELECT * FROM lote WHERE estagio='pendente' AND despachar_em IS NOT NULL
    AND despachar_em<? AND COALESCE(teste,0)=0 ORDER BY despachar_em, id`).all(H);
  const fut = db.prepare(`SELECT * FROM lote WHERE carregado_em IS NOT NULL
    AND date(carregado_em)>? AND COALESCE(teste,0)=0 ORDER BY date(carregado_em), id`).all(H);
  let fv = [];
  try{
    fv = db.prepare(`SELECT id,codigo,modo,revisado_em,data FROM fila WHERE situacao='aguardando'
      AND date(COALESCE(revisado_em,data))<date(?,'-30 day') AND COALESCE(teste,0)=0
      ORDER BY revisado_em, id`).all(H);
  }catch(e){ fv = []; }
  return {
    fantasmas:{ n:f.length, itens:f },
    canceladas:{ n:canc.length, itens:canc },
    vencidos:{ n:venc.length, itens:venc.slice(0, 200).map(curto), ate_sugerido:diaRel(db, -1) },
    futuras:{ n:fut.length, itens:fut.slice(0, 200).map(curto) },
    fila_velha:{ n:fv.length, itens:fv.slice(0, 200), ate_sugerido:diaRel(db, -31) }
  };
}

module.exports = { ACOES, garantirSchema, erro, classificarFantasmas, pecasDoVolume,
                   devolucaoDeEstoque, buscar, objeto, previa, executar, desfazer,
                   historico, contadores, vencidosAte, filaAte, carimboDe, efeitoDeSaida };

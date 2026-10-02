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
  },

  /* ─── FASE 2 (02/10/2026) ──────────────────────────────────────────────── */

  /* DAR SAIDA — a regua do `regularizar_saida.js`, um volume por vez, decisao
     humana. O sistema nao tem como adivinhar que a peca saiu: "volume velho e
     pendente" tambem descreve a venda que a equipe ESQUECEU (§5). */
  saida: {
    id:'saida', alvo:'lote',
    rotulo:'Dar saída',
    explica:'O volume saiu de verdade e o sistema não soube (a etiqueta foi impressa direto do PDF do ' +
            'Mercado Livre, por exemplo). Marca como saído na data de despacho dele, às 15:00 — nunca hoje. ' +
            'Não mexe em estoque.',
    carregar: volumePorId,
    valePara(db, v){
      if(v.estagio === 'carregado') return 'este volume já saiu' + (v.carregado_em ? ' (' + dataBR(v.carregado_em) + ')' : '');
      if(v.estagio === CANC.ESTAGIO) return 'a venda foi cancelada no Mercado Livre — não há saída a registrar';
      /* ⚠️ VENDA FUTURA NAO FOI DESPACHADA (§5): fechar carimba uma saida que
         nao aconteceu, e o volume some do Carregamento no dia em que tiver que
         sair — a guarda que o `regularizar_saida.js` perdeu em 26/08/2026. */
      if(v.despachar_em && v.despachar_em > hoje(db))
        return 'só despacha em ' + dataBR(v.despachar_em) + ' — venda futura não foi despachada, a peça ainda está na fábrica';
      return true;
    },
    previa(db, v){
      const quando = carimbo(v);
      const copias = copiasPendentes(db, v);
      return {
        antes:  { lote:v },
        depois: { lote:Object.assign({}, v, { estagio:'carregado', carregado_em:quando,
                  retirado_em: ehColeta(v) ? quando : v.retirado_em }) },
        estoque: [],
        resumo: 'Marca o volume #' + v.id + ' como saído em ' + dataBR(quando) + ' às 15:00 — ' +
          (v.despachar_em ? 'a data de despacho da etiqueta' : 'o dia em que ele entrou, porque a etiqueta não trazia despacho') +
          ', nunca hoje.' + (ehColeta(v) ? ' É de coleta: fica como retirado pelo caminhão no mesmo carimbo.' : '') +
          ' O estoque não se mexe: ' + (v.estagio === 'embalado'
            ? 'a baixa já aconteceu na etiqueta.'
            : 'a peça nunca somou +1 na embalagem, então não pode baixar agora.') +
          (copias.length ? ' Há ' + copias.length + (copias.length === 1 ? ' cópia pendente' : ' cópias pendentes') +
            ' deste volume (' + copias.map(c => '#' + c.id).join(', ') + '): depois da saída ' +
            (copias.length === 1 ? 'ela vira fantasma' : 'elas viram fantasmas') + ' — descarte pelo contador.' : '')
      };
    },
    executar(db, v){ fecharComoSaido(db, v); },
    depoisReal(db, v){ return { lote: volumePorId(db, v.id) }; },
    desfazer(db, c){ reabrirLote(db, c); }
  },

  /* FECHAR VENCIDOS — a regua do `fechar_vencidos.js`, em bloco. A data de
     corte e OBRIGATORIA: "fechar tudo o que venceu" so vale quando alguem
     conferiu no ML que nao ha venda pendente no periodo — a venda real
     atrasada some da fila junto com o ruido, e essa ninguem mais procura. */
  vencidos: {
    id:'vencidos', alvo:'bloco',
    rotulo:'Fechar vencidos',
    explica:'Fecha em bloco os volumes pendentes cujo despacho já passou, até a data que você conferiu. ' +
            'Cada um sai na data de despacho dele. Não mexe em estoque.',
    carregar(){ return { id:0 }; },
    valePara(db, o, params){
      const ate = ateDe(db, params);
      if(!vencidosAte(db, ate).length) return 'nada pendente vencido até ' + dataBR(ate);
      return true;
    },
    previa(db, o, params){
      const ate = ateDe(db, params);
      const lista = vencidosAte(db, ate);
      const porDia = {};
      lista.forEach(v => { const k = v.despachar_em ? dataBR(v.despachar_em) : 'sem despacho lido';
        porDia[k] = (porDia[k] || 0) + 1; });
      const futuros = db.prepare(`SELECT COUNT(*) n FROM lote WHERE estagio='pendente' AND COALESCE(teste,0)=0
        AND ((despachar_em IS NOT NULL AND despachar_em>?) OR (despachar_em IS NULL AND data>?))`).get(ate, ate).n;
      const bloq = db.prepare("SELECT COUNT(*) n FROM lote WHERE estagio='bloqueado' AND COALESCE(teste,0)=0").get().n;
      return {
        antes:  { ate, volumes: lista.map(v => instante(v)) },
        depois: { ate, volumes: lista.map(v => Object.assign(instante(v), { estagio:'carregado',
                  carregado_em:carimbo(v), retirado_em:ehColeta(v) ? carimbo(v) : v.retirado_em })) },
        estoque: [],
        lista: lista.map(v => ({ id:v.id, codigo:v.codigo, buyer:v.buyer, nf:v.nf, despachar_em:v.despachar_em, data:v.data })),
        resumo: 'Fecha ' + lista.length + (lista.length === 1 ? ' volume pendente vencido' : ' volumes pendentes vencidos') +
          ' até ' + dataBR(ate) + ' (' + Object.keys(porDia).map(k => k + ': ' + porDia[k]).join(' · ') + '). ' +
          'Cada um sai na data de despacho dele, às 15:00. ' + foraDe(futuros, bloq, ate) +
          'Só confirme depois de conferir no Mercado Livre que não há venda pendente nesse período: ' +
          'uma venda atrasada de verdade sumiria da fila junto.'
      };
    },
    executar(db, o, params){ vencidosAte(db, ateDe(db, params)).forEach(v => fecharComoSaido(db, v)); },
    depoisReal(db, o, params, antes){
      return { ate:antes.ate, volumes:antes.volumes.map(a => instante(volumePorId(db, a.id))) };
    },
    desfazer(db, c){
      const a = JSON.parse(c.antes || '{}'), d = JSON.parse(c.depois || '{}');
      /* TUDO OU NADA: um volume que andou depois trava o bloco inteiro, e a
         recusa diz qual. Desfazer metade deixaria um bloco que ninguem sabe
         descrever. */
      for(const dv of (d.volumes || [])){
        const v = db.prepare('SELECT * FROM lote WHERE id=?').get(dv.id);
        if(!v) throw erro(409, 'o volume #' + dv.id + ' não existe mais. Não desfiz nada.');
        const campo = andou(v, dv);
        if(campo) throw erro(409, 'o volume #' + dv.id + ' andou depois desta correção: ' + campo + ' era ' +
          (dv[campo] || 'vazio') + ' e agora é ' + (v[campo] || 'vazio') + '. Não desfiz nada.');
      }
      const up = db.prepare('UPDATE lote SET estagio=?, carregado_em=?, retirado_em=? WHERE id=?');
      for(const av of (a.volumes || [])) up.run(av.estagio, av.carregado_em, av.retirado_em, av.id);
    }
  },

  /* REABRIR VENDA FUTURA — a regua do `reabrir_futuros.js`: so `carregado_em`
     MAIOR QUE HOJE, que nao tem interpretacao alternativa (ninguem saiu amanha). */
  reabrir: {
    id:'reabrir', alvo:'lote',
    rotulo:'Reabrir venda futura',
    explica:'O volume foi fechado com uma data de saída que ainda não chegou. Ele não saiu: volta para a fábrica, ' +
            'e aparece no Carregamento no dia em que tiver que sair. Não mexe em estoque.',
    carregar: volumePorId,
    valePara(db, v){
      if(!v.carregado_em) return 'este volume não está fechado';
      if(v.carregado_em.slice(0, 10) <= hoje(db))
        return 'saiu em ' + dataBR(v.carregado_em) + ', que já chegou — não há o que reabrir';
      if(v.saida_id) return 'está numa saída registrada (#' + v.saida_id + '): não foi o fechamento à mão que pôs esta data';
      return true;
    },
    previa(db, v){
      /* ⚠️ VOLTA A EMBALADO SO SE A ETIQUETA SAIU. O script voltava todos a
         `embalado`, e o volume fechado por engano direto de `pendente` passaria
         a aparecer no Carregamento sem ter tido o −1 — a armadilha #27. */
      const para = v.embalado_em ? 'embalado' : 'pendente';
      return {
        antes:  { lote:v },
        depois: { lote:Object.assign({}, v, { estagio:para, carregado_em:null,
                  retirado_em:(v.retirado_em && v.retirado_em.slice(0, 10) > hoje(db)) ? null : v.retirado_em }) },
        estoque: [],
        resumo: 'Reabre o volume #' + v.id + ': a saída em ' + dataBR(v.carregado_em) + ' ainda não aconteceu. ' +
          (para === 'embalado'
            ? 'Volta a embalado (a etiqueta já tinha saído) e aparece no Carregamento.'
            : 'Volta a pendente: a etiqueta nunca foi impressa, então ele precisa passar pela Etiqueta de Venda.') +
          ' O estoque não se mexe.'
      };
    },
    executar(db, v){
      const d = this.previa(db, v).depois.lote;
      db.prepare('UPDATE lote SET estagio=?, carregado_em=NULL, retirado_em=? WHERE id=?').run(d.estagio, d.retirado_em, v.id);
    },
    depoisReal(db, v){ return { lote: volumePorId(db, v.id) }; },
    desfazer(db, c){ reabrirLote(db, c); }
  },

  /* TIRAR DA FILA — a regua do `limpar_fila.js`, uma linha por vez. A linha
     `embalado` e historia de peca que virou estoque e nunca e tocada. */
  fila: {
    id:'fila', alvo:'fila',
    rotulo:'Tirar da fila',
    explica:'Tira da fila de embalagem uma peça revisada que nunca foi embalada e não existe mais. ' +
            'Não mexe em estoque: a fila nunca somou +1.',
    carregar(db, id){
      const f = db.prepare('SELECT * FROM fila WHERE id=?').get(+id);
      if(!f) throw erro(404, 'linha #' + id + ' da fila não existe (ou já foi tirada)');
      return f;
    },
    valePara(db, f){
      if(f.situacao !== 'aguardando')
        return 'esta peça já foi embalada e virou estoque — a linha é história, não se tira';
      return true;
    },
    previa(db, f){
      const dia = String(f.revisado_em || f.data || '').slice(0, 10);
      const dias = dia ? Math.round((new Date(hoje(db) + 'T12:00:00') - new Date(dia + 'T12:00:00')) / 86400000) : null;
      return {
        antes:  { fila:f },
        depois: { fila:null },
        estoque: [],
        resumo: 'Tira da fila a linha #' + f.id + ' (' + f.codigo + ', revisada ' +
          (dias === null ? 'sem data' : dias === 0 ? 'hoje' : 'em ' + dataBR(dia) + ', há ' + dias + (dias === 1 ? ' dia' : ' dias')) + '). ' +
          (dias === 0 ? 'Confira o carrinho da bancada antes: a peça pode estar lá esperando o kit. ' : '') +
          (f.modo === 'devolucao' ? 'Veio de uma devolução (peça que voltou do Mercado Livre para reembalar): tirar perde o ' +
            'vínculo, e a peça física continua na fábrica. ' : '') +
          'O estoque não se mexe. Se a peça aparecer, embalar continua somando +1 — a fila não é obrigatória.'
      };
    },
    executar(db, f){ db.prepare('DELETE FROM fila WHERE id=?').run(f.id); },
    desfazer(db, c){
      const a = JSON.parse(c.antes || '{}');
      if(!a.fila) throw erro(409, 'esta correção não guardou a linha — não dá para devolver');
      if(db.prepare('SELECT 1 FROM fila WHERE id=?').get(c.alvo_id))
        throw erro(409, 'o número #' + c.alvo_id + ' da fila já está ocupado por outra linha: devolver por cima ' +
                        'apagaria o que está lá');
      const campos = Object.keys(a.fila);
      db.prepare('INSERT INTO fila (' + campos.join(',') + ') VALUES (' + campos.map(() => '?').join(',') + ')')
        .run(campos.map(k => a.fila[k]));
    }
  },

  /* PEDIR AJUSTE — a Mesa NAO aplica: ela abre o pedido pela porta do ajuste
     em duas pessoas (§18, fase 3), e outra pessoa aprova. Por isso a acao tem
     `porta` e nao tem `executar`. */
  ajuste: {
    id:'ajuste', alvo:'sku',
    rotulo:'Pedir ajuste de saldo',
    explica:'Pede um ajuste do saldo (quantas peças a mais ou a menos, com motivo). O saldo não muda agora: ' +
            'outra pessoa aprova na aba Estoque.',
    porta:'/api/estoque/ajuste', exige:'estoque.ajustar',
    carregar: skuPorCodigo,
    valePara(db, s){
      if(s.sob_medida) return 'sob medida não tem saldo (a peça é feita contra o pedido): não há o que ajustar';
      let p = null;
      try{ p = db.prepare("SELECT pedido_por FROM ajuste_pedido WHERE codigo=? AND status='pendente'").get(s.codigo); }catch(e){}
      if(p) return 'já há um pedido de ajuste deste SKU esperando aprovação (feito por ' + (p.pedido_por || 'alguém') +
                   '): decida aquele antes, na aba Estoque';
      return true;
    }
  }
};

/* "0 pendente(s)" e meia concordancia (a licao do "1 destes pedidos ja
   tiveram", §19): o que fica de fora so e escrito quando existe. */
function foraDe(futuros, bloq, ate){
  const p = [];
  if(futuros) p.push(futuros + (futuros === 1 ? ' pendente com despacho' : ' pendentes com despacho') + ' depois de ' + dataBR(ate));
  if(bloq) p.push(bloq + (bloq === 1 ? ' bloqueado' : ' bloqueados') + ' — outro caminho');
  return p.length ? 'Ficam de fora ' + p.join(' e ') + '. ' : '';
}
/* ─── apoio da fase 2 ─────────────────────────────────────────────────────── */
function hoje(db){ return db.prepare("SELECT date('now','localtime') d").get().d; }
function dataBR(d){ const s = String(d || ''); return s.length >= 10 ? s.slice(8, 10) + '/' + s.slice(5, 7) : s; }
function ehColeta(v){ return String(v.modalidade || '').toLowerCase() === 'coleta'; }
/* A saida e carimbada NA DATA DO VOLUME, as 15:00 (§5, "os tres scripts") —
   nunca hoje: fechar passivo com a data de hoje cria um pico falso de saidas e
   esvazia os dias em que as pecas sairam de verdade. 15:00 e convencao (§8). */
function carimbo(v){ return (v.despachar_em || v.data) + ' 15:00:00'; }
/* Coleta ganha `retirado_em` no mesmo carimbo: sem ele a caixa cairia no card
   "esperando o caminhao" (AGUARDA_CAMINHAO do carga.js), que e a regua da tela. */
function fecharComoSaido(db, v){
  const q = carimbo(v);
  db.prepare("UPDATE lote SET estagio='carregado', carregado_em=?, retirado_em=? WHERE id=?")
    .run(q, ehColeta(v) ? q : v.retirado_em, v.id);
}
function instante(v){ const o = { id:v.id }; ANDOU.forEach(k => o[k] = v[k] == null ? null : v[k]); return o; }
function andou(atual, ref){
  for(const campo of ANDOU)
    if(String(atual[campo] == null ? '' : atual[campo]) !== String(ref[campo] == null ? '' : ref[campo])) return campo;
  return null;
}
/* Desfazer de acao que mudou o proprio estagio: compara com o DEPOIS gravado
   (o estado que a acao deixou), e devolve o ANTES. */
function reabrirLote(db, c){
  const a = JSON.parse(c.antes || '{}'), d = JSON.parse(c.depois || '{}');
  const v = volumePorId(db, c.alvo_id);
  const campo = andou(v, d.lote || {});
  if(campo) throw erro(409, 'o volume andou depois desta correção: ' + campo + ' era ' +
    ((d.lote && d.lote[campo]) || 'vazio') + ' e agora é ' + (v[campo] || 'vazio') + '. Não desfiz nada.');
  db.prepare('UPDATE lote SET estagio=?, carregado_em=?, retirado_em=? WHERE id=?')
    .run(a.lote.estagio, a.lote.carregado_em, a.lote.retirado_em, v.id);
}
function copiasPendentes(db, v){
  if(!v.packId && !v.venda) return [];
  return db.prepare(`SELECT id,data FROM lote WHERE id<>? AND estagio='pendente'
    AND ((packId IS NOT NULL AND packId=?) OR (venda IS NOT NULL AND venda=?))`).all(v.id, v.packId, v.venda);
}
function ateDe(db, params){
  const ate = String((params && params.ate) || '').trim();
  if(!ate) throw erro(400, 'escolha até que data fechar — o período tem que ter sido conferido no Mercado Livre');
  if(!/^\d{4}-\d{2}-\d{2}$/.test(ate)) throw erro(400, 'a data de corte se escreve como AAAA-MM-DD');
  if(ate > hoje(db)) throw erro(400, 'a data de corte não pode ser no futuro: venda futura não foi despachada');
  return ate;
}
/* Pendente, fora do modo teste, com despacho ate o corte. O sem despacho lido
   entra se ENTROU ate o corte — o script pegava todos, e o que entrou hoje
   cedo ainda e trabalho. Bloqueado fica de fora: e outro problema. */
function vencidosAte(db, ate){
  return db.prepare(`SELECT * FROM lote WHERE estagio='pendente' AND COALESCE(teste,0)=0
    AND ((despachar_em IS NOT NULL AND despachar_em<=?) OR (despachar_em IS NULL AND data<=?))
    ORDER BY COALESCE(despachar_em,data), id`).all(ate, ate);
}
function skuPorCodigo(db, codigo){
  const s = db.prepare(`SELECT s.codigo, s.descricao, s.estoque, COALESCE(m.sob_medida,0) sob_medida
    FROM skus s LEFT JOIN modelo m ON m.id=s.modelo_id WHERE UPPER(s.codigo)=UPPER(?)`).get(String(codigo || ''));
  if(!s) throw erro(404, 'SKU ' + codigo + ' não cadastrado');
  return s;
}

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
  /* Fase 2: o SKU (para o pedido de ajuste e o extrato) e as linhas de fila
     aguardando daquele codigo (para o "tirar da fila"). */
  let skus = [], fila = [];
  try{
    skus = db.prepare(`SELECT codigo, descricao, estoque FROM skus WHERE UPPER(codigo) LIKE ?
      ORDER BY codigo LIMIT 20`).all('%' + up.replace(/[%_\\]/g, '') + '%');
  }catch(e){}
  try{
    fila = db.prepare(`SELECT id, codigo, modo, revisado_em, data FROM fila
      WHERE situacao='aguardando' AND UPPER(codigo)=? ORDER BY revisado_em, id LIMIT 50`).all(up);
  }catch(e){}
  return { volumes, skus, fila };
}

function acoesPara(db, tipo, o){
  return Object.keys(ACOES).filter(k => ACOES[k].alvo === tipo).map(k => {
    const A = ACOES[k];
    let vale = true, por_que_nao = null;
    try{ const r = A.valePara(db, o); if(r !== true){ vale = false; por_que_nao = r; } }
    catch(e){ vale = false; por_que_nao = e.message; }
    const linha = { id:A.id, rotulo:A.rotulo, explica:A.explica, vale, por_que_nao };
    if(A.porta){ linha.porta = A.porta; linha.exige = A.exige; }
    if(A.opcoes) linha.opcoes = A.opcoes(db, o);
    if(A.nota){ const nt = A.nota(db, o); if(nt) linha.nota_voltou = nt; }
    return linha;
  });
}
function historiaDe(db, tipo, id){
  try{
    return db.prepare(`SELECT id,acao,motivo,usuario_nome,criado_em,desfeita_em,desfeita_por
      FROM correcao WHERE alvo_tipo=? AND alvo_id=? ORDER BY id DESC`).all(tipo, +id);
  }catch(e){ return []; }
}

/* O objeto, a historia e as acoes — com o motivo das que nao valem. */
function objeto(db, tipo, id){
  if(tipo === 'lote'){
    const v = volumePorId(db, id);
    return { tipo, id:v.id, volume:v, pecas:pecasDoVolume(db, v), historia:historiaDe(db, tipo, id),
             acoes:acoesPara(db, tipo, v) };
  }
  if(tipo === 'fila'){
    const f = ACOES.fila.carregar(db, id);
    return { tipo, id:f.id, fila:f, historia:historiaDe(db, tipo, id), acoes:acoesPara(db, tipo, f) };
  }
  if(tipo === 'sku'){
    const s = skuPorCodigo(db, id);
    let extrato = [], pedido = null, naFila = 0;
    try{ extrato = ESTOQUE.extrato(db, s.codigo, { limite:15 }); }catch(e){}
    try{ pedido = db.prepare("SELECT * FROM ajuste_pedido WHERE codigo=? AND status='pendente'").get(s.codigo) || null; }catch(e){}
    try{ naFila = db.prepare("SELECT COUNT(*) n FROM fila WHERE situacao='aguardando' AND UPPER(codigo)=UPPER(?)").get(s.codigo).n; }catch(e){}
    return { tipo, id:s.codigo, sku:s, extrato, pedido_pendente:pedido, na_fila:naFila, acoes:acoesPara(db, tipo, s) };
  }
  throw erro(400, 'a Mesa abre volume (`lote`), linha da fila (`fila`) ou SKU (`sku`) — não ' + tipo);
}

function previa(db, { acao:nome, tipo, id, params }){
  const A = acao(nome);
  if(tipo !== A.alvo) throw erro(400, 'a ação ' + nome + ' é de ' + A.alvo + ', não de ' + tipo);
  if(A.porta) throw semPorta(A);
  const o = A.carregar(db, id);
  const v = A.valePara(db, o, params);
  if(v !== true) throw erro(409, v);
  return A.previa(db, o, params);
}
/* ⚠️ A MESA NAO TEM ACAO DE ESTOQUE DIRETO (§4 da spec): o pedido de ajuste vai
   pela porta do ajuste em duas pessoas, e outra pessoa aprova. */
function semPorta(A){
  return erro(409, 'a Mesa não aplica "' + A.rotulo + '": o pedido vai por ' + A.porta +
                   ', e outra pessoa aprova na aba Estoque');
}

function executar(db, { acao:nome, tipo, id, params, motivo, quem }){
  const A = acao(nome);
  if(tipo !== A.alvo) throw erro(400, 'a ação ' + nome + ' é de ' + A.alvo + ', não de ' + tipo);
  if(A.porta) throw semPorta(A);
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
  /* O DEPOIS DE VERDADE, relido do banco: o desfazer das acoes que mudam o
     proprio estagio compara contra ele ("o objeto andou depois?"). */
  if(A.depoisReal)
    db.prepare('UPDATE correcao SET depois=? WHERE id=?').run(JSON.stringify(Object.assign({},
      A.depoisReal(db, o, params, p.antes), { estoque:p.estoque || [] })), cid);
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
  /* Fase 2 — cada contador chega JUNTO com a acao que o zera. */
  const venc = db.prepare(`SELECT id,data,codigo,buyer,nf,despachar_em,modalidade FROM lote
    WHERE estagio='pendente' AND COALESCE(teste,0)=0
      AND ((despachar_em IS NOT NULL AND despachar_em<date('now','localtime'))
        OR (despachar_em IS NULL AND data<date('now','localtime')))
    ORDER BY COALESCE(despachar_em,data), id`).all();
  const fut = db.prepare(`SELECT id,data,codigo,buyer,nf,despachar_em,carregado_em FROM lote
    WHERE carregado_em IS NOT NULL AND date(carregado_em)>date('now','localtime') AND COALESCE(teste,0)=0
    ORDER BY date(carregado_em), id`).all();
  /* Fila VELHA, e nao fila: a de hoje quase sempre tem peca no carrinho, e e
     trabalho. Mais de 30 dias e a faixa que o `limpar_fila.js` chama de passivo. */
  let filaVelha = [];
  try{
    filaVelha = db.prepare(`SELECT id,codigo,modo,revisado_em,data FROM fila
      WHERE situacao='aguardando' AND COALESCE(teste,0)=0
        AND date(COALESCE(revisado_em,data)) < date('now','localtime','-30 days')
      ORDER BY revisado_em, id`).all();
  }catch(e){}
  return { fantasmas:{ n:f.length, itens:f }, canceladas:{ n:canc.length, itens:canc },
           vencidos:{ n:venc.length, itens:venc }, futuras:{ n:fut.length, itens:fut },
           fila:{ n:filaVelha.length, dias:30, itens:filaVelha } };
}

/* ─── O TERMINAL (fase 3) ─────────────────────────────────────────────────────
   Os cinco scripts de passivo chamam as MESMAS acoes do botao, e cada volume
   corrigido grava a sua linha em `correcao` — botao e terminal com a mesma
   regua, e o que o terminal fez aparece no historico da Mesa, com desfazer.
   Quem fez e o proprio script: o terminal nao tem pessoa logada, e escrever um
   nome inventado seria pior que dizer de onde veio. */
function terminal(script, argv){
  const a = argv || [];
  const i = a.indexOf('--motivo');
  const m = i >= 0 && a[i + 1] ? String(a[i + 1]).trim() : '';
  return { quem:{ id:null, nome:'terminal: ' + script }, motivo:m || ('rodado pelo terminal: ' + script) };
}

module.exports = { ACOES, garantirSchema, terminal, erro, classificarFantasmas, pecasDoVolume,
                   devolucaoDeEstoque, buscar, objeto, previa, executar, desfazer,
                   historico, contadores };

/* O MATERIAL EXTRA A DECIDIR — spec FICHAS-NO-CADASTRO-UNICO §3-G, decisao do
 * dono de 11/11/2026 (DECISOES.md). Dono unico da tabela `material_extra`.
 *
 * A peca com problema na revisao (medida padrao) e a peca recusada no sob
 * medida NAO BAIXAM MATERIAL SOZINHAS: "as vezes estamos apenas refazendo e
 * nao teve que trocar material" (o dono). Cada uma vira uma linha aqui, com a
 * ficha daquela peca como sugestao, e o Supervisor decide no fim do dia
 * (tela 106, chave `material.extra`):
 *
 *   nao_usou   fecha sem baixar
 *   usou       escolhe os materiais e a quantidade (a da ficha vem sugerida,
 *              editavel) e baixa — pelo componente_dominio, com quem decidiu
 *
 * ⚠️ BAIXA SO O QUE SAI PELA FICHA? NAO: o material extra baixa QUALQUER
 * material por quantidade, saia ele pela ficha ou pela contagem. A decisao e
 * de uma pessoa, olhando o que foi gasto de verdade — e a contagem do material
 * que sai por ela vai encontrar o saldo ja descontado, em vez de chamar a peca
 * refeita de perda. O material por volume e o sem saldo sao recusados.
 *
 * ⚠️ QUEM REGISTROU O PROBLEMA NAO DECIDE (a regra das duas pessoas do §18):
 * quem bipou "peca com problema" nao diz quanto material a propria peca gastou.
 * ⚠️ DECIDIDA NAO SE DECIDE DE NOVO (409): a baixa ja andou no livro.
 * ⚠️ LINHA PARADA NAO SOME: a central de Pendencias (204) a conta (pendentes).
 */
const COMP = require('./componente_dominio');
const QUEM = require('./quem');

class Recusa extends Error{ constructor(status, msg){ super(msg); this.status = status; } }
const json = t => { try{ return JSON.parse(t || '[]'); }catch(e){ return []; } };

function registrar(db, a){
  const r = db.prepare(`INSERT INTO material_extra (origem, operacao, referencia, descricao, motivo, sugestao,
      registrado_por, registrado_por_id) VALUES (?,?,?,?,?,?,?,?)`)
    .run(a.origem, a.operacao, a.referencia || null, a.descricao || null, a.motivo || null,
      JSON.stringify(a.sugestao || []), a.registrado_por || null, a.registrado_por_id || null);
  return { id:r.lastInsertRowid };
}

/* A sugestao da peca da medida padrao: a ficha do SKU. */
function registrarRevisao(db, a){
  const f = require('./baixa_material_dominio').daFichaPadrao(db, a.sku);
  return registrar(db, { origem:'revisao', operacao:'padrao', referencia:a.referencia, descricao:a.sku,
    motivo:a.motivo, sugestao:f.itens, registrado_por:a.quem && a.quem.nome, registrado_por_id:a.quem && a.quem.id });
}

function linha(r){
  return Object.assign({}, r, { sugestao:json(r.sugestao), itens:r.itens ? json(r.itens) : null });
}
function listar(db, filtro){
  const pend = !filtro || filtro === 'pendentes';
  const rows = db.prepare('SELECT * FROM material_extra WHERE ' + (pend ? 'decisao IS NULL' : 'decisao IS NOT NULL') +
    ' ORDER BY ' + (pend ? 'registrado_em, id' : 'decidido_em DESC, id DESC') + ' LIMIT 300').all();
  return rows.map(linha);
}

/* Para a central de Pendencias: SO NUMERO (a regra da central). */
function pendentes(db){
  const r = db.prepare('SELECT COUNT(*) n, MIN(registrado_em) desde FROM material_extra WHERE decisao IS NULL').get();
  return { n:r.n || 0, desde:r.desde || null };
}

function decidir(db, id, b, req){
  const p = QUEM.pessoa(req) || { id:null, nome:null };
  return db.transaction(() => {
    const m = db.prepare('SELECT * FROM material_extra WHERE id=?').get(+id);
    if(!m) throw new Recusa(404, 'linha de material extra não encontrada');
    if(m.decisao) throw new Recusa(409, 'esta linha já foi decidida por ' + (m.decidido_por || 'outra pessoa') + ' em ' + (m.decidido_em || '—'));
    /* ⚠️ O MODO TESTE NAO DECIDE LINHA DE VERDADE (③ REVISAO, a regra do
       travaTeste do §11): a baixa nasceria teste=1 e o "apagar tudo" a desfaria
       pela foto, com a linha ja decidida — a baixa sumiria sem volta. */
    const emTeste = (db.prepare("SELECT valor FROM config WHERE chave='modo_teste'").get() || {}).valor === '1';
    if(emTeste && !m.teste) throw new Recusa(409, 'Modo teste ligado: esta linha é de verdade. Desligue o modo teste para decidir.');
    if(m.registrado_por_id && p.id && +m.registrado_por_id === +p.id)
      throw new Recusa(409, 'quem registrou o problema não decide o material dele — outra pessoa decide');
    const decisao = b && b.decisao;
    if(decisao !== 'nao_usou' && decisao !== 'usou') throw new Recusa(400, 'escolha: "não precisou de material" ou "usou material"');
    let itens = [];
    if(decisao === 'usou'){
      const lista = Array.isArray(b.itens) ? b.itens : [];
      for(const it of lista){
        /* Numero escrito pela metade ("3abc", "2,5kg") e RECUSADO, nunca
           aproveitado (#25, #33). Tres casas, como o saldo (componente_dominio):
           o que vira zero nao e baixa. */
        const t = String(it && it.quantidade == null ? '' : it.quantidade).trim();
        if(!/^\d+([.,]\d+)?$/.test(t)) throw new Recusa(400, 'a quantidade tem que ser um número maior ou igual a 0 — veio "' + t + '"');
        const q = Math.round(parseFloat(t.replace(',', '.')) * 1000) / 1000;
        if(q === 0) continue;
        const c = db.prepare('SELECT id, nome, unidade, modo_saldo FROM componente WHERE id=?').get(+(it && it.componente_id));
        if(!c) throw new Recusa(400, 'o material ' + (it && it.componente_id) + ' não existe');
        if(c.modo_saldo !== 'quantidade') throw new Recusa(400, '"' + c.nome + '" não é por quantidade: ' +
          (c.modo_saldo === 'volume' ? 'o rolo sai pelo "Abri" da 503.' : 'material sem saldo não se baixa.'));
        itens.push({ componente_id:c.id, nome:c.nome, unidade:c.unidade, quantidade:q });
      }
      if(!itens.length) throw new Recusa(400, 'diga qual material foi usado e quanto — ou escolha "não precisou de material"');
      for(const it of itens)
        COMP.movimentar(db, { componente_id:it.componente_id, delta:-it.quantidade, motivo:'material_extra',
          referencia:'material_extra:' + m.id, usuario_id:p.id, usuario_nome:p.nome, teste:m.teste, operacao:m.operacao });
    }
    const obs = b && b.obs ? String(b.obs).trim().slice(0, 500) : null;
    db.prepare(`UPDATE material_extra SET decisao=?, itens=?, obs=?, decidido_por=?, decidido_por_id=?,
        decidido_em=datetime('now','localtime') WHERE id=?`)
      .run(decisao, decisao === 'usou' ? JSON.stringify(itens) : null, obs, p.nome, p.id, m.id);
    return linha(db.prepare('SELECT * FROM material_extra WHERE id=?').get(m.id));
  })();
}

module.exports = { Recusa, registrar, registrarRevisao, listar, pendentes, decidir };

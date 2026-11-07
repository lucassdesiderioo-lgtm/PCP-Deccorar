#!/usr/bin/env node
/* JUNTAR O FORNECEDOR REPETIDO E TIRAR O MARKETPLACE DO CADASTRO (07/11/2026).
 *
 * Decisão do dono depois da migração da fase 9 (R-CMP-11, R-CMP-13):
 *   - o "Ação" (#6) que a migração criou é o "AC" (#2) que o PCP já tinha;
 *   - "ML" (#3) e "SHOPI" (#5) são canal (Mercado Livre e Shopee), não fornecedor.
 *
 *   node arrumar_fornecedores_cmp.js            simula: diz o que faria, e não grava nada
 *   node arrumar_fornecedores_cmp.js --aplicar  grava, com backup dos DOIS bancos antes
 *
 * JUNTAR (o que sai → o que fica):
 *   - toda linha do PCP que cita o que sai (`fornecedor_id`, em qualquer tabela)
 *     passa a citar o que fica; no sob medida, todo `fornecedor_pcp_id`;
 *   - o que fica é COMPLETADO com o que só o outro tinha (pix, telefone…) e não
 *     perde o que já tinha; ganha o nome escolhido;
 *   - o que sai NÃO é apagado: fica desativado, com a observação dizendo para
 *     onde foi (há auditoria e história que o citam pelo id);
 *   - oferta repetida (mesmo material e embalagem nos dois) RECUSA tudo: quem
 *     decide qual preço fica é uma pessoa.
 *
 * MARKETPLACE VIRA CANAL:
 *   - o pedido antigo sem canal ganha o canal e, sem loja escrita, a loja com o
 *     nome do cadastro; ele continua apontando o fornecedor antigo (é história);
 *   - o cadastro é desativado, e a simulação lista as ofertas que deixam de valer.
 *
 * ⚠️ SÃO DOIS BANCOS E NÃO HÁ TRANSAÇÃO ENTRE ELES: backup dos dois, a escrita
 * no PCP numa transação, depois a do sob medida noutra. Rodar de novo não faz
 * nada (o que sai já não é citado; o pedido já tem canal).
 */
const path = require('path');

const PADRAO = { juntar:[{ sai:6, fica:2, nome:'Ação' }],
  canal:[{ fornecedor:3, canal:'mercado_livre' }, { fornecedor:5, canal:'shopee' }] };
const CANAIS = ['mercado_livre', 'shopee', 'amazon', 'loja_fisica', 'direto'];
const COMPLETAR = ['cnpj', 'contato', 'telefone', 'email', 'prazo_entrega', 'pagamento', 'regime', 'whatsapp', 'tipo', 'pix', 'banco', 'agencia', 'conta'];

const tabelasCom = (db, coluna, fora) => db.prepare("SELECT name FROM sqlite_master WHERE type='table'").all().map(t => t.name)
  .filter(t => t !== fora && db.prepare('PRAGMA table_info(' + t + ')').all().some(c => c.name === coluna));
const colunas = (db, t) => db.prepare('PRAGMA table_info(' + t + ')').all().map(c => c.name);

function planejar(pcp, sm, opc){
  opc = opc || PADRAO;
  const forn = id => pcp.prepare('SELECT * FROM fornecedor WHERE id=?').get(+id);
  const juntar = (opc.juntar || []).map(j => {
    if(+j.sai === +j.fica) throw new Error('juntar o #' + j.sai + ' com ele mesmo não faz sentido');
    const sai = forn(j.sai), fica = forn(j.fica);
    if(!sai || !fica) throw new Error('fornecedor #' + (!sai ? j.sai : j.fica) + ' não existe no PCP');
    const mover = {};
    for(const t of tabelasCom(pcp, 'fornecedor_id', 'fornecedor')){
      const q = pcp.prepare('SELECT COUNT(*) n FROM ' + t + ' WHERE fornecedor_id=?').get(sai.id).n;
      if(q) mover['pcp.' + t] = q;
    }
    if(sm) for(const t of tabelasCom(sm, 'fornecedor_pcp_id')){
      const q = sm.prepare('SELECT COUNT(*) n FROM ' + t + ' WHERE fornecedor_pcp_id=?').get(sai.id).n;
      if(q) mover['sm.' + t] = q;
    }
    /* a oferta repetida: o mesmo material (ou SKU) e embalagem nos dois */
    const conflitos = pcp.prepare(`SELECT a.componente_id, a.sku, a.embalagem, c.nome FROM oferta a
        JOIN oferta b ON b.fornecedor_id=? AND COALESCE(b.componente_id,-1)=COALESCE(a.componente_id,-1) AND COALESCE(b.sku,'')=COALESCE(a.sku,'') AND COALESCE(b.embalagem,'')=COALESCE(a.embalagem,'')
        LEFT JOIN componente c ON c.id=a.componente_id WHERE a.fornecedor_id=?`).all(fica.id, sai.id)
      .map(x => (x.nome || x.sku) + ' · ' + (x.embalagem || ''));
    const completar = COMPLETAR.filter(c => colunas(pcp, 'fornecedor').indexOf(c) >= 0 && (fica[c] == null || fica[c] === '') && sai[c] != null && sai[c] !== '');
    return { sai:sai.id, sai_nome:sai.nome, fica:fica.id, fica_nome:fica.nome, nome_final:j.nome || fica.nome, mover, conflitos, completar,
      ja:!Object.keys(mover).length && sai.ativo === 0 };
  });
  const canal = (opc.canal || []).map(c => {
    if(CANAIS.indexOf(c.canal) < 0) throw new Error('canal fora da lista: "' + c.canal + '" (vale: ' + CANAIS.join(', ') + ')');
    const f = forn(c.fornecedor);
    if(!f) throw new Error('fornecedor #' + c.fornecedor + ' não existe no PCP');
    const pedidos = pcp.prepare("SELECT COUNT(*) n FROM pedido_compra WHERE fornecedor_id=? AND COALESCE(canal,'')=''").get(f.id).n;
    const ofertas = pcp.prepare('SELECT o.embalagem, COALESCE(c.nome, o.sku) item FROM oferta o LEFT JOIN componente c ON c.id=o.componente_id WHERE o.fornecedor_id=? AND COALESCE(o.ativo,1)=1').all(f.id)
      .map(o => o.item + ' · ' + (o.embalagem || ''));
    return { fornecedor:f.id, nome:f.nome, canal:c.canal, pedidos, ofertas, ja:pedidos === 0 && f.ativo === 0 };
  });
  return { juntar, canal };
}

function aplicar(pcp, sm, opc, quem){
  const plano = planejar(pcp, sm, opc);
  const conflito = plano.juntar.find(j => j.conflitos.length);
  if(conflito) throw new Error('o #' + conflito.sai + ' e o #' + conflito.fica + ' têm a mesma oferta (' + conflito.conflitos.join('; ') + '): desative uma delas na 501 antes de juntar. Nada foi gravado.');
  const aud = (acao, alvo, det) => { try{ pcp.prepare("INSERT INTO auditoria (usuario_nome, categoria, acao, alvo, detalhe, criado_em, data) VALUES (?, 'compras', ?, ?, ?, datetime('now','localtime'), date('now','localtime'))").run((quem && quem.nome) || 'script', acao, alvo, det); }catch(e){} };
  pcp.transaction(() => {
    for(const j of plano.juntar){
      if(j.ja) continue;
      const sai = pcp.prepare('SELECT * FROM fornecedor WHERE id=?').get(j.sai);
      for(const c of j.completar) pcp.prepare('UPDATE fornecedor SET ' + c + '=? WHERE id=?').run(sai[c], j.fica);
      pcp.prepare('UPDATE fornecedor SET nome=?, ativo=1 WHERE id=?').run(j.nome_final, j.fica);
      for(const t of tabelasCom(pcp, 'fornecedor_id', 'fornecedor')) pcp.prepare('UPDATE ' + t + ' SET fornecedor_id=? WHERE fornecedor_id=?').run(j.fica, j.sai);
      pcp.prepare("UPDATE fornecedor SET ativo=0, observacao=TRIM(COALESCE(observacao,'') || ' juntado ao #' || ? || ' em ' || date('now','localtime')) WHERE id=?").run(j.fica, j.sai);
      aud('fornecedor_juntado', '#' + j.sai + ' → #' + j.fica, JSON.stringify({ sai:j.sai_nome, fica:j.fica_nome, nome:j.nome_final, mover:j.mover, completar:j.completar }));
    }
    for(const c of plano.canal){
      if(c.ja) continue;
      pcp.prepare("UPDATE pedido_compra SET canal=?, loja=COALESCE(NULLIF(loja,''), ?) WHERE fornecedor_id=? AND COALESCE(canal,'')=''").run(c.canal, c.nome, c.fornecedor);
      pcp.prepare("UPDATE fornecedor SET ativo=0, observacao=TRIM(COALESCE(observacao,'') || ' é canal (' || ? || '), não fornecedor — ' || date('now','localtime')) WHERE id=? AND ativo<>0").run(c.canal, c.fornecedor);
      aud('fornecedor_vira_canal', '#' + c.fornecedor, JSON.stringify({ nome:c.nome, canal:c.canal, pedidos:c.pedidos, ofertas:c.ofertas }));
    }
  })();
  if(sm) sm.transaction(() => {
    for(const j of plano.juntar){
      if(j.ja) continue;
      for(const t of tabelasCom(sm, 'fornecedor_pcp_id')) sm.prepare('UPDATE ' + t + ' SET fornecedor_pcp_id=? WHERE fornecedor_pcp_id=?').run(j.fica, j.sai);
    }
  })();
  return plano;
}

function mostrar(plano){
  for(const j of plano.juntar){
    console.log('JUNTAR #' + j.sai + ' "' + j.sai_nome + '" → #' + j.fica + ' "' + j.fica_nome + '" (fica com o nome "' + j.nome_final + '")' + (j.ja ? ' — já feito' : ''));
    for(const k of Object.keys(j.mover)) console.log('  · ' + k + ': ' + j.mover[k] + ' linha(s) passam para o #' + j.fica);
    if(j.completar.length) console.log('  · o #' + j.fica + ' é completado com: ' + j.completar.join(', '));
    for(const c of j.conflitos) console.log('  ✗ oferta repetida nos dois: ' + c);
  }
  for(const c of plano.canal){
    console.log('CANAL #' + c.fornecedor + ' "' + c.nome + '" → ' + c.canal + (c.ja ? ' — já feito' : ''));
    console.log('  · ' + c.pedidos + ' pedido(s) antigo(s) sem canal ganham o canal; o cadastro é desativado');
    for(const o of c.ofertas) console.log('  · a oferta deixa de valer: ' + o);
  }
}

async function principal(){
  const Database = require('better-sqlite3');
  const fs = require('fs'), os = require('os');
  const caminhos = require('./caminhos');
  const BANCO_SM = require('./tecido/nucleo/caminho').BANCO;
  const aplicarAgora = process.argv.indexOf('--aplicar') >= 0;
  const temSm = fs.existsSync(BANCO_SM);
  const ro = aplicarAgora ? {} : { readonly:true };
  const pcp = new Database(caminhos.BANCO, ro), sm = temSm ? new Database(BANCO_SM, ro) : null;
  const plano = planejar(pcp, sm, PADRAO);
  console.log(aplicarAgora ? 'APLICANDO:' : 'SIMULAÇÃO (nada gravado — rode com --aplicar):');
  mostrar(plano);
  if(plano.juntar.some(j => j.conflitos.length)){ console.log('NÃO APLIQUE: há oferta repetida (acima).'); process.exitCode = 1; pcp.close(); if(sm) sm.close(); return; }
  if(aplicarAgora){
    fs.mkdirSync(caminhos.BACKUPS, { recursive:true });
    const carimbo = new Date().toISOString().replace(/[:.]/g, '-');
    await pcp.backup(path.join(caminhos.BACKUPS, 'dados-antes-fornecedores-' + carimbo + '.db'));
    if(sm) await sm.backup(path.join(caminhos.BACKUPS, 'tecido-antes-fornecedores-' + carimbo + '.db'));
    console.log('backup dos dois bancos em ' + caminhos.BACKUPS + ' (…-antes-fornecedores-' + carimbo + '.db)');
    aplicar(pcp, sm, PADRAO, { nome:'arrumar_fornecedores_cmp.js' });
    console.log('feito. Rode de novo para conferir: tem que dizer "já feito" nos três.');
  }
  pcp.close(); if(sm) sm.close();
}

if(require.main === module) principal().catch(e => { console.error(e.message || e); process.exit(1); });
module.exports = { planejar, aplicar, PADRAO };

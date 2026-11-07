#!/usr/bin/env node
/* diagnosticar_tarja_estoque.js — POR QUE A TARJA "SEM ESTOQUE" NÃO APARECE
 * NA ETIQUETA DE VENDA.
 *
 *   node diagnosticar_tarja_estoque.js                 # banco de produção (caminhos.js)
 *   node diagnosticar_tarja_estoque.js --sku BK140140BEGE
 *   node diagnosticar_tarja_estoque.js --todos         # lista também os SKUs sem problema
 *   node diagnosticar_tarja_estoque.js --json
 *   node diagnosticar_tarja_estoque.js /caminho/outro.db
 *
 * ⚠️ ELE SÓ LÊ. Copia o banco com `db.backup()` para uma pasta temporária (nunca
 * `cp`, por causa do WAL — §12) e trabalha na cópia. Não muda estágio, saldo
 * nem linha nenhuma: pode rodar no meio do expediente.
 *
 * ── O QUE ELE RESPONDE ──────────────────────────────────────────────────────
 * Para cada SKU que está na fila "Faltam imprimir" de HOJE (a mesma régua da
 * tela, `fila_dia.filaDoDia`), ele mostra lado a lado:
 *   - o que a TELA mostra: em quais lugares a tarja vermelha aparece
 *     (linha da Agência, linha da Coleta, peça dentro da caixa de várias);
 *   - o que a TRAVA da impressão vai fazer: quantas peças a fila pede, quantas
 *     estão livres, e quantas vendas vão ser recusadas no bipe.
 *
 * DESDE O CONSERTO DE 06/11/2026 (dívida 21) a tela usa a conta da FILA
 * INTEIRA do SKU, e este diagnóstico usa a MESMA (tarja_estoque.js, dono único):
 *   tela (linha por SKU e peça da caixa): falta = o que a fila de hoje pede − livre > 0
 *   trava da impressão (etq_route.js, /api/embalar): livre < o que ESTA caixa pede
 *   livre = skus.estoque − peças em caixa impressa e não conferida (baixa_dominio.reservados)
 * Até ali a linha só acusava livre ≤ 0 e a peça comparava o livre só com a
 * quantidade dela — era isso que deixava o SKU com alguma peça sem tarja. Hoje
 * os grupos de "tarja faltando" têm que sair vazios; se não saírem, é defeito.
 *
 * ⚠️ O QUE ELE NÃO SABE: a prateleira. Se o sistema diz "2 livres" e a
 * prateleira está vazia, a tela está fazendo a conta certa com um saldo
 * errado — o SKU aparece no grupo "O SISTEMA ACHA QUE TEM", e o caminho é
 * contar a peça (Inventário), não mexer na tela.
 */
'use strict';
const fs = require('fs'), os = require('os'), path = require('path');
const { filaDoDia } = require('./fila_dia');
const { COLETA, VARIAS } = require('./carga');
const BAIXA = require('./baixa_dominio');
const TARJA = require('./tarja_estoque');

const up = s => String(s || '').toUpperCase();

/* A CONTA. Fica numa função, e não dentro do console.log, porque é ela que o
   teste confere (teste_diagnosticar_tarja_estoque.js). */
function diagnosticar(db){
  const resv = BAIXA.reservados(db);
  const ped = TARJA.pedidoHoje(db);
  /* a tarja da tela: a conta do tarja_estoque (sob medida nunca) */
  const tarjaTela = (c, livre, sob) => !sob && livre != null && ((ped.get(up(c))||0) - Math.max(0, livre)) > 0;

  /* 1. AS LINHAS POR SKU DA TELA — o mesmo SELECT do `linhasDeSku` do
     exp_route.js (o JOIN em maiúscula, como lá desde 06/11/2026). */
  const linhas = db.prepare(`SELECT l.codigo, COUNT(*) qtd,
      CASE WHEN ${COLETA('l')} THEN 'coleta' ELSE 'agencia' END modalidade,
      s.estoque, s.codigo cad
    FROM lote l LEFT JOIN skus s ON s.codigo=UPPER(l.codigo)
    WHERE ${filaDoDia('l')} AND NOT COALESCE(${VARIAS('l')},0)
    GROUP BY l.codigo, CASE WHEN ${COLETA('l')} THEN 'coleta' ELSE 'agencia' END`).all();

  /* 2. AS CAIXAS DE VÁRIAS PERSIANAS — o mesmo do `caixasDeVarias`. */
  const caixas = db.prepare(`SELECT l.id, l.nf, l.buyer,
      CASE WHEN ${COLETA('l')} THEN 'coleta' ELSE 'agencia' END modalidade
    FROM lote l WHERE ${filaDoDia('l')} AND ${VARIAS('l')}`).all();
  const itensDe = db.prepare(`SELECT i.codigo, i.qtd, s.estoque, s.codigo cad
    FROM lote_item i LEFT JOIN skus s ON s.codigo=UPPER(i.codigo) WHERE i.lote_id=? ORDER BY i.id`);

  const dadosSku = db.prepare(`SELECT s.estoque, COALESCE(m.sob_medida,0) sob_medida
    FROM skus s LEFT JOIN modelo m ON m.id=s.modelo_id WHERE s.codigo=?`);

  const por = {};
  const sku = c => {
    if(!por[c]){
      const d = dadosSku.get(c);
      por[c] = { codigo:c, cadastrado:!!d, saldo:d?(+d.estoque||0):null,
        reservado:resv[c]||0, sob_medida:!!(d&&d.sob_medida),
        agencia:0, coleta:0, varias:0, caixas:[], lugares:[] };
      por[c].livre = d ? por[c].saldo - por[c].reservado : null;
    }
    return por[c];
  };

  for(const l of linhas){
    const s = sku(up(l.codigo));
    s[l.modalidade] += l.qtd;
    /* a conta da tela, como está no embalagem.html */
    const livreTela = l.estoque==null ? null : l.estoque - (resv[up(l.codigo)]||0);
    s.lugares.push({ onde: l.modalidade==='coleta' ? 'linha da Coleta' : 'linha da Agência',
      pede:l.qtd, livre_na_tela:livreTela, sem_ligacao:l.estoque==null,
      tarja: tarjaTela(l.codigo, livreTela, s.sob_medida) });
  }
  for(const c of caixas){
    for(const it of itensDe.all(c.id)){
      const s = sku(up(it.codigo)), q = Math.max(1, it.qtd||1);
      s.varias += q;
      s.caixas.push('NF '+(c.nf||'?')+' ('+(c.buyer||'sem comprador')+')');
      const livreTela = it.estoque==null ? null : it.estoque - (resv[up(it.codigo)]||0);
      s.lugares.push({ onde:'caixa de várias, NF '+(c.nf||'?'), pede:q, livre_na_tela:livreTela,
        sem_ligacao:it.estoque==null, tarja: tarjaTela(it.codigo, livreTela, s.sob_medida) });
    }
  }

  /* 3. A CLASSIFICAÇÃO. */
  const out = Object.values(por).map(s => {
    s.pede = s.agencia + s.coleta + s.varias;
    s.tarjas = s.lugares.filter(x=>x.tarja).length;
    s.causas = [];
    if(s.sob_medida){
      s.grupo = s.tarjas ? 'TARJA_FALSA_SOB_MEDIDA' : 'OK';
      if(s.tarjas) s.causas.push('é sob medida: não usa estoque e a impressão deixa passar, mas a tela não sabe disso e mostra "sem estoque"');
      s.recusadas = 0;
      return s;
    }
    if(!s.cadastrado || s.lugares.some(x=>x.sem_ligacao)){
      s.grupo = 'SEM_LIGACAO_COM_CADASTRO';
      s.causas.push('a linha da tela não achou o SKU no cadastro (código escrito diferente: maiúscula, espaço), então ela não tem número para comparar e nunca mostra tarja');
      s.recusadas = s.pede;
      return s;
    }
    s.recusadas = Math.max(0, s.pede - Math.max(0, s.livre));
    if(s.recusadas === 0){ s.grupo = 'SISTEMA_ACHA_QUE_TEM'; return s; }
    if(s.tarjas === s.lugares.length) s.grupo = 'OK';
    else s.grupo = s.tarjas ? 'TARJA_EM_PARTE' : 'TARJA_FALTANDO';
    if(s.grupo !== 'OK'){
      const lugaresComPeca = s.lugares.filter(x=>!x.tarja);
      if(lugaresComPeca.some(x=>x.pede > s.livre))
        s.causas.push('uma linha pede mais do que há livre (a tela só acusa quando o livre é zero, não quando é menor que a quantidade da linha)');
      if(s.agencia && s.coleta)
        s.causas.push('o SKU está na Agência E na Coleta: cada lista compara o livre inteiro só com a sua parte, e as duas juntas pedem mais');
      if(s.varias && (s.agencia || s.coleta))
        s.causas.push('o SKU também está dentro de caixa de várias persianas: a caixa e a linha disputam as mesmas peças, e nenhuma desconta a outra');
      if(s.lugares.filter(x=>x.onde.startsWith('caixa')).length > 1)
        s.causas.push('o SKU está em mais de uma caixa de várias: cada caixa compara o livre inteiro só com a sua peça');
      if(!s.causas.length) s.causas.push('a soma de todos os lugares passa do livre, e nenhum lugar sozinho passa');
    }
    return s;
  });
  const ordem = { TARJA_FALTANDO:0, TARJA_EM_PARTE:1, SEM_LIGACAO_COM_CADASTRO:2,
    TARJA_FALSA_SOB_MEDIDA:3, SISTEMA_ACHA_QUE_TEM:4, OK:5 };
  out.sort((a,b)=>(ordem[a.grupo]-ordem[b.grupo]) || (b.recusadas-a.recusadas) || a.codigo.localeCompare(b.codigo));
  return out;
}

const TITULO = {
  TARJA_FALTANDO:           'FALTA PEÇA E A TELA NÃO MOSTRA TARJA NENHUMA',
  TARJA_EM_PARTE:           'FALTA PEÇA E A TARJA APARECE SÓ EM PARTE DOS LUGARES',
  SEM_LIGACAO_COM_CADASTRO: 'A LINHA NÃO SE LIGA AO CADASTRO (a tela fica sem número)',
  TARJA_FALSA_SOB_MEDIDA:   'TARJA QUE NÃO DEVIA APARECER (sob medida)',
  SISTEMA_ACHA_QUE_TEM:     'O SISTEMA ACHA QUE TEM PEÇA PARA TODAS — confira a prateleira',
  OK:                       'TARJA CERTA',
};

function imprimir(lista, todos){
  const n = g => lista.filter(s=>s.grupo===g).length;
  console.log('\nTARJA "SEM ESTOQUE" DA ETIQUETA DE VENDA — fila de hoje');
  console.log('='.repeat(64));
  console.log('SKUs na fila de hoje: '+lista.length);
  for(const g of Object.keys(TITULO)) console.log('  '+String(n(g)).padStart(3)+'  '+TITULO[g]);
  const rec = lista.reduce((t,s)=>t+(s.grupo==='TARJA_FALTANDO'||s.grupo==='TARJA_EM_PARTE'?s.recusadas:0),0);
  console.log('\nPeças que a impressão vai recusar SEM a tela ter avisado (todas ou parte): '+rec);

  for(const g of Object.keys(TITULO)){
    if(!todos && g==='OK') continue;
    const grupo = lista.filter(s=>s.grupo===g);
    if(!grupo.length) continue;
    console.log('\n── '+TITULO[g]+' ('+grupo.length+') '+'─'.repeat(Math.max(0,50-TITULO[g].length)));
    if(g==='SISTEMA_ACHA_QUE_TEM')
      console.log('   A tela está certa aqui: pelo sistema há peça livre para toda a fila.\n'
        +'   Se a prateleira estiver vazia, o SALDO está errado — o caminho é o Inventário.');
    for(const s of grupo){
      console.log('\n  '+s.codigo);
      if(s.cadastrado)
        console.log('    saldo '+s.saldo+' − em caixa impressa '+s.reservado+' = LIVRE '+s.livre
          +(s.sob_medida?'   (sob medida)':''));
      else console.log('    NÃO CADASTRADO');
      console.log('    a fila de hoje pede '+s.pede+' peça(s): agência '+s.agencia+' · coleta '+s.coleta
        +' · em caixa de várias '+s.varias);
      if(s.recusadas) console.log('    no bipe, '+s.recusadas+' peça(s) vão ser recusadas por falta de estoque');
      for(const x of s.lugares)
        console.log('      '+(x.tarja?'[TARJA]   ':'[sem tarja]')+' '+x.onde+' — pede '+x.pede
          +', a tela lê livre '+(x.livre_na_tela==null?'(nenhum)':x.livre_na_tela));
      for(const c of s.causas) console.log('    → porque '+c);
    }
  }
  console.log('');
}

module.exports = { diagnosticar };

if(require.main === module){
  (async () => {
    const Database = require('better-sqlite3');
    const args = process.argv.slice(2);
    const json = args.includes('--json'), todos = args.includes('--todos');
    const iSku = args.indexOf('--sku'), soSku = iSku>=0 ? up(args[iSku+1]) : null;
    const origem = args.find((a,i)=>!a.startsWith('--') && !(iSku>=0 && i===iSku+1)) || require('./caminhos').BANCO;
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'tarja-estoque-'));
    const copia = path.join(dir, 'copia.db');
    const fonte = new Database(origem, { readonly:true, fileMustExist:true });
    await fonte.backup(copia);
    fonte.close();
    const db = new Database(copia, { readonly:true });
    try{
      let lista = diagnosticar(db);
      if(soSku) lista = lista.filter(s=>s.codigo===soSku);
      if(json) console.log(JSON.stringify(lista, null, 2));
      else{
        imprimir(lista, todos || !!soSku);
        if(soSku && !lista.length) console.log('  '+soSku+' não está na fila de hoje.\n');
      }
    } finally {
      db.close();
      fs.rmSync(dir, { recursive:true, force:true });
    }
  })().catch(e => { console.error('erro: '+e.message); process.exit(1); });
}

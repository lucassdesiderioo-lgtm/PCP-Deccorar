#!/usr/bin/env node
/* conferir_contagem_persianas.js — A CONTAGEM DO PAPEL CONTRA O SISTEMA.
 *
 *   node conferir_contagem_persianas.js          # tabela na tela
 *   node conferir_contagem_persianas.js --json   # a mesma conta em JSON
 *
 * ⚠️ ELE SÓ LÊ. Abre o banco em readonly: não muda saldo, não abre pedido de
 * ajuste, não grava linha nenhuma — pode rodar em produção no meio do
 * expediente. Quem corrige o saldo é uma pessoa, pelo Inventário ou pelo
 * pedido de ajuste com outra pessoa aprovando (R-EST-18, R-EST-20).
 *
 * ── DE ONDE VEM A CONTAGEM ──────────────────────────────────────────────────
 * A folha escrita à mão que o dono mandou em 04/11/2026 (CONTAGEM, abaixo). O
 * dono disse: "o que não está na lista está com estoque zerado". Por isso toda
 * PERSIANA ativa que não aparece na folha entra com contado = 0.
 *
 * ── O QUE ELE RESPONDE, SKU A SKU ───────────────────────────────────────────
 *   saldo      skus.estoque                       (o que o livro diz)
 *   em caixa   peça em caixa impressa e ainda não conferida
 *              (baixa_dominio.reservados — dono único da reserva)
 *   livre      saldo − em caixa                   (o que DEVE estar na prateleira)
 *   contado    o da folha, ou 0
 *   diferença  contado − livre
 *   saldo novo contado + em caixa  — o número a digitar no "saldo novo" do
 *              pedido de ajuste, se for por ali
 *
 * ⚠️ A FOLHA CONTA A PRATELEIRA, NÃO O SALDO. A peça que já está em caixa com
 * etiqueta de venda ainda está no saldo até a conferência baixar (§2). Digitar
 * o número da folha como saldo novo tiraria essas peças do estoque em
 * silêncio. Por isso a coluna "saldo novo" soma o que está em caixa.
 *
 * ⚠️ O SKU SE ACHA PELAS COLUNAS, NUNCA PELO TEXTO DO CÓDIGO (§7): largura,
 * altura e cor_codigo. A folha escreve LARGURA × ALTURA. Linha que casa com
 * mais de um SKU (dois tecidos da mesma medida e cor, por exemplo) NÃO é
 * repartida: os SKUs dela ficam como "ambíguo", sem contado, e nenhum deles
 * vira zero — zerar um SKU que talvez seja o da folha seria inventar falta.
 * Linha que não casa com nenhum SKU aparece em "não achei", e não some.
 *
 * ⚠️ FORA DA CONTA: sob medida (não tem saldo, §7), produto sem medida (kit,
 * acessório — não é persiana) e SKU inativo. Os que têm saldo diferente de
 * zero aparecem numa lista à parte, para ninguém achar que foram zerados.
 */
const Database = require('better-sqlite3');
const BAIXA = require('./baixa_dominio');

/* A folha de 04/11/2026, como está escrita (largura × altura). */
const CONTAGEM = [
  { largura:160, altura:160, cor:'CINZA',  qtd:21 },
  { largura:160, altura:160, cor:'BEGE',   qtd:6 },
  { largura:160, altura:140, cor:'CINZA',  qtd:114, obs:'conferir: bem acima dos outros' },
  { largura:150, altura:150, cor:'CINZA',  qtd:32 },
  { largura:160, altura:140, cor:'BEGE',   qtd:46 },
  { largura:160, altura:140, cor:'BRANCO', qtd:7 },
  { largura:150, altura:150, cor:'BRANCO', qtd:17 },
  { largura:130, altura:130, cor:'BEGE',   qtd:6 },
  { largura:130, altura:130, cor:'BRANCO', qtd:8, obs:'conferir: número rabiscado na folha' },
  { largura:140, altura:140, cor:'BRANCO', qtd:61 },
  { largura:120, altura:120, cor:'BRANCO', qtd:28 },
  { largura:160, altura:160, cor:'BRANCO', qtd:35 },
  { largura:100, altura:100, cor:'BEGE',   qtd:27 },
];

function temColuna(db, t, c){
  try{ return db.prepare(`SELECT 1 FROM pragma_table_info('${t}') WHERE name=?`).get(c) != null; }
  catch(e){ return false; }
}
function temTabela(db, t){
  return db.prepare("SELECT 1 FROM sqlite_master WHERE type='table' AND name=?").get(t) != null;
}

/* A conta inteira, sem imprimir nada — é ela que o teste chama. */
function conferir(db, contagem){
  const ativo = temColuna(db, 'skus', 'ativo') ? 'COALESCE(s.ativo,1)' : '1';
  const todos = db.prepare(`SELECT s.codigo, COALESCE(s.estoque,0) saldo, s.largura_cm larg, s.altura_cm alt,
      UPPER(COALESCE(s.cor_codigo,'')) cor, ${ativo} ativo,
      COALESCE(m.sob_medida,0) sob_medida, COALESCE(m.exige_medida,1) exige_medida, m.nome modelo
    FROM skus s LEFT JOIN modelo m ON m.id=s.modelo_id ORDER BY s.codigo`).all();

  const ehPersiana = s => s.ativo && !s.sob_medida && s.exige_medida && s.larg != null && s.alt != null;
  const persianas = todos.filter(ehPersiana);
  const fora = todos.filter(s => !ehPersiana(s) && s.saldo !== 0)
    .map(s => ({ codigo:s.codigo, saldo:s.saldo,
      por: !s.ativo ? 'inativo' : s.sob_medida ? 'sob medida' : !s.exige_medida ? 'sem medida (não é persiana)'
         : 'sem largura/altura no cadastro' }));

  const reserva = BAIXA.reservados(db);
  const pendente = {};
  if(temTabela(db, 'ajuste_pedido'))
    for(const p of db.prepare("SELECT codigo FROM ajuste_pedido WHERE status='pendente'").all())
      pendente[String(p.codigo).toUpperCase()] = true;

  const contado = {}, ambiguo = {}, naoAchei = [], linhas = [];
  for(const l of contagem){
    const cor = String(l.cor).toUpperCase();
    const achou = persianas.filter(s => s.larg === l.largura && s.alt === l.altura && s.cor === cor);
    const texto = `${l.largura}×${l.altura} ${cor} = ${l.qtd}`;
    if(!achou.length){ naoAchei.push({ ...l, texto }); continue; }
    if(achou.length > 1){ achou.forEach(s => { ambiguo[s.codigo] = texto; }); linhas.push({ texto, skus:achou.map(s => s.codigo) }); continue; }
    const c = achou[0].codigo;
    if(contado[c] != null){ ambiguo[c] = texto + ' (a medida aparece duas vezes na folha)'; continue; }
    contado[c] = { qtd:l.qtd, obs:l.obs || '' };
  }
  /* A medida repetida na folha também não decide sozinha. */
  Object.keys(ambiguo).forEach(c => { delete contado[c]; });

  const itens = persianas.map(s => {
    const em_caixa = reserva[String(s.codigo).toUpperCase()] || 0;
    const livre = s.saldo - em_caixa;
    const base = { codigo:s.codigo, medida:`${s.larg}×${s.alt}`, cor:s.cor, saldo:s.saldo, em_caixa, livre,
      ajuste_pendente: !!pendente[String(s.codigo).toUpperCase()] };
    if(ambiguo[s.codigo]) return { ...base, situacao:'ambiguo', contado:null, diferenca:null, saldo_novo:null,
      obs:'a linha "' + ambiguo[s.codigo] + '" casa com mais de um SKU' };
    const ct = contado[s.codigo];
    const qtd = ct ? ct.qtd : 0;
    return { ...base, situacao: ct ? 'na_folha' : 'zerado', contado:qtd, diferenca: qtd - livre,
      saldo_novo: qtd + em_caixa, obs: ct ? ct.obs : 'não está na folha → 0' };
  });

  const comDif = itens.filter(i => i.diferenca);
  return {
    itens, fora, naoAchei, ambiguas:linhas,
    resumo:{
      persianas: itens.length,
      na_folha: itens.filter(i => i.situacao === 'na_folha').length,
      zerados: itens.filter(i => i.situacao === 'zerado').length,
      ambiguos: itens.filter(i => i.situacao === 'ambiguo').length,
      batem: itens.filter(i => i.diferenca === 0).length,
      diferentes: comDif.length,
      pecas_a_mais: comDif.filter(i => i.diferenca > 0).reduce((s, i) => s + i.diferenca, 0),
      pecas_a_menos: comDif.filter(i => i.diferenca < 0).reduce((s, i) => s - i.diferenca, 0),
    },
  };
}

function imprimir(r){
  const pad = (s, n) => String(s == null ? '—' : s).padEnd(n);
  const num = (s, n) => String(s == null ? '—' : s).padStart(n);
  const sinal = d => d == null ? '—' : d > 0 ? '+' + d : String(d);
  const ord = r.itens.slice().sort((a, b) => Math.abs(b.diferenca || 0) - Math.abs(a.diferenca || 0)
    || String(a.codigo).localeCompare(b.codigo));

  console.log('\nCONTAGEM DA FOLHA × SISTEMA — só leitura, nada foi gravado\n');
  console.log(pad('SKU', 22) + pad('medida', 10) + pad('cor', 8) + num('saldo', 6) + num('em caixa', 9)
    + num('livre', 6) + num('contado', 8) + num('dif.', 6) + num('saldo novo', 11) + '  observação');
  console.log('-'.repeat(110));
  for(const i of ord)
    console.log(pad(i.codigo, 22) + pad(i.medida, 10) + pad(i.cor, 8) + num(i.saldo, 6) + num(i.em_caixa, 9)
      + num(i.livre, 6) + num(i.contado, 8) + num(sinal(i.diferenca), 6) + num(i.saldo_novo, 11)
      + '  ' + [i.diferenca === 0 ? 'bate' : '', i.obs, i.ajuste_pendente ? '⚠ já tem ajuste pendente' : '']
        .filter(Boolean).join(' · '));

  const s = r.resumo;
  console.log('\nRESUMO');
  console.log(`  ${s.persianas} persianas ativas · ${s.na_folha} na folha · ${s.zerados} fora da folha (contado 0)`
    + (s.ambiguos ? ` · ${s.ambiguos} ambíguas` : ''));
  console.log(`  ${s.batem} batem · ${s.diferentes} diferentes · ${s.pecas_a_mais} peça(s) a mais na prateleira`
    + ` · ${s.pecas_a_menos} peça(s) a menos`);

  if(r.naoAchei.length){
    console.log('\n⚠ LINHAS DA FOLHA SEM SKU CADASTRADO (medida e cor não casam com nenhuma persiana ativa):');
    r.naoAchei.forEach(l => console.log('   ' + l.texto));
  }
  if(r.ambiguas.length){
    console.log('\n⚠ LINHAS DA FOLHA QUE CASAM COM MAIS DE UM SKU (não reparti, e nenhum foi zerado):');
    r.ambiguas.forEach(l => console.log('   ' + l.texto + ' → ' + l.skus.join(', ')));
  }
  if(r.fora.length){
    console.log('\nFORA DA CONTA, COM SALDO (não são tratados como zerados):');
    r.fora.forEach(f => console.log('   ' + pad(f.codigo, 22) + num(f.saldo, 6) + '  ' + f.por));
  }
  console.log('\nCOMO LER');
  console.log('  livre      = saldo − em caixa: o que deveria estar na prateleira');
  console.log('  dif.       = contado − livre (+ sobrou peça, − faltou peça)');
  console.log('  saldo novo = contado + em caixa: é o número do "saldo novo" no pedido de ajuste.');
  console.log('               Digitar só o contado tiraria do saldo as peças que estão em caixa.');
  console.log('  Corrigir é pelo Inventário ou pelo pedido de ajuste, com outra pessoa aprovando.\n');
}

module.exports = { conferir, CONTAGEM };

if(require.main === module){
  const DB = require('./caminhos').BANCO;
  const db = new Database(DB, { readonly:true, fileMustExist:true });
  const r = conferir(db, CONTAGEM);
  db.close();
  if(process.argv.includes('--json')) console.log(JSON.stringify(r, null, 2));
  else imprimir(r);
}

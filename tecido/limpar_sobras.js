#!/usr/bin/env node
/* Zera o cadastro de sobras e a numeracao das etiquetas, para o recadastro.
 *
 *   node tecido/limpar_sobras.js              simula: mostra e nao grava nada
 *   node tecido/limpar_sobras.js --aplicar    faz backup e apaga
 *
 * Fase 1 da spec docs/specs/SOBRAS-TOM-E-DESPERDICIO.md (R1, R2, R3).
 *
 * POR QUE ISTO E CORRETO, E SO AQUI
 * As sobras foram tiradas dos enderecos para serem medidas antes do cadastro
 * com etiqueta. As medidas gravadas sao duvidosas e nenhuma sobra tem etiqueta
 * colada: o cadastro parou de descrever a prateleira. Entao isto NAO e perda de
 * tecido — e cadastro sem valor, e por isso a limpeza nao gera uma unica linha
 * de refugo (R1). A perda que existe de verdade, a do corte, fica onde esta.
 *
 * A NUMERACAO E O OBJETIVO DO DIA. A equipe recomeca do S-000001, e quem
 * decide o numero seguinte e `ultimoSeq()` = MAX(seq) FROM etiqueta. Enquanto
 * houver uma linha de etiqueta, a proxima impressao NAO volta ao um — por isso
 * `etiqueta` e `etiqueta_lote` tambem saem.
 *
 * ⚠ AS ETIQUETAS ANTIGAS EM PAPEL TEM QUE ESTAR RECOLHIDAS ANTES (R2). Com a
 * numeracao recomecando, uma etiqueta antiga na bancada tem o mesmo numero de
 * uma nova — duas sobras com o mesmo codigo e o pior erro possivel neste
 * controle, porque o codigo e o unico fio entre o papel e a linha do banco.
 *
 * O QUE ELE APAGA (as sete da R1)
 *   sobra · etiqueta · etiqueta_lote · sobra_correcao · sobra_proposta ·
 *   plano_recusa (so as linhas que citam sobra) ·
 *   refugo (so motivo='descarte', que e escrito SO pelo sobra.descartar)
 *
 * O QUE ELE NAO TOCA
 *   rolo, movimento_rolo, tecido, enderecos, planos confirmados e o refugo DE
 *   CORTE ('tira_estreita', 'resto_de_pe', que vem com plano_id). Aquilo e
 *   historia de corte que aconteceu de verdade.
 *
 * AS QUATRO GUARDAS — ele PARA, e nao grava nada
 *   1) sobra com status 'usada';
 *   2) sobra consumida por corte confirmado (plano_faixa.sobra_id);
 *   3) sobra nascida de corte confirmado (plano_faixa.sobra_gerada_codigo);
 *   4) sobra cadastrada DEPOIS do corte por data — o recadastro ja comecou.
 *
 * O dono declarou que nenhuma sobra foi usada. O script confere em vez de
 * confiar: se alguma foi, ela tem corte atras e a decisao e caso a caso.
 *
 * As tres primeiras sao a mesma pergunta por tres portas, e `plano_faixa` so
 * recebe linha dentro do `confirmar()` do dominio/plano.js — o `calcular()` nao
 * persiste nada. Logo plano na tela, calculado e nao confirmado, NAO prende
 * nada aqui: foi por isso que o teste do problema 1 da spec (as 11 sobras) nao
 * deixou rastro.
 *
 * A QUARTA GUARDA E O QUE FAZ ISTO SER INOFENSIVO DEPOIS DE HOJE. O corte e
 * 18/09/2026, escrito na constante CORTE porque a R1 nomeia essa data. Rodado
 * em outubro, o script encontra o cadastro novo e recusa, em vez de apagar o
 * trabalho da equipe. E ele PARA em vez de limpar so os antigos: faltando
 * apagar `etiqueta`, a numeracao nao voltaria ao S-000001 e a limpeza teria
 * feito metade do servico sem dizer.
 */
const fs=require('fs');
const path=require('path');
const db=require('./nucleo/db');
const {exigir}=require('./nucleo/erros');
const etiqueta=require('./dominio/etiqueta');

/* A data da R1. Mexer aqui reabre o script para apagar cadastro novo — ha caso
   travando o valor (teste/limpar_sobras.test.js). */
const CORTE='2026-09-18 23:59:59';

/* As sete tabelas, com o filtro de cada uma. A ordem e a do DELETE: filho
   antes de pai, porque o modulo roda com foreign_keys=ON e uma referencia de
   pe faz o DELETE falhar (o que e bom: melhor falhar que deixar orfao). */
const ALVOS=[
  ['etiqueta',        null],
  ['etiqueta_lote',   null],
  ['sobra_correcao',  null],
  ['sobra_proposta',  null],
  ['plano_recusa',    'sobra_id IS NOT NULL'],
  ['refugo',          "motivo='descarte'"]
];

const contaDe=(tabela,onde)=>
  db.prepare('SELECT COUNT(*) c FROM '+tabela+(onde?' WHERE '+onde:'')).get().c;

/* As tres portas da R3, cada sobra com os motivos que a prendem. Uma sobra
   pode cair em mais de um, e a lista mostra todos: quem vai decidir caso a
   caso precisa da historia inteira, nao do primeiro motivo que apareceu. */
function impedimentos(){
  const mapa=new Map();
  const juntar=(id,codigo,motivo)=>{
    if(!mapa.has(id)) mapa.set(id,{id,codigo,motivos:[]});
    mapa.get(id).motivos.push(motivo);
  };

  db.prepare(`SELECT id,codigo FROM sobra WHERE status='usada' ORDER BY id`).all()
    .forEach(s=>juntar(s.id,s.codigo,'esta como usada'));

  db.prepare(`SELECT s.id, s.codigo, f.plano_id
    FROM sobra s JOIN plano_faixa f ON f.sobra_id=s.id
    ORDER BY s.id, f.plano_id`).all()
    .forEach(s=>juntar(s.id,s.codigo,'foi consumida no plano '+s.plano_id));

  db.prepare(`SELECT s.id, s.codigo, f.plano_id
    FROM sobra s JOIN plano_faixa f ON f.sobra_gerada_codigo=s.codigo
    ORDER BY s.id, f.plano_id`).all()
    .forEach(s=>juntar(s.id,s.codigo,'nasceu do plano '+s.plano_id));

  return [...mapa.values()];
}

/* So LE. E o que a simulacao imprime e o que o aplicar confere antes de tocar
   em qualquer linha. */
function levantar(opcoes){
  const corte=(opcoes&&opcoes.corte)||CORTE;

  const alvo=db.prepare(`SELECT id,codigo,status,criado_em,criado_por
    FROM sobra WHERE criado_em<=? ORDER BY id`).all(corte);
  const fora=db.prepare(`SELECT id,codigo,criado_em,criado_por
    FROM sobra WHERE criado_em>? ORDER BY id`).all(corte);

  const contagens={sobra:alvo.length};
  ALVOS.forEach(([t,onde])=>{ contagens[t==='refugo'?'refugo_descarte':t]=contaDe(t,onde); });

  /* A IDADE DAS LINHAS, como no limpar_fila.js: cadastro de hoje e trabalho,
     cadastro de meses e passivo, e quem aprova a limpeza tem que ver a
     diferenca antes de dizer sim. */
  const idade=db.prepare(`SELECT MIN(criado_em) mais_antiga, MAX(criado_em) mais_nova
    FROM sobra WHERE criado_em<=?`).get(corte);

  const seq=db.prepare('SELECT MAX(seq) m FROM etiqueta').get().m||0;

  return {
    corte, alvo, fora, impedidas:impedimentos(), contagens, idade,
    seq_atual:seq,
    // O formato do codigo tem um dono (dominio/etiqueta.js) — escrever
    // 'S-000001' aqui seria a segunda regua do mesmo numero.
    proxima_hoje:etiqueta.formatar(seq+1),
    proxima_depois:etiqueta.formatar(1)
  };
}

/* Backup pelo db.backup(), que e ASSINCRONO — sem o await ele estoura depois
   do fim do processo, com o relatorio de sucesso ja impresso e nenhum arquivo
   no disco (§15 do CLAUDE.md). `cp tecido.db` copia 4 KB e deixa os dados no
   -wal. O destino sai do caminho que o proprio modulo abriu (nucleo/db), e
   nao de um caminho escrito aqui. */
async function fazerBackup(){
  const dest=path.join(path.dirname(db.arquivo),'backups');
  fs.mkdirSync(dest,{recursive:true});
  const quando=new Date().toISOString().replace(/[:.]/g,'-');
  const arq=path.join(dest,'antes-limpeza-sobras-'+quando+'.db');
  await db.backup(arq);
  return arq;
}

/* Grava. As guardas sao conferidas AQUI, e nao so na tela: quem chama isto de
   um teste, de um require ou de outro script tem que levar a mesma recusa. */
function aplicar(opcoes){
  const l=levantar(opcoes);

  const presas=l.impedidas;
  exigir(!presas.length,'sobra_em_corte_confirmado',
    'Ha '+presas.length+' sobra(s) com corte confirmado atras: '+
    presas.map(s=>s.codigo+' ('+s.motivos.join('; ')+')').join(', ')+
    '. Nada foi apagado — estas sobras tem historia de corte, e a decisao e caso a caso.');

  exigir(!l.fora.length,'recadastro_ja_comecou',
    'Ha '+l.fora.length+' sobra(s) cadastrada(s) depois de '+l.corte+
    ' ('+l.fora.slice(0,5).map(s=>s.codigo||'sem codigo').join(', ')+
    (l.fora.length>5?', ...':'')+'). Isto parece o recadastro ja em andamento, '+
    'e apagar so as antigas deixaria a numeracao sem voltar ao S-000001. Nada foi apagado.');

  const apagados={};
  db.transaction(()=>{
    ALVOS.forEach(([t,onde])=>{
      const r=db.prepare('DELETE FROM '+t+(onde?' WHERE '+onde:'')).run();
      apagados[t==='refugo'?'refugo_descarte':t]=r.changes;
    });

    /* ⚠ A AUTO-REFERENCIA DA CADEIA DE SOBRAS, E A ARMADILHA DO SQLITE NO
       MEIO. A sobra que nasceu de outra aponta para a mae
       (origem_sobra_id). Com foreign_keys=ON:

         DELETE FROM sobra              -> PASSA. O FK imediato e conferido no
                                          FIM da instrucao, e ali nao sobrou
                                          ninguem apontando.
         DELETE FROM sobra WHERE id=1   -> RECUSADO, se a filha ficou.

       O delete abaixo e FILTRADO (WHERE criado_em<=?), e hoje o filtro pega
       todas — entao ele cairia no primeiro caso e passaria sem isto. Mas
       "passa porque o filtro casualmente pega todas" e uma garantia que a
       guarda do corte sustenta, nao o SQL. Soltar o ponteiro antes torna o
       delete correto por conta propria.

       E o WHERE aqui e ESTREITO de proposito: solta so o que aponta para
       sobra que VAI SAIR. Um `WHERE origem_sobra_id IS NOT NULL` limparia
       tambem a cadeia de uma sobra que ficasse — e essa cadeia e o dado de
       ORIGEM DE TOM que a Fase 3 vai ler (R5). Apagar de quem fica seria
       perder o tom para sempre, sem aviso. */
    db.prepare(`UPDATE sobra SET origem_sobra_id=NULL
      WHERE origem_sobra_id IN (SELECT id FROM sobra WHERE criado_em<=?)`).run(l.corte);

    apagados.sobra=db.prepare('DELETE FROM sobra WHERE criado_em<=?').run(l.corte).changes;
  })();

  return {apagados, corte:l.corte, proxima:etiqueta.formatar(1)};
}

function relatar(l){
  console.log('');
  console.log('LIMPEZA DAS SOBRAS — corte em '+l.corte);
  console.log('banco: '+db.arquivo);
  console.log('');

  if(l.impedidas.length){
    console.log('⚠ PARA AQUI — '+l.impedidas.length+' sobra(s) com corte confirmado atras:');
    l.impedidas.forEach(s=>console.log('   '+s.codigo+' — '+s.motivos.join('; ')));
    console.log('');
    console.log('   Estas tem historia de corte. A decisao e do dono, caso a caso.');
    return;
  }
  if(l.fora.length){
    console.log('⚠ PARA AQUI — '+l.fora.length+' sobra(s) cadastrada(s) DEPOIS do corte:');
    l.fora.slice(0,10).forEach(s=>console.log('   '+(s.codigo||'sem codigo')+'  '+s.criado_em+
      (s.criado_por?'  '+s.criado_por:'')));
    if(l.fora.length>10) console.log('   ... e mais '+(l.fora.length-10));
    console.log('');
    console.log('   Isto parece o recadastro ja em andamento — nada sera apagado.');
    return;
  }

  console.log('vai sair:');
  const rotulos={sobra:'sobra', etiqueta:'etiqueta', etiqueta_lote:'etiqueta_lote',
    sobra_correcao:'sobra_correcao', sobra_proposta:'sobra_proposta',
    plano_recusa:'plano_recusa (so as de sobra)', refugo_descarte:'refugo (so descarte de sobra)'};
  Object.keys(rotulos).forEach(k=>{
    const n=l.contagens[k]||0;
    console.log('   '+String(n).padStart(6)+'  '+rotulos[k]);
  });

  console.log('');
  if(l.alvo.length) console.log('idade do cadastro: de '+l.idade.mais_antiga+' a '+l.idade.mais_nova);
  console.log('etiqueta: hoje a proxima seria '+l.proxima_hoje+
              ' — depois da limpeza, '+l.proxima_depois);
  console.log('');
  console.log('fica de pe: rolo, movimento_rolo, tecido, enderecos, planos');
  console.log('            confirmados e o refugo DE CORTE.');
}

module.exports={levantar, aplicar, fazerBackup, impedimentos, CORTE};

if(require.main===module){
  (async function(){
    const vaiAplicar=process.argv.includes('--aplicar');
    const l=levantar();
    relatar(l);

    if(l.impedidas.length||l.fora.length){ db.close(); process.exit(1); }

    if(!vaiAplicar){
      console.log('');
      console.log('SIMULACAO — nada foi gravado.');
      console.log('Para valer:  node tecido/limpar_sobras.js --aplicar');
      console.log('⚠ Antes: as etiquetas antigas em papel tem que estar recolhidas (R2).');
      db.close(); return;
    }

    if(!l.alvo.length&&!l.contagens.etiqueta){
      console.log('');
      console.log('Nada a apagar.');
      db.close(); return;
    }

    const arq=await fazerBackup();
    console.log('');
    console.log('backup -> '+arq);

    const r=aplicar();
    console.log('');
    console.log('APAGADO:');
    Object.keys(r.apagados).forEach(k=>
      console.log('   '+String(r.apagados[k]).padStart(6)+'  '+k));
    console.log('');
    console.log('A proxima etiqueta impressa sai '+r.proxima+'.');
    console.log('Confira na tela: Sobras vazia, e Etiquetas imprimindo do um.');
    db.close();
  })().catch(e=>{ console.error(''); console.error('erro: '+(e.mensagem||e.message)); process.exit(1); });
}

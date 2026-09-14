#!/usr/bin/env node
/* O ANUNCIO E O CADASTRO DIZEM A MESMA MEDIDA? — sobre o que JA ESTA GRAVADO.
 *
 *   node conferir_medidas.js              confere os volumes dos ultimos 30 dias
 *   node conferir_medidas.js 90           outra janela
 *   node conferir_medidas.js --tudo       o historico inteiro
 *   node conferir_medidas.js --porque     rele os PDFs e diz por que faltou titulo
 *   node conferir_medidas.js --db <arq>   outro banco (ver abaixo)
 *
 * So LE. Pode rodar em producao a qualquer hora, com o servico no ar.
 *
 * PARA RODAR ANTES DE SUBIR O CODIGO NOVO (que e o ponto dele), sem trocar o
 * checkout que o pm2 esta servindo:
 *
 *   cd /opt/expedicao
 *   git fetch origin <branch>
 *   git worktree add .diag origin/<branch>
 *   node .diag/conferir_medidas.js --db /opt/expedicao/dados.db 30
 *   git worktree remove .diag
 *
 * O `node_modules` e resolvido subindo um nivel, entao o worktree nao precisa
 * de `npm install`.
 *
 * Por que ele existe, em duas partes:
 *
 * 1. RESPONDE O QUE JA PASSOU. Ate 14/09/2026 a medida do anuncio so era lida
 *    no formato "1,60x1,40"; o titulo escrito em centimetros ("170x170") dava
 *    NULL, e a conferencia 3 do §5 — que so acusa quando os dois lados existem
 *    — nao rodava. Volume com anuncio 170x170 e SKU BK160160BEGE atravessou a
 *    expedicao sem um aviso. A trava nao foi contornada: ela nunca chegou a
 *    rodar. Este script relê a descricao GRAVADA em `lote` e diz quais outros
 *    volumes estao nessa situacao — inclusive os ja despachados, que e o unico
 *    lugar onde ainda da pra ligar para o cliente antes da reclamacao.
 *
 * 2. MEDE A TRAVA NOVA ANTES DE LIGA-LA. A conferencia 6 (exp_route.js) passa a
 *    conferir o anuncio contra as COLUNAS de `skus`. Se o cadastro de algum SKU
 *    estiver torto, ela retem em massa volumes corretos — que e a armadilha #10
 *    do CLAUDE.md: trava que acusa inocente para de proteger o culpado. Entao
 *    rode isto ANTES de reiniciar o servico: dois ou tres achados sao casos
 *    reais; dezenas sao cadastro para arrumar primeiro.
 *
 * Ele NAO usa regua propria: a leitura da medida e a comparacao saem do
 * folha.js, o mesmo dono que o upload usa para acusar.
 */
const fs=require('fs'), path=require('path');
const Database=require('better-sqlite3');
const {medidaDaDescricao,medidaDoCodigo,conflitoDeMedida}=require('./folha');

const args=process.argv.slice(2);
const TUDO=args.includes('--tudo');
const DIAS=(()=>{ const n=args.find(a=>/^\d+$/.test(a)); return n?+n:30; })();

/* O MESMO CAMINHO DO db.js, e um --db para quando o script nao roda de dentro
   do checkout de producao. E o caso normal, nao a excecao: para MEDIR a
   conferencia 6 antes de liga-la, o jeito de rodar o codigo novo sem trocar o
   checkout que o pm2 esta servindo e um `git worktree` ao lado — e ali o
   __dirname nao e o do banco. Sem isto, a unica forma de rodar o diagnostico
   seria ja ter subido o que ele deveria conferir antes. */
const iDb=args.indexOf('--db');
const CAMINHO=(iDb>=0 && args[iDb+1]) ? args[iDb+1]
  : (fs.existsSync('/opt/expedicao/dados.db') ? '/opt/expedicao/dados.db'
                                              : path.join(__dirname,'dados.db'));
if(!fs.existsSync(CAMINHO)){
  console.error('nao achei o banco em '+CAMINHO+' — passe o caminho com --db <arquivo>');
  process.exit(2);
}
/* Readonly primeiro: um diagnostico nao escreve. O banco esta em WAL (§12) e o
   servico o mantem aberto; se o modo somente-leitura nao conseguir mapear o
   -shm, cai para a abertura normal — este script so faz SELECT, e SQLite
   aguenta varios leitores. */
let db;
try{ db=new Database(CAMINHO,{readonly:true,fileMustExist:true}); }
catch(e){
  console.error('(somente-leitura recusado: '+(e.message||e)+' — abrindo normal, o script so le)');
  db=new Database(CAMINHO,{fileMustExist:true});
}

const onde=TUDO?'':"WHERE l.data >= date('now','localtime','-"+DIAS+" day')";
const vols=db.prepare(`SELECT l.id, l.codigo, l.descricao, l.buyer, l.nf, l.data,
    l.estagio, l.packId, l.venda, l.bloqueio, l.srcfile,
    s.largura_cm larg, s.altura_cm alt, COALESCE(m.exige_medida,1) exige_medida
  FROM lote l
  LEFT JOIN skus s ON s.codigo=l.codigo
  LEFT JOIN modelo m ON m.id=s.modelo_id
  ${onde}
  ORDER BY l.id`).all();

let comDescricao=0, comMedida=0, conferiveis=0;
const divergentes=[], semMedidaNoAnuncio=[], semCadastro=[], semDescricao=[];

for(const v of vols){
  /* Volume sem descricao gravada nao e so "dado velho": a `descricao` nasce da
     leitura do titulo no bloco da folha, e ela tem um limite proprio (pega a
     linha que traz "Persiana"). Volume RECENTE sem descricao e outro buraco,
     na leitura do titulo — e a data mais nova da lista e que diz qual dos dois
     e. Por isso eles nao somem da conta: aparecem no fim do relatorio. */
  if(!v.descricao){ semDescricao.push(v); continue; }
  comDescricao++;
  const anuncio=medidaDaDescricao(v.descricao);
  if(!anuncio){ semMedidaNoAnuncio.push(v); continue; }
  comMedida++;
  if(v.larg==null||v.alt==null){ if(v.exige_medida) semCadastro.push(v); continue; }
  if(!v.exige_medida) continue;
  conferiveis++;
  const conf=conflitoDeMedida(anuncio,{larg:v.larg,alt:v.alt,exige_medida:v.exige_medida},v.codigo);
  if(conf) divergentes.push({...v,anuncio,conf});
}

const pct=(a,b)=>b?Math.round(a*100/b)+'%':'—';
console.log('');
console.log('CONFERENCIA DE MEDIDA — anuncio x cadastro de SKU');
console.log('janela: '+(TUDO?'historico inteiro':'ultimos '+DIAS+' dias')+'   volumes: '+vols.length);
console.log('');
console.log('  com descricao gravada ......... '+comDescricao+'  ('+pct(comDescricao,vols.length)+')');
console.log('  com medida legivel no anuncio . '+comMedida+'  ('+pct(comMedida,comDescricao)+' dos que tem descricao)');
console.log('  de fato conferiveis ........... '+conferiveis);
console.log('');

if(divergentes.length){
  console.log('⚠  '+divergentes.length+' VOLUME(S) EM QUE O ANUNCIO E O CADASTRO DISCORDAM');
  console.log('   (a partir de agora o upload retem estes em Admin → Bloqueados)');
  console.log('');
  for(const d of divergentes){
    console.log('   #'+d.id+'  '+d.data+'  '+d.estagio+(d.bloqueio?' ['+d.bloqueio+']':''));
    console.log('       cliente : '+(d.buyer||'—')+'   NF '+(d.nf||'—')+
                '   venda '+(d.venda||d.packId||'—'));
    console.log('       anuncio : '+d.descricao);
    console.log('       conflito: '+d.conf);
    /* O codigo tambem carrega medida as vezes; quando carrega e concorda com o
       cadastro, o que esta torto e o anuncio do ML — e o reparo e la, na
       origem, nao aqui dentro (§6: sem tabela de equivalencias). */
    const cod=medidaDoCodigo(d.codigo);
    if(cod) console.log('       o codigo do SKU diz '+cod.larg+'x'+cod.alt+
      (cod.larg===d.larg&&cod.alt===d.alt?' — de acordo com o cadastro':' — e discorda do proprio cadastro'));
    console.log('');
  }
} else {
  console.log('✓  nenhum volume com anuncio e cadastro discordando na janela.');
  console.log('');
}

/* Os dois silencios: onde a trava nao tem como rodar. Nao sao erro — sao o
   tamanho do ponto cego, e e ele que precisa ser visivel (§5, cobertura). */
if(semMedidaNoAnuncio.length){
  /* COM O TITULO DE CADA UM, e nao um exemplo so. Foi assim que apareceu o
     formato "1,00 L X 1,00 A" em 14/09/2026: a contagem dizia 41 volumes e o
     exemplo unico nao mostrava que eram formatos diferentes entre si. Um ponto
     cego so vira conserto quando da pra ler o que ele esconde. */
  const skus={}; semMedidaNoAnuncio.forEach(v=>{ const k=v.codigo||'(sem SKU)';
    (skus[k]=skus[k]||{n:0,ex:v.descricao}).n++; });
  console.log('·  '+semMedidaNoAnuncio.length+' volume(s) sem medida legivel no titulo do anuncio — nao da pra conferir:');
  Object.keys(skus).sort((a,b)=>skus[b].n-skus[a].n).slice(0,15).forEach(k=>{
    console.log('     '+String(skus[k].n).padStart(4)+' x  '+k);
    console.log('             "'+String(skus[k].ex).slice(0,90)+'"'); });
  console.log('');
}
if(semDescricao.length){
  const porData={}; semDescricao.forEach(v=>{ porData[v.data]=(porData[v.data]||0)+1; });
  const datas=Object.keys(porData).sort().reverse();
  console.log('·  '+semDescricao.length+' volume(s) sem descricao gravada — a mais nova e de '+datas[0]+'.');
  console.log('     A coluna `lote.descricao` e recente: volume anterior a ela nao tem o que conferir,');
  console.log('     e isso e historico. Mas volume de HOJE sem descricao e outra coisa — ali o titulo');
  console.log('     nao foi lido no upload, e as conferencias 3, 5 e 6 estao desligadas nele.');
  console.log('     Os dias mais recentes:');
  /* A CURVA POR DATA E QUE SEPARA OS DOIS CASOS. "A mais nova e de hoje" pode
     ser um volume ou trezentos, e a diferenca entre "sobrou um" e "parou de
     ler" e justamente essa. Com o total do dia ao lado da falta, da pra ver de
     relance se o dia inteiro entrou sem titulo. */
  const totalDoDia={}; vols.forEach(v=>{ totalDoDia[v.data]=(totalDoDia[v.data]||0)+1; });
  datas.slice(0,7).forEach(d=>console.log('     '+d+'   '+String(porData[d]).padStart(4)+
    ' sem descricao de '+totalDoDia[d]+' volume(s) do dia'));
  console.log('');
  console.log('     Para saber POR QUE, com o PDF ainda no servidor (7 dias):');
  console.log('       node conferir_medidas.js --porque');
  console.log('');
}
if(semCadastro.length){
  const skus={}; semCadastro.forEach(v=>{ const k=v.codigo||'(sem SKU)'; skus[k]=(skus[k]||0)+1; });
  console.log('·  '+semCadastro.length+' volume(s) de SKU sem largura/altura no cadastro (Admin → Pendências de SKU):');
  Object.keys(skus).sort((a,b)=>skus[b]-skus[a]).slice(0,10)
    .forEach(k=>console.log('     '+String(skus[k]).padStart(4)+' x  '+k));
  console.log('');
}
/* ── --porque: RELER O PDF DOS VOLUMES SEM TITULO ────────────────────────────
 *
 * "Sem descricao" tem duas causas muito diferentes, e o contador sozinho nao
 * separa: ou a etiqueta nao casou com item nenhum da folha (e ai as
 * conferencias 2 e 3 tambem estao desligadas nesse volume), ou o item foi
 * encontrado e o TITULO e que nao foi lido dentro dele. O reparo de cada uma e
 * em lugar diferente, entao chutar qual e as duas coisas: um dia de trabalho no
 * lugar errado e a outra causa continuando de pe.
 *
 * Relê pelo `folha.js`, o mesmo dono que gravou. Só lê. Os PDFs ficam 7 dias em
 * /opt/expedicao/lotes (o cron apaga), então isto só responde sobre a semana.
 */
async function porque(){
  const {lerFolha,itemDaFolha}=require('./folha');
  /* Relendo o PDF, o titulo que faltava existe AGORA — então dá para conferir
     a medida desses volumes mesmo sem ela estar gravada. É a única janela: o
     cron apaga o PDF em 7 dias, e depois disso esses volumes ficam sem resposta
     para sempre. Sai separado do resto porque é conferência de material que o
     banco não tem. */
  const cad=db.prepare(`SELECT s.largura_cm larg, s.altura_cm alt,
    COALESCE(m.exige_medida,1) exige_medida
    FROM skus s LEFT JOIN modelo m ON m.id=s.modelo_id WHERE s.codigo=?`);
  const achadosNaRelida=[];
  const alvo=semDescricao.filter(v=>v.srcfile);
  if(!alvo.length){ console.log('·  --porque: nenhum volume sem descricao tem PDF de origem registrado.'); return; }
  const porArquivo={}; alvo.forEach(v=>{ (porArquivo[v.srcfile]=porArquivo[v.srcfile]||[]).push(v); });
  /* TODOS os PDFs que ainda existem, não os N mais recentes: um dia grande sai
     em vários arquivos, e cortar a lista faria o relatório dizer "conferi" sobre
     volumes que ele nem abriu — que é o silêncio que este script existe para
     acabar. Ler um PDF é rápido; os que o cron apagou aparecem contados. */
  const existentes=Object.keys(porArquivo).filter(a=>fs.existsSync(a)).sort().reverse();
  const sumidos=Object.keys(porArquivo).length-existentes.length;
  const arquivos=existentes;
  console.log('');
  console.log('POR QUE O TITULO NAO FOI GRAVADO — relendo os PDFs que ainda estao no servidor');
  if(sumidos>0) console.log('('+sumidos+' arquivo(s) ja foram apagados pelo cron dos 7 dias — esses nao da mais pra reler)');
  console.log('');
  for(const arq of arquivos){
    const vs=porArquivo[arq];
    let f; try{ f=await lerFolha(arq); }
    catch(e){ console.log('   '+path.basename(arq)+': nao deu pra ler ('+(e.message||e)+')'); continue; }
    let semItem=0, semTitulo=0; const exemplos={semItem:null,semTitulo:null};
    for(const v of vs){
      const it=itemDaFolha(v,f.blocos);
      if(!it){ semItem++; if(!exemplos.semItem) exemplos.semItem={v,causa:'a etiqueta nao casou com item nenhum da folha'}; }
      else if(!it.desc){ semTitulo++; if(!exemplos.semTitulo) exemplos.semTitulo={v,it,causa:'o item existe na folha (SKU '+it.sku+'), mas o titulo nao foi lido no bloco'}; }
      else {
        const anuncio=medidaDaDescricao(it.desc);
        const conf=anuncio?conflitoDeMedida(anuncio,cad.get(v.codigo),v.codigo):null;
        if(conf) achadosNaRelida.push({v,it,conf});
      }
    }
    const ok=vs.length-semItem-semTitulo;
    if(!semItem && !semTitulo){
      /* Arquivo inteiro recuperado nao precisa de quatro linhas: com o dia
         grande saindo em varios PDFs, o que importa e o que ainda falha. */
      console.log('   '+path.basename(arq)+': '+vs.length+' sem descricao, a folha TEM o titulo de todos agora');
      continue;
    }
    console.log('   '+path.basename(arq)+'  ('+vs.length+' volume(s) sem descricao)');
    console.log('       sem casar com item da folha : '+semItem);
    console.log('       item achado, titulo nao lido: '+semTitulo);
    if(ok>0) console.log('       a folha TEM o titulo agora : '+ok+'  (foram gravados por uma versao anterior do parse)');
    /* UM EXEMPLO DE CADA CAUSA, COM AS LINHAS CRUAS. O diagnostico so serve se
       levar ao conserto, e a leitura do bloco (§5, armadilha #4) e o codigo que
       manda a peca certa pro cliente: ninguem mexe nela por deducao. O texto de
       como o PDF saiu de verdade e a unica base honesta. */
    for(const e of [exemplos.semItem,exemplos.semTitulo].filter(Boolean)){
      console.log('       #'+e.v.id+' '+(e.v.codigo||'(sem SKU)')+' — '+e.causa);
      const chaves=[e.v.venda,e.v.packId].filter(Boolean);
      const sec=(f.linhas||[]).map(l=>String(l).replace(/\s+/g,''));
      let i=sec.findIndex(l=>chaves.some(c=>l.includes(c)));
      if(i<0 && e.it) i=(f.linhas||[]).findIndex(l=>new RegExp('SKU:\\s*'+e.it.sku.replace(/[.*+?^${}()|[\]\\]/g,'\\$&')).test(l));
      if(i<0){ console.log('         (nao achei a linha desse volume na folha)'); continue; }
      console.log('         ── como o PDF saiu, linhas '+(Math.max(0,i-3)+1)+' a '+Math.min(f.linhas.length,i+5)+':');
      f.linhas.slice(Math.max(0,i-3),i+5).forEach((l,k)=>{
        const n=Math.max(0,i-3)+k;
        console.log('         '+(n===i?'>':' ')+String(n+1).padStart(5)+'  '+String(l).slice(0,110));
      });
      console.log('');
    }
    console.log('');
  }
  console.log('');
  if(achadosNaRelida.length){
    console.log('⚠  '+achadosNaRelida.length+' VOLUME(S) SEM DESCRICAO GRAVADA EM QUE O PDF RELIDO ACUSA DIVERGENCIA');
    console.log('   (nao apareciam na conta de cima porque a descricao deles nunca foi gravada)');
    console.log('');
    /* O ESTAGIO E O QUE DECIDE O QUE DA PRA FAZER AGORA, e e a primeira coisa
       que alguem pergunta ao ler a lista. Sem isso o relatorio manda conferir
       peca que ja esta na casa do cliente com a mesma urgencia da que ainda
       esta na prateleira. */
    const acao={
      pendente:'ainda NAO imprimiu etiqueta — da pra segurar',
      bloqueado:'ja esta retido em Admin → Bloqueados',
      embalado:'etiqueta impressa, ainda na fabrica — da pra tirar do carro',
      carregado:'JA SAIU da fabrica — aqui so resta falar com o cliente',
    };
    for(const d of achadosNaRelida){
      console.log('   #'+d.v.id+'  '+d.v.data+'  '+d.v.estagio+
        (acao[d.v.estagio]?'  → '+acao[d.v.estagio]:''));
      console.log('       cliente : '+(d.v.buyer||'—')+'   NF '+(d.v.nf||'—')+
                  '   venda '+(d.v.venda||d.v.packId||'—'));
      console.log('       anuncio : '+String(d.it.desc).slice(0,100));
      console.log('       conflito: '+d.conf);
      console.log('');
    }
  } else {
    console.log('✓  nos volumes sem descricao que deu pra reler, anuncio e cadastro batem.');
    console.log('');
  }
  return achadosNaRelida.length;
}

(async()=>{
  let extras=0;
  if(args.includes('--porque')) extras=await porque();
  db.close();
  process.exit((divergentes.length+extras)?1:0);
})();

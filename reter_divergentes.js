#!/usr/bin/env node
/* SEGURA AGORA O QUE A CONFERENCIA 6 TERIA SEGURADO NA ENTRADA.
 *
 *   node reter_divergentes.js             simula (nao grava nada)
 *   node reter_divergentes.js --aplicar   retem, depois de fazer backup
 *   node reter_divergentes.js --db <arq>  outro banco
 *
 * A conferencia 6 (§5) compara a medida do anuncio com as COLUNAS de `skus` e
 * vale a partir do proximo upload. Os volumes que ja entraram nao passaram por
 * ela — e entre eles pode haver exatamente o caso que ela existe para pegar:
 * anuncio novo cadastrado com o SKU errado. Em 14/09/2026 eram tres
 * ("Cortina Rolô Blackout 1,70x1,70" vendida com `BK160160BEGE`), todas ainda
 * sem etiqueta impressa.
 *
 * ⚠️ SO MEXE EM `pendente`, e isso e a regra central deste script.
 * `embalado` ja teve a etiqueta impressa e o estoque baixado; `carregado` ja
 * saiu da fabrica. Marcar esses como retidos nao desfaz nada — so poe na tela
 * de Bloqueados um volume que ninguem pode mais segurar, e uma lista com item
 * que nao da pra resolver e uma lista que a equipe aprende a ignorar (§5,
 * armadilha #10). Eles saem listados no fim, para o contato com o cliente, que
 * e a unica coisa que ainda resta ali.
 *
 * O motivo gravado e o texto EXATO da conferencia 6, porque e ele que a tela de
 * Bloqueados le para montar as opcoes de escolha (`teste_divergencia.js`).
 * A descricao relida tambem e gravada quando falta: sem ela a tela mostra o
 * volume retido sem o anuncio, e e justamente o anuncio que a pessoa reconhece
 * na tela do Mercado Livre.
 *
 * Le pelo `folha.js`, o mesmo dono que o upload usa. Os PDFs vivem 7 dias em
 * `lotes/`: passou disso, nao ha como reconferir.
 */
const fs=require('fs'), path=require('path');
const Database=require('better-sqlite3');
const {lerFolha,itemDaFolha,medidaDaDescricao,conflitoDeMedida}=require('./folha');

const args=process.argv.slice(2);
const APLICAR=args.includes('--aplicar');
const iDb=args.indexOf('--db');
const CAMINHO=(iDb>=0&&args[iDb+1]) ? args[iDb+1]
  : (fs.existsSync('/opt/expedicao/dados.db') ? '/opt/expedicao/dados.db'
                                              : path.join(__dirname,'dados.db'));
if(!fs.existsSync(CAMINHO)){
  console.error('nao achei o banco em '+CAMINHO+' — passe o caminho com --db <arquivo>');
  process.exit(2);
}
const db=new Database(CAMINHO);

(async()=>{
  const cad=db.prepare(`SELECT s.largura_cm larg, s.altura_cm alt,
    COALESCE(m.exige_medida,1) exige_medida
    FROM skus s LEFT JOIN modelo m ON m.id=s.modelo_id WHERE s.codigo=?`);
  /* Os que ainda dao pra segurar e os que nao dao, na MESMA varredura: e a
     mesma pergunta, e separar em duas passadas daria duas respostas. */
  const vols=db.prepare(`SELECT id,codigo,buyer,nf,packId,venda,data,estagio,descricao,srcfile
    FROM lote WHERE estagio IN ('pendente','embalado','carregado')
      AND srcfile IS NOT NULL AND bloqueio IS NULL ORDER BY id`).all();
  const porArquivo={}; vols.forEach(v=>{ (porArquivo[v.srcfile]=porArquivo[v.srcfile]||[]).push(v); });
  const arquivos=Object.keys(porArquivo).filter(a=>fs.existsSync(a)).sort();
  const sumidos=Object.keys(porArquivo).length-arquivos.length;

  console.log('');
  console.log('CONFERENCIA 6 APLICADA AO QUE JA ENTROU — medida do anuncio x cadastro');
  console.log(APLICAR?'MODO: APLICAR (vai reter)':'MODO: SIMULACAO (nao grava nada)');
  console.log('volumes ainda na fabrica com PDF de origem: '+vols.length);
  if(sumidos>0) console.log(sumidos+' arquivo(s) ja apagados pelo cron dos 7 dias — nao ha como reconferir');
  console.log('');

  const reter=[], tarde=[];
  for(const arq of arquivos){
    let f; try{ f=await lerFolha(arq); }
    catch(e){ console.log('   '+path.basename(arq)+': nao deu pra ler ('+(e.message||e)+')'); continue; }
    for(const v of porArquivo[arq]){
      const it=itemDaFolha(v,f.blocos);
      const desc=(it&&it.desc)||v.descricao;
      if(!desc) continue;
      const anuncio=medidaDaDescricao(desc);
      if(!anuncio) continue;
      const conf=conflitoDeMedida(anuncio,cad.get(v.codigo),v.codigo);
      if(!conf) continue;
      (v.estagio==='pendente'?reter:tarde).push({v,desc,conf});
    }
  }

  if(!reter.length && !tarde.length){
    console.log('✓  nenhum volume na fabrica com anuncio e cadastro discordando.');
    db.close(); return;
  }
  if(reter.length){
    console.log('⚠  '+reter.length+' VOLUME(S) A RETER (ainda sem etiqueta impressa):');
    console.log('');
    reter.forEach(r=>{
      console.log('   #'+r.v.id+'  '+r.v.data+'  '+(r.v.codigo||'(sem SKU)'));
      console.log('       cliente : '+(r.v.buyer||'—')+'   NF '+(r.v.nf||'—')+'   venda '+(r.v.venda||r.v.packId||'—'));
      console.log('       anuncio : '+String(r.desc).slice(0,100));
      console.log('       motivo  : '+r.conf);
      console.log('');
    });
  }
  if(tarde.length){
    console.log('·  '+tarde.length+' volume(s) com a mesma divergencia que JA ANDARAM — nao sao retidos aqui:');
    tarde.forEach(t=>console.log('     #'+t.v.id+'  '+t.v.estagio+'  '+(t.v.buyer||'—')+
      '   venda '+(t.v.venda||t.v.packId||'—')+'  — '+t.conf));
    console.log('     A etiqueta desses ja saiu. O que resta e falar com o cliente.');
    console.log('');
  }
  if(!reter.length){ db.close(); return; }
  if(!APLICAR){
    console.log('Simulacao. Para reter: node reter_divergentes.js --aplicar');
    console.log('Depois eles aparecem em Admin → Bloqueados, para a gestao escolher o SKU certo.');
    db.close(); return;
  }
  const dest=path.join(path.dirname(CAMINHO),'backups');
  try{ fs.mkdirSync(dest,{recursive:true}); }catch(e){}
  const arqBk=path.join(dest,'antes-reter-divergentes-'+Date.now()+'.db');
  await db.backup(arqBk);
  console.log('backup: '+arqBk);
  /* `estagio='pendente'` de novo no UPDATE: entre a leitura e a gravacao alguem
     pode ter impresso a etiqueta, e ai o volume ja nao e mais retivel. */
  /* `NULLIF(descricao,'')` e nao `COALESCE(descricao,?)`: descricao pode estar
     como string VAZIA, e ali o COALESCE manteria o vazio — a tela mostraria o
     volume retido sem o anuncio. Mesmo criterio do backfill e do relatorio. */
  const up=db.prepare(`UPDATE lote SET estagio='bloqueado', bloqueio=?,
    descricao=COALESCE(NULLIF(descricao,''),?) WHERE id=? AND estagio='pendente'`);
  let n=0; db.transaction(()=>{ for(const r of reter) n+=up.run('divergencia: '+r.conf,r.desc,r.v.id).changes; })();
  console.log('retidos: '+n+' volume(s).');
  console.log('Eles estao em Admin → Bloqueados. Abra o pedido no Mercado Livre e escolha o SKU certo.');
  db.close();
})().catch(e=>{ console.error(e); process.exit(1); });

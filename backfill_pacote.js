#!/usr/bin/env node
/* Completa os volumes de PACOTE que entraram ANTES de o sistema saber ler isso
 * (§5, armadilha #23) — a etiqueta que leva mais de uma persiana.
 *
 *   node backfill_pacote.js                   so mostra
 *   node backfill_pacote.js --aplicar         grava as pecas em lote_item
 *   node backfill_pacote.js --aplicar --baixar  e tambem acerta o estoque dos
 *                                               volumes JA IMPRESSOS
 *
 * QUANDO RODAR: uma vez, no deploy do pacote (15/09/2026). Todo volume gravado
 * ate ali conhece SO o item de cima da folha; as pecas do irmao nao existem em
 * lugar nenhum do sistema. O caso que motivou: NF 6585, Fabiano Pereira — uma
 * etiqueta com 1x BK120120BEGE e 2x BK140140BEGE.
 *
 * O DADO NAO E ADIVINHADO: rele o PDF de cada lote pela MESMA regua do parse
 * (folha.js -> irmaosDoPacote), casando o volume com o bloco pelo mesmo criterio
 * de sempre (venda, depois pack). So olha volume que ainda esta NA FABRICA:
 * quem ja foi carregado, foi — e mexer no saldo por causa dele hoje carimbaria
 * uma saida que aconteceu noutro dia (a regra dos tres scripts de passivo, §5).
 *
 * ── AS DUAS SITUACOES SAO DIFERENTES, E O SCRIPT NAO AS MISTURA ──────────────
 *
 *   PENDENTE  a etiqueta ainda nao saiu, entao o estoque ainda NAO BAIXOU NADA.
 *             Aqui nao ha saldo a acertar: basta gravar as pecas, e o fluxo novo
 *             faz o resto — a bancada bipa as tres e a impressao baixa as tres.
 *             E o caso bom, e ele nao precisa de --baixar.
 *
 *   EMBALADO  a etiqueta ja saiu e o estoque baixou UMA peca (a do item de
 *             cima). As do irmao sairam da prateleira sem baixar — ou nao
 *             sairam, porque quem montou a caixa nao sabia delas.
 *             ⚠️ O SCRIPT NAO TEM COMO SABER QUAL DOS DOIS, e por isso o
 *             ajuste fica atras do --baixar: baixar o que ainda esta na
 *             prateleira e criar o buraco em vez de fechar. CONFIRA A CAIXA
 *             ANTES. O ajuste vai pra `ajuste_estoque` com motivo, como todo
 *             ajuste manual (§18) — quem, quando, de -> para e por que.
 */
const Database=require('better-sqlite3');
const fs=require('fs'); const path=require('path');
const {lerFolha,irmaosDoPacote,itemDaFolha,etiquetasSemItem}=require('./folha');

const DB=require('./caminhos').BANCO;
const APLICAR=process.argv.includes('--aplicar');
const BAIXAR=process.argv.includes('--baixar');
const QUEM=process.env.PCP_QUEM||'backfill_pacote';

(async()=>{
const db=new Database(DB);
const ESTOQUE=require('./estoque_dominio');
ESTOQUE.garantirSchema(db);

/* A tabela nasce no exp_route, que nao roda aqui. Num servidor que ja subiu o
   deploy ela existe; este CREATE e para o caso de alguem rodar o script antes
   de reiniciar o pm2 — e e IF NOT EXISTS, entao nao reescreve nada. */
db.exec(`CREATE TABLE IF NOT EXISTS lote_item (
  id INTEGER PRIMARY KEY AUTOINCREMENT, lote_id INTEGER NOT NULL, codigo TEXT,
  qtd INTEGER DEFAULT 1, cor TEXT, descricao TEXT, origem TEXT DEFAULT 'folha',
  conferido_em TEXT, conferido_por TEXT,
  criado_em TEXT DEFAULT (datetime('now','localtime')), teste INTEGER DEFAULT 0,
  conferidos INTEGER DEFAULT 0);`);
try{ db.exec("ALTER TABLE lote_item ADD COLUMN conferidos INTEGER DEFAULT 0"); }catch(e){}

/* So quem ainda esta na fabrica, e so quem ainda nao tem pecas gravadas —
   rodar duas vezes nao duplica. */
const alvo=db.prepare(`SELECT id,data,codigo,nf,buyer,packId,venda,srcfile,estagio,modalidade
  FROM lote
  WHERE estagio IN ('pendente','bloqueado','embalado')
    AND COALESCE(teste,0)=0
    AND id NOT IN (SELECT DISTINCT lote_id FROM lote_item)
  ORDER BY id`).all();

console.log('banco:',DB);
console.log('volumes ainda na fabrica, sem pecas gravadas:',alvo.length);
if(!alvo.length){ console.log('Nada a fazer.'); db.close(); return; }

const porArquivo={}; let semArquivo=0;
for(const v of alvo){
  if(!v.srcfile || !fs.existsSync(v.srcfile)){ semArquivo++; continue; }
  (porArquivo[v.srcfile]=porArquivo[v.srcfile]||[]).push(v);
}

const pacotes=[]; const ilegiveis=[]; const naoFecham=[];
const arquivos=Object.keys(porArquivo);
let n=0;
for(const arq of arquivos){
  n++;
  let f; try{ f=await lerFolha(arq); }
  catch(e){ ilegiveis.push(path.basename(arq)); continue; }
  const grupos=irmaosDoPacote(f.blocos);
  /* A MESMA LICENCA DO UPLOAD (§5, #23): ausencia so vale como peca a mais
     quando NENHUMA etiqueta do PDF ficou sem item na folha. Sobrou etiqueta
     orfa, o pdf.js comeu campo — e o orfao e um item que perdeu os campos, nao
     uma persiana a mais. Aqui a guarda importa MAIS que no upload: la o erro
     retem um volume numa tela; aqui ele grava peca e, com `--baixar`, tira do
     estoque uma persiana que nunca saiu da prateleira. */
  const semItem=etiquetasSemItem(f.etiquetas,f.blocos);
  if(grupos.length && semItem.length){
    naoFecham.push({arq:path.basename(arq), etiquetas:f.etiquetas.length,
      itens:f.blocos.length, orfas:semItem.length, grupos:grupos.length,
      volumes:porArquivo[arq].length});
    process.stdout.write('\r  lendo PDFs: '+n+'/'+arquivos.length+'   ');
    continue;
  }
  if(grupos.length) for(const v of porArquivo[arq]){
    /* O MESMO CRITERIO DE CASAMENTO DO PARSE: venda primeiro, pack depois. O
       `itemDaFolha` devolve o PROPRIO objeto do array, entao a identidade
       serve de ancora pro grupo. */
    const pai=itemDaFolha(v,f.blocos);
    const g=pai && grupos.find(x=>x.pai===pai);
    if(!g) continue;
    pacotes.push({v, arq:path.basename(arq),
      itens:[g.pai].concat(g.irmaos).map(b=>({sku:String(b.sku||'').toUpperCase(),
        qtd:Math.max(1,b.qtd||1), cor:b.cor||null, descricao:b.desc||null}))});
  }
  process.stdout.write('\r  lendo PDFs: '+n+'/'+arquivos.length+'   ');
}
console.log(''); console.log('');

if(ilegiveis.length) console.log('PDFs que nao deram pra ler:',ilegiveis.join(', '));
if(semArquivo) console.log('volumes cujo PDF ja saiu do disco (limpeza de 7 dias):',semArquivo);

/* Recusa calada e o mesmo silencio de "nao achei nada" — e aqui o que foi
   recusado e justamente o que mais parece pacote. Quem le precisa saber que
   existe, para ir olhar o pedido no ML em vez de achar que esta tudo fechado. */
if(naoFecham.length){
  console.log('');
  console.log('── PDFs RECUSADOS: tem item orfao, mas a conta NAO FECHA ──');
  console.log('');
  console.log('   Sobrou etiqueta sem item na folha. Ali o orfao e um item que');
  console.log('   PERDEU os campos (o pdf.js come campo), nao uma persiana a mais —');
  console.log('   e gravar peca por causa dele juntaria duas vendas separadas numa');
  console.log('   caixa que nao existe. Nada foi lido destes arquivos.');
  console.log('');
  for(const x of naoFecham)
    console.log('  '+x.arq+'  ·  '+x.etiquetas+' etiqueta(s), '+x.itens+' item(ns), '
      +x.orfas+' etiqueta(s) SEM item  ·  '+x.grupos+' orfao(s) ignorado(s)'
      +'  ·  '+x.volumes+' volume(s) deste PDF na fabrica');
  console.log('');
  console.log('   Reparo: abrir o pedido no Mercado Livre e conferir, ou subir o PDF');
  console.log('   de novo — o upload novo retem sozinho o que nao fechar.');
}

if(!pacotes.length){
  console.log('');
  console.log('Nenhuma etiqueta com mais de um produto entre os volumes que ainda');
  console.log('estao na fabrica. Nada a completar.');
  db.close(); return;
}

const naoImpressos=pacotes.filter(p=>p.v.estagio!=='embalado');
const impressos   =pacotes.filter(p=>p.v.estagio==='embalado');
const estoqueDe=db.prepare('SELECT estoque FROM skus WHERE codigo=?');
const cadastrado=c=>!!estoqueDe.get(c);

function mostrar(p,extra){
  const total=p.itens.reduce((s,i)=>s+i.qtd,0);
  console.log('  #'+p.v.id+'  '+(p.v.buyer||'—')+'  ·  NF '+(p.v.nf||'—')+'  ·  '+p.v.data
    +'  ·  '+(p.v.estagio||'')+(p.v.modalidade?(' · '+p.v.modalidade):''));
  console.log('        pack '+(p.v.packId||'—')+'   '+total+' persiana(s) nesta caixa:');
  p.itens.forEach((i,k)=>{
    const sem = cadastrado(i.sku) ? '' : '   ⚠ SKU FORA DO CADASTRO';
    console.log('          '+(k===0?'gravado ':'A MAIS  ')+String(i.sku).padEnd(22)+i.qtd+' un'+sem);
  });
  if(extra) console.log('        '+extra);
}

if(naoImpressos.length){
  console.log('');
  console.log('── AINDA NAO IMPRESSOS: o estoque NAO baixou nada, nao ha saldo a acertar ──');
  console.log('   Gravar as pecas basta: a bancada vai bipar cada uma e a impressao');
  console.log('   baixa todas de uma vez.');
  console.log('');
  naoImpressos.forEach(p=>mostrar(p));
}

/* O QUE FALTOU BAIXAR nos ja impressos: tudo menos a peca do item de cima, que
   e a unica que o /api/embalar conhecia quando a etiqueta saiu. Sob medida fica
   de fora — ela nunca baixa (§7), e baixar aqui abriria o buraco que a regra
   existe pra evitar. */
const sobMedida=db.prepare(`SELECT COALESCE(m.sob_medida,0) s FROM skus k
  LEFT JOIN modelo m ON m.id=k.modelo_id WHERE k.codigo=?`);
const faltaBaixar=[];
for(const p of impressos){
  const principal=String(p.v.codigo||'').toUpperCase();
  let usouPrincipal=false;
  for(const i of p.itens){
    if(!usouPrincipal && i.sku===principal){ usouPrincipal=true; if(i.qtd<=1) continue;
      faltaBaixar.push({p,sku:i.sku,qtd:i.qtd-1}); continue; }
    faltaBaixar.push({p,sku:i.sku,qtd:i.qtd});
  }
}
const baixaveis=faltaBaixar.filter(x=>{ const r=sobMedida.get(x.sku); return r && !r.s; });
const semCadastro=faltaBaixar.filter(x=>!sobMedida.get(x.sku));

if(impressos.length){
  console.log('');
  console.log('── JA IMPRESSOS: a etiqueta saiu e o estoque baixou UMA peca so ──');
  console.log('');
  impressos.forEach(p=>mostrar(p));
  console.log('');
  console.log('   O que ficou sem baixar:');
  const soma={}; baixaveis.forEach(x=>soma[x.sku]=(soma[x.sku]||0)+x.qtd);
  Object.keys(soma).forEach(s=>{
    const e=estoqueDe.get(s);
    console.log('     '+String(s).padEnd(22)+'-'+soma[s]+'   (saldo hoje: '+(e?e.estoque:'?')
      +' -> ficaria '+(e?Math.max(0,e.estoque-soma[s]):'?')+')');
  });
  if(semCadastro.length){
    console.log('');
    console.log('   ⚠ '+semCadastro.length+' peca(s) com SKU fora do cadastro — nao dao pra ajustar:');
    [...new Set(semCadastro.map(x=>x.sku))].forEach(s=>console.log('     '+s));
  }
  console.log('');
  console.log('   ⚠ CONFIRA A CAIXA ANTES DE BAIXAR. Se as pecas a mais nao chegaram a');
  console.log('     entrar nela, elas ainda estao na prateleira e o saldo esta CERTO —');
  console.log('     baixar ali abre um buraco em vez de fechar.');
}

if(!APLICAR){
  console.log('');
  console.log('SIMULACAO — nada foi gravado.');
  console.log('  gravar as pecas:            node backfill_pacote.js --aplicar');
  if(impressos.length)
  console.log('  e acertar o saldo tambem:   node backfill_pacote.js --aplicar --baixar');
  db.close(); return;
}

const dest=path.join(path.dirname(DB),'backups');
fs.mkdirSync(dest,{recursive:true});
const bkp=path.join(dest,'antes-backfill-pacote-'+new Date().toISOString().replace(/[:.]/g,'-')+'.db');
await db.backup(bkp);
console.log(''); console.log('backup ->',bkp);

const insItem=db.prepare(`INSERT INTO lote_item (lote_id,codigo,qtd,cor,descricao,origem)
  VALUES (?,?,?,?,?,'folha')`);
const insAj=db.prepare(`INSERT INTO ajuste_estoque (codigo,antes,depois,delta,motivo,obs,usuario_nome)
  VALUES (?,?,?,?,?,?,?)`);

let itens=0, ajustes=0;
db.transaction(()=>{
  for(const p of pacotes){
    for(const i of p.itens) insItem.run(p.v.id,i.sku,i.qtd,i.cor,i.descricao);
    itens+=p.itens.length;
  }
  if(BAIXAR) for(const x of baixaveis){
    const e=estoqueDe.get(x.sku); if(!e) continue;
    const antes=+e.estoque||0, depois=antes-x.qtd;
    /* O MOTIVO CONTA A HISTORIA INTEIRA, porque daqui a um mes ninguem lembra:
       de qual volume, de qual cliente, e por que o saldo andou sem venda. */
    insAj.run(x.sku, antes, depois, depois-antes,
      'pacote do ML — peca a mais na mesma etiqueta (§5, #23)',
      'volume #'+x.p.v.id+' · NF '+(x.p.v.nf||'—')+' · '+(x.p.v.buyer||'')
        +' · a etiqueta ja tinha saido baixando so '+(x.p.v.codigo||'')+', e esta peca foi junto na caixa',
      QUEM);
    ESTOQUE.movimentar(db,{codigo:x.sku, delta:-x.qtd, tipo:'ajuste',
      referencia:'lote:'+x.p.v.id,
      motivo:'pacote do ML — peca a mais na mesma etiqueta (§5, #23)',
      usuario_nome:QUEM});
    ajustes++;
  }
})();

console.log('pecas gravadas:',itens,'  em',pacotes.length,'volume(s)');
if(BAIXAR) console.log('ajustes de estoque lancados:',ajustes);
else if(impressos.length) console.log('saldo NAO foi mexido (faltou --baixar)');
console.log('');
if(naoImpressos.length){
  console.log('Os '+naoImpressos.length+' volume(s) ainda nao impressos agora aparecem na Etiqueta');
  console.log('de Venda com a caixa inteira: a bancada bipa cada peca antes de imprimir.');
}
db.close();
})().catch(e=>{ console.error('erro:',e.message); process.exit(1); });

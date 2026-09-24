#!/usr/bin/env node
/* O SOB MEDIDA CHEGANDO A LISTA DE COMPRAS — fase 4-C da spec
 * SOBMEDIDA-PEDIDO-REVENDA.
 *
 *   node teste_compras_sobmedida.js
 *
 * ⚠️ ESCRITO ANTES DO CODIGO (secao 0, risco vermelho).
 *
 * O QUE ORIGINOU (24/09/2026): o tubo da persiana sob medida e o MESMO tubo
 * da medida padrao — decisao do dono —, comprado do mesmo fornecedor, e a
 * lista de compras nao o enxergava. Sao dois bancos (dados.db e tecido.db) e
 * nao havia vinculo nenhum entre o que a etiqueta do sob medida manda cortar
 * e o que o Compras compra.
 *
 * AS TRES COISAS QUE ELE TRAVA:
 *
 * 1. SEM A PORTA, A LISTA NAO CALA. Se o modulo sob medida nao subiu (o
 *    try/catch do server.js existe para a expedicao nao cair junto), a lista
 *    de compras continua funcionando — mas DIZ que o sob medida ficou de
 *    fora. Silencio ali e um total incompleto com cara de completo, que e a
 *    regra 4 do custo pela porta do Compras.
 *
 * 2. SOMA NO MESMO COMPONENTE, E A ORIGEM FICA SEPARADA. `origem` e por SKU
 *    (medida padrao) e `origem_sobmedida` e por PEDIDO. Enfiar um numero de
 *    pedido num campo chamado `sku` seria mentira de campo.
 *
 * 3. UNIDADE DIVERGENTE VIRA PENDENCIA, NUNCA NUMERO. Se o sob medida diz
 *    metro e o cadastro do PCP diz unidade, o certo e recusar a soma e falar
 *    — somar seria inventar uma conversao que ninguem decidiu.
 *
 * Sobe um banco temporario. Nao abre porta, nao toca no banco de producao.
 */
const Database=require('better-sqlite3');
const fs=require('fs'), os=require('os'), path=require('path');

const tmp=fs.mkdtempSync(path.join(os.tmpdir(),'pcp-4c-'));
process.env.PCP_DB=path.join(tmp,'t.db');

const PORTA=require('./sobmedida_material');
const NEC  =require('./necessidade_dominio');

const db=new Database(path.join(tmp,'t.db'));
db.exec(`
  CREATE TABLE componente (id INTEGER PRIMARY KEY, nome TEXT, unidade TEXT,
    estoque REAL DEFAULT 0, ativo INTEGER DEFAULT 1);
  INSERT INTO componente(id,nome,unidade) VALUES
    (101,'Tubo 32 mm','m'), (104,'Tubo 41 mm','m'), (109,'Tampa base redonda','un');
  /* O MINIMO que o demanda_dominio le. Nenhum SKU a produzir: este arquivo e
     sobre o outro lado da conta, e catalogo vazio isola o que se quer medir. */
  CREATE TABLE config (chave TEXT PRIMARY KEY, valor TEXT);
  CREATE TABLE modelo (id INTEGER PRIMARY KEY, nome TEXT, sob_medida INTEGER DEFAULT 0);
  CREATE TABLE skus (codigo TEXT PRIMARY KEY, descricao TEXT DEFAULT '',
    cor TEXT DEFAULT '', estoque INTEGER DEFAULT 0, alvo INTEGER DEFAULT 0,
    ativo INTEGER DEFAULT 1, modelo_id INTEGER);
  CREATE TABLE venda_futura (id INTEGER PRIMARY KEY, codigo TEXT,
    data_venda TEXT, data_envio TEXT, cancelada INTEGER DEFAULT 0);
`);

let casos=0, falhas=0;
/* ⚠️ O `extra` E UMA FUNCAO, e nao um valor ja calculado. Com valor, uma
   expressao como `r.pendencias[0].motivo` e avaliada ANTES do `ok` — e no dia
   em que a lista vem vazia (que e justamente o dia em que o caso reprova) ela
   estoura e mata o processo no meio, escondendo todos os casos abaixo. Foi o
   que aconteceu ao reintroduzir o defeito da unidade, em 24/09/2026: o caso
   reprovava certo e o arquivo morria antes de dizer o placar. */
function casoOk(oque,cond,extra){
  casos++;
  if(cond){ console.log('  ✓ '+oque); return; }
  falhas++;
  let d=''; try{ d=typeof extra==='function'?extra():extra; }catch(e){ d='('+e.message+')'; }
  console.log('  ✗ '+oque+(d?'\n      '+d:''));
}
/* `cond` tambem vem embrulhado: a propria condicao pode estourar ao ler um
   campo de uma linha que nao veio, e estourar nao e passar. */
function ok(oque,cond,extra){
  let v=false;
  try{ v=(typeof cond==='function')?cond():cond; }
  catch(e){ return casoOk(oque,false,'estourou: '+e.message); }
  casoOk(oque,v,extra);
}
const perto=(a,b)=>Math.abs((a||0)-(b||0))<=0.001;

// O que o sob medida devolve pela porta reversa, no formato da fase 4-C.
const RESPOSTA=(extra)=>Object.assign({
  materiais:[
    {componente_id:101, nome:'Tubo 32 mm', unidade:'m',  quantidade:1.94, pecas:2,
     origem:[{pedido_id:1, numero:5001, revenda:'LAR DO CILAR', pecas:2, quantidade:1.94}]},
    {componente_id:109, nome:'Tampa base redonda', unidade:'un', quantidade:3, pecas:3,
     origem:[{pedido_id:1, numero:5001, revenda:'LAR DO CILAR', pecas:3, quantidade:3}]}
  ],
  pendencias:[]
},extra||{});

console.log('\n── sem a porta ligada '+'─'.repeat(40));
PORTA.ligar(null);
ok('a porta diz que nao esta ligada', PORTA.ligada()===false);
{
  const r=NEC.porItem(db);
  ok('a lista de compras NAO estoura sem o sob medida', !!r && !!r.componentes);
  ok('ela avisa que o sob medida ficou de fora', r.sobmedida_fora===true);
  ok('e o aviso e uma frase, nao um silencio',
     typeof r.sobmedida_motivo==='string' && r.sobmedida_motivo.length>10,
     ()=>String(r.sobmedida_motivo));
  ok('nenhum componente ganhou consumo do nada', Object.keys(r.componentes).length===0);
}

console.log('\n── com a porta ligada '+'─'.repeat(40));
PORTA.ligar(()=>RESPOSTA());
{
  const r=NEC.porItem(db);
  ok('o sob medida nao esta mais fora', !r.sobmedida_fora);
  ok('o Tubo 32 recebeu 1,94 m', perto(r.componentes[101]&&r.componentes[101].consumo,1.94),
     ()=>JSON.stringify(r.componentes[101]));
  ok('a tampa recebeu 3 un', perto(r.componentes[109]&&r.componentes[109].consumo,3));
  ok('a origem por SKU continua vazia — nao ha peca de medida padrao aqui',
     ()=>(r.componentes[101].origem||[]).length===0);
  ok('a origem do sob medida vai em campo proprio',
     ()=>(r.componentes[101].origem_sobmedida||[]).length===1);
  ok('e ela diz o numero do pedido, nao um SKU inventado',
     ()=>r.componentes[101].origem_sobmedida[0].numero===5001);
  ok('a revenda vem junto — e ela que se liga quando o material atrasa',
     ()=>r.componentes[101].origem_sobmedida[0].revenda==='LAR DO CILAR');
}

console.log('\n── soma com a medida padrao '+'─'.repeat(34));
{
  /* O caso que importa: o mesmo componente pedido pelos dois lados. Se um
     sobrescrevesse o outro, a fabrica compraria metade — e o lado que some e
     sempre o que chega depois. */
  const mapa={101:{consumo:5, origem:[{sku:'BK140140BEGE',precisa:4,por_peca:1.25,subtotal:5}]}};
  const r=NEC.somarSobMedida(db,mapa);
  ok('o consumo dos dois lados SOMA', ()=>perto(mapa[101].consumo,6.94),
     ()=>String(mapa[101]&&mapa[101].consumo));
  ok('a origem por SKU continua inteira', ()=>mapa[101].origem.length===1);
  ok('a do sob medida entrou ao lado', ()=>mapa[101].origem_sobmedida.length===1);
  ok('nao houve pendencia', r.pendencias.length===0);
}

console.log('\n── unidade divergente '+'─'.repeat(40));
PORTA.ligar(()=>RESPOSTA({materiais:[
  {componente_id:101, nome:'Tubo 32 mm', unidade:'un', quantidade:2, pecas:2, origem:[]}
]}));
{
  const mapa={};
  const r=NEC.somarSobMedida(db,mapa);
  ok('nao soma um numero que nao se sabe converter', mapa[101]===undefined);
  ok('vira pendencia', r.pendencias.length===1);
  ok('e a pendencia diz as duas unidades',
     ()=>/un/.test(r.pendencias[0].motivo) && /\bm\b/.test(r.pendencias[0].motivo),
     ()=>JSON.stringify(r.pendencias));
}

console.log('\n── material que nao existe mais no PCP '+'─'.repeat(23));
PORTA.ligar(()=>RESPOSTA({materiais:[
  {componente_id:777, nome:'Tubo fantasma', unidade:'m', quantidade:9, pecas:1, origem:[]}
]}));
{
  const mapa={};
  const r=NEC.somarSobMedida(db,mapa);
  ok('nao cria componente do nada', mapa[777]===undefined);
  ok('vira pendencia com o nome que o sob medida conhecia',
     ()=>r.pendencias.length===1 && /fantasma/i.test(r.pendencias[0].motivo),
     ()=>JSON.stringify(r.pendencias));
}

console.log('\n── componente inativo '+'─'.repeat(40));
db.prepare('UPDATE componente SET ativo=0 WHERE id=104').run();
PORTA.ligar(()=>RESPOSTA({materiais:[
  {componente_id:104, nome:'Tubo 41 mm', unidade:'m', quantidade:1.96, pecas:1, origem:[]}
]}));
{
  /* Inativo nao e inexistente: o material existe e alguem o desativou. Somar
     em silencio manteria a venda sem compra; por isso e pendencia, e ela DIZ
     que o item esta desativado — senao o comprador procura o erro no sob
     medida, onde ele nao esta. */
  const mapa={};
  const r=NEC.somarSobMedida(db,mapa);
  ok('nao soma em componente desativado', mapa[104]===undefined);
  ok('e diz que ele esta desativado',
     ()=>r.pendencias.length===1 && /desativad/i.test(r.pendencias[0].motivo),
     ()=>JSON.stringify(r.pendencias));
}
db.prepare('UPDATE componente SET ativo=1 WHERE id=104').run();

console.log('\n── as pendencias do sob medida atravessam '+'─'.repeat(20));
PORTA.ligar(()=>RESPOSTA({pendencias:[
  {pedido_id:2, numero:5002, item_n:1, motivo:'o degrau "Tubo 41" nao tem material do PCP apontado'}
]}));
{
  const r=NEC.porItem(db);
  ok('a pendencia do sob medida aparece na lista de compras',
     (r.pendencias_sobmedida||[]).length===1);
  ok('ela diz o pedido', ()=>r.pendencias_sobmedida[0].numero===5002,
     ()=>JSON.stringify(r.pendencias_sobmedida));
  ok('e nao se mistura com a pendencia de SKU sem ficha',
     (r.pendencias||[]).length===0);
}

console.log('\n── a porta que estoura nao derruba o Compras '+'─'.repeat(17));
PORTA.ligar(()=>{ throw new Error('tecido.db travado'); });
{
  /* O sob medida e um modulo montado com try/catch justamente para nao
     derrubar a expedicao (CLAUDE.md secao 19). A mesma regra vale aqui: o
     comprador nao pode ficar sem lista porque o outro banco tropecou — mas
     tambem nao pode achar que a lista esta completa. */
  /* A chamada vai dentro de um try DO TESTE: sem o try/catch da porta ela
     estoura, e um teste que morre no meio esconde os casos abaixo dele — o
     placar nem chega a ser impresso. */
  let r=null, morreu=null;
  try{ r=NEC.porItem(db); }catch(e){ morreu=e.message; }
  ok('a lista continua de pe', ()=>!!r.componentes, ()=>'estourou: '+morreu);
  ok('e diz que o sob medida ficou de fora', ()=>r.sobmedida_fora===true);
  ok('com o motivo real, nao um generico', ()=>/travado/.test(r.sobmedida_motivo||''),
     ()=>String(r&&r.sobmedida_motivo));
}

console.log('');
console.log(falhas ? ('FALHARAM '+falhas+' de '+casos)
                   : ('todos os '+casos+' casos passaram'));
try{ fs.rmSync(tmp,{recursive:true,force:true}); }catch(e){}
process.exit(falhas?1:0);

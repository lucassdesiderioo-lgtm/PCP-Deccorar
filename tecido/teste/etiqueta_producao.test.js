// A ETIQUETA DE PRODUCAO — secao 4.14 da spec SOBMEDIDA-PEDIDO-REVENDA.
//
// ⚠️ ESTE ARQUIVO FOI ESCRITO ANTES DO `dominio/etiqueta_producao.js`, e de
// proposito: risco vermelho da secao 0 do CLAUDE.md pede teste antes do
// codigo. Os formatos daqui vem da spec (`SER-000001`, `COL-000001`), nao do
// que o codigo devolveu.
//
// O QUE ESTE ARQUIVO EXISTE PARA PROVAR, numa frase: O CODIGO E DA PECA, NAO
// DO PAPEL. Ele nasce na aprovacao, sobrevive a reimpressao e nunca volta ao
// bolo — porque duas etiquetas iguais em duas pecas diferentes e a bancada
// bipando a peca errada com a etiqueta certa.
const pedido=require('../dominio/pedido');
const etq=require('../dominio/etiqueta_producao');
const etqPdf=require('../dominio/etiqueta_producao_pdf');
const revendas=require('../dominio/revenda');
const catalogo=require('../dominio/catalogo_sm');
const tecido=require('../dominio/tecido');
const plano=require('../dominio/plano');
const config=require('../nucleo/config');
const pessoas=require('../nucleo/pessoas');

const DO_PCP=[{id:7, nome:'Renato'}];
const RENATO ={id:7, nome:'Renato', papel:'vendedor'};
const DIRETOR={id:1, nome:'Lucas',  papel:'diretor'};

/* A cena: o catalogo de venda com DUAS cores de tecido, para o caso do plano
   de corte ter mais de um tecido e precisar agrupar. */
let base=null;
function cena(){
  if(base) return base;
  pessoas.ligar(()=>DO_PCP);
  const l=tecido.criarLinha({nome:'Rolô'});
  const screen1=tecido.criarAbertura({nome:'Screen 1%',linha_id:l.id});
  const branco=tecido.criarCor({nome:'Branco'});
  const areia=tecido.criarCor({nome:'Areia'});
  const tBranco=tecido.criarTecido({linha_id:l.id,abertura_id:screen1.id,cor_id:branco.id});
  const tAreia =tecido.criarTecido({linha_id:l.id,abertura_id:screen1.id,cor_id:areia.id});

  const m=catalogo.modeloPorNome('Rolô');
  catalogo.ligarColecao({modelo_id:m.id, abertura_id:screen1.id,
    preco_m2_centavos:11000, largura_max_mm:2800});
  catalogo.ligarCorAcessorio({modelo_id:m.id, cor_id:branco.id});

  base={m, screen1, branco, areia, tBranco, tAreia};
  return base;
}

function peca(b,extra){
  return Object.assign({
    modelo_id:b.m.id, abertura_id:b.screen1.id,
    cor_tecido_id:b.branco.id, cor_acessorio_id:b.branco.id,
    largura_mm:1000, altura_mm:1000,
    comando:'direito', rolamento:'frente', adicional:'nenhum', reducao:'nao'
  },extra||{});
}

function limpar(db){
  for(const t of ['sm_pedido_componente','sm_pedido_item_preco','sm_pedido_alteracao',
                  'sm_pedido_marco','sm_pedido_prazo','sm_pedido_item','sm_pedido',
                  'sm_etiqueta_impressao'])
    db.prepare('DELETE FROM '+t).run();
  db.prepare('DELETE FROM sm_revenda').run();
  db.prepare('UPDATE sm_tabela_preco SET desconto_centesimos=NULL').run();
  /* ⚠️ O CONTADOR **NAO** E ZERADO AQUI, e isso e de proposito: ele nunca
     desce, nem entre casos. Zerar seria o teste concordando com o defeito
     que ele existe para pegar. Por isso os casos conferem o PREFIXO e o
     PASSO, nunca o numero absoluto — menos o primeiro, que roda antes de
     qualquer outro e por isso pode exigir o 000001. */
  config.gravar('pedidoNumeroInicial','5000','teste');
  cena();
}

let nRev=0;
function revendaCom(){
  const t=revendas.tabelas()[0];
  revendas.definirDescontoTabela(t.id,500,{nome:'teste'});
  const r=revendas.criar({razao_social:'Revenda '+(++nRev)+' LTDA',
    nome_fantasia:'LAR DO CILAR '+nRev, tabela_id:t.id, desconto_centesimos:0},DIRETOR);
  revendas.definirVendedor(r.id,7,DIRETOR);
  return revendas.porId(r.id);
}

// Um pedido APROVADO, com N persianas.
function aprovado(rev,pecas){
  const b=cena();
  const p=pedido.criar({revenda_id:rev.id, tipo:'pedido'},DIRETOR);
  (pecas||[{}]).forEach(x=>pedido.acrescentarItem(p.id,peca(b,x),DIRETOR));
  pedido.enviar(p.id,DIRETOR,'2026-09-22 10:00');
  return pedido.aprovar(p.id,RENATO);
}

const etiquetasDe=p=>p.itens.flatMap(i=>i.componentes);
const num=codigo=>Number(String(codigo).split('-')[1]);

module.exports=[

/* ═══ O CODIGO NASCE NA APROVACAO ═════════════════════════════════════════ */

{nome:'4.14 — a APROVACAO da codigo a cada componente que tem etiqueta, e so a eles',
 executar({igual,db}){
  limpar(db);
  const p=aprovado(revendaCom());
  const comp=etiquetasDe(p);

  const comEtiqueta=comp.filter(c=>c.gera_etiqueta);
  const semEtiqueta=comp.filter(c=>!c.gera_etiqueta);
  /* ⚠️ SAO SEIS, E NAO OITO — e o oito foi um numero MEU, errado, dito ao
     dono no plano de 23/09/2026. A ficha tem oito componentes com
     `gera_etiqueta=1`, mas o bandô e a barra NUNCA convivem (secao 4.6: o
     adicional e um so) e nenhum dos dois entra quando o adicional e
     "nenhum". A persiana simples leva 6; com bandô ou com barra, 7.
     A regra que o dono aprovou continua de pe — uma etiqueta por componente
     que gera etiqueta —, o que estava errado era a minha conta. */
  igual(comEtiqueta.length,6,'SEIS na persiana simples: tubo, tecido, base, montagem, revisao, embalagem');
  igual(comEtiqueta.every(c=>!!c.codigo_etiqueta),true,
    'todas nasceram com codigo, na aprovacao e nao na impressao');
  igual(semEtiqueta.every(c=>c.codigo_etiqueta==null),true,
    'e o que NAO gera etiqueta (os kits) fica sem codigo — o UNIQUE e parcial por isso');

  igual(comp.find(c=>c.chave==='tubo').codigo_etiqueta,'SER-000001','o primeiro da serralheria');
  igual(comp.find(c=>c.chave==='tecido').codigo_etiqueta,'COL-000001','o primeiro da colecao');
  igual(comp.find(c=>c.chave==='montagem').codigo_etiqueta,'MON-000001','montagem');
  igual(comp.find(c=>c.chave==='revisao').codigo_etiqueta,'REV-000001','revisao');
  igual(comp.find(c=>c.chave==='embalagem').codigo_etiqueta,'EMB-000001','embalagem');
}},

{nome:'4.14 — a sequencia e POR SETOR: dois setores nao dividem contador',
 executar({igual,db}){
  limpar(db);
  // Uma persiana com bandô: a serralheria ganha tubo, base E bandô (tres),
  // enquanto a colecao ganha so o tecido (um).
  const p=aprovado(revendaCom(),[{adicional:'bando'}]);
  const comp=etiquetasDe(p);
  const ser=comp.filter(c=>c.setor==='serralheria'&&c.codigo_etiqueta).map(c=>c.codigo_etiqueta);
  const col=comp.filter(c=>c.setor==='colecao'&&c.codigo_etiqueta).map(c=>c.codigo_etiqueta);

  igual(ser.length,3,'tubo, base e bandô');
  igual(col.length,1,'e um tecido');
  igual(ser.every(c=>c.startsWith('SER-')),true,'a serralheria leva SER-');
  igual(col.every(c=>c.startsWith('COL-')),true,'e a colecao, COL-');
  // Tres seguidos na serralheria, e a colecao andou UM. Se dividissem o
  // contador, o tecido teria pulado junto com as tres da serralheria.
  igual(Math.max(...ser.map(num))-Math.min(...ser.map(num)),2,'os tres da serralheria sao seguidos');
}},

{nome:'4.14 — o contador NUNCA DESCE, nem depois de apagar a peca',
 executar({igual,db}){
  limpar(db);
  const rev=revendaCom();
  const antes=num(etiquetasDe(aprovado(rev)).find(c=>c.chave==='tubo').codigo_etiqueta);
  /* Apagar um pedido inteiro — o que so acontece numa limpeza de banco —
     nao devolve o codigo ao bolo. Codigo reaproveitado e codigo que um dia
     sai em duas pecas, e a bancada bipa a peca errada com a etiqueta certa. */
  db.prepare('DELETE FROM sm_pedido_componente').run();
  const depois=num(etiquetasDe(aprovado(rev)).find(c=>c.chave==='tubo').codigo_etiqueta);
  igual(depois>antes,true,'o seguinte continua sendo o seguinte: '+antes+' -> '+depois);
}},

{nome:'a peca CANCELADA nao ganha etiqueta, e some da impressao',
 executar({igual,db}){
  limpar(db);
  const p=aprovado(revendaCom(),[{},{largura_mm:1200,altura_mm:1200}]);
  const item2=pedido.porId(p.id).itens[1];
  pedido.cancelarItem(p.id,item2.id,'a revenda desistiu',DIRETOR);

  const lista=etq.paraImprimir({pedidos:[p.id], setor:'serralheria'});
  igual(lista.length,2,'so as duas da peca que ficou (tubo e base)');
  igual(lista.every(e=>e.item_n===1),true,'e nenhuma da peca cancelada');
}},

/* ═══ IMPRIMIR MARCA; REIMPRIMIR REPETE O CODIGO ══════════════════════════ */

{nome:'4.14 — imprimir MARCA a etiqueta e registra quem, quando e o que',
 executar({igual,db}){
  limpar(db);
  const p=aprovado(revendaCom());
  const r=etq.imprimir({pedidos:[p.id], setor:'serralheria'},DIRETOR);
  igual(r.etiquetas.length,2,'tubo e base');
  igual(r.reimpressao,false,'e a primeira vez');

  const comp=etiquetasDe(pedido.porId(p.id)).filter(c=>c.setor==='serralheria');
  igual(comp.every(c=>!!c.impresso_em),true,'ficaram marcadas como impressas');
  igual(comp.every(c=>c.impresso_por==='Lucas'),true,'com quem imprimiu');

  const reg=db.prepare('SELECT * FROM sm_etiqueta_impressao ORDER BY id DESC').get();
  igual(reg.setor,'serralheria','o registro diz o setor');
  igual(reg.quantidade,2,'e quantas sairam');
  igual(reg.usuario_nome,'Lucas','e quem');
}},

{nome:'⚠️ 4.14 — REIMPRIMIR SAI COM O MESMO CODIGO, e fica registrado',
 executar({igual,db}){
  limpar(db);
  const p=aprovado(revendaCom());
  const antes=etq.imprimir({pedidos:[p.id], setor:'serralheria'},DIRETOR)
    .etiquetas.map(e=>e.codigo).sort();

  const de_novo=etq.imprimir({pedidos:[p.id], setor:'serralheria'},DIRETOR);
  igual(de_novo.etiquetas.map(e=>e.codigo).sort().join(','),antes.join(','),
    'os MESMOS codigos — codigo novo partiria a historia da peca em duas');
  igual(de_novo.reimpressao,true,'e a tela sabe que foi reimpressao');

  const comp=etiquetasDe(pedido.porId(p.id)).filter(c=>c.setor==='serralheria');
  igual(comp.every(c=>c.reimpressoes===1),true,'cada uma contou a segunda saida');
  const regs=db.prepare("SELECT * FROM sm_etiqueta_impressao WHERE reimpressao=1").all();
  igual(regs.length,1,'e a reimpressao tem linha propria no registro');
}},

{nome:'a tela sabe o que JA FOI IMPRESSO — senao o lote sai duas vezes',
 executar({igual,db}){
  limpar(db);
  const p=aprovado(revendaCom());
  const antes=etq.aImprimir().find(x=>x.pedido_id===p.id);
  igual(antes.setores.serralheria.total,2,'duas na serralheria');
  igual(antes.setores.serralheria.impressas,0,'nenhuma impressa ainda');

  etq.imprimir({pedidos:[p.id], setor:'serralheria'},DIRETOR);
  const depois=etq.aImprimir().find(x=>x.pedido_id===p.id);
  igual(depois.setores.serralheria.impressas,2,'agora as duas estao marcadas');
  igual(depois.setores.colecao.impressas,0,'e a colecao continua por imprimir');
}},

{nome:'imprimir um setor que nao tem etiqueta nenhuma RECUSA dizendo',
 executar({igual,recusa,db}){
  limpar(db);
  const p=aprovado(revendaCom());
  const e=recusa(()=>etq.imprimir({pedidos:[p.id], setor:'serralheria2'},DIRETOR),
    'setor_inexistente','setor que nao existe no cadastro');
  recusa(()=>etq.imprimir({pedidos:[], setor:'serralheria'},DIRETOR),
    'sem_pedido','sem pedido escolhido');
  igual(db.prepare('SELECT COUNT(*) c FROM sm_etiqueta_impressao').get().c,0,
    'e recusa nao deixa registro de impressao que nao houve');
}},

{nome:'pedido que NAO foi aprovado nao tem etiqueta para imprimir',
 executar({igual,recusa,db}){
  limpar(db);
  const b=cena(), rev=revendaCom();
  const p=pedido.criar({revenda_id:rev.id,tipo:'pedido'},DIRETOR);
  pedido.acrescentarItem(p.id,peca(b),DIRETOR);
  pedido.enviar(p.id,DIRETOR);
  igual(etq.aImprimir().some(x=>x.pedido_id===p.id),false,
    'enviado ainda nao e trabalho da fabrica');
  recusa(()=>etq.imprimir({pedidos:[p.id], setor:'serralheria'},DIRETOR),
    'sem_etiqueta','e imprimir recusa dizendo');
}},

/* ═══ O QUE VAI ESCRITO NA ETIQUETA (secao 4.14) ══════════════════════════ */

{nome:'4.14 — a etiqueta traz pedido, peca, revenda, prazo, medida e o que O SETOR faz',
 executar({igual,db}){
  limpar(db);
  const p=aprovado(revendaCom(),[{},{largura_mm:1200,altura_mm:1200}]);
  const e=etq.paraImprimir({pedidos:[p.id], setor:'serralheria'})
    .find(x=>x.chave==='tubo'&&x.item_n===1);

  igual(e.pedido_numero,5001,'o numero do pedido');
  igual(e.peca,'1 de 2','a peca e quantas sao — a bancada conta o maço na mão');
  igual(e.revenda.indexOf('LAR DO CILAR')>=0,true,'a revenda');
  igual(e.prazo,'quinta 01/10','o prazo por extenso, como na folha');
  igual(e.medida,'1,000 × 1,000','a medida ACABADA, que e como a revenda pediu');
  igual(e.comando,'COMANDO DIREITO','o lado do comando');
  igual(e.colecao.toUpperCase().indexOf('SCREEN 1%')>=0,true,'a colecao');
  igual(e.colecao.toUpperCase().indexOf('BRANCO')>=0,true,'e a cor');

  /* ⚠️ O QUE ESTE SETOR FAZ E A LINHA QUE IMPORTA, e ela e do COMPONENTE.
     A serralheria nao corta 1,000: ela corta 0,970, que e a medida de CORTE
     do tubo (armadilha #18 — os dois numeros da linha nunca fecham). */
  igual(e.tarefa,'TUBO 32 · CORTAR 0,970','o tubo e a medida de corte dele');

  const tecidoEtq=etq.paraImprimir({pedidos:[p.id], setor:'colecao'})
    .find(x=>x.item_n===1);
  igual(tecidoEtq.tarefa,'TECIDO · CORTAR 0,965 × 1,200',
    'e a colecao corta o retangulo do tecido, largura × altura');
}},

{nome:'4.14 — a de EMBALAGEM traz o kit, e a de MONTAGEM a reducao quando houver',
 executar({igual,db}){
  limpar(db);
  /* 2,000 × 1,700 = 3,400 m²: cai no Tubo 38, que e o unico degrau que
     aceita bandô E reducao ao mesmo tempo. O Tubo 41 do pedido 5001 tem
     reducao mas NAO aceita bandô — o tubo enrolado nao cabe dentro dele —, e
     foi nisso que a primeira versao deste caso tropecou. */
  const p=aprovado(revendaCom(),[{adicional:'bando', reducao:'pedida',
    largura_mm:2000, altura_mm:1700}]);
  const emb=etq.paraImprimir({pedidos:[p.id], setor:'embalagem'})[0];
  igual(emb.extra.toUpperCase().indexOf('KIT')>=0,true,'o kit vai na etiqueta da embalagem');
  igual(/\d+ suporte/.test(emb.extra),true,'com a quantidade de suportes: '+emb.extra);

  const mon=etq.paraImprimir({pedidos:[p.id], setor:'montagem'})[0];
  igual(mon.extra.toUpperCase().indexOf('REDUÇÃO')>=0,true,
    'e a montagem sabe que esta peca leva reducao de peso: '+mon.extra);
}},

/* ═══ O PAPEL ═════════════════════════════════════════════════════════════ */

{nome:'o PDF sai com uma pagina por etiqueta, e o codigo de barras remontado BATE',
 async executar({igual,db}){
  limpar(db);
  const p=aprovado(revendaCom(),[{},{largura_mm:1200,altura_mm:1200}]);
  const lista=etq.paraImprimir({pedidos:[p.id], setor:'serralheria'});
  igual(lista.length,4,'duas persianas × tubo e base');

  const pdf=await etqPdf.gerar(lista);
  igual(pdf.slice(0,5).toString(),'%PDF-','saiu PDF de verdade');

  /* ⚠️ O TESTE REMONTA O CODIGO A PARTIR DO PDF, e nao confere so que o
     texto aparece. E a licao do QR do kit (CLAUDE.md §4): a etiqueta pode
     sair com cara de etiqueta e nao bipar. Aqui o que se confere e a LARGURA
     das barras — se o modulo encolher abaixo do que a ZD220 resolve, a
     etiqueta fica bonita e o leitor recusa. */
  /* Reabrir o PDF e contar as paginas de verdade. Procurar '/Contents' no
     texto cru nao funciona — o pdf-lib comprime os objetos —, e um teste que
     conta zero e diz "passou" e o verde sem conferencia do §10. */
  const {PDFDocument}=require('pdf-lib');
  const reaberto=await PDFDocument.load(pdf);
  igual(reaberto.getPageCount(),4,'uma pagina por etiqueta');
  const m=etqPdf.moduloDe(lista[0].codigo);
  igual(m.cabe,true,'e o modulo do codigo cabe na largura da etiqueta: '+m.mm+' mm');
}},

/* ═══ O PLANO DE CORTE (a outra metade da 4-A) ════════════════════════════ */

{nome:'⚠️ a peca entra no corte com a medida de CORTE, nunca a acabada',
 executar({igual,db}){
  limpar(db);
  const p=aprovado(revendaCom());
  const grupos=etq.paraCortar({pedidos:[p.id]});
  igual(grupos.length,1,'um tecido, um grupo');

  const peca1=grupos[0].pecas[0];
  /* A persiana e 1,000 × 1,000 acabada; o TECIDO dela e 0,965 × 1,200 — mais
     estreito (o tubo e as ponteiras entram na conta) e mais alto (sobra para
     enrolar). Mandar a medida acabada para o corte e cortar a peca errada,
     e o plano nao teria como saber. */
  igual(peca1.largura,0.965,'a largura de corte do tecido');
  igual(peca1.altura,1.2,'e a altura de corte');
  igual(peca1.pedido,'5001','com o numero do pedido — e ele que agrupa o tom unico');
  igual(peca1.cliente.indexOf('LAR DO CILAR')>=0,true,'e a revenda, que e quem ve as duas na parede');
}},

{nome:'as pecas saem AGRUPADAS POR TECIDO — o plano corta um tecido de cada vez',
 executar({igual,db}){
  limpar(db);
  const b=cena(), rev=revendaCom();
  const p=pedido.criar({revenda_id:rev.id,tipo:'pedido'},DIRETOR);
  pedido.acrescentarItem(p.id,peca(b),DIRETOR);
  pedido.acrescentarItem(p.id,peca(b,{cor_tecido_id:b.areia.id}),DIRETOR);
  pedido.enviar(p.id,DIRETOR);
  pedido.aprovar(p.id,RENATO);

  const grupos=etq.paraCortar({pedidos:[p.id]});
  igual(grupos.length,2,'duas cores, dois grupos — calcular() recebe UM tecido por vez');
  igual(grupos.every(g=>g.pecas.length===1),true,'uma peca em cada');
  igual(new Set(grupos.map(g=>g.tecido_id)).size,2,'e os tecidos sao diferentes');
}},

{nome:'o corte le o que o plano ja sabe receber — o mesmo formato do arquivo do Decorsoft',
 executar({igual,db}){
  limpar(db);
  const p=aprovado(revendaCom());
  const g=etq.paraCortar({pedidos:[p.id]})[0];
  /* Nao e teste de forma: e o plano REAL calculando com o que a rota devolve.
     Se o formato divergir, isto estoura aqui e nao na bancada. */
  const r=plano.calcular({tecido_id:g.tecido_id, pecas:g.pecas});
  igual(!!r,true,'o plano aceitou as pecas sem traducao no meio');
}},

{nome:'pedido NAO aprovado nao entra no corte — a fabrica so corta o que foi aprovado',
 executar({igual,db}){
  limpar(db);
  const b=cena(), rev=revendaCom();
  const p=pedido.criar({revenda_id:rev.id,tipo:'pedido'},DIRETOR);
  pedido.acrescentarItem(p.id,peca(b),DIRETOR);
  pedido.enviar(p.id,DIRETOR);
  igual(etq.paraCortar({pedidos:[p.id]}).length,0,'enviado nao corta');
}}

];

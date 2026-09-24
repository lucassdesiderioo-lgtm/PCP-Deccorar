// O QUE OS PEDIDOS APROVADOS AINDA VAO CONSUMIR — fase 4-B da spec
// SOBMEDIDA-PEDIDO-REVENDA, a metade do TECIDO.
//
// ⚠️ ESTE ARQUIVO FOI ESCRITO ANTES DO `dominio/consumo.js`. Risco vermelho da
// secao 0 do CLAUDE.md pede teste antes do codigo, e o numero daqui decide
// compra de bobina: errar para menos e a fabrica parando com cliente na fila.
//
// O QUE ELE EXISTE PARA PROVAR, em tres frases:
//
//   1. O COMPROMETIDO E CONSUMO, NAO CORTE. Sao os dois numeros da linha da
//      ficha (armadilha #18), e quem comprar pela medida de corte compra a
//      menos — o corte e sempre mais apertado que o consumo.
//   2. ELE BAIXA QUANDO A PECA E CORTADA. Numero que so sobe vira numero que
//      a equipe aprende a ignorar, e aI ele nao serve para comprar nada.
//   3. ELE NAO E REPARTIDO ENTRE BOBINAS. O pedido nao escolhe largura — quem
//      escolhe e o plano de corte. Distribuir seria inventar (armadilha #17).
const consumo=require('../dominio/consumo');
const gerencial=require('../dominio/gerencial');
const pedido=require('../dominio/pedido');
const revendas=require('../dominio/revenda');
const catalogo=require('../dominio/catalogo_sm');
const tecidoDom=require('../dominio/tecido');
const rolo=require('../dominio/rolo');
const plano=require('../dominio/plano');
const config=require('../nucleo/config');
const pessoas=require('../nucleo/pessoas');

const DO_PCP=[{id:7,nome:'Renato'}];
const RENATO ={id:7,nome:'Renato',papel:'vendedor'};
const DIRETOR={id:1,nome:'Lucas', papel:'diretor'};

let base=null;
function cena(){
  if(base) return base;
  pessoas.ligar(()=>DO_PCP);
  const l=tecidoDom.criarLinha({nome:'Rolô'});
  const screen=tecidoDom.criarAbertura({nome:'Screen 1%',linha_id:l.id});
  const branco=tecidoDom.criarCor({nome:'Branco'});
  const areia =tecidoDom.criarCor({nome:'Areia'});
  const tBranco=tecidoDom.criarTecido({linha_id:l.id,abertura_id:screen.id,cor_id:branco.id});
  const tAreia =tecidoDom.criarTecido({linha_id:l.id,abertura_id:screen.id,cor_id:areia.id});
  const m=catalogo.modeloPorNome('Rolô');
  catalogo.ligarColecao({modelo_id:m.id,abertura_id:screen.id,
    preco_m2_centavos:11000,largura_max_mm:2800});
  catalogo.ligarCorAcessorio({modelo_id:m.id,cor_id:branco.id});
  base={m,screen,branco,areia,tBranco,tAreia};
  return base;
}

function peca(b,extra){
  return Object.assign({
    modelo_id:b.m.id, abertura_id:b.screen.id,
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
  db.prepare('DELETE FROM plano_peca').run();
  db.prepare('DELETE FROM plano_faixa').run();
  db.prepare('DELETE FROM plano').run();
  db.prepare('DELETE FROM movimento_rolo').run();
  db.prepare('DELETE FROM rolo').run();
  db.prepare('UPDATE sm_tabela_preco SET desconto_centesimos=NULL').run();
  config.gravar('pedidoNumeroInicial','5000','teste');
  cena();
}

let nRev=0;
function revendaCom(){
  const t=revendas.tabelas()[0];
  revendas.definirDescontoTabela(t.id,500,{nome:'teste'});
  const r=revendas.criar({razao_social:'Revenda '+(++nRev)+' LTDA',
    nome_fantasia:'LAR '+nRev, tabela_id:t.id, desconto_centesimos:0},DIRETOR);
  revendas.definirVendedor(r.id,7,DIRETOR);
  return revendas.porId(r.id);
}
function aprovado(rev,pecas){
  const b=cena();
  const p=pedido.criar({revenda_id:rev.id,tipo:'pedido'},DIRETOR);
  (pecas||[{}]).forEach(x=>pedido.acrescentarItem(p.id,peca(b,x),DIRETOR));
  pedido.enviar(p.id,DIRETOR,'2026-09-22 10:00');
  return pedido.aprovar(p.id,RENATO);
}
// O m² de tecido de uma peca, lido da ficha CONGELADA — a mesma fonte que o
// dominio le. Somar isto a mao aqui seria a regua propria do §4.
function m2DoTecido(p){
  return p.itens.filter(i=>!i.cancelado_em).reduce((s,i)=>{
    const t=i.componentes.find(c=>c.chave==='tecido');
    return s+(t&&t.consumo_largura_mm!=null
      ? t.consumo_largura_mm*t.consumo_altura_mm/1e6 : 0);
  },0);
}
const doTecido=(lista,id)=>lista.find(x=>x.tecido_id===id)||null;

module.exports=[

/* ═══ SO O APROVADO CONTA ═════════════════════════════════════════════════ */

{nome:'4-B — o rascunho e o enviado NAO comprometem tecido; so o aprovado',
 executar({igual,perto,db}){
  limpar(db);
  const b=cena(), rev=revendaCom();

  const rascunho=pedido.criar({revenda_id:rev.id,tipo:'pedido'},DIRETOR);
  pedido.acrescentarItem(rascunho.id,peca(b),DIRETOR);
  igual(consumo.comprometido().length,0,'rascunho nao compromete');

  pedido.enviar(rascunho.id,DIRETOR,'2026-09-22 10:00');
  igual(consumo.comprometido().length,0,'enviado nao compromete — a fabrica so corta o aprovado');

  const p=pedido.aprovar(rascunho.id,RENATO);
  const linha=doTecido(consumo.comprometido(),b.tBranco.id);
  if(!linha) throw new Error('o aprovado tem que aparecer no comprometido');
  perto(linha.m2,m2DoTecido(p),'m² comprometido');
  igual(linha.pecas,1,'pecas');
}},

{nome:'4-B — peca CANCELADA sai do comprometido; o pedido continua',
 executar({igual,perto,db}){
  limpar(db);
  const b=cena(), rev=revendaCom();
  const p=aprovado(rev,[{},{largura_mm:1400,altura_mm:1600}]);
  const antes=doTecido(consumo.comprometido(),b.tBranco.id);
  igual(antes.pecas,2,'duas pecas antes');

  pedido.cancelarItem(p.id,p.itens[1].id,"cliente desistiu desta",DIRETOR);
  const depois=doTecido(consumo.comprometido(),b.tBranco.id);
  igual(depois.pecas,1,'uma peca depois do cancelamento');
  if(!(depois.m2<antes.m2)) throw new Error('cancelar tem que baixar o m²');
}},

/* ═══ CONSUMO, NUNCA CORTE ════════════════════════════════════════════════ */

{nome:'4-B — o comprometido le o CONSUMO, e dobrar a medida de CORTE nao mexe nele',
 executar({perto,db}){
  limpar(db);
  const b=cena();
  const p=aprovado(revendaCom());
  const antes=doTecido(consumo.comprometido(),b.tBranco.id).m2;

  /* A armadilha #18 na conta da compra: os dois numeros da linha nunca
     fecham, e quem comprar pela medida de corte compra a MENOS. */
  db.prepare(`UPDATE sm_pedido_componente SET largura_corte_mm=largura_corte_mm*2,
    altura_corte_mm=altura_corte_mm*2 WHERE chave='tecido'`).run();
  perto(doTecido(consumo.comprometido(),b.tBranco.id).m2,antes,
    'dobrar o corte nao pode mexer no comprometido');
}},

{nome:'4-B — cada tecido tem a sua linha, e elas nao se misturam',
 executar({igual,perto,db}){
  limpar(db);
  const b=cena(), rev=revendaCom();
  const branco=aprovado(rev,[{}]);
  const areia =aprovado(revendaCom(),[{cor_tecido_id:b.areia.id}]);

  const lista=consumo.comprometido();
  igual(lista.length,2,'dois tecidos');
  perto(doTecido(lista,b.tBranco.id).m2,m2DoTecido(branco),'branco');
  perto(doTecido(lista,b.tAreia.id).m2, m2DoTecido(areia), 'areia');
}},

{nome:'4-B — a linha diz de QUAIS pedidos ela veio, com o numero de cada um',
 executar({igual,db}){
  limpar(db);
  const b=cena();
  const p1=aprovado(revendaCom());
  const p2=aprovado(revendaCom());
  const linha=doTecido(consumo.comprometido(),b.tBranco.id);
  igual(linha.pedidos.length,2,'dois pedidos na origem');
  const numeros=linha.pedidos.map(x=>x.numero).sort();
  igual(numeros[0],p1.numero,'o primeiro numero');
  igual(numeros[1],p2.numero,'o segundo numero');
}},

/* ═══ O CORTE BAIXA O COMPROMETIDO ════════════════════════════════════════ */

{nome:'4-B — plano NAO confirmado nao baixa nada: so o corte de verdade conta',
 executar({perto,db}){
  limpar(db);
  const b=cena();
  const p=aprovado(revendaCom());
  const antes=doTecido(consumo.comprometido(),b.tBranco.id).m2;
  rolo.entrada({tecido_id:b.tBranco.id,largura:'3,00',metragem:'50',preco_m2:'25'},DIRETOR.nome);

  const pecas=[{pedido:String(p.numero),cliente:'LAR',largura:0.965,altura:1.200}];
  plano.calcular({tecido_id:b.tBranco.id,pecas});   // calcula e NAO confirma
  perto(doTecido(consumo.comprometido(),b.tBranco.id).m2,antes,
    'plano so calculado nao baixa');
}},

{nome:'4-B — a peca CORTADA sai do comprometido, e as irmas ficam',
 executar({igual,perto,db}){
  limpar(db);
  const b=cena();
  const p=aprovado(revendaCom(),[{},{}]);   // duas persianas IGUAIS
  const linha=doTecido(consumo.comprometido(),b.tBranco.id);
  igual(linha.pecas,2,'duas antes de cortar');
  const porPeca=linha.m2/2;

  const t=p.itens[0].componentes.find(c=>c.chave==='tecido');
  const corte={largura:t.largura_corte_mm/1000, altura:t.altura_corte_mm/1000};
  /* Bobina da largura EXATA da peca: assim o corte nao gera sobra lateral, e
     o caso confirma o plano pelo caminho de verdade sem precisar montar
     etiqueta e endereco de sobra — que sao outro assunto e ja tem teste. */
  rolo.entrada({tecido_id:b.tBranco.id,
    largura:String(corte.largura).replace('.',','),
    metragem:'50',preco_m2:'25'},DIRETOR.nome);

  /* UMA das duas. Elas sao identicas, entao qual das duas foi nao muda nada —
     e e por isso que o casamento por MEDIDA e exato aqui, e nao um chute. */
  const calc=plano.calcular({tecido_id:b.tBranco.id,
    pecas:[{pedido:String(p.numero),cliente:'LAR',largura:corte.largura,altura:corte.altura}]});
  plano.confirmar({tecido_id:b.tBranco.id, assinatura:calc.assinatura,
    pecas:[{pedido:String(p.numero),cliente:'LAR',largura:corte.largura,altura:corte.altura}],
    etiquetas:{}}, 'Lucas');

  const depois=doTecido(consumo.comprometido(),b.tBranco.id);
  igual(depois.pecas,1,'sobra uma');
  perto(depois.m2,porPeca,'o m² da que sobrou');
}},

/* ═══ O PAINEL ════════════════════════════════════════════════════════════ */

{nome:'4-B — o painel mostra o comprometido, e ele NAO e repartido entre as bobinas',
 executar({igual,perto,db}){
  limpar(db);
  const b=cena();
  const p=aprovado(revendaCom());
  // DUAS larguras do MESMO tecido: o pedido nao escolhe qual, o plano escolhe.
  rolo.entrada({tecido_id:b.tBranco.id,largura:'2,00',metragem:'30',preco_m2:'20'},DIRETOR.nome);
  rolo.entrada({tecido_id:b.tBranco.id,largura:'3,00',metragem:'40',preco_m2:'25'},DIRETOR.nome);

  const pa=gerencial.painel(30,{});
  perto(pa.resumo.comprometido,m2DoTecido(p),'o comprometido do resumo');

  const linhas=pa.linhas.filter(l=>l.tecido_id===b.tBranco.id);
  igual(linhas.length,2,'duas larguras na tabela');
  /* ⚠️ A ARMADILHA #17 NA CONTA DA VENDA: repartir o comprometido entre as
     bobinas seria inventar qual delas o plano vai escolher. Ele mora no grao
     do TECIDO, e a tabela por largura nao o carrega. */
  linhas.forEach(l=>{ if(l.comprometido!=null)
    throw new Error('a linha por largura nao pode ter comprometido proprio'); });
}},

{nome:'4-B — tecido comprometido e SEM rolo nenhum aparece no painel, em vez de sumir',
 executar({igual,perto,db}){
  limpar(db);
  const b=cena();
  const p=aprovado(revendaCom());
  /* Nenhum rolo deste tecido: pelo filtro antigo do painel ele nao existiria
     (sem estoque e sem consumo e ruido) — mas agora ha venda aprovada
     esperando por ele, e sumir e o silencio que a §4.10 manda evitar. */
  const pa=gerencial.painel(30,{});
  const linha=pa.por_tecido.find(l=>l.tecido_id===b.tBranco.id);
  if(!linha) throw new Error('tecido comprometido sem rolo tem que aparecer');
  perto(linha.comprometido,m2DoTecido(p),'o m² que falta comprar');
  igual(linha.m2,0,'e ele tem zero em estoque');
  igual(linha.falta>0,true,'e falta tecido');
}},

{nome:'4-B — com estoque de sobra nao falta nada, e `falta` e zero (nunca negativo)',
 executar({igual,db}){
  limpar(db);
  const b=cena();
  aprovado(revendaCom());
  rolo.entrada({tecido_id:b.tBranco.id,largura:'3,00',metragem:'100',preco_m2:'25'},DIRETOR.nome);
  const linha=gerencial.painel(30,{}).por_tecido.find(l=>l.tecido_id===b.tBranco.id);
  igual(linha.falta,0,'300 m² cobrem uma persiana');
}},

{nome:'4-B — o aviso ao vendedor diz o que ESTE pedido usa, nao o total do tecido',
 executar({igual,perto,db}){
  limpar(db);
  const b=cena();
  /* Dois pedidos do MESMO tecido, de tamanhos DIFERENTES. Foi exatamente esta
     cena que mostrou o defeito ao abrir a tela: os dois liam "precisa de
     7,56 m²" — o total do tecido — e quem somasse compraria o dobro. */
  const p1=aprovado(revendaCom(),[{}]);
  const p2=aprovado(revendaCom(),[{largura_mm:1800,altura_mm:2000}]);
  rolo.entrada({tecido_id:b.tBranco.id,largura:'2,80',metragem:'1',preco_m2:'25'},DIRETOR.nome);

  const risco=consumo.pedidosEmRisco();
  igual(risco.length,2,'os dois em risco');
  const a=risco.find(x=>x.numero===p1.numero).tecidos[0];
  const c=risco.find(x=>x.numero===p2.numero).tecidos[0];
  perto(a.usa,m2DoTecido(p1),'o 1 usa o dele');
  perto(c.usa,m2DoTecido(p2),'o 2 usa o dele');
  if(!(c.usa>a.usa)) throw new Error('a peca maior tem que usar mais — dois numeros iguais foi o defeito');
  // E o total do tecido e o MESMO nos dois, porque e do tecido e vai nomeado.
  perto(a.vendido,c.vendido,'o vendido do tecido e um so');
  perto(a.vendido,a.usa+c.usa,'e ele e a soma dos dois');
 }},

{nome:'4-B — pedido com tecido de sobra NAO entra no aviso',
 executar({igual,db}){
  limpar(db);
  const b=cena();
  aprovado(revendaCom(),[{}]);
  rolo.entrada({tecido_id:b.tBranco.id,largura:'3,00',metragem:'100',preco_m2:'25'},DIRETOR.nome);
  igual(consumo.pedidosEmRisco().length,0,'com estoque nao ha aviso — aviso que aparece sempre se aprende a fechar');
 }},

{nome:'4-B — o FILTRO da tela corta o cartao e a tabela JUNTOS, nunca um so',
 executar({igual,perto,db}){
  limpar(db);
  const b=cena();
  const branco=aprovado(revendaCom(),[{}]);
  aprovado(revendaCom(),[{cor_tecido_id:b.areia.id}]);

  const tudo=gerencial.painel(30,{});
  igual(tudo.por_tecido.length,2,'sem filtro, os dois tecidos');

  /* Filtrando para Branco, o cartao do resumo tem que somar SO o Branco. A
     primeira versao filtrava a tabela e deixava o cartao somar tudo — dois
     recortes lado a lado na mesma tela, que e o defeito que o comentario do
     `painel` ja mandava nao cometer. So apareceu abrindo a tela. */
  const so=gerencial.painel(30,{cor:'Branco'});
  igual(so.por_tecido.length,1,'a tabela filtrou');
  perto(so.resumo.comprometido,m2DoTecido(branco),'e o cartao tambem');
  if(!(so.resumo.comprometido<tudo.resumo.comprometido))
    throw new Error('filtrar tem que baixar o numero do cartao');
 }},

{nome:'4-B — sem pedido aprovado nenhum, o comprometido e ZERO e nao quebra a tela',
 executar({igual,db}){
  limpar(db);
  const b=cena();
  rolo.entrada({tecido_id:b.tBranco.id,largura:'3,00',metragem:'10',preco_m2:'25'},DIRETOR.nome);
  igual(consumo.comprometido().length,0,'nada aprovado');
  const pa=gerencial.painel(30,{});
  igual(pa.resumo.comprometido,0,'zero no resumo');
  igual(Array.isArray(pa.por_tecido),true,'a tela continua recebendo a lista');
}}

];

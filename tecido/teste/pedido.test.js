// O PEDIDO SOB MEDIDA — secoes 4.8, 4.9, 4.10, 4.11 e 4.18 da spec
// SOBMEDIDA-PEDIDO-REVENDA.
//
// ⚠️ ESTE ARQUIVO FOI ESCRITO ANTES DO `dominio/pedido.js`, e de proposito:
// risco vermelho da secao 0 do CLAUDE.md pede teste antes do codigo. Os
// numeros daqui nao foram tirados do que o codigo devolveu — o preco de
// R$ 209,00 e o de R$ 178,70 vem da secao 4.8 e ja estavam escritos no
// `persiana.test.js`; as datas de prazo vem da 4.9.
//
// O QUE ESTE ARQUIVO EXISTE PARA PROVAR, numa frase: CONGELADO E CONGELADO.
// Um pedido que rele o catalogo depois do envio diverge da etiqueta que a
// bancada tem na mao, e na bancada vence a etiqueta.
//
//   rascunho   se edita a vontade, e o preco e o de HOJE
//   enviado    numero, preco, tabela e prazo ficam gravados
//   aprovado   a ficha e explodida e gravada — e nada mais muda
const pedido=require('../dominio/pedido');
const pdfPedido=require('../dominio/pedido_pdf');
const persiana=require('../dominio/persiana');
const revendas=require('../dominio/revenda');
const catalogo=require('../dominio/catalogo_sm');
const tecido=require('../dominio/tecido');
const endereco=require('../dominio/endereco');
const rolo=require('../dominio/rolo');
const config=require('../nucleo/config');
const pessoas=require('../nucleo/pessoas');

/* ── A CENA ────────────────────────────────────────────────────────────────
   O modelo Rolo, a escada e a ficha vem da SEMENTE da migracao — se ela
   mudar, estes casos reprovam, que e o ponto. O que se monta aqui e o
   catalogo de venda (a colecao com preco), o item de tecido e a revenda. */
const DO_PCP=[
  {id:7, nome:'Renato', pin_hash:'NAO PODE VAZAR'},   // vendedor da carteira
  {id:9, nome:'Bruna',  pin_hash:'NAO PODE VAZAR'}    // vendedora de OUTRA carteira
];
const RENATO ={id:7, nome:'Renato', papel:'vendedor'};
const BRUNA  ={id:9, nome:'Bruna',  papel:'vendedor'};
const DIRETOR={id:1, nome:'Lucas',  papel:'diretor'};

let base=null;
function cena(){
  if(base) return base;
  pessoas.ligar(()=>DO_PCP);
  const l=tecido.criarLinha({nome:'Rolô'});
  const screen1=tecido.criarAbertura({nome:'Screen 1%',linha_id:l.id});
  const semPreco=tecido.criarAbertura({nome:'Screen 5%',linha_id:l.id});
  const cor=tecido.criarCor({nome:'Branco'});
  const item=tecido.criarTecido({linha_id:l.id,abertura_id:screen1.id,cor_id:cor.id});
  // O item da Screen 5% tambem existe: o que falta nela e PRECO, nao cadastro
  // de tecido — senao o caso da regra 4 reprovaria pelo motivo errado.
  tecido.criarTecido({linha_id:l.id,abertura_id:semPreco.id,cor_id:cor.id});

  const m=catalogo.modeloPorNome('Rolô');
  const c1=catalogo.ligarColecao({modelo_id:m.id, abertura_id:screen1.id,
    preco_m2_centavos:11000, largura_max_mm:2800});
  const c5=catalogo.ligarColecao({modelo_id:m.id, abertura_id:semPreco.id});
  catalogo.ligarCorAcessorio({modelo_id:m.id, cor_id:cor.id});

  // A estante do rolo, para o caso do "sem tecido" ter os dois lados.
  const h=endereco.criarHaste({nome:'PD',armazem_chave:'ROLO'});
  const a=endereco.criarAndar({nome:'01',haste_id:h.id});
  let seq=0;
  const buraco=()=>endereco.criarNivel({nome:String(++seq).padStart(2,'0'),andar_id:a.id}).id;

  base={m, screen1, semPreco, cor, item, c1, c5, buraco};
  return base;
}

/* A revenda do caso: tabela A com 10,00% e desconto proprio de 5,00%.
   20900 x 0,90 x 0,95 = 17869,5 -> R$ 178,70. */
let nRev=0;
function revendaCom(tabelaCent,descontoCent,extra){
  const t=revendas.tabelas()[0];
  if(tabelaCent===null) revendas.tabelas();            // deixa o percentual em branco
  else revendas.definirDescontoTabela(t.id,tabelaCent,{nome:'teste'});
  const r=revendas.criar(Object.assign({
    razao_social:'Revenda '+(++nRev)+' LTDA', nome_fantasia:'Revenda '+nRev,
    tabela_id:t.id, desconto_centesimos:descontoCent},extra||{}),DIRETOR);
  revendas.definirVendedor(r.id,7,DIRETOR);            // carteira do Renato
  return revendas.porId(r.id);
}

/* A persiana do exemplo da secao 4.8: 0,800 x 1,200 com bando, Screen 1%. */
function peca(b,extra){
  return Object.assign({
    modelo_id:b.m.id, abertura_id:b.screen1.id,
    cor_tecido_id:b.cor.id, cor_acessorio_id:b.cor.id,
    largura_mm:800, altura_mm:1200,
    comando:'direito', rolamento:'frente', adicional:'bando', reducao:'nao'
  },extra||{});
}

function limpar(db){
  /* ⚠️ A ORDEM DESTA LISTA E A DOS PONTEIROS, de fora para dentro. O
     `sm_pedido_alteracao` aponta para o ITEM (a troca de degrau e a peca
     cancelada guardam qual peca era), entao ele sai ANTES dele — e nao junto
     dos outros registros, que so apontam para o pedido. Com `foreign_keys =
     ON` o DELETE sem filtro so passa quando ninguem mais aponta (CLAUDE.md
     §12), e foi assim que esta lista reprovou na primeira rodada. */
  for(const t of ['sm_pedido_componente','sm_pedido_item_preco','sm_pedido_alteracao',
                  'sm_pedido_marco','sm_pedido_prazo','sm_pedido_item','sm_pedido'])
    db.prepare('DELETE FROM '+t).run();
  db.prepare('DELETE FROM sm_revenda').run();
  db.prepare('UPDATE sm_tabela_preco SET desconto_centesimos=NULL').run();
  db.prepare('DELETE FROM sm_feriado').run();
  config.gravar('pedidoNumeroInicial','4272',DIRETOR.nome);
  cena();
}

// Um pedido de uma persiana, pronto para enviar.
function comUmItem(rev,extra){
  const b=cena();
  const p=pedido.criar({revenda_id:rev.id, tipo:'pedido'},DIRETOR);
  pedido.acrescentarItem(p.id,peca(b,extra),DIRETOR);
  return pedido.porId(p.id);
}

module.exports=[

/* ═══ 4.10 — ORCAMENTO, PEDIDO E APROVACAO ════════════════════════════════ */

{nome:'4.10 — o pedido nasce RASCUNHO, sem numero e sem prazo',
 executar({igual,db}){
  limpar(db);
  const rev=revendaCom(1000,500);
  const p=pedido.criar({revenda_id:rev.id},DIRETOR);
  igual(p.marco,'rascunho','nasce rascunho');
  igual(p.tipo,'orcamento','e orcamento ate alguem dizer o contrario');
  igual(p.numero,null,'NUMERO NAO NASCE AQUI — ver o caso da numeracao');
  const completo=pedido.porId(p.id);
  igual(completo.prazo,null,'orcamento nao tem prazo: nada foi prometido a ninguem');
  igual(completo.congelado,false,'e nada esta congelado');
}},

{nome:'4.3 — a COR DO TECIDO e obrigatoria no item do pedido, e opcional no simulador',
 executar({igual,recusa,db}){
  limpar(db);
  const b=cena(), rev=revendaCom(1000,500);
  // No simulador ela e opcional: ali a cor so escreve o nome na frase.
  const simulada=persiana.calcular(Object.assign(peca(b),{cor_tecido_id:null}));
  igual(simulada.resumo.indexOf('Screen 1%')>=0,true,'o simulador calcula sem a cor');

  const p=pedido.criar({revenda_id:rev.id,tipo:'pedido'},DIRETOR);
  recusa(()=>pedido.acrescentarItem(p.id,Object.assign(peca(b),{cor_tecido_id:null}),DIRETOR),
    'cor_tecido_obrigatoria','no PEDIDO ela decide qual rolo sai da prateleira');
  igual(pedido.porId(p.id).itens.length,0,'e nada ficou gravado pela metade');

  const item=pedido.acrescentarItem(p.id,peca(b),DIRETOR);
  igual(item.tecido_id,b.item.id,'o item de tecido e RESOLVIDO e gravado no lancamento');
}},

{nome:'4.10 — o rascunho le o preco AO VIVO: reajuste hoje muda o orcamento de ontem',
 executar({igual,db}){
  limpar(db);
  const b=cena(), rev=revendaCom(1000,500);
  const p=comUmItem(rev);
  igual(p.preco.valor_total_centavos,20900,'R$ 209,00 — o exemplo da secao 4.8');

  catalogo.definirPrecoColecao(b.c1.id,12000,DIRETOR);
  const depois=pedido.porId(p.id);
  igual(depois.preco.valor_total_centavos,22400,
    'subiu junto: 1,500 × 120,00 = 180,00 + 44,00 de bando');
  catalogo.definirPrecoColecao(b.c1.id,11000,DIRETOR);
}},

/* ═══ 4.8 e 4.9 — O ENVIO CONGELA ═════════════════════════════════════════ */

{nome:'4.8 — o ENVIO congela numero, preco, tabela e prazo',
 executar({igual,db}){
  limpar(db);
  const rev=revendaCom(1000,500);
  const p=comUmItem(rev);
  const enviado=pedido.enviar(p.id,DIRETOR);

  igual(enviado.marco,'enviado','andou');
  igual(enviado.numero,4273,'o numero seguinte ao ultimo do Decorsoft');
  igual(enviado.preco.valor_total_centavos,20900,'o subtotal DECCORAR congelado');
  igual(enviado.preco.valor_revenda_centavos,17870,'e o que a revenda paga, em cascata');
  igual(enviado.preco.tabela.nome,'A','a tabela vai NOMEADA no pedido');
  igual(enviado.preco.tabela.desconto_centesimos,1000,'com o percentual daquele dia');
  igual(enviado.preco.desconto_centesimos,500,'e o desconto proprio da revenda');
  igual(enviado.congelado,true,'daqui em diante nao se rele nada');
  igual(!!enviado.prazo.prometido,true,'e o prazo foi prometido');
  igual(enviado.prazo.atual,enviado.prazo.prometido,'ainda sem negociacao');
}},

{nome:'4.8 — E DEPOIS DO ENVIO O PEDIDO NAO RELE O CATALOGO (nem o cadastro da revenda)',
 executar({igual,db}){
  limpar(db);
  const b=cena(), rev=revendaCom(1000,500);
  const p=comUmItem(rev);
  pedido.enviar(p.id,DIRETOR);

  /* O reajuste da quinta-feira. A armadilha #15 do CLAUDE.md e exatamente
     isto por outra porta: preco lido do cadastro na hora de mostrar faz o
     que ja foi vendido mudar de valor para tras, e o numero so fica maior. */
  catalogo.definirPrecoColecao(b.c1.id,20000,DIRETOR);
  revendas.definirDescontoTabela(revendas.tabelas()[0].id,5000,DIRETOR);
  revendas.editar(rev.id,{desconto_centesimos:0},DIRETOR);

  const depois=pedido.porId(p.id);
  igual(depois.preco.valor_total_centavos,20900,'o subtotal Deccorar e o do envio');
  igual(depois.preco.valor_revenda_centavos,17870,'e o da revenda tambem');
  igual(depois.preco.tabela.desconto_centesimos,1000,'a tabela gravada e a daquele dia');
  catalogo.definirPrecoColecao(b.c1.id,11000,DIRETOR);
}},

{nome:'4.9 — o prazo do envio e GRAVADO, e nao recalculado a cada leitura',
 executar({igual,db}){
  limpar(db);
  const rev=revendaCom(1000,500);
  const p=comUmItem(rev);
  // Envio na terca 22/09/2026 as 10:00 — o exemplo da secao 4.9.
  const enviado=pedido.enviar(p.id,DIRETOR,'2026-09-22 10:00');
  igual(enviado.prazo.prometido,'2026-10-01','quinta da semana seguinte');
  igual(enviado.prazo.prometido_extenso,'quinta 01/10','por extenso, para a tela nao traduzir');

  /* Mexer no calendario nao pode mudar um prazo ja prometido: quem recebeu a
     data foi a revenda, por escrito. */
  config.gravar('prazoSemanas','3',DIRETOR.nome);
  igual(pedido.porId(p.id).prazo.prometido,'2026-10-01','continua sendo o do envio');
  config.gravar('prazoSemanas','1',DIRETOR.nome);
}},

/* ═══ 4.18 — A NUMERACAO ══════════════════════════════════════════════════ */

{nome:'4.18 — ORCAMENTO NAO QUEIMA NUMERO: so o envio de um PEDIDO numera',
 executar({igual,recusa,db}){
  limpar(db);
  const b=cena(), rev=revendaCom(1000,500);
  const orc=pedido.criar({revenda_id:rev.id},DIRETOR);      // nasce orcamento
  pedido.acrescentarItem(orc.id,peca(b),DIRETOR);
  recusa(()=>pedido.enviar(orc.id,DIRETOR),'ainda_e_orcamento',
    'orcamento so simula — virar pedido e um ato, e ele fica registrado');

  const virou=pedido.virarPedido(orc.id,DIRETOR);
  igual(virou.tipo,'pedido','agora sim');
  igual(virou.numero,null,'e o numero SO nasce no envio');
  igual(pedido.enviar(orc.id,DIRETOR).numero,4273,'o primeiro numero desta casa');
}},

{nome:'4.18 — a numeracao comeca acima do Decorsoft e NUNCA DESCE',
 executar({igual,db}){
  limpar(db);
  const rev=revendaCom(1000,500);
  igual(pedido.enviar(comUmItem(rev).id,DIRETOR).numero,4273,'4272 + 1');
  igual(pedido.enviar(comUmItem(rev).id,DIRETOR).numero,4274,'e o seguinte');

  /* Alguem baixa o parametro — por engano, ou porque o Decorsoft foi
     desligado. O numero nao pode voltar: um 4275 novo colado num 4275 antigo
     faria o plano de corte herdar o TOM de um pedido de outra casa. */
  config.gravar('pedidoNumeroInicial','10',DIRETOR.nome);
  igual(pedido.enviar(comUmItem(rev).id,DIRETOR).numero,4275,'quem manda e o maior dos dois');
}},

{nome:'4.18 — e o envio e RECUSADO enquanto o numero inicial estiver em branco',
 executar({igual,recusa,db}){
  limpar(db);
  config.gravar('pedidoNumeroInicial','',DIRETOR.nome);
  const rev=revendaCom(1000,500);
  const p=comUmItem(rev);
  const e=recusa(()=>pedido.enviar(p.id,DIRETOR),'numero_inicial_em_branco',
    'em branco e "ainda nao se sabe", e chutar faria o numero parecer decidido');
  igual(e.mensagem.indexOf('Decorsoft')>=0,true,'e a recusa DIZ onde se lanca');
  igual(pedido.porId(p.id).marco,'rascunho','e o pedido nao andou');
}},

/* ═══ O QUE IMPEDE O ENVIO ════════════════════════════════════════════════ */

{nome:'regra 4 — sem preco em alguma linha, o envio RECUSA e NOMEIA o que falta',
 executar({igual,recusa,db}){
  limpar(db);
  const b=cena(), rev=revendaCom(1000,500);
  const p=pedido.criar({revenda_id:rev.id,tipo:'pedido'},DIRETOR);
  pedido.acrescentarItem(p.id,peca(b,{abertura_id:b.semPreco.id,cor_tecido_id:b.cor.id,
    adicional:'nenhum'}),DIRETOR);
  const e=recusa(()=>pedido.enviar(p.id,DIRETOR),'sem_preco',
    'congelar um total que nao existe seria gravar zero, e zero e um custo valido e mentiroso');
  igual(e.mensagem.indexOf('tecido')>=0,true,'a recusa nomeia a linha sem preco');
  igual(pedido.porId(p.id).numero,null,'e a recusa nao queimou numero');
}},

{nome:'4.12 — tabela SEM percentual tambem impede o envio, e nao vira "preco cheio"',
 executar({igual,recusa,db}){
  limpar(db);
  const rev=revendaCom(null,500);               // tabela em branco
  const p=comUmItem(rev);
  const e=recusa(()=>pedido.enviar(p.id,DIRETOR),'sem_preco',
    'em branco e "ainda nao se sabe" — cobrar cheio seria decidir por descuido');
  igual(e.mensagem.toLowerCase().indexOf('tabela')>=0,true,'e diz que e a tabela');
}},

{nome:'pedido sem item nenhum nao se envia',
 executar({recusa,db}){
  limpar(db);
  const rev=revendaCom(1000,500);
  const p=pedido.criar({revenda_id:rev.id,tipo:'pedido'},DIRETOR);
  recusa(()=>pedido.enviar(p.id,DIRETOR),'pedido_vazio','caixa vazia nao vai para fila nenhuma');
}},

/* ═══ O CICLO ═════════════════════════════════════════════════════════════ */

{nome:'o pedido enviado VOLTA a rascunho, e o reenvio recalcula preco e prazo',
 executar({igual,recusa,db}){
  limpar(db);
  const b=cena(), rev=revendaCom(1000,500);
  const p=comUmItem(rev);
  pedido.enviar(p.id,DIRETOR,'2026-09-22 10:00');
  recusa(()=>pedido.acrescentarItem(p.id,peca(b),DIRETOR),'pedido_enviado',
    'enviado nao se edita por cima: volta a rascunho primeiro, e isso fica registrado');

  pedido.reabrir(p.id,'a revenda pediu para trocar a cor',RENATO);
  const aberto=pedido.porId(p.id);
  igual(aberto.marco,'rascunho','voltou');
  igual(aberto.numero,4273,'MAS O NUMERO FICA — ele ja foi dito a revenda');
  igual(aberto.congelado,false,'e o preco volta a ser o de hoje');

  catalogo.definirPrecoColecao(b.c1.id,12000,DIRETOR);
  const dinovo=pedido.enviar(p.id,DIRETOR,'2026-09-22 10:00');
  igual(dinovo.preco.valor_total_centavos,22400,'o reenvio congela o preco de AGORA');
  igual(dinovo.numero,4273,'e nao tira numero novo');
  catalogo.definirPrecoColecao(b.c1.id,11000,DIRETOR);
}},

/* ═══ 4.11 — A APROVACAO EXPLODE E CONGELA A FICHA ════════════════════════ */

{nome:'4.11 — a aprovacao EXPLODE a ficha e grava cada componente com corte e consumo',
 executar({igual,db}){
  limpar(db);
  const rev=revendaCom(1000,500);
  const p=comUmItem(rev);
  pedido.enviar(p.id,DIRETOR);
  const ap=pedido.aprovar(p.id,RENATO);

  igual(ap.marco,'aprovado','andou');
  igual(ap.aprovado_por,'Renato','com quem aprovou');
  const comp=ap.itens[0].componentes;
  igual(comp.length>0,true,'a ficha virou linhas gravadas');
  const tuboComp=comp.find(c=>c.chave==='tubo');
  igual(tuboComp.largura_corte_mm,770,'tubo 0,770 (0,800 − 30 do Tubo 32)');
  const tec=comp.find(c=>c.chave==='tecido');
  igual(tec.largura_corte_mm,765,'tecido 0,765');
  igual(tec.altura_corte_mm,1400,'tecido 1,400 de altura');
  const kit=comp.find(c=>c.eh_kit);
  igual(!!kit.codigo_barras,true,'e o kit foi gravado com o codigo de barras dele');
}},

{nome:'4.11 — E DEPOIS DISSO MUDAR A ESCADA NAO MEXE NA PERSIANA APROVADA',
 executar({igual,db}){
  limpar(db);
  const b=cena(), rev=revendaCom(1000,500);
  const p=comUmItem(rev);
  pedido.enviar(p.id,DIRETOR);
  pedido.aprovar(p.id,RENATO);

  /* O desconto do tubo muda no cadastro — e a persiana aprovada continua
     sendo cortada como a etiqueta dela ja diz. Ficha relida ao vivo faria a
     etiqueta impressa e a tela discordarem, e na bancada vence a etiqueta. */
  const degrau=catalogo.modelo(b.m.id).degraus.find(d=>d.nome==='Tubo 32');
  catalogo.editarDegrau(degrau.id,Object.assign({},degrau,{desconto_mm:60}));

  const depois=pedido.porId(p.id);
  igual(depois.itens[0].componentes.find(c=>c.chave==='tubo').largura_corte_mm,770,
    'continua 0,770 — o pedido nao rele a ficha');
  igual(persiana.calcular(peca(b)).componentes.find(c=>c.chave==='tubo').largura_corte_mm,740,
    'enquanto o simulador, esse sim, ja corta pelo cadastro novo');
  catalogo.editarDegrau(degrau.id,Object.assign({},degrau,{desconto_mm:30}));
}},

{nome:'4.11 — o degrau que MUDA entre o envio e a aprovacao deixa registro, em vez de silencio',
 executar({igual,db}){
  limpar(db);
  const b=cena(), rev=revendaCom(1000,500);
  const p=comUmItem(rev);
  pedido.enviar(p.id,DIRETOR);

  // Alguem mexe na escada com o pedido na fila: o Tubo 32 deixa de alcancar
  // esta peca, e o tubo que a fabrica vai cortar nao e o que foi vendido.
  const d32=catalogo.modelo(b.m.id).degraus.find(x=>x.nome==='Tubo 32');
  catalogo.editarDegrau(d32.id,Object.assign({},d32,{largura_max_mm:700,m2_max_mm2:500000}));

  const ap=pedido.aprovar(p.id,RENATO);
  const reg=ap.alteracoes.find(a=>a.o_que==='degrau');
  igual(!!reg,true,'a troca do tubo entre o envio e a aprovacao vira LINHA, nao silencio');
  igual(reg.antes,'Tubo 32','de');
  igual(reg.depois!=='Tubo 32',true,'para outro');
  catalogo.editarDegrau(d32.id,Object.assign({},d32,{largura_max_mm:d32.largura_max_mm,
    m2_max_mm2:d32.m2_max_mm2}));
}},

/* ═══ 4.12 — QUEM APROVA ══════════════════════════════════════════════════ */

{nome:'4.12 — o vendedor so aprova o pedido da carteira DELE',
 executar({igual,recusa,db}){
  limpar(db);
  const rev=revendaCom(1000,500);               // carteira do Renato
  const p=comUmItem(rev);
  pedido.enviar(p.id,DIRETOR);
  recusa(()=>pedido.aprovar(p.id,BRUNA),'carteira_de_outro',
    'a Bruna nao responde por esta revenda');
  igual(pedido.porId(p.id).marco,'enviado','e o pedido continua na fila do Renato');
  igual(pedido.aprovar(p.id,RENATO).marco,'aprovado','o dono da carteira aprova');
}},

{nome:'4.12 — e o diretor aprova qualquer carteira (a fila nao pode parar por ferias)',
 executar({igual,db}){
  limpar(db);
  const rev=revendaCom(1000,500);
  const p=comUmItem(rev);
  pedido.enviar(p.id,DIRETOR);
  igual(pedido.aprovar(p.id,DIRETOR).marco,'aprovado','por chave, e nao por cargo escrito no if');
}},

{nome:'a fila do vendedor traz os enviados da carteira dele, com os dias de fabrica restantes',
 executar({igual,db}){
  limpar(db);
  const rev=revendaCom(1000,500);
  const meu=comUmItem(rev); pedido.enviar(meu.id,DIRETOR);

  const outra=revendas.criar({razao_social:'Outra LTDA',nome_fantasia:'Outra',
    tabela_id:revendas.tabelas()[0].id, desconto_centesimos:0},DIRETOR);
  revendas.definirVendedor(outra.id,9,DIRETOR);
  const alheio=comUmItem(revendas.porId(outra.id)); pedido.enviar(alheio.id,DIRETOR);

  const fila=pedido.fila(RENATO);
  igual(fila.length,1,'so a carteira dele');
  igual(fila[0].id,meu.id,'e e a dele mesmo');
  igual(typeof fila[0].dias_uteis_restantes,'number','com os dias de fabrica que sobram');
  igual(pedido.fila(DIRETOR).length,2,'o diretor ve a fila inteira');
}},

/* ═══ APROVADO E IMUTAVEL ═════════════════════════════════════════════════ */

{nome:'APROVADO NAO SE ALTERA, NEM PELO ADMIN — corrige-se cancelando e relancando',
 executar({igual,recusa,db}){
  limpar(db);
  const b=cena(), rev=revendaCom(1000,500);
  const p=comUmItem(rev);
  pedido.enviar(p.id,DIRETOR);
  pedido.aprovar(p.id,RENATO);

  recusa(()=>pedido.acrescentarItem(p.id,peca(b),DIRETOR),'pedido_aprovado','nem acrescentar');
  recusa(()=>pedido.editarItem(p.id,pedido.porId(p.id).itens[0].id,peca(b),DIRETOR),
    'pedido_aprovado','nem editar o item');
  recusa(()=>pedido.reabrir(p.id,'mudei de ideia',DIRETOR),'pedido_aprovado','nem reabrir');
  igual(pedido.porId(p.id).marco,'aprovado','continua de pe');
}},

{nome:'o item cancelado sai da conta e FICA na historia, com motivo e com quem',
 executar({igual,recusa,db}){
  limpar(db);
  const b=cena(), rev=revendaCom(1000,500);
  const p=pedido.criar({revenda_id:rev.id,tipo:'pedido'},DIRETOR);
  pedido.acrescentarItem(p.id,peca(b),DIRETOR);
  pedido.acrescentarItem(p.id,peca(b,{largura_mm:1000,altura_mm:1000,adicional:'nenhum'}),DIRETOR);
  pedido.enviar(p.id,DIRETOR);
  pedido.aprovar(p.id,RENATO);

  const item2=pedido.porId(p.id).itens[1];
  recusa(()=>pedido.cancelarItem(p.id,item2.id,'',DIRETOR),'motivo_obrigatorio',
    'cancelar sem dizer por que e apagar');
  pedido.cancelarItem(p.id,item2.id,'a revenda desistiu da segunda',DIRETOR);

  const depois=pedido.porId(p.id);
  igual(depois.itens.length,2,'a peca cancelada FICA na lista — historia nao se apaga');
  igual(depois.itens[1].cancelado_motivo,'a revenda desistiu da segunda','com o motivo');
  igual(depois.itens[1].cancelado_por,'Lucas','e com quem');
  igual(depois.preco.valor_total_centavos,20900,'e sai da conta: sobrou a primeira persiana');
}},

/* ═══ 4.9 — O PRAZO NEGOCIADO ═════════════════════════════════════════════ */

{nome:'4.9 — o prazo negociado NAO apaga o prometido, e a troca fica registrada',
 executar({igual,recusa,db}){
  limpar(db);
  const rev=revendaCom(1000,500);
  const p=comUmItem(rev);
  pedido.enviar(p.id,DIRETOR,'2026-09-22 10:00');

  recusa(()=>pedido.negociarPrazo(p.id,{para:'2026-10-15',motivo:''},RENATO),
    'motivo_obrigatorio','prazo que anda sem dizer por que vira ligacao da revenda');
  recusa(()=>pedido.negociarPrazo(p.id,{para:'2026-02-30',motivo:'x'},RENATO),
    'data_invalida','30 de fevereiro nao existe');

  pedido.negociarPrazo(p.id,{para:'2026-10-15',motivo:'tecido a caminho'},RENATO);
  const d=pedido.porId(p.id).prazo;
  igual(d.prometido,'2026-10-01','o PROMETIDO continua sendo o do envio');
  igual(d.atual,'2026-10-15','e o de hoje e o negociado');
  igual(d.negociado,true,'a tela sabe que houve negociacao');
  igual(d.historico[0].motivo,'tecido a caminho','com o motivo e o de/para');
  igual(d.historico[0].de,'2026-10-01','de');
}},

/* ═══ 4.10 — SEM TECIDO E SINAL, NUNCA TRAVA ══════════════════════════════ */

{nome:'4.10 — pedido de tecido que nao esta na fabrica ENTRA, marcado',
 executar({igual,db}){
  limpar(db);
  const b=cena(), rev=revendaCom(1000,500);
  const p=comUmItem(rev);
  const enviado=pedido.enviar(p.id,DIRETOR);
  igual(enviado.sem_tecido,1,'nao ha rolo desta cor: o pedido entra, e sai MARCADO');
  igual(!!enviado.itens[0].sem_tecido_motivo,true,'com o motivo escrito para o vendedor negociar');

  // Entra um rolo largo o bastante, e o sinal cala.
  rolo.entrada({tecido_id:b.item.id,largura:'3,00',metragem:'50',nivel_id:b.buraco()},'Diretor');
  const outro=comUmItem(rev);
  igual(pedido.enviar(outro.id,DIRETOR).sem_tecido,0,'com rolo na estante, nao ha o que avisar');
}},

/* ═══ SECAO 9 — O QUE NAO PODE SER QUEBRADO ═══════════════════════════════ */

{nome:'secao 9 — o SUBTOTAL DECCORAR nunca recebe o desconto da revenda',
 executar({igual,db}){
  limpar(db);
  const rev=revendaCom(1000,500);
  const p=comUmItem(rev);
  const e=pedido.enviar(p.id,DIRETOR);
  igual(e.preco.valor_total_centavos,20900,'o de cima e o da Deccorar');
  igual(e.preco.valor_revenda_centavos,17870,'o de baixo e o da revenda');
  igual(e.itens[0].valor_subtotal_centavos,20900,'e a mesma separacao dentro do item');
  igual(e.itens[0].valor_final_centavos,17870,'os dois lado a lado, nunca um no lugar do outro');
  igual(e.preco.valor_total_centavos!==e.preco.valor_revenda_centavos,true,
    'faturamento, Compras, credito e relatorio leem o de cima');
}},

{nome:'as linhas de preco ficam gravadas uma a uma — o PDF nao pede "confie no total"',
 executar({igual,db}){
  limpar(db);
  const rev=revendaCom(1000,500);
  const p=comUmItem(rev);
  const e=pedido.enviar(p.id,DIRETOR);
  const linhas=e.itens[0].linhas;
  igual(linhas.find(l=>l.chave==='tecido').valor_centavos,16500,'tecido R$ 165,00');
  igual(linhas.find(l=>l.chave==='bando').valor_centavos,4400,'bando R$ 44,00');
  igual(linhas.find(l=>l.chave==='tecido').base,'1,500 m² × R$ 110,00/m²',
    'com a conta escrita do lado, que e o que a revenda confere');
}},

{nome:'o pedido cancelado nao volta, e o cancelamento exige motivo',
 executar({igual,recusa,db}){
  limpar(db);
  const rev=revendaCom(1000,500);
  const p=comUmItem(rev);
  pedido.enviar(p.id,DIRETOR);
  recusa(()=>pedido.cancelar(p.id,'',DIRETOR),'motivo_obrigatorio','sem motivo, nao');
  pedido.cancelar(p.id,'a revenda desistiu',DIRETOR);
  igual(pedido.porId(p.id).marco,'cancelado','cancelado');
  recusa(()=>pedido.aprovar(p.id,RENATO),'pedido_cancelado','e nao se aprova o que foi cancelado');
}},

{nome:'cada passo deixa MARCO, com quem e quando',
 executar({igual,db}){
  limpar(db);
  const rev=revendaCom(1000,500);
  const p=comUmItem(rev);
  pedido.enviar(p.id,DIRETOR,'2026-09-22 10:00');
  pedido.reabrir(p.id,'trocar a cor',RENATO);
  pedido.enviar(p.id,DIRETOR,'2026-09-22 16:00');
  pedido.aprovar(p.id,RENATO);

  const m=pedido.porId(p.id).marcos.map(x=>x.marco);
  igual(m.join(' → '),'rascunho → enviado → rascunho → enviado → aprovado',
    'a historia inteira, e nao so o estado de agora');
  const ultimo=pedido.porId(p.id).marcos.slice(-1)[0];
  igual(ultimo.usuario_nome,'Renato','com quem deu o passo');
}},
/* ═══ A FOLHA QUE A REVENDA CONFERE ═══════════════════════════════════════ */

{nome:'a folha so sai do pedido ENVIADO — rascunho nao vira papel',
 async executar({igual,recusa,db}){
  limpar(db);
  const rev=revendaCom(1000,500);
  const p=comUmItem(rev);
  let erro=null;
  try{ await pdfPedido.gerar(pedido.porId(p.id)); }catch(e){ erro=e; }
  igual(erro&&erro.motivo,'pedido_nao_enviado',
    'no rascunho o preco ainda e o de hoje, e o papel viraria um compromisso que o sistema nao assumiu');

  pedido.enviar(p.id,DIRETOR);
  const folha=await pdfPedido.gerar(pedido.porId(p.id));
  igual(folha.arquivo.slice(0,5).toString(),'%PDF-','e depois do envio sai PDF de verdade');
  igual(folha.nome,'pedido-4273.pdf','com o numero no nome do arquivo');
}},

{nome:'⚠️ TEXTO QUE A FONTE DO PDF NAO CONHECE NAO DERRUBA A IMPRESSAO',
 async executar({igual,db}){
  limpar(db);
  const rev=revendaCom(1000,500);
  const p=pedido.criar({revenda_id:rev.id,tipo:'pedido',
    /* A observacao e campo livre, e quem digita cola do WhatsApp. Helvetica
       escreve em WinAnsi: o emoji e a seta nao existem la, e o `pdf-lib`
       estoura no meio da geracao — com a folha pela metade e sem dizer por
       que. Vira '?', e a folha sai. */
    observacao:'Entregar → portão 2 ✅ (medida conferida)'},DIRETOR);
  pedido.acrescentarItem(p.id,peca(cena()),DIRETOR);
  pedido.enviar(p.id,DIRETOR);
  const folha=await pdfPedido.gerar(pedido.porId(p.id));
  igual(folha.arquivo.slice(0,5).toString(),'%PDF-','a folha saiu inteira mesmo assim');
}}

];

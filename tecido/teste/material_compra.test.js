// O TUBO DO SOB MEDIDA CHEGANDO AO COMPRAS DO PCP — fase 4-C da spec
// SOBMEDIDA-PEDIDO-REVENDA.
//
// ⚠️ ESTE ARQUIVO FOI ESCRITO ANTES DO CODIGO. Risco vermelho da secao 0 do
// CLAUDE.md pede teste antes, e aqui o numero decide compra de material: o
// tubo da persiana sob medida e o MESMO tubo da medida padrao (decisao do
// dono, 24/09/2026), comprado do mesmo fornecedor, e ate hoje ninguem
// comprava por causa dele.
//
// O QUE ELE EXISTE PARA PROVAR:
//
//   1. E CONSUMO, NAO CORTE. Armadilha #18: os dois numeros da linha nunca
//      fecham, e o corte e o mais apertado — comprar por ele compra A MENOS.
//   2. A PECA SAI DA CONTA QUANDO A ETIQUETA DA SERRALHERIA E IMPRESSA.
//      Decisao do dono, 24/09/2026. E o evento mais proximo do tubo que
//      existe hoje (a linha do proprio tubo carimba impresso_em desde a
//      4-A); o bipe da bancada e a fase 5. Numero que so sobe vira numero
//      que a equipe aprende a ignorar.
//   3. DEGRAU SEM MATERIAL APONTADO NAO VIRA ZERO. Sai como pendencia com o
//      nome do degrau — e a regra 4 do custo (indefinido nunca vira zero),
//      e e o que faz o comprador saber que a lista esta incompleta.
//   4. O TUBO LIGA NO DEGRAU, nunca no componente: o material MUDA com o
//      degrau (Tubo 32 e Tubo 41 sao itens de estoque diferentes). Duas
//      afirmacoes sobre o mesmo fato divergem no primeiro dia.
const consumo=require('../dominio/consumo');
const pedido=require('../dominio/pedido');
const etq=require('../dominio/etiqueta_producao');
const revendas=require('../dominio/revenda');
const catalogo=require('../dominio/catalogo_sm');
const tecidoDom=require('../dominio/tecido');
const config=require('../nucleo/config');
const pessoas=require('../nucleo/pessoas');
const materiais=require('../nucleo/materiais');

const DO_PCP=[{id:7,nome:'Renato'}];
const RENATO ={id:7,nome:'Renato',papel:'vendedor'};
const DIRETOR={id:1,nome:'Lucas', papel:'diretor'};

// A LISTA DE MATERIAIS DO PCP, como ela atravessa a porta: id, nome, unidade.
// E so isso que o sob medida precisa saber — preco, estoque e fornecedor sao
// assunto de la, e o que nao atravessa nao vaza.
let DO_COMPRAS=[];
const TUBO32={id:101,nome:'Tubo 32 mm',      unidade:'m'};
const TUBO41={id:104,nome:'Tubo 41 mm',      unidade:'m'};
const BASE  ={id:107,nome:'Base redonda branca',unidade:'m'};
const TAMPA ={id:109,nome:'Tampa base redonda',unidade:'un'};
const GRAXA ={id:120,nome:'Graxa',           unidade:'kg'};

let base=null;
function cena(){
  if(base) return base;
  pessoas.ligar(()=>DO_PCP);
  materiais.ligar(()=>DO_COMPRAS);
  const l=tecidoDom.criarLinha({nome:'Rolô'});
  const screen=tecidoDom.criarAbertura({nome:'Screen 1%',linha_id:l.id});
  const branco=tecidoDom.criarCor({nome:'Branco'});
  tecidoDom.criarTecido({linha_id:l.id,abertura_id:screen.id,cor_id:branco.id});
  const m=catalogo.modeloPorNome('Rolô');
  catalogo.ligarColecao({modelo_id:m.id,abertura_id:screen.id,
    preco_m2_centavos:11000,largura_max_mm:2800});
  catalogo.ligarCorAcessorio({modelo_id:m.id,cor_id:branco.id});
  base={m,screen,branco};
  return base;
}

const degrauPorNome=nome=>catalogo.modelo(cena().m.id).degraus.find(d=>d.nome===nome);
const compPorChave =chave=>catalogo.listarComponentes().find(c=>c.chave===chave);

function peca(extra){
  const b=cena();
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
  db.prepare('UPDATE sm_setor SET ultimo_numero=0').run();
  db.prepare('UPDATE sm_degrau_tubo SET componente_id=NULL').run();
  db.prepare('UPDATE sm_componente SET componente_id=NULL').run();
  db.prepare('UPDATE sm_tabela_preco SET desconto_centesimos=NULL').run();
  config.gravar('pedidoNumeroInicial','5000','teste');
  DO_COMPRAS=[TUBO32,TUBO41,BASE,TAMPA,GRAXA];
  materiais.ligar(()=>DO_COMPRAS);
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
function aprovado(pecas){
  const p=pedido.criar({revenda_id:revendaCom().id,tipo:'pedido'},DIRETOR);
  (pecas||[{}]).forEach(x=>pedido.acrescentarItem(p.id,peca(x),DIRETOR));
  pedido.enviar(p.id,DIRETOR,'2026-09-22 10:00');
  return pedido.aprovar(p.id,RENATO);
}

// Acha a linha de um material no resultado. Devolve null em vez de estourar:
// "nao esta la" e uma resposta que varios casos precisam afirmar.
const doMaterial=(r,id)=>r.materiais.find(m=>m.componente_id===id)||null;

module.exports=[

// ── 1. A PORTA ──────────────────────────────────────────────────────────
{nome:'sem a porta de materiais ligada, RECUSA — nunca lista vazia',
 executar({db,recusa}){
  limpar(db);
  materiais.ligar(null);
  recusa(()=>consumo.materialDeCompra(),'porta_de_materiais_nao_ligada');
  materiais.ligar(()=>DO_COMPRAS);
}},

{nome:'a porta entrega id, nome e unidade — e nada mais',
 executar({db,igual}){
  limpar(db);
  materiais.ligar(()=>[{id:101,nome:'Tubo 32 mm',unidade:'m',
    preco:66.13, fornecedor:'JP', estoque:1200}]);
  const m=materiais.listar()[0];
  igual(Object.keys(m).sort().join(','),'id,nome,unidade','campos que atravessam');
  materiais.ligar(()=>DO_COMPRAS);
}},

// ── 2. O VINCULO ────────────────────────────────────────────────────────
{nome:'ligar o degrau ao material do PCP grava e volta na leitura',
 executar({db,igual}){
  limpar(db);
  const d=degrauPorNome('Tubo 32');
  const r=catalogo.ligarMaterialDoDegrau(d.id,TUBO32.id,DIRETOR);
  igual(r.componente_id,TUBO32.id,'gravado');
  igual(degrauPorNome('Tubo 32').componente_id,TUBO32.id,'relido');
}},

{nome:'o TUBO liga no degrau, nunca no componente — o material muda com o degrau',
 executar({db,recusa}){
  limpar(db);
  recusa(()=>catalogo.ligarMaterialDoComponente(compPorChave('tubo').id,TUBO32.id,DIRETOR),
    'tubo_liga_no_degrau');
}},

{nome:'material que nao existe na lista do PCP e recusado',
 executar({db,recusa}){
  limpar(db);
  recusa(()=>catalogo.ligarMaterialDoDegrau(degrauPorNome('Tubo 32').id,999,DIRETOR),
    'material_inexistente');
}},

{nome:'unidade que a peca nao sabe dizer (kg) e recusada, NOMEANDO a unidade',
 executar({db,recusa}){
  limpar(db);
  const e=recusa(()=>catalogo.ligarMaterialDoDegrau(degrauPorNome('Tubo 32').id,GRAXA.id,DIRETOR),
    'unidade_nao_suportada');
  if(String(e.mensagem).indexOf('kg')<0)
    throw new Error('a recusa tem que dizer qual unidade: '+e.mensagem);
}},

{nome:'componente que NAO gera etiqueta e recusado — nada o tiraria da conta depois',
 executar({db,recusa}){
  limpar(db);
  // O kit nao gera etiqueta de producao (gera_etiqueta=0 na semente).
  recusa(()=>catalogo.ligarMaterialDoComponente(compPorChave('kit_tradicional').id,TAMPA.id,DIRETOR),
    'componente_sem_etiqueta');
}},

{nome:'peca que se mede por largura E altura nao vira metro linear',
 executar({db,recusa}){
  limpar(db);
  // O tecido e um retangulo — e por decisao do dono ele nem vai ao Compras do PCP.
  recusa(()=>catalogo.ligarMaterialDoComponente(compPorChave('tecido').id,BASE.id,DIRETOR),
    'peca_e_retangulo');
}},

{nome:'componente sem medida nenhuma nao vira material comprado em METRO',
 executar({db,recusa}){
  limpar(db);
  recusa(()=>catalogo.ligarMaterialDoComponente(compPorChave('montagem').id,BASE.id,DIRETOR),
    'sem_medida_para_metro');
}},

{nome:'desligar o material do degrau e um caminho de volta que existe',
 executar({db,igual}){
  limpar(db);
  const d=degrauPorNome('Tubo 32');
  catalogo.ligarMaterialDoDegrau(d.id,TUBO32.id,DIRETOR);
  catalogo.ligarMaterialDoDegrau(d.id,null,DIRETOR);
  igual(degrauPorNome('Tubo 32').componente_id,null,'desligado');
}},

// ── 3. A CONTA ──────────────────────────────────────────────────────────
{nome:'uma persiana de 1,000 x 1,000 consome 0,970 m do Tubo 32',
 executar({db,igual,perto}){
  limpar(db);
  catalogo.ligarMaterialDoDegrau(degrauPorNome('Tubo 32').id,TUBO32.id,DIRETOR);
  aprovado([{}]);
  const r=consumo.materialDeCompra();
  const t=doMaterial(r,TUBO32.id);
  if(!t) throw new Error('o Tubo 32 tem que aparecer');
  perto(t.quantidade,0.97,'consumo em metros');
  igual(t.unidade,'m','unidade');
  igual(t.pecas,1,'pecas');
}},

{nome:'duas persianas somam, e a origem diz de que pedido vieram',
 executar({db,igual,perto}){
  limpar(db);
  catalogo.ligarMaterialDoDegrau(degrauPorNome('Tubo 32').id,TUBO32.id,DIRETOR);
  const p=aprovado([{},{}]);
  const t=doMaterial(consumo.materialDeCompra(),TUBO32.id);
  perto(t.quantidade,1.94,'0,970 x 2');
  igual(t.pecas,2,'pecas');
  igual(t.origem.length,1,'um pedido');
  igual(t.origem[0].numero,p.numero,'o numero do pedido');
  perto(t.origem[0].quantidade,1.94,'a origem soma o mesmo');
}},

{nome:'dois pedidos do mesmo degrau somam, com duas origens',
 executar({db,igual,perto}){
  limpar(db);
  catalogo.ligarMaterialDoDegrau(degrauPorNome('Tubo 32').id,TUBO32.id,DIRETOR);
  aprovado([{}]); aprovado([{}]);
  const t=doMaterial(consumo.materialDeCompra(),TUBO32.id);
  perto(t.quantidade,1.94,'soma dos dois pedidos');
  igual(t.origem.length,2,'duas origens');
}},

{nome:'a soma do material bate com a soma das origens',
 executar({db,perto}){
  limpar(db);
  catalogo.ligarMaterialDoDegrau(degrauPorNome('Tubo 32').id,TUBO32.id,DIRETOR);
  aprovado([{},{}]); aprovado([{}]);
  const t=doMaterial(consumo.materialDeCompra(),TUBO32.id);
  perto(t.origem.reduce((s,o)=>s+o.quantidade,0),t.quantidade,'origens x total');
}},

{nome:'degraus diferentes sao MATERIAIS diferentes — 1,000 vai no 32 e 2,000 no 41',
 executar({db,perto}){
  limpar(db);
  catalogo.ligarMaterialDoDegrau(degrauPorNome('Tubo 32').id,TUBO32.id,DIRETOR);
  catalogo.ligarMaterialDoDegrau(degrauPorNome('Tubo 41').id,TUBO41.id,DIRETOR);
  aprovado([{},{largura_mm:2000,altura_mm:2000}]);
  const r=consumo.materialDeCompra();
  perto(doMaterial(r,TUBO32.id).quantidade,0.97, 'Tubo 32');
  perto(doMaterial(r,TUBO41.id).quantidade,1.96, 'Tubo 41 = 2,000 - 40');
}},

{nome:'componente com medida (a base) entra junto, no material dele',
 executar({db,perto}){
  limpar(db);
  catalogo.ligarMaterialDoDegrau(degrauPorNome('Tubo 32').id,TUBO32.id,DIRETOR);
  catalogo.ligarMaterialDoComponente(compPorChave('base').id,BASE.id,DIRETOR);
  aprovado([{}]);
  const r=consumo.materialDeCompra();
  perto(doMaterial(r,TUBO32.id).quantidade,0.97,'tubo');
  // base = tecido + 5 = (tubo - 5) + 5 = 0,970
  perto(doMaterial(r,BASE.id).quantidade,0.97,'base redonda');
}},

{nome:'material em UNIDADE conta pecas, nunca medida',
 executar({db,igual}){
  limpar(db);
  catalogo.ligarMaterialDoComponente(compPorChave('montagem').id,TAMPA.id,DIRETOR);
  aprovado([{},{}]);
  const t=doMaterial(consumo.materialDeCompra(),TAMPA.id);
  igual(t.unidade,'un','unidade');
  igual(t.quantidade,2,'duas pecas, duas unidades');
}},

// ── 4. E CONSUMO, NAO CORTE (armadilha #18) ─────────────────────────────
{nome:'dobrar a medida de CORTE nao mexe num milimetro do que se compra',
 executar({db,perto}){
  limpar(db);
  catalogo.ligarMaterialDoDegrau(degrauPorNome('Tubo 32').id,TUBO32.id,DIRETOR);
  aprovado([{}]);
  const antes=doMaterial(consumo.materialDeCompra(),TUBO32.id).quantidade;
  db.prepare("UPDATE sm_pedido_componente SET largura_corte_mm=largura_corte_mm*2 WHERE chave='tubo'").run();
  perto(doMaterial(consumo.materialDeCompra(),TUBO32.id).quantidade,antes,'o corte nao entra');
  perto(antes,0.97,'e o consumo continua o consumo');
}},

// ── 5. A PECA SAI DA CONTA QUANDO A ETIQUETA DA SERRALHERIA E IMPRESSA ──
{nome:'imprimir o maco da serralheria tira aquela peca da conta',
 executar({db,igual,perto}){
  limpar(db);
  catalogo.ligarMaterialDoDegrau(degrauPorNome('Tubo 32').id,TUBO32.id,DIRETOR);
  const p=aprovado([{},{}]);
  perto(doMaterial(consumo.materialDeCompra(),TUBO32.id).quantidade,1.94,'antes');
  etq.imprimir({pedidos:[p.id],setor:'serralheria'},DIRETOR);
  igual(doMaterial(consumo.materialDeCompra(),TUBO32.id),null,'depois: nada a comprar');
}},

{nome:'reimprimir nao muda nada — o papel repetido nao produz peca nova',
 executar({db,igual}){
  limpar(db);
  catalogo.ligarMaterialDoDegrau(degrauPorNome('Tubo 32').id,TUBO32.id,DIRETOR);
  const p=aprovado([{}]);
  etq.imprimir({pedidos:[p.id],setor:'serralheria'},DIRETOR);
  etq.imprimir({pedidos:[p.id],setor:'serralheria'},DIRETOR);
  igual(doMaterial(consumo.materialDeCompra(),TUBO32.id),null,'continua fora, sem dobrar nada');
}},

{nome:'imprimir a etiqueta da COLECAO nao baixa o tubo — a baixa e da linha dele',
 executar({db,perto}){
  limpar(db);
  catalogo.ligarMaterialDoDegrau(degrauPorNome('Tubo 32').id,TUBO32.id,DIRETOR);
  const p=aprovado([{}]);
  etq.imprimir({pedidos:[p.id],setor:'colecao'},DIRETOR);
  perto(doMaterial(consumo.materialDeCompra(),TUBO32.id).quantidade,0.97,'o tubo continua a comprar');
}},

{nome:'so a peca impressa sai — a irma do mesmo pedido continua',
 executar({db,perto}){
  limpar(db);
  catalogo.ligarMaterialDoDegrau(degrauPorNome('Tubo 32').id,TUBO32.id,DIRETOR);
  const p=aprovado([{},{}]);
  const um=db.prepare("SELECT id FROM sm_pedido_componente WHERE chave='tubo' LIMIT 1").get();
  db.prepare("UPDATE sm_pedido_componente SET impresso_em='2026-09-24 09:00' WHERE id=?").run(um.id);
  perto(doMaterial(consumo.materialDeCompra(),TUBO32.id).quantidade,0.97,'sobra uma');
}},

// ── 6. QUEM NAO CONTA ───────────────────────────────────────────────────
{nome:'pedido ENVIADO e nao aprovado nao conta — a ficha ainda nao foi explodida',
 executar({db,igual}){
  limpar(db);
  catalogo.ligarMaterialDoDegrau(degrauPorNome('Tubo 32').id,TUBO32.id,DIRETOR);
  const p=pedido.criar({revenda_id:revendaCom().id,tipo:'pedido'},DIRETOR);
  pedido.acrescentarItem(p.id,peca(),DIRETOR);
  pedido.enviar(p.id,DIRETOR,'2026-09-22 10:00');
  igual(doMaterial(consumo.materialDeCompra(),TUBO32.id),null,'enviado nao conta');
}},

{nome:'peca cancelada sai da conta',
 executar({db,igual,perto}){
  limpar(db);
  catalogo.ligarMaterialDoDegrau(degrauPorNome('Tubo 32').id,TUBO32.id,DIRETOR);
  const p=aprovado([{},{}]);
  const itens=db.prepare('SELECT id FROM sm_pedido_item WHERE pedido_id=? ORDER BY n').all(p.id);
  pedido.cancelarItem(p.id,itens[0].id,'cliente desistiu',DIRETOR);
  perto(doMaterial(consumo.materialDeCompra(),TUBO32.id).quantidade,0.97,'sobra uma');
}},

// ── 7. PENDENCIA NUNCA VIRA ZERO (regra 4) ──────────────────────────────
{nome:'degrau sem material apontado vira PENDENCIA com o nome do degrau',
 executar({db,igual}){
  limpar(db);
  aprovado([{}]);
  const r=consumo.materialDeCompra();
  igual(r.materiais.length,0,'nada a comprar ainda');
  igual(r.pendencias.length,1,'uma pendencia');
  if(String(r.pendencias[0].motivo).indexOf('Tubo 32')<0)
    throw new Error('a pendencia tem que dizer qual degrau: '+r.pendencias[0].motivo);
}},

{nome:'o que esta ligado SOMA e o que falta vira pendencia — na mesma resposta',
 executar({db,igual,perto}){
  limpar(db);
  catalogo.ligarMaterialDoDegrau(degrauPorNome('Tubo 32').id,TUBO32.id,DIRETOR);
  aprovado([{},{largura_mm:2000,altura_mm:2000}]);   // o 41 nao esta ligado
  const r=consumo.materialDeCompra();
  perto(doMaterial(r,TUBO32.id).quantidade,0.97,'o 32 soma');
  igual(doMaterial(r,TUBO41.id),null,'o 41 nao soma');
  igual(r.pendencias.length,1,'uma pendencia');
  if(String(r.pendencias[0].motivo).indexOf('Tubo 41')<0)
    throw new Error('a pendencia tem que nomear o Tubo 41: '+r.pendencias[0].motivo);
}},

{nome:'material apagado do PCP depois de ligado vira pendencia, nunca some em silencio',
 executar({db,igual}){
  limpar(db);
  catalogo.ligarMaterialDoDegrau(degrauPorNome('Tubo 32').id,TUBO32.id,DIRETOR);
  aprovado([{}]);
  DO_COMPRAS=DO_COMPRAS.filter(m=>m.id!==TUBO32.id);
  const r=consumo.materialDeCompra();
  igual(r.materiais.length,0,'nao soma no escuro');
  igual(r.pendencias.length,1,'vira pendencia');
}},

{nome:'degrau renomeado depois do pedido vira pendencia com o nome congelado',
 executar({db,igual}){
  limpar(db);
  catalogo.ligarMaterialDoDegrau(degrauPorNome('Tubo 32').id,TUBO32.id,DIRETOR);
  aprovado([{}]);
  catalogo.editarDegrau(degrauPorNome('Tubo 32').id,{nome:'Tubo 32 mm'});
  const r=consumo.materialDeCompra();
  igual(r.materiais.length,0,'nao soma por adivinhacao');
  if(String(r.pendencias[0].motivo).indexOf('Tubo 32')<0)
    throw new Error('a pendencia diz o nome que o pedido congelou: '+r.pendencias[0].motivo);
}},

{nome:'a pendencia diz de que pedido e de que peca ela e',
 executar({db,igual}){
  limpar(db);
  const p=aprovado([{}]);
  const x=consumo.materialDeCompra().pendencias[0];
  igual(x.numero,p.numero,'o numero do pedido');
  igual(x.item_n,1,'a peca');
}},

{nome:'peca ja impressa na serralheria nao vira pendencia — ela nem esta mais na conta',
 executar({db,igual}){
  limpar(db);
  const p=aprovado([{}]);          // sem degrau ligado: seria pendencia
  etq.imprimir({pedidos:[p.id],setor:'serralheria'},DIRETOR);
  igual(consumo.materialDeCompra().pendencias.length,0,'nao cobra o que ja saiu');
}}

];

// A PRODUCAO BIPADA — secao 4.15 da spec SOBMEDIDA-PEDIDO-REVENDA.
//
// ⚠️ ESTE ARQUIVO FOI ESCRITO ANTES DO `dominio/producao.js`, e de proposito:
// risco vermelho da secao 0 do CLAUDE.md pede teste antes do codigo. As
// liberacoes daqui saem do desenho da spec, nao do que o codigo devolveu.
//
//   SERRALHERIA: tubo · base ─┐
//   COLECAO: tecido ──────────┴─▶ MONTAGEM ─▶ REVISAO ─▶ EMBALAGEM ─▶ PRONTO
//   SERRALHERIA: bandô · barra ──────────────────────────────▲
//
// O QUE ESTE ARQUIVO EXISTE PARA PROVAR, em duas frases:
//
//   1. A FILA SO MOSTRA O QUE JA PODE SER FEITO. Montagem que aparece antes
//      do tecido ficar pronto manda alguem montar uma persiana que nao tem
//      tecido — e a peca volta para a bancada com o trabalho desfeito.
//   2. "NAO APARECE" NUNCA VIRA "NINGUEM SABE POR QUE". Bipar um codigo que
//      ainda nao foi liberado RESPONDE o que o segura, com quem e quando.
//      Trava que prende sem explicar e a armadilha #6.
const pedido=require('../dominio/pedido');
const revendas=require('../dominio/revenda');
const catalogo=require('../dominio/catalogo_sm');
const tecido=require('../dominio/tecido');
const config=require('../nucleo/config');
const pessoas=require('../nucleo/pessoas');

/* ⚠️ Funcao que ainda nao existe tem que dar VERMELHO, nunca derrubar a
   rodada: suite que morre no meio faz o defeito aparecer como "travou" em vez
   de falhar, e os casos de baixo nunca rodam. E a licao do teste_componentes
   do PCP (§7-B, armadilha #33). */
let prod=null;
try{ prod=require('../dominio/producao'); }catch(e){ prod=null; }
const chamar=(metodo,...args)=>{
  if(!prod||typeof prod[metodo]!=='function')
    throw new Error('dominio/producao.js nao expoe '+metodo+'()');
  return prod[metodo](...args);
};

const DO_PCP=[{id:7, nome:'Renato'}];
const RENATO ={id:7, nome:'Renato', papel:'vendedor'};
const DIRETOR={id:1, nome:'Lucas',  papel:'diretor', setores:['serralheria','colecao','montagem','revisao','embalagem']};
// Gente de bancada: papel `producao`, e SO o setor dela (fase 5-A).
const banca=(nome,...setores)=>({id:90+setores.length, nome, papel:'producao', setores});
const SERRA =banca('Joao','serralheria');
const COLE  =banca('Maria','colecao');
const MONTA =banca('Pedro','montagem');
const REVIS =banca('Ana','revisao');
const EMBAL =banca('Bia','embalagem');

let base=null;
function cena(){
  if(base) return base;
  pessoas.ligar(()=>DO_PCP);
  const l=tecido.criarLinha({nome:'Rolô'});
  const screen1=tecido.criarAbertura({nome:'Screen 1%',linha_id:l.id});
  const branco=tecido.criarCor({nome:'Branco'});
  const tBranco=tecido.criarTecido({linha_id:l.id,abertura_id:screen1.id,cor_id:branco.id});
  const m=catalogo.modeloPorNome('Rolô');
  catalogo.ligarColecao({modelo_id:m.id, abertura_id:screen1.id,
    preco_m2_centavos:11000, largura_max_mm:2800});
  catalogo.ligarCorAcessorio({modelo_id:m.id, cor_id:branco.id});
  base={m, screen1, branco, tBranco};
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
  /* ⚠️ A ORDEM E A DOS PONTEIROS, e a `sm_pendencia` aponta para o
     COMPONENTE — entao ela sai antes dele, e nao junto dos registros que so
     apontam para o pedido. Com `foreign_keys = ON` o DELETE sem filtro so
     passa quando ninguem mais aponta (§12 do CLAUDE.md), e foi assim que
     esta limpeza reprovou 12 casos na primeira rodada: o defeito aparecia
     como "FOREIGN KEY constraint failed" em casos que nao tinham nada a ver
     com pendencia. E a mesma pegadinha que o `sm_pedido_alteracao` pregou na
     fase 3. */
  try{ db.prepare('DELETE FROM sm_pendencia').run(); }catch(e){}
  for(const t of ['sm_pedido_componente','sm_pedido_item_preco','sm_pedido_alteracao',
                  'sm_pedido_marco','sm_pedido_prazo','sm_pedido_item','sm_pedido',
                  'sm_etiqueta_impressao'])
    db.prepare('DELETE FROM '+t).run();
  db.prepare('DELETE FROM sm_revenda').run();
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

function aprovado(pecas){
  const b=cena();
  const p=pedido.criar({revenda_id:revendaCom().id, tipo:'pedido'},DIRETOR);
  (pecas||[{}]).forEach(x=>pedido.acrescentarItem(p.id,peca(b,x),DIRETOR));
  pedido.enviar(p.id,DIRETOR,'2026-09-22 10:00');
  return pedido.aprovar(p.id,RENATO);
}

// O codigo de etiqueta de um componente, pela chave, no item n (1-based).
const cod=(p,chave,n)=>{
  const item=p.itens[(n||1)-1];
  const c=item.componentes.find(x=>x.chave===chave);
  return c&&c.codigo_etiqueta;
};
// Leva um componente de ponta a ponta: dois bipes.
const fazer=(p,chave,quem,n)=>{
  const c=cod(p,chave,n);
  chamar('bipar',c,quem); return chamar('bipar',c,quem);
};
const naFila=(setor,quem)=>chamar('fila',setor,quem).map(x=>x.codigo);

module.exports=[

/* ═══ 1. A FILA SO MOSTRA O QUE JA PODE SER FEITO ═════════════════════════ */

{nome:'4.15 — serralheria e colecao aparecem assim que o pedido e APROVADO',
 executar({igual,db}){
  limpar(db);
  const p=aprovado();
  /* Os dois trabalham EM PARALELO: nenhum espera o outro. */
  const ser=naFila('serralheria',SERRA), col=naFila('colecao',COLE);
  igual(ser.includes(cod(p,'tubo')),true,'o tubo esta na serralheria');
  igual(ser.includes(cod(p,'base')),true,'a base tambem');
  igual(col.includes(cod(p,'tecido')),true,'o tecido esta na colecao');
  igual(col.length,1,'e a colecao so tem o tecido');
 }},

{nome:'4.15 — a MONTAGEM nao aparece enquanto tubo, base e tecido nao terminam',
 executar({igual,db}){
  limpar(db);
  const p=aprovado();
  const oMontagem=cod(p,'montagem');
  igual(naFila('montagem',MONTA).includes(oMontagem),false,'ainda nao');
  fazer(p,'tubo',SERRA);
  igual(naFila('montagem',MONTA).includes(oMontagem),false,'so com o tubo, ainda nao');
  fazer(p,'base',SERRA);
  igual(naFila('montagem',MONTA).includes(oMontagem),false,'falta o tecido');
  fazer(p,'tecido',COLE);
  igual(naFila('montagem',MONTA).includes(oMontagem),true,'agora sim');
 }},

{nome:'4.15 — revisao espera a montagem, e embalagem espera a revisao',
 executar({igual,db}){
  limpar(db);
  const p=aprovado();
  ['tubo','base'].forEach(c=>fazer(p,c,SERRA)); fazer(p,'tecido',COLE);
  igual(naFila('revisao',REVIS).includes(cod(p,'revisao')),false,'revisao ainda nao');
  fazer(p,'montagem',MONTA);
  igual(naFila('revisao',REVIS).includes(cod(p,'revisao')),true,'revisao liberada');
  igual(naFila('embalagem',EMBAL).includes(cod(p,'embalagem')),false,'embalagem ainda nao');
  fazer(p,'revisao',REVIS);
  igual(naFila('embalagem',EMBAL).includes(cod(p,'embalagem')),true,'embalagem liberada');
 }},

/* ═══ 2. BANDO E BARRA — O CASO QUE A SPEC FAZ QUESTAO DE SEPARAR ═════════ */

{nome:'4.15 — o BANDO nao segura a montagem: ele e da caixa, nao do conjunto',
 executar({igual,db}){
  limpar(db);
  const p=aprovado([{adicional:'bando'}]);
  igual(!!cod(p,'bando'),true,'a peca tem bandô');
  ['tubo','base'].forEach(c=>fazer(p,c,SERRA)); fazer(p,'tecido',COLE);
  /* O bandô continua ABERTO, e mesmo assim a montagem anda. Fazer o contrario
     pararia a linha inteira por uma peca que so entra na hora de fechar a
     caixa. */
  igual(naFila('montagem',MONTA).includes(cod(p,'montagem')),true,'a montagem anda');
 }},

{nome:'4.15 — mas o BANDO SEGURA a embalagem, porque vai junto na caixa',
 executar({igual,db}){
  limpar(db);
  const p=aprovado([{adicional:'bando'}]);
  ['tubo','base'].forEach(c=>fazer(p,c,SERRA)); fazer(p,'tecido',COLE);
  fazer(p,'montagem',MONTA); fazer(p,'revisao',REVIS);
  igual(naFila('embalagem',EMBAL).includes(cod(p,'embalagem')),false,'o bandô ainda segura');
  fazer(p,'bando',SERRA);
  igual(naFila('embalagem',EMBAL).includes(cod(p,'embalagem')),true,'agora libera');
 }},

{nome:'4.15 — a peca SEM adicional nao espera bandô nenhum',
 executar({igual,db}){
  limpar(db);
  const p=aprovado();
  igual(!!cod(p,'bando'),false,'nao ha bandô nesta peca');
  ['tubo','base'].forEach(c=>fazer(p,c,SERRA)); fazer(p,'tecido',COLE);
  fazer(p,'montagem',MONTA); fazer(p,'revisao',REVIS);
  igual(naFila('embalagem',EMBAL).includes(cod(p,'embalagem')),true,'libera direto');
 }},

/* ═══ 3. O BIPE — INICIO E FIM, E QUEM FEZ ═══════════════════════════════ */

{nome:'4.15 — o primeiro bipe INICIA e o segundo TERMINA, e os dois gravam quem',
 executar({igual,db}){
  limpar(db);
  const p=aprovado();
  const c=cod(p,'tubo');
  const a=chamar('bipar',c,SERRA);
  igual(a.acao,'iniciado','o primeiro bipe');
  const b=chamar('bipar',c,SERRA);
  igual(b.acao,'terminado','o segundo');
  const linha=db.prepare('SELECT * FROM sm_pedido_componente WHERE codigo_etiqueta=?').get(c);
  igual(linha.iniciado_por,'Joao','quem iniciou');
  igual(linha.terminado_por,'Joao','quem terminou');
  igual(!!linha.iniciado_em,true,'a hora de inicio ficou');
  igual(!!linha.terminado_em,true,'e a de fim');
 }},

{nome:'4.15 — bipar o que JA terminou e recusado, e a recusa diz quem fez',
 executar({igual,recusa,db}){
  limpar(db);
  const p=aprovado();
  const c=cod(p,'tubo');
  fazer(p,'tubo',SERRA);
  const e=recusa(()=>chamar('bipar',c,SERRA),'ja_terminado','terceiro bipe');
  igual(/Joao/.test(e.mensagem),true,'a frase nomeia quem fez: '+e.mensagem);
 }},

{nome:'4.15 — o codigo que nao existe recusa DIZENDO isso, e nao em silencio',
 executar({recusa,db}){
  limpar(db);
  aprovado();
  recusa(()=>chamar('bipar','SER-999999',SERRA),'codigo_desconhecido','codigo inventado');
 }},

{nome:'4.15 — quem nao e do setor nao bipa a bancada do outro',
 executar({recusa,db}){
  limpar(db);
  const p=aprovado();
  /* A colecao nao bipa o tubo. O bipe grava QUEM FEZ, e e por ele que a
     recusa da 5-B vai achar a pessoa certa — regua que aponta o inocente e
     pior que regua nenhuma. */
  recusa(()=>chamar('bipar',cod(p,'tubo'),COLE),'setor_errado','a colecao bipando a serralheria');
 }},

{nome:'4.15 — o DIRETOR bipa os cinco, por coerencia com o `*` das chaves dele',
 executar({igual,db}){
  limpar(db);
  const p=aprovado();
  igual(chamar('bipar',cod(p,'tubo'),DIRETOR).acao,'iniciado','o dono na serralheria');
  igual(chamar('bipar',cod(p,'tecido'),DIRETOR).acao,'iniciado','e na colecao');
 }},

/* ═══ 4. "O QUE SEGURA" — A TRAVA QUE EXPLICA ════════════════════════════ */

{nome:'4.15 — bipar o nao liberado RESPONDE o que segura, com setor e peca',
 executar({igual,recusa,db}){
  limpar(db);
  const p=aprovado();
  const e=recusa(()=>chamar('bipar',cod(p,'montagem'),MONTA),'aguardando','a montagem antes da hora');
  /* A frase e parte da regra, nao texto de erro: sem ela a montagem fica
     esperando uma peca que ja esta na bancada e ninguem sabe por que. */
  igual(/tubo/i.test(e.mensagem),true,'diz que falta o tubo: '+e.mensagem);
  igual(/serralheria/i.test(e.mensagem),true,'e de que setor ele e');
 }},

{nome:'4.15 — e quando o que segura JA COMECOU, a frase diz quem e desde quando',
 executar({igual,recusa,db}){
  limpar(db);
  const p=aprovado();
  ['base'].forEach(c=>fazer(p,c,SERRA)); fazer(p,'tecido',COLE);
  chamar('bipar',cod(p,'tubo'),SERRA);            // iniciado, nao terminado
  const e=recusa(()=>chamar('bipar',cod(p,'montagem'),MONTA),'aguardando','o tubo em andamento');
  igual(/Joao/.test(e.mensagem),true,'nomeia quem esta com ela: '+e.mensagem);
 }},

{nome:'4.15 — a frase escreve o NOME do setor, nunca a chave do banco',
 executar({igual,recusa,db}){
  limpar(db);
  const p=aprovado();
  const e=recusa(()=>chamar('bipar',cod(p,'montagem'),MONTA),'aguardando','a montagem antes da hora');
  /* ⚠️ ESTE CASO NASCEU DEPOIS DO DEFEITO, e por isso esta escrito assim. A
     primeira versao da frase saia "Tecido · colecao · nem começou" — chave de
     banco na tela da bancada, que e o "— Correcao de contagem" do §2 do
     CLAUDE.md. Os casos de cima PASSAVAM com o defeito de pe (o regex de
     /colecao/i casa com os dois), e quem o pegou foi ABRIR A TELA. */
  igual(/Coleção/.test(e.mensagem),true,'sai o nome: '+e.mensagem);
  igual(/·\s*colecao\s*·/.test(e.mensagem),false,'e nao a chave: '+e.mensagem);
 }},

{nome:'4.15 — oQueSegura devolve a LISTA, e nao so a primeira',
 executar({igual,db}){
  limpar(db);
  const p=aprovado();
  const seguram=chamar('oQueSegura',cod(p,'montagem')).map(x=>x.chave).sort();
  igual(seguram.join(','),'base,tecido,tubo','as tres de uma vez');
  igual(chamar('oQueSegura',cod(p,'tubo')).length,0,'o que esta liberado nao e segurado por nada');
 }},

/* ═══ 5. O KIT NA EMBALAGEM — AQUI PROVA QUE ENTROU O CERTO ══════════════ */

{nome:'4.7/4.15 — sem o bipe do kit, o FIM da embalagem e recusado',
 executar({igual,recusa,db}){
  limpar(db);
  const p=aprovado();
  ['tubo','base'].forEach(c=>fazer(p,c,SERRA)); fazer(p,'tecido',COLE);
  fazer(p,'montagem',MONTA); fazer(p,'revisao',REVIS);
  const c=cod(p,'embalagem');
  igual(chamar('bipar',c,EMBAL).acao,'iniciado','a embalagem comeca normal');
  const e=recusa(()=>chamar('bipar',c,EMBAL),'faltou_kit','o fim sem o kit');
  igual(/KIT/i.test(e.mensagem),true,'a frase fala do kit: '+e.mensagem);
 }},

{nome:'4.7 — o kit ERRADO e recusado, e a recusa diz qual e o certo',
 executar({igual,recusa,db}){
  limpar(db);
  const p=aprovado();
  ['tubo','base'].forEach(c=>fazer(p,c,SERRA)); fazer(p,'tecido',COLE);
  fazer(p,'montagem',MONTA); fazer(p,'revisao',REVIS);
  const c=cod(p,'embalagem');
  chamar('bipar',c,EMBAL);
  /* Na medida padrao o QR do kit e fixo e prova so que ALGUM kit entrou
     (CLAUDE.md §4); aqui prova que entrou O CERTO. */
  const e=recusa(()=>chamar('biparKit',c,'KIT-QUE-NAO-E-DESTA-PECA',EMBAL),'kit_errado','kit trocado');
  /* ⚠️ A ASSERCAO E O NOME DO KIT, e nao a palavra "suporte" — e a primeira
     versao deste caso conferia "suporte", que so aparecia porque a frase
     dizia "sem quantidade de suportes cadastrada" no kit tradicional. O caso
     estava TRAVANDO o defeito em vez de pega-lo: ele reprovou no dia em que
     a frase foi consertada. Regua que concorda com o erro e a licao do QR
     (§4) por mais uma porta. */
  igual(/KIT TRADICIONAL/i.test(e.mensagem),true,'a frase diz qual e o certo: '+e.mensagem);
  igual(/sem quantidade/i.test(e.mensagem),false,
    'e nao alarma com suporte que este kit nao usa: '+e.mensagem);
 }},

{nome:'4.7 — com o kit CERTO, o fim passa',
 executar({igual,db}){
  limpar(db);
  const p=aprovado();
  ['tubo','base'].forEach(c=>fazer(p,c,SERRA)); fazer(p,'tecido',COLE);
  fazer(p,'montagem',MONTA); fazer(p,'revisao',REVIS);
  const c=cod(p,'embalagem');
  const kit=p.itens[0].componentes.find(x=>x.eh_kit);
  igual(!!kit,true,'a peca tem kit');
  chamar('bipar',c,EMBAL);
  chamar('biparKit',c,kit.codigo_barras,EMBAL);
  igual(chamar('bipar',c,EMBAL).acao,'terminado','o fim passa');
 }},

{nome:'4.15 — o kit so e cobrado na EMBALAGEM, e nao nos outros quatro',
 executar({igual,db}){
  limpar(db);
  const p=aprovado();
  igual(fazer(p,'tubo',SERRA).acao,'terminado','a serralheria nao pede kit');
  igual(fazer(p,'tecido',COLE).acao,'terminado','nem a colecao');
 }},

/* ═══ 6. A PENDENCIA — A CHEFIA FECHA, COM NOME E MOTIVO ═════════════════ */

{nome:'4.15 — a chefia FECHA a pendencia, e isso libera o passo seguinte',
 executar({igual,db}){
  limpar(db);
  const p=aprovado();
  fazer(p,'base',SERRA); fazer(p,'tecido',COLE);
  /* A serralheria esqueceu de bipar o fim do tubo e foi embora. Sem saida, a
     montagem fica esperando uma peca que ja esta na bancada. */
  chamar('fecharPendencia',cod(p,'tubo'),{motivo:'bipou e esqueceu o fim'},DIRETOR);
  igual(naFila('montagem',MONTA).includes(cod(p,'montagem')),true,'a montagem destravou');
 }},

{nome:'4.15 — e o fechamento deixa RASTRO: quem, quando e por que',
 executar({igual,db}){
  limpar(db);
  const p=aprovado();
  chamar('fecharPendencia',cod(p,'tubo'),{motivo:'bipou e esqueceu o fim'},DIRETOR);
  const linha=db.prepare('SELECT * FROM sm_pedido_componente WHERE codigo_etiqueta=?').get(cod(p,'tubo'));
  igual(!!linha.terminado_em,true,'ficou terminado');
  igual(linha.terminado_por,'Lucas','com o nome de quem fechou');
  const pend=db.prepare('SELECT * FROM sm_pendencia ORDER BY id DESC').get();
  igual(!!pend,true,'a pendencia virou linha');
  igual(pend.motivo,'bipou e esqueceu o fim','com o motivo');
  igual(pend.usuario_nome,'Lucas','e com quem fechou');
 }},

{nome:'4.15 — fechar SEM motivo e recusado: fechamento sem porque nao e rastro',
 executar({recusa,db}){
  limpar(db);
  const p=aprovado();
  recusa(()=>chamar('fecharPendencia',cod(p,'tubo'),{motivo:'  '},DIRETOR),
    'motivo_obrigatorio','fechamento mudo');
 }},

{nome:'4.15 — a BANCADA nao fecha a propria pendencia — isso e da chefia',
 executar({recusa,db}){
  limpar(db);
  const p=aprovado();
  /* Se quem bipa pudesse fechar, a trava deixaria de existir: bastaria
     fechar tudo e seguir. */
  recusa(()=>chamar('fecharPendencia',cod(p,'tubo'),{motivo:'deixa eu passar'},SERRA),
    'sem_permissao','a bancada fechando sozinha');
 }},

/* ═══ 7. PRONTO AUTOMATICO ═══════════════════════════════════════════════ */

{nome:'4.15 — PRONTO sai sozinho quando a ULTIMA persiana e embalada',
 executar({igual,db}){
  limpar(db);
  const p=aprovado([{},{}]);          // duas persianas
  const tudo=n=>{
    ['tubo','base'].forEach(c=>fazer(p,c,SERRA,n)); fazer(p,'tecido',COLE,n);
    fazer(p,'montagem',MONTA,n); fazer(p,'revisao',REVIS,n);
    const c=cod(p,'embalagem',n);
    const kit=p.itens[n-1].componentes.find(x=>x.eh_kit);
    chamar('bipar',c,EMBAL); chamar('biparKit',c,kit.codigo_barras,EMBAL);
    return chamar('bipar',c,EMBAL);
  };
  const a=tudo(1);
  igual(!!a.pronto,false,'com uma das duas, ainda nao');
  igual(!!db.prepare('SELECT pronto_em FROM sm_pedido WHERE id=?').get(p.id).pronto_em,false,'nada gravado');
  const b=tudo(2);
  igual(!!b.pronto,true,'com as duas, sai o pronto');
  igual(!!db.prepare('SELECT pronto_em FROM sm_pedido WHERE id=?').get(p.id).pronto_em,true,'e fica gravado');
 }},

{nome:'4.15 — o PRONTO nao mexe no `marco`, e isso segura as fases 4-A, 4-B e 4-C',
 executar({igual,db}){
  limpar(db);
  const p=aprovado();
  ['tubo','base'].forEach(c=>fazer(p,c,SERRA)); fazer(p,'tecido',COLE);
  fazer(p,'montagem',MONTA); fazer(p,'revisao',REVIS);
  const c=cod(p,'embalagem');
  const kit=p.itens[0].componentes.find(x=>x.eh_kit);
  chamar('bipar',c,EMBAL); chamar('biparKit',c,kit.codigo_barras,EMBAL); chamar('bipar',c,EMBAL);
  /* Tres lugares filtram por `marco='aprovado'`: a reimpressao de etiqueta
     (dados/etiqueta_producao.js) e as DUAS contas do comprometido e do
     material (dominio/consumo.js). Trocar o marco para 'pronto' faria a
     etiqueta parar de reimprimir e mudaria em silencio os numeros da compra.
     O pronto e `pronto_em` + linha de historico. */
  igual(db.prepare('SELECT marco FROM sm_pedido WHERE id=?').get(p.id).marco,'aprovado','o marco fica');
  const h=db.prepare("SELECT * FROM sm_pedido_marco WHERE marco='pronto' AND pedido_id=?").get(p.id);
  igual(!!h,true,'mas o historico registra o pronto');
 }},

{nome:'4.15 — peca CANCELADA nao segura o pronto do pedido',
 executar({igual,db}){
  limpar(db);
  const p=aprovado([{},{}]);
  pedido.cancelarItem(p.id,p.itens[1].id,{motivo:'cliente desistiu'},DIRETOR);
  ['tubo','base'].forEach(c=>fazer(p,c,SERRA,1)); fazer(p,'tecido',COLE,1);
  fazer(p,'montagem',MONTA,1); fazer(p,'revisao',REVIS,1);
  const c=cod(p,'embalagem',1);
  const kit=p.itens[0].componentes.find(x=>x.eh_kit);
  chamar('bipar',c,EMBAL); chamar('biparKit',c,kit.codigo_barras,EMBAL);
  igual(!!chamar('bipar',c,EMBAL).pronto,true,'a unica peca viva fecha o pedido');
 }},

{nome:'4.15 — e a peca cancelada nao aparece em fila nenhuma',
 executar({igual,db}){
  limpar(db);
  const p=aprovado([{},{}]);
  const oTubo=cod(p,'tubo',2);
  pedido.cancelarItem(p.id,p.itens[1].id,{motivo:'cliente desistiu'},DIRETOR);
  igual(naFila('serralheria',SERRA).includes(oTubo),false,'sumiu da fila');
 }},

/* ═══ 8. AS GUARDAS QUE SOBRAM ═══════════════════════════════════════════ */

{nome:'4.15 — pedido ENVIADO (nao aprovado) nao tem fila: a ficha ainda nao congelou',
 executar({igual,db}){
  limpar(db);
  const b=cena();
  const p=pedido.criar({revenda_id:revendaCom().id, tipo:'pedido'},DIRETOR);
  pedido.acrescentarItem(p.id,peca(b),DIRETOR);
  pedido.enviar(p.id,DIRETOR,'2026-09-22 10:00');
  igual(naFila('serralheria',SERRA).length,0,'nada na fila');
 }},

{nome:'4.15 — componente SEM etiqueta (a reducao de peso) nao entra na fila',
 executar({igual,db}){
  limpar(db);
  /* ⚠️ A REDUCAO SO EXISTE A PARTIR DO TUBO 38 (o 32 nao a aceita), entao a
     peca deste caso e de 2,00 de largura — uma de 1,00 cai no Tubo 32 e a
     propria criacao do item e recusada. O caso precisa da peca em que a
     regra existe, e nao de uma qualquer. */
  const p=aprovado([{largura_mm:2000, reducao:'pedida'}]);
  const r=p.itens[0].componentes.find(x=>x.chave==='reducao');
  igual(!!r,true,'a peca tem reducao');
  igual(!!r.gera_etiqueta,false,'e ela nao gera etiqueta');
  /* Sem codigo nao ha o que bipar — e ela tambem nao pode SEGURAR ninguem,
     senao a montagem esperaria para sempre por uma peca sem bipe. */
  igual(chamar('oQueSegura',cod(p,'montagem')).some(x=>x.chave==='reducao'),false,
    'e nao segura a montagem');
 }},

{nome:'4.15 — a fila de um setor nao mostra a peca de outro',
 executar({igual,db}){
  limpar(db);
  const p=aprovado();
  igual(naFila('serralheria',SERRA).includes(cod(p,'tecido')),false,'o tecido nao e da serralheria');
  igual(naFila('colecao',COLE).includes(cod(p,'tubo')),false,'nem o tubo da colecao');
 }},

{nome:'4.15 — a fila diz o que FAZER, nao so o codigo: medida de CORTE e a peca',
 executar({igual,db}){
  limpar(db);
  const p=aprovado();
  const linha=chamar('fila','serralheria',SERRA).find(x=>x.codigo===cod(p,'tubo'));
  igual(!!linha,true,'o tubo esta la');
  /* ⚠️ A medida escrita e a de CORTE, nunca a acabada — a persiana de 1,000
     manda cortar 0,970. E a armadilha #18 do CLAUDE.md na bancada. */
  igual(/0,970|0\.970/.test(String(linha.o_que_fazer)),true,
    'manda cortar a medida de CORTE: '+linha.o_que_fazer);
  igual(!!linha.pedido_numero,true,'e diz de que pedido e');
 }},

{nome:'4.15 — a fila vem na ordem do PRAZO: o que vence antes aparece em cima',
 executar({igual,db}){
  limpar(db);
  const a=aprovado(); const b=aprovado();
  db.prepare('UPDATE sm_pedido SET prazo_atual=? WHERE id=?').run('2026-12-01',a.id);
  db.prepare('UPDATE sm_pedido SET prazo_atual=? WHERE id=?').run('2026-10-01',b.id);
  const fila=naFila('serralheria',SERRA);
  igual(fila.indexOf(cod(b,'tubo'))<fila.indexOf(cod(a,'tubo')),true,
    'o de outubro vem antes do de dezembro');
 }}

];

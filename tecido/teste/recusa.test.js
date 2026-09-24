// A RECUSA — secao 4.16 da spec SOBMEDIDA-PEDIDO-REVENDA (fase 5-B2).
//
// ⚠️ ESTE ARQUIVO FOI ESCRITO ANTES DO CODIGO DA RECUSA, e de proposito:
// risco vermelho da secao 0 do CLAUDE.md pede teste antes do conserto. As
// regras daqui saem da spec e do desenho, nao do que o codigo devolveu.
//
// O QUE ELE EXISTE PARA PROVAR, em quatro frases:
//
//   1. A RECUSA ANDA PARA TRAS PELA MESMA TABELA QUE LIBERA PARA A FRENTE.
//      O `ANTES` do dominio diz o que libera o que; lido ao contrario diz o
//      que e "trabalho anterior" e o que volta para "aguardando". Uma segunda
//      tabela divergiria no dia em que o fluxo mudasse — armadilha #12.
//   2. QUEM RECUSA ESCOLHE SO O MOTIVO. O motivo ja diz qual peca volta; a
//      bancada nao escolhe setor nem componente, porque quem esta de luva nao
//      faz duas escolhas e a segunda errada e trabalho perdido.
//   3. O CODIGO DA ETIQUETA NAO MUDA. Ele e da PECA e nasce na aprovacao
//      (fase 4-A): codigo novo na refeita partiria a historia dela em duas.
//   4. O QUE VOLTA E O CULPADO E TUDO QUE DEPENDE DELE — nem mais, nem menos.
//      A mais, a serralheria refaz a base porque o tubo veio errado (a
//      armadilha #6, trabalho jogado fora todo dia). A menos, a persiana sai
//      montada em cima de um tubo que ja foi para o lixo.
const pedido=require('../dominio/pedido');
const revendas=require('../dominio/revenda');
const catalogo=require('../dominio/catalogo_sm');
const tecido=require('../dominio/tecido');
const config=require('../nucleo/config');
const pessoas=require('../nucleo/pessoas');
const etqprod=require('../dominio/etiqueta_producao');

/* Funcao que ainda nao existe da VERMELHO, nunca derruba a rodada: suite que
   morre no meio faz o defeito aparecer como "travou" em vez de falhar, e os
   casos de baixo nunca rodam (§7-B do CLAUDE.md, armadilha #33). */
function porta(caminho){
  let m=null; try{ m=require(caminho); }catch(e){ m=null; }
  return (metodo,...args)=>{
    if(!m||typeof m[metodo]!=='function')
      throw new Error(caminho+' nao expoe '+metodo+'()');
    return m[metodo](...args);
  };
}
const chamar=porta('../dominio/producao');
const motivo=porta('../dominio/motivo_producao');

const DO_PCP=[{id:7, nome:'Renato'}];
const RENATO ={id:7, nome:'Renato', papel:'vendedor'};
const DIRETOR={id:1, nome:'Lucas',  papel:'diretor',
  setores:['serralheria','colecao','montagem','revisao','embalagem']};
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
  tecido.criarTecido({linha_id:l.id,abertura_id:screen1.id,cor_id:branco.id});
  const m=catalogo.modeloPorNome('Rolô');
  catalogo.ligarColecao({modelo_id:m.id, abertura_id:screen1.id,
    preco_m2_centavos:11000, largura_max_mm:2800});
  catalogo.ligarCorAcessorio({modelo_id:m.id, cor_id:branco.id});
  base={m, screen1, branco};
  return base;
}

const peca=(b,extra)=>Object.assign({
  modelo_id:b.m.id, abertura_id:b.screen1.id,
  cor_tecido_id:b.branco.id, cor_acessorio_id:b.branco.id,
  largura_mm:1000, altura_mm:1000,
  comando:'direito', rolamento:'frente', adicional:'nenhum', reducao:'nao'
},extra||{});

function limpar(db){
  /* A ORDEM E A DOS PONTEIROS (§12). `sm_recusa` e `sm_pendencia` apontam
     para o COMPONENTE, entao saem antes dele. Foi a pegadinha que reprovou
     12 casos da 5-B1 na primeira rodada. */
  for(const t of ['sm_recusa','sm_pendencia']){ try{ db.prepare('DELETE FROM '+t).run(); }catch(e){} }
  for(const t of ['sm_pedido_componente','sm_pedido_item_preco','sm_pedido_alteracao',
                  'sm_pedido_marco','sm_pedido_prazo','sm_pedido_item','sm_pedido',
                  'sm_etiqueta_impressao'])
    db.prepare('DELETE FROM '+t).run();
  db.prepare('DELETE FROM sm_revenda').run();
  try{ db.prepare('DELETE FROM sm_motivo_producao').run(); }catch(e){}
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

const cod=(p,chave,n)=>{
  const item=p.itens[(n||1)-1];
  const c=item.componentes.find(x=>x.chave===chave);
  return c&&c.codigo_etiqueta;
};
const fazer=(p,chave,quem,n)=>{
  const c=cod(p,chave,n); chamar('bipar',c,quem); return chamar('bipar',c,quem);
};
// Leva a persiana inteira ate a embalagem fechada.
function ateOFim(p,quem){
  ['tubo','base'].forEach(c=>fazer(p,c,SERRA));
  fazer(p,'tecido',COLE);
  fazer(p,'montagem',MONTA);
  fazer(p,'revisao',REVIS);
  const e=cod(p,'embalagem');
  chamar('bipar',e,EMBAL);
  chamar('biparKit',e,kitDe(p),EMBAL);
  return chamar('bipar',e,EMBAL);
}
const kitDe=(p,n)=>{
  const item=p.itens[(n||1)-1];
  return (item.componentes.find(x=>x.eh_kit)||{}).codigo_barras;
};
const naFila=(setor,quem)=>chamar('fila',setor,quem).map(x=>x.codigo);
const linhaDaFila=(setor,quem,codigo)=>chamar('fila',setor,quem).find(x=>x.codigo===codigo);
const estado=(db,codigo)=>db.prepare(
  'SELECT * FROM sm_pedido_componente WHERE codigo_etiqueta=?').get(codigo);

// Cria um motivo apontando um componente, e devolve o id.
const motivoDe=(chave,nome)=>motivo('criar',{nome:nome||('defeito em '+chave),componente_chave:chave});

module.exports=[

/* ═══ 1. O CADASTRO — O MOTIVO JA DIZ PARA ONDE A PECA VOLTA ══════════════ */

{nome:'4.16 — o motivo aponta o COMPONENTE, e o setor sai dele (uma afirmacao, nao duas)',
 executar({igual,db}){
  limpar(db);
  const m=motivoDe('tubo','Tubo maior');
  igual(m.componente_chave,'tubo','o cadastro guarda o componente');
  /* ⚠️ A SPEC MOSTRA "Tubo maior → Serralheria", mas a serralheria faz
     QUATRO pecas. Mandar de volta "para a serralheria" ou e ambiguo, ou
     refaz as quatro — e refazer a base porque o tubo veio errado e trabalho
     jogado fora todo dia, que e a armadilha #6. O setor e consequencia do
     componente, e por isso nao e um segundo campo. */
  const lista=motivo('ativos');
  const achado=lista.find(x=>x.id===m.id);
  igual(achado.setor,'serralheria','o setor vem do componente, sem ser digitado');
  igual(achado.setor_nome,'Serralheria','e a tela le o NOME, nunca a chave');
 }},

{nome:'4.16 — motivo apontando componente que NAO gera etiqueta e recusado',
 executar({igual,recusa,db}){
  limpar(db);
  /* A reducao de peso e componente da montagem e nao tem codigo (fase 4-A):
     sem bipe ela nunca foi feita por ninguem, entao nao ha trabalho para
     reabrir. Aceitar aqui criaria um motivo que trava na hora de usar, com a
     peca na mao — a divida 18 pela porta do cadastro. */
  recusa(()=>motivoDe('reducao'),'componente_sem_etiqueta','a reducao nao');
  recusa(()=>motivoDe('kit_tradicional'),'componente_sem_etiqueta','o kit tambem nao');
  igual(motivo('listar').length,0,'e nenhum dos dois foi gravado');
 }},

{nome:'4.16 — motivo sem nome, com componente inexistente ou repetido e recusado',
 executar({igual,recusa,db}){
  limpar(db);
  recusa(()=>motivo('criar',{nome:'',componente_chave:'tubo'}),'nome_vazio','sem nome');
  recusa(()=>motivo('criar',{nome:'X',componente_chave:'parafuso'}),'componente_inexistente','componente que nao existe');
  motivoDe('tubo','Tubo maior');
  recusa(()=>motivoDe('tubo','tubo maior'),'motivo_repetido','e nome repetido, mesmo em outra caixa');
  igual(motivo('listar').length,1,'so o primeiro ficou');
 }},

{nome:'4.16 — a lista da bancada so oferece o que ELA pode recusar',
 executar({igual,db}){
  limpar(db);
  const p=aprovado();                       // peca lisa: nao tem bandô
  ['Tubo maior','Corte torto','Montagem torta','Revisao mal feita','Bandô torto']
    .forEach((n,i)=>motivoDe(['tubo','tecido','montagem','revisao','bando'][i],n));
  ['tubo','base'].forEach(c=>fazer(c==='tubo'?p:p,c,SERRA)); fazer(p,'tecido',COLE);

  const nomes=chamar('motivos',cod(p,'montagem')).motivos.map(x=>x.nome);
  /* ⚠️ LISTA QUE OFERECE O QUE VAI SER RECUSADO E A ARMADILHA #6 NA ESCOLHA.
     Quem esta de luva toca "Montagem torta" achando que e "a montagem esta
     torta, refaz" — e leva recusa. As guardas do servidor ficam de pe (a
     rota e chamavel por fora), mas a tela para de oferecer o que ela ja sabe
     que nao passa. */
  igual(nomes.includes('Tubo maior'),true,'o tubo veio antes: pode');
  igual(nomes.includes('Corte torto'),true,'o tecido tambem');
  igual(nomes.includes('Montagem torta'),false,'o proprio trabalho, nao');
  igual(nomes.includes('Revisao mal feita'),false,'nem o que vem depois');
  igual(nomes.includes('Bandô torto'),false,'nem peca que esta persiana nao leva');
 }},

{nome:'4.16 — e so oferece o que JA TERMINOU: nao ha o que refazer no que nem comecou',
 executar({igual,db}){
  limpar(db);
  const p=aprovado([{adicional:'bando'}]);
  motivoDe('tubo','Tubo maior'); motivoDe('bando','Bandô torto');
  ['tubo','base','bando'].forEach(c=>fazer(p,c,SERRA));
  fazer(p,'tecido',COLE); fazer(p,'montagem',MONTA); fazer(p,'revisao',REVIS);
  igual(chamar('motivos',cod(p,'embalagem')).motivos.map(x=>x.nome).includes('Bandô torto'),
    true,'o bandô foi feito, entao pode ser recusado');

  const q=aprovado([{adicional:'bando'}]);   // outro pedido: o bandô nao foi feito
  ['tubo','base'].forEach(c=>fazer(q,c,SERRA));
  fazer(q,'tecido',COLE); fazer(q,'montagem',MONTA); fazer(q,'revisao',REVIS);
  igual(chamar('motivos',cod(q,'embalagem')).motivos.map(x=>x.nome).includes('Bandô torto'),
    false,'aqui ele nem comecou — nao ha o que refazer');
 }},

{nome:'4.16 — a PRIMEIRA bancada nao tem o que recusar, e a tela DIZ isso',
 executar({igual,db}){
  limpar(db);
  const p=aprovado();
  motivoDe('tubo','Tubo maior');
  /* A serralheria e a colecao sao as primeiras: nada passa por elas depois
     de outra bancada. Lista vazia sem explicacao se parece com tela quebrada
     — e quem esta com a peca na mao nao tem como saber a diferenca. */
  const r=chamar('motivos',cod(p,'tubo'));
  igual(r.motivos.length,0,'nao ha motivo para a serralheria');
  igual(!!r.sem_motivo,true,'e vem a frase dizendo por que');
  igual(/Serralheria/.test(r.sem_motivo),true,'nomeando a bancada: '+r.sem_motivo);
 }},

{nome:'4.16 — a bancada le os motivos ATIVOS, e nao a lista inteira',
 executar({igual,db}){
  limpar(db);
  const a=motivoDe('tubo','Tubo maior');
  motivoDe('tecido','Corte torto');
  motivo('atualizar',a.id,{ativo:0});
  igual(motivo('listar').length,2,'o desativado continua no cadastro (historia nao se apaga)');
  const p=aprovado();
  ['tubo','base'].forEach(c=>fazer(p,c,SERRA)); fazer(p,'tecido',COLE);
  const daBancada=chamar('motivos',cod(p,'montagem')).motivos.map(x=>x.nome);
  igual(daBancada.length,1,'mas a bancada so ve o ativo');
  igual(daBancada[0],'Corte torto','e e o certo');
 }},

/* ═══ 2. A RECUSA — O QUE VOLTA E O CULPADO E O QUE DEPENDE DELE ══════════ */

{nome:'4.16 — a montagem recusa o TUBO: ele volta para a fila da serralheria',
 executar({igual,db}){
  limpar(db);
  const p=aprovado();
  const m=motivoDe('tubo','Tubo maior');
  ['tubo','base'].forEach(c=>fazer(p,c,SERRA)); fazer(p,'tecido',COLE);
  igual(naFila('serralheria',SERRA).includes(cod(p,'tubo')),false,'o tubo tinha saido da fila');

  chamar('recusar',cod(p,'montagem'),{motivo_id:m.id,observacao:'veio 2 cm maior'},MONTA);

  igual(naFila('serralheria',SERRA).includes(cod(p,'tubo')),true,'e voltou');
  const t=estado(db,cod(p,'tubo'));
  igual(t.terminado_em,null,'sem terminado');
  igual(t.iniciado_em,null,'e sem iniciado — o bipe recomeca do zero');
  igual(t.refeitas,1,'e contado como refeito uma vez');
 }},

{nome:'4.16 — e O CODIGO DA ETIQUETA NAO MUDA: ele e da peca, nao do papel',
 executar({igual,db}){
  limpar(db);
  const p=aprovado();
  const m=motivoDe('tubo','Tubo maior');
  const antes=cod(p,'tubo');
  ['tubo','base'].forEach(c=>fazer(p,c,SERRA)); fazer(p,'tecido',COLE);
  const r=chamar('recusar',cod(p,'montagem'),{motivo_id:m.id},MONTA);
  igual(r.culpado.codigo,antes,'a recusa devolve o mesmo codigo');
  igual(estado(db,antes).codigo_etiqueta,antes,'e ele continua no banco');
 }},

{nome:'4.16 — a peca recusada volta MARCADA na fila: a bancada ve que e refazer',
 executar({igual,db}){
  limpar(db);
  const p=aprovado();
  const m=motivoDe('tubo','Tubo maior');
  ['tubo','base'].forEach(c=>fazer(p,c,SERRA)); fazer(p,'tecido',COLE);
  chamar('recusar',cod(p,'montagem'),{motivo_id:m.id},MONTA);
  const l=linhaDaFila('serralheria',SERRA,cod(p,'tubo'));
  igual(!!l,true,'esta na fila');
  igual(l.refeitas,1,'e a linha diz que e refazer');
  /* Sem a marca, a peca refeita e identica a qualquer outra na lista — e o
     serralheiro corta de novo sem saber que ja cortou uma que foi pro lixo. */
  const outra=linhaDaFila('serralheria',SERRA,cod(p,'base'));
  igual(!outra||!outra.refeitas,true,'e a base, que nao foi recusada, nao');
 }},

{nome:'4.16 — o que depende do culpado volta para "aguardando"',
 executar({igual,db}){
  limpar(db);
  const p=aprovado();
  const m=motivoDe('tecido','Tecido com defeito');
  ateOFim(p,EMBAL);
  igual(estado(db,cod(p,'embalagem')).terminado_em!==null,true,'a persiana estava fechada');

  /* A embalagem abre a caixa, ve o tecido rasgado e recusa. O tecido volta
     para a colecao — e a montagem, a revisao e a embalagem, que foram feitas
     EM CIMA dele, voltam para aguardando. */
  const r=chamar('recusar',cod(p,'embalagem'),{motivo_id:m.id},EMBAL);
  ['tecido','montagem','revisao','embalagem'].forEach(k=>{
    igual(estado(db,cod(p,k)).terminado_em,null,k+' voltou');
  });
  igual(r.reabertos.length>=4,true,'e a recusa diz quantos voltaram');
  /* ⚠️ NEM MAIS: o tubo e a base nao dependem do tecido, e refaze-los seria
     trabalho jogado fora — a armadilha #6 pela porta da recusa. */
  ['tubo','base'].forEach(k=>{
    igual(estado(db,cod(p,k)).terminado_em!==null,true,k+' continua pronto');
    igual(estado(db,cod(p,k)).refeitas,0,'e '+k+' nao conta como refeito');
  });
 }},

{nome:'4.16 — so o CULPADO conta como refeito; os de baixo sao trabalho, nao peca',
 executar({igual,db}){
  limpar(db);
  const p=aprovado();
  const m=motivoDe('tecido','Tecido com defeito');
  ateOFim(p,EMBAL);
  chamar('recusar',cod(p,'embalagem'),{motivo_id:m.id},EMBAL);
  /* `refeitas` responde UMA coisa: quantas vezes ESTA peca fisica foi feita.
     Quem conta as recusas por setor e por pessoa e a tabela `sm_recusa` (o
     indicador da secao 4.17). Duas contas na mesma coluna e a armadilha #12
     dentro de um numero so. */
  igual(estado(db,cod(p,'tecido')).refeitas,1,'o tecido, que foi cortado de novo');
  igual(estado(db,cod(p,'montagem')).refeitas,0,'a montagem nao');
  igual(estado(db,cod(p,'embalagem')).refeitas,0,'nem a embalagem');
 }},

{nome:'4.16 — o BANDO recusado nao derruba a montagem: ele e da caixa',
 executar({igual,db}){
  limpar(db);
  const p=aprovado([{adicional:'bando'}]);
  const m=motivoDe('bando','Bandô torto');
  ['tubo','base','bando'].forEach(c=>fazer(p,c,SERRA));
  fazer(p,'tecido',COLE); fazer(p,'montagem',MONTA); fazer(p,'revisao',REVIS);
  chamar('bipar',cod(p,'embalagem'),EMBAL);

  chamar('recusar',cod(p,'embalagem'),{motivo_id:m.id},EMBAL);
  igual(estado(db,cod(p,'bando')).terminado_em,null,'o bandô voltou');
  igual(estado(db,cod(p,'embalagem')).iniciado_em,null,'a embalagem voltou ao comeco');
  /* ⚠️ A MONTAGEM NAO. O bandô nao segura a montagem (fase 5-B1) — entao
     tambem nao a derruba. Derrubar aqui desmontaria uma persiana inteira por
     causa de uma peca que so entra na hora de fechar a caixa. */
  igual(estado(db,cod(p,'montagem')).terminado_em!==null,true,'a montagem continua feita');
  igual(estado(db,cod(p,'revisao')).terminado_em!==null,true,'e a revisao tambem');
 }},

{nome:'4.16 — o kit conferido volta a NAO conferido: senao a proxima caixa fecha sem ele',
 executar({igual,recusa,db}){
  limpar(db);
  const p=aprovado();
  const m=motivoDe('tecido','Tecido com defeito');
  ateOFim(p,EMBAL);
  igual(estado(db,cod(p,'embalagem')).kit_conferido_em!==null,true,'o kit tinha sido conferido');
  chamar('recusar',cod(p,'embalagem'),{motivo_id:m.id},EMBAL);
  igual(estado(db,cod(p,'embalagem')).kit_conferido_em,null,'e voltou a nao conferido');
  /* A prova de que isso e trava e nao enfeite: refeita a persiana, fechar
     sem bipar o kit de novo tem que ser RECUSADO. */
  fazer(p,'tecido',COLE); fazer(p,'montagem',MONTA); fazer(p,'revisao',REVIS);
  const e=cod(p,'embalagem');
  chamar('bipar',e,EMBAL);
  recusa(()=>chamar('bipar',e,EMBAL),'faltou_kit','o kit e cobrado outra vez');
 }},

{nome:'4.16 — o pedido que estava PRONTO deixa de estar',
 executar({igual,db}){
  limpar(db);
  const p=aprovado();
  const m=motivoDe('tecido','Tecido com defeito');
  const fim=ateOFim(p,EMBAL);
  igual(fim.pronto,true,'o pedido fechou');
  igual(db.prepare('SELECT pronto_em FROM sm_pedido WHERE id=?').get(p.id).pronto_em!==null,true,
    'com pronto_em gravado');

  chamar('recusar',cod(p,'embalagem'),{motivo_id:m.id},EMBAL);
  igual(db.prepare('SELECT pronto_em FROM sm_pedido WHERE id=?').get(p.id).pronto_em,null,
    'e deixou de estar pronto — ha peca voltando para a bancada');
  /* ⚠️ O `marco` CONTINUA `aprovado`, como na 5-B1. Tres lugares filtram por
     ele: a reimpressao da etiqueta e as DUAS contas do comprometido e do
     material de compra. Mexer aqui mudaria os numeros da compra em silencio. */
  igual(db.prepare('SELECT marco FROM sm_pedido WHERE id=?').get(p.id).marco,'aprovado',
    'e o marco nao se mexe');
 }},

{nome:'4.16 — e a persiana refeita fecha o pedido de novo',
 executar({igual,db}){
  limpar(db);
  const p=aprovado();
  const m=motivoDe('tubo','Tubo maior');
  ateOFim(p,EMBAL);
  chamar('recusar',cod(p,'embalagem'),{motivo_id:m.id},EMBAL);
  fazer(p,'tubo',SERRA); fazer(p,'montagem',MONTA); fazer(p,'revisao',REVIS);
  const e=cod(p,'embalagem');
  chamar('bipar',e,EMBAL); chamar('biparKit',e,kitDe(p),EMBAL);
  igual(chamar('bipar',e,EMBAL).pronto,true,'PRONTO outra vez');
 }},

/* ═══ 3. AS GUARDAS — RECUSA E DO TRABALHO ANTERIOR ═══════════════════════ */

{nome:'4.16 — nao se recusa o PROPRIO trabalho',
 executar({recusa,db}){
  limpar(db);
  const p=aprovado();
  const m=motivoDe('montagem','Montagem torta');
  ['tubo','base'].forEach(c=>fazer(p,c,SERRA)); fazer(p,'tecido',COLE);
  fazer(p,'montagem',MONTA);
  /* Refazer o proprio trabalho nao e recusa — e so refazer. Aceitar aqui
     daria a quem errou o caminho de apagar o proprio bipe, e o bipe e o
     rastro de quem fez. */
  recusa(()=>chamar('recusar',cod(p,'montagem'),{motivo_id:m.id},MONTA),
    'recusa_do_proprio','a montagem nao se recusa na montagem');
 }},

{nome:'4.16 — nao se recusa o que NAO e trabalho anterior, e a frase diz por que',
 executar({igual,recusa,db}){
  limpar(db);
  const p=aprovado();
  const m=motivoDe('tubo','Tubo maior');
  fazer(p,'tubo',SERRA);
  /* O tubo nao passa pela colecao: ela e a primeira do lado dela. Recusar
     ali seria uma bancada mandando refazer uma peca que ela nunca viu. */
  let msg='';
  try{ chamar('recusar',cod(p,'tecido'),{motivo_id:m.id},COLE); }
  catch(e){ msg=e.message||''; }
  recusa(()=>chamar('recusar',cod(p,'tecido'),{motivo_id:m.id},COLE),
    'nao_e_anterior','a colecao nao recusa o tubo');
  igual(/Coleção|Colecao/.test(msg),true,'e a frase diz de qual bancada se trata: '+msg);
 }},

{nome:'4.16 — a montagem recusa o tubo, mas nao a revisao (ela vem DEPOIS)',
 executar({recusa,db}){
  limpar(db);
  const p=aprovado();
  const mRev=motivoDe('revisao','Revisao mal feita');
  ['tubo','base'].forEach(c=>fazer(p,c,SERRA)); fazer(p,'tecido',COLE);
  recusa(()=>chamar('recusar',cod(p,'montagem'),{motivo_id:mRev.id},MONTA),
    'nao_e_anterior','a revisao vem depois da montagem');
 }},

{nome:'4.16 — culpado que ainda nao terminou nao se recusa: nao ha o que refazer',
 executar({recusa,db}){
  limpar(db);
  const p=aprovado([{adicional:'bando'}]);
  const m=motivoDe('bando','Bandô torto');
  ['tubo','base'].forEach(c=>fazer(p,c,SERRA));
  fazer(p,'tecido',COLE); fazer(p,'montagem',MONTA); fazer(p,'revisao',REVIS);
  /* O bandô nunca foi feito. Recusar aqui apagaria um trabalho que nao
     existe e contaria uma refeita que nao houve. */
  recusa(()=>chamar('recusar',cod(p,'embalagem'),{motivo_id:m.id},EMBAL),
    'culpado_nao_terminado','o bandô nem comecou');
 }},

{nome:'4.16 — motivo de peca que esta persiana NAO leva e recusado dizendo isso',
 executar({igual,recusa,db}){
  limpar(db);
  const p=aprovado();                      // sem adicional: nao ha bandô
  const m=motivoDe('bando','Bandô torto');
  ateOFim(p,EMBAL);
  let msg='';
  try{ chamar('recusar',cod(p,'embalagem'),{motivo_id:m.id},EMBAL); }catch(e){ msg=e.message||''; }
  recusa(()=>chamar('recusar',cod(p,'embalagem'),{motivo_id:m.id},EMBAL),
    'peca_sem_esse_componente','a persiana lisa nao tem bandô');
  igual(/[Bb]andô/.test(msg),true,'e a frase nomeia a peca: '+msg);
 }},

{nome:'4.16 — quem nao esta naquela bancada nao recusa por ela',
 executar({recusa,db}){
  limpar(db);
  const p=aprovado();
  const m=motivoDe('tubo','Tubo maior');
  ['tubo','base'].forEach(c=>fazer(p,c,SERRA)); fazer(p,'tecido',COLE);
  /* A recusa desfaz trabalho. Quem a faz tem que estar com a peca na mao —
     e quem esta com ela e a bancada daquela etiqueta. */
  recusa(()=>chamar('recusar',cod(p,'montagem'),{motivo_id:m.id},COLE),
    'setor_errado','a colecao nao recusa pela montagem');
 }},

{nome:'4.16 — motivo inexistente, inativo ou faltando sao recusados',
 executar({recusa,db}){
  limpar(db);
  const p=aprovado();
  const m=motivoDe('tubo','Tubo maior');
  ['tubo','base'].forEach(c=>fazer(p,c,SERRA)); fazer(p,'tecido',COLE);
  const oQue=cod(p,'montagem');
  recusa(()=>chamar('recusar',oQue,{},MONTA),'motivo_obrigatorio','sem motivo');
  recusa(()=>chamar('recusar',oQue,{motivo_id:9999},MONTA),'motivo_inexistente','motivo que nao existe');
  motivo('atualizar',m.id,{ativo:0});
  recusa(()=>chamar('recusar',oQue,{motivo_id:m.id},MONTA),'motivo_inativo','motivo desativado');
 }},

{nome:'4.16 — peca cancelada nao se recusa',
 executar({recusa,db}){
  limpar(db);
  const p=aprovado([{},{}]);
  const m=motivoDe('tubo','Tubo maior');
  ['tubo','base'].forEach(c=>fazer(p,c,SERRA)); fazer(p,'tecido',COLE);
  pedido.cancelarItem(p.id,p.itens[0].id,'errou a medida',DIRETOR);
  recusa(()=>chamar('recusar',cod(p,'montagem'),{motivo_id:m.id},MONTA),
    'peca_cancelada','ela nao vai ser feita');
 }},

/* ═══ 4. O RASTRO — E ELE QUE VIRA O INDICADOR DA SECAO 4.17 ══════════════ */

{nome:'4.16 — a recusa grava QUEM TINHA FEITO, quem recusou, de onde e por que',
 executar({igual,db}){
  limpar(db);
  const p=aprovado();
  const m=motivoDe('tubo','Tubo maior');
  ['tubo','base'].forEach(c=>fazer(p,c,SERRA)); fazer(p,'tecido',COLE);
  chamar('recusar',cod(p,'montagem'),{motivo_id:m.id,observacao:'veio 2 cm maior'},MONTA);

  const r=db.prepare('SELECT * FROM sm_recusa ORDER BY id DESC').get();
  igual(r.codigo_etiqueta,cod(p,'tubo'),'a etiqueta do culpado');
  /* ⚠️ QUEM FEZ E RETRATO, e e o unico lugar onde ele sobra: o bipe do
     culpado acabou de ser apagado pela reabertura. Sem esta linha, "recusas
     por pessoa" (secao 4.17) nao tem de onde sair. */
  igual(r.feito_por,'Joao','o serralheiro que tinha feito');
  igual(r.recusado_por,'Pedro','quem recusou');
  igual(r.recusado_de,'montagem','de que bancada');
  igual(r.motivo_nome,'Tubo maior','o motivo, escrito por extenso');
  igual(r.observacao,'veio 2 cm maior','e a observacao');
  /* O nome do motivo e RETRATO tambem: renomear o cadastro amanha nao pode
     reescrever o que aconteceu hoje. */
  motivo('atualizar',m.id,{nome:'Tubo fora de medida'});
  igual(db.prepare('SELECT motivo_nome FROM sm_recusa WHERE id=?').get(r.id).motivo_nome,
    'Tubo maior','e renomear o cadastro nao reescreve a historia');
 }},

{nome:'4.16 — a recusa aparece no historico do PEDIDO, que e onde alguem olha',
 executar({igual,db}){
  limpar(db);
  const p=aprovado();
  const m=motivoDe('tubo','Tubo maior');
  ['tubo','base'].forEach(c=>fazer(p,c,SERRA)); fazer(p,'tecido',COLE);
  chamar('recusar',cod(p,'montagem'),{motivo_id:m.id},MONTA);
  const h=db.prepare("SELECT * FROM sm_pedido_marco WHERE pedido_id=? AND marco='recusa'").get(p.id);
  igual(!!h,true,'ha linha de recusa no historico');
  igual(/Tubo maior/.test(String(h.detalhe)),true,'com o motivo: '+h.detalhe);
 }},

{nome:'4.16 — recusa que falha no meio nao deixa metade do trabalho apagado',
 executar({igual,recusa,db}){
  limpar(db);
  const p=aprovado();
  const m=motivoDe('tecido','Tecido com defeito');
  ateOFim(p,EMBAL);
  /* O motivo e apagado por baixo entre a leitura e a escrita — do lado de
     fora isso e so um motivo que sumiu. O que importa e que NADA seja
     desfeito pela metade: a persiana fechada continua fechada. */
  db.prepare('DELETE FROM sm_motivo_producao WHERE id=?').run(m.id);
  recusa(()=>chamar('recusar',cod(p,'embalagem'),{motivo_id:m.id},EMBAL),
    'motivo_inexistente','o motivo sumiu');
  igual(estado(db,cod(p,'embalagem')).terminado_em!==null,true,'e a persiana continua fechada');
  igual(estado(db,cod(p,'tecido')).refeitas,0,'nada foi contado como refeito');
 }},

/* ═══ 5. A ETIQUETA REFEITA — MESMO CODIGO, MARCADA ═══════════════════════ */

{nome:'4.16 — a etiqueta da refeita sai com o MESMO codigo e marcada',
 executar({igual,db}){
  limpar(db);
  const p=aprovado();
  const m=motivoDe('tubo','Tubo maior');
  ['tubo','base'].forEach(c=>fazer(p,c,SERRA)); fazer(p,'tecido',COLE);
  const oTubo=cod(p,'tubo');
  chamar('recusar',cod(p,'montagem'),{motivo_id:m.id},MONTA);

  /* ⚠️ A REIMPRESSAO E POR CODIGO, e nao pelo maco do pedido inteiro.
     Reimprimir o maco para refazer UMA peca poe na bancada etiquetas
     repetidas das pecas que nao foram recusadas — e duas etiquetas iguais em
     duas pecas e justamente o que a fase 4-A existe para impedir. */
  const lista=etqprod.paraImprimir({codigos:[oTubo]});
  igual(lista.length,1,'sai uma etiqueta so');
  igual(lista[0].codigo,oTubo,'com o mesmo codigo de sempre');
  igual(lista[0].refeitas,1,'e marcada como refeita');
 }},

{nome:'4.16 — o card Refazer lista a peca a refazer, e so ela',
 executar({igual,db}){
  limpar(db);
  const p=aprovado();
  const m=motivoDe('tecido','Tecido com defeito');
  ateOFim(p,EMBAL);
  chamar('recusar',cod(p,'embalagem'),{motivo_id:m.id},EMBAL);
  const refazer=chamar('aRefazer');
  igual(refazer.length,1,'uma peca a refazer');
  igual(refazer[0].codigo,cod(p,'tecido'),'e e o tecido');
  igual(refazer[0].setor,'colecao','no setor dele');
  igual(refazer[0].motivo,'Tecido com defeito','com o motivo da ultima recusa');
  igual(!!refazer[0].o_que_fazer,true,'e dizendo o que fazer, nao so o codigo');
  /* Feita de novo, ela sai da lista: card que nunca zera ninguem le. */
  fazer(p,'tecido',COLE);
  igual(chamar('aRefazer').length,0,'refeita, sai da lista');
 }}

];

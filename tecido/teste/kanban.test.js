// O KANBAN — secao 4.17 da spec SOBMEDIDA-PEDIDO-REVENDA (fase 6-A).
//
// ⚠️ ESTE ARQUIVO FOI ESCRITO ANTES DO `dominio/kanban.js`, e de proposito:
// risco vermelho da secao 0 do CLAUDE.md pede teste antes do codigo.
//
// O QUE ELE EXISTE PARA PROVAR, em quatro frases:
//
//   1. A ETAPA E DERIVADA, NUNCA GRAVADA. Ela sai de `marco` + `pronto_em` +
//      os bipes. Uma coluna de etapa no `sm_pedido` seria a segunda afirmacao
//      sobre o mesmo fato, e ela divergiria do `pronto_em` no primeiro bipe —
//      a armadilha #12 dentro do quadro.
//   2. AS COLUNAS SAO LIVRES, AS ETAPAS NAO. O nome da coluna e cadastro; o
//      que ela aponta e uma lista fechada em codigo. Renomear "Em producao"
//      nao pode desligar regra nenhuma, e e a spec que manda assim.
//   3. O KANBAN SO LE. Ele nao decide se a peca esta pronta — quem decide e o
//      `pronto_em` da 5-B1, e o `marco` continua sendo a trava que a
//      reimpressao da etiqueta e as duas contas da compra leem.
//   4. PEDIDO NAO SOME DO QUADRO EM SILENCIO. Etapa sem coluna ativa vira
//      linha de aviso com a contagem — senao desativar uma coluna faz
//      desaparecer trabalho que existe, que e o pior defeito de uma tela que
//      responde "onde esta o pedido X".
const pedido=require('../dominio/pedido');
const revendas=require('../dominio/revenda');
const catalogo=require('../dominio/catalogo_sm');
const tecido=require('../dominio/tecido');
const config=require('../nucleo/config');
const pessoas=require('../nucleo/pessoas');

function porta(caminho){
  let m=null; try{ m=require(caminho); }catch(e){ m=null; }
  return (metodo,...args)=>{
    if(!m||typeof m[metodo]!=='function')
      throw new Error(caminho+' nao expoe '+metodo+'()');
    return m[metodo](...args);
  };
}
const kb=porta('../dominio/kanban');
const prod=porta('../dominio/producao');

const DO_PCP=[{id:7, nome:'Renato'}];
const RENATO ={id:7, nome:'Renato', papel:'vendedor'};
const DIRETOR={id:1, nome:'Lucas', papel:'diretor',
  setores:['serralheria','colecao','montagem','revisao','embalagem']};
const banca=(nome,...setores)=>({id:90+setores.length, nome, papel:'producao', setores});
const SERRA=banca('Joao','serralheria');
const COLE =banca('Maria','colecao');
const MONTA=banca('Pedro','montagem');
const REVIS=banca('Ana','revisao');
const EMBAL=banca('Bia','embalagem');

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
  for(const t of ['sm_recusa','sm_pendencia']){ try{ db.prepare('DELETE FROM '+t).run(); }catch(e){} }
  for(const t of ['sm_pedido_componente','sm_pedido_item_preco','sm_pedido_alteracao',
                  'sm_pedido_marco','sm_pedido_prazo','sm_pedido_item','sm_pedido',
                  'sm_etiqueta_impressao'])
    db.prepare('DELETE FROM '+t).run();
  db.prepare('DELETE FROM sm_revenda').run();
  db.prepare('UPDATE sm_tabela_preco SET desconto_centesimos=NULL').run();
  config.gravar('pedidoNumeroInicial','5000','teste');
  /* ⚠️ AS COLUNAS VOLTAM AO ESTADO SEMEADO. Sem isto o caso que desativa uma
     coluna deixa o quadro quebrado para os de baixo, e a falha aparece no
     caso errado — teste que depende da ordem em que roda e teste que um dia
     mente (o cabecalho do `um.js` diz isso). */
  try{
    db.prepare('DELETE FROM sm_kanban_coluna').run();
    const ins=db.prepare('INSERT INTO sm_kanban_coluna(nome,etapa,ordem) VALUES(?,?,?)');
    [['Em edição','edicao',1],['Enviado','enviado',2],['Aprovado','aprovado',3],
     ['Em produção','producao',4],['Pronto','pronto',5],['Cancelado','cancelado',6]]
      .forEach(c=>ins.run(c[0],c[1],c[2]));
  }catch(e){}
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

// Um orçamento com uma peça, parado em edição.
function orcamento(extra){
  const b=cena();
  const p=pedido.criar({revenda_id:revendaCom().id, tipo:'pedido'},DIRETOR);
  pedido.acrescentarItem(p.id,peca(b,extra),DIRETOR);
  return pedido.porId(p.id);
}
const enviado=extra=>{
  const p=orcamento(extra);
  pedido.enviar(p.id,DIRETOR,'2026-09-22 10:00');
  return pedido.porId(p.id);
};
const aprovado=extra=>{ const p=enviado(extra); return pedido.aprovar(p.id,RENATO); };

const cod=(p,chave,n)=>{
  const item=p.itens[(n||1)-1];
  const c=item.componentes.find(x=>x.chave===chave);
  return c&&c.codigo_etiqueta;
};
const fazer=(p,chave,quem,n)=>{
  const c=cod(p,chave,n); prod('bipar',c,quem); return prod('bipar',c,quem);
};
const kitDe=(p,n)=>{
  const item=p.itens[(n||1)-1];
  return (item.componentes.find(x=>x.eh_kit)||{}).codigo_barras;
};
function ateOFim(p){
  ['tubo','base'].forEach(c=>fazer(p,c,SERRA));
  fazer(p,'tecido',COLE); fazer(p,'montagem',MONTA); fazer(p,'revisao',REVIS);
  const e=cod(p,'embalagem');
  prod('bipar',e,EMBAL); prod('biparKit',e,kitDe(p),EMBAL);
  return prod('bipar',e,EMBAL);
}
// O cartão de um pedido no quadro, venha de que coluna vier.
function cartao(numero_ou_id){
  const q=kb('quadro');
  for(const c of q.colunas)
    for(const x of c.cartoes)
      if(x.pedido_id===numero_ou_id) return Object.assign({coluna:c.nome, etapa:c.etapa},x);
  return null;
}
const colunaDe=etapa=>kb('quadro').colunas.find(c=>c.etapa===etapa);

module.exports=[

/* ═══ 1. A ETAPA — DERIVADA, E A LISTA E FECHADA ══════════════════════════ */

{nome:'4.17 — orçamento e pedido reaberto ficam na mesma etapa: EM EDIÇÃO',
 executar({igual,db}){
  limpar(db);
  const p=orcamento();
  igual(kb('etapaDe',pedido.porId(p.id)),'edicao','o orçamento está em edição');
  /* ⚠️ O PEDIDO REABERTO VOLTA PARA CÁ, e o número FICA (fase 3). Os dois
     estão sendo editados e nada foi prometido — é a mesma etapa. O que os
     separa na tela é o número, que só o reaberto tem. */
  pedido.enviar(p.id,DIRETOR,'2026-09-22 10:00');
  const numero=pedido.porId(p.id).numero;
  pedido.reabrir(p.id,'corrigir a medida',DIRETOR);
  igual(kb('etapaDe',pedido.porId(p.id)),'edicao','o reaberto voltou para edição');
  igual(pedido.porId(p.id).numero,numero,'e o número dele ficou');
 }},

{nome:'4.17 — enviado, aprovado, em produção e pronto são quatro etapas',
 executar({igual,db}){
  limpar(db);
  const p=enviado();
  igual(kb('etapaDe',pedido.porId(p.id)),'enviado','enviado espera o vendedor');
  const ap=pedido.aprovar(p.id,RENATO);
  igual(kb('etapaDe',pedido.porId(p.id)),'aprovado','aprovado, e ninguém bipou ainda');
  /* ⚠️ "EM PRODUÇÃO" É DERIVADO DO BIPE, e não de um marco. Basta UM
     componente iniciado: a partir daí há trabalho na bancada. */
  prod('bipar',cod(ap,'tubo'),SERRA);
  igual(kb('etapaDe',pedido.porId(p.id)),'producao','o primeiro bipe já move o pedido');
  prod('bipar',cod(ap,'tubo'),SERRA);            // e o segundo fecha o tubo
  ['base'].forEach(c=>fazer(ap,c,SERRA));
  fazer(ap,'tecido',COLE); fazer(ap,'montagem',MONTA); fazer(ap,'revisao',REVIS);
  const e=cod(ap,'embalagem');
  prod('bipar',e,EMBAL); prod('biparKit',e,kitDe(ap),EMBAL); prod('bipar',e,EMBAL);
  igual(kb('etapaDe',pedido.porId(p.id)),'pronto','e fechou');
 }},

{nome:'4.17 — CANCELADO vence todas as outras, inclusive o pronto',
 executar({igual,db}){
  limpar(db);
  const p=aprovado();
  ateOFim(p);
  igual(kb('etapaDe',pedido.porId(p.id)),'pronto','estava pronto');
  pedido.cancelar(p.id,'cliente desistiu',DIRETOR);
  /* Um pedido cancelado continua com `pronto_em` gravado — cancelar não
     apaga história. Se a ordem das perguntas fosse outra, ele apareceria na
     coluna Pronto para sempre. */
  igual(kb('etapaDe',pedido.porId(p.id)),'cancelado','e agora está cancelado');
 }},

{nome:'4.17 — a etapa NÃO é gravada: não existe coluna dela no pedido',
 executar({igual,db}){
  limpar(db);
  const p=aprovado();
  const cols=db.prepare("SELECT name FROM pragma_table_info('sm_pedido')").all().map(c=>c.name);
  /* ⚠️ UMA COLUNA `etapa` SERIA A SEGUNDA AFIRMAÇÃO SOBRE O MESMO FATO, e ela
     divergiria do `pronto_em` no primeiro bipe que ninguém replicasse — a
     armadilha #12 dentro do quadro. */
  igual(cols.includes('etapa'),false,'nada de coluna etapa');
  /* E a prova de que ela é derivada: mexer só no bipe muda a etapa. */
  igual(kb('etapaDe',pedido.porId(p.id)),'aprovado','antes do bipe');
  prod('bipar',cod(p,'tubo'),SERRA);
  igual(kb('etapaDe',pedido.porId(p.id)),'producao','depois do bipe, sem tocar no pedido');
 }},

{nome:'4.17 — o kanban SÓ LÊ: o marco e o pronto_em não se mexem',
 executar({igual,db}){
  limpar(db);
  const p=aprovado();
  ateOFim(p);
  const antes=db.prepare('SELECT marco, pronto_em FROM sm_pedido WHERE id=?').get(p.id);
  kb('quadro'); kb('quadro');
  const depois=db.prepare('SELECT marco, pronto_em FROM sm_pedido WHERE id=?').get(p.id);
  igual(depois.marco,antes.marco,'o marco continua o mesmo');
  /* ⚠️ E ELE CONTINUA `aprovado`, NÃO `pronto`. Três lugares filtram por
     `marco='aprovado'` — a reimpressão da etiqueta e as DUAS contas da
     compra (4-B e 4-C). É a dívida 15, e o kanban é onde ela vencia. */
  igual(depois.marco,'aprovado','e é aprovado, mesmo com o pedido pronto');
  igual(depois.pronto_em,antes.pronto_em,'e o pronto_em também');
 }},

/* ═══ 2. O QUADRO ═════════════════════════════════════════════════════════ */

{nome:'4.17 — o quadro traz as colunas na ordem do cadastro',
 executar({igual,db}){
  limpar(db);
  const etapas=kb('quadro').colunas.map(c=>c.etapa);
  igual(etapas.join(','),'edicao,enviado,aprovado,producao,pronto,cancelado',
    'a ordem é a do fluxo, e não a alfabética');
 }},

{nome:'4.17 — o cartão diz de quem é, para quando e quanto',
 executar({igual,db}){
  limpar(db);
  const p=enviado();
  const c=cartao(p.id);
  igual(!!c,true,'o pedido está no quadro');
  igual(c.etapa,'enviado','na coluna certa');
  igual(!!c.numero,true,'com o número');
  igual(/LAR/.test(String(c.revenda)),true,'a revenda: '+c.revenda);
  igual(!!c.prazo,true,'e o prazo');
  igual(typeof c.valor_total_centavos,'number','e o valor');
  /* Dias de FÁBRICA, como a fila do vendedor (fase 3) — três dias de
     calendário com feriado no meio podem ser zero de trabalho. */
  igual(c.dias_uteis!==undefined,true,'e os dias de fábrica');
 }},

{nome:'4.17 — a barrinha por setor conta o que falta, e é por SETOR',
 executar({igual,db}){
  limpar(db);
  const p=aprovado();
  let c=cartao(p.id);
  igual(c.setores.length,5,'os cinco setores no cartão');
  const ser=c.setores.find(s=>s.setor==='serralheria');
  igual(ser.total,2,'a serralheria tem tubo e base');
  igual(ser.feitos,0,'nenhum feito ainda');
  igual(ser.nome,'Serralheria','e o NOME do setor, nunca a chave');

  fazer(p,'tubo',SERRA);
  c=cartao(p.id);
  igual(c.setores.find(s=>s.setor==='serralheria').feitos,1,'um feito');
  fazer(p,'base',SERRA);
  igual(cartao(p.id).setores.find(s=>s.setor==='serralheria').feitos,2,'os dois');
 }},

{nome:'4.17 — a barrinha NÃO conta o kit: ele nunca é bipado',
 executar({igual,db}){
  limpar(db);
  const p=aprovado();
  const emb=cartao(p.id).setores.find(s=>s.setor==='embalagem');
  /* ⚠️ Cada persiana tem DUAS linhas de setor `embalagem` — o trabalho de
     embalar e o KIT que vai dentro. O kit não tem código e nunca termina:
     contá-lo deixaria a barrinha eternamente a uma peça do fim. Foi
     exatamente o defeito que o teste da 5-B1 pegou no Pronto. */
  igual(emb.total,1,'a embalagem é uma peça só na barrinha');
 }},

{nome:'4.17 — peça cancelada sai da barrinha, e o pedido continua no quadro',
 executar({igual,db}){
  limpar(db);
  const b=cena();
  const p0=pedido.criar({revenda_id:revendaCom().id, tipo:'pedido'},DIRETOR);
  pedido.acrescentarItem(p0.id,peca(b),DIRETOR);
  pedido.acrescentarItem(p0.id,peca(b),DIRETOR);
  pedido.enviar(p0.id,DIRETOR,'2026-09-22 10:00');
  const p=pedido.aprovar(p0.id,RENATO);
  igual(cartao(p.id).setores.find(s=>s.setor==='serralheria').total,4,'duas persianas, quatro peças');
  pedido.cancelarItem(p.id,p.itens[0].id,'errou a medida',DIRETOR);
  igual(cartao(p.id).setores.find(s=>s.setor==='serralheria').total,2,'a cancelada saiu');
  igual(!!cartao(p.id),true,'e o pedido continua no quadro');
 }},

{nome:'4.17 — quem ainda não tem ficha não tem barrinha, e isso não é falta',
 executar({igual,db}){
  limpar(db);
  const p=enviado();
  /* A ficha só é explodida na APROVAÇÃO (fase 3). Antes disso não há
     componente nenhum: uma barrinha zerada ali diria "nada foi feito"
     quando a verdade é "ainda não há o que fazer". */
  igual(cartao(p.id).setores.length,0,'sem barrinha antes da aprovação');
 }},

{nome:'4.17 — o selo de RETIDO é o "sem tecido" do envio',
 executar({igual,db}){
  limpar(db);
  const p=enviado();
  db.prepare('UPDATE sm_pedido SET sem_tecido=1 WHERE id=?').run(p.id);
  const c=cartao(p.id);
  igual(c.retido.length>0,true,'o selo aparece');
  igual(/tecido/i.test(c.retido[0]),true,'e diz o motivo: '+c.retido[0]);
  /* Crédito estourado é o outro selo da spec, e ele depende do boleto —
     que é a fase 6-C. Selo que nunca acende seria regra inerte. */
  db.prepare('UPDATE sm_pedido SET sem_tecido=0 WHERE id=?').run(p.id);
  igual(cartao(p.id).retido.length,0,'sem o sinal, sem selo');
 }},

{nome:'4.17 — pedido SEM VALOR LANÇADO não vale R$ 0,00: ele não vale nada AINDA',
 executar({igual,db}){
  limpar(db);
  const p=orcamento();
  const c=cartao(p.id);
  /* ⚠️ O valor do cartão é o que o ENVIO congelou (fase 3) — o orçamento
     ainda não tem nenhum, e o reaberto perdeu o dele. Escrever `R$ 0,00` ali
     se lê como "de graça", que é outra afirmação: é a regra 4 do custo, e
     foi o mesmo defeito que só apareceu renderizando a tela na fase 3.
     **Só apareceu abrindo a tela** aqui também. */
  igual(c.valor_total_centavos,null,'sem valor lançado, o cartão diz null');

  const col=colunaDe('edicao');
  igual(col.valor_total_centavos,null,'e a coluna não soma zero');
  /* E quando parte da coluna tem valor e parte não, o total é PISO — o `≥`
     que a fábrica já lê em toda tela de dinheiro deste projeto. */
  const e=enviado();
  db.prepare('UPDATE sm_pedido SET marco=?, valor_total_centavos=NULL WHERE id=?')
    .run('enviado',p.id);
  const ce=colunaDe('enviado');
  igual(ce.quantidade,2,'duas no enviado');
  igual(ce.valor_piso,true,'e o total dela é piso');
  igual(ce.valor_total_centavos>0,true,'somando só o que existe');
 }},

{nome:'4.17 — pedido CANCELADO não carrega selo de retido',
 executar({igual,db}){
  limpar(db);
  const p=enviado();
  db.prepare('UPDATE sm_pedido SET sem_tecido=1 WHERE id=?').run(p.id);
  igual(cartao(p.id).retido.length,1,'enviado e sem tecido: o selo aparece');
  pedido.cancelar(p.id,'cliente desistiu',DIRETOR);
  /* "Retido" quer dizer que o pedido está PARADO esperando alguma coisa. O
     cancelado não espera nada — o selo ali é ruído numa coluna que já é toda
     de pedido morto, e ruído permanente é o que faz a equipe parar de ler o
     selo no cartão em que ele significa alguma coisa (§5). */
  igual(cartao(p.id).retido.length,0,'cancelado não tem o que reter');
 }},

{nome:'4.17 — o quadro resume: quantos cartões e quanto vale cada coluna',
 executar({igual,db}){
  limpar(db);
  enviado(); enviado();
  const col=colunaDe('enviado');
  igual(col.quantidade,2,'duas no enviado');
  igual(col.valor_total_centavos>0,true,'e o valor somado da coluna');
  igual(colunaDe('pronto').quantidade,0,'e a coluna vazia diz zero');
 }},

/* ═══ 3. AS COLUNAS SÃO CADASTRO; AS ETAPAS, NÃO ══════════════════════════ */

{nome:'4.17 — coluna apontando para etapa que não existe é recusada',
 executar({igual,recusa,db}){
  limpar(db);
  let msg='';
  try{ kb('criarColuna',{nome:'Entregue', etapa:'entregue'}); }catch(e){ msg=e.message||''; }
  recusa(()=>kb('criarColuna',{nome:'Entregue', etapa:'entregue'}),
    'etapa_inexistente','entregue ainda não existe no sob medida');
  /* A recusa DIZ quais existem: sem isso quem cadastra tenta de novo com
     outro palpite, e a trava vira adivinhação. */
  igual(/edicao|edição/.test(msg)&&/pronto/.test(msg),true,
    'e a frase lista as etapas: '+msg);
 }},

{nome:'4.17 — duas colunas para a MESMA etapa são recusadas',
 executar({igual,recusa,db}){
  limpar(db);
  let msg='';
  try{ kb('criarColuna',{nome:'Na fábrica', etapa:'producao'}); }catch(e){ msg=e.message||''; }
  /* Duas colunas na mesma etapa mostrariam o MESMO cartão duas vezes, e
     quem vê o pedido em dois lugares para de confiar na tela inteira. */
  recusa(()=>kb('criarColuna',{nome:'Na fábrica', etapa:'producao'}),
    'etapa_repetida','a etapa já tem coluna');
  igual(/produ/i.test(msg),true,'e a frase diz qual coluna já a tem: '+msg);
 }},

{nome:'4.17 — coluna sem nome é recusada, e o nome se renomeia sem mexer na etapa',
 executar({igual,recusa,db}){
  limpar(db);
  recusa(()=>kb('criarColuna',{nome:'  ', etapa:'pronto'}),'nome_vazio','sem nome');
  const col=colunaDe('producao');
  kb('atualizarColuna',col.id,{nome:'Na bancada'});
  const depois=colunaDe('producao');
  igual(depois.nome,'Na bancada','renomeou');
  /* ⚠️ AS COLUNAS SÃO LIVRES, AS ETAPAS NÃO — é a frase da spec. Renomear
     "Em produção" não pode desligar regra nenhuma, porque quem decide é a
     etapa, e ela é código. */
  igual(depois.etapa,'producao','e a etapa não se mexeu');
 }},

{nome:'4.17 — desativar a coluna NÃO some com o pedido: ele vira aviso',
 executar({igual,db}){
  limpar(db);
  const p=enviado();
  igual(!!cartao(p.id),true,'está no quadro');
  kb('atualizarColuna',colunaDe('enviado').id,{ativo:0});

  const q=kb('quadro');
  igual(q.colunas.some(c=>c.etapa==='enviado'),false,'a coluna sumiu');
  /* ⚠️ E O PEDIDO NÃO. Tela que responde "onde está o pedido X" não pode
     fazer trabalho desaparecer porque alguém mexeu num cadastro. */
  igual(q.fora.length,1,'e virou aviso');
  igual(q.fora[0].etapa,'enviado','dizendo a etapa');
  igual(q.fora[0].quantidade,1,'e quantos ficaram de fora');
  igual(/[Ee]nviado/.test(String(q.fora[0].etapa_nome||q.fora[0].etapa)),true,
    'com o nome legível, nunca só a chave');
 }},

{nome:'4.17 — etapa sem pedido nenhum não vira aviso',
 executar({igual,db}){
  limpar(db);
  kb('atualizarColuna',colunaDe('cancelado').id,{ativo:0});
  /* Aviso que aparece todo dia sem nada atrás é paisagem, e aí ninguém o lê
     no dia em que ele significa alguma coisa — a regra do card de caixa de
     várias peças do §5 do CLAUDE.md. */
  igual(kb('quadro').fora.length,0,'coluna desativada e vazia não avisa nada');
 }},

{nome:'4.17 — a coluna desativada volta, e os cartões voltam com ela',
 executar({igual,db}){
  limpar(db);
  const p=enviado();
  const id=colunaDe('enviado').id;
  kb('atualizarColuna',id,{ativo:0});
  igual(cartao(p.id),null,'saiu do quadro');
  kb('atualizarColuna',id,{ativo:1});
  igual(!!cartao(p.id),true,'e voltou');
  igual(kb('quadro').fora.length,0,'sem aviso sobrando');
 }},

{nome:'4.17 — o cadastro lista as colunas inativas também',
 executar({igual,db}){
  limpar(db);
  kb('atualizarColuna',colunaDe('pronto').id,{ativo:0});
  /* O quadro mostra o que está ativo; o CADASTRO mostra tudo, senão a
     coluna desativada não tem por onde voltar — é a linha inativa do
     cadastro de SKU (§7), onde reativar é um caminho que ninguém adivinha. */
  igual(kb('colunas').length,6,'as seis continuam no cadastro');
  igual(kb('colunas').filter(c=>c.ativo).length,5,'cinco ativas');
 }},

/* ═══ 4. O QUE O QUADRO NÃO INVENTA ═══════════════════════════════════════ */

{nome:'4.17 — não há etapa de ENTREGUE nem selo de NF, e é decisão',
 executar({igual,db}){
  limpar(db);
  /* Nada no sob medida marca entrega nem nota fiscal hoje. Uma coluna que
     nunca recebe cartão é paisagem, e um selo que nunca acende é regra
     escrita que não pega em ninguém — a dívida 18 do CLAUDE.md. Os dois
     nascem na fase 6-C, junto com o que os torna verdadeiros. */
  igual(kb('etapas').some(e=>e.chave==='entregue'),false,'entregue fica para a 6-C');
  const p=aprovado();
  igual(cartao(p.id).retido.some(x=>/nota|NF/i.test(x)),false,'e não há selo de NF');
 }},

{nome:'4.17 — a lista de etapas é FECHADA, e cada uma tem nome legível',
 executar({igual,db}){
  limpar(db);
  const es=kb('etapas');
  igual(es.length,6,'seis etapas');
  igual(es.every(e=>e.chave&&e.nome&&e.nome!==e.chave),true,
    'e nenhuma mostra a chave como nome — chave de banco em tela é o "— Correcao de contagem" do §2');
 }},

{nome:'4.17 — pedido de outra revenda e de outro vendedor aparece igual',
 executar({igual,db}){
  limpar(db);
  const a=enviado(), b=enviado();
  igual(colunaDe('enviado').quantidade,2,'os dois no quadro');
  igual(cartao(a.id).revenda!==cartao(b.id).revenda,true,'cada um com a revenda dele');
 }}

];

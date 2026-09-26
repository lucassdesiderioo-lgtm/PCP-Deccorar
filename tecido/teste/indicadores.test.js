// OS INDICADORES — secao 4.17 da spec SOBMEDIDA-PEDIDO-REVENDA (fase 6-B).
//
// ⚠️ ESTE ARQUIVO FOI ESCRITO ANTES DO CODIGO, e de proposito: a fase mexe no
// schema (o parametro do limite), entao e risco vermelho da secao 0 do
// CLAUDE.md, e ali o teste vem antes do conserto. As regras daqui saem da
// spec e do desenho, nunca do que o codigo devolveu.
//
// O QUE ELE EXISTE PARA PROVAR, em cinco frases:
//
//   1. A REGUA DO BIPE SUSPEITO E UMA SO, e vale para os TRES indicadores de
//      tempo. "Esqueceu de bipar o fim e foi almocar: a peca levou tres
//      horas" esta escrito na propria §4.17. Duas reguas para "este tempo
//      presta?" seria a armadilha #12 dentro de um numero.
//   2. NUMERO INCOMPLETO NAO VIRA NUMERO CERTO. Peca com bipe descartado tem
//      a soma menor do que foi — entrar na media a puxa para baixo em
//      silencio. E a regra 4 do custo (custo indefinido nunca vira zero).
//   3. TEMPO POR m² USA O m² REAL, NUNCA O COBRADO. O cobrado carrega o
//      minimo faturado de 1,5 m² (§4.8): pelo cobrado a peca pequena
//      pareceria mais rapida por m² do que e. A bancada corta o real.
//   4. PRAZO CUMPRIDO SAO DOIS NUMEROS. Prometido e negociado separados
//      (§4.9) — somados, o pedido empurrado pareceria entregue em dia.
//   5. RECUSA CONTA NO SETOR DO CULPADO. A pergunta e de onde vem o defeito;
//      contar em quem recusou acusaria a bancada que ACHOU o erro.
const pedido=require('../dominio/pedido');
const revendas=require('../dominio/revenda');
const catalogo=require('../dominio/catalogo_sm');
const tecido=require('../dominio/tecido');
const config=require('../nucleo/config');
const pessoas=require('../nucleo/pessoas');

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
const ind=porta('../dominio/indicadores');
const chamar=porta('../dominio/producao');
const motivo=porta('../dominio/motivo_producao');

const DO_PCP=[{id:7, nome:'Renato'},{id:8, nome:'Carla'}];
const RENATO ={id:7, nome:'Renato', papel:'vendedor'};
const CARLA  ={id:8, nome:'Carla',  papel:'vendedor'};
const DIRETOR={id:1, nome:'Lucas',  papel:'diretor',
  setores:['serralheria','colecao','montagem','revisao','embalagem']};
const banca=(id,nome,...setores)=>({id, nome, papel:'producao', setores});
const SERRA =banca(90,'Joao','serralheria');
const SERRA2=banca(95,'Tiago','serralheria');
const COLE  =banca(91,'Maria','colecao');
const MONTA =banca(92,'Pedro','montagem');
const REVIS =banca(93,'Ana','revisao');
const EMBAL =banca(94,'Bia','embalagem');

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
  // A ORDEM E A DOS PONTEIROS (§12): recusa e pendencia apontam o COMPONENTE.
  for(const t of ['sm_recusa','sm_pendencia']){ try{ db.prepare('DELETE FROM '+t).run(); }catch(e){} }
  for(const t of ['sm_pedido_componente','sm_pedido_item_preco','sm_pedido_alteracao',
                  'sm_pedido_marco','sm_pedido_prazo','sm_pedido_item','sm_pedido',
                  'sm_etiqueta_impressao'])
    db.prepare('DELETE FROM '+t).run();
  db.prepare('DELETE FROM sm_revenda').run();
  try{ db.prepare('DELETE FROM sm_motivo_producao').run(); }catch(e){}
  db.prepare('UPDATE sm_tabela_preco SET desconto_centesimos=NULL').run();
  config.gravar('pedidoNumeroInicial','5000','teste');
  try{ config.gravar('bipeAbertoMaxHoras','2','teste'); }catch(e){}
  cena();
}

let nRev=0;
function revendaCom(vendedorId){
  const t=revendas.tabelas()[0];
  revendas.definirDescontoTabela(t.id,500,{nome:'teste'});
  const r=revendas.criar({razao_social:'Revenda '+(++nRev)+' LTDA',
    nome_fantasia:'LAR '+nRev, tabela_id:t.id, desconto_centesimos:0},DIRETOR);
  revendas.definirVendedor(r.id,vendedorId||7,DIRETOR);
  return revendas.porId(r.id);
}

function aprovado(pecas,quem,vendedorId){
  const b=cena();
  const p=pedido.criar({revenda_id:revendaCom(vendedorId).id, tipo:'pedido'},DIRETOR);
  (pecas||[{}]).forEach(x=>pedido.acrescentarItem(p.id,peca(b,x),DIRETOR));
  pedido.enviar(p.id,DIRETOR,'2026-09-22 10:00');
  return pedido.aprovar(p.id,quem||RENATO);
}

const cod=(p,chave,n)=>{
  const item=p.itens[(n||1)-1];
  const c=item.componentes.find(x=>x.chave===chave);
  return c&&c.codigo_etiqueta;
};
const kitDe=(p,n)=>{
  const item=p.itens[(n||1)-1];
  return (item.componentes.find(x=>x.eh_kit)||{}).codigo_barras;
};
const fazer=(p,chave,quem,n)=>{
  const c=cod(p,chave,n); chamar('bipar',c,quem); return chamar('bipar',c,quem);
};
// Leva a persiana `n` inteira ate a embalagem fechada.
function ateOFim(p,n){
  ['tubo','base'].forEach(c=>fazer(p,c,SERRA,n));
  fazer(p,'tecido',COLE,n);
  fazer(p,'montagem',MONTA,n);
  fazer(p,'revisao',REVIS,n);
  const e=cod(p,'embalagem',n);
  chamar('bipar',e,EMBAL);
  chamar('biparKit',e,kitDe(p,n),EMBAL);
  return chamar('bipar',e,EMBAL);
}

/* MONTAGEM DE CENARIO: o bipe grava o relogio do banco, e aqui a duracao E o
   assunto. Escrever a hora na mao e o unico jeito de ter um caso de meia hora
   e um de tres horas sem esperar tres horas. */
/* ⚠️ SO MEXE EM BIPE QUE JA FECHOU. Sem o `terminado_em IS NOT NULL` o
   helper carimbava hora nas seis etiquetas — inclusive nas que ninguem
   bipou —, e a persiana pela metade passava a parecer completa. O caso da
   peca incompleta ficava verde por causa do proprio helper, que e o teste
   concordando com o que devia pegar (a licao do QR, §4 do CLAUDE.md). */
const dur=(db,codigo,ini,fim)=>db.prepare(
  'UPDATE sm_pedido_componente SET iniciado_em=?, terminado_em=? '+
  'WHERE codigo_etiqueta=? AND terminado_em IS NOT NULL')
  .run(ini,fim,codigo);
const abrir=(db,codigo,ini)=>db.prepare(
  'UPDATE sm_pedido_componente SET iniciado_em=?, terminado_em=NULL, terminado_por=NULL '+
  'WHERE codigo_etiqueta=?').run(ini,codigo);
const horasAtras=(db,h)=>db.prepare(
  "SELECT datetime('now','localtime','-'||?||' hours') v").get(String(h)).v;

// Meia hora em cada uma das seis etiquetas da persiana, num dia so.
function meiaHoraEmTudo(db,p,n,dia){
  const d=dia||'2026-09-23';
  let h=8;
  for(const c of ['tubo','base','tecido','montagem','revisao','embalagem']){
    const codigo=cod(p,c,n);
    if(codigo) dur(db,codigo,d+' '+String(h).padStart(2,'0')+':00:00',
                            d+' '+String(h).padStart(2,'0')+':30:00');
    h++;
  }
}
const bloco=(r,nome)=>r[nome]||{};
const acha=(lista,campo,valor)=>(lista||[]).find(x=>x[campo]===valor);

module.exports=[

/* ═══ 1. O PARAMETRO E A REGUA DO BIPE SUSPEITO ══════════════════════════ */

{nome:'4.17 — o limite do bipe aberto e CADASTRO, com rotulo e ajuda',
 executar({igual,db}){
  limpar(db);
  const p=config.listar().find(x=>x.chave==='bipeAbertoMaxHoras');
  igual(!!p,true,'o parametro existe');
  igual(p.tipo,'numero','e numero');
  igual(!!(p.rotulo&&p.ajuda),true,'e tem rotulo e ajuda — parametro sem explicacao e numero magico com campo');
 }},

{nome:'4.17 — limite zero, negativo ou absurdo e RECUSADO, nunca aceito calado',
 executar({recusa,igual,db}){
  limpar(db);
  /* Parametro aceito fora da faixa nao da erro: ele muda a conta em silencio,
     que e o motivo pelo qual o FAIXA do config.js existe. Zero descartaria
     TODOS os bipes e os indicadores nasceriam vazios com cara de fabrica
     parada. */
  recusa(()=>config.gravar('bipeAbertoMaxHoras','0','teste'),'valor_invalido','zero');
  recusa(()=>config.gravar('bipeAbertoMaxHoras','-1','teste'),'valor_invalido','negativo');
  recusa(()=>config.gravar('bipeAbertoMaxHoras','48','teste'),'valor_invalido','dois dias');
  igual(config.ler('bipeAbertoMaxHoras'),2,'e o valor gravado nao se mexeu');
 }},

{nome:'4.17 — bipe acima do limite sai dos TRES indicadores de tempo (a regua e uma so)',
 executar({igual,perto,db}){
  limpar(db);
  const p=aprovado(); ateOFim(p,1);
  meiaHoraEmTudo(db,p,1);
  // A montagem "levou" tres horas: e o exemplo escrito na propria §4.17.
  dur(db,cod(p,'montagem'),'2026-09-23 11:00:00','2026-09-23 14:00:00');

  const r=ind('painel',{});
  const esf=bloco(r,'esforco'), m2=bloco(r,'porM2'), pr=bloco(r,'produtividade');
  igual(esf.pecas_completas,0,'a peca ficou INCOMPLETA — o bipe descartado nao vira peca certa');
  igual(esf.horas_por_peca,null,'entao nao ha media de horas-homem, e nao ha zero no lugar dela');
  igual(m2.total,null,'nem tempo por m²');
  const pedro=acha(pr.pessoas,'pessoa','Pedro');
  igual(pedro===undefined||pedro.horas===0,true,'e as tres horas do Pedro nao entram na produtividade dele');
  perto(bloco(r,'suspeitos').horas_descartadas,3,'e as tres horas aparecem como descartadas',0.01);
 }},

{nome:'4.17 — o bipe descartado APARECE, dizendo qual peca, quem e quanto',
 executar({igual,perto,db}){
  limpar(db);
  const p=aprovado(); ateOFim(p,1);
  meiaHoraEmTudo(db,p,1);
  dur(db,cod(p,'montagem'),'2026-09-23 11:00:00','2026-09-23 14:00:00');

  const s=bloco(ind('painel',{}),'suspeitos');
  igual(s.lista.length,1,'um so');
  const l=s.lista[0];
  igual(l.codigo,cod(p,'montagem'),'a etiqueta');
  igual(l.setor_nome,'Montagem','o NOME do setor, nunca a chave');
  igual(l.pessoa,'Pedro','quem bipou');
  perto(l.horas,3,'quanto',0.01);
  igual(l.aberto,false,'este fechou — so demorou demais');
 }},

{nome:'4.17 — bipe ABERTO ha mais que o limite tambem e pendencia, e nao conta como feito',
 executar({igual,db}){
  limpar(db);
  const p=aprovado();
  fazer(p,'tubo',SERRA);
  abrir(db,cod(p,'tubo'),horasAtras(db,5));

  const s=bloco(ind('painel',{}),'suspeitos');
  igual(s.lista.length,1,'o tubo esquecido aberto');
  igual(s.lista[0].aberto,true,'e a tela precisa saber que ele ainda esta aberto: o conserto e outro');
  igual(s.lista[0].pessoa,'Joao','quem abriu');
  const pr=bloco(ind('painel',{}),'produtividade');
  const joao=acha(pr.pessoas,'pessoa','Joao');
  igual(joao===undefined,true,'e ninguem ganha peca por bipe que nao fechou');
 }},

{nome:'4.17 — bipe aberto DENTRO do limite nao e suspeito (trava no caso normal e a #6)',
 executar({igual,db}){
  limpar(db);
  const p=aprovado();
  fazer(p,'tubo',SERRA);
  abrir(db,cod(p,'tubo'),horasAtras(db,1));
  igual(bloco(ind('painel',{}),'suspeitos').lista.length,0,
    'quem esta trabalhando agora nao e pendencia');
 }},

{nome:'4.17 — mudar o parametro muda a classificacao (e cadastro, nao constante no codigo)',
 executar({igual,db}){
  limpar(db);
  const p=aprovado(); ateOFim(p,1);
  meiaHoraEmTudo(db,p,1);
  dur(db,cod(p,'montagem'),'2026-09-23 11:00:00','2026-09-23 14:00:00');
  igual(bloco(ind('painel',{}),'suspeitos').lista.length,1,'com 2 h de limite, as 3 h sao suspeitas');
  config.gravar('bipeAbertoMaxHoras','4','teste');
  igual(bloco(ind('painel',{}),'suspeitos').lista.length,0,'com 4 h, nao sao mais');
  igual(bloco(ind('painel',{}),'esforco').pecas_completas,1,'e a peca volta a ser completa');
 }},

/* ═══ 2. HORAS-HOMEM POR PECA E POR PEDIDO ═══════════════════════════════ */

{nome:'4.17 — horas-homem da peca e a soma dos SETORES dela',
 executar({perto,igual,db}){
  limpar(db);
  const p=aprovado(); ateOFim(p,1);
  meiaHoraEmTudo(db,p,1);
  const e=bloco(ind('painel',{}),'esforco');
  igual(e.pecas_completas,1,'uma peca completa');
  perto(e.horas_por_peca,3,'seis etiquetas de meia hora = 3 h',0.01);
 }},

{nome:'4.17 — por PEDIDO e a soma das pecas dele',
 executar({perto,igual,db}){
  limpar(db);
  const p=aprovado([{},{}]);
  ateOFim(p,1); ateOFim(p,2);
  meiaHoraEmTudo(db,p,1); meiaHoraEmTudo(db,p,2);
  const e=bloco(ind('painel',{}),'esforco');
  igual(e.por_pedido.length,1,'um pedido');
  igual(e.por_pedido[0].pecas,2,'com duas persianas');
  perto(e.por_pedido[0].horas,6,'e 6 h no total',0.01);
 }},

{nome:'4.17 — peca com bipe descartado nao entra na media com o numero MENOR',
 executar({perto,igual,db}){
  limpar(db);
  const p=aprovado([{},{}]);
  ateOFim(p,1); ateOFim(p,2);
  meiaHoraEmTudo(db,p,1); meiaHoraEmTudo(db,p,2);
  // So a peca 2 tem um bipe estourado.
  dur(db,cod(p,'montagem',2),'2026-09-23 11:00:00','2026-09-23 14:00:00');
  const e=bloco(ind('painel',{}),'esforco');
  igual(e.pecas_completas,1,'so a peca 1 conta');
  igual(e.pecas_incompletas,1,'e a outra e dita, nao escondida');
  /* Se a peca 2 entrasse, a media cairia de 3 h para 2,75 h — menor que
     qualquer uma das duas, e nada na tela diria por que. */
  perto(e.horas_por_peca,3,'a media e a da peca inteira, nao a contaminada',0.01);
 }},

{nome:'4.17 — peca CANCELADA nao entra no esforco',
 executar({igual,perto,db}){
  limpar(db);
  const p=aprovado([{},{}]);
  ateOFim(p,1); ateOFim(p,2);
  meiaHoraEmTudo(db,p,1); meiaHoraEmTudo(db,p,2);
  pedido.cancelarItem(p.id,p.itens[1].id,'cliente desistiu',DIRETOR);
  const e=bloco(ind('painel',{}),'esforco');
  igual(e.pecas_completas,1,'a cancelada sai — ela fica na lista do pedido, mas nao e trabalho');
  perto(e.por_pedido[0].horas,3,'e o pedido conta so a que ficou',0.01);
 }},

{nome:'4.17 — o KIT nao entra: ele nao tem codigo e nunca termina',
 executar({igual,db}){
  limpar(db);
  const p=aprovado(); ateOFim(p,1);
  meiaHoraEmTudo(db,p,1);
  /* Cada persiana tem DUAS linhas de setor `embalagem` — o trabalho e o kit
     que vai dentro. Contar o kit deixaria a peca eternamente a um bipe do
     fim: foi exatamente o defeito que o teste da 5-B1 pegou no Pronto. */
  igual(bloco(ind('painel',{}),'esforco').pecas_completas,1,
    'a peca fecha mesmo com o kit sem bipe');
 }},

/* ═══ 3. TEMPO POR m² ════════════════════════════════════════════════════ */

{nome:'4.17 — tempo por m² usa o m² REAL, nunca o cobrado',
 executar({perto,igual,db}){
  limpar(db);
  // 1,000 × 1,000 = 1 m² real, e 1,5 m² COBRADO (o minimo faturado da §4.8).
  const p=aprovado(); ateOFim(p,1);
  meiaHoraEmTudo(db,p,1);
  const m2=bloco(ind('painel',{}),'porM2');
  igual(m2.m2,1,'um metro quadrado de trabalho');
  /* Pelo cobrado dariam 2 h/m², e a peca pequena pareceria mais rapida do
     que e. A bancada corta o real. */
  perto(m2.total,3,'3 h para 1 m² real',0.01);
 }},

{nome:'4.17 — tempo por m² sai por SETOR e no total',
 executar({perto,igual,db}){
  limpar(db);
  const p=aprovado(); ateOFim(p,1);
  meiaHoraEmTudo(db,p,1);
  const m2=bloco(ind('painel',{}),'porM2');
  const serra=acha(m2.setores,'setor','serralheria');
  igual(serra.setor_nome,'Serralheria','o nome, nao a chave');
  perto(serra.horas_por_m2,1,'tubo + base = 1 h por m²',0.01);
  const mont=acha(m2.setores,'setor','montagem');
  perto(mont.horas_por_m2,0.5,'a montagem, meia hora',0.01);
 }},

{nome:'4.17 — peca incompleta fica fora do tempo por m²',
 executar({igual,db}){
  limpar(db);
  const p=aprovado();
  ['tubo','base'].forEach(c=>fazer(p,c,SERRA));
  meiaHoraEmTudo(db,p,1);
  igual(bloco(ind('painel',{}),'porM2').total,null,
    'persiana pela metade nao diz quanto tempo leva uma persiana');
 }},

/* ═══ 4. PRODUTIVIDADE ═══════════════════════════════════════════════════ */

{nome:'4.17 — produtividade por PESSOA sai dos bipes',
 executar({perto,igual,db}){
  limpar(db);
  const p=aprovado(); ateOFim(p,1);
  meiaHoraEmTudo(db,p,1);
  const pr=bloco(ind('painel',{}),'produtividade');
  const joao=acha(pr.pessoas,'pessoa','Joao');
  igual(joao.pecas,2,'o Joao fez tubo e base');
  perto(joao.horas,1,'uma hora',0.01);
  perto(joao.horas_por_peca,0.5,'meia hora cada',0.01);
 }},

{nome:'4.17 — e por SETOR, que nao e a mesma pergunta',
 executar({perto,igual,db}){
  limpar(db);
  const p=aprovado(); ateOFim(p,1);
  meiaHoraEmTudo(db,p,1);
  // Um segundo serralheiro na mesma bancada: a pessoa muda, o setor nao.
  db.prepare('UPDATE sm_pedido_componente SET terminado_por=? WHERE codigo_etiqueta=?')
    .run('Tiago',cod(p,'base'));
  const pr=bloco(ind('painel',{}),'produtividade');
  const serra=acha(pr.setores,'setor','serralheria');
  igual(serra.pecas,2,'a serralheria fez duas');
  igual(acha(pr.pessoas,'pessoa','Joao').pecas,1,'o Joao, uma');
  igual(acha(pr.pessoas,'pessoa','Tiago').pecas,1,'e o Tiago, a outra');
 }},

{nome:'4.17 — o bipe APAGADO pela recusa nao conta, e quem o fez sobrevive na recusa',
 executar({igual,db}){
  limpar(db);
  const p=aprovado();
  ['tubo','base'].forEach(c=>fazer(p,c,SERRA));
  fazer(p,'tecido',COLE);
  chamar('bipar',cod(p,'montagem'),MONTA);
  const m=motivo('criar',{nome:'Tubo maior',componente_chave:'tubo'});
  chamar('recusar',cod(p,'montagem'),{motivo_id:m.id},MONTA);

  const pr=bloco(ind('painel',{}),'produtividade');
  const joao=acha(pr.pessoas,'pessoa','Joao');
  /* A reabertura apagou o bipe do tubo: o Joao fica com a BASE. A
     produtividade conta o trabalho que esta de pe. */
  igual(joao.pecas,1,'so a base');
  const rec=bloco(ind('painel',{}),'recusas');
  igual(acha(rec.pessoas,'pessoa','Joao').recusas,1,
    'e quem tinha feito o tubo so sobrevive na sm_recusa — por isso ela guarda o retrato');
 }},

/* ═══ 5. TEMPO DE APROVACAO ══════════════════════════════════════════════ */

{nome:'4.17 — tempo de aprovacao e MEDIANA, e a sexta-feira nao envenena a conta',
 executar({perto,igual,db}){
  limpar(db);
  const ps=[];
  for(let i=0;i<5;i++) ps.push(aprovado());
  // Quatro de uma hora, e um enviado na sexta 18h aprovado na segunda 9h.
  const horas=[1,1,1,1,63];
  ps.forEach((p,i)=>db.prepare(
    "UPDATE sm_pedido SET enviado_em='2026-09-18 09:00:00', "+
    "aprovado_em=datetime('2026-09-18 09:00:00','+'||?||' hours') WHERE id=?")
    .run(String(horas[i]),p.id));

  const a=bloco(ind('painel',{}),'aprovacao');
  const renato=acha(a.vendedores,'vendedor','Renato');
  igual(renato.pedidos,5,'cinco aprovados');
  perto(renato.horas_mediana,1,'a mediana aguenta a sexta-feira',0.01);
  /* A media daria 13,4 h — maior que quatro dos cinco casos, e nada na tela
     diria por que. */
  perto(renato.horas_maior,63,'e o pior caso vai junto, para ninguem confundir mediana com teto',0.01);
 }},

{nome:'4.17 — a aprovacao e por VENDEDOR, separada',
 executar({perto,igual,db}){
  limpar(db);
  const a1=aprovado(null,RENATO,7);
  const a2=aprovado(null,CARLA,8);
  db.prepare("UPDATE sm_pedido SET enviado_em='2026-09-18 09:00:00', "+
    "aprovado_em=datetime('2026-09-18 09:00:00','+2 hours') WHERE id=?").run(a1.id);
  db.prepare("UPDATE sm_pedido SET enviado_em='2026-09-18 09:00:00', "+
    "aprovado_em=datetime('2026-09-18 09:00:00','+8 hours') WHERE id=?").run(a2.id);
  const a=bloco(ind('painel',{}),'aprovacao');
  perto(acha(a.vendedores,'vendedor','Renato').horas_mediana,2,'o Renato',0.01);
  perto(acha(a.vendedores,'vendedor','Carla').horas_mediana,8,'a Carla',0.01);
 }},

{nome:'4.17 — pedido ainda NAO aprovado nao entra no tempo de aprovacao',
 executar({igual,db}){
  limpar(db);
  const b=cena();
  const p=pedido.criar({revenda_id:revendaCom().id, tipo:'pedido'},DIRETOR);
  pedido.acrescentarItem(p.id,peca(b),DIRETOR);
  pedido.enviar(p.id,DIRETOR,'2026-09-22 10:00');
  const a=bloco(ind('painel',{}),'aprovacao');
  igual((a.vendedores||[]).length,0,'quem ainda nao aprovou nao tem tempo de aprovacao — tem espera');
  igual(a.nada,'nunca','e a tela diz que nao ha nenhum, em vez de escrever zero hora');
 }},

/* ═══ 6. PARADOS NA APROVACAO ════════════════════════════════════════════ */

{nome:'4.17 — parado na aprovacao e so o ENVIADO, com os dias de fabrica restantes',
 executar({igual,db}){
  limpar(db);
  const b=cena();
  aprovado();                                     // este ja andou
  const p=pedido.criar({revenda_id:revendaCom().id, tipo:'pedido'},DIRETOR);
  pedido.acrescentarItem(p.id,peca(b),DIRETOR);
  pedido.enviar(p.id,DIRETOR,'2026-09-22 10:00');

  const par=bloco(ind('painel',{}),'parados');
  igual(par.lista.length,1,'so o que espera aprovacao');
  igual(par.lista[0].numero,pedido.porId(p.id).numero,'o numero do pedido');
  igual(typeof par.lista[0].dias_uteis_restantes,'number','com os dias de fabrica ate o prazo');
 }},

{nome:'4.17 — prazo vencido fica NEGATIVO, e nao cortado em zero',
 executar({igual,db}){
  limpar(db);
  const b=cena();
  const p=pedido.criar({revenda_id:revendaCom().id, tipo:'pedido'},DIRETOR);
  pedido.acrescentarItem(p.id,peca(b),DIRETOR);
  pedido.enviar(p.id,DIRETOR,'2026-09-22 10:00');
  db.prepare("UPDATE sm_pedido SET prazo_atual='2026-01-05' WHERE id=?").run(p.id);
  const l=bloco(ind('painel',{}),'parados').lista[0];
  /* Zerar apagaria o sinal e deixaria o atrasado com a mesma cara de quem
     vence hoje — o MAX(0,…) do saldo do PCP pela porta do prazo. */
  igual(l.dias_uteis_restantes<0,true,'vencido conta para baixo');
 }},

/* ═══ 7. PRAZO CUMPRIDO ══════════════════════════════════════════════════ */

{nome:'4.17 — prometido e negociado sao DOIS numeros, nunca um',
 executar({igual,db}){
  limpar(db);
  const p=aprovado(); ateOFim(p,1);
  /* Prometido para o dia 1, negociado para o 20, pronto no 10: cumpriu o
     negociado e furou o prometido. Um numero so esconderia metade — e e
     sempre a metade ruim (§4.9). */
  db.prepare("UPDATE sm_pedido SET prazo_prometido='2026-10-01', prazo_atual='2026-10-20', "+
    "pronto_em='2026-10-10 15:00:00' WHERE id=?").run(p.id);
  const pz=bloco(ind('painel',{}),'prazo');
  igual(pz.prontos,1,'um pedido pronto');
  igual(pz.cumpriu_prometido,0,'furou o prometido');
  igual(pz.cumpriu_negociado,1,'e cumpriu o negociado');
 }},

{nome:'4.17 — pedido sem `pronto_em` nao entra no prazo cumprido',
 executar({igual,db}){
  limpar(db);
  const p=aprovado();
  ['tubo','base'].forEach(c=>fazer(p,c,SERRA));
  const pz=bloco(ind('painel',{}),'prazo');
  igual(pz.prontos,0,'ainda nao ficou pronto');
  igual(pz.pct_prometido,null,'e nao ha porcentagem — zero se leria como "cumpriu zero por cento"');
 }},

{nome:'4.17 — pronto dentro dos dois conta nos dois',
 executar({igual,db}){
  limpar(db);
  const p=aprovado(); ateOFim(p,1);
  db.prepare("UPDATE sm_pedido SET prazo_prometido='2026-10-20', prazo_atual='2026-10-20', "+
    "pronto_em='2026-10-10 15:00:00' WHERE id=?").run(p.id);
  const pz=bloco(ind('painel',{}),'prazo');
  igual(pz.cumpriu_prometido,1,'prometido');
  igual(pz.cumpriu_negociado,1,'negociado');
  igual(pz.pct_prometido,100,'e a porcentagem');
 }},

/* ═══ 8. RECUSAS ═════════════════════════════════════════════════════════ */

{nome:'4.17 — a recusa conta no setor do CULPADO, nao no de quem recusou',
 executar({igual,db}){
  limpar(db);
  const p=aprovado();
  ['tubo','base'].forEach(c=>fazer(p,c,SERRA));
  fazer(p,'tecido',COLE);
  chamar('bipar',cod(p,'montagem'),MONTA);
  const m=motivo('criar',{nome:'Tubo maior',componente_chave:'tubo'});
  chamar('recusar',cod(p,'montagem'),{motivo_id:m.id},MONTA);

  const rec=bloco(ind('painel',{}),'recusas');
  igual(rec.total,1,'uma recusa');
  /* A pergunta e DE ONDE VEM o defeito. Contar na montagem acusaria
     justamente a bancada que ACHOU o erro — regua que aponta o inocente. */
  igual(acha(rec.setores,'setor','serralheria').recusas,1,'conta na serralheria');
  igual(acha(rec.setores,'setor','montagem'),undefined,'e nao na montagem');
 }},

{nome:'4.17 — recusas por MOTIVO, com o nome que o cadastro tinha no dia',
 executar({igual,db}){
  limpar(db);
  const p=aprovado();
  ['tubo','base'].forEach(c=>fazer(p,c,SERRA));
  fazer(p,'tecido',COLE);
  chamar('bipar',cod(p,'montagem'),MONTA);
  const m=motivo('criar',{nome:'Tubo maior',componente_chave:'tubo'});
  chamar('recusar',cod(p,'montagem'),{motivo_id:m.id},MONTA);
  motivo('atualizar',m.id,{nome:'Tubo fora de medida'});

  const rec=bloco(ind('painel',{}),'recusas');
  /* Retrato: renomear o cadastro amanha nao pode reescrever o que aconteceu
     hoje — a mesma regra do `vendedor_nome` da revenda. */
  igual(acha(rec.motivos,'motivo','Tubo maior').recusas,1,'o nome do dia');
 }},

/* ═══ 9. O VAZIO DIZ QUE E VAZIO ═════════════════════════════════════════ */

{nome:'4.17 — sem bipe nenhum, os blocos dizem "ninguem bipou ainda" e nao mostram zero',
 executar({igual,db}){
  limpar(db);
  const r=ind('painel',{});
  for(const nome of ['esforco','porM2','produtividade','recusas']){
    igual(bloco(r,nome).nada,'nunca',nome+': diz que nunca houve');
  }
  igual(bloco(r,'esforco').horas_por_peca,null,'e nao ha 0 h');
  igual(bloco(r,'porM2').total,null,'nem 0 h/m²');
  igual(bloco(r,'prazo').pct_prometido,null,'nem 0%');
 }},

{nome:'4.17 — com bipe FORA do periodo, o vazio e outro: manda mudar o filtro',
 executar({igual,db}){
  limpar(db);
  const p=aprovado(); ateOFim(p,1);
  meiaHoraEmTudo(db,p,1,'2020-01-10');
  const r=ind('painel',{dias:30});
  /* "Ninguem bipou ainda" manda esperar; "o periodo nao teve bipe" manda
     mudar o filtro. Sao conselhos opostos, e sem a diferenca a tela parece
     quebrada nos dois casos (a licao da 4-C). */
  igual(bloco(r,'esforco').nada,'periodo','o periodo escolhido nao teve bipe');
  igual(bloco(ind('painel',{dias:9999}),'esforco').nada,null,'e com a janela larga ele aparece');
 }},

{nome:'4.17 — a janela vem escrita ao lado dos numeros',
 executar({igual,db}){
  limpar(db);
  const p=aprovado(); ateOFim(p,1);
  meiaHoraEmTudo(db,p,1);
  const r=ind('painel',{dias:30});
  igual(r.janela.dias,30,'quantos dias');
  igual(!!r.janela.desde,true,'e desde quando — media sem a janela ao lado e numero que engana');
 }}

];

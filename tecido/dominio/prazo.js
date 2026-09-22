// QUANDO A PERSIANA FICA PRONTA — dono unico do prazo (secao 4.9 da spec
// SOBMEDIDA-PEDIDO-REVENDA).
//
//   pedido ENVIADO ate quarta 18:00  ->  pronto na quinta da semana seguinte
//   enviado depois disso             ->  a quinta da outra semana
//   a entrega cai em dia nao util    ->  proximo dia util
//
// ⚠️ CONTA A HORA DO ENVIO, NUNCA A DA APROVACAO. Aprovar e tarefa da
// Deccorar; a demora dela nao pode passar para a revenda. E por isso que
// `calcular` recebe o momento do envio em vez de olhar o relogio sozinho:
// na fase 3 o pedido vai guardar o prazo CONGELADO, e recalcula-lo depois
// com o relogio de hoje daria outra data para o mesmo pedido.
//
// ⚠️ NENHUM `new Date()`. A data sai do SQLite, como manda o nucleo/dia.js:
// um relogio so evita que o servidor em UTC e a fabrica em -03 respondam
// dias diferentes para o mesmo envio. Aqui isso importa mais que no resto do
// modulo, porque a diferenca de um dia muda a semana inteira.
//
// ⚠️ O QUE MANDA E O CADASTRO, nao numero escrito aqui. O corte do Mercado
// Livre ja mudou sem aviso no PCP (CLAUDE.md §8); nao ha motivo para o corte
// da revenda ser diferente. Os quatro numeros estao em `parametro`.
const db=require('../nucleo/db');
const dia=require('../nucleo/dia');
const config=require('../nucleo/config');
const {ErroDeRegra,exigir}=require('../nucleo/erros');

const pDow  =db.prepare("SELECT CAST(strftime('%w',?) AS INTEGER) v");
const pSoma =db.prepare("SELECT date(?, ? || ' days') v");
const pValida=db.prepare('SELECT date(?) v');

const dow=data=>pDow.get(data).v;
const maisDias=(data,n)=>pSoma.get(data,String(n)).v;

const DIAS=['domingo','segunda','terça','quarta','quinta','sexta','sábado'];
const porExtenso=data=>DIAS[dow(data)]+' '+data.slice(8,10)+'/'+data.slice(5,7);

/* Data de verdade, e nao so texto com a cara certa. O SQLite devolve NULL
   para o que nao e data, e 2026-02-30 ele NORMALIZA para 02/03 — por isso a
   conferencia e de ida e volta: se o que voltou nao e identico ao que
   entrou, a data nao existia. Aceitar 30 de fevereiro como 2 de marco seria
   o feriado cair num dia que ninguem cadastrou. */
function dataValida(texto){
  const t=String(texto||'').trim();
  if(!/^\d{4}-\d{2}-\d{2}$/.test(t)) return null;
  const v=pValida.get(t).v;
  return v===t?t:null;
}

const ehFeriado=db.prepare('SELECT nome FROM sm_feriado WHERE data=?');
const listarFeriados=ano=>ano
  ? db.prepare('SELECT * FROM sm_feriado WHERE data LIKE ? ORDER BY data').all(ano+'-%')
  : db.prepare('SELECT * FROM sm_feriado ORDER BY data').all();

/* ── A CONTA ──────────────────────────────────────────────────────────────
   `envio` e 'AAAA-MM-DD hh:mm[:ss]'. Sem ele, agora — e o "agora" tambem vem
   do banco. */
function calcular(envio){
  const quando=String(envio||dia.agora()).trim();
  const dEnvio=dataValida(quando.slice(0,10));
  exigir(dEnvio,'data_invalida','"'+quando+'" nao e um momento de envio valido.');
  const hEnvio=/^\d{2}:\d{2}/.test(quando.slice(11))?quando.slice(11,16):'00:00';

  const corteDia=config.ler('prazoCorteDiaSemana');
  const corteHora=config.ler('prazoCorteHora');
  const entregaDia=config.ler('prazoEntregaDiaSemana');
  const semanas=config.ler('prazoSemanas');

  // 1. o proximo corte a partir do envio. No DIA do corte quem desempata e a
  //    hora, e as 18:00 em ponto ainda estao do lado de ca: "ate quarta as
  //    18:00" inclui as 18:00. Comparar 'hh:mm' como texto funciona porque
  //    os dois lados sao de dois digitos — e o parametro recusa o que nao e.
  let corteData=maisDias(dEnvio,(corteDia-dow(dEnvio)+7)%7);
  if(corteData===dEnvio && hEnvio>corteHora) corteData=maisDias(corteData,7);

  /* 2. do corte ate a entrega. O `||7` diz que a entrega NUNCA e o proprio
        dia do corte: com corte e entrega no mesmo dia da semana, o pedido
        sairia pronto no instante em que fechou a producao. */
  const passo=((entregaDia-dow(corteData)+7)%7)||7;
  const entregaBase=maisDias(corteData,passo+semanas*7);

  /* 3. dia util. Empurra enquanto for feriado ou fim de semana, e GUARDA O
        MOTIVO: prazo que anda sem dizer por que vira ligacao da revenda para
        o vendedor — a mesma razao pela qual o bandô que some da tela leva a
        frase junto (secao 4.6). */
  let entrega=entregaBase;
  const empurrado_por=[];
  let fim_de_semana=false;
  for(let i=0;i<30;i++){
    const f=ehFeriado.get(entrega);
    const fds=dow(entrega)===0||dow(entrega)===6;
    if(!f&&!fds) break;
    if(f) empurrado_por.push({data:entrega,nome:f.nome});
    if(fds) fim_de_semana=true;
    entrega=maisDias(entrega,1);
  }

  const corte=corteData+' '+corteHora;
  const explicacao='Enviado '+porExtenso(dEnvio)+' às '+hEnvio+
    ' · corte '+porExtenso(corteData)+' às '+corteHora+
    ' · pronto '+porExtenso(entrega)+
    (entrega!==entregaBase?' (empurrado de '+porExtenso(entregaBase)+')':'');

  /* As versoes por extenso saem daqui, e nao da tela. '2026-10-02' e uma data
     que quem le tem que traduzir de cabeca para saber se e a semana que vem;
     'sexta 02/10' nao. E o dia da semana e justamente o que se confere quando
     alguem diz "pronto na quinta". */
  return {envio:dEnvio+' '+hEnvio, corte, entrega_base:entregaBase, entrega,
          corte_extenso:porExtenso(corteData)+' às '+corteHora,
          entrega_extenso:porExtenso(entrega),
          entrega_base_extenso:porExtenso(entregaBase),
          dia_da_semana:DIAS,
          empurrado:entrega!==entregaBase, empurrado_por, fim_de_semana, explicacao};
}

// ── O cadastro de feriado ────────────────────────────────────────────────
function criarFeriado(d,usuario){
  const data=dataValida(d&&d.data);
  exigir(data,'data_invalida','Informe a data no formato AAAA-MM-DD, e uma data que exista.');
  const nome=String((d&&d.nome)||'').trim();
  exigir(nome,'nome_obrigatorio','Diga que feriado e este — o nome aparece quando o prazo e empurrado.');
  if(ehFeriado.get(data))
    throw new ErroDeRegra('feriado_repetido','O dia '+data+' ja esta cadastrado como "'+ehFeriado.get(data).nome+'".');
  db.prepare('INSERT INTO sm_feriado(data,nome,criado_por) VALUES(?,?,?)')
    .run(data,nome,usuario&&usuario.nome);
  return {data,nome};
}

function apagarFeriado(data){
  const r=db.prepare('DELETE FROM sm_feriado WHERE data=?').run(data);
  exigir(r.changes,'feriado_inexistente','Este feriado nao esta cadastrado.');
  return {apagado:true,data};
}

/* ── DIAS DE FABRICA ATE UMA DATA ─────────────────────────────────────────
   A fila do vendedor (fase 3) mostra quantos dias de trabalho sobram ate o
   prazo, e nao quantos dias de calendario: tres dias no papel com um feriado
   e um fim de semana no meio sao ZERO dias de fabrica, e e essa a diferenca
   entre cobrar a producao hoje ou na semana que vem.

   ⚠️ NEGATIVO FICA NEGATIVO, e nao e cortado em zero. Prazo vencido e
   justamente o que a fila existe para mostrar; zerar apagaria o sinal e
   deixaria o atrasado com a mesma cara de quem vence hoje — e o MAX(0,…) do
   saldo de estoque do PCP (CLAUDE.md §2) pela porta do prazo. */
function diasUteis(de,ate){
  const a=dataValida(String(de||'').slice(0,10)), b=dataValida(String(ate||'').slice(0,10));
  if(!a||!b) return null;
  const inverso=b<a;
  let ini=inverso?b:a, fim=inverso?a:b, n=0;
  for(let i=0;i<400&&ini<fim;i++){
    ini=maisDias(ini,1);
    const d=dow(ini);
    if(d!==0&&d!==6&&!ehFeriado.get(ini)) n++;
  }
  return inverso?-n:n;
}

module.exports={calcular,listarFeriados,criarFeriado,apagarFeriado,dataValida,porExtenso,diasUteis};

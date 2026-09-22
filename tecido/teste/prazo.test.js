// QUANDO A PERSIANA FICA PRONTA — secao 4.9 da spec SOBMEDIDA-PEDIDO-REVENDA.
//
// Os dois primeiros casos sao o exemplo escrito na spec, com as datas dela.
// Estao aqui em primeiro lugar de proposito: e a conta que a revenda ouve ao
// telefone, e a unica que alguem vai conferir de cabeca.
//
// ⚠️ A REGUA E A SPEC, NAO O CODIGO. Os numeros abaixo foram tirados do
// documento e do calendario de 2026, nunca da resposta que a funcao deu — um
// teste que copia o que o codigo devolveu nao testa nada, ele concorda com
// ele. E a licao do QR da fase 2 do kit (CLAUDE.md §4).
const prazo=require('../dominio/prazo');
const config=require('../nucleo/config');

// 22/09/2026 e uma TERCA, 23/09 uma QUARTA, 01/10 uma QUINTA. Conferido no
// calendario, e nao presumido: a spec cita essas tres datas nominalmente.
const TERCA='2026-09-22', QUARTA='2026-09-23', QUINTA_1='2026-10-01', QUINTA_2='2026-10-08';

const semFeriados=db=>db.prepare('DELETE FROM sm_feriado').run();
const feriado=(db,data,nome)=>db.prepare('INSERT OR REPLACE INTO sm_feriado(data,nome) VALUES(?,?)').run(data,nome);

module.exports=[

{nome:'O EXEMPLO DA SPEC: enviado na terca, pronto na quinta da semana seguinte',
 executar({igual,db}){
  semFeriados(db);
  const r=prazo.calcular(TERCA+' 10:00:00');
  igual(r.corte,QUARTA+' 18:00','o corte e a quarta seguinte as 18:00');
  igual(r.entrega,QUINTA_1,'pronto na quinta 01/10');
}},

{nome:'um minuto depois do corte, cai para a quinta da OUTRA semana',
 executar({igual,db}){
  semFeriados(db);
  igual(prazo.calcular(QUARTA+' 18:01:00').entrega,QUINTA_2,'18:01 ja e a semana seguinte');
}},

{nome:'as 18:00 em ponto ainda e o corte de hoje — a divisa fica do lado de ca',
 executar({igual,db}){
  semFeriados(db);
  igual(prazo.calcular(QUARTA+' 18:00:00').entrega,QUINTA_1,'"ate quarta 18:00" inclui as 18:00');
}},

{nome:'enviado na quinta, o corte que vale e o da quarta seguinte',
 executar({igual,db}){
  semFeriados(db);
  const r=prazo.calcular('2026-09-24 09:00:00');
  igual(r.corte,'2026-09-30 18:00','o corte passou ontem; o proximo e 30/09');
  igual(r.entrega,QUINTA_2,'pronto 08/10');
}},

{nome:'enviado no domingo tambem espera a quarta',
 executar({igual,db}){
  semFeriados(db);
  igual(prazo.calcular('2026-09-27 23:59:00').corte,'2026-09-30 18:00','domingo 27/09 -> quarta 30/09');
}},

{nome:'FERIADO NO DIA DA ENTREGA empurra para o proximo dia util, e DIZ QUAL',
 executar({igual,db}){
  semFeriados(db);
  feriado(db,QUINTA_1,'Feriado de teste');
  const r=prazo.calcular(TERCA+' 10:00:00');
  igual(r.entrega_base,QUINTA_1,'a entrega combinada continua sendo a quinta');
  igual(r.entrega,'2026-10-02','e ela anda para a sexta');
  igual(r.empurrado_por.length,1,'um motivo');
  igual(r.empurrado_por[0].nome,'Feriado de teste','com o nome, porque prazo que muda sem motivo vira ligacao');
}},

{nome:'quinta E sexta feriadas: pula o fim de semana e cai na segunda',
 executar({igual,db}){
  semFeriados(db);
  feriado(db,QUINTA_1,'Quinta santa');
  feriado(db,'2026-10-02','Sexta emendada');
  const r=prazo.calcular(TERCA+' 10:00:00');
  igual(r.entrega,'2026-10-05','sabado e domingo nao sao dia util');
  igual(r.empurrado_por.map(f=>f.nome).join(' + '),'Quinta santa + Sexta emendada','os dois feriados sao citados');
}},

{nome:'o fim de semana empurra mesmo sem feriado nenhum',
 executar({igual,db}){
  semFeriados(db);
  config.gravar('prazoEntregaDiaSemana','6',null);       // sabado
  const r=prazo.calcular(TERCA+' 10:00:00');
  igual(r.entrega_base,'2026-10-03','o cadastro diz sabado');
  igual(r.entrega,'2026-10-05','mas "proximo dia util" leva para a segunda');
  config.gravar('prazoEntregaDiaSemana','4',null);
}},

{nome:'a virada do ano nao e um caso especial — a conta e de dias corridos',
 executar({igual,db}){
  semFeriados(db);
  const r=prazo.calcular('2026-12-29 10:00:00');          // terca
  igual(r.corte,'2026-12-30 18:00','quarta 30/12');
  igual(r.entrega,'2027-01-07','quinta 07/01/2027');
}},

{nome:'MUDAR O PARAMETRO MUDA A CONTA — o corte e o dia da entrega sao cadastro',
 executar({igual,db}){
  semFeriados(db);
  config.gravar('prazoCorteDiaSemana','1',null);          // segunda
  config.gravar('prazoCorteHora','12:00',null);
  config.gravar('prazoEntregaDiaSemana','5',null);        // sexta
  config.gravar('prazoSemanas','2',null);
  const r=prazo.calcular(TERCA+' 10:00:00');              // terca 22/09
  igual(r.corte,'2026-09-28 12:00','a segunda seguinte');
  igual(r.entrega,'2026-10-16','sexta, duas semanas depois da sexta do corte');
  config.gravar('prazoCorteDiaSemana','3',null);
  config.gravar('prazoCorteHora','18:00',null);
  config.gravar('prazoEntregaDiaSemana','4',null);
  config.gravar('prazoSemanas','1',null);
}},

{nome:'hora de corte torta e RECUSADA no parametro, nao interpretada na conta',
 executar({recusa,igual,db}){
  recusa(()=>config.gravar('prazoCorteHora','seis da tarde',null),'valor_invalido','hora por extenso');
  recusa(()=>config.gravar('prazoCorteHora','25:00',null),'valor_invalido','hora que nao existe');
  recusa(()=>config.gravar('prazoCorteDiaSemana','7',null),'valor_invalido','dia da semana vai de 0 a 6');
  igual(config.ler('prazoCorteHora'),'18:00','e nada foi gravado');
}},

{nome:'a data tambem sai POR EXTENSO — a tela nao traduz 2026-10-02 de cabeca',
 executar({igual,db}){
  semFeriados(db);
  const r=prazo.calcular(TERCA+' 10:00:00');
  igual(r.entrega_extenso,'quinta 01/10','com o dia da semana, que e o que se confere');
  igual(r.corte_extenso,'quarta 23/09 às 18:00','e o corte tambem');
  feriado(db,QUINTA_1,'Feriado de teste');
  const e=prazo.calcular(TERCA+' 10:00:00');
  igual(e.entrega_extenso,'sexta 02/10','a empurrada');
  igual(e.entrega_base_extenso,'quinta 01/10','e a combinada, para a tela dizer de onde saiu');
}},

{nome:'a explicacao sai pronta para a tela, com os tres momentos',
 executar({igual,db}){
  semFeriados(db);
  const r=prazo.calcular(TERCA+' 10:00:00');
  igual(/terça/i.test(r.explicacao)&&/quarta/i.test(r.explicacao)&&/quinta/i.test(r.explicacao),true,
    'envio, corte e entrega por extenso: '+r.explicacao);
}},

// ── O cadastro de feriado ────────────────────────────────────────────────
{nome:'feriado com data impossivel e recusado — e 30 de fevereiro e data impossivel',
 executar({recusa,db}){
  semFeriados(db);
  recusa(()=>prazo.criarFeriado({data:'2026-02-30',nome:'Nada'}),'data_invalida','30 de fevereiro');
  recusa(()=>prazo.criarFeriado({data:'7 de setembro',nome:'Nada'}),'data_invalida','por extenso');
  recusa(()=>prazo.criarFeriado({data:'2026-09-07',nome:'  '}),'nome_obrigatorio','feriado sem nome');
}},

{nome:'o mesmo dia nao e feriado duas vezes',
 executar({igual,recusa,db}){
  semFeriados(db);
  prazo.criarFeriado({data:'2026-09-07',nome:'Independencia'},{nome:'Lucas'});
  recusa(()=>prazo.criarFeriado({data:'2026-09-07',nome:'Sete de setembro'}),'feriado_repetido','a data ja existe');
  igual(prazo.listarFeriados().length,1,'continua um so');
}},

{nome:'a lista de feriados sai em ordem de data, e da para apagar',
 executar({igual,db}){
  semFeriados(db);
  prazo.criarFeriado({data:'2026-12-25',nome:'Natal'});
  prazo.criarFeriado({data:'2026-11-15',nome:'Republica'});
  igual(prazo.listarFeriados().map(f=>f.data).join(' '),'2026-11-15 2026-12-25','em ordem');
  prazo.apagarFeriado('2026-11-15');
  igual(prazo.listarFeriados().length,1,'apagou');
}}

];

// APAGAR CADASTRO — quando pode, e o que se diz quando nao pode.
//
// A regra da casa sempre foi "cadastro nao se apaga, desativa", e ela existe
// por um motivo real: linha de historico aponta para o cadastro, e apagar a
// cor faria o plano de tres meses atras deixar de saber o que foi cortado.
//
// So que a regra sozinha produz o problema oposto: o cadastro digitado errado
// no primeiro dia fica na lista para sempre, riscado, e a tela vira deposito
// de coisa morta que ninguem le mais. Foi o que aconteceu com as nove cores
// que carregavam o nome da colecao.
const exclusao=require('../dominio/exclusao');
const tecido=require('../dominio/tecido');
const endereco=require('../dominio/endereco');
const rolo=require('../dominio/rolo');

let base=null;
function cena(){
  if(base) return base;
  const l=tecido.criarLinha({nome:'Rolo'});
  const a=tecido.criarAbertura({nome:'Napoles BK',linha_id:l.id});
  const c=tecido.criarCor({nome:'Bege'});
  const t=tecido.criarTecido({linha_id:l.id,abertura_id:a.id,cor_id:c.id});
  const h=endereco.criarHaste({nome:'A',armazem_chave:'ROLO'});
  const an=endereco.criarAndar({nome:'1',haste_id:h.id});
  const n=endereco.criarNivel({nome:'1',andar_id:an.id});
  base={l,a,c,t,h,an,n};
  return base;
}

module.exports=[

{nome:'o CADASTRO ERRADO QUE NINGUEM USOU some de vez', executar({igual}){
  const c=tecido.criarCor({nome:'Napoles Bege'});   // o erro do primeiro dia
  igual(exclusao.podeApagar('cor',c.id),true,'ninguem aponta para ela');
  exclusao.excluir('cor',c.id);
  igual(tecido.listarCores().some(x=>x.id===c.id),false,'sumiu da lista');
  // Nao ficou riscada esperando alguem se acostumar a ignorar.
}},

{nome:'COR EM USO recusa, e diz QUEM esta usando', executar({recusa,igual}){
  const x=cena();
  igual(exclusao.podeApagar('cor',x.c.id),false,'ha tecido usando');
  igual(exclusao.quemUsa('cor',x.c.id)[0],'1 item(ns) de tecido usam esta cor',
    'a frase diz o numero e o que e');
  recusa(()=>exclusao.excluir('cor',x.c.id),'cadastro_em_uso');
  /* "Nao da para apagar" sozinho vira chamado de suporte. "1 item de tecido
     usa esta cor" vira decisao — a pessoa sabe o que desfazer primeiro. */
}},

{nome:'ENDERECO COM ROLO DENTRO nao se apaga', executar({recusa,igual}){
  const x=cena();
  rolo.entrada({tecido_id:x.t.id,largura:'2,50',metragem:'48',nivel_id:x.n.id},'Lucas');
  igual(exclusao.quemUsa('nivel',x.n.id)[0],'1 rolo(s) estao neste endereco','diz o que tem la');
  recusa(()=>exclusao.excluir('nivel',x.n.id),'cadastro_em_uso');
  // Apagar o endereco faria o rolo apontar para um lugar que nao existe, e a
  // tela mostraria endereco em branco para um tubo que esta na estante.
}},

{nome:'a arvore do endereco se protege de cima para baixo', executar({recusa,igual}){
  const x=cena();
  recusa(()=>exclusao.excluir('andar',x.an.id),'cadastro_em_uso');
  igual(exclusao.quemUsa('andar',x.an.id)[0],'1 nivel(is) neste andar','o andar tem nivel');
  recusa(()=>exclusao.excluir('haste',x.h.id),'cadastro_em_uso');
  igual(exclusao.quemUsa('haste',x.h.id)[0],'1 andar(es) nesta haste','a haste tem andar');
  /* Apagar de cima arrastaria a arvore inteira em silencio. Quem quer apagar
     a haste desmonta de baixo para cima, e a cada passo o sistema diz o que
     ainda esta pendurado ali. */
}},

{nome:'desmontando de baixo para cima, tudo sai', executar({igual}){
  const h=endereco.criarHaste({nome:'Z',armazem_chave:'ROLO'});
  const a=endereco.criarAndar({nome:'9',haste_id:h.id});
  const n=endereco.criarNivel({nome:'9',andar_id:a.id});
  exclusao.excluir('nivel',n.id);
  exclusao.excluir('andar',a.id);
  exclusao.excluir('haste',h.id);
  igual(endereco.arvore('ROLO').some(x=>x.id===h.id),false,'a haste sumiu');
  // Vazio de verdade apaga sem discussao: nao ha historico para proteger.
}},

{nome:'LINHA e recusada por DOIS motivos, e os dois aparecem', executar({igual}){
  const x=cena();
  const usos=exclusao.quemUsa('linha',x.l.id);
  igual(usos.length,2,'colecao e tecido, os dois');
  igual(usos.join(' e ').includes('colecao(oes)'),true,'diz das colecoes');
  igual(usos.join(' e ').includes('item(ns) de tecido'),true,'e dos tecidos');
  // Dizer so o primeiro faria a pessoa resolver um, tentar de novo e bater
  // no segundo — e concluir que o sistema inventa impedimento novo a cada vez.
}},

{nome:'TECIDO COM ROLO nao se apaga', executar({recusa,igual}){
  const x=cena();
  igual(exclusao.quemUsa('tecido',x.t.id)[0],'1 rolo(s) sao deste tecido','o rolo segura');
  recusa(()=>exclusao.excluir('tecido',x.t.id),'cadastro_em_uso');
}},

{nome:'LARGURA conta por VALOR, nao por id', executar({igual,recusa}){
  const largura=require('../dominio/largura');
  /* A entrada do rolo da cena JA cadastrou a bobina de 2,50 — desde 03/09 o
     campo livre ensina a lista em vez de ser um beco. Por isso cadastrar de
     novo e recusado: e o mesmo cadastro, nao um segundo. */
  recusa(()=>largura.criar('2,50'),'largura_repetida');
  const l=largura.listar().find(x=>x.valor===2.5);
  igual(exclusao.quemUsa('largura_bobina',l.id)[0],'1 rolo(s) tem bobina desta largura',
    'achou o rolo pela medida');
  /* O rolo guarda o NUMERO da largura, nao uma chave estrangeira. Contar por
     id daria zero e a largura seria apagada com rolo usando ela. */
}},

{nome:'tipo desconhecido nao apaga nada', executar({recusa}){
  recusa(()=>exclusao.excluir('inventado',1),'tipo_desconhecido');
  recusa(()=>exclusao.excluir('cor',99999),'cadastro_inexistente');
  // Uma rota so para todos os tipos precisa recusar o que nao esta no mapa —
  // senao um erro de digitacao na URL viraria DELETE numa tabela qualquer.
}}

];

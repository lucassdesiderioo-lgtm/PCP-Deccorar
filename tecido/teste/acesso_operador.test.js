// O QUE O OPERADOR ALCANCA — e o que nunca pode alcancar.
//
// ⚠️ ESTE ARQUIVO EXISTE PORQUE A DEFESA ANTERIOR ERA UMA LISTA ESCRITA A MAO,
// E ELA ENVELHECEU EM UMA SEMANA. A poda de preco tinha os campos literais
// ['preco_m2','valor','valor_total','preco_medio','menor','maior']. O painel
// gerencial nasceu depois com `resumo.valor_parado`, que nao estava nela, e o
// numero passou a viajar pelo fio ate a bancada. A TELA nao mostrava — ela
// testa `resumo.valor` —, entao ninguem veria olhando: so abrindo a aba de
// rede do navegador.
//
// Por isso o teste NAO confere uma lista. Ele VARRE o JSON inteiro, em toda
// profundidade, procurando qualquer chave que cheire a dinheiro. Um campo novo
// que ninguem lembrou de podar quebra este arquivo no mesmo commit em que
// nasce, que e a unica hora em que consertar e barato.
const {pode,PAPEIS,CHAVES}=require('../nucleo/permissoes');
const {TELAS}=require('../nucleo/telas');
const custo=require('../dominio/custo');
const gerencial=require('../dominio/gerencial');
const giro=require('../dominio/giro');
const rolo=require('../dominio/rolo');
const tecido=require('../dominio/tecido');

const CORTADOR={nome:'Ana da bancada',papel:'cortador'};
const DIRETOR ={nome:'Lucas',papel:'diretor'};

/* O varredor. Larga de proposito: uma auditoria que so procura o que ja
   conhece nao acha o campo de amanha. Devolve o CAMINHO ate cada achado,
   porque "vazou alguma coisa" nao conserta nada e
   "resumo.valor_parado" conserta. */
function dinheiroEm(obj,caminho,achados){
  achados=achados||[];
  if(obj==null||typeof obj!=='object') return achados;
  if(Array.isArray(obj)){ obj.forEach(x=>dinheiroEm(x,caminho+'[]',achados)); return achados; }
  for(const k in obj){
    if(custo.eDinheiro(k)) achados.push(caminho+'.'+k);
    dinheiroEm(obj[k],caminho+'.'+k,achados);
  }
  return achados;
}

let base=null;
function cena(){
  if(base) return base;
  const l=tecido.criarLinha({nome:'Rolo'});
  const a=tecido.criarAbertura({nome:'1%',linha_id:l.id});
  const c=tecido.criarCor({nome:'Branco'});
  const t=tecido.criarTecido({linha_id:l.id,abertura_id:a.id,cor_id:c.id});
  const r=rolo.entrada({tecido_id:t.id,largura:'2,00',metragem:'50',
    preco_m2:'20',nf:'12345'},DIRETOR.nome);
  rolo.consumir(r.id,10,'p1',DIRETOR.nome);
  base={t,r};
  return base;
}

module.exports=[

{nome:'⚠️ O PAINEL GERENCIAL NAO LEVA UM CENTAVO ATE A BANCADA', executar({igual}){
  cena();
  const p=gerencial.painel(90,{});
  const antes=dinheiroEm(p,'painel');
  igual(antes.length>0,true,'a chefia recebe '+antes.length+' campo(s) de dinheiro');

  const depois=dinheiroEm(custo.semPreco(p),'painel');
  igual(depois.length,0,'e a bancada recebe ZERO — vazou: '+depois.join(', '));

  /* Este caso pegou `resumo.valor_parado` e `rolos_sem_preco` na primeira
     execucao. Os dois passavam pela poda por lista, e chegavam ao tablet. */
}},

{nome:'⚠️ A LISTA DE ROLOS TAMBEM NAO — inclusive NF e FORNECEDOR', executar({igual}){
  cena();
  const rolos=rolo.listar({});
  const cru=dinheiroEm(rolos,'rolos');
  igual(cru.length>0,true,'a chefia ve preco, NF e fornecedor');

  const podado=dinheiroEm(custo.semPreco(rolos),'rolos');
  igual(podado.length,0,'a bancada nao ve nenhum — vazou: '+podado.join(', '));

  // E o que ela PRECISA continua chegando: sem isso a poda seria uma tela
  // vazia, e tela vazia o operador contorna por fora do sistema.
  const um=custo.semPreco(rolos)[0];
  ['codigo','largura','saldo','m2','status','linha_nome','cor_nome','dias_parado']
    .forEach(c=>igual(c in um,true,'a bancada continua vendo '+c));

  /* DE QUEM A FABRICA COMPRA E COM QUE NOTA nao ajuda o operador a pegar o
     rolo na estante — e e exatamente o tipo de dado que sai da fabrica junto
     com quem sai. */
}},

{nome:'⚠️ A LISTA E O RESUMO DE SOBRAS TAMBEM NAO — preco e valor ficam no escritorio', executar({igual}){
  const b=cena();
  const sobra=require('../dominio/sobra');
  const endereco=require('../dominio/endereco');
  const etiqueta=require('../dominio/etiqueta');
  const h=endereco.criarHaste({nome:'S1',armazem_chave:'SOBRA'},DIRETOR);
  const a=endereco.criarAndar({nome:'1',haste_id:h.id},DIRETOR);
  const n=endereco.criarNivel({nome:'1',andar_id:a.id},DIRETOR);
  etiqueta.imprimirLote(2,DIRETOR.nome);
  sobra.criar({codigo:'S-000001',tecido_id:b.t.id,largura:'1,00',altura:'1,00',condicao:'integra',
    nivel_id:n.id,origem:'rolo',origem_rolo_id:b.r.id},DIRETOR.nome);

  const lista=sobra.listar({}), resumo=sobra.resumo();
  igual(dinheiroEm(lista,'sobras').length>0,true,'a chefia ve preco e valor da sobra');
  igual(dinheiroEm(resumo,'resumo').length>0,true,'e o valor por tecido');
  igual(dinheiroEm(custo.semPreco(lista),'sobras').length,0,'a bancada nao ve nenhum — vazou: '+dinheiroEm(custo.semPreco(lista),'sobras').join(', '));
  igual(dinheiroEm(custo.semPreco(resumo),'resumo').length,0,'nem no resumo');
  const um=custo.semPreco(lista)[0];
  ['codigo','largura','altura','area','condicao','endereco','linha_nome','cor_nome','dias_parada']
    .forEach(c=>igual(c in um,true,'a bancada continua vendo '+c));
  // `sobras_sem_preco` e `area_sem_preco` sao dinheiro por nome — e e assim
  // que tem que ser: quantas faltam precificar e assunto do escritorio.
  igual(custo.eDinheiro('sobras_sem_preco'),true,'sobras_sem_preco e podado');
}},

{nome:'o painel de giro tambem passa limpo', executar({igual}){
  const g=giro.painel(90);
  igual(dinheiroEm(custo.semPreco(g),'giro').length,0,'zero campo de dinheiro');
}},

{nome:'⚠️ A PODA E POR PADRAO DE NOME, e pega o campo que ainda nao existe',
 executar({igual}){
  // Os que ja existiam
  ['preco_m2','valor','valor_total','preco_medio','menor_preco','custo_medio',
   'nf','fornecedor','fornecedor_nome','rolos_sem_preco','valor_parado']
    .forEach(k=>igual(custo.eDinheiro(k),true,k+' e dinheiro'));

  // O campo inventado de amanha
  igual(custo.eDinheiro('valor_comprado'),true,'um campo novo qualquer com "valor"');
  igual(custo.eDinheiro('preco_ultimo'),true,'e outro com "preco"');

  // E o que NAO pode ser podado por engano: `valor` de parametro e `valor` de
  // largura sao numeros de medida, e vivem em rotas que nao passam pela poda.
  igual(custo.eDinheiro('largura'),false,'largura nao e dinheiro');
  igual(custo.eDinheiro('metragem_inicial'),false,'metragem nao e');
  igual(custo.eDinheiro('m2'),false,'m² nao e');
  igual(custo.eDinheiro('saldo'),false,'saldo nao e');
}},

{nome:'AS TELAS: o operador alcanca a bancada, nao o escritorio', executar({igual}){
  const alcanca=t=>pode(CORTADOR,TELAS[t].permissao);
  igual(alcanca('/'),true,'inicio');
  igual(alcanca('/corte'),true,'plano de corte');
  igual(alcanca('/sobras'),true,'lancar sobra');
  igual(alcanca('/rolos'),true,'rolos');
  igual(alcanca('/etiquetas'),true,'etiquetas');
  igual(alcanca('/cadastros'),false,'CADASTROS e da chefia');
  igual(alcanca('/painel'),false,'e o PAINEL tambem — leitura gerencial nao e bancada');

  // O contexto tambem separa: bancada e tela clara, escritorio e escura.
  igual(TELAS['/sobras'].contexto,'operacao','a tela da bancada e clara');
  igual(TELAS['/cadastros'].contexto,'admin','a do escritorio e escura');
}},

{nome:'AS CHAVES que o operador nao tem, e nao pode ganhar por engano',
 executar({igual}){
  ['custo.ver','rolo.nota','cadastro.editar','parametro.editar',
   'sobra.descartar','sobra.corrigir','rolo.ajustar']
    .forEach(k=>igual(pode(CORTADOR,k),false,'o cortador NAO tem '+k));

  // Toda chave existe de verdade — um `pode()` com nome errado devolve false
  // e pareceria uma trava funcionando.
  ['custo.ver','rolo.nota','cadastro.editar','parametro.editar',
   'sobra.descartar','sobra.corrigir','rolo.ajustar']
    .forEach(k=>igual(CHAVES.some(c=>c.chave===k),true,k+' esta declarada'));

  igual(PAPEIS.diretor.includes('*'),true,'e o diretor alcanca tudo');
}},

{nome:'⚠️ O FORNECEDOR SAIU DO ALCANCE DA BANCADA', executar({igual}){
  const rotas=require('../rotas/cadastros').rotas
    .filter(r=>r.caminho==='/api/fornecedores');
  igual(rotas.length,2,'ler e criar');
  rotas.forEach(r=>igual(pode(CORTADOR,r.permissao),false,
    r.metodo+' /api/fornecedores fechado para o cortador'));
  rotas.forEach(r=>igual(pode(DIRETOR,r.permissao),true,'e aberto para a chefia'));

  /* A LISTA de fornecedores vinha DE CARONA com `cadastro.ler` — a chave que
     o cortador tem para a tela de corte listar tecido e cor. Uma chave larga
     demais carrega o que ninguem pediu. */
}},

{nome:'toda rota declara permissao — nenhuma nasce aberta', executar({igual}){
  const mods=['cadastros','rolos','sobras','parametros','painel','eu'];
  let n=0, semChave=[];
  mods.forEach(m=>require('../rotas/'+m).rotas.forEach(r=>{
    n++;
    if(!r.permissao) semChave.push((r.metodo||'GET')+' '+r.caminho);
    else if(!CHAVES.some(c=>c.chave===r.permissao))
      semChave.push((r.metodo||'GET')+' '+r.caminho+' -> chave inexistente "'+r.permissao+'"');
  }));
  igual(semChave.length,0,'as '+n+' rotas declaram chave valida — furos: '+semChave.join(', '));

  /* O registro ja NEGA rota sem permissao, entao esquecer a chave fecha a
     porta em vez de abrir. Mas uma chave com nome ERRADO passa pelo registro
     e e negada para todo mundo em silencio — inclusive para o diretor. Este
     caso pega isso. */
}}

];

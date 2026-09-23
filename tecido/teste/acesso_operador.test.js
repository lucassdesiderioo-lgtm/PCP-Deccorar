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
const VENDEDOR={nome:'Renato',papel:'vendedor'};

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
    nivel_id:n.id},DIRETOR.nome);
  tecido.definirPreco(b.t.id,'20',DIRETOR.nome);

  const lista=sobra.listar({}), resumo=sobra.resumo(), tecidos=tecido.listarTecidos();
  igual(dinheiroEm(lista,'sobras').length>0,true,'a chefia ve preco e valor da sobra');
  igual(dinheiroEm(resumo,'resumo').length>0,true,'e o valor por tecido');
  igual(dinheiroEm(tecidos,'tecidos').length>0,true,'e o preco no cadastro do tecido');
  igual(dinheiroEm(custo.semPreco(lista),'sobras').length,0,'a bancada nao ve nenhum — vazou: '+dinheiroEm(custo.semPreco(lista),'sobras').join(', '));
  igual(dinheiroEm(custo.semPreco(resumo),'resumo').length,0,'nem no resumo');
  /* /api/tecidos e a rota que a BANCADA usa para montar as fileiras de
     linha, colecao e cor no lancamento — o preco do m² viaja nela. A poda na
     rota e o que impede o numero de chegar ao tablet. */
  igual(dinheiroEm(custo.semPreco(tecidos),'tecidos').length,0,'nem no cadastro de tecido');
  const um=custo.semPreco(lista)[0];
  ['codigo','largura','altura','area','condicao','endereco','linha_nome','cor_nome','dias_parada']
    .forEach(c=>igual(c in um,true,'a bancada continua vendo '+c));
  const t=custo.semPreco(tecidos)[0];
  ['id','codigo','linha_id','abertura_id','cor_id','linha_nome','cor_nome','ativo']
    .forEach(c=>igual(c in t,true,'e do tecido continua vendo '+c));
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

{nome:'⚠️ O SIMULADOR DO SOB MEDIDA NAO LEVA UM CENTAVO A QUEM NAO VE CUSTO',
 executar({igual}){
  /* Ate a fase 2 esta poda era um no-op: so a chefia alcancava o simulador.
     Deixou de ser — o VENDEDOR entrou, e com ele `custo.ver` (sem preco o
     simulador nao serviria para nada). Quem continua do lado de fora e a
     bancada, e na fase 7 sera a REVENDA na mesma porta: ali o preco Deccorar
     nao pode viajar pelo fio (secao 4.12 da spec). Defesa que se escreve
     depois que o usuario existe e defesa que se escreve tarde. */
  const tecido=require('../dominio/tecido');
  const catalogo=require('../dominio/catalogo_sm');
  const persiana=require('../dominio/persiana');
  const l=tecido.criarLinha({nome:'Rolo sob medida'});
  const a=tecido.criarAbertura({nome:'Screen 1%',linha_id:l.id});
  const cor=tecido.criarCor({nome:'Areia'});
  const m=catalogo.modeloPorNome('Rolô');
  catalogo.ligarColecao({modelo_id:m.id,abertura_id:a.id,preco_m2_centavos:11000});
  catalogo.ligarCorAcessorio({modelo_id:m.id,cor_id:cor.id});
  const r=persiana.calcular({modelo_id:m.id,abertura_id:a.id,cor_acessorio_id:cor.id,
    largura_mm:1000,altura_mm:1000,comando:'direito',rolamento:'frente',
    adicional:'bando',reducao:'nao'});

  const antes=dinheiroEm(r,'simular');
  igual(antes.length>0,true,'o calculo TEM dinheiro dentro: '+antes.join(', '));
  igual(dinheiroEm(custo.podar(CORTADOR,r),'simular').join(', '),'',
    'e nada disso sobra depois da poda');
  igual(dinheiroEm(custo.podar(DIRETOR,r),'simular').length,antes.length,
    'enquanto a chefia recebe tudo');

  /* ⚠️ E O NOME DO CAMPO E O QUE FAZ A PODA FUNCIONAR. Um `total_centavos`
     nao casa com o padrao `preco|valor|custo|nf|fornecedor` e vazaria em
     silencio — por isso o subtotal se chama valor_subtotal_centavos. */
  igual(custo.eDinheiro('valor_subtotal_centavos'),true,'valor_subtotal_centavos e podado');
  igual(custo.eDinheiro('total_centavos'),false,
    'e "total_centavos" NAO seria — o nome do campo e parte da defesa');
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
  /* ⚠️ A LISTA SAI DO `montar.js`, e nao de uma copia escrita aqui.
     Ela ERA uma copia — e ja tinha envelhecido: './rotas/planos' nao estava
     nela, entao as rotas do plano de corte nao eram conferidas por ninguem.
     E a mesma doenca da poda por lista literal, 20 linhas acima neste mesmo
     arquivo, e da TODAS_ROTAS do PCP (CLAUDE.md secao 10, armadilha #29).
     Um modulo novo entra na conta no minuto em que e montado. */
  const mods=require('../montar').MODULOS;
  let n=0, semChave=[];
  mods.forEach(m=>require(m.replace('./rotas/','../rotas/')).rotas.forEach(r=>{
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
}},

/* ═══ O VENDEDOR (fase 2) ══════════════════════════════════════════════════
   Ate aqui ele entrava pela area "Sob medida - cadastros" — a da CHEFIA —,
   porque nao havia outra. Estes casos existem para que o estreitamento nao
   se desfaca sozinho no dia em que alguem acrescentar uma chave ao papel
   "so para facilitar". */

{nome:'AS TELAS DO VENDEDOR: simulador, catalogo de leitura e revendas — nada da bancada',
 executar({igual}){
  const alcanca=t=>pode(VENDEDOR,TELAS[t].permissao);
  igual(alcanca('/'),true,'inicio — e e por isso que existe a chave modulo.entrar');
  igual(alcanca('/simulador'),true,'o simulador');
  igual(alcanca('/revendas'),true,'a carteira dele');
  igual(alcanca('/corte'),false,'ele nao corta');
  igual(alcanca('/rolos'),false,'nem mexe em rolo');
  igual(alcanca('/sobras'),false,'nem lanca sobra');
  igual(alcanca('/etiquetas'),false,'nem imprime etiqueta de prateleira');
  igual(alcanca('/cadastros'),false,'CADASTROS continua da chefia');
  igual(alcanca('/painel'),false,'e o painel gerencial tambem');
  igual(alcanca('/catalogo'),false,'EDITAR o catalogo decide o que a fabrica corta — nao e dele');
  igual(TELAS['/revendas'].contexto,'admin','e a tela dele e de escritorio, nao de bancada');
}},

{nome:'AS CHAVES QUE O VENDEDOR NAO TEM, e cada uma custa alguma coisa',
 executar({igual}){
  [['cadastro.ler','a lista de tecido, endereco e motivo vinha de carona'],
   ['cadastro.editar','mexer no cadastro de tecido muda o que a fabrica corta'],
   ['parametro.editar','o parametro do encaixe vale para a fabrica inteira'],
   ['sobra.descartar','baixa de sobra sem trava e o furo classico de inventario'],
   ['plano.confirmar','confirmar plano baixa estoque'],
   ['revenda.editar','a tabela e o desconto sao decisao da Deccorar (secao 4.12)'],
   ['credito.editar','o limite decide quanto a revenda pode dever (secao 4.13)'],
   ['catalogo.editar','o preco do m² e da chefia']]
    .forEach(([k,porque])=>{
      igual(CHAVES.some(c=>c.chave===k),true,k+' esta declarada de verdade');
      igual(pode(VENDEDOR,k),false,'o vendedor NAO tem '+k+' — '+porque);
    });
  igual(PAPEIS.vendedor.includes('*'),false,'e o papel novo nao herda o coringa do diretor');
}},

{nome:'⚠️ O VENDEDOR VE O PRECO — sem isso o simulador nao serviria pra nada',
 executar({igual}){
  igual(pode(VENDEDOR,'custo.ver'),true,'ele tem custo.ver');
  igual(custo.veComercial(VENDEDOR),true,'e por isso recebe os campos de dinheiro');
  igual(custo.veComercial(CORTADOR),false,'enquanto a bancada continua sem');
  const amostra={valor_subtotal_centavos:20900, revenda:{valor_final_centavos:17870}};
  igual(JSON.stringify(custo.podar(VENDEDOR,amostra)),JSON.stringify(amostra),
    'o preco da revenda chega inteiro a quem vende');
  igual(JSON.stringify(custo.podar(CORTADOR,amostra)),'{"revenda":{}}',
    'e nao sobra um centavo do lado da bancada');
}},

{nome:'⚠️ A CARTEIRA NAO CHEGA A BANCADA, e o limite de credito muito menos',
 executar({igual}){
  const rotas=require('../rotas/revenda').rotas;
  igual(rotas.length>0,true,'as rotas existem');
  rotas.forEach(r=>igual(pode(CORTADOR,r.permissao),false,
    r.metodo+' '+r.caminho+' fechado para o cortador'));
  /* As tres que MEXEM no limite. A barra no fim do padrao importa:
     `/limites-vencidos` tambem contem "/limite", e ela e outra coisa — a
     lista de quem esta com a revisao atrasada, que e justamente a tarefa
     semanal do vendedor (secao 4.13). Fecha-la para ele seria dar a tarefa e
     esconder a lista. */
  const limite=rotas.filter(r=>/\/limite(\/|$)/.test(r.caminho));
  igual(limite.map(r=>r.metodo).sort().join(','),'GET,POST,PUT','as tres que mexem no limite');
  limite.forEach(r=>igual(pode(VENDEDOR,r.permissao),false,
    r.metodo+' '+r.caminho+' fechado para o vendedor — quem define limite e a chefia'));
  const vencidos=rotas.find(r=>r.caminho.indexOf('limites-vencidos')>0);
  igual(pode(VENDEDOR,vencidos.permissao),true,
    'mas a LISTA de revisao vencida ele ve: e a tarefa semanal dele');

  /* ⚠️ E O NOME DO CAMPO DO LIMITE E PARTE DA DEFESA, como o do subtotal.
     "limite_credito_centavos" nao casaria com o padrao `preco|valor|custo|
     nf|fornecedor` e viajaria pelo fio em silencio — por isso ele se chama
     valor_limite_credito_centavos. */
  igual(custo.eDinheiro('valor_limite_credito_centavos'),true,'o limite e podado');
  igual(custo.eDinheiro('limite_credito_centavos'),false,
    'e assim NAO seria — foi por isso que o campo nasceu com "valor_" na frente');
}},

/* ═══ O PEDIDO (fase 3) ════════════════════════════════════════════════════
   A fase 3 acrescentou seis chaves de uma vez, e chave nova e exatamente
   onde um papel ganha o que ninguem quis dar. */

{nome:'O PEDIDO E DO ESCRITORIO: nenhuma rota dele chega a bancada',
 executar({igual}){
  const rotas=require('../rotas/pedido').rotas;
  igual(rotas.length>0,true,'as rotas existem');
  rotas.forEach(r=>igual(pode(CORTADOR,r.permissao),false,
    r.metodo+' '+r.caminho+' fechado para o cortador'));
  igual(pode(CORTADOR,TELAS['/pedidos'].permissao),false,'e a tela tambem');
  igual(TELAS['/pedidos'].contexto,'admin','ela e de escritorio, nao de bancada');
}},

{nome:'⚠️ O VENDEDOR LANCA E APROVA A CARTEIRA DELE — mas nao a do colega, e nao cancela',
 executar({igual}){
  igual(pode(VENDEDOR,TELAS['/pedidos'].permissao),true,'a tela e a lista de trabalho dele');
  [['pedido.ler','ver a fila'],['pedido.lancar','lancar e enviar'],
   ['pedido.aprovar','aprovar a propria carteira'],['pedido.prazo','negociar prazo']]
    .forEach(([k,oque])=>{
      igual(CHAVES.some(c=>c.chave===k),true,k+' esta declarada de verdade');
      igual(pode(VENDEDOR,k),true,'o vendedor tem '+k+' — '+oque);
    });

  /* As duas que ele NAO tem, e cada uma custa alguma coisa. A primeira e a
     regra da carteira da secao 4.12: com ela, qualquer vendedor aprovaria a
     revenda do colega. A segunda desfaz o que a fabrica ja viu. */
  [['pedido.aprovar_qualquer','a carteira tem dono (secao 4.12)'],
   ['pedido.cancelar','cancelar desfaz o que a fabrica ja viu']]
    .forEach(([k,porque])=>{
      igual(CHAVES.some(c=>c.chave===k),true,k+' esta declarada de verdade');
      igual(pode(VENDEDOR,k),false,'o vendedor NAO tem '+k+' — '+porque);
    });

  /* ⚠️ E A ROTA DE APROVAR NAO PODE PEDIR A CHAVE LARGA. Declarar
     `pedido.aprovar_qualquer` nela tiraria do vendedor exatamente a fila que
     ele existe para trabalhar — e o efeito seria 403 numa tela que abre, que
     nao se parece com "mexeram na permissao". */
  const aprovar=require('../rotas/pedido').rotas
    .find(r=>r.caminho==='/api/pedidos/:id/aprovar');
  igual(aprovar.permissao,'pedido.aprovar','a rota pede a chave estreita');
  igual(pode(VENDEDOR,aprovar.permissao),true,'e por isso o vendedor a alcanca');
}},

{nome:'⚠️ O PEDIDO E DINHEIRO DA PRIMEIRA A ULTIMA LINHA — e a poda alcanca tudo',
 executar({igual}){
  /* O varredor larga de novo: um campo novo no pedido que ninguem lembrou de
     nomear com `valor_`/`preco_` quebra este caso no commit em que nasce. */
  const amostra={valor_total_centavos:20900, valor_revenda_centavos:17870,
    itens:[{valor_subtotal_centavos:20900, valor_final_centavos:17870,
            linhas:[{preco_unitario_centavos:11000, valor_centavos:16500}]}]};
  igual(dinheiroEm(amostra,'pedido').length,6,'a amostra tem seis campos de dinheiro');
  igual(dinheiroEm(custo.podar(CORTADOR,amostra),'pedido').join(', '),'',
    'e nada disso sobra do lado da bancada');
  igual(dinheiroEm(custo.podar(VENDEDOR,amostra),'pedido').length,6,
    'enquanto quem vende recebe tudo');
}},
/* ═══ A ETIQUETA DE PRODUCAO (fase 4-A) ════════════════════════════════════
   Ela inverte a regra das outras telas de venda: e da BANCADA, nao do
   escritorio. Quem precisa do papel e quem vai cortar. */

{nome:'⚠️ A ETIQUETA DE PRODUCAO E DA BANCADA — e e a primeira que o CORTADOR alcanca',
 executar({igual}){
  igual(pode(CORTADOR,TELAS['/producao'].permissao),true,
    'o cortador abre a tela — mandar ele chamar alguem para imprimir e a armadilha #6');
  igual(TELAS['/producao'].contexto,'operacao',
    'e ela e CLARA: quem a abre esta em pe, sob a lampada de inspecao (§19)');
  [['etiqueta_producao.ler','ver o que falta imprimir'],
   ['etiqueta_producao.imprimir','imprimir, que gasta rolo e marca a peca']]
    .forEach(([k,oque])=>{
      igual(CHAVES.some(c=>c.chave===k),true,k+' esta declarada de verdade');
      igual(pode(CORTADOR,k),true,'o cortador tem '+k+' — '+oque);
    });

  /* ⚠️ O VENDEDOR VE, E NAO IMPRIME. Ver e a resposta de "o meu pedido
     entrou?"; imprimir e da pessoa que esta com a Zebra na frente, e a
     reimpressao dela cria a chance de duas etiquetas iguais em duas pecas. */
  igual(pode(VENDEDOR,'etiqueta_producao.ler'),true,'o vendedor ve a fila da fabrica');
  igual(pode(VENDEDOR,'etiqueta_producao.imprimir'),false,'mas nao imprime');
}},

{nome:'⚠️ IMPRIMIR PEDE A CHAVE DE IMPRIMIR, e ler nao basta',
 executar({igual}){
  const rotas=require('../rotas/etiqueta_producao').rotas;
  igual(rotas.length>0,true,'as rotas existem');
  const imprimir=rotas.find(r=>r.caminho==='/api/producao/etiquetas/imprimir');
  igual(imprimir.permissao,'etiqueta_producao.imprimir','a rota que marca pede a chave que marca');
  igual(imprimir.metodo,'POST',
    'e e POST: um GET que MARCA e um GET que o navegador repete ao recarregar');

  /* A previa NAO marca, entao ela le. Pedir a chave de imprimir nela faria
     quem so confere ter que pedir o rolo emprestado. */
  const previa=rotas.find(r=>r.caminho==='/api/producao/etiquetas/previa');
  igual(previa.permissao,'etiqueta_producao.ler','a previa e leitura');
  igual(pode(VENDEDOR,previa.permissao),true,'e o vendedor alcanca a previa');
  igual(pode(VENDEDOR,imprimir.permissao),false,'sem alcancar a impressao');

  /* O que manda a peca para o corte pede a chave de QUEM CORTA, e nao a de
     etiqueta: quem abre aquela lista esta indo cortar. */
  const corte=rotas.find(r=>r.caminho==='/api/producao/para-cortar');
  igual(corte.permissao,'plano.calcular','o corte pede a chave do plano');
  igual(pode(VENDEDOR,corte.permissao),false,'e o vendedor nao corta');
}}

];

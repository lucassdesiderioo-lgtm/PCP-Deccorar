// A PRODUCAO BIPADA — dono unico de "o que esta bancada pode fazer agora" e
// de "o que segura esta peca" (secao 4.15 da spec SOBMEDIDA-PEDIDO-REVENDA).
//
//   SERRALHERIA: tubo · base ─┐
//   COLECAO: tecido ──────────┴─▶ MONTAGEM ─▶ REVISAO ─▶ EMBALAGEM ─▶ PRONTO
//   SERRALHERIA: bandô · barra ──────────────────────────────▲
//
// ⚠️ A FILA SO MOSTRA O QUE JA PODE SER FEITO, e essa e a regra inteira. A
// montagem que aparecesse antes do tecido ficar pronto mandaria alguem montar
// uma persiana que nao tem tecido — e a peca voltaria para a bancada com o
// trabalho desfeito.
//
// ⚠️ E "NAO APARECE" NUNCA VIRA "NINGUEM SABE POR QUE". Bipar um codigo ainda
// nao liberado RESPONDE o que o segura, com quem esta e desde quando. Trava
// que prende sem explicar e a armadilha #6 do CLAUDE.md: a equipe aprende a
// contorna-la, e o desvio acontece fora da vista do sistema.
const {ErroDeRegra,exigir}=require('../nucleo/erros');
const db=require('../nucleo/db');
const d=require('../dados/producao');
const etq=require('./etiqueta_producao');
const dpedido=require('../dados/pedido');
const motivos=require('./motivo_producao');
const permissoes=require('../nucleo/permissoes');
const dia=require('../nucleo/dia');

const nome=usuario=>(usuario&&usuario.nome)||null;

/* ── AS LIBERACOES ────────────────────────────────────────────────────────
   Uma linha por setor, e cada uma diz o que TEM QUE ESTAR PRONTO antes. E a
   tabela da secao 4.15 escrita como dado, e nao como uma cadeia de `if`: a
   cadeia esconde a regra dentro do codigo e a proxima mudanca de fluxo vira
   um remendo no meio dela.

   ⚠️ BANDO E BARRA APARECEM SO NA EMBALAGEM, e isso e a decisao que a spec
   faz questao de separar. Eles sao da serralheria, como o tubo — mas nao
   seguram a MONTAGEM: entram na hora de fechar a caixa. Poe-los tambem na
   montagem pararia a linha inteira por uma peca que so e necessaria no fim. */
const ANTES={
  serralheria:[],
  colecao:[],
  montagem:['tubo','base','tecido'],
  revisao:['montagem'],
  embalagem:['revisao','bando','barra']
};

/* ⚠️ SO CONTA QUEM EXISTE NAQUELA PERSIANA. A peca sem adicional nao tem
   bandô nem barra, e exigi-los a deixaria esperando para sempre por uma peca
   que nunca foi feita — o silencio que este arquivo existe para impedir.

   ⚠️ E SO QUEM GERA ETIQUETA. A reducao de peso e componente da montagem e
   NAO tem codigo (fase 4-A): sem bipe ela nunca termina, e se pudesse
   segurar alguem a montagem esperaria a vida toda. */
function seguram(componente, irmaos){
  const espera=ANTES[componente.setor]||[];
  return irmaos.filter(x=>
    espera.includes(x.chave) && x.gera_etiqueta && !x.terminado_em);
}

const liberado=(componente,irmaos)=>seguram(componente,irmaos).length===0;

/* A frase da recusa e PARTE DA REGRA, nao texto de erro: e ela que diz a
   quem esta com a peca na mao por que a tela nao a aceitou, e por onde
   resolver. Sem ela a montagem fica esperando o tubo que ja esta na bancada.

   ⚠️ O SETOR SAI PELO NOME, e nao pela chave. A primeira versao escrevia
   "Tecido · colecao · nem começou" — chave de banco na tela da bancada, que
   e o "— Correcao de contagem" do §2 do CLAUDE.md outra vez, e o mesmo
   defeito que o historico da fase 4-A teve. **So apareceu abrindo a tela**:
   o texto estava sintaticamente perfeito e nenhum caso de unidade o pega. */
let nomesDeSetor=null;
function nomeDoSetor(chave){
  if(!nomesDeSetor){
    nomesDeSetor={};
    for(const s of etq.setores()) nomesDeSetor[s.chave]=s.nome;
  }
  return nomesDeSetor[chave]||chave;
}

function frase(pendentes){
  return pendentes.map(x=>{
    const quem=x.iniciado_em
      ? ' · iniciado às '+String(x.iniciado_em).slice(11,16)+(x.iniciado_por?' por '+x.iniciado_por:'')
      : ' · nem começou';
    return (x.nome||x.chave)+' · '+nomeDoSetor(x.setor)+quem;
  }).join('   |   ');
}

// ── Quem pode bipar o que ─────────────────────────────────────────────────
/* A chave `producao.bipar` responde "esta pessoa esta em alguma bancada?"
   (fase 5-A). Aqui a pergunta e outra e mais estreita: "nesta?". O bipe grava
   QUEM FEZ a peca, e e por ele que a recusa da fase 5-B2 vai achar a pessoa
   certa — regua que aponta o inocente e pior que regua nenhuma. */
function podeNoSetor(usuario,setor){
  if(!usuario) return false;
  if(permissoes.pode(usuario,'catalogo.editar')) return true;   // o diretor, pelo `*`
  return (usuario.setores||[]).includes(setor);
}

function achar(codigo){
  const c=d.porCodigo(String(codigo||'').trim());
  exigir(c,'codigo_desconhecido','Não existe etiqueta com o código "'+codigo+'". '+
    'Confira se o papel é desta fábrica e se o pedido já foi aprovado.');
  return c;
}

/* ── O KIT ────────────────────────────────────────────────────────────────
   ⚠️ AQUI PROVA QUE ENTROU O CERTO, e nao que entrou ALGUM. Na medida padrao
   o QR do kit e fixo e so garante que alguem bipou um kit (§4 do CLAUDE.md);
   aqui cada tipo tem codigo proprio (secao 4.7), entao o kit bandô numa peca
   lisa e recusado dizendo qual e o certo.

   A limpeza e a do §12: o leitor manda o codigo picado, com Tab ou espaco no
   meio. Ela NAO e o `public/kit_bipe.js` do PCP de proposito — la a pergunta
   e "isto e o kit?" contra um link do Drive; aqui e "e o kit DESTA peca?"
   contra um CODE128. Duas perguntas diferentes, e juntar as duas faria a
   regra de uma valer para a outra no dia em que uma delas mudasse. */
const limpo=s=>String(s||'').replace(/[^A-Za-z0-9]/g,'').toUpperCase();

function kitDoItem(irmaos){ return irmaos.find(x=>x.eh_kit)||null; }

/* ⚠️ SEM SUPORTES NAO E FALTA DE DADO: o kit tradicional nao usa faixa de
   suporte (secao 4.7 — ele leva o padrao do kit), e so o kit bandô e o kit
   barra contam suporte pela largura. A primeira versao escrevia "· sem
   quantidade de suportes cadastrada" nesse caso, que soa como defeito no
   caso NORMAL — e aviso que dispara no normal e o que a equipe aprende a
   ignorar (armadilha #6). Quem avisa de faixa faltando e o persiana.js, na
   hora de montar a ficha, que e onde o dado se resolve.
   **So apareceu abrindo a tela.** */
function descreveKit(kit){
  if(!kit) return 'o kit desta peça';
  return (kit.nome||'kit').toUpperCase()+
    (kit.suportes!=null?' · '+kit.suportes+' suportes':'');
}

function biparKit(codigo,codigoKit,usuario){
  const c=achar(codigo);
  exigir(podeNoSetor(usuario,c.setor),'setor_errado',
    'Esta etiqueta é da '+nomeDoSetor(c.setor)+', e você não está nessa bancada.');
  exigir(c.setor==='embalagem','kit_fora_da_embalagem',
    'O kit só é conferido na embalagem. Esta etiqueta é da '+nomeDoSetor(c.setor)+'.');
  exigir(c.iniciado_em,'nao_iniciado','Bipe a etiqueta da peça primeiro, e depois o kit.');

  const irmaos=d.doItem(c.item_id);
  const kit=kitDoItem(irmaos);
  /* ⚠️ KIT SEM CODIGO CADASTRADO E RECUSA, NUNCA "PASSOU". Deixar passar
     faria a conferencia existir no papel e nao pegar em ninguem — a divida
     18 do CLAUDE.md pela porta da bancada, e justamente na peca que ja esta
     dentro do plastico. */
  exigir(kit&&kit.codigo_barras,'kit_sem_codigo',
    'Esta peça leva '+descreveKit(kit)+', e esse kit está sem código de barras no cadastro. '+
    'Sem ele não dá para conferir — avise a chefia antes de fechar a caixa.');

  exigir(limpo(codigoKit)===limpo(kit.codigo_barras),'kit_errado',
    'Kit errado. Esta persiana leva '+descreveKit(kit)+'.');

  d.marcar(c.id,{kit_conferido_em:dia.agora()});
  return {ok:true, kit:descreveKit(kit)};
}

/* ── O BIPE ───────────────────────────────────────────────────────────────
   Um campo so na tela e um bipe so na mao: o primeiro inicia, o segundo
   termina. Dois botoes ("iniciar" e "terminar") seriam uma escolha a mais
   para quem esta de luva, e a escolha errada e trabalho perdido. */
function bipar(codigo,usuario){
  const c=achar(codigo);
  exigir(podeNoSetor(usuario,c.setor),'setor_errado',
    'Esta etiqueta é da '+nomeDoSetor(c.setor)+', e você não está nessa bancada.');
  exigir(!c.item_cancelado_em,'peca_cancelada','Esta peça foi cancelada e não deve ser feita.');

  if(c.terminado_em)
    throw new ErroDeRegra('ja_terminado','Esta peça já foi terminada'+
      (c.terminado_por?' por '+c.terminado_por:'')+
      (c.terminado_em?' às '+String(c.terminado_em).slice(11,16):'')+'.');

  const irmaos=d.doItem(c.item_id);

  if(!c.iniciado_em){
    const pendentes=seguram(c,irmaos);
    if(pendentes.length)
      throw new ErroDeRegra('aguardando','Ainda não dá para começar — aguardando: '+frase(pendentes));
    d.marcar(c.id,{iniciado_em:dia.agora(), iniciado_por:nome(usuario)});
    return {acao:'iniciado', codigo:c.codigo_etiqueta, o_que_fazer:etq.tarefaDe(c)};
  }

  /* O FIM. Na embalagem ele e o TERCEIRO bipe, e o do kit tem que ter
     passado — a trava mora no servidor e nao na tela, que e a licao do
     `kit_ok` da armadilha #26 do PCP: aviso que so existe no navegador nao
     protege quem chama a rota por fora. */
  if(c.setor==='embalagem'&&!c.kit_conferido_em)
    throw new ErroDeRegra('faltou_kit','⚠ FALTOU O KIT. Bipe o kit desta peça antes de fechar: '+
      descreveKit(kitDoItem(irmaos))+'.');

  return db.transaction(()=>{
    d.marcar(c.id,{terminado_em:dia.agora(), terminado_por:nome(usuario)});
    const r={acao:'terminado', codigo:c.codigo_etiqueta, pronto:false};
    /* ⚠️ O PRONTO E `pronto_em`, E NAO UM VALOR NOVO EM `marco`. Tres lugares
       filtram por `marco='aprovado'` — a reimpressao da etiqueta e as duas
       contas do comprometido e do material (fases 4-B e 4-C). Trocar o marco
       faria a etiqueta parar de reimprimir e mudaria EM SILENCIO os numeros
       da compra. O historico registra o pronto, e o kanban da fase 6 le dali. */
    if(c.setor==='embalagem'&&d.faltamEmbalar(c.pedido_id)===0){
      d.marcarPronto(c.pedido_id,dia.agora());
      dpedido.criarMarco({pedido_id:c.pedido_id, marco:'pronto',
        detalhe:null, usuario_nome:nome(usuario)});
      r.pronto=true;
    }
    return r;
  })();
}

/* ── A PENDENCIA ──────────────────────────────────────────────────────────
   A serralheria esqueceu de bipar o fim do tubo e foi embora; a montagem fica
   esperando uma peca que ja esta na bancada. Sem saida, o que a equipe faz e
   parar de usar a tela.

   ⚠️ E DA CHEFIA, NAO DE QUEM BIPA. Se a bancada pudesse fechar a propria
   pendencia, a trava deixaria de existir: bastaria fechar tudo e seguir.
   ⚠️ E NAO FECHA SEM MOTIVO. Fechamento sem porque nao e rastro — e so
   destravar, e daqui a um mes ninguem sabe por que aquela peca nunca foi
   bipada. */
function fecharPendencia(codigo,dados,usuario){
  const c=achar(codigo);
  exigir(permissoes.pode(usuario,'producao.pendencia'),'sem_permissao',
    'Fechar pendência é da chefia: é ela que responde por uma peça dada como '+
    'feita sem o bipe de quem fez.');
  const motivo=String((dados&&dados.motivo)||'').trim();
  exigir(motivo,'motivo_obrigatorio','Diga por que esta peça está sendo fechada sem o bipe. '+
    'Sem o motivo, daqui a um mês ninguém sabe o que aconteceu com ela.');
  exigir(!c.terminado_em,'ja_terminado','Esta peça já está terminada.');

  return db.transaction(()=>{
    d.marcar(c.id,{terminado_em:dia.agora(), terminado_por:nome(usuario)});
    d.criarPendencia({componente_id:c.id, codigo_etiqueta:c.codigo_etiqueta,
      motivo, usuario_nome:nome(usuario)});
    return {ok:true, codigo:c.codigo_etiqueta};
  })();
}

/* ── A FILA ───────────────────────────────────────────────────────────────
   O que esta bancada pode fazer AGORA, do prazo mais curto para o mais
   longo. A linha diz o que FAZER (`o_que_fazer`), e nao so o codigo: lista
   de codigo serve a quem decorou o catalogo, que e o que o comentario da
   lista do dia do PCP ja manda nao fazer.

   ⚠️ O `o_que_fazer` SAI DO `etq.tarefaDe`, o mesmo do papel. A tela e a
   etiqueta tem que mandar cortar a MESMA medida — e a de CORTE, nunca a
   acabada (armadilha #18). Uma segunda frase aqui divergiria no dia em que
   uma das duas mudasse, e na bancada vence a etiqueta. */
function fila(setor,usuario){
  exigir(podeNoSetor(usuario,setor),'setor_errado','Você não está nesta bancada.');
  const abertos=d.doSetor(setor);
  const porItem=new Map();
  const irmaosDe=item_id=>{
    if(!porItem.has(item_id)) porItem.set(item_id,d.doItem(item_id));
    return porItem.get(item_id);
  };
  return abertos.filter(c=>liberado(c,irmaosDe(c.item_id))).map(c=>({
    codigo:c.codigo_etiqueta,
    chave:c.chave, setor:c.setor,
    pedido_id:c.pedido_id, pedido_numero:c.pedido_numero,
    revenda:c.revenda_nome, prazo:c.prazo_atual,
    item_n:c.item_n,
    o_que_fazer:etq.tarefaDe(c),
    em_andamento:!!c.iniciado_em,
    iniciado_em:c.iniciado_em, iniciado_por:c.iniciado_por,
    /* ⚠️ A PECA RECUSADA VOLTA MARCADA. Sem isso ela fica identica a
       qualquer outra na lista, e o serralheiro corta de novo sem saber que
       ja cortou uma que foi para o lixo — e sem saber que ha uma etiqueta
       igual a esta em algum lugar da bancada (fase 4-A). */
    refeitas:c.refeitas||0
  }));
}

/* O que segura uma peca — a mesma conta da recusa, exposta para a tela poder
   mostrar sem precisar provocar um erro. */
function oQueSegura(codigo){
  const c=achar(codigo);
  return seguram(c,d.doItem(c.item_id)).map(x=>({
    chave:x.chave, nome:x.nome, setor:x.setor,
    iniciado_em:x.iniciado_em, iniciado_por:x.iniciado_por
  }));
}

/* ── A RECUSA (fase 5-B2, secao 4.16) ─────────────────────────────────────
   Qualquer bancada recusa a peca por defeito do trabalho ANTERIOR, e quem
   recusa escolhe SO O MOTIVO — o motivo ja diz qual peca volta.

   ⚠️ ELA ANDA PARA TRAS PELA MESMA TABELA QUE LIBERA PARA A FRENTE. O
   `ANTES` diz o que libera o que; lido de tras para a frente diz o que e
   "trabalho anterior", e lido no sentido normal diz o que tem que voltar
   para "aguardando". Uma segunda tabela divergiria no dia em que o fluxo
   mudasse, e as duas estariam "certas" — armadilha #12 do CLAUDE.md. */

/* O QUE VEM ANTES DESTA BANCADA, direta ou indiretamente. A embalagem
   alcanca a revisao, a montagem e, por ela, o tubo, a base e o tecido. A
   serralheria e a colecao nao alcancam nada: elas sao as primeiras. */
function anteriores(setor,irmaos){
  const setorDe={}; irmaos.forEach(x=>{ setorDe[x.chave]=x.setor; });
  const vistos=new Set(), pilha=[setor];
  while(pilha.length){
    const s=pilha.pop();
    for(const k of (ANTES[s]||[])){
      if(vistos.has(k)) continue;
      vistos.add(k);
      if(setorDe[k]) pilha.push(setorDe[k]);
    }
  }
  return vistos;
}

/* O QUE FOI FEITO EM CIMA DESTA PECA — o culpado mais tudo que depende dele.
   ⚠️ NEM MAIS, NEM MENOS. A mais, a serralheria refaz a base porque o tubo
   veio errado: trabalho jogado fora todo dia, que e a armadilha #6. A menos,
   a persiana continua montada em cima de um tubo que ja foi para o lixo. */
function posteriores(chave,irmaos){
  const alcanca=new Set([chave]);
  let mudou=true;
  while(mudou){
    mudou=false;
    for(const x of irmaos){
      if(alcanca.has(x.chave)) continue;
      if((ANTES[x.setor]||[]).some(k=>alcanca.has(k))){ alcanca.add(x.chave); mudou=true; }
    }
  }
  return irmaos.filter(x=>alcanca.has(x.chave));
}

function recusar(codigo,dados,usuario){
  const c=achar(codigo);
  exigir(podeNoSetor(usuario,c.setor),'setor_errado',
    'Esta etiqueta é da '+nomeDoSetor(c.setor)+', e você não está nessa bancada. '+
    'Quem recusa é quem está com a peça na mão.');
  exigir(!c.item_cancelado_em,'peca_cancelada','Esta peça foi cancelada e não deve ser feita.');

  const motivo_id=Number((dados&&dados.motivo_id)||0);
  exigir(motivo_id,'motivo_obrigatorio','Escolha o motivo: é ele que diz qual peça volta.');
  const m=motivos.porId(motivo_id);
  exigir(m,'motivo_inexistente','Este motivo não está mais no cadastro. Avise a chefia.');
  exigir(m.ativo,'motivo_inativo','O motivo "'+m.nome+'" foi desativado. Escolha outro.');

  const irmaos=d.doItem(c.item_id);
  const culpado=irmaos.find(x=>x.chave===m.componente_chave);
  exigir(culpado,'peca_sem_esse_componente',
    'Esta persiana não leva '+(m.componente_nome||m.componente_chave)+', então não há o que refazer. '+
    'Confira se o motivo é o certo.');

  /* ⚠️ NAO SE RECUSA O PROPRIO TRABALHO. Refazer o que acabei de fazer nao e
     recusa — e so refazer. Aceitar aqui daria a quem errou o caminho de
     apagar o proprio bipe, e o bipe e o rastro de quem fez. */
  exigir(culpado.id!==c.id,'recusa_do_proprio',
    'Refazer o próprio trabalho não é recusa. A recusa é para o defeito que veio do setor de trás.');

  /* ⚠️ E SO DO QUE VEM ANTES. A colecao recusando o tubo seria uma bancada
     mandando refazer uma peca que ela nunca viu. */
  exigir(anteriores(c.setor,irmaos).has(culpado.chave),'nao_e_anterior',
    (culpado.nome||culpado.chave)+' não é trabalho anterior à '+nomeDoSetor(c.setor)+
    ' — a peça não passa por aqui depois dele. A recusa é para o defeito que veio do setor de trás.');

  exigir(culpado.terminado_em,'culpado_nao_terminado',
    (culpado.nome||culpado.chave)+' ainda não foi terminado, então não há trabalho para refazer. '+
    (culpado.iniciado_em?'Ele está em andamento na '+nomeDoSetor(culpado.setor)+'.'
                        :'Ele nem começou na '+nomeDoSetor(culpado.setor)+'.'));

  const volta=posteriores(culpado.chave,irmaos);
  return db.transaction(()=>{
    d.reabrir(volta.map(x=>x.id));
    d.contarRefeita(culpado.id);
    /* O pedido que estava pronto deixa de estar: ha peca voltando para a
       bancada. O `marco` continua `aprovado` (migracao 21). */
    if(c.pronto_em) d.desfazerPronto(c.pedido_id);
    d.criarRecusa({
      item_id:c.item_id, componente_id:culpado.id,
      codigo_etiqueta:culpado.codigo_etiqueta,
      motivo_id:m.id, motivo_nome:m.nome,
      observacao:String((dados&&dados.observacao)||'').trim()||null,
      recusado_de:c.setor, recusado_codigo:c.codigo_etiqueta,
      recusado_por:nome(usuario),
      /* ⚠️ QUEM FEZ E RETRATO, e este e o unico lugar onde ele sobra: a
         reabertura acabou de apagar o bipe do culpado. Sem esta linha,
         "recusas por pessoa" (secao 4.17) nao tem de onde sair. */
      feito_por:culpado.terminado_por, feito_em:culpado.terminado_em,
      reabertos:volta.length
    });
    /* A recusa vai para o historico do PEDIDO, que e onde alguem olha quando
       pergunta por que a persiana demorou. */
    dpedido.criarMarco({pedido_id:c.pedido_id, marco:'recusa',
      detalhe:(culpado.nome||culpado.chave)+' · '+m.nome+
        ' · recusado na '+nomeDoSetor(c.setor),
      usuario_nome:nome(usuario)});
    return {ok:true,
      culpado:{codigo:culpado.codigo_etiqueta, chave:culpado.chave,
               nome:culpado.nome, setor:culpado.setor,
               setor_nome:nomeDoSetor(culpado.setor)},
      motivo:m.nome,
      reabertos:volta.map(x=>x.codigo_etiqueta||x.chave)};
  })();
}

/* O que a bancada ve na hora de recusar. Ela le por AQUI e nao por
   /api/cadastros: mandar quem so bipa na tela de cadastros daria a ela a
   lista inteira de tecido, endereco e motivo de sobra para responder uma
   pergunta de tres palavras — e a licao da porta das cores da fase 3.

   ⚠️ A LISTA E DESTA PECA, E NAO O CADASTRO INTEIRO — e isso SO APARECEU
   ABRINDO A TELA. A primeira versao oferecia os oito motivos cadastrados na
   bancada da Montagem, dois deles impossiveis dali: "Montagem torta" e o
   PROPRIO trabalho e "Revisao deixou passar" vem DEPOIS. Quem esta de luva
   toca "Montagem torta" achando que e "a montagem esta torta, refaz" — e
   leva recusa. Escolha que so serve para dar erro e a armadilha #6 dentro de
   uma lista, e nenhum caso de unidade a pega: as guardas estavam certas e
   verdes.

   As guardas do servidor FICAM (a rota e chamavel por fora, e e a licao do
   `kit_ok` da armadilha #26 do PCP). O que muda e a tela parar de oferecer o
   que ela ja sabe que nao passa. Tres filtros, e os tres sao os mesmos que
   o `recusar` confere: vir ANTES, EXISTIR nesta persiana, e estar PRONTO. */
function listarMotivos(codigo){
  const c=achar(codigo);
  const irmaos=d.doItem(c.item_id);
  const antes=anteriores(c.setor,irmaos);
  const porChave={}; irmaos.forEach(x=>{ porChave[x.chave]=x; });

  const lista=motivos.ativos().filter(m=>{
    const irmao=porChave[m.componente_chave];
    return antes.has(m.componente_chave) && irmao && irmao.terminado_em;
  }).map(m=>({
    id:m.id, nome:m.nome,
    componente_chave:m.componente_chave, componente_nome:m.componente_nome,
    setor:m.setor, setor_nome:m.setor_nome||nomeDoSetor(m.setor)
  }));

  /* ⚠️ LISTA VAZIA DIZ POR QUE. "Nada aqui" se parece com tela quebrada, e
     quem esta com a peca na mao nao tem como saber a diferenca entre "nao ha
     motivo cadastrado" e "a tela nao carregou". As tres razoes sao
     diferentes, e cada uma manda para um lugar diferente. */
  let sem_motivo=null;
  if(!lista.length){
    if(!antes.size)
      sem_motivo='A '+nomeDoSetor(c.setor)+' é a primeira bancada desta persiana — '+
        'não há trabalho anterior para recusar.';
    else if(!motivos.ativos().length)
      sem_motivo='Não há motivo de recusa cadastrado. Quem cadastra é a chefia, em Cadastros.';
    else
      sem_motivo='Nada do que vem antes desta peça está pronto para ser recusado. '+
        'Se falta alguém bipar o fim, a chefia resolve pela pendência.';
  }
  return {codigo:c.codigo_etiqueta, setor:c.setor,
          setor_nome:nomeDoSetor(c.setor), motivos:lista, sem_motivo};
}

/* AS PECAS A REFAZER — o card de quem esta na Zebra. A etiqueta sai com o
   MESMO codigo (ele e da peca, nao do papel) e marcada como refeita. */
function aRefazer(){
  return d.aRefazer().map(c=>({
    codigo:c.codigo_etiqueta, chave:c.chave,
    setor:c.setor, setor_nome:nomeDoSetor(c.setor),
    pedido_id:c.pedido_id, pedido_numero:c.pedido_numero,
    revenda:c.revenda_nome, item_n:c.item_n,
    o_que_fazer:etq.tarefaDe(c),
    refeitas:c.refeitas, motivo:c.motivo, recusado_por:c.recusado_por
  }));
}

module.exports={fila,bipar,biparKit,oQueSegura,fecharPendencia,
  recusar,motivos:listarMotivos,aRefazer,
  ANTES,anteriores,posteriores};

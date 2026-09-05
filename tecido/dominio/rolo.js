// DONO UNICO de rolo.saldo. Nenhum outro arquivo escreve nessa coluna.
//
// R7: tres movimentos, e TODOS deixam linha em movimento_rolo — entrada,
//     consumo e ajuste. Saldo que muda sem movimento e saldo sem historia,
//     e sem historia nao ha como descobrir onde o estoque furou.
// R8: o PRIMEIRO consumo vira o rolo de fechado para aberto sozinho. Nao
//     existe campo que o operador marque: um estado que depende de alguem
//     lembrar de marcar e um estado que mente.
// R9: o acerto no fim. A metragem vem da nota e nao e conferida na entrada —
//     sem esse acerto o saldo infla mes a mes com metros que nunca existiram.
// R10: m2 nunca e digitado. E saldo x largura, sempre.
const db=require('../nucleo/db');
const dia=require('../nucleo/dia');
const {ErroDeRegra,exigir}=require('../nucleo/erros');
const dRolo=require('../dados/rolo');
const dTecido=require('../dados/tecido');
const endereco=require('./endereco');
const dLargura=require('./largura');
const dFornecedor=require('../dados/fornecedor');

const MAX_LARGURA=10, MAX_METRAGEM=2000;
const arred=v=>Math.round(v*1000)/1000;    // milimetro; o resto e ruido

const formatar=seq=>'R-'+String(seq).padStart(6,'0');

function medida(valor,rotulo,maximo){
  const n=Number(String(valor==null?'':valor).replace(',','.').trim());
  exigir(isFinite(n)&&n>0,'medida_invalida','Informe '+rotulo+'.');
  exigir(n<=maximo,'medida_absurda',rotulo+' de '+n+'? Confira o numero.');
  return arred(n);
}

/* ── DE QUEM VEIO, E QUANTO CUSTOU ────────────────────────────────────────
   As duas conferencias que a entrada e a edicao compartilham. Ficam juntas
   aqui porque um teto que vale so na entrada e um teto que nao vale: a
   edicao posterior escreve na mesma coluna. */
const MAX_PRECO=10000;   // R$/m2. Acima disso e virgula no lugar errado.

function fornecedorDe(id){
  if(id==null||id==='') return null;
  const f=dFornecedor.porId(id);
  exigir(f,'fornecedor_inexistente','Escolha um fornecedor da lista.');
  exigir(f.ativo,'fornecedor_inativo','O fornecedor '+f.nome+' esta desativado.');
  return f;
}

function precoDe(valor){
  if(valor==null||String(valor).trim()==='') return null;   // nota ainda nao chegou
  const n=Number(String(valor).replace(',','.').trim());
  exigir(isFinite(n)&&n>0,'preco_invalido','O preco e em R$ por metro quadrado (ex.: 18,50).');
  exigir(n<=MAX_PRECO,'preco_absurdo','R$ '+n+' por m²? Confira o numero.');
  // Seis casas: R$ 0,0825 por m2 e preco de verdade, nao ruido.
  return Math.round(n*1e6)/1e6;
}

// ── ENTRADA ──────────────────────────────────────────────────────────────
function entrada(dados,usuarioNome){
  const tecido=dTecido.porId(dados.tecido_id);
  exigir(tecido,'tecido_inexistente','Escolha o tecido.');
  exigir(tecido.ativo,'tecido_inativo','O tecido '+tecido.codigo+' esta desativado.');

  // R2: a largura e DESTE rolo. O mesmo Rolo 3% Bege existe em 2,00, 2,50 e
  // 3,00, e e justamente essa diferenca que o plano de corte explora.
  const largura=medida(dados.largura,'a largura da bobina em metros',MAX_LARGURA);
  /* METRAGEM E O QUE ESTA NO ROLO AGORA, e nao o que a nota dizia.
     A diferenca so importa no inventario inicial — e la ela importa muito:
     a fabrica tem bobinas ja abertas, e este numero vira o SALDO. Digitar os
     50 m da nota num rolo com 18 m no tubo poe 32 metros inexistentes no
     estoque, e o plano passa a prometer uma faixa que o rolo nao tem. */
  const metragem=medida(dados.metragem,'quantos metros o rolo tem agora',MAX_METRAGEM);

  if(dados.nivel_id) endereco.exigirArmazem(dados.nivel_id,'ROLO');

  /* DE QUEM VEIO E QUANTO CUSTOU — os dois OPCIONAIS, e nao por preguica.
     A nota fiscal chega dias DEPOIS do rolo: exigi-la na entrada faria o
     operador inventar um numero ou deixar o rolo fora do sistema, que e a
     armadilha #6 pela terceira porta. Rolo sem nota entra, e aparece na
     lista "sem nota" ate alguem lancar (dominio/custo.js). */
  const forn=fornecedorDe(dados.fornecedor_id);
  const preco=precoDe(dados.preco_m2);

  return db.transaction(()=>{
    /* A LARGURA DESTA ENTRADA ENSINA A LISTA. Se o operador digitou uma
       bobina que nao esta cadastrada, ela entra aqui mesmo — marcada para a
       chefia conferir — em vez de ficar so dentro deste rolo. O proximo tubo
       da mesma bobina ja acha o botao pronto, e um numero digitado errado
       aparece numa lista em vez de sumir dentro de um registro.

       Dentro da transacao de proposito: cadastro de largura sem rolo, se a
       entrada falhasse depois, seria lixo que ninguem sabe de onde veio. */
    const nova=dLargura.garantir(largura,usuarioNome);

    const codigo=formatar(dRolo.ultimoSeq()+1);
    const id=dRolo.criar({codigo,tecido_id:tecido.id,largura,metragem,
      nivel_id:dados.nivel_id,nf:dados.nf,fornecedor:dados.fornecedor,
      fornecedor_id:forn?forn.id:null, preco_m2:preco,
      criado_por:usuarioNome});
    dRolo.movimentar({rolo_id:id,delta:metragem,saldo_apos:metragem,motivo:'entrada',
      observacao:dados.nf?('NF '+dados.nf):null,usuario_nome:usuarioNome});
    // `largura_cadastrada` sobe para a tela dizer o que ela fez. Cadastrar em
    // silencio faria a lista crescer sozinha, e lista que cresce sem ninguem
    // ver e a mesma coisa que lista que ninguem le.
    return {...dRolo.porId(id), largura_cadastrada:!!nova.criada};
  })();
}

/* ── A NOTA CHEGA DEPOIS DO ROLO ──────────────────────────────────────────
   E isso e o caso NORMAL, nao a excecao. O tubo desce do caminhao e vai para
   a estante; a nota entra no financeiro dias depois, as vezes semanas. Um
   sistema que so aceita a nota no momento da entrada obriga a uma de duas
   coisas, e as duas sao piores: inventar um numero na hora, ou deixar o rolo
   fora do sistema ate a nota chegar.

   MUDAR O PRECO MUDA O VALOR DO ESTOQUE, entao nao passa calado: fica em
   movimento_rolo com delta ZERO, dizendo de -> para e quem fez. Mesma tabela
   da mudanca de endereco, pelo mesmo motivo — o historico do rolo e um so.

   O QUE ESTA FUNCAO NAO TOCA: largura, metragem e saldo. Esses o plano de
   corte usa para decidir de onde cortar, e cada um tem a sua porta com a sua
   regra (ajustar, encerrar). Um `atualizar` generico aceitaria mexer neles
   por engano vindo de um formulario de nota fiscal. */
function editarDados(rolo_id,dados,usuarioNome){
  const r=dRolo.porId(rolo_id);
  exigir(r,'rolo_inexistente','Rolo nao encontrado.');

  const forn=dados.fornecedor_id===undefined?{id:r.fornecedor_id,nome:r.fornecedor_nome}
                                            :fornecedorDe(dados.fornecedor_id);
  const preco=dados.preco_m2===undefined?r.preco_m2:precoDe(dados.preco_m2);
  const nf=dados.nf===undefined?r.nf:(String(dados.nf||'').trim()||null);

  const mudou=[];
  const conta=(oque,de,para)=>{ if(String(de==null?'':de)!==String(para==null?'':para))
    mudou.push(oque+': '+(de==null||de===''?'—':de)+' -> '+(para==null||para===''?'—':para)); };
  conta('NF',r.nf,nf);
  conta('fornecedor',r.fornecedor_nome,forn?forn.nome:null);
  conta('preco/m²',r.preco_m2,preco);

  // Salvar sem mudar nada nao vira linha de historico: historico que nao
  // conta nada e historico que ninguem le.
  if(!mudou.length) return dRolo.porId(rolo_id);

  return db.transaction(()=>{
    dRolo.atualizarDados(rolo_id,{nf,fornecedor_id:forn?forn.id:null,preco_m2:preco});
    dRolo.movimentar({rolo_id,delta:0,saldo_apos:r.saldo,motivo:'nota',
      observacao:mudou.join(' · '), usuario_nome:usuarioNome});
    return dRolo.porId(rolo_id);
  })();
}

/* ── MUDAR O ROLO DE LUGAR ────────────────────────────────────────────────
   O tubo sai da estante para cortar e volta — na maioria das vezes para o
   mesmo buraco, e ai nao ha nada a registrar. Quando volta em OUTRA haste ou
   andar, o endereco do sistema passa a apontar para um lugar vazio, e o
   proximo que procurar aquele rolo nao vai achar.

   Fica registrado em movimento_rolo com delta ZERO: o saldo nao mudou, o
   lugar mudou. E a mesma tabela de proposito — o historico do rolo e um so,
   e quem investiga "cade este rolo" le a mesma lista de quem investiga
   "quanto foi consumido".

   O NOME DE QUEM MOVEU VEM DA SESSAO, nunca de um campo digitado. Campo de
   nome em tela de fabrica e preenchido com o nome de quem esta por perto. */
function mover(rolo_id,nivel_id,usuarioNome){
  const r=dRolo.porId(rolo_id);
  exigir(r,'rolo_inexistente','Rolo nao encontrado.');
  exigir(r.status!=='encerrado','rolo_encerrado',
    'O rolo '+r.codigo+' esta encerrado — ele nao volta para a estante.');
  exigir(nivel_id,'endereco_obrigatorio','Diga para qual endereco o rolo foi.');
  endereco.exigirArmazem(nivel_id,'ROLO');

  const de=r.nivel_id?endereco.descrever(r.nivel_id):'sem endereco';
  const para=endereco.descrever(nivel_id);
  // Mesmo lugar nao e movimento: registrar isso encheria o historico de
  // linhas que nao contam nada, e historico que nao conta nada ninguem le.
  if(Number(r.nivel_id)===Number(nivel_id))
    throw new ErroDeRegra('mesmo_endereco','O rolo '+r.codigo+' ja esta em '+para+'.');

  return db.transaction(()=>{
    dRolo.atualizarEndereco(rolo_id,nivel_id);
    dRolo.movimentar({rolo_id,delta:0,saldo_apos:r.saldo,motivo:'mudanca_endereco',
      observacao:'de '+de+' para '+para, usuario_nome:usuarioNome});
    return dRolo.porId(rolo_id);
  })();
}

// ── CONSUMO ──────────────────────────────────────────────────────────────
// Chamado pelo plano, dentro da transacao do Confirmar.
function consumir(rolo_id,metros,referencia,usuarioNome){
  const r=dRolo.porId(rolo_id);
  exigir(r,'rolo_inexistente','Rolo nao encontrado.');
  exigir(r.status!=='encerrado','rolo_encerrado','O rolo '+r.codigo+' esta encerrado.');
  const m=medida(metros,'os metros a consumir',MAX_METRAGEM);
  exigir(m<=r.saldo+0.001,'saldo_insuficiente',
    'O rolo '+r.codigo+' tem '+r.saldo.toFixed(2).replace('.',',')+' m e o corte pede '+
    m.toFixed(2).replace('.',',')+' m.');

  const saldo=arred(r.saldo-m);
  // R8: e aqui que fechado vira aberto, sozinho.
  dRolo.gravarSaldo(rolo_id,saldo,'aberto');
  dRolo.movimentar({rolo_id,delta:-m,saldo_apos:saldo,motivo:'consumo',
    referencia:referencia==null?null:String(referencia),usuario_nome:usuarioNome});
  return dRolo.porId(rolo_id);
}

// ── AJUSTE ───────────────────────────────────────────────────────────────
function ajustar(rolo_id,novoSaldo,observacao,usuarioNome){
  const r=dRolo.porId(rolo_id);
  exigir(r,'rolo_inexistente','Rolo nao encontrado.');
  exigir(r.status!=='encerrado','rolo_encerrado','O rolo '+r.codigo+' esta encerrado.');
  const alvo=Number(String(novoSaldo).replace(',','.'));
  exigir(isFinite(alvo)&&alvo>=0,'medida_invalida','Informe o saldo real, em metros.');
  const texto=String(observacao||'').trim();
  exigir(texto,'motivo_obrigatorio','Diga por que o saldo esta sendo corrigido.');

  const delta=arred(alvo-r.saldo);
  exigir(Math.abs(delta)>0.001,'sem_diferenca','O saldo informado e o mesmo que ja esta no sistema.');

  return db.transaction(()=>{
    dRolo.gravarSaldo(rolo_id,arred(alvo),r.status);
    dRolo.movimentar({rolo_id,delta,saldo_apos:arred(alvo),motivo:'ajuste',
      observacao:texto,usuario_nome:usuarioNome});
    return dRolo.porId(rolo_id);
  })();
}

// ── O ACERTO NO FIM DO ROLO (R9) ─────────────────────────────────────────
// O operador marca "rolo acabou". O sistema encerra, zera e grava a diferenca.
// E o unico lugar onde a mentira da nota fiscal e corrigida: sem ele, cada
// rolo deixa para tras alguns metros que nunca existiram, e em doze meses o
// saldo do sistema nao tem mais relacao com a prateleira.
function encerrar(rolo_id,usuarioNome){
  const r=dRolo.porId(rolo_id);
  exigir(r,'rolo_inexistente','Rolo nao encontrado.');
  exigir(r.status!=='encerrado','rolo_encerrado','O rolo '+r.codigo+' ja esta encerrado.');

  return db.transaction(()=>{
    const sobrando=arred(r.saldo);
    dRolo.gravarSaldo(rolo_id,0,'encerrado');
    if(Math.abs(sobrando)>0.001)
      dRolo.movimentar({rolo_id,delta:-sobrando,saldo_apos:0,motivo:'encerramento',
        observacao:'rolo acabou; o sistema ainda marcava '+sobrando.toFixed(2).replace('.',',')+' m',
        usuario_nome:usuarioNome});
    else
      dRolo.movimentar({rolo_id,delta:0,saldo_apos:0,motivo:'encerramento',
        observacao:'rolo acabou, sem diferenca',usuario_nome:usuarioNome});
    return dRolo.porId(rolo_id);
  })();
}

// Criterio 13 da secao 10, rodado no boot. Nao trava o sistema: reclama alto
// no log. Um saldo que nao bate com a propria historia e o comeco de um
// inventario que ninguem mais confere.
function conferirSaldos(){
  const ruins=dRolo.divergencias();
  if(ruins.length) console.error('[rolo] ATENCAO: '+ruins.length+
    ' rolo(s) com saldo diferente da soma dos movimentos: '+
    ruins.map(r=>r.codigo+' (saldo '+r.saldo+', movimentos '+r.somaDelta+')').join(', '));
  return ruins;
}

/* O ENDERECO VAI ESCRITO NA RESPOSTA. A tela de rolos tinha a coluna
   "Endereco" desde a fase 5 e o servidor nunca mandou o campo — a coluna
   saia vazia, e ninguem reparou porque tela que mostra menos nao da erro.
   `endereco.descrever` e o dono unico do formato ('ROLO · A-1-2'). */
const comEndereco=r=>r?{...r, endereco:r.nivel_id?endereco.descrever(r.nivel_id):''}:r;

module.exports={mover,editarDados,
  entrada, consumir, ajustar, encerrar, conferirSaldos, formatar,
  // A leitura do preco digitado e uma so: a sobra usa a mesma regua do rolo.
  precoDe,
  listar:f=>dRolo.listar(f).map(comEndereco),
  porId:id=>comEndereco(dRolo.porId(id)),
  porCodigo:c=>dRolo.porCodigo(c),
  disponiveis:tecido_id=>dRolo.disponiveis(tecido_id),
  movimentos:id=>dRolo.movimentos(id),
  saldoPorTecido:()=>dRolo.saldoPorTecido()
};

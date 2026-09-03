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

const MAX_LARGURA=10, MAX_METRAGEM=2000;
const arred=v=>Math.round(v*1000)/1000;    // milimetro; o resto e ruido

const formatar=seq=>'R-'+String(seq).padStart(6,'0');

function medida(valor,rotulo,maximo){
  const n=Number(String(valor==null?'':valor).replace(',','.').trim());
  exigir(isFinite(n)&&n>0,'medida_invalida','Informe '+rotulo+'.');
  exigir(n<=maximo,'medida_absurda',rotulo+' de '+n+'? Confira o numero.');
  return arred(n);
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

  return db.transaction(()=>{
    const codigo=formatar(dRolo.ultimoSeq()+1);
    const id=dRolo.criar({codigo,tecido_id:tecido.id,largura,metragem,
      nivel_id:dados.nivel_id,nf:dados.nf,fornecedor:dados.fornecedor,criado_por:usuarioNome});
    dRolo.movimentar({rolo_id:id,delta:metragem,saldo_apos:metragem,motivo:'entrada',
      observacao:dados.nf?('NF '+dados.nf):null,usuario_nome:usuarioNome});
    return dRolo.porId(id);
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

module.exports={mover,
  entrada, consumir, ajustar, encerrar, conferirSaldos, formatar,
  listar:f=>dRolo.listar(f),
  porId:id=>dRolo.porId(id),
  porCodigo:c=>dRolo.porCodigo(c),
  disponiveis:tecido_id=>dRolo.disponiveis(tecido_id),
  movimentos:id=>dRolo.movimentos(id),
  saldoPorTecido:()=>dRolo.saldoPorTecido()
};

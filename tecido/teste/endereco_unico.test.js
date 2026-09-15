// UM ROLO POR NIVEL — a regra do dono, 15/09/2026.
//
// O nivel e o BURACO da estante, e no buraco cabe um tubo. `A-1-1` guarda um
// material, nao dois. O andar tem quantos niveis a prateleira fisica tiver, e
// e criando nivel que se guarda mais material — nao empilhando tubo no mesmo
// lugar.
//
// O buraco se esvazia SOZINHO, por dois caminhos e so esses dois:
//
//     Mover        o tubo foi para outro lugar
//     Rolo acabou  o material que estava sendo cortado terminou (encerrar)
//
// Nao ha botao de "esvaziar endereco": um terceiro caminho, manual, seria um
// jeito de o sistema achar que o buraco esta vazio com o tubo ainda la dentro.
//
// A trava e do ROLO. A sobra e retalho dobrado — varias cabem no mesmo lugar, e
// o que acha a peca certa la e a etiqueta, nao o endereco.
const rolo=require('../dominio/rolo');
const sobra=require('../dominio/sobra');
const etiqueta=require('../dominio/etiqueta');
const tecido=require('../dominio/tecido');
const endereco=require('../dominio/endereco');
const gerencial=require('../dominio/gerencial');
const db=require('../nucleo/db');

let cena=null;
function montar(){
  if(cena) return cena;
  const linha=tecido.criarLinha({nome:'Rolo'});
  const abertura=tecido.criarAbertura({nome:'Napoles',linha_id:linha.id});
  const cor=tecido.criarCor({nome:'Bege'});
  const t=tecido.criarTecido({linha_id:linha.id,abertura_id:abertura.id,cor_id:cor.id});

  const hR=endereco.criarHaste({nome:'A',armazem_chave:'ROLO'});
  const aR=endereco.criarAndar({nome:'1',haste_id:hR.id});
  const hS=endereco.criarHaste({nome:'S',armazem_chave:'SOBRA'});
  const aS=endereco.criarAndar({nome:'1',haste_id:hS.id});
  const nS=endereco.criarNivel({nome:'1',andar_id:aS.id});
  etiqueta.imprimirLote(10,'teste');

  let seq=0, seqS=1;
  cena={t, andarRolo:aR.id, nivelSobra:nS.id,
    buraco:()=>endereco.criarNivel({nome:String(++seq),andar_id:aR.id}).id,
    buracoSobra:()=>endereco.criarNivel({nome:String(++seqS),andar_id:aS.id}).id};
  return cena;
}
const novoRolo=(x,nivel,metragem)=>rolo.entrada(
  {tecido_id:x.t.id,largura:'2,50',metragem:metragem||'40',nivel_id:nivel},'Lucas');

module.exports=[

{nome:'UM ROLO POR NIVEL: o segundo tubo no mesmo buraco e recusado', executar({recusa,igual}){
  const x=montar();
  const n=x.buraco();
  const primeiro=novoRolo(x,n);
  const e=recusa(()=>novoRolo(x,n),'endereco_ocupado');
  // A recusa NOMEIA quem esta la. "Endereco ocupado" sozinho manda a bancada
  // procurar — e com o tubo na mao ela nao procura: lanca sem endereco, que e
  // o dado que nao volta depois.
  igual(/R-\d{6}/.test(e.mensagem),true,'a mensagem traz o codigo do rolo que esta la: '+e.mensagem);
  igual(e.mensagem.includes(primeiro.codigo),true,'e e o codigo certo');
  igual(/Rolo acabou/.test(e.mensagem),true,'e diz como liberar o buraco');
  igual(rolo.listar().filter(r=>r.nivel_id===n).length,1,'so um rolo ficou no nivel');
}},

{nome:'O BURACO SE ESVAZIA QUANDO O MATERIAL ACABA', executar({igual,perto}){
  const x=montar();
  const n=x.buraco();
  const velho=novoRolo(x,n);
  rolo.encerrar(velho.id,'Lucas');
  // Tubo vazio nao guarda lugar. Se o encerrado continuasse ocupando, a
  // bancada precisaria pedir para alguem apagar alguma coisa antes de por o
  // proximo tubo — e o desvio da armadilha #6 outra vez.
  const novo=novoRolo(x,n,'50');
  perto(novo.saldo,50,'o rolo novo entrou');
  igual(novo.nivel_id,n,'no mesmo buraco que o anterior deixou');
}},

{nome:'e quando o tubo MUDA DE LUGAR', executar({igual}){
  const x=montar();
  const de=x.buraco(), para=x.buraco();
  const r=novoRolo(x,de);
  rolo.mover(r.id,para,'Zeca');
  const outro=novoRolo(x,de);
  igual(outro.nivel_id,de,'o buraco de origem aceitou outro tubo');
  igual(rolo.porId(r.id).nivel_id,para,'e o primeiro esta no destino');
}},

{nome:'MOVER PARA BURACO CHEIO e recusado, dizendo quem esta la', executar({recusa,igual}){
  const x=montar();
  const a=novoRolo(x,x.buraco());
  const nB=x.buraco();
  const b=novoRolo(x,nB);
  const e=recusa(()=>rolo.mover(a.id,nB,'Zeca'),'endereco_ocupado');
  igual(e.mensagem.includes(b.codigo),true,'nomeia o rolo que ocupa o destino');
  igual(rolo.movimentos(a.id).filter(m=>m.motivo==='mudanca_endereco').length,0,
    'e nada foi gravado no historico do rolo que tentou');
}},

{nome:'o proprio rolo nao se acusa de ocupar o proprio lugar', executar({recusa}){
  const x=montar();
  const n=x.buraco();
  const r=novoRolo(x,n);
  // `mesmo_endereco`, nunca `endereco_ocupado`: quem repete o lugar onde o
  // rolo ja esta precisa ler que ele ja esta la — e nao que o buraco esta
  // cheio, por ele mesmo.
  recusa(()=>rolo.mover(r.id,n,'Zeca'),'mesmo_endereco');
}},

{nome:'O LIMITE E POR NIVEL, nao por andar', executar({igual}){
  const x=montar();
  const antes=rolo.listar().length;
  novoRolo(x,x.buraco()); novoRolo(x,x.buraco()); novoRolo(x,x.buraco());
  igual(rolo.listar().length,antes+3,'tres tubos no mesmo andar, em tres niveis');
  // Dentro de um andar ha quantos niveis a prateleira tiver. Guardar mais
  // material e criar nivel — que e o que a estante fisica faz.
}},

{nome:'ROLO SEM ENDERECO continua entrando, e dois convivem', executar({igual}){
  const x=montar();
  const a=rolo.entrada({tecido_id:x.t.id,largura:'2,00',metragem:'10'},'Lucas');
  const b=rolo.entrada({tecido_id:x.t.id,largura:'2,00',metragem:'10'},'Lucas');
  igual(a.nivel_id,null,'entrou sem endereco');
  igual(b.nivel_id,null,'e o segundo tambem');
  /* NAO e esta regra que fecha o buraco do rolo sem endereco — quem fecha e o
     "+ nivel" na entrada, que deixa a bancada criar o buraco com o tubo na
     mao. Recusar a entrada aqui empurraria o rolo para fora do sistema, que e
     exatamente o que a armadilha #6 descreve. */
}},

{nome:'A SOBRA NAO TEM ESTA TRAVA — varias cabem no mesmo lugar', executar({igual}){
  const x=montar();
  const n=x.buracoSobra();
  const codigos=etiqueta.pendentes().slice(0,2).map(e=>e.codigo);
  codigos.forEach(c=>sobra.criar({codigo:c,tecido_id:x.t.id,largura:'1,00',altura:'1,50',
    condicao:'integra',nivel_id:n},'Cortador'));
  igual(sobra.listar({}).filter(s=>s.nivel_id===n).length,2,'duas sobras no mesmo nivel');
  /* Sao duas prateleiras com dois usos. O rolo e um tubo que o cortador desce
     inteiro da estante — dois tubos no mesmo buraco viram "pegar aquele que
     parece". A sobra e retalho dobrado, e quem acha a peca certa la e a
     etiqueta, nao o endereco. */
}},

{nome:'a estante que a tela desenha: ocupado some quando o rolo acaba', executar({igual}){
  const x=montar();
  const n=x.buraco();
  const r=novoRolo(x,n);
  const ocupado=rolo.ocupacao().find(o=>Number(o.nivel_id)===Number(n));
  igual(!!ocupado,true,'o nivel aparece ocupado');
  igual(ocupado.codigo,r.codigo,'com o codigo do tubo que a tela escreve no botao');
  igual(ocupado.preco_m2,undefined,'e SEM preco — a tela nao precisa, e preco nao viaja a toa');
  rolo.encerrar(r.id,'Lucas');
  igual(rolo.ocupacao().some(o=>Number(o.nivel_id)===Number(n)),false,
    'encerrou o rolo, o buraco sumiu da lista de ocupados');
}},

{nome:'O QUE JA ESTAVA NA PRATELEIRA ANTES DA REGRA aparece no painel', executar({igual}){
  const x=montar();
  const n=x.buraco();
  const r=novoRolo(x,n);
  /* Passado nao se recusa: trava nova nao apaga o que ja estava la, e recusar
     de uma vez tudo que existe pararia a estante inteira por um estado que
     ninguem criou hoje. Entao o duplicado entra pelo lado do banco, como
     entrou de verdade — e sai no painel, onde e trabalho de arrumar em vez de
     recusa na cara de quem tem o tubo na mao. */
  db.prepare(`INSERT INTO rolo (codigo,tecido_id,largura,metragem_inicial,saldo,nivel_id,status)
              VALUES('R-999999',?,2.5,10,10,?,'fechado')`).run(x.t.id,n);
  const acusa=gerencial.problemas().filter(p=>/mais de um rolo/.test(p));
  igual(acusa.length,1,'o painel acusa o endereco com dois rolos');
  igual(acusa[0].includes(r.codigo)&&acusa[0].includes('R-999999'),true,
    'dizendo quais sao os dois: '+acusa[0]);
  igual(/ROLO · A-1-/.test(acusa[0]),true,'e o endereco sai pelo formato unico do endereco.js');

  db.prepare("DELETE FROM rolo WHERE codigo='R-999999'").run();
  igual(gerencial.problemas().filter(p=>/mais de um rolo/.test(p)).length,0,
    'arrumado um dos dois, o aviso some');
}}

];

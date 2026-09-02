// Fase 2 — a sobra, a etiqueta e o que trava cada uma.
const sobra=require('../dominio/sobra');
const etiqueta=require('../dominio/etiqueta');
const tecido=require('../dominio/tecido');
const endereco=require('../dominio/endereco');
const db=require('../nucleo/db');

// Cenario montado uma vez, reaproveitado pelos testes deste arquivo.
let cena=null;
function montar(){
  if(cena) return cena;
  const linha=tecido.criarLinha({nome:'Rolo Sobra'});
  const abertura=tecido.criarAbertura({nome:'5%',linha_id:linha.id});
  const cor=tecido.criarCor({nome:'Cinza'});
  const t=tecido.criarTecido({linha_id:linha.id,abertura_id:abertura.id,cor_id:cor.id});

  const hS=endereco.criarHaste({nome:'S1',armazem_chave:'SOBRA'});
  const aS=endereco.criarAndar({nome:'01',haste_id:hS.id});
  const nS=endereco.criarNivel({nome:'01',andar_id:aS.id});

  const hR=endereco.criarHaste({nome:'R1',armazem_chave:'ROLO'});
  const aR=endereco.criarAndar({nome:'01',haste_id:hR.id});
  const nR=endereco.criarNivel({nome:'01',andar_id:aR.id});

  cena={tecido:t, nivelSobra:nS.id, nivelRolo:nR.id};
  return cena;
}

module.exports=[

{nome:'o lote de etiquetas sai sequencial e vira pendencia', executar({igual}){
  const lote=etiqueta.imprimirLote(5,'Diretor');
  igual(lote.codigos[0],'S-000001','primeira etiqueta');
  igual(lote.codigos[4],'S-000005','ultima etiqueta');
  igual(etiqueta.pendentes().length,5,'todas impressas estao pendentes');
  // O lote seguinte continua de onde o anterior parou.
  const dois=etiqueta.imprimirLote(3,'Diretor');
  igual(dois.codigos[0],'S-000006','o segundo lote continua a sequencia');
}},

{nome:'a sobra nasce ao bipar, e some da pendencia', executar({igual,perto}){
  const c=montar();
  const antes=etiqueta.pendentes().length;
  const s=sobra.criar({codigo:'S-000001',tecido_id:c.tecido.id,largura:'1,90',altura:'2,60',
    condicao:'integra',nivel_id:c.nivelSobra},'Cortador');
  igual(s.codigo,'S-000001','codigo gravado');
  perto(s.area,1.90*2.60,'area calculada pelo banco');
  igual(s.status,'disponivel','estado inicial');
  igual(etiqueta.pendentes().length,antes-1,'saiu da lista de pendencia');
}},

{nome:'a mesma etiqueta nao cola em duas sobras', executar({recusa,igual}){
  const c=montar();
  const antes=sobra.listar({status:'disponivel'}).length;
  recusa(()=>sobra.criar({codigo:'S-000001',tecido_id:c.tecido.id,largura:1,altura:1,
    condicao:'integra',nivel_id:c.nivelSobra},'Cortador'),'etiqueta_ja_usada');
  // A transacao inteira voltou atras: nenhuma sobra meio-gravada ficou.
  igual(sobra.listar({status:'disponivel'}).length,antes,'nada foi gravado na recusa');
}},

{nome:'etiqueta que o sistema nunca imprimiu e recusada', executar({recusa}){
  const c=montar();
  recusa(()=>sobra.criar({codigo:'S-999999',tecido_id:c.tecido.id,largura:1,altura:1,
    condicao:'integra',nivel_id:c.nivelSobra},'Cortador'),'etiqueta_desconhecida');
}},

{nome:'sobra nao endereca na estante dos rolos', executar({recusa}){
  const c=montar();
  recusa(()=>sobra.criar({codigo:'S-000002',tecido_id:c.tecido.id,largura:1,altura:1,
    condicao:'integra',nivel_id:c.nivelRolo},'Cortador'),'armazem_errado');
}},

{nome:'190 no campo de METROS nao entra calado', executar({recusa}){
  const c=montar();
  // O erro que passaria despercebido: centimetros num campo que fala metros.
  recusa(()=>sobra.criar({codigo:'S-000002',tecido_id:c.tecido.id,largura:190,altura:2.6,
    condicao:'integra',nivel_id:c.nivelSobra},'Cortador'),'medida_absurda');
  recusa(()=>sobra.criar({codigo:'S-000002',tecido_id:c.tecido.id,largura:0,altura:2.6,
    condicao:'integra',nivel_id:c.nivelSobra},'Cortador'),'medida_invalida');
}},

{nome:'o codigo bipado chega sujo e e limpo antes de gravar', executar({igual}){
  const c=montar();
  // Leitor manda Tab, espaco e quebra de linha no meio do codigo.
  const s=sobra.criar({codigo:' s-000002\t\n',tecido_id:c.tecido.id,largura:'0,80',altura:'1,20',
    condicao:'mancha',nivel_id:c.nivelSobra},'Cortador');
  igual(s.codigo,'S-000002','codigo limpo e em maiuscula');
}},

{nome:'descarte exige motivo e deixa a perda medida no refugo', executar({recusa,igual,perto}){
  const c=montar();
  const s=sobra.criar({codigo:'S-000003',tecido_id:c.tecido.id,largura:'1,00',altura:'1,00',
    condicao:'furo',nivel_id:c.nivelSobra},'Cortador');
  recusa(()=>sobra.descartar(s.id,'  ','Diretor'),'motivo_obrigatorio');

  const antes=db.prepare("SELECT COUNT(*) c FROM refugo WHERE motivo='descarte'").get().c;
  const d=sobra.descartar(s.id,'Molhou no galpao','Diretor');
  igual(d.status,'descartada','estado apos o descarte');
  const depois=db.prepare("SELECT COUNT(*) c FROM refugo WHERE motivo='descarte'").get().c;
  igual(depois,antes+1,'a perda virou linha de refugo');
  perto(db.prepare("SELECT area a FROM refugo ORDER BY id DESC LIMIT 1").get().a,1,'area do refugo');

  // Ja baixada, nao se descarta de novo.
  recusa(()=>sobra.descartar(s.id,'de novo','Diretor'),'sobra_indisponivel');
}},

{nome:'sobra descartada sai das candidatas do plano', executar({igual}){
  const c=montar();
  const codigos=sobra.candidatas(c.tecido.id).map(s=>s.codigo);
  igual(codigos.includes('S-000003'),false,'a descartada nao e candidata');
  igual(codigos.includes('S-000001'),true,'a disponivel e candidata');
}},

{nome:'as candidatas vem com a integra primeiro e a menor area antes', executar({igual}){
  const c=montar();
  // S-000001 e 1,90x2,60 integra (area 4,94); S-000002 e 0,80x1,20 com mancha
  // (area 0,96). Mesmo sendo MENOR, a manchada vem depois: defeito parcial
  // entra no plano, mas por ultimo.
  const lista=sobra.candidatas(c.tecido.id);
  igual(lista[0].codigo,'S-000001','integra primeiro, mesmo com area maior');
  igual(lista[1].codigo,'S-000002','manchada por ultimo');
}},

{nome:'condicao marcada como nao aproveitavel some das candidatas', executar({igual}){
  const c=montar();
  const motivo=require('../dominio/motivo');
  motivo.atualizarCondicao('mancha',{aproveitavel:0});
  igual(sobra.candidatas(c.tecido.id).some(s=>s.codigo==='S-000002'),false,'saiu das candidatas');
  motivo.atualizarCondicao('mancha',{aproveitavel:1});
  igual(sobra.candidatas(c.tecido.id).some(s=>s.codigo==='S-000002'),true,'voltou');
}},

{nome:'lote de etiquetas com quantidade invalida e recusado', executar({recusa}){
  recusa(()=>etiqueta.imprimirLote(0,'Diretor'),'quantidade_invalida');
  recusa(()=>etiqueta.imprimirLote('muitas','Diretor'),'quantidade_invalida');
  recusa(()=>etiqueta.imprimirLote(5000,'Diretor'),'lote_grande');
}}

];

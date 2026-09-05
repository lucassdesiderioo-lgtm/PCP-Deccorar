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
  igual(lote.codigos.length,5,'cinco codigos');
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
  // O endereco vai escrito: a sobra existe para ser achada, e a lista tem
  // que dizer ONDE, no mesmo formato de todo o modulo.
  igual(s.endereco,'SOBRA · S1-01-01','endereco descrito na resposta');
  igual(sobra.listar({status:'disponivel'})[0].endereco,'SOBRA · S1-01-01','e na lista tambem');
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

/* ── A CORRECAO — a sobra lancada errada se conserta, com rastro ────────── */

{nome:'a sobra lancada com o tecido errado se corrige, e a correcao deixa rastro', executar({igual,perto}){
  const c=montar();
  // O caso real: o mutirao lembra o tecido do retalho anterior, e o primeiro
  // da prateleira nova entra com a cor errada.
  const outraCor=tecido.criarCor({nome:'Bege Correcao'});
  const certo=tecido.criarTecido({linha_id:c.tecido.linha_id,abertura_id:c.tecido.abertura_id,cor_id:outraCor.id});
  cena.tecidoCerto=certo;

  const s=sobra.criar({codigo:'S-000004',tecido_id:c.tecido.id,largura:'1,20',altura:'2,00',
    condicao:'integra',nivel_id:c.nivelSobra},'Cortador');
  igual(s.correcoes,0,'nasce sem correcao');

  const r=sobra.corrigir(s.id,{tecido_id:certo.id},'Cortador');
  igual(r.tecido_id,certo.id,'o tecido mudou');
  igual(r.cor_nome,'Bege Correcao','e a tela le o nome novo');
  perto(r.area,2.4,'a medida e a area ficaram como estavam');
  igual(r.mudancas.length,1,'a resposta diz o que mudou nesta chamada');
  igual(r.mudancas[0].campo,'tecido','e foi o tecido');

  const h=sobra.correcoes(s.id);
  igual(h.length,1,'uma linha de historico');
  igual(h[0].campo,'tecido','do tecido');
  igual(h[0].de.includes('Cinza'),true,'de: como se le na tela, nao o id');
  igual(h[0].para.includes('Bege Correcao'),true,'para: idem');
  igual(h[0].usuario_nome,'Cortador','quem corrigiu');
  igual(sobra.porId(s.id).correcoes,1,'e a lista sabe que ela foi corrigida');

  // A sobra saiu das candidatas do tecido errado e entrou nas do certo.
  igual(sobra.candidatas(c.tecido.id).some(x=>x.id===s.id),false,'nao e mais candidata do tecido errado');
  igual(sobra.candidatas(certo.id).some(x=>x.id===s.id),true,'e candidata do tecido certo');
}},

{nome:'corrigir a medida refaz a area, e cada campo e uma linha do historico', executar({igual,perto}){
  const s=sobra.porCodigo('S-000004');
  const r=sobra.corrigir(s.id,{largura:'1,50',altura:'2,00',condicao:'mancha'},'Cortador');
  perto(r.largura,1.5,'largura nova');
  perto(r.altura,2.0,'altura igual, nao conta como mudanca');
  perto(r.area,3.0,'area refeita pelo banco');
  igual(r.condicao,'mancha','condicao nova');
  igual(r.mudancas.length,2,'duas mudancas: largura e condicao — a altura veio igual');
  igual(sobra.correcoes(s.id).length,3,'tres linhas no total: tecido, largura, condicao');
}},

{nome:'salvar sem mudar nada nao grava historico', executar({igual}){
  const s=sobra.porCodigo('S-000004');
  const antes=sobra.correcoes(s.id).length;
  const r=sobra.corrigir(s.id,{tecido_id:s.tecido_id,largura:'1,50',altura:'2,00',condicao:'mancha',nivel_id:s.nivel_id},'Cortador');
  igual(r.mudancas.length,0,'nada mudou');
  igual(sobra.correcoes(s.id).length,antes,'e nao entrou linha nenhuma');
}},

{nome:'a correcao passa pelas mesmas guardas do lancamento', executar({recusa,igual}){
  const c=montar();
  const s=sobra.porCodigo('S-000004');
  recusa(()=>sobra.corrigir(s.id,{largura:190},'Cortador'),'medida_absurda');
  recusa(()=>sobra.corrigir(s.id,{largura:0},'Cortador'),'medida_invalida');
  recusa(()=>sobra.corrigir(s.id,{tecido_id:999999},'Cortador'),'tecido_inexistente');
  recusa(()=>sobra.corrigir(s.id,{condicao:'inventada'},'Cortador'),'condicao_invalida');
  recusa(()=>sobra.corrigir(s.id,{nivel_id:c.nivelRolo},'Cortador'),'armazem_errado');
  recusa(()=>sobra.corrigir(999999,{largura:1},'Cortador'),'sobra_inexistente');
  // A recusa nao deixa meia correcao: a sobra continua como estava.
  const depois=sobra.porId(s.id);
  igual(depois.largura,1.5,'largura intacta');
  igual(depois.tecido_id,s.tecido_id,'tecido intacto');
}},

{nome:'so a sobra disponivel se corrige — a descartada ja virou refugo', executar({recusa}){
  const c=montar();
  const s=sobra.criar({codigo:'S-000005',tecido_id:c.tecido.id,largura:'1,00',altura:'1,00',
    condicao:'integra',nivel_id:c.nivelSobra},'Cortador');
  sobra.descartar(s.id,'Rasgou','Diretor');
  recusa(()=>sobra.corrigir(s.id,{largura:'2,00'},'Cortador'),'sobra_indisponivel');
}},

{nome:'corrigir e descartar sao da chefia — o cortador lanca e APONTA', executar({igual}){
  const {pode}=require('../nucleo/permissoes');
  igual(pode({papel:'cortador'},'sobra.criar'),true,'o cortador cataloga');
  igual(pode({papel:'cortador'},'sobra.propor'),true,'e aponta o erro');
  igual(pode({papel:'cortador'},'sobra.corrigir'),false,'mas nao corrige: a chefia aceita a correcao');
  igual(pode({papel:'cortador'},'sobra.descartar'),false,'e nao descarta');
  igual(pode({papel:'diretor'},'sobra.corrigir'),true,'a chefia corrige');
}},

/* ── O APONTAMENTO — a bancada aponta, a chefia aceita ou recusa ─────────── */

{nome:'a bancada aponta o tecido errado: nada muda na sobra ate a chefia aceitar', executar({igual,perto}){
  const c=montar();
  const s=sobra.criar({codigo:'S-000006',tecido_id:c.tecido.id,largura:'1,00',altura:'2,00',
    condicao:'integra',nivel_id:c.nivelSobra},'Ana');
  const p=sobra.propor(s.id,{tecido_id:cena.tecidoCerto.id,largura:'1,00',condicao:'furo',motivo:'veio bege, e cinza'},'Ana');
  igual(p.status,'pendente','espera a chefia');
  igual(p.criado_por,'Ana','quem apontou');
  igual(p.motivo,'veio bege, e cinza','o que ela viu');
  igual(p.itens.length,2,'so o que muda vira item: tecido e condicao (a largura veio igual)');
  igual(p.itens[0].campo,'tecido','tecido');
  igual(p.itens[0].de.includes('Cinza')&&p.itens[0].para.includes('Bege Correcao'),true,'de -> para legivel');
  igual(p.largura,null,'campo igual ao atual nao e guardado na proposta');

  const agora=sobra.porId(s.id);
  igual(agora.tecido_id,c.tecido.id,'a sobra NAO mudou');
  igual(agora.propostas_pendentes,1,'mas a lista sabe que ha apontamento esperando');
  igual(sobra.correcoes(s.id).length,0,'e nao ha correcao ainda');
  igual(sobra.propostasPendentes(),1,'uma pendente no total');
  cena.proposta=p;
}},

{nome:'apontar sem mudar nada e recusado, e a sobra so tem UM apontamento pendente', executar({recusa}){
  const c=montar();
  const s=sobra.porCodigo('S-000006');
  recusa(()=>sobra.propor(s.id,{tecido_id:s.tecido_id,largura:'1,00'},'Ana'),'nada_mudou');
  recusa(()=>sobra.propor(s.id,{altura:'3,00'},'Bia'),'proposta_pendente');
  // As guardas do lancamento valem no apontamento tambem.
  const s2=sobra.porCodigo('S-000004');
  recusa(()=>sobra.propor(s2.id,{largura:190},'Ana'),'medida_absurda');
  recusa(()=>sobra.propor(s2.id,{nivel_id:c.nivelRolo},'Ana'),'armazem_errado');
}},

{nome:'recusar exige motivo e deixa a sobra como estava', executar({recusa,igual}){
  const s=sobra.porCodigo('S-000006');
  const p2=sobra.propor(sobra.porCodigo('S-000004').id,{altura:'2,50'},'Ana');
  recusa(()=>sobra.recusar(p2.id,'  ','Diretor'),'motivo_obrigatorio');
  const r=sobra.recusar(p2.id,'Medi aqui: e 2,00 mesmo','Diretor');
  igual(r.status,'recusada','recusada');
  igual(r.decidido_por,'Diretor','por quem');
  igual(r.decisao_motivo,'Medi aqui: e 2,00 mesmo','e a bancada le por que');
  igual(sobra.porCodigo('S-000004').altura,2,'a sobra ficou como estava');
  recusa(()=>sobra.aceitar(p2.id,'Diretor'),'proposta_decidida');
  igual(sobra.porId(s.id).propostas_pendentes,1,'a da S-000006 continua pendente');
}},

{nome:'aceitar vira correcao pelo mesmo caminho, com o rastro apontando para quem apontou', executar({igual}){
  const c=montar();
  const r=sobra.aceitar(cena.proposta.id,'Diretor');
  igual(r.proposta.status,'aceita','aceita');
  igual(r.proposta.decidido_por,'Diretor','por quem');
  igual(r.mudancas.length,2,'duas mudancas aplicadas');
  igual(r.sobra.tecido_id,cena.tecidoCerto.id,'a sobra agora e do tecido certo');
  igual(r.sobra.condicao,'furo','e com a condicao apontada');
  igual(r.sobra.propostas_pendentes,0,'nada mais pendente nela');

  const h=sobra.correcoes(r.sobra.id);
  igual(h.length,2,'duas linhas de correcao');
  igual(h[0].usuario_nome,'Diretor','quem aceitou');
  igual(h[0].proposto_por,'Ana','quem apontou');
  igual(h[0].proposta_id,cena.proposta.id,'ligada ao apontamento');
  igual(sobra.propostas({sobra_id:r.sobra.id}).length,1,'o apontamento fica na historia da sobra');
  igual(sobra.propostasPendentes(),0,'fila da chefia vazia');
}},

{nome:'apontamento de sobra que ja foi descartada nao se aceita', executar({recusa}){
  const c=montar();
  const s=sobra.criar({codigo:'S-000007',tecido_id:c.tecido.id,largura:'1,00',altura:'1,00',
    condicao:'integra',nivel_id:c.nivelSobra},'Ana');
  const p=sobra.propor(s.id,{condicao:'mancha'},'Ana');
  sobra.descartar(s.id,'Rasgou','Diretor');
  recusa(()=>sobra.aceitar(p.id,'Diretor'),'sobra_indisponivel');
  recusa(()=>sobra.propor(s.id,{condicao:'furo'},'Ana'),'sobra_indisponivel');
}},

{nome:'lote de etiquetas com quantidade invalida e recusado', executar({recusa}){
  recusa(()=>etiqueta.imprimirLote(0,'Diretor'),'quantidade_invalida');
  recusa(()=>etiqueta.imprimirLote('muitas','Diretor'),'quantidade_invalida');
  recusa(()=>etiqueta.imprimirLote(5000,'Diretor'),'lote_grande');
}}

];

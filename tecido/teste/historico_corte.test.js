// O HISTORICO DE CORTES (spec CORTE-EM-ETAPAS, fase 1).
//
// So leitura. A pergunta que ele responde e a do corte de 01/10/2026: "qual
// sobra o sistema deu como usada?" — e o detalhe tem que dizer isso com o
// status de HOJE da sobra, nao com o que o plano previu.
const plano=require('../dominio/plano');
const corte=require('../dominio/corte');
const historico=require('../dominio/corte_historico');
const sobra=require('../dominio/sobra');
const rolo=require('../dominio/rolo');
const etiqueta=require('../dominio/etiqueta');
const tecido=require('../dominio/tecido');
const endereco=require('../dominio/endereco');
const db=require('../nucleo/db');

let base=null, n=0;
function cena(){
  if(!base){
    const linha=tecido.criarLinha({nome:'Rolo'});
    const abertura=tecido.criarAbertura({nome:'Screen 1%',linha_id:linha.id});
    const hR=endereco.criarHaste({nome:'A',armazem_chave:'ROLO'});
    const aR=endereco.criarAndar({nome:'01',haste_id:hR.id});
    const hS=endereco.criarHaste({nome:'C',armazem_chave:'SOBRA'});
    const aS=endereco.criarAndar({nome:'01',haste_id:hS.id});
    const nS=endereco.criarNivel({nome:'01',andar_id:aS.id});
    etiqueta.imprimirLote(80,'teste');
    let seq=0;
    base={linha,abertura,nivelSobra:nS.id,
      buraco:()=>endereco.criarNivel({nome:String(++seq).padStart(2,'0'),andar_id:aR.id}).id};
  }
  const cor=tecido.criarCor({nome:'Cor '+(++n)});
  const t=tecido.criarTecido({linha_id:base.linha.id,abertura_id:base.abertura.id,cor_id:cor.id});
  return {...base,t};
}

// O corte inteiro, como a bancada faz: confirmar, cortar, Corte feito e
// guardar cada sobra que nasceu, com a medida calculada.
function confirmar(x,pecas,quem,extra){
  const p=plano.calcular({tecido_id:x.t.id,pecas,...(extra||{})});
  const r=corte.confirmar({tecido_id:x.t.id,pecas,assinatura:p.assinatura,...(extra||{})},quem||'teste');
  corte.cortar(r.plano_id,quem||'teste'); corte.feito(r.plano_id,quem||'teste');
  corte.doCorte(r.plano_id).forEach(g=>corte.guardar(g.id,{largura:g.largura,altura:g.altura,
    codigo:etiqueta.pendentes()[0].codigo,nivel_id:x.nivelSobra},quem||'teste'));
  return {...r, proposta:p};
}

// Um corte do rolo que faz nascer uma sobra larga, e um segundo corte que USA
// essa sobra — o caso que a busca por sobra tem que achar dos dois lados.
/* Numero de pedido UNICO por cena. O plano olha para tras por pedido (o
   pedido ja cortado noutro dia continua no mesmo rolo), e um P100 repetido
   entre os casos faria um caso herdar o rolo do anterior. */
let k=0;
function doisCortes(){
  const x=cena(); k++;
  const r=rolo.entrada({tecido_id:x.t.id,largura:'3,00',metragem:'50',nivel_id:x.buraco()},'teste');
  const a=confirmar(x,[{pedido:'P100'+'x'+k,tipo:'cliente_final',largura:'1,00',altura:'2,00'}],'Ana');
  const nascida=db.prepare("SELECT * FROM sobra WHERE origem_rolo_id=? ORDER BY id").all(r.id)
    .find(s=>s.largura>=1.9);
  const b=confirmar(x,[{pedido:'P200-'+k,tipo:'cliente_final',largura:'1,50',altura:'1,80'},
                       {pedido:'P300x'+k,tipo:'cliente_final',largura:'3,50',altura:'1,00'}],'Bruno');
  return {x,r,a,b,nascida};
}

module.exports=[

{nome:'o corte confirmado aparece na lista, com quem, pedidos e sobras', executar({igual}){
  const {a,b,nascida}=doisCortes();
  const l=historico.listar({});
  const ca=l.cortes.find(c=>c.id===a.plano_id), cb=l.cortes.find(c=>c.id===b.plano_id);
  igual(!!ca&&!!cb,true,'os dois cortes estao na lista');
  igual(ca.usuario_nome,'Ana','quem cortou');
  igual(ca.pedidos,'P100x'+k,'os pedidos do corte');
  igual(cb.sobras_usadas,nascida.codigo,'o corte B diz que usou a sobra que nasceu do A');
  igual(ca.sobras_nascidas>=1,true,'o corte A diz quantas sobras nasceram');
  igual(l.operadores.includes('Ana')&&l.operadores.includes('Bruno'),true,'a lista de operadores do filtro');
}},

{nome:'o mais novo vem primeiro', executar({igual}){
  const {a,b}=doisCortes();
  const ids=historico.listar({}).cortes.map(c=>c.id);
  igual(ids.indexOf(b.plano_id)<ids.indexOf(a.plano_id),true,'B antes de A');
}},

{nome:'filtro por pedido acha pelo comeco do numero, sem diferenca de maiuscula', executar({igual}){
  const {a,b}=doisCortes();
  const ids=historico.listar({pedido:'p200'}).cortes.map(c=>c.id);
  igual(ids.includes(b.plano_id),true,'P200-n aparece buscando p200');
  igual(ids.includes(a.plano_id),false,'P100 nao aparece');
}},

{nome:'filtro por operador e por dia', executar({igual}){
  const {a,b}=doisCortes();
  const so=historico.listar({operador:'ana'}).cortes.map(c=>c.id);
  igual(so.includes(a.plano_id)&&!so.includes(b.plano_id),true,'so os cortes da Ana');
  const hoje=db.prepare("SELECT date('now','localtime') d").get().d;
  igual(historico.listar({dia:hoje}).cortes.some(c=>c.id===a.plano_id),true,'o dia de hoje acha');
  igual(historico.listar({dia:'2001-01-01'}).cortes.length,0,'outro dia nao acha nada');
}},

{nome:'dia fora do formato e recusado, e nao vira "nada encontrado"', executar({recusa}){
  recusa(()=>historico.listar({dia:'01/10/2026'}),'dia_invalido');
}},

{nome:'A BUSCA POR SOBRA ACHA OS DOIS CORTES: o que a usou e o de onde ela nasceu', executar({igual}){
  const {a,b,nascida}=doisCortes();
  const l=historico.listar({sobra:nascida.codigo.toLowerCase()+' '});
  const ids=l.cortes.map(c=>c.id).sort();
  igual(JSON.stringify(ids),JSON.stringify([a.plano_id,b.plano_id].sort()),'os dois cortes');
  igual(l.sobra.codigo,nascida.codigo,'a sobra encontrada');
  igual(l.sobra.nasceu_em,a.plano_id,'nasceu do corte A');
  igual(JSON.stringify(l.sobra.usada_em),JSON.stringify([b.plano_id]),'foi usada no corte B');
  igual(l.sobra.status,'usada','o status de hoje');
}},

{nome:'sobra que nao existe e recusada dizendo o codigo', executar({recusa,igual}){
  doisCortes();
  const e=recusa(()=>historico.listar({sobra:'S-999999'}),'sobra_inexistente');
  igual(/S-999999/.test(e.mensagem),true,'a frase diz qual');
}},

{nome:'O DETALHE DIZ QUAL SOBRA O SISTEMA MARCOU COMO USADA, com o status de hoje', executar({igual}){
  const {b,nascida}=doisCortes();
  const d=historico.detalhe(b.plano_id);
  const fs=d.fontes.find(f=>f.fonte==='sobra');
  igual(fs.codigo,nascida.codigo,'a fonte sobra do corte');
  igual(fs.status_hoje,'usada','o que o sistema diz hoje');
  igual(fs.marcada_usada_por_este,true,'e foi ESTE corte que a deu como usada');
  igual(!!fs.endereco,true,'o endereco onde ela estava');
}},

{nome:'o detalhe das linhas: medida, pedido, fonte, e a peca que nao coube com o motivo', executar({igual}){
  const {b,nascida}=doisCortes();
  const d=historico.detalhe(b.plano_id);
  const l1=d.linhas.find(l=>/^P200-/.test(l.pedido||''));
  igual(l1.fonte,'sobra','a peca caiu na sobra');
  igual(l1.fonte_codigo,nascida.codigo,'qual sobra');
  const larga=d.linhas.find(l=>/^P300x/.test(l.pedido||''));
  igual(larga.fonte,null,'a peca larga demais nao tem fonte');
  igual(/largura/.test(larga.nao_alocada_motivo||''),true,'e vem com o motivo: '+larga.nao_alocada_motivo);
}},

{nome:'o detalhe do rolo: os metros que ESTE corte baixou, lidos do movimento', executar({igual,perto}){
  const {a,r}=doisCortes();
  const d=historico.detalhe(a.plano_id);
  const fr=d.fontes.find(f=>f.fonte==='rolo');
  igual(fr.codigo,r.codigo,'o rolo');
  perto(fr.metros_baixados,2.00,'baixou 2,00 m');
  perto(fr.metros_baixados,a.proposta.consumo_linear,'o mesmo que o plano disse');
  igual(typeof fr.saldo_hoje,'number','e o saldo de hoje do rolo');
}},

{nome:'o detalhe das sobras que nasceram, e do refugo', executar({igual}){
  const {a,b,nascida}=doisCortes();
  const da=historico.detalhe(a.plano_id);
  igual(da.sobras_nascidas.some(s=>s.codigo===nascida.codigo),true,'a sobra nascida aparece no corte A');
  igual(da.sobras_nascidas.find(s=>s.codigo===nascida.codigo).status_hoje,'usada','com o status de hoje (usada no B)');
  const db_=historico.detalhe(b.plano_id);
  const refugo=db.prepare('SELECT COUNT(*) n FROM refugo WHERE plano_id=?').get(b.plano_id).n;
  igual(db_.refugo.length,refugo,'o refugo gravado');
}},

{nome:'O RESTO DE PE DE UMA SOBRA tambem e sobra nascida, mesmo sem faixa que o ligue', executar({igual}){
  /* O Confirmar grava o codigo da sobra nascida na faixa — mas o resto de pe
     embaixo da ultima faixa de uma sobra nao tem faixa. Sem a segunda metade
     da regua, essa sobra nasceria de corte nenhum. */
  const x=cena(); k++;
  const livre=etiqueta.pendentes()[0].codigo;
  const mae=sobra.criar({codigo:livre,tecido_id:x.t.id,largura:2,altura:3,condicao:'integra',nivel_id:x.nivelSobra},'Carla');
  const r=confirmar(x,[{pedido:'PE'+k,tipo:'cliente_final',largura:'1,50',altura:'1,00'}],'Carla');
  const ligadas=db.prepare('SELECT sobra_gerada_codigo c FROM plano_faixa WHERE plano_id=?').all(r.plano_id).map(f=>f.c);
  const filha=db.prepare('SELECT * FROM sobra WHERE origem_sobra_id=? AND altura>1.9').get(mae.id);
  igual(!!filha,true,'o resto de pe virou sobra');
  igual(ligadas.includes(filha.codigo),false,'e a faixa NAO guardou o codigo dela');
  igual(historico.detalhe(r.plano_id).sobras_nascidas.some(s=>s.codigo===filha.codigo),true,'mesmo assim ela aparece como nascida do corte');
  igual(historico.listar({sobra:filha.codigo}).sobra.nasceu_em,r.plano_id,'e a busca por ela acha o corte de onde nasceu');
}},

{nome:'o detalhe mostra a recusa feita antes de confirmar', executar({igual}){
  const x=cena();
  rolo.entrada({tecido_id:x.t.id,largura:'3,00',metragem:'50',nivel_id:x.buraco()},'teste');
  const livre=etiqueta.pendentes()[0].codigo;
  const s=sobra.criar({codigo:livre,tecido_id:x.t.id,largura:2,altura:2,condicao:'integra',nivel_id:x.nivelSobra},'teste');
  const motivo=db.prepare('SELECT id FROM motivo_recusa ORDER BY id LIMIT 1').get().id;
  plano.recusar({sobra_id:s.id,motivo_id:motivo},'teste');
  const r=confirmar(x,[{pedido:'P9',tipo:'cliente_final',largura:'1,00',altura:'1,00'}],'teste',{recusadas:[s.id]});
  const d=historico.detalhe(r.plano_id);
  igual(d.recusas.length,1,'a recusa');
  igual(d.recusas[0].sobra_codigo,s.codigo,'de qual sobra');
}},

{nome:'corte que nao existe e recusado', executar({recusa}){
  recusa(()=>historico.detalhe(999999),'corte_inexistente');
}},

{nome:'a lista nao traz preco nenhum — so leitura de corte', executar({igual}){
  const {b}=doisCortes();
  const txt=JSON.stringify(historico.listar({}))+JSON.stringify(historico.detalhe(b.plano_id));
  igual(/preco|valor/i.test(txt),false,'nenhum campo de dinheiro viaja');
}}

];

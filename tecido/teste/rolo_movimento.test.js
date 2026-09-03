// MOVER O ROLO DE LUGAR, e a etiqueta que vai colada no tubo.
//
// O tubo sai da estante para cortar e volta — na maioria das vezes para o
// mesmo buraco. Quando volta em OUTRA haste, o endereco do sistema passa a
// apontar para um lugar vazio, e o proximo que procurar aquele rolo nao acha.
// Ele nao conclui "alguem moveu": conclui "o sistema erra".
const rolo=require('../dominio/rolo');
const tecido=require('../dominio/tecido');
const endereco=require('../dominio/endereco');
const pdf=require('../dominio/etiqueta_pdf');
const {PDFDocument}=require('pdf-lib');

let cena=null;
function montar(){
  if(cena) return cena;
  const l=tecido.criarLinha({nome:'Rolo'});
  const a=tecido.criarAbertura({nome:'Napoles BK',linha_id:l.id});
  const c=tecido.criarCor({nome:'Bege'});
  const t=tecido.criarTecido({linha_id:l.id,abertura_id:a.id,cor_id:c.id});
  const h=endereco.criarHaste({nome:'A',armazem_chave:'ROLO'});
  const an=endereco.criarAndar({nome:'1',haste_id:h.id});
  const n1=endereco.criarNivel({nome:'1',andar_id:an.id});
  const n2=endereco.criarNivel({nome:'2',andar_id:an.id});
  const hS=endereco.criarHaste({nome:'C',armazem_chave:'SOBRA'});
  const anS=endereco.criarAndar({nome:'1',haste_id:hS.id});
  const nS=endereco.criarNivel({nome:'1',andar_id:anS.id});
  cena={t,n1:n1.id,n2:n2.id,nSobra:nS.id};
  return cena;
}
const novoRolo=(x,nivel)=>rolo.entrada(
  {tecido_id:x.t.id,largura:'2,50',metragem:'48,5',nivel_id:nivel},'Lucas');

module.exports=[

{nome:'MOVER GRAVA QUEM MOVEU, de onde e para onde', executar({igual}){
  const x=montar();
  const r=novoRolo(x,x.n1);
  rolo.mover(r.id,x.n2,'Zeca');

  igual(endereco.descrever(rolo.porId(r.id).nivel_id),'ROLO · A-1-2','mudou de lugar');
  const m=rolo.movimentos(r.id).find(m=>m.motivo==='mudanca_endereco');
  igual(!!m,true,'ficou no historico do rolo');
  igual(m.usuario_nome,'Zeca','com o nome de quem moveu');
  igual(m.observacao,'de ROLO · A-1-1 para ROLO · A-1-2','e o caminho inteiro');
  igual(m.delta,0,'o saldo NAO mudou — mudou o lugar');
  /* Delta zero na mesma tabela do consumo, de proposito: o historico do rolo
     e um so. Quem investiga "cade este rolo" le a mesma lista de quem
     investiga "quanto foi consumido". */
}},

{nome:'o saldo nao e tocado por uma mudanca de lugar', executar({perto}){
  const x=montar();
  const r=novoRolo(x,x.n1);
  rolo.mover(r.id,x.n2,'Zeca');
  perto(rolo.porId(r.id).saldo,48.5,'saldo intacto');
}},

{nome:'mover para o MESMO lugar nao vira linha de historico', executar({recusa,igual}){
  const x=montar();
  const r=novoRolo(x,x.n1);
  recusa(()=>rolo.mover(r.id,x.n1,'Zeca'),'mesmo_endereco');
  igual(rolo.movimentos(r.id).filter(m=>m.motivo==='mudanca_endereco').length,0,
    'nenhuma linha gravada');
  // Historico cheio de linha que nao conta nada e historico que ninguem le —
  // e ai a linha que importa passa batida.
}},

{nome:'rolo NAO vai para a estante das sobras', executar({recusa}){
  const x=montar();
  const r=novoRolo(x,x.n1);
  recusa(()=>rolo.mover(r.id,x.nSobra,'Zeca'),'armazem_errado');
  // A mesma trava da entrada. Sem ela o rolo sumiria da tela de rolos e
  // apareceria como endereco de sobra, que nenhuma tela sabe ler.
}},

{nome:'rolo ENCERRADO nao volta para a estante', executar({recusa}){
  const x=montar();
  const r=novoRolo(x,x.n1);
  rolo.encerrar(r.id,'Lucas');
  recusa(()=>rolo.mover(r.id,x.n2,'Zeca'),'rolo_encerrado');
  // Rolo encerrado e tubo vazio. Endereca-lo faria a estante do sistema ter
  // um rolo que fisicamente nao existe mais.
}},

// ── A ETIQUETA DO TUBO ───────────────────────────────────────────────────

{nome:'a etiqueta do rolo tem medida PROPRIA, nao a da sobra', async executar({igual,perto}){
  const m=pdf.medidasRolo();
  perto(m.largura,100,'100 mm');
  perto(m.altura,150,'150 mm');
  igual(m.fonte,54,'codigo em 54 pt — mais que o dobro da sobra');
  igual(m.fonte>pdf.medidas().fonte,true,'e maior que o da sobra de proposito');
  /* Sao usos diferentes: a sobra e lida de perto, na mao; o rolo e lido de
     longe, na estante. Chegar perto de cada tubo para ler o numero e o que
     faz o operador desistir e "pegar aquele que parece". */

  const doc=await PDFDocument.load(await pdf.gerarRolo(
    [{codigo:'R-000012',largura:2.5,saldo:48.5,tecido:'Rolo · Napoles BK · Bege',impresso_em:'03/09/2026'}]));
  igual(doc.getPageCount(),1,'uma pagina');
  const s=doc.getPage(0).getSize();
  perto(s.width/72*25.4,100,'largura da pagina');
  perto(s.height/72*25.4,150,'altura da pagina');
}},

{nome:'medida que nao fecha e RECUSADA, como a da sobra', async executar({igual}){
  const config=require('../nucleo/config');
  config.gravar('etqRoloFonte',300,'teste');
  igual(pdf.conferirRolo(pdf.medidasRolo()).cabe,false,'300 pt nao cabe em 150 mm');
  let motivo=null;
  try{ await pdf.gerarRolo([{codigo:'R-000012',largura:2.5}]); }catch(e){ motivo=e.motivo; }
  igual(motivo,'etiqueta_nao_cabe','e o PDF nao sai');
  config.gravar('etqRoloFonte',54,'teste');
}},

{nome:'as barras das duas etiquetas saem do MESMO desenho', executar({igual}){
  const barras=require('../public/barras.js');
  igual(barras.modulos('R-000012').length,123,'o codigo do rolo tem o desenho conhecido');
  // Sobra e rolo desenham pelo mesmo desenharBarras. Duas copias divergiriam
  // no dia em que alguem ajustasse uma, e a divergencia so apareceria no bipe.
}},

{nome:'O ENDERECO NAO VAI NA ETIQUETA, e isso e decisao', async executar({igual}){
  const b=await pdf.gerarRolo(
    [{codigo:'R-000012',largura:2.5,saldo:48.5,tecido:'Rolo · Napoles BK · Bege',impresso_em:'03/09/2026'}]);
  igual(b.length>500,true,'a etiqueta sai');
  /* O que vai colado no tubo e o que NAO muda de lugar: codigo, tecido,
     largura da bobina. O endereco muda toda vez que o tubo volta em outro
     buraco — uma etiqueta dizendo "A-1-1" passaria a mentir no primeiro dia,
     e o operador confia no que esta escrito no tubo antes de olhar a tela.
     Onde o rolo esta e pergunta para o sistema, que sabe a resposta de agora. */
}}

];

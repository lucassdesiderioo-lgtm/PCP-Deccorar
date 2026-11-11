// A LISTA DE MATERIAL DA FICHA — spec FICHAS-NO-CADASTRO-UNICO (11/11/2026).
//
// O que este arquivo prova:
//   1. a lista aponta o cadastro de material do PCP (pela porta) e recusa o que
//      nao existe ou nao vai para a ficha; a formula que nao avalia e recusada;
//   2. campo ausente nao apaga (#33);
//   3. o calculo filtra pelo `quando` e avalia em CENTIMETROS; produto sem
//      lista devolve lista vazia (o Rolo nao muda);
//   4. o custo e INDEFINIDO sem preco (regra 4), nunca zero;
//   5. duplicar o produto leva a lista;
//   6. a baixa na embalagem acontece UMA vez por peca, e a falha nao estoura:
//      vira "material extra a decidir";
//   7. a recusa registra o material extra com a lista congelada.
const catalogo=require('../dominio/catalogo_sm');
const FM=require('../dominio/ficha_material');
const materiais=require('../nucleo/materiais');
const PCP=require('../nucleo/material_pcp');

const DIRETOR={id:1, nome:'Lucas', papel:'diretor'};
const MATS=[{id:11,nome:'Parafuso 4x40',unidade:'un'},{id:12,nome:'Corrente bola',unidade:'m'},
  {id:13,nome:'Café',unidade:'un',vai_ficha:0}];

let chamadas=[], extras=[], falhar=false, adiar=false, precos={11:0.1,12:2.5};
function ligar(){
  materiais.ligar(()=>MATS);
  chamadas=[]; extras=[];
  PCP.ligar({
    custoMaterial:ids=>{ const o={}; ids.forEach(i=>o[i]=precos[i]==null?null:precos[i]); return o; },
    baixarMaterial:a=>{ if(falhar) throw new Error('banco travado'); if(adiar) return {adiado:true, motivo:'modo teste ligado no PCP'}; chamadas.push(a); return {baixados:a.itens, ignorados:[]}; },
    materialExtra:a=>{ extras.push(a); return {id:extras.length}; }
  });
}
let modelo=null;
function produto(){
  ligar();
  if(!modelo) modelo=catalogo.criarModelo({nome:'Romana teste lista'},DIRETOR);
  return modelo;
}

module.exports=[
{nome:'a linha aponta o material do PCP e guarda o retrato do nome e da unidade',
 executar({igual}){
  const m=produto();
  const l=FM.criar({modelo_id:m.id, componente_pcp_id:11, expressao:'4'});
  igual(l.nome,'Parafuso 4x40','nome'); igual(l.unidade,'un','unidade'); igual(l.quando,'sempre','quando padrao');
 }},
{nome:'material que nao existe, ou que nao vai para a ficha, e recusado',
 executar({recusa}){
  const m=produto();
  recusa(()=>FM.criar({modelo_id:m.id, componente_pcp_id:99, expressao:'1'}),'material_inexistente');
  recusa(()=>FM.criar({modelo_id:m.id, componente_pcp_id:13, expressao:'1'}),'material_fora_da_ficha');
 }},
{nome:'formula que nao avalia, vazia, ou "quando" fora da regua: recusado',
 executar({recusa}){
  const m=produto();
  recusa(()=>FM.criar({modelo_id:m.id, componente_pcp_id:12, expressao:'largura_xx / 100'}),'formula_invalida');
  recusa(()=>FM.criar({modelo_id:m.id, componente_pcp_id:12, expressao:''}),'formula_vazia');
  recusa(()=>FM.criar({modelo_id:m.id, componente_pcp_id:12, expressao:'1', quando:'chovendo'}),'quando_invalido');
 }},
{nome:'campo ausente nao apaga: editar so o quando mantem a formula',
 executar({igual}){
  const m=produto();
  const l=FM.criar({modelo_id:m.id, componente_pcp_id:12, expressao:'(2 * altura - 20) / 100', quando:'com_comando'});
  const e=FM.editar(l.id,{quando:'sempre'});
  igual(e.expressao,'(2 * altura - 20) / 100','formula preservada'); igual(e.quando,'sempre','quando mudou');
  FM.editar(l.id,{quando:'com_comando'});
 }},
{nome:'o calculo filtra pelo quando e avalia em centimetros',
 executar({igual,perto}){
  const m=produto();
  const com=FM.calcular(m.id,1500,2000,q=>q==='sempre'||q==='com_comando');
  const sem=FM.calcular(m.id,1500,2000,q=>q==='sempre');
  const corr=com.find(x=>x.componente_pcp_id===12);
  perto(corr.quantidade,(2*200-20)/100,'corrente em metros pela altura em cm');
  igual(sem.some(x=>x.componente_pcp_id===12),false,'sem comando a corrente nao entra');
  igual(sem.find(x=>x.componente_pcp_id===11).quantidade,4,'parafuso fixo');
 }},
{nome:'produto sem lista devolve lista vazia — o calculo de quem nao tem lista nao muda',
 executar({igual}){
  ligar();
  const outro=catalogo.criarModelo({nome:'Rolo sem lista'},DIRETOR);
  igual(FM.calcular(outro.id,1000,1000,()=>true).length,0,'vazia');
 }},
{nome:'custo: sem preco numa linha, o total e indefinido (nunca zero) e a linha e nomeada',
 executar({igual}){
  produto();
  const itens=[{componente_pcp_id:11,nome:'Parafuso 4x40',quantidade:4},{componente_pcp_id:12,nome:'Corrente bola',quantidade:3.8}];
  const c1=FM.custo(itens);
  igual(c1.custo_material_centavos,Math.round(4*0.1*100)+Math.round(3.8*2.5*100),'com preco, a soma');
  precos[12]=null;
  const c2=FM.custo(itens);
  igual(c2.custo_material_centavos,null,'sem preco, indefinido');
  igual(c2.sem_custo.join(),'Corrente bola','a linha sem preco e nomeada');
  precos[12]=2.5;
 }},
{nome:'duplicar o produto leva a lista de material',
 executar({igual}){
  const m=produto();
  const n=FM.listar(m.id).filter(x=>x.ativo).length;
  const copia=catalogo.duplicarModelo(m.id,{},DIRETOR);
  igual(FM.listar(copia.id).filter(x=>x.ativo).length,n,'mesma quantidade de linhas');
 }},
{nome:'a baixa na embalagem acontece UMA vez por peca, pela porta',
 executar({igual,db}){
  produto();
  db.pragma('foreign_keys = OFF');
  db.prepare("INSERT INTO sm_pedido(id,numero,revenda_id) VALUES(900,7900,1)").run();
  db.prepare(`INSERT INTO sm_pedido_item(id,pedido_id,n,modelo_id,abertura_id,cor_tecido_id,cor_acessorio_id,largura_mm,altura_mm,comando,rolamento)
    VALUES(901,900,1,1,1,1,1,1500,2000,'d','')`).run();
  db.pragma('foreign_keys = ON');
  FM.congelar(901,[{componente_pcp_id:11,nome:'Parafuso',unidade:'un',quantidade:4},{componente_pcp_id:12,nome:'Corrente',unidade:'m',quantidade:0}]);
  igual(db.prepare('SELECT COUNT(*) n FROM sm_pedido_material WHERE item_id=901').get().n,1,'quantidade zero nao congela');
  FM.baixarDaEmbalagem(901,{id:300,nome:'Bia'});
  igual(chamadas.length,1,'baixou uma vez');
  igual(chamadas[0].itens[0].componente_id,11,'o material congelado'); igual(chamadas[0].referencia,'sm_item:901','referencia da peca');
  FM.baixarDaEmbalagem(901,{id:300,nome:'Bia'});
  igual(chamadas.length,1,'a peca embalada de novo nao baixa outra vez');
  igual(FM.embaladoNoPeriodo('2000-01-01','2999-12-31').find(x=>x.componente_id===11).quantidade,4,'o consumo do periodo');
 }},
{nome:'a baixa que falha nao estoura: fica escrita e vira material extra',
 executar({igual,db}){
  produto();
  db.pragma('foreign_keys = OFF');
  db.prepare(`INSERT INTO sm_pedido_item(id,pedido_id,n,modelo_id,abertura_id,cor_tecido_id,cor_acessorio_id,largura_mm,altura_mm,comando,rolamento)
    VALUES(902,900,2,1,1,1,1,1500,2000,'d','')`).run();
  db.pragma('foreign_keys = ON');
  FM.congelar(902,[{componente_pcp_id:11,nome:'Parafuso',unidade:'un',quantidade:4}]);
  falhar=true;
  const r=FM.baixarDaEmbalagem(902,{id:300,nome:'Bia'});
  falhar=false;
  igual(!!r.falha,true,'devolveu a falha');
  igual(/falhou/.test(db.prepare('SELECT baixa_resultado r FROM sm_pedido_material WHERE item_id=902').get().r),true,'escrita na linha');
  igual(extras.length,1,'virou material extra'); igual(extras[0].origem,'falha_baixa','origem');
 }},
{nome:'a recusa registra o material extra com a lista congelada da peca',
 executar({igual}){
  produto();
  FM.registrarRecusa(901,'Tubo · torto · recusado na Montagem',{id:301,nome:'Ana'});
  igual(extras.length,1,'registrou'); igual(extras[0].registrado_por_id,301,'quem registrou');
  igual(extras[0].sugestao[0].componente_id,11,'a sugestao e a lista congelada');
  igual(/pedido 7900/.test(extras[0].descricao),true,'descreve o pedido');
 }},
{nome:'③ com o modo teste do PCP ligado, a baixa fica ESPERANDO e e feita na proxima embalagem',
 executar({igual,db}){
  produto();
  db.pragma('foreign_keys = OFF');
  db.prepare(`INSERT INTO sm_pedido_item(id,pedido_id,n,modelo_id,abertura_id,cor_tecido_id,cor_acessorio_id,largura_mm,altura_mm,comando,rolamento)
    VALUES(903,900,3,1,1,1,1,1500,2000,'d',''),(904,900,4,1,1,1,1,1500,2000,'d','')`).run();
  db.pragma('foreign_keys = ON');
  FM.congelar(903,[{componente_pcp_id:11,nome:'Parafuso',unidade:'un',quantidade:4}]);
  FM.congelar(904,[{componente_pcp_id:11,nome:'Parafuso',unidade:'un',quantidade:2}]);
  adiar=true;
  FM.baixarDaEmbalagem(903,{id:300,nome:'Bia'});
  adiar=false;
  const l=db.prepare('SELECT baixado_em, baixa_resultado r FROM sm_pedido_material WHERE item_id=903').get();
  igual(l.baixado_em,null,'nao marcada como baixada'); igual(/esperando/.test(l.r),true,'diz que esta esperando');
  igual(chamadas.length,0,'nada baixou');
  FM.baixarDaEmbalagem(904,{id:300,nome:'Bia'});
  igual(chamadas.length,2,'a proxima embalagem baixa a dela e a que esperava');
  igual(db.prepare('SELECT COUNT(*) n FROM sm_pedido_material WHERE item_id IN (903,904) AND baixado_em IS NULL').get().n,0,'as duas baixadas');
 }},
{nome:'③ a linha da lista que nao deu quantidade nao some: vira material extra na embalagem',
 executar({igual,db}){
  produto();
  db.pragma('foreign_keys = OFF');
  db.prepare(`INSERT INTO sm_pedido_item(id,pedido_id,n,modelo_id,abertura_id,cor_tecido_id,cor_acessorio_id,largura_mm,altura_mm,comando,rolamento)
    VALUES(905,900,5,1,1,1,1,1500,2000,'d','')`).run();
  db.pragma('foreign_keys = ON');
  FM.congelar(905,[{componente_pcp_id:11,nome:'Parafuso',unidade:'un',quantidade:4},{componente_pcp_id:12,nome:'Corrente',unidade:'m',quantidade:null,erro:'divisão por zero'}]);
  FM.baixarDaEmbalagem(905,{id:300,nome:'Bia'});
  igual(extras.length,1,'virou material extra'); igual(/Corrente/.test(extras[0].motivo)&&/divisão por zero/.test(extras[0].motivo),true,'diz qual e por que');
  igual(chamadas.length,1,'o parafuso baixou'); igual(chamadas[0].itens.length,1,'so o parafuso foi a baixa');
 }},
{nome:'③ o catalogo unico da 404 nao mostra produto inativo (R-SMN-01)',
 executar({igual}){
  produto();
  const nomes=FM.produtosParaPcp().map(p=>p.nome);
  igual(nomes.includes('Romana teste lista'),false,'o inativo nao vai');
 }},
{nome:'sem a porta do PCP, a recusa nao trava (nao registra, e nao estoura)',
 executar({igual}){
  produto();
  PCP.ligar(null);
  igual(FM.registrarRecusa(901,'x',DIRETOR),null,'sem porta, nada');
  ligar();
 }}
];

// CRIAR, DUPLICAR E ATIVAR PRODUTO — fase 1 da spec SOBMEDIDA-CADASTRO-DE-PRODUTO.
//
// ⚠️ ESCRITO ANTES DO CODIGO (risco vermelho, secao 0 do CLAUDE.md). O que
// este arquivo existe para provar, numa frase: A COPIA DO ROLO E O ROLO. As
// tres conferencias da secao 4.5 da spec SOBMEDIDA-PEDIDO-REVENDA sao feitas
// nos DOIS modelos, e o que sai de um tem que ser identico ao que sai do outro
// — degrau, cada medida de corte, cada consumo, o kit e o preco.
//
// E o produto novo NASCE INATIVO: a revenda nao ve, o pedido nao aceita, e so o
// simulador interno o calcula, com a tarja. Conferir depois de ativar seria
// conferir com a revenda ja vendendo.
const tecido=require('../dominio/tecido');
const catalogo=require('../dominio/catalogo_sm');
const persiana=require('../dominio/persiana');
const pedido=require('../dominio/pedido');
const revendas=require('../dominio/revenda');
const config=require('../nucleo/config');
const pessoas=require('../nucleo/pessoas');

const DIRETOR={id:1, nome:'Lucas', papel:'diretor'};

let base=null;
function cena(){
  if(base) return base;
  pessoas.ligar(()=>[{id:7,nome:'Renato'}]);
  const l=tecido.criarLinha({nome:'Rolô'});
  const screen1=tecido.criarAbertura({nome:'Screen 1%',linha_id:l.id});
  const screen3=tecido.criarAbertura({nome:'Screen 3%',linha_id:l.id});
  const branco=tecido.criarCor({nome:'Branco'});
  tecido.criarTecido({linha_id:l.id,abertura_id:screen1.id,cor_id:branco.id});
  tecido.criarTecido({linha_id:l.id,abertura_id:screen3.id,cor_id:branco.id});
  const rolo=catalogo.modeloPorNome('Rolô');
  catalogo.ligarColecao({modelo_id:rolo.id, abertura_id:screen1.id,
    preco_m2_centavos:11000, largura_max_mm:2800},DIRETOR);
  catalogo.ligarColecao({modelo_id:rolo.id, abertura_id:screen3.id,
    preco_m2_centavos:14000},DIRETOR);
  catalogo.ligarCorAcessorio({modelo_id:rolo.id, cor_id:branco.id});
  base={rolo, screen1, screen3, branco};
  return base;
}

/* As tres conferencias da secao 4.5, com as escolhas de cada uma. A terceira
   leva barra porque e o caso da spec que escreve a medida da barra. */
const CONFERENCIAS=[
  {largura_mm:1000, altura_mm:1000, adicional:'nenhum'},
  {largura_mm:2000, altura_mm:2000, adicional:'nenhum'},
  {largura_mm:2400, altura_mm:2000, adicional:'barra'}
];

function simular(modelo_id,extra,opcoes){
  const b=cena();
  return persiana.calcular(Object.assign({
    modelo_id, abertura_id:b.screen1.id, cor_acessorio_id:b.branco.id,
    comando:'direito', rolamento:'frente', reducao:'nao'},extra),opcoes);
}

/* O que tem que ser IGUAL entre o Rolo e a copia: tudo o que a fabrica corta e
   tudo o que o cliente paga. O nome do modelo e o id saem da comparacao — sao
   a unica coisa que tem que ser diferente. */
function retrato(r){
  return JSON.stringify({
    degrau:r.degrau&&{nome:r.degrau.nome,desconto:r.degrau.desconto_mm,acr:r.degrau.acrescimo_altura_tecido_mm},
    componentes:r.componentes.map(c=>[c.chave,c.setor,c.quantidade,c.largura_corte_mm,c.altura_corte_mm,
      c.consumo_largura_mm,c.consumo_altura_mm,c.gera_etiqueta,c.eh_kit,c.codigo_barras]),
    kit:r.kit, reducao:r.reducao,
    preco:{linhas:r.preco.linhas, sub:r.preco.valor_subtotal_centavos,
           cobrado:r.preco.m2_cobrado_mm2, real:r.preco.m2_real_mm2},
    opcoes:r.opcoes
  });
}

module.exports=[

/* ═══ DO ZERO ═════════════════════════════════════════════════════════════ */

{nome:'§3.2 — o produto criado DO ZERO nasce INATIVO, so com nome e limites',
 executar({igual}){
  cena();
  const m=catalogo.criarModelo({nome:'Romana', largura_max_mm:2500},DIRETOR);
  igual(m.ativo,0,'nasce inativo — a revenda nao ve ate o dono conferir');
  igual(m.largura_max_mm,2500,'o limite que veio');
  const inteiro=catalogo.modelo(m.id);
  igual(inteiro.colecoes.length,0,'sem colecao');
  igual(inteiro.degraus.length,0,'sem escada');
  igual(inteiro.ficha.length,0,'sem ficha — as abas nascem vazias');
}},

{nome:'§3.2 — o nome e obrigatorio e UNICO, sem olhar maiuscula',
 executar({recusa}){
  cena();
  recusa(()=>catalogo.criarModelo({nome:'  '},DIRETOR),'nome_vazio','nome em branco');
  recusa(()=>catalogo.criarModelo({nome:'rolô'},DIRETOR),'modelo_repetido','o Rolo ja existe');
}},

/* ═══ INATIVO: A REVENDA NAO VE, O PEDIDO NAO ACEITA ══════════════════════ */

{nome:'§3.2 — produto inativo e RECUSADO no calculo de quem vende, e aceito no simulador interno com a tarja',
 executar({igual,recusa}){
  const b=cena();
  const c=catalogo.duplicarModelo(b.rolo.id,{},DIRETOR);
  recusa(()=>simular(c.id,CONFERENCIAS[0]),'modelo_indisponivel',
    'sem a licenca do simulador interno, inativo nao calcula');
  const r=simular(c.id,CONFERENCIAS[0],{aceitaInativo:true});
  igual(r.modelo.ativo,false,'o resultado diz que o modelo esta inativo');
  igual(r.avisos.some(a=>/INATIVO — a revenda não vê/.test(a)),true,'e a tarja vem nos avisos');
}},

{nome:'§3.2 — a lista de quem VENDE nao traz o inativo; a de quem edita o catalogo traz',
 executar({igual}){
  const b=cena();
  const c=catalogo.duplicarModelo(b.rolo.id,{},DIRETOR);
  const venda=catalogo.listarModelos({inativos:false}).map(m=>m.id);
  const cadastro=catalogo.listarModelos({inativos:true}).map(m=>m.id);
  igual(venda.includes(c.id),false,'a revenda nao ve a copia');
  igual(venda.includes(b.rolo.id),true,'e ve o Rolo');
  igual(cadastro.includes(c.id),true,'o catalogo mostra a copia para o dono conferir');
}},

{nome:'§3.2 — o PEDIDO nao aceita produto inativo',
 executar({recusa}){
  const b=cena();
  const c=catalogo.duplicarModelo(b.rolo.id,{},DIRETOR);
  config.gravar('pedidoNumeroInicial','5000','teste');
  const t=revendas.tabelas()[0];
  const rev=revendas.criar({razao_social:'Revenda X LTDA',nome_fantasia:'REV X',tabela_id:t.id},DIRETOR);
  const p=pedido.criar({revenda_id:rev.id,tipo:'pedido'},DIRETOR);
  recusa(()=>pedido.acrescentarItem(p.id,Object.assign({modelo_id:c.id,abertura_id:b.screen1.id,
    cor_tecido_id:b.branco.id,cor_acessorio_id:b.branco.id,comando:'direito',rolamento:'frente'},
    CONFERENCIAS[0]),DIRETOR),'modelo_indisponivel','o pedido recusa');
}},

/* ═══ DUPLICAR: COPIA DE TUDO ═════════════════════════════════════════════ */

{nome:'§3.1 — DUPLICAR copia tudo: colecoes com preco, cores, escada, ficha, faixas e reducao',
 executar({igual}){
  const b=cena();
  const original=catalogo.modelo(b.rolo.id);
  const c=catalogo.modelo(catalogo.duplicarModelo(b.rolo.id,{},DIRETOR).id);

  igual(c.ativo,0,'a copia nasce inativa');
  igual(c.colecoes.length,original.colecoes.length,'as mesmas colecoes');
  igual(JSON.stringify(c.colecoes.map(x=>[x.abertura_id,x.preco_m2_centavos,x.largura_max_mm,x.m2_min_faturado_mm2])),
        JSON.stringify(original.colecoes.map(x=>[x.abertura_id,x.preco_m2_centavos,x.largura_max_mm,x.m2_min_faturado_mm2])),
        'com os precos e os limites');
  igual(c.cores_acessorio.length,original.cores_acessorio.length,'as cores de acessorio');
  igual(JSON.stringify(c.degraus.map(d=>[d.ordem,d.nome,d.largura_max_mm,d.m2_max_mm2,d.desconto_mm,
    d.acrescimo_altura_tecido_mm,d.aceita_bando,d.aceita_reducao,d.componente_id])),
    JSON.stringify(original.degraus.map(d=>[d.ordem,d.nome,d.largura_max_mm,d.m2_max_mm2,d.desconto_mm,
    d.acrescimo_altura_tecido_mm,d.aceita_bando,d.aceita_reducao,d.componente_id])),'a escada inteira');
  igual(c.ficha.length,12,'as doze linhas da ficha');
  igual(JSON.stringify(c.ficha.map(f=>[f.chave,f.ordem,f.quando,f.quantidade,f.ref_largura,f.ajuste_largura_mm,
    f.ref_altura,f.ajuste_altura_mm,f.consumo_ref_largura,f.consumo_ajuste_largura_mm])),
    JSON.stringify(original.ficha.map(f=>[f.chave,f.ordem,f.quando,f.quantidade,f.ref_largura,f.ajuste_largura_mm,
    f.ref_altura,f.ajuste_altura_mm,f.consumo_ref_largura,f.consumo_ajuste_largura_mm])),'linha a linha');
  igual(c.faixas_suporte.length,4,'as quatro faixas de suporte');
  igual(c.reducao.m2_acima_mm2,4500000,'a regra da reducao: 4,5 m²');
  igual(c.reducao.largura_acima_mm,2200,'e 2,200 de largura');
}},

{nome:'§11 fase 1 — PROVA: as tres conferencias da §4.5 dao o MESMO resultado no Rolo e na copia',
 executar({igual}){
  const b=cena();
  const c=catalogo.duplicarModelo(b.rolo.id,{},DIRETOR);
  for(const caso of CONFERENCIAS){
    const r1=simular(b.rolo.id,caso);
    const r2=simular(c.id,caso,{aceitaInativo:true});
    igual(retrato(r2),retrato(r1),'a copia em '+caso.largura_mm+' × '+caso.altura_mm);
  }
  // E os numeros escritos na spec, para o teste nao concordar consigo mesmo:
  const r=simular(c.id,CONFERENCIAS[1],{aceitaInativo:true});
  igual(r.degrau.nome,'Tubo 41','2,000 × 2,000 na copia → Tubo 41');
  igual(r.componentes.find(x=>x.chave==='tubo').largura_corte_mm,1960,'tubo 1,960');
  igual(r.componentes.find(x=>x.chave==='tecido').altura_corte_mm,2250,'tecido 2,250 de altura');
}},

{nome:'§3.2 — duplicar PROPOE "Cópia de Rolô", e a segunda copia nao colide com a primeira',
 executar({igual}){
  const b=cena();
  const nomes=catalogo.listarModelos({inativos:true}).map(m=>m.nome);
  const c=catalogo.duplicarModelo(b.rolo.id,{},DIRETOR);
  igual(/^Cópia de Rolô/.test(c.nome),true,'o nome proposto: '+c.nome);
  igual(nomes.includes(c.nome),false,'e ele nao existia antes');
  const outro=catalogo.duplicarModelo(b.rolo.id,{nome:'Double Vision'},DIRETOR);
  igual(outro.nome,'Double Vision','quem duplica pode dar o nome na hora');
}},

{nome:'§3.2 — os precos copiados entram no HISTORICO com "copiado de Rolô"',
 executar({igual}){
  const b=cena();
  const c=catalogo.modelo(catalogo.duplicarModelo(b.rolo.id,{},DIRETOR).id);
  for(const col of c.colecoes.filter(x=>x.preco_m2_centavos!=null)){
    const h=catalogo.historicoPreco('colecao',col.id);
    igual(h.length,1,'uma linha para a colecao '+col.colecao_nome);
    igual(h[0].para,col.preco_m2_centavos,'com o preco copiado');
    igual(h[0].de,null,'de "sem preco"');
    igual(/copiado de Rolô/.test(h[0].detalhe||''),true,'e a marca de onde veio: '+h[0].detalhe);
  }
}},

{nome:'§3.2 — duplicar modelo que nao existe e recusado, e NADA e gravado',
 executar({igual,recusa}){
  cena();
  const antes=catalogo.listarModelos({inativos:true}).length;
  recusa(()=>catalogo.duplicarModelo(99999,{},DIRETOR),'modelo_inexistente');
  recusa(()=>catalogo.duplicarModelo(cena().rolo.id,{nome:'Rolô'},DIRETOR),'modelo_repetido',
    'nome repetido recusa ANTES de escrever');
  igual(catalogo.listarModelos({inativos:true}).length,antes,'nenhum modelo pela metade');
}},

/* ═══ ATIVAR E EDITAR ═════════════════════════════════════════════════════ */

{nome:'§3.2 — "Cópia de…" NAO ativa; renomeado, ativa; desativar continua existindo',
 executar({igual,recusa}){
  const b=cena();
  const c=catalogo.duplicarModelo(b.rolo.id,{},DIRETOR);
  recusa(()=>catalogo.ativarModelo(c.id,true,DIRETOR),'nome_de_copia','ativar com o nome da copia');
  igual(catalogo.modelo(c.id).ativo,0,'continua inativo');
  catalogo.editarModelo(c.id,{nome:'Rolô Motorizada'},DIRETOR);
  igual(catalogo.ativarModelo(c.id,true,DIRETOR).ativo,1,'renomeado, ativa');
  igual(catalogo.ativarModelo(c.id,false,DIRETOR).ativo,0,'e desativa');
  recusa(()=>catalogo.editarModelo(c.id,{nome:'cópia de qualquer coisa'},DIRETOR)&&
    catalogo.ativarModelo(c.id,true,DIRETOR),'nome_de_copia','a regra nao olha maiuscula');
}},

{nome:'§3.2 — editar o produto: campo AUSENTE preserva, nome repetido recusa, numero impossivel recusa',
 executar({igual,recusa}){
  cena();
  const m=catalogo.criarModelo({nome:'Painel teste', largura_max_mm:4000, altura_max_mm:3000},DIRETOR);
  const e=catalogo.editarModelo(m.id,{altura_max_mm:2800},DIRETOR);
  igual(e.altura_max_mm,2800,'o campo que veio mudou');
  igual(e.largura_max_mm,4000,'o que nao veio ficou');
  igual(catalogo.editarModelo(m.id,{largura_max_mm:null},DIRETOR).largura_max_mm,null,
    'vazio de proposito apaga — e decisao de quem editou');
  recusa(()=>catalogo.editarModelo(m.id,{nome:'Rolô'},DIRETOR),'modelo_repetido');
  recusa(()=>catalogo.editarModelo(m.id,{m2_min_faturado_mm2:-1},DIRETOR));
}},

/* ═══ O COMPONENTE NOVO — sem ele o dono nao monta a Romana sozinho ════════ */

{nome:'§2 — criar COMPONENTE pela tela: chave unica, setor do cadastro, palavra reservada recusada',
 executar({igual,recusa}){
  cena();
  const v=catalogo.criarComponente({chave:'vareta',nome:'Vareta',setor:'serralheria'},DIRETOR);
  igual(v.chave,'vareta','criada');
  igual(v.gera_etiqueta,1,'gera etiqueta por padrao, como os outros');
  recusa(()=>catalogo.criarComponente({chave:'VARETA',nome:'x',setor:'serralheria'},DIRETOR),
    'componente_repetido','chave repetida');
  recusa(()=>catalogo.criarComponente({chave:'final',nome:'x',setor:'serralheria'},DIRETOR),
    'chave_reservada','"final" e palavra da ficha');
  recusa(()=>catalogo.criarComponente({chave:'costura',nome:'x',setor:'costura'},DIRETOR),
    'setor_inexistente','nao ha setor de costura (pergunta 4 da spec)');
  recusa(()=>catalogo.criarComponente({chave:'corda',nome:'Corda',setor:'serralheria',
    unidade_cobranca:'litro'},DIRETOR),'cobranca_invalida');
  const b=catalogo.criarComponente({chave:'bando_concavo',nome:'Bandô côncavo',setor:'serralheria',
    unidade_cobranca:'metro',preco_centavos:6000},DIRETOR);
  igual(b.preco_centavos,6000,'o preco inicial');
  igual(catalogo.historicoPreco('componente',b.id).length,1,'e ele deixa linha no historico');
}},

{nome:'§2 — a linha nova de ficha entra no produto novo, e a referencia adiantada continua recusada',
 executar({igual,recusa}){
  cena();
  const m=catalogo.criarModelo({nome:'Romana ficha'},DIRETOR);
  const v=catalogo.criarComponente({chave:'vareta_f',nome:'Vareta',setor:'serralheria'},DIRETOR);
  const l=catalogo.criarFichaLinha({modelo_id:m.id,componente_id:v.id,ref_largura:'final',
    ajuste_largura_mm:-20,consumo_ref_largura:'final',consumo_ajuste_largura_mm:-20});
  igual(l.chave,'vareta_f','a linha nasceu');
  recusa(()=>catalogo.criarFichaLinha({modelo_id:m.id,componente:'base',ordem:0,
    ref_largura:'vareta_f',ajuste_largura_mm:5}),'referencia_adiantada');
}}

];

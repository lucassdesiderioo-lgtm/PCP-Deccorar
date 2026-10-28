// ROMANA E PAINEL NA PRODUCAO — fase 6 da spec SOBMEDIDA-CADASTRO-DE-PRODUTO.
//
// ⚠️ ESCRITO ANTES DO CODIGO (risco vermelho). O que este arquivo prova:
//   1. AS LIBERACOES SAO DE CADA PRODUTO: a montagem da Romana espera as
//      varetas e o tecido; a peca marcada "vai so na caixa" segura so a
//      embalagem, como o bandô e a barra do Rolo (que nao mudam).
//   2. Uma Romana e um Painel ATRAVESSAM OS CINCO SETORES de hoje — nao ha
//      setor de costura (pergunta 4) — ate o pronto.
//   3. A RECUSA DE UMA UNIDADE (dono, 28/10/2026): com 4 varetas, quem recusa
//      escolhe o motivo E a unidade; so a 2/4 volta, com o que depende dela, e
//      a 1/4, a 3/4 e a 4/4 seguem. A refeita reimprime a MESMA etiqueta.
//   4. O PRECO POR COR, sem tela: a linha da cor vence a da colecao; sem ela,
//      vale a da colecao, e nada muda.
const tecido=require('../dominio/tecido');
const catalogo=require('../dominio/catalogo_sm');
const persiana=require('../dominio/persiana');
const pedido=require('../dominio/pedido');
const pedidoPdf=require('../dominio/pedido_pdf');
const etq=require('../dominio/etiqueta_producao');
const prod=require('../dominio/producao');
const motivos=require('../dominio/motivo_producao');
const revendas=require('../dominio/revenda');
const config=require('../nucleo/config');
const pessoas=require('../nucleo/pessoas');

const DIRETOR={id:1, nome:'Lucas', papel:'diretor',
  setores:['serralheria','colecao','montagem','revisao','embalagem']};
const RENATO={id:7, nome:'Renato', papel:'vendedor'};
const banca=(nome,setor)=>({id:200+nome.length, nome, papel:'producao', setores:[setor]});
const SERRA=banca('Joao','serralheria'), COLE=banca('Maria','colecao'),
      MONTA=banca('Pedro','montagem'), REVIS=banca('Ana','revisao'), EMBAL=banca('Bia','embalagem');

let base=null;
function cena(){
  if(base) return base;
  pessoas.ligar(()=>[{id:7,nome:'Renato'}]);
  const l=tecido.criarLinha({nome:'Romana'});
  const linho=tecido.criarAbertura({nome:'Linho',linha_id:l.id});
  const cru=tecido.criarCor({nome:'Cru'});
  const areia=tecido.criarCor({nome:'Areia'});
  tecido.criarTecido({linha_id:l.id,abertura_id:linho.id,cor_id:cru.id});
  tecido.criarTecido({linha_id:l.id,abertura_id:linho.id,cor_id:areia.id});
  const C=k=>catalogo.listarComponentes().find(c=>c.chave===k);

  // ── A Romana: tecido, 4 varetas (altura 1,500), montagem, revisao, embalagem, kit
  const rom=catalogo.criarModelo({nome:'Romana'},DIRETOR);
  catalogo.editarModelo(rom.id,{calculo:'gomos'},DIRETOR);
  catalogo.ligarColecao({modelo_id:rom.id,abertura_id:linho.id,preco_m2_centavos:20000},DIRETOR);
  catalogo.ligarCorAcessorio({modelo_id:rom.id,cor_id:cru.id});
  const vareta=catalogo.criarComponente({chave:'vareta',nome:'Vareta',setor:'serralheria'},DIRETOR);
  const kitR=catalogo.criarComponente({chave:'kit_romana',nome:'Kit romana',setor:'embalagem',
    gera_etiqueta:0,eh_kit:1,codigo_barras:'KIT-ROMANA'},DIRETOR);
  catalogo.criarFichaLinha({modelo_id:rom.id,componente_id:C('tecido').id,ref_largura:'final',ajuste_largura_mm:-10,
    ref_altura:'final',ajuste_altura_mm:150,consumo_ref_largura:'final',consumo_ajuste_largura_mm:-10,
    consumo_ref_altura:'final',consumo_ajuste_altura_mm:150});
  catalogo.criarFichaLinha({modelo_id:rom.id,componente_id:vareta.id,quantidade_ref:'varetas',
    ref_largura:'final',ajuste_largura_mm:-15,consumo_ref_largura:'final',consumo_ajuste_largura_mm:-15});
  ['montagem','revisao','embalagem'].forEach(k=>catalogo.criarFichaLinha({modelo_id:rom.id,componente_id:C(k).id}));
  catalogo.criarFichaLinha({modelo_id:rom.id,componente_id:kitR.id});
  catalogo.ativarModelo(rom.id,true,DIRETOR);

  // ── O Painel: folhas de tecido, base conica, trilho, e um bandô concavo que vai SO NA CAIXA
  const tela=tecido.criarAbertura({nome:'Tela',linha_id:l.id});
  tecido.criarTecido({linha_id:l.id,abertura_id:tela.id,cor_id:cru.id});
  const pai=catalogo.criarModelo({nome:'Painel'},DIRETOR);
  catalogo.editarModelo(pai.id,{calculo:'folhas'},DIRETOR);
  catalogo.ligarColecao({modelo_id:pai.id,abertura_id:tela.id,preco_m2_centavos:18000},DIRETOR);
  catalogo.ligarCorAcessorio({modelo_id:pai.id,cor_id:cru.id});
  ['sentido','folhas','acionamento','lado_corrente'].forEach(x=>catalogo.ligarEscolha(pai.id,x,true));
  const conica=catalogo.criarComponente({chave:'base_conica',nome:'Base cônica',setor:'serralheria'},DIRETOR);
  const trilho=catalogo.criarComponente({chave:'trilho',nome:'Trilho',setor:'serralheria'},DIRETOR);
  const concavo=catalogo.criarComponente({chave:'bando_concavo',nome:'Bandô côncavo',setor:'serralheria'},DIRETOR);
  const kitP=catalogo.criarComponente({chave:'kit_painel',nome:'Kit painel',setor:'embalagem',
    gera_etiqueta:0,eh_kit:1,codigo_barras:'KIT-PAINEL'},DIRETOR);
  catalogo.criarFichaLinha({modelo_id:pai.id,componente_id:C('tecido').id,quantidade_ref:'folhas',
    ref_largura:'folha',ajuste_largura_mm:0,ref_altura:'final',ajuste_altura_mm:50,
    consumo_ref_largura:'folha',consumo_ajuste_largura_mm:0,consumo_ref_altura:'final',consumo_ajuste_altura_mm:50});
  catalogo.criarFichaLinha({modelo_id:pai.id,componente_id:conica.id,quantidade_ref:'folhas',
    ref_largura:'tecido',ajuste_largura_mm:5,consumo_ref_largura:'tecido',consumo_ajuste_largura_mm:5});
  catalogo.criarFichaLinha({modelo_id:pai.id,componente_id:trilho.id,ref_largura:'final',ajuste_largura_mm:-20,
    consumo_ref_largura:'final',consumo_ajuste_largura_mm:-20});
  catalogo.criarFichaLinha({modelo_id:pai.id,componente_id:concavo.id,libera:'embalagem',
    ref_largura:'final',ajuste_largura_mm:-5,consumo_ref_largura:'final',consumo_ajuste_largura_mm:-5});
  ['montagem','revisao','embalagem'].forEach(k=>catalogo.criarFichaLinha({modelo_id:pai.id,componente_id:C(k).id}));
  catalogo.criarFichaLinha({modelo_id:pai.id,componente_id:kitP.id});
  catalogo.ativarModelo(pai.id,true,DIRETOR);

  // O motivo de recusa da vareta: o cadastro e da chefia, e e assim que ela o faz.
  const motivo=motivos.criar({nome:'Vareta torta',componente_chave:'vareta'},DIRETOR);

  config.gravar('pedidoNumeroInicial','5000','teste');
  const t=revendas.tabelas()[0];
  revendas.definirDescontoTabela(t.id,0,DIRETOR);
  const rev=revendas.criar({razao_social:'Lar do Cilar LTDA',nome_fantasia:'LAR DO CILAR',tabela_id:t.id},DIRETOR);
  revendas.definirVendedor(rev.id,7,DIRETOR);
  base={rom,pai,linho,tela,cru,areia,rev,motivo};
  return base;
}

function aprovar(item){
  const b=cena();
  const p=pedido.criar({revenda_id:b.rev.id,tipo:'pedido'},DIRETOR);
  pedido.acrescentarItem(p.id,item,DIRETOR);
  pedido.enviar(p.id,DIRETOR,'2026-10-28 10:00');
  return pedido.aprovar(p.id,RENATO);
}
const romana=()=>{ const b=cena(); return aprovar({modelo_id:b.rom.id,abertura_id:b.linho.id,
  cor_tecido_id:b.cru.id,cor_acessorio_id:b.cru.id,largura_mm:1200,altura_mm:1500}); };
const painel=()=>{ const b=cena(); return aprovar({modelo_id:b.pai.id,abertura_id:b.tela.id,
  cor_tecido_id:b.cru.id,cor_acessorio_id:b.cru.id,largura_mm:2000,altura_mm:2000,
  sentido:'central',folhas:4,acionamento:'com_comando',lado_corrente:'direito'}); };
const comps=p=>p.itens.flatMap(i=>i.componentes);
const fazer=(codigo,quem)=>{ prod.bipar(codigo,quem); return prod.bipar(codigo,quem); };
const naFila=(setor,quem,p)=>prod.fila(setor,quem).filter(x=>x.pedido_id===p.id).map(x=>x.codigo);

module.exports=[

{nome:'§11 fase 6 — a migracao marca o bandô e a barra do Rolo como "vai so na caixa": nada muda nele',
 executar({igual}){
  const f=catalogo.fichaDe(catalogo.modeloPorNome('Rolô').id);
  igual(f.filter(x=>x.libera==='embalagem').map(x=>x.chave).sort().join(','),'bando,barra',
    'so o bandô e a barra seguram a embalagem em vez da montagem');
}},

{nome:'§11 fase 6 — a montagem da ROMANA espera as QUATRO varetas e o tecido',
 executar({igual}){
  const p=romana();
  const c=comps(p);
  const mont=c.find(x=>x.chave==='montagem').codigo_etiqueta;
  igual(naFila('montagem',MONTA,p).length,0,'nada na montagem antes de tudo');
  fazer(c.find(x=>x.chave==='tecido').codigo_etiqueta,COLE);
  const v=c.filter(x=>x.chave==='vareta');
  v.slice(0,3).forEach(x=>fazer(x.codigo_etiqueta,SERRA));
  igual(naFila('montagem',MONTA,p).length,0,'com 3 de 4 varetas a montagem ainda espera');
  const e=prod.oQueSegura(mont);
  igual(e.length,1,'e o que segura e UMA vareta');
  fazer(v[3].codigo_etiqueta,SERRA);
  igual(naFila('montagem',MONTA,p).includes(mont),true,'a quarta libera a montagem');
}},

{nome:'§11 fase 6 — PROVA: uma ROMANA atravessa os cinco setores ate o PRONTO',
 executar({igual}){
  const p=romana();
  const c=comps(p);
  const de=k=>c.filter(x=>x.chave===k);
  de('tecido').forEach(x=>fazer(x.codigo_etiqueta,COLE));
  de('vareta').forEach(x=>fazer(x.codigo_etiqueta,SERRA));
  fazer(de('montagem')[0].codigo_etiqueta,MONTA);
  fazer(de('revisao')[0].codigo_etiqueta,REVIS);
  const emb=de('embalagem')[0].codigo_etiqueta;
  prod.bipar(emb,EMBAL);
  prod.biparKit(emb,'KIT-ROMANA',EMBAL);
  const fim=prod.bipar(emb,EMBAL);
  igual(fim.pronto,true,'a Romana ficou PRONTA');
  igual(!!pedido.porId(p.id).pronto_em,true,'e o pedido tem pronto_em');
}},

{nome:'§11 fase 6 — PROVA: um PAINEL atravessa os cinco setores; o bandô concavo segura so a EMBALAGEM',
 executar({igual}){
  const p=painel();
  const c=comps(p);
  const de=k=>c.filter(x=>x.chave===k);
  igual(de('tecido').length,4,'quatro folhas de tecido, uma etiqueta cada');
  de('tecido').forEach(x=>fazer(x.codigo_etiqueta,COLE));
  de('base_conica').forEach(x=>fazer(x.codigo_etiqueta,SERRA));
  fazer(de('trilho')[0].codigo_etiqueta,SERRA);
  const mont=de('montagem')[0].codigo_etiqueta;
  igual(naFila('montagem',MONTA,p).includes(mont),true,
    'o bandô concavo ainda nao foi feito, e a montagem ja libera — ele vai so na caixa');
  fazer(mont,MONTA);
  fazer(de('revisao')[0].codigo_etiqueta,REVIS);
  const emb=de('embalagem')[0].codigo_etiqueta;
  igual(naFila('embalagem',EMBAL,p).includes(emb),false,'mas a embalagem espera o bandô concavo');
  fazer(de('bando_concavo')[0].codigo_etiqueta,SERRA);
  igual(naFila('embalagem',EMBAL,p).includes(emb),true,'feito ele, a embalagem libera');
  prod.bipar(emb,EMBAL);
  prod.biparKit(emb,'KIT-PAINEL',EMBAL);
  igual(prod.bipar(emb,EMBAL).pronto,true,'o Painel ficou PRONTO');
}},

{nome:'§8.3 — RECUSA DE UMA UNIDADE: escolher a 2/4 devolve so ela; 1/4, 3/4 e 4/4 seguem',
 executar({igual,recusa}){
  const b=cena();
  const p=romana();
  const c=comps(p);
  const de=k=>c.filter(x=>x.chave===k);
  de('tecido').forEach(x=>fazer(x.codigo_etiqueta,COLE));
  const v=de('vareta');
  v.forEach(x=>fazer(x.codigo_etiqueta,SERRA));
  const mont=de('montagem')[0].codigo_etiqueta;
  fazer(mont,MONTA);
  const rev=de('revisao')[0].codigo_etiqueta;
  prod.bipar(rev,REVIS);

  const lista=prod.motivos(rev).motivos.find(m=>m.id===b.motivo.id);
  igual(lista.unidades.map(u=>u.unidade).join(','),'1/4,2/4,3/4,4/4',
    'a lista da bancada oferece as quatro unidades para escolher');
  recusa(()=>prod.recusar(rev,{motivo_id:b.motivo.id},REVIS),'unidade_obrigatoria',
    'com quatro varetas, so o motivo nao basta: qual delas?');
  recusa(()=>prod.recusar(rev,{motivo_id:b.motivo.id,unidade:7},REVIS),'unidade_inexistente');

  const r=prod.recusar(rev,{motivo_id:b.motivo.id,unidade:2},REVIS);
  igual(r.culpado.codigo,v[1].codigo_etiqueta,'o culpado e a 2/4');
  const agora=pedido.porId(p.id).itens[0].componentes;
  const daVareta=k=>agora.find(x=>x.codigo_etiqueta===v[k].codigo_etiqueta);
  igual(daVareta(1).terminado_em,null,'a 2/4 voltou para a serralheria');
  igual(daVareta(1).refeitas,1,'e conta como refeita');
  igual([0,2,3].every(k=>!!daVareta(k).terminado_em),true,'a 1/4, a 3/4 e a 4/4 SEGUEM terminadas');
  igual(agora.find(x=>x.codigo_etiqueta===mont).terminado_em,null,
    'a montagem, que dependia dela, volta para aguardando');
  igual(naFila('serralheria',SERRA,p).join(','),v[1].codigo_etiqueta,'na serralheria so a 2/4 aparece');
}},

{nome:'§8.3 — a unidade refeita reimprime a MESMA etiqueta: codigo, k/n e data de fabricacao, marcada',
 executar({igual,db}){
  const b=cena();
  const p=romana();
  const v0=comps(p).filter(x=>x.chave==='vareta');
  etq.imprimir({pedidos:[p.id],setor:'serralheria'},DIRETOR);
  db.prepare("UPDATE sm_pedido_componente SET fabricado_em='2026-10-02 08:00:00' WHERE codigo_etiqueta=?")
    .run(v0[1].codigo_etiqueta);
  const c=comps(pedido.porId(p.id));
  c.filter(x=>x.chave==='tecido').forEach(x=>fazer(x.codigo_etiqueta,COLE));
  c.filter(x=>x.chave==='vareta').forEach(x=>fazer(x.codigo_etiqueta,SERRA));
  const mont=c.find(x=>x.chave==='montagem').codigo_etiqueta;
  prod.bipar(mont,MONTA);
  prod.recusar(mont,{motivo_id:b.motivo.id,unidade:2},MONTA);
  const e=etq.paraImprimir({codigos:[v0[1].codigo_etiqueta]})[0];
  igual(e.codigo,v0[1].codigo_etiqueta,'o mesmo codigo');
  igual(e.unidade,'2/4','o mesmo k/n');
  igual(e.refeitas,1,'marcada como refeita');
  igual(e.fabricado_em,'2026-10-02 08:00:00','e a mesma data de fabricacao');
}},

{nome:'§8.3 — insumo de UMA unidade continua com uma escolha so, o motivo (o Rolo nao muda)',
 executar({igual}){
  const b=cena();
  const p=romana();
  const c=comps(p);
  const mot=motivos.criar({nome:'Tecido manchado romana',componente_chave:'tecido'},DIRETOR);
  c.filter(x=>x.chave==='tecido').forEach(x=>fazer(x.codigo_etiqueta,COLE));
  c.filter(x=>x.chave==='vareta').forEach(x=>fazer(x.codigo_etiqueta,SERRA));
  const mont=c.find(x=>x.chave==='montagem').codigo_etiqueta;
  prod.bipar(mont,MONTA);
  const m=prod.motivos(mont).motivos.find(x=>x.id===mot.id);
  igual(m.unidades,undefined,'um tecido so: a lista nao pede unidade');
  const r=prod.recusar(mont,{motivo_id:mot.id},MONTA);
  igual(r.culpado.chave,'tecido','recusado so pelo motivo, como sempre');
  void b;
}},

{nome:'§7 — PRECO POR COR: a linha da cor vence a da colecao; sem ela vale a da colecao',
 executar({igual}){
  const b=cena();
  const col=catalogo.modelo(b.rom.id).colecoes[0];
  const sim=cor=>persiana.calcular({modelo_id:b.rom.id,abertura_id:b.linho.id,cor_tecido_id:cor,
    cor_acessorio_id:b.cru.id,largura_mm:1000,altura_mm:2000});
  const tecidoDe=r=>r.preco.linhas.find(l=>l.chave==='tecido');
  // 1,000 × 2,000 = 2,000 m² × R$ 200,00 = R$ 400,00
  igual(tecidoDe(sim(b.areia.id)).valor_centavos,40000,'sem linha de cor: o preco da colecao');
  catalogo.definirPrecoCor(col.id,b.areia.id,23000,DIRETOR);
  // 2,000 m² × R$ 230,00 = R$ 460,00
  igual(tecidoDe(sim(b.areia.id)).valor_centavos,46000,'com a linha da cor Areia: ela vence');
  igual(tecidoDe(sim(b.cru.id)).valor_centavos,40000,'a cor Cru continua com o preco da colecao');
  igual(/Areia/.test(tecidoDe(sim(b.areia.id)).base),true,'e a conta diz que e o preco da cor');
  igual(catalogo.historicoPreco('colecao_cor',col.id).length,1,'a mudanca deixou linha no historico');
  catalogo.definirPrecoCor(col.id,b.areia.id,null,DIRETOR);
  igual(tecidoDe(sim(b.areia.id)).valor_centavos,40000,'tirada a linha, volta a colecao');
}},

{nome:'§7 — preco por cor VAZIO nao muda nada: o Rolo nao tem linha, e o preco dele e o de sempre',
 executar({igual,db}){
  igual(db.prepare('SELECT COUNT(*) n FROM sm_preco_cor').get().n,0,'a tabela nasce vazia');
}},

{nome:'§3.1 — duplicar leva o preco por cor junto, apontando para a colecao COPIADA',
 executar({igual}){
  const b=cena();
  const col=catalogo.modelo(b.rom.id).colecoes[0];
  catalogo.definirPrecoCor(col.id,b.areia.id,25000,DIRETOR);
  const c=catalogo.duplicarModelo(b.rom.id,{nome:'Romana copia cor'},DIRETOR);
  const colNova=catalogo.modelo(c.id).colecoes[0];
  igual(catalogo.precosPorCor(colNova.id).map(x=>x.preco_m2_centavos).join(','),'25000','o preco da cor veio');
  catalogo.definirPrecoCor(col.id,b.areia.id,null,DIRETOR);
  igual(catalogo.precosPorCor(colNova.id).length,1,'e e da copia: tirar do original nao tira dela');
}},

{nome:'§11 fase 6 — o PDF do pedido sai com as escolhas novas do Painel',
 async executar({igual}){
  const p=painel();
  igual(/Abertura central/.test(p.itens[0].resumo),true,'a frase: '+p.itens[0].resumo);
  igual(/4 folhas/.test(p.itens[0].resumo),true,'com as folhas');
  igual(/Corrente à direita/.test(p.itens[0].resumo),true,'e a corrente');
  const pdf=await pedidoPdf.gerar(pedido.porId(p.id));
  igual(pdf.arquivo.slice(0,5).toString(),'%PDF-','saiu a folha');
}}

];

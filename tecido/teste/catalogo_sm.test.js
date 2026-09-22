// O CADASTRO DO SOB MEDIDA — o que ele aceita, e o que recusa dizendo por que.
//
// Escrito ANTES do codigo (risco vermelho, secao 0 do CLAUDE.md). As duas
// decisoes da secao 8 da spec estao travadas aqui, e nao so escritas no papel:
// a colecao de venda APONTA para o cadastro de tecido (nunca o duplica), e o
// modelo NAO guarda linha nenhuma.
const tecido=require('../dominio/tecido');
const catalogo=require('../dominio/catalogo_sm');
const persiana=require('../dominio/persiana');

const EU={nome:'Lucas',papel:'diretor'};

let base=null;
function cena(){
  if(base) return base;
  const rolo=tecido.criarLinha({nome:'Rolô'});
  const dv=tecido.criarLinha({nome:'Double Vision'});
  const screen1=tecido.criarAbertura({nome:'Screen 1%',linha_id:rolo.id});
  const napoles=tecido.criarAbertura({nome:'Nápoles',linha_id:dv.id});
  const cor=tecido.criarCor({nome:'Branco'});
  base={rolo,dv,screen1,napoles,cor,m:catalogo.modeloPorNome('Rolô')};
  return base;
}

module.exports=[

/* ═══ A SEMENTE — a ficha do Rolo que a fabrica corta hoje ═════════════════ */

{nome:'a semente traz o modelo Rolô com a escada da secao 4.4, na ordem',
 executar({igual}){
  const m=catalogo.modelo(cena().m.id);
  igual(m.degraus.map(d=>d.nome).join(' · '),'Tubo 32 · Tubo 38 · Tubo 41 · Tubo 56','os quatro degraus');
  const d=n=>m.degraus.find(x=>x.nome==='Tubo '+n);
  igual(d(32).largura_max_mm+'/'+d(32).m2_max_mm2+'/'+d(32).desconto_mm+'/'+d(32).acrescimo_altura_tecido_mm,
    '1700/3000000/30/200','o degrau 32');
  igual(d(38).largura_max_mm+'/'+d(38).m2_max_mm2+'/'+d(38).desconto_mm+'/'+d(38).acrescimo_altura_tecido_mm,
    '2200/3500000/30/200','o degrau 38');
  igual(d(41).largura_max_mm+'/'+d(41).m2_max_mm2+'/'+d(41).desconto_mm+'/'+d(41).acrescimo_altura_tecido_mm,
    '2700/5000000/40/250','o degrau 41');
  igual(d(56).largura_max_mm+'/'+d(56).m2_max_mm2+'/'+d(56).desconto_mm+'/'+d(56).acrescimo_altura_tecido_mm,
    '3000/7000000/45/250','o degrau 56');
  igual(d(32).aceita_bando+''+d(38).aceita_bando+d(41).aceita_bando+d(56).aceita_bando,'1100',
    'bando so nos tubos 32 e 38');
  igual(d(32).aceita_reducao+''+d(38).aceita_reducao+d(41).aceita_reducao+d(56).aceita_reducao,'0111',
    'reducao pedida so no 38, 41 e 56');
}},

{nome:'a semente traz o minimo faturado de 1,5 m² e a regra da reducao',
 executar({igual}){
  const m=catalogo.modelo(cena().m.id);
  igual(m.m2_min_faturado_mm2,1500000,'1,5 m²');
  igual(m.reducao.m2_acima_mm2,4500000,'acima de 4,5 m²');
  igual(m.reducao.largura_acima_mm,2200,'ou acima de 2,200 de largura');
  igual(m.faixas_suporte.map(f=>f.largura_max_mm+':'+f.quantidade).join(' '),
    '1000:2 1900:3 2600:4 3000:5','as quatro faixas de suporte');
}},

/* ═══ DECISAO 1 DA SECAO 8 — A COLECAO DE VENDA APONTA, NAO DUPLICA ════════ */

{nome:'⚠️ a colecao de venda APONTA para o cadastro de tecido, e carrega a linha dela',
 executar({igual}){
  const b=cena();
  const c=catalogo.ligarColecao({modelo_id:b.m.id,abertura_id:b.screen1.id,preco_m2_centavos:11000});
  igual(c.abertura_id,b.screen1.id,'aponta para a abertura do cadastro');
  igual(c.colecao_nome,'Screen 1%','e le o nome de la');
  igual(c.linha_nome,'Rolô','e a LINHA vem junto, de graca');
}},

{nome:'⚠️ o MODELO nao guarda linha: colecoes de linhas diferentes convivem',
 executar({igual}){
  const b=cena();
  catalogo.ligarColecao({modelo_id:b.m.id,abertura_id:b.napoles.id,preco_m2_centavos:9000});
  const m=catalogo.modelo(b.m.id);
  igual(Object.keys(m).indexOf('linha_id'),-1,'o modelo NAO tem coluna de linha');
  const linhas=[...new Set(m.colecoes.map(c=>c.linha_nome))].sort().join(' · ');
  igual(linhas,'Double Vision · Rolô','e as duas linhas aparecem, cada colecao com a sua');
}},

{nome:'colecao que nao existe no cadastro de tecido e recusada',
 executar({recusa}){
  recusa(()=>catalogo.ligarColecao({modelo_id:cena().m.id,abertura_id:9999}),
    'colecao_inexistente','abertura fantasma');
}},

{nome:'a mesma colecao nao entra duas vezes no mesmo modelo',
 executar({recusa}){
  const b=cena();
  recusa(()=>catalogo.ligarColecao({modelo_id:b.m.id,abertura_id:b.screen1.id}),
    'colecao_repetida','ja ligada');
}},

/* ═══ PRECO — centavo inteiro, recusa em vez de clampar, e historico ═══════ */

{nome:'⚠️ preco impossivel e RECUSADO, nunca clampado — e o gravado nao se mexe',
 executar({igual,recusa}){
  const b=cena();
  const c=catalogo.colecaoDe(b.m.id,b.screen1.id);
  ['-100','1,5','abc',''].forEach(v=>
    recusa(()=>catalogo.definirPrecoColecao(c.id,v,EU),'preco_invalido','preco "'+v+'"'));
  igual(catalogo.colecaoDe(b.m.id,b.screen1.id).preco_m2_centavos,11000,
    'o preco de antes continua de pe — clampar em zero seria apagar em silencio');
}},

{nome:'⚠️ campo ausente NAO e campo vazio (a divida 15 do CLAUDE.md, evitada de proposito)',
 executar({igual}){
  const b=cena();
  const c=catalogo.colecaoDe(b.m.id,b.screen1.id);
  catalogo.editarColecao(c.id,{largura_max_mm:2800});
  const depois=catalogo.colecaoDe(b.m.id,b.screen1.id);
  igual(depois.largura_max_mm,2800,'o que veio foi gravado');
  igual(depois.preco_m2_centavos,11000,'e o preco, que NAO veio no corpo, continua la');
}},

{nome:'mudar o preco deixa linha de historico: de, para, quem e quando',
 executar({igual}){
  const b=cena();
  const c=catalogo.colecaoDe(b.m.id,b.screen1.id);
  catalogo.definirPrecoColecao(c.id,12000,EU);
  const h=catalogo.historicoPreco('colecao',c.id);
  igual(h.length>=1,true,'gravou');
  igual(h[0].de+' → '+h[0].para,'11000 → 12000','de → para em centavos');
  igual(h[0].usuario_nome,'Lucas','quem');
  catalogo.definirPrecoColecao(c.id,11000,EU);
}},

{nome:'preco igual ao que ja esta gravado nao inventa linha de historico',
 executar({igual}){
  const b=cena();
  const c=catalogo.colecaoDe(b.m.id,b.screen1.id);
  const antes=catalogo.historicoPreco('colecao',c.id).length;
  catalogo.definirPrecoColecao(c.id,11000,EU);
  igual(catalogo.historicoPreco('colecao',c.id).length,antes,'sem mudanca, sem linha');
}},

/* ═══ A ESCADA E A FICHA — o que o cadastro nao deixa ficar torto ══════════ */

{nome:'⚠️ a escada tem que SUBIR: degrau mais estreito depois de um mais largo e recusado',
 executar({igual,recusa}){
  const b=cena();
  const e=recusa(()=>catalogo.editarDegrau(
    catalogo.modelo(b.m.id).degraus.find(d=>d.nome==='Tubo 41').id,{largura_max_mm:1500}),
    'escada_fora_de_ordem','41 mais estreito que o 38');
  igual(/1500/.test(e.mensagem)||/Tubo/.test(e.mensagem),true,
    'a recusa diz qual degrau: '+e.mensagem);
  igual(catalogo.modelo(b.m.id).degraus.find(d=>d.nome==='Tubo 41').largura_max_mm,2700,
    'e nada foi gravado');
}},

{nome:'ajuste de ficha e milimetro INTEIRO',
 executar({recusa}){
  const b=cena();
  const l=catalogo.fichaLinhaDe(b.m.id,'bando','bando');
  recusa(()=>catalogo.editarFichaLinha(l.id,{ajuste_largura_mm:-5.5}),
    'medida_nao_inteira','meio milimetro');
}},

{nome:'⚠️ a ficha nao pode apontar para uma medida que ainda nao foi calculada',
 executar({igual,recusa}){
  const b=cena();
  // O tubo e o primeiro da ordem: mandar ele medir-se pelo TECIDO, que so
  // nasce depois dele, e a referencia circular que so apareceria na bancada.
  const l=catalogo.fichaLinhaDe(b.m.id,'tubo','sempre');
  recusa(()=>catalogo.editarFichaLinha(l.id,{ref_largura:'tecido'}),
    'referencia_adiantada','tubo medindo-se pelo tecido');
  igual(catalogo.fichaLinhaDe(b.m.id,'tubo','sempre').ref_largura,'degrau','nada gravado');
}},

{nome:'faixa de suporte repetida e recusada, e a lista sai em ordem',
 executar({igual,recusa}){
  const b=cena();
  recusa(()=>catalogo.criarFaixaSuporte({modelo_id:b.m.id,largura_max_mm:1900,quantidade:9}),
    'faixa_repetida','1,900 ja existe');
  igual(catalogo.modelo(b.m.id).faixas_suporte.map(f=>f.largura_max_mm).join(','),
    '1000,1900,2600,3000','em ordem crescente');
}},

/* ═══ O CADASTRO DESLIGADO NAO VENDE ══════════════════════════════════════ */

{nome:'colecao desativada para de ser oferecida, e o calculo recusa dizendo isso',
 executar({igual,recusa}){
  const b=cena();
  const c=catalogo.colecaoDe(b.m.id,b.screen1.id);
  catalogo.editarColecao(c.id,{ativo:0});
  const e=recusa(()=>persiana.calcular({modelo_id:b.m.id,abertura_id:b.screen1.id,
    cor_acessorio_id:b.cor.id,largura_mm:1000,altura_mm:1000,
    comando:'direito',rolamento:'frente',adicional:'nenhum',reducao:'nao'}),
    'colecao_indisponivel','colecao desligada');
  igual(/Screen 1%/.test(e.mensagem),true,'nomeando qual: '+e.mensagem);
  catalogo.editarColecao(c.id,{ativo:1});
}},

{nome:'a cor de acessorio e obrigatoria, e tem que ser uma das do modelo',
 executar({recusa}){
  const b=cena();
  const p=extra=>persiana.calcular(Object.assign({modelo_id:b.m.id,abertura_id:b.screen1.id,
    cor_acessorio_id:b.cor.id,largura_mm:1000,altura_mm:1000,
    comando:'direito',rolamento:'frente',adicional:'nenhum',reducao:'nao'},extra));
  recusa(()=>p({cor_acessorio_id:null}),'cor_acessorio_obrigatoria','sem cor');
  const outra=tecido.criarCor({nome:'Preto'});
  recusa(()=>p({cor_acessorio_id:outra.id}),'cor_acessorio_fora_do_modelo','cor nao ligada');
  catalogo.ligarCorAcessorio({modelo_id:b.m.id,cor_id:b.cor.id});
}},

{nome:'cor de acessorio DESATIVADA nao vende, e a trava e do servidor',
 executar({igual,recusa}){
  /* A tela ja filtra. Mas "desativar um cadastro que nao desativa nada e pior
     que nao ter o botao": ele promete uma coisa e faz outra, em silencio. */
  const b=cena();
  const dados=require('../dados/catalogo_sm');
  const ligada=dados.corAcessorio(b.m.id,b.cor.id);
  require('../nucleo/db').prepare('UPDATE sm_modelo_cor_acessorio SET ativo=0 WHERE id=?').run(ligada.id);
  const e=recusa(()=>persiana.calcular({modelo_id:b.m.id,abertura_id:b.screen1.id,
    cor_acessorio_id:b.cor.id,largura_mm:1000,altura_mm:1000,
    comando:'direito',rolamento:'frente',adicional:'nenhum',reducao:'nao'}),
    'cor_acessorio_indisponivel','cor desligada');
  igual(/Branco/.test(e.mensagem),true,'nomeando qual: '+e.mensagem);
  require('../nucleo/db').prepare('UPDATE sm_modelo_cor_acessorio SET ativo=1 WHERE id=?').run(ligada.id);
}},

{nome:'comando e rolamento sao OBRIGATORIOS — nao ha padrao escondido',
 executar({recusa}){
  const b=cena();
  const p=extra=>persiana.calcular(Object.assign({modelo_id:b.m.id,abertura_id:b.screen1.id,
    cor_acessorio_id:b.cor.id,largura_mm:1000,altura_mm:1000,
    comando:'direito',rolamento:'frente',adicional:'nenhum',reducao:'nao'},extra));
  recusa(()=>p({comando:null}),'comando_obrigatorio','sem comando');
  recusa(()=>p({comando:'meio'}),'comando_obrigatorio','comando inventado');
  recusa(()=>p({rolamento:null}),'rolamento_obrigatorio','sem rolamento');
  recusa(()=>p({rolamento:'lado'}),'rolamento_obrigatorio','rolamento inventado');
}},

/* ═══ AS ROTAS ════════════════════════════════════════════════════════════ */

{nome:'toda rota nova declara uma chave que EXISTE',
 executar({igual}){
  const {CHAVES}=require('../nucleo/permissoes');
  const furos=require('../rotas/catalogo_sm').rotas.filter(r=>
    !r.permissao||!CHAVES.some(c=>c.chave===r.permissao));
  igual(furos.length,0,'furos: '+furos.map(r=>r.metodo+' '+r.caminho).join(', '));
}},

{nome:'⚠️ a lista de modulos do teste de acesso sai do montar.js, e nao de uma copia',
 executar({igual}){
  const {MODULOS}=require('../montar');
  igual(Array.isArray(MODULOS)&&MODULOS.length>0,true,'o montar.js exporta a lista');
  igual(MODULOS.some(m=>/catalogo_sm/.test(m)),true,'e o modulo novo esta montado');
  igual(MODULOS.some(m=>/planos/.test(m)),true,
    'e o de planos tambem — ele estava FORA da lista escrita a mao');
}}

];

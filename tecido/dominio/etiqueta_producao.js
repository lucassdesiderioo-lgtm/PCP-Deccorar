// A ETIQUETA DE PRODUCAO — dono unico do codigo sequencial por setor e do que
// vai escrito no papel (secao 4.14 da spec SOBMEDIDA-PEDIDO-REVENDA).
//
//   SER-000123   serralheria   tubo, base, bandô, barra
//   COL-000045   colecao       o tecido
//   MON / REV / EMB            montagem, revisao, embalagem
//
// ⚠️ O CODIGO E DA PECA, NAO DO PAPEL. Ele nasce na APROVACAO — junto com a
// ficha congelada —, sobrevive a reimpressao e nunca volta ao bolo. Codigo
// novo na reimpressao partiria a historia da peca em duas e o tempo do setor
// nunca fecharia; codigo reaproveitado sairia um dia em duas pecas, e ai a
// bancada bipa a peca errada com a etiqueta certa.
//
// ⚠️ ELE NAO DESENHA O PAPEL. Quem desenha e o `etiqueta_producao_pdf.js`, e
// ele consome a lista que sai daqui — a mesma separacao do `kit_etiqueta.js`
// do PCP (§4): um desenho, e quem sabe O QUE dizer nao sabe ONDE por.
const {ErroDeRegra,exigir}=require('../nucleo/erros');
const db=require('../nucleo/db');
const d=require('../dados/etiqueta_producao');
const prazo=require('./prazo');
const dia=require('../nucleo/dia');
const u=require('../nucleo/unidade');

const setores=()=>d.setores();
const nome=usuario=>(usuario&&usuario.nome)||null;

/* ── O CODIGO ─────────────────────────────────────────────────────────────
   Sem transacao propria, e de proposito: quem chama e a aprovacao, que grava
   a ficha inteira de uma vez (§2 do CLAUDE.md — dominio que abre a propria
   transacao tira de quem chama a chance de desfazer).

   ⚠️ E IDEMPOTENTE: so olha componente com etiqueta e SEM codigo. Rodar duas
   vezes nao renumera nada — e e por isso que o backfill pode ser o mesmo
   caminho da aprovacao, em vez de uma segunda regua. */
function atribuirCodigos(componentes){
  const feitos=[];
  for(const c of componentes){
    if(c.codigo_etiqueta) continue;
    if(!c.gera_etiqueta) continue;
    const s=d.proximoNumero(c.setor);
    exigir(s,'setor_inexistente','O setor "'+c.setor+'" nao esta no cadastro de setores. '+
      'Sem ele a etiqueta nao tem prefixo, e cadastrar um prefixo depois nao renumera o que ja saiu.');
    const codigo=s.prefixo+'-'+String(s.ultimo_numero).padStart(6,'0');
    d.gravarCodigo(c.id,codigo);
    feitos.push({id:c.id, setor:c.setor, codigo});
  }
  return feitos;
}

/* O backfill: os aprovados de antes da fase 4-A. Aqui sim ha transacao — o
   pedido 5001 foi aprovado antes desta migracao existir, e sem isto ele
   ficaria para sempre sem etiqueta, invisivel para a fabrica. */
function atribuirPendentes(){
  return db.transaction(()=>atribuirCodigos(
    d.semCodigo().map(x=>Object.assign({},x,{gera_etiqueta:1}))))();
}

/* ── O QUE ESTE SETOR FAZ ─────────────────────────────────────────────────
   E a linha que importa da etiqueta, e ela e do COMPONENTE, nunca do item: a
   serralheria nao corta 1,000 (a medida acabada), corta 0,970 — que e a
   medida de CORTE do tubo. Os dois numeros da linha nunca fecham, e e a
   armadilha #18 do CLAUDE.md: cortar pela medida de consumo faz a peca nao
   entrar; cobrar pela de corte faz a fabrica parar de pagar o que joga fora. */
function tarefaDe(c){
  /* ⚠️ NO TUBO, O NOME DA PECA E O DEGRAU. "Tubo 32" e "Tubo 41" sao pecas
     diferentes na serralheria — com diametro diferente, comprados separados
     e guardados em lugares diferentes. Escrever so "TUBO" mandaria o
     serralheiro conferir na tela qual e, e a etiqueta existe justamente para
     ele nao precisar. */
  const quem=(c.chave==='tubo'&&c.degrau_nome?c.degrau_nome:c.nome).toUpperCase();
  const l=c.largura_corte_mm, a=c.altura_corte_mm;
  if(l!=null&&a!=null) return quem+' · CORTAR '+u.emMetros(l)+' × '+u.emMetros(a);
  if(l!=null) return quem+' · CORTAR '+u.emMetros(l);
  if(a!=null) return quem+' · CORTAR '+u.emMetros(a);
  return quem;
}

/* A linha de baixo, que muda com o setor. A embalagem precisa saber QUAL kit
   e quantos suportes; a montagem, se esta peca leva reducao de peso. */
function extraDe(c,doItem){
  const partes=[];
  if(c.setor==='embalagem'){
    const kit=doItem.find(x=>x.eh_kit);
    if(kit) partes.push(kit.nome.toUpperCase()+
      (kit.suportes!=null?' · '+kit.suportes+' suportes':''));
  }
  if(c.setor==='montagem'&&doItem.some(x=>x.chave==='reducao'))
    partes.push('REDUÇÃO DE PESO');
  return partes.join(' · ');
}

const COMANDO={direito:'COMANDO DIREITO', esquerdo:'COMANDO ESQUERDO'};

function montar(c,totalDoPedido,doItem){
  return {
    id:c.id, codigo:c.codigo_etiqueta, setor:c.setor, chave:c.chave,
    pedido_id:c.pedido_id, pedido_numero:c.pedido_numero,
    item_n:c.item_n,
    peca:c.item_n+' de '+totalDoPedido,
    revenda:c.revenda_nome,
    prazo:c.prazo_atual?prazo.porExtenso(c.prazo_atual):'',
    medida:u.emMetros(c.largura_mm)+' × '+u.emMetros(c.altura_mm),
    colecao:[c.linha_nome,c.colecao_nome,c.cor_nome].filter(Boolean).join(' '),
    comando:COMANDO[c.comando]||'',
    tarefa:tarefaDe(c),
    extra:extraDe(c,doItem),
    impresso_em:c.impresso_em, reimpressoes:c.reimpressoes
  };
}

const idsDe=pedidos=>(pedidos||[]).map(Number).filter(n=>Number.isInteger(n)&&n>0);

/* ⚠️ SO SAI ETIQUETA COM CODIGO. Componente sem codigo e ou peca que nao
   gera etiqueta (os kits), ou pedido aprovado antes desta fase — e esse o
   backfill resolve. Imprimir um papel sem codigo seria uma etiqueta que a
   fase 5 nao consegue bipar. */
function paraImprimir(filtro){
  const pedidos=idsDe(filtro&&filtro.pedidos);
  exigir(pedidos.length,'sem_pedido','Escolha ao menos um pedido.');
  const setor=String((filtro&&filtro.setor)||'').trim();
  if(setor) exigir(d.setor(setor),'setor_inexistente','O setor "'+setor+'" nao existe no cadastro.');

  const todos=d.componentes(pedidos,null);
  const totais={};
  d.pecasDoPedido(pedidos).forEach(x=>{ totais[x.pedido_id]=x.total; });

  const porItem=new Map();
  todos.forEach(c=>{
    if(!porItem.has(c.item_id)) porItem.set(c.item_id,[]);
    porItem.get(c.item_id).push(c);
  });

  return todos
    .filter(c=>c.codigo_etiqueta&&(!setor||c.setor===setor))
    .map(c=>montar(c,totais[c.pedido_id]||1,porItem.get(c.item_id)||[]));
}

/* ── IMPRIMIR ─────────────────────────────────────────────────────────────
   ⚠️ IMPRIMIR SO MARCA. A segunda vez sai com os MESMOS codigos e conta como
   reimpressao — na etiqueta, no contador da peca e no registro. E a armadilha
   #1-B do CLAUDE.md pela porta da producao: o papel repetido nao cria peca
   nova, como a etiqueta de venda reimpressa nao baixa estoque de novo. */
function imprimir(filtro,usuario){
  const lista=paraImprimir(filtro);
  const setor=String((filtro&&filtro.setor)||'').trim();
  exigir(lista.length,'sem_etiqueta',
    'Nao ha etiqueta '+(setor?'de '+setor+' ':'')+'nestes pedidos. '+
    'So pedido APROVADO tem etiqueta — o enviado ainda espera o vendedor.');

  const reimpressao=lista.every(e=>e.impresso_em);
  const quando=dia.agora();
  return db.transaction(()=>{
    d.marcarImpresso(lista.map(e=>e.id),quando,nome(usuario));
    d.registrar({setor:setor||'todos', quantidade:lista.length,
      pedidos:[...new Set(lista.map(e=>e.pedido_numero))].join(', '),
      reimpressao:reimpressao?1:0, usuario_nome:nome(usuario)});
    /* A lista devolvida e a de ANTES da marcacao, e e a certa: o PDF mostra o
       codigo, que nao mudou. O que mudou foi so o carimbo de impresso. */
    return {etiquetas:lista, reimpressao, quando};
  })();
}

/* A lista da tela: um pedido por linha, com o que cada setor tem e o que ja
   saiu. Sem a contagem de impressas, imprimir o lote duas vezes e o jeito
   mais facil de ter duas etiquetas iguais em duas pecas (secao 4.14). */
function aImprimir(){
  const linhas=d.aImprimir();
  const porPedido=new Map();
  for(const l of linhas){
    if(!porPedido.has(l.pedido_id)) porPedido.set(l.pedido_id,{
      pedido_id:l.pedido_id, pedido_numero:l.pedido_numero,
      revenda_nome:l.revenda_nome, sem_tecido:l.sem_tecido,
      prazo:l.prazo_atual, prazo_extenso:l.prazo_atual?prazo.porExtenso(l.prazo_atual):null,
      dias_uteis_restantes:l.prazo_atual?prazo.diasUteis(dia.hoje(),l.prazo_atual):null,
      setores:{}
    });
    porPedido.get(l.pedido_id).setores[l.setor]={total:l.total, impressas:l.impressas};
  }
  // Os setores que este pedido nao tem aparecem zerados, para a tela nao ter
  // que saber quais existem.
  const todos=setores().map(s=>s.chave);
  const lista=[...porPedido.values()];
  lista.forEach(p=>todos.forEach(s=>{ if(!p.setores[s]) p.setores[s]={total:0,impressas:0}; }));
  return lista;
}

/* ── O PLANO DE CORTE ─────────────────────────────────────────────────────
   As pecas de tecido dos pedidos aprovados, prontas para o `plano.calcular`.

   ⚠️ O QUE VAI PARA O CORTE E A MEDIDA DE CORTE, nunca a acabada. A persiana
   de 1,000 × 1,000 tem tecido de 0,965 × 1,200 — mais estreito porque o tubo
   e as ponteiras entram na conta, e mais alto porque sobra para enrolar. Era
   exatamente isto que o leitor da etiqueta do Decorsoft ja fazia
   (`etiqueta_corte.js`); agora o dado vem do proprio sistema.

   ⚠️ E SAI AGRUPADO POR TECIDO, porque `calcular` recebe UM tecido por plano
   — nao ha emenda, e bobina de cor diferente e outro estoque (§19). */
function paraCortar(filtro){
  const pedidos=idsDe(filtro&&filtro.pedidos);
  if(!pedidos.length) return [];
  const grupos=new Map();
  for(const c of d.componentes(pedidos,'colecao')){
    if(c.chave!=='tecido') continue;
    if(c.largura_corte_mm==null||c.altura_corte_mm==null) continue;
    const k=c.tecido_id||0;
    if(!grupos.has(k)) grupos.set(k,{
      tecido_id:c.tecido_id,
      tecido_nome:[c.linha_nome,c.colecao_nome,c.cor_nome].filter(Boolean).join(' · '),
      pecas:[]});
    grupos.get(k).pecas.push({
      largura:c.largura_corte_mm/1000,
      altura:c.altura_corte_mm/1000,
      /* O PEDIDO e o que agrupa o tom unico (§19), e o CLIENTE aqui e a
         revenda: e ela que ve as persianas lado a lado na parede do cliente
         dela. */
      pedido:String(c.pedido_numero||c.pedido_id),
      cliente:c.revenda_nome,
      codigo:c.codigo_etiqueta, item:c.item_n});
  }
  return [...grupos.values()];
}

const impressoes=limite=>d.impressoes(limite);

module.exports={setores,atribuirCodigos,atribuirPendentes,
  paraImprimir,imprimir,aImprimir,paraCortar,impressoes,tarefaDe};

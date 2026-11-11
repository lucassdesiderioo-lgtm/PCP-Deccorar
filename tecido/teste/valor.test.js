// A REGRA DO VALOR NO SOB MEDIDA (spec ARRUMAR-O-LUGAR, fase 1, R-VAL).
//
// Ate 11/11/2026 uma chave so (`custo.ver`, "Ver preco e valor do estoque")
// liberava DOIS dinheiros diferentes: o preco de venda (o que a revenda paga:
// preco por m², a persiana, o pedido, o boleto, o limite) e o custo (o que o
// rolo custou, o dinheiro parado). O vendedor precisa do primeiro e nao do
// segundo. Decisao do dono: duas chaves.
//
//   podarVenda   corta o preco de venda de quem nao tem `preco.ver`
//   podarCusto   corta o custo de quem nao tem `custo.ver` (nem `rolo.nota`)
//
// E fecha os quatro vazamentos que a varredura achou, de dinheiro que ia pelo
// fio sem chave nenhuma.
const fs=require('fs'), path=require('path');
const custo=require('../dominio/custo');
const {pode,PAPEIS}=require('../nucleo/permissoes');

const SO_PRECO={nome:'Vendedor novo',permissoes:['modulo.entrar','catalogo.ler','pedido.ler','preco.ver']};
const SO_CUSTO={nome:'Estoque',permissoes:['modulo.entrar','rolo.ler','custo.ver']};
const NOTA={nome:'Quem lanca nota',permissoes:['modulo.entrar','rolo.ler','rolo.nota']};
const CORTADOR={nome:'Ana da bancada',papel:'cortador'};
const DIRETOR={nome:'Lucas',papel:'diretor'};

const ROTAS=path.join(__dirname,'..','rotas');
const ler=f=>fs.readFileSync(path.join(ROTAS,f),'utf8');
const rota=(arquivo,metodo,caminho)=>require(path.join(ROTAS,arquivo)).rotas.find(r=>r.metodo===metodo&&r.caminho===caminho);

module.exports=[

{nome:'as duas podas existem, cada uma com a sua chave', executar({igual}){
  const d={preco_m2:10,valor:5,nome:'x'};
  igual('preco_m2' in custo.podarVenda(SO_PRECO,d),true,'quem tem preco.ver ve o preco de venda');
  igual('preco_m2' in custo.podarVenda(SO_CUSTO,d),false,'quem so tem custo.ver NAO ve o preco de venda');
  igual('preco_m2' in custo.podarCusto(SO_CUSTO,d),true,'quem tem custo.ver ve o custo');
  igual('preco_m2' in custo.podarCusto(SO_PRECO,d),false,'quem so tem preco.ver NAO ve o custo');
  igual('preco_m2' in custo.podarCusto(NOTA,d),true,'quem lanca nota ve o custo do que lanca (R-VAL-04)');
  igual('preco_m2' in custo.podarVenda(DIRETOR,d),true,'o diretor ve tudo');
  igual(custo.podarCusto(CORTADOR,d).nome,'x','o que nao e dinheiro passa');
}},

{nome:'a poda de venda tira tambem o preco escrito em texto (o "base" da linha do pedido)', executar({igual}){
  const pedido={itens:[{linhas:[{nome:'Tecido',base:'1,2 m² × R$ 110,00/m²',valor_centavos:13200}]}]};
  const p=custo.podarVenda(SO_CUSTO,pedido);
  igual(JSON.stringify(p).indexOf('R$'),-1,'nenhum R$ sobra no pedido de quem nao ve o preco');
  igual(custo.podarVenda(SO_PRECO,pedido).itens[0].linhas[0].base,'1,2 m² × R$ 110,00/m²','quem ve o preco continua lendo a conta');
}},

{nome:'cada rota usa a poda do lado dela, e a poda unica de antes saiu', executar({igual}){
  const VENDA=['catalogo_sm.js','pedido.js','kanban.js','indicadores.js','boleto.js','revenda.js'];
  const CUSTO=['rolos.js','sobras.js','cadastros.js','painel.js','etiqueta_producao.js'];
  for(const f of VENDA) igual(/podarVenda\b/.test(ler(f)),true,f+' poda pelo preco de venda');
  for(const f of CUSTO) igual(/podarCusto\b/.test(ler(f)),true,f+' poda pelo custo');
  for(const f of VENDA.concat(CUSTO)) igual(/custo\.podar\(|\bpodar=custo\.podar\b/.test(ler(f)),false,f+' nao usa mais a poda unica');
  igual(/pode\(usuario,'custo\.ver'\)/.test(ler('painel.js')),false,'o painel nao testa custo.ver na mao (quem lanca nota tambem ve)');
}},

{nome:'as chaves: preco.ver existe, e sensivel e de operacao; o vendedor a tem e a bancada nao', executar({igual}){
  const {CHAVES}=require('../nucleo/permissoes');
  const pv=CHAVES.find(c=>c.chave==='preco.ver');
  igual(!!pv,true,'a chave existe');
  igual(pv.sensivel,true,'e sensivel');
  igual(pv.nivel,'operacao','e de operacao (o vendedor e operacao)');
  igual(/custo e valor do estoque/i.test(CHAVES.find(c=>c.chave==='custo.ver').nome),true,'custo.ver mudou so o rotulo');
  igual(pode({papel:'vendedor'},'preco.ver'),true,'o vendedor tem preco.ver');
  igual(pode({papel:'cortador'},'preco.ver'),false,'o cortador nao');
  igual(PAPEIS.producao.indexOf('preco.ver'),-1,'a producao nao');
}},

{nome:'⚠️ VAZAMENTO 1: o pedido de descarte nao manda o valor da sobra a bancada', executar({igual}){
  const aprovacao=require('../dominio/aprovacao'), sobra=require('../dominio/sobra');
  const p0=aprovacao.pendentes, s0=sobra.porId;
  aprovacao.pendentes=()=>[{id:9,alvo_id:1,motivo:'rasgada'}];
  sobra.porId=()=>({id:1,codigo:'S-000001',preco_m2:20,preco_rolo_m2:20,preco_tecido_m2:18,valor:8});
  try{
    const r=rota('sobras.js','GET','/api/sobras/descartes');
    const cort=r.manipulador({usuario:CORTADOR,params:{},query:{},corpo:{}});
    igual(JSON.stringify(cort).search(/preco|valor/),-1,'o cortador recebe a sobra sem preco nem valor');
    const dir=r.manipulador({usuario:DIRETOR,params:{},query:{},corpo:{}});
    igual(dir[0].sobra.valor,8,'quem ve custo continua vendo');
  } finally { aprovacao.pendentes=p0; sobra.porId=s0; }
}},

{nome:'⚠️ VAZAMENTO 2: o historico do rolo nao manda NF, fornecedor e preco a bancada', executar({igual}){
  const rolo=require('../dominio/rolo');
  const m0=rolo.movimentos;
  rolo.movimentos=()=>[{id:1,motivo:'nota',delta:0,observacao:'NF: — -> 123 · fornecedor: — -> Ecotex · preco/m²: — -> 20'},
                       {id:2,motivo:'corte',delta:-3,observacao:'pedido 5001'}];
  try{
    const r=rota('rolos.js','GET','/api/rolos/:id/movimentos');
    const cort=r.manipulador({usuario:CORTADOR,params:{id:1},query:{},corpo:{}});
    igual(/preco|NF:|Ecotex/.test(JSON.stringify(cort)),false,'a observacao da nota nao sai para quem nao ve custo');
    igual(cort.length,2,'mas a linha continua la (o historico nao some)');
    igual(cort[1].observacao,'pedido 5001','e a observacao que nao e dinheiro fica');
    const nota=r.manipulador({usuario:NOTA,params:{id:1},query:{},corpo:{}});
    igual(/Ecotex/.test(nota[0].observacao),true,'quem lanca nota le o que lancou');
  } finally { rolo.movimentos=m0; }
}},

{nome:'⚠️ VAZAMENTO 3: o PDF do pedido (com os R$) so sai para quem ve o preco de venda', executar({recusa,igual}){
  const r=rota('pedido.js','GET','/api/pedidos/:id/pdf');
  recusa(()=>r.manipulador({usuario:SO_CUSTO,params:{id:1},query:{},corpo:{}}),'sem_valor','sem preco.ver, recusa dizendo por que');
  igual(/vePreco\(usuario\)/.test(ler('pedido.js')),true,'a rota do PDF confere a preco.ver (custo.vePreco)');
}},

{nome:'③ REVISAO S1: o total do pedido escrito no marco "enviado" nao viaja a quem nao ve o preco', executar({igual}){
  const pedido=require('../dominio/pedido');
  const p0=pedido.porId;
  pedido.porId=()=>({id:1,numero:5001,valor_total_centavos:123456,
    marcos:[{marco:'enviado',detalhe:'pedido 5001 · 1.234,56 · pronto 20/11'},{marco:'aprovado',detalhe:'aprovado por Lucas'}]});
  try{
    const r=rota('pedido.js','GET','/api/pedidos/:id');
    const so=r.manipulador({usuario:SO_CUSTO,params:{id:1},query:{},corpo:{}});
    igual(/1\.234,56/.test(JSON.stringify(so)),false,'o total nao sobra no historico');
    igual(so.marcos.length,2,'mas o marco continua la');
    igual(so.marcos[1].detalhe,'aprovado por Lucas','e o detalhe que nao e dinheiro fica');
    const com=r.manipulador({usuario:SO_PRECO,params:{id:1},query:{},corpo:{}});
    igual(com.marcos[0].detalhe,'pedido 5001 · 1.234,56 · pronto 20/11','quem ve o preco le o historico inteiro');
  } finally { pedido.porId=p0; }
}},

{nome:'③ REVISAO S3: quem lanca preco, boleto ou limite ve o preco de venda (R-VAL-04)', executar({igual}){
  for(const c of ['catalogo.editar','boleto.editar','credito.editar'])
    igual('preco_m2_centavos' in custo.podarVenda({permissoes:['modulo.entrar',c]},{preco_m2_centavos:1}),true,c+' ve o que lanca');
  igual(custo.vePreco({permissoes:['modulo.entrar','pedido.lancar']}),false,'quem so monta pedido nao (o preco e calculado, nao lancado)');
}},

{nome:'③ REVISAO S4: o botao da folha do pedido so aparece quando o preco veio', executar({igual}){
  const html=fs.readFileSync(path.join(__dirname,'..','public','telas','pedidos.html'),'utf8');
  igual(/'valor_total_centavos' in p\)?\s*\n?\s*bt\('Abrir a folha/.test(html)||/p\.congelado&&'valor_total_centavos' in p/.test(html),true,'o botao olha o campo que o servidor deixou passar');
}},

{nome:'③ REVISAO T1: a 611 nao quebra quando o preco nao vem (o objeto preco some na poda)', executar({igual}){
  const html=fs.readFileSync(path.join(__dirname,'..','public','telas','pedidos.html'),'utf8');
  igual(/if\(!pr\) linhaTot\('Total Deccorar','—'\)/.test(html),true,'sem preco, o total e "—" e a tela segue (o Enviar e o Historico continuam)');
}},

{nome:'⚠️ VAZAMENTO 4: o pedido sai sem o preco escrito na conta (base) para quem nao ve o preco', executar({igual}){
  // A poda e a podarVenda (caso 2); aqui so a garantia de que o pedido passa por ela.
  igual(/podar=\(u,d\)=>custo\.podarVenda\(u,d\)|podarVenda/.test(ler('pedido.js')),true,'a rota do pedido usa a poda de venda');
}}

];

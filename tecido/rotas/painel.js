// Painel e relatorios. So leitura.
const painel=require('../dominio/painel');
const giro=require('../dominio/giro');
const gerencial=require('../dominio/gerencial');
const custo=require('../dominio/custo');
const {pode}=require('../nucleo/permissoes');

/* ── CACHE CURTO, LOCAL DA ROTA ───────────────────────────────────────────
   O painel gerencial varre movimento e rolo inteiros e cruza os dois. Hoje
   sao dezenas de linhas e isso e instantaneo; com dois anos de corte deixa
   de ser, e a tela recarrega a cada troca de filtro.

   LOCAL DA ROTA, e nao dentro do dominio, pela mesma razao do painel_route
   do PCP (CLAUDE.md §18): quem decide compra ou lanca preco precisa do
   numero fresco, e um cache escondido no dominio entregaria dado velho para
   eles sem avisar. Aqui ele so serve a tela, que se recarrega sozinha. */
const CACHE_MS=15000;
const cache=new Map();
function comCache(chave,calcular){
  const agora=Date.now();
  const v=cache.get(chave);
  if(v&&agora-v.quando<CACHE_MS) return v.dados;
  const dados=calcular();
  cache.set(chave,{quando:agora,dados});
  // A limpeza e por tamanho, e nao por tempo: sem ela cada combinacao de
  // filtro deixaria uma entrada viva para sempre.
  if(cache.size>40) for(const k of cache.keys()){ cache.delete(k); if(cache.size<=20) break; }
  return dados;
}

module.exports={rotas:[
  /* O PAINEL GERENCIAL. Grao tecido x largura, consolidados derivados dele.
     A poda do preco vale aqui: valor de estoque e preco, e quem nao tem
     custo.ver recebe o JSON sem os campos — nao adianta esconder na tela e
     mandar pelo fio (CLAUDE.md §13, regra 14). */
  {metodo:'GET', caminho:'/api/painel/gerencial', permissao:'painel.ler',
   manipulador:({query,usuario})=>{
     const f={linha:query.linha,abertura:query.abertura,cor:query.cor,largura:query.largura};
     const chave=[query.dias,f.linha,f.abertura,f.cor,f.largura].join('|');
     const d=comCache(chave,()=>gerencial.painel(query.dias,f));
     return pode(usuario,'custo.ver')?d:custo.semPreco(d);
   }},

  /* O GIRO: o que sai, quanto por dia, e quanto tempo o estoque aguenta.
     A poda do preco vale aqui tambem — a lista "sem saida" carrega o valor
     parado, e valor e preco. Quem nao tem custo.ver recebe o JSON sem ele. */
  {metodo:'GET', caminho:'/api/painel/giro', permissao:'painel.ler',
   manipulador:({query,usuario})=>{
     const d=giro.painel(query.dias);
     return pode(usuario,'custo.ver')?d:custo.semPreco(d);
   }},

  {metodo:'GET', caminho:'/api/painel/estoque',  permissao:'painel.ler', manipulador:()=>painel.estoque()},
  {metodo:'GET', caminho:'/api/painel/encalhe',  permissao:'painel.ler', manipulador:({query})=>painel.encalhe(query.limite)},
  {metodo:'GET', caminho:'/api/painel/refugo',   permissao:'painel.ler', manipulador:()=>painel.refugo()},
  {metodo:'GET', caminho:'/api/painel/recusas',  permissao:'painel.ler', manipulador:()=>painel.recusas()},
  {metodo:'GET', caminho:'/api/painel/cortes',   permissao:'painel.ler', manipulador:()=>painel.cortes()}
]};

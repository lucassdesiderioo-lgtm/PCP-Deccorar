// DE QUEM O ROLO VEIO.
//
// Era texto livre na entrada, e texto livre nao compara: 'Ecotex', 'ecotex' e
// 'Ecotex Ltda' somam separado. E o mesmo defeito de '2,5' e '2,50' virarem
// duas bobinas — com o agravante de que aqui o erro so aparece meses depois,
// na hora de responder "qual fornecedor esta mais caro".
//
// ⚠️ NAO HA PRECO AQUI, E ISSO E DECISAO. A tentacao e uma coluna
// `preco_m2` no fornecedor. Duas coisas quebrariam:
//   1. o preco varia por TECIDO — o mesmo fornecedor nao cobra igual por
//      blackout e por screen;
//   2. uma tabela mantida a mao envelhece calada, e o numero fica la
//      parecendo atual.
// O preco mora no ROLO, congelado na compra (dominio/custo.js), e o que
// pre-preenche a proxima entrada e o ULTIMO PRECO REALMENTE PAGO.
const {ErroDeRegra,exigir}=require('../nucleo/erros');
const {pode}=require('../nucleo/permissoes');
const db=require('../nucleo/db');
const dia=require('../nucleo/dia');
const dFornecedor=require('../dados/fornecedor');

// A mesma marca do endereco: a bancada cria, a chefia confere depois.
const marca=usuario=>({
  criado_por: usuario&&usuario.nome||null,
  criado_em: dia.agora(),
  conferir: pode(usuario,'cadastro.editar')?0:1
});

const limpo=nome=>{
  const n=String(nome||'').trim();
  exigir(n,'nome_vazio','Informe o nome do fornecedor.');
  return n;
};

function criar(dados,usuario){
  const nome=limpo(dados.nome);
  const ja=dFornecedor.listar().find(f=>f.nome.toLowerCase()===nome.toLowerCase());
  if(ja){
    // Ja existe, so estava desligado: religa em vez de recusar — recusar
    // mandaria a pessoa procurar numa lista onde ele nao aparece.
    if(!ja.ativo) return dFornecedor.atualizar(ja.id,{ativo:1});
    throw new ErroDeRegra('fornecedor_repetido','O fornecedor "'+nome+'" ja esta cadastrado.');
  }
  return dFornecedor.criar({nome,...marca(usuario)});
}

function renomear(id,nome){
  const n=limpo(nome);
  const atual=dFornecedor.porId(id);
  exigir(atual,'fornecedor_inexistente','Fornecedor nao encontrado.');
  if(dFornecedor.listar().some(f=>f.id!==atual.id&&f.nome.toLowerCase()===n.toLowerCase()))
    throw new ErroDeRegra('fornecedor_repetido','O fornecedor "'+n+'" ja existe.');
  return dFornecedor.atualizar(id,{nome:n});
}

/* A lista com QUANTOS ROLOS cada um trouxe. E o numero que separa fornecedor
   de verdade de linha duplicada da migracao ('Ecotex' com 12 rolos e 'ecotex'
   com 1 diz sozinho qual e qual). */
const listar=()=>{
  const conta=db.prepare(`SELECT fornecedor_id id, COUNT(*) rolos,
      SUM(CASE WHEN status<>'encerrado' THEN 1 ELSE 0 END) em_estoque
    FROM rolo WHERE fornecedor_id IS NOT NULL GROUP BY fornecedor_id`).all();
  const porId=new Map(conta.map(c=>[c.id,c]));
  return dFornecedor.listar().map(f=>({...f, ...(porId.get(f.id)||{rolos:0,em_estoque:0})}));
};

module.exports={criar,renomear,listar,ativos:()=>dFornecedor.ativos(),
                porId:id=>dFornecedor.porId(id),
                atualizar:(id,d)=>dFornecedor.atualizar(id,d)};

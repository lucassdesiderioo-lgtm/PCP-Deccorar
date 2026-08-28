// Motivos de recusa e condicoes de sobra — os dois cadastros que o plano de
// corte le como REGRA, nao como texto.
//
// O motivo da recusa e o diagnostico do reaproveitamento: se em tres meses
// "tonalidade" dominar, a resposta e registrar o tom no cadastro da sobra; se
// for "defeito nao cadastrado", o problema esta no lancamento na bancada. Por
// isso a lista e cadastro — o diretor acrescenta o que aparecer, sem deploy.
const {ErroDeRegra,exigir}=require('../nucleo/erros');
const dMotivo=require('../dados/motivo_recusa');
const dCondicao=require('../dados/condicao_sobra');

function criarMotivo(dados){
  const nome=String(dados.nome||'').trim();
  exigir(nome,'nome_vazio','Informe o motivo.');
  if(dMotivo.listar().some(m=>m.nome.toLowerCase()===nome.toLowerCase()))
    throw new ErroDeRegra('motivo_repetido','O motivo "'+nome+'" ja existe.');
  return dMotivo.criar({nome,ordem:dados.ordem});
}

function atualizarCondicao(chave,dados){
  const c=dCondicao.porChave(chave);
  exigir(c,'condicao_inexistente','Condicao nao encontrada.');
  return dCondicao.atualizar(chave,dados);
}

module.exports={
  criarMotivo,
  listarMotivos:()=>dMotivo.listar(),
  motivosAtivos:()=>dMotivo.ativos(),
  atualizarMotivo:(id,d)=>{
    exigir(dMotivo.porId(id),'motivo_inexistente','Motivo nao encontrado.');
    return dMotivo.atualizar(id,d);
  },
  listarCondicoes:()=>dCondicao.listar(),
  condicoesAtivas:()=>dCondicao.ativas(),
  atualizarCondicao
};

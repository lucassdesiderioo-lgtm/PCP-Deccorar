// A regra do cadastro de tecido. Nao conhece Express, req nem res.
//
// R1: item de tecido = linha + abertura + cor, tres cadastros livres.
// R2: a largura da bobina NAO mora aqui — ela e do rolo. O que fica no
//     tecido e uma sugestao para pre-preencher a entrada.
// R3: permite_girar = 0 por padrao (o tecido tem sentido). E filtro vivo no
//     plano de corte, nao enfeite de cadastro.
const {ErroDeRegra,exigir}=require('../nucleo/erros');
const dLinha=require('../dados/linha');
const dAbertura=require('../dados/abertura');
const dCor=require('../dados/cor');
const dTecido=require('../dados/tecido');

// 'Rolô' -> 'ROLO'  ·  '3%' -> '3'  ·  'Tom Pérola' -> 'TOMPEROLA'
function chaveDe(texto){
  return String(texto||'').normalize('NFD').replace(/[\u0300-\u036f]/g,'')
    .toUpperCase().replace(/[^A-Z0-9]/g,'');
}

function codigoDe(linha,abertura,cor){
  const base=[chaveDe(linha.nome),chaveDe(abertura.nome),chaveDe(cor.nome)].join('-');
  // Duas combinacoes diferentes podem cair no mesmo texto ('3%' e '3'). O
  // codigo e etiqueta de leitura; o que identifica de verdade e o trio de ids.
  let codigo=base, n=1;
  while(dTecido.porCodigo(codigo)) codigo=base+'-'+(++n);
  return codigo;
}

const nomeLimpo=(nome,oque)=>{
  const n=String(nome||'').trim();
  exigir(n,'nome_vazio','Informe o nome d'+oque+'.');
  return n;
};

// ── Linha ────────────────────────────────────────────────────────────────
function criarLinha(dados){
  const nome=nomeLimpo(dados.nome,'a linha');
  if(dLinha.listar().some(l=>l.nome.toLowerCase()===nome.toLowerCase()))
    throw new ErroDeRegra('linha_repetida','A linha "'+nome+'" ja existe.');
  return dLinha.criar({nome,ordem:dados.ordem});
}

// ── Abertura ─────────────────────────────────────────────────────────────
function criarAbertura(dados){
  const nome=nomeLimpo(dados.nome,'a abertura');
  const linha=dLinha.porId(dados.linha_id);
  exigir(linha,'linha_inexistente','Escolha uma linha para esta abertura.');
  if(dAbertura.listar(linha.id).some(a=>a.nome.toLowerCase()===nome.toLowerCase()))
    throw new ErroDeRegra('abertura_repetida','A linha '+linha.nome+' ja tem a abertura "'+nome+'".');
  return dAbertura.criar({nome,linha_id:linha.id,ordem:dados.ordem});
}

// ── Cor ──────────────────────────────────────────────────────────────────
function criarCor(dados){
  const nome=nomeLimpo(dados.nome,'a cor');
  if(dCor.listar().some(c=>c.nome.toLowerCase()===nome.toLowerCase()))
    throw new ErroDeRegra('cor_repetida','A cor "'+nome+'" ja existe.');
  return dCor.criar({nome,ordem:dados.ordem});
}

// ── Item de tecido ───────────────────────────────────────────────────────
function criarTecido(dados){
  const linha=dLinha.porId(dados.linha_id);
  const abertura=dAbertura.porId(dados.abertura_id);
  const cor=dCor.porId(dados.cor_id);
  exigir(linha,'linha_inexistente','Escolha a linha.');
  exigir(abertura,'abertura_inexistente','Escolha a abertura.');
  exigir(cor,'cor_inexistente','Escolha a cor.');
  exigir(abertura.linha_id===linha.id,'abertura_de_outra_linha',
    'A abertura "'+abertura.nome+'" nao pertence a linha '+linha.nome+'.');

  const ja=dTecido.porCombinacao(linha.id,abertura.id,cor.id);
  if(ja) throw new ErroDeRegra('tecido_repetido',
    'O tecido '+linha.nome+' · '+abertura.nome+' · '+cor.nome+' ja esta cadastrado ('+ja.codigo+').');

  let largura=null;
  if(dados.largura_sugerida!==undefined&&dados.largura_sugerida!==null&&dados.largura_sugerida!==''){
    largura=Number(String(dados.largura_sugerida).replace(',','.'));
    exigir(isFinite(largura)&&largura>0,'largura_invalida','A largura sugerida tem que ser um numero em metros (ex.: 2,50).');
  }

  return dTecido.criar({
    codigo:codigoDe(linha,abertura,cor),
    linha_id:linha.id, abertura_id:abertura.id, cor_id:cor.id,
    largura_sugerida:largura, permite_girar:dados.permite_girar
  });
}

// Nome de tela do tecido, num lugar so: 'Rolo · 3% · Bege'.
const descrever=t=>t?[t.linha_nome,t.abertura_nome,t.cor_nome].filter(Boolean).join(' · '):'';

module.exports={
  criarLinha, criarAbertura, criarCor, criarTecido,
  chaveDe, descrever,
  listarLinhas:()=>dLinha.listar(),
  listarAberturas:linha_id=>dAbertura.listar(linha_id),
  listarCores:()=>dCor.listar(),
  listarTecidos:()=>dTecido.listar(),
  porId:id=>dTecido.porId(id),
  atualizarTecido:(id,d)=>{
    exigir(dTecido.porId(id),'tecido_inexistente','Tecido nao encontrado.');
    return dTecido.atualizar(id,d);
  }
};

// O leitor da etiqueta de producao.
//
// O PDF do teste e MONTADO AQUI, no formato real do gerador (Decorsoft):
// quatro vias por item, texto em UTF-16BE, fluxo comprimido. Guardar uma
// etiqueta de verdade no repositorio significaria versionar nome de cliente
// — e o teste nao precisa disso para provar que o leitor funciona.
const zlib=require('zlib');
const {lerPecas,casarTecido}=require('../dominio/etiqueta_corte');

// Monta um PDF minimo com estas linhas de texto.
function pdfDe(linhas){
  const corpo=linhas.map(l=>{
    const utf16=Buffer.from('﻿'+l,'utf16le').swap16();
    const escapado=[];
    for(const b of utf16){
      if(b===0x28||b===0x29||b===0x5c) escapado.push(0x5c);
      escapado.push(b);
    }
    return Buffer.concat([Buffer.from('BT ('),Buffer.from(escapado),Buffer.from(') Tj ET\n')]);
  });
  const fluxo=zlib.deflateSync(Buffer.concat(corpo));
  return Buffer.concat([
    Buffer.from('%PDF-1.4\n1 0 obj<</Length '+fluxo.length+'/Filter/FlateDecode>>stream\n'),
    fluxo,
    Buffer.from('\nendstream endobj\ntrailer<<>>\n%%EOF\n')
  ]);
}

// Uma etiqueta completa: as quatro vias, como sai da impressora.
const etiqueta=(pedido,item,cliente,tecido,acabLarg,acabAlt,corteLarg,corteAlt)=>{
  const cab=[pedido+'-'+item,'01/01',cliente];
  const meio=['ROLO SOB MEDIDA - '+tecido,acabLarg,'X',acabAlt,'TC:1.300','CM: Lado Direito'];
  const area=(Number(corteLarg)*Number(corteAlt)).toFixed(3);
  return [
    ...cab,'BASE','1',...meio,'6344 - BASE CONICA BRANCO AC403 6M','1.470 ML  - RL: PADRÃO - SALA',
    ...cab,'COLEÇÃO','2',...meio,tecido,area+' M2 - ('+corteLarg+'x'+corteAlt+') - RL: PADRÃO - SALA',
    ...cab,'EMBALAGEM','3',...meio,'EMBALAGEM BOBINA PEQ.','1.800 ML ('+acabLarg+'x'+acabAlt+')',
    ...cab,'PERFIL','4',...meio,'6338 - TUBO 32MM','1.470 ML (L=1.470)'
  ];
};

module.exports=[

{nome:'le a MEDIDA DO CORTE, nao a da persiana acabada', executar({igual,perto}){
  const pdf=pdfDe(etiqueta('4292','1','FULANO DE TAL','SCREEN 1% BRANCO 3.00M',
    '1.500','1.400','1.465','1.650'));
  const pecas=lerPecas(pdf);
  igual(pecas.length,1,'uma peca, nao quatro (as vias repetem o cabecalho)');
  perto(pecas[0].largura,1.465,'largura do CORTE');
  perto(pecas[0].altura,1.650,'altura do CORTE');
  // A acabada e 1,500 x 1,400: menor altura e maior largura. Cortar por ela
  // erraria as duas dimensoes, e para lados diferentes.
  perto(pecas[0].acabada.largura,1.500,'a acabada fica guardada, so para conferir');
  perto(pecas[0].acabada.altura,1.400,'idem');
}},

{nome:'traz pedido, cliente e o texto do tecido', executar({igual}){
  const pdf=pdfDe(etiqueta('4292','1','FULANO DE TAL','SCREEN 1% BRANCO 3.00M',
    '1.500','1.400','1.465','1.650'));
  const p=lerPecas(pdf)[0];
  igual(p.pedido,'4292-1','pedido com o item');
  igual(p.cliente,'FULANO DE TAL','cliente');
  igual(p.tecido_texto,'SCREEN 1% BRANCO 3.00M','tecido');
}},

{nome:'varios itens do mesmo pedido viram varias pecas', executar({igual}){
  const pdf=pdfDe([].concat(
    etiqueta('4300','1','CLIENTE UM','SCREEN 1% BRANCO 3.00M','1.500','1.400','1.465','1.650'),
    etiqueta('4300','2','CLIENTE UM','SCREEN 1% BRANCO 3.00M','2.000','1.800','1.965','2.050'),
    etiqueta('4301','1','CLIENTE DOIS','SCREEN 3% BEGE 2.50M','1.200','1.100','1.165','1.350')));
  const pecas=lerPecas(pdf);
  igual(pecas.length,3,'tres pecas');
  igual(pecas.map(p=>p.pedido).join(' '),'4300-1 4300-2 4301-1','os pedidos, na ordem');
  // Os dois itens do 4300 sao do mesmo cliente e viram grupos DIFERENTES
  // ('4300-1' e '4300-2'). Se o dono quiser que o pedido inteiro ande junto,
  // basta apagar o sufixo do item na grade — a tela deixa editar.
}},

{nome:'casa o tecido da etiqueta com o cadastro', executar({igual}){
  const cadastro=[
    {id:7,ativo:1,linha_nome:'Rolô',abertura_nome:'Screen 1%',cor_nome:'Branco'},
    {id:8,ativo:1,linha_nome:'Rolô',abertura_nome:'Screen 3%',cor_nome:'Bege'}
  ];
  igual(casarTecido('SCREEN 1% BRANCO 3.00M',cadastro).id,7,'achou o certo');
  igual(casarTecido('SCREEN 3% BEGE 2.50M',cadastro).id,8,'e o outro tambem');
  igual(casarTecido('LINHO CRU',cadastro),null,'o que nao existe nao e chutado');
}},

{nome:'arquivo que nao e a etiqueta recusa com frase humana', executar({recusa}){
  recusa(()=>lerPecas(pdfDe(['UM PDF QUALQUER','SEM ETIQUETA NENHUMA'])),'sem_colecao');
  recusa(()=>lerPecas(Buffer.from('nem PDF isto e')),'arquivo_ilegivel');
}},

{nome:'a via COLEÇÃO e a unica lida — tubo e base nao viram peca', executar({igual}){
  // As outras vias tambem trazem numeros entre parenteses: a EMBALAGEM traz
  // (1.500x1.400) e o PERFIL traz (L=1.470). Se o leitor pegasse qualquer
  // parentese, cortaria pela medida da embalagem.
  const pdf=pdfDe(etiqueta('4292','1','FULANO','SCREEN 1% BRANCO 3.00M',
    '1.500','1.400','1.465','1.650'));
  const pecas=lerPecas(pdf);
  igual(pecas.length,1,'so a COLEÇÃO virou peca');
  igual(pecas[0].largura===1.5,false,'e nao pegou a medida da via EMBALAGEM');
}}

];

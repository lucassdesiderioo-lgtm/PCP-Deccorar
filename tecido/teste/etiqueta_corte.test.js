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

// Uma PECA completa: as quatro vias, como saem da impressora. 'seq' e a
// posicao da peca dentro do pedido (03/11) — um item pode ter varias.
const etiqueta=(pedido,item,cliente,tecido,acabLarg,acabAlt,corteLarg,corteAlt,seq,codigo)=>{
  const cab=[pedido+'-'+item,seq||'01/01',cliente];
  const meio=['ROLO SOB MEDIDA - '+tecido,acabLarg,'X',acabAlt,'TC:1.300','CM: Lado Direito'];
  const area=(Number(corteLarg)*Number(corteAlt)).toFixed(3);
  // O rodape se repete em CADA via, como no arquivo real: e ali que fica o
  // codigo proprio da peca.
  const pe=[codigo||'4541','DECCORAR.COM','40.119.477/0001-05'];
  return [
    ...cab,'BASE','1',...meio,'6344 - BASE CONICA BRANCO AC403 6M','1.470 ML  - RL: PADRÃO - SALA',...pe,
    ...cab,'COLEÇÃO','2',...meio,tecido,area+' M2 - ('+corteLarg+'x'+corteAlt+') - RL: PADRÃO - SALA',...pe,
    ...cab,'EMBALAGEM','3',...meio,'EMBALAGEM BOBINA PEQ.','1.800 ML ('+acabLarg+'x'+acabAlt+')',...pe,
    ...cab,'PERFIL','4',...meio,'6338 - TUBO 32MM','1.470 ML (L=1.470)',...pe
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

{nome:'traz pedido, item, cliente e o texto do tecido', executar({igual}){
  const pdf=pdfDe(etiqueta('4292','1','FULANO DE TAL','SCREEN 1% BRANCO 3.00M',
    '1.500','1.400','1.465','1.650'));
  const p=lerPecas(pdf)[0];
  // O PEDIDO e o que agrupa no tom unico; o item so identifica.
  igual(p.pedido,'4292','pedido');
  igual(p.item,'1','item');
  igual(p.pedido_item,'4292-1','os dois juntos, para a tela');
  igual(p.cliente,'FULANO DE TAL','cliente');
  igual(p.tecido_texto,'SCREEN 1% BRANCO 3.00M','tecido');
}},

{nome:'UM ITEM COM VARIAS PECAS vira varias pecas, nao uma', executar({igual}){
  // O item 4272-14 do pedido real tem TRES persianas iguais: 09/11, 10/11 e
  // 11/11, cada uma com o seu jogo de vias e o seu codigo. Contar por item
  // cortaria uma so e faltariam duas na obra.
  const pdf=pdfDe([].concat(
    etiqueta('4272','14','ROGERIO','SCREEN 1% BRANCO 3.00M','1.530','2.480','1.495','2.730','09/11','4547'),
    etiqueta('4272','14','ROGERIO','SCREEN 1% BRANCO 3.00M','1.530','2.480','1.495','2.730','10/11','4548'),
    etiqueta('4272','14','ROGERIO','SCREEN 1% BRANCO 3.00M','1.530','2.480','1.495','2.730','11/11','4549')));
  const pecas=lerPecas(pdf);
  igual(pecas.length,3,'tres pecas do mesmo item');
  igual(pecas.map(p=>p.sequencia).join(' '),'09/11 10/11 11/11','cada uma com a sua posicao');
  igual(pecas.map(p=>p.codigo).join(' '),'4547 4548 4549','e o seu codigo de etiqueta');
  igual(new Set(pecas.map(p=>p.pedido)).size,1,'e todas do MESMO pedido — saem juntas');
}},

{nome:'varios itens do mesmo pedido viram varias pecas', executar({igual}){
  const pdf=pdfDe([].concat(
    etiqueta('4300','1','CLIENTE UM','SCREEN 1% BRANCO 3.00M','1.500','1.400','1.465','1.650','01/03','1'),
    etiqueta('4300','2','CLIENTE UM','SCREEN 1% BRANCO 3.00M','2.000','1.800','1.965','2.050','02/03','2'),
    etiqueta('4301','1','CLIENTE DOIS','SCREEN 3% BEGE 2.50M','1.200','1.100','1.165','1.350','01/01','3')));
  const pecas=lerPecas(pdf);
  igual(pecas.length,3,'tres pecas');
  igual(pecas.map(p=>p.pedido_item).join(' '),'4300-1 4300-2 4301-1','os itens, na ordem');
  // Os dois itens do 4300 sao do mesmo pedido: MESMO GRUPO de tom, mesmo
  // sendo janelas diferentes da casa. O 4301 e outro cliente, outro grupo.
  igual(new Set(pecas.map(p=>p.pedido)).size,2,'dois pedidos, dois grupos de tom');
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

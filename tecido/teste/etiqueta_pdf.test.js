// A ETIQUETA EM PDF — 100 x 35 mm, uma por pagina.
//
// A medida esta travada aqui porque o erro dela e caro e silencioso: o PDF
// sai, o operador manda para a Zebra, e so na bancada se descobre que a
// pagina nao bate com a bobina — com o rolo ja gasto. Nada na tela avisaria.
const {PDFDocument}=require('pdf-lib');
const pdf=require('../dominio/etiqueta_pdf');

const MM=72/25.4;
const emMm=pt=>pt/72*25.4;

module.exports=[

{nome:'cada pagina tem 100 x 35 mm, na bobina que a fabrica usa', async executar({igual,perto}){
  const arquivo=await pdf.gerar(['S-000007','S-000008','S-000009']);
  const doc=await PDFDocument.load(arquivo);
  igual(doc.getPageCount(),3,'uma pagina por etiqueta');
  doc.getPages().forEach((p,i)=>{
    const {width,height}=p.getSize();
    perto(emMm(width),100,'pagina '+(i+1)+': largura em mm');
    perto(emMm(height),35,'pagina '+(i+1)+': altura em mm');
  });
  // UMA POR PAGINA, e nao tres numa folha: a Zebra avanca uma etiqueta por
  // pagina. Duas etiquetas na mesma pagina sairiam impressas por cima da
  // picotagem da bobina.
}},

{nome:'o modulo nao encolhe abaixo do que a Zebra imprime', executar({igual}){
  // A 203 dpi, 1 mm sao 8 pontos de impressao. Abaixo de 0,25 mm o modulo
  // vira 2 pontos e a leitura passa a falhar em etiqueta amassada — que e o
  // estado normal de uma etiqueta na prateleira.
  const m=pdf.moduloPara('S-000007');
  igual(m.cabe,true,'o codigo da sobra cabe');
  igual(m.mm>=pdf.MODULO_MIN_MM,true,'e o modulo fica acima do minimo: '+m.mm+' mm');
}},

{nome:'codigo comprido demais e ACUSADO, nao impresso pequeno', executar({igual}){
  // O desfecho ruim aqui nao e o erro: e a etiqueta sair bonitinha, colada na
  // peca, e nao bipar. Ela tem que sair marcada.
  const curto=pdf.moduloPara('S-000007');
  const longo=pdf.moduloPara('S-000007-COM-UM-CODIGO-MUITO-MAIS-LONGO-QUE-O-NORMAL-DA-CASA');
  igual(curto.cabe,true,'o codigo normal cabe');
  igual(longo.cabe,false,'o exagerado nao cabe, e o sistema sabe disso');
}},

{nome:'as barras do PDF sao as MESMAS da tela', executar({igual}){
  // public/barras.js serve as duas pontas de proposito. Duas tabelas CODE128
  // seriam duas etiquetas diferentes para o mesmo codigo, e a divergencia so
  // apareceria na bancada.
  const barras=require('../public/barras.js');
  igual(typeof barras.modulos,'function','o servidor alcanca o gerador da tela');
  igual(barras.modulos('S-000007').length,123,'o desenho do codigo e o conhecido');
}},

{nome:'lote vazio nao gera PDF em branco', async executar({igual}){
  let deu=false;
  try{ await pdf.gerar([]); }catch(e){ deu=true; }
  igual(deu,true,'recusa em vez de devolver arquivo vazio');
  // PDF de zero paginas abriria no navegador sem dizer nada, e o operador
  // ficaria olhando uma tela branca sem saber se o erro foi dele.
}}

];

// A ETIQUETA EM PDF, com as medidas vindas do CADASTRO.
//
// O que estes casos protegem: campo editavel quer dizer que alguem VAI
// digitar 40 mm de barra numa etiqueta de 35. O desfecho errado nao e o erro
// — e o PDF sair bonitinho, ir para a Zebra, e o codigo aparecer cortado
// depois de 300 etiquetas. Na bancada, com o rolo gasto.
const {PDFDocument}=require('pdf-lib');
const pdf=require('../dominio/etiqueta_pdf');
const config=require('../nucleo/config');

const emMm=pt=>pt/72*25.4;
const por=(chave,valor)=>config.gravar(chave,valor,'teste');

module.exports=[

{nome:'a etiqueta sai no tamanho CADASTRADO, uma por pagina', async executar({igual,perto}){
  const arquivo=await pdf.gerar(['S-000007','S-000008','S-000009']);
  const doc=await PDFDocument.load(arquivo);
  igual(doc.getPageCount(),3,'uma pagina por etiqueta');
  doc.getPages().forEach((p,i)=>{
    const {width,height}=p.getSize();
    perto(emMm(width),100,'pagina '+(i+1)+': largura');
    perto(emMm(height),35,'pagina '+(i+1)+': altura');
  });
  // UMA POR PAGINA, e nao tres numa folha: a Zebra avanca uma etiqueta por
  // pagina. Duas na mesma pagina sairiam impressas por cima da picotagem.
}},

{nome:'trocar a bobina no cadastro troca a pagina do PDF', async executar({perto}){
  por('etqLargura',80); por('etqAltura',50);
  const doc=await PDFDocument.load(await pdf.gerar(['S-000007']));
  const {width,height}=doc.getPage(0).getSize();
  perto(emMm(width),80,'largura nova');
  perto(emMm(height),50,'altura nova');
  por('etqLargura',100); por('etqAltura',35);
  // E o ponto do cadastro: bobina nova nao e deploy.
}},

{nome:'O CODIGO ESCRITO NASCE GRANDE — e por ele que o operador procura', executar({igual}){
  igual(config.ler('etqFonteCodigo'),22,'22 pt, o dobro do que era');
  // Ele passa o olho na estante lendo numero; o leitor serve para confirmar,
  // nao para procurar. Fonte pequena obriga a chegar perto de cada sobra.
}},

{nome:'MEDIDA QUE NAO CABE E RECUSADA, com a frase que diz o que fazer', async executar({igual}){
  por('etqBarraAltura',40);            // 40 mm de barra numa etiqueta de 35
  const v=pdf.conferir(pdf.medidas());
  igual(v.cabe,false,'a conta nao fecha');
  igual(v.recado.includes('Reduza'),true,'e o recado diz o que fazer');

  let motivo=null;
  try{ await pdf.gerar(['S-000007']); }catch(e){ motivo=e.motivo; }
  igual(motivo,'etiqueta_nao_cabe','e o PDF nao e gerado');
  por('etqBarraAltura',14);
  // Recusar custa um aviso na tela. Nao recusar custa o rolo inteiro.
}},

{nome:'as medidas de fabrica fecham com folga na altura', executar({igual}){
  const v=pdf.conferir(pdf.medidas());
  igual(v.cabe,true,'cabe');
  igual(v.sobra>=0,true,'sobra de '+v.sobra.toFixed(2)+' mm na vertical');
  // Se um dia os padroes mudarem e esta folga for a zero, e sinal de que a
  // proxima pessoa que aumentar a fonte 1 pt vai quebrar a etiqueta.
}},

{nome:'ALTURA e LARGURA falham de jeitos diferentes, de proposito', async executar({igual}){
  /* Altura que nao cabe -> RECUSA. Largura que nao cabe -> ENCOLHE.
     Nao e inconsistencia. Passar da altura corta o desenho: parte do codigo
     simplesmente nao existe no papel, e nao ha nada a fazer com isso.
     Passar da largura e so questao de tamanho da letra — e letra menor o
     operador ainda le. Recusar ali pararia a bancada por estetica. */

  // Etiqueta alta e barra baixa: sobra altura de sobra, e a fonte de 70 pt
  // passa folgado na vertical. O que nao passa e a largura.
  por('etqAltura',60); por('etqBarraAltura',10); por('etqFonteCodigo',70);
  const v=pdf.conferir(pdf.medidas());
  igual(v.cabe,true,'na altura, 70 pt cabe nesta etiqueta');

  const arquivo=await pdf.gerar(['S-000007']);
  igual(arquivo.length>500,true,'e o PDF sai, com a letra reduzida para caber na largura');

  por('etqAltura',35); por('etqBarraAltura',14); por('etqFonteCodigo',22);
}},

{nome:'o modulo da barra NAO encolhe calado — ele nao e cadastravel', executar({igual}){
  // A diferenca de tratamento e a regra: texto pequeno o operador ainda le;
  // barra fina demais o leitor simplesmente recusa, e ninguem descobre por
  // que. Por isso o modulo e calculado, com piso, e nunca digitado.
  const m=pdf.moduloPara('S-000007');
  igual(m.cabe,true,'o codigo da sobra cabe');
  igual(m.mm>=pdf.MODULO_MIN_MM,true,'modulo de '+m.mm+' mm, acima do minimo');
  igual(m.mm<=pdf.MODULO_MAX_MM,true,'e abaixo do teto');
  igual(config.todos().etqModulo,undefined,'nao existe parametro de modulo');
}},

{nome:'codigo comprido demais e ACUSADO na etiqueta', executar({igual}){
  const curto=pdf.moduloPara('S-000007');
  const longo=pdf.moduloPara('S-000007-COM-UM-CODIGO-MUITO-MAIS-LONGO-QUE-O-NORMAL-DA-CASA');
  igual(curto.cabe,true,'o codigo normal cabe');
  igual(longo.cabe,false,'o exagerado nao, e o sistema sabe');
  // A etiqueta sai marcada 'CONFERIR LEITURA'. O desfecho ruim nao e o erro:
  // e sair bonita, colada na peca, e nao bipar.
}},

{nome:'as barras do PDF sao as MESMAS da tela', executar({igual}){
  const barras=require('../public/barras.js');
  igual(typeof barras.modulos,'function','o servidor alcanca o gerador da tela');
  igual(barras.modulos('S-000007').length,123,'o desenho do codigo e o conhecido');
  // Duas tabelas CODE128 seriam duas etiquetas diferentes para o mesmo
  // codigo, e a divergencia so apareceria na bancada.
}},

{nome:'lote vazio nao gera PDF em branco', async executar({igual}){
  let motivo=null;
  try{ await pdf.gerar([]); }catch(e){ motivo=e.motivo; }
  igual(motivo,'lote_vazio','recusa em vez de devolver arquivo vazio');
  // PDF de zero paginas abriria no navegador sem dizer nada, e o operador
  // ficaria olhando tela branca sem saber se o erro foi dele.
}},

{nome:'o pcpUrl saiu do cadastro junto com a ponte que ele configurava', executar({igual}){
  igual(config.todos().pcpUrl,undefined,'nao existe mais');
  // Parametro que nao faz nada e MENTIRA na tela: alguem editaria aquele
  // endereco tentando resolver um problema de acesso, nada mudaria, e a
  // conclusao seria "esse sistema nao obedece".
}}

];

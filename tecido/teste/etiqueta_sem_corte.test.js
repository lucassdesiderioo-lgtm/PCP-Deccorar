// NADA NA ETIQUETA DE PRODUCAO TERMINA EM "…" — secao 8.2 da spec
// SOBMEDIDA-CADASTRO-DE-PRODUTO (dono, 28/10/2026).
//
// ⚠️ ESCRITO ANTES DO CODIGO (risco vermelho: etiqueta). Ate aqui a linha que
// nao cabia era cortada e terminava em "…" — e as escolhas do Painel (abertura,
// folhas, comando, lado da corrente) sao o que a bancada precisa ler: texto
// cortado manda conferir na tela. O que este arquivo prova:
//   1. As escolhas saem com ABREVIACOES FIXAS, escritas num lugar so
//      (`CENTRAL · 6 FOLHAS · C/ COMANDO · CORRENTE ESQ`).
//   2. Linha comprida ENCOLHE ou QUEBRA EM DUAS — nunca corta. Toda palavra do
//      que entrou sai no papel, dentro da etiqueta, sem encostar no codigo.
//   3. O pior caso (Painel central, 6 folhas, com comando, bandô e cliente
//      final de nome comprido) cabe sem "…".
//   4. O ROLO NAO MUDA: a etiqueta que ja cabia sai nos MESMOS lugares e nos
//      MESMOS tamanhos de sempre.
const {PDFDocument, StandardFonts}=require('pdf-lib');
const pdf=require('../dominio/etiqueta_producao_pdf');
const etq=require('../dominio/etiqueta_producao');

const PT_MM=25.4/72;
let F=null;
async function fontes(){
  if(F) return F;
  const doc=await PDFDocument.create();
  F={mono:await doc.embedFont(StandardFonts.CourierBold),
     forte:await doc.embedFont(StandardFonts.HelveticaBold),
     normal:await doc.embedFont(StandardFonts.Helvetica)};
  return F;
}

// Uma etiqueta do jeito que o etiqueta_producao.js a monta.
const ROLO={codigo:'SER-000123',setor:'serralheria',pedido_item:'5001/03',pedido_numero:5001,
  peca:'3 de 3',revenda:'LAR DO CILAR',cliente_final:null,prazo:'qua 05/nov',
  produto:'Rolô',medida:'1,000 × 1,000',colecao:'Rolô 1% Branco',escolhas:'COMANDO DIREITO',
  comando:'COMANDO DIREITO',tarefa:'TUBO 32 · CORTAR 0,970',extra:'',extras:[],unidade:'1/1',refeitas:0};
const PIOR={codigo:'SER-000777',setor:'serralheria',pedido_item:'5003/02',pedido_numero:5003,
  peca:'2 de 2',revenda:'DECORAÇÕES E PERSIANAS LAR DO CILAR COMÉRCIO LTDA',
  cliente_final:'Maria Aparecida dos Santos Albuquerque de Figueiredo',prazo:'qui 06/nov',
  produto:'Painel',medida:'3,000 × 2,000',colecao:'Painel Tela solar 5% Areia',
  escolhas:'CENTRAL · 6 FOLHAS · C/ COMANDO · CORRENTE ESQ',
  tarefa:'TRILHO DE ALUMÍNIO 3 VIAS · CORTAR 2,980',extra:'3 VIAS DE CADA LADO',
  extras:['SOMFY','SONESSE 30 WIREFREE RTS','FAB. 28/10/2026'],unidade:'1/1',refeitas:1};

const palavras=s=>String(s||'').split(/[\s·]+/).filter(Boolean);
const juntar=ls=>ls.map(l=>l.texto).join(' ');

async function conferir(e,{igual},op){
  const f=await fontes();
  const d=pdf.diagramar(e,f);
  const L=pdf.ETQ.largura, m=pdf.ETQ.margem;
  for(const l of d.linhas){
    igual(/…$|\.\.\.$/.test(l.texto),false,'"'+l.texto+'" termina em reticencias');
    const w=l.fonte.widthOfTextAtSize(l.texto,l.tam)*PT_MM;
    igual(l.x>=m-0.01&&l.x+w<=L-m+0.01,true,'"'+l.texto+'" sai da etiqueta ('+(l.x+w).toFixed(1)+' mm)');
    igual(l.y>=pdf.PISO_TEXTO_MM-0.01,true,'"'+l.texto+'" desce para cima do codigo de barras (y '+l.y.toFixed(1)+')');
    igual(l.y+l.tam*PT_MM*0.75<=pdf.ETQ.altura-m+0.3,true,'"'+l.texto+'" passa da margem de cima');
  }
  // Duas linhas nao se encavalam: entre uma base e a de baixo cabe a letra de cima.
  const pelaAltura=d.linhas.filter(l=>l.x<60).slice().sort((a,b)=>b.y-a.y);
  for(let i=1;i<pelaAltura.length;i++){
    const de_cima=pelaAltura[i-1], de_baixo=pelaAltura[i];
    igual(de_cima.y-de_baixo.y>=(de_cima.tam*0.2+de_baixo.tam*0.72)*PT_MM-0.01,true,
      '"'+de_cima.texto+'" encavala em "'+de_baixo.texto+'"');
  }
  if(op&&op.semPalavras) return d;
  // Toda palavra que entrou SAI — encolher ou quebrar, nunca cortar.
  const saiu=palavras(juntar(d.linhas));
  [e.pedido_item,e.peca,e.revenda,e.cliente_final,e.prazo,e.produto,e.medida,e.escolhas,e.tarefa,e.extra]
    .concat(e.extras||[]).filter(Boolean).forEach(campo=>palavras(campo).forEach(p=>
      igual(saiu.includes(pdf.txt(p)),true,'a palavra "'+p+'" sumiu do papel')));
  return d;
}

module.exports=[

{nome:'§8.2 — as escolhas do Painel saem com as ABREVIACOES FIXAS da spec',
 executar({igual}){
  const de=c=>etq.escolhasDe(Object.assign({comando:''},c));
  igual(de({sentido:'central',folhas:6,acionamento:'com_comando',lado_corrente:'esquerdo'}),
    'CENTRAL · 6 FOLHAS · C/ COMANDO · CORRENTE ESQ','o exemplo da spec, letra por letra');
  igual(de({sentido:'esquerda',folhas:3,acionamento:'sem_comando'}),'P/ ESQUERDA · 3 FOLHAS · S/ COMANDO','lateral sem comando');
  igual(de({sentido:'direita',folhas:2,acionamento:'com_comando',lado_corrente:'direito'}),
    'P/ DIREITA · 2 FOLHAS · C/ COMANDO · CORRENTE DIR','lateral com comando');
}},

{nome:'§8.2 — O ROLO NAO MUDA: o comando dele continua escrito por extenso',
 executar({igual}){
  igual(etq.escolhasDe({comando:'direito'}),'COMANDO DIREITO','como sempre');
  igual(etq.escolhasDe({comando:'esquerdo'}),'COMANDO ESQUERDO','como sempre');
}},

{nome:'§8.2 — as abreviacoes moram NUM LUGAR SO (o ABREV do etiqueta_producao.js)',
 executar({igual}){
  const fs=require('fs'), path=require('path');
  const pasta=path.join(__dirname,'..');
  const achados=[];
  const varrer=dir=>fs.readdirSync(dir,{withFileTypes:true}).forEach(x=>{
    if(['node_modules','teste','backups'].includes(x.name)) return;
    const p=path.join(dir,x.name);
    if(x.isDirectory()) return varrer(p);
    if(!/\.(js|html)$/.test(x.name)) return;
    if(/'C\/ COMANDO'|'CORRENTE ESQ'/.test(fs.readFileSync(p,'utf8'))) achados.push(path.relative(pasta,p));
  });
  varrer(pasta);
  igual(achados.join(','),'dominio/etiqueta_producao.js','a tabela de abreviacoes e uma so');
}},

{nome:'§8.2 — PROVA (item 21): o PIOR CASO cabe inteiro, sem "…", dentro da etiqueta',
 async executar(t){
  const d=await conferir(PIOR,t);
  t.igual(d.linhas.some(l=>l.texto.indexOf('C/ COMANDO')>=0),true,'as escolhas estao no papel');
}},

{nome:'§8.2 — a TAREFA continua sendo a maior letra do corpo da etiqueta, mesmo no pior caso',
 async executar({igual}){
  const f=await fontes();
  const d=pdf.diagramar(PIOR,f);
  const tarefa=Math.max(...d.linhas.filter(l=>l.bloco==='tarefa').map(l=>l.tam));
  const resto=Math.max(...d.linhas.filter(l=>['base','produto','extras'].includes(l.bloco)).map(l=>l.tam));
  igual(tarefa>resto,true,'tarefa '+tarefa+' pt contra '+resto+' pt');
}},

{nome:'§8.2 — nome ABSURDO (300 letras) tambem sai inteiro: encolhe e quebra, nunca corta',
 async executar(t){
  const e=Object.assign({},PIOR,{cliente_final:('Fulano de Tal ').repeat(22).trim()});
  await conferir(e,t);
}},

{nome:'§8.2 — palavra sem espaco maior que a linha (um codigo colado) quebra no meio, sem sumir',
 async executar(t){
  const e=Object.assign({},PIOR,{revenda:'X'.repeat(140)});
  const d2=await conferir(e,t,{semPalavras:true});
  t.igual(juntar(d2.linhas).replace(/\s/g,'').split('X').length-1>=140,true,'os 140 X estao no papel');
  t.igual(d2.linhas.some(l=>/…$/.test(l.texto)),false,'sem reticencias');
}},

{nome:'§8.2 — O ROLO NAO MUDA: a etiqueta que cabe sai nos MESMOS lugares e tamanhos de sempre',
 async executar({igual}){
  const f=await fontes();
  const d=pdf.diagramar(ROLO,f);
  const de=b=>d.linhas.filter(l=>l.bloco===b).map(l=>l.y.toFixed(1)+'@'+l.tam).join(',');
  igual(de('cabeca'),'27.5@11','pedido e peca');
  igual(de('base'),'23.5@7.5','revenda e prazo');
  igual(de('produto'),'19.8@7.5','produto, medida, colecao, comando');
  igual(de('tarefa'),'14.6@10','a tarefa');
  igual(d.linhas.filter(l=>l.bloco==='extras').length,0,'sem extras, sem linha');
}},

{nome:'§8.2 — o PDF do pior caso gera, uma pagina',
 async executar({igual}){
  const b=await pdf.gerar([PIOR]);
  igual((await PDFDocument.load(b)).getPageCount(),1,'uma pagina');
}}

];

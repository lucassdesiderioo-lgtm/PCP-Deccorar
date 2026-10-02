// LER A ETIQUETA DA SOBRA POR FOTO (spec CORTE-EM-ETAPAS, fase 6, R27).
//
// ⚠️ ESTAS SAO IMAGENS SINTETICAS, e nao fotos. Elas desenham o codigo com o
// MESMO barras.js da etiqueta e o estragam do jeito que a camera estraga:
// tremida (borrada), torta (girada), de cabeca para baixo, com sombra de um
// lado, em perspectiva, pequena e com ruido. A spec pede fotos REAIS de
// etiqueta (boa, tremida, torta), e elas nao existem neste repositorio: a
// prova que fecha a fase e o iPad da bancada achando a sobra pela foto.
const path=require('path');
const barras=require(path.join(__dirname,'..','..','public','barras.js'));
const ler=require(path.join(__dirname,'..','..','public','barras_ler.js'));

// Desenha o codigo numa "foto": fundo claro, etiqueta branca, barras pretas.
function foto(codigo,o){
  const op=Object.assign({modulo:3, W:900, H:600, angulo:0, borrar:0, ruido:0,
    sombra:0, perspectiva:0, inverter:false},o||{});
  const bits=barras.modulos(codigo);
  const larg=(bits.length+20)*op.modulo, alt=Math.round(op.modulo*40);
  const g=new Float32Array(op.W*op.H);
  const cx=op.W/2, cy=op.H/2, r=op.angulo*Math.PI/180, c=Math.cos(r), s=Math.sin(r);
  for(let y=0;y<op.H;y++) for(let x=0;x<op.W;x++){
    // Volta do ponto da foto para o ponto da etiqueta (giro e perspectiva).
    let u=(x-cx)*c+(y-cy)*s, v=-(x-cx)*s+(y-cy)*c;
    if(op.inverter){ u=-u; v=-v; }
    u=u*(1+op.perspectiva*v/alt);
    const lu=u+larg/2, lv=v+alt/2;
    let val=170;                                   // a bancada atras da etiqueta
    if(lu>=0&&lu<larg&&lv>=0&&lv<alt){
      const m=Math.floor(lu/op.modulo)-10;
      val=(m>=0&&m<bits.length&&bits[m]==='1')?25:245;
    }
    // Sombra de um lado da foto.
    val*=1-op.sombra*(x/op.W);
    g[y*op.W+x]=val;
  }
  // Tremida: borrao de caixa, passado algumas vezes.
  for(let p=0;p<op.borrar;p++){
    const t=new Float32Array(g);
    for(let y=1;y<op.H-1;y++) for(let x=1;x<op.W-1;x++){
      let a=0; for(let j=-1;j<=1;j++) for(let i=-1;i<=1;i++) a+=t[(y+j)*op.W+x+i];
      g[y*op.W+x]=a/9;
    }
  }
  let semente=7; const aleat=()=>((semente=(semente*16807)%2147483647)/2147483647);
  const data=new Uint8ClampedArray(op.W*op.H*4);
  for(let i=0;i<op.W*op.H;i++){
    const v=g[i]+(aleat()-0.5)*2*op.ruido;
    data[i*4]=data[i*4+1]=data[i*4+2]=v; data[i*4+3]=255;
  }
  return {width:op.W, height:op.H, data};
}
const leu=(img)=>{ const r=ler.ler(img); return r?r.codigo:null; };

module.exports=[

{nome:'a etiqueta limpa e reta e lida', executar({igual}){
  igual(leu(foto('S-000014')),'S-000014','o codigo da sobra');
}},

{nome:'TREMIDA: a foto borrada ainda le', executar({igual}){
  igual(leu(foto('S-000091',{borrar:3, ruido:12})),'S-000091','borrada e com ruido');
}},

{nome:'TORTA: girada para os dois lados', executar({igual}){
  igual(leu(foto('S-000123',{angulo:14})),'S-000123','14°');
  igual(leu(foto('S-000124',{angulo:-23})),'S-000124','-23°');
  igual(leu(foto('S-000125',{angulo:75,W:700,H:900})),'S-000125','quase em pe (a foto na vertical)');
}},

{nome:'DE CABECA PARA BAIXO tambem le', executar({igual}){
  igual(leu(foto('S-000200',{inverter:true})),'S-000200','invertida');
}},

{nome:'com sombra de um lado da foto', executar({igual}){
  igual(leu(foto('S-000300',{sombra:0.75})),'S-000300','o lado direito da foto bem escuro');
}},

{nome:'em perspectiva (o iPad nao estava de frente)', executar({igual}){
  igual(leu(foto('S-000301',{perspectiva:0.35})),'S-000301','um lado da etiqueta maior que o outro');
}},

{nome:'pequena na foto (de longe)', executar({igual}){
  igual(leu(foto('S-000302',{modulo:1.6})),'S-000302','modulo de 1,6 px');
}},

{nome:'FOTO SEM ETIQUETA NAO INVENTA CODIGO', executar({igual}){
  const vazia=foto('S-000001',{W:400,H:300}); for(let i=0;i<vazia.data.length;i+=4){ vazia.data[i]=vazia.data[i+1]=vazia.data[i+2]=150+((i*7919)%60); }
  igual(ler.ler(vazia),null,'sem codigo, sem resposta');
}},

{nome:'O DIGITO VERIFICADOR SEGURA: uma barra trocada nao vira outro codigo', executar({igual}){
  // Estraga UMA barra do codigo: o leitor tem que recusar, e nunca devolver
  // um codigo vizinho "com confianca".
  const bits=barras.modulos('S-000014').split('');
  const k=11*3+3; bits[k]=bits[k]==='1'?'0':'1';
  const runs=[{escuro:false,w:40}];
  let cor=bits[0], w=0;
  for(const b of bits){ if(b===cor) w++; else { runs.push({escuro:cor==='1',w:w*3}); cor=b; w=1; } }
  runs.push({escuro:cor==='1',w:w*3}); runs.push({escuro:false,w:40});
  const r=ler.decodificar(runs);
  igual(r===null||r==='S-000014',true,'ou recusa, ou acha o certo — nunca outro: '+r);
}},

{nome:'os codigos do sistema todos fecham: rolo e sobra, ida e volta', executar({igual}){
  ['S-000001','S-999999','R-000032','S-010203'].forEach(c=>{
    const bits=barras.modulos(c);
    const runs=[{escuro:false,w:50}]; let cor=bits[0], w=0;
    for(const b of bits){ if(b===cor) w++; else { runs.push({escuro:cor==='1',w:w*2}); cor=b; w=1; } }
    runs.push({escuro:cor==='1',w:w*2}); runs.push({escuro:false,w:50});
    igual(ler.decodificar(runs),c,c+' de ida');
    igual(ler.decodificar(runs.slice().reverse()),null,c+' de volta, sozinho, nao fecha — quem inverte e o ler()');
  });
}},

{nome:'AS TELAS DE SOBRA CARREGAM O LEITOR ANTES DO ui.js, e o campo usa o comCamera', executar({igual}){
  // Sem o script, o botao aparece e diz "nao carregou" — a fase existiria no
  // papel e nao pegaria em ninguem (divida 18). E o codigo lido tem que entrar
  // NO CAMPO, pelo mesmo caminho do bipe: um segundo caminho divergiria.
  const fs=require('fs');
  [['corte.html',2],['sobras.html',2]].forEach(([t,n])=>{
    const s=fs.readFileSync(path.join(__dirname,'..','public','telas',t),'utf8');
    const iLer=s.indexOf('/barras_ler.js'), iB=s.indexOf('src="/barras.js"'), iUi=s.indexOf('/sobmedida/ui.js');
    igual(iB>=0&&iLer>iB&&iUi>iLer,true,t+': barras.js, depois barras_ler.js, depois ui.js');
    igual((s.match(/comCamera\(/g)||[]).length,n,t+': os campos de bipe de sobra com a camera');
  });
}}

];

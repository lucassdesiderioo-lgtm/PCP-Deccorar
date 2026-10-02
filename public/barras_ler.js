// LER CODE128 DE UMA FOTO — o contrario do barras.js, e com a MESMA tabela
// (spec CORTE-EM-ETAPAS, fase 6, R27).
//
// O iPad sem leitor tira a foto da etiqueta da sobra e esta funcao acha o
// codigo na imagem. Sem biblioteca, pela mesma razao do barras.js: o modulo
// nao admite dependencia de front, e a tabela de padroes ja mora ao lado.
//
//   1. a imagem vira cinza e e reduzida (no maximo 1200 px no lado maior)
//   2. o leitor passa LINHAS DE VARREDURA em varios angulos — a etiqueta
//      torta na foto e o caso normal, nao a excecao
//   3. cada linha vira faixas claro/escuro pelo meio-termo entre o claro e o
//      escuro DAQUELE trecho (a foto tem sombra de um lado)
//   4. cada simbolo (6 faixas = 11 modulos) e medido pela PROPRIA largura —
//      perspectiva estica a etiqueta de um lado, e um modulo unico para a
//      linha inteira erraria a ponta
//   5. so vale o que passar no digito verificador do CODE128. E ele que torna
//      seguro ler de foto: uma leitura errada quase nunca fecha o modulo 103.
//
// ⚠️ O DIGITO VERIFICADOR E A UNICA PROVA, e por isso nao ha "melhor palpite".
// Nao fechou, nao leu — e a tela diz isso e deixa tentar de novo ou digitar.
// Um codigo errado lido "com confianca" e uma sobra trocada na prateleira.
(function(){

const B=(typeof window!=='undefined'&&window.barras)||
        (typeof require!=='undefined'?require('./barras.js'):null);
const LARGURAS=B.LARGURAS;
const PADROES=LARGURAS.map(w=>w.split('').map(Number));
const PARADA=106, INICIO={103:'A',104:'B',105:'C'};

// Cinza e reduzida. `img` e um ImageData (ou {width,height,data} RGBA).
function cinza(img,maxLado){
  const m=maxLado||1200;
  const f=Math.min(1,m/Math.max(img.width,img.height));
  const w=Math.max(1,Math.round(img.width*f)), h=Math.max(1,Math.round(img.height*f));
  const g=new Float32Array(w*h);
  for(let y=0;y<h;y++){
    const sy=Math.min(img.height-1,Math.floor(y/f));
    for(let x=0;x<w;x++){
      const sx=Math.min(img.width-1,Math.floor(x/f));
      const i=(sy*img.width+sx)*4;
      g[y*w+x]=0.299*img.data[i]+0.587*img.data[i+1]+0.114*img.data[i+2];
    }
  }
  return {w,h,g};
}

// Amostra a imagem ao longo de uma reta (interpolacao bilinear).
function amostrar(im,x0,y0,dx,dy,n){
  const out=new Float32Array(n);
  for(let k=0;k<n;k++){
    const x=x0+dx*k, y=y0+dy*k;
    const xi=Math.floor(x), yi=Math.floor(y);
    if(xi<0||yi<0||xi>=im.w-1||yi>=im.h-1){ out[k]=255; continue; }
    const fx=x-xi, fy=y-yi, i=yi*im.w+xi;
    out[k]=im.g[i]*(1-fx)*(1-fy)+im.g[i+1]*fx*(1-fy)+im.g[i+im.w]*(1-fx)*fy+im.g[i+im.w+1]*fx*fy;
  }
  return out;
}

/* Faixas claro/escuro. O limiar e o meio-termo entre o escuro e o claro numa
   janela em volta de cada ponto: a sombra de um lado da foto nao pode virar
   barra. Trecho sem contraste (fundo liso) nao vira faixa nenhuma. */
function faixas(linha){
  const n=linha.length, J=48;
  const runs=[]; let cor=null, inicio=0;
  for(let k=0;k<n;k++){
    let mn=255, mx=0;
    for(let j=Math.max(0,k-J);j<=Math.min(n-1,k+J);j+=2){ const v=linha[j]; if(v<mn) mn=v; if(v>mx) mx=v; }
    const escuro=(mx-mn)>40?linha[k]<(mn+mx)/2:false;
    if(cor===null){ cor=escuro; inicio=k; }
    else if(escuro!==cor){ runs.push({escuro:cor, w:k-inicio}); cor=escuro; inicio=k; }
  }
  if(cor!==null) runs.push({escuro:cor, w:n-inicio});
  return runs;
}

// O simbolo de 6 faixas (11 modulos) mais parecido, medido pela propria
// largura. Devolve o indice e o erro; erro grande e "nao e simbolo".
function simbolo(ws){
  const tot=ws.reduce((a,b)=>a+b,0); if(tot<=0) return null;
  const norm=ws.map(v=>v*11/tot);
  let melhor=-1, erro=1e9;
  for(let i=0;i<106;i++){
    const p=PADROES[i]; let e=0;
    for(let k=0;k<6;k++) e+=Math.abs(norm[k]-p[k]);
    if(e<erro){ erro=e; melhor=i; }
  }
  return erro<=2.2?{i:melhor, erro, modulo:tot/11}:null;
}
// A parada tem 7 faixas e 13 modulos.
function ehParada(ws){
  const tot=ws.reduce((a,b)=>a+b,0); const p=PADROES[PARADA];
  let e=0; for(let k=0;k<7;k++) e+=Math.abs(ws[k]*13/tot-p[k]);
  return e<=2.6;
}

// Valores -> texto. Etiqueta do sistema e sempre B; A e C ficam por robustez.
function texto(valores,cod){
  let s='', c=cod;
  for(const v of valores){
    if(c==='C'){ if(v<100) s+=String(v).padStart(2,'0'); else if(v===100) c='B'; else if(v===101) c='A'; else return null; continue; }
    if(v===99){ c='C'; continue; }
    if(c==='B'){ if(v<95) s+=String.fromCharCode(v+32); else if(v===101) c='A'; else if(v===100) {} else return null; continue; }
    if(c==='A'){ if(v<64) s+=String.fromCharCode(v+32); else if(v<96) s+=String.fromCharCode(v-64); else if(v===100) c='B'; else return null; }
  }
  return s;
}

// Tenta decodificar uma lista de faixas a partir de cada barra.
function decodificar(runs){
  const ws=runs.map(r=>r.w);
  for(let s=0;s+6<=runs.length;s++){
    if(!runs[s].escuro) continue;
    const ini=simbolo(ws.slice(s,s+6));
    if(!ini||!INICIO[ini.i]) continue;
    // Silencio antes do inicio: pelo menos ~5 modulos claros.
    if(s>0&&ws[s-1]<ini.modulo*5) continue;
    const vals=[ini.i]; let k=s+6, ok=false;
    while(k+7<=runs.length){
      /* A PARADA SO VALE COM O SILENCIO DEPOIS. Sem isso, um trecho do meio
         que por acaso parece a parada encerra a leitura cedo e o digito
         verificador nunca fecha — foi o que o S-999999 mostrou no teste. */
      const depois=k+7<runs.length?ws[k+7]:Infinity;
      if(ehParada(ws.slice(k,k+7))&&depois>=ini.modulo*4){ ok=true; break; }
      const sb=simbolo(ws.slice(k,k+6));
      if(!sb) break;
      vals.push(sb.i); k+=6;
      if(vals.length>60) break;
    }
    if(!ok||vals.length<3) continue;
    // O DIGITO VERIFICADOR: (inicio + soma de posicao x valor) modulo 103.
    const dados=vals.slice(1,-1), dv=vals[vals.length-1];
    let soma=vals[0]; dados.forEach((v,i)=>{ soma+=v*(i+1); });
    if(soma%103!==dv) continue;
    const t=texto(dados,INICIO[vals[0]]);
    if(t) return t;
  }
  return null;
}

/* A busca: linhas paralelas em varios angulos, nos dois sentidos (a etiqueta
   de cabeca para baixo e a mesma etiqueta lida de tras para a frente). Para
   na primeira que fechar o digito verificador DUAS vezes — uma linha so pode
   ser sorte; duas linhas diferentes dizendo o mesmo nao e. */
function ler(img,opcoes){
  const o=opcoes||{};
  const im=cinza(img,o.maxLado);
  const votos=new Map();
  const diag=Math.ceil(Math.hypot(im.w,im.h));
  const passoAng=o.passoAngulo||6, linhas=o.linhas||31;
  const cx=im.w/2, cy=im.h/2;
  for(let a=0;a<180;a+=passoAng){
    // Comeca pelos angulos perto de 0 e de 90 (a foto quase reta), que sao
    // os mais comuns, e alterna para os dois lados.
    const ang=[0,90].includes(a)?a:a;
    const r=ang*Math.PI/180, dx=Math.cos(r), dy=Math.sin(r);
    const nx=-dy, ny=dx;
    for(let l=0;l<linhas;l++){
      const off=(l/(linhas-1)-0.5)*Math.min(im.w,im.h)*0.9;
      const x0=cx+nx*off-dx*diag/2, y0=cy+ny*off-dy*diag/2;
      const linha=amostrar(im,x0,y0,dx,dy,diag);
      const runs=faixas(linha);
      for(const sentido of [runs, runs.slice().reverse()]){
        const t=decodificar(sentido);
        if(!t) continue;
        const v=(votos.get(t)||0)+1; votos.set(t,v);
        if(v>=2) return {codigo:t, votos:v};
      }
    }
  }
  // Um voto so ainda e leitura com digito verificador fechado — mas a tela
  // diz que foi por pouco, para quem quiser conferir.
  const melhor=[...votos.entries()].sort((a,b)=>b[1]-a[1])[0];
  return melhor?{codigo:melhor[0], votos:melhor[1]}:null;
}

const api={ler, decodificar, faixas};
if(typeof window!=='undefined') window.barrasLer=api;
if(typeof module!=='undefined'&&module.exports) module.exports=api;
})();

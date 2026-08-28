// As quatro funcoes que toda tela usa. Nada de framework, nada de build.
(function(){

// ── api() — o unico jeito de falar com o servidor ────────────────────────
// O envelope {ok, dados} / {ok, motivo, mensagem} e desembrulhado aqui, uma
// vez. Erro vira banner vermelho com a frase que o dominio escreveu, e a
// promessa rejeita — a tela nao segue como se tivesse dado certo.
async function api(caminho,opcoes){
  const o=opcoes||{};
  const conf={method:o.metodo||'GET',headers:{},credentials:'same-origin'};
  if(o.corpo!==undefined){ conf.headers['Content-Type']='application/json'; conf.body=JSON.stringify(o.corpo); }
  let r;
  try{ r=await fetch(caminho,conf); }
  catch(e){ banner('Sem conexao com o servidor.','erro'); throw e; }
  if(r.status===401){ location.href='/login?r='+encodeURIComponent(location.pathname); throw new Error('nao_logado'); }
  let j=null;
  try{ j=await r.json(); }catch(e){}
  if(!j||!j.ok){
    const msg=(j&&j.mensagem)||'Nao deu para completar. Tente de novo.';
    if(!o.silencioso) banner(msg,'erro');
    const err=new Error(msg); err.motivo=j&&j.motivo; throw err;
  }
  return j.dados;
}

// ── banner() — o aviso que o operador le de longe ────────────────────────
let bannerTimer=null;
function banner(texto,tipo,segundos){
  let el=document.getElementById('banner');
  if(!el){ el=document.createElement('div'); el.id='banner'; document.body.appendChild(el); }
  el.textContent=texto;
  el.className=tipo||'bom';
  el.style.display='block';
  clearTimeout(bannerTimer);
  bannerTimer=setTimeout(()=>{ el.style.display='none'; },(segundos||4)*1000);
}

// ── beep() — retorno sonoro, porque na fabrica ninguem olha a tela ───────
// WebAudio em vez de arquivo: nao carrega nada e toca no primeiro toque.
let audio=null;
function beep(tipo){
  try{
    audio=audio||new (window.AudioContext||window.webkitAudioContext)();
    const osc=audio.createOscillator(), vol=audio.createGain();
    osc.connect(vol); vol.connect(audio.destination);
    osc.frequency.value = tipo==='erro'?220:880;
    vol.gain.value=0.06;
    osc.start();
    osc.stop(audio.currentTime+(tipo==='erro'?0.35:0.12));
  }catch(e){}
}

// ── formatarMedida() — a medida escrita de UM jeito so ───────────────────
// Duas telas escrevendo a medida cada uma do seu jeito ensinam a equipe a
// achar que sao coisas diferentes.
const num=(v,casas)=>(Number(v)||0).toFixed(casas===undefined?2:casas).replace('.',',');
const formatarMedida=(largura,altura)=>num(largura)+' × '+num(altura);
const formatarMetros=v=>num(v)+' m';
const formatarArea=v=>num(v)+' m²';

// ── atalhos de DOM ───────────────────────────────────────────────────────
const $=s=>document.querySelector(s);
const $$=s=>Array.prototype.slice.call(document.querySelectorAll(s));
function el(tag,attrs,filhos){
  const n=document.createElement(tag);
  for(const k in (attrs||{})){
    if(k==='texto') n.textContent=attrs[k];
    else if(k==='html') n.innerHTML=attrs[k];
    else if(k.slice(0,2)==='on') n.addEventListener(k.slice(2),attrs[k]);
    else if(attrs[k]!==null&&attrs[k]!==undefined) n.setAttribute(k,attrs[k]);
  }
  (filhos||[]).forEach(f=>n.appendChild(typeof f==='string'?document.createTextNode(f):f));
  return n;
}
const limpar=n=>{ while(n.firstChild) n.removeChild(n.firstChild); return n; };

// Numero digitado na fabrica vem com virgula. Uma porta so para converter.
function comoNumero(texto){
  const n=Number(String(texto==null?'':texto).replace(',','.').trim());
  return isFinite(n)?n:null;
}

window.ui={api,banner,beep,formatarMedida,formatarMetros,formatarArea,num,$,$$,el,limpar,comoNumero};
})();

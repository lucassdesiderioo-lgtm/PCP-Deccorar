// As quatro funcoes que toda tela usa. Nada de framework, nada de build.
(function(){

// ── BASE — onde este modulo esta montado ─────────────────────────────────
// O sob medida vive DENTRO do PCP, sob /sobmedida. As chamadas de API levam
// esse prefixo por aqui, num lugar so: espalhar '/sobmedida/api/...' por sete
// telas seria sete lugares para errar no dia em que o caminho mudar.
const BASE='/sobmedida';

// ── api() — o unico jeito de falar com o servidor ────────────────────────
// O envelope {ok, dados} / {ok, motivo, mensagem} e desembrulhado aqui, uma
// vez. Erro vira banner vermelho com a frase que o dominio escreveu, e a
// promessa rejeita — a tela nao segue como se tivesse dado certo.
async function api(caminho,opcoes){
  const o=opcoes||{};
  const conf={method:o.metodo||'GET',headers:{},credentials:'same-origin'};
  if(o.corpo!==undefined){ conf.headers['Content-Type']='application/json'; conf.body=JSON.stringify(o.corpo); }
  let r;
  try{ r=await fetch(BASE+caminho,conf); }
  catch(e){ banner('Sem conexao com o servidor.','erro'); throw e; }
  // O login e o do PCP, na raiz — nao ha mais um segundo PIN aqui.
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
// Dinheiro num lugar so, e NULO E TRACO — nunca "R$ 0,00", que se le como
// "nao vale nada" (regra 3 do custo.js). Rolos e sobras escrevem por aqui.
const dinheiro=v=>v==null?'—':'R$ '+Number(v).toLocaleString('pt-BR',
  {minimumFractionDigits:2,maximumFractionDigits:2});

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

/* ── A COR CADASTRADA QUE NAO VIRA BOTAO ──────────────────────────────────
   As fileiras LINHA/COLECAO/COR da entrada de rolo, do corte e das sobras
   NAO leem a tabela de cores: elas saem dos ITENS DE TECIDO ativos, porque
   o que se escolhe ali e um item que existe, e nao uma combinacao nova. A
   consequencia e que uma cor recem-cadastrada simplesmente nao aparece — a
   fileira fica mais curta, e mais nada.

   Isso e um beco: quem esta com o rolo (ou a peca) na mao procura a cor, nao
   acha, e nao tem como saber que falta o item de tecido. A saida que sobra e
   bipar a cor parecida so para o sistema aceitar, e a partir dali o estoque
   do tecido errado e que anda — a armadilha #6 do CLAUDE.md na letra: trava
   que dispara no caso normal vira desvio, fora da vista do sistema.

   ⚠️ DONO UNICO DAS TRES TELAS. Tres telas escrevendo este aviso cada uma do
   seu jeito ensinariam a equipe a achar que sao tres situacoes diferentes —
   e a que esquecesse de contar a colecao no texto mandaria cadastrar o que
   ja existe.

   O aviso NAO e alarme (nao e vermelho) e nao pede providencia de quem esta
   ali: quem da entrada no rolo ou corta pode nem ter `cadastro.editar`. Ele
   responde a pergunta que a pessoa acabou de fazer e diz em que tela se
   resolve. E nomeia as cores que faltam SEM cortar a lista — truncar
   esconderia justamente a cor que a pessoa procura, que e o unico motivo de
   a linha existir. Devolve `null` quando nao falta nenhuma: contador que
   nunca zera e contador que a equipe aprende a pular. */
function avisoCorSemItem(cadastradas, naFileira, nomeLinha, nomeColecao){
  const faltando=(cadastradas||[]).filter(k=>k.ativo&&
    !(naFileira||[]).some(x=>String(x.valor)===String(k.id)));
  if(!faltando.length) return null;
  const onde=(nomeLinha&&nomeColecao)?(' em '+nomeLinha+' · '+nomeColecao):'';
  const nomes=faltando.map(k=>k.nome).join(', ');
  return el('p',{class:'ajuda',texto:
    'Procurando uma cor que nao esta nos botoes? '+
    (faltando.length===1
      ? nomes+' esta cadastrada, mas nao existe'+onde+'.'
      : nomes+' estao cadastradas, mas nao existem'+onde+'.')+
    ' A cor so vira botao aqui depois que existe o ITEM DE TECIDO '+
    '(linha · colecao · cor) — cadastre em Cadastros → Tecido → Item de tecido.'});
}

window.ui={api,banner,beep,formatarMedida,formatarMetros,formatarArea,dinheiro,num,$,$$,el,limpar,comoNumero,avisoCorSemItem};
})();

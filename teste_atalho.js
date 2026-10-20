#!/usr/bin/env node
/* Testes dos atalhos de teclado do nav.js (Alt+1..8 troca de tela, Alt+0 sai).
 *
 *   node teste_atalho.js
 *
 * O DEFEITO (20/10/2026): no computador, bipar uma etiqueta jogava a pessoa
 * para outra tela. O leitor estava no modo "Alt + teclado numerico" — o jeito
 * do Windows digitar um caractere pelo codigo (Alt+53 = "5"), comum em PC com
 * teclado ABNT2. Cada caractere chega como Alt segurado + digitos do teclado
 * NUMERICO, e o nav.js aceitava qualquer digito com Alt: o "5" de Alt+53 era o
 * Alt+5 da Etiqueta de Venda, o "6" de Alt+65 (letra A) era o Carregamento, e
 * o "0" de Alt+048 abria o "Sair do sistema?".
 *
 * A REGRA: atalho e coisa de PESSOA, e pessoa aperta o numero da FILEIRA DE
 * CIMA. O teclado numerico com Alt e do leitor e nunca dispara atalho.
 *
 * O nav.js roda aqui dentro de um navegador de mentira (so o que ele usa), e os
 * eventos sao os que o Chrome do Windows entrega: `code` diz a tecla fisica
 * ("Numpad5" ou "Digit5") e `key` o caractere. Nao toca no banco nem na rede.
 */
const fs=require('fs'), path=require('path'), vm=require('vm');

let ok=0, falhas=0;
const caso=(nome,fn)=>{ try{ fn(); console.log('ok      '+nome); ok++; }
                        catch(e){ console.log('FALHOU  '+nome+'\n        '+e.message); falhas++; } };
const igual=(veio,esperado,oque)=>{ if(JSON.stringify(veio)!==JSON.stringify(esperado))
  throw new Error((oque||'valor')+': esperava '+JSON.stringify(esperado)+', veio '+JSON.stringify(veio)); };

const NAV=fs.readFileSync(path.join(__dirname,'public/nav.js'),'utf8');

/* Uma tela aberta com o nav.js carregado. Devolve o que interessa: para onde a
   pagina foi mandada, quantas vezes perguntou "Sair do sistema?" e uma funcao
   que entrega teclas ao documento. */
function abrir(tela){
  const ouvintes=[];
  const el=()=>({ style:{}, appendChild(){}, insertBefore(){}, set innerHTML(v){}, get innerHTML(){ return ''; } });
  const location={ pathname:tela, _href:tela,
    get href(){ return this._href; }, set href(v){ this._href=v; } };
  let perguntas=0;
  const janela={
    document:{
      body:Object.assign(el(),{firstChild:null}), head:el(), documentElement:{style:{}},
      createElement:el, getElementById:()=>null,
      addEventListener:(tipo,fn)=>{ if(tipo==='keydown') ouvintes.push(fn); },
    },
    location, getComputedStyle:()=>({backgroundColor:'rgb(255, 255, 255)'}),
    localStorage:{ getItem:()=>null, setItem(){} },
    fetch:()=>new Promise(()=>{}),          // a rede nunca responde: nao interessa aqui
    setInterval(){}, confirm:()=>{ perguntas++; return false; },
    parseInt, Math, String, console,
  };
  vm.runInNewContext(NAV, janela);
  const tecla=(e)=>{ const ev=Object.assign({altKey:false,ctrlKey:false,metaKey:false,shiftKey:false,repeat:false,
                                             preventDefault(){}},e);
                     ouvintes.forEach(fn=>fn(ev)); };
  return { tecla, foi:()=>location.href, perguntas:()=>perguntas };
}

/* O leitor no modo Alt: para cada caractere, segura o Alt e digita o codigo
   dele no teclado NUMERICO. `zero` reproduz os leitores que mandam Alt+0053. */
function bipar(t, texto, zero){
  for(const ch of texto){
    const cod=(zero?'0':'')+String(ch.charCodeAt(0));
    t.tecla({key:'Alt', code:'AltLeft', altKey:true});
    for(const d of cod) t.tecla({key:d, code:'Numpad'+d, altKey:true});
  }
  t.tecla({key:'Enter', code:'Enter'});
}

/* A pessoa: segura o Alt e aperta o numero da fileira de cima. */
const atalho=(t,n)=>{ t.tecla({key:'Alt', code:'AltLeft', altKey:true});
                      t.tecla({key:String(n), code:'Digit'+n, altKey:true}); };

console.log('\n── o leitor no modo Alt nao troca de tela ────────────────────────────\n');

caso('bipar um codigo so de NUMEROS no Carregamento fica no Carregamento (Alt+53 era o Alt+5)', ()=>{
  const t=abrir('/carregamento'); bipar(t,'5123456789');
  igual(t.foi(),'/carregamento','tela depois do bipe');
});

caso('bipar um SKU com LETRAS fica na tela (Alt+65..90 eram Alt+6, Alt+7 e Alt+8)', ()=>{
  const t=abrir('/embalagem'); bipar(t,'BK180150BRANCO');
  igual(t.foi(),'/embalagem','tela depois do bipe');
});

caso('o leitor que manda o ZERO na frente (Alt+0053) nao pergunta "Sair do sistema?"', ()=>{
  const t=abrir('/embalagem'); bipar(t,'7449-ABC',true);
  igual(t.perguntas(),0,'vezes que perguntou se queria sair');
  igual(t.foi(),'/embalagem','tela depois do bipe');
});

caso('nenhum caractere imprimivel, em nenhuma das duas formas, troca de tela', ()=>{
  let todos=''; for(let c=32;c<127;c++) todos+=String.fromCharCode(c);
  for(const zero of [false,true]){
    const t=abrir('/montagem'); bipar(t,todos,zero);
    igual(t.foi(),'/montagem','tela (zero='+zero+')'); igual(t.perguntas(),0,'perguntas (zero='+zero+')');
  }
});

console.log('\n── a pessoa continua usando os atalhos ───────────────────────────────\n');

caso('Alt+1 a Alt+8 pela fileira de cima vao para as mesmas telas de sempre', ()=>{
  const MAPA={1:'/painel',2:'/operador',3:'/montagem',5:'/embalagem',6:'/carregamento',7:'/',8:'/relatorios'};
  for(const n in MAPA){ const t=abrir('/inventario'); atalho(t,n); igual(t.foi(),MAPA[n],'Alt+'+n); }
});

caso('Alt+4 e Alt+9 continuam sem tela', ()=>{
  for(const n of [4,9]){ const t=abrir('/inventario'); atalho(t,n); igual(t.foi(),'/inventario','Alt+'+n); }
});

caso('o atalho da propria tela nao recarrega', ()=>{
  const t=abrir('/carregamento'); atalho(t,6); igual(t.foi(),'/carregamento','Alt+6 no Carregamento');
});

caso('Alt+0 pela fileira de cima continua perguntando "Sair do sistema?"', ()=>{
  const t=abrir('/painel'); atalho(t,0); igual(t.perguntas(),1,'perguntas');
});

caso('Ctrl+Alt+1 (AltGr no teclado ABNT2) nao e atalho', ()=>{
  const t=abrir('/painel'); t.tecla({key:'1', code:'Digit1', altKey:true, ctrlKey:true});
  igual(t.foi(),'/painel','tela');
});

caso('o numero sem Alt nao e atalho (o leitor no modo normal digita numero solto)', ()=>{
  const t=abrir('/painel'); for(const d of '1234567890') t.tecla({key:d, code:'Digit'+d});
  igual(t.foi(),'/painel','tela'); igual(t.perguntas(),0,'perguntas');
});

console.log('\n'+ok+' ok, '+falhas+' falha(s)\n');
process.exit(falhas?1:0);

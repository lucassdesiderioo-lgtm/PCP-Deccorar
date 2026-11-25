#!/usr/bin/env node
/* Testes da TELA do Carregamento (public/carregamento.html) — o que so a tela
 * faz, e por isso nenhum teste de rota pega.
 *
 *   node teste_carregamento_tela.js
 *
 * Escritos ANTES do conserto de 20/10/2026, e refeitos em 25/11/2026 para a
 * tela dos carrinhos (spec CONFERENCIA-CARRINHOS), sem perder o que travam:
 * - o motivo do "Liberar com divergencia" (hoje no passo da entrega) sobrevive
 *   a atualizacao automatica de 4 s. Antes ela redesenhava o card por cima do
 *   campo: o texto sumia e, no iPad, o teclado fechava no meio da frase;
 * - enquanto a pessoa digita num campo, a tela nao se redesenha por baixo;
 * - o bipe que nao chega ao sistema (rede caiu, servidor fora) AVISA, com som
 *   de erro. Antes ele sumia calado e a pessoa achava que o leitor falhou;
 * - o volume BLOQUEADO (SKU fora do cadastro) diz que esta bloqueado. Antes
 *   caia no "Etiqueta nao reconhecida — bipe a etiqueta de VENDA", que manda a
 *   pessoa fazer outra coisa com a caixa certa na mao.
 *
 * O <script> da tela roda aqui de verdade, num navegador de mentira com so o
 * que ela usa. Trocar o innerHTML de um card RECRIA os campos de dentro, como
 * o navegador faz — e e exatamente isso que apagava o motivo. Nao toca no
 * banco nem na rede.
 */
const fs=require('fs'), path=require('path'), vm=require('vm');

let ok=0, falhas=0;
const pendentes=[];
const caso=(nome,fn)=>pendentes.push([nome,fn]);
const secao=t=>pendentes.push([t,null]);
const igual=(veio,esperado,oque)=>{ if(JSON.stringify(veio)!==JSON.stringify(esperado))
  throw new Error((oque||'valor')+': esperava '+JSON.stringify(esperado)+', veio '+JSON.stringify(veio)); };
const tem=(texto,re,oque)=>{ if(!re.test(texto)) throw new Error((oque||'texto')+' sem '+re+': '+JSON.stringify(texto.slice(0,200))); };
const naoTem=(texto,re,oque)=>{ if(re.test(texto)) throw new Error((oque||'texto')+' nao devia ter '+re); };

// o bipe que falha deixa uma promessa rejeitada pelo caminho na tela antiga
process.on('unhandledRejection',()=>{});

const HTML=fs.readFileSync(path.join(__dirname,'public/carregamento.html'),'utf8');
const a=HTML.indexOf('<script>')+8, b=HTML.indexOf('</script>',a);
const SCRIPT=HTML.slice(a,b);

const vazio={ barras:{ entrega:{total:2,entregues:0,nos_carrinhos:1,sem_bipe:1,sem_etiqueta:0,faltam:2},
    bipe:{impressas:2,bipadas:1,faltam:1,antes_sem_bipe:0} },
  destinos:[{codigo:'A',nome:'Carrinho A',n:1,recontado:null},{codigo:'B',nome:'Carrinho B',n:0,recontado:null},
            {codigo:'AG',nome:'Carro da agência',n:0,recontado:null}],
  faltam:[], nos:[], entregues:[], sem_etiqueta:[], sem_carrinho:[], segundo_bipe:false, saidas_hoje:[] };
const sobras=()=>({caixas:[],aguardando:[],pode_confirmar:false});

/* A tela aberta. `rotas` responde cada URL (funcao que devolve o JSON, ou
   lanca para simular a rede caida). Devolve como mexer nela. */
function abrir(rotas){
  const els=new Map();
  const doc={ activeElement:null, body:null, _ouv:{} };
  function novo(id){
    const e={ id, value:'', style:{}, className:'', textContent:'', _html:'', dataset:{},
      classList:{toggle(){},add(){},remove(){}},
      addEventListener(t,fn){ (this['_'+t]=this['_'+t]||[]).push(fn); },
      focus(){ doc.activeElement=this; }, blur(){ if(doc.activeElement===this) doc.activeElement=doc.body; },
      closest(){ return null; },
      get innerHTML(){ return this._html; },
      set innerHTML(h){ this._html=String(h);
        // o navegador recria os campos de dentro: o que estava digitado some
        const re=/id="([^"]+)"/g; let m;
        while((m=re.exec(this._html))){ const velho=els.get(m[1]);
          if(velho && doc.activeElement===velho) doc.activeElement=doc.body;
          els.set(m[1],novo(m[1])); } } };
    return e;
  }
  const pega=id=>{ if(!els.has(id)) els.set(id,novo(id)); return els.get(id); };
  doc.body=novo('body');
  doc.querySelector=s=>s.charAt(0)==='#'?pega(s.slice(1)):null;
  doc.getElementById=pega;
  doc.addEventListener=(t,fn)=>{ (doc._ouv[t]=doc._ouv[t]||[]).push(fn); };
  const timers=[], chamadas=[];
  const fetch=async(url,op)=>{ chamadas.push(url);
    const r=rotas[url]; if(!r) throw new Error('rota sem resposta no teste: '+url);
    const corpo=op&&op.body?JSON.parse(op.body):null;
    const v=r(corpo);                                   // pode lancar: rede caida
    if(v && v.__html) return { status:500, json:async()=>{ throw new SyntaxError('Unexpected token <'); } };
    return { status:200, json:async()=>JSON.parse(JSON.stringify(v)) }; };
  let sons=[];
  const janela={ document:doc, fetch, console, JSON, Date, Math, String, Number, parseInt, Object, Array, Promise,
    encodeURIComponent, setInterval:(fn)=>{ timers.push(fn); }, setTimeout:()=>0,
    location:{href:'/carregamento'}, confirm:()=>true, prompt:()=>null, alert(){},
  };
  janela.window=janela;
  // o som vira registro: true = bipe bom, false = bipe de erro
  const codigo=SCRIPT.replace(/function beep\(ok\)\{/,'function beep(ok){ __sons.push(ok); return;')
    +'\n;__t={ set estado(v){ estado=v; }, set ENT(v){ ENT=v; }, desenhar(){ desenharPainel(); } };';
  janela.__sons=sons;
  vm.createContext(janela);
  vm.runInContext(codigo,janela);
  const espera=()=>new Promise(r=>setImmediate(r));
  return {
    $:pega, doc, chamadas, sons, t:()=>janela.__t,
    async tick(){ for(const fn of timers) fn(); for(let i=0;i<10;i++) await espera(); },
    async bipar(cod){ const s=pega('scan'); s.value=cod;
      for(const fn of (s._keydown||[])) fn({key:'Enter',preventDefault(){}});
      for(let i=0;i<10;i++) await espera(); },
    async ate(){ for(let i=0;i<10;i++) await espera(); },
    carregar:()=>janela.carregar(),
  };
}

/* A ENTREGA com o numero que nao bateu: o passo 3, com o campo do motivo. */
const divergente=(para)=>({sel:['A'],passo:3,para:para||'motorista',foto:'data:x',numero:'4',levou:'',motivo:'',
  res:{ok:false,motivo:'divergente',sistema:5,numero:4},previa:null});
const rotas=extra=>Object.assign({'/api/conferencia/dia':()=>vazio,'/api/carregamento/sobras':sobras},extra||{});
secao('\n── o motivo do "Liberar com divergencia" ─────────────────────────────\n');
caso('ENTREGA: o motivo digitado continua la depois da atualizacao de 4 s, e o foco tambem', async()=>{
  const tela=abrir(rotas());
  await tela.ate(); tela.t().estado='entrega'; tela.t().ENT=divergente(); tela.t().desenhar();
  const m=tela.$('motivoLib'); m.focus(); m.value='o motorista contou a caixa da Ana duas vezes';
  await tela.tick();
  igual(tela.$('motivoLib').value,'o motorista contou a caixa da Ana duas vezes','motivo depois da atualizacao');
  igual(tela.doc.activeElement && tela.doc.activeElement.id,'motivoLib','campo com o foco');
});
caso('ENTREGA: mesmo sem o foco no campo (a pessoa tocou fora), o texto nao se perde no redesenho', async()=>{
  const tela=abrir(rotas());
  await tela.ate(); tela.t().estado='entrega'; tela.t().ENT=divergente(); tela.t().desenhar();
  tela.$('motivoLib').value='faltou a caixa do Joao'; tela.$('scan').focus();
  await tela.tick();
  igual(tela.$('motivoLib').value,'faltou a caixa do Joao','motivo depois do redesenho');
});
caso('AGENCIA: o motivo digitado continua la depois da atualizacao de 4 s', async()=>{
  const tela=abrir(rotas());
  await tela.ate(); tela.t().estado='entrega'; const e=divergente('agencia'); e.sel=['AG']; tela.t().ENT=e; tela.t().desenhar();
  const m=tela.$('motivoLib'); m.focus(); m.value='o atendente bipou uma caixa de outro vendedor';
  await tela.tick();
  igual(tela.$('motivoLib').value,'o atendente bipou uma caixa de outro vendedor','motivo depois da atualizacao');
  igual(tela.doc.activeElement && tela.doc.activeElement.id,'motivoLib','campo com o foco');
});
caso('enquanto a pessoa digita o numero do motorista, a tela nao se redesenha por baixo', async()=>{
  const tela=abrir(rotas());
  await tela.ate(); tela.t().estado='entrega'; tela.t().ENT=divergente(); tela.t().desenhar();
  const antes=tela.chamadas.length;
  tela.$('numEnt').focus(); await tela.tick();
  igual(tela.chamadas.length,antes,'consultas durante a digitacao');
});
caso('com o foco no campo do bipe (o normal), a atualizacao de 4 s continua acontecendo', async()=>{
  const tela=abrir(rotas());
  await tela.ate(); tela.$('scan').focus(); const antes=tela.chamadas.length;
  await tela.tick();
  if(tela.chamadas.length<=antes) throw new Error('a tela parou de se atualizar');
});
secao('\n── o bipe que nao chega ao sistema ───────────────────────────────────\n');

caso('REDE CAIDA: o bipe avisa que nao chegou, com som de erro', async()=>{
  const tela=abrir(rotas({'/api/carregar':()=>{ throw new TypeError('Failed to fetch'); }}));
  await tela.ate(); tela.sons.length=0;
  await tela.bipar('7449000123');
  tem(tela.$('banner').innerHTML,/SEM CONEX/i,'aviso na tela');
  igual(tela.sons,[false],'som');
});

caso('SERVIDOR FORA (responde pagina de erro em vez de JSON): o bipe tambem avisa', async()=>{
  const tela=abrir(rotas({'/api/carregar':()=>({__html:1})}));
  await tela.ate(); tela.sons.length=0;
  await tela.bipar('7449000123');
  tem(tela.$('banner').innerHTML,/SEM CONEX/i,'aviso na tela');
  igual(tela.sons,[false],'som');
});

caso('REDE CAIDA no meio da caixa de varias: o aviso manda recomecar a caixa (o bipe pode ter contado)', async()=>{
  let n=0;
  const tela=abrir(rotas({
    '/api/carregar':()=>({ok:false,motivo:'conferir_pecas',pedido:{id:9,buyer:'Ana',nf:'1'},pecas_total:2,bipadas:0,pecas:[]}),
    '/api/carregar/peca':()=>{ n++; throw new TypeError('Failed to fetch'); }}));
  await tela.ate(); await tela.bipar('ETIQ-VENDA'); await tela.bipar('SKU-A');
  igual(n,1,'tentativas do bipe de peca');
  tem(tela.$('banner').innerHTML,/SEM CONEX/i,'aviso na tela');
  tem(tela.$('banner').innerHTML,/Recome[cç]ar esta caixa/,'caminho para recomecar');
});

secao('\n── o volume bloqueado ────────────────────────────────────────────────\n');

caso('BLOQUEADO diz que esta bloqueado, com o motivo do servidor, e nao "etiqueta nao reconhecida"', async()=>{
  const tela=abrir(rotas({'/api/carregar':()=>({ok:false,motivo:'bloqueado',
    pedido:{id:3,buyer:'Maria Souza',nf:'7449',codigo:'BK180XYZ'},aviso:'SKU "BK180XYZ" nao esta no cadastro. Nao pode ser carregado.'})}));
  await tela.ate(); tela.sons.length=0;
  await tela.bipar('7449000123');
  const h=tela.$('banner').innerHTML;
  tem(h,/BLOQUEADO/,'titulo'); tem(h,/Maria Souza/,'cliente'); tem(h,/nao esta no cadastro/,'motivo do servidor');
  naoTem(h,/não reconhecida/,'aviso'); igual(tela.sons,[false],'som');
});

caso('codigo que o sistema nao conhece continua "Etiqueta nao reconhecida"', async()=>{
  const tela=abrir(rotas({'/api/carregar':()=>({ok:false,motivo:'nao_encontrado'})}));
  await tela.ate(); await tela.bipar('QUALQUER');
  tem(tela.$('banner').innerHTML,/Etiqueta não reconhecida/,'aviso');
});

(async()=>{
  for(const [nome,fn] of pendentes){
    if(!fn){ console.log(nome); continue; }
    try{ await fn(); console.log('ok      '+nome); ok++; }
    catch(e){ console.log('FALHOU  '+nome+'\n        '+e.message); falhas++; }
  }
  console.log('\n'+ok+' ok, '+falhas+' falha(s)\n');
  process.exit(falhas?1:0);
})();

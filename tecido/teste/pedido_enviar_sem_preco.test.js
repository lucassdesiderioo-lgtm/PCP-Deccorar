// CONSERTO de 12/11/2026 — o vendedor SEM `preco.ver` (a regra do valor,
// CLAUDE.md §23) clicava "Enviar" na 611 e levava HTTP 500: o pedido ficava
// gravado como enviado, ganhava numero, mas a tela mostrava erro e a linha da
// auditoria com quem enviou nao era gravada.
//
// A causa: o `detalhe` da rota lia `d.preco.valor_total` do resultado JA
// PODADO (o `preco` nao viaja para quem nao ve o preco de venda), e o
// registro.js roda o `detalhe` depois do manipulador. Este arquivo foi escrito
// ANTES do conserto, e passa pela porta de verdade (registro.montar + as rotas
// do pedido), e nao pelo dominio: o defeito mora entre os dois.
const express=require('express');
const registro=require('../nucleo/registro');
const pedido=require('../dominio/pedido');
const revendas=require('../dominio/revenda');
const catalogo=require('../dominio/catalogo_sm');
const tecido=require('../dominio/tecido');
const config=require('../nucleo/config');
const pessoas=require('../nucleo/pessoas');

const DIRETOR={id:1, nome:'Lucas', papel:'diretor'};
// O vendedor do defeito: lanca pedido, e o setor dele NAO tem preco.ver.
const SEM_PRECO={id:7, nome:'Renato', permissoes:['modulo.entrar','pedido.ler','pedido.lancar']};
const COM_PRECO={id:7, nome:'Renato', permissoes:['modulo.entrar','pedido.ler','pedido.lancar','preco.ver']};

let base=null;
function cena(){
  if(base) return base;
  pessoas.ligar(()=>[{id:7,nome:'Renato'}]);
  config.gravar('pedidoNumeroInicial','4272',DIRETOR.nome);
  const l=tecido.criarLinha({nome:'Rolô'});
  const ab=tecido.criarAbertura({nome:'Screen 1%',linha_id:l.id});
  const cor=tecido.criarCor({nome:'Branco'});
  tecido.criarTecido({linha_id:l.id,abertura_id:ab.id,cor_id:cor.id});
  const m=catalogo.modeloPorNome('Rolô');
  catalogo.ligarColecao({modelo_id:m.id, abertura_id:ab.id, preco_m2_centavos:11000, largura_max_mm:2800});
  catalogo.ligarCorAcessorio({modelo_id:m.id, cor_id:cor.id});
  const t=revendas.tabelas()[0];
  revendas.definirDescontoTabela(t.id,1000,{nome:'teste'});
  const rev=revendas.criar({razao_social:'Revenda LTDA', nome_fantasia:'Revenda',
    tabela_id:t.id, desconto_centesimos:500},DIRETOR);
  revendas.definirVendedor(rev.id,7,DIRETOR);
  base={m,ab,cor,rev};
  return base;
}

function rascunho(){
  const b=cena();
  const p=pedido.criar({revenda_id:b.rev.id, tipo:'pedido'},DIRETOR);
  pedido.acrescentarItem(p.id,{modelo_id:b.m.id, abertura_id:b.ab.id,
    cor_tecido_id:b.cor.id, cor_acessorio_id:b.cor.id, largura_mm:800, altura_mm:1200,
    comando:'direito', rolamento:'frente', adicional:'bando', reducao:'nao'},DIRETOR);
  return p.id;
}

function subir(db,usuario,rotasExtra){
  const app=express();
  app.use(express.json());
  app.use((req,res,next)=>{ req.usuario=usuario; next(); });
  registro.montar(app,db,[require('../rotas/pedido')].concat(rotasExtra||[]));
  return new Promise(r=>{ const s=app.listen(0,()=>r({s,porta:s.address().port})); });
}
async function postar(porta,caminho){
  const r=await fetch('http://localhost:'+porta+caminho,{method:'POST',
    headers:{'Content-Type':'application/json'},body:'{}'});
  return {status:r.status, corpo:await r.json()};
}
const ultimaAud=(db,caminho)=>db.prepare(
  'SELECT * FROM auditoria WHERE caminho=? ORDER BY id DESC LIMIT 1').get(caminho);

module.exports=[

{nome:'⚠️ o vendedor SEM preco.ver envia o pedido: 200, a auditoria grava quem, e nenhum R$ vai pelo fio',
 async executar({igual,db}){
  const id=rascunho();
  const caminho='/api/pedidos/'+id+'/enviar';
  const {s,porta}=await subir(db,SEM_PRECO);
  const log=console.error; console.error=()=>{};
  let r; try{ r=await postar(porta,caminho); } finally { console.error=log; s.close(); }

  igual(r.status,200,'a escrita que gravou responde 200 (era 500)');
  igual(r.corpo.ok,true,'ok');
  igual(r.corpo.dados.marco,'enviado','o pedido andou');
  igual(r.corpo.dados.numero,4273,'com o numero');
  const fio=JSON.stringify(r.corpo);
  igual(/R\$/.test(fio),false,'nenhum R$ na resposta');
  igual(/valor_|preco_|"preco"/.test(fio),false,'nenhum campo de preco na resposta');

  const a=ultimaAud(db,caminho);
  igual(!!a,true,'a linha da auditoria existe');
  igual(a.usuario_id,7,'com o id de quem enviou');
  igual(a.usuario_nome,'Renato','e o nome');
  igual(a.ok,1,'como acao que deu certo');
  igual(/enviou o pedido 4273/.test(a.detalhe||''),true,'dizendo o que foi feito');
}},

{nome:'quem TEM preco.ver continua com o total do pedido no detalhe da auditoria',
 async executar({igual,db}){
  const id=rascunho();
  const caminho='/api/pedidos/'+id+'/enviar';
  const {s,porta}=await subir(db,COM_PRECO);
  let r; try{ r=await postar(porta,caminho); } finally { s.close(); }
  igual(r.status,200,'200');
  const total=r.corpo.dados.preco.valor_total;
  igual(!!total,true,'quem ve o preco recebe o total');
  const a=ultimaAud(db,caminho);
  igual(a.detalhe.indexOf(String(total))>=0,true,'o total entra no detalhe ('+a.detalhe+')');
}},

{nome:'⚠️ a porta: um detalhe que estoura nao derruba a escrita que ja gravou, e a auditoria grava quem fez',
 async executar({igual,db}){
  const extra={rotas:[{metodo:'POST', caminho:'/t/gravou', permissao:'pedido.lancar',
    manipulador:()=>({id:1}),
    detalhe:(req,d)=>'leu '+d.preco.valor_total}]};          // estoura de proposito
  const {s,porta}=await subir(db,SEM_PRECO,[extra]);
  const log=console.error; console.error=()=>{};
  let r; try{ r=await postar(porta,'/t/gravou'); } finally { console.error=log; s.close(); }
  igual(r.status,200,'200, porque a escrita aconteceu');
  igual(r.corpo.dados.id,1,'com o que o manipulador devolveu');
  const a=ultimaAud(db,'/t/gravou');
  igual(!!a,true,'a auditoria grava');
  igual(a.usuario_id,7,'com quem fez');
  igual(a.ok,1,'como acao que deu certo');
}}

];

// O nucleo: envelope unico, erro tratado e — a regra 5 — rota sem permissao
// declarada e NEGADA. Esquecer a chave tem que fechar a porta, nunca abri-la.
const express=require('express');
const registro=require('../nucleo/registro');
const {ErroDeRegra}=require('../nucleo/erros');

// Sobe um servidor de mentira numa porta livre, com tres rotas de exemplo.
function subir(usuario){
  const app=express();
  app.use(express.json());
  app.use((req,res,next)=>{ req.usuario=usuario; next(); });
  registro.montar(app,require('../nucleo/db'),[{rotas:[
    {metodo:'GET', caminho:'/t/ok', permissao:'cadastro.ler', manipulador:()=>({valor:42})},
    {metodo:'GET', caminho:'/t/regra', permissao:'cadastro.ler',
     manipulador:()=>{ throw new ErroDeRegra('nao_pode','Isto nao pode.'); }},
    {metodo:'GET', caminho:'/t/explode', permissao:'cadastro.ler',
     manipulador:()=>{ throw new Error('segredo interno: /root/.session_secret'); }},
    {metodo:'GET', caminho:'/t/esquecida', manipulador:()=>({valor:'nunca'})}  // SEM permissao
  ]}]);
  return new Promise(r=>{ const s=app.listen(0,()=>r({s,porta:s.address().port})); });
}

const pegar=async(porta,caminho)=>{
  const r=await fetch('http://localhost:'+porta+caminho);
  return {status:r.status, corpo:await r.json()};
};

module.exports=[

{nome:'resposta boa vem no envelope {ok:true, dados}', async executar({igual}){
  const {s,porta}=await subir({nome:'Diretor',papel:'diretor'});
  const r=await pegar(porta,'/t/ok');
  s.close();
  igual(r.status,200,'status'); igual(r.corpo.ok,true,'ok'); igual(r.corpo.dados.valor,42,'dados');
}},

{nome:'ErroDeRegra vira 400 com a frase humana do dominio', async executar({igual}){
  const {s,porta}=await subir({nome:'Diretor',papel:'diretor'});
  const r=await pegar(porta,'/t/regra');
  s.close();
  igual(r.status,400,'status'); igual(r.corpo.ok,false,'ok');
  igual(r.corpo.motivo,'nao_pode','motivo'); igual(r.corpo.mensagem,'Isto nao pode.','mensagem');
}},

{nome:'erro inesperado nao vaza nada para o operador', async executar({igual}){
  const {s,porta}=await subir({nome:'Diretor',papel:'diretor'});
  // O stack VAI para o log do servidor — e o que se quer. Aqui ele so e
  // silenciado para nao sujar a saida do teste.
  const log=console.error; console.error=()=>{};
  const r=await pegar(porta,'/t/explode');
  console.error=log;
  s.close();
  igual(r.status,500,'status'); igual(r.corpo.motivo,'erro_interno','motivo');
  igual(/session_secret/.test(JSON.stringify(r.corpo)),false,'a mensagem interna nao pode aparecer');
}},

{nome:'ROTA SEM PERMISSAO DECLARADA E NEGADA (regra 5)', async executar({igual}){
  // Ate para o diretor, que pode tudo: quem nao declarou nao abre.
  const {s,porta}=await subir({nome:'Diretor',papel:'diretor'});
  const r=await pegar(porta,'/t/esquecida');
  s.close();
  igual(r.status,403,'status'); igual(r.corpo.motivo,'rota_sem_permissao','motivo');
}},

{nome:'cortador nao descarta sobra; diretor descarta', async executar({igual}){
  const {pode}=require('../nucleo/permissoes');
  igual(pode({papel:'cortador'},'sobra.criar'),true,'cortador cadastra sobra');
  igual(pode({papel:'cortador'},'sobra.descartar'),false,'cortador NAO descarta');
  igual(pode({papel:'diretor'},'sobra.descartar'),true,'diretor descarta');
  igual(pode(null,'sobra.ler'),false,'sem sessao nao le nada');
}}

];

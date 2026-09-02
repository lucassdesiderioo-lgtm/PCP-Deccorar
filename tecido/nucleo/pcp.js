// A UNICA porta de conversa com o PCP do Mercado Livre.
//
// O modulo NAO le o banco do PCP nem o segredo do cookie dele. Ele pergunta
// por HTTP: "quem e o dono deste cookie?". A diferenca importa — assim o PCP
// continua sendo o dono unico da autenticacao, e o dia em que ele trocar o
// jeito de assinar a sessao, aqui nao quebra nada.
//
// Cookie atravessa porta: 3010 e 3020 sao o mesmo host para o navegador, e o
// 'sess' do PCP chega aqui sozinho. E isso que faz o login unico funcionar
// sem nenhuma tela intermediaria.
const config=require('./config');

// Cache curto por cookie. Uma tela do operador dispara varias chamadas
// seguidas, e perguntar ao PCP em todas seria uma conversa por clique. Cinco
// segundos e curto o bastante para um bloqueio no PCP valer quase na hora.
const VALIDADE=5000;
const cache=new Map();

const endereco=()=>{
  let u;
  try{ u=String(config.ler('pcpUrl')||'').trim(); }catch(e){ return null; }
  return u?u.replace(/\/+$/,''):null;
};

const ligado=()=>!!endereco();

// Devolve {id, nome} de quem esta logado no PCP, ou null.
// NUNCA lanca: o PCP fora do ar nao pode derrubar esta tela — quem nao
// conseguir entrar por aqui ainda entra com o PIN proprio.
async function quemEsta(cookie){
  const base=endereco();
  if(!base||!cookie) return null;

  const agora=Date.now();
  const guardado=cache.get(cookie);
  if(guardado&&agora-guardado.em<VALIDADE) return guardado.usuario;

  let usuario=null;
  try{
    const controle=new AbortController();
    const relogio=setTimeout(()=>controle.abort(),2000);
    const r=await fetch(base+'/api/auth/eu',{
      headers:{cookie}, signal:controle.signal, redirect:'manual'
    });
    clearTimeout(relogio);
    if(r.ok){
      const j=await r.json();
      // O PCP responde sem envelope: {logado, id, nome, areas}.
      if(j&&j.logado&&j.id) usuario={id:j.id, nome:String(j.nome||'').trim()};
    }
  }catch(e){ usuario=null; }

  cache.set(cookie,{em:agora, usuario});
  if(cache.size>500) cache.clear();
  return usuario;
}

// As pessoas cadastradas no PCP, para a tela de acessos deste modulo listar
// quem existe e o diretor liberar. Sem PIN, sem senha: so id e nome.
async function pessoas(){
  const base=endereco();
  if(!base) return [];
  try{
    const controle=new AbortController();
    const relogio=setTimeout(()=>controle.abort(),3000);
    const r=await fetch(base+'/api/auth/pessoas',{signal:controle.signal});
    clearTimeout(relogio);
    if(!r.ok) return [];
    const j=await r.json();
    const lista=Array.isArray(j)?j:(j&&j.dados)||[];
    return lista.map(p=>({id:p.id, nome:String(p.nome||'').trim()})).filter(p=>p.id&&p.nome);
  }catch(e){ return []; }
}

const esquecer=()=>cache.clear();

module.exports={quemEsta, pessoas, ligado, endereco, esquecer};

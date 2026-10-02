/* PARA ONDE A PESSOA VAI — dono unico (spec NAVEGACAO-E-LINGUAGEM, fase 1).

   Responde, a partir das areas da sessao:
     - qual a primeira tela da MEDIDA PADRAO que ela alcanca (ou null);
     - se ela alcanca o SOB MEDIDA;
     - se alcanca as DUAS (e so ai o atalho direto aparece nas barras);
     - para onde ela vai depois do PIN.

   ⚠️ ESTA LISTA EXISTIA EM DUAS COPIAS, E ELAS JA TINHAM DIVERGIDO. O
   `login.html` tinha o inventario e a `setor.html` nao; e a do login so
   reconhecia `sobmedida` e `sobmedida_adm` como "tem sob medida" — o vendedor
   (`sobmedida_venda`) e os cinco setores da producao (`sobmedida_serralheria`
   etc.) ficavam de fora, e quem SO tinha essas areas voltava para o login
   depois de digitar o PIN. Hoje o login, a /setor e as duas barras leem daqui,
   pelo `/api/auth/eu` (e pela resposta do proprio login).

   Esconder o botao NAO e seguranca: quem tranca continua sendo o `auth.js` e o
   portao do `tecido/montar.js`. Isto so evita mostrar um caminho que da "nao". */

// A ordem e a da prioridade de chegada: a primeira area que a pessoa tem
// decide a tela. Tela nova da medida padrao entra aqui.
const PADRAO=[
  ['admin','/admin'], ['painel','/painel'], ['operador','/operador'],
  ['montagem','/montagem'], ['embalagem','/embalagem'], ['carregamento','/carregamento'],
  ['expedicao','/expedicao'], ['relatorios','/relatorios'], ['necessidade','/planejamento'],
  ['recebimento','/recebimento'], ['inventario','/inventario'], ['devolucao','/devolucao']
];

const SOBMEDIDA='/sobmedida';

// 'admin' alcanca o sob medida: o portao do modulo le a area 'admin' como
// diretor (tecido/nucleo/acesso.js). Toda area do modulo comeca com
// 'sobmedida' — a de bancada, a de cadastros, a de venda e as cinco da producao.
function alcancaSobMedida(areas){
  return (areas||[]).some(a=>a==='admin' || /^sobmedida(_|$)/.test(a));
}

function telaPadrao(areas){
  const a=areas||[];
  for(const [area,tela] of PADRAO) if(a.indexOf(area)>=0) return tela;
  return null;
}

function destino(areas){
  const padrao=telaPadrao(areas), sob=alcancaSobMedida(areas);
  return {
    padrao,                         // primeira tela da medida padrao, ou null
    sobmedida: sob ? SOBMEDIDA : null,
    duas: !!(padrao && sob),
    // Quem alcanca as duas escolhe; quem alcanca uma so vai direto. Escolha de
    // uma opcao so nao e escolha — e um toque a mais, todo dia.
    inicial: (padrao && sob) ? '/setor' : (sob ? SOBMEDIDA : (padrao || '/login'))
  };
}

module.exports={destino, telaPadrao, alcancaSobMedida, PADRAO, SOBMEDIDA};

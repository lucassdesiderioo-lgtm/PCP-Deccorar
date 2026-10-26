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

/* Desde a fase 2 da ACESSOS-UNIFICADOS (26/10/2026) o PCP grava uma area so
   para o modulo, 'sobmedida', em quem tem a chave de entrar ou uma bancada da
   producao (PERM_AREA no acesso.js). O regex aceita tambem as areas antigas
   (`sobmedida_adm` etc.): o boot da migracao recalcula a sombra de todo
   mundo, mas uma sombra velha esquecida num banco restaurado nao pode mandar
   a pessoa de volta ao login. A area 'admin' sozinha NAO alcanca (fase 1). */
function alcancaSobMedida(areas){
  return (areas||[]).some(a=>/^sobmedida(_|$)/.test(a));
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

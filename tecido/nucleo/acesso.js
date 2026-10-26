// QUEM ENTRA E O QUE PODE — a pergunta e feita ao PCP, chave a chave.
//
// ⚠️ ATE 26/10/2026 ESTE ARQUIVO TRADUZIA AREA EM PAPEL (`papelDe`), e essa
// traducao falhou em silencio tres vezes: armadilhas #13, #28 e #34. A area
// era SOMBRA das permissoes do PCP, o papel era uma segunda conta em cima da
// sombra, e cada ponta podia sumir sem erro. Desde a fase 2 da spec
// ACESSOS-UNIFICADOS as chaves deste modulo moram na tela de Acessos do PCP,
// no grupo "Sob medida", como `sobmedida.<chave>` — e o portao so pergunta
// ao PCP quais delas a pessoa tem. Nao ha mais papel nem area aqui dentro.
//
// ⚠️ E A AREA 'admin' DO PCP CONTINUA NAO ABRINDO O MODULO (fase 1): nenhuma
// chave daqui e de nivel admin, entao o setor Admin e o Comprador nao carregam
// nenhuma. Quem tem tudo e o Admin Geral (que tem todas as chaves do PCP) e o
// setor "Sob medida / Cadastros".
const {CHAVES,PREFIXO,pode}=require('./permissoes');

/* ── OS CINCO SETORES DE PRODUCAO (fase 5-A, 24/09/2026) ──────────────────
   Decisao do dono: "tem que ser possivel criar cada setor no controle de
   acesso, e quem tem acesso pega o tablet de manha e ve o que tem para
   fazer". Uma chave do PCP por bancada (`sobmedida.<setor>`).

   ⚠️ A ORDEM E A DA FABRICA, nao a alfabetica, e e ela que a fila usa para
   desempatar. Serralheria e colecao trabalham em paralelo; montagem espera
   as duas; revisao espera a montagem; embalagem espera a revisao (§4.15 da
   spec). Ordenar por nome poria "colecao" antes de "serralheria" e a tela
   leria como se a ordem do trabalho fosse essa. */
const SETORES = [
  {chave:'serralheria', nome:'Serralheria'},
  {chave:'colecao',     nome:'Coleção'},
  {chave:'montagem',    nome:'Montagem'},
  {chave:'revisao',     nome:'Revisão'},
  {chave:'embalagem',   nome:'Embalagem'}
];

/* A SESSAO DESTE MODULO, montada das permissoes do PCP. `chavesPcp` e a
   lista de chaves que o PCP diz que a pessoa tem (`permissoesDe`); daqui so
   passam as que comecam por `sobmedida.`, sem o prefixo.

   ⚠️ O SETOR NAO SAI DAS PERMISSOES DE CORTE OU VENDA, e isso e o desenho que
   ja era: quem vende e embala continua com a bancada. Os setores sao as
   chaves `sobmedida.serralheria` etc. que a pessoa tem, na ordem da FABRICA —
   a tela desenha a fila por esta lista, e a ordem em que alguem marcou as
   caixinhas nao descreve nada. O setor "Sob medida / Cadastros" carrega as
   cinco, e e assim que a chefia continua bipando todas (era o `*` do diretor).

   Sem `modulo.entrar` — nem setor nenhum, que tambem entra (POR_SETOR) — a
   pessoa NAO ENTRA: fechado por padrao. */
function daSessaoDoPcp(usuario, chavesPcp){
  if(!usuario) return null;
  const pcp=new Set(chavesPcp||usuario.permissoes||[]);
  const permissoes=CHAVES.map(c=>c.chave).filter(k=>pcp.has(PREFIXO+k));
  const setores=SETORES.filter(s=>pcp.has(PREFIXO+s.chave)).map(s=>s.chave);
  const u={id:usuario.id, nome:usuario.nome, permissoes, setores, via:'pcp'};
  return pode(u,'modulo.entrar') ? u : null;
}

module.exports={SETORES, daSessaoDoPcp};

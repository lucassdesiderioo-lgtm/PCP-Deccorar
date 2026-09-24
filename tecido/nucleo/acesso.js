// AREA DO PCP -> PAPEL DESTE MODULO.
//
// Esta e a peca que faz a liberacao morar num lugar so. O PCP ja tem uma lista
// de areas por pessoa (Admin -> Acessos); duas delas passam a valer aqui, e o
// modulo nao guarda mais um cadastro proprio de quem entra.
//
// Por que um tradutor em vez de usar a area direto: o dominio deste modulo
// raciocina por CHAVE de permissao ('sobra.descartar'), nao por cargo. O papel
// e o agrupador — e ele continua sendo o unico conceito que rotas e telas
// conhecem. Trocar o modelo de acesso do PCP amanha mexe neste arquivo, e em
// nenhum outro.
//
// ⚠️ ORDEM IMPORTA: 'admin' e o dono do PCP e entra como diretor. Quem tem
// so 'sobmedida' e bancada. Nenhuma area = NAO ENTRA — fechado por padrao,
// que e a regra 4 do docs/CONTROLE-DE-ACESSO.md.

const AREA_BANCADA = 'sobmedida';        // corta, bipa sobra, imprime etiqueta
const AREA_CHEFIA  = 'sobmedida_adm';    // + cadastros, parametros, descarte
const AREA_VENDA   = 'sobmedida_venda';  // simulador, catalogo e a carteira de revendas

/* ── OS CINCO SETORES DE PRODUCAO (fase 5-A, 24/09/2026) ──────────────────
   Decisao do dono: "tem que ser possivel criar cada setor no controle de
   acesso, e quem tem acesso pega o tablet de manha e ve o que tem para
   fazer". Uma area do PCP por bancada.

   ⚠️ A ORDEM E A DA FABRICA, nao a alfabetica, e e ela que a fila usa para
   desempatar. Serralheria e colecao trabalham em paralelo; montagem espera
   as duas; revisao espera a montagem; embalagem espera a revisao (§4.15 da
   spec). Ordenar por nome poria "colecao" antes de "serralheria" e a tela
   leria como se a ordem do trabalho fosse essa. */
const SETORES = [
  {chave:'serralheria', area:'sobmedida_serralheria', nome:'Serralheria'},
  {chave:'colecao',     area:'sobmedida_colecao',     nome:'Coleção'},
  {chave:'montagem',    area:'sobmedida_montagem',    nome:'Montagem'},
  {chave:'revisao',     area:'sobmedida_revisao',     nome:'Revisão'},
  {chave:'embalagem',   area:'sobmedida_embalagem',   nome:'Embalagem'}
];

// As duas linhas que entram na lista de areas do PCP. O texto e o que o
// diretor le na tela de acessos — por isso diz o que a pessoa passa a poder,
// nao o nome tecnico da area.
const AREAS_PCP = [
  {id:AREA_BANCADA, nome:'Sob medida — bancada (corte, sobras, etiquetas)'},
  {id:AREA_CHEFIA,  nome:'Sob medida — cadastros e parametros'},
  {id:AREA_VENDA,   nome:'Sob medida — venda (simulador, catalogo e revendas)'}
].concat(SETORES.map(s => (
  {id:s.area, nome:'Sob medida — produção: '+s.nome}
)));

/* ⚠️ A ORDEM E DO MAIS LARGO PARA O MAIS ESTREITO, e quem tem duas areas
   fica com a maior. Nao ha soma de papeis: papel e agrupador de chaves, e
   somar dois viraria um terceiro que ninguem declarou — e que nenhuma tela
   saberia nomear.

   ⚠️ E O VENDEDOR VEM DEPOIS DA BANCADA de proposito. Nao e ranking de
   importancia: e que quem tem as duas areas corta, e quem corta precisa da
   tela de corte. O vendedor com area de bancada e caso que nao existe hoje;
   no dia em que existir, sera uma pessoa que corta E vende, e aí o papel
   dela vai ter que ser desenhado — nao adivinhado aqui. */
function papelDe(usuario){
  if(!usuario) return null;
  const areas=usuario.areas||[];
  if(areas.includes('admin')||areas.includes(AREA_CHEFIA)) return 'diretor';
  if(areas.includes(AREA_BANCADA)) return 'cortador';
  if(areas.includes(AREA_VENDA)) return 'vendedor';
  /* PRODUCAO vem por ultimo, e isso nao e ranking: quem tem duas areas fica
     com o papel mais largo, e os SETORES dele continuam valendo do mesmo
     jeito — sao duas contas diferentes (ver setoresDe). O vendedor que
     tambem embala nao perde a bancada ao ganhar a carteira. */
  if(SETORES.some(s => areas.includes(s.area))) return 'producao';
  return null;
}

/* ⚠️ O SETOR NAO SAI DO PAPEL, E ISSO E O DESENHO. O papel e a area MAIS
   LARGA (uma so, sem soma — ver o bloco acima); os setores sao TODAS as
   areas de bancada que a pessoa tem. Derivar um do outro faria quem ganha a
   carteira perder a bancada, e a fabrica descobriria isso com o tablet na
   mao numa segunda-feira.

   O DIRETOR BIPA OS CINCO, por coerencia com o `*` das chaves dele: recusar
   o dono numa bancada seria trava disparando no caso normal (armadilha #6 do
   CLAUDE.md). O bipe grava o nome de quem fez de qualquer jeito, entao o
   rastro nao se perde.

   Devolve na ordem da FABRICA, nunca na de marcacao: a tela desenha a fila
   por esta lista, e a ordem em que alguem marcou as caixinhas nao descreve
   nada. */
function setoresDe(usuario){
  if(!usuario) return [];
  const areas=usuario.areas||[];
  const tudo = areas.includes('admin') || areas.includes(AREA_CHEFIA);
  return SETORES.filter(s => tudo || areas.includes(s.area)).map(s => s.chave);
}

// O usuario como o dominio deste modulo espera ve-lo. O `id` continua sendo o
// do PCP: a auditoria daqui grava o NOME, e o id so serve para nao confundir
// dois homonimos.
function daSessaoDoPcp(usuario){
  const papel=papelDe(usuario);
  if(!papel) return null;
  /* `setores` viaja junto com o usuario porque e o dominio da producao que
     decide "este bipe e seu?", e nao a rota: a rota tem UMA chave declarada e
     o setor vem no corpo, entao conferir la seria conferir a pergunta errada. */
  return {id:usuario.id, nome:usuario.nome, papel, setores:setoresDe(usuario), via:'pcp'};
}

const temAcesso = usuario => !!papelDe(usuario);

module.exports={AREA_BANCADA, AREA_CHEFIA, AREA_VENDA, SETORES, AREAS_PCP, papelDe, setoresDe, daSessaoDoPcp, temAcesso};

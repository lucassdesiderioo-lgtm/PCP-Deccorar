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

const AREA_BANCADA = 'sobmedida';      // corta, bipa sobra, imprime etiqueta
const AREA_CHEFIA  = 'sobmedida_adm';  // + cadastros, parametros, descarte

// As duas linhas que entram na lista de areas do PCP. O texto e o que o
// diretor le na tela de acessos — por isso diz o que a pessoa passa a poder,
// nao o nome tecnico da area.
const AREAS_PCP = [
  {id:AREA_BANCADA, nome:'Sob medida — bancada (corte, sobras, etiquetas)'},
  {id:AREA_CHEFIA,  nome:'Sob medida — cadastros e parametros'}
];

function papelDe(usuario){
  if(!usuario) return null;
  const areas=usuario.areas||[];
  if(areas.includes('admin')||areas.includes(AREA_CHEFIA)) return 'diretor';
  if(areas.includes(AREA_BANCADA)) return 'cortador';
  return null;
}

// O usuario como o dominio deste modulo espera ve-lo. O `id` continua sendo o
// do PCP: a auditoria daqui grava o NOME, e o id so serve para nao confundir
// dois homonimos.
function daSessaoDoPcp(usuario){
  const papel=papelDe(usuario);
  if(!papel) return null;
  return {id:usuario.id, nome:usuario.nome, papel, via:'pcp'};
}

const temAcesso = usuario => !!papelDe(usuario);

module.exports={AREA_BANCADA, AREA_CHEFIA, AREAS_PCP, papelDe, daSessaoDoPcp, temAcesso};

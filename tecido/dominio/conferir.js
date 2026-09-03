// O QUE A BANCADA CRIOU E A CHEFIA AINDA NAO OLHOU.
//
// A regra velha era "cadastro e da chefia". Ela nao fazia a bancada esperar:
// fazia a bancada MENTIR. Rolo na mao, largura fora da lista e ninguem para
// cadastrar, e o que sai e o toque no botao de 2,00 — a partir dali o encaixe
// corta por uma largura que aquele tubo nao tem. Armadilha #6 do CLAUDE.md na
// letra: trava que dispara no caso normal vira desvio, e o desvio acontece
// fora da vista do sistema.
//
// A troca e de ORDEM, e so:
//
//   ANTES   pedir  ->  esperar a chefia  ->  lancar
//   AGORA   lancar ->  marcar            ->  a chefia confere quando puder
//
// Nada deixou de ser revisado. O que a chefia perdeu foi a VEZ, nao o
// controle: ela renomeia, apaga ou aprova depois, com o rolo ja no lugar.
//
// ⚠️ ESTE ARQUIVO E O DONO UNICO DE "O QUE FALTA CONFERIR". Cada tela com a
// sua consulta significaria o dia em que uma tabela nova nascesse marcavel e
// nao aparecesse em lista nenhuma — e cadastro marcado que ninguem ve e pior
// do que cadastro nao marcado: ele promete uma revisao que nao acontece.
const db=require('../nucleo/db');
const {exigir}=require('../nucleo/erros');

const fmtM=v=>(Math.round(v*100)/100).toFixed(2).replace('.',',')+' m';

/* Para cada cadastro que a bancada pode criar: como se le na tela, e onde a
   chefia vai arrumar se estiver errado. O "onde" existe porque uma lista que
   acusa sem dizer o caminho manda a pessoa procurar — e ela desiste. */
const TIPOS={
  largura_bobina:{
    oque:'Largura de bobina', onde:'Cadastros → Tecido → Larguras de bobina',
    sql:`SELECT id, criado_por, criado_em, valor FROM largura_bobina WHERE conferir=1`,
    rotulo:r=>fmtM(r.valor)
  },
  /* O FORNECEDOR CAI AQUI POR DOIS CAMINHOS: criado pela bancada com o rolo
     na mao, e — na migracao 9 — semeado do texto livre que ja existia. O
     segundo e o mais importante: e nesta lista que a chefia vai achar
     'Ecotex' e 'ecotex' lado a lado e juntar os dois. */
  fornecedor:{
    oque:'Fornecedor', onde:'Cadastros → Tecido → Fornecedores',
    sql:`SELECT id, criado_por, criado_em, nome FROM fornecedor WHERE conferir=1`,
    rotulo:r=>r.nome
  },
  haste:{
    oque:'Haste', onde:'Cadastros → Enderecos',
    sql:`SELECT h.id, h.criado_por, h.criado_em, h.nome, h.armazem_chave
           FROM haste h WHERE h.conferir=1`,
    rotulo:r=>r.armazem_chave+' · Haste '+r.nome
  },
  andar:{
    oque:'Andar', onde:'Cadastros → Enderecos',
    sql:`SELECT a.id, a.criado_por, a.criado_em, a.nome, h.nome AS haste_nome, h.armazem_chave
           FROM andar a JOIN haste h ON h.id=a.haste_id WHERE a.conferir=1`,
    rotulo:r=>r.armazem_chave+' · '+r.haste_nome+'-'+r.nome
  },
  nivel:{
    oque:'Nivel', onde:'Cadastros → Enderecos',
    sql:`SELECT n.id, n.criado_por, n.criado_em, n.nome,
                a.nome AS andar_nome, h.nome AS haste_nome, h.armazem_chave
           FROM nivel n JOIN andar a ON a.id=n.andar_id JOIN haste h ON h.id=a.haste_id
          WHERE n.conferir=1`,
    rotulo:r=>r.armazem_chave+' · '+r.haste_nome+'-'+r.andar_nome+'-'+r.nome
  }
};

/* Tudo que espera conferencia, mais antigo primeiro. Mais antigo em cima
   porque e ele que ja esta valendo ha mais tempo: se o nome saiu torto, e o
   que mais gente ja leu errado na estante. */
function listar(){
  const fora=[];
  for(const tipo in TIPOS){
    const t=TIPOS[tipo];
    for(const r of db.prepare(t.sql).all())
      fora.push({tipo, id:r.id, oque:t.oque, onde:t.onde, rotulo:t.rotulo(r),
                 criado_por:r.criado_por, criado_em:r.criado_em});
  }
  return fora.sort((a,b)=>String(a.criado_em||'').localeCompare(String(b.criado_em||'')));
}

/* "Conferi" nao muda o cadastro — so tira ele da lista. E de proposito: a
   correcao tem botao proprio (Renomear, Apagar), e um "conferir" que tambem
   arrumasse esconderia qual das duas coisas a pessoa fez. */
function marcar(tipo,id){
  const t=TIPOS[tipo];
  exigir(t,'tipo_desconhecido','Cadastro "'+tipo+'" nao entra na lista de conferencia.');
  const r=db.prepare('UPDATE '+tipo+' SET conferir=0 WHERE id=?').run(id);
  exigir(r.changes,'cadastro_inexistente','Cadastro nao encontrado.');
  return {conferido:true, tipo, id};
}

const quantos=()=>listar().length;

module.exports={listar,marcar,quantos,TIPOS};

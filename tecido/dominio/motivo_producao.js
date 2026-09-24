// OS MOTIVOS DA RECUSA DA PRODUCAO — secao 4.16 da spec.
//
// Cada motivo e cadastrado ja dizendo PARA ONDE a peca volta. Quem recusa
// escolhe so o motivo: duas escolhas na bancada e uma a mais para quem esta
// de luva, e a segunda errada e trabalho perdido.
//
// ⚠️ O MOTIVO APONTA O COMPONENTE, E NAO O SETOR — e o setor sai do
// componente, lido ao vivo. A spec escreve "Tubo maior -> Serralheria", mas
// a serralheria faz quatro pecas: apontar o setor ou e ambiguo, ou refaz as
// quatro. E dois campos dizendo a mesma coisa divergem no dia em que alguem
// editar so um (armadilha #12).
const {ErroDeRegra,exigir}=require('../nucleo/erros');
const d=require('../dados/motivo_producao');

/* ⚠️ COMPONENTE SEM ETIQUETA NAO PODE SER MOTIVO. A reducao de peso e os
   kits nao geram codigo (fase 4-A), entao nunca foram bipados por ninguem:
   nao ha trabalho para reabrir nem quem devolver. Aceitar aqui criaria um
   motivo que so trava na hora de usar, com a peca na mao — e a divida 18 do
   CLAUDE.md pela porta do cadastro: a regra existe, e nao pega em ninguem. */
function conferirComponente(chave){
  const k=String(chave||'').trim();
  exigir(k,'componente_obrigatorio','Diga qual peça este motivo manda refazer.');
  const c=d.componente(k);
  exigir(c,'componente_inexistente','Não existe a peça "'+k+'" no cadastro de componentes.');
  exigir(c.gera_etiqueta,'componente_sem_etiqueta',
    'A peça "'+c.nome+'" não tem etiqueta, então ninguém a bipa — não há trabalho para refazer. '+
    'Escolha uma peça que a bancada bipa.');
  return c;
}

function criar(dados){
  const nome=String((dados&&dados.nome)||'').trim();
  exigir(nome,'nome_vazio','Informe o motivo.');
  const c=conferirComponente(dados&&dados.componente_chave);
  if(d.listar().some(m=>m.nome.toLowerCase()===nome.toLowerCase()))
    throw new ErroDeRegra('motivo_repetido','O motivo "'+nome+'" já existe.');
  return d.criar({nome, componente_chave:c.chave, ordem:(dados&&dados.ordem)||0});
}

/* Renomear e ativar/desativar passam pelo `_lista`; trocar a peca de destino
   tem a mesma guarda da criacao. Cadastro nao se apaga — ele se desativa —,
   e o desativado continua na lista da chefia porque ha recusa apontando para
   ele: apagar quebraria a historia que o indicador da secao 4.17 le. */
function atualizar(id,dados){
  exigir(d.porId(id),'motivo_inexistente','Motivo não encontrado.');
  const campos=Object.assign({},dados);
  if(campos.componente_chave!==undefined)
    campos.componente_chave=conferirComponente(campos.componente_chave).chave;
  const r=d.atualizar(id,campos);
  /* O `_lista` nao sabe das colunas extras na EDICAO — a troca de peca e
     feita aqui, ao lado da guarda que a autoriza. */
  if(campos.componente_chave!==undefined)
    require('../nucleo/db').prepare(
      'UPDATE sm_motivo_producao SET componente_chave=? WHERE id=?')
      .run(campos.componente_chave,id);
  return d.porIdComDestino(id)||r;
}

module.exports={
  criar, atualizar,
  listar:()=>d.comDestino(),
  ativos:()=>d.ativosComDestino(),
  porId:id=>d.porIdComDestino(id),
  componentesPossiveis:()=>d.possiveis()
};

// QUEM COMPRA — secao 4.12 e 4.13 da spec SOBMEDIDA-PEDIDO-REVENDA.
//
// As tres regras que atravessam o arquivo sao as mesmas do catalogo, e todas
// sao licao paga do PCP: campo ausente nao e campo vazio (divida 15),
// numero impossivel e recusado e nunca clampado (armadilha #25), e nada e
// gravado antes de validar.
//
// A quarta e desta fase: o VENDEDOR e gente do PCP, e nao um cadastro daqui.
// O que se prova aqui e que a porta por onde a lista chega entrega id e nome
// e MAIS NADA — nem PIN, nem area.
const revenda=require('../dominio/revenda');
const pessoas=require('../nucleo/pessoas');
const dia=require('../nucleo/dia');

const CNPJ_BOM='11222333000181', CNPJ_RUIM='11222333000180';

// O "PCP de mentira": o que a porta entrega, e o lixo que ela NAO pode
// deixar passar junto.
const DO_PCP=[
  {id:7, nome:'Renato',  pin_hash:'NAO PODE VAZAR', salt:'nem isto', areas:'admin'},
  {id:9, nome:'Lucas',   pin_hash:'NAO PODE VAZAR', salt:'nem isto', areas:'admin'}
];

const limpar=db=>{
  db.prepare('DELETE FROM sm_revenda_endereco').run();
  db.prepare('DELETE FROM sm_revenda_contato').run();
  db.prepare('DELETE FROM sm_revenda').run();
  db.prepare("DELETE FROM sm_preco_historico WHERE alvo IN ('tabela','revenda')").run();
  db.prepare('UPDATE sm_tabela_preco SET desconto_centesimos=NULL').run();
  pessoas.ligar(()=>DO_PCP);
};

const nova=(d)=>revenda.criar(Object.assign({razao_social:'Casa das Cortinas LTDA',
  nome_fantasia:'Casa das Cortinas'},d||{}),{nome:'Lucas'});

module.exports=[

// ── O cadastro ───────────────────────────────────────────────────────────
{nome:'a revenda nasce com o minimo: razao social e nome fantasia',
 executar({igual,recusa,db}){
  limpar(db);
  const r=nova();
  igual(r.nome_fantasia,'Casa das Cortinas','gravou');
  igual(r.ativo,1,'nasce ativa');
  igual(r.entrega,'entrega','e entregando, que e o caso normal');
  igual(r.desconto_centesimos,0,'sem desconto extra — e ZERO, nao "ainda nao se sabe"');
  igual(r.valor_limite_credito_centavos,null,'o limite, esse sim, nasce em branco');
  recusa(()=>revenda.criar({nome_fantasia:'Sem razao'}),'razao_social_obrigatoria','sem razao social');
  recusa(()=>revenda.criar({razao_social:'Sem fantasia LTDA'}),'nome_obrigatorio','sem nome fantasia');
}},

{nome:'duas revendas nao dividem o mesmo nome fantasia',
 executar({igual,recusa,db}){
  limpar(db); nova();
  recusa(()=>nova(),'nome_repetido','o nome fantasia e como a equipe chama a revenda');
  igual(revenda.listar().length,1,'e a segunda nao ficou gravada pela metade');
}},

{nome:'CNPJ torto e RECUSADO; vazio passa; o que fica gravado e so digito',
 executar({igual,recusa,db}){
  limpar(db);
  recusa(()=>nova({cnpj:CNPJ_RUIM}),'cnpj_invalido','digito verificador nao fecha');
  recusa(()=>nova({cnpj:'1122233300018'}),'cnpj_invalido','treze digitos');
  igual(revenda.listar().length,0,'nada foi gravado nas duas recusas');
  const r=nova({cnpj:'11.222.333/0001-81'});
  igual(r.cnpj,CNPJ_BOM,'a pontuacao sai, o numero fica');
  const s=revenda.criar({razao_social:'Sem CNPJ ainda ME',nome_fantasia:'Sem CNPJ'},{nome:'Lucas'});
  igual(s.cnpj,null,'revenda sem CNPJ existe, e nao e pendencia de gravacao');
}},

{nome:'CAMPO AUSENTE NAO E CAMPO VAZIO — editar so mexe no que veio',
 executar({igual,db}){
  limpar(db);
  const r=nova({cnpj:CNPJ_BOM,fiscal_cidade:'Bauru',observacao:'cliente antigo'});
  revenda.editar(r.id,{fiscal_cidade:'Marilia'});
  const d=revenda.porId(r.id);
  igual(d.fiscal_cidade,'Marilia','mudou o que veio');
  igual(d.cnpj,CNPJ_BOM,'e nao apagou o CNPJ que nao veio');
  igual(d.observacao,'cliente antigo','nem a observacao');
  revenda.editar(r.id,{observacao:''});
  igual(revenda.porId(r.id).observacao,'','mas vazio EXPLICITO apaga — e decisao de quem editou');
}},

{nome:'desconto impossivel e recusado, NUNCA clampado',
 executar({igual,recusa,db}){
  limpar(db);
  const r=nova();
  recusa(()=>revenda.editar(r.id,{desconto_centesimos:-1}),'desconto_invalido','negativo');
  recusa(()=>revenda.editar(r.id,{desconto_centesimos:10001}),'desconto_invalido','mais de 100%');
  recusa(()=>revenda.editar(r.id,{desconto_centesimos:5.5}),'desconto_invalido','fracao de centesimo');
  recusa(()=>revenda.editar(r.id,{desconto_centesimos:'cinco'}),'desconto_invalido','texto');
  igual(revenda.porId(r.id).desconto_centesimos,0,'e o desconto gravado nao se mexeu');
  revenda.editar(r.id,{desconto_centesimos:500});
  igual(revenda.porId(r.id).desconto_centesimos,500,'5,00% se escreve 500');
}},

// ── O limite de credito ──────────────────────────────────────────────────
{nome:'O LIMITE TEM PORTA PROPRIA — nao entra pelo editar',
 executar({igual,recusa,db}){
  limpar(db);
  const r=nova();
  recusa(()=>revenda.editar(r.id,{valor_limite_credito_centavos:500000}),'limite_por_outra_porta',
    'mudar limite sem rastro e o que faz ninguem saber quem autorizou');
  igual(revenda.porId(r.id).valor_limite_credito_centavos,null,'nada mudou');
}},

{nome:'definir o limite grava o historico e carimba a revisao',
 executar({igual,db}){
  limpar(db);
  const r=nova();
  revenda.definirLimite(r.id,500000,{nome:'Lucas'});
  const d=revenda.porId(r.id);
  igual(d.valor_limite_credito_centavos,500000,'R$ 5.000,00');
  igual(d.limite_revisado_em,dia.hoje(),'quem define o limite acabou de revisa-lo');
  const h=revenda.historicoLimite(r.id);
  igual(h.length,1,'uma linha de historico');
  igual(h[0].de,null,'de: nao tinha');
  igual(h[0].para,500000,'para: 5.000');
  igual(h[0].usuario_nome,'Lucas','e quem foi');
  revenda.definirLimite(r.id,500000,{nome:'Lucas'});
  igual(revenda.historicoLimite(r.id).length,1,'gravar o MESMO valor nao inventa linha');
}},

{nome:'a revisao do limite vence, e quem venceu aparece',
 executar({igual,db}){
  limpar(db);
  const r=nova();
  revenda.definirLimite(r.id,500000,{nome:'Lucas'});
  igual(revenda.porId(r.id).limite_vencido,0,'revisado hoje: em dia');
  db.prepare("UPDATE sm_revenda SET limite_revisado_em=date('now','localtime','-3 months') WHERE id=?").run(r.id);
  igual(revenda.porId(r.id).limite_vencido,1,'tres meses depois, vencido (o parametro diz 2)');
  igual(revenda.limitesVencidos().length,1,'e ela entra na lista de trabalho');
}},

{nome:'o limite DISPONIVEL nao e inventado enquanto nao houver baixa de boleto',
 executar({igual,db}){
  limpar(db);
  const r=nova();
  revenda.definirLimite(r.id,500000,{nome:'Lucas'});
  igual(revenda.porId(r.id).valor_disponivel_centavos,undefined,
    'disponivel = limite - boletos em aberto, e boleto e a fase 6; ' +
    'devolver o limite cheio como "disponivel" seria numero mentindo');
}},

// ── O vendedor e a carteira ──────────────────────────────────────────────
{nome:'O VENDEDOR E GENTE DO PCP: id que nao existe la e recusado',
 executar({igual,recusa,db}){
  limpar(db);
  const r=nova();
  recusa(()=>revenda.definirVendedor(r.id,99,{nome:'Lucas'}),'vendedor_inexistente','ninguem com id 99');
  igual(revenda.porId(r.id).vendedor_usuario_id,null,'e ninguem ficou gravado');
  revenda.definirVendedor(r.id,7,{nome:'Lucas'});
  const d=revenda.porId(r.id);
  igual(d.vendedor_usuario_id,7,'o vinculo e por id');
  igual(d.vendedor_nome,'Renato','e o nome fica como RETRATO, para a carteira continuar legivel daqui a um ano');
  revenda.definirVendedor(r.id,null,{nome:'Lucas'});
  igual(revenda.porId(r.id).vendedor_usuario_id,null,'e da para tirar');
}},

{nome:'a porta de pessoas entrega id e nome, e MAIS NADA',
 executar({igual,db}){
  limpar(db);
  const lista=pessoas.listar();
  igual(lista.length,2,'duas pessoas');
  igual(Object.keys(lista[0]).sort().join(','),'id,nome','nem pin_hash, nem salt, nem areas');
}},

{nome:'porta NAO LIGADA recusa dizendo onde se liga — nunca devolve lista vazia',
 executar({igual,recusa,db}){
  limpar(db);
  pessoas.ligar(null);
  const e=recusa(()=>pessoas.listar(),'porta_de_pessoas_nao_ligada','sem a porta');
  igual(/server\.js/.test(e.mensagem),true,'a frase diz onde se conserta: '+e.mensagem);
  pessoas.ligar(()=>DO_PCP);
}},

{nome:'a carteira agrupa por vendedor, e quem esta sem vendedor aparece a parte',
 executar({igual,db}){
  limpar(db);
  const a=nova({nome_fantasia:'Casa A'}), b=nova({nome_fantasia:'Casa B'}), c=nova({nome_fantasia:'Casa C'});
  revenda.definirVendedor(a.id,7,{nome:'Lucas'});
  revenda.definirVendedor(b.id,7,{nome:'Lucas'});
  const cart=revenda.carteiras();
  const doRenato=cart.find(x=>x.vendedor_usuario_id===7);
  igual(doRenato.revendas.length,2,'duas na carteira do Renato');
  igual(doRenato.vendedor_nome,'Renato','com nome');
  const sem=cart.find(x=>x.vendedor_usuario_id===null);
  igual(sem.revendas.length,1,'e a Casa C aparece como SEM VENDEDOR');
  igual(/sem vendedor/i.test(sem.vendedor_nome),true,'dita por extenso, para ninguem ler como carteira vazia');
}},

// ── A tabela A/B/C ───────────────────────────────────────────────────────
{nome:'as tres tabelas nascem SEM percentual — e isso nao e pendencia de deploy',
 executar({igual,db}){
  limpar(db);
  const t=revenda.tabelas();
  igual(t.map(x=>x.nome).join(''),'ABC','as tres existem');
  igual(t.every(x=>x.desconto_centesimos===null),true,
    'zero seria "sem desconto", que e uma decisao; NULL e "ainda nao se sabe"');
}},

{nome:'o percentual da tabela tem porta com historico, e recusa o impossivel',
 executar({igual,recusa,db}){
  limpar(db);
  const b=revenda.tabelas().find(t=>t.nome==='B');
  recusa(()=>revenda.definirDescontoTabela(b.id,-1,{nome:'Lucas'}),'desconto_invalido','negativo');
  recusa(()=>revenda.definirDescontoTabela(b.id,10001,{nome:'Lucas'}),'desconto_invalido','mais de 100%');
  revenda.definirDescontoTabela(b.id,1000,{nome:'Lucas'});
  igual(revenda.tabelas().find(t=>t.nome==='B').desconto_centesimos,1000,'10,00%');
  const h=revenda.historicoTabela(b.id);
  igual(h.length+'|'+h[0].de+'|'+h[0].para,'1|null|1000','o historico diz de quanto para quanto');
}},

{nome:'a revenda aponta para a tabela, e tabela que nao existe e recusada',
 executar({igual,recusa,db}){
  limpar(db);
  const r=nova();
  const a=revenda.tabelas().find(t=>t.nome==='A');
  recusa(()=>revenda.editar(r.id,{tabela_id:999}),'tabela_inexistente','tabela inventada');
  revenda.editar(r.id,{tabela_id:a.id});
  igual(revenda.porId(r.id).tabela_nome,'A','a tela le o nome, nao o id');
}},

// ── Enderecos e contatos ─────────────────────────────────────────────────
{nome:'a revenda tem VARIOS enderecos de entrega, e o apelido nao se repete',
 executar({igual,recusa,db}){
  limpar(db);
  const r=nova();
  revenda.criarEndereco({revenda_id:r.id,apelido:'Loja centro',cidade:'Bauru',padrao:1});
  revenda.criarEndereco({revenda_id:r.id,apelido:'Deposito',cidade:'Bauru'});
  recusa(()=>revenda.criarEndereco({revenda_id:r.id,apelido:'Loja centro'}),'apelido_repetido','mesmo apelido');
  recusa(()=>revenda.criarEndereco({revenda_id:r.id,apelido:'   '}),'apelido_obrigatorio','sem apelido');
  igual(revenda.porId(r.id).enderecos.length,2,'dois enderecos');
}},

{nome:'so UM endereco e o padrao — marcar o segundo desmarca o primeiro',
 executar({igual,db}){
  limpar(db);
  const r=nova();
  const e1=revenda.criarEndereco({revenda_id:r.id,apelido:'Loja centro',padrao:1});
  const e2=revenda.criarEndereco({revenda_id:r.id,apelido:'Deposito',padrao:1});
  const ends=revenda.porId(r.id).enderecos;
  igual(ends.filter(e=>e.padrao===1).length,1,'um padrao so — dois padroes e a tela escolhendo por sorte');
  igual(ends.find(e=>e.padrao===1).id,e2.id,'e o padrao e o ultimo marcado');
  igual(e1.id!==e2.id,true,'sao dois');
}},

{nome:'contato sem nome e recusado; o resto e opcional',
 executar({igual,recusa,db}){
  limpar(db);
  const r=nova();
  recusa(()=>revenda.criarContato({revenda_id:r.id,telefone:'14 99999-0000'}),'nome_obrigatorio','contato sem nome');
  revenda.criarContato({revenda_id:r.id,nome:'Marcia',papel:'Compras',telefone:'14 99999-0000'});
  revenda.criarContato({revenda_id:r.id,nome:'Joao'});
  igual(revenda.porId(r.id).contatos.length,2,'dois contatos');
}},

{nome:'apagar endereco de outra revenda nao acontece por engano',
 executar({igual,recusa,db}){
  limpar(db);
  const a=nova({nome_fantasia:'Casa A'}), b=nova({nome_fantasia:'Casa B'});
  const e=revenda.criarEndereco({revenda_id:a.id,apelido:'Loja'});
  recusa(()=>revenda.apagarEndereco(b.id,e.id),'endereco_inexistente','id certo, revenda errada');
  igual(revenda.porId(a.id).enderecos.length,1,'continua la');
}},

// ── Desativar ────────────────────────────────────────────────────────────
{nome:'desativar nao apaga, e da para reativar',
 executar({igual,db}){
  limpar(db);
  const r=nova();
  revenda.editar(r.id,{ativo:0});
  igual(revenda.porId(r.id).ativo,0,'inativa');
  igual(revenda.listar({ativo:1}).length,0,'fora da lista de ativas');
  igual(revenda.listar().length,1,'mas ainda existe — revenda apagada levaria o pedido dela junto');
  revenda.editar(r.id,{ativo:1});
  igual(revenda.porId(r.id).ativo,1,'voltou');
}}

];

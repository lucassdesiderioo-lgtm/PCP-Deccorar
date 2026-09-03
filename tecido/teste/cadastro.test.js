// Fase 1 — as regras dos cadastros e dos parametros.
const tecido=require('../dominio/tecido');
const endereco=require('../dominio/endereco');
const config=require('../nucleo/config');

module.exports=[

{nome:'o codigo do tecido sai de linha + abertura + cor', executar({igual}){
  const linha=tecido.criarLinha({nome:'Rolô'});
  const abertura=tecido.criarAbertura({nome:'3%',linha_id:linha.id});
  const cor=tecido.criarCor({nome:'Bege'});
  const t=tecido.criarTecido({linha_id:linha.id,abertura_id:abertura.id,cor_id:cor.id,largura_sugerida:'2,50'});
  igual(t.codigo,'ROLO-3-BEGE','codigo gerado');
  igual(t.largura_sugerida,2.5,'largura sugerida aceita virgula');
  igual(t.permite_girar,0,'o tecido nasce SEM rotacao — ele tem sentido');
}},

{nome:'a mesma combinacao nao entra duas vezes', executar({recusa}){
  const l=tecido.listarLinhas()[0], a=tecido.listarAberturas(l.id)[0], c=tecido.listarCores()[0];
  recusa(()=>tecido.criarTecido({linha_id:l.id,abertura_id:a.id,cor_id:c.id}),'tecido_repetido');
}},

{nome:'abertura de outra linha e recusada', executar({recusa}){
  const romana=tecido.criarLinha({nome:'Romana'});
  const c=tecido.listarCores()[0];
  const aberturaDoRolo=tecido.listarAberturas(tecido.listarLinhas().find(l=>l.nome==='Rolô').id)[0];
  recusa(()=>tecido.criarTecido({linha_id:romana.id,abertura_id:aberturaDoRolo.id,cor_id:c.id}),
    'abertura_de_outra_linha');
}},

{nome:'o endereco se escreve de um jeito so: ROLO · A-02-03', executar({igual}){
  const h=endereco.criarHaste({nome:'A',armazem_chave:'ROLO'});
  const an=endereco.criarAndar({nome:'02',haste_id:h.id});
  const n=endereco.criarNivel({nome:'03',andar_id:an.id});
  igual(endereco.descrever(n.id),'ROLO · A-02-03','endereco descrito');
}},

{nome:'sobra nao endereca na estante dos rolos (R5)', executar({recusa,igual}){
  const h=endereco.criarHaste({nome:'C',armazem_chave:'SOBRA'});
  const an=endereco.criarAndar({nome:'01',haste_id:h.id});
  const n=endereco.criarNivel({nome:'04',andar_id:an.id});
  igual(endereco.descrever(n.id),'SOBRA · C-01-04','endereco de sobra');
  // O nivel de SOBRA recusado por quem so endereca em ROLO, e vice-versa.
  recusa(()=>endereco.exigirArmazem(n.id,'ROLO'),'armazem_errado');
  const nRolo=endereco.arvore('ROLO')[0].andares[0].niveis[0];
  recusa(()=>endereco.exigirArmazem(nRolo.id,'SOBRA'),'armazem_errado');
}},

{nome:'os tres parametros do corte nascem com o padrao combinado', executar({perto}){
  const p=config.paramsDeCorte();
  perto(p.margem,0.00,'margem');                       // resposta do dono: as pecas encostam
  perto(p.larguraMinimaSobra,0.80,'larguraMinimaSobra');
  perto(p.pesoSobra,0.50,'pesoSobra');
}},

{nome:'peso da sobra fora de 0 a 1 e recusado', executar({recusa,perto}){
  recusa(()=>config.gravar('pesoSobra',1.5,'teste'),'valor_invalido');
  config.gravar('pesoSobra','0,75','teste');
  perto(config.ler('pesoSobra'),0.75,'peso gravado com virgula');
  config.gravar('pesoSobra',0.5,'teste');
}},

// Os dois casos que viviam aqui — "nunca ficar sem um diretor" e "PIN de
// menos de 4 digitos" — sairam com o cadastro local de pessoas. Quem entra
// passou a ser decidido por area no PCP; o que substitui os dois esta em
// acesso.test.js, que prova a traducao de area em papel.

// ── RENOMEAR ─────────────────────────────────────────────────────────────
// A tela so sabia DESATIVAR. Consertar um "Pinpoit" sem o segundo N exigia
// desativar e criar de novo — duas linhas na lista, uma delas morta, para
// corrigir uma letra. E nome de tecido muda de verdade: fornecedor renomeia
// colecao, e a equipe passa a chamar pelo nome novo enquanto a tela mostra o
// velho.

{nome:'renomear conserta a digitacao sem criar linha nova', executar({igual}){
  const c=tecido.criarCor({nome:'Pinpoit Bege'});
  const antes=tecido.listarCores().length;
  const dep=tecido.renomearCor(c.id,'Pinpoint Bege');
  igual(dep.id,c.id,'e a MESMA linha');
  igual(dep.nome,'Pinpoint Bege','com o nome certo');
  igual(tecido.listarCores().length,antes,'nenhuma linha morta sobrou');
}},

{nome:'renomear para um nome QUE JA EXISTE recusa com frase humana',
 executar({recusa}){
  tecido.criarCor({nome:'Verde musgo'});
  const outra=tecido.criarCor({nome:'Verde limao'});
  recusa(()=>tecido.renomearCor(outra.id,'Verde musgo'),'cor_repetida');
  /* O nome e UNIQUE no banco. Sem esta conferencia ANTES da escrita, o
     SQLite estouraria a restricao e o operador leria "deu erro aqui dentro,
     chame o suporte" — quando o que ele precisa ler e "essa cor ja existe".
     Mesma licao da etiqueta de sobra duplicada. */
}},

{nome:'renomear para o MESMO nome nao e erro', executar({igual}){
  const c=tecido.criarCor({nome:'Ocre'});
  igual(tecido.renomearCor(c.id,'Ocre').nome,'Ocre','passa direto');
  // Senao, clicar em renomear e confirmar sem mudar nada daria erro — e o
  // operador concluiria que quebrou alguma coisa.
}},

{nome:'a colecao repetida so vale DENTRO da mesma linha', executar({igual,recusa}){
  // Nomes proprios deste caso: o arquivo inteiro divide o mesmo banco, e
  // 'Romana' ja nasceu num caso acima.
  const l1=tecido.criarLinha({nome:'Painel A'});
  const l2=tecido.criarLinha({nome:'Painel B'});
  tecido.criarAbertura({nome:'Napoles',linha_id:l1.id});
  const a2=tecido.criarAbertura({nome:'Pinpoint',linha_id:l2.id});
  igual(tecido.renomearAbertura(a2.id,'Napoles').nome,'Napoles',
    'Napoles em OUTRA linha passa');
  const a3=tecido.criarAbertura({nome:'Blackout',linha_id:l2.id});
  recusa(()=>tecido.renomearAbertura(a3.id,'Napoles'),'abertura_repetida');
  // A colecao pertence a uma linha: o Napoles de uma nao e o da outra.
}},

{nome:'O CODIGO DO TECIDO NAO MUDA no rename, e isso e decisao',
 executar({igual}){
  const l=tecido.criarLinha({nome:'Vertical'});
  const a=tecido.criarAbertura({nome:'Screen',linha_id:l.id});
  const c=tecido.criarCor({nome:'Areia'});
  const t=tecido.criarTecido({linha_id:l.id,abertura_id:a.id,cor_id:c.id});
  const codigo=t.codigo;

  tecido.renomearCor(c.id,'Areia clara');
  const depois=tecido.listarTecidos().find(x=>x.id===t.id);
  igual(depois.codigo,codigo,'o codigo continua '+codigo);
  igual(depois.cor_nome,'Areia clara','mas a tela mostra o nome novo');

  /* O codigo ja pode estar escrito em plano confirmado e em historico de
     rolo. Refaze-lo apagaria o rastro. Ele e etiqueta de LEITURA — quem
     identifica o tecido de verdade e o trio de ids. */
}}

];

// Fase 1 — as regras dos cadastros e dos parametros.
const tecido=require('../dominio/tecido');
const endereco=require('../dominio/endereco');
const usuario=require('../dominio/usuario');
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

{nome:'o sistema nunca fica sem um diretor ativo', executar({recusa,igual}){
  const d=usuario.criar({nome:'Diretora',pin:'4321',papel:'diretor'});
  const c=usuario.criar({nome:'Cortador',pin:'1111',papel:'cortador'});
  igual(c.papel,'cortador','papel do cortador');
  recusa(()=>usuario.atualizar(d.id,{ativo:0}),'ultimo_diretor');
  // Com um segundo diretor no ar, a troca passa.
  usuario.atualizar(c.id,{papel:'diretor'});
  igual(usuario.atualizar(d.id,{ativo:0}).ativo,0,'diretor pode sair quando ha outro');
}},

{nome:'PIN de menos de 4 digitos nao entra', executar({recusa}){
  recusa(()=>usuario.criar({nome:'Curto',pin:'12',papel:'cortador'}),'pin_invalido');
  recusa(()=>usuario.criar({nome:'SemPin',papel:'cortador'}),'pin_obrigatorio');
}}

];

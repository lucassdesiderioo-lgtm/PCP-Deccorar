// QUEM SOU EU AQUI DENTRO.
//
// O PCP ja sabe o nome de quem entrou e quais chaves `sobmedida.*` ele tem;
// daqui sai o que isso significa aqui dentro: as telas, as bancadas e a lista
// de permissoes. A barra de sessao e o menu leem daqui para nao oferecer
// botao que a pessoa nao pode apertar. Nao ha mais papel (fase 2 da
// ACESSOS-UNIFICADOS): a tela pergunta pela CHAVE.
//
// Permissao 'modulo.entrar' — a chave que todo papel tem, e que existe
// justamente para esta pergunta. Ate a fase 2 aqui dizia 'cadastro.ler',
// "a chave mais baixa que todo mundo que entra tem"; com o papel VENDEDOR
// isso deixou de ser verdade, e o menu dele viria vazio com 403 no console.
const {CHAVES,pode}=require('../nucleo/permissoes');
const {TELAS}=require('../nucleo/telas');
const {SETORES}=require('./../nucleo/acesso');

module.exports={rotas:[
  {metodo:'GET', caminho:'/api/eu', permissao:'modulo.entrar',
   manipulador:({usuario})=>({
     nome:usuario.nome,
     /* ⚠️ AS BANCADAS DESTA PESSOA VEM COM O NOME, e nao so a chave. A tela
        da bancada monta os botoes com isto — e escrever `serralheria` num
        botao e chave de banco em tela, que e o "— Correcao de contagem" do
        §2 do CLAUDE.md outra vez.

        ⚠️ E NA ORDEM DA FABRICA, que e a do SETORES: serralheria e colecao
        andam em paralelo, montagem espera as duas, revisao espera a montagem
        e a embalagem espera a revisao. Ordenar por nome poria "Coleção"
        antes de "Serralheria" e a fileira leria como se a ordem do trabalho
        fosse essa. */
     setores:SETORES.filter(s=>(usuario.setores||[]).includes(s.chave))
       .map(s=>({chave:s.chave, nome:s.nome})),
     // As telas que ESTA pessoa alcanca. O menu se monta com isto, entao um
     // botao nunca leva a uma porta fechada — o operador que bate em "sem
     // permissao" tres vezes para de tentar a quarta, mesmo quando podia.
     telas:Object.entries(TELAS)
       .filter(([caminho,t])=>caminho!=='/inicio'&&pode(usuario,t.permissao))
       .map(([caminho])=>caminho),
     permissoes:CHAVES.filter(c=>pode(usuario,c.chave)).map(c=>c.chave)
   })},

  // O QUE CADA SETOR DO SOB MEDIDA CARREGA QUANDO NASCE. A aba "Quem entra"
  // mostra isto, para quem libera saber o que esta dando antes de dar.
  // Liberacao as cegas e como trava sem chave, so pro outro lado. O setor
  // pode ser editado na tela de Acessos depois: isto e o pacote de nascenca,
  // e a tela de Acessos e quem diz o que ele tem hoje.
  {metodo:'GET', caminho:'/api/papeis', permissao:'cadastro.editar',
   manipulador:()=>[['Sob medida / Bancada','cortador'],['Sob medida / Venda','vendedor'],
                    ['Sob medida / Cadastros','diretor'],['Uma bancada da produção','producao']]
     .map(([setor,pacote])=>({
       setor,
       permissoes:CHAVES.filter(c=>pode({papel:pacote},c.chave)).map(c=>c.nome)
     }))}
]};

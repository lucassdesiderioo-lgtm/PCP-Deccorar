// A rota dos indicadores (secao 4.17, fase 6-B). Sem SQL e sem 'if' de
// negocio — quem soma e o `dominio/indicadores.js`.
//
// ⚠️ E `painel.ler`, E NAO NASCE CHAVE NOVA. A pergunta e a fabrica inteira:
// quanto cada vendedor leva para aprovar, quanto cada pessoa produz, de que
// bancada vem o defeito. Isso e escritorio, e e a mesma chave do Quadro.
// Chave nova aqui seria a terceira ponta da armadilha #13 sem precisar: mais
// uma caixinha para alguem marcar, e que ninguem marcaria.
//
// ⚠️ UMA PORTA, E NAO SETE. A tela faz as sete perguntas de uma vez; sete
// rotas seriam sete idas com sete janelas podendo divergir, e dois blocos da
// mesma tela contando periodos diferentes e a armadilha #12 na horizontal.
//
// ⚠️ NAO HA CAMPO DE DINHEIRO NESTA RESPOSTA, e por isso ela nao passa pela
// poda do custo.js — a unica excecao e o `valor_total_centavos` do pedido
// parado, que passa. A poda corta por PADRAO DE NOME (§19), entao ela pega
// esse campo sozinha; e por isso que ele se chama assim.
const indicadores=require('../dominio/indicadores');
const custo=require('../dominio/custo');

module.exports={rotas:[

  {metodo:'GET', caminho:'/api/indicadores', permissao:'painel.ler',
   manipulador:({query,usuario})=>custo.podar(usuario,indicadores.painel({dias:query.dias}))}

]};

/* O QUE ESTA RETIDO — para as telas de operacao verem.
 *
 * Dono unico da pergunta "quantos volumes estao bloqueados, e quais?".
 *
 * Em 09/09/2026 o Mercado Livre dizia 50 vendas e a fila da Etiqueta de Venda
 * dizia 49. A unidade que faltava estava no sistema o tempo todo — retida por
 * divergencia de leitura (o "i" depois do "f", parse.js) — mas so aparecia na
 * aba Bloqueados do admin. Nenhuma tela de operacao dizia que ela existia:
 * a fila mostrava 49 como se 49 fosse o dia inteiro, e o gestor passou a manha
 * cacando uma venda que nao estava perdida.
 *
 * Um volume bloqueado e trabalho parado que ninguem ve. A regra aqui e a mesma
 * da armadilha #9 (o volume escondido ninguem procura): onde a fila e mostrada,
 * o que ficou fora dela tem que ser mostrado junto — com nome, NF e o motivo,
 * porque e isso que a pessoa precisa para resolver ou para saber que nao pode
 * resolver dali.
 *
 * Tres tipos, porque sao tres reparos diferentes (§5, §6 e §8-B do CLAUDE.md):
 *   - divergencia   alguem abre o pedido no ML e escolhe (Admin -> Bloqueados)
 *   - modalidade    a etiqueta veio num formato novo; a gestao decide se e
 *                   agencia ou coleta (Admin -> Bloqueados)
 *   - sku           cadastrar o SKU libera sozinho (Admin -> Cadastro de SKU)
 *
 * Le, nao decide: quem retem e o upload (exp_route.js), quem solta e o
 * resolver ou o cadastro. Aqui e so a resposta, num lugar so, para a Etiqueta
 * de Venda, o Carregamento e a TV nao inventarem cada uma a sua conta.
 */
const {VENCE_HOJE}=require('./fila_dia');

const DIV="COALESCE(bloqueio,'') LIKE 'divergencia%'";
const MOD="COALESCE(bloqueio,'') LIKE 'modalidade%'";

/* Motivo curto, do jeito que cabe numa linha da bancada. O texto inteiro segue
   na aba Bloqueados; aqui a pessoa precisa saber QUE TIPO de problema e, e para
   onde ir. */
function motivoCurto(bloqueio){
  const b=String(bloqueio||'');
  if(/^modalidade/.test(b)) return 'etiqueta em formato novo — agência ou coleta?';
  if(!/^divergencia/.test(b)) return 'SKU sem cadastro';
  if(/comprador nao bate/.test(b)) return 'nome da etiqueta difere da folha';
  if(/leituras divergem/.test(b)) return 'as duas leituras da folha discordam';
  if(/descricao diz/.test(b)) return 'medida do anúncio difere do SKU';
  if(/anuncio diz cor/.test(b)) return 'cor do anúncio difere do SKU';
  if(/sempre foi/.test(b)) return 'linha do produto difere do SKU';
  return 'dúvida na leitura do PDF';
}

/* Os numeros: total, por tipo, e quantos deles VENCEM HOJE (ou ja venceram, ou
   nao tem data — a mesma regua da fila, fila_dia.js). E o "hoje" que importa
   para a expedicao: bloqueado com prazo pra semana que vem e pendencia; com
   prazo pra hoje e caixa que nao vai no carro. */
function resumo(db){
  const r=db.prepare(`SELECT COUNT(*) total,
      SUM(CASE WHEN ${DIV} THEN 1 ELSE 0 END) divergencias,
      SUM(CASE WHEN ${MOD} THEN 1 ELSE 0 END) modalidade,
      SUM(CASE WHEN ${DIV} OR ${MOD} THEN 0 ELSE 1 END) sem_cadastro,
      SUM(CASE WHEN ${VENCE_HOJE} THEN 1 ELSE 0 END) hoje
    FROM lote WHERE estagio='bloqueado'`).get();
  return {total:r.total||0, divergencias:r.divergencias||0, modalidade:r.modalidade||0,
          sem_cadastro:r.sem_cadastro||0, hoje:r.hoje||0};
}

/* A lista, o mais urgente primeiro: o que vence hoje ou ja venceu em cima. */
function lista(db){
  return db.prepare(`SELECT id,codigo,buyer,nf,city,packId,venda,data,despachar_em,bloqueio,
      CASE WHEN ${DIV} THEN 'divergencia' WHEN ${MOD} THEN 'modalidade' ELSE 'sku' END tipo,
      CASE WHEN ${VENCE_HOJE} THEN 1 ELSE 0 END hoje
    FROM lote WHERE estagio='bloqueado'
    ORDER BY hoje DESC, despachar_em ASC, id ASC`).all()
    .map(v=>Object.assign({},v,{motivo:motivoCurto(v.bloqueio)}));
}

module.exports={resumo,lista,motivoCurto};

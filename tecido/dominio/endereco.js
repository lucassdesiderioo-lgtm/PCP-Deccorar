// A regra do enderecamento: dois armazens, tres niveis, tudo cadastro.
//
// R4: ROLO e SOBRA sao areas fisicas diferentes do mesmo galpao. Rolo fechado
//     e aberto ficam no MESMO armazem ROLO — muda o status, nao o lugar.
// R5: nenhuma quantidade de haste, andar ou nivel e decidida no codigo. E
//     violar o armazem e ErroDeRegra, nao aviso de tela: sobra endereçada na
//     estante dos rolos e sobra que ninguem acha.
const {ErroDeRegra,exigir}=require('../nucleo/erros');
const {pode}=require('../nucleo/permissoes');
const db=require('../nucleo/db');
const dia=require('../nucleo/dia');
const dArmazem=require('../dados/armazem');
const dHaste=require('../dados/haste');
const dAndar=require('../dados/andar');
const dNivel=require('../dados/nivel');

const nomeLimpo=(nome,oque)=>{
  const n=String(nome||'').trim();
  exigir(n,'nome_vazio','Informe o nome d'+oque+'.');
  return n;
};

/* ── QUEM CRIOU, E SE FALTA CONFERIR ──────────────────────────────────────
   A bancada tambem cria endereco, e por um motivo fisico: o tubo esta na mao
   e a prateleira ganhou um buraco novo hoje de manha. Sem isso o operador
   deixa o rolo sem endereco "para enderecar depois" — e o depois nao existe:
   o tubo fica na estante sem ninguem saber onde, que e pior do que um nome de
   haste digitado torto.

   O que a chefia perde nao e o controle, e a VEZ: o endereco criado na bancada
   nasce marcado, aparece na lista "Conferir" do cadastro, e ela renomeia ou
   apaga com calma. Revisao que era porteiro virou lista de trabalho.

   A conta de quem precisa conferir mora AQUI, e nao nas tres rotas: tres
   copias significariam o dia em que uma delas esquecesse de marcar, e o
   endereco entraria como se a chefia tivesse conferido. */
const marca=usuario=>({
  criado_por: usuario&&usuario.nome||null,
  criado_em: dia.agora(),
  conferir: pode(usuario,'cadastro.editar')?0:1
});

function criarHaste(dados,usuario){
  const nome=nomeLimpo(dados.nome,'a haste');
  const arm=dArmazem.porChave(dados.armazem_chave);
  exigir(arm,'armazem_inexistente','Escolha o armazem (Rolos ou Sobras).');
  if(dHaste.listar(arm.chave).some(h=>h.nome.toLowerCase()===nome.toLowerCase()))
    throw new ErroDeRegra('haste_repetida','O armazem '+arm.nome+' ja tem a haste "'+nome+'".');
  return dHaste.criar({nome,armazem_chave:arm.chave,ordem:dados.ordem,...marca(usuario)});
}

function criarAndar(dados,usuario){
  const nome=nomeLimpo(dados.nome,'o andar');
  const haste=dHaste.porId(dados.haste_id);
  exigir(haste,'haste_inexistente','Escolha a haste.');
  if(dAndar.listar(haste.id).some(a=>a.nome.toLowerCase()===nome.toLowerCase()))
    throw new ErroDeRegra('andar_repetido','A haste '+haste.nome+' ja tem o andar "'+nome+'".');
  return dAndar.criar({nome,haste_id:haste.id,ordem:dados.ordem,...marca(usuario)});
}

function criarNivel(dados,usuario){
  const nome=nomeLimpo(dados.nome,'o nivel');
  const andar=dAndar.porId(dados.andar_id);
  exigir(andar,'andar_inexistente','Escolha o andar.');
  if(dNivel.listar(andar.id).some(n=>n.nome.toLowerCase()===nome.toLowerCase()))
    throw new ErroDeRegra('nivel_repetido','O andar '+andar.nome+' ja tem o nivel "'+nome+'".');
  return dNivel.criar({nome,andar_id:andar.id,ordem:dados.ordem,...marca(usuario)});
}

// A consulta que responde "onde fica o nivel 37" — e de qual armazem ele e.
const pCompleto=db.prepare(`
  SELECT n.id, n.nome AS nivel_nome, n.ativo,
         a.id AS andar_id, a.nome AS andar_nome,
         h.id AS haste_id, h.nome AS haste_nome,
         h.armazem_chave, ar.nome AS armazem_nome
    FROM nivel n
    JOIN andar a ON a.id=n.andar_id
    JOIN haste h ON h.id=a.haste_id
    JOIN armazem ar ON ar.chave=h.armazem_chave
   WHERE n.id=?`);

const completo=nivel_id=>pCompleto.get(nivel_id);

// Exibicao do endereco num lugar so: 'ROLO · A-02-03'.
function descrever(nivel_id){
  const e=completo(nivel_id);
  if(!e) return '';
  return e.armazem_chave+' · '+[e.haste_nome,e.andar_nome,e.nivel_nome].join('-');
}

// A guarda que rolo e sobra chamam antes de gravar o endereco.
function exigirArmazem(nivel_id,armazem_chave){
  const e=completo(nivel_id);
  exigir(e,'endereco_inexistente','Escolha um endereco valido.');
  if(e.armazem_chave!==armazem_chave)
    throw new ErroDeRegra('armazem_errado',
      'O endereco '+descrever(nivel_id)+' e do armazem '+e.armazem_nome+
      ', e este lancamento so endereca em '+(dArmazem.porChave(armazem_chave)||{}).nome+'.');
  return e;
}

// A arvore inteira de um armazem, para a tela montar os tres seletores.
function arvore(armazem_chave){
  const hastes=dHaste.listar(armazem_chave);
  return hastes.map(h=>({
    ...h,
    andares:dAndar.listar(h.id).map(a=>({...a, niveis:dNivel.listar(a.id)}))
  }));
}

module.exports={
  criarHaste, criarAndar, criarNivel,
  completo, descrever, exigirArmazem, arvore,
  listarArmazens:()=>dArmazem.listar()
};

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

/* DEPOIS DA MIGRACAO DA FASE 10 (COMPRAS-E-RECEBIMENTO, R-CMP-50) o endereco
   e do PCP: a bancada continua criando o buraco novo (R-SME-01), mas ele nasce
   LA, pela porta, e chega aqui pelo espelho. Antes da migracao, nada muda. */
const PCP=require('../nucleo/enderecos_pcp');
function viaPcp(arm,haste,andar,nivel,usuario,tabela,onde){
  PCP.criarNoPcp(arm,haste,andar,nivel);
  const r=onde();
  exigir(r,'endereco_nao_chegou','O endereco foi criado no PCP, mas nao chegou aqui. Recarregue a tela.');
  const m=marca(usuario);
  db.prepare('UPDATE '+tabela+' SET criado_por=?, conferir=? WHERE id=?').run(m.criado_por,m.conferir,r.id);
  return {...r,criado_por:m.criado_por,conferir:m.conferir};
}
function criarHaste(dados,usuario){
  const nome=nomeLimpo(dados.nome,'a haste');
  const arm=dArmazem.porChave(dados.armazem_chave);
  exigir(arm,'armazem_inexistente','Escolha o armazem (Rolos ou Sobras).');
  if(dHaste.listar(arm.chave).some(h=>h.nome.toLowerCase()===nome.toLowerCase()))
    throw new ErroDeRegra('haste_repetida','O armazem '+arm.nome+' ja tem a haste "'+nome+'".');
  if(PCP.migrado(arm.chave))
    return viaPcp(arm.chave,nome,null,null,usuario,'haste',()=>dHaste.listar(arm.chave).find(h=>h.nome===nome));
  return dHaste.criar({nome,armazem_chave:arm.chave,ordem:dados.ordem,...marca(usuario)});
}

function criarAndar(dados,usuario){
  const nome=nomeLimpo(dados.nome,'o andar');
  const haste=dHaste.porId(dados.haste_id);
  exigir(haste,'haste_inexistente','Escolha a haste.');
  if(dAndar.listar(haste.id).some(a=>a.nome.toLowerCase()===nome.toLowerCase()))
    throw new ErroDeRegra('andar_repetido','A haste '+haste.nome+' ja tem o andar "'+nome+'".');
  if(PCP.migrado(haste.armazem_chave))
    return viaPcp(haste.armazem_chave,haste.nome,nome,null,usuario,'andar',()=>dAndar.listar(haste.id).find(a=>a.nome===nome));
  return dAndar.criar({nome,haste_id:haste.id,ordem:dados.ordem,...marca(usuario)});
}

function criarNivel(dados,usuario){
  const nome=nomeLimpo(dados.nome,'o nivel');
  const andar=dAndar.porId(dados.andar_id);
  exigir(andar,'andar_inexistente','Escolha o andar.');
  if(dNivel.listar(andar.id).some(n=>n.nome.toLowerCase()===nome.toLowerCase()))
    throw new ErroDeRegra('nivel_repetido','O andar '+andar.nome+' ja tem o nivel "'+nome+'".');
  const h=dHaste.porId(andar.haste_id);
  if(h&&PCP.migrado(h.armazem_chave))
    return viaPcp(h.armazem_chave,h.nome,andar.nome,nome,usuario,'nivel',()=>dNivel.listar(andar.id).find(n=>n.nome===nome));
  return dNivel.criar({nome,andar_id:andar.id,ordem:dados.ordem,...marca(usuario)});
}

/* ── O PROXIMO NUMERO DA SEQUENCIA ────────────────────────────────────────
   A prateleira cresce: cheios os dez niveis do andar, o buraco novo e o 11.
   Digitar esse numero e trabalho que o sistema ja sabe fazer, e o erro de
   digitacao aqui nao da erro nenhum — cria o "12" com o 11 faltando, e a
   estante do sistema passa a ter um buraco que a fisica nao tem.

   E SUGESTAO, NAO REGRA. O nome segue livre (R5: nenhuma quantidade de
   haste, andar ou nivel e decidida no codigo), e por isso ela mora aqui e
   NAO dentro do `criarNivel`: o dominio propoe, a tela mostra o numero antes
   do toque, e quem grava continua sendo a pessoa. Nivel chamado "fundo"
   entra igual.

   ⚠️ NOME QUE NAO E NUMERO FICA DE FORA DA CONTA, e quando nenhum e, a
   resposta e `null` — "nao da pra dizer", nunca 1. Num andar cujos niveis se
   chamam "frente" e "fundo", sugerir "1" inventaria uma sequencia que nao
   existe; e a mesma regra da cobertura sem venda (CLAUDE.md §3). */
function proximoNome(nomes){
  const numeros=(nomes||[]).map(n=>String(n==null?'':n).trim()).filter(n=>/^\d+$/.test(n));
  if(!numeros.length) return null;
  /* O ZERO A ESQUERDA E COPIADO de quem ja esta la. Num andar de "01" a
     "09", o proximo tem que sair "10" e nao "10" ao lado de "9": largura
     misturada faz a lista ordenar torto, e o olho procura duas vezes. */
  const largura=Math.max(0,...numeros.filter(n=>/^0\d/.test(n)).map(n=>n.length));
  return String(Math.max(...numeros.map(Number))+1).padStart(largura,'0');
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

/* A arvore inteira de um armazem, para a tela montar os tres seletores.
   Ela leva junto o PROXIMO NOME de cada sequencia: as duas telas que criam
   endereco (a bancada, na fileira dos rolos, e a chefia, em Cadastros)
   precisam da mesma sugestao, e uma conta em cada tela e a armadilha #12 —
   duas reguas para a mesma pergunta, divergindo no primeiro andar de nome
   torto. Vem no mesmo pacote porque a tela ja tem os nomes na mao: perguntar
   de novo ao servidor seria uma ida a rede para contar o que ela acabou de
   receber. */
/* Renomear e desativar endereco, depois da migracao, e no PCP (501 →
   Almoxarifados): aqui o espelho recebe na proxima leitura. */
function exigirEditavelAqui(){
  if(PCP.algumMigrado()) throw new ErroDeRegra('endereco_e_do_pcp',
    'O endereco agora e do PCP: renomeie ou desative em Compras → Almoxarifados (tela 501). A mudanca aparece aqui sozinha.');
}
/* O estado da ligacao com o PCP, para a tela dizer "sem atualizacao" em vez
   de mostrar vazio. */
const estadoPcp=()=>{ if(!PCP.algumMigrado()) return {migrado:false}; const s=PCP.sincronizar(); return {migrado:true,sem_atualizacao:!!s.sem_atualizacao,motivo:s.motivo||null}; };

function arvore(armazem_chave){
  if(PCP.migrado(armazem_chave)) PCP.sincronizar();
  return dHaste.listar(armazem_chave).map(h=>{
    const andares=dAndar.listar(h.id);
    return {...h,
      proximo_andar:proximoNome(andares.map(a=>a.nome)),
      andares:andares.map(a=>{
        const niveis=dNivel.listar(a.id);
        return {...a, proximo_nivel:proximoNome(niveis.map(n=>n.nome)), niveis};
      })};
  });
}

module.exports={
  criarHaste, criarAndar, criarNivel, proximoNome,
  completo, descrever, exigirArmazem, arvore, exigirEditavelAqui, estadoPcp,
  listarArmazens:()=>dArmazem.listar()
};

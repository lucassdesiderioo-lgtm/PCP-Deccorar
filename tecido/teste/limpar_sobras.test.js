// Fase 1 da spec SOBRAS-TOM-E-DESPERDICIO — a limpeza das sobras.
//
// O que estes casos travam, e por que cada um importa:
//   - a limpeza apaga as SETE tabelas da R1 e nada mais (rolo, tecido,
//     endereco e refugo DE CORTE ficam de pe);
//   - a proxima etiqueta impressa volta a ser S-000001 — e o objetivo do dia,
//     porque ultimoSeq() e MAX(seq) FROM etiqueta;
//   - as quatro guardas PARAM sem gravar nada: sobra usada, sobra consumida
//     por corte confirmado, sobra nascida de corte confirmado, e cadastro
//     feito depois do corte por data (o recadastro ja comecou);
//   - o backup sai por db.backup() e leva os dados de verdade (o `cp` copia
//     4 KB e deixa tudo no -wal, §12 do CLAUDE.md).
//
// A ORDEM DOS CASOS E PROPOSITAL: o arquivo roda num banco so, e o caso que
// apaga tudo vem depois das guardas — senao as guardas testariam banco vazio.
//
// O CORTE E INJETADO em vez de vir do relogio. Um teste que dependesse da data
// de hoje passaria em 18/09 e reprovaria em 20/09, e ninguem ligaria a falha a
// isso. O valor de producao fica travado num caso proprio.
const limpar=require('../limpar_sobras');
const sobra=require('../dominio/sobra');
const etiqueta=require('../dominio/etiqueta');
const tecido=require('../dominio/tecido');
const rolo=require('../dominio/rolo');
const endereco=require('../dominio/endereco');
const db=require('../nucleo/db');
const fs=require('fs');

// Um corte no futuro: toda sobra da cena cai DENTRO do alvo.
const TUDO='2999-12-31 23:59:59';
// Um corte no passado: toda sobra da cena cai FORA, como se o recadastro
// tivesse comecado.
const NADA='2000-01-01 00:00:00';

let cena=null;
function montar(){
  if(cena) return cena;
  const linha=tecido.criarLinha({nome:'Rolo Limpeza'});
  const abertura=tecido.criarAbertura({nome:'1%',linha_id:linha.id});
  const cor=tecido.criarCor({nome:'Cinza'});
  const t=tecido.criarTecido({linha_id:linha.id,abertura_id:abertura.id,cor_id:cor.id});

  const hS=endereco.criarHaste({nome:'S1',armazem_chave:'SOBRA'});
  const aS=endereco.criarAndar({nome:'01',haste_id:hS.id});
  const nS=endereco.criarNivel({nome:'01',andar_id:aS.id});

  const hR=endereco.criarHaste({nome:'R1',armazem_chave:'ROLO'});
  const aR=endereco.criarAndar({nome:'01',haste_id:hR.id});
  let seq=0;
  const buraco=()=>endereco.criarNivel({nome:String(++seq).padStart(2,'0'),andar_id:aR.id}).id;

  cena={tecido:t, nivelSobra:nS.id, buraco};
  return cena;
}

// Conta de uma tabela, para os casos nao repetirem SQL.
const conta=(tabela,onde)=>db.prepare('SELECT COUNT(*) c FROM '+tabela+(onde?' WHERE '+onde:'')).get().c;

module.exports=[

{nome:'a cena monta o que a R1 manda apagar, e o levantamento conta cada tabela',
 executar({igual}){
  const c=montar();
  etiqueta.imprimirLote(6,'Diretor');

  // Tres sobras, e a terceira NASCEU DA SEGUNDA: a cadeia origem_sobra_id e
  // uma auto-referencia, e com foreign_keys=ON ela e capaz de travar o DELETE.
  const s1=sobra.criar({codigo:'S-000001',tecido_id:c.tecido.id,largura:'1,20',altura:'1,80',
    condicao:'integra',nivel_id:c.nivelSobra},'Cortador');
  const s2=sobra.criar({codigo:'S-000002',tecido_id:c.tecido.id,largura:'0,90',altura:'1,60',
    condicao:'integra',nivel_id:c.nivelSobra},'Cortador');
  const s3=sobra.criar({codigo:'S-000003',tecido_id:c.tecido.id,largura:'0,60',altura:'1,00',
    condicao:'integra',nivel_id:c.nivelSobra,origem:'sobra',origem_sobra_id:s2.id},'Cortador');
  /* A CENA TEM QUE TER MESMO A CADEIA. Sem esta conferencia o caso da limpeza
     diria "a cadeia nao trava" apoiado numa cena sem cadeia nenhuma — teste
     cego, que e o defeito que o teste do QR ensinou (§4 do CLAUDE.md). */
  igual(db.prepare('SELECT origem_sobra_id o FROM sobra WHERE id=?').get(s3.id).o, s2.id,
    'a filha aponta para a mae');

  // Uma correcao (chefia) e um apontamento (bancada), em sobras diferentes:
  // um apontamento pendente por sobra e regra do modulo.
  sobra.corrigir(s1.id,{tecido_id:c.tecido.id,largura:'1,20',altura:'1,80',
    condicao:'mancha',nivel_id:c.nivelSobra},'Diretor');
  sobra.propor(s2.id,{tecido_id:c.tecido.id,largura:'0,90',altura:'1,60',
    condicao:'furo',nivel_id:c.nivelSobra},'Ana');

  // Um descarte: baixa a sobra e deixa a perda MEDIDA em refugo com
  // motivo='descarte' — a linha que a R1 manda apagar.
  const s4=sobra.criar({codigo:'S-000004',tecido_id:c.tecido.id,largura:'0,80',altura:'1,10',
    condicao:'integra',nivel_id:c.nivelSobra},'Cortador');
  sobra.descartar(s4.id,'rasgada no manuseio','Diretor');

  // Um refugo DE CORTE, que NAO e da sobra e tem que sobreviver.
  const p=db.prepare(`INSERT INTO plano(tecido_id,origem,usuario_nome,confirmado)
    VALUES(?,'digitado','Diretor',1)`).run(c.tecido.id).lastInsertRowid;
  db.prepare(`INSERT INTO refugo(tecido_id,largura,altura,area,motivo,plano_id,usuario_nome)
    VALUES(?,0.1,1.0,0.1,'tira_estreita',?,'Diretor')`).run(c.tecido.id,p);

  // Uma recusa de sobra num plano.
  db.prepare(`INSERT INTO plano_recusa(plano_id,sobra_id,usuario_nome)
    VALUES(?,?,'Cortador')`).run(p,s1.id);

  const l=limpar.levantar({corte:TUDO});
  igual(l.contagens.sobra,4,'quatro sobras no alvo');
  igual(l.contagens.etiqueta,6,'seis etiquetas impressas');
  igual(l.contagens.etiqueta_lote,1,'um lote de impressao');
  igual(l.contagens.sobra_correcao,1,'uma correcao');
  igual(l.contagens.sobra_proposta,1,'um apontamento');
  igual(l.contagens.plano_recusa,1,'uma recusa de sobra');
  igual(l.contagens.refugo_descarte,1,'um refugo de descarte');
  igual(l.fora.length,0,'nenhuma sobra fora do corte');
  igual(l.impedidas.length,0,'nenhum impedimento');
  igual(l.proxima_depois,'S-000001','depois da limpeza a sequencia recomeca');
}},

{nome:'o corte de producao e 18/09/2026, escrito no script', executar({igual}){
  // A data mora numa constante, e este caso e o que impede alguem "atualizar"
  // ela sem perceber que isso reabre o script para apagar cadastro novo.
  igual(limpar.CORTE,'2026-09-18 23:59:59','o corte da R1');
}},

{nome:'PARA quando alguma sobra esta usada, e nada e gravado', executar({recusa,igual}){
  const alvo=db.prepare(`SELECT id FROM sobra WHERE codigo='S-000001'`).get();
  db.prepare(`UPDATE sobra SET status='usada' WHERE id=?`).run(alvo.id);

  const l=limpar.levantar({corte:TUDO});
  igual(l.impedidas.length,1,'uma sobra impedida');
  igual(l.impedidas[0].codigo,'S-000001','qual sobra');
  igual(l.impedidas[0].motivos[0],'esta como usada','o motivo, em portugues');

  const e=recusa(()=>limpar.aplicar({corte:TUDO}),'sobra_em_corte_confirmado');
  if(!/S-000001/.test(e.mensagem))
    throw new Error('a recusa tem que nomear a sobra: '+e.mensagem);
  igual(conta('sobra'),4,'as sobras continuam todas la');
  igual(conta('etiqueta'),6,'as etiquetas tambem');

  db.prepare(`UPDATE sobra SET status='disponivel' WHERE id=?`).run(alvo.id);
}},

{nome:'PARA quando a sobra foi consumida por corte confirmado', executar({recusa,igual}){
  const s=db.prepare(`SELECT id,codigo FROM sobra WHERE codigo='S-000002'`).get();
  const p=db.prepare(`SELECT id FROM plano LIMIT 1`).get();
  const f=db.prepare(`INSERT INTO plano_faixa(plano_id,ordem,fonte,sobra_id,
    largura_disponivel,altura,largura_usada) VALUES(?,1,'sobra',?,0.9,1.6,0.9)`)
    .run(p.id,s.id).lastInsertRowid;

  const l=limpar.levantar({corte:TUDO});
  igual(l.impedidas.length,1,'uma impedida');
  igual(l.impedidas[0].codigo,'S-000002','qual sobra');
  igual(l.impedidas[0].motivos[0],'foi consumida no plano '+p.id,'o motivo diz o plano');

  recusa(()=>limpar.aplicar({corte:TUDO}),'sobra_em_corte_confirmado');
  igual(conta('sobra'),4,'nada apagado');

  db.prepare('DELETE FROM plano_faixa WHERE id=?').run(f);
}},

{nome:'PARA quando a sobra NASCEU de um corte confirmado', executar({recusa,igual}){
  // A outra ponta do plano_faixa: a etiqueta que o operador colou ao
  // confirmar. Olhar so o sobra_id deixaria passar a sobra recem-nascida do
  // corte de ontem, que e justamente a que tem historia atras.
  const p=db.prepare(`SELECT id FROM plano LIMIT 1`).get();
  const f=db.prepare(`INSERT INTO plano_faixa(plano_id,ordem,fonte,rolo_id,
    largura_disponivel,altura,largura_usada,sobra_gerada_codigo)
    VALUES(?,2,'rolo',NULL,2.0,1.6,1.2,'S-000003')`).run(p.id).lastInsertRowid;

  const l=limpar.levantar({corte:TUDO});
  igual(l.impedidas.length,1,'uma impedida');
  igual(l.impedidas[0].codigo,'S-000003','qual sobra');
  igual(l.impedidas[0].motivos[0],'nasceu do plano '+p.id,'o motivo diz o plano');

  recusa(()=>limpar.aplicar({corte:TUDO}),'sobra_em_corte_confirmado');
  igual(conta('sobra'),4,'nada apagado');

  db.prepare('DELETE FROM plano_faixa WHERE id=?').run(f);
}},

{nome:'PARA quando ha cadastro depois do corte — o recadastro ja comecou',
 executar({recusa,igual}){
  // Com o corte no passado, as quatro sobras da cena sao "cadastro novo". E
  // isto que faz o script ficar inofensivo depois de hoje: rodado em outubro,
  // ele acha o recadastro e nao apaga nada.
  const l=limpar.levantar({corte:NADA});
  igual(l.contagens.sobra,0,'nenhuma sobra no alvo');
  igual(l.fora.length,4,'as quatro estao fora do corte');

  const e=recusa(()=>limpar.aplicar({corte:NADA}),'recadastro_ja_comecou');
  if(!/4/.test(e.mensagem))
    throw new Error('a recusa tem que dizer quantas: '+e.mensagem);
  igual(conta('sobra'),4,'nada apagado');
  igual(conta('etiqueta'),6,'as etiquetas tambem ficaram');
}},

{nome:'o backup sai por db.backup() e leva os dados, nao 4 KB vazios',
 async executar({igual}){
  const arq=await limpar.fazerBackup();
  igual(fs.existsSync(arq),true,'o arquivo existe');

  // A prova de que nao foi um `cp`: o backup ABERTO tem as sobras dentro. Um
  // `cp tecido.db` traria o cabecalho e deixaria as linhas no -wal.
  const Database=require('better-sqlite3');
  const copia=new Database(arq,{readonly:true});
  igual(copia.prepare('SELECT COUNT(*) c FROM sobra').get().c,4,'as 4 sobras no backup');
  igual(copia.prepare('SELECT COUNT(*) c FROM etiqueta').get().c,6,'as 6 etiquetas no backup');
  copia.close();
  fs.unlinkSync(arq);
}},

{nome:'a limpeza apaga as sete tabelas da R1 — e a cadeia origem_sobra_id nao trava',
 executar({igual}){
  const r=limpar.aplicar({corte:TUDO});

  igual(conta('sobra'),0,'Sobras vazia');
  igual(conta('etiqueta'),0,'etiqueta vazia');
  igual(conta('etiqueta_lote'),0,'etiqueta_lote vazio');
  igual(conta('sobra_correcao'),0,'sobra_correcao vazia');
  igual(conta('sobra_proposta'),0,'sobra_proposta vazio');
  igual(conta('plano_recusa',"sobra_id IS NOT NULL"),0,'recusa de sobra vazia');
  igual(conta('refugo',"motivo='descarte'"),0,'refugo de descarte vazio');

  // O relatorio diz quanto saiu de cada lugar: e por ele que o dono confere.
  igual(r.apagados.sobra,4,'o relatorio conta as sobras');
  igual(r.apagados.etiqueta,6,'e as etiquetas');
}},

{nome:'o que NAO e da sobra fica de pe: rolo, tecido, endereco e refugo de corte',
 executar({igual,perto}){
  const c=montar();
  // O rolo entra depois da limpeza so para o caso ficar legivel; o que importa
  // e que a limpeza nao tem SQL que o alcance.
  const r=rolo.entrada({tecido_id:c.tecido.id,largura:'2,00',metragem:'30',
    nivel_id:c.buraco(),preco_m2:'15'},'Diretor');
  limpar.aplicar({corte:TUDO});

  igual(conta('rolo'),1,'o rolo ficou');
  perto(db.prepare('SELECT saldo s FROM rolo WHERE id=?').get(r.id).s,30,'com o saldo');
  igual(conta('movimento_rolo')>0,true,'a historia do rolo ficou');
  igual(conta('tecido'),1,'o tecido ficou');
  igual(conta('nivel')>0,true,'os enderecos ficaram');
  igual(conta('refugo',"motivo='tira_estreita'"),1,'o refugo DE CORTE ficou');
  igual(conta('plano'),1,'o plano confirmado ficou');
}},

{nome:'depois da limpeza a proxima etiqueta impressa e S-000001', executar({igual}){
  igual(db.prepare('SELECT MAX(seq) m FROM etiqueta').get().m||0,0,'a sequencia zerou');
  const lote=etiqueta.imprimirLote(2,'Diretor');
  igual(lote.codigos[0],'S-000001','recomeca do um');
  igual(lote.codigos[1],'S-000002','e segue');
}},

{nome:'rodar de novo em banco limpo e no-op, sem erro', executar({igual}){
  // Idempotente: a segunda rodada nao acha sobra e nao explode. Sem isto, quem
  // rodasse duas vezes por inseguranca levaria um erro e nao saberia se a
  // primeira valeu.
  db.prepare('DELETE FROM etiqueta').run();
  db.prepare('DELETE FROM etiqueta_lote').run();
  const r=limpar.aplicar({corte:TUDO});
  igual(r.apagados.sobra,0,'nada a apagar');
  igual(conta('sobra'),0,'e segue vazia');
}}

];

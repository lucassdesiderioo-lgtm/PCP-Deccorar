// TODO o DDL do modulo mora aqui, numerado, com tabela de migracoes.
//
// Por que numerado, e nao "CREATE TABLE IF NOT EXISTS" espalhado pelos modulos:
// no PCP do Mercado Livre as colunas foram nascendo a mao no banco de producao
// e os ALTER nunca voltaram para o codigo — o CREATE deixou de descrever o
// banco real, e instalacao limpa parou de bater com producao. Aqui uma migracao
// so roda uma vez, fica registrada, e o banco novo termina identico ao antigo.
//
// REGRA: migracao aplicada NUNCA se edita. Corrige-se com uma nova, no fim.
const MIGRACOES=[

{n:1, nome:'estrutura inicial', sql:`

/* ─── ACESSO ───────────────────────────────────────────────────────────── */
CREATE TABLE usuario (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  nome TEXT NOT NULL UNIQUE COLLATE NOCASE,
  salt TEXT NOT NULL,
  pin_hash TEXT NOT NULL,
  papel TEXT NOT NULL DEFAULT 'cortador',   -- diretor | cortador
  ativo INTEGER NOT NULL DEFAULT 1,
  criado_em TEXT DEFAULT (datetime('now','localtime'))
);

CREATE TABLE auditoria (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  usuario_nome TEXT,
  permissao TEXT,
  metodo TEXT, caminho TEXT,
  detalhe TEXT,
  ok INTEGER,
  criado_em TEXT DEFAULT (datetime('now','localtime')),
  data TEXT DEFAULT (date('now','localtime'))
);
CREATE INDEX idx_auditoria_data ON auditoria(data);

/* ─── PARAMETROS — a secao 6.5, cadastraveis, nunca constantes no codigo ── */
CREATE TABLE parametro (
  chave TEXT PRIMARY KEY,
  valor TEXT NOT NULL,
  tipo TEXT NOT NULL DEFAULT 'numero',      -- numero | texto
  rotulo TEXT NOT NULL,
  ajuda TEXT,
  unidade TEXT,
  ordem INTEGER DEFAULT 0,
  alterado_em TEXT, alterado_por TEXT
);

/* ─── CADASTRO DE TECIDO ───────────────────────────────────────────────── */
CREATE TABLE linha (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  nome TEXT NOT NULL UNIQUE COLLATE NOCASE,      -- 'Rolo', 'Romana'
  ordem INTEGER DEFAULT 0, ativo INTEGER DEFAULT 1
);

CREATE TABLE abertura (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  linha_id INTEGER NOT NULL REFERENCES linha(id),
  nome TEXT NOT NULL,                            -- '1%', '3%', 'Blackout'
  ordem INTEGER DEFAULT 0, ativo INTEGER DEFAULT 1,
  UNIQUE(linha_id, nome)
);

CREATE TABLE cor (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  nome TEXT NOT NULL UNIQUE COLLATE NOCASE,      -- 'Bege', 'Branco'
  ordem INTEGER DEFAULT 0, ativo INTEGER DEFAULT 1
);

/* O item de estoque e a combinacao que EXISTE comercialmente.
   ATENCAO: a largura da bobina NAO e do tecido — e do rolo. O mesmo
   Rolo 3% Bege existe em 2,00, 2,50 e 3,00, e e essa diferenca que o
   plano de corte explora. Aqui fica so uma sugestao para a entrada. */
CREATE TABLE tecido (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  codigo TEXT UNIQUE COLLATE NOCASE,             -- gerado: 'ROLO-3-BEGE'
  linha_id INTEGER NOT NULL REFERENCES linha(id),
  abertura_id INTEGER NOT NULL REFERENCES abertura(id),
  cor_id INTEGER NOT NULL REFERENCES cor(id),
  largura_sugerida REAL,                         -- so pre-preenche a entrada de rolo
  permite_girar INTEGER DEFAULT 0,               -- 0 = tecido tem sentido
  ativo INTEGER DEFAULT 1,
  UNIQUE(linha_id, abertura_id, cor_id)
);

/* ─── ENDERECAMENTO — DOIS ARMAZENS, TUDO CADASTRAVEL ──────────────────── */
CREATE TABLE armazem (chave TEXT PRIMARY KEY, nome TEXT NOT NULL, ordem INTEGER DEFAULT 0);

CREATE TABLE haste (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  armazem_chave TEXT NOT NULL REFERENCES armazem(chave),
  nome TEXT NOT NULL, ordem INTEGER DEFAULT 0, ativo INTEGER DEFAULT 1,
  UNIQUE(armazem_chave, nome)
);
CREATE TABLE andar (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  haste_id INTEGER NOT NULL REFERENCES haste(id),
  nome TEXT NOT NULL, ordem INTEGER DEFAULT 0, ativo INTEGER DEFAULT 1,
  UNIQUE(haste_id, nome)
);
CREATE TABLE nivel (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  andar_id INTEGER NOT NULL REFERENCES andar(id),
  nome TEXT NOT NULL, ordem INTEGER DEFAULT 0, ativo INTEGER DEFAULT 1,
  UNIQUE(andar_id, nome)
);

/* ─── ROLO ─────────────────────────────────────────────────────────────── */
CREATE TABLE rolo (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  codigo TEXT UNIQUE COLLATE NOCASE,             -- 'R-000087', sequencial
  tecido_id INTEGER NOT NULL REFERENCES tecido(id),
  largura REAL NOT NULL,                         -- largura DESTA bobina
  metragem_inicial REAL NOT NULL,                -- da NF; nao conferida hoje
  saldo REAL NOT NULL,                           -- metro linear
  nivel_id INTEGER REFERENCES nivel(id),         -- armazem ROLO
  status TEXT DEFAULT 'fechado',                 -- fechado|aberto|encerrado
  nf TEXT, fornecedor TEXT,
  criado_em TEXT DEFAULT (datetime('now','localtime')), criado_por TEXT
);
CREATE INDEX idx_rolo_busca ON rolo(tecido_id, status, largura, saldo);

CREATE TABLE movimento_rolo (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  rolo_id INTEGER NOT NULL REFERENCES rolo(id),
  delta REAL NOT NULL,          -- + entrada, - consumo, +- ajuste
  saldo_apos REAL NOT NULL,
  motivo TEXT NOT NULL,         -- entrada|consumo|ajuste|encerramento
  referencia TEXT,              -- id do plano que gerou o consumo
  observacao TEXT, usuario_nome TEXT,
  criado_em TEXT DEFAULT (datetime('now','localtime')),
  data TEXT DEFAULT (date('now','localtime'))
);
CREATE INDEX idx_movimento_rolo ON movimento_rolo(rolo_id);

/* ─── ETIQUETA DE SOBRA ────────────────────────────────────────────────── */
/* O sistema IMPRIME a etiqueta em lote sequencial; o cortador cola, bipa, e
   so entao a sobra nasce. Por isso "etiqueta colada e nao cadastrada" nao e
   um palpite sobre lacunas na sequencia: e a lista exata das etiquetas
   impressas que ainda nao foram bipadas. */
CREATE TABLE etiqueta_lote (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  quantidade INTEGER NOT NULL,
  de_seq INTEGER NOT NULL, ate_seq INTEGER NOT NULL,
  criado_em TEXT DEFAULT (datetime('now','localtime')), criado_por TEXT
);
CREATE TABLE etiqueta (
  codigo TEXT PRIMARY KEY COLLATE NOCASE,        -- 'S-000142'
  seq INTEGER NOT NULL UNIQUE,
  lote_id INTEGER REFERENCES etiqueta_lote(id),
  sobra_id INTEGER REFERENCES sobra(id),         -- preenchido quando e bipada
  usada_em TEXT,
  criado_em TEXT DEFAULT (datetime('now','localtime'))
);
CREATE INDEX idx_etiqueta_pendente ON etiqueta(sobra_id);

/* ─── SOBRA ────────────────────────────────────────────────────────────── */
CREATE TABLE sobra (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  codigo TEXT UNIQUE COLLATE NOCASE,             -- 'S-000142'
  tecido_id INTEGER NOT NULL REFERENCES tecido(id),
  largura REAL NOT NULL, altura REAL NOT NULL,
  area REAL GENERATED ALWAYS AS (largura * altura) STORED,
  condicao TEXT NOT NULL,       -- integra|mancha|furo|tom_fora|borda_desfiada
  nivel_id INTEGER NOT NULL REFERENCES nivel(id),  -- armazem SOBRA
  origem TEXT,                  -- 'rolo' | 'sobra' | 'inventario'
  origem_rolo_id INTEGER REFERENCES rolo(id),
  origem_sobra_id INTEGER REFERENCES sobra(id),
  status TEXT DEFAULT 'disponivel',   -- disponivel|usada|descartada
  criado_em TEXT DEFAULT (datetime('now','localtime')), criado_por TEXT,
  baixado_em TEXT, baixado_por TEXT, baixa_motivo TEXT
);
CREATE INDEX idx_sobra_busca ON sobra(tecido_id, status, largura, altura);

/* ─── CONDICAO DA SOBRA — cadastro, nao lista fixa ─────────────────────── */
/* 'aproveitavel' e o campo que decide se a sobra entra no plano. Defeito
   parcial entra, mas por ULTIMO: 'prioridade' ordena as candidatas. */
CREATE TABLE condicao_sobra (
  chave TEXT PRIMARY KEY,
  nome TEXT NOT NULL,
  aproveitavel INTEGER NOT NULL DEFAULT 1,
  prioridade INTEGER NOT NULL DEFAULT 0,   -- menor = tentada primeiro
  ordem INTEGER DEFAULT 0, ativo INTEGER DEFAULT 1
);

/* ─── REFUGO — a perda fica medida, nao some ───────────────────────────── */
CREATE TABLE refugo (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  tecido_id INTEGER REFERENCES tecido(id),
  largura REAL, altura REAL, area REAL,
  motivo TEXT,                  -- 'tira_estreita'|'resto_de_pe'|'descarte'
  plano_id INTEGER, usuario_nome TEXT,
  criado_em TEXT DEFAULT (datetime('now','localtime')),
  data TEXT DEFAULT (date('now','localtime'))
);

/* ─── MOTIVOS DE RECUSA — CADASTRO, NAO LISTA FIXA ─────────────────────── */
CREATE TABLE motivo_recusa (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  nome TEXT NOT NULL UNIQUE COLLATE NOCASE,
  ordem INTEGER DEFAULT 0, ativo INTEGER DEFAULT 1
);

/* ─── PLANO DE CORTE — o historico e o diagnostico ─────────────────────── */
CREATE TABLE plano (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  tecido_id INTEGER REFERENCES tecido(id),
  origem TEXT,                  -- 'digitado' | 'arquivo'
  consumo_linear REAL, consumo_m2 REAL,
  area_pecas REAL, area_sobra_gerada REAL, desperdicio REAL,
  usuario_nome TEXT, confirmado INTEGER DEFAULT 0,
  criado_em TEXT DEFAULT (datetime('now','localtime')),
  data TEXT DEFAULT (date('now','localtime'))
);
CREATE TABLE plano_peca (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  plano_id INTEGER NOT NULL REFERENCES plano(id),
  ordem INTEGER,
  tecido_id INTEGER REFERENCES tecido(id),   -- pode diferir do cabecalho
  largura REAL NOT NULL, altura REAL NOT NULL,
  faixa_id INTEGER,             -- em qual faixa esta peca ficou
  pos_x REAL,                   -- posicao na largura da faixa, para desenhar
  nao_alocada_motivo TEXT,      -- peca que nao coube: volta marcada, nunca some
  recusa_motivo_id INTEGER REFERENCES motivo_recusa(id),
  recusa_obs TEXT
);
CREATE TABLE plano_faixa (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  plano_id INTEGER NOT NULL REFERENCES plano(id),
  ordem INTEGER,
  fonte TEXT,                   -- 'rolo' | 'sobra'
  rolo_id INTEGER REFERENCES rolo(id),
  sobra_id INTEGER REFERENCES sobra(id),
  largura_disponivel REAL, altura REAL,
  largura_usada REAL,
  sobra_gerada_codigo TEXT      -- etiqueta que o operador colou ao confirmar
);
CREATE TABLE plano_recusa (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  plano_id INTEGER REFERENCES plano(id),
  sobra_id INTEGER REFERENCES sobra(id),
  motivo_id INTEGER REFERENCES motivo_recusa(id),
  observacao TEXT, usuario_nome TEXT,
  criado_em TEXT DEFAULT (datetime('now','localtime')),
  data TEXT DEFAULT (date('now','localtime'))
);
`
},

{n:2, nome:'altura minima da sobra', sql:`
/* Nasce 0 — "altura nao tem minimo", exatamente como a regra dos 80 cm foi
   decidida. O parametro existe porque a regra, aplicada ao pe de uma sobra,
   transforma uma tira de 1,90 x 0,10 em sobra com etiqueta: a largura passa
   folgado. Se a prateleira encher de tirinha, o diretor sobe este numero sem
   programador — e sem mexer na regra da largura, que e outra decisao. */
INSERT INTO parametro(chave,valor,tipo,rotulo,ajuda,unidade,ordem)
VALUES('alturaMinimaSobra','1.00','numero','Altura minima da sobra',
 'Resto com altura ABAIXO deste valor vira refugo, mesmo que a largura passe folgado. Vale 1,00 m porque persiana mais baixa que isso praticamente nao sai da fabrica: uma faixa de 1,90 x 0,10 tem largura de sobra e utilidade de lixo, e contada como sobra ela faria o desperdicio parecer menor do que e.',
 'm',4);
`
},

{n:3, nome:'tom unico por pedido e altura minima de 1 m', sql:`
/* O PEDIDO na peca do plano. Sem ele o sistema nao tem como saber quais
   pecas sao do MESMO cliente — e e essa a informacao que impede a persiana
   da sala sair de uma sobra e a do quarto sair da bobina, com tom diferente
   entre elas. Uma peca sem pedido e um grupo de uma peca so: livre. */
ALTER TABLE plano_peca ADD COLUMN pedido TEXT;

/* Altura minima da sobra: 1,00 m, decidido pelo dono. Abaixo disso o resto
   e refugo mesmo que a largura passe folgado — uma faixa de 1,90 x 0,10 tem
   largura de sobra e utilidade de lixo. */
UPDATE parametro SET valor='1.00' WHERE chave='alturaMinimaSobra' AND valor='0.00';
`
},

{n:4, nome:'login unico com o PCP', sql:`
/* LOGIN UNICO. A pessoa entra uma vez, no PCP, e atravessa para ca sem
   digitar PIN de novo. A conta daqui deixa de guardar credencial e passa a
   guardar so PERMISSAO: quem pode usar o modulo e com que papel.

   AUTENTICACAO no PCP, AUTORIZACAO aqui. E a divisao que evita o pior
   defeito do cadastro duplicado: alguem sair da empresa, ser bloqueado no
   PCP e continuar entrando no estoque de tecido porque ninguem lembrou do
   segundo sistema. Bloqueou la, nao entra aqui. */
ALTER TABLE usuario ADD COLUMN pcp_id INTEGER;
CREATE UNIQUE INDEX idx_usuario_pcp ON usuario(pcp_id) WHERE pcp_id IS NOT NULL;

/* pin_hash vazio = pessoa que so entra pelo PCP. O PIN proprio continua
   existindo para quem precisar entrar com o PCP fora do ar — o corte nao
   pode parar porque a expedicao caiu. */

INSERT INTO parametro(chave,valor,tipo,rotulo,ajuda,unidade,ordem)
VALUES('pcpUrl','http://localhost:3010','texto','Endereco do PCP',
 'De onde este modulo pergunta quem esta logado. Os dois sistemas rodam na mesma maquina, entao localhost e o normal. Apagar este valor desliga o login unico e todo mundo passa a entrar com o PIN proprio daqui.',
 '',10);
`},

{n:5, nome:'a etiqueta em PDF e cadastravel', sql:`
/* A ETIQUETA DEIXA DE SER CONSTANTE NO CODIGO.

   Ela e um objeto fisico que a equipe vai ajustar olhando o resultado na
   bancada — "a letra ta pequena", "a barra some quando a etiqueta amassa".
   Cada um desses ajustes era um deploy. Agora e um campo na tela, e quem
   decide e quem cola a etiqueta na peca.

   ⚠️ O TEXTO EMBAIXO DA BARRA NAO E LEGENDA. E onde o operador PROCURA a
   sobra na prateleira: ele passa o olho na estante lendo numero, e usa o
   leitor so na hora de confirmar. Por isso a fonte nasce em 22 pt, o dobro
   do que era — e por isso ela e o primeiro parametro da lista. */
INSERT INTO parametro(chave,valor,tipo,rotulo,ajuda,unidade,ordem) VALUES
('etqFonteCodigo','22','numero','Etiqueta: tamanho do codigo escrito',
 'A altura da letra do codigo (S-000123) impresso embaixo das barras. E por este texto que o operador acha a sobra na prateleira — o leitor serve para confirmar, nao para procurar. Se a equipe reclamar que precisa chegar perto para ler, aumente aqui. Se o codigo passar da largura da etiqueta, o sistema reduz o suficiente para caber e avisa.',
 'pt',20),

('etqBarraAltura','14','numero','Etiqueta: altura das barras',
 'Barra curta obriga o operador a mirar com o leitor, e mirar na bancada e o que faz ele desistir do leitor e digitar. Barra alta come o espaco do codigo escrito. 14 mm e o equilibrio que sobrou depois de reservar a letra grande.',
 'mm',21),

('etqLargura','100','numero','Etiqueta: largura da bobina',
 'A largura do rolo de etiqueta que esta na Zebra. Cada pagina do PDF sai exatamente neste tamanho, entao nao existe "ajustar a pagina" para dar errado. Trocou de bobina, troca aqui.',
 'mm',22),

('etqAltura','35','numero','Etiqueta: altura da bobina',
 'A altura de uma etiqueta da bobina. O sistema confere se a barra, o codigo e as margens caibam nesta altura, e RECUSA gerar o PDF se nao couberem — melhor recusar na tela do que imprimir 300 etiquetas cortadas.',
 'mm',23),

('etqMargem','4','numero','Etiqueta: margem',
 'A folga em volta do desenho. Nao e estetica: o silencio do codigo de barras (as barras vazias de cada lado, sem as quais o leitor nao acha o comeco do codigo) tem que caber DENTRO da area impressa, e a Zebra tem folga de alinhamento da bobina.',
 'mm',24);

/* pcpUrl SAI. Ele apontava para a ponte HTTP que perguntava ao PCP quem
   estava logado — e essa ponte deixou de existir quando o modulo passou a
   ser montado dentro do proprio PCP (nao ha mais o que perguntar, o usuario
   chega resolvido).

   Nao e faxina: parametro que nao faz nada e MENTIRA na tela de cadastro.
   Alguem editaria aquele endereco tentando resolver um problema de acesso,
   nada mudaria, e a conclusao seria "esse sistema nao obedece". */
DELETE FROM parametro WHERE chave='pcpUrl';
`},

{n:6, nome:'as larguras de bobina viram cadastro', sql:`
/* AS LARGURAS QUE A FABRICA COMPRA.

   Ate aqui a largura era digitada livre em cada entrada de rolo. Funciona, e
   erra de dois jeitos que ninguem percebe: '2,5' e '2,50' viram larguras
   diferentes na consulta do plano, e um '20,0' com a virgula no lugar errado
   entra como bobina de vinte metros — e o encaixe passa a "achar" que cabe
   qualquer peca.

   Com a lista, a entrada normal e um toque num botao. O campo livre continua
   existindo (rolo que chega com largura fora do padrao existe, e recusar a
   entrada dele seria a armadilha #6: a trava que a bancada aprende a
   contornar), mas ele AVISA que aquela largura nao esta cadastrada. */
CREATE TABLE largura_bobina (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  valor REAL NOT NULL UNIQUE,                    -- em metros: 2.00, 2.50, 3.00
  ordem INTEGER DEFAULT 0,
  ativo INTEGER DEFAULT 1,
  criado_em TEXT DEFAULT (datetime('now','localtime'))
);

/* A LISTA NASCE DO QUE JA EXISTE NA PRATELEIRA, nao de um chute meu.
   Num banco novo isso nao traz nada e a lista comeca vazia — que e honesto:
   a primeira entrada de rolo ensina qual largura cadastrar. Em producao ela
   herda exatamente as bobinas que a fabrica ja usa. */
INSERT OR IGNORE INTO largura_bobina(valor)
  SELECT DISTINCT ROUND(largura,3) FROM rolo WHERE largura>0;
`},

{n:7, nome:'etiqueta do rolo e mudanca de endereco', sql:`
/* A ETIQUETA DO ROLO — outra bobina, outras medidas.
   Ela e colada DENTRO do tubo de papelao e lida de longe, na estante, por
   quem esta procurando o rolo. Nada a ver com a etiqueta de sobra, que e
   colada na peca dobrada e lida de perto: por isso os parametros sao
   proprios, e nao um "reaproveita os da sobra" que faria mexer numa
   estragar a outra. */
INSERT INTO parametro(chave,valor,tipo,rotulo,ajuda,unidade,ordem) VALUES
('etqRoloFonte','54','numero','Etiqueta do rolo: tamanho do codigo',
 'O R-000012 impresso grande. E o numero que o operador le da estante, sem chegar perto — por isso ele nasce em 54 pt, mais que o dobro da etiqueta de sobra. Se o codigo passar da largura, o sistema reduz o suficiente para caber.',
 'pt',30),

('etqRoloLargura','100','numero','Etiqueta do rolo: largura da bobina',
 'A largura do rolo de etiqueta usado para os tubos. Cada pagina do PDF sai exatamente neste tamanho.',
 'mm',31),

('etqRoloAltura','150','numero','Etiqueta do rolo: altura da bobina',
 'A altura de uma etiqueta. Maior que a da sobra porque ela carrega mais coisa: codigo, tecido, largura da bobina e endereco. O sistema recusa gerar se o conteudo nao couber.',
 'mm',32),

('etqRoloBarra','22','numero','Etiqueta do rolo: altura das barras',
 'Barra mais alta que a da sobra: esta e bipada dentro do tubo, com menos luz e em angulo pior.',
 'mm',33),

('etqRoloMargem','6','numero','Etiqueta do rolo: margem',
 'Folga em volta. Maior que a da sobra porque a etiqueta e colada em superficie curva, e a borda e onde ela descola primeiro.',
 'mm',34);
`},

{n:8, nome:'a bancada cadastra o que falta, e a chefia confere depois', sql:`
/* A BANCADA NAO ESPERA A CHEFIA — ELA CRIA, E A CHEFIA CONFERE DEPOIS.

   Ate aqui largura de bobina e endereco eram cadastro de chefia. O modo de
   falhar disso nao e o operador esperar: e ele NAO esperar. Rolo na mao,
   largura fora da lista e a chefia em reuniao, o que acontece na bancada e o
   toque no botao de 2,00 — e a partir dali o encaixe decide de onde cortar
   com uma largura que aquele tubo nao tem. Armadilha #6 do CLAUDE.md, na
   letra: a trava que dispara no caso normal vira desvio que a equipe aprende
   a fazer, e o desvio acontece fora da vista do sistema.

   A troca e de ORDEM, nao de rigor. Antes: pedir -> esperar -> lancar. Agora:
   lancar -> marcar -> conferir. Nada fica sem revisao; o que muda e que a
   revisao deixa de ser porteiro e vira lista de trabalho da chefia.

   A coluna conferir=1 e o marcador. Nasce 0 nas linhas que ja existem, e esta
   certo:
   elas foram cadastradas pela chefia, ja estao conferidas. */
ALTER TABLE largura_bobina ADD COLUMN conferir INTEGER NOT NULL DEFAULT 0;
ALTER TABLE largura_bobina ADD COLUMN criado_por TEXT;

ALTER TABLE haste ADD COLUMN conferir INTEGER NOT NULL DEFAULT 0;
ALTER TABLE haste ADD COLUMN criado_por TEXT;
ALTER TABLE haste ADD COLUMN criado_em TEXT;

ALTER TABLE andar ADD COLUMN conferir INTEGER NOT NULL DEFAULT 0;
ALTER TABLE andar ADD COLUMN criado_por TEXT;
ALTER TABLE andar ADD COLUMN criado_em TEXT;

ALTER TABLE nivel ADD COLUMN conferir INTEGER NOT NULL DEFAULT 0;
ALTER TABLE nivel ADD COLUMN criado_por TEXT;
ALTER TABLE nivel ADD COLUMN criado_em TEXT;
`},

{n:9, nome:'de quem veio o rolo e quanto ele custou', sql:`
/* O FORNECEDOR ERA TEXTO LIVRE, E ISSO JA ERA DIVIDA.
   'Ecotex', 'ecotex' e 'Ecotex Ltda' sao tres fornecedores na hora de somar —
   o mesmo defeito de '2,5' e '2,50' virarem duas bobinas. Comparacao entre
   fornecedores nao existe enquanto o nome for digitado. */
CREATE TABLE fornecedor (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  nome TEXT NOT NULL UNIQUE COLLATE NOCASE,
  ordem INTEGER DEFAULT 0,
  ativo INTEGER DEFAULT 1,
  conferir INTEGER NOT NULL DEFAULT 0,
  criado_por TEXT,
  criado_em TEXT DEFAULT (datetime('now','localtime'))
);

/* A lista nasce do que ja foi digitado, marcada para a chefia conferir — e
   ela vai achar os duplicados ali, que e o ponto. Uma lista semeada limpa
   esconderia justamente a bagunca que motivou o cadastro. */
INSERT OR IGNORE INTO fornecedor(nome,conferir)
  SELECT DISTINCT TRIM(fornecedor), 1 FROM rolo WHERE TRIM(COALESCE(fornecedor,''))<>'';

ALTER TABLE rolo ADD COLUMN fornecedor_id INTEGER REFERENCES fornecedor(id);

/* ⚠️ O PRECO E DESTA COMPRA, E CONGELA AQUI.
   A tentacao e guardar o preco no cadastro do fornecedor e multiplicar na
   hora de mostrar. O dia em que ele reajustasse, TODO o estoque comprado
   antes mudaria de valor retroativamente — o rolo pago a R$ 18 em marco
   passaria a valer R$ 22 porque houve reajuste em setembro, e ninguem
   perceberia: o numero so ficaria maior.

   Mesma regra do COMPRAS.md: o pedido congela embalagem, fator e preco.
   O R$ parado e a soma exata do que foi pago, rolo a rolo.

   Nasce NULL, e NULL nao e zero: a nota chega dias depois do rolo. Rolo sem
   preco e contado a parte e o total sai como PISO (>=), nunca somando zero —
   zero e um custo valido e mentiroso (regra 4 do COMPRAS.md). */
ALTER TABLE rolo ADD COLUMN preco_m2 REAL;

/* A ligacao do texto velho com o cadastro novo. O que nao casar fica com
   fornecedor_id NULL e o texto original preservado na coluna antiga — nunca
   se apaga o que foi digitado para "arrumar" o dado. */
UPDATE rolo SET fornecedor_id=(
  SELECT f.id FROM fornecedor f WHERE f.nome=TRIM(rolo.fornecedor))
 WHERE TRIM(COALESCE(fornecedor,''))<>'';

CREATE INDEX idx_rolo_fornecedor ON rolo(fornecedor_id, tecido_id);
`},

{n:10, nome:'estoque minimo gerencial — os dois numeros que governam o status', sql:`
/* ⚠️ O ESTOQUE MINIMO NAO E UM PERCENTUAL CHUTADO NO CODIGO.
   Sem prazo de fornecedor (que este modulo NAO tem, e nao e escopo dele) nao
   existe ponto de pedido honesto. O que existe e uma pergunta que o gestor
   consegue responder: "quantos dias eu quero ter na prateleira?".

   minimo = consumo medio diario x dias de cobertura x (1 + seguranca)

   Os dois vivem na tabela parametro, e nao no codigo, por tres coisas: o gestor
   muda sem deploy, a tela mostra o rotulo e a ajuda ao lado do numero, e a
   conta fica auditavel — um "x 1,3" escondido numa funcao e um numero que
   ninguem sabe de onde saiu.

   A seguranca NASCE ZERO de proposito. Um colchao inventado no primeiro dia
   viraria fato: o minimo sairia inflado e ninguem lembraria que 30% foi
   palpite meu, nao decisao de ninguem. Zero e honesto e visivel — quando a
   fabrica souber a variabilidade real, sobe o numero com razao. */
INSERT INTO parametro(chave,valor,tipo,rotulo,ajuda,unidade,ordem) VALUES
('estMinDias','30','numero','Estoque minimo: dias de cobertura',
 'Quantos dias de consumo o estoque deve cobrir. E este numero que define o minimo de cada material: consumo medio diario x estes dias. Trinta dias e um mes de producao — suba se a reposicao demorar, desca se o giro for rapido e o dinheiro fizer falta.',
 'dias',40),

('estMinSeguranca','0','numero','Estoque minimo: margem de seguranca',
 'Percentual somado ao minimo para absorver mes atipico. NASCE ZERO de proposito: um colchao inventado no primeiro dia viraria fato, e o minimo sairia inflado sem ninguem lembrar por que. Suba quando a fabrica souber a variabilidade real do consumo.',
 '%',41),

('paradoDias','90','numero','A partir de quantos dias o estoque e "parado"',
 'Material sem NENHUM consumo neste periodo entra como parado no painel gerencial. As faixas de 30/60/90/180 dias continuam aparecendo todas — este numero so define a partir de qual delas o status vira PARADO.',
 'dias',42);

/* O painel varre movimento por data e motivo em toda abertura de tela. O
   indice que existia e por rolo_id — otimo para o historico de UM rolo,
   inutil para "todo consumo dos ultimos 90 dias". */
CREATE INDEX idx_movimento_periodo ON movimento_rolo(motivo, data);
`},

{n:11, nome:'a medida da sobra vira lista, e nao campo digitado', sql:`
/* ⚠️ DIGITAR MEDIDA E O ERRO QUE NAO DA ERRO.
   O campo aceitava "1,90", "1.90" e "190" — e so o terceiro e visivelmente
   errado. Os dois primeiros entram calados como numeros DIFERENTES conforme
   o navegador e o teclado do tablet, e o defeito so aparece no plano de
   corte, com o tecido na mesa: uma sobra cadastrada como 1,9 cm em vez de
   1,90 m vira retalho que o encaixe nunca escolhe, ou pior, uma faixa
   prometida que a peca nao tem.

   A lista mata a classe inteira do problema: nao ha o que digitar errado.

   ⚠️ ESTES QUATRO NUMEROS SAO O ALCANCE DA LISTA, E NAO REGRA DE NEGOCIO.
   Quem decide o que vira sobra e o que vira refugo continua sendo
   larguraMinimaSobra / alturaMinimaSobra, no plano de corte, onde sempre
   esteve. Comecar a lista naqueles valores pareceria coerente e seria a
   armadilha #6: o sobra.criar NAO exige o minimo, entao hoje uma sobra de
   0,60 entra normalmente — e o operador com essa peca na mao, sem 0,60 na
   lista, escolheria 0,80 e MENTIRIA a medida. A lista tem que alcancar o
   que existe na prateleira, nao o que a regra prefere. */
INSERT INTO parametro(chave,valor,tipo,rotulo,ajuda,unidade,ordem) VALUES
('sobraLarguraMin','0.50','numero','Sobra: menor largura da lista',
 'O primeiro valor da lista de largura ao cadastrar sobra. E o ALCANCE da lista, nao a regra do que vira refugo — essa continua em "Largura minima da sobra". Desca este numero se a bancada tiver retalho mais estreito que isso: lista que nao alcanca a peca na mao faz o operador escolher o valor errado de proposito.',
 'm',50),

('sobraLarguraMax','3.00','numero','Sobra: maior largura da lista',
 'O ultimo valor da lista de largura. Nenhuma sobra e mais larga que a maior bobina que a fabrica compra — hoje 3,00 m. Suba junto se entrar bobina maior.',
 'm',51),

('sobraAlturaMin','0.50','numero','Sobra: menor altura da lista',
 'O primeiro valor da lista de altura. Mesma logica da largura: alcance, nao regra.',
 'm',52),

('sobraAlturaMax','6.00','numero','Sobra: maior altura da lista',
 'O ultimo valor da lista de altura. Vai mais longe que a largura porque a altura corre no sentido do rolo, e um retalho comprido e comum.',
 'm',53);
`}

];

// ─────────────────────────────────────────────────────────────────────────
// Semente: o minimo para o sistema abrir com sentido. Roda so uma vez, na
// criacao da tabela — o que o diretor apagar depois fica apagado.
const SEMENTE=[
  {n:1, nome:'armazens, parametros, motivos e condicoes', executar(db){
    const arm=db.prepare('INSERT INTO armazem(chave,nome,ordem) VALUES(?,?,?)');
    arm.run('ROLO','Rolos',1);
    arm.run('SOBRA','Sobras',2);

    // Os tres parametros da secao 6.5. margem = 0 pela resposta do dono:
    // as pecas encostam. Fica cadastravel porque a decisao pode mudar sem
    // programador — e mudar margem muda TODO o encaixe.
    const par=db.prepare('INSERT INTO parametro(chave,valor,tipo,rotulo,ajuda,unidade,ordem) VALUES(?,?,?,?,?,?,?)');
    par.run('larguraMinimaSobra','0.80','numero','Largura minima da sobra',
      'Resto com largura ABAIXO deste valor vira refugo em vez de sobra com etiqueta. Vale so para a largura — altura nao tem minimo.','m',1);
    par.run('pesoSobra','0.50','numero','Peso da sobra gerada',
      'Quanto da sobra que nasce do corte conta como material recuperado na conta do desperdicio. E a unica variavel de julgamento do modulo: responde se o retalho que vai pra prateleira volta a ser usado (1,00) ou encalha (0,00). Metade e o palpite honesto de quem ainda nao tem historico.','0 a 1',2);
    par.run('margem','0.00','numero','Margem entre pecas',
      'Folga entre uma peca e a seguinte, e nas bordas da bobina. Zero significa que as pecas encostam. Aumentar aqui muda todo o encaixe: com 2 cm, tres pecas de 0,90 deixam de caber numa bobina de 2,70.','m',3);

    const mot=db.prepare('INSERT INTO motivo_recusa(nome,ordem) VALUES(?,?)');
    ['Tonalidade diferente','Defeito nao cadastrado','Textura / brilho diferente',
     'Peca do mesmo pedido — tom unico','Outro'].forEach((n,i)=>mot.run(n,i+1));

    // Condicao da sobra. 'prioridade' faz o defeito parcial entrar no plano
    // POR ULTIMO — resposta do dono a pergunta 4 da secao 11.
    const con=db.prepare('INSERT INTO condicao_sobra(chave,nome,aproveitavel,prioridade,ordem) VALUES(?,?,?,?,?)');
    con.run('integra','Integra',1,0,1);
    con.run('mancha','Mancha',1,1,2);
    con.run('furo','Furo',1,1,3);
    con.run('tom_fora','Tom fora',1,1,4);
    con.run('borda_desfiada','Borda desfiada',1,1,5);
  }}
];

function aplicar(db){
  db.exec("CREATE TABLE IF NOT EXISTS migracao(n INTEGER PRIMARY KEY, nome TEXT, aplicada_em TEXT DEFAULT (datetime('now','localtime')))");
  const feitas=new Set(db.prepare('SELECT n FROM migracao').all().map(r=>r.n));
  const registra=db.prepare('INSERT INTO migracao(n,nome) VALUES(?,?)');

  for(const m of MIGRACOES){
    if(feitas.has(m.n)) continue;
    db.transaction(()=>{
      db.exec(m.sql);
      const s=SEMENTE.find(s=>s.n===m.n);
      if(s) s.executar(db);
      registra.run(m.n,m.nome);
    })();
    console.log('[schema] migracao '+m.n+' aplicada: '+m.nome);
  }
}

module.exports={aplicar,MIGRACOES};

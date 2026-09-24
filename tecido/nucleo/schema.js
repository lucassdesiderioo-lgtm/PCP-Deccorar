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
`},

{n:12, nome:'a sobra lancada errada se corrige, e a correcao deixa rastro', sql:`
/* A SOBRA E CADASTRO FEITO NA BANCADA, e cadastro feito na bancada erra:
   o mutirao lembra o tecido entre um retalho e o seguinte (e o que faz ele
   render), e o primeiro retalho da prateleira nova entra com a cor do
   anterior. Ate aqui a unica saida era o descarte — que e da chefia, e que
   mede a peca como PERDA no refugo, para uma peca que esta inteira na
   prateleira.

   O que a sobra nao tinha era a memoria do rolo: la, mudar preco ou endereco
   fica em movimento_rolo com delta zero, dizendo de -> para e quem fez. Esta
   tabela e a mesma ideia, para o que a sobra tem de editavel. Uma linha por
   campo corrigido, com o valor como se le na tela — o historico e para gente
   ler, e quem le nao tem o id do tecido de tres meses atras na cabeca. */
CREATE TABLE sobra_correcao (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  sobra_id INTEGER NOT NULL REFERENCES sobra(id),
  campo TEXT NOT NULL,          -- tecido | largura | altura | condicao | endereco
  de TEXT, para TEXT,           -- como se le na tela, nao o id
  usuario_nome TEXT,
  criado_em TEXT DEFAULT (datetime('now','localtime'))
);
CREATE INDEX idx_sobra_correcao ON sobra_correcao(sobra_id);
`},

{n:13, nome:'a bancada aponta o erro da sobra, e a chefia aceita', sql:`
/* CORRIGIR E DA CHEFIA (decisao do dono, 05/09/2026) — mas quem percebe o
   erro e a bancada, com o retalho na mao. Se ela nao tem como registrar o
   que viu, o erro fica na cabeca de quem viu ate a chefia passar por ali, e
   isso e a mesma doenca de sempre: o dado mora na memoria e nao no sistema.

   O apontamento e uma PROPOSTA: guarda so os campos que a bancada acha que
   estao errados (os outros ficam NULL), o motivo, e espera. A chefia aceita
   — e ai vira correcao, pelo mesmo corrigir de sempre, com o rastro
   apontando para a proposta — ou recusa, dizendo por que. A bancada le a
   decisao na propria sobra. */
CREATE TABLE sobra_proposta (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  sobra_id INTEGER NOT NULL REFERENCES sobra(id),
  tecido_id INTEGER REFERENCES tecido(id),   -- so o que a bancada quer mudar
  largura REAL, altura REAL,
  condicao TEXT,
  nivel_id INTEGER REFERENCES nivel(id),
  motivo TEXT,                                -- o que ela viu ("veio bege, e cinza")
  status TEXT NOT NULL DEFAULT 'pendente',   -- pendente | aceita | recusada
  criado_por TEXT, criado_em TEXT DEFAULT (datetime('now','localtime')),
  decidido_por TEXT, decidido_em TEXT, decisao_motivo TEXT
);
CREATE INDEX idx_sobra_proposta ON sobra_proposta(sobra_id, status);

/* A correcao que nasceu de um apontamento sabe de qual. E o que deixa o
   historico dizer "proposto por Ana, aceito por Lucas" em vez de so "Lucas". */
ALTER TABLE sobra_correcao ADD COLUMN proposta_id INTEGER REFERENCES sobra_proposta(id);
`},

{n:14, nome:'a sobra sabe quanto vale o metro quadrado', sql:`
/* QUANTO VALE O QUE ESTA NA PRATELEIRA DE SOBRAS. O rolo ja sabia
   (rolo.preco_m2, congelado na compra); a sobra nao, e a pergunta "quanto
   temos em reais de cada tecido em retalho" nao tinha resposta.

   O PRECO MORA NA SOBRA, como mora no rolo — e pela mesma razao: preco no
   cadastro do tecido, multiplicado na hora de mostrar, muda o valor de todo
   o acervo no dia do reajuste, e ninguem percebe porque o numero so cresce.
   A sobra que nasce do corte HERDA o preco do rolo de onde saiu (e a que
   nasce de outra sobra, o dela); a do mutirao do acervo nasce sem preco, e a
   chefia lanca por tecido, numa vez so. Sem preco nao e zero: e "ainda nao
   se sabe", e o total sai como piso. */
ALTER TABLE sobra ADD COLUMN preco_m2 REAL;
`},

{n:15, nome:'o preco do m² e do TECIDO — a pergunta e quanto temos de sobra, em reais', sql:`
/* A migracao 14 pos o preco na sobra, congelado, como no rolo. Durou um dia:
   o dono da operacao disse que a pergunta e uma so — "quanto temos em reais
   de sobra" — e que o estoque antigo, sem nota, nunca teria preco pago. Um
   preco por sobra obrigava a inventar o que se pagou por um retalho que
   ninguem sabe de onde veio.

   Entao o preco e do TECIDO: um numero por item (Rolo · 3% · Bege), e a
   sobra vale area x esse preco. Atualizou o preco do tecido, todas as sobras
   dele acompanham — e e isso que se quer de uma ESTIMATIVA de acervo, que e
   o que esta conta e. O rolo continua com o preco pago, congelado, porque la
   a pergunta e outra (quanto se pagou naquela compra).

   sobra.preco_m2 fica na tabela, sem uso: migracao aplicada nao se edita.
   Toda mudanca do preco do tecido deixa linha em tecido_preco. */
ALTER TABLE tecido ADD COLUMN preco_m2 REAL;
CREATE TABLE tecido_preco (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  tecido_id INTEGER NOT NULL REFERENCES tecido(id),
  de REAL, para REAL,
  usuario_nome TEXT,
  criado_em TEXT DEFAULT (datetime('now','localtime'))
);
CREATE INDEX idx_tecido_preco ON tecido_preco(tecido_id);
`},

{n:16, nome:'o catalogo do sob medida — modelo, escada de tubos e ficha tecnica', sql:`
/* ═══ O PEDIDO SOB MEDIDA ENTRA NO SISTEMA ════════════════════════════════
   Fase 1 da spec SOBMEDIDA-PEDIDO-REVENDA: o catalogo e a ficha tecnica.
   Nenhum pedido, nenhuma revenda, nenhuma etiqueta — isso e da 3 em diante.

   ⚠️ PREFIXO sm_ PORQUE O MODULO PASSOU A TER DOIS ASSUNTOS. Ate aqui todas
   as tabelas daqui falavam de ESTOQUE DE TECIDO; estas falam de VENDA. Uma
   tabela chamada so modelo obrigaria quem le a adivinhar de qual dos dois
   ela e — e modelo e componente ja querem dizer outra coisa no PCP.

   ⚠️ MILIMETRO INTEIRO E CENTAVO INTEIRO, em toda coluna. A conta da ficha
   EMPILHA (o tubo tira do final, o tecido tira do tubo, a base soma no
   tecido) e ruido de ponto flutuante compoe a cada degrau. Area em mm²
   inteiro pelo mesmo motivo: 1 m² = 1.000.000, e a divisa "3,0 m² fica no
   degrau de baixo" passa a existir de verdade, sem depender de tolerancia.
   Quem entra e sai dessas unidades e o nucleo/unidade.js, porta unica. */

CREATE TABLE sm_modelo (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  nome TEXT NOT NULL UNIQUE COLLATE NOCASE,      -- 'Rolo', 'Rolo Duplex'
  /* Tetos do MODELO. NULL = sem teto proprio, e quem limita e a escada ou a
     colecao. Vale sempre o mais restritivo dos tres (secao 4.4). */
  largura_max_mm INTEGER, altura_max_mm INTEGER, m2_max_mm2 INTEGER,
  m2_min_faturado_mm2 INTEGER NOT NULL DEFAULT 1500000,   -- 1,5 m²
  ordem INTEGER DEFAULT 0, ativo INTEGER DEFAULT 1,
  criado_em TEXT DEFAULT (datetime('now','localtime')), criado_por TEXT
);

/* ⚠️ A COLECAO DE VENDA APONTA PARA O CADASTRO DE TECIDO. NUNCA O DUPLICA.
   Duas listas de colecoes — uma de venda, outra de estoque — divergiriam no
   primeiro tecido novo, e o pedido chegaria ao plano de corte pedindo um
   tecido que o estoque nao reconhece (secao 4.3 da spec).

   ⚠️ E O MODELO NAO GUARDA LINHA — decisao da secao 8, respondida em
   22/09/2026. A abertura ja pendura em linha com UNIQUE(linha_id,nome), e
   o criarTecido recusa abertura_de_outra_linha: a linha JA ESTA DENTRO da
   colecao. Guardar tambem no modelo seria uma segunda afirmacao sobre o mesmo
   fato, e as duas divergiriam — e exatamente o defeito do linhaSel/linhaForm
   de 15/09/2026, em que o formulario descrevia Double Vision com uma colecao
   do Rolo. Alem disso os dois nao sao a mesma coisa: linha e a familia do
   TECIDO (Rolo, Romana, Double Vision) e o modelo e o MECANISMO (Rolo, Rolo
   Duplex, Rolo Motorizada) — Rolo e Motorizada partilham o mesmo tecido.

   O que a venda acrescenta e o que o estoque nao tem: preco por m², largura
   maxima, m² maximo e minimo faturado. */
CREATE TABLE sm_modelo_colecao (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  modelo_id INTEGER NOT NULL REFERENCES sm_modelo(id),
  abertura_id INTEGER NOT NULL REFERENCES abertura(id),
  /* NULL nao e zero: e "ainda nao se sabe". Custo indefinido nunca vira zero
     (regra 4 do COMPRAS.md) — o total sai como PISO e a linha e nomeada. */
  preco_m2_centavos INTEGER,
  largura_max_mm INTEGER, altura_max_mm INTEGER, m2_max_mm2 INTEGER,
  m2_min_faturado_mm2 INTEGER,                   -- NULL = usa o do modelo
  ordem INTEGER DEFAULT 0, ativo INTEGER DEFAULT 1,
  UNIQUE(modelo_id, abertura_id)
);

/* A cor dos acessorios (base, ponteiras) sai da MESMA tabela cor do
   cadastro de tecido. Uma segunda lista de cores multiplicaria o mesmo
   punhado de nomes, que e a armadilha da "Napoles Bege" do README. */
CREATE TABLE sm_modelo_cor_acessorio (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  modelo_id INTEGER NOT NULL REFERENCES sm_modelo(id),
  cor_id INTEGER NOT NULL REFERENCES cor(id),
  ordem INTEGER DEFAULT 0, ativo INTEGER DEFAULT 1,
  UNIQUE(modelo_id, cor_id)
);

/* O QUE A PERSIANA LEVA DENTRO. Nao e o material de compra (isso e do
   COMPRAS.md, e chega na fase 4): e a peca que vira etiqueta, que tem setor,
   e que as vezes tem preco proprio.

   unidade_cobranca diz DE ONDE sai o preco daquela linha:
     m2_colecao   o preco do m² da colecao escolhida (o tecido)
     metro        preco por metro linear da largura REAL (bando, barra)
     peca         preco fixo por peca (reducao de peso)
     NULL         nao cobra — e a maioria */
CREATE TABLE sm_componente (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  chave TEXT NOT NULL UNIQUE COLLATE NOCASE,
  nome TEXT NOT NULL,
  setor TEXT NOT NULL,            -- serralheria|colecao|montagem|revisao|embalagem
  gera_etiqueta INTEGER NOT NULL DEFAULT 1,
  eh_kit INTEGER NOT NULL DEFAULT 0,
  /* O kit tradicional leva os suportes PADRAO dele; os de bando e de barra
     contam pela largura (secao 4.7). A diferenca e cadastro, nao if. */
  usa_faixa_suporte INTEGER NOT NULL DEFAULT 0,
  codigo_barras TEXT UNIQUE COLLATE NOCASE,
  preco_centavos INTEGER,
  unidade_cobranca TEXT,
  largura_max_mm INTEGER, altura_max_mm INTEGER,   -- limite DESTE componente
  ordem INTEGER DEFAULT 0, ativo INTEGER DEFAULT 1
);

/* A ESCADA DE TUBOS. Sobe ate o primeiro degrau onde a persiana cabe nos
   DOIS limites: largura e m². Passou de qualquer um dos dois, sobe.
   A medida exata fica no degrau de baixo.

   Nao ha coluna de material aqui na fase 1, e e de proposito: ligar o degrau
   ao tubo comprado e pergunta de Compras (fase 4), e coluna que nao faz nada
   e mentira na tela de cadastro. Ela entra por ALTER quando houver o que
   ligar — nunca recriando a tabela. */
CREATE TABLE sm_degrau_tubo (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  modelo_id INTEGER NOT NULL REFERENCES sm_modelo(id),
  ordem INTEGER NOT NULL,
  nome TEXT NOT NULL,                             -- 'Tubo 32'
  largura_max_mm INTEGER NOT NULL,
  m2_max_mm2 INTEGER NOT NULL,
  desconto_mm INTEGER NOT NULL,                   -- o tubo = final - isto
  acrescimo_altura_tecido_mm INTEGER NOT NULL,    -- o tecido = final + isto
  aceita_bando INTEGER NOT NULL DEFAULT 0,
  aceita_reducao INTEGER NOT NULL DEFAULT 0,      -- reducao PEDIDA (secao 4.6)
  ativo INTEGER DEFAULT 1,
  UNIQUE(modelo_id, ordem)
);

/* ⚠️ A FICHA TEM OS DOIS NUMEROS POR LINHA — armadilha #18 do CLAUDE.md, e a
   coluna existe desde o primeiro dia mesmo nascendo igual.

     corte     vai para a ETIQUETA. E a quanto a bancada corta.
     consumo   vai para COMPRAS e para o CUSTO. E quanto a peca gasta.

   No PCP os dois nunca fecham: o tubo de uma persiana de 1,60 CONSOME 1,60 m
   da barra e e CORTADO a 1,57 — os 3 cm vao pro lixo, e precificar pela
   medida de corte faz a fabrica parar de pagar por eles. Quem um dia
   "unificar" esta cortando ou a peca ou o custo.

   Cada linha e "referencia + ajuste" (secao 4.5), e nao linguagem de formula:
     ref_largura   final | degrau (final - desconto) | <chave de componente>
     ref_altura    final | degrau (final + acrescimo)
   Se um modelo futuro precisar de expressao, ela passa pelo avaliador seguro
   do PCP (formula.js, sem eval) — nunca por uma segunda porta.

   quando diz se a linha entra: sempre | bando | barra | sem_adicional |
   reducao. */
CREATE TABLE sm_ficha_linha (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  modelo_id INTEGER NOT NULL REFERENCES sm_modelo(id),
  componente_id INTEGER NOT NULL REFERENCES sm_componente(id),
  ordem INTEGER NOT NULL,
  quando TEXT NOT NULL DEFAULT 'sempre',
  quantidade INTEGER NOT NULL DEFAULT 1,
  ref_largura TEXT, ajuste_largura_mm INTEGER,
  ref_altura  TEXT, ajuste_altura_mm  INTEGER,
  consumo_ref_largura TEXT, consumo_ajuste_largura_mm INTEGER,
  consumo_ref_altura  TEXT, consumo_ajuste_altura_mm  INTEGER,
  ativo INTEGER DEFAULT 1,
  UNIQUE(modelo_id, componente_id, quando)
);

/* Quantos suportes o kit leva, pela largura. A medida exata fica no degrau de
   baixo: 1,000 -> 2 e 1,001 -> 3. */
CREATE TABLE sm_faixa_suporte (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  modelo_id INTEGER NOT NULL REFERENCES sm_modelo(id),
  largura_max_mm INTEGER NOT NULL,
  quantidade INTEGER NOT NULL,
  UNIQUE(modelo_id, largura_max_mm)
);

/* A reducao de peso que entra sozinha, pela regra de garantia. Ela e COBRADA
   do mesmo jeito (secao 4.8) — e a tela diz "incluida pela regra de
   garantia", porque acessorio cobrado sem explicacao vira ligacao da revenda
   para o vendedor. */
CREATE TABLE sm_reducao_regra (
  modelo_id INTEGER PRIMARY KEY REFERENCES sm_modelo(id),
  m2_acima_mm2 INTEGER, largura_acima_mm INTEGER
);

/* Toda mudanca de preco deixa linha, como o tecido_preco da migracao 15 e o
   movimento_rolo. Preco que muda sem rastro e a metade do registro que nao
   existe quando alguem pergunta "desde quando custa isto?". */
CREATE TABLE sm_preco_historico (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  alvo TEXT NOT NULL,                             -- colecao | componente
  alvo_id INTEGER NOT NULL,
  de INTEGER, para INTEGER,
  usuario_nome TEXT,
  criado_em TEXT DEFAULT (datetime('now','localtime'))
);
CREATE INDEX idx_sm_preco_historico ON sm_preco_historico(alvo, alvo_id);

/* ═══ O CADASTRO INICIAL DO ROLO — os numeros das secoes 4.4 a 4.8 ════════
   ⚠️ AS COLECOES DE VENDA NAO ENTRAM AQUI, e isso nao e esquecimento: elas
   apontam para linhas de abertura que so existem no cadastro real da
   fabrica. Inventa-las criaria colecao duplicada, que e o primeiro ❌ da
   secao 9 da spec. Elas se ligam na tela de Catalogo, uma vez, com o
   catalogo na frente. */
INSERT INTO sm_modelo(nome,m2_min_faturado_mm2,ordem) VALUES('Rolô',1500000,1);

INSERT INTO sm_componente(chave,nome,setor,gera_etiqueta,eh_kit,usa_faixa_suporte,
  codigo_barras,preco_centavos,unidade_cobranca,altura_max_mm,ordem) VALUES
 ('tubo','Tubo','serralheria',1,0,0,NULL,NULL,NULL,NULL,1),
 ('tecido','Tecido','colecao',1,0,0,NULL,NULL,'m2_colecao',NULL,2),
 ('base','Base inferior','serralheria',1,0,0,NULL,NULL,NULL,NULL,3),
 /* O bando cabe ate 3,000 de altura: acima disso o tubo enrolado nao cabe
    dentro dele. O limite e do COMPONENTE, e nao do modelo, porque e uma
    propriedade fisica da peca. */
 ('bando','Bandô','serralheria',1,0,0,NULL,5500,'metro',3000,4),
 ('barra','Barra niveladora','serralheria',1,0,0,NULL,1700,'metro',NULL,5),
 ('reducao','Redução de peso','montagem',0,0,0,NULL,5000,'peca',NULL,6),
 ('montagem','Montagem','montagem',1,0,0,NULL,NULL,NULL,NULL,7),
 ('revisao','Revisão','revisao',1,0,0,NULL,NULL,NULL,NULL,8),
 ('embalagem','Embalagem','embalagem',1,0,0,NULL,NULL,NULL,NULL,9),
 /* CADA KIT TEM CODIGO PROPRIO. Na medida padrao o QR do kit e fixo e prova
    so que ALGUM kit entrou (CLAUDE.md secao 4); aqui prova que entrou o
    CERTO, e e por isso que sao tres codigos e nao um. */
 ('kit_tradicional','Kit tradicional','embalagem',0,1,0,'KIT-TRADICIONAL',NULL,NULL,NULL,10),
 ('kit_bando','Kit bandô','embalagem',0,1,1,'KIT-BANDO',NULL,NULL,NULL,11),
 ('kit_barra','Kit barra','embalagem',0,1,1,'KIT-BARRA',NULL,NULL,NULL,12);

INSERT INTO sm_degrau_tubo(modelo_id,ordem,nome,largura_max_mm,m2_max_mm2,
  desconto_mm,acrescimo_altura_tecido_mm,aceita_bando,aceita_reducao)
SELECT m.id,v.ordem,v.nome,v.lmax,v.amax,v.desc,v.acr,v.bando,v.red
  FROM sm_modelo m, (
    SELECT 1 ordem,'Tubo 32' nome,1700 lmax,3000000 amax,30 desc,200 acr,1 bando,0 red
    UNION ALL SELECT 2,'Tubo 38',2200,3500000,30,200,1,1
    UNION ALL SELECT 3,'Tubo 41',2700,5000000,40,250,0,1
    UNION ALL SELECT 4,'Tubo 56',3000,7000000,45,250,0,1
  ) v
 WHERE m.nome='Rolô';

/* O consumo NASCE IGUAL ao corte (v.rl/v.al aparecem duas vezes), e a coluna
   existe desde o primeiro dia. Quando a fabrica medir a perda de verdade, o
   consumo anda sozinho e o corte fica onde esta. */
INSERT INTO sm_ficha_linha(modelo_id,componente_id,ordem,quando,quantidade,
  ref_largura,ajuste_largura_mm,ref_altura,ajuste_altura_mm,
  consumo_ref_largura,consumo_ajuste_largura_mm,consumo_ref_altura,consumo_ajuste_altura_mm)
SELECT m.id,c.id,v.ordem,v.quando,1,v.rl,v.al,v.ra,v.aa,v.rl,v.al,v.ra,v.aa
  FROM sm_modelo m, sm_componente c, (
    SELECT 'tubo' chave,1 ordem,'sempre' quando,'degrau' rl,0 al,NULL ra,NULL aa
    UNION ALL SELECT 'tecido',2,'sempre','tubo',-5,'degrau',0
    UNION ALL SELECT 'base',3,'sempre','tecido',5,NULL,NULL
    UNION ALL SELECT 'bando',4,'bando','final',-5,NULL,NULL
    UNION ALL SELECT 'barra',5,'barra','final',-9,NULL,NULL
    UNION ALL SELECT 'reducao',6,'reducao',NULL,NULL,NULL,NULL
    UNION ALL SELECT 'montagem',7,'sempre',NULL,NULL,NULL,NULL
    UNION ALL SELECT 'revisao',8,'sempre',NULL,NULL,NULL,NULL
    UNION ALL SELECT 'embalagem',9,'sempre',NULL,NULL,NULL,NULL
    UNION ALL SELECT 'kit_tradicional',10,'sem_adicional',NULL,NULL,NULL,NULL
    UNION ALL SELECT 'kit_bando',11,'bando',NULL,NULL,NULL,NULL
    UNION ALL SELECT 'kit_barra',12,'barra',NULL,NULL,NULL,NULL
  ) v
 WHERE m.nome='Rolô' AND c.chave=v.chave;

INSERT INTO sm_faixa_suporte(modelo_id,largura_max_mm,quantidade)
SELECT m.id,v.l,v.q FROM sm_modelo m, (
  SELECT 1000 l,2 q UNION ALL SELECT 1900,3 UNION ALL SELECT 2600,4 UNION ALL SELECT 3000,5
) v WHERE m.nome='Rolô';

INSERT INTO sm_reducao_regra(modelo_id,m2_acima_mm2,largura_acima_mm)
SELECT id,4500000,2200 FROM sm_modelo WHERE nome='Rolô';
`}
,
{n:17, nome:'a revenda, a carteira do vendedor, as tabelas A/B/C e o calendario de prazo', sql:`
/* ═══ QUEM COMPRA ═════════════════════════════════════════════════════════
   Fase 2 da spec SOBMEDIDA-PEDIDO-REVENDA. A fase 1 respondeu o que a
   persiana E e quanto ela custa NA DECCORAR; aqui entra a revenda, o
   vendedor que cuida dela, a tabela que decide o preco dela e o prazo.

   Nenhum pedido ainda — isso e a fase 3. O que estas tabelas guardam e o
   cadastro que o pedido vai ler e CONGELAR no envio. */

/* ── A TABELA A/B/C ───────────────────────────────────────────────────────
   Um PERCENTUAL de desconto sobre o subtotal Deccorar, e nao um preco por
   colecao em cada tabela — decisao de 22/09/2026, registrada no STATUS da
   fase 1. Uma matriz 3 x N colecoes faria cada colecao nova nascer sem preco
   em duas das tres, em silencio.

   ⚠️ NASCE SEM PERCENTUAL, E NAO COM ZERO. NULL aqui e "ainda nao se sabe";
   zero e "sem desconto", que e uma decisao. Semear as tres com zero faria o
   sistema cobrar o preco cheio de todo mundo com cara de regra aplicada — e
   ninguem descobriria, porque o numero so ficaria maior. Sem percentual, o
   preco da revenda sai como PISO e a tabela e NOMEADA (regra 4 do custo).

   centesimos de por cento: 500 = 5,00%. Inteiro, como toda unidade daqui. */
CREATE TABLE sm_tabela_preco (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  nome TEXT NOT NULL UNIQUE COLLATE NOCASE,
  desconto_centesimos INTEGER,
  ordem INTEGER DEFAULT 0, ativo INTEGER NOT NULL DEFAULT 1
);
INSERT INTO sm_tabela_preco(nome,ordem) VALUES ('A',1),('B',2),('C',3);

/* Como a revenda paga. Lista pequena e cadastravel, como os motivos de
   recusa: escrever as formas no codigo faria a quarta forma virar deploy. */
CREATE TABLE sm_forma_pagamento (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  nome TEXT NOT NULL UNIQUE COLLATE NOCASE,
  ordem INTEGER DEFAULT 0, ativo INTEGER NOT NULL DEFAULT 1
);
INSERT INTO sm_forma_pagamento(nome,ordem) VALUES
  ('Boleto',1),('Cartao',2),('PIX',3),('Dinheiro',4);

/* ── A REVENDA ────────────────────────────────────────────────────────────
   ⚠️ O VENDEDOR E GENTE DO PCP, E NAO UM CADASTRO DAQUI. Guarda-se o id da
   pessoa no PCP e o nome como RETRATO. Um segundo cadastro de gente seriam
   dois lugares para lembrar de desligar alguem — e foi exatamente isso que
   tirou o cadastro de pessoas deste modulo em 02/09/2026 (CLAUDE.md §19).
   O nome fica gravado porque ele e historia: daqui a um ano a carteira tem
   que continuar dizendo quem cuidava da revenda, mesmo que a pessoa saia.

   ⚠️ valor_limite_credito_centavos COMECA COM "valor_" DE PROPOSITO. A poda
   do custo.js corta por PADRAO DE NOME, e um campo de dinheiro fora do
   padrao viaja pelo fio em silencio — foi assim que o resumo.valor_parado do
   painel gerencial chegou a bancada (CLAUDE.md §15). "limite_credito" sozinho
   nao casaria com o padrao.

   ⚠️ E O desconto DA REVENDA NASCE ZERO, ao contrario do da tabela. Aqui
   zero e a realidade comercial de quase todo mundo — nao ter desconto extra
   e o caso normal. NULL faria o preco de toda revenda sair como piso ate
   alguem digitar zero, e piso que aparece no caso normal e aviso que a
   equipe aprende a ignorar (armadilha #6). */
CREATE TABLE sm_revenda (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  razao_social TEXT NOT NULL,
  nome_fantasia TEXT NOT NULL UNIQUE COLLATE NOCASE,
  cnpj TEXT,                                   -- so digitos; vazio e permitido
  fiscal_cep TEXT, fiscal_logradouro TEXT, fiscal_numero TEXT,
  fiscal_complemento TEXT, fiscal_bairro TEXT, fiscal_cidade TEXT, fiscal_uf TEXT,
  vendedor_usuario_id INTEGER,
  vendedor_nome TEXT,
  tabela_id INTEGER REFERENCES sm_tabela_preco(id),
  desconto_centesimos INTEGER NOT NULL DEFAULT 0,
  forma_pagamento_id INTEGER REFERENCES sm_forma_pagamento(id),
  entrega TEXT NOT NULL DEFAULT 'entrega',     -- entrega | retira
  valor_limite_credito_centavos INTEGER,
  limite_revisado_em TEXT,
  observacao TEXT,
  ativo INTEGER NOT NULL DEFAULT 1,
  criado_em TEXT DEFAULT (datetime('now','localtime')), criado_por TEXT
);
CREATE INDEX idx_sm_revenda_vendedor ON sm_revenda(vendedor_usuario_id);

/* VARIOS enderecos de entrega (secao 4.12) — a revenda com duas lojas manda
   para a que estiver com o instalador naquela semana. O padrao e so o que
   vem pre-escolhido no pedido; quem decide e quem lanca. */
CREATE TABLE sm_revenda_endereco (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  revenda_id INTEGER NOT NULL REFERENCES sm_revenda(id),
  apelido TEXT NOT NULL,
  cep TEXT, logradouro TEXT, numero TEXT, complemento TEXT,
  bairro TEXT, cidade TEXT, uf TEXT,
  padrao INTEGER NOT NULL DEFAULT 0,
  ativo INTEGER NOT NULL DEFAULT 1,
  UNIQUE(revenda_id, apelido)
);

CREATE TABLE sm_revenda_contato (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  revenda_id INTEGER NOT NULL REFERENCES sm_revenda(id),
  nome TEXT NOT NULL,
  papel TEXT, telefone TEXT, email TEXT,
  principal INTEGER NOT NULL DEFAULT 0,
  ativo INTEGER NOT NULL DEFAULT 1
);
CREATE INDEX idx_sm_revenda_contato ON sm_revenda_contato(revenda_id);

/* ── O CALENDARIO ─────────────────────────────────────────────────────────
   Feriado e CADASTRO, com data e nome (secao 4.9). A data e a chave: o mesmo
   dia nao e feriado duas vezes, e um cadastro repetido faria a lista de
   "empurrado por" citar o mesmo nome duas vezes na mesma linha. */
CREATE TABLE sm_feriado (
  data TEXT PRIMARY KEY,                       -- 'AAAA-MM-DD'
  nome TEXT NOT NULL,
  criado_em TEXT DEFAULT (datetime('now','localtime')), criado_por TEXT
);

/* Os quatro numeros do prazo, na tabela de parametros que ja existe — nunca
   constantes no codigo. O corte do Mercado Livre ja mudou sem aviso no PCP
   (CLAUDE.md §8); nao ha razao para o corte da revenda ser diferente.
   Dia da semana no padrao do SQLite: 0 = domingo. */
INSERT INTO parametro(chave,valor,tipo,rotulo,ajuda,unidade,ordem) VALUES
 ('prazoCorteDiaSemana','3','numero','Dia do corte do pedido',
  'Dia da semana em que fecha a producao da semana. 0 = domingo, 3 = quarta. Pedido ENVIADO ate este dia, no horario abaixo, fica pronto na entrega da semana seguinte.','0 a 6',10),
 ('prazoCorteHora','18:00','texto','Hora do corte',
  'Hora limite do dia do corte. Um minuto depois, o pedido cai para a semana seguinte. Conta a hora do ENVIO pela revenda, nunca a da aprovacao: aprovar e tarefa da Deccorar, e a demora dela nao passa para a revenda.','hh:mm',11),
 ('prazoEntregaDiaSemana','4','numero','Dia da entrega',
  'Dia da semana em que os pedidos daquele corte ficam prontos. 4 = quinta.','0 a 6',12),
 ('prazoSemanas','1','numero','Semanas ate a entrega',
  'Quantas semanas depois do corte. 1 quer dizer a entrega da semana seguinte ao corte.','semanas',13),
 ('creditoRevisaoMeses','2','numero','Revisao do limite de credito',
  'De quantos em quantos meses o limite de cada revenda tem que ser revisto. A tela lista quem esta vencido — limite que ninguem revisa envelhece calado, e o numero fica parecendo atual.','meses',14);

/* O historico de preco ganha dois alvos novos (tabela e revenda). A coluna
   alvo ja e texto livre e o indice ja existe — nao ha DDL a fazer aqui, e
   esta nota fica porque o comentario da migracao 16 lista os alvos de entao
   e um dia alguem vai compara-los com o codigo. */
`},

{n:18, nome:'o pedido sob medida — orcamento, envio que congela, aprovacao que explode a ficha', sql:`
/* ═══ O PEDIDO ════════════════════════════════════════════════════════════
   Fase 3 da spec SOBMEDIDA-PEDIDO-REVENDA. A fase 1 respondeu o que a
   persiana E, a 2 quem compra; aqui entra o que liga os dois.

   O CICLO CABE NUMA FRASE, e as tres tabelas de registro existem para ele:

     rascunho   se edita a vontade
     enviado    volta a rascunho (e o reenvio recalcula), ou e aprovado
     aprovado   e IMUTAVEL — corrige-se cancelando o item e lancando outro

   ⚠️ APROVADO NAO SE ALTERA, NEM PELO ADMIN — decisao de 22/09/2026. A spec
   propunha "ate a primeira etiqueta impressa", e essa marca so existe na
   fase 4: implementa-la agora criaria uma regra escrita, codificada e que
   nao pega em ninguem, que e a divida 18 do CLAUDE.md (o sob_medida ficou
   tres semanas inerte). Cancelar-e-relancar funciona hoje, nao perde
   historia nenhuma, e e a regra mais facil de afrouxar depois. */

CREATE TABLE sm_pedido (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  /* ⚠️ O NUMERO SO NASCE NO ENVIO, e orcamento nao tem. Numerar o rascunho
     queimaria numero em coisa que nunca virou pedido, e a numeracao desta
     casa nao pode ter buraco: ela e comparada com a do Decorsoft. */
  numero INTEGER UNIQUE,
  revenda_id INTEGER NOT NULL REFERENCES sm_revenda(id),
  tipo TEXT NOT NULL DEFAULT 'orcamento',    -- orcamento | pedido
  marco TEXT NOT NULL DEFAULT 'rascunho',    -- rascunho | enviado | aprovado | cancelado

  /* ── CONGELADOS NO ENVIO ────────────────────────────────────────────────
     A tabela e o desconto ficam gravados AQUI, e nao lidos da revenda na
     hora de mostrar: reajuste de tabela na quinta nao mexe no pedido
     enviado na quarta. E a armadilha #15 (preco que anda para tras) pela
     porta da venda, e a secao 4.8 da spec manda assim. */
  enviado_em TEXT, enviado_por TEXT,
  tabela_id INTEGER REFERENCES sm_tabela_preco(id),
  tabela_nome TEXT,
  tabela_desconto_centesimos INTEGER,
  desconto_centesimos INTEGER,
  valor_total_centavos INTEGER,
  prazo_prometido TEXT,                      -- o que o envio prometeu
  prazo_atual TEXT,                          -- o de hoje, se foi negociado

  aprovado_em TEXT, aprovado_por TEXT,

  endereco_entrega_id INTEGER REFERENCES sm_revenda_endereco(id),
  entrega TEXT,                              -- entrega | retira
  observacao TEXT,
  /* Sinal, nunca trava: pedido de tecido que nao esta na fabrica entra
     normalmente (secao 4.10) e o vendedor negocia prazo maior. */
  sem_tecido INTEGER NOT NULL DEFAULT 0,

  cancelado_em TEXT, cancelado_por TEXT, cancelado_motivo TEXT,
  criado_em TEXT DEFAULT (datetime('now','localtime')), criado_por TEXT
);
CREATE INDEX idx_sm_pedido_revenda ON sm_pedido(revenda_id);
CREATE INDEX idx_sm_pedido_por_marco ON sm_pedido(marco);

/* UMA PERSIANA. Guarda as ESCOLHAS (o que a pessoa pediu) e, depois do
   envio, o que o calculo disse.

   ⚠️ ENQUANTO E ORCAMENTO O PRECO NAO MORA AQUI: ele e calculado ao vivo a
   cada leitura, porque orcamento e "preco de hoje, sem congelar" (secao
   4.10). Gravar um preco no rascunho faria o orcamento envelhecer calado —
   a pessoa abriria amanha e leria o numero de ontem com cara de atual. */
CREATE TABLE sm_pedido_item (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  pedido_id INTEGER NOT NULL REFERENCES sm_pedido(id),
  n INTEGER NOT NULL,                        -- 1, 2, 3... dentro do pedido
  modelo_id INTEGER NOT NULL REFERENCES sm_modelo(id),
  abertura_id INTEGER NOT NULL REFERENCES abertura(id),
  /* ⚠️ A COR DO TECIDO E OBRIGATORIA NO PEDIDO, e opcional no simulador.
     Ali ela so escreve o nome; aqui ela decide QUAL item de tecido sai da
     prateleira — nao se corta sem saber a cor. O tecido_id e resolvido no
     lancamento e gravado: e por ele que a fase 4 manda a peca ao plano. */
  cor_tecido_id INTEGER NOT NULL REFERENCES cor(id),
  tecido_id INTEGER REFERENCES tecido(id),
  cor_acessorio_id INTEGER NOT NULL REFERENCES cor(id),
  largura_mm INTEGER NOT NULL, altura_mm INTEGER NOT NULL,
  comando TEXT NOT NULL, rolamento TEXT NOT NULL,
  adicional TEXT NOT NULL DEFAULT 'nenhum',
  reducao TEXT NOT NULL DEFAULT 'nao',

  -- o que o calculo disse, congelado no envio
  degrau_nome TEXT,
  m2_real_mm2 INTEGER, m2_cobrado_mm2 INTEGER,
  valor_subtotal_centavos INTEGER,           -- o preco DECCORAR
  valor_final_centavos INTEGER,              -- o que a revenda paga
  resumo TEXT,                               -- a frase de conferencia

  sem_tecido INTEGER NOT NULL DEFAULT 0, sem_tecido_motivo TEXT,
  cancelado_em TEXT, cancelado_por TEXT, cancelado_motivo TEXT,
  criado_em TEXT DEFAULT (datetime('now','localtime')),
  UNIQUE(pedido_id, n)
);

/* AS LINHAS DE PRECO, congeladas no envio — tecido, bando, barra, reducao.
   Elas sao o que o PDF mostra e o que o faturamento vai ler; guardar so o
   total faria a conferencia da revenda virar "confie no numero". */
CREATE TABLE sm_pedido_item_preco (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  item_id INTEGER NOT NULL REFERENCES sm_pedido_item(id),
  ordem INTEGER,
  chave TEXT, nome TEXT, unidade TEXT,
  preco_unitario_centavos INTEGER,
  base TEXT,                                 -- '1,500 m² × R$ 110,00/m²'
  valor_centavos INTEGER
);
CREATE INDEX idx_sm_pedido_item_preco ON sm_pedido_item_preco(item_id);

/* ⚠️ A FICHA EXPLODIDA, E ELA SO NASCE NA APROVACAO (secao 4.11). Daqui em
   diante o pedido NAO RELE O CATALOGO: mudar o desconto do tubo 41 amanha
   nao mexe na persiana aprovada hoje, que e o que a etiqueta dela ja diz.
   Ficha relida ao vivo faria a etiqueta impressa e a tela discordarem, e na
   bancada vence a etiqueta.

   O codigo_barras aqui e o do COMPONENTE (o kit), copiado do catalogo. O
   codigo sequencial por setor (SER-000001) e da fase 4 — por isso nao ha
   UNIQUE nesta coluna. */
CREATE TABLE sm_pedido_componente (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  item_id INTEGER NOT NULL REFERENCES sm_pedido_item(id),
  ordem INTEGER,
  chave TEXT NOT NULL, nome TEXT, setor TEXT,
  quantidade INTEGER NOT NULL DEFAULT 1,
  gera_etiqueta INTEGER NOT NULL DEFAULT 1,
  eh_kit INTEGER NOT NULL DEFAULT 0,
  codigo_barras TEXT,
  suportes INTEGER,
  -- ⚠️ CORTE e CONSUMO lado a lado, e nunca somados (armadilha #18)
  largura_corte_mm INTEGER, altura_corte_mm INTEGER,
  consumo_largura_mm INTEGER, consumo_altura_mm INTEGER
);
CREATE INDEX idx_sm_pedido_componente ON sm_pedido_componente(item_id);

/* ── OS TRES REGISTROS ──────────────────────────────────────────────────
   Marco, prazo e alteracao. Sem eles um pedido corrigido fica identico ao
   que nunca teve problema — e a mesma razao do bloqueio_resolvido do PCP
   (secao 5): a trava nao deixa rastro de quantas vezes salvou. */
CREATE TABLE sm_pedido_marco (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  pedido_id INTEGER NOT NULL REFERENCES sm_pedido(id),
  marco TEXT NOT NULL, detalhe TEXT,
  usuario_nome TEXT,
  criado_em TEXT DEFAULT (datetime('now','localtime'))
);
CREATE INDEX idx_sm_pedido_marco_pedido ON sm_pedido_marco(pedido_id);

/* ⚠️ O PRAZO NEGOCIADO NAO APAGA O PROMETIDO (secao 4.9). O gerencial mostra
   os dois separados: somados, o pedido empurrado pareceria entregue em dia. */
CREATE TABLE sm_pedido_prazo (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  pedido_id INTEGER NOT NULL REFERENCES sm_pedido(id),
  de TEXT, para TEXT, motivo TEXT,
  usuario_nome TEXT,
  criado_em TEXT DEFAULT (datetime('now','localtime'))
);
CREATE INDEX idx_sm_pedido_prazo ON sm_pedido_prazo(pedido_id);

CREATE TABLE sm_pedido_alteracao (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  pedido_id INTEGER NOT NULL REFERENCES sm_pedido(id),
  item_id INTEGER REFERENCES sm_pedido_item(id),
  o_que TEXT NOT NULL, antes TEXT, depois TEXT, motivo TEXT,
  usuario_nome TEXT,
  criado_em TEXT DEFAULT (datetime('now','localtime'))
);
CREATE INDEX idx_sm_pedido_alteracao ON sm_pedido_alteracao(pedido_id);

/* ⚠️ O NUMERO INICIAL NASCE EM BRANCO, E O ENVIO RECUSA ATE ALGUEM LANCAR.
   Nao ha default, e isso e a decisao: o plano de corte agrupa o tom unico
   pelo TEXTO do pedido e olha para tras (cortesAnteriores, em plano.js). Um
   pedido novo 4272 colado num 4272 antigo do Decorsoft herdaria o historico
   de tom de outra casa — a persiana sairia de um rolo escolhido para outro
   cliente. Chutar um default aqui faria o numero parecer decidido, que e a
   doenca dos "minimos sao placeholder" do COMPRAS.md.

   Tipo TEXTO de proposito: '' e "ainda nao se sabe", e zero nao serviria —
   zero e um numero valido e mentiroso, como o custo zero da regra 4. */
INSERT INTO parametro(chave,valor,tipo,rotulo,ajuda,unidade,ordem) VALUES
 ('pedidoNumeroInicial','','texto','Ultimo numero de pedido do Decorsoft',
  'O primeiro pedido lancado aqui sai com o numero seguinte a este, e a numeracao nunca reinicia. Enquanto estiver em branco o envio e RECUSADO: numero repetido faz o plano de corte herdar o tom de um pedido de outra casa.','numero',20);
`},

{n:19, nome:'a etiqueta de producao — codigo sequencial por setor, que nasce na aprovacao', sql:`
/* === A ETIQUETA DE PRODUCAO ==============================================
   Fase 4-A da spec SOBMEDIDA-PEDIDO-REVENDA (secao 4.14). Uma etiqueta por
   componente, 100 x 35 mm na ZD220, com codigo SEQUENCIAL POR SETOR.

   ⚠️ O CODIGO NASCE NA APROVACAO, NAO NA IMPRESSAO. Imprimir so marca. E
   REIMPRIMIR SAI COM O MESMO CODIGO: codigo novo para a mesma peca partiria
   a historia dela em duas, e o tempo do setor nunca fecharia. E a armadilha
   #1-B do CLAUDE.md (a reimpressao da etiqueta de venda que nao baixa
   estoque) pela porta da producao. */

/* O SETOR VIRA CADASTRO, e nao um mapa escrito no codigo. Ate aqui ele era
   texto livre na coluna setor do sm_componente (serralheria, colecao, ...),
   e o prefixo da etiqueta — SER, COL, MON, REV, EMB — nao tem como ser
   deduzido do nome: "colecao" nao vira "COL" por regra nenhuma que
   sobreviva ao proximo setor. Deduzir seria a segunda regua da armadilha
   #12, e ela so apareceria no dia em que dois setores colidissem no mesmo
   prefixo. */
CREATE TABLE sm_setor (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  chave TEXT NOT NULL UNIQUE COLLATE NOCASE,
  nome TEXT NOT NULL,
  prefixo TEXT NOT NULL UNIQUE COLLATE NOCASE,
  /* ⚠️ O CONTADOR NUNCA DESCE, e e a mesma regra do numero do pedido
     (secao 4.18): apagar uma peca nao devolve o codigo dela ao bolo. Codigo
     reaproveitado e codigo que um dia sai em duas pecas diferentes, e ai a
     bancada bipa a peca errada com a etiqueta certa. */
  ultimo_numero INTEGER NOT NULL DEFAULT 0,
  ordem INTEGER DEFAULT 0, ativo INTEGER DEFAULT 1
);
INSERT INTO sm_setor(chave,nome,prefixo,ordem) VALUES
 ('serralheria','Serralheria','SER',1),
 ('colecao','Coleção','COL',2),
 ('montagem','Montagem','MON',3),
 ('revisao','Revisão','REV',4),
 ('embalagem','Embalagem','EMB',5);

ALTER TABLE sm_pedido_componente ADD COLUMN codigo_etiqueta TEXT;
ALTER TABLE sm_pedido_componente ADD COLUMN impresso_em TEXT;
ALTER TABLE sm_pedido_componente ADD COLUMN impresso_por TEXT;
ALTER TABLE sm_pedido_componente ADD COLUMN reimpressoes INTEGER NOT NULL DEFAULT 0;

/* ⚠️ O UNIQUE E PARCIAL, e tem que ser. Componente que nao gera etiqueta
   (a reducao de peso, os kits) fica com o codigo NULL — e um UNIQUE comum
   no SQLite aceita varios NULL, mas o indice parcial deixa a intencao
   escrita: o que e unico e o codigo que EXISTE. */
CREATE UNIQUE INDEX idx_sm_pedido_componente_codigo
  ON sm_pedido_componente(codigo_etiqueta) WHERE codigo_etiqueta IS NOT NULL;
CREATE INDEX idx_sm_pedido_componente_setor ON sm_pedido_componente(setor);

/* QUEM IMPRIMIU, QUANDO E O QUE (secao 4.14). Uma linha por lote impresso;
   as etiquetas daquele lote se acham pela hora em impresso_em.

   Reimpressao entra aqui tambem, marcada — e e justamente ela que interessa
   depois: rolo que sai duas vezes e a chance de duas etiquetas iguais em
   duas pecas, e sem registro ninguem sabe que houve a segunda. */
CREATE TABLE sm_etiqueta_impressao (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  setor TEXT NOT NULL,
  quantidade INTEGER NOT NULL,
  pedidos TEXT,
  reimpressao INTEGER NOT NULL DEFAULT 0,
  usuario_nome TEXT,
  criado_em TEXT DEFAULT (datetime('now','localtime'))
);
CREATE INDEX idx_sm_etiqueta_impressao ON sm_etiqueta_impressao(criado_em);
`},

{n:20, nome:'o vinculo com o material de compra do PCP — o tubo e o mesmo dos dois lados', sql:`
/* === O TUBO DO SOB MEDIDA CHEGANDO AO COMPRAS DO PCP =====================
   Fase 4-C da spec SOBMEDIDA-PEDIDO-REVENDA. Decisao do dono, 24/09/2026:
   "e o mesmo tubo, e o compras deveria ser o mesmo" — mesmo com a producao
   sendo duas linhas de trabalho separadas. Separar as compras compraria o
   mesmo tubo duas vezes, perdendo escala.

   A fase 1 ja tinha escrito, no comentario do sm_degrau_tubo, que esta
   coluna entraria por ALTER "quando houver o que ligar". Ha.

   ⚠️ NAO HA "REFERENCES", E ISSO NAO E DESCUIDO: o numero que vai aqui e o
   id de um componente do OUTRO banco (dados.db). O SQLite nao tem como
   conferi-lo, e fingir que tem com um REFERENCES para uma tabela local que
   nao existe quebraria o schema. Quem confere e o cadastro, contra a lista
   que atravessa a porta — e o que ele nao achar vira PENDENCIA na lista de
   compras, nunca um zero (regra 4 do custo).

   ⚠️ O TUBO LIGA NO DEGRAU, E O RESTO NO COMPONENTE. Tubo 32 e Tubo 41 sao
   itens de estoque diferentes, comprados e guardados a parte: o material
   MUDA com o degrau, entao a resposta nao cabe no sm_componente, que tem
   uma linha so chamada "Tubo". Por isso a coluna existe nas duas tabelas, e
   a do componente e recusada justamente para a chave "tubo" — duas
   afirmacoes sobre o mesmo fato divergem no primeiro dia em que alguem
   editar so uma.

   ⚠️ NAO HA COLUNA DE FATOR, e isso mudou no caminho. O plano previa um
   "fator_para_compra" digitado; a unidade do componente do PCP ja responde
   a pergunta (metro le a medida de consumo, unidade conta pecas), e um
   numero digitado ao lado seria a segunda afirmacao sobre a mesma conta —
   com a diferenca de que ela erra em silencio. Unidade que a peca nao sabe
   dizer (kg) e RECUSADA no cadastro, em vez de convertida por chute. */
ALTER TABLE sm_degrau_tubo ADD COLUMN componente_id INTEGER;
ALTER TABLE sm_componente  ADD COLUMN componente_id INTEGER;
`},

{n:21, nome:'a producao bipada — inicio, fim, kit e a pendencia que a chefia fecha', sql:`
/* === A PRODUCAO BIPADA ===================================================
   Fase 5-B1 da spec SOBMEDIDA-PEDIDO-REVENDA (secao 4.15). A 5-A pos os
   cinco setores no controle de acesso; aqui eles passam a ter o que bipar.

     SERRALHERIA: tubo · base ─┐
     COLECAO: tecido ──────────┴─▶ MONTAGEM ─▶ REVISAO ─▶ EMBALAGEM ─▶ PRONTO
     SERRALHERIA: bandô · barra ──────────────────────────────▲

   ⚠️ O ESTADO MORA NO COMPONENTE, e nao numa tabela de sessao. O grao do
   trabalho e a PECA de uma persiana — e o codigo de etiqueta ja e dela
   desde a fase 4-A. Uma tabela de sessao a parte seria a segunda afirmacao
   sobre o mesmo fato: "este tubo esta pronto?" teria duas respostas, e elas
   divergiriam no dia em que uma linha ficasse para tras.

   ⚠️ O KIT TEM COLUNA PROPRIA, e nao e o mesmo "terminado". Na embalagem
   sao TRES bipes (inicio · kit · fim), e sem a coluna o fim nao teria como
   saber se o kit passou — viraria um if do navegador, que e exatamente o
   que a armadilha #26 do PCP corrigiu no \`kit_ok\`. */
ALTER TABLE sm_pedido_componente ADD COLUMN iniciado_em TEXT;
ALTER TABLE sm_pedido_componente ADD COLUMN iniciado_por TEXT;
ALTER TABLE sm_pedido_componente ADD COLUMN terminado_em TEXT;
ALTER TABLE sm_pedido_componente ADD COLUMN terminado_por TEXT;
ALTER TABLE sm_pedido_componente ADD COLUMN kit_conferido_em TEXT;

/* ⚠️ O PRONTO E \`pronto_em\`, E NAO UM VALOR NOVO EM \`marco\`. Tres lugares
   filtram por \`marco='aprovado'\`: a reimpressao da etiqueta
   (dados/etiqueta_producao.js, o VIVOS) e as DUAS contas do comprometido e
   do material de compra (dominio/consumo.js, fases 4-B e 4-C). Trocar o
   marco para 'pronto' faria a etiqueta parar de reimprimir e mudaria EM
   SILENCIO os numeros que o comprador usa — um pedido pronto sumiria da
   conta por uma porta que ninguem abriu de proposito.
   O historico continua registrando o pronto em sm_pedido_marco, entao o
   kanban da fase 6 tem de onde ler sem que nada mude hoje. */
ALTER TABLE sm_pedido ADD COLUMN pronto_em TEXT;

/* A PENDENCIA: a serralheria esqueceu de bipar o fim e foi embora, e a
   montagem fica esperando uma peca que ja esta na bancada. A chefia fecha,
   e o fechamento deixa rastro — sem o porque, fechar e so destravar, e a
   trava deixa de existir na pratica. */
CREATE TABLE sm_pendencia (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  componente_id INTEGER NOT NULL REFERENCES sm_pedido_componente(id),
  codigo_etiqueta TEXT,
  motivo TEXT NOT NULL,
  usuario_nome TEXT,
  criado_em TEXT DEFAULT (datetime('now','localtime'))
);
CREATE INDEX idx_sm_pendencia ON sm_pendencia(componente_id);
`},

{n:22, nome:'a recusa — o motivo aponta a peca que volta, e o que depende dela volta junto', sql:`
/* === A RECUSA ============================================================
   Fase 5-B2 da spec SOBMEDIDA-PEDIDO-REVENDA (secao 4.16). A 5-B1 fez a
   peca andar para a frente; aqui ela sabe voltar.

   Qualquer bancada recusa a peca por defeito do trabalho ANTERIOR, e quem
   recusa escolhe SO O MOTIVO — quem esta de luva nao faz duas escolhas, e a
   segunda errada e trabalho perdido. O motivo ja diz qual peca volta. */

/* ⚠️ E TABELA NOVA, E NAO A \`motivo_recusa\` QUE JA EXISTE. Aquela e o motivo
   de o CORTADOR nao usar a sobra que o plano sugeriu. Juntar as duas
   misturaria "o plano nao conseguiu cortar" com "a montagem achou o tubo
   maior", e os relatorios das duas ficariam errados — esta escrito com todas
   as letras na secao 4.16 da spec.

   ⚠️ O MOTIVO APONTA O COMPONENTE, E NAO O SETOR. A spec escreve
   "Tubo maior -> Serralheria", mas a serralheria faz QUATRO pecas (tubo,
   base, bandô, barra): mandar de volta "para a serralheria" ou e ambiguo, ou
   refaz as quatro — e refazer a base porque o tubo veio errado e trabalho
   jogado fora todo dia, que e a armadilha #6. O setor e CONSEQUENCIA do
   componente, entao nao e um segundo campo: duas afirmacoes sobre o mesmo
   fato divergem no dia em que alguem editar so uma (armadilha #12). */
CREATE TABLE sm_motivo_producao (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  nome TEXT NOT NULL UNIQUE COLLATE NOCASE,
  componente_chave TEXT NOT NULL REFERENCES sm_componente(chave),
  ordem INTEGER DEFAULT 0, ativo INTEGER DEFAULT 1
);

/* ⚠️ O CADASTRO NASCE COM OS EXEMPLOS DA PROPRIA SPEC, e isso e decisao.
   Tabela vazia faria a fase subir com o botao "Recusar" abrindo uma lista
   sem nada — regra escrita, codificada, e que nao pega em ninguem: a divida
   18 do CLAUDE.md (armadilha #30) pela porta do cadastro. A chefia edita,
   acrescenta e desativa; o que ela apagar fica apagado. */
INSERT INTO sm_motivo_producao(nome,componente_chave,ordem) VALUES
 ('Tubo maior ou menor','tubo',1),
 ('Tecido com defeito','tecido',2),
 ('Corte de tecido torto','tecido',3),
 ('Base inferior errada','base',4),
 ('Bandô torto ou amassado','bando',5),
 ('Barra niveladora errada','barra',6),
 ('Montagem torta','montagem',7),
 ('Revisão deixou passar','revisao',8);

/* ⚠️ \`refeitas\` RESPONDE UMA COISA SO: quantas vezes ESTA peca fisica foi
   feita. Ela sobe no CULPADO e em mais ninguem — o que volta atras dele e
   trabalho refeito, nao peca refeita, e contar os dois na mesma coluna e a
   armadilha #12 dentro de um numero. Quem conta recusa por setor, por pessoa
   e por motivo (o indicador da secao 4.17) e a \`sm_recusa\` abaixo. */
ALTER TABLE sm_pedido_componente ADD COLUMN refeitas INTEGER NOT NULL DEFAULT 0;

/* O RASTRO. Ele e o unico lugar onde QUEM FEZ sobrevive: a reabertura apaga
   o bipe do culpado, que e justamente o dado de que o indicador precisa.
   Nome do motivo e nome de quem fez entram como RETRATO — renomear o
   cadastro amanha nao pode reescrever o que aconteceu hoje, que e a mesma
   regra do \`vendedor_nome\` da revenda (fase 2). */
CREATE TABLE sm_recusa (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  item_id INTEGER NOT NULL REFERENCES sm_pedido_item(id),
  componente_id INTEGER NOT NULL REFERENCES sm_pedido_componente(id),
  codigo_etiqueta TEXT,
  motivo_id INTEGER REFERENCES sm_motivo_producao(id),
  motivo_nome TEXT NOT NULL,
  observacao TEXT,
  recusado_de TEXT,                 -- a bancada de quem recusou
  recusado_codigo TEXT,             -- a etiqueta que ela estava com a mao
  recusado_por TEXT,
  feito_por TEXT, feito_em TEXT,    -- retrato de quem tinha feito o culpado
  reabertos INTEGER NOT NULL DEFAULT 0,
  criado_em TEXT DEFAULT (datetime('now','localtime'))
);
CREATE INDEX idx_sm_recusa_item ON sm_recusa(item_id);
CREATE INDEX idx_sm_recusa_componente ON sm_recusa(componente_id);
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

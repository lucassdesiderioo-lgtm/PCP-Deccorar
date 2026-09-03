# Tecido — estoque, sobras e plano de corte

Operação **sob medida** — a fábrica corta tecido contra o pedido do cliente,
enquanto o resto do PCP cuida da operação de **medida padrão**, vendida pelo
Mercado Livre.

Este módulo **não sobe sozinho**. Ele é montado dentro do PCP, em `/sobmedida`,
pelo `server.js` da raiz. Uma porta, um processo, um PIN.

```bash
npm test          # daqui: 87 casos, banco temporário, sem servidor
node server.js    # da RAIZ: sobe o PCP inteiro, com o sob medida junto
```

O que continua separado é o **miolo**: banco próprio (`tecido.db`), domínio
próprio, migrações numeradas, testes próprios. A junção é de porta, não de
dados — misturar os dois esquemas trocaria um problema de acesso por um de
dados, e este é o único schema do projeto que se reconstrói sozinho num banco
novo.

> ⚠️ **Ele já foi um segundo servidor, na porta 3020, com PIN próprio.** Durou
> um dia em produção e custou três defeitos: o botão que não escapava do iframe
> do admin, a porta fechada no firewall e — o pior — um beco sem saída, porque
> liberar alguém exigia uma sessão que só existia depois de liberado. Uma
> tranca sem chave. Se você está pensando em separar de novo, leia a seção
> **Entrada única** antes.

---

## As três perguntas que o módulo responde

| # | Pergunta | Onde | Fase |
|---|---|---|---|
| 1 | Quanto eu tenho do tecido X? | saldo por rolo, com endereço | **pronta** |
| 2 | Que sobras eu tenho do tecido X? | medida, condição, endereço | **pronta** |
| 3 | Estas medidas — **como cortar?** | plano com o encaixe desenhado | **pronta** |

---

## Estado da construção

| Fase | O quê | Estado |
|---|---|---|
| 1 | Esqueleto (núcleo, registro, schema, `base.css`, `ui.js`) + Cadastros + Parâmetros | **pronta** |
| 2 | Cadastro de sobra + mutirão + etiquetas | **pronta** |
| 3 | `encaixe.js` + testes (a tabela do 6.4) | **pronta** |
| 4 | Plano de corte só nas sobras | **pronta** |
| 5 | Rolo: entrada, saldo, acerto no fim | **pronta** |
| 6 | Plano completo: bobinas + recusa + sobra gerada | **pronta** |
| 7 | Painel e relatórios | **pronta** |
| 8 | Upload do arquivo de medidas | **pronta** (leitor genérico — ver abaixo) |

---

## As respostas que viraram regra (seção 11 da especificação)

Estas decisões são do dono da operação. Mudar qualquer uma **muda o cálculo**,
não só a tela.

| # | Pergunta | Resposta | Onde vive |
|---|---|---|---|
| 1 | Margem entre peças? | **Não — as peças encostam.** `margem = 0` | parâmetro cadastrável; muda todo o encaixe |
| 2 | Peça mais larga que a bobina? | **Sempre entregar o plano de menor desperdício.** A peça que fisicamente não cabe volta *marcada com o motivo* e o resto é planejado — o plano nunca deixa de sair | `dominio/plano.js`, fase 4/6 |
| 3 | Quem descarta sobra? | **Só a chefia.** `sobra.descartar` não está no papel `cortador` | `nucleo/permissoes.js` |
| 4 | Sobra com defeito parcial? | **Entra, mas por último** | `condicao_sobra.prioridade` e `.aproveitavel` |
| 5 | Leitor na bancada? | **Sim.** Campo de bipe visível, aceita Enter e Tab, processa por timeout | telas das fases 2 e 4 |
| 6 | Sequência das etiquetas? | **O sistema imprime.** Escolhe-se a quantidade, ele gera a sequência e registra o lote; a sobra nasce quando o operador bipa a etiqueta colada | tabelas `etiqueta` e `etiqueta_lote` |
| 7 | Autenticação? | **Entrada única.** Um PIN, na tela do PCP; depois se escolhe a operação. A liberação é uma área em Admin → Acessos | `nucleo/acesso.js` + `montar.js` |

> **A resposta 7 mudou em 02/09/2026, depois de um dia em produção.** Ela era
> "login único": dois servidores, dois cadastros de pessoas, e uma ponte HTTP
> perguntando ao PCP quem era o dono do cookie. Funcionava — e mesmo assim
> liberar a primeira pessoa era impossível, porque a tela de liberação exigia
> estar liberado. Hoje não há segundo cadastro nem ponte: um processo só.

> **A resposta 6 revoga a R11 da especificação.** Lá a etiqueta era pré-impressa
> e o código, digitado pelo operador; a lista de pendência seria um palpite
> sobre lacunas na sequência. Com a impressão pelo sistema, "etiqueta colada e
> não cadastrada" passa a ser exata: **impressa e ainda não bipada**.

---

## As regras que não se quebram

1. **A regra de negócio mora em `dominio/`.** `if` de negócio dentro de handler
   HTTP está no lugar errado.
2. **`dominio/encaixe.js` é função pura** — números entram, números saem. Sem
   banco, sem HTTP. É o único jeito de testá-lo de verdade.
3. **Uma tabela, um dono.** `rolo.saldo` só muda por `dominio/rolo.js`;
   `sobra.status` só por `dominio/sobra.js`.
4. **Todo movimento deixa registro.** Saldo de rolo nunca muda sem linha em
   `movimento_rolo`.
5. **Rota nasce declarada.** `app.get`/`app.post` direto não existe fora de
   `nucleo/registro.js`. **Rota sem `permissao` é negada** — e há teste disso.
6. **Um envelope só:** `{ok:true, dados}` / `{ok:false, motivo, mensagem}`.
   Nenhum stack trace chega ao operador.
7. **O DDL mora em `nucleo/schema.js`**, numerado, com tabela de migrações.
   Migração aplicada nunca se edita — corrige-se com outra, no fim.
8. **Nenhum hex dentro de uma tela.** Cor só em `base.css`.
9. **Datas pelo SQLite**, centralizadas em `nucleo/dia.js`.
10. **Medidas em metros, `REAL`.** Exibição por `ui.js`; toda comparação com
    tolerância de 1 mm.

> **A ordem no `server.js` da raiz é arquitetura, não estilo.** `auth` antes de
> `express.static`. Invertendo, o Express entrega os `.html` direto do disco e
> qualquer pessoa abre a tela sem PIN. O portão deste módulo repete a mesma
> guarda por dentro: **nenhum `.html` sai do disco por caminho direto** — as
> telas só abrem pelos caminhos declarados em `nucleo/telas.js`, e é lá que a
> permissão é conferida.

### Teste de segurança obrigatório após mexer em `auth.js`, `server.js` ou `montar.js`

```bash
for r in / /admin /operador /setor /sobmedida /sobmedida/corte \
         /sobmedida/cadastros /sobmedida/telas/corte.html \
         /api/skus /sobmedida/api/eu; do
  printf "%-30s " "$r"; curl -s -o /dev/null -w "%{http_code}\n" http://localhost:3010$r
done
curl -s -o /dev/null -w "/login  %{http_code}\n" http://localhost:3010/login
```

Esperado: telas `302`, API `401`, `/login` `200`. **Qualquer `200` numa tela é
furo de segurança.** E `/sobmedida/telas/corte.html` tem que dar `403` mesmo
para o diretor logado — se der `200`, o static furou o portão.

---

## Estrutura

```
montar.js              o PORTAO: monta tudo no app do PCP, sob /sobmedida
nucleo/                infraestrutura — nao sabe nada de tecido
  db · schema · erros · dia · registro · config · permissoes
  acesso    traduz AREA do PCP em PAPEL daqui
  telas     que telas existem, que permissao pedem, e o TEMA de cada uma
dominio/               a regra — nao conhece Express, req nem res
  tecido · endereco · motivo · sobra · etiqueta
  rolo · encaixe (funcao pura) · plano · painel
dados/                 o SQL. Uma tabela, um arquivo. Nao decide nada
rotas/                 declaracoes. Sem SQL, sem `if` de negocio
public/                base.css (tokens) · ui.js · nav.js · barras.js · telas/
teste/                 rodar.js + *.test.js — banco temporario, do zero
```

---

## Os parâmetros do corte (Cadastros → Parâmetros)

| Chave | Padrão | O que faz |
|---|---|---|
| `larguraMinimaSobra` | 0,80 m | Resto com largura abaixo disso é refugo em vez de sobra. Vale **só para a largura** |
| `pesoSobra` | 0,50 | Quanto da sobra gerada conta como material recuperado. **A única variável de julgamento do módulo** |
| `margem` | 0,00 m | Folga entre peças (aplica entre peças, não nas bordas) — **conferido na bancada**, ver abaixo |
| `alturaMinimaSobra` | **1,00 m** | Resto com altura abaixo disso é refugo mesmo com largura boa — persiana mais baixa que isso praticamente não sai da fábrica |

`pesoSobra` responde a uma pergunta de fábrica: *o retalho que vai pra
prateleira volta a ser usado, ou encalha?* Metade é o palpite honesto de quem
ainda não tem histórico. Depois de alguns meses o relatório de encalhe responde
melhor que qualquer chute — e mudar é um campo, não uma linha de código.

---

## A etiqueta da sobra sai em PDF, 100 x 35 mm

A folha que vai para a Zebra e gerada **no servidor**, uma etiqueta por pagina,
no tamanho exato da bobina (`GET /api/etiquetas/lotes/:id/pdf`).

> ⚠️ **Nao volte a imprimir pelo `window.print()`.** A folha do navegador so
> saia certa quando quem imprime escolhia "margens: Nenhuma" e escala 100% —
> **toda vez**. Errou uma, o Chrome ajusta a pagina, as barras esticam e o
> leitor recusa. E ainda carimbava a URL e o "8/32" que, numa etiqueta de
> 35 mm, caem em cima do codigo.
>
> E a mesma licao da armadilha #6 do CLAUDE.md: o que so funciona quando o
> operador acerta a configuracao e o que vai falhar. A pagina agora ja nasce
> 100 x 35 e nao ha o que ajustar.

A grade que aparece na tela e **conferencia**, nao folha de impressao — e se
alguem der Ctrl+P nela por engano, sai escrito isso na folha.

`public/barras.js` serve as duas pontas: a tela desenha SVG, o servidor desenha
as mesmas barras dentro do PDF. Duas tabelas CODE128 seriam duas etiquetas
diferentes para o mesmo codigo, e a divergencia so apareceria na bancada.

### As medidas sao CADASTRAVEIS (Cadastros -> Parametros)

Nenhuma medida mora no codigo. A etiqueta e um objeto fisico que a equipe
ajusta olhando o resultado na bancada — *"a letra ta pequena"*, *"a barra some
quando a etiqueta amassa"* — e cada um desses ajustes era um deploy.

| Parametro | Padrao | O que e |
|---|---|---|
| `etqFonteCodigo` | **22 pt** | o codigo escrito embaixo das barras |
| `etqBarraAltura` | 14 mm | altura das barras |
| `etqLargura` | 100 mm | largura da bobina |
| `etqAltura` | 35 mm | altura da bobina |
| `etqMargem` | 4 mm | folga em volta |

> ⚠️ **O TEXTO EMBAIXO DA BARRA NAO E LEGENDA.** E onde o operador PROCURA a
> sobra: ele passa o olho na estante lendo numero, e usa o leitor so para
> confirmar. Por isso a fonte nasce em 22 pt — o dobro da primeira versao — e
> por isso ela e o primeiro parametro da lista.

**Altura e largura falham de jeitos diferentes, e nao e inconsistencia:**

| Nao cabe na | O que acontece | Por que |
|---|---|---|
| **altura** | **recusa** gerar o PDF, com a frase dizendo o que reduzir | passar da altura corta o desenho: parte do codigo nao existe no papel |
| **largura** | **encolhe** a letra o suficiente e imprime | e so tamanho de letra, e letra menor o operador ainda le. Recusar pararia a bancada por estetica |

A tela mostra as medidas ao lado do botao e **desabilita** o botao quando os
numeros nao fecham — senao o operador clicaria em imprimir e abriria uma aba
com o JSON do erro na cara.

> ⚠️ **O MODULO DA BARRA NAO E CADASTRAVEL, e isso e decisao.** Ele e
> calculado para o codigo caber na largura, com piso de 0,25 mm: a 203 dpi
> isso e 2 pontos de impressao, e abaixo disso a leitura falha em etiqueta
> amassada — que e o estado normal de uma etiqueta que passou um mes na
> prateleira. Um campo ali deixaria alguem gerar 300 etiquetas tecnicamente
> ilegiveis sem nenhum aviso, e o erro so apareceria no bipe.
>
> A diferenca de tratamento e a regra: **texto pequeno o operador ainda le;
> barra fina demais o leitor recusa, e ninguem descobre por que.**

Codigo comprido demais para caber sai **marcado** na propria etiqueta
(`SOBRA · CONFERIR LEITURA`), nunca impresso pequeno em silencio: o desfecho
ruim nao e o erro, e a etiqueta sair bonita, colada na peca, e nao bipar.

---

## A etiqueta da sobra

O sistema **imprime** o lote (Etiquetas → quantidade → folha em A4 para
recortar), guarda a sequência, e a sobra nasce quando o cortador **bipa** a
etiqueta colada. Três consequências:

- **"Colada e não cadastrada" é exata.** É o que foi impresso menos o que
  voltou da bancada — não um palpite sobre lacunas na numeração.
- **Etiqueta que o sistema não imprimiu é recusada**, com a frase que ensina o
  caminho. Aceitar código desconhecido encheria o acervo de retalho que não
  existe na prateleira.
- **A mesma etiqueta não cola em duas sobras.** A conferência acontece *antes*
  de qualquer gravação: se fosse depois, quem recusaria seria o `UNIQUE` do
  SQLite, e a bancada leria "deu erro aqui dentro" em vez de "cole outra".

O código de barras é **CODE128-B gerado aqui** (`public/barras.js`), sem
biblioteca. A tabela de padrões foi conferida contra uma implementação de
referência e o teste repete a conferência estrutural a cada rodada — 106
padrões de 11 módulos, barras somando par, nenhum repetido. **Uma etiqueta que
não bipa é uma etiqueta que não existe**, e o erro só apareceria na bancada,
com a folha já impressa e colada.

> Ao imprimir: margens **"Nenhuma"** e escala **100%**. "Ajustar à página"
> deforma as barras e o leitor recusa — a mesma regra da etiqueta de SKU no PCP.

## O mutirão

A tela lembra **tecido, condição e endereço** entre um retalho e o seguinte
(`localStorage`, por aparelho). Catalogando uma prateleira por vez, só mudam o
código bipado e as duas medidas — é isso que faz o mutirão render. O bipe pula
para a largura, `Enter` na altura salva, e o foco volta sozinho para o código.

**Medido:** 30 sobras seguidas, 0 erros, ~33 ms por lançamento.

Uma trava que parece exagero e não é: **largura de 190 é recusada**. O campo
fala metros, e 190 no lugar de 1,90 entraria calado e viraria um retalho de
190 metros na prateleira.

---

## O plano de corte

```
ENTRADA: tecido (3 toques) + medidas (grade ou arquivo)
   ↓
1. SOBRA PRIMEIRO, sempre — a política da casa
2. o que sobrou vai para o rolo, simulando TODAS as larguras
3. peça que não cabe volta MARCADA, com o motivo
   ↓
proposta desenhada  →  [não usar] recalcula  →  [Confirmar] baixa tudo
```

**Nada baixa antes do Confirmar**, e o Confirmar é uma transação só: sobra
usada, rolo consumido, sobras novas cadastradas e refugo medido — ou nada.

**A proposta é assinada.** Entre calcular e confirmar, outra pessoa pode ter
usado a mesma sobra; o Confirmar recalcula, compara a assinatura, e recusa se
o estoque mudou. O cliente manda o *pedido*, nunca o plano — ninguém confirma
um plano fabricado.

**A sobra que vai nascer é cadastrada dentro do Confirmar**, com a medida já
calculada e a etiqueta que o operador colou. É isso que fecha o ciclo sem
depender de disciplina: não existe tela separada para alguém esquecer.

**A recusa é gravada na hora**, mesmo que o corte não aconteça — ela é
diagnóstico, não papelada do plano.

### NÃO HÁ EMENDA — e por isso a recusa vira pedido de compra

Decisão do dono, 03/09/2026: **peça mais larga que toda bobina do estoque
simplesmente não sai.** Não há emenda, não há meia solução.

Isso muda o que a recusa significa. Ela deixa de ser um contratempo do encaixe
e passa a ser uma **venda parada esperando material** — e se morre numa linha
de texto no meio da tela do corte, quem compra tecido nunca fica sabendo que se
perdeu a peça por 10 cm de bobina.

Por isso o plano devolve `falta_bobina` separado das outras recusas:

```
NAO TEM BOBINA PARA ESTE CORTE
2 peças precisam de bobina de 2,40 m — a maior em estoque tem 2,00 (faltam 0,40).

  Largura de bobina   Peças   m²
  2,40                    1   3,60
  2,10                    2   6,30
```

Agrupado **por largura**, porque é assim que se compra: não interessa que sejam
quatro peças diferentes, interessa que quatro precisam de bobina de 2,10 m. A
maior primeiro — a bobina que resolve a maior resolve todas as de baixo.

> ⚠️ **O motivo da recusa tem CÓDIGO, não só frase.** A frase é para o operador
> ler; o código é o que a compra soma. Contar frase de texto funciona até o dia
> em que alguém corrige uma vírgula.
>
> | Código | O que é | Vira compra? |
> |---|---|---|
> | `sem_largura` | nenhuma bobina do estoque comporta a peça | **sim** — bobina mais larga |
> | `sem_estoque` | não há bobina nem sobra deste tecido | **sim** — o tecido |
> | `sem_material` | a bobina serve, o metro acabou | não — é reposição |
> | `tom_unico` | o pedido inteiro não coube numa fonte só | não — ver §tom único |

**Faltar altura não é faltar bobina.** A bobina está certa; o que acabou foi o
metro. Somar isso na conta de largura mandaria comprar a bobina errada.

**Sem falta, `falta_bobina` é `null`** — nunca um objeto vazio. Tarja de alarme
que aparece sem alarme é tarja que a equipe aprende a ignorar, e aí a de
verdade passa batida.

**Ourela:** não existe nesta operação (confirmado pelo dono, 03/09/2026). Se um
dia existir, o caminho é cadastrar a largura **útil** do rolo — não há desconto
automático a fazer.

---

### TOM ÚNICO POR PEDIDO — a regra que mais pesa no plano

**Peças com o mesmo número de pedido saem sempre da MESMA fonte.** Três peças
juntas numa sobra: ótimo. Uma na sobra e duas na bobina: **nunca**.

Não é otimização, é defeito de produto — o tom pode não bater entre uma fonte
e outra, e o cliente vê as duas persianas lado a lado na mesma parede. A regra
vale também entre **dois rolos**: rolos diferentes são lotes diferentes.

Na prática, um grupo que entraria pela metade numa fonte é desfeito e tentado
na fonte seguinte. Se o pedido inteiro não couber em lugar nenhum, ele volta
marcado com esse motivo — nunca dividido.

**O que agrupa é o PEDIDO, não o item.** O pedido `4272` do arquivo real tem
onze persianas em quatro itens — e são todas da mesma casa. O item `4272-14`
sozinho tem três peças iguais, cada uma com a sua etiqueta.

**Peça sem pedido informado é livre**, porque não há com quem ela precise
combinar. O campo Pedido fica na grade, e o upload da etiqueta já o preenche.

### E o pedido cortado em dias diferentes

O tom único dentro de um plano não bastava. O pedido `4272` tem **onze**
persianas e o arquivo do dia trouxe **nove** — nada obriga a fábrica a cortar
tudo de uma vez. Duas peças na terça, nove na quinta: cada plano, sozinho,
estava certo, e mesmo assim a casa receberia dois tons.

Então o plano **olha para trás**. Antes de escolher a bobina, pergunta em que
fonte esse pedido já foi cortado:

- **O rolo ainda tem saldo** → continua nele, mesmo que outra bobina rendesse
  mais. Deixou de ser escolha de aproveitamento e virou escolha de tom.
- **A fonte não existe mais** (sobra consumida, rolo encerrado) → o plano sai
  normalmente, com aviso em âmbar: *o tom destas peças pode não bater com o que
  já foi cortado*.

Em qualquer caso a tela mostra, antes do desenho, quantas peças daquele pedido
já saíram, quando, e de onde.

## O upload (fase 8)

**O PDF de etiquetas de produção** (Decorsoft) é lido direto: o sistema pega a
via **COLEÇÃO** de cada item e dela tira **a medida do corte do tecido** —
a que aparece entre parênteses:

```
4292-1  ·  SAULO PAULO DA  ·  COLEÇÃO
1.500 X 1.400              ← a persiana ACABADA (não serve para cortar)
2.417 M2 - (1.465x1.650)   ← O CORTE. É esta que o plano usa.
```

A largura do tecido é **menor** que a da persiana montada (ponteiras e tubo
entram na conta) e a altura é **maior** (sobra para enrolar no tubo e para a
barra). Cortar pela medida acabada erraria as duas dimensões, e para lados
diferentes.

**Uma peça por via COLEÇÃO, nunca uma por item.** Um item pode ter várias
persianas iguais: cada uma imprime o seu jogo de vias, com código próprio no
rodapé (`4547`, `4548`, `4549`). Contar por item cortaria uma só e faltariam
duas na obra.

Vêm juntos o **pedido**, o **item**, a **posição** (`09/11`), o **código da
etiqueta**, o **cliente** e o **tecido** — este último casado com
o cadastro quando dá (`SCREEN 1% BRANCO 3.00M` → `Rolô · Screen 1% · Branco`),
como sugestão: quem confirma continua sendo o botão que o operador aperta.

Também lê CSV/texto com dois números por linha. Em qualquer caso as medidas
caem na **mesma grade**, editáveis antes de calcular — **digitar continua
sempre disponível**, que é o caminho principal, não o de exceção.

> Sem biblioteca de PDF: os fluxos são Flate (zlib, que vem no Node) e o texto
> é UTF-16BE. O teste monta um PDF no formato real, então nenhuma etiqueta com
> nome de cliente precisa ficar versionada no repositório.

---

## A margem zero foi conferida na bancada

Não é palpite nem valor provisório. No pedido 4272 duas peças de `1,495`
saem lado a lado de uma bobina de 3,00 e **sobram 5 mm certinhos** — medido
na bancada, com o tecido na mão.

```
1,495 + 1,495 = 2,990        bobina 3,000        sobra 0,010 (5 mm de cada lado)
```

Isso quer dizer que **as peças encostam mesmo** e que a borda da bobina é
aproveitável até o fim. Enquanto for assim, `margem = 0` está correto e o
plano promete o que o corte entrega.

> ⚠️ **Se um dia parecer que "falta folga", não mexa no `encaixe.js`.** O
> encaixe está certo; o que muda é o dado. Na ordem em que se deve procurar:
>
> | O que aconteceu | Onde se resolve |
> |---|---|
> | A bobina não tem 3,00 de verdade (vem 2,98) | **Largura do rolo**, na entrada. Cada rolo tem a sua |
> | Precisa de folga entre uma peça e a outra | **Parâmetro `margem`** |
> | A borda do tecido é imprestável (ourela) | Cadastrar o rolo pela **largura útil** — o parâmetro de margem desconta entre peças, não nas bordas |
>
> Só o terceiro caso pediria código, e mesmo ele tem saída pelo cadastro.

Um número para dar a dimensão do que está em jogo: com 2 cm de folga, essas
duas peças **deixam de caber** e a faixa passa de 2,73 m para 5,46 m de rolo.
A margem não é um detalhe de acabamento — ela dobra o consumo.

---

## Entrada única

A fábrica tem **duas operações**, e agora um único jeito de entrar nas duas.

```
      tela de PIN do PCP  (uma só, a que a equipe já conhece)
                    │
                    ▼
            /setor  ── aparece SÓ para quem alcança as duas
             │                    │
   MEDIDA PADRÃO            SOB MEDIDA
   (Mercado Livre)          /sobmedida
```

Quem alcança uma operação só **vai direto** para ela: escolha de uma opção só
não é escolha, e cobrar um toque por dia de quem não tem alternativa é o tipo
de atrito que faz a equipe reclamar do sistema inteiro.

### A liberação mora num lugar só: Admin → Acessos

Não há cadastro de pessoas aqui dentro. Quem entra é decidido por **área do
PCP**, na mesma tela em que se libera Revisão ou Carregamento:

| Setor no PCP | Permissão | Vira, aqui | Alcança |
|---|---|---|---|
| **Sob medida / Bancada** | `sobmedida.cortar` | `cortador` | corte, rolos, sobras, etiquetas, painel |
| **Sob medida / Cadastros** | `sobmedida.cadastrar` | `diretor` | tudo, mais cadastros e parâmetros |
| Admin Geral | (todas) | `diretor` | tudo |

Quem traduz é `nucleo/acesso.js`, e é o **único** lugar que sabe dessa
correspondência. Trocar o modelo de acesso do PCP amanhã mexe nesse arquivo, e
em nenhum outro.

> ⚠️ **O CONTRATO COM O PCP É A COLUNA `usuarios.areas`, E ELA É SOMBRA.**
> No modelo novo de acesso do PCP, `areas` não é mais editada à mão: ela é
> **recalculada** a partir das permissões efetivas, pelo mapa `PERM_AREA` em
> `acesso.js`. As duas linhas de sob medida **precisam** estar nesse mapa.
>
> Faltando, o modo de falhar é o pior possível: o admin marca o acesso, a tela
> confirma, e a área é apagada no salvamento seguinte. O acesso sumiria
> sozinho, sem erro, sem log. Foi o que quase aconteceu — hoje há teste
> travando as duas pontas (`teste/acesso.test.js`, caso do contrato).

### Bloquear é uma coisa só

Desligar a pessoa no PCP fecha as duas operações no mesmo gesto — era
exatamente isso que os dois cadastros separados não davam. Tirar só o setor de
sob medida fecha o corte e mantém o resto.

### O que este módulo NÃO faz

Não lê o banco do PCP, não conhece o segredo do cookie dele, não guarda PIN.
Ele recebe `req.usuario` já resolvido e traduz. A autenticação continua tendo
um dono só.

---

## O design: dois contextos, dois temas

Segue o `docs/DESIGN.md` do PCP, e os hex são **copiados das telas que já
rodam** — o claro de `public/operador.html`, o escuro de `public/index.html`.

| Tela | Contexto | Fundo | Por quê |
|---|---|---|---|
| Início, Corte, Rolos, Sobras, Etiquetas | operação | **claro** | iPad no suporte, luz natural forte e lâmpada de inspeção ao lado — tela escura ali vira espelho |
| Cadastros, Painel | admin | **escuro** | escritório, luz controlada, tela de números |

Quem carimba o tema é o **servidor**, a partir de `nucleo/telas.js`, num
atributo `data-contexto` no `<html>`. Deixar cada arquivo declarar o próprio
tema garantiria que, mais cedo ou mais tarde, uma tela nova nascesse errada.

> ⚠️ **A primeira versão usou uma paleta *quase* igual à do PCP** — `#12161c`
> no lugar de `#1a1d23`, `#1f6feb` no lugar de `#1565c0`, e assim nas sete
> cores. Nenhuma batia. Diferente o bastante para o olho perceber, perto o
> bastante para não parecer proposital: o efeito é a equipe sentir que entrou
> em outro sistema. **Cor nova aqui só entra se entrar também lá.**

A moldura (`public/nav.js`) repete o gesto do `nav.js` do PCP de propósito:
barra de sessão em cima, barra de atalhos embaixo, ajuste A+/A− na operação.
O menu se monta com o que a pessoa alcança — botão que leva a porta fechada
ensina o operador a não tentar, e quem bate em "sem permissão" três vezes para
de clicar na quarta, mesmo quando já podia.

---


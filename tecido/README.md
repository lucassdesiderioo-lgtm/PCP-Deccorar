# Tecido — estoque, sobras e plano de corte

Operação **sob medida**. Aplicação **separada** do PCP do Mercado Livre: banco
próprio (`tecido.db`), porta própria (3020), **nenhuma integração**. O que se
mantém compatível é a *linguagem* — unidade, etiqueta, endereço, movimento —
para uma junção futura.

```bash
cd tecido
npm install
npm start        # http://localhost:3020   (usuário inicial: Diretor / PIN 1234)
npm test         # testes de domínio, sem servidor
```

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
| 7 | Autenticação? | **PIN de 4 dígitos**, mesmo desenho do PCP | `nucleo/auth.js` |

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

> **A ordem no `server.js` é arquitetura, não estilo.** `auth` antes de
> `express.static`. Invertendo, o Express entrega os `.html` direto do disco e
> qualquer pessoa abre a tela sem PIN.

### Teste de segurança obrigatório após mexer em `auth.js` ou `server.js`

```bash
for r in / /inicio /cadastros /telas/cadastros.html /api/tecidos /api/parametros; do
  printf "%-26s " "$r"; curl -s -o /dev/null -w "%{http_code}\n" http://localhost:3020$r
done
curl -s -o /dev/null -w "/login  %{http_code}\n" http://localhost:3020/login
```

Esperado: telas `302`, API `401`, `/login` `200`. **Qualquer `200` numa tela é
furo de segurança.**

---

## Estrutura

```
server.js              sobe o banco, monta o registro, escuta
nucleo/                infraestrutura — nao sabe nada de tecido
  db · schema · erros · dia · registro · config · auth · permissoes
dominio/               a regra — nao conhece Express, req nem res
  tecido · endereco · motivo · usuario · sobra · etiqueta
  rolo · encaixe (funcao pura) · plano · painel
dados/                 o SQL. Uma tabela, um arquivo. Nao decide nada
rotas/                 declaracoes. Sem SQL, sem `if` de negocio
public/                base.css (tokens) · ui.js · barras.js · login · telas/
teste/                 rodar.js + *.test.js — banco temporario, do zero
```

---

## Os parâmetros do corte (Cadastros → Parâmetros)

| Chave | Padrão | O que faz |
|---|---|---|
| `larguraMinimaSobra` | 0,80 m | Resto com largura abaixo disso é refugo em vez de sobra. Vale **só para a largura** |
| `pesoSobra` | 0,50 | Quanto da sobra gerada conta como material recuperado. **A única variável de julgamento do módulo** |
| `margem` | 0,00 m | Folga entre peças (a fórmula do 6.2 aplica entre peças, não nas bordas) |
| `alturaMinimaSobra` | **1,00 m** | Resto com altura abaixo disso é refugo mesmo com largura boa — persiana mais baixa que isso praticamente não sai da fábrica |

`pesoSobra` responde a uma pergunta de fábrica: *o retalho que vai pra
prateleira volta a ser usado, ou encalha?* Metade é o palpite honesto de quem
ainda não tem histórico. Depois de alguns meses o relatório de encalhe responde
melhor que qualquer chute — e mudar é um campo, não uma linha de código.

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

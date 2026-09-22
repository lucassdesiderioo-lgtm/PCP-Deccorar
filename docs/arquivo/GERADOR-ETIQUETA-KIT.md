# Gerador da etiqueta do kit

```
STATUS
Situação: ARQUIVADA — implementada por inteiro em 17/09/2026
Criada em: 17/09/2026
Última atualização: 22/09/2026
Fase atual: as quatro fases entregues e conferidas em produção
Fases: 1 ☑  2 ☑  3 ☑  4 ☑
Risco: 🔴 (etiqueta)

⚠️ ESTE DOCUMENTO É HISTÓRICO. As regras que valem estão no CLAUDE.md §4 —
   não use daqui como fonte de regra (CLAUDE.md §13, regra 4).

Divergência depois do arquivamento (vale o CLAUDE.md, §13 regra 3):
- 18/09/2026 — **o QR não tem mais 20 mm: a caixa é 26 mm e o impresso sai com
  25,6 mm.** Onde este documento fala de "QR de 20 mm", leia 26. O motivo está
  no CLAUDE.md §4, armadilha #31: os 20 mm eram a caixa, e a ZD220 imprimia
  15,4 — o módulo arredonda para ponto cheio e o resto era jogado fora, com o
  módulo em 0,375 mm, no limite do que a impressora resolve. O espaço saiu do
  bloco de texto (58 → 53 mm, e o limite das linhas de 16 → 15 caracteres) e de
  5,5 mm de deslocamento da seta. As barras não mudaram.
  **CONFERIDA NO PAPEL em 22/09/2026, com as DUAS provas** que a fase 3 exigiu:
  o dono imprimiu 1 de teste e, na etiqueta colada no kit, o celular leu o QR
  **e** o leitor bipou o código de barras.
- 18/09/2026 — a nota do card sobre o `?usp=drive_link` **não manda mais
  encurtar o link**: com a caixa de 26 mm o módulo é o mesmo e tirar o sufixo
  só deixa o QR 2,5 mm menor. A tela mede em vez de supor pela versão.
  Ver CLAUDE.md §4.

Mudanças no caminho:
- 17/09/2026 (fase 3, CONFERIDA EM PRODUÇÃO) — o dono imprimiu pela primeira
  vez e fez as duas provas que só o papel dá: **o QR abriu e o leitor bipou**.
- 17/09/2026 (fase 4) — o upload de arquivo pronto (`/api/kit/label`, quatro
  rotas) foi removido, com o card da tela e o `.gitignore`. É a R11 cumprida.
  O que fecha a spec não é o gerador existir: é o **segundo caminho deixar de
  existir**. Enquanto os dois conviviam, o arquivo enviado seguia sendo imagem
  morta que não acompanha o `kit_codigo`.
  **Nada foi apagado no deploy** — o último arquivo enviado continua em
  `kit/label.<ext>` e a linha `config.kit_label` continua no banco; o código
  só parou de lê-los. Apagar no mesmo minuto em que o caminho novo vira o
  único seria decisão irreversível cedo demais.
  A seção 12 do `teste_kit.js` trava que as quatro rotas não voltam.
- 17/09/2026 (fase 2, CONFERIDA EM PRODUÇÃO) — o dono subiu, apontou o celular
  e **o QR abriu a pasta do manual**. A régua final de QR é câmera de verdade
  lendo; o resto era indício.
- 17/09/2026 (fase 3) — **DIVERGÊNCIA DA §6: não há envio de ZPL.** A Zebra
  ZD220 está ligada por **USB no computador**, não na rede: o servidor não tem
  como falar com ela, e a §6 supunha um caminho de impressão que não existe
  (ver o "A REVER" abaixo, escrito na fase 1). O caminho é o do sob medida
  (`tecido/dominio/etiqueta_pdf.js`): o servidor devolve um **PDF com a página
  já no tamanho da etiqueta**, e quem imprime não tem o que configurar — que é
  a mesma lição da armadilha #6 (o que só funciona quando o operador acerta a
  configuração é o que vai falhar).
- 17/09/2026 (fase 3) — `public/kit_etiqueta.js` ganhou **`elementos()`**: a
  etiqueta como lista de retângulos e textos em milímetros. O `svg()` da prévia
  e o `kit_pdf.js` **consomem a mesma lista** — um desenho, dois desenhistas.
  Sem isso o PDF repetiria as posições, e a divergência entre tela e papel só
  apareceria com o rolo impresso: exatamente o que esta spec veio consertar.
- 17/09/2026 (fase 3) — **o QR do papel passou a ser desenhado por nós**, e não
  mais pela impressora (`^BQ`). Então o defeito da grade que quebrou a fase 2
  passou a ser possível no papel também: a `escala` do PDF é **8**, que são os
  pontos por milímetro da ZD220 a 203 dpi, e o módulo fecha em ponto inteiro.
  O `teste_kit.js` **abre o PDF gerado e remonta o QR módulo a módulo** — é o
  que pega um QR espelhado, que continua com cara de QR e não lê em celular
  nenhum.
- 17/09/2026 (fase 3) — a permissão de imprimir é `kit.imprimir` (Configuração,
  nível supervisor), separada de `kit.editar`: editar decide o que a Embalagem
  passa a bipar, imprimir só tira cópia do que já foi decidido.
  **Decisão do dono: não há backfill** — *"quando assinalar o nome da pessoa
  ela passa a poder imprimir"*. É o contrário do caso `pacote.assinar`, onde a
  chave nova tinha que alcançar sozinha quem já fazia aquilo; aqui ninguém
  fazia, porque a impressão não existia. O Admin Geral imprime desde o primeiro
  boot (passa em tudo por nível), então a terceira ponta do §19 não fica vazia.
- 17/09/2026 (fase 3) — o rolo sai com o que está **salvo**, não com o que está
  na tela: o servidor lê o conteúdo do banco. A tela compara e recusa imprimir
  com texto não salvo — 200 etiquetas com o texto velho é erro que só aparece
  no papel.
- 17/09/2026 (fase 2) — o CODE128 **já existia no projeto**
  (`tecido/public/barras.js`, escrito à mão com teste próprio). Ele foi movido
  para `public/barras.js`, na raiz, e agora serve as duas operações. Copiar a
  tabela seria duas etiquetas diferentes para o mesmo código.
- 17/09/2026 (fase 2) — não havia gerador de QR e não há CDN: `public/qr.js`
  foi escrito no projeto (modo byte, correção M, versões 1–10), no mesmo molde
  do `barras.js`. O `teste_qr.js` não olha o desenho: ele **decodifica de
  volta** e confere a paridade Reed-Solomon pela propriedade matemática dela.
- 17/09/2026 (fase 2) — `public/kit_etiqueta.js` é o **dono único do desenho**,
  em milímetros. A prévia lê dele e o ZPL da fase 3 sai dele. O que NÃO é
  compartilhado: quem desenha o QR e as barras (navegador na prévia,
  impressora no papel) — a prévia prova o conteúdo e o lugar, não o traço.
- 17/09/2026 (CONSERTO 2 da fase 2) — **a causa real de o celular não ler: os
  15 bits da área de formato do QR estavam na ordem INVERTIDA.** O leitor acha
  o código, vai ler qual máscara foi usada, o BCH não fecha e ele desiste em
  silêncio. Passou por três rodadas de teste verde porque o teste relia o
  formato com a mesma convenção torta do gerador — inclusive o decodificador
  escrito para ser "independente". Hoje o teste lê pela regra do padrão e
  compara com os oito valores publicados do nível M; reintroduzir o defeito
  reprova 17 casos. Quem descobriu foi o dono, com o celular.
- 17/09/2026 (CONSERTO 1 da fase 2) — o QR também estava pequeno demais e com
  a grade em pixel quebrado. Não
  era o conteúdo: o QR de 20 mm a 4,6 px/mm pedia 2,49 px por módulo, o
  navegador arredondava cada borda e a grade saía com módulos de 2 e 3 px
  alternando, inclusive na linha de timing (a régua do leitor). Agora o módulo
  cai em pixel cheio (arredondado para baixo, para não comer o silêncio), a
  prévia desenha a 8 px/mm, e **ao lado dela há um QR de conferência ampliado**
  — porque um QR de 20 mm numa tela não é para ser lido por câmera. Defeito de
  tela: no papel quem desenha é a impressora.
- 17/09/2026 (fase 2) — **o limite de caracteres deixou de ser a regra.** Ele
  é 16 (medido), como cerca grossa do campo; quem decide se cabe é a medida da
  largura real das letras, e ela olha as duas linhas juntas. O texto encolhe
  até 3,6 mm de altura de maiúscula e, abaixo disso, é recusado.
- 17/09/2026 (fase 1) — os quatro campos moram em `config`
  (`kit_etq_linha1`, `kit_etq_linha2`, `kit_etq_qr_legenda`, `kit_etq_link`),
  quatro linhas ao lado do `kit_codigo`, em vez de um JSON só: campo dentro de
  JSON não se acha com grep nem se lê com sqlite3.
- 17/09/2026 (fase 1) — a permissão de EDITAR não é nova: `kit.editar`
  (Configuração, nível admin) já existia e já cobria o Código do kit. A rota
  nova entrou nela por `pre('/api/config/kit')`. A permissão de IMPRIMIR
  (Supervisor ou acima) é da fase 3 e aí sim é chave nova — vai precisar das
  três pontas do §19 (chave, `permDaRota`, backfill de quem já devia tê-la).
- 17/09/2026 (fase 1) — o limite das linhas 1 e 2 entrou PROVISÓRIO em 20
  caracteres, como a §7 manda medir pela prévia na fase 2. A legenda do QR é
  10, que é valor da spec.
- 17/09/2026 (fase 1) — R8 é guarda de SERVIDOR, não `confirm()` de tela: sem
  `confirmar` a rota devolve 409 e **nada** é gravado. A tela só mostra a
  pergunta que o servidor fez.
- **A REVER na fase 3:** a §6 manda reaproveitar o caminho de impressão Zebra
  que o sistema já usa. Ele **não existe**: a etiqueta de SKU é impressa pelo
  navegador (`public/index.html`, janela nova com `@page 100mm 35mm` e
  JsBarcode vindo de **CDN**), sem uma linha de ZPL. Na fase 3 "reaproveitar"
  significa construir o envio ZPL do zero — e a biblioteca local da fase 2
  contraria o que a etiqueta de SKU faz hoje.
```

---

## 1. Problema

A etiqueta do kit de instalação (100×35 mm, Zebra ZD220) hoje é montada em três lugares:

| Parte | Onde é feita hoje |
|---|---|
| Código de barras | sistema (controle interno) |
| Texto "SEU MANUAL ESTÁ AQUI" + seta | digitado à mão no programa da Zebra |
| QR do manual | gerado no Chrome e colado |

Isso dá retrabalho e existe o risco de o código impresso ficar diferente do **Código do kit** que a Embalagem confere no bipe.

## 2. Objetivo

Montar e imprimir a etiqueta inteira dentro do sistema, na tela do kit, sem usar o programa da Zebra nem o Chrome.

## 3. Como funciona na fábrica

1. O **Admin** abre a tela do kit, confere o Código do kit, escreve o texto e cola o link da pasta do Google Drive onde fica o manual. Depois salva.
2. A tela mostra a **prévia em tamanho real**. O Admin aponta o celular para o QR da prévia e confere se abre a pasta.
3. Um **Supervisor** (ou nível acima) imprime **1 etiqueta de teste**, confere e depois imprime o **lote** (ex.: 200).
4. O rolo fica estocado na bancada. Na embalagem, o operador cola a etiqueta no kit e bipa, como já é feito hoje.
5. Para trocar o manual, basta trocar o arquivo dentro da pasta do Drive. O link não muda e não é preciso reimprimir.

## 4. Regras de negócio

**R1. Uma etiqueta só.** Existe um único modelo: o do kit de instalação.

**R2. O código de barras vem do Código do kit salvo.** Ele nunca é digitado em outro campo. O que a Embalagem bipa é sempre o que está impresso.

**R3. Desenho fixo, igual à etiqueta atual:**
- à esquerda, o texto grande em até 2 linhas com a seta em círculo;
- embaixo do texto, o código de barras (Code 128) com o código escrito por extenso;
- à direita, o QR com a legenda pequena ("MANUAL").

**R4. Campos editáveis (só Admin ou nível acima):**

| Campo | Padrão | Limite |
|---|---|---|
| Linha 1 | `SEU MANUAL ESTÁ` | caber na etiqueta (valor exato definido na Fase 2 pela prévia) |
| Linha 2 | `AQUI` | idem |
| Legenda do QR | `MANUAL` | 10 caracteres |
| Link do manual | vazio | obrigatório para imprimir; precisa começar com `https://` |

- Acentos precisam sair impressos (ex.: "ESTÁ").
- Se o link não for do `drive.google.com`, o sistema **avisa** mas deixa salvar.
- Perto do campo do link aparece o lembrete: *"A pasta precisa estar compartilhada como 'qualquer pessoa com o link pode ver'."*

**R5. O QR é gerado pelo sistema.** É um QR comum, sem logo, com o conteúdo exatamente igual ao link salvo. A impressora desenha o QR (ZPL nativo), sem imagem colada.

**R6. A prévia é fiel.** O QR da prévia contém o mesmo link que vai para a impressora, então testar com o celular na tela vale para a etiqueta impressa.

**R7. Impressão:**
- **Supervisor ou nível acima.**
- Botão **"Imprimir 1 de teste"**.
- Botão **"Imprimir lote"** com quantidade de 1 a 500. O lote sai em um único envio para a ZD220.
- A impressão fica **bloqueada**, com mensagem clara, se faltar o Código do kit ou o link.

**R8. Aviso ao trocar o Código do kit.** Se já havia um código salvo e alguém salva outro, o sistema pede confirmação com a mensagem:
> *"As etiquetas já impressas com o código ANTIGO vão parar de funcionar na Embalagem. Confirmar troca para NOVO?"*

Sem confirmação, nada é salvo.

**R9. Registro.** Troca de código, edição da etiqueta e impressão (quem, quando, quantidade) vão para o log de ações. Não existe tela de contagem de etiquetas (ver §5).

**R10. A Embalagem não muda.** Ela continua só conferindo o bipe contra o Código do kit.

**R11. A parte "Etiqueta do kit (arquivo pronto)" sai.** O upload de PDF/PNG/JPG/SVG é removido. O gerador é a única forma de fazer a etiqueta.

## 5. Fica de fora

- Mais de um modelo de etiqueta ou etiqueta por produto/SKU.
- Logo ou desenho dentro do QR.
- Editor livre de desenho (mover, redimensionar, trocar fonte).
- Contagem e controle de estoque de etiquetas impressas.
- Qualquer mudança na tela da Embalagem.
- Link próprio do sistema com redirecionamento (desnecessário: o link da pasta do Drive não muda).

## 6. Dados técnicos de referência

- Etiqueta 100×35 mm na ZD220 (203 dpi = 8 pontos/mm), ou seja, área de ~800×280 pontos.
- ZPL:
  - `^CI28` para UTF-8 (acentos);
  - `^BC` para Code 128 com linha legível;
  - `^BQN,2,…` com `^FDMA,<link>` para QR modelo 2, correção M.
- Seta em círculo: comandos gráficos ZPL ou pequena imagem fixa embutida (`^GFA`). A escolha fica no PLANO.
- Reaproveitar o caminho de impressão Zebra que o sistema já usa e respeitar o **modo teste** do mesmo jeito que ele respeita hoje.
- Prévia no navegador com bibliotecas **locais** (sem CDN), no mesmo tamanho proporcional da etiqueta.
- Permissões **"editar etiqueta do kit"** e **"imprimir etiqueta do kit"** entram no mecanismo de acesso vigente (registro em `permissoes.js`, se já estiver em uso). O Claude Code confirma no PLANO da Fase 1.

## 7. Fases

Cada fase é entregue e testada sozinha. O upload atual só sai na última fase, para a fábrica nunca ficar sem forma de fazer a etiqueta.

### Fase 1: conteúdo da etiqueta 🔴
- Campos Linha 1, Linha 2, Legenda do QR e Link do manual, salvos no banco junto ao kit, com os padrões de R4.
- Validações de R4 (limite, `https://` obrigatório, aviso de link fora do Drive, lembrete de compartilhamento).
- Aviso e confirmação ao trocar o Código do kit (R8).
- Permissão de edição (Admin ou nível acima) e registro no log (R9).
- **Backup do banco antes do deploy.**
- **Pronto quando:** Admin salva os campos; Supervisor não consegue editar; trocar o código mostra o aviso e só salva com confirmação.

### Fase 2: prévia em tamanho real 🟡
- Prévia fiel ao desenho de R3: texto, seta, código de barras com o código escrito e QR com legenda.
- A prévia atualiza enquanto o Admin digita.
- Definir os limites de caracteres de Linha 1 e Linha 2 para o texto nunca sair da etiqueta.
- **Pronto quando:** o celular lê o QR da prévia e abre a pasta do Drive, e um leitor lê o código de barras da prévia com o Código do kit.

### Fase 3: impressão na ZD220 🔴
- Montar o ZPL com o mesmo conteúdo da prévia (R5, R6).
- Botões "Imprimir 1 de teste" e "Imprimir lote" (1 a 500), bloqueios de R7 e permissão de impressão (Supervisor ou nível acima).
- Registro da impressão no log (R9).
- **Teste na ZD220 real, fora do horário de produção.**
- **Pronto quando:**
  - a etiqueta impressa tem o mesmo desenho da atual, com acentos;
  - o celular abre a pasta pelo QR impresso;
  - a **Embalagem aceita o bipe** da etiqueta impressa;
  - um lote de 5 sai em um único envio.

### Fase 4: remover o upload de arquivo pronto 🔴
- Tirar da tela a parte "Etiqueta do kit (arquivo pronto)" e as rotas de envio, impressão e remoção de arquivo.
- Apagar arquivos antigos enviados, se existirem, **com backup antes**.
- Atualizar `CLAUDE.md` e a seção da etiqueta Zebra na documentação.
- **Pronto quando:** a tela do kit tem só o Código do kit e o gerador, e nada mais referencia o upload.

## 8. Decisões (para `docs/DECISOES.md`)

- 17/09/2026: a etiqueta do kit é gerada no sistema (texto, Code 128 e QR em ZPL); o programa da Zebra e o QR do Chrome deixam de ser usados.
- 17/09/2026: o código de barras da etiqueta vem sempre do Código do kit salvo, sem digitação separada.
- 17/09/2026: o QR aponta direto para a pasta do Google Drive do manual; troca de manual não exige reimpressão.
- 17/09/2026: trocar o Código do kit exige confirmação com aviso de que as etiquetas já impressas deixam de funcionar.
- 17/09/2026: Admin edita a etiqueta do kit; Supervisor ou nível acima imprime.
- 17/09/2026: o upload de etiqueta pronta (PDF/PNG/JPG/SVG) é removido.

# Gerador da etiqueta do kit

```
STATUS
Situação: em construção
Criada em: 17/09/2026
Última atualização: 17/09/2026
Fase atual: fases 1 e 2 entregues (conteúdo + prévia), com um conserto na 2
Fases: 1 ☑  2 ☑  3 ☐  4 ☐
Risco: 🔴 (etiqueta)
Mudanças no caminho:
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
- 17/09/2026 (CONSERTO da fase 2) — **o celular não lia o QR da prévia.** Não
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
